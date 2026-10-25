import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { esPersonal, requierePerfil, semestreActivo } from "@/lib/sesion";
import { cant, fecha, hoy, sumarDias } from "@/lib/formato";
import { ESTADO_ENTREGA, TIPOS, type TipoArticulo } from "@/lib/tipos";
import Icono, { ICONO_TIPO } from "@/components/Iconos";

export default async function Inicio({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const perfil = await requierePerfil();
  const { error } = await searchParams;
  const supabase = await createClient();
  const sem = await semestreActivo();
  const personal = esPersonal(perfil);
  const limite = sumarDias(hoy(), 60);

  const [{ data: arts }, { data: lotes }, { data: vencidos }, { data: practicas }, { data: incompat }] = await Promise.all([
    supabase.from("v_articulos").select("id, nombre, tipo, unidad, stock, stock_minimo, utilizable, estado_stock").eq("activo", true),
    personal ? supabase.from("v_lotes").select("id, articulo_id, nombre, lote, vencimiento, cantidad, unidad").lte("vencimiento", limite).order("vencimiento").limit(15) : Promise.resolve({ data: [] }),
    personal ? supabase.from("v_prestamos").select("id, numero, alumno, alumno_codigo, fecha_limite, pendiente").eq("vencido", true).order("fecha_limite").limit(15) : Promise.resolve({ data: [] }),
    sem ? supabase.from("v_practicas").select("id, nombre, curso, docente, fecha, estado, estado_entrega, items").eq("semestre_id", sem.id).order("fecha", { nullsFirst: false }).limit(200) : Promise.resolve({ data: [] }),
    personal ? supabase.from("v_incompatibilidades").select("ubicacion_id").limit(50) : Promise.resolve({ data: [] }),
  ]);
  const articulos = arts ?? [];
  const bajos = articulos.filter((a) => a.estado_stock !== "ok").sort((a, b) => Number(a.stock) - Number(b.stock));
  const conteo = (t: TipoArticulo) => articulos.filter((a) => a.tipo === t).length;
  const prs = practicas ?? [];
  const porEntregar = prs.filter((p) => p.items > 0 && p.estado_entrega !== "entregada" && (personal ? p.estado === "enviada" : true));

  return (
    <>
      <div className="head">
        <div>
          <h1>Hola, {perfil.nombre.split(" ")[0]}</h1>
          <p className="sub">{sem ? `Semestre ${sem.nombre}` : "No hay un semestre activo. Créalo en Configuración."}</p>
        </div>
        {personal && (
          <div className="row">
            <Link className="btn" href="/prestamos/nuevo">Nuevo préstamo</Link>
            <Link className="btn primary" href="/inventario/nuevo">Nuevo artículo</Link>
          </div>
        )}
        {!personal && <Link className="btn primary" href="/practicas/nueva">Registrar práctica</Link>}
      </div>
      {error === "sin-permiso" && <div className="alert error">Tu rol no tiene acceso a esa pantalla.</div>}

      <div className="stats">
        {(Object.keys(TIPOS) as TipoArticulo[]).map((t) => (
          <Link key={t} href={`/inventario?tipo=${t}`} className="stat" style={{ textDecoration: "none", color: "inherit" }}>
            <span style={{ color: "var(--accent)" }}><Icono nombre={ICONO_TIPO[t]} tam={26} /></span>
            <b>{conteo(t)}</b>
            <span>{TIPOS[t]}</span>
          </Link>
        ))}
      </div>

      {personal && articulos.length === 0 && (
        <section className="panel">
          <h2>Para empezar</h2>
          <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
            <li>Revisa las <Link href="/configuracion#ubicaciones">ubicaciones</Link> y las <Link href="/configuracion#areas">áreas</Link>, y agrega a los <Link href="/configuracion#docentes">docentes</Link>.</li>
            <li>Carga tu inventario con <Link href="/inventario/importar">Importar desde Excel</Link> o uno por uno con <Link href="/inventario/nuevo">Nuevo artículo</Link>.</li>
            <li>Registra las <Link href="/practicas/nueva">prácticas</Link> del semestre (o da cuenta a los docentes para que lo hagan ellos).</li>
            <li>Mira el <Link href="/practicas/requerimiento">total del semestre</Link> para saber qué entregar y qué falta comprar.</li>
          </ol>
        </section>
      )}

      {(incompat ?? []).length > 0 && (
        <div className="aviso">Hay reactivos incompatibles guardados en la misma ubicación. <Link href="/clasificacion">Ver detalle</Link></div>
      )}

      <div className="grid2">
        {personal && (
          <section className="panel">
            <h2>Stock bajo <Link className="btn small" href="/inventario?alerta=bajo">Ver todo</Link></h2>
            {bajos.length === 0 ? <div className="empty">Todo por encima del mínimo.</div> : (
              <ul className="list">
                {bajos.slice(0, 10).map((a) => (
                  <li key={a.id}>
                    <Link href={`/inventario/${a.id}`}>{a.nombre}</Link>
                    <span className="meta">
                      <span className={`chip ${a.estado_stock}`}>{a.estado_stock === "agotado" ? "Agotado" : "Bajo"}</span>
                      Hay {cant(a.stock)} {a.unidad} · mínimo {cant(a.stock_minimo)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {personal && (
          <section className="panel">
            <h2>Vencen pronto <Link className="btn small" href="/inventario?alerta=vence">Ver todo</Link></h2>
            {(lotes ?? []).length === 0 ? <div className="empty">Ningún lote vence en los próximos 60 días.</div> : (
              <ul className="list">
                {(lotes ?? []).map((l) => (
                  <li key={l.id}>
                    <Link href={`/inventario/${l.articulo_id}`}>{l.nombre}</Link>
                    <span className="meta">
                      {l.vencimiento < hoy() ? <span className="chip vencido">Vencido</span> : <span className="chip bajo">Vence {fecha(l.vencimiento)}</span>}
                      Lote {l.lote} · {cant(l.cantidad)} {l.unidad}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {personal && (
          <section className="panel">
            <h2>Préstamos vencidos <Link className="btn small" href="/prestamos?ver=vencidos">Ver todo</Link></h2>
            {(vencidos ?? []).length === 0 ? <div className="empty">Ningún préstamo vencido.</div> : (
              <ul className="list">
                {(vencidos ?? []).map((p) => (
                  <li key={p.id}>
                    <Link href={`/prestamos/${p.id}`}>{p.alumno}</Link>
                    <span className="meta">N.º {p.numero} · {p.alumno_codigo} · debía devolver el {fecha(p.fecha_limite)} · {cant(p.pendiente)} pendientes</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        <section className="panel">
          <h2>{personal ? "Prácticas por entregar" : "Mis prácticas"} <Link className="btn small" href="/practicas">Ver todas</Link></h2>
          {(personal ? porEntregar : prs).length === 0 ? <div className="empty">{personal ? "No hay prácticas enviadas pendientes de entrega." : "Aún no registras prácticas este semestre."}</div> : (
            <ul className="list">
              {(personal ? porEntregar : prs).slice(0, 10).map((p) => (
                <li key={p.id}>
                  <Link href={`/practicas/${p.id}`}>{p.curso} · {p.nombre}</Link>
                  <span className="meta">
                    {personal && p.docente} {p.fecha && `· ${fecha(p.fecha)}`}
                    <span className={`chip ${p.estado}`}>{p.estado === "borrador" ? "Borrador" : "Enviada"}</span>
                    {p.items > 0 && <span className={`chip ${p.estado_entrega}`}>{ESTADO_ENTREGA[p.estado_entrega]}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
