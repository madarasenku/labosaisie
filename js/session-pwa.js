/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — session-pwa.js
   Extrait de index.html (v13.70). Chargé en script classique, PAS en
   module ES : les gestionnaires inline du HTML (onclick="…") résolvent
   les fonctions dans la portée globale. L'ordre des balises <script>
   dans index.html doit être conservé.
   ═══════════════════════════════════════════════════════════════ */

const IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 heures
let _lastActivity = Date.now();
['click','keydown','mousemove','touchstart'].forEach(evt =>
  document.addEventListener(evt, () => { _lastActivity = Date.now(); }, { passive: true })
);
setInterval(() => {
  if (_currentUser && Date.now() - _lastActivity > IDLE_TIMEOUT_MS) {
    toast('Session expirée par inactivité — reconnexion requise', 'err');
    setTimeout(() => {
      clearSession();
      // ✅ v13.34+ — Redirection login.html
      window.location.replace('login.html?expired=1');
      // Fallback (ne devrait pas être atteint)
      document.getElementById('login-error' /* supprimé */ + '').textContent = 'Session expirée — veuillez vous reconnecter.';
    }, 2000);
  }
}, 60_000); // vérifier chaque minute


// ── Raccourcis clavier globaux ────────────────────────────────────────
document.addEventListener('keydown', e => {
  // Ctrl+S / Cmd+S — Sauvegarder l'analyse de l'onglet actif
  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    const saisieVisible = document.getElementById('view-saisie')?.style.display !== 'none';
    if (!saisieVisible) return;
    const activeTab = document.querySelector('.tab.active'); // ✅ v13.34 — bonne classe
    if (!activeTab) return;
    const tabId = (activeTab.id || '').replace('tab-', '');
    const TYPE_MAP = {
      hema:'Hématologie', bio:'Biochimie', bacterio:'Bactériologie',
      sero:'Immuno-Sérologie', parasito:'Parasitologie', gs:'Groupe sanguin', bpn:'Bilan prénatal',
    };
    const type = TYPE_MAP[tabId];
    if (type) saveRecord(type);
    return;
  }
  // Ctrl+N / Cmd+N — Nouveau patient
  if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
    const saisieVisible = document.getElementById('view-saisie')?.style.display !== 'none';
    if (saisieVisible && typeof newPatient === 'function') {
      e.preventDefault();
      newPatient();
    }
    return;
  }
  // Ctrl+P / Cmd+P — bloquer l'impression brute depuis la saisie
  if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
    const saisieVisible = document.getElementById('view-saisie')?.style.display !== 'none';
    if (saisieVisible) {
      e.preventDefault();
      toast("Enregistrez d'abord la fiche avant d'imprimer", 'ok');
    }
    return;
  }
  // Escape — Fermer tout modal ouvert
  if (e.key === 'Escape') {
    ['edit-type-modal'].forEach(id => document.getElementById(id)?.remove());
    ['add-examen-modal','presc-modal','user-modal','first-login-modal',
     'edit-patient-modal-bd','confirm-modal-backdrop'].forEach(id => {
      const m = document.getElementById(id);
      if (m && m.style.display !== 'none') m.style.display = 'none';
    });
  }
});

