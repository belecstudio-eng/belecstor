/* ===== CONFIGURATION EmailJS ===== */
const checkoutEmailJsConfig = window.EMAILJS_CONFIG || {};
const CHECKOUT_EMAILJS_SERVICE_ID = checkoutEmailJsConfig.serviceId || '';
const CHECKOUT_EMAILJS_TEMPLATE_ID = checkoutEmailJsConfig.checkoutTemplateId || '';
const CHECKOUT_EMAILJS_PUBLIC_KEY = checkoutEmailJsConfig.publicKey || '';

// Données de contact
const CHECKOUT_OWNER_EMAIL = checkoutEmailJsConfig.ownerEmail || 'belecstudio@gmail.com';
const OWNER_PHONE_WAVE = '+225 07 67 22 33 44';
const OWNER_PHONE_TAPTAPSEND = '+33 1 23 45 67 89';
const OWNER_NAME = 'SKURTY PROD';
const WAVE_PAYMENT_URL = 'https://pay.wave.com/m/M_ci_rX_FR053YqGI/c/ci/';

/* ===== ÉTAT DU CHECKOUT ===== */
let checkoutState = {
    currentStep: 1,
    fullName: '',
    email: '',
    beat: null,
    license: null,
    totalPrice: 0,
    paymentMethod: null
};

let checkoutCart = [];  // Panier à traiter dans le checkout
let paymentRedirectTimeoutId = null;

const PAYMENT_APP_CONFIG = {
    wave: {
        appName: 'Wave',
        fallbackUrl: WAVE_PAYMENT_URL,
        deepLink: 'wave://'
    },
    taptapsend: {
        appName: 'TapTap Send',
        fallbackUrl: 'https://taptapsend.com',
        deepLink: 'taptapsend://'
    }
};

/* ===== INITIALISATION ===== */
document.addEventListener('DOMContentLoaded', function() {
    setupCheckoutListeners();
});

function closeCheckoutModal() {
    const modal = document.getElementById('checkout-modal');
    if (!modal) {
        return;
    }

    modal.style.display = 'none';
}

/* ===== GESTION DES ÉTAPES ===== */
function showStep(stepNumber) {
    // Masquer toutes les étapes
    document.querySelectorAll('.checkout-step').forEach(step => {
        step.classList.remove('active');
    });
    
    // Afficher l'étape demandée
    document.getElementById(`step-${stepNumber}`).classList.add('active');
    
    // Mettre à jour la barre de progression
    document.querySelectorAll('.step').forEach(step => {
        const num = step.dataset.step;
        step.classList.toggle('active', num <= stepNumber);
    });
    
    checkoutState.currentStep = stepNumber;
    
    // Mettre à jour le titre
    const titles = {
        1: 'Informations Client',
        2: 'Méthode de Paiement',
        3: 'Résumé de la Commande',
        4: 'Instructions Obligatoires'
    };
    document.getElementById('checkoutTitle').textContent = titles[stepNumber];
}

function setCheckoutCart(cart) {
    checkoutCart = JSON.parse(JSON.stringify(cart));  // Copie profonde
    console.log('📦 setCheckoutCart - Panier reçu:', checkoutCart);
    // Calculer le total du panier
    const total = checkoutCart.reduce((sum, item) => sum + (item.totalPrice * item.quantity), 0);
    console.log('💰 Total du panier:', total);
    renderCheckoutPreview();
}

