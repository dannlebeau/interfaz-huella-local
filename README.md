# Huella Local - Visualización de Proyectos en Chile

Aplicación interactiva para visualizar proyectos comunitarios de Huella Local en un mapa de Chile con filtros jerárquicos por región, provincia y comuna.

## 📁 Estructura del Proyecto

```
interfaz_huella_local/
├── index.html                          # Página principal
├── data/
│   ├── Comunas.geojson                # Límites y jerarquía Región/Provincia/Comuna
│   │                                     (regiones, provincias y comunas se extraen
│   │                                     de acá en tiempo real, no hay JSON aparte)
│   └── proyectos_comunas.json         # 482 proyectos, agrupados por comuna
│                                         (fuente: origen/Resumen_Proyectos_Huella_Local.xlsx)
├── assets/
│   ├── css/
│   │   └── style.css      # Estilos de la aplicación
│   └── js/
│       └── map.js         # Lógica principal del mapa
└── README.md              # Este archivo
```

## ✨ Características

- 🗺️ **Mapa interactivo** centrado en Chile con Leaflet
- 🧭 **6 mapas base** intercambiables (selector arriba a la derecha): CartoDB
  Positron (por defecto), OpenStreetMap, CartoDB Oscuro, Esri Satelital, Esri
  Topográfico y OpenTopoMap. Positron es el default porque siempre renderiza
  bien a cualquier zoom; el resto son alternativas para explorar (satelital,
  oscuro, relieve)
- 📍 **Los 482 proyectos se muestran desde el inicio**, sin necesidad de filtrar
- 🔍 **Filtros jerárquicos**: Región → Provincia → Comuna (acotan qué proyectos se ven)
- 📍 **Proyectos geolocalizados**, con zoom in automático al pinchar uno (desde el mapa o el sidebar)
- 🧭 **Filtro por zona**: en el Resumen general, pinchar Norte / Centro / Sur / Austral muestra solo esos proyectos (pinchar de nuevo la misma zona vuelve a todos)
- 📊 **Panel de beneficiarios** (derecha, botón 📊): total de beneficiarios directos, desglose hombres ♂ / mujeres ♀ y por línea de trabajo; cuenta solo los proyectos que se ven en pantalla, así que se recalcula con cada filtro, zoom o desplazamiento, y al pinchar un proyecto muestra solo ese
- 🔗 **Link a Google Maps** en el popup de cada proyecto, para revisar/corregir su ubicación
- 📷 **Carrusel de fotos** por proyecto (opcional, ver sección "Fotos de proyectos" abajo)
- 📊 **Tooltips** con: nombre, monto, participantes, porcentaje de avance
- 🎨 **Interfaz moderna** con sidebar ocultable
- 📱 **Responsive** para dispositivos móviles

## 🚀 Uso

1. Abre `index.html` en tu navegador — el mapa carga con los 482 proyectos ya visibles como puntos azules
2. (Opcional) Haz click en el botón ☰ para abrir los filtros y acotar la vista:
   - **Región** (se cargan automáticamente las provincias)
   - **Provincia** (se cargan automáticamente las comunas)
   - **Comuna** (selecciona la comuna deseada)
3. Haz click en **Aceptar** para centrar el mapa y filtrar los proyectos, o en **Limpiar** para volver a ver todos
4. Haz click en un proyecto para ver detalles

## 📊 Estructura de Datos

### proyectos_comunas.json

Agrupado por comuna (el nombre debe calzar exacto con la propiedad `Comuna` de
`Comunas.geojson`). Los proyectos sin comuna real identificable en la fuente
(por ejemplo, un estudio a nivel regional) quedan bajo la clave especial
`__sin_comuna__` en vez de perderse. Cuando la fuente no traía un dato, el
campo queda como el string `"S/I"` en lugar de inventarlo. Si en el Excel
viene `NA` (no aplica a ese proyecto) queda como `"N/A"` y la interfaz no
muestra ese dato (ni ese hito en la línea de tiempo).

La interfaz oculta por ahora los tipos `Servicios_Profesionales` y
`Estudios_Territoriales` (constante `TIPOS_OCULTOS` en `map.js`), salvo los
fondos adjudicados: proyectos de "Varias comunas" financiados por MIDESO o
DGA (`FONDOS_ADJUDICADOS` en el script). Esos van en zona `Transversal`, se
muestran siempre y en el popup dicen "Fondo adjudicado", "Monto adjudicado"
y "Habitantes (Censo)". Además colorea
cada proyecto según su línea de trabajo (Inversión Pública, Ejecución de
Obras, Asistencia Técnica).

