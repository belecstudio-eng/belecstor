const uploadForm = document.getElementById('uploadForm');
const uploadMessage = document.getElementById('uploadMessage');
const beatsList = document.getElementById('beatsList');
const coversList = document.getElementById('coversList');
const audiosList = document.getElementById('audiosList');
const refreshBeatsBtn = document.getElementById('refreshBeatsBtn');
const refreshMediaBtn = document.getElementById('refreshMediaBtn');
const brandingForm = document.getElementById('brandingForm');
const brandingPreview = document.getElementById('brandingPreview');
const deleteLogoBtn = document.getElementById('deleteLogoBtn');
const openOrdersPageBtn = document.getElementById('openOrdersPageBtn');

if (window.SiteTheme && typeof window.SiteTheme.initThemeControls === 'function') {
    window.SiteTheme.initThemeControls();
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return '0 Ko';
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} Ko`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

function showMessage(message, type = 'success') {
    uploadMessage.hidden = false;
    uploadMessage.textContent = message;
    uploadMessage.className = `admin-message ${type}`;
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
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

function renderBeats(beats) {
    if (!beats.length) {
        beatsList.className = 'admin-list empty-state';
        beatsList.textContent = 'Aucun beat televerse pour le moment.';
        return;
    }

    beatsList.className = 'admin-list';
    beatsList.innerHTML = beats.map((beat) => `
        <article class="beat-admin-item">
            <img class="beat-admin-cover" src="covers/${encodeURIComponent(beat.cover)}" alt="${beat.nom}">
            <div>
                <div class="beat-admin-title">${beat.nom}</div>
                <div class="beat-admin-meta">
                    <span>${Number(beat.prix).toFixed(2)} EUR</span>
                    <span>${beat.bpm} BPM</span>
                    <span>${beat.style}</span>
                    <span>${beat.producteur || 'STUDIO BELEC'}</span>
                </div>
                <div class="media-hint">Cover: ${beat.cover} | Son: ${beat.fichier}</div>
            </div>
            <div>
                <button class="admin-danger-btn" type="button" data-delete-beat="${beat.id}">
                    <i class="fas fa-trash"></i> Supprimer
                </button>
            </div>
        </article>
    `).join('');

    beatsList.querySelectorAll('[data-delete-beat]').forEach((button) => {
        button.addEventListener('click', async () => {
            const beatId = button.getAttribute('data-delete-beat');
            const confirmed = window.confirm('Supprimer ce beat et ses fichiers non utilises ?');
            if (!confirmed) {
                return;
            }

            button.disabled = true;
            try {
                const result = await fetchJson(`/api/beats/${beatId}`, { method: 'DELETE' });
                showMessage(result.message, 'success');
                await loadDashboard();
            } catch (error) {
                showMessage(error.message, 'error');
                button.disabled = false;
            }
        });
    });
}

function renderBranding(branding) {
    if (!brandingPreview || !deleteLogoBtn) {
        return;
    }

    if (!branding || !branding.logoUrl) {
        brandingPreview.className = 'branding-preview empty-state';
        brandingPreview.textContent = 'Aucun logo pour le moment.';
        deleteLogoBtn.disabled = true;
        return;
    }

    brandingPreview.className = 'branding-preview';
    brandingPreview.innerHTML = `
        <img class="branding-preview-image" src="${branding.logoUrl}" alt="Logo du site">
        <div class="media-hint">Fichier actif: ${branding.logo}</div>
    `;
    deleteLogoBtn.disabled = false;
}

function renderMediaList(container, items, type) {
    if (!items.length) {
        container.className = 'media-list empty-state';
        container.textContent = 'Aucun fichier.';
        return;
    }

    container.className = 'media-list';
    container.innerHTML = items.map((item) => {
        const preview = type === 'covers'
            ? `<img class="media-preview media-thumb" src="${item.url}" alt="${item.name}">`
            : `<audio class="media-preview media-audio" controls src="${item.url}"></audio>`;
        const usedLabel = item.usedBy.length
            ? `Utilise par beat(s): ${item.usedBy.join(', ')}`
            : 'Fichier libre';

        return `
            <article class="media-item">
                ${preview}
                <div>
                    <div class="beat-admin-title">${item.name}</div>
                    <div class="media-meta">${formatBytes(item.size)}</div>
                    <div class="media-hint">${usedLabel}</div>
                </div>
                <div class="media-actions">
                    <a class="admin-secondary-btn" href="${item.url}" target="_blank" rel="noreferrer">Ouvrir</a>
                    <button
                        class="admin-danger-btn"
                        type="button"
                        data-delete-media="${type}"
                        data-file-name="${item.name}"
                        ${item.usedBy.length ? 'disabled' : ''}
                    >
                        Supprimer
                    </button>
                </div>
            </article>
        `;
    }).join('');

    container.querySelectorAll('[data-delete-media]').forEach((button) => {
        button.addEventListener('click', async () => {
            const mediaType = button.getAttribute('data-delete-media');
            const fileName = button.getAttribute('data-file-name');
            const confirmed = window.confirm(`Supprimer le fichier ${fileName} ?`);
            if (!confirmed) {
                return;
            }

            button.disabled = true;
            try {
                const safeName = encodeURIComponent(fileName);
                const result = await fetchJson(`/api/media/${mediaType}/${safeName}`, { method: 'DELETE' });
                showMessage(result.message, 'success');
                await loadMedia();
            } catch (error) {
                showMessage(error.message, 'error');
                button.disabled = false;
            }
        });
    });
}

async function loadBeats() {
    const payload = await fetchJson('/api/beats');
    renderBeats(payload.beats || []);
}

async function loadMedia() {
    const payload = await fetchJson('/api/media');
    renderMediaList(coversList, payload.covers || [], 'covers');
    renderMediaList(audiosList, payload.audios || [], 'sons');
}

async function loadBranding() {
    const payload = await fetchJson('/api/branding');
    renderBranding(payload);
}

async function loadDashboard() {
    await Promise.all([loadBeats(), loadMedia(), loadBranding()]);
}

uploadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(uploadForm);
    const submitButton = uploadForm.querySelector('button[type="submit"]');

    submitButton.disabled = true;
    showMessage('Televersement en cours...', 'success');

    try {
        const result = await fetchJson('/api/beats', {
            method: 'POST',
            body: formData
        });

        uploadForm.reset();
        showMessage(result.message, 'success');
        await loadDashboard();
    } catch (error) {
        showMessage(error.message, 'error');
    } finally {
        submitButton.disabled = false;
    }
});

refreshBeatsBtn.addEventListener('click', loadBeats);
refreshMediaBtn.addEventListener('click', loadMedia);

if (openOrdersPageBtn) {
    openOrdersPageBtn.addEventListener('click', () => {
        const originalLabel = openOrdersPageBtn.dataset.originalLabel || openOrdersPageBtn.innerHTML;
        openOrdersPageBtn.dataset.originalLabel = originalLabel;
        openOrdersPageBtn.disabled = true;
        openOrdersPageBtn.classList.add('is-loading');
        openOrdersPageBtn.innerHTML = `<span class="button-spinner" aria-hidden="true"></span>${escapeHtml(openOrdersPageBtn.dataset.loadingLabel || 'Chargement...')}`;

        window.setTimeout(() => {
            window.location.href = 'admin-orders.html';
        }, 450);
    });
}

if (brandingForm) {
    brandingForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(brandingForm);
        const submitButton = brandingForm.querySelector('button[type="submit"]');

        submitButton.disabled = true;
        showMessage('Envoi du logo en cours...', 'success');

        try {
            const result = await fetchJson('/api/branding/logo', {
                method: 'PUT',
                body: formData
            });

            brandingForm.reset();
            renderBranding(result);
            if (window.SiteBranding && typeof window.SiteBranding.load === 'function') {
                window.SiteBranding.load().catch(() => undefined);
            }
            showMessage(result.message, 'success');
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            submitButton.disabled = false;
        }
    });
}

if (deleteLogoBtn) {
    deleteLogoBtn.addEventListener('click', async () => {
        const confirmed = window.confirm('Supprimer le logo actuel du site ?');
        if (!confirmed) {
            return;
        }

        deleteLogoBtn.disabled = true;
        try {
            const result = await fetchJson('/api/branding/logo', { method: 'DELETE' });
            renderBranding(null);
            if (window.SiteBranding && typeof window.SiteBranding.load === 'function') {
                window.SiteBranding.load().catch(() => undefined);
            }
            showMessage(result.message, 'success');
        } catch (error) {
            showMessage(error.message, 'error');
            deleteLogoBtn.disabled = false;
        }
    });
}

loadDashboard().catch((error) => {
    showMessage(error.message, 'error');
    beatsList.className = 'admin-list empty-state';
    beatsList.textContent = 'Impossible de charger les beats.';
    coversList.className = 'media-list empty-state';
    coversList.textContent = 'Impossible de charger les covers.';
    audiosList.className = 'media-list empty-state';
    audiosList.textContent = 'Impossible de charger les audios.';
});
