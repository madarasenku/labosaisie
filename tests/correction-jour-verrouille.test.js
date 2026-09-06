// ✅ v13.146 — Correctif 4a : saisie des résultats sur journée verrouillée.
// Le trigger DB n'autorise une mise à jour sur une journée verrouillée que si
// elle touche UNIQUEMENT les résultats (pas l'argent). Or updateRecordRemote
// envoyait toujours p_montant, même en mode { onlyResultats:true } — repris du
// cache local, mais suffisant pour que le garde-fou « argent » du trigger
// refuse la correction au moindre écart. Le correctif retire p_montant du
// payload dans ce mode : le RPC applique alors coalesce(NULL, montant) =
// montant inchangé, et le trigger ne se déclenche plus.
const { serve, openApp, createReporter } = require('./helpers');

const doss = {
  id: 4001, type: 'Dossier', montant: 5000, created_at: '2026-09-06T09:00:00Z',
  patient: { nom: 'JOUR VERROUILLE', dossier: '4001-0906', sexe: 'F', age: 33 },
  resultats: { _types: ['Biochimie'], _examens_coches: { 'Biochimie': ['Glycémie à jeun'] },
    'Biochimie': {} },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null,
};

(async () => {
  const r = createReporter('CORRECTION SUR JOURNÉE VERROUILLÉE — PAYLOAD SANS MONTANT');
  const srv = await serve(8146);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8146 });
    ctx = app.ctx;
    const { page, errors } = app;

    await page.evaluate((d) => {
      window.__u = [];
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') return { data: [d], error: null };
        if (nom === 'get_resultat_full') return { data: [{ resultats: d.resultats }], error: null };
        if (nom === 'update_resultat') {
          window.__u.push(params);
          return { data: { id: params.p_id, type: 'Dossier', patient: params.p_patient || d.patient, resultats: params.p_resultats || d.resultats, montant: params.p_montant != null ? params.p_montant : d.montant, created_at: d.created_at, created_by: d.created_by, prescripteur_id: d.prescripteur_id, est_bpn: false }, error: null };
        }
        if (nom === 'get_restriction_status') return { data: [], error: null };
        return { data: [], error: null };
      };
    }, doss);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);

    r.section('Mode { onlyResultats: true } — journée verrouillée');
    await page.evaluate(() => {
      const rec = getDB().find(x => x.id === 4001);
      rec.resultats = { ...rec.resultats, 'Biochimie': { 'Glycémie à jeun': { valeur: '0.90', unite: 'g/L' } } };
      return updateRecordRemote(4001, rec, { onlyResultats: true });
    });
    await page.waitForTimeout(500);
    const payloadOnlyResultats = await page.evaluate(() => window.__u[0]);
    r.check('appel update_resultat effectué', !!payloadOnlyResultats, true);
    r.check('p_montant ABSENT du payload', payloadOnlyResultats ? Object.prototype.hasOwnProperty.call(payloadOnlyResultats, 'p_montant') : null, false);
    r.check('p_resultats bien transmis', payloadOnlyResultats && !!payloadOnlyResultats.p_resultats, true);

    r.section('Mode normal (sans onlyResultats) — le montant reste envoyé');
    await page.evaluate(() => { window.__u = []; });
    await page.evaluate(() => {
      const rec = getDB().find(x => x.id === 4001);
      rec.montant = 7000;
      return updateRecordRemote(4001, rec, {});
    });
    await page.waitForTimeout(500);
    const payloadNormal = await page.evaluate(() => window.__u[0]);
    r.check('p_montant PRÉSENT hors mode résultats-seuls', payloadNormal ? Object.prototype.hasOwnProperty.call(payloadNormal, 'p_montant') : null, true);
    r.check('p_montant = 7000', payloadNormal && payloadNormal.p_montant, 7000);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 6));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();
