"use client";

import { useTransition } from "react";
import { asignarDespachador } from "@/app/(app)/entregas/actions";

// Lista para elegir qué encargado del almacén despachó; se guarda al cambiarla
export default function SelectorDespachador({
  tipo,
  id,
  actual,
  encargados,
}: {
  tipo: "entrega" | "prestamo";
  id: string;
  actual: string | null;
  encargados: { id: string; nombre: string }[];
}) {
  const [guardando, iniciar] = useTransition();
  return (
    <label className="row no-print" style={{ gap: 8, color: "var(--fg)", fontSize: 14 }}>
      Despachó:
      <select
        defaultValue={actual ?? ""}
        style={{ width: "auto" }}
        disabled={guardando}
        onChange={(e) => {
          const f = new FormData();
          f.set("tipo", tipo);
          f.set("id", id);
          f.set("encargado_id", e.target.value);
          iniciar(() => asignarDespachador(f));
        }}
      >
        <option value="">Elige al encargado…</option>
        {encargados.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
      </select>
      {guardando && <span className="muted">Guardando…</span>}
    </label>
  );
}
