# -*- coding: utf-8 -*-
"""
Transforma el Excel de proyectos reales de Huella Local (columnas: Municipio,
Convenio, Zona, Región, id_HL, nombre, tipo, estado, aportes_diseño,
monto_inversion, fecha_inicio, fecha_termino, Beneficiarios Directos/hombres/
mujeres, Coord. X, Coord. Y) al JSON agrupado por comuna que espera
assets/js/map.js (data/proyectos_comunas.json).

No se descarta ningún proyecto: los que no calzan con una comuna real de
Comunas.geojson quedan igual en el JSON bajo la clave "__sin_comuna__",
documentados en el reporte que imprime al final.

Uso:
    python scripts/transformar_proyectos.py [ruta_al_excel.xlsx]

Si no se pasa ruta, usa C:\\Users\\jcord\\Downloads\\Resumen_proyectos.xlsx.
"""
import json
import math
import os
import sys
import unicodedata
import pandas as pd

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXCEL_PATH_DEFAULT = r"C:\Users\jcord\Downloads\Resumen_proyectos.xlsx"
GEOJSON_PATH = os.path.join(BASE_DIR, "data", "Comunas.geojson")
OUT_PATH = os.path.join(BASE_DIR, "data", "proyectos_comunas.json")

SI = "S/I"

# Correcciones conocidas: nombre en el Excel -> nombre exacto en Comunas.geojson
CORRECCIONES_COMUNA = {
    "Aysen": "Aysén",
    "Los Ángeles": "Los Angeles",
    "Til Til": "Tiltil",
}

ESTADO_KEYS = {
    "Entregado": "entregado",
    "Desarrollo": "desarrollo",
    "Cerrado": "cerrado",
    "Postulado": "postulado",
    "Ejecución": "ejecucion",
    "Financiado": "financiado",
    "Aprobado": "aprobado",
    "Evaluación": "evaluacion",
}

CHILE_LAT_RANGE = (-56.5, -17.0)
CHILE_LON_RANGE = (-76.0, -66.0)


def limpio(v):
    """None/NaN/'-' -> S/I; strings -> trim; numeros -> tal cual."""
    if v is None:
        return SI
    if isinstance(v, float) and math.isnan(v):
        return SI
    if isinstance(v, str):
        s = v.strip()
        if s == "" or s == "-":
            return SI
        return s
    return v


def limpia_fecha(v):
    if pd.isna(v):
        return SI
    try:
        return pd.Timestamp(v).strftime("%Y-%m-%d")
    except Exception:
        return SI


