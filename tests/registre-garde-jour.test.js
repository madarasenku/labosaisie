// ════════════════════════════════════════════════════════════════════
//  registre-garde-jour — Permanence et Garde séparées ; une garde = UNE journée.
//
//    • Permanence = 08h00 → 16h30
//    • Garde      = 16h30 → 08h00 le lendemain
//    • Une garde compte pour la journée où elle COMMENCE : un dossier enregistré
//      à 02h00 le 13 appartient à la « Garde du 12 au 13 ».
//    • Le registre imprimé sépare permanence et garde sur deux pages.
//
//  Horodatages construits en heure LOCALE puis sérialisés : new Date(iso)
//  redonne la même heure quel que soit le fuseau du runner.
//  CIBLE=/preview/index.html permet de viser la copie de test.
// ════════════════════════════════════════════════════════════════════
const { serve, openApp, createReporter } = require('./helpers');

const CIBLE = process.env.CIBLE || '/index.html';
const p = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
const base = new Date(); base.setHours(12, 0, 0, 0);
const jourDec = n => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
const D = ymd(jourDec(0)), D1 = ymd(jourDec(1)), DM1 = ymd(jourDec(-1));

// Fiche enregistrée le jour calendaire `n` (0 = aujourd'hui) à h:m locale.
const fiche = (id, n, h, m) => {
  const d = jourDec(n); d.setHours(h, m, 0, 0);
  return {
    id, type: 'Hématologie', montant: 1000 * id, created_at: d.toISOString(), created_by: 'nadia',
    patient: { nom: 'P' + p(id), dossier: 'D' + p(id), date: ymd(d), statut: 'rendu' },
    resultats: {}, prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null,
  };
};
const FICHES = [
  fiche(1, 0, 8, 0),    // Permanence D
  fiche(2, 0, 16, 29),  // Permanence D (dernière minute)
  fiche(3, 0, 16, 30),  // Garde D → D+1 (première minute)
  fiche(4, 0, 23, 30),  // Garde D
  fiche(5, 1, 2, 0),    // Garde D (après minuit)
  fiche(6, 1, 7, 59),   // Garde D (dernière minute)
  fiche(7, 1, 8, 0),    // Permanence D+1
  fiche(8, -1, 23, 0),  // Garde D-1
  fiche(9, 0, 3, 0),    // Garde D-1 (après minuit, le matin de D)
];

