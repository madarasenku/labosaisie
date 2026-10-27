/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — archive-mois.js

   ✅ v13.268 — ARCHIVE DU MOIS : un fichier ZIP à LIRE, pas à restaurer.

   La sauvegarde (💾, sauvegarde.js) est un fichier technique qui ne sert
   qu'à remettre la base en état, en cas d'extrême nécessité. Pour un
   patient qui revient, une contestation, un contrôle, on veut au contraire
   des documents qu'on ouvre directement, sans l'application :

     0_Sommaire.html                 tous les dossiers du mois, recherche, liens
     1_Registre_du_mois.html         registre jour par jour (permanence / garde)
     2_Caisse_et_statistiques.html   clôtures, agents, examens, prescripteurs,
                                     ristournes, réductions, impayés, masqués
     3_Registre_et_caisse.xlsx       les mêmes chiffres, en tableur
     4_Rapport_activite.pdf          le rapport d'activité mensuel habituel
     Comptes-rendus/                 UN compte rendu par dossier, identique
                                     à l'impression (masqués compris)

   Le mois = les JOURNÉES DE SERVICE du mois (permanence + garde qui finit
   le lendemain à 8h), comme la clôture de caisse et le registre du jour.
   Les dossiers supprimés (corbeille) n'y sont pas.

   Les dossiers MASQUÉS n'arrivent dans l'application que si l'administrateur
   est entré par la seconde porte (coffre) : sinon le serveur ne les envoie
   pas, et l'archive le signale (LISEZ-MOI et écran).

   ✅ v13.269 — SUPPRIMER UN MOIS ARCHIVÉ pour libérer de la place sur le
   serveur. Tout se décide côté serveur (purger_mois) : on garde toujours les
   3 derniers mois complets ; il faut l'archive du mois (masqués compris,
   notée par noter_archive_mois) puis une sauvegarde faite après elle, et
   aucun dossier du mois modifié depuis. Une trace (n°, nom, date) garde les
   QR imprimés vérifiables. Annulable tant que les copies de nuit (15 jours)
   contiennent le mois.

   Chargé en script classique (après sauvegarde.js, cloture-caisse.js et
   registre-jour.js, dont il réutilise les calculs) — voir index.html.
   ═══════════════════════════════════════════════════════════════ */

// ── ZIP, sans bibliothèque ────────────────────────────────────────
//   Format ZIP standard (lisible par Windows, Android, macOS). Compression
//   « deflate » du navigateur quand elle existe, sinon fichiers stockés tels
//   quels (toujours valide, simplement plus gros).
const _ZIP_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function _crc32(octets) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < octets.length; i++) c = _ZIP_CRC[(c ^ octets[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
async function _deflateBrut(octets) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const flux = new Blob([octets]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(flux).arrayBuffer());
  } catch (e) { return null; }
}

/** fichiers : [{ nom, contenu }] — contenu : texte, ArrayBuffer ou Uint8Array. */
async function creerZip(fichiers, date) {
  const enc = new TextEncoder();
  const d = date || new Date();
  const heure = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const jour = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const morceaux = [], central = [];
  let decalage = 0;
  for (const f of fichiers) {
    const nom = enc.encode(f.nom);
    const brut = typeof f.contenu === 'string' ? enc.encode(f.contenu) : new Uint8Array(f.contenu);
    const crc = _crc32(brut);
    const comp = await _deflateBrut(brut);
    const methode = (comp && comp.length < brut.length) ? 8 : 0;
    const donnees = methode === 8 ? comp : brut;
    // En-tête local. Drapeau 0x0800 : noms de fichiers en UTF-8.
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true);
    loc.setUint16(8, methode, true); loc.setUint16(10, heure, true); loc.setUint16(12, jour, true);
    loc.setUint32(14, crc, true); loc.setUint32(18, donnees.length, true); loc.setUint32(22, brut.length, true);
    loc.setUint16(26, nom.length, true);
    morceaux.push(new Uint8Array(loc.buffer), nom, donnees);
    // Entrée du répertoire central.
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true); cen.setUint16(10, methode, true);
    cen.setUint16(12, heure, true); cen.setUint16(14, jour, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, donnees.length, true); cen.setUint32(24, brut.length, true);
    cen.setUint16(28, nom.length, true);
    cen.setUint32(42, decalage, true);
    central.push(new Uint8Array(cen.buffer), nom);
    decalage += 30 + nom.length + donnees.length;
  }
  const tailleCentral = central.reduce((t, m) => t + m.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, fichiers.length, true); fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentral, true); fin.setUint32(16, decalage, true);
  return new Blob([...morceaux, ...central, new Uint8Array(fin.buffer)], { type: 'application/zip' });
}

// ── Mois et dossiers ──────────────────────────────────────────────
/** Mois archivé par défaut : le mois PRÉCÉDENT (archive faite le 10). */
function moisArchiveParDefaut(maintenant) {
  const d = maintenant ? new Date(maintenant) : new Date();
  const m = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0');
}
function _joursDuMois(mois) {
  const [a, m] = mois.split('-').map(Number);
  const n = new Date(a, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => mois + '-' + String(i + 1).padStart(2, '0'));
}
function _libelleMois(mois) {
  const [a, m] = mois.split('-').map(Number);
  return MOIS_FR[m - 1] + ' ' + a;
}
function _jourServiceArchive(r) {
  return (typeof posteInfoDossier === 'function') ? posteInfoDossier(r).jour : _recDate(r);
}
/** Dossiers du mois (journées de service), masqués compris, corbeille exclue. */
function dossiersDuMois(mois) {
  return (_dbCache || [])
    .filter(r => !r.deletedAt && !r._hardDeleted && !r._pending
              && String(_jourServiceArchive(r) || '').slice(0, 7) === mois)
    .sort((a, b) => String(a.savedAt || '').localeCompare(String(b.savedAt || '')) || (a.id - b.id));
}

/** Charge le détail complet (le cache est « léger »), 6 dossiers à la fois.
 *  Renvoie les dossiers restés incomplets après une seconde tentative. */
async function _chargerDetailsArchive(recs, avance) {
  let fait = 0;
  const passe = async (liste) => {
    const file = liste.slice();
    const ouvrier = async () => {
      for (let r = file.shift(); r; r = file.shift()) {
        await ensureFull(r);
        if (avance) avance(++fait, recs.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, file.length) }, ouvrier));
    return liste.filter(r => r._light);
  };
  const reste = await passe(recs);
  if (!reste.length) return [];
  fait = recs.length - reste.length;
  return passe(reste);
}

// ── Pages autonomes ───────────────────────────────────────────────
function _nomFichierSur(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'sans-nom';
}
function _pageAutonome(titre, corps, style) {
  return '<!doctype html>\n<html lang="fr"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta name="robots" content="noindex, nofollow">'
    + '<title>' + esc(titre) + '</title>' + (style || '') + '</head><body>' + corps + '</body></html>';
}
function _horodatageLisible(d) {
  return d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
/** « 10h15 » ; pour une garde après minuit, la date réelle : « 02h10 le 04/09 ». */
function _heureDe(ts, jourService) {
  const d = new Date(ts);
  if (isNaN(d)) return '';
  const h = String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0');
  return (jourService && _jourLocal(d) !== jourService)
    ? h + ' le ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') : h;
}

