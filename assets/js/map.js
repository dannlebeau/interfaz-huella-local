//=============== FIRMA Y CLICK DERECHO ===============//
// Bloquea el menú contextual (click derecho). No impide ver el código con
// F12/Ctrl+U -- ningún sitio puede evitar eso -- pero saca el atajo directo.
document.addEventListener('contextmenu', (e) => e.preventDefault());

console.log(
    '%cHuella Local %c· Visualización de Proyectos en Chile\nConstruido por Dann LeBeau — https://dannlebeau.github.io/ownroute.github.io/',
    'color:#3498db; font-weight:bold; font-size:14px;',
    'color:#2c3e50; font-size:12px;'
);

//=============== INICIALIZACIÓN DEL MAPA ===============//

// Centrar el mapa en Chile (-35.6751°, -71.5430°)
var map = L.map('map').setView([-35.6751, -71.5430], 4);

// Capas base del mapa. Todas permiten zoom hasta 19 en el mapa (para poder
// acercarse a un proyecto puntual): cuando el proveedor no tiene imágenes
// nativas a ese nivel, `maxNativeZoom` hace que Leaflet reescale el último
// tile disponible en vez de pedir uno inexistente -- eso es lo que evita el
// cartel "Map data not yet available" de Esri World Imagery en zonas rurales.
var cartoDBPositronLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
    attribution: '© CartoDB, © OpenStreetMap',
    maxZoom: 19
});

var openStreetMapLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
});

var cartoDBDarkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
    attribution: '© CartoDB, © OpenStreetMap',
    maxZoom: 19
});

var esriWorldImageryLayer = L.tileLayer('https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles © Esri',
    maxZoom: 19,
    maxNativeZoom: 17
});

var esriWorldTopoLayer = L.tileLayer('https://server.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles © Esri',
    maxZoom: 19,
    maxNativeZoom: 18
});

var openTopoMapLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenTopoMap (CC-BY-SA), © OpenStreetMap',
    maxZoom: 19,
    maxNativeZoom: 17
});

// Capa por defecto: Esri Satelital. El "Map data not yet available" ya
// queda resuelto con maxNativeZoom (arriba): más allá del zoom nativo,
// Leaflet reescala el último tile en vez de pedir uno inexistente.
esriWorldImageryLayer.addTo(map);

// Control de capas
var baseMaps = {
    "CartoDB Positron": cartoDBPositronLayer,
    "OpenStreetMap": openStreetMapLayer,
    "CartoDB Oscuro": cartoDBDarkLayer,
    "Esri Satelital": esriWorldImageryLayer,
    "Esri Topográfico": esriWorldTopoLayer,
    "OpenTopoMap": openTopoMapLayer,
};

var layerControl = L.control.layers(baseMaps, null, { position: 'topright', collapsed: true }).addTo(map);

// Agregar controles de zoom personalizados debajo del control de capas
var zoomControl = L.control.zoom({ position: 'topright' });
map.removeControl(map.zoomControl); // Remover el zoom por defecto
zoomControl.addTo(map);

//=============== PANTALLA DE BIENVENIDA ===============//

const welcomeSplash = document.getElementById('welcomeSplash');

function closeWelcomeSplash() {
    welcomeSplash.classList.add('hidden');
}

welcomeSplash.addEventListener('click', closeWelcomeSplash);
document.getElementById('welcomeEnter').addEventListener('click', (e) => {
    e.stopPropagation(); // evita el doble disparo con el click del overlay
    closeWelcomeSplash();
});

//=============== CONTROL DE SIDEBAR ===============//

const sidebar = document.getElementById('sidebar');
const toggleBtn = document.getElementById('toggleSidebar');
const closeBtn = document.getElementById('closeSidebar');

toggleBtn.addEventListener('click', () => {
    sidebar.classList.add('active');
});

closeBtn.addEventListener('click', () => {
    sidebar.classList.remove('active');
});

// Cerrar sidebar al hacer click fuera
map.on('click', () => {
    sidebar.classList.remove('active');
});

// No cerrar sidebar al hacer click dentro
sidebar.addEventListener('click', (e) => {
    e.stopPropagation();
});

//=============== CONTROL DE FILTROS ===============//

const regionSelect = document.getElementById('regionSelect');
const provinceSelect = document.getElementById('provinceSelect');
const communeSelect = document.getElementById('communeSelect');
const applyBtn = document.getElementById('applyFilters');
const resetBtn = document.getElementById('resetFilters');

let projectMarkers = {}; // Almacenar markers de proyectos
let regionesData = {};
let provinciasData = {};
let comunasData = {};
let comunaInfo = {}; // comuna -> { region, provincia }, para aplicar filtros desde el resumen general
let limitesLayer = null; // Capa de límites
let projectsByCommune = {}; // Almacenar proyectos por comuna
let proyectosVisibles = []; // Proyectos de la selección actual (filtros/zona)
let alcanceActual = 'Todo Chile'; // Nombre de esa selección, para el panel derecho
let proyectoSeleccionado = null; // Proyecto con el popup abierto (el panel lo muestra a él)

// Fotos por proyecto (id -> arreglo de 3 rutas en /img). Un proyecto sin
// entrada acá simplemente no muestra el link "Ver fotos".
const PROJECT_PHOTOS = {
    'MEJ 22_06 PLA': ['img/foto1.jpeg', 'img/foto2.jpeg', 'img/foto3.jpeg'] // Mejoramiento Plaza de Los Profesores
};

// Cargar datos desde Comunas.geojson
async function loadData() {
    try {
        // Cargar el GeoJSON de Comunas (contiene toda la jerarquía) y los
        // proyectos por comuna en paralelo
        const [comunasGeoJSON, proyectosRes] = await Promise.all([
            fetch('./data/Comunas.geojson'),
            fetch('./data/proyectos_comunas.json'),
        ]);
        window.comunasGeoJSON = await comunasGeoJSON.json();
        projectsByCommune = await proyectosRes.json();

        // Reproject desde Web Mercator a WGS84
        reprojectGeoJSON(window.comunasGeoJSON);

        // Extraer datos únicos del GeoJSON
        extractDataFromGeoJSON();

        loadRegions();
        renderGeneralStats();
        renderProjects(getAllProjects(), 'Todo Chile');

        console.log('✅ Proyectos visibles:', getAllProjects().length);
    } catch (error) {
        console.error('Error al cargar datos:', error);
    }
}

