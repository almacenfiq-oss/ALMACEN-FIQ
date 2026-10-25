import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Perfil, Rol } from "@/lib/tipos";

// Perfil del usuario actual (una consulta por petición gracias a cache)
export const obtenerPerfil = cache(async (): Promise<Perfil | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("perfiles")
    .select("id, nombre, rol, docentes(id)")
    .eq("id", user.id)
    .eq("activo", true)
    .maybeSingle();
  if (!data) return null;
  const d = data as unknown as { id: string; nombre: string; rol: Rol; docentes: { id: string } | { id: string }[] | null };
  const doc = Array.isArray(d.docentes) ? d.docentes[0] : d.docentes;
  return { id: d.id, nombre: d.nombre, rol: d.rol, docente_id: doc?.id ?? null };
});

export async function requierePerfil(roles?: Rol[]): Promise<Perfil> {
  const perfil = await obtenerPerfil();
  if (!perfil) redirect("/sin-acceso");
  if (roles && !roles.includes(perfil.rol)) redirect("/?error=sin-permiso");
  return perfil;
}

export const esPersonal = (p: Perfil) => p.rol === "admin" || p.rol === "almacen";

export const semestreActivo = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("semestres").select("id, nombre, margen_pct").eq("activo", true).maybeSingle();
  return data as { id: string; nombre: string; margen_pct: number } | null;
});
