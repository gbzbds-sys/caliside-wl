# CaliSide WL V3

Structure Vercel :

- `api/caliside-submit.js` : endpoint principal de candidature
- `api/send.js` : compatibilité avec les anciennes versions/caches du frontend
- `api/interview.js` : workflow entretien
- `api/staff-auth.js` : authentification staff
- `api/health.js` : test de disponibilité API

Le frontend actuel utilise `/api/caliside-submit` et charge `app.js?v=3.0.0` pour forcer la mise à jour navigateur.
