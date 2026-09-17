// Couverture de la saisie en série : TOUT examen facturable (hors bactériologie,
// forfait et examens partageant un panneau) doit être saisissable en série.
//
// Motivation : historiquement, un dossier dont aucun examen demandé ne figurait
// dans GRILLE_EXAMS était exclu de la grille — l'examen ressortait alors « non
// réalisé » faute d'endroit où le saisir. Le générateur _grilleEnsureAuto()
// complète le registre depuis le catalogue ; ce test verrouille cette couverture.
const { serve, openApp, createReporter } = require('./helpers');

// Examens hors saisie en série, par conception :
//  • bactério  → panneau libre (germe/antibiogramme), pas une saisie « en série »
//  • BPN       → forfait, saisi via NFS/glycémie/créatinine/sérologies
//  • RAI       → partage le panneau Groupe sanguin
//  • LDL       → calculé automatiquement (Friedewald)
//  • EPS       → examen parasitologique libre (texte), sur le formulaire complet
const HORS_SERIE = new Set(['ex_ecbu','ex_hemo','ex_copro','ex_pg','ex_pus',
                            'ex_bpn','ex_rai','ex_ldl','ex_eps']);

(async () => {
  const srv = await serve(8171);
  const r = createReporter('COUVERTURE — SAISIE EN SÉRIE');
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8171,
      rpc: { get_tarifs: {}, get_examens_custom: [] } });
    ctx = app.ctx; const { page, errors } = app;

    const res = await page.evaluate((HORS) => {
      ['hema','bio','sero','gs','parasito'].forEach(n => { try { ensurePanelBuilt(n); } catch (e) {} });
      _grilleEnsureAuto();
      const hors = new Set(HORS);
      // Un examen est « atteignable » en série si un dossier qui ne demande que
      // lui fait apparaître au moins un examen de grille.
      const atteignable = (label) => {
        const coches = { 'Hématologie':[label], 'Biochimie':[label],
          'Immuno-Sérologie':[label], 'Groupe sanguin':[label], 'Parasitologie':[label] };
        return grilleExamsDuDossier({ resultats: { _examens_coches: coches } }).length > 0;
      };
      const manquants = CATALOGUE_EXAMENS
        .filter(e => !hors.has(e.id))
        .filter(e => !atteignable(e.label))
        .map(e => e.id);
      return { total: CATALOGUE_EXAMENS.length, manquants };
    }, [...HORS_SERIE]);

    r.section('Tout examen facturable est saisissable en série');
    r.check('examens au catalogue', res.total > 0, true);
    r.check('aucun examen absent de la série',
            res.manquants.length ? res.manquants.join(', ') : 'aucun', 'aucun');
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();
