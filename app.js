// CaliSide WL v3.1.0 - FIX 500 server diagnostics
const form = document.getElementById('wlForm');
const steps = [...document.querySelectorAll('.step')];
const progressBar = document.getElementById('progressBar');
const currentStepEl = document.getElementById('currentStep');
const stepTitle = document.getElementById('stepTitle');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const submitBtn = document.getElementById('submitBtn');
const formError = document.getElementById('formError');
const modal = document.getElementById('successModal');
const closeModal = document.getElementById('closeModal');
const titles = ['Informations', 'Projet RP', 'RP & situation', 'Envoi'];
let current = 0;

function renderStep() {
  steps.forEach((s, i) => s.classList.toggle('active', i === current));
  currentStepEl.textContent = current + 1;
  stepTitle.textContent = titles[current];
  progressBar.style.width = `${((current + 1) / steps.length) * 100}%`;
  prevBtn.style.visibility = current === 0 ? 'hidden' : 'visible';
  nextBtn.classList.toggle('hidden', current === steps.length - 1);
  submitBtn.classList.toggle('hidden', current !== steps.length - 1);
  formError.textContent = '';
  const card = document.querySelector('.form-card');
  if (card) {
    window.scrollTo({ top: card.offsetTop - 12, behavior: 'smooth' });
  }
}

function clearInvalid(step) {
  step.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
}

function validateStep(stepIndex = current) {
  const step = steps[stepIndex];
  clearInvalid(step);

  // Seul l'ID Discord est techniquement indispensable : il sert à créer
  // le salon privé du candidat. Aucun minimum de caractères n'est imposé
  // sur les réponses RP, le projet ou les horaires.
  const discord = step.querySelector('input[name="discord"]');
  if (discord && !String(discord.value || '').trim()) {
    discord.classList.add('invalid');
    formError.textContent = 'Indique seulement ton ID Discord pour que ton salon privé puisse être créé.';
    discord.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }

  formError.textContent = '';
  return true;
}

nextBtn.addEventListener('click', () => {
  if (validateStep()) {
    current++;
    renderStep();
  }
});

prevBtn.addEventListener('click', () => {
  if (current > 0) {
    current--;
    renderStep();
  }
});

document.querySelectorAll('textarea').forEach(t => {
  const counter = document.querySelector(`[data-counter="${t.name}"]`);
  if (counter) {
    const update = () => counter.textContent = t.value.length;
    t.addEventListener('input', update);
    update();
  }
});

document.querySelectorAll('input,select,textarea').forEach(el => {
  el.addEventListener('input', () => el.classList.remove('invalid'));
});

function dataToObject(fd) {
  const out = {};
  for (const [k, v] of fd.entries()) {
    if (out[k]) out[k] = Array.isArray(out[k]) ? [...out[k], v] : [out[k], v];
    else out[k] = v;
  }
  return out;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  // Au clic final, seul l'ID Discord est vérifié pour éviter un faux "candidature incomplète" côté API.
  for (let i = 0; i < steps.length; i++) {
    if (!validateStep(i)) {
      current = i;
      renderStep();
      validateStep(i);
      return;
    }
  }

  submitBtn.classList.add('loading');
  formError.textContent = '';
  const payload = dataToObject(new FormData(form));
  // Si l'URL contient ?test=1, l'API construit elle-même une candidature complète.
  // Cela permet d'isoler immédiatement un problème de formulaire d'un problème Discord/Vercel.
  if (new URLSearchParams(window.location.search).get('test') === '1') {
    payload._testMode = true;
  }

  try {
    const res = await fetch('/api/caliside-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      const missing = Array.isArray(result.missing) && result.missing.length
        ? ` — champs manquants : ${result.missing.join(', ')}`
        : '';
      const detail = result.detail ? ` — détail : ${String(result.detail).slice(0,500)}` : '';
      throw new Error((result.error || 'Erreur lors de l’envoi') + missing + detail);
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    form.reset();
    current = 0;
    renderStep();
  } catch (err) {
    formError.textContent = err.message.includes('WEBHOOK')
      ? 'Le formulaire fonctionne, mais le webhook Discord n’est pas encore configuré sur Vercel.'
      : `Impossible d’envoyer la candidature : ${err.message}`;
  } finally {
    submitBtn.classList.remove('loading');
  }
});