Coordenadas: se calculan desde `UTM Este` / `UTM Norte` / `UTM Huso` (WGS84)
y se validan contra el polígono de la comuna. `ubicacion_tipo` indica el
resultado: `exacta`, `aproximada` (UTM redondeada al km o unos km fuera del
borde, p.ej. islas o costa) o `centroide` (la coordenada de la fuente cae
lejos de su comuna o no existe, y se usa el centro de la comuna). El script
imprime la lista de proyectos que quedaron en centroide para corregirlos en
el Excel.

`linea_tiempo` trae los hitos (postulación o entrega, aprobación, asignación
presupuestaria, inicio y término de ejecución) como `YYYY-MM`, igual que la
fuente, que registra las fechas a nivel de mes.

```json
{
  "Mejillones": [
    {
      "id": "MEJ 22_06 PLA",
      "codigo_fhl": "MEJ 22_06 PLA",
      "name": "Mejoramiento Plaza de Los Profesores",
      "tipo": "Espacios_Públicos",
      "subcategoria": "Plazas",
      "linea_trabajo": "Inversión Pública",
      "estado": "Cerrado",
      "estado_key": "cerrado",
      "monto": 0,
      "aportes_diseno": 7136000,
      "financiamiento": "PMU",
      "socio": "M_MEJ",
      "anio_convenio": 2022,
      "participantes": "S/I",
      "beneficiarios_hombres": "S/I",
      "beneficiarios_mujeres": "S/I",
      "magnitud": "S/I",
      "unidad": "S/I",
      "linea_tiempo": {
        "postulacion": "S/I",
        "aprobacion": "S/I",
        "asignacion_presupuestaria": "S/I",
        "inicio_ejecucion": "S/I",
        "termino_ejecucion": "S/I"
      },
      "region": "Antofagasta",
      "zona": "Norte",
      "convenio": "Vigente",
      "lat": -23.107936,
      "lng": -70.444231,
      "ubicacion_aproximada": false,
      "ubicacion_tipo": "exacta"
    }
  ]
}
```

## 🔧 Personalización

### Fotos de proyectos

Cada proyecto puede tener 3 fotos que se ven en un carrusel (link "📷 Ver
fotos" bajo el proyecto, en el sidebar y en el popup del mapa). Las imágenes
van en la carpeta `img/` (en la raíz del proyecto) y se asocian por `id` de
proyecto en `PROJECT_PHOTOS`, dentro de `assets/js/map.js`:

```js
const PROJECT_PHOTOS = {
    'MEJ 22_06 PLA': ['img/foto1.jpeg', 'img/foto2.jpeg', 'img/foto3.jpeg'] // Mejoramiento Plaza de Los Profesores
};
```

Ahora mismo solo está configurado para ese proyecto. Para agregar fotos a
otro, sube sus 3 imágenes a `img/` (con nombres que no choquen con las ya
existentes) y agrega una entrada nueva con su `id` (se puede ver en
`data/proyectos_comunas.json`). Un proyecto sin entrada en `PROJECT_PHOTOS`
simplemente no muestra el link de fotos.

### Agregar o actualizar proyectos

Actualizar el Excel `origen/Resumen_Proyectos_Huella_Local.xlsx` (hoja
PROYECTOS) y regenerar el JSON:

```
python scripts/transformar_proyectos.py
```

Mismo criterio de siempre: nada de datos inventados, `"S/I"` para lo que
falte. Requiere `pandas`, `openpyxl`, `pyproj` y `shapely`.

### Cambiar estilos

Modifica `assets/css/style.css`:
- Colores principales: `#2c3e50`, `#3498db`
- Transiciones y animaciones
- Estilos responsivos

## 🛠️ Tecnologías

- **Leaflet.js**: Biblioteca de mapas interactivos
- **HTML5/CSS3**: Estructura y estilos
- **JavaScript Vanilla**: Sin dependencias externas
- **JSON**: Almacenamiento de datos geográficos

## 📄 Licencia

Proyecto de Huella Local
