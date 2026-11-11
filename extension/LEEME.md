# Extensión de GovTalent para Chrome

Panel lateral que, con un perfil de LinkedIn abierto, dice si esa persona
está en GovTalent y enseña su cargo, su correo y su organización.

## Instalarla sin publicar

1. Abre `chrome://extensions` y activa «Modo de desarrollador».
2. Pulsa «Cargar descomprimida» y elige esta carpeta.
3. Inicia sesión en govtalent.app, abre un perfil de LinkedIn y pulsa el
   icono de GovTalent.

## Piezas

- `linkedin.js`: lee del perfil abierto el nombre, el titular, la empresa y
  la dirección de la foto. Solo cuando el panel lo pide.
- `panel.*`: el panel. Habla con `/api/extension/persona`,
  `/api/contactos/enriquecer` y `/api/contactos/listas` con la sesión del
  navegador.
- De LinkedIn no se guarda nada: el nombre y la organización solo se usan
  para buscar, y la foto se enseña en el panel sin salir del navegador.
