/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — saisie.js
   Extrait de index.html (v13.70). Chargé en script classique, PAS en
   module ES : les gestionnaires inline du HTML (onclick="…") résolvent
   les fonctions dans la portée globale. L'ordre des balises <script>
   dans index.html doit être conservé.
   ═══════════════════════════════════════════════════════════════ */

const CATALOGUE_EXAMENS = [
  // ── Hématologie ──
  { id:'ex_nfs',   label:'NFS — Numération Formule Sanguine', groupe:'🩸 Hématologie', tab:'hema', prix:3000, section:'sec-nfs' },
  { id:'ex_ephb',  label:"Électrophorèse de l'hémoglobine",  groupe:'🩸 Hématologie', tab:'hema', prix:6000, section:'sec-ephb' },
  { id:'ex_vs',    label:'VS — Vitesse de sédimentation',     groupe:'🩸 Hématologie', tab:'hema', prix:0, section:'sec-nfs' },
  // ── Parasitologie ──
  { id:'ex_ge',    label:'Goutte épaisse / TDR Paludisme',    groupe:'🦟 Parasitologie', tab:'hema', prix:0, section:'sec-ge' },
  { id:'ex_eps',   label:'EPS — Examen parasitologique des selles', groupe:'🦟 Parasitologie', tab:'parasito', prix:3000, section:'sec-eps-title' },
  // ── Groupe sanguin ──
  { id:'ex_gs',    label:'Groupe sanguin ABO / Rhésus',       groupe:'🩸 Groupe sanguin', tab:'gs', prix:2000, section:'sec-gs-standalone' },
  { id:'ex_rai',   label:'RAI + Phénotypage érythrocytaire',  groupe:'🩸 Groupe sanguin', tab:'gs', prix:5000, section:'sec-gs-standalone' },
  // ── Bilan prénatal ──
  { id:'ex_bpn',   label:'Bilan prénatal complet (forfait)',  groupe:'🤰 Bilan prénatal', tab:'hema', prix:20000 },
  // ── Immuno-Sérologie ──
  { id:'ex_crp',   label:'CRP — Protéine C-réactive',        groupe:'💉 Immuno-Sérologie', tab:'sero', prix:3500, section:'sec-crp' },
  { id:'ex_widal', label:'Widal & Félix (SWF)',               groupe:'💉 Immuno-Sérologie', tab:'sero', prix:4500, section:'sec-widal' },
  { id:'ex_vih',   label:'Sérologie VIH 1 & 2',              groupe:'💉 Immuno-Sérologie', tab:'sero', prix:2000, section:'sec-sero' },
  { id:'ex_hbs',   label:'Ag HBs (Hépatite B)',              groupe:'💉 Immuno-Sérologie', tab:'sero', prix:7000, section:'sec-sero' },
  { id:'ex_hcv',   label:'Ac anti-VHC (Hépatite C)',         groupe:'💉 Immuno-Sérologie', tab:'sero', prix:7000, section:'sec-sero' },
  { id:'ex_tpha',  label:'TPHA / VDRL (Syphilis)',           groupe:'💉 Immuno-Sérologie', tab:'sero', prix:7000, section:'sec-sero' },
  { id:'ex_toxo',  label:'Toxoplasmose IgG / IgM',           groupe:'💉 Immuno-Sérologie', tab:'sero', prix:7000, section:'sec-sero' },
  { id:'ex_rube',  label:'Rubéole IgG / IgM',                groupe:'💉 Immuno-Sérologie', tab:'sero', prix:7000, section:'sec-sero' },
  { id:'ex_aso',   label:'ASLO (Antistreptolysines)',         groupe:'💉 Immuno-Sérologie', tab:'sero', prix:3000, section:'sec-sero' },
  { id:'ex_latex', label:'Latex (Waaler-Rose)',               groupe:'💉 Immuno-Sérologie', tab:'sero', prix:2500, section:'sec-sero' },
  { id:'ex_tsh',   label:'TSH',                              groupe:'💉 Immuno-Sérologie', tab:'sero', prix:5000, section:'sec-sero' },
  { id:'ex_ft4',   label:'T4 libre (FT4)',                   groupe:'💉 Immuno-Sérologie', tab:'sero', prix:5000, section:'sec-sero' },
  { id:'ex_psa',   label:'PSA total',                        groupe:'💉 Immuno-Sérologie', tab:'sero', prix:5000, section:'sec-sero' },
  // ── Biochimie ──
  { id:'ex_gly',   label:'Glycémie à jeun',                  groupe:'🧪 Biochimie', tab:'bio', prix:2000, section:'sec-bio-glucides-wrap' },
  { id:'ex_hba1c', label:'HbA1c',                             groupe:'🧪 Biochimie', tab:'bio', prix:15000, section:'sec-bio-glucides-wrap' },
  { id:'ex_uree',  label:'Urée',                              groupe:'🧪 Biochimie', tab:'bio', prix:2000, section:'sec-bio-rein-wrap' },
  { id:'ex_crea',  label:'Créatinine',                        groupe:'🧪 Biochimie', tab:'bio', prix:2000, section:'sec-bio-rein-wrap' },
  { id:'ex_ua',    label:'Acide urique',                      groupe:'🧪 Biochimie', tab:'bio', prix:3500, section:'sec-bio-rein-wrap' },
  { id:'ex_malb',  label:'Microalbuminurie',                  groupe:'🧪 Biochimie', tab:'bio', prix:3000, section:'sec-bio-rein-wrap' },
  { id:'ex_dfg',   label:'Clairance créatinine (DFG)',        groupe:'🧪 Biochimie', tab:'bio', prix:2000, section:'sec-bio-rein-wrap' },
  { id:'ex_asat',  label:'ASAT / ALAT (Transaminases)',       groupe:'🧪 Biochimie', tab:'bio', prix:5000, section:'sec-bio-foie-wrap' },
  { id:'ex_ggt',   label:'Gamma GT',                          groupe:'🧪 Biochimie', tab:'bio', prix:10000, section:'sec-bio-foie-wrap' },
  { id:'ex_pal',   label:'Phosphatases alcalines',            groupe:'🧪 Biochimie', tab:'bio', prix:10000, section:'sec-bio-foie-wrap' },
  { id:'ex_bili',  label:'Bilirubine totale & directe',       groupe:'🧪 Biochimie', tab:'bio', prix:6000, section:'sec-bio-foie-wrap' },
  { id:'ex_prot',  label:'Protéines totales / Albumine',      groupe:'🧪 Biochimie', tab:'bio', prix:0, section:'sec-bio-foie-wrap' },
  { id:'ex_ldh',   label:'LDH',                              groupe:'🧪 Biochimie', tab:'bio', prix:3000, section:'sec-bio-foie-wrap' },
  { id:'ex_amy',   label:'Amylase',                           groupe:'🧪 Biochimie', tab:'bio', prix:3000, section:'sec-bio-foie-wrap' },
  { id:'ex_lip',   label:'Lipase',                            groupe:'🧪 Biochimie', tab:'bio', prix:3000, section:'sec-bio-foie-wrap' },
  { id:'ex_chol',  label:'Cholestérol total',                 groupe:'🧪 Biochimie', tab:'bio', prix:3500, section:'sec-bio-lipides-wrap' },
  { id:'ex_trig',  label:'Triglycérides',                     groupe:'🧪 Biochimie', tab:'bio', prix:3500, section:'sec-bio-lipides-wrap' },
  { id:'ex_hdl',   label:'HDL-cholestérol',                   groupe:'🧪 Biochimie', tab:'bio', prix:3500, section:'sec-bio-lipides-wrap' },
  { id:'ex_apoa',  label:'Apolipoprotéine A1',                groupe:'🧪 Biochimie', tab:'bio', prix:5000, section:'sec-bio-lipides-wrap' },
  { id:'ex_apob',  label:'Apolipoprotéine B',                 groupe:'🧪 Biochimie', tab:'bio', prix:5000, section:'sec-bio-lipides-wrap' },
  { id:'ex_lpa',   label:'Lipoprotéine (a)',                  groupe:'🧪 Biochimie', tab:'bio', prix:5000, section:'sec-bio-lipides-wrap' },
  { id:'ex_iono',  label:'Ionogramme (Na, K, Cl)',            groupe:'🧪 Biochimie', tab:'bio', prix:6000, section:'sec-bio-iono-wrap' },
  { id:'ex_ca',    label:'Calcium / Phosphore',               groupe:'🧪 Biochimie', tab:'bio', prix:6000, section:'sec-bio-iono-wrap' },
  { id:'ex_mg',    label:'Magnésium',                         groupe:'🧪 Biochimie', tab:'bio', prix:2500, section:'sec-bio-iono-wrap' },
  { id:'ex_bic',   label:'Bicarbonates',                      groupe:'🧪 Biochimie', tab:'bio', prix:2000, section:'sec-bio-iono-wrap' },
  { id:'ex_zinc',  label:'Zinc',                              groupe:'🧪 Biochimie', tab:'bio', prix:4000, section:'sec-bio-iono-wrap' },
  { id:'ex_cuiv',  label:'Cuivre',                            groupe:'🧪 Biochimie', tab:'bio', prix:4000, section:'sec-bio-iono-wrap' },
  { id:'ex_fer',   label:'Fer sérique',                       groupe:'🧪 Biochimie', tab:'bio', prix:3000, section:'sec-bio-fer-wrap' },
  { id:'ex_ferr',  label:'Ferritine',                         groupe:'🧪 Biochimie', tab:'bio', prix:5000, section:'sec-bio-fer-wrap' },
  { id:'ex_ddim',  label:'D-Dimères',                         groupe:'🧪 Biochimie', tab:'bio', prix:8000, section:'sec-bio-fer-wrap' },
  { id:'ex_tp',    label:'TP / INR',                          groupe:'🧪 Biochimie', tab:'bio', prix:3000, section:'sec-bio-fer-wrap' },
  { id:'ex_tca',   label:'TCA',                               groupe:'🧪 Biochimie', tab:'bio', prix:3000, section:'sec-bio-fer-wrap' },
  { id:'ex_fibr',  label:'Fibrinogène',                       groupe:'🧪 Biochimie', tab:'bio', prix:4000, section:'sec-bio-fer-wrap' },
  { id:'ex_trop',  label:'Troponine I/T',                     groupe:'🧪 Biochimie', tab:'bio', prix:10000, section:'sec-bio-card-wrap' },
  { id:'ex_bnp',   label:'BNP / NT-proBNP',                  groupe:'🧪 Biochimie', tab:'bio', prix:10000, section:'sec-bio-card-wrap' },
  { id:'ex_ck',    label:'CK (Créatine kinase)',              groupe:'🧪 Biochimie', tab:'bio', prix:4000, section:'sec-bio-card-wrap' },
  { id:'ex_ckmb',  label:'CK-MB',                            groupe:'🧪 Biochimie', tab:'bio', prix:5000, section:'sec-bio-card-wrap' },
  { id:'ex_myog',  label:'Myoglobine',                        groupe:'🧪 Biochimie', tab:'bio', prix:5000, section:'sec-bio-card-wrap' },
  { id:'ex_cort',  label:'Cortisol',                          groupe:'🧪 Biochimie', tab:'bio', prix:8000, section:'sec-bio-horm-wrap' },
  { id:'ex_acth',  label:'ACTH',                              groupe:'🧪 Biochimie', tab:'bio', prix:8000, section:'sec-bio-horm-wrap' },
  { id:'ex_lh',    label:'LH',                                groupe:'🧪 Biochimie', tab:'bio', prix:6000, section:'sec-bio-horm-wrap' },
  { id:'ex_fsh',   label:'FSH',                               groupe:'🧪 Biochimie', tab:'bio', prix:6000, section:'sec-bio-horm-wrap' },
  { id:'ex_e2',    label:'Estradiol (E2)',                    groupe:'🧪 Biochimie', tab:'bio', prix:7000, section:'sec-bio-horm-wrap' },
  { id:'ex_prog',  label:'Progestérone',                      groupe:'🧪 Biochimie', tab:'bio', prix:7000, section:'sec-bio-horm-wrap' },
  { id:'ex_test',  label:'Testostérone',                      groupe:'🧪 Biochimie', tab:'bio', prix:7000, section:'sec-bio-horm-wrap' },
  { id:'ex_prl',   label:'Prolactine',                        groupe:'🧪 Biochimie', tab:'bio', prix:6000, section:'sec-bio-horm-wrap' },
  { id:'ex_amh',   label:'AMH',                               groupe:'🧪 Biochimie', tab:'bio', prix:15000, section:'sec-bio-horm-wrap' },
  { id:'ex_vitd',  label:'Vitamine D (25-OH)',                groupe:'🧪 Biochimie', tab:'bio', prix:10000, section:'sec-bio-horm-wrap' },
  { id:'ex_b12',   label:'Vitamine B12',                      groupe:'🧪 Biochimie', tab:'bio', prix:6000, section:'sec-bio-horm-wrap' },
  { id:'ex_fol',   label:'Folates (B9)',                      groupe:'🧪 Biochimie', tab:'bio', prix:6000, section:'sec-bio-horm-wrap' },
  { id:'ex_pth',   label:'PTH (parathormone)',                groupe:'🧪 Biochimie', tab:'bio', prix:10000, section:'sec-bio-horm-wrap' },
  { id:'ex_pct',   label:'Procalcitonine (PCT)',              groupe:'🧪 Biochimie', tab:'bio', prix:8000, section:'sec-bio-autre-wrap' },
  { id:'ex_hcrp',  label:'CRP ultra-sensible (hs-CRP)',       groupe:'🧪 Biochimie', tab:'bio', prix:5000, section:'sec-bio-autre-wrap' },
  { id:'ex_osm',   label:'Osmolarité',                        groupe:'🧪 Biochimie', tab:'bio', prix:3000, section:'sec-bio-autre-wrap' },
  { id:'ex_hcy',   label:'Homocystéine',                      groupe:'🧪 Biochimie', tab:'bio', prix:6000, section:'sec-bio-autre-wrap' },
  { id:'ex_amm',   label:'Ammoniaque',                        groupe:'🧪 Biochimie', tab:'bio', prix:4000, section:'sec-bio-autre-wrap' },
  { id:'ex_lact',  label:'Acide lactique',                    groupe:'🧪 Biochimie', tab:'bio', prix:4000, section:'sec-bio-autre-wrap' },
  { id:'ex_bhcg',  label:'Beta-HCG',                         groupe:'🧪 Biochimie', tab:'bio', prix:5000, section:'sec-bio-autre-wrap' },
  // ── Bactériologie ──
  { id:'ex_ecbu',  label:'ECBU',                              groupe:'🦠 Bactériologie', tab:'bacterio', prix:10000 },
  { id:'ex_hemo',  label:'Hémoculture',                       groupe:'🦠 Bactériologie', tab:'bacterio', prix:15000 },
  { id:'ex_copro', label:'Coproculture',                      groupe:'🦠 Bactériologie', tab:'bacterio', prix:10000 },
  { id:'ex_pg',    label:'Prélèvement de gorge',              groupe:'🦠 Bactériologie', tab:'bacterio', prix:0 },
  { id:'ex_pus',   label:'Prélèvement de pus / plaie',        groupe:'🦠 Bactériologie', tab:'bacterio', prix:0 },
];

