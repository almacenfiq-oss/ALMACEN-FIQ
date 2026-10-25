import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requierePerfil } from "@/lib/sesion";
import FormArticulo from "@/components/FormArticulo";
import { guardarArticulo } from "../actions";
import { TIPOS, type Familia, type Grupo, type TipoArticulo } from "@/lib/tipos";

export const metadata: Metadata = { title: "Nuevo artículo" };

export default async function NuevoArticulo({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  await requierePerfil(["admin", "almacen"]);
  const { tipo } = await searchParams;
  const supabase = await createClient();
  const [{ data: familias }, { data: grupos }, { data: ubicaciones }] = await Promise.all([
    supabase.from("familias").select("*"),
    supabase.from("grupos_almacenamiento").select("*").order("codigo"),
    supabase.from("ubicaciones").select("id, nombre").eq("activa", true).order("nombre"),
  ]);
  return (
    <>
      <div className="head">
        <div>
          <p className="sub"><Link href="/inventario">Inventario</Link></p>
          <h1>Nuevo artículo</h1>
        </div>
      </div>
      <section className="panel">
        <FormArticulo
          accion={guardarArticulo}
          familias={(familias ?? []) as Familia[]}
          grupos={(grupos ?? []) as Grupo[]}
          ubicaciones={ubicaciones ?? []}
          tipoInicial={tipo && tipo in TIPOS ? (tipo as TipoArticulo) : "reactivo"}
        />
      </section>
    </>
  );
}
