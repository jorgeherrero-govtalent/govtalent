'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import { Isotipo } from '@/components/Logo';
import { ASISTENTES, DIRECCION_MCP, EJEMPLOS, EJEMPLO_CORTO, asistenteDe } from '@/lib/mcp/textos';

/**
 * Configuración → Asistentes de IA.
 *
 * Desde aquí el usuario conecta Claude o ChatGPT a su cuenta de GovTalent
 * (el MCP: app/api/mcp) y ve y revoca las conexiones que tiene.
 *
 * Maqueta A (17-11-2026), tomada de la página MCP de Enginy:
 *   - una tarjeta por asistente, con su estado y el botón «Conectar»;
 *   - «Conectar» abre una guía de cinco pasos, cada uno con su dibujo;
 *   - mensajes de ejemplo para copiar;
 *   - las conexiones, con la última consulta y «Revocar».
 *
 * LAS CONEXIONES SALEN DE SUPABASE AUTH (auth.oauth.listGrants), que es
 * quien da y retira los permisos; la última consulta, de mcp_llamadas
 * (sql/133), donde el servidor apunta cada llamada. Si el servidor de
 * permisos aún no está activo o la tabla no existe, la pantalla sale
 * igual, sin conexiones.
 *
 * Cada paso de la guía lleva su imagen: la captura real de la pantalla
 * si está en public/asistentes/guia/ y, si no, una ilustración de la
 * ventana del asistente con lo que hay que pulsar marcado.
 */

const BORDE = '#e8e6df';
const GRIS = '#6f6c64';
const MORADO = '#6d5aef';

const BOTON = {
  background: MORADO,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 12.5,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};
const BOTON_FILA = {
  background: '#fff',
  color: '#1a1a18',
  border: `1px solid ${BORDE}`,
  borderRadius: 8,
  padding: '7px 13px',
  fontSize: 12.5,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};
const BOTON_GRIS = { ...BOTON_FILA, background: '#e9e8e2', border: 'none', padding: '8px 14px' };

function fechaHora(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dia = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `${dia} a las ${hora}`;
}

async function copiar(texto, aviso) {
  try {
    await navigator.clipboard.writeText(texto);
    toast(aviso);
  } catch {
    toast('No se ha podido copiar');
  }
}

function Seccion({ titulo, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 13, color: '#8b8780', margin: '0 0 7px 4px' }}>{titulo}</div>
      {children}
    </div>
  );
}

const CAJA = { background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 10, overflow: 'hidden' };

// ---------------------------------------------------------------------
// Las ilustraciones de la guía
// ---------------------------------------------------------------------
//
// Cada paso enseña una ventana del asistente sobre el fondo «aurora» del
// login, con lo que hay que pulsar marcado en morado y el cursor encima.
// No copian la pantalla real de Claude ni de ChatGPT: enseñan dónde está
// cada cosa, con los nombres que el usuario va a encontrar.

const TINTA = '#1a1a18';
const LINEA = { height: 7, borderRadius: 4, background: '#e6e4dd' };
const MARCA = { boxShadow: `0 0 0 2px ${MORADO}, 0 0 0 6px rgba(109,90,239,.18)`, background: '#f0eefe', borderRadius: 8 };

// Los nombres de los menús de cada asistente.
const MENUS = {
  claude: {
    cabecera: 'Ajustes',
    lateral: ['General', 'Perfil', 'Conectores', 'Skills'],
    titulo: 'Conectores',
    boton: 'Añadir',
    opciones: ['Explorar conectores', 'Añadir conector personalizado'],
    ventana: 'Añadir conector personalizado',
    aceptar: 'Añadir',
    lista: 'Conectores',
  },
  // ChatGPT los llama complementos y se añaden desde su catálogo.
  chatgpt: {
    cabecera: 'ChatGPT',
    lateral: ['Nuevo chat', 'Buscar chats', 'Complementos', 'Proyectos'],
    titulo: 'Complementos',
    boton: '',
    opciones: [null, 'Añadir servidor MCP personalizado'],
    ventana: 'Añadir servidor MCP personalizado',
    aceptar: 'Crear como complemento',
    lista: 'Complementos',
  },
};

