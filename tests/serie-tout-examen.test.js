// ════════════════════════════════════════════════════════════════════
//  TOUT PAR LA SÉRIE (lien de test /preview)
//    • Plus de saisie « directe » : editRecord / fillAllResults ouvrent la
//      série centrée sur le dossier.
//    • Bactériologie et selles : case « Saisir » → fenêtre avec la fiche
//      complète → « Valider » → enregistrement avec la série.
//    • RAI : colonnes RAI / phénotype.
//    • Le compte rendu imprime la culture, l'antibiogramme, les selles, la RAI.
//    • Plus aucun examen du catalogue n'est hors série (sauf forfait / LDL calculé).
// ════════════════════════════════════════════════════════════════════
const { serve, openApp, createReporter } = require('./helpers');

const AUJ = new Date().toISOString().slice(0, 10);
const doss = (id, nom, coches, extra) => Object.assign({
  id, type: 'Dossier', montant: 10000, created_at: AUJ + 'T09:00:00Z', created_by: 'YERIGUE',
  patient: { nom, dossier: '02' + id + '-1026', date: AUJ, sexe: 'F', age: 30, paiement_status: 'paye' },
  resultats: { _types: Object.keys(coches), _examens_coches: coches },
  prescripteur_id: null, est_bpn: false, restricted_by: null, deleted_at: null,
}, extra || {});

