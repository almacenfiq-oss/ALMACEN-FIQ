"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Rol } from "@/lib/tipos";
import Icono from "./Iconos";

const TODOS: Rol[] = ["admin", "almacen", "docente"];
const PERSONAL: Rol[] = ["admin", "almacen"];

const ENLACES: { href: string; texto: string; icono: string; roles: Rol[] }[] = [
  { href: "/", icono: "inicio", texto: "Inicio", roles: TODOS },
  { href: "/inventario", icono: "matraz", texto: "Inventario", roles: TODOS },
  { href: "/clasificacion", icono: "molecula", texto: "Clasificación", roles: TODOS },
  { href: "/practicas", icono: "portapapeles", texto: "Prácticas", roles: TODOS },
  { href: "/entregas", icono: "entrega", texto: "Entregas", roles: TODOS },
  { href: "/prestamos", icono: "prestamo", texto: "Préstamos", roles: PERSONAL },
  { href: "/alumnos", icono: "alumnos", texto: "Alumnos", roles: PERSONAL },
  { href: "/kardex", icono: "kardex", texto: "Kardex", roles: PERSONAL },
  { href: "/reportes", icono: "grafica", texto: "Reportes", roles: PERSONAL },
  { href: "/configuracion", icono: "ajustes", texto: "Configuración", roles: PERSONAL },
];

export default function Nav({ rol }: { rol: Rol }) {
  const ruta = usePathname();
  const activo = (href: string) => (href === "/" ? ruta === "/" : ruta.startsWith(href));
  return (
    <nav className="nav" aria-label="Principal">
      {ENLACES.filter((e) => e.roles.includes(rol)).map((e) => (
        <Link key={e.href} href={e.href} aria-current={activo(e.href) ? "page" : undefined}>
          <Icono nombre={e.icono} />
          {e.texto}
        </Link>
      ))}
    </nav>
  );
}
