import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requierePerfil } from "@/lib/sesion";
import { cant, fecha, fechaHora, hoy } from "@/lib/formato";
import { FormDevolucion, FormReposicion } from "@/components/FormDevolucion";
import BotonImprimir from "@/components/BotonImprimir";
import SelectorDespachador from "@/components/SelectorDespachador";
import { Encabezado, Firmas } from "@/components/Documento";
import { ampliarPlazo } from "../actions";

export const metadata: Metadata = { title: "Préstamo" };

type Item = { id: string; cantidad: number; devuelto: number; roto: number; perdido: number; repuesto: number; articulos: { id: string; codigo: string; nombre: string; unidad: string; capacidad: string | null } };

export default async function Prestamo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nuevo?: string }> }) {
  await requierePerfil(["admin", "almacen"]);
  const { id } = await params;
  const { nuevo } = await searchParams;
  const supabase = await createClient();
  const [{ data: p }, { data: its }, { data: extra }, { data: encargados }] = await Promise.all([
    supabase.from("v_prestamos").select("*").eq("id", id).maybeSingle(),
    supabase.from("prestamo_items").select("id, cantidad, devuelto, roto, perdido, repuesto, articulos(id, codigo, nombre, unidad, capacidad)").eq("prestamo_id", id),
    supabase.from("prestamos").select("despachado_por, encargados(nombre, dni), alumnos(dni)").eq("id", id).maybeSingle(),
    supabase.from("encargados").select("id, nombre").eq("activo", true).order("nombre"),
  ]);
  if (!p) notFound();
  const doc = extra as unknown as { despachado_por: string | null; encargados: { nombre: string; dni: string | null } | null; alumnos: { dni: string | null } | null } | null;
  const enc = doc?.encargados ?? null;
  const items = ((its ?? []) as unknown as Item[]).sort((a, b) => a.articulos.nombre.localeCompare(b.articulos.nombre));
  const pendientes = items
    .map((i) => ({ id: i.id, nombre: i.articulos.nombre, unidad: i.articulos.unidad, pendiente: i.cantidad - i.devuelto - i.roto - i.perdido }))
    .filter((i) => i.pendiente > 0);
  const deudas = items.filter((i) => i.roto + i.perdido > i.repuesto);

  const Cuerpo = ({ copia, clase }: { copia: string; clase: string }) => (
    <section className={`panel ${clase}`}>
      <Encabezado titulo="Constancia de préstamo de materiales" numero={p.numero} copia={copia} />
      <dl className="kv">
        <dt>Alumno</dt><dd><Link href={`/alumnos/${p.alumno_id}`}>{p.alumno}</Link> · <span className="mono">{p.alumno_codigo}</span>{p.escuela ? ` · ${p.escuela}` : ""}</dd>
        <dt>Curso</dt><dd>{p.motivo ?? "—"}</dd>
        {p.docente && <><dt>Docente</dt><dd>{p.docente}</dd></>}
        <dt>Prestado</dt><dd>{fechaHora(p.fecha)}</dd>
        <dt>Devolver</dt><dd><b>{fecha(p.fecha_limite)}</b></dd>
        <dt>Despachó</dt><dd>{enc?.nombre ?? "—"}</dd>
        {p.nota && <><dt>Nota</dt><dd>{p.nota}</dd></>}
        {p.cerrado_en && <><dt>Cerrado</dt><dd>{fechaHora(p.cerrado_en)}</dd></>}
      </dl>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Material</th><th className="r">Prestado</th><th className="r">Devuelto</th><th className="r">Roto</th><th className="r">Perdido</th><th className="r">Repuesto</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td><Link href={`/inventario/${i.articulos.id}`}>{i.articulos.nombre}</Link>{i.articulos.capacidad ? ` ${i.articulos.capacidad}` : ""} <span className="muted mono">{i.articulos.codigo}</span></td>
                <td className="r num">{cant(i.cantidad)}</td>
                <td className="r num">{i.devuelto ? cant(i.devuelto) : "—"}</td>
                <td className="r num">{i.roto ? cant(i.roto) : "—"}</td>
                <td className="r num">{i.perdido ? cant(i.perdido) : "—"}</td>
                <td className="r num">{i.repuesto ? cant(i.repuesto) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ayuda">El alumno se compromete a devolver el material en buen estado hasta el {fecha(p.fecha_limite)} y a reponer con un material igual lo que rompa o pierda.</p>
      <Firmas
        izquierda={{ rol: "Entregué conforme (almacén)", nombre: enc?.nombre, dni: enc?.dni }}
        derecha={{ rol: "Recibí conforme (alumno)", nombre: p.alumno, dni: doc?.alumnos?.dni, extra: `Código: ${p.alumno_codigo}` }}
      />
    </section>
  );

  return (
    <>
      <div className="head no-print">
        <div>
          <p className="sub"><Link href="/prestamos">Préstamos</Link></p>
          <h1>Préstamo N.º {p.numero}</h1>
          <div className="row" style={{ marginTop: 6 }}>
            {p.vencido ? <span className="chip vencido">Vencido</span> : <span className={`chip ${p.estado}`}>{p.estado === "abierto" ? "Abierto" : "Cerrado"}</span>}
            {p.deuda > 0 && <span className="chip bajo">Reposición pendiente</span>}
          </div>
        </div>
        <div className="row">
          <SelectorDespachador tipo="prestamo" id={id} actual={doc?.despachado_por ?? null} encargados={encargados ?? []} />
          <BotonImprimir texto="Imprimir constancia" />
        </div>
      </div>
      {nuevo && <div className="alert ok no-print">Préstamo registrado. Imprime la constancia para que el alumno firme.</div>}

      <Cuerpo copia="Almacén" clase="" />
      <Cuerpo copia="Alumno" clase="solo-print" />

      {pendientes.length > 0 && (
        <section className="panel no-print">
          <h2>Recibir devolución</h2>
          <FormDevolucion prestamoId={id} items={pendientes} />
          <form action={ampliarPlazo} className="row">
            <input type="hidden" name="id" value={id} />
            <label htmlFor="pl-f">Dar más plazo hasta</label>
            <input id="pl-f" name="fecha_limite" type="date" min={hoy()} required style={{ width: "auto" }} />
            <button className="btn small" type="submit">Cambiar fecha</button>
          </form>
        </section>
      )}

      {deudas.length > 0 && (
        <section className="panel no-print">
          <h2>Reposición pendiente</h2>
          <p className="ayuda">Cuando el alumno traiga un material igual al que rompió o perdió, regístralo aquí: vuelve al inventario y se le levanta el bloqueo.</p>
          <ul className="list">
            {deudas.map((i) => (
              <li key={i.id}>
                <span><b>{i.articulos.nombre}</b> · debe {cant(i.roto + i.perdido - i.repuesto)} {i.articulos.unidad}</span>
                <FormReposicion prestamoId={id} itemId={i.id} debe={i.roto + i.perdido - i.repuesto} unidad={i.articulos.unidad} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
