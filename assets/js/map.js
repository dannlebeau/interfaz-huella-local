//=============== INICIALIZACIÓN DEL MAPA ===============//

// Centrar el mapa en Chile (-35.6751°, -71.5430°)
var map = L.map('map').setView([-35.6751, -71.5430], 4);

// Capas base del mapa
var openStreetMapLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap'
});

var cartoDBPositronLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
    attribution: '© CartoDB',
    maxZoom: 19
});

var esriWorldImageryLayer = L.tileLayer('https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles © Esri',
    maxZoom: 18
}).addTo(map);

// Control de capas
var baseMaps = {
    "OpenStreetMap": openStreetMapLayer,
    "CartoDB Positron": cartoDBPositronLayer,
    "ESRI Imagery": esriWorldImageryLayer,
};

var layerControl = L.control.layers(baseMaps, null, { position: 'topright', collapsed: true }).addTo(map);

// Agregar controles de zoom personalizados debajo del control de capas
var zoomControl = L.control.zoom({ position: 'topright' });
map.removeControl(map.zoomControl); // Remover el zoom por defecto
zoomControl.addTo(map);

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
let limitesLayer = null; // Capa de límites
let projectsByCommune = {}; // Almacenar proyectos por comuna

// Cargar datos desde Comunas.geojson
async function loadData() {
    try {
        // Cargar solo el GeoJSON de Comunas (contiene toda la jerarquía)
        const comunasGeoJSON = await fetch('./data/Comunas.geojson');
        window.comunasGeoJSON = await comunasGeoJSON.json();
        
        // Reproject desde Web Mercator a WGS84
        reprojectGeoJSON(window.comunasGeoJSON);
        
        // Extraer datos únicos del GeoJSON
        extractDataFromGeoJSON();
        
        loadRegions();
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

// Extraer regiones, provincias y comunas del Comunas.geojson
function extractDataFromGeoJSON() {
    // Estructura de datos para la jerarquía
    regionesData = [];
    provinciasData = {};
    comunasData = {};
    
    const regionesSet = new Set();
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
    
    // Convertir Sets a Arrays y ordenar
    regionesData = Array.from(regionesSet).sort();
    
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
    
    // Mostrar proyectos si seleccionó comuna
    if (selectedCommune) {
        displayProjectsForCommune(selectedCommune);
    } else {
        document.getElementById('projectsList').innerHTML = '';
        clearProjectMarkers();
    }
    
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
    
    // Limpiar proyectos mostrados
    document.getElementById('projectsList').innerHTML = '';
    clearProjectMarkers();
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

function displayProjectsForCommune(commune) {
    const projectsList = document.getElementById('projectsList');
    projectsList.innerHTML = '';
    
    clearProjectMarkers();
    
    const projects = projectsByCommune[commune] || [];
    
    if (projects.length === 0) {
        projectsList.innerHTML = '<div style="padding: 15px; color: #7f8c8d;">No hay proyectos en esta comuna</div>';
        return;
    }
    
    projects.forEach(project => {
        // Agregar a lista en sidebar
        const projectItem = document.createElement('div');
        projectItem.className = 'project-item';
        projectItem.innerHTML = `
            <strong>${project.name}</strong>
            <small>Monto: $${formatNumber(project.monto)}</small>
            <small>Participantes: ${project.participantes}</small>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${project.avance}%"></div>
            </div>
            <small style="color: #3498db;">${project.avance}% completado</small>
        `;
        
        projectItem.addEventListener('click', () => {
            centerOnProject(project);
        });
        
        projectsList.appendChild(projectItem);
        
        // Agregar marker en el mapa
        addProjectMarker(project);
    });
}

function addProjectMarker(project) {
    const marker = L.circleMarker([project.lat, project.lng], {
        radius: 8,
        fillColor: '#3498db',
        color: '#2980b9',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
    }).addTo(map);
    
    // Crear popup con información detallada
    const popupContent = `
        <div class="popup-content">
            <h4>${project.name}</h4>
            <p><strong>Monto:</strong> $${formatNumber(project.monto)}</p>
            <p><strong>Participantes:</strong> ${project.participantes}</p>
            <p><strong>Avance:</strong> ${project.avance}%</p>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${project.avance}%"></div>
            </div>
        </div>
    `;
    
    marker.bindPopup(popupContent);
    marker.on('click', function() {
        this.openPopup();
    });
    
    projectMarkers[project.id] = marker;
}

function centerOnProject(project) {
    map.setView([project.lat, project.lng], 14);
    
    // Abrir popup del marcador
    if (projectMarkers[project.id]) {
        projectMarkers[project.id].openPopup();
    }
    
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

//=============== MESAS TERRITORIALES ===============//

let mesasLayer = null;
let mesasData = {};
let mesasProyectosData = {};

const mesaPanel = document.getElementById('mesaPanel');
const closeMesaPanelBtn = document.getElementById('closeMesaPanel');

closeMesaPanelBtn.addEventListener('click', () => {
    mesaPanel.classList.remove('active');
});

async function loadMesasData() {
    try {
        const [mesasRes, proyectosRes] = await Promise.all([
            fetch('./data/mesas_territoriales/mesas.geojson'),
            fetch('./data/mesas_territoriales/proyectos.json')
        ]);
        const mesasGeoJSON = await mesasRes.json();
        mesasProyectosData = await proyectosRes.json();

        mesasGeoJSON.features.forEach(f => {
            mesasData[f.properties.id] = f.properties;
        });

        displayMesasLayer(mesasGeoJSON);
        console.log('✅ Mesas territoriales cargadas:', mesasGeoJSON.features.length);
    } catch (error) {
        console.error('Error cargando mesas territoriales:', error);
    }
}

function displayMesasLayer(geojson) {
    mesasLayer = L.geoJSON(geojson, {
        pointToLayer: function(feature, latlng) {
            return L.circleMarker(latlng, {
                radius: 13,
                fillColor: '#27ae60',
                color: '#1e8449',
                weight: 2.5,
                opacity: 1,
                fillOpacity: 0.9
            });
        },
        onEachFeature: function(feature, layer) {
            const p = feature.properties;
            const actores = Array.isArray(p.actores) ? p.actores.join(', ') : p.actores;
            const popupContent = `
                <div class="popup-content">
                    <h4>${p.nombre}</h4>
                    <p><strong>Municipalidad:</strong> ${p.municipalidad}</p>
                    <p><strong>Actores:</strong> ${actores}</p>
                    <p><strong>Capital levantado:</strong> $${formatNumber(p.capital_levantado)}</p>
                    <p><strong>Beneficiarios:</strong> ${p.beneficiarios}</p>
                    <a href="#" class="popup-project-link"
                       onclick="openMesaProjects('${p.id}'); return false;">
                        Proyectos en la mesa
                    </a>
                </div>
            `;
            layer.bindPopup(popupContent, { maxWidth: 300 });
        }
    }).addTo(map);

    layerControl.addOverlay(mesasLayer, 'Mesas Territoriales');
}

window.openMesaProjects = function(mesaId) {
    const mesa = mesasData[mesaId];
    const proyectos = mesasProyectosData[mesaId] || [];

    document.getElementById('mesaPanelTitle').textContent = mesa.nombre;

    const content = document.getElementById('mesaPanelContent');

    if (proyectos.length === 0) {
        content.innerHTML = '<p style="padding: 20px; color: #7f8c8d;">No hay proyectos registrados para esta mesa.</p>';
    } else {
        content.innerHTML = proyectos.map(p => `
            <div class="mesa-project-card">
                <div class="mesa-project-header">
                    <span class="mesa-project-type">${p.tipo}</span>
                    <span class="mesa-project-status status-${p.estado_key}">${p.estado}</span>
                </div>
                <h4>${p.nombre}</h4>
                <p class="mesa-project-desc">${p.descripcion}</p>
                <div class="mesa-project-stats">
                    <div class="stat">
                        <span class="stat-label">Monto</span>
                        <span class="stat-value">$${formatNumber(p.monto)}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Beneficiarios</span>
                        <span class="stat-value">${p.beneficiarios}</span>
                    </div>
                </div>
                <div class="mesa-project-dates">
                    ${p.fecha_inicio} &rarr; ${p.fecha_termino}
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${p.avance}%"></div>
                </div>
                <span class="progress-label">${p.avance}% completado</span>
            </div>
        `).join('');
    }

    mesaPanel.classList.add('active');
};

//=============== CARGAR DATOS INICIALES ===============//

loadData();
loadMesasData();

//=============== LEYENDA ===============//

const legend = L.control({ position: 'bottomright' });

legend.onAdd = function(map) {
    var div = L.DomUtil.create('div', 'legend');
    div.innerHTML = `
        <h4>Referencia</h4>
        <div class="legend-item">
            <span class="legend-dot" style="background:#27ae60; border-color:#1e8449;"></span>
            Mesa Territorial
        </div>
        <div class="legend-item">
            <span class="legend-dot" style="background:#3498db; border-color:#2980b9;"></span>
            Proyecto
        </div>
        <p style="font-size: 11px; color: #7f8c8d; margin: 10px 0 0 0;">
            Huella Local — Proyectos comunitarios
        </p>
    `;
    return div;
};

legend.addTo(map);
