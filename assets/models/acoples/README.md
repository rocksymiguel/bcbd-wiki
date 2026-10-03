# Acoples de manguera — referencia educativa

Pareja aproximada basada en las fotografías aportadas por el usuario. No reproduce
un estándar de rosca certificado ni dimensiones de fabricación.

- `acoples-bomberos.blend`: original editable con estudio de presentación.
- `acoples-bomberos.glb`: dos raíces independientes (`Acople_Macho`,
  `Acople_Hembra`), sin suelo, cámaras ni luces; 231 516 bytes.
- `acoples-preview.png`: render de revisión, macho a la izquierda.
- `acoples-bomberos.blend1`: copia anterior de seguridad generada por Blender.
- `linea-acoplada.blend`: pareja horizontal unida, con dos tramos de manguera.
- `linea-acoplada.glb`: modelo del visor, 263 868 bytes; raíces independientes
  `Linea_Macho` y `Linea_Hembra`. Incluye las mangueras, no el estudio.
- `linea-acoplada-preview.png`: render de revisión de la unión.
- `linea-acoplada-preview.jpg`: miniatura ligera utilizada en el inicio.

Materiales PBR de aluminio satinado y junta de goma, sin texturas externas.
La pareja acoplada utiliza un acabado de aluminio más oscuro y mate (rugosidad
0,78), conservando el carácter metálico. El original separado mantiene su acabado.
14 mallas, 4 488 vértices y 8 936 triángulos en total. Los salientes, roscas
y collar se mantienen separados para poder seleccionarlos y explicarlos.
La escala está expresada en metros y es ilustrativa. En Blender las aberturas
apuntan hacia +Z; la exportación glTF convierte a su sistema habitual +Y arriba.

El inicio integra la pareja acoplada en un visor de exploración, cargado solo
al abrir su modal. El visor anima el collar giratorio por separado y permite
seleccionar piezas y responder preguntas de orientación sobre una línea
convencional sin adaptadores (ver `README.md` del proyecto).
Los archivos `.blend1` se conservan localmente, pero Git ignora estas copias.
Antes de programar respuestas operativas, verificar con el instructor el equipo
real y la configuración de las líneas utilizadas por la institución.

Script reproducible: `tools/blender/create_hose_couplings.py`, ejecutado dentro
de Blender. Crea una escena dedicada y se detiene si ya existe `BCBD_Acoples`,
para evitar duplicar o sobrescribir trabajo previo.

`tools/blender/assemble_hose_couplings.py` crea otra escena con una copia de las
piezas originales: no cambia la pareja separada. No volver a ejecutarlo sobre
una escena ensamblada existente sin revisarla primero.
