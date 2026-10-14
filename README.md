# Extensions de Lumen TeX

Le catalogue officiel des extensions de [Lumen TeX](https://github.com/LucasHenocq/LumenTEX). Lumen TeX le lit directement depuis ce dépôt : une extension ajoutée ici apparaît dans **Réglages → Extensions**, et s'installe en un clic.

Les extensions n'ont pas de code. Elles ajoutent :

- des **bouts de LaTeX** à l'autocomplétion (même format que les snippets de VS Code) ;
- des **environnements**, proposés après `\begin{` ;
- des **groupes de symboles** dans le panneau Σ ;
- des **modèles de projet**, dans la fenêtre « Nouveau projet » ;
- des **thèmes de couleurs**, dans Réglages → Apparence.

Il faut Lumen TeX 1.4.0 ou plus récent.

## Organisation

Une extension par dossier, dans `extensions/` :

```
extensions/
  tikz/
    lumen-extension.json
  mon-extension/
    lumen-extension.json
    snippets.json          (facultatif)
    modeles/rapport/...    (facultatif, fichiers d'un modèle)
```

## Le fichier `lumen-extension.json`

```json
{
  "id": "mon-extension",
  "name": "Mon extension",
  "version": "1.0.0",
  "author": "Votre nom",
  "description": "Ce qu'elle apporte, en une phrase.",
  "lumen": "1.4.0",
  "snippets": { },
  "environments": [ ],
  "symbols": [ ],
  "templates": [ ],
  "themes": [ ]
}
```

| Champ | Rôle |
| --- | --- |
| `id` | Identifiant unique : minuscules, chiffres et tirets. Le même que le nom du dossier. |
| `name`, `description`, `author` | Affichés dans Réglages → Extensions. |
| `version` | Numéro `x.y.z`. Augmentez-le à chaque modification : Lumen TeX propose alors la mise à jour. |
| `lumen` | Version minimale de Lumen TeX (facultatif). Une version plus ancienne ne propose pas l'extension. |

Toutes les parties sont facultatives.

### Bouts de LaTeX (`snippets`)

Le format des snippets de VS Code, directement dans le manifeste ou dans un fichier à part (`"snippets": "snippets.json"`). Un fichier de snippets LaTeX de VS Code sert donc tel quel, s'il ne contient pas de commentaires.

```json
"snippets": {
  "Figure TikZ": {
    "prefix": "tikzfig",
    "body": ["\\begin{figure}[${1:htbp}]", "\t\\centering", "\t$0", "\\end{figure}"],
    "description": "Figure centrée"
  }
}
```

- `prefix` : ce qu'on tape pour que l'autocomplétion le propose (une chaîne, ou une liste de chaînes). Il peut commencer par `\`.
- `body` : le texte inséré, en une chaîne ou une liste de lignes. `$1`, `${1:texte}` sont les champs qu'on remplit avec Tab, `$0` est la position finale du curseur.
- Dans le JSON, une barre oblique inverse s'écrit `\\`. Un `$` de LaTeX s'écrit `\\$` (par exemple `\\$x\\$` pour `$x$`).

### Environnements (`environments`)

```json
"environments": [
  { "name": "tikzpicture", "body": "$0", "description": "Dessin TikZ" }
]
```

Proposés après `\begin{`. Le `body` (même syntaxe que les snippets) est placé entre `\begin{…}` et `\end{…}`.

### Symboles (`symbols`)

```json
"symbols": [
  { "name": "Ensembles", "items": "\\mathbb{N} \\mathbb{Z} \\mathbb{Q} \\mathbb{R} \\mathbb{C}" }
]
```

Un groupe du panneau Σ : des commandes LaTeX séparées par des espaces (ou une liste). Chacune est affichée mise en forme et insérée telle quelle.

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

Des valeurs pour les variables de couleur de Lumen TeX, en clair (`light`) et/ou en sombre (`dark`). Seules des variables (`--nom`) sont acceptées, sans `url(…)`. L'extension [`themes`](extensions/themes/lumen-extension.json) donne la liste complète : fonds (`--bg`, `--panel`, `--editor-bg`…), texte (`--text`, `--text-muted`…), accent, et coloration du LaTeX (`--syn-command`, `--syn-env`, `--syn-math`…).

## Extensions avec code

Depuis Lumen TeX 1.5.0, une extension peut contenir du JavaScript : commandes, panneaux, autocomplétion, erreurs signalées dans l'éditeur, compilateurs, autres langages, échanges entre participants d'une session partagée…

### Vérifiée ou non

- **Catalogue (ce dépôt) = vérifiée.** Le code est relu avant d'entrer ici. L'extension fonctionne dans la fenêtre de Lumen TeX, avec tous les pouvoirs : CodeMirror directement, partie Node.js (programmes de l'ordinateur), sessions partagées.
- **Installée depuis un dossier = non vérifiée.** Elle fonctionne isolée : elle ne voit que le projet ouvert, Internet seulement vers les sites qu'elle déclare, pas de partie Node.js, et elle est arrêtée pendant les sessions partagées.
- **Mode développeur** (Réglages → Extensions) : toutes les extensions fonctionnent comme si elles étaient vérifiées, pour développer et tester la vôtre. Les autres participants d'une session en sont prévenus.

Le même code fonctionne dans les deux cas : l'objet `lumen` est le même, et toutes ses fonctions s'attendent avec `await`.

### Manifeste

```json
{
  "id": "mon-extension",
  "name": "Mon extension",
  "version": "1.0.0",
  "lumen": "1.5.0",
  "main": "main.js",
  "node": "node.js",
  "icon": "icone.svg",
  "permissions": {
    "network": ["api.exemple.org"],
    "microphone": false,
    "camera": false,
    "session": true
  },
  "settings": [
    { "id": "langue", "label": "Langue", "type": "select", "options": ["fr", "en"], "default": "fr" }
  ],
  "languages": [{ "id": "typst", "name": "Typst", "extensions": [".typ"] }]
}
```

| Champ | Rôle |
| --- | --- |
| `main` | Module JavaScript (`.js` ou `.mjs`) qui exporte `activate(lumen)`, et éventuellement `deactivate()`. |
| `node` | Partie Node.js facultative (extensions vérifiées) : exporte `activate(lumen)`, avec `lumen.handle` et `lumen.send`. |
| `icon` | Icône SVG de son panneau (une seule couleur : elle prend celle de l'interface). |
| `permissions` | Ce que l'extension utilise, montré à l'installation. `session` est nécessaire pour échanger entre participants. |
| `settings` | Réglages affichés par Lumen TeX (`toggle`, `text`, `number`, `select`), lus avec `lumen.settings.get`. |
| `languages` | Langages reconnus (extensions de fichier), pour qu'un compilateur puisse les compiler. |

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

Le fichier [`lumen.d.ts`](lumen.d.ts) décrit tout l'objet `lumen` : avec la ligne `/// <reference …>`, VS Code propose l'autocomplétion. Le dossier [`exemples/`](exemples) contient des extensions complètes (elles ne sont pas dans le catalogue) :

- `bonjour` : commandes, panneau, barre d'état, autocomplétion, erreurs, réglages, stockage ;
- `langage-demo` : un langage inventé et son compilateur, sans programme externe (le PDF est fabriqué en JavaScript) ;
- `compilateur-node` : un compilateur LaTeX qui lance un programme depuis la partie Node.js (comme le ferait une extension pdfLaTeX).

### Ce que peut faire l'objet `lumen`

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

Le panneau d'une extension a les styles de Lumen TeX : classes `btn`, `btn primary`, `btn small`, `input`, `muted`, et les variables de couleur (`var(--accent)`…), qui suivent le thème.

### Compilateurs et langages

Le compilateur d'un langage reçoit `{ root, mainFile, outDir }` et rend le PDF (octets ou chemin), son journal et ses erreurs. Tectonic, le compilateur LaTeX de Lumen TeX, passe par la même porte. Quand plusieurs compilateurs sont disponibles pour le langage du fichier principal, un menu apparaît à côté de « Compiler ». Un compilateur qui fournit `check()` peut se déclarer indisponible, avec la raison affichée à l'utilisateur.

### Relecture d'une extension avec code

Avant d'accepter une pull request, vérifier que :

- le code fait ce que dit la description, et rien d'autre ;
- les sites de `permissions.network` sont justifiés, et rien n'est envoyé sans que l'utilisateur le sache ;
- la partie Node.js, s'il y en a une, ne lance que ce qui est annoncé ;
- il n'y a pas de code minifié ou téléchargé à l'exécution (tout doit être lisible ici).

## Essayer une extension

Dans Lumen TeX : **Réglages → Extensions → Installer depuis un dossier…**, puis choisissez le dossier qui contient `lumen-extension.json`. Après une modification, installez-la de nouveau.

## Proposer une extension

1. Faites un fork de ce dépôt.
2. Ajoutez votre dossier dans `extensions/`.
3. Ouvrez une pull request.

Chaque extension est relue avant d'entrer dans le catalogue. Les textes affichés (nom, description, descriptions des bouts de LaTeX) sont en français.
