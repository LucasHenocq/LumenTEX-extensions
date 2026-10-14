/// <reference path="../../lumen.d.ts" />
// Typst dans Lumen TeX : coloration et autocomplétion des fichiers .typ, et compilateur (le programme officiel
// typst, téléchargé au premier usage par la partie Node.js).

/** Coloration : markup (titres, gras, italique, listes), code (#fonction, mots-clés, chaînes), maths ($…$) */
function typstLanguage(cm) {
  const { StreamLanguage, HighlightStyle, syntaxHighlighting } = cm.language
  const { tags: t } = cm.highlight
  const KEYWORDS = new Set(['let', 'set', 'show', 'if', 'else', 'for', 'in', 'while', 'import', 'include', 'return', 'break', 'continue', 'context', 'as', 'none', 'auto', 'true', 'false', 'and', 'or', 'not'])

  const language = StreamLanguage.define({
    name: 'typst',
    startState: () => ({ math: false, comment: false, raw: false, code: 0 }),
    token(stream, s) {
      // Commentaire de bloc /* … */
      if (s.comment) {
        if (stream.skipTo('*/')) {
          stream.pos += 2
          s.comment = false
        } else stream.skipToEnd()
        return 'comment'
      }
      // Bloc de code brut ``` … ```
      if (s.raw) {
        if (stream.match('```')) s.raw = false
        else stream.skipToEnd()
        return 'string'
      }
      if (stream.match('//')) {
        stream.skipToEnd()
        return 'comment'
      }
      if (stream.match('/*')) {
        s.comment = true
        return 'comment'
      }
      if (stream.match('```')) {
        // Fermé sur la même ligne, ou bloc sur plusieurs lignes
        if (stream.skipTo('```')) stream.pos += 3
        else {
          s.raw = true
          stream.skipToEnd()
        }
        return 'string'
      }
      if (stream.match(/^`[^`]*`/)) return 'string'
      if (stream.match(/^\\./)) return 'escape'
      // Maths
      if (stream.peek() === '$') {
        stream.next()
        s.math = !s.math
        return 'bracket.special'
      }
      if (s.math) {
        if (stream.match(/^"[^"]*"/)) return 'string'
        if (stream.match(/^[a-zA-Z][a-zA-Z.]+/)) return 'operatorKeyword'
        if (stream.match(/^\d+(\.\d+)?/)) return 'number'
        stream.next()
        return 'string.special'
      }
      // Code : #fonction, #mot-clé, et ce qui suit dans les parenthèses
      if (stream.match(/^#[a-zA-Z_][\w-]*(\.[a-zA-Z_][\w-]*)*/)) {
        const name = stream.current().slice(1).split('.')[0]
        if (stream.peek() === '(') s.code = 1
        return KEYWORDS.has(name) ? 'keyword' : 'variableName.function'
      }
      if (s.code > 0) {
        if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return 'string'
        if (stream.match(/^-?\d+(\.\d+)?(pt|mm|cm|in|em|fr|%|deg|rad)?/)) return 'number'
        if (stream.match(/^[a-zA-Z_][\w-]*(?=\s*:)/)) return 'attributeValue'
        if (stream.match(/^[a-zA-Z_][\w-]*/)) return KEYWORDS.has(stream.current()) ? 'keyword' : 'variableName.function'
        const ch = stream.next()
        if (ch === '(') s.code++
        else if (ch === ')') s.code--
        return ch === '(' || ch === ')' || ch === '[' || ch === ']' ? 'brace' : null
      }
      // Markup en début de ligne : titres, listes
      if (stream.sol()) {
        if (stream.match(/^\s*=+\s/)) {
          stream.skipToEnd()
          return 'heading'
        }
        if (stream.match(/^\s*([-+]|\d+\.)\s/)) return 'keyword'
        if (stream.match(/^\s*\/\s/)) return 'keyword'
      }
      if (stream.match(/^<[\w:.-]+>/)) return 'labelName'
      if (stream.match(/^@[\w:.-]+/)) return 'labelName'
      if (stream.match(/^\*[^*\n]+\*/)) return 'strong'
      if (stream.match(/^_[^_\n]+_/)) return 'emphasis'
      if (stream.match(/^[\[\]]/)) return 'brace'
      stream.next()
      return null
    },
    languageData: { commentTokens: { line: '//', block: { open: '/*', close: '*/' } } }
  })

  // Mêmes couleurs que le LaTeX (variables du thème)
  const style = HighlightStyle.define([
    { tag: t.heading, color: 'var(--syn-heading)', fontWeight: '700' },
    { tag: t.keyword, color: 'var(--syn-keyword)', fontWeight: '600' },
    { tag: t.function(t.variableName), color: 'var(--syn-command)' },
    { tag: t.string, color: 'var(--syn-string)' },
    { tag: t.comment, color: 'var(--syn-comment)', fontStyle: 'italic' },
    { tag: t.labelName, color: 'var(--syn-label)' },
    { tag: t.number, color: 'var(--syn-number)' },
    { tag: t.escape, color: 'var(--syn-escape)' },
    { tag: t.attributeValue, color: 'var(--syn-opt)' },
    { tag: t.brace, color: 'var(--syn-brace)' },
    { tag: t.special(t.bracket), color: 'var(--syn-math-delim)', fontWeight: '600' },
    { tag: t.special(t.string), color: 'var(--syn-math)' },
    { tag: t.operatorKeyword, color: 'var(--syn-math-cmd)' },
    { tag: t.strong, fontWeight: '700', color: 'var(--text)' },
    { tag: t.emphasis, fontStyle: 'italic', color: 'var(--text)' }
  ])
  return [language, syntaxHighlighting(style)]
}

/** Fonctions proposées après « # » : gabarit (champs ${1:…}) et description */
const FUNCTIONS = [
  ['set', 'set ${1:text}(${2:lang: "fr"})', 'Règle de style pour la suite du document'],
  ['show', 'show ${1:heading}: ${2:it => it}', 'Transforme l’affichage d’un élément'],
  ['let', 'let ${1:nom} = ${2:valeur}', 'Définit une variable ou une fonction'],
  ['import', 'import "${1:fichier.typ}": ${2:*}', 'Importe un fichier ou un paquet'],
  ['include', 'include "${1:chapitre.typ}"', 'Insère un autre fichier'],
  ['if', 'if ${1:condition} [\n  ${2}\n] else [\n  ${3}\n]', 'Condition'],
  ['for', 'for ${1:x} in ${2:liste} [\n  ${3}\n]', 'Boucle'],
  ['page', 'set page(paper: "${1:a4}", margin: ${2:2.5cm})', 'Format de page et marges'],
  ['text', 'set text(lang: "${1:fr}", size: ${2:11pt})', 'Langue, police, taille du texte'],
  ['par', 'set par(justify: ${1:true})', 'Paragraphes (justification, interligne)'],
  ['heading', 'set heading(numbering: "${1:1.1}")', 'Numérotation des titres'],
  ['outline', 'outline()', 'Table des matières'],
  ['figure', 'figure(\n  image("${1:image.png}", width: ${2:80%}),\n  caption: [${3:Légende}],\n) <${4:fig:nom}>', 'Figure avec légende'],
  ['image', 'image("${1:image.png}", width: ${2:80%})', 'Image'],
  ['table', 'table(\n  columns: ${1:3},\n  [${2:a}], [${3:b}], [${4:c}],\n)', 'Tableau'],
  ['grid', 'grid(\n  columns: (${1:1fr, 1fr}),\n  gutter: ${2:1em},\n  [${3}], [${4}],\n)', 'Grille de mise en page'],
  ['align', 'align(${1:center})[${2}]', 'Alignement'],
  ['box', 'box(${1})[${2}]', 'Boîte en ligne'],
  ['block', 'block(${1})[${2}]', 'Bloc'],
  ['v', 'v(${1:1em})', 'Espace vertical'],
  ['h', 'h(${1:1em})', 'Espace horizontal'],
  ['pagebreak', 'pagebreak()', 'Saut de page'],
  ['link', 'link("${1:https://}")[${2:texte}]', 'Lien'],
  ['footnote', 'footnote[${1:note}]', 'Note de bas de page'],
  ['cite', 'cite(<${1:clé}>)', 'Citation bibliographique'],
  ['bibliography', 'bibliography("${1:refs.bib}")', 'Bibliographie (fichier .bib ou .yml)'],
  ['emph', 'emph[${1}]', 'Italique'],
  ['strong', 'strong[${1}]', 'Gras'],
  ['underline', 'underline[${1}]', 'Souligné'],
  ['highlight', 'highlight[${1}]', 'Surligné'],
  ['raw', 'raw("${1}", lang: "${2:python}")', 'Code brut'],
  ['lorem', 'lorem(${1:30})', 'Texte de remplissage'],
  ['datetime', 'datetime.today().display()', 'Date du jour'],
  ['counter', 'counter(${1:page}).display()', 'Compteur (pages, figures…)'],
  ['numbering', 'numbering("${1:1}", ${2:1})', 'Numérotation']
]

/** Après « # » : fonctions ; en maths : quelques fonctions courantes */
const MATH = [
  ['frac', 'frac(${1:a}, ${2:b})', 'Fraction'],
  ['sqrt', 'sqrt(${1:x})', 'Racine carrée'],
  ['root', 'root(${1:n}, ${2:x})', 'Racine n-ième'],
  ['sum', 'sum_(${1:i=1})^${2:n}', 'Somme'],
  ['product', 'product_(${1:i=1})^${2:n}', 'Produit'],
  ['integral', 'integral_${1:a}^${2:b} ${3:f(x)} dif x', 'Intégrale'],
  ['lim', 'lim_(${1:x -> oo})', 'Limite'],
  ['vec', 'vec(${1:x}, ${2:y})', 'Vecteur colonne'],
  ['mat', 'mat(\n  ${1:a}, ${2:b};\n  ${3:c}, ${4:d};\n)', 'Matrice'],
  ['cases', 'cases(\n  ${1:a} &"si" ${2:x > 0},\n  ${3:b} &"sinon",\n)', 'Système / cas'],
  ['abs', 'abs(${1:x})', 'Valeur absolue'],
  ['norm', 'norm(${1:x})', 'Norme'],
  ['binom', 'binom(${1:n}, ${2:k})', 'Coefficient binomial'],
  ['overline', 'overline(${1:x})', 'Barre au-dessus'],
  ['hat', 'hat(${1:x})', 'Chapeau'],
  ['arrow', 'arrow(${1:u})', 'Flèche (vecteur)'],
  ['bb', 'bb(${1:R})', 'Lettres doubles (ℝ, ℕ…)'],
  ['cal', 'cal(${1:A})', 'Calligraphie']
]

/** @param {Lumen} lumen */
export async function activate(lumen) {
  const cm = lumen.codemirror
  await lumen.languages.register({ id: 'typst', name: 'Typst', extensions: ['.typ'], editor: typstLanguage(cm) })

  await lumen.completion.register({
    languages: ['typst'],
    match: '#[a-zA-Z.]*',
    provide: ({ word }) =>
      FUNCTIONS.filter(([n]) => ('#' + n).startsWith(word)).map(([n, tpl, info]) => ({ label: '#' + n, snippet: '#' + tpl, detail: 'Typst', info }))
  })
  await lumen.completion.register({
    languages: ['typst'],
    match: '[a-z]{2,}',
    provide: ({ word, line }) => {
      // En maths seulement : nombre impair de « $ » avant le curseur sur la ligne
      if ((line.match(/\$/g) ?? []).length % 2 === 0) return []
      return MATH.filter(([n]) => n.startsWith(word)).map(([n, tpl, info]) => ({ label: n, snippet: tpl, detail: 'maths', info }))
    }
  })

  // Téléchargement de Typst : progression dans la barre d'état
  lumen.node.on('progression', (text) => lumen.compile.progress(text))

  await lumen.compilers.register({
    id: 'typst',
    name: 'Typst',
    language: 'typst',
    check: async () => lumen.node.call('verifier', await lumen.settings.get('chemin')),
    compile: async ({ root, mainFile, outDir }) => lumen.node.call('compiler', { exe: await lumen.settings.get('chemin'), root, mainFile, outDir }),
    cancel: () => lumen.node.call('arreter')
  })
}
