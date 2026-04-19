/* ===== DONNÉES DE BEATS (partagées avec script.js) ===== */
// La variable beats est définie dans script.js avec var pour être accessible ici
// Si script.js n'a pas défini beats, utiliser les données par défaut
if (typeof beats === 'undefined') {
    var beats = Array.isArray(window.defaultBeats) ? [...window.defaultBeats] : [];
}

async function ensureBeatsLoaded(targetBeatId = null) {
    const numericTargetBeatId = targetBeatId == null ? null : Number(targetBeatId);
    const hasTargetBeatLoaded = Array.isArray(window.beats)
        && window.beats.length
        && (numericTargetBeatId == null || window.beats.some((beat) => Number(beat.id) === numericTargetBeatId));

    if (hasTargetBeatLoaded) {
        beats = window.beats;
        return beats;
    }

    if (typeof window.loadBeatsData === 'function') {
        beats = await window.loadBeatsData();
        return beats;
    }

    try {
        const response = await fetch('data.json', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('Lecture data.json impossible');
        }

        const payload = await response.json();
        beats = Array.isArray(payload.beats) ? payload.beats : beats;
    } catch (error) {
        console.warn('Chargement des beats produit impossible, fallback utilise.', error);
    }

    return beats;
}

function resolveBeatId(rawBeatId) {
    const requestedBeatId = Number(rawBeatId);
    if (Number.isFinite(requestedBeatId) && beats.some((beat) => Number(beat.id) === requestedBeatId)) {
        return requestedBeatId;
    }

    const firstBeat = Array.isArray(beats) && beats.length ? beats[0] : null;
    return firstBeat ? Number(firstBeat.id) : null;
}

/* ===== CONFIGURATION LICENCES ===== */

const licenses = typeof window.getLicenseCatalog === 'function' ? window.getLicenseCatalog() : {
    wav: { key: 'wav', name: 'Location WAV', totalPrice: 30, priceSupplement: 30, priceLabel: '30,00 $', files: ['MP3', 'WAV'], conditions: 'Conditions de licence a venir pour Location WAV.' },
    'wav-stems': { key: 'wav-stems', name: 'Location de STEMS', totalPrice: 80, priceSupplement: 80, priceLabel: '80,00 $', files: ['MP3', 'WAV', 'Trackout'], conditions: 'Conditions de licence a venir pour Location de STEMS.' },
    'premium-stems': { key: 'premium-stems', name: 'Illimité', totalPrice: 120, priceSupplement: 120, priceLabel: '120,00 $', files: ['MP3', 'WAV', 'Trackout'], conditions: 'Conditions de licence a venir pour Illimité.' },
    exclusive: { key: 'exclusive', name: 'Exclusif', totalPrice: 220, priceSupplement: 220, priceLabel: '220,00 $', files: ['MP3', 'WAV', 'Trackout'], conditions: 'Conditions de licence a venir pour Exclusif.' }
};

const PRODUCT_INDEX_VERIFY_REDIRECT_KEY = 'openIndexVerifyFromProduct';
const PRODUCT_INDEX_CHECKOUT_REDIRECT_KEY = 'openIndexCheckoutFromProduct';

function getLicenseEntries() {
    return Object.values(licenses);
}

function formatLicenseFiles(files) {
    return Array.isArray(files) ? files.join(' , ') : '';
}

function getCurrentBeatCartItem() {
    loadCartFromStorage();
    return cart.find((item) => Number(item.beatId) === Number(currentBeatId)) || null;
}

function setActiveLicenseCard() {
    document.querySelectorAll('.license-btn').forEach((card) => {
        card.classList.toggle('active', card.dataset.license === selectedLicense);
    });
}

function renderProductLicenseButtons() {
    const container = document.getElementById('productLicenseButtons');
    if (!container) {
        return;
    }

    container.innerHTML = getLicenseEntries().map((license) => `
        <article class="license-btn${license.key === selectedLicense ? ' active' : ''}" data-license="${license.key}" role="button" tabindex="0" aria-label="Ajouter ${license.name} au panier">
            <div class="license-head">
                <span class="license-name">${license.name}</span>
                <span class="license-price">${license.priceLabel}</span>
            </div>
            <div class="license-desc">${formatLicenseFiles(license.files)}</div>
            <button class="license-contract-trigger" type="button" data-license-contract="${license.key}">Condition de contrat</button>
            <i class="fas fa-check-circle"></i>
        </article>
    `).join('');
}

