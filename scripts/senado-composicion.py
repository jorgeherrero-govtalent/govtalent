# =====================================================================
# Senado: composición desde los ficheros de datos abiertos descargados
# a mano (senado.es bloquea a GovTalent desde Vercel con Akamai, 403).
#
#   python3 -I scripts/senado-composicion.py HEMICICLO.xml GRUPOS.xml \
#       HISTORICO.xml REDES.csv > sql/118-senado-composicion.sql
#
#   HEMICICLO  ficopendataservlet?tipoFich=20          (senadores en activo)
#   GRUPOS     ficopendataservlet?tipoFich=4&legis=N   (grupos y partidos)
#   HISTORICO  ficopendataservlet?tipoFich=10          (senadores desde 1977:
#              grupo y lugar de procedencia de cada uno en su última legislatura)
#   REDES      legisN/senadores/csv/SenadoresRedesSociales.csv
#
# Genera upserts idempotentes en las tablas de sql/91 con
# parlamento = 'senado'. Quien ya no figure en el hemiciclo queda
# inactivo (no se borra). Para la XVI: descargar los cuatro ficheros
# de nuevo y volver a ejecutar.
# =====================================================================
import csv, io, json, re, sys, unicodedata
import xml.etree.ElementTree as ET

hem_path, gru_path, his_path, redes_path = sys.argv[1:5]

def ascii_up(s):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode().upper()).strip()

def slug(s):
    return re.sub(r'^-|-$', '', re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode().lower()))

MINUS = {'de', 'del', 'la', 'las', 'los', 'y', 'i', 'el', 'en', 'al', 'per', 'por'}
def titulo(s, primera=True):
    out = []
    for i, w in enumerate((s or '').strip().split()):
        lw = w.lower()
        if lw in MINUS and not (primera and i == 0):
            out.append(lw)
        else:
            out.append('-'.join(p[:1].upper() + p[1:] for p in lw.split('-')))
    return ' '.join(out)

def q(v):
    if v is None:
        return 'null'
    return "'" + str(v).replace("'", "''") + "'"

def fecha(dmy):
    m = re.match(r'(\d\d)/(\d\d)/(\d\d)$', dmy or '')
    if not m:
        return None
    return f"20{m.group(3)}-{m.group(2)}-{m.group(1)}"

# --- Hemiciclo ---------------------------------------------------------
hem = ET.parse(hem_path).getroot()
LEG_NUM = hem.get('legislatura')
ROMANOS = {'14': 'XIV', '15': 'XV', '16': 'XVI', '17': 'XVII'}
LEG = ROMANOS.get(LEG_NUM, LEG_NUM)
FECHA_INFORME = fecha((hem.get('fecha_informe') or '')[:8])
escanos = [{c.tag: (c.text or '').strip() for c in e} for e in hem.iter('escaño')]

# --- Histórico: grupo y lugar de procedencia -----------------------------
his = {}
for s in ET.parse(his_path).getroot().findall('senador'):
    r = {c.tag: (c.text or '').strip() for c in s}
    if r.get('legislatura') != LEG_NUM:
        continue
    his[ascii_up(r['apellidos']) + '|' + ascii_up(r['nombre'])] = r

# --- Grupos --------------------------------------------------------------
NOMBRES = {
    'GPP': 'Grupo Parlamentario Popular en el Senado',
    'GPS': 'Grupo Parlamentario Socialista',
    'GPERB': 'Grupo Parlamentario Izquierdas por la Independencia (Esquerra Republicana-Euskal Herria Bildu)',
    'GPPLU': 'Grupo Parlamentario Plural en el Senado (Junts per Catalunya-Coalición Canaria-Agrupación Herreña Independiente-Bloque Nacionalista Galego)',
    'GPV': 'Grupo Parlamentario Vasco en el Senado (EAJ-PNV)',
    'GPIC': 'Grupo Parlamentario Izquierda Confederal (Más Madrid, Eivissa i Formentera al Senat, Compromís, Agrupación Socialista Gomera y Geroa Bai)',
    'GPMX': 'Grupo Parlamentario Mixto',
}
COLORES = {'GPP': '#378ADD', 'GPS': '#E24B4A', 'GPERB': '#BA7517', 'GPPLU': '#1D9E75', 'GPV': '#3F9E52', 'GPIC': '#D4537E', 'GPMX': '#888780'}
grupos = []
for g in ET.parse(gru_path).getroot().findall('Grupo'):
    c = {x.tag: (x.text or '').strip() for x in g.find('datosCabecera')}
    if c.get('fechaBaja'):
        continue
    sig = c['siglas']
    partidos = [{x.tag: (x.text or '').strip() for x in p} for p in g.iter('partido')]
    grupos.append({
        'codigo': c['codigo'], 'sigla': sig, 'nombre': NOMBRES.get(sig) or titulo(c['nombre']),
        'fecha': '-'.join(reversed(c['fechaConstitucion'].split('/'))) if c.get('fechaConstitucion') else None,
        'total': c.get('total'), 'electos': c.get('totalElectos'), 'designados': c.get('totalDesignados'),
        'partidos': [{'siglas': p.get('partidoSiglas'), 'total': p.get('partidoTotal')} for p in partidos],
    })
