/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — donnees-analyses.js
   Extrait de index.html (v13.70). Chargé en script classique, PAS en
   module ES : les gestionnaires inline du HTML (onclick="…") résolvent
   les fonctions dans la portée globale. L'ordre des balises <script>
   dans index.html doit être conservé.
   ═══════════════════════════════════════════════════════════════ */

// ============================================================
// DATA DEFINITIONS
// ============================================================

// ============================================================
// VALEURS NORMALES ADAPTATIVES (âge + sexe)
// ============================================================

// Tranches d'âge (en années)
const TRANCHES = {
  NN:        { label: 'Nouveau-né',  min: 0,   max: 0.08  }, // < 1 mois
  NOURR:     { label: 'Nourrisson',  min: 0.08, max: 2    }, // 1 mois – 2 ans
  ENFANT:    { label: 'Enfant',      min: 2,    max: 15   },
  ADULTE:    { label: 'Adulte',      min: 15,   max: 60   },
  SENIOR:    { label: 'Senior',      min: 60,   max: 999  },
};

function getPatientProfile() {
  const ageRaw = parseFloat(document.getElementById('p_age')?.value || '0');
  const sexe = document.getElementById('p_sexe')?.value || '';
  const age = isNaN(ageRaw) ? 0 : ageRaw;
  let tranche = 'ADULTE';
  if (age < 0.08) tranche = 'NN';
  else if (age < 2)  tranche = 'NOURR';
  else if (age < 15) tranche = 'ENFANT';
  else if (age < 60) tranche = 'ADULTE';
  else tranche = 'SENIOR';
  return { age, sexe, tranche };
}

// ✅ v13.17 — Profil (âge/sexe/tranche) reconstruit depuis un patient ENREGISTRÉ
// (pour recalculer les valeurs normales dans les exports Excel/PDF/impression).
function profileFromPatient(pat) {
  const ageRaw = parseFloat((pat && pat.age) || '');
  const age = isNaN(ageRaw) ? null : ageRaw; // null = inconnu
  const sexe = (pat && pat.sexe) || '';
  let tranche = 'ADULTE'; // défaut raisonnable si âge inconnu
  if (age !== null) {
    if (age < 0.08)      tranche = 'NN';
    else if (age < 2)    tranche = 'NOURR';
    else if (age < 15)   tranche = 'ENFANT';
    else if (age < 60)   tranche = 'ADULTE';
    else                 tranche = 'SENIOR';
  }
  return { age, sexe, tranche };
}

// Valeur normale affichable d'un paramètre (référence dynamique selon profil,
// sinon référence par sexe, sinon référence générique).
function refDisplayFor(p, profile) {
  if (!p) return '';
  // ✅ v13.34 — Pour la formule leucocytaire : afficher la référence en valeur
  // absolue (/µL) stockée dans HEMA_FL.ref, pas le pourcentage de NORM.
  // La valeur exportée est déjà en /µL, la référence doit l'être aussi.
  const isFL = typeof HEMA_FL !== 'undefined' && HEMA_FL.some(fl => fl.id === p.id);
  if (isFL && p.ref && p.unitAbs) return p.ref + ' ' + p.unitAbs;

  const dynRef = getRef(p.id, profile);
  if (dynRef && dynRef.ref) return dynRef.ref;
  // Fallback sur les champs statiques refM/refF/ref du paramètre
  if (p.refM && p.refF) {
    if (profile && profile.sexe === 'F') return p.refF;
    if (profile && profile.sexe === 'M') return p.refM;
    return p.refM + ' / ' + p.refF; // sexe inconnu → affiche les deux
  }
  return p.ref || '';
}

// Table de références par paramètre, tranche, sexe
// Format : { ref, lo, hi }  — lo/hi pour l'interprétation auto
const NORM = {
  // ── Hémoglobine ──
  hb: {
    NN:     { M:'14–22', F:'14–22', lo:14, hi:22 },
    NOURR:  { M:'9–14',  F:'9–14',  lo:9,  hi:14 },
    ENFANT: { M:'11–15', F:'11–15', lo:11, hi:15 },
    ADULTE: { M:'13–17', F:'12–16', loM:13, hiM:17, loF:12, hiF:16 },
    SENIOR: { M:'11–17', F:'11–16', loM:11, hiM:17, loF:11, hiF:16 },
  },
  ht: {
    NN:     { M:'44–64', F:'44–64', lo:44, hi:64 },
    NOURR:  { M:'28–42', F:'28–42', lo:28, hi:42 },
    ENFANT: { M:'33–44', F:'33–44', lo:33, hi:44 },
    ADULTE: { M:'40–54', F:'37–47', loM:40, hiM:54, loF:37, hiF:47 },
    SENIOR: { M:'37–52', F:'36–46', loM:37, hiM:52, loF:36, hiF:46 },
  },
  gbc: {
    NN:     { M:'9–30',   F:'9–30',   lo:9,   hi:30  },
    NOURR:  { M:'5–18',   F:'5–18',   lo:5,   hi:18  },
    ENFANT: { M:'5–14',   F:'5–14',   lo:5,   hi:14  },
    ADULTE: { M:'4–10',   F:'4–10',   lo:4,   hi:10  },
    SENIOR: { M:'4–11',   F:'4–11',   lo:4,   hi:11  },
  },
  gr: {
    NN:     { M:'4.0–6.5', F:'4.0–6.5', lo:4.0, hi:6.5 },
    NOURR:  { M:'3.0–5.2', F:'3.0–5.2', lo:3.0, hi:5.2 },
    ENFANT: { M:'3.7–5.3', F:'3.7–5.3', lo:3.7, hi:5.3 },
    ADULTE: { M:'4.5–5.5', F:'4.0–5.0', loM:4.5, hiM:5.5, loF:4.0, hiF:5.0 },
    SENIOR: { M:'4.0–5.5', F:'3.8–5.0', loM:4.0, hiM:5.5, loF:3.8, hiF:5.0 },
  },
  plt: {
    NN:     { M:'150–350', F:'150–350', lo:150, hi:350 },
    NOURR:  { M:'200–500', F:'200–500', lo:200, hi:500 },
    ENFANT: { M:'150–450', F:'150–450', lo:150, hi:450 },
    ADULTE: { M:'150–400', F:'150–400', lo:150, hi:400 },
    SENIOR: { M:'150–400', F:'150–400', lo:150, hi:400 },
  },
  vgm:  { _all: { ref:'80–100', lo:80, hi:100 } },
  tcmh: { _all: { ref:'27–32',  lo:27, hi:32  } },
  ccmh: { _all: { ref:'32–36',  lo:32, hi:36  } },
  ret:  { _all: { ref:'0.5–1.5', lo:0.5, hi:1.5 } },
  vs: {
    NN:     { M:'< 2',  F:'< 2',  lo:0, hiM:2,  hiF:2  },
    NOURR:  { M:'< 10', F:'< 10', lo:0, hiM:10, hiF:10 },
    ENFANT: { M:'< 10', F:'< 12', lo:0, hiM:10, hiF:12 },
    ADULTE: { M:'< 15', F:'< 20', lo:0, hiM:15, hiF:20 },
    SENIOR: { M:'< 20', F:'< 30', lo:0, hiM:20, hiF:30 },
  },
  // Formule leucocytaire — identiques quel que soit le profil chez adulte
  pnn:  { _all: { ref:'50–70', lo:50, hi:70 } },
  pne:  { _all: { ref:'1–5',   lo:1,  hi:5  } },
  pnb:  { _all: { ref:'0–1',   lo:0,  hi:1  } },
  lymp: {
    NN:     { M:'20–40', F:'20–40', lo:20, hi:40 },
    NOURR:  { M:'40–70', F:'40–70', lo:40, hi:70 },
    ENFANT: { M:'25–50', F:'25–50', lo:25, hi:50 },
    ADULTE: { M:'20–40', F:'20–40', lo:20, hi:40 },
    SENIOR: { M:'20–40', F:'20–40', lo:20, hi:40 },
  },
  mono: { _all: { ref:'2–10', lo:2, hi:10 } },

  // ── Biochimie ──
  gly: {
    NN:     { M:'0.40–0.80', F:'0.40–0.80', lo:0.40, hi:0.80 },
    NOURR:  { M:'0.60–1.00', F:'0.60–1.00', lo:0.60, hi:1.00 },
    ENFANT: { M:'0.70–1.00', F:'0.70–1.00', lo:0.70, hi:1.00 },
    ADULTE: { M:'0.70–1.10', F:'0.70–1.10', lo:0.60, hi:1.10 },
    SENIOR: { M:'0.70–1.26', F:'0.70–1.26', lo:0.70, hi:1.26 },
  },
  hba:  { _all: { ref:'< 6.0', lo:0, hi:6.0 } },
  crea: {
    NN:     { M:'25–90',  F:'25–90',  lo:25,  hi:90  },
    NOURR:  { M:'18–35',  F:'18–35',  lo:18,  hi:35  },
    ENFANT: { M:'27–62',  F:'27–62',  lo:27,  hi:62  },
    ADULTE: { M:'60–115', F:'45–90',  loM:60, hiM:115, loF:45, hiF:90 },
    SENIOR: { M:'60–120', F:'45–100', loM:60, hiM:120, loF:45, hiF:100 },
  },
  uree: {
    NN:     { M:'1.0–5.0', F:'1.0–5.0', lo:1.0, hi:5.0 },
    NOURR:  { M:'1.8–6.4', F:'1.8–6.4', lo:1.8, hi:6.4 },
    ENFANT: { M:'2.5–6.5', F:'2.5–6.5', lo:2.5, hi:6.5 },
    ADULTE: { M:'2.5–7.5', F:'2.5–7.5', lo:2.5, hi:7.5 },
    SENIOR: { M:'3.0–9.0', F:'3.0–9.0', lo:3.0, hi:9.0 },
  },
  ua: {
    ADULTE: { M:'210–420', F:'150–360', loM:210, hiM:420, loF:150, hiF:360 },
    _default: { ref:'150–420', lo:150, hi:420 },
  },
  asat: { _all: { ref:'< 40', lo:0, hi:40 } },
  alat: {
    ADULTE: { M:'< 45', F:'< 35', lo:0, hiM:45, hiF:35 },
    _default: { ref:'< 40', lo:0, hi:40 },
  },
  ggt: {
    ADULTE: { M:'< 55', F:'< 38', lo:0, hiM:55, hiF:38 },
    _default: { ref:'< 55', lo:0, hi:55 },
  },
  pal: {
    ENFANT: { M:'100–350', F:'100–350', lo:100, hi:350 },
    ADULTE: { M:'40–130',  F:'35–105',  loM:40, hiM:130, loF:35, hiF:105 },
    SENIOR: { M:'40–150',  F:'40–130',  loM:40, hiM:150, loF:40, hiF:130 },
    _default: { ref:'40–130', lo:40, hi:130 },
  },
  bili:  { _all: { ref:'< 20',   lo:0, hi:20  } },
  bilid: { _all: { ref:'< 5',    lo:0, hi:5   } },
  prot:  { _all: { ref:'65–80',  lo:65, hi:80 } },
  alb:   { _all: { ref:'35–50',  lo:35, hi:50 } },
  chol:  { _all: { ref:'< 2.0',  lo:0,  hi:2.0  } },
  trig:  { _all: { ref:'< 1.5',  lo:0,  hi:1.5  } },
  hdl: {
    ADULTE: { M:'> 0.40', F:'> 0.50', lo:0.40, hi:99, loM:0.40, loF:0.50 },
    _default: { ref:'> 0.40', lo:0.40, hi:99 },
  },
  ldl:   { _all: { ref:'< 1.60', lo:0, hi:1.60 } },
  na:    { _all: { ref:'136–145', lo:136, hi:145 } },
  k:     { _all: { ref:'3.5–5.0', lo:3.5, hi:5.0 } },
  cl:    { _all: { ref:'98–107',  lo:98,  hi:107 } },
  ca:    { _all: { ref:'2.2–2.6', lo:2.2, hi:2.6 } },
  phos: {
    ENFANT: { M:'1.3–2.3', F:'1.3–2.3', lo:1.3, hi:2.3 },
    ADULTE: { M:'0.8–1.5', F:'0.8–1.5', lo:0.8, hi:1.5 },
    _default: { ref:'0.8–1.5', lo:0.8, hi:1.5 },
  },
  mg:    { _all: { ref:'0.75–1.0', lo:0.75, hi:1.0 } },
  bic:   { _all: { ref:'22–28',    lo:22,   hi:28  } },

  // BPN NFS
  bpn_hb:   { _all: { ref:'≥ 11.0', lo:11.0, hi:16.0 } },
  bpn_ht:   { _all: { ref:'≥ 33',   lo:33,   hi:47   } },
  bpn_gb:   { _all: { ref:'6–16',   lo:6,    hi:16   } },
  bpn_gr:   { _all: { ref:'3.5–5.0',lo:3.5,  hi:5.0  } },
  bpn_plt:  { _all: { ref:'150–400',lo:150,  hi:400  } },
  bpn_vgm:  { _all: { ref:'80–100', lo:80,   hi:100  } },
  bpn_tcmh: { _all: { ref:'27–32',  lo:27,   hi:32   } },
  bpn_gly:  { _all: { ref:'0.70–0.92',lo:0.70,hi:0.92 } },
  bpn_crea: { _all: { ref:'35–90',  lo:35,   hi:90   } },
  bpn_uree: { _all: { ref:'2.0–6.5',lo:2.0,  hi:6.5  } },

  // ── Électrophorèse de l'hémoglobine ──
  ephb_a:  { _all: { ref:'95–97',   lo:95,  hi:97  } },
  ephb_a2: { _all: { ref:'1.5–3.5', lo:1.5, hi:3.5 } },
  ephb_f:  { _all: { ref:'< 2',     lo:0,   hi:2   } },
  ephb_s:  { _all: { ref:'0',       lo:0,   hi:0   } },
  ephb_c:  { _all: { ref:'0',       lo:0,   hi:0   } },
  ephb_d:  { _all: { ref:'0',       lo:0,   hi:0   } },
  ephb_e:  { _all: { ref:'0',       lo:0,   hi:0   } },
};

