// ============================================================
//  PAILLASSE — plusieurs dossiers ouverts simultanément (v13.117)
//
//  Permet d'ouvrir plusieurs patients en même temps et de remplir
//  leurs résultats au fur et à mesure, en basculant de l'un à l'autre
//  sans rien perdre. Chaque patient ouvert est un « instantané » du
//  formulaire (identité + examens cochés + valeurs saisies). Une barre
//  de pastilles en haut de la vue Saisie permet de changer de patient.
//
//  Phase 1 : uniquement des saisies NEUVES (pas l'édition d'un dossier
//  déjà en base). L'enregistrement passe par saveRecordAllFresh().
// ============================================================

const PAILLASSE_IDENT = ['p_nom','p_dossier','p_date','p_age','p_ddn','p_sexe',
                         'p_medecin','p_service','p_clinique','p_telephone','p_prescripteur_id'];

let _bench = [];             // [{key, label, ident:{}, coches:{}, values:{}, montant:{}}]
let _benchActiveKey = null;  // clé du patient actuellement affiché
let _benchSeq = 1;           // compteur de clés locales

// La paillasse est réservée aux profils qui saisissent réellement.
function benchEnabled() {
  if (typeof isSpectateur === 'function' && isSpectateur()) return false;
  if (typeof isCaissier === 'function' && isCaissier()) return false;
  return true;
}

// ── Capture de l'état courant du formulaire ─────────────────
function benchSnapshot() {
  const ident = {};
  PAILLASSE_IDENT.forEach(id => { const el = document.getElementById(id); if (el) ident[id] = el.value; });

  const coches = {};
  try {
    getCatalogueComplet().forEach(ex => {
      const c = document.getElementById(ex.id);
      const px = document.getElementById('px_' + ex.id);
      if (c) coches[ex.id] = { c: c.checked, prix: px ? px.value : '' };
    });
  } catch (e) {}

  const values = {};
  document.querySelectorAll('#zone-saisie input, #zone-saisie select, #zone-saisie textarea').forEach(el => {
    if (!el.id) return;
    if (el.type === 'checkbox' || el.type === 'radio') return; // les coches sont gérées à part
    values[el.id] = el.value;
  });

  const mp = document.getElementById('montant-preview');
  const montant = {
    m:      mp?.dataset?.montant || '',
    parTab: mp?.dataset?.montantParTab || '{}',
    txt:    mp?.textContent || '',
  };
  return { ident, coches, values, montant };
}

// ── Application d'un instantané au formulaire + vue empilée ──
function benchApply(entry) {
  PAILLASSE_IDENT.forEach(id => {
    const el = document.getElementById(id);
    if (el && (id in entry.ident)) el.value = entry.ident[id];
  });
  try {
    getCatalogueComplet().forEach(ex => {
      const c = document.getElementById(ex.id);
      const px = document.getElementById('px_' + ex.id);
      const s = entry.coches[ex.id];
      if (c && s) c.checked = !!s.c;
      if (px && s) px.value = s.prix;
    });
  } catch (e) {}
  if (typeof calcFicheTotal === 'function') calcFicheTotal();

  const mp = document.getElementById('montant-preview');
  if (mp && entry.montant) {
    mp.dataset.montant = entry.montant.m;
    mp.dataset.montantParTab = entry.montant.parTab;
    if (entry.montant.txt) mp.textContent = entry.montant.txt;
  }

  document.getElementById('fiche-identification').style.display = 'none';
  document.getElementById('zone-saisie').style.display = '';

  // Reconstruit les panneaux et masque les examens non cochés.
  if (typeof _editingRecordId !== 'undefined') _editingRecordId = null; // Phase 1 : saisie neuve
  if (typeof enterFillAllFresh === 'function') enterFillAllFresh();

  // Réinjecte les valeurs de résultats APRÈS reconstruction des panneaux.
  Object.keys(entry.values).forEach(fid => {
    const el = document.getElementById(fid);
    if (el) el.value = entry.values[fid];
  });
  // Rafraîchit les interprétations (Bas/Élevé) et surlignages.
  ['Hématologie','Biochimie','Immuno-Sérologie','Groupe sanguin','Parasitologie'].forEach(t => {
    try { if (typeof ensureInterpFresh === 'function') ensureInterpFresh(t); } catch (e) {}
  });

  // Rappel patient
  const rappelNom  = document.getElementById('rappel-nom');
  const rappelDoss = document.getElementById('rappel-dossier');
  if (rappelNom)  rappelNom.textContent  = (entry.ident.p_nom || '').toUpperCase();
  if (rappelDoss) rappelDoss.textContent = 'N° ' + (entry.ident.p_dossier || '');
}

// ── Mémorise le patient actif depuis le formulaire ──────────
function benchStoreActiveFromForm() {
  if (_benchActiveKey == null) return;
  const e = _bench.find(x => x.key === _benchActiveKey);
  if (!e) return;
  Object.assign(e, benchSnapshot());
  e.label = (document.getElementById('p_nom')?.value || e.label || '').trim();
}

