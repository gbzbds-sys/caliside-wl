# CaliSide WL V4.0 — Candidature privée garantie

- 1 candidature = 1 salon privé visible uniquement par le candidat + rôles staff autorisés.
- La candidature est publiée dans le salon privé AVANT tout journal staff.
- Si le salon privé ou son message ne peut pas être créé, l’envoi échoue clairement : aucun faux succès.
- Les salons partagés sont uniquement des journaux staff et ne mentionnent jamais le joueur.
- Toutes les notifications joueur (écrit accepté/refusé, entretien, décision finale) restent dans son salon privé.
- Variables requises : DISCORD_BOT_TOKEN, DISCORD_WEBHOOK_URL, CALISIDE_STAFF_PASSWORD, DISCORD_STAFF_ROLE_IDS.
- Le bot doit avoir Gérer les salons, Voir les salons, Envoyer des messages, Intégrer des liens, Lire l’historique et Gérer les rôles.


## V4.1
- Nouveau salon privé nommé `wl-ecrite-pseudo-xxxx`.
- Ping automatique dans le salon privé : Gérant Modérateur, Responsable Staff, Gérant Légal, Gérant Illégal et Modérateur.
- Les rôles restent autorisés à voir les candidatures privées.


## V4.2
- Salon initial: `wl-ecrite-attente-pseudo-xxxx`.
- Logo CaliSide fourni intégré à `caliside-logo.png` et affiché dans l'embed de candidature privée.
