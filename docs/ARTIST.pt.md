# O Pintor a fundo

[English](ARTIST.md) · [Русский](ARTIST.ru.md) · [Українська](ARTIST.uk.md) · [Беларуская](ARTIST.be.md) · [Ελληνικά](ARTIST.el.md) · [Español](ARTIST.es.md) · [Italiano](ARTIST.it.md) · [Français](ARTIST.fr.md) · **Português** · [Deutsch](ARTIST.de.md) · [日本語](ARTIST.ja.md) · [中文](ARTIST.zh.md)

O Pintor é a sala do Ruach Studio para imagens: uma capa para cada take, um 16:9 para o seu vídeo, um 9:16 para um short. O guia dentro do estúdio (F1 no Pintor) diz em poucas linhas o que faz cada controle; este documento vai até o fundo: cada controle, como ele é feito por dentro, as receitas que funcionam, o que dá errado e por quê, e os números medidos numa RTX 3090. Tudo aqui está no estúdio como ele está; o que ainda vem é dito no fim.

## Sumário

1. [Para que serve o Pintor](#1-para-que-serve-o-pintor)
2. [Uma primeira capa em seis passos](#2-uma-primeira-capa-em-seis-passos)
3. [Como escrever um prompt](#3-como-escrever-um-prompt)
4. [Os pintores](#4-os-pintores)
5. [Como corre uma execução](#5-como-corre-uma-execução)
6. [Lightning](#6-lightning)
7. [Amostradores e agendas](#7-amostradores-e-agendas)
8. [Adaptadores (LoRA)](#8-adaptadores-lora)
9. [Regiões](#9-regiões)
10. [Letreiro](#10-letreiro)
11. [Uma imagem de onde pintar](#11-uma-imagem-de-onde-pintar)
12. [A segunda passada](#12-a-segunda-passada)
13. [Upscale](#13-upscale)
14. [O palco, a biblioteca e a lixeira](#14-o-palco-a-biblioteca-e-a-lixeira)
15. [Capas para takes](#15-capas-para-takes)
16. [Receitas](#16-receitas)
17. [Quando algo dá errado](#17-quando-algo-dá-errado)
18. [Os números](#18-os-números)
19. [Para scripts e agentes](#19-para-scripts-e-agentes)
20. [Licenças](#20-licenças)
21. [O que vem depois](#21-o-que-vem-depois)

## 1. Para que serve o Pintor

Uma canção precisa de imagens: o quadrado no seu card e no seu MP3, um quadro largo para o seu vídeo, um alto para um short. O Pintor as pinta na sua própria placa de vídeo, a partir das suas palavras, de uma imagem sua ou de ambas, e guarda cada execução com o seu prompt, a sua semente e os seus ajustes, para que uma imagem de que você gostou possa ser pintada de novo ou levada adiante.

A sala tem três colunas. À esquerda o formulário: o prompt e cada controle que dá forma à pintura. No meio o palco: a execução que está sendo pintada se revela ali passo a passo, ou ali fica a imagem que você escolheu, com os seus botões embaixo e os dados da sua execução numa dica ao lado. À direita a biblioteca: cada execução, ou todas as imagens numa galeria, ou a lixeira. Arraste as bordas entre as colunas para alargar uma (← → no teclado; um clique duplo lhe devolve a própria largura). A partir de uma janela de 920 px de altura a sala fica inteira: a página fica parada, o formulário e a biblioteca rolam por conta própria, e a linha de Desenhar fica ao pé do formulário.

## 2. Uma primeira capa em seis passos

1. Escolha um take à direita do estúdio (a lista do Criador ou do Bibliotecário): a imagem que você definir como capa vai para ele.
2. No Pintor, aperte **Do take** para ter um prompt de partida, ou escreva o seu (seção 3).
3. Deixe **Formatos** em **1:1**, ponha **Variações** em 4 e mantenha o pincel que o estúdio escolheu (Qwen-Image 2512 Q4 com ⚡ Lightning na maioria das placas).
4. Aperte **Desenhar** (Ctrl+Enter). Veja as imagens se revelarem no palco; cerca de meio minuto cada numa 3090.
5. Clique na que você gostou; **Definir como capa** faz dela a capa do take: no seu card, no player e no seu MP3.
6. Gostou, mas quer mais fina? **Segunda passada… ×2** (seção 12), depois **Upscale… 4K** (seção 13).

## 3. Como escrever um prompt

Qwen-Image lê um prompt como uma descrição, não como uma lista de tags: escreva frases. Ponha primeiro o que está na imagem (quem ou o quê, onde, fazendo o quê), depois a luz (crepúsculo, luz de vela, uma manhã cinzenta), as cores e a técnica (uma pintura a óleo com pinceladas grossas, um desenho a nanquim, uma fotografia 35 mm). Termine com *no text* quando não quiser letras: o Qwen-Image gosta de letrar uma capa por conta própria.

Palavras que funcionam bem: o tema dito com clareza (*a red fox sitting in the snow*), a composição (*seen from below*, *in the left third*, *a wide empty sky above*), o material (*oil on canvas*, *gouache*, *woodcut*), a direção e a cor da luz. Palavras que fazem pouco: listas de tags de qualidade (*masterpiece, 8k, best quality*) pertencem a modelos mais antigos e só ocupam espaço.

**Do take** põe no prompt aquele do qual saiu a capa própria do take, ou um feito com o seu título e o seu estilo, como ponto de partida. Cada execução guarda o seu prompt; **Para o formulário** em qualquer imagem traz de volta o seu prompt, a sua semente e o seu formato, e **Tudo para o formulário** (no seu menu) traz também o seu pintor, o fine-tune, a amostragem e os adaptadores, para que Desenhar pinte de novo exatamente aquela imagem.

## 4. Os pintores

| pintor | licença | o que pede à placa | uma imagem numa 3090 | para |
|---|---|---|---|---|
| **Qwen-Image 2512 Q4** | Apache-2.0 | 15,5 GB | cerca de 30 s com Lightning | o Qwen de uma placa de 16 GB |
| **Qwen-Image 2512 Q6** | Apache-2.0 | 20 GB | cerca de 32 s com Lightning | rascunhos mais finos |
| **Fine-tune fp8 do Qwen-Image 2512** | a do próprio fine-tune | 22,5 GB | cerca de 37 s com Lightning, minutos sem | realismo acabado |
| **Qwen-Image 2512 fp8 BASE** | Apache-2.0 | 22,5 GB | 8 passos com Lightning, como os GGUF | o próprio 2512 em fp8 |
| **Qwen-Image 2.1** | Qwen Research Licence | 21 GB (em fluxo com menos) | cerca de dois minutos | edição por palavras, referência de estilo |

**Os pincéis do Pintor** são uma só lista de cada modelo e arquivo aqui, por grupos: Qwen-Image 2512 de um GGUF (Q4, Q6), cada arquivo fp8 em `artwork/Qwen-Image-2512/checkpoints/` (o BASE do próprio 2512 e os fine-tunes) e Qwen-Image 2.1. **⚡ Lightning** marca um pincel que pinta com ele por padrão; um fine-tune vem marcado como tal. Um arquivo colocado em `checkpoints/` vira um pincel próprio quando a sala relê a lista (após um download ou ao recarregar a página). O Krea 2 Muse saiu do estúdio em outubro de 2026: o Qwen-Image 2512 segue melhor as palavras e letra bem um título.

**Qwen-Image 2512** é o pintor maior: realismo mais fino, lê bem prompts longos, desenha as letras certas quando você pede. Vem como GGUF em Q4 ou Q6, ou como **fine-tune fp8**: os arquivos únicos do ComfyUI postos em `artwork/Qwen-Image-2512/checkpoints/` cada um um pincel próprio (Jib Mix Qwen, IntoRealism Qwen, Real-Qwen-Image e o próprio 2512 se baixam em **Baixar pintores e adaptadores…**, 20,4 GB cada). O BASE do próprio 2512 pinta com Lightning como os GGUF; um fine-tune, sem ele, a menos que você o ligue. Um arquivo fp8 é lido em bf16, fica na placa no seu próprio fp8, e cada camada calcula em bf16 enquanto roda; os adaptadores sobre ele mantêm as suas camadas em bf16.

**Qwen-Image 2.1** lê imagens além de palavras (o seu codificador de texto é o Qwen3-VL): edita uma imagem segundo as palavras do prompt, ou pinta a cena do prompt no estilo de uma imagem (seção 11). Está sob a Qwen Research Licence: só pesquisa e avaliação, não para uma capa que você vende; a sala diz isso sob o pintor na cor dos avisos.

Cada pintor só aparece quando os seus arquivos estão aqui; os que faltam são nomeados sob o pintor, e **Motor → Modelos e LoRAs** os baixa, perguntando antes por cada um com o seu tamanho (o 2.1 também com a sua licença). De um terminal: `heresy/fetch-heresy.sh --qwen 2512-q4`.

**O codificador de texto** do Qwen-Image 2512 (Qwen2.5-VL-7B, cerca de 15,5 GB) lê o prompt na placa quando o espaço livre ali o comporta, senão no processador, e vai embora antes de o pintor chegar: a imagem é a mesma de um jeito ou de outro, o processador só é mais lento.

## 5. Como corre uma execução

**A fila.** Um aperto em Desenhar é uma execução: um prompt, os seus formatos, as suas variações. Ela espera na fila do laboratório uma placa com espaço, como as capas dos takes, os stems e os upscales; enquanto espera, **Fora da fila** a retira, e **Parar** ao lado de Desenhar encerra uma execução que pinta (as imagens que ela terminou ficam). Duas execuções podem estar de pé ao mesmo tempo: uma pintando, a próxima esperando atrás.

**Qual placa.** Os trabalhos do laboratório ficam nas placas que lhes foram dadas em **Motor → GPUs** (a placa própria do estúdio nunca é tomada por acaso). Uma placa que nada mais usa toma uma execução cuja necessidade cabe na sua memória menos 512 MiB (a parte própria do runtime CUDA); uma placa em uso a toma quando a sua memória livre comporta a necessidade; uma placa com limite de VRAM conta o seu limite como teto. A necessidade é a do próprio pintor mais o tamanho dos seus adaptadores, e 6 GB a mais para uma segunda passada ×2.

**Quando nenhuma placa o comporta inteiro**, o Qwen-Image 2512 traz os seus blocos em fluxo da RAM: os blocos que cabem ficam na placa, o resto vem conforme é preciso (o group offloading do diffusers sobre um stream CUDA: um bloco chega enquanto o anterior calcula), e a imagem é a mesma, mais lenta no que o barramento não consegue esconder. Com todos os blocos em fluxo, ele toma 2,3 GB da placa (1328², Lightning, quatro adaptadores), então uma placa de 6 GB o pinta, com cerca de 30 GB de RAM. O Qwen-Image 2.1 traz em fluxo tanto o seu transformer (bloco a bloco) quanto o seu codificador de texto (camada a camada): sob um limite de 15,5 GB ele pintou a partir de palavras com 4,1 GB no pico e editou com 7,9 GB, em mais ou menos o mesmo tempo que inteiro. Um pintor que não pode ir em fluxo e não cabe em nenhuma placa é recusado na hora, com os números e o pintor que caberia.

**Várias placas.** Uma execução com várias imagens é repartida entre as placas do laboratório que tenham espaço e RAM suficiente para mais um pintor (três formatos em duas placas: o primeiro e o terceiro numa, o segundo na outra), cada placa pintando a sua parte com as sementes próprias da execução: as imagens são as mesmas bit a bit que numa placa.

**Um pintor guardado.** Depois de uma execução o seu pintor volta para a RAM e a sua placa fica livre de novo; uma execução seguinte do mesmo pintor, do mesmo fine-tune e dos mesmos adaptadores na mesma ordem pinta na hora, sem o minuto ou dois de carregamento. Um pintor guardado é solto depois de dez minutos parado, quando a RAM é necessária para outro, ou por **Descarregar** na Barra (que solta tudo o que o estúdio segura nas suas placas).

**Dentro de uma execução**: o prompt é lido uma vez pelo codificador de texto; cada imagem é desenhada no tamanho próprio do pintor e guardada no da sala (o Qwen-Image desenha em 1328², 1664 × 928 e 928 × 1664 e leva cada uma a 1280², 1920 × 1080 e 1080 × 1920); o decodificador trabalha em blocos, então o seu pico fica baixo.

**Prévia ao vivo** (ligada por padrão): os latentes de cada passo viram uma imagem de um oitavo do tamanho sem o decodificador (com os fatores de cor próprios do espaço latente, como o InvokeAI os carrega), então não custa nada; uma barra no alto do palco acompanha a execução, imagem a imagem e passo a passo.

**O filtro de conteúdo**: cada imagem passa por um filtro de conteúdo (nsfw_image_detection da Falconsai, Apache-2.0), a regra do estúdio para todo pintor: uma que ele marca não é guardada, e a execução diz isso.

**No disco**: cada execução é uma pasta em `artist/` do estúdio: `ask.json` (o que foi pedido), `run.json` (escrito imagem a imagem), as imagens `NN-SHAPE-sSEED.png`, as suas `thumbs/`, e uma referência ou uma máscara ao lado quando a execução tinha. Um vigia para um pintor calado por tempo demais (dez minutos enquanto carrega, cinco depois que pinta), e uma execução que o laboratório perdeu num reinício diz isso em vez de pintar para sempre.

## 6. Lightning

**O que é**: um adaptador (lightx2v, Apache-2.0) que ensina o Qwen-Image 2512 a pintar em poucos passos sem orientação: o longo caminho orientado próprio do modelo destilado em 8 passos. O seu arquivo mora em `artwork/Qwen-Image-2512/lightning/` e vem com o download dos pintores Qwen.

**Como o estúdio o põe**: com o Lightning ligado, o pintor o carrega como mais um adaptador sob os seus, em **1.0** para os GGUF Q4 e Q6 e o fp8 BASE do próprio 2512 (a base da qual foi destilado, 8 passos) e em **0.55** para um fine-tune fp8 com 12 passos (um fine-tune se afastou da base, e o Lightning em força total o puxaria de volta). A agenda passa a ser a própria do Lightning (um deslocamento de log 3 em qualquer tamanho), e a orientação se desliga: uma passada do modelo por passo.

**Com ele desligado**, o 2512 pinta do seu jeito: 30 passos por padrão (de 10 a 60) e **Orientação** 4 (CFG de verdade contra um negativo vazio: duas passadas por passo). Sessenta passadas contra oito: cerca de sete vezes a pintura, e o detalhe e a luz do realismo acabado.

**A regra por trás dos padrões**: Lightning para rascunhos e capas, não para realismo profissional. Os pintores GGUF e o fp8 BASE do próprio 2512 pintam com ele; um fine-tune fp8 pinta sem ele a menos que você o ligue; a capa própria de um take é pintada com ele.

## 7. Amostradores e agendas

**Amostragem**, sob o pintor, recolhida, os seus valores no resumo: os passos, o amostrador e a agenda (e para o 2512, Lightning e Orientação), guardados para cada pintor; **Redefinir** devolve os do pintor. O Qwen-Image 2512 com Lightning toma de 4 a 16 passos; sem ele, como o Qwen-Image 2.1, de 10 a 60.

O modelo diz a cada passo para que lado está a imagem; o **amostrador** decide como chegar lá:

- **Euler**: uma passada por passo, o passo simples, a referência (e aquele com que o Lightning foi destilado).
- **Euler SDE**: Euler com um pouco de ruído fresco a cada passo: mais grão, um pouco menos fiel.
- **ER-SDE**: um resolvedor estocástico de terceira ordem, uma passada por passo, os dois passos anteriores guardados: mais fino que o Euler no mesmo tempo.
- **RES 2s**, **RES 3s**: os métodos de passo único do resolvedor exponencial refinado, duas e três passadas por passo, metade do ruído reposta depois de cada uma; os seus gêmeos **ODE** não repõem nada, então uma semente pinta uma imagem, a mais próxima do caminho exato.
- **Heun++**: três passadas por passo onde pode, duas, depois uma no fim.
- **Exponential Heun** (e o seu SDE): um método exponencial de segunda ordem, duas passadas por passo.

Um amostrador de duas ou três passadas por passo custa duas ou três vezes o tempo do Euler. Contra o caminho exato de um fluxo de brinquedo em 8 passos eles se ordenam como dizem as suas ordens: Euler 0,138, Heun++ 0,111, exponential Heun 0,084, RES 2s 0,058, RES 3s 0,046 (o erro: mais baixo é mais perto).

A **agenda** diz onde os passos são gastos entre todo o ruído e nenhum: **Simple** (por igual no tempo próprio do pintor), **Karras** e **Exponential** (mais passos com pouco ruído, para o detalhe), **Beta** e **Beta 57** (densos nas duas pontas), **KL optimal** (o espaçamento do Align Your Steps), **SGM uniform** (uniforme no tempo, o último passo descartado), **Bong tangent** (duas inclinações de arco tangente, de todo o ruído até a metade e da metade até nada).

**O que funciona, de duas matrizes de 54 imagens** (um prompt, uma semente, cada par):

| pintor | bom | evitar |
|---|---|---|
| Qwen-Image 2512 com Lightning | Simple, Beta, Beta 57, SGM uniform, Bong tangent | Karras, Exponential, KL optimal (podem pintar o tema duas vezes) |
| Qwen-Image 2512 sem Lightning | Euler, ER-SDE, RES 2s / 3s | Euler SDE (suave e enevoado) |

O formulário diz os dois avisos quando se aplicam. Os amostradores foram escritos para o estúdio a partir dos seus artigos e das fórmulas do ComfyUI; o RES4LYF foi lido só pela sua matemática (a sua licença proíbe serviços comerciais), e o Heun++ é do Carzit (MIT).

## 8. Adaptadores (LoRA)

**Onde moram**: `artwork/loras/<família>/`, a família a do pintor: `krea2`, `qwen-image-2512`, `qwen-image-2.1`. As pastas dentro viram grupos na biblioteca; uma imagem ao lado de um arquivo com o nome dele (`NAME.jpg`, `NAME.png`, `NAME.preview.png`) aparece no seu card; o que o LoRA Manager do ComfyUI (`NAME.metadata.json`) ou o Stability Matrix (`NAME.cm-info.json`) escreveram ao lado de um arquivo também é lido.

**A lista e a execução**: até oito adaptadores na lista sob o pintor, até quatro ativos numa execução; cada um na sua força (o controle deslizante de 0 a 1,5); um clique direito **silencia** um (ele fica na lista e sai da execução), e um adaptador em zero também não é carregado. As suas palavras-gatilho aparecem embaixo, e um clique numa a põe no prompt (uma execução também adiciona sozinha as palavras-gatilho de um adaptador ativo).

**Civitai**: **Consultar no Civitai** envia o SHA-256 de cada arquivo e nada mais, e guarda a resposta ao lado (`NAME.civitai.info`: o seu nome, o modelo base e as palavras-gatilho, e a sua primeira imagem classificada como segura quando não tem uma própria). **Do Civitai…** baixa um adaptador cujo autor não deixa compartilhá-lo, do próprio Civitai, com a sua própria chave: um link, um id de versão ou um AIR é lido, a família que serve ao seu modelo base é dita, e só um LORA, LoCon ou DoRA em `.safetensors` é aceito, o seu SHA-256 conferido com o do Civitai antes de virar o arquivo. A sua chave vai só para o Civitai. Os adaptadores que os autores deixam compartilhar vêm de **Baixar pintores e adaptadores…**.

**Juntos**: a partir de dois adaptadores, uma barra embaixo deles dá a soma das suas forças na estrada do Criador: verde até 1,2, âmbar até 1,8, vermelho além disso. Adaptadores empilhados se somam, e passando de cerca de 1,8 uma imagem queima (cores e bordas forçadas) por mais modesto que cada um seja. Arraste a barra para movê-los todos de uma vez, cada um em proporção.

**Força ao longo dos passos** (⏱ ao lado de um adaptador): quadros-chave como os têm os hooks de LoRA do ComfyUI, uma parte dos passos e um multiplicador: `0%:1, 50%:1, 60%:0` mantém o adaptador inteiro por metade dos passos e o solta até 60 %. Até oito quadros-chave, o multiplicador de 0 a 2, retas entre eles. Um adaptador que molda cedo a composição e um adaptador de estilo que só deve tocar o acabamento são os dois usos.

**Por dentro**: os adaptadores vão para o transformer do pintor antes de ele pintar (PEFT), cada um na sua força; um arquivo kohya (`lora_unet_blocks_0_…`) é renomeado para os nomes de camada próprios do pintor; um adaptador que não alcança nenhuma camada do pintor (feito para outro modelo) para a execução e diz isso. Um pintor guardado toma as forças de uma execução seguinte sem recarregar os seus adaptadores.

## 9. Regiões

**Regiões**, sob Amostragem, recolhidas: até três partes do quadro, cada uma com um lugar e palavras próprias. Os lugares: a metade esquerda, direita, de cima ou de baixo; o terço esquerdo, do meio ou direito; os quatro quartos; o meio. Um pequeno mapa ao lado de cada linha mostra onde ela fica.

**Como pinta**: a cada passo o pintor é consultado mais uma vez para cada região, com o prompt principal e as palavras da região, e as suas respostas se misturam pelas caixas das regiões como pesos de bordas suaves (uma borda de um vinte e cinco avos do lado menor), divididos onde as caixas se sobrepõem; o resto do quadro segue só o prompt principal. É o caminho do Latent Couple: não precisa de nada do modelo, e a cena continua uma cena porque o prompt de cada região leva o principal.

**Como escrevê-las**: o prompt principal diz a cena inteira, uma região o que está nela. *Two animals sitting in a snowy forest clearing at dawn, oil painting*; metade esquerda *a red fox sitting in the snow*; metade direita *a white snowy owl perched on a stump*. Numa semente, o Qwen-Image 2512 pintou dois ursos sem as regiões e a raposa e a coruja com elas.

**O que custa**: uma passada inteira a mais por passo para cada região (numa 3090 em 16:9: Qwen-Image 2512 fp8 141 s sozinho, 281 s com duas regiões). A estimativa de tempo do formulário as conta.

As regiões ficam guardadas neste navegador; uma região sem palavras não é enviada; **De novo** pinta com as da própria execução. Para o Qwen-Image 2512; o Qwen-Image 2.1 edita por palavras e pinta sem elas.

## 10. Letreiro

**Letreiro**, sob Regiões, recolhido: um título, e uma segunda linha embaixo, letrados como parte da pintura em vez de postos por cima como uma camada que fica à parte da imagem. As suas palavras vão em campos próprios, nunca no prompt, e o estúdio escreve o que o pintor lê. Dois jeitos, escolhidos sob **Como**:

- **Pintado com a imagem** (Qwen-Image 2512 ou 2.1): o estúdio acrescenta uma frase ao prompt: onde, o título entre aspas, como as letras são, a segunda linha menor embaixo, e depois *painted in the same technique and light as the picture. No other text.* Um prompt de um parágrafo a recebe no fim; um prompt escrito em parágrafos a recebe como parágrafo próprio, *TEXT RENDERING:*, segundo, depois do primeiro: no fim de um prompt longo ela se afoga (o prompt de Fosforida do Viktor, 3.200 caracteres em dez parágrafos, pintou assim três imagens sem uma letra). O prompt de um take pede nenhum texto (*No text, no letters.*): essa frase sai primeiro.
- **Na imagem de referência** (Qwen-Image 2.1): uma imagem pronta letrada por palavras, o resto mantido. A ordem é escrita só a partir dos campos, então o prompt pode ficar vazio. **Letrear**, no palco ou no menu de uma imagem, faz dessa imagem a referência, ajusta Como e abre o bloco com o título na mão.

**Os campos**: **Título** (60 caracteres); **Segunda linha** (80: o artista, o álbum; vazia para nenhuma); **As letras** (400, como elas são em palavras, tão longo quanto um parágrafo de tipografia de um prompt; vazio: *large elegant classical serif capitals in warm gold, with even letter spacing*); **Onde** (em cima, no meio, embaixo). **O título da tomada** preenche o título a partir do take escolhido à direita. O bloco fica guardado neste navegador; **De novo** letra com as palavras da própria execução; a linha da execução guarda a frase que o pintor leu.

**Leitura de volta**: os pintores erram a grafia de palavras que viram pouco. Num farol, o Qwen-Image 2512 escreveu «RUOCH STUDIO» e o Qwen-Image 2.1 «RUUCH STUDIO», enquanto «ПЕСНЯ МАЯКА» e «РУАХ СТУДИЯ» saíram certas. Por isso cada imagem é lida de volta pelo ouvinte, o Qwen2.5-Omni via llama.cpp (cerca de 5 s por imagem numa RTX 3090; leu os dois erros como eram), e comparada palavra por palavra: maiúsculas e quebras de linha à parte, nada mais é perdoado (ё não é е). Uma imagem com erro é pintada de novo com outra semente (a sua semente mais 1000, depois mais 2000), até três vezes, em rodadas: todas as imagens com erro de uma execução juntas, para que o pintor e o ouvinte troquem de lugar uma vez por rodada. A primeira escrita exata é guardada; as outras tentativas vão para a pasta misspelled/ da execução, guardadas, nunca apagadas. Quando nenhuma tentativa está certa, a mais próxima é guardada e dita com erro, com o que se lê. Sem o ouvinte, as imagens são guardadas como pintadas e ditas não lidas: nunca mostradas como certas.

**A placa para ler**: o ouvinte quer cerca de 11 GB. Um pintor inteiro na placa põe os seus pesos na RAM enquanto o ouvinte lê e os pega de volta depois; o Qwen-Image 2.1 deixa a placa livre sozinho; um pintor em fluxo com os seus blocos enchendo a placa deixa o ouvinte ler no processador (cerca de 64 s por imagem).

**As marcas**: ao lado de cada imagem **✓ Aa** (escrito como pedido), **⚠ Aa** (com erro em todas as tentativas; a sua dica diz o que se lê e quantas tentativas houve), **? Aa** (não lido de volta). A linha do palco diz *letrado «…»* e, para um com erro, o que se lê.

**Tempos** (RTX 3090, um quadrado): o Qwen-Image 2.1 letrou uma imagem pronta em 118 s, lida certa de primeira; um fine-tune fp8 do Qwen-Image 2512 sem Lightning (30 passos, CFG de verdade 4, o caminho próprio de um fine-tune fp8) pintou uma com as suas letras em 230 s, contando o carregamento, cerca de 150 s deles a pintura. Uma imagem com erro custa uma imagem inteira de novo por tentativa: de duas variações de «LANTERN SONG / RUACH STUDIO», uma saiu certa de primeira e a outra ficou com erro nas três tentativas («RUCH STUDIO»), guardada e dita, em 743 s para a execução. O Lightning faz de cada tentativa uma fração disso. A estimativa do formulário conta a leitura.

**Cirílico**: «ФОСФОРИДА | Возвращение Шехины» do Viktor no estilo do prompt do seu próprio álbum. O Qwen-Image 2512 escreveu o título certo nas nove imagens; a segunda linha em minúsculas em nenhuma de seis tentativas (as minúsculas Щ e Ш rabiscadas, «Вовуяеные Шехни»); em maiúsculas Щ e Ш saíram certas toda vez e só a última letra errou («ШЕХИНЯ»), com as formas das letras ditas também (a ideia dele, HERESY 1396: Ы, Щ, Ш e as outras letras que um pintor treinado no latim viu pouco, e Ф ao lado do Φ grego, cada uma descrita quando as palavras a levam). Uma dica soletrada («Ф-О-С-Ф-…») foi tentada e abandonada: o pintor pode pintar os seus hífens dentro do título. Para o cirílico: maiúsculas, e olhe a marca.

**Por que pintado, e não composto**: uma fonte real composta pelo estúdio (kerning, tracking e entrelinha pelo raqm) e levemente pintada por cima escreve exato, mas fica como uma camada sobre a imagem. Das quatro maneiras testadas, o Viktor escolheu as duas em que o pintor escreve as letras ele mesmo.

## 11. Uma imagem de onde pintar

**A referência**: solte uma imagem no seu lugar sob o prompt, cole uma (Ctrl+V), escolha um arquivo, ou pegue a imagem do palco com **Como referência** (ou a capa do take com **A capa do take**). PNG, JPEG ou WebP, 40 MB no máximo.

### Usá-la

**Usá-la**, sob a imagem, diz como:

- **para pintar a partir dela** (o padrão): de imagem para imagem pelo pintor do formulário, tanto quanto diz **Quanto pode mudar**;
- **para editar por palavras**: o Qwen-Image 2.1 mantém a cena e muda o que diz o prompt (*the same lighthouse in a snowy winter night*: a neve veio onde é o seu lugar, a torre e as pedras mantidas);
- **só pelo seu estilo**: o Qwen-Image 2.1 pinta a cena própria do prompt na técnica, na pincelada, na paleta e na luz da imagem, sem manter nada do seu tema (um farol a óleo deu *a red fox in a snowy forest under the moon* no seu pincel).

As duas últimas são oferecidas quando o Qwen-Image 2.1 está aqui. Com qualquer uma delas, a execução é do 2.1 seja qual for o pintor do formulário: o modelo do formulário, a amostragem, os adaptadores, a máscara e a tela não são enviados, e vale a licença do 2.1. Por dentro, uma referência de estilo é o prompt embrulhado num pedido para tomar da imagem só o estilo e nada do seu tema; a edição é o caminho próprio do 2.1 com uma imagem de condição.

### Quanto pode mudar

De imagem para imagem aqui é o que o InvokeAI faz com modelos que não têm pipeline para isso: a imagem cobre cada formato e é cortada pelo meio, passa ao contrário pelo decodificador do pintor até os latentes, e recebe ruído até um ponto da agenda própria do pintor; a pintura então percorre o resto da agenda a partir dali. A força escolhe esse ponto: o mais próximo dos passos próprios da agenda, dois passos pelo menos.

| força | o que dá (testado no Krea 2 Muse, o pintor da sala então) |
|---|---|
| 0,3 | a imagem quase como está, a sua superfície tocada |
| 0,5 | a imagem mantida, as suas pequenas coisas mudadas (letreiro, textura) |
| 0,6 | a sua composição mantida, a sua matéria mudada (o padrão da sala) |
| 0,75 | a composição mantida, os materiais do prompt tomados |
| 0,9 | a cena do prompt pintada na luz e nas cores da imagem |
| 1,0 | pintada de novo |

**Ruído extra** sob a força (0 por padrão, de 0 a 2): ruído fresco posto sobre os latentes da imagem antes de a pintura partir deles, como faz o fluxo do ComfyUI do Viktor com o InjectLatentNoise (`samples + noise · strength` no espaço próprio do decodificador; aqui dividido pela dispersão de cada canal, para que o número signifique o que significa lá). 0,3 traz grão e detalhe novos, 0,6 é a segunda passada dele, acima de 1 as formas da imagem começam a se quebrar. Ele só move o começo: o que uma máscara mantém fica limpo.

### Máscara

**Máscara…** pinta sobre a imagem o que deve ser repintado (Pintar e Apagar, B e E; o pincel e o seu tamanho, `[` e `]`; Inverter; Limpar): o resto fica exatamente como estava, como no inpainting. Por dentro, a máscara vai para a grade própria dos latentes, e a cada passo a parte mantida é reposta como a imagem com o ruído daquele passo; a imagem pronta toma os pixels próprios da imagem fora da máscara, esfumados.

Quatro opções sob a imagem quando há uma máscara (ou Pintar em volta):

- **Expandir**: a máscara crescida em tantos pixels, ou encolhida (de −64 a 128);
- **Borda**: o quanto a sua borda é suave (de 0 a 96 px);
- **Suaves**: repintura suave, como a differential diffusion: onde a borda é cinza a imagem muda só nos últimos passos, então sem emenda;
- **Grão**: quanto da tinta nova a parte mantida toma a cada passo (de 0 a 0,6), o seu grão e a sua luz costurados aos novos; 0 a mantém exata.

A borda de uma máscara redonda pode continuar visível sem elas; Expandir 16, Borda 24, Suaves e Grão 0,15 costuraram um rosto novo numa tela velha sem uma linha.

### Pintar em volta

**Pintar em volta** mantém a imagem inteira no meio de cada formato e pinta de novo as bordas que ela deixa, nas suas cores e na sua luz: uma capa quadrada para um 16:9 de vídeo ou um 9:16 de short, como outpainting.

### A tela

**Tela…** ao lado de Máscara… abre a tela, como a do InvokeAI: o quadro de cada formato uma aba em cima, dizendo como será pintado (**a partir dela**: a imagem cobre o quadro e a execução pinta a partir dela na força pedida; **em volta**: a parte do quadro que ela deixa nua é pintada em volta dela). No quadro de trabalho, **Mover** (V) arrasta a imagem, ou um canto para escalá-la com o canto oposto fixo; **Pincel** (B) e **Borracha** (E) pintam por cima a máscara de inpainting; **Mão** (H, ou Espaço segurado) move o quadro; a roda dá zoom, Alt+roda escala a imagem em torno do ponteiro, as setas a empurram (Shift: dez pixels). À direita as camadas e o lugar em números; em cima **Ajustar**, **Preencher**, **Centralizar** e **Igual em todos**, desfazer e refazer (trinta passos). **Pronto** guarda o lugar de cada formato com a referência e a máscara no formulário. Um lugar é o meio da imagem em partes do quadro e a sua largura em larguras de quadro.

## 12. A segunda passada

**Segunda passada…**, no palco ao lado de Upscale…, repinta uma imagem maior, como faz o fluxo do ComfyUI do Viktor depois da sua primeira passada: a imagem levada a **×1,5** ou **×2** pelo vizinho mais próximo e pintada de novo pelo pintor, fine-tune, adaptadores, prompt e semente próprios da sua execução, a partir de parte do caminho.

**Como o fluxo dele faz**, lido nó a nó: a imagem da primeira passada 2× por nearest-exact, codificada em blocos, InjectLatentNoise 0,6, depois um segundo KSampler a partir do passo 20 de 60 em CFG 4,5, com o mesmo amostrador e a mesma agenda da primeira passada (os dois vêm de um único empacotador: ER-SDE e Bong tangent como o fluxo está salvo).

**No estúdio**: **Quanto pode mudar** (0,5 primeiro: 0,3 mantém o desenho e acrescenta detalhe, 0,5 afia a sua matéria, 0,7 repinta as suas formas) e **Ruído extra** (0,6 primeiro, como o dele) na sua linha; os passos, o amostrador, a agenda e o Lightning são os do formulário quando o formulário pinta com o mesmo pintor, senão os próprios da execução. A receita dele dá à segunda passada muitos passos e nenhum Lightning: ajuste-os no formulário antes de apertar ×2.

**O que custa e o que dá**: um 16:9 de 1920 × 1080 sai em 3840 × 2160. Numa 3090, um fine-tune fp8 do Qwen-Image 2512 em 3840 × 2160 em 220 s com 12 passos e Lightning (22,9 GB, os seus blocos em fluxo). Em 0,6 ele manteve a cena e moveu um pouco as suas partes; em 0,5 a composição se manteve. Não para o Qwen-Image 2.1; sem máscara nem tela com ela. **De novo** numa segunda passada a pinta de novo no seu tamanho.

## 13. Upscale

**Upscale…** no palco faz de uma imagem **2K** ou **4K** (o seu lado maior 2560 ou 3840) com um upscaler de `artwork/upscalers/` (`.pth` ou `.safetensors`, pastas permitidas): ESRGAN, DAT, HAT, ATD, SPAN, OmniSR e os seus parentes, lidos pelo spandrel só pelo arquivo. A imagem passa em blocos de 512 com 32 de sobreposição, guardando o meio de cada bloco (sem emenda); um modelo 4× a quem se pede menos pinta em 4× e é baixado por Lanczos, mais fino que um modelo 2×. O lado maior para em 10 240 px. O **i** ao lado da escolha diz para que serve o upscaler escolhido (fotos, rostos, desenho), o seu autor, a sua licença e o seu tempo medido; um clique abre as notas de todos, agrupados, os mais rápidos primeiro, os não comerciais marcados.

**Passagens…** faz um upscale em passagens, como a pilha do ComfyUI do Viktor: até quatro linhas de um modelo e um fator, cada uma rodada sobre a imagem como ela está e levada ao tamanho original vezes o fator da passagem, depois o lado maior pedido e as cores acertadas ao original (hm-mvgd-hm: histogramas, média e covariância, histogramas). A cadeia dele está a um clique quando os seus modelos estão aqui: span otf strong ×2, depois Nomos8kDAT ×4, Remacri ×1,5, UltraMix Balanced ×2: uma imagem 1920 × 1080 para 7680 × 4320 em 246 s, sem emenda, as cores mantidas.

**TTA** ao lado do upscaler: cada bloco passa pelo modelo nas suas oito orientações (quatro giros, cada um espelhado), com a média: bordas e texturas mais firmes, até oito vezes o tempo. **Upscale…** na barra das imagens escolhidas (Ctrl+clique) faz o upscale de até 64 de uma vez, repartidas entre as placas do laboratório.

O upscale e a segunda passada fazem coisas diferentes: um upscaler afia o que existe; uma segunda passada pinta detalhe novo no novo tamanho. Para impressão: segunda passada ×2 primeiro, depois upscale.

## 14. O palco, a biblioteca e a lixeira

**O palco**: um clique numa imagem a põe ali com a sua execução embaixo; um clique nela (ou um clique duplo em qualquer imagem) a abre sobre a página no seu próprio formato (← → percorrem a execução, ou a galeria; Esc fecha). Embaixo: **Para o formulário**, **Como referência**, **Comparar…**, **Nota…** (uma nota sua: guardada com a imagem na sua execução e mostrada na sua dica; uma vazia a remove), **Definir como capa** (de uma quadrada), **Baixar** (PNG, tamanho cheio), **Sobre a página**, ★, **Proteger** (o escudo: uma imagem protegida nunca vai para a lixeira nem é apagada, seja o que for que a tenha mandado lá), **Lixeira**, **Segunda passada…**, **Upscale…**. Os dados e o prompt da execução ficam numa dica ao lado da imagem enquanto o ponteiro está nela.

**Execuções ou Galeria**: as execuções mostram cada aperto em Desenhar com o seu prompt e a sua semente, as mais novas em cima; a galeria mostra cada imagem de cada execução numa só grade, por formato, com estrela ou protegidas, em três tamanhos, em blocos iguais. As setas percorrem a biblioteca enquanto ela tem uma imagem: ← → a imagem anterior e a seguinte, ↑ ↓ uma fileira da galeria (nas execuções, a execução anterior e a seguinte); o palco acompanha.

**Comparar**: **Comparar…**, depois a outra imagem escolhida na biblioteca: as duas uma sobre a outra sob um divisor que você arrasta (← → o movem), ou lado a lado (S); X as troca, Esc fecha.

**O menu de uma imagem** (um clique direito em qualquer imagem): Sobre a página, Para o palco, Para o formulário, Tudo para o formulário, Como referência, Comparar…, Definir como capa, Upscale (2K ou 4K), Marcar com estrela, Escolhê-la, Copiar o prompt, Copiar a semente, Baixar, O arquivo numa nova aba, A execução dela, Para a lixeira.

**Escolher muitas**: Ctrl+clique escolhe imagens, Shift+clique um intervalo; a barra das escolhidas as marca com estrela, faz o upscale delas ou as põe na lixeira de uma vez (Esc as solta).

**A lixeira**: **Lixeira** numa execução a move para `trash/artist/`; a Lixeira do palco põe uma imagem de lado. A vista **Lixeira** mostra as imagens postas de lado (Restaurar, ✕, Restaurar tudo), depois as execuções na lixeira (Restaurar, Apagar de vez); **Apagar tudo** apaga tudo o que ela mostra, perguntando antes. **Lixeira (Arte)** no Bibliotecário guarda a arte retirada numa só lista, também as capas tiradas dos takes.

**O log do Pintor**: a moldura do log do servidor tem uma vista **Pintor**, a própria da sala: o que foi pedido (o pintor, o fine-tune, os formatos, a semente, a amostragem, os adaptadores), o que o laboratório respondeu (uma recusa com as suas próprias palavras), o caminho de cada execução até o fim (esperas e por quê, a placa em que pinta, pronto, parado, falhou e por quê). **⧉** o abre numa janela própria, com as placas ao vivo ao lado.

## 15. Capas para takes

**Definir como capa** de uma imagem quadrada a faz capa do take em mãos: no seu card, no player e no seu MP3. A capa que ele tinha é guardada ao lado do take (`artwork-removed/`), e a outra letra de um par A/B recebe também a nova quando não tem nenhuma. Uma capa é a cópia própria do take (1024 px, com o nome da execução e da imagem de onde veio), então tirá-la do take nunca toca a imagem, e a imagem que vai embora nunca toca a capa; pôr uma imagem assim na lixeira pergunta se tira também a capa do take, ou se a deixa.

**A capa própria de um take** (*Desenhar a arte* no seu menu, no Bibliotecário, para um take ou muitos) é pintada pelo pintor escolhido em **Motor → Arte**, ou conforme as placas quando nenhum foi escolhido: **Qwen-Image 2512** onde uma placa dos trabalhos do laboratório o comporta inteiro (Q6 a partir de 20 GB, Q4 a partir de 16 GB: é o que melhor segue o prompt e letra certo um título), senão Q4 em fluxo da RAM numa placa menor (cerca de 6 GB da placa e 30 GB de RAM). Um pequeno modelo de linguagem escreve o seu prompt a partir do estilo e das palavras do take, e o crítico olha se o seu tema está ali. Uma capa é um trabalho próprio que carrega o seu pintor de novo: numa 3090, Qwen-Image 2512 Q4 de 105 a 125 s, Q6 131 s, o seu fp8 BASE 95 s, tudo contado (seção 18). Um Q4 quase não é mais rápido que um Q6: pintar é a aritmética da placa, não a sua memória.

## 16. Receitas

**Uma capa, rápida.** Qwen-Image 2512 Q4 com ⚡ Lightning, 1:1, Variações 4, a amostragem como vem. Cerca de três minutos para quatro candidatas, com o carregamento; escolha, Definir como capa.

**Realismo acabado.** Qwen-Image 2512 com um fine-tune fp8, Lightning desligado, 30 a 40 passos, Orientação 4, ER-SDE ou RES 2s com Beta. Depois Segunda passada ×2 em 0,45 com Ruído extra 0,6 (a amostragem do formulário passa para ela), depois Upscale 4K ou as passagens.

**A primeira e a segunda passada do ComfyUI do Viktor.** Um fine-tune fp8, ER-SDE e Bong tangent, 12 passos; Segunda passada ×2 com 0,6 de ruído extra e muitos passos sem Lightning, a força entre 0,5 e 0,65.

**Um quadro de vídeo a partir de uma capa.** A capa como referência, Pintar em volta, o formato 16:9 (ou 9:16 para um short): as bordas pintadas nas suas cores e na sua luz, a capa inteira no meio. Na tela, mova ou escale primeiro a capa em cada quadro se ela não deve ficar no meio.

**Consertar uma parte.** A imagem como referência, Máscara… sobre a parte, o prompt dizendo o que deve estar ali, força 1,0; Expandir 16, Borda 24, Suaves, Grão 0,15 para uma emenda que não se vê.

**Dois temas nos seus lugares.** O prompt principal para a cena inteira, uma região para cada tema (metade esquerda, metade direita), as palavras das regiões curtas e concretas.

**O estilo de um quadro antigo para uma cena nova.** O quadro como referência, Usá-la: só pelo seu estilo, o prompt para a cena nova.

**A mesma cena em outra estação ou hora.** A imagem como referência, Usá-la: para editar por palavras, o prompt dizendo a mudança (*the same street in heavy rain at night*).

**Uma impressão.** Segunda passada ×2, depois Passagens… até 7680 no lado maior, TTA para um céu liso.

## 17. Quando algo dá errado

| o que você vê | por quê | o que fazer |
|---|---|---|
| o tema pintado duas vezes | Qwen-Image 2512 com Lightning em Karras, Exponential ou KL optimal | Simple, Beta, Beta 57, SGM uniform ou Bong tangent |
| imagens Qwen suaves e enevoadas | Euler SDE sem Lightning | Euler, ER-SDE ou RES |
| cores e bordas queimadas | a soma dos adaptadores passando de cerca de 1,8 | abaixe-os (a barra Juntos), ou quadros-chave que soltem um cedo |
| «o adaptador não alcança nenhuma camada» | um adaptador feito para outro modelo | ponha-o na pasta da sua própria família |
| letras que você não pediu | os dois pintores letram capas sozinhos | termine o prompt com *no text* |
| uma imagem faltando numa execução | o filtro de conteúdo a marcou | a execução diz isso; mude o prompt |
| uma emenda visível em volta de uma máscara | uma borda dura | Expandir, Borda, Suaves e um pouco de Grão |
| a segunda passada moveu a cena | a força alta demais | 0,4 a 0,5 |
| a execução espera uma placa | as placas do laboratório estão ocupadas ou pequenas demais agora | a atividade do log diz por quê; Fora da fila a retira |
| «nenhuma placa aqui pode pegar isto» | o pintor com os seus adaptadores precisa de mais do que qualquer placa comporta | menos adaptadores ou um pintor menor (Qwen-Image 2512 e 2.1 vão em fluxo no lugar quando podem) |
| regiões ignoradas | Qwen-Image 2.1 escolhido, ou uma região sem palavras | Qwen-Image 2512, palavras em cada região |
| primeira execução lenta, as seguintes rápidas | o pintor carrega uma vez e fica dez minutos | como previsto |

## 18. Os números

Medidos numa RTX 3090 (24 GB) com as ferramentas próprias do estúdio.

| o quê | tempo | placa no pico |
|---|---|---|
| Qwen-Image 2512 Q4, 1328², Lightning | 30 s | 14,3 GB |
| Qwen-Image 2512 Q6, 1328², Lightning | 32 s | 17,6 GB |
| fine-tune fp8 do Qwen-Image 2512, 1328², Lightning 0,55, 12 passos | 37 s | 21,0 GB |
| fine-tune fp8 do Qwen-Image 2512, 16:9 | cerca de 141 s com o carregamento | 20,5 GB |
| Qwen-Image 2.1 a partir de palavras, 1328² | 120 s | 16,4 GB (inteiro), 4,1 GB (em fluxo) |
| Qwen-Image 2.1 editando | 122 a 129 s | 19,1 GB (inteiro), 7,9 GB (em fluxo) |
| segunda passada ×2, fine-tune fp8 do Qwen-Image 2512 para 3840 × 2160 | 220 s | 22,9 GB |
| upscale ×2, 4x_Nomos8kDAT, 1280² para 2560² | 32 s | 2,1 GB |
| upscale em passagens, a cadeia dele, 1920 × 1080 para 7680 × 4320 | 246 s | |
| capa de um take pelo Qwen-Image 2512 fp8 BASE (um trabalho próprio: o pintor carregado, o prompt escrito, o olhar do crítico) | cerca de 95 s | |
| capa de um take pelo Qwen-Image 2512 Q4 / Q6, o mesmo | 105–125 s / 131 s | |

A primeira execução de um pintor soma o seu carregamento: um ou dois minutos para os pintores Qwen.

## 19. Para scripts e agentes

O laboratório responde na máquina do estúdio (pela página em `/lab/…`); a API do estúdio (`/api/v1`, OpenAPI 3.1) e o seu servidor MCP ficam ao lado. Os endpoints próprios do Pintor:

- `POST /artist/draw`: uma execução. O seu corpo: `prompt`; `shapes` (`1:1`, `16:9`, `9:16`); `count` (de 1 a 4); `seed`; `painter` (`qwen2512-q4`, `qwen2512-q6`, `qwen2512-fp8`, `qwen21`); `model` (o arquivo de um fine-tune fp8); `sampling` (`steps`, `sampler`, `schedule`, `lightning`, `cfg`); `loras` (`[{id, weight, keys}]`); `ref` (uma data URL, ou `{id, file}` de uma imagem de uma execução anterior) com `strength` (de 0,2 a 1) e `ref_as` (`edit`, `style`); `mask` com `mask_opts` (`grow`, `edge`, `soft`, `grain`); `fit` (pintar em volta); `place` (a tela: `{shape: {x, y, s}}`); `inject` (de 0 a 2); `scale` (1,5 ou 2, uma segunda passada); `regions` (`[{prompt, box: [x, y, w, h]}]`, três no máximo); `letters` (`{title, sub, look, where, way}`: `where` `top`, `middle` ou `bottom`, `way` `paint` ou `letter`; com `letter` o pintor é `qwen21` com um `ref`, e `prompt` pode ficar vazio); `preview`; `take`. Uma execução com letreiro leva `letters_prompt` (a frase que o pintor leu), e cada uma das suas imagens `letters`: `{read, exact, near, tries}`, ou `{unread}` quando o ouvinte não pôde lê-la.
- `GET /artist/runs`, `GET /artist/file`, `POST /artist/stop`, `POST /artist/cover`, `POST /artist/star`, `POST /artist/note` (`{id, file, note}`), `POST /artist/protect`, `POST /artist/trash`, `POST /artist/restore`, `POST /artist/aside`.
- `GET /artist/painters` (os pintores daqui, as suas placas e fine-tunes), `POST /artist/unload` (soltar os pintores guardados).
- `GET /artist/upscalers`, `POST /artist/upscale` (`{id, file, model, target}` com `2k` ou `4k`; ou `passes`, `resample`, `long`, `match`; `tta`; ou `items` para muitas).
- `GET /artist/loras`, `POST /artist/lora-civitai` (busca por hash), `POST /artist/civitai-look`, `POST /artist/civitai-fetch`.

Uma recusa volta como `400` com o motivo em palavras, as mesmas palavras que a sala mostra.

## 20. Licenças

O filtro de conteúdo (Falconsai) e o redator de prompts (Qwen3-4B): Apache-2.0; o filtro olha cada imagem que o estúdio pinta. Qwen-Image 2512 e Lightning: Apache-2.0. Os fine-tunes fp8: os termos de cada autor. Qwen-Image 2.1: a Qwen Research Licence, só pesquisa e avaliação. Adaptadores: os termos de cada autor, como o Civitai os lista. Upscalers: cada um os seus; as notas do OpenModelDB dizem quais são não comerciais, e a sala os marca. O que você pode fazer com as imagens que pinta decorre disso; quando importar, leia-as antes de vender.

## 21. O que vem depois

As versões da imagem de um take, e o SeedVR como upscaler (na 2.1.0, com a fase do DAW).
