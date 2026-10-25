const TZ = "America/Lima";

/** Hoy en Perú, YYYY-MM-DD */
export function hoy(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** "2026-10-25" → "25 oct. 2026" */
export function fecha(f: string | null | undefined): string {
  if (!f) return "—";
  const [y, m, d] = f.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function fechaHora(instante: string | Date): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(instante));
}

/** Cantidad sin ceros de más: 1000, 12.5 */
export function cant(n: number | string | null | undefined): string {
  return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 3 }).format(Number(n ?? 0));
}

export function soles(n: number | string | null | undefined): string {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(n ?? 0));
}

/** Lee un número escrito con coma o punto decimal */
export function numero(v: FormDataEntryValue | string | null | undefined): number | null {
  const s = String(v ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function txt(f: FormData, k: string): string | null {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
}

/** Texto para buscar sin tildes ni mayúsculas */
export function plano(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Escapa comodines para .ilike() de PostgREST */
export function patron(q: string): string {
  return `%${q.replace(/[%_,()]/g, " ").trim()}%`;
}
