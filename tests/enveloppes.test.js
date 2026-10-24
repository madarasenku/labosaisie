// v13.259 — Enveloppes DL (11 × 22 cm) des dossiers cochés dans l'Historique :
// en-tête CPMI, nom, n° de dossier et le MÊME code QR que le compte rendu.
const { serve, openApp, createReporter, rows } = require('./helpers');
const PORT = 8364;
const CIBLE = process.env.CIBLE || '/index.html';

(async () => {
  const srv = await serve(PORT);
  const r = createReporter('ENVELOPPES DL AVEC CODE QR');
  const data = rows();
  data.find(x => x.id === 203).patient.share_token = 'jeton-partage-203';   // lien de vérification
  data.find(x => x.id === 204).patient.ancien_dossier = 'A-77';
  const { ctx, page, errors } = await openApp({ role: 'admin', port: PORT, cible: CIBLE, rpc: { get_resultats_light: data } });

  r.section('Bouton dans la barre de sélection');
  const btn = await page.evaluate(() => {
    showView('historique');
    toggleRowSelect(203, true); toggleRowSelect(204, true);
    const b = document.getElementById('bulk-env-btn');
    return !!b && b.style.display !== 'none' && /Enveloppes/.test(b.textContent);
  });
  r.check('« ✉ Enveloppes » présent et visible', btn, true);

  r.section('Contenu du code QR (identique au compte rendu)');
  const qr = await page.evaluate(() => {
    const a = getDB().find(x => x.id === 203), b = getDB().find(x => x.id === 204);
    return [qrTexteDossier(a) === APP_PUBLIC_URL + '?share=jeton-partage-203',
            /^CPMI Grand-Bassam \| Ref: .+ \| Dossier: D204 \| Patient: DIALLO FATOU$/.test(qrTexteDossier(b))].join(' ');
  });
  r.check('lien de vérification si partagé, sinon références', qr, 'true true');

  r.section('Impression');
  const imp = await page.evaluate(async () => {
    let imprime = 0; const p = window.print; window.print = () => { imprime++; };
    try { await bulkEnveloppes(); } finally { window.print = p; }
    const pr = document.getElementById('print-render');
    const env = [...pr.querySelectorAll('.env')];
    return {
      imprime, n: env.length,
      noms: env.map(e => e.querySelector('.env-patient').textContent).join(' | '),
      dossiers: env.map(e => e.querySelector('.env-dossier b').textContent).join(' | '),
      qr: env.filter(e => /^data:image\/png/.test((e.querySelector('.env-qr img') || {}).src || '')).length,
      tete: env.every(e => /CPMI DE GRAND-BASSAM/.test(e.textContent) && /CONFIDENTIEL/.test(e.textContent)),
      format: /@page\{size:220mm 110mm;margin:0;\}/.test(pr.innerHTML),
    };
  });
  r.check('une impression lancée', imp.imprime, 1);
  r.check('une enveloppe par dossier coché', imp.n, 2);
  r.check('noms en majuscules, ordre d\'arrivée', imp.noms, 'TRAORE MOUSSA | DIALLO FATOU');
  r.check('n° de dossier', imp.dossiers, 'D203 | D204');
  r.check('un code QR par enveloppe', imp.qr, 2);
  r.check('en-tête CPMI + « confidentiel »', imp.tete, true);
  r.check('format DL 220 × 110 mm, une enveloppe par page', imp.format, true);

  r.section('Corbeille');
  r.check('bouton masqué dans la corbeille', await page.evaluate(() => {
    _filterCorbeille = true; updateBulkToolbar(); const v = document.getElementById('bulk-env-btn').style.display;
    _filterCorbeille = false; updateBulkToolbar(); return v; }), 'none');

  r.check('aucune erreur de page', errors.join(' | ') || 'aucune', 'aucune');
  await ctx.close(); srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
