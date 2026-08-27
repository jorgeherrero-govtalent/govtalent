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
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const [{ data: p }, { data: f }, { data: r }] = await Promise.all([
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
    ]);
    setParts(p || []);
    setDocs(f || []);
    setRastro(r || []);
    setCargando(false);
  }, [supabase, actividad.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const nuestros = parts.filter((p) => p.es_propio);
  const contraparte = parts.filter((p) => !p.es_propio);

  const nombreDe = (p) => (p.cargo ? `${p.nombre} (${p.cargo})` : p.nombre);

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
    l.push(`Fecha: ${fechaLarga(actividad.fecha)}`);
    if (lugarTexto) l.push(`Lugar: ${lugarTexto}`);
    if (asunto) l.push(`Asunto: ${asunto.etiqueta}`);
    if (actividad.cliente_nombre) l.push(`Por cuenta de: ${actividad.cliente_nombre}`);
    l.push('');
    l.push('PARTICIPANTES');
    l.push(`Por parte de la organización: ${nuestros.map(nombreDe).join(', ') || '—'}`);
    l.push(`Otros participantes: ${contraparte.map(nombreDe).join(', ') || '—'}`);
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
  h1{font-size:17px;margin:0 0 4px}
  .sub{font-size:12px;color:#777;margin-bottom:26px}
  h2{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#888;
     margin:26px 0 8px;font-weight:600}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;font-weight:400;color:#777;width:180px;padding:5px 0;vertical-align:top}
  td{padding:5px 0;vertical-align:top}
  p{font-size:13px;margin:0}
  .pie{margin-top:34px;padding-top:14px;border-top:.5px solid #ddd;font-size:11px;color:#888}
  @media print{body{margin:0;padding:0 12mm}}
</style></head><body>
<h1>${escapar(TITULO[actividad.tipo] || 'Registro de actividad')}</h1>
<div class="sub">${escapar(fechaLarga(actividad.fecha))}</div>

<h2>Datos de la actividad</h2>
<table>
  ${fila('Fecha', fechaLarga(actividad.fecha))}
  ${lugarTexto ? fila('Lugar', lugarTexto) : ''}
  ${asunto ? fila('Asunto', asunto.etiqueta) : ''}
  ${actividad.cliente_nombre ? fila('Por cuenta de', actividad.cliente_nombre) : ''}
</table>

<h2>Participantes</h2>
<table>
  ${fila('Por la organización', nuestros.map(nombreDe).join(', ') || '—')}
  ${fila('Otros participantes', contraparte.map(nombreDe).join(', ') || '—')}
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
La presentación ante el Consejo de Transparencia y Buen Gobierno corresponde a la organización.</div>
</body></html>`);
    w.document.close();
    w.focus();
    // Sin el retardo, Safari a veces imprime antes de aplicar los estilos.
    setTimeout(() => w.print(), 250);
  }

  const etiqueta = { fontSize: 10.5, color: '#999', width: 150, flexShrink: 0 };
  const valor = { fontSize: 12.5, color: '#1a1a18', flex: 1, minWidth: 0 };
  const linea = { display: 'flex', gap: 12, padding: '5px 0' };
  const seccion = {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '.4px',
    color: '#aaa',
    fontWeight: 700,
    margin: '18px 0 6px',
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

        <div style={{ fontSize: 14, fontWeight: 700 }}>
          {TITULO[actividad.tipo] || 'Registro de actividad'}
        </div>
        <div style={{ fontSize: 11.5, color: '#888', marginTop: 2 }}>{fechaLarga(actividad.fecha)}</div>

        {cargando ? (
          <div className="spinner"></div>
        ) : (
          <>
            <div style={seccion}>Datos de la actividad</div>
            {lugarTexto && (
              <div style={linea}>
                <span style={etiqueta}>Lugar</span>
                <span style={valor}>{lugarTexto}</span>
              </div>
            )}
            {asunto && (
              <div style={linea}>
                <span style={etiqueta}>Asunto</span>
                <span style={valor}>{asunto.etiqueta}</span>
              </div>
            )}
            {actividad.cliente_nombre && (
              <div style={linea}>
                <span style={etiqueta}>Por cuenta de</span>
                <span style={valor}>{actividad.cliente_nombre}</span>
              </div>
            )}

            <div style={seccion}>Participantes</div>
            <div style={linea}>
              <span style={etiqueta}>Por la organización</span>
              <span style={valor}>{nuestros.map(nombreDe).join(', ') || '—'}</span>
            </div>
            <div style={linea}>
              <span style={etiqueta}>Otros participantes</span>
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
