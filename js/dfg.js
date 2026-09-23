/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — dfg.js
   Calcul automatique du DFG (clairance de la créatinine).
   Chargé en script classique (portée globale), comme les autres modules.

   Deux techniques affichées dans la case « Clairance créatinine (DFG) » :
   • CKD-EPI 2021 (sans race) → mL/min/1,73 m²  (recommandé, sans poids)
   • Cockcroft-Gault          → mL/min          (nécessite le poids)

   Recalcul déclenché dès que la créatinine, l'âge, le sexe ou le poids
   change (voir recalcDFG(), appelée depuis onParamInput('crea'),
   updateAllRefs() et le champ poids de la fiche patient).
   ═══════════════════════════════════════════════════════════════ */

// Conversion créatinine -> mg/L (MM créat = 113,12 g/mol)
const CREAT_VERS_MGL = {
  'mg/l': 1, 'mg/dl': 10, 'g/l': 1000,
  'µmol/l': 1 / 8.84, 'umol/l': 1 / 8.84, 'mmol/l': 113.12,
};

function creatEnMgL(valeur, unite) {
  const v = parseFloat(String(valeur).replace(',', '.').trim());
  if (!isFinite(v) || v <= 0) return null;
  const u = String(unite || 'mg/L').trim().toLowerCase().replace('μ', 'µ');
  const f = CREAT_VERS_MGL[u];
  return f == null ? null : v * f;
}

function dfgEstFemme(sexe) {
  return String(sexe || '').trim().toLowerCase().startsWith('f');
}