// Implémentation de base (utilisée comme fallback par getRef)
const _getRefBase = function(paramId, profile) {
  const table = NORM[paramId];
  if (!table) return null;
  if (table._all) return buildRefObj(table._all, profile);
  const entry = table[profile.tranche] || table._default;
  if (!entry) {
    const fallback = table.ADULTE || table._default;
    if (!fallback) return null;
    return buildRefObj(fallback, profile);
  }
  return buildRefObj(entry, profile);
};

function buildRefObj(entry, profile) {
  const isMale   = profile.sexe === 'M';
  const isFemale = profile.sexe === 'F';
  const sexeKnown = isMale || isFemale;
  // Si sexe inconnu, on retourne les deux plages (M / F) séparées par " / "
  const ref = sexeKnown
    ? (isMale ? (entry.M || entry.ref || '') : (entry.F || entry.ref || ''))
    : (entry.M && entry.F && entry.M !== entry.F
        ? entry.M + ' / ' + entry.F
        : (entry.M || entry.F || entry.ref || ''));
  const lo   = isMale ? (entry.loM ?? entry.lo ?? 0)   : (entry.loF ?? entry.lo ?? 0);
  const hi   = isMale ? (entry.hiM ?? entry.hi ?? 999)  : (entry.hiF ?? entry.hi ?? 999);
  return { ref: ref || entry.ref || '', lo, hi };
}


// ──────────────────────────────────────────────────────────────────────
// VALEURS DE RÉFÉRENCE PERSONNALISÉES (admin)
// Stockées dans localStorage 'v2_labosaisie_refs_v1'
// Format : { paramId: { lo, hi, ref, unit } }
// ──────────────────────────────────────────────────────────────────────
const LABO_REFS_KEY = 'v2_labosaisie_refs_v1';

// Cache en mémoire pour éviter de parser localStorage à chaque frappe
let _customRefsCache = null;

function getCustomRefs() {
  if (_customRefsCache) return _customRefsCache;
  try { _customRefsCache = JSON.parse(localStorage.getItem(LABO_REFS_KEY) || '{}'); }
  catch(e) { _customRefsCache = {}; }
  return _customRefsCache;
}

function saveCustomRefs(obj) {
  _customRefsCache = obj;  // mettre à jour le cache immédiatement
  localStorage.setItem(LABO_REFS_KEY, JSON.stringify(obj));
}

// getRef : surcharge avec valeurs admin (priorité sur les défauts NORM)
// Retourne l'unité personnalisée si définie, sinon la valeur par défaut du tableau
function getUnit(paramId, defaultUnit) {
  const custom = getCustomRefs();
  if (custom[paramId] && custom[paramId].unit && custom[paramId].unit.trim())
    return custom[paramId].unit.trim();
  return defaultUnit || '';
}

function getRef(paramId, profile) {
  const custom = getCustomRefs();
  if (custom[paramId]) {
    const cc = custom[paramId];
    return { ref: cc.ref || '', lo: parseFloat(cc.lo) || 0, hi: parseFloat(cc.hi) || 999 };
  }
  return _getRefBase(paramId, profile);
}

function interprete(val, lo, hi) {
  const v = parseFloat(val);
  if (isNaN(v)) return '';
  if (v < lo) return 'Bas';
  if (v > hi) return 'Élevé';
  return 'Normal';
}

// Met à jour les références ET les interprétations de tous les tableaux
function updateAllRefs() {
  const profile = getPatientProfile();

  // ── Helper interne ──────────────────────────────────────────
  function applyRef(p, colored) {
    const ref    = getRef(p.id, profile);
    if (!ref) return;
    const refEl  = document.getElementById('ref_'  + p.id);
    const unitEl = document.getElementById('unit_' + p.id);
    const valEl  = document.getElementById('v_'    + p.id);
    if (refEl)  refEl.textContent  = ref.ref;
    if (unitEl) unitEl.textContent = getUnit(p.id, p.unit);
    if (!valEl) return;
    if (colored) {
      // NFS : colore la case input (pas de span interp)
      onParamInputColored(p.id);
    } else {
      // Bio / BPN : met à jour le badge interp
      const interpEl = document.getElementById('i_' + p.id);
      if (interpEl) {
        const interp = interprete(valEl.value, ref.lo, ref.hi);
        interpEl.textContent = interp;
        interpEl.className   = 'interp ' + (interp==='Élevé'?'hi':interp==='Bas'?'lo':interp==='Normal'?'ok':'');
      }
    }
  }

  // NFS (cases colorées)
  [...HEMA_PARAMS, ...HEMA_FL].forEach(p => applyRef(p, true));
  // Biochimie (badge interp texte)
  [...BIO_GLUCIDES,...BIO_REIN,...BIO_FOIE,...BIO_LIPIDES,...BIO_IONO,...BIO_FER,...BIO_CARD,...BIO_HORM,...BIO_COAG,...BIO_AUTRE].forEach(p => applyRef(p, false));
  // BPN NFS + FL (cases colorées)
  [...BPN_NFS, ...BPN_FL].forEach(p => applyRef(p, true));
  // EPHB (spans ref_ uniquement, pas d'interp dynamique — checkEphbTotal() s'en charge)
  EPHB_FRACTIONS.forEach(p => {
    const ref    = getRef(p.id, profile);
    const refEl  = document.getElementById('ref_' + p.id);
    if (ref && refEl) refEl.textContent = ref.ref;
  });
  // Mettre à jour l'affichage de la tranche dans l'interface
  const trancheEl = document.getElementById('patient-tranche');
  if (trancheEl && profile.age > 0) {
    trancheEl.textContent = TRANCHES[profile.tranche]?.label + (profile.sexe ? ' · ' + profile.sexe : '');
  } else if (trancheEl) {
    trancheEl.textContent = '';
  }
}

// ============================================================
// TARIFICATION (FCFA)
// ============================================================

// ✅ v13.75 — LA TABLE DE PRIX HÉRITÉE A ÉTÉ SUPPRIMÉE.
//
//   Deux grilles coexistaient : TARIFS_BASE_DEFAULT / TARIFS_PARAMS_DEFAULT
//   ici, et le prix porté par chaque examen du CATALOGUE_EXAMENS (js/saisie).
//   Seul le catalogue facture réellement ; la table d'ici ne servait plus
//   qu'à l'estimation affichée dans l'historique — et elle avait dérivé :
//   hématologie annoncée 3 500 contre 3 000 facturés, groupe sanguin 3 000
//   contre 2 000, bactériologie 5 000 contre 10 000. Six examens de
//   sérologie (TPHA/VDRL, ASLO, Latex, TSH, T4 libre, PSA) n'y avaient
//   aucun prix et s'estimaient donc à zéro, tandis que sept entrées
//   pointaient vers des noms d'examens qui n'existent plus.
//
//   Vérifié sur 629 dossiers réels : les prix du catalogue correspondent à
//   ce qui est facturé (NFS 3 000 dans 88,6 % des cas, CRP 3 500 dans
//   70,5 %, groupe sanguin 2 000 dans 100 %). Le catalogue est donc la
//   seule source de vérité, et l'estimation s'y appuie désormais.

/** Prix d'un examen, grille admin comprise, sinon prix du catalogue. */
function prixExamen(idExamen) {
  const ref = (typeof getTarifsRef === 'function') ? getTarifsRef() : {};
  if (ref && ref[idExamen] !== undefined) return Number(ref[idExamen]) || 0;
  const ex = (typeof CATALOGUE_EXAMENS !== 'undefined')
    ? CATALOGUE_EXAMENS.find(e => e.id === idExamen) : null;
  return ex ? (Number(ex.prix) || 0) : 0;
}

/** Somme des prix des examens cochés pour un type d'analyse donné. */
function montantDepuisCatalogue(type, examensCoches) {
  if (typeof CATALOGUE_EXAMENS === 'undefined') return 0;
  const libelles = Array.isArray(examensCoches) ? examensCoches : [];
  return CATALOGUE_EXAMENS
    .filter(ex => libelles.includes(ex.label))
    .reduce((total, ex) => total + prixExamen(ex.id), 0);
}

function calculateMontant(type, resultats) {
  // Les examens réellement demandés sont mémorisés dans _examens_coches.
  const coches = resultats && resultats._examens_coches
    ? (resultats._examens_coches[type] || []) : [];
  return montantDepuisCatalogue(type, coches);
}

