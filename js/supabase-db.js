/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — supabase-db.js
   Extrait de index.html (v13.70). Chargé en script classique, PAS en
   module ES : les gestionnaires inline du HTML (onclick="…") résolvent
   les fonctions dans la portée globale. L'ordre des balises <script>
   dans index.html doit être conservé.
   ═══════════════════════════════════════════════════════════════ */

(function checkAuth() {
  const SESSION_KEY_CHECK = 'labo_session_user';
  const raw = localStorage.getItem(SESSION_KEY_CHECK);
  if (!raw) { window.location.replace('login.html'); return; }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.expiresAt || Date.now() > parsed.expiresAt || !parsed.id || !parsed.token) {
      localStorage.removeItem(SESSION_KEY_CHECK);
      window.location.replace('login.html');
    }
  } catch(e) { window.location.replace('login.html'); }
})();

const SUPABASE_URL = 'https://uvxxbihlagfncraokqlg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_RPgz6piVcNONZOOcLmOCQw_5YPxZTd6';

// ── URL publique de l'application (pour les QR codes de vérification) ──
// Remplacez par votre propre URL si vous hébergez l'app (GitHub Pages, Netlify…)
// Exemple : 'https://mon-labo.github.io/labosaisie'
const APP_PUBLIC_URL = (() => {
  const u = window.location;
  return u.origin + u.pathname.replace(/\/[^/]*$/, '') + '/index.html';
})();

// Initialisation robuste : vérifie que la librairie est chargée
let _sb = null;
function initSupabase() {
  if (!window.supabase || !window.supabase.createClient) {
    console.error('[LaboSaisie] Librairie Supabase non chargée (vérifiez votre connexion internet).');
    return false;
  }
  // ✅ v13.36 — Ces identifiants SONT ceux de production du CPMI (pas des placeholders).
  // L'ancien avertissement « configuration par défaut » était un faux positif → retiré.
  try {
    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return true;
  } catch(e) {
    console.error('[LaboSaisie] Erreur création client Supabase:', e);
    return false;
  }
}
initSupabase();

// Cache local pour affichage instantané ; toujours resynchronisé avec Supabase
let _dbCache = [];

// ✅ v13.31 — Corbeille : mode admin affichant les fiches supprimées (soft-delete)
let _filterCorbeille = false;

// ✅ v13.32 — Fiches verrouillées : section admin dédiée (les fiches 🔒 disparaissent
// de la vue normale pour tout le monde, y compris leur propriétaire).
let _filterVerrouillees = false;

function getDB() {
  // ✅ v13.33 — Corbeille : admin voit soft+hard deleted, agent voit ses soft-delete
  if (_filterCorbeille) {
    const uid = _currentUser?.username;
    if (isAdmin()) return _dbCache.filter(r => !!r.deletedAt || !!r._hardDeleted);
    return _dbCache.filter(r => !!r.deletedAt && !r._hardDeleted && r.deletedBy === uid);
  }
  // ✅ v13.52 — Un dossier masqué disparaît de TOUS les comptes (propriétaire,
  //   caissier, spectateur, autres agents). Seuls L'ADMIN et CELUI QUI A MASQUÉ
  //   le voient dans cette section, pour pouvoir le réafficher.
  if (_filterVerrouillees) {
    const uid = _currentUser?.username;
    if (isAdmin()) return _dbCache.filter(r => !r.deletedAt && !r._hardDeleted && !!r.restrictedBy);
    return _dbCache.filter(r => !r.deletedAt && !r._hardDeleted && r.restrictedBy === uid);
  }
  // ✅ v13.91 — Les bilans prénatals internes redeviennent visibles de tous.
  // Les avoir masqués (v13.89) les sortait aussi de « À encaisser » : le
  // caissier ne pouvait plus encaisser la patiente. Un dossier qu'on ne voit
  // pas est un dossier qu'on ne peut pas traiter.
  //
  // Admin/Caissier/Spectateur : fiches actives (sans soft-delete ni hard-delete ni masquées)
  if (isAdmin() || isCaissier() || isSpectateur())
    return _dbCache.filter(r => !r.deletedAt && !r._hardDeleted && !r.restrictedBy);
  // Agent : ses fiches actives uniquement
  const uid = _currentUser?.username;
  if (!uid) return [];
  return _dbCache.filter(r => !r.deletedAt && !r._hardDeleted && !r.restrictedBy
                              && r.createdBy === uid);
}

/**
 * Un bilan prénatal INTERNE alimente le cahier jaune. Conservé comme
 * repère, mais il n'exclut plus rien : voir la note ci-dessous.
 */
function estCahierJaune(r) {
  return !!(r && typeof estBPN === 'function' && estBPN(r)
            && (r.patient?.medecin || '') !== 'EXTERNE');
}

// ✅ v13.32 — Fiches verrouillées toujours exclues des calculs (elles ont leur propre total
// dans la section admin « Fiches verrouillées »).
//
// ✅ v13.91 — Les bilans prénatals internes en avaient été exclus (v13.89),
// puis remis. Le motif du retour en arrière mérite d'être retenu : les
// masquer les faisait disparaître de « À encaisser », donc le caissier ne
// pouvait plus prendre les 10 000 FCFA de la patiente et le dossier restait
// impayé pour toujours, invisible même des listes d'impayés. Le cahier jaune
// suit ce qui est DÛ AU PERSONNEL ; il ne retire rien de la caisse.
function isExcludedFromCalc(r) {
  return !!(r && r.restrictedBy);
}

// ✅ v13.34 — Tableau de bord : synthèse du jour, affichée en haut de la Saisie
// ✅ v13.34 — Calcul âge depuis DDN (jours/mois/ans)
function calcAgeFromDDN() {
  const ddnEl = document.getElementById('p_ddn');
  const ageEl = document.getElementById('p_age');
  const lblEl = document.getElementById('p_age_label');
  if (!ddnEl || !ddnEl.value) return;
  const ddn = new Date(ddnEl.value), now = new Date();
  const diffMs = now - ddn;
  if (diffMs < 0) { if (lblEl) lblEl.textContent = '⚠ Date dans le futur'; return; }
  const diffDays = Math.floor(diffMs / 86400000);
  let ageDisplay = '', ageValeur = 0;
  if (diffDays < 30) {
    ageValeur = parseFloat((diffDays / 365).toFixed(3));
    ageDisplay = diffDays + ' jour' + (diffDays > 1 ? 's' : '');
  } else if (diffDays < 365) {
    const mois = Math.floor(diffDays / 30.44);
    ageValeur = parseFloat((mois / 12).toFixed(2));
    ageDisplay = mois + ' mois';
  } else {
    const ans = now.getFullYear() - ddn.getFullYear();
    const corr = (now.getMonth() < ddn.getMonth() ||
      (now.getMonth() === ddn.getMonth() && now.getDate() < ddn.getDate())) ? 1 : 0;
    ageValeur = ans - corr;
    ageDisplay = ageValeur + ' an' + (ageValeur > 1 ? 's' : '');
  }
  if (ageEl) ageEl.value = ageValeur;
  if (lblEl) lblEl.textContent = '→ ' + ageDisplay;
  updateAllRefs(); updateMontantCurrent();
}
function onAgeInput() {
  const ddnEl = document.getElementById('p_ddn');
  const lblEl = document.getElementById('p_age_label');
  if (ddnEl) ddnEl.value = '';
  if (lblEl) lblEl.textContent = '';
  updateAllRefs(); updateMontantCurrent();
}

function renderDashboard() {
  const host = document.getElementById('dashboard-cards');
  if (!host) return;

  const today = new Date().toISOString().slice(0, 10);
  const calcDB = (typeof getCalcDB === 'function' ? getCalcDB() : _dbCache) || [];
  const dujour = calcDB.filter(r => (r.patient?.date || (r.savedAt || '').slice(0, 10)) === today);

  const nbJour     = dujour.length;
  const recetteJour = dujour.reduce((s, r) => s + (r.montant || 0), 0);
  const enAttente  = calcDB.filter(r => getStatut(r.id) === 'attente').length;

  // Service le plus fréquent aujourd'hui
  const svcCount = {};
  dujour.forEach(r => {
    const s = (r.patient?.service || '').trim();
    if (s) svcCount[s] = (svcCount[s] || 0) + 1;
  });
  const topSvc = Object.entries(svcCount).sort((a, b) => b[1] - a[1])[0];

  const card = (icon, label, value, color) =>
    '<div style="background:var(--surface,#fff);border:1px solid var(--border);border-left:4px solid ' + color + ';'
    + 'border-radius:12px;padding:12px 14px;box-shadow:0 1px 3px rgba(11,37,69,.06)">'
    + '<div style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.3px;margin-bottom:4px">' + icon + ' ' + label + '</div>'
    + '<div style="font-size:20px;font-weight:800;color:' + color + '">' + value + '</div></div>';

  host.innerHTML =
      card('📋', 'Fiches du jour', nbJour, '#0096c7')
    + card('💰', 'Recette du jour', recetteJour.toLocaleString('fr-FR') + ' F', '#15803d')
    + card('⏳', 'En attente', enAttente, '#d97706')
    + card('🏥', 'Service phare', topSvc ? esc(topSvc[0]) + ' (' + topSvc[1] + ')' : '—', '#0b2545');

  // ✅ v13.43 — Alerte dossiers en attente depuis > 48 h
  renderAlerteAnciens(calcDB);
}

// ✅ v13.43 — Bannière d'alerte : dossiers non rendus depuis plus de 48 h.
// Aide l'équipe à ne pas oublier un patient dont le résultat traîne.
function renderAlerteAnciens(calcDB) {
  const host = document.getElementById('alerte-anciens');
  if (!host) return;
  const SEUIL_H = 48;
  const now = Date.now();
  const anciens = (calcDB || []).filter(r => {
    const st = getStatut(r.id);
    if (st === 'rendu') return false;
    const t = new Date(r.created_at || r.savedAt || 0).getTime();
    if (!t) return false;
    return (now - t) / 36e5 >= SEUIL_H;
  }).sort((a, b) => new Date(a.created_at || a.savedAt || 0) - new Date(b.created_at || b.savedAt || 0));

  if (!anciens.length) { host.style.display = 'none'; host.innerHTML = ''; return; }

  const apercu = anciens.slice(0, 3).map(r => {
    const p = r.patient || {};
    const t = new Date(r.created_at || r.savedAt || 0).getTime();
    const jours = Math.floor((now - t) / 864e5);
    const age = jours >= 1 ? jours + ' j' : Math.floor((now - t) / 36e5) + ' h';
    return '<button onclick="openDossierFromAlerte(' + r.id + ')" '
      + 'style="display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #fca5a5;'
      + 'border-radius:99px;padding:3px 11px;font-size:12px;font-weight:600;color:#991b1b;cursor:pointer;font-family:inherit">'
      + esc((p.nom || '—').toUpperCase()) + ' <span style="opacity:.7">· ' + esc(p.dossier || '') + ' · ' + age + '</span></button>';
  }).join('');
  const reste = anciens.length > 3 ? ' <span style="opacity:.8">+ ' + (anciens.length - 3) + ' autre(s)</span>' : '';

  host.style.display = 'block';
  host.innerHTML =
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
    + '<span style="font-weight:800;font-size:13.5px;color:#991b1b;white-space:nowrap">⏰ ' + anciens.length + ' dossier(s) en attente > 48 h</span>'
    + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' + apercu + reste + '</div>'
    + '<button onclick="showView(\'historique\')" style="margin-left:auto;background:#991b1b;color:#fff;border:none;border-radius:8px;padding:5px 13px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap">Voir l\'historique</button>'
    + '</div>';
}

function openDossierFromAlerte(id) {
  showView('historique');
  setTimeout(() => { if (typeof showEditUnifie === 'function') showEditUnifie(id); }, 180);
}

function getCalcDB() {
  // Base de calcul : Caisse, Statistiques, Ristournes, rapport PDF.
  // Une seule règle décide de l'exclusion : isExcludedFromCalc.
  const vivante = r => !r.deletedAt && !r._hardDeleted && !isExcludedFromCalc(r);
  if (isAdmin() || isCaissier() || isSpectateur()) return _dbCache.filter(vivante);
  const uid = _currentUser?.username;
  if (!uid) return [];
  return _dbCache.filter(r => vivante(r) && r.createdBy === uid);
}

// Stub conservé pour compatibilité (anciens appels éventuels)
function toggleClesComptabilite() {}
function updateClesToggleUI() {
  const box = document.getElementById('caisse-cles-toggle');
  if (box) box.style.display = 'none';
}


// ── Loading overlay ──────────────────────────────────────────────────
function showLoading(msg) {
  const el = document.getElementById('loading-overlay');
  const lb = document.getElementById('loading-label');
  if (lb) lb.textContent = msg || 'Chargement…';
  if (el) el.classList.add('active');
}
function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.classList.remove('active');
}

