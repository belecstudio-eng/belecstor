# 🎵 Site de Vente de Beats

Un site web simple et moderne pour vendre vos instrumentales/beats en ligne.

## 🚀 Serveur Local D'administration

Vous pouvez maintenant ajouter et supprimer vos beats avec une interface locale, sans modifier `data.json` manuellement.

### Démarrage rapide

```bash
npm install
npm start
```

Ensuite ouvrez:

- Site public: `http://localhost:3000/index.html`
- Interface admin: `http://localhost:3000/admin.html`
- Gestion des commandes: `http://localhost:3000/admin-orders.html`

### Mise en ligne conseillée

Avant publication, définissez aussi:

```powershell
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD="mot-de-passe-fort"
```

Quand `ADMIN_USERNAME` et `ADMIN_PASSWORD` sont définis, l'accès à `admin.html` et aux API d'upload/suppression est protégé par authentification HTTP Basic.

Les uploads acceptés sont:

- covers: `jpg`, `jpeg`, `png`, `webp`
- audio: `mp3`, `wav`

Les erreurs d'upload renvoient maintenant un message clair si le type ou la taille du fichier est invalide.

Les commandes checkout sont enregistrées dans `orders.json` avec le statut `pending-payment` avant la redirection vers Wave ou TapTapSend.

Chaque commande enregistre maintenant aussi:

- le nom du client
- son adresse email
- le nombre total de prods commandees
- le montant total
- la ou les licences choisies
- les fichiers a livrer
- le contrat personnalise a delivrer pour chaque prod

Si `CONTACT_SMTP_USER` et `CONTACT_SMTP_PASS` sont configures, le serveur envoie aussi automatiquement un email recapitulatif au proprietaire avec toutes ces informations.

### Hébergement full-stack conseillé

GitHub Pages ne suffit pas pour ce projet complet, car il ne peut pas exécuter `server.js` ni stocker les commandes, paniers, logos, covers et fichiers audio côté serveur.

Pour la mise en ligne complète, vous avez deux options stables:

- Render avec disque persistant en mode `filesystem`
- Render avec MongoDB Atlas en mode `mongodb`

Attention: sur un service Render Free sans disque persistant ni MongoDB, les beats téléversés depuis l'admin finissent par disparaître au redéploiement.

Un guide pas à pas GitHub + Render est disponible dans [DEPLOY_RENDER_GITHUB.md](DEPLOY_RENDER_GITHUB.md).

Une configuration alternative Railway + MongoDB Atlas reste documentée dans [DEPLOY_RAILWAY_MONGODB.md](DEPLOY_RAILWAY_MONGODB.md).

Variables d'environnement recommandées pour MongoDB:

```text
STORAGE_BACKEND=mongodb
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=studio-belec
ADMIN_USERNAME=admin
ADMIN_PASSWORD=mot-de-passe-fort
CONTACT_OWNER_EMAIL=belecstudio@gmail.com
CONTACT_SMTP_USER=...
CONTACT_SMTP_PASS=...
```

Variables d'environnement recommandées pour le mode fichier persistant:

```text
STORAGE_BACKEND=filesystem
STORAGE_DIR=/var/data/studio-belec
ADMIN_USERNAME=admin
ADMIN_PASSWORD=mot-de-passe-fort
CONTACT_OWNER_EMAIL=belecstudio@gmail.com
CONTACT_SMTP_USER=...
CONTACT_SMTP_PASS=...
```

EmailJS reste optionnel pour les notifications checkout.

Le formulaire contact public passe maintenant par le serveur via `/api/contact`, donc par Gmail si `CONTACT_SMTP_USER` et `CONTACT_SMTP_PASS` sont configures.

Remplissez [emailjs-config.js](emailjs-config.js) avec vos vraies valeurs:

Sur Render, utilisez soit `STORAGE_BACKEND=filesystem` avec un disque persistant monté sur `/var/data/studio-belec`, soit `STORAGE_BACKEND=mongodb` avec `MONGODB_URI` et `MONGODB_DB_NAME` renseignés. MongoDB est l'option la plus sûre si vous ne voulez plus perdre les articles téléversés.
window.EMAILJS_CONFIG = {
  publicKey: 'VOTRE_PUBLIC_KEY',
  serviceId: 'service_xxxxx',
  contactTemplateId: 'template_contact_xxxxx',
  checkoutTemplateId: 'template_checkout_xxxxx',
  ownerEmail: 'belecstudio@gmail.com'
};
```

Le SDK EmailJS est maintenant charge directement dans [index.html](index.html) et [product.html](product.html) pour les parties du site qui en ont encore besoin.

### Reception des messages du formulaire contact

Le formulaire contact envoie directement les messages vers `belecstudio@gmail.com` via Gmail cote serveur.

Avant de lancer le serveur, configurez ces variables d'environnement Windows dans le terminal:

```powershell
$env:CONTACT_OWNER_EMAIL="belecstudio@gmail.com"
$env:CONTACT_SMTP_USER="belecstudio@gmail.com"
$env:CONTACT_SMTP_PASS="VOTRE_MOT_DE_PASSE_APPLICATION_GMAIL"
npm start
```

Important: pour Gmail, utilisez un mot de passe d'application Google, pas votre mot de passe normal.

Alternative Windows rapide:

```powershell
powershell -ExecutionPolicy Bypass -File .\demarrer-contact-gmail.ps1
```

Le script demandera le mot de passe d'application Gmail puis démarrera le serveur avec la configuration d'envoi vers `belecstudio@gmail.com`.

### Fonctions de l'admin

- Ajouter un beat avec cover + fichier audio
- Sauvegarder automatiquement les medias dans MongoDB Atlas via GridFS en production Railway
- Mettre à jour automatiquement les beats, paniers, commandes et branding
- Supprimer un beat
- Supprimer les fichiers médias déjà téléversés quand ils ne sont plus utilisés
- Ouvrir une page admin dediee aux commandes via un bouton avec chargement
- Consulter, supprimer une commande ou vider toutes les commandes dans `admin-orders.html`

## 📂 Structure des Dossiers

```
Nouveau dossier/
├── index.html          # Page principal du site
├── style.css           # Styles (fond bleu + texte noir)
├── script.js           # Logique du site
├── admin.html          # Interface d'administration locale
├── admin.css           # Styles de l'admin
├── admin.js            # Logique de l'admin
├── server.js           # Serveur local Express
├── package.json        # Dépendances et scripts npm
├── data.json           # Liste de vos beats (À MODIFIER!)
├── sons/               # Dossier pour les fichiers audio
│   └── beat1.mp3
│   └── beat2.mp3
│   └── beat3.mp3
│   └── ...
└── covers/             # Dossier pour les images de couverture
    └── beat1.jpg
    └── beat2.jpg
    └── beat3.jpg
    └── ...
```

## 🚀 Comment Utiliser

### Méthode recommandée

Utilisez `http://localhost:3000/admin.html` pour gérer vos beats.

Le serveur local s'occupe de:

- copier les fichiers
- générer les noms de fichiers téléversés
- mettre à jour `data.json`
- supprimer les fichiers non utilisés quand vous supprimez un beat

### 1. **Ajouter un nouveau beat**

Modifiez le fichier `data.json` et ajoutez une ligne pour chaque beat:

```json
{
  "beats": [
    {
      "id": 1,
      "nom": "Beat Lofi",
      "prix": 9.99,
      "fichier": "beat1.mp3",
      "cover": "beat1.jpg",
      "bpm": "90",
      "style": "Lofi Hip Hop"
    }
  ]
}
```

**Champs à remplir:**
- `id` - Numéro unique (1, 2, 3, ...)
- `nom` - Nom du beat
- `prix` - Prix en euros
- `fichier` - Nom du fichier audio (dans le dossier `sons/`)
- `cover` - Nom de l'image de couverture (dans le dossier `covers/`)
- `bpm` - Tempo du beat (ex: 90, 140, 150)
- `style` - Genre musicale (ex: Lofi Hip Hop, Trap, Drill)

### 2. **Ajouter les fichiers audio et images**

1. **Fichiers audio (.mp3)** → Mettez-les dans le dossier `sons/`
2. **Images de couverture (.jpg ou .png)** → Mettez-les dans le dossier `covers/`

⚠️ **Important:** Les noms des fichiers dans `data.json` doivent correspondre exactement aux noms des fichiers réels.

### 3. **Ouvrir le site**

Double-cliquez sur `index.html` pour ouvrir le site dans votre navigateur.

## 🎨 Personnalisation

### Changer les couleurs

Modifiez le fichier `style.css`:
- Couleur bleu: `#1e3a8a`, `#2563eb`
- Couleur boutons: `#2563eb`
- Couleur accents: `#fbbf24` (jaune)

### Changer le titre

Dans `index.html`, modifiez:
```html
<title>Mes Beats - Vendre mes Instrumentales</title>
```

Et dans la navbar:
```html
<div class="logo">🎵 Mes Beats</div>
```

## 💡 Exemple Complet

**data.json:**
```json
{
  "beats": [
    {
      "id": 1,
      "nom": "Trap Strict",
      "prix": 15.99,
      "fichier": "trap_strict.mp3",
      "cover": "trap_cover.jpg",
      "bpm": "140",
      "style": "Trap"
    },
    {
      "id": 2,
      "nom": "Chill Vibes",
      "prix": 9.99,
      "fichier": "chill_vibes.mp3",
      "cover": "chill_cover.jpg",
      "bpm": "85",
      "style": "Lofi Hip Hop"
    }
  ]
}
```

**Fichiers à ajouter:**
- `sons/trap_strict.mp3`
- `sons/chill_vibes.mp3`
- `covers/trap_cover.jpg`
- `covers/chill_cover.jpg`

## ✨ Fonctionnalités

✅ Système de panier fonctionnel
✅ Gestion des quantités
✅ Calcul automatique du prix total
✅ Formulaire de contact
✅ Design moderne et responsive
✅ Fond bleu avec texte noir
✅ Images de couverture personnalisées

## 📧 Support

Pour ajouter un nouveau beat, suivez ces étapes:
1. Ajouter une entrée dans `data.json`
2. Copier le fichier `.mp3` dans le dossier `sons/`
3. Copier l'image `.jpg` dans le dossier `covers/`
4. Rafraîchir le navigateur (F5)

C'est terminé! Votre beat apparaîtra automatiquement sur le site. 🎵
