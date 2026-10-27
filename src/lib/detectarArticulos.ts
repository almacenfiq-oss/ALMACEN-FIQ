// Reconoce reactivos y materiales del inventario en el texto de una guía de práctica (PDF).
// Todo corre en el navegador: no se envía el archivo a ningún servicio.
import { aBase, unidadesCompatibles } from "./unidades";

export type ArticuloBuscable = { id: string; nombre: string; formula: string | null; codigo: string; unidad: string };
export type Sugerencia = {
  linea: string;
  articulo_id: string | null;
  cantidad: string;
  por: "grupo" | "seccion";
  confianza: "alta" | "media" | "baja";
};

const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "en", "y", "para", "con", "x", "por", "a", "al", "o", "u"]);
const SUBINDICES: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const subANum = (s: string) => s.replace(/[₀-₉]/g, (c) => SUBINDICES[c]);

// "precipitados" → "precipitado", "soluciones" → "solucion": plural simple del español
function raiz(t: string): string {
  if (t.length > 4 && t.endsWith("es") && !/[aeiou]es$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s")) return t.slice(0, -1);
  return t;
}

function fichas(s: string): string[] {
  return sinTildes(subANum(s))
    .toLowerCase()
    .replace(/(\d),(\d)/g, "$1.$2")
    .split(/[^a-z0-9.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t && !VACIAS.has(t))
    .map(raiz);
}

// Fórmulas que vale la pena buscar tal cual (evita "C", "I", "S" sueltas)
const formulaBuscable = (f: string) => f.length >= 2 && /[A-Z]/.test(f) && (/\d/.test(f) || /[A-Z].*[A-Z]|[A-Z][a-z]/.test(f));

const UNIDAD_TXT: Record<string, string> = { mg: "mg", g: "g", gr: "g", grs: "g", gramos: "g", gramo: "g", kg: "kg", ml: "mL", l: "L", lt: "L", litro: "L", litros: "L", cc: "mL" };
const RE_MEDIDA = /(\d+(?:[.,]\d+)?)\s*(mg|grs?|gramos?|g|kg|ml|cc|lt|litros?|l)\b/gi;

// Cantidad de la línea en la unidad del artículo
function cantidadEn(linea: string, unidad: string, numerosDelNombre: Set<string>): string {
  const compatibles = unidadesCompatibles(unidad);
  const esMedida = compatibles.length > 1;
  if (esMedida) {
    for (const m of linea.matchAll(RE_MEDIDA)) {
      const u = UNIDAD_TXT[m[2].toLowerCase()];
      if (u && compatibles.includes(u)) return String(aBase(Number(m[1].replace(",", ".")), u, unidad));
    }
    return "";
  }
  // Piezas: un número que no sea medida, porcentaje, concentración ni parte del nombre (250 mL del vaso)
  const limpia = linea
    .replace(/^\s*\d{1,2}[.)]\s+/, " ") // numeración de la lista
    .replace(RE_MEDIDA, " ")
    .replace(/\d+(?:[.,]\d+)?\s*(%|°|ºc|°c|m\b|n\b|cm|mm|mol)/gi, " ");
  for (const m of limpia.matchAll(/(?<![\w.,])(\d{1,4})(?![\w]|[.,]\d)/g)) {
    if (numerosDelNombre.has(m[1])) continue;
    const n = Number(m[1]);
    if (n > 0 && n <= 1000) return String(n);
  }
  return "";
}

function porDe(linea: string): "grupo" | "seccion" | null {
  const t = sinTildes(linea).toLowerCase();
  if (/por (seccion|turno|horario|clase)/.test(t)) return "seccion";
  if (/por (grupo|mesa|equipo de trabajo)/.test(t)) return "grupo";
  return null;
}

// Une los textos del PDF en líneas (misma página y misma altura)
export function unirLineas(paginas: { str: string; x: number; y: number }[][]): string[] {
  const salida: string[] = [];
  for (const items of paginas) {
    const filas = new Map<number, { x: number; str: string }[]>();
    for (const it of items) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.y / 3) * 3;
      const fila = filas.get(y) ?? [];
      fila.push({ x: it.x, str: it.str });
      filas.set(y, fila);
    }
    [...filas.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, f]) => salida.push(f.sort((a, b) => a.x - b.x).map((p) => p.str).join(" ").replace(/\s+/g, " ").trim()));
  }
  return salida.filter(Boolean);
}