// ✅ v13.34 — Progressive Web App : installation + cache offline
(function setupPWA() {
  // Icône SVG (data URI) réutilisée pour toutes les tailles
  const ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxOTIgMTkyIj48cmVjdCB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgcng9IjM4IiBmaWxsPSIjMWE0NDgwIi8+PHBhdGggZD0iTTk2IDU0Yy0xNiAwLTMwIDEyLjYtMzAgMzEuNSAwIDE0LjQgOC43IDI3IDIxIDMzLjl2MTAuMmMtMTMuNSAzLTI0IDEwLjgtMjguMiAyMWg3NC40Yy00LjItMTAuMi0xNS0xOC0yOC44LTIxdi0xMC4yYzEyLjMtNi45IDIxLTE5LjUgMjEtMzMuOUMxMjYgNjYuNiAxMTIgNTQgOTYgNTR6IiBmaWxsPSIjZmZmIi8+PGNpcmNsZSBjeD0iOTYiIGN5PSI0MiIgcj0iMTAiIGZpbGw9IiNmZmYiLz48ZyBmaWxsPSIjZmJiZjI0Ij48cmVjdCB4PSIxMzgiIHk9IjEyMCIgd2lkdGg9IjkuNiIgaGVpZ2h0PSIzMyIgcng9IjMuNiIvPjxyZWN0IHg9IjEyNCIgeT0iMTMzIiB3aWR0aD0iMzMiIGhlaWdodD0iOS42IiByeD0iMy42Ii8+PC9nPjwvc3ZnPg==';
  // Construire le manifest dynamiquement et l'attacher via Blob URL
  try {
    // Manifest servi via blob: → les URLs relatives ('.') ne peuvent pas être
    // résolues (base blob invalide). On calcule des URLs ABSOLUES depuis la page.
    const _baseUrl = new URL('.', location.href).href;
    const manifest = {
      name: 'CPMI — Laboratoire Grand-Bassam',
      short_name: 'CPMI Labo',
      description: "Laboratoire d'analyses médicales du Centre de Protection Mère et Infantile.",
      start_url: _baseUrl,
      scope: _baseUrl,
      display: 'standalone',
      orientation: 'any',
      background_color: '#0b2545',
      theme_color: '#0b2545',
      lang: 'fr',
      icons: [
        { src: ICON, sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
        { src: ICON, sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
      ]
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    const link = document.getElementById('pwa-manifest');
    if (link) link.href = URL.createObjectURL(blob);
  } catch (e) { console.warn('[PWA] manifest:', e); }

  // Bouton « Installer l'application » — apparaît quand le navigateur le propose
  let _deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPrompt = e;
    const btn = document.getElementById('btn-install-pwa');
    if (btn) btn.style.display = 'inline-flex';
  });
  window.installPWA = async function () {
    if (!_deferredPrompt) {
      toast("Utilisez le menu du navigateur → « Ajouter à l'écran d'accueil »", 'ok');
      return;
    }
    _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    _deferredPrompt = null;
    const btn = document.getElementById('btn-install-pwa');
    if (btn) btn.style.display = 'none';
    if (outcome === 'accepted') toast('✅ Application installée', 'ok');
  };
  window.addEventListener('appinstalled', () => {
    const btn = document.getElementById('btn-install-pwa');
    if (btn) btn.style.display = 'none';
  });

  // ✅ v13.34+ — Service worker externe sw.js (meilleure compatibilité hébergeurs)
  // ✅ v13.67 — Détection de mise à jour pour les onglets restés ouverts.
  //    Le SW est en network-first : une page RECHARGÉE reçoit toujours la
  //    dernière version. Mais un poste qui laisse l'app ouverte toute la
  //    journée garde en mémoire le JS du démarrage. On surveille donc le
  //    déploiement et on propose un rechargement explicite.

  let _updateBannerShown = false;

  function showUpdateBanner() {
    if (_updateBannerShown || !document.body) return;
    _updateBannerShown = true;

    const bar = document.createElement('div');
    bar.id = 'update-banner';
    bar.setAttribute('role', 'status');
    bar.style.cssText =
      'position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:99999;' +
      'display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;' +
      'background:#1e293b;color:#f1f5f9;font-size:14px;font-weight:500;' +
      'box-shadow:0 8px 28px rgba(0,0,0,.35);max-width:92vw';

    const txt = document.createElement('span');
    txt.textContent = '🔄 Nouvelle version disponible';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Recharger';
    btn.style.cssText =
      'cursor:pointer;border:0;border-radius:8px;padding:7px 14px;' +
      'background:#38bdf8;color:#0f172a;font-weight:700;font-size:14px';

    // Jamais de rechargement automatique : une saisie en cours serait perdue.
    btn.addEventListener('click', async () => {
      if (typeof showConfirmModal === 'function') {
        const ok = await showConfirmModal({
          icon: '🔄',
          title: 'Recharger l’application',
          message: 'Toute saisie en cours non enregistrée sera perdue. Continuer ?',
          confirmText: 'Recharger'
        });
        if (!ok) return;
      }
      location.reload();
    });

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Plus tard');
    close.style.cssText =
      'cursor:pointer;border:0;background:transparent;color:#94a3b8;font-size:16px;line-height:1';
    close.addEventListener('click', () => {
      bar.remove();
      _updateBannerShown = false; // réapparaîtra à la prochaine vérification
    });

    bar.append(txt, btn, close);
    document.body.appendChild(bar);
  }

  // Signature du déploiement : requête HEAD (aucun corps transféré, donc
  // négligeable en data) et non interceptée par le SW, qui ignore les
  // requêtes non-GET. Ne dépend d'aucun numéro de version à maintenir.
  let _deploySig = null;

  async function checkForUpdate() {
    if (!navigator.onLine) return;
    let sig = null;
    try {
      const res = await fetch('./index.html', { method: 'HEAD', cache: 'no-store' });
      if (!res.ok) return;
      sig = res.headers.get('etag') || res.headers.get('last-modified');
    } catch (_) {
      return; // hors-ligne ou réseau instable : on réessaiera
    }
    if (!sig) return;                       // hébergeur sans ETag → on s'appuie sur le SW
    if (_deploySig === null) { _deploySig = sig; return; }  // référence au démarrage
    if (sig !== _deploySig) showUpdateBanner();
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      // Signal complémentaire : nouveau sw.js détecté par le navigateur.
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          // 'installed' + contrôleur déjà actif = mise à jour, pas 1re installation
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner();
          }
        });
      });

      const poll = () => { reg.update().catch(() => {}); checkForUpdate(); };
      document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
      window.addEventListener('online', poll);
      setInterval(poll, 30 * 60 * 1000);   // filet de sécurité toutes les 30 min
      checkForUpdate();                     // établit la référence au démarrage
    }).catch(err => console.warn('[PWA] SW:', err.message));
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('keydown', (e) => {
    if ((e.key === ',' || e.code === 'NumpadDecimal' && e.key === ',')) {
      const el = e.target;
      if (el && el.tagName === 'INPUT' &&
          (el.type === 'number' || (el.getAttribute('inputmode') === 'decimal'))) {
        e.preventDefault();
        if (el.type === 'number') {
          if (!el.value.includes('.')) el.value = el.value + '.';
        } else {
          const s = el.selectionStart ?? el.value.length;
          const en = el.selectionEnd ?? el.value.length;
          el.value = el.value.slice(0, s) + '.' + el.value.slice(en);
          el.selectionStart = el.selectionEnd = s + 1;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });

  // ✅ v13.4 — Bannière hors-ligne + synchronisation de la file au retour réseau
  const offBar = document.getElementById('offline-banner');
  const syncOffline = () => {
    if (offBar) offBar.style.display = navigator.onLine ? 'none' : 'block';
    if (navigator.onLine) flushSyncQueue(); // rejouer la file dès le retour
  };
  window.addEventListener('online', syncOffline);
  window.addEventListener('offline', syncOffline);
  syncOffline();
  updateSyncBanner();

  if (hasValidSession()) {
    enterApp();
  } else {
    // ✅ v13.34+ — Pas de session → login.html (normalement géré par checkAuth() en haut)
    window.location.replace('login.html');
  }
});

// ════════════════════════════════════════════════════════════════
// AMÉLIORATIONS v13.28
// ════════════════════════════════════════════════════════════════

// ── Mode sombre ──
function toggleDarkMode() {
  // ✅ v13.33 — Transition douce des couleurs lors du changement de thème
  document.documentElement.classList.add('theme-transitioning');
  setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 400);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  document.getElementById('btn-dark-mode').textContent = isDark ? '🌙' : '☀️';
  localStorage.setItem('labosaisie_theme', isDark ? 'light' : 'dark');
}
function initTheme() {
  const saved = localStorage.getItem('labosaisie_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('btn-dark-mode');
  if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';
}

// ── Statuts dossier (localStorage) ──
// ── Statuts dossier — stockés en base (patient.statut) + localStorage offline ──
// SQL requis (à exécuter une fois dans Supabase SQL Editor) :
// drop function if exists public.set_dossier_statut(text,bigint,text) cascade;
// create function public.set_dossier_statut(p_token text, p_id bigint, p_statut text)
// returns text language plpgsql security definer set search_path = public as $$
// declare v_uid bigint;
// begin
//   v_uid := public.uid_from_token(p_token);
//   if v_uid is null then return 'unauthorized'; end if;
//   if p_statut not in ('attente','rendu','urgent') then return 'invalid_statut'; end if;
//   update public.labo_resultats
//     set patient = patient || jsonb_build_object('statut', p_statut)
//   where id = p_id;
//   perform public.log_action(v_uid, 'set_statut', p_id, jsonb_build_object('statut', p_statut));
//   return 'ok';
// end; $$;
// grant execute on function public.set_dossier_statut(text,bigint,text) to anon;

const STATUTS_KEY = 'labosaisie_statuts';
function getStatuts() { try { return JSON.parse(localStorage.getItem(STATUTS_KEY)||'{}'); } catch { return {}; } }

// Lit le statut depuis le cache DB (prioritaire) ou localStorage (fallback hors-ligne)
function getStatut(id) {
  const r = (_dbCache || []).find(r => r.id === id);
  if (r?.patient?.statut) return r.patient.statut;
  return getStatuts()[id] || 'attente';
}

/**
 * ✅ v13.81 — Écriture LOCALE seule : cache + localStorage, aucun appel
 * serveur, aucun réaffichage. Extraite de setStatut pour les actions
 * groupées, qui persistent tout le lot en une fois : l'ancienne version
 * envoyait un second appel par fiche (mesuré : 966 appels pour 483 fiches)
 * et redessinait tout l'historique à chaque itération.
 */
function setStatutLocal(id, statut) {
  const r = (_dbCache || []).find(r => r.id === id);
  if (r) r.patient = {...(r.patient || {}), statut};
  const s = getStatuts(); s[id] = statut; localStorage.setItem(STATUTS_KEY, JSON.stringify(s));
  if (statut === 'rendu' && r && typeof notifyResultatPret === 'function') notifyResultatPret(r);
  return r;
}

// Écrit le statut d'UNE fiche : mise à jour optimiste + persistance async
function setStatut(id, statut) {
  const r = setStatutLocal(id, statut);
  // Persistance en base (async, ne bloque pas l'UI)
  if (typeof _sb !== 'undefined' && _sb && TK()) {
    _sb.rpc('set_dossier_statut', {p_token: TK(), p_id: id, p_statut: statut})
      .then(({error}) => {
        if (error) console.warn('[LaboSaisie] set_statut:', error.message);
      });
  }
  if (typeof updateHistoriqueBadge === 'function') updateHistoriqueBadge();
  renderHistory();
}

// ════════════════════════════════════════════════════════
// ✅ v13.35 — GESTION PAIEMENT CAISSE
// Séparé du statut dossier (rendu/attente/urgent)
// paiement_status : 'non_paye' | 'paye'
// ════════════════════════════════════════════════════════
const PAIEMENT_KEY = 'labosaisie_paiements_v1';

function getPaiements() {
  try { return JSON.parse(localStorage.getItem(PAIEMENT_KEY) || '{}'); } catch { return {}; }
}

function getPaiementStatus(id) {
  // Priorité : cache DB → localStorage
  const r = (_dbCache || []).find(r => r.id === id);
  if (r?.patient?.paiement_status) return r.patient.paiement_status;
  return getPaiements()[id] || 'non_paye';
}

function setPaiementStatus(id, status, infos) {
  // infos = { montant_demande, montant_recu, monnaie_rendue, agent }
  const r = (_dbCache || []).find(r => r.id === id);
  if (r) r.patient = { ...(r.patient || {}), paiement_status: status, paiement_infos: infos || {} };
  const p = getPaiements();
  p[id] = status;
  localStorage.setItem(PAIEMENT_KEY, JSON.stringify(p));
  // Persister dans Supabase via p_patient update
  if (_sb && TK() && r) {
    Promise.resolve(_sb.rpc('update_dossier_patient', {
      p_token: TK(), p_id: id,
      p_patient: r.patient
    })).catch(() => {});
  }
  updateBandeauPaiement();
  if (typeof renderCaisse === 'function') renderCaisse();
  if (typeof renderHistory === 'function') renderHistory();
}

function isDossierPaye(id) {
  return getPaiementStatus(id) === 'paye';
}

// ✅ v13.94 — Un résultat non payé ne sort pas du laboratoire.
// La v13.35 empêchait déjà de SAISIR un résultat non encaissé ; rien
// n'empêchait de l'imprimer ou de l'exporter. Le garde est ici, en un seul
// endroit, et non recopié dans chaque bouton : c'est la seule façon de ne
// pas en oublier un au prochain point d'entrée.
// L'administrateur reste libre — c'est lui qui accorde les gratuités et qui
// doit pouvoir sortir un duplicata en cas de litige.
function sortieAutorisee(id) {
  if (typeof isAdmin === 'function' && isAdmin()) return true;
  if (typeof isDossierPaye !== 'function') return true;   // module absent : on ne bloque pas
  if (isDossierPaye(id)) return true;
  toast('🔒 Dossier non encaissé — impression et export bloqués', 'err');
  return false;
}


// Met à jour le bandeau rouge en vue saisie selon le dossier en cours
function updateBandeauPaiement() {
  const bandeau = document.getElementById('bandeau-paiement');
  if (!bandeau) return;
  // Récupérer l'ID du dossier en cours d'édition
  const id = _editingRecordId || null;
  if (!id) { bandeau.classList.remove('visible'); return; }
  const paye = isDossierPaye(id);
  bandeau.classList.toggle('visible', !paye);
  // ✅ v13.36 — Le verrouillage des CHAMPS est délégué à applyExamLocks (source
  // unique de vérité : combine « examen coché » ET « dossier payé »). Ici on ne
  // gère plus que le bandeau rouge et les boutons d'enregistrement. Avant, cette
  // fonction ré-activait TOUS les champs quand payé, écrasant le verrou « examen
  // non coché » posé par applyExamLocks.
  if (typeof applyExamLocks === 'function') applyExamLocks();
  const saisieZone = document.getElementById('view-saisie');
  if (!saisieZone) return;
  saisieZone.querySelectorAll('button[onclick^="saveThenNext"], button[onclick*="saveRecord"], #btn-save-all').forEach(btn => {
    btn.disabled = !paye;
    btn.title = paye ? '' : 'Paiement requis avant la saisie';
  });
}

// ── Modal de paiement ──────────────────────────────────
function ouvrirModalPaiement(id, montantDemande) {
  if (blockIfSpectateur()) return;
  const existing = document.getElementById('modal-paiement');
  if (existing) existing.remove();

  const r = (_dbCache || []).find(r => r.id === id);
  const nom = r?.patient?.nom || 'Patient';
  const demand = montantDemande || r?.montant || 0;

  const modal = document.createElement('div');
  modal.id = 'modal-paiement';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:16px;padding:28px 24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="font-size:16px;font-weight:800;color:var(--cpmi-deep);margin-bottom:4px">💰 Encaissement</div>
      <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:18px">${esc(nom)} — Dossier #${id}</div>

      <div style="display:flex;flex-direction:column;gap:14px">
        <div>
          <label style="font-size:12px;font-weight:700;color:var(--text-label);display:block;margin-bottom:4px">Montant demandé (FCFA)</label>
          <input type="number" id="pm-demande" value="${demand}" min="0" step="100"
            style="font-size:18px;font-weight:800;color:var(--cpmi-deep);text-align:right"
            oninput="calcMonnaie()">
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;color:var(--text-label);display:block;margin-bottom:4px">Montant reçu (FCFA)</label>
          <!-- ✅ v13.37 — pré-rempli avec le prix normal, modifiable si le patient donne plus -->
          <input type="number" id="pm-recu" value="${demand}" min="0" step="100"
            placeholder="Saisir le montant donné par le patient"
            style="font-size:18px;font-weight:800;text-align:right"
            oninput="calcMonnaie()">
        </div>
        <div id="pm-monnaie-wrap" style="background:var(--success-light);border-radius:10px;padding:12px 16px;display:none">
          <div style="font-size:11px;font-weight:700;color:var(--success);text-transform:uppercase;letter-spacing:.5px">Monnaie à rendre</div>
          <div id="pm-monnaie" style="font-size:26px;font-weight:800;color:var(--success)">0 FCFA</div>
          <!-- ✅ v13.36 — Suivi de la remise de la monnaie -->
          <label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;font-weight:600;color:var(--text-primary);cursor:pointer">
            <input type="checkbox" id="pm-monnaie-remise" checked style="width:17px;height:17px;cursor:pointer;accent-color:var(--success)">
            Monnaie remise au patient maintenant
          </label>
          <div style="font-size:11px;color:#b45309;margin-top:4px">Décochez si le patient repart sans sa monnaie (il reviendra la chercher).</div>
        </div>
        <div id="pm-insuffisant" style="background:var(--danger-light);border-radius:10px;padding:10px 14px;display:none;color:var(--danger);font-size:13px;font-weight:700">
          ⚠ Montant insuffisant
        </div>
      </div>

      <div style="display:flex;gap:10px;margin-top:22px">
        <button class="btn btn-outline" onclick="fermerModalPaiement()" style="flex:1">Annuler</button>
        <button class="btn btn-primary" id="pm-btn-valider" onclick="validerPaiement(${id})" style="flex:2" disabled>✅ Valider le paiement</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  // ✅ v13.37 — Champ pré-rempli avec le prix : on calcule la monnaie (0 par
  // défaut → bouton actif) et on sélectionne le texte pour le modifier vite.
  const recuEl = document.getElementById('pm-recu');
  if (recuEl) { recuEl.focus(); recuEl.select(); }
  if (typeof calcMonnaie === 'function') calcMonnaie();
}

function fermerModalPaiement() {
  const m = document.getElementById('modal-paiement');
  if (m) m.remove();
}

function calcMonnaie() {
  const demande = parseFloat(document.getElementById('pm-demande')?.value || 0);
  const recu    = parseFloat(document.getElementById('pm-recu')?.value || 0);
  const monnaieWrap = document.getElementById('pm-monnaie-wrap');
  const monnaieEl   = document.getElementById('pm-monnaie');
  const insuffEl    = document.getElementById('pm-insuffisant');
  const btnValider  = document.getElementById('pm-btn-valider');

  if (!recu || isNaN(recu)) {
    monnaieWrap.style.display = 'none';
    insuffEl.style.display = 'none';
    if (btnValider) btnValider.disabled = true;
    return;
  }
  const monnaie = recu - demande;
  if (monnaie < 0) {
    monnaieWrap.style.display = 'none';
    insuffEl.style.display = 'block';
    if (btnValider) btnValider.disabled = true;
  } else {
    monnaieWrap.style.display = 'block';
    insuffEl.style.display = 'none';
    if (monnaieEl) monnaieEl.textContent = monnaie.toLocaleString('fr-FR') + ' FCFA';
    if (btnValider) btnValider.disabled = false;
  }
}

function validerPaiement(id) {
  const demande = parseFloat(document.getElementById('pm-demande')?.value || 0);
  const recu    = parseFloat(document.getElementById('pm-recu')?.value || 0);
  const monnaie = recu - demande;
  if (monnaie < 0) return;

  // ✅ v13.36 — Suivi de la remise de la monnaie. Si le patient repart sans sa
  // monnaie (case décochée), le dossier apparaît dans « Monnaie à rendre ».
  const remiseChk = document.getElementById('pm-monnaie-remise');
  const monnaieRemise = monnaie <= 0 ? true : (remiseChk ? remiseChk.checked : true);
  const infos = {
    montant_demande: demande,
    montant_recu: recu,
    monnaie: monnaie,               // montant de la monnaie
    monnaie_rendue: monnaie,        // conservé pour compatibilité (montant)
    monnaie_remise: monnaieRemise,  // la monnaie a-t-elle été physiquement remise ?
    monnaie_remise_le: (monnaie > 0 && monnaieRemise) ? new Date().toISOString() : null,
    monnaie_remise_par: (monnaie > 0 && monnaieRemise) ? (_currentUser?.username || '?') : null,
    agent: _currentUser?.username || '?',
    date: new Date().toISOString()
  };
  setPaiementStatus(id, 'paye', infos);
  fermerModalPaiement();
  if (monnaie > 0 && !monnaieRemise) {
    toast('✅ Paiement enregistré — ⚠ Monnaie de ' + monnaie.toLocaleString('fr-FR') + ' FCFA À RENDRE', 'ok');
  } else {
    toast('✅ Paiement enregistré — ' + demande.toLocaleString('fr-FR') + ' FCFA', 'ok');
  }
  // Mettre à jour le montant du dossier si différent
  const r = (_dbCache || []).find(r => r.id === id);
  if (r && demande && demande !== r.montant) {
    r.montant = demande;
  }
}

function annulerPaiement(id) {
  if (blockIfSpectateur()) return;
  if (!confirm('Annuler le paiement de ce dossier ?')) return;
  setPaiementStatus(id, 'non_paye', {});
  toast('Paiement annulé', 'err');
}

// ✅ v13.36 — Suivi de la monnaie à rendre
// Retourne le montant de monnaie DUE (non remise) pour un dossier, sinon 0.
// Un dossier n'est « à rendre » que si la case a été explicitement décochée
// (monnaie_remise === false) → les anciens paiements ne sont jamais signalés.
function monnaieDue(id) {
  const r = (_dbCache || []).find(x => x.id === id);
  const info = r?.patient?.paiement_infos || {};
  const montant = Number(info.monnaie != null ? info.monnaie : info.monnaie_rendue) || 0;
  return (montant > 0 && info.monnaie_remise === false) ? montant : 0;
}

async function marquerMonnaieRemise(id) {
  if (blockIfSpectateur()) return;
  const r = (_dbCache || []).find(x => x.id === id);
  if (!r) { toast('Dossier introuvable', 'err'); return; }
  const nom = r.patient?.nom || 'ce patient';
  const due = monnaieDue(id);
  if (!await showConfirmModal({
    icon: '💵', title: 'Monnaie remise ?',
    message: 'Confirmer que la monnaie de ' + due.toLocaleString('fr-FR') + ' FCFA a bien été remise à ' + nom + ' ?',
    confirmText: 'Oui, remise', cancelText: 'Annuler'
  })) return;
  const infos = {
    ...(r.patient?.paiement_infos || {}),
    monnaie_remise: true,
    monnaie_remise_le: new Date().toISOString(),
    monnaie_remise_par: _currentUser?.username || '?'
  };
  setPaiementStatus(id, 'paye', infos); // conserve le statut payé, met à jour les infos
  toast('✅ Monnaie de ' + due.toLocaleString('fr-FR') + ' FCFA remise à ' + nom, 'ok');
}

// Liste des dossiers dont la monnaie n'a pas encore été remise
function renderCaisseMonnaie() {
  const card  = document.getElementById('caisse-monnaie-card');
  const body  = document.getElementById('caisse-monnaie-body');
  const count = document.getElementById('caisse-monnaie-count');
  if (!card || !body) return;

  const db = getDB() || [];
  const dus = db
    .filter(r => monnaieDue(r.id) > 0)
    .sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));

  if (!dus.length) { card.style.display = 'none'; return; }
  card.style.display = '';

  const totalDu = dus.reduce((s, r) => s + monnaieDue(r.id), 0);
  if (count) count.textContent = dus.length + ' patient(s) · ' + totalDu.toLocaleString('fr-FR') + ' FCFA';

  const rows = dus.map(r => {
    const p   = r.patient || {};
    const nom = esc(p.nom || '—');
    const dos = esc(p.dossier || r.id);
    const due = monnaieDue(r.id).toLocaleString('fr-FR');
    const info = p.paiement_infos || {};
    const quand = info.date ? new Date(info.date).toLocaleDateString('fr-FR') : '—';
    return `<tr>
      <td style="font-weight:700">${nom}</td>
      <td style="font-size:12px;color:var(--text-muted)">${dos}</td>
      <td style="font-size:12px;color:var(--text-muted)">${quand}</td>
      <td style="font-weight:900;color:#b45309;text-align:right">${due} FCFA</td>
      <td style="text-align:center">
        ${isSpectateur()
          ? '<span style="color:var(--text-muted);font-size:12px">🔒</span>'
          : `<button class="btn btn-primary" style="padding:4px 12px;font-size:12px;background:#16a34a" onclick="marquerMonnaieRemise(${r.id})">✅ Remise</button>`}
      </td>
    </tr>`;
  }).join('');

  body.innerHTML = `
    <div class="table-wrap">
      <table class="result-table" style="width:100%">
        <thead><tr>
          <th>Patient</th><th>N° dossier</th><th>Payé le</th>
          <th style="text-align:right">Monnaie due</th><th style="text-align:center">Action</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ✅ v13.35 — Rendre la liste des dossiers à encaisser
function renderCaisseAEncaisser() {
  const body  = document.getElementById('caisse-a-encaisser-body');
  const count = document.getElementById('caisse-encaisser-count');
  if (!body) return;

  const db = getDB() || [];
  // Dossiers non payés, triés du plus récent au plus ancien
  const nonPayes = db
    .filter(r => getPaiementStatus(r.id) === 'non_paye')
    .sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));

  if (count) count.textContent = nonPayes.length ? nonPayes.length + ' dossier(s) en attente' : '';

  if (!nonPayes.length) {
    body.innerHTML = '<p style="font-size:13px;color:var(--success);text-align:center;padding:16px">✅ Tous les dossiers sont encaissés</p>';
    return;
  }

  const rows = nonPayes.map(r => {
    const p    = r.patient || {};
    const nom  = esc(p.nom || '—');
    const dos  = esc(p.dossier || r.id);
    const date = r.savedAt ? new Date(r.savedAt).toLocaleDateString('fr-FR') : '—';
    const mont = (r.montant || 0).toLocaleString('fr-FR');
    const type = esc(getRecordTypes(r).join(', ') || r.type || '—');
    return `<tr>
      <td style="font-weight:700">${nom}</td>
      <td style="font-size:12px;color:var(--text-muted)">${dos}</td>
      <td style="font-size:12px">${type}</td>
      <td style="font-size:12px;color:var(--text-muted)">${date}</td>
      <td style="font-weight:700;color:var(--cpmi-deep);text-align:right">${mont} FCFA</td>
      <td style="text-align:center">
        ${isSpectateur()
          ? '<span style="color:var(--text-muted);font-size:12px">🔒 lecture seule</span>'
          : `<button class="btn btn-primary" style="padding:4px 12px;font-size:12px" onclick="ouvrirModalPaiement(${r.id}, ${r.montant || 0})">💰 Encaisser</button>`}
      </td>
    </tr>`;
  }).join('');

  body.innerHTML = `
    <div class="table-wrap">
      <table class="result-table" style="width:100%">
        <thead><tr>
          <th>Patient</th><th>N° dossier</th><th>Analyse</th><th>Date</th>
          <th style="text-align:right">Montant</th><th style="text-align:center">Action</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}



