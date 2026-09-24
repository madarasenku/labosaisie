// ✅ v13.207 — iPhone : le pied du compte rendu ne se superpose plus au contenu.
// Sur iOS Safari, le pied « position:fixed » chevauchait la zone signature/QR.
// On bascule iOS sur le pied EN FLUX du <tfoot> (comme l'impression de lot).
const { serve, openApp, createReporter } = require('./helpers');

const doss = {
  id: 3101, type: 'Dossier', montant: 7000, created_at: '2026-09-24T18:00:00Z', created_by: 'YERIGUE',
  patient: { nom: 'PIED ESSAI', dossier: '0499-0926', date: '2026-09-24', sexe: 'F', age: '40', medecin: 'DR X' },
  resultats: {
    _types: ['Immuno-Sérologie'],
    _examens_coches: { 'Immuno-Sérologie': ['Ag HBs (Hépatite B)'] },
    'Immuno-Sérologie': { 'Ag HBs': { mode: 'qual', resultat: 'Négatif' } },
  }, prescripteur_id: null, est_bpn: false, restricted_by: null, deleted_at: null,
};

(async () => {
  const srv = await serve();
  const r = createReporter('IMPRESSION — PIED iOS (pas de chevauchement)');
  const { ctx, page, errors } = await openApp({ role: 'admin' });

  await page.evaluate((d) => {
    window.print = () => {};
    const light = x => { const res = {}; Object.keys(x.resultats || {}).forEach(k => { if (k[0] === '_') res[k] = x.resultats[k]; }); return Object.assign({}, x, { resultats: res }); };
    _sb.rpc = async (n) => {
      if (n === 'get_resultats_light') return { data: [light(d)], error: null };
      if (n === 'get_resultat_full') return { data: [{ resultats: d.resultats }], error: null };
      return { data: [], error: null };
    };
  }, doss);
  await page.evaluate(() => refreshDB(true));
  await page.waitForTimeout(300);
  await page.evaluate(async () => { await printRecord(3101); });
  await page.waitForTimeout(400);
  await page.emulateMedia({ media: 'print' });

  const lire = () => page.evaluate(() => {
    const pr = document.getElementById('print-render');
    const fixed = pr.querySelector('.cr-foot-fixed');
    const tfoot = pr.querySelector('.cr-doc > tfoot .cr-foot');
    const cs = e => e ? getComputedStyle(e) : null;
    return { fixed: cs(fixed) && cs(fixed).display, tfoot: cs(tfoot) && cs(tfoot).visibility };
  });

  r.section('Bureau (Chrome) : pied fixe, tfoot réserve mais invisible');
  await page.evaluate(() => document.getElementById('print-render').classList.remove('cr-ios'));
  let s = await lire();
  r.check('pied fixe affiché', s.fixed !== 'none', true);
  r.check('pied tfoot invisible (réserve la place)', s.tfoot, 'hidden');

  r.section('iOS : pas de pied fixe, pied du tfoot en flux');
  await page.evaluate(() => document.getElementById('print-render').classList.add('cr-ios'));
  s = await lire();
  r.check('pied fixe masqué', s.fixed, 'none');
  r.check('pied tfoot visible (en flux, aucun chevauchement)', s.tfoot, 'visible');

  await page.emulateMedia({ media: 'screen' });
  r.check('aucune erreur JS', errors.length, 0);
  await ctx.close();
  srv.close();
  const res = r.summary();
  process.exit(res.allPassed ? 0 : 1);
})();