function buildCheckoutSummaryData() {
    let totalPrice = 0;
    let summaryHTML = '';
    let selectedBeat = null;
    let selectedLicenseData = null;

    if (checkoutCart && checkoutCart.length > 0) {
        checkoutCart.forEach((item) => {
            const itemTotal = item.totalPrice * item.quantity;
            const filesLabel = Array.isArray(item.license.files) ? item.license.files.join(' , ') : '';

            totalPrice += itemTotal;
            summaryHTML += `
                <div class="summary-item">
                    <div>
                        <span>${item.beat.nom} (${item.quantity}x)</span><br>
                        <small>Licence: ${item.license.name}</small><br>
                        <small>Fichiers: ${filesLabel}</small>
                    </div>
                    <span>${itemTotal.toFixed(2)}€</span>
                </div>
            `;
        });

        return { totalPrice, summaryHTML, selectedBeat, selectedLicenseData };
    }

    const beat = typeof beats !== 'undefined' ? beats.find((item) => item.id == currentBeatId) : null;
    const license = typeof licenses !== 'undefined' ? licenses[selectedLicense] : null;

    if (!beat || !license) {
        return { totalPrice: 0, summaryHTML: '', selectedBeat: null, selectedLicenseData: null };
    }

    const itemTotal = beat.prix + license.priceSupplement;
    const filesLabel = Array.isArray(license.files) ? license.files.join(' , ') : '';

    totalPrice = itemTotal;
    selectedBeat = beat;
    selectedLicenseData = license;
    summaryHTML = `
        <div class="summary-item">
            <div>
                <span>${beat.nom}</span><br>
                <small>Licence: ${license.name}</small><br>
                <small>Fichiers: ${filesLabel}</small>
            </div>
            <span>${itemTotal.toFixed(2)}€</span>
        </div>
    `;

    return { totalPrice, summaryHTML, selectedBeat, selectedLicenseData };
}

function renderCheckoutPreview() {
    const preview = document.getElementById('checkoutCartPreview');
    const previewItems = preview ? preview.querySelector('.checkout-preview-items') : null;

    if (!preview || !previewItems) {
        return;
    }

    const { totalPrice, summaryHTML } = buildCheckoutSummaryData();

    if (!summaryHTML) {
        preview.hidden = true;
        previewItems.innerHTML = '';
        return;
    }

    preview.hidden = false;
    previewItems.innerHTML = `${summaryHTML}
        <div class="summary-total">
            <span>Montant total</span>
            <span>${totalPrice.toFixed(2)}€</span>
        </div>
    `;
}

function setupCheckoutListeners() {
    console.log('🔧 setupCheckoutListeners() DÉMARRAGE');

    const checkoutModal = document.getElementById('checkout-modal');
    const closeCheckoutBtn = document.getElementById('closeCheckout');
    const checkoutForm = document.getElementById('form-infos');
    const fullNameField = document.getElementById('fullName');
    const emailField = document.getElementById('clientEmail');

    if (closeCheckoutBtn) {
        closeCheckoutBtn.addEventListener('click', closeCheckoutModal);
    }

    if (checkoutModal) {
        checkoutModal.addEventListener('click', function(event) {
            if (event.target === checkoutModal) {
                closeCheckoutModal();
            }
        });
    }

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeCheckoutModal();
        }
    });
    
    if (checkoutForm) {
        checkoutForm.addEventListener('submit', function(event) {
            event.preventDefault();

            if (validateStep1()) {
                showStep(2);
            }
        });
    }

    if (fullNameField) {
        fullNameField.addEventListener('input', function() {
            if (this.value.trim().length >= 3) {
                clearFieldError('fullName');
            }
        });
    }

    if (emailField) {
        emailField.addEventListener('input', function() {
            if (this.value.trim()) {
                clearFieldError('clientEmail');
            }
        });
    }

    // Boutons Suivant
    const nextBtns = document.querySelectorAll('.btn-step-next');
    console.log(`📍 ${nextBtns.length} boutons "Suivant" trouvés`);
    
    nextBtns.forEach((btn, idx) => {
        console.log(`  [${idx}] Bouton trouvé avec data-next=${btn.dataset.next}`);
        
        btn.addEventListener('click', function(event) {
            event.preventDefault();
            const nextStep = this.dataset.next;
            console.log(`🔘 CLIC BOUTON: aller à l'étape ${nextStep}`);
            
            if (nextStep == 2) {
                console.log('  → Validation étape 1...');
                if (validateStep1()) {
                    console.log('  ✓ Validation OK → Étape 2');
                    showStep(2);
                } else {
                    console.log('  ✗ Validation ÉCHOUÉE');
                }
            } else if (nextStep == 3) {
                console.log('  → Appel à updateCheckoutSummary()');
                updateCheckoutSummary();
                console.log('  ✓ updateCheckoutSummary() terminée');
                console.log('  → Affichage étape 3');
                showStep(3);
                console.log('  ✓ Étape 3 affichée');
            } else if (nextStep == 4) {
                console.log('  → Appel à updateMandatoryInstructions()');
                updateMandatoryInstructions();
                console.log('  ✓ updateMandatoryInstructions() terminée');
                console.log('  → Affichage étape 4');
                showStep(4);
                console.log('  ✓ Étape 4 affichée');
            } else {
                console.warn(`  ⚠️ Étape inconnue: ${nextStep}`);
            }
        });
    });
    
    // Boutons Retour
    document.querySelectorAll('.btn-step-back').forEach(btn => {
        btn.addEventListener('click', function() {
            const prevStep = this.dataset.prev;
            showStep(prevStep);
        });
    });
    
    // Sélection de la méthode de paiement
    document.querySelectorAll('.payment-option').forEach(option => {
        option.addEventListener('click', function() {
            selectPaymentMethod(this.dataset.method);
        });
    });
    
    // Bouton Continuer vers le paiement
    const btnContinuePay = document.getElementById('btnContinuePay');
    if (btnContinuePay) {
        btnContinuePay.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('=== CLIC SUR CONTINUER VERS LE PAIEMENT ===');
            console.log('État checkout complet:', checkoutState);
            console.log('Méthode sélectionnée:', checkoutState.paymentMethod);
            
            // Vérifier que tous les champs sont remplis
            if (!checkoutState.fullName || !checkoutState.email) {
                alert('Veuillez compléter vos informations');
                return;
            }
            
            if (!checkoutState.paymentMethod) {
                alert('Veuillez sélectionner une méthode de paiement');
                return;
            }
            
            // Procéder au checkout
            submitCheckout();
        });
    } else {
        console.warn('⚠️ Bouton "Continuer vers le paiement" non trouvé dans le DOM');
    }
    
    // Validation email en temps réel
    if (emailField) {
        emailField.addEventListener('blur', function() {
            if (this.value) {
                const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value);
                if (isValid) {
                    clearFieldError('clientEmail');
                }
            }
        });
    }
}

