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
}

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
// ✅ v13.33 — Rôle Caissier : accès lecture à toutes les fiches + caisse complète, pas de saisie
function isCaissier() {
  return !!_currentUser && _currentUser.role === 'caissier';
}
// ✅ v13.37 — Rôle Spectateur : voit la caisse (comme le caissier) mais AUCUNE
// interaction (pas d'encaissement, pas de modification, rien).
function isSpectateur() {
  return !!_currentUser && _currentUser.role === 'spectateur';
}
// Lecture seule stricte (spectateur) : bloque toute action. Retourne true si bloqué.
function blockIfSpectateur() {
  if (isSpectateur()) { toast('👁 Compte spectateur — lecture seule, aucune action possible', 'err'); return true; }
  return false;
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
    try {
      const { data: remoteRefs } = await _sb.rpc('get_refs_config', { p_token: TK() });
      if (remoteRefs && Object.keys(remoteRefs).length > 0) {
        _customRefsCache = remoteRefs;
        localStorage.setItem(LABO_REFS_KEY, JSON.stringify(remoteRefs));
      }
    } catch(e) { /* RPC non disponible → utiliser localStorage */ }
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
  // ✅ v13.28 — heartbeat jeton (F9), 1re connexion (F8), permission notifications (F10)
  if (typeof startTokenRefresh === 'function') startTokenRefresh();
  if (typeof checkFirstLogin === 'function') checkFirstLogin();
  if (typeof requestNotifPermission === 'function') requestNotifPermission();
  // ✅ v13.37 — Surveillance des connexions/déconnexions pour l'admin :
  // badge initial + notification en direct toutes les 90 s tant que l'app est ouverte.
  if (isAdmin()) {
    setTimeout(() => checkNewConnexions(false), 1500);
    if (!_connPoll) _connPoll = setInterval(() => checkNewConnexions(true), 90000);
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
    const roleLabel = isAdmin() ? '👑 Admin' : isCaissier() ? '💰 Caissier' : isSpectateur() ? '👁 Spectateur' : '🔬 Agent';
    el.textContent = `${_currentUser.username} · ${roleLabel}`;
  }
  // ✅ v13.33 — btn-clear-history supprimé ; btn-masquees géré par updateMasqueesBtn()
  updateMasqueesBtn();
  const usersNavBtn = document.getElementById('btn-nav-users');
  if (usersNavBtn) usersNavBtn.style.display = isAdmin() ? '' : 'none';
  // ✅ v13.86 — Le cahier jaune est un document de caisse : visible pour
  // l'admin, le caissier et le spectateur, jamais pour un agent.
  const cahierNavBtn = document.getElementById('btn-nav-cahier');
  if (cahierNavBtn) cahierNavBtn.style.display =
    (isAdmin() || isCaissier() || isSpectateur()) ? '' : 'none';
  const cahierColBtn = document.getElementById('cahier-colonnes-card');
  if (cahierColBtn) cahierColBtn.style.display = isAdmin() ? '' : 'none';
  // ✅ v13.33 — tarifs-config-card et refs-config-card sont dans des sous-onglets,
  // leur visibilité est gérée par adminShowSub — rien à faire ici.
  if (isAdmin()) { buildAdminExamensGrid(); buildRefsEditor(); }

  // ✅ v13.33 — Caissier : masquer la nav "Nouvelle saisie" et afficher un message
  const saisieNavBtn = document.querySelector('header .nav-btn[data-view="saisie"]');
  if (saisieNavBtn) saisieNavBtn.style.display = (isCaissier() || isSpectateur()) ? 'none' : '';
  const exportAllBtn = document.querySelector('header .nav-btn[onclick="exportAllExcel()"]');
  if (exportAllBtn) exportAllBtn.style.display = (isCaissier() || isSpectateur()) ? 'none' : '';
  // Afficher directement la caisse pour le caissier / spectateur après connexion
  if (isCaissier() || isSpectateur()) setTimeout(() => showView('caisse'), 50);
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
  update_prescripteur:'Modif prescripteur', deactivate_prescripteur:'Désactivation prescripteur'
};
function auditDetails(action, d) {
  if (!d) return '';
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
  if (!isAdmin()) {
    b.innerHTML = `<tr><td colspan="4"><div class="empty-state">Accès réservé aux administrateurs</div></td></tr>`;
    return;
  }
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
    const roleLabel = u.role === 'admin' ? '👑 Administrateur' : u.role === 'caissier' ? '💰 Caissier' : u.role === 'spectateur' ? '👁 Spectateur' : '🔬 Agent';
    const isSelf = u.id === _currentUser.id;
    const isProtected = u.username === 'admin';
    return `
    <tr>
      <td data-label="Nom d'utilisateur"><strong>${u.username}</strong>${isSelf ? ' <span style="color:var(--text-muted);font-size:11px">(vous)</span>' : ''}${isProtected ? ' <span title="Compte protégé, ne peut pas être supprimé ni rétrogradé" style="color:var(--text-muted);font-size:11px">🔒</span>' : ''}</td>
      <td data-label="Rôle"><span class="badge-type">${roleLabel}</span></td>
      <td data-label="Créé le">${dateStr}</td>
      <td data-label="Actions">
        <button class="btn" style="padding:4px 10px;font-size:11px" onclick="editUserAccount(${u.id}, '${u.username.replace(/'/g, "\\'")}', '${u.role}')">✏ Modifier</button>
        <button class="btn" style="padding:4px 10px;font-size:11px;margin-left:4px;background:#eef7fb;color:#0b2545;border:1px solid #bfe0ef" onclick="ouvrirSignatureCompte('${u.username.replace(/'/g, "\\'")}')" title="Dessiner ou modifier la signature">✍️ Signature</button>
        ${(isSelf || isProtected) ? '' : `<button class="btn btn-danger" style="padding:4px 10px;font-size:11px;margin-left:4px" onclick="deleteUserAccount(${u.id}, '${u.username.replace(/'/g, "\\'")}')">🗑</button>`}
      </td>
    </tr>`;
  }).join('');
}

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

  const { data, error } = await _sb.rpc('create_user_admin', {
    p_token: TK(),
    p_new_username: username,
    p_new_password: password,
    p_new_role: role,
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
    errEl.textContent = 'Action réservée aux administrateurs.';
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
  ouvrirPadSignatureGenerique({
    titre: '✍️ Signature de ' + escHTML(username),
    sousTitre: 'Dessinez la signature de ' + escHTML(username) + '. Elle apparaîtra automatiquement sous les résultats du patient quand cette personne se connecte. (Vous pourrez la modifier plus tard.)',
    onSave: (dataURL) => enregistrerSignatureCompte(username, dataURL)
  });
}

function editUserAccount(id, username, currentRole) {
  // ✅ v13.7 — modale (remplace confirm + prompt, peu ergonomiques sur mobile)
  document.getElementById('um_id').value = id;
  document.getElementById('um_name').textContent = 'Compte : ' + username;
  document.getElementById('um_role').value = currentRole;
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
  if (data !== 'ok') { errEl.textContent = 'Erreur : ' + data; return; }
  closeUserModal();
  toast('Compte mis à jour ✓', 'ok');
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

function buildRefsEditor() {
  const card = document.getElementById('ac-refs');  // ✅ v13.33 — le sous-onglet remplace l'ancienne carte cachée
  if (!card) return;
  card.style.display = isAdmin() ? '' : 'none';
  if (!isAdmin()) return;

  const custom = getCustomRefs();

  // ── Définition exhaustive : 90 paramètres, toutes sections ──
  const SECTIONS = [
    {
      label: '🩸 Hématologie — NFS', id: 'nfs',
      params: [
        { id:'gbc',  name:'Globules blancs (GB)',         unit:'10³/µL', ref:'4–10',      lo:4,    hi:10   },
        { id:'gr',   name:'Globules rouges (GR)',         unit:'10⁶/µL', ref:'4.0–5.5',   lo:4.0,  hi:5.5  },
        { id:'hb',   name:'Hémoglobine (Hb)',             unit:'g/dL',   ref:'12–17',     lo:12,   hi:17   },
        { id:'ht',   name:'Hématocrite (Ht)',              unit:'%',      ref:'37–54',     lo:37,   hi:54   },
        { id:'vgm',  name:'VGM (calculé)',                unit:'fL',     ref:'80–100',    lo:80,   hi:100  },
        { id:'tcmh', name:'TCMH (calculé)',               unit:'pg',     ref:'27–32',     lo:27,   hi:32   },
        { id:'ccmh', name:'CCMH (calculé)',               unit:'g/dL',   ref:'32–36',     lo:32,   hi:36   },
        { id:'plt',  name:'Plaquettes',                   unit:'/µL', ref:'150–400',   lo:150,  hi:400  },
        { id:'ret',  name:'Réticulocytes',                unit:'%',      ref:'0.5–1.5',   lo:0.5,  hi:1.5  },
        { id:'vs',   name:'VS (1ère heure)',              unit:'mm/h',   ref:'< 20',      lo:0,    hi:20   },
      ]
    },
    {
      label: '🩸 Formule leucocytaire', id: 'fl',
      params: [
        { id:'pnn',  name:'PNN (Polynucléaires neutrophiles)', unit:'%', ref:'50–70', lo:50, hi:70 },
        { id:'pne',  name:'PNE (Éosinophiles)',               unit:'%', ref:'1–5',   lo:1,  hi:5  },
        { id:'pnb',  name:'PNB (Basophiles)',                 unit:'%', ref:'0–1',   lo:0,  hi:1  },
        { id:'lymp', name:'Lymphocytes',                      unit:'%', ref:'20–40', lo:20, hi:40 },
        { id:'mono', name:'Monocytes',                        unit:'%', ref:'2–10',  lo:2,  hi:10 },
      ]
    },
    {
      label: '🔬 Électrophorèse de l\'hémoglobine', id: 'ephb',
      params: [
        { id:'ephb_a',  name:'Hb A',  unit:'%', ref:'95–97',   lo:95,  hi:97  },
        { id:'ephb_a2', name:'Hb A2', unit:'%', ref:'1.5–3.5', lo:1.5, hi:3.5 },
        { id:'ephb_f',  name:'Hb F',  unit:'%', ref:'< 2',     lo:0,   hi:2   },
        { id:'ephb_s',  name:'Hb S',  unit:'%', ref:'0 (absent)', lo:0, hi:0  },
        { id:'ephb_c',  name:'Hb C',  unit:'%', ref:'0 (absent)', lo:0, hi:0  },
        { id:'ephb_d',  name:'Hb D',  unit:'%', ref:'0 (absent)', lo:0, hi:0  },
        { id:'ephb_e',  name:'Hb E',  unit:'%', ref:'0 (absent)', lo:0, hi:0  },
      ]
    },
    {
      label: '🔵 Sérodiagnostic de Widal — Seuils significatifs', id: 'widal',
      note: 'Le seuil est la valeur minimale de lo. Ex: lo=80 → 1/80 significatif.',
      params: [
        { id:'widal_to', name:'Salmonella typhi O (TO)',       unit:'dilution', ref:'1/80',  lo:80, hi:9999 },
        { id:'widal_th', name:'Salmonella typhi H (TH)',       unit:'dilution', ref:'1/80',  lo:80, hi:9999 },
        { id:'widal_ao', name:'Salmonella paratyphi A O (AO)', unit:'dilution', ref:'1/80',  lo:80, hi:9999 },
        { id:'widal_bo', name:'Salmonella paratyphi B O (BO)', unit:'dilution', ref:'1/80',  lo:80, hi:9999 },
      ]
    },
    {
      label: '🧪 Biochimie — Glucides', id: 'bio_glu',
      params: [
        { id:'gly', name:'Glycémie à jeun', unit:'g/L', ref:'0.60–1.10', lo:0.60, hi:1.10 },
        { id:'hba', name:'HbA1c',           unit:'%',   ref:'< 6.0',     lo:0,    hi:6.0  },
      ]
    },
    {
      label: '🧪 Biochimie — Fonction rénale', id: 'bio_rein',
      params: [
        { id:'crea', name:'Créatinine',                unit:'mg/L',          ref:'4–16',       lo:4,    hi:16   },
        { id:'uree', name:'Urée',                      unit:'g/L',           ref:'0.15–0.45',  lo:0.15, hi:0.45 },
        { id:'ua',   name:'Acide urique',              unit:'mg/L',          ref:'25–70',      lo:25,   hi:70   },
        { id:'malb', name:'Microalbuminurie',          unit:'mg/24h',        ref:'30–300',     lo:30,   hi:300  },
        { id:'dfg',  name:'Clairance créatinine (DFG)',unit:'mL/min/1.73m²',ref:'> 90',       lo:90,   hi:999  },
      ]
    },
    {
      label: '🧪 Biochimie — Fonction hépatique & Pancréas', id: 'bio_foie',
      params: [
        { id:'asat',  name:'ASAT (TGO)',               unit:'UI/L', ref:'< 40',    lo:0,   hi:40  },
        { id:'alat',  name:'ALAT (TGP)',               unit:'UI/L', ref:'< 40',    lo:0,   hi:40  },
        { id:'ggt',   name:'Gamma GT',                 unit:'UI/L', ref:'< 55',    lo:0,   hi:55  },
        { id:'pal',   name:'Phosphatases alcalines',   unit:'UI/L', ref:'44–147',  lo:44,  hi:147 },
        { id:'bili',  name:'Bilirubine totale',        unit:'mg/L', ref:'< 10',    lo:0,   hi:10  },
        { id:'bilid', name:'Bilirubine directe',       unit:'mg/L', ref:'< 3',     lo:0,   hi:3   },
        { id:'prot',  name:'Protéines totales',        unit:'g/L',  ref:'60–80',   lo:60,  hi:80  },
        { id:'alb',   name:'Albumine',                 unit:'g/L',  ref:'35–50',   lo:35,  hi:50  },
        { id:'ldh',   name:'LDH',                      unit:'UI/L', ref:'100–200', lo:100, hi:200 },
        { id:'amy',   name:'Amylase',                  unit:'UI/L', ref:'10–90',   lo:10,  hi:90  },
        { id:'lip',   name:'Lipase',                   unit:'UI/L', ref:'< 60',    lo:0,   hi:60  },
      ]
    },
    {
      label: '🧪 Biochimie — Lipides', id: 'bio_lip',
      params: [
        { id:'chol', name:'Cholestérol total',   unit:'g/L',   ref:'< 2.0',   lo:0,    hi:2.0  },
        { id:'trig', name:'Triglycérides',       unit:'g/L',   ref:'< 1.7',   lo:0,    hi:1.7  },
        { id:'hdl',  name:'HDL-cholestérol',     unit:'g/L',   ref:'> 0.50',  lo:0.50, hi:99   },
        { id:'ldl',  name:'LDL-cholestérol',     unit:'g/L',   ref:'< 1.30',  lo:0,    hi:1.30 },
        { id:'apoa', name:'Apolipoprotéine A1',  unit:'g/L',   ref:'1.1–2.1', lo:1.1,  hi:2.1  },
        { id:'apob', name:'Apolipoprotéine B',   unit:'g/L',   ref:'0.5–1.3', lo:0.5,  hi:1.3  },
        { id:'lpa',  name:'Lipoprotéine (a)',    unit:'mg/dL', ref:'< 30',    lo:0,    hi:30   },
      ]
    },
    {
      label: '🧪 Biochimie — Ionogramme & Minéraux', id: 'bio_iono',
      params: [
        { id:'na',   name:'Sodium (Na⁺)',          unit:'mmol/L', ref:'135–145',  lo:135,  hi:145  },
        { id:'k',    name:'Potassium (K⁺)',         unit:'mmol/L', ref:'3.5–5.0',  lo:3.5,  hi:5.0  },
        { id:'cl',   name:'Chlore (Cl⁻)',           unit:'mmol/L', ref:'98–107',   lo:98,   hi:107  },
        { id:'ca',   name:'Calcium (Ca²⁺)',         unit:'mg/L',   ref:'88–104',   lo:88,   hi:104  },
        { id:'phos', name:'Phosphore',              unit:'mg/L',   ref:'25–45',    lo:25,   hi:45   },
        { id:'mg',   name:'Magnésium (Mg²⁺)',       unit:'mg/L',   ref:'17–24',    lo:17,   hi:24   },
        { id:'bic',  name:'Bicarbonates (HCO₃⁻)',  unit:'mmol/L', ref:'22–28',    lo:22,   hi:28   },
        { id:'zinc', name:'Zinc',                   unit:'µmol/L', ref:'11–22',    lo:11,   hi:22   },
        { id:'cuiv', name:'Cuivre',                 unit:'µmol/L', ref:'11–22',    lo:11,   hi:22   },
      ]
    },
    {
      label: '🧪 Biochimie — Fer & Hémostase', id: 'bio_fer',
      params: [
        { id:'fer',  name:'Fer sérique',    unit:'µmol/L', ref:'10–30',  lo:10,  hi:30  },
        { id:'ferr', name:'Ferritine',      unit:'µg/L',   ref:'20–300', lo:20,  hi:300 },
        { id:'ddim', name:'D-Dimères',      unit:'µg/L',   ref:'< 500',  lo:0,   hi:500 },
        { id:'tp',   name:'TP / INR',       unit:'%',      ref:'70–100', lo:70,  hi:100 },
        { id:'tca',  name:'TCA',            unit:'s',      ref:'28–38',  lo:28,  hi:38  },
        { id:'fibr', name:'Fibrinogène',    unit:'g/L',    ref:'2.0–4.0',lo:2.0, hi:4.0 },
      ]
    },
    {
      label: '❤️ Marqueurs cardiaques', id: 'bio_card',
      params: [
        { id:'trop', name:'Troponine I/T',      unit:'ng/L',  ref:'< 14',   lo:0,  hi:14  },
        { id:'bnp',  name:'BNP / NT-proBNP',   unit:'pg/mL', ref:'< 125',  lo:0,  hi:125 },
        { id:'ck',   name:'CK',                 unit:'UI/L',  ref:'< 170',  lo:0,  hi:170 },
        { id:'ckmb', name:'CK-MB',              unit:'UI/L',  ref:'< 25',   lo:0,  hi:25  },
        { id:'myog', name:'Myoglobine',         unit:'µg/L',  ref:'< 90',   lo:0,  hi:90  },
      ]
    },
    {
      label: '🧬 Hormones & Vitamines', id: 'bio_horm',
      params: [
        { id:'cort', name:'Cortisol (8h)',       unit:'nmol/L', ref:'170–550', lo:170, hi:550 },
        { id:'acth', name:'ACTH',                unit:'pg/mL',  ref:'10–60',   lo:10,  hi:60  },
        { id:'lh',   name:'LH',                  unit:'UI/L',   ref:'',        lo:0,   hi:999 },
        { id:'fsh',  name:'FSH',                 unit:'UI/L',   ref:'',        lo:0,   hi:999 },
        { id:'e2',   name:'Estradiol (E2)',       unit:'ng/mL',  ref:'3–15',    lo:3,   hi:15  },
        { id:'prog', name:'Progestérone',         unit:'ng/mL',  ref:'',        lo:0,   hi:999 },
        { id:'test', name:'Testostérone',         unit:'ng/mL',  ref:'',        lo:0,   hi:999 },
        { id:'prl',  name:'Prolactine',           unit:'mUI/L',  ref:'< 500',   lo:0,   hi:500 },
        { id:'amh',  name:'AMH',                  unit:'ng/mL',  ref:'1–7',     lo:1,   hi:7   },
        { id:'vitd', name:'Vitamine D (25-OH)',   unit:'ng/mL',  ref:'30–100',  lo:30,  hi:100 },
        { id:'b12',  name:'Vitamine B12',         unit:'pg/mL',  ref:'200–950', lo:200, hi:950 },
        { id:'fol',  name:'Folates (B9)',         unit:'ng/mL',  ref:'5–20',    lo:5,   hi:20  },
        { id:'pth',  name:'PTH (parathormone)',   unit:'ng/L',   ref:'15–65',   lo:15,  hi:65  },
      ]
    },
    {
      label: '🔬 Autres marqueurs', id: 'bio_autre',
      params: [
        { id:'pct',  name:'Procalcitonine (PCT)',    unit:'µg/L',   ref:'< 0.1',   lo:0,   hi:0.1 },
        { id:'hcrp', name:'CRP ultra-sensible',      unit:'mg/L',   ref:'< 1.0',   lo:0,   hi:1.0 },
        { id:'osm',  name:'Osmolarité',              unit:'mOsm/L', ref:'275–295', lo:275, hi:295 },
        { id:'hcy',  name:'Homocystéine',            unit:'µmol/L', ref:'5–15',    lo:5,   hi:15  },
        { id:'amm',  name:'Ammoniaque',              unit:'µmol/L', ref:'10–50',   lo:10,  hi:50  },
        { id:'lact', name:'Acide lactique',          unit:'mmol/L', ref:'0.5–1.8', lo:0.5, hi:1.8 },
        { id:'bhcg', name:'Beta-HCG',               unit:'UI/L',   ref:'< 5',     lo:0,   hi:5   },
      ]
    },
    {
      label: '🧫 Sérologie — Tests quantitatifs (valeurs normales)', id: 'sero',
      note: 'Les tests qualitatifs (Positif/Négatif) n\'ont pas de plage numérique.',
      params: [
        { id:'sero_hbsac', name:'Ac anti-HBs',                 unit:'UI/L',   ref:'> 10 (protecteur)', lo:10,   hi:9999 },
        { id:'sero_toxo',  name:'Toxoplasmose IgG',            unit:'UI/mL',  ref:'> 8 (immunisé)',    lo:8,    hi:9999 },
        { id:'sero_rubig', name:'Rubéole IgG',                 unit:'UI/mL',  ref:'> 10 (immunisé)',   lo:10,   hi:9999 },
        { id:'sero_crp',   name:'CRP (Protéine C-réactive)',   unit:'mg/L',   ref:'< 6',              lo:0,    hi:6    },
        { id:'sero_aso',   name:'ASLO (Antistreptolysines)',   unit:'UI/mL',  ref:'< 200',            lo:0,    hi:200  },
        { id:'sero_tsh',   name:'TSH',                         unit:'mUI/L',  ref:'0.4–4.0',          lo:0.4,  hi:4.0  },
        { id:'sero_ft4',   name:'T4 libre (FT4)',              unit:'pmol/L', ref:'12–22',            lo:12,   hi:22   },
        { id:'sero_psa',   name:'PSA total',                   unit:'ng/mL',  ref:'< 4.0',            lo:0,    hi:4.0  },
      ]
    },
    {
      label: '🤰 Bilan prénatal — NFS', id: 'bpn_nfs',
      params: [
        { id:'bpn_gb',   name:'Globules blancs (GB)',  unit:'/µL', ref:'6–16',     lo:6,    hi:16   },
        { id:'bpn_gr',   name:'Globules rouges (GR)',  unit:'10⁶/µL', ref:'3.5–5.0',  lo:3.5,  hi:5.0  },
        { id:'bpn_hb',   name:'Hémoglobine (Hb)',      unit:'g/dL',   ref:'≥ 11.0',   lo:11.0, hi:16.0 },
        { id:'bpn_ht',   name:'Hématocrite (Ht)',       unit:'%',      ref:'≥ 33',     lo:33,   hi:47   },
        { id:'bpn_vgm',  name:'VGM (calculé)',          unit:'fL',     ref:'80–100',   lo:80,   hi:100  },
        { id:'bpn_tcmh', name:'TCMH (calculé)',         unit:'pg',     ref:'27–32',    lo:27,   hi:32   },
        { id:'bpn_ccmh', name:'CCMH (calculé)',         unit:'g/dL',   ref:'32–36',    lo:32,   hi:36   },
        { id:'bpn_plt',  name:'Plaquettes',             unit:'/µL', ref:'150–400',  lo:150,  hi:400  },
      ]
    },
    {
      label: '🤰 Bilan prénatal — Formule leucocytaire', id: 'bpn_fl',
      params: [
        { id:'bpn_pnn',  name:'PNN', unit:'%', ref:'50–70', lo:50, hi:70 },
        { id:'bpn_pne',  name:'PNE', unit:'%', ref:'1–5',   lo:1,  hi:5  },
        { id:'bpn_pnb',  name:'PNB', unit:'%', ref:'0–1',   lo:0,  hi:1  },
        { id:'bpn_lymp', name:'Lymphocytes', unit:'%', ref:'20–40', lo:20, hi:40 },
        { id:'bpn_mono', name:'Monocytes',   unit:'%', ref:'2–10',  lo:2,  hi:10 },
      ]
    },
    {
      label: '🤰 Bilan prénatal — Biochimie', id: 'bpn_bio',
      params: [
        { id:'bpn_gly',  name:'Glycémie',   unit:'g/L',    ref:'0.70–0.92', lo:0.70, hi:0.92 },
        { id:'bpn_crea', name:'Créatinine', unit:'µmol/L', ref:'35–90',     lo:35,   hi:90   },
        { id:'bpn_uree', name:'Urée',       unit:'mmol/L', ref:'2.0–6.5',   lo:2.0,  hi:6.5  },
      ]
    },
    {
      label: '🤰 Bilan prénatal — Sérologies', id: 'bpn_sero',
      note: 'Les tests qualitatifs sont affichés pour information. Seuls les quantitatifs ont des seuils.',
      params: [
        { id:'bpnsero_hbsac', name:'Ac anti-HBs (protection)', unit:'UI/L',  ref:'> 10 UI/L', lo:10,  hi:9999 },
        { id:'bpnsero_toxog', name:'Toxoplasmose IgG',          unit:'UI/mL', ref:'> 8',       lo:8,   hi:9999 },
        { id:'bpnsero_rubg',  name:'Rubéole IgG',               unit:'UI/mL', ref:'> 10',      lo:10,  hi:9999 },
      ]
    },
  ];

  function rowHTML(p, custom) {
    const cur    = custom[p.id] || {};
    const curRef = cur.ref  !== undefined ? cur.ref  : p.ref;
    const curLo  = cur.lo   !== undefined ? cur.lo   : p.lo;
    const curHi  = cur.hi   !== undefined ? cur.hi   : p.hi;
    const curUnit= cur.unit !== undefined ? cur.unit : p.unit;
    const mod    = !!custom[p.id];
    return `<tr style="${mod ? 'background:#fffbeb' : ''}">
      <td style="padding:5px 10px;border-bottom:1px solid var(--border);font-size:12.5px">
        ${p.name}${mod ? ' <span style="color:var(--warning);font-size:10px;font-weight:700">✎</span>' : ''}
      </td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--border)">
        <input type="text" id="runit_${p.id}" value="${curUnit}"
          style="width:90px;font-size:12px;text-align:center" placeholder="ex: g/dL">
      </td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--border)">
        <input type="text" id="rref_${p.id}" value="${curRef}"
          style="width:110px;font-size:12px;text-align:center" placeholder="ex: 12–17">
      </td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--border)">
        <input type="number" id="rlo_${p.id}" value="${curLo}" step="any"
          style="width:80px;font-size:12px;text-align:center">
      </td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--border)">
        <input type="number" id="rhi_${p.id}" value="${curHi}" step="any"
          style="width:80px;font-size:12px;text-align:center">
      </td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--border)">
        ${mod ? `<button onclick="resetOneRef('${p.id}')" class="btn btn-outline"
          style="padding:2px 7px;font-size:11px" title="Remettre défaut">↺</button>` : ''}
      </td>
    </tr>`;
  }

  let html = '';
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
          ${sec.params.map(p => rowHTML(p, custom)).join('')}
        </tbody>
      </table>
      </div>
    </div>`;
  });

  document.getElementById('refs-editor-grid').innerHTML = html;
}