// Función para convertir de Web Mercator (EPSG:3857) a WGS84 (lat/lng)
function mercatorToWGS84(x, y) {
    const earthRadius = 6378137;
    const lng = (x / earthRadius) * (180 / Math.PI);
    const lat = (2 * Math.atan(Math.exp(y / earthRadius)) - Math.PI / 2) * (180 / Math.PI);
    return [lng, lat]; // Retorna [lng, lat] para mantener formato GeoJSON [lon, lat]
}

// Reprojectear GeoJSON de Web Mercator a WGS84
function reprojectGeoJSON(geojson) {
    if (!geojson || !geojson.features) return;
    
    geojson.features.forEach(feature => {
        if (feature.geometry) {
            feature.geometry.coordinates = reprojectCoordinates(feature.geometry.coordinates, feature.geometry.type);
        }
    });
}

// Reprojectear coordenadas según el tipo de geometría
function reprojectCoordinates(coords, geomType) {
    if (geomType === 'Polygon') {
        return [coords[0].map(coord => mercatorToWGS84(coord[0], coord[1]))];
    } else if (geomType === 'MultiPolygon') {
        return coords.map(polygon => [polygon[0].map(coord => mercatorToWGS84(coord[0], coord[1]))]);
    }
    return coords;
}

// Orden geográfico oficial de las regiones de Chile, de norte a sur
// (codregion del GeoJSON). RM (13) no es correlativo por número pero sí por
// posición geográfica, igual que Ñuble (16) y Los Ríos (14).
const ORDEN_CODREGION = [15, 1, 2, 3, 4, 5, 13, 6, 7, 16, 8, 9, 14, 10, 11, 12];

// Extraer regiones, provincias y comunas del Comunas.geojson
function extractDataFromGeoJSON() {
    // Estructura de datos para la jerarquía
    regionesData = [];
    provinciasData = {};
    comunasData = {};
    comunaInfo = {};

    const regionesSet = new Set();
    const codregionPorRegion = {};
    const provinciasSet = {};

    if (window.comunasGeoJSON && window.comunasGeoJSON.features) {
        window.comunasGeoJSON.features.forEach(feature => {
            if (feature.properties) {
                const region = feature.properties.Region;
                const provincia = feature.properties.Provincia;
                const comuna = feature.properties.Comuna;
                const geometry = feature.geometry;

                // Extraer regiones únicas
                if (region) {
                    regionesSet.add(region);
                    if (codregionPorRegion[region] === undefined) {
                        codregionPorRegion[region] = feature.properties.codregion;
                    }
                }
                
                // Extraer provincias por región
                if (region && provincia) {
                    if (!provinciasData[region]) {
                        provinciasData[region] = new Set();
                    }
                    provinciasData[region].add(provincia);
                }
                
                // Extraer comunas por provincia
                if (provincia && comuna) {
                    if (!comunasData[provincia]) {
                        comunasData[provincia] = [];
                    }

                    if (!comunaInfo[comuna]) {
                        comunaInfo[comuna] = { region, provincia };
                    }
                    
                    // Obtener centroide de la geometría
                    let coords = getCentroid(geometry);
                    
                    // Evitar duplicados
                    if (!comunasData[provincia].find(c => c.nombre === comuna)) {
                        comunasData[provincia].push({
                            nombre: comuna,
                            lat: coords.lat,
                            lng: coords.lng,
                            region: region
                        });
                    }
                }
            }
        });
    }
    
    // Convertir Sets a Arrays y ordenar geográficamente (norte a sur), no
    // alfabéticamente: un sort de texto pone "Región Metropolitana" antes que
    // "Región de Antofagasta" (M mayúscula < d minúscula en ASCII).
    // "Zona sin demarcar" es el límite internacional no demarcado del Campo de
    // Hielo Sur (sin comunas ni proyectos posibles) — se omite del selector.
    regionesSet.delete('Zona sin demarcar');

    regionesData = Array.from(regionesSet).sort((a, b) => {
        const posA = ORDEN_CODREGION.indexOf(codregionPorRegion[a]);
        const posB = ORDEN_CODREGION.indexOf(codregionPorRegion[b]);
        if (posA === -1 && posB === -1) return a.localeCompare(b);
        if (posA === -1) return 1; // regiones sin codregion conocido (ej. "Zona sin demarcar") al final
        if (posB === -1) return -1;
        return posA - posB;
    });
    
    Object.keys(provinciasData).forEach(region => {
        provinciasData[region] = Array.from(provinciasData[region]).sort();
    });
    
    Object.keys(comunasData).forEach(provincia => {
        comunasData[provincia].sort((a, b) => a.nombre.localeCompare(b.nombre));
    });
    
    console.log('✅ Datos cargados correctamente');
    console.log('Regiones:', regionesData.length);
    console.log('Provincias:', Object.keys(provinciasData).length);
    console.log('Comunas:', Object.keys(comunasData).length);
}

// Función para obtener el centroide de una geometría GeoJSON (después de reproyectar)
function getCentroid(geometry) {
    if (!geometry) return { lat: -35.6751, lng: -71.5430 }; // Chile por defecto
    
    let lat = 0, lng = 0, count = 0;
    
    if (geometry.type === 'Polygon' && geometry.coordinates[0]) {
        geometry.coordinates[0].forEach(coord => {
            lng += coord[0]; // coord[0] es longitude
            lat += coord[1]; // coord[1] es latitude
            count++;
        });
    } else if (geometry.type === 'MultiPolygon' && geometry.coordinates[0] && geometry.coordinates[0][0]) {
        geometry.coordinates[0][0].forEach(coord => {
            lng += coord[0]; // coord[0] es longitude
            lat += coord[1]; // coord[1] es latitude
            count++;
        });
    }
    
    return {
        lat: count > 0 ? lat / count : -35.6751,
        lng: count > 0 ? lng / count : -71.5430
    };
}

