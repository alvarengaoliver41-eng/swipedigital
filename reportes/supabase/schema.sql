-- swipe digital · reportes de clientes
-- Pegar completo en Supabase → SQL Editor → Run. Se puede correr más de una vez.

-- Clientes: cada uno con su cuenta de Meta y un código secreto para su link de reporte.
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  meta_ad_account_id text not null check (meta_ad_account_id ~ '^(act_)?[0-9]{5,25}$'),
  tipo text not null default 'mensajes' check (tipo in ('mensajes', 'ventas')),
  logo_url text,
  activo boolean not null default true,
  creado timestamptz not null default now()
);

-- Ventas por WhatsApp, una fila por cliente y día (lo que pasan los vendedores al cierre).
create table if not exists public.ventas_dia (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  fecha date not null,
  ventas integer not null check (ventas >= 0),
  monto bigint not null check (monto >= 0),
  maximo bigint check (maximo >= 0),
  nota text check (char_length(nota) <= 200),
  actualizado timestamptz not null default now(),
  actualizado_por uuid default auth.uid(),
  primary key (cliente_id, fecha)
);

-- Meta de ventas de cada mes.
create table if not exists public.metas (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  mes text not null check (mes ~ '^[0-9]{4}-[0-9]{2}$'),
  monto bigint not null check (monto > 0),
  ventas integer check (ventas >= 0),
  actualizado timestamptz not null default now(),
  primary key (cliente_id, mes)
);

-- Quiénes son del equipo: solo estas personas pueden ver y cargar datos desde el panel.
create table if not exists public.equipo (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text
);

create or replace function public.es_equipo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.equipo where user_id = auth.uid());
$$;

alter table public.clientes enable row level security;
alter table public.ventas_dia enable row level security;
alter table public.metas enable row level security;
alter table public.equipo enable row level security;

drop policy if exists "equipo gestiona clientes" on public.clientes;
create policy "equipo gestiona clientes" on public.clientes for all to authenticated using (public.es_equipo()) with check (public.es_equipo());

drop policy if exists "equipo gestiona ventas" on public.ventas_dia;
create policy "equipo gestiona ventas" on public.ventas_dia for all to authenticated using (public.es_equipo()) with check (public.es_equipo());

drop policy if exists "equipo gestiona metas" on public.metas;
create policy "equipo gestiona metas" on public.metas for all to authenticated using (public.es_equipo()) with check (public.es_equipo());

drop policy if exists "cada uno se ve a sí mismo" on public.equipo;
create policy "cada uno se ve a sí mismo" on public.equipo for select to authenticated using (user_id = auth.uid());

-- Los reportes públicos leen la base desde el servidor con la clave de servicio,
-- así que los visitantes anónimos no tienen ningún permiso directo.

-- Para sumar a alguien al equipo: crear el usuario en Authentication → Users y después correr
--   insert into public.equipo (user_id, nombre) select id, 'Nombre' from auth.users where email = 'correo@swipedigital.com';

-- Clientes iniciales (se pueden cambiar o agregar más desde el panel).
insert into public.clientes (nombre, slug, meta_ad_account_id, tipo, logo_url) values
  ('VECAB', 'vecab', '1667857001714420', 'mensajes', '/clientes/vecab.svg'),
  ('A un Click', 'a-un-click', '1608199064350567', 'ventas', null)
on conflict (slug) do nothing;

-- Logos de clientes: se suben desde el panel y se ven públicamente en los reportes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "equipo ve logos" on storage.objects;
create policy "equipo ve logos" on storage.objects for select to authenticated using (bucket_id = 'logos' and public.es_equipo());
drop policy if exists "equipo sube logos" on storage.objects;
create policy "equipo sube logos" on storage.objects for insert to authenticated with check (bucket_id = 'logos' and public.es_equipo());
drop policy if exists "equipo cambia logos" on storage.objects;
create policy "equipo cambia logos" on storage.objects for update to authenticated using (bucket_id = 'logos' and public.es_equipo()) with check (bucket_id = 'logos' and public.es_equipo());
drop policy if exists "equipo borra logos" on storage.objects;
create policy "equipo borra logos" on storage.objects for delete to authenticated using (bucket_id = 'logos' and public.es_equipo());

-- Lectura del equipo: lo que hicimos, lo que aprendimos y los próximos pasos, una por cliente y mes.
create table if not exists public.notas (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  mes text not null check (mes ~ '^[0-9]{4}-[0-9]{2}$'),
  hicimos_titulo text check (char_length(hicimos_titulo) <= 90),
  hicimos_texto text check (char_length(hicimos_texto) <= 600),
  aprendimos_titulo text check (char_length(aprendimos_titulo) <= 90),
  aprendimos_texto text check (char_length(aprendimos_texto) <= 600),
  proximos_titulo text check (char_length(proximos_titulo) <= 90),
  proximos_texto text check (char_length(proximos_texto) <= 600),
  actualizado timestamptz not null default now(),
  primary key (cliente_id, mes)
);
alter table public.notas enable row level security;
drop policy if exists "equipo gestiona notas" on public.notas;
create policy "equipo gestiona notas" on public.notas for all to authenticated using (public.es_equipo()) with check (public.es_equipo());