// IDs de tous les paramètres éditables (90)
const _ALL_REF_IDS = [
  'gbc','gr','hb','ht','vgm','tcmh','ccmh','plt','ret','vs',
  'pnn','pne','pnb','lymp','mono',
  'ephb_a','ephb_a2','ephb_f','ephb_s','ephb_c','ephb_d','ephb_e',
  'widal_to','widal_th','widal_ao','widal_bo',
  'gly','hba','crea','uree','ua',
  'asat','alat','ggt','pal','bili','bilid','prot','alb',
  'chol','trig','hdl','ldl',
  'na','k','cl','ca','phos','mg','bic',
  'sero_hbsac','sero_toxo','sero_rubig','sero_crp','sero_aso','sero_tsh','sero_ft4','sero_psa',
  'bpn_gb','bpn_gr','bpn_hb','bpn_ht','bpn_vgm','bpn_tcmh','bpn_ccmh','bpn_plt',
  'bpn_pnn','bpn_pne','bpn_pnb','bpn_lymp','bpn_mono',
  'bpn_gly','bpn_crea','bpn_uree',
  'bpnsero_hbsac','bpnsero_toxog','bpnsero_rubg',
];

// Mapping section id → liste des param ids
const _SECTION_PARAMS = {
  nfs:     ['gbc','gr','hb','ht','vgm','tcmh','ccmh','plt','ret','vs'],
  fl:      ['pnn','pne','pnb','lymp','mono'],
  ephb:    ['ephb_a','ephb_a2','ephb_f','ephb_s','ephb_c','ephb_d','ephb_e'],
  widal:   ['widal_to','widal_th','widal_ao','widal_bo'],
  bio_glu: ['gly','hba'],
  bio_rein:['crea','uree','ua'],
  bio_foie:['asat','alat','ggt','pal','bili','bilid','prot','alb'],
  bio_lip: ['chol','trig','hdl','ldl'],
  bio_iono:['na','k','cl','ca','phos','mg','bic'],
  sero:    ['sero_hbsac','sero_toxo','sero_rubig','sero_crp','sero_aso','sero_tsh','sero_ft4','sero_psa'],
  bpn_nfs: ['bpn_gb','bpn_gr','bpn_hb','bpn_ht','bpn_vgm','bpn_tcmh','bpn_ccmh','bpn_plt'],
  bpn_fl:  ['bpn_pnn','bpn_pne','bpn_pnb','bpn_lymp','bpn_mono'],
  bpn_bio: ['bpn_gly','bpn_crea','bpn_uree'],
  bpn_sero:['bpnsero_hbsac','bpnsero_toxog','bpnsero_rubg'],
};

