/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — impression.js
   Extrait de index.html (v13.70). Chargé en script classique, PAS en
   module ES : les gestionnaires inline du HTML (onclick="…") résolvent
   les fonctions dans la portée globale. L'ordre des balises <script>
   dans index.html doit être conservé.
   ═══════════════════════════════════════════════════════════════ */

function getExamensManquants(type, resultats) {
  const TYPE_TO_TAB = {
    'Hématologie': 'hema', 'Biochimie': 'bio', 'Bactériologie': 'bacterio',
    'Immuno-Sérologie': 'sero', 'Parasitologie': 'parasito',
    'Groupe sanguin': 'gs', // BPN supprimé v13.21
  };
  const tabKey = TYPE_TO_TAB[type];
  if (!tabKey) return [];

  const tousExamens = getCatalogueComplet();
  const examensConcernés = tousExamens.filter(ex => {
    const chk = document.getElementById(ex.id);
    return chk && chk.checked && ex.tab === tabKey;
  });
  if (!examensConcernés.length) return [];

  // Un résultat est considéré "rempli" si au moins une valeur existe dans `resultats`
  // pour la section concernée. On vérifie via les sections marquées.
  const manquants = [];
  examensConcernés.forEach(ex => {
    if (!ex.section) return;
    const sectionEl = document.getElementById(ex.section);
    if (!sectionEl) return;
    const card = sectionEl.closest('.card') || sectionEl;
    // Vérifier si au moins un champ rempli existe dans cette carte
    const inputs = card.querySelectorAll('input[type=number], input[type=text], select, textarea');
    let rempli = false;
    inputs.forEach(inp => {
      if (inp.value && inp.value.trim() !== '' && inp.value !== '—') rempli = true;
    });
    if (!rempli) manquants.push(ex.label);
  });
  return [...new Set(manquants)];
}

// Affiche une confirmation si des examens payés ne sont pas remplis.
// Retourne true si on peut continuer (rien à signaler, ou utilisateur confirme).
function confirmerSiExamensManquants(type, resultats) {
  const manquants = getExamensManquants(type, resultats);
  if (!manquants.length) return true;
  const msg = '⚠ Les examens suivants ont été payés mais ne sont pas remplis :\n\n'
    + manquants.map(m => '  • ' + m).join('\n')
    + '\n\nVoulez-vous imprimer/exporter quand même ?';
  return confirm(msg);
}

async function printRecord(id) {
  let r = getDB().find(x => x.id === id);
  if (!r) { toast('Fiche introuvable', 'err'); return; }
  if (typeof sortieAutorisee === 'function' && !sortieAutorisee(id)) return;
  await ensureFull(r); // ✅ v13.5 — détail complet avant impression
  // Pour un dossier unifié : créer une fiche composite avec toutes les analyses
  if (isDossierRecord(r)) {
    const types = getRecordTypes(r);
    if (types.length === 0) { toast('Dossier vide', 'err'); return; }
    if (types.length === 1) {
      // Une seule analyse : utiliser le rendu standard avec les bons resultats
      r = { ...r, type: types[0], resultats: getRecordResultats(r, types[0]) };
    } else {
      // Plusieurs analyses : construire un faux record agrégé pour l'impression
      // buildAndPrint va appeler buildPrintSections pour chaque type
      const compositeResultats = { _types: types, _dossier: true };
      types.forEach(t => { compositeResultats[t] = getRecordResultats(r, t); });
      buildAndPrint({ ...r, type: 'Dossier', resultats: compositeResultats });
      return;
    }
  }
  // Vérification simple : si la fiche a un montant > 0 mais aucun résultat exploitable
  const hasAnyValue = Object.values(r.resultats || {}).some(v => {
    if (!v) return false;
    if (typeof v === 'object') return !!(v.valeur || v.resultat || v.titre);
    return typeof v === 'string' && v.trim() !== '';
  });
  if (r.montant > 0 && !hasAnyValue) {
    const ok = confirm('⚠ Cette fiche a été facturée (' + r.montant.toLocaleString('fr-FR') + ' FCFA) mais ne contient aucun résultat rempli.\n\nVoulez-vous imprimer quand même ?');
    if (!ok) return;
  }
  buildAndPrint(r);
}

function printCurrentForm(type) {
  const p = getPatient();
  if (!validatePatient(p)) return;
  const resultats = collectResults(type);
  if (!confirmerSiExamensManquants(type, resultats)) return;
  buildAndPrint({ type, patient: p, resultats, montant: parseInt(document.getElementById('montant-preview')?.dataset?.montant||'0'), savedAt: new Date().toISOString() });
}

// Échappe les caractères HTML spéciaux pour éviter toute injection XSS
function escHTML(s) {
  return (s || '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}



// ============================================================
// ✅ v13.35 — RÉFÉRENCE UNIQUE DOCUMENT
// Format : CPM-XXXX-YYYY (4 chars alphanumériques + année)
// Générée une fois par dossier, stockée dans patient.ref_doc
// ============================================================
function generateRefUnique() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I pour lisibilité
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return 'CPM-' + code + '-' + new Date().getFullYear();
}

function getOrCreateRef(record) {
  // Réutiliser la ref existante si déjà générée
  if (record?.patient?.ref_doc) return record.patient.ref_doc;
  const ref = generateRefUnique();
  // Stocker dans le record en mémoire (persisté au prochain save)
  if (record?.patient) record.patient.ref_doc = ref;
  return ref;
}

// ✅ v13.35 — Signature cursive SVG à partir du nom
// Génère un paraphe stylisé illisible mais unique par nom
function generateSignatureSVG(name, width=160, height=45) {
  if (!name || name === '—') return '';
  // Seed déterministe depuis le nom
  let seed = 0;
  for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) & 0xffffffff;
  const rng = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };

  const cx = width / 2, cy = height / 2;
  const paths = [];

  // Trait principal — ondulation centrale
  const pts = [];
  const steps = 10 + Math.floor(rng() * 6);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = 12 + t * (width - 24);
    const amp = 8 + rng() * 10;
    const freq = 1.5 + rng() * 1.5;
    const y = cy + Math.sin(t * Math.PI * freq + rng() * 2) * amp * (1 - Math.abs(t - 0.5) * 0.8);
    pts.push([x, y]);
  }
  // Convertir en courbe de Bézier
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i-1], cur = pts[i];
    const cpx = (prev[0] + cur[0]) / 2;
    d += ` Q ${cpx.toFixed(1)} ${prev[1].toFixed(1)} ${cur[0].toFixed(1)} ${cur[1].toFixed(1)}`;
  }
  paths.push(`<path d="${d}" fill="none" stroke="#1e3a8a" stroke-width="${1.2 + rng() * 0.8}" stroke-linecap="round"/>`);

  // Boucle montante (début de prénom)
  const loopX = 12 + rng() * 20;
  const loopH = 15 + rng() * 12;
  paths.push(`<path d="M ${loopX} ${cy+5} C ${loopX-4} ${cy-loopH} ${loopX+10} ${cy-loopH+4} ${loopX+6} ${cy+2}" fill="none" stroke="#1e3a8a" stroke-width="1.1" stroke-linecap="round"/>`);

  // Trait de soulignement partiel
  const ulStart = 8 + rng() * 10;
  const ulEnd = width - 8 - rng() * 15;
  const ulY = cy + 14 + rng() * 6;
  paths.push(`<path d="M ${ulStart} ${ulY} Q ${(ulStart+ulEnd)/2} ${ulY + (rng()-0.5)*4} ${ulEnd} ${ulY - rng()*3}" fill="none" stroke="#1e3a8a" stroke-width="0.8" stroke-linecap="round"/>`);

  // Point final (paraphe)
  const dotX = ulEnd + 3 + rng() * 5;
  paths.push(`<circle cx="${dotX}" cy="${ulY - 1}" r="${0.8 + rng() * 0.6}" fill="#1e3a8a"/>`);

  // Initiales lisibles en petite taille (optionnel — donne l'ancrage)
  const initials = name.split(/[\s._-]+/).map(w => w[0]||'').join('').substring(0,2).toUpperCase();
  paths.push(`<text x="10" y="${cy+3}" font-family="Georgia,serif" font-style="italic" font-size="9" fill="#1e3a8a" opacity="0.35">${initials}</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${paths.join('')}</svg>`;
}
// ============================================================
// QR CODE — Génération asynchrone (générateur intégré, hors-ligne)
// ============================================================
// ✅ v13.71 — Le repli vers QRCode.js a été supprimé. Il datait de l'époque
//   où le générateur venait d'un CDN et pouvait manquer à l'appel. Depuis
//   v13.69 tout est same-origin : `qrcode` (js/qr-generator.js) est toujours
//   chargé, le repli n'était donc jamais atteint. Deux implémentations QR
//   pour le même besoin, c'était 19 Ko inutiles dans le cache de chaque
//   poste et une ambiguïté de plus à la lecture.
//   Rendu en PNG via canvas : l'Excel et le PDF exigent du PNG.

