// TDR paludisme (v13.252) — relevé de la semaine / du mois, sur le modèle de
// l'électrophorèse : TDR faits (résultat saisi) cochés pour l'impression, TDR
// demandés sans résultat saisissables depuis la liste, feuille A4 avec infos.
const { serve, openApp, createReporter } = require('./helpers');
const PORT = 8340;
const CIBLE = process.env.CIBLE || '/index.html';
const jour = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const AUJ = jour(new Date());
const IL_Y_A_8J = jour(new Date(Date.now() - 8 * 86400000));

const fiche = (id, nom, date, coches, hema, patient = {}) => ({
  id, type: 'Dossier', montant: 0, created_at: date + 'T09:00:00Z', created_by: 'agent1', prescripteur_id: null, est_bpn: false,
  patient: { nom, dossier: '0' + id + '-1026', date, statut: 'attente', ...patient },
  resultats: { _types: ['Hématologie'], _examens_coches: { 'Hématologie': coches }, ...(hema ? { 'Hématologie': hema } : {}) },
  restricted_by: null, deleted_at: null,
});
const ROWS = [
  fiche(801, 'ENFANT POSITIF', AUJ, ['TDR Paludisme'], { 'GE - TDR': 'Positif' }, { age: '3', sexe: 'M', service: 'Pédiatrie', telephone: '0700000001', medecin: 'DR KONE' }),
  fiche(802, 'ADULTE NEGATIF', AUJ, ['TDR Paludisme', 'Goutte épaisse (GE)'], { 'GE - TDR': 'Négatif', 'GE - Résultat': 'Négatif' }, { age: '34', sexe: 'F' }),
  fiche(803, 'TDR A SAISIR', AUJ, ['TDR Paludisme'], null, { age: '18 mois', sexe: 'F' }),
  fiche(804, 'ANCIEN LIBELLE SANS TDR', AUJ, ['Goutte épaisse / TDR Paludisme'], { 'GE - Résultat': 'Négatif' }),
  fiche(805, 'NFS SEULE', AUJ, ['NFS — Numération Formule Sanguine'], null),
  fiche(806, 'TDR SEMAINE PASSEE', IL_Y_A_8J, ['TDR Paludisme'], { 'GE - TDR': 'Positif' }, { age: '40' }),
];
ROWS[1].prescripteur_id = 3;            // prescripteur de la liste officielle
const PRESC = [{ id: 3, nom: 'Dr DIALLO Awa', specialite: '', structure: '', taux_ristourne: 0, actif: true }];
const FAIT_803 = { ...ROWS[2], resultats: { ...ROWS[2].resultats, 'Hématologie': { 'GE - TDR': 'Négatif' } } };

