/* ============================================================
   LaboSaisie CPMI — Service Worker v13.36
   Stratégie : Network-First avec fallback cache
   (réseau prioritaire → toujours la version à jour ;
    si hors-ligne → version en cache)
   v13.36 : bump cache → cpmi-labo-v2 (purge ancien cache
   qui pouvait contenir index.html avec ref print.js externe)
   ============================================================ */

const CACHE = 'cpmi-labo-v7';

/* Pré-cacher les fichiers essentiels à l'installation */
const PRECACHE = [
  './index.html',
  './login.html',
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
      .then(c => c.addAll(PRECACHE).catch(() => {})) // échec silencieux si hors-ligne à l'install
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