// Compte rendu : à l'écran, une feuille lisible ; à l'impression, EXACTEMENT
// la mise en page de l'application (pied fixe en bas de chaque feuille).
const _STYLE_CR_ARCHIVE = '<style>'
  + '#print-render{font-size:12.5pt}'
  + '.arch-note{font:13px/1.4 system-ui,sans-serif;color:#334155;max-width:190mm;margin:0 auto 10px}'
  + '@media screen{body{background:#e2e8f0;margin:0;padding:12px}'
  +   '#print-render{background:#fff;max-width:190mm;margin:0 auto;padding:10mm;box-shadow:0 1px 6px rgba(0,0,0,.2)}'
  +   '.cr-foot-fixed{display:none}.cr-doc>tfoot .cr-foot{visibility:visible}}'
  + '@media print{.arch-note{display:none}body{margin:0;background:#fff}'
  +   '*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}'
  + '</style>';

async function _compteRenduArchive(r, mois, masque) {
  // Copie : la référence éventuellement générée pour l'impression ne doit pas
  // modifier le dossier en mémoire.
  const copie = { ...r, patient: { ...(r.patient || {}) } };
  const pr = (typeof prepareRecordForPrint === 'function' ? prepareRecordForPrint(copie) : null) || copie;
  const corps = await buildRecordPrintHTML(pr);
  const p = r.patient || {};
  const note = '<div class="arch-note">Archive du mois de ' + esc(_libelleMois(mois))
    + (masque ? ' · <strong>dossier masqué</strong>' : '')
    + ' · pour imprimer ou enregistrer en PDF : menu du navigateur › Imprimer.</div>';
  return _pageAutonome('Compte rendu ' + (p.dossier || '') + ' — ' + (p.nom || ''),
    note + '<div id="print-render">' + corps + '</div>', _STYLE_CR_ARCHIVE);
}

// Style commun du sommaire, du registre et de la caisse (A4, noir et blanc).
const _STYLE_DOC_ARCHIVE = '<style>'
  + 'body{font:10pt/1.35 "Segoe UI",Arial,sans-serif;color:#000;background:#fff;margin:0;padding:14px}'
  + 'h1{font-size:15pt;text-align:center;margin:0}h2{font-size:12pt;margin:18px 0 6px;border-bottom:1.5px solid #333;padding-bottom:2px}'
  + 'h3{font-size:10.5pt;margin:12px 0 4px}'
  + '.sous{text-align:center;color:#444;margin:2px 0}.titre{text-align:center;font-size:13pt;font-weight:800;margin:8px 0 2px;letter-spacing:.4px}'
  + 'table{width:100%;border-collapse:collapse;margin:4px 0 8px}th,td{border:1px solid #999;padding:3px 6px;vertical-align:top}'
  + 'th{background:#eee;text-align:left}td.n,th.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}'
  + 'tr.masque td{background:#e5e5e5}tr.total td{font-weight:800;background:#f3f3f3}'
  + '.cle{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.cle div{border:1px solid #999;padding:6px 10px;min-width:150px}'
  + '.cle b{display:block;font-size:13pt}.muet{color:#555;font-size:9pt}.badge{font-size:8pt;font-weight:700;border:1px solid #555;padding:0 4px}'
  + '.saut{break-before:page;page-break-before:always}'
  + '.defile{overflow-x:auto}table.reg{table-layout:fixed;min-width:760px}'
  + '@media screen and (max-width:640px){body{padding:8px}.col-opt{display:none}.cle div{min-width:120px}}'
  + '@media print{body{padding:0}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}'
  +   '.ecran{display:none}h2,h3{break-after:avoid}tr{break-inside:avoid}}'
  + '@page{size:A4 landscape;margin:10mm}'
  + '</style>';

function _enteteDoc(titre, mois, maintenant) {
  return '<h1>' + esc(CENTRE) + '</h1><div class="sous">Laboratoire d\'analyses médicales</div>'
    + '<div class="titre">' + esc(titre) + ' — ' + esc(_libelleMois(mois).toUpperCase()) + '</div>'
    + '<div class="sous muet">Archive éditée le ' + esc(_horodatageLisible(maintenant))
    + ' par ' + esc((_currentUser && _currentUser.username) || '?') + '</div>';
}
const _f = n => (Number(n) || 0).toLocaleString('fr-FR');
const _F = n => _f(n) + ' F';

// ── Lignes de registre (une par dossier) ──────────────────────────
function _ligneArchive(r, fichier) {
  const l = (typeof _regLigne === 'function') ? _regLigne(r) : {};
  const p = r.patient || {};
  const pi = p.paiement_infos || {};
  const jour = _jourServiceArchive(r);
  return Object.assign(l, {
    id: r.id, jour, heure: _heureDe(r.savedAt, jour), sexe: p.sexe || '', age: p.age != null ? String(p.age) : '',
    service: p.service || '', clinique: p.clinique || '',
    typeAffiche: (typeof getDisplayType === 'function' ? getDisplayType(r) : (r.type || '')),
    paye: p.paiement_status === 'paye',
    encaissePar: pi.agent || '', encaisseLe: pi.date ? _horodatageLisible(new Date(pi.date)) : '',
    regularisation: !!pi.regularisation,
    remise: Number(p.remise_montant) || 0, remiseDemandeePar: p.remise_demandee_par || '', remisePar: p.remise_par || '',
    masque: !!r.restrictedBy, masquePar: r.restrictedBy || '',
    auteur: r.createdBy || '', verrouille: (typeof jourVerrouille === 'function') && jourVerrouille(jour),
    fichier,
  });
}

// ── Sommaire ──────────────────────────────────────────────────────
function _sommaireHTML(mois, lignes, info, maintenant) {
  const corps = lignes.map(l =>
    '<tr' + (l.masque ? ' class="masque"' : '') + '>'
    + '<td>' + esc(l.jour) + ' ' + esc(l.heure) + '</td>'
    + '<td style="white-space:nowrap">' + esc(l.dossier) + '</td>'
    + '<td><a href="' + esc(l.fichier) + '"><strong>' + esc(l.nom) + '</strong></a>'
    + (l.meta ? ' <span class="muet">' + esc(l.meta) + '</span>' : '')
    + (l.masque ? ' <span class="badge">MASQUÉ</span>' : '') + '</td>'
    + '<td class="col-opt">' + esc(l.examens) + '</td>'
    + '<td class="n col-opt">' + _f(l.montant) + '</td>'
    + '<td>' + (l.paye ? 'payé' : '<strong>non payé</strong>') + '</td>'
    + '<td class="col-opt">' + (l.rendu ? 'rendu' : 'en attente') + '</td></tr>').join('');
  const recherche = '<div class="ecran" style="margin:10px 0"><input id="q" type="search" '
    + 'placeholder="Rechercher un nom ou un numéro de dossier…" style="width:100%;max-width:520px;font-size:15px;padding:8px;box-sizing:border-box">'
    + ' <span id="nb" class="muet"></span></div>';
  // Après le tableau : le script doit trouver ses lignes.
  const script = '<script>(function(){var q=document.getElementById("q"),nb=document.getElementById("nb"),'
    + 'rs=[].slice.call(document.querySelectorAll("#liste tbody tr"));function f(){var t=q.value.trim().toLowerCase(),n=0;'
    + 'rs.forEach(function(r){var ok=!t||r.textContent.toLowerCase().indexOf(t)>=0;r.style.display=ok?"":"none";if(ok)n++});'
    + 'nb.textContent=n+" dossier(s)"}q.addEventListener("input",f);f()})();<\/script>';
  return _pageAutonome('Sommaire — ' + _libelleMois(mois),
    _enteteDoc('ARCHIVE DU MOIS — SOMMAIRE', mois, maintenant)
    + '<div class="cle"><div>Dossiers<b>' + lignes.length + '</b></div>'
    + '<div>Résultats rendus<b>' + lignes.filter(l => l.rendu).length + '</b></div>'
    + '<div>Dossiers masqués<b>' + lignes.filter(l => l.masque).length + '</b>'
    + (info.masquesInclus ? '' : '<span class="muet">non inclus : session ordinaire</span>') + '</div></div>'
    + '<p class="muet">Cliquez sur un nom pour ouvrir son compte rendu (dossier « Comptes-rendus »). '
    + 'Le registre, la caisse et les statistiques sont dans les autres fichiers de l\'archive.</p>'
    + recherche
    + '<table id="liste"><thead><tr><th>Journée / heure</th><th>N° dossier</th><th>Patient</th><th class="col-opt">Examens</th>'
    + '<th class="n col-opt">Montant</th><th>Paiement</th><th class="col-opt">Résultat</th></tr></thead><tbody>' + corps + '</tbody></table>'
    + script,
    _STYLE_DOC_ARCHIVE.replace('A4 landscape', 'A4'));
}

