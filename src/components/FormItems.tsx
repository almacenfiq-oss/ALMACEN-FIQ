"use client";

import { useFormAccion } from "@/lib/useFormAccion";
import { useEffect, useState } from "react";
import LineasArticulos from "./LineasArticulos";
import { agregarItems, type Estado } from "@/app/(app)/practicas/actions";
import type { ArticuloCorto } from "@/lib/tipos";

export default function FormItems({ practicaId, articulos }: { practicaId: string; articulos: ArticuloCorto[] }) {
  const [estado, enviar, enviando] = useFormAccion<Estado>(agregarItems, {});
  const [clave, setClave] = useState(0);
  useEffect(() => {
    if (estado.ok) setClave((k) => k + 1); // vacía la lista tras guardar
  }, [estado]);
  return (
    <form onSubmit={enviar} className="form">
      <input type="hidden" name="practica_id" value={practicaId} />
      {estado.error && <div className="alert error" role="alert">{estado.error}</div>}
      {estado.ok && <div className="alert ok" role="status">{estado.ok}</div>}
      <LineasArticulos key={clave} articulos={articulos} conPor conPdf />
      <div className="row">
        <button className="btn primary" type="submit" disabled={enviando}>{enviando ? "Guardando…" : "Agregar a la práctica"}</button>
      </div>
    </form>
  );
}
