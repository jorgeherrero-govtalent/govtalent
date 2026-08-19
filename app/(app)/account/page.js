'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

const CARD = { background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };
const LABEL = { fontSize: 11, color: '#a8a49c', letterSpacing: '.4px', marginBottom: 14 };

// Los botones del resto de la plataforma: morado para la acción
// principal, gris para la secundaria. Sin bordes ni verde.
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
const BOTON_SEC = {
  background: '#f5f4f1',
  color: '#57534e',
  border: 'none',
  borderRadius: 8,
  padding: '9px 16px',
  fontSize: 12.5,
  cursor: 'pointer',
};

function Interruptor({ activo, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={disabled ? undefined : onChange}
      style={{
        width: 38,
        height: 22,
        borderRadius: 11,
        background: activo ? '#6d5aef' : '#e0dfd8',
        border: 'none',
        padding: 0,
        cursor: disabled ? 'default' : 'pointer',
        flexShrink: 0,
        position: 'relative',
        opacity: disabled ? 0.6 : 1,
        transition: 'background .18s ease',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: activo ? 18 : 2,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left .18s ease',
        }}
      ></span>
    </button>
  );
}

const GENDER_OPTIONS = [
  ['', 'Prefiero no decirlo'],
  ['mujer', 'Mujer'],
  ['hombre', 'Hombre'],
  ['no_binario', 'No binario'],
  ['otro', 'Otro'],
];

// Sin tono de peligro: el rojo no aporta nada aquí, porque esta fila
// solo abre una pantalla donde se explica todo antes de decidir.
function Row({ icon, label, description, onClick, href }) {
  const content = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 16, color: '#8b8780', flexShrink: 0 }}></i>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
          {description && <div style={{ fontSize: 11.5, color: '#a8a49c', marginTop: 2 }}>{description}</div>}
        </div>
      </div>
      <i className="ti ti-chevron-right" style={{ fontSize: 14, color: '#d6d2ca', flexShrink: 0 }}></i>
    </>
  );
  const style = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '13px 4px',
    cursor: 'pointer',
    textDecoration: 'none',
    color: 'inherit',
  };
  if (href) {
    return (
      <Link href={href} style={style}>
        {content}
      </Link>
    );
  }
  return (
    <div onClick={onClick} style={style}>
      {content}
    </div>
  );
}

