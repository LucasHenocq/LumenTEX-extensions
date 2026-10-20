/// <reference path="../../lumen.d.ts" />
// Manim : l'IA de l'utilisateur écrit une animation Manim de la preuve où se trouve le curseur (ou du texte
// sélectionné), une section par étape. La partie Node.js la calcule (Python, Manim et LaTeX), en cas d'erreur l'IA
// corrige. La vidéo s'affiche dans une fenêtre avec la liste des étapes : cliquer une étape la rejoue et place le
// curseur sur la phrase de la preuve.

const TOURS = 4

const SYSTEM =
  'Tu écris des animations mathématiques avec Manim Community Edition (version 0.19 ou plus récente) pour faire comprendre des preuves. Tu réponds par un unique bloc ```python contenant le fichier complet.'

const ENONCES = /^(theorem|thm|th[ée]or[èe]me|lemma|lem|lemme|proposition|prop|corollary|cor|corollaire|claim|fact|propri[ée]t[ée]|exercise|exercice|example|exemple)\*?$/i

/**
 * Preuve autour de la position pos : environnement proof, avec l'énoncé qui le précède (theorem, lemme…). Le curseur
 * peut être dans l'un ou l'autre.
 */
function trouverPreuve(text, pos) {
  const re = /\\begin\{proof\}(?:\[[^\]]*\])?/g
  for (let m; (m = re.exec(text)); ) {
    const end = text.indexOf('\\end{proof}', m.index)
    if (end < 0) break
    let from = m.index
    let statement = ''
    // Énoncé juste avant (seulement des espaces entre les deux)
    const before = text.slice(0, m.index).replace(/\s+$/, '')
    const fin = /\\end\{([^}]+)\}$/.exec(before)
    if (fin && ENONCES.test(fin[1])) {
      const debut = before.lastIndexOf(`\\begin{${fin[1]}}`)
      if (debut >= 0) {
        statement = before.slice(debut + fin[1].length + 8, before.length - fin[0].length).replace(/^\[[^\]]*\]/, '').trim()
        from = debut
      }
    }
    if (pos >= from && pos <= end + 11) return { statement, proof: text.slice(m.index + m[0].length, end).trim(), from: m.index }
  }
  return null
}

const ligneDe = (text, offset) => text.slice(0, offset).split('\n').length

/** Ligne de la citation d'une étape dans le fichier (espaces ignorés), ou null */
function ligneCitation(text, start, citation) {
  const mots = citation.split(/\s+/).filter(Boolean)
  if (!mots.length) return null
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Citation entière, puis ses premiers mots
  for (const n of [mots.length, Math.min(5, mots.length), Math.min(3, mots.length)]) {
    const re = new RegExp(mots.slice(0, n).map(esc).join('\\s+'))
    const m = re.exec(text.slice(start))
    if (m) return ligneDe(text, start + m.index)
  }
  return null
}

function consignes(p) {
  return [
    'Voici une preuve tirée d’un document. Écris une animation Manim qui la fait comprendre visuellement, étape par étape.',
    p.statement ? `\nÉnoncé :\n${p.statement}` : '',
    `\nPreuve :\n${p.proof}`,
    '\nConsignes :',
    '- Un fichier Python complet : `from manim import *` (et si besoin `import numpy as np`, `import math`, `import random`, `import itertools`), rien d’autre. Ni fichier lu ou écrit, ni image, ni son, ni `open`, `eval`, `exec`, `getattr`, ni attribut commençant par « _ » : un garde-fou refuse ce code.',
    '- Une seule scène, nommée `Preuve` : `class Preuve(Scene):` (ou `MovingCameraScene`, `ThreeDScene` si c’est utile).',
    '- Suis la preuve dans l’ordre. Chaque étape commence par `self.next_section("Titre court | citation")`, où la citation est un morceau de la preuve recopié mot pour mot (5 à 12 mots, tels qu’ils sont écrits dans le texte source, commandes LaTeX comprises) : l’éditeur s’en sert pour retrouver la phrase.',
    '- Montre ce que dit chaque étape plutôt que de recopier le texte : figure, graphique, transformation de formules (TransformMatchingTex), couleurs pour suivre les objets. Textes courts, dans la langue de la preuve : `Text` pour le texte (accents compris), `MathTex` pour les formules.',
    '- Tout reste dans le cadre (16:9) : `.scale`, `.to_edge`, `.arrange`, et `FadeOut` de ce qui ne sert plus.',
    '- Durée totale : 30 à 90 secondes.',
    '- API de Manim Community seulement (pas ManimGL) : `Create`, `Write`, `FadeIn`, `Transform`… ; pas `ShowCreation` ni `TextMobject`.'
  ].join('\n')
}

