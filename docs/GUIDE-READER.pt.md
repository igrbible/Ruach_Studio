## Leitor <!-- #reader -->

O Leitor, a sala depois do Videógrafo, faz de um texto uma voz: um capítulo, um livro, uma radionovela, um podcast, uma voz sobre um clipe. Lê com uma voz constante ou como um diálogo de várias, ouve cada pedaço que leu e põe a gravação na Biblioteca como põe uma canção.

![O Leitor de dia: o texto e a sua voz à esquerda, as leituras à direita](guide/reader.png "O Leitor: o texto, a voz, o motor, as leituras")

### O que faz <!-- #what-it-does -->

**Modo** dá duas maneiras de ler. **Narração**: uma voz lê o texto inteiro, cortado por **frases** (pedaços de cerca de duzentos caracteres, uma linha em branco uma pausa maior) ou por **versículos** (uma linha por pedaço, sem ler o número do versículo nem os números de Strong); o primeiro pedaço que dura 2.5 s torna-se a referência de todos os seguintes, e a voz mantém-se ao longo do capítulo. **Diálogo**: uma linha por fala, escrita `Name: words`, uma voz para cada falante; uma linha sem nome continua a fala anterior.

**Ler** inicia a leitura. Espera na fila como os outros trabalhos pesados do laboratório, com a sua barra acima do player e as suas linhas no log. O seu cartão diz a quantização e o tempo que falta enquanto lê; no fim, a duração, a velocidade, o que o Whisper ouviu e a loudness.

### O motor: Drama 3 <!-- #the-engine-drama-3 -->

O Leitor lê com o Fish Audio Drama 3 (35B MoE, 3B ativos) através do audio.cpp, a partir de quantizações GGUF em `models/narrator/drama-3-gguf/` com o LICENSE e o NOTICE ao lado; sem eles o motor não carrega. Lê russo, ucraniano, hebraico, grego, inglês, espanhol, italiano, francês, português, alemão, japonês e chinês. Um motor seu liga-se em `user/reader/engines/` com o seu próprio `engine.json` e aparece em **Motor** ao lado dele.

### Quantizações e velocidade <!-- #quants-and-their-speed -->

![A escolha da quantização e a linha por baixo](guide/reader-tier.png "Quantização: o que lê, onde, e quanto vai demorar este texto")

**Quantização** diz qual quantização lê e onde. **Auto · velocidade primeiro** (o padrão) e **Auto · qualidade primeiro** escolhem pela memória livre quando a leitura começa; uma quantização nomeada na lista fica nela. A linha por baixo diz o que leria agora e em que placa, um segundo de fala em quantos segundos, e quanto demorará este texto com o carregamento do modelo.

Medido numa RTX 3090 em 09.11.2026 com um pedaço russo de 27 s. RTF são os segundos para ler um segundo de fala; o Whisper ouviu certa cada letra, salvo onde a linha diz outra coisa:

| quantização | bancos de especialistas na RAM | na placa | RAM | RTF | como foi medido |
|---|---|---|---|---|---|
| Q4_K | 4 | 21.5 GiB | 3 GiB | 0.62 | a placa sozinha |
| Q6_K | 16 | 21.9 GiB | 11.2 GiB | 1.16 | a placa sozinha |
| Q8_0 | 20 | 23.0 GiB | 17.3 GiB | 1.37 | a placa sozinha |
| Q8_0 | 40 | 6.9 GiB | 33.2 GiB | 2.43 | a placa sozinha |
| Q4_K | 20 | 15.7 GiB | 9.8 GiB | 1.34 | ao lado de um trabalho de dataset |
| Q6_K | 28, cuda_perf | 13.8 GiB | 18.6 GiB | 1.74 | ao lado de um trabalho de dataset; uma palavra mal ouvida |
| Q4_K | 40, cuda_perf | 7.3 GiB | 18.3 GiB | 1.75 | ao lado de um trabalho de dataset |
| Q6_K | 40, cuda_perf | 7.3 GiB | 26.0 GiB | 2.46 | ao lado de um trabalho de dataset |
| Q8_0 | só o processador | — | 44 GB | 7.0 | o processador |

