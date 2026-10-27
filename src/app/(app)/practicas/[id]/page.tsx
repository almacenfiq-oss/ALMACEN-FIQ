import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { esPersonal, requierePerfil } from "@/lib/sesion";
import { areasActivas, articulosCortos, semestres as listaSemestres } from "@/lib/consultas";
import { cant, fecha, fechaHora } from "@/lib/formato";
import { ESTADO_ENTREGA } from "@/lib/tipos";
import FormPractica from "@/components/FormPractica";
import FormItems from "@/components/FormItems";
import BotonConfirmar from "@/components/BotonConfirmar";
import { borrarPractica, cambiarEstado, cambiarItem, copiarPractica, editarPractica } from "../actions";

export const metadata: Metadata = { title: "Práctica" };

type Item = { id: string; articulo_id: string; codigo: string; nombre: string; formula: string | null; unidad: string; cantidad: number; por: string; total: number; entregado: number; disponible: number };

export default async function Practica({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; copiada?: string }> }) {
  const perfil = await requierePerfil();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: p } = await supabase.from("v_practicas").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();
  const personal = esPersonal(perfil);
  const editable = personal || p.estado === "borrador";

  const [{ data: its }, { data: directas }, { data: porArea }, sems, areas, articulos] = await Promise.all([
    supabase.from("v_practica_items").select("*").eq("practica_id", id).order("nombre"),
    supabase.from("entregas").select("id, numero, fecha, recibe").eq("practica_id", id).order("fecha"),
    supabase.from("entrega_reparto").select("entregas(id, numero, fecha, recibe)").eq("practica_id", id),
    listaSemestres(),
    areasActivas(),
    editable ? articulosCortos() : Promise.resolve([]),
  ]);
  const items = (its ?? []) as Item[];
  type Ent = { id: string; numero: number; fecha: string; recibe: string | null };
  const entregas = [...new Map([...(directas ?? []), ...((porArea ?? []) as unknown as { entregas: Ent }[]).map((r) => r.entregas)].map((e) => [e.id, e])).values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const borrable = editable && entregas.length === 0;
  const grupos = p.secciones * p.grupos_por_seccion;
  const falta = items.some((i) => i.total - i.entregado > i.disponible);

  return (
    <>
      <div className="head">
        <div>
          <p className="sub"><Link href={`/practicas?semestre=${p.semestre_id}`}>Prácticas {p.semestre}</Link> · {p.curso}</p>
          <h1>{p.numero ? `Práctica ${p.numero}: ` : ""}{p.nombre}</h1>
          <div className="row" style={{ marginTop: 6 }}>
            <span className={`chip ${p.estado}`}>{p.estado === "borrador" ? "Borrador" : "Enviada al almacén"}</span>
            {p.items > 0 && <span className={`chip ${p.estado_entrega}`}>{ESTADO_ENTREGA[p.estado_entrega]}</span>}
          </div>
        </div>
        <div className="row">
          {p.estado === "borrador" && items.length > 0 && (
            <form action={cambiarEstado}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="estado" value="enviada" />
              <button className="btn primary" type="submit">Enviar al almacén</button>
            </form>
          )}
          {personal && p.estado === "enviada" && (
            <form action={cambiarEstado}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="estado" value="borrador" />
              <button className="btn" type="submit">Devolver al docente para corregir</button>
            </form>
          )}
          {personal && items.length > 0 && p.estado_entrega !== "entregada" && (
            <Link className="btn primary" href={`/entregas/nueva?practica=${id}`}>Registrar entrega</Link>
          )}
          {borrable && (
            <form action={borrarPractica}>
              <input type="hidden" name="id" value={id} />
              <BotonConfirmar texto="Eliminar práctica" pregunta={`¿Eliminar la práctica “${p.nombre}” y todos sus artículos? No se puede deshacer.`} />
            </form>
          )}
        </div>
      </div>
      {sp.error && <div className="alert error">{sp.error}</div>}
      {sp.copiada && <div className="alert ok">Práctica copiada con sus cantidades. Revísala y ajusta lo que cambie.</div>}
      {p.estado === "borrador" && !personal && (
        <p className="ayuda">Mientras esté en borrador puedes cambiarla. Cuando la envíes, el almacén la verá en el total del semestre.</p>
      )}

      <div className="stats">
        <div className="stat"><b>{p.docente}</b><span>Docente</span></div>
        <div className="stat"><b>{p.area ?? "—"}</b><span>Área</span></div>
        <div className="stat"><b>{p.secciones} × {p.grupos_por_seccion}</b><span>Secciones × grupos = {grupos} grupos</span></div>
        <div className="stat"><b>{fecha(p.fecha)}</b><span>Fecha prevista</span></div>
      </div>

      <section className="panel">
        <h2>Artículos de la práctica</h2>
        {falta && <div className="aviso">Algún artículo no alcanza con el stock actual (marcado en rojo).</div>}
        {items.length === 0 ? (
          <div className="empty">Todavía no tiene artículos.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Artículo</th><th>Cantidad</th><th className="r">Total</th><th className="r">Entregado</th><th className="r">Disponible</th></tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const pendiente = Math.max(i.total - i.entregado, 0);
                  return (
                    <tr key={i.id}>
                      <td>
                        <Link href={`/inventario/${i.articulo_id}`}>{i.nombre}</Link> {i.formula && <span className="formula">{i.formula}</span>}
                        <div className="muted mono" style={{ fontSize: 12 }}>{i.codigo}</div>
                      </td>
                      <td>
                        {editable ? (
                          <form action={cambiarItem} className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                            <input type="hidden" name="id" value={i.id} />
                            <input type="hidden" name="practica_id" value={id} />
                            <input className="mini" name="cantidad" inputMode="decimal" defaultValue={Number(i.cantidad)} aria-label="Cantidad" />
                            <span className="muted">{i.unidad} por</span>
                            <select name="por" defaultValue={i.por} aria-label="Se cuenta por" style={{ width: "auto" }}>
                              <option value="grupo">grupo</option>
                              <option value="seccion">sección</option>
                            </select>
                            <button className="btn small" type="submit">Guardar</button>
                            <button className="btn small danger" type="submit" name="quitar" value="1">Quitar</button>
                          </form>
                        ) : (
                          <>{cant(i.cantidad)} {i.unidad} por {i.por === "grupo" ? "grupo" : "sección"}</>
                        )}
                      </td>
                      <td className="r num"><b>{cant(i.total)}</b> {i.unidad}</td>
                      <td className="r num">{i.entregado > 0 ? cant(i.entregado) : "—"}</td>
                      <td className={`r num ${pendiente > i.disponible ? "falta" : ""}`}>{cant(i.disponible)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {editable && (
          <details>
            <summary>Agregar artículos</summary>
            <div style={{ marginTop: 12 }}>
              <FormItems practicaId={id} articulos={articulos} />
            </div>
          </details>
        )}
      </section>

      {entregas.length > 0 && (
        <section className="panel">
          <h2>Entregas de esta práctica</h2>
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

      <div className="grid2">
        {editable && (
          <details className="panel">
            <summary><h2 style={{ display: "inline" }}>Editar datos</h2></summary>
            <FormPractica accion={editarPractica} inicial={p} semestres={sems} docentes={[]} areas={areas} elegirDocente={false} />
          </details>
        )}
        <section className="panel">
          <h2>Copiar a otro semestre</h2>
          <p className="ayuda">Si la práctica se repite, cópiala con todas sus cantidades y solo ajusta lo que cambie.</p>
          <form action={copiarPractica} className="row">
            <input type="hidden" name="id" value={id} />
            <select name="semestre_id" defaultValue={sems.find((s) => s.activo)?.id} aria-label="Semestre" style={{ width: "auto" }}>
              {sems.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <button className="btn" type="submit">Copiar</button>
          </form>
          {editable && entregas.length > 0 && (
            <p className="ayuda">Esta práctica ya tiene entregas, por eso no se puede eliminar.</p>
          )}
        </section>
      </div>
    </>
  );
}