function selectPaymentMethod(method) {
    document.querySelectorAll('.payment-option').forEach((option) => {
        option.classList.toggle('selected', option.dataset.method === method);
    });

    checkoutState.paymentMethod = method;

    console.log('✓ Méthode de paiement sélectionnée:', method);
    console.log('✓ État checkpoint:', checkoutState.paymentMethod);

    const paymentNextButton = document.getElementById('btnPaymentNext');
    if (paymentNextButton) {
        paymentNextButton.disabled = false;
    }

    updatePaymentInstructions();
}

function setPaymentHint(message) {
    const hint = document.getElementById('paymentStatusHint');
    if (hint) {
        hint.textContent = message;
    }
}

function clearPaymentLaunchFallback() {
    if (paymentRedirectTimeoutId) {
        window.clearTimeout(paymentRedirectTimeoutId);
        paymentRedirectTimeoutId = null;
    }
}

function triggerPaymentAppLaunch(method, button) {
    const config = PAYMENT_APP_CONFIG[method];

    if (!config) {
        return;
    }

    clearPaymentLaunchFallback();
    if (button && button.classList) {
        button.classList.add('is-pressing');
        window.setTimeout(() => {
            button.classList.remove('is-pressing');
        }, 180);
    }

    setPaymentHint(`Ouverture de ${config.appName}...`);

    const launchStartedAt = Date.now();
    let pageWasHidden = false;

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            pageWasHidden = true;
            clearPaymentLaunchFallback();
        }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange, { once: true });

    paymentRedirectTimeoutId = window.setTimeout(() => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);

        if (pageWasHidden || Date.now() - launchStartedAt > 2500) {
            return;
        }

        setPaymentHint(`${config.appName} non detectee. Redirection vers le site officiel...`);
        window.location.href = config.fallbackUrl;
    }, 2000);

    const deepLinkFrame = document.createElement('iframe');
    deepLinkFrame.style.display = 'none';
    deepLinkFrame.setAttribute('aria-hidden', 'true');
    deepLinkFrame.src = config.deepLink;
    document.body.appendChild(deepLinkFrame);

    window.setTimeout(() => {
        if (deepLinkFrame.parentNode) {
            deepLinkFrame.parentNode.removeChild(deepLinkFrame);
        }
    }, 1200);
}

