// Tema Sistema / Claro / Oscuro. Se carga en <head> antes de pintar.
// Guarda la elección en localStorage ("sistema" no fija data-theme).
(function () {
    var TEMAS = ['sistema', 'claro', 'oscuro'];
    var ATRIBUTO = { claro: 'light', oscuro: 'dark' };
    var actual = 'sistema';

    try {
        var guardado = localStorage.getItem('tema');
        if (TEMAS.indexOf(guardado) >= 0) actual = guardado;
    } catch (e) { /* sin storage: queda "sistema" */ }

    function aplicar(t) {
        if (ATRIBUTO[t]) document.documentElement.setAttribute('data-theme', ATRIBUTO[t]);
        else document.documentElement.removeAttribute('data-theme');
    }

    aplicar(actual);

    // El botón (si existe en la página) rota los tres temas.
    document.addEventListener('DOMContentLoaded', function () {
        var boton = document.getElementById('tema');
        if (!boton) return;
        var ICONO = { sistema: '🖥️', claro: '☀️', oscuro: '🌙' };
        var NOMBRE = { sistema: 'Sistema', claro: 'Claro', oscuro: 'Oscuro' };

        function pintar() {
            var siguiente = TEMAS[(TEMAS.indexOf(actual) + 1) % TEMAS.length];
            boton.textContent = ICONO[actual];
            boton.setAttribute('aria-label', 'Tema: ' + NOMBRE[actual] + '. Cambiar a ' + NOMBRE[siguiente]);
            boton.title = boton.getAttribute('aria-label');
        }

        pintar();
        boton.addEventListener('click', function () {
            actual = TEMAS[(TEMAS.indexOf(actual) + 1) % TEMAS.length];
            try { localStorage.setItem('tema', actual); } catch (e) { /* solo esta sesión */ }
            aplicar(actual);
            pintar();
        });
    });
})();
