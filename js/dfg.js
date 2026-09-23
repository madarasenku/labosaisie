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
// ✅ v13.198 — La carte DFG est AUTONOME : ses propres cases (dfg_crea/dfg_age/
// dfg_sexe/dfg_poids) sont la source du calcul. Auparavant la créatinine passait
// par le champ du tableau rénal (v_crea) ; or ce champ est VERROUILLÉ et VIDÉ
// quand l'examen créatinine n'est pas coché/payé, si bien que le DFG ne se
// calculait jamais (« on n'arrive pas à rentrer les données »). Désormais le
// dossier ne sert qu'à PRÉ-REMPLIR les cases vides de la carte ; le calcul lit
// toujours les cases de la carte.
function recalcDFG() {
  const hidden = document.getElementById('v_dfg');
  if (!hidden) return;                       // la carte DFG n'est pas à l'écran
  const g = id => document.getElementById(id);
  const active = document.activeElement;

  // Pré-remplissage confort : remplir une case VIDE de la carte depuis le champ
  // correspondant du dossier — sans écraser une valeur déjà saisie ni la case
  // en cours de frappe.
  const prefill = (cardId, srcId) => {
    const c = g(cardId), s = g(srcId);
    if (c && c !== active && (c.value === '' || c.value == null) && s && String(s.value) !== '') c.value = s.value;
  };
  prefill('dfg_crea', 'v_crea');
  prefill('dfg_age', 'p_age');
  const sxEl = g('dfg_sexe');
  if (sxEl && sxEl !== active && !sxEl.value) { const ps = g('p_sexe'); if (ps && ps.value) sxEl.value = ps.value; }
  prefill('dfg_poids', 'p_poids');

  // Source du calcul = les cases de la carte (repli sur le dossier si vide).
  const cardVal = (id, alt) => {
    const el = g(id); if (el && String(el.value).trim() !== '') return el.value;
    const a = g(alt); return a ? a.value : '';
  };
  const creaVal = cardVal('dfg_crea', 'v_crea');
  const ageVal  = cardVal('dfg_age', 'p_age');
  const ageAns  = ageVal !== '' ? parseFloat(String(ageVal).replace(',', '.'))
    : (typeof getPatientProfile === 'function' ? getPatientProfile().age : null);
  const sexeVal = (g('dfg_sexe') && g('dfg_sexe').value) ? g('dfg_sexe').value
    : (typeof getPatientProfile === 'function' ? getPatientProfile().sexe : '');
  const poidsVal = cardVal('dfg_poids', 'p_poids');
  const poidsKg = parseFloat(String(poidsVal).replace(',', '.'));
  const unite = (typeof getUnit === 'function') ? getUnit('crea', 'mg/L') : 'mg/L';

  const ckdEl = g('dfg_ckd'), cockEl = g('dfg_cock');
  const cgHidden = g('v_dfgcg');
  const iCkd = g('i_dfg'), iCg = g('i_dfgcg');
  // Chaque technique a sa PROPRE case stockée (v_dfg = CKD-EPI, v_dfgcg =
  // Cockcroft) et sa propre interprétation (≥ 90 = normal), car les deux
  // n'ont ni la même unité ni la même valeur normale.
  const interpDFG = v => (v == null ? '' : (typeof interprete === 'function' ? interprete(v, 90, 999) : ''));
  const vide = () => {
    hidden.value = ''; if (cgHidden) cgHidden.value = '';
    if (iCkd) iCkd.textContent = ''; if (iCg) iCg.textContent = '';
    if (ckdEl) { ckdEl.textContent = '—'; ckdEl.style.color = 'var(--text-muted)'; }
    if (cockEl) { cockEl.textContent = '—'; cockEl.style.color = 'var(--text-muted)'; }
  };

  if (creaVal === '' || creaVal == null) { vide(); return; }
  const r = calculerDFG({
    creat: creaVal, unite, age: (ageAns == null || isNaN(ageAns) ? null : ageAns), sexe: sexeVal,
    poidsKg: isFinite(poidsKg) && poidsKg > 0 ? poidsKg : null,
  });
  if (r.erreur) { vide(); return; }

  // Valeurs stockées (une par technique) + interprétations.
  hidden.value = r.ckd_epi_2021 != null ? dfgNum(r.ckd_epi_2021) : '';
  if (cgHidden) cgHidden.value = r.cockcroft_gault != null ? dfgNum(r.cockcroft_gault) : '';
  if (iCkd) iCkd.textContent = interpDFG(r.ckd_epi_2021);
  if (iCg) iCg.textContent = interpDFG(r.cockcroft_gault);

  if (ckdEl) {
    ckdEl.textContent = r.ckd_epi_2021 != null
      ? `${dfgNum(r.ckd_epi_2021)} mL/min/1,73 m² — ${r.ckd_epi_stade}`
      : 'Âge et sexe requis pour cette technique';
    ckdEl.style.color = (r.ckd_epi_2021 == null) ? 'var(--text-muted)'
      : (r.ckd_epi_2021 < 90 ? '#b91c1c' : 'var(--accent)');
  }
  if (cockEl) {
    cockEl.textContent = r.cockcroft_gault != null
      ? `${dfgNum(r.cockcroft_gault)} mL/min — ${r.cockcroft_stade}`
      : 'Âge et poids requis pour cette technique';
    cockEl.style.color = (r.cockcroft_gault == null) ? 'var(--text-muted)'
      : (r.cockcroft_gault < 90 ? '#b91c1c' : 'var(--accent)');
  }
}

// Saisie depuis la carte DFG. La carte est autonome : on recalcule directement.
// On répercute AUSSI vers les champs du dossier quand ils existent ET sont
// éditables (pour garder la cohérence), mais on ne DÉPEND jamais d'eux — un champ
// verrouillé (examen non coché) n'empêche donc plus la saisie du DFG.
function dfgFromCard(champ) {
  const g = id => document.getElementById(id);
  const editable = el => el && !el.disabled && !el.readOnly;
  const cardv = id => { const el = g(id); return el ? String(el.value).replace(',', '.') : ''; };
  if (champ === 'crea') {
    const vc = g('v_crea');
    if (editable(vc)) { vc.value = cardv('dfg_crea'); if (typeof onParamInput === 'function') { try { onParamInput('crea'); } catch (e) {} } }
  } else if (champ === 'age') {
    const pa = g('p_age');
    if (editable(pa)) {
      pa.value = (g('dfg_age') || {}).value || '';
      const pu = g('p_age_unit'); if (pu) pu.value = 'ans';
      if (typeof onAgeInput === 'function') { try { onAgeInput(); } catch (e) {} }
    }
  } else if (champ === 'sexe') {
    const ps = g('p_sexe');
    if (editable(ps)) {
      ps.value = (g('dfg_sexe') || {}).value || '';
      if (typeof updateAllRefs === 'function') { try { updateAllRefs(); } catch (e) {} }
      if (typeof updateMontantCurrent === 'function') { try { updateMontantCurrent(); } catch (e) {} }
    }
  } else if (champ === 'poids') {
    const pp = g('p_poids'); if (pp) pp.value = cardv('dfg_poids');   // caché, jamais verrouillé
  }
  recalcDFG();
}
