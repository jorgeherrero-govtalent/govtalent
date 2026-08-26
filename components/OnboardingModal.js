'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import {
  CAREER_SITUATIONS,
  ORG_TYPES,
  ROLE_TYPES,
  LEVEL_TYPES,
  SHOWS_DETAIL_QUESTIONS,
} from '@/lib/professionalSituation';

/**
 * Onboarding en tres pasos.
 *
 * QUÉ CAMBIA RESPECTO AL ANTERIOR
 *
 * 1. No hay pantalla de "elige tu camino". Quien representa a una
 *    organización también es un profesional del sector, y obligarle a
 *    elegir le hacía escoger una mitad de sí mismo. Además chocaba con
 *    la navegación: ahí la organización es un contexto que añades, no un
 *    tipo de usuario. Quien viene solo a contratar lo dice en la primera
 *    pregunta y sale directo a crear su página.
 *
 * 2. Los temas van a topics/user_topics y generan el perfil de sector.
 *    Antes se guardaban en user_work_areas y user_interest_areas, que no
 *    leía nadie: se preguntaba y la respuesta no llegaba al motor de
 *    avisos.
 *
 * 3. Fuera la foto. Se pide dentro, cuando ya hay perfil que decorar.
 *
 * 4. Fuera "Todos los sectores" y "Todas las áreas": contradecían el
 *    "elige hasta 3" de la misma pantalla. Si alguien lo quiere todo, la
 *    respuesta no es una opción, es no elegir ninguno.
 *
 * COLOR: verde lo que eliges, morado el botón y lo que la plataforma
 * devuelve.
 */

const VERDE = '#1d6f5c';
const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';

const MAX_TEMAS = 3;
const TEMAS_VISIBLES = 10;

