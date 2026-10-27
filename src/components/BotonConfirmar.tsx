"use client";

// Botón de formulario que pide confirmación antes de enviar (para borrar)
export default function BotonConfirmar({ texto, pregunta, clase = "btn danger" }: { texto: string; pregunta: string; clase?: string }) {
  return (
    <button type="submit" className={clase} onClick={(e) => { if (!confirm(pregunta)) e.preventDefault(); }}>
      {texto}
    </button>
  );
}
