'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import Paginacion, { usePaginacion } from '@/components/Paginacion';
import {
  ESTILOS_CONTACTOS,
  MORADO,
  GRIS,
  miles,
  fecha,
  TarjetaCreditos,
  ModalComprar,
  Modal,
  CeldaContacto,
  useEnriquecer,
  enriquecible,
  ModalEnriquecerVarios,
  exportarExcel,
  registrarExportacion,
} from '@/components/ContactosUI';

/**
 * Una lista (sql/76): sus personas con el dato actual y, a la derecha, los
 * cambios detectados al comparar con la foto guardada al añadirlas:
 * salidas, cambios de cargo o de contacto e incorporaciones (si la lista
 * se creó desde una búsqueda). Cada cambio se acepta o se descarta.
 */

const ETIQUETA_CAMBIO = {
  salida: 'Ya no figura',
  cargo: 'Cambio de cargo',
  contacto: 'Contacto actualizado',
};

export default function ListaPage() {
  const { id } = useParams();
  const router = useRouter();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [saldo, setSaldo] = useState(null);
  const [packs, setPacks] = useState([]);
  const [modalComprar, setModalComprar] = useState(false);
  const [renombrando, setRenombrando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [borrar, setBorrar] = useState(false);
  const [ocupado, setOcupado] = useState(null); // persona_id en curso
  const [confirmarEnr, setConfirmarEnr] = useState(null);
  const [exportError, setExportError] = useState('');
  const [sel, setSel] = useState(() => new Set());

  const { estado: enr, enMarcha, enriquecer, enriquecerVarios } = useEnriquecer({ onSaldo: setSaldo });

  async function cargar() {
    try {
      const res = await fetch(`/api/contactos/listas/${id}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'No se pudo cargar la lista');
      setDatos(json);
      setNombre(json.lista?.nombre || '');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar();
    fetch('/api/creditos', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        setSaldo(j.saldo || null);
        setPacks(j.packs || []);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Cada miembro como fila de la tabla: el dato actual o, si ya no figura, la foto.
  const filas = useMemo(
    () =>
      (datos?.miembros || []).map((m) => ({
        ...(m.actual || m.snapshot || {}),
        id: m.persona_id,
        enriquecido: m.enriquecido || null,
        _cambio: m.cambio,
        _salida: !m.actual,
      })),
    [datos]
  );
  const cambios = (datos?.miembros || []).filter((m) => m.cambio);
  const incorporaciones = datos?.incorporaciones || [];
  const nCambios = cambios.length + (datos?.n_incorporaciones || 0);

  const pag = usePaginacion(filas.length, [datos?.lista?.id]);
  const pagina = filas.slice(pag.desde, pag.hasta);
  const enriquecibles = filas.filter((f) => !f._salida && enriquecible(f, enr)).map((f) => f.id);

  async function accion(accionNombre, personaId) {
    setOcupado(personaId);
    try {
      const res = await fetch(`/api/contactos/listas/${id}/cambios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: accionNombre, persona_id: personaId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'No se pudo aplicar');
      await cargar();
    } catch (e) {
      setError(e.message);
    }
    setOcupado(null);
  }

  async function guardarNombre() {
    const n = nombre.trim();
    if (!n) return;
    const res = await fetch(`/api/contactos/listas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: n }),
    });
    if (res.ok) {
      setRenombrando(false);
      cargar();
    }
  }

  async function borrarLista() {
    const res = await fetch(`/api/contactos/listas/${id}`, { method: 'DELETE' });
    if (res.ok) router.push('/contactos/listas');
  }

  const todasMarcadas = pagina.length > 0 && pagina.every((f) => sel.has(f.id));
  function marcar(fid) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(fid)) n.delete(fid);
      else n.add(fid);
      return n;
    });
  }
  function marcarPagina() {
    setSel((prev) => {
      const n = new Set(prev);
      if (todasMarcadas) pagina.forEach((f) => n.delete(f.id));
      else pagina.forEach((f) => n.add(f.id));
      return n;
    });
  }
  const seleccionadas = filas.filter((f) => sel.has(f.id));
  const enriqueciblesSel = seleccionadas.filter((f) => !f._salida && enriquecible(f, enr)).map((f) => f.id);

  async function quitarSeleccion() {
    const ids = [...sel];
    if (!ids.length) return;
    try {
      const res = await fetch(`/api/contactos/listas/${id}/miembros`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'No se pudieron quitar');
      setSel(new Set());
      await cargar();
    } catch (e) {
      setError(e.message);
    }
  }

  async function exportar(soloSeleccion = false) {
    setExportError('');
    try {
      const vivas = (soloSeleccion ? seleccionadas : filas).filter((f) => !f._salida);
      await registrarExportacion(vivas.length, { lista: id });
      exportarExcel(vivas, `lista-${(datos?.lista?.nombre || 'contactos').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`, enr);
    } catch (e) {
      setExportError(e.message);
    }
  }

  if (error && !datos) {
    return (
      <div className="gt-ct">
        <style>{ESTILOS_CONTACTOS}</style>
        <Link href="/contactos/listas" style={{ fontSize: 13, color: GRIS, textDecoration: 'none' }}>
          ← Listas
        </Link>
        <div className="gt-ct-aviso" style={{ marginTop: 16 }}>
          {error}
        </div>
      </div>
    );
  }
  if (!datos) return <div className="spinner"></div>;

  const l = datos.lista;

  return (
    <div className="gt-ct">
      <style>{ESTILOS_CONTACTOS}</style>
      <Link href="/contactos/listas" style={{ fontSize: 13, color: GRIS, textDecoration: 'none' }}>
        ← Listas
      </Link>

      <div className="gt-ct-cab" style={{ marginTop: 10 }}>
        <div style={{ minWidth: 0 }}>
          {renombrando ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                guardarNombre();
              }}
              style={{ display: 'flex', gap: 8, alignItems: 'center' }}
            >
              <input className="gt-ct-in" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} autoFocus style={{ fontSize: 16, padding: '6px 10px', minWidth: 280 }} aria-label="Nombre de la lista" />
              <button type="submit" className="btn-ai" style={{ padding: '7px 12px' }}>
                Guardar
              </button>
              <button type="button" className="btn-g" onClick={() => setRenombrando(false)}>
                Cancelar
              </button>
            </form>
          ) : (
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {l.nombre}
              <button type="button" onClick={() => setRenombrando(true)} aria-label="Renombrar la lista" title="Renombrar" style={{ border: 'none', background: 'transparent', color: GRIS, cursor: 'pointer' }}>
                <i className="ti ti-pencil" aria-hidden="true"></i>
              </button>
            </h1>
          )}
          <p>
            {miles(filas.length)} {filas.length === 1 ? 'persona' : 'personas'}
            {l.consulta ? ` · creada desde «${l.consulta}»` : ''}
            {l.filtros ? ' · avisa de incorporaciones' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <TarjetaCreditos saldo={saldo} onComprar={() => setModalComprar(true)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        {enriquecibles.length > 0 && (
          <button type="button" className="btn-ai-o" style={{ padding: '7px 12px', fontSize: 12.5 }} onClick={() => setConfirmarEnr(enriquecibles)}>
            Enriquecer los que no tienen correo · máx. {miles(enriquecibles.length)} créditos
          </button>
        )}
        {enMarcha > 0 && <span style={{ fontSize: 12.5, color: '#5443d6' }}>Enriqueciendo {miles(enMarcha)}…</span>}
        <span style={{ flexGrow: 1 }}></span>
        <button type="button" className="btn-g" onClick={() => exportar(false)} disabled={filas.length === 0}>
          Exportar todo
        </button>
        <button type="button" className="btn-g" onClick={() => setBorrar(true)}>
          Borrar lista
        </button>
      </div>
      {sel.size > 0 && (
        <div className="gt-ct-sel" style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {miles(sel.size)} {sel.size === 1 ? 'seleccionada' : 'seleccionadas'}
          </span>
          <span style={{ flexGrow: 1 }}></span>
          <button type="button" className="btn-g" onClick={() => setSel(new Set())}>
            Quitar selección
          </button>
          <button type="button" className="btn-g" onClick={quitarSeleccion}>
            Quitar de la lista
          </button>
          <button type="button" className="btn-g" onClick={() => exportar(true)}>
            Exportar
          </button>
          {enriqueciblesSel.length > 0 && (
            <button type="button" className="btn-ai" onClick={() => setConfirmarEnr(enriqueciblesSel)}>
              Enriquecer · hasta {miles(enriqueciblesSel.length)} créditos
            </button>
          )}
        </div>
      )}
      {exportError && <div className="gt-ct-aviso" style={{ marginBottom: 12 }}>{exportError}</div>}
      {error && <div className="gt-ct-aviso" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="gt-ct-res">
        <section className="gt-ct-main">
          {filas.length === 0 ? (
            <div className="gt-ct-aviso" style={{ padding: '18px 16px' }}>
              Esta lista está vacía. Añade personas desde el buscador de Contactos.
            </div>
          ) : (
            <div className="gt-ct-tabla">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>
                      <input type="checkbox" checked={todasMarcadas} onChange={marcarPagina} aria-label="Seleccionar esta página" />
                    </th>
                    <th>Nombre</th>
                    <th>Cargo</th>
                    <th>Institución</th>
                    <th>Contacto</th>
                    <th>
                      <span style={{ position: 'absolute', left: -9999 }}>Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagina.map((f) => (
                    <tr key={f.id} style={f._cambio ? { background: '#faf9ff' } : undefined}>
                      <td>
                        <input type="checkbox" checked={sel.has(f.id)} onChange={() => marcar(f.id)} aria-label={`Seleccionar a ${f.nombre}`} />
                      </td>
                      <td style={{ fontWeight: 500, color: f._salida ? GRIS : undefined }}>
                        {f.nombre}
                        {f._cambio && (
                          <div style={{ marginTop: 3 }}>
                            <span className="gt-ct-tit" style={{ marginLeft: 0 }}>
                              {ETIQUETA_CAMBIO[f._cambio]}
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={{ color: f._salida ? GRIS : '#3a3a3d' }}>{f.cargo}</td>
                      <td style={{ color: f._salida ? GRIS : undefined }}>
                        <div>{f.institucion}</div>
                        {f.unidad && f.unidad !== f.institucion && <div style={{ fontSize: 12, color: GRIS, marginTop: 2 }}>{f.unidad}</div>}
                      </td>
                      <td>
                        <CeldaContacto
                          f={f}
                          estado={enr}
                          puedeEnriquecer={!f._salida}
                          onEnriquecer={(pid) => (saldo?.disponibles >= 1 ? enriquecer(pid) : setModalComprar(true))}
                        />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => accion('quitar', f.id)}
                          disabled={ocupado === f.id}
                          aria-label={`Quitar a ${f.nombre} de la lista`}
                          title="Quitar de la lista"
                          style={{ border: 'none', background: 'transparent', color: GRIS, cursor: 'pointer' }}
                        >
                          <i className="ti ti-trash" aria-hidden="true"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Paginacion pag={pag} dentro />
            </div>
          )}
        </section>

        <aside className="gt-ct-panel" aria-label="Cambios detectados">
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #ececef', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: nCambios ? MORADO : GRIS }}>
              {nCambios ? `${miles(nCambios)} ${nCambios === 1 ? 'cambio detectado' : 'cambios detectados'}` : 'Sin cambios'}
            </span>
            <span style={{ fontSize: 12, color: GRIS }}>
              Comparamos cada persona con su dato al añadirla{l.filtros ? ' y buscamos a quien cumpla ahora tus filtros' : ''}.
            </span>
          </div>

          {nCambios === 0 && (
            <div className="gt-ct-cambio">
              <span style={{ fontSize: 13, color: GRIS, lineHeight: 1.5 }}>
                Todo está al día. Te avisaremos aquí si alguien cambia de cargo o de contacto, o deja de figurar en la fuente.
              </span>
            </div>
          )}

          {cambios.map((m) => {
            const s = m.snapshot || {};
            const a = m.actual || {};
            const busy = ocupado === m.persona_id;
            return (
              <div key={m.persona_id} className="gt-ct-cambio">
                <span className={`gt-ct-cambio-t${m.cambio === 'salida' ? ' gris' : ''}`}>{ETIQUETA_CAMBIO[m.cambio]}</span>
                {m.cambio === 'salida' && (
                  <span style={{ fontSize: 13, lineHeight: 1.45 }}>
                    <strong style={{ fontWeight: 600 }}>{s.nombre}</strong>, {s.cargo}
                    {s.institucion ? ` (${s.institucion})` : ''}, ya no figura en {s.fuente || 'la fuente'}.
                  </span>
                )}
                {m.cambio === 'cargo' && (
                  <span style={{ fontSize: 13, lineHeight: 1.45 }}>
                    <strong style={{ fontWeight: 600 }}>{a.nombre || s.nombre}</strong>: {s.cargo || '—'}
                    {s.institucion !== a.institucion && s.institucion ? ` (${s.institucion})` : ''} → {a.cargo || '—'}
                    {a.institucion ? ` (${a.institucion})` : ''}
                  </span>
                )}
                {m.cambio === 'contacto' && (
                  <span style={{ fontSize: 13, lineHeight: 1.45 }}>
                    <strong style={{ fontWeight: 600 }}>{a.nombre || s.nombre}</strong> tiene un correo o teléfono nuevo en {a.fuente || 'la fuente'}
                    {a.fuente_fecha ? ` (${fecha(a.fuente_fecha)})` : ''}.
                  </span>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  {m.cambio === 'salida' ? (
                    <>
                      <button type="button" className="gt-ct-mini p" disabled={busy} onClick={() => accion('quitar', m.persona_id)}>
                        Quitar de la lista
                      </button>
                      <button type="button" className="gt-ct-mini s" disabled={busy} onClick={() => accion('mantener', m.persona_id)}>
                        Mantener
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="gt-ct-mini p" disabled={busy} onClick={() => accion('actualizar', m.persona_id)}>
                        Actualizar
                      </button>
                      <button type="button" className="gt-ct-mini s" disabled={busy} onClick={() => accion('quitar', m.persona_id)}>
                        Quitar
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {incorporaciones.map((f) => {
            const busy = ocupado === f.id;
            return (
              <div key={f.id} className="gt-ct-cambio">
                <span className="gt-ct-cambio-t">Incorporación</span>
                <span style={{ fontSize: 13, lineHeight: 1.45 }}>
                  <strong style={{ fontWeight: 600 }}>{f.nombre}</strong>, {f.cargo}
                  {f.institucion ? ` (${f.institucion})` : ''}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="gt-ct-mini p" disabled={busy} onClick={() => accion('anadir', f.id)}>
                    Añadir a la lista
                  </button>
                  <button type="button" className="gt-ct-mini s" disabled={busy} onClick={() => accion('descartar', f.id)}>
                    Descartar
                  </button>
                </div>
              </div>
            );
          })}
          {datos.n_incorporaciones > incorporaciones.length && (
            <div className="gt-ct-cambio">
              <span style={{ fontSize: 12, color: GRIS }}>
                Y {miles(datos.n_incorporaciones - incorporaciones.length)} incorporaciones más. Revisa los filtros de la búsqueda si son demasiadas.
              </span>
            </div>
          )}
        </aside>
      </div>

      {confirmarEnr && (
        <ModalEnriquecerVarios
          cuantos={confirmarEnr.length}
          saldo={saldo}
          onClose={() => setConfirmarEnr(null)}
          onConfirmar={() => {
            const ids = confirmarEnr;
            setConfirmarEnr(null);
            enriquecerVarios(ids);
          }}
        />
      )}
      {modalComprar && <ModalComprar packs={packs} onClose={() => setModalComprar(false)} />}
      {borrar && (
        <Modal titulo="Borrar la lista" onClose={() => setBorrar(false)}>
          <p style={{ fontSize: 13, color: '#555', margin: '4px 0 16px', lineHeight: 1.6 }}>
            Se borra «{l.nombre}» para todo tu equipo. Los contactos siguen en el directorio.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn-g" onClick={() => setBorrar(false)}>
              Cancelar
            </button>
            <button type="button" className="btn-ai" onClick={borrarLista}>
              Borrar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
