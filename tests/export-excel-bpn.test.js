// ✅ v13.148 — Export EXCEL du bilan prénatal (le format réellement utilisé).
// Exigences :
//   • DEUX feuilles seulement : « Hématologie + Groupe » et « Biochimie + Sérologies »
//     (au lieu d'une feuille par analyse).
//   • Électrophorèse : profil en GRAND, sans les pourcentages.
//   • Pas de Sérodiagnostic de Widal sur le BPN.
//   • Forfait affiché à 20 000 FCFA.
const { serve, openApp, createReporter } = require('./helpers');

const bpn = {
  id: 3101, type: 'Dossier', montant: 10000, created_at: '2026-09-06T09:00:00Z', created_by: 'YERIGUE',
  patient: { nom: 'BPN EXCEL', dossier: '3101-0906', date: '2026-09-06', sexe: 'F', age: '28', medecin: 'SAGE-FEMME' },
  resultats: {
    _types: ['Hématologie', 'Biochimie', 'Immuno-Sérologie', 'Groupe sanguin'],
    _examens_coches: {
      'Hématologie': ['Bilan prénatal complet (forfait)', 'NFS — Numération Formule Sanguine', "Électrophorèse de l'hémoglobine"],
      'Biochimie': ['Glycémie à jeun', 'Créatinine'],
      'Immuno-Sérologie': ['Ag HBs (Hépatite B)', 'TPHA / VDRL (Syphilis)'],
      'Groupe sanguin': ['Groupe sanguin ABO / Rhésus'],
    },
    'Hématologie': {
      'Globules blancs (GB)': { valeur: '6.4', unite: '10³/µL', interp: 'Normal' },
      'Hémoglobine (Hb)': { valeur: '11.2', unite: 'g/dL', interp: 'Bas' },
      // ✅ v13.150 — Électrophorèse rendue PAR SON PROFIL seul (cas réel BPN,
      // sans pourcentages) : ne doit PAS réapparaître vide « à compléter ».
      'Profil Hb': 'Profil AS (Drépanocytose trait)',
    },
    'Biochimie': {
      'Glycémie à jeun': { valeur: '0.85', unite: 'g/L', interp: 'Normal' },
      'Créatinine': { valeur: '8.1', unite: 'mg/L', interp: 'Normal' },
    },
    'Immuno-Sérologie': {
      'Ag HBs': { mode: 'qual', resultat: 'Négatif' },
      'TPHA / VDRL (Syphilis)': { mode: 'qual', resultat: 'Négatif' },
    },
    'Groupe sanguin': { 'Groupe ABO': 'O', 'Rhésus': 'Positif' },
  },
  prescripteur_id: null, est_bpn: false, restricted_by: null, deleted_at: null,
};

