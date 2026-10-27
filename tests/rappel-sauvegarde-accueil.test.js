// ════════════════════════════════════════════════════════════════════
//  Rappel de sauvegarde sur l'Accueil de l'admin (v13.242)
//    Le bandeau de Comptes › Configuration n'était vu par personne : la
//    dernière copie datait de deux mois. Le rappel apparaît sur l'Accueil
//    quand une sauvegarde est due.
//  v13.267 — Rythme MENSUEL : dû à partir du 10 de chaque mois tant que la
//    sauvegarde n'a pas été faite depuis ce 10 (avant : 7 jours).
// ════════════════════════════════════════════════════════════════════
const { serve, openApp, createReporter } = require('./helpers');

// « le » cohérent avec « jours » : le rappel se juge sur la date réelle.
const etat = jours => ({ jamais: false, le: new Date(Date.now() - jours * 86400000).toISOString(), par: 'admin',
                         nb_fiches: 635, jours, fiches_actuelles: 1853 });

(async () => {
  const srv = await serve(8311);
  const r = createReporter('RAPPEL DE SAUVEGARDE — ACCUEIL');
  let erreurs = [];
  const ouvrir = async (rpc) => {
    const o = await openApp({ role: 'admin', port: 8311, rpc });
    await o.page.evaluate(() => showView('accueil'));
    await o.page.waitForTimeout(1200);
    return o;
  };
  const lire = page => page.evaluate(() => {
    const el = document.getElementById('kio-sauvegarde');
    return { visible: !!el && !el.hidden && el.offsetParent !== null, texte: el ? el.textContent.replace(/\s+/g, ' ') : '' };
  });

  {
    r.section('Sauvegarde vieille de 67 jours');
    const { ctx, page, errors } = await ouvrir({ derniere_sauvegarde: etat(67) });
    const x = await lire(page);
    r.check('rappel visible', x.visible, true);
    r.check('ancienneté affichée', /il y a 67 jours/.test(x.texte), true);
    r.check('fiches non sauvegardées comptées', /1218 fiches non sauvegardées/.test(x.texte), true);
    r.check('bouton de sauvegarde présent', await page.evaluate(() =>
      !!document.querySelector('#kio-sauvegarde button[onclick*="sauvegarderBase"]')), true);
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Jamais sauvegardé');
    const { ctx, page, errors } = await ouvrir({ derniere_sauvegarde: { jamais: true, fiches_actuelles: 12 } });
    const x = await lire(page);
    r.check('rappel visible', x.visible, true);
    r.check('libellé « Aucune sauvegarde »', /Aucune sauvegarde effectuée/.test(x.texte), true);
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Sauvegarde faite aujourd\'hui');
    const { ctx, page, errors } = await ouvrir({ derniere_sauvegarde: etat(0) });
    r.check('rappel masqué', (await lire(page)).visible, false);

    // Dates fixes : le résultat ne dépend pas du jour où le test tourne.
    r.section('Calendrier mensuel : chaque 10 du mois');
    const cas = await page.evaluate(() => {
      const d = (derniere, maintenant) => sauvegardeDue({ jamais: false, le: derniere }, maintenant) ? 'due' : 'ok';
      return [
        d('2026-10-10T09:00:00', '2026-11-09T18:00:00'),   // veille du 10 : rien à faire
        d('2026-10-12T09:00:00', '2026-11-10T08:00:00'),   // le 10 : due
        d('2026-11-10T07:30:00', '2026-11-10T08:00:00'),   // faite le 10 au matin : ok
        d('2026-11-12T09:00:00', '2026-11-30T09:00:00'),   // faite le 12 : ok jusqu'au 10 suivant
        d('2026-11-12T09:00:00', '2026-12-09T09:00:00'),   // … le 9 décembre : toujours ok
        d('2026-11-12T09:00:00', '2026-12-10T00:30:00'),   // le 10 décembre : due
        d('2025-12-11T09:00:00', '2026-01-03T09:00:00'),   // changement d'année : ok
        d('2025-12-09T09:00:00', '2026-01-03T09:00:00'),   // faite avant le 10 décembre : due
      ].join(' ');
    });
    r.check('veille, le 10, après, mois suivant, changement d\'année', cas, 'ok due ok ok ok due ok due');
    r.check('jamais sauvegardé : due', await page.evaluate(() => sauvegardeDue({ jamais: true })), true);
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  r.check('aucune erreur JS', erreurs.length, 0);
  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();
