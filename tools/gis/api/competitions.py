"""Shared training register, served only through the LAN site's proxy."""
import os
import re
import secrets
import sqlite3
import unicodedata
from pathlib import Path
from contextlib import contextmanager, asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Request, Response

DATA = Path(os.environ.get('BCBD_COMPETITIONS_DATA', '/data'))
ORIGIN = os.environ.get('BCBD_ORIGIN', 'http://192.168.18.150')
LIMITS = {'fire-challenge': 5, 'copa-oba': 4}

@contextmanager
def connection():
    db = sqlite3.connect(DATA / 'competitions.sqlite', timeout=15)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    try:
        with db:
            yield db
    finally:
        db.close()

@asynccontextmanager
async def lifespan(_app):
    DATA.mkdir(parents=True, exist_ok=True)
    with connection() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript('''
          CREATE TABLE IF NOT EXISTS participants (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE);
          CREATE TABLE IF NOT EXISTS results (
            id TEXT PRIMARY KEY, participant_id TEXT NOT NULL REFERENCES participants(id),
            competition TEXT NOT NULL, station INTEGER NOT NULL,
            centis INTEGER NOT NULL CHECK(centis>0), recorded_at TEXT NOT NULL);
        ''')
    yield

app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

def session_value(request):
    value = request.cookies.get('bcbd_competitions_session', '')
    return value if re.fullmatch(r'[a-f0-9]{64}', value) else ''

def authorize(request):
    value = session_value(request)
    if not value or request.headers.get('origin') != ORIGIN or not secrets.compare_digest(
            request.headers.get('x-bcbd-csrf', ''), value):
        raise HTTPException(403, 'Recarga la página para iniciar una sesión válida.')

@app.middleware('http')
async def headers(request, call_next):
    if request.method == 'POST' and int(request.headers.get('content-length', '0')) > 4096:
        return Response(status_code=413)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response

@app.get('/api/competitions/health')
def health():
    with connection() as db:
        count = db.execute('SELECT COUNT(*) FROM results').fetchone()[0]
    return {'status': 'ok', 'results': count, 'storage': 'SQLite'}

@app.get('/api/competitions/session')
def session(request: Request, response: Response):
    value = session_value(request) or secrets.token_hex(32)
    response.set_cookie('bcbd_competitions_session', value, httponly=True, samesite='strict',
                        secure=ORIGIN.startswith('https:'), path='/api/competitions', max_age=31536000)
    return {'csrf': value}

@app.get('/api/competitions/participants')
def participants():
    with connection() as db:
        return [dict(r) for r in db.execute('SELECT id,name FROM participants ORDER BY name_key')]

@app.post('/api/competitions/participants')
async def register(request: Request):
    authorize(request)
    try:
        data = await request.json()
        name = ' '.join(data['name'].split())
        if not 2 <= len(name) <= 100 or any(unicodedata.category(c).startswith('C') for c in name):
            raise ValueError()
    except (ValueError, KeyError, TypeError, AttributeError):
        raise HTTPException(422, 'Escribe un nombre de 2 a 100 caracteres.')
    key = ''.join(c for c in unicodedata.normalize('NFD', name.casefold()) if not unicodedata.combining(c))
    with connection() as db:
        db.execute('INSERT OR IGNORE INTO participants VALUES (?,?,?)', (secrets.token_hex(8), name, key))
        return dict(db.execute('SELECT id,name FROM participants WHERE name_key=?', (key,)).fetchone())

@app.get('/api/competitions/results')
def results():
    with connection() as db:
        return [dict(r) for r in db.execute('''SELECT r.*,p.name FROM results r
            JOIN participants p ON p.id=r.participant_id ORDER BY recorded_at DESC''')]

@app.post('/api/competitions/results')
async def record(request: Request):
    authorize(request)
    try:
        data = await request.json()
        rid, pid, comp, station, centis = (data[k] for k in ('id','participant_id','competition','station','centis'))
        if (not isinstance(rid, str) or not re.fullmatch(r'[a-zA-Z0-9-]{1,80}', rid)
                or not isinstance(pid, str) or not isinstance(comp, str) or comp not in LIMITS
                or type(station) is not int or not 1 <= station <= LIMITS[comp]
                or type(centis) is not int or not 0 < centis <= 8640000):
            raise ValueError()
    except (ValueError, KeyError, TypeError):
        raise HTTPException(422, 'Participante, estación o tiempo no válido.')
    with connection() as db:
        if not db.execute('SELECT id FROM participants WHERE id=?', (pid,)).fetchone():
            raise HTTPException(422, 'El participante no está registrado.')
        db.execute('INSERT OR IGNORE INTO results VALUES (?,?,?,?,?,?)',
                   (rid,pid,comp,station,centis,datetime.now(timezone.utc).isoformat()))
        existing = db.execute('SELECT * FROM results WHERE id=?', (rid,)).fetchone()
        if any(existing[k] != data[k] for k in ('participant_id','competition','station','centis')):
            raise HTTPException(409, 'Ese registro ya tiene otro tiempo.')
        return dict(existing)