// ── Registre du mois ──────────────────────────────────────────────
function _registreHTML(mois, lignes, maintenant) {
  const parJour = new Map();
  lignes.forEach(l => { if (!parJour.has(l.jour)) parJour.set(l.jour, []); parJour.get(l.jour).push(l); });
  const tableau = ls => '<div class="defile"><table class="reg"><colgroup><col style="width:10%"><col style="width:19%">'
    + '<col style="width:12%"><col style="width:12%"><col style="width:33%"><col style="width:6%"><col style="width:8%"></colgroup>'
    + '<thead><tr><th>N°</th><th>Patient</th><th>Prescripteur</th><th>Examens</th>'
    + '<th>Résultat</th><th class="n">Prix</th><th>Paiement</th></tr></thead><tbody>'
    + (ls.length ? ls.map(l =>
        '<tr' + (l.masque ? ' class="masque"' : '') + '>'
        + '<td style="white-space:nowrap">' + esc(l.dossier) + '<div class="muet">' + esc(l.heure) + '</div></td>'
        + '<td><strong>' + esc(l.nom) + '</strong>' + (l.externe ? ' <span class="badge">EXTERNE</span>' : '')
        + (l.masque ? ' <span class="badge">MASQUÉ</span>' : '')
        + (l.meta ? '<div class="muet">' + esc(l.meta) + '</div>' : '') + '</td>'
        + '<td>' + esc(l.presc) + '</td><td>' + esc(l.examens) + '</td>'
        + '<td>' + (l.rendu ? esc(l.synthese) : '<em>en attente</em>') + '</td>'
        + '<td class="n">' + _f(l.montant) + '</td>'
        + '<td>' + (l.paye ? 'payé' + (l.encaissePar ? '<div class="muet">' + esc(l.encaissePar) + '</div>' : '') : '<strong>non payé</strong>')
        + '</td></tr>').join('')
      : '<tr><td colspan="7" style="text-align:center;font-style:italic">Aucun dossier.</td></tr>')
    + '</tbody></table></div>';
  let corps = '';
  _joursDuMois(mois).forEach(jour => {
    const ls = parJour.get(jour) || [];
    if (!ls.length) return;
    const perm = ls.filter(l => l.poste === 'Permanence'), garde = ls.filter(l => l.poste !== 'Permanence');
    const recette = ls.filter(l => l.paye && !l.masque).reduce((t, l) => t + l.montant, 0);
    corps += '<h2>' + esc(_regJourLong(jour, true)) + (ls[0].verrouille ? ' <span class="badge">JOURNÉE VERROUILLÉE</span>' : '') + '</h2>'
      + '<div class="muet">' + ls.length + ' dossier(s) · ' + ls.filter(l => l.rendu).length + ' résultat(s) rendu(s) · encaissé : '
      + _F(recette) + '</div>'
      + (perm.length ? '<h3>☀️ ' + esc(_regLibellePoste('Permanence', jour, false)) + ' (8h00 – 16h30)</h3>' + tableau(perm) : '')
      + (garde.length ? '<h3>🌙 ' + esc(_regLibellePoste('Garde', jour, false)) + ' (16h30 – 8h00)</h3>' + tableau(garde) : '');
  });
  if (!corps) corps = '<p style="text-align:center;font-style:italic">Aucun dossier ce mois.</p>';
  const masques = lignes.filter(l => l.masque).length;
  return _pageAutonome('Registre — ' + _libelleMois(mois),
    _enteteDoc('REGISTRE DU MOIS', mois, maintenant)
    + '<div class="cle"><div>Dossiers<b>' + lignes.length + '</b></div>'
    + '<div>Résultats rendus<b>' + lignes.filter(l => l.rendu).length + '</b></div>'
    + '<div>Payés<b>' + lignes.filter(l => l.paye).length + '</b></div>'
    + '<div>Non payés<b>' + lignes.filter(l => !l.paye).length + '</b></div>'
    + '<div>Masqués<b>' + masques + '</b><span class="muet">lignes grisées, hors recette</span></div></div>'
    + corps, _STYLE_DOC_ARCHIVE);
}

// ── Caisse du mois (mêmes règles que la clôture de caisse) ────────
function calculerCaisseMois(mois) {
  const jours = _joursDuMois(mois).map(j => ({ jour: j, c: calculerCloture(j),
    verrouille: (typeof jourVerrouille === 'function') && jourVerrouille(j) }));
  const T = { recette: 0, dossiers: 0, regularise: 0, impayes: [], totalImpaye: 0, monnaieDue: [], totalMonnaieDue: 0,
              masques: 0, totalMasque: 0, bpnInternes: 0, totalBpnInternes: 0,
              parAgent: {}, parType: {}, parPoste: { Permanence: { nb: 0, total: 0 }, Garde: { nb: 0, total: 0 } } };
  const cumuler = (dest, src, champs) => Object.entries(src || {}).forEach(([k, v]) => {
    if (!dest[k]) dest[k] = {}; champs.forEach(c => { dest[k][c] = (dest[k][c] || 0) + (v[c] || 0); });
  });
  jours.forEach(({ jour, c }) => {
    T.recette += c.total; T.dossiers += c.dossiers; T.regularise += c.totalRegularise;
    c.impayes.forEach(x => T.impayes.push({ jour, ...x })); T.totalImpaye += c.totalImpaye;
    c.monnaieDue.forEach(x => T.monnaieDue.push({ jour, ...x })); T.totalMonnaieDue += c.totalMonnaieDue;
    T.masques += c.verrouilles; T.totalMasque += c.totalVerrouille;
    T.bpnInternes += c.cahierJaune; T.totalBpnInternes += c.totalCahierJaune;
    cumuler(T.parAgent, c.parAgent, ['nb', 'total', 'regularisations']);
    cumuler(T.parType, c.parType, ['nb', 'total']);
    cumuler(T.parPoste, c.parPoste, ['nb', 'total']);
  });
  return { jours, T };
}

/** Réductions / suppléments du mois — même règle que la carte « Réductions du mois ». */
function _reductionsMois(mois) {
  return (_dbCache || []).filter(r => {
    if (!r || r.deletedAt || r._hardDeleted || r.restrictedBy) return false;
    const p = r.patient || {};
    if (!(Number(p.remise_montant) || 0)) return false;
    return String(p.remise_le || p.date || (r.savedAt || '').slice(0, 10) || '').slice(0, 7) === mois;
  }).map(r => {
    const p = r.patient || {};
    return { jour: p.remise_le || p.date || '', dossier: p.dossier || '—', nom: p.nom || '—',
             montant: Number(p.remise_montant) || 0, demandeePar: p.remise_demandee_par || '',
             saisiePar: p.remise_par || r.createdBy || '' };
  }).sort((a, b) => String(a.jour).localeCompare(String(b.jour)));
}

