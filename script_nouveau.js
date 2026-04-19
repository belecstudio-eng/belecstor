// Variables globales
let beats = [
    { id: 1, nom: 'Beat Lofi', prix: 9.99, fichier: 'beat1.mp3', cover: 'beat1.jpg', bpm: 90, style: 'Lofi Hip Hop' },
    { id: 2, nom: 'Trap Beat', prix: 14.99, fichier: 'beat2.mp3', cover: 'beat2.jpg', bpm: 140, style: 'Trap' },
    { id: 3, nom: 'Drill Beat', prix: 12.99, fichier: 'beat3.mp3', cover: 'beat3.jpg', bpm: 150, style: 'Drill' }
];
let panier = [];  // Sera chargé à l'initialisation

const licenseCatalog = typeof window.getLicenseCatalog === 'function' ? window.getLicenseCatalog() : {
    wav: { key: 'wav', name: 'Location WAV', totalPrice: 30, priceSupplement: 30, priceLabel: '30,00 $', files: ['MP3', 'WAV'] },
    'wav-stems': { key: 'wav-stems', name: 'Location de STEMS', totalPrice: 80, priceSupplement: 80, priceLabel: '80,00 $', files: ['MP3', 'WAV', 'Trackout'] },
    'premium-stems': { key: 'premium-stems', name: 'Illimité', totalPrice: 120, priceSupplement: 120, priceLabel: '120,00 $', files: ['MP3', 'WAV', 'Trackout'] },
    exclusive: { key: 'exclusive', name: 'Exclusif', totalPrice: 220, priceSupplement: 220, priceLabel: '220,00 $', files: ['MP3', 'WAV', 'Trackout'] }
};

function getLicenseConfig(key) {
    return licenseCatalog[key] || licenseCatalog.wav;
}

function getLicenseEntries() {
    return Object.values(licenseCatalog);
}

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

// ===== MENU HAMBURGER =====
const menuToggle = document.getElementById('menuToggle');
const navMenu = document.getElementById('navMenu');
const navOverlay = document.getElementById('navOverlay');

menuToggle.addEventListener('click', () => {
    navMenu.classList.toggle('active');
    navOverlay.classList.toggle('active');
});

navOverlay.addEventListener('click', () => {
    navMenu.classList.remove('active');
    navOverlay.classList.remove('active');
});

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        navMenu.classList.remove('active');
        navOverlay.classList.remove('active');
    });
});

// ===== RECHERCHE =====
const searchBtn = document.getElementById('searchBtn');
const searchBar = document.getElementById('searchBar');
const searchInput = document.getElementById('searchInput');

searchBtn.addEventListener('click', () => {
    searchBar.classList.toggle('active');
    if (searchBar.classList.contains('active')) {
        searchInput.focus();
    }
});

searchInput.addEventListener('input', (e) => {
    searchTerm = e.target.value.toLowerCase();
    appliquerFiltres();
});

// ===== FILTRES =====
const bpmFilter = document.getElementById('bpmFilter');
const bpmDropdown = document.getElementById('bpmDropdown');
const styleFilter = document.getElementById('styleFilter');
const styleDropdown = document.getElementById('styleDropdown');
const sortFilter = document.getElementById('sortFilter');
const sortDropdown = document.getElementById('sortDropdown');

// Basculer dropdowns
bpmFilter.addEventListener('click', () => {
    bpmDropdown.style.display = bpmDropdown.style.display === 'none' ? 'block' : 'none';
    styleDropdown.style.display = 'none';
    sortDropdown.style.display = 'none';
});

styleFilter.addEventListener('click', () => {
    styleDropdown.style.display = styleDropdown.style.display === 'none' ? 'block' : 'none';
    bpmDropdown.style.display = 'none';
    sortDropdown.style.display = 'none';
});

