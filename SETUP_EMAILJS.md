## 🎵 Système d'Achat Complet - Configuration EmailJS

### 📋 CONFIGURATION REQUISE

Pour que le système d'email automatique fonctionne, vous devez configurer **EmailJS**.

---

### ⚙️ ÉTAPES DE CONFIGURATION

#### 1. **Créer un compte EmailJS**
   - Allez à: https://www.emailjs.com/
   - Inscrivez-vous gratuitement
   - Vérifiez votre email

#### 2. **Créer un service de messagerie**
   - Dans le dashboard EmailJS, allez à "Email Services"
   - Cliquez sur "Add Service"
   - Choisissez **Gmail** (ou votre fournisseur)
   - Connectez votre adresse email
   - Exemple: `skurtyproduction@gmail.com`

#### 3. **Créer un modèle d'email**
   - Au lieu de créer un template, vous pouvez utiliser ce format dans `checkout.js`:
   
   ```javascript
   // Les paramètres à envoyer
   const templateParams = {
       to_email: "skurtyproduction@gmail.com",     // Email du propriétaire
       from_email: "client@example.com",            // Email du client
       customer_name: "Jean Dupont",                // Nom du client
       beat_name: "Summer Vibes",                   // Beat acheté
       license_name: "LICENSE WAV",                 // Type de licence
       total_price: 25,                             // Prix total
       payment_method: "Wave"                       // Méthode de paiement
   };
   ```

#### 4. **Obtenir votre clé publique**
   - Allez à: https://dashboard.emailjs.com/admin
   - Cliquez sur **Account** → **API Keys**
   - Copiez votre **Public Key**
   - Collez-la dans [checkout.js](checkout.js) ligne 2:
   
   ```javascript
   const EMAILJS_PUBLIC_KEY = 'VOTRE_CLé_ICI';
   ```

#### 5. **Obtenir Service ID et Template ID**
   - Allez à **Email Services**
   - Copiez votre **Service ID**
   - Allez à **Email Templates**
   - Créez ou utilisez un template
   - Copiez son **Template ID**
   
   Mettez à jour dans [checkout.js](checkout.js):
   ```javascript
   const EMAILJS_SERVICE_ID = 'service_xxxxx';
   const EMAILJS_TEMPLATE_ID = 'template_xxxxx';
   ```

---

### 📧 ALTERNATIVE : Sans EmailJS (Gmail simple)

Si vous ne voulez pas d'EmailJS, vous pouvez utiliser un lien **mailto** simple:

```javascript
// Dans checkout.js, remplacer la fonction sendEmailWithEmailJS() par:
function sendEmailWithEmailJS() {
    const beat = checkoutState.beat;
    const license = checkoutState.license;
    const method = checkoutState.paymentMethod;
    
    const subject = `Nouvelle commande: ${beat.nom}`;
    const body = `
Nom: ${checkoutState.fullName}
Email: ${checkoutState.email}
Beat: ${beat.nom}
Licence: ${license.name}
Prix: ${checkoutState.totalPrice}€
Paiement: ${method === 'wave' ? 'Wave' : 'TapTapSend'}
    `;
    
    const mailtoLink = `mailto:${OWNER_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink);
    
    redirectToPayment();
}
```

---

### 🎯 CONFIGURATION PERSONNALISÉE

#### Modifier les numéros de paiement

Ouvrez [checkout.js](checkout.js) et cherchez:

```javascript
const OWNER_EMAIL = 'skurtyproduction@gmail.com';          // Votre email
const OWNER_PHONE_WAVE = '+225 07 67 22 33 44';            // Numéro Wave (Côte d'Ivoire)
const OWNER_PHONE_TAPTAPSEND = '+33 1 23 45 67 89';         // Numéro TapTapSend (Europe)
const OWNER_NAME = 'SKURTY PROD';                          // Votre nom
```

Remplacez par **vos vraies informations**.

---

### 🧪 TEST DU SYSTÈME

1. Ouvrez [product.html](product.html) dans le navigateur
2. Cliquez sur un beat
3. Choisissez une licence
4. Cliquez **"Acheter Maintenant"**
5. Remplissez le formulaire:
   - Nom: Jean Dupont
   - Email: test@example.com
6. Cliquez **"Suivant"**
7. Choisissez un moyen de paiement (Wave ou TapTapSend)
8. Lisez les instructions
9. Cliquez **"Continuer vers le paiement"**
10. Vous serez redirigé vers le site de paiement

---

### ✅ POINTS DE VÉRIFICATION

- ✓ EmailJS configuré avec l'email correct
- ✓ Les numéros de paiement sont les vôtres
- ✓ Les paramètres template correspondent
- ✓ La clé publique est correcte dans checkout.js

---

### 🔒 SÉCURITÉ

⚠️ **Important:**
- Ne partagez **JAMAIS** vos clés EmailJS en public
- Utilisez toujours **HTTPS** en production
- Les paiements vrais doivent passer par une API de paiement sécurisée

---

### 📞 SUPPORT

Si EmailJS ne fonctionne pas:
1. Vérifiez la console du navigateur (F12 → Console)
2. Cherchez les messages d'erreur
3. Vérifiez votre Service ID et Template ID
4. Assurez-vous que Gmail a accepté la connexion

Sinon, utilisez l'**alternative mailto** ci-dessus.