/* ===== VALIDATION ===== */
function validateStep1() {
    const fullName = document.getElementById('fullName').value.trim();
    const email = document.getElementById('clientEmail').value.trim();
    
    let isValid = true;
    
    // Validation nom
    if (!fullName) {
        showFieldError('fullName', 'Le nom est obligatoire');
        isValid = false;
    } else if (fullName.length < 3) {
        showFieldError('fullName', 'Le nom doit contenir au moins 3 caractères');
        isValid = false;
    } else {
        clearFieldError('fullName');
    }
    
    // Validation email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
        showFieldError('clientEmail', 'L\'email est obligatoire');
        isValid = false;
    } else if (!emailRegex.test(email)) {
        showFieldError('clientEmail', 'Email invalide');
        isValid = false;
    } else {
        clearFieldError('clientEmail');
    }
    
    if (isValid) {
        checkoutState.fullName = fullName;
        checkoutState.email = email;
    }
    
    return isValid;
}

function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const errorId = `error-${fieldId === 'clientEmail' ? 'email' : fieldId}`;

    if (!field) {
        return;
    }
    
    field.parentElement.classList.add('error');
    const errorElement = document.getElementById(errorId);
    if (errorElement) {
        errorElement.textContent = message;
    }
}

function clearFieldError(fieldId) {
    const field = document.getElementById(fieldId);
    const errorId = `error-${fieldId === 'clientEmail' ? 'email' : fieldId}`;

    if (!field) {
        return;
    }
    
    field.parentElement.classList.remove('error');
    const errorElement = document.getElementById(errorId);
    if (errorElement) {
        errorElement.textContent = '';
    }
}

/* ===== MISE À JOUR DES INFOS ===== */
function updatePaymentInstructions() {
    const method = checkoutState.paymentMethod;
    const totalPrice = Number(checkoutState.totalPrice) || buildCheckoutSummaryData().totalPrice;
    
    // Choisir le numéro en fonction de la méthode
    const phoneNumber = method === 'wave' ? OWNER_PHONE_WAVE : OWNER_PHONE_TAPTAPSEND;
    const appName = method === 'wave' ? 'Wave Money' : 'TapTapSend';
    
    const amountElement = document.getElementById('paymentAmountDisplay');
    const numberElement = document.getElementById('paymentPhoneNumber');
    const nameElement = document.getElementById('beneficiaryName');
    const appElement = document.getElementById('appName');
    const summaryMethodName = document.getElementById('summaryCheckoutMethodName');
    const summaryMethod = document.getElementById('summaryMethod');

    if (amountElement) {
        amountElement.textContent = `${totalPrice.toFixed(2)}€`;
    }
    if (numberElement) {
        numberElement.textContent = phoneNumber;
    }
    if (nameElement) {
        nameElement.textContent = OWNER_NAME;
    }
    if (appElement) {
        appElement.textContent = appName;
    }
    if (summaryMethodName) {
        summaryMethodName.textContent = method === 'wave' ? 'Wave' : 'TapTapSend';
    }
    if (summaryMethod) {
        summaryMethod.textContent = method === 'wave' ? 'Wave' : 'TapTapSend';
    }
}

function updateCheckoutSummary() {
    console.log('📝 updateCheckoutSummary() DÉMARRAGE');
    
    try {
        const { totalPrice, summaryHTML, selectedBeat, selectedLicenseData } = buildCheckoutSummaryData();

        if (!summaryHTML) {
            console.error('❌ Aucun résumé de checkout disponible');
            return;
        }

        checkoutState.totalPrice = totalPrice;
        if (selectedBeat && selectedLicenseData) {
            checkoutState.beat = selectedBeat;
            checkoutState.license = selectedLicenseData;
        }
        
        // Mettre à jour le résumé dans la page
        const orderSummary = document.querySelector('.order-summary-checkout');
        if (orderSummary) {
            // Garder le h4 et remplacer le contenu après
            const header = orderSummary.querySelector('h4');
            orderSummary.innerHTML = header.outerHTML + summaryHTML;
            
            // Ajouter le total
            const totalDiv = document.createElement('div');
            totalDiv.className = 'summary-total';
            totalDiv.innerHTML = `
                <span>Montant total</span>
                <span id="summaryCheckoutTotal">${totalPrice.toFixed(2)}€</span>
            `;
            orderSummary.appendChild(totalDiv);
        }
        
        // Ajouter les infos manquantes
        const methodName = checkoutState.paymentMethod === 'wave' ? 'Wave' : 'TapTapSend';
        const summaryEmail = document.getElementById('summaryEmail');
        const summaryMethod = document.getElementById('summaryMethod');
        
        if (summaryEmail) summaryEmail.textContent = checkoutState.email;
        if (summaryMethod) summaryMethod.textContent = methodName;
        
        console.log('✅ updateCheckoutSummary() SUCCÈS');
        
    } catch (error) {
        console.error('❌ Erreur dans updateCheckoutSummary:', error);
        alert('Erreur: ' + error.message);
    }
}

