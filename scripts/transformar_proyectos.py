# -*- coding: utf-8 -*-
"""
Transforma el Excel de proyectos de Huella Local
(origen/Resumen_Proyectos_Huella_Local.xlsx, hoja PROYECTOS) al JSON agrupado
por comuna que espera assets/js/map.js (data/proyectos_comunas.json).

Coordenadas: la fuente principal son las columnas UTM Este / UTM Norte con su
UTM Huso (18S/19S, datum WGS84). Como no todas son confiables, cada punto se
valida contra el polígono de su comuna en Comunas.geojson:
  1. UTM con el huso indicado
  2. UTM con el otro huso (por si el huso venía mal)
  3. Coord. X / Coord. Y (lat/lng decimal o UTM escrita a mano)
  4. Centroide de la comuna (ubicacion_aproximada = true)
Se usa el primer candidato que cae dentro de la comuna (con una tolerancia
por la simplificación del GeoJSON). Si la UTM viene redondeada al kilómetro
(p.ej. 730000 / 5850000) se considera aproximada aunque caiga en la comuna.

Valores vacíos: "NA" en el Excel significa "no aplica" y se guarda como
"N/A" (la interfaz no muestra ese dato); "-", "pendiente", "FALTA" o la celda
vacía significan "sin información" y se guardan como "S/I".

No se descarta ningún proyecto: los que no calzan con una comuna real de
Comunas.geojson (p.ej. "Varias comunas") quedan bajo la clave
"__sin_comuna__", documentados en el reporte que imprime al final.

Uso:
    python scripts/transformar_proyectos.py [ruta_al_excel.xlsx]
"""
import json
import math
import os
import re
import sys
import unicodedata

import pandas as pd
from pyproj import Proj
from shapely.geometry import Point, shape
from shapely.ops import transform as shp_transform

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXCEL_PATH_DEFAULT = os.path.join(BASE_DIR, "origen", "Resumen_Proyectos_Huella_Local.xlsx")
GEOJSON_PATH = os.path.join(BASE_DIR, "data", "Comunas.geojson")
OUT_PATH = os.path.join(BASE_DIR, "data", "proyectos_comunas.json")

SI = "S/I"
NA = "N/A"
SIN_COMUNA = "__sin_comuna__"

# Tolerancia (en grados, ~1 km) para aceptar un punto como "dentro" de su
# comuna: el GeoJSON está simplificado y los bordes costeros se mueven.
TOLERANCIA_COMUNA = 0.01
# Si no cae dentro: se acepta igual (como aproximada) si está a menos de 5 km
# del borde, o a menos de 20 km y no cae dentro de ninguna otra comuna (mar,
# islas). Más lejos se considera coordenada errónea y se usa el centroide.
TOLERANCIA_BORDE_KM = 5
TOLERANCIA_MAR_KM = 20

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

# Respaldo por si la columna Zona del Excel viene vacía en alguna fila.
ZONA_POR_REGION = {
    "Arica y Parinacota": "Norte",
    "Tarapacá": "Norte",
    "Antofagasta": "Norte",
    "Atacama": "Norte",
    "Coquimbo": "Norte",
    "Valparaíso": "Centro",
    "Metropolitana": "Centro",
    "O’Higgins": "Centro",
    "O'Higgins": "Centro",
    "Maule": "Centro",
    "Biobío": "Sur",
    "La Araucanía": "Sur",
    "Los Ríos": "Sur",
    "Los Lagos": "Austral",
    "Aysén": "Austral",
    "Magallanes": "Austral",
}

RENOMBRE_ZONA = {"Varias": "Transversal"}

# Fondos adjudicados por la fundación (no son socios/empresas como tal).
# Un proyecto de "Varias comunas" financiado por uno de estos es un caso
# especial: zona Transversal, fondo_adjudicado = true. En la interfaz su monto
# es "Monto adjudicado" y sus beneficiarios son habitantes según Censo.
FONDOS_ADJUDICADOS = {"MIDESO", "DGA"}

# Hitos de la línea de tiempo, en orden: (clave JSON, columna Excel)
HITOS = [
    ("postulacion", "Postulación o entrega"),
    ("aprobacion", "Aprobación"),
    ("asignacion_presupuestaria", "Asignación presupuestaria"),
    ("inicio_ejecucion", "Inicio Ejecución"),
    ("termino_ejecucion", "Término Ejecución"),
]

