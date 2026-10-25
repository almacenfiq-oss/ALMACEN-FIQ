import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requierePerfil } from "@/lib/sesion";
import { cant, fechaHora, hoy, patron, sumarDias } from "@/lib/formato";
import { MOVIMIENTOS, TIPOS } from "@/lib/tipos";

export const metadata: Metadata = { title: "Kardex" };

type Mov = { id: string; fecha: string; codigo: string; nombre: string; unidad: string; tipo: string; tipo_articulo: string; cantidad: number; signo: number; saldo: number; lote: string | null; documento: string | null; nota: string | null; usuario: string | null; articulo_id: string };

// Inicio del día en Lima (UTC−5) para filtrar por fecha local
const inicioLima = (f: string) => `${f}T00:00:00-05:00`;

export default async function Kardex({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string; articulo?: string; mov?: string; tipo?: string; q?: string; fisc?: string }> }) {
  await requierePerfil(["admin", "almacen"]);
  const f = await searchParams;
  const desde = f.desde ?? sumarDias(hoy(), -30);
  const hasta = f.hasta ?? hoy();
  const supabase = await createClient();
  let q = supabase
    .from("v_kardex")
    .select("*")
    .gte("fecha", inicioLima(desde))
    .lt("fecha", inicioLima(sumarDias(hasta, 1)))
    .order("fecha", { ascending: false })
    .limit(1000);
  if (f.articulo) q = q.eq("articulo_id", f.articulo);
  if (f.mov && f.mov in MOVIMIENTOS) q = q.eq("tipo", f.mov);
  if (f.tipo && f.tipo in TIPOS) q = q.eq("tipo_articulo", f.tipo);
  if (f.q?.trim()) {
    const p = patron(f.q);
    q = q.or(`nombre.ilike.${p},codigo.ilike.${p},documento.ilike.${p},nota.ilike.${p}`);
  }
  let fiscIds: string[] | null = null;
  if (f.fisc) {
    const { data: fis } = await supabase.from("articulos").select("id").eq("fiscalizado", true);
    fiscIds = (fis ?? []).map((x) => x.id);
    q = q.in("articulo_id", fiscIds.length ? fiscIds : ["00000000-0000-0000-0000-000000000000"]);
  }
  const { data } = await q;
  const movs = (data ?? []) as Mov[];
  const entradas = movs.filter((m) => m.signo > 0).length;

  const csv =
    "﻿" +
    [["Fecha", "Código", "Artículo", "Unidad", "Movimiento", "Lote", "Entra", "Sale", "Saldo", "Documento", "Nota", "Usuario"]]
      .concat(movs.map((m) => [fechaHora(m.fecha), m.codigo, m.nombre, m.unidad, MOVIMIENTOS[m.tipo], m.lote ?? "", m.signo > 0 ? String(m.cantidad) : "", m.signo < 0 ? String(m.cantidad) : "", String(m.saldo), m.documento ?? "", m.nota ?? "", m.usuario ?? ""]))
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");

  return (
    <>
      <div className="head">
        <div>
          <h1>Kardex</h1>
          <p className="sub">Todos los ingresos y salidas del almacén. {movs.length} movimientos ({entradas} ingresos).</p>
        </div>
        <a className="btn" href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`} download={`kardex-${desde}-a-${hasta}.csv`}>Descargar Excel</a>
      </div>
      <form className="filters" method="get">
        {f.articulo && <input type="hidden" name="articulo" value={f.articulo} />}
        <div className="field"><label htmlFor="k-d">Desde</label><input id="k-d" type="date" name="desde" defaultValue={desde} /></div>
        <div className="field"><label htmlFor="k-h">Hasta</label><input id="k-h" type="date" name="hasta" defaultValue={hasta} /></div>
        <div className="field">
          <label htmlFor="k-m">Movimiento</label>
          <select id="k-m" name="mov" defaultValue={f.mov ?? ""}>
            <option value="">Todos</option>
            {Object.entries(MOVIMIENTOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="k-t">Tipo</label>
          <select id="k-t" name="tipo" defaultValue={f.tipo ?? ""}>
            <option value="">Todos</option>
            {Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>
        <div className="field grow"><label htmlFor="k-q">Buscar</label><input id="k-q" name="q" defaultValue={f.q} placeholder="Artículo, código, documento o nota" /></div>
        <label className="check"><input type="checkbox" name="fisc" value="1" defaultChecked={!!f.fisc} /> Solo fiscalizados (SUNAT)</label>
        <div className="row">
          <button className="btn primary" type="submit">Filtrar</button>
          {f.articulo && <Link className="btn" href="/kardex">Todos los artículos</Link>}
        </div>
      </form>
      {movs.length === 0 ? (
        <div className="empty">No hay movimientos en esas fechas.</div>
      ) : (
        <div className="table-wrap">
          <table className="kardex">
            <thead><tr><th>Fecha</th><th>Artículo</th><th>Movimiento</th><th>Lote</th><th className="r">Entra</th><th className="r">Sale</th><th className="r">Saldo</th><th>Documento / nota</th><th>Usuario</th></tr></thead>
            <tbody>
              {movs.map((m) => (
                <tr key={m.id}>
                  <td>{fechaHora(m.fecha)}</td>
                  <td><Link href={`/inventario/${m.articulo_id}`}>{m.nombre}</Link> <span className="muted mono">{m.codigo}</span></td>
                  <td>{MOVIMIENTOS[m.tipo]}</td>
                  <td className="mono">{m.lote ?? ""}</td>
                  <td className="r in">{m.signo > 0 ? `${cant(m.cantidad)} ${m.unidad}` : ""}</td>
                  <td className="r out">{m.signo < 0 ? `${cant(m.cantidad)} ${m.unidad}` : ""}</td>
                  <td className="r saldo">{cant(m.saldo)}</td>
                  <td style={{ whiteSpace: "normal" }}>{[m.documento, m.nota].filter(Boolean).join(" · ")}</td>
                  <td>{m.usuario ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
