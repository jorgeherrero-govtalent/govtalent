'use client';

import { useState } from 'react';
import { MORADO, BORDE, GRIS, miles, Buscando, ESTILOS_CONTACTOS } from '@/components/ContactosUI';

const PASOS_DESCUBRIR = [
  'Buscando organigramas oficiales…',
  'Revisando portales de transparencia…',
  'Consultando nombramientos y ceses en boletines…',
  'Comprobando quién ocupa hoy cada cargo…',
  'Cruzando con el directorio de GovTalent…',
  'Descartando lo que no está citado en las fuentes…',
];

/**
 * Buscar fuera de GovTalent por cargo (sql/97), dentro de Contactos.
 *
 * Tras una búsqueda por cargo («secretarios del Departament de Territori de
 * la Generalitat»), ofrece buscar en fuentes oficiales quién ocupa hoy esos
 * cargos. 2 créditos, solo si encuentra a alguien nuevo. Lo encontrado se
 * revisa con casillas (los dudosos, sin marcar) y «Añadir a la selección»
 * da de alta a los nuevos y los pasa a la selección de la página, donde ya
 * están «Añadir a lista» y «Enriquecer».
 *
 * consulta: la frase buscada · onSeleccionar(filas): mete filas de
 * directorio_pro en la selección · onSaldo(saldo) · onSinCreditos()
 */
