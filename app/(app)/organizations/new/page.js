'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

const ORG_TYPES = [
  ['empresa', 'Empresa'],
  ['consultora_public_affairs', 'Consultora de Public Affairs'],
  ['tercer_sector_ong', 'Organización del tercer sector / ONG'],
  ['partido_politico', 'Partido político'],
  ['institucion_publica', 'Institución pública (AAPP, Parlamento, Institución europea)'],
  ['think_tank_fundacion', 'Think tank / Fundación'],
  ['medios_comunicacion', 'Medios y comunicación'],
  ['universidad_centro_educativo', 'Universidad / Centro educativo'],
  ['asociacion_profesional', 'Asociación profesional'],
  ['otro', 'Otro'],
];

const ACTIVITY_AREAS = [
  'Public Affairs',
  'Relaciones Institucionales',
  'Comunicación Política',
  'Lobbying',
  'Asuntos Europeos',
  'Regulación',
  'Administración Pública',
  'Gabinete político',
  'Asesoría parlamentaria',
  'Think Tank / Investigación',
  'Derecho público',
  'Fondos europeos',
  'Diplomacia',
];

export default function NewOrganizationPage() {
  const supabase = createClient();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [orgType, setOrgType] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [website, setWebsite] = useState('');
  const [areas, setAreas] = useState([]);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');

  function toggleArea(a) {
    setAreas((prev) => {
      if (prev.includes(a)) return prev.filter((x) => x !== a);
      if (prev.length >= 3) return prev;
      return [...prev, a];
    });
  }

  function goStep2() {
    if (!orgType || !name.trim()) {
      toast('Completa el tipo y el nombre para continuar');
      return;
    }
    setStep(2);
  }

  async function createPage() {
    if (!verified) {
      setError('Debes verificar que eres representante de la organización');
      return;
    }
    if (!location.trim()) {
      setError('Indica al menos una sede');
      return;
    }
    setError('');
    setSaving(true);

    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;

    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .insert({
        name,
        org_type: orgType,
        location,
        website_url: website || null,
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

    if (areas.length > 0) {
      await supabase
        .from('organization_activity_areas')
        .insert(areas.map((area) => ({ organization_id: org.id, area })));
    }

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
      <div className="modal-box" style={{ maxWidth: 560, margin: '30px auto', boxShadow: '0 2px 24px rgba(0,0,0,.07)' }}>
        <div className="modal-head">
          <h2>Nueva página de organización</h2>
        </div>

        <div className="m-steps">
          <div className={`m-sc ${step === 1 ? 'on' : 'done'}`}>1</div>
          <div className={`m-sl ${step > 1 ? 'done' : ''}`}></div>
          <div className={`m-sc ${step === 2 ? 'on' : ''}`}>2</div>
        </div>

        {error && <div className="err-msg">{error}</div>}

        {step === 1 && (
          <div>
            <div className="m-title">
              <h3>Información básica</h3>
              <p>Tipo y nombre de tu organización</p>
            </div>
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
              <label>Nombre *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre de tu organización"
              />
            </div>
            <div className="m-foot">
              <div></div>
              <button className="m-next" onClick={goStep2}>
                Continuar <i className="ti ti-arrow-right"></i>
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
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
            <div className="field">
              <label>Sitio web</label>
              <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="www.organizacion.com" />
            </div>
            <div className="slbl" style={{ textAlign: 'center' }}>
              Áreas de actividad
            </div>
            <div className="m-tag-hint">Elige un máximo de hasta 3 áreas</div>
            <div className="tags" style={{ justifyContent: 'center' }}>
              {ACTIVITY_AREAS.map((a) => (
                <div key={a} className={`tp ${areas.includes(a) ? 'on' : ''}`} onClick={() => toggleArea(a)}>
                  {a}
                </div>
              ))}
            </div>
            <label className="m-check">
              <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
              Verifico que soy un representante autorizado de esta organización y que tengo derecho
              a actuar en su nombre en la creación y gestión de esta página.
            </label>
            <div className="m-foot">
              <button className="m-back" onClick={() => setStep(1)}>
                <i className="ti ti-arrow-left"></i> Atrás
              </button>
              <button className="m-next" disabled={saving} onClick={createPage}>
                {saving ? 'Creando...' : 'Crear página'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
