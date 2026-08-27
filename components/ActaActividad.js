'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

/**
 * El acta de una actividad registrada.
 *
 * Recoge lo que el artículo 6.2 del RDL 21/2026 exige de un acta o
 * minuta: fecha, lugar, participantes, resumen de los temas abordados e
 * identificación de los documentos intercambiados. Son los mismos campos
 * del formulario, ordenados como documento.
 *
 * Se imprime abriendo una ventana con el documento suelto en vez de
 * pelearse con @media print sobre el layout de la aplicación: el
 * resultado es más limpio y el navegador ya ofrece guardar en PDF. Y se
 * puede copiar en texto plano, que es lo que hace falta para pegarlo en
 * un correo.
 *
 * GovTalent no presenta nada ante el Consejo de Transparencia. Genera el
 * documento; lo presenta la organización. Eso va escrito en el propio
 * acta y no como letra pequeña.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const TIPO_LABEL = {
  reunion: 'Reunión',
  documento: 'Entrega de documentación',
  email: 'Comunicación escrita',
};

// "Acta" solo donde la usa la norma. El artículo 6.2 habla de actas o
// minutas de las reuniones; para una entrega o un correo, llamarlo acta
// crearía una figura documental que el texto no contempla.
const TITULO = {
  reunion: 'Acta de reunión',
  documento: 'Registro de entrega de documentación',
  email: 'Registro de comunicación escrita',
};

const MODALIDAD_LABEL = {
  presencial: 'Presencial',
  videoconferencia: 'Videoconferencia',
};

function fechaLarga(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

function marcaTemporal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}, ${hh}:${mi}`;
}

const ACCION_LABEL = {
  creada: 'Registrada',
  cerrada: 'Cerrada',
  modificada: 'Modificada',
};

function escapar(t) {
  return String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export default function ActaActividad({ actividad, asunto, onCerrar }) {
  const supabase = createClient();
  const [parts, setParts] = useState([]);
  const [docs, setDocs] = useState([]);
  const [rastro, setRastro] = useState([]);
  const [grupo, setGrupo] = useState(null);
  const [cliente, setCliente] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const [{ data: p }, { data: f }, { data: r }, { data: g }, { data: c }] = await Promise.all([
      supabase
        .from('activity_participants')
        .select('nombre, cargo, es_propio')
        .eq('activity_id', actividad.id),
      supabase.from('project_files').select('nombre, bytes').eq('activity_id', actividad.id),
      supabase
        .from('activity_audit')
        .select('accion, created_at')
        .eq('activity_id', actividad.id)
        .order('created_at', { ascending: true }),
      // El sujeto obligado es el grupo de interés, no las personas que
      // asistieron. El artículo 6.1.a pide identificarlo con su
      // denominación y domicilio; sin esto el acta no dice de quién es.
      actividad.organization_id
        ? supabase
            .from('organizations')
            .select('name, legal_name, tax_id, registered_address, cbtg_registry_number')
            .eq('id', actividad.organization_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      // El artículo 7.2 exige precisar la identidad del tercero cuando
      // se actúa por cuenta ajena.
      actividad.client_id
        ? supabase.from('clients').select('nombre, tax_id').eq('id', actividad.client_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setParts(p || []);
    setDocs(f || []);
    setRastro(r || []);
    setGrupo(g || null);
    setCliente(c || null);
    setCargando(false);
  }, [supabase, actividad.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const nuestros = parts.filter((p) => p.es_propio);
  const contraparte = parts.filter((p) => !p.es_propio);

  const nombreDe = (p) => (p.cargo ? `${p.nombre}, ${p.cargo}` : p.nombre);

  // legal_name antes que name: el nombre comercial no identifica a una
  // persona jurídica en un documento con valor probatorio.
  const denominacion = grupo?.legal_name || grupo?.name || '—';
  const porCuentaDe = cliente
    ? cliente.tax_id
      ? `${cliente.nombre} · ${cliente.tax_id}`
      : cliente.nombre
    : actividad.cliente_nombre || null;

  // Solo las reuniones tienen lugar: en una entrega o un correo el dato
  // no aplica y la fila desaparece del acta.
  const lugarTexto =
    actividad.tipo !== 'reunion'
      ? null
      : actividad.modalidad === 'presencial'
      ? actividad.lugar || '—'
      : MODALIDAD_LABEL[actividad.modalidad] || '—';

  function textoPlano() {
    const l = [];
    l.push((TITULO[actividad.tipo] || 'Registro de actividad').toUpperCase());
    l.push('');
    l.push('GRUPO DE INTERÉS');
    l.push(`Denominación: ${denominacion}`);
    if (grupo?.tax_id) l.push(`CIF: ${grupo.tax_id}`);
    if (grupo?.registered_address) l.push(`Domicilio social: ${grupo.registered_address}`);
    l.push(`Nº de inscripción: ${grupo?.cbtg_registry_number || 'Sin indicar'}`);
    if (porCuentaDe) l.push(`Actúa por cuenta de: ${porCuentaDe}`);
    l.push('');
    l.push('ACTIVIDAD');
    l.push(`Fecha: ${fechaLarga(actividad.fecha)}`);
    if (lugarTexto) l.push(`Lugar: ${lugarTexto}`);
    if (asunto) l.push(`Norma sobre la que se influye: ${asunto.etiqueta}`);
    l.push('');
    l.push('PARTICIPANTES');
    l.push(`Por el grupo de interés: ${nuestros.map(nombreDe).join(', ') || '—'}`);
    l.push(`Por la Administración: ${contraparte.map(nombreDe).join(', ') || '—'}`);
    l.push('');
    l.push('TEMAS ABORDADOS');
    l.push(actividad.asunto || '—');
    l.push('');
    l.push('DOCUMENTOS INTERCAMBIADOS');
    l.push(docs.length > 0 ? docs.map((d) => d.nombre).join(', ') : 'Ninguno');
    l.push('');
    return l.join('\n');
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoPlano());
      toast('Acta copiada');
    } catch {
      toast('No se ha podido copiar');
    }
  }

  function imprimir() {
    const w = window.open('', '_blank', 'width=820,height=900');
    if (!w) return toast('El navegador ha bloqueado la ventana. Permite las ventanas emergentes.');

    const fila = (etiqueta, valor) =>
      `<tr><th>${escapar(etiqueta)}</th><td>${escapar(valor)}</td></tr>`;

    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${escapar(TITULO[actividad.tipo] || 'Registro')} — ${escapar(actividad.fecha)}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
       color:#1a1a18;max-width:720px;margin:40px auto;padding:0 32px;line-height:1.55}
  .cab{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;
       padding-bottom:14px;border-bottom:2px solid #1d6f5c;margin-bottom:22px}
  h1{font-size:18px;font-weight:500;margin:0}
  .sub{font-size:12.5px;color:#77746e;margin-top:3px}
  .marca{font-size:11.5px;color:#1d6f5c;font-weight:500;white-space:nowrap}
  .marca b{background:#1d6f5c;color:#fff;padding:1.5px 5px;border-radius:3px;font-weight:500}
  /* El único bloque en morado: es el que identifica al sujeto obligado y
     tiene que separarse del resto. Un solo uso, para que el color
     signifique algo y no compita con el verde del documento. */
  .grupo{background:#f4f2fe;border-left:2px solid #6d5aef;padding:14px 17px;margin-bottom:22px}
  .grupo h2{color:#3c3489;margin-top:0}
  h2{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#1d6f5c;
     margin:22px 0 9px;font-weight:500}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  th{text-align:left;font-weight:400;color:#77746e;width:190px;padding:3.5px 0;vertical-align:top}
  td{padding:3.5px 0;vertical-align:top}
  p{font-size:12.5px;margin:0;line-height:1.6}
  .vacio{color:#a8a49c}
  .pie{margin-top:26px;padding-top:15px;border-top:.5px solid #e8e6e0;font-size:10.5px;
       color:#a8a49c;line-height:1.55}
  /* Los fondos se imprimen: sin esto el bloque morado sale en blanco. */
  @media print{body{margin:0;padding:0 12mm}
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="cab">
  <div>
    <h1>${escapar(TITULO[actividad.tipo] || 'Registro de actividad')}</h1>
    <div class="sub">${escapar(fechaLarga(actividad.fecha))}</div>
  </div>
  <span class="marca">gov<b>talent</b></span>
</div>

<div class="grupo">
<h2>Grupo de interés</h2>
<table>
  ${fila('Denominación', denominacion)}
  ${grupo?.tax_id ? fila('CIF', grupo.tax_id) : ''}
  ${grupo?.registered_address ? fila('Domicilio social', grupo.registered_address) : ''}
  ${grupo?.cbtg_registry_number ? fila('Nº de inscripción', grupo.cbtg_registry_number) : '<tr><th>Nº de inscripción</th><td class="vacio">Sin indicar</td></tr>'}
  ${porCuentaDe ? fila('Actúa por cuenta de', porCuentaDe) : ''}
</table>
</div>

<h2>Actividad</h2>
<table>
  ${fila('Fecha', fechaLarga(actividad.fecha))}
  ${lugarTexto ? fila('Lugar', lugarTexto) : ''}
  ${asunto ? fila('Norma sobre la que se influye', asunto.etiqueta) : ''}
</table>

<h2>Participantes</h2>
<table>
  ${fila('Por el grupo de interés', nuestros.map(nombreDe).join(', ') || '—')}
  ${fila('Por la Administración', contraparte.map(nombreDe).join(', ') || '—')}
</table>

<h2>Temas abordados</h2>
<p>${escapar(actividad.asunto || '—')}</p>

<h2>Documentos intercambiados</h2>
<p>${docs.length > 0 ? docs.map((d) => escapar(d.nombre)).join('<br>') : 'Ninguno'}</p>

<h2>Trazabilidad</h2>
<table>
  ${rastro
    .map((r) => fila(ACCION_LABEL[r.accion] || r.accion, marcaTemporal(r.created_at)))
    .join('')}
</table>

<div class="pie">Acta de trazabilidad gestionada por GovTalent. Documento generado el ${escapar(marcaTemporal(new Date().toISOString()))}.
Su contenido es responsabilidad de ${escapar(denominacion)}. La presentación ante el Consejo de Transparencia y Buen Gobierno corresponde a la organización.</div>
</body></html>`);
    w.document.close();
    w.focus();
    // Sin el retardo, Safari a veces imprime antes de aplicar los estilos.
    setTimeout(() => w.print(), 250);
  }

  const etiqueta = { fontSize: 10.5, color: '#999', width: 150, flexShrink: 0 };
  const valor = { fontSize: 12.5, color: '#1a1a18', flex: 1, minWidth: 0 };
  const linea = { display: 'flex', gap: 12, padding: '5px 0' };
  // Mismos colores que el documento imprimible: verde para el acta,
  // morado solo en el bloque del grupo de interés.
  const seccion = {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '.5px',
    color: '#1d6f5c',
    fontWeight: 600,
    margin: '20px 0 7px',
  };

  return (
    <div
      onClick={onCerrar}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.35)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '5vh 16px',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, padding: 22, position: 'relative' }}
      >
        <button
          onClick={onCerrar}
          aria-label="Cerrar"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 26,
            height: 26,
            borderRadius: 7,
            border: 'none',
            background: '#f5f4f1',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <i className="ti ti-x" style={{ fontSize: 13, color: '#777' }}></i>
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 16,
            paddingBottom: 12,
            borderBottom: '2px solid #1d6f5c',
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {TITULO[actividad.tipo] || 'Registro de actividad'}
            </div>
            <div style={{ fontSize: 11.5, color: '#77746e', marginTop: 2 }}>{fechaLarga(actividad.fecha)}</div>
          </div>
        </div>

        {cargando ? (
          <div className="spinner"></div>
        ) : (
          <>
            <div
              style={{
                background: '#f4f2fe',
                borderLeft: '2px solid #6d5aef',
                borderRadius: 0,
                padding: '12px 15px',
                margin: '16px 0 4px',
              }}
            >
              <div style={{ ...seccion, color: '#3c3489', margin: '0 0 7px' }}>Grupo de interés</div>
            <div style={linea}>
              <span style={etiqueta}>Denominación</span>
              <span style={valor}>{denominacion}</span>
            </div>
            {grupo?.tax_id && (
              <div style={linea}>
                <span style={etiqueta}>CIF</span>
                <span style={valor}>{grupo.tax_id}</span>
              </div>
            )}
            {grupo?.registered_address && (
              <div style={linea}>
                <span style={etiqueta}>Domicilio social</span>
                <span style={valor}>{grupo.registered_address}</span>
              </div>
            )}
            <div style={linea}>
              <span style={etiqueta}>Nº de inscripción</span>
              <span style={{ ...valor, color: grupo?.cbtg_registry_number ? '#1a1a18' : '#aaa' }}>
                {grupo?.cbtg_registry_number || 'Sin indicar'}
              </span>
            </div>
            {porCuentaDe && (
              <div style={linea}>
                <span style={etiqueta}>Actúa por cuenta de</span>
                <span style={valor}>{porCuentaDe}</span>
              </div>
            )}
            </div>

            <div style={seccion}>Actividad</div>
            <div style={linea}>
              <span style={etiqueta}>Fecha</span>
              <span style={valor}>{fechaLarga(actividad.fecha)}</span>
            </div>
            {lugarTexto && (
              <div style={linea}>
                <span style={etiqueta}>Lugar</span>
                <span style={valor}>{lugarTexto}</span>
              </div>
            )}
            {asunto && (
              <div style={linea}>
                <span style={etiqueta}>Norma sobre la que se influye</span>
                <span style={valor}>{asunto.etiqueta}</span>
              </div>
            )}

            <div style={seccion}>Participantes</div>
            <div style={linea}>
              <span style={etiqueta}>Por el grupo de interés</span>
              <span style={valor}>{nuestros.map(nombreDe).join(', ') || '—'}</span>
            </div>
            <div style={linea}>
              <span style={etiqueta}>Por la Administración</span>
              <span style={valor}>{contraparte.map(nombreDe).join(', ') || '—'}</span>
            </div>

            <div style={seccion}>Temas abordados</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>{actividad.asunto || '—'}</div>

            <div style={seccion}>Documentos intercambiados</div>
            <div style={{ fontSize: 12.5 }}>
              {docs.length > 0 ? docs.map((d) => d.nombre).join(', ') : 'Ninguno'}
            </div>

            {/* La trazabilidad es lo que distingue esto de una hoja de
                cálculo: no que guardes el dato, sino que puedas demostrar
                cuándo lo guardaste. Sale del trigger de auditoría. */}
            <div style={seccion}>Trazabilidad</div>
            {rastro.length === 0 ? (
              <div style={{ fontSize: 12, color: '#aaa' }}>Sin registro.</div>
            ) : (
              rastro.map((r, i) => (
                <div key={i} style={{ ...linea, padding: '3px 0' }}>
                  <span style={etiqueta}>{ACCION_LABEL[r.accion] || r.accion}</span>
                  <span style={{ ...valor, fontSize: 12, color: '#666' }}>{marcaTemporal(r.created_at)}</span>
                </div>
              ))
            )}

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 20 }}>
              <button className="btn-ai" onClick={imprimir}>
                Imprimir o guardar en PDF
              </button>
              <button
                onClick={copiar}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: '#999',
                  fontSize: 11.5,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <i className="ti ti-copy" style={{ fontSize: 13, verticalAlign: -2, marginRight: 4 }}></i>
                Copiar texto
              </button>
            </div>

            <div style={{ fontSize: 10.5, color: '#aaa', marginTop: 10, lineHeight: 1.5 }}>
              GovTalent genera el documento. La presentación ante el Consejo de Transparencia corresponde a
              la organización.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