function generateQRDataURL(text, size = 120) {
  return new Promise((resolve) => {
    const txt = String(text ?? '').substring(0, 900);
    if (!txt) { resolve(''); return; }

    if (typeof qrcode === 'undefined') {
      console.error('[QR] générateur indisponible — js/qr-generator.js non chargé ?');
      resolve(''); return;
    }

    {
      try {
        const qr = qrcode(0, 'M');   // type 0 = détection auto de la taille
        qr.addData(txt);
        qr.make();
        const count = qr.getModuleCount();
        const margin = 4;                     // zone de silence (modules)
        const total = count + margin * 2;
        const cell = Math.max(2, Math.floor(size / total));
        const px = cell * total;
        const canvas = document.createElement('canvas');
        canvas.width = px; canvas.height = px;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, px, px);
        ctx.fillStyle = '#1e3a8a';
        for (let r = 0; r < count; r++) {
          for (let c = 0; c < count; c++) {
            if (qr.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
          }
        }
        resolve(canvas.toDataURL('image/png')); // PNG, compatible Excel/PDF
        return;
      } catch (e) {
        console.error('[QR] échec de génération :', e);
        resolve('');
      }
    }
  });
}

// ✅ v13.37 — Convertit un SVG (chaîne) en PNG dataURL via canvas
function _svgToPngDataURL(svgStr, w = 300, h = 84) {
  return new Promise(resolve => {
    if (!svgStr) { resolve(''); return; }
    try {
      const blob = new Blob([svgStr], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(cv.toDataURL('image/png'));
        } catch (e) { resolve(''); }
      };
      img.onerror = () => { try { URL.revokeObjectURL(url); } catch (e) {} resolve(''); };
      img.src = url;
    } catch (e) { resolve(''); }
  });
}

// ✅ v13.37 — Ajoute le QR + la signature (images) aux feuilles Excel qui l'ont
// demandé (via ws._qrSig, posé par buildProfessionalSheet). Appelé juste avant
// le téléchargement du classeur. Silencieux si la génération échoue.
async function addQrAndSignatures(wb) {
  if (!wb || !wb.worksheets) return;
  for (const ws of wb.worksheets) {
    const a = ws._qrSig;
    if (!a) continue;
    try {
      if (a.techName) {
        const sigPng = await _svgToPngDataURL(generateSignatureSVG(a.techName, 220, 60), 300, 82);
        if (sigPng) {
          const id = wb.addImage({ base64: sigPng.split(',')[1] || sigPng, extension: 'png' });
          // Hauteur ~28px → couvre les 2 premières lignes ; le nom/titre reste lisible en dessous.
          ws.addImage(id, { tl: { col: 3, row: a.sigRow - 1 }, ext: { width: 148, height: 28 } });
        }
      }
      // ✅ v13.56 — QR agrandi et net (généré en 2× la taille d'affichage)
      const qrPng = await generateQRDataURL(a.qrContent, 260);
      if (qrPng) {
        const id = wb.addImage({ base64: qrPng.split(',')[1] || qrPng, extension: 'png' });
        ws.addImage(id, { tl: { col: Math.max(0, a.NC - 1), row: a.sigRow - 1 }, ext: { width: 120, height: 120 } });
      }
    } catch (e) { /* QR/signature optionnels — ne bloque pas l'export */ }
  }
}

