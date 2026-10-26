-- =============================================================================
--  INSTALACIÓN COMPLETA del Almacén FIQ: pega TODO este archivo en Supabase →
--  SQL Editor → New query y pulsa Run. Se ejecuta UNA sola vez.
-- =============================================================================

-- =============================================================================
--  Almacén de laboratorio de la facultad
--  Esquema PostgreSQL 15+ para Supabase (auth.users, auth.uid(), RLS)
--
--  Orden del archivo
--    0. Tipos y utilidades
--    1. Personas: perfiles (usuarios), áreas y docentes
--    2. Catálogos: ubicaciones, clasificación química, grupos de almacenamiento
--    3. Inventario: artículos, lotes y kardex (movimientos inmutables)
--    4. Semestres y prácticas: lo que pide cada docente
--    5. Entregas a docentes (consumo definitivo)
--    6. Alumnos y préstamos (solo vidrio, equipos y materiales)
--    7. Vistas
--    8. Seguridad: permisos y Row Level Security por rol
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Tipos y utilidades
-- -----------------------------------------------------------------------------
create type rol_usuario     as enum ('admin', 'almacen', 'docente');
create type tipo_articulo   as enum ('reactivo', 'vidrio', 'equipo', 'material');
create type tipo_movimiento as enum ('ingreso', 'entrega_docente', 'baja', 'reposicion', 'ajuste_positivo', 'ajuste_negativo');
create type estado_practica as enum ('borrador', 'enviada');
create type estado_prestamo as enum ('abierto', 'cerrado');

-- Fecha de hoy en Perú (el servidor de Supabase trabaja en UTC)
create function hoy() returns date language sql stable as $$
  select (now() at time zone 'America/Lima')::date
$$;

-- -----------------------------------------------------------------------------
-- 1. Personas
-- -----------------------------------------------------------------------------
-- Áreas académicas: Química general, Química orgánica, Microbiología...
create table areas (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique,
  activa  boolean not null default true
);

-- Cada usuario de Supabase Auth con su rol
create table perfiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  nombre    text not null,
  rol       rol_usuario not null,
  activo    boolean not null default true,
  creado    timestamptz not null default now()
);

-- Docentes: existen aunque no tengan cuenta (almacén registra sus prácticas).
-- Si se le da cuenta, perfil_id lo enlaza y puede capturar sus propias prácticas.
create table docentes (
  id         uuid primary key default gen_random_uuid(),
  nombres    text not null,
  area_id    uuid references areas(id),
  email      text,
  telefono   text,
  perfil_id  uuid unique references perfiles(id) on delete set null,
  activo     boolean not null default true,
  creado     timestamptz not null default now()
);

-- Helpers de seguridad (security definer para no recursar en RLS)
create function rol_actual() returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid() and activo
$$;

create function tiene_rol(variadic roles rol_usuario[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol = any(roles) from perfiles where id = auth.uid() and activo), false)
$$;

create function es_personal() returns boolean
language sql stable security definer set search_path = public as $$
  select tiene_rol('admin', 'almacen')
$$;

-- Ficha de docente del usuario actual (null si no es docente)
create function mi_docente() returns uuid
language sql stable security definer set search_path = public as $$
  select d.id from docentes d join perfiles p on p.id = d.perfil_id
   where p.id = auth.uid() and p.activo and p.rol = 'docente'
$$;

-- -----------------------------------------------------------------------------
-- 2. Catálogos
-- -----------------------------------------------------------------------------
-- Estantes, armarios y gabinetes del almacén
create table ubicaciones (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,          -- ej. "Armario de ácidos", "Estante V-2"
  descripcion text,
  activa      boolean not null default true
);

-- Grupos de compatibilidad para almacenar: qué no debe guardarse junto
create table grupos_almacenamiento (
  codigo        text primary key,             -- A, AO, B, I, O, T, R, G
  nombre        text not null,
  color         text not null,                -- color de la etiqueta del estante
  indicaciones  text,
  incompatibles text[] not null default '{}'  -- códigos de los grupos que no van juntos
);

-- Clasificación química en dos niveles: familia → subfamilia
-- (Sales → Cloruros, Sulfatos, Nitratos...). Solo para reactivos.
create table familias (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  padre_id    uuid references familias(id) on delete restrict,
  grupo       text references grupos_almacenamiento(codigo),   -- grupo sugerido al crear un reactivo
  descripcion text,
  orden       int not null default 100,
  unique (padre_id, nombre)
);
create unique index familias_raiz_uk on familias (nombre) where padre_id is null;

create function fn_familia_dos_niveles() returns trigger language plpgsql as $$
begin
  if new.padre_id is not null and exists (select 1 from familias where id = new.padre_id and padre_id is not null) then
    raise exception 'La clasificación tiene dos niveles: elige una familia principal como superior.';
  end if;
  return new;
end $$;
create trigger trg_familia_dos_niveles before insert or update on familias
  for each row execute function fn_familia_dos_niveles();

-- -----------------------------------------------------------------------------
-- 3. Inventario
-- -----------------------------------------------------------------------------
create sequence seq_reactivo;
create sequence seq_vidrio;
create sequence seq_equipo;
create sequence seq_material;

create table articulos (
  id               uuid primary key default gen_random_uuid(),
  codigo           text not null unique,                 -- R-0001, V-0001, E-0001, M-0001 (automático)
  codigo_barras    text unique,
  tipo             tipo_articulo not null,
  nombre           text not null,
  -- Reactivos
  familia_id       uuid references familias(id),
  formula          text,                                 -- NaCl, H2SO4
  cas              text,                                 -- número CAS, ej. 7647-14-5
  grado            text,                                 -- p.a., ACS, técnico, HPLC
  concentracion    text,                                 -- 37 %, 98 %, 0.1 N
  pictogramas      text[] not null default '{}',         -- SGA: GHS01 … GHS09
  palabra_advertencia text check (palabra_advertencia in ('Peligro', 'Atención')),
  grupo            text references grupos_almacenamiento(codigo),
  fiscalizado      boolean not null default false,       -- insumo químico fiscalizado (SUNAT / IQBF)
  -- Vidrio, equipos y materiales
  capacidad        text,                                 -- 250 mL, 0-200 °C
  material         text,                                 -- borosilicato, polipropileno
  modelo           text,
  serie            text,                                 -- equipos: número de serie o patrimonio
  prestable        boolean not null default false,       -- se presta a alumnos
  -- Comunes
  marca            text,
  presentacion     text,                                 -- frasco 500 g, caja x 12
  unidad           text not null default 'unidad'
                   check (unidad in ('g', 'kg', 'mg', 'mL', 'L', 'unidad', 'par', 'caja', 'paquete', 'rollo')),
  stock_minimo     numeric(14,3) not null default 0 check (stock_minimo >= 0),
  ubicacion_id     uuid references ubicaciones(id),
  notas            text,
  activo           boolean not null default true,
  -- Saldos: los mantiene el sistema, nadie los escribe a mano
  stock            numeric(14,3) not null default 0 check (stock >= 0),     -- lo que hay en el almacén
  prestado         numeric(14,3) not null default 0 check (prestado >= 0),  -- en manos de alumnos
  creado           timestamptz not null default now(),
  constraint reactivo_no_prestable check (tipo <> 'reactivo' or not prestable),
  constraint prestado_menor_stock check (prestado <= stock)
);
create index articulos_tipo_idx on articulos (tipo, nombre);
create index articulos_familia_idx on articulos (familia_id);

create function fn_articulo_codigo() returns trigger language plpgsql as $$
begin
  if new.codigo is null or btrim(new.codigo) = '' then
    new.codigo := case new.tipo
      when 'reactivo' then 'R-' || lpad(nextval('seq_reactivo')::text, 4, '0')
      when 'vidrio'   then 'V-' || lpad(nextval('seq_vidrio')::text, 4, '0')
      when 'equipo'   then 'E-' || lpad(nextval('seq_equipo')::text, 4, '0')
      else                 'M-' || lpad(nextval('seq_material')::text, 4, '0')
    end;
  end if;
  new.codigo := upper(btrim(new.codigo));
  new.codigo_barras := nullif(btrim(new.codigo_barras), '');
  if new.tipo = 'reactivo' then
    new.prestable := false;
    if new.grupo is null and new.familia_id is not null then
      select coalesce(f.grupo, p.grupo) into new.grupo
        from familias f left join familias p on p.id = f.padre_id where f.id = new.familia_id;
    end if;
  end if;
  return new;
