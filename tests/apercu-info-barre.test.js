// v13.261 — Historique sur téléphone :
//  • la barre de sélection ne recouvre plus les derniers patients (une cale de
//    même hauteur permet de faire défiler la liste au-dessus d'elle) et tient
//    sur une ligne au-dessus de la barre d'onglets ;
//  • l'aperçu au survol est réservé à la souris ; le bouton ⓘ devant le nom
//    ouvre le même aperçu, épinglé, qu'on referme (✕, Échap, toucher ailleurs).
const { serve, openApp, createReporter, rows } = require('./helpers');
const PORT = 8366;
const CIBLE = process.env.CIBLE || '/index.html';

(async () => {
  const srv = await serve(PORT);
  const r = createReporter('APERÇU ⓘ + BARRE DE SÉLECTION SUR TÉLÉPHONE');
  const data = rows();
  data.find(x => x.id === 204).patient.nom = '<img src=x onerror="window.__xss=1">Diallo';
  const { ctx, page, errors } = await openApp({ role: 'admin', port: PORT, cible: CIBLE, rpc: { get_resultats_light: data } });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = 'auto';
    showView('historique'); await new Promise(res => setTimeout(res, 900));
  });
  const etat = () => page.evaluate(() => {
    const d = document.getElementById('record-preview');
    return (d.classList.contains('visible') ? 'visible' : 'cache') + (d.classList.contains('epingle') ? '+epingle' : '');
  });
  const attendre = ms => page.waitForTimeout(ms);

  r.section('Bouton ⓘ devant chaque patient');
  r.check('un ⓘ par ligne de l\'Historique', await page.evaluate(() =>
    document.querySelectorAll('#history-body > tr[id^="row-"] td[data-label="Patient"] > .hist-info:first-child').length
    === document.querySelectorAll('#history-body > tr[id^="row-"]').length), true);

  r.section('Survol à la souris (ordinateur) : inchangé');
  await page.evaluate(() => showPreview({ clientX: 200, clientY: 200 }, 203));
  await attendre(550);
  r.check('aperçu affiché au survol', await etat(), 'visible');
  await page.evaluate(() => hidePreview());
  r.check('caché en quittant la ligne', await etat(), 'cache');

  r.section('ⓘ : aperçu épinglé');
  await page.click('#row-203 .hist-info');
  await attendre(100);
  r.check('ouvert et épinglé', await etat(), 'visible+epingle');
  r.check('contenu du dossier', await page.evaluate(() => {
    const t = document.getElementById('record-preview').textContent;
    return /TRAORE MOUSSA/.test(t) && /D203/.test(t) && /FCFA/.test(t);
  }), true);
  r.check('posé sous le bouton', await page.evaluate(() => {
    const b = document.querySelector('#row-203 .hist-info').getBoundingClientRect();
    const d = document.getElementById('record-preview').getBoundingClientRect();
    return d.top >= b.bottom && d.top - b.bottom < 20;
  }), true);
  await page.evaluate(() => { hidePreview(); showPreview({ clientX: 900, clientY: 600 }, 204); });
  await attendre(550);
  r.check('le survol d\'une autre ligne ne le remplace pas', await page.evaluate(() =>
    /TRAORE MOUSSA/.test(document.getElementById('record-preview').textContent)), true);
  await page.click('#row-203 .hist-info');
  r.check('second appui sur ⓘ : refermé', await etat(), 'cache');

  await page.click('#row-204 .hist-info');
  r.check('nom du patient échappé (pas de HTML injecté)', await page.evaluate(() =>
    !document.querySelector('#record-preview img') && !window.__xss), true);
  await page.click('#record-preview .apercu-fermer');
  r.check('✕ referme', await etat(), 'cache');
  await page.click('#row-204 .hist-info');
  await page.keyboard.press('Escape');
  r.check('Échap referme', await etat(), 'cache');
  await page.click('#row-204 .hist-info');
  await page.mouse.click(5, 400);
  r.check('toucher ailleurs referme', await etat(), 'cache');
  await page.click('#row-203 .hist-info');
  await page.click('#row-204 .hist-info');
  r.check('ⓘ d\'un autre patient : bascule sur lui', await page.evaluate(() =>
    /DIALLO/.test(document.getElementById('record-preview').textContent)), true);
  await page.keyboard.press('Escape');

  r.section('Écran tactile : plus d\'aperçu au toucher d\'une ligne');
  await page.evaluate(() => {
    document.dispatchEvent(new Event('touchstart'));             // un doigt vient de toucher l'écran
    showPreview({ clientX: 200, clientY: 200 }, 203);            // souris émulée par le navigateur
  });
  await attendre(550);
  r.check('aucun aperçu de survol', await etat(), 'cache');

  r.section('Barre de sélection : la liste défile au-dessus');
  const cale = await page.evaluate(() => {
    toggleRowSelect(203, true);
    const tb = document.getElementById('bulk-toolbar'), c = document.getElementById('bulk-cale');
    const attendu = (parseFloat(getComputedStyle(tb).bottom) || 0) + tb.offsetHeight + 12;
    const avec = c && c.style.height === attendu + 'px' && c.parentElement === tb.parentElement;
    clearBulkSelection();
    return avec + ' ' + (c && c.style.height);
  });
  r.check('cale = hauteur recouverte, retirée en fin de sélection', cale, 'true 0px');

  r.section('Téléphone (390 px)');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.evaluate(async () => {
    showView('historique'); await new Promise(res => setTimeout(res, 900));
    toggleRowSelect(203, true);
  });
  await attendre(200);
  const tel = await page.evaluate(async () => {
    const tb = document.getElementById('bulk-toolbar');
    document.scrollingElement.scrollTop = 1e6;
    await new Promise(res => setTimeout(res, 200));
    const lignes = [...document.querySelectorAll('#history-body > tr[id^="row-"]')];
    const t = tb.getBoundingClientRect(), onglets = document.getElementById('mobile-tabbar').getBoundingClientRect();
    const ferme = document.getElementById('bulk-close-btn').getBoundingClientRect();
    return {
      uneLigne: t.height < 70 && getComputedStyle(tb).flexWrap === 'nowrap',
      auDessusOnglets: t.bottom <= onglets.top,
      fermeVisible: ferme.right <= window.innerWidth && ferme.left >= 0 && ferme.width > 0,
      dernierVisible: lignes[lignes.length - 1].getBoundingClientRect().bottom <= t.top,
    };
  });
  r.check('barre sur une seule ligne (défile de côté)', tel.uneLigne, true);
  r.check('posée au-dessus de la barre d\'onglets', tel.auDessusOnglets, true);
  r.check('✕ toujours visible', tel.fermeVisible, true);
  r.check('dernier patient au-dessus de la barre en fin de liste', tel.dernierVisible, true);
  r.check('ⓘ assez grand pour le doigt', await page.evaluate(() =>
    document.querySelector('#row-203 .hist-info').getBoundingClientRect().width >= 24), true);
  await page.evaluate(() => clearBulkSelection());

  r.check('aucune erreur JS', errors.length ? errors.join(' | ') : 'aucune', 'aucune');
  await ctx.close(); srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
