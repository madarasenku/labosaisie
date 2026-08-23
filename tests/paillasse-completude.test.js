// ✅ v13.117 — PAILLASSE : signal « tout est rempli, prêt à enregistrer/imprimer ».
//
// Demande : « quand un dossier est fini, tu me fais un signe pour dire que tout
// est rempli et prêt à enregistrer et imprimer ». On vérifie qu'un patient
// dont la NFS est partiellement remplie n'est PAS marqué prêt, et que dès que
// tous les champs attendus sont saisis la pastille passe au vert (✓), la
// bannière annonce « prêt » et le bouton « Enregistrer + Imprimer » apparaît.
const { serve, openApp, createReporter, setField } = require('./helpers');

const NFS_REQ = ['v_gbc','v_gr','v_hb','v_ht','v_plt','v_pnn','v_pne','v_pnb','v_lymp','v_mono'];

(async () => {
  const r = createReporter('PAILLASSE — SIGNAL « PRÊT »');
  const srv = await serve(8110);
  let ctx;
  try {
    const app = await openApp({
      role: 'admin', port: 8110,
      rpc: { get_next_dossier_num: '0410-0826', insert_resultat: { id: 600, dossier: '0410-0826' } },
    });
    ctx = app.ctx;
    const { page, errors } = app;

    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(400);

    r.section('Patient avec NFS, résultats incomplets');
    await setField(page, 'p_nom', 'PATIENT PRET');
    await page.evaluate(() => { const c = document.getElementById('ex_nfs'); if (c) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } if (typeof calcFicheTotal === 'function') calcFicheTotal(); });
    await page.evaluate(() => window.demarrerSaisie());
    await page.waitForTimeout(500);

    // Remplir seulement 3 champs sur 10.
    for (const id of ['v_gbc','v_gr','v_hb']) await setField(page, id, '5');
    await page.waitForTimeout(300);
    const partiel = await page.evaluate(() => ({
      complete: _completionActive().complete,
      printVisible: (() => { const b = document.getElementById('btn-save-print'); return !!(b && b.style.display !== 'none'); })(),
      chipVert: /15803d|dcfce7/.test(document.getElementById('paillasse-chips').innerHTML),
    }));
    r.check('incomplet : pas marqué prêt', partiel.complete, false);
    r.check('incomplet : bouton Imprimer masqué', partiel.printVisible, false);
    r.check('incomplet : pastille non verte', partiel.chipVert, false);

    r.section('Tous les champs NFS remplis');
    for (const id of NFS_REQ) await setField(page, id, id === 'v_pnb' ? '0' : '5');
    await page.waitForTimeout(300);
    const complet = await page.evaluate(() => ({
      complete: _completionActive().complete,
      printVisible: (() => { const b = document.getElementById('btn-save-print'); return !!(b && b.style.display !== 'none'); })(),
      hint: document.getElementById('save-all-hint').textContent + document.getElementById('save-all-hint').innerHTML,
      chipVert: /15803d|dcfce7/.test(document.getElementById('paillasse-chips').innerHTML),
      chipCheck: document.getElementById('paillasse-chips').textContent.includes('✓'),
    }));
    r.check('complet : marqué prêt', complet.complete, true);
    r.check('complet : bouton « Enregistrer + Imprimer » visible', complet.printVisible, true);
    r.check('complet : bannière « prêt »', /prêt|rempli/i.test(complet.hint), true);
    r.check('complet : pastille verte', complet.chipVert, true);
    r.check('complet : coche ✓ sur la pastille', complet.chipCheck, true);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 3));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (ctx) await ctx.close();
    srv.close();
  }
})();
