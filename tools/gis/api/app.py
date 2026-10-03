"""LAN observation service. Uploaded originals are never served or executed.

SQLite and normalized attachments live in a dedicated persistent Docker volume,
outside the static site. The container is unprivileged, read-only and on an
internal network; only Caddy can reach its HTTP port.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import re
import secrets
import shutil
import sqlite3
import subprocess
import tempfile
import threading
from datetime import datetime, timezone
from contextlib import asynccontextmanager, contextmanager

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError

DATA = Path(os.environ.get('BCBD_DATA', '/data'))
ORIGIN = os.environ.get('BCBD_ORIGIN', 'http://192.168.18.150')
KINDS = {'observation', 'flood', 'closure', 'resource'}
MAX_IMAGE = 50 * 1024 * 1024
MAX_VIDEO = 100 * 1024 * 1024
QUOTA = 3 * 1024 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 50_000_000
WRITE_LOCK = threading.Lock()
MEDIA_LOCK = threading.Semaphore(1)


@contextmanager
def connection():
    db = sqlite3.connect(DATA / 'observations.sqlite', timeout=15)
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
    (DATA / 'media').mkdir(exist_ok=True)
    with connection() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript('''
          CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY, owner TEXT NOT NULL, client_id TEXT NOT NULL,
            payload TEXT NOT NULL, created_at TEXT NOT NULL, ip_hash TEXT NOT NULL,
            UNIQUE(owner, client_id));
          CREATE TABLE IF NOT EXISTS media (
            id TEXT PRIMARY KEY, report_id TEXT REFERENCES reports(id) ON DELETE CASCADE,
            filename TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL);
        ''')
    yield


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware('http')
async def headers(request, call_next):
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Content-Security-Policy'] = "default-src 'none'; sandbox"
    return response


def owner(request):
    value = request.cookies.get('bcbd_gis_session', '')
    return value if re.fullmatch(r'[a-f0-9]{64}', value) else ''


def authorize(request):
    value = owner(request)
    if not value or request.headers.get('origin') != ORIGIN or not secrets.compare_digest(
            request.headers.get('x-bcbd-csrf', ''), value):
        raise HTTPException(403, 'Sesión u origen no válido. Recarga el mapa.')
    return hashlib.sha256(value.encode()).hexdigest()


def validate_feature(f):
    try:
        c, p = f['geometry']['coordinates'], f['properties']
        if (f['type'] != 'Feature' or f['geometry']['type'] != 'Point' or len(c) != 2
                or any(type(v) not in (int, float) or not math.isfinite(v) for v in c)
                or abs(c[0]) > 180 or abs(c[1]) > 90):
            raise ValueError()
        # Reports belong to the Daule context, not arbitrary worldwide points.
        if not (-80.2 <= c[0] <= -79.6 and -2.3 <= c[1] <= -1.5):
            raise HTTPException(422, 'El punto debe estar en Daule o su contexto cercano.')
        if (not isinstance(p['name'], str) or not p['name'].strip() or len(p['name']) > 100
                or not isinstance(p['note'], str) or len(p['note']) > 1000
                or p['kind'] not in KINDS or not isinstance(p['observed_at'], str)):
            raise ValueError()
        instant = datetime.fromisoformat(p['observed_at'].replace('Z', '+00:00'))
        if instant.tzinfo is None or not 2000 <= instant.year <= 2100:
            raise ValueError()
        client_id = p.get('id') or secrets.token_hex(16)
        if not isinstance(client_id, str) or not re.fullmatch(r'[a-zA-Z0-9-]{1,80}', client_id):
            raise ValueError()
        return {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': c},
                'properties': {'name': p['name'].strip(), 'note': p['note'], 'kind': p['kind'],
                               'observed_at': instant.astimezone(timezone.utc).isoformat(),
                               'client_id': client_id}}
    except (ValueError, TypeError, KeyError, AttributeError, OverflowError):
        raise HTTPException(422, 'Coordenadas, fecha o campos de observación no válidos.')


@app.get('/api/gis/health')
def health():
    with connection() as db:
        used = db.execute('SELECT COALESCE(SUM(size),0) FROM media').fetchone()[0]
    return {'status': 'ok', 'storage': 'SQLite + volumen persistente', 'used_bytes': used,
            'quota_bytes': QUOTA, 'image_limit_bytes': MAX_IMAGE, 'video_limit_bytes': MAX_VIDEO}


@app.get('/api/gis/session')
def session(request: Request, response: Response):
    value = owner(request) or secrets.token_hex(32)
    response.set_cookie('bcbd_gis_session', value, httponly=True, samesite='strict',
                        secure=ORIGIN.startswith('https:'), max_age=365 * 86400, path='/api/gis')
    return {'csrf': value}


@app.get('/api/gis/reports')
def list_reports(request: Request):
    owned = hashlib.sha256(owner(request).encode()).hexdigest() if owner(request) else ''
    with connection() as db:
        rows = db.execute('SELECT * FROM reports ORDER BY created_at DESC LIMIT 5000').fetchall()
        media = db.execute('SELECT * FROM media').fetchall()
    grouped = {}
    for item in media:
        grouped.setdefault(item['report_id'], []).append({
            'url': '/api/gis/media/' + item['id'], 'mime': item['mime'], 'size': item['size']})
    features = []
    for row in rows:
        f = json.loads(row['payload'])
        f['properties'].update(id=row['id'], created_at=row['created_at'], can_delete=row['owner'] == owned,
                               attachments=grouped.get(row['id'], []), source='Observación compartida en la VM',
                               verification='Pendiente de verificación')
        features.append(f)
    return {'type': 'FeatureCollection', 'features': features,
            'updated_at': datetime.now(timezone.utc).isoformat()}


def command(args, timeout):
    try:
        return subprocess.run(args, check=True, timeout=timeout, capture_output=True).stdout
    except (subprocess.SubprocessError, OSError):
        raise HTTPException(422, 'No se pudo validar o preparar el video dentro de los límites del servidor.')


def normalize(source: Path, filename: str, destination: Path):
    suffix = Path(filename).suffix.lower()
    if suffix in {'.jpg', '.jpeg', '.png', '.webp'}:
        if source.stat().st_size > MAX_IMAGE:
            raise HTTPException(413, 'Cada imagen admite hasta 50 MB.')
        try:
            with Image.open(source) as image:
                if image.format not in {'JPEG', 'PNG', 'WEBP'} or image.width * image.height > 50_000_000:
                    raise ValueError()
                image.load()
                image = ImageOps.exif_transpose(image).convert('RGB')
                image.thumbnail((4096, 4096))
                # New pixels only: remove EXIF/location and embedded payloads.
                clean = Image.new('RGB', image.size)
                clean.paste(image)
                clean.save(destination.with_suffix('.jpg'), format='JPEG', quality=88)
            return '.jpg', 'image/jpeg'
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
            raise HTTPException(422, 'Imagen inválida. Se admiten JPG, PNG y WebP de hasta 50 megapíxeles.')
    if suffix not in {'.mp4', '.webm', '.mov'}:
        raise HTTPException(415, 'Solo JPG, PNG, WebP, MP4, WebM y MOV. No se admiten ejecutables ni documentos.')
    if source.stat().st_size > MAX_VIDEO:
        raise HTTPException(413, 'Cada video admite hasta 100 MB.')
    prefix = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,webm']
    metadata = json.loads(command(['ffprobe', '-v', 'error', *prefix, '-show_format', '-show_streams',
                                   '-of', 'json', str(source)], 20))
    streams = [s for s in metadata.get('streams', []) if s.get('codec_type') == 'video']
    try:
        duration = float(metadata['format']['duration'])
        valid = streams and math.isfinite(duration) and 0 < duration <= 600
        valid = valid and 0 < int(streams[0]['width']) * int(streams[0]['height']) <= 20_000_000
    except (KeyError, ValueError, TypeError):
        valid = False
    if not valid:
        raise HTTPException(422, 'Video inválido o demasiado complejo. Máximo 10 minutos y 20 megapíxeles por cuadro.')
    output = destination.with_suffix('.mp4')
    command(['ffmpeg', '-nostdin', '-v', 'error', '-threads', '1', *prefix, '-i', str(source),
             '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1', '-map_chapters', '-1',
             '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2',
             '-r', '24', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-threads', '1',
             '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-fs', str(MAX_VIDEO + 1),
             '-y', str(output)], 300)
    if output.stat().st_size > MAX_VIDEO:
        raise HTTPException(413, 'La copia preparada del video supera 100 MB.')
    return '.mp4', 'video/mp4'


def insert(db, feature, owned, ip_hash):
    p = feature['properties']
    old = db.execute('SELECT id FROM reports WHERE owner=? AND client_id=?', (owned, p['client_id'])).fetchone()
    if old:
        return old['id'], False
    identifier = secrets.token_hex(16)
    now = datetime.now(timezone.utc).isoformat()
    db.execute('INSERT INTO reports VALUES(?,?,?,?,?,?)',
               (identifier, owned, p['client_id'], json.dumps(feature, ensure_ascii=False), now, ip_hash))
    return identifier, True


def capacity(db, request, count):
    if db.execute('SELECT COUNT(*) FROM reports').fetchone()[0] + count > 5000:
        raise HTTPException(507, 'El registro está lleno. Solicita una revisión al administrador.')
    # Caddy is the only reachable caller; never expose the API port directly.
    ip_hash = hashlib.sha256(request.headers.get('x-forwarded-for', request.client.host).encode()).hexdigest()
    recent = db.execute("SELECT COUNT(*) FROM reports WHERE ip_hash=? AND created_at>?",
                        (ip_hash, datetime.fromtimestamp(datetime.now().timestamp() - 3600, timezone.utc).isoformat())).fetchone()[0]
    if recent + count > 1000:
        raise HTTPException(429, 'Demasiadas observaciones en una hora. Intenta más tarde.')
    return ip_hash


@app.post('/api/gis/reports')
async def create_report(request: Request):
    owned = authorize(request)
    # Reject before parsing multipart; Caddy also bounds the streaming body.
    if int(request.headers.get('content-length', '0')) > 210 * 1024 * 1024:
        raise HTTPException(413, 'El envío admite hasta 200 MB en total.')
    if not MEDIA_LOCK.acquire(blocking=False):
        raise HTTPException(429, 'El servidor está preparando otro adjunto. Intenta de nuevo en unos momentos.')
    created_paths = []
    try:
        async with request.form(max_files=3, max_fields=1, max_part_size=16384) as form:
            try:
                feature = validate_feature(json.loads(form.get('report', '')))
            except (json.JSONDecodeError, TypeError):
                raise HTTPException(422, 'Observación inválida.')
            files = form.getlist('media')
            prepared = []
            total = 0
            with tempfile.TemporaryDirectory(dir=DATA) as work:
                for upload in files:
                    if not hasattr(upload, 'filename'):
                        raise HTTPException(422, 'Adjunto inválido.')
                    identifier = secrets.token_hex(16)
                    source = Path(work) / identifier
                    size = 0
                    with source.open('wb') as target:
                        while chunk := await upload.read(1024 * 1024):
                            size += len(chunk)
                            total += len(chunk)
                            if size > MAX_VIDEO or total > 200 * 1024 * 1024:
                                raise HTTPException(413, 'Máximo 50 MB por imagen, 100 MB por video y 200 MB por envío.')
                            target.write(chunk)
                    # Execute normalization off the event loop, bounded by the container.
                    from starlette.concurrency import run_in_threadpool
                    extension, mime = await run_in_threadpool(normalize, source, upload.filename or '', Path(work) / ('clean-' + identifier))
                    prepared.append((identifier, Path(work) / ('clean-' + identifier + extension), mime))
                with WRITE_LOCK, connection() as db:
                    ip_hash = capacity(db, request, 1)
                    used = db.execute('SELECT COALESCE(SUM(size),0) FROM media').fetchone()[0]
                    new_size = sum(p.stat().st_size for _, p, _ in prepared)
                    if used + new_size > QUOTA or shutil.disk_usage(DATA).free < new_size + 512 * 1024 * 1024:
                        raise HTTPException(507, 'Almacenamiento de adjuntos lleno. No se guardó el envío.')
                    report_id, is_new = insert(db, feature, owned, ip_hash)
                    if not is_new:
                        return {'id': report_id, 'created': False}
                    for identifier, source, mime in prepared:
                        destination = DATA / 'media' / (identifier + source.suffix)
                        shutil.move(source, destination)
                        created_paths.append(destination)
                        db.execute('INSERT INTO media VALUES(?,?,?,?,?)',
                                   (identifier, report_id, destination.name, mime, destination.stat().st_size))
                return {'id': report_id, 'created': True}
    except Exception:
        for path in created_paths:
            path.unlink(missing_ok=True)
        raise
    finally:
        MEDIA_LOCK.release()


@app.post('/api/gis/import')
async def import_reports(request: Request):
    owned = authorize(request)
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > 2 * 1024 * 1024:
            raise HTTPException(413, 'GeoJSON demasiado grande; máximo 2 MB.')
        chunks.append(chunk)
    raw = b''.join(chunks)
    try:
        data = json.loads(raw)
        if data['type'] != 'FeatureCollection' or not isinstance(data['features'], list) or len(data['features']) > 1000:
            raise ValueError()
        features = [validate_feature(f) for f in data['features']]
    except (ValueError, KeyError, TypeError):
        raise HTTPException(422, 'Se requiere GeoJSON con hasta 1000 observaciones válidas.')
    with WRITE_LOCK, connection() as db:
        ip_hash = capacity(db, request, len(features))
        added = sum(insert(db, f, owned, ip_hash)[1] for f in features)
    return {'created': added}


@app.delete('/api/gis/reports/{identifier}')
def remove_report(identifier: str, request: Request):
    owned = authorize(request)
    with WRITE_LOCK, connection() as db:
        row = db.execute('SELECT owner FROM reports WHERE id=?', (identifier,)).fetchone()
        if not row:
            raise HTTPException(404, 'No existe la observación.')
        if row['owner'] != owned:
            raise HTTPException(403, 'Solo puedes eliminar observaciones enviadas desde este navegador.')
        paths = [DATA / 'media' / row['filename'] for row in db.execute('SELECT filename FROM media WHERE report_id=?', (identifier,))]
        db.execute('DELETE FROM reports WHERE id=?', (identifier,))
    for path in paths:
        path.unlink(missing_ok=True)
    return {'deleted': True}


@app.get('/api/gis/media/{identifier}')
def attachment(identifier: str):
    if not re.fullmatch(r'[a-f0-9]{32}', identifier):
        raise HTTPException(404)
    with connection() as db:
        row = db.execute('SELECT * FROM media WHERE id=?', (identifier,)).fetchone()
    if not row:
        raise HTTPException(404)
    return FileResponse(DATA / 'media' / row['filename'], media_type=row['mime'])
