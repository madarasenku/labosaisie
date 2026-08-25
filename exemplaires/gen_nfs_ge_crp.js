const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, ShadingType, VerticalAlign
} = require('docx');
const fs = require('fs');

// ──────────────────────────────────────────────────────────────────────
//  PARAMÈTRES À PERSONNALISER PAR DOSSIER
// ──────────────────────────────────────────────────────────────────────
const patient = {
  nom: 'NADIA ABDOU',
  age: '32 ans', sexe: 'F',
  dossier: 'D-2026-0641',
  preleve: '16/08/2026',
  edite: '16/08/2026',
  prescripteur: 'Dr. SANI',
};

// Pour chaque examen : true = réalisé, false = non réalisé (champs vides + mention)
const FAIT = { nfs: true, ge: true, crp: false };

// ── Résultats NFS ─────────────────────────────────────────────────────
// [nom, valeur, unité, référence (F), anormal?]
const hemato = [
  ['Globules blancs (GB)',   '7.2',  '10³/µL', '4 – 10',    false],
  ['Globules rouges (GR)',   '3.9',  '10⁶/µL', '4.0 – 5.0', true ],
  ['Hémoglobine (Hb)',      '10.8', 'g/dL',   '12 – 16',   true ],
  ['Hématocrite (Ht)',      '34',   '%',       '37 – 47',   true ],
  ['VGM',                   '87',   'fL',      '80 – 100',  false],
  ['TCMH',                  '27.7', 'pg',      '27 – 32',   false],
  ['CCMH',                  '31.8', 'g/dL',   '32 – 36',   true ],
  ['Plaquettes',            '265',  '10³/µL', '150 – 400', false],
  ['VS (1ère heure)',       '18',   'mm/h',   '< 20',      false],
];
const formule = [
  ['Polynucléaires neutrophiles', '58', '%', '50 – 70', '4176 /µL',  false],
  ['Polynucléaires éosinophiles', '3',  '%', '1 – 5',   '216 /µL',   false],
  ['Polynucléaires basophiles',   '0',  '%', '0 – 1',   '0 /µL',     false],
  ['Lymphocytes',                 '32', '%', '20 – 40', '2304 /µL',  false],
  ['Monocytes',                   '7',  '%', '2 – 10',  '504 /µL',   false],
];

// ── Résultats GE ──────────────────────────────────────────────────────
const ge = {
  resultat: 'Positif',   // 'Positif' | 'Négatif'
  parasite: 'Plasmodium falciparum',
  stade: 'Trophozoïtes',
  densite: '++',          // +, ++, +++, ou valeur numérique
  commentaire: '',
};

// ── Résultats CRP ─────────────────────────────────────────────────────
const crp = {
  valeur: '',       // vide si non réalisé
  unite: 'mg/L',
  ref: '< 6',
};

// ──────────────────────────────────────────────────────────────────────
//  CHARTE GRAPHIQUE
// ──────────────────────────────────────────────────────────────────────
const BLEU   = '1F4E79';
const BLEUCL = 'DDEBF7';
const GRIS   = '595959';
const GRIS2  = 'F5F5F5';
const ROUGE  = 'C00000';
const VERT   = '375623';
const ORANGE = 'E26B0A';

const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const thin     = { style: BorderStyle.SINGLE, size: 4,  color: 'BDD7EE' };
const thinGris = { style: BorderStyle.SINGLE, size: 4,  color: 'D9D9D9' };
const thick    = { style: BorderStyle.SINGLE, size: 12, color: BLEU     };

