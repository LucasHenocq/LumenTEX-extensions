// Découpe d'un texte LaTeX ou Typst en parties « texte » (vérifiées par LanguageTool) et « balisage » (commandes,
// formules, commentaires), au format « annotation » de LanguageTool. Une formule est remplacée par un mot neutre pour
// que la phrase reste grammaticale ; les positions renvoyées par LanguageTool restent celles du texte d'origine.

const MATH = 'x'

/** Commandes LaTeX dont les arguments ne sont pas du texte : tout est du balisage */
const NON_TEXT = new Set([
  'label', 'ref', 'eqref', 'pageref', 'autoref', 'cref', 'Cref', 'vref', 'nameref', 'cite', 'citep', 'citet', 'parencite',
  'textcite', 'autocite', 'footcite', 'nocite', 'includegraphics', 'input', 'include', 'includeonly', 'usepackage',
  'RequirePackage', 'documentclass', 'bibliography', 'bibliographystyle', 'addbibresource', 'printbibliography', 'url',
  'begin', 'end', 'newcommand', 'renewcommand', 'providecommand', 'DeclareMathOperator', 'newenvironment',
  'renewenvironment', 'newtheorem', 'setlength', 'setcounter', 'addtocounter', 'vspace', 'hspace', 'graphicspath',
  'color', 'pagecolor', 'pagestyle', 'thispagestyle', 'numberwithin', 'hypersetup', 'geometry', 'definecolor',
  'tikz', 'usetikzlibrary', 'pgfplotsset', 'lstinputlisting', 'inputminted', 'bibitem', 'def', 'let', 'newlength',
  'selectlanguage', 'foreignlanguage', 'href', 'verb', 'si', 'SI', 'num', 'unit', 'qty'
])
/** Environnements LaTeX dont le contenu n'est pas vérifié */
const NON_TEXT_ENV = new Set([
  'equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'multline', 'multline*', 'eqnarray', 'eqnarray*',
  'math', 'displaymath', 'flalign', 'flalign*', 'alignat', 'alignat*', 'verbatim', 'verbatim*', 'lstlisting', 'minted',
  'tikzpicture', 'axis', 'comment', 'filecontents', 'filecontents*'
])
const MATH_ENV = /^(equation|align|gather|multline|eqnarray|math|displaymath|flalign|alignat)\*?$/

/** Parties fusionnées : texte avec texte, balisage avec balisage (interprétations mises bout à bout) */
function builder() {
  const parts = []
  return {
    text(s) {
      if (!s) return
      const last = parts[parts.length - 1]
      if (last && 'text' in last) last.text += s
      else parts.push({ text: s })
    },
    markup(s, as = '') {
      if (!s) return
      const last = parts[parts.length - 1]
      if (last && 'markup' in last) {
        last.markup += s
        last.interpretAs += as
      } else parts.push({ markup: s, interpretAs: as })
    },
    parts
  }
}

/** Fin d'un groupe {…} ou […] équilibré commençant à i (l'ouvrant), ou la fin du texte */
function closing(src, i, open, close) {
  let depth = 0
  for (let j = i; j < src.length; j++) {
    const c = src[j]
    if (c === '\\') {
      j++
      continue
    }
    if (c === open) depth++
    else if (c === close && --depth === 0) return j + 1
  }
  return src.length
}

