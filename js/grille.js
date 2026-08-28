// ============================================================
//  GRILLE DE SAISIE EN SÉRIE (v13.140)
//
//  Une ligne par patient, une colonne par paramètre, pour l'examen
//  choisi dans le sélecteur. On ne liste QUE les dossiers dont ce
//  paramètre est demandé mais pas encore rempli : « si je suis à la
//  NFS je remplis, si je suis à la CRP je remplis au fur et à mesure ».
//
//  Correction garantie : chaque ligne est « rejouée » dans le vrai
//  formulaire de saisie (mêmes handlers/interprétations) puis
//  collectResults(type) produit exactement le même JSON qu'une saisie
//  normale. La grille n'est qu'une surface de saisie rapide.
// ============================================================

// Options du sélecteur CRP (identiques au formulaire).
const _CRP_OPTS = [
  ['', '—'], ['neg', 'Négatif (< 6)'], ['6', '6'], ['12', '12'], ['24', '24'],
  ['48', '48'], ['96', '96'], ['192', '192'], ['384', '≥ 384'],
];
// Options qualitatives des sérologies (identiques au formulaire).
const _SERO_OPTS = [['', '—'], ['Positif', 'Positif'], ['Négatif', 'Négatif'], ['Douteux', 'Douteux']];
// Positif / Négatif simple (goutte épaisse, TDR).
const _PN_OPTS = [['', '—'], ['Positif', 'Positif'], ['Négatif', 'Négatif']];
// Dilutions du Widal (identiques au formulaire).
const _WIDAL_OPTS = [['', '—']].concat(
  (typeof WIDAL_DILUTIONS !== 'undefined' ? WIDAL_DILUTIONS : ['Non réalisé', 'Négatif', '1/40', '1/80', '1/160', '1/320'])
    .map(v => [v, v]));

