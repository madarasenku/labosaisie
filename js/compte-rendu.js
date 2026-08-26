// ============================================================
//  COMPTE RENDU D'ANALYSES — rendu conforme au modèle validé
//  (référence : DIARRA_ROKIA_00220826_signe2.pdf)
//
//  Structure imposée par le modèle :
//   · En-tête CPMI (titre, sous-titre, filet)
//   · Encadré « RÉSULTAT : <liste des examens demandés> »
//   · Encadré nom du patient (grand)
//   · Grille d'informations 2 colonnes × 3 lignes
//   · Bandeau « Examens demandés — résultats »
//   · UN tableau par examen / panel :
//       en-tête gris = nom de l'examen | Résultat | (Unité) | Valeurs normales
//   · Valeurs anormales : gras + fond gris
//   · Ligne d'interprétation en italique pleine largeur si nécessaire
//   · Examen demandé mais non saisi : affiché avec « — » et mention
//   · Pied de page répété : CPMI · Édité le · Montant · signature · QR
//
//  Tout le texte est échappé (aucune injection possible depuis les
//  champs libres : observations, germe, commentaires…).
// ============================================================

function crEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function crV(v) { return v == null ? '' : String(v).trim(); }
function crAno(interp) { return interp === 'Élevé' || interp === 'Bas'; }

// Nom court de l'examen pour la ligne « RÉSULTAT : … »
const CR_COURTS = {
  ex_nfs:'NFS', ex_ge:'GE', ex_crp:'CRP', ex_widal:'Widal', ex_vs:'VS',
  ex_ephb:'Électrophorèse Hb', ex_hbs:'Hépatite B', ex_hcv:'Hépatite C',
  ex_vih:'VIH', ex_tpha:'Syphilis', ex_toxo:'Toxoplasmose', ex_rube:'Rubéole',
  ex_gs:'Groupe sanguin', ex_aslo:'ASLO', ex_latex:'Latex',
};

// ── Cellules / tableaux ─────────────────────────────────────
function crTable(titre, rows, opts) {
  opts = opts || {};
  const avecUnite = opts.unite !== false;
  if (!rows || !rows.length) return '';
  const ths = ['<th class="cr-th-nom">' + crEsc(titre) + '</th>',
               '<th class="cr-th-c">Résultat</th>']
    .concat(avecUnite ? ['<th class="cr-th-c cr-u">Unité</th>'] : [])
    .concat(['<th class="cr-th-c">Valeurs normales</th>']).join('');
  const trs = rows.map(r => {
    if (r.interpretation) {
      return '<tr><td class="cr-interp" colspan="' + (avecUnite ? 4 : 3) + '">'
        + crEsc(r.interpretation) + '</td></tr>';
    }
    const val = crV(r.val) === '' ? '—' : r.val;
    const clsVal = 'cr-val' + (r.ano ? ' cr-ano' : '');
    return '<tr><td class="cr-nom">' + crEsc(r.nom) + '</td>'
      + '<td class="' + clsVal + '">' + crEsc(val) + '</td>'
      + (avecUnite ? '<td class="cr-unite">' + crEsc(r.unite || '') + '</td>' : '')
      + '<td class="cr-ref">' + crEsc(r.ref || '') + '</td></tr>';
  }).join('');
  return '<table class="cr-t"><thead><tr>' + ths + '</tr></thead><tbody>' + trs + '</tbody></table>';
}

// ── Blocs par analyse ───────────────────────────────────────
function crBlocNFS(res, profile) {
  const rows = [];
  (typeof HEMA_PARAMS !== 'undefined' ? HEMA_PARAMS : []).forEach(p => {
    const v = res[p.name]; if (!v || crV(v.valeur) === '') return;
    rows.push({ nom: String(p.name).replace(/\s*⚙\s*$/, ''), val: v.valeur,
                unite: v.unite || p.unit, ref: refDisplayFor(p, profile), ano: crAno(v.interp) });
  });
  (typeof HEMA_FL !== 'undefined' ? HEMA_FL : []).forEach(p => {
    const v = res[p.name]; if (!v || crV(v.valeur) === '') return;
    rows.push({ nom: p.name, val: v.valeur, unite: v.unite || '/µL',
                ref: refDisplayFor(p, profile), ano: crAno(v.interp) });
  });
  return crTable('NFS — Numération Formule Sanguine', rows);
}

