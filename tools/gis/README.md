# GIS Daule · BCBD

## Vista local

Desde la raíz del repositorio: `node tools/gis/serve.cjs`.
Abrir http://127.0.0.1:8765/herramientas/mapa-daule/.
El servidor escucha solamente en localhost; detener con Ctrl+C.
También funciona en el servidor estático existente y bajo `/bcbd-wiki/`.
Hay accesos desde GIS Daule en la navegación, Herramientas y la primera tarjeta del inicio. Recursos sigue disponible en el menú.

Leaflet 1.9.4 y su licencia están en `js/vendor/leaflet`. Las capas son locales.
El fondo OSM en línea está activo por defecto; se puede elegir Esri World Imagery,
Esri World Hillshade o sin fondo. Solo se solicita el área visible, sin descarga
masiva de teselas para uso offline. La rueda hace zoom dentro del mapa; fuera
del mapa desplaza la página.
Política: https://operations.osmfoundation.org/policies/tiles/.

## Procesamiento

PyOsmium 4.3.1 se instaló aislado en
`C:\Users\rocks\AppData\Local\BCBD-GIS\venv`; el repositorio está en una unidad
de red. El mapa web no necesita ese entorno para funcionar.

```powershell
py -3.12 tools/gis/fetch_daule.py --official-only
```

Descargas disponibles: https://download.geofabrik.de/south-america/ecuador.html.
`download_osm.py` conserva el original en `.local/gis-sources/`, verifica el
checksum publicado y crea sus metadatos. No reemplaza originales existentes.
Primera descarga: `ecuador-261002.osm.pbf`, 125.539.598 bytes.

```powershell
py -3.12 tools/gis/download_osm.py 2026-10-02
& 'C:\Users\rocks\AppData\Local\BCBD-GIS\venv\Scripts\python.exe' tools/gis/extract_osm.py .local/gis-sources/ecuador-261002.osm.pbf
py -3.12 tools/gis/fetch_daule.py
```

El último comando reutiliza las respuestas conservadas. `--refresh` renueva las
capas institucionales; actualizar OSM requiere extraer un nuevo PBF. Alternativa
explícita: `--overpass-url https://overpass-api.de/api/interpreter` (puede estar
ocupado). La extracción local evita depender de ese servicio.
Para reproducir el entorno: crear un venv local e instalar
`python -m pip install -r tools/gis/requirements.txt`.
Documentación: https://docs.osmcode.org/pyosmium/latest/.

## Observaciones y pruebas

Observaciones compartidas en la VM mediante SQLite y un volumen Docker
persistente fuera de la carpeta pública. Admite texto, fotos y videos, con
importación/exportación GeoJSON. Los registros guardan UTC y muestran hora de
Ecuador; quedan pendientes de verificación. Los registros anteriores de
localStorage (`bcbd-daule-observations-v1`) se conservan: compartirlos requiere
pulsar el botón correspondiente. [Servicio, seguridad y límites](api/README.md).
La vista localhost y GitHub Pages no incluyen esa API; el mapa sigue disponible
y los envíos se deshabilitan cuando el servicio no responde.

```powershell
$env:NODE_PATH = 'C:\Users\rocks\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node tools/tests/daule-map.cjs
```

Edge headless y Playwright comprueban hashes, ríos solicitados, búsqueda, capas,
persistencia, fecha, importación/exportación, texto seguro, móvil, prefijo de ruta
y recuperación de fallos. No descargan teselas públicas durante las pruebas.
`BCBD_MAP_TEST_OUTPUT` permite capturas en una carpeta elegida.

Pendiente: teléfono físico, validación con BCBD, comprobación de accesos/servicios
y conexión a mediciones de ríos/lluvia. El registro de la LAN aún no tiene
cuentas ni roles; añadir autenticación y HTTPS antes de exponerlo fuera de la LAN.
