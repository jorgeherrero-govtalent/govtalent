'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

export default function EventsPage() {
  const supabase = createClient();
  const [events, setEvents] = useState(null);
  const [userId, setUserId] = useState(null);
  const [myOrgId, setMyOrgId] = useState(null);
  const [registered, setRegistered] = useState(new Set());
  const [saved, setSaved] = useState(new Set());
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    setUserId(uid);

    if (uid) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', uid)
        .maybeSingle();
      if (membership) setMyOrgId(membership.organization_id);

      const { data: regs } = await supabase.from('event_registrations').select('event_id').eq('user_id', uid);
      setRegistered(new Set((regs || []).map((r) => r.event_id)));

      const { data: sv } = await supabase.from('saved_events').select('event_id').eq('user_id', uid);
      setSaved(new Set((sv || []).map((s) => s.event_id)));
    }

    const { data } = await supabase
      .from('events')
      .select('*, organizations(name)')
      .order('event_date', { ascending: true });
    setEvents(data || []);
  }

  async function toggleRegister(eventId) {
    if (!userId) return;
    if (registered.has(eventId)) {
      await supabase.from('event_registrations').delete().eq('user_id', userId).eq('event_id', eventId);
      setRegistered((prev) => {
        const n = new Set(prev);
        n.delete(eventId);
        return n;
      });
      toast('Inscripción cancelada');
    } else {
      await supabase.from('event_registrations').insert({ user_id: userId, event_id: eventId });
      setRegistered((prev) => new Set(prev).add(eventId));
      toast('Inscripción registrada ✓');
    }
  }

  async function toggleSave(eventId) {
    if (!userId) return;
    if (saved.has(eventId)) {
      await supabase.from('saved_events').delete().eq('user_id', userId).eq('event_id', eventId);
      setSaved((prev) => {
        const n = new Set(prev);
        n.delete(eventId);
        return n;
      });
    } else {
      await supabase.from('saved_events').insert({ user_id: userId, event_id: eventId });
      setSaved((prev) => new Set(prev).add(eventId));
      toast('Guardado');
    }
  }

  async function createEvent(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const { error } = await supabase.from('events').insert({
      organization_id: myOrgId,
      title: f.get('title'),
      description: f.get('description'),
      location: f.get('location'),
      event_date: f.get('event_date'),
      start_time: f.get('start_time') || null,
      end_time: f.get('end_time') || null,
    });
    if (error) {
      toast('No se pudo publicar el evento');
      return;
    }
    toast('Evento publicado ✓');
    setShowForm(false);
    e.target.reset();
    load();
  }

  return (
    <div className="sec">
      <div className="ev-hero" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h2>Eventos del sector</h2>
          <p>Congresos, jornadas y foros de asuntos públicos, política y relaciones institucionales</p>
        </div>
        {myOrgId && (
          <button className="btn-p" style={{ background: '#fff', color: '#1d6f5c', flexShrink: 0 }} onClick={() => setShowForm(!showForm)}>
            <i className="ti ti-calendar-plus"></i> Publicar un evento
          </button>
        )}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="cp">
            <form onSubmit={createEvent}>
              <div className="form-g">
                <label>Título del evento</label>
                <input name="title" required />
              </div>
              <div className="form-row">
                <div className="form-g">
                  <label>Fecha</label>
                  <input name="event_date" type="date" required />
                </div>
                <div className="form-g">
                  <label>Ubicación</label>
                  <input name="location" placeholder="Madrid, España u Online" required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-g">
                  <label>Hora inicio</label>
                  <input name="start_time" type="time" />
                </div>
                <div className="form-g">
                  <label>Hora fin</label>
                  <input name="end_time" type="time" />
                </div>
              </div>
              <div className="form-g">
                <label>Descripción</label>
                <textarea name="description"></textarea>
              </div>
              <button className="btn-p">Publicar evento</button>
            </form>
          </div>
        </div>
      )}

      {events === null ? (
        <div className="spinner"></div>
      ) : events.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-calendar-off"></i>
            Todavía no hay eventos publicados.
          </div>
        </div>
      ) : (
        <div className="ev-grid">
          {events.map((ev) => (
            <div className="ev-card" key={ev.id}>
              <div className="ev-img" style={{ background: '#e8f4f0' }}>
                🏛️
              </div>
              <div className="ev-body">
                <div className="ev-date">
                  <i className="ti ti-calendar" style={{ fontSize: 11 }}></i> {formatDate(ev.event_date)}
                </div>
                <div className="ev-title">{ev.title}</div>
                <div className="ev-meta">
                  <span>
                    <i className="ti ti-map-pin" style={{ fontSize: 11 }}></i> {ev.location}
                  </span>
                  {ev.start_time && (
                    <span>
                      <i className="ti ti-clock" style={{ fontSize: 11 }}></i> {ev.start_time.slice(0, 5)}
                      {ev.end_time ? `–${ev.end_time.slice(0, 5)}` : ''}
                    </span>
                  )}
                  {ev.organizations?.name && (
                    <span>
                      <i className="ti ti-building" style={{ fontSize: 11 }}></i> {ev.organizations.name}
                    </span>
                  )}
                </div>
              </div>
              <div className="ev-actions">
                <button className="btn-p" style={{ flex: 1, padding: 7, fontSize: 12.5 }} onClick={() => toggleRegister(ev.id)}>
                  {registered.has(ev.id) ? 'Inscrito ✓' : 'Inscribirme'}
                </button>
                <button className="btn-g" onClick={() => toggleSave(ev.id)}>
                  <i className="ti ti-bookmark"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d
    .toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
    .toUpperCase()
    .replace('.', '');
}