export default function AccountPage() {
  const supabase = createClient();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savingGender, setSavingGender] = useState(false);
  const [savingBirthDate, setSavingBirthDate] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [phone, setPhone] = useState('');
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [view, setView] = useState('main'); // 'main' | 'delete-confirm' | 'delete-done'
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return setLoading(false);
    const { data: profile } = await supabase.from('users').select('*').eq('id', authData.user.id).single();
    setUser(profile);
    setFirstName(profile?.first_name || '');
    setLastName(profile?.last_name || '');
    setPhone(profile?.phone || '');
    if (profile?.deletion_requested_at) setView('delete-done');
    setLoading(false);
  }

  async function saveName() {
    if (!firstName.trim() || !lastName.trim()) {
      toast.info('El nombre y los apellidos no pueden quedar vacíos');
      return;
    }
    setSavingName(true);
    const { error } = await supabase
      .from('users')
      .update({ first_name: firstName.trim(), last_name: lastName.trim() })
      .eq('id', user.id);
    setSavingName(false);
    if (error) {
      toast.error('No se ha podido guardar');
      return;
    }
    setUser({ ...user, first_name: firstName.trim(), last_name: lastName.trim() });
    toast('Guardado');
  }

  async function saveGender(value) {
    setSavingGender(true);
    const { error } = await supabase.from('users').update({ gender_identity: value || null }).eq('id', user.id);
    setSavingGender(false);
    if (error) {
      toast.error('No se ha podido guardar');
      return;
    }
    setUser({ ...user, gender_identity: value || null });
    toast('Guardado');
  }

  async function saveBirthDate(value) {
    setSavingBirthDate(true);
    const { error } = await supabase.from('users').update({ birth_date: value || null }).eq('id', user.id);
    setSavingBirthDate(false);
    if (error) {
      toast.error('No se ha podido guardar');
      return;
    }
    setUser({ ...user, birth_date: value || null });
    toast('Guardado');
  }

  async function savePhone() {
    setSavingPhone(true);
    const { error } = await supabase.from('users').update({ phone: phone.trim() || null }).eq('id', user.id);
    setSavingPhone(false);
    if (error) {
      toast.error('No se ha podido guardar');
      return;
    }
    setUser({ ...user, phone: phone.trim() || null });
    toast('Guardado');
  }

  async function toggleMarketingEmails() {
    setSavingPrefs(true);
    const newValue = !user.marketing_emails_enabled;
    const { error } = await supabase.from('users').update({ marketing_emails_enabled: newValue }).eq('id', user.id);
    setSavingPrefs(false);
    if (error) {
      toast.error('No se ha podido guardar');
      return;
    }
    setUser({ ...user, marketing_emails_enabled: newValue });
    toast('Guardado');
  }

  async function requestDeletion() {
    setDeleting(true);
    const res = await fetch('/api/account/delete-request', { method: 'POST' });
    setDeleting(false);
    if (!res.ok) {
      toast.error('No se ha podido enviar la solicitud');
      return;
    }
    setUser({ ...user, deletion_requested_at: new Date().toISOString() });
    setView('delete-done');
  }

  if (loading) return <div className="spinner"></div>;
  if (!user) return null;

  // --- Solicitud de borrado -------------------------------------------
  // Sobria y sin dramatismo: ni equis rojas ni emoji. Enumera lo que se
  // pierde en frío, que informa más que cualquier adorno, y aclara que
  // nada se borra al instante.
  if (view === 'delete-confirm') {
    return (
      <div className="sec" style={{ maxWidth: 560 }}>
        <button
          type="button"
          onClick={() => setView('main')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12.5,
            color: '#8b8780',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            marginBottom: 14,
          }}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 14 }}></i> Mi cuenta
        </button>

        <div style={{ ...CARD, padding: 24 }}>
          <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0, letterSpacing: '-.2px' }}>Eliminar tu cuenta</h1>
          <p style={{ fontSize: 12.5, color: '#8b8780', margin: '6px 0 22px', lineHeight: 1.6 }}>
            Antes de seguir, conviene que sepas qué se pierde.
          </p>

          <div style={{ ...LABEL, marginBottom: 12 }}>DEJARÁS DE TENER</div>
          {[
            'Tu perfil y tu visibilidad ante las organizaciones del sector',
            'El historial de tus candidaturas',
            'Los asuntos que sigues y tus alertas',
          ].map((t) => (
            <div key={t} style={{ display: 'flex', gap: 11, padding: '9px 0', borderTop: '.5px solid #f2f0ec' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#c4c0b8', flexShrink: 0, marginTop: 7 }}></span>
              <span style={{ fontSize: 13, color: '#3f3d39', lineHeight: 1.5 }}>{t}</span>
            </div>
          ))}

          <p style={{ fontSize: 12, color: '#8b8780', lineHeight: 1.65, margin: '22px 0' }}>
            No se borra nada al momento. Enviaremos tu solicitud y te escribiremos para confirmarla antes de procesar
            nada.
          </p>

          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <button type="button" style={BOTON} onClick={() => setView('main')}>
              Conservar mi cuenta
            </button>
            <button type="button" style={BOTON_SEC} disabled={deleting} onClick={requestDeletion}>
              {deleting ? 'Enviando…' : 'Solicitar el borrado'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'delete-done') {
    return (
      <div className="sec" style={{ maxWidth: 560 }}>
        <div style={{ ...CARD, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: '#e8f4f0',
                color: '#1d6f5c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <i className="ti ti-check" style={{ fontSize: 16 }}></i>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: '-.15px' }}>Solicitud enviada</div>
              <p style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.6, margin: '6px 0 0' }}>
                Te escribiremos para confirmar el borrado
                {user.deletion_requested_at &&
                  `. La solicitaste el ${new Date(user.deletion_requested_at).toLocaleDateString('es-ES')}`}
                . Mientras tanto tu cuenta sigue funcionando con normalidad.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sec" style={{ maxWidth: 560 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, letterSpacing: '-.2px' }}>Mi cuenta</h1>
        <p style={{ fontSize: 12.5, color: '#8b8780', margin: '5px 0 0' }}>
          Tus datos, tus preferencias y la gestión de tu cuenta.
        </p>
      </div>

      <div style={{ ...CARD, padding: 20, marginBottom: 14 }}>
        <div style={LABEL}>DATOS DE LA CUENTA</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Nombre</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Apellidos</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        {(firstName !== user.first_name || lastName !== user.last_name) && (
          <button style={{ ...BOTON, marginBottom: 13 }} disabled={savingName} onClick={saveName}>
            {savingName ? 'Guardando…' : 'Guardar cambios'}
          </button>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>Email</label>
            <input value={user.email} disabled />
          </div>
          <div className="field" style={{ flex: 1, marginBottom: phone !== (user.phone || '') ? 8 : 0 }}>
            <label>Teléfono de contacto para candidaturas</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ej: +34 600 000 000" />
          </div>
        </div>
        {phone !== (user.phone || '') && (
          <button style={{ ...BOTON, marginTop: 4 }} disabled={savingPhone} onClick={savePhone}>
            {savingPhone ? 'Guardando…' : 'Guardar cambios'}
          </button>
        )}
      </div>

      <div style={{ ...CARD, padding: 20, marginBottom: 14 }}>
        <div style={{ ...LABEL, marginBottom: 4 }}>INFORMACIÓN PERSONAL</div>
        <p style={{ fontSize: 12, color: '#999', marginBottom: 14 }}>
          Opcional. Esta información nunca se muestra en tu perfil — solo la usamos para estadísticas internas
          agregadas.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>Identidad de género</label>
            <select value={user.gender_identity || ''} disabled={savingGender} onChange={(e) => saveGender(e.target.value)}>
              {GENDER_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>Fecha de nacimiento</label>
            <input
              type="date"
              value={user.birth_date || ''}
              disabled={savingBirthDate}
              onChange={(e) => saveBirthDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div style={{ ...CARD, padding: 20, marginBottom: 14 }}>
        <div style={{ ...LABEL, marginBottom: 4 }}>CORREOS DE GOVTALENT</div>
        <p style={{ fontSize: 12, color: '#8b8780', marginBottom: 14, lineHeight: 1.6 }}>
          No afecta a los correos que hayas pedido tú: confirmaciones de candidatura, alertas de empleo y avisos de
          seguimiento siguen llegando.{' '}
          <Link href="/seguimiento?ajustes=1" style={{ color: '#6d5aef', textDecoration: 'none' }}>
            Gestionar mis avisos
          </Link>
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, paddingTop: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>Novedades y consejos</div>
            <div style={{ fontSize: 12, color: '#8b8780', lineHeight: 1.55, marginTop: 3 }}>
              De vez en cuando, lo que vamos añadiendo a la plataforma.
            </div>
          </div>
          <Interruptor
            activo={!!user.marketing_emails_enabled}
            disabled={savingPrefs}
            onChange={toggleMarketingEmails}
          />
        </div>
      </div>

      <div style={{ ...CARD, padding: '6px 18px' }}>
        <div style={{ ...LABEL, padding: '12px 4px 4px', marginBottom: 0 }}>GESTIÓN DE LA CUENTA</div>
        <Row
          icon="ti-trash"
          label="Eliminar cuenta"
          description="Solicita el borrado de tu cuenta y tus datos"
          onClick={() => setView('delete-confirm')}
        />
      </div>
    </div>
  );
}
