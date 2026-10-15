/// <reference path="../../lumen.d.ts" />
// LanguageTool : orthographe, grammaire et style des documents LaTeX et Typst.
// Le texte est découpé en paragraphes ; seuls ceux qui ont changé sont envoyés (le service gratuit limite le nombre
// de requêtes). Les commandes et les formules ne sont pas vérifiées (voir balisage.js).
import { latex, typst } from './balisage.js'

const PUBLIC = 'https://api.languagetool.org'
const MAX_BATCH = 15000
const LANGS = {
  Automatique: 'auto',
  Français: 'fr',
  'English (US)': 'en-US',
  'English (GB)': 'en-GB',
  Deutsch: 'de-DE',
  Español: 'es',
  Italiano: 'it',
  Português: 'pt-PT'
}

/** Découpe selon le langage du fichier, ou null s'il n'est pas vérifié */
const splitterFor = (file) => (/\.(tex|ltx)$/i.test(file ?? '') ? latex : /\.typ$/i.test(file ?? '') ? typst : null)

/** Parties (avec leur position) regroupées en paragraphes : une ligne vide dans le texte sépare deux paragraphes */
function paragraphs(parts) {
  const out = []
  let cur = { start: 0, parts: [] }
  let offset = 0
  const push = (p) => {
    if (!cur.parts.length) cur.start = offset
    cur.parts.push(p)
    offset += (p.text ?? p.markup).length
  }
  for (const p of parts) {
    if (!('text' in p)) {
      push(p)
      continue
    }
    const pieces = p.text.split(/(\n[ \t]*\n)/)
    pieces.forEach((s, k) => {
      if (!s) return
      if (k % 2 === 1) {
        push({ text: s })
        out.push(cur)
        cur = { start: offset, parts: [] }
      } else push({ text: s })
    })
  }
  if (cur.parts.length) out.push(cur)
  // Paragraphes sans aucune lettre à vérifier : ignorés
  return out.filter((par) => par.parts.some((p) => 'text' in p && /\p{L}{2}/u.test(p.text)))
}

const length = (par) => par.parts.reduce((n, p) => n + (p.text ?? p.markup).length, 0)
const key = (par, lang, level, rules) => JSON.stringify([lang, level, rules, par.parts])

