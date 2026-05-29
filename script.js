// Variables globales
let diaSeleccionado = null;
let alumnosData = [];
let alumnosFiltrados = [];
let cambiosPendientes = new Set();
let nextId = 1;
let filtroAsistencia = 'todos'; // 'todos', 'presentes', 'ausentes'
let registrosAsistencia = []; // Registros de asistencia por fecha
let usuarioActual = ''; // Nombre de quien está registrando

// Clave para localStorage
const STORAGE_KEY = 'academia_om_alumnos';
const ASISTENCIA_KEY = 'academia_om_asistencia';
const USUARIO_KEY = 'academia_om_usuario';
const USUARIOS_KEY = 'academia_om_usuarios';

// Escapar texto para insertar de forma segura en HTML
function escaparHTML(texto) {
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Clave para importar Excel
const CLAVE_IMPORTAR = 'OMOM';

// Mostrar el modal de login
function mostrarLogin() {
    const modal = document.getElementById('loginModal');
    document.getElementById('loginError').style.display = 'none';
    if (modal) modal.style.display = 'block';
    const email = document.getElementById('loginEmail');
    if (email) email.focus();
}

// Tomar el nombre a mostrar a partir de la sesión (display_name o email)
function setUsuarioDesdeSesion(user) {
    const nombre = (user && user.user_metadata && user.user_metadata.display_name)
        || (user ? user.email : '');
    usuarioActual = nombre || '';
    const lbl = document.getElementById('usuarioActualLabel');
    if (lbl) lbl.textContent = usuarioActual || '—';
}

// Iniciar sesión con email + contraseña
async function confirmarLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errBox = document.getElementById('loginError');

    if (!email || !password) {
        errBox.textContent = '❌ Ingresá tu email y contraseña';
        errBox.style.display = 'block';
        return;
    }

    if (!window.supabaseClient || !window.supabaseClient.auth) {
        errBox.textContent = '❌ No se pudo conectar con Supabase. Revisá config.js (tus credenciales) y que haya internet.';
        errBox.style.display = 'block';
        return;
    }

    const btn = document.getElementById('btnIngresar');
    if (btn) btn.disabled = true;
    try {
        const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;

        errBox.style.display = 'none';
        document.getElementById('loginPassword').value = '';
        setUsuarioDesdeSesion(data.user);
        document.getElementById('loginModal').style.display = 'none';
        await iniciarApp();
    } catch (e) {
        console.error('Error de inicio de sesión:', e);
        const msg = (e && e.message) ? e.message : '';
        let texto;
        if (/email not confirmed/i.test(msg)) {
            texto = '❌ La cuenta no está confirmada. Confirmala en Supabase (Auto Confirm User).';
        } else if (/invalid login credentials/i.test(msg)) {
            texto = '❌ Email o contraseña incorrectos (o la cuenta no está confirmada).';
        } else if (/failed to fetch|networkerror|load failed/i.test(msg)) {
            texto = '❌ No hay conexión con el servidor. Revisá internet y la URL de Supabase.';
        } else {
            texto = '❌ No se pudo iniciar sesión: ' + (msg || 'error desconocido');
        }
        errBox.textContent = texto;
        errBox.style.display = 'block';
    } finally {
        if (btn) btn.disabled = false;
    }
}

// Cerrar sesión
async function cerrarSesion() {
    if (cambiosPendientes.size > 0) {
        mostrarModal('Hay cambios sin guardar', 'Guardá primero con 💾 Guardar Cambios antes de cerrar sesión.');
        return;
    }
    try { await window.supabaseClient.auth.signOut(); } catch (e) { console.error(e); }

    // Limpiar el estado en pantalla y volver al login
    alumnosData = [];
    registrosAsistencia = [];
    usuarioActual = '';
    const lbl = document.getElementById('usuarioActualLabel');
    if (lbl) lbl.textContent = '—';
    const tbody = document.getElementById('alumnosBody');
    if (tbody) tbody.innerHTML = '';
    mostrarLogin();
}

// Poblar el desplegable de nombres conocidos (desde la base compartida)
async function poblarUsuariosDatalist() {
    const dl = document.getElementById('usuariosList');
    if (!dl) return;
    let lista = [];
    try { lista = await DB.listarUsuarios(); } catch (e) { lista = []; }
    dl.innerHTML = lista.map(n => `<option value="${escaparHTML(n)}"></option>`).join('');
}

