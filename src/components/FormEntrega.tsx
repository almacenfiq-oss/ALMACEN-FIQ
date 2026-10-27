"use client";

import { useFormAccion } from "@/lib/useFormAccion";

import LineasArticulos, { type Linea } from "./LineasArticulos";
import { registrarEntrega, type Estado } from "@/app/(app)/entregas/actions";
import type { ArticuloCorto } from "@/lib/tipos";

export default function FormEntrega({
  practicaId,
  docentes,
  articulos,
  inicial,
}: {
  practicaId?: string;
  docentes: { id: string; nombres: string }[];
  articulos: ArticuloCorto[];
  inicial: Linea[];
}) {
  const [estado, enviar, enviando] = useFormAccion<Estado>(registrarEntrega, {});
  return (
    <form onSubmit={enviar} className="form">
      {practicaId && <input type="hidden" name="practica_id" value={practicaId} />}
      {estado.error && <div className="alert error" role="alert">{estado.error}</div>}
      <div className="fields">
        {!practicaId && (
          <div className="field">
            <label htmlFor="e-doc">Docente</label>
            <select id="e-doc" name="docente_id" required defaultValue="">
              <option value="" disabled>Elige…</option>
              {docentes.map((d) => <option key={d.id} value={d.id}>{d.nombres}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="e-recibe">Quién recoge</label>
          <input id="e-recibe" name="recibe" placeholder="Docente o jefe de práctica" />
        </div>
        <div className="field wide">
          <label htmlFor="e-nota">Nota</label>
          <input id="e-nota" name="nota" placeholder="Opcional" />
        </div>
      </div>
      <LineasArticulos articulos={articulos} inicial={inicial} textoVacio="Agrega lo que se entrega." />
      <p className="ayuda">Deja en blanco o en 0 lo que no entregues hoy; quedará pendiente para otra entrega. Lo entregado se descuenta del inventario y no se devuelve.</p>
      {estado.bajoMinimo && (
        <label className="check aviso">
          <input type="checkbox" name="bajo_minimo" /> Entregar de todos modos (el almacén quedará por debajo del mínimo)
        </label>
      )}
      <div className="row">
        <button className="btn primary" type="submit" disabled={enviando}>{enviando ? "Registrando…" : "Registrar entrega"}</button>
      </div>
    </form>
  );
}
