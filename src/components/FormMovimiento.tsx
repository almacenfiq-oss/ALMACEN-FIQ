"use client";

import { useFormAccion } from "@/lib/useFormAccion";
import { useEffect, useRef, useState } from "react";
import { registrarMovimiento, type Estado } from "@/app/(app)/inventario/actions";
import { cant, fecha } from "@/lib/formato";

type Lote = { id: string; lote: string; vencimiento: string | null; cantidad: number };

// Ingreso, baja o ajuste de un artículo, con lote y vencimiento para reactivos
export default function FormMovimiento({ articuloId, unidad, reactivo, lotes }: { articuloId: string; unidad: string; reactivo: boolean; lotes: Lote[] }) {
  const [estado, enviar, enviando] = useFormAccion<Estado>(registrarMovimiento, {});
  const [tipo, setTipo] = useState("ingreso");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) ref.current?.reset();
  }, [estado]);
  const entra = tipo === "ingreso" || tipo === "ajuste_positivo";
  return (
    <form ref={ref} onSubmit={enviar} className="form">
      <input type="hidden" name="articulo_id" value={articuloId} />
      {estado.error && <div className="alert error" role="alert">{estado.error}</div>}
      {estado.ok && <div className="alert ok" role="status">{estado.ok}</div>}
      <div className="fields">
        <div className="field">
          <label htmlFor="m-tipo">Movimiento</label>
          <select id="m-tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="ingreso">Ingreso (compra o donación)</option>
            <option value="baja">Baja (vencido, roto, derrame)</option>
            <option value="ajuste_positivo">Ajuste: sobra en el conteo</option>
            <option value="ajuste_negativo">Ajuste: falta en el conteo</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="m-cant">Cantidad ({unidad})</label>
          <input id="m-cant" name="cantidad" inputMode="decimal" required />
        </div>
        {reactivo && entra && (
          <>
            <div className="field">
              <label htmlFor="m-lote">Lote</label>
              <input id="m-lote" name="lote" className="mono" placeholder="Opcional" list="m-lotes" />
              <datalist id="m-lotes">{lotes.map((l) => <option key={l.id} value={l.lote} />)}</datalist>
            </div>
            <div className="field">
              <label htmlFor="m-venc">Vencimiento</label>
              <input id="m-venc" name="vencimiento" type="date" />
            </div>
          </>
        )}
        {!entra && lotes.length > 0 && (
          <div className="field">
            <label htmlFor="m-loteid">Lote</label>
            <select id="m-loteid" name="lote_id" defaultValue={tipo === "baja" ? lotes[0].id : ""}>
              {tipo !== "baja" && <option value="">El que vence primero</option>}
              {lotes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lote} · vence {fecha(l.vencimiento)} · {cant(l.cantidad)} {unidad}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="m-doc">Documento</label>
          <input id="m-doc" name="documento" placeholder={entra ? "Guía, factura, PECOSA" : "Acta, informe"} />
        </div>
        <div className="field wide">
          <label htmlFor="m-nota">{entra ? "Nota" : "Motivo"}</label>
          <input id="m-nota" name="nota" required={!entra} placeholder={entra ? "Opcional" : "Vencido, se rompió, derrame…"} />
        </div>
      </div>
      <div className="row">
        <button className="btn primary" type="submit" disabled={enviando}>{enviando ? "Registrando…" : "Registrar"}</button>
      </div>
    </form>
  );
}
