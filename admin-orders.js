const ordersList = document.getElementById('ordersList');
const ordersMessage = document.getElementById('ordersMessage');
const refreshOrdersBtn = document.getElementById('refreshOrdersBtn');
const clearOrdersBtn = document.getElementById('clearOrdersBtn');

const adminOrdersBaseUrl = (() => {
    const currentUrl = new URL(window.location.href);
    const hasEmbeddedCredentials = Boolean(currentUrl.username || currentUrl.password);

    currentUrl.username = '';
    currentUrl.password = '';

    if (hasEmbeddedCredentials && window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState({}, document.title, `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    }

    return currentUrl.origin;
})();

function resolveAdminOrdersUrl(path) {
    return new URL(path, `${adminOrdersBaseUrl}/`).toString();
}

if (window.SiteTheme && typeof window.SiteTheme.initThemeControls === 'function') {
    window.SiteTheme.initThemeControls();
}

function showOrdersMessage(message, type = 'success') {
    if (!ordersMessage) {
        return;
    }

    ordersMessage.hidden = false;
    ordersMessage.textContent = message;
    ordersMessage.className = `admin-message ${type}`;
}

async function fetchJson(url, options = {}) {
    const response = await fetch(resolveAdminOrdersUrl(url), options);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(payload.error || 'Une erreur est survenue.');
    }

    return payload;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatOrderPrice(amount) {
    return `${Number(amount || 0).toFixed(2)} EUR`;
}

function formatOrderDate(value) {
    const timestamp = Date.parse(value || '');

    if (!Number.isFinite(timestamp)) {
        return 'Date inconnue';
    }

    return new Date(timestamp).toLocaleString('fr-FR');
}

function formatOrderPaymentMethod(method) {
    if (method === 'wave') {
        return 'Wave';
    }

    if (method === 'taptapsend') {
        return 'TapTapSend';
    }

    return String(method || 'Non renseigne');
}

function formatOrderStatus(status) {
    if (status === 'pending-payment') {
        return 'Paiement en attente';
    }

    return String(status || 'Inconnu');
}

function formatEmailStatus(notification) {
    const status = notification?.emailStatus;

    if (status === 'sent') {
        return 'Email envoye';
    }

    if (status === 'failed') {
        return 'Email en erreur';
    }

    if (status === 'not-configured') {
        return 'Email non configure';
    }

    return 'Email en attente';
}

function formatCustomerEmailStatus(entry) {
    const status = String(entry?.status || '').trim();

    if (status === 'scheduled') {
        return entry?.scheduledFor
            ? `Programme le ${formatOrderDate(entry.scheduledFor)}`
            : 'Programme';
    }

    if (status === 'sent') {
        return entry?.sentAt
            ? `Envoye le ${formatOrderDate(entry.sentAt)}`
            : 'Envoye';
    }

    if (status === 'failed') {
        return 'En erreur';
    }

    if (status === 'not-configured') {
        return 'SMTP non configure';
    }

    if (status === 'not-scheduled') {
        return 'Non planifie';
    }

    if (status === 'pending') {
        return 'En attente';
    }

    return 'Inconnu';
}

function attachOrderActions() {
    ordersList.querySelectorAll('[data-delete-order]').forEach((button) => {
        button.addEventListener('click', async () => {
            const orderId = button.getAttribute('data-delete-order');
            const confirmed = window.confirm('Supprimer cette commande client ?');
            if (!confirmed) {
                return;
            }

            button.disabled = true;
            try {
                const result = await fetchJson(`/api/orders/${encodeURIComponent(orderId)}`, { method: 'DELETE' });
                showOrdersMessage(result.message, 'success');
                await loadOrders();
            } catch (error) {
                showOrdersMessage(error.message, 'error');
                button.disabled = false;
            }
        });
    });

    ordersList.querySelectorAll('[data-send-deposit-number]').forEach((button) => {
        button.addEventListener('click', async () => {
            const orderId = button.getAttribute('data-send-deposit-number');
            button.disabled = true;

            try {
                const result = await fetchJson(`/api/orders/${encodeURIComponent(orderId)}/send-deposit-number`, {
                    method: 'POST'
                });
                showOrdersMessage(result.message, 'success');
                await loadOrders();
            } catch (error) {
                showOrdersMessage(error.message, 'error');
                button.disabled = false;
            }
        });
    });

    ordersList.querySelectorAll('[data-send-all]').forEach((button) => {
        button.addEventListener('click', async () => {
            const orderId = button.getAttribute('data-send-all');
            button.disabled = true;

            try {
                const result = await fetchJson(`/api/orders/${encodeURIComponent(orderId)}/send-all`, {
                    method: 'POST'
                });
                showOrdersMessage(result.message, 'success');
                await loadOrders();
            } catch (error) {
                showOrdersMessage(error.message, 'error');
                button.disabled = false;
            }
        });
    });

    ordersList.querySelectorAll('[data-send-payment-instructions]').forEach((button) => {
        button.addEventListener('click', async () => {
            const orderId = button.getAttribute('data-send-payment-instructions');
            button.disabled = true;

            try {
                const result = await fetchJson(`/api/orders/${encodeURIComponent(orderId)}/send-payment-instructions`, {
                    method: 'POST'
                });
                showOrdersMessage(result.message, 'success');
                await loadOrders();
            } catch (error) {
                showOrdersMessage(error.message, 'error');
                button.disabled = false;
            }
        });
    });

    ordersList.querySelectorAll('[data-send-contract]').forEach((button) => {
        button.addEventListener('click', async () => {
            const orderId = button.getAttribute('data-send-contract');
            button.disabled = true;

            try {
                const result = await fetchJson(`/api/orders/${encodeURIComponent(orderId)}/send-contract`, {
                    method: 'POST'
                });
                showOrdersMessage(result.message, 'success');
                await loadOrders();
            } catch (error) {
                showOrdersMessage(error.message, 'error');
                button.disabled = false;
            }
        });
    });
}

function renderOrders(orders) {
    if (!ordersList) {
        return;
    }

    if (!orders.length) {
        ordersList.className = 'admin-list empty-state';
        ordersList.textContent = 'Aucune commande client pour le moment.';
        return;
    }

    ordersList.className = 'admin-list';
    ordersList.innerHTML = orders.map((order) => {
        const items = Array.isArray(order.items) ? order.items : [];
        const customerEmails = order.customerEmails || {};
        const itemCount = Number(order.itemCount) || items.reduce((sum, item) => sum + Math.max(1, Number(item?.quantity) || 1), 0);
        const licenses = [...new Set(items.map((item) => String(item?.licenseName || '').trim()).filter(Boolean))].join(', ') || 'Non renseignees';
        const emailAddress = escapeHtml(order.email || '');
        const orderNotes = [
            order.notification?.emailError
                ? `<div class="order-note order-note-error">${escapeHtml(order.notification.emailError)}</div>`
                : '',
            customerEmails.depositNumber?.error
                ? `<div class="order-note order-note-error">Email numero client: ${escapeHtml(customerEmails.depositNumber.error)}</div>`
                : '',
            customerEmails.paymentInstructions?.error
                ? `<div class="order-note order-note-error">Email instructions client: ${escapeHtml(customerEmails.paymentInstructions.error)}</div>`
                : '',
            customerEmails.contract?.error
                ? `<div class="order-note order-note-error">Email contrat client: ${escapeHtml(customerEmails.contract.error)}</div>`
                : ''
        ].filter(Boolean).join('');
        const itemsHtml = items.map((item) => {
            const quantity = Math.max(1, Number(item?.quantity) || 1);
            const deliveryFiles = Array.isArray(item?.deliveryFiles) ? item.deliveryFiles.filter(Boolean).join(', ') : '';
            const contractHtml = item?.deliveryContract
                ? `
                    <details class="order-contract">
                        <summary>Contrat a delivrer</summary>
                        <pre>${escapeHtml(item.deliveryContract)}</pre>
                    </details>
                `
                : '';

            return `
                <div class="order-item-row">
                    <div class="order-item-head">
                        <strong>${escapeHtml(item?.beatName || 'Beat non renseigne')}</strong>
                        <span>${quantity} x ${formatOrderPrice(item?.unitPrice)}</span>
                    </div>
                    <div class="order-item-meta">
                        <span>Licence: ${escapeHtml(item?.licenseName || 'Non renseignee')}</span>
                        <span>Livraison: ${escapeHtml(deliveryFiles || 'Non renseignee')}</span>
                    </div>
                    ${contractHtml}
                </div>
            `;
        }).join('');

        return `
            <article class="order-card">
                <div class="order-card-top">
                    <div>
                        <div class="beat-admin-title">${escapeHtml(order.fullName || 'Client non renseigne')}</div>
                        <div class="order-meta-grid">
                            <span><strong>Email:</strong> <a href="mailto:${emailAddress}">${emailAddress}</a></span>
                            <span><strong>Date:</strong> ${escapeHtml(formatOrderDate(order.createdAt))}</span>
                            <span><strong>Produits:</strong> ${itemCount}</span>
                            <span><strong>Montant total:</strong> ${formatOrderPrice(order.totalPrice)}</span>
                            <span><strong>Paiement:</strong> ${escapeHtml(formatOrderPaymentMethod(order.paymentMethod))}</span>
                            <span><strong>Statut:</strong> ${escapeHtml(formatOrderStatus(order.status))}</span>
                            <span><strong>Licences:</strong> ${escapeHtml(licenses)}</span>
                            <span><strong>Admin email:</strong> ${escapeHtml(formatEmailStatus(order.notification))}</span>
                            <span><strong>Client numero:</strong> ${escapeHtml(formatCustomerEmailStatus(customerEmails.depositNumber))}</span>
                            <span><strong>Client consignes:</strong> ${escapeHtml(formatCustomerEmailStatus(customerEmails.paymentInstructions))}</span>
                            <span><strong>Contrat client:</strong> ${escapeHtml(formatCustomerEmailStatus(customerEmails.contract))}</span>
                        </div>
                    </div>
                    <div class="order-card-actions">
                        <span class="status-pill">Commande</span>
                        <button class="admin-secondary-btn" type="button" data-send-all="${escapeHtml(order.id)}">
                            <i class="fas fa-bolt"></i> Envoyer tout
                        </button>
                        <button class="admin-secondary-btn" type="button" data-send-deposit-number="${escapeHtml(order.id)}">
                            <i class="fas fa-hashtag"></i> Envoyer numero
                        </button>
                        <button class="admin-secondary-btn" type="button" data-send-payment-instructions="${escapeHtml(order.id)}">
                            <i class="fas fa-list-check"></i> Envoyer consignes
                        </button>
                        <button class="admin-secondary-btn" type="button" data-send-contract="${escapeHtml(order.id)}">
                            <i class="fas fa-paper-plane"></i> Envoyer contrat
                        </button>
                        <button class="admin-danger-btn" type="button" data-delete-order="${escapeHtml(order.id)}">
                            <i class="fas fa-trash"></i> Supprimer
                        </button>
                    </div>
                </div>
                <div class="order-items-block">
                    ${itemsHtml}
                </div>
                ${orderNotes}
            </article>
        `;
    }).join('');

    attachOrderActions();
}

async function loadOrders() {
    const payload = await fetchJson('/api/orders');
    renderOrders(payload.orders || []);
}

if (refreshOrdersBtn) {
    refreshOrdersBtn.addEventListener('click', async () => {
        refreshOrdersBtn.disabled = true;
        try {
            await loadOrders();
        } catch (error) {
            showOrdersMessage(error.message, 'error');
        } finally {
            refreshOrdersBtn.disabled = false;
        }
    });
}

if (clearOrdersBtn) {
    clearOrdersBtn.addEventListener('click', async () => {
        const confirmed = window.confirm('Supprimer toutes les commandes enregistrees ?');
        if (!confirmed) {
            return;
        }

        clearOrdersBtn.disabled = true;
        try {
            const result = await fetchJson('/api/orders', { method: 'DELETE' });
            showOrdersMessage(result.message, 'success');
            await loadOrders();
        } catch (error) {
            showOrdersMessage(error.message, 'error');
        } finally {
            clearOrdersBtn.disabled = false;
        }
    });
}

loadOrders().catch((error) => {
    showOrdersMessage(error.message, 'error');
    if (ordersList) {
        ordersList.className = 'admin-list empty-state';
        ordersList.textContent = 'Impossible de charger les commandes.';
    }
});