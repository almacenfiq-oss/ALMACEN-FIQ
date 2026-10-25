"use client";

import { useActionState, useTransition } from "react";

// Como useActionState, pero sin que React vacíe el formulario al terminar:
// si hay un error, lo escrito se conserva para corregirlo.
export function useFormAccion<S>(accion: (estado: Awaited<S>, datos: FormData) => Promise<S>, inicial: S) {
  const [estado, enviar, enviando] = useActionState<S, FormData>(accion, inicial as Awaited<S>);
  const [, iniciar] = useTransition();
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    iniciar(() => enviar(datos));
  };
  return [estado, onSubmit, enviando] as const;
}