// Calcule et affiche le montant en temps réel lors de la saisie
function updateMontant(type) {
  // ✅ v13.75 — Le montant affiché pendant la saisie est calculé par
  // calcFicheTotal() (js/saisie.js) à partir des lignes d'examens cochées,
  // dont le prix reste modifiable dossier par dossier. Cette fonction ne
  // recalcule donc plus rien : elle délègue, pour qu'il n'existe qu'un seul
  // calcul du montant dans toute l'application.
  if (typeof calcFicheTotal === 'function') { calcFicheTotal(); return; }
  const el = document.getElementById('montant-preview');
  if (el && !el.dataset.montant) { el.textContent = '0 FCFA'; el.dataset.montant = 0; }
}

const HEMA_PARAMS = [
  { id:'gbc',  name:'Globules blancs (GB)',    unit:'10³/µL',refM:'4–10',    refF:'4–10',    lo:4,   hi:10  },
  { id:'gr',   name:'Globules rouges (GR)',    unit:'10⁶/µL',refM:'4.5–5.5', refF:'4.0–5.0', lo:4.0, hi:5.5 },
  { id:'hb',   name:'Hémoglobine (Hb)',        unit:'g/dL',  refM:'13–17',   refF:'12–16',   lo:12,  hi:17  },
  { id:'ht',   name:'Hématocrite (Ht)',         unit:'%',     refM:'40–54',   refF:'37–47',   lo:37,  hi:54  },
  { id:'vgm',  name:'VGM ⚙',                  unit:'fL',    refM:'80–100',  refF:'80–100',  lo:80,  hi:100, calc:true },
  { id:'tcmh', name:'TCMH ⚙',                 unit:'pg',    refM:'27–32',   refF:'27–32',   lo:27,  hi:32,  calc:true },
  { id:'ccmh', name:'CCMH ⚙',                unit:'g/dL',  refM:'32–36',   refF:'32–36',   lo:32,  hi:36,  calc:true },
  { id:'plt',  name:'Plaquettes',              unit:'10³/µL',refM:'150–400', refF:'150–400', lo:150, hi:400 },
  { id:'ret',  name:'Réticulocytes',           unit:'%',     refM:'0.5–1.5', refF:'0.5–1.5', lo:0.5, hi:1.5 },
  { id:'vs',   name:'VS (1ère heure)',         unit:'mm/h',  refM:'< 15',    refF:'< 20',    lo:0,   hiM:15, hiF:20 },
];

const HEMA_FL = [
  { id:'pnn',  name:'Polynucléaires neutrophiles (PNN)', unit:'%', ref:'1800–7500', lo:1800, hi:7500, unitAbs:'/µL' },
  { id:'pne',  name:'Polynucléaires éosinophiles (PNE)', unit:'%', ref:'0–500',     lo:0,    hi:500,  unitAbs:'/µL' },
  { id:'pnb',  name:'Polynucléaires basophiles (PNB)',   unit:'%', ref:'0–100',     lo:0,    hi:100,  unitAbs:'/µL' },
  { id:'lymp', name:'Lymphocytes',                       unit:'%', ref:'1000–4000', lo:1000, hi:4000, unitAbs:'/µL' },
  { id:'mono', name:'Monocytes',                         unit:'%', ref:'200–1000',  lo:200,  hi:1000, unitAbs:'/µL' },
];

// Électrophorèse de l'hémoglobine
const EPHB_FRACTIONS = [
  { id:'ephb_a',   name:'Hb A',   unit:'%',  ref:'95–97', lo:95,  hi:97  },
  { id:'ephb_a2',  name:'Hb A2',  unit:'%',  ref:'1.5–3.5', lo:1.5, hi:3.5 },
  { id:'ephb_f',   name:'Hb F',   unit:'%',  ref:'< 2',   lo:0,   hi:2   },
  { id:'ephb_s',   name:'Hb S',   unit:'%',  ref:'0',     lo:0,   hi:0   },
  { id:'ephb_c',   name:'Hb C',   unit:'%',  ref:'0',     lo:0,   hi:0   },
  { id:'ephb_d',   name:'Hb D',   unit:'%',  ref:'0',     lo:0,   hi:0   },
  { id:'ephb_e',   name:'Hb E',   unit:'%',  ref:'0',     lo:0,   hi:0   },
];


const BIO_GLUCIDES = [
  { id:'gly',  name:'Glycémie à jeun',           unit:'g/L',    ref:'0.60–1.10',  lo:0.60, hi:1.10 },
  { id:'hba',  name:'HbA1c',                     unit:'%',      ref:'< 6.0',      lo:0,    hi:6.0  },
];
const BIO_REIN = [
  { id:'crea', name:'Créatinine',                unit:'mg/L',   ref:'4–16',       lo:4,    hi:16   },
  { id:'uree', name:'Urée',                      unit:'g/L',    ref:'0.15–0.45',  lo:0.15, hi:0.45 },
  { id:'ua',   name:'Acide urique',              unit:'mg/L',   ref:'25–70',      lo:25,   hi:70   },
  { id:'malb', name:'Microalbuminurie',          unit:'mg/24h', ref:'30–300',     lo:30,   hi:300  },
  { id:'dfg',  name:'Clairance créatinine (DFG)',unit:'mL/min/1.73m²',ref:'> 90', lo:90,   hi:999  },
];
const BIO_FOIE = [
  { id:'asat', name:'ASAT (TGO)',                unit:'UI/L',   ref:'< 40',       lo:0,    hi:40   },
  { id:'alat', name:'ALAT (TGP)',                unit:'UI/L',   ref:'< 40',       lo:0,    hi:40   },
  { id:'ggt',  name:'Gamma GT',                  unit:'UI/L',   ref:'< 55',       lo:0,    hi:55   },
  { id:'pal',  name:'Phosphatases alcalines',    unit:'UI/L',   ref:'44–147',     lo:44,   hi:147  },
  { id:'bili', name:'Bilirubine totale',         unit:'mg/L',   ref:'< 10',       lo:0,    hi:10   },
  { id:'bilid',name:'Bilirubine directe',        unit:'mg/L',   ref:'< 3',        lo:0,    hi:3    },
  { id:'prot', name:'Protéines totales',         unit:'g/L',    ref:'60–80',      lo:60,   hi:80   },
  { id:'alb',  name:'Albumine',                  unit:'g/L',    ref:'35–50',      lo:35,   hi:50   },
  { id:'ldh',  name:'LDH (Lactate déshydrogénase)',unit:'UI/L', ref:'100–200',    lo:100,  hi:200  },
  { id:'amy',  name:'Amylase',                   unit:'UI/L',   ref:'10–90',      lo:10,   hi:90   },
  { id:'lip',  name:'Lipase',                    unit:'UI/L',   ref:'< 60',       lo:0,    hi:60   },
];
const BIO_LIPIDES = [
  { id:'chol', name:'Cholestérol total',         unit:'g/L',    ref:'< 2.0',      lo:0,    hi:2.0  },
  { id:'trig', name:'Triglycérides',             unit:'g/L',    ref:'< 1.7',      lo:0,    hi:1.7  },
  { id:'hdl',  name:'HDL-cholestérol',           unit:'g/L',    ref:'> 0.50',     lo:0.50, hi:99   },
  { id:'ldl',  name:'LDL-cholestérol ⚙',         unit:'g/L',    ref:'< 1.30',     lo:0,    hi:1.30, calc:true },
  { id:'apoa', name:'Apolipoprotéine A1',        unit:'g/L',    ref:'1.1–2.1',    lo:1.1,  hi:2.1  },
  { id:'apob', name:'Apolipoprotéine B',         unit:'g/L',    ref:'0.5–1.3',    lo:0.5,  hi:1.3  },
  { id:'lpa',  name:'Lipoprotéine (a)',          unit:'mg/dL',  ref:'< 30',       lo:0,    hi:30   },
];
const BIO_IONO = [
  { id:'na',   name:'Sodium (Na⁺)',              unit:'mmol/L', ref:'135–145',    lo:135,  hi:145  },
  { id:'k',    name:'Potassium (K⁺)',            unit:'mmol/L', ref:'3.5–5.0',    lo:3.5,  hi:5.0  },
  { id:'cl',   name:'Chlore (Cl⁻)',              unit:'mmol/L', ref:'98–107',     lo:98,   hi:107  },
  { id:'ca',   name:'Calcium (Ca²⁺)',            unit:'mg/L',   ref:'88–104',     lo:88,   hi:104  },
  { id:'phos', name:'Phosphore',                 unit:'mg/L',   ref:'25–45',      lo:25,   hi:45   },
  { id:'mg',   name:'Magnésium (Mg²⁺)',          unit:'mg/L',   ref:'17–24',      lo:17,   hi:24   },
  { id:'bic',  name:'Bicarbonates (HCO₃⁻)',     unit:'mmol/L', ref:'22–28',      lo:22,   hi:28   },
  { id:'zinc', name:'Zinc',                      unit:'µmol/L', ref:'11–22',      lo:11,   hi:22   },
  { id:'cuiv', name:'Cuivre',                    unit:'µmol/L', ref:'11–22',      lo:11,   hi:22   },
];
const BIO_FER = [
  { id:'fer',  name:'Fer sérique',               unit:'µmol/L', ref:'10–30',      lo:10,   hi:30   },
  { id:'ferr', name:'Ferritine',                 unit:'µg/L',   ref:'20–300',     lo:20,   hi:300  },
  { id:'ddim', name:'D-Dimères',                 unit:'µg/L',   ref:'< 500',      lo:0,    hi:500  },
];
const BIO_CARD = [
  { id:'trop', name:'Troponine I/T',             unit:'ng/L',   ref:'< 14',       lo:0,    hi:14   },
  { id:'bnp',  name:'BNP / NT-proBNP',          unit:'pg/mL',  ref:'< 125',      lo:0,    hi:125  },
  { id:'ck',   name:'CK (Créatine kinase)',      unit:'UI/L',   ref:'< 170',      lo:0,    hi:170  },
  { id:'ckmb', name:'CK-MB',                     unit:'UI/L',   ref:'< 25',       lo:0,    hi:25   },
  { id:'myog', name:'Myoglobine',                unit:'µg/L',   ref:'< 90',       lo:0,    hi:90   },
];
const BIO_HORM = [
  { id:'cort', name:'Cortisol (8h)',             unit:'nmol/L', ref:'170–550',    lo:170,  hi:550  },
  { id:'acth', name:'ACTH',                      unit:'pg/mL',  ref:'10–60',      lo:10,   hi:60   },
  { id:'lh',   name:'LH',                        unit:'UI/L',   ref:'',           lo:0,    hi:999  },
  { id:'fsh',  name:'FSH',                       unit:'UI/L',   ref:'',           lo:0,    hi:999  },
  { id:'e2',   name:'Estradiol (E2)',            unit:'ng/mL',  ref:'3–15',       lo:3,    hi:15   },
  { id:'prog', name:'Progestérone',              unit:'ng/mL',  ref:'',           lo:0,    hi:999  },
  { id:'test', name:'Testostérone',              unit:'ng/mL',  ref:'',           lo:0,    hi:999  },
  { id:'prl',  name:'Prolactine',                unit:'mUI/L',  ref:'< 500',      lo:0,    hi:500  },
  { id:'amh',  name:'AMH',                       unit:'ng/mL',  ref:'1–7',        lo:1,    hi:7    },
  { id:'vitd', name:'Vitamine D (25-OH)',        unit:'ng/mL',  ref:'30–100',     lo:30,   hi:100  },
  { id:'b12',  name:'Vitamine B12',              unit:'pg/mL',  ref:'200–950',    lo:200,  hi:950  },
  { id:'fol',  name:'Folates (B9)',              unit:'ng/mL',  ref:'5–20',       lo:5,    hi:20   },
  { id:'pth',  name:'PTH (parathormone)',        unit:'ng/L',   ref:'15–65',      lo:15,   hi:65   },
];
const BIO_COAG = [
  { id:'tp',   name:'TP / INR',                  unit:'%',      ref:'70–100',     lo:70,   hi:100  },
  { id:'tca',  name:'TCA',                       unit:'s',      ref:'28–38',      lo:28,   hi:38   },
  { id:'fibr', name:'Fibrinogène',               unit:'g/L',    ref:'2.0–4.0',    lo:2.0,  hi:4.0  },
  { id:'ddim2',name:'D-Dimères',                 unit:'µg/L',   ref:'< 500',      lo:0,    hi:500  },
];
const BIO_AUTRE = [
  { id:'pct',  name:'Procalcitonine (PCT)',      unit:'µg/L',   ref:'< 0.1',      lo:0,    hi:0.1  },
  { id:'hcrp', name:'CRP ultra-sensible (hs-CRP)',unit:'mg/L',  ref:'< 1.0',      lo:0,    hi:1.0  },
  { id:'osm',  name:'Osmolarité',               unit:'mOsm/L', ref:'275–295',    lo:275,  hi:295  },
  { id:'hcy',  name:'Homocystéine',             unit:'µmol/L', ref:'5–15',       lo:5,    hi:15   },
  { id:'amm',  name:'Ammoniaque',               unit:'µmol/L', ref:'10–50',      lo:10,   hi:50   },
  { id:'lact', name:'Acide lactique',            unit:'mmol/L', ref:'0.5–1.8',    lo:0.5,  hi:1.8  },
  { id:'bhcg', name:'Beta-HCG',                 unit:'UI/L',   ref:'< 5',        lo:0,    hi:5    },
];

