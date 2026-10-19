// Historique — heures d'ENREGISTREMENT et de LIVRAISON du résultat sous la date (v13.250).
//   • Enregistrement : création du dossier ; autre jour que la date → précisé.
//   • Livraison : patient.rendu_at (premier passage à « Terminé »), avec le délai.
//   • À date égale, le tri suit l'heure d'enregistrement.
const { serve, openApp, createReporter } = require('./helpers');
const PORT = 8333;
// Lien de test d'abord ; la racine suit à la mise en production.
const CIBLE = process.env.CIBLE || '/preview/index.html';
const AUJ = new Date().toISOString().slice(0, 10);
const HIER = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

const fiche = (id, nom, date, creeLe, patient = {}) => ({
  id, type: 'Dossier', montant: 3000, created_at: creeLe,
  patient: { nom, dossier: '0' + id + '-1026', date, statut: 'attente', ...patient },
  resultats: {}, created_by: 'admin1', prescripteur_id: 1, est_bpn: false,
  restricted_by: null, deleted_at: null,
});

(async () => {
  const srv = await serve(PORT);
  const r = createReporter('HISTORIQUE — HEURES D\'ENREGISTREMENT ET DE LIVRAISON');
  const { ctx, page, errors } = await openApp({ role: 'admin', port: PORT, cible: CIBLE,
    rpc: { get_resultats_light: [
      fiche(901, 'PATIENT MATIN', AUJ, AUJ + 'T08:05:00Z'),
      fiche(902, 'PATIENT MIDI',  AUJ, AUJ + 'T12:40:00Z'),
      fiche(903, 'PATIENT RATTRAPE', HIER, AUJ + 'T10:15:00Z'),
      fiche(904, 'PATIENT RENDU', AUJ, AUJ + 'T07:10:00Z', { statut: 'rendu', rendu_at: AUJ + 'T09:35:00Z' }),
      fiche(905, 'PATIENT RENDU HIER', HIER, HIER + 'T22:30:00Z', { statut: 'rendu', rendu_at: AUJ + 'T06:00:00Z' }),
      fiche(906, 'PATIENT ANCIEN', AUJ, AUJ + 'T06:00:00Z', { statut: 'rendu' }),
      fiche(907, 'PATIENT REPASSE', AUJ, AUJ + 'T06:30:00Z', { statut: 'attente', rendu_at: AUJ + 'T07:00:00Z' }),
    ] } });
  await page.evaluate(() => { showView('historique'); setHistPeriode('tout'); });
  await page.waitForTimeout(1200);
  const cellule = (id) => page.evaluate((i) => {
    const td = document.querySelector('#row-' + i + ' td[data-label="Date"]');
    return td ? td.innerText.replace(/\s+/g, ' ').trim() : null;
  }, id);
  // Heures attendues dans le fuseau du navigateur de test.
  const hm = (iso) => { const t = new Date(iso); return String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'); };
  const jj = (d) => d.split('-').reverse().join('/');

  r.section('Enregistrement');
  r.check('date + heure', await cellule(901), AUJ + ' 🕒 Enreg. ' + hm(AUJ + 'T08:05:00Z'));
  r.check('saisi un autre jour : jour précisé', await cellule(903),
    HIER + ' 🕒 Enreg. le ' + jj(AUJ) + ' à ' + hm(AUJ + 'T10:15:00Z'));
  r.check('à date égale, le plus récent d\'abord', await page.evaluate(() =>
    [...document.querySelectorAll('tr[id^="row-90"]')].map(t => t.id.slice(4)).filter(i => ['901', '902'].includes(i)).join(',')), '902,901');

  r.section('Livraison du résultat');
  r.check('terminé : heure de livraison + délai', await cellule(904),
    AUJ + ' 🕒 Enreg. ' + hm(AUJ + 'T07:10:00Z') + ' ✅ Rendu ' + hm(AUJ + 'T09:35:00Z') + ' · 2 h 25');
  r.check('livré le lendemain : jour précisé', await cellule(905),
    HIER + ' 🕒 Enreg. ' + hm(HIER + 'T22:30:00Z') + ' ✅ Rendu le ' + jj(AUJ) + ' à ' + hm(AUJ + 'T06:00:00Z') + ' · 7 h 30');
  r.check('ancien dossier terminé sans heure connue : rien d\'inventé', await cellule(906), AUJ + ' 🕒 Enreg. ' + hm(AUJ + 'T06:00:00Z'));
  r.check('repassé « En cours » : pas d\'heure de livraison', await cellule(907), AUJ + ' 🕒 Enreg. ' + hm(AUJ + 'T06:30:00Z'));
  r.check('« Terminé » à l\'écran : heure posée aussitôt, effacée si « En cours »', await page.evaluate(() => {
    setStatutLocal(901, 'rendu'); const a = !!_dbCache.find(x => x.id === 901).patient.rendu_at;
    const premiere = _dbCache.find(x => x.id === 901).patient.rendu_at;
    setStatutLocal(901, 'rendu'); const b = _dbCache.find(x => x.id === 901).patient.rendu_at === premiere;
    setStatutLocal(901, 'attente'); const c = !('rendu_at' in _dbCache.find(x => x.id === 901).patient);
    return [a, b, c].join('|');
  }), 'true|true|true');
  r.check('aucune erreur JS', errors.length, 0);
  const s = r.summary();
  await ctx.close(); srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();