function cycleStatut(id) {
  if (blockIfSpectateur()) return;
  const order = ['attente','rendu','urgent'];
  const next = order[(order.indexOf(getStatut(id))+1) % order.length];
  setStatut(id, next);
}

function paiementBadge(id) {
  const s = getPaiementStatus(id);
  // ✅ v13.36 — Pastille « monnaie à rendre » si le patient n'a pas repris sa monnaie
  const due = (typeof monnaieDue === 'function') ? monnaieDue(id) : 0;
  const monnaieTag = due > 0
    ? ' <span title="Cliquer pour marquer la monnaie comme remise" style="background:#ffedd5;color:#9a3412;border:1px solid #fdba74;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700;cursor:pointer" onclick="event.stopPropagation();marquerMonnaieRemise(' + id + ')">💵 Monnaie à rendre : ' + due.toLocaleString('fr-FR') + '</span>'
    : '';
  if (s === 'paye') return '<span style="background:#dcfce7;color:#166534;border:1px solid #86efac;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700">💵 Payé</span>' + monnaieTag;
  return '<span style="background:#fef9c3;color:#854d0e;border:1px solid #fde047;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700;cursor:pointer" onclick="event.stopPropagation();ouvrirModalPaiement(' + id + ')">💳 Non payé</span>' + monnaieTag;
}
function statutBadge(id) {
  const s = getStatut(id);
  const labels = {rendu:'✅ Rendu', attente:'⏳ Attente', urgent:'🔴 Urgent'};
  const cls    = {rendu:'badge-rendu', attente:'badge-attente', urgent:'badge-urgent'};
  return `<span class="${cls[s]}" onclick="event.stopPropagation();cycleStatut(${id})" title="Cliquer pour changer">${labels[s]}</span>`;
}

