# Garde-fou de l'extension Manim : le code de la scène est écrit par une IA, à partir du texte d'un document (qui peut
# venir de quelqu'un d'autre). Avant de le lancer :
#  1. son code est lu sans être exécuté (module ast) : imports limités à manim, numpy, math, random et itertools ;
#     ni open, eval, exec, getattr…, ni attribut commençant par « _ » (ce qui ferme l'accès aux entrailles de Python) ;
#  2. pendant le rendu, un « audit hook » (PEP 578, impossible à retirer une fois posé) refuse : les programmes autres
#     que latex et dvisvgm, le réseau, l'écriture hors du dossier de sortie, et ctypes.
# Ce n'est pas une prison parfaite (Python n'en offre pas), mais il faut franchir les deux barrières à la fois.
#
# python -I -B garde.py <scene.py> <dossier de sortie> <qualité l|m|h>

import ast
import os
import sys

IMPORTS = {'manim', 'numpy', 'math', 'random', 'itertools'}
NOMS = {
    'eval', 'exec', 'compile', 'open', '__import__', 'getattr', 'setattr', 'delattr', 'globals', 'locals', 'vars',
    'input', 'breakpoint', 'help', 'exit', 'quit', 'memoryview', 'os', 'sys', 'subprocess', 'shutil', 'pathlib',
    'Path', 'socket', 'importlib', 'builtins', 'ctypes', 'tempfile'
}
ATTRIBUTS = {
    'system', 'popen', 'spawn', 'ctypeslib', 'load_library', 'tofile', 'fromfile', 'memmap', 'save', 'savez',
    'savetxt', 'load', 'loadtxt', 'genfromtxt', 'f_globals', 'f_locals', 'f_back', 'f_builtins', 'gi_frame',
    'gi_code', 'cr_frame', 'ag_frame', 'tb_frame', 'tb_next', 'mro', 'environ', 'putenv',
    'subprocess', 'os', 'sys', 'shutil', 'builtins', 'importlib', 'socket', 'ctypes'
}


def verifier(source):
    """Liste des problèmes du code (vide : accepté)"""
    try:
        arbre = ast.parse(source)
    except SyntaxError as e:
        return [f'Erreur de syntaxe ligne {e.lineno} : {e.msg}']
    pb = []
    scene = False
    for n in ast.walk(arbre):
        ligne = getattr(n, 'lineno', '?')
        if isinstance(n, ast.Import):
            for a in n.names:
                if a.name.split('.')[0] not in IMPORTS:
                    pb.append(f'ligne {ligne} : import {a.name} interdit')
        elif isinstance(n, ast.ImportFrom):
            if (n.module or '').split('.')[0] not in IMPORTS or n.level:
                pb.append(f'ligne {ligne} : import depuis {n.module} interdit')
        elif isinstance(n, ast.Name):
            if n.id in NOMS or n.id.startswith('__'):
                pb.append(f'ligne {ligne} : « {n.id} » interdit')
        elif isinstance(n, ast.Attribute):
            if n.attr.startswith('_') or n.attr in ATTRIBUTS:
                pb.append(f'ligne {ligne} : attribut « {n.attr} » interdit')
        elif isinstance(n, (ast.Global, ast.Nonlocal)):
            pb.append(f'ligne {ligne} : global et nonlocal interdits')
        elif isinstance(n, ast.ClassDef) and n.name == 'Preuve':
            scene = True
    if not scene:
        pb.append('il manque la classe Preuve(Scene)')
    return pb


def garder(sortie):
    """Barrière pendant le rendu : programmes, réseau, écritures, ctypes"""
    racines = [os.path.normcase(os.path.realpath(sortie))]
    programmes = {'latex', 'dvisvgm'}

    def dedans(p):
        if isinstance(p, int):
            return True  # descripteur déjà ouvert
        if isinstance(p, bytes):
            p = os.fsdecode(p)
        if os.fspath(p) == os.devnull:
            return True
        p = os.path.normcase(os.path.realpath(os.fspath(p)))
        return any(p == r or p.startswith(r + os.sep) for r in racines)

    ecriture = os.O_WRONLY | os.O_RDWR | os.O_APPEND | os.O_CREAT | os.O_TRUNC

    def hook(evt, args):
        if evt == 'subprocess.Popen':
            exe, argv = args[0], args[1]
            prog = exe or (argv[0] if isinstance(argv, (list, tuple)) and argv else str(argv).split()[0])
            nom = os.path.splitext(os.path.basename(os.fsdecode(prog)))[0].lower()
            if nom not in programmes:
                raise PermissionError(f'Programme refusé : {nom}')
            # LaTeX sans commandes externes (\write18)
            texte = ' '.join(map(os.fsdecode, argv)) if isinstance(argv, (list, tuple)) else os.fsdecode(argv)
            if 'shell-escape' in texte or 'write18' in texte:
                raise PermissionError('LaTeX avec commandes externes refusé')
            # Environnement imposé (« shell_escape=t » réactiverait \write18 sans option)
            if args[3] is not None:
                raise PermissionError('Environnement des programmes imposé : refusé')
        elif evt in ('os.putenv', 'os.unsetenv', 'os.system', 'os.exec', 'os.spawn', 'os.posix_spawn', 'os.startfile',
                     'os.fork', 'os.forkpty',
                     'socket.connect', 'socket.bind', 'socket.getaddrinfo', 'socket.gethostbyname', 'webbrowser.open',
                     'ctypes.dlopen', 'ctypes.dlsym', 'ctypes.call_function', 'ctypes.cdata', 'ctypes.addressof',
                     'winreg.OpenKey', 'winreg.CreateKey', 'winreg.SetValue'):
            raise PermissionError(f'Action refusée : {evt}')
        elif evt == 'open':
            chemin, mode, flags = args
            ecrit = (isinstance(mode, str) and any(c in mode for c in 'wax+')) or (flags and flags & ecriture)
            if ecrit and chemin is not None and not dedans(chemin):
                raise PermissionError(f'Écriture refusée : {chemin}')
        elif evt in ('os.remove', 'os.rmdir', 'os.mkdir', 'os.chmod', 'os.truncate', 'os.utime', 'shutil.rmtree',
                     'shutil.copyfile', 'shutil.copytree', 'shutil.move'):
            cible = args[1] if evt in ('shutil.copyfile', 'shutil.copytree', 'shutil.move') else args[0]
            if not dedans(cible):
                raise PermissionError(f'Action refusée hors du dossier de sortie : {evt} {cible}')
        elif evt in ('os.rename', 'os.link', 'os.symlink'):
            if not (dedans(args[0]) and dedans(args[1])):
                raise PermissionError(f'Action refusée hors du dossier de sortie : {evt}')

    sys.addaudithook(hook)


def main():
    scene, sortie, qualite = sys.argv[1], sys.argv[2], sys.argv[3]
    with open(scene, encoding='utf-8') as f:
        pb = verifier(f.read())
    if pb:
        print('CODE REFUSÉ PAR LE GARDE-FOU :\n' + '\n'.join(pb[:20]), file=sys.stderr)
        sys.exit(3)
    # Tout ce dont Manim a besoin est chargé avant de poser la barrière
    import manim  # noqa: F401
    from manim.__main__ import main as manim_main
    import subprocess  # noqa: F401
    import av  # noqa: F401
    garder(sortie)
    sys.argv = ['manim', 'render', f'-q{qualite}', '--save_sections', '--media_dir', sortie, '--progress_bar', 'none',
                scene, 'Preuve']
    manim_main()


if __name__ == '__main__':
    main()