async function refreshDB(force) {
  // ✅ v13.68 — CHARGEMENT COMPLET, filtrage côté client.
  //
  //   Avant (v13.28 → v13.67), on ne demandait au serveur que la période
  //   affichée dans l'Historique (par défaut « ce mois »). Le cache ne
  //   contenait donc QUE le mois courant, alors que les Ristournes, les
  //   Statistiques et le rapport PDF ont chacun leur propre sélecteur de
  //   mois : choisir un mois passé ne déclenchait aucun rechargement et
  //   renvoyait « Aucune activité » alors que les fiches existaient bien.
  //
  //   On charge maintenant toutes les fiches en métadonnées légères
  //   (p_limit 20000, sans filtre de date) et chaque vue filtre son cache
  //   via filterByDateRange / le préfixe de mois. L'Historique reste
  //   correct : renderHistory() applique filterByDateRange sur les champs
  //   de date que setHistPeriode alimente.
  if (!force && _dbCache.length) return _dbCache;
  if (!navigator.onLine) return _dbCache;
  let data, error;
  try {
    ({ data, error } = await _sb.rpc('get_resultats_light', { p_token: TK(), p_limit: 20000 }));
  } catch (e) {
    if (isNetworkError(e)) return _dbCache;
    console.error('Erreur de chargement Supabase:', e);
    toast('Impossible de charger les données distantes', 'err');
    return _dbCache;
  }
  if (error) {
    console.error('Erreur de chargement Supabase:', error);
    toast('Impossible de charger les données distantes', 'err');
    return _dbCache;
  }
  const pendings = _dbCache.filter(r => r._pending); // conserver les fiches en attente
  _dbCache = (data || []).map(row => ({
    id: row.id, type: row.type, patient: row.patient,
    resultats: row.resultats || {}, savedAt: row.created_at,
    createdBy: row.created_by, montant: row.montant || 0,
    prescripteur_id: row.prescripteur_id,
    est_bpn: row.est_bpn || false,
    restrictedBy: row.restricted_by || null, // présent si le RPC retourne la colonne
    _light: true,
  })).concat(pendings);
  if (typeof buildPatientCache === 'function') buildPatientCache();
  if (typeof refreshMedecinDatalist === 'function') refreshMedecinDatalist();
  if (typeof updateHistoriqueBadge === 'function') updateHistoriqueBadge();

  // ✅ v13.30 — Merger les restrictions depuis un RPC dédié.
  // Nécessaire car get_resultats_light a été créé avant la colonne restricted_by
  // et ne la retourne pas forcément. On récupère les fiches restreintes séparément
  // et on met à jour le cache, ce qui rend getDB() fonctionnel pour tous les profils.
  try {
    const { data: rests } = await _sb.rpc('get_restriction_status', { p_token: TK() });
    if (rests && Array.isArray(rests)) {
      const restrictMap = {};
      rests.forEach(x => { if (x.id) restrictMap[x.id] = x.restricted_by || null; });
      _dbCache.forEach(r => {
        // Si le RPC dédié retourne une info, elle prime sur la valeur éventuelle du cache
        if (restrictMap[r.id] !== undefined) r.restrictedBy = restrictMap[r.id];
        // Si l'id n'est pas dans la map → fiche non restreinte
        else if (!r._pending) r.restrictedBy = null;
      });
    }
  } catch (e) { /* RPC absent ou réseau — on garde la valeur courante du cache */ }

  // ✅ v13.31 — Merger le statut soft-delete depuis get_deleted_status
  try {
    const { data: delRows } = await _sb.rpc('get_deleted_status', { p_token: TK() });
    if (delRows && Array.isArray(delRows)) {
      const delMap = {};
      delRows.forEach(x => { if (x.id) delMap[x.id] = { deletedAt: x.deleted_at, deletedBy: x.deleted_by }; });
      _dbCache.forEach(r => {
        if (delMap[r.id]) { r.deletedAt = delMap[r.id].deletedAt; r.deletedBy = delMap[r.id].deletedBy; }
        else if (!r._pending) { r.deletedAt = null; r.deletedBy = null; }
      });
    }
  } catch (e) { /* RPC absent — on garde la valeur courante */ }

  return _dbCache;
}

// ✅ v13.5 — Charge le détail complet d'UNE fiche à la demande (ouverture,
// édition, export, impression, fusion). Sans ça, resultats ne contient que
// les métadonnées « _… » et les valeurs d'analyses seraient absentes.
async function ensureFull(record) {
  if (!record || !record._light || record._pending) return record;
  if (!navigator.onLine) return record;
  try {
    const { data, error } = await _sb.rpc('get_resultat_full', { p_token: TK(), p_id: record.id });
    if (error || !data) return record;
    record.resultats = data.resultats || {};
    record._light = false;
    const idx = _dbCache.findIndex(r => r.id === record.id);
    if (idx >= 0) { _dbCache[idx].resultats = record.resultats; _dbCache[idx]._light = false; }
  } catch (e) { /* garder ce qu'on a en cas d'échec réseau */ }
  return record;
}

// ✅ v13.5 — Charge le détail complet de TOUTES les fiches (export global).
async function refreshDBFull() {
  if (!navigator.onLine) return _dbCache;
  try {
    const { data, error } = await _sb.rpc('get_resultats', { p_token: TK() });
    if (error || !data) return _dbCache;
    const pendings = _dbCache.filter(r => r._pending);
    _dbCache = data.map(row => ({
      id: row.id, type: row.type, patient: row.patient,
      resultats: row.resultats || {}, savedAt: row.created_at,
      createdBy: row.created_by, montant: row.montant || 0,
      prescripteur_id: row.prescripteur_id, est_bpn: row.est_bpn || false,
      restrictedBy: row.restricted_by || null, // ✅ v13.30
      _light: false,
    })).concat(pendings);
    if (typeof buildPatientCache === 'function') buildPatientCache();
    if (typeof refreshMedecinDatalist === 'function') refreshMedecinDatalist(); // ✅ v13.28 F2
    if (typeof updateHistoriqueBadge === 'function') updateHistoriqueBadge();    // ✅ v13.28 F10
  } catch (e) { /* garder le cache */ }
  return _dbCache;
}

// ══════════════════════════════════════════════════════════════
// ✅ v13.4 — FILE D'ATTENTE HORS-LIGNE (best-effort)
// Capture les écritures échouées pour cause réseau et les rejoue au
// retour de la connexion. Ne stocke PAS le jeton (reconstruit à la
// synchro). Ne vise pas une base offline-first complète : c'est un
// filet de sécurité contre la perte de saisies sur le terrain.
// ⚠ Le numéro de dossier attribué hors-ligne provient du calcul local
//   (cache) et est conservé tel quel à la synchro ; en cas de saisies
//   simultanées sur plusieurs postes hors-ligne, vérifiez l'unicité.
// ══════════════════════════════════════════════════════════════
const SYNC_QUEUE_KEY = 'labo_sync_queue';
let _syncing = false;

function loadSyncQueue() {
  try { return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]'); }
  catch(e) { return []; }
}
function saveSyncQueue(q) {
  try { localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(q)); } catch(e){}
  updateSyncBanner();
}
function queueLength() { return loadSyncQueue().length; }

function isNetworkError(e) {
  if (!navigator.onLine) return true;
  const m = (e && (e.message || e.msg || '')) + '';
  return m.includes('Failed to fetch') || m.includes('NetworkError')
      || m.includes('network') || m.includes('fetch');
}

function updateSyncBanner() {
  const bar = document.getElementById('sync-banner');
  if (!bar) return;
  const n = queueLength();
  if (n > 0) {
    bar.style.display = 'block';
    const lbl = document.getElementById('sync-banner-label');
    if (lbl) lbl.textContent = '⏳ ' + n + ' enregistrement' + (n>1?'s':'') + ' en attente de synchronisation';
  } else {
    bar.style.display = 'none';
  }
}

// Enfile un insert et renvoie une fiche « en attente » (id temporaire)
function enqueueInsert(record, est_bpn) {
  const tempId = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
  const q = loadSyncQueue();
  q.push({ qid: tempId, op: 'insert', tempId, record, est_bpn, queuedAt: new Date().toISOString() });
  saveSyncQueue(q);
  const pending = { id: tempId, type: record.type, patient: record.patient,
    resultats: record.resultats, savedAt: new Date().toISOString(),
    createdBy: (_currentUser?.username || ''), montant: record.montant || 0,
    prescripteur_id: record.prescripteur_id || null, est_bpn, _pending: true };
  _dbCache.push(pending);
  toast('📴 Hors ligne — enregistré localement, synchronisation au retour du réseau', 'ok');
  return pending;
}

// Enfile une mise à jour. Si l'id cible est encore temporaire (fiche créée
// hors-ligne non synchronisée), on met simplement à jour la charge en file.
function enqueueUpdate(id, record, est_bpn) {
  const q = loadSyncQueue();
  if (String(id).startsWith('tmp_')) {
    const it = q.find(x => x.op === 'insert' && x.tempId === id);
    if (it) { it.record = record; it.est_bpn = est_bpn; saveSyncQueue(q); }
  } else {
    q.push({ qid: 'upd_' + id + '_' + Date.now(), op: 'update', id, record, est_bpn, queuedAt: new Date().toISOString() });
    saveSyncQueue(q);
  }
  const idx = _dbCache.findIndex(r => r.id === id);
  const upd = { id, type: 'Dossier', patient: record.patient, resultats: record.resultats,
    savedAt: new Date().toISOString(), createdBy: (_currentUser?.username || ''),
    montant: record.montant || 0, prescripteur_id: record.prescripteur_id || null, est_bpn, _pending: true };
  if (idx >= 0) _dbCache[idx] = { ..._dbCache[idx], ...upd }; else _dbCache.push(upd);
  toast('📴 Hors ligne — modification enregistrée localement', 'ok');
  return upd;
}

function removeFromQueue(qid) {
  saveSyncQueue(loadSyncQueue().filter(x => x.qid !== qid));
}

// ✅ v13.33 — Enfile une action simple (toggle_restriction / soft_delete_dossier)
// portant sur une fiche déjà en base. Ces RPC ne prennent qu'un id.
function enqueueAction(rpc, id) {
  const q = loadSyncQueue();
  // Si l'action porte sur une fiche encore temporaire (créée hors ligne),
  // elle sera rejouée après l'insert — on la met en file avec l'id temporaire,
  // flushSyncQueue résoudra l'id réel au moment du rejeu.
  q.push({ qid: rpc + '_' + id + '_' + Date.now(), op: 'action', rpc, id, queuedAt: new Date().toISOString() });
  saveSyncQueue(q);
  updateSyncBanner();
}

// Rejoue la file. Reconstruit les paramètres avec le jeton courant.
async function flushSyncQueue(silent) {
  if (_syncing || !navigator.onLine || !TK()) return;
  const q = loadSyncQueue();
  if (!q.length) return;
  _syncing = true;
  let ok = 0;
  for (const item of q) {
    try {
      if (item.op === 'insert') {
        const { data, error } = await _sb.rpc('insert_resultat', {
          p_token: TK(), p_type: item.record.type, p_patient: item.record.patient,
          p_resultats: item.record.resultats, p_montant: item.record.montant || 0,
          p_prescripteur_id: item.record.prescripteur_id || null, p_est_bpn: item.est_bpn });
        if (error) throw error;
        // ✅ v13.28 — insert_resultat retourne jsonb {id, dossier}
        const newId = data?.id || (Array.isArray(data) ? data[0]?.id : null);
        const saved = { id: newId, type: item.record.type, patient: item.record.patient,
          resultats: item.record.resultats, savedAt: new Date().toISOString(),
          createdBy: item.record.createdBy || '', montant: item.record.montant || 0,
          prescripteur_id: item.record.prescripteur_id, est_bpn: item.est_bpn };
        const idx = _dbCache.findIndex(r => r.id === item.tempId);
        if (idx >= 0) _dbCache[idx] = saved; else _dbCache.push(saved);
        removeFromQueue(item.qid); ok++;
      } else if (item.op === 'action') {
        // ✅ v13.33 — Rejeu d'une action différée (masquer / corbeille)
        let realId = item.id;
        // Si l'id est temporaire, retrouver l'id réel de la fiche synchronisée
        if (String(realId).startsWith('tmp_')) {
          const rec = _dbCache.find(r => r._prevTempId === realId || r.id === realId);
          if (rec && !String(rec.id).startsWith('tmp_')) realId = rec.id;
          else { removeFromQueue(item.qid); continue; } // fiche pas encore synchro → on saute
        }
        const { error } = await _sb.rpc(item.rpc, { p_token: TK(), p_id: realId });
        if (error) throw error;
        removeFromQueue(item.qid); ok++;
      } else if (item.op === 'update') {
        const { data, error } = await _sb.rpc('update_resultat', {
          p_token: TK(), p_id: item.id, p_patient: item.record.patient,
          p_resultats: item.record.resultats, p_montant: item.record.montant || 0,
          p_prescripteur_id: item.record.prescripteur_id || null, p_est_bpn: item.est_bpn });
        if (error) throw error;
        const idx = _dbCache.findIndex(r => r.id === item.id);
        if (idx >= 0) _dbCache[idx] = { id: data.id, type: data.type, patient: data.patient,
          resultats: data.resultats, savedAt: data.created_at, createdBy: data.created_by,
          montant: data.montant || 0, prescripteur_id: data.prescripteur_id, est_bpn: data.est_bpn };
        removeFromQueue(item.qid); ok++;
      }
    } catch (e) {
      if (isNetworkError(e)) break;               // toujours hors-ligne → on s'arrête
      console.error('Synchro : échec non-réseau, élément conservé :', e, item);
      break;                                       // erreur serveur → stop pour éviter une boucle
    }
  }
  _syncing = false;
  updateSyncBanner();
  if (ok > 0) {
    if (!silent) toast('✅ ' + ok + ' enregistrement' + (ok>1?'s':'') + ' synchronisé' + (ok>1?'s':''), 'ok');
    if (typeof renderHistory === 'function') renderHistory(true);
  }
}

async function insertRecordRemote(record) {
  // ✅ v13 — insertion via RPC sécurisée par jeton
  const est_bpn = record.type === 'Bilan prénatal' || (record.resultats?._types||[]).includes('Bilan prénatal');
  if (!navigator.onLine) return enqueueInsert(record, est_bpn); // ✅ v13.4 — hors-ligne connu
  try {
    const { data, error } = await _sb.rpc('insert_resultat', {
      p_token: TK(),
      p_type: record.type,
      p_patient: record.patient,
      p_resultats: record.resultats,
      p_montant: record.montant || 0,
      p_prescripteur_id: record.prescripteur_id || null,
      p_est_bpn: est_bpn,
    });
    if (error) throw error;
    // ✅ v13.28 — insert_resultat retourne jsonb {id, dossier}
    const newId = data?.id || (Array.isArray(data) ? data[0]?.id : null);
    const saved = { id: newId, type: record.type, patient: record.patient,
      resultats: record.resultats, savedAt: new Date().toISOString(),
      createdBy: record.createdBy || '', montant: record.montant || 0,
      prescripteur_id: record.prescripteur_id, est_bpn: est_bpn };
    _dbCache.push(saved);
    return saved;
  } catch (e) {
    if (isNetworkError(e)) return enqueueInsert(record, est_bpn); // ✅ v13.4 — bascule en file
    console.error('Erreur insertion Supabase:', e);
    toast("Échec de l'enregistrement distant", 'err');
    return null;
  }
}

