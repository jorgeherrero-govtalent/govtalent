'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Isotipo } from '@/components/Logo';
import { PODRA } from '@/lib/mcp/textos';

/**
 * Pantalla de permiso del MCP (/oauth/consent).
 *
 * Aquí llega el usuario cuando conecta Claude, ChatGPT u otro asistente
 * a GovTalent: Supabase Auth, que hace de servidor de permisos, lo manda
 * con el identificador de la petición en la dirección
 * (?authorization_id=…). El usuario ve quién pide acceso y qué podrá
 * hacer, y decide.
 *
 * Maqueta C, pantalla 3 (17-11-2026): cabecera oscura con los dos
 * nombres y, debajo, la pregunta, la cuenta, lo que podrá hacer y los
 * dos botones.
 *
 * DOS COSAS QUE PROTEGEN AL USUARIO:
 *   - Se enseña a qué dirección volverá al permitir. Cualquiera puede
 *     registrar un asistente con el nombre «Claude»; la dirección de
 *     vuelta no se puede falsear, así que es lo que permite comprobarlo.
 *   - Sin sesión no se llega aquí: el middleware manda antes al login y
 *     devuelve a esta misma dirección.
 *
 * No usa useSearchParams (obligaría a envolver la página en Suspense):
 * el identificador se lee de la dirección al montar.
 */

const BORDE = '#e8e6df';
const GRIS = '#6f6c64';
const MORADO = '#6d5aef';

const BOTON = {
  border: 'none',
  borderRadius: 8,
  padding: '12px 18px',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  width: '100%',
};

function dominio(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export default function PermisoPage() {
  const supabase = createClient();
  const [estado, setEstado] = useState('cargando'); // cargando | listo | error
  const [peticion, setPeticion] = useState(null);
  const [esPago, setEsPago] = useState(null);
  const [enviando, setEnviando] = useState(null); // 'permitir' | 'cancelar' | null
  const [fallo, setFallo] = useState('');

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const id = new URLSearchParams(window.location.search).get('authorization_id');
      if (!id) {
        setEstado('error');
        return;
      }

      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
      if (cancelado) return;
      if (error || !data) {
        setEstado('error');
        return;
      }
      // Ya lo había permitido antes: no hay nada que preguntar.
      if (!('authorization_id' in data)) {
        window.location.href = data.redirect_url;
        return;
      }
      setPeticion(data);
      setEstado('listo');

      const { data: nivel } = await supabase.rpc('nivel_avisos');
      if (!cancelado) setEsPago(nivel === 'pro');
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decidir(permitir) {
    if (!peticion || enviando) return;
    setEnviando(permitir ? 'permitir' : 'cancelar');
    setFallo('');
    const accion = permitir ? supabase.auth.oauth.approveAuthorization : supabase.auth.oauth.denyAuthorization;
    const { data, error } = await accion.call(supabase.auth.oauth, peticion.authorization_id, { skipBrowserRedirect: true });
    if (error || !data?.redirect_url) {
      setEnviando(null);
      setFallo('No se ha podido completar. Vuelve a tu asistente y conéctalo de nuevo.');
      return;
    }
    window.location.href = data.redirect_url;
  }

  const nombre = peticion?.client?.name || 'El asistente';
  const vuelta = dominio(peticion?.redirect_uri);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f0efe9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: '#fff',
          border: `1px solid ${BORDE}`,
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        <div style={{ background: '#1a1a18', color: '#fff', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{ width: 36, height: 36, borderRadius: 9, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <Isotipo size={20} />
          </span>
          {estado === 'listo' && (
            <svg width="22" height="14" viewBox="0 0 22 14" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M1 4h18M15 1l4 3-4 3M21 10H3M7 7l-4 3 4 3" />
            </svg>
          )}
          {estado === 'listo' && (
          <span
            aria-hidden="true"
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: '#fff',
              color: '#1a1a18',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {nombre.trim().charAt(0).toUpperCase()}
          </span>
          )}
          <span style={{ fontSize: 15, fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>
            {estado === 'listo' ? `GovTalent y ${nombre}` : 'GovTalent'}
          </span>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {estado === 'cargando' && <div style={{ fontSize: 14, color: GRIS }}>Cargando</div>}

          {estado === 'error' && (
            <>
              <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, letterSpacing: '-.3px' }}>Esta petición de acceso ya no es válida</h1>
              <div style={{ fontSize: 14, color: GRIS, lineHeight: 1.5 }}>
                Ha caducado o el enlace está incompleto. Vuelve a tu asistente y conecta GovTalent de nuevo.
              </div>
              <a href="/" style={{ ...BOTON, background: '#e9e8e2', color: '#1a1a18', textDecoration: 'none', textAlign: 'center', boxSizing: 'border-box' }}>
                Ir a GovTalent
              </a>
            </>
          )}

          {estado === 'listo' && (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-.3px', lineHeight: 1.25 }}>
                ¿Permites que {nombre} trabaje con tu cuenta?
              </h1>
              <div style={{ fontSize: 13, color: GRIS }}>Cuenta: {peticion.user?.email}</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {PODRA.map((t) => (
                  <div key={t} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.4 }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#1d6f5c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}>
                      <path d="M3 8.5l3.2 3.2L13 5" />
                    </svg>
                    <span>{t}</span>
                  </div>
                ))}
              </div>

              {esPago === false && (
                <div style={{ fontSize: 13, color: GRIS }}>Con tu plan actual: una alarma, con resumen los lunes, y un proyecto.</div>
              )}
              {vuelta && (
                <div style={{ fontSize: 13, color: GRIS, overflowWrap: 'anywhere' }}>
                  Al permitir, volverás a <strong style={{ color: '#1a1a18', fontWeight: 600 }}>{vuelta}</strong>. Puedes revocar el acceso cuando quieras desde Configuración.
                </div>
              )}
              {fallo && <div style={{ fontSize: 13, color: '#1a1a18', background: '#f0efe9', borderRadius: 8, padding: '9px 11px' }}>{fallo}</div>}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                <button type="button" onClick={() => decidir(true)} disabled={!!enviando} style={{ ...BOTON, background: MORADO, color: '#fff', opacity: enviando ? 0.6 : 1 }}>
                  {enviando === 'permitir' ? 'Conectando' : 'Permitir'}
                </button>
                <button type="button" onClick={() => decidir(false)} disabled={!!enviando} style={{ ...BOTON, background: '#e9e8e2', color: '#1a1a18', opacity: enviando ? 0.6 : 1 }}>
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
