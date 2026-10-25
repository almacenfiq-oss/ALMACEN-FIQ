"use client";

export default function BotonImprimir({ texto = "Imprimir" }: { texto?: string }) {
  return <button type="button" className="btn" onClick={() => window.print()}>{texto}</button>;
}