/* ===== ÉTAT GLOBAL ===== */

let currentBeatId = null;
let selectedLicense = 'wav';
let cart = [];  // Sera chargé à l'initialisation
let currentBeatData = null;

// Fonction pour charger le panier depuis localStorage
function loadCartFromStorage() {
    cart = JSON.parse(localStorage.getItem('cart')) || [];
    return cart;
}

function isCurrentBeatInCart() {
    loadCartFromStorage();
    return cart.some(item => Number(item.beatId) === Number(currentBeatId));
}

function updateAddCartButtonState() {
    setActiveLicenseCard();
}

function setProductImagePlayState(isPlaying) {
    const playButton = document.getElementById('productImagePlay');
    if (!playButton) {
        return;
    }

    playButton.classList.toggle('is-playing', isPlaying);

    const icon = playButton.querySelector('i');
    if (icon) {
        icon.classList.toggle('fa-play', !isPlaying);
        icon.classList.toggle('fa-pause', isPlaying);
    }
}

function playCurrentBeat() {
    if (!currentBeatData || !currentBeatData.fichier) {
        return;
    }

    const audio = document.getElementById('audioPlayer');
    const trackSubtitle = [currentBeatData.producteur || 'STUDIO BELEC', currentBeatData.bpm ? `${currentBeatData.bpm} BPM` : currentBeatData.style || '']
        .filter(Boolean)
        .join(' • ');

    if (window.GlobalAudioPlayer && typeof window.GlobalAudioPlayer.playTrack === 'function') {
        window.GlobalAudioPlayer.playTrack({
            src: `sons/${currentBeatData.fichier}`,
            title: currentBeatData.nom,
            subtitle: trackSubtitle,
            cover: currentBeatData.cover ? `covers/${currentBeatData.cover}` : '',
            onStateChange: setProductImagePlayState
        });
        return;
    }

    if (!audio) {
        return;
    }

    audio.src = `sons/${currentBeatData.fichier}`;
    if (audio.paused) {
        audio.play().then(() => {
            setProductImagePlayState(true);
        }).catch(() => undefined);
        return;
    }

    audio.pause();
    setProductImagePlayState(false);
}

/* ===== INITIALISATION ===== */

document.addEventListener('DOMContentLoaded', async function() {
    // Charger le panier depuis localStorage
    loadCartFromStorage();
    
    // Obtenir l'ID du beat depuis l'URL
    const params = new URLSearchParams(window.location.search);
    currentBeatId = params.get('id');

    await ensureBeatsLoaded(currentBeatId);
    currentBeatId = resolveBeatId(currentBeatId);

    if (currentBeatId == null) {
        console.error('Aucun beat disponible');
        return;
    }

    if (String(params.get('id') || '') !== String(currentBeatId)) {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('id', String(currentBeatId));
        window.history.replaceState({}, '', nextUrl.toString());
    }
    
    // Charger le beat et les infos
    loadBeat(currentBeatId);
    
    // Configurer les écouteurs d'événements
    setupEventListeners();
    
    // Mettre à jour le badge du panier
    updateCartBadge();

    if (window.cartSyncReady && typeof window.cartSyncReady.then === 'function') {
        window.cartSyncReady.then(() => {
            loadCartFromStorage();
            updateCartBadge();
            updateCartDisplay();
            updateAddCartButtonState();
        }).catch(() => undefined);
    }
});

/* ===== CHARGEMENT DU BEAT ===== */

