export type Rol = "admin" | "almacen" | "docente";

export type Perfil = { id: string; nombre: string; rol: Rol; docente_id: string | null };

export const ROLES: Record<Rol, string> = {
  admin: "Administración",
  almacen: "Almacén",
  docente: "Docente",
};

export type TipoArticulo = "reactivo" | "vidrio" | "equipo" | "material";

export const TIPOS: Record<TipoArticulo, string> = {
  reactivo: "Reactivo",
  vidrio: "Material de vidrio",
  equipo: "Equipo",
  material: "Otro material",
};

export const UNIDADES = ["g", "kg", "mg", "mL", "L", "unidad", "par", "caja", "paquete", "rollo"] as const;

// Pictogramas del Sistema Globalmente Armonizado (SGA / GHS)
export const PICTOGRAMAS: Record<string, string> = {
  GHS01: "Explosivo",
  GHS02: "Inflamable",
  GHS03: "Comburente",
  GHS04: "Gas a presión",
  GHS05: "Corrosivo",
  GHS06: "Tóxico",
  GHS07: "Nocivo / irritante",
  GHS08: "Peligro para la salud",
  GHS09: "Peligro para el ambiente",
};

export const MOVIMIENTOS: Record<string, string> = {
  ingreso: "Ingreso",
  entrega_docente: "Entrega a docente",
  baja: "Baja",
  reposicion: "Reposición de alumno",
  ajuste_positivo: "Ajuste +",
  ajuste_negativo: "Ajuste −",
};

export type Familia = { id: string; nombre: string; padre_id: string | null; grupo: string | null; orden: number; descripcion: string | null };
export type Grupo = { codigo: string; nombre: string; color: string; indicaciones: string | null; incompatibles: string[] };

export type ArticuloVista = {
  id: string;
  codigo: string;
  codigo_barras: string | null;
  tipo: TipoArticulo;
  nombre: string;
  familia_id: string | null;
  formula: string | null;
  cas: string | null;
  grado: string | null;
  concentracion: string | null;
  pictogramas: string[];
  palabra_advertencia: string | null;
  grupo: string | null;
  fiscalizado: boolean;
  capacidad: string | null;
  material: string | null;
  modelo: string | null;
  serie: string | null;
  prestable: boolean;
  marca: string | null;
  presentacion: string | null;
  unidad: string;
  stock_minimo: number;
  ubicacion_id: string | null;
  notas: string | null;
  activo: boolean;
  stock: number;
  prestado: number;
  disponible: number;
  vencido: number;
  utilizable: number;
  proximo_vencimiento: string | null;
  familia: string | null;
  subfamilia: string | null;
  familia_raiz_id: string | null;
  ubicacion: string | null;
  estado_stock: "agotado" | "bajo" | "ok";
};

// Lo mínimo para elegir un artículo en un buscador
export type ArticuloCorto = Pick<ArticuloVista, "id" | "codigo" | "codigo_barras" | "nombre" | "tipo" | "unidad" | "formula" | "disponible" | "prestable">;

export const ESTADO_ENTREGA: Record<string, string> = {
  sin_items: "Sin artículos",
  pendiente: "Por entregar",
  parcial: "Entrega parcial",
  entregada: "Entregada",
};
