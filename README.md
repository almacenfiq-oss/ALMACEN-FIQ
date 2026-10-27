# Almacén FIQ

Sistema web para el almacén de laboratorio de la facultad: inventario de reactivos, material de vidrio, equipos y otros materiales; prácticas de cada semestre con el cálculo automático de lo que hay que entregar; entregas a docentes y préstamos a alumnos. Todo funciona con planes gratuitos (Supabase y Vercel) y el almacén no cobra nada: no hay precios ni pagos en la app.

## Qué hace

- **Inventario** con stock en tiempo real, stock mínimo con alerta, ubicaciones del almacén y lector de código de barras (USB, Bluetooth o la cámara del celular).
- **Reactivos clasificados** por familia y subfamilia química (ácidos, bases e hidróxidos, sales → cloruros, sulfatos, nitratos…, óxidos, solventes, indicadores, etc.), con fórmula, CAS, grado, concentración, pictogramas SGA, marca de **insumo fiscalizado (SUNAT)**, **lotes con vencimiento** y grupo de almacenamiento. La app avisa si hay reactivos incompatibles guardados en la misma ubicación.
- **Importar desde Excel**: se copian las filas y se pegan; la plantilla está en la misma pantalla.
- **Prácticas por semestre**: cada práctica tiene secciones y grupos; el docente (o el almacén) escribe la cantidad por grupo y la app multiplica. El **total del semestre** suma todas las prácticas (con un margen opcional), lo compara con el stock útil (sin lotes vencidos) y muestra lo que falta comprar. Las prácticas se pueden copiar al semestre siguiente.
- **Entregas a docentes**: desde la práctica, con las cantidades pendientes ya llenas. Descuenta el inventario tomando primero el lote que vence antes y nunca uno vencido. Lo entregado no se devuelve. Acta imprimible.
- **Préstamos a alumnos** (solo vidrio, equipos y otros materiales, nunca reactivos): fecha de devolución, devolución parcial, roturas y pérdidas. Lo roto o perdido se da de baja y queda como **reposición pendiente** (el alumno trae uno igual); mientras tenga algo vencido o por reponer no puede llevar más material. Constancia imprimible.
- **Kardex** de todos los movimientos (inmutable), filtrable y descargable a Excel, con filtro de fiscalizados.
- **Reportes**: entregas por área y por docente, lo más usado, reactivos por familia, roturas y consumo mensual de fiscalizados.
- **Roles**: Administración (todo, incluidos usuarios), Almacén (todo menos usuarios) y Docente (ve el inventario, registra y envía sus prácticas, ve sus entregas).

## Puesta en marcha (gratis)

1. Crea una cuenta en [supabase.com](https://supabase.com) y un proyecto nuevo (plan Free). Elige la región **South America (São Paulo)**.
2. Abre **SQL Editor → New query**, pega todo `supabase/instalar.sql` y pulsa **Run**. Crea las tablas, reglas, permisos, la clasificación química, áreas, ubicaciones y el semestre 2026-II. Se ejecuta una sola vez.
3. En **Authentication → Users → Add user → Create new user** crea tu usuario con “Auto Confirm User”. **La primera persona registrada queda como administradora.**
4. En **Project Settings → API Keys** copia la *Project URL* y la *anon / publishable key*.
5. En [vercel.com/new](https://vercel.com/new) (plan Hobby, gratis) importa este repositorio, agrega las dos variables y pulsa **Deploy**:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon o publishable key>
   ```

6. En Supabase → **Authentication → URL Configuration** pon como *Site URL* la dirección que te dio Vercel.
7. Entra a la app, revisa **Configuración** (semestre, áreas, ubicaciones, docentes) y carga el inventario con **Inventario → Importar desde Excel**.

Para dar acceso a otra persona: créala en Supabase → Authentication → Users y luego, en la app, **Configuración → Usuarios** elige su rol (y, si es docente, su ficha).

Para probar en una computadora: copia `.env.example` a `.env.local` con tus datos, `npm install` y `npm run dev`.

### Cambios futuros a la base de datos

Cada cambio posterior a la instalación vendrá en `supabase/actualizaciones/` con fecha. Se ejecuta una sola vez en el SQL Editor. `supabase/instalar.sql` ya incluye todas, así que una instalación nueva no necesita correrlas.

| Fecha | Archivo | Qué trae |
|---|---|---|
| 2026-10-26 | `2026-10-26-envases-encargados-fotos.sql` | Registrar por cajas o frascos (el stock sigue en unidades, g o mL), encargados que despachan con nombre y DNI en las actas, y fotos de evidencia de cada entrega |
| 2026-10-27 | `2026-10-27-entregas-por-area.sql` | Entrega por área (todo el semestre de una vez o por partes, con saldo pendiente) y propuesta de reparto que no deja el almacén por debajo del stock mínimo |

La lectura de guías en PDF se hace en el navegador con pdf.js: el archivo no se sube a ningún servicio. Funciona con PDF que tienen texto (los exportados desde Word); una hoja escaneada no tiene texto que leer.

Las fotos de evidencia se guardan en Supabase Storage (bucket privado `evidencias`). La app las reduce antes de subirlas (unos 150 KB cada una), así que el 1 GB gratuito alcanza para miles de fotos.

## Estructura

```
src/app/(app)/      pantallas con menú (inventario, prácticas, entregas, préstamos…)
src/components/     formularios y piezas reutilizables
src/lib/            sesión, formatos (hora de Lima), errores en español
supabase/           esquema (migrations), datos iniciales (seed) e instalar.sql
```

Hecho con Next.js 15 y Supabase (PostgreSQL con Row Level Security). Las reglas importantes viven en la base de datos: el stock nunca queda negativo, el kardex no se edita, los reactivos no se prestan y un alumno con deudas no puede pedir más.
