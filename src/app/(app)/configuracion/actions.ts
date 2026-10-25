"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errores";
import { requierePerfil } from "@/lib/sesion";
import { numero, txt } from "@/lib/formato";
import { ROLES, type Rol } from "@/lib/tipos";

export type Estado = { error?: string; ok?: string };

const PERSONAL = ["admin", "almacen"] as const;
const listo = (ok: string): Estado => {
  revalidatePath("/configuracion");
  return { ok };
};

export async function guardarSemestre(_: Estado, f: FormData): Promise<Estado> {
  await requierePerfil([...PERSONAL]);
  const nombre = txt(f, "nombre");
  if (!nombre) return { error: "Escribe el nombre del semestre (por ejemplo 2027-I)." };
  const margen = numero(f.get("margen_pct")) ?? 0;
  if (Number.isNaN(margen) || margen < 0 || margen > 100) return { error: "El margen va de 0 a 100 %." };
  const datos = { nombre, inicio: txt(f, "inicio"), fin: txt(f, "fin"), margen_pct: margen };
  const supabase = await createClient();
  const id = txt(f, "id");
  const { error } = id ? await supabase.from("semestres").update(datos).eq("id", id) : await supabase.from("semestres").insert(datos);
  if (error) return { error: mensajeError(error) };
  return listo(id ? "Semestre actualizado." : `Semestre ${nombre} creado. Actívalo cuando empiece.`);
}

export async function activarSemestre(f: FormData) {
  await requierePerfil([...PERSONAL]);
  const supabase = await createClient();
  await supabase.from("semestres").update({ activo: false }).eq("activo", true);
  await supabase.from("semestres").update({ activo: true }).eq("id", String(f.get("id")));
  revalidatePath("/", "layout");
}

export async function guardarDocente(_: Estado, f: FormData): Promise<Estado> {
  await requierePerfil([...PERSONAL]);
  const nombres = txt(f, "nombres");
  if (!nombres) return { error: "Escribe el nombre del docente." };
  const datos = { nombres, area_id: txt(f, "area_id"), email: txt(f, "email"), telefono: txt(f, "telefono") };
  const supabase = await createClient();
  const id = txt(f, "id");
  const { error } = id
    ? await supabase.from("docentes").update({ ...datos, activo: f.get("activo") === "on" }).eq("id", id)
    : await supabase.from("docentes").insert(datos);
  if (error) return { error: mensajeError(error) };
  return listo(id ? `${nombres} actualizado.` : `${nombres} agregado.`);
}

export async function guardarSimple(_: Estado, f: FormData): Promise<Estado> {
  await requierePerfil([...PERSONAL]);
  const tabla = String(f.get("tabla"));
  if (tabla !== "areas" && tabla !== "ubicaciones") return { error: "Tabla no válida." };
  const nombre = txt(f, "nombre");
  if (!nombre) return { error: "Escribe el nombre." };
  const supabase = await createClient();
  const id = txt(f, "id");
  const datos: Record<string, unknown> = { nombre };
  if (tabla === "ubicaciones") datos.descripcion = txt(f, "descripcion");
  if (id) datos[tabla === "areas" ? "activa" : "activa"] = f.get("activa") === "on";
  const { error } = id ? await supabase.from(tabla).update(datos).eq("id", id) : await supabase.from(tabla).insert(datos);
  if (error) return { error: mensajeError(error) };
  return listo(id ? "Guardado." : `“${nombre}” agregado.`);
}

// Da rol a una cuenta de Authentication y, si es docente, la enlaza con su ficha
export async function guardarUsuario(_: Estado, f: FormData): Promise<Estado> {
  const yo = await requierePerfil(["admin"]);
  const id = String(f.get("id"));
  const nombre = txt(f, "nombre");
  const rol = txt(f, "rol") as Rol | null;
  if (!nombre) return { error: "Escribe el nombre." };
  if (!rol || !(rol in ROLES)) return { error: "Elige el rol." };
  const activo = f.get("nuevo") === "1" ? true : f.get("activo") === "on";
  if (id === yo.id && (rol !== "admin" || !activo)) return { error: "No puedes quitarte tu propio rol de administración." };
  const supabase = await createClient();
  const { error } = await supabase.from("perfiles").upsert({ id, nombre, rol, activo });
  if (error) return { error: mensajeError(error) };
  const docente = txt(f, "docente_id");
  await supabase.from("docentes").update({ perfil_id: null }).eq("perfil_id", id);
  if (rol === "docente" && docente) {
    const { error: e2 } = await supabase.from("docentes").update({ perfil_id: id }).eq("id", docente);
    if (e2) return { error: mensajeError(e2) };
  }
  return listo(`${nombre} ya tiene acceso como ${ROLES[rol]}.`);
}
