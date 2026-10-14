// Partie fenêtre : enregistre le compilateur, délègue le travail à la partie Node.js
export async function activate(lumen) {
  lumen.node.on('progression', (t) => lumen.compile.progress(t))
  await lumen.compilers.register({
    id: 'tectonic',
    name: 'Tectonic (extension)',
    language: 'latex',
    check: async () => lumen.node.call('verifier', await lumen.settings.get('chemin')),
    compile: async ({ root, mainFile, outDir }) =>
      lumen.node.call('compiler', { exe: await lumen.settings.get('chemin'), root, mainFile, outDir }),
    cancel: () => lumen.node.call('arreter')
  })
}
