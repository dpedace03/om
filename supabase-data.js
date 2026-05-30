// ============================================================
//  Capa de datos: todas las operaciones contra Supabase.
//  El resto de la app (script.js) usa estas funciones en lugar
//  de localStorage. Si más adelante cambiás de base, solo se
//  toca este archivo.
// ============================================================

// Atajo al cliente creado en index.html (window.supabaseClient)
function _sb() {
    if (!window.supabaseClient) {
        throw new Error('Supabase no está configurado. Revisá SUPABASE_URL y SUPABASE_ANON_KEY en index.html.');
    }
    return window.supabaseClient;
}

const DB = {
    // ---------- Cargar todo (alumnos + asistencia) ----------
    async cargarTodo() {
        const { data: alumnos, error: e1 } = await _sb()
            .from('alumnos')
            .select('*')
            .order('apellido', { ascending: true });
        if (e1) throw e1;

        const { data: asis, error: e2 } = await _sb()
            .from('asistencia')
            .select('*');
        if (e2) throw e2;

        // Mapear columnas de la base (snake_case) al formato que usa la app
        const registros = (asis || []).map(r => ({
            alumno_id: r.alumno_id,
            fecha: r.fecha,
            presente: r.presente,
            marcadoPor: r.marcado_por || '',
            marcadoEn: r.marcado_en || null
        }));

        return { alumnos: alumnos || [], registros };
    },

    // ---------- Insertar un alumno (devuelve el id asignado) ----------
    async insertarAlumno(al) {
        const { data, error } = await _sb()
            .from('alumnos')
            .insert({
                apellido: al.apellido,
                nombre: al.nombre,
                programa: al.programa || '',
                sala: al.sala || '',
                dia_semana: al.dia_semana
            })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // ---------- Insertar varios alumnos (devuelve filas con ids) ----------
    async insertarAlumnos(lista) {
        if (!lista || lista.length === 0) return [];
        const filas = lista.map(a => ({
            apellido: a.apellido,
            nombre: a.nombre,
            programa: a.programa || '',
            sala: a.sala || '',
            dia_semana: a.dia_semana
        }));
        const { data, error } = await _sb()
            .from('alumnos')
            .insert(filas)
            .select();
        if (error) throw error;
        return data || [];
    },

    // ---------- Actualizar datos de un alumno (apellido, nombre, programa, sala) ----------
    async actualizarAlumno(id, campos) {
        const { error } = await _sb().from('alumnos').update({
            apellido: campos.apellido,
            nombre: campos.nombre,
            programa: campos.programa || '',
            sala: campos.sala || ''
        }).eq('id', id);
        if (error) throw error;
    },

    // ---------- Eliminar un alumno (borra primero su asistencia, por si no hay cascada) ----------
    async eliminarAlumno(id) {
        const { error: e1 } = await _sb().from('asistencia').delete().eq('alumno_id', id);
        if (e1) throw e1;
        const { error: e2 } = await _sb().from('alumnos').delete().eq('id', id);
        if (e2) throw e2;
    },

    // ---------- Eliminar todos los alumnos de uno o varios días ----------
    async eliminarAlumnosPorDia(dias) {
        const { error } = await _sb().from('alumnos').delete().in('dia_semana', dias);
        if (error) throw error;
    },

    // ---------- Guardar (upsert) registros de asistencia ----------
    async guardarAsistencia(registros) {
        if (!registros || registros.length === 0) return;
        const filas = registros.map(r => ({
            alumno_id: r.alumno_id,
            fecha: r.fecha,
            presente: r.presente,
            marcado_por: r.marcadoPor || null,
            marcado_en: r.marcadoEn || null
        }));
        const { error } = await _sb()
            .from('asistencia')
            .upsert(filas, { onConflict: 'alumno_id,fecha' });
        if (error) throw error;
    },

    // ---------- Borrar toda la asistencia de una fecha (blanqueo del día) ----------
    async borrarAsistenciaDeFecha(fecha) {
        const { error } = await _sb().from('asistencia').delete().eq('fecha', fecha);
        if (error) throw error;
    },

    // ---------- Usuarios (lista de nombres para autocompletar) ----------
    async listarUsuarios() {
        const { data, error } = await _sb()
            .from('usuarios')
            .select('nombre')
            .order('nombre', { ascending: true });
        if (error) throw error;
        return (data || []).map(u => u.nombre);
    },

    async agregarUsuario(nombre) {
        if (!nombre) return;
        const { error } = await _sb()
            .from('usuarios')
            .upsert({ nombre }, { onConflict: 'nombre' });
        if (error) throw error;
    },

    // ---------- Restaurar backup: reemplaza TODO remapeando los ids ----------
    // El backup viejo (de localStorage) trae ids locales; Supabase asigna
    // ids nuevos, así que hay que volver a vincular la asistencia.
    async reemplazarTodo(alumnos, registros, usuarios) {
        // 1) Vaciar tablas (asistencia primero por la relación)
        const { error: ea } = await _sb().from('asistencia').delete().gte('id', 0);
        if (ea) throw ea;
        const { error: eb } = await _sb().from('alumnos').delete().gte('id', 0);
        if (eb) throw eb;

        // 2) Insertar alumnos y construir mapa idViejo -> idNuevo
        const mapa = {};
        for (const a of (alumnos || [])) {
            const creado = await this.insertarAlumno(a);
            mapa[a.id] = creado.id;
        }

        // 3) Insertar asistencia con los ids remapeados
        const filas = (registros || [])
            .filter(r => mapa[r.alumno_id] != null)
            .map(r => ({
                alumno_id: mapa[r.alumno_id],
                fecha: r.fecha,
                presente: r.presente,
                marcado_por: r.marcadoPor || null,
                marcado_en: r.marcadoEn || null
            }));
        if (filas.length) {
            const { error: ec } = await _sb()
                .from('asistencia')
                .upsert(filas, { onConflict: 'alumno_id,fecha' });
            if (ec) throw ec;
        }

        // 4) Usuarios
        if (Array.isArray(usuarios)) {
            for (const n of usuarios) {
                try { await this.agregarUsuario(n); } catch (e) { /* ignorar duplicados */ }
            }
        }
    }
};

window.DB = DB;
