// Clôture de caisse quotidienne (v13.84).
//
// Ce document est signé par le caissier et par le responsable, et il sert de
// pièce en cas de contrôle. Deux exigences en découlent, et ce sont elles
// que ces contrôles verrouillent :
//
//   1. la recette annoncée ne doit JAMAIS être plus grosse que ce qui est
//      réellement dans le tiroir — les dossiers verrouillés, exclus de tous
//      les calculs de l'application, sont donc hors recette ;
//   2. ce qui cloche se voit — monnaie non rendue et dossiers non encaissés
//      s'impriment même à zéro, sinon une rubrique qui n'apparaît que
//      lorsqu'elle est mauvaise se lit comme une accusation et on cesse de
//      l'imprimer.
const { serve, openApp, createReporter } = require('./helpers');

// Dates relatives — voir tests/README.md, jamais de date en dur.
const p = n => String(n).padStart(2, '0');
const jourLocal = d => d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
const AUJ = jourLocal(new Date());

// Jeu taillé pour que chaque rubrique ait une valeur distincte : si deux
// totaux se ressemblent, un calcul faux peut passer pour juste.
const paiement = (montant, agent, extra) => Object.assign({
  montant_demande: montant, montant_recu: montant, monnaie: 0,
  monnaie_rendue: 0, monnaie_remise: true, agent,
}, extra || {});

const FICHES = [
  // Encaissés du jour, deux agents distincts : 3 000 + 5 000 = 8 000 pour
  // nadia, 2 000 pour YERIGUE → recette visible 10 000.
  { id: 1, type: 'Hématologie', montant: 3000, created_at: AUJ + 'T08:00:00Z', created_by: 'nadia',
    patient: { nom: 'KOUAME AYA', dossier: 'D1', date: AUJ, statut: 'rendu',
               paiement_status: 'paye', paiement_infos: paiement(3000, 'nadia') },
    resultats: {}, prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null },
  { id: 2, type: 'Biochimie', montant: 5000, created_at: AUJ + 'T09:00:00Z', created_by: 'nadia',
    patient: { nom: 'BAMBA SALIF', dossier: 'D2', date: AUJ, statut: 'rendu',
               paiement_status: 'paye', paiement_infos: paiement(5000, 'nadia') },
    resultats: {}, prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null },
  { id: 3, type: 'Hématologie', montant: 2000, created_at: AUJ + 'T10:00:00Z', created_by: 'YERIGUE',
    patient: { nom: 'YAO KOFFI', dossier: 'D3', date: AUJ, statut: 'rendu',
               paiement_status: 'paye', paiement_infos: paiement(2000, 'YERIGUE') },
    resultats: {}, prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null },
  // Non encaissé du jour → 7 000, doit être signalé, hors recette.
  { id: 4, type: 'Parasitologie', montant: 7000, created_at: AUJ + 'T11:00:00Z', created_by: 'nadia',
    patient: { nom: 'DIALLO FATOU', dossier: 'D4', date: AUJ },
    resultats: {}, prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null },
  // Verrouillé → 40 000, encaissé mais HORS recette.
  { id: 5, type: 'Biochimie', montant: 40000, created_at: AUJ + 'T12:00:00Z', created_by: 'nadia',
    patient: { nom: 'TRAORE MOUSSA', dossier: 'D5', date: AUJ, paiement_status: 'paye',
               paiement_infos: paiement(40000, 'nadia') },
    resultats: {}, prescripteur_id: 1, est_bpn: false, restricted_by: 'admin', deleted_at: null },
  // Monnaie promise et non rendue → 1 500.
  { id: 6, type: 'Hématologie', montant: 4000, created_at: AUJ + 'T13:00:00Z', created_by: 'YERIGUE',
    patient: { nom: 'KEITA SALY', dossier: 'D6', date: AUJ, paiement_status: 'paye',
               paiement_infos: paiement(4000, 'YERIGUE',
                 { montant_recu: 5500, monnaie: 1500, monnaie_remise: false }) },
    resultats: {}, prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null },
  // Un bilan prénatal : forfait unique qui coche cinq catégories. Il doit
  // s'imprimer « BPN », pas la liste des cinq.
  { id: 8, type: 'Dossier', montant: 10000, created_at: AUJ + 'T15:00:00Z', created_by: 'nadia',
    patient: { nom: 'SANKARA AWA', dossier: 'D8', date: AUJ, age: 27, medecin: 'SFDE YAPI',
               paiement_status: 'paye', paiement_infos: paiement(10000, 'nadia') },
    resultats: { _types: ['Hématologie','Groupe sanguin','Immuno-Sérologie','Biochimie','Bactériologie'],
                 _examens_coches: { 'Hématologie': ['Bilan prénatal complet (forfait)'] } },
    prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null },
  // Un BPN EXTERNE : facturé 20 000, il RESTE dans la recette. C'est lui qui
  // vérifie l'affichage « BPN » sans se confondre avec la sortie de recette.
  { id: 9, type: 'Dossier', montant: 20000, created_at: AUJ + 'T16:00:00Z', created_by: 'nadia',
    patient: { nom: 'DIABATE AWA', dossier: 'D9', date: AUJ, age: 31, medecin: 'EXTERNE',
               paiement_status: 'paye', paiement_infos: paiement(20000, 'nadia') },
    resultats: { _types: ['Hématologie','Groupe sanguin','Immuno-Sérologie','Biochimie','Bactériologie'],
                 _examens_coches: { 'Hématologie': ['Bilan prénatal complet (forfait)'] } },
    prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null },
  // Une régularisation : encaissée, mais pas de l'argent entré aujourd'hui.
  { id: 7, type: 'Biochimie', montant: 6000, created_at: AUJ + 'T14:00:00Z', created_by: 'nadia',
    patient: { nom: 'BORE ISSA', dossier: 'D7', date: AUJ, paiement_status: 'paye',
               paiement_infos: paiement(6000, 'admin', { regularisation: true }) },
    resultats: {}, prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null },
];

