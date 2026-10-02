// ════════════════════════════════════════════════════════════════════
//  csp-smoke — vérifie que la CSP (<meta>) ne bloque AUCUNE ressource
//  légitime de l'app : polices, modules js/, manifest PWA (blob:),
//  favicon (data:), styles/scripts inline. On charge chaque page via le
//  serveur statique local et on capte toute violation CSP en console.
//
//  ⚠️ v13.216 — ajout des en-têtes de sécurité (CSP + anti-iframe). Ce
//  test garde la CSP honnête : si un futur ajout charge une ressource que
//  la politique interdit, la console émet « Refused to … » et le test
//  devient rouge AVANT la mise en ligne.
// ════════════════════════════════════════════════════════════════════
const { chromium } = require('playwright');
const { serve } = require('./helpers');

const PORT = 8137;
const PAGES = ['/login.html', '/index.html', '/soignant.html', '/confidentialite.html', '/404.html'];

(async () => {
  const srv = await serve(PORT);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  let fail = 0, checks = 0;

  console.log('\n  — Aucune violation CSP sur les pages de l’app\n');

  for (const route of PAGES) {
    const page = await browser.newPage();
    const violations = [];
    page.on('console', m => {
      const t = m.text();
      if (/Content Security Policy|Refused to (load|execute|apply|connect)/i.test(t)) violations.push(t);
    });
    // Les appels Supabase échoueront (pas de réseau) : on les neutralise
    // pour éviter le bruit — on ne teste QUE le chargement des ressources.
    await page.route('**/*.supabase.co/**', r => r.abort());
    await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(700);

    // Filtre : une violation connect-src vers supabase ne doit JAMAIS
    // apparaître (notre CSP l'autorise) — si elle apparaît, c'est un vrai bug.
    const real = violations.filter(v => v.length);
    checks++;
    if (real.length) {
      fail++;
      console.log(`  ✗ ${route} — ${real.length} violation(s) CSP :`);
      real.slice(0, 5).forEach(v => console.log(`       · ${v.slice(0, 160)}`));
    } else {
      console.log(`  ✔ ${route.padEnd(24)} aucune violation`);
    }
    await page.close();
  }

  // Contrôle supplémentaire : la police Poppins doit être réellement chargée
  // (sinon font-src 'self' aurait bloqué le woff2 vendored).
  {
    const page = await browser.newPage();
    await page.route('**/*.supabase.co/**', r => r.abort());
    await page.goto(`http://127.0.0.1:${PORT}/login.html`, { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(500);
    const poppinsLoaded = await page.evaluate(() =>
      document.fonts && [...document.fonts].some(f => /poppins/i.test(f.family))
    ).catch(() => false);
    checks++;
    if (poppinsLoaded) console.log('  ✔ login.html             police Poppins chargée (font-src OK)');
    else { fail++; console.log('  ✗ login.html — police Poppins NON chargée (font-src bloque ?)'); }
    await page.close();
  }

  await browser.close();
  srv.close();

  console.log(`\n  ${checks - fail}/${checks} contrôles OK\n`);
  process.exit(fail ? 1 : 0);
})();
