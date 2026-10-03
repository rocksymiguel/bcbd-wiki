"""Download reproducible public cartography for the BCBD Daule map.

Standard-library only. Preserves source responses and metadata separately from
the browser layers. Reuses a cached response unless --refresh is requested.
OSM can be prepared locally with extract_osm.py, or requested from Overpass.
No map tiles, credentials, private records, or live hydrology are downloaded.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "assets/gis/daule"
RAW = DEST / "sources"
BASE = "https://sgrportal.gestionderiesgos.gob.ec/server/rest/services/"
UA = "BCBD-Wiki-GIS/0.1 (local cartography preparation)"


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def download(name, url, refresh, body=None):
    path = RAW / name
    stamp = path.with_suffix(path.suffix + ".metadata.json")
    if refresh or not path.exists():
        request = Request(url, data=body, headers={"User-Agent": UA})
        with urlopen(request, timeout=180) as response:
            content = response.read()
        obj = json.loads(content)
        if obj.get("error") or obj.get("remark"):
            raise RuntimeError(f"Incomplete source {name}: {obj.get('error') or obj.get('remark')}")
        RAW.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        write(stamp, {"url": url, "retrieved_at": datetime.now(timezone.utc).isoformat(),
                      "sha256": hashlib.sha256(content).hexdigest()})
    obj = json.loads(path.read_bytes())
    return obj, json.loads(stamp.read_text(encoding="utf-8"))


def arcgis(name, service, refresh):
    layer = BASE + service
    metadata, _ = download(name + "-layer.json", layer + "?f=pjson", refresh)
    fields = [f["name"] for f in metadata["fields"] if f["type"] != "esriFieldTypeGeometry"]
    fields = [f for f in fields if not f.lower().startswith("shape")]
    params = {"where": "dpa_canton = '0906'", "outFields": ",".join(fields),
              "outSR": 4326, "returnGeometry": "true", "f": "geojson", "geometryPrecision": 6}
    geo, origin = download(name + ".geojson", layer + "/query?" + urlencode(params), refresh)
    # The source's count is authoritative; do not silently accept a truncated response.
    count, _ = download(name + "-count.json", layer + "/query?" + urlencode({
        "where": params["where"], "returnCountOnly": "true", "f": "json"}), refresh)
    if len(geo["features"]) != count["count"]:
        raise RuntimeError(f"Truncated {name}: {len(geo['features'])}/{count['count']}")
    if not geo["features"]:
        raise RuntimeError("Empty official layer: " + name)
    for f in geo["features"]:
        p = f["properties"]
        p["name"] = p.get("dpa_despar") or p.get("dpa_descan") or "Daule"
    geo.pop("crs", None)  # RFC 7946 WGS84 longitude/latitude output.
    return geo, {"id": name, "source": "Gestión de Riesgos", "url": layer,
                 "copyright": metadata.get("copyrightText", ""),
                 "description": metadata.get("description", ""),
                 "features": len(geo["features"]), **origin}


def positions(value):
    if isinstance(value, list) and value and isinstance(value[0], (int, float)):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from positions(item)


def osm_features(obj):
    collections = {name: {"type": "FeatureCollection", "features": []}
                   for name in ["waterways", "roads", "places", "facilities"]}
    for element in obj["elements"]:
        tags = element.get("tags", {})
        category = ("waterways" if tags.get("waterway") else
                    "roads" if tags.get("highway") else
                    "places" if tags.get("place") else "facilities")
        if element["type"] == "node":
            geometry = {"type": "Point", "coordinates": [element["lon"], element["lat"]]}
        elif element["type"] == "way" and category in ["roads", "waterways"]:
            coords = [[point["lon"], point["lat"]] for point in element.get("geometry", [])]
            if len(coords) < 2:
                continue
            geometry = {"type": "LineString", "coordinates": coords}
        else:
            center = element.get("center")
            if not center:
                continue
            geometry = {"type": "Point", "coordinates": [center["lon"], center["lat"]]}
        properties = {key: tags[key] for key in ["name", "waterway", "highway", "bridge", "ref",
                      "place", "amenity", "healthcare", "emergency", "access", "surface"] if key in tags}
        properties.update({"osm_id": f"{element['type']}/{element['id']}", "source": "OpenStreetMap"})
        collections[category]["features"].append({"type": "Feature", "geometry": geometry,
                                                 "properties": properties})
    return collections


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--official-only", action="store_true")
    parser.add_argument("--overpass-url", help="Explicit alternative to the locally extracted OSM snapshot")
    args = parser.parse_args()
    sources = []
    canton, origin = arcgis("canton", "Hosted/OT_CANTONAL_17072026/FeatureServer/0", args.refresh)
    artifacts = {"canton": canton}
    sources.append(origin)
    artifacts["parishes"], origin = arcgis("parishes", "Hosted/OT_PARROQUIAL_17072026/FeatureServer/0", args.refresh)
    sources.append(origin)
    artifacts["susceptibility"], origin = arcgis("susceptibility", "SUSCEPT_INUNDACIONES_Z/MapServer/0", args.refresh)
    sources.append(origin)
    if args.official_only:
        for name, geo in artifacts.items():
            write(DEST / (name + ".geojson"), geo)
        print("Official layers prepared. Next: extract_osm.py <country.osm.pbf>")
        return
    coords = list(positions(canton["features"][0]["geometry"]["coordinates"]))
    west, east = min(c[0] for c in coords), max(c[0] for c in coords)
    south, north = min(c[1] for c in coords), max(c[1] for c in coords)
    bbox = [round(west-.035, 5), round(south-.035, 5), round(east+.035, 5), round(north+.035, 5)]
    extent = f"({bbox[1]},{bbox[0]},{bbox[3]},{bbox[2]})"
    query = f'''[out:json][timeout:150];(
      way["waterway"~"^(river|stream|canal|drain)$"]{extent};
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)$"]{extent};
      node["place"~"^(city|town|village|hamlet|suburb|neighbourhood)$"]{extent};
      nwr["amenity"~"^(fire_station|hospital|clinic|police)$"]{extent};
      nwr["healthcare"~"^(hospital|clinic)$"]{extent};
    );out body geom;'''
    if args.overpass_url:
        write(RAW / "overpass-query.json", {"query": query})
        osm, origin = download("openstreetmap.json", args.overpass_url + "?" + urlencode({"data": query}), True)
    else:
        if not (RAW / "openstreetmap.json").exists():
            raise RuntimeError("Prepare OSM with extract_osm.py first, or provide --overpass-url.")
        osm, origin = download("openstreetmap.json", "unused cached source", False)
    collections = osm_features(osm)
    for name in ["daule", "pula", "banife"]:
        if not any(name in f["properties"].get("name", "").lower() for f in collections["waterways"]["features"]):
            raise RuntimeError("Missing required waterway: " + name)
    for name, collection in collections.items():
        artifacts[name] = collection
        sources.append({"id": name, "source": "OpenStreetMap", "url": "https://www.openstreetmap.org/copyright",
                        "source_page": "https://download.geofabrik.de/south-america/ecuador.html" if origin.get("original_pbf_sha256") else "https://www.openstreetmap.org/copyright",
                        "license": "ODbL 1.0", "features": len(collection["features"]),
                        "osm_base": osm.get("osm3s", {}).get("timestamp_osm_base"), **origin})
    manifest = {"title": "BCBD · Mapa operativo de Daule", "version": 1,
                "generated_at": datetime.now(timezone.utc).isoformat(), "crs": "EPSG:4326",
                "bbox": bbox, "canton_code": "0906", "sources": sources,
                "limitations": ["Cartografía de referencia; no representa condiciones en vivo.",
                    "Susceptibilidad no equivale a inundación observada ni profundidad.",
                    "Vías y servicios OSM requieren verificación de campo.",
                    "La capa parroquial de CONALI contiene cinco entidades; no delimita La Aurora por separado.",
                    "El contexto exterior se descarga por rectángulo, no por cuenca hidrológica."]}
    # Do not replace browser layers if acquisition or validation fails.
    for name, geo in artifacts.items():
        write(DEST / (name + ".geojson"), geo)
    write(DEST / "manifest.json", manifest)
    for source in sources:
        print(source["id"], source["features"])
    print("bbox", bbox)
    print("Required waterways verified: Daule, Pula, Banife")


if __name__ == "__main__":
    main()
