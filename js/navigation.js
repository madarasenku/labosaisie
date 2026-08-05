/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — navigation.js
   Extrait de index.html (v13.70). Chargé en script classique, PAS en
   module ES : les gestionnaires inline du HTML (onclick="…") résolvent
   les fonctions dans la portée globale. L'ordre des balises <script>
   dans index.html doit être conservé.
   ═══════════════════════════════════════════════════════════════ */

function showView(v) {
  // ✅ v13.37 — Quitter le mode « nouveau patient caisse » dès qu'on change de vue
  if (v !== 'saisie') _caisseNewPatientMode = false;
  // ✅ v13.33 — Le caissier ne peut pas accéder à la saisie ni aux comptes
  // ✅ v13.37 — Le spectateur non plus (lecture caisse uniquement)
  if (isSpectateur() && (v === 'saisie' || v === 'comptes')) return;
  if (isCaissier() && v === 'comptes') return;
  // Caissier : saisie autorisée UNIQUEMENT pour enregistrer un nouveau patient
  // (facture), via le bouton dédié de la caisse.
  if (isCaissier() && v === 'saisie' && !_caisseNewPatientMode) return;

  // ✅ v13.33 — Déterminer quel conteneur caisse afficher
  // Admin et Caissier → caisse complète ; Agent → vue personnelle simplifiée
  const caisseAdminVisible  = (v === 'caisse' && (isAdmin() || isCaissier()));
  const caisseUserVisible   = (v === 'caisse' && !isAdmin() && !isCaissier());

  const allViews = [
    { id: 'view-saisie',       show: v === 'saisie' },
    { id: 'view-historique',   show: v === 'historique' },
    { id: 'view-stats',        show: v === 'stats' },
    { id: 'view-comptes',      show: v === 'comptes' },
    { id: 'view-caisse',       show: caisseAdminVisible },
    { id: 'view-caisse-user',  show: caisseUserVisible },
  ];

  allViews.forEach(({ id, show }) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (show) {
      el.style.display = '';
      // Déclencher l'animation d'entrée
      el.classList.remove('view-entering');
      void el.offsetWidth; // forcer un reflow pour relancer l'animation
      el.classList.add('view-entering');
      el.addEventListener('animationend', () => el.classList.remove('view-entering'), { once: true });
    } else {
      el.style.display = 'none';
    }
  });

  document.querySelectorAll('header .nav-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  if (v !== 'historique' && typeof clearBulkSelection === 'function') clearBulkSelection(); // ✅ v13.30
  if (v === 'saisie' && typeof renderDashboard === 'function') renderDashboard(); // ✅ v13.34
  if (v === 'saisie' && typeof updateBandeauPaiement === 'function') updateBandeauPaiement(); // ✅ v13.35
  if (v === 'historique') renderHistory(true);
  if (v === 'comptes') { renderUsersList(); populateMoisAnneeSelectors(); if (isAdmin()) { buildAdminExamensGrid(); buildRefsEditor(); renderAuditLog(); } }
  if (v === 'stats') renderStats();
  if (v === 'caisse') renderCaisse();
}

/* ════════════════════════════════════════════════
   PALETTE DE RECHERCHE GLOBALE (Ctrl+K / ⌘K)
   Recherche instantanée par nom, N° dossier, téléphone,
   médecin — accessible depuis n'importe quelle vue.
   ════════════════════════════════════════════════ */
let _cmdkActive = 0;    // index de l'élément surligné
let _cmdkResults = [];  // résultats courants

function openCmdK() {
  const bd = document.getElementById('cmdk-backdrop');
  const input = document.getElementById('cmdk-input');
  if (!bd || !input) return;
  bd.classList.add('open');
  input.value = '';
  _cmdkActive = 0;
  cmdkRender();
  setTimeout(() => input.focus(), 30);
}

function closeCmdK() {
  const bd = document.getElementById('cmdk-backdrop');
  if (bd) bd.classList.remove('open');
}

function cmdkIsOpen() {
  const bd = document.getElementById('cmdk-backdrop');
  return bd && bd.classList.contains('open');
}

