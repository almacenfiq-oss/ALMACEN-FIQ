"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errores";
import { requierePerfil } from "@/lib/sesion";
import { numero, plano, txt } from "@/lib/formato";
import { PICTOGRAMAS, TIPOS, UNIDADES, type TipoArticulo } from "@/lib/tipos";
import { aBase, ENVASES, leerPresentacion, textoContenido, unidadesCompatibles } from "@/lib/unidades";

export type Estado = { error?: string; ok?: string };

const PERSONAL = ["admin", "almacen"] as const;

function datosArticulo(f: FormData) {
  const tipo = txt(f, "tipo") as TipoArticulo | null;
  if (!tipo || !(tipo in TIPOS)) return { error: "Elige el tipo de artículo." } as const;
  const nombre = txt(f, "nombre");
  if (!nombre) return { error: "Escribe el nombre." } as const;
  const unidad = txt(f, "unidad") ?? "unidad";
  if (!(UNIDADES as readonly string[]).includes(unidad)) return { error: "Elige la unidad." } as const;
  const minimo = numero(f.get("stock_minimo")) ?? 0;
  if (Number.isNaN(minimo) || minimo < 0) return { error: "Revisa el stock mínimo." } as const;
  const reactivo = tipo === "reactivo";
  const envase = txt(f, "envase");
  if (envase && !(ENVASES as readonly string[]).includes(envase)) return { error: "Elige el tipo de envase." } as const;
  let contenido: number | null = null;
  if (envase) {
    const n = numero(f.get("contenido_num"));
    if (!n || Number.isNaN(n) || n <= 0) return { error: `Escribe cuánto trae cada ${envase}.` } as const;
    const u = txt(f, "contenido_unidad") ?? unidad;
    contenido = aBase(n, unidadesCompatibles(unidad).includes(u) ? u : unidad, unidad);
  }
  return {
    datos: {
      tipo,
      nombre,
      codigo: txt(f, "codigo"),
      codigo_barras: txt(f, "codigo_barras"),
      unidad,
      stock_minimo: minimo,
      marca: txt(f, "marca"),
      envase,
      contenido,
      presentacion: envase && contenido ? `${envase[0].toUpperCase()}${envase.slice(1)} de ${textoContenido(contenido, unidad)}` : txt(f, "presentacion"),
      ubicacion_id: txt(f, "ubicacion_id"),
      notas: txt(f, "notas"),
      familia_id: reactivo ? txt(f, "familia_id") : null,
      formula: reactivo ? txt(f, "formula") : null,
      cas: reactivo ? txt(f, "cas") : null,
      grado: reactivo ? txt(f, "grado") : null,
      concentracion: reactivo ? txt(f, "concentracion") : null,
      grupo: reactivo ? txt(f, "grupo") : null,
      fiscalizado: reactivo && f.get("fiscalizado") === "on",
      pictogramas: reactivo ? f.getAll("pictogramas").map(String).filter((p) => p in PICTOGRAMAS) : [],
      palabra_advertencia: reactivo ? txt(f, "palabra_advertencia") : null,
      capacidad: reactivo ? null : txt(f, "capacidad"),
      material: reactivo ? null : txt(f, "material"),
      modelo: reactivo ? null : txt(f, "modelo"),
      serie: reactivo ? null : txt(f, "serie"),
      prestable: !reactivo && f.get("prestable") === "on",
    },
  } as const;
}