async function buildAndPrint(r) {
  // Construire le HTML de rendu d'impression
  const p = r.patient;
  const res = r.resultats || {};
  const now = new Date();

  let html = `
    <style>
      .print-empty-row td { background: #fafafa !important; }
      .print-empty-row td:nth-child(2) { border-bottom: 1px dotted #9ca3af !important; min-width: 80px; }
      @media print {
        .print-val-hi { color: #b91c1c !important; font-weight: 700 !important; }
        .print-val-lo { color: #1d4ed8 !important; font-weight: 700 !important; }
        .print-val-hi::after { content: " ▲"; font-size: 9pt; }
        .print-val-lo::after { content: " ▼"; font-size: 9pt; }
      }
      .print-val-hi { color: #b91c1c; font-weight: 700; }
      .print-val-lo { color: #1d4ed8; font-weight: 700; }
      .print-val-hi::after { content: " ▲"; font-size: 9pt; }
      .print-val-lo::after { content: " ▼"; font-size: 9pt; }
    </style>
    <div class="print-header">
      <div class="print-header-bar"></div>
      <div class="print-header-content">
        <div class="print-logo">
          <svg viewBox="0 0 64 64" width="34" height="34" xmlns="http://www.w3.org/2000/svg">
            <circle cx="32" cy="32" r="31" fill="#1e3a8a"/>
            <path d="M32 16c-5.5 0-10 4.2-10 10.5 0 4.8 2.9 9 7 11.3v3.4c-4.5 1-8 3.6-9.4 7h25c-1.4-3.5-5-6-9.6-7v-3.4c4.1-2.3 7-6.5 7-11.3C42 20.2 37.5 16 32 16z" fill="#fff"/>
            <circle cx="32" cy="14" r="3.4" fill="#fff"/>
            <path d="M27 12.5c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>
            <rect x="46" y="40" width="3.2" height="11" rx="1.2" fill="#00b4d8"/>
            <rect x="41.4" y="44.4" width="11" height="3.2" rx="1.2" fill="#00b4d8"/>
          </svg>
        </div>
        <div>
          <div class="print-center-name">CPMI DE GRAND-BASSAM</div>
          <div class="print-center-sub">Centre de Protection Mère et Infantile · Laboratoire d'analyses médicales</div>
          <div class="print-center-addr">Grand-Bassam, Côte d'Ivoire · Tél : — · Email : —</div>
        </div>
        <div class="print-type-badge">${getDisplayType(r).toUpperCase()}</div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;margin-left:8px">__QR_PLACEHOLDER__</div>
      </div>
      <div class="print-header-bar bottom"></div>
    </div>

    <div class="print-patient-card">
      <table class="print-patient-table">
        <tr>
          <td><b>N° Dossier</b><br><span class="print-dossier">${escHTML(p.dossier)||'—'}</span></td>
          <td><b>Patient</b><br><strong style="text-transform:uppercase;font-size:14px;letter-spacing:.3px">${escHTML(p.nom)||'—'}</strong></td>
          <td><b>Âge / Sexe</b><br>${escHTML(p.age)||'—'} ans / ${p.sexe==='M'?'Masculin':p.sexe==='F'?'Féminin':'—'}</td>
          <td><b>Date prélèvement</b><br>${p.date ? new Date(p.date).toLocaleDateString('fr-FR') : '—'}</td>
        </tr>
        <tr>
          <td><b>Prescripteur</b><br>${escHTML(p.medecin)||'—'}</td>
          <td><b>Service</b><br>${escHTML(p.service)||'—'}</td>
          <td colspan="2"><b>Renseignements cliniques</b><br>${escHTML(p.clinique)||'—'}</td>
        </tr>
      </table>
    </div>`;

  // ── ✅ v13.35 — Double QR + UUID + technicien ───────────────
  const shareToken = p?.share_token;
  const refDoc     = getOrCreateRef(r);
  const techName   = (typeof _currentUser !== 'undefined' && _currentUser?.username) || '—';

  // QR 1 : vérification en ligne (share_token) ou infos dossier
  const qrContent1 = shareToken
    ? `${APP_PUBLIC_URL}?share=${shareToken}`
    : `CPMI Grand-Bassam | Ref: ${refDoc} | Dossier: ${p?.dossier||'—'} | Patient: ${(p?.nom||'').toUpperCase()} | Date: ${p?.date ? new Date(p.date).toLocaleDateString('fr-FR') : '—'}`;
  // QR 2 : infos patient compactes (toujours disponible offline)
  const qrContent2 = `CPMI GRAND-BASSAM\nREF: ${refDoc}\nDOSSIER: ${p?.dossier||'—'}\nPATIENT: ${(p?.nom||'').toUpperCase()}\nANALYSE: ${getDisplayType(r)}\nDATE: ${p?.date ? new Date(p.date).toLocaleDateString('fr-FR') : '—'}\nTECH: ${techName}`;

  const [qrUrl1, qrUrl2] = await Promise.all([
    generateQRDataURL(qrContent1, 90),
    generateQRDataURL(qrContent2, 90),
  ]);

  // ✅ v13.54 — QR agrandi (×2) dans l'angle SUPÉRIEUR GAUCHE du compte rendu
  // QR compacts (70px) intégrés dans l'en-tête — v13.95
  const qrSmall = qrUrl1
    ? `<img src="${qrUrl1}" width="70" height="70" style="display:block;border:1.5px solid #1e3a8a;border-radius:5px">
       <div style="font-size:8px;color:#1e3a8a;font-weight:600;text-align:center">${shareToken ? 'Vérifier en ligne' : 'Dossier'}</div>`
    : (qrUrl2
      ? `<img src="${qrUrl2}" width="70" height="70" style="display:block;border:1px solid #9ca3af;border-radius:5px">`
      : '');
  html = html.replace('__QR_PLACEHOLDER__', qrSmall);

  // ── Sections selon le type ──────────────────────────────────
  html += buildPrintSections(r.type, res, r.patient);

  // ✅ v13.35 — Cases vides pour examens cochés sans résultats
  if (isDossierRecord(r)) {
    (res._types || []).forEach(t => {
      const coches = res._examens_coches?.[t] || [];
      const typeRes = res[t] || {};
      const emptyHtml = buildEmptyRows(t, typeRes, coches);
      if (emptyHtml) {
        html += `<div class="print-composite-section" style="margin-top:12px">
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#6b7280;border-bottom:1.5px solid #d1d5db;padding-bottom:3px;margin-bottom:6px">${t} — à compléter</div>
          ${emptyHtml}
        </div>`;
      }
    });
  } else {
    const coches = res._examens_coches || [];
    html += buildEmptyRows(r.type, res, Array.isArray(coches) ? coches : Object.values(coches).flat());
  }

  // ✅ v12.4 — Composition BPN (forfait fixe)
  if (Array.isArray(res['_bpn_inclus']) && res['_bpn_inclus'].length) {
    html += `<div class="print-section">
      <div class="print-section-title">Composition du bilan prénatal — forfait ${(r.montant||20000).toLocaleString('fr-FR')} FCFA</div>
      <table class="print-table"><tbody>
      ${res['_bpn_inclus'].map(l => `<tr><td style="width:26px;text-align:center;color:#15803d">☑</td><td>${escHTML(l)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  // ✅ v12.4 — Examens demandés non renseignés → lignes vides à compléter
  const printPending = getPendingCheckedExams(r, r.type);
  if (printPending.length) {
    html += `<div class="print-section">
      <div class="print-section-title">Examens demandés — résultats à compléter</div>`;
    printPending.forEach(ex => {
      html += `<table class="print-table" style="margin-bottom:8px">
        <thead><tr><th>${escHTML(ex.label)}</th><th>Résultat</th><th>Unité</th><th>Valeurs normales</th></tr></thead>
        <tbody>
        ${ex.rows.map(pr => `<tr><td>${escHTML(pr.name)}</td><td style="min-width:70px">&nbsp;</td><td>${escHTML(pr.unit)}</td><td style="color:#64748b">${escHTML(pr.ref)}</td></tr>`).join('')}
        </tbody></table>`;
    });
    html += `</div>`;
  }

  // ── Pied de page ────────────────────────────────────────────
  html += `
    <div class="print-footer">
      <div class="print-footer-bar"></div>
      <div class="print-footer-content">
        <div class="print-sig-box" style="flex:2">
          <div class="print-sig-label">Commentaire du technicien</div>
          <div class="print-sig-zone" style="height:22mm;padding:4px 8px;line-height:1.8">
            <div style="border-bottom:1px solid #c7d9f9;margin-bottom:4px"></div>
            <div style="border-bottom:1px solid #c7d9f9;margin-bottom:4px"></div>
            <div style="border-bottom:1px solid #c7d9f9"></div>
          </div>
        </div>
        <div class="print-sig-box" style="flex:1">
          <div class="print-sig-label">Signature du technicien</div>
          <div class="print-sig-zone" style="height:18mm;padding:2px 4px;display:flex;flex-direction:column;justify-content:center">
            ${(typeof _maSignature !== 'undefined' && _maSignature)
              ? `<img src="${_maSignature}" style="height:38px;max-width:150px;object-fit:contain;margin:0 auto">`
              : generateSignatureSVG(techName, 150, 38)}
            <div style="font-size:7pt;color:#1e3a8a;font-weight:600;margin-top:2px;letter-spacing:.3px">${techName}</div>
            <div style="font-size:6.5pt;color:#9ca3af">Technicien de laboratoire · CPMI Grand-Bassam</div>
          </div>
        </div>
        <div class="print-meta">
          Édité le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}<br>
          CPMI de Grand-Bassam<br>
          <span style="font-size:6.5pt;font-weight:700;color:#1e3a8a">Réf. ${refDoc || record?.patient?.ref_doc || '—'}</span>
        </div>
      </div>
      <div class="print-confidential">
        Document officiel du laboratoire CPMI Grand-Bassam · Réf. ${refDoc || record?.patient?.ref_doc || '—'}
        · Résultats à interpréter en contexte clinique par un professionnel de santé.
        · Document confidentiel — usage médical exclusif. Toute reproduction non autorisée est interdite.
      </div>
    </div>`;

  // Injecter et imprimer
  let printDiv = document.getElementById('print-render');
  if (!printDiv) {
    printDiv = document.createElement('div');
    printDiv.id = 'print-render';
    document.body.appendChild(printDiv);
  }
  printDiv.innerHTML = html;
  window.print();
}


// ✅ v13.35 — Construire les lignes vides pour les examens cochés sans résultats
function buildEmptyRows(type, res, cochesList) {
  // ✅ v13.35 fix — robustesse : accepter tableau ou objet {type:[...]}
  if (cochesList && !Array.isArray(cochesList)) cochesList = Object.values(cochesList).flat();
  if (!cochesList || !cochesList.length) return '';
  // Paramètres connus pour ce type avec leurs unités et valeurs normales
  const PARAMS_META = {};
  if (typeof HEMA_PARAMS !== 'undefined') HEMA_PARAMS.forEach(p => { PARAMS_META[p.name] = {unit: getUnit(p.id, p.unit), ref: p.ref||''}; });
  if (typeof HEMA_FL !== 'undefined')     HEMA_FL.forEach(p => { PARAMS_META[p.name] = {unit: getUnit(p.id, p.unit), ref: p.ref||''}; });
  if (typeof BIO_GLUCIDES !== 'undefined') [...(BIO_GLUCIDES||[]),...(BIO_REIN||[]),...(BIO_FOIE||[]),...(BIO_LIPIDES||[]),...(BIO_IONO||[]),...(BIO_FER||[]),...(BIO_HORM||[]),...(BIO_AUTRE||[])].forEach(p => { if(p) PARAMS_META[p.name] = {unit:getUnit(p.id, p.unit), ref:p.ref||''}; });

  // Filtrer les examens cochés qui n'ont pas de résultat saisi
  const paramsTypes = {
    'Hématologie': [...(typeof HEMA_PARAMS!=='undefined'?HEMA_PARAMS:[]), ...(typeof HEMA_FL!=='undefined'?HEMA_FL:[])],
    'Biochimie':   [...(typeof BIO_GLUCIDES!=='undefined'?BIO_GLUCIDES:[]),...(typeof BIO_REIN!=='undefined'?BIO_REIN:[]),...(typeof BIO_FOIE!=='undefined'?BIO_FOIE:[]),...(typeof BIO_LIPIDES!=='undefined'?BIO_LIPIDES:[]),...(typeof BIO_IONO!=='undefined'?BIO_IONO:[])],
  };
  const knownParams = (paramsTypes[type]||[]).map(p=>p.name);

  // Examens cochés sans valeur
  const empty = cochesList.filter(label => {
    // Vérifier si ce label correspond à un paramètre connu sans résultat
    const hasResult = Object.keys(res).some(k => {
      if (k.startsWith('_')) return false;
      if (k === label) return res[k] && (res[k].valeur || res[k].resultat);
      return false;
    });
    return !hasResult;
  });

  if (!empty.length) return '';

  const rows = empty.map(label => {
    const meta = PARAMS_META[label] || {};
    return `<tr class="print-empty-row">
      <td>${label}</td>
      <td style="min-width:60px;border-bottom:1px dotted #9ca3af">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
      <td style="color:#9ca3af;font-size:9pt">${meta.unit||''}</td>
      <td style="color:#9ca3af;font-size:9pt">${meta.ref||''}</td>
    </tr>`;
  }).join('');

  return `<div class="print-section">
    <div class="print-section-title" style="color:#6b7280;border-color:#d1d5db">📋 Résultats à compléter manuellement</div>
    <table class="print-table" style="opacity:.85">
      <thead><tr><th>Examen</th><th>Résultat</th><th>Unité</th><th>Valeurs normales</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:7.5pt;color:#9ca3af;font-style:italic;margin-top:4px">
      Ces examens ont été demandés — résultats à saisir manuellement après analyse.
    </p>
  </div>`;
}
/* Applique une classe de couleur à une valeur selon son interprétation — v13.95 */
function colorVal(valeur, interp) {
  if (!valeur) return '';
  if (interp === 'Élevé') return `<span class="print-val-hi">${escHTML(String(valeur))}</span>`;
  if (interp === 'Bas')   return `<span class="print-val-lo">${escHTML(String(valeur))}</span>`;
  return escHTML(String(valeur));
}

function buildPrintSections(type, res, pat) {
  const profile = profileFromPatient(pat || {}); // ✅ v13.17 — valeurs normales
  let html = '';

  // Dossier composite (impression multi-analyses) : itérer sur chaque type
  if (type === 'Dossier' && res?._dossier && res._types) {
    res._types.forEach(t => {
      const typeRes = res[t] || {};
      html += `<div class="print-composite-section" style="margin-top:20px"><div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--cpmi-deep);border-bottom:2px solid var(--cpmi-deep);padding-bottom:4px;margin-bottom:8px">${t}</div>`;
      html += buildPrintSections(t, typeRes, r.patient);
      html += '</div>';
    });
    return html;
  }

  const section = (title, content) => {
    if (!content) return '';
    return `<div class="print-section"><div class="print-section-title">${title}</div>${content}</div>`;
  };

  const table = (headers, rows) => {
    if (!rows.length) return '';
    return `<table class="print-table">
      <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r=>`<tr>${r.map((c,i)=>{
        const cls = c&&c.includes&&(c.includes('Élevé')||c.includes('⚠'))?'print-hi':c&&c.includes&&(c.includes('Bas'))?'print-lo':c&&c.includes&&(c.includes('Normal')||c.includes('✓'))?'print-ok':'';
        return `<td class="${cls}">${c||''}</td>`;
      }).join('')}</tr>`).join('')}</tbody>
    </table>`;
  };

  const row = (label, val, unit='', comment='') =>
    val ? `<tr><td>${label}</td><td><b>${val}</b></td><td>${unit}</td><td>${comment}</td></tr>` : '';

  if (type === 'Hématologie') {
    // NFS + FL
    const nfsRows = [];
    [...HEMA_PARAMS, ...HEMA_FL].forEach(p => {
      const v = res[p.name];
      if (!v || !v.valeur) return;
      nfsRows.push([p.name, colorVal(v.valeur, v.interp), v.unite||'/µL', refDisplayFor(p, profile) || '—']); // v13.95 — couleur anomalie
    });
    if (nfsRows.length) html += section('🩸 NFS — Numération Formule Sanguine', table(['Paramètre','Valeur','Unité','Valeurs normales'], nfsRows));

    // Électrophorèse Hb
    const ephbRows = [];
    ['Hb A','Hb A2','Hb F','Hb S','Hb C','Hb D','Hb E'].forEach(n => {
      const v = res[n]; if (v&&v.valeur) ephbRows.push([n, v.valeur+'%', '', v.interp||'']);
    });
    const profil = res['Profil Hb'];
    const commentHb = res['Commentaire Hb'];
    if (ephbRows.length || profil) {
      let c = table(['Fraction','%','','Commentaire'], ephbRows);
      if (profil) c += `<p class="print-note"><b>Profil :</b> ${profil}</p>`;
      if (commentHb) c += `<p class="print-note print-italic">${commentHb}</p>`;
      html += section('🔬 Électrophorèse de l\'Hémoglobine', c);
    }

    // GE / Parasitologie
    const ge = { res:res['GE - Résultat'], espece:res['GE - Espèce'], para:res['GE - Parasitémie (%)'], densite:res['GE - Densité parasitaire (/µL)'], stade:res['GE - Stade'], tdr:res['GE - TDR'], obs:res['GE - Observation'] };
    if (ge.res || ge.tdr || ge.espece) {
      const geRows = [];
      if (ge.res)    geRows.push(['Résultat GE', ge.res, '', '']);
      if (ge.tdr)    geRows.push(['TDR Paludisme', ge.tdr, '', '']);
      if (ge.espece) geRows.push(['Espèce plasmodiale', ge.espece, '', '']);
      if (ge.para)   geRows.push(['Parasitémie', ge.para, '%', '']);
      if (ge.densite) geRows.push(['Densité parasitaire', ge.densite, '/µL', '']);
      if (ge.stade)  geRows.push(['Stade', ge.stade, '', '']);
      if (ge.obs)    geRows.push(['Observation', ge.obs, '', '']);
      html += section('🦟 Goutte Épaisse / Parasitologie', table(['Paramètre','Résultat','Unité','Observation'], geRows));
    }

  }

  else if (type === 'Immuno-Sérologie') {
    // ✅ v13.24 — Sérologie : tests séro + GS/Rh + CRP + SWF sur la même page
    // Tests sérologiques
    if (typeof SERO_TESTS !== 'undefined') {
      const seroRows = [];
      SERO_TESTS.forEach(t => {
        const v = res[t.name]; if (!v) return;
        const val = v.resultat || v.valeur || ''; if (!val) return;
        const numVal = v.valeur && v.valeur !== val ? v.valeur : '';
        seroRows.push([t.name, val, numVal, v.obs||'']);
      });
      if (seroRows.length) html += section('💉 Immuno-Sérologie',
        table(['Test','Résultat','Valeur numérique','Commentaire'], seroRows));
      if (res['sero_obs'] || res['Observations']) {
        const obs = res['sero_obs'] || res['Observations'];
        html += `<p class="print-note">${escHTML(obs)}</p>`;
      }
    }
    // Groupe sanguin (si renseigné)
    const gsAboS = res['Groupe ABO'] || res['GS - ABO'] || '';
    const gsRhS  = res['Rhésus']     || res['GS - Rhésus'] || '';
    const gsObsS = res['Commentaire GS'] || '';
    if (gsAboS || gsRhS) {
      const gsRows = [];
      if (gsAboS) gsRows.push(['Groupe ABO', gsAboS, '', '']);
      if (gsRhS)  gsRows.push(['Rhésus',     gsRhS,  '', '']);
      let gsHtml = table(['Paramètre','Résultat','',''], gsRows);
      if (gsObsS) gsHtml += `<p class="print-note">${escHTML(gsObsS)}</p>`;
      html += section('🩸 Groupe Sanguin ABO / Rhésus', gsHtml);
    }
    // CRP
    const crpValS = res['CRP - Valeur'];
    if (crpValS) {
      const crpLabel = crpValS === 'neg' ? 'Négatif (< 6 mg/L)' : crpValS + ' mg/L';
      const crpCls   = crpValS === 'neg' ? 'print-ok' : 'print-hi';
      html += section('🔥 CRP — Protéine C-réactive (Latex)', `
        <table class="print-table"><thead><tr><th>Test</th><th>Résultat</th><th>Valeurs normales</th></tr></thead>
        <tbody><tr><td>CRP Latex</td><td class="${crpCls}"><b>${crpLabel}</b></td><td>&lt; 6 mg/L</td></tr></tbody></table>`);
    }
    // SWF
    const _widS = widalReport(res);
    if (_widS.show) {
      const widalRowsS = _widS.rows.map(w => [w.name, w.titre, w.cinetique||'—', w.interp||'—']);
      let wHtml = widalRowsS.length ? table(['Antigène','Titre','Cinétique','Commentaire'], widalRowsS) : '';
      if (_widS.concl) {
        const cls = _widS.concl.includes('ÉTAT') ? 'print-hi' : _widS.concl.includes('DÉBUT') ? 'print-warn' : 'print-note';
        wHtml += `<p class="print-conclusion ${cls}">${escHTML(_widS.concl.replace(/^[🔴🟠🟡⚪]\s*/,''))}</p>`;
      }
      html += section('🦠 Sérodiagnostic de Widal & Félix', wHtml);
    }
  }

  else {
    // Rendu générique pour tous les autres types
    // Map nom de paramètre → id (pour getUnit)
    const _paramIdMap = {};
    const _paramObjMap = {}; // ✅ v13.17 — étendu à tous les catalogues (v13.19)
    const _allCatalogues = [
      ...(typeof BIO_GLUCIDES!=='undefined'?[...BIO_GLUCIDES,...BIO_REIN,...BIO_FOIE,...BIO_LIPIDES,...BIO_IONO,...BIO_FER,...BIO_CARD,...BIO_HORM,...BIO_COAG,...BIO_AUTRE]:[]),
      ...(typeof BPN_NFS!=='undefined'?[...BPN_NFS]:[]),
      ...(typeof BPN_FL!=='undefined'?[...BPN_FL]:[]),
      ...(typeof HEMA_PARAMS!=='undefined'?[...HEMA_PARAMS]:[]),
      ...(typeof HEMA_FL!=='undefined'?[...HEMA_FL]:[]),
      ...(typeof SERO_TESTS!=='undefined'?SERO_TESTS:[]),
      ...(typeof getCatalogueComplet==='function'?getCatalogueComplet():[]),
    ];
    _allCatalogues.forEach(p => {
      if (p && p.name) { _paramIdMap[p.name] = p.id; _paramObjMap[p.name] = p; }
    });

    const rows = [];
    Object.entries(res).forEach(([k,v]) => {
      if (!v || k.startsWith('_')) return; // ✅ v12 — ignorer clés techniques
      if (typeof v === 'object') {
        const val = v.valeur || v.resultat || '';
        const pid = _paramIdMap[k];
        if (val) rows.push([k, val, pid ? getUnit(pid, v.unite||'') : (v.unite||''), refDisplayFor(_paramObjMap[k], profile) || '', v.interp||v.obs||'']);
      } else if (typeof v === 'string' && v && v !== '—' && !k.startsWith('ABG_') && !k.startsWith('AFG_')) {
        rows.push([k, v, '', '', '']);
      }
    });
    if (rows.length) html += section('📋 Résultats', table(['Paramètre','Résultat','Unité','Valeurs normales'], rows.map(r => r.slice(0,4))));

    // Antibiogramme si bactériologie
    if (type === 'Bactériologie') {
      const abgRows = [];
      ABG_ANTIBIOS.forEach(ab => {
        const v = res['ABG_'+ab];
        if (v && v !== 'nd') abgRows.push([ab, v]);
      });
      if (abgRows.length) html += section('💊 Antibiogramme', table(['Antibiotique','Résultat'], abgRows));
      const afg = []; AFG_ANTIFONGIQUES.forEach(af => { const v=res['AFG_'+af]; if(v&&v!=='nd') afg.push([af,v]); });
      if (afg.length) html += section('💊 Antifongigramme', table(['Antifongique','Résultat'], afg));
    }
  }

  return html;
}


// ============================================================
// REÇU DE PAIEMENT IMPRIMABLE
// ============================================================

// ✅ v13.48 — Signatures dessinées à la main, enregistrées par nom
const SIGNATURES_KEY = 'labo_signatures_v1';
const SIGNATAIRES = ['YERIGUE', 'admin'];

function getSignatures() {
  try { return JSON.parse(localStorage.getItem(SIGNATURES_KEY) || '{}'); } catch { return {}; }
}
function getSignature(nom) { return getSignatures()[nom] || null; }
function saveSignature(nom, dataURL) {
  const all = getSignatures();
  all[nom] = dataURL;
  localStorage.setItem(SIGNATURES_KEY, JSON.stringify(all));
}
function deleteSignature(nom) {
  const all = getSignatures();
  delete all[nom];
  localStorage.setItem(SIGNATURES_KEY, JSON.stringify(all));
}

// ── Choix du signataire du reçu ──────────────────────────────
function choisirSignataireRecu(id) {
  const existing = document.getElementById('modal-signataire');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'modal-signataire';
  modal.className = 'modal-backdrop';

  const boutons = SIGNATAIRES.map(nom => {
    const sig = getSignature(nom);
    const apercu = sig
      ? '<img src="' + sig + '" style="height:26px;max-width:90px;object-fit:contain">'
      : '<span style="font-size:11px;color:var(--text-muted)">aucune signature</span>';
    return '<div style="display:flex;align-items:center;gap:8px">'
      + '<button class="btn btn-primary" style="flex:1;padding:12px;display:flex;align-items:center;justify-content:space-between;gap:10px" onclick="lancerRecuSigne(' + id + ',\'' + nom + '\')">'
        + '<span>' + nom + '</span>' + apercu
      + '</button>'
      + '<button class="btn btn-outline" style="padding:12px 12px" title="Créer / modifier la signature de ' + nom + '" onclick="ouvrirPadSignature(\'' + nom + '\',' + id + ')">✏️</button>'
    + '</div>';
  }).join('');

  modal.innerHTML =
    '<div class="modal-box" style="max-width:380px;text-align:center">'
    + '<div style="font-size:32px;margin-bottom:8px">🖊️</div>'
    + '<div class="modal-title" style="text-align:center">Qui signe le reçu ?</div>'
    + '<p style="font-size:13px;color:var(--text-muted);margin:0 0 18px">Choisissez le signataire. ✏️ pour dessiner ou modifier sa signature.</p>'
    + '<div style="display:flex;flex-direction:column;gap:10px">'
      + boutons
      + '<button class="btn btn-outline" style="width:100%;padding:10px;margin-top:4px" onclick="document.getElementById(\'modal-signataire\').remove()">Sans signature</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function lancerRecuSigne(id, signataire) {
  const m = document.getElementById('modal-signataire');
  if (m) m.remove();
  printReceipt(id, signataire);
}

// ── Pad de signature : dessin à la souris / au doigt ─────────
function ouvrirPadSignature(nom, retourId) {
  const parent = document.getElementById('modal-signataire');
  if (parent) parent.remove();
  const old = document.getElementById('modal-pad');
  if (old) old.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-pad';
  modal.className = 'modal-backdrop';
  const existante = getSignature(nom);
  modal.innerHTML =
    '<div class="modal-box" style="max-width:420px">'
    + '<div class="modal-title">✍️ Signature de ' + escHTML(nom) + '</div>'
    + '<p style="font-size:12.5px;color:var(--text-muted);margin:0 0 12px">Dessinez la signature avec la souris ou le doigt, puis enregistrez.</p>'
    + '<div style="position:relative;border:2px dashed var(--border);border-radius:10px;background:#fff;overflow:hidden">'
      + '<canvas id="sig-canvas" style="display:block;width:100%;height:180px;touch-action:none;cursor:crosshair"></canvas>'
      + '<div id="sig-hint" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;color:#c0ccda;font-size:13px">Signez ici</div>'
      + '<div style="position:absolute;left:14px;right:14px;bottom:24px;border-bottom:1px solid #d0dae6;pointer-events:none"></div>'
    + '</div>'
    + '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">'
      + '<button class="btn btn-outline" style="flex:1" onclick="effacerPadSignature()">Effacer</button>'
      + (existante ? '<button class="btn btn-danger" style="flex:1" onclick="supprimerSignature(\'' + nom + '\',' + (retourId||'null') + ')">Supprimer</button>' : '')
      + '<button class="btn btn-primary" style="flex:2" onclick="enregistrerPadSignature(\'' + nom + '\',' + (retourId||'null') + ')">💾 Enregistrer</button>'
    + '</div>'
    + '<button class="btn btn-outline" style="width:100%;margin-top:10px;padding:8px" onclick="fermerPad(' + (retourId||'null') + ')">Annuler</button>'
    + '</div>';
  document.body.appendChild(modal);

  const canvas = document.getElementById('sig-canvas');
  const hint = document.getElementById('sig-hint');
  // Résolution nette (retina)
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0b2545';

  // Pré-charger la signature existante
  if (existante) {
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, 0, 0, rect.width, rect.height); };
    img.src = existante;
    hint.style.display = 'none';
    canvas.dataset.dirty = '1';
  }

  let drawing = false, lastX = 0, lastY = 0;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  };
  const start = (e) => { e.preventDefault(); drawing = true; const q = pos(e); lastX = q.x; lastY = q.y; hint.style.display = 'none'; canvas.dataset.dirty = '1'; };
  const move = (e) => {
    if (!drawing) return; e.preventDefault();
    const q = pos(e);
    ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(q.x, q.y); ctx.stroke();
    lastX = q.x; lastY = q.y;
  };
  const end = () => { drawing = false; };
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
  canvas._cleanup = () => { window.removeEventListener('mouseup', end); };
}