/** Prescripteurs et ristournes du mois — même calcul que l'écran Statistiques. */
function _ristournesMois(mois) {
  const jours = _joursDuMois(mois);
  const db = (typeof filterByDateRange === 'function')
    ? filterByDateRange(getCalcDB(), jours[0], jours[jours.length - 1])
    : getCalcDB().filter(r => String(_recDate(r)).slice(0, 7) === mois);
  const presc = (typeof _prescripteurs !== 'undefined' && Array.isArray(_prescripteurs)) ? _prescripteurs : [];
  const estBpnR = r => r.est_bpn
    || (typeof getRecordTypes === 'function' && getRecordTypes(r).includes('Bilan prénatal'))
    || Object.values((r.resultats && r.resultats._examens_coches) || {}).flat().includes('Bilan prénatal complet (forfait)');
  return presc.map(p => {
    const fiches = db.filter(r => Number(r.prescripteur_id) === Number(p.id));
    const bpn = fiches.filter(estBpnR), extra = fiches.filter(r => !estBpnR(r));
    const montantExtra = extra.reduce((s, r) => s + (Number(r.montant) || 0), 0);
    return { nom: p.nom || '—', structure: p.structure || '', taux: Number(p.taux_ristourne) || 0,
             bpn: bpn.length, extra: extra.length, montantExtra,
             montantTotal: fiches.reduce((s, r) => s + (Number(r.montant) || 0), 0),
             ristourne: Math.round(montantExtra * (Number(p.taux_ristourne) || 0) / 100) };
  }).filter(x => x.bpn + x.extra > 0).sort((a, b) => b.montantTotal - a.montantTotal);
}

function _caisseHTML(mois, caisse, lignes, reductions, ristournes, maintenant) {
  const { jours, T } = caisse;
  const tri = obj => Object.entries(obj).sort((a, b) => (b[1].total - a[1].total) || (b[1].nb - a[1].nb));
  const tableSimple = (entetes, rangs) => '<table><thead><tr>' + entetes.map(e => '<th' + (e[1] ? ' class="n"' : '') + '>' + e[0] + '</th>').join('')
    + '</tr></thead><tbody>' + (rangs.length ? rangs.join('') : '<tr><td colspan="' + entetes.length + '" style="font-style:italic">Aucun</td></tr>') + '</tbody></table>';
  const totRemise = reductions.filter(x => x.montant < 0).reduce((t, x) => t - x.montant, 0);
  const totSupp = reductions.filter(x => x.montant > 0).reduce((t, x) => t + x.montant, 0);
  const totRistournes = ristournes.reduce((t, x) => t + x.ristourne, 0);
  const joursVerr = jours.filter(j => j.verrouille).length;
  const parService = {};
  lignes.forEach(l => { const s = l.service || 'Non précisé'; parService[s] = (parService[s] || 0) + 1; });

  const html =
    _enteteDoc('CAISSE ET STATISTIQUES', mois, maintenant)
    + '<div style="margin:12px 0;text-align:center;border:2px solid #333;padding:8px">'
    + '<div class="muet" style="letter-spacing:1px">RECETTE DU MOIS</div>'
    + '<div style="font-size:20pt;font-weight:900">' + _f(T.recette) + ' FCFA</div>'
    + '<div class="muet">' + T.dossiers + ' dossier(s) encaissé(s)'
    + (T.regularise ? ' · dont ' + _F(T.regularise) + ' de régularisation (encaissement rétroactif)' : '') + '</div></div>'
    + '<div class="cle">'
    + '<div>Dossiers du mois<b>' + lignes.length + '</b></div>'
    + '<div>Non encaissés<b>' + T.impayes.length + '</b>' + _F(T.totalImpaye) + '</div>'
    + '<div>Monnaie non rendue<b>' + T.monnaieDue.length + '</b>' + _F(T.totalMonnaieDue) + '</div>'
    + '<div>Masqués (hors recette)<b>' + T.masques + '</b>' + _F(T.totalMasque) + '</div>'
    + '<div>Réductions<b>− ' + _F(totRemise) + '</b>' + reductions.filter(x => x.montant < 0).length + ' dossier(s)</div>'
    + '<div>Suppléments<b>+ ' + _F(totSupp) + '</b>' + reductions.filter(x => x.montant > 0).length + ' dossier(s)</div>'
    + '<div>Ristournes dues<b>' + _F(totRistournes) + '</b></div>'
    + '<div>BPN internes<b>' + T.bpnInternes + '</b>' + _F(T.totalBpnInternes) + ' (cahier jaune)</div>'
    + '<div>Journées verrouillées<b>' + joursVerr + ' / ' + jours.length + '</b></div>'
    + '</div>'
    + '<p class="muet">Mêmes règles que la clôture de caisse : une journée = permanence (8h00–16h30) + garde '
    + '(16h30 → 8h00 le lendemain) ; les dossiers masqués et supprimés sont hors recette ; une régularisation '
    + 'n\'est pas une entrée d\'argent du jour. Ristournes et prescripteurs : mêmes calculs que l\'écran Statistiques '
    + '(date de prélèvement).</p>'

    + '<h2>1. Clôture jour par jour</h2><p class="muet">Journées sans aucun dossier non listées.</p>'
    + tableSimple([['Journée'], ['Verrouillée'], ['Encaissés', 1], ['☀️ Permanence', 1], ['🌙 Garde', 1], ['Recette', 1],
                   ['Non encaissés', 1], ['Masqués', 1]],
      jours.filter(j => j.c.dossiers || j.c.impayes.length || j.c.verrouilles).map(({ jour, c, verrouille }) =>
        '<tr><td>' + esc(_regJourLong(jour, false)) + '</td><td>' + (verrouille ? 'oui' : '<strong>non</strong>') + '</td>'
        + '<td class="n">' + c.dossiers + '</td><td class="n">' + _f(c.parPoste.Permanence.total) + '</td>'
        + '<td class="n">' + _f(c.parPoste.Garde.total) + '</td><td class="n"><strong>' + _f(c.total) + '</strong></td>'
        + '<td class="n">' + (c.impayes.length ? c.impayes.length + ' · ' + _f(c.totalImpaye) : '0') + '</td>'
        + '<td class="n">' + (c.verrouilles ? c.verrouilles + ' · ' + _f(c.totalVerrouille) : '0') + '</td></tr>')
      .concat(['<tr class="total"><td colspan="2">TOTAL DU MOIS</td><td class="n">' + T.dossiers + '</td>'
        + '<td class="n">' + _f(T.parPoste.Permanence.total) + '</td><td class="n">' + _f(T.parPoste.Garde.total) + '</td>'
        + '<td class="n">' + _f(T.recette) + '</td><td class="n">' + T.impayes.length + ' · ' + _f(T.totalImpaye) + '</td>'
        + '<td class="n">' + T.masques + ' · ' + _f(T.totalMasque) + '</td></tr>']))

    + '<h2>2. Encaissements par agent</h2>'
    + tableSimple([['Agent'], ['Dossiers', 1], ['Encaissé', 1], ['Régularisations', 1]],
      tri(T.parAgent).map(([k, v]) => '<tr><td>' + esc(k) + '</td><td class="n">' + v.nb + '</td><td class="n">'
        + _F(v.total) + '</td><td class="n">' + (v.regularisations || 0) + '</td></tr>'))

    + '<h2>3. Par prestation (dossiers encaissés)</h2>'
    + tableSimple([['Prestation'], ['Nombre', 1], ['Montant', 1]],
      tri(T.parType).map(([k, v]) => '<tr><td>' + esc(k) + '</td><td class="n">' + v.nb + '</td><td class="n">' + _F(v.total) + '</td></tr>'))
    + '<p class="muet">Le montant d\'un dossier à plusieurs analyses est compté sur sa première prestation (comme à la clôture).</p>'

    + '<h2>4. Prescripteurs et ristournes</h2>'
    + tableSimple([['Prescripteur'], ['Structure'], ['BPN', 1], ['Autres dossiers', 1], ['Montant hors BPN', 1], ['Taux', 1],
                   ['Ristourne due', 1], ['Montant total', 1]],
      ristournes.map(x => '<tr><td>' + esc(x.nom) + '</td><td>' + esc(x.structure) + '</td><td class="n">' + x.bpn + '</td>'
        + '<td class="n">' + x.extra + '</td><td class="n">' + _F(x.montantExtra) + '</td><td class="n">' + x.taux + ' %</td>'
        + '<td class="n"><strong>' + _F(x.ristourne) + '</strong></td><td class="n">' + _F(x.montantTotal) + '</td></tr>')
      .concat(ristournes.length ? ['<tr class="total"><td colspan="6">TOTAL RISTOURNES DUES</td><td class="n">'
        + _F(totRistournes) + '</td><td></td></tr>'] : []))

    + '<h2>5. Réductions et suppléments accordés</h2>'
    + tableSimple([['Date'], ['N° dossier'], ['Patient'], ['Montant', 1], ['Demandé par'], ['Saisi par']],
      reductions.map(x => '<tr><td>' + esc(x.jour) + '</td><td>' + esc(x.dossier) + '</td><td>' + esc(x.nom) + '</td>'
        + '<td class="n">' + (x.montant < 0 ? '− ' + _F(-x.montant) : '+ ' + _F(x.montant)) + '</td>'
        + '<td>' + esc(x.demandeePar) + '</td><td>' + esc(x.saisiePar) + '</td></tr>'))

    + '<h2>6. Dossiers non encaissés</h2>'
    + tableSimple([['Journée'], ['N° dossier'], ['Patient'], ['Montant', 1]],
      T.impayes.map(x => '<tr><td>' + esc(x.jour) + '</td><td>' + esc(x.dossier) + '</td><td>' + esc(x.nom)
        + '</td><td class="n">' + _F(x.montant) + '</td></tr>'))

    + '<h2>7. Monnaie promise non rendue</h2>'
    + tableSimple([['Journée'], ['N° dossier'], ['Patient'], ['Montant', 1]],
      T.monnaieDue.map(x => '<tr><td>' + esc(x.jour) + '</td><td>' + esc(x.dossier) + '</td><td>' + esc(x.nom)
        + '</td><td class="n">' + _F(x.montant) + '</td></tr>'))

    + '<h2>8. Dossiers masqués (hors recette)</h2>'
    + tableSimple([['Journée'], ['N° dossier'], ['Patient'], ['Examens'], ['Montant', 1], ['Paiement'], ['Masqué par']],
      lignes.filter(l => l.masque).map(l => '<tr><td>' + esc(l.jour) + '</td><td>' + esc(l.dossier) + '</td><td>' + esc(l.nom)
        + '</td><td>' + esc(l.examens) + '</td><td class="n">' + _F(l.montant) + '</td><td>' + (l.paye ? 'payé' : 'non payé')
        + '</td><td>' + esc(l.masquePar) + '</td></tr>'))

    + '<h2>9. Activité</h2>'
    + tableSimple([['Service'], ['Dossiers', 1]],
      Object.entries(parService).sort((a, b) => b[1] - a[1]).map(([s, n]) => '<tr><td>' + esc(s) + '</td><td class="n">' + n + '</td></tr>'))
    + '<p class="muet">' + lignes.filter(l => l.rendu).length + ' résultat(s) rendu(s) sur ' + lignes.length + ' dossier(s) ; '
    + lignes.filter(l => l.externe).length + ' dossier(s) de prescripteurs externes.</p>';
  return _pageAutonome('Caisse — ' + _libelleMois(mois), html, _STYLE_DOC_ARCHIVE);
}

