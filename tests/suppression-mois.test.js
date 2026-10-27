// ════════════════════════════════════════════════════════════════════
//  Supprimer un mois archivé (v13.269) — libérer de la place sur le serveur.
//  Le serveur décide (purger_mois) ; l'écran doit : montrer pour chaque mois
//  pourquoi il peut (ou non) être supprimé, exiger une confirmation tapée,
//  permettre l'annulation, noter l'archive, ne pas restaurer un mois
//  supprimé, et afficher « authentique, archivé » sur le QR d'un tel dossier.
// ════════════════════════════════════════════════════════════════════
const { serve, openApp, createReporter } = require('./helpers');

const PORT = 8374;

const ETAT = {
  mois_max: '2026-06', coffre_ouvert: true, derniere_sauvegarde: '2026-10-10T09:00:00Z',
  mois: [
    { mois: '2026-04', dossiers: 2, corbeille: 0, archive_le: '2026-05-10T09:00:00Z', archive_nb: 2, archive_masques: true, controle: 'archive_perimee' },
    { mois: '2026-05', dossiers: 3, corbeille: 0, archive_le: null, controle: 'archive_absente' },
    { mois: '2026-06', dossiers: 3, corbeille: 1, archive_le: '2026-07-10T09:00:00Z', archive_nb: 3, archive_masques: true, controle: 'ok' },
    { mois: '2026-07', dossiers: 5, corbeille: 0, archive_le: null, controle: 'trop_recent' },
  ],
  purges: [],
};

async function ouvrir(options) {
  const o = await openApp({ role: 'admin', username: 'admin', port: PORT });
  await o.page.evaluate(({ etat, opts }) => {
    window.__appels = [];
    window.__etat = JSON.parse(JSON.stringify(etat));
    window.__toasts = [];
    const toastOrig = window.toast;
    window.toast = (m, t) => { window.__toasts.push(m); try { toastOrig(m, t); } catch (e) {} };
    const ancien = _sb.rpc.bind(_sb);
    _sb.rpc = async (n, p) => {
      window.__appels.push({ n, p });
      if (n === 'etat_suppression_mois') {
        if (opts.absente) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.etat_suppression_mois' } };
        return { data: window.__etat, error: null };
      }
      if (n === 'purger_mois') {
        if (opts.refus) return { data: { erreur: opts.refus }, error: null };
        window.__etat.mois = window.__etat.mois.filter(m => m.mois !== p.p_mois);
        window.__etat.purges = [{ mois: p.p_mois, dossiers: 4, traces: 2, purge_le: '2026-10-27T10:00:00Z', purge_par: 'admin', annulable: true }];
        return { data: { ok: true, mois: p.p_mois, supprimes: 4, traces: 2 }, error: null };
      }
      if (n === 'annuler_purge_mois') { window.__etat.purges = []; return { data: { ok: true, mois: p.p_mois, restaures: 4 }, error: null }; }
      if (n === 'noter_archive_mois') return { data: 'ok', error: null };
      if (n === 'get_resultats') return { data: [], error: null };
      if (n === 'restaurer_fiches') return { data: { total: p.p_fiches.length, restaurees: p.p_fiches.length, ignorees: 0, sans_prescripteur: 0 }, error: null };
      if (n === 'etat_coffre') return { data: { configure: false, ouvert: false }, error: null };
      if (['get_resultats_light', 'get_restriction_status', 'get_deleted_status', 'list_clotures', 'get_resultat_full'].includes(n))
        return { data: [], error: null };
      return ancien(n, p);
    };
  }, { etat: ETAT, opts: options || {} });
  return o;
}
const appels = (page, n) => page.evaluate(n => window.__appels.filter(a => a.n === n).map(a => a.p), n);
const texteZone = page => page.evaluate(() => document.getElementById('suppression-mois-zone').textContent.replace(/\s+/g, ' '));