sortFilter.addEventListener('click', () => {
    sortDropdown.style.display = sortDropdown.style.display === 'none' ? 'block' : 'none';
    bpmDropdown.style.display = 'none';
    styleDropdown.style.display = 'none';
});

// Fermer les dropdowns au clic ailleurs
document.addEventListener('click', (e) => {
    if (!e.target.closest('.filter-group')) {
        bpmDropdown.style.display = 'none';
        styleDropdown.style.display = 'none';
        sortDropdown.style.display = 'none';
    }
});

// Actions des filtres BPM
document.querySelectorAll('#bpmDropdown a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const filter = link.getAttribute('data-filter');
        filterBpm = filter;
        bpmFilter.querySelector('span').textContent = link.textContent;
        bpmDropdown.style.display = 'none';
        appliquerFiltres();
    });
});

// Actions des filtres Style
document.querySelectorAll('#styleDropdown a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const filter = link.getAttribute('data-filter');
        filterStyle = filter;
        styleFilter.querySelector('span').textContent = link.textContent;
        styleDropdown.style.display = 'none';
        appliquerFiltres();
    });
});

// Actions des filtres Tri
document.querySelectorAll('#sortDropdown a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        sortBy = link.getAttribute('data-sort');
        sortFilter.querySelector('span').textContent = link.textContent;
        sortDropdown.style.display = 'none';
        appliquerFiltres();
    });
});

// ===== LOGIQUE FILTRAGE =====
function appliquerFiltres() {
    beatsFiltres = beats.filter(beat => {
        // Filtre recherche
        const matchSearch = beat.nom.toLowerCase().includes(searchTerm) || 
                          beat.style.toLowerCase().includes(searchTerm);
        
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
    }
    // 'recent' est l'ordre par défaut

    afficherBeats();
    mettreAJourCompteur();
}

// ===== AFFICHAGE BEATS =====
function afficherBeats() {
    const grille = document.getElementById('grille-produits');
    grille.innerHTML = '';
    
    beatsFiltres.forEach(beat => {
        const div = document.createElement('div');
        div.className = 'produit';
        
        const coverUrl = `covers/${beat.cover}`;
        
        div.innerHTML = `
            <div class="produit-image" style="background-image: url('${coverUrl}');"></div>
            <div class="produit-content">
                <div class="produit-header">
                    <div>
                        <div class="produit-name">${beat.nom}</div>
                        <div class="produit-meta">
                            <span><i class="fas fa-compact-disc"></i> ${beat.bpm} BPM</span>
                            <span><i class="fas fa-tag"></i> ${beat.style}</span>
                        </div>
                    </div>
                </div>
                <div class="produit-actions">
                    <button class="btn-action" onclick="telecharger(${beat.id})">
                        <i class="fas fa-download"></i> Télécharger
                    </button>
                    <button class="btn-action" onclick="partager(${beat.id})">
                        <i class="fas fa-share-alt"></i> Partager
                    </button>
                    <button class="btn-price" onclick="ajouterAuPanier(${beat.id})">
                        ${beat.prix.toFixed(2)}€
                    </button>
                </div>
            </div>
        `;
        grille.appendChild(div);
    });
}

function mettreAJourCompteur() {
    const count = beatsFiltres.length;
    document.getElementById('resultsCount').textContent = `${count} résultat${count > 1 ? 's' : ''}`;
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

cartBtn.addEventListener('click', () => {
    modal.style.display = 'block';
    mettreAJourPanier();
});

closeCart.addEventListener('click', () => {
    modal.style.display = 'none';
});

window.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

// Ajouter au panier
function ajouterAuPanier(id) {
    const beat = beats.find(b => b.id === id);
    const defaultLicenseKey = 'wav'; // Licence par défaut
    const license = getLicenseConfig(defaultLicenseKey);
    
    // Vérifier si l'article existe déjà avec la même licence
    const itemExistant = panier.find(p => p.beatId === id && p.licenseKey === defaultLicenseKey);
    
    if (itemExistant) {
        itemExistant.quantity++;
    } else {
        panier.push({
            beatId: id,
            beat: beat,
            licenseKey: defaultLicenseKey,
            license: license,
            quantity: 1,
            totalPrice: license.totalPrice
        });
    }
    
    localStorage.setItem('cart', JSON.stringify(panier));
    mettreAJourPanier();
}

// Mettre à jour le panier
function mettreAJourPanier() {
    // Recharger le panier depuis localStorage pour assurer la synchronisation
    loadCartFromStorage();
    
    const count = panier.reduce((acc, item) => acc + item.quantity, 0);
    document.getElementById('panier-count').textContent = count;
    
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
document.getElementById('btn-commander').addEventListener('click', () => {
    if (panier.length === 0) {
        afficherMessage('❌ Le panier est vide!');
        return;
    }
    
    // Mettre à disposition du checkout
    if (window.startCheckoutFromCart) {
        window.startCheckoutFromCart(panier);
    }
    
    modal.style.display = 'none';
});

// ===== CONTACT =====
// Configuration EmailJS
const EMAILJS_SERVICE_ID = 'service_beats';
const EMAILJS_TEMPLATE_ID = 'template_beats';
const EMAILJS_PUBLIC_KEY = 'YOUR_PUBLIC_KEY_HERE';
const OWNER_EMAIL = 'skurtyproduction@gmail.com';

// Initialiser EmailJS au chargement
if (window.emailjs) {
    emailjs.init(EMAILJS_PUBLIC_KEY);
}

// Gestionnaire du formulaire de contact
const contactForm = document.querySelector('.contact-form');
if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const inputs = contactForm.querySelectorAll('input, textarea');
        const name = inputs[0].value.trim();
        const email = inputs[1].value.trim();
        const message = inputs[2].value.trim();
        
        if (!name || !email || !message) {
            afficherMessage('❌ Veuillez remplir tous les champs!');
            return;
        }
        
        sendContactEmail(name, email, message);
    });
}

