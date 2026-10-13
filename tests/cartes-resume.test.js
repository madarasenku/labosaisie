// ════════════════════════════════════════════════════════════════════
//  Cartes résumé de l'Historique (lien de test /preview)
//    Journée de SERVICE en cours = permanence 8h–16h30 + garde 16h30 →
//    lendemain 8h. La veille et les dossiers supprimés ne comptent pas.
// ════════════════════════════════════════════════════════════════════
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve(8266);
  const r = createReporter('CARTES RÉSUMÉ DE L\'HISTORIQUE (preview)');
  const { ctx, page, errors } = await openApp({ role: 'agent', username: 'YERIGUE', port: 8266,
                                                cible: '/preview/index.html' });

  const res = await page.evaluate(async () => {
    const j = _jourServiceCourant(), lendemain = _jourPlus(j, 1), veille = _jourPlus(j, -1);
    const mk = (id, date, heure, paye, montant, deleted) => ({
      id, type: 'Dossier', montant, created_at: date + 'T' + heure + ':00', created_by: 'YERIGUE',
      patient: { nom: 'P' + id, dossier: 'D' + id, date, paiement_status: paye ? 'paye' : 'non_paye' },
      resultats: { _types: ['Hématologie'], _examens_coches: { 'Hématologie': ['NFS — Numération Formule Sanguine'] } },
      prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: deleted ? date + 'T12:00:00' : null,
    });
    const data = [
      mk(1, j, '10:00', true, 3000),           // permanence, payé
      mk(2, j, '18:00', false, 4500),          // garde, à encaisser
      mk(3, lendemain, '02:00', true, 2000),   // garde après minuit → même journée
      mk(4, veille, '10:00', true, 9000),      // veille → exclu
    ];
    _sb.rpc = async (nom) => nom === 'get_resultats_light' ? { data, error: null } : { data: [], error: null };
    await refreshDB(true);
    showView('historique');
    renderHistory();
    const t = id => (document.getElementById(id) || {}).textContent || '';
    const chiffres = s => s.replace(/[^\d]/g, '');
    return {
      jour: t('hist-res-jour'), jourSub: t('hist-res-jour-sub'),
      paye: chiffres(t('hist-res-paye')), payeSub: t('hist-res-paye-sub'),
      impaye: chiffres(t('hist-res-impaye')), impayeSub: t('hist-res-impaye-sub'),
      attendus: t('hist-res-attendus'),
      cartes: document.querySelectorAll('#view-historique .pp-resume .k').length,
    };
  });

  r.section('Journée de service en cours');
  r.check('4 cartes affichées', res.cartes, 4);
  r.check('dossiers du jour (veille exclue)', res.jour, '3');
  r.check('répartition permanence / garde', res.jourSub, '1 en permanence · 2 en garde');
  r.check('encaissé (F)', res.paye, '5000');
  r.check('dossiers payés', res.payeSub, '2 dossiers payés');
  r.check('à encaisser (F)', res.impaye, '4500');
  r.check('dossiers en attente', res.impayeSub, '1 dossier en attente');
  r.check('résultats attendus : un nombre', /^\d+$/.test(res.attendus), true);

  const supprime = await page.evaluate(async () => {
    const j = _jourServiceCourant();
    getDB().forEach(x => { if (x.id === 2) x.deletedAt = j + 'T12:00:00'; });
    majCartesResume();
    return { jour: document.getElementById('hist-res-jour').textContent,
             impayeSub: document.getElementById('hist-res-impaye-sub').textContent };
  });
  r.section('Dossier supprimé');
  r.check('n\'est plus compté', supprime.jour, '2');
  r.check('plus rien à encaisser', supprime.impayeSub, 'tout est encaissé');

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 4));
  await ctx.close(); srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
