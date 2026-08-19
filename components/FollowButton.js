'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

/**
 * Botón de seguir, compartido por toda la plataforma.
 *
 * Un solo concepto en vez de tres. Antes había guardar, seguir y
 * compartir según la ficha, sin criterio común: guardar no avisaba de
 * nada y compartir llevaba a una pantalla de registro.
 *
 * Uso:
 *   <FollowButton kind="ley" refId="121/000021/0000" label="Proyecto..." />
 *   <FollowButton kind="expediente" refId="15352" label="..." variant="icon" />
 *
 * El color acompaña a la sección: morado en Regulatorio, verde en
 * Instituciones. Se deduce del tipo para no tener que pasarlo.
 */

// Qué se avisa de cada tipo. Es lo que dice el mensaje al seguir, y
// tiene que coincidir con las reglas de change_rules: prometer avisos
// que el motor no genera sería mentir.
const QUE_AVISAMOS = {
  ley: 'cuando cambie de fase, se designen ponentes o se acerque el plazo de enmiendas',
  actividad: 'cuando cambie de situación o se resuelva',
  expediente: 'cuando cambie de fase, se publiquen documentos o se acerque el plazo',
  procedimiento: 'cuando avance de fase o concluya',
  diputado: 'cuando cambie de grupo o de comisión',
  comision: 'cuando cambie su composición',
  grupo: 'cuando cambie su actividad',
  // El BOE ya está publicado: lo que puede cambiar es que otra norma
  // la modifique o la derogue.
  boe: 'si otra norma la modifica o la deroga',
};

// Verde para lo institucional, morado para lo regulatorio
const VERDES = new Set(['diputado', 'comision', 'grupo']);

/**
 * El botón de proyecto, bloqueado hasta que existan.
 *
 * Va dentro de este componente y no suelto en cada ficha: así aparece en
 * todas partes con el mismo aspecto, y el día que se active basta con
 * tocarlo aquí.
 */
function BotonProyecto() {
  return (
    <span
      title="Añadir a proyecto · próximamente"
      aria-label="Añadir a proyecto · próximamente"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 8px',
        borderRadius: 7,
        color: '#c4c0b8',
        cursor: 'not-allowed',
        flexShrink: 0,
      }}
    >
      <i className="ti ti-folder-plus" style={{ fontSize: 15 }} aria-hidden="true"></i>
    </span>
  );
}

export default function FollowButton({ kind, refId, label, variant = 'button', className, conProyecto = true }) {
  const supabase = createClient();
  const [siguiendo, setSiguiendo] = useState(false);
  const [userId, setUserId] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [hover, setHover] = useState(false);

  const color = VERDES.has(kind) ? '#1d6f5c' : '#6d5aef';
  const fondo = VERDES.has(kind) ? '#e8f4f0' : '#f0eefe';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id || null;
      if (cancelled) return;
      setUserId(uid);
      if (!uid) {
        setCargando(false);
        return;
      }
      const { data } = await supabase
        .from('follows')
        .select('id')
        .eq('user_id', uid)
        .eq('kind', kind)
        .eq('ref_id', String(refId))
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setSiguiendo(!!data);
        setCargando(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, refId]);

  async function alternar(e) {
    e?.preventDefault();
    e?.stopPropagation();
    if (!userId) {
      toast.info('Inicia sesión para seguir esto');
      return;
    }

    if (siguiendo) {
      // Se cambia primero y se revierte si falla: el botón responde al
      // instante y solo da marcha atrás si algo va mal.
      setSiguiendo(false);
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('user_id', userId)
        .eq('kind', kind)
        .eq('ref_id', String(refId));
      if (error) {
        setSiguiendo(true);
        toast.error('No se ha podido dejar de seguir');
        return;
      }
      toast.info('Has dejado de seguirlo', {
        action: { label: 'Deshacer', onClick: () => seguir(true) },
      });
      return;
    }

    seguir();
  }

  async function seguir(silencioso = false) {
    setSiguiendo(true);
    const { error } = await supabase.from('follows').insert({
      user_id: userId,
      kind,
      ref_id: String(refId),
      label: (label || '').slice(0, 200),
    });
    if (error) {
      setSiguiendo(false);
      toast.error('No se ha podido seguir');
      return;
    }
    if (!silencioso) {
      // El mensaje explica qué va a pasar: es la pedagogía en el momento
      // en que importa, sin necesidad de tooltips permanentes.
      toast(`Te avisaremos ${QUE_AVISAMOS[kind] || 'cuando haya novedades'}.`);
    }
  }

  if (cargando) return null;

  // --- Variante icono: para listados, donde el texto sobra -----------
  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={alternar}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label={siguiendo ? 'Dejar de seguir' : 'Seguir'}
        title={siguiendo ? 'Dejar de seguir' : 'Seguir'}
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 5,
          borderRadius: 6,
          border: 'none',
          background: hover ? fondo : 'transparent',
          color: siguiendo ? color : hover ? color : '#a8a49c',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'background .15s ease, color .15s ease',
        }}
      >
        <i className={`ti ti-bell${siguiendo ? '-filled' : ''}`} style={{ fontSize: 15 }} aria-hidden="true"></i>
      </button>
    );
  }

  // --- Variante botón: para fichas ------------------------------------
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
    <button
      type="button"
      onClick={alternar}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 7,
        border: 'none',
        fontSize: 12.5,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        background: siguiendo ? fondo : hover ? fondo : '#f5f4f1',
        color: siguiendo ? color : hover ? color : '#57534e',
        transition: 'background .15s ease, color .15s ease',
      }}
    >
      <i className={`ti ti-bell${siguiendo ? '-filled' : ''}`} style={{ fontSize: 15 }} aria-hidden="true"></i>
      {siguiendo ? 'Siguiendo' : 'Seguir'}
    </button>
    {conProyecto && <BotonProyecto />}
    </span>
  );
}
