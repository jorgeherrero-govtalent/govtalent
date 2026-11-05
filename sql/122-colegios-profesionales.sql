-- 122-colegios-profesionales.sql
-- Corporaciones de Derecho Público: consejos generales y colegios profesionales
-- de ámbito nacional. Primera tanda: 31 entidades de Unión Profesional.
-- Presidencias comprobadas el 05-11-2026 en webs oficiales, BOE y prensa del sector.
--
-- Aplicado en producción el 05-11-2026 con el MCP de Supabase.

-- ============================================================
-- PASO 0 (solo lectura): no debe devolver filas
-- ============================================================
-- select id, organizacion, categoria
-- from directorio_entidades
-- where organizacion in (select organizacion from _cp_carga);

begin;

create temp table _cp_carga (
  orden        int,
  organizacion text,
  subcategoria text,   -- 'Consejo General' | 'Colegio profesional'
  sector       text,   -- se guarda en grupo
  web          text,
  email        text,
  telefono     text,
  direccion    text,
  persona      text,
  cargo        text,
  verificado   boolean
) on commit drop;

insert into _cp_carga values
 (1,'Consejo General de la Abogacía Española','Consejo General','Jurídico','https://www.abogacia.es','informacion@abogacia.es','91 523 25 93','Paseo de Recoletos, 13, 28004 Madrid','Salvador González Martín','Presidente',true),
 (2,'Consejo General de Colegios de Administradores de Fincas','Consejo General','Jurídico','https://www.cgcafe.org','secretaria@cgcafe.org','91 575 73 69','Plaza Marqués de Salamanca, 10, 3º izda., 28006 Madrid','Pablo Abascal González','Presidente',true),
 (3,'Consejo General de Colegios Oficiales de Graduados Sociales','Consejo General','Jurídico','https://www.graduadosocial.com','info@graduadosocial.com','91 445 52 14 / 91 445 62 36','C/ Rafael Calvo, 7, bajo, 28010 Madrid','Joaquín Merchán Bermejo','Presidente',false),
 (4,'Consejo General del Notariado','Consejo General','Jurídico','https://www.notariado.org','prensa@notariado.org','91 308 72 32','Paseo del General Martínez Campos, 46, 6ª planta, 28010 Madrid','Concepción Pilar Barrio del Olmo','Presidenta',true),
 (5,'Consejo General de Procuradores de España','Consejo General','Jurídico','https://www.cgpe.es','cgpe@cgpe.es','91 319 68 48','C/ Bárbara de Braganza, 6, 28004 Madrid','Alberto García Barrenechea','Presidente',true),
 (6,'Colegio de Registradores de la Propiedad, Mercantiles y de Bienes Muebles de España','Colegio profesional','Jurídico','https://www.registradores.org','contacto@registradores.org','91 270 16 99','C/ Príncipe de Vergara, 70, 28006 Madrid','María Rosario Jiménez Rubio','Decana',true),
 (7,'Consejo General de Economistas de España','Consejo General','Economía','https://www.economistas.org','consejogeneral@economistas.org','91 432 26 70','C/ Claudio Coello, 18, 28001 Madrid','Miguel Ángel Vázquez Taín','Presidente',true),
 (8,'Instituto de Actuarios Españoles','Colegio profesional','Economía','https://www.actuarios.org','iae@actuarios.org','91 457 86 96','C/ Víctor Andrés Belaúnde, 36, 28016 Madrid','Fernando Ariza Rodríguez','Presidente',true),
 (9,'Consejo General de Colegios Oficiales de Médicos','Consejo General','Sanitario','https://www.cgcom.es','prensa@cgcom.es','91 431 77 80','Plaza de las Cortes, 11, 28014 Madrid','Tomás Cobo Castro','Presidente',true),
 (10,'Consejo General de Enfermería','Consejo General','Sanitario','https://www.consejogeneralenfermeria.org','comunicacion@consejogeneralenfermeria.org','91 334 55 20','C/ Sierra de Pajarejo, 13, 28023 Madrid','Florentino Pérez Raya','Presidente',true),
 (11,'Consejo General de Colegios Oficiales de Farmacéuticos','Consejo General','Sanitario','https://www.farmaceuticos.com','congral@redfarma.org','91 431 25 60','C/ Villanueva, 11, 7ª planta, 28001 Madrid','Jesús Aguilar Santamaría','Presidente',true),
 (12,'Consejo General de Dentistas de España','Consejo General','Sanitario','https://www.consejodentistas.es','info@consejodentistas.es','91 426 44 10','C/ Alcalá, 79, 2º, 28009 Madrid','Óscar Castro Reino','Presidente',true),
 (13,'Consejo General de Colegios de Veterinarios de España','Consejo General','Sanitario','https://www.colvet.es','consejo@colvet.es','91 435 35 35 / 91 576 20 78','C/ Villanueva, 11, 5º, 28001 Madrid','Gonzalo Moreno del Val','Presidente',true),
 (14,'Consejo General de la Psicología de España','Consejo General','Sanitario','https://www.cop.es','secop@cop.es','91 444 90 20','C/ Conde de Peñalver, 45, 5ª planta, 28006 Madrid','Francisco Santolaya Ochando','Presidente',true),
 (15,'Consejo General de Colegios de Fisioterapeutas de España','Consejo General','Sanitario','https://www.consejo-fisioterapia.org','secretaria.presidencia@consejo-fisioterapia.org','91 345 72 76','C/ Conde de Peñalver, 38, 2º, 28006 Madrid','Gustavo Paseiro Ares','Presidente',true),
 (16,'Consejo General de Colegios de Ópticos-Optometristas','Consejo General','Sanitario','https://www.cgcoo.es','administracion@cnoo.es','91 541 44 03 / 91 541 44 04','C/ Princesa, 25, 4º, Edificio Hexágono, 28008 Madrid','Andrés Gené Sampedro','Presidente',true),
 (17,'Consejo General de Colegios de Logopedas','Consejo General','Sanitario','https://www.consejologopedas.com','info@consejologopedas.com','93 487 83 93','C/ Pamplona, 45, 28039 Madrid','Carolina Vittar','Presidenta',true),
 (18,'Consejo General de Colegios de Terapeutas Ocupacionales','Consejo General','Sanitario','https://consejoterapiaocupacional.org','info@consejoterapiaocupacional.org','692 151 037','C/ Rosalía de Castro, 19, 50018 Zaragoza','Inmaculada Íñiguez Muñoz','Presidenta',true),
 (19,'Consejo General de Colegios Oficiales de Educadoras y Educadores Sociales','Consejo General','Social','https://www.consejoeducacionsocial.net','consejo@consejoeducacionsocial.net','661 306 517','C/ Augusto Figueroa, 17, 1º D, 28004 Madrid','Flor González Muñiz','Presidenta',true),
 (20,'Consejo General de Colegios Profesionales de la Educación Física y el Deporte (Consejo COLEF)','Consejo General','Social','https://www.consejo-colef.es','consejo@consejo-colef.es','91 501 05 99','C/ Aviador Zorita, 55, 28020 Madrid','Vicente Gambau i Pinasa','Presidente',true),
 (21,'Consejo General de Colegios Oficiales de Biólogos','Consejo General','Científico','https://cgcob.es','cgcob@cgcob.es',null,'C/ Santa Engracia, 108, 2º int. izda., 28003 Madrid','Jorge Abad García','Presidente',false),
 (22,'Ilustre Colegio Oficial de Geólogos','Colegio profesional','Científico','https://www.icog.es','icog@icog.es','91 553 24 03','C/ Raquel Meller, 7, 28027 Madrid','Nieves Sánchez Guitián','Presidenta',false),
 (23,'Consejo General de la Arquitectura Técnica de España','Consejo General','Arquitectura','https://www.arquitectura-tecnica.org','consejo@arquitectura-tecnica.com','91 570 15 35 / 91 570 55 88 / 91 571 05 16','Paseo de la Castellana, 155, 1º, 28046 Madrid','Alfredo Sanz Corma','Presidente',true),
 (24,'Consejo General de la Ingeniería Técnica Industrial de España (COGITI)','Consejo General','Ingeniería','https://www.cogiti.es','cogiti@cogiti.es','91 554 18 06 / 91 554 18 09','Avda. de Pablo Iglesias, 2, 28003 Madrid','José Antonio Galdón Ruiz','Presidente',true),
 (25,'Consejo General de Colegios Oficiales de Ingenieros Técnicos Agrícolas de España','Consejo General','Ingeniería','https://www.agricolas.org','consejogeneral@agricolas.org','91 315 91 91 / 91 323 28 28','C/ Guzmán el Bueno, 104, bajo, 28003 Madrid','Carlos Gutiérrez Alameda','Presidente',true),
 (26,'Consejo Superior de Colegios de Ingenieros Técnicos de Minas','Consejo General','Ingeniería','https://www.consejominas.org','consejominas@consejominas.com','91 402 50 25','C/ Don Ramón de la Cruz, 88, 28006 Madrid','José Luis Leandro Rodríguez','Presidente',false),
 (27,'Colegio de Ingenieros Técnicos de Obras Públicas e Ingenieros Civiles (CITOP)','Colegio profesional','Ingeniería','https://www.citop.es','consejo@citop.es','91 451 69 20','C/ José Abascal, 20, 1º, 28003 Madrid','Manuel Camacho Piñera','Presidente',true),
 (28,'Colegio Oficial de Ingenieros Técnicos de Telecomunicación (COITT)','Colegio profesional','Ingeniería','https://www.coitt.es','recepcion@coitt.es','91 536 37 87','C/ General Moscardó, 33, 28020 Madrid','Luis Miguel Chapinal','Decano',true),
 (29,'Colegio Oficial de Ingeniería Geomática y Topográfica (COIGT)','Colegio profesional','Ingeniería','https://www.coigt.com','coigt@coigt.com','91 553 89 65','Avda. de la Reina Victoria, 66, 2º C, 28003 Madrid','Andrés Díez Galilea','Decano',true),
 (30,'Colegio Oficial de Ingenieros Técnicos Forestales y Graduados en Ingeniería Forestal y del Medio Natural','Colegio profesional','Ingeniería','https://www.forestales.net','forestales@forestales.net','91 501 35 79','Avda. Menéndez Pelayo, 75, bajo izda., 28007 Madrid','Ana Belén Noriega Bravo','Decana-presidenta',true),
 (31,'Colegio Oficial de Ingenieros Técnicos Aeronáuticos','Colegio profesional','Ingeniería','https://aeronauticos.org','secretaria@aeronauticos.org','91 522 06 04','Calle de Hortaleza, 61, 28004 Madrid','David Sedano Abad','Presidente',false);

