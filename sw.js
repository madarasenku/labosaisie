/* ============================================================
   LaboSaisie CPMI — Service Worker v13.67
   Stratégie : Network-First avec fallback cache
   (réseau prioritaire → toujours la version à jour ;
    si hors-ligne → version en cache)

   v13.67 : bump cache v40 → v41 (purge d'office tout résidu
   d'un déploiement antérieur) + caisse.html pré-caché
   + handler SKIP_WAITING pour activation à la demande.

   ⚠️  v13.72 — VERSIONNEMENT DES ACTIFS (APP_VERSION)
   Les modules js/ et css/ portent des noms de fichiers stables. Un
   navigateur pouvait donc servir un index.html tout neuf ET un
   js/historique.js périmé issu de son cache HTTP : la nouvelle interface
   s'affichait, mais ses fonctions n'existaient pas encore
   (« decalerPeriode is not defined »). Le symptôme était trompeur — des
   boutons visibles qui ne font rien — et se serait reproduit à CHAQUE
   déploiement. Les URL portent maintenant ?v=APP_VERSION : après une mise
   en ligne, le navigateur demande une URL qu'aucun cache ne connaît, donc
   HTML et JS sont forcément de la même génération.
   À CHAQUE DÉPLOIEMENT : incrémenter APP_VERSION *et* CACHE, et propager
   APP_VERSION dans index.html et login.html (tests/deploiement.test.js
   échoue si les trois divergent).

   ⚠️  RAPPEL DÉPLOIEMENT : bumper CACHE à chaque mise en ligne.
   Le navigateur ne réinstalle le SW que si ce fichier change
   octet pour octet ; sans bump, 'activate' ne rejoue jamais et
   les anciens caches ne sont pas purgés. La détection de
   nouvelle version côté client ne dépend toutefois PAS de ce
   bump : index.html surveille l'ETag du déploiement (voir
   checkForUpdate() dans index.html).
   ============================================================ */

const APP_VERSION = '13.80';
const CACHE = 'cpmi-labo-v55';
const v = url => url + '?v=' + APP_VERSION;

/* Pré-cacher les fichiers essentiels à l'installation.
   ✅ v13.69 — tout est désormais same-origin : plus aucune dépendance CDN,
   donc le pré-cache ne peut plus échouer à cause d'un tiers injoignable. */
const PRECACHE = [
  './index.html',
  './login.html',
  v('./css/app.css'),
  // ✅ v13.70 — modules extraits de index.html. L'ORDRE n'a pas d'importance
  // ici (simple mise en cache) mais il est critique dans index.html.
  v('./js/periode-nav.js'),
  v('./js/qr-generator.js'),
  v('./js/pwa-manifest.js'),
  v('./js/donnees-analyses.js'),
  v('./js/navigation.js'),
  v('./js/supabase-db.js'),
  v('./js/historique.js'),
  v('./js/export-excel.js'),
  v('./js/prescripteurs.js'),
  v('./js/saisie.js'),
  v('./js/ui-auth.js'),
  v('./js/session-pwa.js'),
  v('./js/stats.js'),
  v('./js/impression.js'),
  v('./js/export-pdf.js'),
  v('./js/sauvegarde.js'),
  v('./vendor/exceljs-4.4.0.min.js'),
  v('./vendor/chart-4.4.1.umd.js'),
  v('./vendor/supabase-2.39.7.umd.js'),
  v('./vendor/jspdf-2.5.1.umd.min.js'),
  v('./vendor/jspdf-autotable-3.8.2.min.js'),
  v('./vendor/fonts/poppins.css'),
  v('./vendor/fonts/poppins-latin-400-normal.woff2'),
  v('./vendor/fonts/poppins-latin-500-normal.woff2'),
  v('./vendor/fonts/poppins-latin-600-normal.woff2'),
  v('./vendor/fonts/poppins-latin-700-normal.woff2'),
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      /* ✅ v13.67 — mise en cache fichier par fichier.
         addAll() est tout-ou-rien : un seul CDN injoignable faisait échouer
         l'ensemble, y compris index.html/login.html/caisse.html, et l'app se
         retrouvait sans aucun pré-cache hors-ligne. */
      .then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    /* Nettoyer les anciens caches */
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Permet à la page de demander l'activation immédiate du nouveau SW */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  /* Ne pas intercepter les requêtes non-GET (POST Supabase, etc.) */
  if (e.request.method !== 'GET') return;

  /* Ne pas intercepter les appels API Supabase — toujours réseau */
  if (e.request.url.includes('supabase.co')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        /* Mise en cache de la réponse fraîche */
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
