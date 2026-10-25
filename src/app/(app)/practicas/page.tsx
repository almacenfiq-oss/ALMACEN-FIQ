import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { esPersonal, requierePerfil } from "@/lib/sesion";
import { areasActivas, docentesActivos, semestres as listaSemestres } from "@/lib/consultas";
import { fecha } from "@/lib/formato";
import { ESTADO_ENTREGA } from "@/lib/tipos";

export const metadata: Metadata = { title: "Prácticas" };


type Practica = {
  id: string; curso: string; numero: number | null; nombre: string; fecha: string | null; docente: string; area: string | null;
  secciones: number; grupos_por_seccion: number; estado: string; items: number; estado_entrega: string;
};

export default async function Practicas({ searchParams }: { searchParams: Promise<{ semestre?: string; area?: string; docente?: string; estado?: string }> }) {
  const perfil = await requierePerfil();
  const f = await searchParams;
  const semestres = await listaSemestres();
  const semestre = semestres.find((s) => s.id === f.semestre) ?? semestres.find((s) => s.activo) ?? semestres[0];
  const personal = esPersonal(perfil);
  const supabase = await createClient();

  let q = supabase.from("v_practicas").select("*").order("curso").order("numero", { nullsFirst: false }).order("nombre");
  if (semestre) q = q.eq("semestre_id", semestre.id);
  if (f.area) q = q.eq("area_id", f.area);
  if (f.docente) q = q.eq("docente_id", f.docente);
  if (f.estado === "enviada" || f.estado === "borrador") q = q.eq("estado", f.estado);
  else if (f.estado) q = q.eq("estado_entrega", f.estado);
  const [{ data }, areas, docentes] = await Promise.all([q, areasActivas(), personal ? docentesActivos() : Promise.resolve([])]);
  const practicas = (data ?? []) as Practica[];

  return (
    <>
      <div className="head">
        <div>
          <h1>Prácticas {semestre && <span className="muted">{semestre.nombre}</span>}</h1>
          <p className="sub">
            {personal
              ? "Lo que cada docente pidió para sus prácticas. El total del semestre se calcula solo."
              : "Registra lo que necesitas para cada práctica y envíala al almacén."}
          </p>
        </div>
        <div className="row">
          {personal && semestre && <Link className="btn" href={`/practicas/requerimiento?semestre=${semestre.id}`}>Total del semestre</Link>}
          {(personal || perfil.docente_id) && <Link className="btn primary" href="/practicas/nueva">Nueva práctica</Link>}
        </div>
      </div>
      {!personal && !perfil.docente_id && (
        <div className="aviso">Tu cuenta aún no está enlazada a tu ficha de docente. Pide al almacén que la enlace en Configuración → Docentes.</div>
      )}

      <form className="filters" method="get">
        <div className="field">
          <label htmlFor="f-sem">Semestre</label>
          <select id="f-sem" name="semestre" defaultValue={semestre?.id}>
            {semestres.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-area">Área</label>
          <select id="f-area" name="area" defaultValue={f.area ?? ""}>
            <option value="">Todas</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>
        {personal && (
          <div className="field">
            <label htmlFor="f-doc">Docente</label>
            <select id="f-doc" name="docente" defaultValue={f.docente ?? ""}>
              <option value="">Todos</option>
              {docentes.map((d) => <option key={d.id} value={d.id}>{d.nombres}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="f-est">Estado</label>
          <select id="f-est" name="estado" defaultValue={f.estado ?? ""}>
            <option value="">Todos</option>
            <option value="borrador">En borrador</option>
            <option value="enviada">Enviada al almacén</option>
            <option value="pendiente">Por entregar</option>
            <option value="parcial">Entrega parcial</option>
            <option value="entregada">Entregada</option>
          </select>
        </div>
        <div className="row"><button className="btn primary" type="submit">Filtrar</button></div>
      </form>

      {practicas.length === 0 ? (
        <div className="empty">No hay prácticas registradas{semestre ? ` en ${semestre.nombre}` : ""}.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Curso</th><th>Práctica</th><th>Docente</th><th>Área</th><th>Grupos</th><th>Fecha</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {practicas.map((p) => (
                <tr key={p.id}>
                  <td>{p.curso}</td>
                  <td><Link href={`/practicas/${p.id}`}>{p.numero ? `${p.numero}. ` : ""}{p.nombre}</Link> <span className="muted">· {p.items} artículos</span></td>
                  <td>{p.docente}</td>
                  <td>{p.area ?? "—"}</td>
                  <td className="num">{p.secciones} × {p.grupos_por_seccion}</td>
                  <td>{fecha(p.fecha)}</td>
                  <td>
                    <span className="row" style={{ gap: 4 }}>
                      <span className={`chip ${p.estado}`}>{p.estado === "borrador" ? "Borrador" : "Enviada"}</span>
                      {p.items > 0 && <span className={`chip ${p.estado_entrega}`}>{ESTADO_ENTREGA[p.estado_entrega]}</span>}
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
