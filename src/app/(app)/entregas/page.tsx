import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { esPersonal, requierePerfil } from "@/lib/sesion";
import { docentesActivos, semestres as listaSemestres } from "@/lib/consultas";
import { fechaHora } from "@/lib/formato";

export const metadata: Metadata = { title: "Entregas" };

export default async function Entregas({ searchParams }: { searchParams: Promise<{ semestre?: string; docente?: string }> }) {
  const perfil = await requierePerfil();
  const f = await searchParams;
  const personal = esPersonal(perfil);
  const sems = await listaSemestres();
  const sem = sems.find((s) => s.id === f.semestre) ?? sems.find((s) => s.activo) ?? sems[0];
  const supabase = await createClient();
  let q = supabase
    .from("entregas")
    .select("id, numero, fecha, recibe, docentes(nombres), practicas!entregas_practica_id_fkey(nombre, curso), areas(nombre), entrega_items(count)")
    .order("fecha", { ascending: false })
    .limit(300);
  if (sem) q = q.eq("semestre_id", sem.id);
  if (f.docente) q = q.eq("docente_id", f.docente);
  const [{ data }, docentes] = await Promise.all([q, personal ? docentesActivos() : Promise.resolve([])]);
  type Fila = { id: string; numero: number; fecha: string; recibe: string | null; docentes: { nombres: string } | null; practicas: { nombre: string; curso: string } | null; areas: { nombre: string } | null; entrega_items: { count: number }[] };
  const entregas = (data ?? []) as unknown as Fila[];

  return (
    <>
      <div className="head">
        <div>
          <h1>Entregas a docentes</h1>
          <p className="sub">Reactivos y materiales entregados para las prácticas. No se devuelven al almacén.</p>
        </div>
        {personal && (
          <div className="row">
            <Link className="btn primary" href="/entregas/area">Entrega por área</Link>
            <Link className="btn" href="/entregas/nueva">Entrega sin práctica</Link>
          </div>
        )}
      </div>
      <form className="filters" method="get">
        <div className="field">
          <label htmlFor="e-sem">Semestre</label>
          <select id="e-sem" name="semestre" defaultValue={sem?.id}>
            {sems.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        {personal && (
          <div className="field">
            <label htmlFor="e-doc">Docente</label>
            <select id="e-doc" name="docente" defaultValue={f.docente ?? ""}>
              <option value="">Todos</option>
              {docentes.map((d) => <option key={d.id} value={d.id}>{d.nombres}</option>)}
            </select>
          </div>
        )}
        <div className="row"><button className="btn primary" type="submit">Filtrar</button></div>
      </form>
      {personal && <p className="ayuda">Para entregar lo de una práctica, ábrela en <Link href="/practicas">Prácticas</Link> y pulsa “Registrar entrega”. Para entregar en una sola tanda todo lo de un área en el semestre, usa <Link href="/entregas/area">Entrega por área</Link>.</p>}
      {entregas.length === 0 ? (
        <div className="empty">No hay entregas en este semestre.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>N.º</th><th>Fecha</th><th>Docente</th><th>Práctica o área</th><th>Recibió</th><th className="r">Artículos</th></tr></thead>
            <tbody>
              {entregas.map((e) => (
                <tr key={e.id}>
                  <td><Link href={`/entregas/${e.id}`} className="mono">{e.numero}</Link></td>
                  <td>{fechaHora(e.fecha)}</td>
                  <td>{e.docentes?.nombres}</td>
                  <td>{e.practicas ? `${e.practicas.curso} · ${e.practicas.nombre}` : e.areas ? <b>Área: {e.areas.nombre}</b> : <span className="muted">Sin práctica</span>}</td>
                  <td>{e.recibe ?? "—"}</td>
                  <td className="r num">{e.entrega_items[0]?.count ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