// ──────────────────────────────────────────────────────────────────────
//  HELPERS TEXTE / CELLULE
// ──────────────────────────────────────────────────────────────────────
function txt(t, o = {}) {
  return new TextRun({
    text: String(t), font: 'Calibri', size: o.size || 20,
    bold: o.bold || false, italics: o.it || false,
    color: o.color || '000000',
  });
}
function par(runs, o = {}) {
  return new Paragraph({ alignment: o.align || AlignmentType.LEFT, spacing: o.sp, children: runs });
}
function cell(paragraphs, o = {}) {
  const borders = o.noBorder
    ? { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }
    : { top: thin, bottom: thin, left: thin, right: thin };
  return new TableCell({
    width: { size: o.w, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
    margins: { top: 40, bottom: 40, left: 100, right: 100 },
    borders,
    children: Array.isArray(paragraphs) ? paragraphs : [paragraphs],
  });
}
function pCell(text, o = {}) {
  return cell(par([txt(text, o)], { align: o.align }), o);
}

// ──────────────────────────────────────────────────────────────────────
//  EN-TÊTE LABORATOIRE
// ──────────────────────────────────────────────────────────────────────
function enTete() {
  return [
    par([txt('CENTRE DE PROMOTION MÉDICO-SANITAIRE (CPMI)', { bold: true, size: 28, color: BLEU })],
      { align: AlignmentType.CENTER }),
    par([txt('Laboratoire d\'Analyses de Biologie Médicale', { size: 19, color: GRIS })],
      { align: AlignmentType.CENTER }),
    par([txt('Tél : __ __ __ __ __   ·   BP ____   ·   Niamey, Niger', { size: 17, color: GRIS })],
      { align: AlignmentType.CENTER, sp: { after: 80 } }),
    new Paragraph({ spacing: { after: 60 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: BLEU } }, children: [] }),
    par([txt('COMPTE RENDU D\'ANALYSES BIOLOGIQUES', { bold: true, size: 26, color: BLEU })],
      { align: AlignmentType.CENTER, sp: { before: 120, after: 180 } }),
  ];
}

