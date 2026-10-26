import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { esPersonal, requierePerfil } from "@/lib/sesion";
import { cant, fecha, hoy, patron, sumarDias } from "@/lib/formato";
import { enEnvases } from "@/lib/unidades";
import { TIPOS, type ArticuloVista } from "@/lib/tipos";
import { EstadoStock, Pictogramas } from "@/components/Etiquetas";
import Icono, { ICONO_TIPO } from "@/components/Iconos";

export const metadata: Metadata = { title: "Inventario" };

type Filtros = { q?: string; tipo?: string; familia?: string; ubicacion?: string; alerta?: string; inactivos?: string; sub?: string };

export default async function Inventario({ searchParams }: { searchParams: Promise<Filtros> }) {
  const perfil = await requierePerfil();
  const f = await searchParams;
  const supabase = await createClient();

  let consulta = supabase.from("v_articulos").select("*").order("tipo").order("nombre").limit(500);
  if (!f.inactivos) consulta = consulta.eq("activo", true);
  if (f.tipo && f.tipo in TIPOS) consulta = consulta.eq("tipo", f.tipo);
  if (f.familia === "sin") consulta = consulta.eq("tipo", "reactivo").is("familia_id", null);
  else if (f.familia) consulta = consulta.eq("familia_raiz_id", f.familia);
  if (f.sub) consulta = consulta.eq("familia_id", f.sub);
  if (f.ubicacion) consulta = consulta.eq("ubicacion_id", f.ubicacion);
  if (f.q?.trim()) {
    const p = patron(f.q);
    consulta = consulta.or(`nombre.ilike.${p},codigo.ilike.${p},formula.ilike.${p},cas.ilike.${p},codigo_barras.ilike.${p},marca.ilike.${p}`);
  }
  if (f.alerta === "bajo") consulta = consulta.neq("estado_stock", "ok");
  if (f.alerta === "vence") consulta = consulta.or(`vencido.gt.0,proximo_vencimiento.lte.${sumarDias(hoy(), 90)}`);
  if (f.alerta === "fisc") consulta = consulta.eq("fiscalizado", true);
  if (f.alerta === "prestado") consulta = consulta.gt("prestado", 0);

  const [{ data }, { data: familias }, { data: ubicaciones }] = await Promise.all([
    consulta,
    supabase.from("familias").select("id, nombre").is("padre_id", null).order("orden"),
    supabase.from("ubicaciones").select("id, nombre").eq("activa", true).order("nombre"),
  ]);
  const articulos = (data ?? []) as ArticuloVista[];
  const personal = esPersonal(perfil);

  return (
    <>
      <div className="head">
        <div>
          <h1>Inventario</h1>
          <p className="sub">Reactivos, material de vidrio, equipos y otros materiales del almacén.</p>
        </div>
        {personal && (
          <div className="row">
            <Link className="btn" href="/inventario/importar">Importar desde Excel</Link>
            <Link className="btn primary" href="/inventario/nuevo">Nuevo artículo</Link>
          </div>
        )}
      </div>

      <form className="filters" method="get">
        <div className="field grow">
          <label htmlFor="f-q">Buscar</label>
          <input id="f-q" name="q" defaultValue={f.q} placeholder="Nombre, fórmula, CAS, código o marca" />
        </div>
        <div className="field">
          <label htmlFor="f-tipo">Tipo</label>
          <select id="f-tipo" name="tipo" defaultValue={f.tipo ?? ""}>
            <option value="">Todos</option>
            {Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-fam">Clasificación</label>
          <select id="f-fam" name="familia" defaultValue={f.familia ?? ""}>
            <option value="">Todas</option>
            {(familias ?? []).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            <option value="sin">Reactivos sin clasificar</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-ubi">Ubicación</label>
          <select id="f-ubi" name="ubicacion" defaultValue={f.ubicacion ?? ""}>
            <option value="">Todas</option>
            {(ubicaciones ?? []).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-al">Mostrar</label>
          <select id="f-al" name="alerta" defaultValue={f.alerta ?? ""}>
            <option value="">Todo</option>
            <option value="bajo">Stock bajo o agotado</option>
            <option value="vence">Vencidos o vencen en 90 días</option>
            <option value="fisc">Fiscalizados (SUNAT)</option>
            <option value="prestado">Prestados a alumnos</option>
          </select>
        </div>
        {f.sub && <input type="hidden" name="sub" value={f.sub} />}
        <div className="row">
          <button className="btn primary" type="submit">Filtrar</button>
          <Link className="btn" href="/inventario">Limpiar</Link>
        </div>
      </form>

      {articulos.length === 0 ? (
        <div className="empty">No hay artículos con esos filtros.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Artículo</th>
                <th>Clasificación</th>
                <th>Ubicación</th>
                <th className="r">Stock</th>
                <th className="r">Prestado</th>
                <th className="r">Disponible</th>
                <th>Vence</th>
              </tr>
            </thead>
            <tbody>
              {articulos.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.codigo}</td>
                  <td>
                    <Link href={`/inventario/${a.id}`}>{a.nombre}</Link>{" "}
                    {a.formula && <span className="formula">{a.formula}</span>}
                    <div className="row" style={{ gap: 6, marginTop: 2 }}>
                      <span className="tipo-ico" title={TIPOS[a.tipo]}><Icono nombre={ICONO_TIPO[a.tipo]} tam={15} />{a.tipo !== "reactivo" ? `${TIPOS[a.tipo]}${a.capacidad ? ` · ${a.capacidad}` : ""}` : ""}</span>
                      <EstadoStock estado={a.estado_stock} />
                      {a.fiscalizado && <span className="chip fisc">Fiscalizado</span>}
                      <Pictogramas codigos={a.pictogramas} />
                    </div>
                  </td>
                  <td>{a.tipo === "reactivo" ? (a.familia ? <>{a.familia}{a.subfamilia && <div className="muted" style={{ fontSize: 13 }}>{a.subfamilia}</div>}</> : <span className="muted">Sin clasificar</span>) : "—"}</td>
                  <td>{a.ubicacion ?? <span className="muted">—</span>}</td>
                  <td className="r num">
                    {cant(a.stock)} <span className="muted">{a.unidad}</span>
                    {a.contenido && a.stock > 0 && <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{enEnvases(a.stock, a.contenido, a.envase, a.unidad)}</div>}
                  </td>
                  <td className="r num">{a.prestado > 0 ? cant(a.prestado) : "—"}</td>
                  <td className="r num"><b>{cant(a.utilizable)}</b></td>
                  <td>
                    {a.vencido > 0 && <span className="chip vencido">{cant(a.vencido)} vencido</span>}
                    {a.proximo_vencimiento ? fecha(a.proximo_vencimiento) : a.vencido > 0 ? "" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {articulos.length === 500 && <p className="ayuda">Se muestran los primeros 500. Usa los filtros para acotar.</p>}
    </>
  );
}
