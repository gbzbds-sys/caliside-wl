import { createHash, createHmac } from 'node:crypto';

const text = (v, max = 1000) => String(v ?? '').trim().slice(0, max);
const arrayText = (v, max = 1000) => (Array.isArray(v) ? v.join(', ') : text(v, max)).slice(0, max);
const getDiscordId = (v) => (String(v ?? '').match(/\d{15,22}/) || [''])[0];

function safeJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function futureIso(hours) {
  const d = new Date(Date.now() + hours * 3600000);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

function formatSlot(v) {
  if (!v) return 'Non proposé';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return text(v, 80);
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Paris'
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function addWait(url) {
  return url.includes('?') ? `${url}&wait=true` : `${url}?wait=true`;
}

async function discordPost(payload) {
  const webhook = String(process.env.DISCORD_WEBHOOK_URL || '').trim();
  const botToken = String(process.env.DISCORD_BOT_TOKEN || '').trim();
  const channelId = String(process.env.DISCORD_CANDIDATE_CHANNEL_ID || '').trim();

  if (webhook) {
    const r = await fetch(addWait(webhook), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const raw = await r.text();
    if (!r.ok) {
      return { ok: false, status: r.status, via: 'webhook', raw };
    }
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch {}
    return { ok: true, status: r.status, via: 'webhook', data };
  }

  if (!botToken || !channelId) {
    return {
      ok: false,
      status: 503,
      via: 'config',
      raw: 'Ajoute DISCORD_WEBHOOK_URL, ou DISCORD_BOT_TOKEN + DISCORD_CANDIDATE_CHANNEL_ID dans Vercel.'
    };
  }

  const r = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bot ${botToken}` },
    body: JSON.stringify(payload)
  });
  const raw = await r.text();
  if (!r.ok) return { ok: false, status: r.status, via: 'bot', raw };
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}
  return { ok: true, status: r.status, via: 'bot', data };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, service: 'CaliSide submit', version: '3.2.0' });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ ok: false, error: 'Méthode non autorisée', version: '3.2.0' });
    }

    let b = safeJsonBody(req);
    const testMode = b._testMode === true || b._testMode === 'true' || b._testMode === '1';

    if (testMode) {
      b = {
        ...b,
        pseudo: '[TEST] CaliSide', age: '25', discord: '123456789012345678', fivem: 'TEST-FIVEM-ID',
        experience: 'Plus de 2 ans', previousRp: 'Candidature automatique de test CaliSide WL.',
        character: 'Personnage de test avec projet RP civil durable et cohérent.',
        rpType: ['Civil', 'Entreprise'], goals: 'Tester le workflow complet de candidature.',
        whyCaliSide: 'Test technique CaliSide WL.', contribution: 'Test du workflow Discord et staff.',
        weeklyTime: '20 à 30 h', availability: ['Soir', 'Week-end'], constraints: 'Aucune.',
        freekill: 'Tuer sans raison RP valable.', nopain: 'Ignorer la douleur RP.', fear: 'Jouer la peur face au danger.',
        meta: 'Utiliser en RP une information obtenue HRP.', power: 'Forcer une action irréaliste.',
        crash: 'Je joue les conséquences de l’accident.', rulebreak: 'Je termine la scène puis contacte le staff.',
        armedRobbery: 'Je respecte le Fear RP.', rpLoss: 'J’accepte les conséquences RP.',
        interviewSlot1: futureIso(24), interviewSlot2: futureIso(48),
        interviewNote: 'TEST AUTOMATIQUE CaliSide WL', rulesAccepted: 'true'
      };
    }

    if (!b.whyCaliSide && b.whyPurple) b.whyCaliSide = b.whyPurple;
    if (!b.interviewSlot1) b.interviewSlot1 = futureIso(24);
    if (!b.interviewSlot2) b.interviewSlot2 = futureIso(48);

    const did = getDiscordId(b.discord);
    const pseudo = text(b.pseudo || 'Non renseigné', 40);

    const mainEmbed = {
      title: '🟣 Nouvelle candidature WhiteList — CaliSide WL',
      color: 11152639,
      description: testMode
        ? '🧪 **Candidature TEST** reçue par l’API V3.2.'
        : '📝 **Nouvelle candidature écrite** reçue.',
      fields: [
        { name: '👤 Candidat', value: `**Pseudo :** ${pseudo}\n**Âge :** ${text(b.age || 'Non renseigné', 30)}\n**Discord :** ${text(b.discord || 'Non renseigné', 80)}${did ? `\n**Mention :** <@${did}>` : ''}\n**FiveM :** ${text(b.fivem || 'Non renseigné', 100)}`, inline: false },
        { name: '🎮 Expérience', value: `**Temps RP :** ${text(b.experience || 'Non renseigné', 150)}\n${text(b.previousRp || 'Non renseigné', 700)}`, inline: false },
        { name: '🎭 Projet RP', value: text(b.character || 'Non renseigné', 900), inline: false },
        { name: '🧭 RP recherché', value: arrayText(b.rpType || 'Non renseigné', 500), inline: false },
        { name: '🎙️ Entretien', value: `**Créneau 1 :** ${formatSlot(b.interviewSlot1)}\n**Créneau 2 :** ${formatSlot(b.interviewSlot2)}\n**Note :** ${text(b.interviewNote || 'Aucune', 400)}`, inline: false }
      ],
      footer: { text: 'CaliSide WL • Candidature reçue • API 3.2.0' },
      timestamp: new Date().toISOString()
    };

    const staffRoles = String(process.env.DISCORD_STAFF_ROLE_IDS || '')
      .split(',').map(v => v.trim()).filter(v => /^\d{17,20}$/.test(v));

    const payload = {
      content: `${staffRoles.map(id => `<@&${id}>`).join(' ')}${staffRoles.length ? '\n' : ''}Nouvelle candidature${did ? ` de <@${did}>` : ''}`,
      allowed_mentions: { roles: staffRoles, users: did ? [did] : [] },
      embeds: [mainEmbed]
    };

    const sent = await discordPost(payload);
    if (!sent.ok) {
      const status = sent.status === 503 ? 503 : 502;
      return res.status(status).json({
        ok: false,
        error: sent.via === 'config' ? 'Configuration Discord manquante' : 'Discord a refusé le message',
        detail: String(sent.raw || '').slice(0, 1200),
        discordStatus: sent.status,
        via: sent.via,
        version: '3.2.0'
      });
    }

    // Le lien staff est signé si un mot de passe est configuré. Ce bloc ne peut pas casser l’envoi principal.
    let staffLink = null;
    try {
      const messageId = sent.data?.id || '';
      const staffPassword = String(process.env.CALISIDE_STAFF_PASSWORD || '').trim();
      if (messageId && staffPassword) {
        const body = Buffer.from(JSON.stringify({ pseudo, discord: text(b.discord, 80), discordId: did, messageId, slot1: b.interviewSlot1, slot2: b.interviewSlot2, createdAt: Date.now() })).toString('base64url');
        const secret = createHash('sha256').update(`caliside-wl-token:${staffPassword}`).digest('hex');
        const sig = createHmac('sha256', secret).update(body).digest('base64url');
        const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
        const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0];
        if (host) staffLink = `${proto}://${host}/staff.html?token=${encodeURIComponent(`${body}.${sig}`)}`;
      }
    } catch (e) {
      console.error('[CaliSide WL] génération lien staff:', e);
    }

    return res.status(200).json({ ok: true, via: sent.via, staffLink, version: '3.2.0' });
  } catch (err) {
    console.error('[CaliSide WL] API 3.2 crash:', err);
    return res.status(500).json({
      ok: false,
      error: 'Erreur serveur CaliSide WL',
      detail: String(err?.stack || err?.message || err || 'Erreur inconnue').slice(0, 1500),
      version: '3.2.0'
    });
  }
}
