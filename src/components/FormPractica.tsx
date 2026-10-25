"use client";

import { useFormAccion } from "@/lib/useFormAccion";

import LineasArticulos from "./LineasArticulos";
import type { Estado } from "@/app/(app)/practicas/actions";
import type { ArticuloCorto } from "@/lib/tipos";

type Practica = {
  id?: string;
  semestre_id?: string;
  docente_id?: string;
  area_id?: string | null;
  curso?: string;
  numero?: number | null;
  nombre?: string;
  fecha?: string | null;
  secciones?: number;
  grupos_por_seccion?: number;
  notas?: string | null;
};

// Datos de la práctica; al crearla también se eligen los artículos
export default function FormPractica({
  accion,
  inicial = {},
  semestres,
  docentes,
  areas,
  articulos,
  elegirDocente,
}: {
  accion: (e: Estado, f: FormData) => Promise<Estado>;
  inicial?: Practica;
  semestres: { id: string; nombre: string; activo: boolean }[];
  docentes: { id: string; nombres: string }[];
  areas: { id: string; nombre: string }[];
  articulos?: ArticuloCorto[];
  elegirDocente: boolean;
}) {
  const [estado, enviar, enviando] = useFormAccion(accion, {});
  const v = (x: unknown) => (x == null ? "" : String(x));
  const nueva = !inicial.id;
  return (
    <form onSubmit={enviar} className="form">
      {inicial.id && <input type="hidden" name="id" value={inicial.id} />}
      {estado.error && <div className="alert error" role="alert">{estado.error}</div>}
      {estado.ok && <div className="alert ok" role="status">{estado.ok}</div>}
      <div className="fields">
        {nueva && (
          <div className="field">
            <label htmlFor="p-sem">Semestre</label>
            <select id="p-sem" name="semestre_id" defaultValue={inicial.semestre_id ?? semestres.find((s) => s.activo)?.id} required>
              {semestres.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.activo ? " (actual)" : ""}</option>)}
            </select>
          </div>
        )}
        {nueva && elegirDocente && (
          <div className="field">
            <label htmlFor="p-doc">Docente</label>
            <select id="p-doc" name="docente_id" defaultValue={inicial.docente_id ?? ""} required>
              <option value="" disabled>Elige…</option>
              {docentes.map((d) => <option key={d.id} value={d.id}>{d.nombres}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="p-area">Área</label>
          <select id="p-area" name="area_id" defaultValue={v(inicial.area_id)}>
            <option value="">La del docente</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="p-curso">Curso</label>
          <input id="p-curso" name="curso" required defaultValue={v(inicial.curso)} placeholder="Química General I" />
        </div>
        <div className="field">
          <label htmlFor="p-num">Práctica N.º</label>
          <input id="p-num" name="numero" type="number" min={1} defaultValue={v(inicial.numero)} />
        </div>
        <div className="field wide">
          <label htmlFor="p-nombre">Nombre de la práctica</label>
          <input id="p-nombre" name="nombre" required defaultValue={v(inicial.nombre)} placeholder="Preparación de soluciones" />
        </div>
        <div className="field">
          <label htmlFor="p-sec">Secciones (horarios)</label>
          <input id="p-sec" name="secciones" type="number" min={1} required defaultValue={inicial.secciones ?? 1} />
        </div>
        <div className="field">
          <label htmlFor="p-grp">Grupos por sección</label>
          <input id="p-grp" name="grupos_por_seccion" type="number" min={1} required defaultValue={inicial.grupos_por_seccion ?? 1} />
        </div>
        <div className="field">
          <label htmlFor="p-fecha">Fecha prevista</label>
          <input id="p-fecha" name="fecha" type="date" defaultValue={v(inicial.fecha)} />
        </div>
        <div className="field wide">
          <label htmlFor="p-notas">Notas</label>
          <input id="p-notas" name="notas" defaultValue={v(inicial.notas)} placeholder="Opcional" />
        </div>
      </div>
      {articulos && (
        <>
          <h3>Qué necesita cada grupo</h3>
          <p className="ayuda">
            Escribe la cantidad para <b>un grupo</b>; el sistema la multiplica por todos los grupos de todas las secciones. Si algo se usa una sola vez
            por sección (por ejemplo, un frasco de indicador para todo el salón), elige “cada sección”.
          </p>
          <LineasArticulos articulos={articulos} conPor />
        </>
      )}
      <div className="row">
        <button className="btn primary" type="submit" disabled={enviando}>{enviando ? "Guardando…" : nueva ? "Crear práctica" : "Guardar cambios"}</button>
      </div>
    </form>
  );
}