export default function DescubrirPanel({ consulta, onSeleccionar, onSaldo, onSinCreditos }) {
  const [fase, setFase] = useState('inicio'); // inicio | buscando | hecho | error | anadido
  const [res, setRes] = useState(null);
  const [marcados, setMarcados] = useState(() => new Set());
  const [error, setError] = useState('');
  const [anadiendo, setAnadiendo] = useState(false);
  const [anadidos, setAnadidos] = useState(null);

  async function buscar() {
    setFase('buscando');
    setError('');
    try {
      const r = await fetch('/api/contactos/descubrir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: consulta }),
      });
      const j = await r.json().catch(() => ({}));
      if (j.saldo && onSaldo) onSaldo(j.saldo);
      if (r.status === 402 || j.sinCreditos) {
        setFase('inicio');
        if (onSinCreditos) onSinCreditos();
        return;
      }
      if (!r.ok) throw new Error(j.error || 'No se pudo completar la búsqueda. No se ha descontado ningún crédito.');
      setRes(j);
      setMarcados(new Set((j.personas || []).filter((p) => !p.dudoso).map((p) => p.i)));
      setFase('hecho');
    } catch (e) {
      setError(e.message);
      setFase('error');
    }
  }

  function alternar(i) {
    setMarcados((prev) => {
      const s = new Set(prev);
      if (s.has(i)) s.delete(i);
      else s.add(i);
      return s;
    });
  }

  async function anadir() {
    if (!res?.id || !marcados.size) return;
    setAnadiendo(true);
    setError('');
    try {
      const r = await fetch('/api/contactos/descubrir/alta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: res.id, indices: [...marcados] }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'No se pudieron añadir');
      onSeleccionar(j.filas || []);
      setAnadidos({ total: (j.filas || []).length, altas: j.altas || 0 });
      setFase('anadido');
    } catch (e) {
      setError(e.message);
    }
    setAnadiendo(false);
  }

  const caja = {
    border: `1px dashed #cfc9f8`,
    background: '#f6f4fe',
    borderRadius: 10,
    padding: '11px 14px',
    marginBottom: 12,
  };

  if (fase === 'inicio' || fase === 'error') {
    return (
      <div style={{ ...caja, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <b style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>¿Faltan personas?</b>
          <span style={{ display: 'block', fontSize: 12, color: GRIS, marginTop: 2 }}>
            {fase === 'error' ? error : 'Buscamos en fuentes oficiales quién ocupa hoy esos cargos. 2 créditos, solo si encontramos a alguien que no esté en GovTalent.'}
          </span>
        </div>
        <button type="button" className="btn-ai-o" onClick={buscar} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-world-search" aria-hidden="true"></i> Buscar fuera de GovTalent
        </button>
      </div>
    );
  }

  if (fase === 'buscando') {
    return (
      <div style={{ ...caja, borderStyle: 'solid', borderColor: BORDE, background: '#fff', padding: 0, overflow: 'hidden' }}>
        <style>{ESTILOS_CONTACTOS}</style>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: `1px solid ${BORDE}`, flexWrap: 'wrap' }}>
          <Buscando pasos={PASOS_DESCUBRIR} />
          <span style={{ fontSize: 11.5, color: GRIS }}>Puede tardar hasta dos minutos.</span>
        </div>
        {[0, 1, 2].map((n) => (
          <div
            key={n}
            style={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 220px) minmax(0, 1fr) 70px', gap: 12, alignItems: 'center', padding: '11px 14px', borderTop: n ? '1px solid #f1f0ea' : 'none' }}
          >
            <span className="skel" style={{ display: 'block', width: 14, height: 14, borderRadius: 3 }} />
            <span className="skel" style={{ display: 'block', width: `${70 - n * 12}%`, height: 11, borderRadius: 4 }} />
            <span className="skel" style={{ display: 'block', width: `${85 - n * 15}%`, height: 11, borderRadius: 4 }} />
            <span className="skel" style={{ display: 'block', width: 56, height: 16, borderRadius: 999 }} />
          </div>
        ))}
      </div>
    );
  }

  if (fase === 'anadido') {
    return (
      <div style={{ ...caja, fontSize: 13, color: '#3a3a3d' }}>
        <b style={{ fontWeight: 600 }}>
          {miles(anadidos?.total || 0)} {anadidos?.total === 1 ? 'persona añadida' : 'personas añadidas'} a la selección
        </b>
        <span style={{ display: 'block', fontSize: 12, color: GRIS, marginTop: 2 }}>
          {anadidos?.altas ? `${miles(anadidos.altas)} no estaban en GovTalent y ya están en el directorio. ` : ''}
          Usa «Añadir a lista» o «Enriquecer» en la barra de la selección.
        </span>
      </div>
    );
  }

  const personas = res?.personas || [];
  return (
    <div style={{ ...caja, borderStyle: 'solid', borderColor: BORDE, background: '#fff', padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: `1px solid ${BORDE}`, flexWrap: 'wrap' }}>
        <div>
          <b style={{ fontSize: 13.5, fontWeight: 600 }}>Encontrados en fuentes oficiales · {miles(personas.length)}</b>
          <span style={{ display: 'block', fontSize: 12, color: GRIS, marginTop: 2 }}>
            {res.nuevos ? `${miles(res.nuevos)} no estaban en GovTalent` : 'Todos estaban ya en GovTalent'}
            {res.cobrado ? ` · ${res.creditos} créditos` : ' · sin coste'}
          </span>
        </div>
        {personas.length > 0 && (
          <button type="button" className="btn-ai" onClick={anadir} disabled={anadiendo || !marcados.size}>
            {anadiendo ? 'Añadiendo…' : `Añadir ${miles(marcados.size)} a la selección`}
          </button>
        )}
      </div>
      {error && <div style={{ fontSize: 12.5, color: '#3a3a3d', padding: '8px 14px' }}>{error}</div>}
      {personas.length === 0 ? (
        <div style={{ fontSize: 13, color: '#3a3a3d', padding: '12px 14px' }}>No hemos encontrado a nadie en fuentes oficiales. No se ha descontado ningún crédito.{res.notas ? <span style={{ display: 'block', fontSize: 12, color: GRIS, marginTop: 4 }}>{res.notas}</span> : null} Prueba a acotar por consejería o departamento.</div>
      ) : (
        <div>
          {personas.map((p) => (
            <label
              key={p.i}
              style={{
                display: 'grid',
                gridTemplateColumns: '22px minmax(0, 220px) minmax(0, 1fr) auto',
                gap: 12,
                alignItems: 'center',
                padding: '9px 14px',
                borderTop: `1px solid #f1f0ea`,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <input type="checkbox" checked={marcados.has(p.i)} onChange={() => alternar(p.i)} aria-label={`Seleccionar a ${p.nombre}`} />
              <span style={{ fontWeight: 600 }}>{p.nombre}</span>
              <span style={{ color: '#3a3a3d', fontSize: 12.5 }}>
                {p.cargo}
                <span style={{ color: GRIS }}>
                  {' · '}
                  {p.organizacion}
                  {p.fuente_dominio ? ` · ${p.fuente_dominio}` : ''}
                </span>
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  borderRadius: 999,
                  padding: '2px 8px',
                  whiteSpace: 'nowrap',
                  ...(p.existente_id ? { background: '#efeee8', color: '#4a4a4e' } : { background: '#efedfd', color: '#3d2fb3' }),
                }}
              >
                {p.existente_id ? 'En GovTalent' : p.dudoso ? 'Nuevo · dudoso' : 'Nuevo'}
              </span>
            </label>
          ))}
          {personas.some((p) => p.dudoso && !p.existente_id) && (
            <div style={{ fontSize: 12, color: GRIS, padding: '8px 14px', borderTop: `1px solid #f1f0ea` }}>
              Los dudosos no aparecen citados en las fuentes o tienen poca confianza: van sin marcar.
            </div>
          )}
        </div>
      )}
      <span style={{ display: 'none', color: MORADO }} />
    </div>
  );
}