// Cargar regiones en el select
function loadRegions() {
    if (Array.isArray(regionesData)) {
        regionesData.forEach(region => {
            const option = document.createElement('option');
            option.value = region;
            option.textContent = region;
            regionSelect.appendChild(option);
        });
    }
}

// Cargar provincias cuando se selecciona una región
regionSelect.addEventListener('change', function() {
    const selectedRegion = this.value;
    provinceSelect.innerHTML = '<option value="">-- Seleccionar Provincia --</option>';
    communeSelect.innerHTML = '<option value="">-- Seleccionar Comuna --</option>';
    communeSelect.disabled = true;
    
    if (selectedRegion && provinciasData[selectedRegion]) {
        const provinces = provinciasData[selectedRegion];
        provinces.forEach(province => {
            const option = document.createElement('option');
            option.value = province;
            option.textContent = province;
            provinceSelect.appendChild(option);
        });
        provinceSelect.disabled = false;
    } else {
        provinceSelect.disabled = true;
    }
});

// Cargar comunas cuando se selecciona una provincia
provinceSelect.addEventListener('change', function() {
    const selectedProvince = this.value;
    communeSelect.innerHTML = '<option value="">-- Seleccionar Comuna --</option>';
    
    if (selectedProvince && comunasData[selectedProvince]) {
        const communes = comunasData[selectedProvince];
        communes.forEach(commune => {
            const option = document.createElement('option');
            option.value = commune.nombre;
            option.textContent = commune.nombre;
            communeSelect.appendChild(option);
        });
        communeSelect.disabled = false;
    } else {
        communeSelect.disabled = true;
    }
});

// Aplicar filtros y centrar mapa
applyBtn.addEventListener('click', function() {
    const selectedRegion = regionSelect.value;
    const selectedProvince = provinceSelect.value;
    const selectedCommune = communeSelect.value;
    
    if (!selectedRegion) {
        alert('Por favor selecciona al menos una región');
        return;
    }
    
    // Mostrar límites de la selección (región, provincia o comuna)
    showLimits(selectedRegion, selectedProvince, selectedCommune);

    // Mostrar los proyectos que calzan con el filtro elegido
    setZonaActiva(null);
    renderProjects(
        getFilteredProjects(selectedRegion, selectedProvince, selectedCommune),
        selectedCommune || selectedProvince || selectedRegion
    );

    sidebar.classList.remove('active');
});

// Limpiar filtros
resetBtn.addEventListener('click', function() {
    regionSelect.value = '';
    provinceSelect.value = '';
    provinceSelect.innerHTML = '<option value="">-- Seleccionar Provincia --</option>';
    provinceSelect.disabled = true;
    communeSelect.value = '';
    communeSelect.innerHTML = '<option value="">-- Seleccionar Comuna --</option>';
    communeSelect.disabled = true;

    // Volver a mostrar todos los proyectos
    setZonaActiva(null);
    renderProjects(getAllProjects(), 'Todo Chile');
    clearLimits();

    // Centrar en Chile
    map.setView([-35.6751, -71.5430], 4);
});

//=============== MANEJO DE PROYECTOS ===============//

function showLimits(region, province, commune) {
    // Remover capa anterior
    if (limitesLayer) {
        map.removeLayer(limitesLayer);
    }
    
    if (window.comunasGeoJSON && window.comunasGeoJSON.features) {
        const filteredFeatures = window.comunasGeoJSON.features.filter(f => {
            if (!f.properties) return false;
            if (commune) {
                return f.properties.Comuna === commune;
            } else if (province) {
                return f.properties.Provincia === province;
            } else if (region) {
                return f.properties.Region === region;
            }
            return false;
        });
        
        const limits = {
            type: "FeatureCollection",
            features: filteredFeatures
        };
        
        if (limits.features.length > 0) {
            limitesLayer = L.geoJSON(limits, {
                style: function(feature) {
                    return {
                        color: '#e74c3c',
                        weight: 2,
                        opacity: 0.8,
                        fillOpacity: 0
                    };
                },
                interactive: false
            }).addTo(map);
            
            // Centrar el mapa automáticamente en los límites
            map.fitBounds(limitesLayer.getBounds());
        } else {
            alert('No se encontraron límites para esta selección');
        }
    }
}

function clearLimits() {
    if (limitesLayer) {
        map.removeLayer(limitesLayer);
        limitesLayer = null;
    }
}

// Aplica Región/Provincia/Comuna en los selects y muestra sus proyectos,
// igual que si el usuario los hubiera elegido a mano y apretado "Aceptar".
// Se usa desde el resumen general al pinchar un dato clave o la comuna con
// más proyectos, para que el punto Y sus filtros queden sincronizados.
function aplicarFiltrosPorComuna(comuna) {
    const info = comunaInfo[comuna];
    if (!info) return false;

    regionSelect.value = info.region;
    regionSelect.dispatchEvent(new Event('change'));
    provinceSelect.value = info.provincia;
    provinceSelect.dispatchEvent(new Event('change'));
    communeSelect.value = comuna;

    setZonaActiva(null);
    showLimits(info.region, info.provincia, comuna);
    renderProjects(getFilteredProjects(info.region, info.provincia, comuna), comuna);
    return true;
}

// Deja los selects de Región/Provincia/Comuna vacíos sin volver a pintar.
function limpiarSelects() {
    regionSelect.value = '';
    provinceSelect.innerHTML = '<option value="">-- Seleccionar Provincia --</option>';
    provinceSelect.disabled = true;
    communeSelect.innerHTML = '<option value="">-- Seleccionar Comuna --</option>';
    communeSelect.disabled = true;
}

//=============== FILTRO POR ZONA (desde el resumen general) ===============//

let zonaActiva = null;

function setZonaActiva(zona) {
    zonaActiva = zona;
    document.querySelectorAll('.zona-row[data-zona]').forEach(el => {
        el.classList.toggle('active', el.dataset.zona === zona);
    });
}

