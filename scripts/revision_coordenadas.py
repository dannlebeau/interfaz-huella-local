# -*- coding: utf-8 -*-
"""
Genera origen/Revision_Coordenadas.xlsx: la lista de proyectos cuya ubicación
hay que revisar a mano, con el mismo criterio que usa transformar_proyectos.py.

  - Prioridad ALTA: la UTM cae lejos de su comuna (o no existe), así que el
    mapa lo muestra en el centro de la comuna.
  - Prioridad MEDIA: ubicación aproximada (UTM redondeada al km, o el punto
    cae unos km fuera del borde de la comuna: mar, islas, límite).

Se corrigen las UTM en el Excel fuente, se vuelve a correr
transformar_proyectos.py y luego este script para ver qué queda pendiente.

Uso:
    python scripts/revision_coordenadas.py [ruta_al_excel.xlsx]
"""
import os
import sys

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from shapely.geometry import Point

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transformar_proyectos as t  # noqa: E402

OUT_PATH = os.path.join(t.BASE_DIR, "origen", "Revision_Coordenadas.xlsx")
TIPOS_OCULTOS = {"Servicios_Profesionales", "Estudios_Territoriales"}


def gmaps(lat, lng):
    return f"https://www.google.com/maps/search/?api=1&query={lat:.6f},{lng:.6f}"


def main():
    excel_path = sys.argv[1] if len(sys.argv) > 1 else t.EXCEL_PATH_DEFAULT
    comunas = t.carga_comunas()
    indice = {t.normaliza(n): n for n in comunas}

    df = pd.read_excel(excel_path, sheet_name="PROYECTOS", keep_default_na=False, na_values=[""])
    df.columns = [str(c).strip() for c in df.columns]
    df = df.dropna(how="all")
    df = df[df["nombre"].notna()]

    filas = []
    for _, row in df.iterrows():
        municipio = str(row["comuna"]).strip()
        comuna = t.resuelve_comuna(municipio, comunas, indice)
        if comuna is None:
            continue  # "Varias comunas": no hay polígono contra el cual validar

        lat, lng, aproximada, fuente = t.resuelve_ubicacion(row, comuna, comunas)
        if not aproximada and fuente != "centroide_comuna":
            continue

        huso = str(row["UTM Huso"]).strip().upper()
        este, norte = t.parsea_coord(row["UTM Este"]), t.parsea_coord(row["UTM Norte"])
        punto_utm = t.utm_a_latlng(este, norte, huso)

        cae_en, dist_km = "", None
        if punto_utm:
            p = Point(punto_utm[1], punto_utm[0])
            cae_en = next((n for n, v in comunas.items() if v["geom"].contains(p)), "(fuera de toda comuna / mar)")
            dist_km = round(comunas[comuna]["geom"].distance(p) * 111, 1)

        redondeada = este is not None and norte is not None and este % 1000 == 0 and norte % 1000 == 0
        if fuente == "centroide_comuna":
            prioridad = "ALTA"
            if not punto_utm:
                problema = "Sin UTM válida"
            else:
                problema = f"La UTM cae en {cae_en}, a {dist_km} km de {comuna}"
        else:
            prioridad = "MEDIA"
            motivos = []
            if redondeada:
                motivos.append("UTM redondeada al km")
            if dist_km:
                motivos.append(f"cae {dist_km} km fuera del borde ({cae_en})")
            problema = "; ".join(motivos) or "Aproximada"

        filas.append({
            "Prioridad": prioridad,
            "Visible en mapa": "No" if row["tipo"] in TIPOS_OCULTOS else "Sí",
            "ID": int(row["ID"]),
            "Código FHL": "" if t.es_vacio(row["Código FHL"]) else str(row["Código FHL"]).strip(),
            "Nombre": t.limpio(row["nombre"]),
            "Comuna": municipio,
            "Región": t.limpio(row["region"]),
            "Tipo": t.limpio(row["tipo"]),
            "Problema": problema,
            "UTM Huso": huso,
            "UTM Este": este,
            "UTM Norte": norte,
            "Coord. X": "" if t.es_vacio(row["Coord. X"]) else str(row["Coord. X"]),
            "Coord. Y": "" if t.es_vacio(row["Coord. Y"]) else str(row["Coord. Y"]),
            "Ver UTM actual": gmaps(*punto_utm) if punto_utm else "",
            "Ver centro comuna": gmaps(comunas[comuna]["centro"]["lat"], comunas[comuna]["centro"]["lng"]),
            "Revisado": "",
            "Nota": "",
        })

    orden = {"ALTA": 0, "MEDIA": 1}
    filas.sort(key=lambda f: (orden[f["Prioridad"]], f["Visible en mapa"] != "Sí", f["ID"]))

    wb = Workbook()
    ws = wb.active
    ws.title = "Pendientes"
    cols = list(filas[0].keys()) if filas else []
    ws.append(cols)
    for f in filas:
        ws.append([f[c] for c in cols])

    header_fill = PatternFill("solid", fgColor="2C3E50")
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = header_fill
        cell.alignment = Alignment(vertical="center", wrap_text=True)

    alta = PatternFill("solid", fgColor="FADBD8")
    media = PatternFill("solid", fgColor="FEF5E7")
    link_cols = [cols.index(c) + 1 for c in ("Ver UTM actual", "Ver centro comuna")]
    for r in range(2, ws.max_row + 1):
        ws.cell(r, 1).fill = alta if ws.cell(r, 1).value == "ALTA" else media
        for c in link_cols:
            cell = ws.cell(r, c)
            if cell.value:
                cell.hyperlink = cell.value
                cell.value = "Abrir mapa"
                cell.font = Font(color="2471A3", underline="single")

    anchos = {"Prioridad": 10, "Visible en mapa": 9, "ID": 6, "Código FHL": 15, "Nombre": 50,
              "Comuna": 16, "Región": 14, "Tipo": 20, "Problema": 48, "UTM Huso": 8,
              "UTM Este": 11, "UTM Norte": 11, "Coord. X": 14, "Coord. Y": 14,
              "Ver UTM actual": 13, "Ver centro comuna": 13, "Revisado": 10, "Nota": 30}
    for i, c in enumerate(cols, start=1):
        ws.column_dimensions[get_column_letter(i)].width = anchos.get(c, 12)
    ws.freeze_panes = "E2"
    ws.auto_filter.ref = ws.dimensions

    wb.save(OUT_PATH)
    n_alta = sum(f["Prioridad"] == "ALTA" for f in filas)
    print(f"OK -> {OUT_PATH}")
    print(f"Pendientes: {len(filas)} (ALTA {n_alta}, MEDIA {len(filas) - n_alta})")
    print(f"Visibles en el mapa: {sum(f['Visible en mapa'] == 'Sí' for f in filas)}")


if __name__ == "__main__":
    main()
