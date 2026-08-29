# CaliSide WL V3.3 — Staff workflow

Cette version conserve le formulaire V3 et ajoute le lien **Ouvrir le panel staff** directement sur la candidature Discord.

Variables Vercel nécessaires au minimum :
- `DISCORD_WEBHOOK_URL`
- `CALISIDE_STAFF_PASSWORD`

Pour l’attribution automatique du rôle WL à la validation finale :
- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID`
- `DISCORD_WL_ROLE_ID`
- `DISCORD_CANDIDATE_CHANNEL_ID` (si le bot doit lire/modifier le salon au lieu du webhook)

`DISCORD_INTERVIEW_WEBHOOK_URL` est facultatif : à défaut, le webhook principal est utilisé pour les notifications.


## CaliSide Discord préconfiguré
- Guild ID par défaut: 1429963172458139691
- WL Role ID par défaut: 1543261181072904264
Ces valeurs peuvent toujours être remplacées via DISCORD_GUILD_ID et DISCORD_WL_ROLE_ID dans Vercel.


V3.4: salon attente/entretien forcé sur 1542681439701831720. Musique de fond supprimée.


## V3.6 — Correctif Discord 50005
- Les candidatures créées par `DISCORD_WEBHOOK_URL` sont désormais modifiées par le même webhook, pas par le bot.
- Corrige `Cannot edit a message authored by another user` (Discord code 50005).
- Le bot reste utilisé pour l’attribution du rôle WL et l’envoi dans le salon d’attente.
- Salon d’attente fixé à `1542681439701831720`.