UNIDADES = {
    "m²": "m²", "m2": "m²", "m": "m",
    "un": "un", "ud": "un", "unidades": "un",
    "arranques": "arranques", "familias": "familias", "viviendas": "viviendas",
    "kva": "kVA",
}

CHILE_LAT_RANGE = (-56.5, -17.0)
CHILE_LON_RANGE = (-76.0, -66.0)

# Proj(..., inverse=True) en vez de Transformer para funcionar también con
# pyproj 1.x. Devuelven (lng, lat).
TRANSFORMERS = {
    "18S": Proj(proj="utm", zone=18, south=True, ellps="WGS84"),
    "19S": Proj(proj="utm", zone=19, south=True, ellps="WGS84"),
}
OTRO_HUSO = {"18S": "19S", "19S": "18S"}

VACIOS = {"", "-", "pendiente", "falta", "s/i", "por definir", "na", "n/a"}


def es_na(v):
    return isinstance(v, str) and v.strip().upper() in ("NA", "N/A")


def es_vacio(v):
    if v is None:
        return True
    if isinstance(v, float) and math.isnan(v):
        return True
    if isinstance(v, str) and v.strip().lower() in VACIOS:
        return True
    return False


def limpio(v):
    """NA -> N/A; vacío/'-'/'pendiente' -> S/I; strings -> trim; numeros -> tal cual."""
    if es_na(v):
        return NA
    if es_vacio(v):
        return SI
    if isinstance(v, str):
        return re.sub(r"\s+", " ", v).strip()
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def limpia_fecha(v):
    """Las fechas de la fuente son a nivel de mes (día 1), así que se guardan
    como YYYY-MM."""
    if es_na(v):
        return NA
    if es_vacio(v):
        return SI
    try:
        return pd.Timestamp(v).strftime("%Y-%m")
    except Exception:
        return SI


def limpia_numero(v):
    if es_na(v):
        return NA
    if es_vacio(v):
        return SI
    if isinstance(v, (int, float)):
        return int(v) if float(v).is_integer() else round(float(v), 2)
    s = str(v).strip().replace(".", "").replace(",", ".")
    try:
        f = float(s)
        return int(f) if f.is_integer() else round(f, 2)
    except ValueError:
        return SI


def limpia_entero(v):
    """Montos en pesos: siempre enteros (se redondea al peso)."""
    n = limpia_numero(v)
    return int(round(n)) if isinstance(n, (int, float)) else n


def limpia_unidad(v):
    if es_na(v):
        return NA
    if es_vacio(v):
        return SI
    s = str(v).strip()
    return UNIDADES.get(s.lower(), UNIDADES.get(s, s))


def parsea_coord(v):
    """Coord. X/Y vienen escritas a mano: '711127.79 m', '724908,00',
    '-31,12312504', 755433... Se devuelve float o None."""
    if es_vacio(v):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace("°", "").replace(" m", "").replace(" ", "")
    if s.count(".") > 1:  # separador de miles: 59.149.878
        s = s.replace(".", "")
    s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def en_chile(lat, lng):
    return (CHILE_LAT_RANGE[0] <= lat <= CHILE_LAT_RANGE[1]
            and CHILE_LON_RANGE[0] <= lng <= CHILE_LON_RANGE[1])


def utm_a_latlng(este, norte, huso):
    if huso not in TRANSFORMERS or este is None or norte is None:
        return None
    if not (100000 <= este <= 900000 and 1000000 <= norte <= 10000000):
        return None
    lng, lat = TRANSFORMERS[huso](este, norte, inverse=True)
    return (lat, lng) if en_chile(lat, lng) else None


def candidatos_coord_xy(x, y, huso):
    """Coord. X/Y pueden ser lng/lat decimales (a veces invertidas) o UTM."""
    x, y = parsea_coord(x), parsea_coord(y)
    if x is None or y is None:
        return []
    out = []
    if en_chile(y, x):
        out.append(("coord_xy_decimal", (y, x)))
    if en_chile(x, y):
        out.append(("coord_xy_decimal_invertida", (x, y)))
    for h in (huso, OTRO_HUSO.get(huso)):
        p = utm_a_latlng(x, y, h)
        if p:
            out.append((f"coord_xy_utm_{h}", p))
    return out


def normaliza(s):
    if not s:
        return ""
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()


def mercator_a_wgs84(x, y, z=None):
    R = 6378137
    lng = (x / R) * (180 / math.pi)
    lat = (2 * math.atan(math.exp(y / R)) - math.pi / 2) * (180 / math.pi)
    return lng, lat


