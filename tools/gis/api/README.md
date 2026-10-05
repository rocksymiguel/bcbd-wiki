# Observaciones compartidas en la VM

Servicio para la red interna, accesible exclusivamente a través de Caddy en
`http://192.168.18.150/api/gis/`. No abre otro puerto en la VM. El sitio estático
y sus capas cartográficas siguen funcionando si el registro falla.

## Almacenamiento

Volumen Docker **bcbd-gis-data**: `observations.sqlite` (SQLite con WAL),
`media/` (copias normalizadas) y directorios temporales durante los envíos.
No se guarda en Git ni bajo `/srv/bcbd-wiki`. Sobrevive a la actualización o
recreación del contenedor. No ejecutar `docker compose down -v`: borraría datos.
La cuota de los adjuntos publicados es **3 GiB**; se rechaza un nuevo envío si
no queda espacio. No se borran observaciones automáticamente. Aún no hay copia
de seguridad automática: incluir este volumen en las copias de la VM.

## Aportes y límites

- Texto: nombre hasta 100 caracteres y descripción hasta 1000.
- Punto en Daule y su contexto cercano; fecha y hora con zona horaria.
- Hasta 3 adjuntos y 200 MiB por envío.
- JPG, PNG o WebP: **50 MiB por imagen**, hasta 50 megapíxeles. Se decodifica y
  crea JPEG hasta 4096 px, corrigiendo orientación y quitando metadatos EXIF.
- MP4, WebM o MOV: **100 MiB por video**, hasta 10 minutos y 20 megapíxeles por
  cuadro. FFmpeg crea MP4 H.264/AAC hasta 1280 × 720, con límite de procesamiento
  de 5 minutos y salida hasta 100 MiB. Se conservan audio y duración; una entrada
  que no pueda prepararse dentro de esos límites se rechaza.
- Los originales subidos se descartan tras preparar la copia. No se sirven
  archivos originales, SVG, documentos, ejecutables ni nombres de archivo del
  usuario. Las referencias exportadas en GeoJSON no incluyen el contenido de
  fotos y videos: los enlaces siguen apuntando a esta VM.
- 5000 observaciones y hasta 1000 aportes por IP en una hora, incluida importación.

## Aislamiento y acceso

Contenedor sin privilegios (UID 1000), sin capacidades Linux, raíz de archivos
de solo lectura, límites de CPU/memoria/procesos y red Docker interna sin salida
a internet. FFmpeg solo acepta contenedores MOV/MP4/WebM y protocolos file/pipe;
la preparación tiene plazo y procesa un envío a la vez. Los formatos se verifican
por decodificación, no solo por extensión o MIME. SQLite usa consultas con
parámetros. El texto se muestra con `textContent` en el navegador.

No es un antivirus ni garantiza que un decodificador nunca tenga vulnerabilidades.
Mantener actualizadas la imagen Debian/Python, Pillow y FFmpeg. No se ha instalado
un motor antivirus. El aislamiento reduce el alcance de un archivo malicioso.

Se usa cookie HttpOnly y SameSite Strict con comprobación de Origin y token CSRF.
Cada navegador puede borrar sus propios aportes; los demás pueden leerlos. No hay
cuentas, identidad comprobada, moderación ni roles de bomberos. La información
queda **pendiente de verificación**. La VM usa HTTP en la LAN: no publicar este
servicio directamente en internet sin HTTPS y autenticación. Los registros
anteriores de localStorage permanecen privados hasta pulsar el botón de compartir.

## Despliegue

1. Copiar esta carpeta a `/home/bcbdadmin/gis-deploy` y construir:
   `docker compose -p bcbd-gis -f /home/bcbdadmin/gis-deploy/compose.yml build`.
2. Crear el volumen `bcbd-gis-data` y asignar su directorio a UID/GID 1000
   mediante un contenedor temporal. No cambiar permisos de otros volúmenes.
