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
│   └── mesas_territoriales/           # En pausa: la interfaz ya no carga estos
│                                         datos (eran de ejemplo). Se dejan los
│                                         archivos por si se retoman más adelante.
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
- 📍 **Los 293 proyectos se muestran desde el inicio**, sin necesidad de filtrar
- 🔍 **Filtros jerárquicos**: Región → Provincia → Comuna (acotan qué proyectos se ven)
- 📍 **Proyectos geolocalizados**, con zoom in automático al pinchar uno (desde el mapa o el sidebar)
- 📷 **Carrusel de fotos** por proyecto (opcional, ver sección "Fotos de proyectos" abajo)
- 📊 **Tooltips** con: nombre, monto, participantes, porcentaje de avance
- 🎨 **Interfaz moderna** con sidebar ocultable
- 📱 **Responsive** para dispositivos móviles

## 🚀 Uso

1. Abre `index.html` en tu navegador — el mapa carga con los 293 proyectos ya visibles como puntos azules
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
