"""Download original Copernicus COGs; crop numeric samples without resampling.

Run with the isolated GIS venv. Originals and acquisition records are preserved
under .local/gis-sources/copernicus; public output is a gzip float32 grid, not a
pre-coloured image. No ocean/no-data values are fabricated.
"""
import gzip
import hashlib
import json
import math
from contextlib import ExitStack
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

import numpy as np
import rasterio
from rasterio.merge import merge

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/gis/daule/elevation'
CACHE = ROOT / '.local/gis-sources/copernicus'
NOTICE = ('produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and '
          '© Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS '
          'by the European Union and ESA; all rights reserved')


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def acquire(lat, lon):
    name = f'Copernicus_DSM_COG_10_S{abs(lat):02}_00_W{abs(lon):03}_00_DEM'
    url = f'https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif'
    path = CACHE / (name + '.tif')
    record = path.with_suffix('.json')
    if not path.exists():
        print('Downloading', name, flush=True)
        temp = path.with_suffix('.part')
        with urlopen(url, timeout=90) as response, temp.open('wb') as stream:
            expected = int(response.headers['Content-Length'])
            while chunk := response.read(1024 * 1024):
                stream.write(chunk)
        if temp.stat().st_size != expected:
            raise RuntimeError('Incomplete original download: ' + name)
        # Readability and georeference check precede publishing the original.
        with rasterio.open(temp) as src:
            assert src.crs.to_epsg() == 4326 and src.count == 1
            assert src.width == src.height == 3600
        temp.rename(path)
        record.write_text(json.dumps(dict(url=url, retrieved_at=datetime.now(timezone.utc).isoformat(),
                                         bytes=expected, sha256=digest(path)), indent=2), encoding='utf-8')
    metadata = json.loads(record.read_text(encoding='utf-8'))
    if digest(path) != metadata['sha256']:
        raise RuntimeError('Original checksum mismatch: ' + name)
    return path, metadata


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    canton = json.loads((OUT.parent / 'canton.geojson').read_text(encoding='utf-8'))
    coords = canton['features'][0]['geometry']['coordinates'][0]
    west, south = (min(p[i] for p in coords) - .025 for i in range(2))
    east, north = (max(p[i] for p in coords) + .025 for i in range(2))
    originals = [acquire(y, x) for y in range(math.floor(south), math.floor(north)+1)
                 for x in range(math.floor(west), math.floor(east)+1)]
    with ExitStack() as stack:
        sources = [stack.enter_context(rasterio.open(p)) for p, _ in originals]
        ref = sources[0].transform
        step = ref.a
        # Keep the source pixel boundaries, including the half-pixel COG offset.
        left = ref.c + math.floor((west-ref.c)/step)*step
        right = ref.c + math.ceil((east-ref.c)/step)*step
        top = ref.f + math.ceil((north-ref.f)/step)*step
        bottom = ref.f + math.floor((south-ref.f)/step)*step
        mosaic, transform = merge(sources, bounds=(left,bottom,right,top),
                                  nodata=np.nan, dtype='float32', res=step)
        grid = mosaic[0].astype('<f4')
        assert np.isfinite(grid).all(), 'Coverage gap: refuse to invent heights'
        # Check both sides of all source seams against exact original samples.
        samples = [(-79.977,-1.861),(-79.873,-2.056),(-80.001,-2.001),
                   (-79.999,-1.999),(-80.001,-1.999),(-79.999,-2.001)]
        checks = []
        for lon, lat in samples:
            row, col = rasterio.transform.rowcol(transform,lon,lat)
            centre = rasterio.transform.xy(transform,row,col)
            src = next(s for s in sources if s.bounds.left <= centre[0] < s.bounds.right
                       and s.bounds.bottom < centre[1] <= s.bounds.top)
            original = float(next(src.sample([centre]))[0])
            assert grid[row,col] == original, (centre, grid[row,col], original)
            checks.append(dict(lon=lon,lat=lat,height_m=original))
    target = OUT / 'heights.f32.gz'
    target.write_bytes(gzip.compress(grid.tobytes(), compresslevel=9, mtime=0))
    metadata = dict(format='float32-le-row-major-gzip', file=target.name,
                    width=grid.shape[1],height=grid.shape[0],
                    west=transform.c,north=transform.f,step_lon=transform.a,step_lat=-transform.e,
                    bbox=[transform.c,transform.f+transform.e*grid.shape[0],
                          transform.c+transform.a*grid.shape[1],transform.f],
                    crs='EPSG:4326',vertical_datum='EGM2008',unit='m',spacing_arc_seconds=1,
                    nominal_spacing_m=30,source='Copernicus DEM GLO-30',release='2021 (AWS COG)',
                    source_page='https://copernicus-dem-30m.s3.amazonaws.com/readme.html',
                    generated_at=datetime.now(timezone.utc).isoformat(),
                    processing='Crop and mosaic at original spacing; no interpolation; original float32 samples.',
                    minimum_m=float(grid.min()),maximum_m=float(grid.max()),
                    sha256=digest(target),bytes=target.stat().st_size,
                    originals=[m for _,m in originals],validation_samples=checks,
                    attribution=NOTICE,
                    liability='Las organizaciones encargadas del programa Copernicus por ley o delegación no asumen responsabilidad por el uso de Copernicus WorldDEM-30.',
                    palette=[dict(below=0,color='#81c8c5',label='Menos de 0 m'),
                             dict(below=5,color='#36794b',label='0–5 m'),
                             dict(below=10,color='#70a657',label='5–10 m'),
                             dict(below=20,color='#b5cb74',label='10–20 m'),
                             dict(below=50,color='#e8d17d',label='20–50 m'),
                             dict(below=100,color='#c39b63',label='50–100 m'),
                             dict(below=200,color='#a5744a',label='100–200 m'),
                             dict(below=None,color='#79553e',label='200 m o más')])
    (OUT/'metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:metadata[k] for k in ['width','height','minimum_m','maximum_m','bytes','validation_samples']},indent=2),flush=True)


if __name__ == '__main__':
    main()
