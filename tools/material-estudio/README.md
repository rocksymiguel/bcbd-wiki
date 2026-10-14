# Manual Bomberos I: exportación fiel

El maestro sigue siendo `Manual Bomberos I.md` en el vault de Obsidian, dentro
de `BCBD Wiki/Material de estudio/Bomberos I`. El exportador no modifica el vault.

`build.cjs` usa Marked 17.0.5 solamente al generar HTML. La página publicada
no requiere ese paquete, Obsidian, una API ni acceso al vault.

Con Node.js y Marked disponibles:

```powershell
node tools/material-estudio/build.cjs "O:\obsidian-vault\rocksymiguel\BCBD Wiki\Material de estudio\Bomberos I"
```

`NODE_PATH` permite utilizar una instalación externa de Marked. Como alternativa,
instalar las dependencias de este directorio con `npm install --prefix tools/material-estudio`.

La salida queda en `material-de-estudio/bomberos-i/`: HTML estático, una copia exacta
del MD, las imágenes referenciadas y el PDF original. Los archivos de respaldo y
las imágenes sin referencias no se publican. `manifest.json` registra hashes SHA-256,
dimensiones y tamaños para comprobar la fidelidad. Los enlaces internos de
Obsidian se convierten en anclas HTML únicas, respetando capítulos y subtemas.

No se resume, corrige, reorganiza ni sustituye el contenido. El índice original
se presenta junto al texto, desplegable en móvil; las imágenes permiten abrir el
original desde un diálogo. El PDF se descarga con un enlace del mismo origen.

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