const codeDe = (reponse) => {
  const blocs = [...reponse.matchAll(/```(?:python|py)?\s*\n([\s\S]*?)```/g)].map((m) => m[1])
  return blocs.sort((a, b) => b.length - a.length)[0] ?? null
}

/** @param {Lumen} lumen */
export async function activate(lumen) {
  /** Fenêtre ouverte : ses éléments ; null sinon */
  let ui = null
  let enCours = false
  let arrete = false
  let derniere = null // { file, text, preuve, code }

  let installation = false
  // Progression de la partie Node.js : installation dans la barre d'état, rendu dans la fenêtre
  lumen.node.on('progression', (t) => {
    if (installation) void (t ? lumen.ui.setStatus('manim', { text: t, tooltip: 'Manim' }) : lumen.ui.removeStatus('manim'))
    else if (t && ui) setStatut(t)
  })

  function setStatut(text, kind = '') {
    ui.statut.textContent = text
    ui.statut.className = `manim-statut ${kind}`
  }

  function construire(el) {
    el.innerHTML = `
      <style>
        .manim { display: flex; flex-direction: column; gap: 8px; height: 100%; font-size: 12.5px; }
        .manim-statut { color: var(--text-muted); min-height: 1.4em; white-space: pre-wrap; }
        .manim-statut.erreur { color: var(--danger, #e5534b); max-height: 9em; overflow: auto; }
        .manim video { width: 100%; background: #000; border-radius: 6px; display: none; }
        .manim ol { margin: 0; padding-left: 22px; overflow: auto; flex: 1; min-height: 40px; }
        .manim li { padding: 3px 4px; border-radius: 4px; cursor: pointer; }
        .manim li:hover { background: var(--hover, rgba(127,127,127,.15)); }
        .manim li.actif { color: var(--accent); font-weight: 600; }
        .manim-boutons { display: flex; gap: 6px; flex-wrap: wrap; }
        .manim pre { display: none; margin: 0; max-height: 40%; overflow: auto; padding: 8px; border-radius: 6px; background: var(--panel, rgba(127,127,127,.1)); font: 11.5px/1.45 var(--font-mono, monospace); user-select: text; }
      </style>
      <div class="manim">
        <div class="manim-statut"></div>
        <video controls></video>
        <ol></ol>
        <pre></pre>
        <div class="manim-boutons">
          <button class="btn small" data-a="arreter">Arrêter</button>
          <button class="btn small" data-a="recommencer">Nouvelle animation</button>
          <button class="btn small" data-a="hd">Enregistrer en haute qualité</button>
          <button class="btn small" data-a="code">Voir le code</button>
        </div>
      </div>`
    ui = {
      statut: el.querySelector('.manim-statut'),
      video: el.querySelector('video'),
      etapes: el.querySelector('ol'),
      code: el.querySelector('pre'),
      boutons: Object.fromEntries([...el.querySelectorAll('button')].map((b) => [b.dataset.a, b])),
      url: null,
      debuts: []
    }
    ui.boutons.arreter.onclick = arreter
    ui.boutons.recommencer.onclick = () => derniere && generer(derniere)
    ui.boutons.hd.onclick = exporter
    ui.boutons.code.onclick = () => {
      const voir = ui.code.style.display !== 'block'
      ui.code.textContent = derniere?.code ?? ''
      ui.code.style.display = voir ? 'block' : 'none'
      ui.boutons.code.textContent = voir ? 'Cacher le code' : 'Voir le code'
    }
    // Étape en cours de lecture surlignée
    ui.video.ontimeupdate = () => {
      const t = ui.video.currentTime
      ;[...ui.etapes.children].forEach((li, i) => li.classList.toggle('actif', t >= ui.debuts[i] && (i + 1 >= ui.debuts.length || t < ui.debuts[i + 1])))
    }
    boutons()
  }

  function boutons() {
    if (!ui) return
    ui.boutons.arreter.style.display = enCours ? '' : 'none'
    for (const k of ['recommencer', 'hd', 'code']) ui.boutons[k].disabled = enCours || !derniere?.code
    ui.boutons.recommencer.disabled = enCours || !derniere
  }

  async function arreter() {
    arrete = true
    await lumen.ai.stop()
    await lumen.node.call('arreter')
  }

  async function montrer(r) {
    const bytes = await lumen.project.readBinary(r.video)
    if (ui.url) URL.revokeObjectURL(ui.url)
    ui.url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }))
    ui.video.src = ui.url
    ui.video.style.display = 'block'
    ui.etapes.innerHTML = ''
    ui.debuts = []
    let t = 0
    for (const s of r.sections) {
      ui.debuts.push(t)
      const debut = t
      t += s.duration
      const [titre, citation = ''] = s.name.split(' | ')
      const li = document.createElement('li')
      li.textContent = titre
      li.title = citation
      li.onclick = () => {
        ui.video.currentTime = debut + 0.01
        void ui.video.play()
        const { file, text, preuve } = derniere
        const ligne = ligneCitation(text, preuve.from, citation) ?? ligneDe(text, preuve.from)
        void lumen.editor.goto(file, ligne)
      }
      ui.etapes.appendChild(li)
    }
    void ui.video.play()
  }

  /** L'IA écrit la scène, Manim la calcule ; en cas d'erreur, l'IA corrige (TOURS essais) */
  async function generer(ctx) {
    if (enCours) return
    enCours = true
    arrete = false
    boutons()
    const base = consignes(ctx.preuve)
    let code = null
    let erreur = null
    try {
      for (let tour = 1; tour <= TOURS && !arrete; tour++) {
        setStatut(tour === 1 ? 'L’IA écrit l’animation…' : `Manim a signalé une erreur : l’IA corrige (essai ${tour} sur ${TOURS})…`)
        const question = code
          ? `${base}\n\nTon code précédent :\n\`\`\`python\n${code}\n\`\`\`\n\na échoué avec ce message :\n\`\`\`\n${erreur.slice(-4000)}\n\`\`\`\n\nCorrige-le et renvoie le fichier complet.`
          : base
        const reponse = await lumen.ai.ask(question, {
          system: SYSTEM,
          onText: (_, t) => ui && setStatut(`${tour === 1 ? 'L’IA écrit l’animation' : `L’IA corrige (essai ${tour} sur ${TOURS})`}… ${t.length} caractères`)
        })
        if (arrete) break
        const nouveau = codeDe(reponse)
        if (!nouveau) {
          erreur = 'Ta réponse ne contient pas de bloc ```python.'
          code = code ?? ''
          continue
        }
        code = nouveau
        setStatut('Manim calcule la vidéo…')
        const r = await lumen.node.call('rendre', { root: await lumen.project.root(), code })
        if (r.stopped || arrete) break
        if (r.ok) {
          derniere = { ...ctx, code }
          if (!ui) return
          await montrer(r)
          if (ui.code.style.display === 'block') ui.code.textContent = code
          setStatut(r.sections.length ? 'Cliquez une étape pour la revoir et retrouver sa phrase dans la preuve.' : '')
          return
        }
        erreur = r.error
      }
      if (ui) setStatut(arrete ? 'Arrêté.' : `L’animation n’a pas pu être calculée après ${TOURS} essais :\n${(erreur ?? '').split('\n').slice(-6).join('\n')}`, arrete ? '' : 'erreur')
      derniere = { ...ctx, code }
    } catch (e) {
      derniere = { ...ctx, code }
      if (ui) setStatut(e.message, 'erreur')
    } finally {
      enCours = false
      boutons()
    }
  }

  async function exporter() {
    if (!derniere?.code || enCours) return
    enCours = true
    boutons()
    setStatut('Manim calcule la vidéo en haute qualité (1080p)…')
    try {
      const dest = `animations/preuve-ligne-${ligneDe(derniere.text, derniere.preuve.from)}.mp4`
      const r = await lumen.node.call('rendre', { root: await lumen.project.root(), code: derniere.code, qualite: 'h', dest })
      if (r.ok) {
        setStatut(`Vidéo enregistrée dans le projet : ${dest}`)
        lumen.ui.notify(`Vidéo enregistrée : ${dest}`, 'success')
      } else if (!r.stopped) setStatut(r.error.split('\n').slice(-6).join('\n'), 'erreur')
    } catch (e) {
      setStatut(e.message, 'erreur')
    } finally {
      enCours = false
      boutons()
    }
  }

  /** Python, Manim et LaTeX prêts ; sinon installés après accord. false si l'utilisateur refuse ou si ça échoue */
  async function pret() {
    const e = await lumen.node.call('etat')
    if (e.manim && e.latex && e.dvisvgm) return true
    if (!e.latex) {
      await lumen.ui.confirm(
        'Manim a besoin de LaTeX pour écrire les formules.',
        'Installez l’extension « LaTeX classique » puis lancez sa commande « Installer TinyTeX », ou installez une distribution TeX (TeX Live, MiKTeX, MacTeX).',
        'Compris',
        'Fermer'
      )
      return false
    }
    const quoi = [!e.manim && 'Python et Manim (environ 400 Mo, dans le dossier de l’extension)', !e.dvisvgm && 'le programme dvisvgm et quelques paquets LaTeX']
      .filter(Boolean)
      .join(', et ')
    if (!(await lumen.ui.confirm('Installer ce qu’il faut pour Manim ?', `Seront installés : ${quoi}. Il faut une connexion à Internet, et une à deux minutes.`, 'Installer')))
      return false
    installation = true
    try {
      await lumen.ui.setStatus('manim', { text: 'Installation de Manim…', tooltip: 'Manim' })
      await lumen.node.call('installer')
      lumen.ui.notify('Manim est installé.', 'success')
      return true
    } catch (e) {
      lumen.ui.notify(e.message, 'error')
      return false
    } finally {
      installation = false
      await lumen.ui.removeStatus('manim')
    }
  }

  async function visualiser() {
    if (enCours) return void lumen.ui.openWindow({ id: 'manim', title: 'Manim' }, construire)
    const sel = await lumen.editor.getSelection()
    if (!sel) return void lumen.ui.notify('Ouvrez le fichier de la preuve.', 'info')
    const text = (await lumen.editor.getText(sel.file)) ?? ''
    const preuve = sel.text.trim() ? { statement: '', proof: sel.text.trim(), from: sel.from } : trouverPreuve(text, sel.from)
    if (!preuve)
      return void lumen.ui.notify('Placez le curseur dans une preuve (\\begin{proof}…\\end{proof}) ou sélectionnez le texte à animer.', 'info')
    if (!(await pret())) return
    if (!(await lumen.ai.available()).ready)
      return void lumen.ui.notify('Aucune IA n’est prête : choisissez et connectez une IA dans le panneau de l’assistant.', 'error')
    await lumen.ui.openWindow(
      {
        id: 'manim',
        title: `Manim : preuve de la ligne ${ligneDe(text, preuve.from)}`,
        width: 640,
        height: 560,
        onClose: () => {
          if (enCours) void arreter()
          if (ui?.url) URL.revokeObjectURL(ui.url)
          ui = null
        }
      },
      construire
    )
    void generer({ file: sel.file, text, preuve })
  }

  await lumen.commands.register({ id: 'visualiser', label: 'Visualiser la preuve avec Manim', run: visualiser })
}