// Pinchar una zona muestra solo sus proyectos; pinchar la misma zona otra
// vez vuelve a mostrar todos. Reemplaza cualquier filtro Región/Provincia/Comuna.
function filtrarPorZona(zona) {
    limpiarSelects();
    clearLimits();

    if (zona === zonaActiva) {
        setZonaActiva(null);
        renderProjects(getAllProjects(), 'Todo Chile');
        map.setView([-35.6751, -71.5430], 4);
        return;
    }

    setZonaActiva(zona);
    const proyectos = getAllProjects().filter(p => (p.zona || 'S/I') === zona);
    renderProjects(proyectos, `Zona ${zona}`);

    const markers = proyectos.map(p => projectMarkers[p.id]).filter(Boolean);
    if (markers.length) {
        map.fitBounds(L.featureGroup(markers).getBounds(), { padding: [40, 40], maxZoom: 12 });
    }
}

// Tipos que por ahora no se muestran en la interfaz (siguen en el JSON).
// Excepción: los fondos adjudicados (MIDESO, DGA; marcados por el script con
// fondo_adjudicado) se muestran siempre.
const TIPOS_OCULTOS = new Set(['Servicios_Profesionales', 'Estudios_Territoriales']);

// Color de cada proyecto según su línea de trabajo (columna "Línea de
// Trabajo" del Excel). Se usa en los markers y en la leyenda.
const LINEAS_TRABAJO = {
    'Inversión Pública': { fill: '#3498db', borde: '#21618c' },
    'Ejecución de Obras': { fill: '#e67e22', borde: '#a04000' },
    'Asistencia Técnica': { fill: '#1e8449', borde: '#145a32' },
};
const LINEA_TRABAJO_SIN_INFO = { fill: '#95a5a6', borde: '#616a6b' };

function colorLineaTrabajo(linea) {
    return LINEAS_TRABAJO[linea] || LINEA_TRABAJO_SIN_INFO;
}

// Todos los proyectos visibles, aplanados desde projectsByCommune y con la
// comuna incluida en cada proyecto (útil para filtrar/agrupar).
function getAllProjects() {
    return Object.entries(projectsByCommune).flatMap(([comuna, arr]) =>
        arr.filter(p => !TIPOS_OCULTOS.has(p.tipo) || p.fondo_adjudicado)
            .map(p => ({ ...p, comuna }))
    );
}

// Filtra los proyectos según el nivel de filtro elegido (comuna > provincia > región).
function getFilteredProjects(region, province, commune) {
    return getAllProjects().filter(p => {
        if (commune) return p.comuna === commune;
        const info = comunaInfo[p.comuna];
        if (!info) return false;
        if (province) return info.provincia === province;
        return info.region === region;
    });
}

// Pinta la lista en el sidebar, los markers en el mapa y el panel de
// beneficiarios para un conjunto de proyectos. `alcance` describe el filtro
// activo (p.ej. "Zona Norte", "Biobío") para el panel derecho.
function renderProjects(projects, alcance = 'Todo Chile') {
    const projectsList = document.getElementById('projectsList');
    projectsList.innerHTML = '';

    // Se guardan antes de limpiar los markers: al quitarlos se cierra el
    // popup abierto y el panel vuelve a esta selección.
    proyectosVisibles = projects;
    alcanceActual = alcance;
    clearProjectMarkers();
    actualizarPanelSegunVista();

    if (projects.length === 0) {
        projectsList.innerHTML = '<div style="padding: 15px; color: #7f8c8d;">No hay proyectos en esta selección</div>';
        return;
    }

    // Agrupar por categoría (campo "tipo") para poder recorrer los
    // proyectos por tema en vez de una lista plana.
    const porCategoria = {};
    projects.forEach(project => {
        const categoria = project.tipo || 'S/I';
        if (!porCategoria[categoria]) porCategoria[categoria] = [];
        porCategoria[categoria].push(project);
    });

    const categoriasOrdenadas = Object.keys(porCategoria).sort(
        (a, b) => porCategoria[b].length - porCategoria[a].length
    );

    categoriasOrdenadas.forEach(categoria => {
        const proyectosCategoria = porCategoria[categoria];

        const grupo = document.createElement('details');
        grupo.className = 'category-group';
        grupo.open = categoriasOrdenadas.length === 1;

        const resumen = document.createElement('summary');
        resumen.className = 'category-summary';
        resumen.innerHTML = `
            <span class="category-name">${categoria.replace(/_/g, ' ')}</span>
            <span class="category-count">${proyectosCategoria.length}</span>
        `;
        grupo.appendChild(resumen);

        proyectosCategoria.forEach(project => {
            const photos = PROJECT_PHOTOS[project.id];
            const tienePhotos = !!photos;

            const projectItem = document.createElement('div');
            projectItem.className = 'project-item';
            projectItem.innerHTML = `
                <div class="project-header" style="margin-bottom:4px;">
                    <span class="project-type">${project.tipo}</span>
                    <span class="project-status status-${project.estado_key}">${project.estado}</span>
                </div>
                <strong>${project.name}</strong>
                ${noAplica(project.monto) ? '' : `<small>Monto: ${formatMonto(project.monto)}</small>`}
                ${noAplica(project.participantes) ? '' : `<small>Beneficiarios: ${formatCantidad(project.participantes)}</small>`}
                ${tienePhotos ? `
                <div class="project-photos-thumbs">
                    ${photos.map((src, idx) => `<img src="${src}" class="project-photo-thumb" data-idx="${idx}" alt="Foto ${idx + 1} de ${project.name}">`).join('')}
                </div>` : ''}
            `;

            projectItem.addEventListener('click', () => {
                centerOnProject(project);
            });

            if (tienePhotos) {
                projectItem.querySelectorAll('.project-photo-thumb').forEach(thumb => {
                    thumb.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openPhotoCarousel(project.id, Number(thumb.dataset.idx));
                    });
                });
            }

            grupo.appendChild(projectItem);

            // Agregar marker en el mapa (si el proyecto trae coordenadas)
            addProjectMarker(project);
        });

        projectsList.appendChild(grupo);
    });
}

