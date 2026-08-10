//=============== MAPEO PARTICIPATIVO: MEJILLONES 2050 ===============//
// Version digital de la actividad "La bahia que no se vende": cada mesa
// marca en el mapa zonas "no negociables" (rojo) y zonas donde la industria
// portuaria/energetica les parece aceptable (azul) -- como puntos, lineas o
// poligonos, con una nota breve cada uno -- el equivalente a los alfileres +
// hilos + post-its del taller fisico. No hay backend: cada mesa exporta su
// archivo y quien facilita importa todos al cierre para ver el mapa
// conjunto. El acceso por mesa puede ser manual (selector) o via QR
// (?mesa=Mesa%201 en la URL, generado en mesas-qr.html).

const STORAGE_KEY = 'mejillones2050_puntos';

// Bahia de Mejillones, con zoom suficiente para ver el pueblo y el borde
// costero donde estan los terminales industriales.
const MEJILLONES_CENTER = [-23.1006, -70.4485];

var map = L.map('map').setView(MEJILLONES_CENTER, 13);

L.tileLayer('https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles © Esri',
    maxZoom: 19,
    maxNativeZoom: 17
}).addTo(map);

var zoomControl = L.control.zoom({ position: 'topright' });
map.removeControl(map.zoomControl);
zoomControl.addTo(map);

const TIPOS = {
    no_negociable: { color: '#e74c3c', fill: '#e74c3c', label: 'No negociable' },
    industria_ok: { color: '#0e6655', fill: '#17a2b8', label: 'Industria OK' }
};

const FORMA_HINTS = {
    punto: 'Haz click en el mapa para marcar un punto con el modo activo.',
    linea: 'Presiona "Dibujar línea", haz click para ir agregando el trazo y doble click para terminar.',
    poligono: 'Presiona "Dibujar polígono", haz click para ir marcando los vértices y cierra la figura para terminar.'
};

let puntos = [];
let markers = {};
let modoActual = 'no_negociable';
let formaActual = 'punto';
let pendingLatLng = null; // punto pendiente de nota (click directo en el mapa)
let pendingGeometria = null; // {forma, coords} pendiente de nota (linea/poligono via Leaflet.Draw)
let drawHandler = null;

//=============== PANEL ===============//

const panel = document.getElementById('mpPanel');
const toggleBtn = document.getElementById('togglePanel');
const closeBtn = document.getElementById('closePanel');

toggleBtn.addEventListener('click', () => panel.classList.add('active'));
closeBtn.addEventListener('click', () => panel.classList.remove('active'));
panel.addEventListener('click', (e) => e.stopPropagation());

//=============== MODO (tipo de zona) Y FORMA (punto/linea/poligono) ===============//

const modeButtons = {
    no_negociable: document.getElementById('modeNoNegociable'),
    industria_ok: document.getElementById('modeIndustriaOk')
};

function setModo(tipo) {
    modoActual = tipo;
    Object.entries(modeButtons).forEach(([key, btn]) => {
        btn.classList.toggle('active', key === tipo);
    });
}

modeButtons.no_negociable.addEventListener('click', () => setModo('no_negociable'));
modeButtons.industria_ok.addEventListener('click', () => setModo('industria_ok'));

const formaButtons = {
    punto: document.getElementById('formaPunto'),
    linea: document.getElementById('formaLinea'),
    poligono: document.getElementById('formaPoligono')
};
const formaHint = document.getElementById('formaHint');
const drawShapeBtn = document.getElementById('drawShapeBtn');
const DRAW_LABELS = { linea: '✏️ Dibujar línea', poligono: '✏️ Dibujar polígono' };

function setForma(forma) {
    cancelarDibujo();
    formaActual = forma;
    Object.entries(formaButtons).forEach(([key, btn]) => {
        btn.classList.toggle('active', key === forma);
    });
    formaHint.textContent = FORMA_HINTS[forma];

    if (forma === 'punto') {
        drawShapeBtn.style.display = 'none';
    } else {
        drawShapeBtn.style.display = 'block';
        drawShapeBtn.textContent = DRAW_LABELS[forma];
    }
}

