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
  ['', '—'], ['neg', '< 6 mg/L'], ['6', '6'], ['12', '12'], ['24', '24'],
  ['48', '48'], ['96', '96'], ['192', '192'], ['384', '≥ 384'],
];
// Options qualitatives des sérologies (identiques au formulaire).
const _SERO_OPTS = [['', '—'], ['Positif', 'Positif'], ['Négatif', 'Négatif'], ['Douteux', 'Douteux']];
// Positif / Négatif simple (goutte épaisse, TDR).
const _PN_OPTS = [['', '—'], ['Positif', 'Positif'], ['Négatif', 'Négatif']];

// ✅ v13.157 — Résultat GE déduit de la densité parasitaire : > 0 → Positif,
//   = 0 → Négatif, densité non saisie → pas de déduction (choix manuel conservé).
function _geResultDeDensite(densStr) {
  const d = parseFloat(densStr);
  if (isNaN(d)) return '';
  return d > 0 ? 'Positif' : 'Négatif';
}
// Dilutions du Widal (identiques au formulaire).
const _WIDAL_OPTS = [['', '—']].concat(
  (typeof WIDAL_DILUTIONS !== 'undefined' ? WIDAL_DILUTIONS : ['Non réalisé', 'Négatif', '1/40', '1/80', '1/160', '1/320'])
    .map(v => [v, v]));
