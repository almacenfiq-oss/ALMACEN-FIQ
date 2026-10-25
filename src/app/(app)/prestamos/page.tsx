import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requierePerfil } from "@/lib/sesion";
import { cant, fecha, fechaHora, patron } from "@/lib/formato";

export const metadata: Metadata = { title: "Préstamos" };

const VISTAS = { abiertos: "Abiertos", vencidos: "Vencidos", reponer: "Reposición pendiente", cerrados: "Cerrados" } as const;

type Prestamo = { id: string; numero: number; fecha: string; fecha_limite: string; alumno: string; alumno_codigo: string; alumno_id: string; motivo: string | null; estado: string; pendiente: number; deuda: number; items: number; vencido: boolean };

export default async function Prestamos({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string }> }) {
  await requierePerfil(["admin", "almacen"]);
  const f = await searchParams;
  const ver = (f.ver && f.ver in VISTAS ? f.ver : "abiertos") as keyof typeof VISTAS;
  const supabase = await createClient();
  let q = supabase.from("v_prestamos").select("*").order("fecha_limite").limit(300);
  if (ver === "abiertos") q = q.eq("estado", "abierto");
  if (ver === "vencidos") q = q.eq("vencido", true);
  if (ver === "reponer") q = q.gt("deuda", 0);
  if (ver === "cerrados") q = q.eq("estado", "cerrado").order("cerrado_en", { ascending: false });
  if (f.q?.trim()) {
    const p = patron(f.q);
    q = q.or(`alumno.ilike.${p},alumno_codigo.ilike.${p},motivo.ilike.${p}`);
  }
  const { data } = await q;
  const prestamos = (data ?? []) as Prestamo[];

  return (
    <>
      <div className="head">
        <div>
          <h1>Préstamos a alumnos</h1>
          <p className="sub">Material de vidrio, equipos y otros materiales que los alumnos deben devolver.</p>
        </div>
        <Link className="btn primary" href="/prestamos/nuevo">Nuevo préstamo</Link>
      </div>
      <nav className="tabs" aria-label="Ver">
        {Object.entries(VISTAS).map(([k, t]) => (
          <Link key={k} href={`/prestamos?ver=${k}`} className={`tab ${ver === k ? "on" : ""}`} aria-current={ver === k ? "page" : undefined}>{t}</Link>
        ))}
      </nav>
      <form method="get" className="scan">
        <input type="hidden" name="ver" value={ver} />
        <input name="q" defaultValue={f.q} placeholder="Buscar por alumno, código o curso" aria-label="Buscar" />
        <button className="btn" type="submit">Buscar</button>
      </form>
      {prestamos.length === 0 ? (
        <div className="empty">No hay préstamos {VISTAS[ver].toLowerCase()}.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>N.º</th><th>Alumno</th><th>Curso</th><th>Prestado</th><th>Devolver</th><th className="r">Pendiente</th><th>Estado</th></tr></thead>
            <tbody>
              {prestamos.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/prestamos/${p.id}`} className="mono">{p.numero}</Link></td>
                  <td><Link href={`/alumnos/${p.alumno_id}`}>{p.alumno}</Link> <span className="muted mono">{p.alumno_codigo}</span></td>
                  <td>{p.motivo ?? "—"}</td>
                  <td>{fechaHora(p.fecha)}</td>
                  <td>{fecha(p.fecha_limite)}</td>
                  <td className="r num">{p.pendiente > 0 ? cant(p.pendiente) : "—"}</td>
                  <td>
                    <span className="row" style={{ gap: 4 }}>
                      {p.vencido ? <span className="chip vencido">Vencido</span> : <span className={`chip ${p.estado}`}>{p.estado === "abierto" ? "Abierto" : "Cerrado"}</span>}
                      {p.deuda > 0 && <span className="chip bajo">Debe reponer {cant(p.deuda)}</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