formaButtons.punto.addEventListener('click', () => setForma('punto'));
formaButtons.linea.addEventListener('click', () => setForma('linea'));
formaButtons.poligono.addEventListener('click', () => setForma('poligono'));

function cancelarDibujo() {
    if (drawHandler) {
        drawHandler.disable();
        drawHandler = null;
    }
    drawShapeBtn.classList.remove('active');
    if (formaActual !== 'punto') drawShapeBtn.textContent = DRAW_LABELS[formaActual];
}

drawShapeBtn.addEventListener('click', () => {
    if (drawHandler) {
        cancelarDibujo();
        return;
    }

    const mesa = document.getElementById('mesaSelect').value;
    if (!mesa) {
        alert('Selecciona primero el número de mesa.');
        return;
    }

    const estilo = TIPOS[modoActual];
    const shapeOptions = { color: estilo.color, fillColor: estilo.fill, weight: 3, fillOpacity: 0.3 };

    if (formaActual === 'linea') {
        drawHandler = new L.Draw.Polyline(map, { shapeOptions, showLength: false });
    } else if (formaActual === 'poligono') {
        drawHandler = new L.Draw.Polygon(map, { shapeOptions, allowIntersection: false, showArea: false });
    }
    drawHandler.enable();
    drawShapeBtn.classList.add('active');
    drawShapeBtn.textContent = '✕ Cancelar dibujo';
});

map.on(L.Draw.Event.CREATED, (e) => {
    drawHandler = null;
    drawShapeBtn.classList.remove('active');
    drawShapeBtn.textContent = DRAW_LABELS[formaActual];

    const forma = e.layerType === 'polyline' ? 'linea' : 'poligono';
    const coords = (forma === 'linea' ? e.layer.getLatLngs() : e.layer.getLatLngs()[0])
        .map(ll => ({ lat: ll.lat, lng: ll.lng }));

    pendingGeometria = { forma, coords };
    abrirModalNota();
});

//=============== PERSISTENCIA (localStorage) ===============//

function guardarLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(puntos));
}

function cargarLocal() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

//=============== CENTROIDE (para listar/centrar lineas y poligonos) ===============//

function centroide(coords) {
    const lat = coords.reduce((sum, c) => sum + c.lat, 0) / coords.length;
    const lng = coords.reduce((sum, c) => sum + c.lng, 0) / coords.length;
    return { lat, lng };
}

//=============== ELEMENTOS EN EL MAPA Y LISTA ===============//

const FORMA_ICONO = { punto: '📍', linea: '📏', poligono: '⬛' };

function agregarElemento(dato) {
    const estilo = TIPOS[dato.tipo] || TIPOS.no_negociable;
    const forma = dato.forma || 'punto';
    let layer;

    if (forma === 'linea') {
        layer = L.polyline(dato.coords.map(c => [c.lat, c.lng]), {
            color: estilo.color,
            weight: 4,
            opacity: 0.9
        });
    } else if (forma === 'poligono') {
        layer = L.polygon(dato.coords.map(c => [c.lat, c.lng]), {
            color: estilo.color,
            fillColor: estilo.fill,
            weight: 3,
            fillOpacity: 0.35
        });
    } else {
        layer = L.circleMarker([dato.lat, dato.lng], {
            radius: 9,
            fillColor: estilo.fill,
            color: estilo.color,
            weight: 2,
            opacity: 1,
            fillOpacity: 0.85
        });
    }

    layer.addTo(map);
    layer.bindTooltip(dato.mesa, { permanent: false, direction: 'top' });
    layer.bindPopup(`
        <div class="popup-content">
            <div class="mesa-project-header" style="margin-bottom:6px;">
                <span class="mesa-project-type">${FORMA_ICONO[dato.forma || 'punto']} ${dato.mesa}</span>
                <span class="mesa-project-status" style="background:${estilo.fill}22; color:${estilo.color};">${estilo.label}</span>
            </div>
            <p>${dato.nota || '<em>Sin nota</em>'}</p>
        </div>
    `);

    markers[dato.id] = layer;
}

