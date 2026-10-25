import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requierePerfil } from "@/lib/sesion";
import { fecha, fechaHora } from "@/lib/formato";
import { ROLES } from "@/lib/tipos";
import FormSimple from "@/components/FormSimple";
import { activarSemestre, guardarDocente, guardarSemestre, guardarSimple, guardarUsuario } from "./actions";

export const metadata: Metadata = { title: "Configuración" };

export default async function Configuracion() {
  const perfil = await requierePerfil(["admin", "almacen"]);
  const admin = perfil.rol === "admin";
  const supabase = await createClient();
  const [{ data: sems }, { data: docentes }, { data: areas }, { data: ubicaciones }, cuentas, { data: perfiles }] = await Promise.all([
    supabase.from("semestres").select("*").order("nombre", { ascending: false }),
    supabase.from("docentes").select("*, areas(nombre)").order("nombres"),
    supabase.from("areas").select("*").order("nombre"),
    supabase.from("ubicaciones").select("*").order("nombre"),
    admin ? supabase.rpc("usuarios_cuentas") : Promise.resolve({ data: [] }),
    supabase.from("perfiles").select("id, nombre, rol, activo"),
  ]);
  const perfilDe = new Map((perfiles ?? []).map((p) => [p.id, p]));
  const docenteDe = new Map((docentes ?? []).filter((d) => d.perfil_id).map((d) => [d.perfil_id as string, d.id as string]));

  return (
    <>
      <div className="head">
        <div>
          <h1>Configuración</h1>
          <p className="sub">Semestres, docentes, áreas, ubicaciones del almacén y usuarios.</p>
        </div>
      </div>

      <section className="panel" id="semestres">
        <h2>Semestres</h2>
        <p className="ayuda">El semestre activo es el que se usa por defecto en prácticas, entregas y reportes. El margen suma un porcentaje extra al total que piden las prácticas.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Semestre</th><th>Fechas</th><th>Margen</th><th>Estado</th><th>Editar</th></tr></thead>
            <tbody>
              {(sems ?? []).map((s) => (
                <tr key={s.id}>
                  <td><b>{s.nombre}</b></td>
                  <td>{fecha(s.inicio)} – {fecha(s.fin)}</td>
                  <td className="num">{Number(s.margen_pct)} %</td>
                  <td>
                    {s.activo ? <span className="chip ok">Activo</span> : (
                      <form action={activarSemestre}><input type="hidden" name="id" value={s.id} /><button className="btn small" type="submit">Activar</button></form>
                    )}
                  </td>
                  <td>
                    <details>
                      <summary>Editar</summary>
                      <FormSimple accion={guardarSemestre} textoBoton="Guardar" limpiar={false}>
                        <input type="hidden" name="id" value={s.id} />
                        <CamposSemestre s={s} />
                      </FormSimple>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details>
          <summary>Nuevo semestre</summary>
          <div style={{ marginTop: 10 }}>
            <FormSimple accion={guardarSemestre} textoBoton="Crear semestre"><CamposSemestre /></FormSimple>
          </div>
        </details>
      </section>

      <section className="panel" id="docentes">
        <h2>Docentes</h2>
        <p className="ayuda">Registra a todos los docentes, aunque no usen la app. Si quieres que alguno registre sus propias prácticas, dale una cuenta en Usuarios.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Docente</th><th>Área</th><th>Contacto</th><th>Cuenta</th><th>Editar</th></tr></thead>
            <tbody>
              {(docentes ?? []).map((d) => (
                <tr key={d.id}>
                  <td>{d.nombres} {!d.activo && <span className="chip vencido">Inactivo</span>}</td>
                  <td>{d.areas?.nombre ?? "—"}</td>
                  <td>{[d.email, d.telefono].filter(Boolean).join(" · ") || "—"}</td>
                  <td>{d.perfil_id ? <span className="chip ok">Usa la app</span> : "—"}</td>
                  <td>
                    <details>
                      <summary>Editar</summary>
                      <FormSimple accion={guardarDocente} textoBoton="Guardar" limpiar={false}>
                        <input type="hidden" name="id" value={d.id} />
                        <CamposDocente d={d} areas={areas ?? []} />
                        <label className="check"><input type="checkbox" name="activo" defaultChecked={d.activo} /> Activo</label>
                      </FormSimple>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details open={(docentes ?? []).length === 0}>
          <summary>Agregar docente</summary>
          <div style={{ marginTop: 10 }}>
            <FormSimple accion={guardarDocente} textoBoton="Agregar docente"><CamposDocente areas={areas ?? []} /></FormSimple>
          </div>
        </details>
      </section>

      <div className="grid2">
        {(["areas", "ubicaciones"] as const).map((tabla) => {
          const filas = (tabla === "areas" ? areas : ubicaciones) ?? [];
          return (
            <section className="panel" key={tabla} id={tabla}>
              <h2>{tabla === "areas" ? "Áreas académicas" : "Ubicaciones del almacén"}</h2>
              <ul className="list">
                {filas.map((x) => (
                  <li key={x.id}>
                    <details>
                      <summary>{x.nombre} {!x.activa && <span className="chip vencido">Inactiva</span>}{x.descripcion ? <span className="muted"> · {x.descripcion}</span> : null}</summary>
                      <FormSimple accion={guardarSimple} textoBoton="Guardar" limpiar={false}>
                        <input type="hidden" name="tabla" value={tabla} />
                        <input type="hidden" name="id" value={x.id} />
                        <div className="fields">
                          <div className="field"><label>Nombre</label><input name="nombre" defaultValue={x.nombre} required /></div>
                          {tabla === "ubicaciones" && <div className="field"><label>Descripción</label><input name="descripcion" defaultValue={x.descripcion ?? ""} /></div>}
                        </div>
                        <label className="check"><input type="checkbox" name="activa" defaultChecked={x.activa} /> Activa</label>
                      </FormSimple>
                    </details>
                  </li>
                ))}
              </ul>
              <FormSimple accion={guardarSimple} textoBoton="Agregar">
                <input type="hidden" name="tabla" value={tabla} />
                <div className="fields">
                  <div className="field"><label>Nueva</label><input name="nombre" required placeholder={tabla === "areas" ? "Química orgánica" : "Estante B-3"} /></div>
                  {tabla === "ubicaciones" && <div className="field"><label>Descripción</label><input name="descripcion" placeholder="Opcional" /></div>}
                </div>
              </FormSimple>
            </section>
          );
        })}
      </div>

      {admin && (
        <section className="panel" id="usuarios">
          <h2>Usuarios</h2>
          <p className="ayuda">
            Para dar acceso a alguien: en Supabase → Authentication → Users pulsa <b>Add user</b> (con “Auto Confirm User”). La cuenta aparece aquí; elige su rol y guarda.
            Almacén maneja todo menos los usuarios; un docente solo ve el inventario, sus prácticas y sus entregas.
          </p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Cuenta</th><th>Último acceso</th><th>Acceso</th></tr></thead>
              <tbody>
                {((cuentas.data ?? []) as { id: string; email: string; ultimo_acceso: string | null }[]).map((c) => {
                  const p = perfilDe.get(c.id);
                  return (
                    <tr key={c.id}>
                      <td>{c.email}<div className="muted" style={{ fontSize: 13 }}>{p ? `${p.nombre} · ${ROLES[p.rol as keyof typeof ROLES]}${p.activo ? "" : " (sin acceso)"}` : "Sin rol"}</div></td>
                      <td>{c.ultimo_acceso ? fechaHora(c.ultimo_acceso) : "Nunca"}</td>
                      <td>
                        <details open={!p}>
                          <summary>{p ? "Cambiar" : "Dar acceso"}</summary>
                          <FormSimple accion={guardarUsuario} textoBoton="Guardar" limpiar={false}>
                            <input type="hidden" name="id" value={c.id} />
                            {!p && <input type="hidden" name="nuevo" value="1" />}
                            <div className="fields">
                              <div className="field"><label>Nombre</label><input name="nombre" required defaultValue={p?.nombre ?? c.email.split("@")[0]} /></div>
                              <div className="field">
                                <label>Rol</label>
                                <select name="rol" defaultValue={p?.rol ?? "almacen"}>
                                  {Object.entries(ROLES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                                </select>
                              </div>
                              <div className="field">
                                <label>Si es docente, su ficha</label>
                                <select name="docente_id" defaultValue={docenteDe.get(c.id) ?? ""}>
                                  <option value="">—</option>
                                  {(docentes ?? []).map((d) => <option key={d.id} value={d.id}>{d.nombres}</option>)}
                                </select>
                              </div>
                            </div>
                            {p && <label className="check"><input type="checkbox" name="activo" defaultChecked={p.activo} /> Con acceso</label>}
                          </FormSimple>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function CamposSemestre({ s }: { s?: { nombre: string; inicio: string | null; fin: string | null; margen_pct: number } }) {
  return (
    <div className="fields">
      <div className="field"><label>Nombre</label><input name="nombre" required defaultValue={s?.nombre} placeholder="2027-I" /></div>
      <div className="field"><label>Inicio</label><input name="inicio" type="date" defaultValue={s?.inicio ?? ""} /></div>
      <div className="field"><label>Fin</label><input name="fin" type="date" defaultValue={s?.fin ?? ""} /></div>
      <div className="field"><label>Margen extra (%)</label><input name="margen_pct" inputMode="decimal" defaultValue={s ? Number(s.margen_pct) : 0} /></div>
    </div>
  );
}

function CamposDocente({ d, areas }: { d?: { nombres: string; area_id: string | null; email: string | null; telefono: string | null }; areas: { id: string; nombre: string }[] }) {
  return (
    <div className="fields">
      <div className="field"><label>Nombre</label><input name="nombres" required defaultValue={d?.nombres} placeholder="Dra. María Ruiz" /></div>
      <div className="field">
        <label>Área</label>
        <select name="area_id" defaultValue={d?.area_id ?? ""}>
          <option value="">—</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
      </div>
      <div className="field"><label>Correo</label><input name="email" type="email" defaultValue={d?.email ?? ""} /></div>
      <div className="field"><label>Celular</label><input name="telefono" defaultValue={d?.telefono ?? ""} /></div>
    </div>
  );
}
