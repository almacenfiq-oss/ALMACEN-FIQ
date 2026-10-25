"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errores";
import { esPersonal, requierePerfil } from "@/lib/sesion";
import { numero, txt } from "@/lib/formato";

export type Estado = { error?: string; ok?: string };

type LineaEntrada = { articulo_id: string; cantidad: string; por?: string };

// Convierte el JSON del selector de artículos en renglones válidos
function leerLineas(f: FormData, campo = "items"): { lineas: { articulo_id: string; cantidad: number; por: string }[] } | { error: string } {
  let crudas: LineaEntrada[] = [];
  try {
    crudas = JSON.parse(String(f.get(campo) ?? "[]"));
  } catch {
    return { error: "No se pudo leer la lista de artículos." };
  }
  const lineas = [];
  for (const l of crudas) {
    const c = numero(l.cantidad);
    if (c === null || Number.isNaN(c) || c <= 0) return { error: "Cada artículo necesita una cantidad mayor que cero." };
    lineas.push({ articulo_id: l.articulo_id, cantidad: c, por: l.por === "seccion" ? "seccion" : "grupo" });
  }
  return { lineas };
}

function datosPractica(f: FormData) {
  const curso = txt(f, "curso");
  const nombre = txt(f, "nombre");
  if (!curso) return { error: "Escribe el curso." } as const;
  if (!nombre) return { error: "Escribe el nombre de la práctica." } as const;
  const secciones = Number(f.get("secciones") || 1);
  const grupos = Number(f.get("grupos_por_seccion") || 1);
  if (!Number.isInteger(secciones) || secciones < 1) return { error: "Las secciones deben ser 1 o más." } as const;
  if (!Number.isInteger(grupos) || grupos < 1) return { error: "Los grupos por sección deben ser 1 o más." } as const;
  const num = txt(f, "numero");
  return {
    datos: {
      curso,
      nombre,
      numero: num ? Number(num) : null,
      fecha: txt(f, "fecha"),
      secciones,
      grupos_por_seccion: grupos,
      area_id: txt(f, "area_id"),
      notas: txt(f, "notas"),
    },
  } as const;
}

export async function crearPractica(_: Estado, f: FormData): Promise<Estado> {
  const perfil = await requierePerfil();
  const r = datosPractica(f);
  if ("error" in r) return { error: r.error };
  const l = leerLineas(f);
  if ("error" in l) return { error: l.error };
  const docente = esPersonal(perfil) ? txt(f, "docente_id") : perfil.docente_id;
  if (!docente) return { error: esPersonal(perfil) ? "Elige el docente." : "Tu cuenta no está enlazada a una ficha de docente. Pídeselo al almacén." };
  const semestre = txt(f, "semestre_id");
  if (!semestre) return { error: "Elige el semestre." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("practicas")
    .insert({ ...r.datos, semestre_id: semestre, docente_id: docente })
    .select("id")
    .single();
  if (error) return { error: mensajeError(error) };
  if (l.lineas.length) {
    const { error: e2 } = await supabase.from("practica_items").insert(l.lineas.map((x) => ({ ...x, practica_id: data.id })));
    if (e2) return { error: `La práctica se creó, pero no sus artículos: ${mensajeError(e2)}` };
  }
  revalidatePath("/practicas");
  redirect(`/practicas/${data.id}`);
}

export async function editarPractica(_: Estado, f: FormData): Promise<Estado> {
  await requierePerfil();
  const r = datosPractica(f);
  if ("error" in r) return { error: r.error };
  const id = String(f.get("id"));
  const supabase = await createClient();
  const { data, error } = await supabase.from("practicas").update(r.datos).eq("id", id).select("id");
  if (error) return { error: mensajeError(error) };
  if (!data?.length) return { error: "Ya no puedes cambiarla: la práctica fue enviada al almacén." };
  revalidatePath(`/practicas/${id}`);
  return { ok: "Práctica actualizada." };
}

export async function agregarItems(_: Estado, f: FormData): Promise<Estado> {
  await requierePerfil();
  const id = String(f.get("practica_id"));
  const l = leerLineas(f);
  if ("error" in l) return { error: l.error };
  if (!l.lineas.length) return { error: "Agrega al menos un artículo." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("practica_items")
    .upsert(l.lineas.map((x) => ({ ...x, practica_id: id })), { onConflict: "practica_id,articulo_id" });
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/practicas/${id}`);
  return { ok: "Artículos agregados." };
}

export async function cambiarItem(f: FormData) {
  await requierePerfil();
  const id = String(f.get("id"));
  const practica = String(f.get("practica_id"));
  const supabase = await createClient();
  if (f.get("quitar")) {
    await supabase.from("practica_items").delete().eq("id", id);
  } else {
    const c = numero(f.get("cantidad"));
    if (c && !Number.isNaN(c) && c > 0) {
      await supabase.from("practica_items").update({ cantidad: c, por: f.get("por") === "seccion" ? "seccion" : "grupo" }).eq("id", id);
    }
  }
  revalidatePath(`/practicas/${practica}`);
}

export async function cambiarEstado(f: FormData) {
  await requierePerfil();
  const id = String(f.get("id"));
  const estado = f.get("estado") === "enviada" ? "enviada" : "borrador";
  const supabase = await createClient();
  await supabase.from("practicas").update({ estado }).eq("id", id);
  revalidatePath(`/practicas/${id}`);
  revalidatePath("/practicas");
}

export async function borrarPractica(f: FormData) {
  await requierePerfil();
  const id = String(f.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("practicas").delete().eq("id", id);
  if (error) redirect(`/practicas/${id}?error=${encodeURIComponent(mensajeError(error))}`);
  revalidatePath("/practicas");
  redirect("/practicas");
}

// Las prácticas se repiten cada semestre: copia la práctica y sus cantidades a otro semestre
export async function copiarPractica(f: FormData) {
  const perfil = await requierePerfil();
  const id = String(f.get("id"));
  const destino = String(f.get("semestre_id"));
  const supabase = await createClient();
  const { data: p } = await supabase.from("practicas").select("*, practica_items(articulo_id, cantidad, por, nota)").eq("id", id).single();
  if (!p) redirect("/practicas");
  const { data: nueva, error } = await supabase
    .from("practicas")
    .insert({
      semestre_id: destino,
      docente_id: esPersonal(perfil) ? p.docente_id : perfil.docente_id,
      area_id: p.area_id,
      curso: p.curso,
      numero: p.numero,
      nombre: p.nombre,
      secciones: p.secciones,
      grupos_por_seccion: p.grupos_por_seccion,
      notas: p.notas,
    })
    .select("id")
    .single();
  if (error) redirect(`/practicas/${id}?error=${encodeURIComponent(mensajeError(error))}`);
  const items = (p.practica_items ?? []) as { articulo_id: string; cantidad: number; por: string; nota: string | null }[];
  if (items.length) await supabase.from("practica_items").insert(items.map((i) => ({ ...i, practica_id: nueva.id })));
  revalidatePath("/practicas");
  redirect(`/practicas/${nueva.id}?copiada=1`);
}
