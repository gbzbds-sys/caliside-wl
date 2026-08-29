import crypto from 'crypto';

const API_VERSION='v4.3-private-flow-access-logo-2026-08-29';

function logoUrlFromReq(req){
  const proto=String(req.headers?.['x-forwarded-proto']||'https').split(',')[0].trim();
  const host=String(req.headers?.['x-forwarded-host']||req.headers?.host||'caliside-wl-x9je.vercel.app').split(',')[0].trim();
  return `${proto}://${host}/caliside-logo.png?v=4.5`;
}

const trim=(v,n=1000)=>String(v??'').trim().slice(0,n);
const sign=(payload,secret)=>crypto.createHmac('sha256',secret).update(payload).digest('base64url');

function secrets(){
  const password=process.env.CALISIDE_STAFF_PASSWORD;
  if(!password) throw new Error('Configuration staff manquante');
  return {
    tokenSecret:crypto.createHash('sha256').update('caliside-wl-token:'+password).digest('hex'),
    cookieSecret:crypto.createHash('sha256').update('caliside-wl-cookie:'+password).digest('hex')
  };
}

function decodeToken(token,secret){
  const [payload,sig]=String(token||'').split('.');
  if(!payload||!sig) throw new Error('Lien de validation invalide');
  const expected=sign(payload,secret);
  const a=Buffer.from(sig); const b=Buffer.from(expected);
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) throw new Error('Lien de validation invalide');
  const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
  if(!data.createdAt || Date.now()-Number(data.createdAt)>1000*60*60*24*30) throw new Error('Ce lien a expiré');
  if(!data.messageId) throw new Error('Ancienne candidature : renvoie une nouvelle candidature pour utiliser le suivi complet');
  return data;
}

function parseCookies(req){
  const out={};
  String(req.headers.cookie||'').split(';').forEach(part=>{
    const i=part.indexOf('='); if(i<0)return;
    out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());
  });
  return out;
}

function authOk(req,cookieSecret){
  const raw=parseCookies(req).pc_staff_session||'';
  const [payload,sig]=raw.split('.');
  if(!payload||!sig) return false;
  const expected=sign(payload,cookieSecret);
  try{
    const a=Buffer.from(sig); const b=Buffer.from(expected);
    if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return false;
    const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    return data.exp && Date.now()<data.exp;
  }catch{return false}
}

function formatSlot(v){
  const d=new Date(v);
  if(Number.isNaN(d.getTime())) return trim(v,80);
  return new Intl.DateTimeFormat('fr-FR',{dateStyle:'full',timeStyle:'short',timeZone:'Europe/Paris'}).format(d);
}

const CANDIDATE_CHANNEL_ID=process.env.DISCORD_CANDIDATE_CHANNEL_ID || '1542681337587179651';
const PENDING_CHANNEL_ID='1542681439701831720';
const APPROVED_CHANNEL_ID='1543268691720798279';
const REJECTED_CHANNEL_ID='1543268925184151593';
const candidacyWebhook=()=>String(process.env.DISCORD_WEBHOOK_URL || '').trim();
const webhookMessageUrl=(messageId)=>{
  const wh=candidacyWebhook();
  if(!wh) return '';
  return `${wh.split('?')[0]}/messages/${messageId}`;
};
const notifyWebhook=()=>process.env.DISCORD_INTERVIEW_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || '';

const WL_ROLE_ID=process.env.DISCORD_WL_ROLE_ID || '1543261181072904264';
const DEFAULT_GUILD_ID='1429963172458139691';

async function discordApi(path, options={}){
  const botToken=process.env.DISCORD_BOT_TOKEN;
  const r=await fetch(`https://discord.com/api/v10${path}`,{
    ...options,
    headers:{Authorization:`Bot ${botToken}`,...(options.headers||{})}
  });
  const text=await r.text();
  let body=null;
  try{body=text?JSON.parse(text):null}catch{body=text}
  return {ok:r.ok,status:r.status,body};
}

