## Lector <!-- #reader -->

El Lector, la sala después del Videógrafo, convierte un texto en voz: un capítulo, un libro, un radioteatro, un podcast, una voz sobre un clip. Lee con una voz constante o como un diálogo de varias, escucha cada trozo que leyó y pone la toma en la Biblioteca como pone una canción.

![El Lector de día: el texto y su voz a la izquierda, las lecturas a la derecha](guide/reader.png "El Lector: el texto, la voz, el motor, las lecturas")

### Qué hace <!-- #what-it-does -->

**Modo** da dos maneras de leer. **Narración**: una voz lee todo el texto, cortado por **frases** (trozos de unos doscientos caracteres, una línea en blanco una pausa más larga) o por **versículos** (una línea por trozo, sin leer su número de versículo ni los números de Strong); el primer trozo que dura 2.5 s se vuelve la referencia de todos los siguientes, así la voz se mantiene en todo el capítulo. **Diálogo**: una línea por turno, escrita `Name: words`, una voz para cada hablante; una línea sin nombre sigue el turno anterior.

**Leer** inicia la lectura. Espera en la cola como los demás trabajos pesados del laboratorio, con su barra sobre el reproductor y sus líneas en el registro. Su tarjeta nombra la cuantización y el tiempo que queda mientras lee; al terminar, la duración, su velocidad, lo que oyó Whisper y la sonoridad.

### El motor: Drama 3 <!-- #the-engine-drama-3 -->

El Lector lee con Fish Audio Drama 3 (35B MoE, 3B activos) a través de audio.cpp, con cuantizaciones GGUF en `models/narrator/drama-3-gguf/` y su LICENSE y NOTICE al lado; sin ellos el motor no carga. Lee ruso, ucraniano, hebreo, griego, inglés, español, italiano, francés, portugués, alemán, japonés y chino. Un motor propio se conecta en `user/reader/engines/` con su propio `engine.json` y aparece en **Motor** junto a él.

### Cuantizaciones y su velocidad <!-- #quants-and-their-speed -->

![El selector de cuantización y la línea de debajo](guide/reader-tier.png "Cuantización: qué lee, dónde y cuánto tardará este texto")

**Cuantización** dice qué cuantización lee y dónde. **Auto · primero la calidad** (por defecto) toma Q8_0 donde quepa: 20 bancos de expertos en RAM en una tarjeta con 23.6 GB libres; si no, los 40 bancos en la memoria de la máquina en una tarjeta con 7.4 GB libres y 40 GB de memoria libre; después Q6_K; Q4_K solo donde no cabe ninguno (una tarjeta pequeña, poca memoria) y en una tarjeta Intel. **Auto · primero la velocidad** toma primero Q4_K. Ambos eligen según la memoria libre al empezar; una cuantización nombrada en la lista se mantiene. Q8_0 va por defecto porque al oído salió la más limpia: en la prueba en crudo del 09.11.2026 ninguna toma de Q8_0 se marcó como errónea de 20, de Q6_K una de 20, de Q4_K siete de 50, todas las marcas en una misma juntura de una frase. La instalación descarga Q8_0 (41.1 GB) cuando la tarjeta más grande de la máquina tiene 24 GB o más, si no Q4_K (24.9 GB); en una tarjeta menor, Q8_0 se descarga al lado: `bash tools/narrator-setup.sh --quant Q8_0`. Sin ella Auto lee con la cuantización que haya. La línea de abajo dice qué leería ahora y en qué tarjeta, un segundo de voz en cuántos segundos y cuánto tardaría este texto con la carga del modelo.

Medido en una RTX 3090 el 09.11.2026 con un trozo ruso de 27 s. RTF son los segundos que lleva leer un segundo de voz; Whisper oyó bien cada letra salvo que la fila diga otra cosa:

