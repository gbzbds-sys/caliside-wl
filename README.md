# CaliSide WL V3.9 — Candidatures privées

## Nouveau fonctionnement
- 1 candidature = 1 salon Discord privé créé automatiquement.
- Le candidat ne voit que son propre dossier.
- Le staff autorisé voit tous les salons privés.
- Les salons partagés Candidatures / Vocal / Validées / Refusées deviennent des journaux staff.
- Le candidat reçoit l’acceptation de l’écrit, le créneau vocal et la décision finale dans son salon privé.
- Le rôle WL reste attribué automatiquement à la validation finale.

## Variables Vercel nécessaires
- `DISCORD_WEBHOOK_URL`
- `DISCORD_BOT_TOKEN` (le bot doit avoir **Gérer les salons**, Voir les salons, Envoyer des messages, Gérer les rôles)
- `CALISIDE_STAFF_PASSWORD`

## Variables conseillées
- `DISCORD_STAFF_ROLE_IDS` = IDs des rôles staff séparés par des virgules. Ces rôles auront accès aux salons privés.
- `DISCORD_WL_PRIVATE_CATEGORY_ID` = catégorie où créer les salons privés. Si absent, le script utilise automatiquement la catégorie du salon `wl-candidatures-reçues`.

## IDs CaliSide déjà configurés par défaut
- Serveur : `1429963172458139691`
- Rôle WL : `1543261181072904264`
- Candidatures staff : `1542681337587179651`
- Entretien vocal staff : `1542681439701831720`
- WL validées : `1543268691720798279`
- WL refusées : `1543268925184151593`