// ✅ v12.4 — Paramètres attendus par examen coché (affichage "à compléter" sur la fiche)
// Retourne [{key, name, unit, ref}] ; key = clé réelle dans l'objet resultats.
function examExpectedRows(examId) {
  const K = (arr) => arr.map(p => ({ key:p.name, name:p.name, unit:p.unit||'', ref:p.ref||p.refM||'' }));
  const M = {
    ex_nfs:   () => K([...HEMA_PARAMS.filter(p=>!['vs','ret'].includes(p.id)), ...HEMA_FL]),
    ex_vs:    () => K(HEMA_PARAMS.filter(p=>p.id==='vs')),
    ex_ephb:  () => EPHB_FRACTIONS.map(p=>({key:p.name,name:p.name,unit:'%',ref:p.ref||''})),
    ex_gly:   () => K(BIO_GLUCIDES.filter(p=>p.id==='gly')),
    ex_hba1c: () => K(BIO_GLUCIDES.filter(p=>p.id==='hba')),
    ex_uree:  () => K(BIO_REIN.filter(p=>p.id==='uree')),
    ex_crea:  () => K(BIO_REIN.filter(p=>p.id==='crea')),
    ex_ua:    () => K(BIO_REIN.filter(p=>p.id==='ua')),
    ex_asat:  () => K(BIO_FOIE.filter(p=>['asat','alat'].includes(p.id))),
    ex_ggt:   () => K(BIO_FOIE.filter(p=>p.id==='ggt')),
    ex_pal:   () => K(BIO_FOIE.filter(p=>p.id==='pal')),
    ex_bili:  () => K(BIO_FOIE.filter(p=>['bili','bilid'].includes(p.id))),
    ex_prot:  () => K(BIO_FOIE.filter(p=>['prot','alb'].includes(p.id))),
    ex_chol:  () => K(BIO_LIPIDES.filter(p=>p.id==='chol')),
    ex_trig:  () => K(BIO_LIPIDES.filter(p=>p.id==='trig')),
    ex_hdl:   () => K(BIO_LIPIDES.filter(p=>['hdl','ldl'].includes(p.id))),
    ex_iono:  () => K(BIO_IONO.filter(p=>['na','k','cl'].includes(p.id))),
    ex_ca:    () => K(BIO_IONO.filter(p=>['ca','phos'].includes(p.id))),
    ex_ge:    () => [{key:'GE - Résultat',name:'Résultat GE',unit:'',ref:''},{key:'GE - Espèce',name:'Espèce plasmodiale',unit:'',ref:''},{key:'GE - Densité parasitaire (/µL)',name:'Densité parasitaire',unit:'/µL',ref:''}],
    ex_gs:    () => [{key:'GS - ABO',name:'Groupe ABO',unit:'',ref:''},{key:'GS - Rhésus',name:'Rhésus',unit:'',ref:''}],
    ex_rai:   () => [{key:'GS - RAI',name:'RAI',unit:'',ref:''},{key:'GS - Phénotype',name:'Phénotype érythrocytaire',unit:'',ref:''}],
    ex_crp:   () => [{key:'CRP - Valeur',name:'CRP — Protéine C-réactive',unit:'mg/L',ref:'< 6'}],
    ex_widal: () => WIDAL_ANTIGENES.map(ag=>({key:'Widal - '+ag.name,name:ag.name,unit:'',ref:'< 1/80'})),
    ex_vih:   () => [{key:'VIH 1 & 2',name:'Sérologie VIH 1 & 2',unit:'',ref:'Négatif'}],
    ex_hbs:   () => [{key:'Ag HBs',name:'Ag HBs (Hépatite B)',unit:'',ref:'Négatif'}],
    ex_hcv:   () => [{key:'Ac anti-VHC',name:'Ac anti-VHC (Hépatite C)',unit:'',ref:'Négatif'}],
    ex_tpha:  () => [{key:'TPHA / VDRL (Syphilis)',name:'TPHA / VDRL (Syphilis)',unit:'',ref:'Négatif'}],
    ex_toxo:  () => [{key:'Toxoplasmose IgG',name:'Toxoplasmose IgG',unit:'UI/mL',ref:''},{key:'Toxoplasmose IgM',name:'Toxoplasmose IgM',unit:'',ref:''}],
    ex_rube:  () => [{key:'Rubéole IgG',name:'Rubéole IgG / IgM',unit:'UI/mL',ref:''}],
    ex_ecbu:  () => [{key:'Germe identifié',name:'ECBU — Germe / Leucocytes / Culture',unit:'',ref:''}],
    ex_hemo:  () => [{key:'Germe identifié',name:'Hémoculture — Germe',unit:'',ref:''}],
    ex_copro: () => [{key:'Germe identifié',name:'Coproculture — Germe',unit:'',ref:''}],
    ex_eps:   () => [{key:'EPS','name':'EPS — Examen parasitologique des selles',unit:'',ref:''}],
  };
  if (M[examId]) return M[examId]();
  // ✅ v13.27 — Fallback automatique pour les examens bio simples (1 examen = 1 paramètre)
  // Mapping ex_<id> → paramètre <id> dans les catalogues biochimie
  const bioAll = [...(typeof BIO_GLUCIDES!=='undefined'?BIO_GLUCIDES:[]),
                  ...(typeof BIO_REIN!=='undefined'?BIO_REIN:[]),
                  ...(typeof BIO_FOIE!=='undefined'?BIO_FOIE:[]),
                  ...(typeof BIO_LIPIDES!=='undefined'?BIO_LIPIDES:[]),
                  ...(typeof BIO_IONO!=='undefined'?BIO_IONO:[]),
                  ...(typeof BIO_FER!=='undefined'?BIO_FER:[]),
                  ...(typeof BIO_CARD!=='undefined'?BIO_CARD:[]),
                  ...(typeof BIO_HORM!=='undefined'?BIO_HORM:[]),
                  ...(typeof BIO_COAG!=='undefined'?BIO_COAG:[]),
                  ...(typeof BIO_AUTRE!=='undefined'?BIO_AUTRE:[])];
  const pid = examId.replace(/^ex_/, '');
  const found = bioAll.filter(p => p.id === pid);
  if (found.length) return K(found);
  return [];
}

