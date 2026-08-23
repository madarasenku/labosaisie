// ✅ v13.125 — Grille en série : filtre par date (défaut aujourd'hui) et
// exclusion des dossiers « réception seule ».
const { serve, openApp, createReporter } = require('./helpers');

const TODAY = new Date().toISOString().slice(0, 10);
const OLD = '2026-01-05';

const mk = (id, nom, date, receptionSeule) => ({
  id, type: 'Dossier', montant: 3000, created_at: date + 'T09:00:00Z',
  patient: { nom, dossier: '0' + id + '-0826', sexe: 'F', age: 30, date },
  resultats: { _types: ['Hématologie'], _facture_seule: true,
    _reception_seule: !!receptionSeule,
    _examens_coches: { 'Hématologie': ['NFS — Numération Formule Sanguine'] } },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null });

const DOSS = [
  mk(960, 'AUJOURD HUI', TODAY, false),        // visible par défaut
  mk(961, 'ANCIEN', OLD, false),               // caché par défaut (autre date)
  mk(962, 'RECEPTION SEULE', TODAY, true),     // caché par défaut (réception seule)
];

(async () => {
  const r = createReporter('GRILLE — FILTRE DATE & RÉCEPTION SEULE');
  const srv = await serve(8117);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8117, rpc: { get_resultats_light: DOSS } });
    ctx = app.ctx;
    const { page, errors } = app;
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(200);

    r.section('Défaut : seulement les patients du jour, hors réception seule');
    await page.evaluate(() => { _grilleDate = null; _grilleInclureReception = false; window.ouvrirGrille('nfs'); });
    await page.waitForTimeout(200);
    const def = await page.evaluate(() => ({
      ids: grillePending('nfs').map(x => x.id).sort(),
      dateInput: document.getElementById('grille-date')?.value,
    }));
    r.check('date par défaut = aujourd\'hui', def.dateInput, TODAY);
    r.check('seul le patient du jour (non réception)', def.ids.join(','), '960');

    r.section('Inclure « réception seule »');
    await page.evaluate(() => window.grilleToggleReception(true));
    await page.waitForTimeout(150);
    r.check('aujourd\'hui + réception seule', await page.evaluate(() => grillePending('nfs').map(x => x.id).sort().join(',')), '960,962');

    r.section('Toutes les dates');
    await page.evaluate(() => { window.grilleToggleReception(false); window.grilleSetDate(''); });
    await page.waitForTimeout(150);
    r.check('toutes dates, hors réception', await page.evaluate(() => grillePending('nfs').map(x => x.id).sort().join(',')), '960,961');
    await page.evaluate(() => window.grilleToggleReception(true));
    await page.waitForTimeout(150);
    r.check('toutes dates + réception seule = les 3', await page.evaluate(() => grillePending('nfs').map(x => x.id).sort().join(',')), '960,961,962');

    r.section('Date ancienne ciblée');
    await page.evaluate((d) => { window.grilleToggleReception(false); window.grilleSetDate(d); }, OLD);
    await page.waitForTimeout(150);
    r.check('seul l\'ancien dossier', await page.evaluate(() => grillePending('nfs').map(x => x.id).sort().join(',')), '961');
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 4));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();
