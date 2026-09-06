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


const DEFAULT_GUILD_ID = '1429963172458139691';
const DEFAULT_CANDIDATE_CHANNEL_ID = '1542681337587179651';

async function botApi(path, options = {}) {
  const botToken = String(process.env.DISCORD_BOT_TOKEN || '').trim();
  if (!botToken) return { ok: false, status: 0, body: { message: 'DISCORD_BOT_TOKEN manquant' } };
  const r = await fetch(`https://discord.com/api/v10${path}`, {
    ...options,
    headers: { Authorization: `Bot ${botToken}`, ...(options.headers || {}) }
  });
  const raw = await r.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  return { ok: r.ok, status: r.status, body, raw };
}


function staffRoleMentions() {
  const raw = String(process.env.DISCORD_STAFF_ROLE_IDS || '').trim();
  if (!raw) return '';

  const ids = raw
    .split(/[,\s;]+/)
    .map((v) => String(v || '').trim())
    .filter((v) => /^\d{17,20}$/.test(v));

  return [...new Set(ids)].map((id) => `<@&${id}>`).join(' ');
}

function staffRoleIds() {
  const raw = String(process.env.DISCORD_STAFF_ROLE_IDS || '').trim();
  if (!raw) return [];

  return [...new Set(
    raw.split(/[,\s;]+/)
      .map((v) => String(v || '').trim())
      .filter((v) => /^\d{17,20}$/.test(v))
  )];
}


function privateChannelName(pseudo, discordId) {
  const base = String(pseudo || 'candidat')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 45) || 'candidat';
  const suffix = String(discordId || '').slice(-4) || Math.random().toString(36).slice(2, 6);
  return `wl-ecrite-attente-${base}-${suffix}`.slice(0, 90);
}

