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

## Essayer une extension

Dans Lumen TeX : **Réglages → Extensions → Installer depuis un dossier…**, puis choisissez le dossier qui contient `lumen-extension.json`. Après une modification, installez-la de nouveau.

## Proposer une extension

1. Faites un fork de ce dépôt.
2. Ajoutez votre dossier dans `extensions/`.
3. Ouvrez une pull request.

Chaque extension est relue avant d'entrer dans le catalogue. Les textes affichés (nom, description, descriptions des bouts de LaTeX) sont en français.
