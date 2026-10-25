type ErrorPg = { code?: string; message?: string; details?: string | null } | null | undefined;

// Traduce los errores de PostgreSQL / PostgREST a mensajes para el usuario
export function mensajeError(error: ErrorPg): string {
  if (!error) return "Ocurrió un error inesperado.";
  const msg = error.message ?? "";
  switch (error.code) {
    case "23505":
      if (msg.includes("articulos_codigo_barras")) return "Ese código de barras ya está en otro artículo.";
      if (msg.includes("articulos_codigo")) return "Ya existe un artículo con ese código.";
      if (msg.includes("alumnos_codigo")) return "Ya existe un alumno con ese código.";
      if (msg.includes("practica_items")) return "Ese artículo ya está en la práctica; cambia su cantidad.";
      if (msg.includes("semestres_un_activo")) return "Solo puede haber un semestre activo.";
      return "Ese registro ya existe.";
    case "23503":
      return "No se puede borrar porque tiene registros relacionados (entregas, préstamos o artículos).";
    case "23514":
      if (msg.includes("reactivo_no_prestable")) return "Los reactivos no se prestan a alumnos.";
      if (msg.includes("item_cuadra")) return "Lo devuelto, roto y perdido no puede superar lo prestado.";
      return "Algún dato no es válido.";
    case "42501":
      return "Tu rol no tiene permiso para esta acción.";
    case "P0001":
      return msg; // mensajes propios de la base de datos, ya en español
    default:
      if (msg.includes("row-level security")) return "Tu rol no tiene permiso para esta acción.";
      return msg || "Ocurrió un error inesperado.";
  }
}
