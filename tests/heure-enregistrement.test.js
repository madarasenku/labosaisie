// Historique — l'heure d'enregistrement du dossier s'affiche sous la date (v13.250).
//   Saisi un autre jour que sa date : le jour de saisie est précisé.
//   À date égale, le tri suit l'heure d'enregistrement.
const { serve, openApp, createReporter } = require('./helpers');
const PORT = 8333;
// Lien de test d'abord ; la racine suit à la mise en production.
const CIBLE = process.env.CIBLE || '/preview/index.html';
const AUJ = new Date().toISOString().slice(0, 10);
const HIER = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

const fiche = (id, nom, date, creeLe) => ({
  id, type: 'Dossier', montant: 3000, created_at: creeLe,
  patient: { nom, dossier: '0' + id + '-1026', date, statut: 'attente' },
  resultats: {}, created_by: 'admin1', prescripteur_id: 1, est_bpn: false,
  restricted_by: null, deleted_at: null,
});

(async () => {
  const srv = await serve(PORT);
  const r = createReporter('HISTORIQUE — HEURE D\'ENREGISTREMENT');
  const { ctx, page, errors } = await openApp({ role: 'admin', port: PORT, cible: CIBLE,
    rpc: { get_resultats_light: [
      fiche(901, 'PATIENT MATIN', AUJ, AUJ + 'T08:05:00Z'),
      fiche(902, 'PATIENT MIDI',  AUJ, AUJ + 'T12:40:00Z'),
      fiche(903, 'PATIENT RATTRAPE', HIER, AUJ + 'T10:15:00Z'),
    ] } });
  await page.evaluate(() => { showView('historique'); setHistPeriode('tout'); });
  await page.waitForTimeout(1200);
  const cellule = (id) => page.evaluate((i) => {
    const td = document.querySelector('#row-' + i + ' td[data-label="Date"]');
    return td ? td.innerText.replace(/\s+/g, ' ').trim() : null;
  }, id);
  // Heures attendues dans le fuseau du navigateur de test.
  const hm = (iso) => { const t = new Date(iso); return String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'); };

  r.check('date + heure', await cellule(901), AUJ + ' 🕒 ' + hm(AUJ + 'T08:05:00Z'));
  r.check('date + heure (2e dossier)', await cellule(902), AUJ + ' 🕒 ' + hm(AUJ + 'T12:40:00Z'));
  r.check('saisi un autre jour : jour de saisie précisé', await cellule(903),
    HIER + ' 🕒 saisi le ' + AUJ.split('-').reverse().join('/') + ' à ' + hm(AUJ + 'T10:15:00Z'));
  r.check('à date égale, le plus récent d\'abord', await page.evaluate(() =>
    [...document.querySelectorAll('tr[id^="row-90"]')].map(t => t.id.slice(4)).filter(i => i !== '903').join(',')), '902,901');
  r.check('aucune erreur JS', errors.length, 0);
  const s = r.summary();
  await ctx.close(); srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();