export async function guardarArticulo(_: Estado, f: FormData): Promise<Estado> {
  await requierePerfil([...PERSONAL]);
  const r = datosArticulo(f);
  if ("error" in r) return { error: r.error };
  const supabase = await createClient();
  const id = txt(f, "id");

  if (id) {
    const { error } = await supabase.from("articulos").update({ ...r.datos, activo: f.get("activo") === "on" }).eq("id", id);
    if (error) return { error: mensajeError(error) };
    revalidatePath(`/inventario/${id}`);
    revalidatePath("/inventario");
    return { ok: "Cambios guardados." };
  }

  const suelto = numero(f.get("cantidad"));
  const envases = numero(f.get("envases"));
  if (Number.isNaN(suelto) || (suelto ?? 0) < 0 || Number.isNaN(envases) || (envases ?? 0) < 0) return { error: "Revisa la cantidad que hay hoy." };
  const { data, error } = await supabase.from("articulos").insert(r.datos).select("id").single();
  if (error) return { error: mensajeError(error) };
  if ((suelto ?? 0) > 0 || (envases ?? 0) > 0) {
    const { error: e2 } = await supabase.rpc("registrar_ingreso", {
      p_articulo: data.id,
      p_cantidad: suelto ?? 0,
      p_envases: envases && envases > 0 ? envases : null,
      p_lote: txt(f, "lote"),
      p_vencimiento: txt(f, "vencimiento"),
      p_documento: null,
      p_nota: "Inventario inicial",
    });
    if (e2) return { error: `El artículo se creó, pero la cantidad inicial no: ${mensajeError(e2)}` };
  }
  revalidatePath("/inventario");
  redirect(`/inventario/${data.id}?creado=1`);
}

export async function registrarMovimiento(_: Estado, f: FormData): Promise<Estado> {
  await requierePerfil([...PERSONAL]);
  const articulo = String(f.get("articulo_id"));
  const tipo = txt(f, "tipo");
  const cantidad = numero(f.get("cantidad")) ?? 0;
  const envases = numero(f.get("envases")) ?? 0;
  if (Number.isNaN(cantidad) || Number.isNaN(envases) || cantidad < 0 || envases < 0 || cantidad + envases <= 0)
    return { error: "Escribe una cantidad mayor que cero." };
  const supabase = await createClient();
  let error;
  if (tipo === "ingreso" || tipo === "ajuste_positivo") {
    // El tamaño del envase puede variar en cada compra (frascos de 1 kg, 500 g…)
    const nCont = numero(f.get("contenido_num"));
    const uCont = txt(f, "contenido_unidad");
    const base = txt(f, "unidad") ?? "unidad";
    const contenido = envases > 0 && nCont && !Number.isNaN(nCont) && nCont > 0 ? aBase(nCont, uCont ?? base, base) : null;
    ({ error } = await supabase.rpc("registrar_ingreso", {
      p_articulo: articulo,
      p_cantidad: cantidad,
      p_envases: envases > 0 ? envases : null,
      p_contenido: contenido,
      p_envase: txt(f, "envase"),
      p_lote: txt(f, "lote"),
      p_vencimiento: txt(f, "vencimiento"),
      p_documento: txt(f, "documento"),
      p_nota: txt(f, "nota"),
      p_tipo: tipo,
    }));
  } else if (tipo === "baja" || tipo === "ajuste_negativo") {
    if (cantidad <= 0) return { error: "Escribe la cantidad que sale." };
    if (!txt(f, "nota")) return { error: "Escribe el motivo (por ejemplo: vencido, se rompió, derrame)." };
    ({ error } = await supabase.rpc("registrar_salida", {
      p_articulo: articulo,
      p_cantidad: cantidad,
      p_tipo: tipo,
      p_lote: txt(f, "lote_id"),
      p_documento: txt(f, "documento"),
      p_nota: txt(f, "nota"),
    }));
  } else return { error: "Elige el tipo de movimiento." };
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/inventario/${articulo}`);
  revalidatePath("/inventario");
  return { ok: "Movimiento registrado en el kardex." };
}

export async function guardarLote(_: Estado, f: FormData): Promise<Estado> {
  await requierePerfil([...PERSONAL]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("lotes")
    .update({ lote: txt(f, "lote"), vencimiento: txt(f, "vencimiento") })
    .eq("id", String(f.get("id")));
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/inventario/${f.get("articulo_id")}`);
  return { ok: "Lote actualizado." };
}