// Met à jour une fiche existante (édition depuis l'historique)
async function updateRecordRemote(id, record, opts = {}) {
  // ✅ v13.34 — opts.onlyPatient : ne met à jour que les infos patient (pas résultats ni montant)
  // opts.onlyResultats : ne met à jour que les résultats (montant gelé au cache)
  const est_bpn = record.type === 'Bilan prénatal' || (record.resultats?._types||[]).includes('Bilan prénatal');
  if (!navigator.onLine || String(id).startsWith('tmp_')) return enqueueUpdate(id, record, est_bpn);

  // Construire le payload selon ce qu'on modifie
  const payload = { p_token: TK(), p_id: id, p_est_bpn: est_bpn };
  if (!opts.onlyResultats) {
    payload.p_patient = record.patient;
    payload.p_prescripteur_id = record.prescripteur_id || null;
  }
  if (!opts.onlyPatient) {
    payload.p_resultats = record.resultats;
    // ✅ Montant gelé si on modifie uniquement les résultats
    const cachedRecord = _dbCache.find(r => r.id === id);
    payload.p_montant = opts.onlyResultats
      ? (cachedRecord?.montant || record.montant || 0)
      : (record.montant || 0);
  } else {
    // onlyPatient : garder montant et résultats existants
    const cachedRecord = _dbCache.find(r => r.id === id);
    payload.p_resultats = cachedRecord?.resultats || record.resultats;
    payload.p_montant   = cachedRecord?.montant   || record.montant || 0;
  }

  try {
    const { data, error } = await _sb.rpc('update_resultat', payload);
    if (error) throw error;
    // ✅ v13.90 — Le RPC renvoie la ligne mise à jour. S'il renvoie autre
    // chose (droit refusé, ancienne version de la fonction), on recopiait
    // `undefined` dans le cache : la fiche perdait son patient et TOUT
    // l'Historique cessait de s'afficher. Mieux vaut échouer franchement.
    if (!data || typeof data !== 'object' || data.id === undefined) {
      throw new Error('Réponse inattendue du serveur : ' + JSON.stringify(data));
    }
    const idx = _dbCache.findIndex(r => r.id === id);
    const updated = { id: data.id, type: data.type, patient: data.patient, resultats: data.resultats, savedAt: data.created_at, createdBy: data.created_by, montant: data.montant || 0, prescripteur_id: data.prescripteur_id, est_bpn: data.est_bpn };
    if (idx >= 0) _dbCache[idx] = updated; else _dbCache.push(updated);
    return updated;
  } catch (e) {
    if (isNetworkError(e)) return enqueueUpdate(id, record, est_bpn); // ✅ v13.4
    console.error('Erreur mise à jour Supabase:', e);
    toast('Échec de la mise à jour', 'err');
    return null;
  }
}

async function deleteRecordRemote(id) {
  if (!_currentUser) { toast('Session expirée, reconnectez-vous', 'err'); return false; }
  // ✅ v13.4 — fiche créée hors-ligne non encore synchronisée : retirer de la file
  if (String(id).startsWith('tmp_')) {
    saveSyncQueue(loadSyncQueue().filter(x => x.tempId !== id));
    _dbCache = _dbCache.filter(r => r.id !== id);
    return true;
  }
  const { data, error } = await _sb.rpc('delete_resultat_admin', { p_token: TK(), p_resultat_id: id });
  if (error) {
    console.error('Erreur suppression Supabase:', error);
    toast('Échec de la suppression distante', 'err');
    return false;
  }
  if (data !== true) {
    toast('Seul un administrateur peut supprimer une fiche', 'err');
    return false;
  }
  // ✅ v13.33 — Trace permanente : la fiche reste dans le cache admin
  // marquée _hardDeleted, visible en corbeille admin, aucune action possible.
  const hdRec = _dbCache.find(r => r.id === id);
  if (hdRec) {
    hdRec._hardDeleted = true;
    if (!hdRec.deletedAt) hdRec.deletedAt = new Date().toISOString();
  } else {
    _dbCache = _dbCache.filter(r => r.id !== id);
  }
  return true;
}

async function clearAllRemote() {
  if (!_currentUser) { toast('Session expirée, reconnectez-vous', 'err'); return false; }
  const { data, error } = await _sb.rpc('clear_resultats_admin', { p_token: TK() });
  if (error) {
    console.error('Erreur vidage Supabase:', error);
    toast('Échec du vidage distant', 'err');
    return false;
  }
  if (data !== true) {
    toast('Seul un administrateur peut vider l\'historique', 'err');
    return false;
  }
  _dbCache = [];
  return true;
}

// ✅ v12 — Échappement HTML : à appliquer à TOUTE donnée issue de la base
// avant insertion dans innerHTML (protection XSS stocké).
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ✅ v13.50 — Force la saisie en MAJUSCULES en conservant la position du curseur
function forcerMajuscule(el) {
  if (!el) return;
  const start = el.selectionStart, end = el.selectionEnd;
  const up = el.value.toUpperCase();
  if (up !== el.value) {
    el.value = up;
    try { el.setSelectionRange(start, end); } catch (e) {}
  }
}

function formatDossier(n) {
  // ✅ v13.30 — utiliser la date saisie dans le formulaire (résultats passés)
  // plutôt que la date système, afin que le suffixe -MMYY corresponde au mois du patient
  const dateVal = document.getElementById('p_date')?.value;
  const ref = (dateVal && dateVal.length === 10) ? new Date(dateVal + 'T00:00:00') : new Date();
  const mm = String(ref.getMonth() + 1).padStart(2, '0');
  const yy = String(ref.getFullYear()).slice(-2);
  return String(n).padStart(4, '0') + '-' + mm + yy;
}

// Génère le prochain numéro de dossier en se basant UNIQUEMENT sur
// l'historique réel (Supabase) pour le mois en cours : on cherche le
// PREMIER numéro manquant dans la séquence (1, 2, 3...), en comblant
// les trous. Aucune mémoire locale (localStorage) n'est utilisée : le
// calcul est refait à chaque fois depuis les données réelles, pour que
// le numéro proposé soit toujours juste, même après suppression d'une
// fiche ou changement de poste/navigateur.
async function getNextDossierNum() {
  // ✅ v13.30 — calculer le suffixe depuis p_date (résultats passés/futurs) et non la date système
  const dateVal = document.getElementById('p_date')?.value;
  const ref = (dateVal && dateVal.length === 10) ? new Date(dateVal + 'T00:00:00') : new Date();
  const mm = String(ref.getMonth() + 1).padStart(2, '0');
  const yy = String(ref.getFullYear()).slice(-2);
  const suffix = '-' + mm + yy;

  // ── Essayer la RPC atomique Supabase en priorité (évite les doublons) ──
  try {
    // ✅ v13.80 — le compteur exige désormais un jeton : sans lui, n'importe
    // qui pouvait mesurer l'activité du laboratoire. Un poste resté sur une
    // ancienne version reçoit une erreur et bascule sur le calcul local
    // juste en dessous : la saisie n'est jamais bloquée.
    const { data, error } = await _sb.rpc('get_next_dossier_num',
      { p_month_year: mm + yy, p_token: TK() });
    if (!error && data && typeof data === 'number') {
      return data; // ✅ v12 — retourner le NOMBRE (formatDossier ajoute le suffixe)
    }
  } catch(e) { /* fallback client-side si RPC non disponible */ }

  // ── Fallback : calcul local (base déjà chargée) ──
  await refreshDB();
  // ✅ v13.30 — Utiliser le cache COMPLET (_dbCache), pas getDB() : les numéros de
  //   dossier doivent rester uniques même face aux fiches verrouillées par d'autres
  //   profils (invisibles via getDB) — sinon risque de collision de numéro.
  const db = _dbCache;

  // Construire l'ensemble des numéros déjà utilisés ce mois-ci dans l'historique
  const numerosExistants = new Set();
  db.forEach(r => {
    const dossier = r.patient && r.patient.dossier;
    if (dossier && dossier.endsWith(suffix)) {
      const num = parseInt(dossier.split('-')[0]);
      if (!isNaN(num)) numerosExistants.add(num);
    }
  });

  // Chercher le premier numéro manquant à partir de 1 (comble les trous)
  let n = 1;
  while (numerosExistants.has(n)) {
    n++;
  }
  return n;
}

async function regenDossier() {
  const dossierEl = document.getElementById('p_dossier');
  if (dossierEl) dossierEl.value = '…';
  const n = await getNextDossierNum();
  if (dossierEl) dossierEl.value = formatDossier(n);
}

async function newPatient() {
  if (!await showConfirmModal({
    icon: '🆕', title: 'Nouveau patient ?',
    message: 'Les informations en cours seront effacées. Les fiches déjà enregistrées ne sont pas supprimées.',
    confirmText: 'Confirmer', cancelText: 'Annuler'
  })) return;
  await resetFicheIdentif();
}