// ── Aperçu rapide au survol ──
let _previewTimer = null;
function showPreview(e, recordOrId) {
  clearTimeout(_previewTimer);
  // ✅ v13.36 — Accepte un id (nouveau, sûr) ou un objet (compat). L'id est
  // résolu depuis le cache : aucune donnée patient n'est injectée dans le HTML.
  const record = (typeof recordOrId === 'object' && recordOrId)
    ? recordOrId
    : getDB().find(x => x.id === recordOrId);
  if (!record) return;
  _previewTimer = setTimeout(() => {
    const p = record.patient||{};
    const types = getRecordTypes(record).join(', ');
    const examens = Object.values(record.resultats?._examens_coches||{}).flat().slice(0,5);
    const div = document.getElementById('record-preview');
    if (!div) return;
    div.innerHTML = `
      <div style="font-weight:800;color:var(--cpmi-deep);margin-bottom:6px">${escHTML((p.nom||'').toUpperCase())}</div>
      <div style="color:var(--text-muted);font-size:11px;margin-bottom:4px">📁 ${escHTML(p.dossier||'—')} · ${escHTML(p.date||'—')}</div>
      <div style="font-size:11px;margin-bottom:4px">🔬 ${escHTML(types)}</div>
      ${examens.length?`<div style="font-size:11px;color:var(--text-muted)">${examens.map(e=>escHTML(e)).join('<br>')}</div>`:''}
      <div style="margin-top:6px;font-weight:700;color:var(--success)">${(record.montant||0).toLocaleString('fr-FR')} FCFA</div>`;
    div.style.left = Math.min(e.clientX+12, window.innerWidth-300)+'px';
    div.style.top  = Math.min(e.clientY+12, window.innerHeight-200)+'px';
    div.classList.add('visible');
  }, 400);
}
function hidePreview() {
  clearTimeout(_previewTimer);
  const div = document.getElementById('record-preview');
  if (div) div.classList.remove('visible');
}