function crBlocGE(res) {
  const rows = [];
  const add = (n, v) => { if (crV(v) !== '') rows.push({ nom: n, val: v, ref: n === 'Résultat GE' || n === 'TDR paludisme' ? 'Négatif' : '' }); };
  add('Résultat GE', res['GE - Résultat']);
  add('TDR paludisme', res['GE - TDR']);
  add('Espèce plasmodiale', res['GE - Espèce']);
  add('Parasitémie', res['GE - Parasitémie (%)']);
  add('Densité parasitaire', res['GE - Densité parasitaire (/µL)']);
  add('Stade parasitaire', res['GE - Stade']);
  const obs = crV(res['GE - Observation']);
  if (obs) rows.push({ interpretation: 'Observation : ' + obs });
  return crTable('Goutte épaisse / TDR Paludisme', rows, { unite: false });
}

function crBlocEPHB(res) {
  const rows = [];
  ['Hb A', 'Hb A2', 'Hb F', 'Hb S', 'Hb C', 'Hb D', 'Hb E'].forEach(n => {
    const v = res[n]; if (v && crV(v.valeur) !== '') rows.push({ nom: n, val: v.valeur, unite: '%', ref: v.interp || '' });
  });
  const profil = crV(res['Profil Hb']);
  if (profil) rows.push({ interpretation: 'Profil : ' + profil });
  const com = crV(res['Commentaire Hb']);
  if (com) rows.push({ interpretation: com });
  return crTable('Électrophorèse de l\'hémoglobine', rows);
}

function crBlocCRP(res) {
  const brut = crV(res['CRP - Valeur']);
  if (brut === '') return '';
  const val = (brut === 'neg') ? 'Négatif' : brut;
  const ano = (brut !== 'neg' && parseFloat(brut) >= 6);
  return crTable('CRP — Protéine C-réactive',
    [{ nom: 'CRP — Protéine C-réactive', val, unite: (brut === 'neg' ? '' : 'mg/L'), ref: '< 6 mg/L', ano }]);
}

function crBlocWidal(res) {
  const rows = [];
  (typeof WIDAL_ANTIGENES !== 'undefined' ? WIDAL_ANTIGENES : []).forEach(ag => {
    const w = res['Widal - ' + ag.name];
    if (w && crV(w.titre) !== '' && w.titre !== 'Non réalisé') {
      rows.push({ nom: ag.name, val: w.titre, ref: 'Négatif', ano: w.titre !== 'Négatif' });
    }
  });
  const concl = crV(res['Widal - Conclusion']).replace(/^—$/, '');
  if (concl) rows.push({ nom: 'Conclusion', val: concl, ref: '' });
  return crTable('Widal — Agglutination (Fièvre typhoïde)', rows, { unite: false });
}