async function assignWhitelistRole(discordUserId){
  const botToken=process.env.DISCORD_BOT_TOKEN;
  const guildId=process.env.DISCORD_GUILD_ID || DEFAULT_GUILD_ID;
  if(!discordUserId) throw new Error('ID Discord du joueur manquant : impossible d’attribuer le rôle WL');
  if(!/^\d{17,20}$/.test(String(discordUserId))) throw new Error('ID Discord joueur invalide : '+String(discordUserId));
  if(!botToken || !guildId) throw new Error('Attribution automatique du rôle WL non configurée : vérifie DISCORD_BOT_TOKEN et DISCORD_GUILD_ID dans Vercel');
  if(!/^\d{17,20}$/.test(String(guildId))) throw new Error('DISCORD_GUILD_ID invalide : '+String(guildId));

  // 1) Vérifie que le token correspond bien à un bot Discord valide.
  const me=await discordApi('/users/@me');
  if(!me.ok){
    if(me.status===401) throw new Error('Discord 401 : DISCORD_BOT_TOKEN invalide ou ancien token. Remplace-le dans Vercel puis redeploy.');
    throw new Error(`Discord ${me.status} : impossible d’identifier le bot`);
  }

  // 2) Vérifie que le bot est bien connecté au serveur configuré.
  const guild=await discordApi(`/guilds/${guildId}`);
  if(!guild.ok){
    if(guild.status===404) throw new Error(`Discord 404 : serveur ${guildId} introuvable pour ce bot. DISCORD_GUILD_ID est probablement incorrect.`);
    if(guild.status===403) throw new Error(`Discord 403 : le bot n’a pas accès au serveur ${guildId}. Vérifie que ce bot est bien installé sur CaliSide.`);
    throw new Error(`Discord ${guild.status} : impossible de lire le serveur configuré`);
  }

  // 3) Vérifie que le joueur est réellement membre du serveur configuré.
  const before=await discordApi(`/guilds/${guildId}/members/${discordUserId}`);
  if(!before.ok){
    if(before.status===404) throw new Error(`Discord 404 : le joueur ${discordUserId} n’est pas membre du serveur configuré (${guildId}), ou DISCORD_GUILD_ID est incorrect.`);
    if(before.status===403) throw new Error('Discord 403 : le bot ne peut pas lire le membre sur ce serveur. Vérifie qu’il est bien installé sur CaliSide.');
    throw new Error(`Discord ${before.status} : impossible de lire le membre avant attribution`);
  }

  // 4) Vérifie que le rôle existe bien sur CE serveur et que la hiérarchie est correcte.
  const roles=await discordApi(`/guilds/${guildId}/roles`);
  if(!roles.ok) throw new Error(`Discord ${roles.status} : impossible de lire les rôles du serveur`);
  const targetRole=Array.isArray(roles.body)?roles.body.find(r=>String(r.id)===String(WL_ROLE_ID)):null;
  if(!targetRole) throw new Error(`Le rôle WL ${WL_ROLE_ID} n’existe pas sur le serveur ${guildId}. Vérifie DISCORD_GUILD_ID ou DISCORD_WL_ROLE_ID.`);

  const botMember=await discordApi(`/guilds/${guildId}/members/${me.body.id}`);
  if(!botMember.ok) throw new Error(`Discord ${botMember.status} : le bot n’est pas membre du serveur configuré (${guildId})`);
  const botRoleIds=new Set((botMember.body?.roles||[]).map(String));
  const botRoles=Array.isArray(roles.body)?roles.body.filter(r=>botRoleIds.has(String(r.id))):[];
  const highestBotPosition=botRoles.reduce((m,r)=>Math.max(m,Number(r.position)||0),0);
  const targetPosition=Number(targetRole.position)||0;
  if(highestBotPosition<=targetPosition){
    throw new Error(`Hiérarchie Discord incorrecte : le rôle du bot doit être AU-DESSUS de “${targetRole.name}”. Position bot=${highestBotPosition}, rôle WL=${targetPosition}.`);
  }

  // Si le membre possède déjà le rôle, on considère l’opération réussie.
  if((before.body?.roles||[]).map(String).includes(String(WL_ROLE_ID))){
    return {assigned:true,alreadyHadRole:true,roleId:WL_ROLE_ID,roleName:targetRole.name,userId:String(discordUserId),userTag:`${before.body?.user?.username||discordUserId}`,guildId, guildName:guild.body?.name||guildId, bot:`${me.body.username}#${me.body.discriminator||'0'}`};
  }

  // 5) Attribution réelle du rôle.
  const put=await discordApi(`/guilds/${guildId}/members/${discordUserId}/roles/${WL_ROLE_ID}`,{method:'PUT'});
  if(!put.ok){
    const details=typeof put.body==='object'&&put.body?`${put.body.message||''} (code ${put.body.code||'?'})`:String(put.body||'');
    if(put.status===401) throw new Error('Discord 401 : token du bot invalide. Mets le nouveau DISCORD_BOT_TOKEN dans Vercel et redeploy.');
    if(put.status===403) throw new Error(`Discord 403 : permission/hiérarchie insuffisante pour attribuer “${targetRole.name}”. ${details}`);
    if(put.status===404) throw new Error(`Discord 404 : serveur, joueur ou rôle introuvable. ${details}`);
    throw new Error(`Discord ${put.status} : impossible d’attribuer le rôle WL. ${details}`);
  }

  // 6) CONTRÔLE FINAL : on relit le membre et on exige que le rôle soit présent.
  const after=await discordApi(`/guilds/${guildId}/members/${discordUserId}`);
  if(!after.ok) throw new Error(`Le rôle a été envoyé à Discord mais la vérification du membre a échoué (HTTP ${after.status}).`);
  const hasRole=(after.body?.roles||[]).map(String).includes(String(WL_ROLE_ID));
  if(!hasRole){
    throw new Error(`Discord a accepté la requête mais le rôle “${targetRole.name}” (${WL_ROLE_ID}) n’est PAS présent sur le membre ${discordUserId} après vérification.`);
  }

  return {assigned:true,alreadyHadRole:false,roleId:WL_ROLE_ID,roleName:targetRole.name,userId:String(discordUserId),userTag:`${after.body?.user?.username||discordUserId}`,guildId, guildName:guild.body?.name||guildId, bot:`${me.body.username}#${me.body.discriminator||'0'}`};
}


