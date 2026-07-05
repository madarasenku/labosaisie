# LaboSaisie — structure du projet (version découpée)

Le fichier unique `index.html` a été séparé en :
- `index.html` — structure HTML (formulaires, écrans) + liens vers CSS/JS
- `styles.css` — toute la mise en forme
- `js/00-background.js` … `js/06-auth-init.js` — la logique, découpée par domaine

Voir `MANIFESTE.md` pour savoir quelle fonction est dans quel fichier.

## Déploiement (GitHub Pages)
Mettez à la racine du dépôt : `index.html`, `styles.css`, et le dossier `js/`
(en conservant les noms). C’est tout — aucune étape de build.

## Règles importantes
1. **Ne changez pas l’ordre** des balises `<script src>` dans `index.html` :
   les modules dépendent des définitions des modules précédents.
2. Testez en local via un petit serveur (`python -m http.server`) et **pas**
   en double-cliquant le fichier (les `file://` bloquent certaines fonctions).
3. Le contenu est **identique** à l’ancien `index.html` monolithique — ce
   découpage ne change aucun comportement, il facilite seulement la maintenance.

## Pour corriger une partie
1. Ouvrez `MANIFESTE.md`, cherchez la fonction concernée.
2. Éditez uniquement le fichier `js/…` correspondant.
3. Redéployez ce fichier (et `index.html` seulement si vous avez touché au HTML).