function addProjectMarker(project) {
    if (typeof project.lat !== 'number' || typeof project.lng !== 'number') return;

    const color = colorLineaTrabajo(project.linea_trabajo);
    const marker = L.circleMarker([project.lat, project.lng], {
        radius: 8,
        fillColor: color.fill,
        color: color.borde,
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
    }).addTo(map);
    
    // Crear popup con información detallada
    const popupContent = `
        <div class="popup-content">
            <div class="project-header" style="margin-bottom:6px;">
                <span class="project-type">${project.tipo}</span>
                <span class="project-status status-${project.estado_key}">${project.estado}</span>
            </div>
            <h4>${project.name}</h4>
            ${noAplica(project.monto) ? '' : `<p><strong>${project.fondo_adjudicado ? 'Monto adjudicado' : 'Monto'}:</strong> ${formatMonto(project.monto)}</p>`}
            ${noAplica(project.participantes) ? '' : `<p><strong>${project.fondo_adjudicado ? 'Habitantes (Censo)' : 'Beneficiarios'}:</strong> ${formatCantidad(project.participantes)}</p>`}
            <p><strong>Región:</strong> ${project.region} &middot; <strong>Comuna:</strong> ${nombreComuna(project.comuna)}</p>
            ${tieneDato(project.socio) ? `<p><strong>${project.fondo_adjudicado ? 'Fondo adjudicado' : 'Socio / Empresa'}:</strong> ${project.socio}</p>` : ''}
            ${tieneDato(project.financiamiento) ? `<p><strong>Financiamiento:</strong> ${project.financiamiento}</p>` : ''}
            ${typeof project.magnitud === 'number' ? `<p><strong>Magnitud:</strong> ${formatNumber(project.magnitud)}${tieneDato(project.unidad) ? ' ' + project.unidad : ''}</p>` : ''}
            ${renderLineaTiempo(project.linea_tiempo)}
            ${textoUbicacion(project)}
            <a class="popup-gmaps-link" href="https://www.google.com/maps/search/?api=1&query=${project.lat},${project.lng}" target="_blank" rel="noopener">📍 Ver en Google Maps</a>
            ${PROJECT_PHOTOS[project.id] ? `
            <div class="popup-photos-thumbs">
                ${PROJECT_PHOTOS[project.id].map((src, idx) => `<img src="${src}" class="popup-photo-thumb" onclick="openPhotoCarousel('${project.id}', ${idx}); return false;" alt="Foto ${idx + 1}">`).join('')}
            </div>` : ''}
        </div>
    `;

    marker.bindPopup(popupContent, { maxWidth: 340 });
    marker.on('click', function() {
        // Al pinchar un proyecto en el mapa, hacer zoom in y centrarlo (igual
        // que al elegirlo desde el sidebar), no solo abrir el popup.
        centerOnProject(project);
    });

    // Al cerrar el popup, el panel vuelve a mostrar la selección completa.
    marker.on('popupclose', () => {
        proyectoSeleccionado = null;
        actualizarPanelSegunVista();
    });

    projectMarkers[project.id] = marker;
}

function centerOnProject(project) {
    map.setView([project.lat, project.lng], 16);

    // Abrir popup del marcador
    if (projectMarkers[project.id]) {
        projectMarkers[project.id].openPopup();
    }

    // Después de abrir el popup: abrirlo cierra el anterior, y ese cierre
    // restaura el panel a la selección completa.
    proyectoSeleccionado = project;
    renderPanelBeneficiarios([project], project.name, alcanceActual);

    sidebar.classList.remove('active');
}

function clearProjectMarkers() {
    Object.values(projectMarkers).forEach(marker => {
        map.removeLayer(marker);
    });
    projectMarkers = {};
}

function formatNumber(num) {
    return new Intl.NumberFormat('es-CL').format(num);
}

// Los proyectos reales traen "S/I" (sin información) en vez de un número
// cuando el dato no existía en la fuente — no se inventa un valor.
function formatMonto(valor) {
    return typeof valor === 'number' ? `$${formatNumber(Math.round(valor))}` : 'S/I';
}

function formatCantidad(valor) {
    return typeof valor === 'number' ? formatNumber(valor) : 'S/I';
}

// "N/A" = no aplica a este proyecto (viene como "NA" en el Excel): el dato no
// se muestra. "S/I" = aplica pero no hay información todavía.
function noAplica(valor) {
    return valor === 'N/A';
}

function tieneDato(valor) {
    return valor !== undefined && valor !== null && valor !== '' && valor !== 'S/I' && !noAplica(valor);
}

// Hitos del proyecto en el orden en que ocurren. Las fechas de la fuente son
// a nivel de mes ("YYYY-MM").
const HITOS_LINEA_TIEMPO = [
    ['postulacion', 'Postulación o entrega'],
    ['aprobacion', 'Aprobación'],
    ['asignacion_presupuestaria', 'Asignación presup.', 'Asignación presupuestaria'],
    ['inicio_ejecucion', 'Inicio ejecución'],
    ['termino_ejecucion', 'Término ejecución'],
];

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatMes(valor) {
    const m = /^(\d{4})-(\d{2})/.exec(valor || '');
    return m ? `${MESES_CORTOS[Number(m[2]) - 1]} ${m[1]}` : null;
}

// Línea de tiempo horizontal: un punto por hito, relleno si la fuente trae
// la fecha y vacío ("—") si no. Los hitos que no aplican al proyecto se
// omiten. Si no hay ningún hito con fecha, no se muestra.
function renderLineaTiempo(lineaTiempo) {
    if (!lineaTiempo) return '';
    const hitos = HITOS_LINEA_TIEMPO
        .filter(([clave]) => !noAplica(lineaTiempo[clave]))
        .map(([clave, etiqueta, nombreCompleto]) => ({
            etiqueta,
            nombreCompleto: nombreCompleto || etiqueta,
            fecha: formatMes(lineaTiempo[clave]),
        }));
    if (!hitos.some(h => h.fecha)) return '';

    return `
        <div class="timeline">
            <div class="timeline-title">Línea de tiempo</div>
            <ol class="timeline-steps">
                ${hitos.map(h => `
                <li class="timeline-step ${h.fecha ? 'is-done' : 'is-missing'}" title="${h.nombreCompleto}${h.fecha ? ': ' + h.fecha : ': sin información'}">
                    <span class="timeline-dot"></span>
                    <span class="timeline-label">${h.etiqueta}</span>
                    <span class="timeline-date">${h.fecha || '—'}</span>
                </li>`).join('')}
            </ol>
        </div>
    `;
}

