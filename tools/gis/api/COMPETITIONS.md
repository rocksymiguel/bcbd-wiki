# Registro de preparación de competencias

En la VM, `bcbd-competitions` sirve `/api/competitions/` por el Caddy existente.
Usa un contenedor independiente del GIS, sin puerto externo ni salida a Internet,
y SQLite en el volumen persistente `bcbd-competitions-data`. La base no está en
Git ni en la carpeta pública. No usar `docker compose down -v`.

Cada participante tiene un ID generado. Los nombres se normalizan al registrarse
para evitar duplicados por espacios, mayúsculas o tildes. Actualmente un mismo
nombre completo representa una sola persona. No se utiliza cédula ni se verifica
la identidad. Registro y lectura son compartidos en la LAN; escritura usa sesión,
comprobación de Origin y token CSRF. No hay cuentas ni roles.

La estación determina la competencia y el número de ejercicio. Detener guarda
un intento con ID único, participante, competencia, estación, centésimas y fecha
del servidor. Reintentar ese ID no duplica el tiempo. Reiniciar permite otro
intento. El ranking conserva el historial y muestra el mejor tiempo por persona
y estación. El cronómetro usa `performance.now()`; el intervalo solo actualiza
la pantalla. Una suspensión del dispositivo requiere revisión humana del tiempo.

Los envíos pendientes permanecen en el navegador hasta que la VM confirma su
recepción. La persona seleccionada se recuerda entre estaciones. Con la VM
desconectada se pueden usar participantes ya cargados; registrar una nueva persona
requiere conexión. No cerrar la página si también falla el almacenamiento local.

Los resultados anteriores `fc_results` de localStorage se conservan, pero no se
importan automáticamente: sus nombres no tienen ID y pueden contener duplicados.
Google Sheets deja de participar. GitHub Pages muestra el contenido educativo,
pero no ofrece esta API privada de la LAN.

## Respaldo en TrueNAS

`tools/backup-competitions.ps1` usa SSH con identidad conocida y SQLite Backup API
para exportar una copia consistente. Comprueba `PRAGMA integrity_check` antes de
transferirla, verifica el encabezado SQLite y guarda SHA256 junto al archivo.
Destino: `\\TRUENAS\Emulacion\Development\Backups\bcbd-wiki\competencias`.
No reemplaza ni elimina copias anteriores.

La tarea Windows `BCBD Wiki - Respaldo competencias al NAS` se ejecuta diariamente
a las 23:30 y al iniciar sesión. Requiere este PC encendido, sesión del usuario,
LAN/SSH y acceso al recurso SMB. Recupera ejecuciones pendientes cuando sea posible.
Las copias contienen nombres y tiempos: conservar los permisos privados del recurso.
Para respaldar manualmente, ejecutar el script con PowerShell.

Para restaurar: detener solo `bcbd-competitions`, guardar una copia adicional de
su base actual, verificar el respaldo, instalarlo como `/data/competitions.sqlite`
con UID/GID 1000 y retirar los archivos WAL/SHM anteriores con el contenedor detenido.
Reiniciar y consultar `/api/competitions/health`. Nunca sustituir SQLite en caliente.

## Validación

`test_competitions.py` prueba una base temporal: sesión, identidad compartida,
normalización, reintentos concurrentes, datos inválidos e integridad/persistencia.
Ejecutar en el runtime de pruebas con FastAPI y httpx.

`node tools/tests/competitions.cjs` prueba contra la API real desde una vista local;
`COMPETITIONS_TEST_URL=http://192.168.18.150` prueba la página de la VM. Necesita
Playwright/Edge y SSH. Crea identidades `BCBD TEST ...` y elimina únicamente sus
IDs al finalizar mediante `cleanup-competition-tests.py`. Prueba oscuro/claro,
cronómetro, desconexión, reenvío, recorrido, ranking desde otra sesión y recursos.
Las pruebas emuladas no sustituyen cronometrar un ejercicio en un teléfono real.
