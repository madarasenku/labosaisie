/* ═══════════════════════════════════════════════════════════════
   LaboSaisie Démo — enveloppes.js

   ✅ v13.259 — Enveloppes DL (11 × 22 cm) des dossiers cochés dans
   l'Historique : en-tête du Démo (« Résultats d'analyses — confidentiel »),
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

   ✅ v13.262 — Téléphone Android : la fenêtre d'impression ne propose souvent
   que « A4 » (pas de format enveloppe). Mode « Feuille A4 » : la page est une
   A4 debout et l'enveloppe y est dessinée à l'endroit exact où l'imprimante la
   reçoit — glissée par le petit côté, centrée dans le bac (bande de 110 mm au
   milieu de la largeur, sur les 220 premiers mm). Choisi d'office sur Android.
   Le code QR sortait blanc : l'impression partait avant que l'image du QR soit
   prête (même correctif que le compte rendu en v13.159).

   ✅ v13.263 — Nom du patient en grand, sur toute la largeur de l'enveloppe
   (le code QR passe en haut à droite) : taille calculée pour chaque nom, la
   plus grande qui tient sur une ligne (ou deux pour les noms longs).

   Chargé en script classique après impression.js (generateQRDataURL,
   qrTexteDossier, cpmiLogoSVG) — voir index.html.
   ═══════════════════════════════════════════════════════════════ */

const _ENV_REGLAGE_KEY = 'labosaisie_enveloppes_v1';
function _envReglage() {
  let r = {};
  try { r = JSON.parse(localStorage.getItem(_ENV_REGLAGE_KEY) || '{}') || {}; } catch (e) {}
  const parDefaut = /Android/i.test(navigator.userAgent || '') ? 'a4' : 'debout';
  return { sens: ['debout', 'couchee', 'a4'].includes(r.sens) ? r.sens : parDefaut, retourne: !!r.retourne };
}
function _envMemoriser(r) {
  try { localStorage.setItem(_ENV_REGLAGE_KEY, JSON.stringify({ sens: r.sens, retourne: !!r.retourne })); } catch (e) {}
}

// Taille du nom (pt) : la plus grande qui tient dans la largeur utile, sur une
// ligne si possible, sinon sur deux. Mesure au canevas avec la police imprimée.
const _ENV_NOM_MAX = 54, _ENV_NOM_MIN = 18;
let _envCanevas = null;
function _envTailleNom(nom) {
  const largeurUtile = 190 * 96 / 25.4;                 // 196 mm disponibles, moins une marge de sûreté
  if (!_envCanevas) _envCanevas = document.createElement('canvas').getContext('2d');
  const ctx = _envCanevas;
  const largeur = (t, pt) => { ctx.font = '800 ' + (pt * 96 / 72) + "px 'Segoe UI',Arial,sans-serif"; return ctx.measureText(t).width; };
  const mots = nom.split(/\s+/).filter(Boolean);
  const nbLignes = pt => {
    let n = 1, cur = '';
    for (const m of mots) {
      if (largeur(m, pt) > largeurUtile) return Infinity;            // un mot seul trop long
      const t = cur ? cur + ' ' + m : m;
      if (largeur(t, pt) <= largeurUtile) cur = t; else { n++; cur = m; }
    }
    return n;
  };
  let une = 0, deux = 0;
  for (let pt = _ENV_NOM_MAX; pt >= _ENV_NOM_MIN && !une; pt--) if (largeur(nom, pt) <= largeurUtile) une = pt;
  for (let pt = _ENV_NOM_MAX; pt >= _ENV_NOM_MIN && !deux; pt--) if (nbLignes(pt) <= 2) deux = pt;
  if (une && (une >= 34 || une >= 0.85 * deux)) return { pt: une, uneLigne: true };
  return { pt: deux || _ENV_NOM_MIN, uneLigne: false };
}

function _enveloppeHtml(r, qrPng) {
  const p = r.patient || {};
  const dossier = p.dossier || p.ancien_dossier || '—';
  const nom = String(p.nom || '—').toUpperCase().trim() || '—';
  const taille = _envTailleNom(nom);
  return '<div class="env">'
    + '<div class="env-tete">'
    +   '<div class="env-logo">' + (typeof cpmiLogoSVG === 'function' ? cpmiLogoSVG() : '') + '</div>'
    +   '<div><div class="env-cpmi">LABORATOIRE DÉMO</div>'
    +   '<div class="env-sous">Laboratoire d\'analyses médicales</div>'
    +   '<div class="env-conf">RÉSULTATS D\'ANALYSES — CONFIDENTIEL</div></div>'
    + '</div>'
    + '<div class="env-dest">'
    +   '<div class="env-lab">Patient</div>'
    +   '<div class="env-patient" style="font-size:' + taille.pt + 'pt' + (taille.uneLigne ? ';white-space:nowrap' : '') + '">' + esc(nom) + '</div>'
    +   '<div class="env-dossier">N° de dossier : <b>' + esc(dossier) + '</b></div>'
    + '</div>'
    + (qrPng ? '<div class="env-qr"><img src="' + qrPng + '" alt=""><div>Scannez pour vérifier le résultat</div></div>' : '')
    + '</div>';
}