(async () => {
  const srv = await serve(PORT);
  const r = createReporter('TDR PALUDISME — RELEVÉ IMPRIMABLE');
  let erreurs = [];
  {
    const appels = [];
    const { ctx, page, errors } = await openApp({ role: 'admin', port: PORT, cible: CIBLE, appels,
      rpc: { get_resultats_light: ROWS, update_resultat: FAIT_803, get_prescripteurs: PRESC } });
    // Détail complet d'un dossier : le serveur renvoie la ligne demandée.
    await page.evaluate((rows) => {
      const vrai = _sb.rpc.bind(_sb);
      _sb.rpc = (nom, p) => nom === 'get_resultat_full'
        ? Promise.resolve({ data: rows.filter(x => x.id === p.p_id), error: null, status: 200 }) : vrai(nom, p);
      window.print = () => { window.__imprime = true; }; showView('historique');
    }, ROWS);
    await page.waitForTimeout(1200);
    r.section('Rangées dans « ⚙ Filtres »');
    r.check('électrophorèse et TDR dans le panneau Filtres', await page.evaluate(() =>
      ['electro-card', 'tdr-card'].map(id => !!document.getElementById(id).closest('#hist-filtres-avances')).join('|')), 'true|true');
    r.check('panneau replié : rien de visible ni de chargé', await page.evaluate(() =>
      (document.getElementById('tdr-card').offsetParent === null) + '|' + document.getElementById('tdr-apercu').innerHTML.trim().length), 'true|0');
    await page.click('#btn-filtres-avances');
    await page.waitForTimeout(900);
    r.check('« ⚙ Filtres » ouvert : listes visibles', await page.evaluate(() =>
      ['electro-card', 'tdr-card'].map(id => document.getElementById(id).offsetParent !== null).join('|')), 'true|true');
    r.section('Liste de la semaine');
    r.check('carte visible (admin)', await page.evaluate(() => getComputedStyle(document.getElementById('tdr-card')).display !== 'none'), true);
    const lignes = () => page.evaluate(() => [...document.querySelectorAll('#tdr-apercu tbody tr')].map(t => t.innerText.replace(/\s+/g, ' ').trim()));
    const l1 = await lignes();
    r.check('3 lignes : 2 faits + 1 à saisir', l1.length, 3);
    r.check('exclus : ancien libellé sans TDR, NFS seule, semaine passée',
      l1.some(t => /ANCIEN LIBELLE|NFS SEULE|SEMAINE PASSEE/.test(t)), false);
    r.check('récapitulatif', await page.evaluate(() => document.querySelector('#tdr-apercu').innerText.split('\n')[0].replace(/\s+/g, ' ')),
      '2 TDR fait(s) · 1 positif(s) · 1 négatif(s) · moins de 5 ans : 1 (dont 1 positif(s)) · 1 à saisir (surlignés)');
    r.check('ligne : date, dossier, nom, âge, sexe, prescripteur, TDR', (l1.find(t => /ENFANT POSITIF/.test(t)) || '').replace(/^\S+ /, ''),
      '0801-1026 ENFANT POSITIF 3 ans M DR KONE Positif');
    r.check('prescripteur de la liste officielle', /ADULTE NEGATIF 34 ans F Dr DIALLO Awa Négatif/.test(l1.join(' | ')), true);
    r.check('colonnes à l\'écran', await page.evaluate(() => [...document.querySelectorAll('#tdr-apercu thead th')].map(t => t.textContent.trim()).join(' | ')),
      'Imprimer | Date | N° dossier | Nom | Âge | Sexe | Prescripteur | TDR');
    r.check('à saisir : liste Positif/Négatif, pas de case Imprimer', await page.evaluate(() =>
      !!document.getElementById('tdr-res-803') + '|' + !document.querySelector('input[data-tdr-imp="803"]')), 'true|true');

    r.section('Résultat saisi depuis la liste');
    await page.evaluate(async () => { document.getElementById('tdr-res-803').value = 'Négatif'; await enregistrerTdrResultat(803); });
    await page.waitForTimeout(600);
    r.check('envoyé au serveur (update_resultat)', appels.includes('update_resultat'), true);
    r.check('écrit dans le dossier (Hématologie → GE - TDR)', await page.evaluate(() =>
      (_dbCache.find(x => x.id === 803).resultats['Hématologie'] || {})['GE - TDR']), 'Négatif');
    r.check('la ligne passe en « fait » (case Imprimer)', await page.evaluate(() => !!document.querySelector('input[data-tdr-imp="803"]')), true);

    r.section('Impression des lignes cochées');
    const html = await page.evaluate(async () => {
      const cb = document.querySelector('input[data-tdr-imp="802"]'); cb.checked = false; cb.dispatchEvent(new Event('change'));
      window.__imprime = false; await imprimerTdr();
      return { imprime: window.__imprime, html: document.getElementById('print-render').innerHTML, txt: document.getElementById('print-render').innerText,
               cols: [...document.querySelectorAll('#print-render thead th')].map(t => t.textContent.trim()).join(' | ') };
    });
    r.check('impression lancée', html.imprime, true);
    r.check('lignes cochées seulement', [/ENFANT POSITIF/.test(html.txt), /TDR A SAISIR/.test(html.txt), /ADULTE NEGATIF/.test(html.txt)].join('|'), 'true|true|false');
    r.check('colonnes imprimées', html.cols, 'N° | Date | N° dossier | Nom et prénoms | Âge | Sexe | Prescripteur | Résultat TDR');
    r.check('prescripteur imprimé ; ni téléphone, ni service, ni GE', [/DR KONE/.test(html.txt), /0700000001|Pédiatrie|Goutte/.test(html.txt)].join('|'), 'true|false');
    r.check('récapitulatif imprimé', /Total : 2 · Positifs : 1 · Négatifs : 1 · Moins de 5 ans : 2 \(dont 1 positif\(s\)\)/.test(html.txt), true);
    r.check('A4 portrait', /size:A4;/.test(html.html) && !/landscape/.test(html.html), true);
    r.check('tout décoché : rien à imprimer, message clair', await page.evaluate(async () => {
      tdrToutCocher(false); window.__imprime = false; const t = window.toast; let m = ''; window.toast = (x) => { m = x; };
      await imprimerTdr(); window.toast = t; return window.__imprime + '|' + m; }), 'false|Aucun TDR coché à imprimer');

    r.section('Vue par mois et navigation');
    const memeMois = AUJ.slice(0, 7) === IL_Y_A_8J.slice(0, 7);
    await page.evaluate(() => { tdrToutCocher(true); setTdrMode('mois'); });
    await page.waitForTimeout(500);
    r.check('mois : semaine passée incluse si même mois', (await lignes()).some(t => /SEMAINE PASSEE/.test(t)), memeMois);
    const lib1 = await page.evaluate(() => document.getElementById('tdr-periode-label').textContent);
    await page.evaluate(() => decalerTdr(-1)); await page.waitForTimeout(300);
    const lib2 = await page.evaluate(() => document.getElementById('tdr-periode-label').textContent);
    r.check('◀ change de mois', lib1 !== lib2 && /\d{4}$/.test(lib2), true);
    await page.evaluate(() => { setTdrMode('semaine'); retourTdrPeriode(); }); await page.waitForTimeout(300);
    r.check('retour à la semaine actuelle', /^Semaine du lundi/.test(await page.evaluate(() => document.getElementById('tdr-periode-label').textContent)), true);
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Qui voit la carte');
    for (const [role, attendu] of [['responsable', true], ['agent', false]]) {
      const { ctx, page, errors } = await openApp({ role, username: role === 'agent' ? 'agent1' : 'Responsable', port: PORT, cible: CIBLE,
        rpc: { get_resultats_light: ROWS, list_users_admin: [] } });
      await page.evaluate(() => showView('historique')); await page.waitForTimeout(700);
      r.check(role, await page.evaluate(() => getComputedStyle(document.getElementById('tdr-card')).display !== 'none'), attendu);
      erreurs = erreurs.concat(errors); await ctx.close();
    }
  }
  r.check('aucune erreur JS', erreurs.length, 0);
  if (erreurs.length) console.log('   ', erreurs.slice(0, 3));
  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();
