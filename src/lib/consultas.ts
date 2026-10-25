import { createClient } from "@/lib/supabase/server";
import type { ArticuloCorto } from "@/lib/tipos";

// Lista ligera de artículos activos para los buscadores (prácticas, entregas, préstamos)
export async function articulosCortos(soloPrestables = false): Promise<ArticuloCorto[]> {
  const supabase = await createClient();
  let q = supabase
    .from("v_articulos")
    .select("id, codigo, codigo_barras, nombre, tipo, unidad, formula, disponible:utilizable, prestable")
    .eq("activo", true)
    .order("nombre")
    .limit(5000);
  if (soloPrestables) q = q.eq("prestable", true);
  const { data } = await q;
  return (data ?? []) as ArticuloCorto[];
}

export async function semestres() {
  const supabase = await createClient();
  const { data } = await supabase.from("semestres").select("id, nombre, activo, margen_pct").order("nombre", { ascending: false });
  return (data ?? []) as { id: string; nombre: string; activo: boolean; margen_pct: number }[];
}

export async function docentesActivos() {
  const supabase = await createClient();
  const { data } = await supabase.from("docentes").select("id, nombres, area_id").eq("activo", true).order("nombres");
  return (data ?? []) as { id: string; nombres: string; area_id: string | null }[];
}

export async function areasActivas() {
  const supabase = await createClient();
  const { data } = await supabase.from("areas").select("id, nombre").eq("activa", true).order("nombre");
  return (data ?? []) as { id: string; nombre: string }[];
}
