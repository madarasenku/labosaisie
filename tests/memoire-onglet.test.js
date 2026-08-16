// Mémoire de l'onglet courant — v13.109
//
// Avant : recharger la page ramenait toujours sur « Nouveau patient »,
// quel que soit l'onglet où l'on travaillait. Désormais l'application
// retient le dernier onglet de travail et y revient après un rechargement.
//
// Deux garde-fous vérifiés ici :
//  • on ne restaure qu'une vue AUTORISÉE au rôle (un caissier n'a pas la
//    saisie, on ne peut pas l'y renvoyer) ;
//  • on ne mémorise NI le cahier jaune NI les Comptes — restaurer le cahier
//    révélerait l'existence de la seconde porte.
const { serve, openApp, createReporter } = require('./helpers');

const rpcBase = { get_tarifs: {}, get_examens_custom: [] };
const vueActive = page => page.evaluate(() =>
  ([...document.querySelectorAll('header .nav-btn.active')].map(b => b.dataset.view)[0]) || '(aucune)');
const memo = page => page.evaluate(() => localStorage.getItem('labo_vue_courante'));

(async () => {
  const srv = await serve();
  const r = createReporter('MÉMOIRE DE L\'ONGLET');

  // ── 1. L'admin retrouve son onglet après rechargement ────────────
  {
    r.section('L\'admin revient sur l\'onglet qu\'il consultait');
    const { ctx, page, errors } = await openApp({ role: 'admin', username: 'admin1', userId: 1, rpc: rpcBase });
    await page.waitForTimeout(900);
    r.check('au départ : saisie', await vueActive(page), 'saisie');

    await page.evaluate(() => showView('historique'));
    await page.waitForTimeout(300);
    r.check('mémorise « historique »', await memo(page), 'historique');

    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1400);
    r.check('après rechargement : historique', await vueActive(page), 'historique');
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── 2. La Caisse aussi ───────────────────────────────────────────
  {
    r.section('… et de même pour la Caisse');
    const { ctx, page } = await openApp({ role: 'admin', username: 'admin1', userId: 1, rpc: rpcBase });
    await page.waitForTimeout(700);
    await page.evaluate(() => showView('caisse'));
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1400);
    r.check('après rechargement : caisse', await vueActive(page), 'caisse');
    await ctx.close();
  }

  // ── 3. Le cahier jaune n'est PAS mémorisé (seconde porte) ────────
  {
    r.section('Le cahier jaune ne laisse aucune trace mémorisée');
    const { ctx, page } = await openApp({ role: 'admin', username: 'admin1', userId: 1,
      rpc: Object.assign({ mon_acces_cahier: { autorise: true, admin: true,
        config: { actif: false, roles: [], periode_debut: null, periode_fin: null } } }, rpcBase) });
    await page.waitForTimeout(700);
    await page.evaluate(() => showView('historique'));   // repère connu
    await page.waitForTimeout(200);
    await page.evaluate(() => showView('cahier'));
    await page.waitForTimeout(300);
    // La mémoire doit être restée sur « historique », pas passée à « cahier ».
    r.check('mémoire inchangée après le cahier', await memo(page), 'historique');
    await ctx.close();
  }

  // ── 4. Un caissier n'est jamais renvoyé sur une vue interdite ────
  {
    r.section('Repli par rôle : pas de restauration interdite');
    const { ctx, page } = await openApp({ role: 'caissier', username: 'caisse1', userId: 3, rpc: rpcBase });
    await page.waitForTimeout(700);
    // On force une mémoire « saisie » (vue interdite au caissier), puis on recharge.
    await page.evaluate(() => localStorage.setItem('labo_vue_courante', 'saisie'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1400);
    r.check('le caissier atterrit sur la caisse, pas la saisie',
            await vueActive(page), 'caisse');
    await ctx.close();
  }

  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
