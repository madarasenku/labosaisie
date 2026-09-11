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
    // ✅ v13.143 — L'anomalie est recalculée depuis la valeur ABSOLUE et les
    // bornes absolues : les dossiers déjà enregistrés avec un « interp » erroné
    // (comparaison absolu ⇄ pourcentage) s'impriment donc correctement.
    let ano = crAno(v.interp);
    const n = parseFloat(v.valeur);
    if (!isNaN(n) && p.lo != null && p.hi != null && /µL/.test(v.unite || '/µL')) {
      ano = (n < p.lo || n > p.hi);
    }
    rows.push({ nom: p.name, val: v.valeur, unite: v.unite || '/µL',
                ref: refDisplayFor(p, profile), ano });
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
  // ✅ v13.145 — Ag HBs et Ac anti-HBc peuvent être rendus en QUALITATIF ou en
  // QUANTITATIF (sélecteur qual/quant). L'ancienne version ne lisait que
  // « resultat » : un Ag HBs saisi en quantitatif disparaissait du compte rendu.
  const vAg  = crV(ag.resultat)  || crV(ag.valeur);
  const vHbs = crV(hbs.valeur)   || crV(hbs.resultat);
  const vHbc = crV(hbc.resultat) || crV(hbc.valeur);
  if (!vAg && !vHbs && !vHbc) return '';
  const unite = (o, v) => (crV(o.valeur) && v === crV(o.valeur)) ? ' ' + (o.unite || 'UI/L') : '';
  const rows = [];
  if (vAg)  rows.push({ nom: 'Ag HBs (antigène de surface)', val: vAg + unite(ag, vAg), ref: 'Négatif',
                        ano: /positif/i.test(vAg) || (crV(ag.valeur) !== '' && parseFloat(ag.valeur) > 1) });
  if (vHbs) rows.push({ nom: 'Ac anti-HBs (immunité)', val: vHbs + unite(hbs, vHbs), ref: '≥ 10 = immunisé',
                        ano: crV(hbs.valeur) !== '' && parseFloat(hbs.valeur) < 10 });
  if (vHbc) rows.push({ nom: 'Ac anti-HBc total (contact viral)', val: vHbc + unite(hbc, vHbc), ref: 'Négatif',
                        ano: /positif/i.test(vHbc) || (crV(hbc.valeur) !== '' && parseFloat(hbc.valeur) > 1) });
  // ✅ v13.145 — L'interprétation tient compte de l'Ac anti-HBc : un sujet
  // anti-HBc positif a RENCONTRÉ le virus (infection ancienne guérie), ce qui
  // n'est pas la même chose qu'une immunité vaccinale.
  const agPos  = /positif/i.test(vAg) || (crV(ag.valeur) !== '' && parseFloat(ag.valeur) > 1);
  const hbcPos = /positif/i.test(vHbc) || (crV(hbc.valeur) !== '' && parseFloat(hbc.valeur) > 1);
  const hbsProt = crV(hbs.valeur) !== '' && parseFloat(hbs.valeur) >= 10;
  if (agPos) {
    rows.push({ interpretation: 'Interprétation : Infection par le virus de l\'hépatite B (aiguë ou chronique) — avis spécialisé recommandé.' });
  } else if (hbcPos && hbsProt) {
    rows.push({ interpretation: 'Interprétation : Infection ancienne guérie — sujet protégé (contact viral avec anticorps protecteurs).' });
  } else if (hbcPos) {
    rows.push({ interpretation: 'Interprétation : Contact antérieur avec le virus de l\'hépatite B sans anticorps protecteurs — avis spécialisé recommandé.' });
  } else if (hbsProt) {
    rows.push({ interpretation: 'Interprétation : Sujet immunisé contre l\'hépatite B (immunité vaccinale).' });
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

// ── Un examen demandé a-t-il été réalisé ? ──────────────────
// ✅ v13.144 — L'ancienne version ne testait que 6 examens : Rubéole, VIH,
// Syphilis, Toxoplasmose, électrophorèse et toute la biochimie demandées mais
// non saisies disparaissaient du compte rendu, au lieu d'être signalées.
// Le modèle validé impose que CHAQUE examen demandé apparaisse.
function crExamFait(label, R) {
  const H = (R['Hématologie'] || {}), S = (R['Immuno-Sérologie'] || {}),
        B = (R['Biochimie'] || {}), G = (R['Groupe sanguin'] || {}),
        Bac = (R['Bactériologie'] || {});
  const sero = n => { const v = S[n]; return !!(v && (crV(v.resultat) || crV(v.valeur))); };
  const T = [
    [/Bilan prénatal/i,           () => true],   // forfait : pas un examen mesurable
    [/NFS/i,                      () => !!(H['Globules blancs (GB)'] && crV(H['Globules blancs (GB)'].valeur))],
    [/Goutte|TDR|Palud/i,         () => crV(H['GE - Résultat']) !== '' || crV(H['GE - TDR']) !== ''],
    [/Électrophorèse|Electrophor/i, () => ['Hb A','Hb A2','Hb F','Hb S','Hb C'].some(n => H[n] && crV(H[n].valeur))],
    [/^VS |Vitesse de s/i,        () => !!(H['VS (1ère heure)'] && crV(H['VS (1ère heure)'].valeur))],
    [/CRP/i,                      () => crV(S['CRP - Valeur']) !== ''],
    [/Widal|SWF/i,                () => (typeof WIDAL_ANTIGENES !== 'undefined' ? WIDAL_ANTIGENES : [])
                                          .some(a => { const w = S['Widal - ' + a.name];
                                            return w && crV(w.titre) && w.titre !== 'Non réalisé'; })
                                        || crV(S['Widal - Conclusion']) !== ''],
    [/HBs|Hépatite B/i,           () => sero('Ag HBs') || sero('Ac anti-HBs') || sero('Ac anti-HBc total')],
    [/VHC|Hépatite C/i,           () => sero('Ac anti-VHC')],
    [/VIH/i,                      () => sero('VIH 1 & 2')],
    [/TPHA|VDRL|Syphilis/i,       () => sero('TPHA / VDRL (Syphilis)')],
    [/Toxo/i,                     () => sero('Toxoplasmose IgG') || sero('Toxoplasmose IgM')],
    [/Rubéole|Rube/i,             () => sero('Rubéole IgG') || sero('Rubéole IgM')],
    [/Groupe|ABO|Rhésus/i,        () => crV(G['Groupe ABO']) !== '' || crV(S['Groupe ABO']) !== ''],
    // ✅ v13.146 — ECBU / Bactériologie : demandé mais non saisi disparaissait du
    // compte rendu (ni résultat, ni « non réalisé »), car le fallback plus bas
    // renvoie « true » pour tout examen inconnu. Un ECBU de bilan prénatal revient
    // souvent après coup : il DOIT figurer en « non réalisé » tant qu'il est vide.
    [/ECBU|Bact[eé]riolog|Cytobact/i, () => ['Culture','Germe identifié','Numération bactérienne',
                                    'Leucocytes (/mm³)','Aspect'].some(n => crV(Bac[n]) !== '')],
  ];
  for (const [rx, ok] of T) { if (rx.test(label)) { try { return !!ok(); } catch (e) { return false; } } }
  // Biochimie et autres : le libellé correspond au nom du paramètre.
  const nomsBio = [];
  crGroupesBio().forEach(([grp]) => grp.forEach(x => nomsBio.push(x.name)));
  const direct = nomsBio.filter(n => label.indexOf(n) >= 0 || n.indexOf(label) >= 0);
  if (direct.length) return direct.some(n => B[n] && crV(B[n].valeur) !== '');
  if (/ASAT|ALAT|Transaminase/i.test(label)) {
    return ['ASAT (TGO)', 'ALAT (TGP)'].some(n => B[n] && crV(B[n].valeur) !== '');
  }
  return true;   // examen inconnu du rendu : on ne le signale pas à tort
}

// ── Examens demandés mais non saisis ────────────────────────
function crBlocNonRealises(labels) {
  if (!labels.length) return '';
  const rows = labels.map(l => ({ nom: l, val: '—', unite: '', ref: 'Non réalisé' }));
  return crTable('Examens demandés — non réalisés', rows);
}

// ── Feuille de style du compte rendu (noir & blanc, modèle validé) ──
//
// ✅ v13.163 — PAGINATION PAR LE NAVIGATEUR (et non plus en JS).
//   Raison : une pagination JS mesure les hauteurs en média ÉCRAN, alors que
//   l'impression compose en média IMPRESSION (lignes plus courtes, polices
//   différentes) ; les deux ne coïncident jamais → pages en trop, feuilles
//   mal remplies. Ici c'est le NAVIGATEUR qui pagine, directement en média
//   impression — donc l'aperçu (rendu via le moteur d'impression) est fidèle.
//
//   Technique : chaque compte rendu est UNE grande table `.cr-doc` avec un
//   `<thead>` (entête) et un `<tfoot>` (pied). Le navigateur RÉPÈTE
//   automatiquement le thead en haut et le tfoot en bas du contenu de CHAQUE
//   feuille imprimée, et — garantie du modèle de table — ne laisse JAMAIS le
//   contenu passer sous le pied (l'espace du tfoot est réservé dans le flux).
//   Donc : entête + pied sur chaque feuille, aucun résultat caché, aucune ligne
//   coupée, et plusieurs comptes rendus (impression de lot) s'enchaînent sans
//   se chevaucher. Un bilan long déborde simplement sur la feuille suivante.
const CR_STYLE = `
<style>
  @page { size: A4; margin: 12mm 10mm; }
  #print-render::after, #print-render::before,
  body::after, body::before { content: none !important; display: none !important; }
  #print-render { font-family: 'Segoe UI', Arial, sans-serif; color:#000; background:#fff; }

  /* La table-cadre : thead répété en haut, tfoot répété en bas de chaque feuille. */
  .cr-doc { width:100%; border-collapse:collapse; }
  .cr-doc > thead { display:table-header-group; }
  .cr-doc > tfoot { display:table-footer-group; }
  .cr-doc > thead > tr > td, .cr-doc > tbody > tr > td, .cr-doc > tfoot > tr > td {
    border:0; padding:0; }
  .cr-doc + .cr-doc { page-break-before:always; }

  /* Entête (thead) : répétée en haut de chaque feuille. */
  .cr-head { text-align:center; padding-bottom:4px; }
  .cr-h1 { font-size:13.5pt; font-weight:800; letter-spacing:.3px; margin:0; }
  .cr-h2 { font-size:7pt; color:#333; margin:1px 0 3px; }
  .cr-head-pat { font-size:8.5pt; color:#222; padding-bottom:3px; border-bottom:1.3pt solid #111; }

  /* Pied FIXE : collé au bas de CHAQUE feuille imprimée (répété par le navigateur). */
  .cr-foot-fixed { position:fixed; left:0; right:0; bottom:0; padding:0 10mm; background:#fff; }
  /* Le pied du <tfoot> RÉSERVE sa hauteur sur chaque feuille (contenu jamais
     sous le pied) mais reste invisible en fiche simple : c'est le pied fixe qui
     s'affiche, toujours en bas. */
  .cr-doc > tfoot .cr-foot { visibility:hidden; }
  /* Impression de LOT : pas de pied fixe (un par patient via le tfoot). */
  #print-render.cr-lot .cr-foot-fixed { display:none; }
  #print-render.cr-lot .cr-doc > tfoot .cr-foot { visibility:visible; }
  .cr-foot { padding-top:4px; font-size:7.5pt; border-top:1.4px solid #333; }
  .cr-foot-grid { display:flex; align-items:flex-start; gap:14px; }
  .cr-foot-l { flex:1; } .cr-foot-c { flex:1.2; text-align:center; } .cr-foot-r { text-align:right; }
  .cr-foot b { font-size:8pt; }
  .cr-sigbox { border:1px solid #666; height:12mm; margin-top:2px; }
  .cr-foot-pat { margin-top:3px; font-size:7.5pt; color:#444; }

  /* Contenu : s'écoule naturellement dans le tbody (le pied fixe est toujours
     en bas ; le tfoot réserve sa hauteur, donc pas de chevauchement). */
  .cr-body { color:#000; }
  .cr-box { border:1px solid #444; padding:3px 10px; margin-bottom:4px; }
  .cr-box-res { text-align:center; font-weight:700; font-size:10.5pt; }
  .cr-box-nom { text-align:center; font-weight:800; font-size:16pt; letter-spacing:.5px; padding:4px 10px; }
  .cr-infos { width:100%; border-collapse:collapse; margin-bottom:5px; font-size:9pt; }
  .cr-infos td { border:1px solid #999; padding:3px 8px; }
  .cr-infos .cr-lab { font-weight:700; background:#f2f2f2; width:22%; font-size:8.5pt; }
  .cr-bandeau { border:1px solid #444; background:#eee; font-weight:700; font-size:10pt; padding:4px 10px; margin:6px 0 5px; }
  /* Les tableaux peuvent se répartir sur plusieurs feuilles (un long bilan ne
     tient pas sur une page). On coupe SEULEMENT entre deux lignes (jamais au
     milieu d'une ligne) et l'en-tête de colonnes se répète en haut de chaque
     feuille — ainsi aucune ligne ne passe sous le pied. */
  .cr-t { width:100%; border-collapse:collapse; margin-bottom:7px; font-size:9pt; page-break-inside:auto; }
  .cr-t thead { display:table-header-group; }
  .cr-t tr { page-break-inside:avoid; }
  /* Lignes aérées : un bilan court (NFS + GE + CRP) remplit la feuille sans
     agrandir le texte ; un bilan long déborde simplement sur la feuille suivante. */
  .cr-t th, .cr-t td { border:1px solid #999; padding:5px 8px; }
  .cr-th-nom { text-align:left; font-weight:700; background:#eee; width:33%; font-size:9pt; }
  .cr-th-c { text-align:center; font-weight:700; background:#eee; font-size:9pt; }
  .cr-u { width:11%; }
  .cr-nom { text-align:left; }
  .cr-val { text-align:center; font-size:10pt; }
  .cr-val.cr-ano { font-weight:800; background:#d2d2d2; }
  .cr-unite { text-align:center; font-size:8.5pt; color:#444; }
  .cr-ref { text-align:center; font-size:8.5pt; color:#444; }
  .cr-interp { font-style:italic; font-size:8.5pt; text-align:center; background:#eee; }
  /* Saut de feuille imposé (ex. sérologie renvoyée en page 2). */
  .cr-break { page-break-before:always; }
</style>`;

// ── Assemblage du compte rendu complet ──────────────────────
async function crBuildHTML(record) {
  let R = (record && record.resultats) || {};
  const p = (record && record.patient) || {};
  const profile = (typeof profileFromPatient === 'function') ? profileFromPatient(p) : {};

  // ✅ v13.146 — DOSSIER MONO-ANALYSE : compte rendu vide.
  // printRecord() APLATIT un dossier à une seule analyse : il passe
  // type='<analyse>' et resultats = le SOUS-objet de ce type (paramètres à plat
  // + _examens_coches en tableau), au lieu du format dossier attendu ici
  // (R['Biochimie'] = {…}, R._examens_coches = { Biochimie:[…] }). Le renderer
  // cherchait alors R['Biochimie'] = undefined et rendait TOUT « non réalisé ».
  // On re-niche le sous-objet sous son type quand on détecte ce format aplati.
  if (record && record.type && record.type !== 'Dossier' && !R[record.type]) {
    const typeData = {}; const meta = {};
    Object.keys(R).forEach(k => { if (k[0] === '_') meta[k] = R[k]; else typeData[k] = R[k]; });
    const reNiche = { [record.type]: typeData };
    Object.keys(meta).forEach(k => {
      reNiche[k] = (k === '_examens_coches' && Array.isArray(meta[k]))
        ? { [record.type]: meta[k] } : meta[k];
    });
    R = reNiche;
  }

  // Sous-résultats par analyse (dossier unifié ou fiche simple)
  const sub = t => (R[t] && typeof R[t] === 'object') ? R[t] : {};
  const hema = sub('Hématologie'), bio = sub('Biochimie'),
        sero = sub('Immuno-Sérologie'), gs = sub('Groupe sanguin');

  // Examens demandés (toutes analyses confondues)
  const coches = R._examens_coches || {};
  const labels = Array.isArray(coches) ? coches.slice()
    : Object.values(coches).reduce((a, v) => a.concat(v || []), []);
  const estCoche = rx => labels.some(l => rx.test(l));

  // ✅ v13.146 — Détection BPN dès ici (utilisée pour non-réalisés ET montant)
  const _estBPN = labels.some(l => /pr[ée]natal/i.test(l));

  // Ligne « RÉSULTAT : … » — noms courts des examens demandés
  const courts = [];
  const pushCourt = (rx, nom) => { if (estCoche(rx) && courts.indexOf(nom) < 0) courts.push(nom); };
  // ✅ v13.144 — Le forfait prénatal est nommé EN TÊTE : le compte rendu remis à
  // la patiente doit dire qu'il s'agit d'un bilan prénatal, pas seulement
  // énumérer les examens qui le composent.
  pushCourt(/Bilan prénatal/i, 'Bilan prénatal complet');
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

  // ✅ v13.146 — MISE EN PAGE 2 FEUILLES.
  // Feuille 1 : Hématologie (NFS, Électrophorèse, GE) + Groupe sanguin.
  // Feuille 2 : Biochimie + Immuno-Sérologie + examens non réalisés.
  // Le saut de page est inséré seulement quand les deux feuilles ont du contenu.
  // ── Blocs de contenu : CHAQUE tableau devient un bloc indivisible, pour que la
  //    pagination place les blocs entiers page par page (jamais coupés). ──
  const blocsHema = [];
  const pushT = (arr, html) => { (String(html || '').match(/<table[\s\S]*?<\/table>/g) || []).forEach(t => arr.push(t)); };
  pushT(blocsHema, crBlocNFS(hema, profile));
  pushT(blocsHema, crBlocEPHB(hema));
  pushT(blocsHema, crBlocGE(hema));
  pushT(blocsHema, crBlocGroupe(Object.keys(gs).length ? gs : sero));

  const blocsBio = [];
  // ✅ v13.162 — Le bilan prénatal n'inclut PAS de CRP : on ne l'affiche pas en BPN.
  if (!_estBPN) pushT(blocsBio, crBlocCRP(sero));
  // ✅ v13.168 — Le bloc Widal n'apparaît que si le Widal a été DEMANDÉ. Les
  //   antigènes TO/TH sont préremplis « Négatif » et une conclusion est générée
  //   même sans Widal coché ; sans ce garde, un compte rendu NFS + GE + CRP
  //   sortait une 2ᵉ page Widal non demandée.
  if (estCoche(/Widal|SWF/i)) pushT(blocsBio, crBlocWidal(sero));
  pushT(blocsBio, crBlocVHB(sero));
  pushT(blocsBio, crBlocSerologies(sero));
  pushT(blocsBio, crBlocsBiochimie(bio, profile));
  // Examens demandés dont aucun résultat n'a été saisi (sauf BPN).
  const nonFaits = _estBPN ? [] : labels.filter(l => !crExamFait(String(l), R));
  pushT(blocsBio, crBlocNonRealises(nonFaits));

  // ✅ v13.162 — Règle métier : plus d'UN examen de sérologie → la sérologie (+
  //   biochimie) est renvoyée sur une nouvelle feuille (héma + groupe restent
  //   ensemble sur la 1ʳᵉ).
  const _seroLabels = labels.filter(l => /CRP|Widal|SWF|HBs|H[ée]patite|VIH|TPHA|VDRL|Syphilis|Toxo|Rub[eé]ole|VHC|S[ée]rolog/i.test(String(l)));
  const _forceSeroBreak = _seroLabels.length > 1 && blocsHema.length && blocsBio.length;

  const refDoc = (typeof getOrCreateRef === 'function') ? getOrCreateRef(record) : '';
  const share = p.share_token;
  const qrTxt = share && typeof APP_PUBLIC_URL !== 'undefined'
    ? (APP_PUBLIC_URL + '?share=' + share)
    : ('CPMI Grand-Bassam | Ref: ' + (refDoc || '—') + ' | Dossier: ' + (p.dossier || '—')
       + ' | Patient: ' + String(p.nom || '').toUpperCase());
  let qr = '';
  try { const u = await generateQRDataURL(qrTxt, 90); if (u) qr = '<img src="' + u + '" width="62" height="62" alt="">'; } catch (e) {}

  const tech = (typeof _currentUser !== 'undefined' && _currentUser && _currentUser.username) || '—';
  const now = new Date();
  const dateFr = d => { try { return new Date(d).toLocaleDateString('fr-FR'); } catch (e) { return '—'; } };
  const _montantReel = Number(record && record.montant) || 0;
  const montant = _estBPN ? Math.max(20000, _montantReel) : _montantReel;

  // ── Entête FIXE (position:fixed) : répétée en haut de chaque feuille ──
  const HEAD = '<div class="cr-head">'
    + '<div class="cr-h1">CPMI DE GRAND-BASSAM</div>'
    + '<div class="cr-h2">Centre de Protection Mère et Infantile · Laboratoire d\'analyses médicales · Grand-Bassam, Côte d\'Ivoire</div>'
    + '<div class="cr-head-pat">' + crEsc(String(p.nom || '—').toUpperCase()) + ' · N° ' + crEsc(p.dossier || '—')
    + (p.date ? (' · ' + crEsc(dateFr(p.date))) : '') + '</div>'
    + '</div>';

  // ── Pied FIXE (position:fixed) : répété en bas de chaque feuille ──
  const PIED = '<div class="cr-foot"><div class="cr-foot-grid">'
    + '<div class="cr-foot-l"><b>CPMI de Grand-Bassam</b><br>Édité le ' + crEsc(now.toLocaleDateString('fr-FR'))
    +   '<br><b>Montant : ' + montant.toLocaleString('fr-FR') + ' FCFA</b></div>'
    + '<div class="cr-foot-c">Signature du technicien :<div class="cr-sigbox"></div>'
    +   '<div style="font-size:8pt;color:#444">TBM ' + crEsc(tech.toUpperCase()) + ' · Technicien Biologiste Médical</div></div>'
    + '<div class="cr-foot-r">' + qr + '</div>'
    + '</div><div class="cr-foot-pat">' + crEsc(p.nom || '') + ' · N° ' + crEsc(p.dossier || '')
    +   (refDoc ? ' · Réf. ' + crEsc(refDoc) : '') + '</div></div>';

  // ── Bloc d'introduction (page 1) : RÉSULTAT + NOM + infos + bandeau ──
  const INTRO = '<div class="cr-box cr-box-res">RÉSULTAT : ' + crEsc(titreRes || '—') + '</div>'
    + '<div class="cr-box cr-box-nom">' + crEsc(String(p.nom || '—').toUpperCase()) + '</div>'
    + '<table class="cr-infos"><tbody>'
    +   '<tr><td class="cr-lab">N° Dossier</td><td>' + crEsc(p.dossier || '—') + '</td>'
    +       '<td class="cr-lab">Date de prélèvement</td><td>' + (p.date ? crEsc(dateFr(p.date)) : '—') + '</td></tr>'
    +   '<tr><td class="cr-lab">Âge / Sexe</td><td>' + crEsc(p.age ? formatAge(p.age) : '—') + ' / ' + crEsc(p.sexe || '—') + '</td>'
    +       '<td class="cr-lab">Médecin prescripteur</td><td>' + crEsc(p.medecin || '—') + '</td></tr>'
    +   '<tr><td class="cr-lab">Service / Unité</td><td>' + crEsc(p.service || '—') + '</td>'
    +       '<td class="cr-lab">Renseignements cliniques</td><td>' + crEsc(p.clinique || '—') + '</td></tr>'
    + '</tbody></table>'
    + '<div class="cr-bandeau">Examens demandés — résultats</div>';

  // ── Corps qui s'écoule (le navigateur le répartit sur les feuilles) ──
  //   INTRO (page 1) → blocs hématologie → [saut imposé] → blocs bio/sérologie.
  let corps = INTRO;
  blocsHema.forEach(b => { corps += b; });
  if (_forceSeroBreak) corps += '<div class="cr-break"></div>';
  blocsBio.forEach((b, i) => {
    // Sur saut imposé, le 1ᵉʳ bloc bio ouvre la nouvelle feuille : on le colle au
    // saut pour éviter une feuille vide si le navigateur double le break.
    corps += b;
  });
  if (!blocsHema.length && !blocsBio.length) {
    corps += '<p style="text-align:center;font-style:italic;color:#555">Aucun résultat saisi pour ce dossier.</p>';
  }

  // ✅ v13.164 — PIED TOUJOURS EN BAS + entête/pied répétés sur chaque feuille.
  //   · L'entête est un <thead> (répété en haut de chaque feuille par le navigateur).
  //   · Le PIED est posé DEUX fois :
  //       – dans le <tfoot> (répété en bas du CONTENU de chaque feuille) : il RÉSERVE
  //         sa hauteur (visibility:hidden en fiche simple) pour que le contenu ne
  //         passe jamais dessous ;
  //       – dans un bloc `position:fixed` collé au BAS de la feuille (répété par le
  //         navigateur sur chaque page) : c'est le pied VISIBLE, toujours en bas.
  //   En impression de LOT (plusieurs fiches), on masque le pied fixe et on rend
  //   visible le pied du tfoot (un pied par patient) — voir impression.js.
  return CR_STYLE
    + '<div class="cr-foot-fixed">' + PIED + '</div>'
    + '<table class="cr-doc">'
    +   '<thead><tr><td>' + HEAD + '</td></tr></thead>'
    +   '<tfoot><tr><td>' + PIED + '</td></tr></tfoot>'
    +   '<tbody><tr><td><div class="cr-body">' + corps + '</div></td></tr></tbody>'
    + '</table>';
}

// ✅ v13.163 — Plus de pagination JS : c'est le navigateur qui pagine, en média
//   impression (entête / pied fixes répétés, marges @page réservées). Aucune
//   mesure d'écran, donc aucun décalage écran ⇄ impression. crPaginate() est
//   conservée en NO-OP tolérant pour les appelants existants (impression.js).
function crPaginate(/* root */) { /* pagination assurée par le navigateur */ }