/** @param {Lumen} lumen */
export async function activate(lumen) {
  const cache = new Map()
  /** Fautes du fichier actif : { from, to, message, replacements, word, typo } */
  let current = { file: null, matches: [] }
  const ignored = new Set((await lumen.storage.get('ignores')) ?? [])
  let pausedUntil = 0
  let warned = ''
  let timer = null
  let busy = false
  let again = false

  const setting = async (id) => lumen.settings.get(id)
  const warnOnce = (kind, text) => {
    if (warned === kind) return
    warned = kind
    lumen.ui.notify(text, 'warning')
  }

  const status = (text, tooltip) => lumen.ui.setStatus('etat', { text, tooltip, onClick: () => check(true) })

  /** Envoie un lot de paragraphes ; renvoie les fautes de chacun (positions relatives au paragraphe) */
  async function request(batch, lang, level, rules) {
    const annotation = []
    const starts = []
    let offset = 0
    batch.forEach((par, k) => {
      if (k) {
        annotation.push({ markup: '\n\n', interpretAs: '\n\n' })
        offset += 2
      }
      starts.push(offset)
      for (const p of par.parts) annotation.push(p)
      offset += length(par)
    })
    const server = ((await setting('serveur')) || PUBLIC).replace(/\/+$/, '')
    const params = { data: JSON.stringify({ annotation }), language: lang, level }
    // Détection automatique : variante retenue pour les langues qui en ont (seuls des codes régionaux sont acceptés)
    if (lang === 'auto') params.preferredVariants = 'en-US,de-DE,pt-PT'
    if (rules) params.disabledRules = rules
    const res = await lumen.fetch(`${server}/v2/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString()
    })
    if (res.status === 429) {
      pausedUntil = Date.now() + 60000
      throw new Error('limite')
    }
    if (!res.ok) throw Object.assign(new Error(`Le serveur LanguageTool a refusé la demande (erreur ${res.status}) : ${res.text().slice(0, 200)}`), { refused: true })
    const matches = res.json().matches ?? []
    return batch.map((par, k) => {
      const start = starts[k]
      const end = start + length(par)
      // Positions du texte vérifiable dans ce paragraphe (une faute entièrement dans le balisage est écartée)
      const textRanges = []
      let o = 0
      for (const p of par.parts) {
        const n = (p.text ?? p.markup).length
        if ('text' in p) textRanges.push([o, o + n])
        o += n
      }
      return matches
        .filter((m) => m.offset >= start && m.offset + m.length <= end)
        .map((m) => ({ ...m, offset: m.offset - start }))
        .filter((m) => textRanges.some(([a, b]) => m.offset < b && m.offset + m.length > a))
        .map((m) => ({
          offset: m.offset,
          length: m.length,
          message: m.message,
          replacements: (m.replacements ?? []).slice(0, 5).map((r) => r.value),
          typo: m.rule?.issueType === 'misspelling',
          grammar: m.rule?.issueType === 'grammar' || m.rule?.category?.id === 'GRAMMAR'
        }))
    })
  }

  /** Vérifie le fichier actif (force : même si la vérification automatique est coupée) */
  async function check(force = false) {
    const file = await lumen.editor.activeFile()
    const split = splitterFor(file)
    if (!split) {
      current = { file: null, matches: [] }
      await lumen.diagnostics.clear()
      await lumen.ui.removeStatus('etat')
      return
    }
    if (!force && !(await setting('auto'))) return
    if (busy) {
      again = true
      return
    }
    if (Date.now() < pausedUntil) {
      await status('LanguageTool en pause', 'Limite du service gratuit atteinte : reprise dans une minute')
      clearTimeout(timer)
      timer = setTimeout(() => check(), pausedUntil - Date.now() + 500)
      return
    }
    busy = true
    try {
      const text = (await lumen.editor.getText(file)) ?? ''
      const lang = LANGS[await setting('langue')] ?? 'auto'
      const level = (await setting('exigeant')) ? 'picky' : 'default'
      const rules = String((await setting('reglesIgnorees')) ?? '').replace(/\s+/g, '')
      const pars = paragraphs(split(text))
      // Paragraphes nouveaux ou modifiés, envoyés par lots
      const todo = pars.filter((p) => !cache.has(key(p, lang, level, rules)))
      if (todo.length) await status('LanguageTool…', 'Vérification en cours')
      let batch = []
      let size = 0
      const send = async () => {
        if (!batch.length) return
        const res = await request(batch, lang, level, rules)
        batch.forEach((p, k) => cache.set(key(p, lang, level, rules), res[k]))
        batch = []
        size = 0
      }
      for (const p of todo) {
        const n = length(p)
        if (size + n > MAX_BATCH) await send()
        batch.push(p)
        size += n
      }
      await send()
      warned = ''
      // Fautes du document, à leur position dans le fichier
      const matches = []
      for (const p of pars)
        for (const m of cache.get(key(p, lang, level, rules)) ?? []) {
          const from = p.start + m.offset
          const word = text.slice(from, from + m.length)
          if (m.typo && ignored.has(word.toLowerCase())) continue
          matches.push({ ...m, from, to: from + m.length, word })
        }
      current = { file, matches }
      await publish(text)
    } catch (e) {
      if (e.message === 'limite') {
        await status('LanguageTool en pause', 'Limite du service gratuit atteinte : reprise dans une minute')
        warnOnce('limite', 'LanguageTool : la limite du service gratuit est atteinte. La vérification reprend dans une minute.')
        timer = setTimeout(() => check(), 61000)
      } else if (e.refused) {
        lumen.log(e.message)
        await status('LanguageTool indisponible', 'Cliquez pour réessayer')
        warnOnce('refus', e.message)
      } else {
        lumen.log(`LanguageTool injoignable : ${e.message}`)
        await status('LanguageTool indisponible', 'Cliquez pour réessayer')
        warnOnce('reseau', 'LanguageTool est injoignable pour le moment. Vérifiez votre connexion à Internet (ou l’adresse du serveur dans les réglages de l’extension).')
      }
    } finally {
      busy = false
      if (again) {
        again = false
        schedule()
      }
    }
  }

  /** Fautes affichées : panneau Problèmes et soulignés dans l'éditeur */
  async function publish(text) {
    const lineOf = (pos) => text.slice(0, pos).split('\n').length
    const items = current.matches.map((m) => ({
      file: current.file,
      from: m.from,
      to: m.to,
      line: lineOf(m.from),
      severity: m.typo || m.grammar ? 'warning' : 'info',
      message: m.message + (m.replacements.length ? `\nSuggestion : ${m.replacements.slice(0, 3).map((r) => `« ${r} »`).join(', ')}` : '')
    }))
    await lumen.diagnostics.set(items)
    const n = items.length
    await status(n ? `LanguageTool : ${n}` : 'LanguageTool ✓', n ? `${n} remarque${n > 1 ? 's' : ''} dans ce fichier — cliquez pour revérifier` : 'Aucune faute trouvée — cliquez pour revérifier')
  }

  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => check(), 1500)
  }

  /** Faute sous le curseur du fichier actif */
  async function atCursor() {
    const sel = await lumen.editor.getSelection()
    if (!sel || sel.file !== current.file) return null
    return current.matches.find((m) => sel.from >= m.from && sel.from <= m.to) ?? null
  }

  await lumen.commands.register({
    id: 'corriger',
    label: 'Corriger la faute sous le curseur',
    shortcut: 'Alt-Enter',
    run: async () => {
      const m = await atCursor()
      if (!m) return lumen.ui.notify('Placez le curseur sur un mot souligné par LanguageTool.')
      const value = await lumen.ui.prompt(`${m.message} Remplacer « ${m.word} » par :`, m.replacements[0] ?? m.word)
      if (value === null || value === m.word) return
      // Le texte a pu changer depuis la vérification : on remplace seulement si le mot est toujours là
      const text = (await lumen.editor.getText(current.file)) ?? ''
      if (text.slice(m.from, m.to) !== m.word) return lumen.ui.notify('Le texte a changé : la vérification va reprendre.')
      await lumen.editor.replaceRange(m.from, m.to, value)
    }
  })
  await lumen.commands.register({
    id: 'ignorer',
    label: 'Ignorer ce mot (dictionnaire personnel)',
    run: async () => {
      const m = await atCursor()
      if (!m?.typo) return lumen.ui.notify('Placez le curseur sur un mot signalé comme faute de frappe.')
      ignored.add(m.word.toLowerCase())
      await lumen.storage.set('ignores', [...ignored])
      current.matches = current.matches.filter((x) => !(x.typo && x.word.toLowerCase() === m.word.toLowerCase()))
      await publish((await lumen.editor.getText(current.file)) ?? '')
      lumen.ui.notify(`« ${m.word} » ne sera plus signalé.`, 'success')
    }
  })
  await lumen.commands.register({ id: 'verifier', label: 'Vérifier maintenant', run: () => check(true) })
  await lumen.commands.register({
    id: 'oublier',
    label: 'Vider le dictionnaire personnel',
    run: async () => {
      ignored.clear()
      await lumen.storage.set('ignores', [])
      await check(true)
      lumen.ui.notify('Dictionnaire personnel vidé.', 'success')
    }
  })

  await lumen.editor.onChange((file) => {
    if (file === current.file || splitterFor(file)) schedule()
  })
  // Le changement de fichier est annoncé avant que l'éditeur l'affiche : petite attente avant de le lire
  await lumen.editor.onActiveChange(() => {
    clearTimeout(timer)
    timer = setTimeout(() => check(), 400)
  })
  await lumen.settings.onChange(() => {
    cache.clear()
    check(true)
  })
  // Au démarrage, le projet peut s'ouvrir juste après l'extension
  setTimeout(() => check(), 1500)
}
