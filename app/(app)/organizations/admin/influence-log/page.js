'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

const ACTIVITY_TYPE_LABELS = {
  reunion_audiencia: 'Reunión o audiencia',
  conferencia_formacion: 'Conferencia o formación',
  campana_comunicacion: 'Campaña de comunicación',
  documento_posicion: 'Documento o posición entregado',
  otro: 'Otro',
};

export default function InfluenceLogPage() {
  const supabase = createClient();
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return setLoading(false);

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organizations(*)')
      .eq('user_id', uid)
      .maybeSingle();

    if (!membership) return setLoading(false);
    setOrg(membership.organizations);

    const { data } = await supabase
      .from('influence_activities')
      .select('*')
      .eq('organization_id', membership.organizations.id)
      .order('activity_date', { ascending: false });
    setActivities(data || []);
    setLoading(false);
  }

  function openNew() {
    setEditing({
      activity_date: new Date().toISOString().slice(0, 10),
      activity_type: 'reunion_audiencia',
      counterpart_name: '',
      subject: '',
      notes: '',
      is_public: false,
    });
    setShowForm(true);
  }

  function openEdit(a) {
    setEditing(a);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  async function saveActivity(e) {
    e.preventDefault();
    if (!org) return;
    setSaving(true);
    const f = new FormData(e.target);
    const payload = {
      organization_id: org.id,
      activity_date: f.get('activity_date'),
      activity_type: f.get('activity_type'),
      counterpart_name: f.get('counterpart_name') || null,
      subject: f.get('subject'),
      notes: f.get('notes') || null,
      is_public: f.get('is_public') === 'on',
    };

    let error;
    if (editing.id) {
      ({ error } = await supabase.from('influence_activities').update(payload).eq('id', editing.id));
    } else {
      const { data: authData } = await supabase.auth.getUser();
      ({ error } = await supabase.from('influence_activities').insert({ ...payload, created_by: authData.user?.id }));
    }
    setSaving(false);

    if (error) {
      toast('No se pudo guardar la actividad');
      return;
    }
    toast(editing.id ? 'Actividad actualizada ✓' : 'Actividad registrada ✓');
    closeForm();
    load();
  }

  async function deleteActivity(id) {
    if (!confirm('¿Eliminar este registro? No se puede deshacer.')) return;
    const { error } = await supabase.from('influence_activities').delete().eq('id', id);
    if (error) {
      toast('No se pudo eliminar');
      return;
    }
    setActivities((prev) => prev.filter((a) => a.id !== id));
    toast('Registro eliminado');
  }

  async function togglePublic(a) {
    const { error } = await supabase.from('influence_activities').update({ is_public: !a.is_public }).eq('id', a.id);
    if (error) {
      toast('No se pudo actualizar');
      return;
    }
    setActivities((prev) => prev.map((x) => (x.id === a.id ? { ...x, is_public: !x.is_public } : x)));
    toast(!a.is_public ? 'Actividad publicada en tu ficha pública ✓' : 'Actividad ocultada de tu ficha pública');
  }

  function exportCsv() {
    const headers = ['Fecha', 'Tipo de actividad', 'Contacto / institución', 'Asunto', 'Notas internas', 'Pública'];
    const rows = activities.map((a) =>
      [
        a.activity_date,
        ACTIVITY_TYPE_LABELS[a.activity_type] || a.activity_type,
        a.counterpart_name || '',
        a.subject,
        a.notes || '',
        a.is_public ? 'Sí' : 'No',
      ].map(csvEscape)
    );
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `informe-huella-normativa-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Informe exportado ✓');
  }

  if (loading) return <div className="spinner"></div>;

  if (!org) {
    return (
      <div className="sec">
        <div className="empty-state">
          <i className="ti ti-building-off"></i>
          Todavía no administras ninguna organización.
        </div>
      </div>
    );
  }

  return (
    <div className="sec">
      <div style={{ marginBottom: 10 }}>
        <Link href="/organizations/admin" style={{ fontSize: 12.5, color: '#1d6f5c', textDecoration: 'none' }}>
          <i className="ti ti-arrow-left"></i> Volver a mi organización
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 700 }}>Registro de actividad de influencia</h2>
          <p style={{ fontSize: 13, color: '#888', maxWidth: 560 }}>
            Lleva la trazabilidad de tus reuniones y contactos con personal público, tal y como exige la Ley de
            Transparencia e Integridad de los Grupos de Interés. Marca como pública la actividad que quieras mostrar
            en tu ficha de organización.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="btn-o" disabled={activities.length === 0} onClick={exportCsv}>
            <i className="ti ti-download"></i> Exportar informe
          </button>
          <button className="btn-p" onClick={openNew}>
            <i className="ti ti-plus"></i> Añadir actividad
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
        {activities.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>
            <i className="ti ti-notes"></i>
            Todavía no has registrado ninguna actividad.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: '#faf9f5', textAlign: 'left' }}>
                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#666' }}>Fecha</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#666' }}>Tipo</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#666' }}>Contacto / institución</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#666' }}>Asunto</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#666', textAlign: 'center' }}>Pública</th>
                <th style={{ padding: '10px 14px' }}></th>
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => (
                <tr key={a.id} style={{ borderTop: '.5px solid #e0dfd8' }}>
                  <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>{a.activity_date}</td>
                  <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>{ACTIVITY_TYPE_LABELS[a.activity_type]}</td>
                  <td style={{ padding: '9px 14px' }}>{a.counterpart_name || '—'}</td>
                  <td style={{ padding: '9px 14px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.subject}>
                    {a.subject}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                    <button
                      onClick={() => togglePublic(a)}
                      title={a.is_public ? 'Visible en tu ficha pública' : 'Solo visible internamente'}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: a.is_public ? '#1d9d63' : '#ccc',
                        fontSize: 16,
                      }}
                    >
                      <i className={`ti ${a.is_public ? 'ti-eye' : 'ti-eye-off'}`}></i>
                    </button>
                  </td>
                  <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => openEdit(a)}
                      style={{ border: '.5px solid #e0dfd8', background: '#fff', borderRadius: 7, padding: '5px 10px', fontSize: 11.5, color: '#555', marginRight: 6 }}
                    >
                      <i className="ti ti-edit" style={{ fontSize: 12 }}></i>
                    </button>
                    <button
                      onClick={() => deleteActivity(a.id)}
                      style={{ border: '.5px solid #f3c9c9', background: '#fff', borderRadius: 7, padding: '5px 8px', fontSize: 11.5, color: '#c0392b' }}
                    >
                      <i className="ti ti-trash" style={{ fontSize: 12 }}></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && closeForm()}>
          <div className="modal-box" style={{ maxWidth: 560 }}>
            <div className="modal-head">
              <h2>{editing.id ? 'Editar actividad' : 'Añadir actividad'}</h2>
              <div className="modal-x" onClick={closeForm}>
                <i className="ti ti-x"></i>
              </div>
            </div>
            <form onSubmit={saveActivity}>
              <div className="two">
                <div className="field">
                  <label>Fecha</label>
                  <input type="date" name="activity_date" defaultValue={editing.activity_date} required />
                </div>
                <div className="field">
                  <label>Tipo de actividad</label>
                  <select name="activity_type" defaultValue={editing.activity_type} required>
                    {Object.entries(ACTIVITY_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Contacto / institución (opcional)</label>
                <input name="counterpart_name" defaultValue={editing.counterpart_name || ''} placeholder="Ej: Ministerio de Hacienda y Función Pública" />
              </div>
              <div className="field">
                <label>Asunto o proceso normativo</label>
                <input name="subject" defaultValue={editing.subject || ''} placeholder="Ej: Anteproyecto de Ley de..." required />
              </div>
              <div className="field">
                <label>Notas internas (opcional, nunca se hacen públicas)</label>
                <textarea
                  name="notes"
                  defaultValue={editing.notes || ''}
                  placeholder="Detalles internos de la reunión..."
                  style={{ width: '100%', minHeight: 80, padding: '10px 12px', border: '1px solid #e0dfd8', borderRadius: 9, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
                ></textarea>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 14, cursor: 'pointer' }}>
                <input type="checkbox" name="is_public" defaultChecked={editing.is_public} />
                Mostrar esta actividad en mi ficha pública de organización
              </label>
              <div className="m-foot">
                <button type="button" className="m-back" onClick={closeForm}>
                  Cancelar
                </button>
                <button type="submit" className="m-next" disabled={saving}>
                  {saving ? 'Guardando...' : editing.id ? 'Guardar cambios' : 'Registrar actividad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function csvEscape(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