function dfgParseAge(age) {
  const m = String(age || '').replace(',', '.').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

// Cockcroft-Gault (mL/min) — nécessite le poids
function dfgCockcroft(creatMgL, ageAns, poidsKg, sexe) {
  if (!creatMgL || !ageAns || !poidsKg) return null;
  const creatUmol = creatMgL * 8.84;
  const k = dfgEstFemme(sexe) ? 1.04 : 1.23;
  return Math.round(((140 - ageAns) * poidsKg * k) / creatUmol * 10) / 10;
}

// CKD-EPI 2021 sans race (mL/min/1,73 m²) — pas besoin du poids
function dfgCkdEpi2021(creatMgL, ageAns, sexe) {
  if (!creatMgL || !ageAns) return null;
  const scr = creatMgL / 10;                 // mg/L -> mg/dL
  const femme = dfgEstFemme(sexe);
  const kappa = femme ? 0.7 : 0.9;
  const alpha = femme ? -0.241 : -0.302;
  const ratio = scr / kappa;
  const dfg = 142
    * Math.pow(Math.min(ratio, 1), alpha)
    * Math.pow(Math.max(ratio, 1), -1.200)
    * Math.pow(0.9938, ageAns)
    * (femme ? 1.012 : 1);
  return Math.round(dfg * 10) / 10;
}

// Interprétation par stade KDIGO
function dfgStade(dfg) {
  if (dfg == null) return '';
  if (dfg >= 90) return 'Normal (G1)';
  if (dfg >= 60) return 'Légèrement diminué (G2)';
  if (dfg >= 45) return 'Insuff. rénale légère à modérée (G3a)';
  if (dfg >= 30) return 'Insuff. rénale modérée à sévère (G3b)';
  if (dfg >= 15) return 'Insuffisance rénale sévère (G4)';
  return 'Insuffisance rénale terminale (G5)';
}

// Générique (avec unité) → { ckd_epi_2021, cockcroft_gault, stades, texte }
function calculerDFG({ creat, unite = 'mg/L', age, sexe, poidsKg }) {
  const creatMgL = creatEnMgL(creat, unite);
  const ageAns = dfgParseAge(age);
  if (creatMgL == null) return { erreur: 'Créatinine ou unité invalide' };
  const ckdEpi = dfgCkdEpi2021(creatMgL, ageAns, sexe);
  const cockcroft = dfgCockcroft(creatMgL, ageAns, poidsKg, sexe);
  return {
    creat_mgL: Math.round(creatMgL * 100) / 100,
    ckd_epi_2021: ckdEpi, ckd_epi_stade: dfgStade(ckdEpi),
    cockcroft_gault: cockcroft, cockcroft_stade: dfgStade(cockcroft),
  };
}

// Nombre en écriture française (virgule décimale) pour l'affichage.
function dfgNum(n) {
  return String(n).replace('.', ',');
}

// Construit le libellé « les deux techniques » écrit dans la case DFG.
function dfgTexte(r) {
  if (!r || r.erreur) return '';
  const parts = [];
  if (r.ckd_epi_2021 != null) parts.push(`CKD-EPI 2021 : ${dfgNum(r.ckd_epi_2021)} mL/min/1,73m²`);
  parts.push(r.cockcroft_gault != null
    ? `Cockcroft-Gault : ${dfgNum(r.cockcroft_gault)} mL/min`
    : 'Cockcroft-Gault : poids requis');
  return parts.join('  |  ');
}

// Lit la créat en Biochimie + âge/sexe/poids, ÉCRIT les 2 résultats dans la
// case DFG d'un objet resultats déjà enregistré (exports / impression).
function calculerDFGDepuisDossier(resultats, patient, poidsKg) {
  const bio = resultats && resultats['Biochimie'];
  if (!bio) return null;
  const c = bio['Créatinine'];
  if (!c || c.valeur === '' || c.valeur == null) return null;

  const r = calculerDFG({
    creat: c.valeur, unite: c.unite || 'mg/L',
    age: patient && patient.age, sexe: patient && patient.sexe,
    poidsKg: poidsKg != null ? poidsKg : (patient && patient.poids),
  });

  const champ = bio['Clairance créatinine (DFG)'];
  if (champ && !r.erreur) {
    champ.valeur = dfgTexte(r);
    champ.unite = '';
    champ.interp = r.ckd_epi_stade;
  }
  return r;
}

// ──────────────────────────────────────────────────────────────
// LIVE — carte de calcul du DFG dans la saisie
// Source de vérité = les champs réels : créatinine ↔ v_crea (sinon la
// case dfg_crea de la carte), âge/sexe ↔ getPatientProfile (p_age/p_sexe),
// poids ↔ p_poids. recalcDFG() reflète ces valeurs dans les cases de la
// carte (dfg_crea/dfg_age/dfg_sexe/dfg_poids, sauf celle en cours de
// frappe), calcule les deux techniques et remplit :
//   • dfg_ckd / dfg_cock  (résultat + stade lisibles à l'écran)
//   • v_dfg (caché)       (texte des deux techniques, enregistré/imprimé)
// ──────────────────────────────────────────────────────────────
function recalcDFG() {
  const hidden = document.getElementById('v_dfg');
  if (!hidden) return;                       // la carte DFG n'est pas à l'écran
  const g = id => document.getElementById(id);
  const active = document.activeElement;

  // Créatinine : le tableau rénal (v_crea) fait foi ; à défaut, la carte.
  const creaGlobal = g('v_crea');
  const creaVal = creaGlobal ? creaGlobal.value : ((g('dfg_crea') || {}).value || '');
  const profile = (typeof getPatientProfile === 'function')
    ? getPatientProfile() : { age: null, sexe: '' };
  const poidsEl = g('p_poids');
  const poidsKg = poidsEl ? parseFloat(String(poidsEl.value).replace(',', '.')) : NaN;
  const unite = (typeof getUnit === 'function') ? getUnit('crea', 'mg/L') : 'mg/L';

  // Refléter les valeurs dans la carte (jamais la case qu'on est en train de saisir).
  const mirror = (id, val) => { const el = g(id); if (el && el !== active) el.value = (val == null ? '' : val); };
  mirror('dfg_crea', creaVal);
  mirror('dfg_age', (g('p_age') || {}).value);
  const sxEl = g('dfg_sexe'); if (sxEl && sxEl !== active) sxEl.value = ((g('p_sexe') || {}).value) || '';
  mirror('dfg_poids', poidsEl ? poidsEl.value : '');

  const ckdEl = g('dfg_ckd'), cockEl = g('dfg_cock');
  const vide = () => {
    hidden.value = '';
    if (ckdEl) { ckdEl.textContent = '—'; ckdEl.style.color = 'var(--text-muted)'; }
    if (cockEl) { cockEl.textContent = '—'; cockEl.style.color = 'var(--text-muted)'; }
  };

  if (creaVal === '' || creaVal == null) { vide(); return; }
  const r = calculerDFG({
    creat: creaVal, unite, age: profile.age, sexe: profile.sexe,
    poidsKg: isFinite(poidsKg) && poidsKg > 0 ? poidsKg : null,
  });
  if (r.erreur) { vide(); return; }

  hidden.value = dfgTexte(r);
  if (ckdEl) {
    ckdEl.textContent = r.ckd_epi_2021 != null
      ? `${dfgNum(r.ckd_epi_2021)} mL/min/1,73 m² — ${r.ckd_epi_stade}` : '—';
    ckdEl.style.color = (r.ckd_epi_2021 != null && r.ckd_epi_2021 < 90) ? '#b91c1c' : 'var(--accent)';
  }
  if (cockEl) {
    cockEl.textContent = r.cockcroft_gault != null
      ? `${dfgNum(r.cockcroft_gault)} mL/min — ${r.cockcroft_stade}`
      : 'Poids requis pour cette technique';
    cockEl.style.color = (r.cockcroft_gault == null) ? 'var(--text-muted)'
      : (r.cockcroft_gault < 90 ? '#b91c1c' : 'var(--accent)');
  }
}

// Saisie depuis la carte DFG → on écrit dans le champ réel correspondant puis
// on relance le calcul (via le circuit habituel, qui rappelle recalcDFG).
function dfgFromCard(champ) {
  const g = id => document.getElementById(id);
  const val = el => (el ? String(el.value).replace(',', '.') : '');
  if (champ === 'crea') {
    const vc = g('v_crea');
    if (vc) { vc.value = val(g('dfg_crea')); if (typeof onParamInput === 'function') { onParamInput('crea'); return; } }
    recalcDFG();
  } else if (champ === 'age') {
    const pa = g('p_age'); if (pa) pa.value = (g('dfg_age') || {}).value || '';
    const pu = g('p_age_unit'); if (pu) pu.value = 'ans';
    if (typeof onAgeInput === 'function') onAgeInput(); else recalcDFG();
  } else if (champ === 'sexe') {
    const ps = g('p_sexe'); if (ps) ps.value = (g('dfg_sexe') || {}).value || '';
    if (typeof updateAllRefs === 'function') updateAllRefs();
    if (typeof updateMontantCurrent === 'function') updateMontantCurrent();
    recalcDFG();
  } else if (champ === 'poids') {
    const pp = g('p_poids'); if (pp) pp.value = val(g('dfg_poids'));
    recalcDFG();
  }
}
