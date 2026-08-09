# 📱 Ma Vie — Documents & Argent

Application web (V1) qui permet de gérer ses documents importants et son argent au même endroit, avec un assistant qui envoie des rappels et des observations simples.

Stack : **Node.js / Express** (API) + **MongoDB Atlas** (base de données) + **HTML/CSS/JS vanilla** (frontend, servi par le même serveur) + déploiement sur **Render**.

---

## 1. Fonctionnalités de la V1 (comme demandé)

- Créer un compte / se connecter
- Ajouter des documents (titre, type, date d'expiration, fichier PDF/image, notes)
- Recevoir des alertes sur les documents qui expirent bientôt
- Ajouter des revenus / dépenses par catégorie
- Voir son solde global
- Définir un budget mensuel et voir combien il reste à dépenser
- Assistant intelligent basé sur des règles simples :
  - "Ton passeport expire dans 45 jours."
  - "Tu as dépensé 30% de plus en transport ce mois-ci."
  - Alerte de dépassement de budget / reste à dépenser

---

## 2. Structure du projet

```
ma-vie-app/
├── backend/                 API Express
│   ├── config/db.js         Connexion MongoDB Atlas
│   ├── models/               User, Document, Transaction
│   ├── middleware/            auth (JWT), upload (multer), rate limit, erreurs
│   ├── routes/                 authRoutes, documentRoutes, financeRoutes, dashboardRoutes
│   ├── server.js               Point d'entrée + toutes les couches de sécurité
│   ├── package.json
│   └── .env.example            Variables d'environnement à copier en .env
├── frontend/                 Interface (HTML/CSS/JS, aucun build requis)
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── render.yaml               Blueprint de déploiement Render
└── README.md
```

---

## 3. Sécurité — ce qui a été mis en place

| Risque | Protection |
|---|---|
| Mots de passe en clair | Hachage **bcrypt** (12 tours) avant stockage, jamais renvoyé par l'API |
| Vol de session / token | **JWT** signé avec secret fort, expiration configurable (7 jours par défaut) |
| Brute force sur le login | **Rate limiting** (10 tentatives/15 min/IP) + verrouillage de compte après 5 échecs (15 min) |
| Injection NoSQL | `express-mongo-sanitize` retire les opérateurs Mongo (`$gt`, etc.) des entrées |
| Pollution de paramètres HTTP | `hpp` |
| XSS / en-têtes HTTP dangereux | `helmet` avec Content-Security-Policy stricte |
| CORS ouvert à tous | Origine autorisée limitée à `CLIENT_ORIGIN` uniquement |
| Fichiers malveillants uploadés | Whitelist de types MIME (PDF/JPG/PNG/WEBP), taille max 5 Mo, nom de fichier aléatoire (pas le nom original) |
| Accès aux données d'un autre utilisateur | Chaque document/transaction est lié à `owner`, toutes les requêtes filtrent par l'utilisateur connecté |
| Fuite d'informations sur les erreurs | Le détail des erreurs (stack trace) n'est jamais renvoyé en production |
| Trafic non chiffré | Redirection forcée vers HTTPS en production (Render fournit le certificat TLS automatiquement) |
| Secrets dans le code | Tout est dans des variables d'environnement (`.env`, jamais commité — voir `.gitignore`) |

**Point d'attention pour la suite (V2)** : les tokens sont actuellement envoyés en `Authorization: Bearer`. Pour une sécurité renforcée contre le vol de token via XSS, on peut migrer vers des cookies `httpOnly` + `secure` + `sameSite=strict`, avec protection CSRF (token CSRF ou double-submit cookie).

**Stockage des fichiers — Cloudinary** : le disque de Render est éphémère, donc les fichiers uploadés (cartes d'identité, passeports, contrats…) sont envoyés directement vers **Cloudinary** au lieu du disque local. C'est persistant, gratuit jusqu'à 25 Go, et chaque fichier est stocké avec un identifiant aléatoire (jamais le nom original) dans un sous-dossier propre à chaque utilisateur (`ma-vie/<id_utilisateur>/`). Quand un document est supprimé dans l'app, le fichier est aussi supprimé sur Cloudinary — pas de données orphelines.

---

## 4. Mise en place de MongoDB Atlas

1. Crée un compte sur [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) et un cluster gratuit (M0).
2. Dans **Database Access**, crée un utilisateur avec mot de passe fort (pas d'accès admin, juste lecture/écriture sur ta base).
3. Dans **Network Access**, autorise l'accès depuis `0.0.0.0/0` (nécessaire car Render utilise des IP dynamiques), ou mieux : utilise le peering réseau si disponible sur ton plan.
4. Récupère la chaîne de connexion (**Connect > Drivers**) : elle ressemble à
   `mongodb+srv://utilisateur:motdepasse@cluster0.xxxxx.mongodb.net/mavie?retryWrites=true&w=majority`
5. Garde cette URI secrète — c'est ta variable `MONGO_URI`.

---

## 5. Mise en place de Cloudinary (stockage des fichiers)

1. Crée un compte gratuit sur [cloudinary.com](https://cloudinary.com).
2. Sur le **Dashboard**, juste après connexion, tu trouves directement :
   - `Cloud name`
   - `API Key`
   - `API Secret` (clique sur l'œil pour l'afficher)
3. Reporte ces 3 valeurs dans `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` de ton `.env` (en local) et dans les variables d'environnement Render (en production).
4. Rien d'autre à configurer : le dossier `ma-vie/<id_utilisateur>/` est créé automatiquement au premier upload.

---

## 6. Lancer le projet en local

```bash
cd backend
npm install
cp .env.example .env
# Édite .env : colle ton MONGO_URI, génère un JWT_SECRET (ex: openssl rand -hex 64)
npm run dev
```

Ouvre ensuite `http://localhost:5000` — le frontend est servi directement par le même serveur Express.

---

## 7. Déployer sur Render

### Option A — via le fichier `render.yaml` (recommandé)
1. Pousse ce projet sur un dépôt GitHub.
2. Sur [render.com](https://render.com), clique **New > Blueprint**, connecte le dépôt : Render détecte `render.yaml` et crée le service automatiquement.
3. Renseigne les variables marquées `sync: false` dans le dashboard Render :
   - `MONGO_URI` → ton URI Atlas
   - `CLIENT_ORIGIN` → l'URL Render finale, ex. `https://ma-vie-app.onrender.com`
4. Déploie. Render détecte `backend/package.json`, installe les dépendances et lance `npm start`.

### Option B — manuellement
1. **New > Web Service**, connecte ton dépôt.
2. **Root Directory** : `backend`
3. **Build Command** : `npm install`
4. **Start Command** : `npm start`
5. Ajoute les variables d'environnement (mêmes noms que `.env.example`), avec `NODE_ENV=production`.
6. Déploie.

Une fois en ligne, Render fournit automatiquement le HTTPS — aucune configuration TLS supplémentaire n'est nécessaire.

---

## 8. Tableau de bord

Oui, un tableau de bord est inclus (`Vue : Tableau de bord`) : il affiche le solde global, les revenus/dépenses du mois, le reste à dépenser, un graphique des dépenses par catégorie, et les messages de l'assistant intelligent (rappels d'expiration, variations de dépenses, alertes de budget).

---

## 10. Publier sur Google Play et l'App Store

Le dossier `mobile/` contient une coquille **Capacitor** qui enveloppe le même frontend (`frontend/`) dans une vraie app native Android/iOS. Elle appelle ton backend Render en HTTPS, exactement comme le site web.

**Important** : ceci ne remplace pas le site web ni la PWA — les trois cohabitent et partagent le même code frontend et le même backend.

### Avant de commencer

- Le frontend natif doit pointer vers ton backend **déployé** (pas `localhost`). Ouvre `frontend/js/app.js`, trouve la ligne :
  ```js
  const RENDER_API_URL = "https://ma-vie-app.onrender.com/api";
  ```
  et remplace-la par ta vraie URL Render.

### Android (Google Play — compte développeur 25$, une fois)

1. Installe [Android Studio](https://developer.android.com/studio).
2. Dans `mobile/` :
   ```bash
   npm install
   npx cap add android
   npx @capacitor/assets generate --android   # génère toutes les icônes/splash depuis mobile/assets/
   npx cap sync android
   npx cap open android
   ```
3. Android Studio s'ouvre sur le projet natif. **Build > Generate Signed Bundle / APK**, crée une clé de signature (garde-la précieusement, indispensable pour toute future mise à jour), génère un **.aab**.
4. Crée un compte sur [Google Play Console](https://play.google.com/console), paie les 25$, crée une nouvelle app, remplis la fiche (description, captures d'écran, politique de confidentialité — obligatoire même pour une app simple), uploade le `.aab`, soumets à la revue.

### iOS (App Store — compte développeur 99$/an, nécessite un Mac)

1. Sur un **Mac**, installe [Xcode](https://apps.apple.com/app/xcode/id497799835) depuis le Mac App Store.
2. Dans `mobile/` :
   ```bash
   npm install
   npx cap add ios
   npx @capacitor/assets generate --ios
   npx cap sync ios
   npx cap open ios
   ```
3. Xcode s'ouvre sur le projet natif. Crée un compte sur [developer.apple.com](https://developer.apple.com) (99$/an), configure la signature (**Signing & Capabilities** → ton compte Apple), choisis **Product > Archive**.
4. Sur [App Store Connect](https://appstoreconnect.apple.com), crée une nouvelle app, remplis la fiche, uploade l'archive depuis Xcode (**Window > Organizer > Distribute App**), soumets à la revue.

### Ce à quoi t'attendre

- La revue Apple prend généralement 1 à 3 jours ; Google Play, quelques heures à 1-2 jours.
- Un premier refus est fréquent et normal — Apple en particulier peut demander plus de contenu natif ou une politique de confidentialité plus détaillée. Les messages de refus expliquent précisément quoi corriger.
- Les icônes et le splash screen sources sont dans `mobile/assets/` (identité visuelle "MV" navy/or) — la commande `@capacitor/assets generate` les décline automatiquement dans toutes les tailles requises par chaque store.

---

## 11. Prochaines étapes suggérées (au-delà de la V1)

- Rappels par email/SMS (ex. via un job planifié `node-cron` + un service d'envoi comme Resend ou Twilio)
- Authentification à deux facteurs (2FA)
- Cookies `httpOnly` + protection CSRF à la place du token en `localStorage`
- Export PDF du budget mensuel
- Abonnements récurrents détectés automatiquement (`isRecurring`)
