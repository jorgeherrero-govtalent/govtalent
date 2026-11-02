# Comparación de candidaturas 29N con las de 2023

- `candidatos2023.json`: candidaturas proclamadas de las generales de 2023 (BOE-A-2023-15066, 27-06-2023), leídas del PDF con `leer_boe_2023.py` (`pdftotext -layout` y luego el script). Filas: [provincia, cámara, siglas, puesto, nombre, suplente].
- `cruzar_2023.py`: cruza `lib/data/candidatos29n.json` con 2023 por nombre. Reglas: misma provincia con el nombre normalizado (sin tildes ni partículas); misma provincia con nombre de pila y dos apellidos iguales si el partido es compatible; otra provincia solo si el nombre es idéntico, único en 2023 y el partido compatible (Sumar y Podemos cuentan como compatibles; UPN con PP). Lo dudoso queda sin dato.
- Prueba con las presentadas de 2026: 382 de 1.792 candidatos ya iban en 2023 (354 en la misma provincia).
- Pendiente: repetirlo con las proclamadas (BOE del 03-11-2026) y decidir cómo se muestra (maquetas A, B y C).