export function latex(src) {
  const b = builder()
  let i = 0
  let text = ''
  const flush = () => {
    b.text(text)
    text = ''
  }
  const markup = (s, as = '') => {
    flush()
    b.markup(s, as)
  }
  while (i < src.length) {
    const c = src[i]
    if (c === '%') {
      const end = src.indexOf('\n', i)
      const stop = end < 0 ? src.length : end
      markup(src.slice(i, stop))
      i = stop
      continue
    }
    if (c === '$') {
      const dbl = src[i + 1] === '$'
      const close = src.indexOf(dbl ? '$$' : '$', i + (dbl ? 2 : 1))
      const stop = close < 0 ? src.length : close + (dbl ? 2 : 1)
      markup(src.slice(i, stop), MATH)
      i = stop
      continue
    }
    if (c === '~') {
      markup(c, ' ')
      i++
      continue
    }
    if (c === '{' || c === '}') {
      markup(c)
      i++
      continue
    }
    if (c === '\\') {
      const next = src[i + 1] ?? ''
      // \[ … \] et \( … \) : formules
      if (next === '[' || next === '(') {
        const close = src.indexOf(next === '[' ? '\\]' : '\\)', i + 2)
        const stop = close < 0 ? src.length : close + 2
        markup(src.slice(i, stop), MATH)
        i = stop
        continue
      }
      // \\ et caractères échappés (\%, \&, \_…)
      if (!/[a-zA-Z@]/.test(next)) {
        markup(src.slice(i, i + 2), /[\\,;: ]/.test(next) ? ' ' : /[%&_#$]/.test(next) ? next : '')
        i += 2
        continue
      }
      const m = /^\\([a-zA-Z@]+)\*?/.exec(src.slice(i))
      const name = m[1]
      let j = i + m[0].length
      if (name === 'begin' || name === 'end') {
        const env = /^\s*\{([^}]*)\}/.exec(src.slice(j))
        const envName = env ? env[1] : ''
        j += env ? env[0].length : 0
        if (name === 'begin' && NON_TEXT_ENV.has(envName)) {
          const endTag = `\\end{${envName}}`
          const k = src.indexOf(endTag, j)
          const stop = k < 0 ? src.length : k + endTag.length
          markup(src.slice(i, stop), MATH_ENV.test(envName) ? MATH : '')
          i = stop
          continue
        }
        // Options et arguments de \begin{…}[…]{…} : du balisage
        while (name === 'begin' && /^[[{]/.test(src.slice(j))) j = closing(src, j, src[j], src[j] === '[' ? ']' : '}')
        markup(src.slice(i, j))
        i = j
        continue
      }
      if (name === 'verb') {
        const delim = src[j]
        const k = src.indexOf(delim, j + 1)
        const stop = k < 0 ? src.length : k + 1
        markup(src.slice(i, stop), MATH)
        i = stop
        continue
      }
      if (NON_TEXT.has(name)) {
        // \href{url}{texte} : l'adresse est du balisage, le texte se vérifie
        let args = 0
        while (/^\s*[[{]/.test(src.slice(j)) && !(name === 'href' && args === 1)) {
          const k = j + /^\s*/.exec(src.slice(j))[0].length
          j = closing(src, k, src[k], src[k] === '[' ? ']' : '}')
          args++
        }
        const ref = name !== 'href' && /ref$|cite|^url$/.test(name)
        markup(src.slice(i, j), ref ? MATH : '')
        i = j
        continue
      }
      // Commande de texte (\textbf, \section…) : la commande et ses options sont du balisage, l'argument est vérifié
      while (src[j] === '[') j = closing(src, j, '[', ']')
      markup(src.slice(i, j), name === 'item' ? ' ' : '')
      i = j
      continue
    }
    text += c
    i++
  }
  flush()
  return b.parts
}

export function typst(src) {
  const b = builder()
  let i = 0
  let text = ''
  const flush = () => {
    b.text(text)
    text = ''
  }
  const markup = (s, as = '') => {
    flush()
    b.markup(s, as)
  }
  const sol = () => i === 0 || src[i - 1] === '\n'
  while (i < src.length) {
    const rest = src.slice(i)
    if (rest.startsWith('//')) {
      const end = src.indexOf('\n', i)
      const stop = end < 0 ? src.length : end
      markup(src.slice(i, stop))
      i = stop
      continue
    }
    if (rest.startsWith('/*')) {
      const end = src.indexOf('*/', i + 2)
      const stop = end < 0 ? src.length : end + 2
      markup(src.slice(i, stop))
      i = stop
      continue
    }
    const c = src[i]
    if (c === '$' || c === '`') {
      const fence = rest.startsWith('```') ? '```' : c
      const end = src.indexOf(fence, i + fence.length)
      const stop = end < 0 ? src.length : end + fence.length
      markup(src.slice(i, stop), MATH)
      i = stop
      continue
    }
    if (c === '#') {
      const m = /^#[\p{L}_][\p{L}\p{N}_.-]*/u.exec(rest)
      if (m) {
        const word = m[0].slice(1).split('.')[0]
        // #let, #set, #show, #import… : la ligne entière est du code
        if (/^(let|set|show|import|include|if|else|for|while|return|context)$/.test(word)) {
          const end = src.indexOf('\n', i)
          const stop = end < 0 ? src.length : end
          markup(src.slice(i, stop))
          i = stop
          continue
        }
        let j = i + m[0].length
        if (src[j] === '(') j = closing(src, j, '(', ')')
        markup(src.slice(i, j), src[j] === '[' ? '' : MATH)
        i = j
        continue
      }
    }
    if (c === '[' || c === ']' || c === '*' || c === '_') {
      markup(c)
      i++
      continue
    }
    if (c === '\\') {
      markup(src.slice(i, i + 2), src[i + 1] === '\n' ? '' : (src[i + 1] ?? ''))
      i += 2
      continue
    }
    if (c === '<') {
      const m = /^<[\p{L}\p{N}_:.-]+>/u.exec(rest)
      if (m) {
        markup(m[0])
        i += m[0].length
        continue
      }
    }
    if (c === '@') {
      const m = /^@[\p{L}\p{N}_:.-]+/u.exec(rest)
      if (m) {
        markup(m[0], MATH)
        i += m[0].length
        continue
      }
    }
    if (sol()) {
      const m = /^(\s*)(=+|-|\+|\d+\.|\/)\s/.exec(rest)
      if (m) {
        markup(m[0])
        i += m[0].length
        continue
      }
    }
    text += c
    i++
  }
  flush()
  return b.parts
}