// Normalise (minuscule + sans accents) pour une recherche tolérante
function cmdkNorm(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function cmdkRender() {
  const input = document.getElementById('cmdk-input');
  const box = document.getElementById('cmdk-results');
  if (!input || !box) return;
  const qRaw = input.value.trim();
  const q = cmdkNorm(qRaw);

  let db = (typeof getDB === 'function') ? getDB() : (_dbCache || []);
  // Plus récents d'abord
  db = [...db].sort((a, b) => new Date(b.created_at || b.savedAt || 0) - new Date(a.created_at || a.savedAt || 0));

  let list;
  if (!q) {
    // Sans recherche : les 8 dossiers les plus récents
    list = db.slice(0, 8);
  } else {
    list = db.filter(r => {
      const p = r.patient || {};
      return cmdkNorm(p.nom).includes(q)
        || cmdkNorm(p.dossier).includes(q)
        || cmdkNorm(p.telephone).includes(q)
        || cmdkNorm(p.medecin).includes(q)
        || cmdkNorm(p.service).includes(q);
    }).slice(0, 12);
  }
  _cmdkResults = list;
  if (_cmdkActive >= list.length) _cmdkActive = Math.max(0, list.length - 1);

  if (!list.length) {
    box.innerHTML = '<div id="cmdk-empty"><div class="cmdk-empty-icon">🔍</div>Aucun dossier trouvé pour « ' + esc(qRaw) + ' »</div>';
    return;
  }

  const hl = (txt) => {
    const t = esc(txt || '—');
    if (!q) return t;
    // Surligner la portion correspondante (insensible aux accents)
    const nt = cmdkNorm(txt);
    const idx = nt.indexOf(q);
    if (idx < 0) return t;
    // Remap sur le texte échappé — approximation simple sur texte brut
    const raw = (txt || '').toString();
    const before = esc(raw.slice(0, idx));
    const match = esc(raw.slice(idx, idx + q.length));
    const after = esc(raw.slice(idx + q.length));
    return before + '<mark>' + match + '</mark>' + after;
  };

  box.innerHTML = list.map((r, i) => {
    const p = r.patient || {};
    const nom = (p.nom || '—').toUpperCase();
    const initiales = nom.split(/\s+/).map(w => w[0]).slice(0, 2).join('');
    const paye = (typeof getPaiementStatus === 'function') && getPaiementStatus(r.id) === 'paye';
    const sub = [p.age ? p.age + ' ans' : '', p.sexe || '', p.medecin || '', p.telephone || '']
      .filter(Boolean).join(' · ');
    return '<div class="cmdk-item' + (i === _cmdkActive ? ' active' : '') + '" data-idx="' + i + '"'
      + ' onmouseenter="_cmdkActive=' + i + ';cmdkPaint()" onclick="cmdkOpen(' + i + ')">'
      + '<div class="cmdk-item-avatar">' + esc(initiales || '?') + '</div>'
      + '<div class="cmdk-item-body">'
        + '<div class="cmdk-item-name">' + hl(nom) + '</div>'
        + '<div class="cmdk-item-sub">' + (sub ? hl(sub) : '—') + '</div>'
      + '</div>'
      + '<div class="cmdk-item-meta">'
        + '<span class="cmdk-item-dossier">' + hl(p.dossier || '—') + '</span>'
        + '<span class="cmdk-pill ' + (paye ? 'paye' : 'attente') + '">' + (paye ? 'Payé' : 'À encaisser') + '</span>'
      + '</div>'
    + '</div>';
  }).join('');
}

// Re-applique seulement la surbrillance active (sans reconstruire)
function cmdkPaint() {
  document.querySelectorAll('#cmdk-results .cmdk-item').forEach(el => {
    el.classList.toggle('active', Number(el.dataset.idx) === _cmdkActive);
  });
}

function cmdkKeydown(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeCmdK(); return; }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _cmdkActive = Math.min(_cmdkResults.length - 1, _cmdkActive + 1);
    cmdkPaint(); cmdkScrollActive();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _cmdkActive = Math.max(0, _cmdkActive - 1);
    cmdkPaint(); cmdkScrollActive();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (_cmdkResults.length) cmdkOpen(_cmdkActive);
  }
}

function cmdkScrollActive() {
  const el = document.querySelector('#cmdk-results .cmdk-item.active');
  if (el) el.scrollIntoView({ block: 'nearest' });
}

// Ouvre le dossier sélectionné : bascule sur l'historique, filtre dessus,
// et ouvre la fiche d'édition unifiée.
function cmdkOpen(i) {
  const r = _cmdkResults[i];
  if (!r) return;
  closeCmdK();
  const p = r.patient || {};
  showView('historique');
  // Pré-remplir la recherche de l'historique pour retrouver le dossier
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.value = p.dossier || p.nom || '';
    if (typeof renderHistory === 'function') renderHistory();
  }
  // Ouvrir directement la fiche (édition unifiée) après un court délai
  setTimeout(() => {
    if (typeof showEditUnifie === 'function') showEditUnifie(r.id);
  }, 180);
}

// Raccourci clavier global Ctrl+K / ⌘K
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    if (cmdkIsOpen()) closeCmdK(); else openCmdK();
  }
});