por_codigo = {g['codigo']: g for g in grupos}

# --- Redes sociales -------------------------------------------------------
crudo = open(redes_path, 'rb').read()
try:
    texto = crudo.decode('utf-8')
except UnicodeDecodeError:
    texto = crudo.decode('latin-1')
lineas = [l for l in texto.splitlines() if not l.startswith('sep=')]
redes = {}
for r in csv.DictReader(io.StringIO('\n'.join(lineas))):
    redes[ascii_up(r['Apellidos']) + '|' + ascii_up(r['Nombre'])] = r

def url_ok(u, dominio):
    u = (u or '').strip().replace('httos://', '')
    u = re.sub(r'^(https?://)+', 'https://', u if '://' in u else '')
    m = re.match(r'https://(www\.)?' + dominio + r'/(.+)$', u, re.I)
    if not m:
        return None
    resto = m.group(2) if 'profile.php' in m.group(2) else m.group(2).split('?')[0]
    return f'https://www.{dominio}/{resto}'

def handle_x(u):
    u = (u or '').strip()
    if not u:
        return None
    m = re.search(r'(?:twitt?er\.com|x\.com)/(?:#!/)?@?([A-Za-z0-9_]{1,15})', u, re.I)
    if m:
        return m.group(1)
    m = re.search(r'@([A-Za-z0-9_]{1,15})\s*$', u)
    return m.group(1) if m else None

def con_articulo(org):
    # «el Parlamento de Andalucía», «la Asamblea de Madrid», «las Cortes de
    # Castilla y León», «les Corts Valencianes» (como en sql/116).
    if not org:
        return None
    for pre, art in (('Parlamento', 'el'), ('Parlament', 'el'), ('Asamblea', 'la'), ('Junta', 'la'), ('Cortes', 'las'), ('Corts', 'les')):
        if org.startswith(pre):
            return f'{art} {org}'
    return org

# --- Senadores -------------------------------------------------------------
filas, sin_grupo = [], []
for e in escanos:
    k = ascii_up(e['apellidos']) + '|' + ascii_up(e['nombre'])
    h = his.get(k)
    nombre = titulo(e['nombre']) + ' ' + titulo(e['apellidos'], primera=True)
    apellidos_nombre = titulo(e['apellidos']) + ', ' + titulo(e['nombre'])
    designado = e['procedencia'].lower().startswith('designad')
    lugar = None
    if h and ':' in h.get('procedLugar', ''):
        lugar = h['procedLugar'].split(':', 1)[1].strip()
    if designado:
        circ = re.sub(r'^Comunidad Autónoma (de |del )?|^Comunidad Foral de ', '', e['comunidad_autónoma'] or '').strip()
        circ = {'Comunidad de Madrid': 'Madrid', 'País Vasco': 'País Vasco'}.get(circ, circ)
    else:
        circ = e['circunscripción'] or lugar
    grupo = por_codigo.get(h['grupoSiglas']) if h else None  # en el fichero, grupoSiglas lleva el código (801)
    if not grupo:
        sin_grupo.append(nombre)
    r = redes.get(k, {})
    mail = (r.get('Mail') or '').strip().lower()
    email = mail if re.match(r'^[a-z0-9._-]+@senado\.es$', mail) and not mail.startswith(('presidencia@', 'informacion@')) else None
    datos = {
        'procedencia': 'Designado' if designado else 'Electo',
        'designado_por': lugar if designado else None,
        'designado_por_texto': con_articulo(lugar) if designado else None,
        'comunidad': e['comunidad_autónoma'] or None,
        'partido': e['partido_político'] or None,
        'credencial': (h or {}).get('ultCredencial'),
        'redes': {k2: v for k2, v in {
            'facebook': url_ok(r.get('Facebook'), 'facebook.com'),
            'linkedin': url_ok(r.get('LinkedIn'), 'linkedin.com'),
            'instagram': url_ok(r.get('Instagram'), 'instagram.com'),
        }.items() if v},
    }
    datos = {k2: v for k2, v in datos.items() if v}
    filas.append({
        'id': 'senado:' + slug(nombre), 'nombre': nombre, 'apellidos_nombre': apellidos_nombre,
        'slug': 'senado-' + slug(nombre), 'grupo_id': f"senado:{grupo['sigla'].lower()}" if grupo else None,
        'sexo': 'M' if e['sexo'].lower().startswith('m') else 'H', 'circunscripcion': circ,
        'email': email, 'twitter': handle_x(r.get('Twitter')), 'datos': datos, 'fecha_alta': fecha(e['fecha_designación']),
        'id_fuente': (h or {}).get('ultCredencial') or slug(nombre),
    })

if sin_grupo:
    sys.stderr.write('SIN GRUPO: ' + ', '.join(sin_grupo) + '\n')
    sys.exit(1)
if len(filas) < 15:
    sys.stderr.write(f'Solo {len(filas)} senadores: no se genera nada\n')
    sys.exit(1)