(async () => {
  const srv = await serve();
  const r = createReporter('REGISTRE — PERMANENCE / GARDE (garde = une journée)');
  const { ctx, page, errors } = await openApp({
    role: 'admin', cible: CIBLE,
    rpc: { get_tarifs: {}, get_examens_custom: [], get_resultats_light: FICHES,
           get_restriction_status: [], get_resultat_full: [{ resultats: {} }] },
  });
  await page.waitForTimeout(1500);

  // ── Bornes horaires ─────────────────────────────────────────────────
  r.section('Découpage horaire (8h00–16h30 = Permanence)');
  const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const bornes = await page.evaluate(l => l.map(iso => posteDepuisHeure(iso)),
    [at(8, 0), at(16, 29), at(16, 30), at(7, 59), at(0, 0), at(23, 59), at(12, 0)]);
  r.check('08h00 → Permanence', bornes[0], 'Permanence');
  r.check('16h29 → Permanence', bornes[1], 'Permanence');
  r.check('16h30 → Garde (début de la garde)', bornes[2], 'Garde');
  r.check('07h59 → Garde', bornes[3], 'Garde');
  r.check('minuit → Garde', bornes[4], 'Garde');
  r.check('23h59 → Garde', bornes[5], 'Garde');
  r.check('12h00 → Permanence', bornes[6], 'Permanence');

  // ── Journée de service ──────────────────────────────────────────────
  r.section('Une garde compte pour la journée où elle commence');
  const info = await page.evaluate(() => Object.fromEntries(
    _dbCache.map(x => [x.id, posteInfoDossier(x)])));
  r.check('16h30 le jour D → garde du jour D', info[3].jour + '|' + info[3].poste, D + '|Garde');
  r.check('… qui se termine le lendemain', info[3].fin, D1);
  r.check('23h30 le jour D → garde du jour D', info[4].jour, D);
  r.check('02h00 le lendemain → garde du jour D', info[5].jour + '|' + info[5].fin, D + '|' + D1);
  r.check('07h59 le lendemain → garde du jour D', info[6].jour, D);
  r.check('08h00 le lendemain → permanence du lendemain', info[7].jour + '|' + info[7].poste, D1 + '|Permanence');
  r.check('03h00 le jour D → garde de la VEILLE', info[9].jour, DM1);
  r.check('permanence : début = fin', info[1].jour === info[1].fin, true);

  // ── Dossiers du registre ────────────────────────────────────────────
  r.section('Dossiers retenus pour chaque journée de service');
  const ids = j => page.evaluate(x => _regDossiersDuJour(x).map(d => d.id).sort((a, b) => a - b), j);
  r.check('journée D : 6 dossiers (2 perm + 4 garde)', JSON.stringify(await ids(D)), '[1,2,3,4,5,6]');
  r.check('journée D+1 : la seule permanence de 08h00', JSON.stringify(await ids(D1)), '[7]');
  r.check('journée D-1 : sa garde, y compris 03h00 du lendemain', JSON.stringify(await ids(DM1)), '[8,9]');

  // ── Aperçu à l'écran ────────────────────────────────────────────────
  r.section('Aperçu : deux sections séparées');
  const apercu = await page.evaluate(async j => {
    document.getElementById('registre-date').value = j;
    await renderRegistre();
    return document.getElementById('registre-apercu').innerText;
  }, D);
  r.check('section « Permanence du … »', /Permanence du /.test(apercu), true);
  r.check('section « Garde du … au … »', /Garde du .+ au /.test(apercu), true);

  // ── Impression : une page par poste ─────────────────────────────────
  r.section('Impression : permanence et garde sur des pages séparées');
  const imprime = j => page.evaluate(async x => {
    window.print = () => {};
    await imprimerRegistre(x);
    return [...document.querySelectorAll('#print-render > div')].map(d => d.innerText);
  }, j);

  const pages = await imprime(D);
  r.check('2 pages (permanence + garde)', pages.length, 2);
  r.check('page 1 = REGISTRE DU JOUR — PERMANENCE', /REGISTRE DU JOUR — PERMANENCE/.test(pages[0] || ''), true);
  r.check('page 2 = REGISTRE DU JOUR — GARDE', /REGISTRE DU JOUR — GARDE/.test(pages[1] || ''), true);
  r.check('page garde : « Garde du … au … »', /Garde du .+ au /.test(pages[1] || ''), true);
  const noms = (txt, ns) => ns.map(n => (txt || '').includes('P' + p(n)));
  r.check('permanence : P01 et P02 seulement', JSON.stringify(noms(pages[0], [1, 2, 3, 4, 5, 6])), '[true,true,false,false,false,false]');
  r.check('garde : P03 à P06 seulement', JSON.stringify(noms(pages[1], [1, 2, 3, 4, 5, 6])), '[false,false,true,true,true,true]');
  r.check('la page garde porte sa propre recette (3+4+5+6 = 18 000)', /18\s?000/.test(pages[1] || ''), true);
  r.check('la page permanence porte la sienne (1+2 = 3 000)', /3\s?000/.test(pages[0] || ''), true);

  const pagesD1 = await imprime(D1);
  r.check('journée sans garde : une seule page', pagesD1.length, 1);
  r.check('… la permanence', /PERMANENCE/.test(pagesD1[0] || ''), true);
  const pagesDM1 = await imprime(DM1);
  r.check('journée sans permanence : une seule page', pagesDM1.length, 1);
  r.check('… la garde', /GARDE/.test(pagesDM1[0] || ''), true);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 5));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
