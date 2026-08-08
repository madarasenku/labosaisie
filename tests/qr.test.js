// Génération des QR codes.
//
// Ce fichier existe parce que v13.71 a supprimé le repli vers QRCode.js :
// il n'y a plus qu'une seule implémentation, donc plus de filet. Le QR
// apparaît sur les reçus, les exports Excel et les PDF — s'il casse
// silencieusement, personne ne s'en aperçoit avant qu'un patient présente
// un reçu illisible.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve();
  const r = createReporter('QR CODE');
  const { ctx, page, errors } = await openApp({ role: 'admin' });

  r.check('générateur `qrcode` chargé',
          await page.evaluate(() => typeof qrcode), 'function');

  r.section('Génération d\'un QR réaliste');
  const res = await page.evaluate(async () => {
    const url = await generateQRDataURL(
      'CPMI GRAND-BASSAM\nDOSSIER: 0001-0826\nPATIENT: KOUAME\nDATE: 08/08/2026', 120);
    if (!url) return { vide: true };
    const img = new Image(); img.src = url;
    await new Promise(ok => { img.onload = ok; img.onerror = ok; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx2d = c.getContext('2d');
    ctx2d.drawImage(img, 0, 0);
    const d = ctx2d.getImageData(0, 0, c.width, c.height).data;
    let sombres = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 128) sombres++;
    const ratio = sombres / (d.length / 4);
    return { vide: false, largeur: img.width, hauteur: img.height,
             png: url.startsWith('data:image/png;base64,'), ratio };
  });

  r.check('image produite', res.vide !== true, true);
  r.check('format PNG (exigé par Excel et le PDF)', res.png, true);
  r.check('image carrée', res.largeur === res.hauteur, true);
  r.check('taille plausible', res.largeur >= 40 && res.largeur <= 400, true);
  // Un QR a typiquement 30 à 55 % de modules sombres. Une image toute blanche
  // (générateur muet) ou toute noire (canvas corrompu) tomberait hors bornes.
  r.check('densité de modules cohérente (30–55 %)',
          res.ratio > 0.25 && res.ratio < 0.60, true);

  r.section('Cas limites');
  r.check('texte vide → chaîne vide',
          await page.evaluate(() => generateQRDataURL('', 120)), '');
  r.check('texte très long tronqué sans erreur',
          await page.evaluate(async () => {
            const u = await generateQRDataURL('X'.repeat(5000), 120);
            return typeof u === 'string' && u.startsWith('data:image/png');
          }), true);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 3));

  const s = r.summary();
  await ctx.close(); srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();