| cuantización | bancos de expertos en RAM | en la tarjeta | RAM | RTF | cómo se midió |
|---|---|---|---|---|---|
| Q4_K | 4 | 21.5 GiB | 3 GiB | 0.62 | la tarjeta sola |
| Q6_K | 16 | 21.9 GiB | 11.2 GiB | 1.16 | la tarjeta sola |
| Q8_0 | 20 | 23.0 GiB | 17.3 GiB | 1.37 | la tarjeta sola |
| Q8_0 | 40 | 6.9 GiB | 33.2 GiB | 2.43 | la tarjeta sola |
| Q4_K | 20 | 15.7 GiB | 9.8 GiB | 1.34 | junto a un trabajo de dataset |
| Q6_K | 28, cuda_perf | 13.8 GiB | 18.6 GiB | 1.74 | junto a un trabajo de dataset; una palabra mal oída |
| Q4_K | 40, cuda_perf | 7.3 GiB | 18.3 GiB | 1.75 | junto a un trabajo de dataset |
| Q6_K | 40, cuda_perf | 7.3 GiB | 26.0 GiB | 2.46 | junto a un trabajo de dataset |
| Q8_0 | el procesador solo | — | 44 GB | 7.0 | el procesador |

Las filas junto a un trabajo de dataset son pesimistas: el cálculo de la tarjeta y el procesador se compartían con él, y una tarjeta propia las lee más rápido. **Q8_0 · 20 bancos de expertos en RAM, 40 en una tarjeta compartida** se queda en Q8_0: 20 bancos en RAM en una tarjeta con 23.6 GB libres; cuando la tarjeta está compartida, los 40 en la memoria de la máquina; con **Auto** como tarjeta, el procesador al final. La primera lectura carga el modelo; en una tarjeta queda cargado entre lecturas.

### En una Intel Arc u otra tarjeta con Vulkan <!-- #on-an-intel-arc-or-another-vulkan-card -->

Drama 3 lee en una tarjeta Intel (Arc) con la compilación Vulkan de audio.cpp, en un nivel propio: Q4_K con 28 de sus 40 bancos de expertos en la memoria de la máquina, unos 11 GB en la tarjeta y 16 GB de memoria libre. Medido en una Arc Pro B50 (16 GB) el 12.11.2026: un segundo de voz en 3.3 s, la carga del modelo 53 s. Cuando a la tarjeta le falta memoria, el motor pasa cuatro bancos más a la memoria de la máquina y sigue leyendo. En una tarjeta Intel, Auto toma solo este nivel, y una cuantización pensada para otra tarjeta se rechaza allí por su nombre; Drama 3 nunca lee en el procesador en nombre de la tarjeta: si la tarjeta no puede, la lectura lo dice. Al cargador de Vulkan solo se le muestra el controlador Intel de Mesa, así que el renderizador por software del procesador nunca pasa por la tarjeta. Por ahora el Lector envía Drama 3 a la compilación Vulkan solo en una tarjeta Intel; la compilación Vulkan de audio.cpp funciona también en otras tarjetas con Vulkan, pero el Lector aún no las encamina.

Los paquetes del sistema, una vez (las cabeceras de Vulkan, el compilador de shaders glslc, las cabeceras SPIR-V, los controladores Vulkan de Mesa y vulkaninfo):

```
# Debian, Ubuntu
sudo apt install libvulkan-dev glslc spirv-headers mesa-vulkan-drivers vulkan-tools
# Fedora
sudo dnf install vulkan-loader-devel glslc spirv-headers-devel mesa-vulkan-drivers vulkan-tools
# Arch
sudo pacman -S --needed vulkan-icd-loader vulkan-headers shaderc spirv-headers vulkan-intel vulkan-tools
```

Comprueba que el controlador ve la tarjeta: `vulkaninfo --summary` la lista en Devices con el controlador de Mesa, como `deviceName = Intel(R) Arc(tm) Pro B50 Graphics (BMG G21)` y `driverName = Intel open-source Mesa driver`. Una lista con `llvmpipe` solo significa que el controlador no está. `bash tools/narrator-setup.sh --vulkan-check` dice qué hay aquí y nombra los paquetes que faltan en tu sistema.

Después la compilación: `bash tools/narrator-setup.sh` hace por sí mismo la compilación Vulkan en una máquina con tarjeta Intel, junto a la otra; `bash tools/narrator-setup.sh --build --vulkan` hace solo esa, en `build/audio.cpp/build/linux-vulkan-release/`. Necesita cmake y un compilador de C++, como las otras; la instalación nunca instala un paquete del sistema, lo nombra. Medido en Ubuntu 24.04 con Mesa 25.2 y Linux 7.0; los detalles están en `docs/NARRATOR-VULKAN.md`.

