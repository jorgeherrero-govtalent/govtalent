'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import { ORG_TYPES, SECTORS } from '@/lib/orgTaxonomy';
import { normalizeLocation } from '@/lib/normalizeLocation';
import Interruptor from '@/components/Interruptor';


export default function NewOrganizationPage() {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [checkingMembership, setCheckingMembership] = useState(true);
  const [existingOrg, setExistingOrg] = useState(null);

  const [orgType, setOrgType] = useState('');
  const [sector, setSector] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    checkExistingMembership();
  }, []);

  async function checkExistingMembership() {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) {
      setCheckingMembership(false);
      return;
    }
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organizations(name, slug)')
      .eq('user_id', uid)
      .limit(1)
      .maybeSingle();
    if (membership?.organizations) setExistingOrg(membership.organizations);
    setCheckingMembership(false);
  }

  async function createPage() {
    // Los tres obligatorios se comprueban juntos y en orden de lectura.
    // Antes el tipo y el nombre se validaban al pasar de paso y la sede
    // al crear, así que dos campos del mismo formulario avisaban en
    // momentos distintos.
    if (!name.trim()) {
      setError('Indica el nombre de tu organización');
      return;
    }
    if (!orgType) {
      setError('Elige el tipo de organización');
      return;
    }
    if (!location.trim()) {
      setError('Indica al menos una sede');
      return;
    }
    if (!verified) {
      setError('Confirma que eres representante autorizado de la organización');
      return;
    }
    setError('');
    setSaving(true);

    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;

    const { data: alreadyMember } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', uid)
      .limit(1)
      .maybeSingle();
    if (alreadyMember) {
      setSaving(false);
      setError('Tu cuenta ya administra una organización. Recarga la página.');
      return;
    }

    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .insert({
        name,
        org_type: orgType,
        sector: sector || null,
        location: normalizeLocation(location),
        claimed: true,
      })
      .select()
      .single();

    if (orgErr || !org) {
      setSaving(false);
      setError('No se pudo crear la página. Inténtalo de nuevo.');
      return;
    }

    await supabase.from('organization_members').insert({
      organization_id: org.id,
      user_id: uid,
      role: 'admin',
    });

    // Alguien que crea una página de organización ya no necesita pasar por
    // el onboarding de candidato (elige "Organización" y llega hasta aquí).
    await supabase
      .from('users')
      .update({ onboarding_completed: true, role: 'org_admin' })
      .eq('id', uid);

    setSaving(false);
    toast('Página creada correctamente ✓');

    fetch('/api/email/welcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'organization', orgId: org.id }),
    }).catch((err) => console.error('Error enviando email de bienvenida:', err));

    window.location.href = '/organizations/admin';
  }

  return (
    <div className="sec">
      {checkingMembership ? (
        <div className="spinner" style={{ margin: '60px auto' }}></div>
      ) : existingOrg ? (
        <div className="modal-box" style={{ maxWidth: 460, margin: '60px auto', textAlign: 'center', padding: '32px 28px' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: '#f0f8f5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px',
            }}
          >
            <i className="ti ti-building-community" style={{ fontSize: 24, color: '#1d6f5c' }}></i>
          </div>
          <h2 style={{ fontSize: 17, marginBottom: 8 }}>Ya administras una organización</h2>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 20, lineHeight: 1.6 }}>
            Tu cuenta ya gestiona la página de <b>{existingOrg.name}</b>. Cada cuenta puede administrar una única organización por
            ahora. Si necesitas gestionar más de una, escríbenos y te ayudamos.
          </p>
          <a href="/organizations/admin" className="mbtn" style={{ display: 'inline-block', textDecoration: 'none' }}>
            Ir al panel de {existingOrg.name}
          </a>
        </div>
      ) : (
        <div
          className="modal-box"
          style={{ maxWidth: 560, margin: '30px auto', boxShadow: '0 2px 24px rgba(0,0,0,.07)', padding: '22px 24px' }}
        >
          {/* La placa morada y el filete del interruptor son los dos
              únicos toques de color: el morado es lo de Pro y lo de
              Seguimiento, y aquí sirve para que la tarjeta no sea un
              formulario gris más. El botón se queda verde, que es el
              color de las acciones en el resto de la aplicación. */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, marginBottom: 5 }}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: '#f0eefe',
                color: '#6d5aef',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              <i className="ti ti-building-store" style={{ fontSize: 17 }}></i>
            </span>
            <h2 style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35, margin: 0, minWidth: 0 }}>
              Crea tu página y empieza a publicar ofertas de manera gratuita
            </h2>
          </div>
          <p style={{ fontSize: 11.5, color: '#8b8780', lineHeight: 1.55, margin: '0 0 18px 43px' }}>
            Gestiona las candidaturas con herramientas de reclutamiento avanzadas.
          </p>

          {error && <div className="err-msg">{error}</div>}

          <div className="field">
            <label>Nombre *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de tu organización"
            />
          </div>

          {/* Tipo y sector en dos columnas: son dos desplegables cortos y
              apilados dejaban la tarjeta más alta de lo que hace falta. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
            <div className="field">
              <label>Tipo de organización *</label>
              <select value={orgType} onChange={(e) => setOrgType(e.target.value)}>
                <option value="">Elegir uno</option>
                {ORG_TYPES.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              {/* "opcional" en la etiqueta y no escondido dentro del
                  desplegable: se sabe antes de abrirlo. */}
              <label>
                Sector <span style={{ color: '#a8a49c', fontWeight: 400 }}>· opcional</span>
              </label>
              <select value={sector} onChange={(e) => setSector(e.target.value)}>
                <option value="">Elegir uno</option>
                {SECTORS.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Sede *</label>
            <div style={{ position: 'relative' }}>
              <i
                className="ti ti-map-pin"
                style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#bbb', fontSize: 14 }}
              ></i>
              <input
                style={{ paddingLeft: 30 }}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ciudad, País"
              />
            </div>
          </div>

          {/* La declaración de representante en su propia caja: es lo
              único de esta pantalla con consecuencias, y como casilla
              pesaba lo mismo que "Sitio web".

              El aviso de la documentación va aquí, en el momento en que
              se afirma ser representante, y no en una pantalla posterior
              donde ya sonaría a letra pequeña. */}
          <div
            style={{
              background: '#f7f6fe',
              borderLeft: '2px solid #6d5aef',
              borderRadius: '0 9px 9px 0',
              padding: '13px 15px',
              margin: '6px 0 18px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <Interruptor
              activo={verified}
              onChange={() => setVerified((v) => !v)}
              etiqueta="Soy representante autorizado de esta organización"
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 3 }}>Soy representante autorizado</div>
              <div style={{ fontSize: 11.5, color: '#666', lineHeight: 1.55 }}>
                Puedo actuar en nombre de esta organización. Para completar la página te pediremos
                documentación legal que lo acredite.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, color: '#a8a49c' }}>Podrás editarlo todo después.</span>
            <button className="m-next" disabled={saving} onClick={createPage}>
              {saving ? 'Creando…' : 'Crear página'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