function sendContactEmail(name, email, message) {
    if (!window.emailjs) {
        afficherMessage('✅ Message reçu! Nous vous répondrons bientôt.');
        const form = document.querySelector('.contact-form');
        if (form) form.reset();
        return;
    }
    
    // Paramètres pour l'email au propriétaire
    const templateParams = {
        to_email: OWNER_EMAIL,
        from_name: name,
        from_email: email,
        message: message,
        reply_to: email
    };
    
    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
        .then(() => {
            // Envoyer aussi un email de confirmation au client
            const confirmParams = {
                to_email: email,
                from_name: name,
                message: message,
                reply_to: OWNER_EMAIL
            };
            return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, confirmParams);
        })
        .then(() => {
            afficherMessage('Votre message a bien ete envoye. Merci pour votre prise de contact. Nous vous repondrons dans les plus brefs delais.');
            const form = document.querySelector('.contact-form');
            if (form) form.reset();
        })
        .catch((error) => {
            console.warn('⚠️ Erreur EmailJS:', error);
            afficherMessage('✅ Message reçu! Nous vous répondrons bientôt.');
            const form = document.querySelector('.contact-form');
            if (form) form.reset();
        });
}

// ===== MESSAGES =====
function afficherMessage(message) {
    const alert = document.createElement('div');
    alert.className = 'message-alert';
    alert.textContent = message;
    document.body.appendChild(alert);
    
    setTimeout(() => alert.remove(), 2500);
}

// ===== INITIALISATION =====
document.addEventListener('DOMContentLoaded', () => {
    loadCartFromStorage();
    afficherBeats();
    mettreAJourCompteur();
    mettreAJourPanier();
});

// Écouter les changements de localStorage d'autres onglets/pages
window.addEventListener('storage', function(e) {
    if (e.key === 'cart') {
        loadCartFromStorage();
        mettreAJourPanier();
    }
});