async function createPrivateCandidateChannel({ discordId, pseudo }) {
  const botToken = String(process.env.DISCORD_BOT_TOKEN || '').trim();
  const guildId = String(process.env.DISCORD_GUILD_ID || DEFAULT_GUILD_ID).trim();
  const candidateChannelId = String(process.env.DISCORD_CANDIDATE_CHANNEL_ID || DEFAULT_CANDIDATE_CHANNEL_ID).trim();

  if (!botToken) throw new Error('DISCORD_BOT_TOKEN manquant : impossible de créer le salon privé de candidature.');
  if (!/^\d{17,20}$/.test(String(discordId || ''))) throw new Error('ID Discord candidat invalide : impossible de créer son salon privé.');

  const botMe = await botApi('/users/@me');
  if (!botMe.ok) {
    const msg = typeof botMe.body === 'object' && botMe.body ? botMe.body.message || JSON.stringify(botMe.body) : String(botMe.body || '');
    throw new Error(`Impossible d'identifier le bot Discord configuré dans Vercel (Discord ${botMe.status}) : ${msg}`);
  }

  const botName = `${botMe.body?.username || 'Bot'}${botMe.body?.discriminator && botMe.body.discriminator !== '0' ? '#' + botMe.body.discriminator : ''}`;
  const botId = String(botMe.body?.id || '');

  let parentId = String(process.env.DISCORD_WL_PRIVATE_CATEGORY_ID || '').trim();
  if (!parentId && /^\d{17,20}$/.test(candidateChannelId)) {
    const info = await botApi(`/channels/${candidateChannelId}`);
    if (info.ok && info.body?.parent_id) parentId = String(info.body.parent_id);
  }

  if (!/^\d{17,20}$/.test(parentId)) {
    throw new Error(`DISCORD_WL_PRIVATE_CATEGORY_ID invalide ou absent. Bot utilisé : ${botName} (${botId}).`);
  }

  const category = await botApi(`/channels/${parentId}`);
  if (!category.ok) {
    const msg = typeof category.body === 'object' && category.body ? category.body.message || JSON.stringify(category.body) : String(category.body || '');
    throw new Error(`Catégorie privée inaccessible pour ${botName} (${botId}) — Discord ${category.status} : ${msg}`);
  }

  if (String(category.body?.guild_id || '') !== guildId) {
    throw new Error(`La catégorie ${parentId} n'appartient pas au serveur ${guildId}. Bot utilisé : ${botName} (${botId}).`);
  }

  const payload = {
    name: privateChannelName(pseudo, discordId),
    type: 0,
    topic: `Candidature WL privée de ${pseudo} • Discord ${discordId} • visible uniquement par le candidat et le staff`,
    parent_id: parentId
  };

  const created = await botApi(`/guilds/${guildId}/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!created.ok) {
    const msg = typeof created.body === 'object' && created.body ? created.body.message || JSON.stringify(created.body) : String(created.body || '');
    if (created.status === 403) {
      throw new Error(`Discord 403 lors de la création. Bot réellement utilisé : ${botName} (${botId}). Vérifie que CE bot a Voir les salons + Gérer les salons sur la catégorie ${parentId}. Détail Discord : ${msg}`);
    }
    throw new Error(`Impossible de créer le salon privé WL avec ${botName} (${botId}) — Discord ${created.status} : ${msg}`);
  }

  const channelId = String(created.body?.id || '');
  if (!channelId) throw new Error(`Discord n'a pas renvoyé l'ID du salon créé. Bot : ${botName} (${botId}).`);

  const candidateAllow = String(1024 + 2048 + 16384 + 32768 + 65536);
  const candidatePermission = await botApi(`/channels/${channelId}/permissions/${discordId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 1, allow: candidateAllow, deny: '0' })
  });

  if (!candidatePermission.ok) {
    try { await botApi(`/channels/${channelId}`, { method: 'DELETE' }); } catch {}
    const msg = typeof candidatePermission.body === 'object' && candidatePermission.body ? candidatePermission.body.message || JSON.stringify(candidatePermission.body) : String(candidatePermission.body || '');

    if (candidatePermission.status === 403) {
      throw new Error(`Salon créé mais impossible d'autoriser le candidat. Bot utilisé : ${botName} (${botId}). Mets Gérer les permissions en vert pour ce bot dans la catégorie ${parentId}. Détail : ${msg}`);
    }
    if (candidatePermission.status === 404) {
      throw new Error(`Le candidat Discord ${discordId} n'est pas accessible dans le serveur. Vérifie qu'il a bien rejoint le Discord CaliSide avant d'envoyer sa candidature.`);
    }
    throw new Error(`Impossible d'ajouter le candidat au salon privé (Discord ${candidatePermission.status}) : ${msg}`);
  }

  return { ...created.body, _calisideBotName: botName, _calisideBotId: botId };
}

async function deleteChannelQuietly(channelId) {
  if (!channelId) return;
  try { await botApi(`/channels/${channelId}`, { method: 'DELETE' }); } catch {}
}