// ── Notification patient déjà vu ce mois ──
function checkPatientExistant() {
  const nom = document.getElementById('p_nom')?.value?.trim().toLowerCase();
  if (!nom || nom.length < 3) return;
  const thisMonth = new Date().toISOString().slice(0,7);
  const existant = getDB().find(r => {
    const n = (r.patient?.nom||'').toLowerCase();
    const d = r.patient?.date || r.savedAt || '';
    return n.includes(nom) && d.startsWith(thisMonth);
  });
  const el = document.getElementById('patient-existant-notif');
  if (!el) return;
  if (existant) {
    const p = existant.patient||{};
    el.innerHTML = `⚠️ <strong>${escHTML((p.nom||'').toUpperCase())}</strong> a déjà un dossier ce mois : <strong>${escHTML(p.dossier||'—')}</strong>
      <button class="btn btn-outline" style="padding:2px 8px;font-size:11px;margin-left:8px" onclick="editRecord(${existant.id})">Voir</button>`;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

// ── Dupliquer un dossier ──
function dupliquerDossier(id) {
  if (blockIfSpectateur()) return;
  const record = getDB().find(r => r.id === id);
  if (!record) return;
  const p = {...record.patient};
  p.date = new Date().toISOString().slice(0,10);
  delete p.dossier;
  newPatient();
  showView('saisie');
  setTimeout(() => {
    // ── Infos patient ──────────────────────────────────────
    ['nom','age','sexe','telephone','medecin','clinique','service'].forEach(k => {
      const el = document.getElementById('p_'+k);
      if (el && p[k]) el.value = p[k];
    });
    const dateEl = document.getElementById('p_date');
    if (dateEl) dateEl.value = p.date;

    // Prescripteur lié
    if (record.prescripteur_id) {
      const sel = document.getElementById('p_prescripteur_id');
      if (sel) { sel.value = record.prescripteur_id; onPrescripteurChange(); }
    }

    // ── Examens cochés + prix ──────────────────────────────
    const restored = restoreFicheFromRecord(record);
    if (restored) {
      // Ouvrir les accordéons des groupes qui ont au moins un examen coché
      const cat = getCatalogueComplet();
      const groupesOuverts = new Set();
      cat.forEach(ex => {
        const chk = document.getElementById(ex.id);
        if (chk && chk.checked) {
          const gid = 'grp_' + (ex.groupe || '').replace(/[^a-z0-9]/gi, '_');
          if (!groupesOuverts.has(gid)) {
            const body = document.getElementById(gid);
            const arrow = document.getElementById(gid + '_arrow');
            if (body && body.style.display === 'none') {
              body.style.display = 'block';
              if (arrow) arrow.style.transform = 'rotate(0deg)';
            }
            groupesOuverts.add(gid);
          }
        }
      });
      toast('✅ Patient + ' + groupesOuverts.size + ' groupe(s) d\'examens restaurés — ajustez si besoin', 'ok');
    } else {
      toast('Patient dupliqué — vérifiez et complétez la fiche', 'ok');
    }
  }, 350);
}

// ── Top examens ──
function renderTopExamens() {
  const counts = {};
  getCalcDB().forEach(r => { // ✅ v13.30 — cohérent avec les autres statistiques (exclut les verrouillées)
    Object.values(r.resultats?._examens_coches||{}).flat()
      .forEach(label => { counts[label] = (counts[label]||0)+1; });
  });
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const el = document.getElementById('top-examens-body');
  if (!el) return;
  if (!sorted.length) { el.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">Aucune donnée</td></tr>'; return; }
  el.innerHTML = sorted.map(([label,count],i) =>
    `<tr><td style="padding:6px 8px;font-weight:700;color:var(--text-muted)">${i+1}</td>
     <td style="padding:6px 8px">${escHTML(label)}</td>
     <td style="padding:6px 8px;font-weight:700;color:var(--cpmi-mid)">${count}</td></tr>`
  ).join('');
}

// ✅ v13.44 — Top examens en barres horizontales dans l'onglet Statistiques
// (visible par tous, sur la période filtrée). Compte chaque examen coché
// individuellement, tous types confondus.
function renderTopExamensChart(dbList) {
  const el = document.getElementById('chart-top-examens');
  if (!el) return;
  const counts = {};
  (dbList || []).forEach(r => {
    const coches = r.resultats?._examens_coches || {};
    // Format dossier : { type: [labels] } ; format ancien : [labels]
    const labels = Array.isArray(coches) ? coches : Object.values(coches).flat();
    labels.forEach(label => {
      if (!label) return;
      counts[label] = (counts[label] || 0) + 1;
    });
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const sub = document.getElementById('top-examens-sub');

  if (!sorted.length) {
    el.innerHTML = '<div class="stats-empty">Aucun examen sur cette période</div>';
    if (sub) sub.textContent = '';
    return;
  }
  const totalDemandes = Object.values(counts).reduce((a, b) => a + b, 0);
  const nbDistinct = Object.keys(counts).length;
  if (sub) sub.textContent = nbDistinct + ' examens distincts · ' + totalDemandes + ' demandes';

  const max = sorted[0][1];
  // Dégradé du plus demandé (teal foncé) au moins demandé (bleu clair)
  const colorAt = (i, n) => {
    const t = n <= 1 ? 0 : i / (n - 1);
    // interpole entre #0b2545 (navy) et #00b4d8 (teal)
    const lerp = (a, b) => Math.round(a + (b - a) * t);
    const r = lerp(0x0b, 0x00), g = lerp(0x25, 0xb4), b = lerp(0x45, 0xd8);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  };

  el.innerHTML =
    '<div class="bar-chart" style="gap:9px">' +
    sorted.map(([label, count], i) => {
      const pct = Math.round(count / max * 100);
      const medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : '';
      return '<div style="display:flex;align-items:center;gap:10px;font-size:12px">'
        + '<div style="width:26px;text-align:right;font-weight:800;color:var(--text-muted);flex-shrink:0">' + (i + 1) + '</div>'
        + '<div style="flex:1;min-width:0">'
          + '<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:3px">'
            + '<span style="font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + escHTML(label) + '">' + medal + escHTML(label) + '</span>'
            + '<span style="font-weight:800;color:var(--cpmi-deep);flex-shrink:0;font-variant-numeric:tabular-nums">' + count + '</span>'
          + '</div>'
          + '<div style="height:8px;background:var(--accent-light);border-radius:99px;overflow:hidden">'
            + '<div style="height:100%;width:' + pct + '%;background:' + colorAt(i, sorted.length) + ';border-radius:99px;transition:width .5s ease"></div>'
          + '</div>'
        + '</div>'
      + '</div>';
    }).join('') +
    '</div>';
}

document.addEventListener('DOMContentLoaded', initTheme);

// ============================================================
// VUE PUBLIQUE DE VÉRIFICATION (?share=TOKEN)
// Accessible sans connexion — lit le résultat via share_token
// ============================================================

async function checkShareMode() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('share');
  if (!token) return false;

  // Masquer login et app, afficher l'overlay de vérification
  // ✅ v13.34+ — login-screen est dans login.html, pas ici
  const appEl   = document.getElementById('app-root');
  if (appEl)   appEl.style.display   = 'none';

  const overlay = document.getElementById('share-view');
  if (!overlay) return true;
  overlay.style.display = 'flex';

  if (!initSupabase()) {
    overlay.innerHTML = buildShareCard('⚠ Connexion impossible', '<p>Impossible de contacter la base de données. Vérifiez votre connexion.</p>');
    return true;
  }

  try {
    const { data, error } = await _sb.rpc('get_public_result', { p_share_token: token });
    if (error || !data || !data.length) {
      overlay.innerHTML = buildShareCard('Dossier introuvable',
        '<p style="color:#b91c1c">Ce lien de vérification n\'est pas valide ou a expiré.</p>');
      return true;
    }
    const r = data[0];
    const p = typeof r.patient === 'string' ? JSON.parse(r.patient) : (r.patient || {});
    const dateF = p.date ? new Date(p.date).toLocaleDateString('fr-FR') : '—';
    const types = Array.isArray(r.types) ? r.types.join(' · ') : (r.type || '—');
    overlay.innerHTML = buildShareCard(
      '✅ Résultat vérifié — CPMI Grand-Bassam',
      `<div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:14px 18px;margin-bottom:14px">
        <div style="font-size:11px;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Informations patient</div>
        <table style="width:100%;font-size:13px;border-collapse:collapse">
          <tr><td style="color:#4b5563;padding:3px 8px 3px 0;white-space:nowrap">N° Dossier</td><td><strong style="font-size:15px;color:#0b2545">${escHTML(p.dossier||'—')}</strong></td></tr>
          <tr><td style="color:#4b5563;padding:3px 8px 3px 0">Patient</td><td><strong style="text-transform:uppercase">${escHTML(p.nom||'—')}</strong></td></tr>
          <tr><td style="color:#4b5563;padding:3px 8px 3px 0">Âge / Sexe</td><td>${escHTML(p.age||'—')} ans / ${p.sexe==='M'?'Masculin':p.sexe==='F'?'Féminin':'—'}</td></tr>
          <tr><td style="color:#4b5563;padding:3px 8px 3px 0">Date</td><td>${escHTML(dateF)}</td></tr>
          <tr><td style="color:#4b5563;padding:3px 8px 3px 0">Prescripteur</td><td>${escHTML(p.medecin||'—')}</td></tr>
          <tr><td style="color:#4b5563;padding:3px 8px 3px 0">Analyses</td><td><strong>${escHTML(types)}</strong></td></tr>
          <tr><td style="color:#4b5563;padding:3px 8px 3px 0">Saisi par</td><td>${escHTML(r.saisi_par||'—')}</td></tr>
        </table>
      </div>
      <div style="font-size:12px;color:#6b7280;text-align:center;font-style:italic">
        Ce document a été émis par le Laboratoire du CPMI de Grand-Bassam.<br>
        Pour toute question, contactez directement l'établissement.
      </div>`
    );
  } catch(e) {
    overlay.innerHTML = buildShareCard('Erreur', '<p>' + escHTML(e.message) + '</p>');
  }
  return true;
}

function buildShareCard(title, body) {
  return `<div style="background:#fff;border-radius:18px;padding:32px 28px;max-width:480px;width:100%;box-shadow:0 16px 48px rgba(0,0,0,.18);font-family:'Poppins',sans-serif">
    <div style="text-align:center;margin-bottom:18px">
      <div style="width:56px;height:56px;background:linear-gradient(135deg,#0b2545,#0096c7);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;margin:0 auto 10px">🔬</div>
      <div style="font-size:18px;font-weight:800;color:#0b2545">${escHTML(title)}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:2px">CPMI · Centre de Protection Mère et Infantile · Grand-Bassam</div>
    </div>
    ${body}
  </div>`;
}

// ════════════════════════════════════════════════════════════════
// ✅ v13.28 — NOUVELLES FONCTIONNALITÉS (features 2 à 10)
// ════════════════════════════════════════════════════════════════

const MOIS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
function _fmtF(n) { return (Number(n) || 0).toLocaleString('fr-FR'); }
function _recDate(r) { return r?.patient?.date || (r?.savedAt || '').slice(0,10) || ''; }

// ── FEATURE 2 : auto-complétion médecins ──────────────────────────
function refreshMedecinDatalist() {
  const dl = document.getElementById('medecin-datalist');
  if (!dl) return;
  const noms = new Set();
  (getDB() || []).forEach(r => {
    const m = (r.patient?.medecin || '').trim();
    if (m) noms.add(m);
  });
  (_prescripteurs || []).forEach(p => { if (p?.nom) noms.add(String(p.nom).trim()); });
  // Complément asynchrone via la table prescripteurs (best-effort)
  if (_sb && TK()) {
    _sb.from('labo_prescripteurs').select('nom').then(({ data }) => {
      if (Array.isArray(data)) {
        let added = false;
        data.forEach(row => { if (row?.nom && !noms.has(row.nom.trim())) { noms.add(row.nom.trim()); added = true; } });
        if (added) _writeMedecinDatalist(dl, noms);
      }
    }).catch(() => {});
  }
  _writeMedecinDatalist(dl, noms);
}
function _writeMedecinDatalist(dl, nomsSet) {
  dl.innerHTML = [...nomsSet].sort((a, b) => a.localeCompare(b, 'fr'))
    .map(n => `<option value="${esc(n)}"></option>`).join('');
}

// ── FEATURE 3 : modèles rapides d'examens ─────────────────────────
const MODELES_EXAMENS = {
  nfs:        { label: 'NFS complète',     mots: ['nfs','numération','hémoglobine','plaquette','leucocyte'] },
  renal:      { label: 'Bilan rénal',      mots: ['créatinine','urée','acide urique','ionogramme'] },
  hepatique:  { label: 'Bilan hépatique',  mots: ['transaminase','alat','asat','bilirubine','phosphatase'] },
  lipidique:  { label: 'Bilan lipidique',  mots: ['cholestérol','triglycéride','hdl','ldl'] },
  infectieux: { label: 'Bilan infectieux', mots: ['crp','vs ','fibrinogène','procalcitonine'] },
  groupe:     { label: 'Groupe sanguin',   mots: ['groupe','rhésus','rai'] },
  ecbu:       { label: 'ECBU',             mots: ['ecbu','examen cytobactériologique','uroculture'] },
  serologie:  { label: 'Sérologie',        mots: ['sérologie','elisa','hiv','vih','hépatite','syphilis'] },
};
function appliquerModele(key) {
  const modele = MODELES_EXAMENS[key];
  if (!modele) return;
  let n = 0;
  const groupesAOuvrir = new Set();
  getCatalogueComplet().forEach(ex => {
    const hay = ((ex.label || '') + ' ' + (ex.groupe || '')).toLowerCase();
    if (modele.mots.some(m => hay.includes(m))) {
      const chk = document.getElementById(ex.id);
      if (chk && !chk.checked) { chk.checked = true; n++; }
      else if (chk) n++;
      if (ex.groupe) groupesAOuvrir.add('grp_' + ex.groupe.replace(/[^a-z0-9]/gi, '_'));
    }
  });
  // Ouvrir les accordéons concernés
  groupesAOuvrir.forEach(gid => {
    const body = document.getElementById(gid);
    const arrow = document.getElementById(gid + '_arrow');
    if (body) { body.style.display = 'block'; if (arrow) arrow.style.transform = 'rotate(0deg)'; }
  });
  calcFicheTotal();
  toast(n + ' examen' + (n > 1 ? 's' : '') + ' coché' + (n > 1 ? 's' : '') + ' (' + modele.label + ')', 'ok');
}
function decocherTousExamens() {
  let n = 0;
  getCatalogueComplet().forEach(ex => {
    const chk = document.getElementById(ex.id);
    if (chk && chk.checked) { chk.checked = false; n++; }
    syncExamRowState(ex.id);
  });
  calcFicheTotal();
  toast(n + ' examen' + (n > 1 ? 's' : '') + ' décoché' + (n > 1 ? 's' : ''), '');
}

// ── FEATURE 4 : valeurs critiques ─────────────────────────────────
const VALEURS_CRITIQUES = {
  'hémoglobine': { min: 7, max: 20, unite: 'g/dL', label: 'Hémoglobine' },
  'plaquettes':  { min: 50000, max: 1000000, unite: '/mm³', label: 'Plaquettes' },
  'leucocytes':  { min: 2000, max: 30000, unite: '/mm³', label: 'Leucocytes' },
  'glycémie':    { min: 0.5, max: 5.0, unite: 'g/L', label: 'Glycémie' },
  'créatinine':  { min: 0, max: 200, unite: 'µmol/L', label: 'Créatinine' },
  'potassium':   { min: 2.5, max: 6.5, unite: 'mmol/L', label: 'Kaliémie' },
  'sodium':      { min: 120, max: 160, unite: 'mmol/L', label: 'Natrémie' },
};
// Reçoit un objet resultats (nom -> {valeur} ou valeur) → renvoie les alertes
function checkValeursCritiques(resultats) {
  const alerts = [];
  if (!resultats || typeof resultats !== 'object') return alerts;
  Object.entries(resultats).forEach(([nom, v]) => {
    if (!nom || nom.startsWith('_')) return;
    const key = nom.toLowerCase().trim();
    for (const [cle, crit] of Object.entries(VALEURS_CRITIQUES)) {
      // ✅ v13.34 — Match précis : le nom doit commencer par la clé ou y être égal
      // (évite que "créatinine" matche "créatinine sérique en µmol/L" faux positif)
      const cLabel = crit.label.toLowerCase();
      const matched = key === cle || key === cLabel
        || key.startsWith(cle + ' ') || key.startsWith(cle + '(')
        || key.startsWith(cLabel + ' ') || key.startsWith(cLabel + '(');
      if (!matched) continue;
      const brut = (typeof v === 'object' && v) ? (v.valeur ?? v.resultat ?? '') : v;
      const num = parseFloat(String(brut).replace(',', '.'));
      if (!isNaN(num) && (num < crit.min || num > crit.max)) {
        alerts.push({ label: crit.label, valeur: num, unite: crit.unite, min: crit.min, max: crit.max,
          sens: num < crit.min ? 'bas' : 'élevé' });
      }
      break;
    }
  });
  return alerts;
}
function hasCriticalValues(record) {
  if (!record) return false;
  // ✅ v13.34 — Ne pas utiliser has_critical résiduel : recalculer en direct
  // (évite les faux positifs après correction d'une valeur)
  if (record.resultats) {
    if (checkValeursCritiques(record.resultats).length) return true;
    for (const t of (record.resultats._types || [])) {
      if (checkValeursCritiques(record.resultats[t]).length) return true;
    }
  }
  return false;
}
// Vérification en direct pendant la saisie (non bloquante)
function checkCriticalLive() {
  const box = document.getElementById('critical-alert-box');
  if (!box) return;
  const alerts = [];
  document.querySelectorAll('#zone-saisie input[type="number"]').forEach(inp => {
    const num = parseFloat((inp.value || '').replace(',', '.'));
    if (isNaN(num)) return;
    const label = (inp.closest('tr')?.cells?.[0]?.textContent || '').toLowerCase().trim();
    if (!label) return;
    for (const [cle, crit] of Object.entries(VALEURS_CRITIQUES)) {
      const cLabel = crit.label.toLowerCase();
      const matched = label === cle || label === cLabel
        || label.startsWith(cle + ' ') || label.startsWith(cle + '(')
        || label.startsWith(cLabel + ' ') || label.startsWith(cLabel + '(');
      if (!matched) continue;
      if (num < crit.min || num > crit.max) {
        alerts.push({ label: crit.label, valeur: num, unite: crit.unite, sens: num < crit.min ? 'bas' : 'élevé' });
      }
      break;
    }
  });
  if (alerts.length) {
    box.innerHTML = '🔴 <strong>VALEUR' + (alerts.length > 1 ? 'S' : '') + ' CRITIQUE' + (alerts.length > 1 ? 'S' : '') + ' détectée' + (alerts.length > 1 ? 's' : '') + ' :</strong> '
      + alerts.map(a => `${esc(a.label)} = ${a.valeur} ${esc(a.unite)} (${a.sens})`).join(' · ');
    box.style.display = 'block';
  } else {
    box.style.display = 'none';
    box.innerHTML = '';
  }
}
// Écoute déléguée : toute saisie numérique dans la zone de saisie déclenche le contrôle
document.addEventListener('input', e => {
  if (e.target && e.target.matches && e.target.matches('#zone-saisie input[type="number"]')) checkCriticalLive();
});

// ── FEATURE 10 : notifications + badge de navigation ──────────────
async function requestNotifPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch (e) {}
  }
}
function notifyResultatPret(record) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const p = record?.patient || {};
  const icon = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#0b2545"/><text x="32" y="42" font-size="32" text-anchor="middle" fill="#fff">✓</text></svg>');
  try {
    new Notification('✅ Résultat prêt — CPMI Grand-Bassam', {
      body: `${p.nom || 'Patient'} — Dossier ${p.dossier || '—'}`,
      icon, tag: 'resultat-' + record.id,
    });
  } catch (e) { /* navigateurs restreignant les notifications hors contexte HTTPS */ }
}
function updateHistoriqueBadge() {
  const badge = document.getElementById('hist-badge');
  if (!badge) return;
  const n = (getDB() || []).filter(r => getStatut(r.id) === 'attente').length;
  if (n > 0) { badge.textContent = n; badge.style.display = ''; }
  else { badge.style.display = 'none'; }
}

// ── FEATURE 9 : rafraîchissement automatique du jeton ─────────────
let _tokenRefreshInterval = null;
function setToken(newToken) {
  if (!newToken || !_currentUser) return;
  _currentUser.token = newToken;
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(_currentUser)); } catch (e) {}
}
function startTokenRefresh() {
  clearInterval(_tokenRefreshInterval);
  _tokenRefreshInterval = setInterval(async () => {
    if (!TK()) return;
    try {
      const { data, error } = await _sb.rpc('refresh_token', { p_token: TK() });
      if (error || !data?.token) {
        clearInterval(_tokenRefreshInterval);
        toast('⏱ Session expirée — reconnexion requise', 'error');
        setTimeout(() => { doLogout(); }, 2000);
        return;
      }
      setToken(data.token);
    } catch (e) { console.warn('[LaboSaisie] refresh_token:', e); }
  }, 20 * 60 * 1000); // toutes les 20 minutes
}
function stopTokenRefresh() {
  clearInterval(_tokenRefreshInterval);
  _tokenRefreshInterval = null;
}