// ──────────────────────────────────────────────────────────────────────
//  BLOC PATIENT
// ──────────────────────────────────────────────────────────────────────
function ligneInfo(l1, v1, l2, v2) {
  const mk = (lab, val) => par([
    txt(lab + ' : ', { bold: true, size: 19, color: BLEU }),
    txt(val, { size: 19 }),
  ]);
  const c = (child, w) => new TableCell({
    width: { size: w, type: WidthType.DXA },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
    margins: { top: 24, bottom: 24 }, children: [child],
  });
  return new TableRow({ children: [c(mk(l1, v1), 4800), c(mk(l2, v2), 4800)] });
}
function blocPatient() {
  return [
    new Table({
      width: { size: 9600, type: WidthType.DXA }, columnWidths: [4800, 4800],
      borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
        insideH: noBorder, insideV: noBorder },
      rows: [
        ligneInfo('Patient',      patient.nom,
                  'N° Dossier',   patient.dossier),
        ligneInfo('Âge / Sexe',   patient.age + '  ·  ' + patient.sexe,
                  'Prélevé le',   patient.preleve),
        ligneInfo('Prescripteur', patient.prescripteur,
                  'Édité le',     patient.edite),
      ],
    }),
    new Paragraph({ spacing: { after: 80 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BDD7EE' } }, children: [] }),
  ];
}

// ──────────────────────────────────────────────────────────────────────
//  TITRE DE SECTION
// ──────────────────────────────────────────────────────────────────────
function titreSection(t, fait) {
  const mention = fait ? '' : '  [NON RÉALISÉ]';
  return par([
    txt('  ' + t + mention, { bold: true, size: 22, color: fait ? BLEU : GRIS }),
  ], { sp: { before: 220, after: 80 } });
}

// ──────────────────────────────────────────────────────────────────────
//  BANDEAU NON RÉALISÉ
// ──────────────────────────────────────────────────────────────────────
function nonRealise() {
  return new Table({
    width: { size: 9600, type: WidthType.DXA }, columnWidths: [9600],
    rows: [new TableRow({ children: [
      cell(par([txt('— Examen non réalisé sur ce dossier —', { it: true, size: 18, color: GRIS })],
        { align: AlignmentType.CENTER }), { w: 9600, fill: GRIS2 }),
    ] })],
  });
}

// ──────────────────────────────────────────────────────────────────────
//  TABLEAU NFS
// ──────────────────────────────────────────────────────────────────────
const W_NFS  = [3900, 1500, 1500, 2700];
const W_FL   = [3300, 1200,  800, 1700, 2600];

function enTeteTable(cols, labels) {
  return new TableRow({ tableHeader: true, children:
    labels.map((l, i) => pCell(l, { w: cols[i], bold: true, color: 'FFFFFF',
      fill: BLEU, align: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER })) });
}

function tableNFS() {
  const rows = [ enTeteTable(W_NFS, ['Paramètre', 'Résultat', 'Unité', 'Valeurs de référence']) ];
  hemato.forEach(([n, v, u, r, ano]) => {
    const fill = rows.length % 2 === 0 ? GRIS2 : 'FFFFFF';
    rows.push(new TableRow({ children: [
      pCell(n, { w: W_NFS[0], fill }),
      pCell(v, { w: W_NFS[1], align: AlignmentType.CENTER, bold: ano, color: ano ? ROUGE : '000000', fill }),
      pCell(u, { w: W_NFS[2], align: AlignmentType.CENTER, color: GRIS, fill }),
      pCell(r, { w: W_NFS[3], align: AlignmentType.CENTER, color: GRIS, fill }),
    ] }));
  });
  return new Table({ width: { size: 9600, type: WidthType.DXA }, columnWidths: W_NFS, rows });
}

function tableFL() {
  const rows = [ enTeteTable(W_FL, ['Formule leucocytaire', '%', ' ', 'Réf. (%)', 'Valeur absolue (/µL)']) ];
  formule.forEach(([n, v, u, r, abs, ano]) => {
    const fill = rows.length % 2 === 0 ? GRIS2 : 'FFFFFF';
    rows.push(new TableRow({ children: [
      pCell(n, { w: W_FL[0], fill }),
      pCell(v, { w: W_FL[1], align: AlignmentType.CENTER, bold: ano, color: ano ? ROUGE : '000000', fill }),
      pCell('%', { w: W_FL[2], align: AlignmentType.CENTER, color: GRIS, fill }),
      pCell(r, { w: W_FL[3], align: AlignmentType.CENTER, color: GRIS, fill }),
      pCell(abs, { w: W_FL[4], align: AlignmentType.CENTER, fill }),
    ] }));
  });
  return new Table({ width: { size: 9600, type: WidthType.DXA }, columnWidths: W_FL, rows });
}

// ──────────────────────────────────────────────────────────────────────
//  SECTION NFS (ou non réalisée)
// ──────────────────────────────────────────────────────────────────────
function sectionNFS() {
  const titre = new Paragraph({
    spacing: { before: 220, after: 80 },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: BLEUCL },
    children: [txt('  🔬 HÉMATOLOGIE — Numération Formule Sanguine (NFS) + VS', { bold: true, size: 22, color: BLEU })],
  });
  if (!FAIT.nfs) return [ titre, nonRealise() ];
  return [
    titre,
    tableNFS(),
    new Paragraph({ spacing: { after: 60 }, children: [] }),
    tableFL(),
    par([txt('▲ Valeurs en rouge : hors des valeurs de référence pour Femme adulte.', { it: true, size: 16, color: GRIS })],
      { sp: { before: 60, after: 40 } }),
  ];
}

// ──────────────────────────────────────────────────────────────────────
//  SECTION GE
// ──────────────────────────────────────────────────────────────────────
const W_GE = [3600, 6000];
function sectionGE() {
  const titre = new Paragraph({
    spacing: { before: 220, after: 80 },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: BLEUCL },
    children: [txt('  🦟 PARASITOLOGIE — Goutte Épaisse / Frottis (GE)', { bold: true, size: 22, color: BLEU })],
  });
  if (!FAIT.ge) return [titre, nonRealise()];

  const coulRes = ge.resultat === 'Positif' ? ROUGE : VERT;
  const rows = [
    enTeteTable(W_GE, ['Paramètre', 'Résultat']),
    new TableRow({ children: [
      pCell('Résultat', { w: W_GE[0], fill: GRIS2 }),
      pCell(ge.resultat, { w: W_GE[1], bold: true, color: coulRes, fill: GRIS2 }),
    ] }),
    new TableRow({ children: [
      pCell('Parasite identifié', { w: W_GE[0] }),
      pCell(ge.parasite || '—', { w: W_GE[1] }),
    ] }),
    new TableRow({ children: [
      pCell('Stade', { w: W_GE[0], fill: GRIS2 }),
      pCell(ge.stade || '—', { w: W_GE[1], fill: GRIS2 }),
    ] }),
    new TableRow({ children: [
      pCell('Densité parasitaire', { w: W_GE[0] }),
      pCell(ge.densite || '—', { w: W_GE[1] }),
    ] }),
  ];
  if (ge.commentaire) {
    rows.push(new TableRow({ children: [
      pCell('Commentaire', { w: W_GE[0] }),
      pCell(ge.commentaire, { w: W_GE[1], it: true }),
    ] }));
  }
  return [ titre, new Table({ width: { size: 9600, type: WidthType.DXA }, columnWidths: W_GE, rows }) ];
}

