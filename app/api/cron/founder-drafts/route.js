// =====================================================================
// CORREOS DE FOUNDER — envío diario
// app/api/cron/founder-drafts/route.js
//
// Cada mañana envía desde hola@govtalent.app, con la firma de Gmail, un
// correo personal a cada usuario y cada organización nuevos de los últimos
// días. La ruta conserva el nombre founder-drafts para no tocar el cron.
//
// REGLAS
//   - Usuario: onboarding terminado, sin solicitud de borrado y sin
//     correo previo (users.founder_draft_at).
//   - Organización: creada desde la app (tiene administrador), sin
//     correo previo (organizations.founder_draft_at). Va a su admin.
//   - Quien crea una organización recibe solo el de organización.
//   - Solo se mira la ventana de VENTANA_DIAS: el primer día no escribe a
//     toda la base de usuarios.
//   - La marca se pone solo si el correo se ha enviado.
//
// Uso:
//   ?key=<DEBUG_KEY>&dry=1   prueba sin enviar
//   ?key=<DEBUG_KEY>         envío real
// =====================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { founderUserEmail, founderOrganizationEmail } from '@/lib/email/founder';
import { enviarCorreosFounder, gmailConfigurado } from '@/lib/gmail';
import { conRegistro } from '@/lib/syncLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VENTANA_DIAS = 3;
const MAX_POR_EJECUCION = 40;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  });
}

export const GET = conRegistro('/api/cron/founder-drafts', handler);

async function handler(request) {
  const t0 = Date.now();
  const sp = new URL(request.url).searchParams;
  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = !!process.env.DEBUG_KEY && sp.get('key') === process.env.DEBUG_KEY;
  if (!isCron && !isManual) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const dry = sp.get('dry') === '1';
  const informe = { inicio: new Date().toISOString(), dry_run: dry };

  if (!dry && !gmailConfigurado()) {
    return NextResponse.json({ ...informe, error: 'Faltan las variables de Gmail (GMAIL_DRAFTS_URL, GMAIL_DRAFTS_SECRET).' }, { status: 500 });
  }

  const supabase = admin();
  const desde = new Date(Date.now() - VENTANA_DIAS * 86400000).toISOString();

  try {
    // --- Organizaciones nuevas ---------------------------------------
    const { data: orgs, error: errO } = await supabase
      .from('organizations')
      .select('id, name, created_at, organization_members(user_id, role, created_at, users(id, first_name, email, deletion_requested_at))')
      .gte('created_at', desde)
      .is('founder_draft_at', null)
      .limit(MAX_POR_EJECUCION);
    if (errO) throw new Error(`No se pudieron leer las organizaciones: ${errO.message}`);

    const correosOrg = [];
    const adminsDeOrgNueva = new Set();
    for (const o of orgs || []) {
      const admins = (o.organization_members || [])
        .filter((m) => m.role === 'admin' && m.users?.email && !m.users.deletion_requested_at)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      if (admins.length === 0) continue; // importada por CSV: nadie la ha creado
      const u = admins[0].users;
      adminsDeOrgNueva.add(u.id);
      correosOrg.push({ orgId: o.id, userId: u.id, to: u.email, ...founderOrganizationEmail({ firstName: u.first_name, orgName: o.name }) });
    }

    // --- Usuarios nuevos ----------------------------------------------
    const { data: usuarios, error: errU } = await supabase
      .from('users')
      .select('id, first_name, email, role')
      .gte('created_at', desde)
      .eq('onboarding_completed', true)
      .is('founder_draft_at', null)
      .is('deletion_requested_at', null)
      .neq('role', 'platform_admin')
      .limit(MAX_POR_EJECUCION);
    if (errU) throw new Error(`No se pudieron leer los usuarios: ${errU.message}`);

    const correosUsuario = [];
    const soloOrg = [];
    for (const u of usuarios || []) {
      if (!u.email) continue;
      if (adminsDeOrgNueva.has(u.id) || u.role === 'org_admin') {
        soloOrg.push(u.id);
        continue;
      }
      correosUsuario.push({ userId: u.id, to: u.email, ...founderUserEmail({ firstName: u.first_name }) });
    }

    informe.organizaciones = correosOrg.length;
    informe.usuarios = correosUsuario.length;

    if (dry) {
      informe.muestra = [...correosOrg, ...correosUsuario].slice(0, 5).map(({ to, subject }) => ({ to, subject }));
      informe.ms_total = Date.now() - t0;
      return NextResponse.json(informe);
    }

    const todos = [...correosOrg, ...correosUsuario];
    const resultados = await enviarCorreosFounder(todos);
    const ahora = new Date().toISOString();

    const orgsHechas = [];
    const usuariosHechos = new Set(soloOrg); // quien administra una org no recibe el de usuario
    resultados.forEach((r, i) => {
      if (!r.ok) return;
      const c = todos[i];
      if (c.orgId) {
        orgsHechas.push(c.orgId);
        usuariosHechos.add(c.userId);
      } else {
        usuariosHechos.add(c.userId);
      }
    });

    if (orgsHechas.length) {
      await supabase.from('organizations').update({ founder_draft_at: ahora }).in('id', orgsHechas);
    }
    if (usuariosHechos.size) {
      await supabase.from('users').update({ founder_draft_at: ahora }).in('id', [...usuariosHechos]);
    }

    informe.enviados = resultados.filter((r) => r.ok).length;
    informe.fallidos = resultados.filter((r) => !r.ok).length;
    informe.detalle_fallos = resultados.filter((r) => !r.ok).slice(0, 3);
    informe.ms_total = Date.now() - t0;
    return NextResponse.json(informe);
  } catch (e) {
    return NextResponse.json({ ...informe, error: e.message, ms_total: Date.now() - t0 }, { status: 500 });
  }
}
