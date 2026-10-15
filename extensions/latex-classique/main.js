/// <reference path="../../lumen.d.ts" />
// LaTeX classique : pdfLaTeX, XeLaTeX, LuaLaTeX et Latexmk, avec la distribution TeX installée sur l'ordinateur.
// Chaque programme est un compilateur du langage LaTeX : il apparaît dans le menu à côté de « Compiler » quand il est
// disponible. Le travail (programmes, journal, SyncTeX) est fait par la partie Node.js.

const TOOLS = [
  ['pdflatex', 'pdfLaTeX'],
  ['xelatex', 'XeLaTeX'],
  ['lualatex', 'LuaLaTeX'],
  ['latexmk', 'Latexmk']
]

/** @param {Lumen} lumen */
export async function activate(lumen) {
  lumen.node.on('progression', (text) => lumen.compile.progress(text))

  const opts = async () => ({
    dossier: (await lumen.settings.get('dossier')) || '',
    biblio: await lumen.settings.get('biblio'),
    moteur: await lumen.settings.get('moteur'),
    shellEscape: !!(await lumen.settings.get('shellEscape'))
  })
  const where = async () => ({ root: await lumen.project.root(), mainFile: await lumen.project.mainFile(), outDir: '.lumentex' })

  // Enregistrés de nouveau quand un réglage change : leur disponibilité est revérifiée
  const registerAll = async () => {
    for (const [tool, name] of TOOLS)
      await lumen.compilers.register({
        id: tool,
        name,
        language: 'latex',
        check: async () => lumen.node.call('verifier', tool, (await opts()).dossier),
        compile: async ({ root, mainFile, outDir }) => lumen.node.call('compiler', { tool, opts: await opts(), root, mainFile, outDir }),
        cancel: () => lumen.node.call('arreter'),
        sync: {
          forward: async (file, line) => lumen.node.call('versPdf', { ...(await where()), file, line }),
          reverse: async (page, x, y) => lumen.node.call('versTexte', { ...(await where()), page, x, y })
        }
      })
  }
  await registerAll()
  await lumen.settings.onChange((id) => (id === 'dossier' ? registerAll() : undefined))

  // TinyTeX : distribution TeX installée par l'extension quand l'ordinateur n'en a pas
  let installing = false
  const installTinytex = async () => {
    if (installing) return
    installing = true
    lumen.ui.notify('Installation de TinyTeX (environ 150 Mo) : vous pouvez continuer à travailler.')
    const off = (text) => (text ? lumen.ui.setStatus('tinytex', { text, tooltip: 'LaTeX classique' }) : lumen.ui.removeStatus('tinytex'))
    lumen.node.on('progression', (text) => installing && off(text))
    try {
      const r = await lumen.node.call('installerTinytex')
      await registerAll()
      lumen.ui.notify(
        r.already
          ? 'TinyTeX est déjà installé.'
          : `TinyTeX est installé : pdfLaTeX, XeLaTeX, LuaLaTeX et Latexmk sont disponibles à côté de « Compiler ».${r.biber ? '' : ' biber n’a pas pu être ajouté.'}`,
        'success'
      )
    } catch (e) {
      lumen.ui.notify(e.message, 'error')
    } finally {
      installing = false
      off('')
    }
  }
  await lumen.commands.register({ id: 'tinytex', label: 'Installer TinyTeX (distribution TeX)', run: installTinytex })

  // Aucune distribution sur l'ordinateur : proposé une fois
  const etat = await lumen.node.call('etat', (await opts()).dossier)
  if (!etat.found && !(await lumen.storage.get('tinytexPropose'))) {
    await lumen.storage.set('tinytexPropose', true)
    lumen.ui.notify('Aucune distribution TeX trouvée sur cet ordinateur. Installer TinyTeX pour utiliser pdfLaTeX, XeLaTeX, LuaLaTeX et Latexmk ?', 'info', {
      label: 'Installer',
      run: installTinytex
    })
  }
}