// ──────────────────────────────────────────────────────────────────────
//  SECTION CRP
// ──────────────────────────────────────────────────────────────────────
const W_CRP = [3900, 1500, 1500, 2700];
function sectionCRP() {
  const titre = new Paragraph({
    spacing: { before: 220, after: 80 },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: BLEUCL },
    children: [txt('  🧪 BIOLOGIE — CRP (Protéine C Réactive)', { bold: true, size: 22, color: BLEU })],
  });
  if (!FAIT.crp) return [titre, nonRealise()];

  const val = parseFloat(crp.valeur);
  const ano = !isNaN(val) && val >= 6;
  const rows = [
    enTeteTable(W_CRP, ['Paramètre', 'Résultat', 'Unité', 'Valeurs de référence']),
    new TableRow({ children: [
      pCell('CRP', { w: W_CRP[0] }),
      pCell(crp.valeur, { w: W_CRP[1], align: AlignmentType.CENTER, bold: ano, color: ano ? ROUGE : '000000' }),
      pCell(crp.unite, { w: W_CRP[2], align: AlignmentType.CENTER, color: GRIS }),
      pCell(crp.ref,   { w: W_CRP[3], align: AlignmentType.CENTER, color: GRIS }),
    ] }),
  ];
  return [ titre, new Table({ width: { size: 9600, type: WidthType.DXA }, columnWidths: W_CRP, rows }) ];
}

// ──────────────────────────────────────────────────────────────────────
//  PIED DE PAGE
// ──────────────────────────────────────────────────────────────────────
function pied() {
  return [
    new Paragraph({ spacing: { before: 180 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: BLEU } }, children: [] }),
    par([txt('Ce document est confidentiel — Résultats à interpréter par un professionnel de santé.', { it: true, size: 15, color: GRIS })],
      { sp: { before: 60 } }),
    par([txt('Le Biologiste Médical', { bold: true, size: 20 })],
      { align: AlignmentType.RIGHT, sp: { before: 600 } }),
    par([txt('Signature et cachet', { it: true, size: 16, color: GRIS })],
      { align: AlignmentType.RIGHT, sp: { before: 30 } }),
  ];
}

// ──────────────────────────────────────────────────────────────────────
//  ASSEMBLAGE DU DOCUMENT
// ──────────────────────────────────────────────────────────────────────
const doc = new Document({
  styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
  sections: [{
    properties: { page: { margin: { top: 600, bottom: 600, left: 900, right: 900 } } },
    children: [
      ...enTete(),
      ...blocPatient(),
      ...sectionNFS(),
      ...sectionGE(),
      ...sectionCRP(),
      ...pied(),
    ],
  }],
});

const out = process.argv[2] || '/root/repo/exemplaires/NFS_GE_CRP.docx';
Packer.toBuffer(doc).then(b => { fs.writeFileSync(out, b); console.log('Créé :', out); });
