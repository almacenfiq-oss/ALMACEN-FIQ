"use client";

import { useState } from "react";
import { detectar, unirLineas, type Sugerencia } from "@/lib/detectarArticulos";
import type { ArticuloCorto } from "@/lib/tipos";
import type { Linea } from "./LineasArticulos";

type Fila = Sugerencia & { usar: boolean };

// Lee el texto del PDF en el navegador con pdf.js (gratis, el archivo no sale de la computadora)
async function textoDelPdf(archivo: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) }).promise;
  const paginas: { str: string; x: number; y: number }[][] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 40); i++) {
    const contenido = await (await doc.getPage(i)).getTextContent();
    paginas.push(
      contenido.items
        .filter((it): it is typeof it & { str: string; transform: number[] } => "str" in it)
        .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] })),
    );
  }
  return unirLineas(paginas);
}

export default function LectorPdf({ articulos, onAgregar }: { articulos: ArticuloCorto[]; onAgregar: (l: Linea[]) => void }) {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const porId = new Map(articulos.map((a) => [a.id, a]));
  const ordenados = [...articulos].sort((a, b) => a.nombre.localeCompare(b.nombre));

  async function leer(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setAviso(null);
    setFilas(null);
    setLeyendo(true);
    try {
      const lineas = await textoDelPdf(archivo);
      if (lineas.join("").replace(/\s/g, "").length < 20) {
        setAviso("Este PDF no tiene texto que se pueda leer (parece una hoja escaneada o una foto). Agrega los artículos a mano, o pide la guía en el PDF original de Word.");
        return;
      }
      const encontradas = detectar(lineas, articulos);
      if (!encontradas.length) {
        setAviso("No se reconoció ningún artículo del inventario en este PDF. Agrégalos a mano con el buscador.");
        return;
      }
      setFilas(encontradas.map((s) => ({ ...s, usar: !!s.articulo_id && s.confianza !== "baja" })));
    } catch {
      setAviso("No se pudo abrir el PDF. Revisa que no tenga contraseña.");
    } finally {
      setLeyendo(false);
    }
  }

  const cambiar = (i: number, cambio: Partial<Fila>) => setFilas((fs) => fs && fs.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  const elegidas = (filas ?? []).filter((f) => f.usar && f.articulo_id);

  function agregar() {
    onAgregar(elegidas.map((f) => ({ articulo_id: f.articulo_id!, cantidad: f.cantidad, por: f.por })));
    setFilas(null);
    setAviso(`Se agregaron ${elegidas.length} artículo(s) a la lista. Revisa las cantidades antes de guardar.`);
  }

  return (
    <div className="lector-pdf">
      <label className="btn small" style={{ cursor: "pointer" }}>
        {leyendo ? "Leyendo PDF…" : "Leer desde la guía en PDF"}
        <input type="file" accept="application/pdf,.pdf" onChange={leer} disabled={leyendo} hidden />
      </label>
      {aviso && <div className="aviso">{aviso}</div>}
      {filas && (
        <div className="panel" style={{ marginTop: 10 }}>
          <p className="ayuda">
            Esto es lo que se reconoció en el PDF. Revisa cada renglón: corrige el artículo o la cantidad, y desmarca lo que no va. Lo marcado en amarillo es dudoso.
          </p>
          <div className="table-wrap">
            <table className="lineas">
              <thead><tr><th></th><th>En el PDF dice</th><th>Artículo del inventario</th><th>Cantidad</th><th>Por</th></tr></thead>
              <tbody>
                {filas.map((f, i) => {
                  const a = f.articulo_id ? porId.get(f.articulo_id) : null;
                  return (
                    <tr key={i} className={f.confianza === "alta" ? "" : "dudosa"}>
                      <td><input type="checkbox" checked={f.usar} onChange={(e) => cambiar(i, { usar: e.target.checked })} aria-label="Usar" /></td>
                      <td style={{ maxWidth: 260, fontSize: 13 }}>{f.linea}</td>
                      <td>
                        <select value={f.articulo_id ?? ""} onChange={(e) => cambiar(i, { articulo_id: e.target.value || null, usar: !!e.target.value })} aria-label="Artículo">
                          <option value="">— No está en el inventario —</option>
                          {ordenados.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.formula ? ` (${x.formula})` : ""}</option>)}
                        </select>
                      </td>
                      <td>
                        <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                          <input className="mini" inputMode="decimal" value={f.cantidad} onChange={(e) => cambiar(i, { cantidad: e.target.value })} aria-label="Cantidad" />
                          <span className="muted">{a?.unidad ?? ""}</span>
                        </span>
                      </td>
                      <td>
                        <select value={f.por} onChange={(e) => cambiar(i, { por: e.target.value as Fila["por"] })} aria-label="Por" style={{ width: "auto" }}>
                          <option value="grupo">grupo</option>
                          <option value="seccion">sección</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn primary" onClick={agregar} disabled={!elegidas.length}>Pasar {elegidas.length} a la lista</button>
            <button type="button" className="btn" onClick={() => setFilas(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
