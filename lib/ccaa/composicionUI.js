'use client';

// =====================================================================
// PARLAMENTOS AUTONÓMICOS — composición para las pantallas
// lib/ccaa/composicionUI.js
//
// Las pantallas de la Asamblea de Madrid (y de los parlamentos que se
// sumen) copian las del Congreso: Comisiones, Diputados, Órganos de
// gobierno y Grupos parlamentarios. Las cuatro leen lo mismo —grupos,
// diputados, comisiones y cargos vigentes de sql/91—, así que se pide
// una vez y se guarda mientras dura la visita: saltar de pestaña no
// vuelve a consultar.
//
// `email` NO se pide nunca desde aquí: la columna está cerrada a los
// roles del navegador (sql/91) y el correo llega solo por
// /api/parlamentos-autonomicos/diputados/contacto, con plan.
// =====================================================================

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export { PARLAMENTOS_UI, parlamentoPorNombre } from '@/lib/ccaa/parlamentosUI';
import { PARLAMENTOS_UI } from '@/lib/ccaa/parlamentosUI';

export const base = (p) => `/institutions/parlamentos/${p}`;

// Mismos colores que el Congreso para los mismos partidos; el de la web
// del parlamento solo si el grupo no está aquí.
const COLORES = { PP: '#378ADD', PSOE: '#E24B4A', VOX: '#639922', 'Más Madrid': '#1D9E75', Mixto: '#888780' };
export function colorGrupo(g) {
  if (!g) return '#888780';
  return COLORES[g.sigla] || g.color || '#888780';
}

/** «Grupo Parlamentario Más Madrid» → «Más Madrid». */
export function grupoCorto(g) {
  if (!g) return '';
  return (g.nombre || '').replace(/^Grupo Parlamentario\s*/i, '') || g.sigla || '';
}

// Peso del cargo: el orden en que alguien de asuntos públicos busca a un
// diputado (mismo criterio que el Congreso).
const PESO = { presidencia: 1, vicepresidencia: 2, secretaria: 3, portavoz: 4, portavoz_adjunto: 5, vocal: 6, titular: 6, suplente: 7 };
export const pesoCargo = (n) => PESO[n] || 9;
const ETIQUETA = { presidencia: 'Presidencia', vicepresidencia: 'Vicepresidencia', secretaria: 'Secretaría', portavoz: 'Portavocía' };
export const etiquetaCargo = (n) => ETIQUETA[n] || null;

/** Comisión de la cámara (no órgano de gobierno ni cargo fuera de ella: Consejería, Senado, consejos). */
export const esComision = (c) => ['permanente', 'estudio', 'investigacion'].includes(c?.tipo);

export const TIPOS_COMISION = {
  permanente: 'Permanente',
  estudio: 'De estudio',
  investigacion: 'De investigación',
  organo: 'Órgano de gobierno',
  otro: 'Otra',
};

/** «Comisión de Sanidad» → «Sanidad». */
export function limpiarComision(n) {
  return (n || '')
    .replace(/^Comisi[oó]n\s+(?:(?:de|del|para|sobre)\s+(?:el|la|los|las)\s+|(?:de|del|para|sobre)\s+)?/i, '')
    .trim() || n;
}

