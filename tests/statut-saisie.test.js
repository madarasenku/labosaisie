// ✅ v13.210 — Statut de saisie automatique affiché sur la liste des patients :
// pas commencé (résultats non saisis) · en cours · terminé (rendu).
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve(8257);
  const r = createReporter('STATUT DE SAISIE (LISTE DES PATIENTS)');
  const { ctx, page, errors } = await openApp({ role: 'admin', username: 'admin', port: 8257 });

  const res = await page.evaluate(() => {
    _dbCache = [
      { id: 91, patient: { nom: 'RECEPTION', statut: 'attente' }, resultats: { _reception_seule: true } },
      { id: 92, patient: { nom: 'FACTURE',   statut: 'attente' }, resultats: { _facture_seule: true } },
      { id: 93, patient: { nom: 'ENCOURS',   statut: 'attente' }, resultats: { 'Hématologie': { x: 1 } } },
      { id: 94, patient: { nom: 'RENDU',     statut: 'rendu'   }, resultats: { 'Hématologie': { x: 1 } } },
    ];
    const S = id => saisieStatutAuto(_dbCache.find(r => r.id === id));
    const badge = id => saisieStatutBadge(_dbCache.find(r => r.id === id));
    return {
      reception: S(91), facture: S(92), encours: S(93), rendu: S(94),
      bReception: badge(91), bEncours: badge(93), bRendu: badge(94),
    };
  });

  r.section('États calculés');
  r.check('réception seule → pas commencé', res.reception, 'pas_commence');
  r.check('facture seule (pas de résultat) → pas commencé', res.facture, 'pas_commence');
  r.check('résultats saisis, non rendu → en cours', res.encours, 'en_cours');
  r.check('statut rendu → terminé', res.rendu, 'termine');

  r.section('Libellés des badges');
  r.check('badge « Pas commencé »', /Pas commencé/.test(res.bReception), true);
  r.check('badge « En cours »', /En cours/.test(res.bEncours), true);
  r.check('badge « Terminé »', /Terminé/.test(res.bRendu), true);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 5));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
