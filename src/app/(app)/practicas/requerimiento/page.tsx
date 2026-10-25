import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requierePerfil } from "@/lib/sesion";
import { semestres as listaSemestres } from "@/lib/consultas";
import { cant } from "@/lib/formato";
import { TIPOS } from "@/lib/tipos";

export const metadata: Metadata = { title: "Total del semestre" };

type Fila = {
  articulo_id: string; codigo: string; nombre: string; tipo: keyof typeof TIPOS; formula: string | null; unidad: string; familia: string | null;
  ubicacion: string | null; fiscalizado: boolean; practicas: number; requerido: number; requerido_con_margen: number; entregado: number;
  pendiente: number; utilizable: number; faltante: number;
};

export default async function Requerimiento({ searchParams }: { searchParams: Promise<{ semestre?: string; tipo?: string; solo?: string }> }) {
  await requierePerfil(["admin", "almacen"]);
  const f = await searchParams;
  const sems = await listaSemestres();
  const sem = sems.find((s) => s.id === f.semestre) ?? sems.find((s) => s.activo) ?? sems[0];
  const supabase = await createClient();
  let q = supabase.from("v_requerimiento").select("*").eq("semestre_id", sem?.id ?? "").order("tipo").order("familia").order("nombre");
  if (f.tipo && f.tipo in TIPOS) q = q.eq("tipo", f.tipo);
  if (f.solo === "falta") q = q.gt("faltante", 0);
  if (f.solo === "pendiente") q = q.gt("pendiente", 0);
  const { data } = await q;
  const filas = (data ?? []) as Fila[];
  const faltan = filas.filter((x) => x.faltante > 0).length;

  const csv =
    "﻿" +
    [["Código", "Artículo", "Tipo", "Familia", "Unidad", "Prácticas", "Requerido", `Con margen ${sem?.margen_pct ?? 0}%`, "Entregado", "Pendiente", "Disponible", "Falta comprar"]]
      .concat(filas.map((x) => [x.codigo, x.nombre, TIPOS[x.tipo], x.familia ?? "", x.unidad, x.practicas, x.requerido, x.requerido_con_margen, x.entregado, x.pendiente, x.utilizable, x.faltante].map(String)))
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");

  return (
    <>
      <div className="head">
        <div>
          <p className="sub"><Link href={`/practicas?semestre=${sem?.id}`}>Prácticas</Link></p>
          <h1>Total del semestre {sem?.nombre}</h1>
          <p className="sub">
            Suma de lo que piden todas las prácticas{sem?.margen_pct ? `, con ${sem.margen_pct} % extra por derrames o repeticiones` : ""}, comparada con lo que hay en el almacén.
          </p>
        </div>
        <div className="row no-print">
          <a className="btn" href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`} download={`requerimiento-${sem?.nombre ?? ""}.csv`}>Descargar Excel</a>
        </div>
      </div>

      <form className="filters no-print" method="get">
        <div className="field">
          <label htmlFor="r-sem">Semestre</label>
          <select id="r-sem" name="semestre" defaultValue={sem?.id}>
            {sems.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="r-tipo">Tipo</label>
          <select id="r-tipo" name="tipo" defaultValue={f.tipo ?? ""}>
            <option value="">Todos</option>
            {Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="r-solo">Mostrar</label>
          <select id="r-solo" name="solo" defaultValue={f.solo ?? ""}>
            <option value="">Todo</option>
            <option value="pendiente">Lo que falta entregar</option>
            <option value="falta">Lo que no alcanza (comprar)</option>
          </select>
        </div>
        <div className="row"><button className="btn primary" type="submit">Ver</button></div>
      </form>

      {faltan > 0 && <div className="aviso">{faltan} artículo(s) no alcanzan para todo el semestre. Revisa la columna “Falta”.</div>}

      {filas.length === 0 ? (
        <div className="empty">No hay prácticas con artículos en este semestre.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Artículo</th><th>Familia</th><th className="r">Prácticas</th><th className="r">Requerido</th>
                <th className="r">Entregado</th><th className="r">Por entregar</th><th className="r">Disponible</th><th className="r">Falta</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((x) => (
                <tr key={x.articulo_id}>
                  <td>
                    <Link href={`/inventario/${x.articulo_id}`}>{x.nombre}</Link> {x.formula && <span className="formula">{x.formula}</span>}
                    {x.fiscalizado && <> <span className="chip fisc">Fiscalizado</span></>}
                    <div className="muted" style={{ fontSize: 12 }}>{TIPOS[x.tipo]}{x.ubicacion ? ` · ${x.ubicacion}` : ""}</div>
                  </td>
                  <td>{x.familia ?? "—"}</td>
                  <td className="r num">{x.practicas}</td>
                  <td className="r num">{cant(x.requerido_con_margen)} {x.unidad}</td>
                  <td className="r num">{x.entregado > 0 ? cant(x.entregado) : "—"}</td>
                  <td className="r num">{cant(x.pendiente)}</td>
                  <td className="r num">{cant(x.utilizable)}</td>
                  <td className={`r num ${x.faltante > 0 ? "falta" : ""}`}>{x.faltante > 0 ? `${cant(x.faltante)} ${x.unidad}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