// Formatear una fecha/hora ISO -> dd/mm/aaaa HH:MM
function fmtFechaHora(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Verificar si la fecha seleccionada coincide con el día de la semana seleccionado.
// Solo cuando coinciden se permite marcar presentes; de lo contrario es modo consulta.
function fechaCoincideConDia() {
    const fecha = document.getElementById('fecha').value;
    if (!fecha || !diaSeleccionado) return false;
    return obtenerDiaSemana(fecha) === diaSeleccionado;
}

// Obtener día de la semana de una fecha
function obtenerDiaSemana(fecha) {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    // Parsear fecha usando zona horaria local
    const [year, month, day] = fecha.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return dias[date.getDay()];
}

// Toggle visibilidad del panel de opciones
function toggleButtons() {
    const rightButtons = document.getElementById('rightButtons');
    if (rightButtons.style.display === 'none' || rightButtons.style.display === '') {
        rightButtons.style.display = 'flex';
    } else {
        rightButtons.style.display = 'none';
    }
}

// Inicialización
document.addEventListener('DOMContentLoaded', async function() {
    // Establecer fecha actual (usando zona horaria local)
    const fechaInput = document.getElementById('fecha');
    const hoy = new Date();
    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, '0');
    const day = String(hoy.getDate()).padStart(2, '0');
    fechaInput.value = `${year}-${month}-${day}`;

    // Ocultar botones por defecto al cargar la página
    // Ocultar el panel de opciones por defecto (el ícono de agregar queda visible)
    const rightButtons = document.getElementById('rightButtons');
    if (rightButtons) rightButtons.style.display = 'none';

    // La carga de datos y la selección de día ahora ocurren en iniciarApp(),
    // recién DESPUÉS de iniciar sesión (más abajo).

    // Event listener para cambio de fecha
    fechaInput.addEventListener('change', function() {
        const nuevaFecha = this.value;
        const nuevoDia = obtenerDiaSemana(nuevaFecha);

        // Si es sábado o domingo, seleccionar lunes
        let diaSeleccionado = nuevoDia;
        if (nuevoDia === 'Sábado' || nuevoDia === 'Domingo') {
            diaSeleccionado = 'Lunes';
        }

        const nuevoDiaBtn = document.querySelector(`.day-btn[data-dia="${diaSeleccionado}"]`);
        if (nuevoDiaBtn) {
            seleccionarDia(diaSeleccionado, nuevoDiaBtn);
        }
    });

    // Event listeners para botones de días
    const dayButtons = document.querySelectorAll('.day-btn');
    dayButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const dia = this.getAttribute('data-dia');
            seleccionarDia(dia, this);
        });
    });

    // Event listeners para botones de estadísticas
    document.getElementById('totalAlumnos').parentElement.style.cursor = 'pointer';
    document.getElementById('totalAlumnos').parentElement.onclick = () => setFiltroAsistencia('todos');
    document.getElementById('totalPresentes').parentElement.style.cursor = 'pointer';
    document.getElementById('totalPresentes').parentElement.onclick = () => setFiltroAsistencia('presentes');
    document.getElementById('totalAusentes').parentElement.style.cursor = 'pointer';
    document.getElementById('totalAusentes').parentElement.onclick = () => setFiltroAsistencia('ausentes');

    // Event listener para importación de Excel
    document.getElementById('excelFile').addEventListener('change', handleExcelImport);

    // Event listener para restaurar copia de seguridad
    document.getElementById('backupFile').addEventListener('change', handleBackupRestore);

    // Aviso al cerrar/recargar si hay cambios sin guardar
    window.addEventListener('beforeunload', function(e) {
        if (cambiosPendientes.size > 0) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // Validar clave al presionar Enter en el campo de clave
    document.getElementById('claveInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            validarClave();
        }
    });

    // Confirmar login al presionar Enter en email o contraseña
    ['loginEmail', 'loginPassword'].forEach(id => {
        const campo = document.getElementById(id);
        if (campo) {
            campo.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    confirmarLogin();
                }
            });
        }
    });

    actualizarBotonGuardar();

    // Verificar si ya hay una sesión activa; si no, pedir login
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session) {
            setUsuarioDesdeSesion(session.user);
            await iniciarApp();
        } else {
            mostrarLogin();
        }
    } catch (e) {
        console.error('Error al verificar la sesión:', e);
        mostrarLogin();
    }
});

// Cargar datos y preparar la vista (se llama recién después de iniciar sesión)
async function iniciarApp() {
    const ok = await cargarDesdeSupabase();
    if (!ok) return;

    // Seleccionar día por default según la fecha actual
    const fechaInput = document.getElementById('fecha');
    const diaActual = obtenerDiaSemana(fechaInput.value);
    let diaInicial = diaActual;
    if (diaActual === 'Sábado' || diaActual === 'Domingo') {
        diaInicial = 'Lunes';
    }
    const diaBtn = document.querySelector(`.day-btn[data-dia="${diaInicial}"]`);
    if (diaBtn) {
        seleccionarDia(diaInicial, diaBtn);
    }

    actualizarSelectorFechas();
}

// Cargar datos desde Supabase (base compartida en la nube)
async function cargarDesdeSupabase() {
    try {
        const { alumnos, registros } = await DB.cargarTodo();
        alumnosData = alumnos;
        registrosAsistencia = registros;
        return true;
    } catch (e) {
        console.error('Error al cargar desde Supabase:', e);
        mostrarModal(
            'Error de conexión',
            'No se pudieron cargar los datos desde la nube. Revisá tu conexión a internet o la configuración de Supabase (URL y clave en index.html).'
        );
        return false;
    }
}