// Registre des examens saisissables en série.
//  type    : analyse de stockage (clé dans resultats)
//  exId    : examen à cocher lors du rejeu
//  coche   : regex pour repérer l'examen dans _examens_coches[type]
//  filled  : (resultatsDuType) => valeur déjà saisie ? (=> exclu de la liste)
//  cols    : colonnes { k, lab, dom, kind:'num'|'sel', opts? }
//  before  : réglage éventuel avant le rejeu (ex. mode quantitatif)
const GRILLE_EXAMS = {
  nfs: {
    label: 'NFS — Hémogramme', type: 'Hématologie', exId: 'ex_nfs', coche: /NFS/i,
    filled: h => h['Globules blancs (GB)'] && h['Globules blancs (GB)'].valeur,
    cols: [
      { k: 'gbc', lab: 'GB', dom: 'v_gbc', kind: 'num' },
      { k: 'gr',  lab: 'GR', dom: 'v_gr',  kind: 'num' },
      { k: 'hb',  lab: 'Hb', dom: 'v_hb',  kind: 'num' },
      { k: 'ht',  lab: 'Ht', dom: 'v_ht',  kind: 'num' },
      { k: 'plt', lab: 'Plq', dom: 'v_plt', kind: 'num' },
      { k: 'pnn', lab: 'PNN %', dom: 'v_pnn', kind: 'num' },
      { k: 'pne', lab: 'PNE %', dom: 'v_pne', kind: 'num' },
      { k: 'pnb', lab: 'PNB %', dom: 'v_pnb', kind: 'num' },
      { k: 'lymp', lab: 'Lymph %', dom: 'v_lymp', kind: 'num' },
      { k: 'mono', lab: 'Mono %', dom: 'v_mono', kind: 'num' },
    ],
  },
  // ✅ v13.143 — Repérés manquants par le banc d'essai : un patient n'ayant QUE
  // la goutte épaisse, QUE le Widal ou QUE l'urée n'apparaissait pas en série.
  ge: {
    label: 'Goutte épaisse / TDR', type: 'Hématologie', exId: 'ex_ge', coche: /Goutte|TDR|Palud/i,
    filled: h => h['GE - Résultat'],
    cols: [
      { k: 'geres', lab: 'Résultat GE', dom: 'ge_result', kind: 'sel', opts: _PN_OPTS },
      { k: 'getdr', lab: 'TDR', dom: 'ge_tdr', kind: 'sel', opts: _PN_OPTS },
    ],
  },
  uree: {
    label: 'Urée', type: 'Biochimie', exId: 'ex_uree', coche: /^Urée$|Uree/i,
    filled: b => b['Urée'] && b['Urée'].valeur,
    cols: [{ k: 'uree', lab: 'Urée (g/L)', dom: 'v_uree', kind: 'num' }],
  },
  widal: {
    label: 'Widal & Félix (SWF)', type: 'Immuno-Sérologie', exId: 'ex_widal', coche: /Widal|SWF/i,
    filled: s => s['Widal - Salmonella typhi O (TO)'] && s['Widal - Salmonella typhi O (TO)'].titre
                 && s['Widal - Salmonella typhi O (TO)'].titre !== 'Non réalisé',
    cols: [
      { k: 'wto', lab: 'TO', dom: 'widal_to', kind: 'sel', opts: _WIDAL_OPTS },
      { k: 'wth', lab: 'TH', dom: 'widal_th', kind: 'sel', opts: _WIDAL_OPTS },
      { k: 'wao', lab: 'AO', dom: 'widal_ao', kind: 'sel', opts: _WIDAL_OPTS },
      { k: 'wah', lab: 'AH', dom: 'widal_ah', kind: 'sel', opts: _WIDAL_OPTS },
    ],
  },
  crp: {
    label: 'CRP', type: 'Immuno-Sérologie', exId: 'ex_crp', coche: /CRP/i,
    filled: s => s['CRP - Valeur'],
    cols: [{ k: 'crp', lab: 'CRP (mg/L)', dom: 'crp_valeur', kind: 'sel', opts: _CRP_OPTS }],
  },
  gly: {
    label: 'Glycémie à jeun', type: 'Biochimie', exId: 'ex_gly', coche: /Glyc/i,
    filled: b => b['Glycémie à jeun'] && b['Glycémie à jeun'].valeur,
    cols: [{ k: 'gly', lab: 'Glycémie (g/L)', dom: 'v_gly', kind: 'num' }],
  },
  crea: {
    label: 'Créatinine (+ urée auto)', type: 'Biochimie', exId: 'ex_crea', coche: /Créat|Creat/i,
    filled: b => b['Créatinine'] && b['Créatinine'].valeur,
    cols: [{ k: 'crea', lab: 'Créatinine (mg/L)', dom: 'v_crea', kind: 'num' }],
    // ✅ v13.123 — L'urée est déduite de la créatinine : urée (g/L) = créat / 44.4.
    postSet: () => {
      const c = parseFloat(document.getElementById('v_crea')?.value);
      const el = document.getElementById('v_uree');
      if (el && !isNaN(c)) {
        el.value = (c / 44.4).toFixed(2);
        try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        if (typeof onParamInputColored === 'function') { try { onParamInputColored('uree'); } catch (e) {} }
      }
    },
  },
  transa: {
    label: 'Transaminases (ASAT / ALAT)', type: 'Biochimie', exId: 'ex_asat', coche: /ASAT|ALAT|Transaminase|TGO|TGP/i,
    filled: b => (b['ASAT (TGO)'] && b['ASAT (TGO)'].valeur) || (b['ALAT (TGP)'] && b['ALAT (TGP)'].valeur),
    cols: [
      { k: 'asat', lab: 'ASAT (TGO)', dom: 'v_asat', kind: 'num' },
      { k: 'alat', lab: 'ALAT (TGP)', dom: 'v_alat', kind: 'num' },
    ],
  },

  // ── Paramètres du bilan prénatal (sérologies + groupe) ──────
  // (L'hémogramme, la glycémie et la créatinine du BPN se saisissent via les
  //  entrées NFS / Glycémie / Créatinine ci-dessus.)
  vih: {
    label: 'BPN · Sérologie VIH', type: 'Immuno-Sérologie', exId: 'ex_vih', coche: /VIH/i,
    filled: s => s['VIH 1 & 2'] && s['VIH 1 & 2'].resultat,
    cols: [{ k: 'vih1', lab: 'VIH 1 & 2', dom: 'sr_vih1', kind: 'sel', opts: _SERO_OPTS }],
  },
  hbs: {
    label: 'BPN · Hépatite B (Ag HBs)', type: 'Immuno-Sérologie', exId: 'ex_hbs', coche: /HBs|Hépatite B/i,
    filled: s => s['Ag HBs'] && s['Ag HBs'].resultat,
    cols: [
      { k: 'hbsag', lab: 'Ag HBs', dom: 'sr_hbsag', kind: 'sel', opts: _SERO_OPTS },
      { k: 'hbcac', lab: 'Ac anti-HBc', dom: 'sr_hbcac', kind: 'sel', opts: _SERO_OPTS },
      { k: 'hbsac', lab: 'Ac anti-HBs (UI/L)', dom: 'sv_hbsac', kind: 'num' },
    ],
  },
  hcv: {
    label: 'BPN · Hépatite C (VHC)', type: 'Immuno-Sérologie', exId: 'ex_hcv', coche: /VHC|HCV|Hépatite C/i,
    filled: s => s['Ac anti-VHC'] && s['Ac anti-VHC'].resultat,
    cols: [{ k: 'hcv', lab: 'Ac anti-VHC', dom: 'sr_hcv', kind: 'sel', opts: _SERO_OPTS }],
  },
  tpha: {
    label: 'BPN · Syphilis (TPHA/VDRL)', type: 'Immuno-Sérologie', exId: 'ex_tpha', coche: /TPHA|VDRL|Syphilis/i,
    filled: s => s['TPHA / VDRL (Syphilis)'] && s['TPHA / VDRL (Syphilis)'].resultat,
    cols: [{ k: 'syphil', lab: 'TPHA / VDRL', dom: 'sr_syphil', kind: 'sel', opts: _SERO_OPTS }],
  },
  toxo: {
    label: 'BPN · Toxoplasmose IgG/IgM', type: 'Immuno-Sérologie', exId: 'ex_toxo', coche: /Toxo/i,
    filled: s => (s['Toxoplasmose IgG'] && s['Toxoplasmose IgG'].valeur) || (s['Toxoplasmose IgM'] && s['Toxoplasmose IgM'].resultat),
    cols: [
      { k: 'toxo', lab: 'Toxo IgG (UI/mL)', dom: 'sv_toxo', kind: 'num' },
      { k: 'toxoig', lab: 'Toxo IgM', dom: 'sr_toxoig', kind: 'sel', opts: _SERO_OPTS },
    ],
  },
  rube: {
    label: 'BPN · Rubéole IgG', type: 'Immuno-Sérologie', exId: 'ex_rube', coche: /Rubéole|Rube/i,
    filled: s => s['Rubéole IgG'] && s['Rubéole IgG'].valeur,
    cols: [{ k: 'rubig', lab: 'Rubéole IgG (UI/mL)', dom: 'sv_rubig', kind: 'num' }],
  },
  gs: {
    label: 'BPN · Groupe sanguin (ABO/Rh)', type: 'Groupe sanguin', exId: 'ex_gs', coche: /Groupe|ABO|Rh/i,
    filled: g => g['Groupe ABO'],
    cols: [
      { k: 'abo', lab: 'ABO', dom: 'gs_abo', kind: 'sel', opts: [['', '—'], ['A', 'A'], ['B', 'B'], ['AB', 'AB'], ['O', 'O']] },
      { k: 'rh', lab: 'Rhésus', dom: 'gs_rh', kind: 'sel', opts: [['', '—'], ['Positif', 'Positif'], ['Négatif', 'Négatif']] },
    ],
  },
};

