'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import { groupColor } from '@/lib/grupos';
import BackLink from '@/components/BackLink';
import PanelBloqueado, { FILAS_COLEGAS } from '@/components/PanelBloqueado';
import UpgradeModal from '@/components/UpgradeModal';
import FollowButton from '@/components/FollowButton';

// El Resumen lleva lo que más se consulta —portavocías y últimas
// ponencias— y las otras pestañas el detalle completo. Así lo habitual
// no obliga a navegar.
const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'comisiones', label: 'Comisiones' },
  { id: 'ponencias', label: 'Ponencias' },
  { id: 'biografia', label: 'Biografía' },
];

function initials(fullName) {
  const [last, first] = (fullName || '').split(',').map((s) => s.trim());
  return `${(first || '')[0] || ''}${(last || '')[0] || ''}`.toUpperCase();
}

function fullNameDisplay(officialName) {
  const [last, first] = (officialName || '').split(',').map((s) => s.trim());
  return first ? `${first} ${last}` : officialName;
}

/**
 * La frase que resume el perfil, generada de los datos.
 *
 * No es un texto escrito a mano: sale de las portavocías, comisiones y
 * ponencias que tenga cada uno. Si no tiene nada, devuelve null y el
 * bloque no aparece — mejor eso que una frase vacía de contenido.
 */
function fraseResumen(p, comisiones) {
  if (!p) return null;
  const partes = [];

  const portavocias = (p.portavocias || []).filter(Boolean);
  if (portavocias.length === 1) {
    partes.push(`Es portavoz de su grupo en ${limpiarComision(portavocias[0])}`);
  } else if (portavocias.length > 1) {
    const listado = portavocias.map(limpiarComision);
    const ultimo = listado.pop();
    partes.push(`Es portavoz de su grupo en ${listado.join(', ')} y ${ultimo}`);
  }

  if (p.n_comisiones > 0) {
    const frase = `está en ${p.n_comisiones} ${p.n_comisiones === 1 ? 'comisión' : 'comisiones'}`;
    partes.push(partes.length ? frase : frase.replace('está', 'Está'));
  }

  if (p.n_ponencias > 0) {
    partes.push(`ha sido ponente de ${p.n_ponencias} ${p.n_ponencias === 1 ? 'ley' : 'leyes'}`);
  }

  if (partes.length === 0) return null;
  const ultimo = partes.pop();
  return `${partes.length ? `${partes.join(', ')} y ` : ''}${ultimo}.`;
}