const SERO_TESTS = [
  { id:'vih1',  name:'VIH 1 & 2',             type:'qual' },
  { id:'hbsag', name:'Ag HBs',                type:'qual' },
  { id:'hbcac', name:'Ac anti-HBc total',     type:'qual' },
  { id:'hbsac', name:'Ac anti-HBs',           type:'quant', unit:'UI/L' },
  { id:'hcv',   name:'Ac anti-VHC',           type:'qual' },
  { id:'syphil',name:'TPHA / VDRL (Syphilis)',type:'qual' },
  { id:'toxo',  name:'Toxoplasmose IgG',      type:'quant', unit:'UI/mL' },
  { id:'toxoig',name:'Toxoplasmose IgM',      type:'qual' },
  { id:'rubig', name:'Rubéole IgG',           type:'quant', unit:'UI/mL' },
  { id:'aso',   name:'ASLO (Antistreptolysines)', type:'quant', unit:'UI/mL' },
  { id:'latex', name:'Latex (Waaler-Rose)',    type:'qual' },
  { id:'tsh',   name:'TSH',                   type:'quant', unit:'mUI/L' },
  { id:'ft4',   name:'T4 libre (FT4)',        type:'quant', unit:'pmol/L' },
  { id:'psa',   name:'PSA total',             type:'quant', unit:'ng/mL' },
];

const ABG_ANTIBIOS = [
  'Amoxicilline','Amoxicilline-Acide clavulanique','Ampicilline','Céfazoline',
  'Céfuroxime','Céfotaxime','Ceftriaxone','Ceftazidime','Imipénème','Ertapénème',
  'Gentamicine','Amikacine','Tobramycine','Ciprofloxacine','Lévofloxacine',
  'Triméthoprime-Sulfaméthoxazole','Tétracycline','Doxycycline','Érythromycine',
  'Clarithromycine','Azithromycine','Clindamycine','Métronidazole','Vancomycine',
  'Linézolide','Nitrofurantoïne','Fosfomycine','Colistine','Chloramphénicol',
];

const AFG_ANTIFONGIQUES = [
  'Fluconazole','Itraconazole','Voriconazole','Kétoconazole',
  'Amphotéricine B','Flucytosine (5-FC)','Caspofongine','Micafongine',
  'Anidulafongine','Nystatin','Terbinafine','Clotrimazole',
];

let _abgMode = 'abg'; // 'abg' | 'afg'

function setAbgMode(mode) {
  _abgMode = mode;
  document.getElementById('abg-grid').style.display = mode === 'abg' ? '' : 'none';
  document.getElementById('afg-grid').style.display = mode === 'afg' ? '' : 'none';
  document.getElementById('btn-abg-mode').className = 'btn ' + (mode === 'abg' ? 'btn-primary' : 'btn-outline');
  document.getElementById('btn-afg-mode').className = 'btn ' + (mode === 'afg' ? 'btn-primary' : 'btn-outline');
  const label = document.getElementById('abg-title-label');
  if (label) label.textContent = '💊 ' + (mode === 'abg' ? 'Antibiogramme' : 'Antifongigramme');
}

const PARA_EPS = [
  'Ascaris lumbricoides','Trichuris trichiura','Ankylostoma / Necator',
  'Strongyloides stercoralis','Entamoeba histolytica','Entamoeba coli (non pathogène)',
  'Giardia intestinalis','Cryptosporidium','Taenia sp.','Hymenolepis nana',
  'Schistosoma mansoni','Trichomonas intestinalis',
];

// ============================================================
// BUILD TABLES
// ============================================================

function makeParamRow(p, tbody) {
  const tr = document.createElement('tr');
  const profile = getPatientProfile();
  const dynRef = getRef(p.id, profile);
  const refDisplay = dynRef ? dynRef.ref : (p.refM && p.refF
    ? (profile.sexe === 'F' ? p.refF : p.refM) : (p.ref || ''));
  const inputStyle = p.calc
    ? 'width:90px;background:var(--accent-light);color:var(--accent);font-weight:600;cursor:default;'
    : 'width:90px';
  const readonly = p.calc ? 'readonly title="Calculé automatiquement"' : '';
  tr.innerHTML = `
    <td style="font-size:13px;white-space:nowrap">${p.name}</td>
    <td><input type="number" id="v_${p.id}" step="any" style="${inputStyle}" ${readonly} oninput="onParamInput('${p.id}')"></td>
    <td><span class="unit" id="unit_${p.id}">${getUnit(p.id, p.unit)}</span></td>
    <td><span class="ref-range" id="ref_${p.id}">${refDisplay}</span></td>
    <td><span class="interp interp-?" id="i_${p.id}">—</span></td>
  `;
  tbody.appendChild(tr);
}

// Variante NFS : pas de colonne Interprétation — la case Valeur elle-même
// se colore (rouge/bleu) quand le résultat sort des normes, sinon reste neutre.
function makeParamRowColored(p, tbody) {
  const tr = document.createElement('tr');
  const profile = getPatientProfile();
  const dynRef = getRef(p.id, profile);
  const refDisplay = dynRef ? dynRef.ref : (p.refM && p.refF
    ? (profile.sexe === 'F' ? p.refF : p.refM) : (p.ref || ''));
  const inputStyle = p.calc
    ? 'width:90px;background:var(--accent-light);color:var(--accent);font-weight:600;cursor:default;'
    : 'width:90px';
  const readonly = p.calc ? 'readonly title="Calculé automatiquement"' : '';
  tr.innerHTML = `
    <td style="font-size:13px;white-space:nowrap">${p.name}</td>
    <td><input type="number" id="v_${p.id}" step="any" style="${inputStyle}" ${readonly} oninput="onParamInputColored('${p.id}')"></td>
    <td><span class="unit" id="unit_${p.id}">${getUnit(p.id, p.unit)}</span></td>
    <td><span class="ref-range" id="ref_${p.id}">${refDisplay}</span></td>
  `;
  tbody.appendChild(tr);
}

function onParamInput(id) {
  const profile = getPatientProfile();
  const ref = getRef(id, profile);
  if (!ref) return;
  const valEl = document.getElementById('v_' + id);
  const interpEl = document.getElementById('i_' + id);
  if (!valEl || !interpEl) return;
  const interp = interprete(valEl.value, ref.lo, ref.hi);
  interpEl.textContent = interp || '—';
  interpEl.className = 'interp ' + (interp === 'Élevé' ? 'hi' : interp === 'Bas' ? 'lo' : interp === 'Normal' ? 'ok' : '');
  updateMontantCurrent();
}

// Variante NFS : colore directement la case input selon l'interprétation,
// sans afficher de texte d'interprétation (pas de colonne dédiée).
function onParamInputColored(id) {
  const profile = getPatientProfile();
  const ref = getRef(id, profile);
  const valEl = document.getElementById('v_' + id);
  if (!valEl) return;
  if (!ref || valEl.value === '') {
    valEl.classList.remove('val-hi', 'val-lo');
    updateMontantCurrent();
    return;
  }
  // ✅ v13.26 — FL : interprétation sur la valeur absolue × 1000 (/µL)
  const isFL = HEMA_FL && HEMA_FL.some(p => p.id === id);
  let val = parseFloat(valEl.value);
  if (isFL) {
    const absEl = document.getElementById('abs_' + id);
    const absVal = absEl ? parseFloat(absEl.textContent) : NaN;
    if (!isNaN(absVal)) val = absVal * 1000; // convertir en /µL pour comparer aux refs
  }
  const interp = interprete(val, ref.lo, ref.hi);
  valEl.classList.toggle('val-hi', interp === 'Élevé');
  valEl.classList.toggle('val-lo', interp === 'Bas');
  updateMontantCurrent();
  if (id === 'hb' || id === 'ht' || id === 'gr') { if (typeof calcConstantes === 'function') calcConstantes(); }
  if (id === 'gbc') { if (typeof calcFLAbsolues === 'function') calcFLAbsolues(); }
  if (id === 'bpn_hb' || id === 'bpn_ht' || id === 'bpn_gr') { if (typeof calcConstantesBPN === 'function') calcConstantesBPN(); }
}



const BPN_NFS = [
  { id:'bpn_gb',   name:'Globules blancs (GB)', unit:'/µL', ref:'6–16',      lo:6,    hi:16   },
  { id:'bpn_gr',   name:'Globules rouges (GR)', unit:'10⁶/µL', ref:'3.5–5.0',   lo:3.5,  hi:5.0  },
  { id:'bpn_hb',   name:'Hémoglobine (Hb)',     unit:'g/dL',   ref:'≥ 11.0',    lo:11.0, hi:16.0 },
  { id:'bpn_ht',   name:'Hématocrite (Ht)',      unit:'%',      ref:'≥ 33',      lo:33,   hi:47   },
  { id:'bpn_vgm',  name:'VGM ⚙',               unit:'fL',     ref:'80–100',    lo:80,   hi:100, calc:true },
  { id:'bpn_tcmh', name:'TCMH ⚙',              unit:'pg',     ref:'27–32',     lo:27,   hi:32,  calc:true },
  { id:'bpn_ccmh', name:'CCMH ⚙',             unit:'g/dL',   ref:'32–36',     lo:32,   hi:36,  calc:true },
  { id:'bpn_plt',  name:'Plaquettes',           unit:'/µL', ref:'150–400',   lo:150,  hi:400  },
];