// Page + placement de l'enveloppe (220 × 110) selon le sens choisi.
function _envMiseEnPage(reglage) {
  if (reglage.sens === 'a4') {
    // A4 debout (210 × 297) : enveloppe centrée sur la largeur (x 50 → 160 mm),
    // sur les 220 premiers mm ; même quart de tour que le mode debout.
    return {
      page: '@page{size:210mm 297mm;margin:0;}',
      cadre: '.env-page{position:relative;width:210mm;height:297mm;overflow:hidden;}',
      pivot: reglage.retourne ? 'transform:translateX(50mm) rotate(-90deg) translateX(-220mm);'
                              : 'transform:translateX(50mm) rotate(90deg) translateY(-110mm);',
    };
  }
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
    // Nom sur toute la largeur, centré dans la moitié basse ; QR en haut à droite.
    + '.env-dest{position:absolute;left:12mm;right:12mm;top:42mm;bottom:8mm;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;overflow:hidden;}'
    + '.env-lab{font-size:8.5pt;color:#555;text-transform:uppercase;letter-spacing:.8px;}'
    + '.env-patient{max-width:100%;font-weight:800;line-height:1.05;margin-top:1mm;overflow-wrap:anywhere;}'
    + '.env-dossier{font-size:16pt;margin-top:3mm;}'
    + '.env-qr{position:absolute;right:12mm;top:8mm;width:28mm;text-align:center;font-size:6.5pt;color:#333;}'
    + '.env-qr img{width:28mm;height:28mm;display:block;margin-bottom:1mm;image-rendering:pixelated;}'
    + '</style>'
    + pages;

  let printDiv = document.getElementById('print-render');
  if (!printDiv) { printDiv = document.createElement('div'); printDiv.id = 'print-render'; document.body.appendChild(printDiv); }
  printDiv.innerHTML = html;
  // Attendre que les QR (images data:) soient décodés, sinon ils sortent blancs.
  await Promise.all(Array.from(printDiv.querySelectorAll('img')).map(img => {
    if (img.complete && img.naturalWidth) return Promise.resolve();
    if (img.decode) return img.decode().catch(() => {});
    return new Promise(res => { img.onload = img.onerror = res; });
  }));
  await new Promise(res => setTimeout(res, 60));
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
    + '<div style="font-size:13px;font-weight:700;margin:4px 0 8px">Format de papier dans la fenêtre d\'impression</div>'
    + radio('a4', 'Feuille A4 — si seul « A4 » est proposé', 'Souvent le cas sur téléphone. Laissez « A4 » ; glissez l\'enveloppe par le petit côté, centrée entre les guides du bac.')
    + radio('debout', 'Enveloppe DL — entrée par le petit côté', 'Si la fenêtre propose « Enveloppe DL », « DL » ou « 110 × 220 mm » : choisissez-le.')
    + radio('couchee', 'Enveloppe DL couchée — entrée par le grand côté', 'Si l\'imprimante prend l\'enveloppe par sa longueur.')
    + '<label style="display:flex;gap:9px;align-items:center;margin:10px 2px;cursor:pointer;font-size:13px">'
    + '<input type="checkbox" id="env-retourne"' + (reg.retourne ? ' checked' : '') + '> Retourner le texte (si l\'essai sort à l\'envers)</label>'
    + '<div style="font-size:12px;color:var(--text-muted);background:var(--bg);border-radius:8px;padding:8px 10px;line-height:1.5">'
    + 'Sur téléphone, touchez <b>⌄</b> sous l\'imprimante pour voir « Taille du papier ». Sur ordinateur : marges <b>« Aucune »</b>, échelle <b>100 %</b>. '
    + 'Imprimez d\'abord une enveloppe d\'essai : le réglage est gardé sur cet appareil.</div>'
    + '<div class="modal-actions" style="margin-top:14px;flex-wrap:wrap">'
    + '<button class="btn" id="env-annuler" style="padding:8px 14px;font-size:13px">Annuler</button>'
    + '<button class="btn btn-outline" id="env-essai" style="padding:8px 14px;font-size:13px">🧪 1 enveloppe d\'essai</button>'
    + '<button class="btn btn-primary" id="env-tout" style="padding:8px 14px;font-size:13px">🖨 Imprimer les ' + ids.length + '</button>'
    + '</div></div>';
  document.body.appendChild(bd);
  const lire = () => ({
    sens: (bd.querySelector('input[name="env-sens"]:checked') || {}).value || 'debout',
    retourne: !!(bd.querySelector('#env-retourne') || {}).checked,
  });
  const lancer = async liste => { const r = lire(); _envMemoriser(r); bd.remove(); await imprimerEnveloppes(liste, trouver, r); };
  bd.querySelector('#env-annuler').addEventListener('click', () => bd.remove());
  bd.querySelector('#env-essai').addEventListener('click', () => lancer(ids.slice(0, 1)));
  bd.querySelector('#env-tout').addEventListener('click', () => lancer(ids));
  bd.addEventListener('click', e => { if (e.target === bd) bd.remove(); });
}