// "Comisión de Sanidad" -> "Sanidad"
function limpiarComision(n) {
  return (n || '').replace(/^Comisión\s+(de\s+la\s+|del\s+|de\s+)?/i, '').trim() || n;
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const LABEL = {
  fontSize: 10.5,
  fontWeight: 700,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: '.3px',
  marginBottom: 13,
};

const FILA = {
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  padding: '9px 0',
  borderBottom: '.5px solid #f0f0eb',
  textDecoration: 'none',
  color: 'inherit',
};

const ICONO_VERDE = {
  width: 32,
  height: 32,
  borderRadius: 8,
  background: '#e8f4f0',
  color: '#1d6f5c',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const ICONO_GRIS = { ...ICONO_VERDE, background: '#f4f4f0', color: '#999' };

const CHIP = {
  fontSize: 10.5,
  background: '#EEEDFE',
  color: '#3C3489',
  padding: '3px 9px',
  borderRadius: 10,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

function Avatar({ nombre, url, size = 28 }) {
  const [falla, setFalla] = useState(false);
  const base = { width: size, height: size, borderRadius: '50%', flexShrink: 0, objectFit: 'cover', background: '#ece9e2' };
  if (url && !falla) {
    return <img src={url} alt="" width={size} height={size} style={base} onError={() => setFalla(true)} />;
  }
  return (
    <div
      style={{
        ...base,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#8d8b83',
        fontSize: Math.round(size * 0.33),
        fontWeight: 700,
      }}
      aria-hidden="true"
    >
      {initials(nombre)}
    </div>
  );
}

// Los colores de grupo viven en lib/grupos, compartidos con el resto.
// Botón circular gris que pasa a verde al pasar el ratón. Mismo componente
function CircleButton({ icon, label, onClick, href, active, disabled, title }) {
  const [hover, setHover] = useState(false);
  const on = active || (hover && !disabled);

  const style = {
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: `.5px solid ${on ? '#1d6f5c' : '#e0dfd8'}`,
    background: on ? '#e8f4f0' : '#fff',
    color: disabled ? '#ccc' : on ? '#1d6f5c' : '#888',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all .15s ease',
    padding: 0,
    flexShrink: 0,
  };

  const inner = <i className={`ti ti-${icon}`} style={{ fontSize: 16 }} aria-hidden="true"></i>;

  if (href && !disabled) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label={label}
        title={title || label}
        style={{ ...style, textDecoration: 'none' }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {inner}
      </a>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={title || label}
      aria-disabled={disabled ? 'true' : undefined}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={style}
    >
      {inner}
    </button>
  );
}

export default function DeputyProfilePage() {
  const { slug } = useParams();
  const supabase = createClient();

  const [deputy, setDeputy] = useState(null);
  const [group, setGroup] = useState(null);
  const [legislature, setLegislature] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [comisiones, setComisiones] = useState([]);
  const [ponencias, setPonencias] = useState([]);
  const [esPro, setEsPro] = useState(null);
  const [upsell, setUpsell] = useState(false);
  const [colegas, setColegas] = useState([]);
  // Cuántos hay aunque no se pidan sus nombres.
  const [nColegas, setNColegas] = useState(0);
  const [userId, setUserId] = useState(null);
  const [tab, setTab] = useState('resumen');
  const [notFound, setNotFound] = useState(false);
  const [radarNote, setRadarNote] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    load();
  }, [slug]);

  async function load() {
    // .limit(1) antes de .maybeSingle(): sin él, la consulta falla en silencio
    // si por lo que sea hay más de una fila que encaje.
    const { data: d } = await supabase.from('deputies').select('*').eq('slug', slug).limit(1).maybeSingle();
    if (!d) {
      setNotFound(true);
      return;
    }
    setDeputy(d);

    const [{ data: g }, { data: leg }, { data: authData }, { data: perfilData }, { data: comisionesData }, { data: ponenciasData }, { data: colegasData }] = await Promise.all([
      d.parliamentary_group_id
        ? supabase
            .from('parliamentary_groups')
            .select('id, name, short_name, slug')
            .eq('id', d.parliamentary_group_id)
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('legislatures').select('code, name').eq('id', d.legislature_id).limit(1).maybeSingle(),
      supabase.auth.getUser(),
      // El perfil conecta lo que ya estaba cargado y vivía suelto:
      // comisiones, ponencias y con quién coincide.
      supabase.from('deputy_profile').select('*').eq('deputy_id', d.id).limit(1).maybeSingle(),
      supabase
        .from('deputy_committees')
        .select('*')
        .eq('deputy_id', d.id)
        .order('orden_cargo')
        .order('committee_name'),
      supabase
        .from('deputy_ponencias')
        .select('*')
        .eq('deputy_id', d.id)
        .order('is_closed')
        .order('fecha_presentacion', { ascending: false }),
      // Solo los cinco con más coincidencias: con ponencias de quince
      // personas todos coinciden con todos y el dato se diluye.
      //
      // Sin plan se pide el recuento y no las filas. Es el dato que no
      // está en congreso.es: quién trabaja con quién sale de cruzar
      // ponencias, y es lo único de esta ficha que no se puede copiar
      // de la fuente oficial.
      supabase
        .from('deputy_colleagues')
        .select('*')
        .eq('deputy_id', d.id)
        .order('veces', { ascending: false })
        .limit(5),
    ]);

    // El plan, para decidir si los colegas se enseñan o se difuminan.
    let pro = false;
    if (authData?.user?.id) {
      const { data: perfilPlan } = await supabase
        .from('users')
        .select('plan')
        .eq('id', authData.user.id)
        .single();
      pro = perfilPlan?.plan === 'pro';
    }
    setEsPro(pro);

    setGroup(g);
    setLegislature(leg);
    setPerfil(perfilData);
    setComisiones(comisionesData || []);
    setPonencias(ponenciasData || []);
    if (pro) {
      setColegas(colegasData || []);
    } else {
      setColegas([]);
      setNColegas((colegasData || []).length);
    }

    // FollowButton comprueba por su cuenta si se sigue: se ahorra una
    // consulta por visita.
    setUserId(authData.user?.id || null);
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    toast('Enlace copiado ✓');
  }

  if (notFound) {
    return (
      <div className="sec">
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-user-off"></i>
            No hemos encontrado a este diputado.
            <div style={{ marginTop: 10 }}>
              <Link href="/institutions/deputies" className="btn-o" style={{ textDecoration: 'none' }}>
                Volver al directorio
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!deputy) return <div className="spinner"></div>;

  // Las portavocías se separan del resto: es donde de verdad negocia
  // por su grupo, y lo demás es pertenencia sin voz propia.
  const portavocias = comisiones.filter((c) => c.es_portavoz);
  const resto = comisiones.filter((c) => !c.es_portavoz);

  // deputy_roles se diseñó para los cargos pero nunca se cargó: ahora
  // vienen de es_committee_members a través de deputy_committees.
  const mandateYear = deputy.mandate_start ? new Date(deputy.mandate_start).getFullYear() : null;
  const groupName = group?.name || 'Grupo Mixto / sin asignar';

  const officialFichaUrl = deputy.cod_parlamentario
    ? `https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_diputadomodule_mostrarFicha=true&codParlamentario=${deputy.cod_parlamentario}&idLegislatura=${legislature?.code || 'XV'}&mostrarAgenda=false`
    : `https://www.congreso.es/es/busqueda-de-diputados?texto=${encodeURIComponent(fullNameDisplay(deputy.full_name))}`;

  const avatarStyle = {
    width: 70,
    height: 70,
    borderRadius: 12,
    flexShrink: 0,
    objectFit: 'cover',
    background: '#ece9e2',
  };

  return (
    <div className="sec" style={{ maxWidth: 900 }}>
      {/* El atrás va antes de la miga: la miga dice DÓNDE estás, el atrás
          de dónde VIENES. A esta ficha se llega desde el directorio, desde
          una comisión y desde un grupo parlamentario. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <BackLink fallbackHref="/institutions/deputies" fallbackLabel="Diputados" />
        <span style={{ fontSize: 11.5, color: '#ddd' }}>|</span>
        <span style={{ fontSize: 11.5, color: '#999' }}>
          <Link href="/institutions" style={{ color: '#999', textDecoration: 'none' }}>
            Instituciones
          </Link>
          {' › '}
          <Link href="/institutions/deputies" style={{ color: '#999', textDecoration: 'none' }}>
            Diputados
          </Link>
          {' › '}
          <span style={{ color: '#666' }}>{fullNameDisplay(deputy.full_name)}</span>
        </span>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 200, flex: 1 }}>
            {deputy.photo_url && !photoFailed ? (
              <img
                src={deputy.photo_url}
                alt=""
                width={70}
                height={70}
                style={avatarStyle}
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              <div
                style={{
                  ...avatarStyle,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 21,
                  fontWeight: 700,
                  color: '#8d8b83',
                }}
                aria-hidden="true"
              >
                {initials(deputy.full_name)}
              </div>
            )}

            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, lineHeight: 1.25 }}>
                {fullNameDisplay(deputy.full_name)}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
                <span
                  style={{ width: 9, height: 9, borderRadius: 2, background: groupColor(groupName), flexShrink: 0 }}
                ></span>
                <span style={{ fontSize: 12, color: '#555' }}>{groupName}</span>
              </div>
              <div style={{ fontSize: 11.5, color: '#999', marginTop: 4 }}>
                Diputado/a por {deputy.constituency}
                {legislature?.code ? ` · ${legislature.code} Legislatura` : ''}
                {mandateYear ? ` · desde ${mandateYear}` : ''}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
            <FollowButton kind="diputado" refId={deputy.slug} label={deputy.full_name} />
          </div>
        </div>

        {radarNote && (
          <div style={{ fontSize: 11.5, color: '#888', marginTop: 12, paddingTop: 11, borderTop: '.5px solid #f0f0eb' }}>
            El seguimiento en Radar estará disponible próximamente.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, borderBottom: '.5px solid #e0dfd8', margin: '18px 0', overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 12.5,
              fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? '#1d6f5c' : '#999',
              borderBottom: tab === t.id ? '2px solid #1d6f5c' : '2px solid transparent',
              padding: '0 0 9px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'resumen' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fraseResumen(perfil, comisiones) && (
            <div className="card" style={{ padding: 18 }}>
              <div style={LABEL}>Su terreno</div>
              <div style={{ fontSize: 12.5, color: '#555', lineHeight: 1.65 }}>
                {fraseResumen(perfil, comisiones)}
              </div>
            </div>
          )}

          {/* Las portavocías primero: es donde de verdad negocia por su
              grupo, y lo que busca un profesional de asuntos públicos. */}
          {portavocias.length > 0 && (
            <div className="card" style={{ padding: 18 }}>
              <div style={LABEL}>Donde tiene voz</div>
              {portavocias.map((c) => (
                <Link
                  key={c.committee_id}
                  href={`/institutions/comisiones/${c.committee_slug}`}
                  style={FILA}
                >
                  <span style={ICONO_VERDE}>
                    <i className="ti ti-microphone" style={{ fontSize: 15 }} aria-hidden="true"></i>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.committee_name}</div>
                    <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>
                      {[c.cargo, formatDate(c.fecha_alta) ? `desde ${formatDate(c.fecha_alta)}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  {c.n_leyes + c.n_actividad > 0 && (
                    <span style={CHIP}>{c.n_leyes + c.n_actividad} en trámite</span>
                  )}
                  <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}></i>
                </Link>
              ))}
              {resto.length > 0 && (
                <div style={{ fontSize: 11, color: '#888', paddingTop: 11 }}>
                  Y {resto.length === 1 ? 'miembro de' : 'miembro de'}{' '}
                  {resto.map((c) => limpiarComision(c.committee_name)).join(', ')}.
                </div>
              )}
            </div>
          )}

          {ponencias.length > 0 && (
            <div className="card" style={{ padding: 18 }}>
              <div style={LABEL}>Leyes que ha llevado · {ponencias.length}</div>
              {ponencias.slice(0, 4).map((p) => (
                <Link key={p.num_expediente} href={`/congreso/${p.slug}`} style={{ ...FILA, alignItems: 'flex-start' }}>
                  <span
                    style={{
                      width: 3,
                      alignSelf: 'stretch',
                      background: p.is_closed ? '#d5d3c9' : '#6d5aef',
                      borderRadius: 2,
                      flexShrink: 0,
                    }}
                  ></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: p.is_closed ? '#666' : '#1a1a1a' }}>
                      {p.title}
                    </div>
                    <div style={{ fontSize: 10.5, color: '#999', marginTop: 3 }}>
                      {[p.comision, p.fase, p.n_ponentes > 1 ? `${p.n_ponentes} ponentes` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 13, flexShrink: 0, marginTop: 3 }}></i>
                </Link>
              ))}
              {ponencias.length > 4 && (
                <span
                  onClick={() => setTab('ponencias')}
                  style={{ fontSize: 11.5, color: '#1d6f5c', fontWeight: 600, cursor: 'pointer', display: 'inline-block', paddingTop: 11 }}
                >
                  Ver las {ponencias.length} →
                </span>
              )}
            </div>
          )}

          {/* Un patrón que sale de los datos: con quién comparte ponencia
              de forma recurrente. Solo aparece si hay coincidencias
              repetidas, para que no sea ruido. */}
          {esPro === false && nColegas > 0 && (
            <div className="card" style={{ padding: 18 }}>
              <div style={LABEL}>Con quién coincide en ponencia</div>
              <div style={{ fontSize: 11.5, color: '#888', lineHeight: 1.6, marginBottom: 13 }}>
                Diputados con los que ha compartido ponencia más de una vez.
              </div>
              <PanelBloqueado
                titulo="Con quién trabaja de verdad"
                descripcion="Los diputados con los que comparte ponencia una y otra vez, y cuántas veces. Es el mapa que no está en congreso.es."
                filas={FILAS_COLEGAS}
                onUpsell={() => setUpsell(true)}
              />
            </div>
          )}

          {esPro && colegas.length > 0 && (
            <div className="card" style={{ padding: 18 }}>
              <div style={LABEL}>Con quién coincide en ponencia</div>
              <div style={{ fontSize: 11.5, color: '#888', lineHeight: 1.6, marginBottom: 13 }}>
                Diputados con los que ha compartido ponencia más de una vez.
              </div>
              {colegas.map((c) => (
                <Link key={c.colleague_id} href={`/institutions/deputies/${c.colleague_slug}`} style={FILA}>
                  <Avatar nombre={c.colleague_name} url={c.colleague_photo} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12 }}>{fullNameDisplay(c.colleague_name)}</div>
                    {(c.comisiones || []).length > 0 && (
                      <div style={{ fontSize: 10, color: '#999' }}>
                        {c.comisiones.map(limpiarComision).slice(0, 2).join(', ')}
                      </div>
                    )}
                  </div>
                  <span
                    style={{ width: 8, height: 8, borderRadius: 2, background: groupColor(c.colleague_grupo), flexShrink: 0 }}
                  ></span>
                  <span style={{ fontSize: 10.5, color: '#999', flexShrink: 0 }}>{c.veces}</span>
                </Link>
              ))}
            </div>
          )}

          {!perfil?.n_comisiones && ponencias.length === 0 && (
            <div className="card">
              <div className="empty-state">
                <i className="ti ti-file-off"></i>
                Aún no tenemos actividad parlamentaria registrada de este diputado.
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'comisiones' && (
        <div className="card" style={{ padding: 18 }}>
          {comisiones.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-users-off"></i>
              No consta en ninguna comisión.
            </div>
          ) : (
            comisiones.map((c) => (
              <Link key={c.committee_id} href={`/institutions/comisiones/${c.committee_slug}`} style={FILA}>
                <span style={c.es_portavoz ? ICONO_VERDE : ICONO_GRIS}>
                  <i
                    className={`ti ti-${c.es_portavoz ? 'microphone' : c.es_mesa ? 'gavel' : 'users'}`}
                    style={{ fontSize: 15 }}
                    aria-hidden="true"
                  ></i>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: c.es_portavoz ? 600 : 400 }}>{c.committee_name}</div>
                  <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>
                    {[c.cargo, formatDate(c.fecha_alta) ? `desde ${formatDate(c.fecha_alta)}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                {c.n_leyes + c.n_actividad > 0 && <span style={CHIP}>{c.n_leyes + c.n_actividad} en trámite</span>}
                <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}></i>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === 'ponencias' && (
        <div className="card" style={{ padding: 18 }}>
          {ponencias.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-file-off"></i>
              No ha sido ponente de ninguna ley en esta legislatura.
            </div>
          ) : (
            ponencias.map((p) => (
              <Link key={p.num_expediente} href={`/congreso/${p.slug}`} style={{ ...FILA, alignItems: 'flex-start' }}>
                <span
                  style={{
                    width: 3,
                    alignSelf: 'stretch',
                    background: p.is_closed ? '#d5d3c9' : '#6d5aef',
                    borderRadius: 2,
                    flexShrink: 0,
                  }}
                ></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: p.is_closed ? '#666' : '#1a1a1a' }}>
                    {p.title}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#999', marginTop: 3 }}>
                    {[
                      p.kind === 'proyecto' ? 'Proyecto de ley' : 'Proposición de ley',
                      p.comision,
                      p.is_closed ? p.resultado || 'Concluida' : p.fase,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 13, flexShrink: 0, marginTop: 3 }}></i>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === 'biografia' && (
        <div className="card" style={{ padding: 18 }}>
          {deputy.official_bio ? (
            <div style={{ fontSize: 13, color: '#444', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
              {deputy.official_bio}
            </div>
          ) : (
            <div className="empty-state">
              <i className="ti ti-file-off"></i>
              El Congreso no ha publicado una biografía oficial para este diputado.
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos obtenidos del Congreso de los Diputados. Última actualización:{' '}
        {deputy.source_updated_at ? formatDate(deputy.source_updated_at) : '—'}.{' '}
        <a
          href="https://www.congreso.es/es/opendata/diputados"
          target="_blank"
          rel="noreferrer"
          style={{ color: '#1d6f5c' }}
        >
          Ver fuente oficial ↗
        </a>
      </div>


      {upsell && (
        <UpgradeModal
          title="Con quién coincide en ponencia"
          message="Los diputados con los que comparte ponencia de forma recurrente, y en cuántas. Disponible en el plan Pro."
          onClose={() => setUpsell(false)}
        />
      )}
    </div>
  );
}