// ── FEATURE 8 : changement de mot de passe à la première connexion ─
async function checkFirstLogin() {
  if (!_sb || !TK()) return;
  try {
    const { data, error } = await _sb.rpc('check_first_login', { p_token: TK() });
    if (error) return;
    const first = Array.isArray(data) ? data[0]?.first_login : data?.first_login;
    if (first === true) {
      const modal = document.getElementById('first-login-modal');
      if (modal) modal.style.display = 'flex';
    }
  } catch (e) { /* RPC absente → ignorer */ }
}
async function submitFirstLoginPassword() {
  const oldEl = document.getElementById('fl_old');
  const newEl = document.getElementById('fl_new');
  const confEl = document.getElementById('fl_confirm');
  const errEl = document.getElementById('fl-error');
  errEl.textContent = '';
  const oldPwd = oldEl.value, newPwd = newEl.value, conf = confEl.value;
  if (newPwd.length < 8) { errEl.textContent = 'Le mot de passe doit contenir au moins 8 caractères.'; return; }
  if (!/\d/.test(newPwd)) { errEl.textContent = 'Le mot de passe doit contenir au moins 1 chiffre.'; return; }
  if (newPwd !== conf) { errEl.textContent = 'Les deux mots de passe ne correspondent pas.'; return; }
  try {
    const { data, error } = await _sb.rpc('change_password', { p_token: TK(), p_old_password: oldPwd, p_new_password: newPwd });
    const ok = !error && (data === true || data?.success === true || (Array.isArray(data) ? data[0]?.success : false) || data === 'ok');
    if (error || !ok) { errEl.textContent = (error?.message) || 'Ancien mot de passe incorrect.'; return; }
    document.getElementById('first-login-modal').style.display = 'none';
    oldEl.value = newEl.value = confEl.value = '';
    toast('Mot de passe modifié ✓', 'ok');
  } catch (e) { errEl.textContent = 'Erreur : ' + (e.message || 'inconnue'); }
}

// ── FEATURE 5 : tableau de bord Caisse ────────────────────────────
// ✅ v13.108 — Défaut aligné sur les autres vues (« ce mois ») : la période
// est désormais commune à l'Historique, la Caisse et les Statistiques.
let _caissePeriode = 'mois';
let _caisseChart = null;
// ✅ v13.73 — décalage temporel de la Caisse (voir js/periode-nav.js)
let _caisseDecalage = 0;

function setCaissePeriode(p, garderDecalage) {
  // ✅ v13.108 — Période commune aux trois vues. Pour une plage libre, on lit
  // les champs de dates de la Caisse et on les propage aux autres onglets.
  if (p === 'custom') {
    const from = document.getElementById('caisse-date-from')?.value || '';
    const to   = document.getElementById('caisse-date-to')?.value   || '';
    appliquerPeriodePartout('custom', 0, from, to);
  } else {
    const dec = garderDecalage ? _caisseDecalage : 0;
    appliquerPeriodePartout(p, dec);
  }
  renderCaisse();
}

function decalerCaisse(pas) {
  if (!['jour','semaine','mois'].includes(_caissePeriode)) return;
  if (_caisseDecalage + pas > 0) return;      // pas de futur
  _caisseDecalage += pas;
  setCaissePeriode(_caissePeriode, true);
}

function retourCaisseCourante() {
  _caisseDecalage = 0;
  setCaissePeriode(_caissePeriode, true);
}

function allerAuMoisCaisse() {
  const d = decalageDepuisSelecteurs('caisse');
  if (d === null) { majBandeauPeriode('caisse', _caissePeriode, _caisseDecalage); return; }
  _caissePeriode = 'mois';
  _caisseDecalage = d;
  setCaissePeriode('mois', true);
}

