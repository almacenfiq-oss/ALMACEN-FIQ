import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { esPersonal, requierePerfil } from "@/lib/sesion";
import { cant, fecha, fechaHora, hoy } from "@/lib/formato";
import { MOVIMIENTOS, PICTOGRAMAS, TIPOS, type ArticuloVista, type Familia, type Grupo } from "@/lib/tipos";
import { EstadoStock, Grupo as EtiquetaGrupo, Pictogramas } from "@/components/Etiquetas";
import FormArticulo from "@/components/FormArticulo";
import FormMovimiento from "@/components/FormMovimiento";
import FormSimple from "@/components/FormSimple";
import { guardarArticulo, guardarLote } from "../actions";

export const metadata: Metadata = { title: "Artículo" };

type Movimiento = { id: string; fecha: string; tipo: string; cantidad: number; signo: number; saldo: number; documento: string | null; nota: string | null; lote: string | null; usuario: string | null };

export default async function Articulo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ creado?: string }> }) {
  const perfil = await requierePerfil();
  const { id } = await params;
  const { creado } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("v_articulos").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const a = data as ArticuloVista;
  const personal = esPersonal(perfil);

  const [{ data: lotes }, { data: movs }, { data: familias }, { data: grupos }, { data: ubicaciones }, { data: prestados }] = await Promise.all([
    supabase.from("lotes").select("id, lote, vencimiento, cantidad").eq("articulo_id", id).gt("cantidad", 0).order("vencimiento", { nullsFirst: false }),
    personal
      ? supabase.from("v_kardex").select("id, fecha, tipo, cantidad, signo, saldo, documento, nota, lote, usuario").eq("articulo_id", id).order("fecha", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] }),
    supabase.from("familias").select("*"),
    supabase.from("grupos_almacenamiento").select("*").order("codigo"),
    supabase.from("ubicaciones").select("id, nombre").eq("activa", true).order("nombre"),
    personal && a.prestado > 0
      ? supabase.from("prestamo_items").select("id, cantidad, devuelto, roto, perdido, prestamos!inner(id, numero, fecha_limite, estado, alumnos(nombres, codigo))").eq("articulo_id", id).eq("prestamos.estado", "abierto")
      : Promise.resolve({ data: [] }),
  ]);
  const grupo = (grupos as Grupo[] | null)?.find((g) => g.codigo === a.grupo);
  const hoyStr = hoy();

  return (
    <>
      <div className="head">
        <div>
          <p className="sub"><Link href="/inventario">Inventario</Link> · <span className="mono">{a.codigo}</span></p>
          <h1>{a.nombre} {a.formula && <span className="formula" style={{ fontSize: 20 }}>{a.formula}</span>}</h1>
          <div className="row" style={{ marginTop: 6 }}>
            <span className="chip tipo">{TIPOS[a.tipo]}</span>
            {a.familia && <span className="chip">{a.familia}{a.subfamilia ? ` › ${a.subfamilia}` : ""}</span>}
            <EstadoStock estado={a.estado_stock} />
            {a.fiscalizado && <span className="chip fisc">Fiscalizado SUNAT</span>}
            {a.prestable && <span className="chip ok">Prestable</span>}
            {!a.activo && <span className="chip vencido">Inactivo</span>}
          </div>
        </div>
      </div>
      {creado && <div className="alert ok">Artículo creado. Ya aparece en el inventario.</div>}

      <div className="stats">
        <div className="stat"><b>{cant(a.stock)}</b><span>En almacén ({a.unidad})</span></div>
        {a.prestable && <div className="stat"><b>{cant(a.prestado)}</b><span>Prestado a alumnos</span></div>}
        {a.vencido > 0 && <div className="stat"><b>{cant(a.vencido)}</b><span>Vencido (dar de baja)</span></div>}
        <div className="stat"><b>{cant(a.utilizable)}</b><span>Disponible para usar</span></div>
        <div className="stat"><b>{cant(a.stock_minimo)}</b><span>Stock mínimo</span></div>
      </div>

      <div className="grid2">
        <section className="panel">
          <h2>Ficha</h2>
          <dl className="kv">
            {a.tipo === "reactivo" ? (
              <>
                <dt>CAS</dt><dd className="mono">{a.cas ?? "—"}</dd>
                <dt>Grado</dt><dd>{a.grado ?? "—"}</dd>
                <dt>Concentración</dt><dd>{a.concentracion ?? "—"}</dd>
                <dt>Almacenar en</dt><dd>{grupo ? <><EtiquetaGrupo codigo={grupo.codigo} nombre={grupo.nombre} color={grupo.color} />{grupo.indicaciones && <div className="ayuda">{grupo.indicaciones}</div>}</> : "—"}</dd>
                <dt>Peligros (SGA)</dt>
                <dd>
                  {a.palabra_advertencia && <b>{a.palabra_advertencia} </b>}
                  <Pictogramas codigos={a.pictogramas} />
                  {a.pictogramas.length > 0 && <div className="ayuda">{a.pictogramas.map((p) => PICTOGRAMAS[p]).join(", ")}</div>}
                  {!a.palabra_advertencia && a.pictogramas.length === 0 && "—"}
                </dd>
              </>
            ) : (
              <>
                <dt>Capacidad</dt><dd>{a.capacidad ?? "—"}</dd>
                <dt>Material</dt><dd>{a.material ?? "—"}</dd>
                {a.tipo === "equipo" && <><dt>Modelo</dt><dd>{a.modelo ?? "—"}</dd><dt>Serie</dt><dd className="mono">{a.serie ?? "—"}</dd></>}
              </>
            )}
            <dt>Marca</dt><dd>{a.marca ?? "—"}</dd>
            <dt>Presentación</dt><dd>{a.presentacion ?? "—"}</dd>
            <dt>Ubicación</dt><dd>{a.ubicacion ?? "—"}</dd>
            <dt>Código de barras</dt><dd className="mono">{a.codigo_barras ?? "—"}</dd>
            {a.notas && <><dt>Notas</dt><dd>{a.notas}</dd></>}
          </dl>
        </section>

        {personal && (
          <section className="panel">
            <h2>Registrar movimiento</h2>
            <FormMovimiento articuloId={a.id} unidad={a.unidad} reactivo={a.tipo === "reactivo"} lotes={(lotes ?? []) as never} />
          </section>
        )}
      </div>

      {(lotes ?? []).length > 0 && (
        <section className="panel">
          <h2>Lotes</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Lote</th><th>Vencimiento</th><th className="r">Cantidad</th>{personal && <th>Corregir</th>}</tr></thead>
              <tbody>
                {(lotes ?? []).map((l) => (
                  <tr key={l.id}>
                    <td className="mono">{l.lote}</td>
                    <td>{fecha(l.vencimiento)} {l.vencimiento && l.vencimiento < hoyStr && <span className="chip vencido">Vencido</span>}</td>
                    <td className="r num">{cant(l.cantidad)} {a.unidad}</td>
                    {personal && (
                      <td>
                        <details>
                          <summary>Editar</summary>
                          <FormSimple accion={guardarLote} textoBoton="Guardar" limpiar={false}>
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="articulo_id" value={a.id} />
                            <div className="fields">
                              <div className="field"><label>Lote</label><input name="lote" defaultValue={l.lote} required /></div>
                              <div className="field"><label>Vencimiento</label><input name="vencimiento" type="date" defaultValue={l.vencimiento ?? ""} /></div>
                            </div>
                          </FormSimple>
                        </details>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(prestados ?? []).length > 0 && (
        <section className="panel">
          <h2>En préstamo ahora</h2>
          <ul className="list">
            {(prestados as unknown as { id: string; cantidad: number; devuelto: number; roto: number; perdido: number; prestamos: { id: string; numero: number; fecha_limite: string; alumnos: { nombres: string; codigo: string } } }[]).map((p) => (
              <li key={p.id}>
                <span>
                  <Link href={`/prestamos/${p.prestamos.id}`}>Préstamo N.º {p.prestamos.numero}</Link> · {p.prestamos.alumnos.nombres} ({p.prestamos.alumnos.codigo})
                </span>
                <span className="meta">
                  {cant(p.cantidad - p.devuelto - p.roto - p.perdido)} pendientes · devolver el {fecha(p.prestamos.fecha_limite)}
                  {p.prestamos.fecha_limite < hoyStr && <span className="chip vencido">Vencido</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {personal && (
        <section className="panel">
          <h2>Kardex <Link className="btn small" href={`/kardex?articulo=${a.id}`}>Ver completo</Link></h2>
          {(movs ?? []).length === 0 ? (
            <div className="empty">Sin movimientos todavía.</div>
          ) : (
            <div className="table-wrap">
              <table className="kardex">
                <thead><tr><th>Fecha</th><th>Movimiento</th><th>Lote</th><th className="r">Entra</th><th className="r">Sale</th><th className="r">Saldo</th><th>Documento / nota</th><th>Usuario</th></tr></thead>
                <tbody>
                  {((movs ?? []) as Movimiento[]).map((m) => (
                    <tr key={m.id}>
                      <td>{fechaHora(m.fecha)}</td>
                      <td>{MOVIMIENTOS[m.tipo] ?? m.tipo}</td>
                      <td className="mono">{m.lote ?? ""}</td>
                      <td className="r in">{m.signo > 0 ? cant(m.cantidad) : ""}</td>
                      <td className="r out">{m.signo < 0 ? cant(m.cantidad) : ""}</td>
                      <td className="r saldo">{cant(m.saldo)}</td>
                      <td style={{ whiteSpace: "normal" }}>{[m.documento, m.nota].filter(Boolean).join(" · ")}</td>
                      <td>{m.usuario ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {personal && (
        <details className="panel">
          <summary><h2 style={{ display: "inline" }}>Editar ficha</h2></summary>
          <FormArticulo
            accion={guardarArticulo}
            inicial={a}
            familias={(familias ?? []) as Familia[]}
            grupos={(grupos ?? []) as Grupo[]}
            ubicaciones={ubicaciones ?? []}
          />
        </details>
      )}
    </>
  );
}