### Notas de las cuantizaciones <!-- #grades-of-the-quants -->

La lista «Cuantización» pinta cada cuantización según la prueba en crudo del 09.11.2026: la primera lectura de dos trozos rusos de 30 s (uno con etiquetas de emoción, otro sencillo), cinco semillas cada uno, el muestreo del Lector (temperature 0.8, top_p 0.9), sin relectura y sin segunda semilla; Whisper large-v3 escuchó palabras añadidas, omitidas o cambiadas. **Verde**, estable: ninguna palabra errónea en ninguna toma. **Amarillo**, medio: una palabra errónea en una toma de cada diez; el oído del Lector vuelve a leer ese trozo. **Rojo**, no recomendable: errores en dos tomas o más, o uno burdo; Auto nunca lo elige, y lo dicen su ayuda y la tarjeta de la lectura. Todas las cuantizaciones en tarjeta salieron verdes, las 70 tomas limpias. Dónde se calculan los tensores importa, pero como importa una semilla: la misma cuantización con la misma semilla, con sus expertos en la tarjeta o en RAM (las 20 capas inferiores, centrales o superiores), se aparta desde los primeros 40–60 ms hacia otra lectura, mientras que una repetición con la misma distribución es idéntica hasta el bit. Una semilla muestra un camino entre muchos: la palabra tras «глубоко» en el set a ciegas del 09.11 (todas sus tomas con una semilla) es una inserción sonora de 0.7–1 s, no un suspiro.

| cuantización | bancos de expertos en RAM | tomas con palabra errónea | nota |
|---|---|---|---|
| Q4_K | 40 | 0 / 10 | verde |
| Q6_K | 40 | 0 / 10 | verde |
| Q8_0 | 40 | 0 / 10 | verde |
| Q4_K | 20 · inferiores | 0 / 10 | verde |
| Q4_K | 20 · centrales | 0 / 10 | verde |
| Q4_K | 20 · superiores | 0 / 10 | verde |
| Q4_K | 40 · temperature 1.0 | 0 / 10 | verde |
| Q4_K · Q6_K · Q8_0 | solo el procesador | en medición | en medición |

### Texto, voces y emociones <!-- #text-voices-and-emotions -->

**Voz del lector**: la voz propia del motor, mantenida desde el primer trozo; o **Tu propia voz…**, un clip breve de una voz que el motor sigue, aceptado solo bajo el aviso rojo y con el consentimiento marcado (clonar una voz sin el consentimiento de su dueño es delito en muchos países, y la responsabilidad es tuya). Con el Studio no viene ninguna voz hecha. El tono de cada trozo se mide al leerlo; un trozo cuya voz pasó al otro género se vuelve a leer con otra semilla.

Las emociones y los sonidos van entre corchetes, como los lee Drama 3: `[calm]`, `[sad]`, `[whispering]`, `[pause]`, `[laughs]`. **Paleta de etiquetas** los inserta: una emoción, un ritmo o un estilo al principio de su frase, una pausa o un sonido en el cursor. **Leer las etiquetas en línea** está activado por defecto en un diálogo y desactivado en una narración, donde se busca una lectura limpia de libro. **Estilo** da a toda la lectura un corchete propio, como `calm, warm, unhurried narration`.

### Acentos y la tilde aguda <!-- #stresses-and-the-acute -->

**Poner los acentos** marca las vocales tónicas antes de que el motor lea: tus propias marcas quedan como están escritas (la tilde aguda, U+0301, como en `звени́т`), luego tu **Diccionario de acentos**, luego el gran diccionario del idioma, donde lo hay: los del ucraniano y del ruso vienen con el Studio (el del ucraniano, de lang-uk, de los «Словники України» del ULIF; el del ruso, el Diccionario gramatical de A. A. Zaliznyak, desplegado de los datos de gramdict, CC BY-NC 4.0: libre para uso no comercial), y para cualquier otro idioma conectas el tuyo (`docs/NARRATOR-DICTIONARIES.md`); una palabra con dos acentos se deja al contexto. **Revisar acentos** muestra el texto como lo leerá el motor. Una palabra mal leída en una toma: **Corregir** en su lectura, elige su trozo, pon el acento, **Recordar el acento en el diccionario** y **Volver a leer el trozo**.

