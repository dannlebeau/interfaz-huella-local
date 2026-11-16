// Revisión de ubicaciones: se sube el Excel de proyectos, se pega la URL de
// Google Maps de cada proyecto y se descarga el mismo Excel con la columna
// URL completada. Todo ocurre en el navegador (sin servidor ni base de datos).
'use strict';

const HOJA = 'PROYECTOS';
const COL_URL = 'URL';
const COLUMNAS_REQUERIDAS = ['nombre', 'comuna'];

// Rango aproximado de Chile continental + islas cercanas
const LAT_CHILE = [-56.5, -17.0];
const LNG_CHILE = [-76.0, -66.0];

const COLORES = {
    confirmado: '#1f9d55',
    conUrl: '#2b6cb0',
    porConfirmar: '#dd6b20',
};

const estado = {
    workbook: null,
    hoja: null,
    nombreArchivo: '',
    columnas: {},      // encabezado -> número de columna
    encabezados: [],   // [{ nombre, col }] en el orden del Excel
    colUrl: null,
    proyectos: [],
    seleccionado: null,
    cambios: 0,        // URL modificadas sin descargar
};

// ---------- Utilidades ----------

const $ = id => document.getElementById(id);

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
}

function normaliza(s) {
    return String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Valor de una celda de ExcelJS como texto legible (fórmulas, enlaces,
// texto enriquecido y fechas incluidos).
function textoCelda(v) {
    if (v === null || v === undefined) return '';
    if (Object.prototype.toString.call(v) === '[object Date]') {
        return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    if (typeof v === 'object') {
        if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
        if ('result' in v) return textoCelda(v.result);
        if ('hyperlink' in v) return String(v.hyperlink);
        if ('text' in v) return textoCelda(v.text);
        if ('error' in v) return '';
        return '';
    }
    return String(v).trim();
}

function numero(v) {
    const t = textoCelda(v);
    if (!t) return null;
    let s = t.replace(/°/g, '').replace(/\s*m$/i, '').replace(/\s/g, '');
    if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, ''); // miles: 59.149.878
    s = s.replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

function enChile(lat, lng) {
    return lat >= LAT_CHILE[0] && lat <= LAT_CHILE[1] && lng >= LNG_CHILE[0] && lng <= LNG_CHILE[1];
}

// UTM (hemisferio sur, WGS84) -> [lat, lng]. Fórmulas de Snyder.
function utmALatLng(este, norte, zona) {
    const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
    const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    const x = este - 500000, y = norte - 10000000;
    const mu = (y / k0) / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
        + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
        + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
        + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
    const sen = Math.sin(p1), cos = Math.cos(p1), tan = Math.tan(p1);
    const N1 = a / Math.sqrt(1 - e2 * sen ** 2);
    const T1 = tan ** 2, C1 = ep2 * cos ** 2;
    const R1 = a * (1 - e2) / Math.pow(1 - e2 * sen ** 2, 1.5);
    const D = x / (N1 * k0);
    const lat = p1 - (N1 * tan / R1) * (D ** 2 / 2
        - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
        + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720);
    const lng0 = ((zona - 1) * 6 - 180 + 3) * Math.PI / 180;
    const lng = lng0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6
        + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120) / cos;
    return [lat * 180 / Math.PI, lng * 180 / Math.PI];
}

function utmValida(este, norte, zona) {
    if (este === null || norte === null || !zona) return null;
    if (este < 100000 || este > 900000 || norte < 1000000 || norte > 10000000) return null;
    const [lat, lng] = utmALatLng(este, norte, zona);
    return enChile(lat, lng) ? [lat, lng] : null;
}

// Misma prioridad que scripts/transformar_proyectos.py (sin validar contra el
// polígono de la comuna): UTM con su huso, Coord. X/Y decimales o en UTM.
function coordenadas(fila) {
    const huso = normaliza(fila['UTM Huso']).toUpperCase();
    const zona = huso === '18S' ? 18 : huso === '19S' ? 19 : null;
    const este = numero(fila['UTM Este']), norte = numero(fila['UTM Norte']);
    let p = utmValida(este, norte, zona);
    if (p) return p;
    const x = numero(fila['Coord. X']), y = numero(fila['Coord. Y']);
    if (x !== null && y !== null) {
        if (enChile(y, x)) return [y, x];
        if (enChile(x, y)) return [x, y];
        for (const z of [zona, 19, 18]) {
            p = utmValida(x, y, z);
            if (p) return p;
        }
    }
    return null;
}

function esUrlGoogleMaps(url) {
    return /^https:\/\/((www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(url);
}

function aviso(texto, tipo = 'info') {
    const el = $('aviso');
    el.textContent = texto;
    el.dataset.tipo = tipo;
    el.hidden = false;
    clearTimeout(aviso.t);
    aviso.t = setTimeout(() => { el.hidden = true; }, 4000);
}

// ---------- Mapa ----------

const mapa = L.map('mapa', { zoomControl: true }).setView([-33.45, -70.66], 5);
const capas = {
    'Satélite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics',
    }),
    'Calles': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap',
    }),
};
capas['Satélite'].addTo(mapa);
L.control.layers(capas).addTo(mapa);
const grupo = L.featureGroup().addTo(mapa);