def parsea_coord(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        if isinstance(v, float) and math.isnan(v):
            return None
        return float(v)
    s = str(v).strip().replace("°", "").replace(",", ".")
    if s in ("", "-"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def resuelve_lat_lng(coord_x, coord_y):
    """Coord. X debería ser longitud y Coord. Y latitud, pero algunas filas
    vienen invertidas en la fuente. Se decide por rango válido de Chile en vez
    de confiar ciegamente en el nombre de columna."""
    x, y = parsea_coord(coord_x), parsea_coord(coord_y)
    if x is None or y is None:
        return None, None, False

    def en_rango(v, rango):
        return rango[0] <= v <= rango[1]

    if en_rango(y, CHILE_LAT_RANGE) and en_rango(x, CHILE_LON_RANGE):
        return y, x, False
    if en_rango(x, CHILE_LAT_RANGE) and en_rango(y, CHILE_LON_RANGE):
        return x, y, True  # estaban invertidas
    return None, None, False


def normaliza(s):
    if not s:
        return ""
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()


def centroide(geometry):
    """Mismo método simple (promedio de vértices) que getCentroid() en
    map.js, para que el fallback quede consistente con lo que hace el front."""
    lats, lngs = [], []
    coords = geometry.get("coordinates")
    gtype = geometry.get("type")
    anillo = None
    if gtype == "Polygon" and coords:
        anillo = coords[0]
    elif gtype == "MultiPolygon" and coords:
        anillo = coords[0][0]
    if not anillo:
        return None
    for lng, lat in anillo:
        lngs.append(lng)
        lats.append(lat)
    return {"lat": sum(lats) / len(lats), "lng": sum(lngs) / len(lngs)}


def mercator_a_wgs84(x, y):
    R = 6378137
    lng = (x / R) * (180 / math.pi)
    lat = (2 * math.atan(math.exp(y / R)) - math.pi / 2) * (180 / math.pi)
    return lng, lat


def reproyecta_geometry(geometry):
    gtype = geometry.get("type")
    coords = geometry.get("coordinates")
    if gtype == "Polygon":
        geometry["coordinates"] = [[list(mercator_a_wgs84(*pt)) for pt in coords[0]]]
    elif gtype == "MultiPolygon":
        geometry["coordinates"] = [[[list(mercator_a_wgs84(*pt)) for pt in coords[0][0]]]]
    return geometry


def main():
    excel_path = sys.argv[1] if len(sys.argv) > 1 else EXCEL_PATH_DEFAULT

    with open(GEOJSON_PATH, encoding="utf-8") as f:
        gj = json.load(f)

    comunas_validas = {}
    for feat in gj["features"]:
        props = feat.get("properties") or {}
        nombre = props.get("Comuna")
        if not nombre or nombre in comunas_validas:
            continue
        geom = reproyecta_geometry(feat["geometry"])
        c = centroide(geom)
        if c:
            comunas_validas[nombre] = c

    # Índice normalizado (sin tildes/mayúsculas) para matchear casos que se
    # nos escapen de CORRECCIONES_COMUNA
    indice_normalizado = {normaliza(n): n for n in comunas_validas}

    df = pd.read_excel(excel_path)

    resultado = {}
    reporte = {
        "total_filas": len(df),
        "sin_comuna_valida": [],
        "coords_invertidas": [],
        "sin_coords_uso_centroide": [],
        "comunas_corregidas": {},
    }

    for _, row in df.iterrows():
        municipio_original = str(row["Municipio"]).strip()
        municipio = CORRECCIONES_COMUNA.get(municipio_original, municipio_original)

        comuna_final = None
        if municipio in comunas_validas:
            comuna_final = municipio
        else:
            match = indice_normalizado.get(normaliza(municipio))
            if match:
                comuna_final = match

        if municipio != municipio_original and comuna_final:
            reporte["comunas_corregidas"][municipio_original] = comuna_final

        lat, lng, invertidas = resuelve_lat_lng(row["Coord. X"], row["Coord. Y"])
        aproximada = False

        if comuna_final is None:
            reporte["sin_comuna_valida"].append({
                "id_HL": row["id_HL"], "municipio": municipio_original, "nombre": row["nombre"],
            })
            comuna_final = "__sin_comuna__"

        if lat is None or lng is None:
            if comuna_final in comunas_validas:
                lat, lng = comunas_validas[comuna_final]["lat"], comunas_validas[comuna_final]["lng"]
                aproximada = True
                reporte["sin_coords_uso_centroide"].append(row["id_HL"])
            else:
                lat, lng = None, None
        elif invertidas:
            reporte["coords_invertidas"].append(row["id_HL"])

        estado = limpio(row["estado"])
        estado_key = ESTADO_KEYS.get(estado, "sin-info")

        proyecto = {
            "id": row["id_HL"],
            "name": limpio(row["nombre"]),
            "tipo": limpio(row["tipo"]),
            "estado": estado,
            "estado_key": estado_key,
            "monto": limpio(row["monto_inversion"]),
            "aportes_diseno": limpio(row["aportes_diseño"]),
            "participantes": limpio(row["Beneficiarios Directos"]),
            "beneficiarios_hombres": limpio(row["Beneficiarios hombres"]),
            "beneficiarios_mujeres": limpio(row["Beneficiarios mujeres"]),
            "fecha_inicio": limpia_fecha(row["fecha_inicio"]),
            "fecha_termino": limpia_fecha(row["fecha_termino"]),
            "region": limpio(row["Región"]),
            "zona": limpio(row["Zona"]),
            "convenio": limpio(row["Convenio"]),
            "lat": lat,
            "lng": lng,
            "ubicacion_aproximada": aproximada,
        }

        resultado.setdefault(comuna_final, []).append(proyecto)

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)

    print(f"OK -> {OUT_PATH}")
    print(f"Comunas con proyectos: {len([k for k in resultado if k != '__sin_comuna__'])}")
    print(f"Total proyectos: {sum(len(v) for v in resultado.values())}")
    print(json.dumps(reporte, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
