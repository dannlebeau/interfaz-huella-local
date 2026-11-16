# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
y el proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

## [1.0.0] - 2026-11-16

### Added

- Campo `confirmado` en cada proyecto de `data/proyectos_comunas.json`: `true` si la columna JCF del Excel dice "OK" (100% confirmado), `false` si está por definir.
- El reporte de `scripts/transformar_proyectos.py` lista los proyectos excluidos por motivo y cuenta los confirmados.
- Página interna `revision/`, desplegada en Render como sitio estático (`render.yaml`) y excluida de Vercel (`.vercelignore`): se sube el Excel, se ven todos los proyectos en mapa y lista (confirmados y por confirmar), se pega la URL de Google Maps de cada uno y se descarga el mismo Excel con la columna `URL`. Todo en el navegador, sin servidor. Incluye selector de tema Sistema / Claro / Oscuro.
- El popup del mapa público indica "Ubicación por confirmar" en los proyectos sin JCF OK (mantienen sus coordenadas).

### Changed

- README: el script se corre con `uv` y se documenta la revisión de ubicaciones.
- `scripts/transformar_proyectos.py` excluye los proyectos cuyo nombre dice "por definir", los que no tienen Código FHL y los de las subcategorías HH Profesionales, Diagnósticos Territoriales, Planes Maestros, Fortalecimiento comunitario, Manejo y gestión de RSD, Otros Estudios y Talleres y/o Capacitaciones.
- `data/proyectos_comunas.json` regenerado desde el Excel actual: 390 proyectos (63 confirmados) de 482 filas.

[1.0.0]: https://github.com/dannlebeau/interfaz-huella-local/releases/tag/v1.0.0