async function channelApi(channelId,path='',options={}){
  const botToken=process.env.DISCORD_BOT_TOKEN;
  if(!botToken) return {ok:false,status:0,text:async()=> 'DISCORD_BOT_TOKEN manquant'};
  return fetch(`https://discord.com/api/v10/channels/${channelId}/messages${path}`,{
    ...options,
    headers:{Authorization:`Bot ${botToken}`,...(options.headers||{})}
  });
}

async function sendStatusLog(channelId,label,payload){
  const botToken=process.env.DISCORD_BOT_TOKEN;
  if(!botToken) throw new Error(`DISCORD_BOT_TOKEN manquant : impossible d’envoyer la notification dans ${label}`);
  const r=await channelApi(channelId,'',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!r.ok){const txt=await r.text();throw new Error(`Impossible d’envoyer la notification dans ${label} : `+txt.slice(0,160))}
  return r;
}

async function getCandidacy(messageId){
  // Les candidatures sont créées par le webhook quand DISCORD_WEBHOOK_URL est présent.
  // On relit donc d'abord via CE webhook afin de garder le même auteur/origine du message.
  const whUrl=webhookMessageUrl(messageId);
  if(whUrl){
    const wr=await fetch(whUrl);
    if(wr.ok) return wr.json();
  }
  const r=await channelApi(CANDIDATE_CHANNEL_ID,`/${messageId}`);
  if(!r.ok) throw new Error('Impossible de récupérer la candidature Discord');
  return r.json();
}