// Recette attendue = payés, NON verrouillés, HORS cahier jaune :
// 3000+5000+2000+4000+6000 + 20000 (BPN externe). Le BPN interne (10 000)
// en sort : il revient au personnel.
const RECETTE = 40000;

(async () => {
  const srv = await serve();
  const r = createReporter('CLÔTURE DE CAISSE');

  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [], get_resultats_light: FICHES,
        // refreshDB écrase restrictedBy avec ce RPC dédié : sans lui, la
        // fiche verrouillée du jeu d'essai redeviendrait visible et le
        // contrôle « hors recette » ne testerait plus rien.
        get_restriction_status: [{ id: 5, restricted_by: 'admin' }] },
    });
    r.section('Calcul de la journée');
    const c = await page.evaluate(j => calculerCloture(j), AUJ);

    r.check('recette du jour', c.total, RECETTE);
    r.check('dossiers encaissés', c.dossiers, 6);
    // Le point qui compte : les 40 000 verrouillés ne gonflent pas la recette.
    // On vérifie l'absence de la fiche elle-même, pas une inégalité sur le
    // total : une comparaison « < 40000 » devient fausse dès que la recette
    // atteint ce montant par ailleurs, et le contrôle se met à mentir.
    r.check('le verrouillé est hors recette',
            c.detail.some(d => d.dossier === 'D5'), false);
    r.check('mais il est compté à part', c.totalVerrouille, 40000);
    r.check('et dénombré', c.verrouilles, 1);
    r.check('non encaissé signalé', c.totalImpaye, 7000);
    r.check('monnaie due signalée', c.totalMonnaieDue, 1500);
    r.check('régularisation isolée', c.totalRegularise, 6000);

    r.section('Responsabilité par agent');
    r.check('nadia', c.parAgent.nadia && c.parAgent.nadia.total, 28000);
    r.check('YERIGUE', c.parAgent.YERIGUE && c.parAgent.YERIGUE.total, 6000);
    // La régularisation est portée par qui l'a faite, pas par le caissier
    // du jour : c'est admin qui doit en répondre.
    r.check('la régularisation est au nom de l\'admin',
            c.parAgent.admin && c.parAgent.admin.total, 6000);
    r.check('somme des agents = recette',
            Object.values(c.parAgent).reduce((t, v) => t + v.total, 0), RECETTE);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));

    r.section('Détail nominatif et forfait prénatal');
    r.check('une ligne par encaissement', c.detail.length, 6);
    const bpn = c.detail.find(d => d.dossier === 'D9');
    r.check('le patient est nommé', bpn && bpn.nom, 'DIABATE AWA');
    r.check('son âge y est', bpn && bpn.age, '31');
    r.check('son prescripteur aussi', bpn && bpn.prescripteur, 'EXTERNE');
    r.check('la somme payée aussi', bpn && bpn.montant, 20000);

    // Le BPN INTERNE sort de la recette : il revient au personnel.
    r.check('le BPN interne est hors recette',
            c.detail.some(d => d.dossier === 'D8'), false);
    r.check('mais compté au cahier jaune', c.totalCahierJaune, 10000);
    r.check('et dénombré', c.cahierJaune, 1);
    // Le point demandé : un forfait prénatal s'annonce « BPN », pas par les
    // cinq catégories qu'il coche mécaniquement.
    r.check('le forfait prénatal s\'affiche BPN', bpn && bpn.examens, 'BPN');
    const ordinaire = c.detail.find(d => d.dossier === 'D1');
    r.check('un dossier ordinaire garde son détail',
            ordinaire && /Hématologie/.test(ordinaire.examens), true);

    r.section('Document imprimé');
    const doc = await page.evaluate(() => {
      const vraiPrint = window.print;
      window.print = () => {};
      imprimerCloture();
      window.print = vraiPrint;
      return document.getElementById('print-render').innerHTML;
    });
    // \s couvre l'espace insécable étroite (U+202F) que fr-FR utilise comme
    // séparateur de milliers : chercher une espace ordinaire échouait alors
    // que le document était parfaitement juste.
    r.check('la recette y figure', /40\s?000\s?FCFA/.test(doc), true);
    r.check('titre de clôture', /CL[ÔO]TURE DE CAISSE/.test(doc), true);
    r.check('les deux signatures sont prévues',
            /Le caissier/.test(doc) && /Le responsable/.test(doc), true);
    // Le montant verrouillé doit apparaître, mais expliqué comme hors recette.
    r.check('le verrouillé est expliqué', /40\s?000\s?FCFA/.test(doc), true);
    r.check('et présenté hors recette', /[Hh]ors recette/.test(doc), true);
    r.check('la régularisation est signalée', /r[ée]gularisation/i.test(doc), true);
    r.check('l\'auteur de l\'édition est nommé', /admin1/.test(doc), true);
    r.check('le détail nominatif est imprimé', /D[ée]tail des encaissements/.test(doc), true);
    r.check('avec le nom du patient', /DIABATE AWA/.test(doc), true);
    r.check('le cahier jaune est expliqué', /cahier jaune/i.test(doc), true);
    r.check('et le BPN interne n\'est pas dans le détail',
            !/SANKARA AWA/.test(doc), true);
    r.check('et « BPN » plutôt que les cinq analyses',
            /BPN/.test(doc) && !/Bact[ée]riologie/.test(doc), true);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  // ── Une journée parfaite doit rester rassurante, pas muette ────────
  {
    const PROPRE = FICHES.filter(f => [1, 2, 3].includes(f.id));
    const { ctx, page, errors } = await openApp({
      role: 'caissier', username: 'caisse1', userId: 6,
      rpc: { get_tarifs: {}, get_examens_custom: [], get_resultats_light: PROPRE },
    });
    r.section('Journée sans anomalie');
    const c = await page.evaluate(j => calculerCloture(j), AUJ);
    r.check('recette', c.total, 10000);
    r.check('aucun impayé', c.impayes.length, 0);
    r.check('aucune monnaie due', c.monnaieDue.length, 0);

    const doc = await page.evaluate(() => {
      const vp = window.print; window.print = () => {};
      imprimerCloture(); window.print = vp;
      return document.getElementById('print-render').innerHTML;
    });
    // Les rubriques s'impriment même vides : une rubrique qui n'apparaît que
    // lorsqu'elle est mauvaise se lit comme une accusation.
    r.check('la rubrique monnaie est imprimée quand même',
            /Monnaie promise et non rendue/.test(doc), true);
    r.check('et dit explicitement que tout va bien',
            /tout a été rendu/.test(doc), true);
    r.check('la rubrique impayés est imprimée quand même',
            /Dossiers non encaissés/.test(doc), true);
    r.check('aucune mention de dossiers verrouillés',
            /Hors recette/.test(doc), false);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  // ── Une journée sans activité ne doit pas casser ───────────────────
  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {}, get_examens_custom: [], get_resultats_light: FICHES,
        // refreshDB écrase restrictedBy avec ce RPC dédié : sans lui, la
        // fiche verrouillée du jeu d'essai redeviendrait visible et le
        // contrôle « hors recette » ne testerait plus rien.
        get_restriction_status: [{ id: 5, restricted_by: 'admin' }] },
    });
    r.section('Journée vide');
    const c = await page.evaluate(() => calculerCloture('2019-01-01'));
    r.check('recette nulle', c.total, 0);
    r.check('aucun dossier', c.dossiers, 0);
    const doc = await page.evaluate(() => {
      document.getElementById('cloture-date').value = '2019-01-01';
      const vp = window.print; window.print = () => {};
      imprimerCloture(); window.print = vp;
      return document.getElementById('print-render').innerHTML;
    });
    r.check('le document se produit quand même', doc.length > 500, true);
    r.check('recette à zéro affichée', /0 FCFA/.test(doc), true);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));
    await ctx.close();
  }

  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();
