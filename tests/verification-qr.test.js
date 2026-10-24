// v13.259 — Page de vérification d'un code QR (?share=…) : PUBLIQUE.
//
// Avant : une personne non connectée (patient, médecin) était renvoyée vers la
// connexion du laboratoire — le code QR ne servait qu'au personnel ; et une
// simple coupure réseau affichait « Dossier introuvable » pour un dossier valide.
const { serve, openApp, createReporter } = require('./helpers');
const PORT = 8365;
const CIBLE = (process.env.CIBLE || '/index.html') + '?share=71071d1179bc46479e28e239cd0e2e15';
const ROW = [{ patient: { dossier: '0375-1026', nom: 'PATIENTE TEST', age: '40', sexe: 'F', date: '2026-10-24', medecin: 'DR X' },
  type: 'Dossier', types: ['Biochimie'], saisi_par: 'admin', created_at: '2026-10-24T09:00:00Z' }];
const carte = page => page.evaluate(() => ({
  url: location.pathname.replace(/.*\//, '') + location.search.slice(0, 7),
  texte: ((document.getElementById('share-view') || {}).innerText || '').replace(/\s+/g, ' '),
  app: (document.getElementById('app-root') || {}).style?.display || '',
}));

(async () => {
  const srv = await serve(PORT);
  const r = createReporter('VÉRIFICATION PAR CODE QR (PAGE PUBLIQUE)');
  let erreurs = [];
  {
    r.section('Sans compte (patient, médecin…)');
    const appels = [];
    const { ctx, page, errors } = await openApp({ port: PORT, cible: CIBLE, sansSession: true, appels, rpc: { get_public_result: ROW } });
    await page.waitForTimeout(800);
    const c = await carte(page);
    r.check('reste sur la page, pas de renvoi à la connexion', c.url, 'index.html?share=');
    r.check('fiche « Résultat vérifié » affichée', /Résultat vérifié/.test(c.texte) && /0375-1026/.test(c.texte) && /PATIENTE TEST/.test(c.texte), true);
    r.check('aucun résultat chiffré, aucune donnée du laboratoire chargée',
      appels.filter(a => a !== 'get_public_result').join(',') || 'aucun', 'aucun');

    r.section('Messages');
    const err = await page.evaluate(async () => {
      window.initSupabase = () => true;          // la page recrée sinon le client
      _sb.rpc = () => Promise.resolve({ data: null, error: { message: 'Failed to fetch' } });
      await checkShareMode(); return document.getElementById('share-view').innerText;
    });
    r.check('serveur injoignable : « réessayez », pas « introuvable »', /Vérification impossible/.test(err) && /Réessayer/.test(err) && !/introuvable/i.test(err), true);
    const vide = await page.evaluate(async () => {
      _sb.rpc = () => Promise.resolve({ data: [], error: null });
      await checkShareMode(); return document.getElementById('share-view').innerText;
    });
    r.check('jeton inconnu : « Dossier introuvable »', /Dossier introuvable/.test(vide), true);
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Appareil du laboratoire déjà connecté');
    const appels = [];
    const { ctx, page, errors } = await openApp({ role: 'admin', port: PORT, cible: CIBLE, appels, rpc: { get_public_result: ROW } });
    await page.waitForTimeout(800);
    const c = await carte(page);
    r.check('même fiche de vérification', /Résultat vérifié/.test(c.texte), true);
    r.check('l\'application ne démarre pas derrière', appels.includes('get_resultats_light'), false);
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Sans lien de vérification : la connexion reste exigée');
    const { ctx, page, errors } = await openApp({ port: PORT, cible: process.env.CIBLE || '/index.html', sansSession: true });
    r.check('renvoi vers la connexion', await page.evaluate(() => location.pathname.replace(/.*\//, '')), 'login.html');
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  r.check('aucune erreur de page', erreurs.join(' | ') || 'aucune', 'aucune');
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