// ✅ v13.147 — Profils d'électrophorèse (mêmes libellés que le <select> du
// formulaire #ephb_profil : la valeur écrite doit correspondre à une option).
const _EPHB_PROFILS = [
  ['', '—'],
  ['Profil AA (Normal)', 'AA (Normal)'],
  ['Profil AS (Drépanocytose trait)', 'AS (trait)'],
  ['Profil SS (Drépanocytose homozygote)', 'SS'],
  ['Profil AC (Trait HbC)', 'AC'],
  ['Profil SC (Drépanocytose SC)', 'SC'],
  ['Profil CC (HbC homozygote)', 'CC'],
  ['β-Thalassémie mineure', 'β-Thal mineure'],
  ['β-Thalassémie majeure', 'β-Thal majeure'],
  ['Profil AF (Hb fœtale élevée)', 'AF'],
];

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
      // ✅ v13.151 — PNE (éosino) et PNB (baso) retirés : calculés automatiquement
      // (baso=0 ; éosino=100−(neutro+lympho+mono)) lors du rejeu.
      { k: 'lymp', lab: 'Lymph %', dom: 'v_lymp', kind: 'num' },
      { k: 'mono', lab: 'Mono %', dom: 'v_mono', kind: 'num' },
    ],
  },
  // ✅ v13.143 — Repérés manquants par le banc d'essai : un patient n'ayant QUE
  // la goutte épaisse, QUE le Widal ou QUE l'urée n'apparaissait pas en série.
  // ✅ v13.157 — GE en série : on saisit la DENSITÉ parasitaire, d'où le résultat
  //   est déduit (densité > 0 → Positif ; = 0 → Négatif). La TDR devient OPTIONNELLE.
  // ✅ GE et TDR SÉPARÉS : « ge_ » ne matche plus « Paludisme » (sinon un TDR seul
  //   ferait apparaître les colonnes GE). Un dossier avec le seul TDR n'affiche
  //   donc que la colonne TDR ; l'ancien libellé fusionné « Goutte épaisse / TDR
  //   Paludisme » (dossiers historiques) matche les deux, ce qui reste correct.
  ge: {
    label: 'Goutte épaisse (GE)', type: 'Hématologie', exId: 'ex_ge', coche: /Goutte|\bGE\b/i,
    filled: h => h['GE - Résultat'] || h['GE - Densité parasitaire (/µL)'],
    cols: [
      { k: 'gedens', lab: 'Densité (/µL)', dom: 'ge_densite', kind: 'num' },
      { k: 'geres', lab: 'Résultat GE', dom: 'ge_result', kind: 'sel', opts: _PN_OPTS },
    ],
    // Résultat GE déduit de la densité dans la CELLULE de grille (affichage direct).
    deriv: (id) => {
      const dens = document.getElementById('g_' + id + '_ge_gedens');
      const res  = document.getElementById('g_' + id + '_ge_geres');
      if (!dens || !res) return;
      const v = _geResultDeDensite(dens.value);
      if (v) res.value = v; // densité saisie → impose le résultat (sinon choix manuel conservé)
    },
    // Complet dès que la densité OU le résultat est renseigné.
    complet: (c) => (c.gedens !== '' || c.geres !== ''),
    // À l'enregistrement : garantir le résultat déduit côté formulaire.
    postSet: () => {
      const d = document.getElementById('ge_densite');
      const r = document.getElementById('ge_result');
      if (d && r) { const v = _geResultDeDensite(d.value); if (v) r.value = v; }
    },
  },
  tdr: {
    label: 'TDR Paludisme', type: 'Hématologie', exId: 'ex_tdr', coche: /TDR/i,
    filled: h => h['GE - TDR'],
    cols: [
      { k: 'tdr', lab: 'TDR', dom: 'ge_tdr', kind: 'sel', opts: _PN_OPTS },
    ],
  },
  // VS — orderable seule, absente de la grille jusqu'ici (marquée « non réalisé »).
  vs: {
    label: 'VS — Vitesse de sédimentation', type: 'Hématologie', exId: 'ex_vs', coche: /Vitesse de s[ée]dimentation|\bVS\b/i,
    filled: h => h['VS (1ère heure)'] && h['VS (1ère heure)'].valeur,
    cols: [
      { k: 'vs', lab: 'VS (mm/h)', dom: 'v_vs', kind: 'num' },
    ],
  },
  // ✅ v13.147 — Électrophorèse de l'hémoglobine : absente de la grille série,
  // elle ne pouvait pas être saisie au fil de la sortie machine (signalé sur le
  // bilan prénatal, qui l'inclut). Les fractions portent leur id brut (ephb_a…),
  // le profil écrit la même valeur que le <select> du formulaire.
  ephb: {
    label: 'Électrophorèse Hb', type: 'Hématologie', exId: 'ex_ephb', coche: /Électro|Electro|Hémoglobine|EPHB/i,
    filled: h => (h['Hb A'] && h['Hb A'].valeur) || (h['Hb A2'] && h['Hb A2'].valeur)
               || (h['Hb S'] && h['Hb S'].valeur) || h['Profil Hb'],
    cols: [
      { k: 'ephba',  lab: 'Hb A %',  dom: 'ephb_a',  kind: 'num' },
      { k: 'ephba2', lab: 'Hb A2 %', dom: 'ephb_a2', kind: 'num' },
      { k: 'ephbf',  lab: 'Hb F %',  dom: 'ephb_f',  kind: 'num' },
      { k: 'ephbs',  lab: 'Hb S %',  dom: 'ephb_s',  kind: 'num' },
      { k: 'ephbc',  lab: 'Hb C %',  dom: 'ephb_c',  kind: 'num' },
      { k: 'ephbprofil', lab: 'Profil', dom: 'ephb_profil', kind: 'sel', opts: _EPHB_PROFILS },
    ],
  },
  // ✅ v13.164 — L'urée n'a PLUS de colonne à saisir en série : elle est DÉDUITE
  //   de la créatinine (urée g/L = créat / 44, voir crea.postSet). Un dossier qui
  //   demande l'urée fait apparaître la colonne « Créatinine (+ urée auto) »
  //   (la créatinine y est saisie, l'urée en est calculée).
  widal: {
    label: 'Widal & Félix (SWF)', type: 'Immuno-Sérologie', exId: 'ex_widal', coche: /Widal|SWF/i,
    filled: s => s['Widal - Salmonella typhi O (TO)'] && s['Widal - Salmonella typhi O (TO)'].titre
                 && s['Widal - Salmonella typhi O (TO)'].titre !== 'Non réalisé',
    // ✅ v13.162 — En routine on ne fait que TO et TH (Salmonella typhi). Les
    //   antigènes paratyphoïdiques AO/AH sont OPTIONNELS : une fiche Widal est
    //   complète dès que TO/TH sont renseignés, sans exiger AO/AH.
    cols: [
      { k: 'wto', lab: 'TO', dom: 'widal_to', kind: 'sel', opts: _WIDAL_OPTS },
      { k: 'wth', lab: 'TH', dom: 'widal_th', kind: 'sel', opts: _WIDAL_OPTS },
      { k: 'wao', lab: 'AO (opt.)', dom: 'widal_ao', kind: 'sel', opts: _WIDAL_OPTS, opt: true },
      { k: 'wah', lab: 'AH (opt.)', dom: 'widal_ah', kind: 'sel', opts: _WIDAL_OPTS, opt: true },
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
    label: 'Créatinine (+ urée, DFG auto)', type: 'Biochimie', exId: 'ex_crea', coche: /Créat|Creat|^Urée$|Uree/i,
    filled: b => b['Créatinine'] && b['Créatinine'].valeur,
    cols: [{ k: 'crea', lab: 'Créatinine (mg/L)', dom: 'v_crea', kind: 'num' }],
    // ✅ v13.151 — L'urée est déduite de la créatinine : urée (g/L) = créat / 44.
    //   Règle centralisée dans deduireUreeDeCrea() ; onParamInput('uree') rafraîchit
    //   l'interprétation (même chemin que le formulaire, sans double traitement).
    // ✅ v13.197 — Le DFG (CKD-EPI, à partir de l'âge/sexe/créatinine) est aussi
    //   calculé en série. Le poids n'existe pas en série → Cockcroft indisponible,
    //   mais la clairance CKD-EPI est produite comme dans le formulaire.
    postSet: () => {
      if (typeof deduireUreeDeCrea === 'function') deduireUreeDeCrea();
      if (typeof onParamInput === 'function') { try { onParamInput('uree'); } catch (e) {} }
      if (typeof recalcDFG === 'function') { try { recalcDFG(); } catch (e) {} }
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
  // ✅ v13.150 — Coagulation TP / TCA : absents de la grille (signalé). TP et TCA
  // sont deux examens distincts ; on les regroupe en une colonne « Coagulation »
  // pour la saisie rapide (chacun facturé séparément à la fiche).
  coag: {
    label: 'Coagulation (TP / TCA)', type: 'Biochimie', exId: 'ex_tp',
    coche: /TP\s*\/?\s*INR|\bTP\b|\bTCA\b|prothrombine|c[ée]phaline/i,
    filled: b => (b['TP / INR'] && b['TP / INR'].valeur) || (b['TCA'] && b['TCA'].valeur),
    cols: [
      { k: 'tp',  lab: 'TP / INR (%)', dom: 'v_tp',  kind: 'num' },
      { k: 'tca', lab: 'TCA (s)',      dom: 'v_tca', kind: 'num' },
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
    // ✅ v13.147 — Ac anti-HBc RETIRÉ de la grille série : rarement demandé en
    // prénatal ici. Il reste facturable et saisissable via le formulaire complet
    // (examen « Ac anti-HBc totaux »), mais ne surcharge plus la grille.
    // ✅ v13.228 — Ac anti-HBs RETIRÉ de la grille série : un BPN ne fait que
    //   l'Ag HBs (dépistage). L'Ac anti-HBs reste saisissable/facturable via le
    //   formulaire complet (examen « Ac anti-HBs » commandé séparément).
    // ✅ TOUT PAR LA SÉRIE — `coche` limité à l'ANTIGÈNE : /HBs/ captait aussi
    //   « Ac anti-HBs », qui n'avait alors AUCUNE case (ni ici ni ailleurs). Il a
    //   désormais sa propre colonne chiffrée (UI/L), créée automatiquement.
    label: 'BPN · Hépatite B (Ag HBs)', type: 'Immuno-Sérologie', exId: 'ex_hbs', coche: /Ag ?HBs|H[ée]patite B/i,
    filled: s => s['Ag HBs'] && s['Ag HBs'].resultat,
    cols: [
      { k: 'hbsag', lab: 'Ag HBs', dom: 'sr_hbsag', kind: 'sel', opts: _SERO_OPTS },
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
  // ✅ v13.145 — Toxo et Rubéole passent en QUALITATIF (sr_) : ce sont des
  // sérologies du bilan prénatal, toujours rendues Positif / Négatif.
  toxo: {
    label: 'Toxoplasmose IgG/IgM', type: 'Immuno-Sérologie', exId: 'ex_toxo', coche: /Toxo/i,
    filled: s => (s['Toxoplasmose IgG'] && s['Toxoplasmose IgG'].resultat) || (s['Toxoplasmose IgM'] && s['Toxoplasmose IgM'].resultat),
    cols: [
      { k: 'toxo', lab: 'Toxo IgG', dom: 'sr_toxo', kind: 'sel', opts: _SERO_OPTS },
      { k: 'toxoig', lab: 'Toxo IgM', dom: 'sr_toxoig', kind: 'sel', opts: _SERO_OPTS },
    ],
  },
  rube: {
    label: 'Rubéole IgG', type: 'Immuno-Sérologie', exId: 'ex_rube', coche: /Rubéole|Rube/i,
    filled: s => s['Rubéole IgG'] && s['Rubéole IgG'].resultat,
    cols: [{ k: 'rubig', lab: 'Rubéole IgG', dom: 'sr_rubig', kind: 'sel', opts: _SERO_OPTS }],
  },
  // ✅ v13.145 — Examens de la liste du laboratoire qui manquaient à la grille.
  aslo: {
    label: 'ASLO', type: 'Immuno-Sérologie', exId: 'ex_aso', coche: /ASLO|Antistrepto/i,
    filled: s => s['ASLO (Antistreptolysines)'] && s['ASLO (Antistreptolysines)'].resultat,
    cols: [{ k: 'aso', lab: 'ASLO', dom: 'sr_aso', kind: 'sel', opts: _SERO_OPTS }],
  },
  lipides: {
    label: 'Bilan lipidique (CT / HDL / TG)', type: 'Biochimie', exId: 'ex_chol',
    coche: /Cholest|HDL|Triglyc|lipid/i,
    filled: b => b['Cholestérol total'] && b['Cholestérol total'].valeur,
    cols: [
      { k: 'chol', lab: 'CT (g/L)', dom: 'v_chol', kind: 'num' },
      { k: 'hdl',  lab: 'HDL (g/L)', dom: 'v_hdl', kind: 'num' },
      { k: 'trig', lab: 'TG (g/L)', dom: 'v_trig', kind: 'num' },
    ],
  },
  // ✅ v13.197 — Ionogramme : on ne saisit plus le sodium. Règle du labo : le Na
  //   est toujours déduit du chlore (Na = Cl / 0.72). On saisit donc K et Cl ; le
  //   sodium est calculé (postSet), comme l'urée l'est depuis la créatinine.
  iono: {
    label: 'Ionogramme (K / Cl → Na auto)', type: 'Biochimie', exId: 'ex_iono', coche: /Ionogramme|Na, K, Cl/i,
    filled: b => b['Chlore (Cl⁻)'] && b['Chlore (Cl⁻)'].valeur,
    cols: [
      { k: 'k',  lab: 'K⁺',  dom: 'v_k',  kind: 'num' },
      { k: 'cl', lab: 'Cl⁻', dom: 'v_cl', kind: 'num' },
    ],
    postSet: () => {
      if (typeof deduireSodiumDeChlore === 'function') deduireSodiumDeChlore();
      if (typeof onParamInput === 'function') { try { onParamInput('na'); } catch (e) {} }
    },
  },
  ua: {
    label: 'Acide urique', type: 'Biochimie', exId: 'ex_ua', coche: /Acide urique/i,
    filled: b => b['Acide urique'] && b['Acide urique'].valeur,
    cols: [{ k: 'ua', lab: 'Acide urique (mg/L)', dom: 'v_ua', kind: 'num' }],
  },
  gs: {
    label: 'BPN · Groupe sanguin (ABO/Rh)', type: 'Groupe sanguin', exId: 'ex_gs', coche: /Groupe|ABO|Rh/i,
    filled: g => g['Groupe ABO'],
    cols: [
      { k: 'abo', lab: 'ABO', dom: 'gs_abo', kind: 'sel', opts: [['', '—'], ['A', 'A'], ['B', 'B'], ['AB', 'AB'], ['O', 'O']] },
      { k: 'rh', lab: 'Rhésus', dom: 'gs_rh', kind: 'sel', opts: [['', '—'], ['Positif', 'Positif'], ['Négatif', 'Négatif']] },
    ],
  },
  // ✅ TOUT PAR LA SÉRIE — il n'y a plus de saisie « directe » (formulaire d'un
  //   patient). Les examens à compte rendu détaillé (cultures, selles) ont une
  //   case « Saisir » qui ouvre leur fiche dans une FENÊTRE, sans quitter la
  //   série ; la RAI a ses propres colonnes.
  bact: {
    label: 'Bactériologie', type: 'Bactériologie', exId: 'ex_ecbu',
    coche: /ECBU|H[ée]moculture|Coproculture|Pr[ée]l[èe]vement de gorge|\bpus\b|plaie|Bact[ée]riolog|Cytobact/i,
    fiche: { panel: 'panel-bacterio', tab: 'bacterio', titre: '🦠 Bactériologie' },
    filled: b => ['Culture', 'Germe identifié', 'Leucocytes (/mm³)', 'Aspect', 'Coloration de Gram'].some(n => b[n]),
    cols: [{ k: 'fiche', lab: 'Fiche', kind: 'fiche' }],
  },
  eps: {
    label: 'Parasitologie des selles', type: 'Parasitologie', exId: 'ex_eps',
    coche: /\bEPS\b|parasitologique des selles/i,
    fiche: { panel: 'panel-parasito', tab: 'parasito', titre: '🦟 Parasitologie des selles' },
    filled: p => !!(p['Résultat global'] || p['Observations']
      || (typeof PARA_EPS !== 'undefined' && PARA_EPS.some(n => p[n]))),
    cols: [{ k: 'fiche', lab: 'Fiche', kind: 'fiche' }],
  },
  rai: {
    label: 'RAI + Phénotypage', type: 'Groupe sanguin', exId: 'ex_rai', coche: /\bRAI\b/i,
    filled: g => g['RAI'],
    cols: [
      { k: 'rai', lab: 'RAI', kind: 'sel', opts: [['', '—'], ['Négative', 'Négative'], ['Positive', 'Positive']] },
      { k: 'pheno', lab: 'Phénotype', kind: 'txt', opt: true },
    ],
    // Pas de champ de formulaire : le résultat est construit depuis les cases.
    build: c => ({ 'RAI': c.rai || '', 'Phénotype érythrocytaire': c.pheno || '' }),
    load: g => ({ rai: g['RAI'] || '', pheno: g['Phénotype érythrocytaire'] || '' }),
  },
};

const _TYPE_TO_TAB = { 'Hématologie': 'hema', 'Biochimie': 'bio', 'Immuno-Sérologie': 'sero', 'Parasitologie': 'parasito', 'Groupe sanguin': 'gs' };

let _grilleKey = 'nfs';
let _grilleDate = null;                 // date filtrée (YYYY-MM-DD) ; '' = toutes
let _grilleInclureReception = false;    // inclure les dossiers « réception seule »
let _grilleInclureSaisis = false;       // ✅ v13.133 — inclure les paramètres déjà saisis (correction)
let _grilleInclureMasquees = false;     // ✅ v13.148 — inclure les fiches masquées pour y saisir des résultats
let _grilleDernierLot = [];             // ✅ v13.133 — ids du dernier lot enregistré (pour impression)
let _grilleSelForce = {};               // ✅ v13.134 — override manuel de la coche « terminé » par dossier
let _grilleFocusId = null;              // ✅ Modification d'un résultat : série centrée sur UN seul dossier

// Date d'un dossier : date de la fiche patient, sinon date d'enregistrement.
function _dateDossier(r) {
  return (r.patient && r.patient.date) || String(r.savedAt || r.created_at || r.createdAt || '').slice(0, 10);
}


// « Non réalisé » est la valeur PAR DÉFAUT de certains menus (Widal) : elle ne
// doit jamais écraser un résultat saisi. Sans ça, un Widal suivi d'une autre
// sérologie sur la même ligne repartait « Non réalisé » à l'enregistrement
// (la collecte de la sérologie suivante relisait les menus Widal remis à zéro).
const _grilleDefaut = x => { const t = String(x).trim(); return t === '' || t === 'Non réalisé'; };
function _grilleValVide(v) {
  if (v == null) return true;
  if (typeof v === 'string') return _grilleDefaut(v);
  if (typeof v === 'object') {
    return !['valeur', 'resultat', 'titre', 'pct'].some(f => v[f] != null && !_grilleDefaut(v[f]));
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

// Fiches validées dans la fenêtre, en attente d'enregistrement : { dossier: { examen: résultats } }.
let _grilleFiches = {};
// Examens à fiche / RAI trouvés déjà remplis (ancien formulaire), par dossier :
// mémorisé pour survivre aux rafraîchissements de la liste légère.
const _grilleFichesSaisies = new Map();
function _grilleCellules(cfg, dossId, examKey) {
  const cells = {};
  cfg.cols.forEach(c => { const el = document.getElementById('g_' + dossId + '_' + examKey + '_' + c.k); cells[c.k] = el ? String(el.value).trim() : ''; });
  return cells;
}
function grilleBuildResults(cfg, dossId, sexe, age, examKey) {
  if (cfg.fiche) return Object.assign({}, (_grilleFiches[dossId] || {})[examKey || _grilleKey] || {});
  if (cfg.build) return cfg.build(_grilleCellules(cfg, dossId, examKey || _grilleKey));
  const tab = _TYPE_TO_TAB[cfg.type] || 'hema';
  if (typeof ensurePanelBuilt === 'function') ensurePanelBuilt(tab);
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  // ✅ v13.258 — Âge AVEC son unité : « 6 mois » posé tel quel dans le champ
  //   numérique p_age devenait vide → profil adulte pour un nourrisson (normes,
  //   interprétations). Nombre nu = années, comme ageEnAnnees().
  const ageM = /^\s*([\d.,]+)\s*(ans?|mois|jours?|j)?/i.exec(age == null ? '' : String(age));
  setV('p_sexe', sexe || '');
  setV('p_age', ageM ? ageM[1].replace(',', '.') : '');
  setV('p_age_unit', !ageM || !ageM[2] ? 'ans' : /mois/i.test(ageM[2]) ? 'mois' : /^j/i.test(ageM[2]) ? 'jours' : 'ans');
  // ✅ v13.258 — Carte DFG remise à zéro pour CHAQUE patient (et pas de poids
  //   hérité : il n'existe pas en série) : elle gardait le premier patient du lot.
  ['dfg_crea', 'dfg_age', 'dfg_sexe', 'dfg_poids', 'p_poids'].forEach(id => setV(id, ''));
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
const GRILLE_ORDRE = ['nfs','vs','ge','tdr','ephb','gly','uree','crea','ua','transa','coag','lipides','iono','crp','widal','aslo','vih','hbs','hcv','tpha','toxo','rube','gs','rai','bact','eps'];

// ✅ Couverture COMPLÈTE du catalogue en saisie en série.
//   Historiquement seuls ~20 examens figuraient dans GRILLE_EXAMS ; un dossier
//   dont AUCUN examen demandé n'y figurait était exclu de la grille (donc « non
//   réalisé » faute d'endroit où le saisir en série). On complète ici, à partir
//   des listes canoniques, toutes les entrées manquantes : biochimie (1 examen =
//   1 ou 2 paramètres → champ v_<id>) et sérologies (sr_/sv_<id>). Les examens
//   déjà couverts à la main (multi-paramètres, dérivations) sont laissés tels
//   quels ; la bactériologie et les forfaits restent sur le formulaire complet.
let _grilleAutoDone = false;
function _grilleEnsureAuto() {
  if (_grilleAutoDone) return;
  if (typeof CATALOGUE_EXAMENS === 'undefined') return; // catalogue pas encore chargé
  _grilleAutoDone = true;
  const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // exId déjà servis par une entrée manuelle, + urée (déduite de la créatinine).
  const dejaEx = new Set(Object.values(GRILLE_EXAMS).map(c => c.exId));
  dejaEx.add('ex_uree');
  // Un examen déjà repérable par le `coche` d'une entrée existante ne doit pas
  // être dupliqué (ex. Triglycérides / HDL couverts par « lipides », TCA par
  // « coag », Urée par « crea »).
  const dejaCouvert = label => Object.values(GRILLE_EXAMS).some(c => c.coche.test(label));
  const bio = {};
  [typeof BIO_GLUCIDES!=='undefined'?BIO_GLUCIDES:[], typeof BIO_REIN!=='undefined'?BIO_REIN:[],
   typeof BIO_FOIE!=='undefined'?BIO_FOIE:[], typeof BIO_LIPIDES!=='undefined'?BIO_LIPIDES:[],
   typeof BIO_IONO!=='undefined'?BIO_IONO:[], typeof BIO_FER!=='undefined'?BIO_FER:[],
   typeof BIO_CARD!=='undefined'?BIO_CARD:[], typeof BIO_HORM!=='undefined'?BIO_HORM:[],
   typeof BIO_COAG!=='undefined'?BIO_COAG:[], typeof BIO_AUTRE!=='undefined'?BIO_AUTRE:[]]
    .forEach(L => L.forEach(p => { bio[p.id] = p; }));
  const sero = {};
  (typeof SERO_TESTS !== 'undefined' ? SERO_TESTS : []).forEach(t => { sero[t.id] = t; });
  const ajoutes = [];
  CATALOGUE_EXAMENS.forEach(ex => {
    if (dejaEx.has(ex.id) || dejaCouvert(ex.label)) return;
    const suffixe = ex.id.replace(/^ex_/, '');
    const key = 'auto_' + suffixe;
    const coche = new RegExp('^' + escRe(ex.label) + '$');
    if (ex.tab === 'bio') {
      // Un examen = ses paramètres. La plupart : le suffixe de l'id = l'id du
      // paramètre ; les exceptions (id divergent, ou 2 paramètres) sont listées.
      const MAP = { ex_bili: ['bili', 'bilid'], ex_hba1c: ['hba'] };
      let pids = MAP[ex.id] || [suffixe];
      pids = pids.filter(pid => bio[pid] && pid !== 'ldl'); // LDL calculé (Friedewald)
      if (!pids.length) return;
      const noms = pids.map(pid => bio[pid].name);
      GRILLE_EXAMS[key] = {
        label: ex.label, type: 'Biochimie', exId: ex.id, coche,
        filled: b => noms.some(n => b[n] && b[n].valeur),
        cols: pids.map(pid => ({ k: pid, lab: bio[pid].name, dom: 'v_' + pid, kind: 'num' })),
      };
      ajoutes.push(key);
    } else if (ex.tab === 'sero') {
      const t = sero[suffixe];
      if (!t) return;
      const quant = t.type === 'quant';
      GRILLE_EXAMS[key] = {
        label: ex.label, type: 'Immuno-Sérologie', exId: ex.id, coche,
        filled: s => s[t.name] && (s[t.name].resultat || s[t.name].valeur),
        cols: [ quant
          ? { k: t.id, lab: t.name + (t.unit ? ' (' + t.unit + ')' : ''), dom: 'sv_' + t.id, kind: 'num' }
          : { k: t.id, lab: t.name, dom: 'sr_' + t.id, kind: 'sel', opts: _SERO_OPTS } ],
      };
      ajoutes.push(key);
    }
  });
  ajoutes.forEach(k => { if (GRILLE_ORDRE.indexOf(k) < 0) GRILLE_ORDRE.push(k); });
}

// Examens de la grille réellement demandés pour ce dossier.
function grilleExamsDuDossier(r) {
  _grilleEnsureAuto();
  const coches = (r.resultats && r.resultats._examens_coches) || {};
  // ✅ Dossier abîmé (versions anciennes) : résultats présents mais liste des
  //   examens demandés perdue → examens déduits des résultats, pour pouvoir le
  //   rouvrir et le corriger dans la série (l'ancien « mode récupération »).
  const aucunCoche = Array.isArray(coches) ? !coches.length
    : !Object.keys(coches).some(t => (coches[t] || []).length);
  if (aucunCoche) {
    const res = r.resultats || {};
    return GRILLE_ORDRE.filter(k => {
      const cfg = GRILLE_EXAMS[k], t = cfg && res[cfg.type];
      try { return !!(t && typeof t === 'object' && cfg.filled && cfg.filled(t)); } catch (e) { return false; }
    });
  }
  return GRILLE_ORDRE.filter(k => {
    const cfg = GRILLE_EXAMS[k]; if (!cfg) return false;
    const liste = coches[cfg.type] || [];
    return liste.some(l => cfg.coche.test(l));
  });
}
// Examens déjà enregistrés en série pour ce dossier.
function grilleExamsSaisis(r) {
  const res = r.resultats || {};
  const m = res._saisi_serie || {}, st = res._st_fait || {};
  return GRILLE_ORDRE.filter(k => {
    if (m[k]) return true;
    const cfg = GRILLE_EXAMS[k];
    // Examens à fiche / RAI : remplis autrement (ancien formulaire) ou marqués « déjà saisi ».
    if (!cfg || !(cfg.fiche || cfg.build)) return false;
    if (st[cfg.exId]) return true;
    const memo = _grilleFichesSaisies.get(r.id);
    if (memo && memo.has(k)) return true;
    const t = res[cfg.type];
    try { return !!(t && typeof t === 'object' && cfg.filled && cfg.filled(t)); } catch (e) { return false; }
  });
}
// Examens restant à saisir.
function grilleExamsRestants(r) {
  const faits = new Set(grilleExamsSaisis(r));
  return grilleExamsDuDossier(r).filter(k => !faits.has(k));
}

// ✅ v13.148 — Source des dossiers de la grille. Par défaut = getDB() (qui exclut
// les fiches masquées). Si « fiches masquées » est coché, on y ajoute les fiches
// masquées que l'utilisateur a le droit de traiter (admin : toutes ; sinon : les
// siennes ou celles qu'il a masquées). Le serveur applique de toute façon le
// contrôle de propriété sur update_resultat ; on ne fait qu'exposer la saisie.
function grilleSourceDB() {
  let base; try { base = getDB(); } catch (e) { base = []; }
  if (!_grilleInclureMasquees) return base;
  let cache; try { cache = (typeof _dbCache !== 'undefined' && _dbCache) ? _dbCache : []; } catch (e) { cache = []; }
  const seen = new Set(base.map(r => r.id));
  // ✅ v13.249 — règle unique, partagée avec l'impression (ui-auth.js).
  const extra = cache.filter(r => r && r.restrictedBy && !r.deletedAt && !r._hardDeleted
    && !seen.has(r.id) && peutOuvrirFicheMasquee(r));
  return base.concat(extra);
}

// Patients à afficher : filtres date / réception seule, et au moins un examen
// de la grille à saisir (sauf si « déjà saisis » est coché).
function grilleDossiers() {
  let db = grilleSourceDB();
  // ✅ Modification ciblée : quand on entre par « Modifier » sur un dossier, la
  //   grille ne montre QUE ce dossier (tous ses examens, déjà saisis compris).
  if (_grilleFocusId != null) {
    return db.filter(r => r.id === _grilleFocusId
      && isDossierRecord(r) && !r.deletedAt && !r._hardDeleted
      && grilleExamsDuDossier(r).length);
  }
  return db.filter(r => {
    if (!isDossierRecord(r) || r.deletedAt || r._hardDeleted) return false;
    if (!_grilleInclureReception && r.resultats && r.resultats._reception_seule) return false;
    if (_grilleDate && _dateDossier(r) !== _grilleDate) return false;
    if (!grilleExamsDuDossier(r).length) return false;
    // ✅ « Résultats à saisir » : on ne garde que les dossiers de la catégorie choisie.
    if (_grilleModeASaisir) return _grilleDansSemaine(r) && grilleClesAffichees(r).length > 0;
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
  dossiers.forEach(r => (_grilleModeASaisir ? grilleClesAffichees(r) : grilleExamsDuDossier(r)).forEach(k => vus.add(k)));
  return GRILLE_ORDRE.filter(k => vus.has(k));
}

// ══════════════════════════════════════════════════════════════════════
//  « RÉSULTATS À SAISIR » — un seul écran, ouvert depuis l'Historique, pour
//  les dossiers dont le résultat arrive APRÈS l'enregistrement :
//    • 🤰 BPN              → tous les composants du bilan, côte à côte
//    • 🧬 Électrophorèse   → profils rendus par le labo externe
//    • 📦 Sous-traités     → tous les examens envoyés dehors
//  Il réutilise la grille (mêmes cases, même enregistrement atomique, même
//  passage automatique à « Terminé »). En plus : TOUTES les dates (un résultat
//  sous-traité revient des jours plus tard) et un accès au formulaire complet
//  pour ce que la grille ne gère pas (cultures, comptes rendus texte).
// ══════════════════════════════════════════════════════════════════════
let _grilleModeASaisir = false;
let _grilleCategorie = '';      // '' = toutes | 'bpn' | 'electro' | 'st'
let _grilleRetourVue = '';      // vue à rouvrir en quittant (ex. 'historique')
let _grilleHorsListe = [];      // dossiers à saisir sur le formulaire complet (vérifiés)
let _grilleHorsEnCours = false; // vérification asynchrone en cours
// ✅ v13.233 — Par SEMAINE (lundi → dimanche). null = semaine en cours.
let _grilleSemaineRef = null;
let _grilleToutesSemaines = false;

function _grilleYmd(d) {
  const pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function _grilleBornesSemaine() {
  const x = _grilleSemaineRef ? new Date(_grilleSemaineRef) : new Date();
  x.setHours(12, 0, 0, 0);
  const j = x.getDay();                       // dimanche = 0
  x.setDate(x.getDate() - (j === 0 ? 6 : j - 1));
  const lundi = new Date(x), dim = new Date(x); dim.setDate(dim.getDate() + 6);
  return { lundi, dim, du: _grilleYmd(lundi), au: _grilleYmd(dim) };
}
// Le dossier tombe-t-il dans la semaine affichée ? (toujours vrai hors « à saisir »)
function _grilleDansSemaine(r) {
  if (!_grilleModeASaisir || _grilleToutesSemaines) return true;
  const b = _grilleBornesSemaine(), d = _dateDossier(r);
  return d >= b.du && d <= b.au;
}
function _grilleLibelleSemaine(b) {
  const d1 = b.lundi.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const d2 = b.dim.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return 'Semaine du lundi ' + d1 + ' au dimanche ' + d2;
}
function grilleSemaineDecaler(n) {
  const b = _grilleBornesSemaine(); b.lundi.setDate(b.lundi.getDate() + 7 * n);
  _grilleSemaineRef = b.lundi; _grilleToutesSemaines = false;
  _grilleHorsListe = []; grilleRender(); grilleVerifierHorsSerie();
}
function grilleSemaineCourante() {
  _grilleSemaineRef = null; _grilleToutesSemaines = false;
  _grilleHorsListe = []; grilleRender(); grilleVerifierHorsSerie();
}
function grilleToggleToutesSemaines(on) {
  _grilleToutesSemaines = !!on;
  _grilleHorsListe = []; grilleRender(); grilleVerifierHorsSerie();
}

// Examens envoyés en sous-traitance (identifiants du catalogue).
const GRILLE_ST_EX = new Set([
  // Hormones, marqueurs, vitamines
  'ex_tsh','ex_ft4','ex_psa','ex_cort','ex_acth','ex_lh','ex_fsh','ex_e2','ex_prog','ex_test','ex_prl',
  'ex_amh','ex_pth','ex_bhcg','ex_vitd','ex_b12','ex_fol','ex_fer','ex_ferr','ex_zinc','ex_cuiv',
  // Cardiaques, infection, hémostase
  'ex_trop','ex_bnp','ex_ck','ex_ckmb','ex_myog','ex_pct','ex_ddim','ex_fibr','ex_tp','ex_tca',
  // Bactériologie
  'ex_ecbu','ex_hemo','ex_copro','ex_pg','ex_pus',
  // HbA1c, RAI, microalbuminurie…
  'ex_hba1c','ex_rai','ex_malb','ex_hbsac','ex_hbcac','ex_ldh','ex_amy','ex_lip',
]);
function grilleEstSousTraite(k) { const c = GRILLE_EXAMS[k]; return !!c && GRILLE_ST_EX.has(c.exId); }

// Examens (clés de la grille) d'un dossier qui relèvent d'une catégorie.
//   restantsSeulement : ignore l'option « déjà saisis » (compteurs, pastille).
function grilleClesCategorie(r, cat, restantsSeulement) {
  const liste = (restantsSeulement || !_grilleInclureSaisis) ? grilleExamsRestants(r) : grilleExamsDuDossier(r);
  if (cat === 'bpn')     return (typeof estBPN === 'function' && estBPN(r)) ? liste : [];
  if (cat === 'electro') return liste.filter(k => k === 'ephb');
  if (cat === 'st')      return liste.filter(grilleEstSousTraite);
  return [];
}
// Examens « à fiche » (cultures, selles) encore à saisir pour ce dossier.
function _grilleFichesRestantes(r) {
  return grilleExamsRestants(r).filter(k => GRILLE_EXAMS[k] && GRILLE_EXAMS[k].fiche);
}
// Examens affichés pour un dossier dans l'écran « Résultats à saisir ».
function grilleClesAffichees(r) {
  if (_grilleCategorie) return grilleClesCategorie(r, _grilleCategorie);
  // Cultures et selles : résultat qui arrive après coup → toujours dans « Tout ».
  const fiches = _grilleFichesRestantes(r);
  const u = new Set([].concat(grilleClesCategorie(r, 'bpn'), grilleClesCategorie(r, 'electro'), grilleClesCategorie(r, 'st'), fiches));
  return GRILLE_ORDRE.filter(k => u.has(k));
}
// Y a-t-il une valeur saisie quelque part dans cet objet de résultats ?
function _grilleAUneValeur(o) {
  if (o == null) return false;
  if (typeof o === 'string') return o.trim() !== '';
  if (typeof o === 'number') return true;
  if (Array.isArray(o)) return o.some(_grilleAUneValeur);
  if (typeof o === 'object') return Object.keys(o).some(k => k.charAt(0) !== '_' && _grilleAUneValeur(o[k]));
  return false;
}
// Examens que la grille NE gère PAS (cultures, parasitologie des selles, RAI…) et pas
// encore marqués saisis. `st` = envoyé en sous-traitance. Ils se saisissent sur le
// formulaire complet : sans cette liste, ils n'auraient plus aucun chemin de saisie.
function grilleHorsSerie(r) {
  const coches = (r.resultats && r.resultats._examens_coches) || {};
  const liste = Array.isArray(coches) ? coches : [].concat.apply([], Object.keys(coches).map(t => coches[t] || []));
  const faits = (r.resultats && r.resultats._st_fait) || {};
  const couverts = grilleExamsDuDossier(r).map(k => GRILLE_EXAMS[k]);
  const cat = (typeof CATALOGUE_EXAMENS !== 'undefined') ? CATALOGUE_EXAMENS : [];
  const out = [];
  liste.forEach(label => {
    const ex = cat.find(e => e.label === label);
    if (!ex || /forfait/i.test(ex.label) || faits[ex.id]) return;     // le forfait n'est pas un examen à saisir
    if (couverts.some(cfg => cfg.coche.test(label))) return;          // la grille s'en charge
    out.push({ id: ex.id, label: ex.label, tab: ex.tab, st: GRILLE_ST_EX.has(ex.id) });
  });
  return out;
}
// Dossiers récents (30 jours) qui ont des examens hors grille — candidats à vérifier.
function _grilleHorsCandidats() {
  const d = new Date(); d.setDate(d.getDate() - 30);
  const limite = _grilleYmd(d);
  const garder = r => (_grilleModeASaisir && !_grilleToutesSemaines) ? _grilleDansSemaine(r) : _dateDossier(r) >= limite;
  return grilleSourceDB().filter(r => isDossierRecord(r) && !r.deletedAt && !r._hardDeleted
      && !(r.resultats && r.resultats._reception_seule) && garder(r))
    .map(r => ({ r, ex: grilleHorsSerie(r) })).filter(x => x.ex.length);
}
// Vérifie sur le dossier COMPLET (la liste légère n'a pas les résultats) que la
// culture n'est pas déjà saisie ; ne garde que ce qui reste vraiment à faire.
// ✅ TOUT PAR LA SÉRIE — Une culture, des selles ou une RAI déjà saisies avec
//   l'ancien formulaire ne sont pas marquées « saisi en série », et la liste
//   légère n'a pas le détail des résultats : on charge ces dossiers-là en
//   arrière-plan, puis on réaffiche (ils sortent alors de « à saisir »).
const _grilleFichesVerifiees = new Set();
let _grilleFichesEnCours = null;
function _grilleFichesCandidats() {
  let db; try { db = grilleSourceDB(); } catch (e) { return []; }
  return db.filter(r => r && r._light && !_grilleFichesVerifiees.has(r.id) && !r.deletedAt && !r._hardDeleted
    && (typeof isDossierRecord !== 'function' || isDossierRecord(r))
    && grilleExamsRestants(r).some(k => GRILLE_EXAMS[k] && (GRILLE_EXAMS[k].fiche || GRILLE_EXAMS[k].build)));
}
function grilleVerifierFiches() {
  if (_grilleFichesEnCours) return _grilleFichesEnCours;
  const cand = _grilleFichesCandidats();
  if (!cand.length) return Promise.resolve(false);
  _grilleFichesEnCours = (async () => {
    let change = false;
    for (let i = 0; i < cand.length; i += 6) {
      await Promise.all(cand.slice(i, i + 6).map(async r => {
        const avant = grilleExamsRestants(r).length;
        try { if (typeof ensureFull === 'function') await ensureFull(r); } catch (e) {}
        if (r._light) return;                       // détail indisponible (hors-ligne) : on réessaiera
        _grilleFichesVerifiees.add(r.id);
        const faits = new Set(grilleExamsSaisis(r).filter(k => GRILLE_EXAMS[k] && (GRILLE_EXAMS[k].fiche || GRILLE_EXAMS[k].build)));
        if (faits.size) _grilleFichesSaisies.set(r.id, faits);
        if (grilleExamsRestants(r).length !== avant) change = true;
      }));
    }
    return change;
  })();
  _grilleFichesEnCours.then(change => {
    _grilleFichesEnCours = null;
    if (!change) return;
    const cont = document.getElementById('grille-serie');
    if (cont && cont.style.display !== 'none') { try { grilleRender(); } catch (e) {} }
    if (typeof majBoutonASaisir === 'function') { try { majBoutonASaisir(); } catch (e) {} }
  }, () => { _grilleFichesEnCours = null; });
  return _grilleFichesEnCours;
}
async function grilleVerifierHorsSerie() {
  grilleVerifierFiches();
  if (_grilleHorsEnCours) return;
  _grilleHorsEnCours = true;
  try {
    const cand = _grilleHorsCandidats();
    const out = [];
    for (let i = 0; i < cand.length; i += 6) {
      await Promise.all(cand.slice(i, i + 6).map(async x => {
        try { if (typeof ensureFull === 'function') await ensureFull(x.r); } catch (e) {}
        const res = x.r.resultats || {};
        const reste = x.ex.filter(e => {
          if (e.tab === 'bacterio') return !_grilleAUneValeur(res['Bactériologie']);
          if (e.tab === 'parasito') return !_grilleAUneValeur(res['Parasitologie']);
          return true;      // autres (RAI…) : à marquer « déjà saisi » à la main
        });
        if (reste.length) out.push({ id: x.r.id, nom: (x.r.patient && x.r.patient.nom) || '—',
          dossier: (x.r.patient && x.r.patient.dossier) || '', exams: reste });
      }));
    }
    _grilleHorsListe = out;
  } finally { _grilleHorsEnCours = false; }
  if (_grilleModeASaisir) grilleRender();
}
// Compteurs des pastilles (sur les mêmes dossiers que la grille, toutes catégories).
function _grilleBaseASaisir(r) {
  return isDossierRecord(r) && !r.deletedAt && !r._hardDeleted
    && !(!_grilleInclureReception && r.resultats && r.resultats._reception_seule)
    && (!_grilleDate || _dateDossier(r) === _grilleDate)
    && _grilleDansSemaine(r);
}
function grilleCompteurs() {
  _grilleEnsureAuto();
  const c = { tous: 0, bpn: 0, electro: 0, st: 0 };
  grilleSourceDB().forEach(r => {
    if (!_grilleBaseASaisir(r)) return;
    const b = grilleClesCategorie(r, 'bpn', true).length > 0;
    const e = grilleClesCategorie(r, 'electro', true).length > 0;
    const t = grilleClesCategorie(r, 'st', true).length > 0;
    const f = _grilleFichesRestantes(r).length > 0;      // cultures, selles
    if (b) c.bpn++; if (e) c.electro++; if (t) c.st++;
    if (b || e || t || f) c.tous++;
  });
  // Cultures / hors grille (déjà vérifiées) : comptées avec les sous-traités.
  _grilleHorsListe.forEach(h => {
    const r = _grilleDossier(h.id);
    const dejaSt = !!r && grilleClesCategorie(r, 'st', true).length > 0;
    const dejaAutre = !!r && (grilleClesCategorie(r, 'bpn', true).length > 0 || grilleClesCategorie(r, 'electro', true).length > 0);
    if (!dejaSt && h.exams.some(e => e.st)) c.st++;
    if (!dejaSt && !dejaAutre) c.tous++;
  });
  return c;
}
// Dossiers en attente AVANT la semaine affichée (grille seulement).
function grilleEnAttenteAvant() {
  if (!_grilleModeASaisir || _grilleToutesSemaines) return 0;
  const du = _grilleBornesSemaine().du;
  let n = 0;
  grilleSourceDB().forEach(r => {
    if (!isDossierRecord(r) || r.deletedAt || r._hardDeleted) return;
    if (r.resultats && r.resultats._reception_seule) return;
    if (_dateDossier(r) >= du) return;
    if (grilleClesCategorie(r, 'bpn', true).length || grilleClesCategorie(r, 'electro', true).length
        || grilleClesCategorie(r, 'st', true).length || _grilleFichesRestantes(r).length) n++;
  });
  return n;
}
// Nombre affiché sur le bouton de l'Historique (dossiers à saisir, toutes dates).
function grilleCompteASaisir() {
  const sv = [_grilleDate, _grilleInclureReception, _grilleToutesSemaines, _grilleHorsListe];
  _grilleDate = ''; _grilleInclureReception = false; _grilleToutesSemaines = true;
  if (!_grilleModeASaisir) _grilleHorsListe = [];
  try { return grilleCompteurs().tous; }
  finally { _grilleDate = sv[0]; _grilleInclureReception = sv[1]; _grilleToutesSemaines = sv[2]; _grilleHorsListe = sv[3]; }
}

function grilleSetCategorie(cat) { _grilleCategorie = cat || ''; grilleRender(); }

// Ouvre l'écran depuis l'Historique : toutes les dates, rien d'autre à régler.
async function ouvrirResultatsASaisir(cat) {
  if (typeof isSpectateur === 'function' && isSpectateur()) { toast('Lecture seule', 'err'); return; }
  _grilleModeASaisir = true;
  _grilleCategorie = cat || '';
  _grilleRetourVue = 'historique';
  _grilleDate = '';                 // un résultat sous-traité revient des jours plus tard
  _grilleInclureSaisis = false;
  _grilleInclureReception = false;
  _grilleHorsListe = [];
  _grilleSemaineRef = null;         // semaine en cours
  _grilleToutesSemaines = false;
  try { if (typeof showView === 'function') showView('saisie'); } catch (e) {}
  await ouvrirGrille(_grilleKey, { aSaisir: true });
  grilleVerifierHorsSerie();        // cultures : vérifiées en arrière-plan, puis réaffichées
}

// Formulaire complet pour un dossier hors grille (culture…).
async function grilleOuvrirComplet(id) {
  const cont = document.getElementById('grille-serie'); if (cont) cont.style.display = 'none';
  _grilleModeASaisir = false; _grilleCategorie = ''; _grilleRetourVue = ''; _grilleDate = null;
  try { if (typeof showView === 'function') showView('saisie'); } catch (e) {}
  if (typeof fillAllResults === 'function') await fillAllResults(id);
}
// Marque un examen hors grille comme déjà saisi (retire le dossier de la liste).
async function grilleMarquerFait(id, exId) {
  const rec = _grilleDossier(id); if (!rec) return;
  try { if (typeof ensureFull === 'function') await ensureFull(rec); } catch (e) {}
  if (rec._light) { toast('Impossible hors-ligne — réessayez connecté', 'err'); return; }
  const faits = Object.assign({}, (rec.resultats && rec.resultats._st_fait) || {}, { [exId]: true });
  rec.resultats = Object.assign({}, rec.resultats || {}, { _st_fait: faits });
  const ok = await updateRecordRemote(id, rec, { onlyResultats: true });
  if (ok) {
    _grilleHorsListe = _grilleHorsListe.map(h => h.id !== id ? h : Object.assign({}, h, { exams: h.exams.filter(e => e.id !== exId) }))
      .filter(h => h.exams.length);
    toast('✓ Marqué comme saisi', 'ok');
    grilleRender();
  }
}
// Bloc « formulaire complet » sous la grille.
function _grilleHorsHtml() {
  if (!_grilleModeASaisir || (_grilleCategorie && _grilleCategorie !== 'st')) return '';
  if (_grilleHorsEnCours && !_grilleHorsListe.length) {
    return '<div style="margin-top:14px;font-size:12px;color:var(--text-muted)">🦠 Vérification des cultures…</div>';
  }
  const vus = _grilleHorsListe
    .map(h => Object.assign({}, h, { exams: _grilleCategorie === 'st' ? h.exams.filter(e => e.st) : h.exams }))
    .filter(h => h.exams.length);
  if (!vus.length) return '';
  const lignes = vus.map(h =>
    '<tr data-hors="' + h.id + '"><td style="padding:6px 10px;font-weight:600">' + esc(h.nom)
    + '<div style="font-size:10.5px;color:var(--text-muted);font-weight:500">N° ' + esc(h.dossier) + '</div></td>'
    + '<td style="padding:6px 10px">' + h.exams.map(e => esc(e.label)).join(' · ') + '</td>'
    + '<td style="padding:6px 10px;text-align:right;white-space:nowrap">'
    + '<button class="btn btn-primary" style="font-size:12px;padding:5px 11px" onclick="grilleOuvrirComplet(' + h.id + ')">↗ Saisir</button> '
    + h.exams.map(e => '<button class="btn btn-outline" style="font-size:11.5px;padding:4px 9px" title="Retirer de la liste : ' + esc(e.label) + ' est déjà saisi" '
        + 'onclick="grilleMarquerFait(' + h.id + ',\'' + e.id + '\')">✓ Déjà saisi</button>').join(' ')
    + '</td></tr>').join('');
  return '<div id="grille-hors" style="margin-top:16px;border:1px solid #fde68a;background:#fffbeb;border-radius:var(--radius);padding:10px 12px">'
    + '<div style="font-weight:800;font-size:13px;color:#92400e;margin-bottom:6px">🦠 À saisir sur le formulaire complet (' + vus.length + ')</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:6px">Cultures, parasitologie des selles, RAI… : examens à compte rendu libre que la grille ne gère pas.</div>'
    + '<table style="width:100%;font-size:12.5px;border-collapse:collapse"><tbody>' + lignes + '</tbody></table></div>';
}
// Pastilles de catégorie.
function _grilleChipsHtml() {
  if (!_grilleModeASaisir) return '';
  const c = grilleCompteurs();
  const chip = (cat, lab, n) =>
    '<button class="btn ' + (_grilleCategorie === cat ? 'btn-primary' : 'btn-outline') + '" data-cat="' + cat + '" '
    + 'style="font-size:12.5px;padding:6px 13px" onclick="grilleSetCategorie(\'' + cat + '\')">' + lab
    + ' <span style="opacity:.8;font-weight:700">' + n + '</span></button>';
  const b = _grilleBornesSemaine();
  const courante = b.du <= _grilleYmd(new Date()) && _grilleYmd(new Date()) <= b.au;
  const avant = grilleEnAttenteAvant();
  const nav = '<div id="grille-semaine" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">'
    + (_grilleToutesSemaines
        ? '<span style="font-weight:800;font-size:13.5px;color:var(--cpmi-deep)">📅 Toutes les semaines</span>'
          + '<button class="btn btn-outline" style="font-size:12px;padding:4px 10px" onclick="grilleToggleToutesSemaines(false)">Par semaine</button>'
        : '<button class="btn btn-outline" style="font-size:13px;padding:4px 11px" title="Semaine précédente" onclick="grilleSemaineDecaler(-1)">◀</button>'
          + '<span id="grille-semaine-label" style="font-weight:800;font-size:13.5px;color:var(--cpmi-deep);min-width:250px;text-align:center">📅 ' + esc(_grilleLibelleSemaine(b)) + '</span>'
          + '<button class="btn btn-outline" style="font-size:13px;padding:4px 11px" title="Semaine suivante" onclick="grilleSemaineDecaler(1)">▶</button>'
          + (courante ? '' : '<button class="btn btn-outline" style="font-size:12px;padding:4px 10px" onclick="grilleSemaineCourante()">Cette semaine</button>')
          + '<button class="btn btn-outline" style="font-size:12px;padding:4px 10px" onclick="grilleToggleToutesSemaines(true)">Toutes les semaines</button>')
    + '</div>'
    + (avant ? '<div id="grille-avant" style="margin:-2px 0 10px;font-size:12.5px;color:#b45309;font-weight:600">⚠ '
        + avant + ' dossier(s) encore en attente les semaines précédentes — '
        + '<a href="#" onclick="grilleSemaineDecaler(-1);return false" style="color:#b45309">voir la semaine précédente</a> · '
        + '<a href="#" onclick="grilleToggleToutesSemaines(true);return false" style="color:#b45309">tout voir</a></div>' : '');
  return nav + '<div id="grille-chips" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'
    + chip('', 'Tout', c.tous) + chip('bpn', '🤰 BPN', c.bpn)
    + chip('electro', '🧬 Électrophorèse', c.electro) + chip('st', '📦 Sous-traités', c.st) + '</div>';
}

// Jour LOCAL (YYYY-MM-DD). ⚠ NE PAS utiliser toISOString() : il renvoie la date
// UTC — un poste réglé sur un fuseau décalé pouvait filtrer sur la veille/le
// lendemain et la grille s'affichait vide (« aucun patient »).
function _grilleJourLocal() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

async function ouvrirGrille(key, opts) {
  if (typeof isSpectateur === 'function' && isSpectateur()) { toast('Lecture seule', 'err'); return; }
  // Toute entrée AUTRE que « Résultats à saisir » quitte ce mode (et la date « toutes »).
  if (!(opts && opts.aSaisir)) {
    if (_grilleModeASaisir && _grilleDate === '') _grilleDate = null;
    _grilleModeASaisir = false; _grilleCategorie = ''; _grilleRetourVue = '';
  }
  _grilleFocusId = null;   // entrée normale : liste complète (pas de dossier ciblé)
  if (key && GRILLE_EXAMS[key]) _grilleKey = key;
  if (_grilleDate === null) {
    try { _grilleDate = _grilleJourLocal(); } catch (e) { _grilleDate = ''; }
  }
  const cont = document.getElementById('grille-serie');
  if (!cont) return;
  ['fiche-identification', 'zone-saisie'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  cont.style.display = '';
  // ✅ v13.173 — RECHARGER la base AVANT d'afficher. Sans ça, entrer dans la saisie en
  //   série juste après la connexion (cache pas encore peuplé) montrait une
  //   grille vide alors qu'il y avait des patients à saisir. On rafraîchit puis
  //   on rend ; le rendu immédiat sert de repli si le réseau est lent/absent.
  grilleRender();
  if (typeof refreshDB === 'function') {
    try {
      if (typeof showLoading === 'function') showLoading('Chargement des dossiers…');
      await refreshDB(true);
    } catch (e) { /* réseau : on garde ce qui est déjà en cache */ }
    finally { if (typeof hideLoading === 'function') hideLoading(); }
    grilleRender();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function ouvrirGrilleNFS() { ouvrirGrille('nfs'); }

// ✅ MODIFIER UN RÉSULTAT — passe TOUJOURS par la saisie en série (choix « série
//   uniquement » : on évite la page un-patient qui plantait). On ouvre la grille
//   centrée sur ce seul dossier, avec « déjà saisis » activé pour rouvrir et
//   corriger les valeurs existantes. Aucun handler ni id de saisie n'est modifié.
async function ouvrirGrilleDossier(id) {
  if (typeof isSpectateur === 'function' && isSpectateur()) { toast('Lecture seule', 'err'); return; }
  let rec = null; try { rec = getDB().find(r => r.id === id) || null; } catch (e) {}
  // Détail complet d'abord : un dossier abîmé se reconnaît à ses résultats.
  if (rec) { try { if (typeof ensureFull === 'function') await ensureFull(rec); } catch (e) {} }
  _grilleFocusId = id;
  _grilleInclureSaisis = true;            // rouvrir les valeurs déjà enregistrées
  _grilleInclureReception = true;         // ne pas exclure un dossier « réception seule »
  _grilleDate = '';                       // le focus rend le filtre date inutile
  // Si la fiche est masquée/restreinte, l'inclure pour pouvoir la corriger.
  if (rec && rec.restrictedBy) _grilleInclureMasquees = true;
  // Choisir un examen présent pour la vue mobile « un examen à la fois ».
  try {
    const exs = rec ? grilleExamsDuDossier(rec) : [];
    if (exs.length) { _grilleKey = exs[0]; _grilleMobileExam = exs[0]; }
  } catch (e) {}
  // La série vit dans la vue « saisie » : s'y rendre d'abord si besoin.
  try { if (typeof showView === 'function') showView('saisie'); } catch (e) {}
  await ouvrirGrille(_grilleKey);
  _grilleFocusId = id;                     // ouvrirGrille l'a remis à null : on le repose
  // ouvrirGrille a rechargé la liste (fiches « légères ») : redonner le détail
  // à ce dossier, sans quoi un dossier abîmé n'aurait plus d'examen visible.
  try { const r2 = getDB().find(r => r.id === id); if (r2 && typeof ensureFull === 'function') await ensureFull(r2); } catch (e) {}
  grilleRender();
}
function fermerGrille() {
  _grilleFocusId = null;
  const retour = _grilleRetourVue;
  if (_grilleModeASaisir) {                // quitter « Résultats à saisir »
    if (_grilleDate === '') _grilleDate = null;   // la prochaine grille reprend « aujourd'hui »
    _grilleModeASaisir = false; _grilleCategorie = ''; _grilleRetourVue = '';
  }
  const cont = document.getElementById('grille-serie');
  if (cont) cont.style.display = 'none';
  const fiche = document.getElementById('fiche-identification');
  if (fiche) fiche.style.display = '';
  // Retour là où l'on était (l'Historique), au lieu de laisser sur « Nouvelle saisie ».
  if (retour && typeof showView === 'function') { try { showView(retour); } catch (e) {} }
}
function grilleSetDate(v) { _grilleDate = v || ''; grilleRender(); }
function grilleToggleReception(on) { _grilleInclureReception = !!on; grilleRender(); }
function grilleToggleSaisis(on) { _grilleInclureSaisis = !!on; grilleRender(); }
function grilleToggleMasquees(on) { _grilleInclureMasquees = !!on; grilleRender(); } // ✅ v13.148
function grilleChangeExam(key) { if (GRILLE_EXAMS[key]) { _grilleKey = key; grilleRender(); } }

// ✅ Saisie en série sur MOBILE — comme la maquette : au lieu du grand tableau
//   « tous les examens côte à côte » (illisible sur un téléphone), on choisit UN
//   seul examen dans une déroulante en haut, puis on remplit et on coche. Le
//   tableau complet reste tel quel sur desktop (≥ 641 px). Purement visuel :
//   aucune valeur, aucun id de champ, aucun handler n'est modifié — on ne fait
//   que masquer les colonnes des autres examens.
let _grilleMobileExam = '';
let _grilleMobileHooked = false;
function grilleMobileExam(k) { _grilleMobileExam = k || ''; _grilleApplyMobileExam(); }
function _grilleMobileActif() {
  try { return window.matchMedia('(max-width:640px)').matches; }
  catch (e) { return (window.innerWidth || 9999) <= 640; }
}
function _grilleApplyMobileExam() {
  const cont = document.getElementById('grille-serie');
  if (!cont) return;
  const mono = _grilleMobileActif() && _grilleMobileExam;
  cont.querySelectorAll('[data-exam]').forEach(el => {
    el.style.display = (mono && el.getAttribute('data-exam') !== _grilleMobileExam) ? 'none' : '';
  });
  // En vue « un examen à la fois », on NE MONTRE PAS les patients qui ne font pas
  //   l'examen choisi : leur carte « — » ne sert à rien (comme la maquette, qui ne
  //   liste que les patients concernés).
  cont.querySelectorAll('tr[data-doss]').forEach(tr => {
    if (!mono) { tr.style.display = ''; return; }
    const cell = tr.querySelector('td[data-exam="' + _grilleMobileExam + '"]');
    // « non concerné » = cellule fusionnée « — » (pas de champ de saisie).
    const nonConcerne = cell && cell.hasAttribute('colspan') && cell.textContent.trim() === '—';
    tr.style.display = nonConcerne ? 'none' : '';
  });
  // Reflète le passage mobile ⇄ desktop (rotation / redimensionnement).
  if (!_grilleMobileHooked) {
    _grilleMobileHooked = true;
    window.addEventListener('resize', () => {
      const c = document.getElementById('grille-serie');
      if (c && c.style.display !== 'none') _grilleApplyMobileExam();
    });
  }
}

// ── Rendu ───────────────────────────────────────────────────
function grilleRender() {
  const cont = document.getElementById('grille-serie');
  if (!cont) return;
  _grilleEnsureAuto();
  _grilleSelForce = {};
  const doss = grilleDossiers();
  const cols = grilleColonnes(doss);
  // Examen choisi pour la vue mobile « un examen à la fois » (déroulante en haut).
  if (!_grilleMobileExam || cols.indexOf(_grilleMobileExam) === -1) _grilleMobileExam = cols[0] || '';
  const monoPick = cols.length
    ? '<div class="grille-mob-pick"><label for="grille-mob-exam">🔎 Examen à saisir</label>'
      + '<select id="grille-mob-exam" onchange="grilleMobileExam(this.value)">'
      + cols.map(k => '<option value="' + k + '"' + (k === _grilleMobileExam ? ' selected' : '') + '>' + esc(GRILLE_EXAMS[k].label) + '</option>').join('')
      + '</select></div>'
    : '';

  // Bandeau « Modification d'un résultat » quand on est centré sur un seul dossier.
  let focusBanner = '';
  if (_grilleFocusId != null) {
    let recF = null; try { recF = getDB().find(r => r.id === _grilleFocusId) || null; } catch (e) {}
    const nomF = esc((recF && recF.patient && recF.patient.nom) || '—');
    const dosF = esc((recF && recF.patient && recF.patient.dossier) || '');
    focusBanner = '<div class="grille-focus-banner" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;'
      + 'margin:0 0 12px;padding:9px 13px;border:1px solid #bfdbfe;border-left:4px solid var(--cpmi-mid,#0891b2);'
      + 'border-radius:10px;background:#eff6ff;font-size:13px;color:var(--cpmi-deep,#0b2545)">'
      + '<span style="font-weight:800">✏️ Modification — ' + nomF + '</span>'
      + (dosF ? '<span style="color:var(--text-muted)">N° ' + dosF + '</span>' : '')
      + '<span style="margin-left:auto"><button class="btn btn-outline" style="font-size:12px;padding:5px 10px" '
      + 'onclick="fermerGrille()">← Terminer</button></span></div>';
  }

  const filtres = '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12.5px;color:var(--text-muted)">'
    // « Résultats à saisir » se navigue par semaine : le filtre date n'y a pas sa place.
    + (_grilleModeASaisir ? '' : '<label style="display:flex;align-items:center;gap:5px">📅 Date '
    + '<input type="date" id="grille-date" value="' + esc(_grilleDate || '') + '" onchange="grilleSetDate(this.value)" '
    + 'style="padding:5px 8px;border:1px solid var(--border);border-radius:8px;font-size:12.5px"></label>'
    + (_grilleDate ? '<button class="btn btn-outline" style="font-size:11.5px;padding:3px 8px" onclick="grilleSetDate(\'\')">Toutes les dates</button>' : ''))
    + '<label style="display:flex;align-items:center;gap:5px;cursor:pointer" title="Afficher aussi les patients « réception seule »">'
    + '<input type="checkbox"' + (_grilleInclureReception ? ' checked' : '') + ' onchange="grilleToggleReception(this.checked)" style="width:15px;height:15px"> réception seule</label>'
    + '<label style="display:flex;align-items:center;gap:5px;cursor:pointer" title="Réafficher les examens déjà saisis pour les corriger">'
    + '<input type="checkbox"' + (_grilleInclureSaisis ? ' checked' : '') + ' onchange="grilleToggleSaisis(this.checked)" style="width:15px;height:15px"> déjà saisis</label>'
    // ✅ v13.148 — Saisir les résultats sur des fiches masquées (restreintes).
    + '<label style="display:flex;align-items:center;gap:5px;cursor:pointer" title="Afficher aussi les fiches masquées pour y saisir des résultats">'
    + '<input type="checkbox"' + (_grilleInclureMasquees ? ' checked' : '') + ' onchange="grilleToggleMasquees(this.checked)" style="width:15px;height:15px"> fiches masquées</label>'
    + '</div>';

  const entete = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:10px">'
    + '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">'
    + '<span style="font-size:15px;font-weight:800;color:var(--cpmi-deep)">' + (_grilleModeASaisir ? '📥 Résultats à saisir' : '📋 Saisie en série') + '</span>'
    + '<span style="font-size:13px;color:var(--text-muted)">' + doss.length + ' patient(s) · '
    + '<span id="grille-selcount" style="font-weight:700;color:var(--cpmi-deep)">0</span> coché(s)</span></div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
    + '<button class="btn btn-outline" style="font-size:13px" onclick="fermerGrille()">← Retour</button>'
    + (_grilleDernierLot.length
        ? '<button class="btn btn-outline" style="font-size:13px;padding:9px 14px" onclick="grilleImprimerLot()">🖨️ Imprimer le lot (' + _grilleDernierLot.length + ')</button>' : '')
    + '<button class="btn btn-outline" style="font-size:13px;padding:9px 14px;border-color:#15803d;color:#15803d" onclick="grilleSaveAndPrint()">💾🖨️ Enreg. + Imprimer</button>'
    + '<button id="grille-save" class="btn btn-primary" style="font-size:14px;padding:9px 20px" onclick="grilleSaveAll()">💾 Enregistrer les cochés</button>'
    + '</div></div>' + _grilleChipsHtml() + '<div style="margin-bottom:12px">' + filtres + '</div>';

  if (!doss.length) {
    const videMsg = _grilleFocusId != null
      ? 'Ce dossier n\'a pas d\'examen à saisir.<br>'
        + '<span style="font-size:12px">Vérifiez les examens cochés sur la fiche du patient.</span>'
      : (_grilleModeASaisir
          ? '🎉 Rien à saisir dans cette catégorie.<br><span style="font-size:12px">Tous les résultats en attente ont été saisis.</span>'
          : 'Aucun patient à saisir ' + (_grilleDate ? 'pour le ' + esc(_grilleDate) : '(toutes dates)') + '.<br>'
            + '<span style="font-size:12px">Change la date, choisis « Toutes les dates », ou coche « déjà saisis » pour corriger.</span>');
    cont.innerHTML = entete + focusBanner
      + '<div style="padding:24px;text-align:center;color:var(--text-muted);background:rgba(255,255,255,.7);border:1px dashed var(--border);border-radius:var(--radius)">'
      + videMsg + '</div>' + _grilleHorsHtml();
    grilleUpdateSelCount();
    return;
  }

  // En-tête à deux niveaux : examen (fusionné) puis paramètres.
  // ✅ v13.150 — En-têtes FIGÉS : ils restent visibles quand on descend dans la
  //   liste (avant, ils disparaissaient). La 1ʳᵉ ligne colle en haut (top:0), la
  //   2ᵉ juste dessous (décalage posé en JS après rendu), et le coin « Patient »
  //   colle en haut ET à gauche.
  const HD = 'background:var(--cpmi-deep);color:#fff;padding:6px 6px;font-size:11px;text-align:center';
  let h1 = '<th rowspan="2" class="gr-corner" style="position:sticky;left:0;top:0;z-index:6;' + HD + ';text-align:left;min-width:180px">'
    + '<input type="checkbox" id="grille-selall" onchange="grilleSelAll(this.checked)" title="Tout cocher" '
    + 'style="width:15px;height:15px;vertical-align:middle;margin-right:6px;cursor:pointer">Patient</th>';
  let h2 = '';
  cols.forEach(k => {
    const cfg = GRILLE_EXAMS[k];
    h1 += '<th data-exam="' + k + '" colspan="' + cfg.cols.length + '" class="gr-h1" style="position:sticky;top:0;z-index:4;' + HD + ';font-weight:800;border-left:2px solid rgba(255,255,255,.35)">' + esc(cfg.label) + '</th>';
    cfg.cols.forEach((c, i) => {
      h2 += '<th data-exam="' + k + '" class="gr-h2" style="position:sticky;z-index:4;' + HD + ';font-weight:600;opacity:.92' + (i === 0 ? ';border-left:2px solid rgba(255,255,255,.35)' : '') + '">' + esc(c.lab) + '</th>';
    });
  });

  const cellHtml = (id, k, c) => {
    const base = 'padding:5px 4px;border:1px solid var(--border);border-radius:6px;font-size:12.5px';
    if (c.kind === 'sel') {
      return '<td data-exam="' + k + '" data-lab="' + esc(c.lab) + '" style="padding:3px 4px"><select id="g_' + id + '_' + k + '_' + c.k + '" '
        + 'onchange="grilleCellChange(' + id + ')" style="min-width:118px;' + base + '">'
        + (c.opts || []).map(o => '<option value="' + o[0] + '">' + esc(o[1]) + '</option>').join('') + '</select></td>';
    }
    if (c.kind === 'txt') {
      return '<td data-exam="' + k + '" data-lab="' + esc(c.lab) + '" style="padding:3px 4px"><input type="text" '
        + 'id="g_' + id + '_' + k + '_' + c.k + '" oninput="grilleCellChange(' + id + ')" '
        + 'style="width:130px;' + base + '"></td>';
    }
    if (c.kind === 'fiche') {
      const pret = !!((_grilleFiches[id] || {})[k]);
      return '<td data-exam="' + k + '" data-lab="' + esc(c.lab) + '" style="padding:3px 4px;text-align:center">'
        + '<input type="hidden" id="g_' + id + '_' + k + '_' + c.k + '" value="' + (pret ? 'ok' : '') + '">'
        + '<button type="button" class="btn ' + (pret ? 'btn-success' : 'btn-primary') + ' grille-fiche-btn" id="gbtn_' + id + '_' + k + '" '
        + 'style="font-size:12px;padding:6px 12px;white-space:nowrap" onclick="grilleOuvrirFiche(' + id + ',\'' + k + '\')">'
        + (pret ? '✓ Rempli · modifier' : '✏️ Saisir') + '</button></td>';
    }
    return '<td data-exam="' + k + '" data-lab="' + esc(c.lab) + '" style="padding:3px 4px"><input type="text" step="any" inputmode="decimal" '
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
        tds += '<td data-exam="' + k + '" colspan="' + cfg.cols.length + '" style="background:#f1f3f5;color:#adb5bd;text-align:center;font-size:11px;border-left:2px solid var(--border)">—</td>';
        return;
      }
      if (faits.has(k) && !_grilleInclureSaisis) {
        tds += '<td data-exam="' + k + '" colspan="' + cfg.cols.length + '" style="background:#e7f5ec;color:#15803d;text-align:center;font-size:11px;font-weight:600;border-left:2px solid var(--border)">✓ saisi</td>';
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
    + focusBanner
    + monoPick
    + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:8px">'
    + 'Chaque ligne = un patient, avec tous ses examens demandés. Les cases « — » ne le concernent pas. '
    + 'La coche se met d\'elle-même quand tout est rempli.</div>'
    + '<div id="grille-hint" style="font-size:12px;color:var(--text-muted);margin-bottom:8px"></div>'
    // ✅ v13.150 — Conteneur défilable (X et Y) + hauteur bornée : le défilement
    //   vertical se fait DANS la grille, ce qui permet aux en-têtes figés de
    //   rester collés en haut.
    + '<div id="grille-scroll" style="overflow:auto;max-height:72vh;border:1px solid var(--border);border-radius:var(--radius)">'
    + '<table style="border-collapse:separate;border-spacing:0;width:100%;font-size:12.5px"><thead>'
    + '<tr>' + h1 + '</tr><tr>' + h2 + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
    + _grilleHorsHtml();
  grilleUpdateHint();
  grilleUpdateSelCount();
  // ✅ v13.150 — Décale la 2ᵉ ligne d'en-tête juste sous la 1ʳᵉ (hauteur mesurée).
  try {
    const thead = cont.querySelector('#grille-scroll thead');
    const trs = thead ? thead.querySelectorAll('tr') : [];
    if (trs.length >= 2) {
      const h1h = trs[0].offsetHeight || 30;
      trs[1].querySelectorAll('th').forEach(th => { th.style.top = h1h + 'px'; });
    }
  } catch (e) {}
  // Sur mobile : n'afficher que l'examen choisi dans la déroulante du haut.
  _grilleApplyMobileExam();
  // ✅ v13.154 — En mode correction (« déjà saisis »), pré-remplir les cases avec
  //   les valeurs DÉJÀ enregistrées, pour les voir et les corriger sans tout
  //   re-saisir. Sans ça les cases s'affichaient vides et la fiche semblait
  //   « se vider ». Asynchrone (charge le détail des fiches) : on ne bloque pas
  //   le rendu.
  if (_grilleInclureSaisis) { try { grillePrefillSaisis(doss); } catch (e) {} }
  try { grilleVerifierFiches(); } catch (e) {}
}

// ✅ v13.154 — Pré-remplissage des valeurs déjà saisies (mode correction).
//   Réutilise loadResultsIntoForm (mapping résultat→formulaire canonique, qui
//   n'appelle PAS calcFLAuto), puis recopie chaque champ dans sa case de grille.
async function grillePrefillSaisis(doss) {
  if (!_grilleInclureSaisis) return;
  // Tous les champs de formulaire adressés par la grille → nettoyage inter-fiches.
  const allDoms = [];
  Object.keys(GRILLE_EXAMS).forEach(k => GRILLE_EXAMS[k].cols.forEach(c => { if (c.dom) allDoms.push(c.dom); }));
  const clearForm = () => allDoms.forEach(d => { const el = document.getElementById(d); if (el) el.value = ''; });
  let prefilled = false;
  for (const r of doss) {
    const saisis = grilleExamsSaisis(r);
    if (!saisis.length) continue;
    try { await ensureFull(r); } catch (e) { continue; }
    if (r._light) continue;
    // Regrouper les examens saisis par type d'analyse (un chargement par type).
    const parType = {};
    saisis.forEach(k => { const cfg = GRILLE_EXAMS[k]; if (cfg) (parType[cfg.type] = parType[cfg.type] || []).push(k); });
    Object.keys(parType).forEach(type => {
      const tab = _TYPE_TO_TAB[type] || 'hema';
      if (typeof ensurePanelBuilt === 'function') { try { ensurePanelBuilt(tab); } catch (e) {} }
      clearForm();
      const res = getRecordResultats(r, type);
      if (res && typeof loadResultsIntoForm === 'function') { try { loadResultsIntoForm(type, res); } catch (e) {} }
      parType[type].forEach(k => {
        const cfgK = GRILLE_EXAMS[k];
        if (cfgK.fiche) {                       // fiche déjà remplie : bouton « modifier »
          const btn = document.getElementById('gbtn_' + r.id + '_' + k);
          if (btn && !(_grilleFiches[r.id] || {})[k]) btn.textContent = '✓ Rempli · modifier';
          return;
        }
        if (cfgK.load) {                        // RAI : valeurs relues directement
          const v = cfgK.load(res || {});
          cfgK.cols.forEach(c => { const cell = document.getElementById('g_' + r.id + '_' + k + '_' + c.k); if (cell && v[c.k]) { cell.value = v[c.k]; prefilled = true; } });
          return;
        }
        GRILLE_EXAMS[k].cols.forEach(c => {
          const cell = document.getElementById('g_' + r.id + '_' + k + '_' + c.k);
          const src = c.dom ? document.getElementById(c.dom) : null;
          if (cell && src && String(src.value).trim() !== '') { cell.value = src.value; prefilled = true; }
        });
      });
    });
  }
  // Rafraîchir les compteurs/indices sans cocher automatiquement les lignes.
  if (prefilled) { try { grilleUpdateSelCount(); grilleUpdateHint(); } catch (e) {} }
}

// ── État des lignes ─────────────────────────────────────────
function grilleExamsEditables(r) {
  const faits = new Set(grilleExamsSaisis(r));
  return grilleExamsDuDossier(r).filter(k => _grilleInclureSaisis || !faits.has(k));
}
function _grilleDossier(id) { try { return grilleSourceDB().find(x => String(x.id) === String(id)); } catch (e) { return null; } }
// « Prêt » = tout examen COMMENCÉ est entièrement rempli (et au moins un l'est).
// Le travail est progressif : on saisit la NFS le matin et la CRP plus tard ;
// exiger que TOUS les examens du patient soient remplis bloquerait ce flux.
// État d'un examen dans la grille : 'vide' (rien tapé), 'partiel' ou 'complet'.
function _grilleEtatExamen(id, k) {
  const cfg = GRILLE_EXAMS[k];
  const cells = {};
  cfg.cols.forEach(c => {
    const el = document.getElementById('g_' + id + '_' + k + '_' + c.k);
    cells[c.k] = el ? String(el.value).trim() : '';
  });
  if (!Object.keys(cells).some(kk => cells[kk] !== '')) return 'vide';
  // ✅ v13.157 — Complétude : prédicat spécifique si défini, sinon toutes les
  //   colonnes NON optionnelles doivent être remplies (colonnes opt exclues).
  const ok = (typeof cfg.complet === 'function')
    ? cfg.complet(cells)
    : cfg.cols.filter(c => !c.opt).every(c => cells[c.k] !== '');
  return ok ? 'complet' : 'partiel';
}
function grilleRowComplete(id) {
  const r = _grilleDossier(id); if (!r) return false;
  let commences = 0, complets = 0;
  grilleExamsEditables(r).forEach(k => {
    const e = _grilleEtatExamen(id, k);
    if (e === 'vide') return;
    commences++;
    if (e === 'complet') complets++;
  });
  return commences > 0 && commences === complets;
}
// ✅ v13.243 — « Terminé » automatique seulement si TOUT le dossier est fait :
//   chaque examen demandé est déjà enregistré ou entièrement rempli dans la
//   grille. grilleRowComplete (« prêt à enregistrer ») ne regarde que les
//   examens COMMENCÉS : NFS + CRP saisies, GE et TDR pas encore faits → le
//   dossier passait « Terminé » (KOUKO, DJAKO, BB DOLOU le 15/10).
//   Examen demandé que la grille ne connaît pas, ou liste des examens perdue :
//   pas de décision automatique, le dossier reste « En cours ».
function grilleDossierComplet(id) {
  const r = _grilleDossier(id); if (!r) return false;
  const coches = (r.resultats && r.resultats._examens_coches) || {};
  if (Array.isArray(coches)) return false;
  const types = Object.keys(coches).filter(t => (coches[t] || []).length);
  if (!types.length) return false;
  const horsGrille = types.some(t => coches[t].some(l => !GRILLE_ORDRE.some(k =>
    GRILLE_EXAMS[k] && GRILLE_EXAMS[k].type === t && GRILLE_EXAMS[k].coche.test(l))));
  if (horsGrille) return false;
  return grilleExamsRestants(r).every(k => _grilleEtatExamen(id, k) === 'complet');
}
function grilleRowHasAny(id) {
  const r = _grilleDossier(id); if (!r) return false;
  return grilleExamsEditables(r).some(k => GRILLE_EXAMS[k].cols.some(c => {
    const el = document.getElementById('g_' + id + '_' + k + '_' + c.k);
    return el && String(el.value).trim() !== '';
  }));
}
function grilleCellChange(id) {
  // ✅ v13.157 — Déductions inter-colonnes (ex. GE : résultat depuis la densité).
  grilleExamsEditables(_grilleDossier(id) || {}).forEach(k => {
    const cfg = GRILLE_EXAMS[k];
    if (cfg && typeof cfg.deriv === 'function') { try { cfg.deriv(id); } catch (e) {} }
  });
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
  // ✅ v13.227 — Dossiers dont TOUS les examens de la grille sont complets : on
  //   les passera automatiquement « Terminé » (le flux « page unique » le faisait
  //   déjà, pas la grille — d'où des dossiers finis restés « En cours »).
  const completeIds = [];
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
        // Complétude lue AVANT l'écriture : une fois enregistrés, les examens
        // sortent de la liste « éditables » de la grille et la ligne ne serait
        // plus jugée complète. Si tous les examens éditables sont remplis, le
        // dossier est « Terminé ».
        let rowComplete = false;
        try { rowComplete = grilleDossierComplet(id); } catch (e) {}
        const saved = await updateRecordRemote(record.id, {
          patient: record.patient, type: 'Dossier', resultats: newRes,
          montant: record.montant || 0, prescripteur_id: record.prescripteur_id || null,
        }, { onlyResultats: true });
        if (saved) {
          ok++; savedIds.push(record.id);
          delete _grilleFiches[record.id];
          if (rowComplete) completeIds.push(record.id);
        } else err++;
      } catch (e) { err++; }
    }
  } finally { if (btn) btn.disabled = false; }

  // ✅ v13.227 — Marquage AUTOMATIQUE « Terminé » (rendu) des dossiers complets,
  //   avant le rechargement pour que la liste et la grille le reflètent aussitôt.
  // ✅ v13.270 — Un refus du serveur (code texte, sans erreur) passait inaperçu :
  //   on le compte et on le dit, le rechargement ci-dessous remettant l'état réel.
  let nonTermines = 0, motifTermine = '';
  for (const cid of completeIds) {
    try { if (typeof setStatutLocal === 'function') setStatutLocal(cid, 'rendu'); } catch (e) {}
    try {
      if (typeof _sb !== 'undefined' && _sb && typeof TK === 'function' && TK()) {
        const res = await _sb.rpc('set_dossier_statut', { p_token: TK(), p_id: cid, p_statut: 'rendu' });
        if (!res || res.error || res.data !== 'ok') {
          nonTermines++; motifTermine = motifRefusServeur(res && res.error ? res.error : res && res.data);
        }
      }
    } catch (e) { nonTermines++; motifTermine = 'connexion perdue'; }
  }

  hideLoading();
  await refreshDB(true);
  _grilleDernierLot = savedIds.slice();
  toast('✅ ' + ok + ' patient(s) enregistré(s)' + (err ? ' · ' + err + ' erreur(s)' : '')
    + (nonTermines ? ' · ' + nonTermines + ' non marqué(s) « Terminé » : ' + motifTermine : ''),
    (err || nonTermines) ? 'err' : 'ok');
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
  const db = grilleSourceDB();   // ✅ v13.148 — inclut les fiches masquées saisies
  await imprimerDossiersEnLot(_grilleDernierLot, id => db.find(x => String(x.id) === String(id)));
}

// ✅ v13.235 — Impression GROUPÉE (comptes rendus de plusieurs dossiers, un par page),
//   commune à la saisie en série (« Imprimer le lot ») et à l'Historique (dossiers
//   cochés). Mêmes règles que l'impression d'un seul dossier :
//     • pas d'impression d'un dossier NON ENCAISSÉ (sauf administrateur, informé) ;
//     • les dossiers sans aucun résultat sont écartés (rien à remettre au patient).
async function imprimerDossiersEnLot(ids, trouver) {
  if (typeof printLot !== 'function') { toast('Impression indisponible', 'err'); return; }
  if (!ids || !ids.length) { toast('Aucun dossier à imprimer', 'err'); return; }
  showLoading('Préparation de l\'impression…');
  try {
    const records = []; let nonCharges = 0;
    for (const id of ids) {
      const rec = trouver(id);
      if (!rec) continue;
      try { await ensureFull(rec); } catch (e) {}
      if (rec._light) { nonCharges++; continue; }
      records.push(rec);
    }
    hideLoading();
    if (!records.length) { toast(nonCharges ? 'Impression impossible hors-ligne' : 'Dossiers introuvables', 'err'); return; }
    if (nonCharges) toast('⚠️ ' + nonCharges + ' fiche(s) ignorée(s) (hors-ligne)', 'err');

    // Dossiers sans aucun résultat saisi : rien à imprimer.
    const avecResultat = records.filter(r => {
      const res = r.resultats || {};
      return Object.keys(res).some(k => k.charAt(0) !== '_' && _grilleAUneValeur(res[k]));
    });
    const vides = records.length - avecResultat.length;
    if (!avecResultat.length) { toast('Aucun des dossiers choisis n\'a de résultat saisi', 'err'); return; }

    // ✅ v13.210 — VERROU : pas d'impression EN SÉRIE sans encaissement.
    //   Imprimer le lot sans passer par la caisse était une faille (résultat remis
    //   sans paiement). On n'imprime en série que les dossiers ENCAISSÉS.
    //   L'administrateur garde la main (réimpression, corrections), informé.
    const _estPaye = r => (typeof getPaiementStatus === 'function' && getPaiementStatus(r.id) === 'paye')
                       || !!(r.patient && r.patient.paiement_status === 'paye');
    const _admin = typeof isAdmin === 'function' && isAdmin();
    let aImprimer = avecResultat;
    const notes = [];
    if (vides) notes.push(vides + ' sans résultat');
    if (!_admin) {
      aImprimer = avecResultat.filter(_estPaye);
      const exclus = avecResultat.length - aImprimer.length;
      if (!aImprimer.length) {
        toast('🔒 Impression bloquée : encaissez d\'abord les dossiers (caisse).', 'err');
        return;
      }
      if (exclus) notes.push(exclus + ' non encaissé(s)');
    } else {
      const nonPayes = avecResultat.filter(r => !_estPaye(r)).length;
      if (nonPayes) toast('ℹ️ ' + nonPayes + ' dossier(s) non encaissé(s) inclus (administrateur).', 'ok');
    }
    if (notes.length) toast('🖨 ' + aImprimer.length + ' compte(s) rendu(s) imprimé(s) · exclus : ' + notes.join(', '), 'err');
    await printLot(aImprimer);
  } catch (e) { hideLoading(); toast('Erreur d\'impression', 'err'); }
}

// ══════════════════════════════════════════════════════════════════════
//  FENÊTRE « FICHE » (bactériologie, parasitologie des selles) ouverte depuis
//  une ligne de la série. Elle réutilise le vrai formulaire de l'analyse
//  (mêmes champs, même collecte) déplacé le temps de la saisie dans une
//  fenêtre ; « Valider » garde le résultat pour l'enregistrement de la série.
// ══════════════════════════════════════════════════════════════════════
function _grilleViderPanel(panel) {
  panel.querySelectorAll('input, select, textarea').forEach(el => {
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
    else if (el.tagName === 'SELECT') {            // option vide si elle existe, sinon la 1ʳᵉ (« N/D »…)
      const i = [...el.options].findIndex(o => o.value === '');
      el.selectedIndex = i >= 0 ? i : 0;
    } else if (el.type !== 'button' && el.type !== 'hidden') el.value = '';
  });
  panel.querySelectorAll('.abg-row').forEach(x => { x.className = 'abg-row nd'; });
}
// La parasitologie n'a pas de rechargeur dans le formulaire : on remet ses champs ici.
function _grilleChargerParasito(res) {
  const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
  set('para_type', res["Type d'examen"]); set('para_resultat', res['Résultat global']);
  set('para_coloration', res['Coloration']); set('para_espece', res['Espèce plasmodiale']);
  set('para_parasitemie', res['Parasitémie (%)']); set('para_densite', res['Densité parasitaire /µL']);
  set('para_stade', res['Stade parasitaire']); set('para_indice', res['Indice érythrocytaire']);
  set('para_tdr', res['TDR paludisme']); set('para_obs', res['Observations']);
  if (typeof PARA_EPS !== 'undefined') PARA_EPS.forEach(pa => set('pe_' + pa.replace(/[^a-z]/gi, '_'), res[pa]));
}
async function grilleOuvrirFiche(id, k) {
  const cfg = GRILLE_EXAMS[k], r = _grilleDossier(id);
  if (!cfg || !cfg.fiche || !r) return;
  if (typeof isSpectateur === 'function' && isSpectateur()) { toast('Lecture seule', 'err'); return; }
  try { if (typeof ensurePanelBuilt === 'function') ensurePanelBuilt(cfg.fiche.tab); } catch (e) {}
  const panel = document.getElementById(cfg.fiche.panel);
  if (!panel) { toast('Fiche indisponible', 'err'); return; }
  try { if (typeof ensureFull === 'function') await ensureFull(r); } catch (e) {}

  // Champs déverrouillés et visibles (le formulaire masque ce qui n'est pas coché).
  try { if (typeof unlockAllFields === 'function') unlockAllFields(); } catch (e) {}
  panel.querySelectorAll('tr').forEach(tr => { tr.style.display = ''; });
  try { getCatalogueComplet().forEach(ex => { const sec = ex.section && document.getElementById(ex.section); if (sec && panel.contains(sec)) sec.style.display = ''; }); } catch (e) {}

  // Contenu : brouillon de cette série, sinon le résultat déjà enregistré.
  _grilleViderPanel(panel);
  if (cfg.type === 'Bactériologie' && typeof setAbgMode === 'function') { try { setAbgMode('abg'); } catch (e) {} }
  const brouillon = (_grilleFiches[id] || {})[k];
  const res = brouillon || (typeof getRecordResultats === 'function' ? getRecordResultats(r, cfg.type) : null) || {};
  if (res && Object.keys(res).length) {
    try {
      if (cfg.type === 'Parasitologie') _grilleChargerParasito(res);
      else if (typeof loadResultsIntoForm === 'function') loadResultsIntoForm(cfg.type, res);
    } catch (e) {}
  }
  // Bactériologie : type de prélèvement déduit de l'examen demandé.
  if (cfg.type === 'Bactériologie') {
    const t = document.getElementById('bac_type');
    if (t && !(res && res['Type de prélèvement'])) {
      const coches = (r.resultats && r.resultats._examens_coches) || {};
      const labs = (Array.isArray(coches) ? coches : [].concat.apply([], Object.values(coches))).join(' | ');
      const PRE = [[/ECBU/i, 'ECBU'], [/H[ée]moculture/i, 'Hémoculture'], [/Coproculture/i, 'Coproculture'],
                   [/gorge/i, 'PG'], [/plaie/i, 'Plaie'], [/\bpus\b/i, 'Pus']];
      const hit = PRE.find(([rx]) => rx.test(labs));
      if (hit && [...t.options].some(o => (o.value || o.textContent) === hit[1])) t.value = hit[1];
    }
  }
  // Selles : type d'examen proposé d'office.
  if (cfg.type === 'Parasitologie') {
    const t = document.getElementById('para_type');
    if (t && !(res && res["Type d'examen"])) { const o = [...t.options].find(x => /selles/i.test(x.textContent)); if (o) t.value = o.value || o.textContent; }
  }

  const ancien = document.getElementById('grille-fiche-modal'); if (ancien) ancien.remove();
  const bd = document.createElement('div');
  bd.id = 'grille-fiche-modal';
  bd.className = 'modal-backdrop';
  bd.style.cssText = 'position:fixed;inset:0;z-index:3500;background:rgba(11,37,69,.5);display:flex;align-items:flex-start;justify-content:center;padding:18px 12px;overflow-y:auto';
  const nom = esc((r.patient && r.patient.nom) || '—'), dn = esc((r.patient && r.patient.dossier) || '');
  bd.innerHTML = '<div class="modal-box grille-fiche-box" role="dialog" aria-modal="true" aria-label="' + esc(cfg.fiche.titre) + '" '
    + 'style="max-width:980px;width:100%;max-height:none;padding:0;overflow:visible">'
    + '<div style="position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 18px;'
    + 'background:var(--surface,#fff);border-bottom:1px solid var(--border);border-radius:16px 16px 0 0">'
    + '<div style="display:flex;flex-direction:column"><b style="font-size:16px">' + esc(cfg.fiche.titre) + '</b>'
    + '<span style="font-size:12.5px;color:var(--text-muted)">' + nom + (dn ? ' · N° ' + dn : '') + '</span></div>'
    + '<span style="margin-left:auto;display:flex;gap:8px">'
    + '<button type="button" class="btn btn-outline" id="grille-fiche-annuler">Annuler</button>'
    + '<button type="button" class="btn btn-primary" id="grille-fiche-valider">✓ Valider</button></span></div>'
    + '<div id="grille-fiche-corps" style="padding:14px 16px 18px"></div></div>';
  document.body.appendChild(bd);

  // Le formulaire est DÉPLACÉ dans la fenêtre, puis remis exactement à sa place.
  const repere = document.createComment('fiche-' + cfg.fiche.panel);
  panel.parentNode.insertBefore(repere, panel);
  const etaitActif = panel.classList.contains('active');
  document.getElementById('grille-fiche-corps').appendChild(panel);
  panel.classList.add('active', 'grille-fiche-panel');

  const fermer = () => {
    panel.classList.remove('grille-fiche-panel');
    if (!etaitActif) panel.classList.remove('active');
    if (repere.parentNode) { repere.parentNode.insertBefore(panel, repere); repere.remove(); }
    bd.remove();
    document.removeEventListener('keydown', echap);
  };
  const echap = e => { if (e.key === 'Escape') fermer(); };
  document.addEventListener('keydown', echap);
  document.getElementById('grille-fiche-annuler').onclick = fermer;
  document.getElementById('grille-fiche-valider').onclick = () => {
    let data = {};
    try { data = collectResults(cfg.type) || {}; } catch (e) { toast('Lecture de la fiche impossible', 'err'); return; }
    const rempli = typeof cfg.filled === 'function' ? !!cfg.filled(data) : _grilleAUneValeur(data);
    if (!rempli) { toast('Rien de saisi sur la fiche', 'err'); return; }
    (_grilleFiches[id] = _grilleFiches[id] || {})[k] = data;
    fermer();
    const cell = document.getElementById('g_' + id + '_' + k + '_fiche');
    if (cell) cell.value = 'ok';
    const btn = document.getElementById('gbtn_' + id + '_' + k);
    if (btn) { btn.textContent = '✓ Rempli · modifier'; btn.className = 'btn btn-success grille-fiche-btn'; }
    grilleCellChange(id);
    toast('✓ Fiche prête — enregistrez la série pour la valider', 'ok');
  };
  setTimeout(() => { const f = panel.querySelector('select, input:not([type=hidden])'); if (f) try { f.focus(); } catch (e) {} }, 60);
}
