// Mise à jour automatique (v13.254) — quand une nouvelle version est publiée,
// l'application se recharge d'elle-même au premier moment SÛR, sans jamais
// interrompre une saisie : poste inactif 2 min, pas de champ texte actif, pas
// de fenêtre ouverte, ni « Nouvelle saisie » ni « Comptes », rien en cours.
const { serve, openApp, createReporter } = require('./helpers');
const PORT = 8343;
const CIBLE = process.env.CIBLE || '/index.html';

(async () => {
  const srv = await serve(PORT);
  const r = createReporter('MISE À JOUR AUTOMATIQUE');
  const { ctx, page, errors } = await openApp({ role: 'admin', port: PORT, cible: CIBLE });
  await page.evaluate(() => { window.__recharges = 0; window._rechargerPage = () => { window.__recharges++; }; });
  // Essai : se placer dans une situation, déclarer le poste inactif, tenter.
  const essai = (prep) => page.evaluate(async (prep) => {
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    await new Function('return (async () => {' + prep + '})()')();
    __majAuto.activite(Date.now() - 3 * 60 * 1000);
    const avant = window.__recharges; __majAuto.tenter(); return window.__recharges - avant;
  }, prep);

  r.section('Sans nouvelle version');
  r.check('rien ne se recharge', await essai("showView('historique')"), 0);

  r.section('Nouvelle version détectée');
  await page.evaluate(() => __majAuto.signaler());
  r.check('bannière : mise à jour automatique annoncée', await page.evaluate(() =>
    /mise à jour automatique dès que le poste est libre/.test(document.getElementById('update-banner')?.textContent || '')), true);
  r.check('sur « Nouvelle saisie » : PAS de rechargement', await essai("showView('saisie')"), 0);
  r.check('sur « Comptes » : PAS de rechargement', await essai("showView('comptes')"), 0);
  r.check('fenêtre ouverte : PAS de rechargement', await essai("showView('historique'); showConfirmModal({ title: 'x' })"), 0);
  await page.evaluate(() => document.getElementById('confirm-modal-backdrop')?.remove());
  r.check('enregistrement en cours : PAS de rechargement', await essai("showView('historique'); showLoading('…')"), 0);
  await page.evaluate(() => hideLoading());
  r.check('curseur dans un champ texte : PAS de rechargement', await essai("showView('historique'); document.getElementById('search-input')?.focus() || document.querySelector('#view-historique input[type=search],#view-historique input[type=text]').focus()"), 0);
  r.check('poste utilisé il y a moins de 2 min : PAS de rechargement', await page.evaluate(() => {
    document.activeElement && document.activeElement.blur(); showView('historique');
    __majAuto.activite(Date.now() - 30 * 1000); const a = window.__recharges; __majAuto.tenter(); return window.__recharges - a; }), 0);
  r.check('poste libre sur l\'Historique : rechargement automatique', await essai("showView('historique')"), 1);
  r.check('le dernier écran sera rouvert (mémorisé)', await page.evaluate(() => localStorage.getItem('labo_vue_courante')), 'historique');

  r.section('« ✕ » reporte de 30 minutes');
  // La bannière est toujours affichée (le rechargement est simulé dans ce test).
  await page.click('#update-banner button[aria-label="Plus tard"]');
  r.check('poste libre mais report demandé : PAS de rechargement', await essai("showView('historique')"), 0);
  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 3));
  const s = r.summary();
  await ctx.close(); srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();
