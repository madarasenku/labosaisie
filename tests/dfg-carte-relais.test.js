// v13.258 — La carte DFG ne doit JAMAIS faire passer la créatinine (ni l'âge)
// d'un patient dans le dossier d'un autre.
//
// Défaut corrigé (présent depuis la v13.198) :
//   • la carte n'était remplie que VIDE : elle gardait la créatinine, l'âge et le
//     sexe du premier patient (saisie en série, dossiers enchaînés) ;
//   • ensureInterpFresh « réveillait » toutes les cases du panneau, y compris
//     celles de la carte, qui RECOPIENT leur valeur dans le dossier
//     (dfgFromCard) → juste avant la collecte, la créatinine saisie était
//     remplacée par celle restée dans la carte.
//   Effet constaté en production le 24/10 : 4 patients d'un même lot enregistrés
//   avec la créatinine, l'urée et le DFG du premier ; corriger n'y changeait rien.
// Aussi : en série, « 6 mois » posé tel quel dans le champ numérique de l'âge
// devenait vide → le nourrisson était interprété comme un adulte.
const { serve, openApp, createReporter } = require('./helpers');
const PORT = 8363;
const CIBLE = process.env.CIBLE || '/index.html';
const AUJ = new Date().toISOString().slice(0, 10);
const COCHES = { 'Biochimie': ['Glycémie à jeun', 'Urée', 'Créatinine', 'ASAT / ALAT (Transaminases)'] };
const mk = (id, sexe, age) => ({ id, type: 'Dossier', montant: 9000, created_at: AUJ + 'T09:00:00Z',
  patient: { nom: 'PATIENT ' + id, dossier: '0' + id + '-1026', sexe, age, date: AUJ, statut: 'attente' },
  resultats: { _types: ['Biochimie'], _facture_seule: true, _examens_coches: COCHES, _examens_prix: {}, _montants: {} },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null });
const DOSS = [mk(9104, 'F', '40'), mk(9103, 'F', '33'), mk(9101, 'M', '38'), mk(9100, 'M', '40'), mk(9105, 'F', '6 mois')];
const CREA = { 9104: '8.9', 9103: '6.5', 9101: '11.2', 9100: '13.4' };

