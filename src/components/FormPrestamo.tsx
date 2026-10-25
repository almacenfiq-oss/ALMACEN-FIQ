"use client";

import { useFormAccion } from "@/lib/useFormAccion";

import LineasArticulos from "./LineasArticulos";
import { registrarPrestamo, type Estado } from "@/app/(app)/prestamos/actions";
import type { ArticuloCorto } from "@/lib/tipos";

export default function FormPrestamo({
  alumnoId,
  articulos,
  docentes,
  hoy,
  sugerida,
}: {
  alumnoId: string;
  articulos: ArticuloCorto[];
  docentes: { id: string; nombres: string }[];
  hoy: string;
  sugerida: string;
}) {
  const [estado, enviar, enviando] = useFormAccion<Estado>(registrarPrestamo, {});
  return (
    <form onSubmit={enviar} className="form">
      <input type="hidden" name="alumno_id" value={alumnoId} />
      {estado.error && <div className="alert error" role="alert">{estado.error}</div>}
      <div className="fields">
        <div className="field">
          <label htmlFor="pr-lim">Devolver a más tardar</label>
          <input id="pr-lim" name="fecha_limite" type="date" min={hoy} defaultValue={sugerida} required />
        </div>
        <div className="field">
          <label htmlFor="pr-mot">Curso o práctica</label>
          <input id="pr-mot" name="motivo" placeholder="Química Orgánica · Práctica 3" />
        </div>
        <div className="field">
          <label htmlFor="pr-doc">Docente responsable</label>
          <select id="pr-doc" name="docente_id" defaultValue="">
            <option value="">—</option>
            {docentes.map((d) => <option key={d.id} value={d.id}>{d.nombres}</option>)}
          </select>
        </div>
        <div className="field wide">
          <label htmlFor="pr-nota">Nota</label>
          <input id="pr-nota" name="nota" placeholder="Estado en que se entrega, observaciones" />
        </div>
      </div>
      <LineasArticulos articulos={articulos} textoVacio="Busca o escanea el material que se lleva. Solo aparece material prestable (no reactivos)." />
      <div className="row">
        <button className="btn primary" type="submit" disabled={enviando}>{enviando ? "Registrando…" : "Registrar préstamo"}</button>
      </div>
    </form>
  );
}
