// Service worker : pré-cache, fonctionnement hors-ligne, et bannière de
// mise à jour pour les postes qui laissent l'application ouverte (v13.67).
const { serve, openApp, createReporter } = require('./helpers');
const fs = require('fs');
const path = require('path');

const CACHE = /const CACHE = '([^']+)'/.exec(
  fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'))[1];

(async () => {
  const srv = await serve();
  const r = createReporter('PWA / SERVICE WORKER');
  const { ctx, page, errors } = await openApp({ role: 'admin' });

  r.section('Enregistrement et pré-cache');
  const reg = await page.evaluate(async () => {
    const x = await navigator.serviceWorker.getRegistration();
    return x && x.active ? x.active.state : 'absent';
  });
  r.check('service worker actif', reg, 'activated');
  r.check('nom du cache', (await page.evaluate(() => caches.keys()))[0], CACHE);

  // pathname ignore la query : un actif versionné reste comparable.
  const cached = await page.evaluate(async c => {
    const box = await caches.open(c);
    return (await box.keys()).map(k => new URL(k.url).pathname).sort();
  }, CACHE);
  // Toutes les ressources sont same-origin depuis v13.69 : le pré-cache ne
  // peut plus être mis en échec par un CDN injoignable.
  for (const f of ['/index.html', '/login.html', '/css/app.css',
                   '/vendor/supabase-2.39.7.umd.js', '/vendor/chart-4.4.1.umd.js',
                   '/vendor/exceljs-4.4.0.min.js', '/vendor/jspdf-2.5.1.umd.min.js',
                   '/vendor/fonts/poppins.css']) {
    r.check('pré-caché ' + f, cached.includes(f), true);
  }
  r.check('aucune ressource externe pré-cachée',
          cached.every(u => u.startsWith('/')), true);

  // ✅ v13.70 — tous les modules extraits de index.html doivent être
  // pré-cachés : il en manquerait un et l'application serait inutilisable
  // hors-ligne, avec une erreur difficile à diagnostiquer sur le terrain.
  const modules = fs.readdirSync(path.join(__dirname, '..', 'js')).filter(f => f.endsWith('.js'));
  r.check('nombre de modules js/', modules.length, 14);
  const manquants = modules.filter(f => !cached.includes('/js/' + f));
  r.check('tous les modules pré-cachés', manquants.join(',') || 'aucun manquant', 'aucun manquant');

  // Le HTML doit référencer exactement ces modules, dans l'ordre.
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  // ✅ v13.72 — les URL portent ?v=APP_VERSION, on compare sur le chemin nu.
  const refs = [...html.matchAll(/<script src="\.\/(js\/[^"?]+)(?:\?[^"]*)?"><\/script>/g)]
    .map(x => x[1]);
  r.check('modules référencés par index.html', refs.length, 14);
  r.check('aucun module orphelin',
          modules.filter(f => !refs.includes('js/' + f)).join(',') || 'aucun', 'aucun');

  r.section('Hors-ligne');
  await ctx.setOffline(true);
  r.check('index.html servi depuis le cache', await page.evaluate(async () => {
    try { const x = await fetch('./index.html'); return x.ok; } catch { return false; }
  }), true);
  r.check('bibliothèque servie depuis le cache', await page.evaluate(async () => {
    try { const x = await fetch('./vendor/chart-4.4.1.umd.js'); return x.ok; } catch { return false; }
  }), true);
  await ctx.setOffline(false);

  r.section('Bannière de mise à jour');
  r.check('absente au premier chargement', await page.locator('#update-banner').count(), 0);

  // Simule un déploiement : la signature du fichier (ETag / Last-Modified) change.
  await new Promise(x => setTimeout(x, 1200));
  const idx = path.join(__dirname, '..', 'index.html');
  const now = new Date();
  fs.utimesSync(idx, now, now);

  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(2500);
  r.check('apparaît après un déploiement', await page.locator('#update-banner').count(), 1);

  if (await page.locator('#update-banner').count()) {
    await page.locator('#update-banner button', { hasText: 'Recharger' }).click();
    await page.waitForTimeout(1200);
    // Jamais de rechargement automatique : une saisie en cours serait perdue.
    r.check('demande confirmation avant de recharger',
            await page.locator('#confirm-modal-backdrop').count(), 1);
    await page.locator('#cm-cancel').click();
    await page.waitForTimeout(500);
    r.check('« Annuler » ne recharge pas', page.url().endsWith('index.html'), true);
    await page.locator('#update-banner button[aria-label="Plus tard"]').click();
    await page.waitForTimeout(400);
    r.check('« Plus tard » masque la bannière',
            await page.locator('#update-banner').count(), 0);
  }

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 3));

  const s = r.summary();
  await ctx.close(); srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();
