// La foto de cada persona del directorio, por su id de directorio_pro.
//
// 1. La guardada en directorio_fotos (sql/131).
// 2. La oficial de su cámara: diputados autonómicos y senadores
//    (ccaa_diputados) y diputados del Congreso (deputies).
// Quien no tiene ninguna no sale en el resultado. Solo servidor.

const trozos = (lista, n) => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));

/** ids de directorio_pro → { id: url } */
export async function fotosPorIds(admin, ids) {
  const unicos = [...new Set((ids || []).filter(Boolean).map(String))].slice(0, 400);
  const fotos = {};
  if (!unicos.length) return fotos;

  const ccaa = new Map(); // id en ccaa_diputados → id de directorio
  const congreso = new Map(); // id en deputies → id de directorio
  for (const id of unicos) {
    if (id.startsWith('ccaa-legislativo:')) ccaa.set(id.slice('ccaa-legislativo:'.length), id);
    else if (id.startsWith('es-legislativo:')) congreso.set(id.slice('es-legislativo:'.length), id);
  }

  const tareas = [];
  for (const parte of trozos([...ccaa.keys()], 200)) {
    tareas.push(
      admin.from('ccaa_diputados').select('id, foto_url, foto_storage_url').in('id', parte).then(({ data }) => {
        for (const f of data || []) {
          const url = f.foto_storage_url || f.foto_url;
          if (url) fotos[ccaa.get(String(f.id))] = url;
        }
      }),
    );
  }
  for (const parte of trozos([...congreso.keys()], 200)) {
    tareas.push(
      admin.from('deputies').select('id, photo_url').in('id', parte).then(({ data }) => {
        for (const f of data || []) if (f.photo_url) fotos[congreso.get(String(f.id))] = f.photo_url;
      }),
    );
  }
  await Promise.all(tareas);

  // La guardada a mano o desde la extensión manda sobre la oficial.
  for (const parte of trozos(unicos, 200)) {
    const { data } = await admin.from('directorio_fotos').select('persona_id, url').in('persona_id', parte);
    for (const f of data || []) if (f.url) fotos[f.persona_id] = f.url;
  }
  for (const [id, url] of Object.entries(fotos)) if (!/^https:\/\//.test(url)) delete fotos[id];
  return fotos;
}