export function detectar(lineas: string[], articulos: ArticuloBuscable[]): Sugerencia[] {
  const prep = articulos.map((a) => {
    const t = fichas(a.nombre);
    return {
      a,
      palabras: t.filter((x) => !/^\d/.test(x) && x !== "ml" && x !== "l" && x !== "g"),
      numeros: new Set(t.filter((x) => /^\d/.test(x))),
      formula: a.formula && formulaBuscable(subANum(a.formula)) ? subANum(a.formula) : null,
    };
  });
  const vistos = new Map<string, number>();
  let porTitulo: "grupo" | "seccion" = "grupo"; // "Materiales (por sección)" vale para lo que sigue
  const salida: Sugerencia[] = [];
  for (const linea of lineas) {
    if (linea.length > 220) continue; // párrafos del procedimiento, no listas
    const tl = new Set(fichas(linea));
    const lineaF = subANum(linea);
    let mejor: { p: (typeof prep)[number]; puntos: number } | null = null;
    for (const p of prep) {
      let puntos = 0;
      const coinciden = p.palabras.filter((w) => tl.has(w)).length;
      if (p.palabras.length && coinciden === p.palabras.length) {
        puntos = p.palabras.length * 10 + p.palabras.join("").length;
        for (const n of p.numeros) if (tl.has(n)) puntos += 15; // la capacidad coincide (250 mL)
        if (p.numeros.size && ![...p.numeros].some((n) => tl.has(n))) puntos -= 5;
      } else if (p.palabras[0]?.length >= 4 && tl.has(p.palabras[0]) && /\d/.test(linea)) {
        // Coincidencia parcial ("Bureta de 50 mL" ↔ "Bureta con llave de teflón"): se sugiere, pero sin marcar
        puntos = Math.min(4 + coinciden * 2, 9);
      }
      if (p.formula && new RegExp(`(^|[^A-Za-z0-9])${p.formula.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^A-Za-z0-9])`).test(lineaF)) {
        puntos = Math.max(puntos, 40);
      }
      if (puntos > (mejor?.puntos ?? 0)) mejor = { p, puntos };
    }
    if (mejor) {
      const cantidad = cantidadEn(linea, mejor.p.a.unidad, mejor.p.numeros);
      const nueva: Sugerencia = {
        linea,
        articulo_id: mejor.p.a.id,
        cantidad,
        por: porDe(linea) ?? porTitulo,
        confianza: mejor.puntos >= 25 && cantidad ? "alta" : mejor.puntos >= 10 ? "media" : "baja",
      };
      // Si el artículo ya salió antes (lista de materiales), se queda la mejor coincidencia
      const antes = vistos.get(mejor.p.a.id);
      if (antes === undefined) {
        vistos.set(mejor.p.a.id, salida.length);
        salida.push(nueva);
      } else if (salida[antes].confianza === "baja" && nueva.confianza !== "baja") {
        salida[antes] = nueva;
      } else if (nueva.confianza === "baja" && nueva.cantidad) {
        // Parecido a algo que ya salió (Cloruro de potasio ≠ Cloruro de sodio): se muestra para revisarlo
        salida.push({ ...nueva, articulo_id: null });
      }
    } else if (/^\s*([-•·*▪●○]|\d{1,2}[.)])\s+\S/.test(linea) && RE_MEDIDA.test(linea)) {
      RE_MEDIDA.lastIndex = 0;
      // Parece un renglón de lista con cantidad, pero no está en el inventario
      salida.push({ linea, articulo_id: null, cantidad: "", por: porDe(linea) ?? porTitulo, confianza: "baja" });
    } else {
      porTitulo = porDe(linea) ?? porTitulo;
    }
    RE_MEDIDA.lastIndex = 0;
  }
  return salida;
}