function saveRefsConfig() {
  const custom = getCustomRefs();
  _ALL_REF_IDS.forEach(id => {
    const refEl  = document.getElementById('rref_'  + id);
    const loEl   = document.getElementById('rlo_'   + id);
    const hiEl   = document.getElementById('rhi_'   + id);
    const unitEl = document.getElementById('runit_' + id);
    if (!refEl) return; // section non rendue
    custom[id] = {
      ref:  refEl.value.trim(),
      lo:   parseFloat(loEl?.value)   || 0,
      hi:   parseFloat(hiEl?.value)   || 999,
      unit: unitEl?.value.trim()      || '',
    };
  });
  saveCustomRefs(custom);
  updateAllRefs();
  buildRefsEditor();
  // Persister en Supabase pour sync tous les postes
  if (_currentUser?.id) {
    _sb.rpc('save_refs_config', { p_token: TK(), p_refs: custom })
      .then(({ error }) => {
        if (!error) toast('✓ Valeurs de référence synchronisées sur tous les postes du labo', 'ok');
        else toast('✓ Valeurs enregistrées localement (sync Supabase indisponible)', 'ok');
      }).catch(() => toast('✓ Valeurs enregistrées localement', 'ok'));
  } else {
    toast('✓ Valeurs de référence enregistrées sur ce poste', 'ok');
  }
}

function resetSectionRefs(sectionId) {
  if (!confirm('Remettre les valeurs par défaut pour cette section ?')) return;
  const custom = getCustomRefs();
  (_SECTION_PARAMS[sectionId] || []).forEach(id => delete custom[id]);
  _customRefsCache = null;  // invalider le cache
  saveCustomRefs(custom);
  updateAllRefs();
  buildRefsEditor();
  toast('Section réinitialisée', 'ok');
}

function resetRefsConfig() {
  if (!confirm('Remettre TOUTES les valeurs de référence et unités aux défauts du système ?')) return;
  _customRefsCache = null;           // invalider le cache
  localStorage.removeItem(LABO_REFS_KEY);
  updateAllRefs();
  buildRefsEditor();
  toast('Toutes les valeurs de référence réinitialisées', 'ok');
}

function resetOneRef(id) {
  const custom = getCustomRefs();
  delete custom[id];
  _customRefsCache = null;  // invalider le cache
  saveCustomRefs(custom);
  updateAllRefs();
  buildRefsEditor();
  toast('Valeur réinitialisée', 'ok');
}

// ── Auto-logout après 4 h d'inactivité ──────────────────────────