function effacerPadSignature() {
  const canvas = document.getElementById('sig-canvas');
  const hint = document.getElementById('sig-hint');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.dataset.dirty = '';
  if (hint) hint.style.display = 'flex';
}

function enregistrerPadSignature(nom, retourId) {
  const canvas = document.getElementById('sig-canvas');
  if (!canvas || !canvas.dataset.dirty) { toast('Dessinez d\'abord la signature', 'err'); return; }
  // Recadrer sur le tracé + fond transparent conservé
  const dataURL = canvas.toDataURL('image/png');
  saveSignature(nom, dataURL);
  fermerPad(retourId);
  toast('✅ Signature de ' + nom + ' enregistrée', 'ok');
}

function supprimerSignature(nom, retourId) {
  if (!confirm('Supprimer la signature enregistrée de ' + nom + ' ?')) return;
  deleteSignature(nom);
  fermerPad(retourId);
  toast('Signature de ' + nom + ' supprimée', 'err');
}

function fermerPad(retourId) {
  const canvas = document.getElementById('sig-canvas');
  if (canvas && canvas._cleanup) canvas._cleanup();
  const m = document.getElementById('modal-pad');
  if (m) m.remove();
  // Rouvrir le choix du signataire si on venait de là
  if (retourId != null && retourId !== 'null') choisirSignataireRecu(retourId);
}