function isValFilled(v) {
  if (v == null) return false;
  if (typeof v === 'object') return !!(v.valeur || v.resultat || v.titre);
  const s = String(v).trim();
  return s !== '' && s !== '—';
}

// Construit les lignes « à compléter » pour une liste d'examens cochés,
// à partir du sous-objet de résultats d'un type donné.
function collectPendingForType(res, coches) {
  const cat = getCatalogueComplet();
  const out = [];
  // ✅ v13.35 fix — robustesse : coches doit être un tableau
  let list = coches || [];
  if (!Array.isArray(list)) list = Object.values(list).flat();
  list.forEach(label => {
    const ex = cat.find(e => e.label === label);
    const rows = ex ? examExpectedRows(ex.id) : [];
    if (rows.length) {
      if (!rows.some(r => isValFilled(res[r.key]))) out.push({ label, rows });
    } else {
      out.push({ label, rows: [{ key: null, name: label, unit: '', ref: '' }] });
    }
  });
  return out;
}

// Examens cochés (demandés) qui doivent apparaître sur la fiche même vides.
// ✅ v13.6 — gère le cas composite (impression d'un dossier multi-analyses),
// et affiche TOUT examen coché, même sans correspondance de paramètres.
// ✅ v13.9 — Rapport Widal partagé (Excel + PDF + impression), pour un rendu
// IDENTIQUE partout. Règle : on affiche la section Widal si elle a été
// réellement réalisée (au moins un antigène significatif, OU une conclusion,
// OU l'examen Widal coché). Quand on l'affiche, on liste TOUS les antigènes
// renseignés — y compris les négatifs, affichés « Négatif » (plus de case vide).
function widalReport(res) {
  const rows = WIDAL_ANTIGENES
    .filter(ag => { const w = res['Widal - ' + ag.name]; return w && w.titre && w.titre !== 'Non réalisé'; }) // ✅ v13.23
    .map(ag => { const w = res['Widal - ' + ag.name];
      return { name: ag.name, titre: w.titre, cinetique: w.cinetique || '', interp: w.interp || '', seuil: ag.seuil }; });
  let concl = (res['Widal - Conclusion'] || '').trim();
  if (concl === '—') concl = '';
  const anySignif = rows.some(r => r.titre && r.titre !== 'Négatif');
  const coches = Array.isArray(res._examens_coches) ? res._examens_coches
               : (res._examens_coches ? [].concat(...Object.values(res._examens_coches)) : []);
  const checked = coches.some(l => /widal/i.test(l));
  return { show: anySignif || !!concl || checked, rows, concl };
}

