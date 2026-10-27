// ════════════════════════════════════════════════════════════════════
//  Archive du mois (v13.268) — un ZIP à LIRE sans l'application :
//  comptes rendus (masqués compris), sommaire, registre, caisse et
//  statistiques, tableur, rapport d'activité.
//
//  Le ZIP téléchargé est relu ici par un lecteur indépendant (zlib de Node,
//  et Python s'il est présent) : on vérifie le format, puis le contenu.
// ════════════════════════════════════════════════════════════════════
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { serve, openApp, createReporter } = require('./helpers');

const PORT = 8371;

// ── Lecteur ZIP minimal, indépendant de l'application ──
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t.push(c >>> 0); } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (const x of b) c = CRC[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function lireZip(buf) {
  let fin = buf.length - 22;
  while (fin >= 0 && buf.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('fin de ZIP introuvable');
  const n = buf.readUInt16LE(fin + 10), debutCentral = buf.readUInt32LE(fin + 16);
  const fichiers = {}; let crcOk = true, methodes = new Set();
  for (let i = 0, p = debutCentral; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('répertoire central invalide');
    const methode = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), taille = buf.readUInt32LE(p + 20);
    const lgNom = buf.readUInt16LE(p + 28), lgExtra = buf.readUInt16LE(p + 30), lgCom = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42), nom = buf.slice(p + 46, p + 46 + lgNom).toString('utf8');
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('en-tête local invalide : ' + nom);
    const dl = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const brut = buf.slice(dl, dl + taille);
    const contenu = methode === 8 ? zlib.inflateRawSync(brut) : brut;
    if (crc32(contenu) !== crc) crcOk = false;
    methodes.add(methode);
    fichiers[nom] = contenu;
    p += 46 + lgNom + lgExtra + lgCom;
  }
  return { fichiers, crcOk, methodes: [...methodes] };
}
const pythonValide = f => {
  try { execFileSync('python3', ['--version'], { stdio: 'ignore' }); } catch (e) { return 'absent'; }
  try {
    return execFileSync('python3', ['-I', '-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print("ok" if z.testzip() is None else "ko")', f]).toString().trim();
  } catch (e) { return 'ko'; }
};

// ── Jeu de données : septembre 2026 ──
const NFS_GE = {
  _types: ['Hématologie'],
  _examens_coches: { 'Hématologie': ['NFS — Numération Formule Sanguine', 'Goutte épaisse / TDR Paludisme'] },
  'Hématologie': {
    'Globules blancs (GB)': { valeur: '8.09', unite: '10³/µL', interp: '' },
    'Hémoglobine (Hb)': { valeur: '9.1', unite: 'g/dL', interp: 'Bas' },
    'Plaquettes': { valeur: '155', unite: '10³/µL', interp: '' },
    'GE - Résultat': 'Positif', 'GE - Densité parasitaire (/µL)': '1200', 'GE - Espèce': 'P. falciparum',
  },
};
const GE_SEULE = {
  _types: ['Hématologie'],
  _examens_coches: { 'Hématologie': ['Goutte épaisse / TDR Paludisme'] },
  'Hématologie': { 'GE - Résultat': 'Négatif' },
};
const paye = (agent, extra) => ({ paiement_status: 'paye', paiement_infos: Object.assign({ agent, date: '2026-09-20T10:00:00Z' }, extra || {}) });
const D = (id, quand, nom, dossier, montant, res, patient, autre) => Object.assign({
  id, type: 'Dossier', montant, created_at: quand,
  patient: Object.assign({ nom, dossier, sexe: 'F', age: '30', date: quand.slice(0, 10), medecin: 'Dr ALPHA', service: 'Maternité' }, patient || {}),
  resultats: res, created_by: 'agent1', prescripteur_id: 1, est_bpn: false,
}, autre || {});
const DOSSIERS = [
  D(201, '2026-09-03T10:15:00Z', 'DIARRA ROKIA', '0101-0926', 5000, NFS_GE, paye('caisse1')),
  D(202, '2026-09-03T18:30:00Z', 'KOUASSI AMA', '0102-0926', 1500, GE_SEULE,
    { remise_montant: -500, remise_le: '2026-09-03', remise_demandee_par: 'Dr ALPHA', remise_par: 'agent1' }),
  // 02h10 le 4 : garde commencée le 3 → journée du 3.
  D(203, '2026-09-04T02:10:00Z', 'TRAORE MOUSSA', '0103-0926', 2000, GE_SEULE,
    paye('caisse1', { monnaie: 500, monnaie_remise: false })),
  // Masqué : présent seulement si le coffre est ouvert.
  D(204, '2026-09-15T09:00:00Z', 'SECRET YAO', '0104-0926', 7000, NFS_GE, paye('admin')),
  D(205, '2026-09-30T20:00:00Z', 'NUIT FIN', '0105-0926', 2000, GE_SEULE, paye('caisse2')),
  // 03h00 le 1er octobre : garde du 30 septembre → dans septembre.
  D(206, '2026-10-01T03:00:00Z', 'AUBE GARDE', '0106-0926', 1500, GE_SEULE, paye('caisse2')),
  // 05h00 le 1er septembre : garde du 31 août → hors septembre.
  D(207, '2026-09-01T05:00:00Z', 'AOUT HORS', '0099-0826', 3000, GE_SEULE, paye('caisse1')),
  // Supprimé (corbeille) → exclu.
  D(208, '2026-09-10T10:00:00Z', 'SUPPRIME ZED', '0108-0926', 4000, GE_SEULE, paye('caisse1')),
  D(209, '2026-10-05T10:00:00Z', 'OCTOBRE HORS', '0001-1026', 3000, GE_SEULE, paye('caisse1')),
];