/* ═══════════════════════════════════════════════════════════
   ✅ v13.49 — Signature liée au COMPTE (enregistrée en base)
   Capturée à la création du compte, réutilisée automatiquement
   sous les résultats du patient quand la personne est connectée.
   ═══════════════════════════════════════════════════════════ */

// Signature de l'utilisateur connecté, chargée après login
let _maSignature = null;

async function chargerMaSignature() {
  try {
    if (!_sb || !TK()) { _maSignature = null; return; }
    const { data, error } = await _sb.rpc('get_my_signature', { p_token: TK() });
    _maSignature = (!error && data) ? data : null;
  } catch (e) { _maSignature = null; }
}

// Ouvre un pad de signature générique. onSave reçoit le dataURL PNG.
function ouvrirPadSignatureGenerique({ titre, sousTitre, onSave }) {
  const old = document.getElementById('modal-pad');
  if (old) old.remove();
  const modal = document.createElement('div');
  modal.id = 'modal-pad';
  modal.className = 'modal-backdrop';
  modal.innerHTML =
    '<div class="modal-box" style="max-width:420px">'
    + '<div class="modal-title">' + titre + '</div>'
    + '<p style="font-size:12.5px;color:var(--text-muted);margin:0 0 12px">' + (sousTitre || 'Dessinez la signature avec la souris ou le doigt, puis enregistrez.') + '</p>'
    + '<div style="position:relative;border:2px dashed var(--border);border-radius:10px;background:#fff;overflow:hidden">'
      + '<canvas id="sig-canvas" style="display:block;width:100%;height:180px;touch-action:none;cursor:crosshair"></canvas>'
      + '<div id="sig-hint" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;color:#c0ccda;font-size:13px">Signez ici</div>'
      + '<div style="position:absolute;left:14px;right:14px;bottom:24px;border-bottom:1px solid #d0dae6;pointer-events:none"></div>'
    + '</div>'
    + '<div style="display:flex;gap:10px;margin-top:16px">'
      + '<button class="btn btn-outline" style="flex:1" onclick="effacerPadSignature()">Effacer</button>'
      + '<button class="btn btn-primary" style="flex:2" id="pad-save-btn">💾 Enregistrer</button>'
    + '</div>'
    + '<button class="btn btn-outline" style="width:100%;margin-top:10px;padding:8px" onclick="(function(){var c=document.getElementById(\'sig-canvas\');if(c&&c._cleanup)c._cleanup();document.getElementById(\'modal-pad\').remove();})()">Annuler</button>'
    + '</div>';
  document.body.appendChild(modal);
  _wireSignatureCanvas();
  document.getElementById('pad-save-btn').addEventListener('click', () => {
    const canvas = document.getElementById('sig-canvas');
    if (!canvas || !canvas.dataset.dirty) { toast('Dessinez d\'abord la signature', 'err'); return; }
    const dataURL = canvas.toDataURL('image/png');
    if (canvas._cleanup) canvas._cleanup();
    modal.remove();
    onSave(dataURL);
  });
}

