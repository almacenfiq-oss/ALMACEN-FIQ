-- =============================================================================
--  ACTUALIZACIÓN 2026-10-27: entregas por área y reparto sin bajar del mínimo.
--  Solo si YA instalaste la app antes de esta fecha (y ya corriste la
--  actualización del 2026-10-26): pega TODO este archivo en Supabase →
--  SQL Editor → New query y pulsa Run. Se ejecuta UNA sola vez.
-- =============================================================================

-- Esta actualización necesita la del 2026-10-26
do $$ begin
  if to_regclass('public.encargados') is null then
    raise exception 'Primero corre la actualización 2026-10-26-envases-encargados-fotos.sql y luego esta.';
  end if;
end $$;

-- =============================================================================
--  Actualización 2026-10-27: entregas por área y reparto sin bajar del mínimo
--
--  · Una entrega puede cubrir todas las prácticas de un área en el semestre
--    (de una vez o por partes). Lo entregado se reparte entre sus prácticas
--    para que cada una sepa cuánto le falta.
--  · Propuesta de reparto: lo que hay por encima del stock mínimo se divide
--    en proporción a lo que pide cada área, para que todas reciban algo y el
--    almacén nunca quede por debajo del mínimo.
-- =============================================================================

alter table entregas add column area_id uuid references areas(id);
create index entregas_area_idx on entregas (semestre_id, area_id);

-- A qué práctica se le cuenta cada parte de una entrega por área
create table entrega_reparto (
  entrega_id   uuid not null references entregas(id) on delete cascade,
  practica_id  uuid not null references practicas(id) on delete restrict,
  articulo_id  uuid not null references articulos(id),
  cantidad     numeric(14,3) not null check (cantidad > 0),
  primary key (entrega_id, practica_id, articulo_id)
);
create index entrega_reparto_practica_idx on entrega_reparto (practica_id, articulo_id);
alter table entrega_reparto enable row level security;
grant select on entrega_reparto to authenticated;
create policy entrega_reparto_leer on entrega_reparto for select to authenticated using (puedo_ver_practica(practica_id));

-- Redondeo hacia abajo: piezas enteras; gramos y mililitros enteros (o 0.1 si es poco)
create function redondeo_abajo(p_cantidad numeric, p_unidad text) returns numeric
language sql immutable as $$
  select case
    when p_cantidad <= 0 then 0
    when p_unidad in ('g', 'kg', 'mg', 'mL', 'L') then trunc(p_cantidad, case when p_cantidad >= 10 then 0 else 1 end)
    else floor(p_cantidad) end
$$;

-- Las vistas dependen unas de otras: se recrean juntas
drop view v_requerimiento, v_practicas, v_practica_items;

create view v_practica_items with (security_invoker = true) as
select i.*,
       pr.semestre_id, pr.docente_id, pr.area_id,
       i.cantidad * case when i.por = 'grupo' then pr.secciones * pr.grupos_por_seccion else pr.secciones end as total,
       coalesce((select sum(ei.cantidad) from entrega_items ei join entregas e on e.id = ei.entrega_id
                  where e.practica_id = i.practica_id and ei.articulo_id = i.articulo_id), 0)
     + coalesce((select sum(r.cantidad) from entrega_reparto r
                  where r.practica_id = i.practica_id and r.articulo_id = i.articulo_id), 0) as entregado,
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

-- Total del semestre por artículo, ahora con lo que hay sobre el mínimo y lo que hay que comprar
create view v_requerimiento with (security_invoker = true) as
with req as (
  select semestre_id, articulo_id, sum(total) as requerido, count(distinct practica_id) as practicas
    from v_practica_items group by semestre_id, articulo_id
), ent as (
  select e.semestre_id, ei.articulo_id, sum(ei.cantidad) as entregado
    from entrega_items ei join entregas e on e.id = ei.entrega_id
   where e.practica_id is not null or e.area_id is not null
   group by e.semestre_id, ei.articulo_id
)
select r.semestre_id, r.articulo_id, r.practicas,
       a.codigo, a.nombre, a.tipo, a.formula, a.unidad, a.familia, a.subfamilia, a.ubicacion, a.fiscalizado,
       r.requerido,
       m.con_margen                                              as requerido_con_margen,
       coalesce(e.entregado, 0)                                  as entregado,
       greatest(m.con_margen - coalesce(e.entregado, 0), 0)      as pendiente,
       a.utilizable,
       greatest(greatest(m.con_margen - coalesce(e.entregado, 0), 0) - a.utilizable, 0) as faltante,
       a.stock_minimo,
       greatest(a.utilizable - a.stock_minimo, 0)                as sobre_minimo,
       -- Para entregar todo y que el almacén siga con su mínimo
       greatest(greatest(m.con_margen - coalesce(e.entregado, 0), 0) - greatest(a.utilizable - a.stock_minimo, 0), 0) as para_comprar
  from req r
  join semestres s on s.id = r.semestre_id
  join v_articulos a on a.id = r.articulo_id
  left join ent e on e.semestre_id = r.semestre_id and e.articulo_id = r.articulo_id
  cross join lateral (
    select case when a.unidad in ('g', 'kg', 'mg', 'mL', 'L')
                then round(r.requerido * (1 + s.margen_pct / 100), 3)
                else ceil(r.requerido * (1 + s.margen_pct / 100)) end as con_margen
  ) m;

