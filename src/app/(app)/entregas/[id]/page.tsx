import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { esPersonal, requierePerfil } from "@/lib/sesion";
import { cant, fechaHora } from "@/lib/formato";
import { TIPOS, type TipoArticulo } from "@/lib/tipos";
import BotonImprimir from "@/components/BotonImprimir";
import SelectorDespachador from "@/components/SelectorDespachador";
import { Encabezado, Firmas } from "@/components/Documento";
import FotosEvidencia, { type Foto } from "@/components/FotosEvidencia";

export const metadata: Metadata = { title: "Entrega" };

type Item = { id: string; cantidad: number; articulos: { id: string; codigo: string; nombre: string; formula: string | null; unidad: string; tipo: TipoArticulo } };
type Entrega = {
  id: string; numero: number; fecha: string; recibe: string | null; nota: string | null; despachado_por: string | null; semestres: { nombre: string };
  docentes: { nombres: string; areas: { nombre: string } | null }; practicas: { id: string; nombre: string; curso: string; numero: number | null } | null;
  encargados: { nombre: string; dni: string | null } | null; entrega_items: Item[];
  areas: { nombre: string } | null; entrega_reparto: { cantidad: number; practicas: { id: string; curso: string; nombre: string; numero: number | null } }[];
};

export default async function EntregaPagina({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nueva?: string }> }) {
  const perfil = await requierePerfil();
  const { id } = await params;
  const { nueva } = await searchParams;
  const supabase = await createClient();
  const [{ data }, { data: encargados }, { data: filasFotos }] = await Promise.all([
    supabase
      .from("entregas")
      .select("*, semestres(nombre), docentes(nombres, areas(nombre)), practicas!entregas_practica_id_fkey(id, nombre, curso, numero), encargados(nombre, dni), areas(nombre), entrega_reparto(cantidad, practicas(id, curso, nombre, numero)), entrega_items(id, cantidad, articulos(id, codigo, nombre, formula, unidad, tipo))")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("encargados").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("entrega_fotos").select("id, ruta, nota, creado").eq("entrega_id", id).order("creado"),
  ]);
  if (!data) notFound();
  const e = data as unknown as Entrega;
  // Enlaces temporales (1 hora) porque el bucket de fotos es privado
  const rutas = (filasFotos ?? []).map((x) => x.ruta);
  const { data: firmadas } = rutas.length ? await supabase.storage.from("evidencias").createSignedUrls(rutas, 3600) : { data: [] };
  const urlPor = new Map((firmadas ?? []).map((x) => [x.path, x.signedUrl]));
  const fotos: Foto[] = (filasFotos ?? []).map((x) => ({ id: x.id, url: urlPor.get(x.ruta) ?? null, nota: x.nota, creado: x.creado }));
  const cubre = [...new Map(e.entrega_reparto.map((r) => [r.practicas.id, r.practicas])).values()];
  const items = [...e.entrega_items].sort((a, b) => a.articulos.nombre.localeCompare(b.articulos.nombre));

  const Cuerpo = ({ copia, clase }: { copia: string; clase: string }) => (
    <section className={`panel ${clase}`}>
      <Encabezado titulo="Acta de entrega de reactivos y materiales" numero={e.numero} copia={copia} />
      <dl className="kv">
        <dt>Fecha</dt><dd>{fechaHora(e.fecha)} · Semestre {e.semestres.nombre}</dd>
        <dt>Docente</dt><dd>{e.docentes.nombres}{e.docentes.areas ? ` · ${e.docentes.areas.nombre}` : ""}</dd>
        {e.areas ? (
          <>
            <dt>Área</dt><dd><b>{e.areas.nombre}</b> · entrega del semestre</dd>
            {cubre.length > 0 && <><dt>Prácticas</dt><dd>{cubre.map((p) => `${p.curso} · ${p.numero ? `${p.numero}. ` : ""}${p.nombre}`).join("; ")}</dd></>}
          </>
        ) : (
          <>
            <dt>Práctica</dt>
            <dd>{e.practicas ? <Link href={`/practicas/${e.practicas.id}`}>{e.practicas.curso} · {e.practicas.numero ? `${e.practicas.numero}. ` : ""}{e.practicas.nombre}</Link> : "Sin práctica"}</dd>
          </>
        )}
        <dt>Recibe</dt><dd>{e.recibe ?? e.docentes.nombres}</dd>
        <dt>Despachó</dt><dd>{e.encargados?.nombre ?? "—"}</dd>
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
                <td className="r num"><b>{cant(i.cantidad)}</b> {i.articulos.unidad === "unidad" ? (Number(i.cantidad) === 1 ? "unidad" : "unidades") : i.articulos.unidad}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ayuda">Los reactivos y materiales entregados son estrictamente para uso académico.</p>
      <Firmas
        izquierda={{ rol: "Entregué conforme (almacén)", nombre: e.encargados?.nombre, dni: e.encargados?.dni }}
        derecha={{ rol: "Recibí conforme", nombre: e.recibe ?? e.docentes.nombres }}
      />
    </section>
  );

  return (
    <>
      <div className="head no-print">
        <div>
          <p className="sub"><Link href="/entregas">Entregas</Link></p>
          <h1>Entrega N.º {e.numero}</h1>
          <p className="sub">{fechaHora(e.fecha)} · Semestre {e.semestres.nombre}</p>
        </div>
        <div className="row">
          {esPersonal(perfil) && <SelectorDespachador tipo="entrega" id={e.id} actual={e.despachado_por} encargados={encargados ?? []} />}
          <BotonImprimir texto="Imprimir acta" />
        </div>
      </div>
      {nueva && <div className="alert ok no-print">Entrega registrada. El inventario ya se descontó{e.areas ? " y lo pendiente del área quedó actualizado" : ""}. Imprime el acta para que firmen y, si quieres, sube una foto como evidencia al final de la página.</div>}
      <Cuerpo copia="Almacén" clase="" />
      <Cuerpo copia="Solicitante" clase="solo-print" />
      <FotosEvidencia entregaId={e.id} fotos={fotos} puedeSubir={esPersonal(perfil)} />
    </>
  );
}
