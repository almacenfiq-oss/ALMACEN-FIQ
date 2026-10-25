import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requierePerfil } from "@/lib/sesion";
import { articulosCortos, docentesActivos } from "@/lib/consultas";
import { hoy, patron, sumarDias } from "@/lib/formato";
import FormAlumno from "@/components/FormAlumno";
import FormPrestamo from "@/components/FormPrestamo";

export const metadata: Metadata = { title: "Nuevo préstamo" };

type Alumno = { id: string; codigo: string; nombres: string; escuela: string | null; prestamos_abiertos: number; bloqueo: string | null };

export default async function NuevoPrestamo({ searchParams }: { searchParams: Promise<{ alumno?: string; buscar?: string }> }) {
  await requierePerfil(["admin", "almacen"]);
  const { alumno: alumnoId, buscar } = await searchParams;
  const supabase = await createClient();

  let alumno: Alumno | null = null;
  let resultados: Alumno[] = [];
  if (alumnoId) {
    const { data } = await supabase.from("v_alumnos").select("id, codigo, nombres, escuela, prestamos_abiertos, bloqueo").eq("id", alumnoId).maybeSingle();
    alumno = data as Alumno | null;
  } else if (buscar?.trim()) {
    const p = patron(buscar);
    const { data } = await supabase.from("v_alumnos").select("id, codigo, nombres, escuela, prestamos_abiertos, bloqueo").or(`codigo.ilike.${p},nombres.ilike.${p},dni.ilike.${p}`).order("nombres").limit(20);
    resultados = (data ?? []) as Alumno[];
    if (resultados.length === 1 && resultados[0].codigo === buscar.trim()) alumno = resultados[0];
  }
  const [articulos, docentes] = alumno && !alumno.bloqueo ? await Promise.all([articulosCortos(true), docentesActivos()]) : [[], []];

  return (
    <>
      <div className="head">
        <div>
          <p className="sub"><Link href="/prestamos">Préstamos</Link></p>
          <h1>Nuevo préstamo</h1>
          <p className="sub">Solo material de vidrio, equipos y otros materiales. Los reactivos no se prestan.</p>
        </div>
      </div>

      {!alumno ? (
        <>
          <section className="panel">
            <h2>1. ¿Quién se lo lleva?</h2>
            <form method="get" className="scan">
              <input name="buscar" defaultValue={buscar} placeholder="Código universitario, DNI o apellido" autoFocus aria-label="Buscar alumno" />
              <button className="btn primary" type="submit">Buscar</button>
            </form>
            {buscar && resultados.length === 0 && <div className="empty">No se encontró. Regístralo abajo.</div>}
            {resultados.length > 0 && (
              <div className="results">
                {resultados.map((a) => (
                  <Link key={a.id} className="result" href={`/prestamos/nuevo?alumno=${a.id}`} style={{ textDecoration: "none" }}>
                    <b>{a.nombres}</b>
                    <span className="mono muted">{a.codigo}</span>
                    {a.escuela && <span className="muted">{a.escuela}</span>}
                    {a.bloqueo && <span className="chip bloqueado">{a.bloqueo}</span>}
                  </Link>
                ))}
              </div>
            )}
          </section>
          <details className="panel" open={!!buscar && resultados.length === 0}>
            <summary><h2 style={{ display: "inline" }}>Registrar alumno nuevo</h2></summary>
            <FormAlumno volver="prestamo" inicial={{ codigo: buscar && /^\d+$/.test(buscar.trim()) ? buscar.trim() : undefined }} />
          </details>
        </>
      ) : (
        <>
          <section className="panel">
            <h2>
              <span>{alumno.nombres} <span className="mono muted" style={{ fontSize: 16 }}>{alumno.codigo}</span></span>
              <Link className="btn small" href="/prestamos/nuevo">Cambiar alumno</Link>
            </h2>
            {alumno.escuela && <p className="muted">{alumno.escuela}</p>}
            {alumno.prestamos_abiertos > 0 && <p className="ayuda">Tiene {alumno.prestamos_abiertos} préstamo(s) abiertos.</p>}
          </section>
          {alumno.bloqueo ? (
            <div className="alert error">
              No se le puede prestar: {alumno.bloqueo} <Link href={`/alumnos/${alumno.id}`}>Ver sus préstamos</Link>
            </div>
          ) : (
            <section className="panel">
              <h2>2. Material que se lleva</h2>
              <FormPrestamo alumnoId={alumno.id} articulos={articulos} docentes={docentes} hoy={hoy()} sugerida={sumarDias(hoy(), 7)} />
            </section>
          )}
        </>
      )}
    </>
  );
}
