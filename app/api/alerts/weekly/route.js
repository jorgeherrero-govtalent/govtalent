// =====================================================================
// CORREO — resumen semanal
// app/api/alerts/weekly/route.js
//
// Se ejecuta los lunes por la mañana y va A TODOS los usuarios, sigan
// algo o no. Antes solo salía si tenías seguimientos y además se habían
// movido; con eso, quien está en Free —que no puede seguir ni tener
// alertas— no recibía nunca nada.
//
// QUÉ LLEVA, EN ESTE ORDEN:
//   1. Lo que CIERRA en los próximos siete días, de lo que sigues o de
//      tus temas. Va primero porque es lo único sobre lo que todavía se
//      puede hacer algo un lunes por la mañana.
//   2. Plazos más lejanos de lo que sigues, sin repetir lo de arriba
//   3. Lo publicado en el BOE en los últimos siete días, de tus temas
//   4. Novedades de lo que sigues
//
// El tercer bloque es la base y nunca está vacío: el BOE publica a
// diario. Los dos primeros son el extra de quien tiene seguimientos.
//
// SIGUE SIN MANDARSE SI NO HAY ABSOLUTAMENTE NADA —fin de semana largo,
// agosto cerrado—, porque un correo que dice "no ha pasado nada" es lo
// que hace que la gente se dé de baja. Pero eso ahora es raro.
//
// alert_deliveries evita mandar dos veces el mismo evento: si el proceso
// se reintenta, nadie recibe repetido.
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1        prueba sin enviar
//   ?key=<DEBUG_KEY>&user=<id>    solo a un usuario
//   ?key=<DEBUG_KEY>              envío real
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { weeklyDigestEmail } from '@/lib/email/templates';
import { conRegistro } from '@/lib/syncLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://govtalent.app';
const PRESUPUESTO_MS = 45000;

// Cuántos días atrás se miran los CAMBIOS de lo que se sigue. Una semana
// más un día de margen, por si el proceso falló el lunes anterior. El
// margen no duplica nada porque `alert_deliveries` descarta los eventos
// ya enviados.
const VENTANA_DIAS = 8;

// El BOE, en cambio, se mira a siete días exactos.
//
// No pasa por `alert_deliveries` —se filtra solo por fecha—, así que con
// la ventana de ocho y un envío cada siete, lo publicado el lunes
// anterior salía dos veces: en su correo y en el siguiente. Con el sync
// a las 8:00 y el correo a las 9:00, ese día repetido es además el más
// reciente y el más visible.
const VENTANA_BOE_DIAS = 7;

// Qué se considera "esta semana" para lo que está por vencer.
const HORIZONTE_DIAS = 7;

// Topes por bloque. El correo se lee en el móvil un lunes a las nueve:
// si hay que hacer scroll dos pantallas, no se lee.
const TOPE_ESTA_SEMANA = 5;
const TOPE_PLAZOS = 4;
const TOPE_BOE = 5;
const TOPE_BOE_SIN_TEMAS = 3;
const TOPE_NOVEDADES = 5;

// De dónde viene cada plazo, según el tipo de lo que se sigue. Antes todo lo
// que no era una ley salía como «Comisión Europea».
const FUENTE_POR_TIPO = {
  ley: 'Congreso',
  actividad: 'Congreso',
  expediente: 'Comisión Europea',
  direccion: 'Comisión Europea',
  comisario: 'Comisión Europea',
  procedimiento: 'Parlamento Europeo',
  consulta: 'Consulta pública',
};

/**
 * Si un texto toca alguna de las palabras clave del usuario.
 *
 * Palabra completa y no trozo: sin el \b, "gas" pescaría "gastos". Sin
 * palabras no hay criterio, así que devuelve false y decide quien llama
 * qué hacer con eso.
 */
function tocaTemas(texto, palabras) {
  if (!palabras || palabras.length === 0) return false;
  const t = String(texto || '').toLowerCase();
  return palabras.some((p) => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t));
}

