# BCBD Wiki

Sitio educativo estático. Las pruebas locales y la publicación pública son pasos
separados: `Publicar BCBD Wiki.bat` permite actualizar la VM (opción 1) o publicar
intencionalmente en GitHub Pages (opción 2).

## Tipografía

Todas las páginas usan JetBrains Mono v2.304 desde `assets/fonts/jetbrains-mono`,
con su licencia OFL. La fuente se sirve localmente en WOFF2; los visitantes no
necesitan instalarla y no se consulta Google Fonts ni otro servicio externo.
La familia compartida cubre títulos, texto, botones, formularios, cronómetros,
código y controles de los visores. Los símbolos ausentes usan la fuente de
respaldo del navegador; el texto dentro de imágenes y mapas rasterizados
pertenece a esos recursos.

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
restablecer la vista. El visor es cuadrado en escritorio, vertical (3:4) en móvil
y horizontal (16:9) al usar el teléfono apaisado; se cierra con X,
Escape o un clic fuera del panel. La X permanece visible al desplazarse.

Tocar una pieza identifica su cuerpo, manguera, rosca, salientes, junta o collar.
«Manipular rosca» permite desenroscar con el ratón (arrastre hacia arriba) o con
dos dedos (sostener una pieza y girar el segundo dedo sobre la otra). El collar
gira de forma independiente de la manguera. Los botones y la barra de separación
permiten hacer lo mismo con teclado o sin gestos.

«Iniciar ejercicio» acopla la unión, cambia su orientación durante cuatro segundos
y pregunta aleatoriamente cómo volver a la unidad o avanzar hacia el pitón.
Se responde tocando el modelo o con botones; las identificaciones se ocultan
durante la pregunta. Se evalúa una unión intermedia de una línea de ataque
convencional sin adaptadores: manguera detrás del cuerpo macho hacia la unidad,
manguera detrás del cuerpo hembra hacia el pitón. No confundir con los extremos
libres de un tramo completo. Referencia del fabricante:
https://www.actioncoupling.com/action-arrows. Confirmar la disposición del equipo
real con el instructor. Cerrar el modal o esconder la pestaña cancela un giro
incompleto. La animación de separación es ilustrativa, con la línea sin presión.

Three.js r186 se sirve desde `js/vendor/three` con licencia MIT. El modelo y las
librerías se cargan solo al abrir el visor. El renderizado se pausa al cerrar el
modal o esconder la pestaña. No usa APIs de IA, claves ni servicios externos.
Ver `assets/models/acoples/README.md` para los originales de Blender y GLB.

## Validación del visor

Con Node.js y Playwright disponibles, `node tools/tests/hose-viewer.cjs` levanta
un servidor efímero y prueba escritorio oscuro, móvil claro, móvil horizontal,
rutas con prefijo, selección por rayos, arrastres de ratón y gestos multitáctiles,
preguntas y respuestas, controles, cierre, reintentos y carga diferida. Utiliza
Edge en modo headless.
`NODE_PATH` puede localizar una instalación externa de Playwright.

`HOSE_TEST_URL` permite comprobar un servidor existente; `HOSE_TEST_OUTPUT`
especifica una carpeta para capturas. Las pruebas emuladas no sustituyen la
revisión en un teléfono real.
