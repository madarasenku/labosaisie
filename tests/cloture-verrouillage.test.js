// ✅ v13.127 — Verrouillage des journées (gel des sommes).
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const r = createReporter('CLÔTURE — VERROUILLAGE DE LA JOURNÉE');
  const srv = await serve(8119);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8119 });
    ctx = app.ctx;
    const { page, errors } = app;
    // Serveur simulé : un ensemble de jours verrouillés, avec règles de rôle.
    await page.evaluate(() => {
      window.__locked = new Set();
      window.showConfirmModal = async () => true;
      _sb.rpc = async (nom, params) => {
        if (nom === 'list_clotures') return { data: [...window.__locked].map(j => ({ jour: j, verrouille_par: 'x', verrouille_le: 'x' })), error: null };
        if (nom === 'verrouiller_journee') { window.__locked.add(params.p_jour); return { data: 'ok', error: null }; }
        if (nom === 'deverrouiller_journee') {
          // admin only (le test simule un admin) :
          window.__locked.delete(params.p_jour); return { data: 'ok', error: null };
        }
        if (nom === 'get_resultats_light') return { data: [], error: null };
        if (nom === 'get_restriction_status') return { data: [], error: null };
        return { data: [], error: null };
      };
    });

    r.section('Détection de l\'erreur serveur');
    const det = await page.evaluate(() => [
      estJourVerrouille({ message: 'journee_verrouillee' }),
      estJourVerrouille({ message: 'autre erreur' }),
      estJourVerrouille('quelque chose journee_verrouillee ici'),
    ]);
    r.check('détecte le message du trigger', det[0], true);
    r.check('ignore les autres erreurs', det[1], false);
    r.check('détecte dans une chaîne', det[2], true);

    r.section('Verrouiller / déverrouiller');
    await page.evaluate(() => chargerClotures());
    await page.waitForTimeout(150);
    r.check('aucune journée verrouillée au départ', await page.evaluate(() => jourVerrouille('2026-08-23')), false);

    await page.evaluate(() => { showView('caisse'); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { const c = document.getElementById('cloture-date'); if (c) c.value = '2026-08-23'; });
    await page.evaluate(() => verrouillerJournee());
    await page.waitForTimeout(400);
    r.check('journée verrouillée après action', await page.evaluate(() => jourVerrouille('2026-08-23')), true);
    r.check('RPC verrouiller appelé', await page.evaluate(() => window.__locked.has('2026-08-23')), true);

    await page.evaluate(() => deverrouillerJournee());
    await page.waitForTimeout(400);
    r.check('journée déverrouillée', await page.evaluate(() => jourVerrouille('2026-08-23')), false);

    r.section('Un agent ne peut pas déverrouiller');
    const agentBlocked = await page.evaluate(async () => {
      _currentUser.role = 'agent';
      let captured = '';
      const vrai = window.toast; window.toast = m => { captured = m; };
      window.__locked.add('2026-08-23');
      await deverrouillerJournee();      // doit refuser côté client (isAdmin false)
      window.toast = vrai;
      return { captured, encoreVerrou: window.__locked.has('2026-08-23') };
    });
    r.check('refus déverrouillage agent', /administrateur/i.test(agentBlocked.captured), true);
    r.check('journée reste verrouillée', agentBlocked.encoreVerrou, true);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();