(async () => {
  const srv = await serve(PORT);
  const r = createReporter('CARTE DFG : AUCUNE CRÉATININE D\'UN AUTRE PATIENT');
  const { ctx, page, errors } = await openApp({ role: 'admin', port: PORT, cible: CIBLE });
  await page.evaluate((d) => {
    window.__db = d; window.showConfirmModal = async () => true;
    _sb.rpc = async (nom, p) => {
      if (nom === 'get_resultats_light') return { data: window.__db, error: null };
      if (nom === 'get_resultat_full') return { data: [window.__db.find(z => z.id === p.p_id)], error: null };
      if (nom === 'update_resultat') { const x = window.__db.find(z => z.id === p.p_id); x.resultats = p.p_resultats; return { data: { ...x }, error: null }; }
      return { data: [], error: null };
    };
    window.__poser = (id, v) => { const el = document.getElementById(id); el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    window.__bio = id => window.__db.find(z => z.id === id).resultats['Biochimie'] || {};
    window.__v = (id, cle) => ((__bio(id)[cle]) || {}).valeur;
  }, DOSS);
  await page.evaluate(() => refreshDB(true)); await page.waitForTimeout(300);
  await page.evaluate(() => { try { showView('saisie'); } catch (e) {} }); await page.waitForTimeout(300);
  await page.evaluate(() => { _grilleDate = ''; window.ouvrirGrille('crea'); }); await page.waitForTimeout(500);

  r.section('Saisie en série : 4 patients, 4 créatinines');
  await page.evaluate(async (crea) => {
    Object.keys(crea).forEach(id => { __poser(`g_${id}_crea_crea`, crea[id]); __poser(`g_${id}_gly_gly`, '0.9'); });
    __poser('g_9105_gly_gly', '0.60');
    await grilleSaveAll();
  }, CREA);
  await page.waitForTimeout(800);
  const lot = await page.evaluate(() => [9104, 9103, 9101, 9100].map(id => __v(id, 'Créatinine')).join(' '));
  r.check('chaque patient garde SA créatinine', lot, '8.9 6.5 11.2 13.4');
  r.check('urée déduite de SA créatinine', await page.evaluate(() => [9104, 9103, 9101, 9100].map(id => __v(id, 'Urée')).join(' ')), '0.20 0.15 0.25 0.30');
  const dfg = await page.evaluate(() => [9104, 9103, 9101, 9100].map(id => {
    const x = __db.find(z => z.id === id); const att = calculerDFG({ creat: __v(id, 'Créatinine'), unite: 'mg/L', age: parseFloat(x.patient.age), sexe: x.patient.sexe });
    return dfgNum(att.ckd_epi_2021) === __v(id, 'DFG estimé — CKD-EPI 2021'); }).join(' '));
  r.check('DFG calculé avec SES âge, sexe et créatinine', dfg, 'true true true true');
  r.check('pas de Cockcroft avec un poids hérité', await page.evaluate(() => [9104, 9103, 9101, 9100].map(id => __v(id, 'Clairance créatinine — Cockcroft-Gault') || '').join('')), '');

  r.section('Nourrisson en série : l\'âge garde son unité');
  r.check('« 6 mois » : glycémie 0,60 interprétée « Normal » (et non adulte « Bas »)', await page.evaluate(() =>
    (__bio(9105)['Glycémie à jeun'] || {}).interp), 'Normal');

  r.section('Correction en série (« déjà saisis »)');
  await page.evaluate(() => grilleToggleSaisis(true)); await page.waitForTimeout(1200);
  r.check('cases préremplies avec les vraies valeurs', await page.evaluate(() =>
    [9104, 9103, 9101, 9100].map(id => document.getElementById(`g_${id}_crea_crea`).value).join(' ')), '8.9 6.5 11.2 13.4');
  await page.evaluate(async () => {
    __poser('g_9104_crea_crea', '9.5'); __poser('g_9103_crea_crea', '7.0'); __poser('g_9101_crea_crea', '12.0'); __poser('g_9100_crea_crea', '14.0');
    await grilleSaveAll();
  });
  await page.waitForTimeout(800);
  r.check('corrections enregistrées', await page.evaluate(() => [9104, 9103, 9101, 9100].map(id => __v(id, 'Créatinine')).join(' ')), '9.5 7.0 12.0 14.0');

  r.section('Dossier par dossier (formulaire)');
  const corrige = await page.evaluate(() => {
    ensurePanelBuilt('bio');
    document.getElementById('ex_crea').checked = true; if (typeof applyExamLocks === 'function') applyExamLocks();
    document.getElementById('p_sexe').value = 'F'; document.getElementById('p_age').value = '40'; document.getElementById('p_age_unit').value = 'ans';
    loadResultsIntoForm('Biochimie', { 'Créatinine': { valeur: '8.9' } }); recalcDFG();
    const avant = document.getElementById('dfg_crea').value;
    __poser('v_crea', '9.5');                       // on corrige
    ensureInterpFresh('Biochimie');
    const res = collectResults('Biochimie');
    return [avant, res['Créatinine'].valeur, document.getElementById('dfg_crea').value].join(' ');
  });
  r.check('créatinine corrigée : ni annulée, ni remplacée par la carte', corrige, '8.9 9.5 9.5');
  const suivant = await page.evaluate(() => {
    resetPanel('bio');                               // dossier suivant
    const vide = ['dfg_crea', 'dfg_age'].map(id => document.getElementById(id).value).join('');
    document.getElementById('p_sexe').value = 'M'; document.getElementById('p_age').value = '38';
    __poser('v_crea', '11.2'); ensureInterpFresh('Biochimie');
    return [vide || '∅', collectResults('Biochimie')['Créatinine'].valeur, document.getElementById('p_age').value].join(' ');
  });
  r.check('dossier suivant : carte vidée, sa créatinine et son âge gardés', suivant, '∅ 11.2 38');
  r.check('âge en mois : la carte le reçoit en années', await page.evaluate(() => {
    document.getElementById('p_age').value = '18'; document.getElementById('p_age_unit').value = 'mois'; recalcDFG();
    const a = document.getElementById('dfg_age').value; document.getElementById('p_age_unit').value = 'ans'; return a; }), '1.5');

  r.section('DFG seul (sans créatinine au dossier) : la carte reste saisissable');
  r.check('valeur tapée dans la carte gardée et calculée', await page.evaluate(() => {
    resetPanel('bio');
    document.getElementById('p_sexe').value = 'F'; document.getElementById('p_age').value = '50';
    const c = document.getElementById('dfg_crea'); c.value = '10'; dfgFromCard('crea');
    ensureInterpFresh('Biochimie'); recalcDFG();
    return c.value + ' ' + (document.getElementById('v_dfg').value !== ''); }), '10 true');

  r.check('aucune erreur de page', errors.join(' | ') || 'aucune', 'aucune');
  await ctx.close(); srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
