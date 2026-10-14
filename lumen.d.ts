// Types de l'objet `lumen` reçu par les extensions avec code (Lumen TeX 1.5.0).
// Dans VS Code, ajoutez en tête de votre main.js :   /// <reference path="../../lumen.d.ts" />
// et écrivez :   /** @param {Lumen} lumen */ export function activate(lumen) { … }
// Toutes les fonctions peuvent être attendues avec await, que l'extension soit vérifiée ou isolée.

type MaybePromise<T> = T | Promise<T>

interface LumenDiagnostic {
  /** Fichier, relatif au projet */
  file: string
  severity: 'error' | 'warning' | 'info'
  message: string
  /** Ligne (à partir de 1), ou position exacte dans le texte (from, to) */
  line?: number
  from?: number
  to?: number
}

interface LumenCompileResult {
  ok: boolean
  /** Chemin absolu du PDF */
  pdfPath: string | null
  diagnostics: LumenDiagnostic[]
  log: string
  durationMs: number
  error?: string
}

interface LumenCompilerOutput {
  ok?: boolean
  /** PDF : octets, ou chemin (relatif au projet, ou absolu) */
  pdf?: Uint8Array | string | null
  log?: string
  diagnostics?: LumenDiagnostic[]
  /** Message affiché si la compilation échoue */
  error?: string
}

interface LumenPerson {
  /** Identifiant stable de la personne */
  id: string
  name: string
  color: string
}

interface LumenFetchResponse {
  ok: boolean
  status: number
  headers: Record<string, string>
  bytes(): Uint8Array
  text(): string
  json(): any
}

interface Lumen {
  /** Version de Lumen TeX */
  version: string
  extension: { id: string; name: string; version: string }
  /** true : dans la fenêtre (vérifiée, ou mode développeur) ; false : isolée */
  trusted: boolean

  commands: {
    /** Commande de la palette ; raccourci au format « Mod-Shift-K » (Mod = Ctrl, ⌘ sur Mac) */
    register(c: { id: string; label: string; shortcut?: string; run: () => unknown }): Promise<void>
    /** Commande de Lumen TeX (« compile »…) ou d'une extension (« id-extension:commande ») */
    execute(id: string): Promise<void>
  }

  ui: {
    /** Panneau dans la barre de gauche (icône du manifeste). Isolée : `el` est la page de l'extension */
    addPanel(def: { id: string; title: string }, render: (el: HTMLElement) => void): Promise<void>
    openPanel(id: string): Promise<void>
    /** Élément à droite de la barre d'état */
    setStatus(id: string, item: { text: string; tooltip?: string; onClick?: () => unknown }): Promise<void>
    removeStatus(id: string): Promise<void>
    notify(text: string, kind?: 'info' | 'success' | 'warning' | 'error', action?: { label: string; run: () => unknown }): Promise<void>
    confirm(message: string, detail?: string, ok?: string, cancel?: string): Promise<boolean>
    /** null si l'utilisateur annule */
    prompt(message: string, value?: string, placeholder?: string): Promise<string | null>
  }

  editor: {
    activeFile(): MaybePromise<string | null>
    /** Texte d'un fichier du projet (celui de l'éditeur s'il est ouvert, même non enregistré) */
    getText(path?: string): Promise<string | null>
    getSelection(): MaybePromise<{ file: string; from: number; to: number; text: string; line: number; column: number } | null>
    replaceSelection(text: string): Promise<void>
    /** snippet : gabarit avec champs ${1:texte} */
    insert(text: string, opts?: { snippet?: boolean }): Promise<void>
    replaceRange(from: number, to: number, text: string): Promise<void>
    goto(path: string, line?: number): Promise<void>
    onChange(fn: (path: string) => unknown): Promise<void>
    onActiveChange(fn: (path: string | null) => unknown): Promise<void>
    /** Vérifiée seulement : l'EditorView de CodeMirror */
    view?(): any
    /** Vérifiée seulement : extension CodeMirror (construite avec lumen.codemirror), limitée à des langages */
    addExtension?(ext: any, opts?: { languages?: string[] }): Promise<void>
  }

  completion: {
    /**
     * Propositions d'autocomplétion. languages : identifiants (« latex ») ou extensions (« .typ ») ; match : expression
     * régulière (texte) du mot complété, avant le curseur.
     */
    register(c: {
      languages?: string[]
      match?: string
      provide(ctx: { path: string; word: string; line: string; pos: number }): MaybePromise<
        { label: string; insert?: string; snippet?: string; detail?: string; info?: string }[]
      >
    }): Promise<void>
  }

