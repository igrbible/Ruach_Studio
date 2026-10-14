# El Artista a fondo

[English](ARTIST.md) · [Русский](ARTIST.ru.md) · [Українська](ARTIST.uk.md) · [Беларуская](ARTIST.be.md) · [Ελληνικά](ARTIST.el.md) · **Español** · [Italiano](ARTIST.it.md) · [Français](ARTIST.fr.md) · [Português](ARTIST.pt.md) · [Deutsch](ARTIST.de.md) · [日本語](ARTIST.ja.md) · [中文](ARTIST.zh.md)

El Artista es la sala de Ruach Studio para las imágenes: una portada para cada toma, un 16:9 para su vídeo, un 9:16 para un short. La guía dentro del estudio (F1 en el Artista) dice en pocas líneas qué hace cada control; este documento llega hasta el fondo: cada control, cómo está hecho por dentro, las recetas que funcionan, qué sale mal y por qué, y las cifras medidas en una RTX 3090. Todo lo que hay aquí está en el estudio tal como es; lo que aún ha de venir se dice al final.

## Contenido

1. [Para qué es el Artista](#1-para-qué-es-el-artista)
2. [Una primera portada en seis pasos](#2-una-primera-portada-en-seis-pasos)
3. [Cómo escribir un prompt](#3-cómo-escribir-un-prompt)
4. [Los pintores](#4-los-pintores)
5. [Cómo va una ejecución](#5-cómo-va-una-ejecución)
6. [Lightning](#6-lightning)
7. [Samplers y programaciones](#7-samplers-y-programaciones)
8. [Adaptadores (LoRA)](#8-adaptadores-lora)
9. [Regiones](#9-regiones)
10. [Rótulo](#10-rótulo)
11. [Una imagen de la que pintar](#11-una-imagen-de-la-que-pintar)
12. [La segunda pasada](#12-la-segunda-pasada)
13. [Reescalar](#13-reescalar)
14. [El escenario, la biblioteca y la papelera](#14-el-escenario-la-biblioteca-y-la-papelera)
15. [Portadas para las tomas](#15-portadas-para-las-tomas)
16. [Recetas](#16-recetas)
17. [Cuando algo sale mal](#17-cuando-algo-sale-mal)
18. [Las cifras](#18-las-cifras)
19. [Para scripts y agentes](#19-para-scripts-y-agentes)
20. [Licencias](#20-licencias)
21. [Lo que viene](#21-lo-que-viene)

## 1. Para qué es el Artista

Una canción necesita imágenes: el cuadrado de su tarjeta y de su MP3, un encuadre ancho para su vídeo, uno alto para un short. El Artista las pinta en tu propia tarjeta gráfica, a partir de tus palabras, de una imagen tuya o de ambas, y guarda cada ejecución con su prompt, su semilla y sus ajustes para que una imagen que te gustó pueda pintarse de nuevo o llevarse más lejos.

La sala tiene tres columnas. A la izquierda el formulario: el prompt y cada control que da forma a la pintura. En el centro el escenario: la ejecución que se pinta se revela allí paso a paso, o allí está la imagen que elegiste, con sus botones debajo y los datos de su ejecución en una ayuda al lado. A la derecha la biblioteca: cada ejecución, o todas las imágenes en una galería, o la papelera. Arrastra los bordes entre las columnas para ensanchar una (← → con el teclado; un doble clic le devuelve su propio ancho). Desde una ventana de 920 px de alto la sala se ve entera: la página no se mueve, el formulario y la biblioteca se desplazan por su cuenta, y la fila de Dibujar se queda al pie del formulario.

## 2. Una primera portada en seis pasos

1. Elige una toma a la derecha del estudio (la lista del Creador o del Bibliotecario): la imagen que pongas como portada va a ella.
2. En el Artista, pulsa **De la toma** para tener un prompt del que partir, o escribe el tuyo (sección 3).
3. Deja **Formas** en **1:1**, pon **Variaciones** en 4 y conserva el pintor que eligió el estudio (Krea 2 Muse Q4 en la mayoría de las tarjetas).
4. Pulsa **Dibujar** (Ctrl+Enter). Mira cómo se revelan las imágenes en el escenario; cerca de medio minuto cada una en una 3090.
5. Haz clic en la que te guste; **Poner como portada** la hace portada de la toma: en su tarjeta, en el reproductor y en su MP3.
6. ¿Te gustó pero la quieres más fina? **Segunda pasada… ×2** (sección 12), luego **Reescalar… 4K** (sección 13).

## 3. Cómo escribir un prompt

Krea 2 Muse y Qwen-Image leen un prompt como una descripción, no como una lista de etiquetas: escribe frases. Pon primero lo que hay en la imagen (quién o qué, dónde, haciendo qué), luego la luz (crepúsculo, luz de vela, una mañana gris), los colores y el medio (un óleo de pinceladas gruesas, un dibujo a tinta, una fotografía de 35 mm). Termina con *no text* cuando no quieras letras: a los dos pintores les gusta rotular una portada por su cuenta.

Palabras que funcionan bien: el tema dicho llanamente (*a red fox sitting in the snow*), la composición (*seen from below*, *in the left third*, *a wide empty sky above*), el material (*oil on canvas*, *gouache*, *woodcut*), la dirección y el color de la luz. Palabras que hacen poco: las listas de etiquetas de calidad (*masterpiece, 8k, best quality*) son de modelos más antiguos y solo ocupan sitio.

**De la toma** pone en el prompt aquel del que salió la portada propia de la toma, o uno hecho con su título y su estilo, como punto de partida. Cada ejecución guarda su prompt; **Al formulario** en cualquier imagen devuelve su prompt, su semilla y su forma, y **Todo al formulario** (en su menú) devuelve también su pintor, su fine-tune, su muestreo y sus adaptadores, de modo que Dibujar pinta de nuevo esa misma imagen.

## 4. Los pintores

| pintor | licencia | lo que pide a la tarjeta | una imagen en una 3090 | para |
|---|---|---|---|---|
| **Krea 2 Muse Q4** | Krea 2 Community License | 12,5 GB | unos 35 s en 1:1, 47 s en 16:9 | bocetos, portadas, el caballo de batalla |
| **Krea 2 Muse Q8** | Krea 2 Community License | 18,5 GB | algo más largo, más fino | portadas |
| **Qwen-Image 2512 Q4** | Apache-2.0 | 15,5 GB | unos 30 s con Lightning | el Qwen de una tarjeta de 16 GB |
| **Qwen-Image 2512 Q6** | Apache-2.0 | 20 GB | unos 32 s con Lightning | bocetos más finos |
| **Fine-tune fp8 de Qwen-Image 2512** | la del propio fine-tune | 22,5 GB | unos 37 s con Lightning, minutos sin él | realismo acabado |
| **Qwen-Image 2.1** | Qwen Research Licence | 21 GB (en flujo con menos) | unos dos minutos | editar con palabras, referencia de estilo |

**Krea 2 Muse** (de Stable Yogi, un fine-tune de Krea 2 Turbo) pinta en sus pocos pasos propios (8 por defecto, de 4 a 16) sin guía: un modelo Turbo lleva la guía destilada dentro. Es el pintor por defecto de la sala porque es rápido, fiel a las palabras y amable con las tarjetas pequeñas. Q4 y Q8 son el mismo modelo en dos precisiones (GGUF): Q8 guarda un poco más de detalle.

**Qwen-Image 2512** es el pintor más grande: realismo más fino, lee bien los prompts largos, dibuja bien las letras cuando se las pides. Viene como GGUF en Q4 o Q6, o como **fine-tune fp8**: los archivos únicos de ComfyUI puestos en `artwork/Qwen-Image-2512/checkpoints/` y elegidos bajo el pintor (Jib Mix Qwen, IntoRealism Qwen, Real-Qwen-Image y el propio 2512 se descargan desde **Obtener pintores y adaptadores…**, 20,4 GB cada uno). Un fine-tune fp8 se lee en bf16, se guarda en la tarjeta en su propio fp8, y cada capa calcula en bf16 mientras corre; los adaptadores sobre él guardan sus capas en bf16.

**Qwen-Image 2.1** lee imágenes además de palabras (su codificador de texto es Qwen3-VL): edita una imagen según las palabras del prompt, o pinta la escena del prompt con el estilo de una imagen (sección 11). Está bajo la Qwen Research Licence: solo investigación y evaluación, no para una portada que vendas; la sala lo dice bajo el pintor en el color de los avisos.

Cada pintor solo aparece cuando sus archivos están aquí; los que no están se nombran bajo el pintor, y **Motor → Modelos y LoRA** los descarga, preguntando antes por cada uno con su tamaño (el 2.1 también con su licencia). Desde una terminal: `heresy/fetch-heresy.sh --qwen 2512-q4`.

**El codificador de texto** de Qwen-Image 2512 (Qwen2.5-VL-7B, unos 15,5 GB) lee el prompt en la tarjeta cuando el espacio libre allí lo cabe, si no en el procesador, y se va antes de que llegue el pintor: la imagen es la misma de un modo u otro, el procesador solo es más lento.

## 5. Cómo va una ejecución

**La cola.** Pulsar Dibujar es una ejecución: un prompt, sus formas, sus variaciones. Espera en la cola del laboratorio una tarjeta con sitio, como las portadas de las tomas, las pistas separadas y los reescalados; mientras espera, **Fuera de la cola** la retira, y **Detener** junto a Dibujar termina una ejecución que pinta (las imágenes que terminó se quedan). Pueden estar dos ejecuciones a la vez: una pintando, la siguiente esperando detrás.

**Qué tarjeta.** Los trabajos del laboratorio se atienen a las tarjetas que se les dieron en **Motor → GPU** (la tarjeta propia del estudio nunca se toma por casualidad). Una tarjeta que nada más usa toma una ejecución cuya necesidad cabe en su memoria menos 512 MiB (la parte propia del runtime de CUDA); una tarjeta en uso la toma cuando su memoria libre cabe la necesidad; una tarjeta con límite de VRAM cuenta su límite como techo. La necesidad es la del propio pintor más el tamaño de sus adaptadores, y 6 GB más para una segunda pasada ×2.

**Cuando ninguna tarjeta lo cabe entero**, Krea 2 Muse y Qwen-Image 2512 traen sus bloques en flujo desde la RAM: los bloques que caben se quedan en la tarjeta, el resto llega a medida que hace falta (el group offloading de diffusers sobre un stream de CUDA: un bloque llega mientras calcula el anterior), y la imagen es la misma, más lenta en lo que el bus no puede esconder. Con todos los bloques en flujo, Krea 2 Muse Q4 toma 2,2 GB de la tarjeta, así que una tarjeta de 8 GB lo pinta. Qwen-Image 2.1 trae en flujo tanto su transformer (bloque a bloque) como su codificador de texto (capa a capa): bajo un límite de 15,5 GB pintó desde palabras con 4,1 GB de pico y editó con 7,9 GB, en más o menos el mismo tiempo que entero. Un pintor que no puede ir en flujo y no cabe en ninguna tarjeta se rechaza al instante, con las cifras y el pintor que sí cabría.

**Varias tarjetas.** Una ejecución con varias imágenes se reparte entre las tarjetas del laboratorio que tengan sitio y RAM suficiente para un pintor más (tres formas en dos tarjetas: la primera y la tercera en una, la segunda en la otra), cada tarjeta pintando su parte con las semillas propias de la ejecución: las imágenes son las mismas bit a bit que en una tarjeta. Krea 2 Muse Q8, tres formas: 132 s en dos tarjetas frente a 163 s en una.

**Un pintor guardado.** Tras una ejecución su pintor vuelve a la RAM y su tarjeta queda libre otra vez; una ejecución siguiente del mismo pintor, el mismo fine-tune y los mismos adaptadores en el mismo orden pinta al instante, sin el minuto o dos de carga. Un pintor guardado se suelta tras diez minutos parado, cuando la RAM hace falta para otro, o con **Descargar de memoria** en la Barra (que suelta todo lo que el estudio tiene en sus tarjetas).

**Dentro de una ejecución**: el codificador de texto lee el prompt una vez; cada imagen se dibuja al tamaño propio del pintor y se guarda al de la sala (Krea 2 dibuja en múltiplos de 16 y recorta desde el centro, 1920 × 1088 a 1920 × 1080; Qwen-Image dibuja a 1328², 1664 × 928 y 928 × 1664 y lleva cada una a 1280², 1920 × 1080 y 1080 × 1920); el decodificador trabaja por teselas, así que su pico se queda bajo.

**Vista previa en vivo** (activada por defecto): los latentes de cada paso se convierten en una imagen de un octavo del tamaño sin el decodificador (con los factores de color propios del espacio latente, como los lleva InvokeAI), así que no cuesta nada; una barra en lo alto del escenario sigue la ejecución, imagen a imagen y paso a paso.

**El filtro de contenido**: cada imagen pasa el filtro que pide la licencia de Krea 2, la haya pintado quien la haya pintado: una que marca no se guarda, y la ejecución lo dice.

**En el disco**: cada ejecución es una carpeta en `artist/` del estudio: `ask.json` (lo que se pidió), `run.json` (escrito imagen a imagen), las imágenes `NN-SHAPE-sSEED.png`, sus `thumbs/`, y una referencia o una máscara al lado cuando la ejecución tenía. Un vigilante detiene a un pintor que calla demasiado (diez minutos mientras carga, cinco una vez que pinta), y una ejecución que el laboratorio perdió por un reinicio lo dice en vez de pintar para siempre.

## 6. Lightning

**Qué es**: un adaptador (lightx2v, Apache-2.0) que enseña a Qwen-Image 2512 a pintar en pocos pasos sin guía: el largo camino guiado propio del modelo destilado en 8 pasos. Su archivo vive en `artwork/Qwen-Image-2512/lightning/` y llega con la descarga de los pintores Qwen.

**Cómo lo pone el estudio**: con Lightning activado, el pintor lo carga como un adaptador más bajo los tuyos, a **1.0** para los GGUF Q4 y Q6 (la base de la que se destiló, 8 pasos) y a **0.55** para un fine-tune fp8 con 12 pasos (un fine-tune se ha alejado de la base, y Lightning a plena fuerza lo arrastraría de vuelta). La programación pasa a ser la propia de Lightning (un desplazamiento de log 3 en cualquier tamaño), y la guía se apaga: una pasada del modelo por paso.

**Con él apagado**, 2512 pinta a su manera: 30 pasos por defecto (de 10 a 60) y **Guía** 4 (CFG de verdad frente a un negativo vacío: dos pasadas por paso). Sesenta pasadas frente a ocho: unas siete veces la pintura, y el detalle y la luz del realismo acabado.

**La regla tras los valores por defecto**: Lightning para bocetos y portadas, no para realismo profesional. Los pintores GGUF pintan con él; un fine-tune fp8 pinta sin él salvo que lo enciendas; la portada propia de una toma se pinta con él. Krea 2 Muse no tiene interruptor: sus pocos pasos son los suyos.

## 7. Samplers y programaciones

**Muestreo**, bajo el pintor, plegado, sus valores en su resumen: los pasos, el sampler y la programación (y para 2512, Lightning y Guía), guardados para cada pintor; **Restablecer** devuelve los propios del pintor. Krea 2 y Qwen-Image 2512 con Lightning toman de 4 a 16 pasos; sin él, de 10 a 60.

El modelo dice en cada paso hacia dónde está la imagen; el **sampler** decide cómo llegar:

- **Euler**: una pasada por paso, el paso simple, la referencia (y con el que se destiló Lightning).
- **Euler SDE**: Euler con un poco de ruido fresco en cada paso: más grano, un poco menos fiel.
- **ER-SDE**: un resolvedor estocástico de tercer orden, una pasada por paso, guardando los dos pasos anteriores: más fino que Euler en el mismo tiempo.
- **RES 2s**, **RES 3s**: los métodos de un paso del resolvedor exponencial refinado, dos y tres pasadas por paso, devolviendo la mitad del ruido tras cada una; sus gemelos **ODE** no devuelven nada, así que una semilla pinta una imagen, la más cercana al camino exacto.
- **Heun++**: tres pasadas por paso donde puede, dos, luego una al final.
- **Exponential Heun** (y su SDE): un método exponencial de segundo orden, dos pasadas por paso.

Un sampler de dos o tres pasadas por paso cuesta dos o tres veces el tiempo de Euler. Frente al camino exacto de un flujo de juguete a 8 pasos se ordenan como dicen sus órdenes: Euler 0,138, Heun++ 0,111, exponential Heun 0,084, RES 2s 0,058, RES 3s 0,046 (el error: más bajo es más cerca).

La **programación** dice dónde se gastan los pasos entre todo el ruido y ninguno: **Simple** (por igual en el tiempo propio del pintor), **Karras** y **Exponential** (más pasos con poco ruido, para el detalle), **Beta** y **Beta 57** (densos en ambos extremos), **KL optimal** (el espaciado de Align Your Steps), **SGM uniform** (uniforme en el tiempo, sin el último paso), **Bong tangent** (dos pendientes de arcotangente, de todo el ruido a la mitad y de la mitad a nada).

**Qué funciona, según dos matrices de 54 imágenes** (un prompt, una semilla, cada pareja):

| pintor | bien | evitar |
|---|---|---|
| Krea 2 Muse | cada sampler y programación pintó una imagen entera | |
| Qwen-Image 2512 con Lightning | Simple, Beta, Beta 57, SGM uniform, Bong tangent | Karras, Exponential, KL optimal (pueden pintar el tema dos veces) |
| Qwen-Image 2512 sin Lightning | Euler, ER-SDE, RES 2s / 3s | Euler SDE (suave y brumoso) |

El formulario dice ambos avisos cuando vienen al caso. Los samplers se escribieron para el estudio a partir de sus artículos y las fórmulas de ComfyUI; RES4LYF se leyó solo por sus matemáticas (su licencia prohíbe servicios comerciales), y Heun++ es de Carzit (MIT).

## 8. Adaptadores (LoRA)

**Dónde viven**: `artwork/loras/<familia>/`, la familia la del pintor: `krea2`, `qwen-image-2512`, `qwen-image-2.1`. Las carpetas de dentro se vuelven grupos en la biblioteca; una imagen junto a un archivo con su nombre (`NAME.jpg`, `NAME.png`, `NAME.preview.png`) se muestra en su tarjeta; lo que el LoRA Manager de ComfyUI (`NAME.metadata.json`) o Stability Matrix (`NAME.cm-info.json`) escribieron junto a un archivo también se lee.

**La lista y la ejecución**: hasta ocho adaptadores en la lista bajo el pintor, hasta cuatro activos en una ejecución; cada uno a su fuerza (el deslizador de 0 a 1,5); un clic derecho **silencia** uno (se queda en la lista y sale de la ejecución), y un adaptador a cero tampoco se carga. Sus palabras clave se muestran debajo, y un clic en una la pone en el prompt (una ejecución también añade sola las palabras clave de un adaptador activo).

**Civitai**: **Buscar en Civitai** envía el SHA-256 de cada archivo y nada más, y guarda la respuesta a su lado (`NAME.civitai.info`: su nombre, su modelo base y sus palabras clave, y su primera imagen calificada como segura cuando no tiene una propia). **De Civitai…** descarga un adaptador cuyo autor no deja compartirlo, desde el propio Civitai, con tu propia clave: se lee un enlace, un id de versión o un AIR, se dice la familia que conviene a su modelo base, y solo se toma un LORA, LoCon o DoRA en `.safetensors`, su SHA-256 comprobado contra el de Civitai antes de convertirse en el archivo. Tu clave va solo a Civitai. Los adaptadores que sus autores dejan compartir llegan desde **Obtener pintores y adaptadores…**.

**Juntos**: desde dos adaptadores, una barra debajo da la suma de sus fuerzas en el camino del Creador: verde hasta 1,2, ámbar hasta 1,8, rojo más allá. Los adaptadores apilados se suman, y pasado más o menos 1,8 una imagen se quema (colores y bordes forzados) por modesto que sea cada uno. Arrastra la barra para moverlos todos a la vez, cada uno en proporción.

**Fuerza a lo largo de los pasos** (⏱ junto a un adaptador): fotogramas clave como los tienen los hooks de LoRA de ComfyUI, una parte de los pasos y un multiplicador: `0%:1, 50%:1, 60%:0` mantiene el adaptador entero la mitad de los pasos y lo suelta hacia el 60 %. Hasta ocho fotogramas clave, el multiplicador de 0 a 2, líneas rectas entre ellos. Un adaptador que da forma temprano a la composición y un adaptador de estilo que solo debe tocar el acabado son los dos usos.

**Por dentro**: los adaptadores van al transformer del pintor antes de pintar (PEFT), cada uno a su fuerza; un archivo kohya (`lora_unet_blocks_0_…`) se renombra con los nombres de capas propios del pintor; un adaptador que no alcanza ninguna capa del pintor (hecho para otro modelo) detiene la ejecución y lo dice. Un pintor guardado toma las fuerzas de una ejecución siguiente sin recargar sus adaptadores.

## 9. Regiones

**Regiones**, bajo Muestreo, plegado: hasta tres partes del encuadre, cada una con un lugar y palabras propias. Los lugares: la mitad izquierda, derecha, superior o inferior; el tercio izquierdo, central o derecho; los cuatro cuartos; el centro. Un pequeño mapa junto a cada fila muestra dónde queda.

**Cómo pinta**: en cada paso se pregunta al pintor una vez más por cada región, con el prompt principal y las palabras de la región, y sus respuestas se mezclan por las cajas de las regiones como pesos de bordes suaves (un borde de una vigésimo quinta parte del lado más corto), repartidos donde las cajas se solapan; el resto del encuadre sigue solo el prompt principal. Es el camino de Latent Couple: no necesita nada del modelo, y la escena sigue siendo una sola escena porque el prompt de cada región lleva el principal.

**Cómo escribirlas**: el prompt principal dice toda la escena, una región lo que está en ella. *Two animals sitting in a snowy forest clearing at dawn, oil painting*; mitad izquierda *a red fox sitting in the snow*; mitad derecha *a white snowy owl perched on a stump*. Con una semilla, Krea 2 Muse pintó dos gatos vagos sin las regiones y el zorro y el búho con ellas; Qwen-Image 2512 pintó dos osos sin ellas y el zorro y el búho con ellas.

**Lo que cuesta**: una pasada entera más por paso por cada región (en una 3090 a 16:9: Krea 2 Q4 48 s sola, 137 s con dos regiones; Qwen-Image 2512 fp8 141 y 281 s). La estimación de tiempo del formulario las cuenta.

Las regiones se guardan en este navegador; una región sin palabras no se envía; **Otra vez** pinta con las de la propia ejecución. Krea 2 y Qwen-Image 2512; Qwen-Image 2.1 edita con palabras y pinta sin ellas.

## 10. Rótulo

**Rótulo**, bajo Regiones, plegado: un título, y una segunda línea debajo, rotulados como parte de la pintura en vez de puestos encima como una capa que se queda aparte de la imagen. Sus palabras van en campos propios, nunca en el prompt, y el estudio escribe lo que lee el pintor. Dos maneras, elegidas bajo **Cómo**:

- **Pintado con la imagen** (Krea 2 Muse, Qwen-Image 2512 o 2.1): el estudio añade una frase al prompt: dónde, el título entre comillas, cómo son las letras, la segunda línea más pequeña debajo, y luego *painted in the same technique and light as the picture. No other text.* Un prompt de un párrafo la recibe al final; un prompt escrito en párrafos la recibe como párrafo propio, *TEXT RENDERING:*, segundo, tras el primero: al final de un prompt largo se ahoga (el prompt de Fosforida de Viktor, 3.200 caracteres en diez párrafos, pintó así tres imágenes sin una sola letra). El prompt de una toma pide que no haya texto (*No text, no letters.*): esa frase se quita primero.
- **Sobre la imagen de referencia** (Qwen-Image 2.1): una imagen terminada se rotula con palabras, el resto se conserva. La orden se escribe solo con los campos, así que el prompt puede quedar vacío. **Rotular**, en el escenario o en el menú de una imagen, hace de esa imagen la referencia, fija Cómo y abre el bloque con el título a mano.

**Los campos**: **Título** (60 caracteres); **Segunda línea** (80: el artista, el álbum; vacía para ninguna); **Las letras** (400, cómo son en palabras, tan largo como un párrafo de tipografía de un prompt; vacío: *large elegant classical serif capitals in warm gold, with even letter spacing*); **Dónde** (arriba, en el centro, abajo). **El título de la toma** llena el título con la toma elegida a la derecha. El bloque se guarda en este navegador; **Otra vez** rotula con las palabras de la propia ejecución; la línea de la ejecución guarda la frase que leyó el pintor.

**Lectura de vuelta**: los pintores escriben mal palabras que han visto poco. En un faro, Qwen-Image 2512 escribió «RUOCH STUDIO» y Qwen-Image 2.1 «RUUCH STUDIO», mientras «ПЕСНЯ МАЯКА» y «РУАХ СТУДИЯ» salieron bien. Así que cada imagen la lee de vuelta el oyente, Qwen2.5-Omni mediante llama.cpp (unos 5 s por imagen en una RTX 3090; leyó ambas faltas tal como eran), y se compara palabra por palabra: mayúsculas y saltos de línea aparte, nada más se perdona (ё no es е). Una imagen mal escrita se pinta de nuevo con otra semilla (su semilla más 1000, luego más 2000), hasta tres veces, por rondas: todas las imágenes mal escritas de una ejecución juntas, para que el pintor y el oyente cambien de sitio una vez por ronda. Se guarda la primera escrita exacta; los otros intentos van a la carpeta misspelled/ de la ejecución, guardados, nunca borrados. Cuando ningún intento es correcto, se guarda el más cercano y se dice mal escrito, con lo que se lee. Sin el oyente las imágenes se guardan tal como se pintaron y se dicen sin leer: nunca se muestran como bien escritas.

**La tarjeta para leer**: el oyente quiere unos 11 GB. Un pintor entero en la tarjeta pone sus pesos en la RAM mientras el oyente lee y los recupera después; Qwen-Image 2.1 deja la tarjeta libre por sí mismo; un pintor en flujo con sus bloques llenando la tarjeta deja al oyente leer en el procesador (unos 64 s por imagen).

**Las marcas**: junto a cada imagen **✓ Aa** (escrito como se pidió), **⚠ Aa** (mal escrito en todos los intentos; su ayuda dice qué se lee y cuántos intentos hubo), **? Aa** (no leído de vuelta). La línea del escenario dice *rotulado «…»* y, para uno mal escrito, lo que se lee.

**Tiempos** (RTX 3090, un cuadrado): Qwen-Image 2.1 rotuló una imagen terminada en 118 s, leída bien a la primera; un fine-tune fp8 de Qwen-Image 2512 sin Lightning (30 pasos, CFG de verdad 4, el camino propio de un fine-tune fp8) pintó una con sus letras en 230 s, contando su carga, unos 150 s de ellos la pintura. Una imagen mal escrita cuesta otra imagen entera por cada intento: de dos variaciones de «LANTERN SONG / RUACH STUDIO», una salió bien a la primera y la otra quedó mal escrita en los tres intentos («RUCH STUDIO»), guardada y dicha, en 743 s para la ejecución. Lightning hace de cada intento una fracción de eso. La estimación del formulario cuenta la lectura.

**Cirílico**: «ФОСФОРИДА | Возвращение Шехины» de Viktor en el estilo del prompt de su propio álbum. Qwen-Image 2512 escribió bien el título en las nueve imágenes; la segunda línea en minúsculas en ninguno de seis intentos (las minúsculas Щ y Ш garabateadas, «Вовуяеные Шехни»); en mayúsculas Щ y Ш salieron bien cada vez y solo la última letra falló («ШЕХИНЯ»), con las formas de las letras dichas también (su idea, HERESY 1396: Ы, Щ, Ш y las otras letras que un pintor entrenado en latín vio pocas veces, y Ф junto a la Φ griega, cada una descrita cuando las palabras la llevan). **Krea 2 Muse escribió exactas las dos líneas**: «ФОСФОРИДА / ВОЗВРАЩЕНИЕ ШЕХИНЫ» en dos variaciones, una al primer intento y otra al segundo, 184 s para la ejecución. Se probó y se dejó una pista deletreada («Ф-О-С-Ф-…»): Krea pintó sus guiones dentro del título, y el oyente, al que desde entonces se le pide conservar guiones y espacios, leyó una de ellas seguida. Para el cirílico, Krea 2 Muse primero; mayúsculas; y mira la marca.

**Por qué pintado, no compuesto**: una fuente real compuesta por el estudio (kerning, tracking e interlineado con raqm) y pintada levemente por encima escribe exacto, pero se queda como una capa sobre la imagen. De las cuatro maneras probadas, Viktor eligió las dos en que el pintor escribe las letras él mismo.

## 11. Una imagen de la que pintar

**La referencia**: suelta una imagen en su sitio bajo el prompt, pega una (Ctrl+V), elige un archivo, o toma la imagen del escenario con **Como referencia** (o la portada de la toma con **La portada de la toma**). PNG, JPEG o WebP, 40 MB como mucho.

### Usarla

**Usarla**, bajo la imagen, dice cómo:

- **para pintar desde ella** (por defecto): de imagen a imagen con el pintor del formulario, tanto como diga **Cuánto puede cambiar**;
- **para editar con palabras**: Qwen-Image 2.1 conserva la escena y cambia lo que dice el prompt (*the same lighthouse in a snowy winter night*: la nieve vino donde le toca, la torre y las rocas conservadas);
- **solo por su estilo**: Qwen-Image 2.1 pinta la escena propia del prompt con la técnica, la pincelada, la paleta y la luz de la imagen, sin conservar nada de su tema (un faro al óleo dio *a red fox in a snowy forest under the moon* con su pincel).

Las dos últimas se ofrecen cuando Qwen-Image 2.1 está aquí. Con cualquiera de ellas, la ejecución es del 2.1 sea cual sea el pintor del formulario: el modelo del formulario, el muestreo, los adaptadores, la máscara y el lienzo no se envían, y rige la licencia del 2.1. Por dentro, una referencia de estilo es el prompt envuelto en el pedido de tomar de la imagen solo el estilo y nada de su tema; editar es el camino propio del 2.1 con una imagen de condición.

### Cuánto puede cambiar

De imagen a imagen aquí es lo que InvokeAI hace con modelos que no tienen pipeline para ello: la imagen cubre cada forma y se recorta desde su centro, pasa por el decodificador del pintor al revés hacia latentes, y se le pone ruido hasta un punto de la programación propia del pintor; la pintura recorre luego el resto de la programación desde ahí. La fuerza elige ese punto: el más cercano de los pasos propios de la programación, dos pasos al menos.

| fuerza | lo que da (probado en Krea 2 Muse) |
|---|---|
| 0,3 | la imagen casi como está, su superficie tocada |
| 0,5 | la imagen conservada, sus cosas pequeñas cambiadas (rótulos, textura) |
| 0,6 | su composición conservada, su materia cambiada (la de la sala por defecto) |
| 0,75 | la composición conservada, tomados los materiales del prompt |
| 0,9 | la escena del prompt pintada con la luz y los colores de la imagen |
| 1,0 | pintada de nuevo |

**Ruido añadido** bajo la fuerza (0 por defecto, de 0 a 2): ruido fresco puesto sobre los latentes de la imagen antes de que la pintura parta de ellos, como hace el flujo de ComfyUI de Viktor con InjectLatentNoise (`samples + noise · strength` en el espacio propio del decodificador; aquí dividido por la dispersión de cada canal, para que el número signifique lo que significa allí). 0,3 trae grano y detalle nuevos, 0,6 es su segunda pasada, por encima de 1 las formas de la imagen empiezan a romperse. Solo mueve el comienzo: lo que conserva una máscara se queda limpio.

### Máscara

**Máscara…** pinta sobre la imagen lo que hay que repintar (Pintar y Borrar, B y E; el pincel y su tamaño, `[` y `]`; Invertir; Vaciar): el resto se queda exactamente como estaba, como en el inpainting. Por dentro, la máscara pasa a la rejilla propia de los latentes, y en cada paso la parte conservada se vuelve a poner como la imagen con el ruido de ese paso; la imagen terminada toma los píxeles propios de la imagen fuera de la máscara, difuminados.

Cuatro opciones bajo la imagen cuando hay una máscara (o Pintar alrededor):

- **Crecer**: la máscara crecida tantos píxeles, o encogida (de −64 a 128);
- **Borde**: lo suave que es su borde (de 0 a 96 px);
- **Suaves**: repintado suave, como differential diffusion: donde el borde es gris la imagen cambia solo en los últimos pasos, así que sin costura;
- **Grano**: cuánto de la pintura nueva toma la parte conservada en cada paso (de 0 a 0,6), su grano y su luz cosidos a los nuevos; 0 la conserva exacta.

El borde de una máscara redonda puede seguir viéndose sin ellas; Crecer 16, Borde 24, Suaves y Grano 0,15 cosieron una cara nueva en un lienzo viejo sin una línea.

### Pintar alrededor

**Pintar alrededor** mantiene la imagen entera en el centro de cada forma y pinta de nuevo los bordes que deja, en sus colores y su luz: una portada cuadrada a un 16:9 para un vídeo o a un 9:16 para un short, como outpainting.

### El lienzo

**Lienzo…** junto a Máscara… abre el lienzo, como el de InvokeAI: el encuadre de cada forma una pestaña arriba, que dice cómo se pintará (**desde ella**: la imagen cubre el encuadre y la ejecución pinta desde ella a la fuerza pedida; **alrededor**: la parte del encuadre que deja desnuda se pinta a su alrededor). En el tablero **Mover** (V) arrastra la imagen, o una esquina para escalarla con la esquina opuesta fija; **Pincel** (B) y **Goma** (E) pintan encima la máscara de inpainting; **Mano** (H, o Espacio mantenido) mueve el tablero; la rueda hace zoom, Alt+rueda escala la imagen alrededor del puntero, las flechas la empujan (Shift: diez píxeles). A la derecha las capas y el lugar en cifras; arriba **Ajustar**, **Llenar**, **Centrar** e **Igual en todas**, deshacer y rehacer (treinta pasos). **Hecho** guarda el lugar de cada forma con la referencia y la máscara en el formulario. Un lugar es el centro de la imagen en partes del encuadre y su ancho en anchos de encuadre.

## 12. La segunda pasada

**Segunda pasada…**, en el escenario junto a Reescalar…, pinta de nuevo una imagen más grande, como hace el flujo de ComfyUI de Viktor tras su primera pasada: la imagen subida **×1,5** o **×2** por vecino más cercano y pintada otra vez con el pintor, fine-tune, adaptadores, prompt y semilla propios de su ejecución, desde parte del camino.

**Cómo lo hace su flujo**, leído nodo a nodo: la imagen de la primera pasada 2× por nearest-exact, codificada por teselas, InjectLatentNoise 0,6, luego un segundo KSampler desde el paso 20 de 60 con CFG 4,5, con el mismo sampler y la misma programación que la primera pasada (ambos vienen de un empaquetador: ER-SDE y Bong tangent tal como está guardado el flujo).

**En el estudio**: **Cuánto puede cambiar** (0,5 primero: 0,3 conserva el dibujo y añade detalle, 0,5 afila su materia, 0,7 repinta sus formas) y **Ruido añadido** (0,6 primero, como el suyo) en su fila; los pasos, el sampler, la programación y Lightning son los del formulario cuando el formulario pinta con el mismo pintor, si no los propios de la ejecución. Su receta da a la segunda pasada muchos pasos y nada de Lightning: ajústalos en el formulario antes de pulsar ×2.

**Lo que cuesta y lo que da**: un 16:9 de 1920 × 1080 sale de 3840 × 2160. En una 3090, Krea 2 Q4 a 2560² en 86 s (14,5 GB de pico); un fine-tune fp8 de Qwen-Image 2512 a 3840 × 2160 en 220 s con 12 pasos y Lightning (22,9 GB, sus bloques en flujo). A 0,6 ambos conservaron la escena y movieron un poco sus partes; a 0,5 la composición se mantuvo. No para Qwen-Image 2.1; sin máscara ni lienzo con ella. **Otra vez** sobre una segunda pasada la pinta de nuevo a su tamaño.

## 13. Reescalar

**Reescalar…** en el escenario hace una imagen **2K** o **4K** (su lado largo 2560 o 3840) con un reescalador de `artwork/upscalers/` (`.pth` o `.safetensors`, se permiten carpetas): ESRGAN, DAT, HAT, ATD, SPAN, OmniSR y su familia, leídos por spandrel solo por el archivo. La imagen pasa por teselas de 512 con 32 de solape, guardando el centro de cada tesela (sin costura); un modelo 4× al que se pide menos pinta a 4× y se baja con Lanczos, más fino que un modelo 2×. El lado largo se detiene en 10 240 px. La **i** junto a la elección dice para qué es el reescalador elegido (fotos, caras, dibujo), su autor, su licencia y su tiempo medido; un clic abre las notas de todos, agrupados, los más rápidos primero, los no comerciales marcados.

**Pasadas…** hace un reescalado por pasadas, como la pila de ComfyUI de Viktor: hasta cuatro filas de un modelo y un factor, cada una pasada sobre la imagen tal como está y llevada al tamaño original por el factor de la pasada, luego el lado largo pedido y los colores igualados al original (hm-mvgd-hm: histogramas, media y covarianza, histogramas). Su cadena está a un clic cuando sus modelos están aquí: span otf strong ×2, luego Nomos8kDAT ×4, Remacri ×1,5, UltraMix Balanced ×2: una imagen de 1920 × 1080 a 7680 × 4320 en 246 s, sin costura, los colores conservados.

**TTA** junto al reescalador: cada tesela pasa por el modelo en sus ocho orientaciones (cuatro giros, cada uno reflejado), promediadas: bordes y texturas más estables, hasta ocho veces el tiempo. **Reescalar…** en la barra de las imágenes elegidas (Ctrl+clic) reescala hasta 64 de una vez, repartidas entre las tarjetas del laboratorio.

Reescalar y la segunda pasada hacen cosas distintas: un reescalador afila lo que hay; una segunda pasada pinta detalle nuevo al nuevo tamaño. Para imprimir: segunda pasada ×2 primero, luego reescalar.

## 14. El escenario, la biblioteca y la papelera

**El escenario**: un clic en una imagen la pone allí con su ejecución debajo; un clic sobre ella (o un doble clic en cualquier imagen) la abre sobre la página en su propia forma (← → recorren la ejecución, o la galería; Esc cierra). Debajo: **Al formulario**, **Como referencia**, **Comparar…**, **Poner como portada** (una cuadrada), **Descargar** (PNG, tamaño completo), **Sobre la página**, ★, **Proteger** (el escudo: una imagen protegida nunca va a la papelera ni se borra, la haya mandado allí lo que sea), **Papelera**, **Segunda pasada…**, **Reescalar…**. Los datos y el prompt de la ejecución están en una ayuda junto a la imagen mientras el puntero está sobre ella.

**Ejecuciones o Galería**: las ejecuciones muestran cada pulsación de Dibujar con su prompt y su semilla, las más nuevas arriba; la galería muestra cada imagen de cada ejecución en una sola rejilla, por forma, con estrella o protegidas, en tres tamaños, en teselas iguales. Las flechas recorren la biblioteca mientras tiene una imagen: ← → la imagen anterior y la siguiente, ↑ ↓ una fila de la galería (en las ejecuciones, la ejecución anterior y la siguiente); el escenario sigue.

**Comparar**: **Comparar…**, luego la otra imagen elegida en la biblioteca: las dos una sobre otra bajo un divisor que arrastras (← → lo mueven), o lado a lado (S); X las intercambia, Esc cierra.

**El menú de una imagen** (clic derecho en cualquier imagen): Sobre la página, Al escenario, Al formulario, Todo al formulario, Como referencia, Comparar…, Poner como portada, Reescalar (2K o 4K), Marcar con estrella, Elegir, Copiar el prompt, Copiar la semilla, Descargar, El archivo en una pestaña nueva, Su ejecución, A la papelera.

**Elegir muchas**: Ctrl+clic elige imágenes, Mayús+clic un rango; la barra de las elegidas las marca con estrella, las reescala o las manda a la papelera de una vez (Esc las suelta).

**La papelera**: **Papelera** en una ejecución la mueve a `trash/artist/`; la Papelera del escenario aparta una imagen. La vista **Papelera** muestra las imágenes apartadas (Restaurar, ✕, Restaurar todas), luego las ejecuciones en la papelera (Restaurar, Eliminar para siempre); **Vaciar** borra todo lo que muestra, preguntando antes. **Papelera (Arte)** en el Bibliotecario guarda el arte retirado en una sola lista, también las portadas quitadas a las tomas.

**El registro del Artista**: el marco del registro del servidor tiene una vista **Artista**, la propia de la sala: lo que se pidió (el pintor, el fine-tune, las formas, la semilla, el muestreo, los adaptadores), lo que respondió el laboratorio (un rechazo con sus propias palabras), el camino de cada ejecución hasta su final (esperas y por qué, la tarjeta en que pinta, hecho, detenido, fallido y por qué). **⧉** lo abre en una ventana propia, con las tarjetas en vivo al lado.

## 15. Portadas para las tomas

**Poner como portada** de una imagen cuadrada la hace portada de la toma en mano: en su tarjeta, en el reproductor y en su MP3. La portada que tenía se guarda junto a la toma (`artwork-removed/`), y la otra letra de una pareja A/B recibe también la nueva cuando no tiene ninguna. Una portada es la copia propia de la toma (1024 px, con el nombre de la ejecución y de la imagen de la que vino), así que quitarla de la toma nunca toca la imagen, y que la imagen se vaya nunca toca la portada; mandar una imagen así a la papelera pregunta si quitar también la portada de la toma, o dejarla.

**La portada propia de una toma** (*Dibujar la portada* en su menú, en el Bibliotecario, para una toma o muchas) la pinta el pintor elegido en **Motor → Portada**, o según las tarjetas cuando no se eligió ninguno: **Qwen-Image 2512** donde una tarjeta de los trabajos del laboratorio lo cabe entero (Q6 desde 20 GB, Q4 desde 16 GB: es el que mejor sigue el prompt y rotula bien un título), si no **Krea 2 Muse Q4** (entero en una tarjeta de 16 GB, sus bloques desde la RAM en una más pequeña). Un pequeño modelo de lenguaje escribe su prompt a partir del estilo y las palabras de la toma, y el crítico mira si su tema está ahí. Una portada es un trabajo propio que carga su pintor de nuevo, así que una portada de Qwen tarda más o menos el doble que una de Krea: en una 3090, Krea 2 Muse Q4 unos 65 s, Qwen-Image 2512 Q4 125 s y Q6 131 s, todo contado (sección 18). Un Q4 no es más rápido que un Q6: pintar es la aritmética de la tarjeta, no su memoria.

## 16. Recetas

**Una portada, rápida.** Krea 2 Muse Q4, 1:1, Variaciones 4, el muestreo tal como viene. Dos minutos para cuatro candidatas; elige, Poner como portada.

**Realismo acabado.** Qwen-Image 2512 con un fine-tune fp8, Lightning apagado, de 30 a 40 pasos, Guía 4, ER-SDE o RES 2s con Beta. Luego Segunda pasada ×2 a 0,45 con Ruido añadido 0,6 (el muestreo del formulario pasa a ella), luego Reescalar 4K o las pasadas.

**La primera y la segunda pasada del ComfyUI de Viktor.** Un fine-tune fp8, ER-SDE y Bong tangent, 12 pasos; Segunda pasada ×2 con 0,6 de ruido añadido y muchos pasos sin Lightning, la fuerza entre 0,5 y 0,65.

**Un fotograma de vídeo desde una portada.** La portada como referencia, Pintar alrededor, la forma 16:9 (o 9:16 para un short): los bordes pintados en sus colores y su luz, la portada entera en el centro. En el lienzo, mueve o escala primero la portada en cada encuadre si no debe quedar en el centro.

**Arreglar una parte.** La imagen como referencia, Máscara… sobre la parte, el prompt diciendo qué debe haber allí, fuerza 1,0; Crecer 16, Borde 24, Suaves, Grano 0,15 para una costura que no se ve.

**Dos temas en sus sitios.** El prompt principal para toda la escena, una región para cada tema (mitad izquierda, mitad derecha), las palabras de las regiones cortas y concretas.

**El estilo de un cuadro antiguo para una escena nueva.** El cuadro como referencia, Usarla: solo por su estilo, el prompt para la escena nueva.

**La misma escena en otra estación u hora.** La imagen como referencia, Usarla: para editar con palabras, el prompt diciendo el cambio (*the same street in heavy rain at night*).

**Una impresión.** Segunda pasada ×2, luego Pasadas… hasta 7680 en el lado largo, TTA para un cielo liso.

## 17. Cuando algo sale mal

| lo que ves | por qué | qué hacer |
|---|---|---|
| el tema pintado dos veces | Qwen-Image 2512 con Lightning en Karras, Exponential o KL optimal | Simple, Beta, Beta 57, SGM uniform o Bong tangent |
| imágenes de Qwen suaves y brumosas | Euler SDE sin Lightning | Euler, ER-SDE o RES |
| colores y bordes quemados | la suma de los adaptadores pasada de 1,8 | bájalos (la barra Juntos), o fotogramas clave que suelten uno pronto |
| «el adaptador no alcanza ninguna capa» | un adaptador hecho para otro modelo | ponlo en la carpeta de su propia familia |
| letras que no pediste | los dos pintores rotulan las portadas solos | termina el prompt con *no text* |
| falta una imagen en una ejecución | el filtro de contenido la marcó | la ejecución lo dice; cambia el prompt |
| una costura visible alrededor de una máscara | un borde duro | Crecer, Borde, Suaves y un poco de Grano |
| la segunda pasada movió la escena | la fuerza demasiado alta | de 0,4 a 0,5 |
| la ejecución espera una tarjeta | las tarjetas del laboratorio están ocupadas o son pequeñas ahora | la actividad del registro dice por qué; Fuera de la cola la retira |
| «ninguna tarjeta de aquí puede tomarlo» | el pintor con sus adaptadores necesita más de lo que cabe en cualquier tarjeta | menos adaptadores o un pintor más pequeño (Krea 2 y Qwen-Image 2512 van en flujo en su lugar cuando pueden) |
| regiones ignoradas | elegido Qwen-Image 2.1, o una región sin palabras | Krea 2 o Qwen-Image 2512, palabras en cada región |
| primera ejecución lenta, rápidas las siguientes | el pintor carga una vez y se queda diez minutos | es lo previsto |

## 18. Las cifras

Medidas en una RTX 3090 (24 GB) con las herramientas propias del estudio.

| qué | tiempo | tarjeta en el pico |
|---|---|---|
| Krea 2 Muse Q4, 1280² | unos 35 s | unos 10 GB |
| Krea 2 Muse Q4, 16:9 | unos 47 s | unos 11 GB |
| Krea 2 Muse Q8, 1280² | unos 34 s | unos 16 GB |
| Qwen-Image 2512 Q4, 1328², Lightning | 30 s | 14,3 GB |
| Qwen-Image 2512 Q6, 1328², Lightning | 32 s | 17,6 GB |
| fine-tune fp8 de Qwen-Image 2512, 1328², Lightning 0,55, 12 pasos | 37 s | 21,0 GB |
| fine-tune fp8 de Qwen-Image 2512, 16:9 | unos 141 s con su carga | 20,5 GB |
| Qwen-Image 2.1 desde palabras, 1328² | 120 s | 16,4 GB (entero), 4,1 GB (en flujo) |
| Qwen-Image 2.1 editando | de 122 a 129 s | 19,1 GB (entero), 7,9 GB (en flujo) |
| dos regiones, Krea 2 Q4, 16:9 | 137 s | como sin ellas |
| segunda pasada ×2, Krea 2 Q4 a 2560² | 86 s | 14,5 GB |
| segunda pasada ×2, fine-tune fp8 de Qwen-Image 2512 a 3840 × 2160 | 220 s | 22,9 GB |
| reescalado ×2, 4x_Nomos8kDAT, 1280² a 2560² | 32 s | 2,1 GB |
| reescalado por pasadas, su cadena, 1920 × 1080 a 7680 × 4320 | 246 s | |
| portada de una toma por Krea 2 Muse Q4 (un trabajo propio: el pintor cargado, el prompt escrito, la mirada del crítico) | unos 65 s | |
| portada de una toma por Qwen-Image 2512 Q4 / Q6, lo mismo | 125 s / 131 s | |

La primera ejecución de un pintor añade su carga: unos 25 s para Krea 2 Muse, un minuto o dos para los pintores Qwen.

## 19. Para scripts y agentes

El laboratorio responde en la máquina del estudio (a través de la página en `/lab/…`); la API del estudio (`/api/v1`, OpenAPI 3.1) y su servidor MCP están al lado. Los endpoints propios del Artista:

- `POST /artist/draw`: una ejecución. Su cuerpo: `prompt`; `shapes` (`1:1`, `16:9`, `9:16`); `count` (de 1 a 4); `seed`; `painter` (`krea2-q4`, `krea2-q8`, `qwen2512-q4`, `qwen2512-q6`, `qwen2512-fp8`, `qwen21`); `model` (el archivo de un fine-tune fp8); `sampling` (`steps`, `sampler`, `schedule`, `lightning`, `cfg`); `loras` (`[{id, weight, keys}]`); `ref` (una data URL, o `{id, file}` de una imagen de una ejecución anterior) con `strength` (de 0,2 a 1) y `ref_as` (`edit`, `style`); `mask` con `mask_opts` (`grow`, `edge`, `soft`, `grain`); `fit` (pintar alrededor); `place` (el lienzo: `{shape: {x, y, s}}`); `inject` (de 0 a 2); `scale` (1,5 o 2, una segunda pasada); `regions` (`[{prompt, box: [x, y, w, h]}]`, tres como mucho); `letters` (`{title, sub, look, where, way}`: `where` `top`, `middle` o `bottom`, `way` `paint` o `letter`; con `letter` el pintor es `qwen21` con un `ref`, y `prompt` puede ir vacío); `preview`; `take`. Una ejecución rotulada lleva `letters_prompt` (la frase que leyó el pintor), y cada una de sus imágenes `letters`: `{read, exact, near, tries}`, o `{unread}` cuando el oyente no pudo leerla.
- `GET /artist/runs`, `GET /artist/file`, `POST /artist/stop`, `POST /artist/cover`, `POST /artist/star`, `POST /artist/protect`, `POST /artist/trash`, `POST /artist/restore`, `POST /artist/aside`.
- `GET /artist/painters` (los pintores de aquí, sus tarjetas y fine-tunes), `POST /artist/unload` (soltar los pintores guardados).
- `GET /artist/upscalers`, `POST /artist/upscale` (`{id, file, model, target}` con `2k` o `4k`; o `passes`, `resample`, `long`, `match`; `tta`; o `items` para muchas).
- `GET /artist/loras`, `POST /artist/lora-civitai` (buscar por hash), `POST /artist/civitai-look`, `POST /artist/civitai-fetch`.

Un rechazo vuelve como `400` con el motivo en palabras, las mismas palabras que muestra la sala.

## 20. Licencias

Krea 2 Muse: la Krea 2 Community License (su filtro de contenido se aplica a cada imagen que pinta el estudio). Qwen-Image 2512 y Lightning: Apache-2.0. Los fine-tunes fp8: los términos de cada autor. Qwen-Image 2.1: la Qwen Research Licence, solo investigación y evaluación. Adaptadores: los términos de cada autor, como los lista Civitai. Reescaladores: cada uno los suyos; las notas de OpenModelDB dicen cuáles son no comerciales, y la sala los marca. Lo que puedes hacer con las imágenes que pintas se sigue de estas; cuando importe, léelas antes de vender.

## 21. Lo que viene

Las versiones de la imagen de una toma, y SeedVR como reescalador (en 2.1.0, con la fase del DAW).