closeModal.addEventListener('click', () => {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
});

modal.addEventListener('click', e => {
  if (e.target === modal) closeModal.click();
});


renderStep();


// Mode de test candidature : ouvre le site avec ?test=1
// Exemple : https://ton-domaine.vercel.app/?test=1
// Tous les champs sont remplis automatiquement et l'écran va directement à la dernière étape.
function fillTestApplication() {
  const set = (name, value) => {
    const el = form.elements.namedItem(name);
    if (!el) return;
    if (el instanceof RadioNodeList) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const futureLocal = (days, hour, minute = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, minute, 0, 0);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  set('pseudo', '[TEST] CaliSide');
  set('age', '25');
  set('discord', '1327939471072563272');
  set('fivem', 'TEST-FIVEM-ID');
  set('experience', 'Plus de 2 ans');
  set('previousRp', 'Candidature automatique de test. Expérience RP variée sur plusieurs serveurs, avec respect des règles, cohérence des scènes et jeu en équipe.');
  set('character', 'Personnage de test CaliSide : un Californien ambitieux, sociable et cohérent, souhaitant développer des interactions civiles, professionnelles et communautaires sur le long terme.');
  set('goals', 'Développer un projet RP durable, créer des scènes régulières avec les autres joueurs, participer à la vie de la ville et faire évoluer le personnage de manière cohérente.');
  set('whyCaliSide', 'Je souhaite rejoindre CaliSide pour son univers US, son organisation whitelist et la possibilité de construire un RP sérieux, durable et riche en interactions avec la communauté.');
  set('contribution', 'Je peux apporter de la régularité, de la créativité, du fair-play, des scènes construites et une attitude respectueuse envers les joueurs ainsi que le staff.');
  set('weeklyTime', '20 à 30 h');
  set('constraints', 'Aucune contrainte particulière pour ce test automatique.');
  set('fear', 'Le Fear RP consiste à jouer de manière crédible la peur face à un danger sérieux, par exemple lorsqu’un personnage est menacé par plusieurs personnes armées.');
  set('meta', 'Le Metagaming consiste à utiliser en jeu une information obtenue hors RP, par exemple via Discord ou un stream, alors que le personnage ne peut pas la connaître.');
  set('armedRobbery', 'Seul face à deux personnes armées, je respecte le Fear RP, je coopère tant que ma vie est menacée et je privilégie une réaction cohérente plutôt qu’une action héroïque irréaliste.');
  set('interviewSlot1', futureLocal(1, 20, 0));
  set('interviewSlot2', futureLocal(2, 21, 0));
  set('interviewNote', 'Candidature générée automatiquement pour tester le workflow complet CaliSide WL.');

  form.querySelectorAll('input[name="rpType"]').forEach((el, i) => { el.checked = i < 2; });
  const consent = form.querySelector('input[name="rulesAccepted"]');
  if (consent) consent.checked = true;

  document.querySelectorAll('textarea').forEach(t => t.dispatchEvent(new Event('input', { bubbles: true })));
  current = steps.length - 1;
  renderStep();
  formError.textContent = '🧪 MODE TEST : formulaire prérempli. Vérifie le créneau puis clique sur « Envoyer ma candidature ». '; 
}

// Commande rapide : ajoute ?test=1 à l'URL pour préremplir tout le formulaire.
// Également disponible depuis la console avec testCandidature().
window.testCandidature = fillTestApplication;
if (new URLSearchParams(window.location.search).get('test') === '1') {
  fillTestApplication();
}



// Musique d'ambiance CaliSide — ajout isolé, sans toucher au formulaire.