def centroide_front(geometry):
    """Mismo método simple (promedio de vértices del primer anillo) que
    getCentroid() en map.js, para que el fallback quede consistente."""
    coords = geometry.get("coordinates")
    gtype = geometry.get("type")
    anillo = None
    if gtype == "Polygon" and coords:
        anillo = coords[0]
    elif gtype == "MultiPolygon" and coords:
        anillo = coords[0][0]
    if not anillo:
        return None
    pts = [mercator_a_wgs84(*pt[:2]) for pt in anillo]
    return {"lat": sum(p[1] for p in pts) / len(pts), "lng": sum(p[0] for p in pts) / len(pts)}


def carga_comunas():
    with open(GEOJSON_PATH, encoding="utf-8") as f:
        gj = json.load(f)
    comunas = {}
    for feat in gj["features"]:
        props = feat.get("properties") or {}
        nombre = props.get("Comuna")
        if not nombre:
            continue
        geom = shp_transform(lambda x, y, z=None: mercator_a_wgs84(x, y), shape(feat["geometry"]))
        if not geom.is_valid:
            geom = geom.buffer(0)
        if nombre in comunas:
            comunas[nombre]["geom"] = comunas[nombre]["geom"].union(geom)
        else:
            comunas[nombre] = {"geom": geom, "centro": centroide_front(feat["geometry"])}
    return comunas


def resuelve_comuna(municipio, comunas, indice_normalizado):
    municipio = CORRECCIONES_COMUNA.get(municipio, municipio)
    if municipio in comunas:
        return municipio
    return indice_normalizado.get(normaliza(municipio))


def resuelve_ubicacion(row, comuna, comunas):
    """Devuelve (lat, lng, aproximada, fuente)."""
    huso = str(row["UTM Huso"]).strip().upper() if not es_vacio(row["UTM Huso"]) else None
    este, norte = parsea_coord(row["UTM Este"]), parsea_coord(row["UTM Norte"])

    candidatos = []
    p = utm_a_latlng(este, norte, huso)
    if p:
        candidatos.append((f"utm_{huso}", p))
    p = utm_a_latlng(este, norte, OTRO_HUSO.get(huso))
    if p:
        candidatos.append((f"utm_{OTRO_HUSO.get(huso)}_corregido", p))
    candidatos += candidatos_coord_xy(row["Coord. X"], row["Coord. Y"], huso)

    utm_redondeada = (este is not None and norte is not None
                      and este % 1000 == 0 and norte % 1000 == 0)

    if comuna in comunas:
        geom = comunas[comuna]["geom"]
        for fuente, (lat, lng) in candidatos:
            if geom.distance(Point(lng, lat)) <= TOLERANCIA_COMUNA:
                aproximada = fuente.startswith("utm") and utm_redondeada
                return lat, lng, aproximada, fuente
        # Segunda pasada, más laxa: puntos cerca del borde, o en el mar /
        # islas que el GeoJSON simplificado perdió (Chiloé, costa).
        for fuente, (lat, lng) in candidatos:
            punto = Point(lng, lat)
            km = geom.distance(punto) * 111
            en_otra = any(n != comuna and v["geom"].contains(punto) for n, v in comunas.items())
            if km <= TOLERANCIA_BORDE_KM or (not en_otra and km <= TOLERANCIA_MAR_KM):
                return lat, lng, True, fuente + "_cerca_comuna"
        c = comunas[comuna]["centro"]
        return c["lat"], c["lng"], True, "centroide_comuna"

    # Sin comuna real (p.ej. "Varias comunas"): no hay contra qué validar.
    if candidatos:
        fuente, (lat, lng) = candidatos[0]
        return lat, lng, True, fuente
    return None, None, False, "sin_coordenadas"


