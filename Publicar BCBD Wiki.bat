@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

:MENU
cls
echo ================================================
echo              PUBLICAR BCBD WIKI
echo ================================================
echo.
echo [1] Actualizar sitio local
echo     Guarda una version Git y actualiza la VM.
echo.
echo [2] Publicar en GitHub Pages
echo     Publica la version ya probada en la VM.
echo.
echo [3] Salir
echo.
choice /c 123 /n /m "Selecciona una opcion"
if errorlevel 3 goto :END
if errorlevel 2 goto :PUBLISH_PAGES
if errorlevel 1 goto :UPDATE_LOCAL

:REQUIRE_MAIN
set "BRANCH="
for /f "delims=" %%B in ('git branch --show-current') do set "BRANCH=%%B"
if /I not "!BRANCH!"=="main" (
    echo.
    echo ERROR: Este boton solo funciona desde la rama main.
    echo Rama actual: !BRANCH!
    exit /b 1
)
exit /b 0

:HAS_CHANGES
set "DIRTY="
for /f "delims=" %%C in ('git status --porcelain') do set "DIRTY=1"
exit /b 0

:CHECK_LOCAL_PAGE
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $response=Invoke-WebRequest -UseBasicParsing -Uri 'http://192.168.18.150/' -TimeoutSec 15; if($response.StatusCode -ne 200){exit 1}; exit 0 } catch { exit 1 }"
if errorlevel 1 (
    echo ERROR: La pagina local no respondio correctamente.
    exit /b 1
)
exit /b 0

:UPDATE_LOCAL
call :REQUIRE_MAIN
if errorlevel 1 goto :PAUSE_MENU

call :HAS_CHANGES
if defined DIRTY (
    echo.
    set "MESSAGE="
    set /p "MESSAGE=Mensaje para esta version: "
    if not defined MESSAGE (
        echo Publicacion local cancelada: el mensaje no puede estar vacio.
        goto :PAUSE_MENU
    )
    echo.
    echo Guardando esta version en Git...
    git add -A
    if errorlevel 1 goto :GIT_ERROR
    git commit -m "!MESSAGE!"
    if errorlevel 1 goto :GIT_ERROR
) else (
    echo.
    echo No habia cambios locales nuevos.
)

echo.
echo Enviando main directamente a la VM local...
git push vm main
if errorlevel 1 goto :GIT_ERROR

echo Aplicando la version en la pagina local...
ssh bcbd-wiki "cd /srv/bcbd-wiki; git pull --ff-only vm main"
if errorlevel 1 (
    echo ERROR: La VM recibio la version, pero no pudo aplicarla al sitio.
    goto :PAUSE_MENU
)

call :CHECK_LOCAL_PAGE
if errorlevel 1 goto :PAUSE_MENU

echo.
echo LISTO: la version Git local y la pagina local estan actualizadas.
echo GitHub y GitHub Pages no se modificaron.
goto :PAUSE_MENU

:PUBLISH_PAGES
call :REQUIRE_MAIN
if errorlevel 1 goto :PAUSE_MENU

call :HAS_CHANGES
if defined DIRTY (
    echo.
    echo ERROR: Hay cambios sin publicar localmente.
    echo Primero usa la opcion 1 y prueba la pagina de la VM.
    goto :PAUSE_MENU
)

set "LOCAL_COMMIT="
set "VM_COMMIT="
for /f "delims=" %%L in ('git rev-parse HEAD') do set "LOCAL_COMMIT=%%L"
for /f "delims=" %%V in ('git rev-parse vm/main') do set "VM_COMMIT=%%V"
if /I not "!LOCAL_COMMIT!"=="!VM_COMMIT!" (
    echo.
    echo ERROR: La VM no tiene esta version.
    echo Primero usa la opcion 1 y revisa la pagina local.
    goto :PAUSE_MENU
)

call :CHECK_LOCAL_PAGE
if errorlevel 1 goto :PAUSE_MENU

echo.
echo La version local fue comprobada. Publicando en GitHub...
git push origin main:main main:gh-pages
if errorlevel 1 goto :GIT_ERROR

echo.
echo LISTO: GitHub recibio main y gh-pages con el mismo commit.
echo GitHub Pages puede tardar unos minutos en reflejar el cambio.
echo URL publica: https://rocksymiguel.github.io/bcbd-wiki/
goto :PAUSE_MENU

:GIT_ERROR
echo.
echo ERROR: Git no pudo completar la operacion.

:PAUSE_MENU
echo.
pause
goto :MENU

:END
endlocal
exit /b 0
