-- 100 · Corporaciones de Derecho Público (19-10-2026)
--
-- Categoría nueva en el bloque Organizaciones: directorio_entidades.categoria
-- = 'corporacion_derecho_publico'. Primera subcategoría: 'Cámara de Comercio'.
-- Queda abierta para colegios profesionales y consejos generales.
--
-- Ya aplicado en producción el 19-10-2026 con el MCP de Supabase:
--   · La Cámara de Comercio de España (antes 'camara_comercio', de la Agenda
--     de la Comunicación) pasa a la categoría nueva.
--   · 84 cámaras territoriales (Ferrol se omite: dominio caído, la gestiona
--     A Coruña) con 1.345 contactos: 804 personas y 541 buzones de
--     departamento o contactos generales (cargo 'Buzón de departamento' /
--     'Contacto general', nombre = departamento o sede).
--   · Fuente: webs oficiales de las cámaras (extracción del 19-10-2026) y
--     directorio aportado por Jorge, cruzados. fuente_fecha = 2026-10-19.
--
-- Sin cambios de esquema: directorio_pro ya recoge directorio_contactos, así
-- que los contactos entran solos en la Base de datos y en Contactos.

-- Paso 0 (solo lectura)
select categoria, count(*) from directorio_entidades
 where categoria in ('camara_comercio', 'corporacion_derecho_publico') group by 1;

-- Recategorización de la Cámara de España (idempotente)
update directorio_entidades
   set categoria = 'corporacion_derecho_publico',
       subcategoria = 'Cámara de Comercio',
       grupo = 'Cámaras de Comercio',
       orden = 0
 where categoria = 'camara_comercio'
   and organizacion = 'Cámara de Comercio de España';

-- Recargar las cámaras: desactivar o borrar por fuente_fecha y categoría e
-- importar de nuevo desde el Excel cruzado (camaras_comercio_contactos_cruzado.xlsx).
--   delete from directorio_contactos where entidad_id in (
--     select id from directorio_entidades
--      where categoria = 'corporacion_derecho_publico' and fuente_fecha = '2026-10-19');
--   delete from directorio_entidades
--    where categoria = 'corporacion_derecho_publico' and fuente_fecha = '2026-10-19';
