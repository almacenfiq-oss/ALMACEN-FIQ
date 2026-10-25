"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errores";
import { requierePerfil } from "@/lib/sesion";
import { numero, txt } from "@/lib/formato";

export type Estado = { error?: string; ok?: string };

const PERSONAL = ["admin", "almacen"] as const;

export async function guardarAlumno(_: Estado, f: FormData): Promise<Estado> {
  await requierePerfil([...PERSONAL]);
  const codigo = txt(f, "codigo");
  const nombres = txt(f, "nombres");
  if (!codigo) return { error: "Escribe el código del alumno." };
  if (!nombres) return { error: "Escribe los nombres y apellidos." };
  const datos = {
    codigo,
    nombres,
    dni: txt(f, "dni"),
    escuela: txt(f, "escuela"),
    ciclo: txt(f, "ciclo"),
    telefono: txt(f, "telefono"),
    email: txt(f, "email"),
    notas: txt(f, "notas"),
  };
  const supabase = await createClient();
  const id = txt(f, "id");
  if (id) {
    const { error } = await supabase.from("alumnos").update({ ...datos, activo: f.get("activo") === "on" }).eq("id", id);
    if (error) return { error: mensajeError(error) };
    revalidatePath(`/alumnos/${id}`);
    return { ok: "Datos guardados." };
  }
  const { data, error } = await supabase.from("alumnos").insert(datos).select("id").single();
  if (error) return { error: mensajeError(error) };
  revalidatePath("/alumnos");
  const destino = txt(f, "volver") === "prestamo" ? `/prestamos/nuevo?alumno=${data.id}` : `/alumnos/${data.id}`;
  redirect(destino);
}

export async function registrarPrestamo(_: Estado, f: FormData): Promise<Estado> {
  await requierePerfil([...PERSONAL]);
  let lineas: { articulo_id: string; cantidad: string }[] = [];
  try {
    lineas = JSON.parse(String(f.get("items") ?? "[]"));
  } catch {
    return { error: "No se pudo leer la lista de materiales." };
  }
  const items = [];
  for (const l of lineas) {
    const c = numero(l.cantidad);
    if (c === null || Number.isNaN(c) || c <= 0) return { error: "Cada material necesita una cantidad mayor que cero." };
    items.push({ articulo_id: l.articulo_id, cantidad: c });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_prestamo", {
    p_alumno: txt(f, "alumno_id"),
    p_fecha_limite: txt(f, "fecha_limite"),
    p_items: items,
    p_motivo: txt(f, "motivo"),
    p_docente: txt(f, "docente_id"),
    p_nota: txt(f, "nota"),
  });
  if (error) return { error: mensajeError(error) };
  revalidatePath("/prestamos");
  redirect(`/prestamos/${data}?nuevo=1`);
}

// Recibe la devolución de todos los renglones de un préstamo a la vez
export async function registrarDevolucion(_: Estado, f: FormData): Promise<Estado> {
  await requierePerfil([...PERSONAL]);
  const prestamo = String(f.get("prestamo_id"));
  const ids = f.getAll("item").map(String);
  const supabase = await createClient();
  // Se revisa todo antes de registrar, para no dejar la devolución a medias
  const { data: pendientes } = await supabase
    .from("prestamo_items")
    .select("id, cantidad, devuelto, roto, perdido, articulos(nombre)")
    .eq("prestamo_id", prestamo);
  const filas = [];
  for (const id of ids) {
    const dev = numero(f.get(`dev_${id}`)) ?? 0;
    const roto = numero(f.get(`roto_${id}`)) ?? 0;
    const perdido = numero(f.get(`perd_${id}`)) ?? 0;
    if ([dev, roto, perdido].some((x) => Number.isNaN(x) || x < 0)) return { error: "Revisa las cantidades." };
    if (dev + roto + perdido === 0) continue;
    const it = (pendientes ?? []).find((x) => x.id === id) as unknown as { cantidad: number; devuelto: number; roto: number; perdido: number; articulos: { nombre: string } } | undefined;
    const queda = it ? it.cantidad - it.devuelto - it.roto - it.perdido : 0;
    if (dev + roto + perdido > queda) return { error: `${it?.articulos.nombre ?? "Un material"}: solo quedan ${queda} pendientes y sumaste ${dev + roto + perdido}.` };
    filas.push({ id, dev, roto, perdido });
  }
  let hubo = false;
  for (const { id, dev, roto, perdido } of filas) {
    const { error } = await supabase.rpc("registrar_devolucion", {
      p_item: id,
      p_devuelto: dev,
      p_roto: roto,
      p_perdido: perdido,
      p_nota: txt(f, "nota"),
    });
    if (error) {
      revalidatePath(`/prestamos/${prestamo}`);
      return { error: mensajeError(error) };
    }
    hubo = true;
  }
  if (!hubo) return { error: "Escribe cuánto devuelve, rompió o perdió." };
  revalidatePath(`/prestamos/${prestamo}`);
  revalidatePath("/prestamos");
  return { ok: "Devolución registrada." };
}

export async function registrarReposicion(_: Estado, f: FormData): Promise<Estado> {
  await requierePerfil([...PERSONAL]);
  const cantidad = numero(f.get("cantidad"));
  if (!cantidad || Number.isNaN(cantidad)) return { error: "Escribe la cantidad que trae." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_reposicion", { p_item: String(f.get("item_id")), p_cantidad: cantidad, p_nota: txt(f, "nota") });
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/prestamos/${f.get("prestamo_id")}`);
  revalidatePath("/prestamos");
  return { ok: "Reposición registrada: el material volvió al inventario." };
}

export async function ampliarPlazo(f: FormData) {
  await requierePerfil([...PERSONAL]);
  const id = String(f.get("id"));
  const supabase = await createClient();
  await supabase.rpc("ampliar_plazo", { p_prestamo: id, p_fecha: String(f.get("fecha_limite")) });
  revalidatePath(`/prestamos/${id}`);
}
