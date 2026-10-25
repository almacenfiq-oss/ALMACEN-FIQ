// Íconos de línea de laboratorio (SVG propio, sin descargas)
const RUTAS: Record<string, React.ReactNode> = {
  matraz: (<><path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" /><path d="M7.5 15h9" /></>),
  vaso: (<><path d="M5 4h14M6 4v15a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4" /><path d="M6 12h4M6 16h3M6 8h3" /></>),
  microscopio: (<><path d="M6 21h12M9 18h6M12 18a6 6 0 0 0 6-6" /><path d="M9 4l4 1-2.5 8-4-1z" /><path d="M10.5 13 9 17" /></>),
  caja: (<><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7M12 11v10" /></>),
  molecula: (<><circle cx="6" cy="7" r="2.5" /><circle cx="18" cy="7" r="2.5" /><circle cx="12" cy="17" r="2.5" /><path d="M8.2 8.2l2.6 6.6M15.8 8.2l-2.6 6.6M8.5 7h7" /></>),
  portapapeles: (<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" /></>),
  entrega: (<><path d="M3 12h11M10 8l4 4-4 4" /><path d="M17 5h3v14h-3" /></>),
  prestamo: (<><path d="M4 9h13l-3-3M20 15H7l3 3" /></>),
  alumnos: (<><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /><path d="M3 9l9-5 9 5" /></>),
  kardex: (<><path d="M4 4h16v16H4z" /><path d="M4 9h16M9 9v11M14 9v11" /></>),
  grafica: (<><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></>),
  ajustes: (<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>),
  inicio: (<><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>),
};

export default function Icono({ nombre, tam = 18 }: { nombre: keyof typeof RUTAS | string; tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="icono">
      {RUTAS[nombre] ?? RUTAS.caja}
    </svg>
  );
}

export const ICONO_TIPO = { reactivo: "matraz", vidrio: "vaso", equipo: "microscopio", material: "caja" } as const;

// Fondo decorativo de la pantalla de entrada: material de laboratorio y moléculas
export function FondoLaboratorio() {
  const piezas: [string, number, number, number, number][] = [
    ["matraz", 6, 10, 70, -12], ["molecula", 78, 8, 90, 10], ["vaso", 86, 62, 64, 8], ["microscopio", 10, 70, 80, 0],
    ["molecula", 40, 84, 54, 30], ["matraz", 64, 30, 40, 18], ["vaso", 24, 38, 36, -8], ["molecula", 4, 44, 44, -20],
  ];
  return (
    <div className="fondo-lab" aria-hidden="true">
      {piezas.map(([n, x, y, t, r], i) => (
        <span key={i} style={{ left: `${x}%`, top: `${y}%`, transform: `rotate(${r}deg)` }}>
          <Icono nombre={n} tam={t} />
        </span>
      ))}
    </div>
  );
}
