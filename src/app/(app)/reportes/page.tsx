import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requierePerfil } from "@/lib/sesion";
import { semestres as listaSemestres } from "@/lib/consultas";
import { cant } from "@/lib/formato";
import { TIPOS, type TipoArticulo } from "@/lib/tipos";

export const metadata: Metadata = { title: "Reportes" };

type Consumo = { id: string; cantidad: number; fecha: string; numero: number; docente_id: string; docente: string; area: string | null; practica_id: string | null; articulo_id: string; codigo: string; nombre: string; tipo: TipoArticulo; unidad: string; fiscalizado: boolean; familia: string | null };

function Barras({ filas, max }: { filas: { et: string; val: number; texto: string; href?: string }[]; max?: number }) {
  const tope = max ?? Math.max(1, ...filas.map((f) => f.val));
  if (!filas.length) return <div className="empty">Sin datos todavía.</div>;
  return (
    <div className="barras">
      {filas.map((f) => (
        <div className="barra" key={f.et}>
          <span className="et" title={f.et}>{f.href ? <Link href={f.href}>{f.et}</Link> : f.et}</span>
          <span className="pista"><span style={{ width: `${(f.val / tope) * 100}%` }} /></span>
          <span className="val num">{f.texto}</span>
        </div>
      ))}
    </div>
  );
}

function agrupar<T>(xs: T[], clave: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(clave(x), [...(m.get(clave(x)) ?? []), x]);
  return m;
}

