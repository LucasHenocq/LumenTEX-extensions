# Extensions de Lumen TeX

Le catalogue officiel des extensions de [Lumen TeX](https://github.com/LucasHenocq/LumenTEX), l'éditeur LaTeX gratuit et autonome. Lumen TeX lit ce dépôt directement : une extension ajoutée ici apparaît dans l'application et s'installe en un clic.

## Les extensions du catalogue

| Extension | Ce qu'elle apporte |
| --- | --- |
| **Typst** | Écrire en [Typst](https://typst.app) : coloration, autocomplétion, compilation, erreurs dans l'éditeur, symboles, modèle de document. Le programme Typst se télécharge à la première compilation. |
| **LanguageTool** | Fautes d'orthographe, de grammaire et de style soulignées dans les documents LaTeX et Typst, avec les corrections proposées. Le texte est envoyé au service LanguageTool, ou à votre propre serveur. |
| **LaTeX classique** | Compiler avec pdfLaTeX, XeLaTeX, LuaLaTeX ou Latexmk, de la distribution TeX installée sur l'ordinateur (TeX Live, MiKTeX, MacTeX), bibliographie biber ou BibTeX comprise. |
| **TikZ et pgfplots** | Figures, repères, courbes et graphes de fonctions tout prêts, dans l'autocomplétion. |
| **Thèmes Nord et Solarized** | Deux thèmes de couleurs, en clair et en sombre. |

## Installer une extension

Dans Lumen TeX, ouvrez le panneau Extensions (icône de pièce de puzzle dans la barre de gauche, ou Réglages → Extensions), puis « Installer ». Quand une nouvelle version sort, un bouton « Mettre à jour » apparaît sur sa carte.

Chaque extension du catalogue est **relue avant d'y entrer** : sa carte porte le badge « Vérifiée ». Avant d'installer une extension qui contient du code, Lumen TeX montre ce qu'elle pourra faire (sites contactés, micro, programmes lancés…).

---

# Créer une extension

Une extension est un dossier qui contient un fichier `lumen-extension.json`. Elle peut se contenter d'apporter du contenu (bouts de LaTeX, symboles, modèles, thèmes), ou contenir du code JavaScript pour ajouter de vraies fonctions.

```
mon-extension/
  lumen-extension.json     le manifeste (obligatoire)
  main.js                  le code, s'il y en a
  node.js                  la partie Node.js, s'il y en a une
  snippets.json            des bouts de LaTeX à part (facultatif)
  modeles/rapport/...      les fichiers d'un modèle de projet (facultatif)
```

## Le manifeste

```json
{
  "id": "mon-extension",
  "name": "Mon extension",
  "version": "1.0.0",
  "author": "Votre nom",
  "description": "Ce qu'elle apporte, en une phrase.",
  "lumen": "1.5.2"
}
```

| Champ | Rôle |
| --- | --- |
| `id` | Identifiant unique : minuscules, chiffres et tirets. Le même que le nom du dossier. |
| `name`, `description`, `author` | Affichés sur la carte de l'extension. |
| `version` | Numéro `x.y.z`. Augmentez-le à chaque modification : Lumen TeX propose alors la mise à jour. |
| `lumen` | Version minimale de Lumen TeX (facultatif). Une version plus ancienne affiche l'extension sans permettre de l'installer. Gardez-la la plus basse possible. |

Tout le reste est facultatif, et se combine librement.

## Contenu, sans code

### Bouts de LaTeX (`snippets`)

Le format des snippets de VS Code, dans le manifeste ou dans un fichier à part (`"snippets": "snippets.json"`). Un fichier de snippets LaTeX de VS Code sert donc tel quel, s'il ne contient pas de commentaires.

```json
"snippets": {
  "Figure TikZ": {
    "prefix": "tikzfig",
    "body": ["\\begin{figure}[${1:htbp}]", "\t\\centering", "\t$0", "\\end{figure}"],
    "description": "Figure centrée"
  }
}
```

- `prefix` : ce qu'on tape pour que l'autocomplétion le propose (une chaîne, ou une liste). Il peut commencer par `\`.
- `body` : le texte inséré, en une chaîne ou une liste de lignes. `$1` et `${1:texte}` sont les champs qu'on remplit avec Tab, `$0` la position finale du curseur.
- Dans le JSON, une barre oblique inverse s'écrit `\\`, et un `$` de LaTeX `\\$` (`\\$x\\$` pour `$x$`).

### Environnements (`environments`)

```json
"environments": [
  { "name": "tikzpicture", "body": "$0", "description": "Dessin TikZ" }
]
```

Proposés après `\begin{`. Le `body` (même syntaxe que les snippets) est placé entre `\begin{…}` et `\end{…}`.

### Symboles (`symbols`)

Un groupe du panneau Σ. Pour LaTeX, des commandes séparées par des espaces (ou une liste), affichées mises en forme et insérées telles quelles :

```json
"symbols": [
  { "name": "Ensembles", "items": "\\mathbb{N} \\mathbb{Z} \\mathbb{Q} \\mathbb{R} \\mathbb{C}" }
]
```

Pour un autre langage, indiquez-le avec `language` et donnez une liste de « caractère nom » : le caractère est affiché et inséré, le nom sert à la recherche et s'affiche au survol. Le panneau Σ propose les groupes du langage du fichier ouvert.

```json
"symbols": [
  { "name": "Grec", "language": "typst", "items": ["α alpha", "β beta", "γ gamma"] }
]
```

### Modèles de projet (`templates`)

```json
"templates": [
  { "name": "Fiche de révision", "description": "Une page recto-verso", "folder": "modeles/fiche" }
]
```

Tous les fichiers du dossier `folder` sont copiés dans le nouveau projet, images comprises. Dans les fichiers texte, `{{titre}}` et `{{auteur}}` sont remplacés par ce qu'on saisit dans la fenêtre « Nouveau projet ».

### Thèmes de couleurs (`themes`)

```json
"themes": [
  {
    "name": "Nord",
    "light": { "--accent": "#5e81ac", "--bg": "#e5e9f0" },
    "dark": { "--accent": "#88c0d0", "--bg": "#242933" }
  }
]
```

Des valeurs pour les variables de couleur de Lumen TeX, en clair (`light`) et/ou en sombre (`dark`). Seules des variables (`--nom`) sont acceptées, sans `url(…)`. L'extension [`themes`](extensions/themes/lumen-extension.json) donne la liste complète : fonds (`--bg`, `--panel`, `--editor-bg`…), texte (`--text`, `--text-muted`…), accent, et coloration du code (`--syn-command`, `--syn-env`, `--syn-math`…).

### Langages (`languages`)

```json
"languages": [{ "id": "typst", "name": "Typst", "extensions": [".typ"], "icon": "fichier-typ.svg" }]
```

Les fichiers de ces extensions s'ouvrent dans l'éditeur, sont cherchés par la recherche, se modifient à plusieurs en session, et peuvent devenir le fichier principal si un compilateur sait les compiler. `icon` : l'icône SVG de ces fichiers dans l'arbre et sur les onglets.

## Avec du code

Une extension peut aussi contenir du JavaScript : commandes, panneaux, autocomplétion, erreurs signalées dans l'éditeur, compilateurs, coloration d'un langage, échanges entre les participants d'une session…

### Vérifiée ou isolée

- **Du catalogue = vérifiée.** Son code a été relu. Elle fonctionne dans la fenêtre de Lumen TeX, avec tous les pouvoirs : CodeMirror directement, partie Node.js (programmes de l'ordinateur), sessions partagées.
- **Installée depuis un dossier = non vérifiée.** Elle fonctionne isolée : elle ne voit que le projet ouvert, n'accède qu'aux sites qu'elle déclare, n'a pas de partie Node.js, et elle est arrêtée pendant les sessions partagées.
- **Mode développeur** (en bas du panneau Extensions) : toutes les extensions fonctionnent comme si elles étaient vérifiées, pour développer et tester la vôtre. Les autres participants d'une session en sont prévenus.

Le même code fonctionne dans les deux cas : l'objet `lumen` est le même, et toutes ses fonctions s'attendent avec `await`.

### Champs du manifeste pour le code

```json
{
  "main": "main.js",
  "node": "node.js",
  "icon": "icone.svg",
  "permissions": { "network": ["api.exemple.org"], "microphone": false, "camera": false, "session": true },
  "settings": [{ "id": "langue", "label": "Langue", "type": "select", "options": ["fr", "en"], "default": "fr" }]
}
```

| Champ | Rôle |
| --- | --- |
| `main` | Module JavaScript (`.js` ou `.mjs`) qui exporte `activate(lumen)`, et éventuellement `deactivate()`. |
| `node` | Partie Node.js (extensions vérifiées) : exporte `activate(lumen)` et répond aux appels avec `lumen.handle`. Elle a son dossier de données, `lumen.dataDir`, effacé à la désinstallation. |
| `icon` | Icône SVG du panneau de l'extension, d'une seule couleur (elle prend celle de l'interface). |
| `permissions` | Ce que l'extension utilise, montré avant l'installation. `session` est nécessaire pour échanger entre participants. |
| `settings` | Réglages affichés par Lumen TeX (`toggle`, `text`, `number`, `select`), lus avec `lumen.settings.get`. |

### Exemple

```js
/// <reference path="../../lumen.d.ts" />
/** @param {Lumen} lumen */
export async function activate(lumen) {
  await lumen.commands.register({
    id: 'salut',
    label: 'Dire bonjour',
    shortcut: 'Mod-Alt-b',
    run: () => lumen.ui.notify('Bonjour !', 'success')
  })
  await lumen.ui.addPanel({ id: 'panneau', title: 'Mon panneau' }, (el) => {
    el.innerHTML = '<button class="btn primary">Compter les fichiers</button>'
    el.querySelector('button').onclick = async () => lumen.ui.notify(`${(await lumen.project.list()).length} fichiers`)
  })
}
```

### L'objet `lumen`

| Partie | Rôle |
| --- | --- |
| `commands` | Commandes de la palette, raccourcis clavier |
| `ui` | Panneau, barre d'état, notifications, questions (`confirm`, `prompt`) |
| `editor` | Fichier actif, texte, sélection, insertion, modifications |
| `completion` | Propositions d'autocomplétion, pour certains langages |
| `diagnostics` | Problèmes affichés dans le panneau Problèmes et soulignés dans l'éditeur |
| `project` | Lire, écrire, lister les fichiers du projet ouvert |
| `compile` | Lancer et suivre la compilation |
| `compilers`, `languages` | Ajouter un compilateur ou un langage |
| `session` | Participants, messages et données (JSON ou octets) vers la même extension chez les autres |
| `settings`, `storage` | Réglages déclarés, petites données gardées |
| `fetch` | Internet |
| `node`, `codemirror`, `editor.addExtension` | Extensions vérifiées seulement |

Le fichier [`lumen.d.ts`](lumen.d.ts) décrit tout l'objet `lumen` : avec la ligne `/// <reference …>`, VS Code propose l'autocomplétion. Le panneau d'une extension a les styles de Lumen TeX : classes `btn`, `btn primary`, `btn small`, `input`, `muted`, et les variables de couleur (`var(--accent)`…), qui suivent le thème.

**Compilateurs.** Le compilateur d'un langage reçoit `{ root, mainFile, outDir }` et rend le PDF (octets ou chemin), son journal et ses erreurs. Tectonic, le compilateur LaTeX de Lumen TeX, passe par la même porte. Quand plusieurs compilateurs sont disponibles pour le langage du fichier principal, un menu apparaît à côté de « Compiler ». Un compilateur qui fournit `check()` peut se déclarer indisponible, avec la raison affichée à l'utilisateur.

### Exemples complets

Le dossier [`exemples/`](exemples) contient des extensions à lire et à copier (elles ne sont pas dans le catalogue) :

- `bonjour` : commandes, panneau, barre d'état, autocomplétion, erreurs, réglages, stockage ;
- `langage-demo` : un langage inventé et son compilateur, sans programme externe (le PDF est fabriqué en JavaScript) ;
- `compilateur-node` : un compilateur LaTeX qui lance un programme depuis la partie Node.js.

L'extension [`typst`](extensions/typst) est un exemple réel et complet : coloration, autocomplétion, compilateur, symboles, téléchargement d'un programme.

## Essayer son extension

Dans Lumen TeX, panneau Extensions → **Installer depuis un dossier…**, puis choisissez le dossier qui contient `lumen-extension.json`. Après une modification, installez-la de nouveau. En mode développeur, **Relier un dossier…** évite de réinstaller : « Recharger les extensions » prend vos modifications, et « Outils de développement » aide à trouver les erreurs. Les messages et erreurs de votre extension s'affichent dans le journal (Ctrl+J), onglet « Extensions ».

## Proposer une extension

1. Faites un fork de ce dépôt.
2. Ajoutez votre dossier dans `extensions/`.
3. Ouvrez une pull request.

Les textes affichés (nom, description, réglages, commandes) sont en français.

### Ce qui est vérifié avant d'accepter

- le code fait ce que dit la description, et rien d'autre ;
- les sites de `permissions.network` sont justifiés, et rien n'est envoyé sans que l'utilisateur le sache ;
- la partie Node.js, s'il y en a une, ne lance que ce qui est annoncé, et ne télécharge de programme que depuis sa source officielle ;
- tout le code est lisible ici : pas de code minifié, ni de code JavaScript téléchargé à l'exécution.