/** Días que faltan hasta una fecha, redondeando hacia arriba. */
function diasHasta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400000));
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

async function enviar({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'GovTalent <hola@govtalent.app>',
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Resend ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

export const GET = conRegistro('/api/alerts/weekly', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;

  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const dry = sp.get('dry') === '1';
  const soloUsuario = sp.get('user');
  const supabase = admin();
  const informe = { inicio: new Date().toISOString(), dry_run: dry };

  try {
    const desde = new Date(Date.now() - VENTANA_DIAS * 86400000).toISOString();
    const desdeBoe = new Date(Date.now() - VENTANA_BOE_DIAS * 86400000).toISOString().slice(0, 10);
    const hoy = new Date().toISOString().slice(0, 10);
    const hasta = new Date(Date.now() + HORIZONTE_DIAS * 86400000).toISOString().slice(0, 10);

    // Quién sigue algo. Se agrupa en memoria porque son pocos usuarios y
    // así se evita una consulta por persona.
    let q = supabase.from('follows').select('user_id, kind, ref_id, label');
    if (soloUsuario) q = q.eq('user_id', soloUsuario);
    const { data: seguimientos, error: errF } = await q;
    if (errF) throw new Error(`No se pudieron leer los seguimientos: ${errF.message}`);

    const porUsuario = new Map();
    for (const f of seguimientos || []) {
      if (!porUsuario.has(f.user_id)) porUsuario.set(f.user_id, []);
      porUsuario.get(f.user_id).push(f);
    }

    informe.usuarios_con_seguimiento = porUsuario.size;

    // El destinatario ya no es "quien sigue algo" sino todo el mundo: el
    // bloque del BOE se envía sigas o no, que es lo que hace que un
    // usuario Free reciba algo.
    let qu = supabase
      .from('users')
      .select('id, email, first_name')
      .not('email', 'is', null);
    if (soloUsuario) qu = qu.eq('id', soloUsuario);
    const { data: todosLosUsuarios, error: errU } = await qu;
    if (errU) throw new Error(`No se pudieron leer los usuarios: ${errU.message}`);

    // Los eventos de la ventana, de todo lo seguido
    // Se pide por tandas: con cientos de seguimientos, una sola lista en
    // la URL supera el límite de longitud y la consulta entera falla.
    const refs = [...new Set((seguimientos || []).map((f) => f.ref_id))];
    const eventos = [];
    for (let i = 0; i < refs.length; i += 100) {
      const { data, error: errE } = await supabase
        .from('follow_events')
        .select('id, kind, ref_id, event_type, title, detail, occurred_at')
        .gte('occurred_at', desde)
        .in('ref_id', refs.slice(i, i + 100))
        .order('occurred_at', { ascending: false });
      if (errE) throw new Error(`No se pudieron leer los eventos: ${errE.message}`);
      eventos.push(...(data || []));
    }

    // Lo publicado en el BOE durante la ventana. Se pide una vez para
    // todos y luego se filtra por los temas de cada uno.
    const { data: boeSemana } = await supabase
      .from('boe_directory')
      .select('id, slug, titulo, departamento, rango, sector, sectores, seccion, fecha_publicacion')
      .gte('fecha_publicacion', desdeBoe)
      // Solo I y III: disposiciones generales y otras disposiciones. La
      // II son nombramientos y ceses, que ocupan sitio en un resumen
      // semanal sin afectar a casi nadie.
      .in('seccion', ['1', '3'])
      .order('fecha_publicacion', { ascending: false })
      .limit(200);

    // Lo que cierra en los próximos siete días, de las cinco fuentes.
    //
    // Sale de `regulatorio_search`, que es la vista que ya unifica
    // Congreso, Comisión Europea, Parlamento Europeo, consultas y BOE con
    // un `plazo` y una `ruta` por fila. Se pide una vez para todos y
    // luego se reparte por usuario, igual que el BOE.
    //
    // NO SE FILTRA POR `activo` a propósito. Ese filtro es durísimo —de
    // 4.116 expedientes solo cinco lo cumplen, según sql/49— y aquí
    // sobra: tener plazo entre hoy y dentro de siete días ya es la
    // definición de estar vivo.
    const { data: venceSemana } = await supabase
      .from('regulatorio_search')
      .select('kind, ref_id, titulo, fuente, ruta, plazo')
      .not('plazo', 'is', null)
      .gte('plazo', hoy)
      .lte('plazo', hasta)
      .order('plazo', { ascending: true })
      .limit(300);

    // Los temas de cada usuario, con sus palabras clave: es lo que
    // decide qué parte del BOE le toca.
    const { data: temasUsuario } = await supabase
      .from('user_topics')
      .select('user_id, topics(id, label, keywords)');

    const temasDe = new Map();
    for (const t of temasUsuario || []) {
      if (!t.topics) continue;
      if (!temasDe.has(t.user_id)) temasDe.set(t.user_id, []);
      temasDe.get(t.user_id).push(t.topics);
    }

    // Lo ya enviado, para no repetir
    const { data: enviados } = await supabase
      .from('alert_deliveries')
      .select('user_id, event_id')
      .gte('sent_at', desde);
    const yaEnviado = new Set((enviados || []).map((d) => `${d.user_id}|${d.event_id}`));

    // Las preferencias: quien haya dicho que no, no recibe
    // Se leen todas las columnas: la pantalla de Avisos guarda `semanal`,
    // `diario` y `email`. Pedir una columna que no existe hacía fallar la
    // consulta en silencio y se enviaba también a quien se había dado de baja.
    const { data: prefs, error: errP } = await supabase.from('alert_preferences').select('*');
    if (errP) throw new Error(`No se pudieron leer las preferencias: ${errP.message}`);
    const prefDe = new Map((prefs || []).map((p) => [p.user_id, p]));


    const resultados = [];
    let enviadosOk = 0;
    let sinNada = 0;
    const entregas = [];

    for (const u of todosLosUsuarios || []) {
      if (Date.now() - t0 > PRESUPUESTO_MS) {
        informe.cortado_por_tiempo = true;
        break;
      }

      const userId = u.id;
      const sigue = porUsuario.get(userId) || [];

      const pref = prefDe.get(userId);
      if (pref && (pref.email === false || pref.semanal === false)) continue;
      if (!u.email) continue;

      // Los eventos de lo que sigue esta persona, sin los ya enviados
      const claves = new Set(sigue.map((f) => `${f.kind}|${f.ref_id}`));
      const suyos = (eventos || []).filter(
        (e) => claves.has(`${e.kind}|${e.ref_id}`) && !yaEnviado.has(`${userId}|${e.id}`)
      );

      // Los plazos se separan de las novedades: son lo más urgente y van
      // primero, con su contador de días.
      const plazos = [];
      const novedades = [];
      for (const e of suyos) {
        const f = sigue.find((x) => x.kind === e.kind && x.ref_id === e.ref_id);
        const item = {
          title: f?.label || e.title,
          detail: e.detail,
          ruta: '/seguimiento',
          fuente: null,
          // Para poder cruzarlo con lo que ya sale en «cierra esta semana».
          clave: `${e.kind}|${e.ref_id}`,
        };
        if (e.event_type === 'plazo_proximo') {
          // El número de días viene en el texto: "Quedan 7 días de plazo"
          const m = String(e.detail || '').match(/(\d+)/);
          plazos.push({ ...item, dias: m ? parseInt(m[1], 10) : 0, fuente: FUENTE_POR_TIPO[e.kind] || null });
        } else {
          novedades.push(item);
        }
      }
      plazos.sort((a, b) => a.dias - b.dias);

      // El BOE de la semana, filtrado por los temas de esta persona. Si
      // no tiene temas se manda lo de secciones I y II, que es lo que
      // afecta a cualquiera del sector.
      const misTemas = temasDe.get(userId) || [];
      const palabras = misTemas.flatMap((t) => (t.keywords || []).map((k) => k.toLowerCase()));

      const publicado = (boeSemana || [])
        .filter((d) => (palabras.length === 0 ? true : tocaTemas(d.titulo, palabras)))
        .slice(0, palabras.length === 0 ? TOPE_BOE_SIN_TEMAS : TOPE_BOE)
        .map((d) => ({
          title: d.titulo,
          detail: [d.rango, d.departamento].filter(Boolean).join(' · '),
          ruta: `/boe/${d.slug}`,
          sector: d.sector || null,
        }));

      // Lo que cierra en los próximos siete días y además es suyo: o lo
      // sigue, o toca uno de sus temas. Sin ese doble filtro esto sería
      // el calendario del regulatorio entero, que no es un correo
      // personal sino un boletín.
      const cierranSuyos = (venceSemana || [])
        .filter((r) => claves.has(`${r.kind}|${r.ref_id}`) || tocaTemas(r.titulo, palabras))
        .slice(0, TOPE_ESTA_SEMANA);

      const estaSemana = cierranSuyos.map((r) => ({
        title: r.titulo,
        ruta: r.ruta || '/seguimiento',
        fuente: r.fuente || FUENTE_POR_TIPO[r.kind] || null,
        dias: diasHasta(r.plazo),
      }));

      // Lo que ya sale arriba no se repite abajo. El bloque de plazos se
      // queda con lo que vence más allá de esta semana, que es lo que
      // justifica que sean dos bloques y no uno.
      const yaArriba = new Set(cierranSuyos.map((r) => `${r.kind}|${r.ref_id}`));
      const plazosRestantes = plazos.filter((x) => !yaArriba.has(x.clave));

      // Solo se salta a quien no tiene absolutamente nada. Con el BOE
      // publicando a diario, eso es raro.
      if (
        estaSemana.length === 0 &&
        plazosRestantes.length === 0 &&
        novedades.length === 0 &&
        publicado.length === 0
      ) {
        sinNada += 1;
        continue;
      }

      const { subject, html } = weeklyDigestEmail({
        firstName: u.first_name || '',
        estaSemana,
        novedades: novedades.slice(0, TOPE_NOVEDADES),
        plazos: plazosRestantes.slice(0, TOPE_PLAZOS),
        publicado,
        totalSeguidos: sigue.length,
        sinTemas: palabras.length === 0,
        unsubscribeUrl: `${SITE_URL}/seguimiento?ajustes=1`,
      });

      resultados.push({
        user_id: userId,
        email: u.email,
        subject,
        esta_semana: estaSemana.length,
        plazos: plazosRestantes.length,
        novedades: novedades.length,
        publicado: publicado.length,
        sin_temas: palabras.length === 0,
      });

      if (!dry) {
        try {
          await enviar({ to: u.email, subject, html });
          enviadosOk += 1;
          for (const e of suyos) entregas.push({ user_id: userId, event_id: e.id, channel: 'email' });
        } catch (err) {
          resultados[resultados.length - 1].error = err.message;
        }
      }
    }

    informe.eventos_en_ventana = (eventos || []).length;
    informe.usuarios_totales = (todosLosUsuarios || []).length;
    informe.boe_en_ventana = (boeSemana || []).length;
    informe.destinatarios = resultados.length;
    informe.sin_nada = sinNada;

    if (dry) {
      informe.muestra = resultados.slice(0, 5);
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    // Se anota lo entregado después de enviar: si el envío falla, no se
    // marca y se reintentará la semana siguiente.
    if (entregas.length > 0) {
      const { error } = await supabase
        .from('alert_deliveries')
        .upsert(entregas, { onConflict: 'user_id,event_id,channel' });
      if (error) informe.error_registro = error.message;
    }

    informe.enviados = enviadosOk;
    informe.fallidos = resultados.filter((r) => r.error).length;
    informe.detalle_fallos = resultados.filter((r) => r.error).slice(0, 3);
    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}
