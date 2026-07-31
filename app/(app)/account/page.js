'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

export default function AccountPage() {
  const supabase = createClient();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return setLoading(false);
    const { data: profile } = await supabase.from('users').select('*').eq('id', authData.user.id).single();
    setUser(profile);
    setLoading(false);
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
    setShowDeleteModal(false);
    toast('Solicitud enviada — te contactaremos en breve ✓');
  }

  if (loading) return <div className="spinner"></div>;
  if (!user) return null;

  return (
    <div className="sec" style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Mi cuenta</h1>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
        Gestiona tus datos de acceso, preferencias y tu cuenta en GovTalent.
      </p>

      <div className="card" style={{ padding: 22, marginBottom: 16 }}>
        <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 14 }}>Datos de la cuenta</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#888' }}>Nombre</span>
            <span style={{ fontWeight: 500 }}>
              {user.first_name} {user.last_name}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#888' }}>Email</span>
            <span style={{ fontWeight: 500 }}>{user.email}</span>
          </div>
        </div>
        <Link href="/profile" style={{ display: 'inline-block', marginTop: 14, fontSize: 12.5, color: '#1d6f5c', fontWeight: 500, textDecoration: 'none' }}>
          Editar mi perfil profesional →
        </Link>
      </div>

      <div className="card" style={{ padding: 22, marginBottom: 16 }}>
        <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>Plan</h2>
        {user.is_premium ? (
          <div style={{ fontSize: 13, color: '#3a3a36' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: '#faf9ff',
                color: '#6d5aef',
                fontSize: 11.5,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 20,
                marginBottom: 8,
              }}
            >
              <i className="ti ti-bolt"></i> Premium
            </span>
            <div style={{ color: '#888' }}>
              {user.premium_source === 'invite'
                ? 'Activado mediante código de invitación.'
                : 'Suscripción activa.'}
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: '#888' }}>
            Estás en el plan gratuito. Las funciones premium para candidatos llegarán próximamente.
          </p>
        )}
      </div>

      <div className="card" style={{ padding: 22, marginBottom: 16 }}>
        <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>Preferencias de comunicación</h2>
        <p style={{ fontSize: 12.5, color: '#888', marginBottom: 14 }}>
          Esto no afecta a los emails esenciales, como confirmaciones de candidatura o alertas de empleo que hayas
          activado — esos siempre te llegarán.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!user.marketing_emails_enabled}
            disabled={savingPrefs}
            onChange={toggleMarketingEmails}
            style={{ width: 16, height: 16 }}
          />
          Quiero recibir novedades y consejos de GovTalent por email
        </label>
      </div>

      <div className="card" style={{ padding: 22, borderColor: '#e8c8c8' }}>
        <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4, color: '#a33' }}>Zona de riesgo</h2>
        {user.deletion_requested_at ? (
          <p style={{ fontSize: 13, color: '#888' }}>
            <i className="ti ti-clock" style={{ marginRight: 4 }}></i>
            Ya has solicitado el borrado de tu cuenta ({new Date(user.deletion_requested_at).toLocaleDateString('es-ES')}).
            Nos pondremos en contacto contigo para confirmarlo.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: '#888', marginBottom: 14 }}>
              Solicita el borrado de tu cuenta y todos tus datos de GovTalent. Revisaremos tu solicitud y te
              contactaremos para confirmarlo.
            </p>
            <button
              className="btn-o"
              style={{ color: '#a33', borderColor: '#e8c8c8' }}
              onClick={() => setShowDeleteModal(true)}
            >
              <i className="ti ti-trash"></i> Solicitar borrado de cuenta
            </button>
          </>
        )}
      </div>

      {showDeleteModal && (
        <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && setShowDeleteModal(false)}>
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h2>¿Solicitar borrado de cuenta?</h2>
              <div className="modal-x" onClick={() => setShowDeleteModal(false)}>
                <i className="ti ti-x"></i>
              </div>
            </div>
            <p style={{ fontSize: 13, color: '#666', margin: '4px 0 20px', lineHeight: 1.6 }}>
              Enviaremos tu solicitud al equipo de GovTalent. Te contactaremos para confirmar el borrado antes de
              procesarlo — no se elimina nada de forma inmediata ni automática.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-o" onClick={() => setShowDeleteModal(false)}>
                Cancelar
              </button>
              <button className="btn-p" style={{ background: '#a33' }} disabled={deleting} onClick={requestDeletion}>
                {deleting ? 'Enviando...' : 'Sí, solicitar borrado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