function loadBeat(beatId) {
    const beat = beats.find(b => Number(b.id) === Number(beatId)) || beats[0];
    
    if (!beat) {
        console.error('Beat non trouvé');
        return;
    }

    currentBeatData = beat;
    
    // Informations du producteur
    document.querySelector('.producer-name').textContent = beat.producteur;
    document.querySelector('.product-title').textContent = beat.nom;
    
    // Image
    const img = document.querySelector('.product-image');
    img.src = `covers/${beat.cover}`;
    img.alt = beat.nom;

    const productDetail = document.querySelector('.product-detail');
    if (productDetail) {
        productDetail.style.setProperty('--product-cover-bg', `url("covers/${beat.cover}")`);
    }
    
    // Stats (le sélecteur doit cibler les bons éléments)
    const statValues = document.querySelectorAll('.stat-value');
    if (statValues.length >= 2) {
        statValues[0].textContent = beat.bpm;
        statValues[1].textContent = beat.style;
    }

    const cartItem = getCurrentBeatCartItem();
    if (cartItem && licenses[cartItem.licenseKey]) {
        selectedLicense = cartItem.licenseKey;
    }
    
    // Initialiser le prix avec la licence PAR DÉFAUT
    renderProductLicenseButtons();
    updatePrice();
    updateAddCartButtonState();
}

/* ===== GESTION DES LICENCES ===== */

function setupEventListeners() {
    const verifyReadyModal = document.getElementById('verify-ready-modal');
    const closeVerifyReadyModal = document.getElementById('closeVerifyReadyModal');
    const verifyReadyCheckoutBtn = document.getElementById('verifyReadyCheckoutBtn');
    const verifyReadyTotal = document.getElementById('verifyReadyTotal');
    const productContractModal = document.getElementById('product-contract-modal');
    const closeProductContractModal = document.getElementById('closeProductContractModal');
    const productContractTitle = document.getElementById('productContractTitle');
    const productContractContent = document.getElementById('productContractContent');
    const productImagePlay = document.getElementById('productImagePlay');
    const fallbackAudio = document.getElementById('audioPlayer');

    const closeVerifyReadyCard = function() {
        if (verifyReadyModal) {
            verifyReadyModal.style.display = 'none';
        }
    };

    const openVerifyReadyCard = function() {
        if (!verifyReadyModal) {
            return;
        }

        const total = cart.reduce((sum, item) => sum + (Number(item.totalPrice) * Number(item.quantity || 1)), 0);
        if (verifyReadyTotal) {
            verifyReadyTotal.textContent = `${total.toFixed(2)}€`;
        }

        verifyReadyModal.style.display = 'flex';
    };

    const openProductContractModal = function(licenseKey) {
        const license = licenses[licenseKey];
        if (!license || !productContractModal || !productContractTitle || !productContractContent) {
            return;
        }

        productContractTitle.textContent = `Condition de contrat - ${license.name}`;
        productContractContent.textContent = license.conditions;
        productContractModal.style.display = 'flex';
    };

    const closeProductContractReader = function() {
        if (productContractModal) {
            productContractModal.style.display = 'none';
        }
    };

    if (productImagePlay) {
        productImagePlay.addEventListener('click', function() {
            playCurrentBeat();
        });
    }

    if (fallbackAudio) {
        fallbackAudio.addEventListener('pause', function() {
            setProductImagePlayState(false);
        });

        fallbackAudio.addEventListener('ended', function() {
            setProductImagePlayState(false);
        });
    }

    // Clic sur les licences
    document.querySelectorAll('.license-btn').forEach(btn => {
        btn.addEventListener('click', function(event) {
            if (event.target.closest('.license-contract-trigger')) {
                return;
            }

            selectedLicense = this.dataset.license;
            updatePrice();
            addToCart();
        });

        btn.addEventListener('keydown', function(event) {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }

            event.preventDefault();
            selectedLicense = this.dataset.license;
            updatePrice();
            addToCart();
        });
    });

    document.querySelectorAll('.license-contract-trigger').forEach((button) => {
        button.addEventListener('click', function(event) {
            event.stopPropagation();
            openProductContractModal(this.dataset.licenseContract);
        });
    });

    if (closeProductContractModal) {
        closeProductContractModal.addEventListener('click', closeProductContractReader);
    }
    
    // Bouton Fermer du modal checkout
    const closeCheckoutBtn = document.getElementById('closeCheckout');
    if (closeCheckoutBtn) {
        closeCheckoutBtn.addEventListener('click', function() {
            document.getElementById('checkout-modal').style.display = 'none';
        });
    }
    
    // Fermer le modal en cliquant dehors
    window.addEventListener('click', function(e) {
        const checkoutModal = document.getElementById('checkout-modal');
        const panierModal = document.getElementById('panier-modal');
        const licenseModal = document.getElementById('license-modal');
        const readyModal = document.getElementById('verify-ready-modal');
        const contractModal = document.getElementById('product-contract-modal');
        if (e.target === checkoutModal) {
            checkoutModal.style.display = 'none';
        }
        if (e.target === panierModal) {
            panierModal.style.display = 'none';
        }
        if (e.target === readyModal) {
            closeVerifyReadyCard();
        }
        if (e.target === contractModal) {
            closeProductContractReader();
        }
        if (e.target === licenseModal && typeof window.closeLicenseModal === 'function') {
            window.closeLicenseModal();
        }
    });

    if (closeVerifyReadyModal) {
        closeVerifyReadyModal.addEventListener('click', closeVerifyReadyCard);
    }

    if (verifyReadyCheckoutBtn) {
        verifyReadyCheckoutBtn.addEventListener('click', function() {
            sessionStorage.setItem(PRODUCT_INDEX_CHECKOUT_REDIRECT_KEY, 'true');
            window.location.href = 'index.html';
        });
    }
    
    // Gestion du panier
    const cartBtn = document.getElementById('cartBtn');
    if (cartBtn) {
        cartBtn.addEventListener('click', function() {
            updateCartDisplay();
            document.getElementById('panier-modal').style.display = 'flex';
        });
    }
    
    const closeCartBtn = document.getElementById('closeCart');
    if (closeCartBtn) {
        closeCartBtn.addEventListener('click', function() {
            document.getElementById('panier-modal').style.display = 'none';
        });
    }

    const continueShoppingBtn = document.getElementById('continueShoppingBtn');
    if (continueShoppingBtn) {
        continueShoppingBtn.addEventListener('click', function() {
            document.getElementById('panier-modal').style.display = 'none';
        });
    }
    
    // Bouton Commander du panier
    const btnCommander = document.getElementById('btn-commander');
    if (btnCommander) {
        btnCommander.addEventListener('click', function() {
            if (cart.length === 0) {
                showAlertMessage('Le panier est vide!', 'error');
                return;
            }

            sessionStorage.setItem(PRODUCT_INDEX_VERIFY_REDIRECT_KEY, 'true');
            window.location.href = 'index.html';
        });
    }
}