function colorProyecto(p) {
    if (p.confirmado) return COLORES.confirmado;
    if (p.url) return COLORES.conUrl;
    return COLORES.porConfirmar;
}

function etiquetaEstado(p) {
    if (p.confirmado) return '<span class="chip chip-ok">Confirmado</span>';
    if (p.url) return '<span class="chip chip-url">Con URL</span>';
    return '<span class="chip chip-pendiente">Por confirmar</span>';
}

function pintarMarcador(p) {
    if (!p.coords) return;
    if (!p.marcador) {
        p.marcador = L.circleMarker(p.coords, { radius: 7, weight: 2, color: '#fff', fillOpacity: 0.95 })
            .on('click', () => seleccionar(p));
        p.marcador.bindTooltip(p.nombre);
    }
    p.marcador.setStyle({ fillColor: colorProyecto(p) });
}

// ---------- Carga del Excel ----------

async function cargarArchivo(archivo) {
    if (!archivo) return;
    if (estado.cambios && !confirm('Tienes URL sin descargar. ¿Cargar otro archivo de todas formas?')) {
        $('archivo').value = '';
        return;
    }
    if (!/\.xlsx$/i.test(archivo.name)) {
        aviso('El archivo debe ser un Excel .xlsx', 'error');
        return;
    }
    const wb = new ExcelJS.Workbook();
    try {
        await wb.xlsx.load(await archivo.arrayBuffer());
    } catch (e) {
        console.error(e);
        aviso('No se pudo leer el archivo. ¿Es un Excel .xlsx válido?', 'error');
        return;
    }
    const hoja = wb.getWorksheet(HOJA);
    if (!hoja) {
        aviso(`El Excel no tiene la hoja "${HOJA}".`, 'error');
        return;
    }

    const columnas = {}, encabezados = [];
    hoja.getRow(1).eachCell((celda, col) => {
        const nombre = textoCelda(celda.value);
        if (nombre) {
            columnas[nombre] = col;
            encabezados.push({ nombre, col });
        }
    });
    const faltan = COLUMNAS_REQUERIDAS.filter(c => !columnas[c]);
    if (faltan.length) {
        aviso(`Faltan columnas en la hoja ${HOJA}: ${faltan.join(', ')}`, 'error');
        return;
    }

    // La columna URL se crea al final si no existe (se escribe al descargar).
    let colUrl = columnas[COL_URL];
    if (!colUrl) {
        colUrl = Math.max(hoja.columnCount, ...encabezados.map(e => e.col)) + 1;
    }

    const proyectos = [];
    hoja.eachRow({ includeEmpty: false }, (row, numFila) => {
        if (numFila === 1) return;
        const fila = {};
        for (const { nombre, col } of encabezados) fila[nombre] = textoCelda(row.getCell(col).value);
        if (!fila.nombre) return;
        const p = {
            numFila,
            fila,
            nombre: fila.nombre,
            comuna: fila.comuna,
            codigo: fila['Código FHL'] || '',
            confirmado: normaliza(fila.JCF) === 'ok',
            url: textoCelda(row.getCell(colUrl).value),
            coords: coordenadas(fila),
        };
        p.busqueda = normaliza(`${p.nombre} ${p.comuna} ${p.codigo} ${fila.region || ''}`);
        proyectos.push(p);
    });

    grupo.clearLayers();
    Object.assign(estado, {
        workbook: wb, hoja, nombreArchivo: archivo.name, columnas, encabezados,
        colUrl, proyectos, seleccionado: null, cambios: 0,
    });
    proyectos.forEach(p => { pintarMarcador(p); if (p.marcador) grupo.addLayer(p.marcador); });

    $('nombre-archivo').textContent = archivo.name;
    $('descargar').disabled = false;
    $('buscar').disabled = false;
    $('filtro').disabled = false;
    $('vacio').hidden = true;
    actualizarPendientes();
    renderLista();
    cerrarDetalle();
    if (grupo.getLayers().length) mapa.fitBounds(grupo.getBounds(), { padding: [30, 30] });
    aviso(`${proyectos.length} proyectos cargados.`);
}