// ── Tableur (mêmes chiffres) ──────────────────────────────────────
async function _classeurArchive(mois, caisse, lignes, reductions, ristournes) {
  if (typeof ExcelJS === 'undefined') return null;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LaboSaisie'; wb.title = 'Registre et caisse — ' + _libelleMois(mois);
  const feuille = (nom, colonnes, rangs) => {
    const ws = wb.addWorksheet(nom, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = colonnes.map(([header, key, width]) => ({ header, key, width: width || 14 }));
    rangs.forEach(r => ws.addRow(r));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
    if (rangs.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colonnes.length } };
    return ws;
  };
  feuille('Registre', [
    ['Journée', 'jour', 11], ['Heure', 'heure', 7], ['Poste', 'poste', 11], ['N° dossier', 'dossier', 12],
    ['Patient', 'nom', 28], ['Sexe', 'sexe', 6], ['Âge', 'age', 8], ['Service', 'service', 14],
    ['Prescripteur', 'presc', 22], ['Externe', 'externe', 8], ['Examens', 'examens', 30], ['Résultats', 'synthese', 70],
    ['Montant', 'montant', 10], ['Paiement', 'paiement', 10], ['Encaissé par', 'encaissePar', 12],
    ['Encaissé le', 'encaisseLe', 17], ['Régularisation', 'regul', 8], ['Réduction / supplément', 'remise', 12],
    ['Masqué', 'masque', 8], ['Masqué par', 'masquePar', 12], ['Saisi par', 'auteur', 12],
    ['Journée verrouillée', 'verr', 10], ['Compte rendu', 'fichier', 40],
  ], lignes.map(l => ({ ...l, externe: l.externe ? 'oui' : '', paiement: l.paye ? 'payé' : 'non payé',
                        regul: l.regularisation ? 'oui' : '', remise: l.remise || '', masque: l.masque ? 'oui' : '',
                        verr: l.verrouille ? 'oui' : '', synthese: l.rendu ? l.synthese : 'en attente' })));
  const { jours, T } = caisse;
  feuille('Clôtures par jour', [
    ['Journée', 'jour', 11], ['Verrouillée', 'verr', 10], ['Encaissés', 'dossiers', 10], ['Permanence', 'perm', 12],
    ['Garde', 'garde', 12], ['Recette', 'total', 12], ['Régularisations', 'regul', 13], ['Non encaissés', 'nbImp', 12],
    ['Montant non encaissé', 'imp', 14], ['Masqués', 'nbMasq', 9], ['Montant masqué', 'masq', 13],
    ['Monnaie non rendue', 'monnaie', 13], ['BPN internes', 'bpn', 11],
  ], jours.map(({ jour, c, verrouille }) => ({ jour, verr: verrouille ? 'oui' : 'non', dossiers: c.dossiers,
    perm: c.parPoste.Permanence.total, garde: c.parPoste.Garde.total, total: c.total, regul: c.totalRegularise,
    nbImp: c.impayes.length, imp: c.totalImpaye, nbMasq: c.verrouilles, masq: c.totalVerrouille,
    monnaie: c.totalMonnaieDue, bpn: c.cahierJaune }))
    .concat([{ jour: 'TOTAL', dossiers: T.dossiers, perm: T.parPoste.Permanence.total, garde: T.parPoste.Garde.total,
               total: T.recette, regul: T.regularise, nbImp: T.impayes.length, imp: T.totalImpaye, nbMasq: T.masques,
               masq: T.totalMasque, monnaie: T.totalMonnaieDue, bpn: T.bpnInternes }]));
  feuille('Par agent', [['Agent', 'k', 18], ['Dossiers', 'nb', 10], ['Encaissé', 'total', 12], ['Régularisations', 'regularisations', 14]],
    Object.entries(T.parAgent).map(([k, v]) => ({ k, ...v })));
  feuille('Par prestation', [['Prestation', 'k', 24], ['Nombre', 'nb', 10], ['Montant', 'total', 12]],
    Object.entries(T.parType).map(([k, v]) => ({ k, ...v })));
  feuille('Prescripteurs et ristournes', [['Prescripteur', 'nom', 26], ['Structure', 'structure', 20], ['BPN', 'bpn', 7],
    ['Autres dossiers', 'extra', 12], ['Montant hors BPN', 'montantExtra', 14], ['Taux %', 'taux', 8],
    ['Ristourne due', 'ristourne', 13], ['Montant total', 'montantTotal', 13]], ristournes);
  feuille('Réductions', [['Date', 'jour', 11], ['N° dossier', 'dossier', 12], ['Patient', 'nom', 28], ['Montant', 'montant', 11],
    ['Demandé par', 'demandeePar', 16], ['Saisi par', 'saisiePar', 12]], reductions);
  feuille('Non encaissés', [['Journée', 'jour', 11], ['N° dossier', 'dossier', 12], ['Patient', 'nom', 28], ['Montant', 'montant', 11]],
    T.impayes);
  feuille('Monnaie non rendue', [['Journée', 'jour', 11], ['N° dossier', 'dossier', 12], ['Patient', 'nom', 28], ['Montant', 'montant', 11]],
    T.monnaieDue);
  return wb.xlsx.writeBuffer();
}

