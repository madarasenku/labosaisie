// ✅ v13.201 — Report MANUEL au cahier jaune depuis l'historique (sélection par
// cases). L'app classe chaque dossier :
//   • BPN (prénatal) + prescripteur du centre → SFPMI
//   • BPN + prescripteur externe (médecin EXTERNE) → SFHG
//   • ni l'un ni l'autre → EXTERNE
// Montant = montant exact du dossier ; les dossiers à 0 sont ignorés.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const r = createReporter('CAHIER JAUNE — REPORT MANUEL & CLASSEMENT');
  const srv = await serve(8179);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8179 });
    ctx = app.ctx; const { page, errors } = app;

    const res = await page.evaluate(async () => {
      // Stubs : confirmation acceptée, pas de spinner réel, capture des appels RPC.
      window.showConfirmModal = async () => true;
      window.__calls = [];
      _sb = { rpc: async (n, p) => { window.__calls.push({ n, p }); return { data: { ok: true }, error: null }; } };

      const mk = (id, montant, medecin, types) => ({
        id, montant, savedAt: '2026-09-23T09:00:00Z',
        patient: { nom: 'PATIENT ' + id, dossier: '000' + id + '-0926', date: '2026-09-23', medecin },
        resultats: { _types: types },
      });
      _dbCache = [
        mk(1, 10000, 'DR CENTRE', ['Bilan prénatal']),   // BPN centre → SFPMI
        mk(2, 12000, 'EXTERNE',   ['Bilan prénatal']),   // BPN externe → SFHG
        mk(3, 3000,  'DR X',      ['Biochimie']),         // autre → EXTERNE
        mk(4, 0,     'DR Y',      ['Bilan prénatal']),   // sans montant → ignoré
      ];
      _selectedIds = new Set([1, 2, 3, 4]);

      await bulkCahierJaune();

      const byId = {};
      window.__calls.filter(c => c.n === 'porter_au_cahier')
        .forEach(c => { byId[c.p.p_resultat_id] = c.p; });
      return {
        nbCalls: window.__calls.filter(c => c.n === 'porter_au_cahier').length,
        c1: byId[1], c2: byId[2], c3: byId[3], c4: byId[4],
      };
    });

    r.section('Classement automatique par dossier');
    r.check('3 dossiers portés (le 0 F est ignoré)', res.nbCalls, 3);
    r.check('BPN du centre → SFPMI', res.c1 && res.c1.p_libelle_colonne, 'SFPMI');
    r.check('BPN externe (médecin EXTERNE) → SFHG', res.c2 && res.c2.p_libelle_colonne, 'SFHG');
    r.check('ni BPN centre ni externe → EXTERNE', res.c3 && res.c3.p_libelle_colonne, 'EXTERNE');
    r.check('dossier à 0 F non porté', res.c4, undefined);

    r.section('Montant exact + jour du dossier');
    r.check('montant = montant exact (BPN centre 10000)', res.c1 && res.c1.p_montant, 10000);
    r.check('montant exact (externe 12000)', res.c2 && res.c2.p_montant, 12000);
    r.check('jour = date du dossier', res.c1 && res.c1.p_jour, '2026-09-23');
    r.check('explication = nom (dossier)', /PATIENT 1 \(0001-0926\)/.test((res.c1 && res.c1.p_explication) || ''), true);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();
