// ============================================================
//  CONFIGURACIÓN DE SUPABASE
//  Completá estos dos valores UNA sola vez con los de tu proyecto.
//  Supabase -> Project Settings -> API:
//    - "Project URL"            -> SUPABASE_URL
//    - "anon public" (API Key)  -> SUPABASE_ANON_KEY
//
//  IMPORTANTE: este archivo NO se reemplaza cuando actualizamos el resto
//  de la app, así que tus credenciales quedan guardadas acá y no se pierden.
// ============================================================

        const SUPABASE_URL = 'https://ifnvndqudynyngeuiytd.supabase.co';

        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmbnZuZHF1ZHlueW5nZXVpeXRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjY2MzIsImV4cCI6MjA5NTY0MjYzMn0.s7t8X9GHk-VqHIP9g7XcHgXtSY344ygiwVDGyZkwvnI';


// Crear el cliente (queda disponible como window.supabaseClient)
if (typeof supabase === 'undefined' || !supabase.createClient) {
    console.error('La librería de Supabase no cargó. Revisá tu conexión a internet o un bloqueador de anuncios que esté bloqueando cdn.jsdelivr.net.');
} else if (!SUPABASE_URL || SUPABASE_URL.indexOf('TU-PROYECTO') !== -1 ||
           !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.indexOf('TU-CLAVE') !== -1) {
    console.error('Faltan tus credenciales reales en config.js (SUPABASE_URL y SUPABASE_ANON_KEY).');
} else {
    window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
