// ════════════════════════════════════════════════════════════════════
//  Journée de service (v13.271) — le point de caisse = le registre.
//  La caisse comptait par date calendaire (minuit → minuit) alors que le
//  registre et la clôture suivent la journée de service (8 h → 8 h) : les
//  dossiers de la nuit faisaient différer le point du jour et le registre.
//  Et la règle « avant 8 h = la veille » reculait d'un jour de trop un
//  dossier déjà daté de la veille (0018-1126 : enregistré le 03 à 00:01,
//  daté du 02, rangé au 01).
// ════════════════════════════════════════════════════════════════════
const { serve, openApp, createReporter } = require('./helpers');

const PORT = 8378;
const fiche = (id, savedAt, date, montant, paye) => ({ id, type: 'Dossier', savedAt, montant, createdBy: 'admin',
  patient: Object.assign({ nom: 'PATIENT ' + id, dossier: String(id) }, date ? { date } : {}, paye ? { paiement_status: 'paye' } : {}),
  resultats: {}, _light: true });

(async () => {
  const srv = await serve(PORT);
  const r = createReporter('JOURNÉE DE SERVICE — caisse = registre = clôture');
  let erreurs = [];
  try {
    const { ctx, page, errors } = await openApp({ role: 'admin', username: 'admin', port: PORT });

    r.section('Règle « avant 8 h = la veille »');
    const regle = await page.evaluate(() => {
      const j = (savedAt, date) => { const x = posteInfoDossier({ savedAt, patient: date ? { date } : {} }); return x.poste + ' ' + x.jour; };
      return {
        matin: j('2026-11-03T07:55:00Z', '2026-11-03'),
        minuitVeille: j('2026-11-03T00:01:00Z', '2026-11-02'),
        sansDate: j('2026-11-03T02:00:00Z', ''),
        jour: j('2026-11-03T10:00:00Z', '2026-11-03'),
        ancienJour: j('2026-11-03T10:00:00Z', '2026-11-01'),
        ancienNuit: j('2026-11-03T03:00:00Z', '2026-11-01'),
        soir: j('2026-11-02T17:00:00Z', '2026-11-02'),
        mois: [moisServiceLigne({ created_at: '2026-11-02T00:30:00Z', patient: { date: '2026-11-01' } }),
               moisServiceLigne({ created_at: '2026-11-01T03:00:00Z', patient: { date: '2026-11-01' } })].join(' '),
      };
    });
    r.check('07:55 daté du jour → garde de la veille', regle.matin, 'Garde 2026-11-02');
    r.check('00:01 daté de la veille → garde de la veille', regle.minuitVeille, 'Garde 2026-11-02');
    r.check('02:00 sans date → garde de la veille', regle.sansDate, 'Garde 2026-11-02');
    r.check('10:00 daté du jour → ce jour', regle.jour, 'Permanence 2026-11-03');
    r.check('ancien dossier saisi le jour → sa date', regle.ancienJour, 'Permanence 2026-11-01');
    r.check('ancien dossier saisi la nuit → sa date', regle.ancienNuit, 'Garde 2026-11-01');
    r.check('17:00 → garde du jour même', regle.soir, 'Garde 2026-11-02');
    r.check('mois de service (sauvegarde) : même règle', regle.mois, '2026-11 2026-10');

    r.section('Caisse, registre et clôture comptent les mêmes dossiers');
    const memes = await page.evaluate(fiches => {
      _dbCache = fiches;
      const ids = l => l.map(x => x.id).sort((a, b) => a - b).join(',');
      const out = {};
      for (const jour of ['2026-11-02', '2026-11-03']) {
        const clo = calculerCloture(jour);
        const noClo = [...clo.detail.map(x => Number(x.dossier)), ...clo.impayes.map(x => Number(x.dossier))].sort((a, b) => a - b).join(',');
        out[jour] = { caisse: ids(filtrerParJourService(getCalcDB(), jour, jour)), registre: ids(_regDossiersDuJour(jour)),
                      cloture: noClo, total: clo.total };
      }
      _caissePeriode = 'custom';
      document.getElementById('caisse-date-from').value = '2026-11-03';
      document.getElementById('caisse-date-to').value = '2026-11-03';
      showView('caisse');
      renderCaisse();
      return out;
    }, [
      fiche(1, '2026-11-02T09:00:00Z', '2026-11-02', 5000, true),
      fiche(2, '2026-11-02T17:00:00Z', '2026-11-02', 3000, true),
      fiche(3, '2026-11-03T00:01:00Z', '2026-11-02', 3000, true),
      fiche(4, '2026-11-03T07:55:00Z', '2026-11-03', 6500, true),
      fiche(5, '2026-11-03T07:56:00Z', '2026-11-03', 3500, false),
      fiche(6, '2026-11-03T09:30:00Z', '2026-11-03', 4000, true),
      fiche(7, '2026-11-03T11:00:00Z', '2026-11-03', 2000, false),
    ]);
    r.check('02/11 — caisse : jour + garde jusqu\'à 8 h', memes['2026-11-02'].caisse, '1,2,3,4,5');
    r.check('02/11 — registre identique', memes['2026-11-02'].registre, memes['2026-11-02'].caisse);
    r.check('02/11 — clôture identique', memes['2026-11-02'].cloture, memes['2026-11-02'].caisse);
    r.check('02/11 — clôture : 17 500 encaissés', memes['2026-11-02'].total, 17500);
    r.check('03/11 — caisse : dès 8 h', memes['2026-11-03'].caisse, '6,7');
    r.check('03/11 — clôture identique', memes['2026-11-03'].cloture, memes['2026-11-03'].caisse);
    r.check('03/11 — registre identique', memes['2026-11-03'].registre, memes['2026-11-03'].caisse);
    await page.waitForTimeout(1400);
    const kpi = await page.evaluate(() => ({
      nb: document.getElementById('caisse-kpi-nb').textContent.replace(/\D/g, ''),
      total: document.getElementById('caisse-kpi-total').textContent.replace(/\D/g, ''),
    }));
    r.check('écran Caisse du 03/11 : 2 dossiers', kpi.nb, '2');
    r.check('écran Caisse du 03/11 : 4 000 encaissés', kpi.total, '4000');

    r.section('« Aujourd\'hui » = journée de service en cours');
    const auj = await page.evaluate(() => {
      const j = _jourServiceCourant();
      const maintenant = new Date().toISOString();
      _dbCache = [fiche(11, maintenant, _jourLocal(new Date()), 1500, true),
                  fiche(12, _jourPlus(j, -1) + 'T09:00:00Z', _jourPlus(j, -1), 9000, true)];
      _accueilFill();
      return { plage: JSON.stringify(plagePeriodeService('jour', 0)), hier: plagePeriodeService('jour', -1).from,
               attendu: JSON.stringify({ from: j, to: j }), jHier: _jourPlus(j, -1),
               accueil: document.getElementById('kio-stat-jour').textContent.trim() };
      function fiche(id, savedAt, date, montant, paye) { return { id, type: 'Dossier', savedAt, montant, createdBy: 'admin',
        patient: { nom: 'P' + id, date, paiement_status: paye ? 'paye' : 'non_paye' }, resultats: {} }; }
    });
    r.check('période « jour » = journée de service', auj.plage, auj.attendu);
    r.check('« hier » = journée de service précédente', auj.hier, auj.jHier);
    r.check('Accueil : dossier du jour compté, pas celui d\'hier', auj.accueil, '1');

    erreurs = erreurs.concat(errors);
    await ctx.close();
    r.check('aucune erreur JS', erreurs.length, 0);
    if (erreurs.length) console.log(erreurs);
  } catch (e) {
    console.error(e);
    r.check('exécution sans exception', String(e && e.message || e), 'aucune');
  }
  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();
