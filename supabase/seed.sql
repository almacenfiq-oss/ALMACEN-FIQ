-- Catálogos iniciales del almacén. Ajústalos desde la app (Catálogos).

-- Grupos de compatibilidad para almacenar (qué no debe guardarse junto)
insert into grupos_almacenamiento (codigo, nombre, color, indicaciones, incompatibles) values
  ('A',  'Ácidos inorgánicos',        '#e5484d', 'Armario para ácidos, ventilado, con bandeja de derrames.', '{B,R,O,I}'),
  ('AO', 'Ácidos oxidantes',          '#d6409f', 'Separado de los demás ácidos y lejos de orgánicos (nítrico, perclórico).', '{B,I,R}'),
  ('B',  'Bases',                     '#3e63dd', 'Lejos de los ácidos.', '{A,AO}'),
  ('I',  'Inflamables',               '#f76b15', 'Gabinete para inflamables, lejos del calor y de oxidantes.', '{A,AO,O}'),
  ('O',  'Oxidantes',                 '#ffc53d', 'Lejos de inflamables, orgánicos y metales activos.', '{I,R,A}'),
  ('T',  'Tóxicos',                   '#8e4ec6', 'Bajo llave, con registro de uso.', '{}'),
  ('R',  'Reactivos con agua',        '#12a594', 'Secos y aislados (sodio, potasio metálico, carburo).', '{A,AO,O}'),
  ('G',  'General (compatibles)',     '#8b8d98', 'Sales y sólidos estables; estantería común.', '{}')
on conflict (codigo) do nothing;

-- Clasificación química: familia principal y sus subfamilias
insert into familias (nombre, grupo, orden, descripcion) values
  ('Ácidos inorgánicos',            'A',  10, 'HCl, H₂SO₄, H₃PO₄, HNO₃'),
  ('Bases e hidróxidos',            'B',  20, 'NaOH, KOH, NH₄OH, Ca(OH)₂'),
  ('Sales',                         'G',  30, 'Sales inorgánicas y orgánicas'),
  ('Óxidos y peróxidos',            'G',  40, 'CaO, MnO₂, H₂O₂'),
  ('Metales y no metales',          'G',  50, 'Elementos: Zn, Cu, Mg, Fe, S, I₂'),
  ('Solventes orgánicos',           'I',  60, 'Alcoholes, cetonas, hidrocarburos, halogenados'),
  ('Ácidos orgánicos',              'G',  70, 'Acético, cítrico, oxálico, benzoico'),
  ('Otros compuestos orgánicos',    'G',  80, 'Aminas, carbohidratos, aminoácidos'),
  ('Indicadores y colorantes',      'G',  90, 'Fenolftaleína, naranja de metilo, azul de metileno'),
  ('Soluciones preparadas',         'G', 100, 'Estándares valorados y buffers'),
  ('Medios de cultivo y biológicos','G', 110, 'Agar, peptona, caldos'),
  ('Bioquímicos y enzimas',         'G', 120, 'Enzimas, kits, proteínas'),
  ('Otros reactivos',               'G', 130, null)
on conflict do nothing;

insert into familias (nombre, padre_id, grupo, orden)
select s.nombre, f.id, s.grupo, s.orden
from (values
  ('Ácidos inorgánicos', 'Ácidos no oxidantes',        'A',  1),
  ('Ácidos inorgánicos', 'Ácidos oxidantes',           'AO', 2),
  ('Bases e hidróxidos', 'Hidróxidos',                 'B',  1),
  ('Bases e hidróxidos', 'Amoníaco y aminas básicas',  'B',  2),
  ('Sales',              'Cloruros',                   null, 1),
  ('Sales',              'Sulfatos y sulfitos',        null, 2),
  ('Sales',              'Nitratos y nitritos',        'O',  3),
  ('Sales',              'Carbonatos y bicarbonatos',  null, 4),
  ('Sales',              'Fosfatos',                   null, 5),
  ('Sales',              'Acetatos y otras orgánicas', null, 6),
  ('Sales',              'Bromuros y yoduros',         null, 7),
  ('Sales',              'Sulfuros y tiosulfatos',     null, 8),
  ('Sales',              'Cromatos y dicromatos',      'O',  9),
  ('Sales',              'Permanganatos',              'O', 10),
  ('Sales',              'Otras sales',                null, 11),
  ('Óxidos y peróxidos', 'Óxidos',                     null, 1),
  ('Óxidos y peróxidos', 'Peróxidos',                  'O',  2),
  ('Metales y no metales','Metales',                   null, 1),
  ('Metales y no metales','Metales reactivos con agua','R',  2),
  ('Metales y no metales','No metales',                null, 3),
  ('Solventes orgánicos','Alcoholes',                  null, 1),
  ('Solventes orgánicos','Cetonas y aldehídos',        null, 2),
  ('Solventes orgánicos','Hidrocarburos',              null, 3),
  ('Solventes orgánicos','Halogenados',                'T',  4),
  ('Solventes orgánicos','Éteres y ésteres',           null, 5),
  ('Otros compuestos orgánicos','Aminas y amidas',     null, 1),
  ('Otros compuestos orgánicos','Carbohidratos',       null, 2),
  ('Otros compuestos orgánicos','Aminoácidos y proteínas', null, 3),
  ('Otros compuestos orgánicos','Fenoles',             'T',  4),
  ('Soluciones preparadas','Soluciones valoradas',     null, 1),
  ('Soluciones preparadas','Buffers (tampones)',       null, 2)
) as s(padre, nombre, grupo, orden)
join familias f on f.nombre = s.padre and f.padre_id is null
on conflict do nothing;

-- Áreas académicas de ejemplo
insert into areas (nombre) values
  ('Química general'), ('Química inorgánica'), ('Química orgánica'), ('Química analítica'),
  ('Fisicoquímica'), ('Bioquímica'), ('Microbiología'), ('Física')
on conflict do nothing;

-- Ubicaciones de ejemplo
insert into ubicaciones (nombre, descripcion) values
  ('Armario de ácidos',        'Ventilado, con bandeja de derrames'),
  ('Armario de bases',         null),
  ('Gabinete de inflamables',  'Metálico, lejos del calor'),
  ('Estante de sales',         null),
  ('Armario bajo llave',       'Tóxicos y fiscalizados'),
  ('Refrigeradora',            'Medios, enzimas y reactivos sensibles'),
  ('Estante de vidrio',        null),
  ('Vitrina de equipos',       null)
on conflict do nothing;

-- Semestre de ejemplo (actívalo o cámbialo en Prácticas → Semestres)
insert into semestres (nombre, inicio, fin, activo) values ('2026-II', '2026-08-17', '2026-12-18', true)
on conflict do nothing;
