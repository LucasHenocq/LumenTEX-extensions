// Langage « Démo » (.demo) et son compilateur, écrit sans programme externe : le PDF est fabriqué ici.

function pdfFromText(lines) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => '\\' + c)
  const stream = ['BT', '/F1 14 Tf', '72 760 Td', '18 TL', ...lines.map((l) => `(${esc(l)}) '`), 'ET'].join('\n')
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let out = '%PDF-1.4\n'
  const offsets = []
  objs.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}

export async function activate(lumen) {
  await lumen.compilers.register({
    id: 'demo',
    name: 'Démo',
    language: 'demo',
    compile: async ({ mainFile }) => {
      await lumen.compile.progress('Fabrication du PDF de démonstration…')
      const text = await lumen.project.read(mainFile)
      const lines = text.split(/\r?\n/)
      const diagnostics = []
      lines.forEach((l, i) => {
        if (l.includes('ERREUR')) diagnostics.push({ file: mainFile, line: i + 1, severity: 'error', message: 'Ligne marquée ERREUR' })
      })
      return { pdf: pdfFromText(lines.map((l) => l.replace(/[^\x20-\x7e]/g, '?'))), log: `${lines.length} lignes`, diagnostics }
    }
  })
  lumen.log('compilateurs enregistrés')
}