// ✅ v13.37 — Réinitialisation de la fiche d'accueil SANS confirmation. Réutilisée
// par newPatient() (après confirmation) et par l'enregistrement d'un nouveau
// patient depuis la Caisse (caisseNouveauPatient).
async function resetFicheIdentif() {
  // Repartir sur une session propre : mode filtré réactivé, plus en mode édition
  _showAllExams = false;
  _editingRecordId = null;
  _editingFicheId  = null; // ✅ v13.29
  _locksDisabled = false;
  _shareTokenCurrent = null; // Nouveau patient → nouveau token de partage
  // ✅ v13.114 — Sortir du mode « tout sur une page » (nouvelle saisie) et
  // restaurer l'affichage normal par onglets + les boutons par onglet.
  if (typeof _fillAllMode !== 'undefined') _fillAllMode = false;
  document.body.classList.remove('fill-all-mode');
  document.querySelectorAll('button[onclick^="saveThenNext"]').forEach(b => b.style.display = '');
  // Ré-afficher les lignes masquées par hideUncheckedExamRows() (fill-all).
  document.querySelectorAll('#zone-saisie tr, #zone-saisie .abg-row').forEach(row => { row.style.display = ''; });
  // ✅ v13.117 — Cacher le bouton « Enregistrer + Imprimer » hors vue empilée.
  { const pb = document.getElementById('btn-save-print'); if (pb) pb.style.display = 'none'; }

  const banner = document.getElementById('edit-mode-banner');
  if (banner) banner.style.display = 'none';
  const ficheBanner = document.getElementById('fiche-edit-banner');
  if (ficheBanner) ficheBanner.style.display = 'none';
  const dossEl = document.getElementById('p_dossier');
  if (dossEl) dossEl.style.outline = '';
  const btnSaveF = document.querySelector('button[onclick="enregistrerFicheIdentif()"]');
  if (btnSaveF) btnSaveF.innerHTML = '💾 Enregistrer sans saisie';
  // Effacer les infos patient
  ['p_nom','p_medecin','p_clinique','p_telephone'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  ['p_age'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  ['p_sexe','p_service'].forEach(id => { const el = document.getElementById(id); if(el) el.selectedIndex = 0; });
  // ✅ v13.29 — re-synchroniser p_medecin depuis le prescripteur encore sélectionné
  // (évite que le médecin reste vide pour les patients consécutifs du même prescripteur)
  if (typeof onPrescripteurChange === 'function') onPrescripteurChange();
  // ✅ v13.30 — NE PAS écraser la date : si l'utilisateur saisit des résultats passés,
  // la date reste inchangée pour tous les patients consécutifs de la même session.
  // Si le champ est vide (premier lancement), on met la date du jour comme fallback.
  if (!document.getElementById('p_date').value) {
    document.getElementById('p_date').value = new Date().toISOString().slice(0,10);
  }
  // Effacer tous les panneaux de résultats
  ['hema','bio','bacterio','sero','parasito'].forEach(name => resetPanel(name));
  // Générer un nouveau numéro de dossier (vérifié contre l'historique réel)
  await regenDossier();
  // Remettre les prix de référence (les prix modifiés manuellement sont effacés)
  rechargeFichePrix();
  // Décocher tous les examens (catalogue + custom)
  getCatalogueComplet().forEach(ex => {
    const chk = document.getElementById(ex.id);
    if (chk) chk.checked = false;
  });
  calcFicheTotal();
  // Revenir à la fiche d'identification si on est en zone saisie
  const zoneSaisie = document.getElementById('zone-saisie');
  const ficheIdentif = document.getElementById('fiche-identification');
  if (zoneSaisie) zoneSaisie.style.display = 'none';
  if (ficheIdentif) ficheIdentif.style.display = '';
  toast('Nouveau patient prêt ✓', 'ok');
}

// ✅ v13.37 — Enregistrement d'un nouveau patient depuis la CAISSE.
// Le caissier ouvre la fiche d'accueil (patient + examens + montant) et clique
// « Enregistrer sans saisie ». Les résultats ne sont PAS liés ici (le bouton
// « Démarrer la saisie » est masqué pour le caissier).
let _caisseNewPatientMode = false;
async function caisseNouveauPatient() {
  if (isSpectateur()) { blockIfSpectateur(); return; }
  if (!isAdmin() && !isCaissier()) return;
  _caisseNewPatientMode = true;         // autorise l'accès temporaire à la fiche
  showView('saisie');
  await resetFicheIdentif();
  // Afficher la fiche d'accueil, masquer la zone de saisie des résultats
  const zone = document.getElementById('zone-saisie');
  const fiche = document.getElementById('fiche-identification');
  if (zone) zone.style.display = 'none';
  if (fiche) fiche.style.display = '';
  // Caissier : masquer « Démarrer la saisie des résultats » (facture uniquement)
  const btnDemarrer = document.querySelector('button[onclick="demarrerSaisie()"]');
  if (btnDemarrer) btnDemarrer.style.display = isCaissier() ? 'none' : '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  toast('👤 Nouveau patient — remplissez la fiche puis « Enregistrer »', 'ok');
}

// Déduit le texte d'interprétation (pour les exports PDF/Excel/impression)
// à partir de la classe de coloration appliquée sur la case Valeur (NFS),
// puisque ces tableaux n'ont plus de colonne Interprétation visible à l'écran.
function getValColorInterp(id) {
  const el = document.getElementById('v_' + id);
  if (!el) return '';
  if (el.classList.contains('val-hi')) return 'Élevé';
  if (el.classList.contains('val-lo')) return 'Bas';
  return el.value ? 'Normal' : '';
}

function collectResults(type) {
  const data = {};
  if (type === 'Hématologie') {
    // NFS — paramètres principaux
    [...HEMA_PARAMS].forEach(p => {
      const valeur = document.getElementById('v_'+p.id)?.value || '';
      data[p.name] = {
        valeur, unite: getUnit(p.id, p.unit),
        interp: getValColorInterp(p.id),
        absolu: '',
      };
    });
    // FL — stocker la valeur absolue (G/L) comme valeur principale, % en metadata
    // ✅ v13.26 : export = valeur absolue × 1000 en /µL
    HEMA_FL.forEach(p => {
      const pct    = document.getElementById('v_'+p.id)?.value || '';
      const absEl  = document.getElementById('abs_'+p.id);
      const absVal = absEl ? parseFloat(absEl.textContent) : NaN;
      const valUL  = !isNaN(absVal) ? Math.round(absVal * 1000) : '';
      data[p.name] = {
        valeur: valUL !== '' ? String(valUL) : pct,
        unite:  valUL !== '' ? '/µL' : '%',
        pct,
        interp: getValColorInterp(p.id),
        absolu: '',
      };
    });
    // Électrophorèse Hb
    EPHB_FRACTIONS.forEach(p => {
      const v = document.getElementById(p.id)?.value || '';
      if (v) data[p.name] = { valeur: v, unite: '%', interp: document.getElementById('i_'+p.id)?.textContent || '' };
    });
    data['Profil Hb'] = document.getElementById('ephb_profil')?.value || '';
    data['Commentaire Hb'] = document.getElementById('ephb_commentaire')?.value || '';
    // GE / Parasitologie
    data['GE - Résultat'] = document.getElementById('ge_result')?.value || '';
    data['GE - Espèce'] = document.getElementById('ge_espece')?.value || '';
    data['GE - Parasitémie (%)'] = document.getElementById('ge_para')?.value || '';
    data['GE - Densité parasitaire (/µL)'] = document.getElementById('ge_densite')?.value || '';
    data['GE - Stade'] = document.getElementById('ge_stade')?.value || '';
    data['GE - TDR'] = document.getElementById('ge_tdr')?.value || '';
    data['GE - Observation'] = document.getElementById('ge_obs')?.value || '';
    // ✅ v13.36 — CORRECTIF CONTAMINATION INTER-PATIENTS : CRP / Widal / GS vivent
    // sur le panneau Sérologie et n'étaient jamais vidés après un enregistrement
    // Hématologie. On ne les collecte donc QUE si l'examen correspondant est
    // effectivement coché (sinon on héritait des valeurs du patient précédent).
    // Ils restent aussi collectés sous 'Immuno-Sérologie'.
    if (document.getElementById('ex_gs')?.checked) {
      data['GS - ABO'] = document.getElementById('gs_abo_hema')?.value || '';
      data['GS - Rhésus'] = document.getElementById('gs_rh_hema')?.value || '';
      data['GS - RAI'] = document.getElementById('gs_rai_hema')?.value || '';
      data['GS - Phénotype'] = document.getElementById('gs_phenotype_hema')?.value || '';
    }
    if (document.getElementById('ex_crp')?.checked) {
      data['CRP - Valeur'] = document.getElementById('crp_valeur')?.value || '';
      data['CRP - Interprétation'] = document.getElementById('crp_interp')?.textContent || '';
    }
    if (document.getElementById('ex_widal')?.checked) {
      WIDAL_ANTIGENES.forEach(ag => {
        data['Widal - ' + ag.name] = {
          titre: document.getElementById('widal_'+ag.id)?.value || '',
          cinetique: document.getElementById('widal_cin_'+ag.id)?.value || '',
          interp: document.getElementById('widal_i_'+ag.id)?.textContent || '',
        };
      });
      data['Widal - Conclusion'] = document.getElementById('widal-conclusion')?.textContent || '';
    }

  } else if (type === 'Biochimie') {
    [...BIO_GLUCIDES,...BIO_REIN,...BIO_FOIE,...BIO_LIPIDES,...BIO_IONO,...BIO_FER,...BIO_CARD,...BIO_HORM,...BIO_COAG,...BIO_AUTRE].forEach(p => {
      data[p.name] = { valeur: document.getElementById('v_'+p.id)?.value || '', unite: getUnit(p.id, p.unit), interp: document.getElementById('i_'+p.id)?.textContent || '' };
    });
  } else if (type === 'Bactériologie') {
    // Infos générales
    data['Type de prélèvement'] = document.getElementById('bac_type')?.value || '';
    data['Site / Précision'] = document.getElementById('bac_site')?.value || '';
    data['Date de prélèvement'] = document.getElementById('bac_datetime')?.value || '';
    // Macroscopie
    data['Aspect'] = document.getElementById('bac_aspect')?.value || '';
    data['Couleur'] = document.getElementById('bac_couleur')?.value || '';
    data['Odeur'] = document.getElementById('bac_odeur')?.value || '';
    data['pH'] = document.getElementById('bac_ph')?.value || '';
    // État frais
    data['Leucocytes (/mm³)'] = document.getElementById('ef_leuco')?.value || '';
    data['Hématies (/mm³)'] = document.getElementById('ef_hematies')?.value || '';
    data['Cellules épithéliales'] = document.getElementById('ef_epitheliales')?.value || '';
    data['Cylindres'] = document.getElementById('ef_cylindres')?.value || '';
    data['Cristaux'] = document.getElementById('ef_cristaux')?.value || '';
    data['Bactéries (état frais)'] = document.getElementById('ef_bacteries')?.value || '';
    data['Levures'] = document.getElementById('ef_levures')?.value || '';
    data['Parasites'] = document.getElementById('ef_parasites')?.value || '';
    data['Spermatozoïdes'] = document.getElementById('ef_sperma')?.value || '';
    // Gram
    data['Coloration de Gram'] = document.getElementById('bac_gram')?.value || '';
    data['Gram - Abondance'] = document.getElementById('bac_gram_abond')?.value || '';
    data['Gram - Commentaire'] = document.getElementById('bac_gram_comment')?.value || '';
    // Culture
    data['Culture'] = document.getElementById('bac_culture')?.value || '';
    data['Numération bactérienne'] = document.getElementById('bac_numeration')?.value || '';
    data['Germe identifié'] = document.getElementById('bac_germe')?.value || '';
    data['2ème germe'] = document.getElementById('bac_germe2')?.value || '';
    data['Milieux de culture'] = document.getElementById('bac_milieux')?.value || '';
    data['Observations'] = document.getElementById('bac_obs')?.value || '';
    data['Mode: ABG/AFG'] = _abgMode;
    data['Commentaire antibiogramme'] = document.getElementById('bac_abg_comment')?.value || '';
    // Antibiogramme / Antifongigramme
    const grid = _abgMode === 'abg' ? ABG_ANTIBIOS : AFG_ANTIFONGIQUES;
    const prefix = _abgMode === 'abg' ? 'abg_' : 'afg_';
    const keyPrefix = _abgMode === 'abg' ? 'ABG_' : 'AFG_';
    grid.forEach(ab => {
      const id = prefix + ab.replace(/[^a-z]/gi,'_');
      const sel = document.querySelector('#' + id + ' select');
      data[keyPrefix + ab] = sel ? sel.value : 'nd';
    });
  } else if (type === 'Immuno-Sérologie') {
    SERO_TESTS.forEach(t => {
      // ✅ v13.102 — champs unifiés (sr_/sv_/so_) + mode qual/quant choisi à la
      // saisie. La valeur chiffrée n'est conservée qu'en mode quantitatif.
      const mode = document.getElementById('smode_'+t.id)?.value
                   || (t.type === 'quant' ? 'quant' : 'qual');
      data[t.name] = {
        mode,
        resultat: document.getElementById('sr_'+t.id)?.value || '',
        valeur:   mode === 'quant' ? (document.getElementById('sv_'+t.id)?.value || '') : '',
        unite:    getUnit('sero_'+t.id, t.unit||''),
        obs:      document.getElementById('so_'+t.id)?.value || '',
      };
    });
    data['Observations'] = document.getElementById('sero_obs')?.value || '';
    // ✅ v13.24 — CRP, Widal et GS/Rh maintenant sur l'onglet Sérologie
    data['CRP - Valeur'] = document.getElementById('crp_valeur')?.value || '';
    data['CRP - Interprétation'] = document.getElementById('crp_interp')?.textContent || '';
    if (typeof WIDAL_ANTIGENES !== 'undefined') {
      WIDAL_ANTIGENES.forEach(ag => {
        const titre = document.getElementById('widal_'+ag.id)?.value || '';
        const cin   = document.getElementById('widal_cin_'+ag.id)?.value || '';
        const interp = document.getElementById('widal_i_'+ag.id)?.textContent || '';
        data['Widal - '+ag.name] = { titre, cinetique: cin, interp };
      });
      data['Widal - Conclusion'] = document.getElementById('widal-conclusion')?.textContent || '';
    }
    data['Groupe ABO'] = document.getElementById('gs_abo_hema')?.value || '';
    data['Rhésus']     = document.getElementById('gs_rh_hema')?.value  || '';
    data['Commentaire GS'] = '';
  } else if (type === 'Parasitologie') {
    data["Type d'examen"] = document.getElementById('para_type').value;
    data['Résultat global'] = document.getElementById('para_resultat').value;
    data['Coloration'] = document.getElementById('para_coloration').value;
    data['Espèce plasmodiale'] = document.getElementById('para_espece').value;
    data['Parasitémie (%)'] = document.getElementById('para_parasitemie').value;
    data['Densité parasitaire /µL'] = document.getElementById('para_densite').value;
    data['Stade parasitaire'] = document.getElementById('para_stade').value;
    data['Indice érythrocytaire'] = document.getElementById('para_indice').value;
    data['TDR paludisme'] = document.getElementById('para_tdr').value;
    PARA_EPS.forEach(pa => {
      const sel = document.getElementById('pe_' + pa.replace(/[^a-z]/gi,'_'));
      data[pa] = sel ? sel.value : '';
    });
    data['Observations'] = document.getElementById('para_obs').value;
  } else if (type === 'Groupe sanguin') {
    data['Groupe ABO'] = document.getElementById('gs_abo')?.value || '';
    data['Rhésus']     = document.getElementById('gs_rh')?.value  || '';
    data['Commentaire GS'] = document.getElementById('gs_obs')?.value || '';
  }
  return data;
}


// ── Autocomplete patient depuis l'historique ─────────────────────────
let _patientCache = [];   // { nom, age, sexe, medecin, service, clinique }

function buildPatientCache() {
  const db = getDB();
  const seen = new Set();
  _patientCache = [];
  // Tri anti-chronologique : on garde la visite la plus récente pour chaque profil distinct
  const sorted = [...db].sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0));
  sorted.forEach(r => {
    const p = r.patient;
    if (!p?.nom) return;
    const nom = (p.nom||'').toUpperCase().trim();
    // Clé composite : nom + âge + sexe + médecin
    // → deux homonymes avec des données différentes donnent deux entrées distinctes
    // → deux homonymes VRAIMENT identiques donnent une seule entrée (correct)
    const key = [nom, String(p.age||''), (p.sexe||'').toUpperCase(), (p.medecin||'').toUpperCase().trim()].join('|');
    if (!seen.has(key)) {
      seen.add(key);
      _patientCache.push({ ...p, nom, _lastVisit: r.created_at });
    }
  });
  _patientCache.sort((a,b) => a.nom.localeCompare(b.nom));
}

function onPatientNameInput() {
  const val = (document.getElementById('p_nom')?.value || '').toUpperCase().trim();
  const dl  = document.getElementById('patient-suggestions');
  if (!dl) return;
  if (!val || val.length < 2) { dl.style.display = 'none'; dl.innerHTML = ''; return; }

  const matches = _patientCache.filter(p => p.nom.includes(val)).slice(0, 10);
  if (!matches.length) { dl.style.display = 'none'; dl.innerHTML = ''; return; }

  dl.innerHTML = '';
  matches.forEach(p => {
    const item = document.createElement('div');
    item.style.cssText = 'padding:9px 13px;cursor:pointer;border-bottom:1px solid #f1f5f9;transition:background .1s';

    // Nombre de profils distincts avec ce même nom (pour décider si on affiche les détails)
    const sameNameCount = _patientCache.filter(x => x.nom === p.nom).length;

    const parts = [];
    if (p.age)    parts.push(p.age + ' ans');
    if (p.sexe)   parts.push(p.sexe === 'M' ? 'Homme' : 'Femme');
    if (p.medecin) parts.push('Dr ' + p.medecin);
    // Si plusieurs profils portent ce nom → afficher la date de la dernière visite pour distinguer
    if (sameNameCount > 1 && p._lastVisit) {
      const d = new Date(p._lastVisit);
      parts.push('dernière visite : ' + d.toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'}));
    }
    const subtitle = parts.join(' · ');

    item.innerHTML =
      '<div style="font-weight:600;color:#1e293b;font-size:13px">' + p.nom + '</div>' +
      (subtitle ? '<div style="font-size:11px;color:#64748b;margin-top:2px">' + subtitle + '</div>' : '');

    item.addEventListener('mouseover', () => { item.style.background = '#f0f9ff'; });
    item.addEventListener('mouseout',  () => { item.style.background = ''; });
    item.addEventListener('mousedown', e => {
      e.preventDefault(); // évite que onblur ferme le dropdown avant le click
      document.getElementById('p_nom').value = p.nom;
      _fillPatient(p);
      dl.style.display = 'none';
      dl.innerHTML = '';
    });
    dl.appendChild(item);
  });

  // Auto-sélection silencieuse si un seul profil correspond exactement au nom tapé
  const exactMatches = _patientCache.filter(p => p.nom === val);
  if (exactMatches.length === 1) {
    // Pré-remplir discrètement sans fermer le dropdown (l'utilisateur n'a pas encore confirmé)
  }

  dl.style.display = 'block';
}

function closePatientDropdown() {
  const dl = document.getElementById('patient-suggestions');
  if (dl) { dl.style.display = 'none'; dl.innerHTML = ''; }
}

function onPatientNameKey(e) {
  const dl = document.getElementById('patient-suggestions');
  if (!dl || dl.style.display === 'none') return;
  const items = [...dl.children];
  const activeIdx = items.findIndex(i => i.dataset.active === '1');

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    let next = e.key === 'ArrowDown'
      ? (activeIdx < 0 ? 0 : Math.min(activeIdx + 1, items.length - 1))
      : (activeIdx < 0 ? items.length - 1 : Math.max(activeIdx - 1, 0));
    items.forEach((it, i) => {
      it.style.background = i === next ? '#f0f9ff' : '';
      it.dataset.active = i === next ? '1' : '';
    });
  } else if (e.key === 'Enter' && activeIdx >= 0) {
    e.preventDefault();
    items[activeIdx].dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));
  } else if (e.key === 'Escape') {
    closePatientDropdown();
  }
}

// Remplit le formulaire patient depuis un objet de _patientCache
function _fillPatient(p) {
  const setV = (id, v) => { const el = document.getElementById(id); if (el && v != null && String(v) !== '') el.value = v; };
  setV('p_age',      p.age);
  setV('p_sexe',     p.sexe);
  setV('p_medecin',  p.medecin);
  setV('p_service',  p.service);
  setV('p_clinique', p.clinique);
  if (p.sexe || p.age) updateAllRefs();
  toast('Patient reconnu — informations pré-remplies ✓', 'ok');
}


