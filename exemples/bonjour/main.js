/// <reference path="../../lumen.d.ts" />
// Exemple : un peu de tout. Fonctionne vérifiée (dans la fenêtre) ou isolée (cadre), sans changement.
export async function activate(lumen) {
  const n = ((await lumen.storage.get('lancements')) ?? 0) + 1
  await lumen.storage.set('lancements', n)
  lumen.log(`activée (${lumen.trusted ? 'confiance' : 'isolée'}), lancement n°${n}`)

  await lumen.commands.register({
    id: 'salut',
    label: 'Dire bonjour',
    shortcut: 'Mod-Alt-b',
    run: async () => lumen.ui.notify(`${await lumen.settings.get('salutation')} !`, 'success')
  })

  await lumen.ui.setStatus('etat', { text: '👋 Bonjour', tooltip: 'Extension Bonjour', onClick: () => lumen.ui.notify('Clic sur la barre d’état') })

  await lumen.ui.addPanel({ id: 'panneau', title: 'Bonjour' }, (el) => {
    el.innerHTML = '<p>Panneau de l’extension Bonjour.</p><button class="btn primary" id="compter">Compter les fichiers</button><p id="resultat"></p>'
    el.querySelector('#compter').addEventListener('click', async () => {
      const files = await lumen.project.list()
      el.querySelector('#resultat').textContent = `${files.length} fichier${files.length > 1 ? 's' : ''} dans le projet`
    })
  })

  await lumen.completion.register({
    languages: ['latex'],
    provide: ({ word }) => ('bonjour'.startsWith(word) && word.length >= 3 ? [{ label: 'bonjour', insert: 'Bonjour tout le monde', detail: 'Bonjour' }] : [])
  })

  // TODO soulignés dans le fichier actif
  const souligner = async () => {
    const file = await lumen.editor.activeFile()
    if (!file || !(await lumen.settings.get('todo'))) return lumen.diagnostics.clear()
    const text = (await lumen.editor.getText()) ?? ''
    const items = []
    for (const m of text.matchAll(/TODO/g)) items.push({ file, from: m.index, to: m.index + 4, severity: 'warning', message: 'Reste à faire' })
    await lumen.diagnostics.set(items)
  }
  await lumen.editor.onChange(souligner)
  await lumen.editor.onActiveChange(souligner)
  await lumen.settings.onChange(souligner)
  await souligner()

  await lumen.compile.onDone((r) => lumen.log(`compilation terminée : ${r.ok ? 'réussie' : 'échouée'}`))
}