function textoUbicacion(project) {
    if (project.ubicacion_tipo === 'centroide') {
        return '<p class="popup-ubicacion-nota"><em>Ubicación aproximada (centro de la comuna, sin coordenada válida en la fuente).</em></p>';
    }
    if (project.ubicacion_aproximada) {
        return '<p class="popup-ubicacion-nota"><em>Ubicación aproximada.</em></p>';
    }
    return '';
}

// Orden Norte -> Austral para mostrar el desglose por zona siempre igual,
// independiente del orden en que aparezcan en los datos.
const ORDEN_ZONAS = ['Norte', 'Centro', 'Sur', 'Austral', 'Transversal'];

// Los proyectos sin una comuna única (alcance nacional o varias comunas)
// vienen agrupados bajo "__sin_comuna__" en el JSON.
function nombreComuna(comuna) {
    return comuna === '__sin_comuna__' ? 'Varias comunas' : comuna;
}

// Resumen general (no depende de ningún filtro): cantidad de proyectos por
// zona y los proyectos geográficamente más extremos (más austral/más
// septentrional), calculados sobre todos los proyectos cargados.
function renderGeneralStats() {
    const statsPanel = document.getElementById('generalStats');
    if (!statsPanel) return;

    const todos = getAllProjects();

    if (todos.length === 0) {
        statsPanel.innerHTML = '';
        return;
    }

    const porZona = {};
    todos.forEach(p => {
        const zona = p.zona || 'S/I';
        porZona[zona] = (porZona[zona] || 0) + 1;
    });

    const zonasOrdenadas = Object.keys(porZona).sort((a, b) => {
        const posA = ORDEN_ZONAS.indexOf(a);
        const posB = ORDEN_ZONAS.indexOf(b);
        if (posA === -1 && posB === -1) return a.localeCompare(b);
        if (posA === -1) return 1;
        if (posB === -1) return -1;
        return posA - posB;
    });

    const conCoordenadas = todos.filter(p => typeof p.lat === 'number' && typeof p.lng === 'number');
    const extremo = (comparador) => (conCoordenadas.length ? conCoordenadas.reduce(comparador) : null);

    // Lat: mas negativo = mas al sur (austral); menos negativo = mas al norte.
    const masAustral = extremo((a, b) => (b.lat < a.lat ? b : a));
    const masSeptentrional = extremo((a, b) => (b.lat > a.lat ? b : a));
    // Lng: en Chile, mas negativo (hacia -76) = mas cerca de la costa;
    // menos negativo (hacia -66) = mas cerca de la cordillera/frontera.
    const masCordillerano = extremo((a, b) => (b.lng > a.lng ? b : a));
    const masCostero = extremo((a, b) => (b.lng < a.lng ? b : a));

    const conMontoValido = conCoordenadas.filter(p => typeof p.monto === 'number');
    const masCaro = conMontoValido.length ? conMontoValido.reduce((a, b) => (b.monto > a.monto ? b : a)) : null;
    const masBarato = conMontoValido.length ? conMontoValido.reduce((a, b) => (b.monto < a.monto ? b : a)) : null;

    const conBeneficiariosValido = conCoordenadas.filter(p => typeof p.participantes === 'number');
    const masBeneficiarios = conBeneficiariosValido.length
        ? conBeneficiariosValido.reduce((a, b) => (b.participantes > a.participantes ? b : a))
        : null;

    const porComuna = {};
    todos.forEach(p => {
        if (p.comuna !== '__sin_comuna__') porComuna[p.comuna] = (porComuna[p.comuna] || 0) + 1;
    });
    const [comunaTop, cantidadTop] = Object.entries(porComuna).sort((a, b) => b[1] - a[1])[0] || [null, 0];

    const zonasHtml = zonasOrdenadas.map(zona => `
        <div class="zona-row${zona === zonaActiva ? ' active' : ''}" data-zona="${zona}" title="Mostrar solo los proyectos de la zona ${zona}">
            <span class="zona-label">${zona}</span>
            <span class="zona-count">${porZona[zona]}</span>
        </div>
    `).join('');

    const extremoHtml = (titulo, proyecto, valorExtra) => {
        if (!proyecto) return '';
        return `
            <div class="stat-highlight" data-project-id="${proyecto.id}">
                <span class="stat-highlight-label">${titulo}</span>
                <strong>${proyecto.name}</strong>
                <small>${nombreComuna(proyecto.comuna)}${valorExtra ? ' · ' + valorExtra : ''}</small>
            </div>
        `;
    };

    statsPanel.innerHTML = `
        <h3>Resumen general</h3>
        <div class="general-stats-total">${todos.length} proyectos en ${Object.keys(porComuna).length} comunas</div>
        <div class="zona-breakdown">${zonasHtml}</div>
        <h4 class="stats-subtitle">Datos clave</h4>
        <div class="stats-highlights">
            ${extremoHtml('Más austral', masAustral)}
            ${extremoHtml('Más septentrional', masSeptentrional)}
            ${extremoHtml('Más cordillerano', masCordillerano)}
            ${extremoHtml('Más costero', masCostero)}
            ${extremoHtml('Más beneficiarios', masBeneficiarios, masBeneficiarios ? `${formatCantidad(masBeneficiarios.participantes)} benef.` : '')}
            ${extremoHtml('Más caro', masCaro, masCaro ? formatMonto(masCaro.monto) : '')}
            ${extremoHtml('Más barato', masBarato, masBarato ? formatMonto(masBarato.monto) : '')}
            ${comunaTop ? `<div class="stat-highlight" data-comuna="${comunaTop}"><span class="stat-highlight-label">Comuna con más proyectos</span><strong>${comunaTop}</strong><small>${cantidadTop} proyectos</small></div>` : ''}
        </div>
    `;

    // Al pinchar un dato clave: sincroniza Región/Provincia/Comuna en los
    // filtros (igual que si se hubieran elegido a mano) y muestra el punto.
    statsPanel.querySelectorAll('.stat-highlight[data-project-id]').forEach(el => {
        el.addEventListener('click', () => {
            const proyecto = todos.find(p => p.id === el.dataset.projectId);
            if (!proyecto) return;
            aplicarFiltrosPorComuna(proyecto.comuna);
            centerOnProject(proyecto);
        });
    });

    statsPanel.querySelectorAll('.zona-row[data-zona]').forEach(el => {
        el.addEventListener('click', () => filtrarPorZona(el.dataset.zona));
    });

    statsPanel.querySelectorAll('.stat-highlight[data-comuna]').forEach(el => {
        el.addEventListener('click', () => {
            if (aplicarFiltrosPorComuna(el.dataset.comuna)) {
                sidebar.classList.remove('active');
            }
        });
    });
}

