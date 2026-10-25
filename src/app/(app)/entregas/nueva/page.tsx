import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requierePerfil } from "@/lib/sesion";
import { articulosCortos, docentesActivos } from "@/lib/consultas";
import FormEntrega from "@/components/FormEntrega";

export const metadata: Metadata = { title: "Nueva entrega" };

export default async function NuevaEntrega({ searchParams }: { searchParams: Promise<{ practica?: string }> }) {
  await requierePerfil(["admin", "almacen"]);
  const { practica } = await searchParams;
  const supabase = await createClient();
  const [articulos, docentes] = await Promise.all([articulosCortos(), docentesActivos()]);

  let titulo = "Entrega sin práctica";
  let inicial: { articulo_id: string; cantidad: string }[] = [];
  if (practica) {
    const [{ data: p }, { data: items }] = await Promise.all([
      supabase.from("v_practicas").select("nombre, curso, docente, numero").eq("id", practica).maybeSingle(),
      supabase.from("v_practica_items").select("articulo_id, total, entregado").eq("practica_id", practica).order("nombre"),
    ]);
    if (p) titulo = `${p.curso} · ${p.numero ? `Práctica ${p.numero}: ` : ""}${p.nombre} · ${p.docente}`;
    // Propone lo que falta entregar de cada artículo
    inicial = (items ?? [])
      .map((i) => ({ articulo_id: i.articulo_id, cantidad: String(Math.max(Number(i.total) - Number(i.entregado), 0)) }))
      .filter((i) => Number(i.cantidad) > 0);
  }

  return (
    <>
      <div className="head">
        <div>
          <p className="sub"><Link href={practica ? `/practicas/${practica}` : "/entregas"}>{practica ? "Práctica" : "Entregas"}</Link></p>
          <h1>Nueva entrega</h1>
          <p className="sub">{titulo}</p>
        </div>
      </div>
      <section className="panel">
        <FormEntrega practicaId={practica} docentes={docentes} articulos={articulos} inicial={inicial} />
      </section>
    </>
  );
}
