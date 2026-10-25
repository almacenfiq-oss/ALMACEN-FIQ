"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errores";
import { requierePerfil } from "@/lib/sesion";
import { numero, txt } from "@/lib/formato";

export type Estado = { error?: string; ok?: string };

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
