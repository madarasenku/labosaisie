const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, ShadingType, VerticalAlign
} = require('docx');
const fs = require('fs');

// ── Charte ────────────────────────────────────────────────────────────
const BLEU   = '1F4E79';   // bleu foncé en-têtes
const BLEUCL = 'DDEBF7';   // bleu clair fond section
const GRIS   = '808080';
const NOIR   = '000000';
const ROUGE  = 'C00000';

// ── Données du patient (exemple — sera rempli depuis la fiche) ────────
const patient = {
  nom: 'NADIA ABDOU',
  age: '32 ans', sexe: 'F',
  dossier: 'D-2026-0641',
  preleve: '16/08/2026',
  edite: '16/08/2026',
  prescripteur: 'Dr. SANI',
};

// ── Résultats NFS (exemple) : [nom, valeur, unité, référence, anormal?] ─
const hemato = [
  ['Globules blancs (GB)', '7.2',  '10³/µL', '4 – 10',      false],
  ['Globules rouges (GR)', '3.9',  '10⁶/µL', '4.0 – 5.0',   true ],
  ['Hémoglobine (Hb)',     '10.8', 'g/dL',   '12 – 16',     true ],
  ['Hématocrite (Ht)',     '34',   '%',      '37 – 47',     true ],
  ['VGM',                  '87',   'fL',     '80 – 100',    false],
  ['TCMH',                 '27.7', 'pg',     '27 – 32',     false],
  ['CCMH',                 '31.8', 'g/dL',   '32 – 36',     true ],
  ['Plaquettes',           '265',  '10³/µL', '150 – 400',   false],
  ['VS (1ère heure)',      '18',   'mm/h',   '< 20',        false],
];
const formule = [
  ['Polynucléaires neutrophiles', '58', '%', '50 – 70', '4176 /µL', false],
  ['Polynucléaires éosinophiles', '3',  '%', '1 – 5',   '216 /µL',  false],
  ['Polynucléaires basophiles',   '0',  '%', '0 – 1',   '0 /µL',    false],
  ['Lymphocytes',                 '32', '%', '20 – 40', '2304 /µL', false],
  ['Monocytes',                   '7',  '%', '2 – 10',  '504 /µL',  false],
];

// ── Helpers ───────────────────────────────────────────────────────────
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const thin = { style: BorderStyle.SINGLE, size: 2, color: 'BFBFBF' };

function txt(t, o = {}) {
  return new TextRun({ text: t, font: 'Calibri', size: o.size || 20,
    bold: o.bold || false, italics: o.it || false,
    color: o.color || NOIR, ...o });
}
function cell(children, o = {}) {
  return new TableCell({
    width: { size: o.w, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
    margins: { top: 30, bottom: 30, left: 90, right: 90 },
    borders: { top: thin, bottom: thin, left: thin, right: thin },
    children: Array.isArray(children) ? children : [children],
  });
}
function pCell(text, o = {}) {
  return cell(new Paragraph({
    alignment: o.align || AlignmentType.LEFT,
    children: [txt(text, o)],
  }), o);
}

// Largeurs colonnes (DXA) — total 9600 (marges 1440 chaque côté sur A4 11906)
const COLS = [3900, 1500, 1500, 2700];   // Paramètre | Résultat | Unité | Réf.
const COLS_FL = [3300, 1200, 900, 1800, 2400]; // + colonne valeur absolue

// ── En-tête laboratoire ───────────────────────────────────────────────
function enTete() {
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 },
      children: [txt('CENTRE DE PROMOTION MÉDICO-SANITAIRE (CPMI)', { bold: true, size: 26, color: BLEU })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 },
      children: [txt('Laboratoire d\'Analyses de Biologie Médicale', { size: 18, color: GRIS })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
      children: [txt('Tél : __ __ __ __ __   ·   BP ____   ·   Niamey', { size: 16, color: GRIS })] }),
    new Paragraph({ spacing: { after: 60 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BLEU } }, children: [] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 160 },
      children: [txt('COMPTE RENDU D\'ANALYSES MÉDICALES', { bold: true, size: 24, color: BLEU })] }),
  ];
}