export default async function Reportes({ searchParams }: { searchParams: Promise<{ semestre?: string; tipo?: string }> }) {
  await requierePerfil(["admin", "almacen"]);
  const f = await searchParams;
  const sems = await listaSemestres();
  const sem = sems.find((s) => s.id === f.semestre) ?? sems.find((s) => s.activo) ?? sems[0];
  const tipo = (f.tipo && f.tipo in TIPOS ? f.tipo : "reactivo") as TipoArticulo;
  const supabase = await createClient();

  const [{ data: cons }, { data: practicas }, { data: prest }, { data: roturas }, { data: alertas }] = await Promise.all([
    supabase.from("v_consumo").select("*").eq("semestre_id", sem?.id ?? "").limit(20000),
    supabase.from("v_practicas").select("id, estado, estado_entrega, items").eq("semestre_id", sem?.id ?? ""),
    supabase.from("v_prestamos").select("id, estado, vencido, deuda").limit(20000),
    supabase.from("prestamo_items").select("roto, perdido, articulos(id, nombre)").or("roto.gt.0,perdido.gt.0"),
    supabase.from("v_articulos").select("estado_stock, vencido").eq("activo", true),
  ]);
  const consumo = (cons ?? []) as Consumo[];
  const delTipo = consumo.filter((c) => c.tipo === tipo);

  const entregas = new Set(consumo.map((c) => c.numero)).size;
  const docentes = new Set(consumo.map((c) => c.docente_id)).size;
  const pr = practicas ?? [];
  const entregadas = pr.filter((p) => p.estado_entrega === "entregada").length;

  // Entregas por área y por docente (número de entregas distintas)
  const porArea = [...agrupar(consumo, (c) => c.area ?? "Sin área")].map(([et, xs]) => ({ et, val: new Set(xs.map((x) => x.numero)).size }));
  const porDocente = [...agrupar(consumo, (c) => c.docente)].map(([et, xs]) => ({ et, val: new Set(xs.map((x) => x.numero)).size }));
  // Artículos más usados del tipo elegido (cada uno en su unidad)
  const porArticulo = [...agrupar(delTipo, (c) => c.articulo_id)]
    .map(([id, xs]) => ({ id, nombre: xs[0].nombre, unidad: xs[0].unidad, total: xs.reduce((s, x) => s + Number(x.cantidad), 0), veces: xs.length }))
    .sort((a, b) => b.veces - a.veces || b.total - a.total)
    .slice(0, 25);
  const porFamilia = [...agrupar(consumo.filter((c) => c.tipo === "reactivo"), (c) => c.familia ?? "Sin clasificar")].map(([et, xs]) => ({ et, val: new Set(xs.map((x) => x.articulo_id)).size }));
  const fiscalizados = [...agrupar(consumo.filter((c) => c.fiscalizado), (c) => c.articulo_id)].map(([id, xs]) => ({
    id, nombre: xs[0].nombre, unidad: xs[0].unidad,
    meses: [...agrupar(xs, (x) => x.fecha.slice(0, 7))].map(([mes, ys]) => ({ mes, total: ys.reduce((s, y) => s + Number(y.cantidad), 0) })).sort((a, b) => a.mes.localeCompare(b.mes)),
  }));

  const prestamos = prest ?? [];
  type Rot = { roto: number; perdido: number; articulos: { id: string; nombre: string } };
  const rot = [...agrupar((roturas ?? []) as unknown as Rot[], (r) => r.articulos.id)]
    .map(([id, xs]) => ({ id, nombre: xs[0].articulos.nombre, val: xs.reduce((s, x) => s + Number(x.roto) + Number(x.perdido), 0) }))
    .sort((a, b) => b.val - a.val)
    .slice(0, 15);
  const bajos = (alertas ?? []).filter((a) => a.estado_stock !== "ok").length;
  const vencidos = (alertas ?? []).filter((a) => Number(a.vencido) > 0).length;
  const orden = (xs: { et: string; val: number }[]) => xs.sort((a, b) => b.val - a.val).map((x) => ({ ...x, texto: String(x.val) }));

  return (
    <>
      <div className="head">
        <div>
          <h1>Reportes {sem && <span className="muted">{sem.nombre}</span>}</h1>
          <p className="sub">Consumo por área, docente y artículo; préstamos y roturas.</p>
        </div>
        <form method="get" className="row">
          <select name="semestre" defaultValue={sem?.id} aria-label="Semestre" style={{ width: "auto" }}>
            {sems.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <button className="btn" type="submit">Ver</button>
        </form>
      </div>

      <div className="stats">
        <div className="stat"><b>{pr.length}</b><span>Prácticas registradas</span></div>
        <div className="stat"><b>{entregadas}</b><span>Prácticas entregadas completas</span></div>
        <div className="stat"><b>{entregas}</b><span>Entregas a docentes</span></div>
        <div className="stat"><b>{docentes}</b><span>Docentes atendidos</span></div>
        <div className="stat"><b>{prestamos.filter((p) => p.estado === "abierto").length}</b><span>Préstamos abiertos</span></div>
        <div className="stat"><b>{prestamos.filter((p) => p.vencido).length}</b><span>Préstamos vencidos</span></div>
        <div className="stat"><b>{bajos}</b><span><Link href="/inventario?alerta=bajo">Artículos con stock bajo</Link></span></div>
        <div className="stat"><b>{vencidos}</b><span><Link href="/inventario?alerta=vence">Reactivos con lotes vencidos</Link></span></div>
      </div>

      <div className="grid2">
        <section className="panel"><h2>Entregas por área</h2><Barras filas={orden(porArea)} /></section>
        <section className="panel"><h2>Entregas por docente</h2><Barras filas={orden(porDocente).slice(0, 20)} /></section>
      </div>

      <section className="panel">
        <h2>
          Lo más usado
          <span className="row" style={{ gap: 4 }}>
            {Object.entries(TIPOS).map(([k, t]) => (
              <Link key={k} className={`btn small ${k === tipo ? "primary" : ""}`} href={`/reportes?semestre=${sem?.id}&tipo=${k}`}>{t}</Link>
            ))}
          </span>
        </h2>
        {porArticulo.length === 0 ? (
          <div className="empty">Sin entregas de este tipo en el semestre.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Artículo</th><th className="r">Veces entregado</th><th className="r">Cantidad total</th></tr></thead>
              <tbody>
                {porArticulo.map((a) => (
                  <tr key={a.id}><td><Link href={`/inventario/${a.id}`}>{a.nombre}</Link></td><td className="r num">{a.veces}</td><td className="r num">{cant(a.total)} {a.unidad}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid2">
        <section className="panel"><h2>Reactivos usados por familia</h2><p className="ayuda">Número de reactivos distintos entregados.</p><Barras filas={orden(porFamilia)} /></section>
        <section className="panel">
          <h2>Material roto o perdido</h2>
          <p className="ayuda">En todos los préstamos.</p>
          <Barras filas={rot.map((r) => ({ et: r.nombre, val: r.val, texto: cant(r.val), href: `/inventario/${r.id}` }))} />
        </section>
      </div>

      <section className="panel">
        <h2>Insumos fiscalizados (SUNAT): consumo por mes</h2>
        {fiscalizados.length === 0 ? (
          <div className="empty">No se entregaron insumos fiscalizados en el semestre.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Insumo</th><th>Mes</th><th className="r">Cantidad</th></tr></thead>
              <tbody>
                {fiscalizados.flatMap((x) =>
                  x.meses.map((m, i) => (
                    <tr key={`${x.id}-${m.mes}`}>
                      <td>{i === 0 ? <Link href={`/kardex?articulo=${x.id}&desde=${m.mes}-01`}>{x.nombre}</Link> : ""}</td>
                      <td>{m.mes}</td>
                      <td className="r num">{cant(m.total)} {x.unidad}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="ayuda">Para el detalle completo (ingresos y salidas) usa el <Link href="/kardex?fisc=1">kardex de fiscalizados</Link>.</p>
      </section>
    </>
  );
}
