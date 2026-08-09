/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — stats.js
   Extrait de index.html (v13.70). Chargé en script classique, PAS en
   module ES : les gestionnaires inline du HTML (onclick="…") résolvent
   les fonctions dans la portée globale. L'ordre des balises <script>
   dans index.html doit être conservé.
   ═══════════════════════════════════════════════════════════════ */

/* ============================================================
   LaboSaisie CPMI — print.js
   Fonctions d'impression, export PDF et export Excel
   v13.35 — extrait de index.html
   Dépendances : ExcelJS, jsPDF, jspdf-autotable (chargés dans index.html)
   Variables globales attendues : _sb, TK(), _currentUser,
     getDB(), getRecordTypes(), getRecordResultats(), _fmtF(),
     _recDate(), toast(), showLoading(), hideLoading(), esc(),
     HEMA_FL, HEMA_PARAMS, BIO_*, SERO_*,
     CATALOGUE_EXAMENS, _prescripteurs, etc.
   ============================================================ */

function ensureExcelJSReady() {
  if (typeof ExcelJS === 'undefined') {
    toast('Bibliothèque Excel indisponible — vérifiez votre connexion internet et réessayez', 'err');
    return false;
  }
  return true;
}

// Convertit un classeur ExcelJS en fichier .xlsx et déclenche son
// téléchargement dans le navigateur. C'était la fonction manquante qui
// empêchait TOUS les exports Excel de fonctionner (le classeur était bien
// construit mais jamais réellement écrit sur le disque de l'utilisateur).
// ── Nom de feuille Excel valide (ExcelJS rejette certains caractères) ──
function safeSheetName(name, usedNames) {
  // Supprimer les caractères interdits par Excel : [ ] : * ? / \ '
  let safe = (name || 'Feuille')
    .replace(/[\[\]:*?/\\']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 31);
  if (!safe) safe = 'Feuille';
  // Dédoublonner si usedNames fourni
  if (usedNames) {
    let candidate = safe;
    let n = 2;
    while (usedNames.has(candidate)) {
      candidate = safe.substring(0, 28) + ' ' + n;
      n++;
    }
    usedNames.add(candidate);
    return candidate;
  }
  return safe;
}

async function downloadWorkbook(wb, filename) {
  showLoading('Génération du fichier Excel…'); // ✅ v13
  try {
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    hideLoading();
  }
}

async function exportSingle(type) {
  try {
  const p = getPatient();
  if (!validatePatient(p)) return;
  if (!ensureExcelJSReady()) return;

  await refreshDB();
  const db = getDB();

  // Chercher dans les dossiers unifiés ET les anciens formats
  let saved = db.find(r => isDossierRecord(r) && r.patient?.dossier === p.dossier);
  if (saved) {
    await ensureFull(saved); // ✅ v13.5 — détail complet avant export Excel
    // Extraire le type demandé du dossier
    const typeRes = getRecordResultats(saved, type);
    saved = { ...saved, type, resultats: typeRes };
  } else {
    saved = db.find(r => r.type === type && r.patient?.dossier === p.dossier);
    if (saved) await ensureFull(saved); // ✅ v13.5
  }
  if (!saved) {
    toast('Enregistrez la fiche avant de l\'exporter ✗', 'err');
    return;
  }

  // Avertir si des examens payés ne sont pas remplis
  if (!confirmerSiExamensManquants(type, saved.resultats)) return;

  // Export depuis la fiche enregistrée (pas depuis le formulaire en cours)
  const displayType = getDisplayType(saved);
  const wb = new ExcelJS.Workbook();
  wb.creator = CENTRE;
  wb.title = 'Résultat ' + displayType;
  buildProfessionalSheet(wb, saved, getDisplayTypeShort(saved).substring(0, 31));
  await addQrAndSignatures(wb); // ✅ v13.37 — QR + signature
  await downloadWorkbook(wb, makeFilename(saved.patient.dossier, saved.patient.date, saved.patient.nom || 'PATIENT', getDisplayTypeShort(saved)));
  toast('Export Excel réussi ✓', 'ok');
  } catch(err) {
    console.error('exportSingle:', err);
    toast('Erreur export Excel : ' + (err.message || err), 'err');
  }
}

async function exportAllExcel() {
  try {
  if (!ensureExcelJSReady()) return;
  toast('Récupération des données…');
  showLoading('Récupération de tous les détails…'); // ✅ v13.5
  await refreshDBFull(); // ✅ v13.5 — l'export global a besoin du détail complet
  hideLoading();
  const db = getDB();
  if (!db.length) { toast('Aucune donnée à exporter', 'err'); return; }
  const wb = new ExcelJS.Workbook();
  wb.creator = CENTRE;
  wb.title = 'Export LaboSaisie';
  let sheetCount = 0;
  let failedSheets = 0; // ✅ v12

  const usedNames = new Set();
  db.forEach((record, ri) => {
    try {
      if (isDossierRecord(record)) {
        const types = getRecordTypes(record);
        types.forEach(type => {
          sheetCount++;
          const fakeRecord = { ...record, type, resultats: getRecordResultats(record, type) };
          const nom = (record.patient?.nom || 'PATIENT').toUpperCase().substring(0, 8);
          const rawName = nom + ' ' + type.substring(0, 18);
          buildProfessionalSheet(wb, fakeRecord, safeSheetName(rawName, usedNames));
        });
      } else {
        sheetCount++;
        const rawName = (record.type || 'Analyse') + ' ' + (record.patient?.nom || '').substring(0, 10);
        buildProfessionalSheet(wb, record, safeSheetName(rawName, usedNames));
      }
    } catch(sheetErr) {
      console.error('Erreur feuille dossier', ri, ':', sheetErr);
      failedSheets++; // ✅ v12 — compter les échecs pour ne plus les masquer
      // Continuer avec les autres dossiers
    }
  });

  if (!sheetCount) { toast('Aucune donnée à exporter', 'err'); return; }
  const today = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
  await addQrAndSignatures(wb); // ✅ v13.37 — QR + signature
  await downloadWorkbook(wb, `LaboSaisie_Export_${today}.xlsx`);
  if (failedSheets > 0) {
    toast('Export terminé, mais ' + failedSheets + ' feuille' + (failedSheets>1?'s':'') + ' en erreur (voir console F12)', 'err');
  } else {
    toast('Export complet réussi ✓', 'ok');
  }
  } catch(err) {
    console.error('exportAllExcel:', err);
    toast('Erreur export Excel : ' + (err.message || err), 'err');
  }
}

// ============================================================
// TABLEAU DE BORD — STATISTIQUES
// ============================================================

const TYPES_ANALYSES = ['Hématologie','Biochimie','Bactériologie','Immuno-Sérologie','Parasitologie','Groupe sanguin','Bilan prénatal'];
const TYPE_COLORS = ['#2563EB','#7C3AED','#DB2777','#D97706','#059669','#DC2626','#EA580C'];

async function renderStats() {
  ['kpi-total','kpi-month','kpi-agents','kpi-recettes-month','kpi-recettes-total'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.querySelector('.kpi-val').textContent = '…';
  });

  await refreshDB();
  const db = getCalcDB(); // ✅ v13.30 — exclut les fiches verrouillées des statistiques

  // Appliquer le filtre de période
  const dbPeriode = filterDbByPeriode(db);

  if (!db.length) {
    ['chart-by-type','chart-monthly','chart-by-agent','chart-recettes-type','chart-recettes-monthly'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="stats-empty">Aucune donnée disponible</div>';
    });
    ['kpi-total','kpi-month','kpi-agents','kpi-recettes-month','kpi-recettes-total'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.querySelector('.kpi-val').textContent = '0';
    });
    renderRistournes([]);
    return;
  }

  const now = new Date();
  const thisMonth = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');

  // ── KPI ─────────────────────────────────────────────────────
  const total = db.length;
  const periodeCount = dbPeriode.length;
  const agents = new Set(dbPeriode.map(r => r.createdBy).filter(Boolean));

  // ✅ v13.33 — Animation compte-à-rebours sur les KPI stats
  animateCount(document.getElementById('kpi-total')?.querySelector('.kpi-val'),   total,       600, false);
  animateCount(document.getElementById('kpi-month')?.querySelector('.kpi-val'),   periodeCount,500, false);
  animateCount(document.getElementById('kpi-agents')?.querySelector('.kpi-val'),  agents.size || 0, 400, false);

  // ── Fiches par type d'analyse (barres horizontales) ─────────
  const byType = {};
  TYPES_ANALYSES.forEach(t => byType[t] = 0);
  db.forEach(r => {
    // Dossiers unifiés : compter chaque type séparément
    const types = isDossierRecord(r) ? (r.resultats?._types || []) : [r.type];
    types.forEach(t => { if (byType[t] !== undefined) byType[t]++; });
  });
  const maxType = Math.max(...Object.values(byType), 1);

  document.getElementById('chart-by-type').innerHTML = `
    <div class="bar-chart">
      ${TYPES_ANALYSES.map((t, i) => `
        <div class="bar-row">
          <div class="bar-label" title="${t}">${t}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${Math.round(byType[t]/maxType*100)}%;background:${TYPE_COLORS[i]}"></div>
          </div>
          <div class="bar-count">${byType[t]}</div>
        </div>
      `).join('')}
    </div>`;

  // ── Évolution mensuelle (6 derniers mois) ───────────────────
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    const label = d.toLocaleDateString('fr-FR', { month: 'short' });
    months.push({ key, label, count: dbPeriode.filter(r => (r.patient?.date||r.savedAt||'').startsWith(key)).length });
  }
  const maxMonth = Math.max(...months.map(m => m.count), 1);

  document.getElementById('chart-monthly').innerHTML = `
    <div class="monthly-chart">
      ${months.map(m => `
        <div class="monthly-col">
          <div class="monthly-count">${m.count || ''}</div>
          <div class="monthly-bar" style="height:${Math.max(Math.round(m.count/maxMonth*110),2)}px"></div>
          <div class="monthly-month">${m.label}</div>
        </div>
      `).join('')}
    </div>`;

  // ── Répartition par agent (barres + SVG camembert) ──────────
  const byAgent = {};
  dbPeriode.forEach(r => {
    const a = r.createdBy || 'Inconnu';
    byAgent[a] = (byAgent[a] || 0) + 1;
  });
  const agentEntries = Object.entries(byAgent).sort((a,b) => b[1]-a[1]);
  const maxAgent = Math.max(...agentEntries.map(e => e[1]), 1);
  const agentColors = ['#2563EB','#7C3AED','#DB2777','#D97706','#059669','#0891B2','#DC2626'];

  // SVG camembert
  let svgPaths = '';
  let legendItems = '';
  let startAngle = -Math.PI / 2;
  agentEntries.forEach(([agent, count], i) => {
    const pct = count / total;
    const angle = pct * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const x1 = Math.cos(startAngle) * 60 + 70;
    const y1 = Math.sin(startAngle) * 60 + 70;
    const x2 = Math.cos(endAngle) * 60 + 70;
    const y2 = Math.sin(endAngle) * 60 + 70;
    const largeArc = angle > Math.PI ? 1 : 0;
    const color = agentColors[i % agentColors.length];
    if (total > 1 || agentEntries.length === 1) {
      svgPaths += `<path d="M70,70 L${x1},${y1} A60,60 0 ${largeArc},1 ${x2},${y2} Z" fill="${color}" stroke="white" stroke-width="2"/>`;
    }
    legendItems += `<div class="pie-legend-item"><div class="pie-dot" style="background:${color}"></div><span><strong>${agent}</strong> — ${count} fiche${count>1?'s':''} (${Math.round(pct*100)}%)</span></div>`;
    startAngle = endAngle;
  });

  document.getElementById('chart-by-agent').innerHTML = `
    <div class="pie-chart">
      <svg width="140" height="140" viewBox="0 0 140 140" style="flex-shrink:0">
        ${agentEntries.length === 1
          ? `<circle cx="70" cy="70" r="60" fill="${agentColors[0]}"/>`
          : svgPaths}
        <circle cx="70" cy="70" r="30" fill="white"/>
        <text x="70" y="74" text-anchor="middle" font-size="14" font-weight="700" fill="#1E3A8A">${total}</text>
      </svg>
      <div class="pie-legend">${legendItems}</div>
    </div>`;

  // ── KPI Financiers ────────────────────────────────────────────
  const recettesTotal = db.reduce((s, r) => s + (r.montant || 0), 0);
  const recettesMonth = db.filter(r => (r.patient?.date||r.savedAt||'').startsWith(thisMonth))
    .reduce((s, r) => s + (r.montant || 0), 0);

  // ✅ v13.33 — Animation compte-à-rebours KPI financiers
  const kpiRM = document.getElementById('kpi-recettes-month');
  const kpiRT = document.getElementById('kpi-recettes-total');
  animateCount(kpiRM?.querySelector('.kpi-val'), recettesMonth, 700, true);
  animateCount(kpiRT?.querySelector('.kpi-val'), recettesTotal, 800, true);

  // ── Recettes par type ──────────────────────────────────────────
  const recettesByType = {};
  TYPES_ANALYSES.forEach(t => recettesByType[t] = 0);
  db.forEach(r => { if (recettesByType[r.type] !== undefined) recettesByType[r.type] += (r.montant || 0); });
  const maxRec = Math.max(...Object.values(recettesByType), 1);

  const chartRecType = document.getElementById('chart-recettes-type');
  if (chartRecType) chartRecType.innerHTML = `
    <div class="bar-chart">
      ${TYPES_ANALYSES.map((t, i) => `
        <div class="bar-row">
          <div class="bar-label" title="${t}">${t}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${Math.round(recettesByType[t]/maxRec*100)}%;background:${TYPE_COLORS[i]}"></div>
          </div>
          <div class="bar-count" style="width:70px;font-size:10px">${recettesByType[t].toLocaleString('fr-FR')} F</div>
        </div>
      `).join('')}
    </div>`;

  // ── Recettes mensuelles (6 mois) ────────────────────────────────
  const recMonths = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    const label = d.toLocaleDateString('fr-FR', { month: 'short' });
    const montantMonth = db.filter(r => (r.savedAt||'').startsWith(key)).reduce((s, r) => s + (r.montant||0), 0);
    recMonths.push({ key, label, montant: montantMonth });
  }
  const maxRecMonth = Math.max(...recMonths.map(m => m.montant), 1);

  const chartRecMonthly = document.getElementById('chart-recettes-monthly');
  if (chartRecMonthly) chartRecMonthly.innerHTML = `
    <div class="monthly-chart">
      ${recMonths.map(m => `
        <div class="monthly-col">
          <div class="monthly-count" style="font-size:9px">${m.montant ? (m.montant/1000).toFixed(0)+'k' : ''}</div>
          <div class="monthly-bar" style="height:${Math.max(Math.round(m.montant/maxRecMonth*110),2)}px;background:#15803d"></div>
          <div class="monthly-month">${m.label}</div>
        </div>
      `).join('')}
    </div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:4px;text-align:center">
      Total 6 mois : <strong>${recMonths.reduce((s,m)=>s+m.montant,0).toLocaleString('fr-FR')} FCFA</strong>
    </div>`;

  // ── Top examens les plus demandés (période filtrée) ──────────
  renderTopExamensChart(dbPeriode);

  // Ristournes sur la période filtrée

  // ── Graphiques Chart.js ──────────────────────────────────────
  if (window._charts) { Object.values(window._charts).forEach(ch => { try { ch.destroy(); } catch(e){} }); }
  window._charts = {};
  const CHART_COLORS = {'Hématologie':'#b91c1c','Biochimie':'#854d0e','Bactériologie':'#166534','Immuno-Sérologie':'#5b21b6','Parasitologie':'#9d174d','Groupe sanguin':'#9a3412','Bilan prénatal':'#155e75'};
  const donutEl = document.getElementById('chartjs-donut');
  if (donutEl && typeof Chart !== 'undefined') {
    const dL=TYPES_ANALYSES.filter(t=>byType[t]>0), dD=dL.map(t=>byType[t]), dC=dL.map(t=>CHART_COLORS[t]||'#6b7280'), dT=dD.reduce((a,b)=>a+b,0);
    window._charts.donut = new Chart(donutEl,{type:'doughnut',data:{labels:dL,datasets:[{data:dD,backgroundColor:dC,borderWidth:2,borderColor:'#fff'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{size:10},padding:8}},tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${ctx.raw} (${Math.round(ctx.raw/dT*100)}%)`}}}}});
  }
  const barRecEl = document.getElementById('chartjs-bar-recettes');
  if (barRecEl && typeof Chart !== 'undefined') {
    const bL=[],bD=[];
    for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');bL.push(d.toLocaleDateString('fr-FR',{month:'short',year:'2-digit'}));bD.push(db.filter(r=>(r.patient?.date||r.savedAt||'').startsWith(k)).reduce((s,r)=>s+(r.montant||0),0));}
    window._charts.barRec = new Chart(barRecEl,{type:'bar',data:{labels:bL,datasets:[{label:'FCFA',data:bD,backgroundColor:'rgba(30,58,138,.75)',borderColor:'#1e3a8a',borderWidth:1,borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>' '+ctx.raw.toLocaleString('fr-FR')+' FCFA'}}},scales:{y:{beginAtZero:true,ticks:{font:{size:10},callback:v=>v>=1000?(v/1000).toFixed(0)+'k':v}},x:{ticks:{font:{size:10}}}}}});
  }
  const lineEl = document.getElementById('chartjs-line-evolution');
  if (lineEl && typeof Chart !== 'undefined') {
    const lL=[],lD=[];
    for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');lL.push(d.toLocaleDateString('fr-FR',{month:'short',year:'2-digit'}));lD.push(db.filter(r=>(r.patient?.date||r.savedAt||'').startsWith(k)).length);}
    // ✅ v13.34 — Dataset comparaison année précédente
    const lD2 = [];
    for(let i=11;i>=0;i--){const d=new Date(now.getFullYear()-1,now.getMonth()-i,1);const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');lD2.push(db.filter(r=>(r.patient?.date||r.savedAt||'').startsWith(k)).length);}
    window._charts.line = new Chart(lineEl,{type:'line',data:{labels:lL,datasets:[
      {label:'Cette année',data:lD,borderColor:'#059669',backgroundColor:'rgba(5,150,105,.08)',borderWidth:2,tension:.35,pointRadius:4,fill:true},
      {label:'An passé',data:lD2,borderColor:'#94a3b8',backgroundColor:'transparent',borderWidth:1.5,borderDash:[4,3],tension:.35,pointRadius:3,fill:false}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,labels:{font:{size:10},boxWidth:14}}},scales:{y:{beginAtZero:true,ticks:{font:{size:10},stepSize:1}},x:{ticks:{font:{size:10}}}}}});
  }
  const el_ts=document.getElementById('kpi-total-sub'); if(el_ts){const n=Object.values(byType).reduce((a,b)=>a+b,0);el_ts.textContent=n+' analyse'+(n>1?'s':'')+' enregistrée'+(n>1?'s':'');}
  const el_ms=document.getElementById('kpi-month-sub'); if(el_ms){const n=dbPeriode.reduce((s,r)=>s+(isDossierRecord(r)?(r.resultats?._types||[]).length:1),0);el_ms.textContent=n+' analyse'+(n>1?'s':'');}
  const el_as=document.getElementById('kpi-agents-sub'); if(el_as){const n=new Set(db.map(r=>r.createdBy).filter(Boolean)).size;el_as.textContent=n+' agent'+(n>1?'s':'')+' au total';}

  await renderRistournes(dbPeriode);
  renderTopExamens();
  // Section admin prescripteurs
  const adminCard = document.getElementById('prescripteurs-admin-card');
  if (adminCard) adminCard.style.display = isAdmin() ? '' : 'none';
}

// ============================================================
// IMPRESSION DIRECTE
// ============================================================

// ============================================================
// VÉRIFICATION EXAMENS PAYÉS NON REMPLIS — avant impression/export
// ============================================================

// Retourne la liste des libellés d'examens cochés (payés) sur la fiche
// d'accueil dont la section correspondante n'a aucune valeur saisie

