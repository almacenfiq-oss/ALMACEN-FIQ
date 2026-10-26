// Envases y conversión entre unidades de la misma magnitud (masa o volumen)

export const ENVASES = ["frasco", "caja", "paquete", "bolsa", "botella", "galonera", "ampolla", "sobre", "rollo", "bidón"] as const;

const MASA: Record<string, number> = { mg: 0.001, g: 1, kg: 1000 };
const VOLUMEN: Record<string, number> = { mL: 1, L: 1000 };

/** Unidades en las que se puede escribir el contenido de un envase, según la unidad base */
export function unidadesCompatibles(base: string): string[] {
  if (base in MASA) return Object.keys(MASA);
  if (base in VOLUMEN) return Object.keys(VOLUMEN);
  return [base];
}

/** Convierte `n` de la unidad `desde` a la unidad base (1 kg → 1000 si la base es g) */
export function aBase(n: number, desde: string, base: string): number {
  const tabla = base in MASA ? MASA : base in VOLUMEN ? VOLUMEN : null;
  if (!tabla || !(desde in tabla)) return n;
  return Math.round(((n * tabla[desde]) / tabla[base]) * 1000) / 1000;
}

/** Muestra el contenido en la unidad más cómoda: 1000 g → "1 kg", 2500 mL → "2.5 L", 10 unidad → "10 unidades" */
export function textoContenido(n: number, base: string): string {
  const f = (x: number) => new Intl.NumberFormat("es-PE", { maximumFractionDigits: 3 }).format(x);
  if (base === "g" && n >= 1000) return `${f(n / 1000)} kg`;
  if (base === "mL" && n >= 1000) return `${f(n / 1000)} L`;
  if (base === "unidad") return `${f(n)} ${n === 1 ? "unidad" : "unidades"}`;
  return `${f(n)} ${base}`;
}

export function plural(envase: string, n: number): string {
  if (Math.abs(n) === 1) return envase;
  return /[aeiouáéíóú]$/i.test(envase) ? `${envase}s` : envase.endsWith("ón") ? `${envase.slice(0, -2)}ones` : `${envase}es`;
}

/** "3.5 frascos de 1 kg" para mostrar junto al stock */
export function enEnvases(cantidad: number, contenido: number | null, envase: string | null, base: string): string | null {
  if (!contenido || contenido <= 0) return null;
  const n = Math.round((cantidad / contenido) * 100) / 100;
  const e = envase ?? "envase";
  return `≈ ${new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(n)} ${plural(e, n)} de ${textoContenido(contenido, base)}`;
}

/**
 * Lee la presentación escrita como texto para sugerir envase y contenido:
 * "Frasco 1 kg" → frasco, 1000 (base g); "Caja x 12" → caja, 12; "Galonera 4 L" → galonera, 4000 (base mL)
 */
export function leerPresentacion(texto: string | null | undefined, base: string): { envase: string; contenido: number } | null {
  if (!texto) return null;
  const t = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const envase = ENVASES.find((e) => t.includes(e.normalize("NFD").replace(/[̀-ͯ]/g, ""))) ?? null;
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(mg|kg|g|gr|ml|l|lt|litros?|unid(?:ades)?|u)?\b/);
  if (!envase || !m) return null;
  const n = Number(m[1].replace(",", "."));
  const u = (m[2] ?? "").replace(/^gr$/, "g").replace(/^(lt|litros?)$/, "l").replace(/^ml$/, "mL").replace(/^l$/, "L");
  if (!n || n <= 0) return null;
  if (!u || u.startsWith("u")) return base in MASA || base in VOLUMEN ? null : { envase, contenido: n };
  if (unidadesCompatibles(base).includes(u)) return { envase, contenido: aBase(n, u, base) };
  return null;
}

/** Unidades antiguas que en realidad son envases: el stock debe ir en piezas */
export const ENVASE_COMO_UNIDAD: readonly string[] = ["caja", "paquete"];
