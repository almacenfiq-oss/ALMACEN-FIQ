import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { esPersonal, requierePerfil } from "@/lib/sesion";
import type { Familia, Grupo } from "@/lib/tipos";
import { Grupo as EtiquetaGrupo } from "@/components/Etiquetas";
import FormSimple from "@/components/FormSimple";
import { crearFamilia } from "./actions";

export const metadata: Metadata = { title: "Clasificación de reactivos" };

export default async function Clasificacion() {
  const perfil = await requierePerfil();
  const supabase = await createClient();
  const [{ data: fams }, { data: grs }, { data: conteo }, { data: incompat }] = await Promise.all([
    supabase.from("familias").select("*").order("orden").order("nombre"),
    supabase.from("grupos_almacenamiento").select("*").order("codigo"),
    supabase.from("articulos").select("familia_id").eq("tipo", "reactivo").eq("activo", true),
    supabase.from("v_incompatibilidades").select("*"),
  ]);
  const familias = (fams ?? []) as Familia[];
  const grupos = (grs ?? []) as Grupo[];
  const porGrupo = new Map(grupos.map((g) => [g.codigo, g]));
  const n = new Map<string, number>();
  let sinClasificar = 0;
  for (const c of conteo ?? []) {
    if (c.familia_id) n.set(c.familia_id, (n.get(c.familia_id) ?? 0) + 1);
    else sinClasificar++;
  }
  const raices = familias.filter((f) => !f.padre_id);
  const hijas = (id: string) => familias.filter((f) => f.padre_id === id);
  const total = (id: string) => (n.get(id) ?? 0) + hijas(id).reduce((s, h) => s + (n.get(h.id) ?? 0), 0);

  return (
    <>
      <div className="head">
        <div>
          <h1>Clasificación de reactivos</h1>
          <p className="sub">Familias químicas, grupos de almacenamiento y avisos de compatibilidad.</p>
        </div>
      </div>

      {(incompat ?? []).length > 0 && (
        <section className="panel">
          <h2>Atención: reactivos incompatibles guardados juntos</h2>
          <ul className="list">
            {(incompat ?? []).map((x) => (
              <li key={`${x.ubicacion_id}-${x.grupo1}-${x.grupo2}`}>
                <span>
                  <b>{x.ubicacion}</b>: <EtiquetaGrupo codigo={x.grupo1} nombre={x.nombre1} color={porGrupo.get(x.grupo1)?.color} /> con{" "}
                  <EtiquetaGrupo codigo={x.grupo2} nombre={x.nombre2} color={porGrupo.get(x.grupo2)?.color} />
                </span>
                <span className="meta"><Link href={`/inventario?ubicacion=${x.ubicacion_id}&tipo=reactivo`}>Ver qué hay en esa ubicación</Link></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="arbol">
        {raices.map((r) => (
          <section key={r.id}>
            <h3>
              <Link href={`/inventario?tipo=reactivo&familia=${r.id}`} style={{ textDecoration: "none" }}>{r.nombre}</Link>
              <span className="muted num">{total(r.id)}</span>
            </h3>
            {r.descripcion && <p className="ayuda">{r.descripcion}</p>}
            {r.grupo && <EtiquetaGrupo codigo={r.grupo} nombre={porGrupo.get(r.grupo)?.nombre} color={porGrupo.get(r.grupo)?.color} />}
            {hijas(r.id).length > 0 && (
              <ul>
                {hijas(r.id).map((h) => (
                  <li key={h.id}>
                    <Link href={`/inventario?tipo=reactivo&familia=${r.id}&sub=${h.id}`}>{h.nombre}</Link>
                    <span className="muted num">{n.get(h.id) ?? 0}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
        {sinClasificar > 0 && (
          <section>
            <h3>
              <Link href="/inventario?familia=sin" style={{ textDecoration: "none" }}>Sin clasificar</Link>
              <span className="muted num">{sinClasificar}</span>
            </h3>
            <p className="ayuda">Reactivos que todavía no tienen familia.</p>
          </section>
        )}
      </div>

      <div className="grid2">
        <section className="panel">
          <h2>Grupos de almacenamiento</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Grupo</th><th>Cómo guardarlo</th><th>No guardar junto a</th></tr></thead>
              <tbody>
                {grupos.map((g) => (
                  <tr key={g.codigo}>
                    <td><EtiquetaGrupo codigo={g.codigo} nombre={g.nombre} color={g.color} /></td>
                    <td>{g.indicaciones}</td>
                    <td>{g.incompatibles.length ? g.incompatibles.map((c) => porGrupo.get(c)?.nombre ?? c).join(", ") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {esPersonal(perfil) && (
          <section className="panel">
            <h2>Agregar familia o subfamilia</h2>
            <FormSimple accion={crearFamilia} textoBoton="Agregar">
              <div className="fields">
                <div className="field">
                  <label htmlFor="c-nombre">Nombre</label>
                  <input id="c-nombre" name="nombre" required placeholder="Silicatos" />
                </div>
                <div className="field">
                  <label htmlFor="c-padre">Dentro de</label>
                  <select id="c-padre" name="padre_id" defaultValue="">
                    <option value="">Es una familia principal</option>
                    {raices.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="c-grupo">Grupo de almacenamiento</label>
                  <select id="c-grupo" name="grupo" defaultValue="">
                    <option value="">El de su familia</option>
                    {grupos.map((g) => <option key={g.codigo} value={g.codigo}>{g.codigo} · {g.nombre}</option>)}
                  </select>
                </div>
                <div className="field wide">
                  <label htmlFor="c-desc">Ejemplos</label>
                  <input id="c-desc" name="descripcion" placeholder="Na₂SiO₃, silicagel" />
                </div>
              </div>
            </FormSimple>
          </section>
        )}
      </div>
    </>
  );
}
