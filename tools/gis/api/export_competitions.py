"""Consistent SQLite backup, verified before exporting; stdout is base64 only."""
import base64
import sqlite3
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as folder:
    target = Path(folder) / 'competitions.sqlite'
    source = sqlite3.connect('file:/data/competitions.sqlite?mode=ro', uri=True)
    destination = sqlite3.connect(target)
    try:
        source.backup(destination)
        if destination.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Database integrity check failed')
    finally:
        destination.close()
        source.close()
    print(base64.b64encode(target.read_bytes()).decode('ascii'))