const _TYPE_TO_TAB = { 'Hématologie': 'hema', 'Biochimie': 'bio', 'Immuno-Sérologie': 'sero', 'Parasitologie': 'parasito', 'Groupe sanguin': 'gs' };

let _grilleKey = 'nfs';
let _grilleDate = null;                 // date filtrée (YYYY-MM-DD) ; '' = toutes
let _grilleInclureReception = false;    // inclure les dossiers « réception seule »
let _grilleInclureSaisis = false;       // ✅ v13.133 — inclure les paramètres déjà saisis (correction)
let _grilleDernierLot = [];             // ✅ v13.133 — ids du dernier lot enregistré (pour impression)
let _grilleSelForce = {};               // ✅ v13.134 — override manuel de la coche « terminé » par dossier

// Date d'un dossier : date de la fiche patient, sinon date d'enregistrement.
function _dateDossier(r) {
  return (r.patient && r.patient.date) || String(r.savedAt || r.created_at || r.createdAt || '').slice(0, 10);
}


function _grilleValVide(v) {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (typeof v === 'object') {
    return !['valeur', 'resultat', 'titre', 'pct'].some(f => v[f] != null && String(v[f]).trim() !== '');
  }
  return false;
}

function _grilleFusionType(baseType, res) {
  const out = Object.assign({}, baseType || {});
  Object.keys(res || {}).forEach(k => {
    if (!_grilleValVide(res[k])) out[k] = res[k];     // valeur saisie → écrase / ajoute
    else if (!(k in out)) out[k] = res[k];            // analyte absent → conserve la coquille vide
    // sinon (res vide ET base présent) → on GARDE l'existant.
  });
  return out;
}

