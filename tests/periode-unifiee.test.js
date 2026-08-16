// Une seule période pour l'Historique, la Caisse et les Statistiques — v13.108
//
// Avant : chaque onglet gardait sa propre période. On demandait « cette
// semaine » dans l'Historique et la Caisse restait sur « aujourd'hui », si
// bien qu'on ne s'y retrouvait plus dans les comptes. Désormais, choisir une
// période dans un onglet la fixe pour les trois.
//
// Ce fichier vérifie la propagation : l'état des trois vues, leurs boutons
// actifs et leurs champs de dates doivent rester identiques, quelle que soit
// la vue depuis laquelle on change la période.
const { serve, openApp, createReporter } = require('./helpers');

const admin = { role: 'admin', username: 'admin1', userId: 1,
                rpc: { get_tarifs: {}, get_examens_custom: [] } };

// Lit l'état des trois vues d'un coup : période + décalage, bouton actif,
// et les bornes de dates. Tout doit coïncider.
const etat = page => page.evaluate(() => {
  const actif = pre => ([...document.querySelectorAll('[id^=' + pre + '-btn-].active')]
                          .map(b => b.id.replace(pre + '-btn-', ''))[0]) || '(aucun)';
  const val = id => document.getElementById(id)?.value ?? '';
  return {
    per:    [ _histPeriode, _statsPeriode, _caissePeriode ].join(','),
    dec:    [ _histDecalage, _statsDecalage, _caisseDecalage ].join(','),
    boutons:[ actif('hist'), actif('stats'), actif('caisse') ].join(','),
    from:   [ val('filter-date-from'), val('stats-date-from'), val('caisse-date-from') ].join(','),
    to:     [ val('filter-date-to'),   val('stats-date-to'),   val('caisse-date-to')   ].join(','),
  };
});

const identique = liste => new Set(liste.split(',')).size === 1;

(async () => {
  const srv = await serve();
  const r = createReporter('PÉRIODE UNIFIÉE');

  const { ctx, page, errors } = await openApp(admin);

  // ── Au départ, les trois vues sont sur la même période ───────────
  {
    r.section('Au démarrage, les trois vues partagent la période');
    await page.evaluate(() => showView('historique'));
    await page.waitForTimeout(500);
    const e = await etat(page);
    r.check('même période partout',  identique(e.per), true);
    r.check('même bouton actif',     identique(e.boutons), true);
    r.check('c\'est « mois »',       e.per, 'mois,mois,mois');
  }

  // ── Changer dans l'Historique se répercute partout ───────────────
  {
    r.section('« Cette semaine » depuis l\'Historique');
    await page.evaluate(() => setHistPeriode('semaine'));
    await page.waitForTimeout(300);
    const e = await etat(page);
    r.check('les trois passent à « semaine »', e.per, 'semaine,semaine,semaine');
    r.check('les trois boutons suivent',       e.boutons, 'semaine,semaine,semaine');
    r.check('les dates « de » coïncident',     identique(e.from), true);
    r.check('les dates « à » coïncident',      identique(e.to), true);
  }

  // ── Changer dans les Statistiques se répercute partout ───────────
  {
    r.section('« Aujourd\'hui » depuis les Statistiques');
    await page.evaluate(() => setStatsPeriode('jour'));
    await page.waitForTimeout(300);
    const e = await etat(page);
    r.check('les trois passent à « jour »', e.per, 'jour,jour,jour');
    r.check('les bornes du jour coïncident', identique(e.from) && identique(e.to), true);
  }

  // ── Changer dans la Caisse se répercute partout, « tout » compris ─
  {
    r.section('« Tout » depuis la Caisse');
    await page.evaluate(() => setCaissePeriode('tout'));
    await page.waitForTimeout(300);
    const e = await etat(page);
    r.check('les trois passent à « tout »', e.per, 'tout,tout,tout');
    r.check('les trois boutons « tout » actifs', e.boutons, 'tout,tout,tout');
    r.check('aucune borne de date', e.from + '|' + e.to, ',,|,,');
  }

  // ── Le décalage (mois précédent) se propage aussi ────────────────
  {
    r.section('Un mois en arrière se propage aussi');
    await page.evaluate(() => { setHistPeriode('mois'); decalerPeriode(-1); });
    await page.waitForTimeout(300);
    const e = await etat(page);
    r.check('les trois décalages coïncident', identique(e.dec), true);
    r.check('décalés d\'un mois', e.dec, '-1,-1,-1');
    r.check('les dates coïncident encore', identique(e.from) && identique(e.to), true);
  }

  r.check('aucune erreur JS', errors.length, 0);
  await ctx.close();

  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
