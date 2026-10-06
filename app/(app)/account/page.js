'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import BloquePlanCuenta from '@/components/BloquePlanCuenta';
import BloqueSeguridad from '@/components/BloqueSeguridad';
import SelectorFecha from '@/components/SelectorFecha';

/**
 * Configuración (/account).
 *
 * Al estilo de la de Enginy (06-10-2026): pestañas arriba y, dentro,
 * secciones de filas con el dato a la izquierda y la acción a la derecha.
 *
 *   General     la organización (logo, nombre, datos legales, registro) y
 *               el usuario (foto, nombre, correo, novedades).
 *   Seguridad   contraseña y eliminar la cuenta.
 *   Equipo      los miembros de la organización.
 *   Plan        Vigilancia, Directorio y la suscripción.
 *
 * Absorbe lo que quedaba útil de /organizations/admin/settings, que ahora
 * redirige aquí. Lo de empleo (teléfono para candidaturas, información
 * personal, desactivar la página pública) sale de la pantalla porque
 * Empleo está escondido; los datos siguen en la base.
 *
 * Los datos de la organización solo los edita quien la administra: salen
 * en las actas, que tienen valor probatorio.
 */

const MORADO = '#6d5aef';
const BORDE = '#e8e6df';

const CARD = { background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };
const LABEL = { fontSize: 11, color: '#a8a49c', letterSpacing: '.4px', marginBottom: 14 };

