"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errores";
import { requierePerfil } from "@/lib/sesion";
import { txt } from "@/lib/formato";

export type Estado = { error?: string; ok?: string };

export async function crearFamilia(_: Estado, f: FormData): Promise<Estado> {
  await requierePerfil(["admin", "almacen"]);
  const nombre = txt(f, "nombre");
  if (!nombre) return { error: "Escribe el nombre." };
  const supabase = await createClient();
  const { error } = await supabase.from("familias").insert({
    nombre,
    padre_id: txt(f, "padre_id"),
    grupo: txt(f, "grupo"),
    descripcion: txt(f, "descripcion"),
    orden: 200,
  });
  if (error) return { error: mensajeError(error) };
  revalidatePath("/clasificacion");
  return { ok: `“${nombre}” agregada.` };
}
