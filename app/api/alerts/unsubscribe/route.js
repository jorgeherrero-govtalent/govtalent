import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAlertToken } from '@/lib/unsubscribeToken';

function htmlPage(title, message) {
  const html = `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f0efe9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0efe9;padding:60px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;background:#ffffff;border-radius:14px;border:1px solid #e0dfd8;">
            <tr>
              <td style="padding:36px 30px;text-align:center;">
                <div style="font-size:19px;font-weight:800;color:#1a1a18;margin-bottom:20px;">gov<span style="background:#1d6f5c;color:#fff;padding:2px 7px;border-radius:5px;">talent</span></div>
                <div style="font-size:16px;font-weight:700;color:#1a1a18;margin-bottom:8px;">${title}</div>
                <div style="font-size:13.5px;color:#666;line-height:1.6;">${message}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const token = searchParams.get('token');
  const admin = createAdminClient();

  try {
    if (type === 'area') {
      const id = searchParams.get('id');
      if (!id || !verifyAlertToken(`area:${id}`, token)) {
        return htmlPage('Enlace no válido', 'Este enlace de baja no es válido o ya ha sido usado.');
      }
      await admin.from('job_alerts').delete().eq('id', id);
      return htmlPage(
        'Alerta desactivada',
        'Ya no recibirás emails para esta alerta de empleo. Puedes crear una nueva cuando quieras desde tu cuenta de GovTalent.'
      );
    }

    if (type === 'follow') {
      const user = searchParams.get('user');
      const org = searchParams.get('org');
      if (!user || !org || !verifyAlertToken(`follow:${user}:${org}`, token)) {
        return htmlPage('Enlace no válido', 'Este enlace de baja no es válido o ya ha sido usado.');
      }
      await admin.from('organization_follows').delete().eq('user_id', user).eq('organization_id', org);
      return htmlPage(
        'Alerta desactivada',
        'Ya no recibirás alertas de esta organización. El resto de organizaciones que sigues no se han visto afectadas.'
      );
    }

    return htmlPage('Enlace no válido', 'Este enlace de baja no es válido.');
  } catch (err) {
    console.error('Error al procesar la baja de alerta:', err);
    return htmlPage(
      'Ha ocurrido un error',
      'No hemos podido procesar la baja. Puedes gestionar tus alertas desde tu cuenta en GovTalent.'
    );
  }
}
