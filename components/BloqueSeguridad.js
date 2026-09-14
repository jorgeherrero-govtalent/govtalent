'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

const CARD = { background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };
const LABEL = { fontSize: 11, color: '#a8a49c', letterSpacing: '.4px', marginBottom: 14 };
const BOTON = {
  background: '#6d5aef',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '9px 16px',
  fontSize: 12.5,
  fontWeight: 500,
  cursor: 'pointer',
};
const CAMPO = {
  width: '100%',
  border: '.5px solid #e0dfd8',
  borderRadius: 8,
  padding: '9px 11px',
  fontSize: 13,
  fontFamily: 'inherit',
  background: '#fff',
};
const ETIQUETA = { fontSize: 12, color: '#57534e', marginBottom: 5, display: 'block' };

/**
 * Seguridad de la cuenta: cambiar la contraseña desde dentro.
 *
 * El proveedor se lee de las identidades de Supabase Auth y no de la
 * columna users.auth_provider, que tiene 'email' por defecto y no
 * necesariamente refleja cómo entró la persona.
 *
 * Se pide la contraseña actual aunque Supabase no lo exija: con la sesión
 * abierta, updateUser bastaría, y entonces cualquiera que se siente en un
 * portátil desbloqueado podría cambiarla y dejar fuera al dueño. Se
 * verifica reautenticando con signInWithPassword antes de actualizar.
 */
export default function BloqueSeguridad() {
  const supabase = createClient();

  const [email, setEmail] = useState(null);
  const [proveedores, setProveedores] = useState(null);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [verPw, setVerPw] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelado) return;
      const u = data?.user;
      setEmail(u?.email || null);
      setProveedores((u?.identities || []).map((i) => i.provider));
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (proveedores === null) return null;

  const conCorreo = proveedores.includes('email');
  const conGoogle = proveedores.includes('google');

  async function cambiar(e) {
    e.preventDefault();
    setError('');

    if (nueva.length < 6) {
      setError('La contraseña nueva debe tener al menos 6 caracteres.');
      return;
    }
    if (nueva === actual) {
      setError('La contraseña nueva tiene que ser distinta de la actual.');
      return;
    }

    setCargando(true);

    // Reautenticación: si la contraseña actual no es correcta, esto falla
    // y no llegamos a tocar nada.
    const { error: errLogin } = await supabase.auth.signInWithPassword({
      email,
      password: actual,
    });
    if (errLogin) {
      setCargando(false);
      setError('La contraseña actual no es correcta.');
      return;
    }

    const { error: errUpdate } = await supabase.auth.updateUser({ password: nueva });
    setCargando(false);

    if (errUpdate) {
      setError(traducirError(errUpdate.message));
      return;
    }

    setActual('');
    setNueva('');
    toast.success('Contraseña actualizada');
  }

  return (
    <div style={{ ...CARD, padding: 20, marginBottom: 14 }}>
      <div style={LABEL}>SEGURIDAD</div>

      {/* --- Solo Google: no hay contraseña que cambiar ------------------ */}
      {!conCorreo && conGoogle && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
              />
              <path
                fill="#34A853"
                d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
              />
              <path
                fill="#FBBC05"
                d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
              />
              <path
                fill="#EA4335"
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"
              />
            </svg>
            <span style={{ fontSize: 13, color: '#3a3a36' }}>Entras con Google</span>
          </div>
          <p style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.6, margin: 0 }}>
            Tu contraseña la gestiona Google, así que no hay ninguna que cambiar aquí. Si quieres
            entrar también con correo y contraseña, escríbenos a{' '}
            <a href="mailto:hola@govtalent.app" style={{ color: '#1d6f5c' }}>
              hola@govtalent.app
            </a>
            .
          </p>
        </>
      )}

      {/* --- Con correo: formulario de cambio ---------------------------- */}
      {conCorreo && (
        <>
          <div style={{ fontSize: 13, color: '#3a3a36', marginBottom: 16 }}>
            {conGoogle
              ? 'Entras con tu correo y contraseña, y también con Google.'
              : 'Entras con tu correo y contraseña.'}
          </div>

          {error && (
            <div
              style={{
                fontSize: 12.5,
                color: '#993c1d',
                background: '#faece7',
                borderRadius: 8,
                padding: '9px 12px',
                marginBottom: 14,
                maxWidth: 320,
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={cambiar} style={{ maxWidth: 320 }}>
            <label style={ETIQUETA} htmlFor="pw-actual">
              Contraseña actual
            </label>
            <input
              id="pw-actual"
              type={verPw ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              style={{ ...CAMPO, marginBottom: 12 }}
              value={actual}
              onChange={(e) => setActual(e.target.value)}
            />

            <label style={ETIQUETA} htmlFor="pw-nueva">
              Contraseña nueva
            </label>
            <input
              id="pw-nueva"
              type={verPw ? 'text' : 'password'}
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Mínimo 6 caracteres"
              style={{ ...CAMPO, marginBottom: 8 }}
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
            />

            <label
              style={{
                fontSize: 11.5,
                color: '#8b8780',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 14,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={verPw}
                onChange={(e) => setVerPw(e.target.checked)}
                style={{ width: 'auto', margin: 0 }}
              />
              Ver las contraseñas
            </label>

            <button type="submit" style={BOTON} disabled={cargando}>
              {cargando ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function traducirError(msg) {
  if (msg.includes('Password should be')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (msg.includes('same as the old')) return 'Esa es la contraseña que ya tenías. Elige otra.';
  return msg;
}
