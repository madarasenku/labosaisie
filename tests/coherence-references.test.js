// Cohérence de l'éditeur des VALEURS DE RÉFÉRENCE avec le reste du site.
//
// L'écran « Valeurs de référence » (buildRefsEditor) possède sa propre liste
// de ~90 paramètres. Chaque ligne y est identifiée par un `id` qui sert de clé
// à getRef(id). Si cet id ne correspond à AUCUN paramètre réel du site, on
// affiche un « examen sans réplique » : l'utilisateur peut régler une valeur
// qui ne pilotera jamais rien.
//
// Ce test lit les identifiants de l'éditeur directement dans la source, puis
// les confronte aux listes canoniques chargées dans le navigateur
// (HEMA_PARAMS, BIO_*, EPHB_FRACTIONS, SERO_TESTS, WIDAL_ANTIGENES, BPN_*).
// Il échoue si un identifiant de référence n'a de réplique nulle part, ou si
// un antigène de Widal / un test sérologique quantitatif n'a pas sa ligne.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve();
  const r = createReporter('COHÉRENCE DES VALEURS DE RÉFÉRENCE');

  const { ctx, page, errors } = await openApp({ role: 'admin',
    rpc: { get_tarifs: {}, get_examens_custom: [] } });

  const res = await page.evaluate(() => {
    // ✅ v13.101 — les lignes de l'éditeur sont DÉRIVÉES des listes canoniques :
    // on lit donc les identifiants au runtime via refsSections().
    const refIds = (typeof refsSections === 'function')
      ? refsSections().flatMap(s => s.params.map(p => p.id)) : [];
    // Ensemble des clés de référence RÉELLES du site (celles que getRef(id)
    // peut effectivement piloter), reconstruit depuis les listes canoniques.
    const K = new Set();
    const add = a => (a || []).forEach(p => K.add(p.id));
    add(typeof HEMA_PARAMS !== 'undefined' && HEMA_PARAMS);
    add(typeof HEMA_FL !== 'undefined' && HEMA_FL);
    add(typeof EPHB_FRACTIONS !== 'undefined' && EPHB_FRACTIONS);
    ['BIO_GLUCIDES','BIO_REIN','BIO_FOIE','BIO_LIPIDES','BIO_IONO','BIO_FER',
     'BIO_CARD','BIO_HORM','BIO_COAG','BIO_AUTRE',
     'BPN_NFS','BPN_FL','BPN_BIO','BPN_SERO'].forEach(n => {
       try { add(eval(n)); } catch (e) {} });
    (typeof SERO_TESTS !== 'undefined' ? SERO_TESTS : [])
      .forEach(t => { if (t.type === 'quant') K.add('sero_' + t.id); });
    (typeof WIDAL_ANTIGENES !== 'undefined' ? WIDAL_ANTIGENES : [])
      .forEach(a => K.add('widal_' + a.id));

    const orphelins = refIds.filter(id => !K.has(id));

    const refSet = new Set(refIds);
    const widalManquants = (typeof WIDAL_ANTIGENES !== 'undefined' ? WIDAL_ANTIGENES : [])
      .map(a => 'widal_' + a.id).filter(k => !refSet.has(k));
    const seroQuantManquants = (typeof SERO_TESTS !== 'undefined' ? SERO_TESTS : [])
      .filter(t => t.type === 'quant').map(t => 'sero_' + t.id).filter(k => !refSet.has(k));

    return { orphelins, widalManquants, seroQuantManquants, nbRefs: refIds.length };
  });

  r.section('Chaque valeur de référence a une réplique sur le site');
  r.check('des paramètres de référence sont chargés', res.nbRefs > 50, true);
  r.check('aucun paramètre de référence orphelin',
          res.orphelins.length ? res.orphelins.join(', ') : 'aucun', 'aucun');

  r.section('Aucune référence numérique ne manque');
  r.check('les 8 antigènes de Widal sont configurables',
          res.widalManquants.length ? res.widalManquants.join(', ') : 'aucun', 'aucun');
  r.check('tous les tests sérologiques quantitatifs ont leur ligne',
          res.seroQuantManquants.length ? res.seroQuantManquants.join(', ') : 'aucun', 'aucun');
  r.check('aucune erreur JS', errors.length, 0);
  await ctx.close();

  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
