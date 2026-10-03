"""Preserve and verify a dated Geofabrik Ecuador extract. Standard library only."""
import argparse
from datetime import date, datetime, timezone
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('date', type=date.fromisoformat, help='Dated extract, YYYY-MM-DD')
    args = parser.parse_args()
    folder = Path(__file__).resolve().parents[2]/'.local/gis-sources'
    folder.mkdir(parents=True, exist_ok=True)
    name = 'ecuador-' + args.date.strftime('%y%m%d') + '.osm.pbf'
    target = folder/name
    url = 'https://download.geofabrik.de/south-america/' + name
    with urlopen(Request(url+'.md5', headers={'User-Agent':'BCBD-Wiki-GIS/0.1'}), timeout=45) as response:
        expected = response.read().decode().split()[0]
    if not target.exists():
        partial = target.with_suffix('.part')
        with urlopen(Request(url, headers={'User-Agent':'BCBD-Wiki-GIS/0.1'}), timeout=90) as response, partial.open('wb') as output:
            size = 0
            while chunk := response.read(1024*1024):
                output.write(chunk)
                size += len(chunk)
                if size % (20*1024*1024) == 0:
                    print('Downloaded', size//(1024*1024), 'MB', flush=True)
        if hashlib.md5(partial.read_bytes()).hexdigest() != expected:
            raise RuntimeError('Checksum mismatch. Partial preserved; original not replaced.')
        partial.rename(target)
    content = target.read_bytes()
    if hashlib.md5(content).hexdigest() != expected:
        raise RuntimeError('Existing original checksum mismatch; original preserved.')
    stamp = target.with_suffix('.metadata.json')
    if not stamp.exists():
        stamp.write_text(json.dumps({'url':url, 'retrieved_at':datetime.now(timezone.utc).isoformat(),
            'sha256':hashlib.sha256(content).hexdigest(), 'md5':expected}), encoding='utf-8')
    print('Verified', target, len(content), 'bytes', flush=True)


if __name__ == '__main__':
    main()
