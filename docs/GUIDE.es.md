# Ruach Studio · la guía

Canciones a partir de palabras, en tu propia máquina: cada sala, para qué sirve cada cosa y las cifras que medimos.

## Empieza aquí <!-- #start -->

### Qué es esto <!-- #what-this-is -->

Ruach Studio convierte una línea de estilo y una letra en una canción terminada con **YuE2**, el modelo abierto de canciones, en tu propia GPU. Nada sale de la máquina. Alrededor del modelo hay todo un estudio: una sala de escritura con un modelo de chat, posproducción (stems, remasterización, reescalado, revisión de la letra), una colección de todas las tomas y una sala que entrena adaptadores LoRA con tus propias canciones.

![El Creador: el formulario a la izquierda, la toma en el centro, todas las tomas a la derecha](guide/studio-create.png "El Creador: el formulario, la toma que estás escuchando y todas tus tomas")

YuE2 tiene **dos mitades**, y casi todo lo que ajustas en el estudio apunta a una de ellas:

| mitad | qué hace | qué controlas ahí |
|---|---|---|
| **Música** (AR, el modelo de lenguaje) | escribe la canción: primero una partitura (notación ABC), luego los tokens musicales, 25 por segundo | el modo de planificación, la partitura, la semilla musical, la fuerza musical de una LoRA |
| **Sonido** (NAR + VAE) | convierte los tokens en sonido | la semilla sonora, el VAE, la fuerza sonora de una LoRA, los pasos y el resolvedor |

### Las seis salas <!-- #the-six-rooms -->

| sala | para qué |
|---|---|
| **Creador** | el formulario de la canción y la toma que estás escuchando |
| **Escritor** | tus canciones como documentos con versiones; un modelo de chat redacta y revisa contigo |
| **Pulidor** | después del render: espectro, artefactos, antizumbido, revisión de la letra, stems, remasterización, reescalado |
| **Artista** | imágenes para tus canciones con un prompt tuyo: cuadrada, ancha y alta con una semilla; la cuadrada se vuelve la portada de una toma (un adelanto) |
| **Bibliotecario** | todas las tomas: espacios, búsqueda, me gusta, notas, acciones en bloque, la papelera |
| **Entrenador LoRA** | adaptadores LoRA a partir de tus propias canciones: el conjunto, la ejecución, su telemetría y sus épocas |

### La barra <!-- #the-bar -->

![La barra: las salas, el espacio y los pocos botones que usas todo el tiempo](guide/bar.png)

Las salas abren la barra en el orden del trabajo: Creador, Escritor, Pulidor, Artista (un adelanto: imágenes para tus canciones) y Bibliotecario; el logo está en el centro, el Entrenador justo después; a la derecha, el espacio, la luz del motor (verde: listo; ámbar: trabajando; roja: algo falló) y los pocos botones. El puntero sobre la luz (o un clic) abre **qué corre y qué espera**: las canciones, las regeneraciones y el trabajo del laboratorio en las tarjetas gráficas (portadas, stems, reescalado, Whisper). Lo que espera sale de su cola con su ✕, pulsado dos veces (la primera pulsación pregunta); lo que ya corre se detiene donde se muestra: una canción en su ejecución, un entrenamiento en el Entrenador.

- **Espacio**: el espacio en mano. La lista de tomas muestra solo ese, y cada toma nueva cae en él. *Todos los espacios* lo muestra todo. Donde la barra es estrecha (el logo sin sus palabras), la palabra *Espacio* también se va; el selector se queda.
- **ES** (las dos letras del idioma): la página en otro idioma, guardado con tus ajustes: English, Русский, Українська, Беларуская, Ελληνικά, Español, Italiano, cada uno nombrado con sus propias palabras. Los números y las fechas siguen al idioma, y esta guía se abre en él.
- **☀ / ☾**: día, noche o lo que diga el sistema.
- En la cabecera de Composición: **Guardar** un prompt (todo lo que enviaría la generación) como JSON o YAML y **Abrir** uno de nuevo; **Vaciar** las palabras (título, estilo, letra, partitura, semillas) sin tocar lo demás, o empezar una **Canción nueva** (también el modo, el muestreo, los deslizadores y las LoRA a sus valores por defecto; *Sonido y salida* se queda). **Abrir** dice qué parte de un archivo no cupo en el formulario y qué guarda en su lugar.
- **Exportar a un DAW** (en ☰, y en el Pulidor: junto a la toma en mano y en sus Stems): la salida del estudio. O la pista mezclada tal cual (WAV, FLAC, MP3), o la toma entera a tu propio DAW, donde lo demás ocurre fuera del estudio. La página encuentra REAPER, Waveform y Bitwig en la máquina del estudio, o tú nombras el tuyo. Cualquier toma sale desde su menú (clic derecho): *Exportar a un DAW → Proyecto de REAPER* o *DAWproject* (Waveform, Bitwig, Studio One, Cubase), tu DAW primero; la pestaña DAW de esta guía dice qué hay dentro.
- **Liberar el modelo**: saca ya de la memoria de la GPU todo modelo en reposo; teñido de rojo mientras hay un modelo cargado.
- **☰**: lo demás. La tarjeta gráfica y su memoria, la copia del modelo, el decodificador de sonido (VAE), **Exportar a un DAW**, los temas, la sala del Motor y esta guía. **Text size** fija ahí el tamaño del texto de toda la página de −2 a +4 pt (el diseño no cambia), y un marco alzado tiene sus propios −, + y ⟲ encima (de −4 a +6 pt); cada pantalla guarda el suyo.

![Detrás del ☰](guide/more-menu.png)

### Tu primera canción, en seis pasos <!-- #your-first-song-in-six-steps -->

1. Ponle **Título** y elige la **Tonalidad** si tienes una en mente (o deja *como está escrita*).
2. Escribe el **Estilo**: idioma, género, voz, instrumentos, tempo. Una o dos líneas sencillas bastan. El ♪ de al lado lista 200 instrumentos con lo que YuE2 toca de verdad (ver *Creador*).
3. Pega la **Letra** con etiquetas de sección en su propia línea: `[Verse]`, `[Chorus]`, `[Bridge]`, `[Outro]`.
4. Deja **Plan completo** como modo de planificación: YuE2 escribe primero una melodía y acordes, y luego la canción.
5. Pulsa **Generar canción**. La ejecución muestra sus etapas: la partitura, los tokens musicales, el sonido, la decodificación.
6. La toma se abre en el centro, con su reproductor, su partitura y todo lo necesario para hacerla de nuevo.

> Medido en una RTX 3090: una canción de 6:12 en modo Directo tardó 126 segundos, una de 7:25 en Plan completo, 198 segundos (primero se escribe la partitura). Las canciones más cortas son más rápidas.

### El reproductor, las tomas y el registro del servidor <!-- #the-player-the-takes-and-the-server-log -->

- **El reproductor**, abajo: la forma de onda de lado a lado, una nube suave con la parte ya escuchada en el color de acento (un clic salta allí); debajo, la toma (su portada cuando la tiene, su título, las primeras palabras de su estilo, 👍 👎 ★), luego **aleatorio**, anterior, reproducir, siguiente y **repetir** (desactivado · toda la lista otra vez · esta toma otra vez, marcado con 1), luego el tiempo (un clic en la duración total lo cambia al tiempo restante), *reproducir al hacer clic* (un clic en una lista reproduce la toma de inmediato), *seguir reproduciendo* (cuando una toma termina, empieza la siguiente de la lista), la **velocidad** (de 0.50× a 2.00×, conservando el tono), el volumen y un punto de estado (late mientras suena una toma). Lo que no necesitas en este momento queda tenue hasta que llega el puntero; cada icono dice qué hace cuando el puntero se posa sobre él. El puntero sobre la forma de onda muestra el tiempo al que saltaría un clic. Las teclas multimedia del teclado y de unos auriculares controlan el reproductor, y el panel multimedia del escritorio muestra la toma. ⏪ y ⏩ van a la marca anterior o siguiente cada 15 segundos desde 0:00, ← y → a las marcas de 5 segundos (con Shift, de 30). La píldora de estado al final derecho del reproductor (verde mientras suena una toma, del color del acento mientras se hace una) abre la toma o la ejecución; con Compose alzado sobre la sala, cambia el marco al de la toma.
- **Dos filas o una**: la forma de onda sobre los botones del reproductor se queda donde las canciones se escuchan y se comparan (Creador, Pulidor, Bibliotecario); en el Escritor, el Artista, el Entrenador y el Motor el reproductor va en una fila, como en el Creador mientras un marco está alzado o la letra está por encima de todo. Tras recargar (F5) vuelve con su toma y su punto. En el Artista las tomas empiezan plegadas y el registro del servidor se coloca a la izquierda.
- **La línea al estudio** aparece junto al registro del servidor (*Forge · 85 ms*, o *aquí* en la misma máquina). Cuando el estudio está lejos, un me gusta, una favorita o una fijación se ven al instante y el estudio solo los confirma.
- **Tomas**, a la derecha: busca con palabras, `*` y `?`; *Favoritas*; pliega la columna con »; ⋯ para las acciones propias de la lista.
- **El registro del servidor** está justo encima del reproductor en cada sala: plegado, muestra lo último que dijo el motor (en rojo cuando algo falló); desplegado, diez líneas, *Seguir*, *Copiar* y el camino al registro completo en el Motor. Con un marco alzado sobre la sala, se coloca a la izquierda, lejos de los botones del marco.

![El registro del servidor, desplegado](guide/log-dock.png)

## Creador <!-- #creator -->

### Composición: el formulario de la canción <!-- #compose-the-song-form -->

![Título, tonalidad, semillas y estilo](guide/compose-top.png)

- **Empezar por una idea**: una línea sobre la canción; el modelo de chat del Escritor redacta el título, el estilo y la letra (*Escribir el brief*).
- **Título**, **Tonalidad**: la tonalidad va a la partitura (`K:`). Con una partitura en el formulario, una tonalidad nueva la transporta allí; sin ella, la elección espera y transportará la partitura que llegue.
- **Semilla musical** y **Semilla sonora**: los dados de las dos mitades. Vacía es aleatoria; un número repite una toma. Conserva la semilla musical y cambia la sonora para oír la misma canción renderizada de otra manera. Están las primeras en *Muestreo y eliminación de ruido*.
- **Estilo**: idioma, género, voz, instrumentos, tempo. *Guardar estilo…* lo guarda con un nombre.

### La chuleta de instrumentos ♪ <!-- #the-instruments-cheat-sheet -->

El ♪ junto al estilo abre una tabla de 200 instrumentos que el estudio probó: su familia, su tierra, cómo suenan (en inglés y en ruso) y las palabras que los llaman. ▶ A y ▶ B reproducen dos pruebas de 60 segundos de cada uno. El veredicto de cada fila lo da un oído humano: oído, en duda o **NOT IDENTIFIED IN YUE2** (YuE2 no lo conoce; hace falta un prompt más elaborado). Un clic copia el nombre y pregunta adónde va: al final del estilo en una línea propia, o en lugar de él; un nombre que el estilo ya tiene se marca en la tabla, y el texto de la tabla se puede seleccionar y copiar.

**YuE2 decide cuándo entra un instrumento.** Una línea de estilo es una petición, no una orden: por mucho que insistas, el modelo mete un instrumento donde su entrenamiento dice que la canción lo quiere, y la semilla decide muchísimo. El mismo prompt dio una toma con el instrumento y otra sin él. Escucha varias semillas antes de juzgar un instrumento.

**Se oye, pero no tan real como uno en vivo.** Muchos instrumentos sí suenan, pero menos claros y menos fieles que los de verdad: es lo que YuE2 sabe de ellos. Los veredictos dicen si YuE2 toca un instrumento en absoluto, no lo real que suena. Hacerlo real es tarea de una **LoRA de instrumento**: unas pocas decenas de grabaciones limpias suyas, entrenadas en el Entrenador LoRA.

![La chuleta de instrumentos](guide/instruments.png)

### Letra y perfiles de texto <!-- #lyrics-and-text-profiles -->

