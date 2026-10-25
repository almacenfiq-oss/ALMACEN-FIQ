import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requierePerfil } from "@/lib/sesion";
import FormImportar from "@/components/FormImportar";

export const metadata: Metadata = { title: "Importar inventario" };

const PLANTILLA = [
  ["Tipo", "Nombre", "Familia", "Fórmula", "CAS", "Grado", "Concentración", "Marca", "Presentación", "Capacidad", "Unidad", "Cantidad", "Mínimo", "Ubicación", "Lote", "Vencimiento", "Fiscalizado", "Prestable"],
  ["Reactivo", "Cloruro de sodio", "Cloruros", "NaCl", "7647-14-5", "p.a.", "", "Merck", "Frasco 1 kg", "", "g", "2500", "500", "Estante de sales", "K123", "31/12/2027", "No", ""],
  ["Reactivo", "Ácido clorhídrico", "Ácidos no oxidantes", "HCl", "7647-01-0", "p.a.", "37 %", "Merck", "Frasco 2.5 L", "", "mL", "5000", "1000", "Armario de ácidos", "", "", "Sí", ""],
  ["Vidrio", "Vaso de precipitado", "", "", "", "", "", "Pyrex", "", "250 mL", "unidad", "40", "10", "Estante de vidrio", "", "", "", "Sí"],
  ["Equipo", "Balanza analítica", "", "", "", "", "", "Ohaus", "", "220 g", "unidad", "2", "0", "Vitrina de equipos", "", "", "", "No"],
];

export default async function Importar() {
  await requierePerfil(["admin", "almacen"]);
  const supabase = await createClient();
  const { data: familias } = await supabase.from("familias").select("nombre, padre_id, orden").order("orden");
  const csv = "﻿" + PLANTILLA.map((f) => f.join(";")).join("\r\n");
  const raices = (familias ?? []).filter((f) => !f.padre_id).map((f) => f.nombre);
  const subs = (familias ?? []).filter((f) => f.padre_id).map((f) => f.nombre);
  return (
    <>
      <div className="head">
        <div>
          <p className="sub"><Link href="/inventario">Inventario</Link></p>
          <h1>Importar desde Excel</h1>
        </div>
      </div>
      <section className="panel">
        <h2>Cómo hacerlo</h2>
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
          <li>
            Descarga la <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`} download="plantilla-inventario.csv">plantilla de ejemplo</a> y
            ábrela en Excel. Puedes usar tu propio archivo: solo necesita una columna <b>Nombre</b>; las demás son opcionales y pueden ir en cualquier orden.
          </li>
          <li>Selecciona las filas, incluida la de títulos, cópialas (Ctrl+C) y pégalas abajo (Ctrl+V).</li>
          <li>Pulsa <b>Importar</b>. Las ubicaciones que no existan se crean solas. Importa cada lista una sola vez para no duplicar artículos.</li>
        </ol>
        <details>
          <summary>Nombres de familia que reconoce la columna “Familia”</summary>
          <p className="ayuda" style={{ marginTop: 8 }}><b>Familias:</b> {raices.join(", ")}.</p>
          <p className="ayuda"><b>Subfamilias:</b> {subs.join(", ")}.</p>
        </details>
      </section>
      <section className="panel">
        <FormImportar />
      </section>
    </>
  );
}