function renderLista() {
    const lista = document.getElementById('mpList');
    lista.innerHTML = '';

    if (puntos.length === 0) {
        lista.innerHTML = '<div style="padding: 15px; color: #7f8c8d;">Todavía no hay nada marcado.</div>';
        return;
    }

    const ordenados = [...puntos].sort((a, b) => b.timestamp - a.timestamp);

    ordenados.forEach(dato => {
        const estilo = TIPOS[dato.tipo] || TIPOS.no_negociable;
        const item = document.createElement('div');
        item.className = `mp-point-item tipo-${dato.tipo}`;
        item.innerHTML = `
            <div class="mp-point-main">
                <span class="mp-point-mesa">${FORMA_ICONO[dato.forma || 'punto']} ${dato.mesa} · ${estilo.label}</span>
                <span class="mp-point-nota">${dato.nota || 'Sin nota'}</span>
            </div>
            <button class="mp-point-delete" title="Eliminar">🗑</button>
        `;

        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('mp-point-delete')) return;
            map.setView([dato.lat, dato.lng], 16);
            if (markers[dato.id]) markers[dato.id].openPopup();
        });

        item.querySelector('.mp-point-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            eliminarPunto(dato.id);
        });

        lista.appendChild(item);
    });
}

function renderStats() {
    const stats = document.getElementById('mpStats');
    const noNegociable = puntos.filter(p => p.tipo === 'no_negociable').length;
    const industriaOk = puntos.filter(p => p.tipo === 'industria_ok').length;
    const mesas = new Set(puntos.map(p => p.mesa)).size;

    stats.innerHTML = `
        <h3>Resumen del taller</h3>
        <div class="general-stats-total">${puntos.length} elemento${puntos.length === 1 ? '' : 's'} marcado${puntos.length === 1 ? '' : 's'} · ${mesas} mesa${mesas === 1 ? '' : 's'}</div>
        <div class="zona-row"><span class="zona-label">🔴 No negociable</span><span class="zona-count">${noNegociable}</span></div>
        <div class="zona-row"><span class="zona-label">🔵 Industria OK</span><span class="zona-count">${industriaOk}</span></div>
    `;
}

function renderTodo() {
    renderLista();
    renderStats();
}

//=============== AGREGAR / ELIMINAR ===============//

function eliminarPunto(id) {
    if (markers[id]) {
        map.removeLayer(markers[id]);
        delete markers[id];
    }
    puntos = puntos.filter(p => p.id !== id);
    guardarLocal();
    renderTodo();
}

// Modal para escribir la nota antes de guardar (punto, linea o poligono)
const noteModal = document.getElementById('noteModal');
const noteModalMeta = document.getElementById('noteModalMeta');
const noteText = document.getElementById('noteText');

function abrirModalNota() {
    const mesa = document.getElementById('mesaSelect').value;
    const estilo = TIPOS[modoActual];
    noteModalMeta.textContent = `${mesa} · ${estilo.label}`;
    noteText.value = '';
    noteModal.classList.add('active');
    noteText.focus();
}

map.on('click', (e) => {
    if (formaActual !== 'punto') return; // linea/poligono se disparan con el boton "Dibujar"

    const mesa = document.getElementById('mesaSelect').value;
    if (!mesa) {
        alert('Selecciona primero el número de mesa.');
        return;
    }

    pendingLatLng = e.latlng;
    abrirModalNota();
});

document.getElementById('noteCancel').addEventListener('click', () => {
    noteModal.classList.remove('active');
    pendingLatLng = null;
    pendingGeometria = null;
});

document.getElementById('noteSave').addEventListener('click', () => {
    if (!pendingLatLng && !pendingGeometria) return;

    const mesa = document.getElementById('mesaSelect').value;
    let dato;

    if (pendingGeometria) {
        const centro = centroide(pendingGeometria.coords);
        dato = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            mesa,
            tipo: modoActual,
            forma: pendingGeometria.forma,
            coords: pendingGeometria.coords,
            nota: noteText.value.trim(),
            lat: centro.lat,
            lng: centro.lng,
            timestamp: Date.now()
        };
    } else {
        dato = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            mesa,
            tipo: modoActual,
            forma: 'punto',
            nota: noteText.value.trim(),
            lat: pendingLatLng.lat,
            lng: pendingLatLng.lng,
            timestamp: Date.now()
        };
    }

    puntos.push(dato);
    agregarElemento(dato);
    guardarLocal();
    renderTodo();

    noteModal.classList.remove('active');
    pendingLatLng = null;
    pendingGeometria = null;
});

