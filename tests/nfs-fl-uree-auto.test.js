// ✅ v13.151 — Automatismes de saisie demandés :
//   • NFS : Basophiles = 0 ; Éosinophiles = 100 − (Neutro + Lympho + Mono).
//   • Biochimie : Urée (g/L) = Créatinine (mg/L) / 44, partout (formulaire).
const { serve, openApp, createReporter, setField } = require('./helpers');

(async () => {
  const r = createReporter('SAISIE — FORMULE LEUCOCYTAIRE AUTO + URÉE = CRÉAT/44');
  const srv = await serve(8152);
  let ctx;
  try {
    const app = await openApp({
      role: 'admin', port: 8152,
      rpc: { get_next_dossier_num: '0500-0906', insert_resultat: { id: 700, dossier: '0500-0906' } },
    });
    ctx = app.ctx;
    const { page, errors } = app;

    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(400);
    await setField(page, 'p_nom', 'AUTO CALC');
    await page.evaluate(() => {
      ['ex_nfs', 'ex_crea', 'ex_uree'].forEach(id => { const c = document.getElementById(id); if (c) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } });
      if (typeof calcFicheTotal === 'function') calcFicheTotal();
    });
    await page.evaluate(() => window.demarrerSaisie());
    await page.waitForTimeout(500);

    r.section('Formule leucocytaire : baso=0, éosino=reste');
    // Saisir GB + neutro/lympho/mono, en déclenchant l'événement input.
    await page.evaluate(() => {
      const inp = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } };
      inp('v_gbc', '8'); inp('v_pnn', '55'); inp('v_lymp', '35'); inp('v_mono', '7');
    });
    await page.waitForTimeout(200);
    const fl = await page.evaluate(() => ({
      pnb: document.getElementById('v_pnb')?.value,
      pne: document.getElementById('v_pne')?.value,
      pnbRO: !!document.getElementById('v_pnb')?.readOnly,
      pneRO: !!document.getElementById('v_pne')?.readOnly,
    }));
    r.check('basophiles = 0', fl.pnb, '0');
    r.check('éosinophiles = 100-(55+35+7)=3', fl.pne, '3');
    r.check('champ basophiles en lecture seule', fl.pnbRO, true);
    r.check('champ éosinophiles en lecture seule', fl.pneRO, true);

    r.section('Urée = créatinine / 44 (formulaire)');
    await page.evaluate(() => {
      const e = document.getElementById('v_crea'); if (e) { e.value = '8.8'; e.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.waitForTimeout(200);
    const uree = await page.evaluate(() => document.getElementById('v_uree')?.value);
    r.check('urée = 8.8/44 = 0.20', uree, (8.8 / 44).toFixed(2));

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();
