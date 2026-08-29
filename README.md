# CaliSide WL

Formulaire WhiteList **CaliSide WL** avec workflow staff complet :
1. candidature écrite envoyée dans le salon `CandidateurWL` ;
2. validation d’un créneau vocal ;
3. logs et suivi envoyés dans `Candidature en attente` ;
4. validation/refus définitif ;
5. attribution du rôle WL Discord si configuré.

## Salons Discord configurés
- `DISCORD_CANDIDATE_CHANNEL_ID` : `1542681337587179651` — CandidateurWL
- `DISCORD_PENDING_CHANNEL_ID` : `1542681439701831720` — Candidature en attente / logs

Ces IDs sont déjà définis comme valeurs par défaut dans le code.

## Variables Vercel
- `DISCORD_BOT_TOKEN` : token du bot Discord. **Ne jamais le publier.**
- `DISCORD_GUILD_ID` : ID du serveur Discord CaliSide WL.
- `DISCORD_WL_ROLE_ID` : ID du rôle WL à donner après validation définitive.
- `CALISIDE_STAFF_PASSWORD` : mot de passe de l’espace staff.
- `DISCORD_STAFF_ROLE_IDS` : optionnel, IDs des rôles staff à mentionner, séparés par des virgules.
- `DISCORD_CANDIDATE_CHANNEL_ID` : optionnel si tu gardes le salon par défaut.
- `DISCORD_PENDING_CHANNEL_ID` : optionnel si tu gardes le salon par défaut.

Le bot doit avoir accès aux deux salons et les permissions **Voir le salon**, **Envoyer des messages**, **Intégrer des liens**, **Lire l’historique des messages**. Pour attribuer la WL, il lui faut aussi **Gérer les rôles** et son rôle doit être placé au-dessus du rôle WL.


## Endpoint final
Le formulaire utilise uniquement `/api/caliside-submit-final`. Ne pas recréer `/api/send`.