// Formule leucocytaire BPN — identique à l'hémato
const BPN_FL = [
  { id:'bpn_pnn',  name:'Polynucléaires neutrophiles (PNN)', unit:'%', ref:'50–70', lo:50, hi:70 },
  { id:'bpn_pne',  name:'Polynucléaires éosinophiles (PNE)', unit:'%', ref:'1–5',   lo:1,  hi:5  },
  { id:'bpn_pnb',  name:'Polynucléaires basophiles (PNB)',   unit:'%', ref:'0–1',   lo:0,  hi:1  },
  { id:'bpn_lymp', name:'Lymphocytes',                       unit:'%', ref:'20–40', lo:20, hi:40 },
  { id:'bpn_mono', name:'Monocytes',                         unit:'%', ref:'2–10',  lo:2,  hi:10 },
];

const BPN_BIO = [
  { id:'bpn_gly',  name:'Glycémie à jeun',      unit:'g/L',    ref:'0.70–0.92', lo:0.70, hi:0.92 },
  { id:'bpn_crea', name:'Créatinine',            unit:'µmol/L', ref:'35–90',     lo:35,   hi:90   },
  { id:'bpn_uree', name:'Urée',                  unit:'mmol/L', ref:'2.0–6.5',   lo:2.0,  hi:6.5  },
];

const BPN_SERO = [
  { id:'bpn_vih',   name:'VIH 1 & 2',                   type:'qual' },
  { id:'bpn_hbsag', name:'Ag HBs (Hépatite B)',         type:'qual' },
  { id:'bpn_hbsac', name:'Ac anti-HBs',                 type:'quant', unit:'UI/L',   ref:'> 10 UI/L = protecteur' },
  { id:'bpn_hcv',   name:'Ac anti-VHC (Hépatite C)',    type:'qual' },
  { id:'bpn_tpha',  name:'TPHA / VDRL (Syphilis)',      type:'qual' },
  { id:'bpn_toxog', name:'Toxoplasmose IgG',            type:'quant', unit:'UI/mL',  ref:'> 8 = immunisée' },
  { id:'bpn_toxom', name:'Toxoplasmose IgM',            type:'qual' },
  { id:'bpn_rubg',  name:'Rubéole IgG',                 type:'quant', unit:'UI/mL',  ref:'> 10 = immunisée' },
  { id:'bpn_rubm',  name:'Rubéole IgM',                 type:'qual' },
];


// ── Groupe sanguin seul ───────────────────────────────────────────────
const GS_PARAMS = [
  { id:'gs_abo',  name:'Groupe sanguin ABO', type:'sel',   opts:['A','B','AB','O'] },
  { id:'gs_rh',   name:'Rhésus (Rh D)',      type:'qual2', opts:['Positif','Négatif'] },
  { id:'gs_obs',  name:'Commentaire',        type:'text' },
];

// ✅ v12.4 — Examens couramment inclus dans un bilan prénatal.
// Cochés par défaut = composition standard ; l'utilisateur ajuste par patient.
// Le prix du BPN est un FORFAIT fixe (20 000 FCFA), indépendant de cette liste.
const BPN_EXAMENS = [
  { id:'bpnc_nfs',   label:'NFS — Numération formule sanguine', def:true },
  { id:'bpnc_grsg',  label:'Groupe sanguin ABO / Rhésus', def:true },
  { id:'bpnc_uree',  label:'Urée', def:true },
  { id:'bpnc_gaj',   label:'Glycémie à jeun', def:true },
  { id:'bpnc_crea',  label:'Créatinine', def:true },
  { id:'bpnc_ephb',  label:'Électrophorèse de l\'hémoglobine', def:true },
  { id:'bpnc_rube',  label:'Rubéole IgG / IgM', def:true },
  { id:'bpnc_toxo',  label:'Toxoplasmose IgG / IgM', def:true },
  { id:'bpnc_vih',   label:'Sérologie VIH', def:true },
  { id:'bpnc_hbs',   label:'Ag HBs (Hépatite B)', def:true },
  { id:'bpnc_tpha',  label:'TPHA / VDRL (Syphilis)', def:true },
  { id:'bpnc_ecbu',  label:'ECBU', def:true },
];

function buildBpnCompo() {
  const el = document.getElementById('bpn-compo-list');
  if (!el) return;
  el.innerHTML = BPN_EXAMENS.map(e =>
    `<label><input type="checkbox" id="${e.id}"${e.def ? ' checked' : ''}>${esc(e.label)}</label>`
  ).join('');
}

// Retourne la liste des examens BPN cochés (pour enregistrement / fiche)
function collectBpnCompo() {
  return BPN_EXAMENS.filter(e => document.getElementById(e.id)?.checked).map(e => e.label);
}

// ✅ v13.22 — BPN : cocher les examens existants sur les onglets
// Quand ex_bpn est coché, active les examens correspondants sur les
// fiches déjà existantes (NFS, EPHB, Bio, GS, Sérologies, ECBU).
// ✅ v13.28 — BPN forfaitaire : les 12 examens inclus passent à 0 F
// (compris dans le forfait 20 000). Décocher BPN restaure les tarifs.
function applyBpnSections() {
  const on = !!document.getElementById('ex_bpn')?.checked;
  const bpnExamIds = ['ex_nfs','ex_ephb','ex_gly','ex_uree','ex_crea','ex_gs','ex_vih','ex_hbs','ex_tpha','ex_toxo','ex_rube','ex_ecbu'];
  bpnExamIds.forEach(id => {
    const chk = document.getElementById(id);
    if (chk && on && !chk.checked) {
      chk.checked = true;
      if (typeof syncExamRowState === 'function') syncExamRowState(id);
    }
    const px = document.getElementById('px_' + id);
    if (px) {
      if (on) {
        if (px.value !== '0' && px.dataset.prevPrix === undefined) px.dataset.prevPrix = px.value;
        px.value = '0';
        px.readOnly = true;
        px.style.opacity = '0.5';
      } else if (px.dataset.prevPrix !== undefined) {
        px.value = px.dataset.prevPrix;
        delete px.dataset.prevPrix;
        px.readOnly = false;
        px.style.opacity = '';
      }
    }
  });
  if (typeof applyExamLocks === 'function') applyExamLocks();
}


// Biochimie BPN — champs dans #bpn-bio-body
function buildBpnBio2() {
  const wrap = document.getElementById('bpn-bio-body');
  if (!wrap || wrap.innerHTML.trim()) return;
  // Glycémie + Urée + Créatinine (normes femme enceinte)
  const bpnBioParams = [
    { id:'bpn_gly',  name:'Glycémie à jeun',  unit:'g/L',    ref:'0.70–0.92', lo:0.70, hi:0.92 },
    { id:'bpn_uree', name:'Urée',              unit:'mmol/L', ref:'2.0–6.5',   lo:2.0,  hi:6.5  },
    { id:'bpn_crea', name:'Créatinine',        unit:'µmol/L', ref:'35–90',     lo:35,   hi:90   },
  ];
  const div = document.createElement('div');
  div.innerHTML = `<div class="table-wrap"><table class="result-table">
    <thead><tr><th>Paramètre</th><th>Valeur</th><th>Unité</th><th>Valeurs normales</th></tr></thead>
    <tbody id="bpn-bio-tbl"></tbody></table></div>`;
  wrap.appendChild(div);
  const b = document.getElementById('bpn-bio-tbl');
  bpnBioParams.forEach(p => makeParamRow(p, b));
}

// Sérologies BPN — champs dans #bpn-sero-body
function buildBpnSero2() {
  const wrap = document.getElementById('bpn-sero-body');
  if (!wrap || wrap.innerHTML.trim()) return;
  // Sérologies BPN validées : VIH, HBs, Syphilis, Toxo, Rubéole
  const BPN_SERO_LIST = [
    { id:'bpn_vih',   name:'Sérologie VIH',               type:'qual' },
    { id:'bpn_hbsag', name:'Ag HBs (Hépatite B)',         type:'qual' },
    { id:'bpn_tpha',  name:'TPHA / VDRL (Syphilis)',      type:'qual' },
    { id:'bpn_toxog', name:'Toxoplasmose IgG',            type:'quant', unit:'UI/mL', ref:'> 8 = immunisée' },
    { id:'bpn_toxom', name:'Toxoplasmose IgM',            type:'qual' },
    { id:'bpn_rubg',  name:'Rubéole IgG',                 type:'quant', unit:'UI/mL', ref:'> 10 = immunisée' },
    { id:'bpn_rubm',  name:'Rubéole IgM',                 type:'qual' },
  ];
  const tbl = document.createElement('div');
  tbl.innerHTML = `<div class="table-wrap"><table class="result-table">
    <thead><tr><th>Test</th><th>Résultat qualitatif</th><th>Valeur numérique</th><th>Valeurs normales / Seuil</th></tr></thead>
    <tbody id="bpn-sero-tbl"></tbody></table></div>`;
  wrap.appendChild(tbl);
  const b = document.getElementById('bpn-sero-tbl');
  BPN_SERO_LIST.forEach(t => {
    const tr = document.createElement('tr');
    const refTxt = t.ref || (t.type === 'qual' ? 'Négatif attendu' : '');
    tr.innerHTML = `<td style="font-size:13px">${t.name}</td>
      <td><select id="sr_${t.id}_r"><option value="">—</option><option>Positif</option><option>Négatif</option><option>Non réalisé</option></select></td>
      <td><input type="number" id="sv_${t.id}" step="any" style="width:80px" placeholder="${t.unit||''}"></td>
      <td><span class="ref-range">${refTxt}</span></td>`;
    b.appendChild(tr);
  });
}

function buildBpnNfs() {
  // NFS
  const b = document.getElementById('bpn-nfs-body');
  b.innerHTML = '';
  BPN_NFS.forEach(p => makeParamRowColored(p, b));

  // Brancher le calcul des constantes sur Hb, Ht, GR du BPN
  ['bpn_hb','bpn_ht','bpn_gr'].forEach(id => {
    const el = document.getElementById('v_' + id);
    if (el) el.addEventListener('input', calcConstantesBPN);
  });

  // FL du BPN — identique à hémato avec valeurs absolues
  const bfl = document.getElementById('bpn-fl-body');
  if (bfl) {
    bfl.innerHTML = '';
    BPN_FL.forEach(p => {
      const tr = document.createElement('tr');
      const profile = getPatientProfile();
      const dynRef  = getRef(p.id, profile) || { ref: p.ref };
      tr.innerHTML = `
        <td style="font-size:13px">${p.name}</td>
        <td><input type="number" id="v_${p.id}" step="any" min="0" max="100" style="width:75px"
            oninput="onParamInputColored('${p.id}'); calcBpnFLAbsolues()"></td>
        <td>
          <span class="unit">%</span>
          <span style="display:inline-block;margin-left:6px;min-width:60px;font-size:11px;color:var(--accent);font-weight:600" id="bpn_abs_${p.id}"></span>
        </td>
        <td><span class="ref-range" id="ref_${p.id}">${dynRef.ref || p.ref}</span></td>`;
      bfl.appendChild(tr);
    });

    // Brancher le calcul FL absolues sur GB du BPN
    const gbBpn = document.getElementById('v_bpn_gb');
    if (gbBpn) gbBpn.addEventListener('input', calcBpnFLAbsolues);
  }
}

