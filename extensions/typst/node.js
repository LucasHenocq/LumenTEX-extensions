// Partie Node.js de l'extension Typst : trouve (ou télécharge au premier usage) le programme officiel typst, compile,
// et traduit ses messages (« fichier:ligne:colonne: error: … ») en problèmes affichés par Lumen TeX.
import { execFile, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

/** Archive de la dernière version de Typst pour ce système (releases GitHub de typst/typst) */
function archiveName() {
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
  if (process.platform === 'win32') return `typst-${arch}-pc-windows-msvc.zip`
  if (process.platform === 'darwin') return `typst-${arch}-apple-darwin.tar.xz`
  return `typst-${arch}-unknown-linux-musl.tar.xz`
}

let lumen
let child = null
let downloading = null

const binDir = () => path.join(lumen.dataDir, 'typst')
const exeName = process.platform === 'win32' ? 'typst.exe' : 'typst'

/** typst.exe téléchargé (dans un sous-dossier de l'archive), s'il y en a un */
function downloaded() {
  if (!fs.existsSync(binDir())) return null
  for (const d of fs.readdirSync(binDir())) {
    const exe = path.join(binDir(), d, exeName)
    if (fs.existsSync(exe)) return exe
  }
  return null
}

const version = (exe) =>
  new Promise((resolve) => execFile(exe, ['--version'], (err, out) => resolve(err ? null : String(out).trim().replace(/^typst\s+/, ''))))

// Windows : le tar du système (un tar GNU placé avant dans le PATH lit « C: » comme un hôte distant)
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'

async function download() {
  const name = archiveName()
  const url = `https://github.com/typst/typst/releases/latest/download/${name}`
  lumen.send('progression', 'Téléchargement de Typst…')
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Téléchargement de Typst impossible (HTTP ${res.status}). Vérifiez votre connexion à Internet.`)
  const total = Number(res.headers.get('content-length')) || 0
  fs.mkdirSync(binDir(), { recursive: true })
  const archive = path.join(binDir(), name)
  const out = fs.createWriteStream(archive)
  let received = 0
  let last = 0
  for await (const chunk of res.body) {
    out.write(chunk)
    received += chunk.length
    if (total && Date.now() - last > 300) {
      last = Date.now()
      lumen.send('progression', `Téléchargement de Typst : ${Math.round((received / total) * 100)} %`)
    }
  }
  await new Promise((r) => out.end(r))
  lumen.send('progression', 'Installation de Typst…')
  await new Promise((resolve, reject) => execFile(TAR, ['-xf', archive, '-C', binDir()], (err) => (err ? reject(err) : resolve())))
  fs.rmSync(archive, { force: true })
  const exe = downloaded()
  if (!exe) throw new Error('L’archive de Typst ne contient pas le programme attendu.')
  if (process.platform !== 'win32') fs.chmodSync(exe, 0o755)
  return exe
}

/** Programme à utiliser : celui indiqué dans les réglages, sinon celui téléchargé (téléchargé au besoin) */
async function typstExe(custom, fetchIfMissing) {
  if (custom) {
    if (!fs.existsSync(custom)) throw new Error(`Typst introuvable à l’emplacement indiqué dans les réglages : ${custom}`)
    return custom
  }
  const exe = downloaded()
  if (exe || !fetchIfMissing) return exe
  downloading ??= download().finally(() => (downloading = null))
  return downloading
}

/** « \\?\C:\…\chap\un.typ:2:7: error: message » → problème relatif au projet */
function parseDiagnostics(output, root) {
  const out = []
  for (const line of output.split(/\r?\n/)) {
    const m = /^(.*?):(\d+):(\d+): (error|warning): (.*)$/.exec(line.trim())
    if (m) {
      const file = path.relative(root, m[1].replace(/^\\\\\?\\/, '')).split(path.sep).join('/')
      out.push({ file, line: Number(m[2]), severity: m[4], message: m[5] })
    } else if (/^error: /.test(line.trim())) out.push({ file: '', severity: 'error', message: line.trim().slice(7) })
  }
  return out
}

export function activate(l) {
  lumen = l

  lumen.handle('verifier', async (custom) => {
    try {
      const exe = await typstExe(custom, false)
      if (!exe) return { ok: true, version: '(téléchargé à la première compilation)' }
      const v = await version(exe)
      return v ? { ok: true, version: v } : { ok: false, reason: 'Le programme Typst ne répond pas' }
    } catch (e) {
      return { ok: false, reason: e.message }
    }
  })

  lumen.handle('compiler', async ({ exe: custom, root, mainFile, outDir }) => {
    const started = Date.now()
    let exe
    try {
      exe = await typstExe(custom, true)
    } catch (e) {
      return { ok: false, error: e.message }
    }
    const pdf = path.join(root, outDir, path.basename(mainFile).replace(/\.typ$/i, '') + '.pdf')
    fs.mkdirSync(path.dirname(pdf), { recursive: true })
    lumen.send('progression', 'Compilation Typst…')
    return new Promise((resolve) => {
      let log = ''
      child = spawn(exe, ['compile', '--root', root, '--diagnostic-format', 'short', mainFile, pdf], { cwd: root })
      child.stdout.on('data', (d) => (log += d))
      child.stderr.on('data', (d) => (log += d))
      child.on('error', (e) => resolve({ ok: false, error: `Typst n’a pas pu démarrer : ${e.message}` }))
      child.on('close', (code) => {
        child = null
        const diagnostics = parseDiagnostics(log, root).filter((d) => d.file || d.severity === 'error')
        resolve({
          ok: code === 0,
          pdf: code === 0 && fs.existsSync(pdf) ? pdf : null,
          log: log || `Compilé en ${Date.now() - started} ms`,
          diagnostics: diagnostics.filter((d) => d.file),
          error: code === 0 ? undefined : (diagnostics.find((d) => !d.file)?.message ?? undefined)
        })
      })
    })
  })

  lumen.handle('arreter', () => child?.kill())
}
