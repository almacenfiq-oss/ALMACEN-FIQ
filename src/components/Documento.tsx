// Encabezado y firmas de los documentos que se imprimen (acta de entrega, constancia de préstamo)
export function Encabezado({ titulo, numero, copia }: { titulo: string; numero: number; copia: string }) {
  return (
    <header className="doc-cab">
      <div>
        <b>ALMACÉN DE LABORATORIO · FIQ</b>
        <div>{titulo}</div>
      </div>
      <div className="doc-num">
        <b>N.º {String(numero).padStart(5, "0")}</b>
        <div>Copia: {copia}</div>
      </div>
    </header>
  );
}

type Firma = { rol: string; nombre?: string | null; dni?: string | null; extra?: string | null };

export function Firmas({ izquierda, derecha }: { izquierda: Firma; derecha: Firma }) {
  const bloque = (f: Firma) => (
    <div className="firma">
      <div className="linea" />
      <b>{f.rol}</b>
      <div>Nombre: {f.nombre ?? "........................................................"}</div>
      <div>DNI: {f.dni || ".............................."}</div>
      {f.extra && <div>{f.extra}</div>}
    </div>
  );
  return (
    <div className="firmas">
      {bloque(izquierda)}
      {bloque(derecha)}
    </div>
  );
}
