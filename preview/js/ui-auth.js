/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — ui-auth.js
   Extrait de index.html (v13.70). Chargé en script classique, PAS en
   module ES : les gestionnaires inline du HTML (onclick="…") résolvent
   les fonctions dans la portée globale. L'ordre des balises <script>
   dans index.html doit être conservé.
   ═══════════════════════════════════════════════════════════════ */

function toast(msg, type='') {
  const el = document.getElementById('toast');
  // ✅ v13.33 — Animation de sortie avant d'effacer, puis d'entrée
  clearTimeout(toastTimer);
  el.classList.remove('show','hiding');
  void el.offsetWidth; // reflow pour relancer l'animation
  el.textContent = (type === 'ok' ? '✓ ' : type === 'err' ? '✗ ' : 'ℹ ') + msg;
  el.className = 'show ' + type;
  toastTimer = setTimeout(() => {
    el.classList.add('hiding');
    el.addEventListener('animationend', () => { el.className = ''; }, { once: true });
  }, 2700);
  // ✅ v13.251 — Tout message d'erreur vu par un utilisateur est consigné au
  //   journal des anomalies (heure, compte, écran) pour que l'admin le voie.
  if (type === 'err') signalerAnomalie(msg);
}

// ════════ ✅ v13.251 — JOURNAL DES ANOMALIES ════════
//   Ce qui sort de l'ordinaire chez un utilisateur : message d'erreur rouge,
//   enregistrement refusé, erreur technique de la page. Chaque anomalie part au
//   serveur avec l'heure, le compte, l'écran, le dossier ouvert et les examens
//   cochés ; l'admin les lit dans Comptes → ⚠️ Anomalies (et est prévenu).
//   Jamais bloquant : un échec d'envoi ne fait rien d'autre que patienter dans
//   une petite file locale, renvoyée au prochain envoi réussi.
const _ANO_FILE_KEY = 'labo_anomalies_attente';
const _anoRecents = new Map();          // anti-doublon : même message, même écran
let _anoEnvoi = false;
const _ANO_VUES = { 'view-accueil': 'Accueil', 'view-saisie': 'Nouvelle saisie', 'view-historique': 'Historique',
  'view-stats': 'Statistiques', 'view-comptes': 'Comptes', 'view-caisse': 'Caisse', 'view-caisse-user': 'Caisse',
  'view-cahier': 'Cahier' };
function _contexteAnomalie() {
  const c = {};
  try {
    const vue = [...document.querySelectorAll('[id^="view-"]')].find(e => e.offsetParent !== null);
    const serie = document.getElementById('grille-serie');
    c.vue = (serie && serie.offsetParent !== null) ? 'Saisie en série' : (vue ? (_ANO_VUES[vue.id] || vue.id) : '');
    const modale = [...document.querySelectorAll('.modal-title, .modal-box h3')].find(e => e.offsetParent !== null);
    if (modale) c.vue += ' › ' + modale.textContent.trim().slice(0, 60);
  } catch (e) {}
  try {
    const id = (typeof _editingRecordId !== 'undefined' && _editingRecordId)
      || (typeof _grilleFocusId !== 'undefined' && _grilleFocusId) || null;
    const r = id != null && typeof _dbCache !== 'undefined' ? _dbCache.find(x => x.id === id) : null;
    if (id != null) c.id = Number(id);
    if (r && r.patient && r.patient.dossier) c.dossier = r.patient.dossier;
  } catch (e) {}
  try {
    if (document.getElementById('view-saisie')?.offsetParent !== null && typeof getCatalogueComplet === 'function') {
      const ex = getCatalogueComplet().filter(x => document.getElementById(x.id)?.checked).map(x => x.label);
      if (ex.length) c.examens = ex.slice(0, 12).join(', ') + (ex.length > 12 ? '…' : '');
    }
  } catch (e) {}
  c.version = window.APP_VERSION_UI || '';
  c.role = (_currentUser && _currentUser.role) || '';
  c.appareil = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '') ? 'mobile' : 'ordinateur';
  c.heure_poste = new Date().toISOString();
  return c;
}
function signalerAnomalie(message, extra) {
  try {
    if (typeof _currentUser === 'undefined' || !_currentUser) return;
    const msg = String(message || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!msg) return;
    const c = Object.assign(_contexteAnomalie(), extra || {});
    const cle = msg + '|' + (c.vue || '') + '|' + (c.id || '');
    const t = Date.now();
    if (_anoRecents.get(cle) > t - 120000) return;      // déjà signalé il y a moins de 2 min
    _anoRecents.set(cle, t);
    let file = [];
    try { file = JSON.parse(localStorage.getItem(_ANO_FILE_KEY) || '[]'); } catch (e) {}
    file.push({ m: msg, c, u: _currentUser.username || '' });
    try { localStorage.setItem(_ANO_FILE_KEY, JSON.stringify(file.slice(-30))); } catch (e) {}
    _envoyerAnomalies();
  } catch (e) {}
}
async function _envoyerAnomalies() {
  if (_anoEnvoi || typeof _sb === 'undefined' || !_sb || typeof TK !== 'function' || !TK()) return;
  _anoEnvoi = true;
  try {
    for (let i = 0; i < 30; i++) {
      let file = [];
      try { file = JSON.parse(localStorage.getItem(_ANO_FILE_KEY) || '[]'); } catch (e) {}
      if (!file.length) break;
      const { m, c, u } = file[0];
      // File locale partagée par le poste : une anomalie restée en attente d'un
      //   AUTRE compte (déconnecté depuis) part sous le jeton courant ; on garde
      //   la trace de son vrai auteur dans le message.
      const moi = (typeof _currentUser !== 'undefined' && _currentUser && _currentUser.username) || '';
      const texte = (u && u !== moi) ? '[compte ' + u + '] ' + m : m;
      let rep;
      try { rep = await _sb.rpc('log_anomalie', { p_token: TK(), p_message: texte, p_contexte: c }); }
      catch (e) { break; }                                  // hors ligne : on réessaiera
      if (rep && rep.error && !rep.status) break;           // réseau coupé
      // Envoyé (ou refusé pour de bon : jeton expiré, limite) : on le retire.
      try {
        const reste = JSON.parse(localStorage.getItem(_ANO_FILE_KEY) || '[]');
        localStorage.setItem(_ANO_FILE_KEY, JSON.stringify(reste.slice(1)));
      } catch (e) { break; }
    }
  } finally { _anoEnvoi = false; }
}
// Erreurs techniques de la page (bug d'affichage, script interrompu…).
window.addEventListener('error', (e) => {
  if (!e || !e.message) return;
  const ou = e.filename ? String(e.filename).split('/').pop().split('?')[0] + ':' + (e.lineno || '?') : '';
  signalerAnomalie('Erreur technique : ' + e.message, { detail: ou });
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e && e.reason;
  const m = r && (r.message || (typeof r === 'string' ? r : ''));
  if (m) signalerAnomalie('Erreur technique : ' + m, { detail: 'promesse' });
});

// ============================================================
// MODAL DE CONFIRMATION — remplace confirm() natif  ✅ v13.30
// ============================================================
function showConfirmModal({ icon = '❓', title = 'Confirmer', message = '', confirmText = 'Confirmer', cancelText = 'Annuler', confirmClass = '' } = {}) {
  return new Promise(resolve => {
    const old = document.getElementById('confirm-modal-backdrop');
    if (old) old.remove();
    const bd = document.createElement('div');
    bd.id = 'confirm-modal-backdrop';
    bd.className = 'modal-backdrop';
    bd.innerHTML =
      '<div class="modal-box" style="max-width:380px;text-align:center">' +
        '<div style="font-size:36px;margin-bottom:10px">' + icon + '</div>' +
        '<div class="modal-title" style="text-align:center">' + title + '</div>' +
        (message ? '<p style="font-size:13.5px;color:var(--text-muted,#64748b);margin:0 0 18px;line-height:1.5">' + message + '</p>' : '') +
        '<div class="modal-actions" style="justify-content:center">' +
          '<button class="btn" id="cm-cancel" style="padding:9px 20px;font-size:13px">' + cancelText + '</button>' +
          '<button class="btn ' + confirmClass + '" id="cm-ok" style="padding:9px 20px;font-size:13px' +
            (confirmClass ? '' : ';background:var(--cpmi-mid,#0891b2);color:#fff;border-color:transparent') + '">' + confirmText + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(bd);
    const cleanup = val => { bd.remove(); resolve(val); };
    document.getElementById('cm-ok').addEventListener('click',     () => cleanup(true));
    document.getElementById('cm-cancel').addEventListener('click', () => cleanup(false));
    bd.addEventListener('click', e => { if (e.target === bd) cleanup(false); });
  });
}

// ============================================================
// AUTHENTIFICATION — comptes multi-utilisateurs
// ============================================================

const SESSION_KEY = 'labo_session_user';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // ✅ v2: 24 heures (recommandé système médical)

// Utilisateur actuellement connecté : { id, username, role, expiresAt }
let _currentUser = null;

function hasValidSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return false;
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { return false; }
  if (!parsed || !parsed.expiresAt || Date.now() > parsed.expiresAt || !parsed.id || !parsed.token) {
    localStorage.removeItem(SESSION_KEY);
    return false;
  }
  _currentUser = parsed;
  return true;
}

function setSession(user) {
  _currentUser = { id: user.id, username: user.username, role: user.role, token: user.token, expiresAt: Date.now() + SESSION_DURATION_MS };
  localStorage.setItem(SESSION_KEY, JSON.stringify(_currentUser));
}

// ✅ v13 — jeton de session opaque : seule preuve d'authentification acceptée
// côté serveur. Sans jeton valide, aucune donnée patient n'est accessible.
function TK() { return _currentUser?.token || null; }

function clearSession() {
  const t = TK();
  if (t && _sb) { try { _sb.rpc('logout_token', { p_token: t }); } catch(e){} }
  _currentUser = null;
  localStorage.removeItem(SESSION_KEY);
}

function isAdmin() {
  return !!_currentUser && _currentUser.role === 'admin';
}
// ✅ v13.169 — Nom du technicien porté sur le compte rendu (signature « TBM … »).
// Quand c'est l'administrateur qui saisit/édite, le compte rendu est signé au
// nom du biologiste responsable (TBM YERIGUE) plutôt qu'au nom du compte admin.
function nomTechnicien() {
  if (isAdmin()) return 'YERIGUE';
  return (_currentUser && _currentUser.username) || '';
}
// ✅ v13.33 — Rôle Caissier : accès lecture à toutes les fiches + caisse complète, pas de saisie
function isCaissier() {
  return !!_currentUser && _currentUser.role === 'caissier';
}
// ✅ v13.37 — Rôle Spectateur : voit la caisse (comme le caissier) mais AUCUNE
// interaction (pas d'encaissement, pas de modification, rien).
function isSpectateur() {
  return !!_currentUser && _currentUser.role === 'spectateur';
}
// ✅ v13.244 — Rôle « Responsable » : un gérant de site, affiché comme tel.
//   Pouvoirs d'exploitation (saisir, encaisser, masquer, clôturer) et gestion
//   du personnel, DANS SON PÉRIMÈTRE. Le serveur lui cache les comptes
//   admin/Nadia, la caisse noire, le coffre, et les fiches du propriétaire
//   (créées ou masquées par admin/Nadia). Ce n'est pas un administrateur.
function isResponsable() {
  return !!_currentUser && _currentUser.role === 'responsable';
}