function getCaisseRange() {
  if (_caissePeriode === 'custom') {
    return {
      from: document.getElementById('caisse-date-from')?.value || '',
      to:   document.getElementById('caisse-date-to')?.value || '',
    };
  }
  // ✅ v13.108 — La Caisse peut désormais recevoir « tout » (période commune) :
  // aucune borne de date, on montre l'ensemble.
  if (_caissePeriode === 'tout') return { from: '', to: '' };
  return calcPlagePeriode(_caissePeriode || 'mois', _caisseDecalage);
}
async function renderCaisse() {
  await refreshDB();
  updateVerrouilleeBtn(); // ✅ v13.32 — bouton admin fiches verrouillées
  // ✅ v13.33 — Brancher selon le rôle : agent → vue simplifiée, admin/caissier → caisse complète
  // ✅ v13.122 — Sauf si l'agent fait la caisse (aucun caissier) → caisse complète.
  if (!isAdmin() && !isCaissier() && !isSpectateur() && !(typeof peutEncaisser === 'function' && peutEncaisser())) {
    // La clôture est un document de caisse : elle n'a rien à faire dans la
    // vue simplifiée d'un agent, qui ne tient pas le tiroir.
    const carte = document.getElementById('cloture-card');
    if (carte) carte.style.display = 'none';
    renderUserCaisse(); return;
  }
  // ✅ v13.84 — Aperçu de la clôture du jour, recalculé à chaque ouverture.
  if (typeof renderCloture === 'function') renderCloture();
  const db = getCalcDB(); // exclut les fiches verrouillées selon le choix admin
  const { from, to } = getCaisseRange();
  const rows = filterByDateRange(db, from, to);
  const labelEl = document.getElementById('caisse-periode-label');
  if (labelEl) labelEl.textContent = (from || '…') + ' → ' + (to || '…');

  const total = rows.reduce((s, r) => s + (r.montant || 0), 0);
  const nb = rows.length;
  const moy = nb ? Math.round(total / nb) : 0;
  const attente = rows.filter(r => getStatut(r.id) === 'attente').length;
  // ✅ v13.33 — Compte-à-rebours animé sur les KPI
  animateCount(document.getElementById('caisse-kpi-total'),   total,   700, true);
  animateCount(document.getElementById('caisse-kpi-nb'),      nb,      500, false);
  animateCount(document.getElementById('caisse-kpi-moy'),     moy,     600, true);
  animateCount(document.getElementById('caisse-kpi-attente'), attente, 400, false);
  renderCaisseAEncaisser(); // ✅ v13.35
  renderCaisseMonnaie();    // ✅ v13.36 — monnaie à rendre

  // Recettes par jour
  const parJour = {};
  rows.forEach(r => { const d = _recDate(r); if (d) parJour[d] = (parJour[d] || 0) + (r.montant || 0); });
  const jours = Object.keys(parJour).sort();
  const canvas = document.getElementById('caisse-chart-jour');
  if (_caisseChart) { try { _caisseChart.destroy(); } catch (e) {} _caisseChart = null; }
  if (canvas && typeof Chart !== 'undefined') {
    _caisseChart = new Chart(canvas, {
      type: 'bar',
      data: { labels: jours.map(j => j.slice(5)), datasets: [{ label: 'FCFA', data: jours.map(j => parJour[j]), backgroundColor: 'rgba(21,128,61,.75)', borderColor: '#15803d', borderWidth: 1, borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + _fmtF(c.raw) + ' FCFA' } } }, scales: { y: { beginAtZero: true, ticks: { font: { size: 10 }, callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v } }, x: { ticks: { font: { size: 10 } } } } }
    });
  }

  // Répartition par type
  const byType = {};
  TYPES_ANALYSES.forEach(t => byType[t] = { nb: 0, total: 0 });
  rows.forEach(r => {
    const types = isDossierRecord(r) ? (r.resultats?._types || []) : [r.type];
    const montants = r.resultats?._montants || null;
    types.forEach(t => {
      if (!byType[t]) byType[t] = { nb: 0, total: 0 };
      byType[t].nb++;
      byType[t].total += montants ? (Number(montants[t]) || 0) : (types.length === 1 ? (r.montant || 0) : 0);
    });
  });
  const tbodyT = document.getElementById('caisse-type-body');
  if (tbodyT) {
    const entries = Object.entries(byType).filter(([, v]) => v.nb > 0).sort((a, b) => b[1].total - a[1].total);
    tbodyT.innerHTML = entries.length ? entries.map(([t, v]) =>
      `<tr><td>${esc(t)}</td><td style="text-align:center">${v.nb}</td><td style="text-align:right">${_fmtF(v.total)}</td><td style="text-align:right">${total ? Math.round(v.total / total * 100) : 0}%</td></tr>`
    ).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Aucune donnée</td></tr>';
  }

  // Top 5 prescripteurs
  const byPresc = {};
  rows.forEach(r => {
    const pid = r.prescripteur_id;
    const nom = (_prescripteurs.find(p => Number(p.id) === Number(pid))?.nom) || r.patient?.medecin || 'Inconnu';
    if (!byPresc[nom]) byPresc[nom] = { nb: 0, total: 0 };
    byPresc[nom].nb++;
    byPresc[nom].total += (r.montant || 0);
  });
  const topPresc = Object.entries(byPresc).sort((a, b) => b[1].nb - a[1].nb).slice(0, 5);
  const tbodyP = document.getElementById('caisse-top-presc-body');
  if (tbodyP) {
    tbodyP.innerHTML = topPresc.length ? topPresc.map(([nom, v], i) =>
      `<tr><td>${i + 1}</td><td>${esc(nom)}</td><td style="text-align:center">${v.nb}</td><td style="text-align:right">${_fmtF(v.total)}</td></tr>`
    ).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Aucune donnée</td></tr>';
  }

  populateMoisAnneeSelectors();
  renderRistournesMois();
}

// ── FEATURE 7 (v13.33) : Vue Caisse simplifiée pour utilisateurs non-admin ──────────
let _uCaissePeriode = 'jour';
let _uCaisseChart   = null;

// ✅ v13.73 — décalage temporel de la caisse personnelle
let _uCaisseDecalage = 0;

function setUCaissePeriode(p, garderDecalage) {
  if (!garderDecalage) _uCaisseDecalage = 0;
  _uCaissePeriode = p;
  ['jour','semaine','mois'].forEach(k => {
    const b = document.getElementById('ucaisse-btn-' + k);
    if (b) b.classList.toggle('active', k === p);
  });
  if (p !== 'custom') synchroniserChampsDate('ucaisse', p, _uCaisseDecalage);
  majBandeauPeriode('ucaisse', _uCaissePeriode, _uCaisseDecalage);
  renderUserCaisse();
}

function decalerUCaisse(pas) {
  if (!['jour','semaine','mois'].includes(_uCaissePeriode)) return;
  if (_uCaisseDecalage + pas > 0) return;
  _uCaisseDecalage += pas;
  setUCaissePeriode(_uCaissePeriode, true);
}

function retourUCaisseCourante() {
  _uCaisseDecalage = 0;
  setUCaissePeriode(_uCaissePeriode, true);
}

function allerAuMoisUCaisse() {
  const d = decalageDepuisSelecteurs('ucaisse');
  if (d === null) { majBandeauPeriode('ucaisse', _uCaissePeriode, _uCaisseDecalage); return; }
  _uCaissePeriode = 'mois';
  _uCaisseDecalage = d;
  setUCaissePeriode('mois', true);
}

function getUCaisseRange() {
  if (_uCaissePeriode === 'custom') {
    return {
      from: document.getElementById('ucaisse-date-from')?.value || '',
      to:   document.getElementById('ucaisse-date-to')?.value || '',
    };
  }
  return calcPlagePeriode(_uCaissePeriode || 'jour', _uCaisseDecalage);
}

function populateUCaisseMoisAnnee() {
  const now  = new Date();
  const y    = now.getFullYear();
  const annees = [y, y - 1, y - 2];
  const mEl = document.getElementById('ucaisse-rist-mois');
  const aEl = document.getElementById('ucaisse-rist-annee');
  if (mEl && !mEl.dataset.filled) {
    mEl.innerHTML = MOIS_FR.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
    mEl.value = now.getMonth() + 1;
    mEl.dataset.filled = '1';
  }
  if (aEl && !aEl.dataset.filled) {
    aEl.innerHTML = annees.map(a => `<option value="${a}">${a}</option>`).join('');
    aEl.value = y;
    aEl.dataset.filled = '1';
  }
}