function _lisezMoi(mois, info, maintenant) {
  const L = [
    'ARCHIVE DU MOIS — ' + _libelleMois(mois).toUpperCase(),
    CENTRE + ' — LaboSaisie',
    'Éditée le ' + _horodatageLisible(maintenant) + ' par ' + ((_currentUser && _currentUser.username) || '?'),
    '',
    'Cette archive se LIT : aucune application n\'est nécessaire pour l\'ouvrir.',
    'Ce n\'est PAS une sauvegarde à restaurer : la restauration utilise le fichier',
    '« labosaisie-sauvegarde-….json » (bouton 💾 Sauvegarder maintenant).',
    '',
    'CONTENU',
    '  0_Sommaire.html                 tous les dossiers du mois, avec recherche',
    '  1_Registre_du_mois.html         registre jour par jour (permanence / garde)',
    '  2_Caisse_et_statistiques.html   clôtures, agents, prestations, prescripteurs,',
    '                                  ristournes, réductions, impayés, masqués',
    '  3_Registre_et_caisse.xlsx       les mêmes chiffres, en tableur' + (info.excel ? '' : ' (NON GÉNÉRÉ : tableur indisponible)'),
    '  4_Rapport_activite.pdf          rapport d\'activité mensuel' + (info.rapport ? '' : ' (NON GÉNÉRÉ : PDF indisponible)'),
    '  Comptes-rendus/                 un compte rendu par dossier (' + info.nbComptesRendus + ' fichiers)',
    '',
    'CHIFFRES',
    '  Dossiers du mois : ' + info.nbDossiers,
    '  Dossiers masqués : ' + info.nbMasques
      + (info.masquesInclus ? '' : '  — ATTENTION : session ordinaire, les dossiers masqués'
         + ' ne sont PAS dans cette archive. Reconnectez-vous avec le second mot de passe pour les inclure.'),
    '  Recette encaissée : ' + _f(info.recette) + ' FCFA',
    '',
    'OUVRIR UN COMPTE RENDU',
    '  Ouvrez 0_Sommaire.html et cliquez sur le nom du patient, ou ouvrez',
    '  directement le fichier dans le dossier Comptes-rendus (nom = journée, n° de',
    '  dossier, nom du patient). Pour l\'imprimer ou en faire un PDF : menu du',
    '  navigateur › Imprimer. La mise en page est celle de l\'application.',
    '',
    'Le mois couvre les journées de service du 1er au dernier jour : la garde du',
    'dernier jour (jusqu\'à 8h le lendemain) en fait partie, comme pour la clôture.',
    'Les dossiers supprimés (corbeille) n\'y figurent pas.',
    '',
    'Données médicales nominatives : conservez ce fichier en lieu sûr.',
  ];
  return L.join('\r\n') + '\r\n';
}

// ── Construction complète ─────────────────────────────────────────
/**
 * Construit l'archive du mois et renvoie { blob, nom, info }.
 * `avance(message)` reçoit l'avancement (affiché à l'écran).
 */
async function construireArchiveMois(mois, avance) {
  const dire = m => { if (avance) avance(m); };
  const maintenant = new Date();
  dire('Mise à jour des dossiers…');
  if (typeof refreshDB === 'function') await refreshDB(true);
  if (typeof chargerClotures === 'function') { try { await chargerClotures(); } catch (e) {} }
  if (typeof loadPrescripteurs === 'function') { try { await loadPrescripteurs(); } catch (e) {} }

  const recs = dossiersDuMois(mois);
  const echecs = await _chargerDetailsArchive(recs, (n, t) => dire('Lecture des résultats… ' + n + ' / ' + t));
  if (echecs.length) {
    throw new Error(echecs.length + ' dossier(s) n\'ont pas pu être lus en entier (connexion ?). '
      + 'Archive annulée pour ne pas produire de comptes rendus incomplets : réessayez.');
  }

  const coffre = (typeof etatCoffre === 'function') ? await etatCoffre() : null;
  const info = {
    mois, nbDossiers: recs.length, nbMasques: recs.filter(r => r.restrictedBy).length,
    // Masqués présents si aucun second mot de passe n'existe, ou si l'on est entré par lui.
    masquesInclus: !coffre || !coffre.configure || !!coffre.ouvert,
  };

  const dossierRacine = 'Archive_' + mois + '_' + _nomFichierSur(_libelleMois(mois)) + '/';
  const fichiers = [];
  const lignes = [];
  const pris = new Set();
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    const p = r.patient || {};
    let base = 'Comptes-rendus/' + _jourServiceArchive(r) + '_' + _nomFichierSur(p.dossier || p.ancien_dossier || ('id' + r.id))
      + '_' + _nomFichierSur(p.nom) + (r.restrictedBy ? '_MASQUE' : '');
    if (pris.has(base)) base += '_' + r.id;
    pris.add(base);
    const chemin = base + '.html';
    if (i % 10 === 0) dire('Comptes rendus… ' + (i + 1) + ' / ' + recs.length);
    fichiers.push({ nom: dossierRacine + chemin, contenu: await _compteRenduArchive(r, mois, !!r.restrictedBy) });
    lignes.push(_ligneArchive(r, chemin));
  }
  info.nbComptesRendus = recs.length;

  dire('Registre et caisse…');
  const caisse = calculerCaisseMois(mois);
  info.recette = caisse.T.recette;
  const reductions = _reductionsMois(mois);
  const ristournes = _ristournesMois(mois);
  const debut = [
    { nom: dossierRacine + '0_Sommaire.html', contenu: _sommaireHTML(mois, lignes, info, maintenant) },
    { nom: dossierRacine + '1_Registre_du_mois.html', contenu: _registreHTML(mois, lignes, maintenant) },
    { nom: dossierRacine + '2_Caisse_et_statistiques.html',
      contenu: _caisseHTML(mois, caisse, lignes, reductions, ristournes, maintenant) },
  ];
  let excel = null;
  try { excel = await _classeurArchive(mois, caisse, lignes, reductions, ristournes); } catch (e) { console.error('archive excel', e); }
  info.excel = !!excel;
  if (excel) debut.push({ nom: dossierRacine + '3_Registre_et_caisse.xlsx', contenu: excel });
  let rapport = null;
  try {
    if (typeof construireRapportMensuel === 'function' && window.jspdf && window.jspdf.jsPDF) {
      const [a, m] = mois.split('-').map(Number);
      rapport = (await construireRapportMensuel(m, a)).output('arraybuffer');
    }
  } catch (e) { console.error('archive rapport', e); }
  info.rapport = !!rapport;
  if (rapport) debut.push({ nom: dossierRacine + '4_Rapport_activite.pdf', contenu: rapport });
  debut.unshift({ nom: dossierRacine + 'LISEZ-MOI.txt', contenu: _lisezMoi(mois, info, maintenant) });

  dire('Compression…');
  const blob = await creerZip(debut.concat(fichiers), maintenant);
  return { blob, nom: 'LaboSaisie_Archive_' + mois + '_' + _nomFichierSur(MOIS_FR[Number(mois.slice(5)) - 1]) + '.zip', info };
}