// ✅ v13.245 — Qui peut masquer / démasquer une fiche (miroir de toggle_restriction).
//   Admin : toutes. Responsable : toute fiche de son équipe, jamais celles
//   créées ou masquées par la direction. Les autres : leurs propres fiches,
//   et seulement si c'est eux qui les ont masquées. Le serveur reste juge.
//   Garde-fou d'affichage seulement : le serveur reconnaît la direction par le
//   RÔLE admin (et le marquage « caché au resp. ») et n'envoie jamais leurs
//   fiches au responsable (v13.246, _username_hors_resp).
function _estCompteDirection(nom) {
  return ['admin', 'nadia'].includes(String(nom || '').trim().toLowerCase());
}
function peutMasquerFiche(r) {
  if (!r || !_currentUser) return false;
  if (isAdmin()) return true;
  if (isResponsable()) return !_estCompteDirection(r.createdBy) && !_estCompteDirection(r.restrictedBy);
  const moi = _currentUser.username;
  return r.createdBy === moi && (!r.restrictedBy || r.restrictedBy === moi);
}
// ✅ v13.249 — RÈGLE UNIQUE « peut ouvrir une fiche MASQUÉE » (impression,
//   export, saisie des résultats) : son créateur, celui qui l'a masquée,
//   l'admin, et le Responsable pour celles qu'il peut lui-même masquer
//   (jamais celles de la direction). Le serveur reste le vrai garde-fou.
function peutOuvrirFicheMasquee(r) {
  if (!r || !_currentUser) return false;
  const moi = _currentUser.username;
  if (r.createdBy === moi || r.restrictedBy === moi) return true;
  return isAdmin() || (isResponsable() && peutMasquerFiche(r));
}
// ✅ v13.211 — La CAISSE NOIRE est réservée au seul compte « nadia » (identifié
// par son nom d'utilisateur, pas par un rôle). Aucun autre agent, caissier,
// spectateur ni même l'administrateur n'y a accès.
function estCompteNadia() {
  return !!_currentUser && String(_currentUser.username || '').toLowerCase() === 'nadia';
}
// ✅ v13.211 — Accès à la CAISSE NOIRE : le compte nadia OU l'administrateur
// (qui voit tout). Personne d'autre (agents, caissier, spectateur).
function accesCaisseNoire() {
  return estCompteNadia() || isAdmin();
}
// Lecture seule stricte (spectateur) : bloque toute action. Retourne true si bloqué.
function blockIfSpectateur() {
  if (isSpectateur()) { toast('👁 Compte spectateur — lecture seule, aucune action possible', 'err'); return true; }
  return false;
}

// ✅ v13.225 — PROVISOIRE (demande explicite « pour le moment ») : TOUS les
// agents peuvent encaisser, même lorsqu'un compte caissier existe. Seuls le
// spectateur (lecture seule) et le prescripteur (portail soignant) restent
// exclus. Les RPC serveur encaisser_lot / update_dossier_patient appliquent la
// même règle. Pour revenir au comportement antérieur (agent uniquement si
// aucun caissier), restaurer la condition window._noCaissier === true.
function peutEncaisser() {
  if (!_currentUser) return false;
  const role = _currentUser.role;
  return role !== 'spectateur' && role !== 'prescripteur';
}
// Un agent « fait la caisse » (pas de caissier) — utile pour l'aiguillage des vues.
function agentFaitCaisse() {
  return !isAdmin() && !isCaissier() && !isSpectateur() && window._noCaissier === true;
}
// ✅ v13.225 — « Tenir la caisse » = disposer de la CAISSE COMPLÈTE (tableau de
// bord, clôture/verrouillage de journée). C'est PLUS que le simple droit
// d'encaisser : réservé à l'admin, au caissier, ou à un agent quand il n'existe
// aucun caissier. Un agent ordinaire peut encaisser (peutEncaisser) sans pour
// autant tenir la caisse (pas de clôture). La clôture n'est réouvrable que par
// l'admin : on ne l'ouvre donc pas à tout agent.
function tientLaCaisse() {
  // ✅ v13.245 — Le responsable (gérant du site) tient la caisse : vue complète,
  //   ristournes, clôture et déverrouillage de journée, annulation de paiement.
  if (isAdmin() || isCaissier() || isResponsable()) return true;
  if (isSpectateur()) return false;
  return window._noCaissier === true;
}
// ✅ v13.228 — ANNULER / reverser un paiement est réservé à l'admin et au
// caissier. Les agents peuvent ENCAISSER (peutEncaisser) mais pas annuler :
// séparation des tâches (prendre l'argent ≠ le rendre). Miroir côté serveur
// dans update_dossier_patient (RETURN 'forbidden_annulation').
function peutAnnulerPaiement() {
  // ✅ v13.245 — Le responsable annule aussi (update_dossier_patient l'autorise,
  //   toujours limité aux fiches de son équipe).
  return isAdmin() || isResponsable() || (typeof isCaissier === 'function' && isCaissier());
}
async function chargerEtatCaissier() {
  try {
    if (!_sb || typeof TK !== 'function' || !TK()) return;
    const { data, error } = await _sb.rpc('caissier_exists', { p_token: TK() });
    if (!error && typeof data === 'boolean') {
      window._noCaissier = (data === false);
      // Rafraîchir l'aiguillage des vues et la barre d'outils si déjà affichés.
      try { if (typeof updateBandeauPaiement === 'function') updateBandeauPaiement(); } catch (e) {}
      try { if (typeof updateBulkToolbar === 'function') updateBulkToolbar(); } catch (e) {}
    }
  } catch (e) { /* réseau : on laisse la valeur par défaut (caisse présente) */ }
}