async function ouvrir(options) {
  const o = await openApp({ role: 'admin', username: 'admin', port: PORT });
  await o.page.evaluate(({ dossiers, coffreOuvert, echecFull }) => {
    const leger = d => Object.assign({}, d, { resultats: Object.fromEntries(Object.entries(d.resultats).filter(([k]) => k[0] === '_')) });
    const visibles = dossiers.filter(d => coffreOuvert || d.id !== 204);
    window.__fullAppels = 0;
    _sb.rpc = async (n, p) => {
      if (n === 'get_resultats_light') return { data: visibles.map(leger), error: null };
      if (n === 'get_resultat_full') {
        window.__fullAppels++;
        if (echecFull && p.p_id === echecFull) return { data: null, error: { message: 'réseau' } };
        const d = visibles.find(x => x.id === p.p_id);
        return { data: d ? [d] : [], error: null };
      }
      if (n === 'get_restriction_status') return { data: coffreOuvert ? [{ id: 204, restricted_by: 'admin' }] : [], error: null };
      if (n === 'get_deleted_status') return { data: [{ id: 208, deleted_at: '2026-09-11T08:00:00Z', deleted_by: 'admin' }], error: null };
      if (n === 'list_clotures') return { data: [{ jour: '2026-09-03' }], error: null };
      if (n === 'get_prescripteurs') return { data: [{ id: 1, nom: 'Dr ALPHA', actif: true, taux_ristourne: 10, structure: 'Clinique Les Palmiers' }], error: null };
      if (n === 'etat_coffre') return { data: { configure: true, ouvert: coffreOuvert }, error: null };
      return { data: [], error: null };
    };
  }, Object.assign({ dossiers: DOSSIERS, coffreOuvert: true, echecFull: null }, options));
  await o.page.evaluate(() => refreshDB(true));
  return o;
}

async function telecharger(page, appel) {
  const dl = page.waitForEvent('download', { timeout: 60000 });
  await page.evaluate(appel);
  const d = await dl;
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'archive-')), d.suggestedFilename());
  await d.saveAs(f);
  return f;
}