function readState(message){
  const embed=message?.embeds?.[0]||{};
  const fields=Array.isArray(embed.fields)?embed.fields:[];
  const statusField=fields.find(f=>f.name==='📌 Statut WL');
  const chosenField=fields.find(f=>f.name==='🎙️ Entretien retenu');
  const reasonField=fields.find(f=>f.name==='📝 Motif du refus');
  const statusText=String(statusField?.value||'');
  let status='submitted';
  if(statusText.includes('WL TERMINÉE — VALIDÉE')) status='approved';
  else if(statusText.includes('WL TERMINÉE — REFUSÉE')) status='rejected';
  else if(statusText.includes('Entretien vocal confirmé')) status='interview_confirmed';
  return {
    status,
    statusText,
    chosen:chosenField?.value||'',
    reason:reasonField?.value||''
  };
}

function upsertField(fields,name,value){
  const out=[...(fields||[])];
  const idx=out.findIndex(f=>f.name===name);
  const field={name,value:trim(value,1024),inline:false};
  if(idx>=0) out[idx]=field; else out.unshift(field);
  return out;
}

async function patchCandidacy(messageId,message,changes={}){
  const old=message?.embeds?.[0]||{};
  let fields=Array.isArray(old.fields)?old.fields:[];
  if(changes.status) fields=upsertField(fields,'📌 Statut WL',changes.status);
  if(changes.chosen) fields=upsertField(fields,'🎙️ Entretien retenu',changes.chosen);
  if(changes.reason!==undefined){
    fields=fields.filter(f=>f.name!=='📝 Motif du refus');
    if(changes.reason) fields=upsertField(fields,'📝 Motif du refus',changes.reason);
  }
  const embed={
    ...old,
    title:changes.title||old.title,
    description:changes.description||old.description,
    color:changes.color??old.color,
    fields,
    footer:{text:changes.footer||old.footer?.text||'CaliSide WL • WhiteList'},
    timestamp:new Date().toISOString()
  };
  // Conserve les autres parties de la candidature si elle est répartie sur plusieurs embeds.
  const payload={content:message.content||'',allowed_mentions:{parse:[]},embeds:[embed,...((message?.embeds||[]).slice(1))]};
  // IMPORTANT : un message créé par un webhook Discord ne peut PAS être modifié par le bot
  // (erreur Discord 50005: Cannot edit a message authored by another user).
  // Si le webhook principal est configuré, on modifie donc toujours le message avec ce même webhook.
  const whUrl=webhookMessageUrl(messageId);
  let r;
  if(whUrl){
    r=await fetch(whUrl,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  }else{
    r=await channelApi(CANDIDATE_CHANNEL_ID,`/${messageId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  }
  if(!r.ok){const t=await r.text();throw new Error('Impossible de mettre à jour le statut de la candidature : '+t.slice(0,160))}
  return r.json();
}


function privateStatusChannel(data){
  return /^\d{17,20}$/.test(String(data?.privateChannelId||'')) ? String(data.privateChannelId) : '';
}

async function sendPrivateCandidateUpdate(data, payload){
  const channelId=privateStatusChannel(data);
  if(!channelId) return {ok:false,skipped:true};
  const did=String(data.discordId||'');
  const r=await channelApi(channelId,'',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    ...payload,
    allowed_mentions:{users:did?[did]:[]}
  })});
  if(!r.ok){const txt=await r.text();throw new Error('Impossible de notifier le candidat dans son salon privé : '+txt.slice(0,180))}
  return {ok:true};
}

async function renamePrivateChannel(data,prefix){
  const channelId=privateStatusChannel(data);
  if(!channelId) return;
  const suffix=String(data.discordId||'').slice(-4)||'wl';
  const name=`${prefix}-${suffix}`.slice(0,90);
  try{await discordApi(`/channels/${channelId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})})}catch{}
}