end $$;
create trigger trg_articulo_codigo before insert or update on articulos
  for each row execute function fn_articulo_codigo();

-- Lotes de reactivos con su vencimiento
create table lotes (
  id           uuid primary key default gen_random_uuid(),
  articulo_id  uuid not null references articulos(id) on delete cascade,
  lote         text not null,
  vencimiento  date,
  cantidad     numeric(14,3) not null default 0 check (cantidad >= 0),   -- la mantiene el sistema
  creado       timestamptz not null default now(),
  unique (articulo_id, lote)
);

-- Kardex: cada entrada o salida. No se edita ni se borra; un error se corrige con un ajuste.
create table movimientos (
  id               uuid primary key default gen_random_uuid(),
  articulo_id      uuid not null references articulos(id),
  lote_id          uuid references lotes(id),
  tipo             tipo_movimiento not null,
  cantidad         numeric(14,3) not null check (cantidad > 0),
  signo            smallint not null default 1,          -- +1 entra, -1 sale (lo pone el sistema)
  saldo            numeric(14,3) not null default 0,     -- stock después del movimiento
  documento        text,                                 -- guía, factura, n.º de entrega
  nota             text,
  entrega_id       uuid,                                 -- FK abajo
  prestamo_item_id uuid,                                 -- FK abajo (bajas y reposiciones de préstamos)
  fecha            timestamptz not null default now(),
  usuario_id       uuid references perfiles(id) default auth.uid()
);
create index movimientos_articulo_idx on movimientos (articulo_id, fecha);
create index movimientos_fecha_idx on movimientos (fecha);

create function fn_aplicar_movimiento() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a articulos%rowtype;
  l lotes%rowtype;
  v_en_lotes numeric;
begin
  new.signo := case when new.tipo in ('ingreso', 'reposicion', 'ajuste_positivo') then 1 else -1 end;
  select * into a from articulos where id = new.articulo_id for update;
  if not found then raise exception 'El artículo no existe.'; end if;

  if new.lote_id is not null then
    select * into l from lotes where id = new.lote_id for update;
    if l.articulo_id is distinct from new.articulo_id then
      raise exception 'El lote no corresponde a "%".', a.nombre;
    end if;
    if new.signo < 0 and l.cantidad < new.cantidad then
      raise exception 'El lote % de "%" solo tiene % %.', l.lote, a.nombre, trim_scale(l.cantidad), a.unidad;
    end if;
    update lotes set cantidad = cantidad + new.signo * new.cantidad where id = l.id;
  elsif new.signo < 0 then
    -- Sin lote solo se puede sacar lo que no está asignado a ningún lote
    select coalesce(sum(cantidad), 0) into v_en_lotes from lotes where articulo_id = a.id;
    if a.stock - a.prestado - v_en_lotes < new.cantidad then
      if v_en_lotes > 0 then
        raise exception 'Elige el lote de "%" del que sale la cantidad.', a.nombre;
      end if;
      raise exception 'No alcanza "%": hay % % disponibles y se pidió %.',
        a.nombre, trim_scale(a.stock - a.prestado), a.unidad, trim_scale(new.cantidad);
    end if;
  end if;

  if new.signo < 0 and a.stock - a.prestado < new.cantidad then
    raise exception 'No alcanza "%": hay % % disponibles y se pidió %.',
      a.nombre, trim_scale(a.stock - a.prestado), a.unidad, trim_scale(new.cantidad);
  end if;

  update articulos set stock = stock + new.signo * new.cantidad where id = a.id;
  new.saldo := a.stock + new.signo * new.cantidad;
  new.fecha := coalesce(new.fecha, now());
  return new;
end $$;
create trigger trg_aplicar_movimiento before insert on movimientos
  for each row execute function fn_aplicar_movimiento();

create function fn_bloquear_cambio() returns trigger language plpgsql as $$
begin
  raise exception 'El kardex no se modifica. Registra un ajuste para corregir.';
end $$;
create trigger trg_movimientos_inmutables before update or delete on movimientos
  for each row execute function fn_bloquear_cambio();

-- Ingreso al almacén (compra, donación, inventario inicial). Con lote, lo crea si no existe.
create function registrar_ingreso(p_articulo uuid, p_cantidad numeric, p_lote text default null,
                                  p_vencimiento date default null, p_documento text default null,
                                  p_nota text default null, p_tipo tipo_movimiento default 'ingreso')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_lote uuid; v_id uuid;
begin
  if not es_personal() then raise exception 'Solo el personal de almacén registra ingresos.'; end if;
  if p_tipo not in ('ingreso', 'ajuste_positivo') then raise exception 'Tipo de ingreso no válido.'; end if;
  if coalesce(p_cantidad, 0) <= 0 then raise exception 'La cantidad debe ser mayor que cero.'; end if;
  if nullif(btrim(p_lote), '') is not null then
    insert into lotes (articulo_id, lote, vencimiento) values (p_articulo, btrim(p_lote), p_vencimiento)
    on conflict (articulo_id, lote) do update set vencimiento = coalesce(excluded.vencimiento, lotes.vencimiento)
    returning id into v_lote;
  end if;
  insert into movimientos (articulo_id, lote_id, tipo, cantidad, documento, nota)
  values (p_articulo, v_lote, p_tipo, p_cantidad, nullif(btrim(p_documento), ''), nullif(btrim(p_nota), ''))
  returning id into v_id;
  return v_id;
end $$;

