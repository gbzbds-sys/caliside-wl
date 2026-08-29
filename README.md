# CaliSide WL — version propre finale

Structure attendue sur GitHub :

```
api/
  caliside-submit.js
  health.js
  interview.js
  staff-auth.js
assets/
CaliSide.mp3
app.js
caliside-logo.png
glass-crack-overlay.png
index.html
staff.html
styles.css
vercel.json
```

## Variables Vercel
- `DISCORD_WEBHOOK_URL` : recommandé pour recevoir les candidatures.
- `DISCORD_BOT_TOKEN` : utile pour les actions bot/DM/rôles.
- `DISCORD_CANDIDATE_CHANNEL_ID` : seulement utilisé si le webhook n'est pas disponible.
- `CALISIDE_STAFF_PASSWORD` : mot de passe du panel staff.
- autres variables Discord déjà utilisées par le projet pour le rôle WL/guild.

## Tests
- API : `/api/health`
- Formulaire prérempli : `/?test=1`

Cette version utilise `/api/caliside-submit` et privilégie le webhook pour éviter `Missing Access (50001)` lors de la création d'une candidature.