def main():
    excel_path = sys.argv[1] if len(sys.argv) > 1 else EXCEL_PATH_DEFAULT

    comunas = carga_comunas()
    indice_normalizado = {normaliza(n): n for n in comunas}

    # keep_default_na=False: si no, pandas convierte "NA" en vacío y se
    # pierde la diferencia entre "no aplica" y "sin información".
    df = pd.read_excel(excel_path, sheet_name="PROYECTOS", keep_default_na=False, na_values=[""])
    df.columns = [str(c).strip() for c in df.columns]
    df = df.dropna(how="all")
    df = df[df["nombre"].notna()]

    # Código FHL puede faltar o repetirse; el front usa "id" como clave única
    # (markers, fotos), así que se desambigua con el ID correlativo del Excel.
    codigos = df["Código FHL"].map(lambda v: None if es_vacio(v) else str(v).strip())
    repetidos = set(codigos[codigos.duplicated(keep=False) & codigos.notna()])

    resultado = {}
    reporte = {
        "total_filas": len(df),
        "sin_comuna_valida": [],
        "fuente_coordenadas": {},
        "centroide_por_coord_fuera_de_comuna": [],
        "huso_corregido": [],
        "ids_generados": [],
    }

    for (_, row), codigo in zip(df.iterrows(), codigos):
        id_excel = int(row["ID"])
        if codigo is None:
            pid = f"FHL-{id_excel}"
            reporte["ids_generados"].append(pid)
        elif codigo in repetidos:
            pid = f"{codigo} ({id_excel})"
            reporte["ids_generados"].append(pid)
        else:
            pid = codigo

        municipio = str(row["comuna"]).strip()
        comuna = resuelve_comuna(municipio, comunas, indice_normalizado)
        if comuna is None:
            reporte["sin_comuna_valida"].append({"id": pid, "comuna": municipio})

        lat, lng, aproximada, fuente = resuelve_ubicacion(row, comuna, comunas)
        reporte["fuente_coordenadas"][fuente] = reporte["fuente_coordenadas"].get(fuente, 0) + 1
        if fuente == "centroide_comuna" and not es_vacio(row["UTM Este"]):
            reporte["centroide_por_coord_fuera_de_comuna"].append(
                f"{pid} | {comuna} | {row['UTM Huso']} {row['UTM Este']} {row['UTM Norte']}")
        if "corregido" in fuente:
            reporte["huso_corregido"].append(pid)

        estado = limpio(row["Estado actual"])
        region = limpio(row["region"])
        zona = limpio(row["Zona"])
        if zona in (SI, NA):
            zona = ZONA_POR_REGION.get(region, SI)
        # "Varias" en el Excel = proyectos de alcance nacional (fondos MIDESO).
        zona = RENOMBRE_ZONA.get(zona, zona)
        socio = limpio(row["Socio / Empresa"])
        fondo_adjudicado = comuna is None and socio in FONDOS_ADJUDICADOS
        if fondo_adjudicado:
            zona = "Transversal"

        proyecto = {
            "id": pid,
            "codigo_fhl": codigo or SI,
            "name": limpio(row["nombre"]),
            "tipo": limpio(row["tipo"]),
            "subcategoria": limpio(row["Subcategoría"]),
            "linea_trabajo": limpio(row["Línea de Trabajo"]),
            "estado": estado,
            "estado_key": ESTADO_KEYS.get(estado, "sin-info"),
            "monto": limpia_entero(row["Monto Inversión"]),
            "aportes_diseno": limpia_entero(row["Aportes para diseño"]),
            "financiamiento": limpio(row["Financiamiento"]),
            "socio": socio,
            "fondo_adjudicado": fondo_adjudicado,
            "anio_convenio": limpia_numero(row["Año convenio FHL"]),
            "participantes": limpia_numero(row["Beneficiarios Directos"]),
            "beneficiarios_hombres": limpia_numero(row["Beneficiarios hombres"]),
            "beneficiarios_mujeres": limpia_numero(row["Beneficiarios mujeres"]),
            "magnitud": limpia_numero(row["Magnitud"]),
            "unidad": limpia_unidad(row["Unidad"]),
            "linea_tiempo": {clave: limpia_fecha(row[col]) for clave, col in HITOS},
            "region": region,
            "zona": zona,
            "convenio": limpio(row["Convenio"]),
            "lat": round(lat, 6) if lat is not None else None,
            "lng": round(lng, 6) if lng is not None else None,
            "ubicacion_aproximada": aproximada,
            # exacta | aproximada (UTM redondeada o fuera del borde) | centroide
            "ubicacion_tipo": ("centroide" if fuente == "centroide_comuna"
                               else "aproximada" if aproximada else "exacta"),
        }

        resultado.setdefault(comuna or SIN_COMUNA, []).append(proyecto)

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)

    print(f"OK -> {OUT_PATH}")
    print(f"Comunas con proyectos: {len([k for k in resultado if k != SIN_COMUNA])}")
    print(f"Total proyectos: {sum(len(v) for v in resultado.values())}")
    print(json.dumps(reporte, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
