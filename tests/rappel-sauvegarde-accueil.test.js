// ════════════════════════════════════════════════════════════════════
//  Rappel de sauvegarde sur l'Accueil de l'admin (v13.242)
//    Le bandeau de Comptes › Configuration n'était vu par personne : la
//    dernière copie datait de deux mois. Le rappel apparaît sur l'Accueil
//    dès 7 jours, disparaît quand la sauvegarde est récente.
// ════════════════════════════════════════════════════════════════════
const { serve, openApp, createReporter } = require('./helpers');

const etat = jours => ({ jamais: false, le: '2026-08-09T22:49:00Z', par: 'admin',
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
    r.section('Sauvegarde récente (2 jours)');
    const { ctx, page, errors } = await ouvrir({ derniere_sauvegarde: etat(2) });
    r.check('rappel masqué', (await lire(page)).visible, false);
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  r.check('aucune erreur JS', erreurs.length, 0);
  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();