-- 1) Entidades (ámbito estatal: ccaa null, como la Cámara de España)
insert into directorio_entidades
  (organizacion, categoria, subcategoria, grupo, ccaa, web, email_general, telefono, direccion, fuente, fuente_fecha, orden, activo)
select organizacion, 'corporacion_derecho_publico', subcategoria, 'Colegios profesionales', null,
       web, email, telefono, direccion,
       'Unión Profesional (fichas de asociados), cargos comprobados en webs oficiales, BOE y prensa del sector',
       date '2026-11-05', 100 + orden, true
from _cp_carga;

-- 2) Presidencias comprobadas (26)
insert into directorio_contactos (entidad_id, nombre, nombre_original, cargo, email, telefono, direccion, orden, activo, fuente, fuente_fecha)
select e.id, c.persona, c.persona, c.cargo, null, null, c.direccion, 1, true,
       'Comprobado en web oficial, BOE o prensa del sector', date '2026-11-05'
from _cp_carga c
join directorio_entidades e
  on e.organizacion = c.organizacion and e.categoria = 'corporacion_derecho_publico'
where c.verificado;

-- 2b) Presidencias SIN comprobar (5): Biólogos, Geólogos, Graduados Sociales,
--     Minas, Aeronáuticos. Cargadas por decisión de Jorge (05-11-2026).
insert into directorio_contactos (entidad_id, nombre, nombre_original, cargo, direccion, orden, activo, fuente, fuente_fecha)
select e.id, c.persona, c.persona, c.cargo, c.direccion, 1, true,
       'Unión Profesional, sin comprobar', date '2026-11-05'
from _cp_carga c
join directorio_entidades e on e.organizacion = c.organizacion and e.categoria = 'corporacion_derecho_publico'
where not c.verificado;

-- 3) Buzón general de cada entidad (31)
insert into directorio_contactos (entidad_id, nombre, nombre_original, cargo, email, telefono, direccion, orden, activo, fuente, fuente_fecha)
select e.id, 'Sede central', null, 'Contacto general', c.email, c.telefono, c.direccion, 2, true,
       'Unión Profesional (fichas de asociados)', date '2026-11-05'
from _cp_carga c
join directorio_entidades e
  on e.organizacion = c.organizacion and e.categoria = 'corporacion_derecho_publico';

-- Comprobación: 31 entidades, 31 + 31 contactos
select count(*) filter (where cargo <> 'Contacto general') personas,
       count(*) filter (where cargo = 'Contacto general')  buzones
from directorio_contactos c
join directorio_entidades e on e.id = c.entidad_id
where e.grupo = 'Colegios profesionales';

commit;
