#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Garde « aucun fichier de plus de 500 lignes » (règle CI de fin octobre 2026).

Le dépôt écrit du code découpé : un fichier long est un fichier à découper, pas
un fichier à tolérer. Les fichiers qui ne viennent pas de nous (la fabrique CI
dans `.github/`, les verrous générés) sont exclus : on ne peut pas les découper.

Usage : `python3 tools/check-file-limits.py [--max 500]`
Sortie : 0 si tout est conforme, 1 sinon (liste des dépassements).
"""
import os
import sys

MAX_LINES = 500
EXTENSIONS = {'.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.yml', '.yaml', '.md'}
# Dossiers régénérables ou qui ne viennent pas du dépôt.
EXCLUDE_DIRS = {'node_modules', '.git', 'dist', 'build', '.npm-state', '__pycache__', '.github'}
# Fichiers générés, jamais écrits à la main.
EXCLUDE_FILES = {'package-lock.json', 'pnpm-lock.yaml',
                 # Le cahier des charges est un document d'entrée reçu tel quel
                 # (512 lignes) : il ne se découpe pas, ce n'est pas du code.
                 'CAHIER-DES-CHARGES.md'}


def iter_files(root):
    """Parcourt l'arbre en ignorant les dossiers exclus."""
    for path, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in EXCLUDE_DIRS)
        for name in sorted(files):
            if name in EXCLUDE_FILES:
                continue
            if os.path.splitext(name)[1] not in EXTENSIONS:
                continue
            yield os.path.join(path, name)


def count_lines(path):
    """Nombre de lignes d'un fichier, ou None s'il est illisible."""
    try:
        with open(path, 'r', encoding='utf-8') as handle:
            return sum(1 for _ in handle)
    except (OSError, UnicodeError):
        return None


def main():
    limit = MAX_LINES
    if '--max' in sys.argv:
        limit = int(sys.argv[sys.argv.index('--max') + 1])
    audited, over, unreadable = 0, [], []
    for path in iter_files('.'):
        count = count_lines(path)
        if count is None:
            unreadable.append(path)
            continue
        audited += 1
        if count > limit:
            over.append((path, count))

    print('%d fichier(s) audité(s), limite %d lignes.' % (audited, limit))
    for path in unreadable:
        print('::error::illisible : %s' % path)
    for path, count in over:
        print('::error::trop long : %s (%d lignes)' % (path, count))
    if over or unreadable:
        print('ERREUR : %d dépassement(s), %d illisible(s).' % (len(over), len(unreadable)))
        return 1
    print('OK : tous les fichiers tiennent dans la limite.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
