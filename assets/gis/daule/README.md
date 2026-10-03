# Cartografía de referencia de Daule

Base para el mapa operativo de BCBD (Benemérito Cuerpo de Bomberos de Daule).
No contiene telemetría, pronósticos ni un modelo hidráulico.

- Cantón y parroquias: CONALI, publicados por Gestión de Riesgos en los
  servicios `Hosted/OT_CANTONAL_17072026` y `Hosted/OT_PARROQUIAL_17072026`.
  Filtro `dpa_canton = '0906'`. El atributo territorial indica 2026.
- Susceptibilidad: `SUSCEPT_INUNDACIONES_Z/MapServer/0` del mismo portal.
  Categorías originales de `sui`; se conservan el atributo `anno` y metadatos.
  No representa extensión de un evento observado.
- Vías, ríos, poblados y servicios: OpenStreetMap (ODbL 1.0), extracto de Ecuador
  de Geofabrik. Original PBF preservado en `.local/gis-sources/` y verificado.

`sources/` conserva respuestas originales, metadatos, conteos y hashes.
`manifest.json` identifica fuentes, descarga, cobertura y número de elementos.
Capas en EPSG:4326 (longitud, latitud). La geometría institucional se solicitó
con seis decimales, sin simplificar su forma; se añadieron nombres auxiliares.

El recorte OSM incluye nodos y vías con algún vértice dentro del rectángulo del
cantón más 0,035 grados de contexto. Las vías que cruzan el rectángulo conservan
su geometría completa. Servicios dibujados como edificios se localizan en el
centro de su caja envolvente, no en una entrada de acceso. Se omiten relaciones,
senderos y caminos de servicio. No es un inventario vial completo, un grafo
para rutas ni una delimitación de cuenca.

CONALI trae cinco entidades parroquiales. No se inventa un límite independiente
para La Aurora: su localización procede de OpenStreetMap. Las vías carecen de
estado de transitabilidad y los servicios de disponibilidad operativa.

Actualización: `tools/gis/README.md`. Los GeoJSON se pueden abrir directamente
en QGIS. Revisar cobertura y fechas antes de utilizar una nueva descarga.
