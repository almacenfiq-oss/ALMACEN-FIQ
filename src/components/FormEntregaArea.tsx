"use client";

import { useState } from "react";
import { useFormAccion } from "@/lib/useFormAccion";
import { registrarEntregaArea, type Estado } from "@/app/(app)/entregas/actions";
import { cant } from "@/lib/formato";
import { TIPOS, type TipoArticulo } from "@/lib/tipos";

export type FilaReparto = {
  articulo_id: string; codigo: string; nombre: string; formula: string | null; tipo: TipoArticulo; unidad: string; practicas: number;
  requerido_con_margen: number; entregado: number; pendiente: number; utilizable: number; stock_minimo: number;
  total_pendiente: number; sobre_minimo: number; propuesta: number;
};

export default function FormEntregaArea({
  semestreId,
  areaId,
  filas,
  docentes,
}: {
  semestreId: string;
  areaId: string;
  filas: FilaReparto[];
  docentes: { id: string; nombres: string; area_id: string | null }[];
}) {
  const [estado, enviar, enviando] = useFormAccion<Estado>(registrarEntregaArea, {});
  const pendientes = filas.filter((x) => Number(x.pendiente) > 0);
  const [cants, setCants] = useState<Record<string, string>>(() => Object.fromEntries(pendientes.map((x) => [x.articulo_id, String(Number(x.propuesta))])));
  const recortadas = pendientes.filter((x) => Number(x.propuesta) < Number(x.pendiente));
  const completas = filas.length - pendientes.length;

  if (!pendientes.length) {
    return <div className="empty">{filas.length ? "Esta área ya recibió todo lo de sus prácticas en el semestre." : "Las prácticas de esta área aún no tienen artículos."}</div>;
  }
  return (
    <form onSubmit={enviar} className="form">
      <input type="hidden" name="semestre_id" value={semestreId} />
      <input type="hidden" name="area_id" value={areaId} />
      {estado.error && <div className="alert error" role="alert">{estado.error}</div>}
      {recortadas.length > 0 && (
        <div className="aviso">
          {recortadas.length} artículo(s) no alcanzan para todas las áreas sin bajar del stock mínimo. Se propone la parte que le toca a esta área (la misma proporción para todas); lo demás queda pendiente.
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Artículo</th><th className="r">Pide el área</th><th className="r">Ya recibió</th><th className="r">Falta</th>
              <th className="r">Sobre el mínimo</th><th>Entregar ahora</th>
            </tr>
          </thead>
          <tbody>
            {pendientes.map((x) => {
              const v = cants[x.articulo_id] ?? "";
              const n = Number(v.replace(",", "."));
              const excede = n > Number(x.sobre_minimo);
              return (
                <tr key={x.articulo_id}>
                  <td>
                    {x.nombre} {x.formula && <span className="formula">{x.formula}</span>}
                    <div className="muted" style={{ fontSize: 12 }}>{TIPOS[x.tipo]} · {x.practicas} práctica(s)</div>
                  </td>
                  <td className="r num">{cant(x.requerido_con_margen)} {x.unidad}</td>
                  <td className="r num">{Number(x.entregado) > 0 ? cant(x.entregado) : "—"}</td>
                  <td className="r num"><b>{cant(x.pendiente)}</b></td>
                  <td className={`r num ${Number(x.sobre_minimo) < Number(x.total_pendiente) ? "falta" : ""}`}>
                    {cant(x.sobre_minimo)}
                    {Number(x.total_pendiente) > Number(x.pendiente) && <div className="muted" style={{ fontSize: 12 }}>todas las áreas piden {cant(x.total_pendiente)}</div>}
                  </td>
                  <td>
                    <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      <input
                        className="mini"
                        name={`cant_${x.articulo_id}`}
                        inputMode="decimal"
                        value={v}
                        onChange={(e) => setCants((c) => ({ ...c, [x.articulo_id]: e.target.value }))}
                        aria-label={`Entregar ${x.nombre}`}
                        style={excede ? { borderColor: "var(--bad)" } : undefined}
                      />
                      <span className="muted">{x.unidad}</span>
                    </span>
                    {Number(x.propuesta) < Number(x.pendiente) && <div className="muted" style={{ fontSize: 12 }}>propuesto {cant(x.propuesta)} · quedan {cant(Number(x.pendiente) - Number(x.propuesta))}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {completas > 0 && <p className="ayuda">{completas} artículo(s) ya se entregaron completos y no aparecen.</p>}
      <div className="fields">
        <div className="field">
          <label htmlFor="ea-doc">Docente que recibe por el área</label>
          <select id="ea-doc" name="docente_id" required defaultValue="">
            <option value="" disabled>Elige…</option>
            {docentes.map((d) => <option key={d.id} value={d.id}>{d.nombres}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ea-recibe">Quién recoge</label>
          <input id="ea-recibe" name="recibe" placeholder="Docente o jefe de práctica" />
        </div>
        <div className="field wide">
          <label htmlFor="ea-nota">Nota</label>
          <input id="ea-nota" name="nota" placeholder="Opcional" />
        </div>
      </div>
      <p className="ayuda">Pon 0 en lo que no se lleva hoy: queda pendiente para otra entrega. Lo entregado se reparte entre las prácticas del área, en el orden de sus fechas.</p>
      {estado.bajoMinimo && (
        <label className="check aviso">
          <input type="checkbox" name="bajo_minimo" /> Entregar de todos modos (el almacén quedará por debajo del mínimo)
        </label>
      )}
      <div className="row">
        <button className="btn primary" type="submit" disabled={enviando}>{enviando ? "Registrando…" : "Registrar entrega del área"}</button>
      </div>
    </form>
  );
}