// ✅ v13.13 — VERROUILLAGE DES CHAMPS NON COCHÉS
// Un résultat n'est saisissable que si son examen est coché (donc facturé)
// sur la fiche. Les champs des examens non cochés sont désactivés + 🔒.
// Correspondance examen → champs de saisie (uniquement les champs sûrs ;
// tout examen non listé laisse ses champs éditables, jamais de verrou erroné).
function examFieldIds(examId) {
  const V = ids => ids.map(i => 'v_' + i);
  const S = ids => ids.flatMap(i => ['sr_' + i + '_r', 'sv_' + i]);
  const M = {
    // ── Hématologie ───────────────────────────────────────────
    ex_nfs:   () => V(['gbc','gr','hb','ht','vgm','tcmh','ccmh','plt']
                    .concat((typeof HEMA_FL!=='undefined'?HEMA_FL:[]).map(p=>p.id))),
    ex_ephb:  () => V(['ephb_a','ephb_a2','ephb_f','ephb_s','ephb_c','ephb_d','ephb_e'])
                    .concat(['ephb_profil','ephb_commentaire']),
    ex_vs:    () => ['v_vs'],
    ex_crp:   () => ['crp_valeur'],                          // CRP Sérologie (latex)
    ex_widal: () => (typeof WIDAL_ANTIGENES!=='undefined'
                     ? WIDAL_ANTIGENES.flatMap(ag => ['widal_'+ag.id,'widal_cin_'+ag.id])
                     : []),
    ex_ge:    () => ['ge_result','ge_tdr','ge_espece','ge_para',
                     'ge_densite','ge_stade','ge_obs'],
    // ── Biochimie ─────────────────────────────────────────────
    ex_gly:   () => ['v_gly'],
    ex_hba1c: () => ['v_hba'],
    ex_uree:  () => ['v_uree'],
    ex_crea:  () => ['v_crea'],
    ex_ua:    () => ['v_ua'],
    ex_asat:  () => ['v_asat','v_alat'],
    ex_ggt:   () => ['v_ggt'],
    ex_pal:   () => ['v_pal'],
    ex_bili:  () => ['v_bili','v_bilid'],
    ex_prot:  () => ['v_prot','v_alb'],
    ex_chol:  () => ['v_chol'],
    ex_trig:  () => ['v_trig'],
    ex_hdl:   () => ['v_hdl','v_ldl'],
    ex_iono:  () => ['v_na','v_k','v_cl'],
    ex_ca:    () => ['v_ca','v_phos'],
    ex_mg:    () => ['v_mg'],
    ex_bic:   () => ['v_bic'],
    ex_zinc:  () => ['v_zinc'],
    ex_cuiv:  () => ['v_cuiv'],
    ex_malb:  () => ['v_malb'],
    ex_dfg:   () => ['v_dfg'],
    ex_ldh:   () => ['v_ldh'],
    ex_amy:   () => ['v_amy'],
    ex_lip:   () => ['v_lip'],
    ex_apoa:  () => ['v_apoa'],
    ex_apob:  () => ['v_apob'],
    ex_lpa:   () => ['v_lpa'],
    ex_fer:   () => ['v_fer'],
    ex_ferr:  () => ['v_ferr'],
    ex_ddim:  () => ['v_ddim'],
    ex_tp:    () => ['v_tp'],
    ex_tca:   () => ['v_tca'],
    ex_fibr:  () => ['v_fibr'],
    ex_trop:  () => ['v_trop'],
    ex_bnp:   () => ['v_bnp'],
    ex_ck:    () => ['v_ck'],
    ex_ckmb:  () => ['v_ckmb'],
    ex_myog:  () => ['v_myog'],
    ex_cort:  () => ['v_cort'],
    ex_acth:  () => ['v_acth'],
    ex_lh:    () => ['v_lh'],
    ex_fsh:   () => ['v_fsh'],
    ex_e2:    () => ['v_e2'],
    ex_prog:  () => ['v_prog'],
    ex_test:  () => ['v_test'],
    ex_prl:   () => ['v_prl'],
    ex_amh:   () => ['v_amh'],
    ex_vitd:  () => ['v_vitd'],
    ex_b12:   () => ['v_b12'],
    ex_fol:   () => ['v_fol'],
    ex_pth:   () => ['v_pth'],
    ex_pct:   () => ['v_pct'],
    ex_hcrp:  () => ['v_hcrp'],
    ex_osm:   () => ['v_osm'],
    ex_hcy:   () => ['v_hcy'],
    ex_amm:   () => ['v_amm'],
    ex_lact:  () => ['v_lact'],
    ex_bhcg:  () => ['v_bhcg'],
    // ── Sérologie ─────────────────────────────────────────────
    ex_vih:   () => S(['vih1']),
    ex_hbs:   () => S(['hbsag','hbcac','hbsac']),
    ex_hcv:   () => S(['hcv']),
    ex_tpha:  () => S(['syphil']),
    ex_toxo:  () => S(['toxo','toxoig']),
    ex_rube:  () => S(['rubig']),
    ex_aso:   () => S(['aso']),
    ex_latex: () => S(['latex']),
    ex_tsh:   () => S(['tsh']),
    ex_ft4:   () => S(['ft4']),
    ex_psa:   () => S(['psa']),
    ex_rai:   () => S(['rai']),
    // ── Groupe sanguin (panel GS) ──────────────────────────────
    ex_gs:    () => ['gs_abo','gs_rh','gs_obs'],
    // ── Groupe sanguin mini (sur Hémato) ──────────────────────
    // Ces champs sont en lecture seule / contexte — pas de verrou
    // ── Parasitologie ─────────────────────────────────────────
    ex_eps:   () => ['para_resultat','para_tdr','para_espece','para_densite',
                     'para_stade','para_type','para_coloration','para_indice',
                     'para_parasitemie','para_obs'],
    // ── Bactériologie ─────────────────────────────────────────
    // panel-bacterio entier verrouillé en bloc via applyExamLocks
    ex_ecbu:  () => [],   // géré par le bloc bacterio
    ex_hemo:  () => [],
    ex_copro: () => [],
    ex_pg:    () => [],
    ex_pus:   () => [],
  };
  return M[examId] ? M[examId]() : [];
}

