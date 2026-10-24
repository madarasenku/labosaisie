/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — enveloppes.js

   ✅ v13.259 — Enveloppes DL (11 × 22 cm) des dossiers cochés dans
   l'Historique : en-tête du CPMI (« Résultats d'analyses — confidentiel »),
   nom du patient, n° de dossier et le MÊME code QR que le compte rendu
   (lien de vérification du résultat, ou à défaut les références du
   dossier). Une enveloppe par page, imprimée directement sur l'enveloppe
   (format « Enveloppe DL » dans l'imprimante, orientation paysage).

   Chargé en script classique après impression.js (generateQRDataURL,
   qrTexteDossier, cpmiLogoSVG) — voir index.html.
   ═══════════════════════════════════════════════════════════════ */

function _enveloppeHtml(r, qrPng) {
  const p = r.patient || {};
  const dossier = p.dossier || p.ancien_dossier || '—';
  return '<div class="env">'
    + '<div class="env-tete">'
    +   '<div class="env-logo">' + (typeof cpmiLogoSVG === 'function' ? cpmiLogoSVG() : '') + '</div>'
    +   '<div><div class="env-cpmi">CPMI DE GRAND-BASSAM</div>'
    +   '<div class="env-sous">Centre de Protection Mère et Infantile · Laboratoire d\'analyses médicales</div>'
    +   '<div class="env-conf">RÉSULTATS D\'ANALYSES — CONFIDENTIEL</div></div>'
    + '</div>'
    + '<div class="env-dest">'
    +   '<div class="env-lab">Patient</div>'
    +   '<div class="env-patient">' + esc(String(p.nom || '—').toUpperCase()) + '</div>'
    +   '<div class="env-dossier">N° de dossier : <b>' + esc(dossier) + '</b></div>'
    + '</div>'
    + (qrPng ? '<div class="env-qr"><img src="' + qrPng + '" alt=""><div>Scannez pour vérifier le résultat</div></div>' : '')
    + '</div>';
}

/** Imprime une enveloppe par dossier (ids dans l'ordre voulu). */
async function imprimerEnveloppes(ids, trouver) {
  if (!ids || !ids.length) { toast('Aucun dossier sélectionné', 'err'); return; }
  showLoading('Préparation des enveloppes…');
  let pages = '', n = 0;
  try {
    for (const id of ids) {
      const r = trouver(id);
      if (!r) continue;
      let qr = '';
      try { qr = await generateQRDataURL(qrTexteDossier(r), 300); } catch (e) {}
      pages += _enveloppeHtml(r, qr);
      n++;
    }
  } finally { hideLoading(); }
  if (!n) { toast('Aucun dossier à imprimer', 'err'); return; }

  const html =
    '<style>'
    + '@page{size:220mm 110mm;margin:0;}'
    + '#print-render::after,#print-render::before,body::after,body::before{content:none!important;display:none!important;}'
    + "#print-render{font-family:'Segoe UI',Arial,sans-serif;color:#000;background:#fff;}"
    + '.env{position:relative;width:220mm;height:110mm;overflow:hidden;box-sizing:border-box;}'
    + '.env:not(:last-child){page-break-after:always;break-after:page;}'
    + '.env-tete{position:absolute;left:12mm;top:10mm;display:flex;align-items:center;gap:3mm;}'
    + '.env-logo svg{width:14mm;height:14mm;display:block;}'
    + '.env-cpmi{font-size:12pt;font-weight:800;letter-spacing:.3px;}'
    + '.env-sous{font-size:7pt;color:#333;margin-top:.5mm;}'
    + '.env-conf{font-size:7.5pt;font-weight:700;letter-spacing:.6px;margin-top:1mm;}'
    + '.env-dest{position:absolute;left:95mm;right:12mm;top:46mm;}'
    + '.env-lab{font-size:8pt;color:#555;text-transform:uppercase;letter-spacing:.6px;}'
    + '.env-patient{font-size:17pt;font-weight:800;line-height:1.2;margin-top:1mm;word-wrap:break-word;}'
    + '.env-dossier{font-size:12pt;margin-top:3mm;}'
    + '.env-qr{position:absolute;left:12mm;bottom:8mm;width:30mm;text-align:center;font-size:6.5pt;color:#333;}'
    + '.env-qr img{width:30mm;height:30mm;display:block;margin-bottom:1mm;image-rendering:pixelated;}'
    + '</style>'
    + pages;

  let printDiv = document.getElementById('print-render');
  if (!printDiv) { printDiv = document.createElement('div'); printDiv.id = 'print-render'; document.body.appendChild(printDiv); }
  printDiv.innerHTML = html;
  toast('✉ ' + n + ' enveloppe(s) — choisissez le format « Enveloppe DL », paysage, dans l\'imprimante', 'ok');
  window.print();
}