function crBlocVHB(res) {
  const g = n => res[n] || {};
  const ag = g('Ag HBs'), hbs = g('Ac anti-HBs'), hbc = g('Ac anti-HBc total');
  const vAg = crV(ag.resultat), vHbs = crV(hbs.valeur) || crV(hbs.resultat), vHbc = crV(hbc.resultat);
  if (!vAg && !vHbs && !vHbc) return '';
  const rows = [];
  if (vAg)  rows.push({ nom: 'Ag HBs (antigène de surface)', val: vAg, ref: 'Négatif', ano: /positif/i.test(vAg) });
  if (vHbs) rows.push({ nom: 'Ac anti-HBs (immunité)', val: vHbs + (crV(hbs.valeur) ? ' UI/L' : ''), ref: '≥ 10 = immunisé',
                        ano: crV(hbs.valeur) !== '' && parseFloat(hbs.valeur) < 10 });
  if (vHbc) rows.push({ nom: 'Ac anti-HBc total (contact viral)', val: vHbc, ref: 'Négatif', ano: /positif/i.test(vHbc) });
  if (/positif/i.test(vAg)) {
    rows.push({ interpretation: 'Interprétation : Infection par le virus de l\'hépatite B (aiguë ou chronique) — avis spécialisé recommandé.' });
  } else if (crV(hbs.valeur) && parseFloat(hbs.valeur) >= 10) {
    rows.push({ interpretation: 'Interprétation : Sujet immunisé contre l\'hépatite B.' });
  }
  return crTable('Bilan Hépatite B (VHB)', rows, { unite: false });
}

// Sérologies restantes (hors CRP / Widal / VHB / Groupe)
const CR_SERO_EXCLUS = new Set(['Ag HBs', 'Ac anti-HBs', 'Ac anti-HBc total']);
function crBlocSerologies(res) {
  const rows = [];
  (typeof SERO_TESTS !== 'undefined' ? SERO_TESTS : []).forEach(t => {
    if (CR_SERO_EXCLUS.has(t.name)) return;
    const v = res[t.name]; if (!v) return;
    const val = crV(v.resultat) || crV(v.valeur); if (val === '') return;
    rows.push({ nom: t.name, val, unite: crV(v.valeur) ? (v.unite || t.unit || '') : '',
                ref: t.ref || 'Négatif', ano: /positif|douteux/i.test(val) });
  });
  return crTable('Sérologies', rows);
}

function crBlocGroupe(res) {
  const abo = crV(res['Groupe ABO']), rh = crV(res['Rhésus']);
  if (!abo && !rh) return '';
  return crTable('Groupe sanguin', [{ nom: 'Groupe ABO / Rhésus', val: (abo + ' ' + rh).trim(), ref: '' }], { unite: false });
}

// ⚠ `const` au niveau global n'est PAS exposé sur window : on référence donc
// les groupes directement, chacun protégé par un typeof.
function crGroupesBio() {
  const g = [];
  const add = (grp, titre) => { if (grp) g.push([grp, titre]); };
  add(typeof BIO_GLUCIDES !== 'undefined' ? BIO_GLUCIDES : null, 'Biochimie — Glucides');
  add(typeof BIO_REIN     !== 'undefined' ? BIO_REIN     : null, 'Biochimie — Fonction rénale');
  add(typeof BIO_FOIE     !== 'undefined' ? BIO_FOIE     : null, 'Biochimie — Fonction hépatique');
  add(typeof BIO_LIPIDES  !== 'undefined' ? BIO_LIPIDES  : null, 'Biochimie — Bilan lipidique');
  add(typeof BIO_IONO     !== 'undefined' ? BIO_IONO     : null, 'Biochimie — Ionogramme');
  add(typeof BIO_FER      !== 'undefined' ? BIO_FER      : null, 'Biochimie — Bilan martial');
  add(typeof BIO_CARD     !== 'undefined' ? BIO_CARD     : null, 'Biochimie — Marqueurs cardiaques');
  add(typeof BIO_HORM     !== 'undefined' ? BIO_HORM     : null, 'Biochimie — Hormonologie');
  add(typeof BIO_COAG     !== 'undefined' ? BIO_COAG     : null, 'Biochimie — Coagulation');
  add(typeof BIO_AUTRE    !== 'undefined' ? BIO_AUTRE    : null, 'Biochimie — Autres paramètres');
  return g;
}
function crBlocsBiochimie(res, profile) {
  let html = '';
  crGroupesBio().forEach(([grp, titre]) => {
    if (!grp) return;
    const rows = [];
    grp.forEach(p => {
      const v = res[p.name]; if (!v || crV(v.valeur) === '') return;
      rows.push({ nom: p.name, val: v.valeur, unite: v.unite || p.unit,
                  ref: refDisplayFor(p, profile), ano: crAno(v.interp) });
    });
    html += crTable(titre, rows);
  });
  return html;
}