// ✅ v13.33 — Secousse de la carte quand une erreur de connexion apparaît.
// Implémenté par observation du conteneur d'erreur : aucune des (nombreuses)
// branches de doLogin n'a besoin d'être modifiée.
(function initLoginShake() {
  const start = () => {
    const errEl = document.getElementById('login-error');
    const card  = null; // ✅ v13.34+ — login-card dans login.html
    if (!errEl) return;
    // Messages transitoires qui ne sont pas des erreurs
    const NEUTRAL = ['', 'Vérification…', 'Vérification...'];
    new MutationObserver(() => {
      const txt = (errEl.textContent || '').trim();
      if (NEUTRAL.includes(txt)) return;
      card.classList.remove('shake');
      void card.offsetWidth;          // force le redémarrage de l'animation
      card.classList.add('shake');
    }).observe(errEl, { childList: true, characterData: true, subtree: true });
    card.addEventListener('animationend', e => {
      if (e.animationName === 'login-shake') card.classList.remove('shake');
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else { start(); }
})();

// ✅ v13.34+ — doLogin() déplacé dans login.html

function doLogout() {
  if (!confirm('Se déconnecter ?')) return;
  if (typeof stopTokenRefresh === 'function') stopTokenRefresh();
  clearSession();
  // ✅ v13.34+ — Redirection vers la page de login dédiée
  window.location.replace('login.html');
}

function enterApp() {
  // ✅ v13.34+ — login géré par login.html, app-root toujours visible ici
  document.getElementById('app-root').style.display = 'block';
  // Charger les valeurs de référence depuis Supabase au login
  (async () => {
    try { await _chargerRefsDepuisBase(); } catch(e) { /* RPC non disponible → utiliser localStorage */ }
    updateAllRefs();
  })();
  // ✅ v13.75 — grille tarifaire partagée : rechargée depuis la base à chaque
  // connexion, pour qu'un prix modifié par l'admin s'applique à tous les
  // postes dès leur prochaine ouverture de session.
  if (typeof chargerTarifsDepuisBase === 'function') chargerTarifsDepuisBase();
  // ✅ v13.77 — catalogue d'examens personnalisés, lui aussi partagé.
  if (typeof chargerExamensCustomDepuisBase === 'function') chargerExamensCustomDepuisBase();
  initApp();
  updateSyncBanner();          // ✅ v13.4
  flushSyncQueue(true);        // ✅ v13.4 — tenter la synchro silencieuse au démarrage
  // ✅ v13.254 — Les dossiers enregistrés sur les autres postes arrivent seuls.
  if (typeof demarrerSynchronisation === 'function') demarrerSynchronisation();
  _envoyerAnomalies();         // anomalies restées en file (hors ligne) : envoyées sans attendre la suivante
  // ✅ v13.28 — heartbeat jeton (F9), 1re connexion (F8), permission notifications (F10)
  if (typeof startTokenRefresh === 'function') startTokenRefresh();
  if (typeof checkFirstLogin === 'function') checkFirstLogin();
  if (typeof requestNotifPermission === 'function') requestNotifPermission();
  // ✅ v13.37 — Surveillance des connexions/déconnexions pour l'admin :
  // badge initial + notification en direct toutes les 90 s tant que l'app est ouverte.
  if (isAdmin()) {
    setTimeout(() => checkNewConnexions(false), 1500);
    setTimeout(() => checkNewAnomalies(false), 2500);      // ✅ v13.251
    if (!_connPoll) _connPoll = setInterval(() => { checkNewConnexions(true); checkNewAnomalies(true); }, 90000);
  }
}

// ✅ v13.37 — Journalise la déconnexion à la fermeture de l'app (best-effort).
// fetch keepalive survit à l'unload ; la session N'EST PAS supprimée (reconnexion
// auto conservée). Permet à l'admin de voir l'heure de déconnexion même quand
// l'utilisateur ferme l'onglet sans cliquer « Déconnexion ».
(function setupDisconnectBeacon() {
  function beacon() {
    try {
      const t = (typeof TK === 'function') ? TK() : null;
      if (!t || typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_KEY === 'undefined') return;
      fetch(SUPABASE_URL + '/rest/v1/rpc/log_disconnect', {
        method: 'POST', keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY
        },
        body: JSON.stringify({ p_token: t })
      }).catch(() => {});
    } catch (e) {}
  }
  window.addEventListener('pagehide', beacon);
})();

function updateUserBadge() {
  const el = document.getElementById('user-badge');
  if (el && _currentUser) {
    const roleLabel = isAdmin() ? '👑 Admin' : isResponsable() ? '💼 Responsable'
      : isCaissier() ? '💰 Caissier' : isSpectateur() ? '👁 Spectateur' : '🔬 Agent';
    el.textContent = `${_currentUser.username} · ${roleLabel}`;
  }
  // ✅ v13.33 — btn-clear-history supprimé ; btn-masquees géré par updateMasqueesBtn()
  updateMasqueesBtn();
  // ✅ v13.122 — Savoir s'il existe un caissier (sinon un agent peut encaisser).
  if (typeof chargerEtatCaissier === 'function') chargerEtatCaissier();
  // ✅ v13.127 — Charger la liste des journées verrouillées.
  if (typeof chargerClotures === 'function') chargerClotures();
  const usersNavBtn = document.getElementById('btn-nav-users');
  if (usersNavBtn) usersNavBtn.style.display = (isAdmin() || isResponsable()) ? '' : 'none';
  // ✅ Tableau de bord Kiosque : réservé à l'admin.
  const accueilNavBtn = document.getElementById('btn-nav-accueil');
  if (accueilNavBtn) accueilNavBtn.style.display = isAdmin() ? '' : 'none';
  // ✅ v13.107 — L'onglet du cahier jaune et ses cartes de réglage restent
  // masqués TANT QUE le serveur n'a pas confirmé l'accès. On ne les révèle
  // plus « parce qu'on est admin » : depuis la seconde porte, un admin en
  // session ordinaire ne doit voir aucun indice du cahier. Les afficher ici,
  // même une fraction de seconde avant la réponse serveur, trahirait la
  // porte — et un échec réseau les laisserait visibles pour de bon.
  // C'est chargerAccesCahier() qui, et lui seul, les fait apparaître.
  const cahierNavBtn = document.getElementById('btn-nav-cahier');
  if (cahierNavBtn) cahierNavBtn.style.display = 'none';
  // ✅ v13.205 — même précaution pour l'onglet du cahier noir.
  const cahierNoirBtn = document.getElementById('btn-nav-cahier-noir');
  if (cahierNoirBtn) cahierNoirBtn.style.display = 'none';
  const cahierColBtn = document.getElementById('cahier-colonnes-card');
  if (cahierColBtn) cahierColBtn.style.display = 'none';
  if (typeof chargerAccesCahier === 'function') chargerAccesCahier();
  // ✅ v13.33 — tarifs-config-card et refs-config-card sont dans des sous-onglets,
  // leur visibilité est gérée par adminShowSub — rien à faire ici.
  if (isAdmin() || isResponsable()) { buildAdminExamensGrid(); buildRefsEditor(); }

  // ✅ v13.33 — Caissier : masquer la nav "Nouvelle saisie" et afficher un message
  const saisieNavBtn = document.querySelector('header .nav-btn[data-view="saisie"]');
  if (saisieNavBtn) saisieNavBtn.style.display = (isCaissier() || isSpectateur()) ? 'none' : '';
  const exportAllBtn = document.querySelector('header .nav-btn[onclick="exportAllExcel()"]');
  // ✅ v13.231 — Agent : écran minimal. On ne garde que « Nouvelle saisie » et
  // « Historique ». L'agent n'a plus besoin des onglets Statistiques, Caisse ni
  // Exporter tout : l'encaissement se fait en cochant dans l'historique, et le
  // bouton « Imprimer » en haut de l'historique sort le registre du jour.
  const estAgent = !!_currentUser && _currentUser.role === 'agent';
  if (exportAllBtn) exportAllBtn.style.display = (isCaissier() || isSpectateur() || estAgent) ? 'none' : '';
  const statsNavBtn = document.querySelector('header .nav-btn[data-view="stats"]');
  if (statsNavBtn) statsNavBtn.style.display = estAgent ? 'none' : '';
  const caisseNavBtn = document.getElementById('btn-nav-caisse');
  if (caisseNavBtn) caisseNavBtn.style.display = estAgent ? 'none' : '';
  // Barre mobile : même règle pour l'onglet Caisse.
  const caisseMobBtn = document.getElementById('mtb-caisse');
  if (caisseMobBtn) caisseMobBtn.style.display = estAgent ? 'none' : '';
  // ✅ v13.109 — Au chargement, revenir sur le dernier onglet consulté plutôt
  // que de retomber systématiquement sur « Nouveau patient ». Le défaut par
  // rôle (caisse pour le caissier/spectateur, saisie pour l'admin/agent) ne
  // s'applique qu'à défaut d'onglet mémorisé ou si le rôle n'y a pas droit.
  setTimeout(() => restaurerDerniereVue(), 50);
}

function restaurerDerniereVue() {
  // Les vues de travail auxquelles CE rôle a droit. Le cahier jaune et les
  // Comptes en sont volontairement absents (voir showView).
  // ✅ v13.231 — L'agent n'a que « Nouvelle saisie » et « Historique ». On retire
  // Stats et Caisse de ses vues permises pour qu'un onglet mémorisé ne le
  // ramène pas sur une page désormais masquée.
  const estAgent = !!_currentUser && _currentUser.role === 'agent';
  const permises = (isCaissier() || isSpectateur())
    ? ['historique','stats','caisse']
    : estAgent
      ? ['saisie','historique']
      : ['saisie','historique','stats','caisse'];   // admin
  let v = null;
  try { v = localStorage.getItem('labo_vue_courante'); } catch (e) {}
  if (v && permises.includes(v)) { showView(v); return; }
  // À défaut : le point de départ habituel de chaque rôle. L'admin arrive sur
  // son tableau de bord Kiosque (accueil) ; l'agent sur l'historique (son hub).
  showView(isAdmin() ? 'accueil'
    : (isCaissier() || isSpectateur()) ? 'caisse'
    : estAgent ? 'historique'
    : 'saisie');
}

// ============================================================
// GESTION DES COMPTES (espace admin)
// ============================================================

// ✅ v13.27 — Purge du journal d'audit (admin uniquement)
async function purgeAuditLog() {
  if (!isAdmin()) { toast('Accès réservé à l\'administrateur', 'err'); return; }
  if (!confirm('⚠️ Purger tout le journal d\'audit ?\n\nCette action est irréversible. Toutes les entrées du journal seront supprimées définitivement.')) return;
  try {
    const { data, error } = await _sb.rpc('purge_audit_log', { p_token: TK() });
    if (error) throw error;
    if (data === 'forbidden') { toast('Accès refusé', 'err'); return; }
    toast('Journal d\'audit purgé ✓', 'ok');
    renderAuditLog();
  } catch(e) {
    toast('Erreur purge : ' + (e.message || e), 'err');
  }
}

// ✅ v13.2 — Consultation du journal d'audit (admin)
const AUDIT_ACTION_LABELS = {
  insert_resultat:'Création fiche', update_resultat:'Modification fiche', delete_resultat:'Suppression fiche',
  clear_resultats:'Vidage historique', create_user:'Création compte', update_user:'Modification compte',
  delete_user:'Suppression compte', insert_prescripteur:'Ajout prescripteur',
  update_prescripteur:'Modif prescripteur', deactivate_prescripteur:'Désactivation prescripteur',
  anomalie:'⚠️ Anomalie'
};
function auditDetails(action, d) {
  if (!d) return '';
  if (action === 'anomalie') return [d.message || '', d.vue || '', d.dossier ? 'N°' + d.dossier : ''].filter(Boolean).join(' · ');
  if (action.endsWith('_resultat') || action === 'delete_resultat')
    return [d.dossier ? 'N°'+d.dossier : '', d.patient||'', d.montant!=null ? d.montant.toLocaleString('fr-FR')+' FCFA' : ''].filter(Boolean).join(' · ');
  if (action === 'clear_resultats') return (d.supprimes||0) + ' fiche(s) supprimée(s)';
  if (action.endsWith('_user')) return [d.username||'', d.role||d.new_role||'', d.password_changed ? 'mot de passe changé' : ''].filter(Boolean).join(' · ');
  if (action.includes('prescripteur')) return [d.nom||'', d.taux!=null ? d.taux+' %' : ''].filter(Boolean).join(' · ');
  return JSON.stringify(d);
}
// ✅ v13.37 — Journal des connexions / déconnexions (admin) + notification
let _lastNotifiedConnTs = null;   // dernier événement déjà notifié (en mémoire)
let _connPoll = null;             // timer de surveillance

async function renderConnexions() {
  if (!isAdmin()) { toast('Réservé aux administrateurs', 'err'); return; }
  const body = document.getElementById('connexions-body');
  if (!body) return;
  body.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:14px">⏳ Chargement…</td></tr>';
  const { data, error } = await _sb.rpc('get_audit_log', { p_token: TK(), p_limit: 500 });
  if (error) { body.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#b91c1c;padding:14px">Erreur de chargement</td></tr>'; return; }
  const conns = (data || []).filter(e => e.action === 'login' || e.action === 'logout');
  if (!conns.length) { body.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:14px">Aucune connexion enregistrée.</td></tr>'; return; }
  body.innerHTML = conns.map(e => {
    const dt = new Date(e.ts).toLocaleString('fr-FR');
    const isLogin = e.action === 'login';
    // Repli sur details.user pour les anciens événements (username non rempli avant v13.37)
    const who = e.username || e.details?.user || '—';
    return '<tr>'
      + '<td style="white-space:nowrap;font-size:12px">' + esc(dt) + '</td>'
      + '<td style="font-weight:600">' + esc(who) + '</td>'
      + '<td><span style="font-size:11.5px;font-weight:700;color:' + (isLogin ? '#166534' : '#b91c1c') + '">'
        + (isLogin ? '🟢 Connexion' : '🔴 Déconnexion') + '</span></td>'
      + '</tr>';
  }).join('');
  // Marquer comme vues → efface le badge
  if (conns[0]?.ts) localStorage.setItem('labo_last_seen_conn', conns[0].ts);
  updateConnexionsBadge(0);
}

function updateConnexionsBadge(n) {
  const btn = document.getElementById('btn-nav-users');
  if (!btn) return;
  let badge = document.getElementById('conn-badge');
  if (n > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'conn-badge';
      badge.style.cssText = 'background:#dc2626;color:#fff;border-radius:999px;padding:1px 6px;font-size:10px;margin-left:4px;font-weight:700';
      btn.appendChild(badge);
    }
    badge.textContent = n;
    badge.style.display = '';
    badge.title = n + ' nouvelle(s) connexion/déconnexion depuis votre dernière consultation';
  } else if (badge) {
    badge.style.display = 'none';
  }
}

async function checkNewConnexions(allowNotify) {
  if (!isAdmin() || !_sb || !TK()) return;
  try {
    const { data } = await _sb.rpc('get_audit_log', { p_token: TK(), p_limit: 100 });
    const conns = (data || []).filter(e =>
      (e.action === 'login' || e.action === 'logout')
      && (e.username || e.details?.user) !== _currentUser?.username);
    // Badge : événements depuis la dernière consultation de l'onglet Connexions
    const lastSeen = localStorage.getItem('labo_last_seen_conn');
    const n = lastSeen ? conns.filter(e => e.ts > lastSeen).length : conns.length;
    updateConnexionsBadge(n);
    // Notification en direct : nouveaux événements depuis le dernier passage
    const newest = conns[0]?.ts || null;
    if (_lastNotifiedConnTs === null) {
      _lastNotifiedConnTs = newest;   // 1er passage : on n'inonde pas de notifs
    } else if (allowNotify && newest && newest > _lastNotifiedConnTs) {
      const fresh = conns.filter(e => e.ts > _lastNotifiedConnTs);
      _lastNotifiedConnTs = newest;
      const d = fresh[0];
      const msg = (d.username || d.details?.user || '?') + ' — ' + (d.action === 'login' ? 'connexion' : 'déconnexion')
        + ' à ' + new Date(d.ts).toLocaleTimeString('fr-FR') + (fresh.length > 1 ? ' (+' + (fresh.length - 1) + ')' : '');
      toast('🔔 ' + msg, 'ok');
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted')
          new Notification('CPMI Labo — Connexion', { body: msg });
      } catch(e) {}
    }
  } catch(e) {}
}

// ✅ v13.251 — Écran « ⚠️ Anomalies » (admin) et alerte en direct.
function _heureAnomalie(e) {
  const t = new Date((e.details && e.details.heure_poste) || e.ts);
  return isNaN(t.getTime()) ? '' : t.toLocaleString('fr-FR');
}
let _anomaliesDonnees = [];
async function renderAnomalies() {
  if (!isAdmin()) return;
  const body = document.getElementById('anomalies-body');
  if (!body) return;
  body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:14px">⏳ Chargement…</td></tr>';
  let data = null, error = null;
  try { ({ data, error } = await _sb.rpc('get_anomalies', { p_token: TK(), p_limit: 500 })); } catch (e) { error = e; }
  if (error) { body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#b91c1c;padding:14px">Journal indisponible (connexion ?)</td></tr>'; return; }
  _anomaliesDonnees = Array.isArray(data) ? data : [];
  filtrerAnomalies();
  if (_anomaliesDonnees[0] && _anomaliesDonnees[0].ts) { try { localStorage.setItem('labo_last_seen_ano', _anomaliesDonnees[0].ts); } catch (e) {} }
  majBadgeAnomalies(0);
}
// ✅ v13.255 — La recherche filtre la liste déjà chargée (plus d'appel serveur par frappe).
function filtrerAnomalies() {
  const body = document.getElementById('anomalies-body');
  if (!body) return;
  const q = (document.getElementById('anomalies-filtre')?.value || '').trim().toLowerCase();
  let rows = _anomaliesDonnees;
  if (q) rows = rows.filter(e => [e.username, (e.details || {}).message, (e.details || {}).vue, (e.details || {}).dossier,
                                  (e.details || {}).examens].join(' ').toLowerCase().includes(q));
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:14px">'
      + (q ? 'Aucune anomalie ne correspond à la recherche.' : 'Aucune anomalie enregistrée. 👍') + '</td></tr>';
  } else {
    body.innerHTML = rows.map(e => {
      const d = e.details || {};
      const ctx = [d.dossier ? 'Dossier N° ' + d.dossier : '', d.examens ? 'Examens : ' + d.examens : '',
                   d.detail || '', [d.role, d.appareil, d.version ? 'v' + d.version : ''].filter(Boolean).join(' · ')].filter(Boolean);
      return '<tr>'
        + '<td style="white-space:nowrap;font-size:12px">' + esc(_heureAnomalie(e)) + '</td>'
        + '<td style="font-weight:600">' + esc(e.username || '—') + '</td>'
        + '<td style="font-size:12px">' + esc(d.vue || '—') + '</td>'
        + '<td style="font-size:12.5px;color:#b91c1c;font-weight:600">' + esc(d.message || '') + '</td>'
        + '<td style="font-size:11.5px;color:var(--text-muted)">' + ctx.map(esc).join('<br>') + '</td>'
        + '</tr>';
    }).join('');
  }
}
function majBadgeAnomalies(n) {
  [['btn-nav-users', 'ano-badge'], ['btn-sub-anomalies', 'ano-badge-sub']].forEach(([hote, id]) => {
    const btn = document.getElementById(hote);
    if (!btn) return;
    let b = document.getElementById(id);
    if (n > 0) {
      if (!b) {
        b = document.createElement('span'); b.id = id;
        b.style.cssText = 'background:#ea580c;color:#fff;border-radius:999px;padding:1px 6px;font-size:10px;margin-left:4px;font-weight:700';
        btn.appendChild(b);
      }
      b.textContent = n; b.style.display = '';
      b.title = n + ' anomalie(s) depuis votre dernière consultation';
    } else if (b) b.style.display = 'none';
  });
}
let _lastNotifiedAnoTs = null;
async function checkNewAnomalies(allowNotify) {
  if (!isAdmin() || typeof _sb === 'undefined' || !_sb || !TK()) return;
  try {
    const { data } = await _sb.rpc('get_anomalies', { p_token: TK(), p_limit: 100 });
    if (!Array.isArray(data)) return;
    // Celles des AUTRES comptes : les siennes, l'admin les a vues à l'écran.
    const autres = data.filter(e => e.username !== _currentUser?.username);
    let vu = null; try { vu = localStorage.getItem('labo_last_seen_ano'); } catch (e) {}
    majBadgeAnomalies(vu ? autres.filter(e => e.ts > vu).length : autres.length);
    const recent = autres[0]?.ts || null;
    if (_lastNotifiedAnoTs === null) { _lastNotifiedAnoTs = recent || ''; return; }
    if (allowNotify && recent && recent > _lastNotifiedAnoTs) {
      const neuves = autres.filter(e => e.ts > _lastNotifiedAnoTs);
      _lastNotifiedAnoTs = recent;
      const d = neuves[0], det = d.details || {};
      const msg = (d.username || '?') + ' à ' + new Date(det.heure_poste || d.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        + ' — ' + (det.message || '') + (neuves.length > 1 ? ' (+' + (neuves.length - 1) + ')' : '');
      toast('⚠️ Anomalie : ' + msg, '');
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted')
          new Notification('CPMI Labo — Anomalie', { body: msg });
      } catch (e) {}
    }
  } catch (e) {}
}

async function renderAuditLog() {
  if (!isAdmin()) { toast('Réservé aux administrateurs', 'err'); return; }
  const body = document.getElementById('audit-body');
  body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:14px">⏳ Chargement…</td></tr>';
  const { data, error } = await _sb.rpc('get_audit_log', { p_token: TK(), p_limit: 300 });
  if (error) { body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#b91c1c;padding:14px">Erreur de chargement (le script 5_audit_log.sql est-il installé ?)</td></tr>'; return; }
  if (!data || !data.length) { body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:14px">Aucune entrée pour l\'instant.</td></tr>'; return; }
  body.innerHTML = data.map(e => {
    const dt = new Date(e.ts).toLocaleString('fr-FR');
    const lbl = AUDIT_ACTION_LABELS[e.action] || e.action;
    const isDelete = e.action.startsWith('delete') || e.action === 'clear_resultats';
    return '<tr>'
      + '<td style="white-space:nowrap;font-size:12px">' + esc(dt) + '</td>'
      + '<td style="font-weight:600">' + esc(e.username || '—') + '</td>'
      + '<td><span style="font-size:11.5px;font-weight:600;color:' + (isDelete ? '#b91c1c' : 'var(--accent)') + '">' + esc(lbl) + '</span></td>'
      + '<td style="font-size:12px;color:var(--text-muted)">' + esc(auditDetails(e.action, e.details)) + '</td>'
      + '</tr>';
  }).join('');
}

async function renderUsersList() {
  const b = document.getElementById('users-body');
  if (!b) return;
  if (!isAdmin() && !isResponsable()) {
    b.innerHTML = `<tr><td colspan="4"><div class="empty-state">Accès réservé aux administrateurs</div></td></tr>`;
    return;
  }
  _limiterRolesProposes();
  b.innerHTML = `<tr><td colspan="4"><div class="empty-state">Chargement…</div></td></tr>`;
  const { data, error } = await _sb.rpc('list_users_admin', { p_token: TK() });
  if (error) {
    console.error('Erreur list_users_admin:', error);
    b.innerHTML = `<tr><td colspan="4"><div class="empty-state">Erreur de chargement</div></td></tr>`;
    return;
  }
  if (!data || !data.length) {
    b.innerHTML = `<tr><td colspan="4"><div class="empty-state">Aucun compte</div></td></tr>`;
    return;
  }
  b.innerHTML = data.map(u => {
    const dateStr = u.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR') : '—';
    const roleLabel = u.role === 'admin' ? '👑 Administrateur' : u.role === 'responsable' ? '💼 Responsable' : u.role === 'caissier' ? '💰 Caissier' : u.role === 'spectateur' ? '👁 Spectateur' : u.role === 'prescripteur' ? '🩺 Prescripteur' : '🔬 Agent';
    const isSelf = u.id === _currentUser.id;
    const isProtected = u.username === 'admin';
    // ✅ v13.244 — Réservé au propriétaire : masquer un compte (et ses fiches) au
    //   responsable, comme Nadia. Pas sur l'admin ni les prescripteurs/responsables.
    const horsResp = !!u.hors_responsable;
    const peutMasquerResp = isAdmin() && u.role !== 'admin' && u.role !== 'responsable' && u.role !== 'prescripteur';
    const badgeHors = horsResp ? ' <span title="Caché au responsable" style="color:#92400e;font-size:11px">🙈</span>' : '';
    return `
    <tr>
      <td data-label="Nom d'utilisateur"><strong>${u.username}</strong>${isSelf ? ' <span style="color:var(--text-muted);font-size:11px">(vous)</span>' : ''}${isProtected ? ' <span title="Compte protégé, ne peut pas être supprimé ni rétrogradé" style="color:var(--text-muted);font-size:11px">🔒</span>' : ''}${badgeHors}</td>
      <td data-label="Rôle"><span class="badge-type">${roleLabel}</span></td>
      <td data-label="Créé le">${dateStr}</td>
      <td data-label="Actions">
        <button class="btn" style="padding:4px 10px;font-size:11px" onclick="editUserAccount(${u.id}, '${u.username.replace(/'/g, "\\'")}', '${u.role}')">✏ Modifier</button>
        ${isAdmin() ? `<button class="btn" style="padding:4px 10px;font-size:11px;margin-left:4px;background:#eef7fb;color:#0b2545;border:1px solid #bfe0ef" onclick="ouvrirSignatureCompte('${u.username.replace(/'/g, "\\'")}')" title="Dessiner ou modifier la signature">✍️ Signature</button>` : ''}
        ${peutMasquerResp ? `<button class="btn" style="padding:4px 10px;font-size:11px;margin-left:4px;background:${horsResp ? '#fef3c7;color:#92400e;border:1px solid #fbbf24' : '#f1f5f9;color:#475569;border:1px solid #cbd5e1'}" onclick="setCompteHorsResponsable(${u.id}, ${!horsResp}, '${u.username.replace(/'/g, "\\'")}')" title="${horsResp ? 'Rendre ce compte visible au responsable' : 'Masquer ce compte et ses fiches au responsable (comme Nadia)'}">${horsResp ? '🙈 Caché au resp.' : '👁 Visible au resp.'}</button>` : ''}
        ${(isSelf || isProtected) ? '' : `<button class="btn btn-danger" style="padding:4px 10px;font-size:11px;margin-left:4px" onclick="deleteUserAccount(${u.id}, '${u.username.replace(/'/g, "\\'")}')">🗑</button>`}
      </td>
    </tr>`;
  }).join('');
}


// ✅ v13.103 — Le menu proposait « Prescripteur » depuis la v13.96, mais
// l'appel n'envoyait pas le soignant à rattacher : la création échouait donc
// systématiquement, sans que rien à l'écran n'explique pourquoi.
function majBlocPrescripteur() {
  const role = document.getElementById('nu_role')?.value;
  const bloc = document.getElementById('nu-presc-bloc');
  const sel  = document.getElementById('nu_prescripteur');
  if (!bloc || !sel) return;
  const actif = role === 'prescripteur';
  bloc.style.display = actif ? '' : 'none';
  if (!actif) return;
  const liste = (typeof _prescripteurs !== 'undefined' && Array.isArray(_prescripteurs))
    ? _prescripteurs.filter(p => p.actif !== false) : [];
  sel.innerHTML = '<option value="">— choisir —</option>' +
    liste.map(p => `<option value="${p.id}">${escHTML(p.nom)}</option>`).join('');
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('nu_role')?.addEventListener('change', majBlocPrescripteur);
});

async function createUserAccount() {
  const errEl = document.getElementById('nu-error');
  errEl.textContent = '';
  const username = document.getElementById('nu_username').value.trim();
  const password = document.getElementById('nu_password').value;
  const role = document.getElementById('nu_role').value;

  if (!username || !password) {
    errEl.textContent = "Nom d'utilisateur et mot de passe obligatoires.";
    return;
  }
  // ✅ v13 — exigence de complexité (cohérente avec le minimum serveur)
  if (password.length < 8 || !/[0-9]/.test(password) || !/[A-Za-z]/.test(password)) {
    errEl.textContent = 'Mot de passe : au moins 8 caractères, avec au moins une lettre et un chiffre.';
    return;
  }

  let prescId = null;
  if (role === 'prescripteur') {
    prescId = parseInt(document.getElementById('nu_prescripteur')?.value || '', 10);
    if (!prescId) {
      errEl.textContent = 'Choisissez le soignant auquel rattacher ce compte.';
      return;
    }
  }

  const { data, error } = await _sb.rpc('create_user_admin', {
    p_token: TK(),
    p_new_username: username,
    p_new_password: password,
    p_new_role: role,
    p_prescripteur_id: prescId,
  });
  if (error) {
    console.error('Erreur create_user_admin:', error);
    errEl.textContent = 'Erreur serveur, réessayez.';
    return;
  }
  if (data === 'duplicate') {
    errEl.textContent = 'Ce nom d\'utilisateur existe déjà.';
    return;
  }
  if (data === 'forbidden') {
    // ✅ v13.245 — Le responsable crée aussi des comptes : message neutre.
    errEl.textContent = isResponsable()
      ? 'Ce type de compte ne peut pas être créé depuis votre compte.'
      : 'Action réservée aux administrateurs.';
    return;
  }
  if (data !== 'ok') {
    errEl.textContent = 'Erreur : ' + data;
    return;
  }
  document.getElementById('nu_username').value = '';
  document.getElementById('nu_password').value = '';
  document.getElementById('nu_role').value = 'agent';
  toast('Compte "' + username + '" créé ✓', 'ok');
  renderUsersList();

  // ✅ v13.49 — Proposer de dessiner la signature du nouveau compte
  // ✅ v13.245 — Réservé à l'admin, comme le bouton « Signature » de la liste
  //   (set_user_signature le refuse aux autres profils).
  if (!isAdmin()) return;
  ouvrirPadSignatureGenerique({
    titre: '✍️ Signature de ' + escHTML(username),
    sousTitre: 'Dessinez la signature de ' + escHTML(username) + '. Elle apparaîtra automatiquement sous les résultats du patient quand cette personne se connecte. (Vous pourrez la modifier plus tard.)',
    onSave: (dataURL) => enregistrerSignatureCompte(username, dataURL)
  });
}

// ✅ v13.244 — Le responsable ne propose que agent / caissier / spectateur.
function _limiterRolesProposes() {
  const limite = !isAdmin() && isResponsable();
  ['nu_role', 'um_role'].forEach(idSel => {
    const sel = document.getElementById(idSel); if (!sel) return;
    [...sel.options].forEach(o => {
      const interdit = limite && (o.value === 'admin' || o.value === 'prescripteur' || o.value === 'responsable');
      o.hidden = interdit; o.disabled = interdit;
    });
    if (limite && sel.selectedOptions[0] && sel.selectedOptions[0].disabled) sel.value = 'agent';
  });
}
function editUserAccount(id, username, currentRole) {
  // ✅ v13.7 — modale (remplace confirm + prompt, peu ergonomiques sur mobile)
  document.getElementById('um_id').value = id;
  document.getElementById('um_name').textContent = 'Compte : ' + username;
  document.getElementById('um_role').value = currentRole;
  // ✅ v13.245 — Filtrer APRÈS avoir posé le rôle actuel : sinon la liste
  //   pouvait rester sur une option masquée et interdite.
  _limiterRolesProposes();
  document.getElementById('um_password').value = '';
  document.getElementById('um-error').textContent = '';
  document.getElementById('user-modal').dataset.username = username;
  document.getElementById('user-modal').style.display = 'flex';
}

function closeUserModal() {
  document.getElementById('user-modal').style.display = 'none';
}

async function submitUserModal() {
  const errEl = document.getElementById('um-error');
  errEl.textContent = '';
  const id = parseInt(document.getElementById('um_id').value, 10);
  const newRole = document.getElementById('um_role').value;
  const newPassword = document.getElementById('um_password').value;
  if (newPassword && (newPassword.length < 8 || !/[0-9]/.test(newPassword) || !/[A-Za-z]/.test(newPassword))) {
    errEl.textContent = 'Mot de passe : ≥ 8 caractères, avec au moins une lettre et un chiffre.';
    return;
  }
  const { data, error } = await _sb.rpc('update_user_admin', {
    p_token: TK(),
    p_target_id: id,
    p_new_password: newPassword || null,
    p_new_role: newRole,
  });
  if (error) { console.error('Erreur update_user_admin:', error); errEl.textContent = 'Erreur serveur.'; return; }
  if (data === 'cannot_demote_self') { errEl.textContent = 'Vous ne pouvez pas retirer vos propres droits administrateur.'; return; }
  if (data === 'protected_account')  { errEl.textContent = 'Le compte « admin » est protégé : son rôle ne peut pas être changé.'; return; }
  if (data === 'forbidden')          { errEl.textContent = 'Ce compte ne peut pas être modifié depuis votre compte.'; return; }
  if (data !== 'ok') { errEl.textContent = 'Erreur : ' + data; return; }
  closeUserModal();
  // ✅ Reset admin : un mot de passe temporaire a été posé → l'utilisateur devra
  //   le changer à sa prochaine connexion (must_change_password côté serveur).
  toast(newPassword ? 'Mot de passe temporaire défini — à changer à la prochaine connexion ✓'
                    : 'Compte mis à jour ✓', 'ok');
  renderUsersList();
}

async function deleteUserAccount(id, username) {
  if (!confirm(`Supprimer définitivement le compte "${username}" ?`)) return;
  const { data, error } = await _sb.rpc('delete_user_admin', { p_token: TK(), p_target_id: id });
  if (error) {
    console.error('Erreur delete_user_admin:', error);
    toast('Erreur serveur', 'err');
    return;
  }
  if (data === 'cannot_delete_self') {
    toast('Vous ne pouvez pas supprimer votre propre compte', 'err');
    return;
  }
  if (data === 'protected_account') {
    toast('Le compte "admin" est protégé et ne peut pas être supprimé', 'err');
    return;
  }
  if (data !== 'ok') {
    toast('Erreur : ' + data, 'err');
    return;
  }
  toast('Compte "' + username + '" supprimé', 'ok');
  renderUsersList();
}

// ✅ v13.244 — Propriétaire : masquer / rendre visible un compte au responsable.
async function setCompteHorsResponsable(id, value, username) {
  if (!isAdmin()) return;
  if (value && !confirm('Masquer « ' + username +' » (et ses fiches) au responsable, comme Nadia ?')) return;
  const { data, error } = await _sb.rpc('set_compte_hors_responsable', { p_token: TK(), p_target_id: id, p_value: value });
  if (error) { console.error('set_compte_hors_responsable:', error); toast('Erreur serveur', 'err'); return; }
  if (data !== 'ok') { toast('Erreur : ' + data, 'err'); return; }
  toast(value ? '🙈 « ' + username + ' » caché au responsable' : '👁 « ' + username + ' » visible au responsable', 'ok');
  renderUsersList();
}

async function initApp() {
  document.getElementById('p_date').value = new Date().toISOString().slice(0,10);
  regenDossier(); // asynchrone — met à jour le champ dès résolution, sans bloquer le reste
  // Seul l'onglet actif par défaut (Hématologie) est construit immédiatement.
  // Les autres (Bio, Bactério, Sérologie, Parasito, GS, BPN) sont construits
  // à la demande, au moment du premier clic sur leur onglet — voir switchTab().
  ensurePanelBuilt('hema');
  updateUserBadge();
  loadPrescripteurs();
  buildFicheExamens(); // fiche d'identification avec examens
  chargerMaSignature(); // ✅ v13.49 — signature du compte pour les comptes rendus
}


// ============================================================
// ÉDITEUR DE VALEURS DE RÉFÉRENCE (admin)
// ============================================================

// ✅ v13.101 — Valeurs de référence DÉRIVÉES des listes canoniques : source
// unique des identifiants et des noms. Un paramètre ne peut plus figurer ici
// sans réplique ailleurs, ni porter un identifiant divergent. Les quelques
// valeurs cliniques que les listes canoniques ne portent pas (seuils
// sérologiques, formule leucocytaire exprimée en %) sont fournies par un petit
// overlay, TOUJOURS keyé par l'identifiant canonique.
function refsSections() {
  const HEMAP  = typeof HEMA_PARAMS     !== 'undefined' ? HEMA_PARAMS     : [];
  const HEMAFL = typeof HEMA_FL         !== 'undefined' ? HEMA_FL         : [];
  const EPHB   = typeof EPHB_FRACTIONS  !== 'undefined' ? EPHB_FRACTIONS  : [];
  const WIDAL  = typeof WIDAL_ANTIGENES !== 'undefined' ? WIDAL_ANTIGENES : [];
  const SEROT  = typeof SERO_TESTS      !== 'undefined' ? SERO_TESTS      : [];
  const B = {
    glu:  typeof BIO_GLUCIDES!=='undefined'?BIO_GLUCIDES:[], rein: typeof BIO_REIN!=='undefined'?BIO_REIN:[],
    foie: typeof BIO_FOIE!=='undefined'?BIO_FOIE:[],         lip:  typeof BIO_LIPIDES!=='undefined'?BIO_LIPIDES:[],
    iono: typeof BIO_IONO!=='undefined'?BIO_IONO:[],         fer:  typeof BIO_FER!=='undefined'?BIO_FER:[],
    coag: typeof BIO_COAG!=='undefined'?BIO_COAG:[],         card: typeof BIO_CARD!=='undefined'?BIO_CARD:[],
    horm: typeof BIO_HORM!=='undefined'?BIO_HORM:[],         autre:typeof BIO_AUTRE!=='undefined'?BIO_AUTRE:[],
  };
  const BNFS = typeof BPN_NFS!=='undefined'?BPN_NFS:[];  const BFL  = typeof BPN_FL !=='undefined'?BPN_FL :[];
  const BBIO = typeof BPN_BIO!=='undefined'?BPN_BIO:[];  const BSERO= typeof BPN_SERO!=='undefined'?BPN_SERO:[];

  // Overlays : valeurs cliniques absentes des listes canoniques, keyées par id canonique.
  const FL_PCT = { pnn:{unit:'%',ref:'50–70',lo:50,hi:70}, pne:{unit:'%',ref:'1–5',lo:1,hi:5},
    pnb:{unit:'%',ref:'0–1',lo:0,hi:1}, lymp:{unit:'%',ref:'20–40',lo:20,hi:40}, mono:{unit:'%',ref:'2–10',lo:2,hi:10} };
  const SERO_DEF = { hbsac:{ref:'> 10 (protecteur)',lo:10,hi:9999}, toxo:{ref:'> 8 (immunisé)',lo:8,hi:9999},
    rubig:{ref:'> 10 (immunisé)',lo:10,hi:9999}, aso:{ref:'< 200',lo:0,hi:200}, tsh:{ref:'0.4–4.0',lo:0.4,hi:4.0},
    ft4:{ref:'12–22',lo:12,hi:22}, psa:{ref:'< 4.0',lo:0,hi:4.0} };
  const BPNSERO_DEF = { bpn_hbsac:{lo:10,hi:9999}, bpn_toxog:{lo:8,hi:9999}, bpn_rubg:{lo:10,hi:9999} };

  const row = (x, ov) => { ov = ov || {}; return {
    id:   ov.id   != null ? ov.id   : x.id,
    name: ov.name != null ? ov.name : x.name,
    unit: ov.unit != null ? ov.unit : (x.unit || ''),
    ref:  ov.ref  != null ? ov.ref  : (x.ref != null ? x.ref : (x.lo!=null&&x.hi!=null ? (x.lo+'–'+x.hi) : '')),
    lo:   ov.lo   != null ? ov.lo   : x.lo,
    hi:   ov.hi   != null ? ov.hi   : x.hi,
  }; };
  const from = (list, map) => (list||[]).map(x => row(x, map ? map(x) : null));

  return [
    { label:'🩸 Hématologie — NFS', id:'nfs',
      params: from(HEMAP, x => ({ ref: x.refM || x.refF || null,
        hi: (x.hi!=null?x.hi:(x.hiF!=null?x.hiF:x.hiM)) })) },
    { label:'🩸 Formule leucocytaire', id:'fl', note:'Valeurs usuelles en pourcentage.',
      params: from(HEMAFL, x => FL_PCT[x.id]) },
    { label:"🔬 Électrophorèse de l'hémoglobine", id:'ephb', params: from(EPHB) },
    { label:'🔵 Sérodiagnostic de Widal — Seuils significatifs', id:'widal',
      note:'Le seuil est la valeur minimale de lo. Ex: lo=80 → 1/80 significatif.',
      params: from(WIDAL, x => ({ id:'widal_'+x.id, unit:'dilution', ref:'1/'+x.seuil, lo:x.seuil, hi:9999 })) },
    { label:'🧪 Biochimie — Glucides', id:'bio_glu', params: from(B.glu) },
    { label:'🧪 Biochimie — Fonction rénale', id:'bio_rein', params: from(B.rein) },
    { label:'🧪 Biochimie — Fonction hépatique & Pancréas', id:'bio_foie', params: from(B.foie) },
    { label:'🧪 Biochimie — Lipides', id:'bio_lip', params: from(B.lip) },
    { label:'🧪 Biochimie — Ionogramme & Minéraux', id:'bio_iono', params: from(B.iono) },
    { label:'🧪 Biochimie — Fer & Hémostase', id:'bio_fer', params: from(B.fer).concat(from(B.coag)) },
    { label:'❤️ Marqueurs cardiaques', id:'bio_card', params: from(B.card) },
    { label:'🧬 Hormones & Vitamines', id:'bio_horm', params: from(B.horm) },
    { label:'🔬 Autres marqueurs', id:'bio_autre', params: from(B.autre) },
    { label:'🧫 Sérologie — Tests quantitatifs (valeurs normales)', id:'sero',
      note:'Les tests qualitatifs (Positif/Négatif) n\'ont pas de plage numérique.',
      params: from(SEROT.filter(t => t.type==='quant'), x => Object.assign({ id:'sero_'+x.id }, SERO_DEF[x.id] || {})) },
    { label:'🤰 Bilan prénatal — NFS', id:'bpn_nfs', params: from(BNFS) },
    { label:'🤰 Bilan prénatal — Formule leucocytaire', id:'bpn_fl', params: from(BFL) },
    { label:'🤰 Bilan prénatal — Biochimie', id:'bpn_bio', params: from(BBIO) },
    { label:'🤰 Bilan prénatal — Sérologies', id:'bpn_sero',
      note:'Seuls les tests quantitatifs ont des seuils.',
      params: from(BSERO.filter(t => t.type==='quant'), x => (BPNSERO_DEF[x.id] || {})) },
  ];
}

// ✅ v13.257 — Éditeur PAR PROFIL (tranche d'âge + sexe). Avant, une seule
//   colonne par paramètre : une valeur réglée remplaçait celle de tous les âges
//   et des deux sexes, et un seul clic sur « Enregistrer » figeait ainsi ~70
//   paramètres (Hb femme 13–17 au lieu de 12–16, Hb nouveau-né 13–17…).
//   Désormais on choisit le profil ; seules les lignes réellement changées
//   sont enregistrées, pour ce profil ; les autres gardent le référentiel.
//   Les paramètres identiques pour tous (« tous profils ») se règlent une fois.
let _refsProfil = { tranche: 'ADULTE', sexe: 'F' };
const _LIBELLES_TRANCHES = {
  NN: 'Nouveau-né (< 1 mois)', NOURR: 'Nourrisson (1 mois – 2 ans)', ENFANT: 'Enfant (2 – 12 ans)',
  ADO: 'Adolescent (12 – 18 ans)', ADULTE: 'Adulte (18 – 60 ans)', SENIOR: 'Senior (60 ans et plus)',
};
function _libelleProfilRefs(cle) {
  if (!cle || cle === '*') return 'tous profils';
  const [t, s] = cle.split('_');
  return ((TRANCHES[t] && TRANCHES[t].label) || t) + ', ' + (s === 'M' ? 'homme' : 'femme');
}
function _profilDeCle(cle) {
  if (!cle || cle === '*') return {};
  const [tranche, sexe] = cle.split('_');
  return { tranche, sexe };
}
// Paramètres de l'éditeur, par id (dérivés des listes canoniques).
function _refsParamsParId() {
  const m = {};
  refsSections().forEach(sec => sec.params.forEach(p => { if (p.id && !m[p.id]) m[p.id] = p; }));
  return m;
}
// Valeur par défaut d'un paramètre pour un profil : le référentiel (NORM)
// quand il existe — c'est lui qu'appliquent les comptes rendus —, sinon les
// valeurs de la liste canonique.
function _refDefaut(p, profil) {
  if (typeof NORM !== 'undefined' && NORM[p.id]) {
    const b = _getRefBase(p.id, refVarieSelonProfil(p.id) ? (profil || {}) : {});
    if (b) return { ref: b.ref, lo: b.lo, hi: b.hi };
  }
  return { ref: p.ref == null ? '' : p.ref, lo: p.lo, hi: p.hi };
}
function _refEgal(a, b) {
  const t = x => String(x == null ? '' : x).trim();
  return t(a.ref) === t(b.ref) && _refNombre(a.lo, 0) === _refNombre(b.lo, 0)
      && _refNombre(a.hi, 999) === _refNombre(b.hi, 999);
}
// Saisies de l'éditeur appliquées à la configuration (copie) pour un profil.
function _refsAvecSaisies(base, saisies, profil) {
  const c = {};
  Object.keys(base || {}).forEach(id => {
    const e = refPersoNormalisee(id, base[id]);
    if (e && (e.unit !== undefined || (e.p && Object.keys(e.p).length))) c[id] = e;
  });
  saisies.forEach(s => {
    const cle = refVarieSelonProfil(s.id) ? cleProfilRef(profil.tranche, profil.sexe) : '*';
    const e = c[s.id] || {};
    const p = { ...(e.p || {}) };
    const v = { ref: s.ref, lo: _refNombre(s.lo, 0), hi: _refNombre(s.hi, 999) };
    if (_refEgal(v, _refDefaut(s.p, profil))) delete p[cle]; else p[cle] = v;
    if (s.unit === String(s.p.unit || '').trim()) delete e.unit; else e.unit = s.unit;
    if (Object.keys(p).length) e.p = p; else delete e.p;
    if (e.p || e.unit !== undefined) c[s.id] = e; else delete c[s.id];
  });
  return c;
}

// Anciennes valeurs « sans âge ni sexe » de paramètres qui varient : plus
// appliquées, montrées dans l'éditeur pour être ressaisies sur le bon profil.
const LABO_REFS_ANCIENNES_KEY = 'labosaisie_refs_v1_anciennes' + LABO_SUFFIXE_SITE;
function _refsAnciennes() {
  const out = {};
  const prendre = o => Object.keys(o || {}).forEach(id => {
    if (refVarieSelonProfil(id) && refPersoAncienne(o[id])) out[id] = o[id];
  });
  try { prendre(JSON.parse(localStorage.getItem(LABO_REFS_ANCIENNES_KEY) || '{}')); } catch (e) {}
  try { const b = JSON.parse(localStorage.getItem(LABO_REFS_AVANT_BASE_KEY) || 'null'); prendre(b && b.refs); } catch (e) {}
  prendre(getCustomRefs());
  return out;
}
function _memoriserRefsAnciennes() {
  try { localStorage.setItem(LABO_REFS_ANCIENNES_KEY, JSON.stringify(_refsAnciennes())); } catch (e) {}
}
function oublierRefsAnciennes() {
  if (!confirm('Ne plus afficher ces anciennes valeurs ? Elles ne sont déjà plus appliquées.')) return;
  const sans = o => { const c = {}; Object.keys(o || {}).forEach(id => {
    if (!(refVarieSelonProfil(id) && refPersoAncienne(o[id]))) c[id] = o[id]; }); return c; };
  try {
    localStorage.setItem(LABO_REFS_ANCIENNES_KEY, '{}');
    const b = JSON.parse(localStorage.getItem(LABO_REFS_AVANT_BASE_KEY) || 'null');
    if (b && b.refs) localStorage.setItem(LABO_REFS_AVANT_BASE_KEY, JSON.stringify({ ...b, refs: sans(b.refs) }));
  } catch (e) {}
  // Sur ce poste seulement : elles n'étaient plus appliquées ni envoyées.
  try { saveCustomRefs(sans(getCustomRefs())); } catch (e) {}
  buildRefsEditor();
}

// Saisie en cours dans l'éditeur (valeur différente de celle affichée au départ) ?
function _refsSaisieEnCours() {
  return [...document.querySelectorAll('#refs-editor-grid input[data-init]')]
    .some(i => i.value !== i.getAttribute('data-init'));
}
function choisirProfilRefs() {
  const t = document.getElementById('refs-profil-tranche'), s = document.getElementById('refs-profil-sexe');
  const voulu = { tranche: t ? t.value : _refsProfil.tranche, sexe: s ? s.value : _refsProfil.sexe };
  if (!TRANCHES_REFS.includes(voulu.tranche) || !['M', 'F'].includes(voulu.sexe)) return;
  if (_refsSaisieEnCours() && !confirm('Des modifications de ce profil ne sont pas enregistrées. Changer de profil et les abandonner ?')) {
    if (t) t.value = _refsProfil.tranche;
    if (s) s.value = _refsProfil.sexe;
    return;
  }
  _refsProfil = voulu;
  buildRefsEditor();
}

function buildRefsEditor() {
  const card = document.getElementById('ac-refs');  // ✅ v13.33 — le sous-onglet remplace l'ancienne carte cachée
  if (!card) return;
  // ✅ v13.245 — Le responsable règle aussi les valeurs de référence
  //   (save_refs_config l'autorise) : sans cela, le sous-onglet restait vide.
  const peutConfigurer = isAdmin() || isResponsable();
  card.style.display = peutConfigurer ? '' : 'none';
  if (!peutConfigurer) return;

  const custom = getCustomRefs();
  const profil = _refsProfil;
  const cleVue = cleProfilRef(profil.tranche, profil.sexe);
  const SECTIONS = refsSections();
  const val = x => (x == null ? '' : String(x));
  const cell = 'padding:5px 8px;border-bottom:1px solid var(--border)';
  const champ = (type, id, v, largeur, extra) =>
    `<input type="${type}" id="${id}" value="${esc(val(v))}" data-init="${esc(val(v))}" ${extra || ''}
      style="width:${largeur}px;font-size:12px;text-align:center">`;

  function rowHTML(p) {
    const varie = refVarieSelonProfil(p.id);
    const cle = varie ? cleVue : '*';
    const e = refPersoNormalisee(p.id, custom[p.id]) || {};
    const perso = e.p && e.p[cle];
    const def = _refDefaut(p, profil);
    const cur = perso ? { ref: perso.ref, lo: perso.lo, hi: perso.hi } : def;
    const unitPerso = e.unit !== undefined && String(e.unit).trim() !== String(p.unit || '').trim();
    const curUnit = e.unit !== undefined ? e.unit : p.unit;
    const mod = !!perso || unitPerso;
    const autres = varie ? Object.keys(e.p || {}).filter(k => k !== cle) : [];
    return `<tr style="${mod ? 'background:#fffbeb' : ''}">
      <td style="padding:5px 10px;border-bottom:1px solid var(--border);font-size:12.5px">
        ${p.name}${mod ? ' <span style="color:var(--warning);font-size:10px;font-weight:700">✎</span>' : ''}
        ${varie ? '' : '<span style="font-size:10.5px;color:var(--text-muted)"> · tous profils</span>'}
        ${autres.length ? `<div style="font-size:10.5px;color:var(--text-muted)" title="${esc(autres.map(_libelleProfilRefs).join(' ; '))}">✎ aussi réglé pour ${autres.length} autre(s) profil(s)</div>` : ''}
        ${mod ? `<div style="font-size:10.5px;color:var(--text-muted)">Référentiel : ${esc(val(def.ref))}</div>` : ''}
      </td>
      <td style="${cell}">${champ('text', 'runit_' + p.id, curUnit, 90, 'placeholder="ex: g/dL"')}</td>
      <td style="${cell}">${champ('text', 'rref_' + p.id, cur.ref, 110, 'placeholder="ex: 12–17"')}</td>
      <td style="${cell}">${champ('number', 'rlo_' + p.id, cur.lo, 80, 'step="any"')}</td>
      <td style="${cell}">${champ('number', 'rhi_' + p.id, cur.hi, 80, 'step="any"')}</td>
      <td style="${cell}">
        ${mod ? `<button onclick="resetOneRef('${p.id}')" class="btn btn-outline"
          style="padding:2px 7px;font-size:11px" title="Remettre le référentiel pour ce profil">↺</button>` : ''}
      </td>
    </tr>`;
  }

  // Choix du profil édité.
  let html = `
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 12px;margin-bottom:14px;
                background:var(--accent-light);border:1px solid var(--border);border-radius:var(--radius)">
      <strong style="font-size:12.5px">Profil modifié :</strong>
      <select id="refs-profil-tranche" onchange="choisirProfilRefs()" style="font-size:12.5px;padding:4px 8px">
        ${TRANCHES_REFS.map(t => `<option value="${t}"${t === profil.tranche ? ' selected' : ''}>${_LIBELLES_TRANCHES[t]}</option>`).join('')}
      </select>
      <select id="refs-profil-sexe" onchange="choisirProfilRefs()" style="font-size:12.5px;padding:4px 8px">
        <option value="F"${profil.sexe === 'F' ? ' selected' : ''}>Femme</option>
        <option value="M"${profil.sexe === 'M' ? ' selected' : ''}>Homme</option>
      </select>
      <span style="font-size:11.5px;color:var(--text-muted);flex-basis:100%">
        Les valeurs affichées et enregistrées sont celles de ce profil ; les autres profils gardent les leurs.
        Les lignes « tous profils » valent pour tous les âges et les deux sexes.
      </span>
    </div>`;

  // Anciennes valeurs sans âge ni sexe (plus appliquées).
  const anciennes = _refsAnciennes();
  const idsAnciens = Object.keys(anciennes);
  if (idsAnciens.length) {
    const params = _refsParamsParId();
    html += `
    <div style="padding:10px 12px;margin-bottom:14px;background:#fff7ed;border:1px solid #fdba74;border-radius:var(--radius);font-size:12.5px">
      <strong>Anciennes valeurs de ce poste, saisies sans âge ni sexe : elles ne sont plus appliquées.</strong>
      <div style="color:var(--text-muted);margin:3px 0 6px">Elles remplaçaient les valeurs de tous les âges et des deux sexes.
        Si l'une d'elles est juste, ressaisissez-la sur le bon profil.</div>
      <ul style="margin:0 0 8px 18px;padding:0">
        ${idsAnciens.map(id => { const a = anciennes[id] || {}; const nom = params[id] ? params[id].name : id;
          return `<li>${nom} : ${esc(val(a.ref))}${a.unit ? ' ' + esc(val(a.unit)) : ''}
            <span style="color:var(--text-muted)">(bornes ${esc(val(a.lo))} – ${esc(val(a.hi))})</span></li>`; }).join('')}
      </ul>
      <button class="btn btn-outline" onclick="oublierRefsAnciennes()" style="padding:3px 10px;font-size:11.5px">Ne plus afficher</button>
    </div>`;
  }

  SECTIONS.forEach(sec => {
    html += `
    <div style="margin-bottom:22px">
      <div style="display:flex;align-items:center;justify-content:space-between;
                  padding:7px 12px;background:var(--accent-light);border-radius:var(--radius);margin-bottom:6px">
        <span style="font-size:11px;font-weight:800;color:var(--cpmi-deep);text-transform:uppercase;letter-spacing:.5px">${sec.label}</span>
        <button onclick="resetSectionRefs('${sec.id}')" class="btn btn-outline"
          style="padding:2px 8px;font-size:10.5px">↺ Section</button>
      </div>
      ${sec.note ? `<p style="font-size:11.5px;color:var(--text-muted);margin:0 0 6px 4px;font-style:italic">${sec.note}</p>` : ''}
      <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:var(--bg)">
          <th style="padding:6px 10px;text-align:left;border-bottom:2px solid var(--border);min-width:200px">Paramètre</th>
          <th style="padding:6px 10px;text-align:center;border-bottom:2px solid var(--border);min-width:95px">Unité</th>
          <th style="padding:6px 10px;text-align:center;border-bottom:2px solid var(--border);min-width:120px">Affichage (texte)</th>
          <th style="padding:6px 10px;text-align:center;border-bottom:2px solid var(--border);min-width:90px">Borne basse</th>
          <th style="padding:6px 10px;text-align:center;border-bottom:2px solid var(--border);min-width:90px">Borne haute</th>
          <th style="padding:6px 10px;border-bottom:2px solid var(--border);min-width:55px"></th>
        </tr></thead>
        <tbody>
          ${sec.params.map(rowHTML).join('')}
        </tbody>
      </table>
      </div>
    </div>`;
  });

  document.getElementById('refs-editor-grid').innerHTML = html;
}

// Paramètres d'une section (ou de toutes), tels que l'éditeur les affiche.
// ✅ v13.257 — Dérivés de refsSections() : l'ancienne liste figée oubliait les
//   sections Fer & hémostase, cardiaque, hormones et autres (42 paramètres
//   affichés mais jamais enregistrés).
function _refsIdsSection(sectionId) {
  const ids = [];
  refsSections().forEach(sec => { if (!sectionId || sec.id === sectionId) sec.params.forEach(p => ids.push(p.id)); });
  return ids;
}

function saveRefsConfig() { return _uneSeuleFois('saveRefsConfig', _saveRefsConfig); }
async function _saveRefsConfig() {
  const params = _refsParamsParId();
  const profil = { ..._refsProfil };
  const saisies = [];
  _refsIdsSection().forEach(id => {
    const refEl = document.getElementById('rref_' + id);
    if (!refEl || !params[id]) return;            // section non rendue
    saisies.push({ id, p: params[id], ref: refEl.value.trim(),
      lo: document.getElementById('rlo_' + id)?.value, hi: document.getElementById('rhi_' + id)?.value,
      unit: (document.getElementById('runit_' + id)?.value || '').trim() });
  });
  _memoriserRefsAnciennes();
  // ✅ v13.246/248/249 — Même mécanique que les tarifs. L'éditeur est redessiné
  //   UNE fois, tout de suite (marqueurs ✎ à jour), puis plus jamais pendant
  //   cet enregistrement : sur refus, la mémoire revient aux valeurs en
  //   vigueur (les comptes rendus les utilisent) mais ce qui est affiché et
  //   tapé dans l'éditeur reste, pour réessayer sans rien perdre.
  //   Calculé à son tour dans la file : une remise à zéro en cours n'est pas écrasée.
  await _enregistrerRefs(() => _refsAvecSaisies(getCustomRefs(), saisies, profil), {
    ok: '✓ Valeurs de référence (' + _libelleProfilRefs(cleProfilRef(profil.tranche, profil.sexe)) + ') synchronisées sur tous les postes du labo',
    refus: 'Valeurs de référence non enregistrées',
    local: 'Valeurs enregistrées sur ce poste seulement',
  });
}

// ✅ v13.249 — TOUTE écriture des valeurs de référence (enregistrement ET
//   remises à zéro) passe par la file commune et par le serveur. Avant, les
//   remises à zéro ne touchaient que ce poste : les autres gardaient les
//   anciennes valeurs, et la connexion suivante les rétablissait ici aussi.
//   Renvoie 'ok' | 'local' | 'refus'.
const LABO_REFS_SYNC_KEY = 'labosaisie_refs_v1_serveur' + LABO_SUFFIXE_SITE;

// ✅ v13.256 — La base est LA référence des valeurs de référence. À la connexion :
//   • base remplie, ou poste déjà aligné sur elle → le poste prend la base ;
//   • base jamais remplie et poste avec de vraies modifications à lui →
//     l'administrateur (ou le responsable) voit la liste et confirme : elles
//     sont enregistrées sur la base, une seule fois, pour tous les postes ;
//   • base déjà choisie par quelqu'un (même vide, « tout par défaut ») → le
//     poste s'aligne sur elle ;
//   • compte sans ce droit → le poste garde ses valeurs, et l'administrateur
//     en est averti dans le journal des anomalies (une fois par poste).
//   Des valeurs propres au poste, remplacées par la base, sont gardées de côté
//   (LABO_REFS_AVANT_BASE_KEY) : rien n'est perdu.
const LABO_REFS_AVANT_BASE_KEY = 'labosaisie_refs_v1_avant_base' + LABO_SUFFIXE_SITE;
const LABO_REFS_SIGNALE_KEY = 'labosaisie_refs_v1_signale' + LABO_SUFFIXE_SITE;
function _refsLocales() {
  try {
    const o = JSON.parse(localStorage.getItem(LABO_REFS_KEY) || '{}');
    return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
  } catch (e) { return {}; }
}
function _refsAlignees() {
  try { return localStorage.getItem(LABO_REFS_SYNC_KEY) === '1'; } catch (e) { return false; }
}
function _estRefsObjet(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function _appliquerRefsBase(refs) {
  const loc = _refsLocales();
  try {
    if (!_refsAlignees() && Object.keys(loc).length && JSON.stringify(loc) !== JSON.stringify(refs)
        && !localStorage.getItem(LABO_REFS_AVANT_BASE_KEY))
      localStorage.setItem(LABO_REFS_AVANT_BASE_KEY, JSON.stringify({ le: new Date().toISOString(), refs: loc }));
  } catch (e) {}
  _customRefsCache = refs;
  try {
    localStorage.setItem(LABO_REFS_KEY, JSON.stringify(refs));
    localStorage.setItem(LABO_REFS_SYNC_KEY, '1');
  } catch (e) {}
}
// Vraies modifications du poste, au format par profil (v13.257) : chaque
// valeur réglée qui diffère du référentiel de SON profil, et les unités
// changées. L'ancien format sans âge ni sexe n'est pas repris pour un
// paramètre qui varie selon l'âge ou le sexe : il n'est plus appliqué.
function _refsModifiees(loc) {
  const params = _refsParamsParId();
  const out = [];
  Object.keys(loc || {}).forEach(id => {
    const e = refPersoNormalisee(id, loc[id]);
    if (!e) return;
    const p = params[id];
    const garde = {}, lignes = [];
    Object.keys(e.p || {}).forEach(cle => {
      const v = e.p[cle];
      if (p && _refEgal(v, _refDefaut(p, _profilDeCle(cle)))) return;
      (garde.p = garde.p || {})[cle] = v;
      lignes.push({ cle, v });
    });
    if (e.unit !== undefined && (!p || String(e.unit).trim() !== String(p.unit || '').trim())) garde.unit = e.unit;
    if (!garde.p && garde.unit === undefined) return;
    const nom = String((p && p.name) || id).replace(/<[^>]*>/g, '').trim();
    out.push({ id, nom, e: garde, lignes, unit: (p && p.unit) || '' });
  });
  return out;
}
function _texteRefsLocales(modifs) {
  const textes = [];
  modifs.forEach(m => {
    const unite = m.e.unit !== undefined ? m.e.unit : m.unit;
    m.lignes.forEach(l => textes.push('• ' + m.nom + (l.cle === '*' ? '' : ' (' + _libelleProfilRefs(l.cle) + ')')
      + ' : ' + (String(l.v.ref || '').trim() || ((l.v.lo ?? '') + '–' + (l.v.hi ?? ''))) + (unite ? ' ' + unite : '')));
    if (m.e.unit !== undefined) textes.push('• ' + m.nom + ' : unité « ' + m.e.unit + ' »');
  });
  return 'Valeurs de référence\n\n'
    + 'Ce poste utilise ' + textes.length + ' valeur(s) de référence modifiée(s) qui ne sont pas sur la base :\n'
    + textes.slice(0, 8).join('\n')
    + (textes.length > 8 ? '\n… et ' + (textes.length - 8) + ' autre(s)' : '')
    + '\n\nOK : les enregistrer sur la base — elles s\'appliqueront à tous les postes.'
    + '\nAnnuler : ne rien changer pour l\'instant (la question reviendra à la prochaine connexion).';
}
async function _realignerSurBase() {
  const { data, error } = await _sb.rpc('get_refs_config_v2', { p_token: TK() });
  if (!error && _estRefsObjet(data)) _appliquerRefsBase(data);
}
function _signalerRefsLocales(n) {
  let deja = false;
  try { deja = localStorage.getItem(LABO_REFS_SIGNALE_KEY) === '1'; } catch (e) {}
  if (deja || typeof signalerAnomalie !== 'function') return;
  signalerAnomalie('Valeurs de référence modifiées présentes seulement sur ce poste (' + n
    + ') : connectez-vous une fois sur ce poste avec un compte administrateur ou responsable '
    + 'pour les enregistrer pour tous les postes');
  try { localStorage.setItem(LABO_REFS_SIGNALE_KEY, '1'); } catch (e) {}
}
// ✅ v13.257 — get_refs_config_v2 renvoie tout, valeurs par profil comprises ;
//   get_refs_config (anciennes versions) ne renvoie plus que l'ancien format :
//   un poste pas encore mis à jour n'affiche jamais une référence vide.
async function _chargerRefsDepuisBase() {
  const { data: base, error } = await _sb.rpc('get_refs_config_v2', { p_token: TK() });
  if (error || !_estRefsObjet(base)) return;                 // pas de réponse : on garde le local
  const modifs = _refsModifiees(_refsLocales());
  if (Object.keys(base).length || _refsAlignees() || !modifs.length) { _appliquerRefsBase(base); return; }
  // Base vide, poste jamais aligné, avec de vraies modifications. Sonde (envoi
  // vide, sans effet) : la base a-t-elle déjà été choisie ? ce compte peut-il
  // l'alimenter (réponse « vide ») ?
  const { data: etat, error: e2 } = await _sb.rpc('init_refs_config', { p_token: TK(), p_refs: {} });
  if (e2) return;
  if (etat === 'deja_defini') return _realignerSurBase();
  if (etat === 'forbidden') return _signalerRefsLocales(modifs.length);
  if (etat !== 'vide' || !confirm(_texteRefsLocales(modifs))) return;
  const refs = {};
  modifs.forEach(m => { refs[m.id] = m.e; });
  const { data: rep, error: e3 } = await _sb.rpc('init_refs_config', { p_token: TK(), p_refs: refs });
  if (e3) return;
  if (rep === 'ok') {
    _appliquerRefsBase(refs);
    toast('Valeurs de référence enregistrées sur la base : elles valent maintenant pour tous les postes', 'ok');
  } else if (rep === 'deja_defini') await _realignerSurBase();
}

async function _enregistrerRefs(construire, msgs, { redessinerSurRefus = false } = {}) {
  if (!_currentUser?.id) {
    saveCustomRefs(construire());
    updateAllRefs(); buildRefsEditor();
    toast(msgs.local + ' (hors connexion)', '');
    return 'local';
  }
  const res = await _enregistrerConfig({
    cle: LABO_REFS_KEY, valeur: construire,
    lireCache: () => _customRefsCache, setCache: v => { _customRefsCache = v; },
    apresLocal: () => { updateAllRefs(); buildRefsEditor(); },
    rpc: 'save_refs_config', params: v => ({ p_token: TK(), p_refs: v }),
    libelles: { ok: msgs.ok, refus: msgs.refus,
                injoignable: msgs.local + ' (serveur injoignable)',
                horsLigne: msgs.local + ' (hors-ligne)' },
  });
  if (res === 'ok') { try { localStorage.setItem(LABO_REFS_SYNC_KEY, '1'); } catch (e) {} }
  if (res === 'refus') { updateAllRefs(); if (redessinerSurRefus) buildRefsEditor(); }
  return res;
}

// ✅ v13.257 — Remises à zéro : pour le profil affiché (les lignes « tous
//   profils » de la section valent pour tous). « Remettre défauts » : tout.
function _refsSansProfil(base, ids, profil) {
  const c = {};
  Object.keys(base || {}).forEach(id => { const e = refPersoNormalisee(id, base[id]); if (e) c[id] = e; });
  ids.forEach(id => {
    const e = c[id]; if (!e) return;
    const cle = refVarieSelonProfil(id) ? cleProfilRef(profil.tranche, profil.sexe) : '*';
    if (e.p) { delete e.p[cle]; if (!Object.keys(e.p).length) delete e.p; }
    delete e.unit;
    if (!e.p) delete c[id];
  });
  return c;
}

function resetSectionRefs(sectionId) {
  const profil = { ..._refsProfil };
  if (!confirm('Remettre les valeurs par défaut de cette section pour le profil « '
      + _libelleProfilRefs(cleProfilRef(profil.tranche, profil.sexe)) + ' » ?')) return;
  const ids = _refsIdsSection(sectionId);
  _memoriserRefsAnciennes();
  return _enregistrerRefs(() => _refsSansProfil(getCustomRefs(), ids, profil), {
    ok: 'Section réinitialisée sur tous les postes', refus: 'Réinitialisation non enregistrée',
    local: 'Section réinitialisée sur ce poste seulement',
  }, { redessinerSurRefus: true });
}

function resetRefsConfig() {
  if (!confirm('Remettre TOUTES les valeurs de référence et unités aux défauts du système, pour TOUS les profils ?')) return;
  _memoriserRefsAnciennes();
  return _enregistrerRefs(() => ({}), {
    ok: 'Toutes les valeurs de référence réinitialisées sur tous les postes', refus: 'Réinitialisation non enregistrée',
    local: 'Valeurs de référence réinitialisées sur ce poste seulement',
  }, { redessinerSurRefus: true });
}

function resetOneRef(id) {
  const profil = { ..._refsProfil };
  _memoriserRefsAnciennes();
  return _enregistrerRefs(() => _refsSansProfil(getCustomRefs(), [id], profil), {
    ok: 'Valeur réinitialisée sur tous les postes', refus: 'Réinitialisation non enregistrée',
    local: 'Valeur réinitialisée sur ce poste seulement',
  }, { redessinerSurRefus: true });
}

// ── Auto-logout après 4 h d'inactivité ──────────────────────────

