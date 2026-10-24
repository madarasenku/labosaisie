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

  r.section('Fenêtre de réglage puis impression (par défaut : debout)');
  // Lance l'impression depuis la fenêtre : `bouton` = 'env-essai' | 'env-tout'.
  const imprimer = (bouton, reglage) => page.evaluate(async ({ bouton, reglage }) => {
    let imprime = 0; const p = window.print; window.print = () => { imprime++; };
    try {
      await bulkEnveloppes();
      const bd = document.getElementById('env-modal-bd');
      if (!bd) return { fenetre: false };
      if (reglage) {
        bd.querySelector('input[name="env-sens"][value="' + reglage.sens + '"]').checked = true;
        bd.querySelector('#env-retourne').checked = reglage.retourne;
      }
      bd.querySelector('#' + bouton).click();
      for (let i = 0; i < 40 && !imprime; i++) await new Promise(r => setTimeout(r, 50));
    } finally { window.print = p; }
    const pr = document.getElementById('print-render');
    const env = [...pr.querySelectorAll('.env')];
    return {
      fenetre: true, ferme: !document.getElementById('env-modal-bd'), imprime, n: env.length,
      noms: env.map(e => e.querySelector('.env-patient').textContent).join(' | '),
      dossiers: env.map(e => e.querySelector('.env-dossier b').textContent).join(' | '),
      qr: env.filter(e => /^data:image\/png/.test((e.querySelector('.env-qr img') || {}).src || '')).length,
      tete: env.every(e => /CPMI DE GRAND-BASSAM/.test(e.textContent) && /CONFIDENTIEL/.test(e.textContent)),
      page: (pr.innerHTML.match(/@page\{size:([^;]+);/) || [])[1],
      pivot: (pr.innerHTML.match(/\.env\{[^}]*?(transform:[^;]*;)?\}/) || [])[1] || 'aucun',
      memo: localStorage.getItem('labosaisie_enveloppes_v1'),
    };
  }, { bouton, reglage });
  await page.evaluate(() => localStorage.removeItem('labosaisie_enveloppes_v1'));
  let imp = await imprimer('env-tout');
  r.check('fenêtre de réglage ouverte puis fermée', imp.fenetre && imp.ferme, true);
  r.check('une impression lancée', imp.imprime, 1);
  r.check('une enveloppe par dossier coché', imp.n, 2);
  r.check('noms en majuscules, ordre d\'arrivée', imp.noms, 'TRAORE MOUSSA | DIALLO FATOU');
  r.check('n° de dossier', imp.dossiers, 'D203 | D204');
  r.check('un code QR par enveloppe', imp.qr, 2);
  r.check('en-tête CPMI + « confidentiel »', imp.tete, true);
  r.check('page DEBOUT 110 × 220 mm (format DL des imprimantes)', imp.page, '110mm 220mm');
  r.check('enveloppe pivotée d\'un quart de tour', imp.pivot, 'transform:rotate(90deg) translateY(-110mm);');

  r.check('fenêtre au-dessus de la barre de sélection', await page.evaluate(async () => {
    await bulkEnveloppes(); const bd = document.getElementById('env-modal-bd');
    const z = Number(getComputedStyle(bd).zIndex), barre = Number(getComputedStyle(document.getElementById('bulk-toolbar')).zIndex);
    bd.remove(); return z > barre; }), true);

  r.section('Essai, retournement, sens couché — réglage gardé sur le poste');
  imp = await imprimer('env-essai', { sens: 'debout', retourne: true });
  r.check('enveloppe d\'essai : une seule', imp.n + ' ' + imp.noms, '1 TRAORE MOUSSA');
  r.check('texte retourné', imp.pivot, 'transform:rotate(-90deg) translateX(-220mm);');
  r.check('réglage mémorisé', imp.memo, '{"sens":"debout","retourne":true}');
  imp = await imprimer('env-tout');                       // la fenêtre reprend le réglage gardé
  r.check('réglage repris à l\'ouverture suivante', imp.pivot, 'transform:rotate(-90deg) translateX(-220mm);');
  imp = await imprimer('env-tout', { sens: 'couchee', retourne: false });
  r.check('couchée : page 220 × 110, sans pivot', imp.page + ' / ' + imp.pivot, '220mm 110mm / aucun');
  imp = await imprimer('env-tout', { sens: 'couchee', retourne: true });
  r.check('couchée retournée : demi-tour', imp.pivot, 'transform:rotate(180deg) translate(-220mm,-110mm);');

  r.section('Corbeille');
  r.check('bouton masqué dans la corbeille', await page.evaluate(() => {
    _filterCorbeille = true; updateBulkToolbar(); const v = document.getElementById('bulk-env-btn').style.display;
    _filterCorbeille = false; updateBulkToolbar(); return v; }), 'none');

  r.check('aucune erreur de page', errors.join(' | ') || 'aucune', 'aucune');
  await ctx.close(); srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