// ---------- Lista ----------

function filtrados() {
    const q = normaliza($('buscar').value);
    const f = $('filtro').value;
    return estado.proyectos.filter(p => {
        if (q && !p.busqueda.includes(q)) return false;
        switch (f) {
            case 'por-confirmar': return !p.confirmado;
            case 'confirmados': return p.confirmado;
            case 'con-url': return !!p.url;
            case 'sin-url': return !p.confirmado && !p.url;
            case 'sin-coords': return !p.coords;
            default: return true;
        }
    });
}

function renderLista() {
    const lista = filtrados();
    const total = estado.proyectos.length;
    const conf = estado.proyectos.filter(p => p.confirmado).length;
    const urls = estado.proyectos.filter(p => !p.confirmado && p.url).length;
    $('resumen').innerHTML = total
        ? `Mostrando <strong>${lista.length}</strong> de ${total} · ${conf} confirmados · ${urls} de ${total - conf} por confirmar con URL`
        : '';
    $('lista').innerHTML = lista.map(p => `
        <li>
            <button type="button" class="item" data-fila="${p.numFila}">
                <span class="punto" style="background:${colorProyecto(p)}"></span>
                <span class="item-texto">
                    <span class="item-nombre">${esc(p.nombre)}</span>
                    <span class="item-meta">${esc(p.comuna)}${p.codigo ? ' · ' + esc(p.codigo) : ''}${p.coords ? '' : ' · sin coordenadas'}</span>
                </span>
            </button>
        </li>`).join('');

    // En el mapa solo los visibles en la lista
    const visibles = new Set(lista);
    estado.proyectos.forEach(p => {
        if (!p.marcador) return;
        if (visibles.has(p)) grupo.addLayer(p.marcador);
        else grupo.removeLayer(p.marcador);
    });
}

$('lista').addEventListener('click', e => {
    const btn = e.target.closest('.item');
    if (!btn) return;
    const p = estado.proyectos.find(x => x.numFila === Number(btn.dataset.fila));
    if (p) seleccionar(p);
});

// ---------- Detalle ----------

