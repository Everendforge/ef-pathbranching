# Evpath Format (`.evpath`)

Evpath es el formato de texto nativo de PathBranching, inspirado en Ink y Yarn
Spinner. Proyecta un evento del `BranchingProject` como guion legible y
editable, y permite reconstruir el grafo de nodos a partir del texto sin perder
traducciones, lógica ni assets asociados.

## Rol dentro de PathBranching

- **Fase actual:** `BranchingProject` sigue siendo la fuente de verdad. Evpath
  es una *proyección editable*: el tab **Path** del inspector de eventos
  serializa el evento a texto, y el botón **Apply** parsea el texto y aplica
  las diferencias como mutaciones sobre el documento.
- **Migración automática:** como el texto se genera desde el modelo, cualquier
  historia existente gana la vista Path al abrirse. No hay conversión de datos
  ni riesgo de pérdida.
- **Fase futura:** cuando el round-trip esté maduro, el almacenamiento en
  `.everend/.pathbranching` podrá emitir `.evpath` como archivo canónico de la
  narrativa (con sidecars JSON para canvas, data objects y catálogos). Los
  exports (Ink, Twine, GameData) partirán de este centro condensado.

## Sintaxis

```ink
=== Nombre del evento === #^event-id
# category: Exploración

Kaelen: ¿Dónde escondiste la reliquia? #^beat:speech-1
    (con desconfianza, casi susurrando)
    #img: vault-door.png
[La cámara tiembla; cae polvo del techo] #^beat:direction-1

= dialogue: Interrogatorio #^dialogue-1
    ???: No vas a salir de aquí. #^beat:speech-2
    Mira (Herida): Déjala ir. #^beat:speech-3
    ? Decisión final #^decision-1
    * [Entregar la reliquia] { trust >= 2 } #^outcome-1
        ~ courage = 1
        -> "Bóveda Sellada" #^transition-5
    * [Atacar] #^outcome-2

= trigger: Guardia · onTalk #^start-1
    Guardia: ¿Qué haces aquí? #^beat:speech-4
```

| Línea | Significado |
| --- | --- |
| `=== Nombre === #^id` | Cabecera del evento (knot). Editar el nombre renombra el evento. |
| `# category: X` | Categoría del evento (por etiqueta o id). Solo se emite si no es `normal`. |
| `Hablante: texto` | Speech beat. El hablante se resuelve contra el canon (etiqueta, alias o id). `???` es el hablante oculto; sin prefijo, narrador. |
| `Hablante (Variante): texto` | Variante de personaje del beat (frontmatter `variants` de WorldNotion). |
| `[texto]` | Direction beat (acotación). |
| `(texto)` indentado | Director note del speech beat anterior. Quitar la línea borra la nota. |
| `#img: nombre` indentado | Scene image del speech beat anterior (por nombre de asset). |
| `= dialogue: Título #^id` | Contenedor de diálogo (stitch). Sus beats van indentados debajo. |
| `= trigger: … #^id` | Sección de dialogue trigger. La línea es de solo lectura; su contenido se edita normal. |
| `? Nombre #^id` | Decisión. |
| `* [texto visible] {cond} #^id` | Outcome de la decisión anterior. Consecuencias y continuación van indentadas debajo. |
| `~ nombre = valor` / `~ unlock ref` | Consecuencia (setVariable / unlockCanonEntry). |
| `{ nombre op valor }` | Condición simple de variable (`==`, `!=`, `>`, `>=`, `<`, `<=`). |
| `-> destino` | Divert: `-> "Nombre de evento"`, `-> ^ancla` (nodo interno) o id crudo. |

- **Adyacencia implícita:** dos líneas de contenido consecutivas al mismo nivel
  crean la transición entre ellas. Una línea tras un divert inicia una cadena
  nueva.
- **Escapes:** `\n` para saltos de línea dentro de un texto, `\#^` para el
  literal `#^`, y `\` inicial cuando el texto empieza como un marcador
  estructural o parece un prefijo de hablante.

## Anclajes `#^id`

Cada elemento estructural lleva un anclaje con su id del documento. El
reconciliador usa esta regla:

- **Línea con anclaje conocido** → actualiza el elemento existente (texto,
  hablante, condición…). Traducciones, rule sets y attachments sobreviven.
- **Línea sin anclaje** → crea un elemento nuevo.
- **Anclaje que ya no aparece** → elimina el elemento (dentro del alcance que
  el serializador había emitido; nada externo se toca).

## Lógica opaca

Las condiciones/consecuencias que la gramática simple no puede expresar se
emiten como `{ # etiqueta }` / `~ # etiqueta`. Si el texto no cambia, la lógica
original se conserva intacta; si se edita y no se puede parsear, se conserva la
original y se emite un warning.

## Límites de la v1

- Los triggers se crean/eliminan desde el canvas (la línea `= trigger:` es
  informativa).
- Mover beats entre diálogos desde el texto no está soportado (warning).
- Las consecuencias solo se editan bajo opciones.
- `-> END` no existe: el final se define con la categoría terminal del evento.

## API

`src/evpathFormat.ts` expone:

- `serializeEventEvpath(project, eventId)` — evento → texto.
- `parseEvpath(text)` — texto → líneas tipadas + errores con número de línea.
- `applyEvpathToEvent(project, eventId, text)` — reconcilia y devuelve
  `{ project, errors, warnings, changed }`.

`scripts/verify-evpath-format.mjs` cubre el round-trip (forma serializada,
idempotencia, edición de texto/hablante/variante/condición, altas y bajas de
beats y outcomes, y errores de parseo). Corre dentro de `npm run verify:core`
o solo con `npm run verify:evpath`.
