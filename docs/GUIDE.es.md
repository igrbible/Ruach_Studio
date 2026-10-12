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

- **Espacio**: el espacio en mano. La lista de tomas muestra solo ese, y cada toma nueva cae en él. *Todos los espacios* lo muestra todo. Donde la barra es estrecha (sin logo), la palabra *Espacio* también se va; el selector se queda.
- **ES** (las dos letras del idioma): la página en otro idioma, guardado con tus ajustes: English, Русский, Українська, Беларуская, Ελληνικά, Español, Italiano, Français, Português, Deutsch, 日本語, 中文, cada uno nombrado con sus propias palabras. Los números y las fechas siguen al idioma, y esta guía se abre en él.
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

- **El reproductor**, abajo: la forma de onda de lado a lado, una nube suave con la parte ya escuchada en el color de acento (un clic salta allí); debajo, la toma (su portada cuando la tiene, su título, las primeras palabras de su estilo, 👍 👎 ★), luego **aleatorio**, anterior, reproducir, siguiente y **repetir** (desactivado · toda la lista otra vez · esta toma otra vez, marcado con 1), luego el tiempo (un clic en la duración total lo cambia al tiempo restante), *reproducir al hacer clic* (un clic en una lista reproduce la toma de inmediato), *seguir reproduciendo* (cuando una toma termina, empieza la siguiente de la lista), *reproducir tomas nuevas* (una canción hecha aquí suena en cuanto está lista, si no suena nada), 🔔 *un sonido al terminar una ejecución* (dos notas hacia arriba cuando está lista, una sola vez para una cola de ejecuciones, dos hacia abajo cuando una falla; ninguno sobre una canción nueva que empieza sola), la **velocidad** (de 0.50× a 2.00×, conservando el tono), el volumen y un punto de estado (late mientras suena una toma). Lo que no necesitas en este momento queda tenue hasta que llega el puntero; cada icono dice qué hace cuando el puntero se posa sobre él. El puntero sobre la forma de onda muestra el tiempo al que saltaría un clic. Las teclas multimedia del teclado y de unos auriculares controlan el reproductor, y el panel multimedia del escritorio muestra la toma. ⏪ y ⏩ van a la marca anterior o siguiente cada 15 segundos desde 0:00, ← y → a las marcas de 5 segundos (con Shift, de 30). La píldora de estado al final derecho del reproductor (verde mientras suena una toma, del color del acento mientras se hace una) abre la toma o la ejecución; con Compose alzado sobre la sala, cambia el marco al de la toma. Un clic derecho en la forma de onda, la imagen o el título abre el menú de la toma, como en una lista. La forma de onda muestra las secciones de la toma: las etiquetas de la propia letra, cada una donde Whisper oye su primera línea (una vez por toma, cerca de medio minuto; sola en una máquina con dos tarjetas o más, si no desde el menú de la toma → *Find the sections by ear*); una toma aún no oída muestra las marcas de su partitura. Una línea fina al inicio de cada una, su nombre al pie; un clic junto a una línea va al inicio exacto de la sección; el puntero sobre la onda muestra una tarjeta con la sección, su tiempo y sus líneas tal como están escritas, iluminada la línea que suena ahí; una sección marcada con ? no se oyó con claridad. El puntero que se queda un momento sobre la onda sube sobre el reproductor el espectrograma de toda la toma (el interruptor del espectro junto a 🔔 lo apaga): tan ancho como la onda y a su mismo tiempo, cerca de un tercio de la altura de la ventana, con la tarjeta de la sección encima; en él las secciones, el centroide espectral como línea magenta (dónde está el peso del sonido: su brillo), el RMS en una franja abajo con la media de la toma discontinua, el cabezal; bajo el puntero su tiempo, el espectro de ese momento junto a la línea con su frecuencia más fuerte y su nota, y dentro de la imagen la frecuencia de ahí, su nota y su nivel. *Logarítmica* o *Lineal* en su cabecera; un clic va allí como en la onda; el puntero fuera o Esc lo bajan. La toma se mide una vez, en el laboratorio, como para su Espectro.
- **Dos filas o una**: la forma de onda sobre los botones del reproductor se queda donde las canciones se escuchan y se comparan (Creador, Pulidor, Bibliotecario); en el Escritor, el Artista, el Entrenador y el Motor el reproductor va en una fila, como en el Creador mientras un marco está alzado o la letra está por encima de todo. Tras recargar (F5) vuelve con su toma y su punto. En el Artista las tomas empiezan plegadas y el registro del servidor se coloca a la izquierda.
- **Las tarjetas en vivo**: en Engine → GPUs cada tarjeta tiene debajo una fila propia, su carga y su memoria una barra por segundo durante dos minutos, con su temperatura y su potencia; el registro del servidor desplegado muestra a su lado las tarjetas que tienen un papel, cada una con su papel encima, la del estudio enmarcada.
- **La línea al estudio** aparece junto al registro del servidor (*Forge · 85 ms*, o *aquí* en la misma máquina). Cuando el estudio está lejos, un me gusta, una favorita o una fijación se ven al instante y el estudio solo los confirma.
- **Tomas**, a la derecha: busca con palabras, `*` y `?`; *Favoritas*; pliega la columna con »; ⋯ para las acciones propias de la lista.
- **El registro del servidor** está justo encima del reproductor en cada sala: plegado, muestra lo último que dijo el motor (en rojo cuando algo falló); desplegado, diez líneas, *Seguir*, *Copiar* y el camino al registro completo en el Motor. Con un marco alzado sobre la sala, se coloca a la izquierda, lejos de los botones del marco. La flecha de su borde interior lo lleva al otro lado de la página, y cada sala recuerda su lado (el del Artista, el izquierdo). Su borde exterior se arrastra para ensancharlo, hasta 1200 px (el ancho se guarda; un doble clic devuelve el suyo); con las tarjetas al lado mide 920 px, su columna 390. El marco tiene dos vistas, **Server** y **Artist** (el registro propio del Artista: qué se pidió, qué respondió el laboratorio, el camino de cada tanda hasta su final), y cada sala abre la suya; **⧉** abre el registro en una ventana propia, sobre todas las ventanas en Chrome o para llevarla a otro monitor.

![El registro del servidor, desplegado](guide/log-dock.png)

## Creador <!-- #creator -->

### Composición: el formulario de la canción <!-- #compose-the-song-form -->

![Título, tonalidad, semillas y estilo](guide/compose-top.png)

