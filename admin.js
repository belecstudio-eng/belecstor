const uploadForm = document.getElementById('uploadForm');
const uploadMessage = document.getElementById('uploadMessage');
const beatsList = document.getElementById('beatsList');
const coversList = document.getElementById('coversList');
const audiosList = document.getElementById('audiosList');
const refreshBeatsBtn = document.getElementById('refreshBeatsBtn');
const refreshMediaBtn = document.getElementById('refreshMediaBtn');
const brandingForm = document.getElementById('brandingForm');
const siteLogoInput = document.getElementById('siteLogo');
const brandingPreview = document.getElementById('brandingPreview');
const logoDraftPreview = document.getElementById('logoDraftPreview');
const openLogoCropBtn = document.getElementById('openLogoCropBtn');
const submitLogoBtn = document.getElementById('submitLogoBtn');
const deleteLogoBtn = document.getElementById('deleteLogoBtn');
const openOrdersPageBtn = document.getElementById('openOrdersPageBtn');
const brandingCropModal = document.getElementById('brandingCropModal');
const brandingCropViewport = document.getElementById('brandingCropViewport');
const brandingCropImage = document.getElementById('brandingCropImage');
const brandingCropZoom = document.getElementById('brandingCropZoom');
const brandingCropResetBtn = document.getElementById('brandingCropResetBtn');
const brandingCropApplyBtn = document.getElementById('brandingCropApplyBtn');

const logoCropState = {
    viewportSize: 0,
    sourceFile: null,
    sourceUrl: '',
    image: null,
    zoom: 1,
    minZoom: 1,
    maxZoom: 4,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    pointerId: null,
    dragStartX: 0,
    dragStartY: 0,
    dragOriginX: 0,
    dragOriginY: 0,
    croppedFile: null,
    croppedUrl: ''
};