function calcConstantesBPN() {
  const hb  = parseFloat(document.getElementById('v_bpn_hb')?.value  || '');
  const ht  = parseFloat(document.getElementById('v_bpn_ht')?.value  || '');
  const gr  = parseFloat(document.getElementById('v_bpn_gr')?.value  || '');
  if (!isNaN(hb) && !isNaN(gr) && gr > 0) {
    const vgmEl = document.getElementById('v_bpn_vgm');
    if (vgmEl) { vgmEl.value = (ht / gr * 10).toFixed(1); onParamInputColored('bpn_vgm'); }
    const tcmhEl = document.getElementById('v_bpn_tcmh');
    if (tcmhEl) { tcmhEl.value = (hb / gr * 10).toFixed(1); onParamInputColored('bpn_tcmh'); }
    const ccmhEl = document.getElementById('v_bpn_ccmh');
    if (ccmhEl) { ccmhEl.value = (hb / ht * 100).toFixed(1); onParamInputColored('bpn_ccmh'); }
  }
}

function calcBpnFLAbsolues() {
  const gb = parseFloat(document.getElementById('v_bpn_gb')?.value || '0');
  BPN_FL.forEach(p => {
    const pct    = parseFloat(document.getElementById('v_' + p.id)?.value || '');
    const absEl  = document.getElementById('bpn_abs_' + p.id);
    if (absEl) {
      absEl.textContent = (!isNaN(pct) && !isNaN(gb) && gb > 0) ? (pct * gb / 100).toFixed(2) : '';
    }
  });
}


// ── Utilitaire : clone un panneau et préfixe tous ses IDs ────────
// prefix = 'bpn2_'   →  id="foo" devient id="bpn2_foo"
//                    et for="foo" → for="bpn2_foo"
//                    et tout attribut pointant vers ces IDs dans onclick, oninput, etc.
function clonePanelInto(sourcePanelId, targetDivId, prefix) {
  const src = document.getElementById(sourcePanelId);
  const dst = document.getElementById(targetDivId);
  if (!src || !dst) return;

  // Cloner profondément
  const clone = src.cloneNode(true);

  // Fonctions utilitaires pour renuméroter
  function prefixId(val) {
    return val ? prefix + val : val;
  }
  // Attributs à préfixer directement
  const DIRECT = ['id','for','aria-labelledby','aria-describedby'];
  // Attributs JS où on remplace les IDs connus
  const JS_ATTRS = ['oninput','onchange','onclick','onkeydown'];

  // Collecter tous les IDs existants dans la source pour ne préfixer que ceux-là
  const knownIds = new Set();
  src.querySelectorAll('[id]').forEach(el => knownIds.add(el.id));

  function processNode(node) {
    if (node.nodeType !== 1) return; // seulement les éléments
    DIRECT.forEach(attr => {
      const v = node.getAttribute(attr);
      if (v && knownIds.has(v)) node.setAttribute(attr, prefixId(v));
    });
    // Traiter les attributs JS : remplacer chaque ID connu
    JS_ATTRS.forEach(attr => {
      let v = node.getAttribute(attr);
      if (!v) return;
      knownIds.forEach(id => {
        // Remplacer les occurrences exactes de l'ID entre quotes ou parenthèses
        const re = new RegExp("(['\"`(,\\s])" + id + "(['\"`),\\s])", 'g');
        v = v.replace(re, '$1' + prefix + id + '$2');
        // Cas getElementById, querySelector #id
        const re2 = new RegExp("getElementById\\('(" + id + ")'\\)", 'g');
        v = v.replace(re2, "getElementById('" + prefix + "$1')");
      });
      node.setAttribute(attr, v);
    });
    // Récursion sur les enfants
    node.childNodes.forEach(processNode);
  }

  // Appliquer sur tous les éléments du clone
  clone.querySelectorAll('[id]').forEach(el => {
    if (knownIds.has(el.id)) el.id = prefixId(el.id);
  });
  clone.querySelectorAll('[for]').forEach(el => {
    const v = el.getAttribute('for');
    if (v && knownIds.has(v)) el.setAttribute('for', prefixId(v));
  });
  // Attributs JS
  JS_ATTRS.forEach(attr => {
    clone.querySelectorAll('[' + attr + ']').forEach(el => {
      let v = el.getAttribute(attr);
      knownIds.forEach(id => {
        // Remplace 'id' ou "id" dans les attributs JS
        v = v.split("'" + id + "'").join("'" + prefix + id + "'");
        v = v.split('"' + id + '"').join('"' + prefix + id + '"');
        v = v.split('`' + id + '`').join('`' + prefix + id + '`');
      });
      el.setAttribute(attr, v);
    });
  });

  // Retirer les boutons Enregistrer/Export/Effacer (pas besoin dans le BPN)
  clone.querySelectorAll('.btn-row').forEach(el => el.remove());

  dst.innerHTML = '';
  // Copier les enfants du clone (pas le div panel lui-même)
  Array.from(clone.children).forEach(child => dst.appendChild(child.cloneNode(true)));
}

function buildBpnBio() {
  // Construire d'abord l'onglet bio (au cas où il ne l'est pas encore)
  if (!document.getElementById('bio-glucides-body')?.children.length) buildBio();
  clonePanelInto('panel-bio', 'bpn-clone-bio', 'bpn2_');
}

function buildBpnBacterio() {
  if (!document.getElementById('abg-grid')?.children.length) buildAbg();
  clonePanelInto('panel-bacterio', 'bpn-clone-bacterio', 'bpn3_');
}

function buildBpnSero() {
  if (!document.getElementById('sero-body')?.children.length) buildSero();
  clonePanelInto('panel-sero', 'bpn-clone-sero', 'bpn4_');
}


// ============================================================
// FORMULES AUTO — CONSTANTES HÉMATIMÉTRIQUES & LDL
// ============================================================

function calcConstantes() {
  const hb  = parseFloat(document.getElementById('v_hb')?.value);
  const ht  = parseFloat(document.getElementById('v_ht')?.value);
  const gr  = parseFloat(document.getElementById('v_gr')?.value);

  // VGM = (Ht% / GR×10⁶) × 10  → fL
  if (!isNaN(ht) && !isNaN(gr) && gr > 0) {
    const vgm = ((ht / gr) * 10).toFixed(1);
    const el = document.getElementById('v_vgm');
    if (el) { el.value = vgm; onParamInputColored('vgm'); }
  }
  // TCMH = Hb(g/dL) / GR(10⁶/µL) × 10  → pg
  if (!isNaN(hb) && !isNaN(gr) && gr > 0) {
    const tcmh = ((hb / gr) * 10).toFixed(1);
    const el = document.getElementById('v_tcmh');
    if (el) { el.value = tcmh; onParamInputColored('tcmh'); }
  }
  // CCMH = Hb(g/dL) / Ht% × 100  → g/dL
  if (!isNaN(hb) && !isNaN(ht) && ht > 0) {
    const ccmh = ((hb / ht) * 100).toFixed(1);
    const el = document.getElementById('v_ccmh');
    if (el) { el.value = ccmh; onParamInputColored('ccmh'); }
  }
}

function calcLDL() {
  // Formule de Friedewald : LDL = Chol total − HDL − (TG / 5)  [en g/L]
  const chol = parseFloat(document.getElementById('v_chol')?.value);
  const hdl  = parseFloat(document.getElementById('v_hdl')?.value);
  const trig = parseFloat(document.getElementById('v_trig')?.value);

  if (!isNaN(chol) && !isNaN(hdl) && !isNaN(trig) && trig < 4.0) {
    const ldl = (chol - hdl - (trig / 5)).toFixed(2);
    const el = document.getElementById('v_ldl');
    if (el) { el.value = ldl; onParamInput('ldl'); }
  }
}

// Données Widal
const WIDAL_ANTIGENES = [
  { id:'to',  name:'Salmonella typhi O (TO)',           seuil: 80 },
  { id:'th',  name:'Salmonella typhi H (TH)',            seuil: 80 },
  { id:'ao',  name:'Salmonella paratyphi A O (AO)',     seuil: 80 },
  { id:'ah',  name:'Salmonella paratyphi A H (AH)',     seuil: 80 },
  { id:'bo',  name:'Salmonella paratyphi B O (BO)',     seuil: 80 },
  { id:'bh',  name:'Salmonella paratyphi B H (BH)',     seuil: 80 },
  { id:'co',  name:'Salmonella paratyphi C O (CO)',     seuil: 80 },
  { id:'ch',  name:'Salmonella paratyphi C H (CH)',     seuil: 80 },
];
const WIDAL_DILUTIONS = ['Non réalisé','Négatif','1/40','1/80','1/160','1/320'];

