// ✅ v13.117 — PAILLASSE : plusieurs dossiers ouverts simultanément.
//
// Demande : « ouvrir plusieurs dossiers en même temps et remplir au fur et à
// mesure ». On vérifie qu'on peut ouvrir un patient A, en ajouter un second B,
// basculer de l'un à l'autre SANS perdre les valeurs déjà saisies, puis
// enregistrer B (un seul insert) tout en gardant A ouvert dans la paillasse.
const { serve, openApp, createReporter, setField } = require('./helpers');

(async () => {
  const r = createReporter('PAILLASSE — MULTI-DOSSIERS OUVERTS');
  const srv = await serve(8109);
  const appels = [];
  let ctx;
  try {
    const app = await openApp({
      role: 'admin', port: 8109, appels,
      rpc: { get_next_dossier_num: '0400-0826', insert_resultat: { id: 500, dossier: '0400-0826' } },
    });
    ctx = app.ctx;
    const { page, errors } = app;

    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(400);

    // ── Patient A : nom + NFS cochée + une valeur (GB) ──
    r.section('Ouvrir patient A');
    await setField(page, 'p_nom', 'PATIENT A');
    await page.evaluate(() => { const c = document.getElementById('ex_nfs'); if (c) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } if (typeof calcFicheTotal === 'function') calcFicheTotal(); });
    await page.evaluate(() => window.demarrerSaisie());
    await page.waitForTimeout(500);
    await setField(page, 'v_gbc', '7.5');
    const apresA = await page.evaluate(() => ({
      barVisible: document.getElementById('paillasse-bar').style.display !== 'none',
      chips: document.querySelectorAll('#paillasse-chips > span').length,
    }));
    r.check('barre paillasse visible', apresA.barVisible, true);
    r.check('1 patient ouvert', apresA.chips, 1);

    // ── Ajouter patient B ──
    r.section('Ajouter patient B');
    await page.evaluate(() => window.benchNewPatient());
    await page.waitForTimeout(400);
    await setField(page, 'p_nom', 'PATIENT B');
    await page.evaluate(() => { const c = document.getElementById('ex_nfs'); if (c) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } if (typeof calcFicheTotal === 'function') calcFicheTotal(); });
    await page.evaluate(() => window.demarrerSaisie());
    await page.waitForTimeout(500);
    await setField(page, 'v_gbc', '9.1');
    const apresB = await page.evaluate(() => ({
      chips: document.querySelectorAll('#paillasse-chips > span').length,
      dossierB: document.getElementById('p_dossier').value,
    }));
    r.check('2 patients ouverts', apresB.chips, 2);

    // ── Revenir sur A : la valeur GB doit être conservée ──
    r.section('Basculer A ⇄ B sans perte');
    const keys = await page.evaluate(() => _bench.map(e => ({ key: e.key, label: e.label })));
    const keyA = keys.find(k => k.label === 'PATIENT A').key;
    const keyB = keys.find(k => k.label === 'PATIENT B').key;
    await page.evaluate((k) => window.benchGo(k), keyA);
    await page.waitForTimeout(500);
    const surA = await page.evaluate(() => ({
      nom: document.getElementById('p_nom').value,
      gb: document.getElementById('v_gbc')?.value,
    }));
    r.check('A rechargé : nom', surA.nom, 'PATIENT A');
    r.check('A rechargé : GB conservé', surA.gb, '7.5');

    // Les deux patients doivent avoir des numéros de dossier DIFFÉRENTS.
    const dossiers = await page.evaluate(() => _bench.map(e => e.ident.p_dossier));
    r.check('numéros de dossier distincts', new Set(dossiers).size, 2);

    // ── Revenir sur B et enregistrer ──
    r.section('Enregistrer B, garder A ouvert');
    await page.evaluate((k) => window.benchGo(k), keyB);
    await page.waitForTimeout(500);
    const surB = await page.evaluate(() => document.getElementById('v_gbc')?.value);
    r.check('B rechargé : GB conservé', surB, '9.1');

    await page.evaluate(() => window.saveAllTabs());
    await page.waitForTimeout(900);
    const nbInsert = appels.filter(f => f === 'insert_resultat').length;
    const restant = await page.evaluate(() => ({
      chips: document.querySelectorAll('#paillasse-chips > span').length,
      labels: _bench.map(e => e.label),
    }));
    r.check('un seul insert émis', nbInsert, 1);
    r.check('A reste ouvert après save de B', restant.chips, 1);
    r.check('c\'est bien A qui reste', restant.labels.join(','), 'PATIENT A');
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