As linhas ao lado de um trabalho de dataset são pessimistas: o cálculo da placa e o processador eram partilhados com ele, e uma placa só sua lê-as mais depressa. **Q8_0 · 20 bancos de especialistas na RAM, 40 numa placa partilhada** fica no Q8_0: 20 bancos na RAM numa placa com 23.6 GB livres; quando a placa está partilhada, os 40 na memória da máquina; com **Auto** como placa, o processador por último. A primeira leitura carrega o modelo; numa placa ele fica carregado entre leituras.

### Notas das quantizações <!-- #grades-of-the-quants -->

A lista «Quantização» pinta cada quantização pelo teste bruto de 09.11.2026: a primeira leitura de dois pedaços russos de 30 s (um com etiquetas de emoção, outro simples), cinco sementes cada, a amostragem do Leitor (temperature 0.8, top_p 0.9), sem releitura e sem segunda semente; o Whisper large-v3 ouviu palavras acrescentadas, omitidas ou trocadas. **Verde**, estável: nenhuma palavra errada em nenhum take. **Amarelo**, médio: uma palavra errada em um take de dez; o ouvido do Leitor relê esse pedaço. **Vermelho**, não recomendado: erros em dois takes ou mais, ou um grosseiro; o Auto nunca o escolhe, e a sua dica e o cartão da leitura dizem isso. Todas as quantizações na placa saíram verdes, os 70 takes limpos. Onde os tensores são calculados importa, mas como importa uma semente: a mesma quantização com a mesma semente, com os especialistas na placa ou na RAM (as 20 camadas inferiores, centrais ou superiores), separa-se desde os primeiros 40–60 ms noutra leitura, enquanto uma repetição na mesma distribuição é idêntica até ao bit. Uma semente mostra um caminho entre muitos: a palavra depois de «глубоко» no conjunto às cegas de 09.11 (todos os takes numa semente) é uma inserção sonora de 0.7–1 s, não um suspiro.

| quantização | bancos de especialistas na RAM | takes com palavra errada | nota |
|---|---|---|---|
| Q4_K | 40 | 0 / 10 | verde |
| Q6_K | 40 | 0 / 10 | verde |
| Q8_0 | 40 | 0 / 10 | verde |
| Q4_K | 20 · inferiores | 0 / 10 | verde |
| Q4_K | 20 · centrais | 0 / 10 | verde |
| Q4_K | 20 · superiores | 0 / 10 | verde |
| Q4_K | 40 · temperature 1.0 | 0 / 10 | verde |
| Q4_K · Q6_K · Q8_0 | só o processador | em medição | em medição |

### Texto, vozes e emoções <!-- #text-voices-and-emotions -->

**Voz do leitor**: a voz do próprio motor, mantida desde o primeiro pedaço; ou **A sua própria voz…**, um clip curto de uma voz que o motor segue, aceite só sob o aviso vermelho e com o consentimento marcado (clonar uma voz sem o consentimento do seu dono é crime em muitos países, e a responsabilidade é sua). Nenhuma voz pronta vem com o Studio. A altura de cada pedaço é medida ao ser lido; um pedaço cuja voz passou para o outro género é lido de novo com outra semente.

As emoções e os sons vão entre parênteses retos, como o Drama 3 os lê: `[calm]`, `[sad]`, `[whispering]`, `[pause]`, `[laughs]`. **Paleta de etiquetas** insere-os: uma emoção, um andamento ou um estilo no início da sua frase, uma pausa ou um som no cursor. **Ler as etiquetas em linha** vem ligado num diálogo e desligado numa narração, onde se quer uma leitura limpa de livro. **Estilo** dá à leitura toda um parêntese próprio, como `calm, warm, unhurried narration`.

### Tónicas e o agudo <!-- #stresses-and-the-acute -->