function Cursor({ style }) {
  return (
    <svg width="22" height="24" viewBox="0 0 22 24" aria-hidden="true" style={{ position: 'absolute', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))', ...style }}>
      <path d="M3 2l15 9.5-6.6 1.3 4 7.6-2.9 1.5-4-7.7L3 18.5z" fill="#fff" stroke={TINTA} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/** La ventana del asistente: barra con los tres puntos, su logotipo y su nombre. */
function Ventana({ asistente, children, ancho = 372 }) {
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: ancho, background: '#fff', borderRadius: 12, boxShadow: '0 18px 40px rgba(0,0,0,.35)', overflow: 'hidden', fontSize: 12, color: TINTA }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderBottom: `1px solid ${BORDE}`, background: '#faf9f5' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#d9d6cd' }}></span>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#d9d6cd' }}></span>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#d9d6cd' }}></span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8, fontWeight: 600 }}>
          <img src={asistente.logo} alt="" style={{ width: 15, height: 15, objectFit: 'contain' }} />
          {asistente.nombre}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Una fila de conector: icono, nombre y, si se indica, un interruptor. */
function FilaConector({ icono, nombre, encendido, marcada }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', ...(marcada ? MARCA : {}) }}>
      <span style={{ width: 22, height: 22, borderRadius: 6, background: '#fff', border: `1px solid ${BORDE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icono}
      </span>
      <span style={{ flex: 1, fontWeight: marcada ? 600 : 400 }}>{nombre}</span>
      {encendido !== undefined && (
        <span style={{ width: 28, height: 16, borderRadius: 8, background: encendido ? MORADO : '#d9d6cd', position: 'relative', flexShrink: 0 }}>
          <span style={{ position: 'absolute', top: 2, left: encendido ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff' }}></span>
        </span>
      )}
    </div>
  );
}

const Cuadro = () => <span style={{ width: 10, height: 10, borderRadius: 3, background: '#d9d6cd' }}></span>;

function Dibujo({ tipo, asistente }) {
  const m = MENUS[asistente.id] || MENUS.claude;
  let dentro = null;

  if (tipo === 'ajustes') {
    // Los ajustes del asistente, con la entrada de conectores marcada.
    dentro = (
      <Ventana asistente={asistente}>
        <div style={{ display: 'flex', minHeight: 150 }}>
          <div style={{ width: 168, padding: '12px 10px', borderRight: `1px solid ${BORDE}`, display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, position: 'relative' }}>
            <div style={{ fontSize: 10.5, color: GRIS, padding: '0 8px 4px' }}>{m.cabecera}</div>
            {m.lateral.map((t, i) => (
              <div key={t} style={{ padding: '6px 8px', borderRadius: 8, fontWeight: i === 2 ? 600 : 400, color: i === 2 ? TINTA : '#57534e', ...(i === 2 ? MARCA : {}) }}>
                {t}
              </div>
            ))}
            <Cursor style={{ left: 118, top: 92 }} />
          </div>
          <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{m.titulo}</div>
            <FilaConector icono={<Cuadro />} nombre={<span style={{ ...LINEA, width: 70, display: 'block' }}></span>} />
            <FilaConector icono={<Cuadro />} nombre={<span style={{ ...LINEA, width: 92, display: 'block' }}></span>} />
            <FilaConector icono={<Cuadro />} nombre={<span style={{ ...LINEA, width: 56, display: 'block' }}></span>} />
          </div>
        </div>
      </Ventana>
    );
  } else if (tipo === 'anadir') {
    // El botón de añadir, con su menú abierto y la opción marcada.
    dentro = (
      <Ventana asistente={asistente}>
        <div style={{ padding: 14, minHeight: 150, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{m.titulo}</div>
            <div style={{ border: `1px solid ${BORDE}`, borderRadius: 8, padding: '5px 10px', fontWeight: 600, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
              {m.boton}
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6, opacity: 0.55 }}>
            <FilaConector icono={<Cuadro />} nombre={<span style={{ ...LINEA, width: 80, display: 'block' }}></span>} />
            <FilaConector icono={<Cuadro />} nombre={<span style={{ ...LINEA, width: 60, display: 'block' }}></span>} />
          </div>
          <div style={{ position: 'absolute', right: 14, top: 46, width: 236, background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 10, boxShadow: '0 10px 24px rgba(0,0,0,.14)', padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {m.opciones[0] && <div style={{ padding: '7px 9px', color: '#57534e' }}>{m.opciones[0]}</div>}
            <div style={{ padding: '7px 9px', fontWeight: 600, ...MARCA }}>{m.opciones[1]}</div>
            <Cursor style={{ right: -4, bottom: -12 }} />
          </div>
        </div>
      </Ventana>
    );
  } else if (tipo === 'direccion') {
    // La ventana de añadir, con el nombre y la dirección ya escritos.
    dentro = (
      <Ventana asistente={asistente}>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 9, position: 'relative' }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{m.ventana}</div>
          <div style={{ fontSize: 10.5, color: GRIS }}>Nombre</div>
          <div style={{ border: `1px solid ${BORDE}`, borderRadius: 8, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Isotipo size={13} />
            GovTalent
          </div>
          <div style={{ fontSize: 10.5, color: GRIS }}>URL del servidor</div>
          <div style={{ padding: '7px 10px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11.5, ...MARCA }}>{DIRECCION_MCP}</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <span style={{ border: `1px solid ${BORDE}`, borderRadius: 8, padding: '6px 12px' }}>Cancelar</span>
            <span style={{ background: TINTA, color: '#fff', borderRadius: 8, padding: '6px 14px', fontWeight: 600 }}>{m.aceptar}</span>
          </div>
          <Cursor style={{ right: 26, bottom: 6 }} />
        </div>
      </Ventana>
    );
  } else {
    // El chat, con GovTalent encendido y un mensaje de ejemplo.
    dentro = (
      <Ventana asistente={asistente}>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
          <div style={{ alignSelf: 'flex-end', maxWidth: '82%', background: '#f0efe9', borderRadius: '12px 12px 3px 12px', padding: '8px 11px', lineHeight: 1.4 }}>{EJEMPLO_CORTO}</div>
          <div style={{ border: `1px solid ${BORDE}`, borderRadius: 10, padding: 6, boxShadow: '0 8px 20px rgba(0,0,0,.1)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 10.5, color: GRIS, padding: '2px 9px' }}>{m.lista}</div>
            <FilaConector icono={<Isotipo size={13} />} nombre="GovTalent" encendido marcada />
            <FilaConector icono={<Cuadro />} nombre={<span style={{ ...LINEA, width: 74, display: 'block' }}></span>} encendido={false} />
          </div>
          <Cursor style={{ right: 30, top: 92 }} />
        </div>
      </Ventana>
    );
  }

  return (
    <div
      aria-hidden="true"
      style={{ position: 'relative', overflow: 'hidden', background: '#0f1b33', borderRadius: 12, padding: '26px 22px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 230 }}
    >
      <span style={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', background: '#1d6f5c', filter: 'blur(64px)', opacity: 0.75, left: -80, top: -90 }}></span>
      <span style={{ position: 'absolute', width: 280, height: 280, borderRadius: '50%', background: MORADO, filter: 'blur(72px)', opacity: 0.7, right: -100, bottom: -110 }}></span>
      {dentro}
    </div>
  );
}

/**
 * La imagen de un paso: la captura real de la pantalla si está en
 * public/asistentes/guia/<asistente>-<paso>.png (decisión del
 * 17-11-2026: capturas, no dibujos). Mientras falte la de algún paso,
 * sale su esquema para que la guía no se quede sin imagen.
 */
function Ilustracion({ asistente, paso }) {
  const [falla, setFalla] = useState(false);
  const p = asistente.pasos[paso];
  if (falla) return <Dibujo tipo={p.dibujo} asistente={asistente} />;
  return (
    <img
      src={`/asistentes/guia/${asistente.id}-${paso + 1}.png`}
      alt=""
      onError={() => setFalla(true)}
      style={{ width: '100%', display: 'block', borderRadius: 10, border: `1px solid ${BORDE}`, background: '#f0efe9' }}
    />
  );
}

// ---------------------------------------------------------------------
// La guía de conexión
// ---------------------------------------------------------------------

function Direccion() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        border: `1px solid ${BORDE}`,
        background: '#fafaf7',
        borderRadius: 9,
        padding: '6px 6px 6px 13px',
      }}
    >
      <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, overflowWrap: 'anywhere' }}>{DIRECCION_MCP}</span>
      <button type="button" style={BOTON_FILA} onClick={() => copiar(DIRECCION_MCP, 'Dirección copiada')}>
        Copiar
      </button>
    </div>
  );
}

function GuiaConexion({ asistente, onClose }) {
  const [paso, setPaso] = useState(0);
  const total = asistente.pasos.length;
  const p = asistente.pasos[paso];
  const ultimo = paso === total - 1;

  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onClose]);

  return createPortal(
    <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="guia-mcp-titulo" style={{ maxWidth: 520, padding: 0 }}>
        <div className="modal-head" style={{ padding: '18px 22px', marginBottom: 0 }}>
          <h2 id="guia-mcp-titulo" style={{ fontSize: 17 }}>
            Conectar {asistente.nombre}
          </h2>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Cerrar">
            <i className="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12.5, color: GRIS }}>
            Paso {paso + 1} de {total}
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.3px', lineHeight: 1.2 }}>{p.titulo}</div>
          <div style={{ fontSize: 14, color: GRIS, lineHeight: 1.5 }}>{p.texto}</div>

          {paso === 0 && (
            <a href={asistente.abrir.url} target="_blank" rel="noreferrer" style={{ ...BOTON_FILA, alignSelf: 'flex-start', textDecoration: 'none' }}>
              {asistente.abrir.texto}
            </a>
          )}
          {p.conDireccion && <Direccion />}

          <Ilustracion key={`${asistente.id}-${paso}`} asistente={asistente} paso={paso} />

          {ultimo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {EJEMPLOS.map((e) => (
                <FilaEjemplo key={e.titulo} ejemplo={e} />
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '14px 22px', borderTop: `1px solid ${BORDE}` }}>
          <button type="button" style={BOTON_GRIS} onClick={onClose}>
            Cancelar
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {paso > 0 && (
              <button type="button" style={BOTON_FILA} onClick={() => setPaso(paso - 1)}>
                Atrás
              </button>
            )}
            <button type="button" style={BOTON} onClick={() => (ultimo ? onClose() : setPaso(paso + 1))}>
              {ultimo ? 'Finalizar' : 'Siguiente'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Un mensaje de ejemplo: título, el texto entero y «Copiar». */
function FilaEjemplo({ ejemplo }) {
  return (
    <div style={{ border: `1px solid ${BORDE}`, background: '#fff', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{ejemplo.titulo}</div>
        <button type="button" style={BOTON_FILA} onClick={() => copiar(ejemplo.texto, 'Mensaje copiado')}>
          Copiar
        </button>
      </div>
      <div style={{ fontSize: 13.5, color: '#57534e', lineHeight: 1.55 }}>{ejemplo.texto}</div>
    </div>
  );
}

// ---------------------------------------------------------------------
// El logotipo de cada asistente
// ---------------------------------------------------------------------

/**
 * El logotipo oficial, si su archivo está en public/asistentes/ (se sube
 * el que publica cada empresa, sin redibujarlo). Mientras no esté, o si
 * no carga, sale la inicial.
 */
function LogoAsistente({ asistente }) {
  const [falla, setFalla] = useState(false);
  const base = { width: 40, height: 40, borderRadius: 10, flexShrink: 0 };
  if (asistente.logo && !falla) {
    return <img src={asistente.logo} alt="" onError={() => setFalla(true)} style={{ ...base, objectFit: 'contain', display: 'block' }} />;
  }
  return (
    <div
      aria-hidden="true"
      style={{ ...base, background: '#1a1a18', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 17 }}
    >
      {asistente.inicial}
    </div>
  );
}

// ---------------------------------------------------------------------
// La pestaña
// ---------------------------------------------------------------------

export default function BloqueAsistentes() {
  const supabase = createClient();
  const [conexiones, setConexiones] = useState(null); // null = cargando
  const [ultimas, setUltimas] = useState({});
  const [guia, setGuia] = useState(null);
  const [aRevocar, setARevocar] = useState(null);
  const [revocando, setRevocando] = useState(false);

  const cargar = useCallback(async () => {
    // Si el servidor de permisos no está activo, listGrants devuelve un
    // error: se trata como «sin conexiones», no como un fallo.
    const [{ data: permisos, error }, { data: llamadas }] = await Promise.all([
      (supabase.auth.oauth?.listGrants?.() ?? Promise.resolve({ data: null, error: true })).catch(() => ({ data: null, error: true })),
      supabase.from('mcp_llamadas').select('client_id, created_at').order('created_at', { ascending: false }).limit(300),
    ]);
    setConexiones(error || !Array.isArray(permisos) ? [] : permisos);

    const porCliente = {};
    for (const l of llamadas || []) {
      if (l.client_id && !porCliente[l.client_id]) porCliente[l.client_id] = l.created_at;
    }
    setUltimas(porCliente);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function revocar(clientId) {
    setRevocando(true);
    const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
    setRevocando(false);
    setARevocar(null);
    if (error) {
      toast('No se ha podido revocar el acceso. Inténtalo de nuevo.');
      return;
    }
    toast('Acceso revocado');
    cargar();
  }

  const conectado = (a) => (conexiones || []).some((c) => asistenteDe(c.client?.name)?.id === a.id);

  return (
    <>
      <style>{`
        .asi-tarjetas { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 640px) { .asi-tarjetas { grid-template-columns: 1fr; } }
      `}</style>

      <Seccion titulo="Conecta tu asistente">
        <div className="asi-tarjetas">
          {ASISTENTES.map((a) => {
            const si = conexiones !== null && conectado(a);
            return (
              <div key={a.id} style={{ ...CAJA, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <LogoAsistente asistente={a} />
                <div style={{ fontSize: 15, fontWeight: 600 }}>{a.nombre}</div>
                <div style={{ fontSize: 13, color: GRIS, lineHeight: 1.5 }}>
                  Consulta tu normativa y crea alarmas hablando con {a.nombre}.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 'auto', paddingTop: 6 }}>
                  <span style={{ fontSize: 12.5, color: si ? '#1d6f5c' : GRIS, fontWeight: si ? 500 : 400, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {si && <i className="ti ti-check" aria-hidden="true"></i>}
                    {conexiones === null ? '' : si ? 'Conectado' : 'Sin conectar'}
                  </span>
                  <button type="button" style={si ? BOTON_FILA : BOTON} onClick={() => setGuia(a)}>
                    Conectar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Seccion>

      <Seccion titulo="Prueba a pedirle">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {EJEMPLOS.map((e) => (
            <FilaEjemplo key={e.titulo} ejemplo={e} />
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Conexiones">
        <div style={CAJA}>
          {conexiones === null ? (
            <div style={{ padding: '14px 18px', fontSize: 13, color: GRIS }}>Cargando</div>
          ) : conexiones.length === 0 ? (
            <div style={{ padding: '14px 18px', fontSize: 13, color: GRIS }}>Todavía no has conectado ningún asistente.</div>
          ) : (
            conexiones.map((c, i) => {
              const id = c.client?.id;
              const ultima = fechaHora(ultimas[id]);
              const desde = fechaHora(c.granted_at);
              return (
                <div
                  key={id || i}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderTop: i === 0 ? 'none' : `1px solid ${BORDE}` }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{c.client?.name || 'Asistente'}</div>
                    <div style={{ fontSize: 13, color: GRIS, marginTop: 3, lineHeight: 1.5 }}>
                      {ultima ? `Última consulta el ${ultima}` : desde ? `Conectado el ${desde}` : 'Sin consultas todavía'}
                    </div>
                  </div>
                  {aRevocar === id ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" style={BOTON_FILA} onClick={() => setARevocar(null)} disabled={revocando}>
                        Cancelar
                      </button>
                      <button type="button" style={BOTON_GRIS} onClick={() => revocar(id)} disabled={revocando}>
                        {revocando ? 'Revocando' : 'Confirmar'}
                      </button>
                    </div>
                  ) : (
                    <button type="button" style={BOTON_GRIS} onClick={() => setARevocar(id)}>
                      Revocar
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Seccion>

      {guia && <GuiaConexion asistente={guia} onClose={() => setGuia(null)} />}
    </>
  );
}
