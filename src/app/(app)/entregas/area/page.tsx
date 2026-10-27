import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requierePerfil } from "@/lib/sesion";
import { docentesActivos, semestres as listaSemestres } from "@/lib/consultas";
import { fechaHora } from "@/lib/formato";
import { ESTADO_ENTREGA } from "@/lib/tipos";
import FormEntregaArea, { type FilaReparto } from "@/components/FormEntregaArea";

export const metadata: Metadata = { title: "Entrega por área" };

export default async function EntregaArea({ searchParams }: { searchParams: Promise<{ semestre?: string; area?: string }> }) {
  await requierePerfil(["admin", "almacen"]);
  const f = await searchParams;
  const sems = await listaSemestres();
  const sem = sems.find((s) => s.id === f.semestre) ?? sems.find((s) => s.activo) ?? sems[0];
  const supabase = await createClient();
  // Áreas con prácticas en el semestre
  const { data: pracs } = await supabase.from("v_practicas").select("id, nombre, curso, numero, docente, area_id, area, estado, estado_entrega").eq("semestre_id", sem?.id ?? "").order("curso");
  const areas = [...new Map((pracs ?? []).filter((p) => p.area_id).map((p) => [p.area_id as string, p.area as string])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const sinArea = (pracs ?? []).filter((p) => !p.area_id).length;
  const area = areas.find(([id]) => id === f.area)?.[0] ?? null;

  let filas: FilaReparto[] = [];
  let entregas: { id: string; numero: number; fecha: string; recibe: string | null }[] = [];
  const docentes = await docentesActivos();
  if (area) {
    const [{ data: rep }, { data: ent }] = await Promise.all([
      supabase.from("v_reparto").select("*").eq("semestre_id", sem!.id).eq("area_id", area).order("tipo").order("nombre"),
      supabase.from("entregas").select("id, numero, fecha, recibe").eq("semestre_id", sem!.id).eq("area_id", area).order("fecha"),
    ]);
    filas = (rep ?? []) as FilaReparto[];
    entregas = ent ?? [];
  }
  const practicasArea = (pracs ?? []).filter((p) => p.area_id === area);

  return (
    <>
      <div className="head">
        <div>
          <p className="sub"><Link href="/entregas">Entregas</Link></p>
          <h1>Entrega por área</h1>
          <p className="sub">Suma lo que piden todas las prácticas del área en el semestre. Lo ideal es entregarlo en una sola tanda; si no alcanza o no se lleva todo, lo que falte queda pendiente para otra entrega.</p>
        </div>
      </div>

      <form className="filters" method="get">
        <div className="field">
          <label htmlFor="ea-sem">Semestre</label>
          <select id="ea-sem" name="semestre" defaultValue={sem?.id}>
            {sems.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ea-area">Área</label>
          <select id="ea-area" name="area" defaultValue={area ?? ""}>
            <option value="" disabled>Elige…</option>
            {areas.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
        </div>
        <div className="row"><button className="btn primary" type="submit">Ver</button></div>
      </form>
      {sinArea > 0 && <p className="ayuda">{sinArea} práctica(s) de este semestre no tienen área; asígnasela en la práctica (Editar datos) para que entren aquí.</p>}

      {!area ? (
        <div className="empty">{areas.length ? "Elige un área para ver lo que le toca." : "No hay prácticas con área en este semestre."}</div>
      ) : (
        <>
          <section className="panel">
            <h2>Prácticas del área ({practicasArea.length})</h2>
            <ul className="list">
              {practicasArea.map((p) => (
                <li key={p.id}>
                  <span><Link href={`/practicas/${p.id}`}>{p.curso} · {p.numero ? `${p.numero}. ` : ""}{p.nombre}</Link> <span className="muted">· {p.docente}</span></span>
                  <span className="row" style={{ gap: 6 }}>
                    {p.estado === "borrador" && <span className="chip borrador">Borrador</span>}
                    <span className={`chip ${p.estado_entrega}`}>{ESTADO_ENTREGA[p.estado_entrega as keyof typeof ESTADO_ENTREGA]}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <h2>Qué entregar</h2>
            <FormEntregaArea
              semestreId={sem!.id}
              areaId={area}
              filas={filas}
              docentes={[...docentes].sort((a, b) => Number(b.area_id === area) - Number(a.area_id === area))}
            />
          </section>
          {entregas.length > 0 && (
            <section className="panel">
              <h2>Entregas anteriores a esta área</h2>
              <ul className="list">
                {entregas.map((e) => (
                  <li key={e.id}>
                    <Link href={`/entregas/${e.id}`}>Entrega N.º {e.numero}</Link>
                    <span className="meta">{fechaHora(e.fecha)}{e.recibe ? ` · recibió ${e.recibe}` : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
