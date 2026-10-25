import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requierePerfil } from "@/lib/sesion";
import { cant, fechaHora } from "@/lib/formato";
import { TIPOS, type TipoArticulo } from "@/lib/tipos";
import BotonImprimir from "@/components/BotonImprimir";

export const metadata: Metadata = { title: "Entrega" };

export default async function Entrega({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nueva?: string }> }) {
  await requierePerfil();
  const { id } = await params;
  const { nueva } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("entregas")
    .select("*, semestres(nombre), docentes(nombres, areas(nombre)), practicas(id, nombre, curso, numero), perfiles(nombre), entrega_items(id, cantidad, articulos(id, codigo, nombre, formula, unidad, tipo))")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  type Item = { id: string; cantidad: number; articulos: { id: string; codigo: string; nombre: string; formula: string | null; unidad: string; tipo: TipoArticulo } };
  const e = data as unknown as {
    numero: number; fecha: string; recibe: string | null; nota: string | null; semestres: { nombre: string };
    docentes: { nombres: string; areas: { nombre: string } | null }; practicas: { id: string; nombre: string; curso: string; numero: number | null } | null;
    perfiles: { nombre: string } | null; entrega_items: Item[];
  };
  const items = [...e.entrega_items].sort((a, b) => a.articulos.nombre.localeCompare(b.articulos.nombre));

  return (
    <>
      <div className="head">
        <div>
          <p className="sub no-print"><Link href="/entregas">Entregas</Link></p>
          <h1>Entrega N.º {e.numero}</h1>
          <p className="sub">{fechaHora(e.fecha)} · Semestre {e.semestres.nombre}</p>
        </div>
        <div className="row no-print"><BotonImprimir /></div>
      </div>
      {nueva && <div className="alert ok no-print">Entrega registrada. El inventario ya se descontó.</div>}
      <section className="panel">
        <dl className="kv">
          <dt>Docente</dt><dd>{e.docentes.nombres}{e.docentes.areas ? ` · ${e.docentes.areas.nombre}` : ""}</dd>
          <dt>Práctica</dt>
          <dd>{e.practicas ? <Link href={`/practicas/${e.practicas.id}`}>{e.practicas.curso} · {e.practicas.numero ? `${e.practicas.numero}. ` : ""}{e.practicas.nombre}</Link> : "Sin práctica"}</dd>
          <dt>Recibió</dt><dd>{e.recibe ?? "—"}</dd>
          <dt>Entregó</dt><dd>{e.perfiles?.nombre ?? "—"}</dd>
          {e.nota && <><dt>Nota</dt><dd>{e.nota}</dd></>}
        </dl>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Código</th><th>Artículo</th><th>Tipo</th><th className="r">Cantidad</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td className="mono">{i.articulos.codigo}</td>
                  <td>{i.articulos.nombre} {i.articulos.formula && <span className="formula">{i.articulos.formula}</span>}</td>
                  <td>{TIPOS[i.articulos.tipo]}</td>
                  <td className="r num">{cant(i.cantidad)} {i.articulos.unidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="firmas">
          <div>Entregué conforme<br /><small>Almacén</small></div>
          <div>Recibí conforme<br /><small>{e.recibe ?? e.docentes.nombres}</small></div>
        </div>
      </section>
    </>
  );
}
