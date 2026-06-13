# Huella Local - Visualización de Proyectos en Chile

Aplicación interactiva para visualizar proyectos comunitarios de Huella Local en un mapa de Chile con filtros jerárquicos por región, provincia y comuna.

## 📁 Estructura del Proyecto

```
interfaz_huella_local/
├── index.html              # Página principal
├── data/
│   ├── regiones.json      # Datos de regiones de Chile
│   ├── provincias.json    # Datos de provincias por región
│   └── comunas.json       # Datos de comunas por provincia
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

### regiones.json
```json
{
  "regiones": [
    {
      "id": 1,
      "nombre": "Región de Arica y Parinacota",
      "lat": -18.4783,
      "lng": -70.2990
    }
  ]
}
```

### provincias.json
```json
{
  "provincias": {
    "Región de Arica y Parinacota": [
      {
        "id": 1,
        "nombre": "Arica",
        "lat": -18.4783,
        "lng": -70.2990
      }
    ]
  }
}
```

### comunas.json
```json
{
  "comunas": {
    "Arica": [
      {
        "id": 1,
        "nombre": "Arica",
        "lat": -18.4783,
        "lng": -70.2990
      }
    ]
  }
}
```

## 🔧 Personalización

### Agregar nuevos proyectos

Edita la sección `projectsByCommune` en `assets/js/map.js`:

```javascript
"NombreComuna": [
    {
        id: 1,
        name: "Nombre del Proyecto",
        monto: 1000000,        // Monto en CLP
        participantes: 50,      // Cantidad de participantes
        avance: 75,             // Porcentaje de avance (0-100)
        lat: -23.1061,          // Latitud
        lng: -70.4608           // Longitud
    }
]
```

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
