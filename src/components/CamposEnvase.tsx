"use client";

import { useState } from "react";
import { ENVASES, plural, textoContenido, unidadesCompatibles } from "@/lib/unidades";
import { cant, numero } from "@/lib/formato";

// En qué envase viene el artículo y cuánto trae cada uno (en la unidad que se prefiera)
export function CamposEnvase({
  unidad,
  envase,
  setEnvase,
  contenido,
  setContenido,
  uContenido,
  setUContenido,
}: {
  unidad: string;
  envase: string;
  setEnvase: (v: string) => void;
  contenido: string;
  setContenido: (v: string) => void;
  uContenido: string;
  setUContenido: (v: string) => void;
}) {
  const opciones = unidadesCompatibles(unidad);
  return (
    <>
      <div className="field">
        <label htmlFor="a-env">Viene en</label>
        <select id="a-env" name="envase" value={envase} onChange={(e) => setEnvase(e.target.value)}>
          <option value="">Suelto (sin envase)</option>
          {ENVASES.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>
      {envase && (
        <div className="field">
          <label htmlFor="a-cont">Cada {envase} trae</label>
          <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
            <input id="a-cont" name="contenido_num" inputMode="decimal" value={contenido} onChange={(e) => setContenido(e.target.value)} placeholder={unidad === "unidad" ? "10" : "1"} required />
            {opciones.length > 1 ? (
              <select name="contenido_unidad" value={opciones.includes(uContenido) ? uContenido : unidad} onChange={(e) => setUContenido(e.target.value)} aria-label="Unidad del contenido" style={{ width: "auto" }}>
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
      )}
    </>
  );
}

// Cuánto entra: envases completos + cantidad suelta (un frasco abierto), con el total a la vista
export function CamposCantidad({
  unidad,
  envase,
  contenidoBase,
  prefijo = "",
  etiqueta = "Cantidad",
}: {
  unidad: string;
  envase: string | null;
  contenidoBase: number | null;
  prefijo?: string;
  etiqueta?: string;
}) {
  return <CantidadInterna key={`${envase}-${contenidoBase}`} unidad={unidad} envase={envase} contenidoBase={contenidoBase} prefijo={prefijo} etiqueta={etiqueta} />;
}


function CantidadInterna({ unidad, envase, contenidoBase, prefijo, etiqueta }: { unidad: string; envase: string | null; contenidoBase: number | null; prefijo: string; etiqueta: string }) {
  const [envases, setEnvases] = useState("");
  const [suelta, setSuelta] = useState("");
  const conEnvase = !!envase && !!contenidoBase && contenidoBase > 0;
  const nE = numero(envases) ?? 0;
  const nS = numero(suelta) ?? 0;
  const total = (Number.isNaN(nE) ? 0 : nE) * (contenidoBase ?? 0) + (Number.isNaN(nS) ? 0 : nS);
  const u = unidad === "unidad" ? "unidades" : unidad;
  if (!conEnvase) {
    return (
      <div className="field">
        <label htmlFor={`${prefijo}cant`}>{etiqueta} ({u})</label>
        <input id={`${prefijo}cant`} name="cantidad" inputMode="decimal" value={suelta} onChange={(e) => setSuelta(e.target.value)} placeholder="0" />
      </div>
    );
  }
  return (
    <>
      <div className="field">
        <label htmlFor={`${prefijo}env`}>{plural(envase!, 2).replace(/^./, (c) => c.toUpperCase())} completos de {textoContenido(contenidoBase!, unidad)}</label>
        <input id={`${prefijo}env`} name="envases" inputMode="decimal" value={envases} onChange={(e) => setEnvases(e.target.value)} placeholder="0" />
      </div>
      <div className="field">
        <label htmlFor={`${prefijo}cant`}>Más suelto / abierto ({u})</label>
        <input id={`${prefijo}cant`} name="cantidad" inputMode="decimal" value={suelta} onChange={(e) => setSuelta(e.target.value)} placeholder="0" />
      </div>
      <div className="field">
        <label>Total</label>
        <div className="total-env"><b>{cant(total)}</b> {u}</div>
      </div>
    </>
  );
}

