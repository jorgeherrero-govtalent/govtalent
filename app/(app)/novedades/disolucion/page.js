'use client';

/**
 * Novedades › Disolución de las Cortes (maqueta C).
 *
 * Las leyes que el usuario sigue y caducaron el 06-10-2026, con dónde se
 * quedó cada una, para decidir ley a ley si mantiene el seguimiento.
 * «Mantener» es lo que ya pasa: el seguimiento sigue activo y, cuando se
 * constituyan las nuevas Cortes, se enlazará con la ley que se vuelva a
 * presentar. «Dejar de seguir» borra el seguimiento.
 *
 * Al guardar se crea la marca resuelto:caducadas-xv y el aviso deja de
 * salir en Novedades. La página sigue accesible por si quiere volver.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import BackLink from '@/components/BackLink';
import { CLAVE_RESUELTO, FECHA_DISOLUCION, leyesCaducadasQueSigue } from '@/lib/caducadas';

const MORADO = '#6d5aef';
const MORADO_S = '#f0eefe';
const MORADO_O = '#3c3489';
const GRIS = '#8b8780';
const LINEA = '#e6e4dc';
const LINEA2 = '#f0f0eb';
const TINTA = '#1a1a18';

export default function DisolucionPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState(null);
  const [leyes, setLeyes] = useState(null);
  // num_expediente → true si la mantiene. Por defecto, todas.
  const [mantener, setMantener] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      try {
        const l = await leyesCaducadasQueSigue(supabase, user.id);
        setLeyes(l);
        setMantener(Object.fromEntries(l.map((x) => [x.num_expediente, true])));
      } catch {
        setLeyes([]);
        toast.error('No se han podido cargar tus leyes. Recarga la página.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardar(todasFuera = false) {
    if (!userId || !leyes) return;
    setGuardando(true);
    const fuera = leyes.filter((l) => todasFuera || !mantener[l.num_expediente]);
    try {
      if (fuera.length > 0) {
        const ids = fuera.map((l) => l.followId).filter(Boolean);
        const { error } = await supabase.from('follows').delete().eq('user_id', userId).in('id', ids);
        if (error) throw error;
      }
      const { error: e2 } = await supabase.from('usuario_marcas').insert({ user_id: userId, clave: CLAVE_RESUELTO });
      if (e2 && e2.code !== '23505') throw e2;
      setHecho({ mantiene: leyes.length - fuera.length, deja: fuera.length });
    } catch {
      toast.error('No se han podido guardar los cambios. Inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="sec" style={{ maxWidth: 820 }}>
      <BackLink fallbackHref="/novedades" fallbackLabel="Volver a Novedades" />

      <div style={{ margin: '14px 0 18px' }}>
        <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: MORADO_O, fontWeight: 600 }}>
          Disolución de las Cortes · {FECHA_DISOLUCION}
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '6px 0 0', letterSpacing: '-.3px', textWrap: 'balance' }}>
          {leyes && leyes.length > 0
            ? leyes.length === 1
              ? 'Ha caducado 1 ley que seguías'
              : `Han caducado ${leyes.length} leyes que seguías`
            : 'Leyes caducadas que seguías'}
        </h1>
        <p style={{ fontSize: 13, color: GRIS, margin: '8px 0 0', lineHeight: 1.6, maxWidth: 620 }}>
          Con la disolución caduca todo lo que estaba en tramitación en el Congreso y el Senado. Si mantienes el
          seguimiento, te avisaremos si alguna se vuelve a presentar en la nueva legislatura.
        </p>
      </div>

      {leyes === null ? (
        <div className="spinner"></div>
      ) : hecho ? (
        <div style={{ background: '#fff', border: `1px solid ${LINEA}`, borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>Guardado</div>
          <div style={{ fontSize: 13, color: GRIS, lineHeight: 1.6, marginTop: 4 }}>
            {hecho.mantiene > 0 && `Mantienes ${hecho.mantiene === 1 ? '1 ley' : `${hecho.mantiene} leyes`}. `}
            {hecho.deja > 0 && `Has dejado de seguir ${hecho.deja === 1 ? '1 ley' : `${hecho.deja} leyes`}.`}
          </div>
          <Link href="/novedades" style={{ display: 'inline-block', marginTop: 14, fontSize: 13, color: MORADO, textDecoration: 'none', fontWeight: 500 }}>
            Volver a Novedades →
          </Link>
        </div>
      ) : leyes.length === 0 ? (
        <div style={{ background: '#fff', border: `1px solid ${LINEA}`, borderRadius: 14, padding: '20px 22px', fontSize: 13, color: GRIS }}>
          No seguías ninguna ley que haya caducado con la disolución.
        </div>
      ) : (
        <div style={{ background: '#fff', border: `1px solid ${LINEA}`, borderRadius: 14, overflow: 'hidden' }}>
          <style>{`
            .dis-fila { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center; padding: 14px 20px; border-top: 1px solid ${LINEA2}; }
            .dis-fila:first-child { border-top: none; }
            .dis-opc { display: flex; gap: 2px; background: #f6f5f1; border-radius: 9px; padding: 3px; }
            .dis-opc button { border: none; background: transparent; font-family: inherit; font-size: 12px; padding: 6px 11px; border-radius: 7px; cursor: pointer; color: ${GRIS}; white-space: nowrap; }
            .dis-opc button[aria-pressed='true'] { background: #fff; color: ${TINTA}; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
            .dis-opc button:focus-visible { outline: 2px solid ${MORADO}; }
            @media (max-width: 620px) { .dis-fila { grid-template-columns: 1fr; gap: 10px; } }
          `}</style>
          {leyes.map((l) => (
            <div key={l.num_expediente} className="dis-fila">
              <div style={{ minWidth: 0 }}>
                <Link href={`/congreso/${l.slug}`} style={{ fontSize: 13.5, fontWeight: 600, color: TINTA, textDecoration: 'none', lineHeight: 1.4 }}>
                  {l.title}
                </Link>
                {l.seQuedo && (
                  <div style={{ fontSize: 12, color: GRIS, marginTop: 4 }}>
                    <span style={{ color: '#b8b4ac' }}>Se quedó en </span>
                    {l.seQuedo}
                    {l.n_prorrogas > 0 && ` · ${l.n_prorrogas} ${l.n_prorrogas === 1 ? 'prórroga' : 'prórrogas'}`}
                  </div>
                )}
              </div>
              <div className="dis-opc" role="group" aria-label={`Seguimiento de ${l.title}`}>
                <button
                  type="button"
                  aria-pressed={!!mantener[l.num_expediente]}
                  onClick={() => setMantener((m) => ({ ...m, [l.num_expediente]: true }))}
                >
                  Mantener
                </button>
                <button
                  type="button"
                  aria-pressed={!mantener[l.num_expediente]}
                  onClick={() => setMantener((m) => ({ ...m, [l.num_expediente]: false }))}
                >
                  Dejar de seguir
                </button>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '14px 20px', borderTop: `1px solid ${LINEA2}`, background: '#faf9f5' }}>
            <button
              type="button"
              disabled={guardando}
              onClick={() => guardar(false)}
              style={{ border: 'none', borderRadius: 9, background: MORADO, color: '#fff', fontSize: 13, fontWeight: 500, padding: '9px 16px', cursor: guardando ? 'default' : 'pointer', fontFamily: 'inherit', opacity: guardando ? 0.6 : 1 }}
            >
              Guardar
            </button>
            <button
              type="button"
              disabled={guardando}
              onClick={() => guardar(true)}
              style={{ border: `1px solid ${LINEA}`, borderRadius: 9, background: '#fff', color: TINTA, fontSize: 13, padding: '9px 16px', cursor: guardando ? 'default' : 'pointer', fontFamily: 'inherit' }}
            >
              Dejar de seguir todas
            </button>
          </div>
        </div>
      )}
      {leyes && leyes.length > 0 && !hecho && (
        <p style={{ fontSize: 12, color: GRIS, marginTop: 12, lineHeight: 1.6 }}>
          Por defecto se mantienen todas. <span style={{ background: MORADO_S, color: MORADO_O, padding: '1px 6px', borderRadius: 6 }}>Mantener</span> no
          cambia nada ahora: el seguimiento sigue activo hasta que haya Cortes nuevas.
        </p>
      )}
    </div>
  );
}
