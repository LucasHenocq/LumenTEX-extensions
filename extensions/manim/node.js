// Partie Node.js de l'extension Manim : installe Python et Manim (avec uv, dans le dossier de données de l'extension),
// trouve LaTeX (Manim en a besoin pour les formules, avec dvisvgm), et calcule la vidéo d'une scène. La scène est
// lancée par garde.py, qui vérifie son code et limite ce qu'il peut faire.
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const WIN = process.platform === 'win32'
const exeName = (tool) => (WIN ? `${tool}.exe` : tool)
const GARDE = fileURLToPath(new URL('./garde.py', import.meta.url))
// Windows : le tar du système (il sait aussi ouvrir les .zip)
const TAR = WIN ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
const PYTHON_VERSION = '3.12'
const QUALITES = { l: '480p15', m: '720p30', h: '1080p60' }

let lumen
let current = null

const run = (exe, args, opts = {}, onLine) =>
  new Promise((resolve) => {
    let out = ''
    let child
    try {
      child = spawn(exe, args, { ...opts, windowsHide: true })
    } catch (e) {
      return resolve({ code: -1, out: String(e.message) })
    }
    current = child
    let partial = ''
    const take = (d) => {
      out += d
      if (!onLine) return
      const lines = (partial + d).split(/\r?\n/)
      partial = lines.pop()
      for (const l of lines) if (l.trim()) onLine(l.trim())
    }
    child.stdout.on('data', take)
    child.stderr.on('data', take)
    child.on('error', (e) => resolve({ code: -1, out: out + e.message }))
    child.on('close', (code, signal) => {
      if (current === child) current = null
      resolve({ code: signal ? -2 : code, out })
    })
  })

const progress = (text) => lumen.send('progression', text)

// ---------------------------------------------------------------------------
// Python et Manim
// ---------------------------------------------------------------------------

const uvExe = () => path.join(lumen.dataDir, 'uv', exeName('uv'))
const venv = () => path.join(lumen.dataDir, 'venv')
const python = () => path.join(venv(), WIN ? path.join('Scripts', 'python.exe') : path.join('bin', 'python'))
/** Écrit quand Manim est installé en entier (une installation interrompue ne compte pas) */
const pret = () => path.join(lumen.dataDir, 'manim-installe')
const uvEnv = () => ({
  ...process.env,
  UV_PYTHON_INSTALL_DIR: path.join(lumen.dataDir, 'python'),
  UV_CACHE_DIR: path.join(lumen.dataDir, 'cache'),
  UV_NO_CONFIG: '1',
  NO_COLOR: '1'
})

function uvArchive() {
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
  if (WIN) return `uv-${arch}-pc-windows-msvc.zip`
  if (process.platform === 'darwin') return `uv-${arch}-apple-darwin.tar.gz`
  return `uv-${arch}-unknown-linux-gnu.tar.gz`
}

/** Fichier cherché dans un dossier et ses sous-dossiers */
function findFile(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isFile() && e.name === name) return p
    if (e.isDirectory()) {
      const f = findFile(p, name)
      if (f) return f
    }
  }
  return null
}

async function download(url, file, label) {
  const res = await fetch(url).catch(() => null)
  if (!res?.ok || !res.body) throw new Error(`Téléchargement de ${label} impossible : vérifiez votre connexion à Internet.`)
  const total = Number(res.headers.get('content-length')) || 0
  const out = fs.createWriteStream(file)
  let received = 0
  let last = 0
  try {
    for await (const chunk of res.body) {
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r))
      received += chunk.length
      if (total && Date.now() - last > 400) {
        last = Date.now()
        progress(`Téléchargement de ${label} : ${Math.round((received / total) * 100)} %`)
      }
    }
  } catch {
    throw new Error(`Le téléchargement de ${label} a été interrompu : vérifiez votre connexion, puis réessayez.`)
  } finally {
    await new Promise((r) => out.end(r))
  }
  if (total && received < total) throw new Error(`Le téléchargement de ${label} est incomplet. Réessayez.`)
}