export default function OnboardingModal({ userId, onComplete }) {
  const supabase = createClient();
  const [paso, setPaso] = useState(1);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [redirigiendo, setRedirigiendo] = useState(false);

  const [temas, setTemas] = useState([]);
  const [verTodos, setVerTodos] = useState(false);
  const [contando, setContando] = useState(false);
  const [asuntos, setAsuntos] = useState(null);

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    professional_title: '',
    location: '',
    career_situation: '',
    temas: [],
    org_type: '',
    role_type: '',
    level_type: '',
    looking_for_job: false,
  });

  useEffect(() => {
    cargarTemas();
  }, []);

  async function cargarTemas() {
    const { data } = await supabase
      .from('topics')
      .select('id, label')
      .eq('activo', true)
      .order('orden');
    setTemas(data || []);
  }

  // El recuento en vivo: con datos reales de la base, no un número
  // decorativo. Se cuenta en el servidor porque hay medio millar de
  // iniciativas y traerlas al navegador en cada toque no tiene sentido.
  useEffect(() => {
    if (paso !== 2 || form.temas.length === 0) {
      setAsuntos(null);
      return;
    }
    let vivo = true;
    setContando(true);
    supabase
      .rpc('contar_asuntos_por_temas', { p_topics: form.temas })
      .then(({ data, error: err }) => {
        if (!vivo) return;
        setContando(false);
        setAsuntos(err ? null : data);
      });
    return () => {
      vivo = false;
    };
  }, [form.temas, paso]); // eslint-disable-line react-hooks/exhaustive-deps

  function elegir(campo, valor) {
    setForm((f) => ({ ...f, [campo]: f[campo] === valor ? '' : valor }));
  }

  function alternarTema(id) {
    setForm((f) => {
      if (f.temas.includes(id)) return { ...f, temas: f.temas.filter((t) => t !== id) };
      if (f.temas.length >= MAX_TEMAS) return f;
      return { ...f, temas: [...f.temas, id] };
    });
  }

  // Quien no trabaja en el sector se salta el paso 3: preguntarle tipo de
  // organización y nivel no aporta nada al benchmark y sí abandono.
  const conDetalle = SHOWS_DETAIL_QUESTIONS.includes(form.career_situation);
  const pasosTotales = conDetalle ? 3 : 2;

  const paso1Listo =
    form.first_name.trim() && form.last_name.trim() && form.career_situation;

  async function terminar() {
    setGuardando(true);
    setError('');

    const { error: errUsuario } = await supabase
      .from('users')
      .update({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        professional_title: form.professional_title.trim() || null,
        location: form.location.trim() || null,
        looking_for_job: form.looking_for_job,
        onboarding_completed: true,
      })
      .eq('id', userId);

    if (errUsuario) {
      setGuardando(false);
      setError('No se han podido guardar tus datos. Comprueba tu conexión e inténtalo de nuevo.');
      return;
    }

    // Los temas, y con ellos el perfil de sector. Este es el circuito que
    // antes estaba roto: se preguntaba y no llegaba a ninguna parte.
    await supabase.from('user_topics').delete().eq('user_id', userId);
    if (form.temas.length) {
      await supabase
        .from('user_topics')
        .insert(form.temas.map((topic_id) => ({ user_id: userId, topic_id })));
    }
    const { error: errPerfil } = await supabase.rpc('regenerar_perfil_sector', {
      p_user_id: userId,
    });
    if (errPerfil) {
      // No se aborta: los temas están guardados y el perfil se puede
      // regenerar más tarde. Perder el registro entero por esto sería peor.
      console.error('No se pudo generar el perfil de sector:', errPerfil);
    }

    if (conDetalle) {
      await supabase.from('candidate_profiles').upsert(
        {
          user_id: userId,
          career_situation: form.career_situation || null,
          org_type: form.org_type || null,
          role_type: form.role_type || null,
          level_type: form.level_type || null,
        },
        { onConflict: 'user_id' }
      );
    } else {
      await supabase.from('candidate_profiles').upsert(
        { user_id: userId, career_situation: form.career_situation || null },
        { onConflict: 'user_id' }
      );
    }

    setGuardando(false);
    toast('Todo listo ✓');
    if (onComplete) onComplete();
  }

  // --- Piezas compartidas ---------------------------------------------

  const pastilla = (activa) => ({
    fontSize: 12.5,
    borderRadius: 20,
    padding: '6px 13px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    background: activa ? '#e8f4f0' : '#fff',
    border: activa ? `1.5px solid ${VERDE}` : `.5px solid ${BORDE}`,
    color: activa ? VERDE : '#555',
    fontWeight: activa ? 500 : 400,
  });

  const campo = {
    width: '100%',
    padding: '10px 12px',
    border: `.5px solid ${BORDE}`,
    borderRadius: 9,
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    background: '#fafaf7',
  };

  const etiqueta = { fontSize: 12.5, marginBottom: 5, display: 'block' };

  function Grupo({ titulo, opciones, valor, campo: nombre }) {
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 8 }}>{titulo}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {opciones.map((o) => (
            <button key={o.value} type="button" onClick={() => elegir(nombre, o.value)} style={pastilla(valor === o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const botonPrincipal = {
    width: '100%',
    background: MORADO,
    color: '#fff',
    border: 'none',
    borderRadius: 9,
    padding: '12px',
    fontSize: 13.5,
    fontWeight: 500,
    cursor: 'pointer',
    marginTop: 8,
  };

  const listos = temas.filter((t) => form.temas.includes(t.id));
  const visibles = verTodos ? temas : temas.slice(0, TEMAS_VISIBLES);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#f0efe9',
        zIndex: 5000,
        overflowY: 'auto',
        padding: '28px 16px 40px',
      }}
    >
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div className="logo" style={{ display: 'inline-block' }}>
            gov<span>talent</span>
          </div>
        </div>

        {/* Trazos y no círculos numerados: cuatro círculos con números
            parecen un formulario largo antes de empezar. */}
        <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginBottom: 18 }}>
          {Array.from({ length: pasosTotales }).map((_, i) => (
            <span
              key={i}
              style={{
                width: 26,
                height: 5,
                borderRadius: 3,
                background: i < paso ? VERDE : BORDE,
              }}
            ></span>
          ))}
        </div>

        <div
          style={{
            background: '#fff',
            border: `.5px solid ${BORDE}`,
            borderRadius: 14,
            padding: '26px 24px',
          }}
        >
          {paso > 1 && (
            <button
              type="button"
              onClick={() => setPaso(paso - 1)}
              style={{ background: 'none', border: 'none', color: '#888', fontSize: 12.5, padding: 0, marginBottom: 14 }}
            >
              ← Volver
            </button>
          )}

          {/* ---------------- Paso 1: quién eres ---------------- */}
          {paso === 1 && (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Cuéntanos sobre ti</h2>
              <p style={{ fontSize: 13, color: '#888', marginBottom: 22 }}>
                Con esto personalizamos lo que ves desde el primer día.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={etiqueta}>Nombre</label>
                  <input
                    style={campo}
                    value={form.first_name}
                    onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={etiqueta}>Apellidos</label>
                  <input
                    style={campo}
                    value={form.last_name}
                    onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={etiqueta}>Tu puesto</label>
                <input
                  style={campo}
                  placeholder="Director de Asuntos Públicos, Consultor, Técnico de RRII…"
                  value={form.professional_title}
                  onChange={(e) => setForm((f) => ({ ...f, professional_title: e.target.value }))}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={etiqueta}>Dónde trabajas</label>
                <input
                  style={campo}
                  placeholder="Ciudad, país"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                />
              </div>

              <div style={{ borderTop: `.5px solid ${BORDE}`, paddingTop: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
                  ¿Cuál es tu situación profesional?
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {CAREER_SITUATIONS.map((s) => {
                    const on = form.career_situation === s.value;
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, career_situation: s.value }))}
                        style={{
                          textAlign: 'left',
                          padding: '11px 14px',
                          borderRadius: 9,
                          fontSize: 13,
                          cursor: 'pointer',
                          background: on ? '#e8f4f0' : '#fff',
                          border: on ? `1.5px solid ${VERDE}` : `.5px solid ${BORDE}`,
                          color: on ? '#1a1a18' : '#555',
                          fontWeight: on ? 500 : 400,
                        }}
                      >
                        {s.label}
                      </button>
                    );
                  })}

                  {/* La quinta opción sustituye a la pantalla de dos
                      caminos: se pregunta una vez y la respuesta decide
                      el camino, en lugar de pedir que alguien declare qué
                      clase de persona es antes de ver el producto. */}
                  <button
                    type="button"
                    disabled={redirigiendo}
                    onClick={() => {
                      setRedirigiendo(true);
                      window.location.href = '/organizations/new';
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '11px 14px',
                      borderRadius: 9,
                      fontSize: 13,
                      cursor: 'pointer',
                      background: '#fff',
                      border: `.5px dashed #c4c0b8`,
                      color: '#555',
                    }}
                  >
                    {redirigiendo ? 'Un momento…' : 'Vengo a contratar para mi organización'}
                  </button>
                </div>
              </div>

              <button
                type="button"
                disabled={!paso1Listo}
                onClick={() => setPaso(2)}
                style={{ ...botonPrincipal, opacity: paso1Listo ? 1 : 0.45, cursor: paso1Listo ? 'pointer' : 'default', marginTop: 22 }}
              >
                Continuar
              </button>
            </>
          )}

          {/* ---------------- Paso 2: sobre qué trabajas ---------------- */}
          {paso === 2 && (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>¿Sobre qué temas trabajas?</h2>
              <p style={{ fontSize: 13, color: '#888', marginBottom: 18 }}>
                Elige hasta {MAX_TEMAS}. Los usamos para avisarte de los proyectos normativos que te afectan.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 16 }}>
                {visibles.map((t) => {
                  const on = form.temas.includes(t.id);
                  const lleno = !on && form.temas.length >= MAX_TEMAS;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => alternarTema(t.id)}
                      style={{ ...pastilla(on), opacity: lleno ? 0.4 : 1 }}
                    >
                      {t.label}
                    </button>
                  );
                })}
                {!verTodos && temas.length > TEMAS_VISIBLES && (
                  <button
                    type="button"
                    onClick={() => setVerTodos(true)}
                    style={{ background: 'none', border: 'none', color: VERDE, fontSize: 12.5, padding: '6px 3px' }}
                  >
                    Ver los {temas.length} temas
                  </button>
                )}
              </div>

              {/* Lo que la plataforma devuelve, en morado. Y el número es
                  real: sale de las consultas europeas y las iniciativas
                  del Congreso con plazo vivo. Si no hay nada, se dice. */}
              {form.temas.length > 0 && (
                <div
                  style={{
                    background: '#faf9ff',
                    border: '.5px solid #d8d3f5',
                    borderRadius: 9,
                    padding: '11px 13px',
                    marginBottom: 16,
                    fontSize: 12,
                    color: '#555',
                    lineHeight: 1.55,
                  }}
                >
                  {contando ? (
                    'Mirando qué hay abierto…'
                  ) : asuntos === null ? (
                    'Te avisaremos cuando se mueva algo en estos temas.'
                  ) : asuntos === 0 ? (
                    <>
                      Ahora mismo no hay nada con plazo abierto en{' '}
                      {listos.length === 1 ? 'este tema' : 'estos temas'}, pero te avisaremos en cuanto lo haya.
                    </>
                  ) : (
                    <>
                      Con {listos.length === 1 ? 'este tema' : `estos ${listos.length} temas`} te avisaríamos hoy de{' '}
                      <b style={{ color: '#3c3489' }}>
                        {asuntos} {asuntos === 1 ? 'asunto' : 'asuntos'} con plazo abierto
                      </b>
                      .
                    </>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => (conDetalle ? setPaso(3) : terminar())}
                disabled={guardando}
                style={botonPrincipal}
              >
                {conDetalle ? 'Continuar' : guardando ? 'Guardando…' : 'Entrar en GovTalent'}
              </button>
            </>
          )}

          {/* ---------------- Paso 3: dónde estás ---------------- */}
          {paso === 3 && (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Para terminar, dónde estás</h2>
              <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
                Nos sirve para comparar tu perfil con el del sector.
              </p>

              <Grupo titulo="Tipo de organización" opciones={ORG_TYPES} valor={form.org_type} campo="org_type" />
              <Grupo titulo="Tu función" opciones={ROLE_TYPES} valor={form.role_type} campo="role_type" />
              <Grupo titulo="Tu nivel" opciones={LEVEL_TYPES} valor={form.level_type} campo="level_type" />

              <div
                style={{
                  borderTop: `.5px solid ${BORDE}`,
                  paddingTop: 16,
                  display: 'flex',
                  gap: 11,
                  alignItems: 'flex-start',
                }}
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.looking_for_job}
                  onClick={() => setForm((f) => ({ ...f, looking_for_job: !f.looking_for_job }))}
                  style={{
                    width: 34,
                    height: 20,
                    borderRadius: 20,
                    border: 'none',
                    flexShrink: 0,
                    marginTop: 1,
                    position: 'relative',
                    cursor: 'pointer',
                    background: form.looking_for_job ? VERDE : '#d5d3c9',
                    transition: 'background .15s ease',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: form.looking_for_job ? 16 : 2,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left .15s ease',
                    }}
                  ></span>
                </button>
                <div>
                  <div style={{ fontSize: 12.5 }}>Estoy abierto a oportunidades profesionales</div>
                  {/* Sin esta línea, "abierto a oportunidades" suena a que
                      tu jefe puede enterarse, que es lo que frena a los
                      perfiles sénior. */}
                  <div style={{ fontSize: 11.5, color: '#888', marginTop: 2 }}>
                    Solo lo ven las organizaciones cuando te postulas. Nadie más.
                  </div>
                </div>
              </div>

              <button type="button" onClick={terminar} disabled={guardando} style={botonPrincipal}>
                {guardando ? 'Guardando…' : 'Entrar en GovTalent'}
              </button>
            </>
          )}

          {error && (
            <div style={{ fontSize: 12.5, color: '#b3261e', marginTop: 12, lineHeight: 1.5 }}>{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}
