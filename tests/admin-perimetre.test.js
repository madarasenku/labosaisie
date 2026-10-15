// ════════════════════════════════════════════════════════════════════
//  Compte « Administrateur » au périmètre du contrat (v13.244)
//    Techniquement un SPECTATEUR (lecture seule ; périmètre restreint par le
//    serveur) qui porte le titre « Administrateur » et le droit de gérer les
//    comptes. Ce test vérifie l'écran ; le périmètre et les refus d'écriture
//    sont appliqués par le serveur (get_resultats*, set_*, encaisser_lot…).
// ════════════════════════════════════════════════════════════════════
const { serve, openApp, createReporter } = require('./helpers');

const COMPTES = [
  { id: 21, username: 'YERIGUE', role: 'agent', created_at: '2026-08-01T10:00:00Z', gere_comptes: false, titre: null },
  { id: 50, username: 'Patron', role: 'spectateur', created_at: '2026-10-15T10:00:00Z', gere_comptes: true, titre: 'Administrateur' },
];

(async () => {
  const srv = await serve(8312);
  const r = createReporter('ADMINISTRATEUR AU PÉRIMÈTRE DU CONTRAT');
  let erreurs = [];

  {
    r.section('Compte gestionnaire (spectateur + titre + gestion des comptes)');
    const { ctx, page, errors } = await openApp({ role: 'spectateur', username: 'Patron', userId: 50, port: 8312, cible: process.env.CIBLE || '/preview/index.html',
      rpc: { mon_profil: { titre: 'Administrateur', gere_comptes: true }, list_users_admin: [COMPTES[0]] } });
    await page.waitForTimeout(800);
    const badge = await page.evaluate(() => document.getElementById('user-badge').textContent);
    r.check('badge « Administrateur »', /👑 Administrateur/.test(badge), true);
    r.check('le mot « Spectateur » n\'apparaît pas', /pectateur/.test(badge), false);
    r.check('onglet Comptes visible', await page.evaluate(() => document.getElementById('btn-nav-users').style.display !== 'none'), true);
    r.check('onglet Nouvelle saisie masqué', await page.evaluate(() =>
      document.querySelector('header .nav-btn[data-view="saisie"]').style.display), 'none');
    await page.evaluate(() => showView('comptes'));
    await page.waitForTimeout(700);
    r.check('écran Comptes ouvert', await page.evaluate(() => document.getElementById('view-comptes').style.display !== 'none'), true);
    r.check('Configuration et Journal masqués', await page.evaluate(() =>
      [...document.querySelectorAll('#view-comptes .admin-tab-main')].slice(1).every(b => b.style.display === 'none')), true);
    r.check('Prescripteurs masqué', await page.evaluate(() =>
      [...document.querySelectorAll('#ac-comptes .admin-tab-sub')].slice(1).every(b => b.style.display === 'none')), true);
    r.check('liste des comptes affichée', await page.evaluate(() => /YERIGUE/.test(document.getElementById('users-body').textContent)), true);
    r.check('rôle Administrateur non proposé', await page.evaluate(() =>
      document.querySelector('#nu_role option[value="admin"]').disabled), true);
    r.check('rôle Prescripteur non proposé', await page.evaluate(() =>
      document.querySelector('#nu_role option[value="prescripteur"]').disabled), true);
    r.check('message de refus neutre', await page.evaluate(() => {
      let m = ''; const t = window.toast; window.toast = x => { m = x; }; blockIfSpectateur(); window.toast = t; return m;
    }), '🔒 Action non disponible pour ce compte');
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Spectateur ordinaire : inchangé');
    const { ctx, page, errors } = await openApp({ role: 'spectateur', username: 'Tom', userId: 41, port: 8312, cible: process.env.CIBLE || '/preview/index.html',
      rpc: { mon_profil: { titre: null, gere_comptes: false } } });
    await page.waitForTimeout(800);
    r.check('badge « Spectateur »', /👁 Spectateur/.test(await page.evaluate(() => document.getElementById('user-badge').textContent)), true);
    r.check('onglet Comptes masqué', await page.evaluate(() => document.getElementById('btn-nav-users').style.display), 'none');
    await page.evaluate(() => showView('comptes'));
    await page.waitForTimeout(400);
    r.check('écran Comptes refusé', await page.evaluate(() => document.getElementById('view-comptes').style.display), 'none');
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Vu par l\'admin');
    const { ctx, page, errors } = await openApp({ role: 'admin', port: 8312, cible: process.env.CIBLE || '/preview/index.html', rpc: { list_users_admin: COMPTES } });
    await page.evaluate(() => showView('comptes'));
    await page.waitForTimeout(800);
    r.check('compte signalé « périmètre du contrat »', await page.evaluate(() =>
      /Administrateur\s*\(périmètre du contrat\)/.test(document.getElementById('users-body').textContent)), true);
    r.check('admin : Configuration visible', await page.evaluate(() =>
      [...document.querySelectorAll('#view-comptes .admin-tab-main')].every(b => b.style.display !== 'none')), true);
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  r.check('aucune erreur JS', erreurs.length, 0);
  if (erreurs.length) console.log('   ', erreurs.slice(0, 3));
  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();