cuenta = {}
for f in filas:
    cuenta[f['grupo_id']] = cuenta.get(f['grupo_id'], 0) + 1

FUENTE = f"Senado, datos abiertos ({'/'.join(reversed(FECHA_INFORME.split('-'))) if FECHA_INFORME else ''})"
o = []
o.append(f"""-- =====================================================================
-- 118. Senado: composición ({LEG} Legislatura) en las tablas de sql/91
--
-- GENERADO por scripts/senado-composicion.py con los ficheros de datos
-- abiertos del Senado descargados a mano el {'/'.join(reversed(FECHA_INFORME.split('-'))) if FECHA_INFORME else '?'}: senado.es devuelve 403
-- (Akamai) a GovTalent desde Vercel, así que no hay sync automático hasta
-- que el Senado dé acceso. No editar a mano: regenerar.
--
-- {len(filas)} senadores en activo (Cámara disuelta el 06-10-2026: siguen
-- la Diputación Permanente y quienes conservan el escaño) y {len(grupos)} grupos.
-- Quien no figure en el hemiciclo queda inactivo, sin borrarse. Las
-- comisiones no se cargan: el fichero no trae sus miembros.
-- Se puede ejecutar más de una vez.
-- =====================================================================
""")
o.append('insert into public.ccaa_grupos (id, parlamento, legislatura, nombre, sigla, slug, n_diputados, color, fecha_constitucion, id_fuente, url, activo, fuente, synced_at) values')
o.append(',\n'.join(
    f"  ({q('senado:' + g['sigla'].lower())}, 'senado', {q(LEG)}, {q(g['nombre'])}, {q(g['sigla'])}, {q('senado-' + g['sigla'].lower())}, {cuenta.get('senado:' + g['sigla'].lower(), 0)}, {q(COLORES.get(g['sigla']))}, {q(g['fecha'])}, {q(g['codigo'])}, null, true, {q(FUENTE)}, now())"
    for g in grupos))
o.append("on conflict (id) do update set legislatura = excluded.legislatura, nombre = excluded.nombre, sigla = excluded.sigla, n_diputados = excluded.n_diputados, color = excluded.color, fecha_constitucion = excluded.fecha_constitucion, id_fuente = excluded.id_fuente, activo = true, fuente = excluded.fuente, synced_at = now();\n")
ids_g = ', '.join(q('senado:' + g['sigla'].lower()) for g in grupos)
o.append(f"update public.ccaa_grupos set activo = false, n_diputados = 0 where parlamento = 'senado' and id not in ({ids_g});\n")

o.append('insert into public.ccaa_diputados (id, parlamento, legislatura, nombre, apellidos_nombre, slug, grupo_id, sexo, circunscripcion, email, twitter, datos, id_fuente, fecha_alta, activo, fuente, fuente_fecha, updated_at) values')
o.append(',\n'.join(
    f"  ({q(f['id'])}, 'senado', {q(LEG)}, {q(f['nombre'])}, {q(f['apellidos_nombre'])}, {q(f['slug'])}, {q(f['grupo_id'])}, {q(f['sexo'])}, {q(f['circunscripcion'])}, {q(f['email'])}, {q(f['twitter'])}, {q(json.dumps(f['datos'], ensure_ascii=False))}::jsonb, {q(f['id_fuente'])}, {q(f['fecha_alta'])}, true, {q(FUENTE)}, now(), now())"
    for f in filas))
# El correo no se pisa con null: puede haberlo puesto otra vía (verificado).
o.append("on conflict (id) do update set legislatura = excluded.legislatura, nombre = excluded.nombre, apellidos_nombre = excluded.apellidos_nombre, grupo_id = excluded.grupo_id, sexo = excluded.sexo, circunscripcion = excluded.circunscripcion, email = coalesce(excluded.email, ccaa_diputados.email), twitter = coalesce(excluded.twitter, ccaa_diputados.twitter), datos = excluded.datos, id_fuente = excluded.id_fuente, fecha_alta = excluded.fecha_alta, activo = true, fuente = excluded.fuente, fuente_fecha = now(), updated_at = now();\n")
ids_d = ', '.join(q(f['id']) for f in filas)
o.append(f"update public.ccaa_diputados set activo = false, updated_at = now() where parlamento = 'senado' and activo and id not in ({ids_d});")
o.append(f"update public.ccaa_cargos set activo = false where parlamento = 'senado' and activo and diputado_id is not null and diputado_id not in ({ids_d});\n")
o.append("-- Dominio de correo del Senado para los correos probables.")
o.append("insert into public.email_dominios_manual (institucion, dominio) values ('Senado', 'senado.es') on conflict (institucion) do update set dominio = excluded.dominio;")
print('\n'.join(o))
sys.stderr.write(json.dumps({'legislatura': LEG, 'senadores': len(filas), 'grupos': cuenta, 'con_correo': sum(1 for f in filas if f['email']), 'con_x': sum(1 for f in filas if f['twitter'])}, ensure_ascii=False) + '\n')
