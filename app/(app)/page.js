'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import TextoCreciente, { enviarConIntro } from '@/components/TextoCreciente';

// La misma clave que exporta AlarmasTab. Se repite aquí para no cargar
// ese componente entero en la home solo por una cadena.
const CLAVE_PEDIDO = 'govtalent.alarmas.pedido';

/**
 * Home: el «Asistente» del menú lateral, calcado de la de Enginy.
 *
 * Un saludo, una sola caja en el centro y las acciones arriba a la
 * derecha. La caja crea una alarma: lo que se escribe no se procesa
 * aquí, se guarda en la pestaña y se abre /alarmas, que se lo pide al
 * agente con su progreso a la vista (AlarmasTab lee CLAVE_PEDIDO al
 * cargar). Los límites por plan también se aplican allí, que es donde
 * está el aviso de Pro.
 *
 * Lo que antes enseñaba el mosaico vive ahora en el menú: lo nuevo en
 * Novedades, con su contador, y los plazos en Regulatorio.
 */

const MORADO = '#6d5aef';

// Las mismas ideas que en la página de Alarmas: el mismo agente.
const IDEAS = ['Todo lo que afecte a mi sector', 'Los cambios de una ley concreta', 'Consultas públicas de un ministerio'];

function saludo() {
  const h = new Date().getHours();
  if (h >= 6 && h < 14) return 'Buenos días';
  if (h >= 14 && h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function Home() {
  const supabase = createClient();
  const router = useRouter();
  const cajaRef = useRef(null);
  const [nombre, setNombre] = useState('');
  const [texto, setTexto] = useState('');
  // El saludo depende de la hora del navegador: se calcula tras montar
  // para que el primer render coincida con el del servidor.
  const [hola, setHola] = useState('Hola');

  useEffect(() => {
    setHola(saludo());
    let activo = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user || !activo) return;
      const { data: perfil } = await supabase.from('users').select('first_name').eq('id', data.user.id).single();
      if (activo) setNombre(perfil?.first_name || '');
    })();
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function enviar() {
    const t = texto.trim();
    if (!t) {
      cajaRef.current?.focus();
      return;
    }
    try {
      window.sessionStorage.setItem(CLAVE_PEDIDO, t);
    } catch {}
    router.push('/alarmas');
  }

  function usarIdea(idea) {
    setTexto(`${idea}: `);
    setTimeout(() => {
      const el = cajaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 0);
  }

  const listo = texto.trim().length > 0;

  return (
    <div className="gt-home">
      <style>{`
        .gt-home { min-height: 100vh; display: flex; flex-direction: column; }
        .gt-home-centro {
          flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 22px; padding: 0 24px 12vh;
        }
        .gt-home h1 {
          font-size: 26px; font-weight: 600; letter-spacing: -.4px; margin: 0;
          text-align: center; text-wrap: balance; color: #1a1a18;
        }
        .gt-home-caja {
          width: 100%; max-width: 680px; background: #fff; border: 1px solid #e5e4de; border-radius: 20px;
          box-shadow: 0 1px 2px rgba(26,26,24,.04), 0 10px 30px rgba(26,26,24,.06);
          padding: 18px 18px 14px; display: flex; flex-direction: column; gap: 14px;
        }
        .gt-home-caja:focus-within { border-color: #d8d3f5; }
        .gt-home-entrada { display: flex; gap: 12px; align-items: flex-start; }
        .gt-home-entrada > i { font-size: 20px; color: #a8a49c; margin-top: 1px; flex-shrink: 0; }
        .gt-home-entrada textarea {
          flex: 1; min-width: 0; min-height: 76px; border: none; outline: none; background: transparent;
          font-family: inherit; font-size: 15px; line-height: 1.55; color: #1a1a18; padding: 0;
        }
        .gt-home-entrada textarea::placeholder { color: #a8a49c; }
        .gt-home-pie { display: flex; justify-content: flex-end; }
        .gt-home-enviar {
          width: 38px; height: 38px; border-radius: 50%; border: 1px solid #e5e4de; background: #f7f6f2;
          color: #a8a49c; display: flex; align-items: center; justify-content: center; cursor: pointer;
          transition: background .15s, color .15s;
        }
        .gt-home-enviar i { font-size: 18px; }
        .gt-home-enviar.listo { background: ${MORADO}; border-color: ${MORADO}; color: #fff; }
        .gt-home-enviar:focus-visible, .gt-home-idea:focus-visible { outline: 2px solid ${MORADO}; outline-offset: 2px; }
        .gt-home-ideas { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
        .gt-home-idea {
          display: inline-flex; align-items: center; gap: 7px; border: 1px solid #e0dfd8; background: #fff;
          border-radius: 9px; padding: 8px 12px; font-family: inherit; font-size: 13.5px; color: #1a1a18;
          cursor: pointer; box-shadow: 0 1px 2px rgba(26,26,24,.05);
        }
        .gt-home-idea i { font-size: 16px; color: ${MORADO}; }
        .gt-home-idea:hover { border-color: #d8d3f5; }
        @media (max-width: 720px) {
          .gt-home { min-height: auto; }
          .gt-home-centro { padding: 32px 16px 96px; justify-content: flex-start; }
          .gt-home h1 { font-size: 21px; }
        }
        @media (prefers-reduced-motion: reduce) { .gt-home-enviar { transition: none; } }
      `}</style>

      <div className="gt-acciones">
        <Link href="/alarmas" className="gt-accion-ic" title="Tus alarmas" aria-label="Tus alarmas">
          <i className="ti ti-bell" aria-hidden="true"></i>
        </Link>
        <Link href="/novedades" className="gt-accion-ic" title="Novedades" aria-label="Novedades">
          <i className="ti ti-clock" aria-hidden="true"></i>
        </Link>
      </div>

      <div className="gt-home-centro">
        <h1>
          {hola}
          {nombre ? ` ${nombre}` : ''}, describe lo que quieres vigilar.
        </h1>

        <form
          className="gt-home-caja"
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <label className="gt-home-entrada">
            <i className="ti ti-sparkles" aria-hidden="true"></i>
            <TextoCreciente
              id="gt-home-caja"
              ref={cajaRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={enviarConIntro(enviar)}
              placeholder="Normas y consultas que afecten a una aseguradora con sede en Madrid"
              aria-label="Describe lo que quieres vigilar"
              rows={3}
              maxAltura={260}
            />
          </label>
          <div className="gt-home-pie">
            <button
              type="submit"
              className={`gt-home-enviar${listo ? ' listo' : ''}`}
              aria-label="Crear la alarma"
              title="Crear la alarma"
            >
              <i className="ti ti-arrow-up" aria-hidden="true"></i>
            </button>
          </div>
        </form>

        <div className="gt-home-ideas">
          {IDEAS.map((idea) => (
            <button key={idea} type="button" className="gt-home-idea" onClick={() => usarIdea(idea)}>
              <i className="ti ti-sparkles" aria-hidden="true"></i>
              {idea}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
