"use client";

import { useFormAccion } from "@/lib/useFormAccion";

import Link from "next/link";
import { importarArticulos, type EstadoImportar } from "@/app/(app)/inventario/actions";
import { TIPOS } from "@/lib/tipos";

export default function FormImportar() {
  const [estado, enviar, enviando] = useFormAccion<EstadoImportar>(importarArticulos, {});
  return (
    <form onSubmit={enviar} className="form">
      {estado.error && <div className="alert error" role="alert">{estado.error}</div>}
      {estado.ok && (
        <div className="alert ok" role="status">
          {estado.ok} <Link href="/inventario">Ver inventario</Link>
        </div>
      )}
      {estado.errores && estado.errores.length > 0 && (
        <div className="aviso">
          <b>Revisa estas filas:</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{estado.errores.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      <div className="fields">
        <div className="field">
          <label htmlFor="i-tipo">Si una fila no dice el tipo, es</label>
          <select id="i-tipo" name="tipo_defecto" defaultValue="reactivo">
            {Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>
        <div className="field wide">
          <label htmlFor="i-texto">Pega aquí las filas copiadas de Excel (con la fila de títulos)</label>
          <textarea id="i-texto" name="texto" required style={{ minHeight: 240, fontFamily: "var(--font-mono)", fontSize: 13 }} />
        </div>
      </div>
      <div className="row">
        <button className="btn primary" type="submit" disabled={enviando}>{enviando ? "Importando…" : "Importar"}</button>
      </div>
    </form>
  );
}
