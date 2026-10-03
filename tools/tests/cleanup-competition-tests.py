"""Remove only disposable test identities explicitly supplied by the test harness."""
import re
import sqlite3
import sys

ids = sys.argv[1].split(',')
if not ids or any(not re.fullmatch(r'[a-f0-9]{16}', pid) for pid in ids):
    raise ValueError('Invalid test IDs')
with sqlite3.connect('/data/competitions.sqlite') as db:
    for pid in ids:
        row = db.execute('SELECT name FROM participants WHERE id=?', (pid,)).fetchone()
        if row and not row[0].startswith('BCBD TEST '):
            raise ValueError('Refusing to delete a real participant')
        db.execute('DELETE FROM results WHERE participant_id=?', (pid,))
        db.execute('DELETE FROM participants WHERE id=?', (pid,))
print('Disposable test records removed.')
