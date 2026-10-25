import Nav from "@/components/Nav";
import Icono from "@/components/Iconos";
import { cerrarSesion } from "@/app/login/actions";
import { requierePerfil } from "@/lib/sesion";
import { ROLES } from "@/lib/tipos";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requierePerfil();
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <Icono nombre="matraz" tam={26} /> Almacén <span>FIQ</span>
        </div>
        <Nav rol={perfil.rol} />
        <div className="who">
          <div>
            <b>{perfil.nombre}</b>
            <div>{ROLES[perfil.rol]}</div>
          </div>
          <form action={cerrarSesion}>
            <button className="btn small" type="submit">Salir</button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