async function installUv() {
  if (fs.existsSync(uvExe())) return
  const work = path.join(lumen.dataDir, `.installation-${Date.now()}`)
  fs.mkdirSync(work, { recursive: true })
  try {
    const name = uvArchive()
    const archive = path.join(work, name)
    await download(`https://github.com/astral-sh/uv/releases/latest/download/${name}`, archive, 'uv')
    const x = await run(TAR, ['-xf', archive, '-C', work])
    if (x.code !== 0) throw new Error('Impossible d’extraire uv.')
    const exe = findFile(work, exeName('uv'))
    if (!exe) throw new Error('L’archive de uv ne contient pas ce qui est attendu.')
    fs.mkdirSync(path.dirname(uvExe()), { recursive: true })
    fs.renameSync(exe, uvExe())
    if (!WIN) fs.chmodSync(uvExe(), 0o755)
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

async function installManim() {
  if (fs.existsSync(pret())) return
  progress('Installation de uv…')
  await installUv()
  // Dernière ligne de uv comme progression (« Downloading numpy », « Installed 52 packages »…)
  const show = (l) => progress(`Installation de Manim : ${l.slice(0, 80)}`)
  progress('Installation de Python…')
  if (!fs.existsSync(python())) {
    const v = await run(uvExe(), ['venv', '--python', PYTHON_VERSION, '--python-preference', 'only-managed', venv()], { env: uvEnv() }, show)
    if (v.code !== 0) throw new Error(`Installation de Python impossible :\n${v.out.slice(-1500)}`)
  }
  progress('Installation de Manim…')
  const p = await run(uvExe(), ['pip', 'install', '--python', python(), 'manim'], { env: uvEnv() }, show)
  if (p.code !== 0) throw new Error(`Installation de Manim impossible :\n${p.out.slice(-1500)}`)
  fs.writeFileSync(pret(), new Date().toISOString())
}

// ---------------------------------------------------------------------------
// LaTeX : distribution de l'ordinateur, ou TinyTeX de l'extension LaTeX classique
// ---------------------------------------------------------------------------

const platformDir = () =>
  WIN ? 'windows' : process.platform === 'darwin' ? 'universal-darwin' : process.arch === 'arm64' ? 'aarch64-linux' : 'x86_64-linux'

function texDirs() {
  const dirs = [...(process.env.PATH ?? '').split(path.delimiter).filter(Boolean)]
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
      path.join(process.env.APPDATA ?? '', 'TinyTeX', 'bin', 'windows')
    )
  } else if (process.platform === 'darwin') {
    dirs.push('/Library/TeX/texbin', ...years('/usr/local/texlive', ['bin', 'universal-darwin']), '/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), 'Library', 'TinyTeX', 'bin', 'universal-darwin'))
  } else {
    dirs.push('/usr/bin', '/usr/local/bin', ...years('/usr/local/texlive', ['bin', 'x86_64-linux']), path.join(os.homedir(), '.TinyTeX', 'bin', 'x86_64-linux'))
  }
  // TinyTeX installé par l'extension LaTeX classique (dossier de données voisin) : pas besoin d'un second
  dirs.push(path.join(lumen.dataDir, '..', 'latex-classique', 'TinyTeX', 'bin', platformDir()))
  return [...new Set(dirs)]
}

/** Dossier des programmes LaTeX, ou null */
const texDir = () => texDirs().find((d) => fs.existsSync(path.join(d, exeName('latex')))) ?? null
/** TinyTeX (ou TeX Live) : on peut y ajouter des paquets avec tlmgr */
const tlmgrIn = (dir) => (WIN ? ['tlmgr.bat'] : ['tlmgr']).map((f) => path.join(dir, f)).find((f) => fs.existsSync(f)) ?? null

function tlmgr(dir, args) {
  const env = { ...process.env, PATH: dir + path.delimiter + (process.env.PATH ?? '') }
  // Windows : le lanceur officiel tlmgr.bat, par cmd.exe, chemin entre guillemets (il peut contenir une espace)
  if (WIN)
    return run('cmd.exe', ['/d', '/s', '/c', `""${path.join(dir, 'tlmgr.bat')}" ${args.join(' ')}"`], { env, windowsVerbatimArguments: true })
  return run(path.join(dir, 'tlmgr'), args, { env })
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

/** Paquets LaTeX de Manim ; un gestionnaire trop ancien pour le dépôt est d'abord mis à jour */
async function tlmgrInstall(dir, pkgs) {
  // Sous Windows, tlmgr.bat renvoie 0 même quand tlmgr refuse : ce sont ses messages qui font foi
  const failed = (r) => r.code !== 0 || /Terminating|needs to be updated|tlmgr\.pl: An error has occurred/i.test(r.out)
  let r = await tlmgr(dir, ['install', ...pkgs])
  for (let i = 0; i < 6 && failed(r) && /update-tlmgr|--self|infrastructure/i.test(r.out); i++) {
    if (i === 0) await tlmgr(dir, ['update', '--self'])
    await pause(5000)
    r = await tlmgr(dir, ['install', ...pkgs])
  }
  return !failed(r)
}

/** Paquets utilisés par le modèle LaTeX de Manim (standalone, preview, babel anglais) et dvisvgm */
const TEX_PAQUETS = ['dvisvgm', 'standalone', 'preview', 'babel-english', 'doublestroke', 'relsize', 'rsfs']

async function installTex() {
  const dir = texDir()
  if (!dir) throw new Error(SANS_LATEX)
  if (fs.existsSync(path.join(dir, exeName('dvisvgm')))) return
  if (!tlmgrIn(dir)) throw new Error(`Manim a besoin du programme dvisvgm, absent de votre distribution LaTeX (${dir}). Ajoutez-le avec son gestionnaire de paquets.`)
  progress('Ajout de dvisvgm et des paquets LaTeX de Manim…')
  if (!(await tlmgrInstall(dir, TEX_PAQUETS))) throw new Error('Impossible d’ajouter dvisvgm à votre distribution LaTeX. Réessayez plus tard.')
}

const SANS_LATEX =
  'Manim a besoin de LaTeX pour écrire les formules. Installez l’extension « LaTeX classique » puis lancez sa commande « Installer TinyTeX », ou installez une distribution TeX (TeX Live, MiKTeX, MacTeX).'

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

/**
 * Calcule la vidéo de la scène (code Python) dans <projet>/.lumentex/manim. Rend les chemins (relatifs au projet) de
 * la vidéo et ses étapes ({ name, duration }), ou l'erreur à renvoyer à l'IA.
 */
async function rendre({ root, code, qualite = 'l', dest }) {
  const out = path.join(root, '.lumentex', 'manim')
  const media = path.join(out, 'media')
  const tmp = path.join(media, 'tmp')
  fs.mkdirSync(tmp, { recursive: true })
  const scene = path.join(out, 'preuve.py')
  fs.writeFileSync(scene, code)
  // Ancienne vidéo retirée : jamais montrée à la place de la nouvelle
  fs.rmSync(path.join(media, 'videos', 'preuve'), { recursive: true, force: true })
  const tex = texDir()
  const env = {
    ...process.env,
    PATH: (tex ? tex + path.delimiter : '') + (process.env.PATH ?? ''),
    TMP: tmp,
    TEMP: tmp,
    TMPDIR: tmp,
    NO_COLOR: '1',
    COLUMNS: '160'
  }
  const timer = setTimeout(() => current?.kill(), 5 * 60 * 1000)
  const r = await run(python(), ['-I', '-B', '-X', 'utf8', GARDE, scene, media, qualite], { cwd: media, env }, (l) => {
    const m = /Animation (\d+)/.exec(l)
    if (m) progress(`Manim : animation ${Number(m[1]) + 1}…`)
  })
  clearTimeout(timer)
  if (r.code === -2) return { ok: false, stopped: true }
  const dir = path.join(media, 'videos', 'preuve', QUALITES[qualite])
  const video = path.join(dir, 'Preuve.mp4')
  if (r.code !== 0 || !fs.existsSync(video)) {
    // Fin du message (la cause d'une erreur Python est en bas), sans les lignes de progression
    const lines = r.out.split(/\r?\n/).filter((l) => l.trim() && !/^\s*(INFO|Animation \d+)/.test(l))
    return { ok: false, error: lines.slice(-60).join('\n') || `Manim s’est arrêté (code ${r.code}).` }
  }
  let sections = []
  try {
    sections = JSON.parse(fs.readFileSync(path.join(dir, 'sections', 'Preuve.json'), 'utf8')).map((s) => ({ name: String(s.name), duration: Number(s.duration) || 0 }))
  } catch {
    /* sans étapes */
  }
  const rel = (p) => path.relative(root, p).split(path.sep).join('/')
  if (dest) {
    const target = path.join(root, dest)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(video, target)
    return { ok: true, video: rel(target), sections }
  }
  return { ok: true, video: rel(video), sections }
}

export function activate(l) {
  lumen = l

  /** Manim installé ? LaTeX trouvé, avec dvisvgm ? */
  l.handle('etat', () => {
    const dir = texDir()
    return { manim: fs.existsSync(pret()), latex: !!dir, dvisvgm: !!dir && fs.existsSync(path.join(dir, exeName('dvisvgm'))) }
  })

  let installing = null
  l.handle(
    'installer',
    () =>
      (installing ??= (async () => {
        try {
          await installTex()
          await installManim()
        } finally {
          progress('')
          installing = null
        }
      })())
  )

  l.handle('rendre', (args) => rendre(args))

  l.handle('arreter', () => current?.kill())
}
