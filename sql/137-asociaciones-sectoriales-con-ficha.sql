-- 137. Asociaciones sectoriales con ficha, como las patronales (19-11-2026)
--
-- Aplicado en producción el 19-11-2026 con cargas por lotes desde el Excel de
-- contactos de Jorge (contacts_3.xlsx) y la tabla organizations; aquí queda
-- el modelo y las comprobaciones, no los datos.
--
-- Regla de Jorge: un contacto tiene que estar a la vez en la ficha de su
-- organización y en la Base de datos. Las asociaciones sectoriales salían de
-- organizations (org_type = 'asociacion_profesional'), sin ficha ni
-- contactos, así que sus contactos no podían cumplirla.
--
-- Modelo (el mismo que las Corporaciones de Derecho Público, sql/100):
--   - Patronales y asociaciones comparten categoria = 'patronal' en
--     directorio_entidades; cada pestaña filtra por grupo:
--       'Patronales'                 las 26 de la Agenda de la Comunicación
--       'Asociaciones sectoriales'   las asociaciones (orden 3001 en adelante)
--   - subcategoria = sector (etiqueta de lib/orgTaxonomy.js), para el filtro
--     «Sector» de la pestaña.
--   - Los contactos van en directorio_contactos, así que entran solos en
--     directorio_pro (Base de datos) con tipo 'agentes sociales'.
--
-- Carga:
--   - 541 asociaciones creadas desde organizations, sin duplicados (misma
--     web, mismas siglas o mismo nombre), sin las que ya tenían ficha en otra
--     sección (patronales, consejos generales, Cámara de Madrid, FIAP) y sin
--     filas que no son asociaciones (una persona, un correo como nombre, una
--     empresa); 7 fusionadas después; quedan 534 activas.
--   - Las webs que eran la ficha de la asociación en ceoe.es quedan vacías:
--     no son su web.
--   - 388 contactos del Excel (fuente 'Aportado por Jorge Herrero
--     (19-11-2026)'), 351 en asociaciones y 37 en fichas que ya existían
--     (CEOE, CEPYME, AEB, CEAJE, AESMIDE, Multinacionales, Abogacía,
--     Dentistas, Farmacéuticos, COGITI). Descartados los que tenían correo de
--     otra empresa sin cargo en la asociación, los de la FIAP brasileña y los
--     buzones con nombre de organización.

update directorio_entidades set grupo = 'Patronales'
where categoria = 'patronal' and grupo is null;

-- Comprobaciones
select grupo, count(*) filter (where activo) as activas
from directorio_entidades where categoria = 'patronal' group by grupo;

select count(*) as contactos_cargados
from directorio_contactos where fuente = 'Aportado por Jorge Herrero (19-11-2026)' and activo;
