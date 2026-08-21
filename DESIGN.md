# Estilo de GovTalent

Esto no propone nada nuevo: documenta lo que ya está en `app/globals.css` y en
las páginas construidas. Existe porque las reglas estaban repartidas por
veinte archivos, y quien escribe una página nueva acaba adivinando y
equivocándose. Si algo aquí no coincide con el código, manda el código — y
entonces hay que corregir este archivo.

**Antes de escribir una página nueva:** leer `globals.css` y abrir la página
existente más parecida. Decir de cuál se copia el patrón. Si no se puede
nombrar de dónde sale la estructura, es que no se ha mirado.

---

## Los dos verdes y el morado

La distinción más importante de toda la plataforma, y la más fácil de
equivocar:

| Color | Dónde | Significa |
|---|---|---|
| `#1d6f5c` | `btn-p`, `btn-o`, foco de campos, spinner | Verde de marca. La acción principal normal. |
| `#6d5aef` | `btn-ai`, `btn-ai-o`, `badge-ai`, `premium-tag`, `FollowButton` | Morado. Pro, IA y seguir. |
| `#2563eb` | Insignia de verificación | Azul. Solo eso. |

Un botón que desbloquea Pro o lanza algo con IA va en **morado**, con
`btn-ai`, nunca en verde. Un botón de "Guardar" o "Publicar oferta" va en
verde. Confundirlos hace que una función de pago parezca una acción
cualquiera.

Las funciones de IA llevan además el icono del rayo (`ti-bolt`).

## Fondos y grises

```
#f0efe9   fondo de la aplicación (body)
#fff      tarjetas
#fafaf7   campos de formulario en reposo
#f0f0eb   fondos suaves dentro de tarjeta, píldoras neutras
#e0dfd8   TODOS los bordes, siempre a .5px
#f0eefe   fondo morado suave (IA, Pro)
#eeedfe   fondo de badge-ai
#e8f4f0   fondo verde suave
```

Texto:

```
#1a1a18   principal
#555      secundario, etiquetas de campo
#666      párrafos dentro de tarjeta
#888      metadatos
#a8a49c   apagado, texto deshabilitado
#999      vacíos y notas al pie
```

## Medidas

```
.sec              max-width 1080px, padding 16px 20px, centrado
tarjeta           radius 12px, borde .5px #e0dfd8
tarjeta con sombra radius 10px, 0 1px 2px rgba(0,0,0,.04)
botones           radius 8px, padding 9px 18px, 13px
campos            radius 9px, padding 10px 13px, 13.5px
píldoras          radius 10-20px, padding 3px 8px, 11.5px
```

Tipografía base 14px. Títulos de página 22-26px con peso 600. Títulos de
tarjeta 15px peso 600. Cuerpo 13px. Metadatos 11-12px.

Nada por debajo de 11px: deja de leerse.

## Anatomía de una tarjeta de hub

El patrón de Regulatorio, que es el que hay que copiar cuando se presenta un
módulo o un elemento con cifras:

1. Icono arriba a la izquierda, 21px, en morado o verde
2. Título 15px peso 600, y debajo un subtítulo 12px en `#888`
3. Una línea de descripción, 12.5px en `#555`
4. Separador `.5px` y debajo las **cifras grandes**: número 21px peso 600 en
   color, etiqueta 11px en `#888` justo debajo
5. Abajo, enlace de acción con flecha: `Explorar expedientes →`

Las cifras grandes son la firma visual de la plataforma. Una lista de datos
en texto corrido gris, no.

## Etiquetas de sección

Mayúsculas pequeñas: 11px, `letter-spacing: .3px`, color `#888`. Se usan para
encabezar bloques dentro de una tarjeta (`OBJETIVO`, `SUS PERFILES`,
`TUS ALERTAS`). Es un recurso muy presente y conviene mantenerlo.

## Clases que ya existen — no crear equivalentes

```
.sec .card .badge .badge-ai .premium-tag
.btn-p .btn-o .btn-ai .btn-ai-o .btn-g
.field .form-g .slbl .fsel
.empty-state .spinner .skel .hint .dvd
.modal-ov .modal-box .modal-head .modal-x
.dir-card .dir-row .dir-chip .dir-grid   (directorios)
.job-card-hover .stat-card-hover
```

Antes de escribir un estilo en línea, comprobar si ya hay clase.

## Modales

Todos llevan **X visible arriba a la derecha** (`modal-x`), no solo cerrar al
pinchar fuera. Estructura: `modal-ov on` > `modal-box` > `modal-head` con
`h2` y `modal-x`.

Los desplegables y menús posicionados en absoluto se recortan con padres que
tienen `overflow:hidden`: usar portales de React con `createPortal` y
`getBoundingClientRect`, como en `MultiSelectFilter`.

## Enlaces a redes de un actor

Sin logos de marca. Etiqueta en mayúsculas pequeñas (11px, `#888`) más el
identificador en monoespaciada, dentro de una píldora con borde `.5px`. Los
logotipos de X o LinkedIn desentonan con un lenguaje que es tipográfico.

## Reglas de producto que afectan al diseño

**Nunca prometer lo que el dato no puede dar.** Si un contador dice 14
actores, tienen que ser 14. Si una pestaña existe, tiene que funcionar. Un
botón en gris con "próximamente" solo vale si de verdad va a llegar.

**Tres propuestas antes de cualquier cambio de UX no trivial.** Rediseños,
flujos nuevos, cambios visuales que no sean menores. No aplica a correcciones
de error ni a ajustes especificados con precisión.

**Estados vacíos que enseñen.** Una lista vacía y bloqueada no vende nada.
Cuando alguien no tiene acceso a algo, enseñarle de qué se está perdiendo.