function grilleBuildResults(cfg, dossId, sexe, age, examKey) {
  const tab = _TYPE_TO_TAB[cfg.type] || 'hema';
  if (typeof ensurePanelBuilt === 'function') ensurePanelBuilt(tab);
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  setV('p_sexe', sexe || ''); setV('p_age', age == null ? '' : age);
  try { getCatalogueComplet().forEach(ex => { const c = document.getElementById(ex.id); if (c) c.checked = (ex.id === cfg.exId); }); } catch (e) {}
  if (typeof updateAllRefs === 'function') updateAllRefs();
  // Vider les champs de cet examen avant de réinjecter la ligne.
  cfg.cols.forEach(c => setV(c.dom, ''));
  if (cfg.before) { try { cfg.before(); } catch (e) {} }
  // ✅ v13.124 — Sérologie : régler le mode (qual/quant) selon le type de champ.
  // sv_<id> = valeur chiffrée (quantitatif), sr_<id> = résultat Positif/Négatif.
  cfg.cols.forEach(c => {
    let tid = null;
    if (c.dom && c.dom.indexOf('sv_') === 0) tid = c.dom.slice(3);
    else if (c.dom && c.dom.indexOf('sr_') === 0) tid = c.dom.slice(3);
    if (tid) { const m = document.getElementById('smode_' + tid); if (m) { m.value = (c.dom.indexOf('sv_') === 0) ? 'quant' : 'qual'; try { m.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {} } }
  });
  cfg.cols.forEach(c => {
    // ✅ v13.140 — identifiants de cellule : g_<dossier>_<examen>_<champ>
    const src = document.getElementById('g_' + dossId + '_' + (examKey || _grilleKey) + '_' + c.k);
    const val = src ? String(src.value).trim() : '';
    if (val === '') return;
    const el = document.getElementById(c.dom);
    if (el) { el.value = val; try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {} try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {} }
  });
  if (cfg.postSet) { try { cfg.postSet(); } catch (e) {} }
  if (cfg.type === 'Hématologie') { if (typeof calcConstantes === 'function') calcConstantes(); if (typeof calcFLAbsolues === 'function') calcFLAbsolues(); }
  if (typeof ensureInterpFresh === 'function') ensureInterpFresh(cfg.type);
  return collectResults(cfg.type);
}

// ══════════════════════════════════════════════════════════════
//  v13.140 — GRILLE UNIFIÉE : une ligne par patient, TOUS ses
//  examens demandés alignés devant lui.
//
//  Ancien fonctionnement : un examen à la fois (sélecteur), donc
//  une écriture par paramètre sur le même dossier — c'est ce qui
//  provoquait les écrasements. Désormais : une seule écriture
//  atomique par patient, contenant toutes ses analyses.
// ══════════════════════════════════════════════════════════════

// Ordre d'affichage des examens dans la grille.
const GRILLE_ORDRE = ['nfs','ge','gly','uree','crea','transa','crp','widal','vih','hbs','hcv','tpha','toxo','rube','gs'];

// Examens de la grille réellement demandés pour ce dossier.
function grilleExamsDuDossier(r) {
  const coches = (r.resultats && r.resultats._examens_coches) || {};
  return GRILLE_ORDRE.filter(k => {
    const cfg = GRILLE_EXAMS[k]; if (!cfg) return false;
    const liste = coches[cfg.type] || [];
    return liste.some(l => cfg.coche.test(l));
  });
}
// Examens déjà enregistrés en série pour ce dossier.
function grilleExamsSaisis(r) {
  const m = (r.resultats && r.resultats._saisi_serie) || {};
  return GRILLE_ORDRE.filter(k => m[k]);
}
// Examens restant à saisir.
function grilleExamsRestants(r) {
  const faits = new Set(grilleExamsSaisis(r));
  return grilleExamsDuDossier(r).filter(k => !faits.has(k));
}

// Patients à afficher : filtres date / réception seule, et au moins un examen
// de la grille à saisir (sauf si « déjà saisis » est coché).
function grilleDossiers() {
  let db; try { db = getDB(); } catch (e) { db = []; }
  return db.filter(r => {
    if (!isDossierRecord(r) || r.deletedAt || r._hardDeleted) return false;
    if (!_grilleInclureReception && r.resultats && r.resultats._reception_seule) return false;
    if (_grilleDate && _dateDossier(r) !== _grilleDate) return false;
    if (!grilleExamsDuDossier(r).length) return false;
    return _grilleInclureSaisis ? true : grilleExamsRestants(r).length > 0;
  });
}
// Compat : anciens appels/tests par examen.
function grillePending(key) {
  return grilleDossiers().filter(r => {
    const dispo = _grilleInclureSaisis ? grilleExamsDuDossier(r) : grilleExamsRestants(r);
    return dispo.indexOf(key) >= 0;
  });
}
function grillePendingNFS() { return grillePending('nfs'); }

// Colonnes affichées = union des examens demandés par les patients listés.
function grilleColonnes(dossiers) {
  const vus = new Set();
  dossiers.forEach(r => grilleExamsDuDossier(r).forEach(k => vus.add(k)));
  return GRILLE_ORDRE.filter(k => vus.has(k));
}

function ouvrirGrille(key) {
  if (typeof isSpectateur === 'function' && isSpectateur()) { toast('Lecture seule', 'err'); return; }
  if (key && GRILLE_EXAMS[key]) _grilleKey = key;
  if (_grilleDate === null) {
    try { _grilleDate = new Date().toISOString().slice(0, 10); } catch (e) { _grilleDate = ''; }
  }
  const cont = document.getElementById('grille-serie');
  if (!cont) return;
  ['fiche-identification', 'zone-saisie'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  cont.style.display = '';
  grilleRender();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function ouvrirGrilleNFS() { ouvrirGrille('nfs'); }
function fermerGrille() {
  const cont = document.getElementById('grille-serie');
  if (cont) cont.style.display = 'none';
  const fiche = document.getElementById('fiche-identification');
  if (fiche) fiche.style.display = '';
}
function grilleSetDate(v) { _grilleDate = v || ''; grilleRender(); }
function grilleToggleReception(on) { _grilleInclureReception = !!on; grilleRender(); }
function grilleToggleSaisis(on) { _grilleInclureSaisis = !!on; grilleRender(); }
function grilleChangeExam(key) { if (GRILLE_EXAMS[key]) { _grilleKey = key; grilleRender(); } }

// ── Rendu ───────────────────────────────────────────────────
function grilleRender() {
  const cont = document.getElementById('grille-serie');
  if (!cont) return;
  _grilleSelForce = {};
  const doss = grilleDossiers();
  const cols = grilleColonnes(doss);

  const filtres = '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12.5px;color:var(--text-muted)">'
    + '<label style="display:flex;align-items:center;gap:5px">📅 Date '
    + '<input type="date" id="grille-date" value="' + esc(_grilleDate || '') + '" onchange="grilleSetDate(this.value)" '
    + 'style="padding:5px 8px;border:1px solid var(--border);border-radius:8px;font-size:12.5px"></label>'
    + (_grilleDate ? '<button class="btn btn-outline" style="font-size:11.5px;padding:3px 8px" onclick="grilleSetDate(\'\')">Toutes les dates</button>' : '')
    + '<label style="display:flex;align-items:center;gap:5px;cursor:pointer" title="Afficher aussi les patients « réception seule »">'
    + '<input type="checkbox"' + (_grilleInclureReception ? ' checked' : '') + ' onchange="grilleToggleReception(this.checked)" style="width:15px;height:15px"> réception seule</label>'
    + '<label style="display:flex;align-items:center;gap:5px;cursor:pointer" title="Réafficher les examens déjà saisis pour les corriger">'
    + '<input type="checkbox"' + (_grilleInclureSaisis ? ' checked' : '') + ' onchange="grilleToggleSaisis(this.checked)" style="width:15px;height:15px"> déjà saisis</label>'
    + '</div>';

  const entete = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:10px">'
    + '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">'
    + '<span style="font-size:15px;font-weight:800;color:var(--cpmi-deep)">📋 Saisie en série</span>'
    + '<span style="font-size:13px;color:var(--text-muted)">' + doss.length + ' patient(s) · '
    + '<span id="grille-selcount" style="font-weight:700;color:var(--cpmi-deep)">0</span> coché(s)</span></div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
    + '<button class="btn btn-outline" style="font-size:13px" onclick="fermerGrille()">← Retour</button>'
    + (_grilleDernierLot.length
        ? '<button class="btn btn-outline" style="font-size:13px;padding:9px 14px" onclick="grilleImprimerLot()">🖨️ Imprimer le lot (' + _grilleDernierLot.length + ')</button>' : '')
    + '<button class="btn btn-outline" style="font-size:13px;padding:9px 14px;border-color:#15803d;color:#15803d" onclick="grilleSaveAndPrint()">💾🖨️ Enreg. + Imprimer</button>'
    + '<button id="grille-save" class="btn btn-primary" style="font-size:14px;padding:9px 20px" onclick="grilleSaveAll()">💾 Enregistrer les cochés</button>'
    + '</div></div><div style="margin-bottom:12px">' + filtres + '</div>';

  if (!doss.length) {
    cont.innerHTML = entete
      + '<div style="padding:24px;text-align:center;color:var(--text-muted);background:rgba(255,255,255,.7);border:1px dashed var(--border);border-radius:var(--radius)">'
      + 'Aucun patient à saisir ' + (_grilleDate ? 'pour le ' + esc(_grilleDate) : '(toutes dates)') + '.<br>'
      + '<span style="font-size:12px">Change la date, choisis « Toutes les dates », ou coche « déjà saisis » pour corriger.</span></div>';
    grilleUpdateSelCount();
    return;
  }

  // En-tête à deux niveaux : examen (fusionné) puis paramètres.
  const HD = 'background:var(--cpmi-deep);color:#fff;padding:6px 6px;font-size:11px;text-align:center';
  let h1 = '<th rowspan="2" style="position:sticky;left:0;z-index:3;' + HD + ';text-align:left;min-width:180px">'
    + '<input type="checkbox" id="grille-selall" onchange="grilleSelAll(this.checked)" title="Tout cocher" '
    + 'style="width:15px;height:15px;vertical-align:middle;margin-right:6px;cursor:pointer">Patient</th>';
  let h2 = '';
  cols.forEach(k => {
    const cfg = GRILLE_EXAMS[k];
    h1 += '<th colspan="' + cfg.cols.length + '" style="' + HD + ';font-weight:800;border-left:2px solid rgba(255,255,255,.35)">' + esc(cfg.label) + '</th>';
    cfg.cols.forEach((c, i) => {
      h2 += '<th style="' + HD + ';font-weight:600;opacity:.92' + (i === 0 ? ';border-left:2px solid rgba(255,255,255,.35)' : '') + '">' + esc(c.lab) + '</th>';
    });
  });

  const cellHtml = (id, k, c) => {
    const base = 'padding:5px 4px;border:1px solid var(--border);border-radius:6px;font-size:12.5px';
    if (c.kind === 'sel') {
      return '<td style="padding:3px 4px"><select id="g_' + id + '_' + k + '_' + c.k + '" '
        + 'onchange="grilleCellChange(' + id + ')" style="min-width:118px;' + base + '">'
        + (c.opts || []).map(o => '<option value="' + o[0] + '">' + esc(o[1]) + '</option>').join('') + '</select></td>';
    }
    return '<td style="padding:3px 4px"><input type="number" step="any" inputmode="decimal" '
      + 'id="g_' + id + '_' + k + '_' + c.k + '" oninput="grilleCellChange(' + id + ')" '
      + 'style="width:76px;text-align:center;' + base + '"></td>';
  };

  const rows = doss.map(r => {
    const demandes = new Set(grilleExamsDuDossier(r));
    const faits = new Set(grilleExamsSaisis(r));
    let tds = '';
    cols.forEach(k => {
      const cfg = GRILLE_EXAMS[k];
      if (!demandes.has(k)) {
        tds += '<td colspan="' + cfg.cols.length + '" style="background:#f1f3f5;color:#adb5bd;text-align:center;font-size:11px;border-left:2px solid var(--border)">—</td>';
        return;
      }
      if (faits.has(k) && !_grilleInclureSaisis) {
        tds += '<td colspan="' + cfg.cols.length + '" style="background:#e7f5ec;color:#15803d;text-align:center;font-size:11px;font-weight:600;border-left:2px solid var(--border)">✓ saisi</td>';
        return;
      }
      cfg.cols.forEach(c => { tds += cellHtml(r.id, k, c); });
    });
    const nom = esc(r.patient?.nom || '—'), dn = esc(r.patient?.dossier || ''), sx = esc(r.patient?.sexe || '');
    const reste = grilleExamsRestants(r).length;
    return '<tr id="grow_' + r.id + '" data-doss="' + r.id + '">'
      + '<td style="position:sticky;left:0;background:#fff;padding:6px 10px;font-weight:600;font-size:12.5px;border-right:2px solid var(--border);z-index:1">'
      + '<input type="checkbox" id="gsel_' + r.id + '" onchange="grilleSelToggle(' + r.id + ')" '
      + 'title="Terminé — inclure dans l\'enregistrement" style="width:16px;height:16px;vertical-align:middle;margin-right:7px;cursor:pointer">'
      + nom + '<div style="font-size:10.5px;color:var(--text-muted);font-weight:500">N° ' + dn + (sx ? ' · ' + sx : '')
      + ' · <span style="color:#b26a00">' + reste + ' à saisir</span></div></td>' + tds + '</tr>';
  }).join('');

  cont.innerHTML = entete
    + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:8px">'
    + 'Chaque ligne = un patient, avec tous ses examens demandés. Les cases « — » ne le concernent pas. '
    + 'La coche se met d\'elle-même quand tout est rempli.</div>'
    + '<div id="grille-hint" style="font-size:12px;color:var(--text-muted);margin-bottom:8px"></div>'
    + '<div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius)">'
    + '<table style="border-collapse:collapse;width:100%;font-size:12.5px"><thead>'
    + '<tr>' + h1 + '</tr><tr>' + h2 + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  grilleUpdateHint();
  grilleUpdateSelCount();
}

// ── État des lignes ─────────────────────────────────────────
function grilleExamsEditables(r) {
  const faits = new Set(grilleExamsSaisis(r));
  return grilleExamsDuDossier(r).filter(k => _grilleInclureSaisis || !faits.has(k));
}
function _grilleDossier(id) { try { return getDB().find(x => String(x.id) === String(id)); } catch (e) { return null; } }
// « Prêt » = tout examen COMMENCÉ est entièrement rempli (et au moins un l'est).
// Le travail est progressif : on saisit la NFS le matin et la CRP plus tard ;
// exiger que TOUS les examens du patient soient remplis bloquerait ce flux.
function grilleRowComplete(id) {
  const r = _grilleDossier(id); if (!r) return false;
  let commences = 0, complets = 0;
  grilleExamsEditables(r).forEach(k => {
    const vals = GRILLE_EXAMS[k].cols.map(c => {
      const el = document.getElementById('g_' + id + '_' + k + '_' + c.k);
      return el ? String(el.value).trim() : '';
    });
    if (vals.some(v => v !== '')) { commences++; if (vals.every(v => v !== '')) complets++; }
  });
  return commences > 0 && commences === complets;
}
function grilleRowHasAny(id) {
  const r = _grilleDossier(id); if (!r) return false;
  return grilleExamsEditables(r).some(k => GRILLE_EXAMS[k].cols.some(c => {
    const el = document.getElementById('g_' + id + '_' + k + '_' + c.k);
    return el && String(el.value).trim() !== '';
  }));
}
function grilleCellChange(id) {
  const complete = grilleRowComplete(id);
  const sel = document.getElementById('gsel_' + id);
  if (sel && _grilleSelForce[id] === undefined) sel.checked = complete;
  grilleUpdateSelCount(); grilleUpdateHint();
}
function grilleSelToggle(id) {
  const sel = document.getElementById('gsel_' + id);
  _grilleSelForce[id] = !!(sel && sel.checked);
  grilleUpdateSelCount();
}
function grilleSelAll(on) {
  [...document.querySelectorAll('#grille-serie input[id^="gsel_"]')].forEach(cb => {
    cb.checked = !!on; _grilleSelForce[cb.id.slice(5)] = !!on;
  });
  grilleUpdateSelCount();
}
function grilleSelectedIds() {
  return [...document.querySelectorAll('#grille-serie input[id^="gsel_"]')]
    .filter(cb => cb.checked).map(cb => cb.id.slice(5));
}
function grilleUpdateSelCount() {
  const boxes = [...document.querySelectorAll('#grille-serie input[id^="gsel_"]')];
  const n = boxes.filter(cb => cb.checked).length;
  const c = document.getElementById('grille-selcount'); if (c) c.textContent = n;
  const all = document.getElementById('grille-selall');
  if (all) { all.checked = boxes.length > 0 && n === boxes.length; all.indeterminate = n > 0 && n < boxes.length; }
}
function grilleUpdateHint() {
  const hint = document.getElementById('grille-hint'); if (!hint) return;
  const rows = [...document.querySelectorAll('#grille-serie tr[data-doss]')];
  const prets = rows.filter(tr => grilleRowComplete(tr.dataset.doss)).length;
  const amorces = rows.filter(tr => grilleRowHasAny(tr.dataset.doss)).length;
  hint.textContent = '✅ ' + prets + ' complet(s) · ' + amorces + ' commencé(s) sur ' + rows.length;
}

// ── Enregistrement : UNE écriture par patient, tous examens ──
async function grilleSaveAll() {
  if (typeof isSpectateur === 'function' && isSpectateur()) { toast('Lecture seule', 'err'); return; }
  const ids = grilleSelectedIds().filter(id => grilleRowHasAny(id));
  if (!ids.length) { toast('Coche au moins un patient terminé', 'err'); return; }

  showLoading('Enregistrement du lot…');
  let ok = 0, err = 0; const savedIds = [];
  const btn = document.getElementById('grille-save'); if (btn) btn.disabled = true;
  try {
    for (const id of ids) {
      const record = _grilleDossier(id);
      if (!record) { err++; continue; }
      try {
        await ensureFull(record);
        if (record._light) { err++; continue; }   // détail non chargé : ne rien écraser
        const base = record.resultats || {};
        const newRes = Object.assign({}, base);
        const types = new Set(Array.isArray(base._types) ? base._types : []);
        const marque = Object.assign({}, base._saisi_serie);
        let touche = false;

        grilleExamsEditables(record).forEach(k => {
          const cfg = GRILLE_EXAMS[k];
          const rempli = cfg.cols.some(c => {
            const el = document.getElementById('g_' + id + '_' + k + '_' + c.k);
            return el && String(el.value).trim() !== '';
          });
          if (!rempli) return;
          const res = grilleBuildResults(cfg, id, record.patient?.sexe, record.patient?.age, k);
          newRes[cfg.type] = _grilleFusionType(newRes[cfg.type], res);
          types.add(cfg.type); marque[k] = true; touche = true;
        });
        if (!touche) { err++; continue; }

        newRes._types = [...types];
        newRes._facture_seule = false;
        newRes._saisi_serie = marque;
        const saved = await updateRecordRemote(record.id, {
          patient: record.patient, type: 'Dossier', resultats: newRes,
          montant: record.montant || 0, prescripteur_id: record.prescripteur_id || null,
        }, { onlyResultats: true });
        if (saved) { ok++; savedIds.push(record.id); } else err++;
      } catch (e) { err++; }
    }
  } finally { if (btn) btn.disabled = false; }

  hideLoading();
  await refreshDB(true);
  _grilleDernierLot = savedIds.slice();
  toast('✅ ' + ok + ' patient(s) enregistré(s)' + (err ? ' · ' + err + ' erreur(s)' : ''), err ? 'err' : 'ok');
  grilleRender();
  if (window._grilleImprimerApresSave) {
    window._grilleImprimerApresSave = false;
    if (_grilleDernierLot.length) { try { await grilleImprimerLot(); } catch (e) {} }
  }
}

async function grilleSaveAndPrint() {
  window._grilleImprimerApresSave = true;
  await grilleSaveAll();
}

// Impression des comptes rendus du dernier lot enregistré.
async function grilleImprimerLot() {
  if (!_grilleDernierLot.length) { toast('Aucun lot récent à imprimer', 'err'); return; }
  if (typeof printLot !== 'function') { toast('Impression indisponible', 'err'); return; }
  showLoading('Préparation de l\'impression…');
  try {
    const db = getDB(); const records = []; let nonCharges = 0;
    for (const id of _grilleDernierLot) {
      const rec = db.find(x => String(x.id) === String(id));
      if (!rec) continue;
      try { await ensureFull(rec); } catch (e) {}
      if (rec._light) { nonCharges++; continue; }
      records.push(rec);
    }
    hideLoading();
    if (!records.length) { toast(nonCharges ? 'Impression impossible hors-ligne' : 'Dossiers introuvables', 'err'); return; }
    if (nonCharges) toast('⚠️ ' + nonCharges + ' fiche(s) ignorée(s) (hors-ligne)', 'err');
    await printLot(records);
  } catch (e) { hideLoading(); toast('Erreur d\'impression', 'err'); }
}
