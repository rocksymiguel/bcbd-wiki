# BCBD Wiki

Sitio educativo estático. Las pruebas locales y la publicación pública son pasos
separados: `Publicar BCBD Wiki.bat` permite actualizar la VM (opción 1) o publicar
intencionalmente en GitHub Pages (opción 2).

## GIS Daule

En `Herramientas → Mapa operativo de Daule`: cartografía local, límites de
CONALI, susceptibilidad SGR y ríos/vías/poblados OSM. En la VM hay observaciones
compartidas con texto, fotos y videos, guardadas en SQLite y un volumen Docker
independiente. Fondos de calles, satélite, relieve y sin fondo; zoom con rueda.
Primera base GIS sin telemetría ni simulación. Servicio: `tools/gis/api/README.md`.
Vista local: `node tools/gis/serve.cjs` y abrir
http://127.0.0.1:8765/herramientas/mapa-daule/.
Fuentes, herramientas y validación en `tools/gis/README.md`.

## Visor de acoples

En el inicio, «Abrir visor 3D» carga un modelo de dos acoples unidos y dos tramos
de manguera. Permite girar, acercar, separar las piezas, resaltar macho/hembra y
restablecer la vista. El modal se adapta a escritorio y móvil; se cierra con X,
Escape o un clic fuera del panel. La X permanece visible al desplazarse.

No contiene todavía preguntas de evaluación ni animación de desenroscado.
La configuración operativa real debe confirmarse antes de incorporar respuestas
sobre dirección hacia la unidad o el pitón.

Three.js r186 se sirve desde `js/vendor/three` con licencia MIT. El modelo y las
librerías se cargan solo al abrir el visor. El renderizado se pausa al cerrar el
modal o esconder la pestaña. No usa APIs de IA, claves ni servicios externos.
Ver `assets/models/acoples/README.md` para los originales de Blender y GLB.

## Validación del visor

Con Node.js y Playwright disponibles, `node tools/tests/hose-viewer.cjs` levanta
un servidor efímero y prueba escritorio oscuro, móvil claro, rutas con prefijo,
controles, cierre, reintentos y carga diferida. Utiliza Edge en modo headless.
`NODE_PATH` puede localizar una instalación externa de Playwright.

`HOSE_TEST_URL` permite comprobar un servidor existente; `HOSE_TEST_OUTPUT`
especifica una carpeta para capturas. Las pruebas emuladas no sustituyen la
revisión en un teléfono real.
