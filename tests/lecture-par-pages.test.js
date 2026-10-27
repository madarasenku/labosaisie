// v13.266 — Le serveur Supabase coupe toute réponse à 1 000 lignes. Depuis le
// 21/09 l'Historique ne recevait que les 1 000 dossiers les plus récents, et la
// sauvegarde du 19/10 ne contenait que 1 000 fiches sur 1 928. Les lectures de
// listes se font désormais par pages, avec contrôle du total annoncé.
// Le faux serveur des tests (helpers.js) applique le même plafond.
const { serve, openApp, createReporter } = require('./helpers');
const PORT = 8368;
const CIBLE = process.env.CIBLE || '/index.html';
const N = 2500;

const jour = i => { const d = new Date(Date.UTC(2026, 6, 1) + Math.floor(i / 20) * 86400000); return d.toISOString().slice(0, 10); };
const LIGNES = Array.from({ length: N }, (_, k) => {
  const i = k + 1;
  return { id: i, type: 'Dossier', montant: 1000, created_at: jour(i) + 'T09:00:00Z', created_by: 'admin1',
    prescripteur_id: null, est_bpn: false, restricted_by: null, deleted_at: null,
    patient: { nom: 'PATIENT ' + i, date: jour(i), dossier: 'P' + i, sexe: 'F', age: '30' },
    resultats: { _types: ['Hématologie'] } };
});
const MASQUES = Array.from({ length: 1200 }, (_, k) => ({ id: k + 1, restricted_by: 'admin1' }));

(async () => {
  const srv = await serve(PORT);
  const r = createReporter('LISTES DE PLUS DE 1 000 LIGNES (LECTURE PAR PAGES)');
  const { ctx, page, errors } = await openApp({ role: 'admin', port: PORT, cible: CIBLE,
    rpc: { get_resultats_light: LIGNES, get_resultats: LIGNES, get_restriction_status: MASQUES } });

  r.section('Historique : tous les dossiers, pas seulement les 1 000 plus récents');
  // _dbCache : TOUTES les fiches reçues (getDB() cache ensuite les fiches masquées).
  const cache = await page.evaluate(() => ({
    n: _dbCache.length, plusAncien: _dbCache.some(x => x.id === 1), plusRecent: _dbCache[0] && _dbCache[0].id,
  }));
  r.check(N + ' dossiers chargés (le serveur en renvoie 1 000 par réponse)', cache.n, N);
  r.check('le plus ancien est présent', cache.plusAncien, true);
  r.check('ordre conservé : le plus récent en premier', cache.plusRecent, N);
  r.check('masquage : les 1 200 fiches masquées le restent', await page.evaluate(() =>
    _dbCache.filter(x => x.restrictedBy).length), 1200);

  r.section('Sauvegarde complète');
  const sauv = await page.evaluate(async () => {
    let contenu = null;
    const vrai = window._telechargerFichier;
    window._telechargerFichier = (c) => { contenu = c; };
    try { await sauvegarderBase(); } finally { window._telechargerFichier = vrai; }
    const j = contenu ? JSON.parse(contenu) : null;
    return j && { n: j.fiches.length, meta: j._meta.nb_fiches, premier: j.fiches[0].id, dernier: j.fiches[j.fiches.length - 1].id,
                  uniques: new Set(j.fiches.map(f => f.id)).size };
  });
  r.check('toutes les fiches dans le fichier', sauv && sauv.n, N);
  r.check('nombre annoncé dans le fichier', sauv && sauv.meta, N);
  r.check('aucun doublon', sauv && sauv.uniques, N);
  r.check('ordre de création', sauv && (sauv.premier + '→' + sauv.dernier), '1→' + N);

  r.section('Restauration : la comparaison voit toute la base');
  const resto = await page.evaluate(async (n) => {
    let titre = '';
    const vrai = window.showConfirmModal;
    window.showConfirmModal = async (o) => { titre = o.title; return false; };
    const fiches = Array.from({ length: n + 5 }, (_, k) => ({ id: k + 1, type: 'Dossier', patient: {}, resultats: {} }));
    try { await restaurerBase(JSON.stringify({ _meta: { application: 'LaboSaisie' }, fiches })); }
    finally { window.showConfirmModal = vrai; }
    return titre;
  }, N);
  r.check('seules les 5 fiches réellement absentes sont proposées', resto, 'Restaurer 5 fiches ?');

  r.section('Serveur qui ignore les pages : erreur, jamais une sauvegarde partielle');
  const partiel = await page.evaluate(async () => {
    const vraiRpc = _sb.rpc, vraiDl = window._telechargerFichier, vraiToast = window.toast;
    let fichier = false, message = '';
    const mille = Array.from({ length: 1000 }, (_, k) => ({ id: k + 1, created_at: '2026-07-01' }));
    _sb.rpc = (nom, p, o) => nom !== 'get_resultats' ? vraiRpc.call(_sb, nom, p, o) : ({
      order() { return this; }, range() { return this; },
      then(ok) { ok({ data: mille, error: null, count: 2500 }); },
    });
    window._telechargerFichier = () => { fichier = true; };
    window.toast = (m) => { message = m; };
    try { await sauvegarderBase(); } finally { _sb.rpc = vraiRpc; window._telechargerFichier = vraiDl; window.toast = vraiToast; }
    return { fichier, message };
  });
  r.check('aucun fichier produit', partiel.fichier, false);
  r.check('échec signalé', /échouée/i.test(partiel.message), true);

  r.check('aucune erreur JS', errors.join(' | ') || 'aucune', 'aucune');
  await ctx.close(); srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
