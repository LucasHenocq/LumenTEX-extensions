// Partie Node.js de l'extension Typst : trouve (ou télécharge au premier usage) le programme officiel typst, compile,
// et traduit ses messages (« fichier:ligne:colonne: error: … ») en problèmes affichés par Lumen TeX.
// Le programme est rangé dans le dossier de données de l'extension (lumen.dataDir) : une version par sous-dossier,
// préparée à côté puis mise en place, pour ne jamais laisser une installation à moitié faite.
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

/** typst téléchargé (dans le sous-dossier de l'archive), s'il y en a un */
function downloaded() {
  if (!fs.existsSync(binDir())) return null
  for (const d of fs.readdirSync(binDir())) {
    if (d.startsWith('.')) continue
    const exe = path.join(binDir(), d, exeName)
    if (fs.existsSync(exe)) return exe
  }
  return null
}

/** Version du programme, ou null s'il ne démarre pas (sous Windows, un fichier abîmé échoue dès le lancement) */
const version = (exe) =>
  new Promise((resolve) => {
    try {
      execFile(exe, ['--version'], { timeout: 15000 }, (err, out) => resolve(err ? null : String(out).trim().replace(/^typst\s+/, '')))
    } catch {
      resolve(null)
    }
  })

// Windows : le tar du système (un tar GNU placé avant dans le PATH lit « C: » comme un hôte distant)
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'