//=============== PANEL DE BENEFICIARIOS (derecha) ===============//

const statsPanelEl = document.getElementById('statsPanel');
const statsPanelBody = document.getElementById('statsPanelBody');

const COLOR_HOMBRES = '#2f6fbd';
const COLOR_MUJERES = '#c2477d';

function sumaNumerica(projects, campo) {
    return projects.reduce((acc, p) => {
        const v = typeof campo === 'function' ? campo(p) : p[campo];
        return typeof v === 'number' ? acc + v : acc;
    }, 0);
}

function porcentaje(parte, total) {
    return total > 0 ? Math.round((parte / total) * 100) : 0;
}

// Se recalcula cada vez que cambia el conjunto de proyectos visibles
// (filtros de Región/Provincia/Comuna, zona, Limpiar).
// El panel cuenta solo los proyectos de la selección actual que quedan
// dentro de la pantalla: se recalcula con cada zoom / desplazamiento. Si hay
// un proyecto seleccionado (popup abierto) el panel sigue mostrando ese.
function actualizarPanelSegunVista() {
    if (proyectoSeleccionado) return;
    const bounds = limitesVisibles();
    const enPantalla = proyectosVisibles.filter(p =>
        typeof p.lat === 'number' && typeof p.lng === 'number' && bounds.contains([p.lat, p.lng])
    );
    renderPanelBeneficiarios(enPantalla, alcanceActual, null, proyectosVisibles.length);
}

// Límites del mapa descontando lo que tapa el propio panel derecho (en
// pantallas angostas el panel cubre todo, así que se usa el mapa completo).
function limitesVisibles() {
    const size = map.getSize();
    const tapado = statsPanelEl.classList.contains('active') ? statsPanelEl.offsetWidth : 0;
    const ancho = tapado > 0 && tapado < size.x ? size.x - tapado : size.x;
    return L.latLngBounds(
        map.containerPointToLatLng([0, size.y]),
        map.containerPointToLatLng([ancho, 0])
    );
}

map.on('moveend', actualizarPanelSegunVista);

// Con `volverA` el panel muestra un solo proyecto seleccionado, con un link
// para volver a la selección completa (`volverA` es su nombre). Con
// `totalSeleccion` indica cuántos de la selección quedan en pantalla.
function renderPanelBeneficiarios(projects, alcance, volverA = null, totalSeleccion = projects.length) {
    if (!statsPanelBody) return;

    const conTotal = projects.filter(p => typeof p.participantes === 'number');
    const total = sumaNumerica(conTotal, 'participantes');

    const conSexo = projects.filter(p => typeof p.beneficiarios_hombres === 'number' || typeof p.beneficiarios_mujeres === 'number');
    const hombres = sumaNumerica(conSexo, 'beneficiarios_hombres');
    const mujeres = sumaNumerica(conSexo, 'beneficiarios_mujeres');
    const totalSexo = hombres + mujeres;
    const pctH = porcentaje(hombres, totalSexo);
    const pctM = totalSexo > 0 ? 100 - pctH : 0;

    const porLinea = Object.keys(LINEAS_TRABAJO).map(linea => {
        const delaLinea = projects.filter(p => p.linea_trabajo === linea);
        return {
            linea,
            valor: sumaNumerica(delaLinea, 'participantes'),
            proyectos: delaLinea.length,
            informados: delaLinea.filter(p => typeof p.participantes === 'number').length,
        };
    });
    const maxLinea = Math.max(1, ...porLinea.map(l => l.valor));

    statsPanelBody.innerHTML = `
        ${volverA ? `
        <div class="stats-scope stats-scope-proyecto">
            <span class="stats-scope-kicker">Proyecto seleccionado</span>
            <span class="stats-scope-label">${alcance}</span>
            <button type="button" class="stats-back" id="statsBack">← Volver a ${volverA}</button>
        </div>` : `
        <div class="stats-scope">
            <span class="stats-scope-label">${alcance}</span>
            <span class="stats-scope-count">${projects.length === totalSeleccion
                ? `${formatNumber(projects.length)} proyectos`
                : `${formatNumber(projects.length)} de ${formatNumber(totalSeleccion)} en pantalla`}</span>
        </div>`}

        <section class="stats-block">
            <div class="stats-hero">${conTotal.length ? formatNumber(Math.round(total)) : 'S/I'}</div>
            <div class="stats-hero-label">beneficiarios directos</div>
            ${volverA ? '' : `<div class="stats-note">Informados en ${formatNumber(conTotal.length)} de ${formatNumber(projects.length)} proyectos</div>`}
        </section>

        <section class="stats-block">
            <h3 class="stats-block-title">Por sexo</h3>
            ${totalSexo > 0 ? `
            <div class="sexo-tiles">
                <div class="sexo-tile">
                    <span class="sexo-icon" style="background:${COLOR_HOMBRES};" aria-hidden="true">♂</span>
                    <div>
                        <div class="sexo-value">${formatNumber(hombres)}</div>
                        <div class="sexo-label">Hombres · ${pctH}%</div>
                    </div>
                </div>
                <div class="sexo-tile">
                    <span class="sexo-icon" style="background:${COLOR_MUJERES};" aria-hidden="true">♀</span>
                    <div>
                        <div class="sexo-value">${formatNumber(mujeres)}</div>
                        <div class="sexo-label">Mujeres · ${pctM}%</div>
                    </div>
                </div>
            </div>
            <div class="split-bar" role="img" aria-label="Hombres ${pctH}%, mujeres ${pctM}%">
                ${hombres > 0 ? `<span class="split-seg" style="flex:${hombres}; background:${COLOR_HOMBRES};" title="Hombres: ${formatNumber(hombres)} (${pctH}%)"></span>` : ''}
                ${mujeres > 0 ? `<span class="split-seg" style="flex:${mujeres}; background:${COLOR_MUJERES};" title="Mujeres: ${formatNumber(mujeres)} (${pctM}%)"></span>` : ''}
            </div>
            ${volverA ? '' : `<div class="stats-note">Desglose informado en ${formatNumber(conSexo.length)} de ${formatNumber(projects.length)} proyectos</div>`}
            ` : '<div class="stats-note">Sin desglose por sexo en esta selección.</div>'}
        </section>

        ${volverA ? '' : `
        <section class="stats-block">
            <h3 class="stats-block-title">Por línea de trabajo</h3>
            ${porLinea.map(l => `
            <div class="linea-row" title="${l.linea}: ${l.informados ? formatNumber(Math.round(l.valor)) + ' beneficiarios' : 'sin beneficiarios informados'} · ${l.proyectos} proyectos">
                <div class="linea-row-head">
                    <span class="linea-swatch" style="background:${LINEAS_TRABAJO[l.linea].fill};"></span>
                    <span class="linea-name">${l.linea} <span class="linea-count">· ${formatNumber(l.proyectos)} ${l.proyectos === 1 ? 'proyecto' : 'proyectos'}</span></span>
                    <span class="linea-value">${l.informados ? formatNumber(Math.round(l.valor)) : (l.proyectos ? 'S/I' : '—')}</span>
                </div>
                <div class="linea-track">
                    ${l.valor > 0 ? `<span class="linea-bar" style="width:${(l.valor / maxLinea) * 100}%; background:${LINEAS_TRABAJO[l.linea].fill};"></span>` : ''}
                </div>
            </div>`).join('')}
        </section>`}
    `;

    // "Volver" cierra el popup; su evento popupclose restaura el panel.
    const back = document.getElementById('statsBack');
    if (back) back.addEventListener('click', () => map.closePopup());
}

