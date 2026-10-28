# Ruaj Estudio · la guía

Canciones a partir de palabras, en tu propia máquina: cada sala, para qué sirve cada cosa y las cifras que medimos.

## Empieza aquí <!-- #start -->

### Qué es esto <!-- #what-this-is -->

Ruaj Estudio convierte una línea de estilo y una letra en una canción terminada con **YuE2**, el modelo abierto de canciones, en tu propia GPU. Nada sale de la máquina. Alrededor del modelo hay todo un estudio: una sala de escritura con un modelo de chat, posproducción (stems, remasterización, reescalado, revisión de la letra), una colección de todas las tomas y una sala que entrena adaptadores LoRA con tus propias canciones.

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
- **Ninguna toma fuera de un espacio**: todo lo que hace una toma (Generar, Reemplazar una sección, Importar) espera un espacio en mano que acepte tomas nuevas, nunca un conjunto 💎, sus secciones ni un espacio congelado. El único abierto pasa a la mano solo, una instalación nueva recibe *Mis canciones*, y si no el estudio pregunta; no se envía nada hasta elegir uno, ni mientras el Bibliotecario no responda.
- **ES** (las dos letras del idioma): la página en otro idioma, guardado con tus ajustes: English, Русский, Українська, Беларуская, Ελληνικά, Español, Italiano, Français, Português, Deutsch, 日本語, 中文, cada uno nombrado con sus propias palabras. Los números y las fechas siguen al idioma, y esta guía se abre en él.
- **☀ / ☾**: día, noche o lo que diga el sistema.
- En la cabecera de Composición: **Guardar** un prompt (todo lo que enviaría la generación) como JSON o YAML y **Abrir** uno de nuevo; **Vaciar** las palabras (título, estilo, letra, partitura, semillas) sin tocar lo demás, o empezar una **Canción nueva** (también el modo, el muestreo y las LoRA a sus valores por defecto; *Sonido y salida* se queda). **Abrir** dice qué parte de un archivo no cupo en el formulario y qué guarda en su lugar.
- **Exportar a un DAW** (en ☰, y en el Pulidor: junto a la toma en mano y en sus Stems): la salida del estudio. O la pista mezclada tal cual (WAV, FLAC, MP3), o la toma entera a tu propio DAW, donde lo demás ocurre fuera del estudio. La página encuentra REAPER, Waveform y Bitwig en la máquina del estudio, o tú nombras el tuyo. Cualquier toma sale desde su menú (clic derecho): *Exportar a un DAW → Proyecto de REAPER* o *DAWproject* (Waveform, Bitwig, Studio One, Cubase), tu DAW primero; la pestaña DAW de esta guía dice qué hay dentro.
- **Liberar el modelo**: saca ya de la memoria de la GPU todo modelo en reposo; teñido de rojo mientras hay un modelo cargado.
- **☰**: lo demás. La tarjeta gráfica y su memoria, la copia del modelo, el decodificador de sonido (VAE), **Exportar a un DAW**, los temas, la sala del Motor y esta guía. **Text size** fija ahí el tamaño del texto de toda la página de −2 a +4 pt (el diseño no cambia), y un marco alzado tiene sus propios −, + y ⟲ encima (de −4 a +6 pt); cada pantalla guarda el suyo. Cuando en `user/plugins/` hay un plugin tuyo, **Plugins propios** ahí lo apaga en este navegador: el Pulidor, el DAW y el MIDI muestran entonces solo lo que tiene un estudio público, para probar el camino público, una promo o imágenes; no se borra nada y la página se recarga.

![Detrás del ☰](guide/more-menu.png)

### Tu primera canción, en seis pasos <!-- #your-first-song-in-six-steps -->

1. Ponle **Título** y elige la **Tonalidad** si tienes una en mente (o deja *como está escrita*).
2. Escribe el **Estilo**: idioma, género, voz, instrumentos, tempo. Una o dos líneas sencillas bastan. El ♪ de al lado lista 200 instrumentos con lo que YuE2 toca de verdad (ver *Creador*).
3. Pega la **Letra** con etiquetas de sección en su propia línea: `[Verse]`, `[Chorus]`, `[Bridge]`, `[Outro]`.
4. Deja **Plan completo** como modo de planificación: YuE2 escribe primero una melodía y acordes, y luego la canción.
5. Pulsa **Generar canción**. La ejecución muestra sus etapas: la partitura, los tokens musicales, el sonido, la decodificación.
6. La toma se abre en el centro, con su reproductor, su partitura y todo lo necesario para hacerla de nuevo.

> Medido en una RTX 3090: una canción de 6:12 en modo Directo tardó 135 segundos, una de 7:25 en Plan completo, 212 segundos (primero se escribe la partitura). Las canciones más cortas son más rápidas.

### El reproductor, las tomas y el registro del servidor <!-- #the-player-the-takes-and-the-server-log -->

- **El reproductor**, abajo: la forma de onda de lado a lado, una nube suave con la parte ya escuchada en el color de acento (un clic salta allí); debajo, la toma (su portada cuando la tiene, su título, las primeras palabras de su estilo, 👍 👎 ★), luego **aleatorio**, anterior, reproducir, siguiente y **repetir** (desactivado · toda la lista otra vez · esta toma otra vez, marcado con 1), luego el tiempo (un clic en la duración total lo cambia al tiempo restante), *reproducir al hacer clic* (un clic en una lista reproduce la toma de inmediato), *seguir reproduciendo* (cuando una toma termina, empieza la siguiente de la lista), *reproducir tomas nuevas* (una canción hecha aquí suena en cuanto está lista, si no suena nada), 🔔 *un sonido al terminar una ejecución* (dos notas hacia arriba cuando está lista, una sola vez para una cola de ejecuciones, dos hacia abajo cuando una falla; ninguno sobre una canción nueva que empieza sola), la **velocidad** (de 0.50× a 2.00×, conservando el tono), el volumen y un punto de estado (late mientras suena una toma). Lo que no necesitas en este momento queda tenue hasta que llega el puntero; cada icono dice qué hace cuando el puntero se posa sobre él. El puntero sobre la forma de onda muestra el tiempo al que saltaría un clic. Las teclas multimedia del teclado y de unos auriculares controlan el reproductor, y el panel multimedia del escritorio muestra la toma. ⏪ y ⏩ van a la marca anterior o siguiente cada 15 segundos desde 0:00, ← y → a las marcas de 5 segundos (con Shift, de 30). La píldora de estado al final derecho del reproductor (verde mientras suena una toma, del color del acento mientras se hace una) abre la toma o la ejecución; con Compose alzado sobre la sala, cambia el marco al de la toma. Un clic derecho en la forma de onda, la imagen o el título abre el menú de la toma, como en una lista. La forma de onda muestra las secciones de la toma: las etiquetas de la propia letra, cada una donde Whisper oye su primera línea (una vez por toma, cerca de medio minuto; sola en una máquina con dos tarjetas o más, si no desde el menú de la toma → *Find the sections by ear*); una toma aún no oída muestra las marcas de su partitura. Una línea fina al inicio de cada una, su nombre al pie; un clic junto a una línea va al inicio exacto de la sección; el puntero sobre la onda muestra una tarjeta con la sección, su tiempo y sus líneas tal como están escritas, iluminada la línea que suena ahí; una sección marcada con ? no se oyó con claridad. El puntero que se queda un momento sobre la onda sube sobre el reproductor el espectrograma de toda la toma (el interruptor del espectro junto a 🔔 lo apaga): tan ancho como la onda y a su mismo tiempo, cerca de un tercio de la altura de la ventana, con la tarjeta de la sección encima; en él las secciones, el centroide espectral como línea magenta (dónde está el peso del sonido: su brillo), el RMS en una franja abajo con la media de la toma discontinua, el cabezal; bajo el puntero su tiempo, el espectro de ese momento junto a la línea con su frecuencia más fuerte y su nota, y dentro de la imagen la frecuencia de ahí, su nota y su nivel. *Logarítmica* o *Lineal* en su cabecera; un clic va allí como en la onda; el puntero fuera o Esc lo bajan. La toma se mide una vez, en el laboratorio, como para su Espectro. El volumen llega al 150 %: por encima del 100 % realza una toma baja, y el control se detiene primero en el 100 % (suéltalo y arrastra de nuevo para pasar).
- **Dos filas o una**: la forma de onda sobre los botones del reproductor se queda donde las canciones se escuchan y se comparan (Creador, Pulidor, Bibliotecario); en el Escritor, el Artista, el Entrenador y el Motor el reproductor va en una fila, como en el Creador mientras un marco está alzado o la letra está por encima de todo. Tras recargar (F5) vuelve con su toma y su punto. En el Artista las tomas empiezan plegadas y el registro del servidor se coloca a la izquierda.
- **Las tarjetas en vivo**: en Engine → GPUs cada tarjeta tiene debajo una fila propia, su carga y su memoria una barra cada dos segundos durante cuatro minutos, con su temperatura y su potencia; el registro del servidor desplegado muestra a su lado las tarjetas que tienen un papel, cada una con su papel encima, la del estudio enmarcada. Las medidas siguen todo el tiempo, así que el registro se despliega ya con los últimos minutos.
- **La línea al estudio** aparece junto al registro del servidor (*Forge · 85 ms*, o *aquí* en la misma máquina). Cuando el estudio está lejos, un me gusta, una favorita o una fijación se ven al instante y el estudio solo los confirma.
- **Tomas**, a la derecha: busca con palabras, `*` y `?`; *Favoritas*; pliega la columna con »; ⋯ para las acciones propias de la lista. En ⋯, *De todos los espacios* muestra en esta columna las tomas de todos los espacios, sin cambiar el espacio en uso.
- **Tomas plegadas**: el ratón sobre la tira » abre la lista sobre la toma; vuelve a plegarse un segundo después de que el ratón salga (su botón Plegar, pulsado entonces, la deja abierta). El menú ⋯ se abre hacia arriba cuando el reproductor no deja sitio debajo.
- **El registro del servidor** está justo encima del reproductor en cada sala: plegado, muestra lo último que dijo el motor (en rojo cuando algo falló); desplegado, diez líneas, *Seguir*, *Copiar* y el camino al registro completo en el Motor. Con un marco alzado sobre la sala, se coloca a la izquierda, lejos de los botones del marco. La flecha de su borde interior lo lleva al otro lado de la página, y cada sala recuerda su lado (el del Artista, el izquierdo). Su borde exterior se arrastra para ensancharlo, hasta 1200 px (el ancho se guarda; un doble clic devuelve el suyo); con las tarjetas al lado mide 920 px, su columna 390. El marco tiene dos vistas, **Server** y **Artist** (el registro propio del Artista: qué se pidió, qué respondió el laboratorio, el camino de cada tanda hasta su final), y cada sala abre la suya; **⧉** abre el registro en una ventana propia, sobre todas las ventanas en Chrome o para llevarla a otro monitor. Mientras se entrena una LoRA, sobre el registro aparece una barra propia, una línea por entrenamiento: su tarjeta, su paso, cuánto lleva hecho y cuánto le falta más o menos; un clic abre el Entrenador.

![El registro del servidor, desplegado](guide/log-dock.png)

## Creador <!-- #creator -->

### Composición: el formulario de la canción <!-- #compose-the-song-form -->

![Título, tonalidad, semillas y estilo](guide/compose-top.png)

- **Empezar por una idea**: una línea sobre la canción; el modelo de chat del Escritor redacta el título, el estilo y la letra (*Escribir el brief*).
- **Título**, **Tonalidad**: la tonalidad va a la partitura (`K:`). Con una partitura en el formulario, una tonalidad nueva la transporta allí; sin ella, la elección espera y transportará la partitura que llegue.
- **Versiones** (junto a *Guardar en el Escritor…*): el formulario se guarda bajo su título en cada Generate, con Ctrl+S, después de que el piano roll escriba en la partitura y antes de todo lo que lo sobrescriba (un ejemplo, una toma, el Escritor, una versión), con sus ajustes, así que un cambio nunca se pierde; un clic elige una versión, un segundo muestra las dos como diferencias, *Al formulario* devuelve una; estrella, etiqueta, candado. Borrar una toma nunca se lleva sus versiones. **Versión**, junto al Título, admite dígitos y puntos (4.2.3): una toma se llama «Título v4.2.3», como se nombran las pistas, y las versiones guardan un árbol por título con una rama por versión (un título escrito con su versión se divide solo en los dos campos). *Eliminar el árbol…* envía todo el árbol de un título a la papelera de versiones; *Versiones del Creador* en el Escritor lo devuelve.
- **Semilla musical** y **Semilla sonora**: los dados de las dos mitades. Vacía es aleatoria; un número repite una toma. Conserva la semilla musical y cambia la sonora para oír la misma canción renderizada de otra manera. Están las primeras en *Muestreo y eliminación de ruido*. Junto a cada una, su **modo**: *Random (−1)* una semilla nueva cada vez (el campo vacío), *Random, fixed* una al azar puesta y guardada, *Fixed* la escrita, *Next* y *Previous* la mueven tras cada Generate más allá de las semillas usadas (las versiones para la música, las variaciones para el sonido). La semilla del Artista tiene los mismos modos. Una semilla de música fija está vigilada: cuando sus adaptadores (sus mitades musicales) o el modelo base cambiaron desde que corrió por última vez, o cuando rompió un plan con estos mismos adaptadores, la ejecución pregunta antes: **Una semilla nueva** o **Mantener la semilla**. Un plan ya no escribe su semilla en el campo, y **Una partitura nueva** toma semillas nuevas.
- **Estilo**: idioma, género, voz, instrumentos, tempo. *Guardar estilo…* lo guarda con un nombre. **♂** y **♀** en su cabecera ponen *male vocals* o *female vocals* en él (en lugar de la palabra del otro género, si no antes del BPM); el encendido quita su etiqueta. **Tempo libre**, a su lado, hace la música con la partitura sin sus marcas de tempo (Q:): la voz y el pulso respiran solos, la letra ya no va atada al compás (rubato, no lineal); se enciende solo cuando el Estilo pide rubato o non-linear y no nombra BPM, y un BPM en el Estilo con él encendido se dice bajo el cuadro. Una partitura creada aparte (*Crear la partitura ABC*) también llega sin tempo.
- **Letras no latinas** en el Estilo se nombran debajo: YuE2 lee el estilo como etiquetas en inglés. **✦ Sugerir** (✦ Suggest) lee la letra entera (hasta 8000 caracteres). Los estilos guardados, los perfiles, los perfiles de texto y los documentos del Escritor se eligen en el diálogo propio del estudio, con filtro en una lista larga, como el espacio.

### La chuleta de instrumentos ♪ <!-- #the-instruments-cheat-sheet -->

El ♪ junto al estilo abre una tabla de 200 instrumentos que el estudio probó: su familia, su tierra, cómo suenan (en inglés y en ruso) y las palabras que los llaman. ▶ A y ▶ B reproducen dos pruebas de 60 segundos de cada uno. El veredicto de cada fila lo da un oído humano: oído, en duda o **NOT IDENTIFIED IN YUE2** (YuE2 no lo conoce; hace falta un prompt más elaborado). Un clic copia el nombre y pregunta adónde va: al final del estilo en una línea propia, o en lugar de él; un nombre que el estilo ya tiene se marca en la tabla, y el texto de la tabla se puede seleccionar y copiar.

**YuE2 decide cuándo entra un instrumento.** Una línea de estilo es una petición, no una orden: por mucho que insistas, el modelo mete un instrumento donde su entrenamiento dice que la canción lo quiere, y la semilla decide muchísimo. El mismo prompt dio una toma con el instrumento y otra sin él. Escucha varias semillas antes de juzgar un instrumento.

**Se oye, pero no tan real como uno en vivo.** Muchos instrumentos sí suenan, pero menos claros y menos fieles que los de verdad: es lo que YuE2 sabe de ellos. Los veredictos dicen si YuE2 toca un instrumento en absoluto, no lo real que suena. Hacerlo real es tarea de una **LoRA de instrumento**: unas pocas decenas de grabaciones limpias suyas, entrenadas en el Entrenador LoRA.

![La chuleta de instrumentos](guide/instruments.png)

### El vocabulario de la Primera Ola <!-- #the-first-wave-s-vocabulary -->

