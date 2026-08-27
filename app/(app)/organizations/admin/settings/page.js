'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import { getEffectiveTier } from '@/lib/plan';
import SelectorFecha from '@/components/SelectorFecha';

/**
 * Configuración de la organización.
 *
 * Dos cosas, y las dos con condiciones:
 *
 *   Gestionar equipo    llega con Teams. Se enseña apagado en vez de
 *                       esconderlo: saber que existe es parte de la
 *                       razón para contratarlo.
 *
 *   Desactivar página   quita la organización de la vista pública sin
 *                       borrar nada. NO es eliminar: las ofertas
 *                       publicadas y las candidaturas recibidas son
 *                       datos de terceros, y borrarlos afecta a gente
 *                       que se postuló de buena fe.
 */

const BORDE = '#e0dfd8';

// Los tipos del artículo 2.1: personas físicas y jurídicas y agrupaciones
// sin personalidad jurídica, incluidas plataformas, foros y redes.
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

export default function ConfiguracionOrganizacion() {
  const supabase = createClient();
  const [org, setOrg] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);
  const [datos, setDatos] = useState(null);
  const [guardandoDatos, setGuardandoDatos] = useState(false);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return setCargando(false);
    const { data } = await supabase
      .from('organization_members')
      .select(
        'role, organizations(id, name, slug, plan, plan_status, trial_ends_at, is_public, legal_name, tax_id, org_type, registered_address, cbtg_registry_number, cbtg_registered_at)'
      )
      .eq('user_id', auth.user.id)
      .limit(1)
      .maybeSingle();

    const o = data?.organizations || null;
    setOrg(o);
    // Solo la administración edita los datos legales: salen en un
    // documento con valor probatorio, no son una preferencia.
    setEsAdmin(data?.role === 'admin');
    if (o) {
      setDatos({
        legal_name: o.legal_name || '',
        tax_id: o.tax_id || '',
        org_type: o.org_type || '',
        registered_address: o.registered_address || '',
        cbtg_registry_number: o.cbtg_registry_number || '',
        cbtg_registered_at: o.cbtg_registered_at || null,
      });
    }
    setCargando(false);
  }

  async function cambiarVisibilidad(publica) {
    if (!org) return;
    setGuardando(true);
    const { error } = await supabase.from('organizations').update({ is_public: publica }).eq('id', org.id);
    setGuardando(false);
    setConfirmar(false);
    if (error) {
      toast('No se ha podido cambiar la visibilidad');
      return;
    }
    setOrg({ ...org, is_public: publica });
    toast(publica ? 'Tu página vuelve a estar visible' : 'Tu página ya no es visible');
  }

  async function guardarDatos() {
    setGuardandoDatos(true);
    const { error } = await supabase
      .from('organizations')
      .update({
        legal_name: datos.legal_name.trim() || null,
        tax_id: datos.tax_id.trim() || null,
        org_type: datos.org_type || null,
        registered_address: datos.registered_address.trim() || null,
        cbtg_registry_number: datos.cbtg_registry_number.trim() || null,
        cbtg_registered_at: datos.cbtg_registered_at || null,
      })
      .eq('id', org.id);
    setGuardandoDatos(false);
    if (error) return toast('No se han podido guardar los datos');
    setOrg({ ...org, ...datos });
    toast('Datos guardados');
  }

  if (cargando) return <div className="spinner"></div>;
  if (!org) {
    return (
      <div className="empty-state">
        <i className="ti ti-building-off"></i>
        Todavía no administras ninguna organización.
      </div>
    );
  }

  const esTeams = getEffectiveTier(org) === 'pro';
  const visible = org.is_public !== false;
  const inscrita = !!(datos?.cbtg_registry_number || '').trim();
  const cambiado =
    datos &&
    (datos.legal_name !== (org.legal_name || '') ||
      datos.tax_id !== (org.tax_id || '') ||
      datos.org_type !== (org.org_type || '') ||
      datos.registered_address !== (org.registered_address || '') ||
      datos.cbtg_registry_number !== (org.cbtg_registry_number || '') ||
      datos.cbtg_registered_at !== (org.cbtg_registered_at || null));

  const campo = (k, etiqueta, placeholder) => (
    <div className="field" style={{ flex: 1, marginBottom: 0 }}>
      <label>{etiqueta}</label>
      <input
        value={datos[k]}
        onChange={(e) => setDatos({ ...datos, [k]: e.target.value })}
        placeholder={placeholder}
        disabled={!esAdmin}
      />
    </div>
  );

  return (
    <div style={{ maxWidth: 620 }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>Configuración</h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
        Los datos de tu organización, quién puede gestionarla y si aparece en GovTalent.
      </p>

      {/* Los datos legales van primero: son los que hacen falta para que
          un acta identifique a la organización, y sin ellos el resto de
          la configuración importa poco. */}
      {datos && (
        <>
          <div
            className="card"
            style={{ padding: '15px 20px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 13 }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: '#f5f4f1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <i
                className={`ti ti-${inscrita ? 'shield-check' : 'alert-circle'}`}
                style={{ fontSize: 17, color: inscrita ? '#1d6f5c' : '#8b8780' }}
              ></i>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* "No has indicado" y no "Sin inscribir": GovTalent no
                  puede comprobarlo —el registro no está operativo— y
                  afirmar lo segundo sería dar por verificado algo que
                  solo es una declaración. */}
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {inscrita
                  ? 'Inscripción en el Registro de grupos de interés declarada'
                  : 'No has indicado número de inscripción'}
              </div>
              <div style={{ fontSize: 11.5, color: '#888', marginTop: 2, lineHeight: 1.5 }}>
                Desde el 27 de agosto de 2026, la inscripción en el registro del Consejo de Transparencia es
                obligatoria para mantener contactos de influencia con la Administración General del Estado.
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 20, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#a8a49c', letterSpacing: '.4px', marginBottom: 4 }}>
              DATOS DE LA ORGANIZACIÓN
            </div>
            <p style={{ fontSize: 12, color: '#999', marginBottom: 14, lineHeight: 1.55 }}>
              {esAdmin
                ? 'Identifican a tu organización en las actas de actividad institucional.'
                : 'Solo la administración de la cuenta puede modificar estos datos.'}
            </p>

            <div className="field">
              <label>Denominación legal</label>
              <input
                value={datos.legal_name}
                onChange={(e) => setDatos({ ...datos, legal_name: e.target.value })}
                placeholder={org.name ? `Ej: ${org.name}, S.L.` : 'Razón social completa'}
                disabled={!esAdmin}
              />
              <p style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                La razón social, que puede no coincidir con el nombre comercial que muestras en tu página. Si
                ejerces por cuenta propia, tu nombre y apellidos.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              {/* El sujeto obligado es el grupo de interés, no la persona
                  que acude a la reunión. Cuando el grupo es una persona
                  jurídica, el identificador es su CIF; cuando alguien
                  ejerce por cuenta propia, su NIF cumple la misma función.
                  El campo sirve para los dos casos. */}
              {campo('tax_id', 'CIF, o NIF si ejerces como persona física', 'Ej: B12345678')}
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label>Tipo de organización</label>
                <select
                  value={datos.org_type || ''}
                  onChange={(e) => setDatos({ ...datos, org_type: e.target.value })}
                  disabled={!esAdmin}
                >
                  <option value="">Sin especificar</option>
                  {TIPOS_ORG.map((t) => (
                    <option key={t.v} value={t.v}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label>Domicilio o sede social</label>
              <input
                value={datos.registered_address}
                onChange={(e) => setDatos({ ...datos, registered_address: e.target.value })}
                placeholder="Calle, número, código postal y ciudad"
                disabled={!esAdmin}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              {campo('cbtg_registry_number', 'Nº de inscripción en el Registro', 'Aún sin asignar')}
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label>Fecha de inscripción</label>
                <SelectorFecha
                  value={datos.cbtg_registered_at}
                  onChange={(v) => setDatos({ ...datos, cbtg_registered_at: v })}
                  placeholder="Sin indicar"
                  desdeAno={2026}
                  hastaAno={new Date().getFullYear() + 1}
                />
              </div>
            </div>

            {esAdmin && cambiado && (
              <button className="btn-ai" disabled={guardandoDatos} onClick={guardarDatos}>
                {guardandoDatos ? 'Guardando…' : 'Guardar cambios'}
              </button>
            )}
          </div>

        </>
      )}

      {/* Filas separadas por línea, como en Seguimiento: dos tarjetas
          apiladas para dos ajustes daban más peso al contenedor que al
          contenido. */}
      <div className="card" style={{ padding: '4px 20px' }}>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '18px 0',
            opacity: esTeams ? 1 : 0.55,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>Gestionar equipo</span>
              {!esTeams && (
                <span
                  style={{
                    fontSize: 10.5,
                    background: '#f0eefe',
                    color: '#3c3489',
                    borderRadius: 20,
                    padding: '2px 9px',
                  }}
                >
                  Teams
                </span>
              )}
            </div>
            <div style={{ fontSize: 12.5, color: '#888', lineHeight: 1.55 }}>
              Invita a compañeros y decide qué puede hacer cada uno.
            </div>
          </div>
          <span style={{ fontSize: 12.5, color: '#a8a49c', flexShrink: 0 }}>Próximamente</span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '18px 0',
            borderTop: `.5px solid ${BORDE}`,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 3 }}>
              {visible ? 'Tu página está activa' : 'Tu página está desactivada'}
            </div>
            <div style={{ fontSize: 12.5, color: '#888', lineHeight: 1.55 }}>
              {visible
                ? 'Aparece en GovTalent y tus ofertas se muestran a los candidatos.'
                : 'Nadie puede encontrarla ni ver tus ofertas. No se ha borrado nada.'}
            </div>
          </div>
          {visible ? (
            <button
              onClick={() => setConfirmar(true)}
              style={{
                background: 'none',
                border: `.5px solid ${BORDE}`,
                borderRadius: 8,
                padding: '7px 13px',
                fontSize: 12.5,
                color: '#555',
                flexShrink: 0,
              }}
            >
              Desactivar
            </button>
          ) : (
            <button className="btn-ai" style={{ fontSize: 12.5, flexShrink: 0 }} disabled={guardando} onClick={() => cambiarVisibilidad(true)}>
              {guardando ? 'Activando…' : 'Reactivar'}
            </button>
          )}
        </div>

      </div>

      {/* Se pregunta porque afecta a lo que ven terceros: quien tenga tu
          oferta guardada dejará de verla. */}
      {confirmar && (
        <div className="modal-ov on" onClick={(e) => e.target === e.currentTarget && setConfirmar(false)}>
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h2>Desactivar la página</h2>
              <div className="modal-x" onClick={() => setConfirmar(false)}>
                <i className="ti ti-x"></i>
              </div>
            </div>
            <p style={{ fontSize: 13, color: '#555', lineHeight: 1.65 }}>
              «{org.name}» dejará de aparecer en GovTalent y tus ofertas no se mostrarán. Quien las tuviera
              guardadas dejará de verlas. No se borra nada y puedes reactivarla cuando quieras.
            </p>
            {/* La opción destacada es quedarse, no irse: el morado va en
                lo que casi siempre quiere quien llega hasta aquí, y
                desactivar queda accesible pero sin invitar. */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn-ai" onClick={() => setConfirmar(false)}>
                Mantener mi página
              </button>
              <button
                onClick={() => cambiarVisibilidad(false)}
                disabled={guardando}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#888',
                  fontSize: 12.5,
                  padding: '9px 14px',
                }}
              >
                {guardando ? 'Desactivando…' : 'Desactivar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <p style={{ fontSize: 11.5, color: '#999', lineHeight: 1.6, marginTop: 18 }}>
        Para borrar la organización por completo, escríbenos a hola@govtalent.app. Las candidaturas recibidas
        son datos de las personas que se postularon, y hay que tratarlas con cuidado antes de eliminarlas.
      </p>
    </div>
  );
}