const BOTON = {
  background: MORADO,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 12.5,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const BOTON_SEC = {
  background: '#f5f4f1',
  color: '#57534e',
  border: 'none',
  borderRadius: 8,
  padding: '9px 16px',
  fontSize: 12.5,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
// El botón de las filas, como en Enginy: blanco con borde fino.
const BOTON_FILA = {
  background: '#fff',
  color: '#1a1a18',
  border: `1px solid ${BORDE}`,
  borderRadius: 8,
  padding: '7px 13px',
  fontSize: 12.5,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontFamily: 'inherit',
  flexShrink: 0,
};

const TIPOS_ORG = [
  { v: 'empresa', label: 'Empresa' },
  { v: 'consultora', label: 'Consultora de asuntos públicos' },
  { v: 'patronal', label: 'Patronal o asociación empresarial' },
  { v: 'asociacion', label: 'Asociación o federación' },
  { v: 'fundacion', label: 'Fundación o think tank' },
  { v: 'despacho', label: 'Despacho profesional' },
  { v: 'sindicato', label: 'Sindicato' },
  { v: 'otra', label: 'Otra' },
];

const PESTANAS = [
  { id: 'general', label: 'General' },
  { id: 'seguridad', label: 'Seguridad' },
  { id: 'equipo', label: 'Equipo' },
  { id: 'plan', label: 'Plan' },
];

const ROLES = { admin: 'Administrador', editor: 'Miembro' };

function iniciales(texto) {
  const partes = String(texto || '?').trim().split(/\s+/);
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?';
}

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
        background: activo ? MORADO : '#e0dfd8',
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

/** Una sección: rótulo gris y una caja con filas separadas por línea. */
function Seccion({ titulo, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 13, color: '#8b8780', margin: '0 0 7px 4px' }}>{titulo}</div>
      <div style={{ ...CARD, border: `1px solid ${BORDE}`, boxShadow: 'none', overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

/** Una fila: título y detalle a la izquierda, acción a la derecha. */
function Fila({ titulo, detalle, accion, primera, children }) {
  return (
    <div style={{ padding: '14px 18px', borderTop: primera ? 'none' : `1px solid ${BORDE}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a18' }}>{titulo}</div>
          {detalle ? (
            <div style={{ fontSize: 13, color: '#6f6c64', marginTop: 3, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
              {detalle}
            </div>
          ) : null}
        </div>
        {accion}
      </div>
      {children}
    </div>
  );
}

/** Círculo con imagen o iniciales que, si se puede, abre el selector de archivo. */
function Circulo({ url, texto, onArchivo, subiendo, etiqueta, cuadrado }) {
  const ref = useRef(null);
  const forma = cuadrado ? 9 : '50%';
  const contenido = url ? (
    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  ) : (
    iniciales(texto)
  );
  const estilo = {
    width: 40,
    height: 40,
    borderRadius: forma,
    background: '#f0eefe',
    color: '#3c3489',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 600,
    overflow: 'hidden',
    flexShrink: 0,
    border: `1px solid ${BORDE}`,
    padding: 0,
    opacity: subiendo ? 0.5 : 1,
  };
  if (!onArchivo) return <div style={estilo}>{contenido}</div>;
  return (
    <>
      <button
        type="button"
        aria-label={etiqueta}
        title={etiqueta}
        onClick={() => ref.current?.click()}
        style={{ ...estilo, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        {contenido}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        style={{ display: 'none' }}
        onChange={(e) => {
          onArchivo(e);
          e.target.value = '';
        }}
      />
    </>
  );
}

export default function AccountPage() {
  const supabase = createClient();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('general');
  const [view, setView] = useState('main'); // 'main' | 'delete-confirm' | 'delete-done'
  const [deleting, setDeleting] = useState(false);

  // Organización: la fila, el rol y los datos legales en edición.
  const [org, setOrg] = useState(null);
  const [esAdmin, setEsAdmin] = useState(false);
  const [miembros, setMiembros] = useState(null);

  // Qué fila se está editando: 'nombre' | 'org-nombre' | 'legal' | 'registro' | null
  const [editando, setEditando] = useState(null);
  const [borrador, setBorrador] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(null); // 'avatar' | 'logo' | null
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    // La pestaña va en la URL (?tab=plan) para poder enlazarla, pero se lee
    // aquí y no con useSearchParams, que obliga a envolver la página en
    // Suspense.
    const inicial = new URLSearchParams(window.location.search).get('tab');
    if (PESTANAS.some((p) => p.id === inicial)) setTab(inicial);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cambiarTab(id) {
    setTab(id);
    setEditando(null);
    const url = new URL(window.location.href);
    if (id === 'general') url.searchParams.delete('tab');
    else url.searchParams.set('tab', id);
    window.history.replaceState(null, '', url.toString());
  }

  async function load() {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return setLoading(false);
    const [{ data: profile }, { data: membresia }] = await Promise.all([
      supabase.from('users').select('*').eq('id', authData.user.id).single(),
      supabase
        .from('organization_members')
        .select(
          'role, organizations(id, name, slug, logo_url, plan, plan_status, legal_name, tax_id, org_type, registered_address, cbtg_registry_number, cbtg_registered_at)'
        )
        .eq('user_id', authData.user.id)
        .limit(1)
        .maybeSingle(),
    ]);
    setUser(profile);
    if (profile?.deletion_requested_at) setView('delete-done');
    const o = membresia?.organizations || null;
    setOrg(o);
    setEsAdmin(membresia?.role === 'admin');
    setLoading(false);

    if (o?.id) {
      const { data } = await supabase
        .from('organization_members')
        .select('user_id, role, users(first_name, last_name, email, avatar_url)')
        .eq('organization_id', o.id);
      setMiembros(data || []);
    }
  }

  function editar(fila, valores) {
    setEditando(fila);
    setBorrador(valores);
  }

  async function guardarUsuario(cambios, mensaje = 'Guardado') {
    setGuardando(true);
    const { error } = await supabase.from('users').update(cambios).eq('id', user.id);
    setGuardando(false);
    if (error) {
      toast.error('No se ha podido guardar');
      return false;
    }
    setUser({ ...user, ...cambios });
    toast(mensaje);
    return true;
  }

  async function guardarOrg(cambios, mensaje = 'Guardado') {
    setGuardando(true);
    const { error } = await supabase.from('organizations').update(cambios).eq('id', org.id);
    setGuardando(false);
    if (error) {
      toast.error('No se ha podido guardar');
      return false;
    }
    setOrg({ ...org, ...cambios });
    toast(mensaje);
    return true;
  }

  async function guardarNombre() {
    const nombre = (borrador.first_name || '').trim();
    const apellidos = (borrador.last_name || '').trim();
    if (!nombre || !apellidos) {
      toast.info('El nombre y los apellidos no pueden quedar vacíos');
      return;
    }
    if (await guardarUsuario({ first_name: nombre, last_name: apellidos })) setEditando(null);
  }

  async function guardarNombreOrg() {
    const nombre = (borrador.name || '').trim();
    if (!nombre) {
      toast.info('El nombre no puede quedar vacío');
      return;
    }
    if (await guardarOrg({ name: nombre })) setEditando(null);
  }

  async function guardarLegal() {
    const ok = await guardarOrg(
      {
        legal_name: (borrador.legal_name || '').trim() || null,
        tax_id: (borrador.tax_id || '').trim() || null,
        org_type: borrador.org_type || null,
        registered_address: (borrador.registered_address || '').trim() || null,
      },
      'Datos guardados'
    );
    if (ok) setEditando(null);
  }

  async function guardarRegistro() {
    const ok = await guardarOrg(
      {
        cbtg_registry_number: (borrador.cbtg_registry_number || '').trim() || null,
        cbtg_registered_at: borrador.cbtg_registered_at || null,
      },
      'Datos guardados'
    );
    if (ok) setEditando(null);
  }

  // Misma subida que tenían la página de empresa y el perfil: buckets
  // públicos `logos` y `avatars`, una ruta fija por dueño.
  async function subirImagen(e, tipo) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.info('La imagen no puede pasar de 5 MB');
      return;
    }
    setSubiendo(tipo);
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const bucket = tipo === 'logo' ? 'logos' : 'avatars';
    const ruta = tipo === 'logo' ? `${org.id}/logo.${ext}` : `${user.id}/avatar.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(ruta, file, { upsert: true });
    if (error) {
      setSubiendo(null);
      toast.error('No se ha podido subir la imagen');
      return;
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(ruta);
    const url = `${data.publicUrl}?t=${Date.now()}`;
    if (tipo === 'logo') await guardarOrg({ logo_url: url }, 'Logo actualizado');
    else await guardarUsuario({ avatar_url: url }, 'Foto actualizada');
    setSubiendo(null);
  }

  async function toggleMarketingEmails() {
    setSavingPrefs(true);
    await guardarUsuario({ marketing_emails_enabled: !user.marketing_emails_enabled });
    setSavingPrefs(false);
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
          <i className="ti ti-arrow-left" style={{ fontSize: 14 }}></i> Configuración
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

  const nombreCompleto = [user.first_name, user.last_name].filter(Boolean).join(' ');
  const tipoOrg = TIPOS_ORG.find((x) => x.v === org?.org_type)?.label;
  const legalResumen = org
    ? [org.legal_name, org.tax_id, tipoOrg].filter(Boolean).join(' · ') || 'Sin completar'
    : null;
  const usuariosPlan = Number(user.plan_usuarios) || 1;

  const acciones = (onGuardar) => (
    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
      <button type="button" style={BOTON} disabled={guardando} onClick={onGuardar}>
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
      <button type="button" style={BOTON_SEC} disabled={guardando} onClick={() => setEditando(null)}>
        Cancelar
      </button>
    </div>
  );

  const campo = (k, etiqueta, placeholder, extra = {}) => (
    <div className="field" style={{ flex: 1, minWidth: 180, marginBottom: 10, ...extra }}>
      <label>{etiqueta}</label>
      <input
        value={borrador[k] ?? ''}
        onChange={(e) => setBorrador({ ...borrador, [k]: e.target.value })}
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <div className="sec" style={{ maxWidth: 880 }}>
      <style>{`
        .cfg-tabs { display: flex; gap: 6px; border-bottom: 1px solid ${BORDE}; margin: 18px 0 22px; overflow-x: auto; scrollbar-width: none; }
        .cfg-tabs::-webkit-scrollbar { display: none; }
        .cfg-tab { background: none; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; padding: 10px 14px; font-size: 14px; color: #8b8780; cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
        .cfg-tab:hover { color: #1a1a18; }
        .cfg-tab.on { color: #1a1a18; font-weight: 600; border-bottom-color: #1a1a18; }
        .cfg-edit { display: flex; flex-wrap: wrap; gap: 0 10px; margin-top: 14px; }
      `}</style>

      <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, letterSpacing: '-.3px' }}>Configuración</h1>

      <div className="cfg-tabs" role="tablist">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={tab === p.id}
            className={`cfg-tab${tab === p.id ? ' on' : ''}`}
            onClick={() => cambiarTab(p.id)}
          >
            {p.label}
            {p.id === 'equipo' && esAdmin && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: '#3c3489',
                  background: '#f0eefe',
                  borderRadius: 6,
                  padding: '2px 7px',
                }}
              >
                Admin
              </span>
            )}
          </button>
        ))}
      </div>

      {/* --- General ------------------------------------------------------ */}
      {tab === 'general' && (
        <>
          {org && (
            <Seccion titulo="Organización">
              <Fila
                primera
                titulo="Logo de la organización"
                detalle={esAdmin ? 'Cambia el logo de la organización.' : 'Solo la administración puede cambiarlo.'}
                accion={
                  <Circulo
                    url={org.logo_url}
                    texto={org.name}
                    cuadrado
                    subiendo={subiendo === 'logo'}
                    etiqueta="Cambiar el logo"
                    onArchivo={esAdmin ? (e) => subirImagen(e, 'logo') : null}
                  />
                }
              />
              <Fila
                titulo="Nombre para mostrar"
                detalle={editando === 'org-nombre' ? null : org.name}
                accion={
                  esAdmin && editando !== 'org-nombre' ? (
                    <button type="button" style={BOTON_FILA} onClick={() => editar('org-nombre', { name: org.name || '' })}>
                      Editar nombre
                    </button>
                  ) : null
                }
              >
                {editando === 'org-nombre' && (
                  <>
                    <div className="cfg-edit">{campo('name', 'Nombre', 'Nombre comercial')}</div>
                    {acciones(guardarNombreOrg)}
                  </>
                )}
              </Fila>
              <Fila
                titulo="Datos legales"
                detalle={
                  editando === 'legal'
                    ? 'Identifican a tu organización en las actas de actividad institucional.'
                    : legalResumen
                }
                accion={
                  esAdmin && editando !== 'legal' ? (
                    <button
                      type="button"
                      style={BOTON_FILA}
                      onClick={() =>
                        editar('legal', {
                          legal_name: org.legal_name || '',
                          tax_id: org.tax_id || '',
                          org_type: org.org_type || '',
                          registered_address: org.registered_address || '',
                        })
                      }
                    >
                      Editar datos
                    </button>
                  ) : null
                }
              >
                {editando === 'legal' && (
                  <>
                    <div className="cfg-edit">
                      {campo('legal_name', 'Denominación legal', org.name ? `Ej: ${org.name}, S.L.` : 'Razón social completa', {
                        flexBasis: '100%',
                      })}
                      {campo('tax_id', 'CIF, o NIF si ejerces como persona física', 'Ej: B12345678')}
                      <div className="field" style={{ flex: 1, minWidth: 180, marginBottom: 10 }}>
                        <label>Tipo de organización</label>
                        <select
                          value={borrador.org_type || ''}
                          onChange={(e) => setBorrador({ ...borrador, org_type: e.target.value })}
                        >
                          <option value="">Sin especificar</option>
                          {TIPOS_ORG.map((x) => (
                            <option key={x.v} value={x.v}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {campo('registered_address', 'Domicilio o sede social', 'Calle, número, código postal y ciudad', {
                        flexBasis: '100%',
                      })}
                    </div>
                    {acciones(guardarLegal)}
                  </>
                )}
              </Fila>
              <Fila
                titulo="Registro de grupos de interés"
                detalle={
                  editando === 'registro'
                    ? 'Si tu organización está inscrita, el número aparecerá en todas las actas.'
                    : org.cbtg_registry_number
                    ? `Nº ${org.cbtg_registry_number}${
                        org.cbtg_registered_at
                          ? ` · inscrita el ${new Date(org.cbtg_registered_at).toLocaleDateString('es-ES')}`
                          : ''
                      }`
                    : 'Sin número de inscripción'
                }
                accion={
                  esAdmin && editando !== 'registro' ? (
                    <button
                      type="button"
                      style={BOTON_FILA}
                      onClick={() =>
                        editar('registro', {
                          cbtg_registry_number: org.cbtg_registry_number || '',
                          cbtg_registered_at: org.cbtg_registered_at || null,
                        })
                      }
                    >
                      {org.cbtg_registry_number ? 'Editar' : 'Añadir'}
                    </button>
                  ) : null
                }
              >
                {editando === 'registro' && (
                  <>
                    <div className="cfg-edit">
                      {campo('cbtg_registry_number', 'Nº de inscripción', 'Aún sin asignar')}
                      <div className="field" style={{ flex: 1, minWidth: 180, marginBottom: 10 }}>
                        <label>Fecha de inscripción</label>
                        <SelectorFecha
                          value={borrador.cbtg_registered_at || null}
                          onChange={(v) => setBorrador({ ...borrador, cbtg_registered_at: v || null })}
                          placeholder="Sin indicar"
                          desdeAno={2026}
                          hastaAno={new Date().getFullYear() + 1}
                        />
                      </div>
                    </div>
                    {acciones(guardarRegistro)}
                  </>
                )}
              </Fila>
            </Seccion>
          )}

          <Seccion titulo="Usuario">
            <Fila
              primera
              titulo="Foto de perfil"
              detalle="Se muestra en toda la plataforma, por ejemplo en tu menú de cuenta."
              accion={
                <Circulo
                  url={user.avatar_url}
                  texto={nombreCompleto || user.email}
                  subiendo={subiendo === 'avatar'}
                  etiqueta="Cambiar la foto"
                  onArchivo={(e) => subirImagen(e, 'avatar')}
                />
              }
            />
            <Fila
              titulo="Nombre de usuario"
              detalle={editando === 'nombre' ? null : nombreCompleto || 'Sin indicar'}
              accion={
                editando !== 'nombre' ? (
                  <button
                    type="button"
                    style={BOTON_FILA}
                    onClick={() => editar('nombre', { first_name: user.first_name || '', last_name: user.last_name || '' })}
                  >
                    Editar nombre
                  </button>
                ) : null
              }
            >
              {editando === 'nombre' && (
                <>
                  <div className="cfg-edit">
                    {campo('first_name', 'Nombre', '')}
                    {campo('last_name', 'Apellidos', '')}
                  </div>
                  {acciones(guardarNombre)}
                </>
              )}
            </Fila>
            <Fila titulo="Correo electrónico" detalle={user.email} />
            <Fila
              titulo="Novedades de GovTalent"
              detalle="De vez en cuando, lo que vamos añadiendo a la plataforma. Tus alarmas y avisos llegan igual."
              accion={
                <Interruptor
                  activo={!!user.marketing_emails_enabled}
                  disabled={savingPrefs}
                  onChange={toggleMarketingEmails}
                />
              }
            />
          </Seccion>
        </>
      )}

      {/* --- Seguridad ---------------------------------------------------- */}
      {tab === 'seguridad' && (
        <>
          <BloqueSeguridad />
          <Seccion titulo="Cuenta">
            <Fila
              primera
              titulo="Eliminar cuenta"
              detalle="Solicita el borrado de tu cuenta y tus datos. Antes te explicamos qué se pierde."
              accion={
                <button type="button" style={BOTON_FILA} onClick={() => setView('delete-confirm')}>
                  Eliminar cuenta
                </button>
              }
            />
          </Seccion>
        </>
      )}

      {/* --- Equipo ------------------------------------------------------- */}
      {tab === 'equipo' &&
        (org ? (
          <Seccion titulo={`Miembros de ${org.name}`}>
            {miembros === null ? (
              <div style={{ padding: 18 }}>
                <div className="spinner"></div>
              </div>
            ) : (
              miembros.map((m, i) => {
                const p = m.users || {};
                const nombre = `${p.first_name || ''} ${p.last_name || ''}`.trim();
                return (
                  <Fila
                    key={m.user_id}
                    primera={i === 0}
                    titulo={
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Circulo url={p.avatar_url} texto={nombre || p.email} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block' }}>{nombre || p.email}</span>
                          {nombre && (
                            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 400, color: '#8b8780' }}>
                              {p.email}
                            </span>
                          )}
                        </span>
                      </span>
                    }
                    accion={
                      <span
                        style={{
                          fontSize: 12,
                          background: '#f5f4f1',
                          color: '#57534e',
                          borderRadius: 6,
                          padding: '5px 10px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ROLES[m.role] || m.role}
                      </span>
                    }
                  />
                );
              })
            )}
            <div style={{ padding: '14px 18px', borderTop: `1px solid ${BORDE}`, fontSize: 12.5, color: '#6f6c64', lineHeight: 1.6 }}>
              {usuariosPlan > 1 ? `Tu suscripción incluye ${usuariosPlan} usuarios. ` : ''}
              Para añadir a alguien a tu equipo, escríbenos a{' '}
              <a href="mailto:hola@govtalent.app" style={{ color: MORADO, textDecoration: 'none' }}>
                hola@govtalent.app
              </a>{' '}
              con su correo y le damos de alta.
            </div>
          </Seccion>
        ) : (
          <Seccion titulo="Equipo">
            <Fila
              primera
              titulo="Trabaja con tu equipo"
              detalle="Con la suscripción de 2 a 50 usuarios, tu equipo comparte alarmas, créditos, proyectos y tareas. Para darlos de alta, escríbenos a hola@govtalent.app."
              accion={
                <a href="/precios" target="_blank" rel="noreferrer" style={{ ...BOTON_FILA, textDecoration: 'none' }}>
                  Ver planes
                </a>
              }
            />
          </Seccion>
        ))}

      {/* --- Plan --------------------------------------------------------- */}
      {tab === 'plan' && <BloquePlanCuenta user={user} />}
    </div>
  );
}
