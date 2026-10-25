import Link from "next/link";
import type { Metadata } from "next";
import { esPersonal, requierePerfil } from "@/lib/sesion";
import { areasActivas, articulosCortos, docentesActivos, semestres } from "@/lib/consultas";
import FormPractica from "@/components/FormPractica";
import { crearPractica } from "../actions";

export const metadata: Metadata = { title: "Nueva práctica" };

export default async function NuevaPractica() {
  const perfil = await requierePerfil();
  const personal = esPersonal(perfil);
  const [sems, docentes, areas, articulos] = await Promise.all([semestres(), personal ? docentesActivos() : Promise.resolve([]), areasActivas(), articulosCortos()]);
  return (
    <>
      <div className="head">
        <div>
          <p className="sub"><Link href="/practicas">Prácticas</Link></p>
          <h1>Nueva práctica</h1>
        </div>
      </div>
      {sems.length === 0 ? (
        <div className="aviso">Primero crea un semestre en Configuración.</div>
      ) : personal && docentes.length === 0 ? (
        <div className="aviso">Primero registra a los docentes en <Link href="/configuracion">Configuración</Link>.</div>
      ) : (
        <section className="panel">
          <FormPractica accion={crearPractica} semestres={sems} docentes={docentes} areas={areas} articulos={articulos} elegirDocente={personal} />
        </section>
      )}
    </>
  );
}