function setFieldLocked(el, locked, keepValue) {
  if (!el) return;
  const wasUnlocked = !el.disabled;
  el.disabled = !!locked;
  el.classList.toggle('field-locked', !!locked);
  if (locked) {
    // ✅ v13.16 — Examen décoché : on EFFACE la valeur. Un résultat non coché
    // (donc non payé) ne doit être ni enregistré, ni imprimé, ni facturé.
    // ✅ v13.36 — keepValue=true (verrou « paiement requis ») : on VERROUILLE
    // sans effacer, pour ne pas perdre d'éventuelles valeurs déjà à l'écran.
    if (!keepValue && wasUnlocked && el.value !== undefined && el.value !== '') {
      el.value = '';
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      el.classList.remove('val-hi', 'val-lo');
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch(e) {}
      try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch(e) {}
    }
    if (el.dataset.phSaved === undefined) el.dataset.phSaved = el.getAttribute('placeholder') || '';
    if (el.tagName === 'INPUT' && el.type !== 'checkbox') el.setAttribute('placeholder', keepValue ? '🔒 Paiement requis' : '🔒');
    el.title = keepValue
      ? 'Paiement requis avant la saisie des résultats'
      : 'Examen non coché — cochez-le sur la fiche d’examens pour pouvoir saisir';
  } else {
    if (el.dataset.phSaved !== undefined) { el.setAttribute('placeholder', el.dataset.phSaved); delete el.dataset.phSaved; }
    if (el.title && (el.title.indexOf('Examen non coché') === 0 || el.title.indexOf('Paiement requis') === 0)) el.title = '';
  }
}

function unlockAllFields() {
  document.querySelectorAll('.field-locked').forEach(el => setFieldLocked(el, false));
}

let _locksDisabled = false; // ✅ v13.14 — désactive les verrous (ex. ancien dossier sans info de paiement)
let _applyingLocks = false; // ✅ v13.16 — garde anti-réentrance (l'effacement déclenche des events)

function applyExamLocks() {
  if (_applyingLocks) return;

  // ✅ v13.34 — Mode modification accueil (_editingFicheId) :
  // tout débloquer et afficher toutes les sections de résultats
  if (typeof _editingFicheId !== 'undefined' && _editingFicheId) {
    unlockAllFields();
    getCatalogueComplet().forEach(ex => {
      if (ex.section) {
        const sec = document.getElementById(ex.section);
        if (sec) sec.style.display = '';
      }
    });
    return;
  }

  if (_locksDisabled) { unlockAllFields(); return; }
  _applyingLocks = true;
  try {
    let cat;
    try { cat = getCatalogueComplet(); } catch(e) { return; }
    // ✅ v13.36 — Verrou « paiement » : en édition des résultats d'un dossier
    // NON payé, les champs des examens cochés restent verrouillés (on ne peut
    // saisir un résultat qu'une fois l'examen encaissé). On verrouille sans
    // effacer (keepValue) pour ne rien perdre à l'écran.
    const enSaisieNonPaye = !!_editingRecordId
      && typeof isDossierPaye === 'function' && !isDossierPaye(_editingRecordId);
    const checked = {};
    cat.forEach(ex => { checked[ex.id] = !!document.getElementById(ex.id)?.checked; });
    cat.forEach(ex => {
      // ✅ v13.34 — NE PAS masquer row_ex_* : ce sont les CASES À COCHER
      // de la fiche d'accueil, pas les lignes de résultats.
      // On verrouille uniquement les CHAMPS de saisie des résultats
      // (dans les panneaux) quand l'examen n'est pas coché OU non payé.
      examFieldIds(ex.id).forEach(fid => {
        const el = document.getElementById(fid);
        if (!el) return;
        if (!checked[ex.id]) setFieldLocked(el, true);              // non coché → verrou + efface
        else if (enSaisieNonPaye) setFieldLocked(el, true, true);   // coché mais non payé → verrou sans effacer
        else setFieldLocked(el, false);                             // coché + payé → éditable
      });
      // Masquer/afficher la SECTION de résultats correspondante (sec-*)
      if (ex.section) {
        const sec = document.getElementById(ex.section);
        if (sec) {
          // Une section peut regrouper plusieurs examens : visible si AU MOINS un coché
          const examsInSection = cat.filter(e => e.section === ex.section);
          const anyChecked = examsInSection.some(e => checked[e.id]);
          sec.style.display = anyChecked ? '' : 'none';
        }
      }
    });
    // Bactério : verrou global si aucun examen bactério coché OU dossier non payé
    const bacOn = ['ex_ecbu','ex_hemo','ex_copro','ex_pg','ex_pus'].some(id => checked[id]);
    document.querySelectorAll('#panel-bacterio input, #panel-bacterio select, #panel-bacterio textarea')
      .forEach(el => setFieldLocked(el, !bacOn || enSaisieNonPaye, enSaisieNonPaye && bacOn));
  } finally { _applyingLocks = false; }
}

