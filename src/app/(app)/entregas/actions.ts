"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errores";
import { requierePerfil } from "@/lib/sesion";
import { cant, numero, txt } from "@/lib/formato";

export type Estado = { error?: string; ok?: string; bajoMinimo?: boolean };

// Revisa que ninguna cantidad deje el artículo por debajo de su stock mínimo
async function revisarMinimo(items: { articulo_id: string; cantidad: number }[]): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_articulos")
    .select("id, nombre, unidad, utilizable, stock_minimo")
    .in("id", items.map((i) => i.articulo_id));
  const porId = new Map((data ?? []).map((a) => [a.id, a]));
  const avisos: string[] = [];
  for (const i of items) {
    const a = porId.get(i.articulo_id);
    if (!a || Number(a.stock_minimo) <= 0) continue;
    const libre = Math.max(Number(a.utilizable) - Number(a.stock_minimo), 0);
    if (i.cantidad > libre) avisos.push(`${a.nombre}: sin bajar del mínimo (${cant(a.stock_minimo)} ${a.unidad}) puedes dar hasta ${cant(libre)} ${a.unidad}`);
  }
  return avisos.length ? `Esta entrega deja artículos por debajo del stock mínimo. ${avisos.join("; ")}.` : null;
}

export async function registrarEntrega(_: Estado, f: FormData): Promise<Estado> {
  await requierePerfil(["admin", "almacen"]);
  let lineas: { articulo_id: string; cantidad: string }[] = [];
  try {
    lineas = JSON.parse(String(f.get("items") ?? "[]"));
  } catch {
    return { error: "No se pudo leer la lista de artículos." };
  }
  const items = [];
  for (const l of lineas) {
    const c = numero(l.cantidad);
    if (c === null || c === 0) continue; // renglón en cero: no se entrega ahora
    if (Number.isNaN(c) || c < 0) return { error: "Revisa las cantidades." };
    items.push({ articulo_id: l.articulo_id, cantidad: c });
  }
  if (!items.length) return { error: "Escribe al menos una cantidad a entregar." };
  if (f.get("bajo_minimo") !== "on") {
    const aviso = await revisarMinimo(items);
    if (aviso) return { error: aviso, bajoMinimo: true };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_entrega", {
    p_docente: txt(f, "docente_id"),
    p_practica: txt(f, "practica_id"),
    p_items: items,
    p_recibe: txt(f, "recibe"),
    p_nota: txt(f, "nota"),
  });
  if (error) return { error: mensajeError(error) };
  revalidatePath("/entregas");
  revalidatePath("/inventario");
  redirect(`/entregas/${data}?nueva=1`);
}

// Quién del almacén despachó la entrega o el préstamo (sale en la firma del documento)
export async function asignarDespachador(f: FormData) {
  await requierePerfil(["admin", "almacen"]);
  const tipo = f.get("tipo") === "prestamo" ? "prestamo" : "entrega";
  const id = String(f.get("id"));
  const supabase = await createClient();
  await supabase.rpc("asignar_despachador", { p_tipo: tipo, p_id: id, p_encargado: txt(f, "encargado_id") });
  revalidatePath(tipo === "prestamo" ? `/prestamos/${id}` : `/entregas/${id}`);
}

// Fotos de evidencia: se guardan en el bucket privado "evidencias" de Supabase Storage
const TIPOS_FOTO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function subirFotoEntrega(_: Estado, f: FormData): Promise<Estado> {
  await requierePerfil(["admin", "almacen"]);
  const entrega = String(f.get("entrega_id") ?? "");
  const foto = f.get("foto");
  if (!(foto instanceof File) || foto.size === 0) return { error: "Elige o toma una foto." };
  const ext = TIPOS_FOTO[foto.type];
  if (!ext) return { error: "La foto debe ser JPG, PNG o WEBP." };
  if (foto.size > 5 * 1024 * 1024) return { error: "La foto pesa más de 5 MB." };
  const supabase = await createClient();
  const ruta = `entregas/${entrega}/${crypto.randomUUID()}.${ext}`;
  const { error: e1 } = await supabase.storage.from("evidencias").upload(ruta, foto, { contentType: foto.type });
  if (e1) return { error: `No se pudo subir la foto: ${e1.message}` };
  const { error: e2 } = await supabase.from("entrega_fotos").insert({ entrega_id: entrega, ruta, nota: txt(f, "nota") });
  if (e2) {
    await supabase.storage.from("evidencias").remove([ruta]);
    return { error: mensajeError(e2) };
  }
  revalidatePath(`/entregas/${entrega}`);
  return { ok: "Foto guardada." };
}

export async function borrarFotoEntrega(f: FormData) {
  await requierePerfil(["admin", "almacen"]);
  const id = String(f.get("id"));
  const supabase = await createClient();
  const { data } = await supabase.from("entrega_fotos").delete().eq("id", id).select("ruta, entrega_id").maybeSingle();
  if (data) {
    await supabase.storage.from("evidencias").remove([data.ruta]);
    revalidatePath(`/entregas/${data.entrega_id}`);
  }
}

// Entrega de todas las prácticas de un área (completa o por partes)
export async function registrarEntregaArea(_: Estado, f: FormData): Promise<Estado> {
  await requierePerfil(["admin", "almacen"]);
  const items = [];
  for (const [k, v] of f.entries()) {
    if (!k.startsWith("cant_")) continue;
    const c = numero(v);
    if (c === null || c === 0) continue;
    if (Number.isNaN(c) || c < 0) return { error: "Revisa las cantidades." };
    items.push({ articulo_id: k.slice(5), cantidad: c });
  }
  if (!items.length) return { error: "Escribe al menos una cantidad a entregar." };
  if (!txt(f, "docente_id")) return { error: "Elige el docente que recibe por el área." };
  if (f.get("bajo_minimo") !== "on") {
    const aviso = await revisarMinimo(items);
    if (aviso) return { error: aviso, bajoMinimo: true };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_entrega_area", {
    p_semestre: txt(f, "semestre_id"),
    p_area: txt(f, "area_id"),
    p_docente: txt(f, "docente_id"),
    p_items: items,
    p_recibe: txt(f, "recibe"),
    p_nota: txt(f, "nota"),
  });
  if (error) return { error: mensajeError(error) };
  revalidatePath("/entregas");
  revalidatePath("/inventario");
  revalidatePath("/practicas");
  redirect(`/entregas/${data}?nueva=1`);
}
