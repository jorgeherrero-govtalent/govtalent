'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import { hasInterestGroupBadge } from '@/lib/interestGroupBadge';
import { useDragPosition, parsePosition } from '@/lib/useDragPosition';
import { SECTORS } from '@/lib/orgTaxonomy';
import { normalizeUrl } from '@/lib/normalizeUrl';
import { normalizeLocation } from '@/lib/normalizeLocation';


const SECCION = { fontSize: 11, color: '#a8a49c', letterSpacing: '.4px', margin: '0 0 12px' };

const SECCIONES = [
  { id: 'identidad', label: 'Identidad' },
  { id: 'contacto', label: 'Contacto' },
  { id: 'transparencia', label: 'Transparencia' },
  { id: 'descripcion', label: 'Descripción' },
];

export default function CompanyPagePage() {
  const supabase = createClient();
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingOrgCover, setUploadingOrgCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activa, setActiva] = useState('identidad');
  const saltando = useRef(false);

  // Marca la sección en la que estás mientras rellenas. Durante un salto
  // se ignora, o parpadearía al pasar por las intermedias.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entradas) => {
        if (saltando.current) return;
        const visibles = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visibles[0]) setActiva(visibles[0].target.id);
      },
      { rootMargin: '-100px 0px -55% 0px', threshold: 0 }
    );
    for (const sec of SECCIONES) {
      const el = document.getElementById(sec.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  });

  function irA(id) {
    const el = document.getElementById(id);
    if (!el) return;
    saltando.current = true;
    setActiva(id);
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' });
    setTimeout(() => {
      saltando.current = false;
    }, 700);
  }

  const orgNameRef = useRef(null);
  const orgSectorRef = useRef(null);
  const orgBioRef = useRef(null);
  const orgWebsiteRef = useRef(null);
  const orgLinkedinRef = useRef(null);
  const orgSizeRef = useRef(null);
  const orgLocationRef = useRef(null);
  const orgFoundedYearRef = useRef(null);

  const coverDrag = useDragPosition({
    axis: 'xy',
    value: parsePosition(org?.cover_position),
    editable: !!org?.cover_url,
    onCommit: (pos) => saveOrgCoverPosition(pos),
  });
  const logoDrag = useDragPosition({
    axis: 'xy',
    value: parsePosition(org?.logo_position),
    editable: !!org?.logo_url,
    onCommit: (pos) => saveLogoPosition(pos),
  });

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
      .limit(1)
      .maybeSingle();

    if (!membership) return setLoading(false);
    setOrg(membership.organizations);
    setLoading(false);
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !org) return;
    setUploadingLogo(true);
    const ext = file.name.split('.').pop();
    const path = `${org.id}/logo.${ext}`;
    const { error: upErr } = await supabase.storage.from('logos').upload(path, file, { upsert: true });
    setUploadingLogo(false);
    if (upErr) {
      toast('No se pudo subir el logo. Comprueba que existe el bucket "logos".');
      return;
    }
    const { data } = supabase.storage.from('logos').getPublicUrl(path);
    const logoUrl = `${data.publicUrl}?t=${Date.now()}`;
    await supabase.from('organizations').update({ logo_url: logoUrl }).eq('id', org.id);
    setOrg({ ...org, logo_url: logoUrl });
    toast('Logo actualizado ✓');
  }

  async function handleOrgCoverUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !org) return;
    setUploadingOrgCover(true);
    const ext = file.name.split('.').pop();
    const path = `${org.id}/cover.${ext}`;
    const { error: upErr } = await supabase.storage.from('logos').upload(path, file, { upsert: true });
    setUploadingOrgCover(false);
    if (upErr) {
      toast('No se pudo subir la portada. Comprueba que existe el bucket "logos".');
      return;
    }
    const { data } = supabase.storage.from('logos').getPublicUrl(path);
    const coverUrl = `${data.publicUrl}?t=${Date.now()}`;
    await supabase.from('organizations').update({ cover_url: coverUrl }).eq('id', org.id);
    setOrg({ ...org, cover_url: coverUrl });
    toast('Portada actualizada ✓');
  }

  async function saveLogoPosition(pos) {
    const value = `${pos.x}% ${pos.y}%`;
    setOrg((prev) => ({ ...prev, logo_position: value }));
    await supabase.from('organizations').update({ logo_position: value }).eq('id', org.id);
  }

  async function saveOrgCoverPosition(pos) {
    const value = `${pos.x}% ${pos.y}%`;
    setOrg((prev) => ({ ...prev, cover_position: value }));
    await supabase.from('organizations').update({ cover_position: value }).eq('id', org.id);
  }

  async function saveOrgEdit(e) {
    e.preventDefault();
    const f = new FormData(e.target);

    const interestGroupRegistered = f.get('interest_group_registered') === 'on';
    const interestGroupRegistryNumber = f.get('interest_group_registry_number') || '';
    const interestGroupRegisteredAt = f.get('interest_group_registered_at') || '';
    if (interestGroupRegistered && (!interestGroupRegistryNumber.trim() || !interestGroupRegisteredAt)) {
      toast('Si marcáis que estáis inscritos como grupo de interés, indica también el número de inscripción y la fecha');
      return;
    }

    setSaving(true);
    const updates = {
      name: f.get('name'),
      website_url: f.get('website_url') ? normalizeUrl(f.get('website_url')) : null,
      linkedin_url: f.get('linkedin_url') ? normalizeUrl(f.get('linkedin_url')) : null,
      sector: f.get('sector') || null,
      size_range: f.get('size_range') || null,
      location: f.get('location') ? normalizeLocation(f.get('location')) : null,
      founded_year: f.get('founded_year') ? Number(f.get('founded_year')) : null,
      bio: f.get('bio') || null,
      notification_email: f.get('notification_email') || null,
      interest_group_registered: interestGroupRegistered,
      interest_group_registry_number: interestGroupRegistryNumber || null,
      interest_group_registered_at: interestGroupRegisteredAt || null,
    };
    const { error } = await supabase.from('organizations').update(updates).eq('id', org.id);
    setSaving(false);
    if (error) {
      toast('No se pudieron guardar los cambios');
      return;
    }
    setOrg({ ...org, ...updates });
    toast('Página de empresa actualizada ✓ (visible para ti y para los candidatos)');
  }


  // Una sola declaración, en el ámbito del componente: dentro del
  // if (!org) no existía para el return principal.
  const estilos = `
    .co-form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 170px); gap: 26px; align-items: start; }
    .co-indice { position: sticky; top: 90px; display: flex; flex-direction: column; gap: 2px; }
    .co-campos section { padding-bottom: 22px; }
    @media (max-width: 860px) {
      .co-form { grid-template-columns: minmax(0, 1fr); gap: 0; }
      .co-indice {
        position: sticky;
        top: 64px;
        z-index: 3;
        flex-direction: row;
        overflow-x: auto;
        background: #fff;
        padding: 10px 0;
        margin-bottom: 14px;
        order: -1;
        scrollbar-width: none;
      }
      .co-indice::-webkit-scrollbar { display: none; }
    }
  `;

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
    <div className="sec" style={{ maxWidth: 900 }}>
      <style>{estilos}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 700 }}>Página de empresa</h2>
          <p style={{ fontSize: 13, color: '#888' }}>Así es como te ven los candidatos y el resto de organizaciones en GovTalent.</p>
        </div>
        <a
          href={`/organizations/${org.slug}`}
          target="_blank"
          rel="noreferrer"
          className="btn-o"
          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
        >
          <i className="ti ti-eye"></i> Ver como candidato
        </a>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div
          ref={coverDrag.containerRef}
          className="co-cover"
          {...coverDrag.bind}
          style={
            org.cover_url
              ? {
                  backgroundImage: `url(${org.cover_url})`,
                  backgroundSize: 'cover',
                  backgroundPosition: coverDrag.backgroundPosition,
                  ...coverDrag.bind.style,
                }
              : undefined
          }
        >
          {org.cover_url && (
            <div className={`drag-hint ${coverDrag.hover || coverDrag.dragging ? 'on' : ''}`}>
              <i className="ti ti-arrows-move"></i> Arrastra para ajustar
            </div>
          )}
          <label
            title="Cambiar portada"
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 11,
              right: 11,
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(0,0,0,.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#fff',
            }}
          >
            {uploadingOrgCover ? <i className="ti ti-loader-2" style={{ fontSize: 15 }}></i> : <i className="ti ti-camera" style={{ fontSize: 15 }}></i>}
            <input type="file" accept="image/*" hidden onChange={handleOrgCoverUpload} disabled={uploadingOrgCover} />
          </label>

          <div
            ref={logoDrag.containerRef}
            className="co-logo"
            {...logoDrag.bind}
            style={{
              ...logoDrag.bind.style,
              backgroundImage: org.logo_url ? `url(${org.logo_url})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: logoDrag.backgroundPosition,
            }}
          >
            {!org.logo_url && '🏛️'}
            {org.logo_url && (
              <div className={`drag-hint ${logoDrag.hover || logoDrag.dragging ? 'on' : ''}`} style={{ fontSize: 9 }}>
                <i className="ti ti-arrows-move"></i>
              </div>
            )}
            <label
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                bottom: 1,
                right: 1,
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: '#1d6f5c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              {uploadingLogo ? (
                <i className="ti ti-loader-2" style={{ fontSize: 12, color: '#fff' }}></i>
              ) : (
                <i className="ti ti-camera" style={{ fontSize: 12, color: '#fff' }}></i>
              )}
              <input type="file" accept="image/*" hidden onChange={handleLogoUpload} disabled={uploadingLogo} />
            </label>
          </div>
        </div>
        <div className="co-info">
          <div style={{ fontSize: 17.5, fontWeight: 700, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
            {org.name}
            {org.verified && (
              <span className="tt">
                <i className="ti ti-circle-check-filled" style={{ color: '#2563eb', fontSize: 15.5 }}></i>
                <span className="tt-bubble">Página verificada por la organización</span>
              </span>
            )}
            {hasInterestGroupBadge(org) && (
              <span className="tt">
                <i className="ti ti-shield-check" style={{ color: '#6d5aef', fontSize: 15.5 }}></i>
                <span className="tt-bubble">
                  Grupo de interés registrado{org.interest_group_registry_number ? ` · ${org.interest_group_registry_number}` : ''}
                </span>
              </span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: '#555' }}>{org.bio || org.sector || 'Añade una descripción'}</div>
        </div>
      </div>

      <div className="card">
        <div className="cp">


          {/* Cuatro secciones con índice fijo, como en un proyecto: el
              formulario tenía once campos seguidos y había que recorrerlo
              entero para encontrar cualquier cosa.

              Sigue siendo un solo formulario: las secciones se recorren,
              no se ocultan, y se guarda todo de una vez. */}
          <form onSubmit={saveOrgEdit} className="co-form">
            <div className="co-campos">

            <section id="identidad" style={{ scrollMarginTop: 90 }}>
            <div style={SECCION}>IDENTIDAD</div>
            <div className="field">
              <label>Nombre de la organización</label>
              <input ref={orgNameRef} name="name" defaultValue={org.name} required />
            </div>
            <div className="two">
              <div className="field">
                <label>Sitio web</label>
                <input ref={orgWebsiteRef} name="website_url" defaultValue={org.website_url || ''} placeholder="https://organizacion.com" />
              </div>
              <div className="field">
                <label>LinkedIn URL</label>
                <input ref={orgLinkedinRef} name="linkedin_url" defaultValue={org.linkedin_url || ''} placeholder="https://linkedin.com/company/..." />
              </div>
            </div>
            <div className="two">
              <div className="field">
                <label>Sector</label>
                <select ref={orgSectorRef} name="sector" defaultValue={org.sector || ''}>
                  <option value="">Sin especificar</option>
                  {SECTORS.map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Nº de empleados</label>
                <select ref={orgSizeRef} name="size_range" defaultValue={org.size_range || ''}>
                  <option value="">Sin especificar</option>
                  <option value="1-10">1-10 empleados</option>
                  <option value="11-50">11-50 empleados</option>
                  <option value="50-200">50-200 empleados</option>
                  <option value="200-1000">200-1000 empleados</option>
                  <option value="+1000">+1000 empleados</option>
                </select>
              </div>
            </div>
            <div className="two">
              <div className="field">
                <label>Sede</label>
                <input ref={orgLocationRef} name="location" defaultValue={org.location || ''} />
              </div>
              <div className="field">
                <label>Año de fundación</label>
                <input ref={orgFoundedYearRef} name="founded_year" type="number" defaultValue={org.founded_year || ''} />
              </div>
            </div>

            </section>

            <section id="contacto" style={{ scrollMarginTop: 90 }}>
            <div style={SECCION}>CONTACTO</div>
            <div className="field">
              <label>Email de notificaciones</label>
              <input name="notification_email" type="email" defaultValue={org.notification_email || ''} placeholder="rrhh@organizacion.com" />
              <p style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                A esta dirección llegarán los avisos de nuevas candidaturas — puede ser distinta del email con el
                que gestionas esta página. Si lo dejas vacío, avisaremos a las cuentas con acceso de administrador.
              </p>
            </div>

            </section>

            <section id="transparencia" style={{ scrollMarginTop: 90 }}>
            <div style={SECCION}>TRANSPARENCIA</div>
            <div
              style={{
                background: '#f8faf9',
                border: '1px solid #d3e8df',
                borderRadius: 10,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <i className="ti ti-shield-check" style={{ color: '#1d6f5c', fontSize: 15 }}></i>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Registro de Grupos de Interés</span>
              </div>
              <p style={{ fontSize: 11.5, color: '#888', marginBottom: 10 }}>
                Si tu organización realiza actividad de influencia ante altos cargos o personal público, la Ley de
                Transparencia e Integridad de los Grupos de Interés obliga a inscribirse en el registro estatal
                correspondiente. Si ya lo has hecho, indícalo aquí para mostrarlo en tu página pública.
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10, cursor: 'pointer' }}>
                <input type="checkbox" name="interest_group_registered" defaultChecked={org.interest_group_registered} />
                Estamos inscritos como grupo de interés
              </label>
              <div className="two">
                <div className="field">
                  <label>Nº de inscripción</label>
                  <input name="interest_group_registry_number" defaultValue={org.interest_group_registry_number || ''} placeholder="Ej: RGI-2026-00123" />
                </div>
                <div className="field">
                  <label>Fecha de inscripción</label>
                  <input name="interest_group_registered_at" type="date" defaultValue={org.interest_group_registered_at || ''} />
                </div>
              </div>
              <a href="/organizations/admin/influence-log" style={{ fontSize: 12, color: '#1d6f5c', display: 'inline-block', marginTop: 8 }}>
                Ir al registro de actividad de influencia →
              </a>
            </div>

            </section>

            <section id="descripcion" style={{ scrollMarginTop: 90 }}>
            <div style={SECCION}>DESCRIPCIÓN</div>
            <div className="field">
              <label>Descripción de la organización</label>
              <textarea
                ref={orgBioRef}
                name="bio"
                defaultValue={org.bio || ''}
                placeholder="Cuenta a qué se dedica la organización..."
                style={{ width: '100%', minHeight: 110, padding: '10px 12px', border: '1px solid #e0dfd8', borderRadius: 9, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
              ></textarea>
            </div>

            <button className="btn-p" style={{ width: '100%' }} disabled={saving}>
              <i className="ti ti-check"></i> {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
            </section>
            </div>

            {/* El índice, fijo mientras se rellena. Mismas pastillas que
                Seguimiento: fondo lila y texto morado, sin subrayado. */}
            <nav className="co-indice" aria-label="Secciones">
              {SECCIONES.map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => irA(sec.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 7,
                    fontSize: 12.5,
                    cursor: 'pointer',
                    border: 'none',
                    textAlign: 'left',
                    background: activa === sec.id ? '#f0eefe' : 'transparent',
                    color: activa === sec.id ? '#6d5aef' : '#8b8780',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {sec.label}
                </button>
              ))}
            </nav>
          </form>
        </div>
      </div>
    </div>
  );
}
