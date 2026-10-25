"use client";

import { useFormAccion } from "@/lib/useFormAccion";

import { registrarDevolucion, registrarReposicion, type Estado } from "@/app/(app)/prestamos/actions";
import { cant } from "@/lib/formato";

type Item = { id: string; nombre: string; unidad: string; pendiente: number };

// Devolución de todo el préstamo: por cada material cuánto vuelve bien, roto o perdido
export function FormDevolucion({ prestamoId, items }: { prestamoId: string; items: Item[] }) {
  const [estado, enviar, enviando] = useFormAccion<Estado>(registrarDevolucion, {});
  return (
    <form onSubmit={enviar} className="form">
      <input type="hidden" name="prestamo_id" value={prestamoId} />
      {estado.error && <div className="alert error" role="alert">{estado.error}</div>}
      {estado.ok && <div className="alert ok" role="status">{estado.ok}</div>}
      <div className="table-wrap">
        <table className="lineas">
          <thead><tr><th>Material</th><th className="r">Pendiente</th><th>Devuelve bien</th><th>Roto</th><th>Perdido</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.nombre}<input type="hidden" name="item" value={i.id} /></td>
                <td className="r num">{cant(i.pendiente)} {i.unidad}</td>
                <td><input name={`dev_${i.id}`} inputMode="decimal" defaultValue={Number(i.pendiente)} aria-label={`Devuelve bien: ${i.nombre}`} /></td>
                <td><input name={`roto_${i.id}`} inputMode="decimal" placeholder="0" aria-label={`Roto: ${i.nombre}`} /></td>
                <td><input name={`perd_${i.id}`} inputMode="decimal" placeholder="0" aria-label={`Perdido: ${i.nombre}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="field">
        <label htmlFor="d-nota">Observación</label>
        <input id="d-nota" name="nota" placeholder="Opcional: cómo se rompió, estado del material" />
      </div>
      <p className="ayuda">Lo roto o perdido se da de baja del inventario y el alumno queda con reposición pendiente: no podrá llevar más material hasta traer uno igual.</p>
      <div className="row">
        <button className="btn primary" type="submit" disabled={enviando}>{enviando ? "Registrando…" : "Registrar devolución"}</button>
      </div>
    </form>
  );
}

export function FormReposicion({ prestamoId, itemId, debe, unidad }: { prestamoId: string; itemId: string; debe: number; unidad: string }) {
  const [estado, enviar, enviando] = useFormAccion<Estado>(registrarReposicion, {});
  return (
    <form onSubmit={enviar} className="row" style={{ gap: 6 }}>
      <input type="hidden" name="prestamo_id" value={prestamoId} />
      <input type="hidden" name="item_id" value={itemId} />
      <input className="mini" name="cantidad" inputMode="decimal" defaultValue={Number(debe)} aria-label="Cantidad repuesta" />
      <span className="muted">{unidad}</span>
      <button className="btn small primary" type="submit" disabled={enviando}>Trajo el reemplazo</button>
      {estado.error && <span className="alert error">{estado.error}</span>}
      {estado.ok && <span className="alert ok">{estado.ok}</span>}
    </form>
  );
}