// ── Examens demandés mais non saisis ────────────────────────
function crBlocNonRealises(labels) {
  if (!labels.length) return '';
  const rows = labels.map(l => ({ nom: l, val: '—', unite: '', ref: 'Non réalisé' }));
  return crTable('Examens demandés — non réalisés', rows);
}

// ── Feuille de style du compte rendu (noir & blanc, modèle validé) ──
const CR_STYLE = `
<style>
  /* Réserve la bande basse pour le pied de page répété : sans cela, le contenu
     passe SOUS le pied sur chaque page (il est en position:fixed). */
  @page { size: A4; margin: 0.9cm 1cm; }
  /* Neutralise le filigrane hérité de l'ancien rendu (il tombait dans la case
     de signature du nouveau modèle). */
  /* Neutralise le filigrane « CPMI » (body::after) et la mention de bas de page
     hérités de l'ancien rendu : ils se superposaient au nouveau modèle. */
  #print-render::after, #print-render::before,
  body::after, body::before { content: none !important; display: none !important; }
  #print-render { font-family: 'Segoe UI', Arial, sans-serif; color:#000; background:#fff; }
  .cr-page { width:100%; border-collapse:collapse; }
  .cr-page > tbody > tr > td, .cr-page > tfoot > tr > td { border:0; padding:0; }
  .cr-page > tfoot { display:table-footer-group; }
  .cr-h1 { text-align:center; font-size:16.5pt; font-weight:800; letter-spacing:.4px; margin:0; }
  .cr-h2 { text-align:center; font-size:8pt; color:#333; margin:3px 0 5px; }
  .cr-rule { border:0; border-top:1.6pt solid #111; margin:0 0 8px; }
  .cr-box { border:1px solid #444; padding:5px 10px; margin-bottom:5px; }
  .cr-box-res { text-align:center; font-weight:700; font-size:10.5pt; }
  .cr-box-nom { text-align:center; font-weight:800; font-size:20pt; letter-spacing:.5px; padding:7px 10px; }
  .cr-infos { width:100%; border-collapse:collapse; margin-bottom:7px; font-size:9pt; }
  .cr-infos td { border:1px solid #999; padding:5px 9px; }
  .cr-infos .cr-lab { font-weight:700; background:#f2f2f2; width:22%; font-size:8.5pt; }
  .cr-bandeau { border:1px solid #444; background:#eee; font-weight:700; font-size:9.5pt; padding:5px 10px; margin:9px 0 6px; }
  .cr-t { width:100%; border-collapse:collapse; margin-bottom:9px; font-size:9pt; page-break-inside:avoid; }
  .cr-t th, .cr-t td { border:1px solid #999; padding:5px 8px; }
  .cr-th-nom { text-align:left; font-weight:700; background:#eee; width:33%; font-size:8.5pt; }
  .cr-th-c { text-align:center; font-weight:700; background:#eee; }
  .cr-u { width:11%; }
  .cr-nom { text-align:left; }
  .cr-val { text-align:center; font-size:10pt; }
  .cr-val.cr-ano { font-weight:800; background:#d2d2d2; }
  .cr-unite { text-align:center; font-size:8pt; color:#444; }
  .cr-ref { text-align:center; font-size:8pt; color:#444; }
  .cr-interp { font-style:italic; font-size:8.5pt; text-align:center; background:#eee; }
  .cr-foot { border-top:1px solid #999; padding-top:5px; margin-top:6px; font-size:8pt; }
  .cr-foot-grid { display:flex; align-items:flex-start; gap:14px; }
  .cr-foot-l { flex:1; } .cr-foot-c { flex:1.2; text-align:center; } .cr-foot-r { text-align:right; }
  .cr-foot b { font-size:8.5pt; }
  .cr-sigbox { border:1px solid #666; height:15mm; margin-top:2px; }
  .cr-foot-pat { margin-top:4px; font-size:7.5pt; color:#444; }

</style>`;

