"use client";

import { useMemo, useState } from "react";
import EscanerCamara from "./EscanerCamara";
import { cant, plano } from "@/lib/formato";
import { TIPOS, type ArticuloCorto } from "@/lib/tipos";

export type Linea = { articulo_id: string; cantidad: string; por?: "grupo" | "seccion" };

// Buscador de artículos (por nombre, código, fórmula o lector de barras) que arma
// una lista de renglones con cantidad. Los renglones viajan en el campo oculto `name` como JSON.
export default function LineasArticulos({
  articulos,
  name = "items",
  conPor = false,
  inicial = [],
  textoVacio = "Busca un artículo o escanea su código para agregarlo.",
}: {
  articulos: ArticuloCorto[];
  name?: string;
  conPor?: boolean;
  inicial?: Linea[];
  textoVacio?: string;
}) {
  const [lineas, setLineas] = useState<Linea[]>(inicial);
  const [q, setQ] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const porId = useMemo(() => new Map(articulos.map((a) => [a.id, a])), [articulos]);

  const resultados = useMemo(() => {
    const t = plano(q.trim());
    if (t.length < 2) return [];
    return articulos
      .filter((a) => plano(`${a.nombre} ${a.codigo} ${a.formula ?? ""} ${a.codigo_barras ?? ""}`).includes(t))
      .slice(0, 12);
  }, [q, articulos]);

  function agregar(a: ArticuloCorto) {
    setAviso(null);
    setLineas((ls) => (ls.some((l) => l.articulo_id === a.id) ? ls : [...ls, { articulo_id: a.id, cantidad: "", por: conPor ? "grupo" : undefined }]));
    setQ("");
  }

  function porCodigo(codigo: string) {
    const c = codigo.trim();
    const a = articulos.find((x) => x.codigo === c.toUpperCase() || x.codigo_barras === c);
    if (a) agregar(a);
    else setAviso(`No hay ningún artículo con el código ${c}.`);
  }

  const cambiar = (id: string, campo: "cantidad" | "por", valor: string) =>
    setLineas((ls) => ls.map((l) => (l.articulo_id === id ? { ...l, [campo]: valor } : l)));

  return (
    <div className="picker">
      <input type="hidden" name={name} value={JSON.stringify(lineas)} />
      <div className="scan">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (resultados.length === 1) agregar(resultados[0]);
            else if (q.trim()) porCodigo(q);
          }}
          placeholder="Buscar: nombre, fórmula o código (Enter agrega)"
          aria-label="Buscar artículo"
        />
      </div>
      <EscanerCamara onCodigo={porCodigo} />
      {aviso && <div className="aviso">{aviso}</div>}
      {resultados.length > 0 && (
        <div className="lista">
          {resultados.map((a) => (
            <button type="button" key={a.id} className="result" onClick={() => agregar(a)}>
              <b>{a.nombre}</b>
              {a.formula && <span className="formula">{a.formula}</span>}
              <span className="muted mono">{a.codigo}</span>
              <span className="muted">{TIPOS[a.tipo]}</span>
              <span className="muted">Disponible: {cant(a.disponible)} {a.unidad}</span>
            </button>
          ))}
        </div>
      )}
      {lineas.length === 0 ? (
        <div className="empty">{textoVacio}</div>
      ) : (
        <div className="table-wrap">
          <table className="lineas">
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Cantidad</th>
                {conPor && <th>Se cuenta por</th>}
                <th className="r">Disponible</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => {
                const a = porId.get(l.articulo_id);
                if (!a) return null;
                return (
                  <tr key={l.articulo_id}>
                    <td>
                      {a.nombre} <span className="muted mono">{a.codigo}</span>
                    </td>
                    <td>
                      <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <input inputMode="decimal" value={l.cantidad} onChange={(e) => cambiar(a.id, "cantidad", e.target.value)} aria-label={`Cantidad de ${a.nombre}`} required />
                        <span className="muted">{a.unidad}</span>
                      </span>
                    </td>
                    {conPor && (
                      <td>
                        <select value={l.por ?? "grupo"} onChange={(e) => cambiar(a.id, "por", e.target.value)} aria-label="Se cuenta por">
                          <option value="grupo">cada grupo</option>
                          <option value="seccion">cada sección</option>
                        </select>
                      </td>
                    )}
                    <td className="r num">{cant(a.disponible)}</td>
                    <td>
                      <button type="button" className="btn small danger" onClick={() => setLineas((ls) => ls.filter((x) => x.articulo_id !== a.id))}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