async function notifyUser(data,{kind,when,reason,logoUrl}){
  const did=data.discordId||'';
  let content='';
  let embed={};
  if(kind==='interview'){
    content=did?`<@${did}> ton écrit est **accepté** : tu passes à l’étape de l’entretien vocal. 🎙️🟣`:`Entretien WhiteList de **${data.pseudo}** confirmé pour **${when}**.`;
    embed={title:'🎙️ Écrit validé — Passage à l’entretien vocal',description:`Bonne nouvelle **${data.pseudo}** : ta candidature écrite est **validée**.\n\n📅 **Créneau retenu :** ${when}\n\n➡️ Ce salon privé devient maintenant ton **ticket d’entretien vocal WL**.\n➡️ Présente-toi à l’heure indiquée et attends la prise en charge du staff.\n➡️ Après l’entretien, tu recevras ici la **décision finale** de ta WhiteList.`,color:11152639,footer:{text:'CaliSide WL • Étape 2 — Entretien vocal'},image:logoUrl?{url:logoUrl}:undefined,timestamp:new Date().toISOString()};
  }else if(kind==='approved'){
    content=did?`<@${did}> **ta WhiteList CaliSide est validée ! Bienvenue 🌴✅**`:`La WhiteList de **${data.pseudo}** est validée.`;
    embed={title:'✅ Félicitations — WhiteList CaliSide validée !',description:`Félicitations **${data.pseudo}** ! 🎉

Ton entretien est terminé et ta candidature WhiteList est **définitivement validée**. Le rôle **CaliSide WL** t’a été attribué.

━━━━━━━━━━━━━━━━━━

🌴 **AVANT DE REJOINDRE CALISIDE**

**1️⃣ Lis le règlement**
📜 https://discord.com/channels/1429963172458139691/1429963172831432793
➡️ Lis-le entièrement avant ta première connexion.

**2️⃣ Consulte le guide CaliSide**
📘 https://discord.com/channels/1429963172458139691/1474068810268016852
➡️ Il t’aidera à comprendre le fonctionnement du serveur et à bien commencer.

**3️⃣ Regarde les touches et raccourcis**
⌨️ https://discord.com/channels/1429963172458139691/1444660316737765376
➡️ Garde ce salon sous la main pour connaître les commandes et raccourcis utiles en jeu.

**4️⃣ Accède au salon de connexion serveur**
🔐 <#1480661322692690112>
➡️ Tu y trouveras les informations d’accès au serveur.

**5️⃣ Rejoins CaliSide sur FiveM**
🎮 https://cfx.re/join/3m6z8r
➡️ Lance FiveM puis utilise ce lien pour rejoindre directement le serveur.

**6️⃣ Vérifie ton rôle Discord**
✅ Tu dois maintenant avoir le rôle **CaliSide WL**.

━━━━━━━━━━━━━━━━━━

💜 **Bienvenue officiellement sur CaliSide US WL !**
🌴 Lis bien les trois salons ci-dessus avant de rejoindre la ville afin d’être prêt pour ton arrivée.`,color:5763719,footer:{text:'CaliSide WL • WL TERMINÉE — VALIDÉE'},image:logoUrl?{url:logoUrl}:undefined,timestamp:new Date().toISOString()};
  }else{
    content=did?`<@${did}> ta candidature WhiteList CaliSide a reçu une décision. ❌`:`Décision WL pour **${data.pseudo}**.`;
    embed={title:'❌ WhiteList CaliSide refusée',description:`Ta candidature est **refusée**.\n\n**Motif :** ${trim(reason,1200)}`,color:15158332,footer:{text:'CaliSide WL • WL TERMINÉE — REFUSÉE'},image:logoUrl?{url:logoUrl}:undefined,timestamp:new Date().toISOString()};
  }

  // Le candidat est notifié UNIQUEMENT dans son propre salon privé.
  if(privateStatusChannel(data)){
    await sendPrivateCandidateUpdate(data,{content,embeds:[embed]});
  }

  // Les salons partagés deviennent des journaux STAFF : aucune mention joueur.
  const targetChannelId = kind==='approved' ? APPROVED_CHANNEL_ID : (kind==='rejected' ? REJECTED_CHANNEL_ID : PENDING_CHANNEL_ID);
  const targetLabel = kind==='approved' ? 'wl-validées' : (kind==='rejected' ? 'wl-refusées' : 'wl-entretien-vocal');
  const staffContent = kind==='approved'
    ? `✅ WL validée pour **${data.pseudo}** • dossier privé <#${data.privateChannelId||''}>`
    : kind==='rejected'
      ? `❌ WL refusée pour **${data.pseudo}** • dossier privé <#${data.privateChannelId||''}>`
      : `🎙️ Écrit validé / entretien confirmé pour **${data.pseudo}** • dossier privé <#${data.privateChannelId||''}>`;
  await sendStatusLog(targetChannelId,targetLabel,{content:staffContent,allowed_mentions:{parse:[]},embeds:[embed]});
}