// ✅ v13.14 — Restaure dans la fiche les examens payés (cases + prix) enregistrés
// dans le dossier, pour l'édition. Retourne false si le dossier n'a aucune
// information d'examens cochés (ancien format) → dans ce cas l'appelant
// déverrouille tout pour permettre la correction.
function restoreFicheFromRecord(record) {
  const res = (record && record.resultats) || {};
  const coches = res._examens_coches;
  const prixSrc = res._examens_prix || {};
  let labels = [], prix = {};
  if (coches) {
    if (Array.isArray(coches)) { labels = coches.slice(); Object.assign(prix, prixSrc); }
    else {
      Object.keys(coches).forEach(t => {
        labels.push(...(coches[t] || []));
        Object.assign(prix, prixSrc[t] || {});
      });
    }
  }
  if (!labels.length) return false;
  const cat = getCatalogueComplet();
  const labelSet = new Set(labels);
  cat.forEach(ex => {
    const chk = document.getElementById(ex.id);
    if (!chk) return;
    const on = labelSet.has(ex.label);
    chk.checked = on;
    if (on && prix[ex.label] != null) {
      const px = document.getElementById('px_' + ex.id);
      if (px) px.value = prix[ex.label];
    }
    if (typeof syncExamRowState === 'function') syncExamRowState(ex.id);
  });
  if (typeof calcFicheTotal === 'function') calcFicheTotal(); // recalcule le total + applique les verrous
  return true;
}

function getPendingCheckedExams(record, type) {
  const res0 = record.resultats || {};
  // Cas composite : dossier multi-analyses agrégé (impression) → tous les types
  if (type === 'Dossier' || res0._dossier) {
    let all = [];
    (res0._types || []).forEach(t => {
      const sub = res0[t] || {};
      // ✅ v13.35 fix — coches stockées au niveau dossier : res0._examens_coches[t]
      let coches = res0._examens_coches?.[t] || sub._examens_coches || [];
      // Robustesse : si c'est un objet {type:[...]}, extraire le tableau du type
      if (coches && !Array.isArray(coches)) coches = coches[t] || Object.values(coches).flat() || [];
      all = all.concat(collectPendingForType(sub, Array.isArray(coches) ? coches : []));
    });
    return all;
  }
  // Cas simple : un seul type
  let coches = isDossierRecord(record)
    ? (res0._examens_coches?.[type] || [])
    : (res0['_examens_coches'] || []);
  // ✅ v13.35 fix — robustesse : garantir un tableau
  if (coches && !Array.isArray(coches)) coches = coches[type] || Object.values(coches).flat() || [];
  const res = getRecordResultats(record, type) || {};
  return collectPendingForType(res, Array.isArray(coches) ? coches : []);
}

function buildFicheExamens() {
  const grid = document.getElementById('fiche-examens-grid');
  if (!grid) return;

  // Groupes ouverts par défaut
  const OUVERTS_PAR_DEFAUT = new Set([
    '🩸 Hématologie', '🤰 Bilan prénatal'
  ]);

  // Grouper par catégorie
  const groupes = {};
  getCatalogueComplet().forEach(ex => {
    if (!groupes[ex.groupe]) groupes[ex.groupe] = [];
    groupes[ex.groupe].push(ex);
  });

  grid.innerHTML = Object.entries(groupes).map(([groupe, examens]) => {
    const ouvert = OUVERTS_PAR_DEFAUT.has(groupe);
    const gid = 'grp_' + groupe.replace(/[^a-z0-9]/gi, '_');
    return `
    <div class="exam-group-card">
      <div class="exam-group-title accordion-header" onclick="toggleAccordion('${gid}')" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;user-select:none">
        <span>${groupe}</span>
        <span id="${gid}_arrow" style="font-size:12px;transition:transform .2s;display:inline-block;transform:${ouvert ? 'rotate(0deg)' : 'rotate(-90deg)'}">▼</span>
      </div>
      <div id="${gid}" style="display:${ouvert ? 'block' : 'none'}">
        ${examens.map(ex => `
        <div class="exam-row" id="row_${ex.id}" onclick="toggleExamRow(event,'${ex.id}')">
          <input type="checkbox" id="${ex.id}" onchange="calcFicheTotal();syncExamRowState('${ex.id}')" onclick="event.stopPropagation()">
          <label for="${ex.id}" onclick="event.stopPropagation()">
            ${ex.label}${ex.note ? `<span style="font-size:10px;color:var(--text-muted);font-style:italic"> (${ex.note})</span>` : ''}
            ${ex.custom ? '<span style="font-size:9px;background:var(--accent-light);color:var(--cpmi-mid);border-radius:4px;padding:1px 5px;margin-left:4px">+</span>' : ''}
          </label>
          <input type="number" id="px_${ex.id}" value="0" min="0" step="100"
            oninput="calcFicheTotal()" onclick="event.stopPropagation()">
          <span class="exam-unit">F</span>
        </div>`).join('')}
      </div>
    </div>`;
  }).join('');

  rechargeFichePrix();
  if (typeof applyExamLocks === 'function') applyExamLocks();
}

function toggleAccordion(gid) {
  const body  = document.getElementById(gid);
  const arrow = document.getElementById(gid + '_arrow');
  if (!body) return;
  const ouvert = body.style.display !== 'none';
  body.style.display  = ouvert ? 'none' : 'block';
  if (arrow) arrow.style.transform = ouvert ? 'rotate(-90deg)' : 'rotate(0deg)';
}

// Permet de cocher/décocher une ligne d'examen en cliquant n'importe où dessus
// (pas seulement sur la checkbox), pour un confort d'usage tactile/souris optimal
function toggleExamRow(evt, exId) {
  const chk = document.getElementById(exId);
  if (!chk) return;
  chk.checked = !chk.checked;
  calcFicheTotal();
  syncExamRowState(exId);
}

// Met à jour le style visuel (fond vert pâle) de la ligne selon l'état coché
function syncExamRowState(exId) {
  const chk = document.getElementById(exId);
  const row = document.getElementById('row_' + exId);
  if (chk && row) row.classList.toggle('checked', chk.checked);
}

function calcFicheTotal() {
  let total = 0, count = 0;
  const montantParTab = {}; // ex: { hema: 5500, bio: 1000, ... }

  getCatalogueComplet().forEach(ex => {
    const chk  = document.getElementById(ex.id);
    const pxEl = document.getElementById('px_' + ex.id);
    const row  = document.getElementById('row_' + ex.id);
    if (chk && chk.checked) {
      const prix = parseInt(pxEl?.value || '0');
      total += prix;
      count++;
      const tab = ex.tab || 'hema';
      montantParTab[tab] = (montantParTab[tab] || 0) + prix;
    }
    if (row) row.classList.toggle('checked', !!(chk && chk.checked));
  });

  const montantEl = document.getElementById('montant-preview');
  const countEl   = document.getElementById('fiche-examens-count');
  if (montantEl) {
    montantEl.textContent = total.toLocaleString('fr-FR') + ' FCFA';
    montantEl.dataset.montant = total;
    // Stocker le détail par tab pour saveRecord
    montantEl.dataset.montantParTab = JSON.stringify(montantParTab);
  }
  if (countEl) countEl.textContent = count + ' examen' + (count > 1 ? 's' : '') + ' sélectionné' + (count > 1 ? 's' : '');
  if (typeof applyExamLocks === 'function') applyExamLocks(); // ✅ v13.13
  if (typeof applyBpnSections === 'function') applyBpnSections(); // ✅ v13.21
}

