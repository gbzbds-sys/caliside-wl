// Compatibilité avec les anciennes versions du frontend qui appellent encore /api/send.
// Toutes les candidatures passent désormais par le même handler robuste.
export { default } from './caliside-submit.js';
