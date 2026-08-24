'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

/**
 * Los documentos del proyecto.
 *
 * El archivo vive en un bucket privado y la fila en project_files. Se
 * abre siempre con URL firmada y caducidad corta: un borrador de
 * enmiendas o una posición interna no puede quedar accesible por URL.
 *
 * LA RUTA ES EL PERMISO: {project_id}/{uuid}-{nombre}. Las políticas del
 * bucket comprueban que la primera carpeta sea un proyecto del usuario,
 * así que no hay una segunda lista de permisos que mantener.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// 20 MB. Por encima de eso casi siempre es un PDF sin comprimir, y el
// límite evita esperas largas sin barra de progreso.
const MAX_BYTES = 20 * 1024 * 1024;

// Los mismos tipos que acepta el bucket. Aquí la comprobación es solo
// comodidad —avisar antes de subir en vez de después—; la que de verdad
// se cumple está en el bucket, porque el navegador se lo salta cualquiera
// llamando a la API. Fuera html, svg y zip: los dos primeros ejecutan
// código al abrirse, el tercero esconde lo que lleva dentro.
const TIPOS_OK = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/csv',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

// 5 minutos, la misma caducidad que usan los CV. Uno solo no daba para
// descargar un PDF grande con mala conexión.
const URL_SEGUNDOS = 300;


function haceCuanto(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = Math.floor((Date.now() - d.getTime()) / 3600000);
  if (h < 1) return 'hace un momento';
  if (h < 24) return `hace ${h} h`;
  const dias = Math.floor(h / 24);
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

function tamano(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function icono(nombre = '') {
  const ext = nombre.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'ti-file-type-pdf';
  if (['doc', 'docx', 'odt'].includes(ext)) return 'ti-file-type-doc';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'ti-file-type-xls';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'ti-photo';
  return 'ti-file-text';
}

export default function DocumentosProyecto({ projectId, userId }) {
  const supabase = createClient();
  const input = useRef(null);
  const [docs, setDocs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('project_files')
      .select('id, nombre, storage_path, mime, bytes, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) toast('No se han podido cargar los documentos');
    setDocs(data || []);
    setCargando(false);
  }, [supabase, projectId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function subir(archivos) {
    const lista = Array.from(archivos || []).filter(Boolean);
    if (lista.length === 0) return;
    setSubiendo(true);

    for (const f of lista) {
      if (f.size > MAX_BYTES) {
        toast(`«${f.name}» pasa de 20 MB`);
        continue;
      }
      if (!TIPOS_OK.has(f.type)) {
        toast(`«${f.name}» no es un tipo admitido`);
        continue;
      }

      // El nombre se limpia para la ruta, pero el original se guarda en
      // la fila: al descargarlo debe llamarse como lo subió el usuario.
      const limpio = f.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
      const ruta = `${projectId}/${crypto.randomUUID()}-${limpio}`;

      const { error: eSubida } = await supabase.storage
        .from('project-files')
        .upload(ruta, f, { contentType: f.type || undefined, upsert: false });

      if (eSubida) {
        // El motivo importa: sin él no se distingue un permiso denegado
        // de un archivo duplicado o de un bucket que no existe.
        console.error('Subida fallida', { ruta, error: eSubida });
        toast(`No se ha podido subir «${f.name}»: ${eSubida.message || 'error desconocido'}`);
        continue;
      }

      const { data, error } = await supabase
        .from('project_files')
        .insert({
          project_id: projectId,
          uploader_id: userId,
          nombre: f.name,
          storage_path: ruta,
          mime: f.type || null,
          bytes: f.size,
        })
        .select('id, nombre, storage_path, mime, bytes, created_at')
        .single();

      if (error) {
        // Si la fila falla, el archivo se queda huérfano en el bucket:
        // se retira para no dejar basura que nadie puede ver ni borrar.
        await supabase.storage.from('project-files').remove([ruta]);
        console.error('Fila fallida', { ruta, error });
        toast(`No se ha podido guardar «${f.name}»: ${error.message || error.code || 'error desconocido'}`);
        continue;
      }

      setDocs((prev) => [data, ...prev]);
    }

    setSubiendo(false);
    if (input.current) input.current.value = '';
  }

  async function abrir(doc) {
    const { data, error } = await supabase.storage
      .from('project-files')
      .createSignedUrl(doc.storage_path, URL_SEGUNDOS);
    if (error || !data?.signedUrl) {
      console.error('URL firmada fallida', { ruta: doc.storage_path, error });
      toast(`No se ha podido abrir: ${error?.message || 'sin permiso'}`);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function borrar(doc) {
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    const { error } = await supabase.from('project_files').delete().eq('id', doc.id);
    if (error) {
      setDocs((prev) => [doc, ...prev]);
      toast('No se ha podido eliminar');
      return;
    }
    await supabase.storage.from('project-files').remove([doc.storage_path]);
    toast('Documento eliminado');
  }

  if (cargando) return <div className="spinner"></div>;

  return (
    <div style={{ maxWidth: 620 }}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          subir(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        style={{
          border: `1px dashed ${arrastrando ? MORADO : '#c4c0b8'}`,
          background: arrastrando ? '#f0eefe' : '#fafaf7',
          borderRadius: 10,
          padding: '18px 16px',
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: 16,
        }}
      >
        <i className="ti ti-upload" style={{ fontSize: 19, color: arrastrando ? MORADO : '#a8a49c' }}></i>
        <div style={{ fontSize: 12.5, color: '#555', marginTop: 7 }}>
          {subiendo ? 'Subiendo…' : 'Arrastra un archivo o pulsa para elegirlo'}
        </div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>
          PDF, Word, Excel, PowerPoint o imagen · hasta 20 MB
        </div>
        <input
          ref={input}
          type="file"
          multiple
          accept={[...TIPOS_OK].join(',')}
          onChange={(e) => subir(e.target.files)}
          style={{ display: 'none' }}
        />
      </div>

      {docs.length === 0 && (
        <div style={{ fontSize: 12.5, color: '#999', lineHeight: 1.65 }}>
          Las posiciones internas, los borradores de enmiendas y lo que recibas de terceros, junto al
          asunto al que pertenecen.
        </div>
      )}

      {docs.map((d, i) => (
        <div
          key={d.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '11px 0',
            borderTop: i === 0 ? 'none' : `.5px solid ${BORDE}`,
          }}
        >
          <i className={`ti ${icono(d.nombre)}`} style={{ fontSize: 17, color: '#a8a49c', flexShrink: 0 }}></i>

          <button
            onClick={() => abrir(d)}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: 'left',
              background: 'none',
              border: 'none',
              padding: 0,
            }}
          >
            <div
              style={{
                fontSize: 12.5,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {d.nombre}
            </div>
            <div style={{ fontSize: 10.5, color: '#888', marginTop: 2 }}>
              {[tamano(d.bytes), haceCuanto(d.created_at)].filter(Boolean).join(' · ')}
            </div>
          </button>

          <button
            onClick={() => borrar(d)}
            aria-label={`Eliminar ${d.nombre}`}
            style={{ background: 'none', border: 'none', color: '#c4c0b8', padding: 2, flexShrink: 0 }}
          >
            <i className="ti ti-x" style={{ fontSize: 14 }}></i>
          </button>
        </div>
      ))}
    </div>
  );
}