(async () => {
  const srv = await serve(PORT);
  const r = createReporter('SUPPRIMER UN MOIS ARCHIVÉ');
  let erreurs = [];
  try {
    {
      const { ctx, page, errors } = await ouvrir();
      r.section('Tableau des mois');
      await page.evaluate(() => preparerCarteArchive());
      await page.waitForTimeout(300);
      const t = await texteZone(page);
      r.check('juin : peut être supprimé', /Juin 2026 · 3 dossier\(s\) \+1 en corbeille\s*archive du 10\/07\/2026 \(3 dossier\(s\)\)\s*✓ peut être supprimé/.test(t), true);
      r.check('juillet : à garder (3 derniers mois)', /Juillet 2026.*à garder : les 3 derniers mois/.test(t), true);
      r.check('mai : archive à faire', /Mai 2026.*faire d'abord l'archive/.test(t), true);
      r.check('avril : modifié depuis l\'archive', /Avril 2026.*refaire l'archive/.test(t), true);
      r.check('un seul bouton « Supprimer… »', await page.evaluate(() =>
        [...document.querySelectorAll('#suppression-mois-zone button')].filter(b => /Supprimer/.test(b.textContent)).length), 1);
      r.check('dernière sauvegarde affichée', /Dernière sauvegarde : 10\/10\/2026/.test(t), true);

      r.section('Confirmation tapée');
      await page.evaluate(() => { [...document.querySelectorAll('#suppression-mois-zone button')].find(b => /Supprimer/.test(b.textContent)).click(); });
      await page.waitForTimeout(200);
      r.check('fenêtre ouverte, nombre de dossiers annoncé', await page.evaluate(() =>
        /Supprimer Juin 2026 de la base \?/.test(document.getElementById('suppr-mois-backdrop').textContent)
        && /3 dossier\(s\)/.test(document.getElementById('suppr-mois-backdrop').textContent)), true);
      r.check('bouton désactivé sans saisie', await page.evaluate(() => document.getElementById('suppr-mois-ok').disabled), true);
      await page.fill('#suppr-mois-saisie', 'supprim');
      r.check('saisie incomplète : toujours désactivé', await page.evaluate(() => document.getElementById('suppr-mois-ok').disabled), true);
      await page.click('#suppr-mois-annuler');
      await page.waitForTimeout(150);
      r.check('« Annuler » : rien envoyé au serveur', (await appels(page, 'purger_mois')).length, 0);

      await page.evaluate(() => { [...document.querySelectorAll('#suppression-mois-zone button')].find(b => /Supprimer/.test(b.textContent)).click(); });
      await page.waitForTimeout(200);
      await page.fill('#suppr-mois-saisie', 'supprimer');
      r.check('« supprimer » (minuscules) accepté', await page.evaluate(() => document.getElementById('suppr-mois-ok').disabled), false);
      await page.click('#suppr-mois-ok');
      await page.waitForTimeout(600);
      const p = await appels(page, 'purger_mois');
      r.check('serveur appelé avec le mois et la confirmation', p.length === 1 && p[0].p_mois === '2026-06' && p[0].p_confirmation === 'SUPPRIMER 2026-06', true);
      r.check('message de réussite', await page.evaluate(() => window.__toasts.some(m => /Juin 2026 : 4 dossier\(s\) supprimé\(s\)/.test(m))), true);
      r.check('base rechargée après suppression', (await appels(page, 'get_resultats_light')).length >= 1, true);
      const t2 = await texteZone(page);
      r.check('mois supprimé listé, annulable', /Mois déjà supprimés de la base.*Juin 2026 — 4 dossier\(s\) supprimé\(s\) le 27\/10\/2026 par admin.*Annuler la suppression/.test(t2), true);

      r.section('Annulation');
      await page.evaluate(() => { [...document.querySelectorAll('#suppression-mois-zone button')].find(b => /Annuler la suppression/.test(b.textContent)).click(); });
      await page.waitForTimeout(200);
      await page.click('#cm-ok');
      await page.waitForTimeout(600);
      const an = await appels(page, 'annuler_purge_mois');
      r.check('serveur appelé pour juin', an.length === 1 && an[0].p_mois === '2026-06', true);
      r.check('message : 4 dossiers remis', await page.evaluate(() => window.__toasts.some(m => /4 dossier\(s\) remis en base/.test(m))), true);

      r.section('Mois d\'une ligne de sauvegarde (règle du serveur)');
      r.check('03h le 1er juillet → juin', await page.evaluate(() => moisServiceLigne({ patient: { date: '2026-07-01' }, created_at: '2026-07-01T03:00:00Z' })), '2026-06');
      r.check('sans date patient, 20h le 30 juin → juin', await page.evaluate(() => moisServiceLigne({ patient: {}, created_at: '2026-06-30T20:00:00Z' })), '2026-06');
      r.check('10h le 2 juillet → juillet', await page.evaluate(() => moisServiceLigne({ patient: { date: '2026-07-02' }, created_at: '2026-07-02T10:00:00Z' })), '2026-07');

      r.section('Restauration : un mois supprimé ne revient pas');
      await page.evaluate(() => { window.__etat.purges = [{ mois: '2026-06', dossiers: 4, annulable: false }]; window.__appels = []; });
      const paquet = { _meta: { application: 'LaboSaisie', exporte_le: '2026-10-10T09:00:00Z' }, fiches: [
        { id: 9001, type: 'Dossier', patient: { nom: 'JUIN', date: '2026-06-03' }, created_at: '2026-06-03T10:00:00Z', montant: 1 },
        { id: 9002, type: 'Dossier', patient: { nom: 'GARDE', date: '2026-07-01' }, created_at: '2026-07-01T03:00:00Z', montant: 1 },
        { id: 9101, type: 'Dossier', patient: { nom: 'JUILLET', date: '2026-07-10' }, created_at: '2026-07-10T10:00:00Z', montant: 1 } ] };
      const fin = page.evaluate(t => restaurerBase(t), JSON.stringify(paquet));
      await page.waitForSelector('#confirm-modal-backdrop', { timeout: 5000 });
      r.check('aperçu : 1 fiche à restaurer, 2 écartées', await page.evaluate(() => {
        const t = document.getElementById('confirm-modal-backdrop').textContent;
        return /Restaurer 1 fiche \?/.test(t) && /2 fiches de mois supprimés après archivage ne seront pas remises/.test(t);
      }), true);
      await page.click('#cm-ok');
      await fin;
      const rf = await appels(page, 'restaurer_fiches');
      r.check('seule la fiche de juillet est envoyée', rf.length === 1 && rf[0].p_fiches.map(f => f.id).join() === '9101', true);
      erreurs = erreurs.concat(errors); await ctx.close();
    }
    {
      r.section('Refus du serveur affiché');
      const { ctx, page, errors } = await ouvrir({ refus: 'sauvegarde_requise' });
      await page.evaluate(() => preparerCarteArchive());
      await page.waitForTimeout(300);
      await page.evaluate(() => { [...document.querySelectorAll('#suppression-mois-zone button')].find(b => /Supprimer/.test(b.textContent)).click(); });
      await page.fill('#suppr-mois-saisie', 'SUPPRIMER');
      await page.click('#suppr-mois-ok');
      await page.waitForTimeout(500);
      r.check('motif lisible', await page.evaluate(() => window.__toasts.some(m => /Suppression refusée : faire une sauvegarde 💾 après l'archive/.test(m))), true);
      erreurs = erreurs.concat(errors); await ctx.close();
    }
    {
      r.section('Script SQL pas encore installé');
      const { ctx, page, errors } = await ouvrir({ absente: true });
      await page.evaluate(() => preparerCarteArchive());
      await page.waitForTimeout(300);
      r.check('message clair', /pas encore installée \(script SQL v13\.269\)/.test(await texteZone(page)), true);
      erreurs = erreurs.concat(errors); await ctx.close();
    }
    {
      r.section('L\'archive est notée par le serveur');
      const { ctx, page, errors } = await ouvrir();
      const dl = page.waitForEvent('download', { timeout: 60000 });
      await page.evaluate(() => telechargerArchiveMois('2026-06'));
      await dl;
      const na = await appels(page, 'noter_archive_mois');
      r.check('noter_archive_mois(mois, nombre, masqués)', na.length === 1 && na[0].p_mois === '2026-06'
        && na[0].p_nb_dossiers === 0 && na[0].p_masques_inclus === true, true);
      erreurs = erreurs.concat(errors); await ctx.close();
    }
    {
      r.section('QR d\'un compte rendu supprimé de la base');
      const { ctx, page, errors } = await openApp({ port: PORT, sansSession: true, cible: '/index.html?share=tok-juin-1',
        rpc: { get_public_result: [{ patient: { dossier: '0001-0626', nom: 'JUIN UN', date: '2026-06-03', archive: true, mois: '2026-06' },
                                     type: 'Archivé', types: [], saisi_par: null, created_at: null }] } });
      await page.waitForTimeout(800);
      const t = await page.evaluate(() => (document.getElementById('share-view') || {}).textContent || '');
      r.check('« Compte rendu authentique »', /Compte rendu authentique/.test(t), true);
      r.check('n°, nom et date', /0001-0626/.test(t) && /JUIN UN/.test(t) && /03\/06\/2026/.test(t), true);
      r.check('détail archivé (juin 2026)', /archivé \(juin 2026\)/.test(t) && /adressez-vous directement au laboratoire/.test(t), true);
      erreurs = erreurs.concat(errors); await ctx.close();
    }
    r.check('aucune erreur JS', erreurs.length, 0);
    if (erreurs.length) console.log(erreurs);
  } catch (e) {
    console.error(e);
    r.check('exécution sans exception', String(e && e.message || e), 'aucune');
  }
  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();