// Câblage du canvas (souris + tactile), factorisé
function _wireSignatureCanvas() {
  const canvas = document.getElementById('sig-canvas');
  const hint = document.getElementById('sig-hint');
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b2545';
  let drawing = false, lastX = 0, lastY = 0;
  const pos = (e) => { const r = canvas.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
  const start = (e) => { e.preventDefault(); drawing = true; const q = pos(e); lastX = q.x; lastY = q.y; if (hint) hint.style.display = 'none'; canvas.dataset.dirty = '1'; };
  const move = (e) => { if (!drawing) return; e.preventDefault(); const q = pos(e); ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(q.x, q.y); ctx.stroke(); lastX = q.x; lastY = q.y; };
  const end = () => { drawing = false; };
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
  canvas._cleanup = () => { window.removeEventListener('mouseup', end); };
}

// Enregistre la signature d'un compte en base (admin)
async function enregistrerSignatureCompte(username, dataURL) {
  try {
    const { data, error } = await _sb.rpc('set_user_signature', { p_token: TK(), p_username: username, p_signature: dataURL });
    if (error || data !== 'ok') { toast('Erreur : signature non enregistrée', 'err'); return false; }
    toast('✅ Signature de ' + username + ' enregistrée', 'ok');
    // Si c'est mon propre compte, rafraîchir ma signature en mémoire
    if (_currentUser && _currentUser.username === username) _maSignature = dataURL;
    if (typeof renderUsersList === 'function') renderUsersList();
    return true;
  } catch (e) { toast('Erreur réseau', 'err'); return false; }
}

// Bouton depuis la liste des comptes : dessiner/modifier la signature
function ouvrirSignatureCompte(username) {
  if (blockIfSpectateur && blockIfSpectateur()) return;
  ouvrirPadSignatureGenerique({
    titre: '✍️ Signature de ' + escHTML(username),
    sousTitre: 'Cette signature apparaîtra automatiquement sous les résultats saisis par ' + escHTML(username) + '.',
    onSave: (dataURL) => enregistrerSignatureCompte(username, dataURL)
  });
}

async function printReceipt(id, signataire) {
  const record = getDB().find(r => r.id === id);
  if (!record) { toast('Dossier introuvable', 'err'); return; }
  await ensureFull(record); // ✅ v13.5 — détail complet avant le reçu

  const p = record.patient || {};
  const types = getRecordTypes(record);
  const now = new Date();
  const ref = typeof getTarifsRef === 'function' ? getTarifsRef() : {};
  const catalogue = getCatalogueComplet();

  // Construire les lignes du reçu
  const lignes = [];
  let totalCalcule = 0;

  types.forEach(type => {
    const TYPE_TO_TAB = {
      'Hématologie':'hema','Biochimie':'bio','Bactériologie':'bacterio',
      'Immuno-Sérologie':'sero','Parasitologie':'parasito','Groupe sanguin':'gs',// BPN supprimé v13.21
    };
    const tabKey = TYPE_TO_TAB[type] || 'hema';
    // Examens cochés enregistrés dans le dossier
    const examens = isDossierRecord(record)
      ? (record.resultats?._examens_coches?.[type] || [])
      : (record.resultats?.['_examens_coches'] || []);
    // ✅ v13.12 — prix EXACTS saisis sur la fiche (prioritaires sur les tarifs)
    const prixMap = isDossierRecord(record)
      ? (record.resultats?._examens_prix?.[type] || {})
      : (record.resultats?.['_examens_prix'] || {});

    if (examens.length) {
      examens.forEach(label => {
        const ex = catalogue.find(e => e.label === label);
        const prix = (prixMap[label] !== undefined)
          ? prixMap[label]
          : (ex ? (ref[ex.id] !== undefined ? ref[ex.id] : ex.prix || 0) : 0);
        lignes.push({ label, prix, type });
        totalCalcule += prix;
      });
    } else {
      lignes.push({ label: type, prix: null, type });
    }
  });

  const montantAffiche = record.montant || totalCalcule;

  // QR code pour le reçu
  const qrText = `CPMI Grand-Bassam\nREÇU N°${record.id}\nDossier: ${p.dossier||'—'}\nPatient: ${(p.nom||'').toUpperCase()}\nMontant: ${montantAffiche.toLocaleString('fr-FR')} FCFA`;
  const qrUrl = await generateQRDataURL(qrText, 90);

  const receiptNum = String(record.id).padStart(6, '0');
  const dateHeure = now.toLocaleDateString('fr-FR') + ' ' + now.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'});

  // Infos de paiement (montant reçu, monnaie) si le dossier a été encaissé
  const payInfos = p.paiement_infos || {};
  const estPaye = getPaiementStatus(id) === 'paye';
  const montantRecu = Number(payInfos.montant_recu) || null;
  const monnaieRendue = Number(payInfos.monnaie != null ? payInfos.monnaie : payInfos.monnaie_rendue) || 0;
  const agentCaisse = payInfos.agent || record.createdBy || '—';

  // ✅ v13.48 — Signature : dessinée à la main si enregistrée, sinon paraphe généré
  let sigMarkup = '';
  if (signataire) {
    const dessin = getSignature(signataire);
    sigMarkup = dessin
      ? '<img src="' + dessin + '" style="height:46px;max-width:150px;object-fit:contain;display:block;margin-left:auto">'
      : generateSignatureSVG(signataire, 150, 46);
  }

  // ✅ v13.43 — Reçu modernisé : classes CSS alignées, palette clinique,
  //   bloc paiement (reçu / monnaie), statut payé, total en vedette
  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Courier New',monospace; font-size:12px; width:80mm; margin:0 auto; padding:0; background:#fff; color:#000; }
  .receipt { padding:10px 11px 8px; }
  .hdr-bar { height:5px; background:linear-gradient(to right,#0b2545,#0096c7,#00b4d8); }
  .hdr { padding:9px 0 7px; text-align:center; border-bottom:2px solid #000; }
  .hdr-logo { display:inline-block; width:38px; height:38px; margin-bottom:4px; }
  .hdr-name { font-weight:800; font-size:13.5px; letter-spacing:.5px; }
  .hdr-sub  { font-size:9px; color:#333; }
  .hdr-addr { font-size:8px; color:#555; font-style:italic; margin-top:1px; }
  .title-bar { background:#0b2545; color:#fff; text-align:center; font-weight:700; font-size:11px; letter-spacing:2px; padding:5px 0; margin:7px 0; border-radius:2px; }
  .meta-row { display:flex; justify-content:space-between; font-size:9.5px; padding:1.5px 0; }
  .meta-row .lbl { color:#444; }
  .meta-row .val { font-weight:600; text-align:right; }
  .sep { border-top:1px dashed #666; margin:6px 0; }
  .sep-solid { border-top:2px solid #000; margin:6px 0; }
  .section-title { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:#0b2545; margin:6px 0 3px; }
  .item-row { display:flex; justify-content:space-between; font-size:10px; padding:2px 0; border-bottom:1px dotted #ddd; }
  .item-name { flex:1; padding-right:6px; }
  .item-prix { font-weight:600; white-space:nowrap; }
  .total-box { background:#eaf4fb; border:1.5px solid #0b2545; border-radius:4px; padding:7px 11px; margin:7px 0; display:flex; justify-content:space-between; align-items:center; }
  .total-lbl { font-weight:700; font-size:11px; color:#0b2545; }
  .total-val { font-weight:800; font-size:17px; color:#0b2545; }
  .pay-box { background:#f0fdf4; border:1px solid #86efac; border-radius:4px; padding:6px 10px; margin:6px 0; }
  .pay-row { display:flex; justify-content:space-between; font-size:10px; padding:1.5px 0; }
  .pay-row .v { font-weight:700; }
  .pay-status { text-align:center; font-weight:800; font-size:12px; color:#166534; letter-spacing:1px; padding:3px 0; }
  .pay-status.unpaid { color:#991b1b; }
  .sign-row { display:flex; justify-content:space-between; align-items:flex-end; font-size:9.5px; margin-top:4px; }
  .sig-block { text-align:right; }
  .sig-block .sig-svg { display:block; margin-left:auto; }
  .sig-block .sig-name { font-size:9px; font-weight:700; color:#0b2545; text-transform:uppercase; letter-spacing:.5px; border-top:.5px solid #999; padding-top:2px; margin-top:1px; }
  .qr-section { text-align:center; margin-top:7px; padding-top:6px; border-top:1px dashed #aaa; }
  .qr-section img { width:74px; height:74px; }
  .qr-ref { font-size:8px; color:#666; margin-top:2px; font-style:italic; }
  .footer-msg { text-align:center; font-size:9px; color:#555; font-style:italic; margin-top:6px; line-height:1.5; }
  .footer-bar { height:3px; background:linear-gradient(to right,#00b4d8,#0b2545); margin-top:8px; }
  @media print { body { width:100%; } @page { margin:0; size:80mm auto; } }
</style>
</head><body>
  <div class="hdr-bar"></div>
  <div class="receipt">
    <div class="hdr">
      <div class="hdr-logo">
        <svg viewBox="0 0 64 64" width="38" height="38" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="31" fill="#0b2545"/>
          <path d="M32 16c-5.5 0-10 4.2-10 10.5 0 4.8 2.9 9 7 11.3v3.4c-4.5 1-8 3.6-9.4 7h25c-1.4-3.5-5-6-9.6-7v-3.4c4.1-2.3 7-6.5 7-11.3C42 20.2 37.5 16 32 16z" fill="#fff"/>
          <circle cx="32" cy="14" r="3.4" fill="#fff"/>
          <rect x="46" y="40" width="3.2" height="11" rx="1.2" fill="#00b4d8"/>
          <rect x="41.4" y="44.4" width="11" height="3.2" rx="1.2" fill="#00b4d8"/>
        </svg>
      </div>
      <div class="hdr-name">CPMI DE GRAND-BASSAM</div>
      <div class="hdr-sub">Centre de Protection Mère et Infantile</div>
      <div class="hdr-sub">Laboratoire d'analyses médicales</div>
      <div class="hdr-addr">Grand-Bassam, Côte d'Ivoire</div>
    </div>

    <div class="title-bar">REÇU DE PAIEMENT</div>

    <div class="meta-row"><span class="lbl">N° Reçu</span><span class="val">${receiptNum}</span></div>
    <div class="meta-row"><span class="lbl">Date</span><span class="val">${dateHeure}</span></div>
    <div class="meta-row"><span class="lbl">Caissier</span><span class="val">${escHTML(agentCaisse)}</span></div>

    <div class="sep"></div>

    <div class="section-title">Patient</div>
    <div class="meta-row"><span class="lbl">Nom</span><span class="val">${escHTML((p.nom||'').toUpperCase())}</span></div>
    <div class="meta-row"><span class="lbl">N° Dossier</span><span class="val">${escHTML(p.dossier||'—')}</span></div>
    <div class="meta-row"><span class="lbl">Âge / Sexe</span><span class="val">${escHTML(p.age||'—')} ans / ${escHTML(p.sexe||'—')}</span></div>
    <div class="meta-row"><span class="lbl">Prescripteur</span><span class="val">${escHTML(p.medecin||'—')}</span></div>

    <div class="sep"></div>

    <div class="section-title">Détail des analyses</div>
    ${lignes.map(l => `
    <div class="item-row">
      <span class="item-name">${escHTML(l.label)}</span>
      <span class="item-prix">${l.prix !== null ? l.prix.toLocaleString('fr-FR') + ' F' : '—'}</span>
    </div>`).join('')}

    <div class="total-box">
      <span class="total-lbl">TOTAL</span>
      <span class="total-val">${montantAffiche.toLocaleString('fr-FR')} FCFA</span>
    </div>

    ${estPaye && montantRecu ? `
    <div class="pay-box">
      <div class="pay-row"><span>Montant reçu</span><span class="v">${montantRecu.toLocaleString('fr-FR')} F</span></div>
      <div class="pay-row"><span>Monnaie rendue</span><span class="v">${monnaieRendue.toLocaleString('fr-FR')} F</span></div>
    </div>
    <div class="pay-status">✓ PAYÉ</div>` : `
    <div class="pay-status unpaid">⚠ NON PAYÉ</div>`}

    <div class="sep"></div>

    <div class="sign-row"><span>Mode de paiement :</span><span>_____________</span></div>
    <div class="sign-row" style="margin-top:8px">
      <span>Signature :</span>
      ${sigMarkup
        ? `<span class="sig-block"><span class="sig-svg">${sigMarkup}</span><span class="sig-name">${escHTML(signataire)}</span></span>`
        : '<span>_____________</span>'}
    </div>

    ${qrUrl ? `<div class="qr-section">
      <img src="${qrUrl}" alt="QR">
      <div class="qr-ref">Scannez pour vérifier l'authenticité</div>
    </div>` : ''}

    <div class="footer-msg">
      Merci de votre confiance<br>
      Ce reçu fait foi de paiement<br>
      <strong>CPMI Grand-Bassam</strong>
    </div>
  </div>
  <div class="footer-bar"></div>
</body></html>`;

  const win = window.open('', 'receipt', 'width=400,height=700,toolbar=no,scrollbars=yes');
  if (!win) { toast('Autorisez les pop-ups pour imprimer le reçu', 'err'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.print(); }, 400);
}


// ── Export CSV de l'historique filtré ────────────────────────────────
function exportHistoryCSV() {
  const db = getDB();
  if (!db.length) { toast('Aucune donnée à exporter', 'err'); return; }

  const headers = ['N° Dossier','Nom patient','Âge','Sexe','Date prélèvement',
    'Types analyses','Prescripteur','Montant (FCFA)','Saisi par','Date saisie'];

  const rows = db.map(r => {
    const p = r.patient || {};
    return [
      p.dossier || '',
      (p.nom || '').toUpperCase(),
      p.age || '',
      p.sexe || '',
      p.date ? new Date(p.date).toLocaleDateString('fr-FR') : '',
      getRecordTypes(r).join(' + ') || r.type || '',
      p.medecin || '',
      r.montant || 0,
      r.createdBy || '',
      r.savedAt ? new Date(r.savedAt).toLocaleDateString('fr-FR') : '',
    ].map(v => '"' + String(v).replace(/"/g, '""') + '"');
  });

  const csv = [headers.map(h => '"'+h+'"').join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'LaboSaisie_Historique_' + new Date().toLocaleDateString('fr-FR').replace(/\//g,'-') + '.csv';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  toast('Export CSV réussi ✓', 'ok');
}

function printHistory() {
  _printData = null; // mode historique complet
  window.print();
}

// ============================================================
// EXPORT PDF
// ============================================================