### El mapa de glifos de LCV <!-- #the-lcv-glyph-map -->

**Leer las letras de LCV con el mapa de glifos** convierte las letras propias de LCV (Ѓ, Ђ, Љ, ѵ, Ѳ y las demás) en lo que el motor lee, con la tabla del autor: `Авраѓа́ма` se lee `Авраהа́ма`. **Mapa de glifos de LCV** bajo el diccionario muestra la tabla; **Guardar como mi copia** guarda tu copia en `user/reader/glyphs.map.tsv`, y desde entonces se aplica esa; **Volver a la tabla del autor** la suelta. El interruptor está apagado por defecto.

### El oído y la sonoridad <!-- #the-ear-and-the-loudness -->

**Escuchar cada trozo (Whisper)**, activado por defecto: Whisper large-v3 en el procesador escucha cada trozo mientras el motor lee el siguiente. Un trozo en el que oye una palabra añadida, omitida o cambiada, o cuyas letras se alejan del texto un 12 % o más (una repetición, un salto, un balbuceo), se vuelve a leer con otra semilla, hasta tres lecturas, y se queda la más cercana al texto. La tarjeta de la lectura dice qué trozos se releyeron y por qué, la palabra con su momento en la toma. La toma se une a −16 LUFS, como los podcasts, con los picos nunca por encima de −1 dBFS. Un oído que no pudo cargar se dice en la lectura y en la nota de la toma, nunca se toma por una lectura limpia. Apagado, el motor lee sin escuchar: ningún trozo se vuelve a leer por sus palabras, no se cuentan letras, y la tarjeta de la lectura y la nota de la toma dicen «Whisper apagado», nunca una lectura limpia. **Comprobar con Whisper** en una lectura terminada, o en el menú de una toma del Lector en la Biblioteca, escucha una toma después: la toma tal como suena se corta donde está cada trozo y se escucha frente a las palabras que se pidió leer al motor; las letras erradas y cada palabra marcada, con su tiempo en la toma, van a la nota de la toma y a `whisper-check.json` a su lado. Su audio no se toca.

### Desde una grabación <!-- #from-a-recording -->

**Desde una grabación** toma una conferencia o un stream (cualquier audio, o el sonido de un vídeo), y **Transcribir** lo escucha con Whisper: las palabras con sus tiempos y un texto en párrafos en sus pausas. **Limpiar con el modelo del Escritor** corrige lo que Whisper oyó mal, la puntuación y las mayúsculas, conservando cada palabra y su orden; **Al texto** lo pone en el texto del Lector, como diálogo cuando sus líneas son `Name: words`.

### Licencias <!-- #licences -->

Drama 3 está bajo la Fish Audio Community License v1.0: libre para investigación y uso no comercial, y para uso comercial mientras los ingresos anuales queden por debajo de USD 500,000. No permite un servicio alojado de TTS o de clonación de voz para otros, clonar la voz de una persona real sin su consentimiento, ni usar nada de lo que produce para entrenar o destilar otro modelo; su marca de agua queda en el sonido. Cada toma que lee lleva **Built with Fish Audio** en el resultado de su lectura, en el editor de la toma y en su nota de la Biblioteca. Cada toma del Lector queda marcada como nunca para entrenamiento: su archivo lleva la marca, el Entrenador rechaza una carpeta que la contenga y las cocinas de datasets la dejan fuera.

### Una lectura en seis pasos <!-- #a-reading-in-six-steps -->

1. Pega el texto, o tráelo **Desde una grabación**.
2. Elige **Modo**: **Narración** para un libro, **Diálogo** para voces.
3. Elige la **Voz del lector**; en un diálogo, una para cada hablante.
4. Deja activado **Poner los acentos**; para LCV, añade **Leer las letras de LCV con el mapa de glifos**.
5. Mira **Cuantización** y la línea de debajo: la cuantización, la tarjeta, cuánto tardará.
6. **Leer**, luego escucha la toma; un trozo que salió mal pasa por **Corregir**.
