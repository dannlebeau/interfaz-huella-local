# -*- coding: utf-8 -*-
"""
Simplifica la geometria de data/Comunas.geojson (346 comunas, ~4 millones de
vertices, 215MB) para que sea viable subirla a git y servirla desde GitHub
Pages. Las coordenadas del archivo fuente estan en Web Mercator (metros),
aunque el CRS declarado en el GeoJSON diga EPSG:4326 -- por eso la
tolerancia de simplificacion se aplica directamente en esas unidades (metros)
sin reproyectar, igual que hace map.js/transformar_proyectos.py despues.

Guarda el original sin tocar en data/Comunas_full.geojson (tambien
gitignorado) por si se necesita volver a la precision completa.

Uso:
    python scripts/simplificar_comunas.py [tolerancia_metros]
"""
import json
import os
import sys
import shutil

import geopandas as gpd

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE_DIR, "data", "Comunas.geojson")
BACKUP = os.path.join(BASE_DIR, "data", "Comunas_full.geojson")
OUT = SRC

TOLERANCIA = float(sys.argv[1]) if len(sys.argv) > 1 else 80


def main():
    if not os.path.exists(BACKUP):
        print(f"Respaldando original -> {BACKUP}")
        shutil.copyfile(SRC, BACKUP)
    else:
        print(f"Ya existe respaldo en {BACKUP}, no se sobreescribe")

    print("Cargando geometria original...")
    gdf = gpd.read_file(BACKUP)
    print(f"Cargado: {len(gdf)} comunas")

    def cuenta_puntos(geom):
        if geom.geom_type == "Polygon":
            return len(geom.exterior.coords) + sum(len(i.coords) for i in geom.interiors)
        if geom.geom_type == "MultiPolygon":
            return sum(
                len(p.exterior.coords) + sum(len(i.coords) for i in p.interiors)
                for p in geom.geoms
            )
        return 0

    antes = sum(cuenta_puntos(g) for g in gdf.geometry)
    print(f"Vertices antes: {antes:,}")

    print(f"Simplificando con tolerancia={TOLERANCIA}m (preserve_topology=True)...")
    gdf["geometry"] = gdf.geometry.simplify(TOLERANCIA, preserve_topology=True)

    despues = sum(cuenta_puntos(g) for g in gdf.geometry)
    print(f"Vertices despues: {despues:,} ({despues/antes*100:.1f}% del original)")

    # Chequeo de integridad: ninguna comuna debe perderse ni quedar con
    # geometria invalida/vacia por la simplificacion.
    vacias = gdf[gdf.geometry.is_empty | gdf.geometry.isna()]
    if len(vacias) > 0:
        print(f"⚠️  {len(vacias)} comunas quedaron con geometria vacia:")
        print(vacias[["Comuna", "Region"]])

    gdf.to_file(OUT, driver="GeoJSON")

    tam_mb = os.path.getsize(OUT) / (1024 * 1024)
    print(f"OK -> {OUT} ({tam_mb:.1f} MB)")
    print(f"Comunas en salida: {len(gdf)}")


if __name__ == "__main__":
    main()
