/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — enveloppes.js

   ✅ v13.259 — Enveloppes DL (11 × 22 cm) des dossiers cochés dans
   l'Historique : en-tête du CPMI (« Résultats d'analyses — confidentiel »),
   nom du patient, n° de dossier et le MÊME code QR que le compte rendu
   (lien de vérification du résultat, ou à défaut les références du
   dossier). Une enveloppe par page, imprimée directement sur l'enveloppe.

   ✅ v13.260 — Sens d'impression. Les imprimantes définissent l'enveloppe DL
   DEBOUT (110 × 220 mm, entrée par le petit côté) : une page déclarée
   couchée (220 × 110) ne trouvait pas le bon papier. Par défaut la page est
   donc debout et l'enveloppe y est pivotée d'un quart de tour ; le texte
   peut être retourné (selon le côté du rabat à l'entrée), et la page
   couchée reste possible. Réglage gardé sur le poste ; une enveloppe
   d'essai permet de le trouver sans en gâcher.

   Chargé en script classique après impression.js (generateQRDataURL,
   qrTexteDossier, cpmiLogoSVG) — voir index.html.
   ═══════════════════════════════════════════════════════════════ */

const _ENV_REGLAGE_KEY = 'labosaisie_enveloppes_v1';
function _envReglage() {
  let r = {};
  try { r = JSON.parse(localStorage.getItem(_ENV_REGLAGE_KEY) || '{}') || {}; } catch (e) {}
  return { sens: r.sens === 'couchee' ? 'couchee' : 'debout', retourne: !!r.retourne };
}
function _envMemoriser(r) {
  try { localStorage.setItem(_ENV_REGLAGE_KEY, JSON.stringify({ sens: r.sens, retourne: !!r.retourne })); } catch (e) {}
}

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

// Page + placement de l'enveloppe (220 × 110) selon le sens choisi.
function _envMiseEnPage(reglage) {
  if (reglage.sens === 'couchee') {
    return {
      page: '@page{size:220mm 110mm;margin:0;}',
      cadre: '.env-page{position:relative;width:220mm;height:110mm;overflow:hidden;}',
      pivot: reglage.retourne ? 'transform:rotate(180deg) translate(-220mm,-110mm);' : '',
    };
  }
  return {
    page: '@page{size:110mm 220mm;margin:0;}',
    cadre: '.env-page{position:relative;width:110mm;height:220mm;overflow:hidden;}',
    // Quart de tour : haut du texte vers la droite de la page (ou la gauche si retourné).
    pivot: reglage.retourne ? 'transform:rotate(-90deg) translateX(-220mm);' : 'transform:rotate(90deg) translateY(-110mm);',
  };
}

/** Imprime une enveloppe par dossier (ids dans l'ordre voulu). */
async function imprimerEnveloppes(ids, trouver, reglage) {
  if (!ids || !ids.length) { toast('Aucun dossier sélectionné', 'err'); return; }
  const mep = _envMiseEnPage(reglage || _envReglage());
  showLoading('Préparation des enveloppes…');
  let pages = '', n = 0;
  try {
    for (const id of ids) {
      const r = trouver(id);
      if (!r) continue;
      let qr = '';
      try { qr = await generateQRDataURL(qrTexteDossier(r), 300); } catch (e) {}
      pages += '<div class="env-page">' + _enveloppeHtml(r, qr) + '</div>';
      n++;
    }
  } finally { hideLoading(); }
  if (!n) { toast('Aucun dossier à imprimer', 'err'); return; }

  const html =
    '<style>'
    + mep.page
    + '#print-render::after,#print-render::before,body::after,body::before{content:none!important;display:none!important;}'
    + "#print-render{font-family:'Segoe UI',Arial,sans-serif;color:#000;background:#fff;}"
    + mep.cadre
    + '.env-page:not(:last-child){page-break-after:always;break-after:page;}'
    + '.env{position:absolute;left:0;top:0;width:220mm;height:110mm;overflow:hidden;box-sizing:border-box;transform-origin:0 0;' + mep.pivot + '}'
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
  window.print();
}

/** Fenêtre de réglage avant impression (sens, retournement, enveloppe d'essai). */
function ouvrirEnveloppes(ids, trouver) {
  if (!ids || !ids.length) { toast('Aucun dossier sélectionné', 'err'); return; }
  const old = document.getElementById('env-modal-bd');
  if (old) old.remove();
  const reg = _envReglage();
  const radio = (v, titre, detail) => '<label style="display:flex;gap:9px;align-items:flex-start;padding:8px 10px;border:1px solid var(--border);border-radius:8px;cursor:pointer;margin-bottom:6px">'
    + '<input type="radio" name="env-sens" value="' + v + '"' + (reg.sens === v ? ' checked' : '') + ' style="margin-top:3px">'
    + '<span><b>' + titre + '</b><br><span style="font-size:12px;color:var(--text-muted)">' + detail + '</span></span></label>';
  const bd = document.createElement('div');
  bd.id = 'env-modal-bd';
  bd.className = 'modal-backdrop';
  bd.style.zIndex = '10000';          // au-dessus de la barre de sélection (z-index 9999)
  bd.innerHTML = '<div class="modal-box" style="max-width:440px">'
    + '<div class="modal-title">✉ Enveloppes DL (11 × 22 cm) — ' + ids.length + ' patient(s)</div>'
    + '<div style="font-size:13px;font-weight:700;margin:4px 0 8px">Sens de l\'enveloppe dans l\'imprimante</div>'
    + radio('debout', 'Debout — entrée par le petit côté', 'Le plus courant (format « Enveloppe DL » de l\'imprimante).')
    + radio('couchee', 'Couchée — entrée par le grand côté', 'Si l\'imprimante prend l\'enveloppe par sa longueur.')
    + '<label style="display:flex;gap:9px;align-items:center;margin:10px 2px;cursor:pointer;font-size:13px">'
    + '<input type="checkbox" id="env-retourne"' + (reg.retourne ? ' checked' : '') + '> Retourner le texte (si l\'essai sort à l\'envers)</label>'
    + '<div style="font-size:12px;color:var(--text-muted);background:var(--bg);border-radius:8px;padding:8px 10px;line-height:1.5">'
    + 'Dans la fenêtre d\'impression : papier <b>« Enveloppe DL »</b>, marges <b>« Aucune »</b>, échelle <b>100 %</b>. '
    + 'Imprimez d\'abord une enveloppe d\'essai : le réglage est gardé sur ce poste.</div>'
    + '<div class="modal-actions" style="margin-top:14px;flex-wrap:wrap">'
    + '<button class="btn" id="env-annuler" style="padding:8px 14px;font-size:13px">Annuler</button>'
    + '<button class="btn btn-outline" id="env-essai" style="padding:8px 14px;font-size:13px">🧪 1 enveloppe d\'essai</button>'
    + '<button class="btn btn-primary" id="env-tout" style="padding:8px 14px;font-size:13px">🖨 Imprimer les ' + ids.length + '</button>'
    + '</div></div>';
  document.body.appendChild(bd);
  const lire = () => ({
    sens: (bd.querySelector('input[name="env-sens"]:checked') || {}).value === 'couchee' ? 'couchee' : 'debout',
    retourne: !!(bd.querySelector('#env-retourne') || {}).checked,
  });
  const lancer = async liste => { const r = lire(); _envMemoriser(r); bd.remove(); await imprimerEnveloppes(liste, trouver, r); };
  bd.querySelector('#env-annuler').addEventListener('click', () => bd.remove());
  bd.querySelector('#env-essai').addEventListener('click', () => lancer(ids.slice(0, 1)));
  bd.querySelector('#env-tout').addEventListener('click', () => lancer(ids));
  bd.addEventListener('click', e => { if (e.target === bd) bd.remove(); });
}
