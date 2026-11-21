// =====================================================================
// AGENDA DEL GOVERN DE CATALUNYA
// lib/agendaCcaa/cataluna.js
//
// govern.cat (Sala de premsa › Agenda del Govern) pinta la agenda en el
// navegador a partir de una API JSON:
//   https://govern.cat/salapremsa/api/v1/agenda-govern?day=AAAA-MM-DDT12:00:00.000Z
// que devuelve { actes: [...], previous, next } de ese día. Publica con
// varios días de antelación (el viernes ya está el lunes).
//
// El robots.txt de govern.cat excluye /salapremsa/api/. Jorge decidió
// usarla igualmente (21-11-2026): son los datos públicos de la sala de
// prensa y la copia en datos abiertos («Actes del Govern», wf87-e34n) solo
// trae días pasados. Se lee como GovTalentBot, identificados, para que el
// Govern pueda pedirnos que paremos.
//
// Cada acto (acte) trae:
//   titol, descripcio (HTML)
//   acteGovern.data          «2026-11-20T10:00:00.000», hora LOCAL del
//                            lugar del acto (en Oporto, la de Portugal;
//                            el titular suele añadir «(11.30 hora catalana)»)
//   acteGovern.autoritat     1 president, 3 consellers, 4 y 6 otros altos
//                            cargos del departamento, 5 delegacions
//   acteGovern.propietari    { nom: departamento, titular: su conseller }
//   acteGovern.municipi, adreca, territori.nom
//   subactesGovern           los actos de una jornada larga (una visita,
//                            una asamblea): se suman al texto
// =====================================================================

import { textoPlano, horaNormal, personaDeTexto, fila } from './comun';
import { HEADERS_BOT } from '@/lib/govtalentBot';

export const BASE = 'https://govern.cat/salapremsa';
export const URL_AGENDA = `${BASE}/agenda-govern`;
export const urlApi = (fecha) => `${BASE}/api/v1/agenda-govern?day=${fecha}T12:00:00.000Z`;
export const HEADERS = { ...HEADERS_BOT, Accept: 'application/json' };

const NIVEL_DE_AUTORITAT = { 1: 'presidente', 3: 'consejero', 4: 'alto_cargo', 5: 'delegacion', 6: 'alto_cargo' };

/** Los actos de un día, a partir del JSON de la API. */
export function actosCataluna(json, fecha) {
  const lista = Array.isArray(json?.actes) ? json.actes : [];
  const actos = [];
  for (const a of lista) {
    const g = a.acteGovern || {};
    const dia = String(g.data || a.data || '').slice(0, 10);
    if (dia !== fecha) continue;
    const hora = /T00:00:00/.test(String(g.data || '')) ? null : horaNormal(String(g.data || '').slice(11, 16));
    const descripcio = textoPlano(a.descripcio);
    // La primera frase de la descripción dice quién va; las notas de
    // acreditación y de emisión en directo no aportan.
    const texto = descripcio.split(/\s*(?:Nota:|L'acte es podrà seguir)/)[0].trim();
    const subactes = (a.subactesGovern || [])
      .map((s) => `${horaNormal(String(s.data || '').slice(11, 16)) || ''} ${textoPlano(s.titol)}`.trim())
      .filter(Boolean);
    const lugar = [g.adreca, g.municipi, g.territori?.nom && g.territori.nom !== g.municipi ? g.territori.nom : null]
      .filter(Boolean)
      .map((x) => textoPlano(x))
      .join(', ');
    const nivel = NIVEL_DE_AUTORITAT[g.autoritat] || 'alto_cargo';
    const propietari = g.propietari || {};
    const deTexto = personaDeTexto(texto);
    // El titular del departamento es quien va en los actos del president
    // y de los consellers; en los demás, quien lo diga el texto.
    const persona = nivel === 'presidente' || nivel === 'consejero' ? propietari.titular || deTexto.persona : deTexto.persona;
    actos.push(
      fila('cataluna', {
        id: `cat-${a.id}`,
        fecha,
        hora,
        nivel,
        organo: propietari.nom ? textoPlano(propietari.nom) : null,
        persona: persona ? textoPlano(persona).replace(/\bllla\b/, 'Illa') : null,
        cargo: deTexto.cargo,
        titulo: textoPlano(a.titol),
        texto: subactes.length ? `${texto} Programa: ${subactes.join('; ')}.` : texto,
        lugar: lugar || null,
        url: `${URL_AGENDA}/${a.id}`,
        agenda_url: URL_AGENDA,
        source_id: a.id,
      })
    );
  }
  return actos;
}

/**
 * Lee los días pedidos (hoy y los siguientes). Cada día respondido es un
 * día cubierto entero: lo que falte de él, se retira.
 */
export async function leerCataluna({ pedir, dias }) {
  const actos = [];
  const fechas = [];
  const errores = [];
  for (const fecha of dias) {
    try {
      const texto = await pedir(urlApi(fecha), HEADERS);
      const json = JSON.parse(texto);
      if (!Array.isArray(json?.actes)) throw new Error('la respuesta no trae «actes»');
      actos.push(...actosCataluna(json, fecha));
      fechas.push(fecha);
    } catch (e) {
      errores.push(`${fecha}: ${e.message}`);
    }
  }
  return { actos, fechas, errores, diagnostico: { dias: dias.length } };
}