**YuE2-RS-FW**, el fine-tune propio del estudio (*Engine → Models and LoRAs → RS-FW merge*), aprendió de 32.633 pistas, y cada palabra de sus líneas de estilo está contada en **[su vocabulario](fw-vocabulary/index.html?lang=es)**: géneros, instrumentos, voz, ánimo, las palabras de emoción que el propio audio recibió, tonalidades y BPM, y las claves de las partituras (secciones, compases, tempos, acordes). Búscalo, fíltralo por tipo y por fuente, mira con qué palabras iba cada una. Un clic pone una palabra en una línea de estilo en el orden que aprendió el modelo; *Copiar* se lleva la línea para el campo Style. Una palabra vista en cientos de pistas el modelo la entiende; vista dos veces, es una pista. La misma referencia como documento está en [la página del modelo](https://huggingface.co/goldhub/YuE2-RS-Finetunes/blob/main/FW-VOCABULARY.md).

### Letra y perfiles de texto <!-- #lyrics-and-text-profiles -->

- Etiquetas de sección en su propia línea; YuE2 conoce `[Intro]`, `[Verse]`, `[Pre-Chorus]`, `[Chorus]`, `[Bridge]`, `[Interlude]`, `[Outro]`.
- Deja sin palabras una etiqueta instrumental como `[Instrumental Outro]`: las palabras bajo ella llevan la cola a un canto inventado, toma tras toma. Pon las últimas palabras bajo un `[Breakdown]` antes de ella.
- **Perfil de texto**: pega un texto entero, elige un perfil, *Aplicar*: sus reglas (limpieza, fonética) y su forma (`[Intro]`, `[Verse]` en las líneas en blanco, `[Interlude]` tras los párrafos largos) lo dejan listo para leer. *Deshacer* devuelve el texto. Los perfiles se crean en el Escritor.

### El contador de la letra y la mano fonética <!-- #the-lyrics-meter-and-the-phonetic-hand -->

- **El contador** junto a la letra: cada línea, sus sílabas en una barra frente a la regla de su grupo — estrofa y puente un grupo, el pre-estribillo el suyo, el estribillo el suyo, cualquier otra sección la suya. Una pausa, un break, un silencio, un interludio, un preludio o un pasaje instrumental dentro de una sección cantada no abre grupo: su nombre queda tenue al lado y la regla de la sección sigue. Las etiquetas nunca cuentan: una línea solo de etiquetas (`[Break] [Silence]`) no cuenta, y una etiqueta dentro de una línea queda fuera de la cuenta. La regla está en la longitud habitual del grupo; dentro de una sílaba la barra es verde, a dos o tres, ámbar, más allá, roja. Lo que va entre paréntesis se dibuja rayado tras la barra: YuE2 puede cantarlo. Bajo el cuadro: los caracteres, las sílabas y las líneas de la letra, las etiquetas, los paréntesis y la mano fonética; el corrector del navegador en el idioma de la letra (ahí se apaga); un cuadro estirado a mano conserva su altura hasta *Altura automática*.
- **Números de línea y marcas**: el cuadro de la letra numera sus líneas como un editor de código (una línea partida, una vez, en su primera fila; *Line numbers* bajo el cuadro los apaga). **Alt+K** marca la línea del cursor o le quita la marca, **Alt+J** va a la siguiente marca, **Alt+Shift+J** a la anterior, **Alt+Shift+K** las quita todas; el número de una línea marcada es ámbar, y las marcas siguen a sus líneas cuando escribes encima. Cada [etiqueta] queda bajo una capa ámbar fina. La letra del Escritor tiene lo mismo. Como en mcedit: **Alt+O** también quita las marcas, **Alt+L** va a una línea por su número, **Ctrl+Y** borra la línea, **Alt+↑** y **Alt+↓** mueven la línea (o las líneas seleccionadas) con su marca. *Keys* bajo el cuadro las enumera todas, y la etiqueta LYRICS del Escritor las dice al pasar el puntero. **⤢** junto a Lyrics levanta el cuadro sobre todo, al 60 % del ancho de la pantalla y cuatro décimas más grande, con todo esto y con sus propios −, + y ⟲ para el tamaño del texto (se guardan en este navegador); Esc lo devuelve. Junto a **⤢**, dos botones guardan la letra como texto plano: el primero la guarda en un `.txt` con el nombre del *Título*, el segundo pone un `.txt` (UTF-8) en su lugar (pregunta antes si el cuadro tiene palabras, y **Ctrl+Z** en el cuadro las devuelve; un *Título* vacío toma el nombre del archivo).
- **Corchetes revisados**: un «[» sin cerrar en su línea, un «]» sin ninguno abierto, un «[» dentro de una etiqueta y una etiqueta vacía tiñen de rojo el número de su línea, y *Tags not closed or astray* bajo el cuadro va de uno al siguiente; un paréntesis que queda abierto o se cierra sin abrir es ámbar (un eco puede seguir). Un «[» que aún se escribe se deja en paz hasta que el cursor sale de su línea. **Generar pregunta antes** cuando una etiqueta está rota: lo que sigue a un «[» sin cerrar puede perderse en la canción y su final torcerse; *Go to the line* o *Generate as it is*.
- **Acentos fuera de sitio**: una marca que no está sobre una vocal — al inicio de una línea, tras un espacio o un signo, sobre una consonante, una segunda en la misma letra, o un ´ suelto en su lugar — muestra un botón rojo bajo el cuadro (*Stress marks off a vowel*) y una marca ante la cuenta de la línea; el botón las selecciona una a una. Una palabra con dos marcas recibe uno ámbar: ¿a propósito o un desliz? En la cuenta, la marca de acento no es sílaba; ע y una vocal latina dentro de una palabra rusa sí. Una sílaba es un sonido vocálico, una nota, y cada idioma se cuenta con sus reglas: en ruso, ucraniano y bielorruso, una letra vocal (y como el contador mide el tiempo de una línea, una palabra sin vocal — с, в, к, з, й, ў — y una oclusiva ante una africada dentro de una palabra — глу-п-цо́в — toman un tiempo propio, dibujado más claro: «Я же вижу глупцо́в с приду́рческим планом» son 12 sílabas y 2 de esos tiempos, 14); en griego αι, ει, οι, ου, αυ, ευ son una (la diéresis o el acento las separan: τσά-ι); en español e italiano una i o u débil se une a su vecina (cie-lo, cuo-re) y dos fuertes son dos (po-e-ta); en inglés una e final muda no cuenta (make, pero ta-ble); el hebreo cuenta sus puntos vocálicos; el chino, el japonés y el coreano, un signo por sílaba. Las palabras latinas se cuentan como inglesas, españolas o italianas: por el nombre del idioma en el estilo, si no, por las palabras pequeñas de la propia letra.
- **El arco**: las estrofas numeradas 1, 2, 3… (ninguna falta, ninguna dos veces, ninguna sin número entre las numeradas); dentro del ciclo de una estrofa Verse › Pre-Chorus › Chorus › Post-Chorus, una sección puede faltar, pero no volver atrás; un Bridge o una parte instrumental abre el ciclo de nuevo; un Intro solo antes de la canción, nada cantado después de un Outro. Sus fallos: **Arco** (Arc to look at) en ámbar, una pulsación lleva al siguiente.
- **Ctrl+F** en la letra o en el estilo (y en los cuadros del Escritor) busca solo en ese cuadro: Enter y Mayús+Enter recorren las coincidencias, Esc desde el campo de búsqueda devuelve el cursor con la coincidencia seleccionada; desde el propio cuadro (si hiciste clic en otro sitio) cierra la búsqueda y deja el cursor donde está, y lo que escribas mientras tanto no mueve la vista. La tilde de acento no estorba, ё es е, y о y а encuentran también ע y las o y a latinas. **F4** o **Ctrl+H** abre una segunda fila para reemplazar: **Intro** pone las palabras nuevas en lugar de la coincidencia actual y pasa a la siguiente, **Ctrl+Intro** (o *All*) reemplaza todas a la vez, y un solo **Ctrl+Z** en el cuadro lo deshace; **Aa** (**Alt+C**) busca solo con las mayúsculas y minúsculas tal como se escriben.
- **Etiquetas tras «[»**: un «[» al principio de una línea de la letra (del Creador o del Escritor) abre las etiquetas de sección, como un editor de código sugiere palabras, en el orden en que las recorre una canción, de Intro a End. Las letras tras el «[» estrechan la lista (también con la distribución rusa o ucraniana), un número numera la etiqueta (`v2` es `[Verse 2]`), y si la letra numera sus estrofas se ofrece la siguiente. ↑ ↓ eligen, Enter o Tab ponen la etiqueta en su propia línea (Ctrl+Z la deshace), Esc o `]` cierran la lista. Intro, Outro y End que ya están en la letra quedan en su sitio, tenues, con su línea: ↑ ↓ llegan a ellas y se lee qué son, pero no se ponen dos veces. Ctrl+Espacio abre la lista, y al principio de una línea escribe el propio «[». La lista va en dos columnas: las etiquetas y, a su lado, qué es la que tienes en la mano (con nuestras palabras, según la guía de secciones de canciones de Genius) y cuántas veces la escriben los 110 ejemplos oficiales; el cuadro conserva su tamaño al estrecharse la lista. Las secciones que ninguno de ellos escribe llevan la marca TEST. **Una segunda y una tercera etiqueta** en una línea: un «[» escrito justo después de la etiqueta de una línea recibe su espacio solo y ofrece las etiquetas que no son secciones (quién canta, como lo escriben los ejemplos; Female Vocals, Break y Silence marcadas TEST); Intro la pone en la misma línea, con su «…» seleccionado para tus palabras; Ctrl+Espacio escribe « [» también ahí.
- **La mano fonética** (la de Viktor, venida de SUNO; YuE2 la sigue igual):
  - **Una tilde de acento** (el agudo combinable, U+0301) tras una vocal: `обе́щано`, `сули́т`. Funciona en cerca del 90 % de las líneas; el resto es suerte de la semilla.
  - **Una vocal tónica en mayúscula** empuja el acento adonde lo pide la rima, contra el diccionario: `базилиО́`. Una mayúscula sola, sin la tilde (`дрОв`), rara vez mueve el acento.
  - **ע (ayin) dentro de una palabra rusa** se canta como una o/a suave, como el habla viva dice la o átona: `кעмо́рка`, `пעле́но`, `Ка́рлע`. También frena el rap que se acelera cada vez más.
  - **Una o latina dentro de una palabra rusa** canta una o dura y abierta donde el modelo diría a: `Кo дну`.
  - **Una vocal estirada** (`о-о-о`, `БУ… РА… ТИ… НО`) sostiene una nota; donde la música tiene sitio para ella, no en cada línea.
  - **[Interlude]** entre partes hace una pausa en el rap y frena el habla que se acelera cada vez más (no siempre).
  - **Los paréntesis** no son una orden: una o dos palabras en el idioma de la letra dentro de ellos se cantan casi siempre como eco de coro; una indicación dentro de ellos (`(Music slowly fades)`) casi siempre se omite, o se canta. Una orden va entre corchetes.
  - **Voz principal y coro** (hallazgo de Viktor, 20.10.2026): divide la letra en las líneas de la voz principal y las respuestas del coro. Con `female choir backing` y `solo lead` en el estilo, una línea corta entre paréntesis en el idioma de la canción la canta casi siempre el coro, en su propia línea o al final de la línea de la voz principal. Funcionan dos formas: los paréntesis solos, la más estable (`это же (божественный экстаз!)`), y `(Choir: …)`, que no siempre prende; `(Choir backing: …)` falla del todo. Con letras en inglés los paréntesis solos pueden fallar de vez en cuando. Así dividida, la voz principal sale con mucho aire alrededor. **Tres puntos** (`...`) tras una palabra hacen una pausa corta. Escrita así, una canción puede alargarse (la suya llegó a 8:27) o, con las mismas palabras, salir más corta que antes, lo que deja sitio a los interludios instrumentales.
  - **Una palabra hebrea con sus puntos vocálicos** (`רוּחַ`) el modelo la dice mejor que en transliteración.
  - **Los corchetes son una orden** para YuE2: una sección, una voz, cómo se canta o se dice una línea. Aquí hay mucho con qué jugar.
- **Voces** (no son sección: las líneas siguen en la sección anterior). La forma de Viktor: `[Vocal: Female - …]` o `[Vocal: Male - …]` para una línea cantada, `[Spoken: Female - …]` o `[Spoken: Male - …]` para una dicha; primero quién, tras un guion cómo (`[Spoken: Female - Soft Whisper, Intimate, Sacred]`). Una etiqueta hablada puede encabezar la propia línea: `[Spoken: Female - Soft Whisper] Ты слышишь?`. En una balada larga con un adaptador de voz masculina y una narradora (13.10.2026) YuE2 siguió esas etiquetas cerca del 95 % de las veces, con más constancia que SUNO. **Solo** no se oye en una etiqueta de voz (los ejemplos lo reservan para instrumentos: `[Guitar Solo]`): nombra la voz. «[» las ofrece tras las secciones, marcadas *no es sección*.
- **Una sílaba mueve toda la canción.** YuE2 lee la letra como una sola cadena antes de escribir la música: cambia una sílaba, unas «», una etiqueta, y la misma semilla toma otro camino desde ahí hasta el final. La semilla es el dado, no la canción. Para cambiar una línea y conservar el resto, reemplaza su sección (clic derecho en la onda del reproductor); para juzgar palabras nuevas, escúchalas con varias semillas.
- **Duración**: YuE2 sostiene una canción de 8 a 9 minutos, más que los 6:15 de SUNO v6. *Duración máxima* llega a 15 minutos para una narración, pero más allá de 9 es suerte de la semilla.

### VAE y LoRAs <!-- #vae-and-loras -->

- El **VAE** convierte la canción escrita en sonido: **Estándar** (el mejor sonido), **Anterior** (el de las pruebas de referencia), **Mezcla** (una mezcla de los dos, un complemento). Una toma terminada puede añadir otra decodificación más tarde desde su propia página. Se elige en el menú **☰**, bajo el modelo, para las canciones que vienen; una toma se decodifica de nuevo con otro desde su tarjeta en segundos (desde rc2 cada toma guarda sus latentes; una hecha antes vuelve a generar su sonido).
- **LoRAs**: adaptadores para la mitad musical, la sonora o ambas, cada uno con su propia fuerza: el deslizador de la mitad musical empieza con un acorde, el de la sonora con una onda (el puntero encima dice cuál es). Un nombre más largo que su columna se corta y se ve entero bajo el puntero. **Añadir una LoRA** guarda los adaptadores que no están en la canción tras una sola línea: una búsqueda los encuentra por cualquier palabra (el nombre, el tipo, las mitades, la etiqueta, el disparador, la nota), los tipos los filtran (*voz*, *canto*, *estilo*, *instrumento*, *partitura*), cada tipo es una franja a la izquierda de la ficha (la voz de un locutor lleva una segunda, de color según la primera letra del nombre, como los contactos de un teléfono), dos columnas en una pantalla 1080p y más en una más ancha, su propio desplazamiento pasados 800 px.

**La onda de una LoRA.** Un adaptador empuja con su fuerza desde el primer segundo hasta el último: plana. La pequeña imagen al final de su fila abre su onda: **Plana** la deja así; **Arco** la deja subir a la fuerza plena en el centro de la canción y aflojar en ambos extremos; **Dibujar** la forma a mano: arrastra un punto hacia arriba para un destello, hacia abajo para un desvanecimiento, a lo largo de la canción para moverlo; doble clic añade un punto, doble clic en un punto lo quita. La fuerza que fijas es la cima de la onda; los dos archivos de un par (la mitad musical y la sonora) van sobre una misma onda. La mitad musical la recorre token a token mientras se escribe la música, la sonora fotograma a fotograma mientras se hace el sonido, del principio al final de la duración de la canción; va en la petición de la toma, así que una toma hecha de nuevo recorre la misma onda, y la tarjeta de la toma dice *una onda*. **Secciones** lo hace sonar solo en las secciones que marques, con una breve rampa en cada límite: los límites salen de los compases de la partitura cuando la canción la tiene; si no, aproximadamente de las líneas de la letra.

![La onda de un adaptador de voz dibujada a mano: sube, se sostiene, baja y vuelve](guide/lora-wave.png)

**La cuadrícula de la onda.** El gráfico cuenta la fuerza en cuartos y la canción en minutos y segundos. Su tiempo recorre la duración fijada en **Salida** (Duración máxima), no la duración de la propia canción: el motor extiende la onda sobre esa duración. Escribe en **Canción ≈** cuánto durará la canción, más o menos: una línea discontinua marca su final, y lo que dibujes después no se oye. **Shift** mantiene en la cuadrícula el punto que arrastras, un clic derecho quita un punto, y la lectura sobre el gráfico dice dónde está el puntero. El botón junto al nombre de las LoRA las sube sobre la página, hasta 1800 px de ancho, para mover los puntos con precisión; Esc las devuelve a su sitio. Pon la **Salida** cerca de la duración que esperas, para que se oiga la onda entera: una toma pedida para 9:00 que terminó en 6:37 dejó sin oírse el último cuarto de sus ondas.

**Un arco emocional.** Un adaptador de voz en arco crece hacia el centro de la canción y se apaga en sus extremos, y la canción respira con él. En **En orden**, cuando dos adaptadores juntos pasan la línea roja, lo que suelta la onda del de arriba lo toma el de abajo: un duduk en arco sobre una voz se pasa la canción con ella. Se oye y se mide: en una toma cuyo adaptador de duduk se dibujó alto, luego bajo y luego en subida, el stem de vientos separado de la canción siguió la misma línea (−30 dB al principio, −59 dB en el medio, −36 dB hacia el final).

![LoRAs: cada fuerza en un camino del verde al rojo, y la mitad musical en conjunto](guide/loras.png)

Cada fuerza está en un **camino**: el verde es seguro, el amarillo es su límite, el rojo está más allá. Los límites están medidos:

- todos los adaptadores igual, en décimas de los deslizadores: la mitad musical verde hasta **0.4**, roja desde **0.5**, **0.75** como mucho (un adaptador de partitura, el que planifica ABC, conserva los suyos: verde hasta 1.0);
- la mitad del sonido verde hasta **0.6**, roja desde **0.75**, **1.0** como mucho;
- **Música, en conjunto** y **Sonido, en conjunto**: los adaptadores apilados se suman, y cada uno puede estar en su verde mientras la suma rompe la partitura. Mientras el modelo escribe la partitura, la mitad musical en conjunto es verde hasta **1.2** y roja en **1.4**, su máximo: en los planes del estudio (13–20.10.2026) hasta 1.0 juntas no se rompió ninguno de 6, de 1.0 a 1.2 14 de 35 (en IRAEv3 8 de 10), por encima de 1.2 8 de 9. Con una partitura en el formulario la mitad musical no escribe ninguna, y la barra llega a 3.5 (entera hasta 2.25 en tomas reales, rota desde 2.5). La mitad del sonido en conjunto es verde hasta 1.2, 1.5 como mucho. El plan tiene además un fusible: en Plan completo sin partitura propia, los adaptadores que juntos pasan de **1.0** (**0.8** en IRAEv3) planifican la partitura reducidos en proporción a ese valor, y la canción se canta sobre ella con sus propias fuerzas. Un plan roto no se canta: con una semilla de música aleatoria se planifica de nuevo una vez; después de eso, o con una semilla fija, la ventana de Babel dice qué pesó sobre él (los adaptadores, el modelo base, la semilla, el fusible) y, si se lo pides, lo planifica de nuevo con una semilla nueva.

**Presupuesto.** Con dos adaptadores o más, bajo el camino está **Presupuesto**. Ningún modo encendido: sin presupuesto, cada uno va con su propia fuerza, como antes; el encendido, pulsado otra vez, suelta el presupuesto. **Repartir**: los adaptadores que empujan sobre las mismas capas comparten un presupuesto por mitad, con la línea roja como tope; pasada esta, cada uno cede en proporción. **En orden**: la fila de arriba toma primero su fuerza, la siguiente lo que deja la línea roja, y lo que suelta una onda lo toma la siguiente; arrastra las filas por su nombre para fijar su orden. El motor mantiene el presupuesto en cada momento de la canción. Qué adaptadores comparten capas lo mide el propio estudio: la pista sobre el nombre de un adaptador dice dónde empuja (las capas de cada mitad, atención frente a MLP, cuánto mueve una capa a 1.0), y las notas junto al nombre de las LoRAs dicen cuándo dos comparten capas y cómo tiran: en el mismo sentido (juntos empujan más fuerte de lo que dicen sus fuerzas), uno contra otro o de través. Una fuerza que el presupuesto retiene muestra lo que corre de verdad: su número se vuelve ámbar, su camino se apaga más allá del corte y su indicación dice por qué; **Música, en conjunto** y **Sonido, en conjunto** muestran lo que corre de lo pedido (la suma es la misma en ambos modos, las filas difieren). Los deslizadores van en décimas; un doble clic escribe centésimas.

**Más allá de los límites.** La casilla al final de la fila del presupuesto deja que cada deslizador pase de su propio máximo (la mitad musical hasta 1.5, la sonora hasta 2), y los de conjunto también; los caminos conservan sus colores, así que el rojo medido sigue a la vista, y el presupuesto no retiene ninguno. Es para un adaptador cuya onda suena solo en parte de la canción (un duduk fuerte en la intro y luego nada): no tiene por qué quitar su parte a los demás durante toda la canción. La partitura se sigue planificando con la mitad musical rebajada al fusible del plan (1.0 en conjunto, 0.8 en IRAEv3) y se canta con las fuerzas puestas. **Fuera de la partitura** (clic derecho en una fila): su mitad musical canta la partitura pero no la escribe; el plan se hace sin él y la fila dice *solo canta*.

**Doble clic** en un número para escribir una fuerza exacta. Las indicaciones bajo el bloque dicen lo que importa: una palabra activadora que falta en el estilo, un adaptador entrenado en otro modo de planificación, una fuerza más allá de su límite. Mientras el puntero está sobre un deslizador o lo arrastra, la fuerza exacta aparece sobre el puntero, en el color de su camino. El adaptador Instrumental se detiene en 1.0, donde empieza: más arriba sus partituras se desvían.

> **Un adaptador de partitura instrumental con palabras que cantar.** Un adaptador así planifica partituras *sin línea vocal*. A 1.00 dio una toma con una sola nota en 127 compases vocales: el cantante hablaba sobre dos compases en bucle. Con letra, mantenlo bajo, de 0.3 a 0.5. El ⚠ junto al nombre LoRA lo avisa cuando ocurre.

### Perfiles y modos de planificación <!-- #profiles-and-planning-modes -->

- **Perfil** fija de una vez el modo, la duración, el muestreo, la guía, los pasos, el VAE, las LoRAs y la salida; los textos y las semillas se quedan. *Guardar perfil…* guarda los controles actuales con un nombre.
- **Modo de planificación**:
  - **Plan completo**, por defecto: primero se escriben la melodía y los acordes (una partitura editable), luego la canción. Lo mejor para canciones nuevas.
  - **Solo melodía**: un plan de melodía, acompañamiento libre. Recomendado para versiones.
  - **Directo**: directamente desde la letra y el estilo, sin partitura. Los adaptadores entrenados sin partitura van aquí.
  - **Instrumental**: sin voces, la receta oficial de YuE2. Está a la derecha de la línea del modo de planificación.
- **Acordes**, bajo los modos: *Apagado*, *Suave*, *Variado* o *Audaz*, cuánto pueden alejarse los acordes de una partitura que planifica el modelo. Por sí solo, el planificador tiende a repetir una misma progresión en toda la canción; *Suave*, *Variado* y *Audaz* hacen que un acorde oído entre los cambios recientes vuelva más tarde y mantienen los primeros acordes de una sección apartados de la anterior, y *Audaz* deja además que un acorde salga de la tonalidad de vez en cuando. Solo actúan cuando el modelo escribe la partitura: Plan completo o Solo melodía, sin partitura tuya o solo con su comienzo. Medido en el plan de una canción: apagado, seis acordes y la misma serie de cuatro acordes trece veces; con la fuerza de *Variado*, nueve acordes y la serie más común cuatro veces. A partir de Yeufonic, a través del yue2.cpp de timoncool. *Suave* es el valor por defecto.
- **Plan completo o Directo.** La palabra de Viktor tras una semana de canciones: Directo es el acierto o fallo de SUNO (unas dos tomas buenas de cada cien, según su cuenta); Plan completo es el camino para todos, incluso sin leer una nota de ABC: las etiquetas se respetan, el sonido se asienta, la dicción se sostiene y el tempo se puede prever. Medido en su rap, catorce tomas de cada modo con Whisper escuchando: la mejor toma de todas fue una de Plan completo con su receta conservadora (el 84 % de las palabras oídas, el 76 % en el último cuarto). Donde Plan completo falla, falla al final: una toma dura lo que su partitura, y el plan puede tener menos secciones que el texto (entonces los últimos versos se quedan fuera o se vuelve a cantar uno anterior); tras las últimas palabras siguen sonando los compases que le sobran a la partitura, y esos son los 10–15 s después del buen fundido de una canción, no la guía (CFG). Escucha el final de una toma en Plan completo: *End at…* corta una cola, *Regenerar desde…* escribe de nuevo un final perdido.

### Versiones, remezclas y tu propia partitura <!-- #covers-remixes-and-your-own-score -->

- **Versión o remezcla**: toma la melodía de una grabación (*Transcribir*: solo su melodía, no la letra ni el cantante), o la melodía de una de tus tomas, y dale un estilo nuevo.
- **Ajustar secciones** (junto a *Transcribir*, una vez que la partitura de la grabación está dentro): Whisper oye dónde empieza cada bloque de tu letra en la grabación, y cada bloque toma la etiqueta de la sección de la partitura en la que se canta. Las palabras no cambian: un bloque ya nombrado por su tipo conserva su etiqueta, uno que no se oyó conserva su lugar (dudoso), un estribillo escrito una vez se copia donde se vuelve a cantar, y las secciones donde la voz no canta reciben una etiqueta vacía. Ves la propuesta, y puedes editarla, antes de que entre en el formulario; la letra que había se guarda como versión. A partir de YuE2-Studio de timoncool y Cover Studio de HOT-Step.
- **Tu propia partitura**: una partitura ABC, seguida en Plan completo y en Solo melodía. Transponla (a la más cercana, hacia arriba o hacia abajo), mueve una voz por grados de la escala, importa un archivo MIDI (una línea melódica por voz), exporta MIDI o marcadores para un DAW, carga un ejemplo, vuélvela instrumental. **Generate** con una partitura aquí pregunta primero: sobre esta partitura o una nueva (el campo se vacía y el modelo de la canción escribe una). La partitura recuerda los adaptadores y las fuerzas de música con que se escribió (un plan, la partitura propia de una toma); cuando los de ahora difieren, lo dice una línea bajo ella y la propia pregunta: con otras fuerzas la música puede apartarse de la partitura, sobre todo en Industrial Rock e instrumentales. En Full la partitura sigue abierta mientras tenga algo. **Solo el comienzo**, bajo la partitura: la partitura del cuadro es solo el comienzo de la canción, unos compases tocados en el piano roll o en un teclado MIDI, tarareados y escritos desde el sonido, o tecleados, y el modelo planifica a partir de él el resto de la canción, en su tonalidad y su compás; toda la partitura, tu comienzo primero, se canta y queda como la de la toma. Plan completo o Solo melodía; *Acordes* guía lo que añade el modelo. A partir del hum-to-song de Mothersuperior, a través del yue2.cpp de timoncool.
- **El piano roll** (el botón con un pentagrama, junto a *Quitar la partitura*): la partitura en toda la ventana. Arriba, la partitura en papel dos veces: como la escribió YuE2 y como está ahora. Abajo, el tiempo baja hacia dos teclados, el de Vocal sobre el de Ins; las teclas del mismo tamaño en cualquier pantalla, las octavas de más allá esperando en los bordes (un teclado pequeño de ellas al pasar el puntero). Un clic escribe una nota de la duración de la rejilla, arrastrar la mueve, su borde inferior la alarga, clic derecho o Supr la quita; una voz de YuE2 canta una nota a la vez, así que una nota puesta sobre otra la aparta. Las sílabas de la letra están sobre las notas de Vocal. **Shift** con teclas juntas forma un acorde en el compás del cursor; las teclas del ordenador tocan una octava y media (blancas en A…', negras en W…], Z y X una octava), también toca un teclado MIDI (**MIDI**), y con **Rec** la tecla tocada se escribe en el cursor. **Reproducir** (Espacio) suena desde el cursor, el original o el editado, Ins como teclas, Vocal cantado con los nombres de las notas, o ambos. **Escribir en la partitura** devuelve solo las líneas que cambiaron. De noche el papel es oscuro, de día gris. Los papeles siguen la banda (la reproducción, el cursor o adonde se desplazó la banda), con el compás en uso iluminado en ambos; un papel desplazado a mano arrastra al otro y a la banda, y un clic en una nota del papel pone el cursor en su compás. Ins suena como un piano de cola; Vocal canta las vocales mismas, a, e, i, o, u, como las sostienen los cantantes de VocalSet, sin ruido antes de ellas. **Sonido ▾**, junto a **Play**, tiene el **Pedal** (*Notas largas*, por defecto: una nota de un tiempo o más sigue sonando tras su final, apagándose, hasta que el pedal se cambia en la siguiente barra de compás; *Siempre*: cada nota; *Apagado*), la **Acústica** alrededor del piano y la voz (*Seca*, *Sala*, *Auditorio*) y la **Tapa** del piano de cola (*Abierta*; *Cerrada*, más oscura y suave). La guía de las teclas queda tenue sobre las octavas graves de la banda; su casilla la pliega. **Motor → Hardware → MIDI** activa el MIDI para todo el estudio: un teclado toca en el roll, el puerto DAW de un M-Audio Oxygen (Mackie Control) lleva Play, Stop y Record. El navegador solo da MIDI a una página abierta como localhost o por https: desde otro ordenador, `ssh -L 7777:localhost:7777` a la máquina del estudio y abre http://localhost:7777. Las flechas en los extremos de los teclados mueven las teclas una octava y ◎ las devuelve a las notas de la partitura; una palanca entre los papeles y el roll da más sitio a uno u otro (se recuerda; un doble clic: como al principio), y en una pantalla alta las teclas de Ins toman la longitud propia de un piano de cola. **Reproducir** suena al tempo de al lado (una partitura en tempo libre no tiene, así que el roll toma el último fijado), y ↑ lleva un papel de vuelta a su inicio. Vocal canta una frase como una sola voz, con las sílabas de la letra o con *Do Re Mi*. La rueda de pitch de un teclado MIDI mueve el cursor en el tiempo y su rueda de modulación fija la duración de una nota nueva. **⇅ Transponer**: arrastra por los números de compás a la izquierda para elegir un segmento, y dibuja el desplazamiento con una línea de puntos, por un semitono, un cuarto, un tercio o media octava, una octava o dos, por escalones o suave; *A menor* o *A mayor* cambia una parte con sus acordes, *En la tonalidad* mantiene sus notas en ella; *Aplicar* es un solo paso de deshacer. El número de teclas en la cabecera abre su lista: cuántas teclas tiene tu propio teclado MIDI (88, 61, 37 o 25, cada una dice qué es) y qué octavas se ven; el tempo, un botón en negrita junto a **Play**, abre la suya: −4, −1, +1, +4, un deslizador y el de la partitura. Sin compases elegidos, **⇅ Transpose** toma la sección en el cursor. La letra está también bajo el pentagrama Vocal de los dos papeles, y las pocas notas que la intro da a la voz antes de la estrofa cantan las primeras sílabas de la estrofa. Una partitura en la que YuE2 escribió un compás fuera de su compás (18/16, por ejemplo) también se abre: el roll lee ese compás igualado (lo que sobra, cortado; un compás corto, completado con un silencio) y lo dice, y una línea que no tocas vuelve como la escribió YuE2. Las palabras del papel van en Noto Sans, estrechada como en una partitura impresa: los nombres de las voces al 76 %, acordes y letra al 90 %.
- **Recitar la letra sobre una partitura** (*Lay the lyrics on this score…*, bajo la partitura cuando se lee): el narrador del promo del estudio, para tus palabras. Cada línea va sobre los compases de la partitura, una sílaba una corchea (una semicorchea, como se dice el rap, donde con corcheas quedarían líneas fuera) en un tono del acorde de su compás, una respiración tras una coma y un punto, la última sílaba de la línea una negra más abajo; cada sección empieza en una frase de dos compases tras un compás de silencio, o tras un vocalise si lo marcas. Los instrumentos, los acordes, la tonalidad y el tempo se quedan; las secciones de la partitura siguen tus etiquetas, con una intro y un outro alrededor. Para spoken word, lecturas y rap sobre una base: haz la base, *Escribirla a partir del sonido*, y luego esto; pregunta antes, y Ctrl+Z en cada cuadro devuelve el texto anterior.
- **Base de acordes** (*Base de acordes* bajo la partitura: la tonalidad, el compás, el tempo y *Escribir una base*): una partitura sin melodía, solo su armazón. Cada sección de tu letra recibe compases, unos 2.5 s por línea cantada en pares de compases, un corte instrumental, una intro y un final unos pocos propios, y cada compás un acorde; los compases de la voz son silencios y los de los instrumentos están vacíos. La tonalidad y el tempo salen del estilo cuando los nombra, y cada pulsación sortea progresiones nuevas: una para las estrofas, otra para los estribillos, una tercera para los puentes. El modo de planificación pasa a *Plan completo*. El modelo escribe la melodía por sí mismo y canta tus palabras sobre esa armonía: tú eliges los acordes y la forma, él encuentra la tonada. Medido en dos tomas (22.10.2026): el sonido siguió los acordes de la base compás a compás, más de cerca que las 300 mezclas de los mismos acordes y que los mismos acordes en cualquier otra tonalidad; cantó sobre los silencios (la voz en el 75 % y el 34 % de los fotogramas, frente al 79 % y el 49 % con una partitura planificada); y una toma no queda atada a la duración de la base: ambas duraron unos 70 s sobre una base de 40 s y siguieron con su última progresión. Portado de YuE2-Studio de timoncool (MIT).

### Muestreo y eliminación de ruido <!-- #sampling-and-denoising -->

![Muestreo: el planificador de la partitura y los tokens musicales, los límites de tokens bloqueados](guide/sampling.png)

Los valores por defecto están afinados. Las tres filas de **forma** (Composición, Interpretación, Influencia del estilo) mueven los controles juntos en cinco pasos; los controles en sí están debajo.

- **Planificador de la partitura** y **Tokens musicales**: temperatura, top-p, top-k, penalización por repetición, ventana de penalización.
- **Tokens mínimos** y **Tokens máximos** están **bloqueados** contra una edición accidental: haz clic en el 🔒 junto al nombre para cambiarlos, y otra vez para bloquearlos. Los mínimos son fusibles: una partitura no puede terminar antes de 200 tokens, ni la música antes de 750 (30 segundos; una duración pedida más corta lo baja a esa duración). El máximo de la música se muestra como **Duración máxima**, en tiempo (25 tokens por segundo), sin candado: es la duración de la canción como mucho, y solo se fija aquí («Sonido y salida» no tiene campo de duración).
- Cada control se mantiene dentro de límites sensatos; un valor fuera de ellos vuelve atrás, y la página lo dice.
- **Guía (CFG)**: la guía de la música, el tirón del estilo en la etapa de la música; 1.6 por defecto en todos los modos.
- **Guía de la letra**: la propia de la letra, aparte del estilo: una tercera rama, el prompt sin la letra, junto a las dos que la guía siempre tuvo; 2.2 por defecto. El oído de Viktor en una canción popular: guía 4.0 con la letra en 2.2 lo más brillante, 3.0 con 2.2 igual, 3.0 con 1.6 una profundidad propia, la letra en 2.6 adelanta el shaker; en 1.6 las palabras se disuelven, aterciopeladas. Iguales, media letra se va a la alucinación, se pierde la С (s) y el acento de las vocales se tuerce: mantén las dos 0.4 a 1.0 aparte. Una luz junto a cada campo lo dice: verde dentro de su rango (la música 1.0–4.0, la letra 1.0–2.6, aparte por 0.4 o más), ámbar un poco más allá, roja muy lejos; nada se recorta. Vacío, la letra sigue a la guía, como antes.
- **Sonido y salida**, la sección inferior del mismo bloque: **Pasos de eliminación de ruido** y **Resolvedor** para la mitad sonora, **Formato** (WAV de 24 bits, 16 bits, 32 bits en coma flotante o MP3 con su bitrate) y **Recorte de picos**; *Restablecer la salida* los devuelve. De los resolvedores, *Midpoint · versión oficial* y *Heun* llaman a la red dos veces por paso, *Multistep · AB2* (Adams–Bashforth de segundo orden: reutiliza el paso anterior) una vez por paso, y *Euler · borrador* una vez, de primer orden. Después, **Decodificación del sonido**: *Canción entera · estándar* (la predeterminada y la única decodificación en el resto del Estudio) o *Escalera · experimental*: la mitad del sonido en trozos iguales de unos 20 s, cada uno oyendo 2 s más allá de sus bordes, las uniones con fundido cruzado; con los mismos códigos y semillas sale cerca de la decodificación de la canción entera, no igual.

**Una receta conservadora para el ruso** (de Viktor, de oído): Composition *low*, Performance *low*, Style influence *high*: el planificador de la partitura a temperatura 0.85, top-p 0.92, top-k 40, los tokens musicales a 0.85, 0.93, 80, las penalizaciones de repetición 1.005 y 1.3 en una ventana de 100, guía 1.6 con la propia de la letra 2.2; 32 pasos de eliminación de ruido con Midpoint. Sin aceleraciones, rap a un ritmo moderado. Es el perfil integrado *Musical Heresy of Creator's Ear*, que ajusta Viktor: Guardar sobre él en los perfiles mantiene sus valores en Forge, Borrar devuelve estos.

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
- **Hacer de nuevo**: *Nueva toma* (una toma nueva con la misma petición), *Usar como base* (la petición de vuelta al formulario), *Volver a renderizar el sonido* (la misma música, sonido nuevo), *Regenerar desde…* (conservar el comienzo, escribir el resto de nuevo), *Transcribir esta toma*, *Recortar al texto* (cortar una cola tras la última línea cantada), *End at…* (la toma termina en el momento que elijas, con un fundido de sus últimos 2 s; desde sus latentes guardados, en segundos), *Fade in…* (los primeros segundos suben desde el silencio, 2 s si no dices otra cosa; del mismo modo). *Extender…* conserva la toma entera y la sigue más allá de su final, de 0:15 a 2:00 más, con líneas nuevas tras las suyas si se las das (una toma planificada con partitura sigue en Direct: su partitura termina donde termina la toma).
- **Editar** (cada vez una toma nueva; esta se queda): *Recortar…* conserva el tramo de una sección a otra; *Quitar una sección…* saca secciones; *Repetir una sección…* toca las secciones marcadas dos veces, la copia justo después (el último estribillo una vez más); *Insertar una parte…* pone una copia de una sección después de otra (una intro o un corte como interludio); *Velocidad…* la hace más rápida o más lenta, sin cambiar la altura. Todo en las líneas de compás de la partitura (la propia de la toma o la escrita a partir de su sonido), cada unión curada con un breve fundido cruzado, la partitura unida con ella. Cada uno de estos diálogos, como los del menú de la onda, muestra la onda de la toma con sus tramos marcados: lo que se copia, dónde entra, lo que se va y lo que se queda, siguiendo tus marcas.
- **Pulidor**: *Espectro*, *Revisión de la letra*. **Archivos**: la petición y la partitura. *Loop…*: 1, 2, 4 u 8 compases sobre las barras de compás de la partitura desde el compás donde está el reproductor, sin costura (su final fluye a su inicio), guardado como WAV con su tempo y tonalidad en el nombre.
- **Nota**: qué funciona, qué arreglar, adónde va.
- La tarjeta de abajo dice cómo se hizo: modo, formato, VAE, modelo, pasos, la forma, las LoRAs con sus fuerzas y sus ondas, ambas semillas (cópialas para repetirla).
- **Sobre la sala** (⤡) la toma va en dos columnas: qué hacer con ella, su estilo y su letra a la izquierda; cómo se hizo, su VAE y su partitura a la derecha. Una toma nueva se abre con Style y Lyrics plegados; las herramientas van en grupos enmarcados.

![Cómo se hizo una toma](guide/take-info.png)

### Reemplazar una sección <!-- #replace-a-section -->

Cuando el estudio ha situado de oído la letra de una toma (las secciones dibujadas sobre la onda del reproductor), una sección puede cantarse de nuevo mientras el resto queda como estaba. Clic derecho en la onda sobre la sección → **Reemplazar esta sección…**.

- **Qué se canta**: cada sección oída con claridad es una ficha; la que pulsaste está marcada, y puedes marcar más, hasta ocho. Cada sección marcada muestra sus versos tal como están en la letra: cambia las palabras, o déjalas y que solo la música sea nueva. El diálogo avisa cuando las palabras nuevas tienen más sílabas que la sección (el modelo las canta más rápido o se pasa del corte) o menos. **Cantarla de nuevo** lo empieza.
- **Qué llega**: una o dos versiones, cada una una toma propia e hija de esta, nombrada por la sección y su tramo («Song · Chorus 1:02–1:25 anew A»). Llegan al espacio de trabajo de la toma (a «Reemplazar una sección» cuando ese no admite tomas nuevas) y aparecen en Tomas a medida que cada una termina.
- **Cómo se une**: los cortes caen en los silencios oídos alrededor de la sección. La música de la toma hasta el primer corte se conserva, la sección se canta con una semilla de música nueva, se une a la música propia de la toma después de ella en los tokens del propio modelo, y el conjunto se renderiza de nuevo con la semilla de sonido de la toma: lo que no se reemplaza suena como sonaba, y las uniones no se oyen. Varias secciones se cantan por turno y la duración no cambia, así que los cortes posteriores quedan donde los oíste.
- **En el reproductor** el tramo nuevo se ve teñido y enmarcado, con «de nuevo» encima; su tarjeta dice que el resto es tal como lo hizo la toma de la que viene.
- **Los cambios pequeños funcionan mejor**: un verso con las mismas sílabas, una palabra, una etiqueta. Una semilla nueva también puede cantar una sección sin su letra: escucha las dos versiones. Una comprobación de que cada versión cantó su letra llega en la 2.1.0.
- **Cantarla otra vez…** e **Insertar un interludio después…** (el mismo menú): la sección se canta otra vez justo después de sí misma, enseguida o tras unos 4 o 7 s de música, una variación con la semilla musical de la toma + 1 (y + 2), no una copia; o unos 5, 7 o 10 s de música después de ella, sin cantar nada de nuevo. El modelo toca cuanto quiere, así que el estudio corta según la voz del propio borrador, separada en el procesador, y en las líneas de compás de la partitura: entran compases enteros de su música (de su mitad, si tocó más), y la música propia de la toma sigue después en su pulso. Tomas nuevas; esta se queda.
- **Volver a cantar esta línea…** (el mismo menú, sobre una línea): solo esa línea se canta de nuevo con una semilla musical nueva, sus palabras cambiadas o las mismas, cortada a mitad de camino de las líneas vecinas; el resto de la toma queda como estaba. Donde las líneas se encadenan sin respiro entre ellas, escucha las dos versiones.
- **Cantar una ventana de nuevo…** (el mismo menú, en cualquier punto de la onda, sin secciones): un tramo que pones arrastrando por la onda de la toma se canta de nuevo con adaptadores propios: al principio los de la propia toma, cada uno con su fuerza de música y de sonido y su onda en la ventana (plana, arco, subida, bajada), y puedes añadir otros de tu carpeta loras/. En las rampas antes y después (2 s cada una al principio) los adaptadores de la toma ceden ante los de la ventana y vuelven, así que el cambio entra y sale en vez de saltar; el resto de la toma queda como estaba, renderizado de nuevo con su propia semilla de sonido. Una o dos versiones, hijas de la toma, marcadas en el reproductor como una sección reemplazada.

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

Los pasos son nodos en el lienzo de abajo, de tres clases según avanza el trabajo: **Análisis** (Espectro, Artefactos, Letra), **Reparación** (Antizumbido, Reescalado, Stems) y **Acabado** (DAW, Remasterizar). Un clic en un nodo abre su paso en una ventana sobre el lienzo, y lo hecho a partir de la toma cuelga de su árbol. Los pasos propios de un plugin se suman a **Acabado** con un borde discontinuo (ver `docs/PLUGINS.md`). Un paso de un plugin marcado **GPU** se ejecuta en una tarjeta de los trabajos del laboratorio, en su turno, y un paso hecho para un tipo de archivo (por ejemplo, un stem de voz) toma solo como fuente el último archivo de ese tipo, hasta que elijas otro.

Todo lo que se hace a partir de una toma cuelga de su **árbol** (*Creado a partir de esta toma*), lo más nuevo arriba: primero **el original**, con su reproductor y su FLAC, luego cada rama, reproducible y utilizable como fuente del paso siguiente. Lo que corre se muestra donde miras: en la cabecera de la sala, arriba del bloque del propio paso y como un punto que late en su pestaña. El bloque de cada paso lista lo que hizo para la toma (*Creado aquí*: un clic lo encuentra en el árbol), y el paso abierto ilumina sus propias ramas. **Eliminar**, al final de la cabecera de una rama, la lleva a la papelera de la toma (preguntando; una rama de la que se hicieron otras pregunta de nuevo y se las lleva consigo); **Papelera**, bajo el árbol, devuelve una, y **Vaciar la papelera** borra para siempre. El árbol tiene su propio lugar al final de la columna de pasos del Pulidor: **Creado a partir de esta toma** bajo *Esta toma*, en su marca el número de sus ramas; un clic lo abre donde está un paso, y enciende las ramas del paso del que vienes. Lo que corre en Forge tiene además su barra sobre el reproductor en cada sala, con el tiempo que le falta. Con un monitor guardado en **Audio I/O** (una segunda salida en Forge), cada fila tiene **En Forge**: el archivo suena por él desde donde está su reproductor, y otra vez lo detiene.

**Comparar todas** (en la fila del original, o *Comparar* en cualquier rama) abre todas las versiones en un solo reproductor, como SUNO cambia de versión: el original, el que pasó por el antizumbido, las remasterizaciones, los reescalados, los stems. Un clic en otra versión, o su número (1–9), la reproduce **desde el mismo segundo**; la barra espaciadora reproduce y pausa, ← → mueven cinco segundos, Esc cierra. También está en él, tras el original, la misma música en otras tomas: sus re-renderizados con otro VAE u otra semilla sonora, cada uno con su VAE, su semilla y cuándo se hizo; una toma marcada con «no me gusta» no aparece. Con **Sonoridad igual** (activa hasta que la apagues) cada versión se baja a la sonoridad de la más baja, medida en Forge, y su fila lo dice: el oído compara el sonido, no el nivel.

### Importar una pista <!-- #import-a-track -->

WAV, FLAC, MP3… de donde sea: se convierte en una toma de la biblioteca (48 kHz, 24 bits), marcada como *importada*, lista para stems, remasterización y lo demás. La letra es opcional; la revisión de la letra compara con ella.

### Los pasos <!-- #the-steps -->

![Los pasos](guide/post-steps.png)

No hay una cadena hecha: el camino de la toma lo trazas tú en el lienzo, de nodo en nodo (ver *Tu propio camino* abajo), o empiezas desde una pipeline, y **Ejecutar el camino** en la cabecera de la sala lo ejecuta. En un camino que separa stems de la toma tras el Antizumbido (y el Reescalado), la remasterización los mezcla, así que su preset y su de-esser actúan también ahí; un reescalado antes de separar deja que los separadores oigan la canción entera, y uno al final redibuja la parte alta que dejan los stems y la remasterización (un siseo por encima de 20 kHz, casi nada por encima de 22). Uno a uno:

1. **Espectro**: espectrograma, espectro medio, energía por bandas; superpón otra toma para comparar.
2. **Artefactos**: un tono que no se va, el zumbido de 25 tramas del VAE en los agudos, clics, saturación, cortes, un estéreo que lucha consigo mismo. Un clic en un tiempo reproduce desde ahí.
3. **Antizumbido**: el decodificador de YuE2 escribe el sonido en tramas de 1920 muestras, 25 por segundo, y sus agudos tiemblan con ellas. Este paso quita la parte atada a ese reloj de tramas por encima de 2 kHz. 80 % es la elección del oído; 100 % adelgaza el comienzo.
4. **Letra**: Whisper escucha y compara lo que oye con tu letra, minuto a minuto; *Sincronizar las líneas* para la sincronía de karaoke. Sobre el stem vocal oye las palabras sin la música. Las líneas cronometradas se descargan como .lrc y .srt, y como **.lrc (por palabras)**, con cada palabra en su tiempo, para un reproductor que acompaña el canto (las líneas siguen siendo tuyas; de Whisper solo vienen los tiempos).
5. **Stems**: cuatro stems (BS-Roformer para la voz, luego htdemucs_ft para batería, bajo y lo demás; también el instrumental), seis stems (la misma voz, luego el BS-Roformer-SW de jarredou: batería, bajo, guitarra, piano y lo demás), ocho stems (los seis, con la voz en dos por un modelo de karaoke, **Lead Vocal** y **Backing Vocals**, y los vientos sacados del resto), o voces + instrumental. Cada stem lleva su nombre propio (Lead Vocal, Drums, Winds…) en el árbol, en su descarga y en tu DAW. *Origen* es la toma o un archivo suyo tras el Antizumbido o el Reescalado, cada origen con su propio juego; a tu DAW va el juego más nuevo de cada clase.
6. **Remasterizar**: mezcla los stems o usa la toma tal cual; limpieza, de-esser, opcionalmente reafinar 440 → 432 Hz, sonoridad (LUFS) y pico real. Cada pasada es una rama nueva. El preset y el de-esser actúan sobre los stems antes de mezclarlos: con la toma o cualquier archivo suelto como origen están apagados, y en un camino actúan cuando este separa stems.
7. **Reescalado**: UniverSR dibuja de nuevo la parte alta del espectro; el original se queda muestra por muestra por debajo del corte. Sobre un remaster (el último paso de un camino) el archivo entero baja de nivel si la parte alta nueva supera el techo de pico real del remaster.
8. **Pasarela digital**: la toma o cualquier rama a través de un carácter analógico en números en Forge: cinta (30, 15, 7.5 o 3.75 ips: la joroba del cabezal, los agudos, el siseo, wow y flutter, el azimut), consola, válvula (con su caída), transformador o vinilo (graves en mono, crepitar, retumbo). La curva corre sobremuestreada; el resultado suena tan fuerte como llegó, su pico real bajo −0.3 dBTP, y el árbol dice lo que añade a un tono de −12 dBFS. Los puntos de partida fijan un carácter con un clic; una rama suya puede ser el origen de la pasarela analógica o del Remaster.
9. **Voz principal entera**: en un conjunto de ocho stems, donde la separación metió la voz principal en Backing Vocals (más fuerte allí que en la principal, bastante fuerte y centrada), vuelve a Lead Vocal con rampas cortas. Principal y coros juntos siguen siendo lo que eran, muestra a muestra: la mezcla no cambia, solo qué stem lleva la voz. Ambos vuelven como versiones de sus stems para el DAW y los siguientes pasos del camino; el árbol dice dónde volvió la voz y por cuántos segundos.
10. **Reescalado de voces**: UniverSR solo en los stems de voz (principal y coros, o la principal sola) redibuja el aire, el aliento y el filo de las consonantes que los separadores apagaron; el resto por debajo del corte queda muestra a muestra. Cada uno vuelve a la frecuencia de su conjunto como versión de su stem. Su **Upscaler** es UniverSR solo (por defecto) o el conjunto de tres, UniverSR, Apollo-vocal y FlashSR, mezclados por encima del corte: promediados (medido como lo más cercano al agudo propio de una voz), el más fuerte, o aire (promedio hasta 16 kHz, el más fuerte por encima); **Agudo dibujado** sube o baja lo que dibujaron. Lo usan las pipelines *Voces: sutil, normal, alto, aire, brillante*. Apollo-vocal es no comercial (CC BY-NC-SA 4.0): una canción hecha con él es tuya para compartir, no para vender; FlashSR llega en el primer uso: sus pesos de los modelos del propio estudio (Apache 2.0, como declaró su autor) y su código de él.
11. **Antes y después**: cualquier archivo del árbol frente a aquello de lo que se hizo (una mezcla o una remasterización de stems frente al archivo del que se separaron los stems; la toma cuando no hay otra cosa), con su propio botón en cada archivo: sonoridad, pico real, rango de sonoridad, factor de cresta, anchura, correlación y la parte de cuatro bandas lado a lado, los espectros medios a igual sonoridad y su diferencia, y la sonoridad a corto plazo a lo largo de la canción; una imagen y una página de cifras llegan al árbol.
12. **Ajustar a una referencia**: el tono de un archivo se mueve hacia el de una referencia (un archivo del árbol de esta toma u otra toma), dejando aparte la sonoridad: hasta ocho bandas del propio DAW (frecuencia, ganancia, Q), cada una conservada solo si ayuda y queda dentro del límite que pongas. El archivo vuelve con el mismo ecualizador renderizado, tan fuerte como llegó o como la referencia y nunca por encima de −1 dBTP; **Al máster del DAW** en su rama pone las bandas en el ecualizador del máster para oírlas en vivo sobre tu mezcla.
13. **Mono en graves**: por debajo de una frecuencia (120 Hz si no eliges otra) se quita el lado del estéreo, sin desfase, el centro como estaba: el bajo y el bombo se asientan en el centro, y el estéreo de arriba sigue donde vive. La primera herramienta de Shaumarov en el bus de instrumentos y en el máster; la rama dice cuánto de los graves era lado antes y después.
14. **Pegamento de picos**: un compresor suave antes que nada: solo los momentos fuertes pierden los dB pedidos (3 si no eliges otro), los transitorios más agudos pasan y el archivo vuelve igual de fuerte. No sostiene techo: eso es del paso siguiente.
15. **Techo de true peak**: el último paso de un camino: un limitador con sobremuestreo y anticipación sostiene −0.5 dBTP (o −0.3, −1), comprobado por un medidor de true peak. *como llegó* solo atrapa los excesos al volumen propio del archivo; un objetivo de volumen (−14, −11, −9 LUFS) empuja hacia él, con 6 dB de limitación como mucho.
16. **Domador de la voz**: en los stems de voz, donde el espectro de la voz se abomba en ese instante sobre su propio curso (una resonancia, un armónico áspero: el lobo en la voz), la protuberancia baja una parte de lo que sobresale, 4 dB como mucho si no eliges otro valor, entrando y saliendo con suavidad; por defecto solo lo que sube sobre el color habitual de la propia voz, y nada por debajo de 2.5 kHz, donde viven las vocales. Lo que no sobresale no se toca; una «s» que zumba se suaviza donde zumba y nunca se acorta; una misma ganancia para los dos canales deja la voz donde estaba. soothe2 y SpecCraft de Shaumarov como pista; la rama dice cuánto tiempo actuó y dónde.
17. **Ataque y cuerpo de la voz**: en los stems de voz, el inicio de las palabras sube un poco (2 dB como mucho) y el desvanecerse de un sonido también un poco (1.5 dB); una vocal sostenida y el silencio quedan como están: la voz se adelanta sin el apretón de un compresor. Los dos compresores de transitorios de Shaumarov sobre la voz como pista.
18. **El bajo cede al bombo**: el bombo se encuentra en el stem de batería; mientras suena, la octava grave del stem de bajo (por debajo de 120 Hz si no eliges otro valor, dividida sin desfase) baja hasta 3 dB, tanto como suene de fuerte el bombo; entre bombos y por encima de la división el bajo queda como estaba. Hace falta un conjunto con la batería y el bajo por separado; el soothe2 de Shaumarov con la llave del bombo como pista.
19. **Detalles arriba**: tres bandas; en cada una los momentos suaves suben hacia su propio nivel fuerte, los fuertes nunca se empujan hacia abajo, el suelo y el siseo se dejan; se mezcla al 10 % como Shaumarov usa OTT y vuelve a la sonoridad con la que llegó: sube el detalle bajo las partes fuertes, no el nivel.

**Pipelines.** Junto a **Ejecutar el camino** está el camino en mano: **Mi camino** o una pipeline para empezar. El estudio trae *Pulido rápido*, *Canción: stems y remasterización*, *Canción: mi mezcla del DAW*, *Canción: todo el aire*, *Cinta cálida*, *Palabra hablada* y *Solo mirar*, y un complemento puede traer las suyas. Una pipeline se dibuja en el lienzo de nodo en nodo; *Omitir en el camino*, en el clic derecho de un nodo, salta uno de sus pasos. Cada paso toma lo que hizo el anterior, un archivo o el conjunto de stems tal como va corregido, así que la Remasterización y el DAW mezclan la voz principal entera y las voces redibujadas, no los stems tal como se separaron. *Como está el DAW* toma la mezcla que el DAW tiene para esta toma. Los cables de una pipeline se cortan y se tienden de nuevo como los de tu propio camino: el primer corte o cable la convierte en **Mi camino**.

**Muchas tomas.** **En el espacio…** junto a **Ejecutar el camino** ejecuta el camino en mano en cada toma del espacio en mano, o de toda la biblioteca cuando no hay ninguno, una tras otra en Forge, preguntando antes; el menú del Bibliotecario sobre tomas marcadas tiene **Refinar N por el camino**. La línea del lote a su lado dice cuánto lleva, qué falló y qué toma está en curso; **Detener** deja terminar esa toma y salta las demás.

### El lienzo: nodos y cables <!-- #the-canvas-nodes-and-wires -->

![El Pulidor como lienzo: cada paso un nodo, cableado por donde va el sonido](guide/studio-post-canvas.png)

El Pulidor es un lienzo de nodos, como ComfyUI dispone los suyos: la toma y cada paso en columnas según avanza el trabajo, cableados por donde va el sonido, y abajo a la izquierda lo que los alimenta, Importar una pista y Audio I/O; abajo a la derecha **Creado a partir de esta toma**, cuya ventana es el árbol de cada archivo creado de la toma. Toda la sala cabe en una pantalla a 1080p (en una ventana estrecha las columnas van en dos bandas de tres). Los nodos están numerados según fluye el trabajo, primero los pasos del camino, y **1…9, 0** abren el nodo de ese número, y dos cifras en medio segundo uno más allá del décimo (**1** y luego **2**: el duodécimo); cada nodo dice qué hace al pasar el puntero. Un clic abre un nodo en una ventana sobre el lienzo, tan grande como lo que contiene; **Alt+← →** van al paso anterior y al siguiente, **Esc** vuelve; el nodo de la toma abre las Tomas, para elegir otra. Arrastra un nodo adonde quieras: se ajusta a la cuadrícula de 10 px del lienzo. El icono de la cuadrícula en la cabecera de la sala, **Ordenar**, los dispone de nuevo.

El **clic derecho** en un nodo: *Abrir*, *Ejecutar hasta aquí* (el camino hasta este nodo y no más allá; un paso omitido en él se salta), *Omitir en el camino* (su paso se salta, el nodo en gris), *Probar el camino hasta aquí*, *Hacerlo el objetivo*, *Fuera del camino*, *Clonar* y *Ordenar*.

**Tu propio camino.** El camino lo trazas tú. Un estudio nuevo empieza solo con la toma: tira un cable desde su punto hasta el primer paso, y luego desde el punto de ese paso hasta el siguiente; un estudio que usaba la vieja cadena la encuentra aquí como su primer **Mi camino**. Un clic en un cable del camino lo corta ahí, y los pasos que siguen quedan fuera del camino. Un cable tirado desde el punto de un nodo hasta otro pone ese paso justo después en el camino (desde el punto de la toma, el primero), y el archivo más nuevo del primero pasa a ser el **Origen** del otro. *Fuera del camino* saca un paso y une los pasos de alrededor. El camino trazado así es **Mi camino**, junto a las pipelines, y lo guarda este navegador; **Camino nuevo**, la goma a su lado, lo vacía para trazar desde cero; **Ctrl+Z** devuelve el camino de antes del último corte, cable o vaciado. Un camino parte de una de dos fuentes: la toma o **Importar una pista**. El que se traza desde Importar una pista se ejecuta solo en cada pista que se importe después. Un camino sin ningún paso no ejecuta nada y lo dice.

**Ranuras y cables.** Las entradas de un nodo se nombran a su izquierda y las salidas a su derecha, como las ranuras de ComfyUI, de tres clases: un archivo (ámbar), un conjunto de stems (turquesa), un stem (violeta). Un cable sale de la ranura de su clase y entra en la ranura que lo acepta, con su color: el DAW acepta stems y las versiones de las voces y da una mezcla; un paso sobre un stem lo toma de un conjunto. El camino se dibuja grueso; qué se hizo de qué, fino; el origen propio de un paso, punteado y solo fuera del camino; mientras se arrastra un cable se ven los caminos que puede tomar y solo se iluminan los nodos que pueden aceptarlo. Un cable desde un paso fuera del camino lo pone donde va su tipo (después de Stems, y Stems también si falta), y el otro detrás; un cable al DAW además pone en sus pistas los archivos más nuevos de ese paso. La leyenda en la esquina del lienzo lo dice, y se pliega.

**Prueba y objetivo.** *Probar el camino hasta aquí* dibuja el camino tal como fluye hasta este nodo y comprueba cada paso con lo que le llega: un conjunto de stems para un paso que los mezcla, el stem que un paso repara, las interfaces en Audio I/O para un paso que pasa por hardware. Nada se ejecuta: los cables fluyen, los pasos que se sostienen se ponen verdes y el primero que no, rojo, con su motivo. *Hacerlo el objetivo* marca el nodo con ◎: entonces **Ejecutar el camino** llega hasta él y no más allá, y la prueba va hasta él; *Sin objetivo* quita la marca.

**Clones.** *Clonar* pone al lado un segundo nodo del mismo paso, Remaster ② por ejemplo, con ajustes propios: su ventana es el panel del paso con los ajustes del clon dentro; los del propio paso vuelven al cerrarla, y una ejecución desde ahí corre con los del clon. El camino ejecuta los ajustes del propio paso, nunca los de un clon.

**Perfiles.** El icono de los deslizadores en la cabecera de la sala guarda configuraciones con nombre. **Guardar como…** guarda cómo está cada paso y dónde están los nodos, nunca las fuentes de una toma ni sus puntos de corte; un clic en el nombre de un perfil lo pone todo como lo pondría una mano; **Guardar el ajuste tal como está ahora como** escribe la configuración sobre un perfil, **Eliminar** lo quita. Los guarda el estudio, así que los ve cualquier navegador.

Cada elección está a la vista, sin desplegables: hasta ocho, en una columna de filas (las cortas, en fila); más, detrás de un botón que abre la lista sobre la página, con un filtro cuando es larga.

**Pliegues.** **▾** en la franja de tareas la pliega a su primera tarea y cuántas más hay.

### El DAW: stems en pistas <!-- #the-daw-stems-on-lanes -->

![El DAW: los stems en pistas sobre la consola](guide/studio-daw.png)

**Vista previa.** El paso **DAW** (en **Acabado**, antes de Remasterizar) tiende un juego de stems de la toma en pistas, como un DAW: cada stem una pista, y una más, **Resto**: lo que la fuente guarda más allá de los stems (lo que la separación dejó escapar). Todas las pistas tal cual devuelven la fuente, así que los fallos de la separación solo se oyen donde cambias la mezcla. Cada pista lleva el color de lo que contiene: las voces ámbar, la batería roja, el bajo violeta, la guitarra verde, los teclados azules, el resto gris.

En cada pista: su **Versión** (el stem como se separó, o un archivo hecho de él, una voz limpia por ejemplo), su nivel de −60 a +12 dB (doble clic lo devuelve a 0), **M** para silenciarla y **S** para dejarla en solo, y un medidor mientras suena. Arrastra a lo largo de una onda para silenciar un tramo; clic derecho lo devuelve, clic reproduce desde ahí. Todo se oye al instante, todas las pistas en un mismo reloj, muestra a muestra, tal como se mezclará. **Restablecer** devuelve cada pista a como se separó, también los retornos y el máster. **A** toma en la mano la línea de volumen de la pista: un clic en la onda pone ahí un punto y lo arrastra, clic derecho lo quita, doble clic lo pone en 0 dB; el volumen se oye y se mezcla después del fader, recto en dB de punto a punto. Un clic en la versión pasa a la siguiente, así se comparan dos mientras suena; un clic derecho las muestra todas en los dispositivos del canal. Las esquinas superiores de un tramo silenciado lo funden hacia el silencio y de vuelta, tanto como las arrastres (un doble clic devuelve diez milisegundos), y sus lados lo mueven.

**La regla** sobre las pistas: un clic va allí, arrastrar dibuja el bucle y lo activa, y el bucle suena en vuelta hasta que **L** lo apaga. **Ctrl+rueda** acerca alrededor del puntero, **Shift+rueda** se desplaza a lo largo de la canción, **−**, **+** y **Ajustar** a la izquierda de la regla hacen lo mismo por pasos; la vista sigue al cabezal. Un clic en el nombre de una pista la elige para las teclas (ver *Atajos y trucos*). Bajo el tiempo, las secciones de la canción como las cronometró el reproductor (las etiquetas de la propia letra, colocadas por Whisper): un clic en una va a su inicio, doble clic la pone en bucle, **[** y **]** van a la sección anterior y a la siguiente.

El propio botón de pantalla completa del DAW lo extiende sobre toda la ventana, las pistas tan altas como deja la pantalla; **F11** en la pestaña del estudio hace lo mismo mientras el DAW está a la vista. **Esc**, **F11** o el mismo botón lo devuelven.

La **Consola** bajo las pistas (**Consola** en la barra del DAW la muestra y la oculta) es una mesa de mezclas: cada pista un canal, luego los dos retornos, **Sala** y **Delay**, y el **Máster**, siempre a la vista a la derecha. Un canal de arriba abajo: su nombre (un clic abre sus dispositivos), sus inserciones (**EQ** con su curva en pequeño, **Comp** con su reducción mientras suena), los envíos a la sala y al delay, anchura y panorama, **Ø** para la polaridad, **M** y **S**, y el fader con su medidor en una sola escala: pico y RMS de ambos lados, el pico retenido un momento, y debajo el pico más fuerte desde que se borró (un clic lo borra). **+ VCA** tras las pistas añade un VCA, un fader sobre un grupo de pistas (la pista elegida es su primer miembro): su fader suma sus dB al propio de cada miembro, que se queda donde está, su **M** los silencia y su **S** los deja en solo; sus dispositivos le dan nombre y eligen sus miembros, y una pista puede estar en más de uno.

Perillas y faders: arrastra arriba y abajo (**Mayús** más fino), la rueda o las flechas una vez elegidos; doble clic devuelve uno a como estaba. El número de una perilla o un fader admite también un valor escrito: un clic en él, o una cifra con uno elegido, abre un campo; Enter lo fija en sus propias unidades (dB, Hz con k para miles, ms o s, %, 4:1, L30 o R30, −∞ para un envío), Esc lo deja como estaba. **Ctrl+Z** deshace y **Ctrl+Shift+Z** rehace, toda la mezcla paso a paso. **A** y **B** guardan dos mezclas del conjunto para comparar mientras suena: B empieza como copia de A, y lo que ajustas va a la encendida.

**Mezclas**, la tercera pestaña de la consola: la mezcla que ajustas se guarda en Forge junto a los stems del conjunto un momento después de que tu mano se detiene, así el DAW se abre como lo dejaste en cualquier navegador, en cualquier máquina; **Guardar como** la guarda con un nombre, un clic en un nombre la trae de vuelta (con Deshacer detrás), y **✕** borra una cuando lo dices. Donde Forge no la guardó, la pestaña dice por qué.

Los **Dispositivos** de un canal (un clic en su nombre, en su **EQ** o en su **Comp**): **Entrada** (trim, polaridad, la versión del stem), **EQ** (hasta ocho bandas: campana, estantes de graves y agudos, cortes de graves y agudos, muesca; doble clic en la curva añade ahí una banda, arrastra su punto, la rueda sobre él fija su anchura, clic derecho la quita; detrás de la curva, el propio sonido del canal mientras suena), **Compresor** (umbral, proporción, ataque, liberación, rodilla y compensación, cinco puntos de partida, su curva y su reducción) y **Salida** (anchura, panorama, los envíos). La **Sala** tiene tres espacios, sala 1,2 s, placa 1,6 s y salón 2,4 s, y su retorno; el **Delay** su tiempo (en ms, o una nota a un tempo), realimentación, un paso bajo que oscurece cada eco, y su retorno. El **Máster** muestra la sonoridad mientras suena según BS.1770 (momentánea, corto plazo, integrada desde que se pulsó ▶), el pico real, la correlación de los lados y el espectro. **Mono** y **Atenuar** bajo el máster cambian solo lo que oyes, nunca la mezcla. **Escucha** del compresor lo liga a otra pista tal como entra en su propio compresor, y **Bajo la voz** liga una pista a la voz principal: la banda bajo la voz. Los dispositivos del máster dibujan también el goniómetro: el centro arriba, los lados de través. Los dispositivos del **Máster** guardan su cadena en el orden que sigue el sonido: **EQ**, **Compresor** (se escucha a sí mismo) y **Limitador** (el limitador de Plenio con anticipación: techo, empuje, liberación), luego su fader; el canal del máster los muestra como ranuras, cada uno con su reducción mientras suena. La **Mezcla** del compresor es compresión en paralelo: su sonido junto al seco, 100 % solo el compresor; el punto de partida **Paralela** la pone en 40 %, y la mezcla en Forge igual. La **Puerta**, un tercer inserto en cada pista, es un expansor descendente contra la fuga que la separación deja entre las frases: escucha la propia pista tras su EQ y, por debajo de su **Umbral**, la baja según su **Proporción**, nunca más que su **Rango**; la mezcla en Forge igual. Cada retorno tiene además **Corte de graves** y **Corte de agudos** (apagados en 20 Hz y 20 kHz; en el delay cortan todos sus ecos por igual, tras su realimentación), y la sala su **Predelay**, sobre el del propio espacio: la palabra clara antes de que entre su sala; la mezcla en Forge igual. Los dispositivos del máster muestran a su lado dos números más: LRA, el rango de sonoridad desde que se pulsó reproducir según EBU Tech 3342 (cuánto se mueve la sonoridad a corto plazo), y PLR, el pico real sobre la integrada (cuanto menor, más aplastada); cuando se hace una mezcla, su mensaje dice también el LRA del render.

**Automatización más allá del volumen.** **A** en una pista toma una línea en mano, y la ficha de al lado dice qué control dibuja la línea: **Vol** (el volumen, tras el fader), **I–D** (el panorama), **Anch** (la anchura), **Sala** y **Dly** (los envíos a la sala y al delay); un clic pasa al siguiente. Un clic en la onda pone un punto y lo arrastra, el clic derecho lo quita, el doble clic le da el reposo del control (0 dB, el centro, tal cual, nada). Un control con línea toca su línea en lugar de su propio valor, en vivo y en la mezcla, en recta entre los puntos.

**Insertos e Imprimir.** La **Entrada** de una pista tiene **Inserto**: la versión de la pista tal como suena, por la **Pasarela digital** (cinta, consola, válvula, transformador, vinilo) o un paso de un complemento sobre un archivo, en Forge. Lo que vuelve se convierte en la nueva versión de la pista, se oye enseguida como se mezclará, y sus versiones guardan el camino de vuelta. **Imprimir** del máster envía la mezcla tal como la tiene el DAW (sus versiones y cada control) por la Pasarela digital: una rama en el árbol junto a las mezclas del DAW.

**Buses de audio.** **+ Bus** en la consola hace un bus de la pista elegida: el sonido de sus miembros (tras su panorama; sus envíos siguen saliendo de sus propias pistas) sumado y pasado por el ecualizador, compresor, fader, anchura y panorama del propio bus hacia el máster. Sus dispositivos eligen sus miembros (una pista va a un solo bus; una de otro bus se mueve aquí), su nombre, ecualizador, compresor y salida; **M** los silencia a todos. La mezcla en Forge los suma y procesa igual.

**Mover y copiar.** **Shift** y un arrastre a lo largo de una pista eligen un tramo (un arrastre simple sigue silenciándolo). **Ctrl+C** lo copia, **Ctrl+X** lo toma para moverlo, **Ctrl+V** lo pone en el cabezal en su propia pista: lo que había se reemplaza con fundidos cruzados de 10 ms, el tramo se dibuja con la onda que trae, y la fuente de uno movido se calla (el siguiente Ctrl+V pone una copia). **Supr** silencia el tramo elegido, **Esc** lo suelta, un clic derecho sobre un tramo puesto lo quita; deshacer lo devuelve todo. Un tramo puesto queda sobre los cortes de la pista, y la mezcla en Forge lo pone igual.

**La referencia, la luz del solo y los fundidos de la canción.** **Ref** en la barra del DAW (o **R**) toca el sonido tal como llegó, aquel del que se separaron los stems, en lugar de la mezcla y tan fuerte como ella en lo que ha sonado, para que compares el sonido y no el nivel (lo más fuerte siempre parece mejor); el botón dice cuánto se subió o se bajó, **Mono** y **Atenuar** también lo oyen, y una segunda pulsación devuelve la mezcla. Mientras una pista está en solo, la barra muestra **S · n**, cuántas pistas se oyen, porque **Mezclar** hace solo esas: un clic en él, o **Alt**+clic en cualquier **S**, y vuelven a oírse todas. Los dispositivos del **máster** tienen los **Fundidos** de la canción: **Entrada** la sube desde −60 dB, **Salida** la baja a −60 dB antes de su final, y **Termina en** pone el final en el cabezal (silencio después; **Al final de la canción** devuelve el final). El fundido es lineal en dB, va tras el fader del máster, se dibuja oscuro sobre las pistas, y la mezcla en Forge lo tiene igual.

Lo que oyes es lo que se mezcla: las mismas bandas de EQ, el mismo compresor de Plenio (en el hilo de audio del navegador, o en el propio hilo de la página cuando el estudio se abre por su dirección de red), el panoramizador estéreo del navegador y su ley en la mezcla, el mismo impulso de la sala, los mismos ecos. Una sola diferencia: tras un salto en la canción, la memoria del compresor empieza de nuevo.

**Mezclar** hace la mezcla tal como se oye, en la máquina del estudio, con el EQ, el compresor, la sala y el delay del propio Plenio (Plenio 0.8.0, Apache-2.0, llevado sin cambios): una rama nueva en el árbol, con su sonoridad medida; una mezcla con picos por encima de −0.3 dBFS se baja hasta ahí y dice cuánto. **+stems** al lado escribe cada canal como suena en la mezcla, y cada retorno, como su propio archivo junto a la mezcla, para un DAW propio. Mientras corre, **Detener** a su lado la termina en Forge y no se hace nada. La cadena del máster también la mezcla el propio Plenio, limitador incluido.

## Artista <!-- #artist -->

La sala que pinta: una portada para cada toma, un 16:9 para su vídeo, un 9:16 para un short, desde tus palabras, desde una imagen tuya o desde ambas. El formulario a la izquierda, el escenario en el centro, la biblioteca a la derecha.

### Imágenes para tus canciones <!-- #pictures-for-your-songs -->

Escribe con frases lo que ves para la canción: Qwen-Image lee el prompt como una descripción, no como una lista de etiquetas. Primero lo que hay en la imagen, luego la luz, los colores y la técnica (óleo, tinta, una fotografía), y al final *no text* cuando no quieras letras en ella. **From the take** pone el prompt con el que se pintó la portada de la toma que tienes en la mano, o uno hecho de su título y su estilo, para tener por dónde empezar.

**Formas**: **1:1** (1280 × 1280) para la portada, **16:9** (1920 × 1080) para un vídeo, **9:16** (1080 × 1920) para un short. Las formas de una pulsación comparten su semilla, así que salen como una serie: la misma escena con los mismos colores, cada una compuesta para su propio marco y no una sola imagen recortada tres veces. **Variations** pinta también las semillas siguientes (la semilla, la semilla + 1, …), cada una en todas las formas.

**Seed**, con su modo al lado: **Random** (−1: una semilla nueva en cada pulsación, el campo vacío), **Random, fixed** (una semilla al azar puesta al momento y guardada), **Fixed** (la escrita), **Next** y **Previous** (tras una pulsación, el campo pasa más allá de las semillas que usaron sus variaciones). Un número en el campo es esa semilla (Random pasa a Fixed); un campo vaciado es una semilla nueva en cada pulsación (Fixed pasa a Random); ⟲ es Random otra vez. La semilla de una imagen que te gustó la vuelve a pintar: cada tanda muestra su semilla, y **To the form** la devuelve con el prompt.

**Tres columnas**: a la izquierda el prompt y sus mandos, en el centro el escenario (allí se revela la tanda que se pinta, su progreso sobre el escenario; si no, la imagen elegida, sus botones debajo, y los datos de su tanda con el prompt en una ayuda a su lado, sobre la biblioteca, mientras el puntero está en la imagen), a la derecha la biblioteca; los bordes entre ellas se arrastran (← → desde el teclado, un doble clic para su ancho de origen). Las elecciones de la columna se estiran con ella y nunca quedan más estrechas que los nombres de los pintores. Desde una ventana de 920 px de alto la sala cabe entera en ella: la página se queda quieta, el formulario y la biblioteca se desplazan cada uno por su cuenta, y la fila de Draw se queda al pie del formulario.

**Live preview** (activo por defecto): el sitio de la imagen que se pinta muestra cada uno de sus pasos, del ruido a la imagen, a un octavo de su tamaño y sin el decodificador, así que no cuesta nada; apagado, el sitio espera la imagen terminada. Una barra sobre el escenario, de lado a lado, sigue la tanda, imagen a imagen y paso a paso.

**Dos tandas a la vez**: mientras va una, **Draw** pide la siguiente, que espera detrás (también Ctrl+Enter); **Stop**, junto a Draw mientras va una tanda, termina la que pinta (si no, la que espera sale de la cola); las imágenes que acabó se quedan.

### Los pintores <!-- #the-painters -->

**Los pinceles del Artista** son una sola lista de cada modelo y archivo de aquí, por grupos: Qwen-Image 2512 desde un GGUF (Q4, Q6), cada archivo fp8 de `artwork/Qwen-Image-2512/checkpoints/` (el BASE propio de 2512 y los fine-tunes) y Qwen-Image 2.1. **⚡ Lightning** marca un pincel que pinta con él por defecto; un fine-tune va marcado como tal. Un archivo puesto en `checkpoints/` pasa a ser un pincel propio cuando la sala vuelve a leer la lista (tras una descarga o al recargar la página). Krea 2 Muse dejó el estudio en octubre de 2026: Qwen-Image 2512 sigue mejor las palabras y rotula bien un título.

**Los fine-tunes de Qwen-Image 2.1**: un archivo fp8 en `artwork/Qwen-Image-2.1/checkpoints/` (archivo único de ComfyUI; el primero FinalCut v1) es un pincel de 2.1, *Fine-tune · fp8 · su nombre*; el propio archivo fp8 de 2512 se llama *Pesos base*. En todo lo demás un fine-tune de 2.1 es 2.1: su licencia, la edición con palabras, el rotulado, Turbo.

**Qwen-Image 2512** (Apache-2.0) desde un GGUF en **Q4** (una tarjeta de 15,5 GB) o **Q6** (20 GB), o un **fine-tune fp8** suyo (22,5 GB: los archivos únicos de ComfyUI puestos en `artwork/Qwen-Image-2512/checkpoints/`, cada uno un pincel propio); alrededor de medio minuto por imagen con Lightning, tras un minuto o dos de carga. **Qwen-Image 2.1**, bajo la Qwen Research Licence (solo investigación y evaluación: no para una portada que vendes), pinta desde palabras y edita una imagen de referencia con las palabras del prompt; una máscara y *Paint around it* piden Qwen-Image 2512. En una tarjeta que no contiene entero ni su codificador de texto ni su pintor (una tarjeta de 16 GB, o una tarjeta bajo un límite de VRAM menor), ambos fluyen desde la RAM: bajo un límite de 15.5 GB en una 3090, 135 s desde palabras con 4.1 GB en el pico, 129 s editando con 7.9 GB.

Cada pintor aparece solo cuando sus archivos están aquí; a los que faltan los nombra la nota bajo la elección del pintor. **Engine → Models and LoRAs → Qwen painters** descarga Qwen-Image 2512 en Q4 (31 GB) o Q6 (34,5 GB) con Lightning, y Qwen-Image 2.1 (33,1 GB), cada uno preguntando antes con su tamaño (2.1 también con su licencia). Desde una terminal: `heresy/fetch-heresy.sh --qwen 2512-q4`. **Get painters and adapters…** bajo el pintor muestra en la propia sala lo que el estudio puede traer para el Artista: los pintores Qwen, cuatro fine-tunes fp8 de Qwen-Image 2512 (Jib Mix Qwen, IntoRealism Qwen, Real-Qwen-Image y el propio 2512, 20,4 GB cada uno, compartidos en el repositorio de modelos del estudio con permiso de sus autores) y cuatro adaptadores, cada uno con su tamaño, aquí o **Fetch**.

**Qué tarjeta pinta**: una pulsación espera en la cola del laboratorio una tarjeta con sitio, como las portadas de las tomas y los stems; mientras espera, **Off the queue** la retira. Una tarjeta que nada más usa toma una tanda cuya necesidad cabe en su memoria menos 512 MiB (la parte del propio runtime de CUDA); una tarjeta en uso la toma cuando su memoria libre cabe la necesidad. Un pintor Qwen-Image 2512 que ninguna tarjeta de aquí puede sostener entero trae en cambio sus bloques de la RAM: los que caben se quedan en la tarjeta, los demás llegan según se necesitan, y la imagen es la misma, más lenta en lo que el bus no puede ocultar (con cuatro adaptadores en una tarjeta de 24 GB, cerca de un sexto; con todos los bloques desde la RAM, ocupa 2,3 GB de la tarjeta, así que lo pinta una de 6 GB, con unos 30 GB de RAM); otro pintor que ninguna tarjeta puede sostener se rechaza al instante, con las cifras y el pintor que cabría. Qwen-Image lee el prompt con su codificador de texto (Qwen2.5-VL-7B, 15,5 GB) en la tarjeta cuando su espacio libre lo cabe, si no en el procesador, antes de que llegue el pintor: la imagen es la misma de las dos maneras.

**El filtro de contenido**: cada imagen pasa por un filtro de contenido (nsfw_image_detection de Falconsai, Apache-2.0), la pinte quien la pinte (la regla del estudio para todo pintor): la que marca no se guarda, y la tanda lo dice.

### Lightning <!-- #lightning -->

**Qué es**: Lightning (lightx2v, Apache-2.0) es un adaptador que enseña a Qwen-Image 2512 a pintar en pocos pasos sin guidance: el largo camino guiado del propio modelo, destilado en 8 pasos. Su archivo vive en `artwork/Qwen-Image-2512/lightning/` (`Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors`, 0,85 GB) y llega con la descarga de los pintores Qwen.

**Cómo lo pone el estudio**: con Lightning encendido, el pintor lo carga como un adaptador más bajo tus propios LoRA, con su fuerza: **1.0** para los GGUF Q4 y Q6 y el fp8 BASE propio de 2512 (la base de la que se destiló, en los 8 pasos que dan sus autores) y **0.55** para un fine-tune fp8, en 12 pasos (un fine-tune se ha alejado de la base, y Lightning a toda fuerza tiraría de él hacia atrás; el ajuste del propio Viktor en ComfyUI). La programación pasa a ser la de Lightning: un desplazamiento de log 3 a cualquier tamaño, como se entrenó. La guidance queda apagada (true CFG 1): una pasada del modelo por paso.

**Con él apagado**, el pintor toma el camino propio de 2512: 30 pasos por defecto (de 10 a 60) y **guidance** 4 (true CFG con su negativo vacío: dos pasadas por paso). Sesenta pasadas contra ocho: el pintado en sí tarda unas siete veces más, la carga igual, y da el detalle y la luz de un realismo acabado.

**Turbo** es la aceleración propia de Qwen-Image 2.1, como Lightning la de 2512: el adaptador *Turbo 4step* (de AiMetatron) en `artwork/loras/qwen-image-2.1/`, en el mismo interruptor de *Muestreo*, llamado Turbo allí; apagado salvo que se pida (2.1 pinta como siempre, 30 pasos), encendido de 4 a 16 pasos. En una RTX 3090 a 1280²: 30 pasos 96 s, los 4 pasos de Turbo 42 s.

**Sus valores por defecto**: los GGUF Q4 y Q6 pintan con él (bocetos, tarjetas más pequeñas); un fine-tune fp8 pinta sin él salvo que lo enciendas (realismo acabado); la portada propia de una toma se pinta con él (*Engine → Artwork*). La regla detrás: Lightning para bocetos y portadas, no para realismo profesional.

**El interruptor**: en Sampling, con su fuerza al lado; encendido, los pasos van de 4 a 16 y Guidance se oculta; apagado, Guidance aparece. Sin su archivo no hay interruptor, y 2512 pinta a su manera. La fuerza se guarda para cada pintor; la suma de tus adaptadores (*Together*, más abajo) no cuenta Lightning.

**Lo que cuesta**: en una RTX 3090 a 1328 × 1328, Qwen-Image 2512 con Lightning pinta en unos 30 s por imagen en Q4 (14,3 GB en el pico) y 32 s en Q6 (17,6 GB); un fine-tune fp8 a 0.55 y 12 pasos en 37 s (21,0 GB). La portada de una toma con Lightning tardó cerca de minuto y medio con la carga y el prompt.

### Samplers y programaciones <!-- #samplers-and-schedules -->

**Sampling** bajo el pintor, plegado, con sus valores en su resumen: los pasos, el sampler y la programación, guardados para cada pintor; **Reset** devuelve los del pintor. Los pasos: Qwen-Image 2512 con Lightning, de 4 a 16; si no, de 10 a 60; un número fuera del rango se queda en su borde. La estimación de tiempo del formulario cuenta las pasadas del sampler.

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

**Lo que mostraron dos matrices** (54 imágenes a través de un laboratorio de prueba, un prompt, una semilla): en Qwen-Image 2512 **con Lightning, Karras, Exponential y KL optimal pueden pintar el motivo dos veces** (dos faros donde se pidió uno): con Lightning quédate con Simple, Beta, Beta 57, SGM uniform o Bong tangent. **Sin Lightning, Euler SDE pinta Qwen suave y brumoso**: Euler, ER-SDE o RES guardan el detalle. El formulario dice ambas cosas cuando vienen al caso.

**De dónde vienen**: escritos para el estudio a partir de los artículos de los métodos y las fórmulas de ComfyUI (GPL-3.0, que la AGPL del estudio puede aceptar); los de RES4LYF se leyeron solo por sus matemáticas, porque su licencia prohíbe servicios comerciales: nada de su código está aquí; Heun++ es de Carzit (MIT).

### Regiones <!-- #regions -->

**Regiones** bajo *Muestreo*, plegadas: hasta tres partes del encuadre, cada una con un lugar (una mitad, un tercio, un cuarto o el centro; un pequeño mapa al lado muestra dónde) y sus propias palabras. En cada paso se le pregunta al pintor una vez más por cada región, con el prompt y las palabras de la región, y sus respuestas se mezclan por cajas de borde suave, como hace Latent Couple; el resto del encuadre sigue solo al prompt. Así el prompt dice toda la escena y una región lo que está en ella: *dos animales en un claro nevado del bosque*, luego *un zorro rojo* en la mitad izquierda y *un búho blanco sobre un tocón* en la derecha. Cada región cuesta una pasada entera más por paso (en una 3090 a 16:9, Qwen-Image 2512 fp8: 141 s sin ellas, 281 s con dos regiones). Se guardan en este navegador; una región sin palabras no se envía; **Otra vez** pinta con las de su propia ejecución. Para Qwen-Image 2512; Qwen-Image 2.1 edita por palabras y pinta sin ellas.

### Rótulo <!-- #lettering -->

**Rótulo** bajo *Regiones*, plegado: un título, y una segunda línea debajo (el artista, el álbum), rotulados como parte de la pintura y no superpuestos. Sus palabras van en campos propios, nunca en el prompt: **Título**, **Segunda línea**, **Las letras** (cómo son, con palabras; vacío: mayúsculas clásicas con remates en oro cálido), **Dónde** (arriba, en el centro, abajo) y **Cómo**: *pintado con la imagen* (Qwen-Image 2512 o 2.1 pinta la escena del prompt con las letras en ella; el «No text» del prompt de una toma se quita) o *sobre la referencia* (Qwen-Image 2.1 rotula una imagen terminada con palabras y conserva el resto; **Rotular** en una imagen la hace referencia y abre el bloque). Los pintores escriben mal palabras que han visto poco («RUOCH STUDIO»), así que el oyente (Qwen2.5-Omni, unos 5 s por imagen) vuelve a leer cada imagen, y la que tiene una errata se pinta de nuevo con otra semilla, hasta tres veces: se queda la primera escrita exactamente, las demás van a la carpeta misspelled/ de la ejecución. Una marca junto a cada imagen dice cómo se lee: ✓ escrito como se pidió, ⚠ errata en todos los intentos (su consejo dice qué se lee), ? sin releer (el oyente no está en la máquina). En una 3090 Qwen-Image 2.1 rotuló un cuadrado en 118 s; Qwen-Image 2512 fp8 (sin Lightning) pintó uno con sus letras en 230 s, contando su carga. También en cirílico, más seguro en mayúsculas. Se guarda en este navegador; **Otra vez** rotula con las palabras de su propia ejecución.

### Adaptadores <!-- #adapters -->

**LoRA** bajo el pintor: los adaptadores de su familia (Qwen-Image 2.1, Qwen-Image 2512), hasta cuatro, cada uno con su fuerza (de 0 a 1.5); un clic en una de sus palabras clave la pone en el prompt. **Add…** abre la biblioteca: las carpetas a la izquierda, las tarjetas con sus imágenes, una búsqueda. Los adaptadores viven en la carpeta del estudio `artwork/loras/<familia>/` (`qwen-image-2.1`, `qwen-image-2512`): cualquier carpeta dentro se vuelve un grupo, y una imagen junto a un archivo con su nombre (`NAME.jpg`, `NAME.png`, `NAME.preview.png`) se ve en su tarjeta. Tómalos de Civitai por su modelo base (Qwen) y deja ahí el `.safetensors`; **Look up on Civitai** envía solo el SHA-256 de cada archivo y guarda la respuesta junto a él (`NAME.civitai.info`: su nombre, su modelo base y sus palabras clave, y su primera imagen marcada como segura cuando no tiene una). También se lee lo que el LoRA Manager de ComfyUI o Stability Matrix escribieron junto a un archivo. Un adaptador hecho para otro modelo, que no alcanzaría ninguna capa del pintor, detiene la tanda y lo dice. Un clic derecho en la fila de un adaptador lo **silencia** (**Mute**): se queda en la lista con su fuerza y sale de la tanda (**Unmute** lo devuelve); un adaptador a cero tampoco se carga. Los cuatro adaptadores que sus autores dejan compartir llegan desde **Get painters and adapters…**.

**Together**: desde dos adaptadores, una barra bajo ellos da la suma de sus fuerzas en la carretera del Creador: verde hasta 1.2, ámbar hasta 1.8, rojo más allá. Los adaptadores apilados se suman, y pasado cerca de 1.8 una imagen se quema (colores y bordes pasados de rosca) por modesto que sea cada uno; las zonas son una primera medida para imágenes, a ajustar a ojo. Arrastra la barra para mover todos a la vez, cada uno en proporción a donde estaba.

### Una imagen desde la que pintar <!-- #a-picture-to-paint-from -->

**Reference picture**: una imagen desde la que pintar, como image to image: suéltala en su sitio bajo el prompt, pégala (Ctrl+V), elige un archivo o toma la imagen del escenario con **As reference**. **How much it may change** dice cuán lejos de ella empieza la pintura: 0.3 la deja casi como está, 0.6 conserva su composición y cambia su materia, 0.9 pinta la escena del prompt con su luz y sus colores, 1.0 pinta de nuevo. La imagen cubre cada forma y se recorta desde el centro; **Again** pinta desde la de la tanda; ✕ vuelve a pintar desde el ruido.

**Usarla** bajo la imagen dice cómo: *para pintar desde ella* (como arriba, con el pintor del formulario, hasta donde diga *Cuánto puede cambiar*), *para editar con palabras* o *solo por su estilo*, ambos con Qwen-Image 2.1 cuando está aquí (si no, apagados). Editada con palabras, la escena se queda y el prompt dice qué cambia (*el mismo faro en una noche de invierno nevada*: la nieve cayó donde debía, la torre y las rocas se mantuvieron). Por su estilo, la escena del prompt se pinta con la técnica, la pincelada, la paleta y la luz de la imagen, sin nada de su tema (el faro al óleo dio *un zorro rojo en un bosque nevado bajo la luna* con su pincelada). En ambos casos la ejecución es de Qwen-Image 2.1 sea cual sea el pintor del formulario: no se envían el modelo, el muestreo, los adaptadores, la máscara ni el lienzo del formulario, y rige su licencia (solo investigación y evaluación). Unos dos minutos por imagen en una 3090.

**Mask…** a su lado pinta sobre la imagen qué repintar (Paint, Erase, el pincel, Invert, Clear): el resto queda exactamente como estaba, como inpainting. **Paint around it** pone la imagen entera en el centro de cada forma y pinta de nuevo los bordes (una portada cuadrada en 16:9 o 9:16), como outpainting. **The take's cover** toma la portada de la toma elegida a la derecha. Con una máscara o **Paint around it**, cuatro opciones bajo la imagen: **Grow** (la máscara crecida tantos píxeles, o encogida), **Edge** (qué tan suave es su borde), **Soft** (repintado suave, como la differential diffusion: donde el borde es gris la imagen cambia solo en los últimos pasos, sin costura) y **Grain** (cuánto de la pintura nueva toma la parte que se conserva: su grano y su luz cosidos a lo nuevo; 0 la deja exacta).

**Canvas…** junto a **Mask…** abre el lienzo, como el de InvokeAI: el marco de cada forma, una pestaña arriba que dice cómo se pintará (**from it**: la imagen cubre el marco y la tanda pinta a partir de ella, image to image con la fuerza pedida; **around**: la parte del marco que la imagen deja vacía se pinta a su alrededor). En el tablero **Move** (V) arrastra la imagen, o una esquina para escalarla con la esquina opuesta quieta; **Brush** (B) y **Eraser** (E) pintan encima la máscara de repintado; **Hand** (H, o Espacio pulsado) mueve el tablero; la rueda hace zoom, Alt+rueda escala la imagen alrededor del puntero, las flechas la empujan un poco. A la derecha las capas (la máscara con **Invert** y **Clear**, la referencia con su opacidad solo en el tablero) y su lugar en números (ancho, X, Y en partes del marco); arriba **Fit**, **Fill**, **Centre** y **Same in all** (la imagen igual de grande en píxeles en los otros marcos), deshacer y rehacer (Ctrl+Z). **Done** guarda los lugares con la referencia y la máscara en el formulario; bajo la fuerza el formulario dice cómo queda cada forma, y ✕ lo saca del lienzo.

### El escenario y la biblioteca <!-- #the-stage-and-the-library -->

Un clic en una imagen la pone en el escenario con su tanda debajo; un clic en la imagen del escenario (o un doble clic en una imagen) la abre sobre la página con su propia forma (← → recorren la tanda, o la galería cuando se abrió desde allí; Esc cierra), con ★, **To the form**, **Set as cover** y **Download** (PNG, tamaño completo). En el escenario, **Note…** guarda con la imagen, en su tanda, una nota tuya (para qué se hizo, las palabras que la rotularon, qué probar después); la ayuda de la imagen la muestra.

**Runs o Gallery**: las tandas muestran cada pulsación de Draw con su prompt y su semilla, las más nuevas arriba; la galería muestra todas las imágenes de todas las tandas en una sola cuadrícula, las más nuevas primero, por forma (1:1, 16:9, 9:16) o con estrella (☆ en una imagen le pone estrella), en tres tamaños, en mosaicos iguales: columnas iguales, cada mosaico la misma caja, cada imagen entera dentro.

**Compare**: el **Compare…** del escenario y luego la otra imagen en la biblioteca: las dos quedan una sobre otra bajo un divisor que arrastras (← → lo mueven), o una al lado de la otra (S); X las intercambia, Esc cierra. **Ctrl** (o ⌘) **+ clic** elige imágenes y **Shift + clic** una serie: la barra de la biblioteca las marca con estrella o las manda a la papelera de una vez (Esc las suelta).

**El menú de una imagen**: un clic derecho en cualquier imagen (de una tanda, de la galería, del escenario, la que está sobre la página): **Over the page**, **To the stage**, **To the form** (su prompt, su semilla y su forma), **All of it to the form** (también su pintor, su fine-tune, su sampling y sus adaptadores: Draw vuelve a pintar esa imagen), **As reference**, **Compare…**, **Set as cover**, **Upscale** (2K o 4K, con los tamaños que dan), **Star it**, **Pick it**, **Copy the prompt**, **Copy the seed**, **Download**, **The file in a new tab**, **Its run** (la vista Runs, su tarjeta iluminada), **To the trash**. Una tanda que se revela en el escenario no tiene menú. Sobre la página el menú se pone sobre la imagen y tiene las teclas mientras está abierto: Esc cierra el menú, el siguiente Esc la imagen.

### Upscale <!-- #upscale -->

**Upscale…** en el escenario hace la imagen **2K** o **4K**: su lado largo 2560 o 3840 px (una portada cuadrada 2560² o 3840², un 16:9 2560×1440 o 3840×2160) con un upscaler (ESRGAN, DAT, HAT, SPAN y sus parientes, los lee spandrel) elegido en la fila que se abre (se recuerda; primero 4x_Nomos8kDAT si está); el consejo de cada botón dice el tamaño que da, y para una imagen ya tan grande el botón está apagado. El modelo pasa tantas veces como pida el tamaño (dos como mucho) y el resultado se lleva al tamaño exacto. La imagen grande es una tanda propia junto a su fuente, menos de un minuto en una 3090; **Again** amplía la misma imagen otra vez, quizá con otro modelo. Los upscalers viven en `artwork/upscalers/` del estudio (`.pth` o `.safetensors`, también en carpetas); OpenModelDB lista cientos: mira la licencia de cada uno.

**Ampliar bordes…** (Outpaint…) en el escenario pinta los bordes de una imagen: la imagen entera en medio de un lienzo más ancho (16:9), más alto (9:16) o cuadrado, el resto pintado por Qwen-Image 2.1 con el adaptador *Outpaint v2* (de AusBoss, en `artwork/loras/qwen-image-2.1/`), sus propios píxeles pegados de nuevo encima. Las palabras de lo que hay más allá de sus bordes son un deseo, no una necesidad. 25 pasos; un 1:1 a 16:9 tardó 90 s en una RTX 3090.

**Segunda pasada…** a su lado repinta la imagen más grande, como hace el flujo de ComfyUI de Viktor tras su primera pasada: la imagen agrandada **×1.5** o **×2** (por el píxel más cercano, como en el suyo) y pintada de nuevo por el pintor de su propia ejecución, su ajuste fino, sus adaptadores, su prompt y su semilla, desde parte del camino (*Cuánto puede cambiar*: 0.3 guarda el dibujo y añade detalle, 0.5 afina su materia, 0.7 repinta sus formas). Los pasos, el muestreador, el programa y Lightning son los del formulario cuando el formulario pinta con el mismo pintor, si no los de la ejecución: su receta da a la segunda pasada muchos pasos y nada de Lightning. Un 16:9 de 1920×1080 sale en 3840×2160. Medido en una 3090: Qwen-Image 2512 fp8 a 3840×2160 en 220 s con 12 pasos y Lightning (22.9 GB). No para Qwen-Image 2.1, que edita por palabras; sin máscara ni lienzo. **Ruido añadido** en su fila (0.6 primero, como en el suyo) y bajo el *Cuánto puede cambiar* de una referencia (0 primero) es el InjectLatentNoise de su flujo: ruido fresco sobre la imagen antes de que la pintura parta de ella; 0.3 trae grano y detalle nuevos, por encima de 1 las formas de la imagen empiezan a romperse.

### Una portada para la toma <!-- #a-cover-for-the-take -->

Una imagen cuadrada tiene **Set as cover**: se vuelve la portada de la toma que tienes en la mano (elígela a la derecha), en su tarjeta, en el reproductor y en su MP3. La portada que tenía se guarda junto a la toma (`artwork-removed/`), como la guarda un repintado, y la otra letra de un par A/B recibe también la nueva cuando no tiene una propia.

**La portada propia de una toma** (*Draw artwork* en su menú, en el Bibliotecario, para una toma o para muchas) la pinta el pintor de **Engine → Artwork**: según las tarjetas (Qwen-Image 2512 Q6 o Q4 entero donde una tarjeta lo cabe, si no Q4 en flujo desde la RAM en una tarjeta menor), o el que elijas entre los pintores Qwen que tiene esta máquina: Qwen-Image 2512 Q4 o Q6 y cada fine-tune fp8 con Lightning, Qwen-Image 2.1 con su licencia dicha (no para una canción que se vende). Un fine-tune elegido que ya no está aquí cede el sitio a la elección según las tarjetas, y la portada dice quién la pintó.

### La papelera del Artista <!-- #the-artist-s-trash -->

Las tandas viven en la carpeta `artist/` del estudio. **Trash** en una tanda la mueve a `trash/artist/`; el **Trash** del escenario aparta una imagen. La vista **Trash**, junto a Runs y Gallery, muestra primero las imágenes apartadas, cada una con **Restore** y ✕, y **Restore all**; luego las tandas de la papelera, cada una con **Restore** y **Delete for good**; **Wipe out** en su cabecera borra todo lo que muestra. Cada borrado pregunta antes y no se deshace.

**Trash (Art)** en la columna del Bibliotecario, bajo Out of sight, guarda el arte apartado en mosaico (un clic en una pieza la marca): las tandas del Artista en la papelera, las imágenes apartadas y las portadas quitadas de las tomas (por un repintado, por Remove, por una portada nueva), cada una con su imagen y lo que pesa. Márcalas para devolverlas (una portada vuelve a su toma, y la que tiene ahora queda en su lugar) o para borrarlas para siempre, preguntando antes; sin ninguna marcada, **Wipe out the art's trash**. Las portadas de un espacio de trabajo congelado se quedan como están.

### El registro del Artista <!-- #the-artist-s-log -->

El marco del registro del servidor tiene cinco vistas, **Server**, **Creator**, **Trainer**, **Refiner** y **Artist**, y cada sala abre la suya: la sala del Artista, la del Artista. El registro del Artista, guardado en este navegador (sus últimas 400 líneas), dice qué se pidió (el pintor, el fine-tune, las formas, la semilla, el sampling, los adaptadores), qué respondió el laboratorio (un rechazo con sus propias palabras), el camino de cada tanda hasta su final (espera y por qué, pinta en la GPU N, hecha, detenida, fallida y por qué) y las líneas propias del laboratorio sobre el Artista. **Copy** toma las líneas de la vista; plegado, el marco dice la última línea de la vista. **⧉** abre el registro en una ventana propia, con las dos vistas en espejo: en Chrome queda sobre todas las ventanas (Document Picture-in-Picture); en otros, es una ventana para llevar a otro monitor. La ventana lleva junto al registro las tarjetas en vivo; el marco se pliega mientras está abierta y se despliega cuando se cierra, si estaba abierto. **Creator**, **Trainer** y **Refiner** muestran las líneas del registro del servidor que son de su sala: las del motor y de la página, del Creador; un entrenamiento, del Entrenador; stems, remasterización, escalado y las mezclas del DAW, del Pulidor; la vista elegida se guarda para la sala, y una sala sin nada todavía en el registro lo dice.

### Lo que viene al Artista <!-- #coming-to-the-artist -->

Las versiones de la imagen de una toma; SeedVR como upscaler (con la fase de la DAW, en 2.1.0).

## Bibliotecario <!-- #librarian -->

### Todas las tomas <!-- #every-take -->

![El Bibliotecario](guide/studio-collection.png)

- **El encabezado** nombra la colección abierta (*Bibliotecario › Fosforida*) y lo que contiene: tomas, horas, me gusta, favoritas, notas, cómo se hicieron.
- **Espacios**, a la izquierda: Todos, Favoritas, Sin espacio, tus espacios, *+ Espacio nuevo*; Ocultas y la Papelera, en *Fuera de la vista*. Clic derecho en un espacio para sus **bloqueos** (*Bloquear la eliminación del espacio*, *Bloquear la eliminación de las tomas*): un 🔒 junto a su nombre, y nada de él va a la papelera. Los espacios 💎 (los conjuntos públicos del estudio) quedan al pie del árbol, por nombre, y los 💎 … LoRA los últimos de todos.
- **La playlist** va la primera en la columna, un lugar propio: nunca se renombra, se borra ni se congela. Una toma entra desde su menú (*Añadir a la playlist* › *Primera*, *Última* o *Al azar*; en una tarjeta marcada, todas las marcadas), y × la saca solo de la playlist, nunca de la biblioteca. Su vista es una sola lista de tarjetas anchas: ▶ primero, luego el título, cuándo se hizo y su duración, sus marcas, y la portada al final. Arrastra una tarjeta a su sitio; *Barajar el mazo* las reparte todas de nuevo. *Reproducir desde el principio*, o ▶ en cualquier tarjeta, toca la playlist en su orden hasta el final, diga lo que diga *seguir reproduciendo*, y una franja fina bajo el reproductor nombra la toma anterior, el lugar en la playlist (*Playlist · 3 / 12*) y la siguiente: un clic en un nombre la toca, y × sale de la playlist. El último botón del reproductor abre la misma lista en una ventana, con el reproductor aún a la vista debajo. En su cabecera, el fundido, de 0 a 4 s: la toma siguiente entra bajo la cola de la anterior, las dos ya guardadas en la página, así que ninguna espera a la red; Anterior y Siguiente cambian al instante.
- **Busca** con palabras, `*` y `?`; **ordena** por más nuevas, más antiguas, por título, más largas; **Mosaico** o **Lista**: los tres en la línea del encabezado, junto a los recuentos.
- **Una tarjeta** lleva la portada de su toma en la esquina superior derecha, junto al título, cuando la tiene (*Dibujar la portada* en el menú de la toma); un clic muestra la imagen entera sobre el estudio, donde ‹ › y las flechas recorren las imágenes de las tarjetas mostradas, ▶ reproduce su toma y Esc cierra. La tarjeta que suena brilla con los propios picos de la canción. Una franja fina en el borde izquierdo de la tarjeta dice tu veredicto: el color de acento para ★, verde para 👍, un rojo apagado para 👎, gris sin veredicto.
- **Tomas frescas**: una toma que aún no has reproducido lleva una línea discontinua clara; su primera reproducción la quita. Una toma regenerada lleva una insignia *regen* y conserva su nota, su me gusta y su estrella.
- **La columna de espacios**: arrastra su borde para ensancharla o estrecharla; « la pliega, y las tarjetas se ensanchan: las columnas son las mismas, y la vista no pierde su sitio.
- **Secciones**: un espacio puede tener secciones, dos niveles de profundidad como mucho (⋯ junto a su nombre → *Sección nueva…*), para ordenar lo que contiene sin un espacio nuevo cada vez. Un espacio muestra también las tomas de sus secciones. Todo aquello de lo que el Pulidor hace algo va solo a la sección *Pulidas* de sus espacios. Un espacio con secciones tiene un pequeño triángulo a la izquierda de su fila: un clic pliega sus secciones fuera de la columna o las trae de vuelta, y las plegadas se recuerdan. La columna se desplaza sola y se queda bajo la cabecera de la sala, así su parte de arriba está siempre a mano.
- **Arrastra una tarjeta a un espacio** de la izquierda para moverla allí (todas las marcadas, si está marcada); mantén **Ctrl** para añadirla allí y dejarla también aquí. El estudio pregunta primero, y Ctrl+Z lo deshace.
- **Tomas fijadas**: hasta cuatro en cada espacio, en una franja de su propio tono sobre las tarjetas (clic derecho en una toma → *Fijar aquí*; × la desfija). Cuando marcas tomas, la barra de las marcadas ocupa el lugar de la franja, así que las tarjetas nunca se mueven. Esa barra es una fila de iconos enmarcados: la selección, las marcas, los espacios, la exportación y la papelera al final; cada uno se dice al pasar el puntero.
- **Filtro** (el botón al final de la fila de búsqueda) abre una ventana como la elección de espacio: marca qué buscar en tres grupos (cómo se hizo: en bruto (tal como sale del modelo), importada, regenerada, re-renderizada; marcada: me gusta, no me gusta, favoritas, con nota, con portada; lo que tiene: stems, antizumbido, remasterización, reescalado), cada uno con cuántas tomas del lugar, y cómo se unen las marcadas: todas (AND), cualquiera (OR) o ninguna (NOR). *Show* las aplica; el botón dice luego cuántas hay activas y cómo se unen.
- **Selecciona** varias, como en un gestor de archivos: marca una, y a partir de ahí un clic en cualquier parte de otra tarjeta la marca también (Shift: todo el rango). Arrastrar sobre el espacio vacío entre las tarjetas dibuja una banda que marca lo que toca; **Ctrl+arrastrar** la dibuja desde cualquier parte y conserva lo ya marcado. La barra de las marcadas flota sobre el reproductor: favorita, añadir a un espacio, mover a uno, sacar de este, ocultar, exportar un ZIP, a la papelera.
- **La papelera** devuelve, o borra para siempre tras confirmar. **Trash (Art)**, a su lado en la columna, guarda el arte apartado (las tandas del Artista en la papelera, las imágenes apartadas, las portadas quitadas de las tomas) y lo devuelve, o lo borra para siempre tras confirmar; las portadas de un espacio de trabajo congelado se quedan.

### El menú de una toma <!-- #a-take-s-menu -->

![Clic derecho en una toma](guide/collection-menu.png)

**Regenerar con una semilla nueva** (en el menú de la toma: Editar, luego Regenerar): la toma hecha de nuevo con todo aquello con lo que se hizo, pero con semillas nuevas; la nueva hereda los espacios y la nota de la antigua, y la antigua espera en la sección *Origen de la regeneración* de su espacio (su espacio no la muestra entre las suyas) hasta que la vacíes; la nueva conserva su nota, su me gusta, su estrella y su imagen. Una prueba sale con sus dos minutos completos. Reproducir, abrir en el Creador o en el Pulidor, la hoja (su partitura), la ficha técnica (todo aquello con lo que se hizo: el estilo y la letra, la partitura dibujada, cada control, las LoRAs con sus fuerzas y sus ondas; una toma en modo Directo no tiene partitura, y *Escribirla a partir del sonido* le pide una al transcriptor), me gusta, no me gusta, favorita, una nota, renombrar, **espacios** (una toma puede estar en varios), **mover a** un espacio (en una tarjeta marcada: cada toma marcada, fuera del espacio abierto), ocultar, enviar al Escritor, copiar, descargar, **exportar a un DAW** (proyecto de REAPER o DAWproject, en cualquier toma: con sus stems una vez que el Pulidor los ha separado), a la papelera. **En una tarjeta marcada, con otras marcadas**, el menú actúa sobre todas, y su cabecera dice sobre cuántas: me gusta, no me gusta, favorita, portada, quitar la portada, espacios, ocultar, un ZIP; las portadas de varias y la regeneración de varias preguntan antes, porque cuestan minutos de una tarjeta gráfica.

**Dibujar la portada**: un modelo de lenguaje pequeño (Qwen3-4B) lee el estilo y las palabras de la toma y escribe un prompt de imagen; Qwen-Image 2512 lo pinta con Lightning (a 1328 px, guardado a 1024), en unos dos minutos en una tarjeta de 16 GB con el prompt y la revisión (en una tarjeta menor sus bloques fluyen desde la RAM, algo más lento; el pintor se elige en *Motor → Portada*). Se ve en el reproductor, en la tarjeta, en el panel multimedia del escritorio y dentro del MP3 que descargas (como su portada). Cuando una toma ya tiene su imagen, el menú dice *Abrir la portada* (sobre la página, como un clic en la imagen de la tarjeta o en el cuadrado del reproductor) y *Redibujar la portada* (un prompt nuevo y una imagen nueva; la anterior se guarda junto a la toma, en `artwork-removed/`). El redactor de prompts y el filtro de contenido vienen con `heresy/fetch-heresy.sh --artwork` (8,4 GB, pregunta antes), el pintor con `--qwen 2512-q4` o `2512-q6`. *Engine → Artwork* ofrece todos los pintores Qwen que hay aquí: Qwen-Image 2512 y sus fine-tunes fp8 con Lightning, y Qwen-Image 2.1 (ver Artista › Una portada para la toma).

### Los instrumentos bajo el estilo <!-- #the-instruments-under-the-style -->

Bajo el campo Estilo, el estudio nombra lo que pide tu prompt: una ficha por cada instrumento y estilo de la chuleta que encuentra, coloreada según lo que halló el oído (verde oído, ámbar en duda, rojo no suena con ese nombre) y con la imagen del instrumento. Posa el puntero sobre una para ver su tarjeta: la imagen, su tierra, cómo suena, ▶ A y ▶ B con sus semillas. Un clic muestra la imagen entera. **Alt+I** abre la chuleta desde cualquier parte.

### Portadas: qué las dibuja, qué no puede, otro pintor <!-- #artwork-what-draws-it-what-it-cannot-another-painter -->

**Qué las dibuja.** Un modelo de lenguaje pequeño (Qwen3-4B) lee el estilo y las palabras de la toma y escribe un prompt de imagen, con su tema primero; Qwen-Image 2512 lo pinta con Lightning (a 1328 px, guardado a 1024), con sus bloques desde la RAM donde no cabe entero (*Motor → Portada*). Cuando la toma lleva el nombre de un instrumento (la prueba de un instrumento), su aspecto encabeza el prompt palabra por palabra (qué es el instrumento y qué no es), y Omni (el modelo del oyente) mira la imagen según ese aspecto: una imagen en la que no encuentra el instrumento se pinta otra vez, tres como mucho, y cuando ninguna lo muestra de verdad, la toma se queda sin imagen en vez de con una falsa. Unos dos minutos por imagen en una tarjeta de 16 GB, todo contado.

**Qué no puede** (una advertencia, dicha sin rodeos): el pintor dibuja lo que conoce. Un instrumento que nunca ha visto por su nombre (el duduk, el morin juur, el jomús, los cuencos cantores de cristal…) sale como una conjetura: una flauta de madera, un violín, unos cuencos de cocina. Cuando Omni no encontró el instrumento en ninguna de las tres imágenes, la imagen queda marcada como **≈ una suposición**, en la vista superpuesta y en la chuleta de instrumentos. Una portada es el ánimo de la toma, no una imagen de referencia de un instrumento: para saber cómo es un instrumento, búscalo.

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

**Qué fuerza para un adaptador de voz.** Escuchado en una canción (19.10.2026: el adaptador de un narrador, rango 32, sobre una balada folk trágica): a 1.0 la voz ahoga la música y la toma se vuelve inestable, a 0.8 aún la quema, 0.7 es el techo desde el que partir, y 0.4–0.6 transmite mejor la voz. Una fuerza baja suelta la altura propia de la persona y conserva la tonalidad de la voz: la canción toma su color, no su sello. Sus dos mitades no son iguales: la musical (AR) escribe la partitura con el modelo, para ambos pentagramas, y una voz aprendida del habla apaga las notas cuando está alta; mantenla en 0.5 como mucho, y da a la sonora (NAR), que lleva el timbre, hasta 1.0 (escuchado el mismo día: AR 0.4 con NAR 1.0 mantuvieron la música entera y la voz estable). Los deslizadores dibujan así el camino de un adaptador de voz: uno cuyo nombre dice voice o vocal se pone rojo pasado 0.5 en la mitad musical y pasado 1.0 en la sonora.

### Una voz propia: preguntas desde el terreno

Respuestas dadas en GitHub (issue #2) a alguien que buscaba solo la voz principal, guardadas aquí.

- **Una toma solo con la voz.** YuE2 aprendió a cantar con canciones enteras, y su fraseo se apoya en la música bajo la voz: «a cappella» en el estilo lo empuja hacia coros o hacia la banda entera. Mejor pide una sola cosa tranquila bajo la voz (un pad suave, una sola guitarra acústica) con `solo lead, single voice, no harmonies, no backing vocals, dry vocal, close mic`, y separa la toma en el Pulidor (ocho stems): *Voz principal entera* devuelve lo que la separación dejó entre los coros, *Reescalado de voces* redibuja el aire que el separador apagó. Cuanto menos haya bajo la voz, más limpio el stem.
- **Un adaptador de voz con tus propias grabaciones.** Voces principales secas de un solo cantante con su letra, a 44,1 o 48 kHz de fuentes sin pérdida. La misma sala ligera en cada clip hace menos daño que salas distintas, y un clip con mucha reverberación es mejor dejarlo fuera que limpiarlo a medias: lo que deja un de-reverb se aprende como parte de la voz.
- **Rango.** 16 para una voz, 32 como mucho: el rango fija cuánto puede cambiar el adaptador, no cuánto se acercará al cantante.
- **Parecido.** El timbre lo lleva la mitad del sonido: tócala a 0,8–1,0 con la mitad musical a 0,3–0,5. Nombra en el estilo el sexo y el registro del cantante (`male baritone vocal`). Júzgalo sobre los pesos con que se entrenó: un adaptador aprendido sobre el modelo base rompía la voz en un ajuste fino, incluso a poca fuerza.
- **La curva de las gráficas al final.** Con *Parar en la meseta, luego solo la mitad del sonido*, la mitad musical se queda quieta cuando la del sonido deja de mejorar, y la del sonido sigue sola: ahí las curvas cambian de forma, y esas últimas épocas suelen dar la voz más limpia. Cuando ar_ce se acerca a 0, la mitad musical se sabe los clips de memoria: escucha una época anterior (los chips verdes).

![El Entrenador LoRA: la telemetría de una ejecución](guide/studio-train.png)

### Por qué adaptadores propios <!-- #why-your-own-adapters -->

Un modelo abierto desnudo, por fuerte que sea, se queda corto en instrumentos, estilos y voces: sabe lo que oyó en su entrenamiento, y tu sonido rara vez está ahí. Tus propios adaptadores cierran esa brecha; son la armadura del guerrero profesional del audio y la música. El paso más seguro hacia arriba: reúne tus mejores pistas, las que hiciste en SUNO (en un plan de pago son tuyas) o en cualquier otro sitio donde los derechos sean tuyos, y entrena con ellas un adaptador **Estilo**, con la letra exacta junto a cada una. Entonces YuE2 escribe con tu sonido y no cerca de él: tus instrumentos, tus arreglos, tu producción. Añade un adaptador **Voz** para el cantante que quieras, y las canciones se cantan con ese color. Un estilo entrenado con veinte canciones tuyas eleva el modelo más de lo que cualquier prompt puede empujarlo.

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
- **Entrenador**: **Ruaj Estudio**, el propio del estudio, sobre pesos bf16 sin cuantizar; crea él mismo la caché latente del conjunto; Directo o con partitura, sobre las canciones tal cual o separadas. Portado línea a línea del **AI-Toolkit** de Ostris (MIT), con cuyas curvas coincidía época a época en el mismo conjunto; el propio AI-Toolkit dejó el estudio cuando todo lo que entrenaba estuvo aquí.
- **Pesos base**: bf16, el modelo entero (una tarjeta de 24 GB), o int8 para tarjetas más pequeñas, algo menos exacto. El archivo del modelo base nunca cambia: solo aprende el adaptador.
- **Tarjetas**: cuántas GPU toma la ejecución, 1, 2 o 3, entre las tarjetas dadas al entrenamiento en Engine → GPUs. Cada tarjeta tiene el modelo entero y aprende sus propias canciones; sus lecciones se promedian en cada paso (paralelismo de datos), así que dos tarjetas recorren una época unas dos veces más rápido y tres unas tres, un número impar igual que uno par. El lote crece con las tarjetas y la tasa de aprendizaje lo sigue (× √tarjetas): nada más que ajustar. No se corta una matriz entre tarjetas (paralelismo de tensores): YuE2 cabe entero en una tarjeta de 24 GB, y en tarjetas sin NVLink cortar cada capa cuesta más de lo que da.
- **Épocas**: cuántas veces la ejecución recorre el conjunto, cada pista una vez por época, una pista por paso: sus pasos son las pistas del conjunto por esto (2016 pistas por 12 épocas son 24 192 pasos). La mitad sonora oye una ventana de 60 segundos de la pista, cortada al azar cada vez; la musical lee la canción desde su comienzo.
- **Guardar cada N épocas**: un adaptador al final de cada N-ésima época, cada uno para escucharlo y compararlo; se guardan todos, con el estado del optimizador junto al más reciente (una ejecución detenida conserva lo aprendido). **Parar en la meseta, luego solo la mitad del sonido** (activado por defecto): dos de cada cien pistas se apartan y se escuchan en cada época; cuando la mitad del sonido deja de mejorar en ellas durante 3 épocas, la musical se queda quieta en su mejor época y la del sonido sigue sola hasta 12 más. Una voz salió así más limpia. N baja hasta una décima de época (0.1: diez guardados por época, con nombres e001.3 y así), para escuchar un conjunto grande mientras aprende.
- **Rango**: lo ancho que es el adaptador; su parte de los pesos y su tamaño están en la ayuda del campo (lo que cuesta cada rango y cuál para qué: abajo).
- **Tasa de aprendizaje**: lo grande que es cada paso de la mitad sonora (AdamW, la misma toda la ejecución); el de la musical es este por la **Velocidad AR**. Los tipos mantienen 0.0001; la mitad es más suave, para una ejecución larga sobre un conjunto grande; más alta aprende más rápido y olvida más.
- **Desvanecer el LR, épocas** y **LR al final, %**: en las últimas épocas del entrenamiento la tasa de aprendizaje baja en línea recta, hasta lo que queda de ella en el último paso (0 % la apaga del todo): la forma habitual de terminar un entrenamiento, que los últimos guardados se asienten en vez de seguir dando pasos tan fuertes. Sigue la duración del entrenamiento, así que uno prolongado a más épocas se desvanece en su nuevo final, y continuarlo toma todas las perillas que se le dieron, el desvanecido entre ellas. 0 épocas, como al principio: sin desvanecido, la tasa igual hasta el final.
- **Peso AR**, **Ancla AR (KL)**, **Velocidad AR**: los tres controles de la mitad musical, abajo.
- **Modo**: **Directo** es para canciones hechas en modo Directo; **Completo (partitura)** y **Melodía**, para canciones hechas en esos modos, enseñan además a la mitad musical a escribir primero una partitura, que el motor transcribe de cada canción antes del entrenamiento; la mitad de los pasos va sin partitura, para que no olvide el modo Directo. **Separar voces y música**: cada canción se divide primero en voz y música con el separador del estudio (una vez por conjunto, minutos por canción), y la mitad musical aprende también la voz solo con la letra y la música solo con las etiquetas.
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
- **Épocas**: la mitad musical se aprende de memoria un conjunto pequeño enseguida (su pérdida cae hacia 0): las épocas verdes de la Telemetría son las primeras que vale la pena escuchar, a menudo mucho antes de la última.
- **La frecuencia de muestreo del material**: la mitad sonora trabaja a 48 kHz, la musical oye a 24 kHz. Una grabación de 24 kHz le enseña todo a la mitad musical, pero a la sonora solo unos agudos apagados: remuestrear no añade nada por encima de la mitad de la frecuencia original. Para un timbre, dale 44,1 o 48 kHz.
- **Memoria**: la medida es una tarjeta de 24 GB. Los pesos bf16 ocupan 7,5 GB; el adaptador, sus gradientes y su optimizador, 16 bytes por peso (rango 32: menos de 1 GB; rango 128: 3,8 GB; rango 256: 7,5 GB); el resto son las activaciones de la lección, y la mitad musical lee la canción entera: medidos 17,7 GB de pico con rango 32 en canciones de varios minutos, unos 11 GB en clips de voz cortos. **Por debajo de 16 GB, no entrenes rangos grandes**: pesos int8, rango 16 a 32, clips cortos. El rango 256 en una tarjeta de 24 GB está al límite.
- **Cada guardado es una media móvil** del adaptador sobre su última época, más o menos (EMA), las dos mitades, y las pistas apartadas se escuchan sobre ella: el ruido de los pasos sueltos queda suavizado en lo que oyes y en lo que detiene la ejecución. Los pesos crudos para seguir quedan al lado (`resume.safetensors.raw`).

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

Cada ejecución es una tarjeta a la derecha: *Activas*, *Todas*, *Archivadas*, *Papelera*, con búsqueda. Una ejecución que entrena se ilumina como una toma que suena. ⋯ en una tarjeta: su telemetría, su registro, archivarla, detenerla o borrarla a la papelera (se te pregunta si sus adaptadores en loras/ se van con ella). Desde la Papelera vuelve, o se va para siempre. Debajo, las ejecuciones por estado: **Entrenando**, **En pausa**, **Terminado**, **Detenido**, **Fallido**, cada uno con su cuenta, de uno en uno (otro clic muestra todas). **Pausa** en una ejecución en curso guarda lo aprendido y espera; **Reanudar** sigue desde ese guardado con el mismo conjunto, ajustes y tarjetas.

## Motor <!-- #engine -->

El Motor se abre sobre la sala en la que estás (☰ › Motor, o Ctrl+Alt+9), con sus tarjetas por tema tras pestañas a la izquierda, en el orden en que se recorren: **Servidor y registro**, **Hardware** (la tarjeta, Cómputo, las GPU), **Modelos y LoRA** (con los VAE y las LoRA), **Escritor y portada**, **Carpetas y seguridad**, **Apariencia**, **Actualizaciones y acerca de**. ↑ y ↓ pasan de una pestaña a otra, y el Motor vuelve a abrirse en la pestaña donde lo dejaste; Esc, **Cerrar** o un clic en la sala oscurecida a su alrededor lo cierran.

### La máquina <!-- #the-machine -->

![Motor](guide/studio-engine.png)

- **Servidor**: lo que ejecuta el motor: el modelo, los decodificadores, el contexto, la biblioteca.
- **Cómputo**: la copia del **modelo** (BF16 7,2 GB, Q8_0 3,8 GB, Q6_K y Q5_K_M más pequeñas), **Preajuste de memoria de la GPU** (*Auto* ajusta el contexto y los bloques del VAE a la tarjeta; *Auto within N GB* hace lo mismo para esa cantidad y deja el resto de la tarjeta a lo demás que corre en ella (en un portátil de 16 GB, 14); *Manual* te los deja a ti), **Mantener los modelos cargados**. **Scan the machine** dice lo que tiene la máquina y lo que le conviene (el modelo base, los controles de Auto, el pintor), como hace un estudio nuevo una vez en su primer arranque. Las fusiones que descargaste (**More models**) aparecen en la lista tras los modelos de m-a-p, en su línea: IRA, IRAE, IRAEv2, IRAEv3; cada una en sus formatos, la más completa primero. El ajuste fino propio de Ruach Studio, **RS-FW** (siete fusiones de YuE2-RS-FW, cada una con su época y su fuerza en el nombre), llega con la instalación como RS-FW 2.4x0.75, el modelo predeterminado del estudio, y arranca siempre que no se haya elegido modelo; las otras seis están en **More models**.
- **Hardware**: la memoria de la tarjeta ahora; **Liberar el modelo** la libera al instante.

### GPU: qué tarjeta hace qué <!-- #gpus-which-card-does-what -->

![Qué tarjeta hace qué](guide/engine-gpus.png)

En una máquina con varias tarjetas, dale a cada una su trabajo: el **estudio** (síntesis) en una tarjeta, el **entrenamiento** en las tarjetas que le des, los **trabajos** del laboratorio (el oyente, Whisper, stems, remasterización, reescalado) en las suyas. Mientras una ejecución entrena en la tarjeta del propio estudio, una síntesis espera, y la página dice por qué. Con una sola tarjeta, así funciona: entrena, luego crea. Una tarjeta nueva para el estudio surte efecto tras un reinicio (el botón aparece cuando hace falta). Los trabajos del laboratorio se quedan en las tarjetas marcadas para ellos, el Artista entre ellos: cuando están llenas, un trabajo espera a una de ellas (Whisper pasa al procesador) y nunca toma una tarjeta no marcada para el laboratorio. Una ejecución del Artista va a la tarjeta donde su modelo se mantiene desde la ejecución anterior, con los pesos ya en la RAM.

**Intel Arc (beta).** La síntesis del estudio también corre en una tarjeta Intel Arc, con su motor compilado por `./build.sh --sycl` (INSTALL.md, «Intel Arc (beta)»): canciones, adaptadores, Full, Extend. Las tarjetas de esta lista son de NVIDIA; el motor de Arc calcula en su propia tarjeta, y el entrenamiento y las portadas se quedan en las de NVIDIA.

### Decodificadores, adaptadores, el modelo del escritor, el aspecto <!-- #decoders-adapters-the-writer-s-model-the-look -->

- **VAE**, **LoRAs**: cada archivo que encontró el estudio, con su fuente y lo que hace.
- **Modelos y LoRA** (Models and LoRAs): lo que trae la instalación, por partes (los decodificadores extra, Whisper, los modelos de stems, UniverSR, los LoRA), tal como los encontró la última pasada, y **Check again** para mirar de nuevo. Una parte incompleta lista lo que falta y tiene su **Fetch**; **Fetch what is missing** los descarga todos; una descarga cortada sigue donde se quedó. **More models**: otro backbone (BF16 junto a Q8_0), el oyente de estilo, el pintor del Artista, la base del entrenador, cada uno con sus variantes y tamaños, la variante que ya está marcada como tal, y cada uno preguntado antes con su tamaño. Un backbone o decodificador nuevo llega al motor en su próximo arranque (**Restart the engine**); los LoRA nuevos, al instante. Entre ellas, las fusiones IRA e IRAE: YuE2 con adaptadores de la comunidad incorporados (Instrumental y Real Audio de Mothersuperior; en IRAE, Epic Trailer de monsterovich, en tres intensidades).
- **Reconocidos por su contenido**: un adaptador o un archivo de modelo renombrado, movido a una carpeta propia o con su cabecera reescrita sigue aquí: el estudio y su instalación lo reconocen por su SHA-256 y, en un `.safetensors`, por el SHA-256 de sus tensores (del `MANIFEST.tsv` del repositorio de modelos), y no descargan nada de nuevo.
- **Artwork**: quién pinta la portada de una toma: según las tarjetas (Qwen-Image 2512 Q6 o Q4 entero donde una tarjeta lo cabe, si no Q4 en flujo desde la RAM en una tarjeta menor) o uno elegido entre los pintores Qwen que tiene esta máquina (Qwen-Image 2512 Q4 o Q6 y cada fine-tune fp8, con Lightning; Qwen-Image 2.1 con su licencia dicha).
- **Escritor**: la dirección del servidor de chat local (vLLM, LM Studio, Ollama), *Probar la conexión*.
- **Apariencia**: 22 temas (elegidos para crear en ellos: claros y tranquilos), esquinas, las cuatro fuentes (texto, títulos, números, nombres de las salas). **Hora de la toma**: la hora de una toma en su tarjeta y donde se muestre, hace cuánto (por defecto) o su fecha y hora exactas; un clic en la hora de una tarjeta la gira para esa toma.
- **Fuentes**: además del texto, los títulos, los números y los nombres de las salas, las *marcas de secciones* en la onda (IBM Plex Mono por defecto) y los *botones* (la del texto por defecto); cada una salvo el texto con su tamaño respecto al texto, de −2 a +2 pt.
- **Registro del servidor**: el registro completo; **Acerca de**: cada proyecto sobre el que se apoya el estudio, enlazado.
- **Actualizaciones**: las versiones de Ruach Studio en GitHub frente a esta: cada cuánto mirar (cada día, semana, mes, nunca), también las candidatas, y cuando sale una, preguntar o actualizarse sola cuando nada se ejecuta (solo donde el estudio es un clon de su repositorio; en otro sitio dice cómo actualizar a mano). Un estudio nuevo, y cada actualización, ofrece los conjuntos 💎 que aún no tiene.
- **Seguridad** (Security): quién puede abrir el estudio: solo este ordenador, este ordenador y las redes privadas (por defecto; el Wi-Fi de un café o un hotel también lo es) o este ordenador y las redes que indiques (10.0.0.0/24); el motor lo guarda en `user/access.json` y responde según él al instante. Un estudio cuyo usuario aún no decidió pregunta al arrancar, con una guía breve y «Mi decisión es consciente». Una elección que lo cerraría a la máquina desde la que preguntas se pregunta otra vez; borrar `user/access.json` vuelve a las redes privadas.
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
- La canción dura sus compases × eso. La línea de la comprobación bajo la partitura lo dice: `✓ Native YuE2 score · Em · 90 BPM · 3/4 · 11 bars · ≈ 0:22 long · 0 sections`.
- Una línea de letra necesita el tiempo de sus sílabas: a corchea por sílaba un compás de 4/4 da cabida a 8, a semicorchea a 16 (un rap: las estrofas de «Buratino» de Víktor van así: `FFFFFEEEE2zDDDDD`).
- Para que la canción acabe antes, quita compases al final de la partitura, en las dos voces; para un final, añade compases ahí.

### El espacio de la voz: Vocal <!-- #the-voice-s-space-vocal -->

- Vocal es lo que se canta: más o menos una sílaba por nota, una nota ligada una sílaba sostenida, silencios donde respira el cantante. La tabla de la comprobación dice cuántas notas, cuántas por minuto, la tesitura y cuánto del tiempo suena la voz.
- Notas y sílabas: con más notas que sílabas el modelo estira las sílabas sobre ellas o añade las suyas; con menos, aprieta las palabras. El contador de la letra en Composición mide cada línea por el tiempo que ocupa: da a la línea más o menos esas notas.
- El rap es denso (semicorcheas en una o dos alturas: lo lleva el ritmo), una balada tiene notas largas. Deja un silencio al final de una línea: ahí respira la voz y responden los instrumentos.
- El desplazamiento de voz bajo la partitura (*Mover*) mueve Vocal por grados de la escala (una tercera, una cuarta, una octava) donde queda demasiado alta o baja para el cantante; los acordes e Ins se quedan. Medido el 21.10.2026: el modelo sigue a Vocal bajada una octava (cantó de 9 a 10 semitonos más grave), y la voz puede cambiar de registro con ella: una contralto femenina bajada salió tenor o baritenor masculino, y una voz masculina subida puede salir femenina; la banda también puede bajar. Los ▼ ▲ junto a un adaptador de voz (en Full, con partitura) hacen lo mismo una vez.

### El espacio de los instrumentos: Ins <!-- #the-instruments-space-ins -->

- Ins es la línea propia de los instrumentos: el riff de la introducción, las respuestas entre frases, un solo, el final. Una melodía, no los acordes (esos están en Vocal): una línea, y YuE2 arregla la banda a su alrededor.
- **Bajo la voz, Ins casi siempre calla.** Las versiones oficiales mantienen `Z4` bajo cada grupo cantado y tocan en la introducción, entre secciones y al final; las tomas de Víktor en Plan completo igual (un arpegio en la introducción, `Z4` bajo las estrofas, un relleno en los cambios). Un Ins ocupado bajo una línea cantada es una segunda melodía contra la voz, y las partituras nativas lo evitan.
- La comprobación lo resume como **Ins : Vocal**, las notas de una contra las de la otra: por encima de 1.5 los instrumentos llevan la mayoría de las notas, por debajo de 0.67 la voz, en medio más o menos igual.
- Un instrumental: Vocal calla (`Z`) toda la canción e Ins lleva la melodía. *Hacerla instrumental* pasa la melodía vocal de una partitura a Ins (la receta oficial) y marca *Instrumental*. Un adaptador de partitura instrumental a toda fuerza con palabras que cantar da una voz sin notas: mantenlo bajo cuando hay letra (Creador › VAE y LoRA).

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
| **[** · **]** · **Ctrl+Z** · **Ctrl+Shift+Z** | el DAW | la sección anterior · la sección siguiente · deshacer · rehacer |
| **Barra espaciadora** · **Home** · **L** | el DAW a la vista | reproducir y parar · al principio (del bucle, si está activo) · el bucle sí y no |
| **M** · **S** · **↑ ↓** | el DAW, la pista elegida con un clic en su nombre | silenciarla · dejarla sola · elegir otra pista |
| **+** **−** **0** · **Ctrl+rueda** · **Shift+rueda** | el DAW | acercar, alejar, toda la canción · zoom alrededor del puntero · a lo largo de la canción |
| **F11** | la pestaña del estudio | el DAW a la vista a pantalla completa y de vuelta; en otro sitio, todo el estudio a pantalla completa |
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