(async () => {
  const srv = await serve(PORT);
  const r = createReporter('ARCHIVE DU MOIS (ZIP À LIRE)');
  let erreurs = [];
  try {
    {
      const { ctx, page, errors } = await ouvrir({});
      r.section('Mois proposé par défaut');
      r.check('le 10 novembre → octobre', await page.evaluate(() => moisArchiveParDefaut('2026-11-10T09:00:00')), '2026-10');
      r.check('le 5 janvier → décembre précédent', await page.evaluate(() => moisArchiveParDefaut('2027-01-05T09:00:00')), '2026-12');
      r.check('dossiers de septembre (journées de service)', await page.evaluate(() =>
        dossiersDuMois('2026-09').map(x => x.id).join(',')), '201,202,203,204,205,206');

      r.section('Téléchargement depuis la carte « Archive du mois »');
      await page.evaluate(() => { showView('comptes'); });
      await page.evaluate(() => { const c = document.getElementById('archive-mois'); c.value = '2026-09'; });
      const f = await telecharger(page, () => telechargerArchiveMois());
      r.check('nom du fichier', path.basename(f), 'LaboSaisie_Archive_2026-09_Septembre.zip');
      const zip = lireZip(fs.readFileSync(f));
      r.check('ZIP lisible, contrôles CRC exacts', zip.crcOk, true);
      r.check('compressé (deflate)', zip.methodes.includes(8), true);
      r.check('Python reconnaît le ZIP', ['ok', 'absent'].includes(pythonValide(f)), true);
      const R = 'Archive_2026-09_Septembre_2026/';
      const noms = Object.keys(zip.fichiers);
      const txt = n => (zip.fichiers[R + n] || Buffer.alloc(0)).toString('utf8');
      ['LISEZ-MOI.txt', '0_Sommaire.html', '1_Registre_du_mois.html', '2_Caisse_et_statistiques.html',
       '3_Registre_et_caisse.xlsx', '4_Rapport_activite.pdf'].forEach(n => r.check('contient ' + n, noms.includes(R + n), true));
      const crs = noms.filter(n => n.startsWith(R + 'Comptes-rendus/')).map(n => n.slice(R.length + 15)).sort();
      r.check('un compte rendu par dossier du mois', crs.length, 6);
      r.check('masqué compris et signalé', crs.some(n => /0104-0926_SECRET_YAO_MASQUE\.html$/.test(n)), true);
      r.check('garde du 30 (03h le 1er) comprise', crs.some(n => /^2026-09-30_0106-0926_AUBE_GARDE/.test(n)), true);
      r.check('02h10 le 4 rangé au 3', crs.some(n => /^2026-09-03_0103-0926_TRAORE_MOUSSA/.test(n)), true);
      r.check('hors mois et corbeille absents', crs.some(n => /AOUT|OCTOBRE|SUPPRIME/.test(n)), false);

      r.section('Compte rendu : identique à l\'impression');
      const cr = txt('Comptes-rendus/2026-09-03_0101-0926_DIARRA_ROKIA.html');
      const crTexte = cr.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      r.check('page HTML autonome (UTF-8)', /^<!doctype html>/i.test(cr) && /<meta charset="utf-8">/.test(cr), true);
      r.check('en-tête du laboratoire', /CPMI DE GRAND-BASSAM/.test(crTexte), true);
      r.check('nom et n° de dossier', /DIARRA ROKIA/.test(crTexte) && /0101-0926/.test(crTexte), true);
      r.check('résultats détaillés (Hb, GE positive)', /Hémoglobine/.test(crTexte) && /9\.1/.test(crTexte) && /Positif/.test(crTexte), true);
      r.check('QR de vérification intégré', /<img src="data:image\/png;base64,/.test(cr), true);
      r.check('mise en page d\'impression (pied fixe)', /cr-foot-fixed/.test(cr) && /@page/.test(cr), true);
      r.check('aucun script dans le compte rendu', /<script/i.test(cr), false);
      const crMasque = txt(crs.filter(n => /SECRET_YAO/.test(n)).map(n => 'Comptes-rendus/' + n)[0]);
      r.check('compte rendu du masqué complet', /SECRET YAO/.test(crMasque) && /Hémoglobine/.test(crMasque), true);
      r.check('dossier en mémoire non modifié (réf.)', await page.evaluate(() =>
        _dbCache.filter(x => x.patient && x.patient.ref_doc).length), 0);

      r.section('Sommaire');
      const som = txt('0_Sommaire.html');
      r.check('6 dossiers listés', (som.match(/<tr( class="masque")?><td>2026-09/g) || []).length, 6);
      r.check('liens vers les comptes rendus', /href="Comptes-rendus\/2026-09-03_0101-0926_DIARRA_ROKIA\.html"/.test(som), true);
      r.check('masqué signalé', /SECRET YAO[\s\S]{0,200}MASQUÉ/.test(som), true);
      r.check('recherche intégrée', /id="q"/.test(som), true);
      r.check('garde après minuit : date réelle', /2026-09-03 02h10 le 04\/09/.test(som), true);
      const vue = await ctx.newPage();
      await vue.setContent(som);
      r.check('compteur de la recherche', await vue.evaluate(() => document.getElementById('nb').textContent), '6 dossier(s)');
      r.check('recherche « traore » → 1 ligne', await vue.evaluate(() => {
        const q = document.getElementById('q'); q.value = 'traore'; q.dispatchEvent(new Event('input'));
        return [...document.querySelectorAll('#liste tbody tr')].filter(t => t.style.display !== 'none').length;
      }), 1);
      await vue.close();

      r.section('Registre du mois');
      const reg = txt('1_Registre_du_mois.html');
      r.check('titre', /REGISTRE DU MOIS — SEPTEMBRE 2026/.test(reg), true);
      r.check('journée du 3 : permanence et garde', /jeudi 3 septembre 2026/.test(reg) && /Permanence du jeudi 3 septembre/.test(reg) && /Garde du jeudi 3/.test(reg), true);
      r.check('journée verrouillée signalée', /JOURNÉE VERROUILLÉE/.test(reg), true);
      r.check('synthèse des résultats', /GE POSITIF \(1200\/µL · P\. falciparum\)/.test(reg), true);
      r.check('non payé visible', /KOUASSI AMA[\s\S]*?non payé/.test(reg), true);
      r.check('masqué grisé', /<tr class="masque">[\s\S]*?SECRET YAO/.test(reg), true);

      r.section('Caisse et statistiques');
      const cai = txt('2_Caisse_et_statistiques.html').replace(/[  ]/g, ' ');
      // Encaissés hors masqué : 5000 + 2000 + 2000 + 1500 = 10 500.
      r.check('recette du mois', /RECETTE DU MOIS<\/div><div[^>]*>10 500 FCFA/.test(cai), true);
      r.check('non encaissé (1 · 1 500)', /Non encaissés<b>1<\/b>1 500 F/.test(cai), true);
      r.check('masqué hors recette (1 · 7 000)', /Masqués \(hors recette\)<b>1<\/b>7 000 F/.test(cai), true);
      r.check('monnaie non rendue (500)', /Monnaie non rendue<b>1<\/b>500 F/.test(cai), true);
      r.check('réduction de 500 (demandée par Dr ALPHA)', /Réductions<b>− 500 F/.test(cai) && /KOUASSI AMA<\/td><td class="n">− 500 F<\/td><td>Dr ALPHA/.test(cai), true);
      r.check('clôture du jeudi 3 : 7 000 F', /jeudi 3 septembre<\/td><td>oui<\/td><td class="n">2<\/td>[\s\S]*?<strong>7 000<\/strong>/.test(cai), true);
      r.check('par agent : caisse1 7 000 F', /<td>caisse1<\/td><td class="n">2<\/td><td class="n">7 000 F/.test(cai), true);
      r.check('ristourne Dr ALPHA (10 %)', /Dr ALPHA<\/td><td>Clinique Les Palmiers<\/td>/.test(cai), true);

      r.section('Tableur et rapport');
      const xl = zip.fichiers[R + '3_Registre_et_caisse.xlsx'];
      const xlZip = lireZip(xl);
      const feuilles = Object.keys(xlZip.fichiers).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).length;
      r.check('tableur valide (8 feuilles)', feuilles, 8);
      const partage = (xlZip.fichiers['xl/sharedStrings.xml'] || Buffer.alloc(0)).toString('utf8');
      r.check('registre détaillé dans le tableur', /SECRET YAO/.test(partage) && /Comptes-rendus\/2026-09-03_0101-0926_DIARRA_ROKIA\.html/.test(partage), true);
      r.check('rapport d\'activité PDF', zip.fichiers[R + '4_Rapport_activite.pdf'].slice(0, 5).toString(), '%PDF-');
      const fr = await telecharger(page, () => {
        const m = document.getElementById('rapport-mois'), a = document.getElementById('rapport-annee');
        if (m) m.value = '9'; if (a) a.value = '2026';
        return genererRapportMensuel();
      });
      r.check('bouton « Rapport mensuel » inchangé', path.basename(fr) + ' ' + fs.readFileSync(fr).slice(0, 5).toString(),
        'Rapport_activite_Septembre_2026.pdf %PDF-');

      r.section('LISEZ-MOI');
      const lm = txt('LISEZ-MOI.txt');
      r.check('explique que ce n\'est pas une restauration', /PAS une sauvegarde à restaurer/.test(lm), true);
      r.check('masqués inclus (pas d\'alerte)', /Dossiers masqués : 1\r\n/.test(lm), true);
      r.check('état affiché à l\'écran', await page.evaluate(() => /✓ LaboSaisie_Archive_2026-09_Septembre\.zip/.test(document.getElementById('archive-etat').textContent)), true);
      erreurs = erreurs.concat(errors); await ctx.close();
    }
    {
      r.section('Session ordinaire : masqués absents, et c\'est dit');
      const { ctx, page, errors } = await ouvrir({ coffreOuvert: false });
      const f = await telecharger(page, () => telechargerArchiveMois('2026-09'));
      const zip = lireZip(fs.readFileSync(f));
      const R = 'Archive_2026-09_Septembre_2026/';
      const lm = zip.fichiers[R + 'LISEZ-MOI.txt'].toString('utf8');
      r.check('5 comptes rendus (masqué absent)', Object.keys(zip.fichiers).filter(n => n.includes('/Comptes-rendus/')).length, 5);
      r.check('LISEZ-MOI : avertissement', /ATTENTION : session ordinaire/.test(lm), true);
      r.check('écran : avertissement', await page.evaluate(() => /masqués non inclus/.test(document.getElementById('archive-etat').textContent)), true);
      erreurs = erreurs.concat(errors); await ctx.close();
    }
    {
      r.section('Lecture incomplète : archive refusée');
      const { ctx, page, errors } = await ouvrir({ echecFull: 203 });
      let telecharge = false;
      page.on('download', () => { telecharge = true; });
      await page.evaluate(() => telechargerArchiveMois('2026-09'));
      await page.waitForTimeout(500);
      r.check('aucun fichier téléchargé', telecharge, false);
      r.check('message clair', await page.evaluate(() => /1 dossier\(s\) n'ont pas pu être lus/.test(document.getElementById('archive-etat').textContent)), true);
      r.check('une seconde tentative a eu lieu', await page.evaluate(() => window.__fullAppels >= 7), true);
      erreurs = erreurs.concat(errors); await ctx.close();
    }
    {
      r.section('ZIP sans compression du navigateur (anciens téléphones)');
      const { ctx, page, errors } = await ouvrir({});
      const octets = await page.evaluate(async () => {
        window.CompressionStream = undefined;
        const b = await creerZip([{ nom: 'a/é.txt', contenu: 'Bonjour é' }, { nom: 'b.bin', contenu: new Uint8Array([0, 1, 2, 255]) }]);
        return Array.from(new Uint8Array(await b.arrayBuffer()));
      });
      const z = lireZip(Buffer.from(octets));
      r.check('fichiers stockés, CRC exacts', z.crcOk && z.methodes.join() === '0', true);
      r.check('nom accentué et contenu intacts', z.fichiers['a/é.txt'].toString('utf8') + '|' + Array.from(z.fichiers['b.bin']).join(','), 'Bonjour é|0,1,2,255');
      erreurs = erreurs.concat(errors); await ctx.close();
    }
    r.check('aucune erreur JS', erreurs.length, 0);
    if (erreurs.length) console.log(erreurs);
  } catch (e) {
    console.error(e);
    r.check('exécution sans exception', String(e && e.message || e), 'aucune');
  }
  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();
