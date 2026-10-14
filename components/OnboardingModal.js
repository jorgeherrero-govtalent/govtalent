'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import Logo from '@/components/Logo';

/**
 * Onboarding: una sola pantalla, «Cuéntanos sobre ti» (14-10-2026,
 * maqueta A1).
 *
 * Sustituye al de tres pasos, que venía de la etapa de empleo y talento:
 * pedía la situación profesional («busco mi primera experiencia…»), temas
 * para el perfil de sector (que ya sustituyen las alarmas) y el contexto
 * profesional del perfil de candidato. Ahora solo se pide quién es la
 * persona y en qué organización trabaja; las alarmas se crean dentro.
 *
 * La organización y su tipo son datos declarados (users.organizacion_nombre
 * y users.organizacion_tipo, sql/98): no se enlazan todavía con
 * `organizations` ni con el directorio.
 *
 * Sin verde: la opción elegida va en gris oscuro, como en el login.
 */

export const TIPOS_ORGANIZACION = [
  { value: 'consultora', label: 'Consultora de asuntos públicos' },
  { value: 'empresa', label: 'Empresa' },
  { value: 'asociacion_sectorial', label: 'Asociación sectorial' },
  { value: 'despacho', label: 'Despacho de abogados' },
  { value: 'institucion_publica', label: 'Institución pública' },
  { value: 'tercer_sector', label: 'ONG / tercer sector' },
];

const TINTA = '#1a1a18';
const GRIS = '#5f5b54';
const BORDE = '#d9d7cf';

const CAMPO = {
  height: 44,
  borderRadius: 10,
  border: `1px solid ${BORDE}`,
  background: '#fff',
  padding: '0 14px',
  font: 'inherit',
  fontSize: 14,
  color: TINTA,
  boxSizing: 'border-box',
  width: '100%',
  outline: 'none',
};

const ETIQUETA = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 };

export default function OnboardingModal({ userId, onComplete }) {
  const supabase = createClient();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    professional_title: '',
    organizacion_nombre: '',
    organizacion_tipo: '',
  });

  // Quien entra con Google ya trae nombre y apellidos: se rellenan para
  // que solo tenga que confirmarlos.
  useEffect(() => {
    let vivo = true;
    supabase
      .from('users')
      .select('first_name, last_name, professional_title, organizacion_nombre, organizacion_tipo')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!vivo || !data) return;
        setForm((f) => ({
          first_name: f.first_name || data.first_name || '',
          last_name: f.last_name || data.last_name || '',
          professional_title: f.professional_title || data.professional_title || '',
          organizacion_nombre: f.organizacion_nombre || data.organizacion_nombre || '',
          organizacion_tipo: f.organizacion_tipo || data.organizacion_tipo || '',
        }));
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const listo = form.first_name.trim() && form.last_name.trim();

  async function terminar(e) {
    e.preventDefault();
    if (!listo || guardando) return;
    setGuardando(true);
    setError('');

    const { error: err } = await supabase
      .from('users')
      .update({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        professional_title: form.professional_title.trim() || null,
        organizacion_nombre: form.organizacion_nombre.trim() || null,
        organizacion_tipo: form.organizacion_tipo || null,
        onboarding_completed: true,
      })
      .eq('id', userId);

    if (err) {
      setGuardando(false);
      setError('No se han podido guardar tus datos. Comprueba tu conexión e inténtalo de nuevo.');
      return;
    }

    // Bienvenida por correo. keepalive porque onComplete recarga la página
    // antes de que termine la petición. Un fallo aquí no afecta al alta.
    fetch('/api/email/welcome', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'candidate' }),
    }).catch((e2) => console.error('Error enviando email de bienvenida:', e2));

    setGuardando(false);
    toast('Todo listo ✓');
    if (onComplete) onComplete();
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#f0efe9',
        zIndex: 5000,
        overflowY: 'auto',
        padding: '40px 16px 56px',
      }}
    >
      <div style={{ maxWidth: 540, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
        <div className="logo" style={{ display: 'inline-flex' }}>
          <Logo height={26} />
        </div>

        <form
          onSubmit={terminar}
          style={{
            width: '100%',
            background: '#fff',
            border: '1px solid #e0dfd8',
            borderRadius: 16,
            padding: '30px 28px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.3px', margin: '0 0 6px' }}>Cuéntanos sobre ti</h1>
            <p style={{ margin: 0, fontSize: 13.5, color: GRIS, lineHeight: 1.55 }}>
              Con estos datos adaptamos GovTalent a ti y a tu organización.
            </p>
          </div>

          <div className="onb-dos">
            <label style={ETIQUETA}>
              Nombre
              <input className="onb-input" style={CAMPO} required autoComplete="given-name" value={form.first_name} onChange={set('first_name')} />
            </label>
            <label style={ETIQUETA}>
              Apellidos
              <input className="onb-input" style={CAMPO} required autoComplete="family-name" value={form.last_name} onChange={set('last_name')} />
            </label>
          </div>

          <label style={ETIQUETA}>
            Tu puesto
            <input
              className="onb-input"
              style={CAMPO}
              autoComplete="organization-title"
              placeholder="Directora de Asuntos Públicos, consultor…"
              value={form.professional_title}
              onChange={set('professional_title')}
            />
          </label>

          <label style={ETIQUETA}>
            Organización
            <input
              className="onb-input"
              style={CAMPO}
              autoComplete="organization"
              placeholder="Dónde trabajas"
              value={form.organizacion_nombre}
              onChange={set('organizacion_nombre')}
            />
          </label>

          <div role="group" aria-labelledby="onb-tipo" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <span id="onb-tipo" style={{ fontSize: 13, fontWeight: 500 }}>
              Tipo de organización
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {TIPOS_ORGANIZACION.map((t) => {
                const on = form.organizacion_tipo === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setForm((f) => ({ ...f, organizacion_tipo: on ? '' : t.value }))}
                    style={{
                      font: 'inherit',
                      fontSize: 13,
                      borderRadius: 20,
                      padding: '8px 14px',
                      minHeight: 36,
                      cursor: 'pointer',
                      background: on ? '#f3f2ee' : '#fff',
                      border: on ? `1.5px solid ${TINTA}` : '1px solid #e0dfd8',
                      color: on ? TINTA : GRIS,
                      fontWeight: on ? 500 : 400,
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <div style={{ fontSize: 12.5, color: '#b3261e', lineHeight: 1.5 }}>{error}</div>}

          <button
            type="submit"
            className="mbtn mbtn-morado"
            disabled={!listo || guardando}
            style={{ height: 46, padding: 0, marginTop: 6 }}
          >
            {guardando ? 'Guardando…' : 'Empezar'}
          </button>
        </form>
      </div>

      <style>{`
        .onb-dos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .onb-input:focus { border-color: #a8a49c !important; }
        @media (max-width: 480px) { .onb-dos { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