(async () => {
  const r = createReporter('EXPORT EXCEL — BILAN PRÉNATAL (2 FEUILLES)');
  const srv = await serve(8148);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8148 });
    ctx = app.ctx; const { page, errors } = app;

    // Charge le dossier en base (pour getRecordResultats / getPendingCheckedExams).
    await page.evaluate((d) => {
      const light = x => { const res = {}; Object.keys(x.resultats || {}).forEach(k => { if (k[0] === '_') res[k] = x.resultats[k]; }); return Object.assign({}, x, { resultats: res }); };
      _sb.rpc = async (n, pr) => {
        if (n === 'get_resultats_light') return { data: [light(d)], error: null };
        if (n === 'get_resultat_full') return { data: [{ resultats: d.resultats }], error: null };
        return { data: [], error: null };
      };
    }, bpn);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);

    r.section('Détection BPN + construction du classeur');
    const out = await page.evaluate(async () => {
      const rec = getDB().find(x => x.id === 3101);
      await ensureFull(rec); // détail complet (comme exportRecord)
      const est = (typeof estBPN === 'function') && estBPN(rec);
      const resDe = t => getRecordResultats(rec, t);
      const pendingDe = types => types.reduce((a, t) => { try { return a.concat(getPendingCheckedExams(rec, t)); } catch (e) { return a; } }, []);
      const wb = new ExcelJS.Workbook();
      buildProfessionalSheet(wb, { ...rec, type: 'Dossier' }, 'Hématologie + Groupe', {
        bpn: true, montant: 20000,
        render: [{ type: 'Hématologie', res: resDe('Hématologie') }, { type: 'Groupe sanguin', res: resDe('Groupe sanguin') }],
        pending: pendingDe(['Hématologie', 'Groupe sanguin']),
      });
      buildProfessionalSheet(wb, { ...rec, type: 'Dossier' }, 'Biochimie + Sérologies', {
        bpn: true, montant: 20000,
        render: [{ type: 'Biochimie', res: resDe('Biochimie') }, { type: 'Immuno-Sérologie', res: resDe('Immuno-Sérologie') }],
        pending: pendingDe(['Biochimie', 'Immuno-Sérologie']),
      });
      const textOf = ws => { const t = []; ws.eachRow(row => row.eachCell(c => t.push(String(c.value == null ? '' : c.value)))); return t.join(' | '); };
      // Logo + QR + signature : images ajoutées juste avant le téléchargement.
      let imgCount = 0;
      try { await addQrAndSignatures(wb); imgCount = (wb.worksheets[0].getImages() || []).length; } catch (e) {}
      return {
        est,
        names: wb.worksheets.map(w => w.name),
        s1: textOf(wb.worksheets[0]),
        s2: textOf(wb.worksheets[1]),
        imgCount,
        footer: (wb.worksheets[0].headerFooter && wb.worksheets[0].headerFooter.oddFooter) || '',
      };
    });

    r.check('dossier reconnu BPN', out.est, true);
    r.check('exactement 2 feuilles', out.names.length, 2);
    // ✅ v13.150 — Logo CPMI + QR + signature insérés (≥ 2 images sur la feuille).
    r.check('images insérées (logo + QR…)', out.imgCount >= 2, true);
    // ✅ v13.151 — Numéro de page en pied (impression).
    r.check('numéro de page en pied', out.footer.includes('&P'), true);

    r.section('Feuille 1 — Hématologie + Groupe sanguin');
    r.check('NFS présente', /Globules blancs|NFS/.test(out.s1), true);
    r.check('Groupe ABO présent', /Groupe ABO/.test(out.s1), true);
    r.check('profil en grand', /PROFIL : Profil AS/.test(out.s1), true);
    r.check('PAS de tableau de pourcentages (Fraction)', /Fraction/.test(out.s1), false);
    r.check('PAS la biochimie ici', /Fonction rénale|Glyc/.test(out.s1), false);
    // ✅ v13.150 — Anti-duplication : plus de bloc « à compléter » quand tout est
    // rempli ; l'électrophorèse (profil) et le groupe ne réapparaissent pas vides.
    r.check('électrophorèse non dupliquée (pas de fractions vides)', /Hb A\b/.test(out.s1), false);
    r.check('pas de bloc « à compléter » (tout est rempli)', /à compléter/.test(out.s1), false);
    r.check('groupe sanguin non dupliqué', (out.s1.match(/Groupe ABO/g) || []).length, 1);
    r.check('forfait non listé « à compléter »', /Bilan prénatal complet/.test(out.s1), false);

    r.section('Feuille 2 — Biochimie + Immuno-Sérologies');
    r.check('biochimie présente', /Biochimie —|Créatinine|Glyc/.test(out.s2), true);
    r.check('sérologie présente', /Ag HBs|TPHA/.test(out.s2), true);
    r.check('sérologie sur la MÊME feuille que biochimie', /Créatinine/.test(out.s2) && /Ag HBs/.test(out.s2), true);

    r.section('Widal masqué + forfait');
    r.check('pas de Widal en feuille 1', /Widal/i.test(out.s1), false);
    r.check('pas de Widal en feuille 2', /Widal/i.test(out.s2), false);
    r.check('forfait 20 000 en pied (feuille 1)', /Montant : 20\s?000 FCFA/.test(out.s1), true);
    r.check('le 10 000 saisi n\'apparaît pas', /Montant : 10\s?000 FCFA/.test(out.s1 + out.s2), false);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   JS:', errors.slice(0, 6));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();
