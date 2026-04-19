// Variables globales
const DEFAULT_BEATS = [];

var beats = [...DEFAULT_BEATS];

function normalizeBeat(beat) {
    return {
        id: Number(beat.id),
        nom: String(beat.nom || '').trim(),
        prix: Number(beat.prix) || 0,
        fichier: String(beat.fichier || '').trim(),
        cover: String(beat.cover || '').trim(),
        bpm: Number(beat.bpm) || 0,
        style: String(beat.style || '').trim(),
        producteur: String(beat.producteur || 'STUDIO BELEC').trim(),
        downloads: Number(beat.downloads || 0),
        duration: Number(beat.duration) || 0
    };
}

async function loadBeatsData() {
    try {
        const response = await fetch('data.json', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('Lecture data.json impossible');
        }

        const payload = await response.json();
        beats = Array.isArray(payload.beats) ? payload.beats.map(normalizeBeat) : [];
    } catch (error) {
        console.warn('Chargement des beats via data.json impossible, fallback local utilise.', error);
        beats = [...DEFAULT_BEATS];
    }

    beatsFiltres = [...beats];
    window.beats = beats;
    return beats;
}

window.defaultBeats = DEFAULT_BEATS;
window.loadBeatsData = loadBeatsData;
let panier = [];  // Sera chargé à l'initialisation

// Fonction pour charger le panier depuis localStorage
function loadCartFromStorage() {
    panier = JSON.parse(localStorage.getItem('cart')) || [];
    return panier;
}
let beatsFiltres = [...beats];
let searchTerm = '';
let filterBpm = 'all';
let filterStyle = 'all';
let sortBy = 'recent';
let currentView = localStorage.getItem('beatsViewMode') || 'list';
const licenseCatalog = typeof window.getLicenseCatalog === 'function' ? window.getLicenseCatalog() : {
    wav: { key: 'wav', name: 'Location WAV', totalPrice: 30, priceSupplement: 30, priceLabel: '30,00 $', files: ['MP3', 'WAV'], conditions: 'Conditions de licence a venir pour Location WAV.' },
    'wav-stems': { key: 'wav-stems', name: 'Location de STEMS', totalPrice: 80, priceSupplement: 80, priceLabel: '80,00 $', files: ['MP3', 'WAV', 'Trackout'], conditions: 'Conditions de licence a venir pour Location de STEMS.' },
    'premium-stems': { key: 'premium-stems', name: 'Illimite', totalPrice: 120, priceSupplement: 120, priceLabel: '120,00 $', files: ['MP3', 'WAV', 'Trackout'], conditions: 'Conditions de licence a venir pour Illimite.' },
    exclusive: { key: 'exclusive', name: 'Exclusif', totalPrice: 220, priceSupplement: 220, priceLabel: '220,00 $', files: ['MP3', 'WAV', 'Trackout'], conditions: 'Conditions de licence a venir pour Exclusif.' }
};
let activeLicenseBeatId = null;
let activeConditionsLicenseKey = null;
let currentPreviewTrigger = null;
const beatDurationCache = new Map();
const beatDurationRequests = new Map();

function getLicenseConfig(key) {
    return typeof window.getLicenseOption === 'function' ? window.getLicenseOption(key) : (licenseCatalog[key] || licenseCatalog.wav);
}

function getLicenseEntries() {
    return Object.values(licenseCatalog);
}

function formatLicenseFiles(files) {
    return Array.isArray(files) ? files.join(' , ') : '';
}

function renderCartLicenseOption(license, isActive, index) {
    return `
        <article
            class="item-license-option${isActive ? ' is-active' : ''}"
            role="button"
            tabindex="0"
            aria-label="Choisir ${license.name}"
            onclick="changerLicence(${index}, '${license.key}')"
            onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); changerLicence(${index}, '${license.key}'); }"
        >
            <div class="item-license-head">
                <span class="item-license-name">${license.name}</span>
                <strong class="item-license-price">${license.priceLabel}</strong>
            </div>
            <div class="item-license-desc">${formatLicenseFiles(license.files)}</div>
            <button
                class="item-license-contract-trigger"
                type="button"
                onclick="event.stopPropagation(); ouvrirConditionsLicencePanier(${index}, '${license.key}')"
            >Condition de contrat</button>
            <i class="fas fa-check-circle"></i>
        </article>
    `;
}

function formatBeatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return '--:--';
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remainingSeconds}`;
}

function getBeatDuration(beat) {
    if (!beat || !beat.fichier) {
        return Promise.resolve(null);
    }

    if (Number(beat.duration) > 0) {
        return Promise.resolve(Number(beat.duration));
    }

    if (beatDurationCache.has(beat.fichier)) {
        return Promise.resolve(beatDurationCache.get(beat.fichier));
    }

    if (beatDurationRequests.has(beat.fichier)) {
        return beatDurationRequests.get(beat.fichier);
    }

    const request = new Promise((resolve) => {
        const probe = new Audio();

        probe.preload = 'metadata';
        probe.src = `sons/${beat.fichier}`;

        const finish = (duration) => {
            beatDurationCache.set(beat.fichier, duration);
            beatDurationRequests.delete(beat.fichier);
            resolve(duration);
        };

        probe.addEventListener('loadedmetadata', () => {
            finish(Number(probe.duration) || 0);
        }, { once: true });

        probe.addEventListener('error', () => {
            finish(0);
        }, { once: true });
    });

    beatDurationRequests.set(beat.fichier, request);
    return request;
}

function buildBeatMetaMarkup(beat) {
    if (currentView === 'list') {
        return `
            <div class="produit-meta produit-meta-list">
                <span>
                    <strong>Duree</strong>
                    <em data-beat-duration="${beat.id}">${formatBeatDuration(beat.duration)}</em>
                </span>
                <span>
                    <strong>Tempo</strong>
                    <em>${beat.bpm} BPM</em>
                </span>
            </div>
        `;
    }

    return `
        <div class="produit-meta">
            <span><i class="fas fa-compact-disc"></i> ${beat.bpm} BPM</span>
            <span><i class="fas fa-tag"></i> ${beat.style}</span>
        </div>
    `;
}

function hydrateBeatDuration(beat, container) {
    if (!beat || !container || currentView !== 'list') {
        return;
    }

    const durationTarget = container.querySelector(`[data-beat-duration="${beat.id}"]`);
    if (!durationTarget) {
        return;
    }

    getBeatDuration(beat).then((duration) => {
        durationTarget.textContent = formatBeatDuration(duration);
    }).catch(() => undefined);
}

function resetPreviewTrigger(trigger) {
    if (!trigger) {
        return;
    }

    trigger.classList.remove('is-playing');

    const icon = trigger.querySelector('.produit-play-icon i');
    if (icon) {
        icon.classList.remove('fa-pause');
        icon.classList.add('fa-play');
    }
}

function setPreviewTriggerState(trigger, isPlaying) {
    if (!trigger) {
        return;
    }

    trigger.classList.toggle('is-playing', isPlaying);

    const icon = trigger.querySelector('.produit-play-icon i');
    if (icon) {
        icon.classList.toggle('fa-play', !isPlaying);
        icon.classList.toggle('fa-pause', isPlaying);
    }
}

function playBeatPreview(beat, trigger) {
    if (!beat || !trigger || !beat.fichier) {
        return;
    }

    if (!window.GlobalAudioPlayer || typeof window.GlobalAudioPlayer.playTrack !== 'function') {
        afficherMessage('Lecteur audio indisponible.', 'error');
        return;
    }

    const trackSubtitle = [beat.producteur || 'STUDIO BELEC', beat.bpm ? `${beat.bpm} BPM` : '']
        .filter(Boolean)
        .join(' • ');

    window.GlobalAudioPlayer.playTrack({
        src: `sons/${beat.fichier}`,
        title: beat.nom,
        subtitle: trackSubtitle,
        cover: beat.cover ? `covers/${beat.cover}` : '',
        onStateChange(isPlaying) {
            if (isPlaying && currentPreviewTrigger && currentPreviewTrigger !== trigger) {
                resetPreviewTrigger(currentPreviewTrigger);
            }

            setPreviewTriggerState(trigger, isPlaying);

            if (isPlaying) {
                currentPreviewTrigger = trigger;
                return;
            }

            if (currentPreviewTrigger === trigger) {
                currentPreviewTrigger = null;
            }
        }
    });
}

function isBeatInCart(beatId) {
    loadCartFromStorage();
    return panier.some(item => Number(item.beatId) === Number(beatId));
}

function updateAddToCartButtons() {
    document.querySelectorAll('.btn-price[data-beat-id]').forEach(button => {
        const beatId = Number(button.dataset.beatId);
        const alreadyAdded = isBeatInCart(beatId);

        button.disabled = alreadyAdded;
        button.classList.toggle('is-added', alreadyAdded);
        button.textContent = alreadyAdded ? 'Deja ajoute' : 'Acheter';
    });
}

function updateLicenseConditions(licenseKey) {
    const modalBody = document.querySelector('.license-modal-body');
    const panel = document.querySelector('.license-conditions-panel');
    const license = getLicenseConfig(licenseKey);
    const title = document.getElementById('licenseConditionsTitle');
    const content = document.getElementById('licenseConditionsContent');

    activeConditionsLicenseKey = license.key;

    if (modalBody) {
        modalBody.classList.add('is-reading-conditions');
    }

    if (panel) {
        panel.classList.remove('is-collapsed');
    }

    if (title) {
        title.textContent = license.name;
    }

    if (content) {
        content.textContent = license.conditions;
    }

    document.querySelectorAll('.license-choice-card').forEach((card) => {
        card.classList.toggle('is-focused', card.dataset.licenseKey === license.key);
    });

    document.querySelectorAll('.license-choice-conditions').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.licenseConditions === license.key);
    });
}

function resetLicenseConditionsPanel() {
    const modalBody = document.querySelector('.license-modal-body');
    const panel = document.querySelector('.license-conditions-panel');
    const title = document.getElementById('licenseConditionsTitle');
    const content = document.getElementById('licenseConditionsContent');

    activeConditionsLicenseKey = null;

    if (modalBody) {
        modalBody.classList.remove('is-reading-conditions');
    }

    if (panel) {
        panel.classList.add('is-collapsed');
    }

    if (title) {
        title.textContent = '';
    }

    if (content) {
        content.textContent = '';
    }

    document.querySelectorAll('.license-choice-card').forEach((card) => {
        card.classList.remove('is-focused');
    });

    document.querySelectorAll('.license-choice-conditions').forEach((button) => {
        button.classList.remove('is-active');
    });
}

function closeLicenseModal() {
    const licenseModal = document.getElementById('license-modal');
    if (!licenseModal) {
        return;
    }

    licenseModal.style.display = 'none';
    activeLicenseBeatId = null;
    resetLicenseConditionsPanel();
}

function ouvrirModalLicence(beatId) {
    const beat = beats.find((item) => Number(item.id) === Number(beatId));
    const licenseModal = document.getElementById('license-modal');
    const title = document.getElementById('licenseModalBeatName');
    const meta = document.getElementById('licenseModalBeatMeta');
    const cover = document.getElementById('licenseModalBeatCover');
    const grid = document.getElementById('licenseOptionsGrid');

    if (!beat || !licenseModal || !title || !meta || !grid || !cover) {
        return;
    }

    activeLicenseBeatId = beat.id;
    title.textContent = beat.nom;
    meta.textContent = `${beat.bpm} BPM`;
    cover.src = beat.cover ? `covers/${beat.cover}` : '';
    cover.alt = beat.nom ? `Pochette de ${beat.nom}` : 'Pochette du beat';

    grid.innerHTML = getLicenseEntries().map((license) => `
        <article class="license-choice-card" data-license-key="${license.key}" role="button" tabindex="0" aria-label="Ajouter ${license.name} au panier">
            <div class="license-choice-top">
                <span class="license-choice-name">${license.name}</span>
                <strong class="license-choice-price">${license.priceLabel}</strong>
            </div>
            <div class="license-choice-block">
                <span class="license-choice-label">Fichiers disponibles</span>
                <span class="license-choice-files">${formatLicenseFiles(license.files)}</span>
            </div>
            <button class="license-choice-conditions" type="button" data-license-conditions="${license.key}">Conditions de licence</button>
        </article>
    `).join('');

    grid.querySelectorAll('.license-choice-card').forEach((card) => {
        const handleAdd = () => {
            ajouterAuPanier(activeLicenseBeatId, card.dataset.licenseKey);
        };

        card.addEventListener('click', (event) => {
            if (event.target.closest('.license-choice-conditions')) {
                return;
            }

            handleAdd();
        });

        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleAdd();
            }
        });
    });

    grid.querySelectorAll('[data-license-conditions]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();

            if (activeConditionsLicenseKey === button.dataset.licenseConditions) {
                resetLicenseConditionsPanel();
                return;
            }

            updateLicenseConditions(button.dataset.licenseConditions);
        });
    });

    resetLicenseConditionsPanel();
    licenseModal.style.display = 'block';
}

function setupLicenseModal() {
    const licenseModal = document.getElementById('license-modal');
    const closeButton = document.getElementById('closeLicenseModal');
    const closeConditionsButton = document.getElementById('licenseConditionsClose');

    if (!licenseModal || !closeButton) {
        return;
    }

    closeButton.addEventListener('click', closeLicenseModal);

    if (closeConditionsButton) {
        closeConditionsButton.addEventListener('click', resetLicenseConditionsPanel);
    }

    window.addEventListener('click', (event) => {
        if (event.target === licenseModal) {
            closeLicenseModal();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && licenseModal.style.display === 'block') {
            closeLicenseModal();
        }
    });
}

window.ouvrirModalLicence = ouvrirModalLicence;
window.closeLicenseModal = closeLicenseModal;

function applyViewMode(view) {
    const grid = document.getElementById('grille-produits');
    const listBtn = document.getElementById('listViewBtn');
    const gridBtn = document.getElementById('gridViewBtn');

    if (!grid || !listBtn || !gridBtn) return;

    currentView = view === 'grid' ? 'grid' : 'list';
    grid.classList.toggle('view-list', currentView === 'list');
    grid.classList.toggle('view-grid', currentView === 'grid');
    listBtn.classList.toggle('active', currentView === 'list');
    gridBtn.classList.toggle('active', currentView === 'grid');
    localStorage.setItem('beatsViewMode', currentView);

    if (beatsFiltres.length) {
        afficherBeats();
    }
}

function setupViewToggle() {
    const listBtn = document.getElementById('listViewBtn');
    const gridBtn = document.getElementById('gridViewBtn');

    if (!listBtn || !gridBtn) return;

    listBtn.addEventListener('click', () => {
        applyViewMode('list');
    });

    gridBtn.addEventListener('click', () => {
        applyViewMode('grid');
    });

    applyViewMode(currentView);
}

// ===== MENU HAMBURGER =====
const menuToggle = document.getElementById('menuToggle');
const navMenu = document.getElementById('navMenu');
const navOverlay = document.getElementById('navOverlay');

function openMenu() {
    if (!navMenu || !navOverlay) return;
    navMenu.classList.add('active');
    navOverlay.classList.add('active');
    document.body.classList.add('menu-open');
}

function closeMenu() {
    if (!navMenu || !navOverlay) return;
    navMenu.classList.remove('active');
    navOverlay.classList.remove('active');
    document.body.classList.remove('menu-open');
}

if (menuToggle && navMenu && navOverlay) {
    menuToggle.addEventListener('click', () => {
        if (navMenu.classList.contains('active')) {
            closeMenu();
            return;
        }

        openMenu();
    });

    navOverlay.addEventListener('click', () => {
        closeMenu();
    });
}

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        closeMenu();
    });
});

// ===== RECHERCHE =====
const searchBtn = document.getElementById('searchBtn');
const searchBar = document.getElementById('searchBar');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');

function updateSearchUi() {
    if (!searchInput || !clearSearchBtn) return;
    clearSearchBtn.classList.toggle('visible', searchInput.value.trim().length > 0);
}

function focusSearchBar() {
    if (searchBar) {
        searchBar.classList.add('active');
    }

    const beatsSection = document.getElementById('beats');
    if (beatsSection) {
        beatsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (searchInput) {
        searchInput.focus();
        searchInput.select();
    }
}

if (searchBtn && searchBar && searchInput) {
    searchBtn.addEventListener('click', () => {
        focusSearchBar();
    });

    searchInput.addEventListener('input', (e) => {
        searchTerm = e.target.value.toLowerCase();
        updateSearchUi();
        appliquerFiltres();
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            appliquerFiltres();
        }
    });
}

if (clearSearchBtn && searchInput) {
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchTerm = '';
        updateSearchUi();
        appliquerFiltres();
        searchInput.focus();
    });
}

// ===== FILTRES =====
const filterPanelGroup = document.getElementById('filterPanelGroup');
const filterToggleBtn = document.getElementById('filterToggleBtn');
const filterPanel = document.getElementById('filterPanel');
const filterPanelClose = document.getElementById('filterPanelClose');
const filterResetBtn = document.getElementById('filterResetBtn');
const filterBadge = document.getElementById('filterBadge');
const filterSummary = document.getElementById('filterSummary');
const bpmOptionButtons = document.querySelectorAll('[data-filter-group="bpm"]');
const styleOptionButtons = document.querySelectorAll('[data-filter-group="style"]');
const sortOptionButtons = document.querySelectorAll('[data-filter-group="sort"]');

function getActiveFilterCount() {
    let count = 0;

    if (filterBpm !== 'all') count += 1;
    if (filterStyle !== 'all') count += 1;
    if (sortBy !== 'recent') count += 1;

    return count;
}

function updateFilterBadge() {
    if (!filterBadge) return;
    const count = getActiveFilterCount();
    filterBadge.textContent = String(count);
    filterBadge.hidden = count === 0;
}

function updateFilterSummary() {
    if (!filterSummary) return;

    const parts = [];

    if (filterBpm !== 'all') {
        const bpmLabel = {
            slow: '60-90 BPM',
            medium: '90-120 BPM',
            fast: '120+ BPM'
        }[filterBpm];

        if (bpmLabel) parts.push(bpmLabel);
    }

    if (filterStyle !== 'all') {
        const styleLabel = {
            trap: 'Trap',
            lofi: 'Lofi',
            drill: 'Drill',
            rap: 'Rap'
        }[filterStyle];

        if (styleLabel) parts.push(styleLabel);
    }

    if (sortBy !== 'recent') {
        const sortLabel = {
            'price-low': 'Prix croissant',
            'price-high': 'Prix decroissant',
            popular: 'Populaire'
        }[sortBy];

        if (sortLabel) parts.push(sortLabel);
    }

    filterSummary.textContent = parts.length ? parts.join(' • ') : 'BPM, genre, tri';
}

function syncFilterOptionGroup(buttons, activeValue) {
    buttons.forEach((button) => {
        button.classList.toggle('active', button.dataset.filterValue === activeValue);
    });
}

function syncFilterControls() {
    syncFilterOptionGroup(bpmOptionButtons, filterBpm);
    syncFilterOptionGroup(styleOptionButtons, filterStyle);
    syncFilterOptionGroup(sortOptionButtons, sortBy);
    updateFilterBadge();
    updateFilterSummary();
}

function openFilterPanel() {
    if (!filterPanel || !filterToggleBtn) return;
    filterPanel.hidden = false;
    filterToggleBtn.setAttribute('aria-expanded', 'true');
}

function closeFilterPanel() {
    if (!filterPanel || !filterToggleBtn) return;
    filterPanel.hidden = true;
    filterToggleBtn.setAttribute('aria-expanded', 'false');
}

if (filterToggleBtn) {
    filterToggleBtn.addEventListener('click', () => {
        if (filterPanel && !filterPanel.hidden) {
            closeFilterPanel();
            return;
        }

        openFilterPanel();
    });
}

if (filterPanelClose) {
    filterPanelClose.addEventListener('click', closeFilterPanel);
}

bpmOptionButtons.forEach((button) => {
    button.addEventListener('click', () => {
        filterBpm = button.dataset.filterValue;
        syncFilterControls();
        appliquerFiltres();
    });
});

styleOptionButtons.forEach((button) => {
    button.addEventListener('click', () => {
        filterStyle = button.dataset.filterValue;
        syncFilterControls();
        appliquerFiltres();
    });
});

sortOptionButtons.forEach((button) => {
    button.addEventListener('click', () => {
        sortBy = button.dataset.filterValue;
        syncFilterControls();
        appliquerFiltres();
    });
});

if (filterResetBtn) {
    filterResetBtn.addEventListener('click', () => {
        filterBpm = 'all';
        filterStyle = 'all';
        sortBy = 'recent';

        syncFilterControls();
        appliquerFiltres();
    });
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('#filterPanelGroup')) {
        closeFilterPanel();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeFilterPanel();
    }
});

// ===== LOGIQUE FILTRAGE =====
function appliquerFiltres() {
    beatsFiltres = beats.filter(beat => {
        // Filtre recherche
        const searchValue = searchTerm.trim();
        const matchSearch = !searchValue || [
            beat.nom,
            beat.style,
            beat.producteur,
            String(beat.bpm)
        ].some(value => String(value).toLowerCase().includes(searchValue));
        
        // Filtre BPM
        let matchBpm = true;
        if (filterBpm === 'slow') matchBpm = beat.bpm >= 60 && beat.bpm <= 90;
        if (filterBpm === 'medium') matchBpm = beat.bpm > 90 && beat.bpm <= 120;
        if (filterBpm === 'fast') matchBpm = beat.bpm > 120;
        
        // Filtre Style
        let matchStyle = true;
        if (filterStyle !== 'all') {
            matchStyle = beat.style.toLowerCase().includes(filterStyle.toLowerCase());
        }
        
        return matchSearch && matchBpm && matchStyle;
    });

    // Tri
    if (sortBy === 'price-low') {
        beatsFiltres.sort((a, b) => a.prix - b.prix);
    } else if (sortBy === 'price-high') {
        beatsFiltres.sort((a, b) => b.prix - a.prix);
    } else if (sortBy === 'popular') {
        beatsFiltres.sort((a, b) => b.id - a.id);
    } else if (sortBy === 'recent') {
        // Inverser l'ordre pour afficher les plus récents en premier
        beatsFiltres.sort((a, b) => b.id - a.id);
    }

    afficherBeats();
    mettreAJourCompteur();
}

// ===== AFFICHAGE BEATS =====
function afficherBeats() {
    const grille = document.getElementById('grille-produits');
    if (!grille) return;

    if (!beatsFiltres.length) {
        grille.innerHTML = '<div class="empty-state">Aucun beat ne correspond a votre recherche.</div>';
        return;
    }

    grille.innerHTML = '';
    
    beatsFiltres.forEach(beat => {
        const div = document.createElement('div');
        div.className = 'produit';
        const alreadyAdded = isBeatInCart(beat.id);
        
        const coverUrl = `covers/${beat.cover}`;
        
        div.innerHTML = `
            <div class="produit-media">
                <button class="produit-play-fab" type="button" aria-label="Ecouter ${beat.nom}">
                    <span class="produit-play-icon" aria-hidden="true"><i class="fas fa-play"></i></span>
                </button>
                <div class="produit-image" style="background-image: url('${coverUrl}');"></div>
            </div>
            <div class="produit-content">
                <div class="produit-header">
                    <div>
                        <button class="produit-title-trigger" type="button">${beat.nom}</button>
                        ${buildBeatMetaMarkup(beat)}
                    </div>
                </div>
                <div class="produit-actions">
                    <button class="btn-price${alreadyAdded ? ' is-added' : ''}" onclick="ouvrirModalLicence(${beat.id})" data-beat-id="${beat.id}" ${alreadyAdded ? 'disabled' : ''}>
                        ${alreadyAdded ? 'Deja ajoute' : 'Acheter'}
                    </button>
                </div>
            </div>
        `;
        
        const clickHandler = () => {
            window.location.href = `product.html?id=${beat.id}`;
        };

        div.addEventListener('click', (event) => {
            if (event.target.closest('.produit-play-fab') || event.target.closest('.btn-price')) {
                return;
            }

            clickHandler();
        });

        div.style.cursor = 'pointer';

        const playFab = div.querySelector('.produit-play-fab');
        if (playFab) {
            playFab.addEventListener('click', (event) => {
                event.stopPropagation();
                playBeatPreview(beat, playFab);
            });
        }

        const titleTrigger = div.querySelector('.produit-title-trigger');
        if (titleTrigger) {
            titleTrigger.addEventListener('click', (event) => {
                event.stopPropagation();
                clickHandler();
            });
        }

        hydrateBeatDuration(beat, div);
        
        grille.appendChild(div);
    });
}

function mettreAJourCompteur() {
    const count = beatsFiltres.length;
    const resultsCount = document.getElementById('resultsCount');
    if (resultsCount) {
        resultsCount.textContent = `${count} résultat${count > 1 ? 's' : ''}`;
    }
}

// ===== FONCTIONS BEAT =====
function telecharger(id) {
    const beat = beats.find(b => b.id === id);
    afficherMessage(`🎵 Téléchargement de ${beat.nom} en cours...`);
}

function partager(id) {
    const beat = beats.find(b => b.id === id);
    afficherMessage(`📤 Partage de ${beat.nom} en cours...`);
}

// ===== PANIER =====
const cartBtn = document.getElementById('cartBtn');
const modal = document.getElementById('panier-modal');
const closeCart = document.getElementById('closeCart');
const continueShoppingBtn = document.getElementById('continueShoppingBtn');
const verifyReadyModal = document.getElementById('verify-ready-modal');
const closeVerifyReadyModal = document.getElementById('closeVerifyReadyModal');
const verifyReadyCheckoutBtn = document.getElementById('verifyReadyCheckoutBtn');
const verifyReadyTotal = document.getElementById('verifyReadyTotal');
const INDEX_VERIFY_REDIRECT_KEY = 'openIndexVerifyFromProduct';
const INDEX_CHECKOUT_REDIRECT_KEY = 'openIndexCheckoutFromProduct';

function getCartTotalAmount(items) {
    return items.reduce((sum, item) => sum + (Number(item.totalPrice) * Number(item.quantity || 1)), 0);
}

function closeVerifyReadyCard() {
    if (verifyReadyModal) {
        verifyReadyModal.style.display = 'none';
    }
}

function openVerifyReadyCard() {
    if (!verifyReadyModal) {
        return;
    }

    const total = getCartTotalAmount(panier);
    if (verifyReadyTotal) {
        verifyReadyTotal.textContent = `${total.toFixed(2)}€`;
    }

    verifyReadyModal.style.display = 'flex';
}

function openCartModal() {
    if (!modal) {
        return;
    }

    mettreAJourPanier();
    modal.style.display = 'flex';
}

function consumeIndexVerifyRedirect() {
    if (sessionStorage.getItem(INDEX_CHECKOUT_REDIRECT_KEY) === 'true') {
        return;
    }

    const shouldOpenVerify = sessionStorage.getItem(INDEX_VERIFY_REDIRECT_KEY) === 'true';
    if (!shouldOpenVerify) {
        return;
    }

    sessionStorage.removeItem(INDEX_VERIFY_REDIRECT_KEY);

    if (!panier.length) {
        return;
    }

    openVerifyReadyCard();
}

function consumeIndexCheckoutRedirect() {
    const shouldOpenCheckout = sessionStorage.getItem(INDEX_CHECKOUT_REDIRECT_KEY) === 'true';
    if (!shouldOpenCheckout) {
        return;
    }

    sessionStorage.removeItem(INDEX_CHECKOUT_REDIRECT_KEY);
    sessionStorage.removeItem(INDEX_VERIFY_REDIRECT_KEY);

    if (!panier.length) {
        return;
    }

    if (window.startCheckoutFromCart) {
        window.startCheckoutFromCart(panier);
    }
}

if (cartBtn && modal) {
    cartBtn.addEventListener('click', () => {
        openCartModal();
    });
}

if (closeCart && modal) {
    closeCart.addEventListener('click', () => {
        modal.style.display = 'none';
    });
}

if (continueShoppingBtn && modal) {
    continueShoppingBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });
}

window.addEventListener('click', (e) => {
    if (modal && e.target === modal) {
        modal.style.display = 'none';
    }

    if (verifyReadyModal && e.target === verifyReadyModal) {
        closeVerifyReadyCard();
    }
});

if (closeVerifyReadyModal) {
    closeVerifyReadyModal.addEventListener('click', closeVerifyReadyCard);
}

if (verifyReadyCheckoutBtn) {
    verifyReadyCheckoutBtn.addEventListener('click', () => {
        if (window.startCheckoutFromCart) {
            window.startCheckoutFromCart(panier);
        }

        closeVerifyReadyCard();
    });
}

// Ajouter au panier
function ajouterAuPanier(id, licenseKey = 'wav') {
    const beat = beats.find(b => b.id === id);
    if (!beat) {
        afficherMessage('❌ Beat introuvable.');
        return;
    }
    const license = getLicenseConfig(licenseKey);
    
    const itemExistant = panier.find(p => Number(p.beatId) === Number(id));
    
    if (itemExistant) {
        updateAddToCartButtons();
        closeLicenseModal();
        return;
    }

    panier.push({
        beatId: id,
        beat: beat,
        licenseKey: license.key,
        license: license,
        quantity: 1,
        totalPrice: license.totalPrice
    });
    
    localStorage.setItem('cart', JSON.stringify(panier));
    mettreAJourPanier();
    updateAddToCartButtons();
    closeLicenseModal();
    openCartModal();
}

function ouvrirConditionsLicencePanier(index, licenseKey) {
    const item = panier[index];
    if (!item || !item.beat) {
        return;
    }

    ouvrirModalLicence(item.beat.id);
    updateLicenseConditions(licenseKey);
}

// Mettre à jour le panier
function mettreAJourPanier() {
    // Rechracer le panier depuis localStorage pour assurer la synchronisation
    loadCartFromStorage();
    
    const count = panier.length;
    const cartCount = document.getElementById('panier-count');
    if (cartCount) {
        cartCount.textContent = count;
    }

    updateAddToCartButtons();
    
    const items = document.getElementById('panier-items');
    const totalElement = document.getElementById('total');
    if (!items || !totalElement) return;
    
    if (panier.length === 0) {
        items.innerHTML = `
            <div class="panier-empty-state">
                <p class="panier-vide-title">Chariot vide</p>
                <p class="panier-vide-copy">Ajoute une licence pour voir tes beats ici.</p>
            </div>
        `;
        totalElement.textContent = '0';
        return;
    }
    
    items.innerHTML = '';
    let total = 0;
    
    panier.forEach((item, index) => {
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
                        <select onchange="changerLicence(${index}, this.value)">
                            ${getLicenseEntries().map((license) => `<option value="${license.key}" ${item.licenseKey === license.key ? 'selected' : ''}>${license.name} (${license.priceLabel})</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
            <div class="item-actions">
                <span class="item-prix">${itemTotal.toFixed(2)}€</span>
                <button class="btn-remove" onclick="supprimerDuPanier(${index})">✕</button>
            </div>
        `;
        items.appendChild(div);
    });
    
    totalElement.textContent = total.toFixed(2);
}

function changerQuantite(index, quantite) {
    quantite = parseInt(quantite);
    if (quantite <= 0) {
        supprimerDuPanier(index);
    } else {
        panier[index].quantity = quantite;
        localStorage.setItem('cart', JSON.stringify(panier));
        mettreAJourPanier();
    }
}

function changerLicence(index, licenseKey) {
    const newLicense = getLicenseConfig(licenseKey);
    if (newLicense) {
        panier[index].licenseKey = licenseKey;
        panier[index].license = newLicense;
        panier[index].totalPrice = newLicense.totalPrice;
        localStorage.setItem('cart', JSON.stringify(panier));
        mettreAJourPanier();
    }
}

function supprimerDuPanier(index) {
    panier.splice(index, 1);
    localStorage.setItem('cart', JSON.stringify(panier));
    mettreAJourPanier();
}

// Commander
const btnCommander = document.getElementById('btn-commander');
if (btnCommander) {
    btnCommander.addEventListener('click', () => {
        if (panier.length === 0) {
            afficherMessage('❌ Le panier est vide!');
            return;
        }

        if (modal) {
            modal.style.display = 'none';
        }

        openVerifyReadyCard();
    });
}

// ===== CONTACT =====
const emailJsConfig = window.EMAILJS_CONFIG || {};
const CONTACT_OWNER_EMAIL = emailJsConfig.ownerEmail || 'belecstudio@gmail.com';
let contactEmailJsReady = false;

function canUseEmailJsContact() {
    return Boolean(
        window.emailjs
        && emailJsConfig.publicKey
        && emailJsConfig.serviceId
        && emailJsConfig.contactTemplateId
    );
}

function ensureEmailJsContactReady() {
    if (!canUseEmailJsContact()) {
        return false;
    }

    if (!contactEmailJsReady) {
        window.emailjs.init({ publicKey: emailJsConfig.publicKey });
        contactEmailJsReady = true;
    }

    return true;
}

async function sendContactEmailWithEmailJs(name, email, message) {
    if (!ensureEmailJsContactReady()) {
        throw new Error('EmailJS non configure');
    }

    return window.emailjs.send(emailJsConfig.serviceId, emailJsConfig.contactTemplateId, {
        owner_email: CONTACT_OWNER_EMAIL,
        to_email: CONTACT_OWNER_EMAIL,
        reply_to: email,
        from_email: email,
        from_name: name,
        customer_name: name,
        customer_email: email,
        contact_name: name,
        subject: `Nouveau message contact - ${name}`,
        title: `Nouveau message contact - ${name}`,
        message,
        message_html: String(message || '').replace(/\n/g, '<br>')
    });
}

function openContactGmailCompose(name, email, message) {
    const subject = `Nouveau message contact - ${name}`;
    const body = [
        `Nom: ${name}`,
        `Email: ${email}`,
        '',
        'Message:',
        message
    ].join('\n');

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${encodeURIComponent(CONTACT_OWNER_EMAIL)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank', 'noopener');
}

const contactForm = document.querySelector('#contactForm');
if (contactForm) {
    let isContactSubmitting = false;

    contactForm.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || isContactSubmitting) {
            return;
        }

        const isTextarea = event.target instanceof HTMLTextAreaElement;
        if (isTextarea && event.shiftKey) {
            return;
        }

        event.preventDefault();
        contactForm.requestSubmit();
    });

    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (isContactSubmitting) {
            return;
        }
        
        const name = document.getElementById('contactName').value.trim();
        const email = document.getElementById('contactEmail').value.trim();
        const message = document.getElementById('contactMessage').value.trim();
        const submitButton = contactForm.querySelector('.btn-submit');
        
        if (!name || !email || !message) {
            afficherMessage('Veuillez remplir tous les champs.', 'error');
            return;
        }

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Envoi...';
        }

        isContactSubmitting = true;

        try {
            await sendContactEmail(name, email, message);
            afficherMessage('Votre message a bien ete envoye. Merci pour votre prise de contact. Nous vous repondrons dans les plus brefs delais.', 'success');
            contactForm.reset();
        } catch (error) {
            console.warn('Erreur envoi contact:', error);

            try {
                await sendContactEmailWithEmailJs(name, email, message);
                afficherMessage('Votre message a bien ete envoye. Merci pour votre prise de contact. Nous vous repondrons dans les plus brefs delais.', 'success');
                contactForm.reset();
            } catch (emailJsError) {
                console.warn('Erreur EmailJS contact:', emailJsError);
                openContactGmailCompose(name, email, message);

                if (Number(emailJsError?.status) === 412 && String(emailJsError?.text || '').includes('Invalid grant')) {
                    afficherMessage('Gmail doit etre reconnecte dans EmailJS. Le message a ete prepare dans Gmail Web.', 'info');
                } else {
                    afficherMessage('Envoi automatique indisponible. Le message a ete prepare dans Gmail Web.', 'info');
                }
            }
        } finally {
            isContactSubmitting = false;

            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = 'Envoyer';
            }
        }
    });
}

async function sendContactEmail(name, email, message) {
    const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, email, message })
    });

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Envoi impossible');
    }

    return response.json();
}

// ===== MESSAGES =====
function afficherMessage(message, type = 'info') {
    let alert = document.getElementById('globalMessageAlert');

    if (!alert) {
        alert = document.createElement('div');
        alert.id = 'globalMessageAlert';
        alert.className = 'message-alert';
        document.body.appendChild(alert);
    }

    alert.innerHTML = `<span style="font-size:1.2em;vertical-align:middle;">${message}</span>`;
    alert.className = `message-alert message-alert-${type} is-visible message-alert-styled`;

    clearTimeout(alert.hideTimeout);
    alert.hideTimeout = setTimeout(() => {
        alert.classList.remove('is-visible');
    }, 2600);
}

// ===== INITIALISATION =====
document.addEventListener('DOMContentLoaded', () => {
    loadCartFromStorage();
    setupViewToggle();
    setupLicenseModal();
    syncFilterControls();
    loadBeatsData()
        .then(() => {
            appliquerFiltres();
            updateSearchUi();
        })
        .catch(() => {
            appliquerFiltres();
            updateSearchUi();
        });
    mettreAJourPanier();
    consumeIndexCheckoutRedirect();
    consumeIndexVerifyRedirect();

    if (window.cartSyncReady && typeof window.cartSyncReady.then === 'function') {
        window.cartSyncReady.then(() => {
            loadCartFromStorage();
            mettreAJourPanier();
            updateAddToCartButtons();
            consumeIndexCheckoutRedirect();
            consumeIndexVerifyRedirect();
        }).catch(() => undefined);
    }
});

// Écouter les changements de localStorage d'autres onglets/pages
window.addEventListener('storage', function(e) {
    if (e.key === 'cart') {
        loadCartFromStorage();
        mettreAJourPanier();
        updateAddToCartButtons();
    }
});

window.addEventListener('cart:updated', function() {
    loadCartFromStorage();
    mettreAJourPanier();
    updateAddToCartButtons();
});
