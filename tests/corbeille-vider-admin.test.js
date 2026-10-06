// ✅ v13.230 — L'admin doit pouvoir VIDER LA CORBEILLE (suppression définitive).
//
// Bug : la RPC delete_resultat_admin renvoie du TEXTE ('ok' / 'forbidden') ;
// le client testait `data !== true` (booléen) et faisait donc passer TOUTE
// suppression définitive pour un échec (« Seul un administrateur peut
// supprimer »). Résultat : l'admin n'arrivait jamais à vider la corbeille.
// On vérifie que 'ok' = succès (fiche retirée / tracée) et 'forbidden' = refus.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve(8294);
  const r = createReporter('CORBEILLE — VIDER (ADMIN)');
  const { ctx, page, errors } = await openApp({ role: 'admin', username: 'admin', port: 8294,
    rpc: { get_tarifs: {}, get_examens_custom: [] } });

  // Succès : le serveur renvoie 'ok' (texte).
  const okCase = await page.evaluate(async () => {
    _dbCache = [{ id: 501, type: 'Dossier', patient: { nom: 'CORB UN', dossier: 'C1' },
                  resultats: {}, deletedAt: '2026-10-01T09:00:00Z', deletedBy: 'agent1' }];
    _sb.rpc = async (n) => (n === 'delete_resultat_admin') ? { data: 'ok', error: null } : { data: [], error: null };
    const res = await deleteRecordRemote(501);
    const rec = _dbCache.find(x => x.id === 501);
    return { res, trace: !!(rec && rec._hardDeleted) , removed: !rec };
  });
  r.section('Suppression définitive réussie (serveur = « ok »)');
  r.check('deleteRecordRemote renvoie true', okCase.res, true);
  r.check('fiche marquée supprimée (trace) ou retirée', okCase.trace || okCase.removed, true);

  // Refus : le serveur renvoie 'forbidden'.
  const koCase = await page.evaluate(async () => {
    _dbCache = [{ id: 502, type: 'Dossier', patient: { nom: 'CORB DEUX', dossier: 'C2' },
                  resultats: {}, deletedAt: '2026-10-01T09:00:00Z' }];
    _sb.rpc = async (n) => (n === 'delete_resultat_admin') ? { data: 'forbidden', error: null } : { data: [], error: null };
    const res = await deleteRecordRemote(502);
    const rec = _dbCache.find(x => x.id === 502);
    return { res, encorePresent: !!(rec && !rec._hardDeleted) };
  });
  r.section('Refus serveur (« forbidden »)');
  r.check('deleteRecordRemote renvoie false', koCase.res, false);
  r.check('fiche NON supprimée', koCase.encorePresent, true);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 4));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