//=============== EXPORTAR / IMPORTAR / LIMPIAR ===============//

document.getElementById('exportBtn').addEventListener('click', () => {
    const mesaActual = document.getElementById('mesaSelect').value;
    const aExportar = mesaActual ? puntos.filter(p => p.mesa === mesaActual) : puntos;

    if (aExportar.length === 0) {
        alert('No hay nada para exportar (selecciona una mesa con elementos marcados, o marca alguno primero).');
        return;
    }

    const blob = new Blob([JSON.stringify(aExportar, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const nombreMesa = (mesaActual || 'todas').replace(/\s+/g, '-').toLowerCase();
    a.href = url;
    a.download = `mejillones-2050-${nombreMesa}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

document.getElementById('importInput').addEventListener('change', async (e) => {
    const archivos = [...e.target.files];
    if (archivos.length === 0) return;

    for (const archivo of archivos) {
        try {
            const texto = await archivo.text();
            const datos = JSON.parse(texto);
            const nuevos = Array.isArray(datos) ? datos : [datos];

            nuevos.forEach(dato => {
                // Evitar duplicados si el mismo archivo se importa dos veces
                if (puntos.some(p => p.id === dato.id)) return;
                puntos.push(dato);
                agregarElemento(dato);
            });
        } catch (err) {
            console.error('No se pudo importar', archivo.name, err);
            alert(`No se pudo leer "${archivo.name}": ¿es un JSON exportado desde esta misma herramienta?`);
        }
    }

    guardarLocal();
    renderTodo();
    e.target.value = '';
});

document.getElementById('clearBtn').addEventListener('click', () => {
    if (puntos.length === 0) return;
    if (!confirm('¿Borrar todo lo marcado en este dispositivo? Esta acción no se puede deshacer.')) return;

    Object.values(markers).forEach(marker => map.removeLayer(marker));
    markers = {};
    puntos = [];
    guardarLocal();
    renderTodo();
});

//=============== ACCESO POR MESA VIA QR (?mesa=Mesa%201) ===============//

function aplicarMesaDesdeQR() {
    const params = new URLSearchParams(window.location.search);
    const mesaQR = params.get('mesa');
    if (!mesaQR) return;

    const select = document.getElementById('mesaSelect');
    if (![...select.options].some(o => o.value === mesaQR)) {
        const opt = document.createElement('option');
        opt.value = mesaQR;
        opt.textContent = mesaQR;
        select.appendChild(opt);
    }
    select.value = mesaQR;
    select.disabled = true;

    const banner = document.getElementById('mesaLockedBanner');
    banner.innerHTML = `
        Ingresaste como <strong>${mesaQR}</strong>.
        <a href="#" id="cambiarMesaLink">¿No es tu mesa? Cambiar</a>
    `;
    banner.classList.add('active');

    document.getElementById('cambiarMesaLink').addEventListener('click', (e) => {
        e.preventDefault();
        select.disabled = false;
        banner.classList.remove('active');
    });

    panel.classList.add('active');
}

//=============== CARGA INICIAL ===============//

puntos = cargarLocal();
puntos.forEach(agregarElemento);
renderTodo();
aplicarMesaDesdeQR();

//=============== LEYENDA ===============//

const legend = L.control({ position: 'bottomright' });

legend.onAdd = function() {
    const div = L.DomUtil.create('div', 'legend');
    div.innerHTML = `
        <h4>Referencia</h4>
        <div class="legend-item">
            <span class="legend-dot" style="background:#e74c3c; border-color:#922b21;"></span>
            No negociable
        </div>
        <div class="legend-item">
            <span class="legend-dot" style="background:#17a2b8; border-color:#0e6655;"></span>
            Industria OK
        </div>
        <p style="font-size: 11px; color: #7f8c8d; margin: 10px 0 0 0;">
            Plan Mejillones 2050 — Mapeo participativo
        </p>
    `;
    return div;
};

legend.addTo(map);
