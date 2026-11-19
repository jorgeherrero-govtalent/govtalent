// logos-directorio: saca el logo de la web de cada organización del
// directorio (patronales y asociaciones sectoriales, sql/138) y lo guarda en
// el bucket público `directorio-logos`.
//
// Orden de preferencia: apple-touch-icon (cuadrado y con resolución), icono
// declarado en la página de 48 px o más, /apple-touch-icon.png y
// /favicon.ico si tiene una imagen de 48 px o más. Nunca SVG. Si no hay
// ninguno usable, la fila queda con logo_origen = 'sin_logo' y en pantalla
// salen las iniciales.
//
// POST { "limite": 40, "categoria": "patronal" } procesa las que aún no se
// han intentado y devuelve el resumen.

import { createClient } from "jsr:@supabase/supabase-js@2";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 GovTalentBot/1.0 (+https://govtalent.app)";
const MIN_LADO = 48;
const MAX_HTML = 1_500_000;
const MAX_IMG = 1_000_000;
// Iconos genéricos que no son el logo de nadie (el de WordPress por defecto).
// Además, tras cada carga se anulan los logos repetidos en dominios distintos.
const BLOQUEADOS = new Set([
  "6bdb369337ac2496761c6f063bffea0aa6a91d4662279c399071a468251f51f0", // favicon de WordPress por defecto
  "2b7b83fa64b393285bb581e767b905f472761843864a1522c4927e239127029f", // logo de WordPress
]);

async function sha256(b: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", b);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function urlSegura(u: string): URL | null {
  try {
    const url = new URL(u);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const h = url.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return null;
    if (/^[\d.]+$/.test(h) || h.includes(":")) return null; // IP literal
    return url;
  } catch {
    return null;
  }
}

async function traer(url: string, max: number, ms = 9000): Promise<Response & { cuerpo?: Uint8Array } | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, redirect: "follow", signal: ctl.signal });
    if (!r.ok || !r.body) return null;
    if (!urlSegura(r.url)) return null;
    const reader = r.body.getReader();
    const trozos: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) {
        ctl.abort();
        return null;
      }
      trozos.push(value);
    }
    const cuerpo = new Uint8Array(total);
    let o = 0;
    for (const t2 of trozos) {
      cuerpo.set(t2, o);
      o += t2.length;
    }
    return Object.assign(r, { cuerpo });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Tamaño de la imagen leyendo su cabecera (sin decodificar).
function medir(b: Uint8Array): { tipo: string; lado: number } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { tipo: "png", lado: Math.min(dv.getUint32(16), dv.getUint32(20)) };
  }
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { tipo: "gif", lado: Math.min(dv.getUint16(6, true), dv.getUint16(8, true)) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      const len = dv.getUint16(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { tipo: "jpg", lado: Math.min(dv.getUint16(i + 5), dv.getUint16(i + 7)) };
      }
      i += 2 + len;
    }
    return null;
  }
  if (b.length > 30 && b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) {
    const f = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (f === "VP8X") return { tipo: "webp", lado: Math.min(1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16))) };
    if (f === "VP8 ") return { tipo: "webp", lado: Math.min(dv.getUint16(26, true) & 0x3fff, dv.getUint16(28, true) & 0x3fff) };
    if (f === "VP8L") {
      const v = dv.getUint32(21, true);
      return { tipo: "webp", lado: Math.min((v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1) };
    }
    return null;
  }
  if (b.length > 6 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) {
    const n = dv.getUint16(4, true);
    let lado = 0;
    for (let k = 0; k < n && 6 + 16 * k + 1 < b.length; k++) {
      const w = b[6 + 16 * k] || 256;
      const h = b[6 + 16 * k + 1] || 256;
      lado = Math.max(lado, Math.min(w, h));
    }
    return { tipo: "ico", lado };
  }
  return null;
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
};

