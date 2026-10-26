"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { borrarFotoEntrega, subirFotoEntrega } from "@/app/(app)/entregas/actions";
import { fechaHora } from "@/lib/formato";

export type Foto = { id: string; url: string | null; nota: string | null; creado: string };

// Reduce la foto en el navegador (máx. 1600 px, JPG) para que suba rápido y ocupe poco
async function reducir(archivo: File): Promise<Blob> {
  const img = await createImageBitmap(archivo);
  const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(img.width * escala);
  lienzo.height = Math.round(img.height * escala);
  lienzo.getContext("2d")!.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  return new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo leer la foto."))), "image/jpeg", 0.75));
}

export default function FotosEvidencia({ entregaId, fotos, puedeSubir }: { entregaId: string; fotos: Foto[]; puedeSubir: boolean }) {
  const [estado, enviar, enviando] = useActionState(subirFotoEntrega, {});
  const [, iniciar] = useTransition();
  const [vista, setVista] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const reducida = useRef<Blob | null>(null);
  const form = useRef<HTMLFormElement>(null);

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const a = e.target.files?.[0];
    reducida.current = null;
    setAviso(null);
    if (vista) URL.revokeObjectURL(vista);
    setVista(null);
    if (!a) return;
    setPreparando(true);
    try {
      reducida.current = await reducir(a);
      setVista(URL.createObjectURL(reducida.current));
    } catch {
      setAviso("No se pudo leer esa foto. Prueba con otra.");
    } finally {
      setPreparando(false);
    }
  }

  function subir(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reducida.current) {
      setAviso("Primero elige o toma una foto.");
      return;
    }
    // Se envía la foto reducida en lugar del archivo original
    const datos = new FormData(e.currentTarget);
    datos.delete("foto_original");
    datos.set("foto", new File([reducida.current], "evidencia.jpg", { type: "image/jpeg" }));
    iniciar(() => enviar(datos));
    form.current?.reset();
    if (vista) URL.revokeObjectURL(vista);
    setVista(null);
    reducida.current = null;
  }

  return (
    <section className="panel no-print">
      <h2>Fotos de evidencia</h2>
      {fotos.length === 0 ? (
        <p className="muted">Aún no hay fotos de esta entrega.</p>
      ) : (
        <div className="fotos">
          {fotos.map((f) => (
            <figure key={f.id} className="foto">
              {f.url ? (
                <a href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={f.nota ?? "Foto de evidencia"} loading="lazy" /></a>
              ) : (
                <div className="foto-falta">No se pudo cargar</div>
              )}
              <figcaption>
                {f.nota && <b>{f.nota}</b>}
                <span className="muted">{fechaHora(f.creado)}</span>
                {puedeSubir && (
                  <form action={borrarFotoEntrega} onSubmit={(e) => { if (!confirm("¿Borrar esta foto?")) e.preventDefault(); }}>
                    <input type="hidden" name="id" value={f.id} />
                    <button className="btn small danger" type="submit">Borrar</button>
                  </form>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {puedeSubir && (
        <form ref={form} onSubmit={subir} className="form" style={{ marginTop: 16 }}>
          {estado.error && <div className="alert error" role="alert">{estado.error}</div>}
          {estado.ok && <div className="alert ok" role="status">{estado.ok}</div>}
          {aviso && <div className="alert error" role="alert">{aviso}</div>}
          <input type="hidden" name="entrega_id" value={entregaId} />
          <div className="fields">
            <div className="field">
              <label htmlFor="ev-foto">Foto (cámara o galería)</label>
              <input id="ev-foto" name="foto_original" type="file" accept="image/*" onChange={elegir} />
            </div>
            <div className="field">
              <label htmlFor="ev-nota">Descripción (opcional)</label>
              <input id="ev-nota" name="nota" placeholder="Acta firmada, material entregado…" />
            </div>
          </div>
          {vista && <img src={vista} alt="Vista previa" className="foto-previa" />}
          <div className="row">
            <button className="btn primary" type="submit" disabled={enviando || preparando}>
              {preparando ? "Preparando foto…" : enviando ? "Subiendo…" : "Subir foto"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