// ---------------------------------------------------------------------------
// Importación desde Excel: se copian las filas (con encabezado) y se pegan.
// ---------------------------------------------------------------------------
const COLUMNAS: Record<string, string> = {
  tipo: "tipo",
  nombre: "nombre",
  familia: "familia",
  subfamilia: "familia",
  clasificacion: "familia",
  formula: "formula",
  cas: "cas",
  grado: "grado",
  concentracion: "concentracion",
  marca: "marca",
  presentacion: "presentacion",
  capacidad: "capacidad",
  unidad: "unidad",
  cantidad: "cantidad",
  stock: "cantidad",
  minimo: "stock_minimo",
  "stock minimo": "stock_minimo",
  ubicacion: "ubicacion",
  lote: "lote",
  vencimiento: "vencimiento",
  fiscalizado: "fiscalizado",
  prestable: "prestable",
  "codigo de barras": "codigo_barras",
  envase: "envase",
  "tipo de envase": "envase",
  envases: "envases",
  cajas: "envases",
  frascos: "envases",
  "cantidad de envases": "envases",
  contenido: "contenido",
  "contenido por envase": "contenido",
  "cada envase trae": "contenido",
  codigo: "codigo",
};

const TIPO_TEXTO: Record<string, TipoArticulo> = {
  reactivo: "reactivo",
  reactivos: "reactivo",
  vidrio: "vidrio",
  "material de vidrio": "vidrio",
  equipo: "equipo",
  equipos: "equipo",
  material: "material",
  "otro material": "material",
  otros: "material",
};

const UNIDAD_TEXTO: Record<string, string> = {
  g: "g", gr: "g", gramo: "g", gramos: "g", kg: "kg", kilo: "kg", mg: "mg",
  ml: "mL", mililitro: "mL", mililitros: "mL", l: "L", lt: "L", litro: "L", litros: "L",
  u: "unidad", und: "unidad", unid: "unidad", unidad: "unidad", unidades: "unidad", pza: "unidad",
  par: "par", caja: "caja", paquete: "paquete", rollo: "rollo",
};

// Fechas como 31/12/2027, 2027-12-31 o 12/2027
function leerFecha(s: string): string | null | "error" {
  const t = s.trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const ultimo = new Date(Date.UTC(Number(m[2]), Number(m[1]), 0)).getUTCDate();
    return `${m[2]}-${m[1].padStart(2, "0")}-${ultimo}`;
  }
  return "error";
}

const si = (s: string | undefined) => ["si", "sí", "x", "1", "true", "s"].includes(plano(s ?? "").trim());

export type EstadoImportar = Estado & { errores?: string[]; creados?: number };

