/* ============================================================
   LaboSaisie CPMI — Service Worker v13.67
   Stratégie : Network-First avec fallback cache
   (réseau prioritaire → toujours la version à jour ;
    si hors-ligne → version en cache)

   v13.67 : bump cache v40 → v41 (purge d'office tout résidu
   d'un déploiement antérieur) + caisse.html pré-caché
   + handler SKIP_WAITING pour activation à la demande.

   ⚠️  RAPPEL DÉPLOIEMENT : bumper CACHE à chaque mise en ligne.
   Le navigateur ne réinstalle le SW que si ce fichier change
   octet pour octet ; sans bump, 'activate' ne rejoue jamais et
   les anciens caches ne sont pas purgés. La détection de
   nouvelle version côté client ne dépend toutefois PAS de ce
   bump : index.html surveille l'ETag du déploiement (voir
   checkForUpdate() dans index.html).
   ============================================================ */

const CACHE = 'cpmi-labo-v46';

/* Pré-cacher les fichiers essentiels à l'installation.
   ✅ v13.69 — tout est désormais same-origin : plus aucune dépendance CDN,
   donc le pré-cache ne peut plus échouer à cause d'un tiers injoignable. */
const PRECACHE = [
  './index.html',
  './login.html',
  './css/app.css',
  // ✅ v13.70 — modules extraits de index.html. L'ORDRE n'a pas d'importance
  // ici (simple mise en cache) mais il est critique dans index.html.
  './js/qr-generator.js',
  './js/pwa-manifest.js',
  './js/donnees-analyses.js',
  './js/navigation.js',
  './js/supabase-db.js',
  './js/historique.js',
  './js/export-excel.js',
  './js/prescripteurs.js',
  './js/saisie.js',
  './js/ui-auth.js',
  './js/session-pwa.js',
  './js/stats.js',
  './js/impression.js',
  './js/export-pdf.js',
  './vendor/exceljs-4.4.0.min.js',
  './vendor/chart-4.4.1.umd.js',
  './vendor/supabase-2.39.7.umd.js',
  './vendor/jspdf-2.5.1.umd.min.js',
  './vendor/jspdf-autotable-3.8.2.min.js',
  './vendor/fonts/poppins.css',
  './vendor/fonts/poppins-latin-400-normal.woff2',
  './vendor/fonts/poppins-latin-500-normal.woff2',
  './vendor/fonts/poppins-latin-600-normal.woff2',
  './vendor/fonts/poppins-latin-700-normal.woff2',
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
      .catch(() => caches.match(e.request))
  );
});