// Met à jour le bandeau patient + indicateur d'analyses déjà sauvegardées
async function refreshRappelPatient() {
  const p = getPatient();
  const rappelNom  = document.getElementById('rappel-nom');
  const rappelDoss = document.getElementById('rappel-dossier');
  if (rappelNom)  rappelNom.textContent  = (p.nom||'').toUpperCase();
  if (rappelDoss) rappelDoss.textContent = 'N° ' + (p.dossier||'');

  // Afficher les analyses déjà enregistrées pour ce dossier
  const db = getDB();
  const existing = db.find(rr => isDossierRecord(rr) && rr.patient?.dossier === p.dossier);
  const savedEl = document.getElementById('rappel-saved-analyses');
  if (savedEl) {
    const types = existing ? getRecordTypes(existing) : [];
    savedEl.innerHTML = types.length
      ? '✓ ' + types.map(t => '<span style="display:inline-block;background:#dcfce7;color:#166534;border-radius:10px;padding:1px 7px;font-size:10px;font-weight:700;margin:0 2px">' + t.substring(0,4) + '</span>').join('') + ' enregistrés'
      : '';
  }
}

// ✅ v13 — Garde anti double-soumission : un double-clic (fréquent sur mobile
// ou connexion lente) pouvait créer deux dossiers pour le même patient.
let _saving = false;
async function saveRecord(type) {
  if (_saving) return;
  _saving = true;
  const btns = document.querySelectorAll('button[onclick^="saveRecord"]');
  btns.forEach(b => b.disabled = true);
  try {
    await _saveRecordImpl(type);
  } finally {
    _saving = false;
    btns.forEach(b => b.disabled = false);
  }
}

async function _saveRecordImpl(type) {
  const p = getPatient();
  if (!validatePatient(p)) return;
  // ✅ v13.35 — Bloquer la saisie si dossier non payé
  if (_editingRecordId && !isDossierPaye(_editingRecordId)) {
    // ✅ v13.103 — La saisie est libre depuis la v13.98 ; c'est l'ENREGISTREMENT
    // qui exige le paiement. Le message d'avant parlait encore de la saisie et
    // laissait croire à un blocage qui n'existe plus.
    toast('🔒 Paiement requis avant d\'enregistrer ce dossier', 'err');
    showView('caisse');
    return;
  }
  toast('Enregistrement en cours…');
  showLoading('Enregistrement…');

  const TYPE_TO_TAB = {
    'Hématologie': 'hema', 'Biochimie': 'bio', 'Bactériologie': 'bacterio',
    'Immuno-Sérologie': 'sero', 'Parasitologie': 'parasito',
    'Groupe sanguin': 'gs', // BPN supprimé v13.21
  };
  const tabKey = TYPE_TO_TAB[type] || 'hema';

  // Collecter les résultats de cette analyse
  ensureInterpFresh(type); // ✅ v13.7 — garantir des interprétations à jour avant collecte
  const typeResultats = collectResults(type);

  // ✅ v13.28 F4 — marquage des valeurs critiques (persisté dans patient.has_critical)
  try { if (checkValeursCritiques(typeResultats).length) p.has_critical = true; } catch (e) {}

  // Montant pour cette analyse
  let montant = 0;
  try {
    const montantEl = document.getElementById('montant-preview');
    const parTab = JSON.parse(montantEl?.dataset?.montantParTab || '{}');
    montant = parTab[tabKey] || 0;
    // ✅ v13.34 — Ne pas recalculer le montant depuis les champs remplis
    // (les examens non remplis feraient baisser le prix).
    // On utilise le montant affiché dans montant-preview, figé à la coche.
    if (!montant) {
      const previewEl = document.getElementById('montant-preview');
      const montantAffiche = parseInt((previewEl?.dataset?.montant || '0').replace(/\D/g,''), 10);
      montant = montantAffiche || calcFicheTotal() || calculateMontant(type, typeResultats);
    }
  } catch(e) {
    const previewEl = document.getElementById('montant-preview');
    montant = parseInt((previewEl?.dataset?.montant || '0').replace(/\D/g,''), 10)
              || calculateMontant(type, typeResultats);
  }

  // Examens cochés pour ce tab
  const examensCochesTab = getCatalogueComplet()
    .filter(ex => ex.tab === tabKey && document.getElementById(ex.id)?.checked)
    .map(ex => ex.label);
  // ✅ v13.12 — mémoriser le PRIX EXACT saisi sur la fiche pour chaque examen
  // coché (le reçu doit afficher ces prix-là, pas un recalcul des tarifs).
  const examensPrixTab = {};
  getCatalogueComplet()
    .filter(ex => ex.tab === tabKey && document.getElementById(ex.id)?.checked)
    .forEach(ex => {
      const pxEl = document.getElementById('px_' + ex.id);
      examensPrixTab[ex.label] = pxEl ? (parseInt(pxEl.value || '0') || 0) : (ex.prix || 0);
    });

  // ✅ v13.35 — Collecter TOUS les onglets avec des coches (même sans résultats saisis)
  // pour que l'historique affiche tous les types demandés dès l'enregistrement.
  const TAB_TO_TYPE_MAP = {
    hema:'Hématologie', bio:'Biochimie', bacterio:'Bactériologie',
    sero:'Immuno-Sérologie', parasito:'Parasitologie', gs:'Groupe sanguin'
  };
  const autresTabsCoches = {}; // { type: { coches: [...], prix: {...}, montant: N } }
  const montantParTab = JSON.parse(document.getElementById('montant-preview')?.dataset?.montantParTab || '{}');
  TAB_ORDER.forEach(tid => {
    if (tid === tabKey) return; // déjà traité
    const otherType = TAB_TO_TYPE_MAP[tid];
    if (!otherType) return;
    const coches = getCatalogueComplet()
      .filter(ex => ex.tab === tid && document.getElementById(ex.id)?.checked);
    if (!coches.length) return;
    const prix = {};
    coches.forEach(ex => {
      const pxEl = document.getElementById('px_' + ex.id);
      prix[ex.label] = pxEl ? (parseInt(pxEl.value || '0') || 0) : (ex.prix || 0);
    });
    autresTabsCoches[otherType] = {
      coches: coches.map(ex => ex.label),
      prix,
      montant: montantParTab[tid] || 0,
    };
  });

  const prescripteurId = document.getElementById('p_prescripteur_id')?.value || null;
  const dossier = p.dossier;

  // ── Mode édition d'une fiche existante ─────────────────────
  if (_editingRecordId) {
    const existing = getDB().find(rr => rr.id === _editingRecordId);
    if (!existing) { toast('Fiche introuvable', 'err'); return; }
    // ✅ v13.15 — NE PLUS forcer le type : on enregistre l'analyse de l'onglet
    // réellement sauvegardé (le bouton cliqué). Cela permet, en édition,
    // d'AJOUTER une nouvelle analyse (ex. Bactério) au dossier sans écraser
    // ni ranger les données sous le mauvais type.

    let newRes, newMontant;
    if (isDossierRecord(existing)) {
      const estNouveauType = !(existing.resultats?._types || []).includes(type);
      // Mise à jour / ajout d'une analyse dans le dossier
      newRes = { ...existing.resultats, [type]: typeResultats };
      if (!newRes._types) newRes._types = [];
      if (!newRes._types.includes(type)) newRes._types.push(type);
      if (examensCochesTab.length) {
        if (!newRes._examens_coches) newRes._examens_coches = {};
        newRes._examens_coches[type] = examensCochesTab;
        if (!newRes._examens_prix) newRes._examens_prix = { ...(existing.resultats?._examens_prix || {}) };
        newRes._examens_prix[type] = examensPrixTab;
      }
      // ✅ v13.28 — total correct : on met à jour le montant du type courant
      // dans _montants, puis on recalcule le TOTAL comme la somme de tous les
      // types. Robuste : pas d'accumulation ni de dérive.
      if (!newRes._montants) newRes._montants = { ...(existing.resultats?._montants || {}) };
      newRes._montants[type] = montant;
      newMontant = Object.values(newRes._montants).reduce((s, m) => s + (Number(m) || 0), 0);
    } else {
      // Ancien format : mise à jour directe
      newRes = typeResultats;
      if (examensCochesTab.length) { newRes['_examens_coches'] = examensCochesTab; newRes['_examens_prix'] = examensPrixTab; }
      newMontant = montant;
    }

    // ✅ v13.34 — Modifier résultats : ne touche QUE les résultats, montant gelé
    const saved = await updateRecordRemote(_editingRecordId, {
      patient: p, type: isDossierRecord(existing) ? 'Dossier' : type,
      resultats: newRes, montant: newMontant,
      prescripteur_id: prescripteurId || existing.prescripteur_id || null,
    }, { onlyResultats: true });
    if (saved) {
      hideLoading();
      _editingRecordId = null;
      _editingType     = null;
      // ✅ v13.34 — Restaurer updateMontantCurrent après édition
      if (window._updateMontantCurrent_orig) {
        window.updateMontantCurrent = window._updateMontantCurrent_orig;
        window._updateMontantCurrent_orig = null;
      }
      const montantEl = document.getElementById('montant-preview');
      if (montantEl) delete montantEl.dataset.montantGele;
      const banner = document.getElementById('edit-mode-banner');
      if (banner) banner.style.display = 'none';
      // ✅ v13.34 — Tout mettre à jour après modification
      renderHistory(true);
      if (typeof updateHistoriqueBadge === 'function') updateHistoriqueBadge();
      if (typeof renderDashboard === 'function') renderDashboard();
      if (typeof updateCorbeilleBtn === 'function') updateCorbeilleBtn();
      if (typeof updateMasqueesBtn === 'function') updateMasqueesBtn();
      // Revenir à l'historique pour voir la fiche modifiée
      showView('historique');
      toast(type + ' mis à jour ✓', 'ok');
    }
    return;
  }

  // ── Mode création : chercher un dossier existant pour ce patient ──
  // On rafraîchit d'abord pour être sûr d'avoir les données les plus récentes
  if (!getDB().length) await refreshDB();

  const existingDossier = getDB().find(rr =>
    isDossierRecord(rr) && rr.patient?.dossier === dossier
  );

  if (existingDossier) {
    // ✅ v13.5 — CHARGER LE DÉTAIL COMPLET avant de fusionner (sinon les autres
    // analyses du dossier, absentes du chargement allégé, seraient écrasées).
    await ensureFull(existingDossier);
    // Garde-fou anti-perte de données : chaque analyse annoncée par _types
    // doit être présente en détail ; sinon on refuse d'écrire.
    const declaredTypes = existingDossier.resultats?._types || [];
    const manquant = declaredTypes.find(t => !existingDossier.resultats[t]);
    if (existingDossier._light || manquant) {
      hideLoading();
      toast('⚠ Détail du dossier non chargé (réseau ?). Réessayez pour éviter toute perte.', 'err');
      return;
    }
    // ── Fusionner dans le dossier existant ─────────────────────
    const newRes = { ...existingDossier.resultats, [type]: typeResultats };
    if (!newRes._types) newRes._types = [];
    if (!newRes._types.includes(type)) newRes._types.push(type);
    if (examensCochesTab.length) {
      if (!newRes._examens_coches) newRes._examens_coches = {};
      newRes._examens_coches[type] = examensCochesTab;
      if (!newRes._examens_prix) newRes._examens_prix = { ...(existingDossier.resultats?._examens_prix || {}) };
      newRes._examens_prix[type] = examensPrixTab;
    }
    if (!newRes._montants) newRes._montants = {}; // ✅ v12 — mémorise le montant par analyse
    newRes._montants[type] = montant;
    // ✅ v13.35 — Intégrer les autres onglets cochés sans résultats
    Object.entries(autresTabsCoches).forEach(([otherType, data]) => {
      if (!newRes._types.includes(otherType)) newRes._types.push(otherType);
      if (!newRes[otherType]) newRes[otherType] = {};
      if (!newRes._examens_coches) newRes._examens_coches = {};
      newRes._examens_coches[otherType] = data.coches;
      if (!newRes._examens_prix) newRes._examens_prix = {};
      newRes._examens_prix[otherType] = data.prix;
      newRes._montants[otherType] = data.montant;
    });
    // ✅ v13.28 — Recalculer le TOTAL depuis _montants (somme de tous les types)
    // au lieu d'additionner à l'ancien total : évite l'accumulation si on
    // ré-enregistre le même type plusieurs fois.
    const newMontant = Object.values(newRes._montants).reduce((s, m) => s + (Number(m) || 0), 0);

    const saved = await updateRecordRemote(existingDossier.id, {
      patient: p, type: 'Dossier',
      resultats: newRes, montant: newMontant,
      prescripteur_id: prescripteurId || existingDossier.prescripteur_id || null,
    });
    if (saved) {
      const allTypes = newRes._types.join(' · ');
      hideLoading();
      resetPanelAfterSave(tabKey);
      regenDossier(); // ✅ v13.33 — nouveau N° sans toucher à la date ni aux coches
      refreshRappelPatient();
      toast('✓ ' + type + ' ajouté au dossier N°' + dossier + ' — Total : ' + newMontant.toLocaleString('fr-FR') + ' FCFA', 'ok');
    }

  } else {
    // ── Créer un nouveau dossier ────────────────────────────────
    const newRes = { [type]: typeResultats, _types: [type], _montants: { [type]: montant } }; // ✅ v12
    if (examensCochesTab.length) { newRes._examens_coches = { [type]: examensCochesTab }; newRes._examens_prix = { [type]: examensPrixTab }; }
    // ✅ v13.35 — Intégrer les autres onglets cochés sans résultats
    Object.entries(autresTabsCoches).forEach(([otherType, data]) => {
      if (!newRes._types.includes(otherType)) newRes._types.push(otherType);
      if (!newRes[otherType]) newRes[otherType] = {}; // résultats vides
      if (!newRes._examens_coches) newRes._examens_coches = {};
      newRes._examens_coches[otherType] = data.coches;
      if (!newRes._examens_prix) newRes._examens_prix = {};
      newRes._examens_prix[otherType] = data.prix;
      newRes._montants[otherType] = data.montant;
    });

    const saved = await insertRecordRemote({
      patient: p, type: 'Dossier',
      resultats: newRes, montant,
      prescripteur_id: prescripteurId || null,
    });
    if (saved) {
      hideLoading();
      resetPanelAfterSave(tabKey);
      regenDossier(); // ✅ v13.33 — nouveau N° sans toucher à la date ni aux coches
      refreshRappelPatient();
      toast('✓ Dossier N°' + dossier + ' créé — ' + type + ' — ' + montant.toLocaleString('fr-FR') + ' FCFA', 'ok');
    }
  }
}

