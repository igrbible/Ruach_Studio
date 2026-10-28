# Ruach Estúdio · o guia

Canções a partir de palavras, na sua própria máquina: cada sala, o que cada coisa faz, e os números que medimos.

## Comece aqui <!-- #start -->

### O que é isto <!-- #what-this-is -->

O Ruach Estúdio transforma uma linha de estilo e uma letra numa canção pronta com o **YuE2**, o modelo de canções aberto, rodando na sua própria GPU. Nada sai da máquina. Em volta do modelo há um estúdio inteiro: uma sala de escrita com um modelo de chat, pós-produção (stems, remasterização, ampliação, conferência da letra), uma coleção de todos os takes e uma sala que treina adaptadores LoRA com as suas próprias canções.

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
- **Nenhum take fora de um espaço**: tudo o que faz um take (Gerar, Substituir uma secção, Importar) espera um espaço em uso que aceite novos takes, nunca um conjunto 💎, as suas secções ou um espaço congelado. O único aberto entra em uso sozinho, uma nova instalação recebe *Minhas músicas*, senão o estúdio pergunta; nada é enviado até escolher um, nem enquanto o Bibliotecário não responder.
- **EN** (as duas letras do idioma): a página em outro idioma, guardado com os seus ajustes: English, Русский, Українська, Беларуская, Ελληνικά, Español, Italiano, Français, Português, Deutsch, 日本語, 中文, cada um com o nome nas próprias palavras. Números e datas seguem o idioma, e este guia abre nele.
- **☀ / ☾**: dia, noite, ou como o sistema disser.
- No cabeçalho de Compor: **Salvar** um prompt (tudo o que Gerar enviaria) como JSON ou YAML, e **Abrir** de novo; **Limpar** as palavras (título, estilo, letra, partitura, sementes) e manter o resto, ou começar uma **Canção nova** (o modo, a amostragem e as LoRAs voltam ao padrão também; *Som e saída* fica). **Abrir** diz o que de um arquivo o formulário não conseguiu receber, e o que ele traz no lugar.
- **Exportar para a DAW** (no ☰, e no Lapidador: ao lado do take em mãos e nos seus Stems): a saída do estúdio. Ou a faixa mixada como está (WAV, FLAC, MP3), ou o take inteiro na sua própria DAW, onde o resto acontece fora do estúdio. A página encontra REAPER, Waveform e Bitwig na máquina do estúdio, ou você indica a sua. Qualquer take sai pelo seu menu (clique direito): *Exportar para a DAW → Projeto REAPER* ou *DAWproject* (Waveform, Bitwig, Studio One, Cubase), a sua DAW primeiro; a aba DAW deste guia diz o que vai dentro.
- **Descarregar o modelo**: tira agora da memória da GPU todo modelo ocioso; fica vermelho enquanto um modelo está carregado.
- **☰**: o resto. A placa e sua memória, a cópia do modelo, o decodificador de som (VAE), **Exportar para a DAW**, os temas, a sala Motor e este guia. **Tamanho do texto** ali ajusta todo o texto da página de −2 a +4 pt (o layout fica), e um quadro destacado tem os próprios −, + e ⟲ por cima (−4 a +6 pt); cada tela guarda o seu. Quando há um plugin seu em `user/plugins/`, **Plugins próprios** ali o desliga neste navegador: o Lapidador, o DAW e o MIDI mostram então só o que um estúdio público tem, para testar o caminho público, uma promo ou imagens; nada é apagado, e a página recarrega.

![Atrás do ☰](guide/more-menu.png)

### Sua primeira canção, em seis passos <!-- #your-first-song-in-six-steps -->

1. Dê um **Título** a ela, e escolha o **Tom** se tiver um em mente (ou deixe *como escrito*).
2. Escreva o **Estilo**: idioma, gênero, voz, instrumentos, andamento. Uma ou duas linhas simples bastam. O ♪ ao lado lista 200 instrumentos com o que o YuE2 de fato toca (veja *Criador*).
3. Cole a **Letra** com as tags de seção em linhas próprias: `[Verse]`, `[Chorus]`, `[Bridge]`, `[Outro]`.
4. Mantenha **Plano completo** como modo de planejamento: o YuE2 escreve primeiro uma melodia e acordes, depois a canção.
5. Aperte **Gerar canção**. A execução mostra as etapas: a partitura, os tokens musicais, o som, a decodificação.
6. O take abre no meio, com o player, a partitura e tudo para fazê-lo de novo.

> Medido numa RTX 3090: uma canção de 6:12 no modo Direto levou 135 segundos, uma de 7:25 no Plano completo 212 segundos (a partitura é escrita primeiro). Canções mais curtas são mais rápidas.

### O player, os takes e o log do servidor <!-- #the-player-the-takes-and-the-server-log -->

- **O player** embaixo: a onda de ponta a ponta, uma nuvem suave com a parte já ouvida na cor de destaque (um clique pula para lá); embaixo dela o take (a arte quando tem, o título, as primeiras palavras do estilo, 👍 👎 ★), depois **aleatório**, anterior, tocar, próximo e **repetir** (desligado · a lista toda de novo · este take de novo, marcado 1), depois o tempo (um clique no total o troca pelo tempo restante), *Tocar ao clicar* (um clique numa lista toca o take na hora), *Tocar em sequência* (quando um take termina, o próximo da lista começa), *Tocar takes novos* (uma canção feita aqui toca quando fica pronta, a não ser que algo esteja tocando), 🔔 *um som quando uma execução termina* (duas notas subindo quando fica pronta, uma vez só para uma fila de execuções, duas descendo quando uma falha; nenhum por cima de uma canção nova que começa a tocar sozinha), a **velocidade** (0.50× a 2.00×, com a altura mantida), o volume e um ponto para o estado (ele pulsa enquanto um take toca). O que você não precisa agora fica apagado até o ponteiro chegar; cada ícone diz o que faz quando o ponteiro para nele. O ponteiro sobre a onda mostra o tempo para onde um clique pularia. As teclas de mídia do teclado e de um headset controlam o player, e o painel de mídia da área de trabalho mostra o take. ⏪ e ⏩ vão à marca anterior ou à próxima a cada 15 s desde 0:00, ← e → às marcas a cada 5 s (Shift: 30 s). A pílula de estado na ponta direita do player (verde enquanto um take toca, na cor de destaque enquanto um é feito) abre o take ou a execução; com Compor destacado sobre a sala, ela troca o quadro pelo do take. Um clique direito na onda, na imagem ou no título abre o menu do take, como numa lista. A onda mostra as seções do take: as próprias tags da letra, cada uma onde o Whisper ouve o seu primeiro verso (uma vez por take, cerca de meio minuto; sozinho numa máquina de duas placas ou mais, senão menu do take → *Achar as seções de ouvido*); um take nunca ouvido mostra as marcas da partitura. Um traço fino em cada início, o nome embaixo; um clique perto de um traço vai ao começo exato da seção; o ponteiro sobre a onda mostra um cartão com a seção, o tempo e os versos como escritos, o verso cantado ali aceso; uma seção marcada com ? não foi ouvida com clareza. O ponteiro parado um momento na onda traz sobre o player o espectrograma do take inteiro (o interruptor do espectro ao lado do 🔔 o desliga): tão largo quanto a onda e no mesmo tempo, cerca de um terço da altura da janela, com o cartão da seção acima; dentro, as seções, o centroide espectral como uma linha magenta (onde fica o peso do som: o brilho), o RMS numa faixa embaixo com a média do próprio take tracejada, o cursor de reprodução; sob o ponteiro o tempo, o espectro daquele momento ao lado da linha com a frequência mais forte e a nota, e no alto da imagem a frequência ali, a nota e o nível. *Log* ou *Linear* no cabeçalho; um clique vai para lá como na onda; o ponteiro fora ou Esc o recolhe. O take é medido uma vez, pelo laboratório, como para o seu Espectro. O volume vai até 150 %: acima de 100 % reforça um take baixo, e o controlo para primeiro nos 100 % (solta e arrasta de novo para passar).
- **Duas linhas ou uma**: o player mantém a onda acima dos controles onde as canções são ouvidas e comparadas (o Criador, o Lapidador, o Bibliotecário) e fica numa linha só no Escritor, no Pintor, no Treinador e no Motor, e no Criador enquanto um quadro está destacado ou a letra está acima de tudo. Depois de recarregar (F5) ele volta com o take e a posição. No Pintor, os Takes começam recolhidos e o log do servidor fica à esquerda.
- **As placas ao vivo**: em Motor → GPUs cada placa tem uma linha própria embaixo, a carga e a memória numa barra a cada dois segundos durante quatro minutos, com a temperatura e a potência; o log do servidor, aberto, mostra ao lado as placas que têm um papel, cada uma encabeçada pelo papel, a placa do estúdio emoldurada. As medidas seguem o tempo todo, então o log já abre com os últimos minutos.
- **A linha até o estúdio** aparece ao lado do log do servidor (*Forge · 85 ms*, ou *aqui* na mesma máquina). Quando o estúdio está longe, uma curtida, um favorito ou um alfinete aparece na hora e o estúdio só confirma.
- **Takes** à direita: busca por palavras, `*` e `?`; *Favoritos*; recolha a coluna com »; ⋯ para as ações da própria lista. No ⋯, *De todos os espaços* mostra nesta coluna os takes de todos os espaços, sem mudar o espaço em uso.
- **Takes recolhidos**: o rato sobre a faixa » abre a lista por cima do take; volta a recolher-se um segundo depois de o rato sair (o botão Recolher, premido então, mantém-na aberta). O menu ⋯ abre para cima quando o leitor não deixa espaço por baixo.
- **O log do servidor** fica logo acima do player em todas as salas: recolhido, mostra a última coisa que o motor disse (em vermelho quando algo falhou); aberto, dez linhas, *Acompanhar*, *Copiar* e o caminho para o log inteiro no Motor. Com um quadro destacado sobre a sala, ele fica à esquerda, fora dos botões do quadro. A seta na borda interna o leva para o outro lado da página, e cada sala guarda o seu lado (o do Pintor é a esquerda). A borda externa o alarga ao arrastar, até 1200 px (guardado; um clique duplo devolve a largura original); com as placas ao lado, ele tem 920 px de largura, a coluna delas 390. O quadro tem duas vistas, **Servidor** e **Pintor** (o log do próprio Pintor: o que foi pedido, o que o laboratório respondeu, o caminho de cada execução até o fim), e cada sala abre a sua; **⧉** abre o log numa janela própria, acima de todas as janelas no Chrome ou para levar a outro monitor. Enquanto uma LoRA treina, uma barra própria fica acima do log, uma linha por treino: a placa, o passo, quanto já foi feito e quanto falta mais ou menos; um clique abre o Treinador.

![O log do servidor, aberto](guide/log-dock.png)

## Criador <!-- #creator -->

### Compor: o formulário da canção <!-- #compose-the-song-form -->

![Título, tom, sementes e estilo](guide/compose-top.png)

- **Começar de uma ideia**: uma linha sobre a canção; o modelo de chat do Escritor redige o título, o estilo e a letra (*Escrever o brief*).
- **Título**, **Tom**: o tom vai para a partitura (`K:`). Com uma partitura no formulário, um tom novo a transpõe para ele; sem partitura, a escolha espera e transpõe a que vier.
- **Versões** (ao lado de *Salvar no Escritor…*): o formulário é guardado sob o seu título a cada Generate, no Ctrl+S, depois que o piano roll escreve na partitura e antes de tudo o que o sobrescreve (um exemplo, um take, o Escritor, uma versão), com os seus ajustes, então uma mudança nunca se perde; um clique escolhe uma versão, um segundo mostra as duas como diferenças, *No formulário* traz uma de volta; estrela, rótulo, cadeado. Apagar um take nunca leva as suas versões. **Versão**, ao lado do Título, aceita dígitos e pontos (4.2.3): um take se chama «Título v4.2.3», como se nomeiam as faixas, e as versões guardam uma árvore por título com um ramo por versão (um título digitado com a versão se divide sozinho nos dois campos). *Excluir a árvore…* manda a árvore inteira de um título para a lixeira das versões; *Versões do Criador* no Escritor a traz de volta.
- **Semente musical** e **Semente sonora**: os dados das duas metades. Vazio é aleatório; um número repete um take. Mantenha a semente musical e mude a sonora para ouvir a mesma canção renderizada de outro jeito. Elas vêm primeiro em *Amostragem e remoção de ruído*. Ao lado de cada uma, o **modo**: *Aleatória (−1)* uma semente nova a cada execução (o campo vazio), *Aleatória, fixa* uma aleatória posta e mantida, *Fixa* a que está escrita, *Próximo* e *Anterior* a movem depois de cada Gerar além das sementes já usadas (as versões para a música, as variações para o som). A semente do Pintor tem os mesmos modos. Uma semente de música fixa é vigiada: quando os seus adaptadores (as metades musicais deles) ou o modelo base mudaram desde a última execução, ou quando ela quebrou um plano com esses mesmos adaptadores, a execução pergunta antes: **Uma semente nova** ou **Manter a semente**. Um plano não escreve mais a sua semente no campo, e **Uma partitura nova** toma sementes novas.
- **Estilo**: idioma, gênero, voz, instrumentos, andamento. *Salvar estilo…* o guarda com um nome. **♂** e **♀** no cabeçalho põem *male vocals* ou *female vocals* nele (no lugar da palavra do outro gênero, senão antes do BPM); o aceso tira a sua tag. **Andamento livre**, ao lado, faz a música pela partitura sem as marcas de andamento (Q:): a voz e o pulso respiram sozinhos, a letra deixa de estar presa ao compasso (rubato, não linear); liga sozinho quando o Estilo pede rubato ou non-linear e não cita BPM, e um BPM no Estilo com ele ligado é dito sob a caixa. Uma partitura criada à parte (*Criar partitura ABC*) também chega sem andamento.
- **Letras não latinas** no Estilo são nomeadas por baixo: o YuE2 lê o estilo como tags em inglês. **✦ Sugerir** lê a letra inteira (até 8000 caracteres). Os estilos salvos, os perfis, os perfis de texto e os documentos do Escritor escolhem-se no diálogo do próprio estúdio, com filtro numa lista longa, como o espaço.

### A cola de instrumentos ♪ <!-- #the-instruments-cheat-sheet -->

O ♪ ao lado do estilo abre uma tabela de 200 instrumentos que o estúdio sondou: a família, a origem, como soam (em inglês e russo) e as palavras que os chamam. ▶ A e ▶ B tocam duas sondas de 60 segundos de cada um. O veredito de cada linha vem de um ouvido humano: ouvido, duvidoso, ou **NOT IDENTIFIED IN YUE2** (o YuE2 não o conhece; precisa de um prompt mais elaborado). Um clique copia o nome e pergunta para onde vai: no fim do estilo numa linha própria, ou no lugar dele; um nome que o estilo já tem fica marcado na tabela, e o texto da tabela pode ser selecionado e copiado.

**O YuE2 decide quando um instrumento entra.** Uma linha de estilo é um pedido, não uma ordem: por mais que você peça, o modelo põe um instrumento onde o treino dele diz que a canção o quer, e a semente decide muito. O mesmo prompt deu um take com o instrumento e um sem. Ouça várias sementes antes de julgar um instrumento.

**Ouvido, mas não tão real quanto ao vivo.** Muitos instrumentos tocam, mas menos claros e menos fiéis que o original: é o que o YuE2 sabe deles. Os veredictos dizem se o YuE2 toca um instrumento, não quão real ele soa. Torná-lo real é trabalho de uma **LoRA de instrumento**: algumas dezenas de gravações limpas dele, treinadas no Treinador LoRA.

![A cola de instrumentos](guide/instruments.png)

### O vocabulário da Primeira Onda <!-- #the-first-wave-s-vocabulary -->