function updateMandatoryInstructions() {
    try {
        const totalPrice = checkoutState.totalPrice;
        const method = checkoutState.paymentMethod;

        console.log('🔍 updateMandatoryInstructions - checkoutState:', checkoutState);

        if (!method) {
            console.error('❌ Erreur: methode de paiement manquante');
            return;
        }
        
        // Déterminer le numéro et le nom de l'app
        const phoneNumber = method === 'wave' ? OWNER_PHONE_WAVE : OWNER_PHONE_TAPTAPSEND;
        const appName = method === 'wave' ? 'Wave Money' : 'TapTapSend';
        
        console.log('📝 Mises à jour à appliquer:');
        console.log('  - paymentPhoneNumber:', phoneNumber);
        console.log('  - paymentAmountDisplay:', totalPrice + '€');
        console.log('  - appName:', appName);
        
        // Mettre à jour les champs dynamiques de l'étape 4
        const phoneEl = document.getElementById('paymentPhoneNumber');
        const amountEl = document.getElementById('paymentAmountDisplay');
        const benEl = document.getElementById('beneficiaryName');
        const appEl = document.getElementById('appName');
        const appSummaryEl = document.getElementById('paymentAppSummary');
        const phoneSummaryEl = document.getElementById('paymentPhoneSummary');
        const amountSummaryEl = document.getElementById('paymentAmountSummary');
        const beneficiarySummaryEl = document.getElementById('paymentBeneficiarySummary');
        const emailSummaryEl = document.getElementById('paymentEmailSummary');
        const instructionAppEl = document.getElementById('paymentInstructionAppName');
        const instructionAppProductEl = document.getElementById('paymentInstructionAppNameProduct');
        const formattedTotal = `${Number(totalPrice).toFixed(2)}€`;
        
        if (phoneEl) phoneEl.textContent = phoneNumber;
        if (amountEl) amountEl.textContent = formattedTotal;
        if (benEl) benEl.textContent = OWNER_NAME;
        if (appEl) appEl.textContent = appName;
        if (appSummaryEl) appSummaryEl.textContent = appName;
        if (phoneSummaryEl) phoneSummaryEl.textContent = phoneNumber;
        if (amountSummaryEl) amountSummaryEl.textContent = formattedTotal;
        if (beneficiarySummaryEl) beneficiarySummaryEl.textContent = OWNER_NAME;
        if (emailSummaryEl) emailSummaryEl.textContent = checkoutState.email;
        if (instructionAppEl) instructionAppEl.textContent = appName;
        if (instructionAppProductEl) instructionAppProductEl.textContent = appName;
        
        console.log('✅ Instructions obligatoires mises à jour');
        console.log('  - App:', appName);
        console.log('  - Numéro:', phoneNumber);
        console.log('  - Montant:', formattedTotal);
    } catch (error) {
        console.error('❌ Erreur dans updateMandatoryInstructions:', error);
        alert('Erreur: ' + error.message);
    }
}

/* ===== SOUMISSION DU CHECKOUT ===== */
function submitCheckout() {
    return submitCheckoutAsync().catch((error) => {
        console.error('❌ submitCheckoutAsync() a échoué:', error);
        const btn = document.getElementById('btnContinuePay');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Continuer vers le paiement';
        }
        alert('Impossible de préparer la commande. Réessayez.');
    });
}