- Etiquetas de sección en su propia línea; YuE2 conoce `[Intro]`, `[Verse]`, `[Pre-Chorus]`, `[Chorus]`, `[Bridge]`, `[Interlude]`, `[Outro]`.
- **Perfil de texto**: pega un texto entero, elige un perfil, *Aplicar*: sus reglas (limpieza, fonética) y su forma (`[Intro]`, `[Verse]` en las líneas en blanco, `[Interlude]` tras los párrafos largos) lo dejan listo para leer. *Deshacer* devuelve el texto. Los perfiles se crean en el Escritor.

### El contador de la letra y la mano fonética <!-- #the-lyrics-meter-and-the-phonetic-hand -->

- **El contador** junto a la letra: cada línea, sus sílabas en una barra frente a la regla de su grupo — estrofa y puente un grupo, el pre-estribillo el suyo, el estribillo el suyo, cualquier otra sección la suya. Una pausa, un break, un silencio, un interludio, un preludio o un pasaje instrumental dentro de una sección cantada no abre grupo: su nombre queda tenue al lado y la regla de la sección sigue. Las etiquetas nunca cuentan: una línea solo de etiquetas (`[Break] [Silence]`) no cuenta, y una etiqueta dentro de una línea queda fuera de la cuenta. La regla está en la longitud habitual del grupo; dentro de una sílaba la barra es verde, a dos o tres, ámbar, más allá, roja. Lo que va entre paréntesis se dibuja rayado tras la barra: YuE2 puede cantarlo. Bajo el cuadro: los caracteres, las sílabas y las líneas de la letra, las etiquetas, los paréntesis y la mano fonética; el corrector del navegador en el idioma de la letra (ahí se apaga); un cuadro estirado a mano conserva su altura hasta *Altura automática*.
- **Números de línea y marcas**: el cuadro de la letra numera sus líneas como un editor de código (una línea partida, una vez, en su primera fila; *Line numbers* bajo el cuadro los apaga). **Alt+K** marca la línea del cursor o le quita la marca, **Alt+J** va a la siguiente marca, **Alt+Shift+J** a la anterior, **Alt+Shift+K** las quita todas; el número de una línea marcada es ámbar, y las marcas siguen a sus líneas cuando escribes encima. Cada [etiqueta] queda bajo una capa ámbar fina. La letra del Escritor tiene lo mismo. Como en mcedit: **Alt+O** también quita las marcas, **Alt+L** va a una línea por su número, **Ctrl+Y** borra la línea, **Alt+↑** y **Alt+↓** mueven la línea (o las líneas seleccionadas) con su marca. *Keys* bajo el cuadro las enumera todas, y la etiqueta LYRICS del Escritor las dice al pasar el puntero. **⤢** junto a Lyrics levanta el cuadro sobre todo, al 60 % del ancho de la pantalla y cuatro décimas más grande, con todo esto y con sus propios −, + y ⟲ para el tamaño del texto (se guardan en este navegador); Esc lo devuelve.
- **Corchetes revisados**: un «[» sin cerrar en su línea, un «]» sin ninguno abierto, un «[» dentro de una etiqueta y una etiqueta vacía tiñen de rojo el número de su línea, y *Tags not closed or astray* bajo el cuadro va de uno al siguiente; un paréntesis que queda abierto o se cierra sin abrir es ámbar (un eco puede seguir). Un «[» que aún se escribe se deja en paz hasta que el cursor sale de su línea. **Generar pregunta antes** cuando una etiqueta está rota: lo que sigue a un «[» sin cerrar puede perderse en la canción y su final torcerse; *Go to the line* o *Generate as it is*.
- **Acentos fuera de sitio**: una marca que no está sobre una vocal — al inicio de una línea, tras un espacio o un signo, sobre una consonante, una segunda en la misma letra, o un ´ suelto en su lugar — muestra un botón rojo bajo el cuadro (*Stress marks off a vowel*) y una marca ante la cuenta de la línea; el botón las selecciona una a una. Una palabra con dos marcas recibe uno ámbar: ¿a propósito o un desliz? En la cuenta, la marca de acento no es sílaba; ע y una vocal latina dentro de una palabra rusa sí. Una sílaba es un sonido vocálico, una nota, y cada idioma se cuenta con sus reglas: en ruso, ucraniano y bielorruso, una letra vocal (y como el contador mide el tiempo de una línea, una palabra sin vocal — с, в, к, з, й, ў — y una oclusiva ante una africada dentro de una palabra — глу-п-цо́в — toman un tiempo propio, dibujado más claro: «Я же вижу глупцо́в с приду́рческим планом» son 12 sílabas y 2 de esos tiempos, 14); en griego αι, ει, οι, ου, αυ, ευ son una (la diéresis o el acento las separan: τσά-ι); en español e italiano una i o u débil se une a su vecina (cie-lo, cuo-re) y dos fuertes son dos (po-e-ta); en inglés una e final muda no cuenta (make, pero ta-ble); el hebreo cuenta sus puntos vocálicos; el chino, el japonés y el coreano, un signo por sílaba. Las palabras latinas se cuentan como inglesas, españolas o italianas: por el nombre del idioma en el estilo, si no, por las palabras pequeñas de la propia letra.
- **Ctrl+F** en la letra o en el estilo (y en los cuadros del Escritor) busca solo en ese cuadro: Enter y Mayús+Enter recorren las coincidencias, Esc desde el campo de búsqueda devuelve el cursor con la coincidencia seleccionada; desde el propio cuadro (si hiciste clic en otro sitio) cierra la búsqueda y deja el cursor donde está, y lo que escribas mientras tanto no mueve la vista. La tilde de acento no estorba, ё es е, y о y а encuentran también ע y las o y a latinas.
- **Etiquetas tras «[»**: un «[» al principio de una línea de la letra (del Creador o del Escritor) abre las etiquetas de sección, como un editor de código sugiere palabras, en el orden en que las recorre una canción, de Intro a End. Las letras tras el «[» estrechan la lista (también con la distribución rusa o ucraniana), un número numera la etiqueta (`v2` es `[Verse 2]`), y si la letra numera sus estrofas se ofrece la siguiente. ↑ ↓ eligen, Enter o Tab ponen la etiqueta en su propia línea (Ctrl+Z la deshace), Esc o `]` cierran la lista. Intro, Outro y End que ya están en la letra quedan en su sitio, tenues, con su línea: ↑ ↓ llegan a ellas y se lee qué son, pero no se ponen dos veces. Ctrl+Espacio abre la lista, y al principio de una línea escribe el propio «[». La lista va en dos columnas: las etiquetas y, a su lado, qué es la que tienes en la mano (con nuestras palabras, según la guía de secciones de canciones de Genius) y cuántas veces la escriben los 110 ejemplos oficiales; el cuadro conserva su tamaño al estrecharse la lista. Las secciones que ninguno de ellos escribe llevan la marca TEST.
- **La mano fonética** (la de Viktor, venida de SUNO; YuE2 la sigue igual):
  - **Una tilde de acento** (el agudo combinable, U+0301) tras una vocal: `обе́щано`, `сули́т`. Funciona en más del 95 % de las líneas.
  - **Una vocal tónica en mayúscula** empuja el acento adonde lo pide la rima, contra el diccionario: `базилиО́`.
  - **ע (ayin) dentro de una palabra rusa** se canta como una o/a suave, como el habla viva dice la o átona: `кעмо́рка`, `пעле́но`, `Ка́рлע`. También frena el rap que se acelera cada vez más.
  - **Una o latina dentro de una palabra rusa** canta una o dura y abierta donde el modelo diría a: `Кo дну`.
  - **Una vocal estirada** (`о-о-о`, `БУ… РА… ТИ… НО`) sostiene una nota; donde la música tiene sitio para ella, no en cada línea.
  - **[Interlude]** entre partes hace una pausa en el rap y frena el habla que se acelera cada vez más (no siempre).
  - **Los paréntesis** pueden cantarse (así pasó en las primeras tomas de «Buratino»): eco, coro de fondo; una acotación entre paréntesis también puede sonar.
  - **Una palabra hebrea con sus puntos vocálicos** (`רוּחַ`) el modelo la dice mejor que en transliteración.

### VAE, deslizadores y LoRAs <!-- #vae-sliders-and-loras -->

- El **VAE** convierte la canción escrita en sonido: **Estándar** (el mejor sonido), **Anterior** (el de las pruebas de referencia), **Mezcla** (una mezcla de los dos, un complemento). Una toma terminada puede añadir otra decodificación más tarde desde su propia página. Se elige en el menú **☰**, bajo el modelo, para las canciones que vienen; una toma se decodifica de nuevo con otro desde su tarjeta en segundos (desde rc2 cada toma guarda sus latentes; una hecha antes vuelve a generar su sonido).
- **Deslizadores**: moldeadores de género y de voz aplicados mientras se escribe la música; 0 es apagado, 1 es pleno.
- **LoRAs**: adaptadores para la mitad musical, la sonora o ambas, cada uno con su propia fuerza.

**La curva de un deslizador.** Un deslizador empuja con su fuerza desde el primer segundo hasta el último: plana. La pequeña imagen junto a su fuerza abre su curva: **Arco** la deja subir a la fuerza plena en el centro de la canción y aflojar en ambos extremos; **Dibujar** la forma a mano: arrastra un punto hacia arriba para un destello, hacia abajo para un desvanecimiento, a lo largo de la canción para moverlo; doble clic añade un punto, doble clic en un punto lo quita. La fuerza que fijas es la cima de la curva. La curva recorre la música a medida que se escribe, desde su primer fotograma hasta el final de la duración de la canción, y va en la petición de la toma, así que una toma hecha de nuevo recorre la misma curva.

![LoRAs: cada fuerza en un camino del verde al rojo, y la mitad musical en conjunto](guide/loras.png)

Cada fuerza está en un **camino**: el verde es seguro, el amarillo es su límite, el rojo está más allá. Los límites están medidos:

- un adaptador de partitura (uno que planifica ABC), hasta 1.0 en verde; cualquier otra mitad musical, hasta 0.5 en verde, 0.75 como mucho; los adaptadores entrenados en este estudio son más estrictos en la mitad musical (0.5 en verde, 0.6 de límite);
- la mitad sonora, hasta 1.0 en verde, 1.5 de límite;
- **Música, en conjunto**: los adaptadores apilados se suman. Cada uno puede estar en su propio verde y la suma, aun así, romper la partitura. Medido en tomas reales: entera hasta **2.25** en conjunto, rota desde **2.5**. La barra bajo los adaptadores muestra la suma en el mismo camino.

**Doble clic** en un número para escribir una fuerza exacta. Las indicaciones bajo el bloque dicen lo que importa: una palabra activadora que falta en el estilo, un adaptador entrenado en otro modo de planificación, una fuerza más allá de su límite. Mientras el puntero está sobre un deslizador o lo arrastra, la fuerza exacta aparece sobre el puntero, en el color de su camino. El adaptador Instrumental se detiene en 1.0, donde empieza: más arriba sus partituras se desvían.

> **Un adaptador de partitura instrumental con palabras que cantar.** Un adaptador así planifica partituras *sin línea vocal*. A 1.00 dio una toma con una sola nota en 127 compases vocales: el cantante hablaba sobre dos compases en bucle. Con letra, mantenlo bajo, de 0.3 a 0.5. El ⚠ junto al nombre LoRA lo avisa cuando ocurre.

### Perfiles y modos de planificación <!-- #profiles-and-planning-modes -->

- **Perfil** fija de una vez el modo, la duración, el muestreo, la guía, los pasos, el VAE, los deslizadores, las LoRAs y la salida; los textos y las semillas se quedan. *Guardar perfil…* guarda los controles actuales con un nombre.
- **Modo de planificación**:
  - **Plan completo**, por defecto: primero se escriben la melodía y los acordes (una partitura editable), luego la canción. Lo mejor para canciones nuevas.
  - **Solo melodía**: un plan de melodía, acompañamiento libre. Recomendado para versiones.
  - **Directo**: directamente desde la letra y el estilo, sin partitura. Los adaptadores entrenados sin partitura van aquí.
  - **Instrumental**: sin voces, la receta oficial de YuE2. Está a la derecha de la línea del modo de planificación.
- **Plan completo o Directo.** La palabra de Viktor tras una semana de canciones: Directo es el acierto o fallo de SUNO (unas dos tomas buenas de cada cien, según su cuenta); Plan completo es el camino para todos, incluso sin leer una nota de ABC: las etiquetas se respetan, el sonido se asienta, la dicción se sostiene y el tempo se puede prever. Medido en su rap, catorce tomas de cada modo con Whisper escuchando: la mejor toma de todas fue una de Plan completo con su receta conservadora (el 84 % de las palabras oídas, el 76 % en el último cuarto). Donde Plan completo falla, falla al final: una toma dura lo que su partitura, y el plan puede tener menos secciones que el texto (entonces los últimos versos se quedan fuera o se vuelve a cantar uno anterior); tras las últimas palabras siguen sonando los compases que le sobran a la partitura, y esos son los 10–15 s después del buen fundido de una canción, no la guía (CFG). Escucha el final de una toma en Plan completo: *End at…* corta una cola, *Regenerar desde…* escribe de nuevo un final perdido.

### Versiones, remezclas y tu propia partitura <!-- #covers-remixes-and-your-own-score -->

- **Versión o remezcla**: toma la melodía de una grabación (*Transcribir*: solo su melodía, no la letra ni el cantante), o la melodía de una de tus tomas, y dale un estilo nuevo.
- **Tu propia partitura**: una partitura ABC, seguida en Plan completo y en Solo melodía. Transponla (a la más cercana, hacia arriba o hacia abajo), mueve una voz por grados de la escala, importa un archivo MIDI (una línea melódica por voz), exporta MIDI o marcadores para un DAW, carga un ejemplo, vuélvela instrumental.
- **Recitar la letra sobre una partitura** (*Lay the lyrics on this score…*, bajo la partitura cuando se lee): el narrador del promo del estudio, para tus palabras. Cada línea va sobre los compases de la partitura, una sílaba una corchea en un tono del acorde de su compás, una respiración tras una coma y un punto, la última sílaba de la línea una negra más abajo; cada sección empieza en una frase de dos compases tras un compás de silencio, o tras un vocalise si lo marcas. Los instrumentos, los acordes, la tonalidad y el tempo se quedan; las secciones de la partitura siguen tus etiquetas, con una intro y un outro alrededor. Para spoken word, lecturas y rap sobre una base: haz la base, *Escribirla a partir del sonido*, y luego esto; pregunta antes, y Ctrl+Z en cada cuadro devuelve el texto anterior.

### Muestreo y eliminación de ruido <!-- #sampling-and-denoising -->

![Muestreo: el planificador de la partitura y los tokens musicales, los límites de tokens bloqueados](guide/sampling.png)

Los valores por defecto están afinados. Las tres filas de **forma** (Composición, Interpretación, Influencia del estilo) mueven los controles juntos en cinco pasos; los controles en sí están debajo.

- **Planificador de la partitura** y **Tokens musicales**: temperatura, top-p, top-k, penalización por repetición, ventana de penalización.
- **Tokens mínimos** y **Tokens máximos** están **bloqueados** contra una edición accidental: haz clic en el 🔒 junto al nombre para cambiarlos, y otra vez para bloquearlos. Los mínimos son fusibles: una partitura no puede terminar antes de 200 tokens, ni la música antes de 750 (30 segundos; una duración pedida más corta lo baja a esa duración). El máximo de la música se muestra como **Duración máxima**, en tiempo (25 tokens por segundo), sin candado: es la duración de la canción como mucho, y solo se fija aquí («Sonido y salida» no tiene campo de duración).
- Cada control se mantiene dentro de límites sensatos; un valor fuera de ellos vuelve atrás, y la página lo dice.
- **Guía (CFG)**: 1.6 por defecto en todos los modos.
- **Sonido y salida**, la sección inferior del mismo bloque: **Pasos de eliminación de ruido** y **Resolvedor** para la mitad sonora, **Formato** (WAV de 24 bits, 16 bits, 32 bits en coma flotante o MP3 con su bitrate) y **Recorte de picos**; *Restablecer la salida* los devuelve.

**Una receta conservadora para el ruso** (de Viktor, de oído): Composition *low*, Performance *low*, Style influence *high*: el planificador de la partitura a temperatura 0.85, top-p 0.92, top-k 40, los tokens musicales a 0.85, 0.93, 80, las penalizaciones de repetición 1.005 y 1.3 en una ventana de 100, guía (CFG) 1.8; 32 pasos de eliminación de ruido con Midpoint. Sin aceleraciones, rap a un ritmo moderado. Es el perfil integrado *Russian · conservative (Viktor's)*.

### Crear la partitura ABC, y Generar <!-- #create-abc-score-and-generate -->

- **Crear la partitura ABC** escribe la partitura y se detiene: léela, edítala, y entonces *Generar* renderiza exactamente esa partitura. Una partitura que ya esté en el campo se reemplaza, después de una pregunta.
- **Pruebas** y **Variaciones**, junto a Generar: Pruebas es cuántas pruebas, en cada una la música se escribe de nuevo, cada una con su semilla de música (seed, seed + 1…); el motor escribe a la vez tantas como su lote permite y las demás en pasadas siguientes. Variaciones es cuántas veces se renderiza el sonido de cada prueba a partir de su única música, cada una con su semilla de sonido, la misma para todas las pruebas: cada una cuesta más o menos el tiempo de un sonido, casi nada de memoria. Pruebas × Variaciones es cuántas tomas salen: 2 × 4 = 8.
- **Generar canción** lo hace todo. La ejecución muestra sus etapas sobre la marcha.

### Babel en la partitura <!-- #babel-in-the-score -->

![El motor detuvo una ejecución cuya partitura no era una partitura](guide/babel.png)

Cuando la mitad musical escribe basura como partitura (los adaptadores llevados más allá de sus límites hacen eso: sin tonalidad, sin compás, dos puntos en ristra), **el motor detiene la ejecución antes de hacer música alguna con ella**, en segundos en lugar de minutos. La ventana dice por qué, qué adaptadores pesaron sobre la mitad musical y cuánto pasaron de sus límites, muestra lo que se escribió y puede devolver las fuerzas musicales al verde con un clic.

### La toma <!-- #the-take -->

![Una toma: descargar, hacer de nuevo, posproducción, archivos](guide/take-head.png)

- **La cabecera**: ▶ y los botones de la toma en su primera fila (👍 👎 ☆, el Bibliotecario, renombrar, borrar), y al final ⇆ y ⤡, que alzan un marco sobre la sala; debajo, el título en una sola línea; más abajo, cómo se hizo.
- **Descargar**: WAV, FLAC (las mismas muestras, unas tres cuartas partes del tamaño), MP3 al bitrate que elijas.
- **Hacer de nuevo**: *Nueva toma* (una toma nueva con la misma petición), *Usar como base* (la petición de vuelta al formulario), *Volver a renderizar el sonido* (la misma música, sonido nuevo), *Regenerar desde…* (conservar el comienzo, escribir el resto de nuevo), *Transcribir esta toma*, *Recortar al texto* (cortar una cola tras la última línea cantada), *End at…* (la toma termina en el momento que elijas, con un fundido de sus últimos 2 s; desde sus latentes guardados, en segundos).
- **Pulidor**: *Espectro*, *Revisión de la letra*. **Archivos**: la petición y la partitura.
- **Nota**: qué funciona, qué arreglar, adónde va.
- La tarjeta de abajo dice cómo se hizo: modo, formato, VAE, modelo, pasos, la forma, los deslizadores, las LoRAs con sus fuerzas, ambas semillas (cópialas para repetirla).
- **Sobre la sala** (⤡) la toma va en dos columnas: qué hacer con ella, su estilo y su letra a la izquierda; cómo se hizo, su VAE y su partitura a la derecha. Una toma nueva se abre con Style y Lyrics plegados; las herramientas van en grupos enmarcados.

![Cómo se hizo una toma](guide/take-info.png)

### La partitura <!-- #the-score -->

El plan de la toma como pentagrama o como ABC: imprímelo en PDF (US Letter, vertical u horizontal), exporta MIDI o marcadores, *Editar y volver a renderizar*, o ábrelo a pantalla completa.

## Escritor <!-- #writer -->

### Canciones como documentos <!-- #songs-as-documents -->

![El Escritor](guide/studio-writer.png)

Cada canción puede vivir en el Escritor como un documento: su **estilo**, su **letra**, sus **notas** (Markdown, con vista previa) y sus **parámetros** (cada control del formulario del Creador). *Nuevo*, *Desde el Creador* (el formulario tal cual), *Cargar en el Creador*.

- **Versiones**: *Conservar esta versión* en cualquier momento; *Restaurar esta versión* o tomarla *Como documento nuevo*.
- **Tomas creadas a partir de él**: cada toma cuya petición salió de este documento.
- **La canción ahora**: título, estilo, la tonalidad, el compás y el tempo de la partitura (el estilo debe coincidir con ellos), la letra; *Editar en el Creador*.
- **Exportar todo** (el disquete, *Export all*) e **Importar** (la carpeta, *Import*): todo el cuaderno en un archivo para una copia de seguridad — cada documento con sus versiones, las tomas creadas a partir de él y la papelera; al importar entra lo que falta, lo igual se deja y un documento que difiere entra junto a su homónimo como copia: nada se sobrescribe.

### Perfiles de texto <!-- #text-profiles -->

Cómo un texto pegado queda listo para leer: reglas de sustitución en orden (literales o expresiones regulares), luego la forma (`[Intro]`, `[Verse]` en las líneas en blanco, `[Interlude]` tras los párrafos largos). *+ Regla*, y luego **Pruébalo desde la letra** muestra lo que sale antes de guardar.

### La sala de escritura <!-- #the-writing-room -->

![La sala de escritura: un modelo de chat redacta, tú decides](guide/writer-room.png)

Un modelo de chat lee tu estilo, tu letra y tu partitura, y luego los redacta o los revisa. **Nada cambia hasta que lo aplicas.**

- **¿De qué trata la canción?** o qué cambiar; **Ayúdame con** el estilo, la letra o ambos; **Estructura**: el orden de secciones para una letra nueva.
- El modelo: un servidor de chat local (vLLM, LM Studio, Ollama: cualquiera con un endpoint de chat `/v1`, configurado en el Motor) o cualquier modelo de OpenRouter con su clave de API. Su campo sugiere toda la lista de OpenRouter mientras escribes, cada modelo con su precio por millón de tokens de entrada y de salida y su contexto; el precio del elegido aparece bajo el campo, y un nombre que la lista no conoce se avisa.
- *Crear un borrador*, luego **Aplicar el borrador**, **Usar la letra** o **Usar el estilo**; *Deshacer* lo revierte.

## Pulidor <!-- #refiner -->

### Después del render <!-- #after-the-render -->

![El Pulidor: la toma a la derecha, los pasos en fila](guide/studio-post.png)

Elige una toma a la derecha; las herramientas trabajan sobre ella o sobre uno de sus stems. La columna de la derecha guarda **las tomas pulidas aquí**, el pulido más reciente primero (*Pulidas* junto a *Favoritas* la cambia a todas las tomas, para empezar una nueva), y tras recargar, la sala vuelve a la toma que estaba puliendo.

Todo lo que se hace a partir de una toma cuelga de su **árbol** (*Creado a partir de esta toma*), lo más nuevo arriba: primero **el original**, con su reproductor y su FLAC, luego cada rama, reproducible y utilizable como fuente del paso siguiente. Lo que corre se muestra donde miras: en la cabecera de la sala, arriba del bloque del propio paso y como un punto que late en su pestaña. El bloque de cada paso lista lo que hizo para la toma (*Creado aquí*: un clic lo encuentra en el árbol), y el paso abierto ilumina sus propias ramas.

**Comparar todas** (en la fila del original, o *Comparar* en cualquier rama) abre todas las versiones en un solo reproductor, como SUNO cambia de versión: el original, el que pasó por el antizumbido, las remasterizaciones, los reescalados, los stems. Un clic en otra versión, o su número (1–9), la reproduce **desde el mismo segundo**; la barra espaciadora reproduce y pausa, ← → mueven cinco segundos, Esc cierra.

### Importar una pista <!-- #import-a-track -->

WAV, FLAC, MP3… de donde sea: se convierte en una toma de la biblioteca (48 kHz, 24 bits), marcada como *importada*, lista para stems, remasterización y lo demás. La letra es opcional; la revisión de la letra compara con ella.

### Los pasos y la cadena <!-- #the-steps-and-the-chain -->

![La cadena y los pasos](guide/post-steps.png)

La **cadena** ejecuta varios pasos de una vez: *Antizumbido → Reescalado → Stems → Remasterizar → Reescalado*, luego cualquiera de *Artefactos*, *Espectro*, *Letra*. Los stems se separan de la toma tras el Antizumbido (y el Reescalado) y el remaster los mezcla, así que su preset y su de-esser actúan también en la cadena; el primer reescalado deja a los separadores oír la canción entera, el último dibuja de nuevo la parte alta que dejan los stems y el remaster (un siseo por encima de 20 kHz, casi nada por encima de 22). Los stems son cuatro salvo que elijas otra cosa. Uno por uno:

1. **Espectro**: espectrograma, espectro medio, energía por bandas; superpón otra toma para comparar.
2. **Artefactos**: un tono que no se va, el zumbido de 25 tramas del VAE en los agudos, clics, saturación, cortes, un estéreo que lucha consigo mismo. Un clic en un tiempo reproduce desde ahí.
3. **Antizumbido**: el decodificador de YuE2 escribe el sonido en tramas de 1920 muestras, 25 por segundo, y sus agudos tiemblan con ellas. Este paso quita la parte atada a ese reloj de tramas por encima de 2 kHz. 80 % es la elección del oído; 100 % adelgaza el comienzo.
4. **Letra**: Whisper escucha y compara lo que oye con tu letra, minuto a minuto; *Sincronizar las líneas* para la sincronía de karaoke. Sobre el stem vocal oye las palabras sin la música.
5. **Stems**: cuatro stems (BS-Roformer para la voz, luego htdemucs_ft para batería, bajo y lo demás; también el instrumental), o voces + instrumental. *Origen* es la toma o un archivo suyo tras el Antizumbido o el Reescalado, cada origen con su propio juego; a tu DAW va el juego más nuevo de cada clase.
6. **Remasterizar**: mezcla los stems o usa la toma tal cual; limpieza, de-esser, opcionalmente reafinar 440 → 432 Hz, sonoridad (LUFS) y pico real. Cada pasada es una rama nueva. El preset y el de-esser actúan sobre los stems antes de mezclarlos: con la toma o cualquier archivo suelto como origen están apagados, y en la cadena actúan cuando ella separa stems.
7. **Reescalado**: UniverSR dibuja de nuevo la parte alta del espectro; el original se queda muestra por muestra por debajo del corte. Sobre un remaster (el último paso de la cadena) el archivo entero baja de nivel si la parte alta nueva supera el techo de pico real del remaster.

## Artista <!-- #artist -->

*Un adelanto: lo que hay aquí funciona, y el resto de la sala llega en las versiones siguientes.*

### Imágenes para tus canciones <!-- #pictures-for-your-songs -->

Escribe con frases lo que ves para la canción: Krea 2 Muse lee el prompt como una descripción, no como una lista de etiquetas. Primero lo que hay en la imagen, luego la luz, los colores y la técnica (óleo, tinta, una fotografía), y al final *no text* cuando no quieras letras en ella. **From the take** pone el prompt con el que se pintó la portada de la toma que tienes en la mano, o uno hecho de su título y su estilo, para tener por dónde empezar.

**Formas**: **1:1** (1280 × 1280) para la portada, **16:9** (1920 × 1080) para un vídeo, **9:16** (1080 × 1920) para un short. Las formas de una pulsación comparten su semilla, así que salen como una serie: la misma escena con los mismos colores, cada una compuesta para su propio marco y no una sola imagen recortada tres veces. **Variations** pinta también las semillas siguientes (la semilla, la semilla + 1, …), cada una en todas las formas. **Seed**: vacía para una nueva cada vez; la semilla de una imagen que te gustó la vuelve a pintar (cada tanda muestra su semilla, y **To the form** la devuelve con el prompt).

**Painter**: Krea 2 Muse de Stable Yogi, **Q4** en una tarjeta con 12,5 GB libres, **Q8** (más fina) con 18,5 GB. Una imagen tarda unos 35 s en 1:1 y 47 s en 16:9 o 9:16 en una RTX 3090, y unos 25 s más en cargar el pintor por pulsación. Una pulsación espera en la cola del laboratorio una tarjeta con sitio, como las portadas y los stems; mientras espera, **Off the queue** la retira. Cada imagen pasa por el filtro de contenido que pide la licencia del pintor: la que marca no se guarda, y la tanda lo dice.

**Live preview** (activo por defecto): el sitio de la imagen que se pinta muestra cada uno de sus pasos, del ruido a la imagen, a un octavo de su tamaño y sin el decodificador, así que no cuesta nada; apagado, el sitio espera la imagen terminada.

### Una portada para la toma <!-- #a-cover-for-the-take -->

Un clic en una imagen la abre sobre la página con su propia forma (← → recorren la tanda, Esc cierra), con **Download** (PNG, tamaño completo). Una imagen cuadrada tiene **Set as cover**: se vuelve la portada de la toma que tienes en la mano (elígela a la derecha), en su tarjeta, en el reproductor y en su MP3. La portada que tenía se guarda junto a la toma (`artwork-removed/`), como la guarda un repintado, y la otra letra de un par A/B recibe también la nueva cuando no tiene una propia.

Las tandas se quedan en la carpeta `artist/` del estudio, las más nuevas arriba. **Again** pinta una tanda otra vez desde una semilla nueva; **Trash** la lleva a `trash/artist/`, de donde vuelve si mueves su carpeta otra vez a `artist/`.

**Runs o Gallery**: las tandas muestran cada pulsación de Draw con su prompt y su semilla; la galería muestra todas las imágenes de todas las tandas en una sola cuadrícula, las más nuevas primero, por forma (1:1, 16:9, 9:16) o con estrella (☆ en una imagen le pone estrella), en tres tamaños. Una imagen abierta desde la galería recorre toda la galería, con ★, To the form (su prompt, su semilla y su forma), Set as cover y Download.

### Lo que viene al Artista <!-- #coming-to-the-artist -->

Una imagen de referencia de la que partir; repintar una parte de una imagen y extenderla más allá de sus bordes, en un lienzo; varios adaptadores LoRA a la vez; un reescalado; Qwen Image como segundo pintor; el título y el artista escritos en la portada.

## Bibliotecario <!-- #librarian -->

### Todas las tomas <!-- #every-take -->

![El Bibliotecario](guide/studio-collection.png)

- **El encabezado** nombra la colección abierta (*Bibliotecario › Fosforida*) y lo que contiene: tomas, horas, me gusta, favoritas, notas, cómo se hicieron.
- **Espacios**, a la izquierda: Todos, Favoritas, Sin espacio, tus espacios, *+ Espacio nuevo*; Ocultas y la Papelera, en *Fuera de la vista*. Clic derecho en un espacio para sus **bloqueos** (*Bloquear la eliminación del espacio*, *Bloquear la eliminación de las tomas*): un 🔒 junto a su nombre, y nada de él va a la papelera. Los espacios 💎 (los conjuntos públicos del estudio) quedan al pie del árbol, por nombre, y los 💎 … LoRA los últimos de todos.
- **Busca** con palabras, `*` y `?`; **ordena** por más nuevas, más antiguas, por título, más largas; **Mosaico** o **Lista**: los tres en la línea del encabezado, junto a los recuentos.
- **Una tarjeta** lleva la portada de su toma en la esquina superior derecha, junto al título, cuando la tiene (*Dibujar la portada* en el menú de la toma); un clic muestra la imagen entera sobre el estudio, donde ‹ › y las flechas recorren las imágenes de las tarjetas mostradas, ▶ reproduce su toma y Esc cierra. La tarjeta que suena brilla con los propios picos de la canción.
- **Tomas frescas**: una toma que aún no has reproducido lleva una línea discontinua clara; su primera reproducción la quita. Una toma regenerada lleva una insignia *regen* y conserva su nota, su me gusta y su estrella.
- **La columna de espacios**: arrastra su borde para ensancharla o estrecharla; « la pliega, y las tarjetas se ensanchan: las columnas son las mismas, y la vista no pierde su sitio.
- **Secciones**: un espacio puede tener secciones, dos niveles de profundidad como mucho (⋯ junto a su nombre → *Sección nueva…*), para ordenar lo que contiene sin un espacio nuevo cada vez. Un espacio muestra también las tomas de sus secciones. Todo aquello de lo que el Pulidor hace algo va solo a la sección *Pulidas* de sus espacios.
- **Arrastra una tarjeta a un espacio** de la izquierda para moverla allí (todas las marcadas, si está marcada); mantén **Ctrl** para añadirla allí y dejarla también aquí. El estudio pregunta primero, y Ctrl+Z lo deshace.
- **Tomas fijadas**: hasta cuatro en cada espacio, en una franja de su propio tono sobre las tarjetas (clic derecho en una toma → *Fijar aquí*; × la desfija). Cuando marcas tomas, la barra de las marcadas ocupa el lugar de la franja, así que las tarjetas nunca se mueven. Esa barra es una fila de iconos enmarcados: la selección, las marcas, los espacios, la exportación y la papelera al final; cada uno se dice al pasar el puntero.
- **Filtro** (el botón al final de la fila de búsqueda) abre una ventana como la elección de espacio: marca qué buscar en tres grupos (cómo se hizo: generada, importada, regenerada, re-renderizada; marcada: me gusta, no me gusta, favoritas, con nota, con portada; lo que tiene: stems, antizumbido, remasterización, reescalado), cada uno con cuántas tomas del lugar, y cómo se unen las marcadas: todas (AND), cualquiera (OR) o ninguna (NOR). *Show* las aplica; el botón dice luego cuántas hay activas y cómo se unen.
- **Selecciona** varias, como en un gestor de archivos: marca una, y a partir de ahí un clic en cualquier parte de otra tarjeta la marca también (Shift: todo el rango). Arrastrar sobre el espacio vacío entre las tarjetas dibuja una banda que marca lo que toca; **Ctrl+arrastrar** la dibuja desde cualquier parte y conserva lo ya marcado. La barra de las marcadas flota sobre el reproductor: favorita, añadir a un espacio, mover a uno, sacar de este, ocultar, exportar un ZIP, a la papelera.
- **La papelera** devuelve, o borra para siempre tras confirmar.

### El menú de una toma <!-- #a-take-s-menu -->

![Clic derecho en una toma](guide/collection-menu.png)

**Regenerar con una semilla nueva** (encima del Escritor en el menú de la toma): la toma hecha de nuevo con todo aquello con lo que se hizo, pero con semillas nuevas; la nueva hereda los espacios y la nota de la antigua, y la antigua espera en la sección *Origen de la regeneración* de su espacio (su espacio no la muestra entre las suyas) hasta que la vacíes; la nueva conserva su nota, su me gusta, su estrella y su imagen. Una prueba sale con sus dos minutos completos. Reproducir, abrir en el Creador o en el Pulidor, la hoja (su partitura), la ficha técnica (todo aquello con lo que se hizo: el estilo y la letra, la partitura dibujada, cada control, las LoRAs y los deslizadores con sus fuerzas; una toma en modo Directo no tiene partitura, y *Escribirla a partir del sonido* le pide una al transcriptor), me gusta, no me gusta, favorita, una nota, renombrar, **espacios** (una toma puede estar en varios), **mover a** un espacio (en una tarjeta marcada: cada toma marcada, fuera del espacio abierto), ocultar, enviar al Escritor, copiar, descargar, **exportar a un DAW** (proyecto de REAPER o DAWproject, en cualquier toma: con sus stems una vez que el Pulidor los ha separado), a la papelera. **En una tarjeta marcada, con otras marcadas**, el menú actúa sobre todas, y su cabecera dice sobre cuántas: me gusta, no me gusta, favorita, portada, quitar la portada, espacios, ocultar, un ZIP; las portadas de varias y la regeneración de varias preguntan antes, porque cuestan minutos de una tarjeta gráfica.

**Dibujar la portada**: un modelo de lenguaje pequeño (Qwen3-4B) lee el estilo y las palabras de la toma y escribe un prompt de imagen; Krea 2 Muse lo pinta, a 1024 px, en cerca de medio minuto en una tarjeta de 16 GB (en una tarjeta menor, un SDXL, CyberRealistic XL; el pintor se elige en *Motor → Portada*). Se ve en el reproductor, en la tarjeta, en el panel multimedia del escritorio y dentro del MP3 que descargas (como su portada). Cuando una toma ya tiene su imagen, el menú dice *Abrir la portada* (sobre la página, como un clic en la imagen de la tarjeta o en el cuadrado del reproductor) y *Redibujar la portada* (un prompt nuevo y una imagen nueva; la anterior se guarda junto a la toma, en `artwork-removed/`). Los dos modelos vienen con `heresy/fetch-heresy.sh --artwork` (14 GB, pregunta antes).

### Los instrumentos bajo el estilo <!-- #the-instruments-under-the-style -->

Bajo el campo Estilo, el estudio nombra lo que pide tu prompt: una ficha por cada instrumento y estilo de la chuleta que encuentra, coloreada según lo que halló el oído (verde oído, ámbar en duda, rojo no suena con ese nombre) y con la imagen del instrumento. Posa el puntero sobre una para ver su tarjeta: la imagen, su tierra, cómo suena, ▶ A y ▶ B con sus semillas. Un clic muestra la imagen entera. **Alt+I** abre la chuleta desde cualquier parte.

### Portadas: qué las dibuja, qué no puede, otro pintor <!-- #artwork-what-draws-it-what-it-cannot-another-painter -->

**Qué las dibuja.** Un modelo de lenguaje pequeño (Qwen3-4B) lee el estilo y las palabras de la toma y escribe un prompt de imagen, con su tema primero; Krea 2 Muse lo pinta (1024 px), o un SDXL donde Krea no cabe (*Motor → Portada*). Cuando la toma lleva el nombre de un instrumento (la prueba de un instrumento), el estudio les dice a ambos cómo es el instrumento y de dónde es, y Omni (el modelo del oyente) mira la imagen: cuando no encuentra el instrumento, vuelve a escribir el prompt a partir de lo que vio, y el pintor lo intenta otra vez, tres imágenes como mucho. Cerca de medio minuto por imagen en una tarjeta de 16 GB.

**Qué no puede** (una advertencia, dicha sin rodeos): el pintor dibuja lo que conoce. Un instrumento que nunca ha visto por su nombre (el duduk, el morin juur, el jomús, los cuencos cantores de cristal…) sale como una conjetura: una flauta de madera, un violín, unos cuencos de cocina. Cuando Omni no encontró el instrumento en ninguna de las tres imágenes, la imagen queda marcada como **≈ una suposición**, en la vista superpuesta y en la chuleta de instrumentos. Una portada es el ánimo de la toma, no una imagen de referencia de un instrumento: para saber cómo es un instrumento, búscalo.

**Consejo pro: otro pintor.** Cuando el pintor es un SDXL (elegido en *Motor → Portada*, o en una tarjeta de menos de 16 GB), es el SDXL al que apunte el enlace `artwork/SDXL-Artwork-Model`; el nuestro es `CyberRealistic-XL-v10`. Pon otro finetune de SDXL a su lado, como carpeta de diffusers o como un único archivo `.safetensors` (como los da Civitai), y apunta el enlace hacia él, en relativo:

```bash
cd artwork && ln -sfn MyFavourite-XL.safetensors SDXL-Artwork-Model
```

y de vuelta: `ln -sfn CyberRealistic-XL-v10 SDXL-Artwork-Model`. La siguiente imagen ya lo usa, sin reiniciar. **Solo funcionan los finetunes de SDXL**: SD 1.5, SD 3, FLUX y otras familias se rechazan, y el estudio dice qué encontró en su lugar. Un finetune Turbo, Lightning, Hyper o LCM quiere pocos pasos y poca guía: cuando su nombre lo dice, el estudio pinta con 8 pasos, guía 2 y Euler ancestral. Para cualquier pintor, un archivo junto al enlace fija sus números: `artwork/SDXL-Artwork-Model.json` con `{"steps": 6, "cfg": 1.5, "sampler": "euler_a"}` (o `"dpmpp"`, el propio del estudio).

## Entrenador LoRA <!-- #lora -->

### Qué le enseña una LoRA a YuE2 <!-- #what-a-lora-teaches-yue2 -->

Una LoRA es un adaptador pequeño sobre ambas mitades. **El estilo viene sobre todo de la mitad sonora; seguir la letra, de la mitad musical**, y la mitad musical se aprende de memoria los conjuntos pequeños enseguida (su pérdida cae hacia 0). Tipos:

| tipo | datos | qué aprende |
|---|---|---|
| **Estilo** | 20+ canciones de un mismo sonido | género, producción, el sonido de una banda |
| **Voz** | una sola voz, cantada o hablada: canto (idealmente a capela), lecturas, audiolibros | un timbre |
| **Idioma** | muchas voces, letras exactas | la dicción de un idioma |
| **Artista** | un catálogo grande y variado | todo |

**Un adaptador de voz aprende de cualquier forma de la voz**, no solo del canto: sirven también lecturas y audiolibros. Medido aquí (05.10.2026): un adaptador entrenado con las lecturas de un actor hablaba con su voz y, al cantar, cantaba con su color. Nombra un adaptador así por el tipo de voz (bajo, baritenor, contralto…), nunca por una persona: `lab/voice_kind.py` mide la voz de un conjunto por la altura del habla.

![El Entrenador LoRA: la telemetría de una ejecución](guide/studio-train.png)

### 1 Material <!-- #1-material -->

Pon una carpeta de canciones en `datasets/raw/` y elígela. Escoge qué pistas entran, dale a cada una su letra (se encuentra al lado por nombre cuando existe) y, si la necesita, un estilo propio. Las pistas de menos de 30 segundos quedan fuera por defecto; las largas están bien (la mitad musical entrena con la canción entera).

**Voz**: *Measure the voice* escucha hasta doce pistas de la carpeta y dice, en el habla, si la voz es masculina o femenina y su registro (bajo, barítono, baritenor, tenor; contralto, mezzo, soprano), con la altura del habla, y propone para el conjunto un nombre hecho de ello, como se llaman los adaptadores de voz publicados (`voice-ru-m-baritenor-117`): sin nombre de persona. En el canto da el ámbito cantado y deja la voz a tu oído. Donde la altura sola no decide (140–175 Hz al hablar), di ♂ o ♀ y mide otra vez. Es un borrador por medida: decide el oído, y la voz con la que luego canta YuE2 puede quedar más alta o más baja.

### 2 El conjunto <!-- #2-the-set -->

Una **palabra activadora** (una palabra poco común, p. ej. `fosforida`) llama luego al estilo por su nombre; la **línea de estilo común** dice lo que se oye. *Crear el conjunto* escribe `datasets/prepared/NAME/`: audio a 48 kHz y una descripción por pista.

El **oyente** (Qwen2.5-Omni, en cualquier tarjeta con unos 8 GB libres) escucha cada pista y redacta sus etiquetas; tú las corriges y pulsas *Escribir en las descripciones*. Es un borrador a cualquier tamaño: léelo.

### 3 Entrenar <!-- #3-train -->

![Un tipo, los controles, una tarjeta](guide/train-knobs.png)

- **Tipo** preajusta los controles (rango, pasos, cuánto aprende la mitad musical).
- **Entrenador**: **Ruach Studio** (el propio del estudio, sobre pesos bf16 sin cuantizar; crea él mismo la caché latente del conjunto) o **AI-Toolkit** de Ostris (la referencia; también puede entrenar con partitura). Ambos guardan el mismo formato de LoRA; con el mismo conjunto, sus curvas coinciden época a época.
- **Pesos base**: bf16 (tarjetas de 24 GB) o int8 (tarjetas más pequeñas, un poco menos exacto).
- **Pasos**, **Guardar cada** N épocas (se conserva cada época), **Rango**, **Tasa de aprendizaje**, **Peso AR** (cuánto aprende la mitad musical; 0 = solo el sonido), **Ancla AR** (la mantiene cerca del modelo base), **Velocidad AR**.
- Bajo el botón: la VRAM medida de ejecuciones anteriores, y qué tarjeta está lo bastante libre ahora.

### El rango y los demás controles <!-- #rank-and-the-other-knobs -->

El **rango** es lo ancho que es el cambio del adaptador en cada matriz. Una LoRA adapta 224 matrices de YuE2, 112 por mitad; cada una tiene 2048 de ancho y 28 capas de profundidad: 1,41 mil millones de pesos por mitad. Lo que cuesta un rango, medido sobre estas formas:

| rango | de los pesos que adapta | archivo, por mitad (bf16) |
|---|---|---|
| 16 | 1 % | 29 MB |
| 32 | 2 % | 59 MB |
| 64 | 4 % | 117 MB |
| 128 | 8 % | 235 MB |
| 256 | 17 % | 470 MB |

- **Una voz, un instrumento, un sonido** (de 20 a 50 canciones): **16**, como mucho 32.
- **Un estilo o un artista** (un catálogo variado): **32**.
- **Un conjunto grande de muchas voces** (horas de ellas, una etiqueta para cada voz): **64**, y **128 como mucho**, solo cuando 64 se queda corto de forma medible. El entrenador se detiene en 128: 256 cambiaría una sexta parte de los pesos que toca, más de lo que necesita cualquier conjunto de aquí.
- El archivo del modelo base nunca cambia. El riesgo de un rango grande es el propio adaptador: a plena fuerza olvida lo que no se le mostró (cantar, si aprendió del habla).
- **Pasos**: la mitad musical se aprende de memoria un conjunto pequeño enseguida (su pérdida cae hacia 0): las épocas verdes de la Telemetría son las primeras que vale la pena escuchar, a menudo mucho antes de la última.
- **Tasa de aprendizaje**: mantén la del tipo; más alta aprende más rápido y olvida más.
- **Peso AR**: 0 enseña solo el sonido (un timbre); súbelo para la dicción y el estilo, que viven en la mitad musical.
- **La frecuencia de muestreo del material**: la mitad sonora trabaja a 48 kHz, la musical oye a 24 kHz. Una grabación de 24 kHz le enseña todo a la mitad musical, pero a la sonora solo unos agudos apagados: remuestrear no añade nada por encima de la mitad de la frecuencia original. Para un timbre, dale 44,1 o 48 kHz.

### 4 Telemetría <!-- #4-telemetry -->

![Las curvas de ambas mitades, explicadas bajo cada una](guide/train-charts.png)

Las ejecuciones que están entrenando se colocan arriba de la sala con su progreso, el tiempo restante y ambas pérdidas. La telemetría de una ejecución muestra su progreso, velocidad, tiempo, memoria y dos curvas:

- **Mitad sonora · pérdida flow**: lo bien que la mitad sonora predice el ruido que debe quitar. Salta de un paso a otro (cada paso toma un nivel de ruido al azar): lee la línea gruesa, la media móvil.
- **Mitad musical · ar_ce**: lo bien que la mitad musical predice los propios tokens de la canción. Cerca de 0 se sabe las canciones de memoria; entonces una época anterior es el mejor adaptador.

Pasa el puntero por una curva para leer el paso, su época y el valor ahí. **Comparar con…** superpone las curvas de otra ejecución sobre estas, discontinuas.

### Las épocas que vale la pena escuchar primero <!-- #the-epochs-worth-hearing-first -->

![Verde: vale la pena escucharla primero; ✓: en loras/](guide/train-epochs.png)

Cada época guardada es una ficha. Las **verdes** son las que vale la pena escuchar primero, leídas de las curvas: la primera época cuya pérdida sonora se ha asentado, la de pérdida sonora más baja y la última antes de que la mitad musical se sepa las canciones de memoria. Es una suposición; decide el oído. Elige una época: **A loras/ → el Creador** (aparece al instante entre las LoRAs), **Fuera de loras/** o **Descargar**.

> **Un adaptador entrenado sin partitura (Directo) va en la mitad musical solo en ejecuciones en Directo.** En Plan completo su mitad musical puede romper la partitura incluso con poca fuerza: ahí, dale solo la mitad sonora.

### Ejecuciones <!-- #runs -->

![Cada ejecución, una tarjeta](guide/train-runs.png)

Cada ejecución es una tarjeta a la derecha: *Activas*, *Todas*, *Archivadas*, *Papelera*, con búsqueda. Una ejecución que entrena se ilumina como una toma que suena. ⋯ en una tarjeta: su telemetría, su registro, archivarla, detenerla o borrarla a la papelera (se te pregunta si sus adaptadores en loras/ se van con ella). Desde la Papelera vuelve, o se va para siempre.

## Motor <!-- #engine -->

### La máquina <!-- #the-machine -->

![Motor](guide/studio-engine.png)

- **Servidor**: lo que ejecuta el motor: el modelo, los decodificadores, el contexto, la biblioteca.
- **Cómputo**: la copia del **modelo** (BF16 7,2 GB, Q8_0 3,8 GB, Q6_K y Q5_K_M más pequeñas), **Preajuste de memoria de la GPU** (*Auto* ajusta el contexto y los bloques del VAE a la tarjeta; *Manual* te los deja a ti), **Mantener los modelos cargados**.
- **Hardware**: la memoria de la tarjeta ahora; **Liberar el modelo** la libera al instante.

### GPU: qué tarjeta hace qué <!-- #gpus-which-card-does-what -->

![Qué tarjeta hace qué](guide/engine-gpus.png)

En una máquina con varias tarjetas, dale a cada una su trabajo: el **estudio** (síntesis) en una tarjeta, el **entrenamiento** en las tarjetas que le des, los **trabajos** del laboratorio (el oyente, Whisper, stems, remasterización, reescalado) en las suyas. Mientras una ejecución entrena en la tarjeta del propio estudio, una síntesis espera, y la página dice por qué. Con una sola tarjeta, así funciona: entrena, luego crea. Una tarjeta nueva para el estudio surte efecto tras un reinicio (el botón aparece cuando hace falta).

### Decodificadores, adaptadores, deslizadores, el modelo del escritor, el aspecto <!-- #decoders-adapters-sliders-the-writer-s-model-the-look -->

- **VAE**, **LoRAs**, **Deslizadores**: cada archivo que encontró el estudio, con su fuente y lo que hace.
- **Escritor**: la dirección del servidor de chat local (vLLM, LM Studio, Ollama), *Probar la conexión*.
- **Apariencia**: 22 temas (elegidos para crear en ellos: claros y tranquilos), esquinas, las tres fuentes (texto, títulos, números).
- **Registro del servidor**: el registro completo; **Acerca de**: cada proyecto sobre el que se apoya el estudio, enlazado.
- **Actualizaciones**: las versiones de Ruach Studio en GitHub frente a esta: cada cuánto mirar (cada día, semana, mes, nunca), también las candidatas, y cuando sale una, preguntar o actualizarse sola cuando nada se ejecuta (solo donde el estudio es un clon de su repositorio; en otro sitio dice cómo actualizar a mano). Un estudio nuevo, y cada actualización, ofrece los conjuntos 💎 que aún no tiene.

## DAW <!-- #daw -->

**Experimental.** El camino hacia un DAW funciona y se ha comprobado, pero aún necesita pruebas de fallos en otras máquinas y proyectos, y más trabajo.

### Dos salidas del estudio <!-- #two-ways-out-of-the-studio -->

El estudio entrega una canción de una de dos maneras, y solo de estas dos:

1. **La pista mezclada**, tal como la hizo el estudio y la terminó el Pulidor: WAV, FLAC o MP3, sin DAW de por medio.
2. **La toma entera a tu propio DAW**, como un proyecto de ese DAW: de ahí en adelante, todo ocurre fuera del estudio. No vuelve a entrar audio ni proyecto: el estudio no lee el proyecto de un DAW (REAPER puede darle aquello de lo que está hecha una canción: su letra y una melodía).

**Exportar a un DAW** abre esta elección: en ☰ o en el Pulidor, junto a la toma en mano. La página muestra qué DAW tiene la máquina del propio estudio (REAPER, Waveform, Bitwig), con sus versiones. Cuando el estudio corre en otro ordenador que tu DAW (un servidor en casa, un portátil de viaje), marca el tuyo con *Uso esta*.

| DAW | qué le da el estudio | estado |
|---|---|---|
| **REAPER** | su propio proyecto (.RPP): la mezcla, los stems, la partitura como MIDI, tempo y compás, secciones, letra, la receta | listo, comprobado por el propio REAPER |
| **Waveform** (Tracktion), 14 o posterior | DAWproject: la mezcla y los stems, la partitura como pistas de notas, las secciones como marcadores, tempo y compás | listo, comprobado contra el esquema del formato |
| **Bitwig** | DAWproject, lo mismo | listo, comprobado contra el esquema del formato |
| **Studio One, Cubase** (Windows, macOS) | DAWproject, lo mismo | listo |

### REAPER: instalación <!-- #reaper-install -->

- **Linux**: desde reaper.fm, el tarball *Linux x86_64*; descomprímelo y ejecuta `./install-reaper.sh`: se instala en `/opt/REAPER`, sin nada más.
- **Windows, macOS**: el instalador de reaper.fm.
- REAPER da 60 días con todas las funciones y luego pide una licencia ($60 para uso personal o una pequeña empresa).

### El proyecto más completo: tres pasos antes <!-- #the-fullest-project-three-steps-first -->

Lo que lleva el proyecto depende de lo que tenga la toma. Para tenerlo todo:

1. **Plan completo** al hacer la canción: la partitura se convierte en las pistas MIDI y da el tempo y el compás. (Una toma en Directo no tiene partitura: no hay MIDI; el tempo sale de "NN bpm" en el estilo, o se queda en un 120 provisional.)
2. **Pulidor → Stems**: cada stem tiene su propia pista (dos: voces e instrumental; cuatro: con batería, bajo y lo demás).
3. **Pulidor → Revisión de la letra**: Whisper sincroniza cada línea; las líneas llegan a la línea de tiempo y las secciones ([Verse], [Chorus]…) se convierten en regiones.

Ninguno de los tres es necesario: el proyecto toma lo que hay y dice lo que le faltó.

### REAPER: exportar y abrir <!-- #reaper-export-and-open -->

1. Abre la toma (en el Creador, el Pulidor o el Bibliotecario), luego **Exportar a un DAW → REAPER → Exportar la toma**; o clic derecho en cualquier toma → **Descargar → Proyecto de REAPER**.
2. El estudio empaqueta la toma: el audio como WAV de 24 bits a 48 kHz, así que una canción de siete minutos con dos stems ocupa unos 350 MB. El navegador guarda `TITLE.reaper.zip`.
3. Descomprímelo donde quieras, entero: `TITLE/TITLE.RPP` y `TITLE/audio/` quedan uno junto al otro.
4. Abre `TITLE.RPP` en REAPER (File → Open project, o un doble clic).

### Qué hay dentro <!-- #what-is-inside -->

| pista | qué es |
|---|---|
| **Mix** | la canción tal como la renderizó el estudio; **silenciada** cuando hay stems, para que suenen los stems y la mezcla espere como referencia |
| **Vocals**, **Instrumental** (o Drums, Bass, Other) | los stems, cada uno desde 0 a lo largo de toda la canción |
| **Score · Vocal**, **Score · Ins** | la partitura como MIDI, una pista por voz. Es la partitura *tal como se escribió*: la canción tal como se cantó puede apartarse de ella. No suena hasta que le das un instrumento (el FX de la pista: ReaSynth, o cualquier VSTi) |
| **Lyrics** | cada línea de la letra como un ítem vacío con la línea en su nota, donde Whisper la oyó |

- **Regiones**: las secciones de la letra, desde la primera línea sincronizada de cada una hasta la siguiente.
- **Tempo y compás**: de la partitura (su `Q:` y su `M:`), si no, "NN bpm" en el estilo, y si no, 120 en 4/4 como valor provisional; las notas del proyecto dicen cuál.
- **Las notas del proyecto** (en los ajustes del proyecto de REAPER): el título, el estilo, ambas semillas, el nombre propio de la toma: el camino de vuelta a la toma en el Bibliotecario.

### REAPER: cuando algo se ve mal <!-- #reaper-when-something-looks-wrong -->

| lo que ves | por qué | qué hacer |
|---|---|---|
| media offline | la carpeta de audio no está junto al .RPP | descomprime el ZIP entero, deja `audio/` junto al proyecto |
| sin letra, sin regiones | la toma nunca se sincronizó | Pulidor → Revisión de la letra, y exporta de nuevo |
| sin pistas MIDI | una toma en Directo, o una sin partitura | hazla en Plan completo, o trae tu propia partitura en el Creador |
| el tempo marca 120 | la toma no tiene tempo propio | ponlo en REAPER, o escribe "NN bpm" en el estilo la próxima vez |
| el MIDI va por delante o por detrás de la voz | la partitura es el plan; el canto, su interpretación | usa el MIDI como boceto, o ajústalo a los stems |
| la letra en hebreo o en griego sale como cuadros | a la fuente de REAPER le falta esa escritura | una fuente con esas escrituras en el tema o las preferencias de REAPER |

### REAPER: canciones desde dentro de REAPER <!-- #reaper-songs-from-inside-reaper -->

Tres acciones de REAPER en `extras/reaper/` (ReaScript, Lua) llegan al estudio a través de su API, desde la máquina del propio estudio o desde otra de tu red. El sonido va en un solo sentido: las canciones salen del estudio hacia REAPER, y ni audio ni proyecto vuelven. Lo que REAPER le da al estudio es aquello de lo que está hecha una canción: su letra y su melodía.

- **Ruach - Generate here**: el estilo, la duración y el modo, preguntados; la canción se hace en el estudio y cae en una pista nueva al inicio de la selección de tiempo (con la duración de la selección). La letra sale de las notas de los ítems seleccionados (el proyecto exportado guarda ahí la letra de cada sección), o del diálogo. **Los ítems MIDI seleccionados son la melodía de la canción**: sus notas se convierten en su partitura (se canta la pista más alta; una pista de acordes no se da como línea, ya que la melodía podría llevarla un instrumento), al tempo y compás del proyecto, en la tonalidad del key snap del ítem MIDI o la que sugieren las notas, hecha en modo *Solo melodía*; las notas del ítem nuevo dicen cómo se leyó la melodía. REAPER queda libre mientras el estudio trabaja.
- **Ruach - Bring a take**: palabras (título o nota, `*` y `?`), un espacio si quieres, y la toma que elijas cae en el cursor de edición.
- **Ruach - Settings**: la dirección del estudio, su token si lo pide y el espacio en el que caen las canciones que llegan desde REAPER.

Instalación: copia la carpeta en `Scripts` de REAPER, luego *Actions → New action → Load ReaScript* para las tres, y ejecuta *Settings* una vez. Necesitan `curl` (lo tienen todos los Linux, macOS y Windows 10 y posteriores). El README de la carpeta dice el resto.

### DAWproject (Bitwig, Studio One, Cubase) <!-- #dawproject-bitwig-studio-one-cubase -->

Clic derecho en una toma → **Descargar → DAWproject**, o *Exportar la toma* en la tarjeta de Waveform o de Bitwig de la ventana DAW: un archivo `.dawproject` con la mezcla y cada stem (la mezcla silenciada cuando hay stems), la partitura como pistas de notas, una por voz, las secciones como marcadores una vez sincronizada la toma, al tempo y compás de la toma; el estilo y la letra viajan en sus notas. Ábrelo con la importación de DAWproject del DAW: Waveform 14 o posterior (*File > Import Other > Import a DAWproject file*; el estudio pide al menos Waveform 14), Bitwig, Studio One, Cubase. Comprobado contra el propio esquema del formato (Project.xsd).

### Desde tus propios scripts <!-- #from-your-own-scripts -->

Todo lo anterior es también la API del estudio: `POST /api/v1/takes/NAME/reaper` empaqueta el proyecto y dice dónde recogerlo. Consulta **docs/API.md**: canciones, trabajos, tomas, marcas, espacios y un servidor MCP para agentes.

## Partitura <!-- #score -->

En Plan completo la mitad musical escribe una partitura antes de que suene una sola nota, y la canción la sigue compás a compás; con Tu propia partitura la partitura es tuya. Esta pestaña la lee línea a línea: el dialecto que escriben YuE2 y SheetSage2, cómo sus dos voces se reparten los compases y cómo cambiarlas sin romper la canción.

### Qué hace la partitura <!-- #what-the-score-does -->

La partitura es texto ABC: una cabecera, luego la canción en grupos de uno a cuatro compases, cada grupo una vez para la voz (**Vocal**) y otra para los instrumentos (**Ins**), sobre una misma rejilla de compases. El motor la lee antes de la música: las notas de la voz llevan las palabras, los acordes guían la armonía, los compases dan el tiempo.

- **Una toma dura lo que dura su partitura.** Seis tomas en Plan completo terminaron a 0.5–5 s de la duración de su partitura. Los compases después de las últimas palabras también suenan: eso es una cola (*End at…* la corta, o quita esos compases de la partitura).
- **Lo que falta en la partitura no se canta.** Si el plan tiene menos secciones que la letra, las últimas estrofas se quedan fuera o vuelve una anterior.
- **El estudio la lee con rigor.** Lo que la comprobación no conoce lo rechaza, y dice dónde: el grupo, la voz, el compás. El motor quizá toque aun así una partitura así, pero el MIDI, los marcadores, el desplazamiento de una voz y la recitación necesitan el dialecto nativo.

### La cabecera <!-- #the-head -->

Ocho líneas, siempre estas, en este orden:

```
X:1
T:
M:4/4
L:1/16
Q:1/4=85
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:D#m
```

- `X:1` y un `T:` vacío tal cual: el título vive en el formulario.
- `M:` el compás como fracción: `4/4`, `3/4`, `6/8`, `2/4`; su denominador, una potencia de dos.
- `L:` la unidad: una nota sin número dura esto. YuE2 escribe `L:1/16`, una semicorchea, y todo lo de abajo se cuenta en ella.
- `Q:1/4=` el tempo: negras por minuto, un número entero.
- Las dos líneas `V:` palabra por palabra: el motor reconoce las voces por ellas.
- `K:` la tonalidad: una mayor por su nombre (C, G, D, A, E, B, F#, C#, F, Bb, Eb, Ab, Db, Gb, Cb) o una menor con m (Am, Em, Bm, F#m, C#m, G#m, D#m, A#m, Dm, Gm, Cm, Fm, Bbm, Ebm, Abm). Otra grafía de la misma tonalidad se rechaza: `Eb`, no `D#`.

### Grupos, voces y compases <!-- #groups-voices-and-bars -->

Tras la cabecera la canción va en grupos:

```
% verse
V: Vocal
"Gm"B2B2B2B2B2B2B2G2|"Eb"B2B2B2B2B2B2B2F2|"F"F2F2F2F2F2G2F2F2|"Gm"G4z12|
V: Ins
Z4|
```

- Un grupo: un comentario de sección donde empieza una sección (`% verse`), luego `V: Vocal` y una línea de uno a cuatro compases, luego `V: Ins` y una línea con **el mismo número de compases**. Cada línea termina en `|`; sin `||` ni repeticiones.
- `Z` es un compás entero de silencio, `Z2`, `Z3`, `Z4` esos compases; `z` es un silencio con duración, como una nota.
- Un compás o una tonalidad nuevos llegan como una línea `M:` o `K:` justo después de la línea `V:` de un grupo, igual en las dos voces: la comprobación quiere las dos voces en una misma rejilla y en una misma tonalidad en todo momento. Dentro de un compás, un cambio de tonalidad se escribe `[K:Em]`.

### Las notas y sus duraciones <!-- #notes-and-their-lengths -->

- Las letras son alturas: `C D E F G A B` la octava desde el do central (C4), en minúscula `c d e f g a b` la octava de arriba; `'` sube una letra una octava y `,` la baja: `B,` es B3, `c'` es C6.
- `^` sostenido, `_` bemol, `=` becuadro (`^^` y `__` dobles): una alteración vale para esa letra hasta el final del compás. Los sostenidos y bemoles de la tonalidad no necesitan marca.
- El número tras una nota es su duración en unidades (con `L:1/16`): `1` una semicorchea, `2` una corchea, `3` una corchea con puntillo, `4` una negra, `6` una negra con puntillo, `8` una blanca, `12` una blanca con puntillo, `16` una redonda; `24`, `32` y `48` para las más largas. Solo estas: otra duración son dos notas ligadas (`F4-F` para cinco).
- `-` liga una nota con la siguiente de la misma altura, también a través de la barra de compás: una nota sostenida, una sílaba.
- **Cada compás suma exactamente su compás**: con `L:1/16` dieciséis unidades en 4/4, doce en 3/4 y en 6/8. Un compás al que le falta o le sobra una unidad se rechaza, con sus números.

### Acordes <!-- #chords -->

- Un acorde es su nombre entre comillas antes de la nota donde empieza: `"Gm"B2`. Dura hasta el siguiente. Los acordes viven solo en **Vocal** (la comprobación los rechaza en Ins): son la armonía de la banda, no las notas del cantante.
- Un nombre es una fundamental (de A a G, con `#` o `b`) y uno de: mayor (nada), `m`, `dim`, `aug`, `7`, `maj7`, `m7`, `dim7`, `m7b5`, `sus4`, `sus2`, `6`, `m6`, `7sus4`, `m(maj7)`; un bajo tras una barra: `C/E`.
- Un silencio puede llevar un acorde: `"Bmaj7"z16` es un compás de ese acorde con la voz callada, como en una introducción.
- Con acordes, una partitura se toca en **Plan completo**; sin ninguno, en **Solo melodía** (un plan de melodía, el acompañamiento libre). El motor lo sabe por la propia partitura.

### Secciones <!-- #sections -->

- `% intro`, `% verse`, `% chorus`, `% bridge`, `% outro` en una línea propia antes de un grupo marcan dónde empieza una sección. Llegan a tu DAW como marcadores (*Marcadores*, y dentro del proyecto de REAPER), y en ellas el plan se encuentra con tu letra.
- Da a la partitura las secciones de tu letra, en su orden, cada una con sitio para sus líneas. El planificador a veces escribe menos: en un rap largo, de 2 a 17 secciones para las 32 del texto. Añádelas, o acorta la letra, antes de *Generar*.

### Tiempo <!-- #time -->

- Un compás dura sus negras × 60 ÷ el tempo, en segundos (el tempo cuenta negras): en 4/4 a 85 BPM 2.82 s, a 103 BPM 2.33 s; en 3/4 a 90 BPM 2 s.
- La canción dura sus compases × eso. La línea de la comprobación bajo la partitura lo dice: `✓ Native YuE2 score · Em · 90 BPM · 3/4 · 11 bars · 0:22 · 0 sections`.
- Una línea de letra necesita el tiempo de sus sílabas: a corchea por sílaba un compás de 4/4 da cabida a 8, a semicorchea a 16 (un rap: las estrofas de «Buratino» de Víktor van así: `FFFFFEEEE2zDDDDD`).
- Para que la canción acabe antes, quita compases al final de la partitura, en las dos voces; para un final, añade compases ahí.

### El espacio de la voz: Vocal <!-- #the-voice-s-space-vocal -->

- Vocal es lo que se canta: más o menos una sílaba por nota, una nota ligada una sílaba sostenida, silencios donde respira el cantante. La tabla de la comprobación dice cuántas notas, cuántas por minuto, la tesitura y cuánto del tiempo suena la voz.
- Notas y sílabas: con más notas que sílabas el modelo estira las sílabas sobre ellas o añade las suyas; con menos, aprieta las palabras. El contador de la letra en Composición mide cada línea por el tiempo que ocupa: da a la línea más o menos esas notas.
- El rap es denso (semicorcheas en una o dos alturas: lo lleva el ritmo), una balada tiene notas largas. Deja un silencio al final de una línea: ahí respira la voz y responden los instrumentos.
- El desplazamiento de voz bajo la partitura (*Mover*) mueve Vocal por grados de la escala (una tercera, una cuarta, una octava) donde queda demasiado alta o baja para el cantante; los acordes e Ins se quedan.

### El espacio de los instrumentos: Ins <!-- #the-instruments-space-ins -->

- Ins es la línea propia de los instrumentos: el riff de la introducción, las respuestas entre frases, un solo, el final. Una melodía, no los acordes (esos están en Vocal): una línea, y YuE2 arregla la banda a su alrededor.
- **Bajo la voz, Ins casi siempre calla.** Las versiones oficiales mantienen `Z4` bajo cada grupo cantado y tocan en la introducción, entre secciones y al final; las tomas de Víktor en Plan completo igual (un arpegio en la introducción, `Z4` bajo las estrofas, un relleno en los cambios). Un Ins ocupado bajo una línea cantada es una segunda melodía contra la voz, y las partituras nativas lo evitan.
- La comprobación lo resume como **Ins : Vocal**, las notas de una contra las de la otra: por encima de 1.5 los instrumentos llevan la mayoría de las notas, por debajo de 0.67 la voz, en medio más o menos igual.
- Un instrumental: Vocal calla (`Z`) toda la canción e Ins lleva la melodía. *Hacerla instrumental* pasa la melodía vocal de una partitura a Ins (la receta oficial) y marca *Instrumental*. Un adaptador de partitura instrumental a toda fuerza con palabras que cantar da una voz sin notas: mantenlo bajo cuando hay letra (Creador › VAE, sliders y LoRA).

### Cambiarla en el estudio <!-- #changing-it-in-the-studio -->

- **Crear la partitura ABC**, léela y cámbiala, luego **Generar**: el camino más seguro hacia la partitura que quieres. O escribe la tuya en *Tu propia partitura*.
- La comprobación bajo la partitura la lee mientras escribes: ✓ con la tonalidad, el tempo, el compás, los compases, la duración y las secciones, una tabla por voz y la línea **Ins : Vocal**; o ✗ con qué falla y dónde: `group 3, Ins, bar 9: duration 15/4 quarter notes != meter duration 4`.
- **Tonalidad** mueve toda la partitura (a la más cercana, arriba o abajo); *Mover* mueve solo Vocal o solo Ins, por grados de la escala.
- **MIDI** hacia fuera para un DAW (una pista por voz, las secciones como marcadores) y hacia dentro desde uno (una línea melódica por voz); **Marcadores**: las secciones con sus segundos, como CSV.
- *Escribirla a partir del sonido* y *Transcribir esta toma*: SheetSage2 escucha una grabación y escribe su melodía y sus acordes en este dialecto (con los acordes, o solo la melodía, según elijas en *Versión o remezcla*).
- *Lay the lyrics on this score…*: tus líneas sobre los compases de la partitura; la pestaña siguiente cuenta de dónde salió.
- La partitura de la toma como pentagrama, a pantalla completa, impresa en PDF: Creador › La partitura.

### Cuando la comprobación dice que no <!-- #when-the-check-says-no -->

| dice | significa | haz |
|---|---|---|
| `duration … != meter duration …` | un compás no suma | cuenta sus unidades: 16 en 4/4 con `L:1/16` |
| `unsupported duration 5` | una duración fuera de 1 2 3 4 6 8 12 16 24 32 48 | liga dos: `F4-F` |
| `voices have different measure counts` | Vocal e Ins tienen distinto número de compases en un grupo | da a la más corta compases `Z` |
| `Native chord symbols belong in Vocal, not Ins` | un acorde en Ins | pásalo a Vocal, el mismo compás |
| `unresolved tie at end of score` | la última nota se liga a nada | quítale su `-` |
| `tie changes pitch` | una ligadura entre dos alturas | liga una altura solo consigo misma |
| `Unsupported key` | una tonalidad fuera de la lista | la misma tonalidad como la escribe la lista: `Eb`, no `D#` |
| `expected 1–4 measures` | una línea de más de cuatro compases | parte el grupo en dos |
| `Preserve native Vocal and Ins voice definitions` | se cambió la cabecera | las ocho líneas de arriba |

## Voces sobre una partitura <!-- #voices -->

Cómo consiguió su sonido el promo del estudio: un narrador dice las líneas del promo sobre una base musical, voces de mujer cantan entre las líneas, cada línea cerca del momento que pedía su escena, todo en una toma. El método sirve para cualquier recitado, lectura o rap sobre una base; *Lay the lyrics on this score…* hace por ti su parte central.

### La base y su reloj <!-- #the-bed-and-its-clock -->

- Primero la música sin palabras: tomas en el estilo de la base (para el promo un tráiler épico, D#m, 103 BPM, 128 s), hasta que una suena bien.
- Luego, sobre ella, *Escribirla a partir del sonido*: SheetSage2 escribe la partitura propia de la base, sus acordes y sus compases. Esa partitura es el reloj: a 103 BPM en 4/4 un compás dura 2.33 s y una semicorchea 0.146 s, así que, mientras el compás no cambie, el compás n empieza en n × 2.33 s.
- Cantada en Plan completo sobre esa partitura, la canción nueva conserva ese reloj: los mismos acordes en los mismos compases, y las palabras donde la partitura las pone.

### Una línea en sus compases <!-- #a-line-on-its-bars -->

- Cada línea tenía un momento para decirse: su escena. Va al compás que empieza más cerca de ese momento; si ahí aún suena la línea anterior, al siguiente libre.
- La línea se vuelve notas: una sílaba por corchea en un tono del acorde de su compás, el nombre acentuado una negra más arriba, una respiración tras una coma (una corchea) y tras un punto (una negra), la última sílaba de la línea una negra y más abajo. Un narrador quiere pocas alturas: bastan los tonos del acorde, y los acordes vienen de la base.
- En el primer compás de la línea la partitura recibe su comentario de sección y la letra la misma etiqueta: `% verse` allí, `[Verse]` aquí. Una línea por sección: el plan y la letra se encuentran uno a uno, y nada se queda fuera.
- Las palabras que el modelo acentúa mal llevan las marcas de Víktor: una tilde aguda en la vocal tónica (обе́щано), el nombre escrito como suena (рУ́ах en ruso, רוּ-אַח en inglés).

### Dos voces en una toma <!-- #two-voices-in-one-take -->

- El narrador y las mujeres son una toma, no una mezcla. El estilo nombra a ambos: `male baritone narrator, spoken word, clear English diction, female a cappella vocalise, oooh aaah, epic cinematic trailer`, y el tempo, `103 bpm`.
- La letra da cada línea y tras ella, entre paréntesis, la vocalización: `(Ooh, aah)`. En las tomas del promo la cantaron las mujeres.
- La partitura da a la vocalización sus propias notas en los compases entre líneas: una blanca en el tono alto del acorde, luego el resto del compás en su tono de recitado, dos octavas por encima de las notas del narrador. La vocalización propia de la base se queda al final: el cierre conserva los compases de la base con sus notas.
- Un adaptador de voz puede dar voz al narrador; mantenlo bajo (bastaron 0.45 en la mitad musical y 0.3 en la sonora), o se adueña de la música.

### Muchas tomas, luego la mejor <!-- #many-takes-then-the-best -->

- Seis semillas por idioma, Plan completo, guía 1.6, la duración fijada en los 128 s de la base, la partitura y la letra tal cual. Cada toma dice sus líneas un poco a su manera: una cae más cerca, otra habla más claro.
- Dónde están de verdad las líneas: Pulidor › Letra › *Sincronizar las líneas* da el tiempo de Whisper para cada línea, palabra a palabra. Los segmentos propios de Whisper son demasiado gruesos para esto: un segmento a menudo empieza en la vocalización antes de una línea.
- Compara el tiempo de cada línea con su compás: en la mejor toma del promo 7 de las 11 líneas empezaron a menos de 1.5 s de su compás (1.7 s de media, la más lejana 7.5 s); las demás tomas se alejaron más. La partitura guía la voz, no la clava.
- Ordénalas: primero las líneas a menos de 1.5 s, luego las líneas oídas, luego la distancia media; escucha las primeras.

### El doble anillo <!-- #the-double-ring -->

- La palabra de Víktor: primero dejar bien las pistas, luego ajustar el vídeo a ellas, aunque sus duraciones difieran. Así la imagen sigue a la toma: una escena aparece justo antes de su línea, un subtítulo mientras se dicen sus palabras, y la tarjeta final se mantiene hasta el último segundo de la toma.
- Una línea no tiene que caer en su compás a la décima de segundo, entonces: el vídeo se mueve hacia ella. Lo mismo vale sin vídeo: una lectura al paso de unas diapositivas, un rap a las secciones de un beat.

### En el estudio ahora <!-- #in-the-studio-now -->

- *Lay the lyrics on this score…* (Creador › Versiones, remezclas y tu propia partitura) hace la parte de la línea en sus compases para cualquier partitura del formulario: tus secciones, una sílaba por corchea en los tonos del acorde, las respiraciones, una introducción y un final, la vocalización cuando la marcas.
- *Sincronizar las líneas* (Pulidor › Letra) da el tiempo de cada línea; *End at…* termina una toma tras su última línea.
- Aún no está en el estudio: cada línea en un segundo que elijas (los momentos de las escenas del promo) y el orden de las tomas por distancia. El promo lo hizo con scripts propios.

## Atajos y trucos <!-- #shortcuts -->

**En el Bibliotecario:** **Ctrl+A** marca cada toma mostrada, **Esc** ninguna, **Supr** envía las marcadas a la papelera (pregunta antes), **Ctrl+Z** deshace el último cambio (un movimiento, un espacio, ocultar, una fijación, marcas, la papelera); la píldora sobre el reproductor tiene el mismo Deshacer durante diez segundos.

### Teclas <!-- #keys -->

| tecla | dónde | qué hace |
|---|---|---|
| **Barra espaciadora** | en cualquier parte salvo un campo de texto | reproduce o pausa la toma en mano |
| **←** **→** (con **Shift**: 30 s) | en cualquier parte salvo un campo de texto o un menú | 5 segundos atrás o adelante |
| **M** | en cualquier parte salvo un campo de texto | sonido apagado y encendido |
| las teclas multimedia | el teclado, unos auriculares, el panel multimedia del escritorio | reproducir, pausa, anterior, siguiente |
| **Ctrl+Alt+1** … **9** | en cualquier parte | **1** Creador, **2** Escritor, **3** Pulidor, **4** Artista, **5** Bibliotecario, **7** Entrenador, **8** fuera, a tu DAW, **9** el Motor; el **6** queda para una sala que vendrá (Ctrl+1…9 son las pestañas del propio navegador) |
| **Esc** | en cualquier parte | cierra lo que esté abierto: un menú, un diálogo, la guía, una vista a pantalla completa, la sala del Motor |
| **F1** (o **Shift+F1**) | en cualquier parte | esta guía, en la sala donde estás; otra vez para cerrarla (la ayuda del navegador no aparece) |
| **Mayús+Tab** | el Creador | la tecla de los marcos, no la vuelta atrás por los campos: un marco levantado cambia al otro, y si no hay ninguno levantado, se levanta el del formulario (Compose); un diálogo, un menú y la barra de búsqueda conservan su propio Mayús+Tab |
| **F5**, **Ctrl+R**, **Ctrl+Mayús+R** | en cualquier parte menos el Bibliotecario | preguntan antes y dicen qué se lleva la recarga y qué conserva; con una canción en el formulario, *Save to the Writer, then reload* la guarda también en el Escritor; **Ctrl+F5** recarga al instante (en el Bibliotecario **F5** vuelve a leer la biblioteca) |
| **Intro** / **Esc** | un diálogo, un cambio de nombre en el sitio, un valor escrito de una LoRA | aceptar / cancelar; en un diálogo con texto largo, **Shift+Intro** es una línea nueva |
| **Intro** | *Empezar por una idea* | el modelo de chat redacta la canción; **Shift+Intro** es una línea nueva |
| **Ctrl+S** | el Escritor | guarda el documento ahora |
| **Alt+K** · **Alt+J** | la letra, la del Creador y la del Escritor | marcar la línea del cursor o quitarle la marca · ir a la siguiente marca (**Alt+Shift+J** a la anterior, **Alt+Shift+K** las quita todas) |
| **Alt+O** · **Alt+L** · **Ctrl+Y** · **Alt+↑ ↓** | la letra, como en mcedit | quitar las marcas · ir a una línea por su número · borrar la línea · mover la línea (o las seleccionadas) |
| **↑ ↓** · **→** · **←** | un menú | moverse · abrir un submenú · salir de él |
| **flechas** | el selector de temas | moverse entre los temas |
| **+** **−** **0** | un pentagrama o un espectro a pantalla completa | acercar, alejar, volver a ajustar; **Ctrl+rueda** hace zoom donde está el puntero |
| **← →** (con **Shift**: pasos mayores) · **Inicio** | el borde de una columna, con el foco | la columna más estrecha o más ancha · otra vez su propio ancho |
| **Intro** o **Barra espaciadora** | la tarjeta de una ejecución en el Entrenador LoRA | abrir la ejecución |

### El ratón <!-- #the-mouse -->

- **Clic derecho** en una toma en cualquier parte (la lista de tomas, una tarjeta, una toma fijada) para su menú; clic derecho en un espacio para sus bloqueos, renombrar y eliminar.
- **Doble clic**: una toma en la lista de tomas la reproduce; el nombre de un espacio lo renombra; el borde de una columna le devuelve su propio ancho; el pentagrama o el espectro se abre a pantalla completa; el valor de una LoRA te deja escribirlo exacto.
- **En el Bibliotecario, como en un gestor de archivos**: una vez marcada una tarjeta, un clic en cualquier parte de otra la marca también; **Shift**+clic marca todo el rango; arrastrar sobre el espacio vacío entre las tarjetas dibuja una banda que marca lo que toca; **Ctrl**+arrastrar la dibuja desde cualquier parte e invierte lo que cruza: las tarjetas sin marcar se marcan, las marcadas se desmarcan. La página se desplaza cuando la banda llega a un borde.
- **Marcas para muchas**: con varias marcadas, 👍, 👎 o ★ en cualquiera de ellas (o en la barra de las marcadas) las marca todas; cuando todas ya tienen esa marca, se retira. Sacar varias de un espacio pregunta antes; la papelera siempre pregunta.
- **Pasa el puntero** por el nombre recortado de un espacio: se muestra entero, sobre la cuadrícula.
- **La velocidad** del reproductor (de 0.5× a 2×) conserva el tono: ralentiza para oír un detalle, acelera para repasar.

### Pequeños trucos <!-- #small-tricks -->

- Conserva la **semilla musical** y cambia la **semilla sonora**: la misma canción, renderizada de nuevo.
- Escucha un instrumento con **varias semillas** antes de juzgarlo: YuE2 lo mete cuando la semilla y la canción se lo permiten.
- **Fija** las tomas a las que siempre vuelves (cuatro en cada espacio); **Fijadas**, a la izquierda, las lista todas.
- **⋯** en una tarjeta es su menú de clic derecho, para un panel táctil.

## Consejos <!-- #tips -->

### Cuando algo sale mal <!-- #when-something-goes-wrong -->

| lo que ves | qué es | qué hacer |
|---|---|---|
| *Babel en la partitura* | la mitad musical escribió basura como partitura | fuerzas al verde, menos adaptadores en la mitad musical, o Directo |
| el cantante habla sobre un bucle | un adaptador de partitura instrumental demasiado fuerte para una canción cantada | mantenlo en 0.3–0.5 |
| *GPU0 está entrenando…* | una ejecución entrena en la tarjeta del propio estudio | espera, detén la ejecución o dale otra tarjeta al entrenamiento (Motor → GPU) |
| la página dice que el servidor no está disponible | el estudio se reinició | espera unos segundos; recarga la página (F5) tras una actualización |
| una toma suena metálica en los agudos | el zumbido de 25 tramas del VAE | Pulidor → Antizumbido al 80 % |
| la letra se aparta del texto | la mitad musical perdió las palabras | Pulidor → Revisión de la letra; *Regenerar desde…* el minuto en que se torció |
| el instrumento que pediste no está | YuE2 decide cuándo entra un instrumento, y la semilla decide mucho | el mismo prompt con una **semilla musical aleatoria**; escucha varias tomas antes de juzgar |
| el instrumento suena, pero no como el de verdad | lo que YuE2 sabe de él | una LoRA de instrumento (Entrenador LoRA) |

### Buenos hábitos <!-- #good-habits -->

- Conserva la **semilla musical** cuando una canción está bien y cambia solo la **semilla sonora** para oír su sonido de nuevo.
- Anota lo que funciona en la **Nota** de cada toma: la semana que viene no recordarás qué semilla era.
- Dale a cada proyecto su **espacio**, y bloquea los terminados.
- Entrena con lo que quieres oír: el adaptador aprende el sonido del conjunto, defectos incluidos.
