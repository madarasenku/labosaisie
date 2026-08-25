// ============================================================
//  GRILLE PAILLASSE PAR EXAMEN — saisie en série (v13.120)
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

// Dossiers où l'examen `key` est demandé mais pas encore rempli.
// Filtré par date (défaut : le jour choisi) et hors « réception seule ».
function grillePending(key) {
  const cfg = GRILLE_EXAMS[key]; if (!cfg) return [];
  let db; try { db = getDB(); } catch (e) { db = []; }
  return db.filter(r => {
    if (!isDossierRecord(r) || r.deletedAt || r._hardDeleted) return false;
    // ✅ v13.125 — « réception seule » : exclu de la série sauf demande explicite.
    if (!_grilleInclureReception && r.resultats && r.resultats._reception_seule) return false;
    // ✅ v13.125 — Filtre par date (vide = toutes les dates).
    if (_grilleDate && _dateDossier(r) !== _grilleDate) return false;
    const coches = r.resultats?._examens_coches?.[cfg.type] || [];
    if (!coches.some(l => cfg.coche.test(l))) return false;
    // ✅ v13.130 — Marqueur de saisie conservé par le chargement allégé (clé « _ »).
    // Le cache léger ne contient PAS les sous-résultats par analyse ; sans ce
    // drapeau, un examen déjà saisi réapparaîtrait indéfiniment dans la grille.
    // ✅ v13.133 — sauf si on demande explicitement d'inclure les déjà saisis (correction).
    if (!_grilleInclureSaisis && r.resultats && r.resultats._saisi_serie && r.resultats._saisi_serie[key]) return false;
    const res = r.resultats?.[cfg.type] || {};
    return !cfg.filled(res);          // pas encore rempli
  });
}
// Compat : ancienne entrée NFS.
function grillePendingNFS() { return grillePending('nfs'); }

