'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const initialParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const redirectTo = initialParams?.get('redirect') || '/jobs';
  const initialView = initialParams?.get('view') === 'signup' ? 'signup' : 'login';

  const [view, setView] = useState(initialView); // login | signup | reset | sent
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const supabase = createClient();

  async function handleGoogle() {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}` },
    });
    if (error) setError(error.message);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    if (view === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) return setError(traducirError(error.message));
      window.location.href = redirectTo;
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(traducirError(error.message));
    window.location.href = redirectTo;
  }

  async function handleReset(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/profile`,
    });
    setLoading(false);
    if (error) return setError(traducirError(error.message));
    setView('sent');
  }

  return (
    <div>
      <div className="login-bar">
        <div className="logo">
          gov<span>talent</span>
        </div>
        <div style={{ fontSize: 13, color: '#888' }}>
          EN &nbsp;|&nbsp; <b style={{ color: '#1a1a18' }}>ES</b>
        </div>
      </div>

      <div className="login-body">
        {view === 'sent' ? (
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
              <i className="ti ti-mail-check" style={{ fontSize: 26, color: '#1d6f5c' }}></i>
            </div>
            <h1 style={{ fontSize: 19, fontWeight: 700, marginBottom: 6 }}>Revisa tu email</h1>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
              Hemos enviado un enlace a:
            </p>
            <div
              style={{
                background: '#f0f8f5',
                border: '1px solid #c0e4d8',
                borderRadius: 8,
                padding: 10,
                color: '#1d6f5c',
                fontWeight: 500,
                marginBottom: 18,
              }}
            >
              {email}
            </div>
            <button className="mbtn" onClick={() => setView('login')}>
              Volver
            </button>
          </div>
        ) : view === 'reset' ? (
          <div className="ob-card" style={{ maxWidth: 420 }}>
            <div className="back" onClick={() => setView('login')}>
              <i className="ti ti-arrow-left"></i> Volver
            </div>
            <h1 style={{ fontSize: 19, fontWeight: 700, textAlign: 'center', marginBottom: 4 }}>
              Recuperar contraseña
            </h1>
            <p style={{ fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 20 }}>
              Te enviaremos un enlace para restablecerla.
            </p>
            {error && <div className="err-msg">{error}</div>}
            <form onSubmit={handleReset}>
              <div className="field">
                <label>Email</label>
                <input
                  type="email"
                  required
                  placeholder="nombre@organización.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <button className="mbtn" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar enlace'}
              </button>
            </form>
          </div>
        ) : (
          <div className="split">
            <div className="sl-left">
              <h2>
                La plataforma de <em>talento</em> para profesionales de los asuntos públicos, la
                política y el gobierno
              </h2>
              <div className="sl-pill">
                <i className="ti ti-briefcase"></i>Empleos en public affairs, lobbying y gobierno
              </div>
              <div className="sl-pill">
                <i className="ti ti-calendar-event"></i>Eventos, foros y jornadas del sector
              </div>
              <div className="sl-pill">
                <i className="ti ti-users"></i>Red de profesionales e instituciones
              </div>
              <div className="sl-stat">
                <div className="n">GovTalent</div>
                <div className="l">Empieza a construir tu red profesional</div>
              </div>
            </div>

            <div className="sl-right">
              <h1>{view === 'signup' ? 'Registrarme' : 'Iniciar sesión'}</h1>
              <p>Impulsa tu carrera en el sector público y asuntos públicos</p>

              <button className="sbtn" onClick={handleGoogle} type="button">
                <svg width="18" height="18" viewBox="0 0 18 18">
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
                Continuar con Google
              </button>

              <div className="dvd">o con tu email</div>

              {error && <div className="err-msg">{error}</div>}

              <form onSubmit={handleSubmit}>
                <div className="field">
                  <label>Email</label>
                  <input
                    type="email"
                    required
                    placeholder="nombre@organización.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label>Contraseña</label>
                    {view === 'login' && (
                      <a
                        style={{ fontSize: 12, color: '#1d6f5c', cursor: 'pointer' }}
                        onClick={() => setView('reset')}
                      >
                        ¿Olvidaste tu contraseña?
                      </a>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPw ? 'text' : 'password'}
                      required
                      minLength={6}
                      placeholder="••••••••"
                      style={{ paddingRight: 38 }}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <i
                      className={`ti ${showPw ? 'ti-eye-off' : 'ti-eye'}`}
                      style={{
                        position: 'absolute',
                        right: 11,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        cursor: 'pointer',
                        color: '#bbb',
                        fontSize: 17,
                      }}
                      onClick={() => setShowPw(!showPw)}
                    ></i>
                  </div>
                </div>
                <button className="mbtn" disabled={loading}>
                  {loading ? 'Un momento...' : view === 'signup' ? 'Crear cuenta' : 'Entrar'}
                </button>
              </form>

              {view === 'login' ? (
                <div className="ftxt">
                  ¿Aún no tienes cuenta?{' '}
                  <a onClick={() => setView('signup')}>Registrarme</a>
                </div>
              ) : (
                <div className="ftxt">
                  Ya tengo cuenta <a onClick={() => setView('login')}>Iniciar sesión</a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function traducirError(msg) {
  if (msg.includes('Invalid login credentials')) return 'Email o contraseña incorrectos.';
  if (msg.includes('User already registered')) return 'Ya existe una cuenta con ese email.';
  if (msg.includes('Password should be')) return 'La contraseña debe tener al menos 6 caracteres.';
  return msg;
}
