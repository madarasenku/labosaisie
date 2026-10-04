// ════════════════════════════════════════════════════════════════════
//  poste-garde-permanence — labo ouvert 24h/24.
//
//  Le poste de travail est déduit de l'HEURE D'ENREGISTREMENT locale :
//    • Permanence = 08h00 → 16h00
//    • Garde      = le reste (16h00 → 08h00, nuit incluse)
//  On vérifie : les bornes de posteDepuisHeure, et surtout que la clôture
//  répartit la recette par poste SANS changer le total (somme = recette).
//
//  Robustesse TZ : les horodatages sont construits en heure LOCALE puis
//  sérialisés (new Date(Y,M,D,h).toISOString()) ; new Date(iso).getHours()
//  redonne la même heure quel que soit le fuseau du runner.
// ════════════════════════════════════════════════════════════════════
const { serve, openApp, createReporter } = require('./helpers');

const p = n => String(n).padStart(2, '0');
const now = new Date();
const AUJ = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate());
const atHour = h => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0, 0).toISOString();

const pay = (m) => ({ montant_demande: m, montant_recu: m, monnaie: 0, monnaie_rendue: 0, monnaie_remise: true, agent: 'nadia' });
const fiche = (id, h, montant) => ({
  id, type: 'Hématologie', montant, created_at: atHour(h), created_by: 'nadia',
  patient: { nom: 'P' + id, dossier: 'D' + id, date: AUJ, statut: 'rendu',
             paiement_status: 'paye', paiement_infos: pay(montant) },
  resultats: {}, prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null,
});

// Permanence : 08h, 10h, 15h → 1500 + 3000 + 2000 = 6500 (3 dossiers)
// Garde      : 16h, 22h, 07h → 1000 + 5000 + 4000 = 10000 (3 dossiers)
const FICHES = [
  fiche(1, 8, 1500), fiche(2, 10, 3000), fiche(3, 15, 2000),
  fiche(4, 16, 1000), fiche(5, 22, 5000), fiche(6, 7, 4000),
];
const PERM_TOTAL = 6500, GARDE_TOTAL = 10000, TOTAL = 16500;

(async () => {
  const srv = await serve();
  const r = createReporter('POSTE — GARDE / PERMANENCE');

  const { ctx, page, errors } = await openApp({
    role: 'admin',
    rpc: { get_tarifs: {}, get_examens_custom: [], get_resultats_light: FICHES, get_restriction_status: [] },
  });

  // ── Bornes de posteDepuisHeure ──────────────────────────────────────
  r.section('Découpage horaire (8h–16h = Permanence)');
  const bornes = await page.evaluate((hs) => hs.map(iso => posteDepuisHeure(iso)), [
    atHour(8), atHour(15), atHour(12), atHour(16), atHour(7), atHour(23), atHour(0),
  ]);
  r.check('08h00 → Permanence', bornes[0], 'Permanence');
  r.check('15h00 → Permanence', bornes[1], 'Permanence');
  r.check('12h00 → Permanence', bornes[2], 'Permanence');
  r.check('16h00 → Garde (borne exclue)', bornes[3], 'Garde');
  r.check('07h00 → Garde', bornes[4], 'Garde');
  r.check('23h00 → Garde', bornes[5], 'Garde');
  r.check('minuit → Garde', bornes[6], 'Garde');
  const vide = await page.evaluate(() => posteDepuisHeure(null));
  r.check('horodatage absent → Garde (défaut sûr)', vide, 'Garde');

  // ── Répartition de la clôture par poste ─────────────────────────────
  r.section('Clôture : recette par poste');
  const c = await page.evaluate(j => calculerCloture(j), AUJ);
  r.check('recette totale', c.total, TOTAL);
  r.check('permanence — total', c.parPoste.Permanence.total, PERM_TOTAL);
  r.check('permanence — dossiers', c.parPoste.Permanence.nb, 3);
  r.check('garde — total', c.parPoste.Garde.total, GARDE_TOTAL);
  r.check('garde — dossiers', c.parPoste.Garde.nb, 3);
  // L'invariant qui compte : la répartition ne crée ni ne perd d'argent.
  r.check('somme des postes = recette', c.parPoste.Permanence.total + c.parPoste.Garde.total, c.total);
  r.check('somme des dossiers = total', c.parPoste.Permanence.nb + c.parPoste.Garde.nb, c.dossiers);

  // ── Le document imprimé contient le bloc « par poste » ──────────────
  r.section('Clôture imprimée');
  const doc = await page.evaluate(() => {
    const vp = window.print; window.print = () => {};
    imprimerCloture(); window.print = vp;
    return document.getElementById('print-render').innerHTML;
  });
  r.check('bloc « Répartition par poste » présent', /Répartition par poste/.test(doc), true);
  r.check('ligne Permanence imprimée', /Permanence/.test(doc), true);
  r.check('ligne Garde imprimée', /Garde/.test(doc), true);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 3));
  await ctx.close();
  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();
