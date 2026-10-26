"use client";

import { useFormAccion } from "@/lib/useFormAccion";
import { useRef, useState } from "react";
import EscanerCamara from "./EscanerCamara";
import { CamposCantidad, CamposEnvase } from "./CamposEnvase";
import { aBase, ENVASE_COMO_UNIDAD, leerPresentacion, unidadesCompatibles } from "@/lib/unidades";
import { numero } from "@/lib/formato";
import type { Estado } from "@/app/(app)/inventario/actions";
import { PICTOGRAMAS, TIPOS, UNIDADES, type ArticuloVista, type Familia, type Grupo, type TipoArticulo } from "@/lib/tipos";

export default function FormArticulo({
  accion,
  inicial,
  familias,
  grupos,
  ubicaciones,
  tipoInicial = "reactivo",
}: {
  accion: (e: Estado, f: FormData) => Promise<Estado>;
  inicial?: Partial<ArticuloVista>;
  familias: Familia[];
  grupos: Grupo[];
  ubicaciones: { id: string; nombre: string }[];
  tipoInicial?: TipoArticulo;
}) {
  const [estado, enviar, enviando] = useFormAccion(accion, {});
  const [tipo, setTipo] = useState<TipoArticulo>(inicial?.tipo ?? tipoInicial);
  const refBarras = useRef<HTMLInputElement>(null);
  const nuevo = !inicial?.id;
  const v = (x: unknown) => (x == null ? "" : String(x));
  const raices = familias.filter((f) => !f.padre_id).sort((a, b) => a.orden - b.orden);
  const hijas = (id: string) => familias.filter((f) => f.padre_id === id).sort((a, b) => a.orden - b.orden);
  const reactivo = tipo === "reactivo";
  // Si el artículo antiguo solo tenía la presentación escrita ("Frasco 1 kg"), se sugiere desde ahí
  const sugerido = inicial?.contenido ? null : leerPresentacion(inicial?.presentacion, inicial?.unidad ?? "g");
  const [unidad, setUnidad] = useState(inicial?.unidad ?? (reactivo ? "g" : "unidad"));
  const [envase, setEnvase] = useState(inicial?.envase ?? sugerido?.envase ?? "");
  const contIni = inicial?.contenido ?? sugerido?.contenido ?? null;
  const grande = contIni != null && contIni >= 1000 && (unidad === "g" || unidad === "mL");
  const [contenido, setContenido] = useState(contIni == null ? "" : String(grande ? contIni / 1000 : contIni));
  const [uContenido, setUContenido] = useState(grande ? (unidad === "g" ? "kg" : "L") : unidad);
  const nCont = numero(contenido);
  const contenidoBase = envase && nCont && !Number.isNaN(nCont) && nCont > 0 ? aBase(nCont, unidadesCompatibles(unidad).includes(uContenido) ? uContenido : unidad, unidad) : null;
  const cambiarTipo = (t: TipoArticulo) => {
    setTipo(t);
    if (!inicial?.id) setUnidad(t === "reactivo" ? "g" : "unidad");
  };

  return (
    <form onSubmit={enviar} className="form">
      {inicial?.id && <input type="hidden" name="id" value={inicial.id} />}
      {estado.error && <div className="alert error" role="alert">{estado.error}</div>}
      {estado.ok && <div className="alert ok" role="status">{estado.ok}</div>}

      <div className="fields">
        <div className="field">
          <label htmlFor="a-tipo">Tipo</label>
          <select id="a-tipo" name="tipo" value={tipo} onChange={(e) => cambiarTipo(e.target.value as TipoArticulo)}>
            {Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>
        <div className="field wide">
          <label htmlFor="a-nombre">Nombre</label>
          <input
            id="a-nombre"
            name="nombre"
            required
            defaultValue={v(inicial?.nombre)}
            placeholder={reactivo ? "Cloruro de sodio" : tipo === "vidrio" ? "Vaso de precipitado 250 mL" : "Balanza analítica"}
          />
        </div>

        {reactivo && (
          <>
            <div className="field">
              <label htmlFor="a-fam">Clasificación</label>
              <select id="a-fam" name="familia_id" defaultValue={v(inicial?.familia_id)}>
                <option value="">Sin clasificar</option>
                {raices.map((r) => (
                  <optgroup key={r.id} label={r.nombre}>
                    <option value={r.id}>{r.nombre} (general)</option>
                    {hijas(r.id).map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="a-formula">Fórmula</label>
              <input id="a-formula" name="formula" defaultValue={v(inicial?.formula)} placeholder="NaCl" className="mono" />
            </div>
            <div className="field">
              <label htmlFor="a-cas">N.º CAS</label>
              <input id="a-cas" name="cas" defaultValue={v(inicial?.cas)} placeholder="7647-14-5" className="mono" />
            </div>
            <div className="field">
              <label htmlFor="a-grado">Grado / pureza</label>
              <input id="a-grado" name="grado" defaultValue={v(inicial?.grado)} placeholder="p.a., ACS, técnico" />
            </div>
            <div className="field">
              <label htmlFor="a-conc">Concentración</label>
              <input id="a-conc" name="concentracion" defaultValue={v(inicial?.concentracion)} placeholder="37 %, 0.1 N" />
            </div>
            <div className="field">
              <label htmlFor="a-grupo">Grupo de almacenamiento</label>
              <select id="a-grupo" name="grupo" defaultValue={v(inicial?.grupo)}>
                <option value="">Según su clasificación</option>
                {grupos.map((g) => <option key={g.codigo} value={g.codigo}>{g.codigo} · {g.nombre}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="a-palabra">Palabra de advertencia (SGA)</label>
              <select id="a-palabra" name="palabra_advertencia" defaultValue={v(inicial?.palabra_advertencia)}>
                <option value="">Ninguna</option>
                <option>Peligro</option>
                <option>Atención</option>
              </select>
            </div>
            <fieldset className="field wide" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="leyenda">Pictogramas de peligro (SGA)</legend>
              <div className="checks">
                {Object.entries(PICTOGRAMAS).map(([c, t]) => (
                  <label key={c} className="check">
                    <input type="checkbox" name="pictogramas" value={c} defaultChecked={inicial?.pictogramas?.includes(c)} />
                    <span className="mono">{c}</span> {t}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="check field wide">
              <input type="checkbox" name="fiscalizado" defaultChecked={inicial?.fiscalizado} />
              Insumo químico fiscalizado por SUNAT (IQBF)
            </label>
          </>
        )}

        {!reactivo && (
          <>
            <div className="field">
              <label htmlFor="a-cap">{tipo === "equipo" ? "Rango / capacidad" : "Capacidad / medida"}</label>
              <input id="a-cap" name="capacidad" defaultValue={v(inicial?.capacidad)} placeholder={tipo === "equipo" ? "0-220 g, ±0.1 mg" : "250 mL"} />
            </div>
            <div className="field">
              <label htmlFor="a-mat">Material</label>
              <input id="a-mat" name="material" defaultValue={v(inicial?.material)} placeholder="Borosilicato" />
            </div>
            {tipo === "equipo" && (
              <>
                <div className="field">
                  <label htmlFor="a-modelo">Modelo</label>
                  <input id="a-modelo" name="modelo" defaultValue={v(inicial?.modelo)} />
                </div>
                <div className="field">
                  <label htmlFor="a-serie">N.º de serie / patrimonio</label>
                  <input id="a-serie" name="serie" defaultValue={v(inicial?.serie)} className="mono" />
                </div>
              </>
            )}
            <label className="check field wide">
              <input type="checkbox" name="prestable" defaultChecked={inicial?.prestable ?? tipo !== "equipo"} />
              Se presta a alumnos
            </label>
          </>
        )}

        <div className="field">
          <label htmlFor="a-marca">Marca</label>
          <input id="a-marca" name="marca" defaultValue={v(inicial?.marca)} placeholder={reactivo ? "Merck" : "Pyrex"} />
        </div>
        <div className="field">
          <label htmlFor="a-unidad">Se cuenta en</label>
          <select id="a-unidad" name="unidad" value={unidad} onChange={(e) => setUnidad(e.target.value)}>
            {UNIDADES.filter((u) => !ENVASE_COMO_UNIDAD.includes(u) || u === inicial?.unidad).map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
        <CamposEnvase unidad={unidad} envase={envase} setEnvase={setEnvase} contenido={contenido} setContenido={setContenido} uContenido={uContenido} setUContenido={setUContenido} />
        <div className="field">
          <label htmlFor="a-min">Stock mínimo (alerta)</label>
          <input id="a-min" name="stock_minimo" inputMode="decimal" defaultValue={v(inicial?.stock_minimo ?? "")} placeholder="0" />
        </div>
        <div className="field">
          <label htmlFor="a-ubi">Ubicación</label>
          <select id="a-ubi" name="ubicacion_id" defaultValue={v(inicial?.ubicacion_id)}>
            <option value="">Sin ubicación</option>
            {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="a-cod">Código interno</label>
          <input id="a-cod" name="codigo" defaultValue={v(inicial?.codigo)} placeholder="Automático (R-0001)" className="mono" />
        </div>
        <div className="field">
          <label htmlFor="a-cb">Código de barras</label>
          <input ref={refBarras} id="a-cb" name="codigo_barras" defaultValue={v(inicial?.codigo_barras)} placeholder="Escanéalo aquí" className="mono" />
          <EscanerCamara onCodigo={(c) => { if (refBarras.current) refBarras.current.value = c; }} />
        </div>
        <div className="field wide">
          <label htmlFor="a-notas">Notas</label>
          <textarea id="a-notas" name="notas" defaultValue={v(inicial?.notas)} />
        </div>

        {nuevo ? (
          <>
            <CamposCantidad unidad={unidad} envase={envase || null} contenidoBase={contenidoBase} prefijo="a-ini-" etiqueta="Cantidad que hay hoy" />
            {reactivo && (
              <>
                <div className="field">
                  <label htmlFor="a-lote">Lote</label>
                  <input id="a-lote" name="lote" className="mono" placeholder="Opcional" />
                </div>
                <div className="field">
                  <label htmlFor="a-venc">Vencimiento</label>
                  <input id="a-venc" name="vencimiento" type="date" />
                </div>
              </>
            )}
          </>
        ) : (
          <label className="check field wide">
            <input type="checkbox" name="activo" defaultChecked={inicial?.activo} />
            Activo (desmárcalo para ocultarlo sin perder su historial)
          </label>
        )}
      </div>
      <p className="ayuda">
        {reactivo
          ? "Los reactivos se cuentan en gramos o mililitros, aunque vengan en frascos: así entregas cantidades exactas y ves cuánto queda en cada frasco."
          : "El stock se cuenta en piezas. Si vienen en caja, di cuántas trae cada caja y al ingresar escribe cuántas cajas llegan: la app suma las piezas."}
      </p>
      <div className="row">
        <button className="btn primary" type="submit" disabled={enviando}>
          {enviando ? "Guardando…" : nuevo ? "Crear artículo" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
