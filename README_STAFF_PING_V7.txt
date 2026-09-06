CALISIDE WL V7 — PING STAFF UNIQUEMENT
======================================

Quand une candidature est créée dans son salon privé :
- le bot ping uniquement les rôles configurés dans DISCORD_STAFF_ROLE_IDS ;
- aucun @everyone ;
- aucun @here ;
- Discord allowed_mentions limite explicitement le ping aux rôles configurés.

Exemple Vercel :
DISCORD_STAFF_ROLE_IDS=123456789012345678,987654321098765432

Tu peux mettre un seul rôle ou plusieurs IDs séparés par virgule, espace ou point-virgule.
