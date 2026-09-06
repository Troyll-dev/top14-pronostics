# 🏉 Top 14 Pronostics 2026-2027

Application web pour faire des pronostics sur le Top 14 de rugby avec vos amis.

## Fonctionnalités

- **Comptes utilisateurs** — inscription, connexion sécurisée avec JWT
- **Pronostics de scores** — saisir la prédiction (score exact) avant chaque match
- **Clôture automatique** — les pronostics se verrouillent à l'heure du coup d'envoi
- **Classement en temps réel** — points cumulés sur la saison
- **Import auto des résultats** — via l'API Rugby (optionnel)
- **Page admin** — saisie manuelle des résultats + ajout de matchs

## Barème des points

| Résultat | Points |
|----------|--------|
| 🎯 Score exact | 3 pts |
| ✅ Bon vainqueur, écart prédit ≤ 5 pts | 2 pts |
| ✅ Bon vainqueur | 1 pt |
| ❌ Mauvais vainqueur | 0 pt |

---

## 🚀 Démarrage rapide (développement local)

### Prérequis
- Node.js 20+
- PostgreSQL 14+ (ou Docker)

### 1. Cloner et configurer

```bash
git clone <ton-repo>
cd top14-pronostics

# Backend
cd backend
cp .env.example .env
# Modifier DATABASE_URL et JWT_SECRET dans .env

npm install
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed   # Insère les 14 équipes

# Frontend (nouveau terminal)
cd ../frontend
npm install
```

### 2. Lancer

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Ouvre **http://localhost:5173**

---

## 🐳 Démarrage avec Docker

```bash
docker-compose up -d
# La BDD est initialisée automatiquement
# Puis : docker exec top14_backend npm run db:seed
```

---

## 📡 Import automatique des résultats (optionnel)

Inscris-toi sur [RapidAPI → api-rugby](https://rapidapi.com/api-sports/api/api-rugby) (plan gratuit : 100 req/jour).

Dans `backend/.env` :
```
RUGBY_API_KEY=ta_clé_api
```

Puis importe le calendrier une fois :
```bash
cd backend
node -e "require('./src/services/rugby.service').syncSchedule()"
```

Les résultats sont ensuite synchronisés automatiquement chaque heure.

---

## 🌐 Déploiement en production

### Option recommandée : Railway

1. Crée un projet sur [railway.app](https://railway.app)
2. Ajoute un service PostgreSQL
3. Déploie le dossier `backend/` avec les variables d'env
4. Déploie le dossier `frontend/` sur Vercel ou Netlify

### Variables d'environnement backend (production)

```
DATABASE_URL=postgresql://...
JWT_SECRET=<générer avec: openssl rand -hex 64>
NODE_ENV=production
FRONTEND_URL=https://ton-domaine.com
```

---

## Structure du projet

```
top14-pronostics/
├── backend/
│   ├── src/
│   │   ├── app.js              # Point d'entrée Express
│   │   ├── controllers/        # Logique métier
│   │   ├── routes/             # Définition des routes API
│   │   ├── middleware/         # Auth JWT
│   │   ├── services/           # Intégration API Rugby externe
│   │   └── prisma/             # Schéma BDD + seed
│   └── .env.example
└── frontend/
    └── src/
        ├── pages/              # Login, Pronostics, Classement, Admin
        ├── components/         # Navbar, MatchCard
        ├── contexts/           # AuthContext
        └── api/                # Client Axios configuré
```

## API Endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | /api/auth/register | Inscription |
| POST | /api/auth/login | Connexion |
| GET | /api/auth/me | Profil connecté |
| GET | /api/matches?round=1 | Matchs d'une journée |
| POST | /api/matches | Créer un match (admin) |
| PATCH | /api/matches/:id/result | Saisir résultat (admin) |
| POST | /api/predictions | Soumettre/modifier un pronostic |
| GET | /api/predictions/me | Mes pronostics |
| GET | /api/leaderboard | Classement général |
