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
// ✅ v13.140 — PAILLASSE DÉSACTIVÉE (décision validée).
// La paillasse et la grille « saisie en série » partageaient le MÊME formulaire
// caché (#zone-saisie). Ce couplage est la cause de fond des pertes de valeurs
// et des contaminations entre patients. La grille unifiée (une ligne par
// patient, tous ses examens) remplit le même besoin avec UNE seule écriture
// atomique par patient, sans état partagé.
// Les fonctions sont conservées (points d'appel existants) mais neutralisées :
// benchRenderBar ne rend plus aucune pastille, et l'ouverture d'un dossier
// depuis l'historique passe directement par l'éditeur « tout sur une page ».
// La bannière de complétude (benchRenderReadyBanner) reste active : elle sert
// à la saisie simple, pas à la paillasse.
const PAILLASSE_ACTIVE = false;

function benchEnabled() {
  if (!PAILLASSE_ACTIVE) return false;
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
  if (typeof _editingRecordId !== 'undefined') _editingRecordId = null;
  if (typeof enterFillAllFresh === 'function') enterFillAllFresh();
  // ✅ v13.121 — Dossier existant ouvert dans la paillasse : rétablir le mode
  // édition APRÈS enterFillAllFresh (qui remet _editingRecordId à null), pour
  // que l'enregistrement passe par la mise à jour du dossier, pas une création.
  if (entry.recordId != null && typeof _editingRecordId !== 'undefined') _editingRecordId = entry.recordId;

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
  benchUpdateActiveStatus();
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
  benchUpdateActiveStatus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Ouvrir un dossier existant (depuis l'historique) dans la paillasse ──
// Charge la fiche dans le formulaire (fillAllResults) puis l'ajoute comme
// onglet de la paillasse, en conservant les patients déjà ouverts.
async function benchOpenRecord(id) {
  if (!benchEnabled()) {
    // Paillasse désactivée : ouvrir directement la fiche complète pour édition.
    if (typeof fillAllResults === 'function') return fillAllResults(id);
    if (typeof editRecord === 'function') return editRecord(id);
    return;
  }
  // Déjà ouvert ? → simplement basculer dessus.
  const deja = _bench.find(e => e.recordId === id);
  if (deja) { if (typeof showView === 'function') showView('saisie'); benchGo(deja.key); return; }
  // Mémoriser le patient actuellement affiché, puis charger le dossier demandé.
  benchStoreActiveFromForm();
  _benchActiveKey = null;
  if (typeof fillAllResults === 'function') {
    await fillAllResults(id);            // charge patient + résultats + vue empilée
  } else if (typeof editRecord === 'function') {
    await editRecord(id);
  }
  // Capturer l'état chargé comme onglet de paillasse (avec recordId).
  const snap = benchSnapshot();
  const key = _benchSeq++;
  const nom = (document.getElementById('p_nom')?.value || 'Dossier').trim();
  _bench.push({ key, recordId: id, label: nom, ...snap });
  _benchActiveKey = key;
  benchRenderBar();
  benchUpdateActiveStatus();
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
    // Complétude : ✓ vert quand tous les résultats attendus sont remplis.
    const comp = actif ? _completionActive() : _completionSnapshot(e);
    const pret = comp.complete;
    let bg;
    if (pret)       bg = actif ? 'background:#15803d;color:#fff' : 'background:#dcfce7;color:#15803d;border:1px solid #86efac';
    else if (actif) bg = 'background:var(--cpmi-deep);color:#fff';
    else            bg = 'background:var(--accent-light);color:var(--cpmi-deep);border:1px solid var(--border)';
    const marque = (pret ? '✓ ' : '') + (e.recordId != null ? '✎ ' : '');
    return '<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 6px 5px 11px;border-radius:99px;font-size:12px;font-weight:600;cursor:pointer;' + bg + '" '
      + 'onclick="benchGo(' + e.key + ')" title="' + (pret ? 'Prêt — ' : '') + (e.recordId != null ? 'Dossier existant — ' : '') + 'Basculer vers ' + nom + '">'
      + marque + nom + (doss ? ' <span style="opacity:.7;font-weight:500">· ' + doss + '</span>' : '')
      + '<button onclick="event.stopPropagation();benchClose(' + e.key + ')" title="Fermer" '
      + 'style="border:none;background:' + (actif || pret ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.06)') + ';color:inherit;'
      + 'width:18px;height:18px;border-radius:99px;cursor:pointer;font-size:12px;line-height:1;display:inline-flex;align-items:center;justify-content:center">✕</button>'
      + '</span>';
  }).join('');
}

// ============================================================
//  COMPLÉTUDE — « tout est rempli, prêt à enregistrer et imprimer »
// ============================================================

// Champs NON requis pour juger qu'un examen est « complet » :
// observations, commentaires, modes, valeurs secondaires ou auto-calculées.
const _OPT_RX = /(_obs$|obs$|comment|profil|_cin_)/i;
const _OPT_IDS = new Set([
  'ge_tdr','ge_espece','ge_para','ge_densite','ge_stade',
  'para_tdr','para_espece','para_densite','para_stade','para_type',
  'para_coloration','para_indice','para_parasitemie',
  'gs_obs',
  'v_vgm','v_tcmh','v_ccmh','v_ret','ret',   // indices auto-calculés / réticulocytes
  'v_ldl','v_dfg',                           // valeurs calculées
]);
function _champOptionnel(id) { return _OPT_RX.test(id) || _OPT_IDS.has(id); }