function abrirPanelBeneficiarios() {
    statsPanelEl.classList.add('active');
    document.body.classList.add('stats-open');
    actualizarPanelSegunVista();
}

function cerrarPanelBeneficiarios() {
    statsPanelEl.classList.remove('active');
    document.body.classList.remove('stats-open');
}

document.getElementById('closeStatsPanel').addEventListener('click', cerrarPanelBeneficiarios);

// Botón para abrir/cerrar el panel, debajo del zoom (arriba a la derecha).
const statsToggle = L.control({ position: 'topright' });
statsToggle.onAdd = function() {
    const btn = L.DomUtil.create('button', 'stats-toggle');
    btn.type = 'button';
    btn.title = 'Mostrar/Ocultar beneficiarios';
    btn.innerHTML = '📊';
    L.DomEvent.disableClickPropagation(btn);
    L.DomEvent.on(btn, 'click', () => {
        statsPanelEl.classList.contains('active') ? cerrarPanelBeneficiarios() : abrirPanelBeneficiarios();
    });
    return btn;
};
statsToggle.addTo(map);

// En pantallas grandes el panel parte abierto.
if (window.innerWidth >= 1100) abrirPanelBeneficiarios();

//=============== CARRUSEL DE FOTOS ===============//

const photoModal = document.getElementById('photoModal');
const photoModalImg = document.getElementById('photoModalImg');
const photoModalCounter = document.getElementById('photoModalCounter');

let currentPhotoSet = [];
let currentPhotoIndex = 0;

function renderCarouselPhoto() {
    photoModalImg.src = currentPhotoSet[currentPhotoIndex];
    photoModalCounter.textContent = `${currentPhotoIndex + 1} / ${currentPhotoSet.length}`;
}

window.openPhotoCarousel = function(projectId, startIndex = 0) {
    const photos = PROJECT_PHOTOS[projectId];
    if (!photos || photos.length === 0) return;

    currentPhotoSet = photos;
    currentPhotoIndex = startIndex;
    renderCarouselPhoto();
    photoModal.classList.add('active');
};

function closePhotoCarousel() {
    photoModal.classList.remove('active');
}

function showNextPhoto() {
    currentPhotoIndex = (currentPhotoIndex + 1) % currentPhotoSet.length;
    renderCarouselPhoto();
}

function showPrevPhoto() {
    currentPhotoIndex = (currentPhotoIndex - 1 + currentPhotoSet.length) % currentPhotoSet.length;
    renderCarouselPhoto();
}

document.getElementById('closePhotoModal').addEventListener('click', closePhotoCarousel);
document.getElementById('photoNext').addEventListener('click', showNextPhoto);
document.getElementById('photoPrev').addEventListener('click', showPrevPhoto);

// Cerrar al hacer click fuera de la imagen (en el fondo oscuro)
photoModal.addEventListener('click', (e) => {
    if (e.target === photoModal) closePhotoCarousel();
});

//=============== CARGAR DATOS INICIALES ===============//

loadData();

//=============== LEYENDA ===============//

const legend = L.control({ position: 'bottomright' });

legend.onAdd = function(map) {
    var div = L.DomUtil.create('div', 'legend');
    div.innerHTML = `
        <h4>Línea de trabajo</h4>
        ${Object.entries(LINEAS_TRABAJO).map(([linea, color]) => `
        <div class="legend-item">
            <span class="legend-dot" style="background:${color.fill}; border-color:${color.borde};"></span>
            ${linea}
        </div>`).join('')}
        <p style="font-size: 11px; color: #7f8c8d; margin: 10px 0 0 0;">
            Fuente de datos: Fundación Huella Local
        </p>
        <p style="font-size: 10px; color: #95a5a6; margin: 4px 0 0 0;">
            Construido por <a href="https://dannlebeau.github.io/ownroute.github.io/" target="_blank" rel="noopener" style="color:#3498db;">Dann LeBeau</a> © ${new Date().getFullYear()}
        </p>
    `;
    return div;
};

legend.addTo(map);
