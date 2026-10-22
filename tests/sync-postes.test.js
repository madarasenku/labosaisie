// Synchronisation entre postes (v13.254) — un dossier enregistré sur un autre
// poste apparaît tout seul (sans recharger la page) : le poste demande au
// serveur ce qui a changé depuis sa dernière visite et ne recharge que cela.
const { serve, openApp, createReporter } = require('./helpers');
const PORT = 8344;
const CIBLE = process.env.CIBLE || '/index.html';
const AUJ = new Date().toISOString().slice(0, 10);
const fiche = (id, nom, par, patient = {}) => ({
  id, type: 'Dossier', montant: 3000, created_at: AUJ + 'T08:00:00Z', created_by: par, prescripteur_id: null, est_bpn: false,
  patient: { nom, dossier: '0' + id + '-1026', date: AUJ, statut: 'attente', ...patient },
  resultats: { _types: ['Hématologie'], _examens_coches: { 'Hématologie': ['NFS — Numération Formule Sanguine'] } },
  restricted_by: null, deleted_at: null,
});

(async () => {
  const srv = await serve(PORT);
  const r = createReporter('SYNCHRONISATION ENTRE POSTES');
  const { ctx, page, errors } = await openApp({ role: 'admin', port: PORT, cible: CIBLE,
    rpc: { get_resultats_light: [fiche(801, 'PATIENT LOCAL', 'admin1')] } });
  // Serveur simulé : réponses pilotées appel par appel, appels comptés.
  await page.evaluate(() => {
    window.__dep = null; window.__ids = null; window.__n = { depuis: 0, ids: 0, complet: 0 }; window.__msgs = [];
    const t = window.toast; window.toast = (m, k) => { window.__msgs.push(m); try { t(m, k); } catch (e) {} };
    const vrai = _sb.rpc.bind(_sb);
    _sb.rpc = (nom, p) => {
      if (nom === 'get_resultats_depuis') { __n.depuis++; return Promise.resolve({ data: p.p_depuis == null ? { maj: 10 } : __dep, error: null, status: 200 }); }
      if (nom === 'get_resultats_ids') { __n.ids++; return __ids === 'RESEAU' ? Promise.reject(new Error('réseau')) : Promise.resolve({ data: __ids, error: null, status: 200 }); }
      return vrai(nom, p);
    };
    const rd = window.refreshDB; window.refreshDB = (f) => { if (f) __n.complet++; return rd(f); };
    showView('historique'); setHistPeriode('tout');
  });
  await page.waitForTimeout(800);
  const noms = () => page.evaluate(() => [...document.querySelectorAll('#history-body tr[id^="row-"]')].map(t => t.id.slice(4)).sort().join(','));
  const sync = (dep, ids) => page.evaluate(async ([dep, ids]) => { __dep = dep; __ids = ids; await synchroniserPostes(); await new Promise(r => setTimeout(r, 350)); }, [dep, ids]);

  r.section('Démarrage');
  r.check('synchronisation lancée avec l\'application', await page.evaluate(() => _syncTimer !== null), true);
  await page.evaluate(() => synchroniserPostes());          // pose le repère
  r.check('repère pris', await page.evaluate(() => _syncDepuis), 10);

  r.section('Rien n\'a changé');
  await sync({ maj: 10, changements: [] }, null);
  r.check('aucun dossier rechargé', await page.evaluate(() => __n.ids), 0);

  r.section('Nouveau patient enregistré sur un autre poste');
  const F902 = fiche(902, 'PATIENT AUTRE POSTE', 'agent2');
  await sync({ maj: 11, changements: [[902, 11]] }, { lignes: [F902], restreintes: [], supprimees: [] });
  r.check('apparaît dans l\'Historique sans recharger', await noms(), '801,902');
  r.check('message « 1 nouveau dossier reçu »', await page.evaluate(() => __msgs.some(m => /1 nouveau dossier reçu d'un autre poste/.test(m))), true);
  r.check('seul ce dossier est demandé', await page.evaluate(() => __n.ids), 1);
  await sync({ maj: 11, changements: [[902, 11]] }, null);
  r.check('déjà appliqué : pas redemandé', await page.evaluate(() => __n.ids), 1);

  r.section('Modification faite ailleurs');
  await sync({ maj: 12, changements: [[902, 12]] }, { lignes: [fiche(902, 'PATIENT AUTRE POSTE', 'agent2', { statut: 'rendu' })], restreintes: [], supprimees: [] });
  r.check('statut repris (Terminé)', await page.evaluate(() => _dbCache.find(x => x.id === 902).patient.statut), 'rendu');
  r.check('pas compté comme nouveau', await page.evaluate(() => __msgs.filter(m => /nouveau/.test(m)).length), 1);

  r.section('Dossier devenu invisible pour ce compte (masqué / hors périmètre)');
  await sync({ maj: 13, changements: [[902, 13]] }, { lignes: [], restreintes: [], supprimees: [] });
  r.check('retiré de l\'Historique', await noms(), '801');

  r.section('Pendant une saisie (fenêtre ouverte)');
  await page.evaluate(() => { showConfirmModal({ title: 'Saisie en cours' }); });
  await sync({ maj: 14, changements: [[903, 14]] }, { lignes: [fiche(903, 'PATIENT PENDANT SAISIE', 'agent2')], restreintes: [], supprimees: [] });
  r.check('données reçues, écran pas redessiné', [await page.evaluate(() => !!_dbCache.find(x => x.id === 903)), await noms()].join('|'), 'true|801');
  await page.evaluate(() => document.getElementById('confirm-modal-backdrop').remove());
  await sync({ maj: 14, changements: [] }, null);
  r.check('fenêtre fermée : écran rattrapé', await noms(), '801,903');

  r.section('Réseau instable');
  await sync({ maj: 15, changements: [[904, 15]] }, 'RESEAU');
  r.check('échec : repère inchangé', await page.evaluate(() => _syncDepuis), 14);
  await sync({ maj: 15, changements: [[904, 15]] }, { lignes: [fiche(904, 'PATIENT APRES COUPURE', 'agent2')], restreintes: [], supprimees: [] });
  r.check('réessayé ensuite : reçu', [await noms(), await page.evaluate(() => _syncDepuis)].join('|'), '801,903,904|15');

  r.section('Beaucoup de changements d\'un coup');
  await sync({ maj: 500, complet: true }, null);
  r.check('liste complète rechargée, repère mis à jour', await page.evaluate(() => __n.complet + '|' + _syncDepuis), '1|500');

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 3));
  const s = r.summary();
  await ctx.close(); srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();