/** Télécharge la dernière version et la met à la place de l'ancienne (qui reste si quelque chose échoue) */
async function download() {
  const name = archiveName()
  const url = `https://github.com/typst/typst/releases/latest/download/${name}`
  fs.mkdirSync(binDir(), { recursive: true })
  const work = path.join(binDir(), `.telechargement-${Date.now()}`)
  fs.mkdirSync(work)
  try {
    lumen.send('progression', 'Téléchargement de Typst…')
    let res
    try {
      res = await fetch(url)
    } catch {
      throw new Error('Téléchargement de Typst impossible : vérifiez votre connexion à Internet.')
    }
    if (!res.ok || !res.body) throw new Error(`Téléchargement de Typst impossible (erreur ${res.status} de GitHub). Réessayez plus tard.`)
    const total = Number(res.headers.get('content-length')) || 0
    const archive = path.join(work, name)
    const out = fs.createWriteStream(archive)
    let received = 0
    let last = 0
    try {
      for await (const chunk of res.body) {
        if (!out.write(chunk)) await new Promise((r) => out.once('drain', r))
        received += chunk.length
        if (total && Date.now() - last > 300) {
          last = Date.now()
          lumen.send('progression', `Téléchargement de Typst : ${Math.round((received / total) * 100)} %`)
        }
      }
    } catch {
      throw new Error('Le téléchargement de Typst a été interrompu : vérifiez votre connexion à Internet, puis recompilez.')
    } finally {
      await new Promise((r) => out.end(r))
    }
    if (total && received < total) throw new Error('Le téléchargement de Typst est incomplet. Recompilez pour réessayer.')
    lumen.send('progression', 'Installation de Typst…')
    await new Promise((resolve, reject) =>
      execFile(TAR, ['-xf', archive, '-C', work], (err) =>
        err
          ? reject(
              new Error(
                process.platform === 'linux'
                  ? 'Impossible d’extraire Typst : le programme xz est peut-être absent (paquet xz-utils).'
                  : 'Impossible d’extraire l’archive de Typst.'
              )
            )
          : resolve()
      )
    )
    fs.rmSync(archive, { force: true })
    const folder = fs.readdirSync(work).find((d) => fs.existsSync(path.join(work, d, exeName)))
    if (!folder) throw new Error('L’archive de Typst ne contient pas le programme attendu.')
    const exe = path.join(work, folder, exeName)
    if (process.platform !== 'win32') fs.chmodSync(exe, 0o755)
    if (!(await version(exe))) throw new Error('Le programme Typst téléchargé ne démarre pas sur cet ordinateur.')
    // Mise en place : l'ancienne version retirée, la nouvelle à sa place
    for (const d of fs.readdirSync(binDir())) if (!d.startsWith('.')) fs.rmSync(path.join(binDir(), d), { recursive: true, force: true })
    fs.renameSync(path.join(work, folder), path.join(binDir(), folder))
    return path.join(binDir(), folder, exeName)
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

/** Un seul téléchargement à la fois (deux compilations rapprochées attendent le même) */
const downloadOnce = () => (downloading ??= download().finally(() => (downloading = null)))

/** Programme à utiliser : celui indiqué dans les réglages, sinon celui téléchargé (téléchargé au besoin, ou réparé) */
async function typstExe(custom, fetchIfMissing) {
  if (custom) {
    if (!fs.existsSync(custom)) throw new Error(`Typst introuvable à l’emplacement indiqué dans les réglages de l’extension : ${custom}`)
    return custom
  }
  const exe = downloaded()
  if (!fetchIfMissing) return exe
  // Téléchargé mais qui ne démarre plus (fichier abîmé) : téléchargé de nouveau
  if (exe && (await version(exe))) return exe
  return downloadOnce()
}

/** « \\?\C:\…\chap\un.typ:2:7: error: message » → problème du projet ; hors du projet (paquet) : sans fichier */
function parseDiagnostics(output, root) {
  const out = []
  for (const line of output.split(/\r?\n/)) {
    const m = /^(.*?):(\d+):(\d+): (error|warning): (.*)$/.exec(line.trim())
    if (m) {
      const abs = m[1].replace(/^\\\\\?\\/, '')
      const rel = path.relative(root, abs)
      const inside = rel && !rel.startsWith('..') && !path.isAbsolute(rel)
      out.push(
        inside
          ? { file: rel.split(path.sep).join('/'), line: Number(m[2]), severity: m[4], message: m[5] }
          : { severity: m[4], message: `${m[5]} (${path.basename(abs)}, ligne ${m[2]})` }
      )
    } else if (/^error: /.test(line.trim())) out.push({ severity: 'error', message: line.trim().slice(7) })
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
      if (v) return { ok: true, version: v }
      // Téléchargé mais abîmé : réparé à la prochaine compilation
      return custom ? { ok: false, reason: `Le programme Typst indiqué ne répond pas : ${custom}` } : { ok: true, version: '(à réinstaller)' }
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
    if (!fs.existsSync(path.join(root, mainFile))) return { ok: false, error: `Fichier principal introuvable : ${mainFile}` }
    const pdf = path.join(root, outDir, path.basename(mainFile).replace(/\.typ$/i, '') + '.pdf')
    fs.mkdirSync(path.dirname(pdf), { recursive: true })
    lumen.send('progression', 'Compilation Typst…')
    return new Promise((resolve) => {
      let log = ''
      try {
        child = spawn(exe, ['compile', '--root', root, '--diagnostic-format', 'short', mainFile, pdf], { cwd: root })
      } catch {
        return resolve({
          ok: false,
          error: custom
            ? `Le programme Typst indiqué dans les réglages ne démarre pas : ${custom}`
            : 'Le programme Typst ne démarre pas. Recompilez : il sera téléchargé de nouveau.'
        })
      }
      child.stdout.on('data', (d) => (log += d))
      child.stderr.on('data', (d) => (log += d))
      child.on('error', (e) => {
        child = null
        resolve({ ok: false, error: `Typst n’a pas pu démarrer : ${e.message}` })
      })
      child.on('close', (code, signal) => {
        child = null
        if (signal) return resolve({ ok: false, error: 'Compilation arrêtée', log })
        const diagnostics = parseDiagnostics(log, root)
        const general = diagnostics.find((d) => !d.file && d.severity === 'error')
        resolve({
          ok: code === 0,
          pdf: code === 0 && fs.existsSync(pdf) ? pdf : null,
          log: log || `Compilé en ${Date.now() - started} ms`,
          diagnostics,
          error: code === 0 ? undefined : diagnostics.some((d) => d.file) ? undefined : (general?.message ?? `Typst s’est arrêté (code ${code})`)
        })
      })
    })
  })

  lumen.handle('arreter', () => child?.kill())

  /** Commande « Télécharger la dernière version de Typst » */
  lumen.handle('mettreAJour', async () => {
    const exe = await downloadOnce()
    lumen.send('progression', '')
    return version(exe)
  })
}