**Pôr as tónicas** marca as vogais tónicas antes de o motor ler: as suas próprias marcas ficam como escritas (o agudo, U+0301, como em `звени́т`), depois o seu **Dicionário de tónicas**, depois o grande dicionário da língua, onde existe: o do ucraniano vem com o Studio (o de lang-uk, dos «Словники України» do ULIF), e para o russo ou qualquer outra língua pode ligar o seu (`docs/NARRATOR-DICTIONARIES.md`); uma palavra com duas tónicas fica entregue ao contexto. **Verificar tónicas** mostra o texto como o motor o vai ler. Uma palavra mal lida numa gravação: **Corrigir** na sua leitura, escolha o pedaço, ponha a tónica, **Lembrar a tónica no dicionário** e **Ler o pedaço de novo**.

### O mapa de glifos do LCV <!-- #the-lcv-glyph-map -->

**Ler as letras LCV pelo mapa de glifos** transforma as letras próprias do LCV (Ѓ, Ђ, Љ, ѵ, Ѳ e as restantes) naquilo que o motor lê, pela tabela do autor: `Авраѓа́ма` lê-se `Авраהа́ма`. **Mapa de glifos do LCV** sob o dicionário mostra a tabela; **Salvar como minha cópia** guarda a sua cópia em `user/reader/glyphs.map.tsv`, e a partir daí é ela que se aplica; **Voltar à tabela do autor** larga-a. O interruptor vem desligado.

### O ouvido e a loudness <!-- #the-ear-and-the-loudness -->

**Ouvir cada pedaço (Whisper)**, ligado por padrão: o Whisper large-v3 no processador ouve cada pedaço enquanto o motor lê o seguinte. Um pedaço em que ouve uma palavra acrescentada, omitida ou trocada, ou cujas letras se afastam do texto 12 % ou mais (uma repetição, um salto, um murmúrio), é lido de novo com outra semente, até três leituras, e fica a mais próxima do texto. O cartão da leitura diz que pedaços foram relidos e porquê, a palavra com o seu momento na gravação. A gravação é unida a −16 LUFS, como os podcasts, com os picos nunca acima de −1 dBFS. Um ouvido que não conseguiu carregar é dito na leitura e na nota da gravação, nunca tomado por uma leitura limpa.

### De uma gravação <!-- #from-a-recording -->

**De uma gravação** recebe uma palestra ou um stream (qualquer áudio, ou o som de um vídeo), e **Transcrever** ouve-o com o Whisper: as palavras com os seus tempos e um texto em parágrafos nas suas pausas. **Limpar com o modelo do Escritor** corrige o que o Whisper ouviu mal, a pontuação e as maiúsculas, mantendo cada palavra e a sua ordem; **Para o texto** põe-no no texto do Leitor, como diálogo quando as linhas são `Name: words`.

### Licenças <!-- #licences -->

O Drama 3 está sob a Fish Audio Community License v1.0: livre para investigação e uso não comercial, e para uso comercial enquanto a receita anual ficar abaixo de USD 500,000. Não permite um serviço alojado de TTS ou de clonagem de voz para outros, a voz de uma pessoa real clonada sem consentimento, nem o uso do que produz para treinar ou destilar outro modelo; a sua marca de água fica no som. Cada gravação que lê leva **Built with Fish Audio** no resultado da leitura, no editor da gravação e na sua nota da Biblioteca. Cada gravação do Leitor fica marcada como nunca para treino: o seu ficheiro leva a marca, o Treinador recusa uma pasta que a contenha e as cozinhas de datasets deixam-na de fora.

### Uma leitura em seis passos <!-- #a-reading-in-six-steps -->

1. Cole o texto, ou traga-o **De uma gravação**.
2. Escolha **Modo**: **Narração** para um livro, **Diálogo** para vozes.
3. Escolha a **Voz do leitor**; num diálogo, uma para cada falante.
4. Deixe **Pôr as tónicas** ligado; para o LCV, junte **Ler as letras LCV pelo mapa de glifos**.
5. Veja **Quantização** e a linha por baixo: a quantização, a placa, quanto vai demorar.
6. **Ler**, depois ouça a gravação; um pedaço que saiu mal passa por **Corrigir**.
