// ✅ v13.129 — Enregistrer une fiche datée d'un jour verrouillé : le serveur
// refuse (trigger). L'app ne doit PAS annoncer « enregistré » et doit prévenir.
const { serve, openApp, createReporter, setField } = require('./helpers');

(async () => {
  const r = createReporter('ENREGISTREMENT — JOUR VERROUILLÉ');
  const srv = await serve(8121);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8121, rpc: { get_next_dossier_num: '0500-0826' } });
    ctx = app.ctx;
    const { page, errors } = app;

    await page.evaluate(() => {
      window.__toasts = [];
      const vrai = window.toast; window.toast = (m, t) => { window.__toasts.push(m); };
      _sb.rpc = async (nom) => {
        if (nom === 'get_resultats_light') return { data: [], error: null };
        if (nom === 'get_next_dossier_num') return { data: '0500-0826', error: null };
        // Le serveur (trigger) refuse toute écriture sur un jour verrouillé :
        if (nom === 'insert_resultat') return { data: null, error: { message: 'journee_verrouillee' } };
        return { data: [], error: null };
      };
    });

    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(300);
    await setField(page, 'p_nom', 'PATIENT VENDREDI');
    await setField(page, 'p_date', '2026-08-21'); // vendredi verrouillé
    await page.evaluate(() => { const c = document.getElementById('ex_nfs'); if (c) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } if (typeof calcFicheTotal === 'function') calcFicheTotal(); });

    await page.evaluate(() => enregistrerFicheIdentif());
    await page.waitForTimeout(800);

    const t = await page.evaluate(() => window.__toasts);
    const okMsg = t.some(m => /enregistr/i.test(m) && !/verrou/i.test(m));
    const lockMsg = t.some(m => /verrouill/i.test(m));
    r.check('AUCUN message « enregistré » trompeur', okMsg, false);
    r.check('message « journée verrouillée » affiché', lockMsg, true);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));
    console.log('   toasts:', JSON.stringify(t));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();
