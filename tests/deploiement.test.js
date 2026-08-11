// Cohérence de déploiement.
//
// Ce fichier existe à cause d'un incident réel du 9 août 2026 : après le
// déploiement de v13.72, l'application affichait la nouvelle interface mais
// « decalerPeriode is not defined » au moindre clic. Le navigateur servait
// un index.html tout neuf ET un js/historique.js périmé issu de son cache
// HTTP — les noms de fichiers étant stables, rien ne l'obligeait à
// redemander le module.
//
// Le symptôme était particulièrement trompeur : des boutons bien visibles
// qui ne font rien, sans message d'erreur pour l'utilisateur. Et il se
// serait reproduit à CHAQUE déploiement.
//
// La parade : chaque actif porte ?v=APP_VERSION. Ce test vérifie qu'aucun
// n'a été oublié et que les trois fichiers annoncent la même version.
const { createReporter } = require('./helpers');
const fs = require('fs');
const path = require('path');

const lire = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  const r = createReporter('COHÉRENCE DE DÉPLOIEMENT');

  const sw = lire('sw.js');
  const version = /const APP_VERSION = '([^']+)'/.exec(sw)?.[1];
  r.check('APP_VERSION déclarée dans sw.js', !!version, true);
  console.log('    version courante :', version);

  r.section('Tous les actifs locaux sont versionnés');
  for (const f of ['index.html', 'login.html', 'soignant.html']) {
    const html = lire(f);
    // Tout <script src> / <link rel=stylesheet> pointant vers js/ css/ vendor/
    const refs = [
      ...html.matchAll(/<script src="(\.\/(?:js|vendor)\/[^"]+)"/g),
      ...html.matchAll(/<link rel="stylesheet" href="(\.\/(?:css|vendor)\/[^"]+)"/g),
    ].map(m => m[1]);

    r.check(`${f} — actifs référencés`, refs.length > 0, true);
    const sansVersion = refs.filter(u => !u.includes('?v='));
    r.check(`${f} — aucun actif sans ?v=`,
            sansVersion.join(', ') || 'aucun', 'aucun');
    const mauvaise = refs.filter(u => u.includes('?v=') && !u.endsWith('?v=' + version));
    r.check(`${f} — tous sur la version ${version}`,
            mauvaise.join(', ') || 'aucun', 'aucun');
  }

  r.section('Le service worker précache les mêmes URL');
  const precache = [...sw.matchAll(/v\('(\.\/[^']+)'\)/g)].map(m => m[1] + '?v=' + version);
  const html = lire('index.html');
  const refsIndex = [
    ...html.matchAll(/<script src="(\.\/(?:js|vendor)\/[^"]+)"/g),
    ...html.matchAll(/<link rel="stylesheet" href="(\.\/(?:css|vendor)\/[^"]+)"/g),
  ].map(m => m[1]);

  // Un actif référencé mais absent du précache = application cassée hors-ligne.
  const absents = refsIndex.filter(u => !precache.includes(u));
  r.check('aucun actif référencé absent du précache',
          absents.join(', ') || 'aucun', 'aucun');

  r.section('Le nom du cache change à chaque version');
  const cache = /const CACHE = '([^']+)'/.exec(sw)?.[1];
  console.log('    cache courant :', cache);
  r.check('CACHE déclaré', !!cache, true);
  // Garde-fou : on ne peut pas deviner le numéro attendu, mais un CACHE
  // laissé identique alors qu'APP_VERSION a bougé signifie que les anciens
  // caches ne seront pas purgés. On vérifie au moins qu'ils sont cohérents
  // dans le temps via le journal git — ici on se contente du format.
  r.check('format du nom de cache', /^cpmi-labo-(V2-)?v\d+$/.test(cache || ''), true);

  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
