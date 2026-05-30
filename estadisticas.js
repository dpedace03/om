// ============================================================
//  Panel de estadísticas (tabla + gráfico)
//  Usa los datos globales: alumnosData, registrosAsistencia
//  y los helpers obtenerDiaSemana() y escaparHTML() de script.js.
//  Los gráficos se dibujan con Chart.js.
// ============================================================
(function () {
    'use strict';

    let chartInstance = null;
    let vistaActual = 'resumen';
    let modo = 'tabla'; // 'tabla' | 'grafico'

    // ---------------- Helpers de datos ----------------
    function mapaPresentes() {
        const m = new Map();
        registrosAsistencia.forEach(r => m.set(r.alumno_id + '|' + r.fecha, r.presente));
        return m;
    }
    function fechasDeClase() {
        return Array.from(new Set(registrosAsistencia.map(r => r.fecha))).sort();
    }
    function alumnosPorDia() {
        const g = {};
        alumnosData.forEach(a => { (g[a.dia_semana] = g[a.dia_semana] || []).push(a); });
        return g;
    }
    function fechasClasePorDia() {
        const g = {};
        fechasDeClase().forEach(f => { const d = obtenerDiaSemana(f); (g[d] = g[d] || []).push(f); });
        return g;
    }
    function pad(n) { return String(n).padStart(2, '0'); }
    function isoDe(dt) { return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); }
    function lunesDe(fecha) {
        const p = fecha.split('-').map(Number);
        const dt = new Date(p[0], p[1] - 1, p[2]);
        const dow = dt.getDay();             // 0 dom .. 6 sáb
        const diff = (dow === 0 ? -6 : 1 - dow);
        dt.setDate(dt.getDate() + diff);
        return isoDe(dt);
    }
    function ddmm(fecha) { const p = fecha.split('-'); return p[2] + '/' + p[1]; }
    function pct(num, den) { return den > 0 ? Math.round((num / den) * 100) : 0; }
    function nombre(a) { return a.apellido + ', ' + a.nombre; }

    // Estadística base por alumno: total de clases de su día, presencias, %, racha de faltas, última presencia
    function statsPorAlumno() {
        const mp = mapaPresentes();
        const fcd = fechasClasePorDia();
        return alumnosData.map(a => {
            const clases = fcd[a.dia_semana] || [];
            const total = clases.length;
            let pres = 0;
            let ultima = null;
            clases.forEach(f => {
                if (mp.get(a.id + '|' + f) === 1) {
                    pres++;
                    if (!ultima || f > ultima) ultima = f;
                }
            });
            // Racha de ausencias: clases más recientes seguidas sin presente
            const recientes = clases.slice().sort().reverse();
            let racha = 0;
            for (let i = 0; i < recientes.length; i++) {
                if (mp.get(a.id + '|' + recientes[i]) === 1) break;
                racha++;
            }
            return { alumno: a, total, pres, aus: total - pres, porc: pct(pres, total), ultima, racha };
        });
    }

    // ---------------- Vistas ----------------
    function vResumen() {
        const apd = alumnosPorDia();
        let posibles = 0;
        fechasDeClase().forEach(f => { const d = obtenerDiaSemana(f); posibles += (apd[d] ? apd[d].length : 0); });
        const presentes = registrosAsistencia.filter(r => r.presente === 1).length;
        const ausentes = Math.max(0, posibles - presentes);
        return {
            titulo: 'Resumen general',
            nota: 'Sobre todas las clases registradas. "Ausencias" = clases esperadas menos presencias.',
            columnas: ['Métrica', 'Valor'],
            filas: [
                ['Alumnos cargados', String(alumnosData.length)],
                ['Clases registradas', String(fechasDeClase().length)],
                ['Presencias', String(presentes)],
                ['Ausencias', String(ausentes)],
                ['Asistencia global', pct(presentes, posibles) + '%']
            ],
            chart: { type: 'doughnut', labels: ['Presencias', 'Ausencias'], datasets: [{ data: [presentes, ausentes], backgroundColor: ['#4CAF50', '#FF9800'] }] }
        };
    }

    function vPorAlumno() {
        const s = statsPorAlumno().sort((a, b) => a.porc - b.porc);
        const peores = s.filter(x => x.total > 0).slice(0, 15);
        return {
            titulo: 'Tasa de asistencia por alumno',
            nota: 'Presencias sobre las clases de su día, de menor a mayor. El gráfico muestra los 15 más bajos.',
            columnas: ['Alumno', 'Día', 'Asistió', '%'],
            filas: s.map(x => [nombre(x.alumno), x.alumno.dia_semana, x.pres + '/' + x.total, x.porc + '%']),
            chart: { type: 'bar', indexAxis: 'y', labels: peores.map(x => nombre(x.alumno)), datasets: [{ label: '% asistencia', data: peores.map(x => x.porc), backgroundColor: '#667eea' }] }
        };
    }

    function vRiesgo() {
        const s = statsPorAlumno()
            .filter(x => x.total > 0 && (x.racha >= 2 || x.porc < 60))
            .sort((a, b) => b.racha - a.racha || a.porc - b.porc);
        return {
            titulo: 'Alumnos en riesgo',
            nota: 'Faltaron a 2 o más clases seguidas, o tienen menos de 60% de asistencia.',
            columnas: ['Alumno', 'Día', 'Faltas seguidas', '%', 'Últ. presente'],
            filas: s.map(x => [nombre(x.alumno), x.alumno.dia_semana, String(x.racha), x.porc + '%', x.ultima ? ddmm(x.ultima) : 'Nunca']),
            vacio: 'Sin alumnos en riesgo. 🎉',
            chart: { type: 'bar', indexAxis: 'y', labels: s.slice(0, 15).map(x => nombre(x.alumno)), datasets: [{ label: 'Faltas seguidas', data: s.slice(0, 15).map(x => x.racha), backgroundColor: '#FF9800' }] }
        };
    }

    function vUltima() {
        const hoy = new Date();
        function diasDesde(f) {
            if (!f) return null;
            const p = f.split('-').map(Number);
            return Math.round((hoy - new Date(p[0], p[1] - 1, p[2])) / 86400000);
        }
        const s = statsPorAlumno().map(x => ({ x, dd: diasDesde(x.ultima) }))
            .sort((a, b) => (b.dd == null ? 1e9 : b.dd) - (a.dd == null ? 1e9 : a.dd));
        const b = { '≤7 días': 0, '8–14 días': 0, '15–30 días': 0, '+30 días': 0, 'Nunca': 0 };
        s.forEach(o => {
            if (o.dd == null) b['Nunca']++;
            else if (o.dd <= 7) b['≤7 días']++;
            else if (o.dd <= 14) b['8–14 días']++;
            else if (o.dd <= 30) b['15–30 días']++;
            else b['+30 días']++;
        });
        return {
            titulo: 'Última asistencia por alumno',
            nota: 'Días desde la última presencia, del más antiguo al más reciente.',
            columnas: ['Alumno', 'Últ. presente', 'Días'],
            filas: s.map(o => [nombre(o.x.alumno), o.x.ultima ? ddmm(o.x.ultima) : 'Nunca', o.dd == null ? '—' : String(o.dd)]),
            chart: { type: 'bar', labels: Object.keys(b), datasets: [{ label: 'Alumnos', data: Object.values(b), backgroundColor: '#764ba2' }] }
        };
    }

    function tendencia(agrupador, etiqueta) {
        const apd = alumnosPorDia();
        const grupos = {};
        fechasDeClase().forEach(f => {
            const k = agrupador(f);
            const d = obtenerDiaSemana(f);
            grupos[k] = grupos[k] || { pres: 0, pos: 0 };
            grupos[k].pos += (apd[d] ? apd[d].length : 0);
        });
        registrosAsistencia.forEach(r => {
            if (r.presente === 1) { const k = agrupador(r.fecha); if (grupos[k]) grupos[k].pres++; }
        });
        const claves = Object.keys(grupos).sort();
        const labelFn = etiqueta === 'semana'
            ? (k => ddmm(k))
            : (k => { const p = k.split('-'); return p[1] + '/' + p[0]; });
        return {
            titulo: 'Asistencia promedio por ' + etiqueta,
            nota: 'Porcentaje de asistencia agrupado por ' + etiqueta + '.',
            columnas: [etiqueta === 'semana' ? 'Semana (lunes)' : 'Mes', 'Asistió', '%'],
            filas: claves.map(k => [labelFn(k), grupos[k].pres + '/' + grupos[k].pos, pct(grupos[k].pres, grupos[k].pos) + '%']),
            chart: { type: 'line', labels: claves.map(labelFn), datasets: [{ label: '% asistencia', data: claves.map(k => pct(grupos[k].pres, grupos[k].pos)), borderColor: '#667eea', backgroundColor: 'rgba(102,126,234,0.15)', fill: true, tension: 0.3 }] }
        };
    }

    function vSemanaVs() {
        const apd = alumnosPorDia();
        const grupos = {};
        fechasDeClase().forEach(f => {
            const k = lunesDe(f);
            const d = obtenerDiaSemana(f);
            grupos[k] = grupos[k] || { pres: 0, pos: 0 };
            grupos[k].pos += (apd[d] ? apd[d].length : 0);
        });
        registrosAsistencia.forEach(r => { if (r.presente === 1) { const k = lunesDe(r.fecha); if (grupos[k]) grupos[k].pres++; } });
        const lunAct = lunesDe(isoDe(new Date()));
        const lp = lunAct.split('-').map(Number);
        const prev = new Date(lp[0], lp[1] - 1, lp[2]); prev.setDate(prev.getDate() - 7);
        const lunPrev = isoDe(prev);
        const gAct = grupos[lunAct] || { pres: 0, pos: 0 };
        const gPrev = grupos[lunPrev] || { pres: 0, pos: 0 };
        return {
            titulo: 'Esta semana vs. la anterior',
            nota: 'Compara la asistencia de la semana en curso con la previa.',
            columnas: ['Semana', 'Asistió', '%'],
            filas: [
                ['Anterior (' + ddmm(lunPrev) + ')', gPrev.pres + '/' + gPrev.pos, pct(gPrev.pres, gPrev.pos) + '%'],
                ['Actual (' + ddmm(lunAct) + ')', gAct.pres + '/' + gAct.pos, pct(gAct.pres, gAct.pos) + '%']
            ],
            chart: { type: 'bar', labels: ['Anterior', 'Actual'], datasets: [{ label: '% asistencia', data: [pct(gPrev.pres, gPrev.pos), pct(gAct.pres, gAct.pos)], backgroundColor: ['#FF9800', '#4CAF50'] }] }
        };
    }

    function vPorDia() {
        const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
        const apd = alumnosPorDia();
        const fcd = fechasClasePorDia();
        const mp = mapaPresentes();
        const filas = [];
        const data = [];
        dias.forEach(d => {
            const clases = fcd[d] || [];
            const studs = apd[d] || [];
            const pos = clases.length * studs.length;
            let pres = 0;
            clases.forEach(f => studs.forEach(a => { if (mp.get(a.id + '|' + f) === 1) pres++; }));
            filas.push([d, String(studs.length), String(clases.length), pct(pres, pos) + '%']);
            data.push(pct(pres, pos));
        });
        return {
            titulo: 'Asistencia por día de la semana',
            nota: 'Promedio histórico de cada día.',
            columnas: ['Día', 'Alumnos', 'Clases', '%'],
            filas,
            chart: { type: 'bar', labels: dias, datasets: [{ label: '% asistencia', data, backgroundColor: '#4CAF50' }] }
        };
    }

    function vPorCampo(campo, etiqueta) {
        const fcd = fechasClasePorDia();
        const mp = mapaPresentes();
        const grupos = {};
        alumnosData.forEach(a => {
            const val = (a[campo] && String(a[campo]).trim()) ? String(a[campo]).trim() : '(sin dato)';
            const clases = fcd[a.dia_semana] || [];
            let pres = 0;
            clases.forEach(f => { if (mp.get(a.id + '|' + f) === 1) pres++; });
            grupos[val] = grupos[val] || { pos: 0, pres: 0, n: 0 };
            grupos[val].pos += clases.length;
            grupos[val].pres += pres;
            grupos[val].n++;
        });
        const claves = Object.keys(grupos).sort();
        return {
            titulo: 'Asistencia por ' + etiqueta,
            nota: 'Promedio de asistencia agrupado por ' + etiqueta + '.',
            columnas: [etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1), 'Alumnos', '%'],
            filas: claves.map(k => [k, String(grupos[k].n), pct(grupos[k].pres, grupos[k].pos) + '%']),
            chart: { type: 'bar', labels: claves, datasets: [{ label: '% asistencia', data: claves.map(k => pct(grupos[k].pres, grupos[k].pos)), backgroundColor: '#764ba2' }] }
        };
    }

    function vSinRegistrar() {
        const fechas = fechasDeClase();
        if (fechas.length === 0) {
            return { titulo: 'Días sin registrar', nota: '', columnas: ['Fecha', 'Día'], filas: [], vacio: 'No hay datos todavía.' };
        }
        const apd = alumnosPorDia();
        const set = new Set(fechas);
        const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const ini = fechas[0].split('-').map(Number);
        const fin = fechas[fechas.length - 1].split('-').map(Number);
        const dt = new Date(ini[0], ini[1] - 1, ini[2]);
        const end = new Date(fin[0], fin[1] - 1, fin[2]);
        const filas = [];
        const porDia = {};
        while (dt <= end) {
            const iso = isoDe(dt);
            const d = dias[dt.getDay()];
            if (apd[d] && apd[d].length > 0 && !set.has(iso)) {
                filas.push([ddmm(iso), d]);
                porDia[d] = (porDia[d] || 0) + 1;
            }
            dt.setDate(dt.getDate() + 1);
        }
        return {
            titulo: 'Días sin registrar',
            nota: 'Fechas (entre la primera y la última clase) que tenían alumnos ese día pero sin asistencia tomada.',
            columnas: ['Fecha', 'Día'],
            filas,
            vacio: 'No faltan días por registrar. 🎉',
            chart: { type: 'bar', labels: Object.keys(porDia), datasets: [{ label: 'Días sin registrar', data: Object.values(porDia), backgroundColor: '#f44336' }] }
        };
    }

    function vUsuarios() {
        const c = {};
        registrosAsistencia.forEach(r => {
            const u = (r.marcadoPor && String(r.marcadoPor).trim()) ? String(r.marcadoPor).trim() : '(sin dato)';
            c[u] = (c[u] || 0) + 1;
        });
        const claves = Object.keys(c).sort((a, b) => c[b] - c[a]);
        return {
            titulo: 'Actividad por usuario',
            nota: 'Cantidad de marcas (presente o ausente) hechas por cada persona.',
            columnas: ['Usuario', 'Marcas'],
            filas: claves.map(k => [k, String(c[k])]),
            vacio: 'Todavía no hay marcas registradas.',
            chart: { type: 'bar', labels: claves, datasets: [{ label: 'Marcas', data: claves.map(k => c[k]), backgroundColor: '#2196F3' }] }
        };
    }

    // Registro de vistas (el orden es el del menú)
    const VISTAS = [
        { id: 'resumen', label: 'Resumen', fn: vResumen },
        { id: 'alumno', label: 'Por alumno', fn: vPorAlumno },
        { id: 'riesgo', label: 'En riesgo', fn: vRiesgo },
        { id: 'ultima', label: 'Última asistencia', fn: vUltima },
        { id: 'semana', label: 'Por semana', fn: () => tendencia(lunesDe, 'semana') },
        { id: 'mes', label: 'Por mes', fn: () => tendencia(f => f.slice(0, 7), 'mes') },
        { id: 'vs', label: 'Semana vs. anterior', fn: vSemanaVs },
        { id: 'dia', label: 'Por día', fn: vPorDia },
        { id: 'programa', label: 'Por programa', fn: () => vPorCampo('programa', 'programa') },
        { id: 'sala', label: 'Por sala', fn: () => vPorCampo('sala', 'sala') },
        { id: 'sinreg', label: 'Días sin registrar', fn: vSinRegistrar },
        { id: 'usuarios', label: 'Actividad por usuario', fn: vUsuarios }
    ];

    // ---------------- Render ----------------
    function construirTabla(r) {
        if (!r.filas || r.filas.length === 0) {
            return '<p class="stats-vacio">' + (r.vacio || 'Sin datos.') + '</p>';
        }
        const head = '<tr>' + r.columnas.map(c => '<th>' + escaparHTML(c) + '</th>').join('') + '</tr>';
        const body = r.filas.map(f => '<tr>' + f.map(c => '<td>' + escaparHTML(String(c)) + '</td>').join('') + '</tr>').join('');
        return '<div class="stats-tabla-wrap"><table class="stats-tabla"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
    }

    function construirGrafico(r) {
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
        const wrap = document.getElementById('statsCanvasWrap');
        const sinDatos = !r.chart || !r.chart.labels || r.chart.labels.length === 0
            || (r.chart.datasets[0].data || []).every(v => !v);
        if (sinDatos) {
            wrap.innerHTML = '<p class="stats-vacio">' + (r.vacio || 'Sin datos para graficar.') + '</p>';
            return;
        }
        wrap.innerHTML = '<canvas id="statsCanvas"></canvas>';
        const ctx = document.getElementById('statsCanvas').getContext('2d');
        const tipo = r.chart.type === 'line' ? 'line' : (r.chart.type === 'doughnut' ? 'doughnut' : 'bar');
        const variasSeries = r.chart.datasets && r.chart.datasets.length > 1;
        chartInstance = new Chart(ctx, {
            type: tipo,
            data: { labels: r.chart.labels, datasets: r.chart.datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: r.chart.indexAxis || 'x',
                plugins: { legend: { display: tipo === 'doughnut' || variasSeries } },
                scales: tipo === 'doughnut' ? {} : { y: { beginAtZero: true } }
            }
        });
    }

    function statsRender() {
        const vista = VISTAS.find(v => v.id === vistaActual) || VISTAS[0];
        const r = vista.fn();

        document.querySelectorAll('.stats-chip').forEach(c =>
            c.classList.toggle('activo', c.getAttribute('data-vista') === vistaActual));
        document.getElementById('statsTitulo').textContent = r.titulo;
        document.getElementById('statsNota').textContent = r.nota || '';
        document.getElementById('btnTabla').classList.toggle('activo', modo === 'tabla');
        document.getElementById('btnGrafico').classList.toggle('activo', modo === 'grafico');

        const tablaDiv = document.getElementById('statsTabla');
        const canvasWrap = document.getElementById('statsCanvasWrap');
        if (modo === 'tabla') {
            canvasWrap.style.display = 'none';
            tablaDiv.style.display = 'block';
            tablaDiv.innerHTML = construirTabla(r);
            if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
        } else {
            tablaDiv.style.display = 'none';
            canvasWrap.style.display = 'block';
            construirGrafico(r);
        }
    }

    // ---------------- API pública ----------------
    window.statsSetModo = function (m) { modo = m; statsRender(); };

    window.mostrarEstadisticas = function () {
        const cont = document.getElementById('statsContent');
        cont.innerHTML =
            '<div class="stats-menu">' +
                VISTAS.map(v => '<button class="stats-chip" data-vista="' + v.id + '">' + v.label + '</button>').join('') +
            '</div>' +
            '<div class="stats-toolbar">' +
                '<strong id="statsTitulo"></strong>' +
                '<div class="stats-toggle">' +
                    '<button id="btnTabla" class="stats-tg" onclick="statsSetModo(\'tabla\')">Tabla</button>' +
                    '<button id="btnGrafico" class="stats-tg" onclick="statsSetModo(\'grafico\')">Gráfico</button>' +
                '</div>' +
            '</div>' +
            '<p class="stats-nota" id="statsNota"></p>' +
            '<div id="statsTabla"></div>' +
            '<div id="statsCanvasWrap" style="display:none;"><canvas id="statsCanvas"></canvas></div>';

        cont.querySelectorAll('.stats-chip').forEach(ch => {
            ch.addEventListener('click', () => { vistaActual = ch.getAttribute('data-vista'); statsRender(); });
        });

        document.getElementById('statsModal').style.display = 'block';
        statsRender();
    };

    window.cerrarEstadisticas = function () {
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
        document.getElementById('statsModal').style.display = 'none';
    };
})();
