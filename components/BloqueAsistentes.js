'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import { ASISTENTES, DIRECCION_MCP, EJEMPLOS, asistenteDe } from '@/lib/mcp/textos';

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
 * Los dibujos de la guía son esquemas, no capturas: las pantallas de
 * Claude y de ChatGPT cambian a menudo y una captura vieja confunde más
 * que ayuda.
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
// Los dibujos de la guía
// ---------------------------------------------------------------------

const LINEA = { height: 8, borderRadius: 4, background: '#e0dfd8' };
const MARCO = {
  background: '#fff',
  border: `1px solid ${BORDE}`,
  borderRadius: 10,
  padding: 14,
  width: '100%',
  maxWidth: 330,
  boxSizing: 'border-box',
  fontSize: 12,
  color: '#1a1a18',
};
const RESALTE = { border: `1.5px solid ${MORADO}`, background: '#f0eefe', borderRadius: 7, padding: '6px 9px', fontWeight: 600 };

function Dibujo({ tipo, resaltado, asistente }) {
  let dentro = null;

  if (tipo === 'ajustes') {
    dentro = (
      <div style={{ ...MARCO, display: 'flex', gap: 12 }}>
        <div style={{ width: 150, display: 'flex', flexDirection: 'column', gap: 9, flexShrink: 0 }}>
          <div style={{ ...LINEA, width: 70 }}></div>
          <div style={{ ...LINEA, width: 96 }}></div>
          <div style={RESALTE}>{resaltado}</div>
          <div style={{ ...LINEA, width: 84 }}></div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 2 }}>
          <div style={{ ...LINEA, width: '90%' }}></div>
          <div style={{ ...LINEA, width: '70%' }}></div>
          <div style={{ ...LINEA, width: '80%' }}></div>
        </div>
      </div>
    );
  } else if (tipo === 'anadir') {
    dentro = (
      <div style={{ ...MARCO, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ ...LINEA, width: 90 }}></div>
          <div style={{ border: `1px solid ${BORDE}`, borderRadius: 7, padding: '4px 10px', fontWeight: 600 }}>+</div>
        </div>
        <div style={{ alignSelf: 'flex-end', ...RESALTE }}>{resaltado}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ ...LINEA, flex: 1, height: 26, borderRadius: 7 }}></div>
          <div style={{ ...LINEA, flex: 1, height: 26, borderRadius: 7 }}></div>
        </div>
      </div>
    );
  } else if (tipo === 'direccion') {
    dentro = (
      <div style={{ ...MARCO, display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ ...LINEA, width: 120 }}></div>
        <div style={{ border: `1px solid ${BORDE}`, borderRadius: 7, padding: '6px 9px' }}>GovTalent</div>
        <div style={{ ...RESALTE, fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 500, fontSize: 11.5 }}>{DIRECCION_MCP}</div>
        <div style={{ alignSelf: 'flex-end', background: '#1a1a18', color: '#fff', borderRadius: 7, padding: '5px 12px' }}>Añadir</div>
      </div>
    );
  } else if (tipo === 'permiso') {
    dentro = (
      <div style={{ ...MARCO, padding: 0, overflow: 'hidden' }}>
        <div style={{ background: '#1a1a18', color: '#fff', padding: '10px 14px', fontWeight: 600 }}>GovTalent y {asistente}</div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ ...LINEA, width: '85%' }}></div>
          <div style={{ ...LINEA, width: '65%' }}></div>
          <div style={{ background: MORADO, color: '#fff', borderRadius: 7, padding: '6px 12px', textAlign: 'center', fontWeight: 600, outline: `2px solid ${MORADO}`, outlineOffset: 2 }}>
            Permitir
          </div>
        </div>
      </div>
    );
  } else {
    dentro = (
      <div style={{ ...MARCO, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ border: `1px solid ${BORDE}`, borderRadius: 8, padding: '9px 10px', color: GRIS }}>¿En qué te ayudo?</div>
        <div style={{ ...RESALTE, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>GovTalent</span>
          <span style={{ width: 28, height: 16, borderRadius: 8, background: MORADO, position: 'relative', display: 'inline-block' }}>
            <span style={{ position: 'absolute', top: 2, left: 14, width: 12, height: 12, borderRadius: '50%', background: '#fff' }}></span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      style={{ background: '#f0efe9', borderRadius: 10, padding: 20, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 170 }}
    >
      {dentro}
    </div>
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

          <Dibujo tipo={p.dibujo} resaltado={p.resaltado} asistente={asistente.nombre} />

          {ultimo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {EJEMPLOS.map((e) => (
                <FilaEjemplo key={e} texto={e} />
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

function FilaEjemplo({ texto }) {
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
        padding: '8px 8px 8px 13px',
        fontSize: 13.5,
      }}
    >
      <span>{texto}</span>
      <button type="button" style={BOTON_FILA} onClick={() => copiar(texto, 'Mensaje copiado')}>
        Copiar
      </button>
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
            <FilaEjemplo key={e} texto={e} />
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
