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

const CACHE = 'cpmi-labo-v42';

/* Pré-cacher les fichiers essentiels à l'installation */
const PRECACHE = [
  './index.html',
  './login.html',
  './caisse.html',
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.7/dist/umd/supabase.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
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
