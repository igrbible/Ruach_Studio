# Ruach Studio · o guia

Canções a partir de palavras, na sua própria máquina: cada sala, o que cada coisa faz, e os números que medimos.

## Comece aqui <!-- #start -->

### O que é isto <!-- #what-this-is -->

O Ruach Studio transforma uma linha de estilo e uma letra numa canção pronta com o **YuE2**, o modelo de canções aberto, rodando na sua própria GPU. Nada sai da máquina. Em volta do modelo há um estúdio inteiro: uma sala de escrita com um modelo de chat, pós-produção (stems, remasterização, ampliação, conferência da letra), uma coleção de todos os takes e uma sala que treina adaptadores LoRA com as suas próprias canções.

![O Criador: o formulário à esquerda, o take no meio, todos os takes à direita](guide/studio-create.png "O Criador: o formulário, o take que você está ouvindo e todos os seus takes")

O YuE2 tem **duas metades**, e quase tudo o que você ajusta no estúdio mira uma delas:

| metade | o que faz | o que você controla ali |
|---|---|---|
| **Música** (AR, o modelo de linguagem) | escreve a canção: primeiro uma partitura (notação ABC), depois os tokens musicais, 25 por segundo | o modo de planejamento, a partitura, a semente da música, a força musical de uma LoRA |
| **Som** (NAR + VAE) | renderiza os tokens em som | a semente do som, o VAE, a força sonora de uma LoRA, os passos e o solver |

### As seis salas <!-- #the-six-rooms -->

| sala | para |
|---|---|
| **Criador** | o formulário da canção e o take que você está ouvindo |
| **Escritor** | suas canções como documentos com versões; um modelo de chat redige e revisa com você |
| **Lapidador** | depois da renderização: espectro, artefatos, antizumbido, conferência da letra, stems, remasterização, ampliação |
| **Pintor** | imagens para as suas canções a partir de um prompt seu: quadrada, larga e alta com uma semente só; uma quadrada vira a capa de um take (uma prévia) |
| **Bibliotecário** | todos os takes: espaços, busca, curtidas, notas, ações em lote, a lixeira |
| **Treinador LoRA** | adaptadores LoRA a partir das suas próprias canções: o conjunto, a execução, a telemetria e as épocas |

### A barra <!-- #the-bar -->

![A barra: as salas, o espaço e os poucos botões que você usa o tempo todo](guide/bar.png)

As salas abrem a barra na ordem do trabalho: Criador, Escritor, Lapidador, Pintor (uma prévia: imagens para as suas canções) e Bibliotecário; o logo fica no meio, o Treinador logo depois; à direita, o espaço, a lâmpada do motor (verde: pronto; âmbar: trabalhando; vermelho: algo falhou) e os poucos botões. O ponteiro na lâmpada (ou um clique) abre **o que roda e o que espera**: as canções, as regenerações e o trabalho do laboratório nas placas (arte, stems, ampliação, Whisper). Um item em espera sai da fila pelo seu ✕, apertado duas vezes (o primeiro aperto pergunta); o que já roda para onde aparece: uma canção na sua execução, um treino no Treinador.

- **Espaço**: o espaço em mãos. A lista de takes mostra só ele, e cada take novo cai nele. *Todos os espaços* mostra tudo. Onde a barra é estreita (sem logo), a palavra *Espaço* também sai; a caixa fica.
- **EN** (as duas letras do idioma): a página em outro idioma, guardado com os seus ajustes: English, Русский, Українська, Беларуская, Ελληνικά, Español, Italiano, Français, Português, Deutsch, 日本語, 中文, cada um com o nome nas próprias palavras. Números e datas seguem o idioma, e este guia abre nele.
- **☀ / ☾**: dia, noite, ou como o sistema disser.
- No cabeçalho de Compor: **Salvar** um prompt (tudo o que Gerar enviaria) como JSON ou YAML, e **Abrir** de novo; **Limpar** as palavras (título, estilo, letra, partitura, sementes) e manter o resto, ou começar uma **Canção nova** (o modo, a amostragem, os sliders e as LoRAs voltam ao padrão também; *Som e saída* fica). **Abrir** diz o que de um arquivo o formulário não conseguiu receber, e o que ele traz no lugar.
- **Exportar para a DAW** (no ☰, e no Lapidador: ao lado do take em mãos e nos seus Stems): a saída do estúdio. Ou a faixa mixada como está (WAV, FLAC, MP3), ou o take inteiro na sua própria DAW, onde o resto acontece fora do estúdio. A página encontra REAPER, Waveform e Bitwig na máquina do estúdio, ou você indica a sua. Qualquer take sai pelo seu menu (clique direito): *Exportar para a DAW → Projeto REAPER* ou *DAWproject* (Waveform, Bitwig, Studio One, Cubase), a sua DAW primeiro; a aba DAW deste guia diz o que vai dentro.
- **Descarregar o modelo**: tira agora da memória da GPU todo modelo ocioso; fica vermelho enquanto um modelo está carregado.
- **☰**: o resto. A placa e sua memória, a cópia do modelo, o decodificador de som (VAE), **Exportar para a DAW**, os temas, a sala Motor e este guia. **Tamanho do texto** ali ajusta todo o texto da página de −2 a +4 pt (o layout fica), e um quadro destacado tem os próprios −, + e ⟲ por cima (−4 a +6 pt); cada tela guarda o seu.

![Atrás do ☰](guide/more-menu.png)

### Sua primeira canção, em seis passos <!-- #your-first-song-in-six-steps -->

1. Dê um **Título** a ela, e escolha o **Tom** se tiver um em mente (ou deixe *como escrito*).
2. Escreva o **Estilo**: idioma, gênero, voz, instrumentos, andamento. Uma ou duas linhas simples bastam. O ♪ ao lado lista 200 instrumentos com o que o YuE2 de fato toca (veja *Criador*).
3. Cole a **Letra** com as tags de seção em linhas próprias: `[Verse]`, `[Chorus]`, `[Bridge]`, `[Outro]`.
4. Mantenha **Plano completo** como modo de planejamento: o YuE2 escreve primeiro uma melodia e acordes, depois a canção.
5. Aperte **Gerar canção**. A execução mostra as etapas: a partitura, os tokens musicais, o som, a decodificação.
6. O take abre no meio, com o player, a partitura e tudo para fazê-lo de novo.

> Medido numa RTX 3090: uma canção de 6:12 no modo Direto levou 126 segundos, uma de 7:25 no Plano completo 198 segundos (a partitura é escrita primeiro). Canções mais curtas são mais rápidas.

### O player, os takes e o log do servidor <!-- #the-player-the-takes-and-the-server-log -->

- **O player** embaixo: a onda de ponta a ponta, uma nuvem suave com a parte já ouvida na cor de destaque (um clique pula para lá); embaixo dela o take (a arte quando tem, o título, as primeiras palavras do estilo, 👍 👎 ★), depois **aleatório**, anterior, tocar, próximo e **repetir** (desligado · a lista toda de novo · este take de novo, marcado 1), depois o tempo (um clique no total o troca pelo tempo restante), *Tocar ao clicar* (um clique numa lista toca o take na hora), *Tocar em sequência* (quando um take termina, o próximo da lista começa), *Tocar takes novos* (uma canção feita aqui toca quando fica pronta, a não ser que algo esteja tocando), 🔔 *um som quando uma execução termina* (duas notas subindo quando fica pronta, uma vez só para uma fila de execuções, duas descendo quando uma falha; nenhum por cima de uma canção nova que começa a tocar sozinha), a **velocidade** (0.50× a 2.00×, com a altura mantida), o volume e um ponto para o estado (ele pulsa enquanto um take toca). O que você não precisa agora fica apagado até o ponteiro chegar; cada ícone diz o que faz quando o ponteiro para nele. O ponteiro sobre a onda mostra o tempo para onde um clique pularia. As teclas de mídia do teclado e de um headset controlam o player, e o painel de mídia da área de trabalho mostra o take. ⏪ e ⏩ vão à marca anterior ou à próxima a cada 15 s desde 0:00, ← e → às marcas a cada 5 s (Shift: 30 s). A pílula de estado na ponta direita do player (verde enquanto um take toca, na cor de destaque enquanto um é feito) abre o take ou a execução; com Compor destacado sobre a sala, ela troca o quadro pelo do take. Um clique direito na onda, na imagem ou no título abre o menu do take, como numa lista. A onda mostra as seções do take: as próprias tags da letra, cada uma onde o Whisper ouve o seu primeiro verso (uma vez por take, cerca de meio minuto; sozinho numa máquina de duas placas ou mais, senão menu do take → *Achar as seções de ouvido*); um take nunca ouvido mostra as marcas da partitura. Um traço fino em cada início, o nome embaixo; um clique perto de um traço vai ao começo exato da seção; o ponteiro sobre a onda mostra um cartão com a seção, o tempo e os versos como escritos, o verso cantado ali aceso; uma seção marcada com ? não foi ouvida com clareza. O ponteiro parado um momento na onda traz sobre o player o espectrograma do take inteiro (o interruptor do espectro ao lado do 🔔 o desliga): tão largo quanto a onda e no mesmo tempo, cerca de um terço da altura da janela, com o cartão da seção acima; dentro, as seções, o centroide espectral como uma linha magenta (onde fica o peso do som: o brilho), o RMS numa faixa embaixo com a média do próprio take tracejada, o cursor de reprodução; sob o ponteiro o tempo, o espectro daquele momento ao lado da linha com a frequência mais forte e a nota, e no alto da imagem a frequência ali, a nota e o nível. *Log* ou *Linear* no cabeçalho; um clique vai para lá como na onda; o ponteiro fora ou Esc o recolhe. O take é medido uma vez, pelo laboratório, como para o seu Espectro.
- **Duas linhas ou uma**: o player mantém a onda acima dos controles onde as canções são ouvidas e comparadas (o Criador, o Lapidador, o Bibliotecário) e fica numa linha só no Escritor, no Pintor, no Treinador e no Motor, e no Criador enquanto um quadro está destacado ou a letra está acima de tudo. Depois de recarregar (F5) ele volta com o take e a posição. No Pintor, os Takes começam recolhidos e o log do servidor fica à esquerda.
- **As placas ao vivo**: em Motor → GPUs cada placa tem uma linha própria embaixo, a carga e a memória numa barra por segundo durante dois minutos, com a temperatura e a potência; o log do servidor, aberto, mostra ao lado as placas que têm um papel, cada uma encabeçada pelo papel, a placa do estúdio emoldurada.
- **A linha até o estúdio** aparece ao lado do log do servidor (*Forge · 85 ms*, ou *aqui* na mesma máquina). Quando o estúdio está longe, uma curtida, um favorito ou um alfinete aparece na hora e o estúdio só confirma.
- **Takes** à direita: busca por palavras, `*` e `?`; *Favoritos*; recolha a coluna com »; ⋯ para as ações da própria lista.
- **O log do servidor** fica logo acima do player em todas as salas: recolhido, mostra a última coisa que o motor disse (em vermelho quando algo falhou); aberto, dez linhas, *Acompanhar*, *Copiar* e o caminho para o log inteiro no Motor. Com um quadro destacado sobre a sala, ele fica à esquerda, fora dos botões do quadro. A seta na borda interna o leva para o outro lado da página, e cada sala guarda o seu lado (o do Pintor é a esquerda). A borda externa o alarga ao arrastar, até 1200 px (guardado; um clique duplo devolve a largura original); com as placas ao lado, ele tem 920 px de largura, a coluna delas 390. O quadro tem duas vistas, **Servidor** e **Pintor** (o log do próprio Pintor: o que foi pedido, o que o laboratório respondeu, o caminho de cada execução até o fim), e cada sala abre a sua; **⧉** abre o log numa janela própria, acima de todas as janelas no Chrome ou para levar a outro monitor.

![O log do servidor, aberto](guide/log-dock.png)

## Criador <!-- #creator -->

### Compor: o formulário da canção <!-- #compose-the-song-form -->

![Título, tom, sementes e estilo](guide/compose-top.png)

- **Começar de uma ideia**: uma linha sobre a canção; o modelo de chat do Escritor redige o título, o estilo e a letra (*Escrever o brief*).
- **Título**, **Tom**: o tom vai para a partitura (`K:`). Com uma partitura no formulário, um tom novo a transpõe para ele; sem partitura, a escolha espera e transpõe a que vier.
- **Semente musical** e **Semente sonora**: os dados das duas metades. Vazio é aleatório; um número repete um take. Mantenha a semente musical e mude a sonora para ouvir a mesma canção renderizada de outro jeito. Elas vêm primeiro em *Amostragem e remoção de ruído*. Ao lado de cada uma, o **modo**: *Aleatória (−1)* uma semente nova a cada execução (o campo vazio), *Aleatória, fixa* uma aleatória posta e mantida, *Fixa* a que está escrita, *Próximo* e *Anterior* a movem depois de cada Gerar além das sementes já usadas (as versões para a música, as variações para o som). A semente do Pintor tem os mesmos modos.
- **Estilo**: idioma, gênero, voz, instrumentos, andamento. *Salvar estilo…* o guarda com um nome. **♂** e **♀** no cabeçalho põem *male vocals* ou *female vocals* nele (no lugar da palavra do outro gênero, senão antes do BPM); o aceso tira a sua tag.

### A cola de instrumentos ♪ <!-- #the-instruments-cheat-sheet -->

O ♪ ao lado do estilo abre uma tabela de 200 instrumentos que o estúdio sondou: a família, a origem, como soam (em inglês e russo) e as palavras que os chamam. ▶ A e ▶ B tocam duas sondas de 60 segundos de cada um. O veredito de cada linha vem de um ouvido humano: ouvido, duvidoso, ou **NOT IDENTIFIED IN YUE2** (o YuE2 não o conhece; precisa de um prompt mais elaborado). Um clique copia o nome e pergunta para onde vai: no fim do estilo numa linha própria, ou no lugar dele; um nome que o estilo já tem fica marcado na tabela, e o texto da tabela pode ser selecionado e copiado.

**O YuE2 decide quando um instrumento entra.** Uma linha de estilo é um pedido, não uma ordem: por mais que você peça, o modelo põe um instrumento onde o treino dele diz que a canção o quer, e a semente decide muito. O mesmo prompt deu um take com o instrumento e um sem. Ouça várias sementes antes de julgar um instrumento.

**Ouvido, mas não tão real quanto ao vivo.** Muitos instrumentos tocam, mas menos claros e menos fiéis que o original: é o que o YuE2 sabe deles. Os veredictos dizem se o YuE2 toca um instrumento, não quão real ele soa. Torná-lo real é trabalho de uma **LoRA de instrumento**: algumas dezenas de gravações limpas dele, treinadas no Treinador LoRA.

![A cola de instrumentos](guide/instruments.png)

### Letra e perfis de texto <!-- #lyrics-and-text-profiles -->

- Tags de seção em linhas próprias; o YuE2 conhece `[Intro]`, `[Verse]`, `[Pre-Chorus]`, `[Chorus]`, `[Bridge]`, `[Interlude]`, `[Outro]`.
- **Perfil de texto**: cole um texto inteiro, escolha um perfil, *Aplicar*: as regras dele (limpeza, fonética) e a forma (`[Intro]`, `[Verse]` nas linhas em branco, `[Interlude]` depois de parágrafos longos) deixam o texto pronto para ler. *Desfazer* traz o texto de volta. Os perfis são feitos no Escritor.

### A métrica da letra e a mão fonética <!-- #the-lyrics-meter-and-the-phonetic-hand -->