3. `docker compose -p bcbd-gis -f /home/bcbdadmin/gis-deploy/compose.yml up -d`.
4. Conectar Caddy a `bcbd-gis-private`; conservar la red actual. Validar `Caddyfile`,
   guardar copia de la configuración previa y recargar Caddy. `web-compose.yml`
   documenta la configuración persistente de `/opt/bcbd-web/compose.yml`.
5. Verificar `/api/gis/health`, carga del mapa y un envío desde dos navegadores.

## Pruebas

`docker build --target test -t bcbd-gis:test .`, luego:

```
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --memory 768m --pids-limit 80 \
  --tmpfs /tmp:size=1g,mode=1777,noexec,nosuid,nodev bcbd-gis:test
```

La prueba usa una base efímera, no el volumen real. Verifica texto compartido,
propiedad, CSRF, coordenadas, normalización de fotos/video, adjuntos inválidos,
importación atómica, duplicados, límites y eliminación de adjuntos propios.

Fuentes: [FastAPI](https://fastapi.tiangolo.com/tutorial/request-files/),
[Pillow](https://pillow.readthedocs.io/en/stable/reference/Image.html),
[FFmpeg](https://ffmpeg.org/ffmpeg.html).

## Conector ambiental

`bcbd-environment` sirve `/api/environment/{station,weather,tides}` en puerto
interno 8001. Solo ese contenedor tiene salida a internet; no monta el volumen de
observaciones. El contenedor de adjuntos conserva su red interna sin salida.
Las rutas de proveedores están fijadas en código, sin proxy de URL arbitraria.
No hay puertos publicados adicionales. La caché es en memoria: 15 minutos para
estación/modelo y 24 horas por fecha de marea, máximo 64 entradas. Ante fallo,
una respuesta previa lleva `stale=true`; sin respuesta previa se devuelve 503.

Estación HM002/64385, EMAPAG-EP (SAICA), visor INAMHI. Cada sensor tiene su
propia fecha. Se descartan valores no finitos, fuera de rango y futuros; las
lecturas antiguas se conservan con fecha y aviso. La precipitación es acumulada
horaria y el datum de nivel no consta en la respuesta. Open-Meteo es un modelo,
con intervalo de acumulación y punto de rejilla visibles en la API. No confirma
precipitación puntual ni se mezcla con observaciones medidas.

El cuadro principal identifica la fuente en **cada variable**. Mantiene HM002
hasta superar estrictamente cinco horas desde la medición, incluso si falla una
consulta. Después usa Open-Meteo como respaldo para temperatura, velocidad y
dirección del viento o precipitación si el valor del modelo es finito, su fecha
no es futura, tiene como máximo cinco horas y la respuesta no está marcada como
`stale`. Conserva la última medición de HM002 en el cuadro del respaldo y vuelve
a la estación al recibir una lectura reciente. Si el modelo no sirve, muestra
la medición antigua con aviso. Sin fecha válida de HM002 no se activa respaldo:
no se puede acreditar el umbral. El nivel del río permanece en HM002.
El respaldo usa siempre las coordenadas de Daule (-1.861, -79.977), sin depender
del sector seleccionado en el explorador de modelo. La lluvia estimada conserva
su intervalo original; no se etiqueta como acumulada horaria. Las dos fuentes
tienen descripciones y horas de consulta separadas debajo de los cuadros.
El navegador reevalúa las edades cada minuto y consulta cada 15 minutos mientras
está visible. Una respuesta parcial conserva en memoria las últimas lecturas
válidas conocidas, con sus fechas originales; no las rejuvenece. Sin una lectura
previa en esta sesión no inventa la fecha de inicio de la ausencia.
Prueba: `node tools/tests/daule-weather-backup.cjs`.

INOCAR: estación 374, Guayaquil–Río Guayas; tabla diaria pública, predicción
horaria local UTC−5, alturas MLWS. No se interpolan niveles ni se trasladan a
Daule. La fecha avanza al día actual en una página abierta; elegir otra fecha
conserva esa selección. Luna calculada localmente con Astronomy Engine 2.1.19.

Prueba del conector sin red: agregar `python test_environment.py` al comando del
contenedor de pruebas. No se escriben registros reales.