// ── Assemblage du compte rendu complet ──────────────────────
async function crBuildHTML(record) {
  const R = (record && record.resultats) || {};
  const p = (record && record.patient) || {};
  const profile = (typeof profileFromPatient === 'function') ? profileFromPatient(p) : {};

  // Sous-résultats par analyse (dossier unifié ou fiche simple)
  const sub = t => (R[t] && typeof R[t] === 'object') ? R[t] : {};
  const hema = sub('Hématologie'), bio = sub('Biochimie'),
        sero = sub('Immuno-Sérologie'), gs = sub('Groupe sanguin');

  // Examens demandés (toutes analyses confondues)
  const coches = R._examens_coches || {};
  const labels = Array.isArray(coches) ? coches.slice()
    : Object.values(coches).reduce((a, v) => a.concat(v || []), []);
  const estCoche = rx => labels.some(l => rx.test(l));

  // Ligne « RÉSULTAT : … » — noms courts des examens demandés
  const courts = [];
  const pushCourt = (rx, nom) => { if (estCoche(rx) && courts.indexOf(nom) < 0) courts.push(nom); };
  pushCourt(/NFS/i, 'NFS');
  pushCourt(/Goutte|TDR|Palud/i, 'GE');
  pushCourt(/CRP/i, 'CRP');
  pushCourt(/Widal|SWF/i, 'Widal');
  pushCourt(/HBs|Hépatite B/i, 'Hépatite B');
  pushCourt(/VHC|Hépatite C/i, 'Hépatite C');
  pushCourt(/VIH/i, 'VIH');
  pushCourt(/TPHA|VDRL|Syphilis/i, 'Syphilis');
  pushCourt(/Toxo/i, 'Toxoplasmose');
  pushCourt(/Rubéole/i, 'Rubéole');
  pushCourt(/Groupe|ABO/i, 'Groupe sanguin');
  pushCourt(/Électro|Electro|Hémoglobine/i, 'Électrophorèse Hb');
  if (Object.keys(bio).some(k => crV(bio[k] && bio[k].valeur) !== '')) {
    if (courts.indexOf('Biochimie') < 0) courts.push('Biochimie');
  }
  const titreRes = courts.length ? courts.join(' + ') : (R._types || []).join(' + ');

  // Corps : un tableau par examen / panel
  let corps = '';
  corps += crBlocNFS(hema, profile);
  corps += crBlocEPHB(hema);
  corps += crBlocGE(hema);
  corps += crBlocCRP(sero);
  corps += crBlocWidal(sero);
  corps += crBlocVHB(sero);
  corps += crBlocSerologies(sero);
  corps += crBlocsBiochimie(bio, profile);
  corps += crBlocGroupe(Object.keys(gs).length ? gs : sero);

  // Examens demandés dont aucun résultat n'a été saisi
  const rendu = corps;
  const nonFaits = labels.filter(l => {
    const t = String(l);
    if (/NFS/i.test(t))            return !/NFS — Num/.test(rendu);
    if (/Goutte|TDR|Palud/i.test(t)) return !/Goutte épaisse/.test(rendu);
    if (/CRP/i.test(t))            return !/CRP — Prot/.test(rendu);
    if (/Widal|SWF/i.test(t))      return !/Widal —/.test(rendu);
    if (/HBs|Hépatite B/i.test(t)) return !/Hépatite B/.test(rendu);
    if (/Groupe|ABO/i.test(t))     return !/Groupe sanguin/.test(rendu);
    return false;
  });
  corps += crBlocNonRealises(nonFaits);
  if (!corps) corps = '<p style="text-align:center;font-style:italic;color:#555">Aucun résultat saisi pour ce dossier.</p>';

  // QR de vérification
  const refDoc = (typeof getOrCreateRef === 'function') ? getOrCreateRef(record) : '';
  const share = p.share_token;
  const qrTxt = share && typeof APP_PUBLIC_URL !== 'undefined'
    ? (APP_PUBLIC_URL + '?share=' + share)
    : ('CPMI Grand-Bassam | Ref: ' + (refDoc || '—') + ' | Dossier: ' + (p.dossier || '—')
       + ' | Patient: ' + String(p.nom || '').toUpperCase());
  let qr = '';
  try { const u = await generateQRDataURL(qrTxt, 90); if (u) qr = '<img src="' + u + '" width="62" height="62" alt="">'; } catch (e) {}

  const tech = (typeof _currentUser !== 'undefined' && _currentUser && _currentUser.username) || '—';
  const sig = (typeof _maSignature !== 'undefined' && _maSignature)
    ? '<img src="' + _maSignature + '" style="height:12mm;max-width:44mm;object-fit:contain">' : '';
  const now = new Date();
  const dateFr = d => { try { return new Date(d).toLocaleDateString('fr-FR'); } catch (e) { return '—'; } };
  const montant = Number(record && record.montant) || 0;

  const PIED = '<div class="cr-foot"><div class="cr-foot-grid">'
    + '<div class="cr-foot-l"><b>CPMI de Grand-Bassam</b><br>Édité le ' + crEsc(now.toLocaleDateString('fr-FR'))
    +   '<br><b>Montant : ' + montant.toLocaleString('fr-FR') + ' FCFA</b></div>'
    + '<div class="cr-foot-c">Signature du technicien :<div class="cr-sigbox">' + sig + '</div>'
    +   '<div style="font-size:7.5pt;color:#444">' + crEsc(tech) + ' · Technicien Biologiste</div></div>'
    + '<div class="cr-foot-r">' + qr + '</div>'
    + '</div><div class="cr-foot-pat">' + crEsc(p.nom || '') + ' · N° ' + crEsc(p.dossier || '')
    +   (refDoc ? ' · Réf. ' + crEsc(refDoc) : '') + '</div></div>';

  return CR_STYLE
    + '<table class="cr-page"><tfoot><tr><td>' + PIED + '</td></tr></tfoot><tbody><tr><td>'
    + '<div class="cr-h1">CPMI DE GRAND-BASSAM</div>'
    + '<div class="cr-h2">Centre de Protection Mère et Infantile · Laboratoire d\'analyses médicales · Grand-Bassam, Côte d\'Ivoire</div>'
    + '<hr class="cr-rule">'
    + '<div class="cr-box cr-box-res">RÉSULTAT : ' + crEsc(titreRes || '—') + '</div>'
    + '<div class="cr-box cr-box-nom">' + crEsc(String(p.nom || '—').toUpperCase()) + '</div>'
    + '<table class="cr-infos"><tbody>'
    +   '<tr><td class="cr-lab">N° Dossier</td><td>' + crEsc(p.dossier || '—') + '</td>'
    +       '<td class="cr-lab">Date de prélèvement</td><td>' + (p.date ? crEsc(dateFr(p.date)) : '—') + '</td></tr>'
    +   '<tr><td class="cr-lab">Âge / Sexe</td><td>' + crEsc(p.age ? p.age + ' ans' : '—') + ' / ' + crEsc(p.sexe || '—') + '</td>'
    +       '<td class="cr-lab">Médecin prescripteur</td><td>' + crEsc(p.medecin || '—') + '</td></tr>'
    +   '<tr><td class="cr-lab">Service / Unité</td><td>' + crEsc(p.service || '—') + '</td>'
    +       '<td class="cr-lab">Renseignements cliniques</td><td>' + crEsc(p.clinique || '—') + '</td></tr>'
    + '</tbody></table>'
    + '<div class="cr-bandeau">Examens demandés — résultats</div>'
    + corps
    + '</td></tr></tbody></table>';
}
