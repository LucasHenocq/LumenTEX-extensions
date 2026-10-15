// Partie Node.js de l'extension LaTeX classique : compile avec la distribution TeX installée sur l'ordinateur
// (TeX Live, MiKTeX, MacTeX, TinyTeX), enchaîne les passes et la bibliographie (biber ou BibTeX), lit le journal
// pour placer les erreurs, et fait le lien texte ↔ PDF avec le fichier SyncTeX.
import { execFile, spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { forward, reverse } from './synctex.js'

const WIN = process.platform === 'win32'
const exeName = (tool) => (WIN ? `${tool}.exe` : tool)

/** Dossiers où chercher les programmes : réglage, PATH, puis emplacements habituels des distributions */
function searchDirs(custom) {
  const dirs = []
  if (custom) dirs.push(custom)
  dirs.push(...(process.env.PATH ?? '').split(path.delimiter).filter(Boolean))
  const years = (base, tail) => {
    try {
      return fs
        .readdirSync(base)
        .filter((d) => /^\d{4}$/.test(d))
        .sort()
        .reverse()
        .map((d) => path.join(base, d, ...tail))
    } catch {
      return []
    }
  }
  if (WIN) {
    const local = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local')
    const pf = process.env.ProgramFiles ?? 'C:\\Program Files'
    dirs.push(
      path.join(local, 'Programs', 'MiKTeX', 'miktex', 'bin', 'x64'),
      path.join(pf, 'MiKTeX', 'miktex', 'bin', 'x64'),
      ...years('C:\\texlive', ['bin', 'windows']),
      ...years('C:\\texlive', ['bin', 'win64']),
      ...years('C:\\texlive', ['bin', 'win32']),
      path.join(process.env.APPDATA ?? '', 'TinyTeX', 'bin', 'windows')
    )
  } else if (process.platform === 'darwin') {
    dirs.push('/Library/TeX/texbin', ...years('/usr/local/texlive', ['bin', 'universal-darwin']), '/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), 'Library', 'TinyTeX', 'bin', 'universal-darwin'))
  } else {
    dirs.push('/usr/bin', '/usr/local/bin', ...years('/usr/local/texlive', ['bin', 'x86_64-linux']), path.join(os.homedir(), '.TinyTeX', 'bin', 'x86_64-linux'))
  }
  // En dernier : le TinyTeX installé par l'extension (une distribution déjà présente reste préférée)
  if (lumen?.dataDir) dirs.push(tinyBin())
  return [...new Set(dirs)]
}

function find(tool, custom) {
  for (const d of searchDirs(custom)) {
    const p = path.join(d, exeName(tool))
    if (fs.existsSync(p)) return p
  }
  return null
}

const run = (exe, args, opts = {}) =>
  new Promise((resolve) => {
    let out = ''
    let child
    try {
      child = spawn(exe, args, { ...opts, windowsHide: true })
    } catch (e) {
      return resolve({ code: -1, out: String(e.message) })
    }
    current = child
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('error', (e) => resolve({ code: -1, out: out + e.message }))
    child.on('close', (code, signal) => {
      if (current === child) current = null
      resolve({ code: signal ? -2 : code, out })
    })
  })

/** Sortie d'un programme (version…), ou null s'il ne démarre pas */
const output = (exe, args) =>
  new Promise((resolve) => {
    try {
      execFile(exe, args, { timeout: 20000, windowsHide: true }, (err, out) => resolve(err ? null : String(out)))
    } catch {
      resolve(null)
    }
  })

let lumen
let current = null
let cancelled = false

const NAMES = { pdflatex: 'pdfLaTeX', xelatex: 'XeLaTeX', lualatex: 'LuaLaTeX', latexmk: 'Latexmk' }
const missing = (tool) =>
  `${NAMES[tool] ?? tool} introuvable. Lancez la commande « Installer TinyTeX » (palette de commandes), installez une distribution TeX (TeX Live, MiKTeX, MacTeX), ou indiquez le dossier de ses programmes dans les réglages de l’extension.`

// ---------------------------------------------------------------------------
// TinyTeX : petite distribution TeX Live installée par l'extension, dans son dossier de données
// ---------------------------------------------------------------------------

const tinyRoot = () => path.join(lumen.dataDir, 'TinyTeX')
const platformDir = () =>
  WIN ? 'windows' : process.platform === 'darwin' ? 'universal-darwin' : process.arch === 'arm64' ? 'aarch64-linux' : 'x86_64-linux'
const tinyBin = () => path.join(tinyRoot(), 'bin', platformDir())
const usesTiny = (exe) => !!exe && path.resolve(exe).toLowerCase().startsWith(path.resolve(tinyRoot()).toLowerCase())

// Windows : le tar du système (il sait aussi ouvrir l'archive auto-extractible de TinyTeX)
const TAR = WIN ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'

/** Gestionnaire de paquets de TinyTeX (tlmgr) ; sous Windows, son script Perl, avec le Perl fourni */
function tlmgr(args) {
  const root = tinyRoot()
  // Ses programmes (kpsewhich…) doivent être trouvés en premier
  const env = { ...process.env, PATH: tinyBin() + path.delimiter + (process.env.PATH ?? '') }
  // Windows : le lanceur officiel tlmgr.bat (lui seul termine sa propre mise à jour), par cmd.exe, chemin entre
  // guillemets (« Lumen TeX » contient une espace) ; les arguments sont des noms de paquets ou de fichiers
  if (WIN)
    return run('cmd.exe', ['/d', '/s', '/c', `""${path.join(tinyBin(), 'tlmgr.bat')}" ${args.join(' ')}"`], {
      cwd: root,
      env,
      windowsVerbatimArguments: true
    })
  return run(path.join(tinyBin(), 'tlmgr'), args, { cwd: root, env })
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Installe des paquets. Si le gestionnaire de paquets est trop ancien pour le dépôt, il est d'abord mis à jour ;
 * sous Windows, cette mise à jour se termine en arrière-plan : nouvel essai quelques secondes plus tard.
 */
async function tlmgrInstall(pkgs) {
  // Sous Windows, tlmgr.bat renvoie 0 même quand tlmgr refuse : ce sont ses messages qui font foi
  const failed = (r) => r.code !== 0 || /Terminating|needs to be updated|tlmgr\.pl: An error has occurred/i.test(r.out)
  let r = await tlmgr(['install', ...pkgs])
  for (let i = 0; i < 6 && failed(r) && /update-tlmgr|--self|infrastructure/i.test(r.out); i++) {
    if (i === 0) await tlmgr(['update', '--self'])
    await pause(5000)
    r = await tlmgr(['install', ...pkgs])
  }
  return { ...r, code: failed(r) ? 1 : 0 }
}

async function installTinytex() {
  if (fs.existsSync(path.join(tinyBin(), exeName('pdflatex')))) return { ok: true, already: true }
  // Dernière version : l'adresse « latest » redirige vers la page de la version (…/tag/v2026.10)
  lumen.send('progression', 'Recherche de la dernière version de TinyTeX…')
  let tag
  try {
    const r = await fetch('https://github.com/rstudio/tinytex-releases/releases/latest', { method: 'HEAD', redirect: 'follow' })
    tag = /\/tag\/([^/?#]+)/.exec(r.url)?.[1]
  } catch {
    throw new Error('Téléchargement de TinyTeX impossible : vérifiez votre connexion à Internet.')
  }
  if (!tag) throw new Error('Impossible de trouver la dernière version de TinyTeX. Réessayez plus tard.')
  const name = WIN
    ? `TinyTeX-1-windows-${tag}.exe`
    : process.platform === 'darwin'
      ? `TinyTeX-1-darwin-${tag}.tar.xz`
      : `TinyTeX-1-linux-${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-${tag}.tar.xz`
  const work = path.join(lumen.dataDir, `.installation-${Date.now()}`)
  fs.mkdirSync(work, { recursive: true })
  try {
    const res = await fetch(`https://github.com/rstudio/tinytex-releases/releases/download/${tag}/${name}`).catch(() => null)
    if (!res?.ok || !res.body) throw new Error('Téléchargement de TinyTeX impossible : vérifiez votre connexion à Internet.')
    const total = Number(res.headers.get('content-length')) || 0
    const archive = path.join(work, name)
    const out = fs.createWriteStream(archive)
    let received = 0
    let last = 0
    try {
      for await (const chunk of res.body) {
        if (!out.write(chunk)) await new Promise((r) => out.once('drain', r))
        received += chunk.length
        if (total && Date.now() - last > 400) {
          last = Date.now()
          lumen.send('progression', `Téléchargement de TinyTeX : ${Math.round((received / total) * 100)} %`)
        }
      }
    } catch {
      throw new Error('Le téléchargement de TinyTeX a été interrompu : vérifiez votre connexion, puis réessayez.')
    } finally {
      await new Promise((r) => out.end(r))
    }
    if (total && received < total) throw new Error('Le téléchargement de TinyTeX est incomplet. Réessayez.')
    lumen.send('progression', 'Installation de TinyTeX…')
    const x = await run(TAR, ['-xf', archive, '-C', work])
    if (x.code !== 0) throw new Error(process.platform === 'linux' ? 'Impossible d’extraire TinyTeX (le programme xz est peut-être absent).' : 'Impossible d’extraire l’archive de TinyTeX.')
    fs.rmSync(archive, { force: true })
    if (!fs.existsSync(path.join(work, 'TinyTeX'))) throw new Error('L’archive de TinyTeX ne contient pas ce qui est attendu.')
    fs.rmSync(tinyRoot(), { recursive: true, force: true })
    fs.renameSync(path.join(work, 'TinyTeX'), tinyRoot())
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
  // biber (biblatex) n'est pas fourni : ajouté tout de suite, après la mise à jour du gestionnaire de paquets
  lumen.send('progression', 'TinyTeX : ajout de biber…')
  const b = await tlmgrInstall(['biber', 'biblatex'])
  lumen.send('progression', '')
  return { ok: true, biber: b.code === 0 && fs.existsSync(path.join(tinyBin(), exeName('biber'))) }
}

/** Fichiers manquants signalés par LaTeX (« File `xcolor.sty' not found ») */
const missingFiles = (log) => [...new Set([...log.matchAll(/File [`']([^`']+\.(?:sty|cls|def|cfg|clo|fd|bbx|cbx|lbx|tex))' not found/g)].map((m) => m[1]))]

/** Paquet TeX Live qui fournit un fichier (tlmgr search --global --file) */
async function packageFor(file) {
  const r = await tlmgr(['search', '--global', '--file', `/${file}`])
  for (const line of r.out.split(/\r?\n/)) {
    const m = /^([a-zA-Z0-9_.-]+):$/.exec(line.trim())
    if (m && !/^tlmgr/.test(m[1])) return m[1]
  }
  return null
}

// ---------------------------------------------------------------------------
// Journal de compilation → problèmes
// ---------------------------------------------------------------------------

/** Chemin écrit par TeX (relatif au dossier de compilation) → chemin dans le projet, ou null s'il est en dehors */
function projectPath(p, cwd, root) {
  const rel = path.relative(root, path.resolve(cwd, p))
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.split(path.sep).join('/') : null
}

function parseLog(log, cwd, root) {
  const lines = log.split(/\r?\n/)
  const out = []
  const stack = []
  const seen = new Set()
  const add = (d) => {
    const key = `${d.file}:${d.line}:${d.message}`
    if (!seen.has(key)) {
      seen.add(key)
      out.push(d)
    }
  }
  const top = () => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i]) return stack[i]
    return null
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Fichiers ouverts « (./chap/a.tex » et refermés « ) » : à qui appartient un avertissement
    // Toutes les parenthèses comptent (« (biblatex) » aussi), sinon une parenthèse fermée sortirait du mauvais fichier
    const re = /\((\.{0,2}[/\\][^\s()]*|[A-Za-z]:[/\\][^\s()]*)?|\)/g
    let m
    while ((m = re.exec(line))) {
      if (m[0] === ')') stack.pop()
      else stack.push(m[1] && /\.(tex|ltx|bib)$/i.test(m[1]) ? projectPath(m[1], cwd, root) : null)
    }
    // Erreur au format fichier:ligne: message (-file-line-error)
    const e = /^((?:[A-Za-z]:)?[^:]+\.[A-Za-z]+):(\d+): (.+)$/.exec(line)
    if (e) {
      let context = ''
      for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
        const l = /^l\.\d+ (.*)$/.exec(lines[j])
        if (l) {
          context = l[1].trim()
          break
        }
      }
      const file = projectPath(e[1], cwd, root)
      add({
        severity: 'error',
        message: e[3].replace(/^LaTeX Error: /, ''),
        ...(file ? { file, line: Number(e[2]) } : {}),
        context: file ? context : `${path.basename(e[1])}, ligne ${e[2]}`
      })
      continue
    }
    if (/^! /.test(line) && !/^! Emergency stop/.test(line)) {
      add({ severity: 'error', message: line.slice(2) })
      continue
    }
    // Avertissements (sur plusieurs lignes, la suite est indentée)
    const w = /^(LaTeX|Package (\S+)|Class (\S+))( \S+)? Warning: (.*)$/.exec(line)
    if (w) {
      let msg = w[5]
      for (let j = i + 1; j < lines.length && /^\(\S+\)\s+|^\s{2,}/.test(lines[j]); j++) msg += ' ' + lines[j].replace(/^\(\S+\)\s+/, '').trim()
      const at = /on input line (\d+)/.exec(msg)
      const file = top()
      add({
        severity: 'warning',
        message: msg.replace(/\s+/g, ' ').trim(),
        ...(file && at ? { file, line: Number(at[1]) } : {}),
        kind: /Reference|Citation/.test(msg) ? (/Citation/.test(msg) ? 'citation' : 'reference') : 'general'
      })
      continue
    }
    const b = /^(Over|Under)full \\[hv]box.*?(?:at lines? (\d+)|$)/.exec(line)
    if (b) {
      const file = top()
      add({ severity: 'info', kind: 'badbox', message: line.trim(), ...(file && b[2] ? { file, line: Number(b[2]) } : {}) })
    }
  }
  return out
}

/** Journal de biber (.blg) ou de BibTeX : erreurs et avertissements */
function parseBibLog(text, tool) {
  const out = []
  for (const line of text.split(/\r?\n/)) {
    const e = /^(?:\[\d+\] )?.*?(ERROR|WARN) - (.*)$/.exec(line)
    if (e) out.push({ severity: e[1] === 'ERROR' ? 'error' : 'warning', message: `${tool} : ${e[2]}` })
    else if (/^I couldn't open|^I found no|error message/.test(line)) out.push({ severity: 'error', message: `${tool} : ${line.trim()}` })
    else if (/^Warning--/.test(line)) out.push({ severity: 'warning', message: `${tool} : ${line.slice(9).trim()}` })
  }
  return out
}

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

/** -output-directory : les sous-dossiers du projet doivent y exister (\include{chap/a} y écrit chap/a.aux) */
function mirrorDirs(from, to, depth = 0) {
  if (depth > 6) return
  let entries
  try {
    entries = fs.readdirSync(from, { withFileTypes: true })
  } catch {
    return
  }
  for (const d of entries) {
    if (!d.isDirectory() || d.name.startsWith('.') || d.name === 'node_modules') continue
    fs.mkdirSync(path.join(to, d.name), { recursive: true })
    mirrorDirs(path.join(from, d.name), path.join(to, d.name), depth + 1)
  }
}

const RERUN = /Rerun to get|Label\(s\) may have changed|Please \(?re\)?run|rerunfilecheck Warning|Please rerun LaTeX/i

/** Avec le TinyTeX de l'extension : un paquet manquant est installé (tlmgr), puis la compilation relancée */
async function compile(args) {
  const tried = new Set()
  for (let round = 0; ; round++) {
    const r = await compileOnce(args)
    if (r.ok || cancelled || round >= 6 || !usesTiny(find(args.tool, args.opts.dossier || ''))) return r
    const files = missingFiles(r.log ?? '').filter((f) => !tried.has(f))
    if (!files.length) return r
    const pkgs = []
    for (const f of files) {
      tried.add(f)
      lumen.send('progression', `Recherche du paquet qui fournit ${f}…`)
      const p = await packageFor(f)
      if (p) pkgs.push(p)
    }
    if (!pkgs.length) return r
    const list = [...new Set(pkgs)]
    lumen.send('progression', `Installation de ${list.join(', ')}…`)
    const res = await tlmgrInstall(list)
    if (res.code !== 0) {
      const why = res.out.split(/\r?\n/).filter(Boolean).slice(-2).join(' ')
      return { ...r, diagnostics: [...(r.diagnostics ?? []), { severity: 'error', message: `Installation de ${list.join(', ')} impossible : ${why}` }] }
    }
  }
}

async function compileOnce({ tool, opts, root, mainFile, outDir }) {
  cancelled = false
  const started = Date.now()
  const custom = opts.dossier || ''
  const exe = find(tool, custom)
  if (!exe) return { ok: false, error: missing(tool) }
  const main = path.join(root, mainFile)
  if (!fs.existsSync(main)) return { ok: false, error: `Fichier principal introuvable : ${mainFile}` }
  const cwd = path.dirname(main)
  const file = path.basename(main)
  const base = file.replace(/\.[^.]+$/, '')
  const out = path.join(root, outDir)
  fs.mkdirSync(out, { recursive: true })
  mirrorDirs(cwd, out)
  // Programmes de la même distribution trouvés en premier (latexmk appelle pdflatex, biber…) ; journal non coupé
  const env = {
    ...process.env,
    PATH: path.dirname(exe) + path.delimiter + (process.env.PATH ?? ''),
    max_print_line: '10000',
    error_line: '254',
    half_error_line: '238'
  }
  const pdf = path.join(out, base + '.pdf')
  const logFile = path.join(out, base + '.log')
  const common = ['-interaction=nonstopmode', '-file-line-error', '-synctex=1']
  if (opts.shellEscape) common.push('-shell-escape')
  let output = ''
  const extra = []

  if (tool === 'latexmk') {
    const engine = { pdfLaTeX: '-pdf', LuaLaTeX: '-pdflua', XeLaTeX: '-pdfxe' }[opts.moteur] ?? '-pdf'
    lumen.send('progression', 'Latexmk…')
    const r = await run(exe, [engine, ...common, `-outdir=${out}`, file], { cwd, env })
    output = r.out
    if (r.code === -1) return { ok: false, error: `Latexmk n’a pas pu démarrer${WIN ? ' (il a besoin de Perl, fourni par TeX Live mais pas toujours par MiKTeX)' : ''} : ${r.out.slice(-300)}` }
  } else {
    const engine = () => run(exe, [...common, `-output-directory=${out}`, file], { cwd, env })
    let pass = 1
    lumen.send('progression', `${NAMES[tool]} : passe 1…`)
    let r = await engine()
    output += r.out
    if (r.code === -1) return { ok: false, error: `${NAMES[tool]} n’a pas pu démarrer : ${r.out.slice(-300)}` }
    // Bibliographie : biber (biblatex) ou BibTeX, selon le document et le réglage
    const mode = opts.biblio || 'Automatique'
    const bcf = path.join(out, base + '.bcf')
    const aux = path.join(out, base + '.aux')
    let bib = null
    if (!cancelled && mode !== 'Aucune') {
      const useBiber = mode === 'biber' || (mode === 'Automatique' && fs.existsSync(bcf))
      const auxText = fs.existsSync(aux) ? fs.readFileSync(aux, 'utf8') : ''
      const useBibtex = mode === 'BibTeX' || (mode === 'Automatique' && !useBiber && /\\bibdata\{/.test(auxText))
      if (useBiber) {
        const biber = find('biber', custom)
        if (!biber) extra.push({ severity: 'error', message: 'biber introuvable : installez-le avec votre distribution TeX (paquet « biber »).' })
        else {
          lumen.send('progression', 'biber…')
          const b = await run(biber, [`--input-directory=${out}`, `--output-directory=${out}`, base], { cwd, env })
          output += b.out
          const blg = path.join(out, base + '.blg')
          extra.push(...parseBibLog(fs.existsSync(blg) ? fs.readFileSync(blg, 'utf8') : b.out, 'biber'))
          bib = 'biber'
        }
      } else if (useBibtex) {
        const bibtex = find('bibtex', custom)
        if (!bibtex) extra.push({ severity: 'error', message: 'BibTeX introuvable : installez-le avec votre distribution TeX.' })
        else {
          lumen.send('progression', 'BibTeX…')
          // BibTeX tourne dans le dossier de sortie ; les .bib et .bst sont cherchés dans le dossier du document
          const inputs = cwd + path.delimiter
          const b = await run(bibtex, [base], { cwd: out, env: { ...env, BIBINPUTS: inputs, BSTINPUTS: inputs } })
          output += b.out
          const blg = path.join(out, base + '.blg')
          extra.push(...parseBibLog(fs.existsSync(blg) ? fs.readFileSync(blg, 'utf8') : b.out, 'BibTeX'))
          bib = 'BibTeX'
        }
      }
    }
    // Passes suivantes : après la bibliographie, ou tant que LaTeX le demande (4 passes au plus)
    while (!cancelled && pass < 4) {
      const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : ''
      if (!(bib && pass < 3) && !RERUN.test(log)) break
      pass++
      lumen.send('progression', `${NAMES[tool]} : passe ${pass}…`)
      r = await engine()
      output += r.out
    }
  }
  if (cancelled) return { ok: false, error: 'Compilation arrêtée', log: output }
  const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : output
  const diagnostics = [...parseLog(log, cwd, root), ...extra]
  // Latexmk ne refait pas un PDF déjà à jour : le PDF existant compte alors
  const made = fs.existsSync(pdf) && (tool === 'latexmk' || fs.statSync(pdf).mtimeMs >= started - 1000)
  const errors = diagnostics.filter((d) => d.severity === 'error')
  return {
    ok: made && !errors.length,
    pdf: made ? pdf : null,
    log,
    diagnostics,
    error: made ? undefined : errors.length ? undefined : 'Aucun PDF produit : voyez le journal.'
  }
}

export function activate(l) {
  lumen = l

  l.handle('verifier', async (tool, dossier) => {
    const exe = find(tool, dossier)
    if (!exe) return { ok: false, reason: missing(tool) }
    const text = await output(exe, tool === 'latexmk' ? ['-v'] : ['--version'])
    // Latexmk : « Latexmk, John Collins, … Version 4.87 » (sous Windows, précédé d'une ligne sur la page de code)
    const lm = text && /Version\s+(\S+)/.exec(text)
    const v = tool === 'latexmk' ? (lm ? `Latexmk ${lm[1]}` : null) : text?.split(/\r?\n/)[0].trim()
    if (!v)
      return {
        ok: false,
        reason: tool === 'latexmk' && WIN ? 'Latexmk ne démarre pas : il a besoin de Perl (installez Strawberry Perl, ou utilisez TeX Live).' : `${NAMES[tool]} ne démarre pas (${exe}).`
      }
    // « pdfTeX 3.14…-2.6-1.40.29 (TeX Live 2026) » → « TeX Live 2026 » ; MiKTeX : « MiKTeX-pdfTeX 4.x (MiKTeX 24.x) »
    const dist = /\(([^)]*(?:TeX Live|MiKTeX)[^)]*)\)/.exec(v)?.[1]
    return { ok: true, version: dist ?? v.replace(/^This is /, '').slice(0, 40) }
  })

  l.handle('compiler', (args) => compile(args))

  /** Une distribution TeX est-elle trouvée, et TinyTeX installé par l'extension ? */
  l.handle('etat', (dossier) => ({ found: !!find('pdflatex', dossier || ''), tiny: fs.existsSync(path.join(tinyBin(), exeName('pdflatex'))) }))

  let installing = null
  l.handle('installerTinytex', () => (installing ??= installTinytex().finally(() => (installing = null))))

  l.handle('arreter', () => {
    cancelled = true
    current?.kill()
  })

  l.handle('versPdf', ({ root, mainFile, outDir, file, line }) => {
    const main = path.join(root, mainFile)
    const synctex = path.join(root, outDir, path.basename(main).replace(/\.[^.]+$/, '') + '.synctex.gz')
    return forward(synctex, path.dirname(main), path.join(root, file), line)
  })

  l.handle('versTexte', ({ root, mainFile, outDir, page, x, y }) => {
    const main = path.join(root, mainFile)
    const synctex = path.join(root, outDir, path.basename(main).replace(/\.[^.]+$/, '') + '.synctex.gz')
    const r = reverse(synctex, path.dirname(main), page, x, y)
    if (!r) return null
    const rel = path.relative(root, r.file)
    return rel.startsWith('..') ? null : { file: rel.split(path.sep).join('/'), line: r.line }
  })
}
