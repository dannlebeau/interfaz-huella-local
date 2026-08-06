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
│   ├── proyectos_comunas.json         # 293 proyectos reales, agrupados por comuna
│   │                                     (fuente: Resumen_proyectos.xlsx de Huella Local)
│   └── mesas_territoriales/
│       ├── mesas.geojson              # Mesas territoriales (datos de ejemplo:
│       │                                 las mesas reales todavía no están definidas)
│       └── proyectos.json             # Proyectos de ejemplo por mesa
├── assets/
│   ├── css/
│   │   └── style.css      # Estilos de la aplicación
│   └── js/
│       └── map.js         # Lógica principal del mapa
└── README.md              # Este archivo
```

## ✨ Características

- 🗺️ **Mapa interactivo** centrado en Chile con Leaflet
- 🔍 **Filtros jerárquicos**: Región → Provincia → Comuna
- 📍 **Proyectos geolocalizados** con información detallada
- 📊 **Tooltips** con: nombre, monto, participantes, porcentaje de avance
- 🎨 **Interfaz moderna** con sidebar ocultable
- 📱 **Responsive** para dispositivos móviles

## 🚀 Uso

1. Abre `index.html` en tu navegador
2. Haz click en el botón ☰ para abrir los filtros
3. Selecciona:
   - **Región** (se cargan automáticamente las provincias)
   - **Provincia** (se cargan automáticamente las comunas)
   - **Comuna** (selecciona la comuna deseada)
4. Haz click en **Aceptar** para centrar el mapa
5. Los proyectos aparecerán como puntos azules
6. Haz click en un proyecto para ver detalles

## 📊 Estructura de Datos

### proyectos_comunas.json

Agrupado por comuna (el nombre debe calzar exacto con la propiedad `Comuna` de
`Comunas.geojson`). Los proyectos sin comuna real identificable en la fuente
(por ejemplo, un estudio a nivel regional) quedan bajo la clave especial
`__sin_comuna__` en vez de perderse. Cuando la fuente no traía un dato, el
campo queda como el string `"S/I"` en lugar de inventarlo; cuando no traía
coordenadas válidas, se usa el centroide de la comuna como ubicación
aproximada y `ubicacion_aproximada` queda en `true`.

```json
{
  "Mejillones": [
    {
      "id": "MEJ 22_03 EQC",
      "name": "Prefactibilidad Construcción Terminal de Buses",
      "tipo": "Equipamiento",
      "estado": "Desarrollo",
      "estado_key": "desarrollo",
      "monto": 3232569800,
      "aportes_diseno": 159650000,
      "participantes": "S/I",
      "fecha_inicio": "S/I",
      "fecha_termino": "S/I",
      "region": "Antofagasta",
      "zona": "Norte",
      "convenio": "Vigente",
      "lat": -23.110747,
      "lng": -70.450211,
      "ubicacion_aproximada": false
    }
  ]
}
```

### mesas_territoriales/

Estructura equivalente pero por mesa territorial en vez de por comuna —
todavía con datos de ejemplo, porque las mesas reales no están definidas.
Cuando se definan, conviene regenerarlas con el mismo criterio (nada
inventado, `"S/I"` para lo que falte) que `proyectos_comunas.json`.

## 🔧 Personalización

### Agregar o actualizar proyectos

Editar `data/proyectos_comunas.json` directamente (agrupado por comuna, ver
estructura arriba), o volver a exportar desde el Excel fuente y regenerar el
archivo con el mismo criterio: nada de datos inventados, `"S/I"` para lo que
falte.

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