// Traer de nuevo los datos de la nube y refrescar la vista (botón 🔄 Actualizar)
async function refrescarDatos() {
    const btn = document.getElementById('btnRefrescar');
    if (cambiosPendientes.size > 0) {
        mostrarModal(
            'Hay cambios sin guardar',
            'Tenés cambios sin guardar. Si actualizás ahora se perderán. Guardá primero con 💾 Guardar Cambios.'
        );
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Actualizando…'; }
    const ok = await cargarDesdeSupabase();
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Actualizar'; }
    if (ok) {
        actualizarSelectorFechas();
        if (diaSeleccionado) {
            cargarAlumnos(diaSeleccionado);
        }
    }
}

// Seleccionar día
function seleccionarDia(dia, btnElement) {
    diaSeleccionado = dia;

    // Actualizar clases activas
    document.querySelectorAll('.day-btn').forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');

    // Cargar alumnos del día
    cargarAlumnos(dia);
}

// Cargar alumnos filtrados por día
function cargarAlumnos(dia) {
    const fecha = document.getElementById('fecha').value;
    const tbody = document.getElementById('alumnosBody');

    tbody.innerHTML = '<tr><td colspan="6" class="loading">Cargando...</td></tr>';

    // Filtrar alumnos solo por día de la semana (sin importar la fecha)
    alumnosFiltrados = alumnosData.filter(alumno =>
        alumno.dia_semana === dia
    );

    // Actualizar estadísticas con valores del día completo
    actualizarEstadisticasDelDia();

    // Aplicar filtro de asistencia
    aplicarFiltroAsistencia();
}

// Actualizar estadísticas con valores del día completo
function actualizarEstadisticasDelDia() {
    const fecha = document.getElementById('fecha').value;
    const total = alumnosFiltrados.length;

    // Contar presentes usando registros de asistencia para la fecha seleccionada
    const presentes = alumnosFiltrados.filter(alumno => {
        const registro = registrosAsistencia.find(r =>
            r.alumno_id === alumno.id && r.fecha === fecha
        );
        return registro && registro.presente === 1;
    }).length;

    const ausentes = total - presentes;
    const porcentaje = total > 0 ? Math.round((presentes / total) * 100) : 0;

    document.getElementById('totalAlumnos').textContent = total;
    document.getElementById('totalPresentes').textContent = presentes;
    document.getElementById('totalAusentes').textContent = ausentes;
    document.getElementById('porcentajeAsistencia').textContent = porcentaje + '%';
}

// Aplicar filtro de asistencia
function aplicarFiltroAsistencia() {
    const fecha = document.getElementById('fecha').value;
    let filtrados = [...alumnosFiltrados];

    if (filtroAsistencia === 'presentes') {
        filtrados = filtrados.filter(alumno => {
            const registro = registrosAsistencia.find(r =>
                r.alumno_id === alumno.id && r.fecha === fecha
            );
            return registro && registro.presente === 1;
        });
    } else if (filtroAsistencia === 'ausentes') {
        filtrados = filtrados.filter(alumno => {
            const registro = registrosAsistencia.find(r =>
                r.alumno_id === alumno.id && r.fecha === fecha
            );
            return !registro || registro.presente === 0;
        });
    }

    setTimeout(() => {
        renderizarAlumnos(filtrados);
        // No actualizar estadísticas aquí, mantener valores del día completo
    }, 300);
}

// Setear filtro de asistencia
function setFiltroAsistencia(filtro) {
    filtroAsistencia = filtro;

    // Actualizar estilos visuales de los botones de estadísticas
    document.querySelectorAll('.stat-item').forEach(item => {
        item.style.border = '2px solid transparent';
    });

    if (filtro === 'todos') {
        document.getElementById('totalAlumnos').parentElement.style.border = '2px solid #667eea';
    } else if (filtro === 'presentes') {
        document.getElementById('totalPresentes').parentElement.style.border = '2px solid #4CAF50';
    } else if (filtro === 'ausentes') {
        document.getElementById('totalAusentes').parentElement.style.border = '2px solid #FF9800';
    }

    aplicarFiltroAsistencia();
}

// Las estadísticas ahora se manejan en estadisticas.js (panel completo con
// tabla y gráfico). Allí se definen mostrarEstadisticas() y cerrarEstadisticas().



// Actualizar el desplegable "Ir a fecha" con las fechas que tienen registros
function actualizarSelectorFechas() {
    const sel = document.getElementById('historialFechas');
    if (!sel) return;
    const fechas = Array.from(new Set(registrosAsistencia.map(r => r.fecha))).sort().reverse();
    sel.innerHTML = '<option value="">Fechas registradas…</option>' +
        fechas.map(f => {
            const p = f.split('-');
            return `<option value="${f}">${obtenerDiaSemana(f)} ${p[2]}/${p[1]}/${p[0]}</option>`;
        }).join('');
}

// Saltar a una fecha registrada
function irAFechaRegistrada(valor) {
    if (!valor) return;
    const input = document.getElementById('fecha');
    input.value = valor;
    // Disparar el manejador de cambio de fecha (selecciona el día y carga los alumnos)
    input.dispatchEvent(new Event('change'));
}

// Exportar copia de seguridad (JSON con alumnos + asistencia + usuarios)
async function exportarBackup() {
    let usuarios = [];
    try { usuarios = await DB.listarUsuarios(); } catch (e) { usuarios = []; }

    const datos = {
        app: 'OtroMundo-Asistencias',
        version: 1,
        exportadoEn: new Date().toISOString(),
        alumnos: alumnosData,
        asistencia: registrosAsistencia,
        usuarios: usuarios
    };

    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const d = String(hoy.getDate()).padStart(2, '0');
    a.href = url;
    a.download = `respaldo_asistencias_${y}-${m}-${d}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Leer y validar el archivo de respaldo
function handleBackupRestore(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        let datos;
        try {
            datos = JSON.parse(e.target.result);
        } catch (err) {
            mostrarModal('Error', 'El archivo no es un respaldo válido (no se pudo leer como JSON).');
            return;
        }

        if (!datos || !Array.isArray(datos.alumnos) || !Array.isArray(datos.asistencia)) {
            mostrarModal('Error', 'El archivo no tiene el formato de respaldo esperado.');
            return;
        }

        const nAl = datos.alumnos.length;
        const nAs = datos.asistencia.length;
        mostrarModal(
            'Restaurar copia',
            `Esto reemplazará TODOS los datos actuales por los del respaldo (${nAl} alumnos, ${nAs} registros de asistencia). ¿Deseas continuar?`,
            () => { restaurarBackup(datos); }
        );
    };
    reader.readAsText(file);
    event.target.value = '';
}

// Aplicar el respaldo
async function restaurarBackup(datos) {
    try {
        await DB.reemplazarTodo(datos.alumnos || [], datos.asistencia || [], datos.usuarios || []);

        // Recargar desde la nube para tener los ids reales en memoria
        await cargarDesdeSupabase();
        await poblarUsuariosDatalist();

        cambiosPendientes.clear();
        actualizarBotonGuardar();
        actualizarSelectorFechas();
        if (diaSeleccionado) {
            cargarAlumnos(diaSeleccionado);
        }

        setTimeout(() => {
            mostrarModal('Restauración exitosa', 'Los datos del respaldo se subieron a la nube correctamente.');
        }, 0);
    } catch (e) {
        console.error('Error al restaurar el backup:', e);
        mostrarModal('Error', 'No se pudo subir el respaldo a la nube. Revisá la conexión e intentá de nuevo.');
    }
}

// Exportar la asistencia a un archivo Excel
function exportarExcel() {
    if (typeof XLSX === 'undefined') {
        mostrarModal('Error', 'No se pudo cargar el componente de Excel.');
        return;
    }
    if (alumnosData.length === 0) {
        mostrarModal('Información', 'No hay alumnos para exportar.');
        return;
    }

    const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

    // Conjunto de presentes para búsqueda rápida
    const presentesSet = new Set();
    registrosAsistencia.forEach(r => {
        if (r.presente === 1) presentesSet.add(r.alumno_id + '|' + r.fecha);
    });

    // Formatear fecha ISO (yyyy-mm-dd) -> dd/mm
    function fmtCorto(iso) {
        const p = iso.split('-');
        return `${p[2]}/${p[1]}`;
    }

    // Estilo de encabezado: relleno verde claro, negrita y centrado
    const estiloEncabezado = {
        fill: { patternType: 'solid', fgColor: { rgb: 'C6EFCE' } },
        font: { bold: true },
        alignment: { horizontal: 'center', vertical: 'center' }
    };

    const wb = XLSX.utils.book_new();
    let hojasAgregadas = 0;

    dias.forEach(dia => {
        // Alumnos de ese día, ordenados por apellido
        const alumnosDelDia = alumnosData
            .filter(a => a.dia_semana === dia)
            .sort((a, b) => String(a.apellido).localeCompare(String(b.apellido)));

        if (alumnosDelDia.length === 0) return;

        // Fechas que caen en ese día de la semana (según los registros), ordenadas
        const fechasSet = new Set();
        registrosAsistencia.forEach(r => {
            if (obtenerDiaSemana(r.fecha) === dia) fechasSet.add(r.fecha);
        });
        const fechas = Array.from(fechasSet).sort();

        // Encabezados: columnas fijas + una columna por fecha de ese día
        const header = ['Apellido', 'Nombre', 'Programa', 'Sala', 'Día de la semana', ...fechas.map(fmtCorto)];

        // Filas: datos del alumno + cruz (X) bajo cada fecha en que estuvo presente
        const filas = alumnosDelDia.map(al => {
            const fila = [al.apellido, al.nombre, al.programa, al.sala, al.dia_semana];
            fechas.forEach(f => {
                fila.push(presentesSet.has(al.id + '|' + f) ? 'X' : '');
            });
            return fila;
        });

        const aoa = [header, ...filas];
        const ws = XLSX.utils.aoa_to_sheet(aoa);

        // Anchos de columna
        ws['!cols'] = [
            { wch: 18 }, { wch: 16 }, { wch: 20 }, { wch: 10 }, { wch: 16 },
            ...fechas.map(() => ({ wch: 8 }))
        ];

        // Pintar de verde claro toda la fila de encabezados
        for (let c = 0; c < header.length; c++) {
            const ref = XLSX.utils.encode_cell({ r: 0, c });
            if (ws[ref]) ws[ref].s = estiloEncabezado;
        }

        // Cada día en su propia pestaña
        XLSX.utils.book_append_sheet(wb, ws, dia);
        hojasAgregadas++;
    });

    if (hojasAgregadas === 0) {
        mostrarModal('Información', 'No hay datos para exportar.');
        return;
    }

    // Nombre del archivo con la fecha actual
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const d = String(hoy.getDate()).padStart(2, '0');
    XLSX.writeFile(wb, `asistencias_${y}-${m}-${d}.xlsx`);
}

// Filtrar alumnos por búsqueda
function filtrarAlumnos() {
    const busqueda = document.getElementById('busqueda').value.toLowerCase();
    const tbody = document.getElementById('alumnosBody');

    if (!busqueda) {
        aplicarFiltroAsistencia();
        return;
    }

    // Buscar solo en el día seleccionado
    const filtrados = alumnosFiltrados.filter(alumno =>
        alumno.apellido.toLowerCase().includes(busqueda) ||
        alumno.nombre.toLowerCase().includes(busqueda) ||
        alumno.programa.toLowerCase().includes(busqueda) ||
        alumno.sala.toLowerCase().includes(busqueda)
    );

    renderizarAlumnos(filtrados);
    actualizarEstadisticasDelDia();
}

// Agregar nuevo alumno
function agregarAlumno() {
    if (!diaSeleccionado) {
        alert('Por favor selecciona un día primero');
        return;
    }
    
    const tbody = document.getElementById('alumnosBody');
    const fecha = document.getElementById('fecha').value;
    
    // Agregar fila en blanco para edición
    const nuevaFila = document.createElement('tr');
    nuevaFila.innerHTML = `
        <td>
            <input type="checkbox" class="presente-checkbox">
        </td>
        <td><input type="text" class="edit-input" placeholder="Apellido" id="nuevoApellido"></td>
        <td><input type="text" class="edit-input" placeholder="Nombre" id="nuevoNombre"></td>
        <td><input type="text" class="edit-input" placeholder="Programa" id="nuevoPrograma"></td>
        <td><input type="text" class="edit-input" placeholder="Sala" id="nuevoSala"></td>
        <td>
            <button class="btn btn-save-row" onclick="guardarNuevoAlumno()">Guardar</button>
            <button class="btn btn-cancel-row" onclick="cancelarNuevoAlumno(this)">Cancelar</button>
        </td>
    `;
    
    tbody.insertBefore(nuevaFila, tbody.firstChild);
}

// Guardar nuevo alumno
function guardarNuevoAlumno() {
    const apellido = document.getElementById('nuevoApellido').value.trim();
    const nombre = document.getElementById('nuevoNombre').value.trim();
    const programa = document.getElementById('nuevoPrograma').value.trim();
    const sala = document.getElementById('nuevoSala').value.trim();

    if (!apellido || !nombre) {
        mostrarModal('Datos incompletos', 'Por favor ingresa Apellido y Nombre');
        return;
    }

    // Validar que el alumno no exista en ningún día
    const alumnoExistente = alumnosData.find(a =>
        a.apellido.toLowerCase() === apellido.toLowerCase() &&
        a.nombre.toLowerCase() === nombre.toLowerCase()
    );

    if (alumnoExistente) {
        mostrarModal(
            'Alumno duplicado',
            `${apellido} ${nombre} ya está en el día ${alumnoExistente.dia_semana}. Puedes cambiar los datos o cancelar el alta.`,
            null,
            null
        );
        return;
    }

    const nuevoAlumno = {
        apellido: apellido,
        nombre: nombre,
        programa: programa,
        sala: sala,
        dia_semana: diaSeleccionado
    };

    DB.insertarAlumno(nuevoAlumno)
        .then(creado => {
            nuevoAlumno.id = creado.id;
            alumnosData.push(nuevoAlumno);
            mostrarModal('Éxito', 'Alumno agregado exitosamente', () => {
                cargarAlumnos(diaSeleccionado);
            });
        })
        .catch(e => {
            console.error('Error al agregar alumno:', e);
            mostrarModal('Error', 'No se pudo guardar el alumno en la nube. Revisá la conexión e intentá de nuevo.');
        });
}

// Cancelar agregar alumno
function cancelarNuevoAlumno(boton) {
    const fila = boton.closest('tr');
    fila.remove();
}

// Funciones para modal
let modalCallback = null;

function mostrarModal(titulo, mensaje, onConfirm, onCancel) {
    document.getElementById('modalTitle').textContent = titulo;
    document.getElementById('modalMessage').textContent = mensaje;
    document.getElementById('modal').style.display = 'block';

    const confirmBtn = document.getElementById('modalConfirm');
    const cancelBtn = document.getElementById('modalCancel');

    // Remover event listeners anteriores
    const newConfirmBtn = confirmBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    modalCallback = onConfirm;

    newConfirmBtn.onclick = function() {
        if (modalCallback) modalCallback();
        cerrarModal();
    };

    newCancelBtn.onclick = function() {
        if (onCancel) onCancel();
        cerrarModal();
    };
}

function cerrarModal() {
    document.getElementById('modal').style.display = 'none';
    modalCallback = null;
}

// Renderizar alumnos en la tabla
function renderizarAlumnos(alumnos) {
    const tbody = document.getElementById('alumnosBody');
    const fecha = document.getElementById('fecha').value;

    // ¿La fecha coincide con el día seleccionado? Solo así se puede marcar presentes.
    const puedeMarcar = fechaCoincideConDia();

    // Mostrar u ocultar el banner de modo consulta
    const banner = document.getElementById('consultaBanner');
    if (banner) {
        banner.style.display = puedeMarcar ? 'none' : 'block';
    }

    if (alumnos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="no-data">No hay alumnos para este día</td></tr>';
        return;
    }

    tbody.innerHTML = alumnos.map(alumno => {
        // Buscar registro de asistencia para este alumno en la fecha seleccionada
        const registroAsistencia = registrosAsistencia.find(r =>
            r.alumno_id === alumno.id && r.fecha === fecha
        );
        const presente = registroAsistencia ? registroAsistencia.presente : 0;
        const marcadoPor = registroAsistencia && registroAsistencia.marcadoPor
            ? registroAsistencia.marcadoPor : '';
        const tituloMarca = registroAsistencia && registroAsistencia.marcadoEn
            ? `Marcado el ${fmtFechaHora(registroAsistencia.marcadoEn)}` : '';

        // En modo consulta (la fecha no coincide con el día) el checkbox queda
        // deshabilitado: solo muestra los presentes ya registrados de esa fecha.
        const checkboxAttrs = puedeMarcar
            ? `onchange="marcarCambio(${alumno.id})"`
            : 'disabled';

        return `
        <tr>
            <td class="sticky-col sticky-col-1">
                <input type="checkbox" class="presente-checkbox" data-id="${alumno.id}" ${presente ? 'checked' : ''} ${checkboxAttrs}>
            </td>
            <td class="sticky-col sticky-col-2" title="${escaparHTML(alumno.apellido)}">${alumno.apellido}</td>
            <td class="sticky-col sticky-col-3" title="${escaparHTML(alumno.nombre)}">${alumno.nombre}</td>
            <td>${alumno.programa}</td>
            <td>${alumno.sala}</td>
            <td>
                <button class="btn btn-delete" onclick="eliminarAlumno(${alumno.id})">Eliminar</button>
                <span class="marcado-por" title="${escaparHTML(tituloMarca)}">${marcadoPor ? escaparHTML(marcadoPor) : ''}</span>
            </td>
        </tr>
    `;
    }).join('');
}

// Marcar cambio en checkbox
function marcarCambio(id) {
    const checkbox = document.querySelector(`.presente-checkbox[data-id="${id}"]`);
    const presente = checkbox.checked;
    marcarPresente(id, presente);
}

// Marcar alumno como presente
function marcarPresente(id, presente) {
    // Solo se puede marcar si la fecha coincide con el día de la semana
    if (!fechaCoincideConDia()) {
        return;
    }

    cambiosPendientes.add(id + '|' + document.getElementById('fecha').value);

    const fecha = document.getElementById('fecha').value;
    const ahora = new Date().toISOString();

    // Buscar si ya existe un registro de asistencia para este alumno en esta fecha
    const registroExistente = registrosAsistencia.findIndex(r =>
        r.alumno_id === id && r.fecha === fecha
    );

    if (registroExistente !== -1) {
        // Actualizar registro existente
        registrosAsistencia[registroExistente].presente = presente ? 1 : 0;
        registrosAsistencia[registroExistente].marcadoPor = usuarioActual;
        registrosAsistencia[registroExistente].marcadoEn = ahora;
    } else {
        // Crear nuevo registro
        registrosAsistencia.push({
            alumno_id: id,
            fecha: fecha,
            presente: presente ? 1 : 0,
            marcadoPor: usuarioActual,
            marcadoEn: ahora
        });
    }

    // Mostrar el nombre de quien marcó en la fila, en el momento (igual que al consultar)
    const checkbox = document.querySelector(`.presente-checkbox[data-id="${id}"]`);
    if (checkbox) {
        const fila = checkbox.closest('tr');
        const span = fila ? fila.querySelector('.marcado-por') : null;
        if (span) {
            span.textContent = usuarioActual || '';
            span.title = `Marcado el ${fmtFechaHora(ahora)}`;
        }
    }

    // Actualizar estadísticas y el estado del botón Guardar
    actualizarEstadisticasDelDia();
    actualizarBotonGuardar();
}

// Reflejar en el botón Guardar la cantidad de cambios sin guardar
function actualizarBotonGuardar() {
    const btn = document.getElementById('btnGuardar');
    if (!btn) return;
    const n = cambiosPendientes.size;
    if (n > 0) {
        btn.textContent = `💾 Guardar Cambios (${n})`;
        btn.classList.add('pendiente');
    } else {
        btn.textContent = '💾 Guardar Cambios';
        btn.classList.remove('pendiente');
    }
}

// Guardar cambios pendientes
async function guardarCambios() {
    if (cambiosPendientes.size === 0) {
        mostrarModal('Información', 'No hay cambios pendientes para guardar');
        return;
    }

    // Reunir los registros modificados (cada clave es "alumno_id|fecha")
    const aGuardar = [];
    cambiosPendientes.forEach(clave => {
        const sep = clave.lastIndexOf('|');
        const alumnoId = parseInt(clave.slice(0, sep), 10);
        const fecha = clave.slice(sep + 1);
        const reg = registrosAsistencia.find(r => r.alumno_id === alumnoId && r.fecha === fecha);
        if (reg) aGuardar.push(reg);
    });

    const btn = document.getElementById('btnGuardar');
    if (btn) { btn.disabled = true; }
    try {
        await DB.guardarAsistencia(aGuardar);
        cambiosPendientes.clear();
        actualizarBotonGuardar();
        actualizarSelectorFechas();
        mostrarModal('Éxito', 'Cambios guardados exitosamente');
    } catch (e) {
        console.error('Error al guardar asistencia:', e);
        mostrarModal('Error', 'No se pudieron guardar los cambios en la nube. Tu marca quedó en pantalla; revisá la conexión e intentá de nuevo.');
    } finally {
        if (btn) { btn.disabled = false; }
    }
}

// Eliminar alumno
function eliminarAlumno(id) {
    const alumno = alumnosData.find(a => a.id === id);
    if (!alumno) return;

    mostrarModal(
        'Confirmar eliminación',
        `¿Estás seguro de eliminar a ${alumno.apellido} ${alumno.nombre}?`,
        () => {
            DB.eliminarAlumno(id)
                .then(() => {
                    alumnosData = alumnosData.filter(a => a.id !== id);
                    // La asistencia se borra en cascada en la base; la limpiamos en memoria
                    registrosAsistencia = registrosAsistencia.filter(r => r.alumno_id !== id);
                    actualizarSelectorFechas();
                    cargarAlumnos(diaSeleccionado);
                })
                .catch(e => {
                    console.error('Error al eliminar alumno:', e);
                    mostrarModal('Error', 'No se pudo eliminar el alumno en la nube. Revisá la conexión e intentá de nuevo.');
                });
        }
    );
}

// Borrar todos los alumnos del día seleccionado
function borrarTodosDelDia() {
    if (!diaSeleccionado) {
        mostrarModal('Error', 'Por favor selecciona un día primero');
        return;
    }

    const alumnosDelDia = alumnosData.filter(a =>
        a.dia_semana === diaSeleccionado
    );

    if (alumnosDelDia.length === 0) {
        mostrarModal('Información', 'No hay alumnos para eliminar en este día');
        return;
    }

    mostrarModal(
        'Confirmar eliminación',
        `¿Confirma eliminar a todos del día ${diaSeleccionado}? (${alumnosDelDia.length} alumnos)`,
        () => {
            const ids = alumnosDelDia.map(a => a.id);
            DB.eliminarAlumnosPorDia([diaSeleccionado])
                .then(() => {
                    alumnosData = alumnosData.filter(a =>
                        a.dia_semana !== diaSeleccionado
                    );
                    // Limpiar la asistencia de esos alumnos en memoria
                    registrosAsistencia = registrosAsistencia.filter(r => !ids.includes(r.alumno_id));
                    actualizarSelectorFechas();
                    cargarAlumnos(diaSeleccionado);
                })
                .catch(e => {
                    console.error('Error al borrar el día:', e);
                    mostrarModal('Error', 'No se pudo borrar el día en la nube. Revisá la conexión e intentá de nuevo.');
                });
        }
    );
}

// Solicitar clave antes de importar Excel
function solicitarClaveImportar() {
    const modal = document.getElementById('claveModal');
    const input = document.getElementById('claveInput');
    document.getElementById('claveError').style.display = 'none';
    input.value = '';
    modal.style.display = 'block';
    input.focus();
}

// Cerrar modal de clave
function cerrarClaveModal() {
    document.getElementById('claveModal').style.display = 'none';
}

// Validar la clave ingresada
function validarClave() {
    const clave = document.getElementById('claveInput').value;
    if (clave === CLAVE_IMPORTAR) {
        cerrarClaveModal();
        // Clave válida: abrir selector de archivo para importar
        document.getElementById('excelFile').click();
    } else {
        // Clave inválida
        document.getElementById('claveError').style.display = 'block';
    }
}

// Manejar importación de Excel
function handleExcelImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Debe haber un día seleccionado: la planilla se importa en ese día
    if (!diaSeleccionado) {
        alert('Por favor selecciona un día antes de importar.');
        event.target.value = '';
        return;
    }

    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            const alumnosImportados = [];
            let totalFilas = 0;
            let omitidas = 0;

            // Recorrer todas las hojas y asignar TODOS los alumnos al día
            // seleccionado (no importa cómo se llamen las hojas).
            workbook.SheetNames.forEach(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                // Procesar cada fila
                jsonData.forEach(row => {
                    totalFilas++;
                    // Buscar las columnas por diferentes nombres posibles (incluyendo espacios)
                    const apellido = row['Apellido'] || row['apellido'] || row['APELLIDO'] || row['Apellido '] || '';
                    const nombre = row['Nombre'] || row['nombre'] || row['NOMBRE'] || row['Nombre '] || '';
                    const programa = row['Programa'] || row['programa'] || row['PROGRAMA'] || row['Programa '] || '';
                    const sala = row['Sala'] || row['sala'] || row['SALA'] || row['Sala '] || '';

                    if (apellido && nombre) {
                        alumnosImportados.push({
                            id: nextId++,
                            apellido: String(apellido),
                            nombre: String(nombre),
                            programa: String(programa),
                            sala: String(sala),
                            dia_semana: diaSeleccionado
                        });
                    } else {
                        omitidas++;
                    }
                });
            });

            if (alumnosImportados.length > 0) {
                importarAlumnos(alumnosImportados, omitidas);
            } else if (totalFilas > 0) {
                mostrarModal('Importación', 'No se encontró ninguna fila con Apellido y Nombre. Verifica que el Excel tenga columnas llamadas "Apellido" y "Nombre".');
            } else {
                mostrarModal('Importación', 'El archivo no contiene filas de datos.');
            }

        } catch (error) {
            console.error('Error al procesar Excel:', error);
            mostrarModal('Error', 'No se pudo procesar el archivo Excel. Verifica que el formato sea correcto.');
        }
    };

    reader.readAsArrayBuffer(file);

    // Limpiar el input
    event.target.value = '';
}

// Normalizar nombre del día de la semana
function normalizarDiaSemana(nombre) {
    const nombreNormalizado = nombre.toLowerCase().trim();
    
    if (nombreNormalizado.includes('lunes')) return 'Lunes';
    if (nombreNormalizado.includes('martes')) return 'Martes';
    if (nombreNormalizado.includes('miercoles') || nombreNormalizado.includes('miércoles') || nombreNormalizado.includes('mierco')) return 'Miércoles';
    if (nombreNormalizado.includes('jueves')) return 'Jueves';
    if (nombreNormalizado.includes('viernes')) return 'Viernes';
    
    // Si no coincide, devolver el nombre original capitalizado
    return nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase();
}

// Importar alumnos a localStorage
function importarAlumnos(alumnos, omitidas) {
    omitidas = omitidas || 0;
    const detalleOmitidas = omitidas > 0
        ? ` Se omitirán ${omitidas} fila(s) sin Apellido o Nombre.`
        : '';

    mostrarModal(
        'Confirmar importación',
        `Se importarán ${alumnos.length} alumnos al día ${diaSeleccionado}.${detalleOmitidas} ¿Deseas continuar?`,
        () => {
            // Obtener los días que están en el Excel
            const diasEnExcel = [...new Set(alumnos.map(a => a.dia_semana))];

            (async () => {
                try {
                    // Borrar en la nube solo los alumnos de los días presentes en el Excel
                    await DB.eliminarAlumnosPorDia(diasEnExcel);
                    // Insertar los nuevos alumnos y recuperar sus ids asignados
                    const creados = await DB.insertarAlumnos(alumnos);

                    // Reflejar en memoria: quitar los días reemplazados y sumar los creados
                    alumnosData = alumnosData.filter(a => !diasEnExcel.includes(a.dia_semana));
                    alumnosData = alumnosData.concat(creados);
                    // Quitar de memoria la asistencia de alumnos que ya no existen
                    const idsVigentes = new Set(alumnosData.map(a => a.id));
                    registrosAsistencia = registrosAsistencia.filter(r => idsVigentes.has(r.alumno_id));

                    if (diaSeleccionado) {
                        cargarAlumnos(diaSeleccionado);
                    }

                    setTimeout(() => {
                        mostrarModal(
                            'Importación exitosa',
                            `Se importaron ${alumnos.length} alumnos exitosamente.${detalleOmitidas}`
                        );
                    }, 0);
                } catch (e) {
                    console.error('Error al importar:', e);
                    mostrarModal('Error', 'No se pudo completar la importación en la nube. Revisá la conexión e intentá de nuevo.');
                }
            })();
        }
    );
}

// Actualizar estadísticas
function actualizarEstadisticas() {
    actualizarEstadisticasDelDia();
}