async function submitCheckoutAsync() {
    console.log('🚀 submitCheckout() DÉMARRAGE');
    console.log('  checkoutState:', checkoutState);
    console.log('  checkoutCart (panier multi):', checkoutCart);
    
    // Vérifier que les infos client sont remplies
    if (!checkoutState.fullName || !checkoutState.email) {
        alert('Veuillez compléter vos informations');
        return;
    }
    
    if (!checkoutState.paymentMethod) {
        alert('Veuillez sélectionner une méthode de paiement');
        return;
    }
    
    // Désactiver le bouton et changer le texte
    const btn = document.getElementById('btnContinuePay');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Traitement en cours...';
    }

    await saveCheckoutOrder();
    
    console.log('✓ Bouton désactivé');
    console.log('✓ Appel de redirectToPayment()');
    redirectToPayment();
}

function buildDeliveryContract(contractTemplate, customerName, beatName) {
    return String(contractTemplate || '')
        .replace(/NOM DU CLIENT ICI/g, customerName || 'Client')
        .replace(/BEAT NAME/g, beatName || 'Beat')
        .trim();
}

function buildCheckoutOrderItems() {
    const sourceItems = checkoutCart && checkoutCart.length ? checkoutCart : [checkoutState];

    return sourceItems
        .map((item) => {
            const beat = item?.beat || checkoutState.beat;
            const license = item?.license || checkoutState.license;
            const beatName = String(beat?.nom || '').trim();
            const licenseName = String(license?.name || '').trim();
            const quantity = Math.max(1, Number(item?.quantity) || 1);

            return {
                beatId: Number(item?.beatId || beat?.id) || null,
                beatName,
                licenseKey: String(item?.licenseKey || license?.key || '').trim(),
                licenseName,
                deliveryFiles: Array.isArray(license?.files) ? license.files.filter(Boolean) : [],
                deliveryContract: buildDeliveryContract(license?.conditions, checkoutState.fullName, beatName),
                unitPrice: Number(item?.totalPrice || license?.totalPrice || checkoutState.totalPrice) || 0,
                quantity
            };
        })
        .filter((item) => item.beatName && item.licenseName);
}

async function saveCheckoutOrder() {
    const items = buildCheckoutOrderItems();
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

    const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fullName: checkoutState.fullName,
            email: checkoutState.email,
            paymentMethod: checkoutState.paymentMethod,
            totalPrice: checkoutState.totalPrice,
            itemCount,
            items
        })
    });

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Enregistrement de commande impossible');
    }

    return response.json();
}

function sendNotificationEmail() {
    const beat = checkoutState.beat;
    const license = checkoutState.license;
    const method = checkoutState.paymentMethod;
    
    // Construire le message
    const message = `
Nouvelle commande reçue!

CLIENT:
- Nom: ${checkoutState.fullName}
- Email: ${checkoutState.email}

PRODUIT:
- Beat: ${beat.nom}
- Licence: ${license.name}
- Prix: ${checkoutState.totalPrice}€

PAIEMENT:
- Méthode: ${method === 'wave' ? 'Wave' : 'TapTapSend'}
- Montant à recevoir: ${checkoutState.totalPrice}€

STATUS: En attente de paiement
    `.trim();
    
    // Essayer d'envoyer avec EmailJS
    sendEmailWithEmailJS();
}

function sendEmailWithEmailJS() {
    const beat = checkoutState.beat;
    const license = checkoutState.license;
    const method = checkoutState.paymentMethod;
    const emailJsReady = window.emailjs
        && CHECKOUT_EMAILJS_PUBLIC_KEY
        && CHECKOUT_EMAILJS_PUBLIC_KEY !== 'YOUR_EMAILJS_PUBLIC_KEY'
        && CHECKOUT_EMAILJS_SERVICE_ID
        && CHECKOUT_EMAILJS_SERVICE_ID !== 'YOUR_EMAILJS_SERVICE_ID'
        && CHECKOUT_EMAILJS_TEMPLATE_ID
        && CHECKOUT_EMAILJS_TEMPLATE_ID !== 'YOUR_EMAILJS_CHECKOUT_TEMPLATE_ID';

    if (!emailJsReady) {
        console.warn('⚠️ EmailJS non configure, redirection directe vers le paiement');
        redirectToPayment();
        return;
    }
    
    console.log('📧 Configuration EmailJS...');
    console.log('  - Service ID:', CHECKOUT_EMAILJS_SERVICE_ID);
    console.log('  - Template ID:', CHECKOUT_EMAILJS_TEMPLATE_ID);
    
    // Paramètres pour EmailJS
    const templateParams = {
        to_email: CHECKOUT_OWNER_EMAIL,
        from_email: checkoutState.email,
        customer_name: checkoutState.fullName,
        beat_name: beat.nom,
        license_name: license.name,
        total_price: checkoutState.totalPrice,
        payment_method: method === 'wave' ? 'Wave' : 'TapTapSend',
        message: `Nouvelle commande de ${checkoutState.fullName} (${checkoutState.email}) pour ${beat.nom} - Licence ${license.name}`
    };
    
    console.log('📧 Paramètres email:', templateParams);
    
    // Envoyer l'email
    emailjs.send(CHECKOUT_EMAILJS_SERVICE_ID, CHECKOUT_EMAILJS_TEMPLATE_ID, templateParams)
        .then(function(response) {
            console.log('✅ Email envoyé avec succès', response);
            console.log('🔗 Redirection vers le site de paiement...');
            redirectToPayment();
        })
        .catch(function(error) {
            console.warn('⚠️ Erreur EmailJS (continuant quand même):', error);
            // Continuer quand même vers le paiement
            redirectToPayment();
        });
}