function demarrerSaisie() {
  // Vérification minimale
  const nom = document.getElementById('p_nom')?.value?.trim();
  if (!nom) { toast('Veuillez saisir le nom du patient', 'err'); return; }

  // Nouvelle session de saisie : repartir en mode filtré (examens cochés seulement)
  _showAllExams = false;

  // Déterminer l'onglet à activer selon le premier examen coché
  const premierEx = getCatalogueComplet().find(ex => document.getElementById(ex.id)?.checked);
  const tabCible  = premierEx ? premierEx.tab : 'hema';

  // Mettre à jour le rappel patient
  const rappelNom  = document.getElementById('rappel-nom');
  const rappelDoss = document.getElementById('rappel-dossier');
  const rappelEx   = document.getElementById('rappel-examens');
  if (rappelNom)  rappelNom.textContent  = nom;
  if (rappelDoss) rappelDoss.textContent = 'N° ' + (document.getElementById('p_dossier')?.value || '');
  if (rappelEx) {
    const examensCoches = CATALOGUE_EXAMENS.filter(ex => document.getElementById(ex.id)?.checked).map(ex => ex.label);
    rappelEx.textContent = examensCoches.length
      ? 'Examens : ' + examensCoches.join(' · ')
      : 'Aucun examen sélectionné';
  }

  // Afficher la zone de saisie, masquer la fiche
  document.getElementById('fiche-identification').style.display = 'none';
  document.getElementById('zone-saisie').style.display = '';

  // Activer le bon onglet (construit le panneau si ce n'est pas déjà fait)
  switchTab(tabCible);

  // Marquer d'une étoile rouge les sections correspondant aux examens payés
  // (doit venir APRÈS switchTab pour que les sections existent dans le DOM)
  markRequiredSections();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Marque les sections/cartes correspondant aux examens cochés (payés)
// avec un badge "obligatoire" (étoile rouge) — purement visuel, pas bloquant
// Onglets où le filtrage par section a du sens (plusieurs cartes/sous-sections
// distinctes). Les onglets à carte unique (Bactério, Parasito, GS standalone)
// n'ont rien à filtrer : ils s'affichent toujours en entier.
const TABS_AVEC_SECTIONS_FILTRABLES = new Set(['hema', 'bio']);

let _showAllExams = false; // état du bouton "Afficher tous les examens" pour la session de saisie en cours

function markRequiredSections() {
  // Nettoyer les anciens marquages
  document.querySelectorAll('.required-mark').forEach(el => el.remove());
  document.querySelectorAll('.card').forEach(c => { c.style.border = ''; c.style.boxShadow = ''; });

  const sectionsAMarquer = new Set();
  getCatalogueComplet().forEach(ex => {
    const chk = document.getElementById(ex.id);
    if (chk && chk.checked && ex.section) sectionsAMarquer.add(ex.section);
  });

  // ── Marquage à l'étoile rouge des sections requises (examens payés) ──
  sectionsAMarquer.forEach(sectionId => {
    const el = document.getElementById(sectionId);
    if (!el) return;
    const star = document.createElement('span');
    star.className = 'required-mark';
    star.textContent = ' ✪ requis';
    star.title = 'Examen payé — résultat attendu';
    star.style.cssText = 'color:#dc2626;font-size:11px;font-weight:800;margin-left:8px;vertical-align:middle;letter-spacing:.2px';
    el.appendChild(star);
    const card = el.closest('.card');
    if (card) {
      card.style.border = '1.5px solid #fca5a5';
      card.style.boxShadow = '0 0 0 1px rgba(220,38,38,.08)';
    }
  });

  // ── Filtrage : cacher les sections non cochées (sauf si "tout afficher" actif) ──
  applySectionVisibility(sectionsAMarquer);
}

// Affiche/masque les sections selon l'ensemble des sections requises,
// en respectant l'état du bouton "Afficher tous les examens"
function applySectionVisibility(sectionsRequises) {
  const tabActif = document.querySelector('.panel.active')?.id?.replace('panel-', '');
  if (!tabActif || !TABS_AVEC_SECTIONS_FILTRABLES.has(tabActif)) return;

  // Lister toutes les cartes/sections filtrables de cet onglet
  const toutesSections = getCatalogueComplet()
    .filter(ex => ex.tab === tabActif && ex.section)
    .map(ex => ex.section);
  const sectionsUniques = [...new Set(toutesSections)];

  // Cas spécial : la carte "Groupe sanguin" intégrée dans l'onglet Hématologie
  // (sec-gs-hema) reflète les mêmes examens que l'onglet GS standalone (ex_gs, ex_rai),
  // même si physiquement elle vit dans le panneau Hématologie.
  if (tabActif === 'hema') {
    sectionsUniques.push('sec-gs-hema');
    const gsCoche = ['ex_gs', 'ex_rai'].some(id => document.getElementById(id)?.checked);
    if (gsCoche) sectionsRequises.add('sec-gs-hema');
  }

  sectionsUniques.forEach(sectionId => {
    const el = document.getElementById(sectionId);
    if (!el) return;
    // La cible à cacher/montrer : soit l'élément lui-même (s'il EST déjà le wrap/carte),
    // soit sa carte parente la plus proche
    const target = el.id.endsWith('-wrap') ? el : (el.closest('.card') || el);
    const doitEtreVisible = _showAllExams || sectionsRequises.has(sectionId);
    target.style.display = doitEtreVisible ? '' : 'none';
  });

  updateShowAllButton(sectionsRequises, sectionsUniques);
}

// Affiche ou met à jour le bouton "Afficher tous les examens" dans le bandeau de rappel
function updateShowAllButton(sectionsRequises, sectionsUniques) {
  const rappelEl = document.getElementById('rappel-patient');
  if (!rappelEl) return;

  let btn = document.getElementById('btn-show-all-exams');
  const nbCachees = sectionsUniques.filter(s => !sectionsRequises.has(s)).length;

  if (nbCachees === 0 && !_showAllExams) {
    // Rien n'est caché (tout coché), pas besoin du bouton
    if (btn) btn.remove();
    return;
  }

  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'btn-show-all-exams';
    btn.style.cssText = 'margin-left:10px;background:none;border:1px solid var(--cpmi-mid);color:var(--cpmi-mid);padding:3px 10px;border-radius:99px;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap';
    btn.onclick = toggleShowAllExams;
    const retourBtn = rappelEl.querySelector('[onclick*="fiche-identification"]');
    if (retourBtn) rappelEl.insertBefore(btn, retourBtn);
    else rappelEl.appendChild(btn);
  }
  btn.textContent = _showAllExams
    ? '👁 Masquer les examens non sélectionnés'
    : '👁 Afficher tous les examens (' + nbCachees + ' masqué' + (nbCachees>1?'s':'') + ')';
}

function toggleShowAllExams() {
  _showAllExams = !_showAllExams;
  markRequiredSections();
}