O **YuE2-RS-FW**, o fine-tune próprio do estúdio (*Engine → Models and LoRAs → RS-FW merge*), aprendeu com 32.633 faixas, e cada palavra das linhas de estilo delas está contada no **[seu vocabulário](fw-vocabulary/index.html?lang=pt)**: gêneros, instrumentos, voz, clima, as palavras de emoção que o próprio áudio recebeu, tonalidades e BPM, e as chaves das partituras (seções, compassos, andamentos, acordes). Busque, filtre por tipo e por fonte, veja com que palavras cada uma andava. Um clique põe uma palavra numa linha de estilo na ordem que o modelo aprendeu; *Copiar* leva a linha para o campo Style. Uma palavra vista em centenas de faixas o modelo entende; vista duas vezes, é uma dica. A mesma referência como documento está na [página do modelo](https://huggingface.co/goldhub/YuE2-RS-Finetunes/blob/main/FW-VOCABULARY.md).

### Letra e perfis de texto <!-- #lyrics-and-text-profiles -->

- Tags de seção em linhas próprias; o YuE2 conhece `[Intro]`, `[Verse]`, `[Pre-Chorus]`, `[Chorus]`, `[Bridge]`, `[Interlude]`, `[Outro]`.
- Deixe sem palavras uma tag instrumental como `[Instrumental Outro]`: palavras sob ela levam a cauda a um canto inventado, take após take. Ponha as últimas palavras sob um `[Breakdown]` antes dela.
- **Perfil de texto**: cole um texto inteiro, escolha um perfil, *Aplicar*: as regras dele (limpeza, fonética) e a forma (`[Intro]`, `[Verse]` nas linhas em branco, `[Interlude]` depois de parágrafos longos) deixam o texto pronto para ler. *Desfazer* traz o texto de volta. Os perfis são feitos no Escritor.

### A métrica da letra e a mão fonética <!-- #the-lyrics-meter-and-the-phonetic-hand -->

- **A métrica** ao lado da letra: as sílabas de cada verso como uma barra contra a régua do seu grupo — estrofe e ponte um grupo, o pré-refrão o seu, o refrão o seu, qualquer outra seção a sua. Uma pausa, um break, um silêncio, um interlúdio, um prelúdio ou uma indicação instrumental dentro de uma seção cantada não abre grupo: o nome dela fica apagado ao lado e a régua da seção segue. Tags nunca contam: uma linha só de tags (`[Break] [Silence]`) não conta nada, uma tag dentro de um verso fica de fora. A régua fica no comprimento usual do grupo; a uma sílaba de distância a barra é verde, a duas ou três âmbar, além disso vermelha. O que está entre parênteses é desenhado hachurado depois da barra: o YuE2 pode cantá-lo. Sob a caixa: os caracteres, sílabas e versos da letra, as tags de seção, os parênteses e a mão fonética; a correção ortográfica do navegador no idioma da letra (desligada ali); uma caixa esticada à mão mantém a altura até *Altura automática*.
- **Números de linha e marcas**: a caixa da letra numera as linhas como um editor de código (uma linha quebrada uma vez, na primeira fileira; *Números de linha* sob a caixa os desliga). **Alt+K** marca a linha do cursor ou a desmarca, **Alt+J** vai à próxima marca, **Alt+Shift+J** à anterior, **Alt+Shift+K** as limpa; o número de uma linha marcada fica âmbar, e as marcas seguem as linhas quando você escreve acima delas. Cada [tag] fica sob uma fina camada âmbar. A letra do Escritor tem o mesmo. Como no mcedit: **Alt+O** também limpa as marcas, **Alt+L** vai a uma linha pelo número, **Ctrl+Y** apaga a linha, **Alt+↑** e **Alt+↓** movem a linha (ou as linhas selecionadas) com a marca. *Teclas* sob a caixa lista todas, e o rótulo LETRA do Escritor as diz ao passar o ponteiro. **⤢** ao lado de Letra põe a caixa acima de tudo, 60 % da largura da tela e quatro décimos maior, com tudo isso, e os próprios −, + e ⟲ para o tamanho do texto (guardados neste navegador); Esc a devolve. Ao lado do **⤢**, dois botões guardam a letra como texto simples: o primeiro a salva como `.txt` com o nome do Título, o segundo põe um `.txt` (UTF-8) no lugar dela (pergunta antes quando a caixa tem palavras, e **Ctrl+Z** na caixa as traz de volta; um Título vazio recebe o nome do arquivo).
- **Colchetes conferidos**: um «[» não fechado na linha, um «]» sem abertura, um «[» dentro de uma tag e uma tag vazia numeram a linha em vermelho, e *Tags não fechadas ou perdidas* sob a caixa vai de uma à próxima; um parêntese deixado aberto ou fechado sem abertura fica âmbar (um eco pode continuar). Um «[» ainda sendo digitado fica em paz até o cursor sair da linha. **Gerar pergunta antes** quando uma tag está quebrada: o que vem depois de um «[» não fechado pode se perder na canção e o final pode dar errado; *Ir à linha*, ou *Gerar como está*.
- **Acentos fora do lugar**: uma marca fora de uma vogal — no início da linha, depois de um espaço ou sinal, numa consoante, uma segunda na mesma letra, ou um ´ com espaçamento no lugar dela — mostra um botão vermelho sob a caixa (*Acentos tônicos fora de uma vogal*) e uma marca antes da contagem da linha; o botão seleciona cada um por vez. Uma palavra com duas marcas recebe uma âmbar: de propósito, ou um deslize? Na contagem um acento não é sílaba; ע e uma vogal latina dentro de uma palavra russa são. Uma sílaba é um som vocálico, uma nota, contada pelas regras de cada idioma: uma letra vogal em russo, ucraniano e bielorrusso (e como a métrica mede o tempo que um verso leva, uma palavra sem vogal — с, в, к, з, й, ў — e uma oclusiva fechada contra uma africada dentro de uma palavra — глу-п-цо́в — levam um tempo próprio, desenhado mais claro: «Я же вижу глупцо́в с приду́рческим планом» tem 12 sílabas e 2 desses tempos, 14); em grego αι, ει, οι, ου, αυ, ευ são uma (um trema ou o acento as separa: τσά-ι); em espanhol e italiano um i ou u fraco se junta à vizinha (cie-lo, cuo-re), duas vogais fortes são duas (po-e-ta); em inglês um e final mudo não conta (make, mas ta-ble); o hebraico conta os sinais vocálicos; chinês, japonês e coreano um sinal cada. Palavras latinas contam como inglês, espanhol ou italiano: pela palavra do estilo para o idioma, senão pelas palavrinhas da própria letra.
- **O arco**: as estrofes numeradas 1, 2, 3… (nenhuma em falta, nenhuma duas vezes, nenhuma sem número entre as numeradas); dentro do ciclo de uma estrofe Verse › Pre-Chorus › Chorus › Post-Chorus, uma secção pode faltar mas não voltar atrás; um Bridge ou uma parte instrumental reabre o ciclo; um Intro só antes da música, nada cantado depois de um Outro. As suas falhas: **Arco** em âmbar, um clique leva à seguinte.
- **Ctrl+F** na letra ou no estilo (e nas caixas do Escritor) busca só naquela caixa: Enter e Shift+Enter percorrem as ocorrências, Esc no campo de busca devolve o cursor com a ocorrência selecionada; a partir da própria caixa (clicada em outro ponto) fecha a barra e deixa o cursor onde está, e palavras digitadas ali enquanto isso não movem a vista. Um acento não é procurado, ё vale е, e о e а acham também ע e o o e a latinos. **F4** ou **Ctrl+H** abre uma segunda linha para substituir: **Enter** põe as palavras novas no lugar da ocorrência em mãos e segue para a próxima, **Ctrl+Enter** (ou *Tudo*) substitui todas de uma vez, e um **Ctrl+Z** na caixa desfaz; **Aa** (**Alt+C**) só acha como a caixa foi digitada.
- **Tags sob um «[»**: um «[» digitado no início de uma linha na letra (do Criador ou do Escritor) abre as tags de seção, como um editor de código oferece suas palavras, na ordem em que uma canção passa por elas, de Intro a End. Letras digitadas depois estreitam a lista (num teclado russo ou ucraniano também), um número numera a tag (`v2` é `[Verse 2]`), e letras que numeram as estrofes recebem a próxima. ↑ ↓ escolhem, Enter ou Tab põe a tag numa linha própria (Ctrl+Z a tira), Esc ou `]` fecha a lista. Intro, Outro e End já na letra ficam no lugar, apagados, com a linha: ↑ ↓ chegam a eles e leem o que são, mas não são postos duas vezes. Ctrl+Espaço abre a lista, e no início de uma linha digita o próprio «[». A lista fica em duas colunas: as tags, e ao lado o que é a da vez (nas nossas palavras, segundo o guia de seções de canção do Genius) e quantas vezes os 110 exemplos oficiais a escrevem; a caixa mantém o tamanho quando a lista estreita. Seções que nenhum escreve são marcadas TEST. **Uma segunda e uma terceira tag** numa linha: um «[» digitado logo depois da tag de uma linha ganha o espaço sozinho e oferece as tags que não são seção (quem canta, como os exemplos escrevem; Female Vocals, Break e Silence marcadas TEST); Enter a põe na mesma linha, com um «…» dentro selecionado para as suas palavras; Ctrl+Espaço digita « [» ali também.
- **A mão fonética** (a do Viktor, vinda do SUNO; o YuE2 também a segue):
  - **Um acento tônico** (o agudo combinante, U+0301) depois de uma vogal: `обе́щано`, `сули́т`. Vale em cerca de 90 % dos versos; o resto é sorte da semente.
  - **Uma vogal tônica maiúscula** empurra o acento para onde a rima quer, contra o dicionário: `базилиО́`. Uma maiúscula sozinha, sem o sinal (`дрОв`), raramente move o acento.
  - **ע (ayin) dentro de uma palavra russa** é cantado como um о/а suave, como a fala viva diz um о átono: `кעмо́рка`, `пעле́но`, `Ка́рлע`. Também freia o rap que corre cada vez mais.
  - **Um o latino dentro de uma palavra russa** canta um o duro e aberto onde o modelo diria а: `Кo дну`.
  - **Uma vogal esticada** (`о-о-о`, `БУ… РА… ТИ… НО`) sustenta uma nota; onde a música tem espaço para ela, não em todo verso.
  - **[Interlude]** entre partes faz uma pausa no rap e desacelera a fala que não para de acelerar (nem sempre).
  - **Os parênteses** não são um comando: uma ou duas palavras no idioma da letra dentro deles quase sempre são cantadas como eco de coro; uma indicação dentro deles (`(Music slowly fades)`) quase sempre é ignorada, ou cantada. Um comando vai entre colchetes.
  - **Voz principal e coro** (achado de Viktor, 20.10.2026): divida a letra entre as linhas da voz principal e as respostas do coro. Com `female choir backing` e `solo lead` no estilo, uma linha curta entre parênteses no idioma da canção é cantada na maioria das vezes pelo coro, numa linha própria ou no fim da linha da voz principal. Duas formas funcionam: só os parênteses, a mais estável (`это же (божественный экстаз!)`), e `(Choir: …)`, que nem sempre pega; `(Choir backing: …)` falha por completo. Com letras em inglês, só os parênteses podem falhar de vez em quando. Dividida assim, a voz principal sai com muito ar em volta. **Três pontos** (`...`) depois de uma palavra fazem uma pausa curta. Escrita assim, uma canção pode ficar longa (a dele chegou a 8:27) ou, com as mesmas palavras, sair mais curta do que antes, o que deixa espaço para os interlúdios instrumentais.
  - **Uma palavra hebraica com seus sinais vocálicos** (`רוּחַ`) o modelo diz melhor do que em transliteração.
  - **Os colchetes são um comando** para o YuE2: uma seção, uma voz, como um verso é cantado ou dito. Aqui há muito com que brincar.
- **Vozes** (não são seção: os versos ficam na seção anterior). A forma do Viktor: `[Vocal: Female - …]` ou `[Vocal: Male - …]` para um verso cantado, `[Spoken: Female - …]` ou `[Spoken: Male - …]` para um falado; primeiro quem, depois de um travessão como (`[Spoken: Female - Soft Whisper, Intimate, Sacred]`). Uma tag falada pode abrir o próprio verso: `[Spoken: Female - Soft Whisper] Ты слышишь?`. Numa balada longa com um adaptador de voz masculina e uma narradora (13.10.2026), o YuE2 seguiu essas tags em cerca de 95 % das vezes, com mais constância que o SUNO. **Solo** não é ouvido numa tag de voz (os exemplos o reservam para instrumentos: `[Guitar Solo]`): nomeie a voz. «[» as oferece depois das seções, marcadas *não é seção*.
- **Uma sílaba move a canção inteira.** O YuE2 lê a letra como uma só cadeia antes de escrever a música: mude uma sílaba, umas «», uma tag, e a mesma semente toma outro caminho dali até o fim. A semente é o dado, não a canção. Para mudar um verso e manter o resto, substitua a seção dele (clique direito na onda do player); para julgar palavras novas, ouça-as com várias sementes.
- **Duração**: o YuE2 sustenta uma canção de 8 a 9 minutos, mais que os 6:15 do SUNO v6. *Duração máx.* vai até 15 minutos para uma narração, mas além de 9 é sorte da semente.

### VAE e LoRAs <!-- #vae-and-loras -->

- O **VAE** transforma a canção escrita em som: **Padrão** (o melhor som), **Antigo** (o dos benchmarks), **Mistura** (uma mistura dos dois, um complemento). Um take pronto pode ganhar outra decodificação depois, na própria página. Ele é escolhido no menu **☰**, sob o modelo, para as próximas canções; um take decodifica de novo com outro a partir do seu cartão em segundos (desde a rc2 cada take guarda os latentes; um feito antes renderiza o som de novo).
- **LoRAs**: adaptadores para a metade música, a metade som, ou as duas, cada um com a sua força: o controle deslizante da metade música abre com um acorde, o da metade som com uma onda (o ponteiro em cima diz qual é). Um nome mais longo que a sua coluna é cortado e aparece inteiro sob o ponteiro. **Adicionar um LoRA** guarda os adaptadores que não estão na canção atrás de uma só linha: uma busca os encontra por qualquer palavra (o nome, o tipo, as metades, a etiqueta, o gatilho, a nota), os tipos os filtram (*voz*, *canto*, *estilo*, *instrumento*, *partitura*), cada tipo é uma faixa à esquerda do bloco (a voz de um locutor tem uma segunda, colorida pela primeira letra do nome, como os contatos de um telefone), duas colunas numa tela 1080p e mais numa mais larga, rolagem própria acima de 800 px.

**A onda de uma LoRA.** Um adaptador empurra com a sua força do primeiro ao último segundo: plano. A pequena imagem no fim da linha dele abre a sua onda: **Plana** a deixa assim; **Arco** o faz subir à força total no meio da canção e aliviar nas duas pontas; **Desenhar** a molda à mão: arraste um ponto para cima para um realce, para baixo para um sumiço, ao longo da canção para movê-lo; clique duplo para acrescentar um ponto, clique duplo num ponto para tirá-lo. A força que você ajusta é o topo da onda; os dois arquivos de um par (a metade música e a metade som) seguem uma só onda. A metade música a percorre token a token enquanto a música é escrita, a metade som quadro a quadro enquanto o som é feito, do começo ao fim da duração da canção; ela vai no pedido do take, então um take refeito segue a mesma onda, e o cartão do take diz *uma onda*. **Seções** faz com que soe só nas seções que você marcar, com uma rampa curta em cada fronteira: as fronteiras vêm dos compassos da partitura quando a música tem uma; senão, aproximadamente, das linhas da letra.

![A onda de um adaptador de voz desenhada à mão: sobe, segura, desce e volta](guide/lora-wave.png)

**A grade da onda.** O gráfico conta a força em quartos e a música em minutos e segundos. O seu tempo corre sobre a duração definida em **Saída** (Duração máx.), não sobre a duração da própria música: o motor estende a onda sobre essa duração. Escreva em **Música ≈** quanto a música vai durar, mais ou menos: uma linha tracejada marca o seu fim, e o que você desenhar depois não se ouve. **Shift** mantém na grade o ponto que você arrasta, um clique direito remove um ponto, e a leitura acima do gráfico diz onde está o ponteiro. O botão ao lado do nome das LoRAs as eleva sobre a página, até 1800 px de largura, para mover os pontos com precisão; Esc as devolve ao lugar. Coloque a **Saída** perto da duração que você espera, para que a onda inteira seja ouvida: um take pedido para 9:00 que terminou em 6:37 deixou sem ser ouvido o último quarto das suas ondas.

**Um arco emocional.** Um adaptador de voz em arco cresce em direção ao meio da música e se apaga nas pontas, e a música respira com ele. Em **Por ordem**, quando dois adaptadores juntos passam a linha vermelha, o que a onda do de cima larga, o de baixo apanha: um duduk em arco sobre uma voz passa a música entre os dois. Dá para ouvir e medir: num take cujo adaptador de duduk foi desenhado alto, depois baixo, depois subindo, o stem de sopros separado da música seguiu a mesma linha (−30 dB no início, −59 dB no meio, −36 dB perto do fim).

![LoRAs: cada força numa estrada do verde ao vermelho, e a metade música no total](guide/loras.png)

Cada força fica numa **estrada**: verde é seguro, amarelo é o limite, vermelho passou dele. Os limites são medidos:

- todos os adaptadores iguais, em décimos nos controles: a metade musical verde até **0.4**, vermelha a partir de **0.5**, **0.75** no máximo (um adaptador de partitura, o que planeja ABC, mantém os seus: verde até 1.0);
- a metade do som verde até **0.6**, vermelha a partir de **0.75**, **1.0** no máximo;
- **Música, junta** e **Som, junto**: adaptadores empilhados se somam, e cada um pode ficar no seu verde enquanto a soma quebra a partitura. Enquanto o modelo escreve a partitura, a metade musical junta é verde até **1.2** e vermelha em **1.4**, o seu máximo: nos planos do estúdio (13–20.10.2026) até 1.0 juntas nenhum de 6 quebrou, de 1.0 a 1.2 14 de 35 (no IRAEv3 8 de 10), acima de 1.2 8 de 9. Com uma partitura no formulário a metade musical não escreve nenhuma, e a barra vai até 3.5 (inteira até 2.25 em takes reais, quebrada a partir de 2.5). A metade do som junta é verde até 1.2, 1.5 no máximo. O plano tem ainda um fusível: no Plano completo sem partitura sua, adaptadores que juntos passam de **1.0** (**0.8** no IRAEv3) planejam a partitura reduzidos em proporção a esse valor, e a canção é cantada sobre ela nas forças deles. Um plano quebrado não é cantado: com semente de música aleatória ele é planejado de novo uma vez; depois disso, ou numa semente fixa, a janela de Babel diz o que pesou sobre ele (os adaptadores, o modelo base, a semente, o fusível) e, a um pedido, o planeja de novo com uma semente nova.

**Orçamento.** Com dois adaptadores ou mais, **Orçamento** fica sob a estrada. Nenhum modo aceso: sem orçamento, cada um vai com a sua própria força, como antes; o aceso, apertado de novo, solta o orçamento. **Repartir**: os adaptadores que empurram as mesmas camadas dividem um orçamento por metade, com a linha vermelha como teto; passada ela, cada um cede em proporção. **Por ordem**: a linha de cima pega a sua força primeiro, a seguinte o que a linha vermelha deixa, e o que uma onda solta, a seguinte pega; arraste as linhas pelo nome para definir a ordem delas. O motor mantém o orçamento em cada momento da canção. Quais adaptadores dividem camadas o próprio estúdio mede: a dica no nome de um adaptador diz onde ele empurra (as camadas de cada metade, atenção contra MLP, quanto ele move uma camada em 1.0), e as notas ao lado do nome das LoRAs dizem quando dois dividem camadas e como puxam: no mesmo sentido (juntos empurram mais forte do que as suas forças dizem), um contra o outro, ou de través. Uma força que o orçamento segura mostra o que corre de fato: o seu número fica âmbar, a sua estrada esmaece depois do corte, e a dica diz por quê; **Música, junta** e **Som, junto** mostram o que corre do que foi pedido (a soma é a mesma nos dois modos, as linhas diferem). Os controles andam em décimos; um clique duplo digita centésimos.

**Além dos limites.** A caixa no fim da linha do orçamento deixa cada controle passar do próprio máximo (a metade musical até 1.5, a sonora até 2), e os de conjunto também; os caminhos mantêm as cores, então o vermelho medido continua à vista, e o orçamento não segura nenhum. É para um adaptador cuja onda toca só em parte da canção (um duduk forte na introdução e depois nada): ele não precisa tirar a sua parte dos outros durante a canção toda. A partitura continua sendo planejada com a metade musical reduzida ao fusível do plano (1.0 em conjunto, 0.8 no IRAEv3) e cantada com as forças definidas. **Fora da partitura** (clique direito numa linha): a sua metade musical canta a partitura mas não a escreve; o plano é feito sem ele e a linha diz *só canta*.

**Clique duplo** num número para digitar uma força exata. As dicas sob o bloco dizem o que importa: uma palavra-gatilho ausente do estilo, um adaptador treinado em outro modo de planejamento, uma força além do limite. Enquanto o ponteiro está num slider ou o arrasta, a força exata fica acima do ponteiro na cor da sua estrada. O adaptador Instrumental para em 1.0, onde começa: além disso, as partituras dele se perdem.

> **Um adaptador de partitura instrumental com palavras para cantar.** Um adaptador assim planeja partituras *sem linha vocal*. Em 1.00 ele deu um take com uma nota só em 127 compassos vocais: o cantor falou sobre dois compassos em loop. Com letra, mantenha-o baixo, 0.3 a 0.5. O ⚠ ao lado do nome das LoRAs avisa quando isso acontece.

### Perfis e modos de planejamento <!-- #profiles-and-planning-modes -->

- **Perfil** ajusta de uma vez o modo, a duração, a amostragem, a orientação, os passos, o VAE, as LoRAs e a saída; os textos e as sementes ficam. *Salvar perfil…* guarda os ajustes atuais com um nome.
- **Modo de planejamento**:
  - **Plano completo**, o padrão: melodia e acordes escritos primeiro (uma partitura editável), depois a canção. O melhor para canções novas.
  - **Só a melodia**: um plano de melodia, acompanhamento livre. Recomendado para covers.
  - **Direto**: direto da letra e do estilo, sem partitura. Adaptadores treinados sem partitura ficam aqui.
  - **Instrumental**: sem vocal, a receita oficial do YuE2. Fica à direita do cabeçalho do modo de planejamento.
- **Acordes**, sob os modos: *Desligado*, *Suave*, *Variado* ou *Ousado*, o quanto os acordes de uma partitura que o modelo planeja podem se afastar. Sozinho, o planejador tende a repetir uma mesma progressão pela canção inteira; *Suave*, *Variado* e *Ousado* fazem um acorde ouvido entre as mudanças recentes voltar mais tarde e mantêm os primeiros acordes de uma seção afastados da anterior, e *Ousado* ainda deixa um acorde sair do tom de vez em quando. Só agem quando o modelo escreve a partitura: Plano completo ou Só a melodia, sem partitura sua ou só com o começo dela. Medido no plano de uma canção: desligado, seis acordes e a mesma série de quatro acordes treze vezes; com a força de *Variado*, nove acordes e a série mais comum quatro vezes. A partir do Yeufonic, pelo yue2.cpp de timoncool. *Suave* é o padrão.
- **Completo ou Direto.** A palavra do Viktor depois de uma semana de canções: o Direto é o acerta-erra do SUNO (cerca de dois takes bons em cem, pela conta dele); o Completo é o caminho para todos, mesmo sem ler uma nota de ABC: as tags são respeitadas, o som assenta, a dicção segura e o andamento se prevê. Medido no rap dele, catorze takes de cada com o Whisper ouvindo: o melhor take de todos foi um Completo com a receita conservadora dele (84 % das palavras ouvidas, 76 % no último quarto). Onde o Completo falha, falha no fim: um take dura o mesmo que a sua partitura, e o plano pode ter menos seções que o texto (aí os últimos versos ficam de fora, ou um anterior é cantado de novo); depois das últimas palavras, os compassos que sobram da partitura continuam tocando, e esses são os 10–15 s depois do fade certo de uma canção, não a orientação. Ouça o fim de um take Completo: *Terminar em…* corta uma cauda, *Regenerar a partir de…* reescreve um fim perdido.

### Covers, remixes e a sua própria partitura <!-- #covers-remixes-and-your-own-score -->

- **Cover ou remix**: pegue a melodia de uma gravação (*Transcrever*: só a melodia, não as palavras nem o cantor), ou a melodia de um dos seus takes, e dê a ela um estilo novo.
- **Ajustar seções** (ao lado de *Transcrever*, depois que a partitura da gravação está no formulário): o Whisper ouve onde começa cada bloco da sua letra na gravação, e cada bloco recebe a etiqueta da seção da partitura em que é cantado. As palavras não mudam: um bloco já nomeado pelo seu tipo mantém a etiqueta, um que não foi ouvido mantém o lugar (incerto), um refrão escrito uma vez é copiado onde é cantado de novo, e as seções em que a voz não canta recebem uma etiqueta vazia. Você vê a proposta, e pode editá-la, antes de ela entrar no formulário; a letra que estava lá fica guardada como versão. Seguindo o YuE2-Studio de timoncool e o Cover Studio de HOT-Step.
- **Trazer sua própria partitura**: uma partitura ABC, seguida no Plano completo e no Só a melodia. Transponha (para o mais perto, para cima ou para baixo), mova uma voz por graus da escala, importe um arquivo MIDI (uma linha melódica por voz), exporte MIDI ou marcadores para uma DAW, carregue um exemplo, torne-a instrumental. **Gerar** com uma partitura aqui pergunta antes: nesta partitura, ou numa nova (o campo esvaziado, o modelo de canções escreve uma). A partitura lembra os adaptadores e as forças musicais com que foi escrita (um plano, a partitura de um take); quando os ligados agora diferem, uma linha embaixo avisa, e a pergunta também: com outras forças a música pode se afastar da partitura, o Industrial Rock e os instrumentais mais que tudo. No Completo a partitura fica aberta enquanto tem uma. **Só o começo**, sob a partitura: a partitura do quadro é só o começo da canção, alguns compassos tocados no piano roll ou num teclado MIDI, cantarolados e escritos a partir do som, ou digitados, e o modelo planeja dali o resto da canção, no tom e no compasso dele; a partitura inteira, o seu começo primeiro, é cantada e fica como a do take. Plano completo ou Só a melodia; *Acordes* guia o que o modelo acrescenta. A partir do hum-to-song de Mothersuperior, pelo yue2.cpp de timoncool.
- **O piano roll** (o botão com uma pauta, ao lado de *Remover partitura*): a partitura na janela inteira. Em cima, a partitura no papel duas vezes: como o YuE2 escreveu e como está agora. Embaixo, o tempo desce até dois teclados, o de Vocal sobre o de Ins; as teclas do mesmo tamanho em qualquer tela, as oitavas além esperando nas bordas (um tecladinho delas ao passar o ponteiro). Um clique escreve uma nota do tamanho da grade, arrastar a move, a borda de baixo a alonga, clique direito ou Delete a tira; uma voz do YuE2 canta uma nota por vez, então uma nota posta sobre outra a faz ceder. As sílabas da letra ficam sobre as notas de Vocal. **Shift** e teclas juntas fazem um acorde no compasso do cursor; as teclas do computador tocam uma oitava e meia (brancas em A…', pretas em W…], Z e X uma oitava), um teclado MIDI também toca (**MIDI**), e com **Rec** a tecla tocada é escrita no cursor. **Tocar** (Espaço) soa a partir do cursor, o original ou o editado, Ins como teclas, Vocal cantado com os nomes das notas, ou os dois. **Escrever na partitura** devolve só as linhas que mudaram. De noite o papel é escuro, de dia cinza. Os papéis seguem a faixa (a reprodução, o cursor ou para onde a faixa rolou), o compasso em uso aceso nos dois; um papel rolado à mão leva junto o outro e a faixa, e um clique numa nota do papel põe o cursor no compasso dela. Ins soa como um piano de cauda; Vocal canta as próprias vogais, a, e, i, o, u, como os cantores do VocalSet as sustentam, sem ruído antes delas. **Som ▾**, ao lado de **Play**, tem o **Pedal** (*Notas longas*, o padrão: uma nota de um tempo ou mais continua soando depois do fim, se apagando, até o pedal ser trocado na próxima barra de compasso; *Sempre*: cada nota; *Desligado*), a **Acústica** em volta do piano e da voz (*Seco*, *Sala*, *Salão*) e a **Tampa** do piano de cauda (*Aberta*; *Fechada*, mais escura e suave). O guia das teclas fica clarinho sobre as oitavas graves da faixa; a caixinha dele o recolhe. **Motor → Hardware → MIDI** liga o MIDI para o estúdio todo: um teclado toca no roll, a porta DAW de um M-Audio Oxygen (Mackie Control) conduz Play, Stop e Record. O navegador só dá MIDI a uma página aberta como localhost ou por https: de outro computador, `ssh -L 7777:localhost:7777` para a máquina do estúdio e abra http://localhost:7777. As setas nas pontas dos teclados movem as teclas uma oitava e ◎ as traz de volta às notas da partitura; uma alavanca entre os papéis e o roll dá mais espaço a um ou ao outro (guardada; um clique duplo: como no início), e numa tela alta as teclas de Ins ganham o comprimento próprio de um piano de cauda. **Tocar** toca no andamento ao lado (uma partitura em andamento livre não tem, então o roll pega o último definido), e ↑ leva um papel de volta ao início. Vocal canta uma frase como uma voz só, nas sílabas da letra ou em *Dó Ré Mi*. A roda de pitch de um teclado MIDI move o cursor no tempo e a roda de modulação define a duração de uma nota nova. **⇅ Transpor**: arraste pelos números de compasso à esquerda para escolher um segmento, e desenhe o deslocamento numa linha de pontos, por um semitom, um quarto, um terço ou meia oitava, uma oitava ou duas, em degraus ou suave; *Para menor* ou *Para maior* vira uma parte com seus acordes, *No tom* mantém suas notas no tom; *Aplicar* é um só passo para desfazer. O número de teclas no cabeçalho abre a sua lista: quantas teclas tem o seu teclado MIDI (88, 61, 37 ou 25, cada um diz o que é) e quais oitavas estão à vista; o andamento, um botão em negrito ao lado de **Play**, abre a sua: −4, −1, +1, +4, um controle deslizante e o da partitura. Sem compassos escolhidos, **⇅ Transpose** pega a seção no cursor. A letra fica também sob a pauta Vocal das duas folhas, e as poucas notas que a introdução dá à voz antes da estrofe cantam as primeiras sílabas da estrofe. Uma partitura em que o YuE2 escreveu um compasso fora do compasso (18/16, por exemplo) também abre: o roll lê esse compasso igualado (o que sobra, cortado; um compasso curto, completado com pausa) e diz isso, e uma linha que você não mexe volta como o YuE2 a escreveu. As palavras da folha estão em Noto Sans, estreitada como numa partitura impressa: os nomes das vozes a 76 %, acordes e letra a 90 %.
- **Recitar a letra numa partitura** (*Pôr a letra nesta partitura…*, sob a partitura assim que ela é lida): o narrador do promo do estúdio, para as suas palavras. Cada verso vai nos compassos da partitura, uma sílaba por colcheia (uma semicolcheia, como se diz o rap, onde colcheias deixariam versos de fora) numa nota do acorde do seu compasso, um respiro depois de vírgula e ponto, a última sílaba do verso uma semínima mais grave; cada seção começa numa frase de dois compassos depois de um compasso de pausa, ou depois de um vocalise quando você marca. Os instrumentos, acordes, tom e andamento ficam; as seções da partitura seguem as suas tags, com uma intro e uma outro em volta. Para palavra falada, leituras e rap sobre uma base: faça a base, *Escrevê-la a partir do som*, depois isto; pergunta antes, e Ctrl+Z em cada caixa traz o texto antigo de volta.
- **Base de acordes** (*Base de acordes* sob a partitura: a tonalidade, o compasso, o andamento e *Escrever uma base*): uma partitura sem melodia, só o seu esqueleto. Cada seção da sua letra recebe compassos, cerca de 2.5 s por linha cantada em pares de compassos, um break, uma intro e um final alguns próprios, e cada compasso um acorde; os compassos da voz são pausas e os dos instrumentos ficam vazios. A tonalidade e o andamento vêm do estilo quando ele os nomeia, e cada clique sorteia novas progressões: uma para as estrofes, outra para os refrões, uma terceira para as pontes. O modo de planejamento passa a *Plano completo*. O modelo escreve a melodia sozinho e canta as suas palavras sobre essa harmonia: você escolhe os acordes e a forma, ele encontra a melodia. Medido em dois takes (22.10.2026): o som seguiu os acordes da base compasso a compasso, mais de perto que todos os 300 embaralhamentos dos mesmos acordes e que os mesmos acordes em qualquer outra tonalidade; cantou sobre as pausas (a voz em 75 % e 34 % dos quadros, contra 79 % e 49 % numa partitura planejada); e um take não fica preso à duração da base: os dois duraram cerca de 70 s numa base de 40 s e seguiram com a sua última progressão. Portado do YuE2-Studio de timoncool (MIT).

### Amostragem e remoção de ruído <!-- #sampling-and-denoising -->

![Amostragem: o planejador de partitura e os tokens musicais, os limites de tokens travados](guide/sampling.png)

Os padrões são ajustados. As três linhas de **forma** (Composição, Interpretação, Estilo) movem os ajustes juntos em cinco degraus; os ajustes em si ficam embaixo.

- **Planejador de partitura** e **Tokens musicais**: temperatura, top-p, top-k, penalidade de repetição, janela de penalidade.
- **Tokens mín.** e **Tokens máx.** ficam **travados** contra uma edição perdida: clique no 🔒 ao lado do nome para mudá-los, e de novo para travá-los. Os pisos são fusíveis: uma partitura não pode terminar antes de 200 tokens, a música não antes de 750 (30 segundos; uma duração pedida menor o baixa para essa duração). O máximo da música aparece como **Duração máx.**, em tempo (25 tokens por segundo), sem trava: é a duração da canção no máximo, ajustada só aqui (Som e saída não tem campo de duração).
- Cada ajuste é mantido dentro de limites sensatos; um valor além deles é puxado de volta, e a página avisa.
- **Orientação (CFG)**: a orientação da música, a força do estilo na etapa da música; 1.6 por padrão em todos os modos.
- **Orientação da letra**: a própria da letra, à parte do estilo: um terceiro ramo, o prompt sem a letra, ao lado dos dois que a orientação sempre teve; 2.2 por padrão. O ouvido de Viktor numa canção popular: orientação 4.0 com a letra a 2.2 a mais brilhante, 3.0 com 2.2 igual, 3.0 com 1.6 uma profundidade própria, a letra a 2.6 traz o shaker para a frente; a 1.6 as palavras se dissolvem, aveludadas. Iguais, metade da letra desliza para a alucinação, perde-se o С (s) e a tônica das vogais entorta: mantenha as duas 0.4 a 1.0 afastadas. Uma luz ao lado de cada campo diz isso: verde dentro da faixa dele (a música 1.0–4.0, a letra 1.0–2.6, afastadas por 0.4 ou mais), âmbar um pouco além, vermelha muito além; nada é travado. Vazio, a letra segue a orientação, como antes.
- **Som e saída**, a parte de baixo do bloco: **Passos de remoção de ruído** e **Solucionador** para a metade som, **Formato** (WAV 24 bits, 16 bits, 32 bits float ou MP3 com a taxa de bits) e **Corte de picos**; *Redefinir saída* os devolve. Dos solucionadores, *Ponto médio · final* e *Heun* chamam a rede duas vezes por passo, *Multipasso · AB2* (Adams–Bashforth de segunda ordem: reaproveita o passo anterior) uma vez por passo, e *Euler · rascunho* uma vez, de primeira ordem. Depois deles, **Decodificação do som**: *Canção inteira · padrão* (o padrão e a única decodificação em todo o resto do Estúdio) ou *Escada · experimental*: a metade do som em pedaços iguais de cerca de 20 s, cada um ouvindo 2 s além das bordas, as junções em crossfade; com os mesmos códigos e sementes sai perto da decodificação da canção inteira, não igual.

**Uma receita conservadora para o russo** (a do Viktor, de ouvido): Composição *baixo*, Interpretação *baixo*, Influência do estilo *alto*: o planejador de partitura com temperatura 0.85, top-p 0.92, top-k 40, os tokens musicais com 0.85, 0.93, 80, as penalidades de repetição 1.005 e 1.3 numa janela de 100, orientação 1.6 com a própria da letra 2.2; 32 passos de remoção de ruído com Midpoint. Sem aceleração, rap num ritmo moderado. É o perfil embutido *Musical Heresy of Creator's Ear*, que o Viktor ajusta: Salvar por cima dele nos perfis guarda os valores dele no Forge, Excluir traz estes de volta.

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
- **Fazer de novo**: *Refazer* (um take novo a partir do mesmo pedido), *Usar como base* (o pedido de volta ao formulário), *Renderizar o som de novo* (a mesma música, som novo), *Regenerar a partir de…* (manter o começo, escrever o resto de novo), *Transcrever este take*, *Cortar no texto* (cortar uma cauda depois do último verso cantado), *Terminar em…* (o take terminando no momento que você escolhe, os últimos 2 s em fade; a partir dos latentes guardados, em segundos), *Fade de entrada…* (os primeiros segundos subindo do silêncio, 2 s a não ser que diga outro valor; do mesmo jeito). *Estender…* mantém o take inteiro e o continua além do seu fim, de 0:15 a 2:00 a mais, com linhas novas depois das suas se você as der (um take planejado com partitura continua em Direct: a sua partitura termina onde termina o take).
- **Editar** (cada vez um take novo; este fica): *Recortar…* fica com o trecho de uma seção a outra; *Remover uma seção…* tira seções; *Repetir uma seção…* toca as seções marcadas duas vezes, a cópia logo depois (o último refrão mais uma vez); *Inserir uma parte…* põe a cópia de uma seção depois de outra (uma intro ou um break como interlúdio); *Velocidade…* deixa mais rápido ou mais lento, a altura mantida. Tudo nas barras de compasso da partitura (a do próprio take ou a escrita a partir do som dele), cada emenda feita por um crossfade curto, a partitura unida junto. Cada um destes diálogos, como os do menu da onda, mostra a onda do take com os trechos marcados: o que é copiado, onde entra, o que sai e o que fica, seguindo as suas marcas.
- **Lapidador**: *Espectro*, *Checagem da letra*. **Arquivos**: o pedido e a partitura. *Loop…*: 1, 2, 4 ou 8 compassos nas barras de compasso da partitura a partir do compasso onde o player está, sem emenda (o fim corre para o início), salvo como WAV com o andamento e o tom no nome.
- **Nota**: o que funciona, o que corrigir, para onde vai.
- O cartão abaixo diz como foi feito: modo, formato, VAE, modelo, passos, a forma, as LoRAs com as forças e as ondas, as duas sementes (copie-as para repetir).
- **Sobre a sala** (⤡) o take fica em duas colunas: o que fazer com ele, o Estilo e a letra à esquerda; como foi feito, o VAE e a partitura à direita. Um take novo abre com o Estilo e a Letra recolhidos; as ferramentas ficam em grupos emoldurados.

![Como um take foi feito](guide/take-info.png)

### Substituir uma seção <!-- #replace-a-section -->

Quando o estúdio já situou de ouvido a letra de um take (as seções desenhadas na onda do player), uma seção pode ser cantada de novo enquanto o resto fica como estava. Clique direito na onda sobre a seção → **Substituir esta seção…**.

- **O que se canta**: cada seção ouvida com clareza é um chip; a que você clicou está marcada, e você pode marcar outras, até oito. Cada seção marcada mostra seus versos como estão na letra: mude as palavras, ou mantenha-as e deixe só a música ser nova. O diálogo avisa quando as palavras novas têm mais sílabas do que a seção tinha (o modelo as canta mais rápido ou passa do corte) ou menos. **Cantar de novo** começa.
- **O que chega**: uma ou duas versões, cada uma um take próprio e filho deste, com o nome da seção e do seu trecho («Song · Chorus 1:02–1:25 anew A»). Chegam ao espaço de trabalho do take (em «Substituir uma seção» quando ele não aceita takes novos) e aparecem em Takes conforme cada uma fica pronta.
- **Como se junta**: os cortes caem nas pausas ouvidas em volta da seção. A música do take até o primeiro corte é mantida, a seção é cantada com uma semente de música nova, juntada à música do próprio take depois dela nos tokens do próprio modelo, e o todo é renderizado de novo com a semente de som do take: o que não foi substituído soa como soava, e as junções não se ouvem. Várias seções são cantadas uma de cada vez e a duração não muda, então os cortes seguintes ficam onde você os ouviu.
- **No player** o trecho novo aparece tingido e contornado, com «de novo» em cima; o seu cartão diz que o resto é como o take de origem o fez.
- **Pequenas edições funcionam melhor**: um verso com as mesmas sílabas, uma palavra, uma tag. Uma semente nova também pode cantar uma seção sem a letra: ouça as duas versões. Uma verificação de que cada versão cantou suas palavras chega na 2.1.0.
- **Cantar mais uma vez…** e **Inserir um interlúdio depois…** (o mesmo menu): a seção é cantada de novo logo depois de si mesma, de imediato ou depois de cerca de 4 ou 7 s de música, uma variação com a semente musical do take + 1 (e + 2), não uma cópia; ou cerca de 5, 7 ou 10 s de música depois dela, sem cantar nada de novo. O modelo toca quanto quer, então o estúdio corta pela voz do próprio rascunho, separada no processador, e nas barras de compasso da partitura: entram compassos inteiros da música dele (do meio, se tocou mais), e a música do take depois deles segue no seu pulso. Takes novos; este fica.
- **Cantar de novo esta linha…** (o mesmo menu, sobre uma linha): só essa linha é cantada de novo com uma semente musical nova, as palavras mudadas ou as mesmas, cortada a meio caminho das linhas vizinhas; o resto do take fica como estava. Onde as linhas se emendam sem respiro entre elas, ouça as duas versões.
- **Cantar uma janela de novo…** (o mesmo menu, em qualquer ponto da onda, sem seções): um trecho que você põe arrastando pela onda do take é cantado de novo com adaptadores próprios: no início os do próprio take, cada um com sua força de música e de som e sua onda na janela (plana, arco, subida, descida), e você pode acrescentar outros da sua pasta loras/. Nas rampas antes e depois (2 s cada uma no início) os adaptadores do take cedem aos da janela e voltam, então a mudança entra e sai em vez de saltar; o resto do take fica como estava, renderizado de novo com a sua própria semente de som. Uma ou duas versões, filhas do take, marcadas no player como uma seção substituída.

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

Os passos são nós na tela abaixo, de três tipos conforme o trabalho avança: **Análise** (Espectro, Artefatos, Letra), **Reparo** (Antizumbido, Upscale, Stems) e **Acabamento** (DAW, Remasterizar). Um clique num nó abre o seu passo numa janela sobre a tela, e o que é feito a partir do take fica pendurado na sua árvore. Os passos próprios de um plugin entram em **Acabamento** com uma borda tracejada (veja `docs/PLUGINS.md`). Um passo de plugin marcado **GPU** roda numa placa das tarefas do laboratório, na vez delas, e um passo feito para um tipo de arquivo (um stem de voz, por exemplo) pega sozinho como fonte o último arquivo desse tipo, até você escolher outro.

Tudo o que é feito a partir de um take fica pendurado na sua **árvore** (*Feito a partir deste take*), o mais novo em cima: **o original** primeiro, com o player e o FLAC, depois cada ramo, tocável e utilizável como fonte para a próxima etapa. O que roda aparece onde você olha: no cabeçalho da sala, no topo do bloco da própria etapa e como um ponto pulsando na aba dela. O bloco de cada etapa lista o que ela fez para o take (*Feito aqui*: um clique o encontra na árvore), e a etapa aberta acende os próprios ramos. **Excluir**, no fim do cabeçalho de um ramo, leva-o para a lixeira do take (perguntando; um ramo do qual foram feitos outros pergunta de novo e leva-os consigo); **Lixeira**, sob a árvore, traz um de volta, e **Esvaziar a lixeira** apaga para sempre. A árvore tem o seu próprio lugar no fim da coluna de passos do Lapidador: **Feito a partir Deste Take** sob *Este take*, na sua marca o número dos seus ramos; um clique abre-a onde está um passo, e ela acende os ramos do passo de onde vieste. O que corre no Forge tem também a sua barra acima do leitor em cada sala, com o tempo que falta. Com um monitor guardado em **Audio I/O** (uma segunda saída no Forge), cada linha tem **No Forge**: o arquivo toca por ele a partir de onde está o seu leitor, e outra vez para-o.

**Comparar tudo** (na linha do original, ou *Comparar* em qualquer ramo) abre cada versão num só player, como o SUNO troca de versão: o original, o sem zumbido, as remasterizações, os upscales, os stems. Um clique em outra versão, ou o número dela (1–9), a toca **a partir do mesmo segundo**; Espaço toca e pausa, ← → movem cinco segundos, Esc fecha. A mesma música em outros takes também entra, depois do original: as re-renderizações com outro VAE ou outra semente sonora, cada uma com o nome do VAE, da semente e de quando foi feita; um take que você não curtiu fica de fora. Com **Loudness igual** (ligada até a desligares) cada versão é baixada à loudness da mais baixa, medida no Forge, e a sua linha di-lo: o ouvido compara o som, não o nível.

### Importar uma faixa <!-- #import-a-track -->

WAV, FLAC, MP3… de qualquer lugar: vira um take na biblioteca (48 kHz, 24 bits), marcado *importado*, pronto para stems, remasterização e o resto. A letra é opcional; a checagem da letra compara com ela.

### As etapas <!-- #the-steps -->

![As etapas](guide/post-steps.png)

Não há cadeia pronta: o caminho do take você traça na tela, de nó em nó (veja *Seu próprio caminho* abaixo), ou começa de um pipeline, e **Executar o caminho** no cabeçalho da sala o executa. Num caminho que separa stems do take depois do Antizumbido (e do Upscale), a remasterização os mixa, por isso o seu preset e o de-esser agem também ali; um upscale antes da separação deixa os separadores ouvirem a canção inteira, e um no final redesenha o topo que os stems e a remasterização deixam (um chiado acima de 20 kHz, quase nada acima de 22). Um a um:

1. **Espectro**: espectrograma, espectro médio, energia por banda; ponha outro take por cima para comparar.
2. **Artefatos**: um tom que não vai embora, o zumbido de 25 quadros do VAE nos agudos, cliques, clipping, falhas, um estéreo que briga consigo mesmo. Um tempo toca a partir dali.
3. **Antizumbido**: o decodificador do YuE2 escreve o som em quadros de 1920 amostras, 25 por segundo, e os agudos tremem com eles. Isto tira a parte presa a esse relógio de quadros acima de 2 kHz. 80 % é a escolha do ouvido; 100 % afina o ataque.
4. **Letra**: o Whisper ouve e compara o que ouve com a sua letra, minuto a minuto; *Sincronizar as linhas* para a temporização de karaokê. No stem vocal ele ouve as palavras sem a música. As linhas cronometradas descarregam como .lrc e .srt, e como **.lrc (por palavra)**, cada palavra no seu tempo, para um player que acompanha o canto (as linhas continuam tuas; do Whisper vêm só os tempos).
5. **Stems**: quatro stems (BS-Roformer para a voz, depois htdemucs_ft para bateria, baixo e o resto; o instrumental também), seis stems (a mesma voz, depois o BS-Roformer-SW de jarredou: bateria, baixo, guitarra, piano e o resto), oito stems (os seis, com a voz em duas por um modelo de karaokê, **Lead Vocal** e **Backing Vocals**, e os sopros tirados do resto), ou vocal + instrumental. Cada stem leva o seu nome próprio (Lead Vocal, Drums, Winds…) na árvore, no seu download e na sua DAW. *Fonte* é o take ou um arquivo dele sem zumbido ou ampliado, cada fonte com o seu conjunto; a sua DAW recebe o conjunto mais novo de cada tipo.
6. **Remasterizar**: mixe os stems ou pegue o take; limpar, de-esser, opcionalmente reafinar 440 → 432 Hz, loudness (LUFS) e true peak. Cada execução é um ramo novo. O preset e o de-esser trabalham nos stems antes da mixagem: com o take ou qualquer arquivo único como fonte ficam desligados, e num caminho trabalham quando ele separa stems.
7. **Upscale**: o UniverSR redesenha o topo do espectro; o original fica amostra por amostra abaixo do corte. Numa remasterização (a última etapa de um caminho) o arquivo inteiro é baixado se o novo topo passar do teto de true-peak da remasterização.
8. **Passagem digital**: o take ou qualquer ramo através de um caráter analógico em números no Forge: fita (30, 15, 7.5 ou 3.75 ips: a corcova da cabeça, os agudos, o chiado, wow e flutter, o azimute), console, válvula (com o seu afundamento), transformador ou vinil (graves em mono, estalidos, ronco). A curva corre sobreamostrada; o resultado soa tão alto quanto chegou, o seu pico real abaixo de −0.3 dBTP, e a árvore diz o que acrescenta a um tom a −12 dBFS. Os pontos de partida definem um caráter num clique; um ramo dela pode ser a fonte da passagem analógica ou do Remaster.
9. **Voz principal inteira**: num conjunto de oito stems, onde a separação pôs a voz principal em Backing Vocals (mais alta ali do que na principal, alta o bastante e centrada), ela volta para Lead Vocal com rampas curtas. Principal e coros juntos continuam o que eram, amostra por amostra: a mixagem não muda, só qual stem leva a voz. Ambos voltam como versões dos seus stems para o DAW e os passos seguintes do caminho; a árvore diz onde a voz voltou e por quantos segundos.
10. **Upscale das vozes**: o UniverSR só nos stems de voz (principal e coros, ou só a principal) redesenha o ar, o fôlego e o fio das consoantes que os separadores embotaram; o resto abaixo do corte fica amostra por amostra. Cada um volta na taxa do seu conjunto como versão do seu stem. Seu **Upscaler** é o UniverSR sozinho (o padrão) ou o conjunto dos três, UniverSR, Apollo-vocal e FlashSR, misturados acima do corte: na média (medida como a mais próxima do agudo próprio de uma voz), o mais forte, ou ar (média até 16 kHz, o mais forte acima); **Agudo desenhado** sobe ou desce o que desenharam. Os pipelines *Vozes: sutil, normal, alto, ar, brilhante* o usam. O Apollo-vocal é não comercial (CC BY-NC-SA 4.0): uma canção feita com ele é sua para compartilhar, não para vender; o FlashSR chega no primeiro uso: os pesos dos modelos do próprio estúdio (Apache 2.0, como declarou o seu autor) e o código dele.
11. **Antes e depois**: qualquer arquivo da árvore contra aquilo de que foi feito (uma mixagem ou uma remasterização de stems contra o arquivo de que os stems foram separados; o take quando não há outra coisa), com o seu próprio botão em cada arquivo: loudness, pico real, faixa de loudness, fator de crista, largura, correlação e a parte de quatro bandas lado a lado, os espectros médios à mesma loudness e a diferença deles, e a loudness de curto prazo ao longo da canção; uma imagem e uma página de números chegam à árvore.
12. **Ajustar a uma referência**: o timbre de um arquivo se move rumo ao de uma referência (um arquivo da árvore deste take ou outro take), deixando a loudness de lado: até oito bandas do próprio DAW (frequência, ganho, Q), cada uma mantida só se ajuda e fica dentro do limite que definires. O arquivo volta com o mesmo equalizador renderizado, tão alto como veio ou como a referência e nunca acima de −1 dBTP; **No master do DAW** no seu ramo põe as bandas no equalizador do master para ouvi-las ao vivo na tua mixagem.
13. **Mono nos graves**: abaixo de uma frequência (120 Hz se você não escolher outra) o lado do estéreo é tirado, sem defasagem, o centro como estava: o baixo e o bumbo ficam no centro, e o estéreo acima continua onde vive. A primeira ferramenta de Shaumarov no bus de instrumentos e no master; o ramo diz quanto dos graves era lado antes e depois.
14. **Cola de picos**: um compressor suave antes de tudo: só os momentos fortes perdem os dB pedidos (3 se você não escolher outro), os transientes mais agudos passam e o arquivo volta tão alto quanto veio. Não segura teto: isso é do passo seguinte.
15. **Teto de true peak**: o último passo de um caminho: um limitador com sobreamostragem e antecipação segura −0.5 dBTP (ou −0.3, −1), conferido por um medidor de true peak. *como chegou* só pega os excessos no volume do próprio arquivo; um alvo de volume (−14, −11, −9 LUFS) empurra para dentro dele, com no máximo 6 dB de limitação.
16. **Domador da voz**: nos stems de voz, onde o espectro da voz se avoluma nesse instante acima do seu próprio curso (uma ressonância, um harmônico áspero: o lobo na voz), a saliência é baixada em parte do quanto sobressai, 4 dB no máximo se você não escolher outro, com entrada e saída suaves; por padrão só o que sobe acima da cor habitual da própria voz, e nada abaixo de 2.5 kHz, onde vivem as vogais. O que não sobressai não é tocado; um «s» que sibila é suavizado onde sibila e nunca encurtado; um só ganho para os dois canais mantém a voz onde estava. O soothe2 e o SpecCraft de Shaumarov como pista; o ramo diz por quanto tempo atuou e onde.
17. **Ataque e corpo da voz**: nos stems de voz, o início das palavras sobe um pouco (2 dB no máximo) e o esmorecer de um som também um pouco (1.5 dB); uma vogal sustentada e o silêncio ficam como estão: a voz vem para a frente sem o aperto de um compressor. Os dois compressores de transientes de Shaumarov na voz como pista.
18. **Baixo sob o bumbo**: o bumbo é encontrado no stem de bateria; enquanto ele soa, a oitava grave do stem de baixo (abaixo de 120 Hz se você não escolher outra, dividida sem defasagem) desce até 3 dB, tanto quanto o bumbo é forte; entre os bumbos e acima da divisão o baixo fica como estava. Precisa de um conjunto com a bateria e o baixo separados; o soothe2 de Shaumarov acionado pelo bumbo como pista.
19. **Detalhes para cima**: três bandas; em cada uma os momentos suaves sobem rumo ao seu próprio nível forte, os fortes nunca são empurrados para baixo, o piso e o chiado ficam; misturado a 10 % como Shaumarov usa o OTT, e de volta à loudness com que chegou: sobe o detalhe sob as partes fortes, não o nível.

**Pipelines.** Ao lado de **Executar o caminho** fica o caminho em mãos: **Meu caminho** ou um pipeline para começar. O estúdio traz *Polimento rápido*, *Canção: stems e remasterização*, *Canção: a minha mixagem do DAW*, *Canção: todo o ar*, *Fita quente*, *Palavra falada* e *Só olhar*, e um plugin pode trazer os seus. Um pipeline é desenhado na tela de nó em nó; *Contornar no caminho*, no clique direito de um nó, pula um dos seus passos. Cada passo pega o que o anterior fez, um arquivo ou o conjunto de stems tal como foi corrigido até ali, por isso a Remasterização e o DAW mixam a voz principal inteira e as vozes redesenhadas, não os stems como foram separados. *Como o DAW está ajustado* pega a mixagem que o DAW guarda para este take. Os fios de um pipeline se cortam e se puxam de novo como os do seu próprio caminho: o primeiro corte ou fio o transforma em **Meu caminho**.

**Muitos takes.** **No espaço…** ao lado de **Executar o caminho** executa o caminho em mãos em cada take do espaço em mãos, ou de toda a biblioteca quando não há nenhum, um após o outro no Forge, depois de perguntar; o menu do Bibliotecário nos takes marcados tem **Refinar N pelo caminho**. A linha do lote ao lado diz em que ponto está, o que falhou e que take está em curso; **Parar** deixa terminar esse take e pula os restantes.

### A tela: nós e fios <!-- #the-canvas-nodes-and-wires -->

![O Lapidador como tela: cada etapa um nó, ligado por onde vai o som](guide/studio-post-canvas.png)

O Lapidador é uma tela de nós, como o ComfyUI dispõe os seus: o take e cada passo em colunas conforme o trabalho avança, ligados por onde o som vai, e embaixo à esquerda o que os alimenta, Importar uma faixa e Audio I/O; embaixo à direita **Feito a partir Deste Take**, sua janela a árvore de cada arquivo feito do take. A sala inteira cabe numa tela em 1080p (numa janela estreita as colunas vão em duas faixas de três). Os nós são numerados conforme o trabalho flui, primeiro os passos do caminho, e **1…9, 0** abrem o nó daquele número, e dois dígitos em meio segundo um nó além do décimo (**1** e depois **2**: o décimo segundo); cada nó diz o que faz ao passar o ponteiro. Um clique abre um nó numa janela sobre a tela, do tamanho do que ela contém; **Alt+← →** vão ao passo anterior e ao seguinte, **Esc** volta; o nó do take abre os Takes, para escolher outro. Arraste um nó para onde quiser: ele se encaixa na grade de 10 px da tela. O ícone da grade no topo da sala, **Organizar**, os dispõe de novo.

O **clique direito** num nó: *Abrir*, *Executar até aqui* (o caminho até este nó e não além; um passo contornado nele é pulado), *Contornar no caminho* (o seu passo pulado, o nó acinzentado), *Testar o caminho até aqui*, *Tornar o alvo*, *Fora do caminho*, *Clonar* e *Organizar*.

**Seu próprio caminho.** O caminho é você quem traça. Um estúdio novo começa só com o take: puxe um fio do ponto dele até o primeiro passo, depois do ponto desse passo até o seguinte; um estúdio que rodava a cadeia antiga a encontra aqui como o seu primeiro **Meu caminho**. Um clique num fio do caminho o corta ali, e os passos depois saem do caminho. Um fio puxado do ponto de um nó para outro põe esse passo logo depois dele no caminho (do ponto do take, em primeiro), e o arquivo mais novo do primeiro vira a **Fonte** do outro. *Fora do caminho* tira um passo e junta os passos em volta. O caminho traçado assim é **Meu caminho**, ao lado dos pipelines, e este navegador o guarda; **Novo caminho**, a borracha ao lado, o esvazia para traçar do zero; **Ctrl+Z** traz de volta o caminho de antes do último corte, fio ou esvaziamento. Um caminho parte de uma de duas fontes: o take ou **Importar uma faixa**. O que é traçado a partir de Importar uma faixa roda sozinho em cada faixa importada em seguida. Um caminho sem nenhum passo não executa nada e diz isso.

**Encaixes e fios.** As entradas de um nó são nomeadas à esquerda e as saídas à direita, como os encaixes do ComfyUI, de três classes: um arquivo (âmbar), um conjunto de stems (turquesa), um stem (violeta). Um fio sai do encaixe da sua classe e entra no encaixe que o recebe, na sua cor: o DAW recebe stems e as versões das vozes e dá uma mixagem; um passo sobre um stem o tira de um conjunto. O caminho é desenhado grosso; o que foi feito do quê, fino; a fonte própria de um passo, pontilhada e só fora do caminho; enquanto um fio é arrastado, aparecem os caminhos que ele pode tomar e só acendem os nós que podem recebê-lo. Um fio a partir de um passo fora do caminho o põe onde fica o seu tipo (depois de Stems, e Stems também se faltar), e o outro depois; um fio para o DAW também põe nas suas faixas os arquivos mais novos daquele passo. A legenda no canto da tela diz isso, e se recolhe.

**Teste e alvo.** *Testar o caminho até aqui* desenha o caminho como ele flui até este nó e confere cada passo com o que chega a ele: um conjunto de stems para um passo que os mixa, o stem que um passo conserta, as interfaces em Audio I/O para um passo que passa por hardware. Nada roda: os fios fluem, os passos que se sustentam ficam verdes e o primeiro que não se sustenta fica vermelho, com o motivo. *Tornar o alvo* marca o nó com ◎: então **Executar o caminho** vai até ele e não além, e o teste vai até ele; *Sem alvo* tira a marca.

**Clones.** *Clonar* põe ao lado um segundo nó do mesmo passo, Remaster ② por exemplo, com ajustes próprios: a janela dele é o painel do passo com os ajustes do clone; os do próprio passo voltam ao fechar, e uma execução dali roda com os do clone. O caminho executa os ajustes do próprio passo, nunca os de um clone.

**Perfis.** O ícone dos controles deslizantes no topo da sala guarda configurações com nome. **Salvar como…** guarda como cada passo está ajustado e onde ficam os nós, nunca as fontes de um take nem os seus pontos de corte; um clique no nome de um perfil põe tudo como faria uma mão; **Salvar a configuração como está agora como** grava a configuração por cima de um perfil, **Excluir** o tira. Quem os guarda é o estúdio, então qualquer navegador os vê.

Cada escolha fica à vista, sem menus suspensos: até oito numa coluna de linhas (as curtas em fila), mais atrás de um botão que abre a lista sobre a página, com um filtro quando é longa.

**Recolher.** **▾** na faixa de tarefas a recolhe à primeira tarefa e a quantas mais houver.

### O DAW: stems em faixas <!-- #the-daw-stems-on-lanes -->

![O DAW: os stems em faixas sobre o console](guide/studio-daw.png)

**Prévia.** O passo **DAW** (em **Acabamento**, antes de Remasterizar) estende um conjunto de stems do take em faixas, como um DAW: cada stem uma faixa, e mais uma, **Resto**: o que a fonte guarda além dos stems (o que a separação deixou escapar). Todas as faixas como estão devolvem a fonte, então as falhas da separação só se ouvem onde você muda a mixagem. Cada faixa veste a cor do que contém: as vozes âmbar, a bateria vermelha, o baixo violeta, a guitarra verde, os teclados azuis, o resto cinza.

Em cada faixa: sua **Versão** (o stem como separado, ou um arquivo feito a partir dele, uma voz limpa por exemplo), seu nível de −60 a +12 dB (duplo clique o volta a 0), **M** para silenciá-la e **S** para deixá-la em solo, e um medidor enquanto toca. Arraste ao longo de uma onda para silenciar um trecho; clique direito o devolve, clique toca dali. Tudo se ouve na hora, todas as faixas num só relógio, amostra por amostra, como será mixado. **Redefinir** volta cada faixa a como foi separada, os retornos e o master também. **A** toma na mão a linha de volume da faixa: um clique na onda põe ali um ponto e o arrasta, clique direito o remove, duplo clique o põe em 0 dB; o volume se ouve e se mixa depois do fader, reto em dB de ponto a ponto. Um clique na versão passa à seguinte, assim duas se comparam enquanto toca; um clique direito mostra todas nos dispositivos do canal. Os cantos de cima de um trecho silenciado fazem o fade para o silêncio e de volta, tanto quanto os arrastares (um duplo clique devolve dez milissegundos), e os seus lados movem-no.

**A régua** sobre as faixas: um clique vai até lá, arrastar desenha o loop e o liga, e o loop toca em volta até **L** desligá-lo. **Ctrl+roda** aproxima em volta do ponteiro, **Shift+roda** anda ao longo da canção, **−**, **+** e **Ajustar** à esquerda da régua fazem o mesmo em passos; a vista segue o cursor de reprodução. Um clique no nome de uma faixa a escolhe para as teclas (veja *Atalhos e truques*). Sob o tempo, as seções da canção como o player as cronometrou (as tags da própria letra, colocadas pelo Whisper): um clique numa vai ao seu início, duplo clique a põe em loop, **[** e **]** vão à seção anterior e à seguinte.

O próprio botão de tela cheia do DAW o estende sobre toda a janela, as faixas tão altas quanto a tela deixa; **F11** na aba do estúdio faz o mesmo enquanto o DAW está à vista. **Esc**, **F11** ou o mesmo botão o trazem de volta.

O **Console** sob as faixas (**Console** na barra do DAW o mostra e o esconde) é uma mesa de mixagem: cada faixa um canal, depois os dois retornos, **Sala** e **Delay**, e o **Master**, sempre à vista à direita. Um canal de cima para baixo: seu nome (um clique abre seus dispositivos), seus inserts (**EQ** com sua curva em miniatura, **Comp** com sua redução enquanto toca), os envios à sala e ao delay, largura e pan, **Ø** para a polaridade, **M** e **S**, e o fader com seu medidor numa só escala: pico e RMS dos dois lados, o pico retido por um instante, e abaixo o pico mais alto desde a última limpeza (um clique limpa). **+ VCA** depois das faixas acrescenta um VCA, um fader sobre um grupo de faixas (a faixa escolhida é o primeiro membro): o seu fader soma os seus dB ao fader próprio de cada membro, que fica onde está, o seu **M** silencia-os e o seu **S** põe-nos em solo; os seus dispositivos dão-lhe nome e escolhem os membros, e uma faixa pode estar em mais de um.

Botões e faders: arraste para cima e para baixo (**Shift** mais fino), a roda ou as setas quando escolhidos; duplo clique volta um ao que era. O número de um botão ou fader aceita também um valor digitado: um clique nele, ou um dígito com ele escolhido, abre um campo; Enter o fixa nas suas próprias unidades (dB, Hz com k para milhares, ms ou s, %, 4:1, L30 ou R30, −∞ para um envio), Esc o deixa como estava. **Ctrl+Z** desfaz e **Ctrl+Shift+Z** refaz, toda a mix passo a passo. **A** e **B** guardam duas mixes do conjunto para comparar enquanto toca: B começa como cópia de A, e o que você ajusta vai para a acesa.

**Mixes**, a terceira aba do console: a mix que você ajusta fica guardada no Forge ao lado dos stems do conjunto um instante depois que sua mão para, então o DAW abre como você o deixou em qualquer navegador, em qualquer máquina; **Salvar como** a guarda com um nome, um clique num nome a traz de volta (com Desfazer atrás), e **✕** exclui uma quando você diz. Onde o Forge não a guardou, a aba diz por quê.

Os **Dispositivos** de um canal (um clique em seu nome, em seu **EQ** ou em seu **Comp**): **Entrada** (trim, polaridade, a versão do stem), **EQ** (até oito bandas: sino, prateleiras de graves e agudos, cortes de graves e agudos, notch; duplo clique na curva adiciona ali uma banda, arraste seu ponto, a roda sobre ele define a largura, clique direito a remove; atrás da curva, o próprio som do canal enquanto toca), **Compressor** (limiar, razão, ataque, liberação, joelho e compensação, cinco pontos de partida, sua curva e sua redução) e **Saída** (largura, pan, os envios). A **Sala** tem três espaços, sala 1,2 s, placa 1,6 s e salão 2,4 s, e seu retorno; o **Delay** seu tempo (em ms, ou uma nota num andamento), realimentação, um passa-baixa que escurece cada eco, e seu retorno. O **Master** mostra a loudness enquanto toca pela BS.1770 (momentânea, curto prazo, integrada desde que se apertou ▶), o true peak, a correlação dos lados e o espectro. **Mono** e **Atenuar** sob o master mudam só o que você ouve, nunca a mix. **Escuta** do compressor o liga a outro canal tal como entra no próprio compressor, e **Sob a voz** liga um canal à voz principal: a banda sob a voz. Os dispositivos do master desenham também o goniômetro: o centro para cima, os lados de través. Os dispositivos do **Master** guardam a sua cadeia na ordem por onde vai o som: **EQ**, **Compressor** (ouve-se a si mesmo) e **Limitador** (o limitador do Plenio que olha em frente: teto, empurrão, liberação), depois o seu fader; a faixa do master mostra-os como slots, cada um com a sua redução enquanto toca. A **Mistura** do compressor é compressão paralela: o som dele junto ao seco, 100 % só o compressor; o ponto de partida **Paralela** a põe em 40 %, e a mix no Forge igual. O **Gate**, um terceiro insert em cada faixa, é um expansor para baixo contra o vazamento que a separação deixa entre as frases: ele ouve a própria faixa depois do seu EQ e, abaixo do seu **Limiar**, a abaixa pela sua **Razão**, nunca mais que a sua **Profundidade**; a mix no Forge igual. Cada retorno tem também **Corte de graves** e **Corte de agudos** (desligados em 20 Hz e 20 kHz; no delay cortam todos os seus ecos por igual, depois da realimentação), e a sala o seu **Pré-delay**, além do do próprio espaço: a palavra clara antes que a sua sala entre; a mix no Forge igual. Os dispositivos do master mostram ao lado mais dois números: LRA, a faixa de loudness desde o play pela EBU Tech 3342 (quanto a loudness de curto prazo se move), e PLR, o pico real acima da integrada (quanto menor, mais esmagado); quando uma mix é feita, a sua mensagem diz também o LRA do render.

**Automação além do volume.** **A** numa faixa toma uma linha em mãos, e a ficha ao lado diz que botão a linha desenha: **Vol** (o volume, depois do fader), **E–D** (o pan), **Larg** (a largura), **Sala** e **Dly** (os envios para a sala e para o delay); um clique passa ao seguinte. Um clique na onda põe um ponto e arrasta-o, o clique direito tira-o, o duplo clique dá-lhe o repouso do botão (0 dB, o centro, como está, nada). Um botão com linha toca a sua linha em vez do seu próprio valor, ao vivo e na mixagem, em linha reta entre os pontos.

**Inserts e Imprimir.** A **Entrada** de uma faixa tem **Insert**: a versão da faixa tal como toca, pela **Passagem digital** (fita, console, válvula, transformador, vinil) ou o passo de um plugin num arquivo, no Forge. O que volta passa a ser a nova versão da faixa, ouvida logo como será mixada, e as suas versões guardam o caminho de volta. **Imprimir** do master envia a mixagem tal como o DAW a tem (as suas versões e cada botão) pela Passagem digital: um ramo na árvore ao lado das mixagens do DAW.

**Buses de áudio.** **+ Bus** na consola faz um bus da faixa escolhida: o som dos seus membros (depois do seu pan; os seus envios continuam a sair das suas próprias faixas) somado e passado pelo equalizador, compressor, fader, largura e pan do próprio bus até ao master. Os seus dispositivos escolhem os membros (uma faixa vai para um só bus; uma de outro bus passa para cá), o nome, o equalizador, o compressor e a saída; **M** silencia-os todos. A mixagem no Forge soma-os e processa-os da mesma forma.

**Mover e copiar.** **Shift** e um arrasto ao longo de uma faixa escolhem um trecho (um arrasto simples continua a silenciá-lo). **Ctrl+C** copia-o, **Ctrl+X** toma-o para mover, **Ctrl+V** põe-no no cursor na sua própria faixa: o que lá estava é substituído com transições cruzadas de 10 ms, o trecho é desenhado com a onda que traz, e a fonte de um trecho movido cala-se (o Ctrl+V seguinte põe uma cópia). **Delete** silencia o trecho escolhido, **Esc** larga-o, um clique direito num trecho posto tira-o; desfazer devolve tudo. Um trecho posto fica sobre os cortes da faixa, e a mixagem no Forge põe-no da mesma forma.

**A referência, a luz do solo e os fades da canção.** **Ref** na barra do DAW (ou **R**) toca o som como veio, aquele de que os stems foram separados, no lugar da mix e tão alto quanto ela no que já tocou, para comparar o som e não o nível (mais alto sempre parece melhor); o botão diz quanto ele subiu ou desceu, **Mono** e **Atenuar** também o ouvem, e um segundo toque devolve a mix. Enquanto uma faixa está em solo, a barra mostra **S · n**, quantas faixas se ouvem, pois **Mixar** faz só elas: um clique nele, ou **Alt**+clique em qualquer **S**, e todas voltam a se ouvir. Os dispositivos do **master** têm os **Fades** da canção: **Entrada** a sobe desde −60 dB, **Saída** a desce a −60 dB antes do fim, e **Termina em** põe o fim no cursor (silêncio depois; **No fim da canção** devolve o fim). O fade é linear em dB, depois do fader do master, desenhado escuro sobre as faixas, e a mix no Forge o tem igual.

O que você ouve é o que se mixa: as mesmas bandas de EQ, o mesmo compressor do Plenio (na thread de áudio do navegador, ou na própria thread da página quando o estúdio é aberto pelo seu endereço de rede), o panner estéreo do navegador e sua lei na mix, o mesmo impulso da sala, os mesmos ecos. Uma única diferença: depois de um salto na canção, a memória do compressor recomeça.

**Mixar** faz a mix como se ouve, na máquina do estúdio, com o EQ, o compressor, a sala e o delay do próprio Plenio (Plenio 0.8.0, Apache-2.0, levado sem mudanças): um ramo novo na árvore, sua loudness medida; uma mix com pico acima de −0.3 dBFS é abaixada até ali e diz quanto. **+stems** ao lado escreve cada canal como soa na mix, e cada retorno, como seu próprio arquivo ao lado da mix, para um DAW seu. Enquanto corre, **Parar** ao lado termina-a no Forge e nada é feito. A cadeia do master é misturada pelo próprio Plenio também, limitador incluído.

## Pintor <!-- #artist -->

A sala que pinta: uma capa para cada take, um 16:9 para o vídeo, um 9:16 para um short, a partir das suas palavras, de uma imagem sua, ou dos dois. O formulário à esquerda, o palco no meio, a biblioteca à direita.

### Imagens para as suas canções <!-- #pictures-for-your-songs -->

Escreva o que você vê para a canção, em frases: o Qwen-Image lê um prompt como uma descrição, não como uma lista de tags. Ponha primeiro o que está na imagem, depois a luz, as cores e a técnica (óleo, tinta, uma fotografia), e termine com *no text* quando não quiser letras nela. **Do take** põe no prompt aquele de onde o take em mãos ganhou a arte, ou um feito do título e do estilo dele, para começar.

**Formatos**: **1:1** (1280 × 1280) para a capa, **16:9** (1920 × 1080) para um vídeo, **9:16** (1080 × 1920) para um short. Os formatos de um mesmo clique compartilham a semente, então saem como uma série: a mesma cena nas mesmas cores, cada uma composta para o próprio quadro em vez de uma imagem cortada de três jeitos. **Variações** desenha também as sementes seguintes (a semente, a semente + 1, …), cada uma em todos os formatos.

**Semente**, com o modo ao lado: **Aleatória** (−1: uma semente nova a cada clique, o campo vazio), **Aleatória, fixa** (uma semente aleatória posta na hora e mantida), **Fixa** (a que está escrita), **Próximo** e **Anterior** (depois de um clique, o campo passa das sementes que as variações usaram). Um número digitado no campo é essa semente (Aleatória vira Fixa); um campo esvaziado é uma semente nova a cada clique (Fixa vira Aleatória); ⟲ volta a Aleatória. A semente de uma imagem de que você gostou a desenha de novo: cada execução mostra a sua semente, e **Para o formulário** a traz de volta com o prompt.

**Três colunas**: o prompt e os ajustes à esquerda, o palco no meio (a execução sendo pintada se revela ali, o progresso atravessando o topo; senão a imagem que você escolheu, os botões embaixo, os dados e o prompt da execução numa dica ao lado, sobre a biblioteca, enquanto o ponteiro está na imagem), a biblioteca à direita; arraste as bordas entre elas para alargar uma coluna (← → pelo teclado, um clique duplo para a largura original). As escolhas da coluna se esticam com ela, nunca mais estreitas que os nomes dos pintores. A partir de uma janela de 920 px de altura a sala cabe inteira nela: a página fica parada, o formulário e a biblioteca rolam cada um por si, e a linha de Desenhar fica no pé do formulário.

**Prévia ao vivo** (ligada por padrão): o lugar da imagem sendo pintada mostra cada passo dela, do ruído à imagem, a um oitavo do tamanho e vista sem o decodificador, então não custa nada; desligada, o lugar espera a imagem pronta. Uma barra atravessando o topo do palco acompanha a execução, imagem a imagem e passo a passo.

**Duas execuções por vez**: enquanto uma roda, **Desenhar** pede a próxima, que espera atrás dela (Ctrl+Enter também); **Parar**, ao lado de Desenhar enquanto uma execução roda, encerra a que está desenhando (senão a que espera sai da fila); as imagens que ela terminou ficam.

### Os pintores <!-- #the-painters -->

**Os pincéis do Pintor** são uma só lista de cada modelo e arquivo aqui, por grupos: Qwen-Image 2512 de um GGUF (Q4, Q6), cada arquivo fp8 em `artwork/Qwen-Image-2512/checkpoints/` (o BASE do próprio 2512 e os fine-tunes) e Qwen-Image 2.1. **⚡ Lightning** marca um pincel que pinta com ele por padrão; um fine-tune vem marcado como tal. Um arquivo colocado em `checkpoints/` vira um pincel próprio quando a sala relê a lista (após um download ou ao recarregar a página). O Krea 2 Muse saiu do estúdio em outubro de 2026: o Qwen-Image 2512 segue melhor as palavras e letra bem um título.

**Os fine-tunes do Qwen-Image 2.1**: um ficheiro fp8 em `artwork/Qwen-Image-2.1/checkpoints/` (ficheiro único do ComfyUI; o primeiro FinalCut v1) é um pincel do 2.1, *Fine-tune · fp8 · o seu nome*; o próprio ficheiro fp8 do 2512 chama-se *Pesos base*. No resto um fine-tune do 2.1 é o 2.1: a sua licença, a edição por palavras, o letreiro, o Turbo.

**Qwen-Image 2512** (Apache-2.0) de um GGUF em **Q4** (uma placa de 15,5 GB) ou **Q6** (20 GB), ou um **fine-tune fp8** dele (22,5 GB: os arquivos únicos do ComfyUI postos em `artwork/Qwen-Image-2512/checkpoints/`, cada um um pincel próprio); cerca de meio minuto por imagem com Lightning, depois de um ou dois minutos carregando. O **Qwen-Image 2.1**, sob a licença de pesquisa da Qwen (só pesquisa e avaliação: não para uma capa que você vende), pinta a partir de palavras e edita uma imagem de referência pelas palavras do prompt; uma máscara e *Pintar em volta* pedem o Qwen-Image 2512. Numa placa que não comporta inteiro nem o codificador de texto nem o pintor (uma placa de 16 GB, ou uma placa sob um limite de VRAM menor), os dois correm da RAM: sob um limite de 15.5 GB numa 3090, 135 s a partir de palavras com 4.1 GB no pico, 129 s editando com 7.9 GB.

Cada pintor só aparece quando os arquivos dele estão aqui; os outros são citados sob o pintor. **Motor → Modelos e LoRAs → Pintores Qwen** baixa o Qwen-Image 2512 em Q4 (31 GB) ou Q6 (34,5 GB) com Lightning, e o Qwen-Image 2.1 (33,1 GB), cada um perguntado antes com o tamanho (o 2.1 com a licença também). Num terminal: `heresy/fetch-heresy.sh --qwen 2512-q4`. **Baixar pintores e adaptadores…** sob o pintor lista na própria sala o que o estúdio pode baixar para o Pintor: os pintores Qwen, quatro fine-tunes fp8 do Qwen-Image 2512 (Jib Mix Qwen, IntoRealism Qwen, Real-Qwen-Image e o próprio 2512, 20,4 GB cada, compartilhados no repositório de modelos do estúdio com a permissão dos autores) e quatro adaptadores, cada um com o tamanho, aqui ou **Baixar**.

**Qual placa pinta**: um clique espera na fila do laboratório por uma placa com espaço, como fazem a arte dos takes e os stems; enquanto espera, **Fora da fila** o tira. Uma placa que nada mais usa aceita uma execução cuja necessidade cabe na memória dela menos 512 MiB (a parte própria do runtime CUDA); uma placa em uso a aceita quando a memória livre dela comporta a necessidade. Um pintor Qwen-Image 2512 que nenhuma placa daqui comporta inteiro transmite os blocos da RAM: os blocos que cabem ficam na placa, o resto vem conforme é preciso, e a imagem é a mesma, mais lenta pelo que o barramento não consegue esconder (com quatro adaptadores numa placa de 24 GB, cerca de um sexto; com todos os blocos transmitidos, ele ocupa 2,3 GB da placa, então uma placa de 6 GB o pinta, com cerca de 30 GB de RAM); outro pintor que nenhuma placa comporta é recusado na hora, com os números e o pintor que caberia. O Qwen-Image lê o prompt com o codificador de texto (Qwen2.5-VL-7B, 15,5 GB) na placa quando o espaço livre lá comporta, senão no processador, antes de o pintor chegar: a imagem é a mesma de qualquer jeito.

**O filtro de conteúdo**: toda imagem passa por um filtro de conteúdo (nsfw_image_detection da Falconsai, Apache-2.0), seja qual for o pintor (a regra do estúdio para todo pintor): uma imagem sinalizada não é guardada, e a execução avisa.

### Lightning <!-- #lightning -->

**O que é**: o Lightning (lightx2v, Apache-2.0) é um adaptador que ensina o Qwen-Image 2512 a pintar em poucos passos sem orientação: o longo caminho guiado do próprio modelo destilado em 8 passos. O arquivo dele fica em `artwork/Qwen-Image-2512/lightning/` (`Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors`, 0,85 GB) e vem com o download dos pintores Qwen.

**Como o estúdio o aplica**: com o Lightning ligado, o pintor o carrega como mais um adaptador sob as suas LoRAs, na força dele: **1.0** para os GGUF Q4 e Q6 e o fp8 BASE do próprio 2512 (a base de onde foi destilado, nos 8 passos que os autores indicam) e **0.55** para um fine-tune fp8, em 12 passos (um fine-tune se afastou da base, e o Lightning em força total o puxaria de volta; o próprio ajuste do Viktor no ComfyUI). O agendamento vira o do Lightning: um deslocamento de log 3 em qualquer tamanho, como foi treinado. A orientação fica desligada (true CFG 1): uma passada do modelo por passo.

**Desligado**, o pintor segue o caminho próprio do 2512: 30 passos por padrão (10 a 60) e **orientação** 4 (true CFG com o negativo vazio: duas passadas por passo). Sessenta passadas contra oito: a pintura em si leva umas sete vezes mais, o carregamento o mesmo, e dá o detalhe e a luz de um realismo acabado.

**Turbo** é a aceleração própria do Qwen-Image 2.1, como o Lightning a do 2512: o adaptador *Turbo 4step* (de AiMetatron) em `artwork/loras/qwen-image-2.1/`, no mesmo interruptor da *Amostragem*, aí chamado Turbo; desligado salvo pedido (o 2.1 pinta como sempre, 30 passos), ligado de 4 a 16 passos. Numa RTX 3090 a 1280²: 30 passos 96 s, os 4 passos do Turbo 42 s.

**Os padrões dele**: os GGUF Q4 e Q6 pintam com ele (rascunhos, placas menores); um fine-tune fp8 pinta sem, a não ser que você o ligue (realismo acabado); a arte própria de um take é pintada com ele (*Motor → Arte*). A regra por trás: Lightning para rascunhos e capas, não para realismo profissional.

**O interruptor**: em Amostragem, com a força ao lado; ligado, os passos vão de 4 a 16 e Orientação some; desligado, Orientação aparece. Sem o arquivo dele não há interruptor, e o 2512 pinta do seu jeito. A força é guardada para cada pintor; a soma dos seus adaptadores (*Juntos*, abaixo) não conta o Lightning.

**Quanto custa**: numa RTX 3090 em 1328 × 1328, o Qwen-Image 2512 com Lightning pinta em cerca de 30 s por imagem em Q4 (14,3 GB no pico) e 32 s em Q6 (17,6 GB); um fine-tune fp8 a 0.55 e 12 passos em 37 s (21,0 GB). A capa de um take com Lightning levou cerca de um minuto e meio com o carregamento e o prompt.

### Samplers e agendamentos <!-- #samplers-and-schedules -->

**Amostragem** sob o pintor, recolhida, com os valores no resumo: os passos, o sampler e o agendamento, guardados para cada pintor; **Redefinir** devolve os do pintor. Os passos: Qwen-Image 2512 com Lightning, de 4 a 16; senão de 10 a 60; um número fora da faixa fica na borda. A estimativa de tempo do formulário conta as passadas do sampler.

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

**O que duas matrizes mostraram** (54 imagens num laboratório de teste, um prompt, uma semente): no Qwen-Image 2512 **com Lightning, Karras, Exponential e KL optimal podem pintar o tema duas vezes** (dois faróis onde um foi pedido): com Lightning fique com Simple, Beta, Beta 57, SGM uniform ou Bong tangent. **Sem Lightning, o Euler SDE pinta o Qwen suave e enevoado**: Euler, ER-SDE ou RES mantêm o detalhe. O formulário avisa os dois casos quando se aplicam.

**De onde vêm**: escritos para o estúdio a partir dos artigos dos métodos e das fórmulas do ComfyUI (GPL-3.0, que a AGPL do estúdio pode incorporar); os do RES4LYF foram lidos só pela matemática, já que a licença dele proíbe serviços comerciais: nenhuma linha de código dele está aqui; o Heun++ é do Carzit (MIT).

### Regiões <!-- #regions -->

**Regiões** sob *Amostragem*, recolhidas: até três partes do quadro, cada uma com um lugar (uma metade, um terço, um quarto ou o meio; um pequeno mapa ao lado mostra onde) e palavras próprias. A cada passo o pintor é consultado mais uma vez para cada região, com o prompt e as palavras da região, e as respostas se misturam por caixas de borda suave, como faz o Latent Couple; o resto do quadro segue só o prompt. Assim o prompt diz a cena inteira e uma região o que está ali: *dois animais numa clareira com neve*, depois *uma raposa vermelha* na metade esquerda e *uma coruja branca num toco* na direita. Cada região custa uma passada inteira a mais por passo (numa 3090 em 16:9, Qwen-Image 2512 fp8: 141 s sem elas, 281 s com duas regiões). Guardadas neste navegador; uma região sem palavras não é enviada; **De novo** pinta com as da própria execução. Para o Qwen-Image 2512; o Qwen-Image 2.1 edita por palavras e pinta sem elas.

### Letreiro <!-- #lettering -->

**Letreiro** sob *Regiões*, recolhido: um título, e uma segunda linha por baixo (o artista, o álbum), escritos como parte da pintura e não sobrepostos. As suas palavras vão em campos próprios, nunca no prompt: **Título**, **Segunda linha**, **As letras** (como são, em palavras; vazio: maiúsculas clássicas com serifa em ouro quente), **Onde** (em cima, no meio, em baixo) e **Como**: *pintado com a imagem* (o Qwen-Image 2512 ou 2.1 pinta a cena do prompt com as letras nela; o «No text» do prompt de um take é retirado) ou *sobre a referência* (o Qwen-Image 2.1 letreia uma imagem pronta por palavras e mantém o resto; **Letrear** numa imagem torna-a a referência e abre o bloco). Os pintores erram palavras que viram pouco («RUOCH STUDIO»), por isso o ouvinte (Qwen2.5-Omni, cerca de 5 s por imagem) relê cada imagem, e a que tem um erro é pintada de novo com outra semente, até três vezes: fica a primeira escrita exatamente, as outras vão para a pasta misspelled/ da execução. Uma marca junto a cada imagem diz como se lê: ✓ escrito como pedido, ⚠ erro em todas as tentativas (a sua dica diz o que se lê), ? não relido (o ouvinte não está na máquina). Numa 3090 o Qwen-Image 2.1 letreou um quadrado em 118 s; o Qwen-Image 2512 fp8 (sem Lightning) pintou um com as suas letras em 230 s, contando o carregamento. Também em cirílico, mais seguro em maiúsculas. Guardado neste navegador; **De novo** letreia com as palavras da sua própria execução.

### Adaptadores <!-- #adapters -->

**LoRA** sob o pintor: os adaptadores da família dele (Qwen-Image 2.1, Qwen-Image 2512), até quatro, cada um na sua força (0 a 1.5); um clique numa palavra-gatilho dele a põe no prompt. **Adicionar…** abre a biblioteca: as pastas à esquerda, os cartões com as imagens, uma busca. Os adaptadores moram em `artwork/loras/<family>/` do estúdio (`qwen-image-2.1`, `qwen-image-2512`): qualquer pasta dentro vira um grupo, e uma imagem ao lado de um arquivo com o nome dele (`NAME.jpg`, `NAME.png`, `NAME.preview.png`) aparece no cartão. Pegue-os no Civitai pelo modelo base (Qwen) e ponha o `.safetensors` ali; **Consultar no Civitai** envia o SHA-256 de cada arquivo e nada mais, e guarda a resposta ao lado (`NAME.civitai.info`: o nome, o modelo base e as palavras-gatilho, e a primeira imagem classificada como segura quando ele não tem uma). O que o LoRA Manager do ComfyUI ou o Stability Matrix escreveram ao lado de um arquivo também é lido. Um adaptador feito para outro modelo, que não alcançaria nenhuma camada do pintor, para a execução e avisa. Um clique direito na linha de um adaptador o **silencia**: ele fica na lista com a força e sai da execução (**Tirar do mudo** o traz de volta); um adaptador em zero também não é carregado. Os quatro adaptadores que os autores deixam compartilhar vêm de **Baixar pintores e adaptadores…**.

**Juntos**: a partir de dois adaptadores, uma barra embaixo deles mostra a soma das forças na estrada do Criador: verde até 1.2, âmbar até 1.8, vermelho além. Adaptadores empilhados se somam, e acima de cerca de 1.8 uma imagem queima (cores e bordas exageradas) por mais modesto que cada um seja; as zonas são uma primeira medida para imagens, a ajustar de olho. Arraste a barra para mover todos de uma vez, cada um em proporção a onde estava.

### Uma imagem para pintar a partir dela <!-- #a-picture-to-paint-from -->

**Imagem de referência**: uma imagem para pintar a partir dela, de imagem para imagem: solte uma no lugar dela sob o prompt, cole uma (Ctrl+V), escolha um arquivo, ou pegue a imagem do palco com **Como referência**. **Quanto pode mudar** diz a que distância dela a pintura começa: 0.3 a mantém quase como está, 0.6 mantém a composição e muda a matéria, 0.9 pinta a cena do prompt na luz e nas cores dela, 1.0 pinta do zero. Cada formato é coberto pela imagem e recortado do meio dela; **De novo** pinta a partir da da execução; ✕ pinta a partir do ruído outra vez.

**Usá-la** sob a imagem diz como: *para pintar a partir dela* (como acima, pelo pintor do formulário, até onde diz *Quanto pode mudar*), *para editar por palavras* ou *só pelo estilo dela*, ambos pelo Qwen-Image 2.1 quando ele está aqui (senão, desligados). Editada por palavras, a cena fica e o prompt diz o que muda (*o mesmo farol numa noite de inverno com neve*: a neve caiu onde devia, a torre e as rochas mantidas). Pelo estilo, a cena do próprio prompt é pintada com a técnica, a pincelada, a paleta e a luz da imagem, sem nada do tema dela (o farol a óleo deu *uma raposa vermelha numa floresta com neve sob a lua* na pincelada dele). Nos dois casos a execução é do Qwen-Image 2.1, qualquer que seja o pintor do formulário: o modelo, a amostragem, os adaptadores, a máscara e a tela do formulário não são enviados, e vale a licença dele (só pesquisa e avaliação). Cerca de dois minutos por imagem numa 3090.

**Máscara…** ao lado pinta sobre a imagem o que repintar (Pintar, Apagar, o pincel, Inverter, Limpar): o resto fica exatamente como estava, como no inpainting. **Pintar em volta** mantém a imagem inteira no meio de cada formato e pinta as bordas de novo (uma capa quadrada num 16:9 ou num 9:16), como no outpainting. **A capa do take** pega a capa do take escolhido à direita. Com uma máscara ou **Pintar em volta**, quatro opções sob a imagem: **Expandir** (a máscara aumentada em tantos pixels, ou reduzida), **Borda** (quão suave é a borda), **Suaves** (repintura suave, como a difusão diferencial: onde a borda é cinza a imagem muda só nos últimos passos, então sem emenda) e **Grão** (quanto da tinta nova a parte mantida recebe, o grão e a luz costurados ao novo; 0 a mantém exata).

**Tela…** ao lado de **Máscara…** abre a tela, como a do InvokeAI: o quadro de cada formato é uma aba no topo, dizendo como será pintado (**a partir dela**: a imagem cobre o quadro e a execução pinta a partir dela, de imagem para imagem na força pedida; **em volta**: a parte do quadro que ela deixa vazia é pintada em volta). Na prancheta, **Mover** (V) arrasta a imagem, ou um canto para escalá-la mantendo o canto oposto; **Pincel** (B) e **Borracha** (E) pintam a máscara de inpaint por cima; **Mão** (H, ou Espaço segurado) move a prancheta; a roda dá zoom, Alt+roda escala a imagem em volta do ponteiro, as setas a deslocam. À direita as camadas (a máscara com **Inverter** e **Limpar**, a referência com a opacidade só na prancheta) e o lugar dela em números (largura, X, Y como fração do quadro); no topo **Ajustar**, **Preencher**, **Centralizar** e **Igual em todos** (a imagem do mesmo tamanho em pixels nos outros quadros), desfazer e refazer (Ctrl+Z). **Pronto** guarda os lugares com a referência e a máscara no formulário; sob a força o formulário diz como cada formato está, e ✕ o tira da tela.

### O palco e a biblioteca <!-- #the-stage-and-the-library -->

Um clique numa imagem a põe no palco com a execução dela embaixo; um clique na imagem do palco (ou um clique duplo numa imagem) a abre sobre a página no formato dela (← → percorrem a execução, ou a galeria quando foi aberta ali; Esc fecha), com ★, **Para o formulário**, **Definir como capa** e **Baixar** (PNG, tamanho real). No palco, **Nota…** guarda com a imagem, na sua execução, uma nota sua (para que foi feita, as palavras que a letraram, o que tentar depois); a dica da imagem a mostra.

**Execuções ou Galeria**: as execuções mostram cada clique em Desenhar com o prompt e a semente, a mais nova em cima; a galeria mostra cada imagem de cada execução numa grade só, a mais nova primeiro, por formato (1:1, 16:9, 9:16) ou com estrela (☆ numa imagem marca com estrela), em três tamanhos, em blocos iguais: colunas iguais, todo bloco a mesma caixa, cada imagem inteira nele.

**Comparar**: o **Comparar…** do palco, depois a outra imagem escolhida na biblioteca: as duas ficam uma sobre a outra sob um divisor que você arrasta (← → o movem), ou lado a lado (S); X as troca, Esc fecha. **Ctrl** (ou ⌘) **+ clique** escolhe imagens e **Shift + clique** um intervalo: a barra da biblioteca então as marca com estrela ou as manda para a lixeira de uma vez (Esc solta).

**O menu de uma imagem**: um clique direito em qualquer imagem (a de uma execução, da galeria, do palco, a que está sobre a página): **Sobre a página**, **Para o palco**, **Para o formulário** (o prompt, a semente e o formato dela), **Tudo para o formulário** (o pintor, o fine-tune, a amostragem e os adaptadores também: Desenhar pinta aquela imagem de novo), **Como referência**, **Comparar…**, **Definir como capa**, **Upscale** (2K ou 4K, os tamanhos que dão), **Marcar com estrela**, **Escolhê-la**, **Copiar o prompt**, **Copiar a semente**, **Baixar**, **O arquivo numa nova aba**, **A execução dela** (a vista de Execuções, com o cartão dela aceso), **Para a lixeira**. Uma execução que se revela no palco não tem menu. Sobre a página, o menu fica acima da imagem e tem as teclas enquanto está aberto: Esc fecha o menu, o Esc seguinte a imagem.

### Upscale <!-- #upscale -->

**Upscale…** no palco deixa a imagem em **2K** ou **4K**: o lado maior com 2560 ou 3840 px (uma capa quadrada 2560² ou 3840², um 16:9 2560×1440 ou 3840×2160), com um ampliador (ESRGAN, DAT, HAT, SPAN e parentes, lidos pelo spandrel) escolhido na linha que se abre (guardado; o 4x_Nomos8kDAT primeiro quando está ali); a dica de cada botão diz o tamanho que ele dá, e uma imagem que já é desse tamanho tem o botão desligado. O modelo roda quantas vezes o tamanho pede (duas no máximo) e o resultado é levado ao tamanho exato. A imagem grande é uma execução própria ao lado da fonte, em menos de um minuto numa 3090; **De novo** amplia a mesma imagem outra vez, talvez com outro modelo. Os ampliadores moram em `artwork/upscalers/` do estúdio (`.pth` ou `.safetensors`, pastas permitidas); o OpenModelDB lista centenas: atenção à licença de cada um.

**Expandir bordas…** no palco pinta as bordas de uma imagem: a imagem inteira no meio de uma tela mais larga (16:9), mais alta (9:16) ou quadrada, o resto pintado pelo Qwen-Image 2.1 com o adaptador *Outpaint v2* (de AusBoss, em `artwork/loras/qwen-image-2.1/`), os seus próprios pixels colados de volta por cima. Palavras sobre o que está além das bordas são um desejo, não uma necessidade. 25 passos; um 1:1 para 16:9 levou 90 s numa RTX 3090.

**Segunda passada…** ao lado repinta a imagem maior, como o workflow do ComfyUI do Viktor faz depois da primeira passada: a imagem ampliada **×1.5** ou **×2** (pelo pixel mais próximo, como no dele) e pintada de novo pelo pintor da sua própria execução, o fine-tune, os adaptadores, o prompt e a semente, de parte do caminho (*Quanto pode mudar*: 0.3 guarda o desenho e acrescenta detalhe, 0.5 apura a matéria, 0.7 repinta as formas). Os passos, o amostrador, o agendamento e o Lightning são os do formulário quando o formulário pinta com o mesmo pintor, senão os da execução: a receita dele dá à segunda passada muitos passos e nada de Lightning. Um 16:9 de 1920×1080 sai em 3840×2160. Medido numa 3090: Qwen-Image 2512 fp8 em 3840×2160 em 220 s com 12 passos e Lightning (22.9 GB). Não para o Qwen-Image 2.1, que edita por palavras; sem máscara nem tela. **Ruído extra** na mesma linha (0.6 de início, como no dele) e sob o *Quanto pode mudar* de uma referência (0 de início) é o InjectLatentNoise do workflow dele: ruído novo sobre a imagem antes de a pintura partir dela; 0.3 traz grão e detalhe novos, acima de 1 as formas da imagem começam a se desfazer.

### Uma capa para o take <!-- #a-cover-for-the-take -->

Uma imagem quadrada tem **Definir como capa**: ela vira a capa do take em mãos (escolha um à direita), no cartão dele, no player e no MP3 dele. A capa que ele tinha fica guardada ao lado do take (`artwork-removed/`), como um redesenho a guarda, e a outra letra de um par A/B também recebe a nova quando não tem nenhuma.

**A arte própria de um take** (*Desenhar a arte* no menu dele, no Bibliotecário, para um take ou vários) é pintada pelo pintor de **Motor → Arte**: pelas placas (Qwen-Image 2512 Q6 ou Q4 inteiro onde uma placa o comporta, senão Q4 em fluxo da RAM numa placa menor), ou o que você escolher entre os pintores Qwen que esta máquina tem: Qwen-Image 2512 Q4 ou Q6 e cada fine-tune fp8 com Lightning, Qwen-Image 2.1 com a licença dita (não para uma canção vendida). Um fine-tune escolhido que não está mais aqui dá lugar à escolha pelas placas, e a arte diz quem a pintou.

### A lixeira do Pintor <!-- #the-artist-s-trash -->

As execuções ficam na pasta `artist/` do estúdio. **Lixeira** numa execução a move para `trash/artist/`; a **Lixeira** do palco põe uma imagem de lado. A vista **Lixeira** ao lado de Execuções e Galeria mostra primeiro as imagens postas de lado, cada uma com **Restaurar** e ✕, e **Restaurar tudo**; depois as execuções na lixeira, cada uma com **Restaurar** e **Apagar de vez**; **Apagar tudo** no cabeçalho apaga tudo o que ela mostra. Cada exclusão pergunta antes e não pode ser desfeita.

**Lixeira (Arte)** na coluna do Bibliotecário, sob Fora de vista, reúne em mosaico a arte guardada (um clique numa peça marca-a): as execuções do Pintor na lixeira, as imagens postas de lado e as capas tiradas dos takes (por um redesenho, por Remover, por uma capa nova), cada uma com a imagem e o peso. Marque-as para devolvê-las (uma capa volta para o take dela, a que ele tem agora guardada no lugar) ou para apagá-las de vez, depois de perguntar; sem nada marcado, **Esvaziar a lixeira das artes**. As capas de um espaço congelado ficam como estão.

### O log do Pintor <!-- #the-artist-s-log -->

O quadro do log do servidor tem cinco vistas, **Servidor**, **Criador**, **Treinador**, **Lapidador** e **Pintor**, e cada sala abre a sua: a sala do Pintor na do Pintor. O log do Pintor, guardado neste navegador (as últimas 400 linhas), diz o que foi pedido (o pintor, o fine-tune, os formatos, a semente, a amostragem, os adaptadores), o que o laboratório respondeu (uma recusa nas palavras dele), o caminho de cada execução até o fim (espera e por quê, pinta na GPU N, pronto, parado, falhou e por quê), e as próprias linhas do laboratório sobre o Pintor. **Copiar** pega as linhas da vista; recolhido, o quadro mostra a última linha da vista. **⧉** abre o log numa janela própria, as duas vistas espelhadas: no Chrome ela fica acima de todas as janelas (Document Picture-in-Picture); em outros lugares é uma janela para levar a outro monitor. A janela traz as placas ao vivo ao lado do log; o quadro se recolhe enquanto ela está aberta e se abre quando ela fecha, se estava aberto. **Criador**, **Treinador** e **Lapidador** mostram as linhas do log do servidor que pertencem à sua sala: as do motor e da página ao Criador, um treino ao Treinador, stems, remaster, upscale e as mixagens do DAW ao Lapidador; a vista escolhida fica guardada para a sala, e uma sala sem nada ainda no log diz isso.

### Em breve no Pintor <!-- #coming-to-the-artist -->

As versões da imagem de um take; SeedVR como ampliador (com a fase da DAW, na 2.1.0).

## Bibliotecário <!-- #librarian -->

### Todos os takes <!-- #every-take -->

![O Bibliotecário](guide/studio-collection.png)

- **O cabeçalho** nomeia a coleção aberta (*Bibliotecário › Fosforida*) e o que ela tem: takes, horas, curtidas, favoritos, notas, como foram feitos.
- **Espaços** à esquerda: Tudo, Favoritos, Em nenhum espaço, os seus espaços, *+ Novo espaço*; Ocultos e a Lixeira fora de vista. Clique direito num espaço para as **travas** dele (*Travar a exclusão do espaço*, *Travar a exclusão das faixas*): um 🔒 junto ao nome, e nada dele vai para a lixeira. Os espaços 💎 (os conjuntos públicos do estúdio) ficam no pé da árvore, por nome, e os 💎 … LoRA bem embaixo.
- **A playlist** fica em primeiro na coluna, um lugar só dela: nunca é renomeada, apagada ou congelada. Um take entra pelo seu menu (*Adicionar à playlist* › *Primeiro*, *Último* ou *Aleatório*; num cartão marcado, todos os marcados), e × tira-o só da playlist, nunca da biblioteca. A vista dela é uma lista só de cartões largos: ▶ primeiro, depois o título, quando foi feito e a duração, as marcas, e a capa por último. Arraste um cartão ao seu lugar; *Embaralhar o baralho* distribui todos de novo. *Tocar do começo*, ou ▶ em qualquer cartão, toca a playlist na ordem dela até o fim, diga o que disser *Tocar em sequência*, e uma faixa fina sob o player nomeia o take de antes, o lugar na playlist (*Playlist · 3 / 12*) e o take de depois: um clique num nome toca-o, e × sai da playlist. O último botão do player abre a mesma lista numa janela, com o player ainda à vista por baixo. No cabeçalho dela, o crossfade, de 0 a 4 s: o próximo take entra sob a cauda do anterior, os dois já guardados na página, então nenhum espera pela rede; Anterior e Próximo trocam na hora.
- **Busca** por palavras, `*` e `?`; **ordenar** mais novos, mais antigos, por título, mais longos; **Blocos** ou **Lista**: os três na linha do cabeçalho, ao lado das contagens.
- **Um cartão** usa a arte do take no canto superior direito, ao lado do título, quando tem uma (*Desenhar a arte* no menu do take); um clique mostra a imagem inteira sobre o estúdio, onde ‹ › e as setas percorrem as imagens dos cartões exibidos, ▶ toca o take e Esc fecha. O cartão que toca brilha com os picos da própria canção. Uma faixa fina na borda esquerda do cartão diz o seu veredito: a cor de destaque para ★, verde para 👍, um vermelho apagado para 👎, cinza sem veredito.
- **Takes frescos**: um take que você ainda não tocou tem uma leve linha tracejada; a primeira escuta a tira. Um take regenerado traz um selo *regen* e mantém a nota, a curtida e a estrela.
- **A coluna dos espaços**: arraste a borda para alargá-la ou estreitá-la; « a recolhe, e os cartões ficam mais largos: as colunas deles ficam, então o olho não se perde.
- **Seções**: um espaço pode ter seções, de dois níveis no máximo (⋯ ao lado do nome → *Nova seção…*), para organizar o que tem dentro sem um espaço novo a cada vez. Um espaço mostra também os takes das seções. Tudo aquilo de que o Lapidador faz algo vai sozinho para a seção *Lapidados* dos espaços dele. Um espaço com seções tem um pequeno triângulo à esquerda da linha: um clique recolhe as seções para fora da coluna ou as traz de volta, e as recolhidas ficam lembradas. A coluna rola sozinha e fica sob o cabeçalho da sala, então o topo dela está sempre à mão.
- **Arraste um cartão para um espaço** à esquerda para movê-lo para lá (todos os marcados, quando ele está marcado); segure **Ctrl** para adicioná-lo lá e mantê-lo aqui também. O estúdio pergunta antes, e Ctrl+Z o devolve.
- **Takes fixados**: até quatro em cada espaço, numa faixa do próprio tom acima dos cartões (clique direito num take → *Fixar aqui*; × desafixa). Quando você marca takes, a barra dos marcados toma o lugar da faixa, então os cartões nunca se movem. Essa barra é uma fileira de ícones emoldurados: a escolha, as marcas, os espaços, a exportação e a lixeira no fim; cada um se apresenta ao passar o ponteiro.
- **Filtro** (o botão no fim da linha de busca) abre uma janela como faz o seletor de espaço: marque o que procurar em três grupos (como foi feito: bruto (como sai do modelo), importados, regenerados, re-renderizados; marcados: curtidos, não curtidos, favoritos, com nota, com arte; o que tem: stems, antizumbido, remasterização, upscale), cada um com quantos takes do lugar, e como os marcados se juntam: todos (AND), qualquer um (OR) ou nenhum (NOR). *Mostrar* os aplica; o botão então diz quantos estão ativos e como se juntam.
- **Selecione** vários, como num gerenciador de arquivos: marque um, e daí em diante um clique em qualquer ponto de outro cartão o marca também (Shift: o intervalo inteiro). Um arraste no espaço vazio entre os cartões traça uma faixa que marca o que toca; **Ctrl+arrastar** a traça de qualquer lugar e mantém o que já estava marcado. A barra dos marcados flutua acima do player: favorito, adicionar a um espaço, mover para um, tirar deste, ocultar, exportar um ZIP, para a lixeira.
- **A lixeira** devolve, ou apaga depois que você confirma. **Lixeira (Arte)**, ao lado na coluna, guarda a arte posta de lado (as execuções do Pintor na lixeira, as imagens postas de lado, as capas tiradas dos takes) e a devolve, ou a apaga de vez depois que você confirma; as capas de um espaço congelado ficam.

### O menu de um take <!-- #a-take-s-menu -->

![Clique direito num take](guide/collection-menu.png)

**Regenerar com uma semente nova** (no menu do take: Editar, depois Regenerar): o take feito de novo a partir de tudo com que foi feito, mas com sementes novas; o novo pega os espaços e a nota do antigo, e o antigo espera na seção *Fontes das regenerações* do espaço dele (o espaço não o mostra entre os seus) até você esvaziá-la; o novo mantém a nota, a curtida, a estrela e a imagem. Uma sonda sai com os dois minutos completos. Tocar, abrir no Criador ou no Lapidador, a folha (a partitura), a ficha técnica (tudo com que foi feito: o estilo e a letra, a partitura desenhada, cada ajuste, as LoRAs com as forças e as ondas; um take Direto não tem partitura, e *Escrevê-la a partir do som* pede uma ao transcritor), curtir, não curtir, favorito, uma nota, renomear, **espaços** (um take pode estar em vários), **mover para** um espaço (num cartão marcado: todo take marcado, fora do espaço aberto), ocultar, mandar para o Escritor, copiar, baixar, **exportar para a DAW** (projeto REAPER ou DAWproject, em qualquer take: com os stems depois que o Lapidador os separou), a lixeira. **Num cartão marcado, com outros marcados**, o menu age sobre todos, e o cabeçalho diz quantos: curtir, não curtir, favorito, arte, a arte tirada, espaços, ocultar, um ZIP; desenhar a arte de vários e regenerar vários perguntam antes, pois custam minutos de placa.

**Desenhar a arte**: um modelo de linguagem pequeno (Qwen3-4B) lê o estilo e as palavras do take e escreve um prompt de imagem; o Qwen-Image 2512 o pinta com Lightning (em 1328 px, guardado em 1024), em cerca de dois minutos numa placa de 16 GB com o prompt e a revisão (numa placa menor os seus blocos vêm da RAM, um pouco mais devagar; *Motor → Arte* escolhe o pintor). Ela aparece no player, no cartão, no painel de mídia da área de trabalho e dentro do MP3 que você baixa (como capa). Quando o take já tem a imagem, o menu diz *Abrir a arte* (sobre a página, como um clique na imagem do cartão ou no quadrado do player) e *Redesenhar a arte* (um prompt novo e uma imagem nova; a antiga fica ao lado do take, em `artwork-removed/`). O redator de prompts e o filtro de conteúdo vêm com `heresy/fetch-heresy.sh --artwork` (8,4 GB, perguntado antes), o pintor com `--qwen 2512-q4` ou `2512-q6`. *Motor → Arte* oferece cada pintor Qwen daqui: o Qwen-Image 2512 e os fine-tunes fp8 dele com Lightning, e o Qwen-Image 2.1 (veja Pintor › Uma capa para o take).

### Os instrumentos sob o estilo <!-- #the-instruments-under-the-style -->

Sob a caixa de Estilo, o estúdio nomeia o que o seu prompt pede: um chip para cada instrumento e estilo da cola que ele encontra, colorido pelo que o ouvido achou (verde ouvido, âmbar duvidoso, vermelho não tocado por esse nome) e com a imagem do instrumento. Pare o ponteiro num deles para o cartão: a imagem, a origem, como soa, ▶ A e ▶ B com as sementes. Um clique mostra a imagem inteira. **Alt+I** abre a cola de qualquer lugar.

### Arte: o que a desenha, o que ela não consegue, outro pintor <!-- #artwork-what-draws-it-what-it-cannot-another-painter -->

**O que a desenha.** Um modelo de linguagem pequeno (Qwen3-4B) lê o estilo e as palavras do take e escreve um prompt de imagem, com o tema primeiro; o Qwen-Image 2512 o pinta com Lightning (em 1328 px, guardado em 1024), com os seus blocos pela RAM onde não cabe inteiro (*Motor → Arte*). Quando o take tem o nome de um instrumento (a sonda de um instrumento), a aparência dele conduz o prompt palavra por palavra (o que o instrumento é e o que não é), e o Omni (o modelo do ouvinte) olha a imagem por essa aparência: uma imagem em que não acha o instrumento é pintada de novo, três no máximo, e quando nenhuma o mostra de verdade, o take fica sem imagem em vez de com uma falsa. Cerca de dois minutos por imagem numa placa de 16 GB, tudo contado.

**O que ela não consegue** (um aviso, dito com clareza): o pintor desenha o que conhece. Um instrumento que ele nunca viu pelo nome (o duduk, o morin khuur, o khomus, as taças de cristal…) sai como um palpite: um cano de madeira, um violino, tigelas de cozinha. Onde o Omni não achou o instrumento em nenhuma das três imagens, a imagem é marcada **≈ um palpite**, na sobreposição e na cola de instrumentos. Uma arte é o clima do take, não uma imagem de referência de um instrumento: para saber como um instrumento é, pesquise.

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

**Que força para um adaptador de voz.** Ouvido numa canção (19.10.2026: o adaptador de um narrador, rank 32, numa balada folk trágica): em 1.0 a voz abafa a música e o take fica instável, em 0.8 ainda a queima, 0.7 é o teto de onde partir, e 0.4–0.6 passa melhor a voz. Uma força baixa solta a altura própria da pessoa e guarda a tonalidade da voz: a canção pega a cor dela, não o carimbo. Suas duas metades não são iguais: a musical (AR) escreve a partitura com o modelo, para as duas pautas, e uma voz aprendida da fala apaga as notas quando está alta; mantenha-a em 0.5 no máximo, e dê à sonora (NAR), que leva o timbre, até 1.0 (ouvido no mesmo dia: AR 0.4 com NAR 1.0 mantiveram a música inteira e a voz estável). Os controles desenham assim o caminho de um adaptador de voz: um cujo nome diz voice ou vocal fica vermelho depois de 0.5 na metade musical e depois de 1.0 na sonora.

### Uma voz só tua: perguntas do terreno

Respostas dadas no GitHub (issue #2) a alguém que queria só a voz principal, guardadas aqui.

- **Um take só com a voz.** O YuE2 aprendeu a cantar com canções inteiras, e o seu fraseado apoia-se na música por baixo da voz: «a cappella» no estilo puxa-o para coros ou para a banda inteira. Pede antes uma só coisa calma por baixo da voz (um pad suave, uma só guitarra acústica) com `solo lead, single voice, no harmonies, no backing vocals, dry vocal, close mic`, e depois separa o take no Lapidador (oito stems): *Voz principal inteira* traz de volta o que a separação pôs entre os coros, *Upscale das vozes* redesenha o ar que o separador abafou. Quanto menos houver por baixo da voz, mais limpo o stem.
- **Um adaptador de voz das tuas próprias gravações.** Vozes principais secas de um só cantor com as letras, a 44,1 ou 48 kHz de fontes sem perdas. A mesma sala leve em todos os clipes faz menos mal do que salas diferentes, e um clipe com muita reverberação é melhor deixá-lo de fora do que limpá-lo a meio: o que um de-reverb deixa para trás é aprendido como parte da voz.
- **Rank.** 16 para uma voz, 32 no máximo: o rank define quanto o adaptador pode mudar, não quanto se aproximará do cantor.
- **Semelhança.** O timbre vem da metade do som: toca-a a 0,8–1,0 com a metade musical a 0,3–0,5. Diz no estilo o sexo e o registo do cantor (`male baritone vocal`). Julga-a nos pesos em que foi treinado: um adaptador aprendido no modelo base rasgava a voz num ajuste fino, mesmo com pouca força.
- **A curva dos gráficos no fim.** Com *Parar no platô, depois só a metade do som*, a metade musical fica parada quando a do som deixa de melhorar, e a do som continua sozinha: aí as curvas mudam de forma, e essas últimas épocas dão muitas vezes a voz mais limpa. Quando o ar_ce se aproxima de 0, a metade musical sabe os clipes de cor: ouve uma época anterior (os chips verdes).

![O Treinador LoRA: a telemetria de uma execução](guide/studio-train.png)

### Por que adaptadores próprios <!-- #why-your-own-adapters -->

Um modelo aberto nu, por mais forte que seja, ainda fica aquém em instrumentos, estilos e vozes: ele sabe o que ouviu no seu treino, e o seu som raramente está lá. Os seus próprios adaptadores fecham essa lacuna; são a armadura do guerreiro profissional do áudio e da música. O passo mais seguro para cima: reúna as suas melhores faixas, as que você fez no SUNO (num plano pago são suas) ou em qualquer outro lugar onde os direitos sejam seus, e treine nelas um adaptador **Estilo**, com a letra exata ao lado de cada uma. Então o YuE2 escreve no seu som e não perto dele: os seus instrumentos, os seus arranjos, a sua produção. Adicione um adaptador **Voz** para o cantor que quiser, e as canções são cantadas nessa cor. Um estilo treinado em vinte canções suas eleva o modelo mais alto do que qualquer prompt consegue empurrá-lo.

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
- **Treinador**: **Ruach Estúdio**, o do próprio estúdio, em pesos bf16 não quantizados; ele faz sozinho o cache latente do conjunto; Direto ou com partitura, nas canções como estão ou separadas. Portado linha a linha do **AI-Toolkit** do Ostris (MIT), com cujas curvas concordava época a época no mesmo conjunto; o próprio AI-Toolkit deixou o estúdio quando tudo o que treinava passou a estar aqui.
- **Pesos de base**: bf16, o modelo inteiro (uma placa de 24 GB), ou int8 para placas menores, um pouco menos exato. O arquivo do modelo base nunca muda: só o adaptador aprende.
- **Placas**: quantas GPUs a execução usa, 1, 2 ou 3, entre as placas dadas ao treinamento em Engine → GPUs. Cada placa guarda o modelo inteiro e aprende as próprias canções; as lições delas são promediadas a cada passo (paralelismo de dados), então duas placas percorrem uma época cerca de duas vezes mais rápido e três cerca de três, um número ímpar tanto quanto um par. O lote cresce com as placas e a taxa de aprendizado o acompanha (× √placas): nada mais a ajustar. Uma matriz cortada entre placas (paralelismo de tensores) não é usada: o YuE2 cabe inteiro numa placa de 24 GB, e em placas sem NVLink cortar cada camada custa mais do que rende.
- **Épocas**: quantas vezes a execução percorre o conjunto, cada faixa uma vez por época, uma faixa por passo: os passos dela são as faixas do conjunto vezes isto (2016 faixas por 12 épocas são 24 192 passos). A metade som ouve uma janela de 60 segundos da faixa, cortada ao acaso a cada vez; a metade música lê a canção desde o início.
- **Salvar a cada N épocas**: um adaptador no fim de cada N-ésima época, cada um para ouvir e comparar, todos guardados, com o estado do otimizador ao lado do mais novo (uma execução parada guarda o que aprendeu). **Parar no platô, depois só a metade do som** (ligado por padrão): duas em cada cem faixas ficam de fora e são ouvidas a cada época; quando a metade do som para de melhorar nelas por 3 épocas, a musical fica parada na sua melhor época e a do som segue sozinha até mais 12. Uma voz saiu assim mais limpa. N desce até um décimo de época (0.1: dez salvamentos por época, com nomes e001.3 e assim por diante), para ouvir um conjunto grande enquanto ele aprende.
- **Rank**: a largura do adaptador; a fração dos pesos e o tamanho estão na dica do campo (quanto custa cada rank e qual para quê: abaixo).
- **Taxa de aprendizado**: o tamanho de cada passo da metade som (AdamW, a mesma na execução toda); a da metade música é esta vezes **Velocidade AR**. Os tipos mantêm 0.0001; a metade disso é mais suave, para uma execução longa sobre um conjunto grande; mais alto aprende mais rápido e esquece mais.
- **Esmaecer o LR, épocas** e **LR no fim, %**: nas últimas épocas do treino a taxa de aprendizado desce em linha reta, até o que resta dela no último passo (0 % a apaga de vez): o jeito usual de terminar um treino, com os últimos salvamentos assentando em vez de seguir com passos tão fortes. Acompanha a duração do treino, então um treino prolongado para mais épocas esmaece no seu novo fim, e continuá-lo leva todos os ajustes que ele recebeu, o esmaecimento entre eles. 0 épocas, como no início: sem esmaecimento, a taxa igual até o fim.
- **Peso AR**, **Âncora AR (KL)**, **Velocidade AR**: os três ajustes da metade música, abaixo.
- **Modo**: **Direto** é para canções feitas no modo Direto; **Completo (partitura)** e **Melodia**, para canções feitas nesses modos, ensinam também a metade música a escrever primeiro uma partitura, que o motor transcreve de cada canção antes do treino; metade dos passos vai sem partitura, para que o Direto não se esqueça. **Separar vocais e música**: cada canção é primeiro dividida em voz e música pelo separador do estúdio (uma vez por conjunto, minutos por canção), e a metade música também aprende a voz só pela letra e a música só pelas tags.
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
- **Épocas**: a metade música decora rápido um conjunto pequeno (a loss cai para perto de 0): as épocas verdes na Telemetria são as primeiras a ouvir, muitas vezes bem antes da última.
- **A taxa de amostragem do material**: a metade som trabalha em 48 kHz, a metade música ouve em 24 kHz. Uma gravação em 24 kHz ensina tudo à metade música, mas à metade som só um topo abafado: reamostrar não acrescenta nada acima da metade da taxa original. Para um timbre, dê 44,1 ou 48 kHz.
- **Memória**: a medida é uma placa de 24 GB. Os pesos bf16 ocupam 7,5 GB; o adaptador, seus gradientes e seu otimizador, 16 bytes por peso (rank 32: menos de 1 GB; rank 128: 3,8 GB; rank 256: 7,5 GB); o resto são as ativações da lição, e a metade musical lê a canção inteira: medidos 17,7 GB de pico com rank 32 em canções de alguns minutos, cerca de 11 GB em clipes curtos de voz. **Abaixo de 16 GB, não treine ranks grandes**: pesos int8, rank 16 a 32, clipes curtos. O rank 256 numa placa de 24 GB está no limite.
- **Cada salvamento é uma média móvel** do adaptador sobre mais ou menos a sua última época (EMA), as duas metades, e as faixas separadas são ouvidas sobre ela: o ruído dos passos isolados fica suavizado no que você ouve e no que para a execução. Os pesos brutos para continuar ficam ao lado (`resume.safetensors.raw`).

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

Cada execução é um cartão à direita: *Ativas*, *Tudo*, *Arquivadas*, *Lixeira*, com busca. Uma execução treinando fica acesa como um take tocando. ⋯ num cartão: a telemetria, o log, arquivar, parar, ou apagar para a lixeira (você é perguntado se os adaptadores dela em loras/ vão junto). Da Lixeira ela volta, ou vai embora de vez. Abaixo, os treinos por estado: **Treinando**, **Pausado**, **Concluído**, **Parado**, **Falhou**, cada um com sua contagem, um de cada vez (outro clique mostra todos). **Pausar** num treino em andamento salva o que aprendeu e espera; **Retomar** continua desse salvamento com o mesmo conjunto, ajustes e placas.

## Motor <!-- #engine -->

O Motor abre por cima da sala em que você está (☰ › Motor, ou Ctrl+Alt+9), com os seus cartões por tema atrás de abas à esquerda, na ordem em que se percorrem: **Servidor e log**, **Hardware** (a placa, Processamento, as GPUs), **Modelos e LoRAs** (com os VAEs e as LoRAs), **Escritor e arte**, **Pastas e segurança**, **Aparência**, **Atualizações e sobre**. ↑ e ↓ passam de uma aba a outra, e o Motor volta a abrir na aba em que você o deixou; Esc, **Fechar** ou um clique na sala escurecida em volta o fecham.

### A máquina <!-- #the-machine -->

![Motor](guide/studio-engine.png)

- **Servidor**: o que o motor roda: o modelo, os decodificadores, o contexto, a biblioteca.
- **Processamento**: a cópia do **modelo** (BF16 7,2 GB, Q8_0 3,8 GB, Q6_K e Q5_K_M menores), a **Predefinição de memória da GPU** (*Auto* ajusta o contexto e os blocos do VAE à placa; *Auto dentro de N GB* faz isso para essa quantidade, o resto da placa deixado para o que mais roda nela (num notebook de 16 GB, 14); *Manual* deixa com você), **Manter os modelos carregados**. **Escanear a máquina** diz o que a máquina tem e o que combina com ela (o backbone, os ajustes do Auto, o pintor), como um estúdio novo faz uma vez no primeiro início. As fusões baixadas (**Mais modelos**) ficam na lista depois dos modelos da m-a-p, na sua linha: IRA, IRAE, IRAEv2, IRAEv3; cada uma nos seus formatos, a mais completa primeiro. O ajuste fino próprio do Ruach Studio, **RS-FW** (sete fusões do YuE2-RS-FW, cada uma com a sua época e a sua força no nome), vem com a instalação como RS-FW 2.4x0.75, o modelo predefinido do estúdio, e arranca sempre que nenhum modelo foi escolhido; as outras seis estão em **Mais modelos**.
- **Hardware**: a memória da placa agora; **Descarregar o modelo** a libera na hora.

### GPUs: qual placa faz o quê <!-- #gpus-which-card-does-what -->

![Qual placa faz o quê](guide/engine-gpus.png)

Numa máquina com várias placas, dê a cada uma o seu trabalho: o **estúdio** (a síntese) numa placa, o **treino** nas placas que você der a ele, as **tarefas** do laboratório (o ouvinte, Whisper, stems, remasterização, upscale) nas delas. Enquanto uma execução treina na própria placa do estúdio, uma síntese espera, e a página diz por quê. Com uma placa só, é assim que funciona: treinar, depois criar. Uma placa nova para o estúdio vale depois de reiniciar (o botão aparece quando é preciso). As tarefas do laboratório ficam nas placas marcadas para elas, o Pintor junto: quando essas estão cheias, uma tarefa espera uma delas (o Whisper passa para o processador) e nunca pega uma placa não marcada para o laboratório. Uma execução do Pintor vai para a placa onde o pintor dela está mantido desde a execução anterior, com os pesos já na RAM.

**Intel Arc (beta).** A síntese do estúdio também roda numa placa Intel Arc, com o seu motor compilado por `./build.sh --sycl` (INSTALL.md, «Intel Arc (beta)»): músicas, adaptadores, Full, Extend. As placas desta lista são da NVIDIA; o motor Arc calcula na própria placa, e o treino e as capas ficam nas da NVIDIA.

### Decodificadores, adaptadores, o modelo do Escritor, a aparência <!-- #decoders-adapters-the-writer-s-model-the-look -->

- **VAEs**, **LoRAs**: cada arquivo que o estúdio encontrou, com a fonte e o que faz.
- **Modelos e LoRAs**: o que a instalação traz, parte por parte (os decodificadores extras, o Whisper, os modelos dos stems, o UniverSR, as LoRAs), como a última execução o achou, e **Verificar de novo** para olhar outra vez. Uma parte incompleta lista o que falta e tem o seu **Baixar**; **Baixar o que falta** pega tudo; um download interrompido continua de onde parou. **Mais modelos**: outro backbone (BF16 ao lado do Q8_0), o ouvinte de estilo, o pintor do Pintor, a base do treinador, cada um com as variantes e tamanhos, uma variante já aqui avisada, cada um perguntado antes com o tamanho. Um backbone ou decodificador novo chega ao motor no próximo início (**Reiniciar o motor**); LoRAs novas na hora. Entre eles, as fusões IRA e IRAE: YuE2 com adaptadores da comunidade incorporados (Instrumental e Real Audio de Mothersuperior; na IRAE, Epic Trailer de monsterovich, em três intensidades).
- **Reconhecidos pelo conteúdo**: um adaptador ou um ficheiro de modelo renomeado, movido para uma pasta sua ou com o cabeçalho reescrito continua aqui: o estúdio e a sua instalação reconhecem-no pelo SHA-256 e, num `.safetensors`, pelo SHA-256 dos seus tensores (do `MANIFEST.tsv` do repositório de modelos), e não voltam a descarregar nada.
- **Arte**: quem pinta a arte de um take: pelas placas (Qwen-Image 2512 Q6 ou Q4 inteiro onde uma placa o comporta, senão Q4 em fluxo da RAM numa placa menor), ou um escolhido entre os pintores Qwen que esta máquina tem (Qwen-Image 2512 Q4 ou Q6 e cada fine-tune fp8, com Lightning; Qwen-Image 2.1 com a licença dita).
- **Escritor**: o endereço do servidor de chat local (vLLM, LM Studio, Ollama), *Testar conexão*.
- **Aparência**: 22 temas (escolhidos para trabalhar: claros e calmos), os cantos, as quatro fontes (texto, títulos, números, nomes das salas). **Hora do take**: a hora de um take no cartão dele e onde quer que apareça, há quanto tempo (o padrão) ou a data e a hora exatas; um clique na hora de um cartão a vira para esse take.
- **Fontes**: além do texto, dos títulos, dos números e dos nomes das salas, as *marcas de secções* na onda (IBM Plex Mono por padrão) e os *botões* (a do texto por padrão); cada uma exceto o texto com o seu tamanho em relação ao texto, de −2 a +2 pt.
- **Log do servidor**: o log inteiro; **Sobre**: cada projeto em que o estúdio se apoia, com link.
- **Atualizações**: as versões do Ruach Studio no GitHub contra esta versão: com que frequência olhar (todo dia, semana, mês, nunca), versões candidatas também, e quando sai uma, perguntar ou atualizar sozinho quando nada roda (só onde o estúdio é um clone do repositório; em outros lugares ele diz como atualizar à mão). Um estúdio novo, e cada atualização, oferece os conjuntos 💎 que ele ainda não tem.
- **Segurança**: quem pode abrir o estúdio: só este computador, este computador e as redes privadas (o padrão; o Wi-Fi de um café ou de um hotel também é uma) ou este computador e as redes que você listar (10.0.0.0/24); o motor guarda isso em `user/access.json` e responde por ele na hora. Um estúdio cujo usuário ainda não decidiu pergunta ao iniciar, com um guia curto e «Minha decisão é consciente». Uma escolha que o fecharia para a máquina de onde você pergunta é perguntada de novo; apagar `user/access.json` volta às redes privadas.
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
- A canção dura os seus compassos × isso. A linha da verificação sob a partitura diz: `✓ Native YuE2 score · Em · 90 BPM · 3/4 · 11 bars · ≈ 0:22 long · 0 sections`.
- Um verso precisa do tempo das sílabas: a uma colcheia por sílaba um compasso de 4/4 comporta 8, a uma semicolcheia 16 (um rap: os versos de Buratino do Viktor vão `FFFFFEEEE2zDDDDD`).
- Para terminar a canção antes, tire compassos do fim da partitura, nas duas vozes; para uma outro, acrescente compassos ali.

### O espaço da voz: Vocal <!-- #the-voice-s-space-vocal -->

- Vocal é o que é cantado: mais ou menos uma sílaba por nota, uma nota ligada é uma sílaba sustentada, pausas onde o cantor respira. A tabela da verificação diz quantas notas, quantas por minuto, a extensão, e quanto do tempo a voz soa.
- Notas e sílabas: com mais notas que sílabas o modelo estica as sílabas sobre elas, ou acrescenta algumas suas; com menos ele espreme as palavras. A métrica da letra em Compor conta cada verso pelo tempo que ele leva: dê ao verso mais ou menos esse número de notas.
- O rap é denso (semicolcheias em uma ou duas alturas: o ritmo o carrega), uma balada tem notas longas. Deixe uma pausa no fim do verso: ali a voz respira e os instrumentos respondem.
- O deslocamento da voz sob a partitura (*Mover*) move o Vocal por graus da escala (uma terça, uma quarta, uma oitava) onde ele está agudo ou grave demais para o cantor; os acordes e o Ins ficam. Medido em 21.10.2026: o modelo segue a Vocal descida uma oitava (cantou de 9 a 10 semitons mais grave), e a voz pode mudar de registro com ela: uma contralto feminina descida saiu tenor ou baritenor masculino, e uma voz masculina subida pode sair feminina; a banda também pode descer. Os ▼ ▲ junto a um adaptador de voz (em Full, com partitura) fazem o mesmo uma vez.

### O espaço dos instrumentos: Ins <!-- #the-instruments-space-ins -->

- Ins é a linha própria dos instrumentos: o riff da intro, as respostas entre as frases, um solo, a outro. Uma melodia, não os acordes (esses ficam no Vocal): uma linha, e o YuE2 arranja a banda em volta dela.
- **Sob a voz o Ins quase sempre descansa.** Os covers oficiais mantêm `Z4` sob cada grupo cantado e tocam na intro, entre as seções e no fim; os takes Completos do Viktor fazem o mesmo (um arpejo na intro, `Z4` sob as estrofes, uma virada nas passagens). Um Ins cheio sob um verso cantado é uma segunda melodia contra a voz, e as partituras nativas evitam isso.
- A verificação resume isso como **Ins : Vocal**, as notas de um contra as do outro: acima de 1.5 os instrumentos levam a maioria das notas, abaixo de 0.67 a voz leva, entre os dois mais ou menos igual.
- Um instrumental: o Vocal descansa (`Z`) a canção inteira e o Ins leva a melodia. *Tornar instrumental* move a melodia vocal de uma partitura para o Ins (a receita oficial) e marca *Instrumental*. Um adaptador de partitura instrumental em força total com palavras para cantar dá uma voz sem notas: mantenha-o baixo quando há letra (Criador › VAE e LoRAs).

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
| **[** · **]** · **Ctrl+Z** · **Ctrl+Shift+Z** | o DAW | a seção anterior · a seção seguinte · desfazer · refazer |
| **Espaço** · **Home** · **L** | o DAW à vista | tocar e parar · ao início (do loop, se estiver ligado) · o loop sim e não |
| **M** · **S** · **↑ ↓** | o DAW, a faixa escolhida com um clique no nome | silenciá-la · solo · outra faixa |
| **+** **−** **0** · **Ctrl+roda** · **Shift+roda** | o DAW | aproximar, afastar, a canção inteira · zoom em volta do ponteiro · ao longo da canção |
| **F11** | a aba do estúdio | o DAW à vista em tela cheia e de volta; noutros lugares o estúdio inteiro em tela cheia |
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
