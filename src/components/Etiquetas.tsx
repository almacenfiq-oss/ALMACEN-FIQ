import { PICTOGRAMAS, TIPOS, type TipoArticulo } from "@/lib/tipos";

// Rombos SGA con su código (GHS02…); el nombre aparece al pasar el cursor
export function Pictogramas({ codigos }: { codigos: string[] | null }) {
  if (!codigos?.length) return null;
  return (
    <span className="ghs" aria-label={codigos.map((c) => PICTOGRAMAS[c] ?? c).join(", ")}>
      {codigos.map((c) => (
        <span key={c} title={PICTOGRAMAS[c] ?? c}>
          <i>{c.replace("GHS", "")}</i>
        </span>
      ))}
    </span>
  );
}

export function Grupo({ codigo, nombre, color }: { codigo: string | null; nombre?: string; color?: string }) {
  if (!codigo) return null;
  return (
    <span className="grupo" style={{ "--c": color } as React.CSSProperties} title={nombre}>
      {codigo}
      {nombre ? ` · ${nombre}` : ""}
    </span>
  );
}

export function EstadoStock({ estado }: { estado: "agotado" | "bajo" | "ok" }) {
  if (estado === "ok") return null;
  return <span className={`chip ${estado}`}>{estado === "agotado" ? "Agotado" : "Stock bajo"}</span>;
}

export function Tipo({ tipo }: { tipo: TipoArticulo }) {
  return <span className="chip tipo">{TIPOS[tipo]}</span>;
}