async function enregistrerFicheIdentif() {
  // ✅ v13.28 — Enregistre le dossier (patient + examens cochés + montant)
  // SANS résultats. Le dossier apparaît en base avec sa facture ; les
  // résultats pourront être complétés plus tard en éditant le dossier.
  const p = getPatient();
  if (!validatePatient(p)) return;

  // Récupérer tous les examens cochés (tous onglets confondus)
  const catalogue = getCatalogueComplet();
  const cochesParTab = {};
  const prixParTab = {};
  let montantTotal = 0;
  catalogue.forEach(ex => {
    const cb = document.getElementById(ex.id);
    if (cb && cb.checked) {
      const tab = ex.tab || 'hema';
      (cochesParTab[tab] = cochesParTab[tab] || []).push(ex.label);
      const prixEl = document.getElementById('px_' + ex.id);
      const prix = prixEl ? (parseInt(prixEl.value) || 0) : (ex.prix || 0);
      (prixParTab[tab] = prixParTab[tab] || {})[ex.label] = prix;
      montantTotal += prix;
    }
  });

  const nbCoches = Object.values(cochesParTab).reduce((s, a) => s + a.length, 0);
  if (nbCoches === 0) {
    toast('Cochez au moins un examen pour enregistrer la facture', 'err');
    return;
  }

  if (_saving) return;
  _saving = true;
  showLoading('Enregistrement de la facture…');

  try {
    // Construire un dossier "facture seule" : métadonnées, pas de résultats
    const TAB_TO_TYPE = {
      hema:'Hématologie', bio:'Biochimie', bacterio:'Bactériologie',
      sero:'Immuno-Sérologie', parasito:'Parasitologie', gs:'Groupe sanguin'
    };
    // ✅ v13.36 — Plus de « type principal » : le dossier est enregistré avec
    // type='Dossier' et toutes ses analyses dans _types. (L'ancien typePrincipal
    // rangeait tout le dossier sous la 1re analyse cochée, souvent Hématologie.)

    const _montants = {};
    const _examens_coches = {};
    const _examens_prix = {};
    Object.keys(cochesParTab).forEach(tab => {
      const t = TAB_TO_TYPE[tab] || 'Hématologie';
      const m = Object.values(prixParTab[tab]).reduce((s, v) => s + v, 0);
      _montants[t] = m;
      _examens_coches[t] = cochesParTab[tab];
      _examens_prix[t] = prixParTab[tab];
    });

    const resultats = {
      _types: Object.keys(_montants),
      _montants,
      _examens_coches,
      _examens_prix,
      _facture_seule: true, // marqueur : résultats non encore saisis
    };

    const prescripteur_id = document.getElementById('p_prescripteur_id')?.value || null;

    if (_editingFicheId) {
      // ✅ v13.29 — MODE MISE À JOUR : on préserve les résultats existants,
      // on ne met à jour que le patient + métadonnées de facturation.
      showLoading('Mise à jour de la fiche…');
      const existing = getDB().find(rr => rr.id === _editingFicheId);
      const mergedResultats = {
        ...(existing?.resultats || {}),        // garde les résultats déjà saisis
        _types:          resultats._types,
        _montants:       resultats._montants,
        _examens_coches: resultats._examens_coches,
        _examens_prix:   resultats._examens_prix,
        _facture_seule:  !(existing?.resultats) || existing.resultats._facture_seule,
      };
      const updatedRecord = {
        // ✅ v13.36 — TOUJOURS 'Dossier' : un dossier multi-analyses doit
        // passer isDossierRecord() pour que getRecordTypes() lise _types.
        // (Avant : typePrincipal masquait les analyses autres que la 1re,
        //  ex. Immuno-Sérologie affiché comme « Hématologie ».)
        type: 'Dossier',
        patient: p,
        resultats: mergedResultats,
        montant: montantTotal,
        prescripteur_id,
        est_bpn: false,
      };
      await updateRecordRemote(_editingFicheId, updatedRecord);
      hideLoading();
      toast('✅ Fiche d\'accueil mise à jour — N° ' + (p.dossier || ''), 'ok');
      _editingFicheId = null;
      // Nettoyer le bandeau et le bouton
      const fBanner = document.getElementById('fiche-edit-banner');
      if (fBanner) fBanner.style.display = 'none';
      const btnSave = document.querySelector('[onclick="enregistrerFicheIdentif()"]');
      if (btnSave) btnSave.innerHTML = '💾 Enregistrer sans saisie';
      await refreshDB(true);
      showView('historique');
    } else {
      // ✅ v13.37 — Garde-fou anti-doublon : un dossier ACTIF avec ce numéro
      // existe déjà (double-clic, ré-enregistrement…). On propose un nouveau
      // numéro plutôt que de créer un doublon.
      const _dup = getDB().find(rr => rr.patient?.dossier === p.dossier && !rr.deletedAt && !rr._hardDeleted);
      if (_dup) {
        hideLoading();
        const _ok = await showConfirmModal({
          icon: '⚠️', title: 'Numéro de dossier déjà utilisé',
          message: 'Le dossier N° ' + esc(p.dossier || '') + ' existe déjà (' + esc(_dup.patient?.nom || '') + '). Générer un nouveau numéro et enregistrer ? (Annuler pour vérifier d\'abord.)',
          confirmText: 'Nouveau numéro + enregistrer', cancelText: 'Annuler'
        });
        if (!_ok) return;
        await regenDossier();
        p.dossier = getPatient().dossier;
        showLoading('Enregistrement de la facture…');
      }
      const record = {
        // ✅ v13.36 — TOUJOURS 'Dossier' (voir note ci-dessus) : sinon
        // getRecordTypes() ne renvoie que le type principal et masque les
        // autres analyses dans l'historique et sur le reçu.
        type: 'Dossier',
        patient: p,
        resultats,
        montant: montantTotal,
        prescripteur_id,
        est_bpn: false,
      };
      await insertRecordRemote(record);
      hideLoading();
      toast('Facture enregistrée ✓ — résultats à compléter plus tard', 'ok');
      await refreshDB(true);
      // ✅ v13.37 — Nouveau patient enregistré depuis la caisse → retour à la caisse
      if (_caisseNewPatientMode) {
        _caisseNewPatientMode = false;
        showView('caisse');
      } else {
        newPatient();
      }
    }
  } catch (e) {
    hideLoading();
    console.error('Erreur enregistrement facture:', e);
    toast('Erreur : ' + (e.message || e), 'err');
  } finally {
    _saving = false;
  }
}

// ============================================================
// TOAST
// ============================================================

let toastTimer;

// ✅ v13.33 — Compte à rebours animé pour les valeurs KPI
function animateCount(el, target, duration = 600, isCurrency = false) {
  if (!el) return;
  const isNumber = typeof target === 'number' && !isNaN(target);
  if (!isNumber || target === 0) {
    el.classList.add('kpi-pop');
    el.addEventListener('animationend', () => el.classList.remove('kpi-pop'), { once: true });
    return;
  }
  const start = performance.now();
  const startVal = 0;
  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(startVal + (target - startVal) * eased);
    el.textContent = isCurrency ? _fmtF(current) : current;
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      el.textContent = isCurrency ? _fmtF(target) : target;
      el.classList.add('kpi-pop');
      el.addEventListener('animationend', () => el.classList.remove('kpi-pop'), { once: true });
    }
  }
  requestAnimationFrame(step);
}

