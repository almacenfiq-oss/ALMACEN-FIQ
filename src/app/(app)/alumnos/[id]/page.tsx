import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requierePerfil } from "@/lib/sesion";
import { cant, fecha, fechaHora } from "@/lib/formato";
import FormAlumno from "@/components/FormAlumno";

export const metadata: Metadata = { title: "Alumno" };

export default async function Alumno({ params }: { params: Promise<{ id: string }> }) {
  await requierePerfil(["admin", "almacen"]);
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: a }, { data: prestamos }] = await Promise.all([
    supabase.from("v_alumnos").select("*").eq("id", id).maybeSingle(),
    supabase.from("v_prestamos").select("*").eq("alumno_id", id).order("fecha", { ascending: false }),
  ]);
  if (!a) notFound();
  return (
    <>
      <div className="head">
        <div>
          <p className="sub"><Link href="/alumnos">Alumnos</Link></p>
          <h1>{a.nombres}</h1>
          <p className="sub"><span className="mono">{a.codigo}</span>{a.escuela ? ` · ${a.escuela}` : ""}{a.telefono ? ` · ${a.telefono}` : ""}</p>
        </div>
        {!a.bloqueo && <Link className="btn primary" href={`/prestamos/nuevo?alumno=${a.id}`}>Prestarle material</Link>}
      </div>
      {a.bloqueo ? <div className="alert error">No puede llevar material: {a.bloqueo}</div> : <div className="alert ok">Al día: puede llevar material prestado.</div>}
      <section className="panel">
        <h2>Préstamos</h2>
        {(prestamos ?? []).length === 0 ? (
          <div className="empty">Todavía no tiene préstamos.</div>
        ) : (
          <ul className="list">
            {(prestamos ?? []).map((p) => (
              <li key={p.id}>
                <span>
                  <Link href={`/prestamos/${p.id}`}>Préstamo N.º {p.numero}</Link> · {p.motivo ?? "sin curso"}{" "}
                  {p.vencido ? <span className="chip vencido">Vencido</span> : <span className={`chip ${p.estado}`}>{p.estado === "abierto" ? "Abierto" : "Cerrado"}</span>}{" "}
                  {p.deuda > 0 && <span className="chip bajo">Debe reponer {cant(p.deuda)}</span>}
                </span>
                <span className="meta">Prestado {fechaHora(p.fecha)} · devolver {fecha(p.fecha_limite)} · {p.items} materiales</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <details className="panel">
        <summary><h2 style={{ display: "inline" }}>Editar datos</h2></summary>
        <FormAlumno inicial={a} />
      </details>
    </>
  );
}
