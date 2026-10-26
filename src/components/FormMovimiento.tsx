"use client";

import { useFormAccion } from "@/lib/useFormAccion";
import { useEffect, useRef, useState } from "react";
import { registrarMovimiento, type Estado } from "@/app/(app)/inventario/actions";
import { cant, fecha, numero } from "@/lib/formato";
import { aBase, unidadesCompatibles } from "@/lib/unidades";
import { CamposCantidad } from "./CamposEnvase";

type Lote = { id: string; lote: string; vencimiento: string | null; cantidad: number };

// Ingreso, baja o ajuste de un artículo, con lote y vencimiento para reactivos
export default function FormMovimiento({
  articuloId,
  unidad,
  reactivo,
  lotes,
  envase,
  contenido,
}: {
  articuloId: string;
  unidad: string;
  reactivo: boolean;
  lotes: Lote[];
  envase: string | null;
  contenido: number | null;
}) {
  const [estado, enviar, enviando] = useFormAccion<Estado>(registrarMovimiento, {});
  const [tipo, setTipo] = useState("ingreso");
  const ref = useRef<HTMLFormElement>(null);
  const grande = !!contenido && contenido >= 1000 && (unidad === "g" || unidad === "mL");
  const [tam, setTam] = useState(contenido ? String(grande ? contenido / 1000 : contenido) : "");
  const [uTam, setUTam] = useState(grande ? (unidad === "g" ? "kg" : "L") : unidad);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    if (estado.ok) {
      ref.current?.reset();
      setVuelta((v) => v + 1);
    }
  }, [estado]);
  const nTam = numero(tam);
  const tamBase = nTam && !Number.isNaN(nTam) && nTam > 0 ? aBase(nTam, uTam, unidad) : null;
  const opciones = unidadesCompatibles(unidad);
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
        <input type="hidden" name="unidad" value={unidad} />
        {tipo === "ingreso" && envase ? (
          <>
            <input type="hidden" name="envase" value={envase} />
            <div className="field">
              <label htmlFor="m-tam">Cada {envase} trae</label>
              <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                <input id="m-tam" name="contenido_num" inputMode="decimal" value={tam} onChange={(e) => setTam(e.target.value)} />
                {opciones.length > 1 ? (
                  <select name="contenido_unidad" value={uTam} onChange={(e) => setUTam(e.target.value)} aria-label="Unidad" style={{ width: "auto" }}>
                    {opciones.map((u) => <option key={u}>{u}</option>)}
                  </select>
                ) : (
                  <>
                    <input type="hidden" name="contenido_unidad" value={unidad} />
                    <span className="muted">{unidad === "unidad" ? "unidades" : unidad}</span>
                  </>
                )}
              </span>
            </div>
            <CamposCantidad key={vuelta} unidad={unidad} envase={envase} contenidoBase={tamBase} prefijo="m-" />
          </>
        ) : (
          <div className="field">
            <label htmlFor="m-cant">Cantidad ({unidad === "unidad" ? "unidades" : unidad})</label>
            <input id="m-cant" name="cantidad" inputMode="decimal" required />
          </div>
        )}
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
