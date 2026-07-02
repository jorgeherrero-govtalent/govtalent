# GovTalent

Plataforma de talento para profesionales de asuntos públicos, política y gobierno.
Construido con Next.js 14 (App Router) + Supabase (base de datos, autenticación y storage).

## Estructura

```
app/
  login/            Login y registro
  auth/callback/     Callback de OAuth y recuperación de contraseña
  onboarding/        Onboarding en 3 pasos tras el registro
  (app)/             Zona autenticada (requiere sesión)
    jobs/            Listado y detalle de empleos
    profile/         Perfil del candidato
    organizations/   Directorio, página pública, creación y panel admin
    events/          Eventos del sector
lib/supabase/        Clientes de Supabase (browser, server)
middleware.js         Protección de rutas + refresco de sesión
```

## Variables de entorno

Copia `.env.local.example` como `.env.local` y rellena con los valores de
Supabase → Settings → API:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Base de datos

Ejecutar en el SQL Editor de Supabase, en este orden:
1. `govtalent_schema.sql` — tablas
2. `supabase_policies.sql` — seguridad (RLS) y automatismos

## Storage

Crear dos buckets **públicos** en Supabase → Storage:
- `avatars` — fotos de perfil de candidatos
- `logos` — logos de organizaciones (uso futuro)

## Desarrollo local (opcional, requiere Node.js)

```
npm install
npm run dev
```

## Fuera de alcance (v2)

- Inteligencia Parlamentaria
- Formación (catálogo de másteres/posgrados)
- Subida de CV
- Notificaciones