// ✅ v13.33/v13.34 — Après enregistrement : vider les valeurs de résultats + nom + âge.
// En mode ÉDITION : ne rien faire (les champs doivent rester pour correction éventuelle).
function resetPanelAfterSave(tabKey) {
  // ✅ v13.34 — Ne pas réinitialiser en mode édition
  if (_editingRecordId) return;

  // Vider nom et âge uniquement (pas la date, le sexe, le service…)
  const nomEl = document.getElementById('p_nom');
  const ageEl = document.getElementById('p_age');
  const ddnEl2 = document.getElementById('p_ddn');
  const lblEl2 = document.getElementById('p_age_label');
  if (nomEl) nomEl.value = '';
  if (ageEl) ageEl.value = '';
  if (ddnEl2) ddnEl2.value = '';
  if (lblEl2) lblEl2.textContent = '';

  const panel = document.getElementById('panel-' + tabKey);
  if (!panel) return;
  // Vider uniquement les champs de valeurs (v_* et sv_*), pas les px_*
  panel.querySelectorAll('input[id^="v_"], input[id^="sv_"]').forEach(i => i.value = '');
  // Remettre les select internes au panel (interprétations, profils…)
  panel.querySelectorAll('select').forEach(s => s.selectedIndex = 0);
  // Remettre les cellules d'interprétation à l'état neutre
  panel.querySelectorAll('.interp').forEach(sp => { sp.className = 'interp interp-?'; sp.textContent = '—'; });
  panel.querySelectorAll('.abg-row').forEach(r => r.className = 'abg-row nd');
  if (typeof renderDashboard === 'function') renderDashboard(); // ✅ v13.34 — MAJ compteurs
}


// ============================================================
// ÉDITION D'UNE FICHE DEPUIS L'HISTORIQUE
// ============================================================

let _editingRecordId = null;
let _fillAllMode = false; // ✅ v13.112 — édition « remplir tout sur une page »
let _editingType     = null; // type de l'analyse en cours d'édition
let _editingFicheId  = null; // ✅ v13.29 — id du dossier en cours de modification fiche d'accueil
let _selectedIds     = new Set(); // ✅ v13.30 — IDs sélectionnés pour actions en masse
let _filterMasquees  = false;     // ✅ v13.30 — filtre "Mes fiches masquées" actif

// ✅ v13.1 — Recalcule les interprétations d'un panneau en redéclenchant les
// gestionnaires oninput. Corrige le cas « édition → ré-enregistrement » où les
// valeurs rechargées n'avaient pas rafraîchi les interp lues via textContent.
function ensureInterpFresh(type) {
  const MAP = {
    'Hématologie':'hema','Biochimie':'bio','Bactériologie':'bacterio',
    'Immuno-Sérologie':'sero','Parasitologie':'parasito','Groupe sanguin':'gs','Bilan prénatal':'bpn'
  };
  const panel = document.getElementById('panel-' + (MAP[type] || ''));
  if (!panel) return;
  panel.querySelectorAll('input, select').forEach(el => {
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch(e){}
  });
}

async function editRecord(id, typeOverride) {
  if (isCaissier() || isSpectateur()) { toast('Accès lecture seule — modification impossible', 'err'); return; }
  let record = getDB().find(x => x.id === id);
  if (!record) {
    await refreshDB();
    record = getDB().find(x => x.id === id);
  }
  if (!record) { toast('Fiche introuvable', 'err'); return; }

  // ✅ v13.112 — Dossier (une ou plusieurs analyses) : on remplit TOUT sur une
  // seule page (toutes les sections cochées empilées) et l'enregistrement route
  // chaque résultat vers sa bonne analyse. Fini le choix « quelle analyse ? »
  // et l'onglet unique qui cachait CRP quand on éditait l'Hématologie.
  if (isDossierRecord(record) && !typeOverride) {
    return fillAllResults(id);
  }

  const type      = typeOverride || record.type || 'Hématologie';
  await ensureFull(record); // ✅ v13.5 — détail complet avant édition
  const res       = getRecordResultats(record, type);
  const fakeRecord = { ...record, type, resultats: res };

  _editingRecordId = id;
  _editingType     = type;
  // Conserver le token existant du dossier (évite de générer un nouveau token à l'édition)
  _shareTokenCurrent = record.patient?.share_token || null;

  showView('saisie');
  await new Promise(res => setTimeout(res, 50));

  // Remplir le formulaire patient
  const p = record.patient || {};
  const setVal = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val || ''; };
  setVal('p_dossier', p.dossier); setVal('p_date', p.date); setVal('p_nom', p.nom);
  setVal('p_age', p.age);         setVal('p_sexe', p.sexe); setVal('p_medecin', p.medecin);
  setVal('p_service', p.service); setVal('p_clinique', p.clinique);
  if (p.sexe || p.age) updateAllRefs();
  const prescEl = document.getElementById('p_prescripteur_id');
  if (prescEl && record.prescripteur_id) prescEl.value = record.prescripteur_id;

  const TYPE_TO_TAB = {
    'Hématologie':'hema','Biochimie':'bio','Bactériologie':'bacterio',
    'Immuno-Sérologie':'sero','Parasitologie':'parasito','Groupe sanguin':'gs',// BPN supprimé v13.21
  };
  const tabKey = TYPE_TO_TAB[type] || 'hema';
  // ✅ v13.34 — Ne pas forcer _showAllExams = true en mode édition résultats
  // applyExamLocks affiche les lignes cochées et masque les autres

  document.getElementById('fiche-identification').style.display = 'none';
  document.getElementById('zone-saisie').style.display = '';
  switchTab(tabKey);
  await new Promise(res => setTimeout(res, 100));

  loadResultsIntoForm(type, res);
  ensureInterpFresh(type); // ✅ v13.1 — recalcule les interp depuis les valeurs rechargées

  // ✅ v13.34 — Geler le montant original de la fiche pendant l'édition
  // (évite que la restauration des cases cochées recalcule un nouveau prix)
  const montantOriginal = record.montant || 0;
  const montantEl = document.getElementById('montant-preview');
  if (montantEl) {
    montantEl.dataset.montantGele = montantOriginal;
    montantEl.textContent = montantOriginal.toLocaleString('fr-FR') + ' F';
  }
  // Surcharger updateMontantCurrent temporairement pour ne pas toucher au montant
  window._updateMontantCurrent_orig = window.updateMontantCurrent;
  window.updateMontantCurrent = function() {
    if (_editingRecordId) return; // gelé en mode édition
    window._updateMontantCurrent_orig && window._updateMontantCurrent_orig();
  };
  // ✅ v13.14 — En édition, on restaure les examens PAYÉS dans la fiche : leurs
  // champs sont éditables, les autres restent 🔒 (il faut les cocher pour saisir).
  if (typeof restoreFicheFromRecord === 'function' && restoreFicheFromRecord(record)) {
    _locksDisabled = false;
    if (typeof applyExamLocks === 'function') applyExamLocks();
  } else {
    // Ancien dossier sans information de paiement → on laisse tout éditable.
    _locksDisabled = true;
    if (typeof unlockAllFields === 'function') unlockAllFields();
  }
  markRequiredSections();

  // Bandeau édition
  let banner = document.getElementById('edit-mode-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'edit-mode-banner';
    banner.style.cssText = 'background:#fef3c7;border:1.5px solid #d97706;color:#92400e;padding:10px 16px;border-radius:var(--radius);margin-bottom:14px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:10px';
    document.getElementById('rappel-patient')?.parentNode?.insertBefore(banner, document.getElementById('rappel-patient'));
  }
  const allTypes = getRecordTypes(record);
  banner.innerHTML = '✏️ Modification — ' + esc(type) + ' · Dossier N°' + esc(p.dossier||'') + ' · ' + esc(p.nom||'')
    + (allTypes.length > 1 ? ' <span style="font-size:11px;font-weight:400;opacity:.7">(dossier : ' + esc(allTypes.join(', ')) + ')</span>' : '')
    + ' <button onclick="cancelEdit()" style="margin-left:auto;background:none;border:1px solid #92400e;color:#92400e;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">Annuler</button>';
  banner.style.display = 'flex';

  const rappelNom  = document.getElementById('rappel-nom');
  const rappelDoss = document.getElementById('rappel-dossier');
  if (rappelNom)  rappelNom.textContent  = (p.nom||'').toUpperCase();
  if (rappelDoss) rappelDoss.textContent = 'N° ' + (p.dossier || '');

  window.scrollTo({ top: 0, behavior: 'smooth' });
  toast('Fiche chargée pour modification (' + type + ')', 'ok');
}

// ✅ v13.112 — Ouvrir une fiche à compléter avec TOUTES les analyses cochées
// empilées sur une seule page. Un unique bouton d'enregistrement route chaque
// résultat vers sa bonne analyse (voir saveRecordAll).
async function fillAllResults(id) {
  if (isCaissier() || isSpectateur()) { toast('Accès lecture seule — modification impossible', 'err'); return; }
  let record = getDB().find(x => x.id === id);
  if (!record) { await refreshDB(); record = getDB().find(x => x.id === id); }
  if (!record) { toast('Fiche introuvable', 'err'); return; }
  await ensureFull(record);

  const types = getRecordTypes(record);
  _editingRecordId   = id;
  _editingType       = null;
  _fillAllMode       = true;
  _shareTokenCurrent = record.patient?.share_token || null;

  showView('saisie');
  await new Promise(r => setTimeout(r, 50));

  // Patient
  const p = record.patient || {};
  const setVal = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val || ''; };
  setVal('p_dossier', p.dossier); setVal('p_date', p.date); setVal('p_nom', p.nom);
  setVal('p_age', p.age); setVal('p_sexe', p.sexe); setVal('p_medecin', p.medecin);
  setVal('p_service', p.service); setVal('p_clinique', p.clinique);
  if (p.sexe || p.age) updateAllRefs();
  const prescEl = document.getElementById('p_prescripteur_id');
  if (prescEl && record.prescripteur_id) prescEl.value = record.prescripteur_id;

  document.getElementById('fiche-identification').style.display = 'none';
  document.getElementById('zone-saisie').style.display = '';
  document.body.classList.add('fill-all-mode');

  // Construire tous les panneaux, puis charger les résultats de chaque analyse
  TAB_ORDER.forEach(t => { try { ensurePanelBuilt(t); } catch (e) {} });
  await new Promise(r => setTimeout(r, 100));
  types.forEach(t => { const rr = getRecordResultats(record, t); if (rr) loadResultsIntoForm(t, rr); });
  types.forEach(t => { try { ensureInterpFresh(t); } catch (e) {} });

  // Montant gelé (comme en édition simple)
  const montantOriginal = record.montant || 0;
  const montantEl = document.getElementById('montant-preview');
  if (montantEl) {
    montantEl.dataset.montantGele = montantOriginal;
    montantEl.textContent = montantOriginal.toLocaleString('fr-FR') + ' F';
  }
  window._updateMontantCurrent_orig = window.updateMontantCurrent;
  window.updateMontantCurrent = function () {
    if (_editingRecordId) return;
    window._updateMontantCurrent_orig && window._updateMontantCurrent_orig();
  };

  // Restaurer les cases cochées de TOUTES les analyses + appliquer les verrous
  _locksDisabled = false;
  if (typeof restoreFicheFromRecord === 'function') restoreFicheFromRecord(record);
  if (typeof applyExamLocks === 'function') applyExamLocks();

  // Révéler les panneaux qui ont au moins un examen coché ; masquer les autres
  TAB_ORDER.forEach(tid => {
    const panel = document.getElementById('panel-' + tid);
    if (!panel) return;
    const anyChecked = getCatalogueComplet().filter(ex => ex.tab === tid)
      .some(ex => document.getElementById(ex.id)?.checked);
    panel.classList.toggle('active', anyChecked);
  });

  if (typeof markRequiredSections === 'function') markRequiredSections();
  // ✅ v13.114 — Masquer aussi les lignes des examens non cochés dans les cartes
  // partagées (cohérent avec la nouvelle saisie « tout sur une page »).
  if (typeof hideUncheckedExamRows === 'function') hideUncheckedExamRows();

  // Boutons : masquer les « Enregistrer » par onglet, montrer le bouton unique
  document.querySelectorAll('button[onclick^="saveThenNext"]').forEach(b => b.style.display = 'none');
  const btnAll = document.getElementById('btn-save-all');
  if (btnAll) { btnAll.style.display = 'inline-flex'; btnAll.innerHTML = '💾 Enregistrer les résultats'; }

  // Bandeau
  let banner = document.getElementById('edit-mode-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'edit-mode-banner';
    banner.style.cssText = 'background:#fef3c7;border:1.5px solid #d97706;color:#92400e;padding:10px 16px;border-radius:var(--radius);margin-bottom:14px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:10px';
    document.getElementById('rappel-patient')?.parentNode?.insertBefore(banner, document.getElementById('rappel-patient'));
  }
  banner.innerHTML = '✏️ Compléter les résultats — Dossier N°' + esc(p.dossier || '') + ' · ' + esc(p.nom || '')
    + ' <span style="font-size:11px;font-weight:400;opacity:.7">(' + esc(types.join(', ')) + ')</span>'
    + ' <button onclick="cancelEdit()" style="margin-left:auto;background:none;border:1px solid #92400e;color:#92400e;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">Annuler</button>';
  banner.style.display = 'flex';

  const rappelNom = document.getElementById('rappel-nom');
  const rappelDoss = document.getElementById('rappel-dossier');
  if (rappelNom)  rappelNom.textContent  = (p.nom || '').toUpperCase();
  if (rappelDoss) rappelDoss.textContent = 'N° ' + (p.dossier || '');

  window.scrollTo({ top: 0, behavior: 'smooth' });
  toast('Fiche chargée — remplissez tous les examens puis « Enregistrer les résultats »', 'ok');
}

