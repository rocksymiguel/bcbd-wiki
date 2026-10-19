# Manual Bomberos I: exportación web

El maestro sigue siendo `Manual Bomberos I.md` en el vault de Obsidian, dentro
de `BCBD Wiki/Material de estudio/Bomberos I`. El exportador no modifica el vault.

`build.cjs` usa Marked 17.0.5 solamente al generar HTML. La página publicada
no requiere ese paquete, Obsidian, una API ni acceso al vault. La lección web de
Teoría del fuego se presenta como una ruta didáctica integrada; las transcripciones
del folleto y sus imágenes siguen disponibles dentro de cada módulo. El maestro
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

La estructura web de Teoría del fuego ordena los conceptos en módulos didácticos,
con explicaciones, preguntas de repaso y referencias técnicas. El texto fuente del
folleto se conserva desplegable por tema. Los otros capítulos mantienen su
transcripción. El índice parte cerrado y enlaza a módulos y capítulos; las imágenes
permiten abrir el original desde un diálogo. El PDF se descarga desde el mismo origen.

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
