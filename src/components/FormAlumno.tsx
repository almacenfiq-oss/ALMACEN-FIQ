"use client";

import { useFormAccion } from "@/lib/useFormAccion";

import { guardarAlumno, type Estado } from "@/app/(app)/prestamos/actions";

type Alumno = { id?: string; codigo?: string; nombres?: string; dni?: string | null; escuela?: string | null; ciclo?: string | null; telefono?: string | null; email?: string | null; notas?: string | null; activo?: boolean };

export default function FormAlumno({ inicial = {}, volver }: { inicial?: Alumno; volver?: "prestamo" }) {
  const [estado, enviar, enviando] = useFormAccion<Estado>(guardarAlumno, {});
  const v = (x: unknown) => (x == null ? "" : String(x));
  return (
    <form onSubmit={enviar} className="form">
      {inicial.id && <input type="hidden" name="id" value={inicial.id} />}
      {volver && <input type="hidden" name="volver" value={volver} />}
      {estado.error && <div className="alert error" role="alert">{estado.error}</div>}
      {estado.ok && <div className="alert ok" role="status">{estado.ok}</div>}
      <div className="fields">
        <div className="field">
          <label htmlFor="al-cod">Código universitario</label>
          <input id="al-cod" name="codigo" required defaultValue={v(inicial.codigo)} className="mono" />
        </div>
        <div className="field wide">
          <label htmlFor="al-nom">Apellidos y nombres</label>
          <input id="al-nom" name="nombres" required defaultValue={v(inicial.nombres)} />
        </div>
        <div className="field">
          <label htmlFor="al-dni">DNI</label>
          <input id="al-dni" name="dni" inputMode="numeric" defaultValue={v(inicial.dni)} />
        </div>
        <div className="field">
          <label htmlFor="al-esc">Escuela profesional</label>
          <input id="al-esc" name="escuela" defaultValue={v(inicial.escuela)} placeholder="Ingeniería Química" />
        </div>
        <div className="field">
          <label htmlFor="al-ciclo">Ciclo</label>
          <input id="al-ciclo" name="ciclo" defaultValue={v(inicial.ciclo)} />
        </div>
        <div className="field">
          <label htmlFor="al-tel">Celular</label>
          <input id="al-tel" name="telefono" inputMode="tel" defaultValue={v(inicial.telefono)} />
        </div>
        <div className="field">
          <label htmlFor="al-mail">Correo</label>
          <input id="al-mail" name="email" type="email" defaultValue={v(inicial.email)} />
        </div>
        <div className="field wide">
          <label htmlFor="al-notas">Notas</label>
          <input id="al-notas" name="notas" defaultValue={v(inicial.notas)} />
        </div>
        {inicial.id && (
          <label className="check field wide">
            <input type="checkbox" name="activo" defaultChecked={inicial.activo} /> Activo
          </label>
        )}
      </div>
      <div className="row">
        <button className="btn primary" type="submit" disabled={enviando}>{enviando ? "Guardando…" : inicial.id ? "Guardar" : "Registrar alumno"}</button>
      </div>
    </form>
  );
}