function candidatos(html: string, base: URL): string[] {
  const baseTag = html.match(/<base[^>]+href=["']([^"']+)["']/i);
  let raiz = base;
  try {
    if (baseTag) raiz = new URL(baseTag[1], base);
  } catch { /* nada */ }
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const attr = (tag: string, n: string) => {
    const m = tag.match(new RegExp(`\\b${n}\\s*=\\s*["']([^"']*)["']`, "i")) || tag.match(new RegExp(`\\b${n}\\s*=\\s*([^\\s>]+)`, "i"));
    return m ? m[1].trim() : "";
  };
  const lista: { url: string; peso: number }[] = [];
  for (const tag of links) {
    const rel = attr(tag, "rel").toLowerCase();
    const href = attr(tag, "href");
    if (!href || /\.svg(\?|$)/i.test(href) || attr(tag, "type").includes("svg")) continue;
    const tam = Math.max(0, ...attr(tag, "sizes").split(/\s+/).map((s) => parseInt(s, 10) || 0));
    let peso = -1;
    if (rel.includes("apple-touch-icon")) peso = 1000 + (tam || 180);
    else if (/(^|\s)icon(\s|$)/.test(rel) || rel.includes("shortcut")) peso = tam ? 500 + tam : 100;
    if (peso < 0) continue;
    try {
      lista.push({ url: new URL(href, raiz).href, peso });
    } catch { /* nada */ }
  }
  lista.sort((a, b) => b.peso - a.peso);
  const urls = lista.map((x) => x.url);
  urls.push(new URL("/apple-touch-icon.png", base).href, new URL("/favicon.ico", base).href);
  return [...new Set(urls)];
}

async function logoDe(web: string): Promise<{ bytes: Uint8Array; tipo: string; origen: string; hash: string } | null> {
  const inicio = urlSegura(/^https?:\/\//i.test(web) ? web : `https://${web}`);
  if (!inicio) return null;
  const pag = await traer(inicio.href, MAX_HTML);
  const base = pag && urlSegura(pag.url) ? new URL(pag.url) : inicio;
  const html = pag?.cuerpo ? new TextDecoder().decode(pag.cuerpo) : "";
  for (const c of candidatos(html, base).slice(0, 6)) {
    if (!urlSegura(c) || /wp-includes|w-logo/i.test(c)) continue;
    const r = await traer(c, MAX_IMG, 7000);
    if (!r?.cuerpo) continue;
    const m = medir(r.cuerpo);
    if (!m || m.lado < MIN_LADO) continue;
    const hash = await sha256(r.cuerpo);
    if (BLOQUEADOS.has(hash)) continue;
    return { bytes: r.cuerpo, tipo: m.tipo, origen: c, hash };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST", { status: 405 });
  const { limite = 40, categoria = "patronal" } = await req.json().catch(() => ({}));
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: filas, error } = await db
    .from("directorio_entidades")
    .select("id, organizacion, web")
    .eq("categoria", categoria)
    .eq("activo", true)
    .not("web", "is", null)
    .is("logo_url", null)
    .is("logo_origen", null)
    .order("id")
    .limit(Math.min(Number(limite) || 40, 60));
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const res = { procesadas: 0, con_logo: 0, sin_logo: 0, errores: [] as string[] };
  const cola = [...(filas || [])];
  async function trabajador() {
    while (cola.length) {
      const f = cola.shift()!;
      res.procesadas++;
      try {
        const logo = await logoDe(String(f.web).split(";")[0].trim());
        if (!logo) {
          await db.from("directorio_entidades").update({ logo_origen: "sin_logo", logo_fecha: new Date().toISOString() }).eq("id", f.id);
          res.sin_logo++;
          continue;
        }
        const ruta = `${f.id}.${logo.tipo}`;
        const up = await db.storage.from("directorio-logos").upload(ruta, logo.bytes, { contentType: MIME[logo.tipo], upsert: true });
        if (up.error) throw new Error(up.error.message);
        const url = db.storage.from("directorio-logos").getPublicUrl(ruta).data.publicUrl;
        await db
          .from("directorio_entidades")
          .update({ logo_url: url, logo_origen: logo.origen, logo_hash: logo.hash, logo_fecha: new Date().toISOString() })
          .eq("id", f.id);
        res.con_logo++;
      } catch (e) {
        res.errores.push(`${f.id}: ${(e as Error).message}`.slice(0, 160));
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, trabajador));
  return Response.json(res);
});
