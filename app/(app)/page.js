'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import TextoCreciente, { enviarConIntro } from '@/components/TextoCreciente';
import HistorialBusquedas from '@/components/HistorialBusquedas';
import { URL_EXTENSION } from '@/lib/extension';

/**
 * Home: «AI Finder» en el menú lateral, calcada de la de Enginy.
 *
 * Un saludo, una sola caja en el centro y las acciones arriba a la
 * derecha. La caja busca personas (18-11-2026: el directorio es el
 * producto estrella; antes creaba una alarma). Lo que se escribe no se
 * procesa aquí: se abre la Base de datos con la frase en ?q=, y allí la
 * ventana «Búsqueda de contactos» la interpreta con su progreso a la
 * vista. El acceso por plan también se resuelve allí.
 *
 * Arriba a la derecha (18-11-2026): «Extensión de Chrome», que lleva a
 * Chrome Web Store; «El correo de una persona concreta», que abre esa
 * misma ventana en su opción de correo; y el reloj, que
 * despliega a la derecha el historial de búsquedas.
 */

const MORADO = '#6d5aef';

// Las mismas búsquedas recomendadas que en «Búsqueda de contactos»: llegan
// con su texto exacto y allí se resuelven con filtros fijos, sin IA.
const IDEAS = [
  'Asistentes y asesores del Grupo Parlamentario Popular en el Congreso',
  'Presidentes y secretarios de las Cámaras de Comercio de España',
  'Eurodiputados españoles y sus asistentes',
  // Una debajo de otra, de la más larga a la más corta (18-11-2026).
].sort((a, b) => b.length - a.length);

const BASE_DE_DATOS = '/instituciones/directorio';

// «El correo de una persona concreta»: la ventana, ya en esa opción.
const CORREO = `${BASE_DE_DATOS}?modo=correo`;

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
  const [historial, setHistorial] = useState(false);
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

  const buscar = (frase) => router.push(`${BASE_DE_DATOS}?q=${encodeURIComponent(frase)}`);

  function enviar() {
    const t = texto.trim();
    // La búsqueda necesita al menos 3 letras, como en la ventana.
    if (t.length < 3) {
      cajaRef.current?.focus();
      return;
    }
    buscar(t);
  }

  const listo = texto.trim().length >= 3;

  return (
    <div className="gt-home-fila">
    <div className="gt-home">
      <style>{`
        .gt-home-fila { display: flex; align-items: flex-start; }
        .gt-home { flex: 1; min-width: 0; min-height: 100vh; display: flex; flex-direction: column; }
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
        .gt-home-sug {
          border: 1px solid #e0dfd8; background: transparent; border-radius: 999px; padding: 7px 13px;
          font-family: inherit; font-size: 13px; color: #57534e; cursor: pointer;
        }
        .gt-home-sug:hover { border-color: #c9c7bd; color: #1a1a18; }
        .gt-home-sug:focus-visible { outline: 2px solid ${MORADO}; outline-offset: 2px; }
        @media (max-width: 720px) {
          .gt-home { min-height: auto; }
          .gt-home-centro { padding: 32px 16px 96px; justify-content: flex-start; }
          .gt-home h1 { font-size: 21px; }
        }
        @media (prefers-reduced-motion: reduce) { .gt-home-enviar { transition: none; } }
      `}</style>

      <div className="gt-acciones">
        <a href={URL_EXTENSION} target="_blank" rel="noopener noreferrer" className="gt-accion">
          <img src="/extension/google.png" alt="" width={15} height={15} style={{ width: 15, height: 15, objectFit: 'contain' }} />
          Extensión de Chrome
        </a>
        <Link href={CORREO} className="gt-accion">
          <i className="ti ti-mail-search" aria-hidden="true"></i>
          El correo de una persona concreta
        </Link>
        <span className="gt-accion-sep" aria-hidden="true"></span>
        <button
          type="button"
          className="gt-accion-ic"
          style={{ border: 'none', cursor: 'pointer' }}
          title="Historial de búsquedas"
          aria-label="Historial de búsquedas"
          aria-expanded={historial}
          onClick={() => setHistorial((v) => !v)}
        >
          <i className="ti ti-clock" aria-hidden="true"></i>
        </button>
      </div>

      <div className="gt-home-centro">
        <h1>
          {hola}
          {nombre ? `, ${nombre}` : ''}, describe a quién buscas.
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
              placeholder="Subdirectores generales del Ministerio de Industria, o Ana López de la CNMC"
              aria-label="Describe a quién buscas"
              rows={3}
              maxAltura={260}
            />
          </label>
          <div className="gt-home-pie">
            <button
              type="submit"
              className={`gt-home-enviar${listo ? ' listo' : ''}`}
              aria-label="Buscar"
              title="Buscar"
            >
              <i className="ti ti-arrow-up" aria-hidden="true"></i>
            </button>
          </div>
        </form>

        <div className="gt-home-ideas" style={{ flexDirection: 'column', alignItems: 'center' }}>
          {IDEAS.map((idea) => (
            <button key={idea} type="button" className="gt-home-sug" onClick={() => buscar(idea)}>
              {idea}
            </button>
          ))}
        </div>
      </div>
    </div>
    {historial && <HistorialBusquedas onElegir={buscar} onCerrar={() => setHistorial(false)} />}
    </div>
  );
}
