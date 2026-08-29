const crypto = require('crypto');

const trim=(v,n=1000)=>String(v??'').trim().slice(0,n);
const val=(v)=>Array.isArray(v)?v.join(', '):trim(v,1800);
const base64url=(obj)=>Buffer.from(JSON.stringify(obj)).toString('base64url');
const sign=(payload,secret)=>crypto.createHmac('sha256',secret).update(payload).digest('base64url');

function formatSlot(v){
  if(!v) return 'Non proposé';
  const d=new Date(v);
  if(Number.isNaN(d.getTime())) return trim(v,80);
  return new Intl.DateTimeFormat('fr-FR',{dateStyle:'full',timeStyle:'short',timeZone:'Europe/Paris'}).format(d);
}

function discordId(raw){
  const m=String(raw||'').match(/\d{15,22}/);
  return m?m[0]:'';
}

function addWait(url){
  return url.includes('?') ? `${url}&wait=true` : `${url}?wait=true`;
}

module.exports = async function handler(req,res){
  try {
  if(req.method!=='POST') return res.status(405).json({error:'Méthode non autorisée'});

  const CANDIDATE_CHANNEL_ID=process.env.DISCORD_CANDIDATE_CHANNEL_ID || '1542681337587179651';
  const botToken=process.env.DISCORD_BOT_TOKEN;
  const webhook=process.env.DISCORD_WEBHOOK_URL || '';

  const postCandidate=async(payload)=>{
    // Priorité au webhook : il est déjà lié au bon salon et évite les erreurs Discord 50001 Missing Access.
    if(webhook){
      const r=await fetch(addWait(webhook),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(r.ok || !botToken) return {response:r, via:'webhook'};
    }
    // Repli sur le bot si aucun webhook n'est configuré ou si le webhook échoue.
    if(botToken){
      const r=await fetch(`https://discord.com/api/v10/channels/${CANDIDATE_CHANNEL_ID}/messages`,{
        method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bot ${botToken}`},body:JSON.stringify(payload)
      });
      return {response:r, via:'bot'};
    }
    throw new Error('DISCORD_WEBHOOK_URL ou DISCORD_BOT_TOKEN manquant');
  };

  const patchCandidate=async(messageId,payload,via)=>{
    // On modifie le message avec le même mode que celui utilisé pour le créer.
    if(via==='webhook' && webhook){
      return fetch(`${webhook}/messages/${messageId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    }
    if(botToken){
      const r=await fetch(`https://discord.com/api/v10/channels/${CANDIDATE_CHANNEL_ID}/messages/${messageId}`,{
        method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bot ${botToken}`},body:JSON.stringify(payload)
      });
      if(r.ok || !webhook) return r;
    }
    if(webhook) return fetch(`${webhook}/messages/${messageId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    throw new Error('DISCORD_BOT_TOKEN ou DISCORD_WEBHOOK_URL manquant');
  };
  const staffPassword=process.env.CALISIDE_STAFF_PASSWORD || 'purple1616';
  if(!staffPassword) return res.status(503).json({error:'Configuration staff manquante sur Vercel'});

  const tokenSecret=crypto.createHash('sha256').update('caliside-wl-token:'+staffPassword).digest('hex');
  let b=req.body||{};

  // MODE TEST SERVEUR : permet de vérifier toute la chaîne formulaire -> API -> Discord
  // sans dépendre d'un champ HTML. Activé uniquement quand le front envoie _testMode=true.
  if (b._testMode === true || b._testMode === 'true' || b._testMode === '1') {
    const now = new Date();
    const slot1 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const slot2 = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    slot1.setUTCHours(18, 0, 0, 0); // ~20h Paris en été
    slot2.setUTCHours(19, 0, 0, 0); // ~21h Paris en été
    b = {
      ...b,
      pseudo: '[TEST] CaliSide',
      age: '25',
      discord: '123456789012345678',
      fivem: 'TEST-FIVEM-ID',
      experience: 'Plus de 2 ans',
      previousRp: 'Candidature automatique de test du workflow CaliSide WL.',
      character: 'Personnage test Californien avec projet RP civil durable et cohérent.',
      rpType: ['Civil', 'Entreprise'],
      goals: 'Tester le parcours complet de candidature et la réception Discord.',
      whyCaliSide: 'Test technique du formulaire CaliSide WL.',
      contribution: 'Test de la réception, du suivi staff et des statuts.',
      weeklyTime: '20 à 30 h',
      availability: ['Soir', 'Week-end'],
      constraints: 'Aucune — test technique.',
      freekill: 'Tuer sans raison RP valable.',
      nopain: 'Ignorer la douleur et les blessures de son personnage.',
      fear: 'Jouer la peur de manière crédible face à un danger.',
      meta: 'Utiliser en jeu des informations obtenues hors RP.',
      power: 'Forcer ou réaliser des actions irréalistes via les mécaniques du jeu.',
      crash: 'Je joue les conséquences et contacte les secours si nécessaire.',
      rulebreak: 'Je termine la scène si possible puis contacte le staff avec les preuves.',
      armedRobbery: 'Je respecte le Fear RP et coopère face à plusieurs personnes armées.',
      rpLoss: 'J’accepte la perte RP et poursuis l’évolution du personnage.',
      interviewSlot1: slot1.toISOString(),
      interviewSlot2: slot2.toISOString(),
      interviewNote: 'TEST SERVEUR AUTOMATIQUE — peut être supprimé.',
      rulesAccepted: 'true'
    };
  }

  // Compatibilité avec d'anciens noms de champs éventuels.
  if (!b.whyCaliSide && b.whyPurple) b.whyCaliSide = b.whyPurple;
  if (!b.interviewSlot1 && b.slot1) b.interviewSlot1 = b.slot1;
  if (!b.interviewSlot2 && b.slot2) b.interviewSlot2 = b.slot2;

  // Validation serveur tolérante : le navigateur valide déjà tous les champs.
  // Ici on évite les faux HTTP 400 provoqués par un champ vide/renommé ou un datetime-local mal parsé.
  // Une valeur absente est remplacée par une mention explicite au lieu de bloquer l'envoi.
  const defaults={
    pseudo:'Non renseigné', age:'Non renseigné', discord:'Non renseigné', experience:'Non renseigné',
    previousRp:'Non renseigné', character:'Non renseigné', rpType:['Non renseigné'], goals:'Non renseigné',
    whyCaliSide:'Non renseigné', contribution:'Non renseigné', weeklyTime:'Non renseigné', availability:['Non renseigné'],
    freekill:'Non renseigné', nopain:'Non renseigné', fear:'Non renseigné', meta:'Non renseigné', power:'Non renseigné',
    crash:'Non renseigné', rulebreak:'Non renseigné', armedRobbery:'Non renseigné', rpLoss:'Non renseigné'
  };
  for(const [k,v] of Object.entries(defaults)){
    const cur=b[k];
    const empty=Array.isArray(cur) ? cur.length===0 || cur.every(x=>!trim(x)) : !trim(cur);
    if(empty) b[k]=v;
  }

  const makeFutureSlot=(hours=24)=>{
    const d=new Date(Date.now()+hours*60*60*1000);
    d.setMinutes(0,0,0);
    return d.toISOString();
  };
  let slot1=new Date(b.interviewSlot1||'');
  if(Number.isNaN(slot1.getTime()) || slot1.getTime()<=Date.now()){
    b.interviewSlot1=makeFutureSlot(24);
    slot1=new Date(b.interviewSlot1);
  }
  if(b.interviewSlot2){
    let slot2=new Date(b.interviewSlot2);
    if(Number.isNaN(slot2.getTime()) || slot2.getTime()<=Date.now()) b.interviewSlot2=makeFutureSlot(48);
  }

  const did=discordId(b.discord);
  const allFields=[
    ['📌 Statut WL','🟡 **Candidature reçue — entretien vocal à planifier**'],
    ['👤 Candidat',`**Pseudo :** ${val(b.pseudo)}\n**Âge :** ${val(b.age)}\n**Discord :** ${val(b.discord)}${did?`\n**Mention :** <@${did}>`:''}\n**FiveM :** ${val(b.fivem)||'Non renseigné'}`],
    ['🎮 Expérience',`**Temps RP :** ${val(b.experience)}\n**Expériences précédentes :**\n${val(b.previousRp)}`],
    ['🎭 Projet personnage',val(b.character)],
    ['🧭 Type de RP',val(b.rpType)],
    ['🎯 Objectifs',val(b.goals)],
    ['💜 Apport à CaliSide',val(b.contribution)],
    ['🕒 Disponibilités',`**Temps/semaine :** ${val(b.weeklyTime)}\n**Disponibilités générales :** ${val(b.availability)}\n**Contraintes :** ${val(b.constraints)||'Aucune'}`],
    ['📚 Freekill',val(b.freekill)],
    ['📚 No Pain RP',val(b.nopain)],
    ['📚 Fear RP',val(b.fear)],
    ['📚 Metagaming',val(b.meta)],
    ['📚 PowerGaming',val(b.power)],
    ['🚗 Mise en situation — accident',val(b.crash)],
    ['⚖️ Mise en situation — règle cassée',val(b.rulebreak)],
    ['🔫 Mise en situation — braquage',val(b.armedRobbery)],
    ['📉 Mise en situation — accepter une perte RP',val(b.rpLoss)],
    ['🟣 Pourquoi CaliSide ?',val(b.whyCaliSide)],
    ['🎙️ Entretien vocal',`**Créneau 1 :** ${formatSlot(b.interviewSlot1)}\n**Créneau 2 :** ${formatSlot(b.interviewSlot2)}\n**Note :** ${val(b.interviewNote)||'Aucune'}\n\n**Gestion staff :** génération du lien...`]
  ].map(([name,value])=>({name,value:trim(value,1024),inline:false}));

  // IMPORTANT : Discord limite à ~6000 caractères la somme de TOUS les embeds d'un même message.
  // On garde donc un message principal court (celui qui sera modifié par le panel staff)
  // puis on envoie les réponses détaillées dans des messages séparés.
  const mainFields=[allFields[0],allFields[1],allFields[2],allFields[7],allFields[18]];
  const mainEmbed={
    title:'🟣 Nouvelle candidature WhiteList — CaliSide WL',
    description:'Candidature écrite reçue. Le prochain statut sera la confirmation de l’entretien vocal, puis la décision WL définitive.',
    color:11152639,
    fields:mainFields,
    footer:{text:'CaliSide WL • WL EN COURS'},
    timestamp:new Date().toISOString()
  };

  const detailFields=allFields.slice(3,18);
  const detailGroups=[];
  for(let i=0;i<detailFields.length;i+=4) detailGroups.push(detailFields.slice(i,i+4));
  const staffRoles=String(process.env.DISCORD_STAFF_ROLE_IDS||'').split(',').map(v=>v.trim()).filter(v=>/^\d{17,20}$/.test(v));
  const roleMentions=staffRoles.map(id=>`<@&${id}>`).join(' ');
  const content=`${roleMentions?roleMentions+'\n':''}Nouvelle candidature WhiteList${did?` de <@${did}>`:''}`;

  const sent=await postCandidate({
      content,
      allowed_mentions:{roles:staffRoles,users:did?[did]:[]},
      embeds:[mainEmbed]
    });
  const first=sent.response;

  if(!first.ok){
    const txt=await first.text();
    return res.status(502).json({error:'Discord a refusé le message',detail:txt.slice(0,1000),status:first.status});
  }

  const created=await first.json().catch(()=>null);
  const messageId=created?.id;
  if(!messageId) return res.status(502).json({error:'Discord n’a pas renvoyé l’identifiant de la candidature'});

  // Réponses détaillées en messages séparés pour ne jamais dépasser la limite Discord des embeds.
  for(let i=0;i<detailGroups.length;i++){
    const detailPayload={
      content:`📄 Détails candidature — ${trim(b.pseudo,40)} (${i+1}/${detailGroups.length})`,
      allowed_mentions:{parse:[]},
      embeds:[{title:`🟣 Réponses détaillées ${i+1}/${detailGroups.length}`,color:11152639,fields:detailGroups[i]}]
    };
    const d=await postCandidate(detailPayload);
    if(!d.response.ok){
      const txt=await d.response.text();
      console.error('[CaliSide WL] Détail Discord refusé:',d.response.status,txt.slice(0,500));
      // On ne bloque pas la candidature principale si un message de détail échoue.
    }
  }

  const payloadObj={
    pseudo:trim(b.pseudo,40),
    discord:trim(b.discord,80),
    discordId:did,
    slot1:trim(b.interviewSlot1,80),
    slot2:trim(b.interviewSlot2,80),
    messageId,
    createdAt:Date.now()
  };
  const encoded=base64url(payloadObj);
  const token=`${encoded}.${sign(encoded,tokenSecret)}`;
  const proto=(req.headers['x-forwarded-proto']||'https').split(',')[0];
  const host=(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0];
  const base=host?`${proto}://${host}`:'';
  const staffLink=base?`${base}/staff.html?token=${encodeURIComponent(token)}`:'Lien staff disponible après déploiement';

  const patchedEmbeds=[{
    ...mainEmbed,
    fields:(mainEmbed.fields||[]).map(f=>f.name==='🎙️ Entretien vocal'?{
      ...f,
      value:trim(`**Créneau 1 :** ${formatSlot(b.interviewSlot1)}\n**Créneau 2 :** ${formatSlot(b.interviewSlot2)}\n**Note :** ${val(b.interviewNote)||'Aucune'}\n\n**Gestion staff :** ${staffLink}`,1024)
    }:f)
  }];

  const patch=await patchCandidate(messageId,{content,allowed_mentions:{roles:staffRoles,users:did?[did]:[]},embeds:patchedEmbeds},sent.via);
  if(!patch.ok){
    const txt=await patch.text();
    return res.status(502).json({error:'Candidature envoyée mais lien staff impossible à ajouter',detail:txt.slice(0,200)});
  }

  return res.status(200).json({ok:true,version:'FIX-500-CJS-2026-08-29'});
  } catch (err) {
    console.error('[CaliSide WL] API crash:', err && err.stack ? err.stack : err);
    return res.status(500).json({
      error:'Erreur serveur CaliSide WL',
      detail: String((err && (err.stack || err.message)) || err || 'Erreur inconnue').slice(0,1500),
      version:'FIX-500-CJS-2026-08-29'
    });
  }
}