- **Empezar por una idea**: una línea sobre la canción; el modelo de chat del Escritor redacta el título, el estilo y la letra (*Escribir el brief*).
- **Título**, **Tonalidad**: la tonalidad va a la partitura (`K:`). Con una partitura en el formulario, una tonalidad nueva la transporta allí; sin ella, la elección espera y transportará la partitura que llegue.
- **Semilla musical** y **Semilla sonora**: los dados de las dos mitades. Vacía es aleatoria; un número repite una toma. Conserva la semilla musical y cambia la sonora para oír la misma canción renderizada de otra manera. Están las primeras en *Muestreo y eliminación de ruido*. Junto a cada una, su **modo**: *Random (−1)* una semilla nueva cada vez (el campo vacío), *Random, fixed* una al azar puesta y guardada, *Fixed* la escrita, *Next* y *Previous* la mueven tras cada Generate más allá de las semillas usadas (las versiones para la música, las variaciones para el sonido). La semilla del Artista tiene los mismos modos.
- **Estilo**: idioma, género, voz, instrumentos, tempo. *Guardar estilo…* lo guarda con un nombre. **♂** y **♀** en su cabecera ponen *male vocals* o *female vocals* en él (en lugar de la palabra del otro género, si no antes del BPM); el encendido quita su etiqueta.

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
- **Números de línea y marcas**: el cuadro de la letra numera sus líneas como un editor de código (una línea partida, una vez, en su primera fila; *Line numbers* bajo el cuadro los apaga). **Alt+K** marca la línea del cursor o le quita la marca, **Alt+J** va a la siguiente marca, **Alt+Shift+J** a la anterior, **Alt+Shift+K** las quita todas; el número de una línea marcada es ámbar, y las marcas siguen a sus líneas cuando escribes encima. Cada [etiqueta] queda bajo una capa ámbar fina. La letra del Escritor tiene lo mismo. Como en mcedit: **Alt+O** también quita las marcas, **Alt+L** va a una línea por su número, **Ctrl+Y** borra la línea, **Alt+↑** y **Alt+↓** mueven la línea (o las líneas seleccionadas) con su marca. *Keys* bajo el cuadro las enumera todas, y la etiqueta LYRICS del Escritor las dice al pasar el puntero. **⤢** junto a Lyrics levanta el cuadro sobre todo, al 60 % del ancho de la pantalla y cuatro décimas más grande, con todo esto y con sus propios −, + y ⟲ para el tamaño del texto (se guardan en este navegador); Esc lo devuelve. Junto a **⤢**, dos botones guardan la letra como texto plano: el primero la guarda en un `.txt` con el nombre del *Título*, el segundo pone un `.txt` (UTF-8) en su lugar (pregunta antes si el cuadro tiene palabras, y **Ctrl+Z** en el cuadro las devuelve; un *Título* vacío toma el nombre del archivo).
- **Corchetes revisados**: un «[» sin cerrar en su línea, un «]» sin ninguno abierto, un «[» dentro de una etiqueta y una etiqueta vacía tiñen de rojo el número de su línea, y *Tags not closed or astray* bajo el cuadro va de uno al siguiente; un paréntesis que queda abierto o se cierra sin abrir es ámbar (un eco puede seguir). Un «[» que aún se escribe se deja en paz hasta que el cursor sale de su línea. **Generar pregunta antes** cuando una etiqueta está rota: lo que sigue a un «[» sin cerrar puede perderse en la canción y su final torcerse; *Go to the line* o *Generate as it is*.
- **Acentos fuera de sitio**: una marca que no está sobre una vocal — al inicio de una línea, tras un espacio o un signo, sobre una consonante, una segunda en la misma letra, o un ´ suelto en su lugar — muestra un botón rojo bajo el cuadro (*Stress marks off a vowel*) y una marca ante la cuenta de la línea; el botón las selecciona una a una. Una palabra con dos marcas recibe uno ámbar: ¿a propósito o un desliz? En la cuenta, la marca de acento no es sílaba; ע y una vocal latina dentro de una palabra rusa sí. Una sílaba es un sonido vocálico, una nota, y cada idioma se cuenta con sus reglas: en ruso, ucraniano y bielorruso, una letra vocal (y como el contador mide el tiempo de una línea, una palabra sin vocal — с, в, к, з, й, ў — y una oclusiva ante una africada dentro de una palabra — глу-п-цо́в — toman un tiempo propio, dibujado más claro: «Я же вижу глупцо́в с приду́рческим планом» son 12 sílabas y 2 de esos tiempos, 14); en griego αι, ει, οι, ου, αυ, ευ son una (la diéresis o el acento las separan: τσά-ι); en español e italiano una i o u débil se une a su vecina (cie-lo, cuo-re) y dos fuertes son dos (po-e-ta); en inglés una e final muda no cuenta (make, pero ta-ble); el hebreo cuenta sus puntos vocálicos; el chino, el japonés y el coreano, un signo por sílaba. Las palabras latinas se cuentan como inglesas, españolas o italianas: por el nombre del idioma en el estilo, si no, por las palabras pequeñas de la propia letra.
- **Ctrl+F** en la letra o en el estilo (y en los cuadros del Escritor) busca solo en ese cuadro: Enter y Mayús+Enter recorren las coincidencias, Esc desde el campo de búsqueda devuelve el cursor con la coincidencia seleccionada; desde el propio cuadro (si hiciste clic en otro sitio) cierra la búsqueda y deja el cursor donde está, y lo que escribas mientras tanto no mueve la vista. La tilde de acento no estorba, ё es е, y о y а encuentran también ע y las o y a latinas. **F4** o **Ctrl+H** abre una segunda fila para reemplazar: **Intro** pone las palabras nuevas en lugar de la coincidencia actual y pasa a la siguiente, **Ctrl+Intro** (o *All*) reemplaza todas a la vez, y un solo **Ctrl+Z** en el cuadro lo deshace; **Aa** (**Alt+C**) busca solo con las mayúsculas y minúsculas tal como se escriben.
- **Etiquetas tras «[»**: un «[» al principio de una línea de la letra (del Creador o del Escritor) abre las etiquetas de sección, como un editor de código sugiere palabras, en el orden en que las recorre una canción, de Intro a End. Las letras tras el «[» estrechan la lista (también con la distribución rusa o ucraniana), un número numera la etiqueta (`v2` es `[Verse 2]`), y si la letra numera sus estrofas se ofrece la siguiente. ↑ ↓ eligen, Enter o Tab ponen la etiqueta en su propia línea (Ctrl+Z la deshace), Esc o `]` cierran la lista. Intro, Outro y End que ya están en la letra quedan en su sitio, tenues, con su línea: ↑ ↓ llegan a ellas y se lee qué son, pero no se ponen dos veces. Ctrl+Espacio abre la lista, y al principio de una línea escribe el propio «[». La lista va en dos columnas: las etiquetas y, a su lado, qué es la que tienes en la mano (con nuestras palabras, según la guía de secciones de canciones de Genius) y cuántas veces la escriben los 110 ejemplos oficiales; el cuadro conserva su tamaño al estrecharse la lista. Las secciones que ninguno de ellos escribe llevan la marca TEST. **Una segunda y una tercera etiqueta** en una línea: un «[» escrito justo después de la etiqueta de una línea recibe su espacio solo y ofrece las etiquetas que no son secciones (quién canta, como lo escriben los ejemplos; Female Vocals, Break y Silence marcadas TEST); Intro la pone en la misma línea, con su «…» seleccionado para tus palabras; Ctrl+Espacio escribe « [» también ahí.
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
- **Tu propia partitura**: una partitura ABC, seguida en Plan completo y en Solo melodía. Transponla (a la más cercana, hacia arriba o hacia abajo), mueve una voz por grados de la escala, importa un archivo MIDI (una línea melódica por voz), exporta MIDI o marcadores para un DAW, carga un ejemplo, vuélvela instrumental. **Generate** con una partitura aquí pregunta primero: sobre esta partitura o una nueva (el campo se vacía y el modelo de la canción escribe una). La partitura recuerda los adaptadores y las fuerzas de música con que se escribió (un plan, la partitura propia de una toma); cuando los de ahora difieren, lo dice una línea bajo ella y la propia pregunta: con otras fuerzas la música puede apartarse de la partitura, sobre todo en Industrial Rock e instrumentales. En Full la partitura sigue abierta mientras tenga algo.
- **Recitar la letra sobre una partitura** (*Lay the lyrics on this score…*, bajo la partitura cuando se lee): el narrador del promo del estudio, para tus palabras. Cada línea va sobre los compases de la partitura, una sílaba una corchea (una semicorchea, como se dice el rap, donde con corcheas quedarían líneas fuera) en un tono del acorde de su compás, una respiración tras una coma y un punto, la última sílaba de la línea una negra más abajo; cada sección empieza en una frase de dos compases tras un compás de silencio, o tras un vocalise si lo marcas. Los instrumentos, los acordes, la tonalidad y el tempo se quedan; las secciones de la partitura siguen tus etiquetas, con una intro y un outro alrededor. Para spoken word, lecturas y rap sobre una base: haz la base, *Escribirla a partir del sonido*, y luego esto; pregunta antes, y Ctrl+Z en cada cuadro devuelve el texto anterior.

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
- **Hacer de nuevo**: *Nueva toma* (una toma nueva con la misma petición), *Usar como base* (la petición de vuelta al formulario), *Volver a renderizar el sonido* (la misma música, sonido nuevo), *Regenerar desde…* (conservar el comienzo, escribir el resto de nuevo), *Transcribir esta toma*, *Recortar al texto* (cortar una cola tras la última línea cantada), *End at…* (la toma termina en el momento que elijas, con un fundido de sus últimos 2 s; desde sus latentes guardados, en segundos), *Fade in…* (los primeros segundos suben desde el silencio, 2 s si no dices otra cosa; del mismo modo).
- **Pulidor**: *Espectro*, *Revisión de la letra*. **Archivos**: la petición y la partitura. *Loop…*: 1, 2, 4 u 8 compases sobre las barras de compás de la partitura desde el compás donde está el reproductor, sin costura (su final fluye a su inicio), guardado como WAV con su tempo y tonalidad en el nombre.
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
- **El ancho de la lista**: arrastra el borde entre la lista y el documento (← → desde el teclado, un doble clic para su ancho de origen).
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

**Comparar todas** (en la fila del original, o *Comparar* en cualquier rama) abre todas las versiones en un solo reproductor, como SUNO cambia de versión: el original, el que pasó por el antizumbido, las remasterizaciones, los reescalados, los stems. Un clic en otra versión, o su número (1–9), la reproduce **desde el mismo segundo**; la barra espaciadora reproduce y pausa, ← → mueven cinco segundos, Esc cierra. También está en él, tras el original, la misma música en otras tomas: sus re-renderizados con otro VAE u otra semilla sonora, cada uno con su VAE, su semilla y cuándo se hizo; una toma marcada con «no me gusta» no aparece.

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

La sala que pinta: una portada para cada toma, un 16:9 para su vídeo, un 9:16 para un short, desde tus palabras, desde una imagen tuya o desde ambas. El formulario a la izquierda, el escenario en el centro, la biblioteca a la derecha.

### Imágenes para tus canciones <!-- #pictures-for-your-songs -->

Escribe con frases lo que ves para la canción: Krea 2 Muse y Qwen-Image leen el prompt como una descripción, no como una lista de etiquetas. Primero lo que hay en la imagen, luego la luz, los colores y la técnica (óleo, tinta, una fotografía), y al final *no text* cuando no quieras letras en ella. **From the take** pone el prompt con el que se pintó la portada de la toma que tienes en la mano, o uno hecho de su título y su estilo, para tener por dónde empezar.

**Formas**: **1:1** (1280 × 1280) para la portada, **16:9** (1920 × 1080) para un vídeo, **9:16** (1080 × 1920) para un short. Las formas de una pulsación comparten su semilla, así que salen como una serie: la misma escena con los mismos colores, cada una compuesta para su propio marco y no una sola imagen recortada tres veces. **Variations** pinta también las semillas siguientes (la semilla, la semilla + 1, …), cada una en todas las formas.

**Seed**, con su modo al lado: **Random** (−1: una semilla nueva en cada pulsación, el campo vacío), **Random, fixed** (una semilla al azar puesta al momento y guardada), **Fixed** (la escrita), **Next** y **Previous** (tras una pulsación, el campo pasa más allá de las semillas que usaron sus variaciones). Un número en el campo es esa semilla (Random pasa a Fixed); un campo vaciado es una semilla nueva en cada pulsación (Fixed pasa a Random); ⟲ es Random otra vez. La semilla de una imagen que te gustó la vuelve a pintar: cada tanda muestra su semilla, y **To the form** la devuelve con el prompt.

**Tres columnas**: a la izquierda el prompt y sus mandos, en el centro el escenario (allí se revela la tanda que se pinta, su progreso sobre el escenario; si no, la imagen elegida, sus botones debajo, y los datos de su tanda con el prompt en una ayuda a su lado, sobre la biblioteca, mientras el puntero está en la imagen), a la derecha la biblioteca; los bordes entre ellas se arrastran (← → desde el teclado, un doble clic para su ancho de origen). Las elecciones de la columna se estiran con ella y nunca quedan más estrechas que los nombres de los pintores. Desde una ventana de 920 px de alto la sala cabe entera en ella: la página se queda quieta, el formulario y la biblioteca se desplazan cada uno por su cuenta, y la fila de Draw se queda al pie del formulario.

**Live preview** (activo por defecto): el sitio de la imagen que se pinta muestra cada uno de sus pasos, del ruido a la imagen, a un octavo de su tamaño y sin el decodificador, así que no cuesta nada; apagado, el sitio espera la imagen terminada. Una barra sobre el escenario, de lado a lado, sigue la tanda, imagen a imagen y paso a paso.

**Dos tandas a la vez**: mientras va una, **Draw** pide la siguiente, que espera detrás (también Ctrl+Enter); **Stop**, junto a Draw mientras va una tanda, termina la que pinta (si no, la que espera sale de la cola); las imágenes que acabó se quedan.

### Los pintores <!-- #the-painters -->

**Krea 2 Muse** de Stable Yogi, un fine-tune de Krea 2 Turbo (Krea 2 Community License): **Q4** en una tarjeta con 12,5 GB libres, **Q8** (más fina) con 18,5 GB. Como modelo Turbo, pinta en sus propios pocos pasos sin guidance: unos 35 s por imagen en 1:1 y 47 s en 16:9 o 9:16 en una RTX 3090, y unos 25 s más de carga por pulsación.

**Qwen-Image 2512** (Apache-2.0) desde un GGUF en **Q4** (una tarjeta de 15,5 GB) o **Q6** (20 GB), o un **fine-tune fp8** suyo (22,5 GB: los archivos únicos de ComfyUI puestos en `artwork/Qwen-Image-2512/checkpoints/`, elegidos bajo el pintor); alrededor de medio minuto por imagen con Lightning, tras un minuto o dos de carga. **Qwen-Image 2.1**, bajo la Qwen Research Licence (solo investigación y evaluación: no para una portada que vendes), pinta desde palabras y edita una imagen de referencia con las palabras del prompt; una máscara y *Paint around it* piden Krea 2 o Qwen-Image 2512. En una tarjeta que no contiene entero ni su codificador de texto ni su pintor (una tarjeta de 16 GB, o una tarjeta bajo un límite de VRAM menor), ambos fluyen desde la RAM: bajo un límite de 15.5 GB en una 3090, 135 s desde palabras con 4.1 GB en el pico, 129 s editando con 7.9 GB.

Cada pintor aparece solo cuando sus archivos están aquí; a los que faltan los nombra la nota bajo la elección del pintor. **Engine → Models and LoRAs → Qwen painters** descarga Qwen-Image 2512 en Q4 (31 GB) o Q6 (34,5 GB) con Lightning, y Qwen-Image 2.1 (33,1 GB), cada uno preguntando antes con su tamaño (2.1 también con su licencia). Desde una terminal: `heresy/fetch-heresy.sh --qwen 2512-q4`. **Get painters and adapters…** bajo el pintor muestra en la propia sala lo que el estudio puede traer para el Artista: Krea 2 Muse, los pintores Qwen, cuatro fine-tunes fp8 de Qwen-Image 2512 (Jib Mix Qwen, IntoRealism Qwen, Real-Qwen-Image y el propio 2512, 20,4 GB cada uno, compartidos en el repositorio de modelos del estudio con permiso de sus autores) y siete adaptadores, cada uno con su tamaño, aquí o **Fetch**.

**Qué tarjeta pinta**: una pulsación espera en la cola del laboratorio una tarjeta con sitio, como las portadas de las tomas y los stems; mientras espera, **Off the queue** la retira. Una tarjeta que nada más usa toma una tanda cuya necesidad cabe en su memoria menos 512 MiB (la parte del propio runtime de CUDA); una tarjeta en uso la toma cuando su memoria libre cabe la necesidad. Un pintor Qwen-Image 2512 o Krea 2 Muse que ninguna tarjeta de aquí puede sostener entero trae en cambio sus bloques de la RAM: los que caben se quedan en la tarjeta, los demás llegan según se necesitan, y la imagen es la misma, más lenta en lo que el bus no puede ocultar (con cuatro adaptadores en una tarjeta de 24 GB, cerca de un sexto; con todos los bloques desde la RAM, el Q4 ocupa 2,2 GB de la tarjeta, así que lo pinta una de 8 GB); otro pintor que ninguna tarjeta puede sostener se rechaza al instante, con las cifras y el pintor que cabría. Qwen-Image lee el prompt con su codificador de texto (Qwen2.5-VL-7B, 15,5 GB) en la tarjeta cuando su espacio libre lo cabe, si no en el procesador, antes de que llegue el pintor: la imagen es la misma de las dos maneras.

**El filtro de contenido**: cada imagen pasa por el filtro que pide la licencia de Krea 2, la pinte quien la pinte (la regla del estudio para todo pintor): la que marca no se guarda, y la tanda lo dice.

### Lightning <!-- #lightning -->

**Qué es**: Lightning (lightx2v, Apache-2.0) es un adaptador que enseña a Qwen-Image 2512 a pintar en pocos pasos sin guidance: el largo camino guiado del propio modelo, destilado en 8 pasos. Su archivo vive en `artwork/Qwen-Image-2512/lightning/` (`Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors`, 0,85 GB) y llega con la descarga de los pintores Qwen.

**Cómo lo pone el estudio**: con Lightning encendido, el pintor lo carga como un adaptador más bajo tus propios LoRA, con su fuerza: **1.0** para los GGUF Q4 y Q6 (la base de la que se destiló, en los 8 pasos que dan sus autores) y **0.55** para un fine-tune fp8, en 12 pasos (un fine-tune se ha alejado de la base, y Lightning a toda fuerza tiraría de él hacia atrás; el ajuste del propio Viktor en ComfyUI). La programación pasa a ser la de Lightning: un desplazamiento de log 3 a cualquier tamaño, como se entrenó. La guidance queda apagada (true CFG 1): una pasada del modelo por paso.

**Con él apagado**, el pintor toma el camino propio de 2512: 30 pasos por defecto (de 10 a 60) y **guidance** 4 (true CFG con su negativo vacío: dos pasadas por paso). Sesenta pasadas contra ocho: el pintado en sí tarda unas siete veces más, la carga igual, y da el detalle y la luz de un realismo acabado.

**Sus valores por defecto**: los GGUF Q4 y Q6 pintan con él (bocetos, tarjetas más pequeñas); un fine-tune fp8 pinta sin él salvo que lo enciendas (realismo acabado); la portada propia de una toma se pinta con él (*Engine → Artwork*). La regla detrás: Lightning para bocetos y portadas, no para realismo profesional.

**El interruptor**: en Sampling, con su fuerza al lado; encendido, los pasos van de 4 a 16 y Guidance se oculta; apagado, Guidance aparece. Sin su archivo no hay interruptor, y 2512 pinta a su manera. Krea 2 Muse no tiene ninguno: como modelo Turbo, sus pocos pasos son los suyos. La fuerza se guarda para cada pintor; la suma de tus adaptadores (*Together*, más abajo) no cuenta Lightning.

**Lo que cuesta**: en una RTX 3090 a 1328 × 1328, Qwen-Image 2512 con Lightning pinta en unos 30 s por imagen en Q4 (14,3 GB en el pico) y 32 s en Q6 (17,6 GB); un fine-tune fp8 a 0.55 y 12 pasos en 37 s (21,0 GB). La portada de una toma con Lightning tardó cerca de minuto y medio con la carga y el prompt.

### Samplers y programaciones <!-- #samplers-and-schedules -->

**Sampling** bajo el pintor, plegado, con sus valores en su resumen: los pasos, el sampler y la programación, guardados para cada pintor; **Reset** devuelve los del pintor. Los pasos: Krea 2, y Qwen-Image 2512 con Lightning, de 4 a 16; si no, de 10 a 60; un número fuera del rango se queda en su borde. La estimación de tiempo del formulario cuenta las pasadas del sampler.

**Los samplers**: en cada paso el modelo dice hacia dónde está la imagen; el sampler decide cómo ir hasta allí.

- **Euler**: una pasada por paso, el paso sencillo; la referencia, y con el que se destiló Lightning.
- **Euler SDE**: Euler con un poco de ruido fresco en cada paso: más grano, algo menos de fidelidad.
- **ER-SDE**: un resolvedor estocástico de tercer orden (ER-SDE-Solver-3), una pasada por paso, guardando los dos pasos anteriores: más fino que Euler en el mismo tiempo.
- **RES 2s** y **RES 3s**: los métodos de un solo paso del resolvedor exponencial refinado, dos y tres pasadas por paso, devolviendo la mitad del ruido tras cada uno; sus gemelos **ODE** no devuelven ninguno, así que una semilla pinta una imagen, la más cercana al camino exacto.
- **Heun++** (heunpp2): tres pasadas por paso donde puede, luego dos, y una al final.
- **Exponential Heun** (exp_heun_2_x0, y su SDE): un método exponencial de segundo orden, dos pasadas por paso; el SDE devuelve el ruido.

Un sampler de dos o tres pasadas por paso cuesta dos o tres veces el tiempo de Euler con los mismos pasos; en los 8 pasos de Lightning los órdenes altos cambian el detalle, no la composición. Frente al camino exacto de un flujo de juguete en 8 pasos se ordenan como dicen sus órdenes: Euler 0,138, Heun++ 0,111, Heun exponencial 0,084, RES 2s 0,058, RES 3s 0,046 (el error: menos es más cerca).

**Las programaciones** dicen dónde se gastan los pasos, de todo el ruido a nada:

- **Simple**: por igual en el tiempo propio del pintor, con su desplazamiento.
- **Karras** y **Exponential**: más pasos con poco ruido, para el detalle.
- **Beta** y **Beta 57**: densas en los dos extremos, escasas en el medio (Beta 57 con 0,5 y 0,7).
- **KL optimal**: el espaciado que Align Your Steps halló óptimo.
- **SGM uniform**: uniforme en el tiempo, sin su último paso.
- **Bong tangent**: dos pendientes de arcotangente, de todo el ruido a la mitad y de la mitad a nada.

**Lo que mostraron dos matrices** (54 imágenes a través de un laboratorio de prueba, un prompt, una semilla): cada sampler y cada programación pintaron una imagen entera con Krea 2 Muse. En Qwen-Image 2512 **con Lightning, Karras, Exponential y KL optimal pueden pintar el motivo dos veces** (dos faros donde se pidió uno): con Lightning quédate con Simple, Beta, Beta 57, SGM uniform o Bong tangent. **Sin Lightning, Euler SDE pinta Qwen suave y brumoso**: Euler, ER-SDE o RES guardan el detalle. El formulario dice ambas cosas cuando vienen al caso.

**De dónde vienen**: escritos para el estudio a partir de los artículos de los métodos y las fórmulas de ComfyUI (GPL-3.0, que la AGPL del estudio puede aceptar); los de RES4LYF se leyeron solo por sus matemáticas, porque su licencia prohíbe servicios comerciales: nada de su código está aquí; Heun++ es de Carzit (MIT).

### Regiones <!-- #regions -->

**Regiones** bajo *Muestreo*, plegadas: hasta tres partes del encuadre, cada una con un lugar (una mitad, un tercio, un cuarto o el centro; un pequeño mapa al lado muestra dónde) y sus propias palabras. En cada paso se le pregunta al pintor una vez más por cada región, con el prompt y las palabras de la región, y sus respuestas se mezclan por cajas de borde suave, como hace Latent Couple; el resto del encuadre sigue solo al prompt. Así el prompt dice toda la escena y una región lo que está en ella: *dos animales en un claro nevado del bosque*, luego *un zorro rojo* en la mitad izquierda y *un búho blanco sobre un tocón* en la derecha. Cada región cuesta una pasada entera más por paso (en una 3090 a 16:9, Krea 2 Q4: 48 s sin ellas, 137 s con dos regiones; Qwen-Image 2512 fp8: 141 y 281 s). Se guardan en este navegador; una región sin palabras no se envía; **Otra vez** pinta con las de su propia ejecución. Krea 2 y Qwen-Image 2512; Qwen-Image 2.1 edita por palabras y pinta sin ellas.

### Adaptadores <!-- #adapters -->

**LoRA** bajo el pintor: los adaptadores de su familia (Krea 2, Qwen-Image 2.1, Qwen-Image 2512, SDXL), hasta cuatro, cada uno con su fuerza (de 0 a 1.5); un clic en una de sus palabras clave la pone en el prompt. **Add…** abre la biblioteca: las carpetas a la izquierda, las tarjetas con sus imágenes, una búsqueda. Los adaptadores viven en la carpeta del estudio `artwork/loras/<familia>/` (`krea2`, `qwen-image-2.1`, `qwen-image-2512`, `sdxl`): cualquier carpeta dentro se vuelve un grupo, y una imagen junto a un archivo con su nombre (`NAME.jpg`, `NAME.png`, `NAME.preview.png`) se ve en su tarjeta. Tómalos de Civitai por su modelo base (Krea 2, Qwen, SDXL 1.0) y deja ahí el `.safetensors`; **Look up on Civitai** envía solo el SHA-256 de cada archivo y guarda la respuesta junto a él (`NAME.civitai.info`: su nombre, su modelo base y sus palabras clave, y su primera imagen marcada como segura cuando no tiene una). También se lee lo que el LoRA Manager de ComfyUI o Stability Matrix escribieron junto a un archivo. Un adaptador hecho para otro modelo, que no alcanzaría ninguna capa del pintor, detiene la tanda y lo dice. Un clic derecho en la fila de un adaptador lo **silencia** (**Mute**): se queda en la lista con su fuerza y sale de la tanda (**Unmute** lo devuelve); un adaptador a cero tampoco se carga. Los siete adaptadores que sus autores dejan compartir llegan desde **Get painters and adapters…**.

**Together**: desde dos adaptadores, una barra bajo ellos da la suma de sus fuerzas en la carretera del Creador: verde hasta 1.2, ámbar hasta 1.8, rojo más allá. Los adaptadores apilados se suman, y pasado cerca de 1.8 una imagen se quema (colores y bordes pasados de rosca) por modesto que sea cada uno; las zonas son una primera medida para imágenes, a ajustar a ojo. Arrastra la barra para mover todos a la vez, cada uno en proporción a donde estaba.

### Una imagen desde la que pintar <!-- #a-picture-to-paint-from -->

**Reference picture**: una imagen desde la que pintar, como image to image: suéltala en su sitio bajo el prompt, pégala (Ctrl+V), elige un archivo o toma la imagen del escenario con **As reference**. **How much it may change** dice cuán lejos de ella empieza la pintura: 0.3 la deja casi como está, 0.6 conserva su composición y cambia su materia, 0.9 pinta la escena del prompt con su luz y sus colores, 1.0 pinta de nuevo. La imagen cubre cada forma y se recorta desde el centro; **Again** pinta desde la de la tanda; ✕ vuelve a pintar desde el ruido.

**Usarla** bajo la imagen dice cómo: *para pintar desde ella* (como arriba, con el pintor del formulario, hasta donde diga *Cuánto puede cambiar*), *para editar con palabras* o *solo por su estilo*, ambos con Qwen-Image 2.1 cuando está aquí (si no, apagados). Editada con palabras, la escena se queda y el prompt dice qué cambia (*el mismo faro en una noche de invierno nevada*: la nieve cayó donde debía, la torre y las rocas se mantuvieron). Por su estilo, la escena del prompt se pinta con la técnica, la pincelada, la paleta y la luz de la imagen, sin nada de su tema (el faro al óleo dio *un zorro rojo en un bosque nevado bajo la luna* con su pincelada). En ambos casos la ejecución es de Qwen-Image 2.1 sea cual sea el pintor del formulario: no se envían el modelo, el muestreo, los adaptadores, la máscara ni el lienzo del formulario, y rige su licencia (solo investigación y evaluación). Unos dos minutos por imagen en una 3090.

**Mask…** a su lado pinta sobre la imagen qué repintar (Paint, Erase, el pincel, Invert, Clear): el resto queda exactamente como estaba, como inpainting. **Paint around it** pone la imagen entera en el centro de cada forma y pinta de nuevo los bordes (una portada cuadrada en 16:9 o 9:16), como outpainting. **The take's cover** toma la portada de la toma elegida a la derecha. Con una máscara o **Paint around it**, cuatro opciones bajo la imagen: **Grow** (la máscara crecida tantos píxeles, o encogida), **Edge** (qué tan suave es su borde), **Soft** (repintado suave, como la differential diffusion: donde el borde es gris la imagen cambia solo en los últimos pasos, sin costura) y **Grain** (cuánto de la pintura nueva toma la parte que se conserva: su grano y su luz cosidos a lo nuevo; 0 la deja exacta).

**Canvas…** junto a **Mask…** abre el lienzo, como el de InvokeAI: el marco de cada forma, una pestaña arriba que dice cómo se pintará (**from it**: la imagen cubre el marco y la tanda pinta a partir de ella, image to image con la fuerza pedida; **around**: la parte del marco que la imagen deja vacía se pinta a su alrededor). En el tablero **Move** (V) arrastra la imagen, o una esquina para escalarla con la esquina opuesta quieta; **Brush** (B) y **Eraser** (E) pintan encima la máscara de repintado; **Hand** (H, o Espacio pulsado) mueve el tablero; la rueda hace zoom, Alt+rueda escala la imagen alrededor del puntero, las flechas la empujan un poco. A la derecha las capas (la máscara con **Invert** y **Clear**, la referencia con su opacidad solo en el tablero) y su lugar en números (ancho, X, Y en partes del marco); arriba **Fit**, **Fill**, **Centre** y **Same in all** (la imagen igual de grande en píxeles en los otros marcos), deshacer y rehacer (Ctrl+Z). **Done** guarda los lugares con la referencia y la máscara en el formulario; bajo la fuerza el formulario dice cómo queda cada forma, y ✕ lo saca del lienzo.

### El escenario y la biblioteca <!-- #the-stage-and-the-library -->

Un clic en una imagen la pone en el escenario con su tanda debajo; un clic en la imagen del escenario (o un doble clic en una imagen) la abre sobre la página con su propia forma (← → recorren la tanda, o la galería cuando se abrió desde allí; Esc cierra), con ★, **To the form**, **Set as cover** y **Download** (PNG, tamaño completo).

**Runs o Gallery**: las tandas muestran cada pulsación de Draw con su prompt y su semilla, las más nuevas arriba; la galería muestra todas las imágenes de todas las tandas en una sola cuadrícula, las más nuevas primero, por forma (1:1, 16:9, 9:16) o con estrella (☆ en una imagen le pone estrella), en tres tamaños, en mosaicos iguales: columnas iguales, cada mosaico la misma caja, cada imagen entera dentro.

**Compare**: el **Compare…** del escenario y luego la otra imagen en la biblioteca: las dos quedan una sobre otra bajo un divisor que arrastras (← → lo mueven), o una al lado de la otra (S); X las intercambia, Esc cierra. **Ctrl** (o ⌘) **+ clic** elige imágenes y **Shift + clic** una serie: la barra de la biblioteca las marca con estrella o las manda a la papelera de una vez (Esc las suelta).

**El menú de una imagen**: un clic derecho en cualquier imagen (de una tanda, de la galería, del escenario, la que está sobre la página): **Over the page**, **To the stage**, **To the form** (su prompt, su semilla y su forma), **All of it to the form** (también su pintor, su fine-tune, su sampling y sus adaptadores: Draw vuelve a pintar esa imagen), **As reference**, **Compare…**, **Set as cover**, **Upscale** (2K o 4K, con los tamaños que dan), **Star it**, **Pick it**, **Copy the prompt**, **Copy the seed**, **Download**, **The file in a new tab**, **Its run** (la vista Runs, su tarjeta iluminada), **To the trash**. Una tanda que se revela en el escenario no tiene menú. Sobre la página el menú se pone sobre la imagen y tiene las teclas mientras está abierto: Esc cierra el menú, el siguiente Esc la imagen.

### Upscale <!-- #upscale -->

**Upscale…** en el escenario hace la imagen **2K** o **4K**: su lado largo 2560 o 3840 px (una portada cuadrada 2560² o 3840², un 16:9 2560×1440 o 3840×2160) con un upscaler (ESRGAN, DAT, HAT, SPAN y sus parientes, los lee spandrel) elegido en la fila que se abre (se recuerda; primero 4x_Nomos8kDAT si está); el consejo de cada botón dice el tamaño que da, y para una imagen ya tan grande el botón está apagado. El modelo pasa tantas veces como pida el tamaño (dos como mucho) y el resultado se lleva al tamaño exacto. La imagen grande es una tanda propia junto a su fuente, menos de un minuto en una 3090; **Again** amplía la misma imagen otra vez, quizá con otro modelo. Los upscalers viven en `artwork/upscalers/` del estudio (`.pth` o `.safetensors`, también en carpetas); OpenModelDB lista cientos: mira la licencia de cada uno.

**Segunda pasada…** a su lado repinta la imagen más grande, como hace el flujo de ComfyUI de Viktor tras su primera pasada: la imagen agrandada **×1.5** o **×2** (por el píxel más cercano, como en el suyo) y pintada de nuevo por el pintor de su propia ejecución, su ajuste fino, sus adaptadores, su prompt y su semilla, desde parte del camino (*Cuánto puede cambiar*: 0.3 guarda el dibujo y añade detalle, 0.5 afina su materia, 0.7 repinta sus formas). Los pasos, el muestreador, el programa y Lightning son los del formulario cuando el formulario pinta con el mismo pintor, si no los de la ejecución: su receta da a la segunda pasada muchos pasos y nada de Lightning. Un 16:9 de 1920×1080 sale en 3840×2160. Medido en una 3090: Krea 2 Q4 a 2560² en 86 s (14.5 GB en el pico), Qwen-Image 2512 fp8 a 3840×2160 en 220 s con 12 pasos y Lightning (22.9 GB). No para Qwen-Image 2.1, que edita por palabras; sin máscara ni lienzo. **Ruido añadido** en su fila (0.6 primero, como en el suyo) y bajo el *Cuánto puede cambiar* de una referencia (0 primero) es el InjectLatentNoise de su flujo: ruido fresco sobre la imagen antes de que la pintura parta de ella; 0.3 trae grano y detalle nuevos, por encima de 1 las formas de la imagen empiezan a romperse.

### Una portada para la toma <!-- #a-cover-for-the-take -->

Una imagen cuadrada tiene **Set as cover**: se vuelve la portada de la toma que tienes en la mano (elígela a la derecha), en su tarjeta, en el reproductor y en su MP3. La portada que tenía se guarda junto a la toma (`artwork-removed/`), como la guarda un repintado, y la otra letra de un par A/B recibe también la nueva cuando no tiene una propia.

**La portada propia de una toma** (*Draw artwork* en su menú, en el Bibliotecario, para una toma o para muchas) la pinta el pintor de **Engine → Artwork**: según las tarjetas (Krea 2 Muse Q4 desde 16 GB, si no SDXL), o el que elijas: Krea 2 Muse Q4 o Q8, SDXL CyberRealistic, y los pintores Qwen que tiene esta máquina: Qwen-Image 2512 Q4 o Q6 y cada fine-tune fp8 con Lightning, Qwen-Image 2.1 con su licencia dicha (no para una canción que se vende). Un fine-tune elegido que ya no está aquí cede el sitio a la elección según las tarjetas, y la portada dice quién la pintó.

### La papelera del Artista <!-- #the-artist-s-trash -->

Las tandas viven en la carpeta `artist/` del estudio. **Trash** en una tanda la mueve a `trash/artist/`; el **Trash** del escenario aparta una imagen. La vista **Trash**, junto a Runs y Gallery, muestra primero las imágenes apartadas, cada una con **Restore** y ✕, y **Restore all**; luego las tandas de la papelera, cada una con **Restore** y **Delete for good**; **Wipe out** en su cabecera borra todo lo que muestra. Cada borrado pregunta antes y no se deshace.

**Trash (Art)** en la columna del Bibliotecario, bajo Out of sight, guarda el arte apartado en una sola lista: las tandas del Artista en la papelera, las imágenes apartadas y las portadas quitadas de las tomas (por un repintado, por Remove, por una portada nueva), cada una con su imagen y lo que pesa. Márcalas para devolverlas (una portada vuelve a su toma, y la que tiene ahora queda en su lugar) o para borrarlas para siempre, preguntando antes; sin ninguna marcada, **Wipe out the art's trash**. Las portadas de un espacio de trabajo congelado se quedan como están.

### El registro del Artista <!-- #the-artist-s-log -->

El marco del registro del servidor tiene dos vistas, **Server** y **Artist**, y cada sala abre la suya: la sala del Artista, la del Artista. El registro del Artista, guardado en este navegador (sus últimas 400 líneas), dice qué se pidió (el pintor, el fine-tune, las formas, la semilla, el sampling, los adaptadores), qué respondió el laboratorio (un rechazo con sus propias palabras), el camino de cada tanda hasta su final (espera y por qué, pinta en la GPU N, hecha, detenida, fallida y por qué) y las líneas propias del laboratorio sobre el Artista. **Copy** toma las líneas de la vista; plegado, el marco dice la última línea de la vista. **⧉** abre el registro en una ventana propia, con las dos vistas en espejo: en Chrome queda sobre todas las ventanas (Document Picture-in-Picture); en otros, es una ventana para llevar a otro monitor. La ventana lleva junto al registro las tarjetas en vivo; el marco se pliega mientras está abierta y se despliega cuando se cierra, si estaba abierto.

### Lo que viene al Artista <!-- #coming-to-the-artist -->

El título y el nombre del artista escritos en una portada; las versiones de la imagen de una toma; SeedVR como upscaler (con la fase de la DAW, en 2.1.0).

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
- **La papelera** devuelve, o borra para siempre tras confirmar. **Trash (Art)**, a su lado en la columna, guarda el arte apartado (las tandas del Artista en la papelera, las imágenes apartadas, las portadas quitadas de las tomas) y lo devuelve, o lo borra para siempre tras confirmar; las portadas de un espacio de trabajo congelado se quedan.

### El menú de una toma <!-- #a-take-s-menu -->

![Clic derecho en una toma](guide/collection-menu.png)

**Regenerar con una semilla nueva** (encima del Escritor en el menú de la toma): la toma hecha de nuevo con todo aquello con lo que se hizo, pero con semillas nuevas; la nueva hereda los espacios y la nota de la antigua, y la antigua espera en la sección *Origen de la regeneración* de su espacio (su espacio no la muestra entre las suyas) hasta que la vacíes; la nueva conserva su nota, su me gusta, su estrella y su imagen. Una prueba sale con sus dos minutos completos. Reproducir, abrir en el Creador o en el Pulidor, la hoja (su partitura), la ficha técnica (todo aquello con lo que se hizo: el estilo y la letra, la partitura dibujada, cada control, las LoRAs y los deslizadores con sus fuerzas; una toma en modo Directo no tiene partitura, y *Escribirla a partir del sonido* le pide una al transcriptor), me gusta, no me gusta, favorita, una nota, renombrar, **espacios** (una toma puede estar en varios), **mover a** un espacio (en una tarjeta marcada: cada toma marcada, fuera del espacio abierto), ocultar, enviar al Escritor, copiar, descargar, **exportar a un DAW** (proyecto de REAPER o DAWproject, en cualquier toma: con sus stems una vez que el Pulidor los ha separado), a la papelera. **En una tarjeta marcada, con otras marcadas**, el menú actúa sobre todas, y su cabecera dice sobre cuántas: me gusta, no me gusta, favorita, portada, quitar la portada, espacios, ocultar, un ZIP; las portadas de varias y la regeneración de varias preguntan antes, porque cuestan minutos de una tarjeta gráfica.

**Dibujar la portada**: un modelo de lenguaje pequeño (Qwen3-4B) lee el estilo y las palabras de la toma y escribe un prompt de imagen; Krea 2 Muse lo pinta, a 1024 px, en cerca de medio minuto en una tarjeta de 16 GB (en una tarjeta menor, un SDXL, CyberRealistic XL; el pintor se elige en *Motor → Portada*). Se ve en el reproductor, en la tarjeta, en el panel multimedia del escritorio y dentro del MP3 que descargas (como su portada). Cuando una toma ya tiene su imagen, el menú dice *Abrir la portada* (sobre la página, como un clic en la imagen de la tarjeta o en el cuadrado del reproductor) y *Redibujar la portada* (un prompt nuevo y una imagen nueva; la anterior se guarda junto a la toma, en `artwork-removed/`). Los dos modelos vienen con `heresy/fetch-heresy.sh --artwork` (14 GB, pregunta antes). *Engine → Artwork* ofrece también los pintores Qwen que hay aquí: Qwen-Image 2512 y sus fine-tunes fp8 con Lightning, y Qwen-Image 2.1 (ver Artista › Una portada para la toma).

### Los instrumentos bajo el estilo <!-- #the-instruments-under-the-style -->

Bajo el campo Estilo, el estudio nombra lo que pide tu prompt: una ficha por cada instrumento y estilo de la chuleta que encuentra, coloreada según lo que halló el oído (verde oído, ámbar en duda, rojo no suena con ese nombre) y con la imagen del instrumento. Posa el puntero sobre una para ver su tarjeta: la imagen, su tierra, cómo suena, ▶ A y ▶ B con sus semillas. Un clic muestra la imagen entera. **Alt+I** abre la chuleta desde cualquier parte.

### Portadas: qué las dibuja, qué no puede, otro pintor <!-- #artwork-what-draws-it-what-it-cannot-another-painter -->

**Qué las dibuja.** Un modelo de lenguaje pequeño (Qwen3-4B) lee el estilo y las palabras de la toma y escribe un prompt de imagen, con su tema primero; Krea 2 Muse lo pinta (1024 px), o un SDXL donde Krea no cabe (*Motor → Portada*). Cuando la toma lleva el nombre de un instrumento (la prueba de un instrumento), el estudio les dice a ambos cómo es el instrumento y de dónde es, y Omni (el modelo del oyente) mira la imagen: cuando no encuentra el instrumento, vuelve a escribir el prompt a partir de lo que vio, y el pintor lo intenta otra vez, tres imágenes como mucho. Cerca de medio minuto por imagen en una tarjeta de 16 GB. Un pintor Qwen elegido allí pinta con Lightning: a 1328 px, y se guarda a 1024.

**Qué no puede** (una advertencia, dicha sin rodeos): el pintor dibuja lo que conoce. Un instrumento que nunca ha visto por su nombre (el duduk, el morin juur, el jomús, los cuencos cantores de cristal…) sale como una conjetura: una flauta de madera, un violín, unos cuencos de cocina. Cuando Omni no encontró el instrumento en ninguna de las tres imágenes, la imagen queda marcada como **≈ una suposición**, en la vista superpuesta y en la chuleta de instrumentos. Una portada es el ánimo de la toma, no una imagen de referencia de un instrumento: para saber cómo es un instrumento, búscalo.

**Consejo pro: otro pintor.** Cuando el pintor es un SDXL (elegido en *Motor → Portada*, o en una tarjeta de menos de 16 GB), es el SDXL al que apunte el enlace `artwork/SDXL-Artwork-Model`; el nuestro es `CyberRealistic-XL-v10`. Pon otro finetune de SDXL a su lado, como carpeta de diffusers o como un único archivo `.safetensors` (como los da Civitai), y apunta el enlace hacia él, en relativo:

```bash
cd artwork && ln -sfn MyFavourite-XL.safetensors SDXL-Artwork-Model
```

y de vuelta: `ln -sfn CyberRealistic-XL-v10 SDXL-Artwork-Model`. La siguiente imagen ya lo usa, sin reiniciar. **Solo funcionan los finetunes de SDXL**: SD 1.5, SD 3, FLUX y otras familias se rechazan, y el estudio dice qué encontró en su lugar. Un finetune Turbo, Lightning, Hyper o LCM quiere pocos pasos y poca guía: cuando su nombre lo dice, el estudio pinta con 8 pasos, guía 2 y Euler ancestral. Para cualquier pintor, un archivo junto al enlace fija sus números: `artwork/SDXL-Artwork-Model.json` con `{"steps": 6, "cfg": 1.5, "sampler": "euler_a"}` (o `"dpmpp"`, el propio del estudio).

## Entrenador LoRA <!-- #lora -->

Probado con nuestras canciones y voces, el entrenador se queda por ahora en el 90 %: tus conjuntos y escenarios no son los nuestros, así que cuéntanos cómo fue (en el repositorio, *Trainer report*: el conjunto, el modo, los ajustes, lo que oíste).

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

Elige un conjunto creado en el paso 2 y luego un **tipo**: ajusta los controles para lo que enseñas (la tabla bajo la lista), y cualquiera se puede cambiar antes de *Entrenar*. El formulario, campo a campo:

- **Tipo**: estilo, voz, idioma o artista.
- **Nombre de la ejecución**: la carpeta de la ejecución (`training/NAME/`) y los nombres de sus adaptadores (`loras/NAME/NAME-eNNN`, enseguida entre los LoRA del Creador). Un nombre pertenece a una sola ejecución: si está ocupado, la página pide otro.
- **Entrenador**: **Ruach Studio** (el propio del estudio, sobre pesos bf16 sin cuantizar; crea él mismo la caché latente del conjunto; modo Directo) o **AI-Toolkit** de Ostris (la referencia; también puede entrenar con partitura y sobre voces separadas). Ambos guardan el mismo formato LoRA; en el mismo conjunto sus curvas coinciden época a época.
- **Pesos base**: bf16, el modelo entero (una tarjeta de 24 GB), o int8 para tarjetas más pequeñas, algo menos exacto. El archivo del modelo base nunca cambia: solo aprende el adaptador.
- **Pasos**: cuántos en total, una pista por paso. La mitad sonora oye una ventana de 60 segundos de la pista, cortada al azar cada vez; la musical lee la canción desde su comienzo. La ejecución se redondea a épocas enteras (una época: cada pista una vez): 2016 pistas por 12 épocas son 24 192 pasos.
- **Guardar cada N épocas**: un adaptador al final de cada N-ésima época, cada uno para escucharlo y compararlo; se guardan todos, con el estado del optimizador junto al más reciente (una ejecución detenida conserva lo aprendido).
- **Rango**: lo ancho que es el adaptador; su parte de los pesos y su tamaño están en la ayuda del campo (lo que cuesta cada rango y cuál para qué: abajo).
- **Tasa de aprendizaje**: lo grande que es cada paso de la mitad sonora (AdamW, la misma toda la ejecución); el de la musical es este por la **Velocidad AR**. Los tipos mantienen 0.0001; la mitad es más suave, para una ejecución larga sobre un conjunto grande; más alta aprende más rápido y olvida más.
- **Peso AR**, **Ancla AR (KL)**, **Velocidad AR**: los tres controles de la mitad musical, abajo.
- **Modo** y **Separar voces y música**, solo en AI-Toolkit: **Directo** es para canciones hechas en modo Directo; **Completo (partitura)** y **Melodía**, para canciones hechas en esos modos, enseñan además a la mitad musical a escribir primero una partitura, transcrita de cada canción; **con separación**, cada canción se divide primero en voz y música, y la mitad musical aprende también la voz solo con la letra y la música solo con las etiquetas.
- Bajo el botón: la VRAM medida de ejecuciones anteriores y qué tarjeta está ahora lo bastante libre.

| tipo | rango | pasos | peso AR | ancla AR | velocidad AR | para qué |
|---|---|---|---|---|---|---|
| **Estilo** | 32 | 1500 | 0.5 | 0.2 | 0.5 | un sonido: género, producción, el de una banda |
| **Voz** | 16 | 1500 | 0.3 | 0.3 | 0.5 | un timbre: la mitad musical sujeta cerca de la base |
| **Idioma** | 32 | 3000 | 1.0 | 0.1 | 1.0 | dicción: la mitad musical debe cambiar |
| **Artista** | 32 | 3000 | 0.7 | 0.2 | 0.7 | todo junto |

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
- **La frecuencia de muestreo del material**: la mitad sonora trabaja a 48 kHz, la musical oye a 24 kHz. Una grabación de 24 kHz le enseña todo a la mitad musical, pero a la sonora solo unos agudos apagados: remuestrear no añade nada por encima de la mitad de la frecuencia original. Para un timbre, dale 44,1 o 48 kHz.

### Los tres controles de la mitad musical <!-- #the-music-half-s-three-knobs -->

Cada paso enseña a las dos mitades por separado. La mitad sonora siempre aprende el sonido: quitar el ruido de su ventana de la pista (la pérdida flow). La musical aprende solo cuando el **Peso AR** es mayor que 0, y entonces tiran de ella dos cosas a la vez:

- **su lección** (ar_ce): predecir los propios tokens de la canción desde su comienzo, palabra a palabra y nota a nota: dicción, fraseo, hábitos melódicos, la forma de una canción;
- **el ancla** (ar_kl): en cada uno de esos puntos el entrenador pregunta al modelo base, la misma mitad musical con el adaptador apagado, qué escribiría ahí, y multa al adaptador por cada paso que se aleje de eso.

La pérdida de un paso es flow + Peso AR × ar_ce + Ancla AR × ar_kl. Lo que hace cada control:

- El **Peso AR** decide si la mitad musical aprende en absoluto, y con cuánta fuerza su lección tira contra el ancla. En 0 la mitad musical sigue siendo el modelo base (su parte del adaptador queda vacía: todo ceros, medido), el adaptador es un timbre solo en la mitad sonora, y el ancla no hace nada.
- El **Ancla AR** tira de la mitad musical de vuelta hacia el modelo base, para que conserve lo que el conjunto no muestra: cantar después de un conjunto de lecturas, otros idiomas, seguir letras nuevas, escribir una partitura. Sin ancla, se deja llevar adonde la lleve el conjunto.
- **Los dos tiran el uno contra el otro, y solo cuenta su proporción, no su tamaño.** AdamW mide cada paso con el tamaño de sus propios gradientes recientes, así que una pérdida multiplicada por un número enseña lo mismo que antes: 0.5 con un ancla de 0.2 es 1.0 con 0.4. Lee el ancla como una parte del peso: una décima deja moverse a la mitad musical (Idioma); igual al peso, la sujeta cerca de la base (Voz).
- La **Velocidad AR** es el verdadero acelerador de la mitad musical: su tasa de aprendizaje es la tasa de aprendizaje por esta, el único control que la hace aprender más rápido o más despacio. Los tipos la mantienen en 0.5 (Idioma en 1.0): la mitad musical se aprende de memoria un conjunto pequeño mucho antes de que la sonora tenga su timbre.

Medido aquí (10.10.2026: 40 pasos sobre un conjunto de 60 lecturas, rango 16, una semilla; *movimiento*: lo grande que salió el cambio que el adaptador hace en las matrices de la mitad musical):

| peso AR · ancla · velocidad | movimiento | distancia de la primera fila | ar_kl, sus diez últimos pasos |
|---|---|---|---|
| 0.5 · 0.2 · 0.5 (los de Estilo) | 1.32 | la misma ejecución otra vez: 1 % | 0.257 |
| 1.0 · 0.4 · 0.5 (ambos al doble) | 1.36 | 5 % | 0.262 |
| 0.5 · 0 · 0.5 (sin ancla) | 1.44 | 23 % | — |
| 0.5 · 0.5 · 0.5 (el ancla igual al peso) | 1.21 | 17 % | 0.132 |
| 0.5 · 0.2 · 1.0 (velocidad al doble) | 2.32 | 99 % | 0.443 |
| 0 · 0 · 0.5 | 0 | no aprendió nada | — |

Doblar ambos cambió el adaptador un 5 %, frente al 1 % de la misma ejecución dos veces; la parte del ancla lo movió de un sexto a un cuarto; doblar la velocidad lo llevó tres cuartos más lejos. La mitad sonora solo comparte con la musical el recorte de gradientes: de una fila a otra varió entre un 4 y un 13 %, frente al 2 % de la misma ejecución dos veces.

Qué girar, según lo que oyes y ves:

| cuando | gira |
|---|---|
| quieres solo un timbre (una voz de lecturas, un instrumento) | Peso AR bajo y el ancla igual (los 0.3 y 0.3 de Voz), o Peso AR 0 |
| quieres la dicción de un idioma, el fraseo de un estilo | Peso AR 1.0, el ancla una décima de él, Velocidad AR 1.0 (los de Idioma) |
| ar_ce cae pronto por debajo de 0.3: se sabe las canciones de memoria | baja la Velocidad AR o sube la parte del ancla; o escucha una época anterior |
| el adaptador canta las melodías de las canciones de entrenamiento sobre letras nuevas, o pierde la letra | sube la parte del ancla: igual al peso, o más |
| ar_kl se queda cerca de 0 y la dicción no llegó | sube la Velocidad AR o baja la parte del ancla |

### 4 Telemetría <!-- #4-telemetry -->

![Las curvas de ambas mitades, explicadas bajo cada una](guide/train-charts.png)

Las ejecuciones que están entrenando se colocan arriba de la sala con su progreso, el tiempo restante y ambas pérdidas. La telemetría de una ejecución muestra su progreso y luego unas fichas: la velocidad, el tiempo que lleva y el que le queda, los últimos valores de flow, ar_ce y **ar_kl** (cuánto se ha alejado la mitad musical del modelo base: 0 mientras el Peso AR es 0), el pico de VRAM y la tarjeta; luego dos curvas:

- **Mitad sonora · pérdida flow**: lo bien que la mitad sonora predice el ruido que debe quitar. Salta de un paso a otro (cada paso toma un nivel de ruido al azar): lee la línea gruesa, la media móvil.
- **Mitad musical · ar_ce**: lo bien que la mitad musical predice los propios tokens de la canción. Cerca de 0 se sabe las canciones de memoria; entonces una época anterior es el mejor adaptador.

Pasa el puntero por una curva para leer el paso, su época y el valor ahí. **Comparar con…** superpone las curvas de otra ejecución sobre estas, discontinuas. El botón junto a **El registro** pone las dos curvas una debajo de la otra, cada una a todo el ancho, o de nuevo una al lado de la otra. **El registro** se abre al pie de la sala, tan ancho como sus líneas, junto al registro del servidor.

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
- **Cómputo**: la copia del **modelo** (BF16 7,2 GB, Q8_0 3,8 GB, Q6_K y Q5_K_M más pequeñas), **Preajuste de memoria de la GPU** (*Auto* ajusta el contexto y los bloques del VAE a la tarjeta; *Auto within N GB* hace lo mismo para esa cantidad y deja el resto de la tarjeta a lo demás que corre en ella (en un portátil de 16 GB, 14); *Manual* te los deja a ti), **Mantener los modelos cargados**. **Scan the machine** dice lo que tiene la máquina y lo que le conviene (el modelo base, los controles de Auto, el pintor), como hace un estudio nuevo una vez en su primer arranque.
- **Hardware**: la memoria de la tarjeta ahora; **Liberar el modelo** la libera al instante.

### GPU: qué tarjeta hace qué <!-- #gpus-which-card-does-what -->

![Qué tarjeta hace qué](guide/engine-gpus.png)

En una máquina con varias tarjetas, dale a cada una su trabajo: el **estudio** (síntesis) en una tarjeta, el **entrenamiento** en las tarjetas que le des, los **trabajos** del laboratorio (el oyente, Whisper, stems, remasterización, reescalado) en las suyas. Mientras una ejecución entrena en la tarjeta del propio estudio, una síntesis espera, y la página dice por qué. Con una sola tarjeta, así funciona: entrena, luego crea. Una tarjeta nueva para el estudio surte efecto tras un reinicio (el botón aparece cuando hace falta). Los trabajos del laboratorio se quedan en las tarjetas marcadas para ellos, el Artista entre ellos: cuando están llenas, un trabajo espera a una de ellas (Whisper pasa al procesador) y nunca toma una tarjeta no marcada para el laboratorio. Una ejecución del Artista va a la tarjeta donde su modelo se mantiene desde la ejecución anterior, con los pesos ya en la RAM.

### Decodificadores, adaptadores, deslizadores, el modelo del escritor, el aspecto <!-- #decoders-adapters-sliders-the-writer-s-model-the-look -->

- **VAE**, **LoRAs**, **Deslizadores**: cada archivo que encontró el estudio, con su fuente y lo que hace.
- **Modelos y LoRA** (Models and LoRAs): lo que trae la instalación, por partes (los decodificadores extra y los sliders, Whisper, los modelos de stems, UniverSR, los LoRA), tal como los encontró la última pasada, y **Check again** para mirar de nuevo. Una parte incompleta lista lo que falta y tiene su **Fetch**; **Fetch what is missing** los descarga todos; una descarga cortada sigue donde se quedó. **More models**: otro backbone (BF16 junto a Q8_0), el oyente de estilo, el pintor del Artista, la base del entrenador, cada uno con sus variantes y tamaños, la variante que ya está marcada como tal, y cada uno preguntado antes con su tamaño. Un backbone, decodificador o slider nuevo llega al motor en su próximo arranque (**Restart the engine**); los LoRA nuevos, al instante.
- **Artwork**: quién pinta la portada de una toma: según las tarjetas (Krea 2 Muse Q4 desde 16 GB, si no SDXL) o uno elegido: Krea 2 Muse Q4 o Q8, SDXL CyberRealistic, y los pintores Qwen que tiene esta máquina (Qwen-Image 2512 Q4 o Q6 y cada fine-tune fp8, con Lightning; Qwen-Image 2.1 con su licencia dicha).
- **Escritor**: la dirección del servidor de chat local (vLLM, LM Studio, Ollama), *Probar la conexión*.
- **Apariencia**: 22 temas (elegidos para crear en ellos: claros y tranquilos), esquinas, las tres fuentes (texto, títulos, números).
- **Registro del servidor**: el registro completo; **Acerca de**: cada proyecto sobre el que se apoya el estudio, enlazado.
- **Actualizaciones**: las versiones de Ruach Studio en GitHub frente a esta: cada cuánto mirar (cada día, semana, mes, nunca), también las candidatas, y cuando sale una, preguntar o actualizarse sola cuando nada se ejecuta (solo donde el estudio es un clon de su repositorio; en otro sitio dice cómo actualizar a mano). Un estudio nuevo, y cada actualización, ofrece los conjuntos 💎 que aún no tiene.
- **Carpetas** (Folders): dónde vive tu trabajo (las canciones con los espacios de trabajo descargados, la papelera, las imágenes del Artista, los documentos del Escritor), cuánto guarda cada una y el espacio que queda en su disco. **Move…** lleva una a cualquier carpeta o disco: el estudio dice primero lo que hará (en el mismo disco, un cambio de nombre; en otro, una copia comprobada archivo por archivo y luego el enlace cambiado) y la mueve solo con un segundo sí, mientras nada se renderiza; la copia vieja queda, renombrada, hasta que la borres. **Back home** devuelve una carpeta a la carpeta del estudio; **Link again** vuelve a apuntar el estudio a una carpeta cuyo disco ha vuelto. Los modelos, los LoRA y los conjuntos de entrenamiento se quedan en su sitio.

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
| **F5**, **Ctrl+R**, **Ctrl+Mayús+R** | en cualquier parte menos el Bibliotecario | tras algo escrito (desde que llegó la página o desde **Ctrl+S**) preguntan antes, si no recargan al instante; al preguntar, dicen qué se lleva la recarga y qué conserva; con una canción en el formulario, *Save to the Writer, then reload* la guarda también en el Escritor; **Ctrl+F5** recarga al instante (en el Bibliotecario **F5** vuelve a leer la biblioteca) |
| **Intro** / **Esc** | un diálogo, un cambio de nombre en el sitio, un valor escrito de una LoRA | aceptar / cancelar; en un diálogo con texto largo, **Shift+Intro** es una línea nueva |
| **Intro** | *Empezar por una idea* | el modelo de chat redacta la canción; **Shift+Intro** es una línea nueva |
| **Ctrl+S**, **Ctrl+Mayús+S** | en cualquier parte | lo guardan todo ahora: la canción del formulario, el documento abierto del Escritor, los ajustes (nunca «Guardar página» del navegador) |
| **Ctrl+N** | en cualquier parte, en la ventana de Pinokio | canción nueva en el Creador (pregunta antes si el formulario tiene palabras); un navegador se queda Ctrl+N para su propia ventana nueva |
| **Alt+K** · **Alt+J** | la letra, la del Creador y la del Escritor | marcar la línea del cursor o quitarle la marca · ir a la siguiente marca (**Alt+Shift+J** a la anterior, **Alt+Shift+K** las quita todas) |
| **Alt+E** | el Creador | alza la letra sobre todo y la devuelve; **Mayús+Tab** sobre ella la pone en el formulario alzado |
| **Alt+O** · **Alt+L** · **Ctrl+Y** · **Alt+↑ ↓** | la letra, como en mcedit | quitar las marcas · ir a una línea por su número · borrar la línea · mover la línea (o las seleccionadas) |
| **Ctrl+F** · **F4**, **Ctrl+H** | la letra, el estilo, los cuadros del Escritor | buscar solo en ese cuadro · buscar y reemplazar (**Intro** la coincidencia actual, **Ctrl+Intro** todas; **Alt+C** mayúsculas y minúsculas tal como se escriben) |
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
