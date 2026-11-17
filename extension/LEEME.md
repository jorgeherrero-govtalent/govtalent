# Extensión de GovTalent para Chrome

Panel lateral que, con un perfil de LinkedIn abierto, dice si esa persona
está en GovTalent y enseña su cargo, su correo y su organización.

Desde la 0.4.0 funciona también en cualquier web: reconoce de qué
organización es la página (por su dominio) y enseña sus personas, tiene un
buscador siempre visible y busca el texto seleccionado con «Buscar en
GovTalent» en el menú del botón derecho. A quien no está en GovTalent se le
puede buscar el correo desde ahí.

## Instalarla sin publicar

1. Abre `chrome://extensions` y activa «Modo de desarrollador».
2. Pulsa «Cargar descomprimida» y elige esta carpeta.
3. Inicia sesión en govtalent.app, abre un perfil de LinkedIn y pulsa el
   icono de GovTalent.

## Piezas

- `linkedin.js`: lee del perfil abierto el nombre, el titular, la empresa y
  la dirección de la foto. Solo cuando el panel lo pide.
- `fondo.js`: abre el panel y pone «Buscar en GovTalent» en el menú del
  botón derecho. Chrome le entrega solo el texto seleccionado.
- Fuera de LinkedIn no hay ningún script en las páginas: del sitio solo se
  usan su dominio y su icono, que da Chrome (permiso `tabs`).
- `panel.*`: el panel. Habla con `/api/extension/persona`, `/api/extension/web`,
  `/api/contactos/enriquecer` y `/api/contactos/listas` con la sesión del
  navegador.
- De LinkedIn se usan el nombre y la organización para buscar. Si la
  persona ya está en GovTalent y la coincidencia es segura, su foto de
  perfil se guarda en el directorio (`/api/extension/foto`, sql/131); la
  primera que llega se queda.
