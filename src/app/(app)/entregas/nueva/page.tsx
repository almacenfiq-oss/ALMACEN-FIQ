import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requierePerfil } from "@/lib/sesion";
import { articulosCortos, docentesActivos } from "@/lib/consultas";
import FormEntrega from "@/components/FormEntrega";
import { redondeoAbajo } from "@/lib/unidades";
import { cant } from "@/lib/formato";

export const metadata: Metadata = { title: "Nueva entrega" };

export default async function NuevaEntrega({ searchParams }: { searchParams: Promise<{ practica?: string }> }) {
  await requierePerfil(["admin", "almacen"]);
  const { practica } = await searchParams;
  const supabase = await createClient();
  const [articulos, docentes] = await Promise.all([articulosCortos(), docentesActivos()]);

  let titulo = "Entrega sin práctica";
  let inicial: { articulo_id: string; cantidad: string }[] = [];
  const recortados: string[] = [];
  if (practica) {
    const [{ data: p }, { data: items }] = await Promise.all([
      supabase.from("v_practicas").select("nombre, curso, docente, numero, semestre_id").eq("id", practica).maybeSingle(),
      supabase.from("v_practica_items").select("articulo_id, nombre, unidad, total, entregado").eq("practica_id", practica).order("nombre"),
    ]);
    if (p) titulo = `${p.curso} · ${p.numero ? `Práctica ${p.numero}: ` : ""}${p.nombre} · ${p.docente}`;
    // Si lo que piden todas las áreas no cabe sobre el stock mínimo, se propone la parte justa
    const { data: rep } = await supabase
      .from("v_requerimiento")
      .select("articulo_id, pendiente, sobre_minimo")
      .eq("semestre_id", p?.semestre_id ?? "")
      .in("articulo_id", (items ?? []).map((i) => i.articulo_id));
    const factor = new Map((rep ?? []).map((r) => [r.articulo_id, Number(r.pendiente) > Number(r.sobre_minimo) ? Number(r.sobre_minimo) / Number(r.pendiente) : 1]));
    inicial = (items ?? [])
      .map((i) => {
        const falta = Math.max(Number(i.total) - Number(i.entregado), 0);
        const justo = redondeoAbajo(falta * (factor.get(i.articulo_id) ?? 1), i.unidad);
        if (justo < falta) recortados.push(`${i.nombre}: ${cant(justo)} de ${cant(falta)} ${i.unidad}`);
        return { articulo_id: i.articulo_id, cantidad: String(justo) };
      })
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
      {recortados.length > 0 && (
        <div className="aviso">
          No alcanza para todos sin bajar del stock mínimo, así que se propone la parte que le toca a esta práctica: {recortados.join("; ")}. Lo que falta queda pendiente.
        </div>
      )}
      <section className="panel">
        <FormEntrega practicaId={practica} docentes={docentes} articulos={articulos} inicial={inicial} />
      </section>
    </>
  );
}