-- Salida que toma primero del lote que vence antes (FEFO) y nunca de lotes vencidos.
create function salida_fefo(p_articulo uuid, p_cantidad numeric, p_tipo tipo_movimiento,
                            p_documento text, p_nota text, p_entrega uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  a articulos%rowtype;
  r record;
  v_resto numeric := p_cantidad;
  v_tomar numeric;
  v_en_lotes numeric;
  v_vencido numeric;
  v_util numeric;
begin
  select * into a from articulos where id = p_articulo for update;
  select coalesce(sum(cantidad), 0),
         coalesce(sum(cantidad) filter (where vencimiento < hoy()), 0)
    into v_en_lotes, v_vencido
    from lotes where articulo_id = p_articulo;
  v_util := a.stock - a.prestado - v_vencido;
  if v_util < p_cantidad then
    if v_vencido > 0 then
      raise exception 'No alcanza "%": hay % % útiles (otros % % están vencidos) y se pidió %.',
        a.nombre, trim_scale(v_util), a.unidad, trim_scale(v_vencido), a.unidad, trim_scale(p_cantidad);
    end if;
    raise exception 'No alcanza "%": hay % % disponibles y se pidió %.',
      a.nombre, trim_scale(v_util), a.unidad, trim_scale(p_cantidad);
  end if;
  for r in select id, cantidad from lotes
            where articulo_id = p_articulo and cantidad > 0 and (vencimiento is null or vencimiento >= hoy())
            order by vencimiento nulls last, creado
  loop
    exit when v_resto <= 0;
    v_tomar := least(r.cantidad, v_resto);
    insert into movimientos (articulo_id, lote_id, tipo, cantidad, documento, nota, entrega_id)
    values (p_articulo, r.id, p_tipo, v_tomar, p_documento, p_nota, p_entrega);
    v_resto := v_resto - v_tomar;
  end loop;
  if v_resto > 0 then
    insert into movimientos (articulo_id, tipo, cantidad, documento, nota, entrega_id)
    values (p_articulo, p_tipo, v_resto, p_documento, p_nota, p_entrega);
  end if;
end $$;
revoke execute on function salida_fefo(uuid, numeric, tipo_movimiento, text, text, uuid) from public, anon, authenticated;

-- Baja (rotura, vencimiento, pérdida) o ajuste negativo hecho por almacén
create function registrar_salida(p_articulo uuid, p_cantidad numeric, p_tipo tipo_movimiento,
                                 p_lote uuid default null, p_documento text default null, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_personal() then raise exception 'Solo el personal de almacén registra salidas.'; end if;
  if p_tipo not in ('baja', 'ajuste_negativo') then raise exception 'Tipo de salida no válido.'; end if;
  if coalesce(p_cantidad, 0) <= 0 then raise exception 'La cantidad debe ser mayor que cero.'; end if;
  if p_lote is not null then
    insert into movimientos (articulo_id, lote_id, tipo, cantidad, documento, nota)
    values (p_articulo, p_lote, p_tipo, p_cantidad, nullif(btrim(p_documento), ''), nullif(btrim(p_nota), ''));
  elsif p_tipo = 'baja' and exists (select 1 from lotes where articulo_id = p_articulo and cantidad > 0) then
    raise exception 'Elige el lote que se da de baja.';
  else
    perform salida_fefo(p_articulo, p_cantidad, p_tipo, nullif(btrim(p_documento), ''), nullif(btrim(p_nota), ''));
  end if;
end $$;

-- Búsqueda exacta por código interno o código de barras (lector o cámara)
create function articulo_por_codigo(p_codigo text) returns setof articulos
language sql stable as $$
  select * from articulos
   where activo and (codigo = upper(btrim(p_codigo)) or codigo_barras = btrim(p_codigo))
   limit 1
$$;

-- -----------------------------------------------------------------------------
-- 4. Semestres y prácticas
-- -----------------------------------------------------------------------------
create table semestres (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,                 -- 2026-II
  inicio      date,
  fin         date,
  margen_pct  numeric(5,2) not null default 0 check (margen_pct between 0 and 100),  -- extra por derrames o repeticiones
  activo      boolean not null default false,
  creado      timestamptz not null default now()
);
create unique index semestres_un_activo on semestres (activo) where activo;

-- Una práctica de laboratorio: cuántas secciones (horarios) y cuántos grupos (mesas) por sección
create table practicas (
  id                  uuid primary key default gen_random_uuid(),
  semestre_id         uuid not null references semestres(id),
  docente_id          uuid not null references docentes(id),
  area_id             uuid references areas(id),
  curso               text not null,
  numero              int,                           -- práctica n.º
  nombre              text not null,
  fecha               date,                          -- fecha prevista
  secciones           int not null default 1 check (secciones > 0),
  grupos_por_seccion  int not null default 1 check (grupos_por_seccion > 0),
  estado              estado_practica not null default 'borrador',
  notas               text,
  creado              timestamptz not null default now()
);
create index practicas_semestre_idx on practicas (semestre_id, docente_id);

create function fn_practica_area() returns trigger language plpgsql as $$
begin
  if new.area_id is null then
    select area_id into new.area_id from docentes where id = new.docente_id;
  end if;
  return new;
end $$;
create trigger trg_practica_area before insert on practicas
  for each row execute function fn_practica_area();

-- Lo que necesita la práctica: por grupo (se multiplica por todos los grupos) o por sección
create table practica_items (
  id           uuid primary key default gen_random_uuid(),
  practica_id  uuid not null references practicas(id) on delete cascade,
  articulo_id  uuid not null references articulos(id),
  cantidad     numeric(14,3) not null check (cantidad > 0),
  por          text not null default 'grupo' check (por in ('grupo', 'seccion')),
  nota         text,
  unique (practica_id, articulo_id)
);

-- -----------------------------------------------------------------------------
-- 5. Entregas a docentes: lo entregado ya no vuelve al almacén
-- -----------------------------------------------------------------------------
create sequence seq_entrega;
create table entregas (
  id             uuid primary key default gen_random_uuid(),
  numero         int not null unique default nextval('seq_entrega'),
  semestre_id    uuid not null references semestres(id),
  practica_id    uuid references practicas(id) on delete restrict,
  docente_id     uuid not null references docentes(id),
  recibe         text,                    -- quién recogió (docente, jefe de práctica)
  nota           text,
  fecha          timestamptz not null default now(),
  registrado_por uuid references perfiles(id) default auth.uid()
);
create index entregas_semestre_idx on entregas (semestre_id, docente_id);

create table entrega_items (
  id           uuid primary key default gen_random_uuid(),
  entrega_id   uuid not null references entregas(id) on delete cascade,
  articulo_id  uuid not null references articulos(id),
  cantidad     numeric(14,3) not null check (cantidad > 0),
  unique (entrega_id, articulo_id)
);
alter table movimientos add constraint movimientos_entrega_fk foreign key (entrega_id) references entregas(id);

-- Registra la entrega completa y descuenta el stock en una sola operación.
-- p_items: [{"articulo_id": "...", "cantidad": 12.5}, ...]
create function registrar_entrega(p_docente uuid, p_practica uuid, p_items jsonb,
                                  p_recibe text default null, p_nota text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_numero int;
  v_semestre uuid;
  v_docente uuid := p_docente;
  v_item jsonb;
  v_cant numeric;
  v_n int := 0;
begin
  if not es_personal() then raise exception 'Solo el personal de almacén registra entregas.'; end if;
  if p_practica is not null then
    select semestre_id, docente_id into v_semestre, v_docente from practicas where id = p_practica;
    if not found then raise exception 'La práctica no existe.'; end if;
  else
    select id into v_semestre from semestres where activo;
    if v_semestre is null then raise exception 'Activa un semestre antes de registrar entregas.'; end if;
  end if;
  if v_docente is null then raise exception 'Elige el docente que recibe.'; end if;

  insert into entregas (semestre_id, practica_id, docente_id, recibe, nota)
  values (v_semestre, p_practica, v_docente, nullif(btrim(p_recibe), ''), nullif(btrim(p_nota), ''))
  returning id, numero into v_id, v_numero;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_cant := nullif(v_item ->> 'cantidad', '')::numeric;
    continue when v_cant is null or v_cant <= 0;
    insert into entrega_items (entrega_id, articulo_id, cantidad)
    values (v_id, (v_item ->> 'articulo_id')::uuid, v_cant);
    perform salida_fefo((v_item ->> 'articulo_id')::uuid, v_cant, 'entrega_docente', 'Entrega N.º ' || v_numero, null, v_id);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Escribe al menos una cantidad a entregar.'; end if;
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Alumnos y préstamos
-- -----------------------------------------------------------------------------
create table alumnos (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null unique,           -- código universitario
  nombres    text not null,
  dni        text,
  escuela    text,                           -- escuela profesional / carrera
  ciclo      text,
  telefono   text,
  email      text,
  notas      text,
  activo     boolean not null default true,
  creado     timestamptz not null default now()
);

create sequence seq_prestamo;
create table prestamos (
  id             uuid primary key default gen_random_uuid(),
  numero         int not null unique default nextval('seq_prestamo'),
  alumno_id      uuid not null references alumnos(id),
  fecha          timestamptz not null default now(),
  fecha_limite   date not null,
  motivo         text,                       -- curso o práctica
  docente_id     uuid references docentes(id),
  estado         estado_prestamo not null default 'abierto',
  cerrado_en     timestamptz,
  nota           text,
  registrado_por uuid references perfiles(id) default auth.uid()
);
create index prestamos_alumno_idx on prestamos (alumno_id, estado);

-- devuelto + roto + perdido nunca supera lo prestado; repuesto = lo que el alumno ya repuso
create table prestamo_items (
  id           uuid primary key default gen_random_uuid(),
  prestamo_id  uuid not null references prestamos(id) on delete cascade,
  articulo_id  uuid not null references articulos(id),
  cantidad     numeric(14,3) not null check (cantidad > 0),
  devuelto     numeric(14,3) not null default 0 check (devuelto >= 0),
  roto         numeric(14,3) not null default 0 check (roto >= 0),
  perdido      numeric(14,3) not null default 0 check (perdido >= 0),
  repuesto     numeric(14,3) not null default 0 check (repuesto >= 0),
  unique (prestamo_id, articulo_id),
  constraint item_cuadra check (devuelto + roto + perdido <= cantidad),
  constraint reposicion_cuadra check (repuesto <= roto + perdido)
);
alter table movimientos add constraint movimientos_prestamo_item_fk foreign key (prestamo_item_id) references prestamo_items(id);

-- Motivo por el que un alumno no puede llevar más material (null = puede)
create function bloqueo_alumno(p_alumno uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from prestamo_items i join prestamos p on p.id = i.prestamo_id
                  where p.alumno_id = p_alumno and i.roto + i.perdido > i.repuesto)
      then 'Tiene material roto o perdido sin reponer.'
    when exists (select 1 from prestamos p where p.alumno_id = p_alumno and p.estado = 'abierto' and p.fecha_limite < hoy())
      then 'Tiene un préstamo vencido sin devolver.'
    when exists (select 1 from alumnos where id = p_alumno and not activo)
      then 'El alumno está desactivado.'
  end
$$;

-- p_items: [{"articulo_id": "...", "cantidad": 2}, ...]
create function registrar_prestamo(p_alumno uuid, p_fecha_limite date, p_items jsonb,
                                   p_motivo text default null, p_docente uuid default null, p_nota text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_bloqueo text;
  v_item jsonb;
  v_cant numeric;
  a articulos%rowtype;
  v_n int := 0;
begin
  if not es_personal() then raise exception 'Solo el personal de almacén registra préstamos.'; end if;
  v_bloqueo := bloqueo_alumno(p_alumno);
  if v_bloqueo is not null then raise exception 'No se puede prestar: %', v_bloqueo; end if;
  if p_fecha_limite is null or p_fecha_limite < hoy() then
    raise exception 'La fecha de devolución debe ser hoy o después.';
  end if;

  insert into prestamos (alumno_id, fecha_limite, motivo, docente_id, nota)
  values (p_alumno, p_fecha_limite, nullif(btrim(p_motivo), ''), p_docente, nullif(btrim(p_nota), ''))
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_cant := nullif(v_item ->> 'cantidad', '')::numeric;
    continue when v_cant is null or v_cant <= 0;
    select * into a from articulos where id = (v_item ->> 'articulo_id')::uuid for update;
    if not found then raise exception 'El artículo no existe.'; end if;
    if a.tipo = 'reactivo' then raise exception 'Los reactivos no se prestan (%).', a.nombre; end if;
    if not a.prestable then raise exception '"%" no está marcado como prestable.', a.nombre; end if;
    if a.stock - a.prestado < v_cant then
      raise exception 'No alcanza "%": hay % disponibles y se pidió %.', a.nombre, trim_scale(a.stock - a.prestado), trim_scale(v_cant);
    end if;
    insert into prestamo_items (prestamo_id, articulo_id, cantidad) values (v_id, a.id, v_cant);
    update articulos set prestado = prestado + v_cant where id = a.id;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Agrega al menos un material al préstamo.'; end if;
  return v_id;
end $$;

-- Devolución de un renglón: lo que vuelve sano regresa a disponible; lo roto o perdido
-- se da de baja del inventario y queda como deuda del alumno hasta que lo reponga.
create function registrar_devolucion(p_item uuid, p_devuelto numeric, p_roto numeric default 0,
                                     p_perdido numeric default 0, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  i prestamo_items%rowtype;
  v_pendiente numeric;
  v_numero int;
  v_sale numeric;
begin
  if not es_personal() then raise exception 'Solo el personal de almacén registra devoluciones.'; end if;
  p_devuelto := coalesce(p_devuelto, 0); p_roto := coalesce(p_roto, 0); p_perdido := coalesce(p_perdido, 0);
  if p_devuelto < 0 or p_roto < 0 or p_perdido < 0 then raise exception 'Las cantidades no pueden ser negativas.'; end if;
  select * into i from prestamo_items where id = p_item for update;
  if not found then raise exception 'El renglón del préstamo no existe.'; end if;
  v_pendiente := i.cantidad - i.devuelto - i.roto - i.perdido;
  if p_devuelto + p_roto + p_perdido = 0 then return; end if;
  if p_devuelto + p_roto + p_perdido > v_pendiente then
    raise exception 'Solo quedan % pendientes de este material.', trim_scale(v_pendiente);
  end if;
  select numero into v_numero from prestamos where id = i.prestamo_id;

  v_sale := p_devuelto + p_roto + p_perdido;
  update articulos set prestado = prestado - v_sale where id = i.articulo_id;
  update prestamo_items set devuelto = devuelto + p_devuelto, roto = roto + p_roto, perdido = perdido + p_perdido
   where id = i.id;
  if p_roto + p_perdido > 0 then
    insert into movimientos (articulo_id, tipo, cantidad, documento, nota, prestamo_item_id)
    values (i.articulo_id, 'baja', p_roto + p_perdido, 'Préstamo N.º ' || v_numero,
            concat_ws(' · ',
              case when p_roto > 0 then 'Roto: ' || trim_scale(p_roto) end,
              case when p_perdido > 0 then 'Perdido: ' || trim_scale(p_perdido) end,
              nullif(btrim(p_nota), '')),
            i.id);
  end if;

  -- Cierra el préstamo cuando ya no queda nada en manos del alumno
  update prestamos p set estado = 'cerrado', cerrado_en = now()
   where p.id = i.prestamo_id and p.estado = 'abierto'
     and not exists (select 1 from prestamo_items x where x.prestamo_id = p.id and x.devuelto + x.roto + x.perdido < x.cantidad);
end $$;

-- El alumno trae el material que rompió o perdió: vuelve a entrar al inventario
create function registrar_reposicion(p_item uuid, p_cantidad numeric, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare i prestamo_items%rowtype; v_numero int;
begin
  if not es_personal() then raise exception 'Solo el personal de almacén registra reposiciones.'; end if;
  select * into i from prestamo_items where id = p_item for update;
  if not found then raise exception 'El renglón del préstamo no existe.'; end if;
  if coalesce(p_cantidad, 0) <= 0 then raise exception 'La cantidad debe ser mayor que cero.'; end if;
  if i.repuesto + p_cantidad > i.roto + i.perdido then
    raise exception 'Solo debe reponer %.', trim_scale(i.roto + i.perdido - i.repuesto);
  end if;
  select numero into v_numero from prestamos where id = i.prestamo_id;
  update prestamo_items set repuesto = repuesto + p_cantidad where id = i.id;
  insert into movimientos (articulo_id, tipo, cantidad, documento, nota, prestamo_item_id)
  values (i.articulo_id, 'reposicion', p_cantidad, 'Préstamo N.º ' || v_numero, nullif(btrim(p_nota), ''), i.id);
end $$;

-- Da más días para devolver un préstamo abierto
create function ampliar_plazo(p_prestamo uuid, p_fecha date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_personal() then raise exception 'Solo el personal de almacén cambia el plazo.'; end if;
  if p_fecha is null or p_fecha < hoy() then raise exception 'La nueva fecha debe ser hoy o después.'; end if;
  update prestamos set fecha_limite = p_fecha where id = p_prestamo and estado = 'abierto';
end $$;

-- -----------------------------------------------------------------------------
-- 7. Vistas (security_invoker: respetan los permisos de quien consulta)
-- -----------------------------------------------------------------------------
create view v_articulos with (security_invoker = true) as
select a.*,
       a.stock - a.prestado                                   as disponible,
       coalesce(l.vencido, 0)                                 as vencido,
       a.stock - a.prestado - coalesce(l.vencido, 0)          as utilizable,
       l.proximo_vencimiento,
       coalesce(fp.nombre, f.nombre)                          as familia,
       case when fp.id is not null then f.nombre end          as subfamilia,
       coalesce(fp.id, f.id)                                  as familia_raiz_id,
       u.nombre                                               as ubicacion,
       case when a.stock <= 0 then 'agotado'
            when a.stock <= a.stock_minimo then 'bajo'
            else 'ok' end                                     as estado_stock
  from articulos a
  left join familias f on f.id = a.familia_id
  left join familias fp on fp.id = f.padre_id
  left join ubicaciones u on u.id = a.ubicacion_id
  left join lateral (
    select sum(cantidad) filter (where vencimiento < hoy()) as vencido,
           min(vencimiento) filter (where cantidad > 0 and vencimiento >= hoy()) as proximo_vencimiento
      from lotes where articulo_id = a.id and cantidad > 0
  ) l on true;

create view v_lotes with (security_invoker = true) as
select l.*, a.nombre, a.codigo, a.unidad, a.formula,
       l.vencimiento - hoy() as dias_para_vencer
  from lotes l join articulos a on a.id = l.articulo_id
 where l.cantidad > 0 and a.activo;

create view v_kardex with (security_invoker = true) as
select m.*, a.codigo, a.nombre, a.unidad, a.tipo as tipo_articulo, l.lote, p.nombre as usuario
  from movimientos m
  join articulos a on a.id = m.articulo_id
  left join lotes l on l.id = m.lote_id
  left join perfiles p on p.id = m.usuario_id;

create view v_practica_items with (security_invoker = true) as
select i.*,
       pr.semestre_id, pr.docente_id,
       i.cantidad * case when i.por = 'grupo' then pr.secciones * pr.grupos_por_seccion else pr.secciones end as total,
       coalesce((select sum(ei.cantidad) from entrega_items ei join entregas e on e.id = ei.entrega_id
                  where e.practica_id = i.practica_id and ei.articulo_id = i.articulo_id), 0) as entregado,
       a.codigo, a.nombre, a.unidad, a.tipo, a.formula, a.utilizable as disponible
  from practica_items i
  join practicas pr on pr.id = i.practica_id
  join v_articulos a on a.id = i.articulo_id;

create view v_practicas with (security_invoker = true) as
select p.*, d.nombres as docente, ar.nombre as area, s.nombre as semestre,
       coalesce(t.items, 0) as items,
       coalesce(t.completos, 0) as items_entregados,
       case when coalesce(t.items, 0) = 0 then 'sin_items'
            when t.completos = t.items then 'entregada'
            when t.con_algo > 0 then 'parcial'
            else 'pendiente' end as estado_entrega
  from practicas p
  join docentes d on d.id = p.docente_id
  join semestres s on s.id = p.semestre_id
  left join areas ar on ar.id = p.area_id
  left join lateral (
    select count(*) as items,
           count(*) filter (where entregado >= total) as completos,
           count(*) filter (where entregado > 0) as con_algo
      from v_practica_items where practica_id = p.id
  ) t on true;

-- Total del semestre por artículo: lo pedido en todas las prácticas contra el stock útil
create view v_requerimiento with (security_invoker = true) as
with req as (
  select semestre_id, articulo_id, sum(total) as requerido, count(distinct practica_id) as practicas
    from v_practica_items group by semestre_id, articulo_id
), ent as (
  select e.semestre_id, ei.articulo_id, sum(ei.cantidad) as entregado
    from entrega_items ei join entregas e on e.id = ei.entrega_id
   where e.practica_id is not null
   group by e.semestre_id, ei.articulo_id
)
select r.semestre_id, r.articulo_id, r.practicas,
       a.codigo, a.nombre, a.tipo, a.formula, a.unidad, a.familia, a.subfamilia, a.ubicacion, a.fiscalizado,
       r.requerido,
       m.con_margen                                              as requerido_con_margen,
       coalesce(e.entregado, 0)                                  as entregado,
       greatest(m.con_margen - coalesce(e.entregado, 0), 0)      as pendiente,
       a.utilizable,
       greatest(greatest(m.con_margen - coalesce(e.entregado, 0), 0) - a.utilizable, 0) as faltante
  from req r
  join semestres s on s.id = r.semestre_id
  join v_articulos a on a.id = r.articulo_id
  left join ent e on e.semestre_id = r.semestre_id and e.articulo_id = r.articulo_id
  -- El margen se suma al total; lo que se cuenta por piezas se redondea hacia arriba
  cross join lateral (
    select case when a.unidad in ('g', 'kg', 'mg', 'mL', 'L')
                then round(r.requerido * (1 + s.margen_pct / 100), 3)
                else ceil(r.requerido * (1 + s.margen_pct / 100)) end as con_margen
  ) m;

-- Consumo: cada renglón entregado con su semestre, área, docente y práctica
create view v_consumo with (security_invoker = true) as
select ei.id, ei.cantidad, e.fecha, e.numero, e.semestre_id, s.nombre as semestre,
       e.docente_id, d.nombres as docente, coalesce(pr.area_id, d.area_id) as area_id, ar.nombre as area,
       e.practica_id, pr.nombre as practica, pr.curso,
       a.id as articulo_id, a.codigo, a.nombre, a.tipo, a.unidad, a.fiscalizado,
       coalesce(fp.nombre, f.nombre) as familia
  from entrega_items ei
  join entregas e on e.id = ei.entrega_id
  join semestres s on s.id = e.semestre_id
  join docentes d on d.id = e.docente_id
  left join practicas pr on pr.id = e.practica_id
  left join areas ar on ar.id = coalesce(pr.area_id, d.area_id)
  join articulos a on a.id = ei.articulo_id
  left join familias f on f.id = a.familia_id
  left join familias fp on fp.id = f.padre_id;

create view v_prestamos with (security_invoker = true) as
select p.*, al.codigo as alumno_codigo, al.nombres as alumno, al.escuela, d.nombres as docente,
       coalesce(t.pendiente, 0) as pendiente, coalesce(t.deuda, 0) as deuda, coalesce(t.items, 0) as items,
       (p.estado = 'abierto' and p.fecha_limite < hoy()) as vencido
  from prestamos p
  join alumnos al on al.id = p.alumno_id
  left join docentes d on d.id = p.docente_id
  left join lateral (
    select count(*) as items,
           sum(cantidad - devuelto - roto - perdido) as pendiente,
           sum(roto + perdido - repuesto) as deuda
      from prestamo_items where prestamo_id = p.id
  ) t on true;

create view v_alumnos with (security_invoker = true) as
select al.*,
       coalesce(t.abiertos, 0) as prestamos_abiertos,
       coalesce(t.vencidos, 0) as prestamos_vencidos,
       coalesce(t.deuda, 0)    as deuda,
       bloqueo_alumno(al.id)   as bloqueo
  from alumnos al
  left join lateral (
    select count(*) filter (where estado = 'abierto') as abiertos,
           count(*) filter (where vencido) as vencidos,
           sum(deuda) as deuda
      from v_prestamos where alumno_id = al.id
  ) t on true;

-- Reactivos de grupos incompatibles guardados en la misma ubicación
create view v_incompatibilidades with (security_invoker = true) as
select distinct u.id as ubicacion_id, u.nombre as ubicacion,
       g1.codigo as grupo1, g1.nombre as nombre1, g2.codigo as grupo2, g2.nombre as nombre2
  from articulos a1
  join articulos a2 on a2.ubicacion_id = a1.ubicacion_id and a2.id <> a1.id
  join grupos_almacenamiento g1 on g1.codigo = a1.grupo
  join grupos_almacenamiento g2 on g2.codigo = a2.grupo
  join ubicaciones u on u.id = a1.ubicacion_id
 where a1.activo and a2.activo and a1.stock > 0 and a2.stock > 0
   and g2.codigo = any(g1.incompatibles) and g1.codigo < g2.codigo;

-- -----------------------------------------------------------------------------
-- 8. Seguridad
--   admin    todo, incluido dar acceso a otros usuarios
--   almacen  inventario, prácticas, entregas, alumnos y préstamos
--   docente  consulta el inventario; captura y envía sus propias prácticas; ve sus entregas
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
revoke execute on function salida_fefo(uuid, numeric, tipo_movimiento, text, text, uuid) from authenticated;

-- Los saldos solo los cambia el sistema
revoke insert, update on articulos from authenticated;
grant insert (codigo, codigo_barras, tipo, nombre, familia_id, formula, cas, grado, concentracion, pictogramas,
              palabra_advertencia, grupo, fiscalizado, capacidad, material, modelo, serie, prestable, marca,
              presentacion, unidad, stock_minimo, ubicacion_id, notas, activo)
  on articulos to authenticated;
grant update (codigo, codigo_barras, tipo, nombre, familia_id, formula, cas, grado, concentracion, pictogramas,
              palabra_advertencia, grupo, fiscalizado, capacidad, material, modelo, serie, prestable, marca,
              presentacion, unidad, stock_minimo, ubicacion_id, notas, activo)
  on articulos to authenticated;
revoke insert, update on lotes from authenticated;
grant update (lote, vencimiento) on lotes to authenticated;
-- Movimientos, entregas y préstamos se registran solo con las funciones de arriba
revoke insert, update, delete on movimientos, entregas, entrega_items, prestamos, prestamo_items from authenticated;

do $$
declare t text;
begin
  foreach t in array array['areas','perfiles','docentes','ubicaciones','grupos_almacenamiento','familias','articulos',
                           'lotes','movimientos','semestres','practicas','practica_items','entregas','entrega_items',
                           'alumnos','prestamos','prestamo_items']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Catálogos e inventario: todos los usuarios con rol los consultan; almacén los gestiona
do $$
declare t text;
begin
  foreach t in array array['areas','docentes','ubicaciones','grupos_almacenamiento','familias','articulos','lotes','semestres']
  loop
    execute format('create policy %I on %I for select to authenticated using (rol_actual() is not null)', t || '_leer', t);
    execute format('create policy %I on %I for all to authenticated using (es_personal()) with check (es_personal())', t || '_gestionar', t);
  end loop;
end $$;

create policy perfiles_leer on perfiles for select to authenticated using (rol_actual() is not null or id = auth.uid());
create policy perfiles_admin on perfiles for all to authenticated using (tiene_rol('admin')) with check (tiene_rol('admin'));

create policy movimientos_leer on movimientos for select to authenticated using (es_personal());

-- Prácticas: almacén ve y edita todas; el docente las suyas mientras están en borrador
create policy practicas_personal on practicas for all to authenticated using (es_personal()) with check (es_personal());
create policy practicas_docente_leer on practicas for select to authenticated using (docente_id = mi_docente());
create policy practicas_docente_crear on practicas for insert to authenticated
  with check (docente_id = mi_docente() and estado = 'borrador');
create policy practicas_docente_editar on practicas for update to authenticated
  using (docente_id = mi_docente() and estado = 'borrador')
  with check (docente_id = mi_docente());
create policy practicas_docente_borrar on practicas for delete to authenticated
  using (docente_id = mi_docente() and estado = 'borrador');

create function puedo_editar_practica(p_practica uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_personal() or exists (select 1 from practicas where id = p_practica and docente_id = mi_docente() and estado = 'borrador')
$$;
create function puedo_ver_practica(p_practica uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_personal() or exists (select 1 from practicas where id = p_practica and docente_id = mi_docente())
$$;
create policy practica_items_leer on practica_items for select to authenticated using (puedo_ver_practica(practica_id));
create policy practica_items_editar on practica_items for all to authenticated
  using (puedo_editar_practica(practica_id)) with check (puedo_editar_practica(practica_id));

create policy entregas_leer on entregas for select to authenticated using (es_personal() or docente_id = mi_docente());
create policy entrega_items_leer on entrega_items for select to authenticated
  using (es_personal() or exists (select 1 from entregas e where e.id = entrega_id and e.docente_id = mi_docente()));

create policy alumnos_personal on alumnos for all to authenticated using (es_personal()) with check (es_personal());
create policy prestamos_leer on prestamos for select to authenticated using (es_personal());
create policy prestamo_items_leer on prestamo_items for select to authenticated using (es_personal());

-- La primera persona que se registre en Authentication queda como administradora
create function fn_primer_usuario_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from perfiles where rol = 'admin') then
    insert into perfiles (id, nombre, rol)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)), 'admin');
  end if;
  return new;
end $$;
create trigger trg_primer_usuario_admin after insert on auth.users
  for each row execute function fn_primer_usuario_admin();

-- Cuentas de Authentication para que administración les dé rol desde la app
create function usuarios_cuentas()
returns table (id uuid, email text, creado timestamptz, ultimo_acceso timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, u.created_at, u.last_sign_in_at
    from auth.users u
   where tiene_rol('admin')
   order by u.created_at
$$;
revoke execute on function usuarios_cuentas() from public, anon;
grant execute on function usuarios_cuentas() to authenticated;

-- Catálogos iniciales del almacén. Ajústalos desde la app (Catálogos).

-- Grupos de compatibilidad para almacenar (qué no debe guardarse junto)
insert into grupos_almacenamiento (codigo, nombre, color, indicaciones, incompatibles) values
  ('A',  'Ácidos inorgánicos',        '#e5484d', 'Armario para ácidos, ventilado, con bandeja de derrames.', '{B,R,O,I}'),
  ('AO', 'Ácidos oxidantes',          '#d6409f', 'Separado de los demás ácidos y lejos de orgánicos (nítrico, perclórico).', '{B,I,R}'),
  ('B',  'Bases',                     '#3e63dd', 'Lejos de los ácidos.', '{A,AO}'),
  ('I',  'Inflamables',               '#f76b15', 'Gabinete para inflamables, lejos del calor y de oxidantes.', '{A,AO,O}'),
  ('O',  'Oxidantes',                 '#ffc53d', 'Lejos de inflamables, orgánicos y metales activos.', '{I,R,A}'),
  ('T',  'Tóxicos',                   '#8e4ec6', 'Bajo llave, con registro de uso.', '{}'),
  ('R',  'Reactivos con agua',        '#12a594', 'Secos y aislados (sodio, potasio metálico, carburo).', '{A,AO,O}'),
  ('G',  'General (compatibles)',     '#8b8d98', 'Sales y sólidos estables; estantería común.', '{}')
on conflict (codigo) do nothing;

-- Clasificación química: familia principal y sus subfamilias
insert into familias (nombre, grupo, orden, descripcion) values
  ('Ácidos inorgánicos',            'A',  10, 'HCl, H₂SO₄, H₃PO₄, HNO₃'),
  ('Bases e hidróxidos',            'B',  20, 'NaOH, KOH, NH₄OH, Ca(OH)₂'),
  ('Sales',                         'G',  30, 'Sales inorgánicas y orgánicas'),
  ('Óxidos y peróxidos',            'G',  40, 'CaO, MnO₂, H₂O₂'),
  ('Metales y no metales',          'G',  50, 'Elementos: Zn, Cu, Mg, Fe, S, I₂'),
  ('Solventes orgánicos',           'I',  60, 'Alcoholes, cetonas, hidrocarburos, halogenados'),
  ('Ácidos orgánicos',              'G',  70, 'Acético, cítrico, oxálico, benzoico'),
  ('Otros compuestos orgánicos',    'G',  80, 'Aminas, carbohidratos, aminoácidos'),
  ('Indicadores y colorantes',      'G',  90, 'Fenolftaleína, naranja de metilo, azul de metileno'),
  ('Soluciones preparadas',         'G', 100, 'Estándares valorados y buffers'),
  ('Medios de cultivo y biológicos','G', 110, 'Agar, peptona, caldos'),
  ('Bioquímicos y enzimas',         'G', 120, 'Enzimas, kits, proteínas'),
  ('Otros reactivos',               'G', 130, null)
on conflict do nothing;

insert into familias (nombre, padre_id, grupo, orden)
select s.nombre, f.id, s.grupo, s.orden
from (values
  ('Ácidos inorgánicos', 'Ácidos no oxidantes',        'A',  1),
  ('Ácidos inorgánicos', 'Ácidos oxidantes',           'AO', 2),
  ('Bases e hidróxidos', 'Hidróxidos',                 'B',  1),
  ('Bases e hidróxidos', 'Amoníaco y aminas básicas',  'B',  2),
  ('Sales',              'Cloruros',                   null, 1),
  ('Sales',              'Sulfatos y sulfitos',        null, 2),
  ('Sales',              'Nitratos y nitritos',        'O',  3),
  ('Sales',              'Carbonatos y bicarbonatos',  null, 4),
  ('Sales',              'Fosfatos',                   null, 5),
  ('Sales',              'Acetatos y otras orgánicas', null, 6),
  ('Sales',              'Bromuros y yoduros',         null, 7),
  ('Sales',              'Sulfuros y tiosulfatos',     null, 8),
  ('Sales',              'Cromatos y dicromatos',      'O',  9),
  ('Sales',              'Permanganatos',              'O', 10),
  ('Sales',              'Otras sales',                null, 11),
  ('Óxidos y peróxidos', 'Óxidos',                     null, 1),
  ('Óxidos y peróxidos', 'Peróxidos',                  'O',  2),
  ('Metales y no metales','Metales',                   null, 1),
  ('Metales y no metales','Metales reactivos con agua','R',  2),
  ('Metales y no metales','No metales',                null, 3),
  ('Solventes orgánicos','Alcoholes',                  null, 1),
  ('Solventes orgánicos','Cetonas y aldehídos',        null, 2),
  ('Solventes orgánicos','Hidrocarburos',              null, 3),
  ('Solventes orgánicos','Halogenados',                'T',  4),
  ('Solventes orgánicos','Éteres y ésteres',           null, 5),
  ('Otros compuestos orgánicos','Aminas y amidas',     null, 1),
  ('Otros compuestos orgánicos','Carbohidratos',       null, 2),
  ('Otros compuestos orgánicos','Aminoácidos y proteínas', null, 3),
  ('Otros compuestos orgánicos','Fenoles',             'T',  4),
  ('Soluciones preparadas','Soluciones valoradas',     null, 1),
  ('Soluciones preparadas','Buffers (tampones)',       null, 2)
) as s(padre, nombre, grupo, orden)
join familias f on f.nombre = s.padre and f.padre_id is null
on conflict do nothing;

-- Áreas académicas de ejemplo
insert into areas (nombre) values
  ('Química general'), ('Química inorgánica'), ('Química orgánica'), ('Química analítica'),
  ('Fisicoquímica'), ('Bioquímica'), ('Microbiología'), ('Física')
on conflict do nothing;

-- Ubicaciones de ejemplo
insert into ubicaciones (nombre, descripcion) values
  ('Armario de ácidos',        'Ventilado, con bandeja de derrames'),
  ('Armario de bases',         null),
  ('Gabinete de inflamables',  'Metálico, lejos del calor'),
  ('Estante de sales',         null),
  ('Armario bajo llave',       'Tóxicos y fiscalizados'),
  ('Refrigeradora',            'Medios, enzimas y reactivos sensibles'),
  ('Estante de vidrio',        null),
  ('Vitrina de equipos',       null)
on conflict do nothing;

-- Semestre de ejemplo (actívalo o cámbialo en Prácticas → Semestres)
insert into semestres (nombre, inicio, fin, activo) values ('2026-II', '2026-08-17', '2026-12-18', true)
on conflict do nothing;

-- =============================================================================
--  Actualización 2026-10-26: registrar por envases y encargados que despachan
--  Cada artículo puede decir en qué envase viene (caja, frasco, galonera…) y
--  cuánto trae cada uno (10 unidades, 1000 g, 2500 mL). Al ingresar se escribe
--  cuántos envases llegan y el sistema suma la cantidad en la unidad base.
--  Cada lote guarda el tamaño de su frasco para ver cuánto queda en él.
-- =============================================================================

alter table articulos
  add column envase    text,                                         -- caja, frasco, galonera, paquete…
  add column contenido numeric(14,3) check (contenido > 0);          -- cuánto trae un envase, en la unidad base

alter table lotes
  add column envase    text,
  add column contenido numeric(14,3) check (contenido > 0),          -- tamaño del frasco de este lote
  add column envases   numeric(10,2);                                -- cuántos envases entraron

grant insert (envase, contenido), update (envase, contenido) on articulos to authenticated;

-- Ingreso por cantidad o por envases (p_envases × p_contenido + p_cantidad suelta; si no
-- se da el contenido se usa el del artículo). Con lote, el lote recuerda el tamaño del frasco.
drop function registrar_ingreso(uuid, numeric, text, date, text, text, tipo_movimiento);
create function registrar_ingreso(p_articulo uuid, p_cantidad numeric, p_lote text default null,
                                  p_vencimiento date default null, p_documento text default null,
                                  p_nota text default null, p_tipo tipo_movimiento default 'ingreso',
                                  p_envases numeric default null, p_contenido numeric default null,
                                  p_envase text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  a articulos%rowtype;
  v_lote uuid;
  v_id uuid;
  v_cantidad numeric := p_cantidad;
  v_contenido numeric;
  v_envase text;
  v_nota text := nullif(btrim(p_nota), '');
begin
  if not es_personal() then raise exception 'Solo el personal de almacén registra ingresos.'; end if;
  if p_tipo not in ('ingreso', 'ajuste_positivo') then raise exception 'Tipo de ingreso no válido.'; end if;
  select * into a from articulos where id = p_articulo;
  if not found then raise exception 'El artículo no existe.'; end if;
  if p_envases is not null then
    v_contenido := coalesce(p_contenido, a.contenido);
    v_envase := coalesce(nullif(btrim(p_envase), ''), a.envase, 'envase');
    if p_envases <= 0 then raise exception 'El número de envases debe ser mayor que cero.'; end if;
    if v_contenido is null or v_contenido <= 0 then
      raise exception 'Indica cuánto trae cada % de "%".', v_envase, a.nombre;
    end if;
    -- envases completos más lo suelto (un frasco abierto)
    v_cantidad := p_envases * v_contenido + coalesce(p_cantidad, 0);
    v_nota := concat_ws(' · ',
      trim_scale(p_envases) || ' ' || case
          when p_envases = 1 then v_envase
          when v_envase like '%ón' then left(v_envase, -2) || 'ones'
          else v_envase || 's' end
        || ' de ' || case
             when a.unidad in ('g', 'mL') and v_contenido >= 1000 then trim_scale(v_contenido / 1000) || ' ' || case a.unidad when 'g' then 'kg' else 'L' end
             else trim_scale(v_contenido) || ' ' || case when a.unidad = 'unidad' and v_contenido <> 1 then 'unidades' else a.unidad end
           end
        || case when coalesce(p_cantidad, 0) > 0 then ' + ' || trim_scale(p_cantidad) || ' ' || a.unidad || ' suelto' else '' end,
      v_nota);
  end if;
  if coalesce(v_cantidad, 0) <= 0 then raise exception 'La cantidad debe ser mayor que cero.'; end if;
  if nullif(btrim(p_lote), '') is not null then
    insert into lotes (articulo_id, lote, vencimiento, envase, contenido, envases)
    values (p_articulo, btrim(p_lote), p_vencimiento, v_envase, v_contenido, p_envases)
    on conflict (articulo_id, lote) do update
      set vencimiento = coalesce(excluded.vencimiento, lotes.vencimiento),
          envase      = coalesce(excluded.envase, lotes.envase),
          contenido   = coalesce(excluded.contenido, lotes.contenido),
          envases     = case when excluded.envases is null then lotes.envases
                             else coalesce(lotes.envases, 0) + excluded.envases end
    returning id into v_lote;
  end if;
  insert into movimientos (articulo_id, lote_id, tipo, cantidad, documento, nota)
  values (p_articulo, v_lote, p_tipo, v_cantidad, nullif(btrim(p_documento), ''), v_nota)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function registrar_ingreso(uuid, numeric, text, date, text, text, tipo_movimiento, numeric, numeric, text) from public, anon;
grant execute on function registrar_ingreso(uuid, numeric, text, date, text, text, tipo_movimiento, numeric, numeric, text) to authenticated;

-- Las vistas se rehacen para mostrar el stock también en envases
drop view v_requerimiento, v_practicas, v_practica_items, v_lotes, v_articulos;

create view v_articulos with (security_invoker = true) as
select a.*,
       a.stock - a.prestado                                   as disponible,
       coalesce(l.vencido, 0)                                 as vencido,
       a.stock - a.prestado - coalesce(l.vencido, 0)          as utilizable,
       l.proximo_vencimiento,
       coalesce(fp.nombre, f.nombre)                          as familia,
       case when fp.id is not null then f.nombre end          as subfamilia,
       coalesce(fp.id, f.id)                                  as familia_raiz_id,
       u.nombre                                               as ubicacion,
       case when a.stock <= 0 then 'agotado'
            when a.stock <= a.stock_minimo then 'bajo'
            else 'ok' end                                     as estado_stock,
       case when a.contenido > 0 then round(a.stock / a.contenido, 2) end as stock_envases
  from articulos a
  left join familias f on f.id = a.familia_id
  left join familias fp on fp.id = f.padre_id
  left join ubicaciones u on u.id = a.ubicacion_id
  left join lateral (
    select sum(cantidad) filter (where vencimiento < hoy()) as vencido,
           min(vencimiento) filter (where cantidad > 0 and vencimiento >= hoy()) as proximo_vencimiento
      from lotes where articulo_id = a.id and cantidad > 0
  ) l on true;

create view v_lotes with (security_invoker = true) as
select l.*, a.nombre, a.codigo, a.unidad, a.formula,
       l.vencimiento - hoy() as dias_para_vencer,
       coalesce(l.envase, a.envase) as envase_nombre,
       case when coalesce(l.contenido, a.contenido) > 0 then round(l.cantidad / coalesce(l.contenido, a.contenido), 2) end as envases_quedan
  from lotes l join articulos a on a.id = l.articulo_id
 where l.cantidad > 0 and a.activo;

create view v_practica_items with (security_invoker = true) as
select i.*,
       pr.semestre_id, pr.docente_id,
       i.cantidad * case when i.por = 'grupo' then pr.secciones * pr.grupos_por_seccion else pr.secciones end as total,
       coalesce((select sum(ei.cantidad) from entrega_items ei join entregas e on e.id = ei.entrega_id
                  where e.practica_id = i.practica_id and ei.articulo_id = i.articulo_id), 0) as entregado,
       a.codigo, a.nombre, a.unidad, a.tipo, a.formula, a.utilizable as disponible
  from practica_items i
  join practicas pr on pr.id = i.practica_id
  join v_articulos a on a.id = i.articulo_id;

create view v_practicas with (security_invoker = true) as
select p.*, d.nombres as docente, ar.nombre as area, s.nombre as semestre,
       coalesce(t.items, 0) as items,
       coalesce(t.completos, 0) as items_entregados,
       case when coalesce(t.items, 0) = 0 then 'sin_items'
            when t.completos = t.items then 'entregada'
            when t.con_algo > 0 then 'parcial'
            else 'pendiente' end as estado_entrega
  from practicas p
  join docentes d on d.id = p.docente_id
  join semestres s on s.id = p.semestre_id
  left join areas ar on ar.id = p.area_id
  left join lateral (
    select count(*) as items,
           count(*) filter (where entregado >= total) as completos,
           count(*) filter (where entregado > 0) as con_algo
      from v_practica_items where practica_id = p.id
  ) t on true;

-- Total del semestre por artículo: lo pedido en todas las prácticas contra el stock útil
create view v_requerimiento with (security_invoker = true) as
with req as (
  select semestre_id, articulo_id, sum(total) as requerido, count(distinct practica_id) as practicas
    from v_practica_items group by semestre_id, articulo_id
), ent as (
  select e.semestre_id, ei.articulo_id, sum(ei.cantidad) as entregado
    from entrega_items ei join entregas e on e.id = ei.entrega_id
   where e.practica_id is not null
   group by e.semestre_id, ei.articulo_id
)
select r.semestre_id, r.articulo_id, r.practicas,
       a.codigo, a.nombre, a.tipo, a.formula, a.unidad, a.familia, a.subfamilia, a.ubicacion, a.fiscalizado,
       r.requerido,
       m.con_margen                                              as requerido_con_margen,
       coalesce(e.entregado, 0)                                  as entregado,
       greatest(m.con_margen - coalesce(e.entregado, 0), 0)      as pendiente,
       a.utilizable,
       greatest(greatest(m.con_margen - coalesce(e.entregado, 0), 0) - a.utilizable, 0) as faltante
  from req r
  join semestres s on s.id = r.semestre_id
  join v_articulos a on a.id = r.articulo_id
  left join ent e on e.semestre_id = r.semestre_id and e.articulo_id = r.articulo_id
  -- El margen se suma al total; lo que se cuenta por piezas se redondea hacia arriba
  cross join lateral (
    select case when a.unidad in ('g', 'kg', 'mg', 'mL', 'L')
                then round(r.requerido * (1 + s.margen_pct / 100), 3)
                else ceil(r.requerido * (1 + s.margen_pct / 100)) end as con_margen
  ) m;

-- Consumo: cada renglón entregado con su semestre, área, docente y práctica

grant select on v_articulos, v_lotes, v_practica_items, v_practicas, v_requerimiento to authenticated;

-- -----------------------------------------------------------------------------
-- Encargados del almacén: quién despacha cada entrega o préstamo (sale en la firma)
-- -----------------------------------------------------------------------------
create table encargados (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  dni        text,
  perfil_id  uuid unique references perfiles(id) on delete set null,   -- si tiene cuenta, se elige solo
  activo     boolean not null default true,
  creado     timestamptz not null default now()
);
alter table encargados enable row level security;
grant select, insert, update, delete on encargados to authenticated;
create policy encargados_leer on encargados for select to authenticated using (rol_actual() is not null);
create policy encargados_gestionar on encargados for all to authenticated using (es_personal()) with check (es_personal());

-- Las cuentas de almacén que ya existen pasan a ser encargados
insert into encargados (nombre, perfil_id)
select nombre, id from perfiles where rol in ('admin', 'almacen') and activo;

-- Toda cuenta de administración o almacén pasa a ser encargado (también las nuevas)
create function fn_perfil_encargado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.rol in ('admin', 'almacen') and new.activo
     and not exists (select 1 from encargados where perfil_id = new.id) then
    insert into encargados (nombre, perfil_id) values (new.nombre, new.id);
  end if;
  return new;
end $$;
create trigger trg_perfil_encargado after insert or update of rol, activo on perfiles
  for each row execute function fn_perfil_encargado();

alter table entregas  add column despachado_por uuid references encargados(id);
alter table prestamos add column despachado_por uuid references encargados(id);

-- Por defecto despacha el encargado enlazado a la cuenta que registra
create function fn_despachador_por_defecto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.despachado_por is null then
    select id into new.despachado_por from encargados where perfil_id = auth.uid() and activo;
  end if;
  return new;
end $$;
create trigger trg_entrega_despachador before insert on entregas
  for each row execute function fn_despachador_por_defecto();
create trigger trg_prestamo_despachador before insert on prestamos
  for each row execute function fn_despachador_por_defecto();

-- Cambiar quién despachó desde el documento para imprimir
create function asignar_despachador(p_tipo text, p_id uuid, p_encargado uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_personal() then raise exception 'Solo el personal de almacén cambia el encargado.'; end if;
  if p_tipo = 'entrega' then
    update entregas set despachado_por = p_encargado where id = p_id;
  elsif p_tipo = 'prestamo' then
    update prestamos set despachado_por = p_encargado where id = p_id;
  else
    raise exception 'Documento no válido.';
  end if;
end $$;
revoke execute on function asignar_despachador(text, uuid, uuid) from public, anon;
grant execute on function asignar_despachador(text, uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Fotos de evidencia de cada entrega (Supabase Storage, plan gratuito: 1 GB)
-- Las fotos se reducen en el navegador antes de subir (≈150 KB cada una).
-- -----------------------------------------------------------------------------
create table entrega_fotos (
  id          uuid primary key default gen_random_uuid(),
  entrega_id  uuid not null references entregas(id) on delete cascade,
  ruta        text not null unique,          -- ruta dentro del bucket "evidencias"
  nota        text,
  subido_por  uuid references perfiles(id) default auth.uid(),
  creado      timestamptz not null default now()
);
create index entrega_fotos_entrega_idx on entrega_fotos (entrega_id);
alter table entrega_fotos enable row level security;
grant select, insert, delete on entrega_fotos to authenticated;
create policy entrega_fotos_leer on entrega_fotos for select to authenticated
  using (es_personal() or exists (select 1 from entregas e where e.id = entrega_id and e.docente_id = mi_docente()));
create policy entrega_fotos_subir on entrega_fotos for insert to authenticated with check (es_personal());
create policy entrega_fotos_borrar on entrega_fotos for delete to authenticated using (es_personal());

-- Bucket privado: solo se ve con enlaces temporales que da la app
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy evidencias_ver on storage.objects for select to authenticated
  using (bucket_id = 'evidencias' and (es_personal() or exists (
    select 1 from entrega_fotos f join entregas e on e.id = f.entrega_id
     where f.ruta = storage.objects.name and e.docente_id = mi_docente())));
create policy evidencias_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'evidencias' and es_personal());
create policy evidencias_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'evidencias' and es_personal());

-- -----------------------------------------------------------------------------
-- Artículos que se crearon contados en "caja" o "paquete": pasan a contarse en
-- unidades. p_por = cuántas piezas trae cada caja. Si el stock ya estaba en
-- piezas (solo la unidad estaba mal), p_multiplicar = false.
-- -----------------------------------------------------------------------------
create function convertir_a_piezas(p_articulo uuid, p_por numeric, p_multiplicar boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare a articulos; f numeric;
begin
  if not es_personal() then raise exception 'Solo el personal de almacén convierte artículos.'; end if;
  select * into a from articulos where id = p_articulo for update;
  if not found then raise exception 'El artículo no existe.'; end if;
  if a.unidad not in ('caja', 'paquete') then raise exception '"%" ya se cuenta en %.', a.nombre, a.unidad; end if;
  if p_por is null or p_por <= 0 or p_por <> trunc(p_por) then raise exception 'Escribe cuántas piezas trae cada %.', a.unidad; end if;
  f := case when p_multiplicar then p_por else 1 end;
  -- El kardex no se toca nunca, salvo aquí para pasar todo a piezas
  alter table movimientos disable trigger trg_movimientos_inmutables;
  update movimientos set cantidad = cantidad * f, saldo = saldo * f where articulo_id = p_articulo;
  alter table movimientos enable trigger trg_movimientos_inmutables;
  update lotes set cantidad = cantidad * f, envase = coalesce(envase, a.unidad), contenido = coalesce(contenido, p_por) where articulo_id = p_articulo;
  update entrega_items set cantidad = cantidad * f where articulo_id = p_articulo;
  update practica_items set cantidad = cantidad * f where articulo_id = p_articulo;
  update prestamo_items set cantidad = cantidad * f, devuelto = devuelto * f, roto = roto * f,
                            perdido = perdido * f, repuesto = repuesto * f where articulo_id = p_articulo;
  update articulos set unidad = 'unidad', envase = a.unidad, contenido = p_por,
         stock = stock * f, prestado = prestado * f, stock_minimo = stock_minimo * f,
         presentacion = initcap(a.unidad) || ' de ' || trim_scale(p_por) || case when p_por = 1 then ' unidad' else ' unidades' end
   where id = p_articulo;
end $$;
revoke execute on function convertir_a_piezas(uuid, numeric, boolean) from public, anon;
grant execute on function convertir_a_piezas(uuid, numeric, boolean) to authenticated;

notify pgrst, 'reload schema';
