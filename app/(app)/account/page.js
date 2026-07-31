'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

const GENDER_OPTIONS = [
  ['', 'Prefiero no decirlo'],
  ['mujer', 'Mujer'],
  ['hombre', 'Hombre'],
  ['no_binario', 'No binario'],
  ['otro', 'Otro'],
];

function Row({ icon, label, description, onClick, href, tone = 'default' }) {
  const content = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <i
          className={`ti ${icon}`}
          style={{ fontSize: 16, color: tone === 'danger' ? '#a33' : '#666', flexShrink: 0 }}
        ></i>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: tone === 'danger' ? '#a33' : '#1a1a18' }}>{label}</div>
          {description && <div style={{ fontSize: 12, color: '#999', marginTop: 1 }}>{description}</div>}
        </div>
      </div>
      <i className="ti ti-chevron-right" style={{ fontSize: 14, color: '#ccc', flexShrink: 0 }}></i>
    </>
  );
  const style = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '13px 4px',
    borderBottom: '.5px solid #f0f0eb',
    cursor: 'pointer',
    textDecoration: 'none',
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
      toast('El nombre y los apellidos no pueden quedar vacíos');
      return;
    }
    setSavingName(true);
    const { error } = await supabase
      .from('users')
      .update({ first_name: firstName.trim(), last_name: lastName.trim() })
      .eq('id', user.id);
    setSavingName(false);
    if (error) {
      toast('No se pudo guardar');
      return;
    }
    setUser({ ...user, first_name: firstName.trim(), last_name: lastName.trim() });
    toast('Guardado ✓');
  }

  async function saveGender(value) {
    setSavingGender(true);
    const { error } = await supabase.from('users').update({ gender_identity: value || null }).eq('id', user.id);
    setSavingGender(false);
    if (error) {
      toast('No se pudo guardar');
      return;
    }
    setUser({ ...user, gender_identity: value || null });
    toast('Guardado ✓');
  }

  async function saveBirthDate(value) {
    setSavingBirthDate(true);
    const { error } = await supabase.from('users').update({ birth_date: value || null }).eq('id', user.id);
    setSavingBirthDate(false);
    if (error) {
      toast('No se pudo guardar');
      return;
    }
    setUser({ ...user, birth_date: value || null });
    toast('Guardado ✓');
  }

  async function savePhone() {
    setSavingPhone(true);
    const { error } = await supabase.from('users').update({ phone: phone.trim() || null }).eq('id', user.id);
    setSavingPhone(false);
    if (error) {
      toast('No se pudo guardar');
      return;
    }
    setUser({ ...user, phone: phone.trim() || null });
    toast('Guardado ✓');
  }

  async function toggleMarketingEmails() {
    setSavingPrefs(true);
    const newValue = !user.marketing_emails_enabled;
    const { error } = await supabase.from('users').update({ marketing_emails_enabled: newValue }).eq('id', user.id);
    setSavingPrefs(false);
    if (error) {
      toast('No se pudo guardar la preferencia');
      return;
    }
    setUser({ ...user, marketing_emails_enabled: newValue });
    toast('Preferencia guardada ✓');
  }

  async function requestDeletion() {
    setDeleting(true);
    const res = await fetch('/api/account/delete-request', { method: 'POST' });
    setDeleting(false);
    if (!res.ok) {
      toast('No se pudo enviar la solicitud. Inténtalo de nuevo.');
      return;
    }
    setUser({ ...user, deletion_requested_at: new Date().toISOString() });
    setView('delete-done');
  }

  if (loading) return <div className="spinner"></div>;
  if (!user) return null;

  // --- Pantalla de confirmación de borrado, estilo LinkedIn: sin dramatismo,
  // enseñando lo que se pierde, sin botones en rojo que griten "peligro". ---
  if (view === 'delete-confirm') {
    return (
      <div className="sec" style={{ maxWidth: 560 }}>
        <div className="card" style={{ padding: 28 }}>
          <div
            onClick={() => setView('main')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#666', cursor: 'pointer', marginBottom: 20 }}
          >
            <i className="ti ti-arrow-left" style={{ fontSize: 14 }}></i> Volver
          </div>

          <h1 style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>Eliminar cuenta</h1>
          <p style={{ fontSize: 14, color: '#3a3a36', marginBottom: 20 }}>
            Qué pena que te vayas, {user.first_name} 👋
          </p>

          <div style={{ background: '#f8f7f2', borderRadius: 10, padding: '16px 18px', marginBottom: 22 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#888', marginBottom: 10 }}>Al eliminar tu cuenta perderás:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: '#3a3a36' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <i className="ti ti-x" style={{ color: '#a33', fontSize: 14, marginTop: 1 }}></i>
                Tu perfil y tu visibilidad ante organizaciones del sector
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <i className="ti ti-x" style={{ color: '#a33', fontSize: 14, marginTop: 1 }}></i>
                Tu historial de candidaturas
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <i className="ti ti-x" style={{ color: '#a33', fontSize: 14, marginTop: 1 }}></i>
                Tus alertas de empleo y organizaciones seguidas
              </div>
            </div>
          </div>

          <p style={{ fontSize: 12, color: '#999', marginBottom: 20 }}>
            Enviaremos tu solicitud al equipo de GovTalent y te contactaremos para confirmarlo antes de procesar
            nada — no se elimina nada de forma inmediata.
          </p>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-p" onClick={() => setView('main')}>
              Seguir con mi cuenta
            </button>
            <button className="btn-o" disabled={deleting} onClick={requestDeletion}>
              {deleting ? 'Enviando...' : 'Continuar'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'delete-done') {
    return (
      <div className="sec" style={{ maxWidth: 560 }}>
        <div className="card" style={{ padding: 28, textAlign: 'center' }}>
          <i className="ti ti-mail-check" style={{ fontSize: 28, color: '#1d6f5c', marginBottom: 10 }}></i>
          <h1 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Solicitud enviada</h1>
          <p style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
            Nos pondremos en contacto contigo para confirmar el borrado de tu cuenta
            {user.deletion_requested_at && ` (solicitado el ${new Date(user.deletion_requested_at).toLocaleDateString('es-ES')})`}.
          </p>
          <p style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
            Mientras tanto, tu cuenta sigue activa con normalidad.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="sec" style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Mi cuenta</h1>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
        Gestiona tus datos de acceso, preferencias y tu cuenta en GovTalent.
      </p>

      <div className="card" style={{ padding: 22, marginBottom: 16 }}>
        <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 14 }}>Datos de la cuenta</h2>
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
          <button className="btn-p" style={{ fontSize: 12.5, padding: '6px 14px', marginBottom: 13 }} disabled={savingName} onClick={saveName}>
            {savingName ? 'Guardando...' : 'Guardar cambios'}
          </button>
        )}
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Email</label>
          <input value={user.email} disabled />
        </div>
      </div>

      <div className="card" style={{ padding: 22, marginBottom: 16 }}>
        <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>Información personal detallada</h2>
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
        <div className="field" style={{ marginTop: 10, marginBottom: phone !== (user.phone || '') ? 8 : 0 }}>
          <label>Teléfono</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ej: +34 600 000 000" />
        </div>
        {phone !== (user.phone || '') && (
          <button className="btn-p" style={{ fontSize: 12.5, padding: '6px 14px' }} disabled={savingPhone} onClick={savePhone}>
            {savingPhone ? 'Guardando...' : 'Guardar cambios'}
          </button>
        )}
      </div>

      <div className="card" style={{ padding: 22, marginBottom: 16 }}>
        <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>Preferencias de comunicación</h2>
        <p style={{ fontSize: 12.5, color: '#888', marginBottom: 14 }}>
          Esto no afecta a los emails esenciales, como confirmaciones de candidatura o alertas de empleo que hayas
          activado — esos siempre te llegarán.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: '#1a1a18', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!user.marketing_emails_enabled}
            disabled={savingPrefs}
            onChange={toggleMarketingEmails}
          />
          Quiero recibir novedades y consejos de GovTalent por email
        </label>
      </div>

      <div className="card" style={{ padding: '8px 18px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#999', letterSpacing: '.03em', padding: '10px 4px 2px' }}>
          GESTIÓN DE LA CUENTA
        </div>
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
