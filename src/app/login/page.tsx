import type { Metadata } from "next";
import FormLogin from "./FormLogin";
import Icono, { FondoLaboratorio } from "@/components/Iconos";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ siguiente?: string }>;
}) {
  const { siguiente = "/" } = await searchParams;
  return (
    <main className="login">
      <FondoLaboratorio />
      <div className="card">
        <div className="brand">
          <Icono nombre="matraz" tam={26} /> Almacén <span>FIQ</span>
        </div>
        <p className="muted">Entra con la cuenta que te dio el almacén.</p>
        <FormLogin siguiente={siguiente} />
      </div>
    </main>
  );
}
