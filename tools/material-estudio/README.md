# Manual Bomberos I: exportación web

El maestro sigue siendo `Manual Bomberos I.md` en el vault de Obsidian, dentro
de `BCBD Wiki/Material de estudio/Bomberos I`. El exportador no modifica el vault.

`build.cjs` usa Marked 17.0.5 solamente al generar HTML. La página publicada
no requiere ese paquete, Obsidian, una API ni acceso al vault. La lección web de
Teoría del fuego se presenta como una ruta didáctica integrada; las transcripciones
del folleto se reúnen en un único anexo opcional al final del capítulo. El maestro
Markdown en el vault no se modifica ni se publica como archivo descargable.

Con Node.js y Marked disponibles:

```powershell
node tools/material-estudio/build.cjs "O:\obsidian-vault\rocksymiguel\BCBD Wiki\Material de estudio\Bomberos I"
```

`NODE_PATH` permite utilizar una instalación externa de Marked. Como alternativa,
instalar las dependencias de este directorio con `npm install --prefix tools/material-estudio`.

La salida queda en `material-de-estudio/bomberos-i/`: HTML estático, las imágenes
referenciadas y el PDF original. El archivo fuente `.md` permanece en el vault y no
se expone desde la web. Los archivos de respaldo y las imágenes sin referencias no
se publican. `manifest.json` registra hashes SHA-256, dimensiones y tamaños de los
recursos exportados. Los enlaces internos de Obsidian de los capítulos que conservan
la estructura original se convierten en anclas HTML únicas.

La salida es una página general (`index.html`, con el PDF y la lista de capítulos)
y una página por capítulo (`<capitulo>.html`). Cada capítulo abre con su portada
(«Capítulo N de 9»), tiene un índice a la derecha con todos los capítulos y las
secciones del actual —la sección visible se marca al desplazarse— y termina con
enlaces al capítulo anterior y siguiente. Los enlaces antiguos a `index.html#ancla`
redirigen al capítulo que contiene esa ancla, y el exportador falla si algún enlace
interno apunta a un id inexistente.

Teoría del fuego sigue las 8 secciones del folleto como esqueleto
(`teoria-del-fuego.html`): en cada una va primero el texto y las láminas del folleto
(`{{SOURCE:...}}`), después la ampliación didáctica y su pregunta de repaso. Cierra
con el repaso del capítulo y las fuentes de la ampliación.

Cualquier capítulo puede tener plantilla: un archivo `<id-del-capítulo>.html` en este
directorio y su entrada en `templates` de `build.cjs`. El exportador exige que la
plantilla coloque cada sección `###` del folleto una sola vez y en su orden (salvo
las de `omit`). Los capítulos 1 a 5 tienen plantilla, con ampliación, repaso, datos
(«¿Sabías que…?») y referencias de fuentes oficiales al margen; los capítulos 6 a 9
conservan su transcripción.

`tools/tests/manual-study.cjs` corresponde a la versión de una sola página (busca
`manual.md` y la fuente anterior) y debe actualizarse antes de volver a usarse.

```powershell
node tools/tests/manual-study.cjs
# Comprobar la versión servida sin registrar ni enviar datos:
$env:MANUAL_TEST_URL = 'http://192.168.18.150/'
node tools/tests/manual-study.cjs
```

El test comprueba texto completo contra el MD, anclas, imágenes, navegación,
fuentes y temas, escritorio/móvil, cierre del diálogo y la descarga real del PDF
con su hash. Las salidas de revisión se guardan en `.local/manual-study-test/`.

Publicar en la VM no publica automáticamente en GitHub Pages. La publicación
pública debe solicitarse por separado.
