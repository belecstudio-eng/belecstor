# Déploiement Railway + MongoDB Atlas

Ce projet peut maintenant être publié avec Railway pour le serveur Node.js et MongoDB Atlas pour les données et les médias.

## 1. Préparer MongoDB Atlas

1. Créez un cluster sur MongoDB Atlas.
2. Dans Network Access, ajoutez une règle temporaire `0.0.0.0/0` ou l'adresse IP nécessaire.
3. Créez un utilisateur base de données avec mot de passe fort.
4. Dans Connect, récupérez votre URI `mongodb+srv://...`.

Exemple:

```text
mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
```

## 2. Variables d'environnement à utiliser sur Railway

Dans Railway, configurez au minimum:

```text
NODE_ENV=production
PORT=3000
STORAGE_BACKEND=mongodb
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
MONGODB_DB_NAME=studio-belec
ADMIN_USERNAME=admin
ADMIN_PASSWORD=mot-de-passe-fort
CONTACT_OWNER_EMAIL=belecstudio@gmail.com
CONTACT_SMTP_USER=belecstudio@gmail.com
CONTACT_SMTP_PASS=VOTRE_MOT_DE_PASSE_APPLICATION_GMAIL
PAYMENT_DEPOSIT_NUMBER=0575335641
ORDER_DEPOSIT_EMAIL_DELAY_MS=60000
ORDER_PAYMENT_INSTRUCTIONS_EMAIL_DELAY_MS=60000
```

Notes:

- `PORT` est fourni par Railway, mais vous pouvez le laisser dans la liste pour votre référence.
- `STORAGE_DIR` n'est pas nécessaire sur Railway quand `STORAGE_BACKEND=mongodb`.
- Les covers, sons et logos sont stockés dans MongoDB Atlas via GridFS.

## 3. Préparer le dépôt GitHub

Si le dépôt n'est pas encore poussé:

```powershell
git init
git add .
git commit -m "Prepare Railway deployment"
git branch -M main
git remote add origin https://github.com/VOTRE-USER/VOTRE-REPO.git
git push -u origin main
```

Si le dépôt existe déjà:

```powershell
git add .
git commit -m "Prepare Railway deployment"
git push
```

## 4. Créer le projet Railway

1. Ouvrez Railway.
2. Cliquez sur New Project.
3. Choisissez Deploy from GitHub repo.
4. Sélectionnez votre dépôt.
5. Railway détectera automatiquement Node.js grâce à `package.json`.
6. Ajoutez les variables d'environnement listées plus haut.

Railway utilisera:

- `npm install` pour installer les dépendances
- `npm start` pour lancer le serveur
- la route `/api/health` pour vérifier que l'app répond

## 5. Premier démarrage avec migration automatique

Au premier démarrage en mode MongoDB:

1. le serveur lit `data.json`, `carts.json`, `orders.json` et `branding.json` si la base est vide
2. il importe aussi `covers/`, `sons/` et `branding/` dans MongoDB Atlas via GridFS
3. les déploiements suivants utilisent ensuite la base MongoDB comme source principale

Cette migration n'écrase pas une base Atlas déjà remplie.

## 6. Vérifier après mise en ligne

Testez au minimum:

1. la page publique
2. `admin.html`
3. `admin-orders.html`
4. l'upload d'un beat avec cover et audio
5. l'upload d'un logo
6. la création d'une commande
7. la réception des emails Gmail

## 7. Important sur le stockage

En production Railway, les éléments suivants sont conservés dans MongoDB Atlas:

- beats
- paniers
- commandes
- branding
- covers
- fichiers audio
- logo du site

Cela évite la perte des données lors des redéploiements Railway.