-- Lo que le falta recibir a cada área en el semestre, por artículo
create view v_pendiente_area with (security_invoker = true) as
with req as (
  select semestre_id, area_id, articulo_id, sum(total) as requerido, sum(entregado) as entregado,
         count(distinct practica_id) as practicas
    from v_practica_items group by semestre_id, area_id, articulo_id
)
select r.semestre_id, r.area_id, r.articulo_id, r.practicas, ar.nombre as area,
       a.codigo, a.nombre, a.tipo, a.formula, a.unidad, a.familia, a.utilizable, a.stock_minimo,
       r.requerido, m.con_margen as requerido_con_margen, r.entregado,
       greatest(m.con_margen - r.entregado, 0) as pendiente
  from req r
  join semestres s on s.id = r.semestre_id
  join v_articulos a on a.id = r.articulo_id
  left join areas ar on ar.id = r.area_id
  cross join lateral (
    select case when a.unidad in ('g', 'kg', 'mg', 'mL', 'L')
                then round(r.requerido * (1 + s.margen_pct / 100), 3)
                else ceil(r.requerido * (1 + s.margen_pct / 100)) end as con_margen
  ) m;

-- Propuesta de reparto: si lo que piden todas las áreas no cabe en lo que hay sobre
-- el mínimo, cada área recibe la misma proporción de lo que le falta.
create view v_reparto with (security_invoker = true) as
select p.*,
       t.total_pendiente,
       greatest(p.utilizable - p.stock_minimo, 0) as sobre_minimo,
       case when t.total_pendiente <= greatest(p.utilizable - p.stock_minimo, 0) then p.pendiente
            else redondeo_abajo(p.pendiente * greatest(p.utilizable - p.stock_minimo, 0) / t.total_pendiente, p.unidad)
       end as propuesta
  from v_pendiente_area p
  join (select semestre_id, articulo_id, sum(pendiente) as total_pendiente
          from v_pendiente_area group by semestre_id, articulo_id) t
    on t.semestre_id = p.semestre_id and t.articulo_id = p.articulo_id;

grant select on v_practica_items, v_practicas, v_requerimiento, v_pendiente_area, v_reparto to authenticated;

-- Entrega de un área (todas sus prácticas del semestre, completa o por partes).
-- p_items: [{"articulo_id": "...", "cantidad": 120}, ...]
create function registrar_entrega_area(p_semestre uuid, p_area uuid, p_docente uuid, p_items jsonb,
                                       p_recibe text default null, p_nota text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_numero int;
  v_item jsonb;
  v_articulo uuid;
  v_cant numeric;
  v_resto numeric;
  v_dar numeric;
  v_ultima uuid;
  v_n int := 0;
  pr record;
begin
  if not es_personal() then raise exception 'Solo el personal de almacén registra entregas.'; end if;
  if p_area is null then raise exception 'Elige el área.'; end if;
  if p_docente is null then raise exception 'Elige el docente que recibe por el área.'; end if;
  if not exists (select 1 from semestres where id = p_semestre) then raise exception 'Elige el semestre.'; end if;

  insert into entregas (semestre_id, practica_id, docente_id, area_id, recibe, nota)
  values (p_semestre, null, p_docente, p_area, nullif(btrim(p_recibe), ''), nullif(btrim(p_nota), ''))
  returning id, numero into v_id, v_numero;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_articulo := (v_item ->> 'articulo_id')::uuid;
    v_cant := nullif(v_item ->> 'cantidad', '')::numeric;
    continue when v_cant is null or v_cant <= 0;
    insert into entrega_items (entrega_id, articulo_id, cantidad) values (v_id, v_articulo, v_cant);
    perform salida_fefo(v_articulo, v_cant, 'entrega_docente', 'Entrega N.º ' || v_numero || ' (área)', null, v_id);
    v_n := v_n + 1;

    -- Reparto entre las prácticas del área: primero las que van antes
    v_resto := v_cant;
    v_ultima := null;
    for pr in
      select pi.practica_id, greatest(pi.total - pi.entregado, 0) as falta
        from v_practica_items pi join practicas p on p.id = pi.practica_id
       where pi.semestre_id = p_semestre and pi.area_id = p_area and pi.articulo_id = v_articulo
       order by p.fecha nulls last, p.numero nulls last, p.creado
    loop
      v_ultima := pr.practica_id;
      exit when v_resto <= 0;
      v_dar := least(v_resto, pr.falta);
      continue when v_dar <= 0;
      insert into entrega_reparto (entrega_id, practica_id, articulo_id, cantidad)
      values (v_id, pr.practica_id, v_articulo, v_dar);
      v_resto := v_resto - v_dar;
    end loop;
    -- Lo que sobra (el margen extra) se cuenta en la última práctica
    if v_resto > 0 and v_ultima is not null then
      insert into entrega_reparto (entrega_id, practica_id, articulo_id, cantidad)
      values (v_id, v_ultima, v_articulo, v_resto)
      on conflict (entrega_id, practica_id, articulo_id) do update set cantidad = entrega_reparto.cantidad + excluded.cantidad;
    end if;
  end loop;
  if v_n = 0 then raise exception 'Escribe al menos una cantidad a entregar.'; end if;
  return v_id;
end $$;
revoke execute on function registrar_entrega_area(uuid, uuid, uuid, jsonb, text, text) from public, anon;
grant execute on function registrar_entrega_area(uuid, uuid, uuid, jsonb, text, text) to authenticated;

notify pgrst, 'reload schema';