// Ouvre la grille sur un examen donné.
function ouvrirGrille(key) {
  if (typeof isSpectateur === 'function' && isSpectateur()) { toast('Lecture seule', 'err'); return; }
  // ✅ v13.132 — La grille partage le formulaire #zone-saisie avec la paillasse.
  // On fige d'abord l'état du patient actif de la paillasse (identité + coches +
  // valeurs saisies) pour qu'une saisie en cours non enregistrée ne soit pas
  // perdue quand la grille manipule ensuite ce même formulaire.
  if (typeof benchStoreActiveFromForm === 'function') { try { benchStoreActiveFromForm(); } catch (e) {} }
  if (key && GRILLE_EXAMS[key]) _grilleKey = key;
  // ✅ v13.125 — Par défaut, on n'affiche que les patients DU JOUR (moins d'encombrement).
  if (_grilleDate === null) {
    try { _grilleDate = new Date().toISOString().slice(0, 10); } catch (e) { _grilleDate = ''; }
  }
  const cont = document.getElementById('grille-serie');
  if (!cont) return;
  ['fiche-identification', 'zone-saisie', 'paillasse-bar'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  cont.style.display = '';
  grilleRender();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function ouvrirGrilleNFS() { ouvrirGrille('nfs'); }

// Changement d'examen dans le sélecteur.
async function grilleChangeExam(key) {
  if (!GRILLE_EXAMS[key]) return;
  // Prévenir si des cellules sont saisies mais non enregistrées.
  const saisiEnCours = [...document.querySelectorAll('#grille-serie tr[data-doss]')].some(tr => grilleRowHasAny(tr.dataset.doss));
  if (saisiEnCours && typeof showConfirmModal === 'function') {
    const ok = await showConfirmModal({
      icon: '↔️', title: 'Changer d\'examen ?',
      message: 'Des valeurs saisies non enregistrées seront perdues. Continuer ?',
      confirmText: 'Changer', cancelText: 'Annuler'
    });
    if (!ok) { const sel = document.getElementById('grille-exam-sel'); if (sel) sel.value = _grilleKey; return; }
  }
  _grilleKey = key;
  grilleRender();
}

function fermerGrille() {
  const cont = document.getElementById('grille-serie');
  if (cont) cont.style.display = 'none';
  const fiche = document.getElementById('fiche-identification');
  if (fiche) fiche.style.display = '';
  if (typeof benchRenderBar === 'function') benchRenderBar();
}

// ✅ v13.125 — Filtres de la grille (date + « réception seule »).
function grilleSetDate(v) { _grilleDate = v || ''; grilleRender(); }
function grilleToggleReception(on) { _grilleInclureReception = !!on; grilleRender(); }
// ✅ v13.133 — inclure/exclure les paramètres déjà saisis (pour correction).
function grilleToggleSaisis(on) { _grilleInclureSaisis = !!on; grilleRender(); }

function grilleRender() {
  const cfg = GRILLE_EXAMS[_grilleKey];
  const cont = document.getElementById('grille-serie');
  if (!cont || !cfg) return;
  const pend = grillePending(_grilleKey);
  _grilleSelForce = {};   // ✅ v13.134 — nouvelle liste : on repart d'une sélection propre

  const selecteur = '<select id="grille-exam-sel" onchange="grilleChangeExam(this.value)" '
    + 'style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-weight:600;color:var(--cpmi-deep)">'
    + Object.keys(GRILLE_EXAMS).map(k => '<option value="' + k + '"' + (k === _grilleKey ? ' selected' : '') + '>' + esc(GRILLE_EXAMS[k].label) + '</option>').join('')
    + '</select>';

  // ✅ v13.125 — Contrôles de filtrage : date (défaut aujourd'hui) + « réception seule ».
  const filtres = '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;color:var(--text-muted)">'
    + '<label style="display:flex;align-items:center;gap:5px">📅 Date '
    + '<input type="date" id="grille-date" value="' + esc(_grilleDate || '') + '" onchange="grilleSetDate(this.value)" '
    + 'style="padding:5px 8px;border:1px solid var(--border);border-radius:8px;font-size:12.5px"></label>'
    + (_grilleDate ? '<button class="btn btn-outline" style="font-size:11.5px;padding:3px 8px" onclick="grilleSetDate(\'\')">Toutes les dates</button>' : '')
    + '<label style="display:flex;align-items:center;gap:5px;cursor:pointer" title="Afficher aussi les patients enregistrés en « réception seule »">'
    + '<input type="checkbox" id="grille-reception"' + (_grilleInclureReception ? ' checked' : '') + ' onchange="grilleToggleReception(this.checked)" style="width:15px;height:15px"> réception seule</label>'
    // ✅ v13.133 — inclure les paramètres déjà saisis pour les corriger.
    + '<label style="display:flex;align-items:center;gap:5px;cursor:pointer" title="Afficher aussi les paramètres déjà saisis en série (pour corriger une valeur)">'
    + '<input type="checkbox" id="grille-saisis"' + (_grilleInclureSaisis ? ' checked' : '') + ' onchange="grilleToggleSaisis(this.checked)" style="width:15px;height:15px"> déjà saisis</label>'
    + '</div>';

  const entete = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:10px">'
    + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
    + '<span style="font-size:15px;font-weight:800;color:var(--cpmi-deep)">📋 Saisie en série</span>' + selecteur
    + '<span style="font-size:13px;color:var(--text-muted)">' + pend.length + ' en attente · <span id="grille-selcount" style="font-weight:700;color:var(--cpmi-deep)">0</span> coché(s)</span></div>'
    + '<div style="display:flex;gap:8px"><button class="btn btn-outline" style="font-size:13px" onclick="fermerGrille()">← Retour</button>'
    // ✅ v13.133 — Imprimer les comptes rendus du dernier lot enregistré.
    + (_grilleDernierLot.length
        ? '<button class="btn btn-outline" style="font-size:13px;padding:9px 16px" onclick="grilleImprimerLot()" title="Imprimer les comptes rendus des patients du dernier lot enregistré">🖨️ Imprimer le lot (' + _grilleDernierLot.length + ')</button>'
        : '')
    // ✅ v13.134 — Enregistrer + imprimer les patients cochés (terminés).
    + '<button id="grille-saveprint" class="btn btn-outline" style="font-size:13px;padding:9px 14px;border-color:#15803d;color:#15803d" onclick="grilleSaveAndPrint()" title="Enregistrer les patients cochés puis imprimer leurs comptes rendus">💾🖨️ Enreg. + Imprimer</button>'
    + '<button id="grille-save" class="btn btn-primary" style="font-size:14px;padding:9px 20px" onclick="grilleSaveAll()">💾 Enregistrer les cochés</button></div></div>'
    + '<div style="margin-bottom:12px">' + filtres + '</div>';

  if (!pend.length) {
    const scope = _grilleDate ? ('du ' + esc(_grilleDate)) : '(toutes dates)';
    cont.innerHTML = entete
      + '<div style="padding:24px;text-align:center;color:var(--text-muted);background:rgba(255,255,255,.7);border:1px dashed var(--border);border-radius:var(--radius)">'
      + 'Aucun dossier « ' + esc(cfg.label) + ' » en attente ' + scope + '.<br>'
      + '<span style="font-size:12px">Change la date, choisis « Toutes les dates », ou coche « réception seule » si besoin.</span></div>';
    return;
  }

  const head = '<th style="position:sticky;left:0;background:var(--cpmi-deep);color:#fff;text-align:left;padding:8px 10px;min-width:170px;z-index:2">'
    + '<input type="checkbox" id="grille-selall" onchange="grilleSelAll(this.checked)" title="Tout cocher / décocher" style="width:15px;height:15px;vertical-align:middle;margin-right:6px;cursor:pointer">Patient</th>'
    + cfg.cols.map(c => '<th style="background:var(--cpmi-deep);color:#fff;padding:8px 6px;min-width:70px;font-size:11.5px">' + esc(c.lab) + '</th>').join('');

  const cellHtml = (dossId, c) => {
    if (c.kind === 'sel') {
      return '<td style="padding:3px 4px"><select id="g_' + dossId + '_' + c.k + '" data-doss="' + dossId + '" data-col="' + c.k + '" '
        + 'onchange="grilleCellChange(' + dossId + ')" style="min-width:120px;padding:5px 4px;border:1px solid var(--border);border-radius:6px;font-size:12.5px">'
        + (c.opts || []).map(o => '<option value="' + o[0] + '">' + esc(o[1]) + '</option>').join('') + '</select></td>';
    }
    return '<td style="padding:3px 4px"><input type="number" step="any" inputmode="decimal" '
      + 'id="g_' + dossId + '_' + c.k + '" data-doss="' + dossId + '" data-col="' + c.k + '" '
      + 'oninput="grilleCellChange(' + dossId + ')" '
      + 'style="width:78px;padding:5px 4px;border:1px solid var(--border);border-radius:6px;font-size:12.5px;text-align:center"></td>';
  };

  const rows = pend.map(r => {
    const nom = esc(r.patient?.nom || '—');
    const doss = esc(r.patient?.dossier || '');
    const sexe = esc(r.patient?.sexe || '');
    return '<tr id="grow_' + r.id + '" data-doss="' + r.id + '">'
      + '<td style="position:sticky;left:0;background:#fff;padding:6px 10px;font-weight:600;font-size:12.5px;border-right:1px solid var(--border)">'
      // ✅ v13.134 — Coche « terminé » : auto quand la ligne est complète, décochable à la main.
      + '<input type="checkbox" id="gsel_' + r.id + '" onclick="event.stopPropagation()" onchange="grilleSelToggle(' + r.id + ')" '
      + 'title="Terminé — inclure dans l\'enregistrement / l\'impression" style="width:16px;height:16px;vertical-align:middle;margin-right:7px;cursor:pointer">'
      + '<span id="gtick_' + r.id + '" style="color:#15803d;font-weight:800;margin-right:4px;visibility:hidden">✓</span>'
      + nom + '<div style="font-size:10.5px;color:var(--text-muted);font-weight:500">N° ' + doss + (sexe ? ' · ' + sexe : '') + '</div></td>'
      + cfg.cols.map(c => cellHtml(r.id, c)).join('') + '</tr>';
  }).join('');

  cont.innerHTML = entete
    + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:8px">' + (cfg.type === 'Hématologie'
        ? 'VGM · TCMH · CCMH et valeurs absolues sont calculés automatiquement. ' : '')
      + 'Laissez une ligne vide pour ne pas l\'enregistrer.</div>'
    + '<div id="grille-hint" style="font-size:12px;color:var(--text-muted);margin-bottom:8px"></div>'
    + '<div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius)"><table style="border-collapse:collapse;width:100%;font-size:12.5px"><thead><tr>'
    + head + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  grilleUpdateHint();
  grilleUpdateSelCount();
}

function _grilleCols() { return (GRILLE_EXAMS[_grilleKey] || {}).cols || []; }
function grilleRowComplete(dossId) {
  return _grilleCols().every(c => {
    const el = document.getElementById('g_' + dossId + '_' + c.k);
    return el && String(el.value).trim() !== '';
  });
}
function grilleRowHasAny(dossId) {
  return _grilleCols().some(c => {
    const el = document.getElementById('g_' + dossId + '_' + c.k);
    return el && String(el.value).trim() !== '';
  });
}
function grilleCellChange(dossId) {
  const complete = grilleRowComplete(dossId);
  const tick = document.getElementById('gtick_' + dossId);
  if (tick) tick.style.visibility = complete ? 'visible' : 'hidden';
  // ✅ v13.134 — Coche « terminé » automatique quand la ligne est complète,
  // sauf si l'utilisateur l'a déjà cochée/décochée à la main (override).
  const sel = document.getElementById('gsel_' + dossId);
  if (sel && _grilleSelForce[dossId] === undefined) sel.checked = complete;
  grilleUpdateSelCount();
  grilleUpdateHint();
}

// ✅ v13.134 — Sélection « terminé » : override manuel + tout cocher + comptage.
function grilleSelToggle(dossId) {
  const sel = document.getElementById('gsel_' + dossId);
  _grilleSelForce[dossId] = !!(sel && sel.checked);
  grilleUpdateSelCount();
}
function grilleSelAll(on) {
  [...document.querySelectorAll('#grille-serie input[id^="gsel_"]')].forEach(cb => {
    cb.checked = !!on;
    _grilleSelForce[cb.id.slice(5)] = !!on;
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
  const cnt = document.getElementById('grille-selcount'); if (cnt) cnt.textContent = n;
  const all = document.getElementById('grille-selall');
  if (all) { all.checked = boxes.length > 0 && n === boxes.length; all.indeterminate = n > 0 && n < boxes.length; }
}
function grilleUpdateHint() {
  const hint = document.getElementById('grille-hint');
  if (!hint) return;
  const rows = [...document.querySelectorAll('#grille-serie tr[data-doss]')];
  const prets = rows.filter(tr => grilleRowComplete(tr.dataset.doss)).length;
  const amorces = rows.filter(tr => grilleRowHasAny(tr.dataset.doss)).length;
  hint.textContent = '✅ ' + prets + ' complète' + (prets > 1 ? 's' : '')
    + ' · ' + amorces + ' commencée' + (amorces > 1 ? 's' : '') + ' sur ' + rows.length;
}

// ── Fusion non destructive d'un sous-objet d'analyse ────────────────
// ✅ v13.131 — CORRECTIF « les autres paramètres disparaissent ».
// Plusieurs paramètres de la grille partagent le MÊME type d'analyse
// (ex. CRP, VIH, Ag HBs, VHC, TPHA… = 'Immuno-Sérologie' ; glycémie,
// créatinine, transaminases = 'Biochimie'). Or grilleBuildResults rejoue
// la ligne dans un formulaire vierge où SEUL l'examen courant est coché :
// collectResults(type) renvoie alors TOUS les analytes du type, mais tous
// VIDES sauf celui qu'on saisit. Remplacer le sous-objet entier
// (newRes[type] = res) écrasait donc les analytes déjà enregistrés du même
// type. On fusionne désormais : on ne recopie que les valeurs NON VIDES du
// nouveau relevé par-dessus l'existant.
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

// ── Rejoue une ligne dans le vrai formulaire et renvoie le JSON du type ──
function grilleBuildResults(cfg, dossId, sexe, age) {
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
    const src = document.getElementById('g_' + dossId + '_' + c.k);
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

async function grilleSaveAll() {
  if (typeof isSpectateur === 'function' && isSpectateur()) { toast('Lecture seule', 'err'); return; }
  const cfg = GRILLE_EXAMS[_grilleKey]; if (!cfg) return;
  // ✅ v13.134 — On n'enregistre QUE les patients cochés (« terminés »). La coche
  // s'auto-active quand la ligne est complète ; l'utilisateur peut en décocher.
  const rows = grilleSelectedIds().filter(id => grilleRowHasAny(id));
  if (!rows.length) { toast('Coche au moins un patient terminé', 'err'); return; }
  const incompletes = rows.filter(id => !grilleRowComplete(id)).length;
  if (incompletes && typeof showConfirmModal === 'function') {
    const ok = await showConfirmModal({
      icon: '⚠️', title: 'Lignes incomplètes',
      message: incompletes + ' ligne(s) commencée(s) mais non complète(s) seront enregistrées telles quelles. Continuer ?',
      confirmText: 'Enregistrer', cancelText: 'Annuler'
    });
    if (!ok) return;
  }

  const backup = (typeof benchSnapshot === 'function') ? benchSnapshot() : null;
  showLoading('Enregistrement du lot…');
  let ok = 0, err = 0;
  const savedIds = [];   // ✅ v13.133 — dossiers enregistrés (pour l'impression du lot)
  const btn = document.getElementById('grille-save'); if (btn) btn.disabled = true;
  try {
    for (const dossId of rows) {
      const record = getDB().find(x => String(x.id) === String(dossId));
      if (!record) { err++; continue; }
      try {
        await ensureFull(record);
        // ✅ v13.132 — Sécurité anti-perte : si le détail complet n'a pas pu être
        // chargé (hors-ligne / erreur réseau), record.resultats ne contient que les
        // clés « _… ». Enregistrer maintenant écraserait les AUTRES types d'analyse
        // déjà saisis (update_resultat remplace tout le JSON). On saute la ligne.
        if (record._light) { err++; continue; }
        const res = grilleBuildResults(cfg, dossId, record.patient?.sexe, record.patient?.age);
        const type = cfg.type;
        const base = record.resultats || {};
        // ✅ v13.131 — fusion non destructive (voir _grilleFusionType) : on
        // préserve les autres analytes du même type déjà enregistrés.
        const newRes = { ...base, [type]: _grilleFusionType(base[type], res) };
        newRes._types = base._types ? [...new Set([...base._types, type])] : [type];
        newRes._facture_seule = false;
        // ✅ v13.130 — Marquer CE paramètre de série comme saisi (clé « _ » conservée
        // par le chargement allégé) pour qu'il sorte de la grille après enregistrement.
        newRes._saisi_serie = Object.assign({}, base._saisi_serie, { [_grilleKey]: true });
        const saved = await updateRecordRemote(record.id, {
          patient: record.patient, type: 'Dossier', resultats: newRes,
          montant: record.montant || 0, prescripteur_id: record.prescripteur_id || null,
        }, { onlyResultats: true });
        if (saved) { ok++; savedIds.push(record.id); } else err++;
      } catch (e) { err++; }
    }
  } finally { if (btn) btn.disabled = false; }

  // Restaurer le formulaire (sans changer de vue).
  if (backup) {
    try {
      Object.keys(backup.ident || {}).forEach(id => { const el = document.getElementById(id); if (el) el.value = backup.ident[id]; });
      getCatalogueComplet().forEach(ex => { const c = document.getElementById(ex.id); const s = backup.coches[ex.id]; if (c && s) c.checked = !!s.c; });
      // ✅ v13.132 — Réinjecter AUSSI les valeurs de résultats du patient actif de la
      // paillasse (l'ancien code ne restaurait que l'identité et les coches, donc une
      // saisie paillasse en cours non enregistrée était perdue après un lot série).
      Object.keys(backup.values || {}).forEach(fid => {
        const el = document.getElementById(fid);
        if (el && el.type !== 'checkbox' && el.type !== 'radio') el.value = backup.values[fid];
      });
      ['Hématologie', 'Biochimie', 'Immuno-Sérologie', 'Groupe sanguin', 'Parasitologie']
        .forEach(t => { try { if (typeof ensureInterpFresh === 'function') ensureInterpFresh(t); } catch (e) {} });
      if (typeof calcFicheTotal === 'function') calcFicheTotal();
    } catch (e) {}
  }

  hideLoading();
  await refreshDB(true);
  // ✅ v13.133 — mémoriser le lot pour proposer l'impression des comptes rendus.
  _grilleDernierLot = savedIds.slice();
  toast('✅ ' + ok + ' ' + cfg.label + ' enregistrée' + (ok > 1 ? 's' : '') + (err ? ' · ' + err + ' erreur(s)' : ''), err ? 'err' : 'ok');
  grilleRender();
  // ✅ v13.134 — Enchaîner l'impression si demandé (bouton « Enreg. + Imprimer »).
  if (window._grilleImprimerApresSave) {
    window._grilleImprimerApresSave = false;
    if (_grilleDernierLot.length) { try { await grilleImprimerLot(); } catch (e) {} }
  }
}

// ✅ v13.134 — Enregistrer les patients cochés PUIS imprimer leurs comptes rendus.
async function grilleSaveAndPrint() {
  window._grilleImprimerApresSave = true;
  await grilleSaveAll();
}

// ✅ v13.133 — Imprime les comptes rendus complets de tous les patients du
// dernier lot enregistré (une fiche par page). Charge le détail complet de
// chaque dossier avant impression.
async function grilleImprimerLot() {
  if (!_grilleDernierLot.length) { toast('Aucun lot récent à imprimer', 'err'); return; }
  if (typeof printLot !== 'function') { toast('Impression indisponible', 'err'); return; }
  showLoading('Préparation de l\'impression…');
  try {
    const db = getDB();
    const records = [];
    for (const id of _grilleDernierLot) {
      const rec = db.find(x => String(x.id) === String(id));
      if (!rec) continue;
      try { await ensureFull(rec); } catch (e) {}
      records.push(rec);
    }
    hideLoading();
    if (!records.length) { toast('Dossiers introuvables', 'err'); return; }
    await printLot(records);
  } catch (e) { hideLoading(); toast('Erreur d\'impression', 'err'); }
}
