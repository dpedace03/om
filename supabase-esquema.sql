-- ============================================================
--  OtroMundo - Asistencias :: Esquema de base de datos Supabase
-- ============================================================
--  Cómo usarlo:
--  1) Entrá a tu proyecto en https://supabase.com
--  2) Menú izquierdo -> "SQL Editor" -> "New query"
--  3) Pegá TODO este archivo y presioná "Run"
-- ============================================================

-- ---------- Tabla de alumnos ----------
create table if not exists public.alumnos (
    id          bigint generated always as identity primary key,
    apellido    text not null,
    nombre      text not null,
    programa    text default '',
    sala        text default '',
    dia_semana  text not null
);

-- ---------- Tabla de asistencia ----------
-- Un registro por alumno y por fecha (no se repite).
create table if not exists public.asistencia (
    id          bigint generated always as identity primary key,
    alumno_id   bigint not null references public.alumnos(id) on delete cascade,
    fecha       date not null,
    presente    smallint not null default 0,
    marcado_por text,
    marcado_en  timestamptz,
    unique (alumno_id, fecha)
);

create index if not exists asistencia_fecha_idx on public.asistencia (fecha);

-- ---------- Tabla de usuarios (solo nombres para el autocompletar) ----------
create table if not exists public.usuarios (
    nombre text primary key
);

-- ============================================================
--  SEGURIDAD (RLS)
--  ATENCIÓN: estas reglas dejan la base ABIERTA: cualquiera con
--  el link puede leer y escribir. Sirve para arrancar con un
--  grupo de confianza. El siguiente paso (cuando quieras) es
--  agregar login real y restringir estas políticas.
-- ============================================================

alter table public.alumnos    enable row level security;
alter table public.asistencia enable row level security;
alter table public.usuarios   enable row level security;

-- Políticas permisivas (acceso público de lectura y escritura)
create policy "acceso publico alumnos"
    on public.alumnos for all
    using (true) with check (true);

create policy "acceso publico asistencia"
    on public.asistencia for all
    using (true) with check (true);

create policy "acceso publico usuarios"
    on public.usuarios for all
    using (true) with check (true);
