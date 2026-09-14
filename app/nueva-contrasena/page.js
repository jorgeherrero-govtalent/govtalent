'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Logo from '@/components/Logo';

/**
 * Nueva contraseña, al llegar desde el enlace de recuperación.
 *
 * El enlace del correo pasa por /auth/callback, que canjea el código por
 * una sesión y redirige aquí. Cuando esta página carga, el usuario YA está
 * autenticado: por eso no se le pide la contraseña actual, que es
 * justamente la que no recuerda.
 *
 * Si alguien entra por su cuenta sin venir del enlace, no hay sesión y se
 * le manda al login en vez de enseñarle un formulario que no funcionaría.
 */
export default function NuevaContrasenaPage() {
  const supabase = createClient();

  const [estado, setEstado] = useState('comprobando'); // comprobando | listo | sin-sesion | hecho
  const [password, setPassword] = useState('');
  const [repetir, setRepetir] = useState('');
  const [verPw, setVerPw] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelado) return;
      setEstado(data?.user ? 'listo' : 'sin-sesion');
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardar(e) {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== repetir) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }

    setCargando(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setCargando(false);

    if (err) {
      setError(traducirError(err.message));
      return;
    }
    setEstado('hecho');
  }

  return (
    <div>
      <div className="login-bar">
        <div className="logo">
          <Logo height={24} />
        </div>
      </div>

      <div className="login-body">
        {estado === 'comprobando' && <div className="spinner"></div>}

        {estado === 'sin-sesion' && (
          <div className="ob-card" style={{ maxWidth: 420, textAlign: 'center' }}>
            <h1 style={{ fontSize: 19, fontWeight: 700, marginBottom: 6 }}>El enlace ha caducado</h1>
            <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 20 }}>
              Los enlaces de recuperación solo valen una vez y durante un rato. Pide uno nuevo desde
              la pantalla de acceso.
            </p>
            <a className="mbtn" href="/login" style={{ textDecoration: 'none', display: 'block' }}>
              Volver al acceso
            </a>
          </div>
        )}

        {estado === 'hecho' && (
          <div className="ob-card" style={{ maxWidth: 420, textAlign: 'center' }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: '#e8f4f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
              }}
            >
              <i className="ti ti-check" style={{ fontSize: 26, color: '#1d6f5c' }}></i>
            </div>
            <h1 style={{ fontSize: 19, fontWeight: 700, marginBottom: 6 }}>Contraseña actualizada</h1>
            <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 20 }}>
              Ya puedes entrar con ella. Tu sesión en este dispositivo sigue abierta.
            </p>
            <a className="mbtn" href="/radar" style={{ textDecoration: 'none', display: 'block' }}>
              Ir a GovTalent
            </a>
          </div>
        )}

        {estado === 'listo' && (
          <div className="ob-card" style={{ maxWidth: 420 }}>
            <h1 style={{ fontSize: 19, fontWeight: 700, textAlign: 'center', marginBottom: 4 }}>
              Nueva contraseña
            </h1>
            <p style={{ fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 20 }}>
              Escribe la contraseña con la que quieres entrar a partir de ahora.
            </p>

            {error && <div className="err-msg">{error}</div>}

            <form onSubmit={guardar}>
              <div className="field">
                <label>Contraseña nueva</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={verPw ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Mínimo 6 caracteres"
                    style={{ paddingRight: 38 }}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <i
                    className={`ti ${verPw ? 'ti-eye-off' : 'ti-eye'}`}
                    style={{
                      position: 'absolute',
                      right: 11,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      cursor: 'pointer',
                      color: '#bbb',
                      fontSize: 17,
                    }}
                    onClick={() => setVerPw(!verPw)}
                  ></i>
                </div>
              </div>

              <div className="field">
                <label>Repítela</label>
                <input
                  type={verPw ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  value={repetir}
                  onChange={(e) => setRepetir(e.target.value)}
                />
              </div>

              <button className="mbtn mbtn-morado" disabled={cargando}>
                {cargando ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function traducirError(msg) {
  if (msg.includes('Password should be')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (msg.includes('same as the old')) return 'Esa es la contraseña que ya tenías. Elige otra.';
  if (msg.includes('session')) return 'El enlace ha caducado. Pide uno nuevo desde la pantalla de acceso.';
  return msg;
}