export default async function handler(req,res){
  let sec;
  try{sec=secrets()}catch(e){return res.status(503).json({error:e.message})}
  if(!authOk(req,sec.cookieSecret)) return res.status(401).json({error:'Connexion staff requise'});

  let data;
  try{data=decodeToken(req.method==='GET'?req.query.token:req.body?.token,sec.tokenSecret)}catch(e){return res.status(400).json({error:e.message})}

  let message;
  try{message=await getCandidacy(data.messageId)}catch(e){return res.status(502).json({error:e.message})}
  const state=readState(message);

  if(req.method==='GET'){
    return res.status(200).json({
      ok:true,
      apiVersion:API_VERSION,
      candidate:{pseudo:data.pseudo,discord:data.discord,discordId:data.discordId,privateChannelId:data.privateChannelId||'',slot1:data.slot1,slot2:data.slot2},
      state
    });
  }
  if(req.method!=='POST') return res.status(405).json({error:'Méthode non autorisée'});

  const action=String(req.body?.action||'validate_interview');

  // Diagnostic indépendant du statut : permet de tester le bot même sur une WL déjà clôturée.
  if(action==='test_role'){
    try{
      const roleResult=await assignWhitelistRole(data.discordId);
      console.log('[WL ROLE TEST SUCCESS]', JSON.stringify({apiVersion:API_VERSION,...roleResult}));
      return res.status(200).json({ok:true,test:true,apiVersion:API_VERSION,role:roleResult});
    }catch(e){
      console.error('[WL ROLE TEST ERROR]', API_VERSION, e?.message||e);
      return res.status(502).json({error:e.message,apiVersion:API_VERSION});
    }
  }

  if(state.status==='approved' || state.status==='rejected') return res.status(409).json({error:'Cette WhiteList est déjà terminée'});

  try{
    if(action==='reject_written'){
      if(state.status!=='submitted') return res.status(409).json({error:'Cette candidature n’est plus à l’étape de l’étude écrite'});
      const reason=trim(req.body?.reason,1200);
      if(reason.length<5) return res.status(400).json({error:'Indique une raison de refus'});

      await patchCandidacy(data.messageId,message,{
        status:'❌ **WL TERMINÉE — REFUSÉE**',
        chosen:'',
        reason,
        title:'❌ CANDIDATURE ÉCRITE REFUSÉE — CaliSide WL',
        description:'La candidature écrite a été étudiée par le staff CaliSide et n’a pas été retenue. Aucun entretien vocal ne sera planifié.',
        color:15158332,
        footer:'CaliSide WL • REFUS APRÈS ÉTUDE ÉCRITE'
      });
      await notifyUser(data,{kind:'rejected',reason,logoUrl:logoUrlFromReq(req)});
      await renamePrivateChannel(data,'wl-refusee');
      return res.status(200).json({ok:true,status:'rejected',stage:'written',reason});
    }

    if(action==='validate_interview'){
      const choice=String(req.body?.slot||'1');
      const chosen=choice==='2'?data.slot2:data.slot1;
      if(!chosen) return res.status(400).json({error:'Créneau non disponible'});
      const when=formatSlot(chosen);
      await patchCandidacy(data.messageId,message,{
        status:'🟠 **Entretien vocal confirmé — en attente de la décision WL définitive**',
        chosen:`**${when}**`,
        reason:'',
        title:'🟠 WL EN COURS — Entretien confirmé — CaliSide WL',
        description:'Le créneau vocal est confirmé. Après l’entretien, le staff doit revenir ici pour valider ou refuser définitivement la WhiteList.',
        color:16753920,
        footer:'CaliSide WL • EN ATTENTE DE DÉCISION WL'
      });
      await notifyUser(data,{kind:'interview',when,logoUrl:logoUrlFromReq(req)});
      await renamePrivateChannel(data,'wl-entretien-vocal');
      return res.status(200).json({ok:true,status:'interview_confirmed',when});
    }

    if(state.status!=='interview_confirmed') return res.status(409).json({error:'Valide d’abord le créneau de l’entretien vocal'});

    if(action==='approve_wl'){
      // IMPORTANT : la validation définitive utilise exactement le même moteur
      // d'attribution que le bouton « Tester le rôle WL ».
      let roleResult=await assignWhitelistRole(data.discordId);

      // Double vérification juste avant de clôturer la WL. Si Discord n'a pas
      // réellement le rôle sur le membre, on retente une fois puis on bloque
      // la validation au lieu d'afficher un faux succès.
      const guildId=process.env.DISCORD_GUILD_ID || DEFAULT_GUILD_ID;
      const checkMember=async()=>discordApi(`/guilds/${guildId}/members/${data.discordId}`);
      let memberCheck=await checkMember();
      let hasRole=memberCheck.ok && (memberCheck.body?.roles||[]).map(String).includes(String(WL_ROLE_ID));

      if(!hasRole){
        const retry=await discordApi(`/guilds/${guildId}/members/${data.discordId}/roles/${WL_ROLE_ID}`,{method:'PUT'});
        if(!retry.ok){
          const details=typeof retry.body==='object'&&retry.body ? `${retry.body.message||''} (code ${retry.body.code||'?'})` : String(retry.body||'');
          throw new Error(`Validation WL bloquée : Discord ${retry.status} pendant la seconde tentative d'attribution du rôle. ${details}`);
        }
        await new Promise(r=>setTimeout(r,450));
        memberCheck=await checkMember();
        hasRole=memberCheck.ok && (memberCheck.body?.roles||[]).map(String).includes(String(WL_ROLE_ID));
      }

      if(!hasRole){
        throw new Error(`Validation WL bloquée : le rôle WL ${WL_ROLE_ID} n'est toujours pas présent sur le joueur ${data.discordId}.`);
      }

      roleResult={...roleResult,verifiedOnFinalApproval:true};

      await patchCandidacy(data.messageId,message,{
        status:'✅ **WL TERMINÉE — VALIDÉE**',
        chosen:state.chosen||'',
        reason:'',
        title:'✅ WL TERMINÉE — VALIDÉE — CaliSide WL',
        description:'Entretien vocal effectué. La candidature WhiteList est définitivement validée par le staff CaliSide. Le rôle Discord WL a été attribué et vérifié automatiquement.',
        color:5763719,
        footer:'CaliSide WL • WL TERMINÉE — VALIDÉE'
      });
      await notifyUser(data,{kind:'approved',logoUrl:logoUrlFromReq(req)});
      await renamePrivateChannel(data,'wl-validee');
      console.log('[WL FINAL APPROVAL ROLE VERIFIED]', JSON.stringify({userId:data.discordId,roleId:WL_ROLE_ID,roleResult}));
      return res.status(200).json({ok:true,status:'approved',role:roleResult});
    }

    if(action==='reject_wl'){
      const reason=trim(req.body?.reason,1200);
      if(reason.length<5) return res.status(400).json({error:'Indique une raison de refus'});
      await patchCandidacy(data.messageId,message,{
        status:'❌ **WL TERMINÉE — REFUSÉE**',
        reason,
        title:'❌ WL TERMINÉE — REFUSÉE — CaliSide WL',
        description:'Entretien vocal effectué. La candidature WhiteList est clôturée et refusée par le staff CaliSide.',
        color:15158332,
        footer:'CaliSide WL • WL TERMINÉE — REFUSÉE'
      });
      await notifyUser(data,{kind:'rejected',reason,logoUrl:logoUrlFromReq(req)});
      await renamePrivateChannel(data,'wl-refusee');
      return res.status(200).json({ok:true,status:'rejected',reason});
    }

    return res.status(400).json({error:'Action inconnue'});
  }catch(e){
    return res.status(502).json({error:e.message});
  }
}