const adminBaseUrl = (() => {
    const currentUrl = new URL(window.location.href);
    const hasEmbeddedCredentials = Boolean(currentUrl.username || currentUrl.password);

    currentUrl.username = '';
    currentUrl.password = '';

    if (hasEmbeddedCredentials && window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState({}, document.title, `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    }

    return currentUrl.origin;
})();

function resolveAdminUrl(path) {
    return new URL(path, `${adminBaseUrl}/`).toString();
}

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
    const response = await fetch(resolveAdminUrl(url), options);
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

function revokeObjectUrl(url) {
    if (url) {
        URL.revokeObjectURL(url);
    }
}

function getCropViewportSize() {
    if (!brandingCropViewport) {
        return 0;
    }

    return brandingCropViewport.clientWidth || 320;
}

function clampCropOffsets() {
    if (!logoCropState.image) {
        return;
    }

    const viewportSize = logoCropState.viewportSize || getCropViewportSize();
    const renderedWidth = logoCropState.image.naturalWidth * logoCropState.minZoom * logoCropState.zoom;
    const renderedHeight = logoCropState.image.naturalHeight * logoCropState.minZoom * logoCropState.zoom;
    const maxOffsetX = Math.max(0, (renderedWidth - viewportSize) / 2);
    const maxOffsetY = Math.max(0, (renderedHeight - viewportSize) / 2);

    logoCropState.offsetX = Math.min(maxOffsetX, Math.max(-maxOffsetX, logoCropState.offsetX));
    logoCropState.offsetY = Math.min(maxOffsetY, Math.max(-maxOffsetY, logoCropState.offsetY));
}

function updateCropImageTransform() {
    if (!brandingCropImage || !logoCropState.image) {
        return;
    }

    clampCropOffsets();

    const scale = logoCropState.minZoom * logoCropState.zoom;
    brandingCropImage.style.transform = `translate(calc(-50% + ${logoCropState.offsetX}px), calc(-50% + ${logoCropState.offsetY}px)) scale(${scale})`;
}

function resetCropFrame() {
    if (!logoCropState.image) {
        return;
    }

    const viewportSize = getCropViewportSize();
    logoCropState.viewportSize = viewportSize;
    logoCropState.minZoom = Math.max(
        viewportSize / logoCropState.image.naturalWidth,
        viewportSize / logoCropState.image.naturalHeight
    );
    logoCropState.zoom = 1;
    logoCropState.offsetX = 0;
    logoCropState.offsetY = 0;

    if (brandingCropZoom) {
        brandingCropZoom.value = '1';
    }

    updateCropImageTransform();
}

function renderLogoDraftPreview() {
    if (!logoDraftPreview) {
        return;
    }

    if (!logoCropState.croppedUrl || !logoCropState.croppedFile) {
        logoDraftPreview.className = 'branding-draft-preview empty-state';
        logoDraftPreview.textContent = 'Selectionnez une image pour preparer le cadrage du logo.';
        return;
    }

    logoDraftPreview.className = 'branding-draft-preview';
    logoDraftPreview.innerHTML = `
        <img class="branding-draft-preview-image" src="${logoCropState.croppedUrl}" alt="Apercu du logo recadre">
        <div class="media-hint">Pret a envoyer: ${escapeHtml(logoCropState.croppedFile.name)}</div>
    `;
}

function syncBrandingActionState() {
    if (openLogoCropBtn) {
        openLogoCropBtn.disabled = !logoCropState.sourceFile;
    }

    if (submitLogoBtn) {
        submitLogoBtn.disabled = !logoCropState.croppedFile;
    }
}

function closeBrandingCropModal() {
    if (!brandingCropModal) {
        return;
    }

    brandingCropModal.hidden = true;
    document.body.classList.remove('branding-crop-open');
    logoCropState.dragging = false;
    logoCropState.pointerId = null;
    brandingCropViewport?.classList.remove('is-dragging');

    if (brandingCropImage) {
        brandingCropImage.removeAttribute('src');
    }

    revokeObjectUrl(logoCropState.sourceUrl);
    logoCropState.sourceUrl = '';
    logoCropState.sourceFile = null;
    logoCropState.image = null;
}

function openBrandingCropModal(file) {
    if (!brandingCropModal || !brandingCropImage || !brandingCropZoom || !file) {
        return;
    }

    const sourceUrl = URL.createObjectURL(file);
    const previewImage = new Image();

    previewImage.onload = () => {
        revokeObjectUrl(logoCropState.sourceUrl);
        logoCropState.sourceUrl = sourceUrl;
        logoCropState.sourceFile = file;
        logoCropState.image = previewImage;
        brandingCropImage.src = sourceUrl;
        brandingCropModal.hidden = false;
        document.body.classList.add('branding-crop-open');
        resetCropFrame();
    };

    previewImage.onerror = () => {
        revokeObjectUrl(sourceUrl);
        showMessage('Impossible de charger cette image pour le recadrage.', 'error');
    };

    previewImage.src = sourceUrl;
}

async function buildCroppedLogoFile() {
    if (!logoCropState.image || !logoCropState.sourceFile) {
        throw new Error('Choisissez une image avant de recadrer le logo.');
    }

    const outputSize = 800;
    const viewportSize = logoCropState.viewportSize || getCropViewportSize();
    const scale = logoCropState.minZoom * logoCropState.zoom;
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;

    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Le navigateur ne permet pas de preparer ce cadrage.');
    }

    const multiplier = outputSize / viewportSize;
    const drawWidth = logoCropState.image.naturalWidth * scale * multiplier;
    const drawHeight = logoCropState.image.naturalHeight * scale * multiplier;
    const drawX = (outputSize / 2) - (drawWidth / 2) + (logoCropState.offsetX * multiplier);
    const drawY = (outputSize / 2) - (drawHeight / 2) + (logoCropState.offsetY * multiplier);

    context.clearRect(0, 0, outputSize, outputSize);
    context.save();
    context.beginPath();
    context.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    context.closePath();
    context.clip();
    context.drawImage(logoCropState.image, drawX, drawY, drawWidth, drawHeight);
    context.restore();

    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => {
            if (value) {
                resolve(value);
                return;
            }

            reject(new Error('Impossible de generer l image recadree.'));
        }, 'image/png');
    });

    const originalBaseName = logoCropState.sourceFile.name.replace(/\.[^.]+$/, '') || 'logo';
    return new File([blob], `${originalBaseName}-cropped.png`, { type: 'image/png' });
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
            window.location.href = resolveAdminUrl('admin-orders.html');
        }, 450);
    });
}

if (siteLogoInput) {
    siteLogoInput.addEventListener('change', () => {
        const [file] = Array.from(siteLogoInput.files || []);

        if (!file) {
            logoCropState.sourceFile = null;
            revokeObjectUrl(logoCropState.croppedUrl);
            logoCropState.croppedUrl = '';
            logoCropState.croppedFile = null;
            renderLogoDraftPreview();
            syncBrandingActionState();
            return;
        }

        logoCropState.sourceFile = file;
        revokeObjectUrl(logoCropState.croppedUrl);
        logoCropState.croppedUrl = '';
        logoCropState.croppedFile = null;
        renderLogoDraftPreview();
        syncBrandingActionState();
    });
}

if (openLogoCropBtn) {
    openLogoCropBtn.addEventListener('click', () => {
        if (!logoCropState.sourceFile) {
            showMessage('Choisissez d abord une image a recadrer.', 'error');
            return;
        }

        openBrandingCropModal(logoCropState.sourceFile);
    });
}

if (brandingCropZoom) {
    brandingCropZoom.addEventListener('input', () => {
        logoCropState.zoom = Number(brandingCropZoom.value) || 1;
        updateCropImageTransform();
    });
}

if (brandingCropResetBtn) {
    brandingCropResetBtn.addEventListener('click', () => {
        resetCropFrame();
    });
}

if (brandingCropViewport) {
    brandingCropViewport.addEventListener('pointerdown', (event) => {
        if (!logoCropState.image) {
            return;
        }

        logoCropState.dragging = true;
        logoCropState.pointerId = event.pointerId;
        logoCropState.dragStartX = event.clientX;
        logoCropState.dragStartY = event.clientY;
        logoCropState.dragOriginX = logoCropState.offsetX;
        logoCropState.dragOriginY = logoCropState.offsetY;
        brandingCropViewport.classList.add('is-dragging');
        brandingCropViewport.setPointerCapture(event.pointerId);
    });

    brandingCropViewport.addEventListener('pointermove', (event) => {
        if (!logoCropState.dragging || logoCropState.pointerId !== event.pointerId) {
            return;
        }

        logoCropState.offsetX = logoCropState.dragOriginX + (event.clientX - logoCropState.dragStartX);
        logoCropState.offsetY = logoCropState.dragOriginY + (event.clientY - logoCropState.dragStartY);
        updateCropImageTransform();
    });

    const stopDragging = (event) => {
        if (logoCropState.pointerId !== null && event.pointerId !== logoCropState.pointerId) {
            return;
        }

        logoCropState.dragging = false;
        logoCropState.pointerId = null;
        brandingCropViewport.classList.remove('is-dragging');
    };

    brandingCropViewport.addEventListener('pointerup', stopDragging);
    brandingCropViewport.addEventListener('pointercancel', stopDragging);
    brandingCropViewport.addEventListener('wheel', (event) => {
        if (!logoCropState.image || !brandingCropZoom) {
            return;
        }

        event.preventDefault();
        const currentZoom = Number(brandingCropZoom.value) || 1;
        const nextZoom = Math.min(logoCropState.maxZoom, Math.max(1, currentZoom + (event.deltaY < 0 ? 0.08 : -0.08)));
        brandingCropZoom.value = nextZoom.toFixed(2);
        logoCropState.zoom = nextZoom;
        updateCropImageTransform();
    }, { passive: false });
}

if (brandingCropApplyBtn) {
    brandingCropApplyBtn.addEventListener('click', async () => {
        brandingCropApplyBtn.disabled = true;

        try {
            const croppedFile = await buildCroppedLogoFile();
            revokeObjectUrl(logoCropState.croppedUrl);
            logoCropState.croppedFile = croppedFile;
            logoCropState.croppedUrl = URL.createObjectURL(croppedFile);
            renderLogoDraftPreview();
            closeBrandingCropModal();
            logoCropState.sourceFile = croppedFile;
            syncBrandingActionState();
            showMessage('Cadrage du logo pret. Vous pouvez maintenant envoyer le fichier.', 'success');
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            brandingCropApplyBtn.disabled = false;
        }
    });
}

document.querySelectorAll('[data-close-logo-crop]').forEach((button) => {
    button.addEventListener('click', () => {
        closeBrandingCropModal();
        if (siteLogoInput && !logoCropState.croppedFile) {
            siteLogoInput.value = '';
            logoCropState.sourceFile = null;
            syncBrandingActionState();
        }
    });
});

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && brandingCropModal && !brandingCropModal.hidden) {
        closeBrandingCropModal();
        if (siteLogoInput && !logoCropState.croppedFile) {
            siteLogoInput.value = '';
            logoCropState.sourceFile = null;
            syncBrandingActionState();
        }
    }
});

window.addEventListener('resize', () => {
    if (brandingCropModal && !brandingCropModal.hidden && logoCropState.image) {
        resetCropFrame();
    }
});

if (brandingForm) {
    brandingForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitButton = submitLogoBtn || brandingForm.querySelector('button[type="submit"]');

        if (!logoCropState.croppedFile) {
            showMessage('Selectionnez votre image puis validez son cadrage avant l envoi.', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('logo', logoCropState.croppedFile, logoCropState.croppedFile.name);

        submitButton.disabled = true;
        showMessage('Envoi du logo en cours...', 'success');

        try {
            const result = await fetchJson('/api/branding/logo', {
                method: 'PUT',
                body: formData
            });

            brandingForm.reset();
            revokeObjectUrl(logoCropState.croppedUrl);
            logoCropState.croppedFile = null;
            logoCropState.croppedUrl = '';
            logoCropState.sourceFile = null;
            renderLogoDraftPreview();
            syncBrandingActionState();
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

renderLogoDraftPreview();
syncBrandingActionState();

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