// ✅ v13.112 — Enregistrement atomique de TOUTES les analyses en un seul appel.
// Route chaque résultat vers sa bonne analyse ; ne réinitialise pas
// _editingRecordId en cours de route (contrairement à une boucle sur
// _saveRecordImpl, qui créerait des doublons dès la 2ᵉ analyse).
async function saveRecordAll() {
  const p = getPatient();
  if (!validatePatient(p)) return;
  // ✅ v13.114 — Nouvelle saisie « tout sur une page » (aucun dossier existant) :
  // création atomique d'un seul dossier avec TOUTES les analyses cochées.
  if (!_editingRecordId) { return saveRecordAllFresh(); }
  if (_editingRecordId && !isDossierPaye(_editingRecordId)) {
    toast('🔒 Paiement requis avant d\'enregistrer ce dossier', 'err');
    showView('caisse'); return;
  }
  showLoading('Enregistrement…');
  try {
    const existing = getDB().find(rr => rr.id === _editingRecordId);
    if (!existing) { hideLoading(); toast('Fiche introuvable', 'err'); return; }

    const TT = { hema:'Hématologie', bio:'Biochimie', bacterio:'Bactériologie',
                 sero:'Immuno-Sérologie', parasito:'Parasitologie', gs:'Groupe sanguin' };
    const base = existing.resultats || {};
    const newRes = { ...base };
    newRes._types          = Array.isArray(base._types) ? [...base._types] : [];
    newRes._examens_coches = { ...(base._examens_coches || {}) };
    newRes._examens_prix   = { ...(base._examens_prix   || {}) };
    newRes._montants       = { ...(base._montants       || {}) };
    const montantParTab = JSON.parse(document.getElementById('montant-preview')?.dataset?.montantParTab || '{}');
    let anyCritical = false;

    TAB_ORDER.forEach(tid => {
      const type = TT[tid];
      if (!type) return;
      const coches = getCatalogueComplet().filter(ex => ex.tab === tid && document.getElementById(ex.id)?.checked);
      if (!coches.length) return;                  // analyse non demandée → on n'y touche pas
      try { ensureInterpFresh(type); } catch (e) {}
      const tr = collectResults(type);
      try { if (checkValeursCritiques(tr).length) anyCritical = true; } catch (e) {}
      newRes[type] = tr;
      if (!newRes._types.includes(type)) newRes._types.push(type);
      newRes._examens_coches[type] = coches.map(ex => ex.label);
      const prix = {};
      coches.forEach(ex => { const px = document.getElementById('px_' + ex.id); prix[ex.label] = px ? (parseInt(px.value || '0') || 0) : (ex.prix || 0); });
      newRes._examens_prix[type] = prix;
      if (newRes._montants[type] == null) newRes._montants[type] = montantParTab[tid] || 0;
    });

    newRes._facture_seule = false;                 // des résultats ont été saisis
    if (anyCritical) p.has_critical = true;
    // Montant gelé : on conserve le total facturé du dossier
    const newMontant = existing.montant || Object.values(newRes._montants).reduce((s, m) => s + (Number(m) || 0), 0);

    const saved = await updateRecordRemote(_editingRecordId, {
      patient: p, type: 'Dossier', resultats: newRes, montant: newMontant,
      prescripteur_id: (document.getElementById('p_prescripteur_id')?.value) || existing.prescripteur_id || null,
    }, { onlyResultats: true });

    if (saved) {
      _editingRecordId = null; _editingType = null; _fillAllMode = false;
      if (window._updateMontantCurrent_orig) { window.updateMontantCurrent = window._updateMontantCurrent_orig; window._updateMontantCurrent_orig = null; }
      document.body.classList.remove('fill-all-mode');
      document.querySelectorAll('button[onclick^="saveThenNext"]').forEach(b => b.style.display = '');
      hideLoading();
      toast('✅ Résultats enregistrés', 'ok');
      await refreshDB(true);
      showView('historique');
    } else {
      hideLoading();
    }
  } catch (e) {
    hideLoading();
    toast('Erreur : ' + (e.message || e), 'err');
  }
}

// ✅ v13.114 — Enregistrement atomique d'une NOUVELLE saisie « tout sur une page ».
// Crée UN seul dossier contenant toutes les analyses cochées + leurs résultats,
// en un unique insert. Évite l'ancien parcours saveAllTabs → boucle de
// _saveRecordImpl, qui régénérait le numéro de dossier entre chaque analyse et
// pouvait éclater un même patient en plusieurs dossiers.
async function saveRecordAllFresh() {
  const p = getPatient();
  if (!validatePatient(p)) return;

  const TT = { hema:'Hématologie', bio:'Biochimie', bacterio:'Bactériologie',
               sero:'Immuno-Sérologie', parasito:'Parasitologie', gs:'Groupe sanguin' };

  // Vérifier qu'au moins un examen est coché.
  const tabsCoches = TAB_ORDER.filter(tid => TT[tid] &&
    getCatalogueComplet().some(ex => ex.tab === tid && document.getElementById(ex.id)?.checked));
  if (!tabsCoches.length) { toast('⚠ Aucun examen coché', 'err'); return; }

  showLoading('Enregistrement…');
  try {
    // Anti-doublon : fermer la fenêtre entre l'aperçu du numéro et l'écriture.
    let cacheComplet;
    try { cacheComplet = await refreshDB(true); }
    catch (e) { cacheComplet = (typeof getDB === 'function' ? getDB() : []); }
    const dup = (cacheComplet || []).find(rr =>
      rr.patient?.dossier === p.dossier && !rr.deletedAt && !rr._hardDeleted);
    if (dup) {
      hideLoading();
      const ok = await showConfirmModal({
        icon: '⚠️', title: 'Numéro de dossier déjà utilisé',
        message: 'Le dossier N° ' + esc(p.dossier || '') + ' existe déjà (' + esc(dup.patient?.nom || '') + '). Générer un nouveau numéro et enregistrer ? (Annuler pour vérifier d\'abord.)',
        confirmText: 'Nouveau numéro + enregistrer', cancelText: 'Annuler'
      });
      if (!ok) return;
      await regenDossier();
      p.dossier = getPatient().dossier;
      showLoading('Enregistrement…');
    }

    const montantParTab = JSON.parse(document.getElementById('montant-preview')?.dataset?.montantParTab || '{}');
    const newRes = { _types: [], _montants: {}, _examens_coches: {}, _examens_prix: {}, _facture_seule: false };
    let anyCritical = false;

    TAB_ORDER.forEach(tid => {
      const type = TT[tid];
      if (!type) return;
      const coches = getCatalogueComplet().filter(ex => ex.tab === tid && document.getElementById(ex.id)?.checked);
      if (!coches.length) return;                    // analyse non demandée
      try { ensureInterpFresh(type); } catch (e) {}
      const tr = collectResults(type);
      try { if (checkValeursCritiques(tr).length) anyCritical = true; } catch (e) {}
      newRes[type] = tr;
      newRes._types.push(type);
      newRes._examens_coches[type] = coches.map(ex => ex.label);
      const prix = {};
      coches.forEach(ex => { const px = document.getElementById('px_' + ex.id); prix[ex.label] = px ? (parseInt(px.value || '0') || 0) : (ex.prix || 0); });
      newRes._examens_prix[type] = prix;
      newRes._montants[type] = montantParTab[tid] || Object.values(prix).reduce((s, v) => s + (Number(v) || 0), 0);
    });

    if (anyCritical) p.has_critical = true;
    const montant = Object.values(newRes._montants).reduce((s, m) => s + (Number(m) || 0), 0);
    const prescripteurId = document.getElementById('p_prescripteur_id')?.value || null;

    const saved = await insertRecordRemote({
      patient: p, type: 'Dossier', resultats: newRes, montant,
      prescripteur_id: prescripteurId || null,
    });

    if (saved) {
      _fillAllMode = false;
      _editingRecordId = null; _editingType = null;
      document.body.classList.remove('fill-all-mode');
      document.querySelectorAll('button[onclick^="saveThenNext"]').forEach(b => b.style.display = '');
      hideLoading();
      toast('✅ Dossier N°' + (p.dossier || '') + ' enregistré — ' + montant.toLocaleString('fr-FR') + ' FCFA', 'ok');
      await refreshDB(true);
      // ✅ v13.117 — « Enregistrer + Imprimer » : imprimer le dossier tout juste créé.
      if (window._benchPrintAfterSave && saved && saved.id != null) {
        window._benchPrintAfterSave = false;
        try { if (typeof printRecord === 'function') await printRecord(saved.id); } catch (e) {}
      }
      window._benchPrintAfterSave = false;
      // ✅ v13.117 — Paillasse : retirer ce patient et basculer vers le suivant
      // s'il en reste un ouvert ; sinon repartir sur une fiche vierge.
      const switched = (typeof benchAfterSave === 'function') ? benchAfterSave() : false;
      if (!switched && typeof resetFicheIdentif === 'function') await resetFicheIdentif();
    } else {
      hideLoading();
    }
  } catch (e) {
    hideLoading();
    toast('Erreur : ' + (e.message || e), 'err');
  }
}

