-- ============================================================
--  OtroMundo - Asistencias :: SEGURIDAD
--  Cierra la base: solo usuarios autenticados pueden leer/escribir.
-- ============================================================
--  Cómo usarlo:
--  1) Supabase -> SQL Editor -> New query
--  2) Pegá TODO este archivo y presioná "Run"
--  (Correlo DESPUÉS de supabase-esquema.sql)
-- ============================================================

-- 1) Quitar las políticas abiertas (acceso público) anteriores
drop policy if exists "acceso publico alumnos"    on public.alumnos;
drop policy if exists "acceso publico asistencia" on public.asistencia;
drop policy if exists "acceso publico usuarios"   on public.usuarios;

-- 2) Asegurar que RLS siga habilitado
alter table public.alumnos    enable row level security;
alter table public.asistencia enable row level security;
alter table public.usuarios   enable row level security;

-- 3) Nuevas políticas: SOLO usuarios autenticados (rol "authenticated")
--    Cualquiera sin iniciar sesión queda sin acceso a los datos.
create policy "alumnos solo autenticados" on public.alumnos
    for all to authenticated
    using (true) with check (true);

create policy "asistencia solo autenticados" on public.asistencia
    for all to authenticated
    using (true) with check (true);

create policy "usuarios solo autenticados" on public.usuarios
    for all to authenticated
    using (true) with check (true);

-- ============================================================
--  CREAR LAS CUENTAS DE TU EQUIPO (desde el panel, no por SQL):
--  Supabase -> Authentication -> Users -> "Add user" -> "Create new user"
--    - Email y contraseña de cada persona.
--    - Marcá "Auto Confirm User" para que pueda entrar sin verificar mail.
--    - (Opcional) En "User Metadata" agregá: { "display_name": "María" }
--      para que se muestre el nombre en vez del email.
--
--  RECOMENDADO: desactivar el registro libre para que nadie cree
--  cuentas solo/a. Supabase -> Authentication -> Providers -> Email
--  -> desactivá "Allow new users to sign up".
-- ============================================================
