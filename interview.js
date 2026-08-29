import crypto from 'crypto';

const API_VERSION='role-final-auto-v5-2026-08-25';

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
const candidacyWebhook=()=>process.env.DISCORD_WEBHOOK_URL || '';
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

async function sendPendingLog(payload){
  const botToken=process.env.DISCORD_BOT_TOKEN;
  if(botToken){
    const r=await channelApi(PENDING_CHANNEL_ID,'',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!r.ok){const t=await r.text();throw new Error('Impossible d’envoyer le log dans Candidature en attente : '+t.slice(0,120))}
    return r;
  }
  const wh=notifyWebhook();
  if(!wh) throw new Error('DISCORD_BOT_TOKEN ou DISCORD_INTERVIEW_WEBHOOK_URL manquant');
  const r=await fetch(wh,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!r.ok){const t=await r.text();throw new Error('Impossible d’envoyer le log Discord : '+t.slice(0,120))}
  return r;
}

async function getCandidacy(messageId){
  const botToken=process.env.DISCORD_BOT_TOKEN;
  const r=botToken ? await channelApi(CANDIDATE_CHANNEL_ID,`/${messageId}`) : await fetch(`${candidacyWebhook()}/messages/${messageId}`);
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
  const botToken=process.env.DISCORD_BOT_TOKEN;
  const r=botToken ? await channelApi(CANDIDATE_CHANNEL_ID,`/${messageId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}) : await fetch(`${candidacyWebhook()}/messages/${messageId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!r.ok){const t=await r.text();throw new Error('Impossible de mettre à jour le statut de la candidature : '+t.slice(0,120))}
  return r.json();
}

async function notifyUser(data,{kind,when,reason}){
  const did=data.discordId||'';
  let content='';
  let embed={};
  if(kind==='interview'){
    content=did?`<@${did}> ton entretien WhiteList CaliSide est confirmé pour **${when}**. 🎙️🟣`:`Entretien WhiteList de **${data.pseudo}** confirmé pour **${when}**.`;
    embed={title:'🎙️ Entretien WhiteList confirmé',description:`Le staff CaliSide a retenu le créneau de **${data.pseudo}**.\n\n**Date et heure :** ${when}\n**Statut :** en attente de l’entretien vocal puis de la décision WL définitive.`,color:11152639,footer:{text:'CaliSide WL • Entretien WL'},timestamp:new Date().toISOString()};
  }else if(kind==='approved'){
    content=did?`<@${did}> **ta WhiteList CaliSide est validée !** ✅🟣`:`La WhiteList de **${data.pseudo}** est validée.`;
    embed={title:'✅ WhiteList CaliSide validée',description:`Félicitations **${data.pseudo}** ! Ton entretien est terminé et ta candidature WhiteList est **définitivement validée**.\n\nBienvenue sur CaliSide WL. 💜`,color:5763719,footer:{text:'CaliSide WL • WL TERMINÉE — VALIDÉE'},timestamp:new Date().toISOString()};
  }else{
    content=did?`<@${did}> ta candidature WhiteList CaliSide a reçu une décision. ❌`:`Décision WL pour **${data.pseudo}**.`;
    embed={title:'❌ WhiteList CaliSide refusée',description:`La candidature de **${data.pseudo}** est **refusée**.\n\n**Motif :** ${trim(reason,1200)}`,color:15158332,footer:{text:'CaliSide WL • WL TERMINÉE — REFUSÉE'},timestamp:new Date().toISOString()};
  }
  await sendPendingLog({content,allowed_mentions:{users:did?[did]:[]},embeds:[embed]});
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
      candidate:{pseudo:data.pseudo,discord:data.discord,discordId:data.discordId,slot1:data.slot1,slot2:data.slot2},
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
      await notifyUser(data,{kind:'rejected',reason});
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
      await notifyUser(data,{kind:'interview',when});
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
      await notifyUser(data,{kind:'approved'});
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
      await notifyUser(data,{kind:'rejected',reason});
      return res.status(200).json({ok:true,status:'rejected',reason});
    }

    return res.status(400).json({error:'Action inconnue'});
  }catch(e){
    return res.status(502).json({error:e.message});
  }
}
