"""Extract local OSM nodes/ways from a preserved Geofabrik country PBF.

Requires osmium; the website itself has no Python/runtime dependency.
The output is a cached source response consumed by fetch_daule.py.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import osmium
from fetch_daule import RAW, DEST, positions, write

ROADS = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified',
         'residential', 'living_street', 'motorway_link', 'trunk_link', 'primary_link',
         'secondary_link', 'tertiary_link'}
WATERWAYS = {'river', 'stream', 'canal', 'drain'}
PLACES = {'city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood'}
AMENITIES = {'fire_station', 'hospital', 'clinic', 'police'}


class Extract(osmium.SimpleHandler):
    def __init__(self, bbox):
        super().__init__()
        self.bbox = bbox
        self.elements = []

    def inside(self, lon, lat):
        w, s, e, n = self.bbox
        return w <= lon <= e and s <= lat <= n

    def node(self, obj):
        if not obj.location.valid() or not self.inside(obj.location.lon, obj.location.lat):
            return
        tags = dict(obj.tags)
        if tags.get('place') not in PLACES and tags.get('amenity') not in AMENITIES and tags.get('healthcare') not in {'hospital', 'clinic'}:
            return
        self.elements.append({'type': 'node', 'id': obj.id, 'tags': tags,
                              'lon': obj.location.lon, 'lat': obj.location.lat})

    def way(self, obj):
        tags = dict(obj.tags)
        if tags.get('highway') not in ROADS and tags.get('waterway') not in WATERWAYS and tags.get('amenity') not in AMENITIES and tags.get('healthcare') not in {'hospital', 'clinic'}:
            return
        if not all(n.location.valid() for n in obj.nodes):
            return
        coords = [(n.lon, n.lat) for n in obj.nodes]
        if not coords or not any(self.inside(*c) for c in coords):
            return
        item = {'type': 'way', 'id': obj.id, 'tags': tags}
        if tags.get('waterway') in WATERWAYS or tags.get('highway') in ROADS:
            item['geometry'] = [{'lon': c[0], 'lat': c[1]} for c in coords]
        else:
            item['center'] = {'lon': (min(c[0] for c in coords)+max(c[0] for c in coords))/2,
                              'lat': (min(c[1] for c in coords)+max(c[1] for c in coords))/2}
        self.elements.append(item)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('pbf', type=Path)
    args = parser.parse_args()
    original = json.loads(args.pbf.with_suffix('.metadata.json').read_text(encoding='utf-8'))
    if hashlib.sha256(args.pbf.read_bytes()).hexdigest() != original['sha256']:
        raise RuntimeError('Country source checksum mismatch')
    canton = json.loads((DEST/'canton.geojson').read_text(encoding='utf-8'))
    coords = list(positions(canton['features'][0]['geometry']['coordinates']))
    bbox = [round(min(c[0] for c in coords)-.035,5),round(min(c[1] for c in coords)-.035,5),
            round(max(c[0] for c in coords)+.035,5),round(max(c[1] for c in coords)+.035,5)]
    with osmium.io.Reader(str(args.pbf)) as reader:
        timestamp = reader.header().get('osmosis_replication_timestamp')
    handler = Extract(bbox)
    handler.apply_file(str(args.pbf), locations=True, idx='flex_mem')
    write(RAW/'openstreetmap.json', {'generator': 'BCBD PyOsmium country extract',
          'osm3s': {'timestamp_osm_base': timestamp, 'copyright': 'OpenStreetMap contributors, ODbL 1.0'},
          'elements': handler.elements})
    content = (RAW/'openstreetmap.json').read_bytes()
    write(RAW/'openstreetmap.json.metadata.json', {
        'url': original['url'], 'retrieved_at': original['retrieved_at'],
        'extracted_at': datetime.now(timezone.utc).isoformat(), 'sha256': hashlib.sha256(content).hexdigest(),
        'original_pbf_sha256': original['sha256'], 'original_pbf_md5': original['md5'],
        'bbox': bbox, 'method': 'PyOsmium nodes and ways with a vertex in the context rectangle; no relations.',
        'omissions': 'Footpaths, tracks, service roads, multipolygon/relation-only facilities and areas are not extracted.'})
    print('OSM extract:', len(handler.elements), 'elements. Data timestamp:', timestamp, flush=True)


if __name__ == '__main__':
    main()
