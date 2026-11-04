#!/bin/sh
# Rebuilds maps/dust2_cs.json from the real Dust II mesh (dust2.bin + dust2.json from the 3D import).
# Needs: python3 + numpy, scipy, matplotlib (only render.py).
# Put next to this script:  dust2_3d_import/dust2.bin, dust2_3d_import/dust2.json  and the previous map as old_dust2_cs.json (spawns/routes/materials are taken from it).
set -e
for s in raster stageB stageC stageD voidfill stageE stageF kinds stageG cleanceil assemble; do echo "== $s"; python3 $s.py; done
echo "done -> dust2_cs_new.json   (copy it to maps/dust2_cs.json and import it in /map-editor.html)"
