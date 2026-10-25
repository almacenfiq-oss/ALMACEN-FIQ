import { cerrarSesion } from "@/app/login/actions";

export default function SinAcceso() {
  return (
    <main className="login">
      <div className="card">
        <h1>Tu cuenta aún no tiene rol</h1>
        <p className="muted">
          Iniciaste sesión, pero el almacén todavía no te asignó un rol (administración, almacén o docente). Pídele que te dé
          de alta y vuelve a entrar.
        </p>
        <form action={cerrarSesion}>
          <button className="btn" type="submit">Cerrar sesión</button>
        </form>
      </div>
    </main>
  );
}
