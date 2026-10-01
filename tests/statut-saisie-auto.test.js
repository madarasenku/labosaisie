// ✅ v13.212 — Statut de saisie AUTOMATIQUE : à l'enregistrement, si tous les
// examens demandés sont remplis, le dossier passe « rendu » (Terminé) sans
// marquage manuel. Sinon il reste « en cours ».
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve(8273);
  const r = createReporter('STATUT DE SAISIE — AUTOMATIQUE');
  const { ctx, page, errors } = await openApp({ role: 'admin', username: 'admin', port: 8273 });

  // ── Dossier complet → rendu automatique ─────────────────────────────
  const complet = await page.evaluate(async () => {
    window.__calls = [];
    _sb.rpc = async (n, p) => { window.__calls.push({ n, p }); return { data: {}, error: null }; };
    window._completionActive = () => ({ complete: true, req: 3, ok: 3 });
    _dbCache = [{ id: 1, patient: { nom: 'A', statut: 'attente' }, resultats: { _facture_seule: false } }];
    await _autoStatutApresSave(1);
    const call = window.__calls.find(c => c.n === 'set_dossier_statut');
    return {
      rpc: call && call.p.p_statut,
      cache: _dbCache[0].patient.statut,
      auto: saisieStatutAuto(_dbCache[0]),
    };
  });
  r.section('Dossier complet');
  r.check('RPC set_dossier_statut = rendu', complet.rpc, 'rendu');
  r.check('cache statut = rendu', complet.cache, 'rendu');
  r.check('badge auto = terminé', complet.auto, 'termine');

  // ── Dossier partiel → reste en cours (aucun marquage) ───────────────
  const partiel = await page.evaluate(async () => {
    window.__calls = [];
    _sb.rpc = async (n, p) => { window.__calls.push({ n, p }); return { data: {}, error: null }; };
    window._completionActive = () => ({ complete: false, req: 3, ok: 1 });
    _dbCache = [{ id: 2, patient: { nom: 'B', statut: 'attente' }, resultats: { _facture_seule: false } }];
    await _autoStatutApresSave(2);
    const call = window.__calls.find(c => c.n === 'set_dossier_statut');
    return { rpcAppele: !!call, cache: _dbCache[0].patient.statut, auto: saisieStatutAuto(_dbCache[0]) };
  });
  r.section('Dossier partiel');
  r.check('aucun marquage rendu', partiel.rpcAppele, false);
  r.check('statut inchangé (attente)', partiel.cache, 'attente');
  r.check('badge auto = en cours (a des résultats)', partiel.auto, 'en_cours');

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 5));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