async function postPrivateApplication(channelId, candidateId, embed, staffLink) {
  const DEFAULT_STAFF_ROLE_IDS = [
    '1528038923971068005', // Gérant Modérateur
    '1429963172831432788', // Responsable Staff
    '1474198609967710261', // Gérant Légal
    '1429963172831432785', // Gérant Illégal
    '1429963172831432786'  // Modérateur
  ];
  const envStaffRoles = String(process.env.DISCORD_STAFF_ROLE_IDS || '')
    .split(',').map(v => v.trim()).filter(v => /^\d{17,20}$/.test(v));
  const staffRoles = [...new Set([...DEFAULT_STAFF_ROLE_IDS, ...envStaffRoles])];
  const privacyEmbed = {
    title: '🟡 Candidature écrite — En attente de validation',
    description: '🔒 Ce salon est **privé** : seuls **toi et le staff CaliSide** peuvent voir son contenu. Les autres candidats ne voient pas ton dossier.\n\n📝 **Étape 1 — Étude écrite**\nTa candidature écrite a bien été reçue et elle est actuellement **en attente d’étude et de validation par le staff CaliSide**.\n\n✅ **Si ton écrit est accepté :**\n• tu passeras officiellement à la deuxième étape ;\n• ce même salon privé deviendra ton **ticket d’entretien vocal WL** ;\n• le staff choisira l’un des créneaux que tu as proposés ;\n• tu recevras ici la **date et l’heure** retenues pour ton entretien.\n\n❌ **Si ton écrit est refusé :**\n• tu seras informé directement dans ce salon ;\n• ton dossier sera clôturé et ne passera pas à l’entretien vocal.\n\n📋 **Parcours WL :** Écrit reçu → Étude staff → Entretien vocal → Décision finale → Rôle CaliSide WL.',
    color: 11152639,
    fields: [
      ...(embed.fields || []),
      ...(staffLink ? [{ name: '🛡️ Suivi staff', value: 'Le lien de gestion est réservé au staff. Les décisions seront publiées directement dans ce salon.', inline: false }] : [])
    ],
    footer: { text: 'CaliSide WL • Écrit en attente de validation • API 4.3.0' },
    thumbnail: embed.thumbnail || undefined,
    timestamp: new Date().toISOString()
  };
  const sent = await botApi(`/channels/${channelId}/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: staffRoleMentions() ? `${staffRoleMentions()} • Nouvelle candidature WL` : 'Nouvelle candidature WL',
      allowed_mentions: { roles: staffRoleIds(), parse: [] },
      content: `<@${candidateId}> bienvenue dans ton espace de suivi WhiteList. 🔒\n\n🛡️ **Staff WL :** ${staffRoles.map(id => `<@&${id}>`).join(' ')}`,
      allowed_mentions: { users: [String(candidateId)], roles: staffRoles },
      embeds: [privacyEmbed]
    })
  });
  if (!sent.ok) throw new Error(`Salon privé créé mais impossible d’y publier la candidature (Discord ${sent.status}).`);
}


async function discordPost(payload) {
  const webhook = String(process.env.DISCORD_WEBHOOK_URL || '').trim();
  const botToken = String(process.env.DISCORD_BOT_TOKEN || '').trim();
  const channelId = String(process.env.DISCORD_CANDIDATE_CHANNEL_ID || DEFAULT_CANDIDATE_CHANNEL_ID).trim();

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


async function discordPatch(messageId, payload, via) {
  const webhook = String(process.env.DISCORD_WEBHOOK_URL || '').trim();
  const botToken = String(process.env.DISCORD_BOT_TOKEN || '').trim();
  const channelId = String(process.env.DISCORD_CANDIDATE_CHANNEL_ID || DEFAULT_CANDIDATE_CHANNEL_ID).trim();

  let url = '';
  const headers = { 'Content-Type': 'application/json' };
  if (via === 'webhook' && webhook) {
    url = `${webhook}/messages/${messageId}`;
  } else if (botToken && channelId) {
    url = `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`;
    headers.Authorization = `Bot ${botToken}`;
  } else {
    return { ok: false, status: 0, raw: 'Impossible de modifier le message Discord : configuration absente.' };
  }

  const r = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(payload) });
  const raw = await r.text();
  return { ok: r.ok, status: r.status, raw };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, service: 'CaliSide submit', version: '4.2.0' });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ ok: false, error: 'Méthode non autorisée', version: '4.2.0' });
    }

    let b = safeJsonBody(req);
    const testMode = b._testMode === true || b._testMode === 'true' || b._testMode === '1';

    if (testMode) {
      b = {
        ...b,
        pseudo: '[TEST] CaliSide', age: '25', discord: '1327939471072563272', fivem: 'TEST-FIVEM-ID',
        experience: 'Plus de 2 ans', previousRp: 'Candidature automatique de test CaliSide WL.',
        character: 'Personnage de test avec projet RP civil durable et cohérent.',
        rpType: ['Civil', 'Entreprise'], goals: 'Tester le workflow complet de candidature.',
        whyCaliSide: 'Test technique CaliSide WL.', contribution: 'Test du workflow Discord et staff.',
        fear: 'Jouer la peur de manière crédible face au danger.',
        meta: 'Ne pas utiliser en RP une information obtenue HRP.',
        armedRobbery: 'Je respecte la peur et je coopère tant que ma vie est menacée.',
        interviewSlot1: futureIso(24), interviewSlot2: futureIso(48),
        interviewNote: 'TEST AUTOMATIQUE CaliSide WL', rulesAccepted: 'true'
      };
    }

    if (!b.whyCaliSide && b.whyPurple) b.whyCaliSide = b.whyPurple;

    const did = getDiscordId(b.discord);
    const pseudo = text(b.pseudo || 'Non renseigné', 40);

    let privateChannel = null;
    try {
      privateChannel = await createPrivateCandidateChannel({ discordId: did, pseudo });
    } catch (e) {
      return res.status(502).json({ ok:false, error:'Création du salon privé impossible', detail:String(e?.message || e), version:'4.5.0' });
    }

    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'caliside-wl-x9je.vercel.app').split(',')[0].trim();
    const logoUrl = `${proto}://${host}/caliside-logo.png?v=4.5`;

    const mainEmbed = {
      title: '🟣 Nouvelle candidature WhiteList — CaliSide WL',
      color: 11152639,
      image: { url: logoUrl },
      description: testMode
        ? '🧪 **Candidature TEST** reçue par l’API V4.5.'
        : '📝 **Nouvelle candidature écrite** reçue.',
      fields: [
        { name: '📌 Statut WL', value: '🟡 **Candidature reçue — en attente d’étude écrite**', inline: false },
        { name: '👤 Candidat', value: `**Pseudo :** ${pseudo}\n**Âge :** ${text(b.age || 'Non renseigné', 30)}\n**Discord :** ${text(b.discord || 'Non renseigné', 80)}${did ? `\n**Mention :** <@${did}>` : ''}\n**FiveM :** ${text(b.fivem || 'Non renseigné', 100)}`, inline: false },
        { name: '🎮 Expérience RP', value: text(b.experience || 'Non renseignée', 250), inline: false },
        { name: '🎭 Projet RP', value: text(b.character || 'Non renseigné', 900), inline: false },
        { name: '🧭 RP recherché', value: arrayText(b.rpType || 'Non renseigné', 500), inline: false },
        { name: '💜 Pourquoi CaliSide ?', value: text(b.whyCaliSide || 'Non renseigné', 700), inline: false },
        { name: '📚 Question RP 1 — Fear RP', value: text(b.fear || 'Non renseigné', 700), inline: false },
        { name: '📚 Question RP 2 — Metagaming', value: text(b.meta || 'Non renseigné', 700), inline: false },
        { name: '🎬 Mise en situation — Braquage', value: text(b.armedRobbery || 'Non renseigné', 900), inline: false },
        { name: '🎙️ Entretien (facultatif)', value: `**Créneau 1 :** ${b.interviewSlot1 ? formatSlot(b.interviewSlot1) : 'Non proposé'}\n**Créneau 2 :** ${b.interviewSlot2 ? formatSlot(b.interviewSlot2) : 'Non proposé'}\n**Note :** ${text(b.interviewNote || 'Aucune', 400)}`, inline: false },
        { name: '🔒 Salon privé candidat', value: `<#${privateChannel.id}>\nVisible uniquement par le candidat et le staff autorisé.`, inline: false }
      ],
      footer: { text: 'CaliSide WL • Candidature reçue • API 4.5.0' },
      timestamp: new Date().toISOString()
    };

    // GARANTIE V4.0 : la candidature doit d'abord être publiée dans le salon privé du joueur.
    // Si cette étape échoue, on annule tout au lieu de continuer avec seulement les salons staff.
    try {
      await postPrivateApplication(privateChannel.id, did, mainEmbed, null);
    } catch (e) {
      await deleteChannelQuietly(privateChannel?.id);
      return res.status(502).json({
        ok: false,
        error: 'Le salon privé a été créé mais la candidature n’a pas pu être publiée dedans',
        detail: String(e?.message || e),
        version: '4.2.0'
      });
    }

    const staffRoles = String(process.env.DISCORD_STAFF_ROLE_IDS || '')
      .split(',').map(v => v.trim()).filter(v => /^\d{17,20}$/.test(v));

    // Le salon partagé sert UNIQUEMENT de journal staff. Aucune mention candidat ici.
    const payload = {
      content: `${staffRoles.map(id => `<@&${id}>`).join(' ')}${staffRoles.length ? '\n' : ''}🔒 Nouvelle candidature privée de **${pseudo}** • dossier <#${privateChannel.id}>`,
      allowed_mentions: { roles: staffRoles, users: [] },
      embeds: [mainEmbed]
    };

    const sent = await discordPost(payload);
    if (!sent.ok) {
      // Le salon privé existe déjà et contient la candidature : on NE le supprime pas.
      // On renvoie une erreur claire pour signaler uniquement le journal staff.
      return res.status(502).json({
        ok: false,
        error: 'Candidature privée créée, mais impossible de publier le journal staff',
        detail: String(sent.raw || '').slice(0, 1200),
        privateChannelId: privateChannel.id,
        discordStatus: sent.status,
        via: sent.via,
        version: '4.2.0'
      });
    }

    // Génère le lien staff signé et l'ajoute uniquement au journal staff.
    let staffLink = null;
    let staffLinkPosted = false;
    let staffLinkError = null;
    try {
      const messageId = sent.data?.id || '';
      const staffPassword = String(process.env.CALISIDE_STAFF_PASSWORD || '').trim();
      if (!staffPassword) {
        staffLinkError = 'CALISIDE_STAFF_PASSWORD manquant dans Vercel';
      } else if (!messageId) {
        staffLinkError = 'Discord n’a pas renvoyé de messageId';
      } else {
        const body = Buffer.from(JSON.stringify({ pseudo, discord: text(b.discord, 80), discordId: did, messageId, privateChannelId: String(privateChannel?.id || ''), slot1: b.interviewSlot1, slot2: b.interviewSlot2, createdAt: Date.now() })).toString('base64url');
        const secret = createHash('sha256').update(`caliside-wl-token:${staffPassword}`).digest('hex');
        const sig = createHmac('sha256', secret).update(body).digest('base64url');
        const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
        const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0];
        if (host) {
          staffLink = `${proto}://${host}/staff.html?token=${encodeURIComponent(`${body}.${sig}`)}`;
          const staffEmbed = {
            ...mainEmbed,
            fields: [
              ...mainEmbed.fields,
              { name: '🔐 Gestion staff', value: `[**Ouvrir le panel staff**](${staffLink})\nÉtudier l’écrit, choisir le créneau, valider/refuser la WL.`, inline: false }
            ],
            footer: { text: 'CaliSide WL • Journal staff • Panel actif • API 4.1.0' }
          };
          const patched = await discordPatch(messageId, { ...payload, embeds: [staffEmbed] }, sent.via);
          staffLinkPosted = patched.ok;
          if (!patched.ok) staffLinkError = `Discord PATCH ${patched.status}: ${String(patched.raw || '').slice(0,300)}`;
        }
      }
    } catch (e) {
      staffLinkError = String(e?.message || e);
      console.error('[CaliSide WL] génération/ajout lien staff:', e);
    }

    return res.status(200).json({ ok: true, via: sent.via, staffLink, staffLinkPosted, staffLinkError, privateChannelId: privateChannel.id, privatePosted: true, version: '4.2.0' });
  } catch (err) {
    console.error('[CaliSide WL] API 4.0 crash:', err);
    return res.status(500).json({
      ok: false,
      error: 'Erreur serveur CaliSide WL',
      detail: String(err?.stack || err?.message || err || 'Erreur inconnue').slice(0, 1500),
      version: '4.2.0'
    });
  }
}
