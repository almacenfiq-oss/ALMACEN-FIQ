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
