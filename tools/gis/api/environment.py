"""Read-only public-source connector; separate from the upload sandbox."""
from datetime import date, datetime, timezone
from html.parser import HTMLParser
import json
import math
import re
import threading
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from fastapi import FastAPI, HTTPException

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
CACHE = {}
LOCK = threading.Lock()
UA = 'BCBD-GIS-Daule/0.2 (public weather and tide reference)'


def now():
    return datetime.now(timezone.utc).isoformat()


def request(url, body=None):
    headers = {'User-Agent': UA}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = Request(url, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    with urlopen(req, timeout=15) as response:
        raw = response.read(2 * 1024 * 1024 + 1)
    if len(raw) > 2 * 1024 * 1024:
        raise ValueError('Respuesta demasiado grande')
    return raw


def cached(key, ttl, fetch):
    with LOCK:
        entry = CACHE.get(key)
        if entry and time.monotonic() - entry[0] < ttl:
            return entry[1]
    # A slow station must not block the tide/weather provider behind its request.
    try:
        value = fetch()
        with LOCK:
            CACHE[key] = (time.monotonic(), value)
            if len(CACHE) > 64:
                oldest = min(CACHE, key=lambda item: CACHE[item][0])
                del CACHE[oldest]
        return value
    except Exception:
        # Never quietly present old observations as current.
        if entry:
            return {**entry[1], 'stale': True, 'error': 'La fuente no respondió; se muestra la última consulta disponible.'}
        raise HTTPException(503, 'La fuente externa no está disponible o no publicó datos para esta consulta.')


class TideParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tables, self.rows, self.cells, self.cell, self.in_cell = [], None, None, '', False

    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            self.rows = []
        elif tag == 'tr' and self.rows is not None:
            self.cells = []
        elif tag in ('td', 'th') and self.cells is not None:
            self.in_cell = True
            self.cell = ''
        elif tag == 'br' and self.in_cell:
            self.cell += ' '

    def handle_data(self, data):
        if self.in_cell:
            self.cell += data

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.in_cell:
            self.cells.append(self.cell.strip())
            self.in_cell = False
        elif tag == 'tr' and self.cells is not None:
            self.rows.append(self.cells)
            self.cells = None
        elif tag == 'table' and self.rows is not None:
            self.tables.append(self.rows)
            self.rows = None


def parse_tides(raw, selected):
    parser = TideParser()
    parser.feed(raw.decode('latin-1'))
    days = {}
    for rows in parser.tables:
        text = ' '.join(cell for row in rows for cell in row)
        day = re.search(r'\b(\d{2})/(\d{2})/(\d{4})\b', text)
        if not day:
            continue
        key = f'{day[3]}-{day[2]}-{day[1]}'
        date.fromisoformat(key)
        events = []
        for row in rows:
            if len(row) != 2 or not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', row[0]):
                continue
            value = re.fullmatch(r'(-?\d+(?:\.\d+)?)\s+([BP])', row[1])
            if not value:
                raise ValueError('Altura de marea no válida')
            height = float(value[1])
            if not -2 <= height <= 10:
                raise ValueError('Altura fuera de rango')
            events.append({'time': row[0], 'height_m': height,
                           'kind': 'pleamar' if value[2] == 'P' else 'bajamar',
                           'at': key + 'T' + row[0] + ':00-05:00'})
        if events:
            if not 2 <= len(events) <= 4 or [e['time'] for e in events] != sorted(set(e['time'] for e in events)):
                raise ValueError('Tabla de mareas incompleta o desordenada')
            days[key] = events
    if selected not in days:
        raise ValueError('Sin predicción para el día')
    return days


@app.get('/api/environment/health')
def health():
    return {'status': 'ok', 'role': 'read-only public-source connector'}


@app.get('/api/environment/tides')
def tides(day: str):
    try:
        selected = date.fromisoformat(day)
        if selected.isoformat() != day or not 2003 <= selected.year <= date.today().year + 1:
            raise ValueError()
    except ValueError:
        raise HTTPException(422, 'Fecha no válida; usa AAAA-MM-DD.')
    def fetch():
        url = 'https://www.inocar.mil.ec/mareas/diario_mareas.php?' + urlencode({'cp': '374', 'fecha': day})
        days = parse_tides(request(url), day)
        return {'station': 'Guayaquil–Río Guayas', 'station_code': '374', 'timezone': 'America/Guayaquil',
                'datum': 'MLWS', 'prediction': True, 'day': day, 'days': days,
                'source_url': url, 'fetched_at': now(), 'stale': False}
    return cached('tides:' + day, 86400, fetch)


@app.get('/api/environment/weather')
def weather(latitude: float = -1.861, longitude: float = -79.977):
    if not (-2.3 <= latitude <= -1.5 and -80.2 <= longitude <= -79.6):
        raise HTTPException(422, 'Punto fuera del contexto de Daule.')
    latitude, longitude = round(latitude, 3), round(longitude, 3)
    def fetch():
        variables = 'temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m,wind_direction_10m,wind_gusts_10m'
        url = 'https://api.open-meteo.com/v1/forecast?' + urlencode({
            'latitude': latitude, 'longitude': longitude, 'current': variables,
            'timeformat': 'unixtime', 'timezone': 'UTC', 'wind_speed_unit': 'kmh'})
        data = json.loads(request(url))
        c = data['current']
        if not isinstance(c['time'], (int, float)) or not 1 <= c['interval'] <= 3600:
            raise ValueError('Tiempo del modelo no válido')
        clean = {}
        for name in variables.split(','):
            value = c.get(name)
            clean[name] = value if isinstance(value, (int, float)) and math.isfinite(value) else None
        return {'model_based': True, 'source': 'Open-Meteo', 'source_url': 'https://open-meteo.com/en/docs',
                'requested_point': [longitude, latitude], 'grid_point': [data['longitude'], data['latitude']],
                'valid_at': datetime.fromtimestamp(c['time'], timezone.utc).isoformat(),
                'interval_seconds': c['interval'], 'values': clean, 'fetched_at': now(), 'stale': False}
    return cached(f'weather:{latitude}:{longitude}', 900, fetch)


def latest_series(data, allowed):
    result = {}
    current = datetime.now(timezone.utc)
    for series in data.get('series', []):
        code = series.get('code')
        if code not in allowed:
            continue
        points = []
        for point in series.get('data', []):
            try:
                at = datetime.fromisoformat(point['date'].replace('Z', '+00:00'))
                value = point['value']
                if at.tzinfo is None or at > current or not isinstance(value, (float, int)) or not math.isfinite(value):
                    continue
                low, high = allowed[code][1:]
                if low <= value <= high:
                    points.append((at, value))
            except (KeyError, TypeError, ValueError):
                continue
        if points:
            at, value = max(points, key=lambda p: p[0])
            result[allowed[code][0]] = {'value': value, 'at': at.isoformat(),
                                      'unit': series.get('units'), 'age_seconds': (current - at).total_seconds(),
                                      'code': code, 'name': series.get('name')}
    return result


@app.get('/api/environment/station')
def station():
    def fetch():
        base = 'https://inamhi.gob.ec/api_visor/station_data_automaticas/'
        measurements, errors = {}, []
        # Source date filters currently fail; read its default bounded history
        # and retain only the latest finite, nonfuture value of each sensor.
        air_codes = {'029031601h': ('temperature', -20, 60), '037111601h': ('wind_speed', 0, 100),
                     '004021601h': ('wind_direction', 0, 360), '014101601h': ('river_level', -20, 100)}
        for path, body, allowed in [
            ('get_data_hour/', {'id_estacion': 64385, 'table_names': list(air_codes)}, air_codes),
            ('get_precipitation/', {'id_estacion': 64385}, {'017140801h': ('precipitation_hour', 0, 500)})]:
            try:
                data = json.loads(request(base + path, body))
                measurements.update(latest_series(data, allowed))
            except Exception:
                errors.append(path)
        if not measurements:
            raise ValueError('No hay registros válidos')
        return {'station': 'Estación de Monitoreo Remota Daule', 'code': 'HM002', 'owner': 'EMAPAG-EP (SAICA)',
                'publisher': 'Visor INAMHI', 'point': [-79.985177, -1.854488],
                'source_url': 'https://inamhi.gob.ec/info/visor/', 'measurements': measurements,
                'partial': bool(errors), 'fetched_at': now(), 'stale': False,
                'note': 'Horas tal como las entrega la fuente. El datum del sensor de nivel no está documentado en esta respuesta; no comparar directamente con MLWS.'}
    return cached('station:HM002', 900, fetch)