// ── Bloc patient (tableau 2 colonnes sans bordures) ───────────────────
function ligneInfo(l1, v1, l2, v2) {
  const mk = (lab, val) => new Paragraph({ children: [
    txt(lab + ' : ', { bold: true, size: 19, color: BLEU }), txt(val, { size: 19 }) ] });
  const c = (child, w) => new TableCell({ width: { size: w, type: WidthType.DXA },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
    margins: { top: 20, bottom: 20 }, children: [child] });
  return new TableRow({ children: [ c(mk(l1, v1), 4800), c(mk(l2, v2), 4800) ] });
}
function blocPatient() {
  return new Table({
    width: { size: 9600, type: WidthType.DXA },
    columnWidths: [4800, 4800],
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
      insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [
      ligneInfo('Patient', patient.nom, 'N° Dossier', patient.dossier),
      ligneInfo('Âge / Sexe', patient.age + '  ·  ' + patient.sexe, 'Prélevé le', patient.preleve),
      ligneInfo('Prescripteur', patient.prescripteur, 'Édité le', patient.edite),
    ],
  });
}

// ── Titre de section ──────────────────────────────────────────────────
function titreSection(t) {
  return new Paragraph({ spacing: { before: 240, after: 100 },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: BLEUCL },
    children: [txt('  ' + t, { bold: true, size: 21, color: BLEU })] });
}

// ── Tableau NFS ───────────────────────────────────────────────────────
function enTeteTable(cols, labels) {
  return new TableRow({ tableHeader: true, children:
    labels.map((l, i) => pCell(l, { w: cols[i], bold: true, color: 'FFFFFF',
      fill: BLEU, align: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER })) });
}
function tableNFS() {
  const rows = [ enTeteTable(COLS, ['Paramètre', 'Résultat', 'Unité', 'Valeurs de référence']) ];
  hemato.forEach(([n, v, u, r, ano]) => {
    rows.push(new TableRow({ children: [
      pCell(n, { w: COLS[0] }),
      pCell(v, { w: COLS[1], align: AlignmentType.CENTER, bold: ano, color: ano ? ROUGE : NOIR }),
      pCell(u, { w: COLS[2], align: AlignmentType.CENTER, color: GRIS }),
      pCell(r, { w: COLS[3], align: AlignmentType.CENTER, color: GRIS }),
    ] }));
  });
  return new Table({ width: { size: 9600, type: WidthType.DXA }, columnWidths: COLS, rows });
}
function tableFL() {
  const rows = [ enTeteTable(COLS_FL, ['Formule leucocytaire', '%', ' ', 'Réf. (%)', 'Valeur absolue']) ];
  formule.forEach(([n, v, u, r, abs, ano]) => {
    rows.push(new TableRow({ children: [
      pCell(n, { w: COLS_FL[0] }),
      pCell(v, { w: COLS_FL[1], align: AlignmentType.CENTER, bold: ano, color: ano ? ROUGE : NOIR }),
      pCell(u, { w: COLS_FL[2], align: AlignmentType.CENTER, color: GRIS }),
      pCell(r, { w: COLS_FL[3], align: AlignmentType.CENTER, color: GRIS }),
      pCell(abs, { w: COLS_FL[4], align: AlignmentType.CENTER, color: GRIS }),
    ] }));
  });
  return new Table({ width: { size: 9600, type: WidthType.DXA }, columnWidths: COLS_FL, rows });
}

// ── Pied de page : signature ──────────────────────────────────────────
function pied() {
  return [
    new Paragraph({ spacing: { before: 200 }, children: [
      txt('Valeurs en gras / rouge : hors des valeurs de référence.', { it: true, size: 16, color: GRIS }) ] }),
    new Paragraph({ spacing: { before: 480 }, alignment: AlignmentType.RIGHT,
      children: [txt('Le Biologiste Médical', { bold: true, size: 19 })] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 40 },
      children: [txt('Signature et cachet', { it: true, size: 16, color: GRIS })] }),
  ];
}

// ── Assemblage ────────────────────────────────────────────────────────
const doc = new Document({
  styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
  sections: [{
    properties: { page: { margin: { top: 720, bottom: 720, left: 1000, right: 1000 } } },
    children: [
      ...enTete(),
      blocPatient(),
      titreSection('HÉMATOLOGIE — Numération Formule Sanguine (NFS)'),
      tableNFS(),
      new Paragraph({ spacing: { after: 60 }, children: [] }),
      tableFL(),
      ...pied(),
    ],
  }],
});

Packer.toBuffer(doc).then(b => { fs.writeFileSync('/root/repo/exemplaires/NFS.docx', b); console.log('NFS.docx écrit'); });
