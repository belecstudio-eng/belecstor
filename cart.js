(function () {
    const CART_KEY = 'cart';
    const LEGACY_DEV_HOST = '127.0.0.1';
    const LEGACY_DEV_PORT = '5500';
    const CANONICAL_DEV_ORIGIN = 'http://localhost:3000';
    const STORAGE = window.localStorage;
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    let serverCartEnabled = false;
    let syncInProgress = false;
    let suppressRemoteSync = false;

    function isLegacyDevOrigin() {
        return window.location.protocol === 'http:'
            && window.location.hostname === LEGACY_DEV_HOST
            && window.location.port === LEGACY_DEV_PORT;
    }

    function redirectToCanonicalDevOrigin() {
        if (!isLegacyDevOrigin()) {
            return;
        }

        const targetPath = window.location.pathname === '/' ? '/index.html' : window.location.pathname;
        const targetUrl = `${CANONICAL_DEV_ORIGIN}${targetPath}${window.location.search}${window.location.hash}`;
        window.location.replace(targetUrl);
    }

    function parseCart(value) {
        try {
            const parsed = JSON.parse(value || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    function cartKeyFor(item) {
        return `${Number(item?.beatId) || 0}:${String(item?.licenseKey || 'wav')}`;
    }

    function mergeCartItems(primaryItems, secondaryItems) {
        const merged = new Map();

        [...primaryItems, ...secondaryItems].forEach((item) => {
            if (!item || !item.beatId || !item.beat) {
                return;
            }

            const key = cartKeyFor(item);
            if (!merged.has(key)) {
                merged.set(key, item);
            }
        });

        return Array.from(merged.values());
    }

    function readLocalCart() {
        return parseCart(STORAGE.getItem(CART_KEY));
    }

    function writeLocalCart(items) {
        suppressRemoteSync = true;
        originalSetItem.call(STORAGE, CART_KEY, JSON.stringify(items));
        suppressRemoteSync = false;
    }

    function notifyCartUpdate(items) {
        window.dispatchEvent(new CustomEvent('cart:updated', {
            detail: {
                cart: items
            }
        }));
    }

    async function fetchRemoteCart() {
        const response = await fetch('/api/cart', {
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Lecture du panier impossible.');
        }

        const payload = await response.json();
        return Array.isArray(payload.items) ? payload.items : [];
    }

    async function saveRemoteCart(items) {
        if (!serverCartEnabled) {
            return;
        }

        await fetch('/api/cart', {
            method: 'PUT',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({ items })
        });
    }

    async function syncCartFromServer() {
        if (syncInProgress) {
            return readLocalCart();
        }

        syncInProgress = true;

        try {
            const remoteItems = await fetchRemoteCart();
            serverCartEnabled = true;

            const localItems = readLocalCart();
            const mergedItems = mergeCartItems(remoteItems, localItems);
            const remoteSignature = JSON.stringify(remoteItems);
            const mergedSignature = JSON.stringify(mergedItems);

            if (mergedSignature !== JSON.stringify(localItems)) {
                writeLocalCart(mergedItems);
            }

            if (mergedSignature !== remoteSignature) {
                await saveRemoteCart(mergedItems);
            }

            notifyCartUpdate(mergedItems);
            return mergedItems;
        } catch (error) {
            serverCartEnabled = false;
            return readLocalCart();
        } finally {
            syncInProgress = false;
        }
    }

    Storage.prototype.setItem = function (key, value) {
        originalSetItem.call(this, key, value);

        if (this !== STORAGE || key !== CART_KEY || suppressRemoteSync) {
            return;
        }

        const items = parseCart(value);
        notifyCartUpdate(items);

        if (serverCartEnabled) {
            saveRemoteCart(items).catch(() => {
                serverCartEnabled = false;
            });
        }
    };

    Storage.prototype.removeItem = function (key) {
        originalRemoveItem.call(this, key);

        if (this !== STORAGE || key !== CART_KEY || suppressRemoteSync) {
            return;
        }

        notifyCartUpdate([]);

        if (serverCartEnabled) {
            saveRemoteCart([]).catch(() => {
                serverCartEnabled = false;
            });
        }
    };

    redirectToCanonicalDevOrigin();
    window.cartSyncReady = syncCartFromServer();
    window.syncCartFromServer = syncCartFromServer;

    window.addEventListener('focus', () => {
        syncCartFromServer().catch(() => undefined);
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            syncCartFromServer().catch(() => undefined);
        }
    });
})();