// ── Appelé à « Démarrer la saisie » : enregistre/actualise le
//    patient actif dans la paillasse ──────────────────────────
function benchCommitOnDemarrer() {
  if (!benchEnabled()) return;
  const snap = benchSnapshot();
  const label = (document.getElementById('p_nom')?.value || '').trim();
  if (_benchActiveKey != null) {
    const e = _bench.find(x => x.key === _benchActiveKey);
    if (e) { Object.assign(e, snap); e.label = label || e.label; benchRenderBar(); return; }
  }
  const key = _benchSeq++;
  _bench.push({ key, label: label || ('Patient ' + key), ...snap });
  _benchActiveKey = key;
  benchRenderBar();
}

// ── Basculer vers un autre patient ouvert ───────────────────
function benchGo(key) {
  if (key === _benchActiveKey) return;
  benchStoreActiveFromForm();
  const e = _bench.find(x => x.key === key);
  if (!e) return;
  _benchActiveKey = key;
  benchApply(e);
  benchRenderBar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Ajouter un nouveau patient à la paillasse ───────────────
async function benchNewPatient() {
  if (!benchEnabled()) { toast('Action non disponible pour ce profil', 'err'); return; }
  benchStoreActiveFromForm();
  _benchActiveKey = null;
  // Repartir sur une fiche vierge SANS confirmation ni perte des autres patients.
  if (typeof resetFicheIdentif === 'function') await resetFicheIdentif();
  // Numéro de dossier sans collision avec les patients déjà ouverts.
  const dossEl = document.getElementById('p_dossier');
  if (dossEl && typeof getNextDossierNum === 'function' && typeof formatDossier === 'function') {
    try {
      let n = await getNextDossierNum();
      const used = new Set(_bench.map(x => x.ident?.p_dossier).filter(Boolean));
      while (used.has(formatDossier(n))) n++;
      dossEl.value = formatDossier(n);
    } catch (e) {}
  }
  benchRenderBar();
  toast('Nouveau patient — remplissez la fiche puis « Démarrer la saisie »', 'ok');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Fermer un patient ouvert (sans enregistrer) ─────────────
async function benchClose(key) {
  const e = _bench.find(x => x.key === key);
  if (!e) return;
  const aDesResultats = e.values && Object.values(e.values).some(v => v && String(v).trim() !== '');
  if (aDesResultats && typeof showConfirmModal === 'function') {
    const ok = await showConfirmModal({
      icon: '✖️', title: 'Fermer sans enregistrer ?',
      message: 'Les résultats saisis pour <strong>' + esc(e.label || '') + '</strong> et non enregistrés seront perdus.',
      confirmText: 'Fermer', cancelText: 'Annuler', confirmClass: 'btn-danger'
    });
    if (!ok) return;
  }
  _bench = _bench.filter(x => x.key !== key);
  if (_benchActiveKey === key) {
    _benchActiveKey = null;
    if (_bench.length) { const nx = _bench[0]; _benchActiveKey = nx.key; benchApply(nx); }
    else if (typeof resetFicheIdentif === 'function') { await resetFicheIdentif(); }
  }
  benchRenderBar();
}

// ── Après un enregistrement réussi : retirer le patient actif
//    et basculer vers le suivant s'il en reste. Renvoie true si
//    un autre patient a été chargé (l'appelant NE réinitialise pas). ─
function benchAfterSave() {
  if (_benchActiveKey == null) return false;
  _bench = _bench.filter(x => x.key !== _benchActiveKey);
  _benchActiveKey = null;
  benchRenderBar();
  if (_bench.length) {
    const nx = _bench[0];
    _benchActiveKey = nx.key;
    benchApply(nx);
    benchRenderBar();
    toast('Patient enregistré — passage à ' + (nx.label || 'suivant'), 'ok');
    return true;
  }
  return false;
}

// ── Rendu de la barre de pastilles ──────────────────────────
function benchRenderBar() {
  const bar = document.getElementById('paillasse-bar');
  const chips = document.getElementById('paillasse-chips');
  if (!bar || !chips) return;
  if (!benchEnabled() || _bench.length === 0) { bar.style.display = 'none'; chips.innerHTML = ''; return; }
  bar.style.display = 'flex';
  chips.innerHTML = _bench.map(e => {
    const actif = e.key === _benchActiveKey;
    const nom = esc((e.label || 'Patient').trim() || 'Patient');
    const doss = esc(e.ident?.p_dossier || '');
    return '<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 6px 5px 11px;border-radius:99px;font-size:12px;font-weight:600;cursor:pointer;'
      + (actif ? 'background:var(--cpmi-deep);color:#fff' : 'background:var(--accent-light);color:var(--cpmi-deep);border:1px solid var(--border)') + '" '
      + 'onclick="benchGo(' + e.key + ')" title="Basculer vers ' + nom + '">'
      + nom + (doss ? ' <span style="opacity:.7;font-weight:500">· ' + doss + '</span>' : '')
      + '<button onclick="event.stopPropagation();benchClose(' + e.key + ')" title="Fermer" '
      + 'style="border:none;background:' + (actif ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.06)') + ';color:inherit;'
      + 'width:18px;height:18px;border-radius:99px;cursor:pointer;font-size:12px;line-height:1;display:inline-flex;align-items:center;justify-content:center">✕</button>'
      + '</span>';
  }).join('');
}

// Réinitialiser complètement la paillasse (changement d'utilisateur, etc.)
function benchReset() {
  _bench = [];
  _benchActiveKey = null;
  benchRenderBar();
}
