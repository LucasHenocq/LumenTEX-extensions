// Lecture des fichiers SyncTeX (.synctex.gz) : aller du texte au PDF et du PDF au texte.
// Même méthode que Lumen TeX pour Tectonic. Coordonnées SyncTeX : points d'échelle (sp) depuis le coin supérieur
// gauche de la page, converties en points PostScript (1 bp = 65781,76 sp).
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

const RECORD = /^([[(vhxkg$])(\d+),(\d+):(-?\d+),(-?\d+)(?::(-?\d+)(?:,(-?\d+),(-?\d+))?)?/
const cache = new Map()

/** base : dossier depuis lequel le compilateur a été lancé (les chemins du fichier y sont relatifs) */
function load(file, base) {
  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    return null
  }
  const hit = cache.get(file)
  if (hit && hit.mtime === stat.mtimeMs) return hit.data
  const buf = fs.readFileSync(file)
  const text = file.endsWith('.gz') ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8')
  const inputs = new Map()
  const pages = new Map()
  let unit = 1
  let mag = 1000
  let xOff = 0
  let yOff = 0
  let page = 0
  let records = []
  for (const line of text.split('\n')) {
    if (line.startsWith('Input:')) {
      const m = /^Input:(\d+):(.*)$/.exec(line)
      if (m && m[2]) inputs.set(Number(m[1]), path.resolve(base, m[2]))
      continue
    }
    if (page === 0) {
      if (line.startsWith('Unit:')) unit = Number(line.slice(5)) || 1
      else if (line.startsWith('Magnification:')) mag = Number(line.slice(14)) || 1000
      else if (line.startsWith('X Offset:')) xOff = Number(line.slice(9)) || 0
      else if (line.startsWith('Y Offset:')) yOff = Number(line.slice(9)) || 0
    }
    const c = line[0]
    if (c === '{') {
      page = Number(line.slice(1))
      records = []
      continue
    }
    if (c === '}') {
      pages.set(page, records)
      continue
    }
    const m = RECORD.exec(line)
    if (m && page) {
      const f = (unit * mag) / 1000 / 65781.76
      records.push({
        type: m[1],
        tag: Number(m[2]),
        line: Number(m[3]),
        h: (Number(m[4]) + xOff) * f,
        v: (Number(m[5]) + yOff) * f,
        W: m[6] ? Number(m[6]) * f : 0,
        H: m[7] ? Number(m[7]) * f : 0,
        D: m[8] ? Number(m[8]) * f : 0
      })
    }
  }
  const data = { inputs, pages }
  cache.set(file, { mtime: stat.mtimeMs, data })
  return data
}

const same = (a, b) => {
  const n = (p) => {
    try {
      return fs.realpathSync(p).toLowerCase()
    } catch {
      return path.resolve(p).toLowerCase()
    }
  }
  return n(a) === n(b) || n(a + '.tex') === n(b)
}

/** Du texte (fichier absolu, ligne) au PDF : page et rectangles à surligner */
export function forward(synctex, base, file, line) {
  const data = load(synctex, base)
  if (!data) return null
  const tags = new Set([...data.inputs].filter(([, p]) => same(p, file)).map(([t]) => t))
  if (!tags.size) return null
  let best = null
  for (const [page, recs] of data.pages)
    for (const r of recs) {
      if (!tags.has(r.tag)) continue
      const dist = r.line === line ? 0 : r.line < line ? (line - r.line) * 2 : (r.line - line) * 2 + 1
      if (!best || dist < best.dist) best = { page, dist }
    }
  if (!best) return null
  const d = best.dist
  const target = d === 0 ? line : d % 2 === 0 ? line - d / 2 : line + (d - 1) / 2
  for (const page of [...data.pages.keys()].sort((a, b) => a - b)) {
    const all = data.pages.get(page)
    const recs = all.filter((r) => tags.has(r.tag) && r.line === target)
    if (!recs.length) continue
    let content = recs.filter((r) => 'xkg$h'.includes(r.type))
    if (!content.length) content = recs
    const baselines = []
    for (const r of content) {
      const g = baselines.find((b) => Math.abs(b[0].v - r.v) < 1)
      if (g) g.push(r)
      else baselines.push([r])
    }
    const rects = []
    for (const group of baselines.slice(0, 20)) {
      const v = group[0].v
      const minX = Math.min(...group.map((r) => r.h))
      const maxX = Math.max(...group.map((r) => r.h + r.W))
      let box = null
      for (const b of all) {
        if (b.type !== '(' || Math.abs(b.v - v) > 1 || minX < b.h - 1 || minX > b.h + b.W + 1) continue
        if (!box || b.W > box.W) box = b
      }
      if (box) rects.push({ x: box.h, y: box.v - Math.max(box.H, 7), w: Math.max(box.W, 4), h: Math.max(box.H, 7) + Math.max(box.D, 2) })
      else rects.push({ x: minX, y: v - 8, w: Math.max(20, maxX - minX), h: 11 })
    }
    const out = []
    for (const r of rects.sort((a, b) => a.y - b.y || a.x - b.x))
      if (!out.some((o) => Math.abs(o.x - r.x) < 0.5 && Math.abs(o.y - r.y) < 0.5 && Math.abs(o.w - r.w) < 0.5)) out.push(r)
    return { page, rects: out.slice(0, 40) }
  }
  return null
}

/** Du PDF (page, point) au texte : fichier absolu et ligne */
export function reverse(synctex, base, page, x, y) {
  const data = load(synctex, base)
  const recs = data?.pages.get(page)
  if (!recs?.length) return null
  let box = null
  for (const r of recs) {
    if (r.type !== '(' && r.type !== 'h') continue
    if (x >= r.h - 1 && x <= r.h + r.W + 1 && y >= r.v - r.H - 1 && y <= r.v + r.D + 1)
      if (!box || r.W * (r.H + r.D) < box.W * (box.H + box.D)) box = r
  }
  let best = null
  let bestScore = Infinity
  for (const r of recs) {
    if (r.type === '[' || r.type === 'v' || !data.inputs.has(r.tag)) continue
    let score
    if (box) {
      if (Math.abs(r.v - box.v) > 0.5 || r.h < box.h - 1 || r.h > box.h + box.W + 1) continue
      score = r.h <= x ? x - r.h : (r.h - x) * 3
    } else score = Math.abs(r.v - y) * 3 + Math.abs(r.h - x)
    if (score < bestScore) {
      bestScore = score
      best = r
    }
  }
  const hit = best ?? box
  const file = hit && data.inputs.get(hit.tag)
  if (!file) return null
  return { file: fs.existsSync(file) ? file : fs.existsSync(file + '.tex') ? file + '.tex' : file, line: hit.line }
}
