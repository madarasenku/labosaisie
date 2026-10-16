// ════════════════════════════════════════════════════════════════════
//  Rôle « Responsable » (v13.244) — gérant de site au périmètre limité
//    Côté écran : il est affiché « Responsable » (pas « Admin »), il a
//    l'onglet Comptes (Utilisateurs seulement), il peut saisir/agir, et ses
//    menus de rôle ne proposent ni admin ni responsable. Le périmètre réel
//    (fiches cachées, caisse noire, coffre, comptes admin/Nadia) et les refus
//    d'écriture sont appliqués par le serveur et vérifiés en base.
// ════════════════════════════════════════════════════════════════════
const { serve, openApp, createReporter } = require('./helpers');

const COMPTES = [
  { id: 21, username: 'YERIGUE', role: 'agent', created_at: '2026-08-01T10:00:00Z' },
  { id: 50, username: 'Patron', role: 'responsable', created_at: '2026-10-16T10:00:00Z' },
];
// Le rôle « Responsable » n'existe pour l'instant que sur le lien de test :
// ce test vise donc /preview/ par défaut, jusqu'à sa mise en production.
const CIBLE = process.env.CIBLE || '/preview/index.html';

(async () => {
  const srv = await serve(8312);
  const r = createReporter('RÔLE « RESPONSABLE »');
  let erreurs = [];

  {
    r.section('Le responsable');
    const { ctx, page, errors } = await openApp({ role: 'responsable', username: 'Patron', userId: 50, port: 8312,
      cible: CIBLE, rpc: { list_users_admin: [COMPTES[0]] } });
    await page.waitForTimeout(800);
    const badge = await page.evaluate(() => document.getElementById('user-badge').textContent);
    r.check('badge « Responsable »', /💼 Responsable/.test(badge), true);
    r.check('n\'est pas marqué « Admin »', /Admin\b/.test(badge), false);
    r.check('onglet Comptes visible', await page.evaluate(() => document.getElementById('btn-nav-users').style.display !== 'none'), true);
    r.check('onglet Nouvelle saisie visible', await page.evaluate(() =>
      document.querySelector('header .nav-btn[data-view="saisie"]').style.display !== 'none'), true);
    r.check('peut agir (pas bloqué comme spectateur)', await page.evaluate(() => blockIfSpectateur()), false);
    await page.evaluate(() => showView('comptes'));
    await page.waitForTimeout(700);
    r.check('écran Comptes ouvert', await page.evaluate(() => document.getElementById('view-comptes').style.display !== 'none'), true);
    r.check('onglet Configuration visible', await page.evaluate(() =>
      [...document.querySelectorAll('#view-comptes .admin-tab-main')][1].style.display !== 'none'), true);
    r.check('onglet Journal masqué', await page.evaluate(() =>
      [...document.querySelectorAll('#view-comptes .admin-tab-main')][2].style.display === 'none'), true);
    r.check('sous-onglet Valeurs de référence présent', await page.evaluate(() =>
      !!document.querySelector('#ac-config .admin-tab-sub')), true);
    r.check('Prescripteurs masqué', await page.evaluate(() =>
      [...document.querySelectorAll('#ac-comptes .admin-tab-sub')].slice(1).every(b => b.style.display === 'none')), true);
    r.check('liste du personnel affichée', await page.evaluate(() => /YERIGUE/.test(document.getElementById('users-body').textContent)), true);
    r.check('rôle Administrateur non proposé', await page.evaluate(() => document.querySelector('#nu_role option[value="admin"]').disabled), true);
    r.check('rôle Responsable non proposé', await page.evaluate(() => document.querySelector('#nu_role option[value="responsable"]').disabled), true);
    r.check('rôle Agent proposé', await page.evaluate(() => document.querySelector('#nu_role option[value="agent"]').disabled), false);
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Vu par l\'admin');
    const { ctx, page, errors } = await openApp({ role: 'admin', port: 8312, cible: CIBLE, rpc: { list_users_admin: COMPTES } });
    await page.evaluate(() => showView('comptes'));
    await page.waitForTimeout(800);
    r.check('compte affiché « Responsable »', await page.evaluate(() => /💼 Responsable/.test(document.getElementById('users-body').textContent)), true);
    r.check('admin : option Responsable disponible', await page.evaluate(() => document.querySelector('#nu_role option[value="responsable"]').disabled), false);
    r.check('admin : Configuration visible', await page.evaluate(() =>
      [...document.querySelectorAll('#view-comptes .admin-tab-main')].every(b => b.style.display !== 'none')), true);
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Spectateur ordinaire : inchangé');
    const { ctx, page, errors } = await openApp({ role: 'spectateur', username: 'Tom', userId: 41, port: 8312, cible: CIBLE });
    await page.waitForTimeout(800);
    r.check('badge « Spectateur »', /👁 Spectateur/.test(await page.evaluate(() => document.getElementById('user-badge').textContent)), true);
    r.check('onglet Comptes masqué', await page.evaluate(() => document.getElementById('btn-nav-users').style.display), 'none');
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  r.check('aucune erreur JS', erreurs.length, 0);
  if (erreurs.length) console.log('   ', erreurs.slice(0, 3));
  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();