export function normalizar(t) {
  return (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function fechaCorta(iso) {
  if (!iso) return null;
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return d ? `${d}/${m}/${a}` : null;
}

// «Vicepresidenta Primera» antes que «Vicepresidente Tercero», no por apellido.
const ordinal = (cargo) => {
  const m = String(cargo || '').match(/(primer|segund|tercer|cuart|quint)/i);
  return m ? ['primer', 'segund', 'tercer', 'cuart', 'quint'].indexOf(m[1].toLowerCase()) : 9;
};

const cache = new Map();

async function todas(supabase, tabla, cols, filtros) {
  const TAM = 1000;
  const out = [];
  for (let desde = 0; ; desde += TAM) {
    let q = supabase.from(tabla).select(cols).range(desde, desde + TAM - 1);
    q = filtros(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < TAM) break;
  }
  return out;
}

async function cargar(p) {
  const supabase = createClient();
  const [grupos, diputados, comisiones, cargos] = await Promise.all([
    todas(supabase, 'ccaa_grupos', 'id, nombre, sigla, slug, n_diputados, color, logo_url, fecha_constitucion, id_fuente, url', (q) =>
      q.eq('parlamento', p).eq('activo', true).order('n_diputados', { ascending: false })
    ),
    todas(
      supabase,
      'ccaa_diputados',
      'id, nombre, apellidos_nombre, slug, grupo_id, sexo, circunscripcion, foto_url, url_ficha, twitter, datos, id_fuente, fecha_alta, fuente_fecha, ficha_leida_at',
      (q) => q.eq('parlamento', p).eq('activo', true).order('apellidos_nombre')
    ),
    todas(supabase, 'ccaa_comisiones', 'id, nombre, tipo, slug, url', (q) => q.eq('parlamento', p).eq('activo', true).order('nombre')),
    todas(
      supabase,
      'ccaa_cargos',
      'id, nombre, diputado_id, grupo_id, comision_id, organo, cargo, cargo_norm, fecha_inicio, fuente',
      (q) => q.eq('parlamento', p).eq('activo', true).order('id')
    ),
  ]);

  const grupoPorId = Object.fromEntries(grupos.map((g) => [g.id, g]));
  const diputadoPorId = Object.fromEntries(diputados.map((d) => [d.id, d]));
  const comisionPorId = Object.fromEntries(comisiones.map((c) => [c.id, c]));

  // Cargos de diputados en comisiones y órganos, por diputado y por órgano.
  const porDiputado = {};
  const porComision = {};
  const delGrupo = {}; // portavocías del grupo en el Pleno (organo «Grupo Parlamentario …»)
  const tecnicos = {};
  for (const c of cargos) {
    if (!c.diputado_id) {
      if (c.grupo_id) (tecnicos[c.grupo_id] ||= []).push(c);
      continue;
    }
    if (!diputadoPorId[c.diputado_id]) continue;
    if (c.comision_id) {
      (porDiputado[c.diputado_id] ||= []).push(c);
      (porComision[c.comision_id] ||= []).push(c);
    } else if (c.grupo_id) {
      (delGrupo[c.grupo_id] ||= []).push(c);
    }
  }
  for (const l of Object.values(porComision)) {
    l.sort((a, b) => pesoCargo(a.cargo_norm) - pesoCargo(b.cargo_norm) || ordinal(a.cargo) - ordinal(b.cargo) || (diputadoPorId[a.diputado_id]?.apellidos_nombre || '').localeCompare(diputadoPorId[b.diputado_id]?.apellidos_nombre || ''));
  }
  for (const l of Object.values(porDiputado)) {
    l.sort((a, b) => pesoCargo(a.cargo_norm) - pesoCargo(b.cargo_norm) || (comisionPorId[a.comision_id]?.nombre || '').localeCompare(comisionPorId[b.comision_id]?.nombre || ''));
  }
  for (const l of Object.values(tecnicos)) l.sort((a, b) => a.nombre.localeCompare(b.nombre));

  return { grupos, diputados, comisiones, cargos, grupoPorId, diputadoPorId, comisionPorId, porDiputado, porComision, delGrupo, tecnicos };
}

/**
 * const { datos, error } = useComposicion('madrid');
 * datos === null mientras carga.
 */
export function useComposicion(p) {
  const [estado, setEstado] = useState(() => ({ datos: cache.get(p)?.datos || null, error: null }));
  useEffect(() => {
    if (!PARLAMENTOS_UI[p]) return;
    let vivo = true;
    let entrada = cache.get(p);
    if (!entrada || entrada.error) {
      entrada = { promesa: cargar(p) };
      cache.set(p, entrada);
      entrada.promesa.then((d) => { entrada.datos = d; }).catch((e) => { entrada.error = e; });
    }
    entrada.promesa
      .then((d) => vivo && setEstado({ datos: d, error: null }))
      .catch((e) => vivo && setEstado({ datos: null, error: e }));
    return () => {
      vivo = false;
    };
  }, [p]);
  return estado;
}
