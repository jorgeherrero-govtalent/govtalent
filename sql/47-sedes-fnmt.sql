-- 47-sedes-fnmt.sql
-- Cultura, Inclusion y Juventud vuelven a la rotacion.
--
-- No nos bloqueaban: sus sedes tienen certificado valido de FNMT pero no
-- envian el intermedio en el saludo TLS, y Node abortaba la conexion.
-- Eso se arregla en codigo (lib/fetchGob.js). Aqui solo queda apuntar a
-- las paginas buenas y limpiar el contador de fallos.
--
-- IMPORTANTE: las tres acumulan 3 intentos fallidos, y la consulta del
-- sync filtra por intentos_fallidos < 3. Estan FUERA de la cola aunque
-- figuren como activas, y sin poner ese contador a cero no volveran a
-- intentarse jamas por muy arreglado que este el certificado.
--
-- URLs facilitadas por Jorge el 18/09/2026, no verificadas desde aqui
-- por el mismo motivo del certificado: hasta que el codigo no este
-- desplegado no se pueden leer.


-- =====================================================================
-- PASO 0 — COMPROBACION PREVIA (solo lectura)
-- =====================================================================

select id, ministerio, tipo, modo, activo, intentos_fallidos,
       left(ultimo_error, 40) as nota, url
from consulta_fuentes
where ministerio in ('Ministerio de Cultura',
                     'Ministerio de Inclusión, Seguridad Social y Migraciones',
                     'Ministerio de Juventud e Infancia')
order by ministerio, id;


-- =====================================================================
-- PASO 1 — REAPUNTAR Y DEVOLVER A LA COLA
--
-- ultima_captura a null para que entren las primeras. ultimo_hash a null
-- porque el guardado, si lo hay, no es de estas paginas. Y sobre todo
-- intentos_fallidos a cero, que es lo que las saca de la cuarentena.
-- =====================================================================

update consulta_fuentes
set url = 'https://www.cultura.gob.es/servicios-a-la-ciudadania/informacion-publica.html',
    ultima_captura = null, ultimo_hash = null, ultimo_error = null, intentos_fallidos = 0
where ministerio = 'Ministerio de Cultura' and activo;

update consulta_fuentes
set url = 'https://www.juventudeinfancia.gob.es/es/participacion-publica/consultas-publicas',
    tipo = 'consulta_previa',
    ultima_captura = null, ultimo_hash = null, ultimo_error = null, intentos_fallidos = 0
where ministerio = 'Ministerio de Juventud e Infancia' and activo;

-- Inclusion publica los dos tramites en la misma aplicacion, separados
-- por parametro. Se asume tramite=1 audiencia y tramite=2 consulta
-- previa, que es como lo hace Trabajo en la plataforma equivalente; da
-- igual si esta cambiado, porque la extraccion reclasifica cada tramite
-- por lo que dice el mismo y el tipo de la fuente solo es el defecto.
update consulta_fuentes
set url = 'https://participacion.inclusion.gob.es/participacion/participa?tramite=1',
    tipo = 'audiencia_publica',
    ultima_captura = null, ultimo_hash = null, ultimo_error = null, intentos_fallidos = 0
where url = 'https://participacion.inclusion.gob.es/participacion/';


-- =====================================================================
-- PASO 2 — LA SEGUNDA FUENTE DE INCLUSION
-- =====================================================================

insert into consulta_fuentes (ministerio, tipo, modo, url, prioridad) values
  ('Ministerio de Inclusión, Seguridad Social y Migraciones', 'consulta_previa', 'listado',
   'https://participacion.inclusion.gob.es/participacion/participa?tramite=2', 5)
on conflict (url) do nothing;


-- =====================================================================
-- PASO 3 — COMPROBACION
-- =====================================================================

-- select id, ministerio, tipo, activo, intentos_fallidos, ultima_captura, url
-- from consulta_fuentes
-- where ministerio in ('Ministerio de Cultura',
--                      'Ministerio de Inclusión, Seguridad Social y Migraciones',
--                      'Ministerio de Juventud e Infancia')
-- order by ministerio, id;

-- 3.2 Cuantas fuentes hay en cuarentena en total. Deberia quedar en cero.
-- select count(*) from consulta_fuentes where activo and intentos_fallidos >= 3;