function buildHema() {
  const b1 = document.getElementById('hema-body');
  const b2 = document.getElementById('hema-fl-body');
  b1.innerHTML = ''; b2.innerHTML = '';

  // NFS standard
  HEMA_PARAMS.forEach(p => makeParamRowColored(p, b1));

  // Formule leucocytaire avec valeurs absolues (sans unité affichée, case colorée)
  HEMA_FL.forEach(p => {
    const tr = document.createElement('tr');
    const profile = getPatientProfile();
    const dynRef = getRef(p.id, profile);
    const refDisplay = dynRef ? dynRef.ref : (p.ref || '');
    tr.innerHTML = `
      <td style="font-size:13px">${p.name}</td>
      <td><input type="number" id="v_${p.id}" step="any" min="0" max="100" style="width:75px"
          oninput="onParamInputColored('${p.id}'); calcFLAbsolues()"></td>
      <td>
        <span class="unit">%</span>
        <span style="display:inline-block;margin-left:6px;min-width:60px;font-size:11px;color:var(--accent);font-weight:600" id="abs_${p.id}"></span>
      </td>
      <td><span class="ref-range" id="ref_${p.id}">${refDisplay}</span></td>`;
    b2.appendChild(tr);
  });

  // Électrophorèse Hb
  const b3 = document.getElementById('ephb-body');
  if (b3) {
    b3.innerHTML = '';
    EPHB_FRACTIONS.forEach(p => {
      const profile = getPatientProfile();
      const dynRef  = getRef(p.id, profile);
      const refDisp = dynRef ? dynRef.ref : (p.ref || '');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-size:13px">${p.name}</td>
        <td><input type="number" id="${p.id}" step="0.1" min="0" max="100" style="width:80px"
            oninput="checkEphbTotal()"></td>
        <td><span class="ref-range" id="ref_${p.id}">${refDisp}</span></td>
        <td><span class="interp" id="i_${p.id}">—</span></td>`;
      b3.appendChild(tr);
    });
    // Ligne total
    const trTotal = document.createElement('tr');
    trTotal.innerHTML = `<td style="font-weight:700">Total</td>
      <td><span id="ephb_total" style="font-weight:700;color:var(--accent)">0</span> %</td>
      <td colspan="2" style="font-size:11.5px;color:var(--text-muted)">Doit être égal à 100%</td>`;
    b3.appendChild(trTotal);
  }

  // Brancher calculs auto
  ['v_hb','v_ht','v_gr'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', calcConstantes);
  });
  // Brancher calcul FL absolues sur GB
  const gbEl = document.getElementById('v_gbc');
  if (gbEl) gbEl.addEventListener('input', calcFLAbsolues);
}

function calcFLAbsolues() {
  const gb = parseFloat(document.getElementById('v_gbc')?.value || '0');
  HEMA_FL.forEach(p => {
    const pct    = parseFloat(document.getElementById('v_' + p.id)?.value || '');
    const absEl  = document.getElementById('abs_' + p.id);
    if (absEl) {
      absEl.textContent = (!isNaN(pct) && !isNaN(gb) && gb > 0) ? (pct * gb / 100).toFixed(2) : '';
    }
  });
}

function checkEphbTotal() {
  let total = 0;
  EPHB_FRACTIONS.forEach(p => {
    const v = parseFloat(document.getElementById(p.id)?.value || '0');
    if (!isNaN(v)) total += v;
    // Interprétation simple
    const interpEl = document.getElementById('i_' + p.id);
    if (interpEl) {
      const val = parseFloat(document.getElementById(p.id)?.value || '');
      if (isNaN(val) || document.getElementById(p.id)?.value === '') { interpEl.textContent = '—'; interpEl.className='interp'; return; }
      if (val < p.lo || val > p.hi) { interpEl.textContent = 'Anormal'; interpEl.className='interp hi'; }
      else { interpEl.textContent = 'Normal'; interpEl.className='interp ok'; }
    }
  });
  const totalEl = document.getElementById('ephb_total');
  if (totalEl) {
    totalEl.textContent = total.toFixed(1);
    totalEl.style.color = Math.abs(total - 100) < 0.5 ? 'var(--success)' : 'var(--danger)';
  }
}

// ── CRP par paliers ────────────────────────────────────────
function interpretCRP() {
  const sel = document.getElementById('crp_valeur');
  const interpEl = document.getElementById('crp_interp');
  if (!sel || !interpEl) return;
  const v = sel.value;
  if (!v) { interpEl.textContent = '—'; interpEl.style.background = 'var(--bg)'; interpEl.style.color = 'inherit'; return; }
  if (v === 'neg') {
    interpEl.textContent = '✓ NÉGATIF — Absence de syndrome inflammatoire (CRP < 6 mg/L)';
    interpEl.style.background = '#e7f7ec'; interpEl.style.color = '#15803d';
  } else {
    const n = parseInt(v);
    let comment = '';
    if (n <= 24)  comment = 'Syndrome inflammatoire modéré';
    else if (n <= 96)  comment = 'Syndrome inflammatoire important';
    else comment = 'Syndrome inflammatoire majeur — Infection bactérienne sévère probable';
    interpEl.textContent = `⚠ POSITIF — ${n} mg/L — ${comment}`;
    interpEl.style.background = '#fde8e8'; interpEl.style.color = '#b91c1c';
  }
}

// ── Widal ──────────────────────────────────────────────────
function buildWidal() {
  const b = document.getElementById('widal-body');
  if (!b) return;
  b.innerHTML = '';
  WIDAL_ANTIGENES.forEach(ag => {
    const tr = document.createElement('tr');
    const opts = WIDAL_DILUTIONS.map(d => `<option value="${d}">${d}</option>`).join('');
    const cinetOpts = '<option value="">—</option><option value="montant">↗ Montant</option><option value="stable">→ Stable</option><option value="descendant">↘ Descendant</option>';
    tr.innerHTML = `
      <td style="font-size:12.5px;white-space:nowrap">${ag.name}<br><span style="font-size:10.5px;color:var(--text-muted)" id="widal_seuil_lbl_${ag.id}">Seuil significatif : 1/${(getCustomRefs()['widal_'+ag.id]?.lo)||ag.seuil}</span></td>
      <td><select id="widal_${ag.id}" onchange="interpretWidal()" style="width:100px">${opts}</select></td>
      <td><select id="widal_cin_${ag.id}" onchange="interpretWidal()" style="width:130px">${cinetOpts}</select></td>
      <td><span id="widal_i_${ag.id}" style="font-size:12px;font-weight:600">—</span></td>`;
    b.appendChild(tr);
  });
}

function widalTitre(val) {
  if (!val || val === 'Négatif') return 0;
  const m = val.match(/1\/(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

function interpretWidal() {
  const conclusionEl = document.getElementById('widal-conclusion');

  // Interprétation individuelle par antigène
  WIDAL_ANTIGENES.forEach(ag => {
    const titre  = widalTitre(document.getElementById('widal_' + ag.id)?.value);
    const interpEl = document.getElementById('widal_i_' + ag.id);
    if (!interpEl) return;
    if (titre === 0) {
      interpEl.textContent = '—'; interpEl.style.color = 'inherit'; return;
    }
    if (titre >= ag.seuil) {
      interpEl.textContent = '⚠ Significatif (≥ 1/' + ag.seuil + ')';
      interpEl.style.color = '#b91c1c';
    } else {
      interpEl.textContent = 'Non significatif (< 1/' + ag.seuil + ')';
      interpEl.style.color = 'var(--text-muted)';
    }
  });

  // ── Conclusion globale basée sur TO et TH ─────────────────────
  const to = widalTitre(document.getElementById('widal_to')?.value);
  const th = widalTitre(document.getElementById('widal_th')?.value);

  // ✅ v13.23 — masquer si TOUS les 8 antigènes sont à zéro ou Non réalisé
  const anyFilled = WIDAL_ANTIGENES.some(ag => {
    const v = document.getElementById('widal_' + ag.id)?.value;
    return v && v !== 'Non réalisé' && v !== '';
  });
  if (!anyFilled) {
    if (conclusionEl) conclusionEl.style.display = 'none';
    return;
  }

  // Lire les seuils depuis la config si modifiés par l'admin
  const custom = getCustomRefs();
  const seuilTO = custom['widal_to']?.lo || 80;
  const seuilTH = custom['widal_th']?.lo || 80;
  const toSignif = to >= seuilTO;
  const thSignif = th >= seuilTH;

  let conclusion = '';
  let color = '', bg = '';

  if (toSignif && thSignif) {
    // Les deux significatifs → Phase d'état
    conclusion = '🔴 PHASE D\'ÉTAT — TO ≥ 1/80 ET TH ≥ 1/80. '
      + 'Forte présomption de fièvre typhoïde en phase d\'état. '
      + 'Corréler avec la clinique et instaurer un traitement.';
    color = '#991b1b'; bg = '#fde8e8';

  } else if (toSignif && !thSignif) {
    // Seulement TO significatif → Début d'infection
    conclusion = '🟠 INFECTION À L\'ÉTAT DE DÉBUT — TO ≥ 1/80 mais TH < 1/80. '
      + 'Les anticorps O apparaissent en premier : infection récente probable. '
      + 'Répéter le sérodiagnostic dans 8–10 jours pour confirmer l\'ascension des titres.';
    color = '#b45309'; bg = '#fef3c7';

  } else if (!toSignif && thSignif) {
    // Seulement TH significatif → Traces cicatricielles
    conclusion = '🟡 TRACES CICATRICIELLES — TH ≥ 1/80 mais TO < 1/80. '
      + 'Les anticorps H persistent longtemps après guérison : infection ancienne probable ou vaccination. '
      + 'Pas d\'argument pour une infection évolutive actuelle.';
    color = '#854d0e'; bg = '#fefce8';

  } else {
    // Titres présents mais sous le seuil pour les deux
    conclusion = '⚪ TITRES NON SIGNIFICATIFS — TO et TH < 1/80. '
      + 'Pas d\'argument sérologique pour une fièvre typhoïde. '
      + 'Répéter si suspicion clinique persistante.';
    color = '#374151'; bg = 'var(--bg)';
  }

  if (conclusionEl) {
    conclusionEl.style.display  = 'block';
    conclusionEl.textContent    = conclusion;
    conclusionEl.style.background   = bg;
    conclusionEl.style.color        = color;
    conclusionEl.style.borderColor  = color;
    conclusionEl.style.borderWidth  = '1.5px';
    conclusionEl.style.borderStyle  = 'solid';
    conclusionEl.style.padding      = '10px 14px';
    conclusionEl.style.borderRadius = 'var(--radius)';
    conclusionEl.style.fontWeight   = '600';
    conclusionEl.style.fontSize     = '13px';
    conclusionEl.style.lineHeight   = '1.55';
  }
}



function buildBio() {
  [['bio-glucides-body', BIO_GLUCIDES],['bio-rein-body', BIO_REIN],
   ['bio-foie-body', BIO_FOIE],['bio-lipides-body', BIO_LIPIDES],
   ['bio-iono-body', BIO_IONO],['bio-fer-body', BIO_FER],
   ['bio-card-body', BIO_CARD],['bio-horm-body', BIO_HORM],
   ['bio-coag-body', BIO_COAG],['bio-autre-body', BIO_AUTRE],
  ].forEach(([id, arr]) => {
    const b = document.getElementById(id); b.innerHTML = '';
    arr.forEach(p => makeParamRow(p, b));
  });
  // LDL calculé automatiquement (Friedewald)
  const ldlEl = document.getElementById('v_ldl');
  if (ldlEl) {
    ldlEl.readOnly = true;
    ldlEl.style.cssText = 'width:90px;background:var(--accent-light);color:var(--accent);font-weight:600;cursor:default;';
    ldlEl.title = 'Calculé automatiquement : Friedewald (LDL = Chol − HDL − TG/5)';
  }
  ['v_chol','v_hdl','v_trig'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', calcLDL);
  });
}

function buildAbgGrid(containerId, antibioList) {
  const g = document.getElementById(containerId);
  if (!g) return;
  g.innerHTML = '';
  antibioList.forEach(ab => {
    const d = document.createElement('div');
    d.className = 'abg-row nd';
    d.id = (containerId === 'abg-grid' ? 'abg_' : 'afg_') + ab.replace(/[^a-z]/gi,'_');
    d.innerHTML = `<span class="abg-name">${ab}</span>
      <select onchange="updateAbgColor(this,'${ab}')">
        <option value="nd">N/D</option>
        <option value="S">S</option>
        <option value="I">I</option>
        <option value="R">R</option>
      </select>`;
    g.appendChild(d);
  });
}

function buildAbg() {
  buildAbgGrid('abg-grid', ABG_ANTIBIOS);
  buildAbgGrid('afg-grid', AFG_ANTIFONGIQUES);
}

function updateAbgColor(sel, ab) {
  const row = sel.closest('.abg-row');
  row.className = 'abg-row ' + sel.value;
}

// ── Fonctions ECBU ─────────────────────────────────────────
function adaptBacterioForm() {
  const type = document.getElementById('bac_type')?.value || '';
  const isECBU = type === 'ECBU';
  // Macroscopie surtout utile pour ECBU
  const macroCard = document.getElementById('bac-macro-card');
  if (macroCard) macroCard.style.display = isECBU ? '' : 'none';
}

function interpretEtatFrais(type) {
  if (type === 'leuco') {
    const val = parseInt(document.getElementById('ef_leuco')?.value || '0');
    const el = document.getElementById('ef_i_leuco');
    if (!el) return;
    if (!val || isNaN(val)) { el.textContent = ''; el.style.color = ''; return; }
    if (val >= 10000) { el.textContent = '⚠ Pyurie significative (≥10 000/mm³)'; el.style.color = '#b91c1c'; }
    else if (val >= 5000) { el.textContent = '⚠ Pyurie modérée'; el.style.color = '#d97706'; }
    else { el.textContent = '✓ Normal (< 5 000/mm³)'; el.style.color = '#15803d'; }
    checkBacteriurie();
  } else if (type === 'hematies') {
    const val = parseInt(document.getElementById('ef_hematies')?.value || '0');
    const el = document.getElementById('ef_i_hematies');
    if (!el) return;
    if (!val || isNaN(val)) { el.textContent = ''; el.style.color = ''; return; }
    if (val >= 10000) { el.textContent = '⚠ Hématurie significative'; el.style.color = '#b91c1c'; }
    else if (val >= 3000) { el.textContent = 'Hématurie modérée'; el.style.color = '#d97706'; }
    else { el.textContent = '✓ Normal'; el.style.color = '#15803d'; }
  }
}

function checkBacteriurie() {
  const alertEl = document.getElementById('bacteriurie-alert');
  if (!alertEl) return;
  const leuco = parseInt(document.getElementById('ef_leuco')?.value || '0');
  const bacteries = document.getElementById('ef_bacteries')?.value || '';
  const numeration = document.getElementById('bac_numeration')?.value || '';

  if (leuco >= 10000 && (bacteries.includes('Nombreuses') || numeration.includes('≥ 10⁵'))) {
    alertEl.style.display = 'block';
    alertEl.style.background = '#fde8e8'; alertEl.style.color = '#b91c1c'; alertEl.style.border = '1px solid #b91c1c';
    alertEl.textContent = '⚠ INFECTION URINAIRE PROBABLE — Pyurie significative + bactériurie importante. Identification et antibiogramme recommandés.';
  } else if (leuco >= 10000) {
    alertEl.style.display = 'block';
    alertEl.style.background = '#fef3c7'; alertEl.style.color = '#b45309'; alertEl.style.border = '1px solid #d97706';
    alertEl.textContent = '⚠ Pyurie significative sans bactériurie évidente — Tuberculose urinaire ou urétrite à éliminer.';
  } else {
    alertEl.style.display = 'none';
  }
}

function updateCultureFields() {
  const val = document.getElementById('bac_culture')?.value;
  const showFields = val === 'pos';
  ['bac-count-field','bac-germe-field','bac-germe2-field','bac-milieu-field','bac-abg-card'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = showFields ? '' : 'none';
  });
}

function updateGramDetail() {
  const val = document.getElementById('bac_gram')?.value || '';
  const commentEl = document.getElementById('bac_gram_comment');
  if (!commentEl) return;
  const comments = {
    'coc_G+': 'Cocci Gram positif en amas — Morphologie évocatrice de Staphylococcus sp.',
    'coc_G+_ch': 'Cocci Gram positif en chaînettes — Morphologie évocatrice de Streptococcus sp.',
    'coc_G+_dp': 'Cocci Gram positif encapsulés en diplocoque — Évocateur de Streptococcus pneumoniae',
    'coc_G-': 'Cocci Gram négatif en diplocoque intra-leucocytaires — Gonocoque / Méningocoque à suspecter',
    'bac_G-': 'Bacilles Gram négatif — Famille des Entérobactéries ou BGN non fermentants',
    'bac_G-_e': 'Bacilles Gram négatif entérobactéries — E. coli, Klebsiella, Proteus...à identifier',
    'bac_G+': 'Bacilles Gram positif — Listeria, Bacillus, Clostridium à suspecter selon contexte',
    'lev': 'Levures / Filaments mycéliens visibles — Infection fongique à confirmer (Candida, Aspergillus...)',
    'poly': 'Flore polymorphe — Possible contamination au prélèvement, interpréter avec précaution',
  };
  if (!commentEl.value && comments[val]) commentEl.value = comments[val];
}



function buildSero() {
  const b = document.getElementById('sero-body'); b.innerHTML = '';
  SERO_TESTS.forEach(t => {
    const tr = document.createElement('tr');
    const profile = getPatientProfile();
    // Chercher les refs dans la config (clé: sero_<id>)
    const cfgRef = getRef('sero_' + t.id, profile);
    const refText = cfgRef ? cfgRef.ref : (t.ref || '');
    const unitText = getUnit('sero_' + t.id, t.unit || '');
    tr.innerHTML = `
      <td style="font-size:13px">${t.name}</td>
      <td>${t.type === 'qual'
        ? `<select id="sr_${t.id}" style="width:130px"><option value="">—</option><option>Positif</option><option>Négatif</option><option>Douteux</option></select>`
        : `<select id="sr_${t.id}_r" style="width:130px"><option value="">—</option><option>Positif</option><option>Négatif</option></select>`}</td>
      <td>${t.type === 'quant'
        ? `<input type="number" id="sv_${t.id}" step="any" style="width:90px"
             placeholder="valeur"
             oninput="onSeroQuantInput('${t.id}')">
           <span class="unit" id="sero_unit_${t.id}">${unitText}</span>
           <span class="interp" id="sero_interp_${t.id}" style="margin-left:6px"></span>`
        : '<span class="unit">—</span>'}</td>
      <td>${refText
        ? `<span class="ref-range" id="sero_ref_${t.id}">${refText}</span>`
        : `<span class="ref-range">—</span>`}</td>
      <td><input type="text" id="so_${t.id}" placeholder="commentaire" style="width:100%"></td>
    `;
    b.appendChild(tr);
  });
  // ✅ v13.24 — SWF et CRP sont maintenant sur l'onglet Sérologie
  buildWidal();
  if (typeof interpretCRP === 'function') interpretCRP();
}

// Interprétation en temps réel pour les sérologies quantitatives
function onSeroQuantInput(id) {
  const valEl    = document.getElementById('sv_' + id);
  const interpEl = document.getElementById('sero_interp_' + id);
  if (!valEl || !interpEl) return;
  const val = parseFloat(valEl.value);
  if (isNaN(val) || valEl.value === '') { interpEl.textContent = ''; interpEl.className = 'interp'; return; }
  const profile = getPatientProfile();
  const ref = getRef('sero_' + id, profile);
  if (!ref) { interpEl.textContent = ''; return; }
  const interp = interprete(val, ref.lo, ref.hi);
  interpEl.textContent = interp || '';
  interpEl.className   = 'interp ' + (interp==='Élevé'?'hi':interp==='Bas'?'lo':interp==='Normal'?'ok':'');
}

function buildParaEPS() {
  const b = document.getElementById('para-eps-body'); b.innerHTML = '';
  PARA_EPS.forEach(pa => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-size:13px">${pa}</td>
      <td><select id="pe_${pa.replace(/[^a-z]/gi,'_')}" style="width:110px">
        <option value="">—</option><option>Positif</option><option>Négatif</option>
      </select></td>
      <td><input type="text" placeholder="obs..." style="width:100%"></td>
    `;
    b.appendChild(tr);
  });
}

function buildGS() {
  const b = document.getElementById('gs-body'); b.innerHTML = '';
  GS_PARAMS.forEach(p => {
    const tr = document.createElement('tr');
    let input = '';
    if (p.type === 'sel') {
      input = `<select id="${p.id}" style="width:120px"><option value="">—</option>${p.opts.map(o=>`<option>${o}</option>`).join('')}</select>`;
    } else if (p.type === 'qual2') {
      // ✅ v13.24 — Rhésus : déclenche le commentaire automatique
      const onch = p.id === 'gs_rh' ? ' onchange="autoCommentRh()"' : '';
      input = `<select id="${p.id}" style="width:130px"${onch}><option value="">—</option>${p.opts.map(o=>`<option>${o}</option>`).join('')}</select>`;
    } else {
      input = `<input type="text" id="${p.id}" style="width:100%;max-width:320px" placeholder="—">`;
    }
    tr.innerHTML = `<td style="font-size:13px;white-space:nowrap">${p.name}</td><td colspan="3">${input}</td>`;
    b.appendChild(tr);
  });
}

// ✅ v13.24 — Commentaire automatique quand Rhésus est Négatif
function autoCommentRh() {
  const rh = document.getElementById('gs_rh')?.value;
  const obs = document.getElementById('gs_obs');
  if (!obs) return;
  if (rh === 'Négatif' && !obs.value) {
    obs.value = 'Sous réserve du Du';
  } else if (rh !== 'Négatif' && obs.value === 'Sous réserve du Du') {
    obs.value = '';
  }
}

// Compatibilité avec les anciens appels (encore dans certains oninput générés)
function autoInterp(id, lo, hiM, hiF) {
  onParamInputColored(id); // VGM/TCMH/CCMH font partie de la NFS : case colorée, pas de texte
}

// Calcule et affiche le montant pour l'onglet courant

// ✅ v13.35 — Mise à jour du bouton "Enregistrer tout" selon les coches
function updateSaveAllBar() {
  const bar  = document.getElementById('save-all-bar');
  const hint = document.getElementById('save-all-hint');
  if (!bar) return;

  const tabsCoches = TAB_ORDER.filter(tabId => {
    const cat = getCatalogueComplet().filter(ex => ex.tab === tabId);
    return cat.some(ex => document.getElementById(ex.id)?.checked);
  });

  if (tabsCoches.length > 1) {
    bar.style.display = 'block';
    if (hint) {
      const labels = tabsCoches.map(t => TAB_TO_TYPE[t] || t).join(', ');
      hint.textContent = tabsCoches.length + ' analyses détectées : ' + labels;
    }
  } else {
    bar.style.display = 'none';
  }
}
function updateMontantCurrent() {
  // ✅ v13.11 — Le « Total facture » = somme des examens cochés sur la fiche.
  // Si la fiche a été renseignée, elle fait foi : on ne l'écrase PAS par le
  // montant du seul onglet courant (c'était la cause du « prix qui change »
  // en passant d'un onglet à l'autre). Sinon, calcul automatique par onglet.
  const el = document.getElementById('montant-preview');
  let ficheUtilisee = false;
  try {
    const parTab = JSON.parse(el?.dataset?.montantParTab || '{}');
    ficheUtilisee = Object.keys(parTab).length > 0;
  } catch(e) {}
  if (ficheUtilisee && typeof calcFicheTotal === 'function') { calcFicheTotal(); updateSaveAllBar(); return; }

  const activeTab = document.querySelector('.tab.active');
  if (!activeTab) return;
  const tabId = activeTab.id.replace('tab-', '');
  const typeMap = {
    hema:'Hématologie', bio:'Biochimie', bacterio:'Bactériologie',
    sero:'Immuno-Sérologie', parasito:'Parasitologie',
    gs:'Groupe sanguin', bpn:'Bilan prénatal'
  };
  const type = typeMap[tabId];
  if (!type) return;
  updateMontant(type);
  updateSaveAllBar(); // ✅ v13.35
}

// ============================================================
// NAVIGATION
// ============================================================