// Complétude d'un examen à partir d'un lecteur de valeur getVal(id)->string.
function _examCompletion(ex, getVal) {
  let fids; try { fids = examFieldIds(ex.id); } catch (e) { fids = []; }
  if (!fids.length) return { req: 0, ok: 0 };            // bactério, RAI… : non mesurable ici
  const rempli = id => { const v = getVal(id); return v != null && String(v).trim() !== ''; };
  // Sérologie : chaque test est satisfait par sr_ (qualitatif) OU sv_ (quantitatif).
  const seroTests = [...new Set(fids.filter(f => f.startsWith('sr_')).map(f => f.slice(3)))];
  if (seroTests.length) {
    let req = 0, ok = 0;
    seroTests.forEach(id => { req++; if (rempli('sr_' + id) || rempli('sv_' + id)) ok++; });
    return { req, ok };
  }
  const req = fids.filter(f => !_champOptionnel(f));
  let ok = 0; req.forEach(f => { if (rempli(f)) ok++; });
  return { req: req.length, ok };
}

// Complétude globale à partir d'un « patient coché ? » et d'un lecteur de valeur.
function _completion(getChecked, getVal) {
  let req = 0, ok = 0, examsTotal = 0, examsDone = 0;
  try {
    getCatalogueComplet().forEach(ex => {
      if (!getChecked(ex.id)) return;
      const c = _examCompletion(ex, getVal);
      req += c.req; ok += c.ok;
      if (c.req > 0) { examsTotal++; if (c.ok >= c.req) examsDone++; }
    });
  } catch (e) {}
  return { req, ok, complete: req > 0 && ok >= req, examsTotal, examsDone };
}

// Complétude du patient ACTIF (lecture directe du formulaire).
function _completionActive() {
  return _completion(
    id => document.getElementById(id)?.checked,
    id => { const el = document.getElementById(id); return el ? el.value : null; }
  );
}
// Complétude d'un patient mémorisé (depuis son instantané).
function _completionSnapshot(e) {
  return _completion(
    id => !!(e.coches[id] && e.coches[id].c),
    id => (e.values ? e.values[id] : null)
  );
}

// Bannière « prêt » + bouton « Enregistrer + Imprimer » sous les résultats.
function benchRenderReadyBanner(comp) {
  const bar  = document.getElementById('save-all-bar');
  const hint = document.getElementById('save-all-hint');
  if (!bar || !hint) return;
  let printBtn = document.getElementById('btn-save-print');
  if (!printBtn) {
    printBtn = document.createElement('button');
    printBtn.id = 'btn-save-print';
    printBtn.className = 'btn';
    printBtn.style.cssText = 'padding:10px 20px;font-size:14px;gap:8px;margin-right:8px;background:#15803d;color:#fff;display:none';
    printBtn.innerHTML = '🖨️ Enregistrer + Imprimer';
    printBtn.onclick = benchSaveAndPrint;
    const saveBtn = document.getElementById('btn-save-all');
    if (saveBtn && saveBtn.parentNode) saveBtn.parentNode.insertBefore(printBtn, saveBtn);
  }
  if (comp && comp.complete) {
    hint.innerHTML = '✅ <strong>Tout est rempli</strong> — prêt à enregistrer et imprimer';
    hint.style.color = '#15803d';
    hint.style.fontWeight = '700';
    printBtn.style.display = 'inline-flex';
  } else {
    const ex = comp && comp.examsTotal
      ? ' · ' + comp.examsDone + '/' + comp.examsTotal + ' examen' + (comp.examsTotal > 1 ? 's' : '') + ' complet' + (comp.examsDone > 1 ? 's' : '')
      : '';
    hint.textContent = '🖊️ ' + (comp ? comp.ok : 0) + '/' + (comp ? comp.req : 0) + ' résultats remplis' + ex;
    hint.style.color = '';
    hint.style.fontWeight = '';
    printBtn.style.display = 'none';
  }
}

// Recalcule le statut du patient actif (pastilles + bannière). Appelé à la
// frappe et à chaque bascule.
function benchUpdateActiveStatus() {
  if (!document.body.classList.contains('fill-all-mode')) return;
  const comp = _completionActive();
  benchRenderReadyBanner(comp);
  benchRenderBar();
}

// Enregistrer PUIS imprimer le dossier qui vient d'être créé.
function benchSaveAndPrint() {
  window._benchPrintAfterSave = true;
  if (typeof saveAllTabs === 'function') saveAllTabs();
}

// Réinitialiser complètement la paillasse (changement d'utilisateur, etc.)
function benchReset() {
  _bench = [];
  _benchActiveKey = null;
  benchRenderBar();
}

// Mise à jour du statut « prêt » à chaque saisie dans la zone de résultats.
document.addEventListener('input', function (ev) {
  const t = ev.target;
  if (!t || !t.closest || !t.closest('#zone-saisie')) return;
  clearTimeout(window._benchStatusT);
  window._benchStatusT = setTimeout(benchUpdateActiveStatus, 120);
}, true);
document.addEventListener('change', function (ev) {
  const t = ev.target;
  if (!t || !t.closest || !t.closest('#zone-saisie')) return;
  clearTimeout(window._benchStatusT);
  window._benchStatusT = setTimeout(benchUpdateActiveStatus, 120);
}, true);