// ── Construction paresseuse des panneaux ──────────────────────
// Au lieu de construire tous les formulaires (NFS, Biochimie, Bactério,
// Sérologie, Parasito, GS, BPN — soit ~3000 éléments DOM) dès le chargement
// de la page, chaque panneau n'est construit que la première fois que
// l'utilisateur clique réellement sur son onglet. Cela réduit fortement
// le temps de connexion initial, surtout sur connexion lente ou mobile.
const PANEL_BUILDERS = {
  hema:     () => { buildHema(); },
  bio:      () => { buildBio(); buildAbg(); },
  bacterio: () => { if (!document.getElementById('abg-grid')?.children.length) buildAbg(); },
  sero:     () => { buildSero(); },
  parasito: () => { buildParaEPS(); },
  gs:       () => { buildGS(); },
};
const _panelsBuilt = new Set();

function ensurePanelBuilt(name) {
  if (_panelsBuilt.has(name)) return;
  const builder = PANEL_BUILDERS[name];
  if (builder) builder();
  _panelsBuilt.add(name);
}

function switchTab(name) {
  // ✅ v13.34 — Bloquer l'onglet si aucun examen de ce type n'est payé/coché
  // UNIQUEMENT quand on est en mode saisie de résultats (zone-saisie visible
  // ET fiche-identification masquée) — pas quand on coche depuis la fiche d'accueil
  const _inEditMode = _editingRecordId || (typeof _editingFicheId !== 'undefined' && _editingFicheId);
  const zoneSaisie = document.getElementById('zone-saisie');
  const ficheIdent = document.getElementById('fiche-identification');
  const enSaisieResultats = zoneSaisie?.style.display !== 'none'
                         && ficheIdent?.style.display === 'none';

  if (!_inEditMode && !_locksDisabled && enSaisieResultats) {
    const TAB_EXAMS = getCatalogueComplet().filter(ex => ex.tab === name);
    const hasPaid = TAB_EXAMS.some(ex => document.getElementById(ex.id)?.checked);
    if (!hasPaid && TAB_EXAMS.length > 0) {
      toast('Cochez et payez au moins un examen de ce type pour saisir les résultats', 'err');
      return;
    }
  }
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
  ensurePanelBuilt(name);
  if (typeof applyExamLocks === 'function') applyExamLocks();
  if (document.getElementById('zone-saisie')?.style.display !== 'none') {
    markRequiredSections();
  }
}

function resetPanel(name) {
  document.querySelectorAll('#panel-' + name + ' input[type=number], #panel-' + name + ' input[type=text]').forEach(i => i.value = '');
  document.querySelectorAll('#panel-' + name + ' select').forEach(s => s.selectedIndex = 0);
  document.querySelectorAll('#panel-' + name + ' .interp').forEach(sp => { sp.className='interp interp-?'; sp.textContent='—'; });
  document.querySelectorAll('#panel-' + name + ' .abg-row').forEach(r => r.className='abg-row nd');
}

// ============================================================
// PATIENT DATA
// ============================================================

// Génère un token de partage unique (32 hex) utilisé pour le QR de vérification
function genShareToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID().replace(/-/g, '');
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// _shareTokenCurrent : conservé entre les onglets de la même saisie pour
// que tous les enregistrements d'un même dossier partagent le même token.
let _shareTokenCurrent = null;

function getPatient() {
  // Réutiliser le token existant (édition ou dossier multi-analyses)
  if (!_shareTokenCurrent) _shareTokenCurrent = genShareToken();
  return {
    dossier:      document.getElementById('p_dossier').value.trim(),
    date:         document.getElementById('p_date').value,
    nom:          document.getElementById('p_nom').value.trim().toUpperCase(),
    age:          document.getElementById('p_age').value,
      telephone:    (document.getElementById('p_telephone')?.value || '').trim(),
    sexe:         document.getElementById('p_sexe').value,
    medecin:      document.getElementById('p_medecin').value.trim().toUpperCase(),
    service:      document.getElementById('p_service').value,
    clinique:     document.getElementById('p_clinique').value.trim(),
    share_token:  _shareTokenCurrent,
  };
}

function validatePatient(p) {
  if (!p.date)    { toast('Veuillez saisir la date','err'); return false; }
  if (!p.nom)     { toast('Veuillez saisir le nom du patient','err'); return false; }
  return true;
}

// ============================================================
// STORAGE — Supabase (base de données distante)
// ============================================================

// ════════════════════════════════════════════════════════════════
// CONFIGURATION SUPABASE
// ⚠ REMPLACEZ CES 2 VALEURS par celles de VOTRE projet :
//   Supabase → Project Settings → API
//     • Project URL  → SUPABASE_URL
//     • anon public  → SUPABASE_KEY
// ════════════════════════════════════════════════════════════════
// ✅ v13.34+ — Vérification session : si pas de session valide → login.html