// Modal de sélection du type à modifier pour les dossiers multi-analyses
function showEditTypeModal(id, types) {
  let modal = document.getElementById('edit-type-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'edit-type-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:500;display:flex;align-items:center;justify-content:center';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div style="background:#fff;border-radius:var(--radius-lg);padding:28px;max-width:420px;width:90%;box-shadow:var(--shadow-lg)">
      <div style="font-size:16px;font-weight:800;color:var(--cpmi-deep);margin-bottom:6px">Quel examen modifier ?</div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px">Ce dossier contient plusieurs analyses. Choisissez celle à modifier :</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${types.map(t => `
          <button class="btn btn-outline" style="justify-content:flex-start;font-size:13px"
            onclick="document.getElementById('edit-type-modal').remove(); editRecord(${id},'${t}')">
            ${t}
          </button>`).join('')}
      </div>
      <button class="btn btn-outline" style="margin-top:14px;width:100%;justify-content:center;color:var(--text-muted)"
        onclick="document.getElementById('edit-type-modal').remove()">Annuler</button>
    </div>`;
  modal.style.display = 'flex';
}


function cancelEdit() {
  _editingRecordId = null;
  // ✅ v13.112 — sortir du mode « remplir tout sur une page »
  _fillAllMode = false;
  document.body.classList.remove('fill-all-mode');
  document.querySelectorAll('button[onclick^="saveThenNext"]').forEach(b => b.style.display = '');
  // ✅ v13.114 — Ré-afficher les lignes masquées par hideUncheckedExamRows().
  document.querySelectorAll('#zone-saisie tr, #zone-saisie .abg-row').forEach(row => { row.style.display = ''; });
  { const pb = document.getElementById('btn-save-print'); if (pb) pb.style.display = 'none'; }
  // ✅ v13.34 — Restaurer updateMontantCurrent si gelé
  if (window._updateMontantCurrent_orig) {
    window.updateMontantCurrent = window._updateMontantCurrent_orig;
    window._updateMontantCurrent_orig = null;
  }
  const montantEl = document.getElementById('montant-preview');
  if (montantEl) delete montantEl.dataset.montantGele;
  const banner = document.getElementById('edit-mode-banner');
  if (banner) banner.style.display = 'none';
  newPatient();
  if (typeof applyExamLocks === 'function') applyExamLocks();
}

// ✅ v13.29 — Modifier la fiche d'accueil (patient + examens) sans changer le numéro de dossier
async function editFicheIdentif(id) {
  if (isCaissier() || isSpectateur()) { toast('Accès lecture seule — modification impossible', 'err'); return; }
  let record = getDB().find(x => x.id === id);
  if (!record) {
    showLoading('Chargement…');
    await refreshDB();
    hideLoading();
    record = getDB().find(x => x.id === id);
  }
  if (!record) { toast('Fiche introuvable', 'err'); return; }

  await ensureFull(record); // charge le dossier complet si nécessaire

  _editingFicheId     = id;
  _editingRecordId    = null; // s'assurer qu'on n'est pas en mode résultats
  _shareTokenCurrent  = record.patient?.share_token || null;

  showView('saisie');
  await new Promise(r => setTimeout(r, 60));

  // Afficher la fiche d'identification, masquer la zone de saisie de résultats
  document.getElementById('fiche-identification').style.display = '';
  document.getElementById('zone-saisie').style.display = 'none';

  // Remplir les champs patient
  const p = record.patient || {};
  ['dossier','date','nom','age','sexe','medecin','service','clinique'].forEach(k => {
    const el = document.getElementById('p_' + k);
    if (el) el.value = p[k] || '';
  });

  // Téléphone — fiche saisie + modale édition
  const telSaisie = document.getElementById('p_telephone');
  if (telSaisie && p.telephone) telSaisie.value = p.telephone;
  const telEdit = document.getElementById('ep_telephone');
  if (telEdit && p.telephone) telEdit.value = p.telephone;

  // Prescripteur
  const prescEl = document.getElementById('p_prescripteur_id');
  if (prescEl && record.prescripteur_id) {
    prescEl.value = record.prescripteur_id;
    if (typeof onPrescripteurChange === 'function') onPrescripteurChange();
  }

  // Mettre à jour les références (âge/sexe)
  if (typeof updateAllRefs === 'function') updateAllRefs();

  // Restaurer les examens cochés et leurs prix depuis le dossier existant
  if (typeof restoreFicheFromRecord === 'function') restoreFicheFromRecord(record);

  // ✅ v13.34 — En mode editFicheIdentif, le prix est recalculable librement
  // (l'utilisateur peut cocher/décocher des examens)
  // Restaurer updateMontantCurrent si gelé par un mode édition précédent
  if (window._updateMontantCurrent_orig) {
    window.updateMontantCurrent = window._updateMontantCurrent_orig;
    window._updateMontantCurrent_orig = null;
  }
  if (typeof calcFicheTotal === 'function') calcFicheTotal();

  // Bandeau d'édition sur la fiche d'accueil
  let banner = document.getElementById('fiche-edit-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'fiche-edit-banner';
    banner.style.cssText = [
      'background:#f0fdf4','border:2px solid #16a34a','color:#166534',
      'padding:10px 16px','border-radius:var(--radius)','margin:10px 0 14px',
      'font-size:13px','font-weight:600','display:flex','align-items:center','gap:10px'
    ].join(';');
    // Insérer juste sous le titre de la card
    const titleEl = document.getElementById('fiche-identif-title');
    if (titleEl) titleEl.insertAdjacentElement('afterend', banner);
    else document.getElementById('fiche-identification').prepend(banner);
  }
  banner.innerHTML = '🗂 Modification fiche d\'accueil — <strong>N° ' + esc(p.dossier || '') + '</strong>'
    + ' &nbsp;·&nbsp; ' + esc((p.nom || '').toUpperCase())
    + ' <button onclick="cancelEditFiche()" style="margin-left:auto;background:none;border:1.5px solid #16a34a;color:#166534;padding:3px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700">✕ Annuler</button>';
  banner.style.display = 'flex';

  // Adapter le bouton "Enregistrer sans saisie"
  const btnSave = document.querySelector('button[onclick="enregistrerFicheIdentif()"]');
  if (btnSave) btnSave.innerHTML = '💾 Mettre à jour la fiche';

  // Verrouiller le champ numéro de dossier (lecture seule, déjà readonly)
  const dossEl = document.getElementById('p_dossier');
  if (dossEl) dossEl.style.outline = '2px solid #16a34a';

  window.scrollTo({ top: 0, behavior: 'smooth' });
  toast('🗂 Fiche chargée — modifiez et cliquez "Mettre à jour"', 'ok');
}

function cancelEditFiche() {
  _editingFicheId = null;
  const banner = document.getElementById('fiche-edit-banner');
  if (banner) banner.style.display = 'none';
  const dossEl = document.getElementById('p_dossier');
  if (dossEl) dossEl.style.outline = '';
  const btnSave = document.querySelector('button[onclick="enregistrerFicheIdentif()"]');
  if (btnSave) btnSave.innerHTML = '💾 Enregistrer sans saisie';
  newPatient();
}

// ✅ v13.30 — Met à jour le bouton de verrouillage sans re-render complet
function _updateLockBtn(id, record) {
  const btn = document.getElementById('lock-btn-' + id);
  if (!btn) return;
  const locked = !!record.restrictedBy;
  btn.style.cssText = 'padding:4px 8px;font-size:11px;margin-left:3px;' + (locked
    ? 'background:#fef3c7;color:#92400e;border:1px solid #fbbf24'
    : 'background:#f8fafc;color:#94a3b8;border:1px solid #e2e8f0');
  btn.title = (isAdmin() && locked && record.restrictedBy)
    ? 'Restreint par ' + record.restrictedBy
    : (locked ? 'Fiche masquée (cliquer pour lever la restriction)' : 'Masquer aux autres profils');
  btn.textContent = locked ? '🔒' : '🔓';
}

// ✅ v13.30 — Restriction de visibilité par profil (optimiste + modal custom)
async function toggleRestriction(id) {
  const record = _dbCache.find(r => r.id === id);
  if (!record) { toast('Fiche introuvable', 'err'); return; }

  // ✅ v13.116 — Un agent peut masquer/démasquer SES propres fiches ; l'admin,
  // toutes. Un agent ne peut pas lever une restriction posée par l'admin.
  const uid = _currentUser?.username;
  if (!isAdmin()) {
    if (record.createdBy !== uid) { toast('Vous ne pouvez masquer que vos propres fiches', 'err'); return; }
    if (record.restrictedBy && record.restrictedBy !== uid) { toast('Fiche masquée par l\'administrateur', 'err'); return; }
  }

  const isRestricted = !!record.restrictedBy;
  const confirmed = await showConfirmModal({
    icon: isRestricted ? '🔓' : '🔒',
    title: isRestricted ? 'Lever la restriction ?' : 'Masquer cette fiche ?',
    message: isRestricted
      ? 'Cette fiche redeviendra visible pour tous les profils.'
      : 'Elle n\'apparaîtra plus dans l\'historique ni dans les calculs des autres profils.',
    confirmText: isRestricted ? 'Lever' : 'Masquer',
    cancelText: 'Annuler'
  });
  if (!confirmed) return;

  // ✅ Mise à jour optimiste — effet immédiat sans attendre la DB
  const prevRestricted = record.restrictedBy;
  record.restrictedBy = isRestricted ? null : (_currentUser?.username || '');
  _updateLockBtn(id, record);

  // ✅ v13.33 — Hors ligne : enfiler l'action, la garder localement
  if (!navigator.onLine || String(id).startsWith('tmp_')) {
    enqueueAction('toggle_restriction', id);
    renderHistory();
    toast('📴 Hors ligne — ' + (isRestricted ? 'restriction levée' : 'fiche masquée') + ' localement', 'ok');
    return;
  }

  // Appel RPC en arrière-plan
  const { data, error } = await _sb.rpc('toggle_restriction', { p_token: TK(), p_id: id });

  if (error || (data !== 'restricted' && data !== 'unrestricted')) {
    // Annuler la mise à jour optimiste
    record.restrictedBy = prevRestricted;
    _updateLockBtn(id, record);
    if (data === 'unauthorized') { toast('Session expirée — reconnectez-vous', 'err'); return; }
    if (data === 'forbidden')    { toast('Action non autorisée', 'err'); return; }
    if (data === 'not_found')    { toast('Fiche introuvable en base', 'err'); return; }
    toast(error ? 'Erreur : ' + error.message : 'Réponse inattendue : ' + data, 'err');
    return;
  }

  if (data === 'restricted') {
    record.restrictedBy = _currentUser?.username;
    toast('🔒 Fiche masquée — les autres profils ne la verront plus', 'ok');
  } else {
    record.restrictedBy = null;
    toast('🔓 Restriction levée — fiche à nouveau visible par tous', 'ok');
  }
  _updateLockBtn(id, record);
  // ✅ v13.30 — Re-render : la fiche masquée reste visible mais grisée,
  //   et le total en bas est recalculé sans elle. Met aussi à jour le bouton "Mes fiches masquées".
  await renderHistory();
}

// Recharge les résultats sauvegardés dans les champs du formulaire (mode édition)
function loadResultsIntoForm(type, res) {
  const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined && val !== '') el.value = val; };
  const setSel = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };

  if (type === 'Hématologie') {
    // NFS params normaux
    [...HEMA_PARAMS].forEach(p => {
      const v = res[p.name];
      if (v && v.valeur) setVal('v_' + p.id, v.valeur);
    });
    // FL : le champ de saisie attend le % — on recharge pct s'il existe, sinon valeur
    HEMA_FL.forEach(p => {
      const v = res[p.name];
      if (!v) return;
      const val = v.pct !== undefined && v.pct !== '' ? v.pct : v.valeur;
      if (val) setVal('v_' + p.id, val);
    });
    calcConstantes(); calcFLAbsolues();
    ['Hb A','Hb A2','Hb F','Hb S','Hb C','Hb D','Hb E'].forEach(n => {
      const v = res[n]; if (v && v.valeur) {
        const id = n.toLowerCase().replace(/\s+/g,'_').replace('hb_','ephb_');
        setVal(id, v.valeur);
      }
    });
    setSel('ephb_profil', res['Profil Hb']);
    setVal('ephb_commentaire', res['Commentaire Hb']);
    setSel('ge_result', res['GE - Résultat']);
    setSel('ge_espece', res['GE - Espèce']);
    setVal('ge_para', res['GE - Parasitémie (%)']);
    setVal('ge_densite', res['GE - Densité parasitaire (/µL)']);
    setSel('ge_stade', res['GE - Stade']);
    setSel('ge_tdr', res['GE - TDR']);
    setVal('ge_obs', res['GE - Observation']);
    setSel('gs_abo_hema', res['GS - ABO'] || res['Groupe ABO']);
    setSel('gs_rh_hema',  res['GS - Rhésus'] || res['Rhésus']);
    setSel('crp_valeur', res['CRP - Valeur']);
    if (res['CRP - Valeur']) interpretCRP();
    WIDAL_ANTIGENES.forEach(ag => {
      const w = res['Widal - ' + ag.name];
      if (w) {
        setSel('widal_' + ag.id, w.titre);
        setSel('widal_cin_' + ag.id, w.cinetique);
      }
    });
    if (Object.keys(res).some(k => k.startsWith('Widal'))) interpretWidal();
  }
  else if (type === 'Biochimie') {
    [...BIO_GLUCIDES,...BIO_REIN,...BIO_FOIE,...BIO_LIPIDES,...BIO_IONO,...BIO_FER,...BIO_CARD,...BIO_HORM,...BIO_COAG,...BIO_AUTRE].forEach(p => {
      const v = res[p.name];
      if (v && v.valeur) setVal('v_' + p.id, v.valeur);
    });
    if (typeof calcLDL === 'function') calcLDL();
  }
  else if (type === 'Bactériologie') {
    setSel('bac_type', res['Type de prélèvement']);
    setVal('bac_site', res['Site / Précision']);
    setSel('bac_aspect', res['Aspect']);
    setSel('bac_couleur', res['Couleur']);
    setSel('bac_odeur', res['Odeur']);
    setSel('bac_ph', res['pH']);
    setVal('ef_leuco', res['Leucocytes (/mm³)']);
    setVal('ef_hematies', res['Hématies (/mm³)']);
    setSel('ef_epitheliales', res['Cellules épithéliales']);
    setSel('ef_cylindres', res['Cylindres']);
    setSel('ef_cristaux', res['Cristaux']);
    setSel('ef_bacteries', res['Bactéries (état frais)']);
    setSel('ef_levures', res['Levures']);
    setVal('ef_parasites', res['Parasites']);
    setSel('ef_sperma', res['Spermatozoïdes']);
    setSel('bac_gram', res['Coloration de Gram']);
    setSel('bac_gram_abond', res['Gram - Abondance']);
    setVal('bac_gram_comment', res['Gram - Commentaire']);
    setSel('bac_culture', res['Culture']);
    setSel('bac_numeration', res['Numération bactérienne']);
    setVal('bac_germe', res['Germe identifié']);
    setVal('bac_germe2', res['2ème germe']);
    setVal('bac_milieux', res['Milieux de culture']);
    setVal('bac_obs', res['Observations']);
    setVal('bac_abg_comment', res['Commentaire antibiogramme']);
    const isAfg = res['Mode: ABG/AFG'] === 'afg';
    if (isAfg) setAbgMode('afg');
    const abList = isAfg ? AFG_ANTIFONGIQUES : ABG_ANTIBIOS;
    const abPfx  = isAfg ? 'afg_' : 'abg_';
    const abKey  = isAfg ? 'AFG_' : 'ABG_';
    abList.forEach(ab => {
      const v = res[abKey + ab];
      const sel = document.querySelector('#' + abPfx + ab.replace(/[^a-z]/gi,'_') + ' select');
      if (sel && v) { sel.value = v; updateAbgColor(sel, ab); }
    });
  }
  else if (type === 'Immuno-Sérologie' && typeof SERO_TESTS !== 'undefined') {
    SERO_TESTS.forEach(t => {
      const v = res[t.name];
      if (!v) return;
      // ✅ v13.102 — restaurer le mode qual/quant (dossiers anciens : déduit
      // du type par défaut), puis les champs unifiés.
      const mode = v.mode || (t.type === 'quant' ? 'quant' : 'qual');
      setSel('smode_'+t.id, mode);
      if (typeof toggleSeroMode === 'function') toggleSeroMode(t.id);
      setSel('sr_'+t.id, v.resultat);
      setVal('sv_'+t.id, v.valeur);
      setVal('so_'+t.id, v.obs);
    });
  }
  else if (type === 'Groupe sanguin') {
    setSel('gs_abo', res['Groupe ABO']);
    setSel('gs_rh',  res['Rhésus']);
    setVal('gs_obs', res['Commentaire GS']);
  }
  else if (type === 'Parasitologie') {
    // ✅ v13.36 — CORRECTIF : les anciens ids eps_* n'existaient pas → l'édition
    // n'affichait rien et le ré-enregistrement effaçait les données. On restaure
    // désormais les vrais champs para_*/pe_* (miroir de collectResults).
    setSel('para_type',        res["Type d'examen"]);
    setSel('para_resultat',    res['Résultat global']);
    setSel('para_coloration',  res['Coloration']);
    setSel('para_espece',      res['Espèce plasmodiale']);
    setVal('para_parasitemie', res['Parasitémie (%)']);
    setVal('para_densite',     res['Densité parasitaire /µL']);
    setSel('para_stade',       res['Stade parasitaire']);
    setVal('para_indice',      res['Indice érythrocytaire']);
    setSel('para_tdr',         res['TDR paludisme']);
    if (typeof PARA_EPS !== 'undefined') {
      PARA_EPS.forEach(pa => {
        const id = 'pe_' + pa.replace(/[^a-z]/gi,'_');
        if (res[pa] !== undefined) setSel(id, res[pa]);
      });
    }
    setVal('para_obs', res['Observations']);
  }
  else if (type === 'Bilan prénatal') {
    // ✅ v12.4 — restaurer les examens inclus cochés
    if (Array.isArray(res['_bpn_inclus'])) {
      buildBpnCompo();
      BPN_EXAMENS.forEach(e => {
        const cb = document.getElementById(e.id);
        if (cb) cb.checked = res['_bpn_inclus'].includes(e.label);
      });
    }
    BPN_NFS.forEach(p => { const v=res[p.name]; if (v&&v.valeur) setVal('v_'+p.id, v.valeur); });
    BPN_FL.forEach(p => { const v=res[p.name]; if (v&&v.valeur) setVal('v_'+p.id, v.valeur); });
    if (typeof calcConstantesBPN === 'function') calcConstantesBPN();
    if (typeof calcBpnFLAbsolues === 'function') calcBpnFLAbsolues();
    // Biochimie BPN (clone bpn2_)
    [...BIO_GLUCIDES,...BIO_REIN,...BIO_FOIE,...BIO_LIPIDES,...BIO_IONO,...BIO_FER,...BIO_CARD,...BIO_HORM,...BIO_COAG,...BIO_AUTRE].forEach(p => {
      const v = res['BIO_'+p.name];
      if (v && v.valeur) setVal('bpn2_v_'+p.id, v.valeur);
    });
    // Bactério BPN (clone bpn3_) — restauration complète
    setSel('bpn3_bac_type',         res['BAC - Type']);
    setVal('bpn3_bac_site',         res['BAC - Site']);
    setSel('bpn3_bac_aspect',       res['BAC - Aspect']);
    setSel('bpn3_bac_couleur',      res['BAC - Couleur']);
    setSel('bpn3_bac_odeur',        res['BAC - Odeur']);
    setSel('bpn3_bac_ph',           res['BAC - pH']);
    setVal('bpn3_ef_leuco',         res['BAC - Leucocytes']);
    setVal('bpn3_ef_hematies',      res['BAC - Hématies']);
    setSel('bpn3_ef_bacteries',     res['BAC - Bactéries']);
    setSel('bpn3_ef_epitheliales',  res['BAC - Épithéliales']);
    setSel('bpn3_ef_levures',       res['BAC - Levures']);
    setVal('bpn3_ef_parasites',     res['BAC - Parasites']);
    setSel('bpn3_bac_gram',         res['BAC - Gram']);
    setVal('bpn3_bac_gram_comment', res['BAC - Gram comment']);
    setSel('bpn3_bac_culture',      res['BAC - Culture']);
    setSel('bpn3_bac_numeration',   res['BAC - Numération']);
    setVal('bpn3_bac_germe',        res['BAC - Germe']);
    setVal('bpn3_bac_germe2',       res['BAC - Germe 2']);
    setVal('bpn3_bac_obs',          res['BAC - Obs']);
    setVal('bpn3_bac_abg_comment',  res['BAC - ABG comment']);
    ABG_ANTIBIOS.forEach(ab => {
      const v = res['BAC_ABG_'+ab];
      const sel = document.querySelector('#bpn3_abg_' + ab.replace(/[^a-z]/gi,'_') + ' select');
      if (sel && v) { sel.value = v; }
    });
  }
}

// ============================================================
// HISTORY
// ============================================================


