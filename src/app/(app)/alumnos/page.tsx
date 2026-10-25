import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requierePerfil } from "@/lib/sesion";
import { cant, patron } from "@/lib/formato";
import FormAlumno from "@/components/FormAlumno";

export const metadata: Metadata = { title: "Alumnos" };

type Alumno = { id: string; codigo: string; nombres: string; escuela: string | null; ciclo: string | null; prestamos_abiertos: number; prestamos_vencidos: number; deuda: number; bloqueo: string | null };

export default async function Alumnos({ searchParams }: { searchParams: Promise<{ q?: string; ver?: string }> }) {
  await requierePerfil(["admin", "almacen"]);
  const f = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("v_alumnos").select("id, codigo, nombres, escuela, ciclo, prestamos_abiertos, prestamos_vencidos, deuda, bloqueo").order("nombres").limit(300);
  if (f.q?.trim()) {
    const p = patron(f.q);
    q = q.or(`codigo.ilike.${p},nombres.ilike.${p},dni.ilike.${p},escuela.ilike.${p}`);
  }
  if (f.ver === "bloqueados") q = q.not("bloqueo", "is", null);
  const { data } = await q;
  const alumnos = (data ?? []) as Alumno[];
  return (
    <>
      <div className="head">
        <div>
          <h1>Alumnos</h1>
          <p className="sub">Quiénes piden material prestado y si tienen algo pendiente.</p>
        </div>
      </div>
      <form method="get" className="filters">
        <div className="field grow">
          <label htmlFor="a-q">Buscar</label>
          <input id="a-q" name="q" defaultValue={f.q} placeholder="Código, DNI, apellido o escuela" />
        </div>
        <div className="field">
          <label htmlFor="a-ver">Mostrar</label>
          <select id="a-ver" name="ver" defaultValue={f.ver ?? ""}>
            <option value="">Todos</option>
            <option value="bloqueados">Con préstamo vencido o reposición pendiente</option>
          </select>
        </div>
        <div className="row"><button className="btn primary" type="submit">Buscar</button></div>
      </form>
      {alumnos.length === 0 ? (
        <div className="empty">No hay alumnos con esos filtros.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Código</th><th>Alumno</th><th>Escuela</th><th className="r">Préstamos abiertos</th><th>Situación</th></tr></thead>
            <tbody>
              {alumnos.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.codigo}</td>
                  <td><Link href={`/alumnos/${a.id}`}>{a.nombres}</Link></td>
                  <td>{a.escuela ?? "—"}{a.ciclo ? ` · ciclo ${a.ciclo}` : ""}</td>
                  <td className="r num">{a.prestamos_abiertos || "—"}</td>
                  <td>
                    {a.bloqueo ? <span className="chip bloqueado">{a.prestamos_vencidos > 0 ? "Préstamo vencido" : a.deuda > 0 ? `Debe reponer ${cant(a.deuda)}` : "Bloqueado"}</span> : <span className="chip ok">Al día</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details className="panel">
        <summary><h2 style={{ display: "inline" }}>Registrar alumno</h2></summary>
        <FormAlumno />
      </details>
    </>
  );
}