function sendMailtoNotification() {
    const beat = checkoutState.beat;
    const license = checkoutState.license;
    const method = checkoutState.paymentMethod;
    const methodName = method === 'wave' ? 'Wave' : 'TapTapSend';
    
    console.log('📧 Préparation de l\'email de notification...');
    
    // Créer le sujet
    const subject = `🎵 Nouvelle commande: ${beat.nom}`;
    
    // Créer le body formaté avec toutes les infos
    const body = `COMMANDE REÇUE - À TRAITER

═══════════════════════════════════════

📱 CLIENT:
- Nom: ${checkoutState.fullName}
- Email: ${checkoutState.email}

🎵 PRODUIT:
- Beat: ${beat.nom}
- Licence: ${license.name}
- Prix: ${checkoutState.totalPrice}€

💳 PAIEMENT:
- Méthode: ${methodName}
- Statut: EN ATTENTE DE PAIEMENT

═══════════════════════════════════════

✅ À FAIRE:
1. Vérifier le paiement sur ${methodName}
2. Confirmer le montant: ${checkoutState.totalPrice}€
3. Envoyer le beat à: ${checkoutState.email}
4. Conserver la preuve de paiement

═══════════════════════════════════════
Date: ${new Date().toLocaleString('fr-FR')}
═══════════════════════════════════════`;
    
    // Créer le lien mailto encodé
    const mailtoLink = `mailto:${CHECKOUT_OWNER_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    console.log('📧 Ouverture du client email par défaut...');
    console.log('  ✓ À:', CHECKOUT_OWNER_EMAIL);
    console.log('  ✓ Sujet:', subject);
    console.log('  ✓ Infos complètes pré-remplies');
    
    // Ouvrir le client email par défaut
    // Utiliser window.open au lieu de window.location.href pour ne pas remplacer la page
    window.open(mailtoLink);
}

function redirectToPayment() {
    const method = checkoutState.paymentMethod;
    
    console.log('🔄 redirectToPayment() DÉMARRAGE');
    console.log('  Méthode de paiement:', method);
    
    // Vérifier que la méthode de paiement est définie
    if (!method) {
        console.error('❌ Méthode de paiement non définie!');
        alert('Veuillez sélectionner une méthode de paiement');
        return;
    }
    
    // Définir l'URL de redirection selon la méthode
    const paymentConfig = PAYMENT_APP_CONFIG[method];

    if (!paymentConfig) {
        console.error('❌ Méthode non reconnue:', method);
        return;
    }

    console.log(`  ✓ Fallback ${paymentConfig.appName}:`, paymentConfig.fallbackUrl);
    
    // Afficher message de confirmation
    console.log('  1️⃣ Affichage message "Traitement"');
    showSuccessMessage();
    
    console.log('  2️⃣ Tentative ouverture app puis fallback web sous 2 secondes');
    triggerPaymentAppLaunch(method, document.getElementById('btnContinuePay'));
    
    // Les emails de commande et les relances client sont maintenant geres cote serveur.
    console.log('  3️⃣ Emails geres cote serveur');
    
    // Fermer le modal après 1 seconde
    console.log('  4️⃣ Fermeture du modal');
    setTimeout(() => {
        const modal = document.getElementById('checkout-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        console.log('  ✓ Modal fermée');
    }, 1000);
    
    // Réinitialiser le formulaire
    console.log('  5️⃣ Réinitialisation formulaire');
    setTimeout(() => {
        resetCheckout();
        console.log('  ✓ Formulaire réinitialisé');
    }, 1500);
    
    // Retourner à index.html après 3 secondes
    console.log('  6️⃣ Retour à index.html dans 3 secondes');
    setTimeout(() => {
        console.log('  ✓ Redirection vers index.html');
        window.location.href = 'index.html';
    }, 3000);
    
    console.log('✅ redirectToPayment() TERMINÉE');
}

function showSuccessMessage() {
    const message = document.createElement('div');
    message.className = 'success-notification';
    message.innerHTML = `
        <div class="notification-content">
            <div class="payment-loader" aria-hidden="true"></div>
            <p class="notification-kicker">Paiement</p>
            <h3>Ouverture de ${checkoutState.paymentMethod === 'wave' ? 'Wave' : 'TapTapSend'}</h3>
            <p id="paymentStatusHint">Verification de l'application sur votre telephone...</p>
            <p class="notification-copy">Si l'application n'est pas installee, basculement automatique vers la page officielle.</p>
        </div>
    `;
    document.body.appendChild(message);
    
    // Ajouter l'animation
    setTimeout(() => {
        message.classList.add('show');
    }, 100);
}

function resetCheckout() {
    checkoutState = {
        currentStep: 1,
        fullName: '',
        email: '',
        beat: null,
        license: null,
        totalPrice: 0,
        paymentMethod: null
    };
    
    // Réinitialiser le formulaire
    document.getElementById('fullName').value = '';
    document.getElementById('clientEmail').value = '';
    document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
    document.getElementById('btnPaymentNext').disabled = true;
    
    // Revenir à l'étape 1
    showStep(1);
}

/* ===== STYLES POUR LA NOTIFICATION ===== */
const styleSheet = document.createElement('style');
styleSheet.textContent = `
.success-notification {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(8, 11, 16, 0.88);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    opacity: 0;
    transition: opacity 0.3s ease;
}

.success-notification.show {
    opacity: 1;
}

.notification-content {
    text-align: center;
    color: white;
    width: min(92vw, 420px);
    padding: 1.6rem 1.4rem;
    border-radius: 24px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(160deg, rgba(17, 23, 31, 0.96) 0%, rgba(11, 16, 24, 0.98) 100%);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
    animation: slideUp 0.5s ease;
}

.payment-loader {
    width: 58px;
    height: 58px;
    margin: 0 auto 1rem;
    border-radius: 999px;
    border: 4px solid rgba(255, 255, 255, 0.14);
    border-top-color: #ffffff;
    animation: paymentSpin 0.8s linear infinite;
}

.notification-kicker {
    margin: 0 0 0.4rem;
    color: #df8d58;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 0.74rem;
    font-weight: 800;
}

.notification-content h3 {
    font-size: 1.45rem;
    line-height: 1.15;
    margin: 0 0 0.7rem;
}

.notification-content p {
    margin: 0.35rem 0;
    font-size: 0.96rem;
    color: rgba(255, 255, 255, 0.84);
}

.notification-copy {
    font-size: 0.88rem;
    color: rgba(255, 255, 255, 0.66);
}

@keyframes slideUp {
    from {
        transform: translateY(100px);
        opacity: 0;
    }
    to {
        transform: translateY(0);
        opacity: 1;
    }
}

@keyframes paymentSpin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

@media (max-width: 768px) {
    .notification-content {
        width: min(92vw, 360px);
        padding: 1.3rem 1rem;
    }

    .payment-loader {
        width: 52px;
        height: 52px;
    }

    .notification-content h3 {
        font-size: 1.3rem;
    }
}
`;
document.head.appendChild(styleSheet);

/* ===== FONCTION DE DÉMARRAGE DU CHECKOUT À PARTIR DU PANIER ===== */
window.startCheckoutFromCart = function(cart) {
    if (!cart || cart.length === 0) {
        alert('Le panier est vide!');
        return;
    }
    
    setCheckoutCart(cart);
    const modal = document.getElementById('checkout-modal');
    if (modal) {
        modal.style.display = 'flex';
        showStep(1);
    }
};