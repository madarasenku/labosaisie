// Historique — le bouton « ⚙ Filtres » déplie ET replie son panneau (v13.250).
//   Le second clic rouvrait le panneau au lieu de le replier.
const { serve, openApp, createReporter } = require('./helpers');
const PORT = 8332;
// Lien de test d'abord ; la racine suit à la mise en production.
const CIBLE = process.env.CIBLE || '/preview/index.html';

(async () => {
  const srv = await serve(PORT);
  const r = createReporter('HISTORIQUE — BOUTON FILTRES');
  const { ctx, page, errors } = await openApp({ role: 'admin', port: PORT, cible: CIBLE });
  await page.evaluate(() => showView('historique'));
  await page.waitForTimeout(800);
  const etat = () => page.evaluate(() => [
    getComputedStyle(document.getElementById('hist-filtres-avances')).display !== 'none',
    document.getElementById('filtres-avances-chevron').textContent,
    document.getElementById('btn-filtres-avances').classList.contains('active')].join('|'));
  const clic = () => page.click('#btn-filtres-avances');

  r.check('replié au départ', await etat(), 'false|▾|false');
  await clic();
  r.check('1er clic : déplié', await etat(), 'true|▴|true');
  await clic();
  r.check('2e clic : replié', await etat(), 'false|▾|false');
  await clic();
  r.check('3e clic : déplié de nouveau', await etat(), 'true|▴|true');
  r.check('aucune erreur JS', errors.length, 0);
  const s = r.summary();
  await ctx.close(); srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();