// ── Écran ─────────────────────────────────────────────────────────
function preparerCarteArchive() {
  const champ = document.getElementById('archive-mois');
  if (champ && !champ.value) champ.value = moisArchiveParDefaut();
  chargerEtatSuppression();
}

async function telechargerArchiveMois(moisArg) {
  if (!isAdmin()) { toast('Archive réservée aux administrateurs', 'err'); return; }
  if (!navigator.onLine) { toast('Archive impossible hors-ligne', 'err'); return; }
  const champ = document.getElementById('archive-mois');
  const mois = (typeof moisArg === 'string' && /^\d{4}-\d{2}$/.test(moisArg)) ? moisArg
    : ((champ && champ.value) || moisArchiveParDefaut());
  const etat = document.getElementById('archive-etat');
  const btn = document.getElementById('btn-archive');
  if (btn) btn.disabled = true;
  try {
    showLoading('Préparation de l\'archive de ' + _libelleMois(mois) + '…');
    const { blob, nom, info } = await construireArchiveMois(mois, m => showLoading('Archive de ' + _libelleMois(mois) + ' — ' + m));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    // ✅ v13.269 — Le serveur retient l'archive : condition pour supprimer le mois.
    try {
      await _sb.rpc('noter_archive_mois', { p_token: TK(), p_mois: mois,
        p_nb_dossiers: info.nbDossiers, p_masques_inclus: !!info.masquesInclus });
    } catch (e) { /* fonction absente (script SQL non installé) : sans effet sur l'archive */ }
    if (typeof chargerEtatSuppression === 'function') chargerEtatSuppression();
    const taille = (blob.size / 1048576).toFixed(1).replace('.', ',') + ' Mo';
    const avert = info.masquesInclus ? '' : ' — ⚠ dossiers masqués non inclus (session ordinaire)';
    if (etat) {
      etat.innerHTML = '<span style="color:#15803d;font-weight:700">✓ ' + esc(nom) + '</span> · '
        + info.nbDossiers + ' dossier(s), ' + taille
        + (avert ? '<span style="color:#b45309;font-weight:700">' + esc(avert) + '</span>' : '');
    }
    toast('📦 Archive de ' + _libelleMois(mois) + ' téléchargée (' + info.nbDossiers + ' dossiers)' + avert, info.masquesInclus ? 'ok' : 'err');
  } catch (e) {
    console.error('archive du mois :', e);
    if (etat) etat.innerHTML = '<span style="color:#b91c1c;font-weight:700">✗ ' + esc(e.message || String(e)) + '</span>';
    toast('Archive impossible : ' + (e.message || e), 'err');
  } finally {
    hideLoading();
    if (btn) btn.disabled = false;
  }
}

// ── Supprimer un mois archivé (v13.269) ───────────────────────────
const _MOTIFS_SUPPRESSION = {
  trop_recent: 'à garder : les 3 derniers mois restent dans l\'application',
  archive_absente: 'faire d\'abord l\'archive de ce mois',
  archive_sans_masques: 'archive faite sans les dossiers masqués : la refaire après être entré par la seconde porte',
  archive_perimee: 'modifié depuis l\'archive : refaire l\'archive',
  sauvegarde_requise: 'faire une sauvegarde 💾 après l\'archive',
  coffre_requis: 'se connecter avec le second mot de passe',
  vide: 'aucun dossier',
  mois_invalide: 'mois invalide',
  confirmation: 'confirmation incorrecte',
  forbidden: 'réservé à l\'administrateur',
  invalid_token: 'session expirée : reconnectez-vous',
  non_supprime: 'ce mois n\'est pas supprimé',
  instantane_absent: 'plus de copie de nuit de ce mois : annulation impossible',
};
const _motifSuppression = c => _MOTIFS_SUPPRESSION[c] || String(c || 'refusé');
let _etatSuppression = null;

