import crypto from 'crypto';

const sign=(payload,secret)=>crypto.createHmac('sha256',secret).update(payload).digest('base64url');
const base64url=(obj)=>Buffer.from(JSON.stringify(obj)).toString('base64url');

function cookieSecret(password){
  return crypto.createHash('sha256').update('caliside-wl-cookie:'+password).digest('hex');
}

function parseCookies(req){
  const out={};
  String(req.headers.cookie||'').split(';').forEach(part=>{
    const i=part.indexOf('='); if(i<0)return;
    out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());
  });
  return out;
}

function sessionValid(raw,secret){
  const [payload,sig]=String(raw||'').split('.');
  if(!payload||!sig)return false;
  const expected=sign(payload,secret);
  try{
    const a=Buffer.from(sig); const b=Buffer.from(expected);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b)) return false;
    const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    return data.exp && Date.now()<data.exp;
  }catch{return false}
}

export default async function handler(req,res){
  const password=process.env.CALISIDE_STAFF_PASSWORD || process.env.PURPLECITY_STAFF_PASSWORD || 'caliside1616';
  if(!password) return res.status(503).json({error:'Définis CALISIDE_STAFF_PASSWORD dans Vercel'});
  const secret=cookieSecret(password);

  if(req.method==='GET'){
    const ok=sessionValid(parseCookies(req).pc_staff_session,secret);
    return res.status(200).json({ok,authenticated:ok});
  }

  if(req.method==='DELETE'){
    res.setHeader('Set-Cookie','pc_staff_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
    return res.status(200).json({ok:true});
  }

  if(req.method!=='POST') return res.status(405).json({error:'Méthode non autorisée'});
  const supplied=String(req.body?.password||'');
  const a=Buffer.from(supplied); const b=Buffer.from(password);
  const same=a.length===b.length && crypto.timingSafeEqual(a,b);
  if(!same) return res.status(403).json({error:'Mot de passe staff incorrect'});

  const payload=base64url({role:'caliside-staff',iat:Date.now(),exp:Date.now()+1000*60*60*8});
  const token=`${payload}.${sign(payload,secret)}`;
  res.setHeader('Set-Cookie',`pc_staff_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
  return res.status(200).json({ok:true});
}
