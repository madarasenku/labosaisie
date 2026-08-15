# Comparaison — `labosaisie-v2` (v13.102) vs le dépôt principal (v13.94)

Établi le 15 août 2026. Les deux branches partent du **même ancêtre**,
`17d7021` (v13.92). Elles ont ensuite divergé pendant quatre jours, chacune
dans sa session.

**Aucune des deux n'est un sur-ensemble de l'autre.** C'est le point
important : fusionner dans un sens perdrait du travail.

---

## 1. Ce que les deux ont fait pareil

L'autre session est partie de la passation, et a refait — de façon
indépendante mais **convergente** — exactement le socle du site secondaire :

| | Elle (v13.93) | Moi (branche locale) |
|---|---|---|
| Base Supabase distincte `ftwsxdivwoczsreiohok` | ✅ | ✅ |
| Bandeau orange en dur dans le HTML | ✅ | ✅ |
| Clés `localStorage` préfixées `v2_` | ✅ | ✅ |
| `soignant.html` + `get_mes_prescriptions` / `get_prescription_full` | ✅ | ✅ |

Les **fonctions serveur sont les miennes** : la base `ftwsxdivwoczsreiohok`
est partagée entre les deux sessions, l'autre a donc hérité de mes 15
migrations et a construit par-dessus. Il n'y a **aucun conflit côté base**.

👉 Conclusion : ma version du portail n'apporte rien qu'elle n'ait déjà. La
sienne est plus aboutie (voir §2). **Ma branche locale peut être jetée.**

---

## 2. Ce qu'elle a et que je n'ai pas (10 commits, uniquement sur v2)

**Portail du soignant, en mieux (v13.94)** — les résultats s'affichent
directement dans la carte au lieu d'une fenêtre modale, une barre de stats
donne « X patients, Y en cours, Z rendus », les dossiers en cours passent en
premier, et les cartes ont une bordure de couleur. 310 lignes contre 271 chez
moi, pour un écran nettement plus lisible.

**Masquage après rendu (v13.97, côté base)** — un dossier quitte la liste du
soignant **2 heures après avoir été rendu**, via un `rendu_at` horodaté. Les
dossiers rendus avant cette version restent visibles, faute d'horodatage.
C'est une décision de fond que je n'avais pas prise.

**Saisie rapide (v13.95)** — Entrée passe au champ suivant, le contenu se
sélectionne au focus des champs numériques.

**Rôle prescripteur dans les menus (v13.96)** — création et modification de
compte proposent enfin « Prescripteur (portail soignant) ». Chez moi, le rôle
existait en base mais **aucun écran ne permettait de créer le compte** : il
fallait passer par SQL. C'est un vrai manque de ma version.

**Cohérence des listes d'examens (v13.99 → v13.101)** — le plus profond des
dix. Les identifiants de `examFieldIds` divergeaient des champs réels : côté
sérologie, **aucun champ n'était réellement verrouillé**, et cocher un test
en ouvrait douze. Puis l'éditeur des valeurs de référence a cessé de tenir sa
propre copie d'environ 90 paramètres pour les **générer** depuis les listes
canoniques — une seule source de vérité au lieu de deux qui dérivent.

**Sérologie Qual/Quant (v13.102)** — chaque test se saisit au choix en
qualitatif (Positif/Négatif) ou en quantitatif (valeur chiffrée), plus les
examens Ac anti-HBs et anti-HBc.

---

## 3. Ce que j'ai et qu'elle n'a pas (v13.94 du dépôt principal)

Ces deux corrections sont **poussées sur `labosaisie` (main)** et **absentes
de v2** :

**Un dossier non encaissé ne s'imprime ni ne s'exporte.** Un garde unique,
`sortieAutorisee()`, appelé par `printRecord`, `exportPDF` et `exportRecord`.
L'administrateur en est exempté (gratuités, duplicatas en cas de litige).
→ `sortieAutorisee` est **absent des trois fichiers** côté v2.

**Les unités personnalisées vont jusqu'au papier.** Cinq endroits lisaient le
catalogue d'origine au lieu de `getUnit()` : la feuille imprimée, le PDF et
une partie de l'Excel. Une unité corrigée en Administration changeait à
l'écran mais pas sur le document remis au patient.
→ Côté v2, `examExpectedRows` lit toujours `p.unit`.

---

## 4. ⚠️ LA CONTRADICTION À TRANCHER

Les deux sessions sont allées **en sens opposé** sur le verrou de paiement, à
deux jours d'intervalle.

**Le 13 août (v13.97, puis demi-tour en v13.98)** — l'autre session a d'abord
étendu le verrou à tous les onglets de saisie, puis l'a **retiré le jour
même** : « un examen coché est immédiatement remplissable, quel que soit le
statut de paiement ». Sa justification : *plus proche du terrain*. La sécurité
reste au moment de l'**enregistrement** (`_saveRecordImpl` renvoie à la caisse
si le dossier est impayé).

**Le 15 août (v13.94)** — tu m'as demandé de **renforcer** le verrou, et j'ai
bloqué l'impression, le PDF et l'Excel d'un dossier non encaissé.

Les deux ne se contredisent pas frontalement — l'une porte sur la **saisie**,
l'autre sur la **sortie** — mais elles traduisent deux lectures différentes de
la même règle. La combinaison la plus cohérente serait sans doute :

> saisir librement dès que l'examen est coché (leur v13.98, plus fluide pour
> l'agent), enregistrer seulement si payé (déjà le cas des deux côtés), et
> **ne rien laisser sortir** — ni papier, ni PDF, ni Excel — tant que ce n'est
> pas encaissé (ma v13.94).

Mais c'est à toi de trancher, pas à moi : c'est une règle de travail du
laboratoire, pas une question technique.

---

## 5. Où en sont les tests

| | v2 (elle) | principal (moi) |
|---|---|---|
| Fichiers | 20 | 18 |
| Fichiers propres à chacun | `coherence-listes-examens`, `coherence-references`, `saisie-coche-remplissable`, `serologie-qual-quant` | `verrou-paiement-unites` |

Les deux suites sont vertes, chacune sur sa branche.

---

## 6. Ce que je recommande

1. **Jeter ma branche v2 locale.** Elle est redondante et moins avancée. Le
   dépôt `labosaisie-v2` reste tel qu'il est, à la v13.102.
2. **Reporter mes deux corrections (§3) sur v2** — elles sont petites,
   indépendantes, et v2 en a besoin.
3. **Trancher la question du §4**, puis aligner les deux dépôts sur la règle
   retenue.
4. **Ne plus faire travailler deux sessions sur le même dépôt en parallèle**,
   ou alors sur des branches séparées. La divergence de ces quatre jours a
   failli coûter douze commits.