export async function importarArticulos(_: EstadoImportar, f: FormData): Promise<EstadoImportar> {
  await requierePerfil([...PERSONAL]);
  const texto = String(f.get("texto") ?? "").replace(/\r/g, "");
  const filas = texto.split("\n").filter((l) => l.trim() !== "");
  if (filas.length < 2) return { error: "Pega el encabezado y al menos una fila." };
  const sep = filas[0].includes("\t") ? "\t" : filas[0].includes(";") ? ";" : ",";
  const encabezado = filas[0].split(sep).map((h) => COLUMNAS[plano(h).trim().replace(/[^a-z ]/g, "")] ?? null);
  if (!encabezado.includes("nombre")) return { error: "Falta la columna “Nombre” en el encabezado." };

  const supabase = await createClient();
  const [{ data: familias }, { data: ubicaciones }] = await Promise.all([
    supabase.from("familias").select("id, nombre, padre_id"),
    supabase.from("ubicaciones").select("id, nombre"),
  ]);
  // Si un nombre existe como familia y como subfamilia, se prefiere la subfamilia (más precisa)
  const famPorNombre = new Map<string, string>();
  for (const x of [...(familias ?? [])].sort((a, b) => (a.padre_id ? 1 : 0) - (b.padre_id ? 1 : 0))) famPorNombre.set(plano(x.nombre), x.id);
  const ubiPorNombre = new Map((ubicaciones ?? []).map((u) => [plano(u.nombre), u.id]));
  const tipoPorDefecto = (txt(f, "tipo_defecto") as TipoArticulo | null) ?? "reactivo";

  const errores: string[] = [];
  let creados = 0;
  for (let i = 1; i < filas.length; i++) {
    const celdas = filas[i].split(sep);
    const v: Record<string, string> = {};
    encabezado.forEach((c, j) => {
      if (c && celdas[j] !== undefined && celdas[j].trim() !== "") v[c] = v[c] ? `${v[c]} ${celdas[j].trim()}` : celdas[j].trim();
    });
    const n = i + 1;
    if (!v.nombre) continue;
    const tipo = v.tipo ? TIPO_TEXTO[plano(v.tipo).trim()] : tipoPorDefecto;
    if (!tipo) { errores.push(`Fila ${n}: tipo “${v.tipo}” no reconocido.`); continue; }
    let unidad = v.unidad ? UNIDAD_TEXTO[plano(v.unidad).trim()] : tipo === "reactivo" ? "g" : "unidad";
    if (!unidad) { errores.push(`Fila ${n}: unidad “${v.unidad}” no reconocida.`); continue; }
    let cantidad = v.cantidad ? numero(v.cantidad) : 0;
    if (cantidad === null || Number.isNaN(cantidad) || cantidad < 0) { errores.push(`Fila ${n}: revisa la cantidad.`); continue; }
    // "Unidad: caja" = se cuentan cajas; el stock se guarda en piezas (caja de N unidades)
    let cajas: string | null = null;
    if (unidad === "caja" || unidad === "paquete") { cajas = unidad; unidad = "unidad"; }
    // Envase: columnas propias o, si no hay, lo que diga la presentación ("Frasco 1 kg", "Caja x 10")
    let envase: string | null = null;
    let contenido: number | null = null;
    if (v.envase) {
      envase = ENVASES.find((e) => plano(e) === plano(v.envase).replace(/s$/, "")) ?? null;
      if (!envase) { errores.push(`Fila ${n}: envase “${v.envase}” no reconocido (usa: ${ENVASES.join(", ")}).`); continue; }
    }
    if (v.contenido) {
      const m = v.contenido.replace(",", ".").match(/^\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]*)\s*$/);
      const u = m?.[2] ? UNIDAD_TEXTO[plano(m[2])] : unidad;
      if (!m || !u) { errores.push(`Fila ${n}: no se entiende el contenido “${v.contenido}”.`); continue; }
      contenido = aBase(Number(m[1]), u, unidad);
    }
    const sugerido = leerPresentacion(v.presentacion, unidad);
    if (!envase && sugerido) envase = sugerido.envase;
    if (!contenido && sugerido && envase === sugerido.envase) contenido = sugerido.contenido;
    if (cajas) {
      envase ??= cajas;
      if (!contenido) { errores.push(`Fila ${n}: se cuenta en ${cajas}; escribe cuántas piezas trae cada ${cajas} en la columna Contenido (por ejemplo 10).`); continue; }
    }
    if (envase && !contenido) envase = null;
    let nEnvases = v.envases ? numero(v.envases) : null;
    if (cajas && !v.envases) { nEnvases = cantidad; cantidad = 0; }
    if (nEnvases !== null && (Number.isNaN(nEnvases) || nEnvases < 0)) { errores.push(`Fila ${n}: revisa el número de envases.`); continue; }
    if (nEnvases && !contenido) { errores.push(`Fila ${n}: dice ${v.envases} envases pero no cuánto trae cada uno (columna Contenido).`); continue; }
    const minimo = v.stock_minimo ? numero(v.stock_minimo) : 0;
    const venc = leerFecha(v.vencimiento ?? "");
    if (venc === "error") { errores.push(`Fila ${n}: no se entiende la fecha de vencimiento “${v.vencimiento}”.`); continue; }
    let familia_id: string | null = null;
    if (tipo === "reactivo" && v.familia) {
      familia_id = famPorNombre.get(plano(v.familia)) ?? null;
      if (!familia_id) errores.push(`Fila ${n}: la familia “${v.familia}” no existe; “${v.nombre}” quedó sin clasificar.`);
    }
    let ubicacion_id: string | null = null;
    if (v.ubicacion) {
      ubicacion_id = ubiPorNombre.get(plano(v.ubicacion)) ?? null;
      if (!ubicacion_id) {
        const { data: u } = await supabase.from("ubicaciones").insert({ nombre: v.ubicacion }).select("id").single();
        if (u) { ubicacion_id = u.id; ubiPorNombre.set(plano(v.ubicacion), u.id); }
      }
    }
    const { data: art, error } = await supabase
      .from("articulos")
      .insert({
        tipo,
        nombre: v.nombre,
        codigo: v.codigo ?? null,
        codigo_barras: v.codigo_barras ?? null,
        familia_id,
        formula: tipo === "reactivo" ? v.formula ?? null : null,
        cas: tipo === "reactivo" ? v.cas ?? null : null,
        grado: tipo === "reactivo" ? v.grado ?? null : null,
        concentracion: tipo === "reactivo" ? v.concentracion ?? null : null,
        fiscalizado: tipo === "reactivo" && si(v.fiscalizado),
        capacidad: tipo === "reactivo" ? null : v.capacidad ?? null,
        prestable: tipo !== "reactivo" && (v.prestable ? si(v.prestable) : tipo !== "equipo"),
        marca: v.marca ?? null,
        presentacion: v.presentacion ?? (envase && contenido ? `${envase[0].toUpperCase()}${envase.slice(1)} de ${textoContenido(contenido, unidad)}` : null),
        envase,
        contenido,
        unidad,
        stock_minimo: minimo && !Number.isNaN(minimo) ? minimo : 0,
        ubicacion_id,
      })
      .select("id")
      .single();
    if (error) { errores.push(`Fila ${n} (${v.nombre}): ${mensajeError(error)}`); continue; }
    if (cantidad > 0 || (nEnvases ?? 0) > 0) {
      const { error: e2 } = await supabase.rpc("registrar_ingreso", {
        p_articulo: art.id,
        p_cantidad: cantidad,
        p_envases: nEnvases && nEnvases > 0 ? nEnvases : null,
        p_lote: v.lote ?? (venc ? "S/L" : null),
        p_vencimiento: venc,
        p_documento: null,
        p_nota: "Inventario inicial (importado)",
      });
      if (e2) errores.push(`Fila ${n} (${v.nombre}): se creó sin cantidad: ${mensajeError(e2)}`);
    }
    creados++;
  }
  revalidatePath("/inventario");
  return { ok: `Se importaron ${creados} artículos.`, errores, creados };
}

// Artículo creado contado en cajas o paquetes: pasa a contarse en piezas
export async function convertirAPiezas(_: Estado, f: FormData): Promise<Estado> {
  await requierePerfil([...PERSONAL]);
  const id = String(f.get("articulo_id"));
  const por = numero(f.get("por"));
  if (!por || Number.isNaN(por) || por <= 0 || !Number.isInteger(por)) return { error: "Escribe cuántas piezas trae cada caja (un número entero)." };
  const multiplicar = f.get("modo") !== "piezas";
  const supabase = await createClient();
  const { error } = await supabase.rpc("convertir_a_piezas", { p_articulo: id, p_por: por, p_multiplicar: multiplicar });
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/inventario/${id}`);
  revalidatePath("/inventario");
  return { ok: "Listo: ahora se cuenta en unidades." };
}