- **A métrica** ao lado da letra: as sílabas de cada verso como uma barra contra a régua do seu grupo — estrofe e ponte um grupo, o pré-refrão o seu, o refrão o seu, qualquer outra seção a sua. Uma pausa, um break, um silêncio, um interlúdio, um prelúdio ou uma indicação instrumental dentro de uma seção cantada não abre grupo: o nome dela fica apagado ao lado e a régua da seção segue. Tags nunca contam: uma linha só de tags (`[Break] [Silence]`) não conta nada, uma tag dentro de um verso fica de fora. A régua fica no comprimento usual do grupo; a uma sílaba de distância a barra é verde, a duas ou três âmbar, além disso vermelha. O que está entre parênteses é desenhado hachurado depois da barra: o YuE2 pode cantá-lo. Sob a caixa: os caracteres, sílabas e versos da letra, as tags de seção, os parênteses e a mão fonética; a correção ortográfica do navegador no idioma da letra (desligada ali); uma caixa esticada à mão mantém a altura até *Altura automática*.
- **Números de linha e marcas**: a caixa da letra numera as linhas como um editor de código (uma linha quebrada uma vez, na primeira fileira; *Números de linha* sob a caixa os desliga). **Alt+K** marca a linha do cursor ou a desmarca, **Alt+J** vai à próxima marca, **Alt+Shift+J** à anterior, **Alt+Shift+K** as limpa; o número de uma linha marcada fica âmbar, e as marcas seguem as linhas quando você escreve acima delas. Cada [tag] fica sob uma fina camada âmbar. A letra do Escritor tem o mesmo. Como no mcedit: **Alt+O** também limpa as marcas, **Alt+L** vai a uma linha pelo número, **Ctrl+Y** apaga a linha, **Alt+↑** e **Alt+↓** movem a linha (ou as linhas selecionadas) com a marca. *Teclas* sob a caixa lista todas, e o rótulo LETRA do Escritor as diz ao passar o ponteiro. **⤢** ao lado de Letra põe a caixa acima de tudo, 60 % da largura da tela e quatro décimos maior, com tudo isso, e os próprios −, + e ⟲ para o tamanho do texto (guardados neste navegador); Esc a devolve. Ao lado do **⤢**, dois botões guardam a letra como texto simples: o primeiro a salva como `.txt` com o nome do Título, o segundo põe um `.txt` (UTF-8) no lugar dela (pergunta antes quando a caixa tem palavras, e **Ctrl+Z** na caixa as traz de volta; um Título vazio recebe o nome do arquivo).
- **Colchetes conferidos**: um «[» não fechado na linha, um «]» sem abertura, um «[» dentro de uma tag e uma tag vazia numeram a linha em vermelho, e *Tags não fechadas ou perdidas* sob a caixa vai de uma à próxima; um parêntese deixado aberto ou fechado sem abertura fica âmbar (um eco pode continuar). Um «[» ainda sendo digitado fica em paz até o cursor sair da linha. **Gerar pergunta antes** quando uma tag está quebrada: o que vem depois de um «[» não fechado pode se perder na canção e o final pode dar errado; *Ir à linha*, ou *Gerar como está*.
- **Acentos fora do lugar**: uma marca fora de uma vogal — no início da linha, depois de um espaço ou sinal, numa consoante, uma segunda na mesma letra, ou um ´ com espaçamento no lugar dela — mostra um botão vermelho sob a caixa (*Acentos tônicos fora de uma vogal*) e uma marca antes da contagem da linha; o botão seleciona cada um por vez. Uma palavra com duas marcas recebe uma âmbar: de propósito, ou um deslize? Na contagem um acento não é sílaba; ע e uma vogal latina dentro de uma palavra russa são. Uma sílaba é um som vocálico, uma nota, contada pelas regras de cada idioma: uma letra vogal em russo, ucraniano e bielorrusso (e como a métrica mede o tempo que um verso leva, uma palavra sem vogal — с, в, к, з, й, ў — e uma oclusiva fechada contra uma africada dentro de uma palavra — глу-п-цо́в — levam um tempo próprio, desenhado mais claro: «Я же вижу глупцо́в с приду́рческим планом» tem 12 sílabas e 2 desses tempos, 14); em grego αι, ει, οι, ου, αυ, ευ são uma (um trema ou o acento as separa: τσά-ι); em espanhol e italiano um i ou u fraco se junta à vizinha (cie-lo, cuo-re), duas vogais fortes são duas (po-e-ta); em inglês um e final mudo não conta (make, mas ta-ble); o hebraico conta os sinais vocálicos; chinês, japonês e coreano um sinal cada. Palavras latinas contam como inglês, espanhol ou italiano: pela palavra do estilo para o idioma, senão pelas palavrinhas da própria letra.
- **Ctrl+F** na letra ou no estilo (e nas caixas do Escritor) busca só naquela caixa: Enter e Shift+Enter percorrem as ocorrências, Esc no campo de busca devolve o cursor com a ocorrência selecionada; a partir da própria caixa (clicada em outro ponto) fecha a barra e deixa o cursor onde está, e palavras digitadas ali enquanto isso não movem a vista. Um acento não é procurado, ё vale е, e о e а acham também ע e o o e a latinos. **F4** ou **Ctrl+H** abre uma segunda linha para substituir: **Enter** põe as palavras novas no lugar da ocorrência em mãos e segue para a próxima, **Ctrl+Enter** (ou *Tudo*) substitui todas de uma vez, e um **Ctrl+Z** na caixa desfaz; **Aa** (**Alt+C**) só acha como a caixa foi digitada.
- **Tags sob um «[»**: um «[» digitado no início de uma linha na letra (do Criador ou do Escritor) abre as tags de seção, como um editor de código oferece suas palavras, na ordem em que uma canção passa por elas, de Intro a End. Letras digitadas depois estreitam a lista (num teclado russo ou ucraniano também), um número numera a tag (`v2` é `[Verse 2]`), e letras que numeram as estrofes recebem a próxima. ↑ ↓ escolhem, Enter ou Tab põe a tag numa linha própria (Ctrl+Z a tira), Esc ou `]` fecha a lista. Intro, Outro e End já na letra ficam no lugar, apagados, com a linha: ↑ ↓ chegam a eles e leem o que são, mas não são postos duas vezes. Ctrl+Espaço abre a lista, e no início de uma linha digita o próprio «[». A lista fica em duas colunas: as tags, e ao lado o que é a da vez (nas nossas palavras, segundo o guia de seções de canção do Genius) e quantas vezes os 110 exemplos oficiais a escrevem; a caixa mantém o tamanho quando a lista estreita. Seções que nenhum escreve são marcadas TEST. **Uma segunda e uma terceira tag** numa linha: um «[» digitado logo depois da tag de uma linha ganha o espaço sozinho e oferece as tags que não são seção (quem canta, como os exemplos escrevem; Female Vocals, Break e Silence marcadas TEST); Enter a põe na mesma linha, com um «…» dentro selecionado para as suas palavras; Ctrl+Espaço digita « [» ali também.
- **A mão fonética** (a do Viktor, vinda do SUNO; o YuE2 também a segue):
  - **Um acento tônico** (o agudo combinante, U+0301) depois de uma vogal: `обе́щано`, `сули́т`. Vale em mais de 95 % dos versos.
  - **Uma vogal tônica maiúscula** empurra o acento para onde a rima quer, contra o dicionário: `базилиО́`.
  - **ע (ayin) dentro de uma palavra russa** é cantado como um о/а suave, como a fala viva diz um о átono: `кעмо́рка`, `пעле́но`, `Ка́рлע`. Também freia o rap que corre cada vez mais.
  - **Um o latino dentro de uma palavra russa** canta um o duro e aberto onde o modelo diria а: `Кo дну`.
  - **Uma vogal esticada** (`о-о-о`, `БУ… РА… ТИ… НО`) sustenta uma nota; onde a música tem espaço para ela, não em todo verso.
  - **[Interlude]** entre partes faz uma pausa no rap e desacelera a fala que não para de acelerar (nem sempre).
  - **Parênteses** podem ser cantados (os primeiros takes de Buratino os cantaram): um eco, uma linha de apoio; uma rubrica entre parênteses também pode sair.
  - **Uma palavra hebraica com seus sinais vocálicos** (`רוּחַ`) o modelo diz melhor do que em transliteração.

### VAE, sliders e LoRAs <!-- #vae-sliders-and-loras -->

- O **VAE** transforma a canção escrita em som: **Padrão** (o melhor som), **Antigo** (o dos benchmarks), **Mistura** (uma mistura dos dois, um complemento). Um take pronto pode ganhar outra decodificação depois, na própria página. Ele é escolhido no menu **☰**, sob o modelo, para as próximas canções; um take decodifica de novo com outro a partir do seu cartão em segundos (desde a rc2 cada take guarda os latentes; um feito antes renderiza o som de novo).
- **Sliders**: moldadores de gênero e de voz aplicados enquanto a música é escrita; 0 é desligado, 1 é cheio.
- **LoRAs**: adaptadores para a metade música, a metade som, ou as duas, cada um com a sua força.

**A curva de um slider.** Um slider empurra com a sua força do primeiro ao último segundo: plano. A pequena imagem ao lado da força abre a curva: **Arco** o faz subir à força total no meio da canção e aliviar nas duas pontas; **Desenhar** a molda à mão: arraste um ponto para cima para um realce, para baixo para um sumiço, ao longo da canção para movê-lo; clique duplo para acrescentar um ponto, clique duplo num ponto para tirá-lo. A força que você ajusta é o topo da curva. A curva corre sobre a música enquanto ela é escrita, do primeiro quadro até o fim da duração da canção, e vai no pedido do take, então um take refeito segue a mesma curva.

![LoRAs: cada força numa estrada do verde ao vermelho, e a metade música no total](guide/loras.png)

Cada força fica numa **estrada**: verde é seguro, amarelo é o limite, vermelho passou dele. Os limites são medidos:

- um adaptador de partitura (um que planeja ABC) até 1.0 em verde; qualquer outra metade música até 0.5 em verde, 0.75 no máximo; adaptadores treinados neste estúdio são mais rígidos na metade música (0.5 verde, 0.6 limite);
- a metade som até 1.0 em verde, 1.5 de limite;
- **Música, no total**: adaptadores empilhados se somam. Cada um pode estar no seu verde e a soma ainda quebrar a partitura. Medido em takes reais: inteira até **2.25** no total, quebrada a partir de **2.5**. A barra sob os adaptadores mostra a soma na mesma estrada.

**Clique duplo** num número para digitar uma força exata. As dicas sob o bloco dizem o que importa: uma palavra-gatilho ausente do estilo, um adaptador treinado em outro modo de planejamento, uma força além do limite. Enquanto o ponteiro está num slider ou o arrasta, a força exata fica acima do ponteiro na cor da sua estrada. O adaptador Instrumental para em 1.0, onde começa: além disso, as partituras dele se perdem.

> **Um adaptador de partitura instrumental com palavras para cantar.** Um adaptador assim planeja partituras *sem linha vocal*. Em 1.00 ele deu um take com uma nota só em 127 compassos vocais: o cantor falou sobre dois compassos em loop. Com letra, mantenha-o baixo, 0.3 a 0.5. O ⚠ ao lado do nome das LoRAs avisa quando isso acontece.

### Perfis e modos de planejamento <!-- #profiles-and-planning-modes -->

- **Perfil** ajusta de uma vez o modo, a duração, a amostragem, a orientação, os passos, o VAE, os sliders, as LoRAs e a saída; os textos e as sementes ficam. *Salvar perfil…* guarda os ajustes atuais com um nome.
- **Modo de planejamento**:
  - **Plano completo**, o padrão: melodia e acordes escritos primeiro (uma partitura editável), depois a canção. O melhor para canções novas.
  - **Só a melodia**: um plano de melodia, acompanhamento livre. Recomendado para covers.
  - **Direto**: direto da letra e do estilo, sem partitura. Adaptadores treinados sem partitura ficam aqui.
  - **Instrumental**: sem vocal, a receita oficial do YuE2. Fica à direita do cabeçalho do modo de planejamento.
- **Completo ou Direto.** A palavra do Viktor depois de uma semana de canções: o Direto é o acerta-erra do SUNO (cerca de dois takes bons em cem, pela conta dele); o Completo é o caminho para todos, mesmo sem ler uma nota de ABC: as tags são respeitadas, o som assenta, a dicção segura e o andamento se prevê. Medido no rap dele, catorze takes de cada com o Whisper ouvindo: o melhor take de todos foi um Completo com a receita conservadora dele (84 % das palavras ouvidas, 76 % no último quarto). Onde o Completo falha, falha no fim: um take dura o mesmo que a sua partitura, e o plano pode ter menos seções que o texto (aí os últimos versos ficam de fora, ou um anterior é cantado de novo); depois das últimas palavras, os compassos que sobram da partitura continuam tocando, e esses são os 10–15 s depois do fade certo de uma canção, não a orientação. Ouça o fim de um take Completo: *Terminar em…* corta uma cauda, *Regenerar a partir de…* reescreve um fim perdido.

### Covers, remixes e a sua própria partitura <!-- #covers-remixes-and-your-own-score -->

- **Cover ou remix**: pegue a melodia de uma gravação (*Transcrever*: só a melodia, não as palavras nem o cantor), ou a melodia de um dos seus takes, e dê a ela um estilo novo.
- **Trazer sua própria partitura**: uma partitura ABC, seguida no Plano completo e no Só a melodia. Transponha (para o mais perto, para cima ou para baixo), mova uma voz por graus da escala, importe um arquivo MIDI (uma linha melódica por voz), exporte MIDI ou marcadores para uma DAW, carregue um exemplo, torne-a instrumental. **Gerar** com uma partitura aqui pergunta antes: nesta partitura, ou numa nova (o campo esvaziado, o modelo de canções escreve uma). A partitura lembra os adaptadores e as forças musicais com que foi escrita (um plano, a partitura de um take); quando os ligados agora diferem, uma linha embaixo avisa, e a pergunta também: com outras forças a música pode se afastar da partitura, o Industrial Rock e os instrumentais mais que tudo. No Completo a partitura fica aberta enquanto tem uma.
- **Recitar a letra numa partitura** (*Pôr a letra nesta partitura…*, sob a partitura assim que ela é lida): o narrador do promo do estúdio, para as suas palavras. Cada verso vai nos compassos da partitura, uma sílaba por colcheia (uma semicolcheia, como se diz o rap, onde colcheias deixariam versos de fora) numa nota do acorde do seu compasso, um respiro depois de vírgula e ponto, a última sílaba do verso uma semínima mais grave; cada seção começa numa frase de dois compassos depois de um compasso de pausa, ou depois de um vocalise quando você marca. Os instrumentos, acordes, tom e andamento ficam; as seções da partitura seguem as suas tags, com uma intro e uma outro em volta. Para palavra falada, leituras e rap sobre uma base: faça a base, *Escrevê-la a partir do som*, depois isto; pergunta antes, e Ctrl+Z em cada caixa traz o texto antigo de volta.

### Amostragem e remoção de ruído <!-- #sampling-and-denoising -->

![Amostragem: o planejador de partitura e os tokens musicais, os limites de tokens travados](guide/sampling.png)

Os padrões são ajustados. As três linhas de **forma** (Composição, Interpretação, Estilo) movem os ajustes juntos em cinco degraus; os ajustes em si ficam embaixo.

- **Planejador de partitura** e **Tokens musicais**: temperatura, top-p, top-k, penalidade de repetição, janela de penalidade.
- **Tokens mín.** e **Tokens máx.** ficam **travados** contra uma edição perdida: clique no 🔒 ao lado do nome para mudá-los, e de novo para travá-los. Os pisos são fusíveis: uma partitura não pode terminar antes de 200 tokens, a música não antes de 750 (30 segundos; uma duração pedida menor o baixa para essa duração). O máximo da música aparece como **Duração máx.**, em tempo (25 tokens por segundo), sem trava: é a duração da canção no máximo, ajustada só aqui (Som e saída não tem campo de duração).
- Cada ajuste é mantido dentro de limites sensatos; um valor além deles é puxado de volta, e a página avisa.
- **Orientação (CFG)**: 1.6 por padrão em todos os modos.
- **Som e saída**, a parte de baixo do bloco: **Passos de remoção de ruído** e **Solucionador** para a metade som, **Formato** (WAV 24 bits, 16 bits, 32 bits float ou MP3 com a taxa de bits) e **Corte de picos**; *Redefinir saída* os devolve.

**Uma receita conservadora para o russo** (a do Viktor, de ouvido): Composição *baixo*, Interpretação *baixo*, Influência do estilo *alto*: o planejador de partitura com temperatura 0.85, top-p 0.92, top-k 40, os tokens musicais com 0.85, 0.93, 80, as penalidades de repetição 1.005 e 1.3 numa janela de 100, orientação (CFG) 1.8; 32 passos de remoção de ruído com Midpoint. Sem aceleração, rap num ritmo moderado. É o perfil embutido *Russo · conservador (do Viktor)*.

### Criar partitura ABC, e Gerar <!-- #create-abc-score-and-generate -->

- **Criar partitura ABC** escreve a partitura e para: leia, edite, depois *Gerar* renderiza exatamente essa partitura. Uma partitura que já está no campo é sobrescrita, depois de uma pergunta.
- **Sondas** e **Variações**, ao lado de Gerar: Sondas é quantas sondas, a música escrita de novo em cada uma, uma semente musical cada (semente, semente + 1…); o motor escreve tantas de uma vez quanto o lote permite, o resto em passagens seguintes. Variações é quantas vezes o som de cada sonda é renderizado a partir da sua única música, uma semente sonora cada, a mesma para toda sonda: cada uma custa mais ou menos o tempo de um som, quase nada de memória. Saem Sondas × Variações takes: 2 × 4 = 8.
- **Gerar canção** roda tudo. A execução mostra as etapas conforme andam.

### Babel na partitura <!-- #babel-in-the-score -->

![O motor parou uma execução cuja partitura não era partitura](guide/babel.png)

Quando a metade música escreve lixo no lugar de partitura (adaptadores empurrados além dos limites fazem isso: sem tom, sem compasso, dois-pontos em série), o **motor para a execução antes que qualquer música seja feita sobre ela**, em segundos em vez de minutos. A janela diz por quê, quais adaptadores pesaram na metade música e quanto além dos limites, mostra o que foi escrito, e pode trazer as forças musicais para o verde com um clique.

### O take <!-- #the-take -->

![Um take: baixar, fazer de novo, pós-produção, arquivos](guide/take-head.png)

- **O cabeçalho**: ▶ e os botões do take na primeira linha (👍 👎 ☆, o Bibliotecário, renomear, apagar), e no fim ⇆ e ⤡, que destacam um quadro sobre a sala; o título embaixo deles numa linha; como foi feito embaixo dele.
- **Baixar**: WAV, FLAC (as mesmas amostras, cerca de três quartos do tamanho), MP3 na taxa de bits que você escolher.
- **Fazer de novo**: *Refazer* (um take novo a partir do mesmo pedido), *Usar como base* (o pedido de volta ao formulário), *Renderizar o som de novo* (a mesma música, som novo), *Regenerar a partir de…* (manter o começo, escrever o resto de novo), *Transcrever este take*, *Cortar no texto* (cortar uma cauda depois do último verso cantado), *Terminar em…* (o take terminando no momento que você escolhe, os últimos 2 s em fade; a partir dos latentes guardados, em segundos), *Fade de entrada…* (os primeiros segundos subindo do silêncio, 2 s a não ser que diga outro valor; do mesmo jeito).
- **Lapidador**: *Espectro*, *Checagem da letra*. **Arquivos**: o pedido e a partitura. *Loop…*: 1, 2, 4 ou 8 compassos nas barras de compasso da partitura a partir do compasso onde o player está, sem emenda (o fim corre para o início), salvo como WAV com o andamento e o tom no nome.
- **Nota**: o que funciona, o que corrigir, para onde vai.
- O cartão abaixo diz como foi feito: modo, formato, VAE, modelo, passos, a forma, os sliders, as LoRAs com as forças, as duas sementes (copie-as para repetir).
- **Sobre a sala** (⤡) o take fica em duas colunas: o que fazer com ele, o Estilo e a letra à esquerda; como foi feito, o VAE e a partitura à direita. Um take novo abre com o Estilo e a Letra recolhidos; as ferramentas ficam em grupos emoldurados.

![Como um take foi feito](guide/take-info.png)

### A partitura <!-- #the-score -->

O plano do take como pauta ou como ABC: imprima em PDF (US Letter, retrato ou paisagem), exporte MIDI ou marcadores, *Editar e renderizar de novo*, ou abra em tela cheia.

## Escritor <!-- #writer -->

### Canções como documentos <!-- #songs-as-documents -->

![O Escritor](guide/studio-writer.png)

Toda canção pode viver no Escritor como um documento: o **estilo**, a **letra**, as **notas** (Markdown, com prévia) e os **parâmetros** (cada ajuste do formulário do Criador). *Novo*, *Do Criador* (o formulário como está), *Carregar no Criador*.

- **Versões**: *Guardar esta versão* a qualquer momento; *Restaurar esta versão* ou levá-la *Como documento novo*.
- **A largura da lista**: arraste a borda entre a lista e o documento (← → pelo teclado, um clique duplo para a largura original).
- **Takes feitos a partir dele**: todo take cujo pedido veio deste documento.
- **A canção agora**: título, estilo, o tom, o compasso e o andamento da partitura (o estilo precisa concordar com eles), a letra; *Editar no Criador*.
- **Exportar tudo** (o disco) e **Importar** (a pasta): o caderno inteiro num arquivo para backup, cada documento com as versões, os takes feitos a partir dele e a lixeira; uma importação traz o que falta, deixa o igual como está e põe um documento que difere ao lado do homônimo como cópia: nada é sobrescrito.

### Perfis de texto <!-- #text-profiles -->

Como um texto colado fica pronto para ler: regras de substituição em ordem (literais ou expressões regulares), depois a forma (`[Intro]`, `[Verse]` nas linhas em branco, `[Interlude]` depois de parágrafos longos). *+ Regra*, depois **Tente a partir da Letra** mostra o que sai antes de você salvar.

### A sala de escrita <!-- #the-writing-room -->

![A sala de escrita: um modelo de chat redige, você decide](guide/writer-room.png)

Um modelo de chat lê o seu estilo, letra e partitura, depois os redige ou revisa. **Nada muda até você aplicar.**

- **Sobre o que é a canção?** ou o que mudar; **Me ajude com** o estilo, a letra ou os dois; **Estrutura**: a ordem das seções para uma letra nova.
- O modelo: um servidor de chat local (vLLM, LM Studio, Ollama: qualquer coisa com um endpoint de chat `/v1`, ajustado no Motor) ou qualquer modelo do OpenRouter com a chave de API. O campo oferece a lista toda do OpenRouter enquanto você digita, cada modelo com o preço por milhão de tokens de entrada e saída e o contexto; o preço do escolhido fica sob o campo, e um nome que a lista não conhece é avisado.
- *Criar um rascunho*, depois **Aplicar rascunho**, **Usar a letra** ou **Usar o estilo**; *Desfazer* volta atrás.

## Lapidador <!-- #refiner -->

### Depois da renderização <!-- #after-the-render -->

![O Lapidador: o take à direita, as etapas em fila](guide/studio-post.png)

Escolha um take à direita; as ferramentas trabalham nele, ou num stem dele. A coluna da direita traz **os takes lapidados aqui**, o lapidado mais recente primeiro (*Lapidados* ao lado de *Favoritos* a troca para todos os takes, para começar um novo), e depois de recarregar a sala volta ao take que estava lapidando.

Tudo o que é feito a partir de um take fica pendurado na sua **árvore** (*Feito a partir deste take*), o mais novo em cima: **o original** primeiro, com o player e o FLAC, depois cada ramo, tocável e utilizável como fonte para a próxima etapa. O que roda aparece onde você olha: no cabeçalho da sala, no topo do bloco da própria etapa e como um ponto pulsando na aba dela. O bloco de cada etapa lista o que ela fez para o take (*Feito aqui*: um clique o encontra na árvore), e a etapa aberta acende os próprios ramos.

**Comparar tudo** (na linha do original, ou *Comparar* em qualquer ramo) abre cada versão num só player, como o SUNO troca de versão: o original, o sem zumbido, as remasterizações, os upscales, os stems. Um clique em outra versão, ou o número dela (1–9), a toca **a partir do mesmo segundo**; Espaço toca e pausa, ← → movem cinco segundos, Esc fecha. A mesma música em outros takes também entra, depois do original: as re-renderizações com outro VAE ou outra semente sonora, cada uma com o nome do VAE, da semente e de quando foi feita; um take que você não curtiu fica de fora.

### Importar uma faixa <!-- #import-a-track -->

WAV, FLAC, MP3… de qualquer lugar: vira um take na biblioteca (48 kHz, 24 bits), marcado *importado*, pronto para stems, remasterização e o resto. A letra é opcional; a checagem da letra compara com ela.

### As etapas e a cadeia <!-- #the-steps-and-the-chain -->

![A cadeia e as etapas](guide/post-steps.png)

A **cadeia** roda várias etapas de uma vez: *Antizumbido → Upscale → Stems → Remasterizar → Upscale*, depois qualquer uma de *Artefatos*, *Espectro*, *Letra*. Os stems são separados do take sem zumbido (e ampliado) e a remasterização os mixa, então o preset e o de-esser dela trabalham na cadeia também; o primeiro upscale deixa os separadores ouvirem a canção inteira, o último redesenha o topo que os stems e a remasterização deixam (um chiado acima de 20 kHz, quase nada acima de 22). Os stems são quatro, a não ser que você escolha outra coisa. Uma a uma:

1. **Espectro**: espectrograma, espectro médio, energia por banda; ponha outro take por cima para comparar.
2. **Artefatos**: um tom que não vai embora, o zumbido de 25 quadros do VAE nos agudos, cliques, clipping, falhas, um estéreo que briga consigo mesmo. Um tempo toca a partir dali.
3. **Antizumbido**: o decodificador do YuE2 escreve o som em quadros de 1920 amostras, 25 por segundo, e os agudos tremem com eles. Isto tira a parte presa a esse relógio de quadros acima de 2 kHz. 80 % é a escolha do ouvido; 100 % afina o ataque.
4. **Letra**: o Whisper ouve e compara o que ouve com a sua letra, minuto a minuto; *Sincronizar as linhas* para a temporização de karaokê. No stem vocal ele ouve as palavras sem a música.
5. **Stems**: quatro stems (BS-Roformer para a voz, depois htdemucs_ft para bateria, baixo e o resto; o instrumental também), ou vocal + instrumental. *Fonte* é o take ou um arquivo dele sem zumbido ou ampliado, cada fonte com o seu conjunto; a sua DAW recebe o conjunto mais novo de cada tipo.
6. **Remasterizar**: mixe os stems ou pegue o take; limpar, de-esser, opcionalmente reafinar 440 → 432 Hz, loudness (LUFS) e true peak. Cada execução é um ramo novo. O preset e o de-esser trabalham nos stems antes da mixagem: com o take ou qualquer arquivo único como fonte ficam desligados, e na cadeia trabalham quando ela separa stems.
7. **Upscale**: o UniverSR redesenha o topo do espectro; o original fica amostra por amostra abaixo do corte. Numa remasterização (a última etapa da cadeia) o arquivo inteiro é baixado se o novo topo passar do teto de true-peak da remasterização.

## Pintor <!-- #artist -->

A sala que pinta: uma capa para cada take, um 16:9 para o vídeo, um 9:16 para um short, a partir das suas palavras, de uma imagem sua, ou dos dois. O formulário à esquerda, o palco no meio, a biblioteca à direita.

### Imagens para as suas canções <!-- #pictures-for-your-songs -->

Escreva o que você vê para a canção, em frases: o Krea 2 Muse e o Qwen-Image leem um prompt como uma descrição, não como uma lista de tags. Ponha primeiro o que está na imagem, depois a luz, as cores e a técnica (óleo, tinta, uma fotografia), e termine com *no text* quando não quiser letras nela. **Do take** põe no prompt aquele de onde o take em mãos ganhou a arte, ou um feito do título e do estilo dele, para começar.

**Formatos**: **1:1** (1280 × 1280) para a capa, **16:9** (1920 × 1080) para um vídeo, **9:16** (1080 × 1920) para um short. Os formatos de um mesmo clique compartilham a semente, então saem como uma série: a mesma cena nas mesmas cores, cada uma composta para o próprio quadro em vez de uma imagem cortada de três jeitos. **Variações** desenha também as sementes seguintes (a semente, a semente + 1, …), cada uma em todos os formatos.

**Semente**, com o modo ao lado: **Aleatória** (−1: uma semente nova a cada clique, o campo vazio), **Aleatória, fixa** (uma semente aleatória posta na hora e mantida), **Fixa** (a que está escrita), **Próximo** e **Anterior** (depois de um clique, o campo passa das sementes que as variações usaram). Um número digitado no campo é essa semente (Aleatória vira Fixa); um campo esvaziado é uma semente nova a cada clique (Fixa vira Aleatória); ⟲ volta a Aleatória. A semente de uma imagem de que você gostou a desenha de novo: cada execução mostra a sua semente, e **Para o formulário** a traz de volta com o prompt.

**Três colunas**: o prompt e os ajustes à esquerda, o palco no meio (a execução sendo pintada se revela ali, o progresso atravessando o topo; senão a imagem que você escolheu, os botões embaixo, os dados e o prompt da execução numa dica ao lado, sobre a biblioteca, enquanto o ponteiro está na imagem), a biblioteca à direita; arraste as bordas entre elas para alargar uma coluna (← → pelo teclado, um clique duplo para a largura original). As escolhas da coluna se esticam com ela, nunca mais estreitas que os nomes dos pintores. A partir de uma janela de 920 px de altura a sala cabe inteira nela: a página fica parada, o formulário e a biblioteca rolam cada um por si, e a linha de Desenhar fica no pé do formulário.

**Prévia ao vivo** (ligada por padrão): o lugar da imagem sendo pintada mostra cada passo dela, do ruído à imagem, a um oitavo do tamanho e vista sem o decodificador, então não custa nada; desligada, o lugar espera a imagem pronta. Uma barra atravessando o topo do palco acompanha a execução, imagem a imagem e passo a passo.

**Duas execuções por vez**: enquanto uma roda, **Desenhar** pede a próxima, que espera atrás dela (Ctrl+Enter também); **Parar**, ao lado de Desenhar enquanto uma execução roda, encerra a que está desenhando (senão a que espera sai da fila); as imagens que ela terminou ficam.

### Os pintores <!-- #the-painters -->

**Krea 2 Muse** by Stable Yogi, um fine-tune do Krea 2 Turbo (Krea 2 Community License): **Q4** numa placa com 12,5 GB livres, **Q8** (mais fino) com 18,5 GB. Modelo Turbo, pinta nos seus poucos passos sem orientação: cerca de 35 s por imagem em 1:1 e 47 s em 16:9 ou 9:16 numa RTX 3090, e carregá-lo cerca de 25 s a mais por clique.

**Qwen-Image 2512** (Apache-2.0) de um GGUF em **Q4** (uma placa de 15,5 GB) ou **Q6** (20 GB), ou um **fine-tune fp8** dele (22,5 GB: os arquivos únicos do ComfyUI postos em `artwork/Qwen-Image-2512/checkpoints/`, escolhidos sob o pintor); cerca de meio minuto por imagem com Lightning, depois de um ou dois minutos carregando. O **Qwen-Image 2.1**, sob a licença de pesquisa da Qwen (só pesquisa e avaliação: não para uma capa que você vende), pinta a partir de palavras e edita uma imagem de referência pelas palavras do prompt; uma máscara e *Pintar em volta* pedem o Krea 2 ou o Qwen-Image 2512. Numa placa que não comporta inteiro nem o codificador de texto nem o pintor (uma placa de 16 GB, ou uma placa sob um limite de VRAM menor), os dois correm da RAM: sob um limite de 15.5 GB numa 3090, 135 s a partir de palavras com 4.1 GB no pico, 129 s editando com 7.9 GB.

Cada pintor só aparece quando os arquivos dele estão aqui; os outros são citados sob o pintor. **Motor → Modelos e LoRAs → Pintores Qwen** baixa o Qwen-Image 2512 em Q4 (31 GB) ou Q6 (34,5 GB) com Lightning, e o Qwen-Image 2.1 (33,1 GB), cada um perguntado antes com o tamanho (o 2.1 com a licença também). Num terminal: `heresy/fetch-heresy.sh --qwen 2512-q4`. **Baixar pintores e adaptadores…** sob o pintor lista na própria sala o que o estúdio pode baixar para o Pintor: o Krea 2 Muse, os pintores Qwen, quatro fine-tunes fp8 do Qwen-Image 2512 (Jib Mix Qwen, IntoRealism Qwen, Real-Qwen-Image e o próprio 2512, 20,4 GB cada, compartilhados no repositório de modelos do estúdio com a permissão dos autores) e sete adaptadores, cada um com o tamanho, aqui ou **Baixar**.

**Qual placa pinta**: um clique espera na fila do laboratório por uma placa com espaço, como fazem a arte dos takes e os stems; enquanto espera, **Fora da fila** o tira. Uma placa que nada mais usa aceita uma execução cuja necessidade cabe na memória dela menos 512 MiB (a parte própria do runtime CUDA); uma placa em uso a aceita quando a memória livre dela comporta a necessidade. Um pintor Qwen-Image 2512 ou Krea 2 Muse que nenhuma placa daqui comporta inteiro transmite os blocos da RAM: os blocos que cabem ficam na placa, o resto vem conforme é preciso, e a imagem é a mesma, mais lenta pelo que o barramento não consegue esconder (com quatro adaptadores numa placa de 24 GB, cerca de um sexto; com todos os blocos transmitidos, o Q4 ocupa 2,2 GB da placa, então uma placa de 8 GB o pinta); outro pintor que nenhuma placa comporta é recusado na hora, com os números e o pintor que caberia. O Qwen-Image lê o prompt com o codificador de texto (Qwen2.5-VL-7B, 15,5 GB) na placa quando o espaço livre lá comporta, senão no processador, antes de o pintor chegar: a imagem é a mesma de qualquer jeito.

**O filtro de conteúdo**: toda imagem passa pelo filtro que a licença do Krea 2 pede, seja qual for o pintor (a regra do estúdio para todo pintor): uma imagem sinalizada não é guardada, e a execução avisa.

### Lightning <!-- #lightning -->

**O que é**: o Lightning (lightx2v, Apache-2.0) é um adaptador que ensina o Qwen-Image 2512 a pintar em poucos passos sem orientação: o longo caminho guiado do próprio modelo destilado em 8 passos. O arquivo dele fica em `artwork/Qwen-Image-2512/lightning/` (`Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors`, 0,85 GB) e vem com o download dos pintores Qwen.

**Como o estúdio o aplica**: com o Lightning ligado, o pintor o carrega como mais um adaptador sob as suas LoRAs, na força dele: **1.0** para os GGUF Q4 e Q6 (a base de onde foi destilado, nos 8 passos que os autores indicam) e **0.55** para um fine-tune fp8, em 12 passos (um fine-tune se afastou da base, e o Lightning em força total o puxaria de volta; o próprio ajuste do Viktor no ComfyUI). O agendamento vira o do Lightning: um deslocamento de log 3 em qualquer tamanho, como foi treinado. A orientação fica desligada (true CFG 1): uma passada do modelo por passo.

**Desligado**, o pintor segue o caminho próprio do 2512: 30 passos por padrão (10 a 60) e **orientação** 4 (true CFG com o negativo vazio: duas passadas por passo). Sessenta passadas contra oito: a pintura em si leva umas sete vezes mais, o carregamento o mesmo, e dá o detalhe e a luz de um realismo acabado.

**Os padrões dele**: os GGUF Q4 e Q6 pintam com ele (rascunhos, placas menores); um fine-tune fp8 pinta sem, a não ser que você o ligue (realismo acabado); a arte própria de um take é pintada com ele (*Motor → Arte*). A regra por trás: Lightning para rascunhos e capas, não para realismo profissional.

**O interruptor**: em Amostragem, com a força ao lado; ligado, os passos vão de 4 a 16 e Orientação some; desligado, Orientação aparece. Sem o arquivo dele não há interruptor, e o 2512 pinta do seu jeito. O Krea 2 Muse não tem: modelo Turbo, os poucos passos são dele. A força é guardada para cada pintor; a soma dos seus adaptadores (*Juntos*, abaixo) não conta o Lightning.

**Quanto custa**: numa RTX 3090 em 1328 × 1328, o Qwen-Image 2512 com Lightning pinta em cerca de 30 s por imagem em Q4 (14,3 GB no pico) e 32 s em Q6 (17,6 GB); um fine-tune fp8 a 0.55 e 12 passos em 37 s (21,0 GB). A capa de um take com Lightning levou cerca de um minuto e meio com o carregamento e o prompt.

### Samplers e agendamentos <!-- #samplers-and-schedules -->

**Amostragem** sob o pintor, recolhida, com os valores no resumo: os passos, o sampler e o agendamento, guardados para cada pintor; **Redefinir** devolve os do pintor. Os passos: Krea 2, e Qwen-Image 2512 com Lightning, de 4 a 16; senão de 10 a 60; um número fora da faixa fica na borda. A estimativa de tempo do formulário conta as passadas do sampler.

**Os samplers**: a cada passo o modelo diz para que lado a imagem está; o sampler decide como andar até lá.

- **Euler**: uma passada por passo, o passo simples; a referência, e aquele com que o Lightning foi destilado.
- **Euler SDE**: Euler com um pouco de ruído novo a cada passo: mais grão, um pouco menos fiel.
- **ER-SDE**: um solver estocástico de terceira ordem (ER-SDE-Solver-3), uma passada por passo, os dois passos anteriores guardados: mais fino que o Euler no mesmo tempo.
- **RES 2s** e **RES 3s**: os métodos de passo único do solver exponencial refinado, duas e três passadas por passo, metade do ruído devolvido depois de cada; os gêmeos **ODE** não devolvem nada, então uma semente pinta uma imagem, a mais próxima do caminho exato.
- **Heun++** (heunpp2): três passadas por passo quando pode, duas, depois uma no fim.
- **Heun exponencial** (exp_heun_2_x0, e o seu SDE): um método exponencial de segunda ordem, duas passadas por passo; o SDE devolve o ruído.

Um sampler de duas ou três passadas por passo custa duas ou três vezes o tempo do Euler nos mesmos passos; nos 8 passos do Lightning as ordens mais altas mudam o detalhe, não a composição. Contra o caminho exato de um fluxo de brinquedo em 8 passos, eles se ordenam como as ordens dizem: Euler 0.138, Heun++ 0.111, Heun exponencial 0.084, RES 2s 0.058, RES 3s 0.046 (o erro: menor é mais perto).

**Os agendamentos** dizem onde os passos são gastos, de todo ruído a nenhum:

- **Simple**: por igual no tempo próprio do pintor, com o deslocamento dele.
- **Karras** e **Exponential**: mais passos com pouco ruído, para o detalhe.
- **Beta** e **Beta 57**: densos nas duas pontas, esparsos no meio (Beta 57 com 0.5 e 0.7).
- **KL optimal**: o espaçamento que o Align Your Steps achou ótimo.
- **SGM uniform**: uniforme no tempo, o último passo descartado.
- **Bong tangent**: duas inclinações em arco tangente, de todo ruído à metade e da metade a nenhum.

**O que duas matrizes mostraram** (54 imagens num laboratório de teste, um prompt, uma semente): todo sampler e agendamento pintou uma imagem inteira no Krea 2 Muse. No Qwen-Image 2512 **com Lightning, Karras, Exponential e KL optimal podem pintar o tema duas vezes** (dois faróis onde um foi pedido): com Lightning fique com Simple, Beta, Beta 57, SGM uniform ou Bong tangent. **Sem Lightning, o Euler SDE pinta o Qwen suave e enevoado**: Euler, ER-SDE ou RES mantêm o detalhe. O formulário avisa os dois casos quando se aplicam.

**De onde vêm**: escritos para o estúdio a partir dos artigos dos métodos e das fórmulas do ComfyUI (GPL-3.0, que a AGPL do estúdio pode incorporar); os do RES4LYF foram lidos só pela matemática, já que a licença dele proíbe serviços comerciais: nenhuma linha de código dele está aqui; o Heun++ é do Carzit (MIT).

### Regiões <!-- #regions -->

**Regiões** sob *Amostragem*, recolhidas: até três partes do quadro, cada uma com um lugar (uma metade, um terço, um quarto ou o meio; um pequeno mapa ao lado mostra onde) e palavras próprias. A cada passo o pintor é consultado mais uma vez para cada região, com o prompt e as palavras da região, e as respostas se misturam por caixas de borda suave, como faz o Latent Couple; o resto do quadro segue só o prompt. Assim o prompt diz a cena inteira e uma região o que está ali: *dois animais numa clareira com neve*, depois *uma raposa vermelha* na metade esquerda e *uma coruja branca num toco* na direita. Cada região custa uma passada inteira a mais por passo (numa 3090 em 16:9, Krea 2 Q4: 48 s sem elas, 137 s com duas regiões; Qwen-Image 2512 fp8: 141 e 281 s). Guardadas neste navegador; uma região sem palavras não é enviada; **De novo** pinta com as da própria execução. Krea 2 e Qwen-Image 2512; o Qwen-Image 2.1 edita por palavras e pinta sem elas.

### Adaptadores <!-- #adapters -->

**LoRA** sob o pintor: os adaptadores da família dele (Krea 2, Qwen-Image 2.1, Qwen-Image 2512, SDXL), até quatro, cada um na sua força (0 a 1.5); um clique numa palavra-gatilho dele a põe no prompt. **Adicionar…** abre a biblioteca: as pastas à esquerda, os cartões com as imagens, uma busca. Os adaptadores moram em `artwork/loras/<family>/` do estúdio (`krea2`, `qwen-image-2.1`, `qwen-image-2512`, `sdxl`): qualquer pasta dentro vira um grupo, e uma imagem ao lado de um arquivo com o nome dele (`NAME.jpg`, `NAME.png`, `NAME.preview.png`) aparece no cartão. Pegue-os no Civitai pelo modelo base (Krea 2, Qwen, SDXL 1.0) e ponha o `.safetensors` ali; **Consultar no Civitai** envia o SHA-256 de cada arquivo e nada mais, e guarda a resposta ao lado (`NAME.civitai.info`: o nome, o modelo base e as palavras-gatilho, e a primeira imagem classificada como segura quando ele não tem uma). O que o LoRA Manager do ComfyUI ou o Stability Matrix escreveram ao lado de um arquivo também é lido. Um adaptador feito para outro modelo, que não alcançaria nenhuma camada do pintor, para a execução e avisa. Um clique direito na linha de um adaptador o **silencia**: ele fica na lista com a força e sai da execução (**Tirar do mudo** o traz de volta); um adaptador em zero também não é carregado. Os sete adaptadores que os autores deixam compartilhar vêm de **Baixar pintores e adaptadores…**.

**Juntos**: a partir de dois adaptadores, uma barra embaixo deles mostra a soma das forças na estrada do Criador: verde até 1.2, âmbar até 1.8, vermelho além. Adaptadores empilhados se somam, e acima de cerca de 1.8 uma imagem queima (cores e bordas exageradas) por mais modesto que cada um seja; as zonas são uma primeira medida para imagens, a ajustar de olho. Arraste a barra para mover todos de uma vez, cada um em proporção a onde estava.

### Uma imagem para pintar a partir dela <!-- #a-picture-to-paint-from -->

**Imagem de referência**: uma imagem para pintar a partir dela, de imagem para imagem: solte uma no lugar dela sob o prompt, cole uma (Ctrl+V), escolha um arquivo, ou pegue a imagem do palco com **Como referência**. **Quanto pode mudar** diz a que distância dela a pintura começa: 0.3 a mantém quase como está, 0.6 mantém a composição e muda a matéria, 0.9 pinta a cena do prompt na luz e nas cores dela, 1.0 pinta do zero. Cada formato é coberto pela imagem e recortado do meio dela; **De novo** pinta a partir da da execução; ✕ pinta a partir do ruído outra vez.

**Usá-la** sob a imagem diz como: *para pintar a partir dela* (como acima, pelo pintor do formulário, até onde diz *Quanto pode mudar*), *para editar por palavras* ou *só pelo estilo dela*, ambos pelo Qwen-Image 2.1 quando ele está aqui (senão, desligados). Editada por palavras, a cena fica e o prompt diz o que muda (*o mesmo farol numa noite de inverno com neve*: a neve caiu onde devia, a torre e as rochas mantidas). Pelo estilo, a cena do próprio prompt é pintada com a técnica, a pincelada, a paleta e a luz da imagem, sem nada do tema dela (o farol a óleo deu *uma raposa vermelha numa floresta com neve sob a lua* na pincelada dele). Nos dois casos a execução é do Qwen-Image 2.1, qualquer que seja o pintor do formulário: o modelo, a amostragem, os adaptadores, a máscara e a tela do formulário não são enviados, e vale a licença dele (só pesquisa e avaliação). Cerca de dois minutos por imagem numa 3090.

**Máscara…** ao lado pinta sobre a imagem o que repintar (Pintar, Apagar, o pincel, Inverter, Limpar): o resto fica exatamente como estava, como no inpainting. **Pintar em volta** mantém a imagem inteira no meio de cada formato e pinta as bordas de novo (uma capa quadrada num 16:9 ou num 9:16), como no outpainting. **A capa do take** pega a capa do take escolhido à direita. Com uma máscara ou **Pintar em volta**, quatro opções sob a imagem: **Expandir** (a máscara aumentada em tantos pixels, ou reduzida), **Borda** (quão suave é a borda), **Suaves** (repintura suave, como a difusão diferencial: onde a borda é cinza a imagem muda só nos últimos passos, então sem emenda) e **Grão** (quanto da tinta nova a parte mantida recebe, o grão e a luz costurados ao novo; 0 a mantém exata).

**Tela…** ao lado de **Máscara…** abre a tela, como a do InvokeAI: o quadro de cada formato é uma aba no topo, dizendo como será pintado (**a partir dela**: a imagem cobre o quadro e a execução pinta a partir dela, de imagem para imagem na força pedida; **em volta**: a parte do quadro que ela deixa vazia é pintada em volta). Na prancheta, **Mover** (V) arrasta a imagem, ou um canto para escalá-la mantendo o canto oposto; **Pincel** (B) e **Borracha** (E) pintam a máscara de inpaint por cima; **Mão** (H, ou Espaço segurado) move a prancheta; a roda dá zoom, Alt+roda escala a imagem em volta do ponteiro, as setas a deslocam. À direita as camadas (a máscara com **Inverter** e **Limpar**, a referência com a opacidade só na prancheta) e o lugar dela em números (largura, X, Y como fração do quadro); no topo **Ajustar**, **Preencher**, **Centralizar** e **Igual em todos** (a imagem do mesmo tamanho em pixels nos outros quadros), desfazer e refazer (Ctrl+Z). **Pronto** guarda os lugares com a referência e a máscara no formulário; sob a força o formulário diz como cada formato está, e ✕ o tira da tela.

### O palco e a biblioteca <!-- #the-stage-and-the-library -->

Um clique numa imagem a põe no palco com a execução dela embaixo; um clique na imagem do palco (ou um clique duplo numa imagem) a abre sobre a página no formato dela (← → percorrem a execução, ou a galeria quando foi aberta ali; Esc fecha), com ★, **Para o formulário**, **Definir como capa** e **Baixar** (PNG, tamanho real).

**Execuções ou Galeria**: as execuções mostram cada clique em Desenhar com o prompt e a semente, a mais nova em cima; a galeria mostra cada imagem de cada execução numa grade só, a mais nova primeiro, por formato (1:1, 16:9, 9:16) ou com estrela (☆ numa imagem marca com estrela), em três tamanhos, em blocos iguais: colunas iguais, todo bloco a mesma caixa, cada imagem inteira nele.

**Comparar**: o **Comparar…** do palco, depois a outra imagem escolhida na biblioteca: as duas ficam uma sobre a outra sob um divisor que você arrasta (← → o movem), ou lado a lado (S); X as troca, Esc fecha. **Ctrl** (ou ⌘) **+ clique** escolhe imagens e **Shift + clique** um intervalo: a barra da biblioteca então as marca com estrela ou as manda para a lixeira de uma vez (Esc solta).

**O menu de uma imagem**: um clique direito em qualquer imagem (a de uma execução, da galeria, do palco, a que está sobre a página): **Sobre a página**, **Para o palco**, **Para o formulário** (o prompt, a semente e o formato dela), **Tudo para o formulário** (o pintor, o fine-tune, a amostragem e os adaptadores também: Desenhar pinta aquela imagem de novo), **Como referência**, **Comparar…**, **Definir como capa**, **Upscale** (2K ou 4K, os tamanhos que dão), **Marcar com estrela**, **Escolhê-la**, **Copiar o prompt**, **Copiar a semente**, **Baixar**, **O arquivo numa nova aba**, **A execução dela** (a vista de Execuções, com o cartão dela aceso), **Para a lixeira**. Uma execução que se revela no palco não tem menu. Sobre a página, o menu fica acima da imagem e tem as teclas enquanto está aberto: Esc fecha o menu, o Esc seguinte a imagem.

### Upscale <!-- #upscale -->

**Upscale…** no palco deixa a imagem em **2K** ou **4K**: o lado maior com 2560 ou 3840 px (uma capa quadrada 2560² ou 3840², um 16:9 2560×1440 ou 3840×2160), com um ampliador (ESRGAN, DAT, HAT, SPAN e parentes, lidos pelo spandrel) escolhido na linha que se abre (guardado; o 4x_Nomos8kDAT primeiro quando está ali); a dica de cada botão diz o tamanho que ele dá, e uma imagem que já é desse tamanho tem o botão desligado. O modelo roda quantas vezes o tamanho pede (duas no máximo) e o resultado é levado ao tamanho exato. A imagem grande é uma execução própria ao lado da fonte, em menos de um minuto numa 3090; **De novo** amplia a mesma imagem outra vez, talvez com outro modelo. Os ampliadores moram em `artwork/upscalers/` do estúdio (`.pth` ou `.safetensors`, pastas permitidas); o OpenModelDB lista centenas: atenção à licença de cada um.

**Segunda passada…** ao lado repinta a imagem maior, como o workflow do ComfyUI do Viktor faz depois da primeira passada: a imagem ampliada **×1.5** ou **×2** (pelo pixel mais próximo, como no dele) e pintada de novo pelo pintor da sua própria execução, o fine-tune, os adaptadores, o prompt e a semente, de parte do caminho (*Quanto pode mudar*: 0.3 guarda o desenho e acrescenta detalhe, 0.5 apura a matéria, 0.7 repinta as formas). Os passos, o amostrador, o agendamento e o Lightning são os do formulário quando o formulário pinta com o mesmo pintor, senão os da execução: a receita dele dá à segunda passada muitos passos e nada de Lightning. Um 16:9 de 1920×1080 sai em 3840×2160. Medido numa 3090: Krea 2 Q4 em 2560² em 86 s (14.5 GB no pico), Qwen-Image 2512 fp8 em 3840×2160 em 220 s com 12 passos e Lightning (22.9 GB). Não para o Qwen-Image 2.1, que edita por palavras; sem máscara nem tela. **Ruído extra** na mesma linha (0.6 de início, como no dele) e sob o *Quanto pode mudar* de uma referência (0 de início) é o InjectLatentNoise do workflow dele: ruído novo sobre a imagem antes de a pintura partir dela; 0.3 traz grão e detalhe novos, acima de 1 as formas da imagem começam a se desfazer.

### Uma capa para o take <!-- #a-cover-for-the-take -->

Uma imagem quadrada tem **Definir como capa**: ela vira a capa do take em mãos (escolha um à direita), no cartão dele, no player e no MP3 dele. A capa que ele tinha fica guardada ao lado do take (`artwork-removed/`), como um redesenho a guarda, e a outra letra de um par A/B também recebe a nova quando não tem nenhuma.

**A arte própria de um take** (*Desenhar a arte* no menu dele, no Bibliotecário, para um take ou vários) é pintada pelo pintor de **Motor → Arte**: pelas placas (Krea 2 Muse Q4 a partir de 16 GB, senão SDXL), ou o que você escolher: Krea 2 Muse Q4 ou Q8, SDXL CyberRealistic, e os pintores Qwen que esta máquina tem: Qwen-Image 2512 Q4 ou Q6 e cada fine-tune fp8 com Lightning, Qwen-Image 2.1 com a licença dita (não para uma canção vendida). Um fine-tune escolhido que não está mais aqui dá lugar à escolha pelas placas, e a arte diz quem a pintou.

### A lixeira do Pintor <!-- #the-artist-s-trash -->

As execuções ficam na pasta `artist/` do estúdio. **Lixeira** numa execução a move para `trash/artist/`; a **Lixeira** do palco põe uma imagem de lado. A vista **Lixeira** ao lado de Execuções e Galeria mostra primeiro as imagens postas de lado, cada uma com **Restaurar** e ✕, e **Restaurar tudo**; depois as execuções na lixeira, cada uma com **Restaurar** e **Apagar de vez**; **Apagar tudo** no cabeçalho apaga tudo o que ela mostra. Cada exclusão pergunta antes e não pode ser desfeita.

**Lixeira (Arte)** na coluna do Bibliotecário, sob Fora de vista, reúne numa só lista a arte guardada: as execuções do Pintor na lixeira, as imagens postas de lado e as capas tiradas dos takes (por um redesenho, por Remover, por uma capa nova), cada uma com a imagem e o peso. Marque-as para devolvê-las (uma capa volta para o take dela, a que ele tem agora guardada no lugar) ou para apagá-las de vez, depois de perguntar; sem nada marcado, **Esvaziar a lixeira das artes**. As capas de um espaço congelado ficam como estão.

### O log do Pintor <!-- #the-artist-s-log -->

O quadro do log do servidor tem duas vistas, **Servidor** e **Pintor**, e cada sala abre a sua: a sala do Pintor na do Pintor. O log do Pintor, guardado neste navegador (as últimas 400 linhas), diz o que foi pedido (o pintor, o fine-tune, os formatos, a semente, a amostragem, os adaptadores), o que o laboratório respondeu (uma recusa nas palavras dele), o caminho de cada execução até o fim (espera e por quê, pinta na GPU N, pronto, parado, falhou e por quê), e as próprias linhas do laboratório sobre o Pintor. **Copiar** pega as linhas da vista; recolhido, o quadro mostra a última linha da vista. **⧉** abre o log numa janela própria, as duas vistas espelhadas: no Chrome ela fica acima de todas as janelas (Document Picture-in-Picture); em outros lugares é uma janela para levar a outro monitor. A janela traz as placas ao vivo ao lado do log; o quadro se recolhe enquanto ela está aberta e se abre quando ela fecha, se estava aberto.

### Em breve no Pintor <!-- #coming-to-the-artist -->

O título e o nome do artista escritos numa capa; as versões da imagem de um take; SeedVR como ampliador (com a fase da DAW, na 2.1.0).

## Bibliotecário <!-- #librarian -->

### Todos os takes <!-- #every-take -->

![O Bibliotecário](guide/studio-collection.png)

- **O cabeçalho** nomeia a coleção aberta (*Bibliotecário › Fosforida*) e o que ela tem: takes, horas, curtidas, favoritos, notas, como foram feitos.
- **Espaços** à esquerda: Tudo, Favoritos, Em nenhum espaço, os seus espaços, *+ Novo espaço*; Ocultos e a Lixeira fora de vista. Clique direito num espaço para as **travas** dele (*Travar a exclusão do espaço*, *Travar a exclusão das faixas*): um 🔒 junto ao nome, e nada dele vai para a lixeira. Os espaços 💎 (os conjuntos públicos do estúdio) ficam no pé da árvore, por nome, e os 💎 … LoRA bem embaixo.
- **Busca** por palavras, `*` e `?`; **ordenar** mais novos, mais antigos, por título, mais longos; **Blocos** ou **Lista**: os três na linha do cabeçalho, ao lado das contagens.
- **Um cartão** usa a arte do take no canto superior direito, ao lado do título, quando tem uma (*Desenhar a arte* no menu do take); um clique mostra a imagem inteira sobre o estúdio, onde ‹ › e as setas percorrem as imagens dos cartões exibidos, ▶ toca o take e Esc fecha. O cartão que toca brilha com os picos da própria canção.
- **Takes frescos**: um take que você ainda não tocou tem uma leve linha tracejada; a primeira escuta a tira. Um take regenerado traz um selo *regen* e mantém a nota, a curtida e a estrela.
- **A coluna dos espaços**: arraste a borda para alargá-la ou estreitá-la; « a recolhe, e os cartões ficam mais largos: as colunas deles ficam, então o olho não se perde.
- **Seções**: um espaço pode ter seções, de dois níveis no máximo (⋯ ao lado do nome → *Nova seção…*), para organizar o que tem dentro sem um espaço novo a cada vez. Um espaço mostra também os takes das seções. Tudo aquilo de que o Lapidador faz algo vai sozinho para a seção *Lapidados* dos espaços dele.
- **Arraste um cartão para um espaço** à esquerda para movê-lo para lá (todos os marcados, quando ele está marcado); segure **Ctrl** para adicioná-lo lá e mantê-lo aqui também. O estúdio pergunta antes, e Ctrl+Z o devolve.
- **Takes fixados**: até quatro em cada espaço, numa faixa do próprio tom acima dos cartões (clique direito num take → *Fixar aqui*; × desafixa). Quando você marca takes, a barra dos marcados toma o lugar da faixa, então os cartões nunca se movem. Essa barra é uma fileira de ícones emoldurados: a escolha, as marcas, os espaços, a exportação e a lixeira no fim; cada um se apresenta ao passar o ponteiro.
- **Filtro** (o botão no fim da linha de busca) abre uma janela como faz o seletor de espaço: marque o que procurar em três grupos (como foi feito: gerados, importados, regenerados, re-renderizados; marcados: curtidos, não curtidos, favoritos, com nota, com arte; o que tem: stems, antizumbido, remasterização, upscale), cada um com quantos takes do lugar, e como os marcados se juntam: todos (AND), qualquer um (OR) ou nenhum (NOR). *Mostrar* os aplica; o botão então diz quantos estão ativos e como se juntam.
- **Selecione** vários, como num gerenciador de arquivos: marque um, e daí em diante um clique em qualquer ponto de outro cartão o marca também (Shift: o intervalo inteiro). Um arraste no espaço vazio entre os cartões traça uma faixa que marca o que toca; **Ctrl+arrastar** a traça de qualquer lugar e mantém o que já estava marcado. A barra dos marcados flutua acima do player: favorito, adicionar a um espaço, mover para um, tirar deste, ocultar, exportar um ZIP, para a lixeira.
- **A lixeira** devolve, ou apaga depois que você confirma. **Lixeira (Arte)**, ao lado na coluna, guarda a arte posta de lado (as execuções do Pintor na lixeira, as imagens postas de lado, as capas tiradas dos takes) e a devolve, ou a apaga de vez depois que você confirma; as capas de um espaço congelado ficam.

### O menu de um take <!-- #a-take-s-menu -->

![Clique direito num take](guide/collection-menu.png)

**Regenerar com uma semente nova** (acima do Escritor no menu do take): o take feito de novo a partir de tudo com que foi feito, mas com sementes novas; o novo pega os espaços e a nota do antigo, e o antigo espera na seção *Fontes das regenerações* do espaço dele (o espaço não o mostra entre os seus) até você esvaziá-la; o novo mantém a nota, a curtida, a estrela e a imagem. Uma sonda sai com os dois minutos completos. Tocar, abrir no Criador ou no Lapidador, a folha (a partitura), a ficha técnica (tudo com que foi feito: o estilo e a letra, a partitura desenhada, cada ajuste, as LoRAs e os sliders com as forças; um take Direto não tem partitura, e *Escrevê-la a partir do som* pede uma ao transcritor), curtir, não curtir, favorito, uma nota, renomear, **espaços** (um take pode estar em vários), **mover para** um espaço (num cartão marcado: todo take marcado, fora do espaço aberto), ocultar, mandar para o Escritor, copiar, baixar, **exportar para a DAW** (projeto REAPER ou DAWproject, em qualquer take: com os stems depois que o Lapidador os separou), a lixeira. **Num cartão marcado, com outros marcados**, o menu age sobre todos, e o cabeçalho diz quantos: curtir, não curtir, favorito, arte, a arte tirada, espaços, ocultar, um ZIP; desenhar a arte de vários e regenerar vários perguntam antes, pois custam minutos de placa.

**Desenhar a arte**: um modelo de linguagem pequeno (Qwen3-4B) lê o estilo e as palavras do take e escreve um prompt de imagem; o Krea 2 Muse o pinta, 1024 px, em cerca de meio minuto numa placa de 16 GB (numa placa menor o SDXL, CyberRealistic XL; *Motor → Arte* escolhe o pintor). Ela aparece no player, no cartão, no painel de mídia da área de trabalho e dentro do MP3 que você baixa (como capa). Quando o take já tem a imagem, o menu diz *Abrir a arte* (sobre a página, como um clique na imagem do cartão ou no quadrado do player) e *Redesenhar a arte* (um prompt novo e uma imagem nova; a antiga fica ao lado do take, em `artwork-removed/`). Os dois modelos vêm com `heresy/fetch-heresy.sh --artwork` (14 GB, perguntado antes). *Motor → Arte* oferece aqui também os pintores Qwen: o Qwen-Image 2512 e os fine-tunes fp8 dele com Lightning, e o Qwen-Image 2.1 (veja Pintor › Uma capa para o take).

### Os instrumentos sob o estilo <!-- #the-instruments-under-the-style -->

Sob a caixa de Estilo, o estúdio nomeia o que o seu prompt pede: um chip para cada instrumento e estilo da cola que ele encontra, colorido pelo que o ouvido achou (verde ouvido, âmbar duvidoso, vermelho não tocado por esse nome) e com a imagem do instrumento. Pare o ponteiro num deles para o cartão: a imagem, a origem, como soa, ▶ A e ▶ B com as sementes. Um clique mostra a imagem inteira. **Alt+I** abre a cola de qualquer lugar.

### Arte: o que a desenha, o que ela não consegue, outro pintor <!-- #artwork-what-draws-it-what-it-cannot-another-painter -->

**O que a desenha.** Um modelo de linguagem pequeno (Qwen3-4B) lê o estilo e as palavras do take e escreve um prompt de imagem, com o tema primeiro; o Krea 2 Muse o pinta (1024 px), ou o SDXL onde o Krea não cabe (*Motor → Arte*). Quando o take tem o nome de um instrumento (a sonda de um instrumento), o estúdio diz tanto como o instrumento é quanto de onde ele vem, e o Omni (o modelo do ouvinte) olha a imagem: quando não acha o instrumento, reescreve o prompt a partir do que viu, e o pintor tenta mais uma vez, três imagens no máximo. Cerca de meio minuto por imagem numa placa de 16 GB. Um pintor Qwen escolhido ali pinta com Lightning: em 1328 px, guardada em 1024.

**O que ela não consegue** (um aviso, dito com clareza): o pintor desenha o que conhece. Um instrumento que ele nunca viu pelo nome (o duduk, o morin khuur, o khomus, as taças de cristal…) sai como um palpite: um cano de madeira, um violino, tigelas de cozinha. Onde o Omni não achou o instrumento em nenhuma das três imagens, a imagem é marcada **≈ um palpite**, na sobreposição e na cola de instrumentos. Uma arte é o clima do take, não uma imagem de referência de um instrumento: para saber como um instrumento é, pesquise.

**Dica de pro: outro pintor.** Quando o pintor é o SDXL (escolhido em *Motor → Arte*, ou numa placa abaixo de 16 GB), ele é o SDXL para onde aponta o link `artwork/SDXL-Artwork-Model`; o nosso é `CyberRealistic-XL-v10`. Ponha outro finetune SDXL ao lado, como pasta diffusers ou como um arquivo `.safetensors` (como o Civitai os dá), e aponte o link para ele, relativo:

```bash
cd artwork && ln -sfn MyFavourite-XL.safetensors SDXL-Artwork-Model
```

e de volta: `ln -sfn CyberRealistic-XL-v10 SDXL-Artwork-Model`. A próxima imagem já o usa, sem reiniciar. **Só finetunes SDXL funcionam**: SD 1.5, SD 3, FLUX e outras famílias são recusados, e o estúdio diz o que encontrou no lugar. Um finetune Turbo, Lightning, Hyper ou LCM quer poucos passos e pouca orientação: quando o nome dele diz isso, o estúdio o pinta com 8 passos, orientação 2 e Euler ancestral. Para qualquer pintor, um arquivo ao lado do link define os números: `artwork/SDXL-Artwork-Model.json` com `{"steps": 6, "cfg": 1.5, "sampler": "euler_a"}` (ou `"dpmpp"`, o do estúdio).

## Treinador LoRA <!-- #lora -->

Testado nas nossas canções e vozes, o treinador fica por ora em 90 %: os seus conjuntos e cenários não são os nossos, então conte como foi (no repositório, *Trainer report*: o conjunto, o modo, as configurações, o que você ouviu).

### O que uma LoRA ensina ao YuE2 <!-- #what-a-lora-teaches-yue2 -->

Uma LoRA é um pequeno adaptador sobre as duas metades. **O estilo vem sobretudo da metade som; seguir a letra, da metade música**, e a metade música decora conjuntos pequenos rápido (a loss dela cai para perto de 0). Tipos:

| tipo | dados | o que aprende |
|---|---|---|
| **Estilo** | 20+ canções de um mesmo som | gênero, produção, o som de uma banda |
| **Voz** | uma voz, cantada ou falada: canto (de preferência a cappella), leituras, audiolivros | um timbre |
| **Idioma** | muitas vozes, letras exatas | a dicção de um idioma |
| **Artista** | um catálogo grande e variado | tudo isso |

**Um adaptador de voz aprende com qualquer forma da voz**, não só com canto: leituras e audiolivros funcionam também. Medido aqui (05.10.2026): um adaptador treinado com as leituras de um ator falou com a voz dele, e quando cantou, cantou com a cor dele. Dê a um adaptador assim o nome do tipo (baixo, baritenor, contralto…), nunca de uma pessoa: `lab/voice_kind.py` mede a voz de um conjunto pela altura da fala.

![O Treinador LoRA: a telemetria de uma execução](guide/studio-train.png)

### 1 Material <!-- #1-material -->

Ponha uma pasta de canções em `datasets/raw/` e escolha-a. Escolha quais faixas entram, dê a cada uma a letra (achada ao lado pelo nome quando existe) e, se precisar, um estilo próprio. Faixas com menos de 30 segundos ficam de fora por padrão; as longas vão bem (a metade música treina na canção inteira).

**Voz**: *Medir a voz* ouve até doze faixas da pasta e diz, na fala, masculina ou feminina e o registro (baixo, barítono, baritenor, tenor; contralto, mezzo, soprano) com a altura da fala, e oferece um nome para o conjunto feito delas, como são nomeados os adaptadores de voz publicados (`voice-ru-m-baritenor-117`): sem nome de pessoa. No canto, dá a extensão cantada e deixa a voz para o seu ouvido. Onde a altura sozinha não decide (140–175 Hz falados), diga ♂ ou ♀ e meça de novo. Um rascunho pela medida: o ouvido decide, e a voz que o YuE2 depois canta pode ficar mais aguda ou mais grave.

### 2 O conjunto <!-- #2-the-set -->

Uma **palavra-gatilho** (uma palavra incomum, p. ex. `fosforida`) chama o estilo pelo nome depois; a **linha de estilo comum** diz o que se ouve. *Criar o conjunto* escreve `datasets/prepared/NAME/`: áudio em 48 kHz e uma legenda por faixa.

O **ouvinte** (Qwen2.5-Omni, em qualquer placa com cerca de 8 GB livres) ouve cada faixa e rascunha as tags; você as corrige e *Escrever nas legendas*. É um rascunho em qualquer tamanho: leia.

### 3 Treinar <!-- #3-train -->

![Um tipo, os ajustes, uma placa](guide/train-knobs.png)

Escolha um conjunto feito no passo 2, depois um **tipo**: ele ajusta os parâmetros para o que você ensina (a tabela sob a lista), e cada um pode ser mudado antes de *Treinar*. O formulário, campo a campo:

- **Tipo**: estilo, voz, idioma ou artista.
- **Nome da execução**: a pasta da execução (`training/NAME/`) e os nomes dos adaptadores dela (`loras/NAME/NAME-eNNN`, entre as LoRAs do Criador na hora). Um nome pertence a uma execução: a página pede outro quando ele já está em uso.
- **Treinador**: **Ruach Studio** (o do próprio estúdio, em pesos bf16 não quantizados; ele faz sozinho o cache latente do conjunto; modo Direto) ou **AI-Toolkit** do Ostris (a referência; ele também treina com partitura e com vocais separados). Os dois salvam o mesmo formato de LoRA; no mesmo conjunto as curvas deles concordam época a época.
- **Pesos de base**: bf16, o modelo inteiro (uma placa de 24 GB), ou int8 para placas menores, um pouco menos exato. O arquivo do modelo base nunca muda: só o adaptador aprende.
- **Passos**: quantos ao todo, uma faixa por passo. A metade som ouve uma janela de 60 segundos da faixa, cortada ao acaso a cada vez; a metade música lê a canção desde o início. A execução é arredondada para épocas inteiras (uma época: cada faixa uma vez): 2016 faixas por 12 épocas são 24 192 passos.
- **Salvar a cada N épocas**: um adaptador no fim de cada N-ésima época, cada um para ouvir e comparar, todos guardados, com o estado do otimizador ao lado do mais novo (uma execução parada guarda o que aprendeu).
- **Rank**: a largura do adaptador; a fração dos pesos e o tamanho estão na dica do campo (quanto custa cada rank e qual para quê: abaixo).
- **Taxa de aprendizado**: o tamanho de cada passo da metade som (AdamW, a mesma na execução toda); a da metade música é esta vezes **Velocidade AR**. Os tipos mantêm 0.0001; a metade disso é mais suave, para uma execução longa sobre um conjunto grande; mais alto aprende mais rápido e esquece mais.
- **Peso AR**, **Âncora AR (KL)**, **Velocidade AR**: os três ajustes da metade música, abaixo.
- **Modo** e **Separar vocais e música**, só no AI-Toolkit: **Direto** é para canções feitas no modo Direto; **Completo (partitura)** e **Melodia**, para canções feitas nesses modos, ensinam também a metade música a escrever primeiro uma partitura, transcrita de cada canção; **separado**, cada canção é primeiro dividida em voz e música, e a metade música também aprende a voz só pela letra e a música só pelas tags.
- Sob o botão: a VRAM medida das execuções anteriores, e qual placa está livre o bastante agora.

| tipo | rank | passos | peso AR | âncora AR | velocidade AR | para quê |
|---|---|---|---|---|---|---|
| **Estilo** | 32 | 1500 | 0.5 | 0.2 | 0.5 | um som: gênero, produção, o de uma banda |
| **Voz** | 16 | 1500 | 0.3 | 0.3 | 0.5 | um timbre: a metade música mantida perto da base |
| **Idioma** | 32 | 3000 | 1.0 | 0.1 | 1.0 | dicção: a metade música feita para mudar |
| **Artista** | 32 | 3000 | 0.7 | 0.2 | 0.7 | tudo isso |

### O rank e os outros ajustes <!-- #rank-and-the-other-knobs -->

O **rank** é a largura da mudança do adaptador em cada matriz. Uma LoRA adapta 224 matrizes do YuE2, 112 por metade; cada uma tem 2048 de largura, 28 camadas de profundidade, 1,41 bilhão de pesos por metade. Quanto custa um rank, medido nessas formas:

| rank | dos pesos que adapta | arquivo, por metade (bf16) |
|---|---|---|
| 16 | 1 % | 29 MB |
| 32 | 2 % | 59 MB |
| 64 | 4 % | 117 MB |
| 128 | 8 % | 235 MB |
| 256 | 17 % | 470 MB |

- **Uma voz, um instrumento, um som** (20 a 50 canções): **16**, no máximo 32.
- **Um estilo ou um artista** (um catálogo variado): **32**.
- **Um conjunto grande de muitas vozes** (horas delas, uma tag para cada voz): **64**, e **128 no máximo**, só quando 64 fica mensuravelmente aquém. O treinador para em 128: 256 mudaria um sexto dos pesos que toca, mais do que qualquer conjunto daqui precisa.
- O arquivo do modelo base nunca muda. O risco de um rank grande é o próprio adaptador: em força total ele esquece o que não lhe mostraram (o canto, se aprendeu com fala).
- **Passos**: a metade música decora rápido um conjunto pequeno (a loss cai para perto de 0): as épocas verdes na Telemetria são as primeiras a ouvir, muitas vezes bem antes da última.
- **A taxa de amostragem do material**: a metade som trabalha em 48 kHz, a metade música ouve em 24 kHz. Uma gravação em 24 kHz ensina tudo à metade música, mas à metade som só um topo abafado: reamostrar não acrescenta nada acima da metade da taxa original. Para um timbre, dê 44,1 ou 48 kHz.

### Os três ajustes da metade música <!-- #the-music-half-s-three-knobs -->

Cada passo ensina as duas metades separadamente. A metade som sempre aprende o som: tirar o ruído da janela da faixa (a loss de fluxo). A metade música só aprende quando o **Peso AR** está acima de 0, e então duas coisas a puxam ao mesmo tempo:

- **a lição dela** (ar_ce): prever os próprios tokens da canção desde o início, palavra por palavra e nota por nota: dicção, fraseado, hábitos melódicos, a forma de uma canção;
- **a âncora** (ar_kl): em cada um desses pontos o treinador pergunta ao modelo base, a mesma metade música com o adaptador desligado, o que ele escreveria ali, e multa o adaptador por cada passo para longe disso.

A loss de um passo é fluxo + peso AR × ar_ce + âncora AR × ar_kl. O que cada ajuste faz:

- **Peso AR** decide se a metade música aprende ou não, e com que força a lição puxa contra a âncora. Em 0 a metade música fica sendo o modelo base (a parte dela no adaptador fica vazia: tudo zero, medido), o adaptador é um timbre só na metade som, e a âncora não faz nada.
- **Âncora AR** puxa a metade música de volta para o modelo base, para que ela guarde o que o conjunto não mostra: o canto depois de um conjunto de leituras, outros idiomas, seguir palavras novas, escrever uma partitura. Sem âncora ela deriva para onde o conjunto levar.
- **Os dois puxam um contra o outro, e só a razão entre eles conta, não o tamanho.** O AdamW escala cada passo pelo tamanho dos próprios gradientes recentes, então uma loss multiplicada por um número ensina o que ensinava antes: 0.5 com âncora 0.2 é o mesmo que 1.0 com 0.4. Leia a âncora como uma fração do peso: um décimo dele deixa a metade música se mover (Idioma), do mesmo tamanho a segura perto da base (Voz).
- **Velocidade AR** é o acelerador de verdade da metade música: a taxa de aprendizado dela é a taxa de aprendizado vezes isto, o único ajuste que faz a metade música aprender mais rápido ou mais devagar. Os tipos a mantêm em 0.5 (Idioma em 1.0): a metade música decora um conjunto pequeno muito antes de a metade som ter o seu timbre.

Medido aqui (10.10.2026: 40 passos num conjunto de 60 leituras, rank 16, uma semente; *movido*: o tamanho da mudança do adaptador nas matrizes da metade música):

| peso AR · âncora · velocidade | movido | diferença da primeira linha | ar_kl, últimos dez passos |
|---|---|---|---|
| 0.5 · 0.2 · 0.5 (o do Estilo) | 1.32 | a mesma execução de novo: 1 % | 0.257 |
| 1.0 · 0.4 · 0.5 (os dois dobrados) | 1.36 | 5 % | 0.262 |
| 0.5 · 0 · 0.5 (sem âncora) | 1.44 | 23 % | — |
| 0.5 · 0.5 · 0.5 (a âncora do mesmo tamanho) | 1.21 | 17 % | 0.132 |
| 0.5 · 0.2 · 1.0 (velocidade dobrada) | 2.32 | 99 % | 0.443 |
| 0 · 0 · 0.5 | 0 | nada aprendido | — |

Dobrar os dois mudou o adaptador em 5 %, contra 1 % para a mesma execução duas vezes; a fração da âncora o moveu de um sexto a um quarto; dobrar a velocidade o levou três quartos mais longe. A metade som só compartilha o corte de gradiente com a metade música: entre as linhas ela diferiu de 4 a 13 %, contra 2 % para a mesma execução duas vezes.

O que girar, pelo que você ouve e vê:

| quando | gire |
|---|---|
| você quer só um timbre (uma voz a partir de leituras, um instrumento) | Peso AR baixo com a âncora do mesmo tamanho (o 0.3 e 0.3 da Voz), ou Peso AR 0 |
| você quer a dicção de um idioma, o fraseado de um estilo | Peso AR 1.0, a âncora um décimo dele, Velocidade AR 1.0 (os do Idioma) |
| ar_ce cai abaixo de 0.3 cedo: ele decorou as canções | Velocidade AR para baixo, ou a fração da âncora para cima; ou ouça uma época anterior |
| o adaptador canta as melodias das canções de treino sobre palavras novas, ou perde a letra | a fração da âncora para cima: do tamanho do peso, ou mais |
| ar_kl fica perto de 0 e a dicção não veio | Velocidade AR para cima, ou a fração da âncora para baixo |

### 4 Telemetria <!-- #4-telemetry -->

![As curvas das duas metades, explicadas sob cada uma](guide/train-charts.png)

As execuções que estão treinando ficam no topo da sala com o progresso, o tempo restante e as duas losses. A telemetria de uma execução mostra o progresso, depois blocos: a velocidade, o tempo que rodou e o que falta, os últimos valores de flow, ar_ce e **ar_kl** (quanto a metade música se afastou do modelo base: 0 enquanto o Peso AR é 0), o pico de VRAM e a placa; depois duas curvas:

- **Metade som · loss de fluxo**: o quanto a metade som prevê bem o ruído que precisa tirar. Ela salta de passo em passo (cada passo sorteia um nível de ruído): leia a linha grossa, a média móvel.
- **Metade música · ar_ce**: o quanto a metade música prevê bem os próprios tokens da canção. Perto de 0 ela decorou as canções; uma época anterior é então o melhor adaptador.

Passe o ponteiro numa curva para ler o passo, a época e o valor ali. **Comparar com…** põe por cima as curvas de outra execução, tracejadas. O botão ao lado de **O log** põe as duas curvas uma sob a outra, cada uma na largura toda, ou lado a lado de novo. **O log** abre no pé da sala, tão largo quanto as linhas, ao lado do log do servidor.

### As épocas para ouvir primeiro <!-- #the-epochs-worth-hearing-first -->

![Verde: para ouvir primeiro; ✓: em loras/](guide/train-epochs.png)

Cada época salva é um chip. As **verdes** são as primeiras a ouvir, lidas nas curvas: a primeira época cuja loss de som assentou, a de menor loss de som, e a última antes de a metade música decorar as canções. É um palpite; o ouvido decide. Escolha uma época: **Para loras/ → o Criador** (ela aparece entre as LoRAs na hora), **Fora de loras/**, ou **Baixar**.

> **Um adaptador treinado sem partitura (Direto) só tem lugar na metade música em execuções Diretas.** No Plano completo a metade música dele pode quebrar a partitura mesmo com força baixa: ali, dê a ele só a metade som.

### Execuções <!-- #runs -->

![Cada execução, um cartão](guide/train-runs.png)

Cada execução é um cartão à direita: *Ativas*, *Tudo*, *Arquivadas*, *Lixeira*, com busca. Uma execução treinando fica acesa como um take tocando. ⋯ num cartão: a telemetria, o log, arquivar, parar, ou apagar para a lixeira (você é perguntado se os adaptadores dela em loras/ vão junto). Da Lixeira ela volta, ou vai embora de vez.

## Motor <!-- #engine -->

### A máquina <!-- #the-machine -->

![Motor](guide/studio-engine.png)

- **Servidor**: o que o motor roda: o modelo, os decodificadores, o contexto, a biblioteca.
- **Processamento**: a cópia do **modelo** (BF16 7,2 GB, Q8_0 3,8 GB, Q6_K e Q5_K_M menores), a **Predefinição de memória da GPU** (*Auto* ajusta o contexto e os blocos do VAE à placa; *Auto dentro de N GB* faz isso para essa quantidade, o resto da placa deixado para o que mais roda nela (num notebook de 16 GB, 14); *Manual* deixa com você), **Manter os modelos carregados**. **Escanear a máquina** diz o que a máquina tem e o que combina com ela (o backbone, os ajustes do Auto, o pintor), como um estúdio novo faz uma vez no primeiro início.
- **Hardware**: a memória da placa agora; **Descarregar o modelo** a libera na hora.

### GPUs: qual placa faz o quê <!-- #gpus-which-card-does-what -->

![Qual placa faz o quê](guide/engine-gpus.png)

Numa máquina com várias placas, dê a cada uma o seu trabalho: o **estúdio** (a síntese) numa placa, o **treino** nas placas que você der a ele, as **tarefas** do laboratório (o ouvinte, Whisper, stems, remasterização, upscale) nas delas. Enquanto uma execução treina na própria placa do estúdio, uma síntese espera, e a página diz por quê. Com uma placa só, é assim que funciona: treinar, depois criar. Uma placa nova para o estúdio vale depois de reiniciar (o botão aparece quando é preciso). As tarefas do laboratório ficam nas placas marcadas para elas, o Pintor junto: quando essas estão cheias, uma tarefa espera uma delas (o Whisper passa para o processador) e nunca pega uma placa não marcada para o laboratório. Uma execução do Pintor vai para a placa onde o pintor dela está mantido desde a execução anterior, com os pesos já na RAM.

### Decodificadores, adaptadores, sliders, o modelo do Escritor, a aparência <!-- #decoders-adapters-sliders-the-writer-s-model-the-look -->

- **VAEs**, **LoRAs**, **Sliders**: cada arquivo que o estúdio encontrou, com a fonte e o que faz.
- **Modelos e LoRAs**: o que a instalação traz, parte por parte (os decodificadores extras e os sliders, o Whisper, os modelos dos stems, o UniverSR, as LoRAs), como a última execução o achou, e **Verificar de novo** para olhar outra vez. Uma parte incompleta lista o que falta e tem o seu **Baixar**; **Baixar o que falta** pega tudo; um download interrompido continua de onde parou. **Mais modelos**: outro backbone (BF16 ao lado do Q8_0), o ouvinte de estilo, o pintor do Pintor, a base do treinador, cada um com as variantes e tamanhos, uma variante já aqui avisada, cada um perguntado antes com o tamanho. Um backbone, decodificador ou slider novo chega ao motor no próximo início (**Reiniciar o motor**); LoRAs novas na hora.
- **Arte**: quem pinta a arte de um take: pelas placas (Krea 2 Muse Q4 a partir de 16 GB, senão SDXL), ou um escolhido: Krea 2 Muse Q4 ou Q8, SDXL CyberRealistic, e os pintores Qwen que esta máquina tem (Qwen-Image 2512 Q4 ou Q6 e cada fine-tune fp8, com Lightning; Qwen-Image 2.1 com a licença dita).
- **Escritor**: o endereço do servidor de chat local (vLLM, LM Studio, Ollama), *Testar conexão*.
- **Aparência**: 22 temas (escolhidos para trabalhar: claros e calmos), os cantos, as três fontes (texto, títulos, números).
- **Log do servidor**: o log inteiro; **Sobre**: cada projeto em que o estúdio se apoia, com link.
- **Atualizações**: as versões do Ruach Studio no GitHub contra esta versão: com que frequência olhar (todo dia, semana, mês, nunca), versões candidatas também, e quando sai uma, perguntar ou atualizar sozinho quando nada roda (só onde o estúdio é um clone do repositório; em outros lugares ele diz como atualizar à mão). Um estúdio novo, e cada atualização, oferece os conjuntos 💎 que ele ainda não tem.
- **Pastas**: onde o seu trabalho mora (as canções com os espaços baixados do Hugging Face, a lixeira, as imagens do Pintor, os documentos do Escritor), o que cada uma tem e o espaço que resta no disco. **Mover…** leva uma para qualquer pasta ou disco: o estúdio diz primeiro o que vai fazer (no mesmo disco uma renomeação; em outro uma cópia, conferida arquivo por arquivo, depois o vínculo trocado) e só move depois de um segundo sim, enquanto nada renderiza; a cópia antiga fica, renomeada, até você removê-la. **De volta para casa** traz uma pasta de novo para a pasta do estúdio; **Vincular de novo** aponta o estúdio para uma pasta cujo disco voltou. Os modelos, as LoRAs e os conjuntos de treino ficam onde estão.

## DAW <!-- #daw -->

**Experimental.** O caminho para uma DAW funciona e foi conferido, mas ainda precisa de testes de travamento em outras máquinas e projetos, e de mais trabalho.

### Duas saídas do estúdio <!-- #two-ways-out-of-the-studio -->

O estúdio entrega uma canção de um de dois jeitos, e só destes dois:

1. **A faixa mixada**, como o estúdio a fez e o Lapidador a terminou: WAV, FLAC ou MP3, sem DAW no meio.
2. **O take inteiro na sua própria DAW**, como um projeto dessa DAW: dali em diante, tudo acontece fora do estúdio. Nenhum áudio e nenhum projeto volta: o estúdio não lê o projeto de uma DAW (o REAPER pode lhe dar aquilo de que uma canção é feita: as palavras e uma melodia).

**Exportar para a DAW** abre essa escolha: no ☰, ou no Lapidador ao lado do take em mãos. A página mostra quais DAWs a própria máquina do estúdio tem (REAPER, Waveform, Bitwig), com as versões. Quando o estúdio roda em outro computador que não o da sua DAW (um servidor em casa, um notebook na estrada), marque a sua com *Eu uso esta*.

| DAW | o que o estúdio entrega a ela | estado |
|---|---|---|
| **REAPER** | o projeto próprio dele (.RPP): o mix, os stems, a partitura como MIDI, andamento e compasso, seções, letra, a receita | pronto, conferido pelo próprio REAPER |
| **Waveform** (Tracktion), 14 ou mais novo | DAWproject: o mix e os stems, a partitura como faixas de notas, as seções como marcadores, andamento e compasso | pronto, conferido contra o schema do formato |
| **Bitwig** | DAWproject, o mesmo | pronto, conferido contra o schema do formato |
| **Studio One, Cubase** (Windows, macOS) | DAWproject, o mesmo | pronto |

### REAPER: instalar <!-- #reaper-install -->

- **Linux**: do reaper.fm, o tarball *Linux x86_64*; descompacte e rode `./install-reaper.sh`: ele vai para `/opt/REAPER`, sem mais nada.
- **Windows, macOS**: o instalador do reaper.fm.
- O REAPER dá 60 dias com todas as funções, depois pede uma licença (US$ 60 para uso pessoal ou pequena empresa).

### O projeto mais completo: três passos antes <!-- #the-fullest-project-three-steps-first -->

O que o projeto leva depende do que o take tem. Para tudo:

1. **Plano completo** quando você faz a canção: a partitura vira as faixas MIDI e dá o andamento e o compasso. (Um take Direto não tem partitura: sem MIDI; o andamento vem de "NN bpm" no estilo, ou fica um provisório de 120.)
2. **Lapidador → Stems**: cada stem ganha a sua faixa (dois: vocal e instrumental; quatro: com bateria, baixo e o resto).
3. **Lapidador → Checagem da letra**: o Whisper marca o tempo de cada verso; os versos vêm para a linha do tempo e as seções ([Verse], [Chorus]…) viram regiões.

Nenhum dos três é necessário: o projeto pega o que há e diz o que faltou.

### REAPER: exportar e abrir <!-- #reaper-export-and-open -->

1. Abra o take (no Criador, no Lapidador ou no Bibliotecário), depois **Exportar para a DAW → REAPER → Exportar o take**; ou clique direito em qualquer take → **Baixar → Projeto REAPER**.
2. O estúdio empacota o take: o áudio como WAV de 24 bits a 48 kHz, então uma canção de sete minutos com dois stems tem cerca de 350 MB. O navegador salva `TITLE.reaper.zip`.
3. Descompacte em qualquer lugar, inteiro: `TITLE/TITLE.RPP` e `TITLE/audio/` ficam lado a lado.
4. Abra `TITLE.RPP` no REAPER (File → Open project, ou um clique duplo).

### O que vai dentro <!-- #what-is-inside -->

| faixa | o que é |
|---|---|
| **Mix** | a canção como o estúdio a renderizou; **muda** quando há stems, para que os stems soem e o mix espere como referência |
| **Vocals**, **Instrumental** (ou Drums, Bass, Other) | os stems, cada um desde 0 pela canção inteira |
| **Score · Vocal**, **Score · Ins** | a partitura como MIDI, uma faixa por voz. É a partitura *como escrita*: a canção como cantada pode se afastar dela. Não faz som até você dar a ela um instrumento (os FX da faixa: ReaSynth, ou qualquer VSTi) |
| **Lyrics** | cada verso como um item vazio com o verso na nota, onde o Whisper o ouviu |

- **Regiões**: as seções da letra, do primeiro verso marcado de cada uma até a próxima.
- **Andamento e compasso**: da partitura (os `Q:` e `M:` dela), senão "NN bpm" no estilo, senão 120 em 4/4 como provisório; as notas do projeto dizem qual.
- **As notas do projeto** (nas configurações de projeto do REAPER): o título, o estilo, as duas sementes, o nome do próprio take: o caminho de volta ao take no Bibliotecário.

### REAPER: quando algo parece errado <!-- #reaper-when-something-looks-wrong -->

| o que você vê | por quê | o que fazer |
|---|---|---|
| mídia offline | a pasta de áudio não está ao lado do .RPP | descompacte o ZIP inteiro, mantenha `audio/` ao lado do projeto |
| sem letra, sem regiões | o take nunca foi temporizado | Lapidador → Checagem da letra, depois exporte de novo |
| sem faixas MIDI | um take Direto, ou um sem partitura | faça-o no Plano completo, ou traga a sua partitura no Criador |
| o andamento mostra 120 | o take não tem andamento próprio | ajuste no REAPER, ou escreva "NN bpm" no estilo da próxima vez |
| o MIDI corre à frente ou atrás da voz | a partitura é o plano, o canto a interpretação | use o MIDI como esboço, ou estique-o nos stems |
| letra em hebraico ou grego aparece em quadradinhos | a fonte do REAPER não tem a escrita | uma fonte com essas escritas no tema ou nas preferências do REAPER |

### REAPER: canções de dentro do REAPER <!-- #reaper-songs-from-inside-reaper -->

Três ações do REAPER em `extras/reaper/` (ReaScript, Lua) chegam ao estúdio pela API dele, da própria máquina do estúdio ou de outra na sua rede. O som vai num sentido só: as canções saem do estúdio para o REAPER, e nenhum áudio nem projeto volta. O que o REAPER dá ao estúdio é aquilo de que uma canção é feita: as palavras e a melodia.

- **Ruach - Generate here**: o estilo, a duração e o modo, perguntados; a canção é feita no estúdio e chega numa faixa nova no início da seleção de tempo (com a duração da seleção). A letra vem das notas dos itens selecionados (o projeto exportado guarda ali as palavras de cada seção), ou do diálogo. **Itens MIDI selecionados são a melodia da canção**: as notas deles viram a partitura (a faixa de cima cantada; uma faixa de acordes não é dada como linha, já que um instrumento poderia pegar a melodia), no andamento e compasso do projeto, no tom do key snap do take ou no que as notas sugerem, feita no modo *Só a melodia*; as notas do item novo dizem como a melodia foi lida. O REAPER fica livre enquanto o estúdio trabalha.
- **Ruach - Bring a take**: palavras (título ou nota, `*` e `?`), um espaço se quiser, e o take que você escolher chega no cursor de edição.
- **Ruach - Settings**: o endereço do estúdio, o token se ele pedir, e o espaço onde as canções vindas do REAPER chegam.

Instalação: copie a pasta para `Scripts` do REAPER, depois *Actions → New action → Load ReaScript* para as três, e rode *Settings* uma vez. Elas precisam do `curl` (todo Linux, macOS, e Windows 10 em diante têm). O README da pasta diz o resto.

### DAWproject (Bitwig, Studio One, Cubase) <!-- #dawproject-bitwig-studio-one-cubase -->

Clique direito num take → **Baixar → DAWproject**, ou *Exportar o take* no cartão Waveform ou Bitwig da janela DAW: um arquivo `.dawproject` com o mix e cada stem (o mix mudo quando há stems), a partitura como faixas de notas, uma por voz, as seções como marcadores quando o take foi temporizado, no andamento e compasso do take; o estilo e a letra vão nas notas dele. Abra-o com a importação de DAWproject da DAW: Waveform 14 ou mais novo (*File > Import Other > Import a DAWproject file*; o estúdio pede no mínimo o Waveform 14), Bitwig, Studio One, Cubase. Conferido contra o próprio schema do formato (Project.xsd).

### A partir dos seus próprios scripts <!-- #from-your-own-scripts -->

Tudo acima é também a API do estúdio: `POST /api/v1/takes/NAME/reaper` empacota o projeto e diz onde baixá-lo. Veja **docs/API.md**: canções, tarefas, takes, marcas, espaços, e um servidor MCP para agentes.

## Partitura <!-- #score -->

No Plano completo a metade música escreve uma partitura antes de soar uma nota, e a canção a segue compasso a compasso; com *Trazer sua própria partitura* a partitura é sua. Esta aba a lê linha a linha: o dialeto que o YuE2 e o SheetSage2 escrevem, como as duas vozes dividem os compassos, e como mudá-las sem quebrar a canção.

### O que a partitura faz <!-- #what-the-score-does -->

A partitura é texto ABC: um cabeçalho, depois a canção em grupos de um a quatro compassos, cada grupo uma vez para a voz (**Vocal**) e uma vez para os instrumentos (**Ins**), numa única grade de compassos. O motor a lê antes da música: as notas da voz levam as palavras, os acordes conduzem a harmonia, os compassos dão o tempo.

- **Um take dura o mesmo que a sua partitura.** Seis takes Completos terminaram a 0,5–5 s da duração da partitura. Compassos depois das últimas palavras ainda tocam: isso é uma cauda (*Terminar em…* a corta, ou tire esses compassos da partitura).
- **O que falta na partitura não é cantado.** Se o plano tem menos seções que a letra, os últimos versos ficam de fora ou um anterior volta.
- **O estúdio a lê com rigor.** O que a verificação não conhece ela recusa, e diz onde: o grupo, a voz, o compasso. O motor ainda pode tocar uma partitura assim, mas o MIDI, os marcadores, o deslocamento da voz e a recitação precisam do dialeto nativo.

### O cabeçalho <!-- #the-head -->

Oito linhas, sempre estas, nesta ordem:

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

- `X:1` e um `T:` vazio como estão: o título mora no formulário.
- `M:` o compasso como fração: `4/4`, `3/4`, `6/8`, `2/4`; o número de baixo uma potência de dois.
- `L:` a unidade: uma nota sem número dura isto. O YuE2 escreve `L:1/16`, uma semicolcheia, e tudo abaixo conta nela.
- `Q:1/4=` o andamento: semínimas por minuto, um número inteiro.
- As duas linhas `V:` palavra por palavra: o motor reconhece as vozes por elas.
- `K:` o tom: um maior pelo nome (C, G, D, A, E, B, F#, C#, F, Bb, Eb, Ab, Db, Gb, Cb) ou um menor com m (Am, Em, Bm, F#m, C#m, G#m, D#m, A#m, Dm, Gm, Cm, Fm, Bbm, Ebm, Abm). Outra grafia do mesmo tom é recusada: `Eb`, não `D#`.

### Grupos, vozes e compassos <!-- #groups-voices-and-bars -->

Depois do cabeçalho a canção vem em grupos:

```
% verse
V: Vocal
"Gm"B2B2B2B2B2B2B2G2|"Eb"B2B2B2B2B2B2B2F2|"F"F2F2F2F2F2G2F2F2|"Gm"G4z12|
V: Ins
Z4|
```

- Um grupo: um comentário de seção onde uma seção começa (`% verse`), depois `V: Vocal` e uma linha de um a quatro compassos, depois `V: Ins` e uma linha com **o mesmo número de compassos**. Toda linha termina com `|`; sem `||`, sem repetições.
- `Z` é um compasso inteiro de pausa, `Z2`, `Z3`, `Z4` essa quantidade de compassos; `z` é uma pausa com duração, como uma nota.
- Um compasso ou tom novo vem como uma linha `M:` ou `K:` logo depois da linha `V:` de um grupo, igual nas duas vozes: a verificação quer as duas vozes numa grade e num tom em cada momento. Dentro de um compasso uma mudança de tom se escreve `[K:Em]`.

### Notas e suas durações <!-- #notes-and-their-lengths -->

- Letras são alturas: `C D E F G A B` a oitava a partir do dó central (C4), minúsculas `c d e f g a b` a oitava acima; `'` sobe uma letra uma oitava e `,` a desce: `B,` é B3, `c'` é C6.
- `^` sustenido, `_` bemol, `=` bequadro (`^^` e `__` duplos): uma marca vale para essa letra até o fim do compasso. Os sustenidos e bemóis do próprio tom não precisam de marca.
- O número depois de uma nota é a duração em unidades (em `L:1/16`): `1` uma semicolcheia, `2` uma colcheia, `3` uma colcheia pontuada, `4` uma semínima, `6` uma semínima pontuada, `8` uma mínima, `12` uma mínima pontuada, `16` uma semibreve; `24`, `32` e `48` para as mais longas. Só estas: outra duração são duas notas ligadas (`F4-F` para cinco).
- `-` liga uma nota à seguinte de mesma altura, inclusive através da barra de compasso: uma nota sustentada, uma sílaba.
- **Todo compasso soma exatamente o seu compasso**: em `L:1/16` dezesseis unidades em 4/4, doze em 3/4 e em 6/8. Um compasso uma unidade curto ou longo demais é recusado, com os números.

### Acordes <!-- #chords -->

- Um acorde é o nome dele entre aspas antes da nota onde começa: `"Gm"B2`. Ele vale até o próximo. Acordes ficam só no **Vocal** (a verificação os recusa no Ins): são a harmonia da banda, não as notas do cantor.
- Um nome é uma tônica (A a G, com `#` ou `b`) e um de: maior (nada), `m`, `dim`, `aug`, `7`, `maj7`, `m7`, `dim7`, `m7b5`, `sus4`, `sus2`, `6`, `m6`, `7sus4`, `m(maj7)`; um baixo depois de uma barra: `C/E`.
- Uma pausa pode levar um acorde: `"Bmaj7"z16` é um compasso desse acorde com a voz calada, como numa intro.
- Com acordes uma partitura é tocada no **Plano completo**; sem, no **Só a melodia** (um plano de melodia, o acompanhamento livre). O motor sabe qual pela própria partitura.

### Seções <!-- #sections -->

- `% intro`, `% verse`, `% chorus`, `% bridge`, `% outro` numa linha própria antes da marca de grupo onde uma seção começa. Elas chegam à sua DAW como marcadores (*Marcadores*, e dentro do projeto REAPER), e é ali que o plano encontra a sua letra.
- Dê à partitura as seções da sua letra, na ordem delas, cada uma com espaço para os seus versos. O planejador às vezes escreve menos: num rap longo, de 2 a 17 seções para as 32 do texto. Acrescente-as, ou encurte a letra, antes de *Gerar*.

### Tempo <!-- #time -->

- Um compasso dura as suas semínimas × 60 ÷ o andamento, em segundos (o andamento conta semínimas): em 4/4 a 85 BPM 2,82 s, a 103 BPM 2,33 s; em 3/4 a 90 BPM 2 s.
- A canção dura os seus compassos × isso. A linha da verificação sob a partitura diz: `✓ Native YuE2 score · Em · 90 BPM · 3/4 · 11 bars · 0:22 · 0 sections`.
- Um verso precisa do tempo das sílabas: a uma colcheia por sílaba um compasso de 4/4 comporta 8, a uma semicolcheia 16 (um rap: os versos de Buratino do Viktor vão `FFFFFEEEE2zDDDDD`).
- Para terminar a canção antes, tire compassos do fim da partitura, nas duas vozes; para uma outro, acrescente compassos ali.

### O espaço da voz: Vocal <!-- #the-voice-s-space-vocal -->

- Vocal é o que é cantado: mais ou menos uma sílaba por nota, uma nota ligada é uma sílaba sustentada, pausas onde o cantor respira. A tabela da verificação diz quantas notas, quantas por minuto, a extensão, e quanto do tempo a voz soa.
- Notas e sílabas: com mais notas que sílabas o modelo estica as sílabas sobre elas, ou acrescenta algumas suas; com menos ele espreme as palavras. A métrica da letra em Compor conta cada verso pelo tempo que ele leva: dê ao verso mais ou menos esse número de notas.
- O rap é denso (semicolcheias em uma ou duas alturas: o ritmo o carrega), uma balada tem notas longas. Deixe uma pausa no fim do verso: ali a voz respira e os instrumentos respondem.
- O deslocamento da voz sob a partitura (*Mover*) move o Vocal por graus da escala (uma terça, uma quarta, uma oitava) onde ele está agudo ou grave demais para o cantor; os acordes e o Ins ficam.

### O espaço dos instrumentos: Ins <!-- #the-instruments-space-ins -->

- Ins é a linha própria dos instrumentos: o riff da intro, as respostas entre as frases, um solo, a outro. Uma melodia, não os acordes (esses ficam no Vocal): uma linha, e o YuE2 arranja a banda em volta dela.
- **Sob a voz o Ins quase sempre descansa.** Os covers oficiais mantêm `Z4` sob cada grupo cantado e tocam na intro, entre as seções e no fim; os takes Completos do Viktor fazem o mesmo (um arpejo na intro, `Z4` sob as estrofes, uma virada nas passagens). Um Ins cheio sob um verso cantado é uma segunda melodia contra a voz, e as partituras nativas evitam isso.
- A verificação resume isso como **Ins : Vocal**, as notas de um contra as do outro: acima de 1.5 os instrumentos levam a maioria das notas, abaixo de 0.67 a voz leva, entre os dois mais ou menos igual.
- Um instrumental: o Vocal descansa (`Z`) a canção inteira e o Ins leva a melodia. *Tornar instrumental* move a melodia vocal de uma partitura para o Ins (a receita oficial) e marca *Instrumental*. Um adaptador de partitura instrumental em força total com palavras para cantar dá uma voz sem notas: mantenha-o baixo quando há letra (Criador › VAE, sliders e LoRAs).

### Mudando no estúdio <!-- #changing-it-in-the-studio -->

- **Criar partitura ABC**, leia e mude, depois **Gerar**: o caminho mais seguro para a partitura que você quer. Ou escreva a sua em *Trazer sua própria partitura*.
- A verificação sob a partitura a lê enquanto você digita: ✓ com o tom, o andamento, o compasso, os compassos, a duração e as seções, uma tabela para cada voz e a linha **Ins : Vocal**; ou ✗ com o que está errado e onde: `group 3, Ins, bar 9: duration 15/4 quarter notes != meter duration 4`.
- **Tom** move a partitura inteira (para o mais perto, para cima ou para baixo); *Mover* move só o Vocal ou só o Ins, por graus da escala.
- **MIDI** de saída para uma DAW (uma faixa por voz, as seções como marcadores), e de entrada de uma (uma linha melódica por voz); **Marcadores**: as seções com os segundos, como CSV.
- *Escrevê-la a partir do som* e *Transcrever este take*: o SheetSage2 ouve uma gravação e escreve a melodia e os acordes dela neste dialeto (com os acordes, ou só a melodia, como você escolher em *Cover ou remix*).
- *Pôr a letra nesta partitura…*: os seus versos nos compassos da partitura; a próxima aba conta como isso surgiu.
- A partitura do take como pauta, em tela cheia, impressa em PDF: Criador › A partitura.

### Quando a verificação diz não <!-- #when-the-check-says-no -->

| ela diz | quer dizer | faça |
|---|---|---|
| `duration … != meter duration …` | um compasso não fecha a conta | conte as unidades: 16 em 4/4 com `L:1/16` |
| `unsupported duration 5` | uma duração fora de 1 2 3 4 6 8 12 16 24 32 48 | ligue duas: `F4-F` |
| `voices have different measure counts` | Vocal e Ins têm números diferentes de compassos num grupo | dê compassos `Z` ao mais curto |
| `Native chord symbols belong in Vocal, not Ins` | um acorde no Ins | mova-o para o Vocal, mesmo compasso |
| `unresolved tie at end of score` | a última nota está ligada a nada | tire o `-` dela |
| `tie changes pitch` | uma ligadura entre duas alturas | ligue uma altura só a ela mesma |
| `Unsupported key` | um tom fora da lista | o mesmo tom como a lista o escreve: `Eb`, não `D#` |
| `expected 1–4 measures` | uma linha de mais de quatro compassos | divida o grupo em dois |
| `Preserve native Vocal and Ins voice definitions` | o cabeçalho foi mudado | as oito linhas como acima |

## Vozes numa partitura <!-- #voices -->

Como o promo do estúdio ganhou o seu som: um narrador dizendo os versos do promo sobre uma base musical, vozes de mulheres cantando entre os versos, cada verso perto do momento de que a cena precisava, tudo num take só. O caminho serve para qualquer palavra falada, leitura ou rap sobre uma base; *Pôr a letra nesta partitura…* faz a parte do meio por você.

### A base e o seu relógio <!-- #the-bed-and-its-clock -->

- Primeiro a música sem palavras: takes no estilo da base (para o promo um trailer épico, D#m, 103 BPM, 128 s), até um soar certo.
- Depois *Escrevê-la a partir do som* nele: o SheetSage2 escreve a partitura própria da base, os acordes e os compassos. Essa partitura é o relógio: a 103 BPM em 4/4 um compasso dura 2,33 s e uma semicolcheia 0,146 s, então enquanto o compasso não muda, o compasso n começa em n × 2,33 s.
- Cantada no Plano completo sobre essa partitura, a canção nova mantém esse relógio: os mesmos acordes nos mesmos compassos, e as palavras onde a partitura as põe.

### Um verso nos seus compassos <!-- #a-line-on-its-bars -->

- Cada verso tinha um momento para ser dito: a sua cena. Ele vai para o compasso que começa mais perto desse momento; se o verso anterior ainda soa ali, para o próximo compasso livre.
- O verso vira notas: uma sílaba por colcheia numa nota do acorde do seu compasso, o nome tônico uma semínima mais agudo, um respiro depois de uma vírgula (uma colcheia) e depois de um ponto (uma semínima), a última sílaba do verso uma semínima e mais grave. Um narrador quer poucas alturas: as notas do acorde bastam, e os acordes vêm da base.
- No primeiro compasso do verso a partitura recebe o comentário de seção e a letra a mesma tag: `% verse` ali, `[Verse]` aqui. Um verso, uma seção: o plano e a letra se encontram um a um, e nada fica de fora.
- Palavras que o modelo acentua errado recebem as marcas do Viktor: um agudo na vogal tônica (обе́щано), o nome escrito como soa (рУ́ах em russo, רוּ-אַח em inglês).

### Duas vozes num take <!-- #two-voices-in-one-take -->

- O narrador e as mulheres são um take só, não uma mixagem. O estilo nomeia os dois: `male baritone narrator, spoken word, clear English diction, female a cappella vocalise, oooh aaah, epic cinematic trailer`, e o andamento, `103 bpm`.
- A letra dá cada verso e depois dele, entre parênteses, o vocalise: `(Ooh, aah)`. Nos takes do promo, as mulheres o cantaram.
- A partitura dá ao vocalise as suas próprias notas nos compassos entre os versos: uma mínima na nota aguda do acorde, depois o resto do compasso na sua nota de recitação, duas oitavas acima das notas do narrador. O vocalise da própria base fica no fim: a outro mantém os compassos da base, com notas e tudo.
- Um adaptador de voz pode dar uma voz ao narrador; mantenha-o baixo (0.45 na metade música e 0.3 na metade som bastaram), senão ele toma conta da música.

### Muitos takes, depois o melhor <!-- #many-takes-then-the-best -->

- Seis sementes por idioma, Plano completo, orientação 1.6, a duração fixada nos 128 s da base, a partitura e a letra como feitas. Cada take diz os versos um pouco diferente: um cai mais perto, outro fala mais claro.
- Onde os versos estão de verdade: Lapidador › Letra › *Sincronizar as linhas* dá o tempo do Whisper para cada verso, palavra por palavra. Os próprios segmentos do Whisper são grossos demais para isso: um segmento muitas vezes começa no vocalise antes de um verso.
- Compare o tempo de cada verso com o seu compasso: no melhor take do promo, 7 de 11 versos começaram a até 1,5 s do seu compasso (1,7 s em média, o mais distante a 7,5 s); os outros takes se desviaram mais. A partitura conduz a voz, não a prende.
- Ordene-os: primeiro os versos a até 1,5 s, depois os versos ouvidos, depois a distância média; ouça os primeiros.

### O anel duplo <!-- #the-double-ring -->

- A palavra do Viktor: acerte primeiro as faixas, depois encaixe o filme nelas, mesmo que as durações sejam diferentes. Então a imagem segue o take: uma cena aparece logo antes do seu verso, uma legenda enquanto as palavras são ditas, e o cartão final dura até o último segundo do take.
- Um verso não precisa cair no seu compasso com precisão de décimo de segundo, então: o filme vai até ele. O mesmo vale sem filme: uma leitura no ritmo de slides, um rap nas seções de uma batida.

### No estúdio agora <!-- #in-the-studio-now -->

- *Pôr a letra nesta partitura…* (Criador › Covers, remixes e a sua própria partitura) faz a parte dos versos nos compassos para qualquer partitura do formulário: as suas seções, uma sílaba por colcheia nas notas do acorde, os respiros, uma intro e uma outro, o vocalise quando você marca.
- *Sincronizar as linhas* (Lapidador › Letra) dá o tempo de cada verso; *Terminar em…* termina um take depois do último verso.
- Ainda não no estúdio: cada verso num segundo que você escolhe (os momentos das cenas do promo) e a ordenação dos takes por distância. O promo fez isso com scripts próprios.

## Atalhos e truques <!-- #shortcuts -->

**No Bibliotecário:** **Ctrl+A** marca todos os takes mostrados, **Esc** nenhum, **Delete** manda os marcados para a lixeira (pergunta antes), **Ctrl+Z** devolve a última mudança (uma movimentação, um espaço, uma ocultação, um fixar, marcas, a lixeira); a pílula acima do player tem o mesmo Desfazer por dez segundos.

### Teclas <!-- #keys -->

| tecla | onde | o que faz |
|---|---|---|
| **Espaço** | em qualquer lugar menos num campo de texto | toca ou pausa o take em mãos |
| **←** **→** (com **Shift**: 30 s) | em qualquer lugar menos num campo de texto ou num menu | 5 segundos para trás ou para frente |
| **M** | em qualquer lugar menos num campo de texto | som desligado e ligado |
| as teclas de mídia | o teclado, um fone, o painel de mídia da área de trabalho | tocar, pausar, anterior, próximo |
| **Ctrl+Alt+1** … **9** | em qualquer lugar | **1** Criador, **2** Escritor, **3** Lapidador, **4** Pintor, **5** Bibliotecário, **7** Treinador, **8** para a sua DAW, **9** o Motor; **6** fica guardado para uma sala que virá (Ctrl+1…9 são as abas do navegador) |
| **Esc** | em qualquer lugar | fecha o que está aberto: um menu, um diálogo, o guia, uma vista em tela cheia, a sala do Motor |
| **F1** (ou **Shift+F1**) | em qualquer lugar | este guia, na sala em que você está; de novo para fechá-lo (a ajuda do próprio navegador não aparece) |
| **Shift+Tab** | o Criador | a tecla dos quadros, não o caminho de volta entre os campos: um quadro destacado passa para o outro, nenhum destacado destaca o do formulário (Compor); um diálogo, um menu e a barra de busca mantêm o seu próprio Shift+Tab |
| **F5**, **Ctrl+R**, **Ctrl+Shift+R** | em qualquer lugar menos no Bibliotecário | depois de qualquer coisa digitada (desde que a página chegou ou desde **Ctrl+S**) perguntam antes, senão recarregam na hora; ao perguntar, dizem o que um recarregamento leva e o que mantém; com uma canção no formulário, *Salvar no Escritor, depois recarregar* a guarda lá também; **Ctrl+F5** recarrega na hora (no Bibliotecário **F5** lê a biblioteca de novo) |
| **Enter** / **Esc** | um diálogo, uma renomeação no lugar, o valor digitado de uma LoRA | manter / cancelar; num diálogo de texto longo **Shift+Enter** é uma linha nova |
| **Enter** | *Começar de uma ideia* | o modelo de chat esboça a canção; **Shift+Enter** é uma linha nova |
| **Ctrl+S**, **Ctrl+Shift+S** | em todo lugar | guarda tudo agora: a canção do formulário, o documento aberto do Escritor, as configurações (nunca o Salvar página do navegador) |
| **Ctrl+N** | em todo lugar, na janela do Pinokio | Canção nova no Criador (pergunta antes quando o formulário tem palavras); um navegador guarda Ctrl+N para a sua própria janela nova |
| **Alt+K** · **Alt+J** | a letra, do Criador e do Escritor | marca a linha do cursor ou desmarca · vai para a próxima marca (**Alt+Shift+J** a anterior, **Alt+Shift+K** apaga todas) |
| **Alt+E** | o Criador | levanta a letra sobre tudo e a devolve; **Shift+Tab** sobre ela a coloca no formulário destacado |
| **Alt+O** · **Alt+L** · **Ctrl+Y** · **Alt+↑ ↓** | a letra, como no mcedit | limpa as marcas · vai a uma linha pelo número · apaga a linha · move a linha (ou as linhas selecionadas) |
| **Ctrl+F** · **F4**, **Ctrl+H** | a letra, o estilo, as caixas do Escritor | busca só naquela caixa · busca e substitui (**Enter** a ocorrência em mãos, **Ctrl+Enter** todas; **Alt+C** maiúsculas como digitadas) |
| **↑ ↓** · **→** · **←** | um menu | mover · abrir um submenu · sair dele |
| **setas** | o seletor de tema | mover entre os temas |
| **+** **−** **0** | uma pauta ou um espectro em tela cheia | aproximar, afastar, voltar ao ajuste; **Ctrl+roda** aproxima onde está o ponteiro |
| **← →** (com **Shift**: passos maiores) · **Home** | a borda de uma coluna, em foco | a coluna mais estreita ou mais larga · a sua própria largura de novo |
| **Enter** ou **Espaço** | o cartão de um treino no Treinador LoRA | abre o treino |

### O mouse <!-- #the-mouse -->

- **Clique com o botão direito** num take em qualquer lugar (a lista de takes, um cartão, um take fixado) para o seu menu; clique com o botão direito num espaço para os seus bloqueios, renomear e apagar.
- **Clique duplo**: um take na lista de takes o toca; o nome de um espaço o renomeia; a borda de uma coluna lhe devolve a sua própria largura; a pauta ou o espectro abre em tela cheia; o valor de uma LoRA deixa você digitá-lo exato.
- **No Bibliotecário, como num gerenciador de arquivos**: com um cartão marcado, um clique em qualquer lugar de outro o marca também; **Shift**+clique marca todo o intervalo; arrastar no espaço vazio entre os cartões desenha uma faixa que marca o que ela toca; **Ctrl**+arrastar a desenha de qualquer lugar e inverte o que ela cruza: cartões desmarcados ficam marcados, marcados ficam desmarcados. A página rola quando a faixa chega a uma borda.
- **Marcas para muitos**: com vários marcados, 👍, 👎 ou ★ em qualquer um deles (ou na barra dos marcados) marca todos; quando todos já têm essa marca, ela é retirada. Tirar vários de um espaço pergunta antes; a lixeira sempre pergunta.
- **Passe o ponteiro** sobre um nome de espaço cortado: ele aparece inteiro, sobre a grade.
- **A velocidade** no player (0.5× a 2×) mantém a altura: desacelere para ouvir um detalhe, acelere para passar por cima.

### Pequenos truques <!-- #small-tricks -->

- Mantenha a **semente musical** e mude a **semente sonora**: a mesma canção, renderizada de novo.
- Ouça um instrumento em **várias sementes** antes de julgá-lo: o YuE2 o traz quando a semente e a canção deixam.
- **Fixe** os takes aos quais você sempre volta (quatro em cada espaço); **Fixados** à esquerda lista todos.
- **⋯** num cartão é o seu menu do botão direito, para um touchpad.

## Dicas <!-- #tips -->

### Quando algo dá errado <!-- #when-something-goes-wrong -->

| o que você vê | o que é | o que fazer |
|---|---|---|
| *Babel na partitura* | a metade música escreveu lixo como partitura | as forças no verde, menos adaptadores na metade música, ou Direto |
| o cantor fala por cima de um loop | um adaptador de partitura instrumental forte demais para uma canção cantada | mantenha-o em 0.3–0.5 |
| *A GPU0 está treinando…* | um treino roda na placa do próprio estúdio | espere, pare o treino, ou dê outra placa ao treino (Motor → GPUs) |
| a página diz que o servidor está indisponível | o estúdio reiniciou | espere alguns segundos; recarregue a página (F5) depois de uma atualização |
| um take soa metálico nos agudos | o zumbido de 25 quadros do VAE | Lapidador → Antizumbido a 80 % |
| a letra se afasta do texto | a metade música perdeu as palavras | Lapidador → Checagem da letra; *Regenerar a partir de…* o minuto em que desandou |
| o instrumento que você pediu não está lá | o YuE2 decide quando um instrumento entra, e a semente decide muito | o mesmo prompt com uma **semente musical aleatória**; ouça vários takes antes de julgar |
| o instrumento toca, mas não como o real | o que o YuE2 sabe dele | uma LoRA de instrumento (Treinador LoRA) |

### Bons hábitos <!-- #good-habits -->

- Mantenha a **semente musical** quando uma canção está certa e mude só a **semente sonora** para ouvir o seu som de novo.
- Anote o que funciona na **Nota** de cada take: na semana que vem você não vai lembrar qual semente era.
- Dê a cada projeto o seu **espaço**, e bloqueie os terminados.
- Treine com o que você quer ouvir: o adaptador aprende o som do conjunto, com os defeitos.