  diagnostics: {
    /** Remplace les problèmes signalés par l'extension (panneau Problèmes, soulignés dans l'éditeur) */
    set(items: LumenDiagnostic[]): Promise<void>
    clear(): Promise<void>
  }

  project: {
    /** Dossier du projet ouvert (absolu), ou null */
    root(): MaybePromise<string | null>
    mainFile(): MaybePromise<string | null>
    /** Fichiers du projet, chemins relatifs */
    list(): MaybePromise<string[]>
    read(path: string): Promise<string>
    readBinary(path: string): Promise<Uint8Array>
    write(path: string, text: string): Promise<void>
    writeBinary(path: string, data: Uint8Array): Promise<void>
    onFilesChanged(fn: (paths: string[]) => unknown): Promise<void>
    onOpen(fn: (root: string | null) => unknown): Promise<void>
  }

  compile: {
    run(): Promise<void>
    /** Ligne de progression dans la barre d'état (pendant que votre compilateur travaille) */
    progress(text: string): Promise<void>
    onStart(fn: (e: { mainFile: string; compiler: string }) => unknown): Promise<void>
    onDone(fn: (r: LumenCompileResult) => unknown): Promise<void>
  }

  compilers: {
    /**
     * Compilateur pour un langage (« latex », ou un langage déclaré par une extension). S'il y a plusieurs
     * compilateurs disponibles pour le langage du fichier principal, l'utilisateur choisit. check absent : disponible.
     */
    register(c: {
      id: string
      name: string
      language: string
      check?: () => MaybePromise<{ ok: boolean; version?: string; reason?: string }>
      compile: (ctx: { root: string; mainFile: string; outDir: string }) => MaybePromise<LumenCompilerOutput>
      cancel?: () => unknown
      sync?: {
        forward?: (file: string, line: number) => MaybePromise<{ page: number; rects: { x: number; y: number; w: number; h: number }[] } | null>
        reverse?: (page: number, x: number, y: number) => MaybePromise<{ file: string; line: number } | null>
      }
    }): Promise<void>
  }

  languages: {
    /** Langage (aussi déclarable dans le manifeste) ; editor : extension CodeMirror (vérifiée seulement) */
    register(l: { id: string; name: string; extensions: string[]; editor?: any; autoCompile?: boolean }): Promise<void>
  }

  session: {
    active(): MaybePromise<boolean>
    me(): MaybePromise<LumenPerson | null>
    people(): MaybePromise<LumenPerson[]>
    onActive(fn: (active: boolean) => unknown): Promise<void>
    onPeople(fn: (people: LumenPerson[]) => unknown): Promise<void>
    /** Données JSON ou octets (Uint8Array, 1 Mo au plus), à tous ou à une personne (id). Permission « session » */
    send(data: unknown, to?: string): Promise<void>
    onMessage(fn: (from: string, data: unknown) => unknown): Promise<void>
  }

  settings: {
    /** Valeur d'un réglage déclaré dans le manifeste */
    get(id: string): MaybePromise<unknown>
    all(): MaybePromise<Record<string, unknown>>
    onChange(fn: (id: string, value: unknown) => unknown): Promise<void>
  }

  storage: {
    get(key: string): MaybePromise<unknown>
    set(key: string, value: unknown): Promise<void>
  }

  /** Internet. Non vérifiée : seulement les sites déclarés dans permissions.network */
  fetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array }): Promise<LumenFetchResponse>

  log(...args: unknown[]): void

  /** Vérifiée seulement : appels à la partie Node.js (fichier « node » du manifeste) */
  node: {
    call(method: string, ...args: unknown[]): Promise<any>
    on(event: string, fn: (data: unknown) => unknown): Promise<void>
  }

  /** Vérifiée seulement : les modules CodeMirror de l'éditeur (une seule copie peut fonctionner) */
  codemirror: {
    state: any
    view: any
    language: any
    autocomplete: any
    commands: any
    lint: any
    search: any
    highlight: any
  } | null
}

/** Objet reçu par la partie Node.js (fichier « node » du manifeste) */
interface LumenNode {
  version: string
  /** Répond à lumen.node.call(name, …) */
  handle(name: string, fn: (...args: any[]) => unknown): void
  /** Événement reçu par lumen.node.on(name, …) */
  send(name: string, data?: unknown): void
  log(...args: unknown[]): void
}
