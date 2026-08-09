// Grille tarifaire partagée (v13.75).
//
// Avant : la grille modifiée par l'admin vivait dans le localStorage de
// chaque navigateur. Changer un prix sur un poste laissait les autres
// facturer l'ancien montant, sans aucun signal — deux guichets pouvaient
// encaisser des sommes différentes pour le même examen le même jour.
//
// Depuis : la grille est en base (get_tarifs / save_tarifs). Le localStorage
// ne sert plus que de cache hors-ligne.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve();
  const r = createReporter('TARIFS PARTAGÉS');

  // ── Une grille personnalisée en base doit primer sur le catalogue ──
  {
    // En base, la NFS est passée à 4 000 (le catalogue dit 3 000).
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: { ex_nfs: 4000 } },
    });

    r.section('La grille de la base prime sur le catalogue');
    r.check('prix catalogue de la NFS', await page.evaluate(
      () => CATALOGUE_EXAMENS.find(e => e.id === 'ex_nfs').prix), 3000);

    // chargerTarifsDepuisBase() est appelée à l'ouverture de session.
    await page.evaluate(() => chargerTarifsDepuisBase());
    await page.waitForTimeout(700);
    r.check('prix appliqué après chargement', await page.evaluate(
      () => prixExamen('ex_nfs')), 4000);

    r.check('les autres examens gardent le catalogue', await page.evaluate(
      () => prixExamen('ex_crp')), 3500);

    r.check('grille mise en cache local', await page.evaluate(
      () => { const g = JSON.parse(localStorage.getItem('tarifs_ref') || '{}');
              return g.ex_nfs; }), 4000);

    errors.length && console.log('   ', errors.slice(0, 3));
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── Grille vide en base : le catalogue fait foi ──
  {
    const { ctx, page, errors } = await openApp({
      role: 'admin', rpc: { get_tarifs: {} },
    });
    r.section('Grille vide en base → prix du catalogue');
    await page.evaluate(() => chargerTarifsDepuisBase());
    await page.waitForTimeout(700);
    for (const [id, prix] of [['ex_nfs', 3000], ['ex_crp', 3500],
                              ['ex_widal', 4500], ['ex_gs', 2000],
                              ['ex_ecbu', 10000], ['ex_vih', 2000]]) {
      r.check(`prix ${id}`, await page.evaluate(x => prixExamen(x), id), prix);
    }
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── Un agent ne doit pas pouvoir enregistrer une grille ──
  {
    const { ctx, page, errors } = await openApp({
      role: 'agent', username: 'agent1', userId: 2,
      rpc: { get_tarifs: {}, save_tarifs: 'forbidden' },
    });
    r.section('Seul un administrateur modifie les tarifs');
    const message = await page.evaluate(async () => {
      let capté = '';
      const vrai = window.toast;
      window.toast = (m) => { capté = m; };
      await saveTarifsRef({ ex_nfs: 999 });
      window.toast = vrai;
      return capté;
    });
    r.check('refus signalé à l\'utilisateur',
            /administrateur/i.test(message), true);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── Le calcul d'estimation s'appuie sur le catalogue ──
  {
    const { ctx, page, errors } = await openApp({ role: 'admin', rpc: { get_tarifs: {} } });
    r.section('Estimation d\'un dossier (calculateMontant)');
    r.check('NFS + Goutte épaisse', await page.evaluate(() => calculateMontant('Hématologie', {
      _examens_coches: { 'Hématologie': ['NFS — Numération Formule Sanguine',
                                          'Goutte épaisse / TDR Paludisme'] },
    })), 3000);   // NFS 3000 + GE 0
    r.check('CRP seule', await page.evaluate(() => calculateMontant('Immuno-Sérologie', {
      _examens_coches: { 'Immuno-Sérologie': ['CRP — Protéine C-réactive'] },
    })), 3500);
    r.check('CRP + Widal', await page.evaluate(() => calculateMontant('Immuno-Sérologie', {
      _examens_coches: { 'Immuno-Sérologie': ['CRP — Protéine C-réactive',
                                               'Widal & Félix (SWF)'] },
    })), 8000);   // 3500 + 4500
    // Régression : TPHA/VDRL n'avait aucun tarif dans la table héritée et
    // s'estimait donc à 0, alors qu'il est facturé 7 000.
    r.check('TPHA / VDRL n\'est plus à zéro', await page.evaluate(() => calculateMontant('Immuno-Sérologie', {
      _examens_coches: { 'Immuno-Sérologie': ['TPHA / VDRL (Syphilis)'] },
    })), 7000);
    r.check('aucun examen coché → 0', await page.evaluate(
      () => calculateMontant('Hématologie', {})), 0);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();