/* ===== MISE À JOUR DU PRIX ===== */

function updatePrice() {
    const license = licenses[selectedLicense];
    const totalPrice = license.totalPrice;
    
    // Mettre à jour le prix principal
    document.querySelector('.price').textContent = `${totalPrice}€`;

    setActiveLicenseCard();
}

/* ===== GESTION DU PANIER (pour synchronisation) ===== */

function addToCart() {
    const beat = beats.find(b => b.id == currentBeatId);
    const license = licenses[selectedLicense];
    
    if (!beat) {
        showAlertMessage('Beat non trouvé', 'error');
        return;
    }
    
    // Mettre a jour la licence si le beat existe deja dans le panier
    const existingItem = cart.find(item => Number(item.beatId) === Number(currentBeatId));
    
    if (existingItem) {
        existingItem.licenseKey = selectedLicense;
        existingItem.license = license;
        existingItem.totalPrice = license.totalPrice;
        localStorage.setItem('cart', JSON.stringify(cart));
        updateCartBadge();
        updateCartDisplay();
        updateAddCartButtonState();
        return;
    }

    const cartItem = {
        beatId: currentBeatId,
        beat: beat,
        licenseKey: selectedLicense,
        license: license,
        quantity: 1,
        totalPrice: license.totalPrice
    };
    cart.push(cartItem);
    
    // Sauvegarder dans localStorage
    localStorage.setItem('cart', JSON.stringify(cart));
    
    // Mettre à jour le badge
    updateCartBadge();
    updateAddCartButtonState();
    updateCartDisplay();
    document.getElementById('panier-modal').style.display = 'flex';
}

function updateCartBadge() {
    // Recharger le panier depuis localStorage
    loadCartFromStorage();
    
    const badge = document.querySelector('.cart-count');
    if (badge) {
        const totalItems = cart.length;
        badge.textContent = totalItems;
    }

    updateAddCartButtonState();
}

// Écouter les changements de localStorage d'autres onglets/pages
window.addEventListener('storage', function(e) {
    if (e.key === 'cart') {
        loadCartFromStorage();
        updateCartDisplay();
        updateAddCartButtonState();
    }
});