function seleccionar(p) {
    estado.seleccionado = p;
    const busquedaGmaps = 'https://www.google.com/maps/search/?api=1&query='
        + encodeURIComponent(`${p.nombre}, ${p.comuna}, Chile`);
    const filas = estado.encabezados
        .filter(({ nombre }) => nombre !== COL_URL && p.fila[nombre])
        .map(({ nombre }) => `<tr><th>${esc(nombre)}</th><td>${esc(p.fila[nombre])}</td></tr>`)
        .join('');

    $('vista-detalle').innerHTML = `
        <button type="button" class="boton volver" id="volver">← Volver a la lista</button>
        <h2>${esc(p.nombre)}</h2>
        <p class="detalle-meta">${etiquetaEstado(p)} ${esc(p.comuna)} · fila ${p.numFila} del Excel</p>
        ${p.coords ? '' : '<p class="nota">Este proyecto no tiene coordenadas válidas en el Excel.</p>'}
        <div class="bloque-url">
            <label for="url">URL de Google Maps</label>
            <div class="fila-url">
                <input type="url" id="url" placeholder="https://maps.app.goo.gl/..." value="${esc(p.url)}" autocomplete="off">
                <button type="button" class="boton boton-principal" id="guardar-url">Guardar</button>
            </div>
            <p class="ayuda">
                En Google Maps, busca el lugar, haz clic en <em>Compartir</em> → <em>Copiar vínculo</em> y pégalo aquí.
                <a href="${busquedaGmaps}" target="_blank" rel="noopener noreferrer">Buscar este proyecto en Google Maps ↗</a>
            </p>
            <p class="ayuda" id="url-actual">${p.url && /^https?:\/\//i.test(p.url)
                ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Abrir URL guardada ↗</a>
                   · <button type="button" class="enlace" id="borrar-url">Quitar URL</button>`
                : ''}</p>
        </div>
        <table class="tabla-detalle">${filas}</table>`;

    $('vista-lista').hidden = true;
    $('vista-detalle').hidden = false;
    $('vista-detalle').scrollTop = 0;
    $('volver').addEventListener('click', cerrarDetalle);
    $('guardar-url').addEventListener('click', () => guardarUrl(p, $('url').value));
    $('url').addEventListener('keydown', e => { if (e.key === 'Enter') guardarUrl(p, $('url').value); });
    const borrar = $('borrar-url');
    if (borrar) borrar.addEventListener('click', () => guardarUrl(p, ''));

    if (p.marcador) {
        mapa.setView(p.coords, Math.max(mapa.getZoom(), 14));
        p.marcador.openTooltip();
    }
}

function cerrarDetalle() {
    estado.seleccionado = null;
    $('vista-detalle').hidden = true;
    $('vista-detalle').innerHTML = '';
    $('vista-lista').hidden = false;
}

function guardarUrl(p, valor) {
    const url = valor.trim();
    if (url && !/^https?:\/\/\S+$/i.test(url)) {
        aviso('Eso no parece una URL. Debe empezar con https://', 'error');
        return;
    }
    if (url === p.url) {
        aviso(url ? 'La URL ya estaba guardada.' : 'No hay URL que guardar.');
        return;
    }
    p.url = url;
    estado.cambios++;
    pintarMarcador(p);
    actualizarPendientes();
    renderLista();
    seleccionar(p);
    if (url && !esUrlGoogleMaps(url)) aviso('Guardada, pero no parece una URL de Google Maps. Revísala.', 'error');
    else aviso(url ? 'URL guardada. Recuerda descargar el Excel al terminar.' : 'URL quitada.');
}

function actualizarPendientes() {
    const el = $('pendientes');
    el.hidden = !estado.cambios;
    el.textContent = `${estado.cambios} cambio${estado.cambios === 1 ? '' : 's'} sin descargar`;
}

// ---------- Descarga ----------

async function descargar() {
    const { workbook, hoja, colUrl, proyectos } = estado;
    if (!workbook) return;
    const encabezado = hoja.getRow(1).getCell(colUrl);
    if (!textoCelda(encabezado.value)) {
        encabezado.value = COL_URL;
        // Mismo estilo que el encabezado anterior
        const previo = hoja.getRow(1).getCell(colUrl - 1);
        if (previo.style) encabezado.style = { ...previo.style };
    }
    for (const p of proyectos) {
        hoja.getRow(p.numFila).getCell(colUrl).value = p.url || null;
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = estado.nombreArchivo || 'Resumen_Proyectos_Huella_Local.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    estado.cambios = 0;
    actualizarPendientes();
    aviso('Excel descargado con la columna URL.');
}

// ---------- Eventos ----------

$('archivo').addEventListener('change', e => cargarArchivo(e.target.files[0]));
$('descargar').addEventListener('click', () => {
    const btn = $('descargar');
    btn.disabled = true; // evita doble descarga mientras se genera
    descargar()
        .catch(err => { console.error(err); aviso('No se pudo generar el Excel.', 'error'); })
        .finally(() => { btn.disabled = false; });
});
$('buscar').addEventListener('input', renderLista);
$('filtro').addEventListener('change', renderLista);

window.addEventListener('beforeunload', e => {
    if (estado.cambios) {
        e.preventDefault();
        e.returnValue = '';
    }
});
