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
const titles = ['Informations', 'Projet RP', 'Disponibilités', 'Connaissances RP', 'Mises en situation', 'Entretien vocal'];
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
  let invalid = [];

  [...step.querySelectorAll('input[required],select[required],textarea[required]')].forEach(el => {
    if (!el.checkValidity()) {
      el.classList.add('invalid');
      invalid.push(el);
    }
  });

  if (stepIndex === 1 && !step.querySelector('input[name="rpType"]:checked')) invalid.push(document.getElementById('rpChoices'));
  if (stepIndex === 2 && !step.querySelector('input[name="availability"]:checked')) invalid.push(document.getElementById('availabilityChoices'));

  if (stepIndex === 5) {
    const s1 = step.querySelector('input[name="interviewSlot1"]');
    const s2 = step.querySelector('input[name="interviewSlot2"]');
    const now = Date.now();
    if (s1 && s1.value && new Date(s1.value).getTime() <= now) { s1.classList.add('invalid'); invalid.push(s1); }
    if (s2 && s2.value && new Date(s2.value).getTime() <= now) { s2.classList.add('invalid'); invalid.push(s2); }
  }

  if (invalid.length) {
    formError.textContent = 'Merci de compléter correctement tous les champs obligatoires avant de continuer.';
    const target = invalid[0];
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (target.classList) target.classList.add('shake-now');
    return false;
  }

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
  // Au clic final, on revalide les 6 étapes pour éviter un faux "candidature incomplète" côté API.
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
  set('discord', '123456789012345678');
  set('fivem', 'TEST-FIVEM-ID');
  set('experience', 'Plus de 2 ans');
  set('previousRp', 'Candidature automatique de test. Expérience RP variée sur plusieurs serveurs, avec respect des règles, cohérence des scènes et jeu en équipe.');
  set('character', 'Personnage de test CaliSide : un Californien ambitieux, sociable et cohérent, souhaitant développer des interactions civiles, professionnelles et communautaires sur le long terme.');
  set('goals', 'Développer un projet RP durable, créer des scènes régulières avec les autres joueurs, participer à la vie de la ville et faire évoluer le personnage de manière cohérente.');
  set('whyCaliSide', 'Je souhaite rejoindre CaliSide pour son univers US, son organisation whitelist et la possibilité de construire un RP sérieux, durable et riche en interactions avec la communauté.');
  set('contribution', 'Je peux apporter de la régularité, de la créativité, du fair-play, des scènes construites et une attitude respectueuse envers les joueurs ainsi que le staff.');
  set('weeklyTime', '20 à 30 h');
  set('constraints', 'Aucune contrainte particulière pour ce test automatique.');
  set('freekill', 'Le Freekill consiste à tuer un joueur sans raison RP valable ni scène cohérente. Toute action violente doit avoir un contexte et une justification roleplay.');
  set('nopain', 'Le No Pain RP consiste à ignorer la douleur ou les blessures de son personnage. Il faut au contraire adapter ses actions à son état physique et jouer les conséquences.');
  set('fear', 'Le Fear RP consiste à jouer de manière crédible la peur face à un danger sérieux, par exemple lorsqu’un personnage est menacé par plusieurs personnes armées.');
  set('meta', 'Le Metagaming consiste à utiliser en jeu une information obtenue hors RP, par exemple via Discord ou un stream, alors que le personnage ne peut pas la connaître.');
  set('power', 'Le PowerGaming consiste à imposer des actions irréalistes ou à exploiter les mécaniques du jeu d’une façon impossible ou incohérente dans une situation RP.');
  set('crash', 'Après un accident à haute vitesse, je joue les blessures, je sécurise la scène si possible, j’appelle les secours et j’évite de repartir comme si rien ne s’était passé.');
  set('rulebreak', 'Je poursuis la scène sans la casser si possible, puis je conserve les éléments utiles et je contacte le staff après la scène plutôt que de régler le problème en HRP sur place.');
  set('armedRobbery', 'Seul face à deux personnes armées, je respecte le Fear RP, je coopère tant que ma vie est menacée et je privilégie une réaction cohérente plutôt qu’une action héroïque irréaliste.');
  set('rpLoss', 'J’accepte la perte comme une conséquence RP, je continue à jouer sans chercher une vengeance HRP et j’utilise l’événement pour faire évoluer mon personnage et créer de nouvelles scènes.');
  set('interviewSlot1', futureLocal(1, 20, 0));
  set('interviewSlot2', futureLocal(2, 21, 0));
  set('interviewNote', 'Candidature générée automatiquement pour tester le workflow complet CaliSide WL.');

  form.querySelectorAll('input[name="rpType"]').forEach((el, i) => { el.checked = i < 2; });
  form.querySelectorAll('input[name="availability"]').forEach((el, i) => { el.checked = i === 2 || i === 4; });
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
const bgMusic = document.getElementById('bgMusic');
const musicToggle = document.getElementById('musicToggle');
let musicStarted = false;

if (bgMusic && musicToggle) {
  bgMusic.volume = 0.22;

  const syncMusicButton = () => {
    const playing = !bgMusic.paused;
    musicToggle.textContent = playing ? '⏸ Pause musique' : '▶ Lire la musique';
    musicToggle.setAttribute('aria-pressed', playing ? 'true' : 'false');
  };

  const startMusic = async () => {
    if (musicStarted || !bgMusic.paused) return;
    try {
      await bgMusic.play();
      musicStarted = true;
      syncMusicButton();
    } catch (_) {
      // L'autoplay sonore peut être bloqué jusqu'à un clic explicite.
    }
  };

  musicToggle.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (bgMusic.paused) {
      try {
        await bgMusic.play();
        musicStarted = true;
      } catch (_) {}
    } else {
      bgMusic.pause();
    }
    syncMusicButton();
  });

  document.addEventListener('pointerdown', startMusic, { once: true });
  bgMusic.addEventListener('play', syncMusicButton);
  bgMusic.addEventListener('pause', syncMusicButton);
  syncMusicButton();
}

console.info('[CaliSide WL] Frontend v3.0.0 — endpoint /api/caliside-submit');