/** Tableau des mois en base : archive, sauvegarde, et suppression possible. */
async function chargerEtatSuppression() {
  const zone = document.getElementById('suppression-mois-zone');
  if (!zone || typeof isAdmin !== 'function' || !isAdmin()) return;
  zone.innerHTML = '<span style="color:var(--text-muted)">Chargement…</span>';
  let data = null, error = null;
  try { ({ data, error } = await _sb.rpc('etat_suppression_mois', { p_token: TK() })); } catch (e) { error = e; }
  if (error || !data || data.erreur) {
    const absente = error && (error.code === 'PGRST202' || /etat_suppression_mois/.test(error.message || ''));
    zone.innerHTML = '<span style="color:#92400e">' + (absente
      ? 'Fonction du serveur pas encore installée (script SQL v13.269).'
      : 'État indisponible : ' + esc((data && data.erreur) ? _motifSuppression(data.erreur) : ((error && error.message) || 'réponse inattendue')))
      + '</span>';
    return;
  }
  _etatSuppression = data;
  const date = d => d ? new Date(d).toLocaleDateString('fr-FR') : '';
  // Une ligne par mois (lisible sur téléphone : pas de tableau à 5 colonnes).
  const lignes = (data.mois || []).filter(m => m.dossiers || m.corbeille).map(m => {
    const pret = m.controle === 'ok';
    const archive = m.archive_le
      ? 'archive du ' + date(m.archive_le) + ' (' + m.archive_nb + ' dossier(s)' + (m.archive_masques ? '' : ', <strong>sans masqués</strong>') + ')'
      : 'pas d\'archive';
    return '<div style="display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap;padding:8px 2px;border-bottom:1px dotted var(--border)">'
      + '<div style="flex:1;min-width:190px"><strong>' + esc(_libelleMois(m.mois)) + '</strong> · ' + m.dossiers + ' dossier(s)'
      + (m.corbeille ? ' <span style="color:var(--text-muted)">+' + m.corbeille + ' en corbeille</span>' : '')
      + '<div style="font-size:11.5px;color:var(--text-muted)">' + archive + '</div>'
      + '<div style="font-size:12px;margin-top:2px">' + (pret ? '<span style="color:#15803d;font-weight:700">✓ peut être supprimé</span>'
                       : '<span style="color:#92400e">' + esc(_motifSuppression(m.controle)) + '</span>') + '</div></div>'
      + (pret ? '<button class="btn" style="background:#b91c1c;color:#fff;font-size:12px;padding:6px 12px" '
                + 'onclick="supprimerMoisArchive(\'' + m.mois + '\')">🗑️ Supprimer…</button>' : '')
      + '</div>';
  }).join('');
  const purges = (data.purges || []).map(p =>
    '<li><strong>' + esc(_libelleMois(p.mois)) + '</strong> — ' + p.dossiers + ' dossier(s) supprimé(s) le '
    + esc(date(p.purge_le)) + (p.purge_par ? ' par ' + esc(p.purge_par) : '')
    + (p.annulable
        ? ' <button class="btn btn-outline" style="font-size:12px;padding:3px 10px" onclick="annulerSuppressionMois(\'' + p.mois + '\')">↩️ Annuler la suppression</button>'
        : ' <span style="color:var(--text-muted)">(définitif : plus de copie de nuit)</span>')
    + '</li>').join('');
  zone.innerHTML =
    (lignes || '<div style="color:var(--text-muted)">Aucun dossier en base.</div>')
    + '<div style="font-size:12px;color:var(--text-muted);margin-top:6px">Dernière sauvegarde : '
    + (data.derniere_sauvegarde ? esc(date(data.derniere_sauvegarde)) : 'jamais')
    + (data.coffre_ouvert ? '' : ' · <span style="color:#b45309">session ordinaire : entrez par la seconde porte pour pouvoir supprimer</span>')
    + '</div>'
    + (purges ? '<div style="margin-top:10px;font-size:12.5px"><strong>Mois déjà supprimés de la base</strong><ul style="margin:4px 0 0 18px;padding:0">' + purges + '</ul></div>' : '');
}

/** Confirmation tapée : on ne supprime pas des centaines de dossiers sur un simple clic. */
function _confirmerSuppressionMois(mois, m) {
  return new Promise(resolve => {
    const old = document.getElementById('suppr-mois-backdrop');
    if (old) old.remove();
    const bd = document.createElement('div');
    bd.id = 'suppr-mois-backdrop';
    bd.className = 'modal-backdrop';
    bd.style.display = 'flex';
    bd.innerHTML = '<div class="modal-box" style="max-width:420px">'
      + '<div class="modal-title">🗑️ Supprimer ' + esc(_libelleMois(mois)) + ' de la base ?</div>'
      + '<p style="font-size:13px;line-height:1.5;margin:0 0 10px">Les <strong>' + ((m && m.dossiers) || 0) + ' dossier(s)</strong>'
      + ((m && m.corbeille) ? ' (et ' + m.corbeille + ' en corbeille)' : '') + ' de ce mois quittent l\'application : '
      + 'on ne les retrouve plus que dans l\'<strong>archive</strong> et la <strong>sauvegarde</strong>. '
      + 'Les QR de leurs comptes rendus confirmeront encore qu\'ils sont authentiques. '
      + 'Annulable pendant 15 jours.</p>'
      + '<label class="modal-label" for="suppr-mois-saisie">Tapez <strong>SUPPRIMER</strong> pour confirmer</label>'
      + '<input class="modal-input" id="suppr-mois-saisie" autocomplete="off" autocapitalize="characters">'
      + '<div class="modal-actions"><button class="btn btn-outline" id="suppr-mois-annuler">Annuler</button>'
      + '<button class="btn" id="suppr-mois-ok" disabled style="background:#b91c1c;color:#fff">Supprimer définitivement</button></div></div>';
    document.body.appendChild(bd);
    const champ = document.getElementById('suppr-mois-saisie');
    const ok = document.getElementById('suppr-mois-ok');
    const fin = v => { bd.remove(); resolve(v); };
    champ.addEventListener('input', () => { ok.disabled = champ.value.trim().toUpperCase() !== 'SUPPRIMER'; });
    ok.addEventListener('click', () => fin(champ.value.trim().toUpperCase() === 'SUPPRIMER'));
    document.getElementById('suppr-mois-annuler').addEventListener('click', () => fin(false));
    bd.addEventListener('click', e => { if (e.target === bd) fin(false); });
    setTimeout(() => champ.focus(), 50);
  });
}

async function _apresChangementMois() {
  if (typeof refreshDB === 'function') await refreshDB(true);
  if (typeof renderHistory === 'function') { try { renderHistory(); } catch (e) {} }
  await chargerEtatSuppression();
}

async function supprimerMoisArchive(mois) {
  if (!isAdmin()) { toast('Réservé à l\'administrateur', 'err'); return; }
  const m = ((_etatSuppression && _etatSuppression.mois) || []).find(x => x.mois === mois);
  if (!await _confirmerSuppressionMois(mois, m)) return;
  showLoading('Suppression de ' + _libelleMois(mois) + '…');
  try {
    const { data, error } = await _sb.rpc('purger_mois', { p_token: TK(), p_mois: mois, p_confirmation: 'SUPPRIMER ' + mois });
    if (error || !data || data.erreur) {
      toast('Suppression refusée : ' + _motifSuppression((data && data.erreur) || (error && error.message)), 'err');
    } else {
      toast('🗑️ ' + _libelleMois(mois) + ' : ' + data.supprimes + ' dossier(s) supprimé(s) de la base', 'ok');
    }
  } catch (e) {
    toast('Suppression impossible : ' + (e.message || e), 'err');
  } finally {
    hideLoading();
    await _apresChangementMois();
  }
}

async function annulerSuppressionMois(mois) {
  if (!isAdmin()) { toast('Réservé à l\'administrateur', 'err'); return; }
  const ok = await showConfirmModal({
    icon: '↩️', title: 'Remettre ' + _libelleMois(mois) + ' en base ?',
    message: 'Les dossiers de ce mois sont remis depuis la plus récente copie de nuit qui les contient. '
           + 'Pour les supprimer de nouveau, il faudra refaire l\'archive.',
    confirmText: 'Remettre en base',
  });
  if (!ok) return;
  showLoading('Remise en base de ' + _libelleMois(mois) + '…');
  try {
    const { data, error } = await _sb.rpc('annuler_purge_mois', { p_token: TK(), p_mois: mois });
    if (error || !data || data.erreur) {
      toast('Annulation refusée : ' + _motifSuppression((data && data.erreur) || (error && error.message)), 'err');
    } else {
      toast('↩️ ' + _libelleMois(mois) + ' : ' + data.restaures + ' dossier(s) remis en base', 'ok');
    }
  } catch (e) {
    toast('Annulation impossible : ' + (e.message || e), 'err');
  } finally {
    hideLoading();
    await _apresChangementMois();
  }
}

/** Mois de service d'une ligne brute de sauvegarde (même règle que jour_dossier côté serveur). */
function moisServiceLigne(f) {
  const p = (f && f.patient) || {};
  const ts = f && (f.created_at || f.savedAt);
  const d = ts ? new Date(ts) : null;
  let jour = p.date || (d && !isNaN(d) ? _jourLocal(d) : '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(jour)) return '';
  jour = jour.slice(0, 10);
  if (d && !isNaN(d) && d.getHours() < 8) jour = _jourPlus(jour, -1);
  return jour.slice(0, 7);
}