function renderUCaisseRistournes() {
  majLibelleSelecteursMois('ucaisse-rist-mois', 'ucaisse-rist-annee');
  const el = document.getElementById('ucaisse-rist-table');
  if (!el) return;
  const mois  = parseInt(document.getElementById('ucaisse-rist-mois')?.value  || (new Date().getMonth() + 1));
  const annee = parseInt(document.getElementById('ucaisse-rist-annee')?.value || new Date().getFullYear());
  // Réutiliser computeRistournesData qui filtre déjà par getCalcDB() (qui filtre par uid)
  const rows = computeRistournesData(mois, annee);
  if (!rows.length) {
    el.innerHTML = `<p style="font-size:12px;color:var(--text-muted)">Aucune ristourne pour ${MOIS_FR[mois - 1]} ${annee}.</p>`;
    return;
  }
  const totalRist = rows.reduce((s, r) => s + r.ristourne, 0);
  el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="background:var(--accent-light)">
      <th style="padding:5px 8px;text-align:left">Prescripteur</th>
      <th style="padding:5px 8px;text-align:center">Dossiers</th>
      <th style="padding:5px 8px;text-align:right">Montant</th>
      <th style="padding:5px 8px;text-align:right">Taux</th>
      <th style="padding:5px 8px;text-align:right">Ristourne</th>
    </tr></thead>
    <tbody>${rows.map(d => `<tr>
      <td style="padding:5px 8px">${esc(d.presc.nom)}</td>
      <td style="padding:5px 8px;text-align:center">${d.nbExtraBPN}</td>
      <td style="padding:5px 8px;text-align:right">${_fmtF(d.montantBrut)}</td>
      <td style="padding:5px 8px;text-align:right">${d.taux}%</td>
      <td style="padding:5px 8px;text-align:right;font-weight:600;color:var(--success)">${_fmtF(d.ristourne)}</td>
    </tr>`).join('')}</tbody>
    <tfoot><tr style="border-top:2px solid var(--border)">
      <td colspan="4" style="padding:6px 8px;font-weight:700;font-size:12.5px">Total ristournes</td>
      <td style="padding:6px 8px;text-align:right;font-weight:700;color:var(--success);font-size:13px">${_fmtF(totalRist)}</td>
    </tr></tfoot>
  </table>`;
}

function renderUserCaisse() {
  const db = getCalcDB(); // filtre par uid automatiquement pour non-admin
  const { from, to } = getUCaisseRange();
  const rows = filterByDateRange(db, from, to);

  // Libellé période
  const labelEl = document.getElementById('ucaisse-periode-label');
  if (labelEl) labelEl.textContent = (from || '…') + ' → ' + (to || '…');

  // KPI avec compte-à-rebours animé ✅ v13.33
  const total   = rows.reduce((s, r) => s + (r.montant || 0), 0);
  const nb      = rows.length;
  const moy     = nb ? Math.round(total / nb) : 0;
  const attente = rows.filter(r => getStatut(r.id) === 'attente').length;
  animateCount(document.getElementById('ucaisse-kpi-total'),   total,   700, true);
  animateCount(document.getElementById('ucaisse-kpi-nb'),      nb,      500, false);
  animateCount(document.getElementById('ucaisse-kpi-moy'),     moy,     600, true);
  animateCount(document.getElementById('ucaisse-kpi-attente'), attente, 400, false);

  // Graphique recettes par jour
  const parJour = {};
  rows.forEach(r => { const d = _recDate(r); if (d) parJour[d] = (parJour[d] || 0) + (r.montant || 0); });
  const jours = Object.keys(parJour).sort();
  const canvas = document.getElementById('ucaisse-chart-jour');
  if (_uCaisseChart) { try { _uCaisseChart.destroy(); } catch (e) {} _uCaisseChart = null; }
  if (canvas && typeof Chart !== 'undefined') {
    _uCaisseChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: jours.map(j => j.slice(5)),
        datasets: [{ label: 'FCFA', data: jours.map(j => parJour[j]), backgroundColor: 'rgba(21,128,61,.75)', borderColor: '#15803d', borderWidth: 1, borderRadius: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + _fmtF(c.raw) + ' FCFA' } } },
        scales: {
          y: { beginAtZero: true, ticks: { font: { size: 10 }, callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v } },
          x: { ticks: { font: { size: 10 } } }
        }
      }
    });
  }

  // Répartition par type d'examen
  const byType = {};
  TYPES_ANALYSES.forEach(t => byType[t] = { nb: 0, total: 0 });
  rows.forEach(r => {
    const types = isDossierRecord(r) ? (r.resultats?._types || []) : [r.type];
    const montants = r.resultats?._montants || null;
    types.forEach(t => {
      if (!byType[t]) byType[t] = { nb: 0, total: 0 };
      byType[t].nb++;
      byType[t].total += montants ? (Number(montants[t]) || 0) : (types.length === 1 ? (r.montant || 0) : 0);
    });
  });
  const tbodyT = document.getElementById('ucaisse-type-body');
  if (tbodyT) {
    const entries = Object.entries(byType).filter(([, v]) => v.nb > 0).sort((a, b) => b[1].total - a[1].total);
    tbodyT.innerHTML = entries.length
      ? entries.map(([t, v]) => `<tr>
          <td>${esc(t)}</td>
          <td style="text-align:center">${v.nb}</td>
          <td style="text-align:right">${_fmtF(v.total)}</td>
          <td style="text-align:right">${total ? Math.round(v.total / total * 100) : 0}%</td>
        </tr>`).join('')
      : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Aucune donnée</td></tr>';
  }

  // Ristournes
  populateUCaisseMoisAnnee();
  renderUCaisseRistournes();
}

// ── FEATURE 6 : ristournes mensuelles + export PDF/Excel ──────────
const RISTOURNE_TAUX_KEY = 'ristourne_taux_override';
function getRistourneOverrides() { try { return JSON.parse(localStorage.getItem(RISTOURNE_TAUX_KEY) || '{}'); } catch (e) { return {}; } }
function tauxFor(presc) {
  // ✅ v13.29 — priorité à la valeur en base (_prescripteurs déjà chargé depuis DB)
  // Le localStorage n'est plus la source de vérité ; on l'ignore si la base est disponible.
  if (_prescripteurs.length) return Number(presc.taux_ristourne) || 0;
  const ov = getRistourneOverrides(); // fallback hors-ligne uniquement
  if (ov[presc.id] !== undefined) return Number(ov[presc.id]) || 0;
  return Number(presc.taux_ristourne) || 0;
}
function populateMoisAnneeSelectors() {
  // ✅ v13.74 — après remplissage, synchroniser les libellés des flèches.
  setTimeout(() => {
    majLibelleSelecteursMois('rist-mois', 'rist-annee');
    majLibelleSelecteursMois('rapport-mois', 'rapport-annee');
  }, 0);
  const now = new Date();
  const y = now.getFullYear();
  const annees = [y, y - 1, y - 2];
  [['rist-mois', 'rist-annee'], ['rapport-mois', 'rapport-annee']].forEach(([mId, aId]) => {
    const mEl = document.getElementById(mId), aEl = document.getElementById(aId);
    if (mEl && !mEl.dataset.filled) { mEl.innerHTML = MOIS_FR.map((m, i) => `<option value="${i + 1}">${m}</option>`).join(''); mEl.value = now.getMonth() + 1; mEl.dataset.filled = '1'; }
    if (aEl && !aEl.dataset.filled) { aEl.innerHTML = annees.map(a => `<option value="${a}">${a}</option>`).join(''); aEl.value = y; aEl.dataset.filled = '1'; }
  });
}
function computeRistournesData(mois, annee) {
  const prefix = annee + '-' + String(mois).padStart(2, '0');
  const db = getCalcDB(); // ✅ v13.30 — exclut les fiches verrouillées des ristournes
  // ✅ v13.29 — même règle que Statistiques : 0 % sur les BPN
  const isBpn = r => r.est_bpn
    || getRecordTypes(r).includes('Bilan prénatal')
    || Object.values(r.resultats?._examens_coches || {}).flat().includes('Bilan prénatal complet (forfait)');
  return (_prescripteurs || []).map(presc => {
    const fiches    = db.filter(r => Number(r.prescripteur_id) === Number(presc.id) && _recDate(r).startsWith(prefix));
    const bpn       = fiches.filter(r => isBpn(r));
    const extraBPN  = fiches.filter(r => !isBpn(r));
    const montantBrut = extraBPN.reduce((s, r) => s + (r.montant || 0), 0); // base hors-BPN
    const taux      = tauxFor(presc);
    const ristourne = Math.round(montantBrut * taux / 100);
    return { presc, nb: fiches.length, nbBpn: bpn.length, nbExtraBPN: extraBPN.length, montantBrut, taux, ristourne };
  }).filter(r => r.nb > 0);
}
function renderRistournesMois() {
  majLibelleSelecteursMois('rist-mois', 'rist-annee');
  const el = document.getElementById('rist-mois-table');
  if (!el) return;
  const mois = parseInt(document.getElementById('rist-mois')?.value || (new Date().getMonth() + 1));
  const annee = parseInt(document.getElementById('rist-annee')?.value || new Date().getFullYear());
  const rows = computeRistournesData(mois, annee);
  if (!rows.length) { el.innerHTML = '<p style="font-size:12.5px;color:var(--text-muted)">Aucune activité prescripteur pour ' + MOIS_FR[mois - 1] + ' ' + annee + '.</p>'; return; }
  el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12.5px">
    <thead><tr style="background:var(--bg)">
      <th style="padding:8px;text-align:left;border-bottom:1px solid var(--border)">Prescripteur</th>
      <th style="padding:8px;text-align:center;border-bottom:1px solid var(--border)">Nb dossiers</th>
      <th style="padding:8px;text-align:right;border-bottom:1px solid var(--border)">Montant brut</th>
      <th style="padding:8px;text-align:center;border-bottom:1px solid var(--border)">Taux (%)</th>
      <th style="padding:8px;text-align:right;border-bottom:1px solid var(--border);color:#15803d">Ristourne</th>
    </tr></thead><tbody>
      ${rows.map(r => `<tr>
        <td style="padding:7px 8px;border-bottom:1px solid var(--border);font-weight:600">${esc(r.presc.nom)}</td>
        <td style="padding:7px 8px;text-align:center;border-bottom:1px solid var(--border)">${r.nb}</td>
        <td style="padding:7px 8px;text-align:right;border-bottom:1px solid var(--border)">${_fmtF(r.montantBrut)} F</td>
        <td style="padding:7px 8px;text-align:center;border-bottom:1px solid var(--border)"><input type="number" id="rist_taux_${r.presc.id}" value="${r.taux}" min="0" max="100" step="0.5" style="width:70px;padding:3px 6px;font-size:12px" onchange="_previewRistourne(${r.presc.id},${r.montantBrut})"></td>
        <td id="rist_val_${r.presc.id}" style="padding:7px 8px;text-align:right;border-bottom:1px solid var(--border);font-weight:700;color:#15803d">${_fmtF(r.ristourne)} F</td>
      </tr>`).join('')}
      <tr style="background:var(--bg)"><td colspan="4" style="padding:8px;font-weight:700;text-align:right">Total ristournes :</td>
      <td id="rist-total-cell" style="padding:8px;font-weight:800;color:#15803d;text-align:right">${_fmtF(rows.reduce((s, r) => s + r.ristourne, 0))} FCFA</td></tr>
    </tbody></table>`;
}
function _previewRistourne(id, brut) {
  const taux = Number(document.getElementById('rist_taux_' + id)?.value) || 0;
  const cell = document.getElementById('rist_val_' + id);
  if (cell) cell.textContent = _fmtF(Math.round(brut * taux / 100)) + ' F';
}
async function saveRistourneTaux() {
  if (!isAdmin()) { toast('Action réservée aux administrateurs', 'err'); return; }
  showLoading('Enregistrement des taux…');
  let errCount = 0;
  for (const p of (_prescripteurs || [])) {
    const inp = document.getElementById('rist_taux_' + p.id);
    if (!inp) continue;
    const nouveauTaux = Number(inp.value) || 0;
    if (nouveauTaux === (p.taux_ristourne || 0)) continue; // pas de changement
    // ✅ v13.29 — persister en base via RPC (synchronise Statistiques + Caisse)
    const { data, error } = await _sb.rpc('update_prescripteur_admin', {
      p_token: TK(), p_id: p.id,
      p_nom: p.nom, p_specialite: p.specialite || '',
      p_structure: p.structure || '', p_taux_ristourne: nouveauTaux,
    });
    if (error || (data && data !== 'ok')) { errCount++; }
    else { p.taux_ristourne = nouveauTaux; } // mise à jour locale immédiate
  }
  // Supprimer les surcharges localStorage obsolètes (source de divergence)
  localStorage.removeItem(RISTOURNE_TAUX_KEY);
  hideLoading();
  if (errCount) {
    toast('⚠ ' + errCount + ' taux non enregistré(s) — vérifiez la connexion', 'err');
  } else {
    toast('Taux de ristourne enregistrés en base ✓', 'ok');
  }
  renderRistournesMois();
}
// ✅ v13.35 — Code ristournes PDF/Excel déplacé dans print.js