(async () => {
  const srv = await serve(8267);
  const r = createReporter('TOUT PAR LA SÉRIE');
  const { ctx, page, errors } = await openApp({ role: 'agent', username: 'YERIGUE', port: 8267,
                                                cible: process.env.CIBLE || '/index.html' });
  const D = [
    doss(51, 'KONE AWA', { 'Bactériologie': ['ECBU'] }),
    doss(52, 'YAO MARIE', { 'Parasitologie': ['EPS — Examen parasitologique des selles'] }),
    doss(53, 'BAMBA FATOU', { 'Groupe sanguin': ['Groupe sanguin ABO / Rhésus', 'RAI + Phénotypage érythrocytaire'] }),
    // ECBU déjà saisi avec l'ANCIEN formulaire (pas de marque « saisi en série »).
    doss(54, 'DIALLO ROKIA', { 'Bactériologie': ['ECBU'] }),
  ];
  D[3].resultats['Bactériologie'] = { 'Culture': 'neg', 'Leucocytes (/mm³)': '2000' };
  await page.evaluate(data => {
    window.__maj = [];
    window.toast = () => {};
    _sb.rpc = async (nom, p) => {
      // Liste LÉGÈRE : seulement les métadonnées « _… », comme le vrai serveur.
      if (nom === 'get_resultats_light' || nom === 'get_resultats') return { data: data.map(d => Object.assign({}, d, { resultats: Object.fromEntries(Object.entries(d.resultats).filter(([k]) => k[0] === '_')) })), error: null };
      if (nom === 'get_resultat_full') { const x = data.find(d => d.id === p.p_id); return { data: [{ resultats: x ? x.resultats : {} }], error: null }; }
      if (nom === 'update_resultat') {
        window.__maj.push(p);
        const x = data.find(d => d.id === p.p_id);
        if (x && p.p_resultats) x.resultats = p.p_resultats;
        return { data: Object.assign({}, x, { created_at: x.created_at }), error: null };
      }
      return { data: [], error: null };
    };
  }, D);
  await page.evaluate(() => refreshDB(true));

  // ── 1. Plus de saisie directe ─────────────────────────────────────
  r.section('Plus de saisie directe');
  const redir = await page.evaluate(async () => {
    await fillAllResults(51);
    const a = { serie: document.getElementById('grille-serie')?.style.display !== 'none', focus: _grilleFocusId,
                pleinePage: document.body.classList.contains('fill-all-mode') };
    await editRecord(53);
    return Object.assign(a, { focus2: _grilleFocusId });
  });
  r.check('fillAllResults ouvre la série', redir.serie, true);
  r.check('… centrée sur le dossier', redir.focus, 51);
  r.check('pas de page « un patient »', redir.pleinePage, false);
  r.check('editRecord ouvre aussi la série', redir.focus2, 53);

  // ── 2. Bactériologie : fenêtre depuis la ligne ────────────────────
  r.section('Bactériologie dans la série');
  const bact = await page.evaluate(async () => {
    await ouvrirGrilleDossier(51);
    const btn = document.getElementById('gbtn_51_bact');
    const parentAvant = document.getElementById('panel-bacterio').parentNode;
    await grilleOuvrirFiche(51, 'bact');
    const modal = document.getElementById('grille-fiche-modal');
    const dansModal = !!(modal && modal.contains(document.getElementById('panel-bacterio')));
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); };
    set('bac_culture', 'pos');
    set('bac_type', 'ECBU');
    set('bac_gram', 'bac_G-_e');
    set('bac_germe', 'Escherichia coli');
    set('ef_leuco', '85000');
    const abg = document.querySelector('#abg_Ceftriaxone select'); abg.value = 'S'; abg.dispatchEvent(new Event('change', { bubbles: true }));
    const abr = document.querySelector('#abg_Amoxicilline select'); abr.value = 'R'; abr.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('grille-fiche-valider').click();
    const remis = document.getElementById('panel-bacterio').parentNode === parentAvant;
    return { bouton: !!btn, dansModal, remis, modalFermee: !document.getElementById('grille-fiche-modal'),
             coche: document.getElementById('gsel_51')?.checked,
             libelle: document.getElementById('gbtn_51_bact')?.textContent };
  });
  r.check('case « Saisir » dans la ligne', bact.bouton, true);
  r.check('la fiche s\'ouvre dans une fenêtre', bact.dansModal, true);
  r.check('fenêtre refermée après « Valider »', bact.modalFermee, true);
  r.check('formulaire remis à sa place', bact.remis, true);
  r.check('ligne cochée « prête »', bact.coche, true);
  r.check('bouton « Rempli »', /Rempli/.test(bact.libelle || ''), true);

  const save1 = await page.evaluate(async () => {
    window.__maj = [];
    await grilleSaveAll();
    const p = window.__maj.find(x => x.p_id === 51) || {};
    const B = (p.p_resultats || {})['Bactériologie'] || {};
    return { germe: B['Germe identifié'], culture: B['Culture'], leuco: B['Leucocytes (/mm³)'],
             cef: B['ABG_Ceftriaxone'], amox: B['ABG_Amoxicilline'],
             serie: !!(((p.p_resultats || {})._saisi_serie) || {}).bact };
  });
  r.check('germe enregistré', save1.germe, 'Escherichia coli');
  r.check('culture enregistrée', save1.culture, 'pos');
  r.check('leucocytes enregistrés', save1.leuco, '85000');
  r.check('antibiogramme : Ceftriaxone S', save1.cef, 'S');
  r.check('antibiogramme : Amoxicilline R', save1.amox, 'R');
  r.check('examen marqué saisi en série', save1.serie, true);

  // ── 3. Parasitologie des selles ───────────────────────────────────
  r.section('Selles (EPS) dans la série');
  const eps = await page.evaluate(async () => {
    await ouvrirGrilleDossier(52);
    await grilleOuvrirFiche(52, 'eps');
    const typeAuto = document.getElementById('para_type').value;
    document.getElementById('para_resultat').value = 'Positif';
    document.getElementById('pe_Ascaris_lumbricoides').value = 'Positif';
    document.getElementById('grille-fiche-valider').click();
    window.__maj = [];
    await grilleSaveAll();
    const p = window.__maj.find(x => x.p_id === 52) || {};
    const P = (p.p_resultats || {})['Parasitologie'] || {};
    return { typeAuto, res: P['Résultat global'], asc: P['Ascaris lumbricoides'] };
  });
  r.check('type « selles » proposé d\'office', /selles/i.test(eps.typeAuto), true);
  r.check('résultat global enregistré', eps.res, 'Positif');
  r.check('parasite enregistré', eps.asc, 'Positif');

  // ── 4. RAI ────────────────────────────────────────────────────────
  r.section('RAI dans la série');
  const rai = await page.evaluate(async () => {
    await ouvrirGrilleDossier(53);
    const set = (id, v) => { const e = document.getElementById(id); if (!e) return false; e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; };
    const ok = set('g_53_rai_rai', 'Négative') && set('g_53_rai_pheno', 'C+ c+ E- e+ K-')
            && set('g_53_gs_abo', 'O') && set('g_53_gs_rh', 'Positif');
    window.__maj = [];
    await grilleSaveAll();
    const p = window.__maj.find(x => x.p_id === 53) || {};
    const G = (p.p_resultats || {})['Groupe sanguin'] || {};
    return { ok, rai: G['RAI'], pheno: G['Phénotype érythrocytaire'], abo: G['Groupe ABO'] };
  });
  r.check('colonnes RAI présentes', rai.ok, true);
  r.check('RAI enregistrée', rai.rai, 'Négative');
  r.check('phénotype enregistré', rai.pheno, 'C+ c+ E- e+ K-');
  r.check('groupe ABO conservé', rai.abo, 'O');

  // ── 4 bis. Saisi avec l'ancien formulaire → sort de « à saisir » ──
  r.section('Culture déjà saisie hors série');
  const anc = await page.evaluate(async () => {
    const rec = () => getDB().find(x => x.id === 54);
    // Repartir d'un poste qui n'a encore rien vérifié (la série l'a fait plus haut).
    _grilleFichesSaisies.delete(54); _grilleFichesVerifiees.delete(54);
    await refreshDB(true);
    const avant = grilleExamsRestants(rec()).indexOf('bact') >= 0;
    _grilleModeASaisir = true; _grilleToutesSemaines = true;
    const eps52 = grilleClesAffichees({ id: 999, resultats: { _examens_coches: {
      'Parasitologie': ['EPS — Examen parasitologique des selles'] } } }).indexOf('eps') >= 0;
    _grilleModeASaisir = false;
    await grilleVerifierFiches();
    const apres = grilleExamsRestants(rec()).indexOf('bact') >= 0;
    await refreshDB(true);                         // liste légère rechargée : le résultat est mémorisé
    return { avant, apres, apresRefresh: grilleExamsRestants(rec()).indexOf('bact') >= 0, eps52 };
  });
  r.check('liste légère : paraît « à saisir »', anc.avant, true);
  r.check('après vérification : sorti de « à saisir »', anc.apres, false);
  r.check('… et le reste après rechargement de la liste', anc.apresRefresh, false);
  r.check('selles (EPS) dans « Résultats à saisir »', anc.eps52, true);

  // ── 5. Plus rien hors série ───────────────────────────────────────
  r.section('Couverture');
  const couv = await page.evaluate(() => {
    const TT = { hema:'Hématologie', bio:'Biochimie', bacterio:'Bactériologie', sero:'Immuno-Sérologie', parasito:'Parasitologie', gs:'Groupe sanguin' };
    const coches = {}; CATALOGUE_EXAMENS.forEach(e => { const t = TT[e.tab]; (coches[t] = coches[t] || []).push(e.label); });
    return grilleHorsSerie({ id: 1, resultats: { _examens_coches: coches } }).map(e => e.label);
  });
  r.check('aucun examen hors série', couv.length ? couv.join(', ') : 'aucun', 'aucun');

  // ── 6. Compte rendu ───────────────────────────────────────────────
  r.section('Compte rendu');
  const cr = await page.evaluate(async () => {
    const txt = async id => { const rec = getDB().find(x => x.id === id); await ensureFull(rec); const h = await crBuildHTML(rec); const d = document.createElement('div'); d.innerHTML = h; d.querySelectorAll('style').forEach(s => s.remove()); return d.textContent; };
    // Leucocytes en APPRÉCIATION (pas de numération) : imprimés tels quels, sans unité.
    const quali = { id: 77, type: 'Dossier', patient: { nom: 'Q', dossier: 'Q1' }, resultats: {
      _examens_coches: { 'Bactériologie': ['ECBU'] },
      'Bactériologie': { 'Type de prélèvement': 'ECBU', 'Leucocytes (/mm³)': 'Rares', 'Hématies (/mm³)': '3000', 'Culture': 'neg' } } };
    const hq = await crBuildHTML(quali); const dq = document.createElement('div'); dq.innerHTML = hq; dq.querySelectorAll('style').forEach(s => s.remove());
    // Alerte : une appréciation forte compte comme significative.
    document.getElementById('ef_leuco').value = 'Très nombreux'; interpretEtatFrais('leuco');
    const alerte = document.getElementById('ef_i_leuco').textContent;
    return { bact: await txt(51), eps: await txt(52), rai: await txt(53), quali: dq.textContent, alerte };
  });
  r.check('leucocytes « Rares » imprimés sans unité', /Leucocytes\s*Rares(?!\s*\/mm)/.test(cr.quali), true);
  r.check('hématies chiffrées gardent /mm³', /Hématies\s*3000\s*\/mm³/.test(cr.quali), true);
  r.check('« Très nombreux » → alerte leucocyturie', /Leucocyturie/.test(cr.alerte), true);
  r.check('ECBU : germe imprimé', /Escherichia coli/.test(cr.bact), true);
  r.check('ECBU : antibiogramme imprimé', /Ceftriaxone\s*Sensible/.test(cr.bact) && /Amoxicilline\s*Résistant/.test(cr.bact), true);
  r.check('ECBU : antibiotiques non testés absents', /Vancomycine/.test(cr.bact), false);
  r.check('ECBU : plus « Aucun résultat saisi »', /Aucun résultat saisi/.test(cr.bact), false);
  r.check('ECBU : libellés imprimés (pas les codes)', /Culture\s*Positive/.test(cr.bact) && /entérobactéries/.test(cr.bact) && !/bac_G/.test(cr.bact), true);
  r.check('EPS : Ascaris imprimé', /Ascaris lumbricoides\s*Positif/.test(cr.eps), true);
  r.check('RAI imprimée', /RAI[^]*Négative/.test(cr.rai), true);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 4));
  await ctx.close(); srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
