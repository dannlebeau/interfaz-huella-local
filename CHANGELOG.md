# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
y el proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

## [1.0.0] - 2026-11-16

### Added

- Campo `confirmado` en cada proyecto de `data/proyectos_comunas.json`: `true` si la columna JCF del Excel dice "OK" (100% confirmado), `false` si está por definir.
- El reporte de `scripts/transformar_proyectos.py` lista los proyectos excluidos por motivo y cuenta los confirmados.

### Changed

- `scripts/transformar_proyectos.py` excluye los proyectos cuyo nombre dice "por definir", los que no tienen Código FHL y los de las subcategorías HH Profesionales, Diagnósticos Territoriales, Planes Maestros, Fortalecimiento comunitario, Manejo y gestión de RSD, Otros Estudios y Talleres y/o Capacitaciones.
- `data/proyectos_comunas.json` regenerado desde el Excel actual: 390 proyectos (63 confirmados) de 482 filas.

[1.0.0]: https://github.com/dannlebeau/interfaz-huella-local/releases/tag/v1.0.0