window.addEventListener('cart:updated', function() {
    loadCartFromStorage();
    updateCartBadge();
    updateCartDisplay();
    updateAddCartButtonState();
});

function updateCartDisplay() {
    // Rechracer le panier depuis localStorage pour assurer la synchronisation
    loadCartFromStorage();
    
    const itemsContainer = document.getElementById('panier-items');
    const totalElement = document.getElementById('total');
    
    if (!itemsContainer || !totalElement) return;
    
    if (cart.length === 0) {
        itemsContainer.innerHTML = `
            <div class="panier-empty-state">
                <p class="panier-vide-title">Chariot vide</p>
                <p class="panier-vide-copy">Ajoute une licence pour voir tes beats ici.</p>
            </div>
        `;
        totalElement.textContent = '0';
        updateAddCartButtonState();
        return;
    }
    
    itemsContainer.innerHTML = '';
    let total = 0;
    
    cart.forEach((item, index) => {
        const itemTotal = item.totalPrice * item.quantity;
        total += itemTotal;
        const coverUrl = item.beat && item.beat.cover ? `covers/${item.beat.cover}` : '';
        const beatMeta = [item.beat?.bpm ? `${item.beat.bpm} BPM` : '', item.beat?.style || '']
            .filter(Boolean)
            .join(' • ');
        
        const div = document.createElement('div');
        div.className = 'panier-item';
        div.innerHTML = `
            <div class="panier-item-main">
                <div class="panier-thumb${coverUrl ? '' : ' is-fallback'}">
                    ${coverUrl ? `<img class="panier-thumb-image" src="${coverUrl}" alt="Pochette de ${item.beat.nom}" onerror="this.parentElement.classList.add('is-fallback'); this.remove();">` : ''}
                    <span class="panier-thumb-fallback">${(item.beat.nom || 'B').charAt(0).toUpperCase()}</span>
                </div>
                <div class="item-details">
                    <div class="item-name">${item.beat.nom}</div>
                    <div class="item-meta">${beatMeta}</div>
                    <div class="item-license">${item.license.name}</div>
                    <div class="item-license-select">
                        <label>Licence:</label>
                        <select onchange="changeCartLicense(${index}, this.value)">
                            ${getLicenseEntries().map((license) => `<option value="${license.key}" ${item.licenseKey === license.key ? 'selected' : ''}>${license.name} (${license.priceLabel})</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
            <div class="item-actions">
                <span class="item-prix">${itemTotal.toFixed(2)}€</span>
                <button class="btn-remove" onclick="removeFromCart(${index})">✕</button>
            </div>
        `;
        itemsContainer.appendChild(div);
    });
    
    totalElement.textContent = total.toFixed(2);
    updateAddCartButtonState();
}

function changeCartQuantity(index, quantity) {
    quantity = parseInt(quantity);
    if (quantity <= 0) {
        removeFromCart(index);
    } else {
        cart[index].quantity = quantity;
        localStorage.setItem('cart', JSON.stringify(cart));
        updateCartDisplay();
        updateCartBadge();
    }
}

function changeCartLicense(index, licenseKey) {
    const newLicense = licenses[licenseKey];
    if (newLicense) {
        cart[index].licenseKey = licenseKey;
        cart[index].license = newLicense;
        cart[index].totalPrice = newLicense.totalPrice;
        localStorage.setItem('cart', JSON.stringify(cart));
        updateCartDisplay();
    }
}

function removeFromCart(index) {
    cart.splice(index, 1);
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartDisplay();
    updateCartBadge();
}
/* ===== INITIALISATION DU CHECKOUT ===== */

function initializeCheckoutFromCart() {
    const modal = document.getElementById('checkout-modal');
    if (modal) {
        modal.style.display = 'flex';
        // Réinitialiser à l'étape 1
        if (window.showStep) {
            window.showStep(1);
        }
        // Passer le panier au checkout
        if (window.setCheckoutCart) {
            window.setCheckoutCart(cart);
        }
    }
}
/* ===== AFFICHAGE DES MESSAGES D'ALERTE ===== */

function showAlertMessage(message, type = 'info') {
    if (typeof window.afficherMessage === 'function') {
        window.afficherMessage(message, type);
        return;
    }
}
