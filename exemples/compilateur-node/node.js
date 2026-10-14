// Partie Node.js : lance Tectonic (programme de l'ordinateur) et rend le PDF et le journal
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

let child = null

export function activate(lumen) {
  lumen.handle('verifier', (exe) =>
    exe && fs.existsSync(exe) ? { ok: true, version: 'via Node.js' } : { ok: false, reason: 'Indiquez le chemin de tectonic.exe dans les réglages de l’extension' }
  )
  lumen.handle(
    'compiler',
    ({ exe, root, mainFile, outDir }) =>
      new Promise((resolve) => {
        const out = path.join(root, outDir, 'ext')
        fs.mkdirSync(out, { recursive: true })
        let log = ''
        child = spawn(exe, ['-X', 'compile', '--synctex', '--outdir', out, mainFile], { cwd: root })
        const read = (d) => {
          log += d
          for (const l of String(d).split('\n')) if (l.startsWith('note:')) lumen.send('progression', l.slice(5).trim())
        }
        child.stdout.on('data', read)
        child.stderr.on('data', read)
        child.on('close', (code) => {
          child = null
          const pdf = path.join(out, path.basename(mainFile).replace(/\.tex$/i, '.pdf'))
          resolve({ ok: code === 0, pdf: fs.existsSync(pdf) ? pdf : null, log, error: code === 0 ? undefined : `Tectonic s’est arrêté (code ${code})` })
        })
      })
  )
  lumen.handle('arreter', () => child?.kill())
  lumen.log('partie Node.js prête, Node', process.version)
}
