# L'Artista in profondità

[English](ARTIST.md) · [Русский](ARTIST.ru.md) · [Українська](ARTIST.uk.md) · [Беларуская](ARTIST.be.md) · [Ελληνικά](ARTIST.el.md) · [Español](ARTIST.es.md) · **Italiano** · [Français](ARTIST.fr.md) · [Português](ARTIST.pt.md) · [Deutsch](ARTIST.de.md) · [日本語](ARTIST.ja.md) · [中文](ARTIST.zh.md)

L'Artista è la stanza di Ruach Studio per le immagini: una copertina per ogni take, un 16:9 per il suo video, un 9:16 per uno short. La guida dentro lo studio (F1 nell'Artista) dice in poche righe che cosa fa ogni controllo; questo documento va fino in fondo: ogni controllo, com'è fatto dentro, le ricette che funzionano, che cosa va storto e perché, e i numeri misurati su una RTX 3090. Tutto ciò che è qui c'è nello studio così com'è; quel che deve ancora venire è detto alla fine.

## Indice

1. [A che cosa serve l'Artista](#1-a-che-cosa-serve-lartista)
2. [Una prima copertina in sei passi](#2-una-prima-copertina-in-sei-passi)
3. [Come scrivere un prompt](#3-come-scrivere-un-prompt)
4. [I pittori](#4-i-pittori)
5. [Come va un'esecuzione](#5-come-va-unesecuzione)
6. [Lightning](#6-lightning)
7. [Sampler e pianificazioni](#7-sampler-e-pianificazioni)
8. [Adattatori (LoRA)](#8-adattatori-lora)
9. [Regioni](#9-regioni)
10. [Scritta](#10-scritta)
11. [Un'immagine da cui dipingere](#11-unimmagine-da-cui-dipingere)
12. [Il secondo passaggio](#12-il-secondo-passaggio)
13. [Upscale](#13-upscale)
14. [Il palco, la libreria e il cestino](#14-il-palco-la-libreria-e-il-cestino)
15. [Copertine per i take](#15-copertine-per-i-take)
16. [Ricette](#16-ricette)
17. [Quando qualcosa va storto](#17-quando-qualcosa-va-storto)
18. [I numeri](#18-i-numeri)
19. [Per script e agenti](#19-per-script-e-agenti)
20. [Licenze](#20-licenze)
21. [Che cosa viene dopo](#21-che-cosa-viene-dopo)

## 1. A che cosa serve l'Artista

Una canzone ha bisogno di immagini: il quadrato sulla sua scheda e nel suo MP3, un'inquadratura larga per il suo video, una alta per uno short. L'Artista le dipinge sulla tua scheda video, dalle tue parole, da una tua immagine o da entrambe, e conserva ogni esecuzione con il suo prompt, il suo seme e le sue impostazioni, così che un'immagine che ti è piaciuta possa essere dipinta di nuovo o portata più in là.

La stanza ha tre colonne. A sinistra il modulo: il prompt e ogni controllo che dà forma al dipinto. Al centro il palco: l'esecuzione che si dipinge si sviluppa lì passo dopo passo, oppure lì sta l'immagine che hai scelto, con i suoi pulsanti sotto e i dati della sua esecuzione in un suggerimento accanto. A destra la libreria: ogni esecuzione, o tutte le immagini in un'unica galleria, o il cestino. Trascina i bordi tra le colonne per allargarne una (← → da tastiera; un doppio clic le restituisce la sua larghezza). Da una finestra alta 920 px la stanza sta tutta: la pagina resta ferma, il modulo e la libreria scorrono per conto loro, e la riga di Disegna resta in fondo al modulo.

## 2. Una prima copertina in sei passi

1. Scegli un take a destra nello studio (la lista del Creatore o del Bibliotecario): l'immagine che imposterai come copertina va a lui.
2. Nell'Artista premi **Dal take** per avere un prompt da cui partire, o scrivi il tuo (sezione 3).
3. Lascia **Forme** su **1:1**, metti **Variazioni** a 4 e tieni il pennello scelto dallo studio (Qwen-Image 2512 Q4 con ⚡ Lightning sulla maggior parte delle schede).
4. Premi **Disegna** (Ctrl+Invio). Guarda le immagini svilupparsi sul palco; circa mezzo minuto ciascuna su una 3090.
5. Fai clic su quella che ti piace; **Imposta come copertina** la rende copertina del take: nella sua scheda, nel lettore e nel suo MP3.
6. Ti è piaciuta ma la vuoi più fine? **Secondo passaggio… ×2** (sezione 12), poi **Upscale… 4K** (sezione 13).

## 3. Come scrivere un prompt

Qwen-Image legge un prompt come una descrizione, non come una lista di tag: scrivi frasi. Metti prima ciò che c'è nell'immagine (chi o che cosa, dove, che fa), poi la luce (crepuscolo, lume di candela, un mattino grigio), i colori e la tecnica (un olio a pennellate spesse, un disegno a china, una fotografia 35 mm). Chiudi con *no text* quando non vuoi lettere: a Qwen-Image piace scrivere da solo su una copertina.

Parole che funzionano bene: il soggetto detto semplicemente (*a red fox sitting in the snow*), la composizione (*seen from below*, *in the left third*, *a wide empty sky above*), il materiale (*oil on canvas*, *gouache*, *woodcut*), la direzione e il colore della luce. Parole che fanno poco: le liste di tag di qualità (*masterpiece, 8k, best quality*) appartengono a modelli più vecchi e occupano solo spazio.

**Dal take** mette nel prompt quello da cui è nata la copertina propria del take, o uno fatto dal suo titolo e dal suo stile, come punto di partenza. Ogni esecuzione conserva il suo prompt; **Nel modulo** su qualsiasi immagine riporta il suo prompt, il seme e la forma, e **Tutto nel modulo** (nel suo menu) riporta anche il pittore, il fine-tune, il campionamento e gli adattatori, così che Disegna dipinga di nuovo proprio quell'immagine.

## 4. I pittori

| pittore | licenza | quanto chiede alla scheda | un'immagine su una 3090 | per |
|---|---|---|---|---|
| **Qwen-Image 2512 Q4** | Apache-2.0 | 15,5 GB | circa 30 s con Lightning | il Qwen di una scheda da 16 GB |
| **Qwen-Image 2512 Q6** | Apache-2.0 | 20 GB | circa 32 s con Lightning | bozze più fini |
| **Fine-tune fp8 di Qwen-Image 2512** | quella del fine-tune | 22,5 GB | circa 37 s con Lightning, minuti senza | realismo finito |
| **Qwen-Image 2512 fp8 BASE** | Apache-2.0 | 22,5 GB | 8 passi con Lightning, come i GGUF | 2512 stesso in fp8 |
| **Qwen-Image 2.1** | Qwen Research Licence | 21 GB (in streaming con meno) | circa due minuti | modifica a parole, riferimento di stile |

**I pennelli dell'Artista** sono un solo elenco di ogni modello e file qui, per gruppi: Qwen-Image 2512 da un GGUF (Q4, Q6), ogni file fp8 in `artwork/Qwen-Image-2512/checkpoints/` (il BASE di 2512 e i fine-tune) e Qwen-Image 2.1. **⚡ Lightning** segna un pennello che dipinge con esso di default; un fine-tune è segnato come tale. Un file messo in `checkpoints/` diventa un pennello a sé quando la stanza rilegge l'elenco (dopo un download o ricaricando la pagina). Krea 2 Muse ha lasciato lo studio a ottobre 2026: Qwen-Image 2512 segue meglio le parole e scrive bene un titolo.

**Qwen-Image 2512** è il pittore più grande: realismo più fine, legge bene i prompt lunghi, disegna giuste le lettere quando gliele chiedi. Viene come GGUF in Q4 o Q6, o come **fine-tune fp8**: i file unici di ComfyUI messi in `artwork/Qwen-Image-2512/checkpoints/` ognuno un pennello a sé (Jib Mix Qwen, IntoRealism Qwen, Real-Qwen-Image e lo stesso 2512 si scaricano da **Ottieni pittori e adattatori…**, 20,4 GB ciascuno). Il BASE di 2512 dipinge con Lightning come i GGUF, un fine-tune senza, a meno che non lo accendi. Un file fp8 si legge in bf16, resta sulla scheda nel suo fp8, e ogni strato calcola in bf16 mentre gira; gli adattatori su di esso tengono i loro strati in bf16.

**Qwen-Image 2.1** legge le immagini oltre alle parole (il suo codificatore di testo è Qwen3-VL): modifica un'immagine secondo le parole del prompt, o dipinge la scena del prompt nello stile di un'immagine (sezione 11). È sotto la Qwen Research Licence: solo ricerca e valutazione, non per una copertina che vendi; la stanza lo dice sotto il pittore nel colore degli avvisi.

Ogni pittore si mostra solo quando i suoi file sono qui; quelli che mancano sono nominati sotto il pittore, e **Motore → Modelli e LoRA** li scarica, chiedendo prima per ciascuno con la sua dimensione (il 2.1 anche con la sua licenza). Da un terminale: `heresy/fetch-heresy.sh --qwen 2512-q4`.

**Il codificatore di testo** di Qwen-Image 2512 (Qwen2.5-VL-7B, circa 15,5 GB) legge il prompt sulla scheda quando lo spazio libero lì lo contiene, altrimenti sul processore, e se ne va prima che arrivi il pittore: l'immagine è la stessa in entrambi i casi, il processore è solo più lento.

## 5. Come va un'esecuzione

**La coda.** Una pressione di Disegna è un'esecuzione: un prompt, le sue forme, le sue variazioni. Aspetta nella coda del laboratorio una scheda con spazio, come le copertine dei take, gli stem e gli upscale; mentre aspetta, **Fuori dalla coda** la ritira, e **Ferma** accanto a Disegna chiude un'esecuzione che dipinge (le immagini che ha finito restano). Possono esserci due esecuzioni insieme: una che dipinge, la successiva in attesa dietro.

**Quale scheda.** I lavori del laboratorio stanno sulle schede date loro in **Motore → GPU** (la scheda propria dello studio non viene mai presa per caso). Una scheda che nient'altro usa prende un'esecuzione il cui bisogno sta nella sua memoria meno 512 MiB (la quota propria del runtime CUDA); una scheda in uso la prende quando la sua memoria libera contiene il bisogno; una scheda con un limite di VRAM conta il suo limite come tetto. Il bisogno è quello del pittore più la dimensione dei suoi adattatori, e 6 GB in più per un secondo passaggio ×2.

**Quando nessuna scheda lo contiene intero**, Qwen-Image 2512 porta i loro blocchi in streaming dalla RAM: i blocchi che ci stanno restano sulla scheda, il resto arriva quando serve (il group offloading di diffusers su uno stream CUDA: un blocco arriva mentre calcola quello prima), e l'immagine è la stessa, più lenta di quanto il bus non riesce a nascondere. Con tutti i blocchi in streaming prende 2,3 GB dalla scheda (1328², Lightning, quattro adattatori), così anche una scheda da 6 GB lo dipinge, con circa 30 GB di RAM. Qwen-Image 2.1 porta in streaming sia il suo transformer (blocco per blocco) sia il suo codificatore di testo (strato per strato): sotto un limite di 15,5 GB ha dipinto a parole con 4,1 GB di picco e modificato con 7,9 GB, in circa lo stesso tempo che intero. Un pittore che non può andare in streaming e non entra in nessuna scheda viene rifiutato subito, con i numeri e il pittore che entrerebbe.

**Più schede.** Un'esecuzione con più immagini si distribuisce sulle schede del laboratorio che hanno spazio e RAM sufficiente per un pittore in più (tre forme su due schede: la prima e la terza su una, la seconda sull'altra), ogni scheda dipingendo la sua parte con i semi propri dell'esecuzione: le immagini sono le stesse bit per bit che su una scheda.

**Un pittore tenuto.** Dopo un'esecuzione il suo pittore torna in RAM e la sua scheda è di nuovo libera; un'esecuzione seguente con lo stesso pittore, lo stesso fine-tune e gli stessi adattatori nello stesso ordine dipinge subito, senza il minuto o due di caricamento. Un pittore tenuto viene lasciato dopo dieci minuti fermo, quando la RAM serve per un altro, o con **Scarica dalla memoria** nella Barra (che lascia tutto ciò che lo studio tiene sulle sue schede).

**Dentro un'esecuzione**: il prompt è letto una volta dal codificatore di testo; ogni immagine è disegnata alla dimensione propria del pittore e tenuta a quella della stanza (Qwen-Image disegna a 1328², 1664 × 928 e 928 × 1664 e porta ciascuna a 1280², 1920 × 1080 e 1080 × 1920); il decodificatore lavora a tasselli, così il suo picco resta basso.

**Anteprima dal vivo** (attiva di default): i latenti di ogni passo diventano un'immagine di un ottavo della dimensione senza il decodificatore (con i fattori di colore propri dello spazio latente, come li porta InvokeAI), quindi non costa nulla; una barra in cima al palco segue l'esecuzione, immagine per immagine e passo per passo.

**Il filtro dei contenuti**: ogni immagine passa un filtro dei contenuti (nsfw_image_detection di Falconsai, Apache-2.0), la regola dello studio per ogni pittore: una che segnala non viene tenuta, e l'esecuzione lo dice.

**Su disco**: ogni esecuzione è una cartella in `artist/` dello studio: `ask.json` (ciò che è stato chiesto), `run.json` (scritto immagine per immagine), le immagini `NN-SHAPE-sSEED.png`, le loro `thumbs/`, e un riferimento o una maschera accanto quando l'esecuzione ne aveva. Un guardiano ferma un pittore che tace troppo a lungo (dieci minuti mentre carica, cinque una volta che dipinge), e un'esecuzione che il laboratorio ha perso per un riavvio lo dice invece di dipingere per sempre.

## 6. Lightning

**Che cos'è**: un adattatore (lightx2v, Apache-2.0) che insegna a Qwen-Image 2512 a dipingere in pochi passi senza guida: la lunga strada guidata del modello distillata in 8 passi. Il suo file vive in `artwork/Qwen-Image-2512/lightning/` e arriva con il download dei pittori Qwen.

**Come lo mette lo studio**: con Lightning acceso, il pittore lo carica come un adattatore in più sotto i tuoi, a **1.0** per i GGUF Q4 e Q6 e il fp8 BASE di 2512 (la base da cui è stato distillato, 8 passi) e a **0.55** per un fine-tune fp8 con 12 passi (un fine-tune si è allontanato dalla base, e Lightning a piena forza lo tirerebbe indietro). La pianificazione diventa quella propria di Lightning (uno spostamento di log 3 a ogni dimensione), e la guida si spegne: un passaggio del modello per passo.

**Con esso spento**, 2512 dipinge a modo suo: 30 passi di default (da 10 a 60) e **Guida** 4 (vero CFG contro un negativo vuoto: due passaggi per passo). Sessanta passaggi contro otto: circa sette volte la pittura, e il dettaglio e la luce del realismo finito.

**La regola dietro i default**: Lightning per bozze e copertine, non per il realismo professionale. I pittori GGUF e il fp8 BASE di 2512 dipingono con esso; un fine-tune fp8 dipinge senza a meno che tu non lo accenda; la copertina propria di un take si dipinge con esso.

## 7. Sampler e pianificazioni

**Campionamento**, sotto il pittore, ripiegato, i suoi valori nel riepilogo: i passi, il sampler e la pianificazione (e per 2512 Lightning e Guida), tenuti per ogni pittore; **Ripristina** restituisce quelli del pittore. Qwen-Image 2512 con Lightning prende da 4 a 16 passi; senza, come Qwen-Image 2.1, da 10 a 60.

Il modello dice a ogni passo da che parte sta l'immagine; il **sampler** decide come arrivarci:

- **Euler**: un passaggio per passo, il passo semplice, il riferimento (e quello con cui è stato distillato Lightning).
- **Euler SDE**: Euler con un po' di rumore fresco a ogni passo: più grana, un po' meno fedele.
- **ER-SDE**: un risolutore stocastico del terzo ordine, un passaggio per passo, i due passi precedenti tenuti: più fine di Euler nello stesso tempo.
- **RES 2s**, **RES 3s**: i metodi a passo singolo del risolutore esponenziale raffinato, due e tre passaggi per passo, metà del rumore rimessa dopo ciascuno; i loro gemelli **ODE** non rimettono nulla, così un seme dipinge un'immagine, la più vicina al percorso esatto.
- **Heun++**: tre passaggi per passo dove può, poi due, poi uno alla fine.
- **Exponential Heun** (e il suo SDE): un metodo esponenziale del secondo ordine, due passaggi per passo.

Un sampler da due o tre passaggi per passo costa due o tre volte il tempo di Euler. Contro il percorso esatto di un flusso giocattolo a 8 passi si ordinano come dicono i loro ordini: Euler 0,138, Heun++ 0,111, exponential Heun 0,084, RES 2s 0,058, RES 3s 0,046 (l'errore: più basso è più vicino).

La **pianificazione** dice dove si spendono i passi tra tutto il rumore e nessuno: **Simple** (uniforme nel tempo proprio del pittore), **Karras** ed **Exponential** (più passi a poco rumore, per il dettaglio), **Beta** e **Beta 57** (densi a entrambi gli estremi), **KL optimal** (la spaziatura di Align Your Steps), **SGM uniform** (uniforme nel tempo, l'ultimo passo tolto), **Bong tangent** (due pendenze d'arcotangente, da tutto il rumore a metà e da metà a nulla).

**Che cosa funziona, da due matrici di 54 immagini** (un prompt, un seme, ogni coppia):

| pittore | bene | evitare |
|---|---|---|
| Qwen-Image 2512 con Lightning | Simple, Beta, Beta 57, SGM uniform, Bong tangent | Karras, Exponential, KL optimal (possono dipingere il soggetto due volte) |
| Qwen-Image 2512 senza Lightning | Euler, ER-SDE, RES 2s / 3s | Euler SDE (morbido e velato) |

Il modulo dice entrambi gli avvisi quando valgono. I sampler sono stati scritti per lo studio dai loro articoli e dalle formule di ComfyUI; RES4LYF è stato letto solo per la sua matematica (la sua licenza vieta i servizi commerciali), e Heun++ è di Carzit (MIT).

## 8. Adattatori (LoRA)

**Dove vivono**: `artwork/loras/<famiglia>/`, la famiglia quella del pittore: `qwen-image-2512`, `qwen-image-2.1`. Le cartelle dentro diventano gruppi nella libreria; un'immagine accanto a un file con il suo nome (`NAME.jpg`, `NAME.png`, `NAME.preview.png`) si mostra sulla sua scheda; ciò che il LoRA Manager di ComfyUI (`NAME.metadata.json`) o Stability Matrix (`NAME.cm-info.json`) hanno scritto accanto a un file si legge anch'esso.

**La lista e l'esecuzione**: fino a otto adattatori nella lista sotto il pittore, fino a quattro attivi in un'esecuzione; ciascuno alla sua forza (il cursore da 0 a 1,5); un clic destro **zittisce** uno (resta nella lista ed esce dall'esecuzione), e un adattatore a zero non si carica nemmeno. Le sue parole d'innesco si mostrano sotto, e un clic su una la mette nel prompt (un'esecuzione aggiunge anche da sé le parole d'innesco di un adattatore attivo).

**Civitai**: **Cerca su Civitai** manda lo SHA-256 di ogni file e nient'altro, e tiene la risposta accanto (`NAME.civitai.info`: il suo nome, il modello base e le parole d'innesco, e la sua prima immagine classificata sicura quando non ne ha una propria). **Da Civitai…** scarica un adattatore il cui autore non permette di condividerlo, da Civitai stesso, con la tua chiave: si legge un link, un id di versione o un AIR, si dice la famiglia che si addice al suo modello base, e si prende solo un LORA, LoCon o DoRA in `.safetensors`, il suo SHA-256 verificato contro quello di Civitai prima di diventare il file. La tua chiave va solo a Civitai. Gli adattatori che i loro autori lasciano condividere arrivano da **Ottieni pittori e adattatori…**.

**Insieme**: da due adattatori, una barra sotto di loro dà la somma delle loro forze sulla strada del Creatore: verde fino a 1,2, ambra fino a 1,8, rosso oltre. Gli adattatori sovrapposti si sommano, e oltre circa 1,8 un'immagine brucia (colori e bordi esagerati) per quanto modesto sia ciascuno. Trascina la barra per spostarli tutti insieme, ciascuno in proporzione.

**Forza lungo i passi** (⏱ accanto a un adattatore): fotogrammi chiave come li hanno gli hook LoRA di ComfyUI, una quota dei passi e un moltiplicatore: `0%:1, 50%:1, 60%:0` tiene l'adattatore intero per metà dei passi e lo lascia andare entro il 60 %. Fino a otto fotogrammi chiave, il moltiplicatore da 0 a 2, linee rette tra loro. Un adattatore che dà forma presto alla composizione e un adattatore di stile che deve toccare solo la finitura sono i due usi.

**Dentro**: gli adattatori vanno sul transformer del pittore prima che dipinga (PEFT), ciascuno alla sua forza; un file kohya (`lora_unet_blocks_0_…`) è rinominato con i nomi di strato propri del pittore; un adattatore che non raggiunge nessuno strato del pittore (fatto per un altro modello) ferma l'esecuzione e lo dice. Un pittore tenuto prende le forze di un'esecuzione seguente senza ricaricare i suoi adattatori.

## 9. Regioni

**Regioni**, sotto Campionamento, ripiegato: fino a tre parti dell'inquadratura, ciascuna con un posto e parole sue. I posti: la metà sinistra, destra, superiore o inferiore; il terzo sinistro, centrale o destro; i quattro quarti; il centro. Una piccola mappa accanto a ogni riga mostra dove sta.

**Come dipinge**: a ogni passo il pittore è interrogato una volta in più per ogni regione, con il prompt principale e le parole della regione, e le sue risposte si fondono secondo le scatole delle regioni come pesi dai bordi morbidi (un bordo di un venticinquesimo del lato più corto), condivisi dove le scatole si sovrappongono; il resto dell'inquadratura segue il solo prompt principale. È la via di Latent Couple: non ha bisogno di nulla dal modello, e la scena resta una scena perché il prompt di ogni regione porta quello principale.

**Come scriverle**: il prompt principale dice tutta la scena, una regione ciò che vi sta. *Two animals sitting in a snowy forest clearing at dawn, oil painting*; metà sinistra *a red fox sitting in the snow*; metà destra *a white snowy owl perched on a stump*. Su un seme, Qwen-Image 2512 ha dipinto due orsi senza le regioni e la volpe e la civetta con esse.

**Quanto costa**: un intero passaggio in più per passo per ogni regione (su una 3090 in 16:9: Qwen-Image 2512 fp8 141 s da solo, 281 s con due regioni). La stima del tempo del modulo le conta.

Le regioni si tengono in questo browser; una regione senza parole non si manda; **Ancora** dipinge con quelle proprie dell'esecuzione. Per Qwen-Image 2512; Qwen-Image 2.1 modifica a parole e dipinge senza.

## 10. Scritta

**Scritta**, sotto Regioni, ripiegato: un titolo, e una seconda riga sotto, scritti come parte del dipinto invece che posati sopra come uno strato che resta a parte dall'immagine. Le sue parole vanno in campi propri, mai nel prompt, e lo studio scrive ciò che il pittore legge. Due modi, scelti sotto **Come**:

- **Dipinta con l'immagine** (Qwen-Image 2512 o 2.1): lo studio aggiunge una frase al prompt: dove, il titolo tra virgolette, come sono le lettere, la seconda riga più piccola sotto, poi *painted in the same technique and light as the picture. No other text.* Un prompt di un paragrafo la riceve alla fine; un prompt scritto in paragrafi la riceve come paragrafo a sé, *TEXT RENDERING:*, secondo, dopo il primo: alla fine di un prompt lungo annega (il prompt di un album, 3.200 caratteri in dieci paragrafi, così ha dipinto tre immagini senza una lettera). Il prompt di un take chiede niente testo (*No text, no letters.*): quella frase si toglie prima.
- **Sull'immagine di riferimento** (Qwen-Image 2.1): un'immagine finita scritta a parole, il resto tenuto. L'ordine si scrive dai soli campi, così il prompt può restare vuoto. **Scrivi**, sul palco o nel menu di un'immagine, fa di quell'immagine il riferimento, imposta Come e apre il blocco con il titolo in mano.

**I campi**: **Titolo** (60 caratteri); **Seconda riga** (80: l'artista, l'album; vuota per nessuna); **Le lettere** (400, come sono a parole, lungo quanto un paragrafo di tipografia di un prompt; vuoto: *large elegant classical serif capitals in warm gold, with even letter spacing*); **Dove** (in alto, al centro, in basso). **Il titolo della ripresa** riempie il titolo dal take scelto a destra. Il blocco si tiene in questo browser; **Ancora** scrive con le parole proprie dell'esecuzione; la riga dell'esecuzione tiene la frase che il pittore ha letto.

**Rilettura**: i pittori sbagliano a scrivere le parole che hanno visto di rado. Su un faro, Qwen-Image 2512 ha scritto «RUOCH STUDIO» e Qwen-Image 2.1 «RUUCH STUDIO», mentre «ПЕСНЯ МАЯКА» e «РУАХ СТУДИЯ» sono venute giuste. Così ogni immagine è riletta dall'ascoltatore, Qwen2.5-Omni tramite llama.cpp (circa 5 s a immagine su una RTX 3090; ha letto entrambi gli errori così com'erano), e confrontata parola per parola: maiuscole e a capo a parte, nient'altro è perdonato (ё non è е). Un'immagine scritta male è dipinta di nuovo con un altro seme (il suo seme più 1000, poi più 2000), fino a tre volte, a giri: tutte le immagini scritte male di un'esecuzione insieme, così il pittore e l'ascoltatore si scambiano il posto una volta a giro. Si tiene la prima scritta esatta; gli altri tentativi vanno nella cartella misspelled/ dell'esecuzione, tenuti, mai cancellati. Quando nessun tentativo è giusto, si tiene il più vicino e lo si dice scritto male, con ciò che si legge. Senza l'ascoltatore le immagini si tengono come dipinte e si dicono non lette: mai mostrate come scritte giuste.

**La scheda per leggere**: l'ascoltatore vuole circa 11 GB. Un pittore intero sulla scheda mette i suoi pesi in RAM mentre l'ascoltatore legge e li riprende dopo; Qwen-Image 2.1 lascia la scheda libera da sé; un pittore in streaming con i suoi blocchi che riempiono la scheda lascia l'ascoltatore leggere sul processore (circa 64 s a immagine).

**I segni**: accanto a ogni immagine **✓ Aa** (scritta come chiesto), **⚠ Aa** (scritta male in ogni tentativo; il suo suggerimento dice che cosa si legge e quanti tentativi ci sono stati), **? Aa** (non riletta). La riga del palco dice *scritto «…»* e, per una scritta male, che cosa si legge.

**Tempi** (RTX 3090, un quadrato): Qwen-Image 2.1 ha scritto su un'immagine finita in 118 s, letta giusta subito; un fine-tune fp8 di Qwen-Image 2512 senza Lightning (30 passi, vero CFG 4, la via propria di un fine-tune fp8) ne ha dipinta una con le sue lettere in 230 s, contando il caricamento, di cui circa 150 s il dipingere. Un'immagine scritta male costa un'intera immagine in più per ogni tentativo: di due variazioni di «LANTERN SONG / RUACH STUDIO», una è venuta giusta subito e l'altra è rimasta sbagliata in tutti e tre i tentativi («RUCH STUDIO»), tenuta e detta, in 743 s per l'esecuzione. Lightning fa di ogni tentativo una frazione di questo. La stima del modulo conta la lettura.

**Cirillico**: il titolo di un album in cirillico, su due righe (una parola, poi una riga con Щ e Ш), nello stile del suo stesso prompt. Qwen-Image 2512 ha scritto giusto il titolo in tutte e nove le immagini; la seconda riga in minuscolo in nessuno di sei tentativi (le minuscole Щ e Ш scarabocchiate); in maiuscolo Щ e Ш sono venute giuste ogni volta e solo l'ultima lettera ha sbagliato, con anche le forme delle lettere dette (la sua idea, HERESY 1396: Ы, Щ, Ш e le altre lettere che un pittore addestrato sul latino ha visto di rado, e Ф accanto alla Φ greca, ciascuna descritta quando le parole la portano). Un suggerimento compitato (le lettere con trattini in mezzo) è stato provato e lasciato: il pittore può dipingere i suoi trattini nel titolo. Per il cirillico: maiuscole, e guarda il segno.

**Perché dipinta e non composta**: un vero carattere composto dallo studio (crenatura, spaziatura e interlinea con raqm) e dipinto leggermente sopra scrive esatto, ma resta uno strato sull'immagine. Dei quattro modi provati, Viktor ha scelto i due in cui il pittore scrive da sé le lettere.

## 11. Un'immagine da cui dipingere

**Il riferimento**: lascia cadere un'immagine al suo posto sotto il prompt, incollane una (Ctrl+V), scegli un file, o prendi l'immagine del palco con **Come riferimento** (o la copertina del take con **La copertina del take**). PNG, JPEG o WebP, al massimo 40 MB.

### Usarla

**Usarla**, sotto l'immagine, dice come:

- **per dipingere da essa** (il default): da immagine a immagine con il pittore del modulo, quanto dice **Quanto può cambiare**;
- **per modificarla a parole**: Qwen-Image 2.1 tiene la scena e cambia ciò che dice il prompt (*the same lighthouse in a snowy winter night*: la neve è venuta dove va, la torre e gli scogli tenuti);
- **solo per il suo stile**: Qwen-Image 2.1 dipinge la scena propria del prompt con la tecnica, la pennellata, la tavolozza e la luce dell'immagine, senza tenere nulla del suo soggetto (un faro a olio ha dato *a red fox in a snowy forest under the moon* con il suo pennello).

Gli ultimi due si offrono quando Qwen-Image 2.1 è qui. Con l'uno o l'altro, l'esecuzione è del 2.1 qualunque sia il pittore del modulo: il modello del modulo, il campionamento, gli adattatori, la maschera e la tela non si mandano, e vale la licenza del 2.1. Dentro, un riferimento di stile è il prompt avvolto in una richiesta di prendere dall'immagine solo lo stile e nulla del suo soggetto; la modifica è la via propria del 2.1 con un'immagine-condizione.

### Quanto può cambiare

Da immagine a immagine qui è ciò che InvokeAI fa con modelli che non hanno una pipeline per questo: l'immagine copre ogni forma ed è tagliata dal suo centro, passa al contrario per il decodificatore del pittore in latenti, ed è resa rumorosa fino a un punto della pianificazione propria del pittore; il dipingere poi percorre il resto della pianificazione da lì. La forza sceglie quel punto: il più vicino dei passi propri della pianificazione, almeno due passi.

| forza | che cosa dà (provato su Krea 2 Muse, il pittore della stanza allora) |
|---|---|
| 0,3 | l'immagine quasi com'è, la sua superficie toccata |
| 0,5 | l'immagine tenuta, le sue piccole cose cambiate (scritte, texture) |
| 0,6 | la sua composizione tenuta, la sua materia cambiata (il default della stanza) |
| 0,75 | la composizione tenuta, i materiali del prompt presi |
| 0,9 | la scena del prompt dipinta nella luce e nei colori dell'immagine |
| 1,0 | dipinta di nuovo |

**Rumore aggiunto** sotto la forza (0 di default, da 0 a 2): rumore fresco messo sui latenti dell'immagine prima che il dipingere parta da essi, come fa il flusso ComfyUI di Viktor con InjectLatentNoise (`samples + noise · strength` nello spazio proprio del decodificatore; qui diviso per la dispersione di ogni canale, così il numero significa ciò che significa lì). 0,3 porta grana e dettaglio nuovi, 0,6 è il suo secondo passaggio, sopra 1 le forme dell'immagine cominciano a rompersi. Sposta solo l'inizio: ciò che una maschera tiene resta pulito.

### Maschera

**Maschera…** dipinge sopra l'immagine ciò che va ridipinto (Dipingi e Cancella, B ed E; il pennello e la sua dimensione, `[` e `]`; Inverti; Svuota): il resto resta esattamente com'era, come nell'inpainting. Dentro, la maschera va sulla griglia propria dei latenti, e a ogni passo la parte tenuta è rimessa come l'immagine resa rumorosa fino a quel passo; l'immagine finita prende i pixel propri dell'immagine fuori dalla maschera, sfumati.

Quattro opzioni sotto l'immagine quando una maschera è attiva (o Dipingi intorno):

- **Crescita**: la maschera cresciuta di tanti pixel, o ristretta (da −64 a 128);
- **Bordo**: quanto è morbido il suo bordo (da 0 a 96 px);
- **Morbidi**: ridipintura morbida, come la differential diffusion: dove il bordo è grigio l'immagine cambia solo negli ultimi passi, quindi nessuna cucitura;
- **Grana**: quanto della pittura nuova prende la parte tenuta a ogni passo (da 0 a 0,6), la sua grana e la sua luce cucite alle nuove; 0 la tiene esatta.

Il bordo di una maschera rotonda può restare visibile senza di loro; Crescita 16, Bordo 24, Morbidi e Grana 0,15 hanno cucito un volto nuovo in una vecchia tela senza una linea.

### Dipingi intorno

**Dipingi intorno** tiene l'intera immagine al centro di ogni forma e dipinge di nuovo i bordi che lascia, nei suoi colori e nella sua luce: una copertina quadrata in un 16:9 per un video o in un 9:16 per uno short, come outpainting.

### La tela

**Tela…** accanto a Maschera… apre la tela, come quella di InvokeAI: l'inquadratura di ogni forma una scheda in alto, che dice come sarà dipinta (**da essa**: l'immagine copre l'inquadratura e l'esecuzione dipinge da essa alla forza chiesta; **intorno**: la parte dell'inquadratura che lascia nuda si dipinge intorno). Sulla tavola **Sposta** (V) trascina l'immagine, o un angolo per ridimensionarla con l'angolo opposto fermo; **Pennello** (B) e **Gomma** (E) dipingono sopra la maschera di inpainting; **Mano** (H, o Spazio tenuto) muove la tavola; la rotella zooma, Alt+rotella ridimensiona l'immagine attorno al puntatore, le frecce la spingono (Maiusc: dieci pixel). A destra gli strati e il posto in numeri; in alto **Adatta**, **Riempi**, **Centra** e **Uguale in tutte**, annulla e ripeti (trenta passi). **Fatto** tiene il posto di ogni forma con il riferimento e la maschera nel modulo. Un posto è il centro dell'immagine in quota dell'inquadratura e la sua larghezza in larghezze d'inquadratura.

## 12. Il secondo passaggio

**Secondo passaggio…**, sul palco accanto a Upscale…, ridipinge un'immagine più grande, come fa il flusso ComfyUI di Viktor dopo il suo primo passaggio: l'immagine portata a **×1,5** o **×2** per vicino più prossimo e dipinta di nuovo dal pittore, fine-tune, adattatori, prompt e seme propri della sua esecuzione, da una parte della strada.

**Come lo fa il suo flusso**, letto nodo per nodo: l'immagine del primo passaggio 2× con nearest-exact, codificata a tasselli, InjectLatentNoise 0,6, poi un secondo KSampler dal passo 20 di 60 a CFG 4,5, con lo stesso sampler e la stessa pianificazione del primo passaggio (entrambi vengono da un unico packer: ER-SDE e Bong tangent come è salvato il flusso).

**Nello studio**: **Quanto può cambiare** (0,5 per primo: 0,3 tiene il disegno e aggiunge dettaglio, 0,5 affila la sua materia, 0,7 ridipinge le sue forme) e **Rumore aggiunto** (0,6 per primo, come il suo) nella sua riga; i passi, il sampler, la pianificazione e Lightning sono quelli del modulo quando il modulo dipinge con lo stesso pittore, altrimenti quelli propri dell'esecuzione. La sua ricetta dà al secondo passaggio molti passi e niente Lightning: impostali nel modulo prima di premere ×2.

**Quanto costa e che cosa dà**: un 16:9 di 1920 × 1080 esce 3840 × 2160. Su una 3090, un fine-tune fp8 di Qwen-Image 2512 a 3840 × 2160 in 220 s con 12 passi e Lightning (22,9 GB, i suoi blocchi in streaming). A 0,6 ha tenuto la scena e spostato un poco le sue parti; a 0,5 la composizione ha tenuto. Non per Qwen-Image 2.1; nessuna maschera né tela con esso. **Ancora** su un secondo passaggio lo dipinge di nuovo alla sua dimensione.

## 13. Upscale

**Upscale…** sul palco porta un'immagine a **2K** o **4K** (il suo lato lungo 2560 o 3840) con un upscaler da `artwork/upscalers/` (`.pth` o `.safetensors`, cartelle ammesse): ESRGAN, DAT, HAT, ATD, SPAN, OmniSR e i loro parenti, letti da spandrel dal solo file. L'immagine passa in tasselli da 512 con 32 di sovrapposizione, tenendo il centro di ogni tassello (nessuna cucitura); un modello 4× a cui si chiede meno dipinge a 4× ed è riportato giù con Lanczos, più fine di un modello 2×. Il lato lungo si ferma a 10 240 px. La **i** accanto alla scelta dice a che cosa serve l'upscaler scelto (foto, volti, disegno), il suo autore, la licenza e il tempo misurato; un clic apre le note di tutti, raggruppati, i più veloci per primi, i non commerciali segnati.

**Passaggi…** fa un upscale in passaggi, come la pila ComfyUI di Viktor: fino a quattro righe di un modello e un fattore, ciascuna passata sull'immagine com'è e portata alla dimensione originale per il fattore del passaggio, poi il lato lungo chiesto e i colori accordati all'originale (hm-mvgd-hm: istogrammi, media e covarianza, istogrammi). La sua catena è a un clic quando i suoi modelli sono qui: span otf strong ×2, poi Nomos8kDAT ×4, Remacri ×1,5, UltraMix Balanced ×2: un'immagine 1920 × 1080 in 7680 × 4320 in 246 s, nessuna cucitura, i colori tenuti.

**TTA** accanto all'upscaler: ogni tassello passa nel modello nei suoi otto orientamenti (quattro rotazioni, ciascuna specchiata), mediati: bordi e texture più stabili, fino a otto volte il tempo. **Upscale…** sulla barra delle immagini scelte (Ctrl+clic) ne porta su fino a 64 insieme, distribuite sulle schede del laboratorio.

L'upscale e il secondo passaggio fanno cose diverse: un upscaler affila ciò che c'è; un secondo passaggio dipinge dettaglio nuovo alla nuova dimensione. Per una stampa: prima secondo passaggio ×2, poi upscale.

## 14. Il palco, la libreria e il cestino

**Il palco**: un clic su un'immagine la mette lì con la sua esecuzione sotto; un clic su di essa (o un doppio clic su qualsiasi immagine) la apre sopra la pagina nella sua forma (← → percorrono l'esecuzione, o la galleria; Esc chiude). Sotto: **Nel modulo**, **Come riferimento**, **Confronta…**, **Nota…** (una nota tua: resta con l'immagine nella sua esecuzione e si vede nel suo suggerimento; una vuota la toglie), **Imposta come copertina** (una quadrata), **Scarica** (PNG, dimensione piena), **Sopra la pagina**, ★, **Proteggi** (lo scudo: un'immagine protetta non va mai nel cestino né viene cancellata, qualunque cosa ve l'abbia mandata), **Cestino**, **Secondo passaggio…**, **Upscale…**. I dati e il prompt dell'esecuzione stanno in un suggerimento accanto all'immagine finché il puntatore è su di essa.

**Esecuzioni o Galleria**: le esecuzioni mostrano ogni pressione di Disegna con il suo prompt e il suo seme, le più nuove in alto; la galleria mostra ogni immagine di ogni esecuzione in un'unica griglia, per forma, con stella o protette, in tre dimensioni, a tasselli uguali. Le frecce percorrono la libreria finché ha un'immagine: ← → l'immagine prima e dopo, ↑ ↓ una riga della galleria (nelle esecuzioni, l'esecuzione prima e dopo); il palco segue.

**Confronta**: **Confronta…**, poi l'altra immagine scelta nella libreria: le due una sopra l'altra sotto un divisore che trascini (← → lo spostano), o affiancate (S); X le scambia, Esc chiude.

**Il menu di un'immagine** (un clic destro su qualsiasi immagine): Sopra la pagina, Sul palco, Nel modulo, Tutto nel modulo, Come riferimento, Confronta…, Imposta come copertina, Upscale (2K o 4K), Segna con la stella, Scegli, Copia il prompt, Copia il seme, Scarica, Il file in una nuova scheda, La sua esecuzione, Nel cestino.

**Sceglierne molte**: Ctrl+clic sceglie immagini, Maiusc+clic un intervallo; la barra delle scelte le segna con la stella, le porta su o le mette nel cestino tutte insieme (Esc le lascia).

**Il cestino**: **Cestino** su un'esecuzione la sposta in `trash/artist/`; il Cestino del palco mette da parte un'immagine. La vista **Cestino** mostra le immagini messe da parte (Ripristina, ✕, Ripristina tutte), poi le esecuzioni nel cestino (Ripristina, Elimina per sempre); **Svuota** cancella tutto ciò che mostra, chiedendo prima. **Cestino (Arte)** nel Bibliotecario tiene l'arte messa via in un'unica lista, anche le copertine tolte ai take.

**Il registro dell'Artista**: la cornice del registro del server ha una vista **Artista**, quella propria della stanza: che cosa è stato chiesto (il pittore, il fine-tune, le forme, il seme, il campionamento, gli adattatori), che cosa ha risposto il laboratorio (un rifiuto con parole sue), la strada di ogni esecuzione fino alla fine (attese e perché, la scheda su cui dipinge, fatto, fermato, fallito e perché). **⧉** lo apre in una finestra sua, con le schede dal vivo accanto.

## 15. Copertine per i take

**Imposta come copertina** di un'immagine quadrata la fa copertina del take in mano: nella sua scheda, nel lettore e nel suo MP3. La copertina che aveva è tenuta accanto al take (`artwork-removed/`), e l'altra lettera di una coppia A/B riceve anch'essa la nuova quando non ne ha una. Una copertina è la copia propria del take (1024 px, con il nome dell'esecuzione e dell'immagine da cui viene), così toglierla dal take non tocca mai l'immagine, e l'immagine che se ne va non tocca mai la copertina; mettere una tale immagine nel cestino chiede se togliere anche la copertina dal take, o lasciarla.

**La copertina propria di un take** (*Disegna la copertina* nel suo menu, nel Bibliotecario, per un take o molti) è dipinta dal pittore scelto in **Motore → Copertina**, o secondo le schede quando non ne è scelto nessuno: **Qwen-Image 2512** dove una scheda dei lavori del laboratorio lo contiene intero (Q6 da 20 GB, Q4 da 16 GB: segue meglio il prompt e scrive giusto un titolo), altrimenti Q4 in streaming dalla RAM su una scheda più piccola (circa 6 GB della scheda e 30 GB di RAM). Un piccolo modello linguistico scrive il suo prompt dallo stile e dalle parole del take, e il critico guarda se il suo soggetto c'è. Una copertina è un lavoro a sé che carica il pittore da capo: su una 3090, Qwen-Image 2512 Q4 da 105 a 125 s, Q6 131 s, il suo fp8 BASE 95 s, tutto contato (sezione 18). Un Q4 è appena più veloce di un Q6: dipingere è l'aritmetica della scheda, non la sua memoria.

## 16. Ricette

**Una copertina, veloce.** Qwen-Image 2512 Q4 con ⚡ Lightning, 1:1, Variazioni 4, il campionamento come viene. Circa tre minuti per quattro candidate, caricamento compreso; scegli, Imposta come copertina.

**Realismo finito.** Qwen-Image 2512 con un fine-tune fp8, Lightning spento, da 30 a 40 passi, Guida 4, ER-SDE o RES 2s con Beta. Poi Secondo passaggio ×2 a 0,45 con Rumore aggiunto 0,6 (il campionamento del modulo passa in esso), poi Upscale 4K o i passaggi.

**Il primo e il secondo passaggio del ComfyUI di Viktor.** Un fine-tune fp8, ER-SDE e Bong tangent, 12 passi; Secondo passaggio ×2 con 0,6 di rumore aggiunto e molti passi senza Lightning, la forza tra 0,5 e 0,65.

**Un fotogramma video da una copertina.** La copertina come riferimento, Dipingi intorno, la forma 16:9 (o 9:16 per uno short): i bordi dipinti nei suoi colori e nella sua luce, la copertina intera al centro. Sulla tela, sposta o ridimensiona prima la copertina in ogni inquadratura se non deve stare al centro.

**Sistemare una parte.** L'immagine come riferimento, Maschera… sulla parte, il prompt che dice che cosa deve esserci, forza 1,0; Crescita 16, Bordo 24, Morbidi, Grana 0,15 per una cucitura che non si vede.

**Due soggetti al loro posto.** Il prompt principale per tutta la scena, una regione per ogni soggetto (metà sinistra, metà destra), le parole delle regioni brevi e concrete.

**Lo stile di un vecchio quadro per una scena nuova.** Il quadro come riferimento, Usarla: solo per il suo stile, il prompt per la scena nuova.

**La stessa scena in un'altra stagione o ora.** L'immagine come riferimento, Usarla: per modificarla a parole, il prompt che dice il cambiamento (*the same street in heavy rain at night*).

**Una stampa.** Secondo passaggio ×2, poi Passaggi… fino a 7680 sul lato lungo, TTA per un cielo liscio.

## 17. Quando qualcosa va storto

| che cosa vedi | perché | che cosa fare |
|---|---|---|
| il soggetto dipinto due volte | Qwen-Image 2512 con Lightning su Karras, Exponential o KL optimal | Simple, Beta, Beta 57, SGM uniform o Bong tangent |
| immagini Qwen morbide e velate | Euler SDE senza Lightning | Euler, ER-SDE o RES |
| colori e bordi bruciati | la somma degli adattatori oltre circa 1,8 | abbassali (la barra Insieme), o fotogrammi chiave che ne lascino andare uno presto |
| «l'adattatore non raggiunge nessuno strato» | un adattatore fatto per un altro modello | mettilo nella cartella della sua famiglia |
| lettere che non hai chiesto | entrambi i pittori scrivono da soli sulle copertine | chiudi il prompt con *no text* |
| un'immagine mancante in un'esecuzione | il filtro dei contenuti l'ha segnalata | l'esecuzione lo dice; cambia il prompt |
| una cucitura visibile attorno a una maschera | un bordo netto | Crescita, Bordo, Morbidi e un po' di Grana |
| il secondo passaggio ha spostato la scena | la forza troppo alta | da 0,4 a 0,5 |
| l'esecuzione aspetta una scheda | le schede del laboratorio sono occupate o troppo piccole ora | l'attività del registro dice perché; Fuori dalla coda la ritira |
| «nessuna scheda qui può prenderlo» | il pittore con i suoi adattatori chiede più di quanto contenga qualsiasi scheda | meno adattatori o un pittore più piccolo (Qwen-Image 2512 e 2.1 vanno in streaming al suo posto quando possono) |
| regioni ignorate | scelto Qwen-Image 2.1, o una regione senza parole | Qwen-Image 2512, parole in ogni regione |
| prima esecuzione lenta, le successive veloci | il pittore carica una volta e resta dieci minuti | come previsto |

## 18. I numeri

Misurati su una RTX 3090 (24 GB) con gli strumenti propri dello studio.

| che cosa | tempo | scheda al picco |
|---|---|---|
| Qwen-Image 2512 Q4, 1328², Lightning | 30 s | 14,3 GB |
| Qwen-Image 2512 Q6, 1328², Lightning | 32 s | 17,6 GB |
| fine-tune fp8 di Qwen-Image 2512, 1328², Lightning 0,55, 12 passi | 37 s | 21,0 GB |
| fine-tune fp8 di Qwen-Image 2512, 16:9 | circa 141 s con il caricamento | 20,5 GB |
| Qwen-Image 2.1 a parole, 1328² | 120 s | 16,4 GB (intero), 4,1 GB (in streaming) |
| Qwen-Image 2.1 in modifica | da 122 a 129 s | 19,1 GB (intero), 7,9 GB (in streaming) |
| secondo passaggio ×2, fine-tune fp8 di Qwen-Image 2512 a 3840 × 2160 | 220 s | 22,9 GB |
| upscale ×2, 4x_Nomos8kDAT, 1280² a 2560² | 32 s | 2,1 GB |
| upscale a passaggi, la sua catena, 1920 × 1080 a 7680 × 4320 | 246 s | |
| copertina di un take da Qwen-Image 2512 fp8 BASE (un lavoro a sé: il pittore caricato, il prompt scritto, lo sguardo del critico) | circa 95 s | |
| copertina di un take da Qwen-Image 2512 Q4 / Q6, lo stesso | 105–125 s / 131 s | |

La prima esecuzione di un pittore aggiunge il suo caricamento: un minuto o due per i pittori Qwen.

## 19. Per script e agenti

Il laboratorio risponde sulla macchina dello studio (attraverso la pagina su `/lab/…`); l'API dello studio (`/api/v1`, OpenAPI 3.1) e il suo server MCP stanno accanto. Gli endpoint propri dell'Artista:

- `POST /artist/draw`: un'esecuzione. Il suo corpo: `prompt`; `shapes` (`1:1`, `16:9`, `9:16`); `count` (da 1 a 4); `seed`; `painter` (`qwen2512-q4`, `qwen2512-q6`, `qwen2512-fp8`, `qwen21`); `model` (il file di un fine-tune fp8); `sampling` (`steps`, `sampler`, `schedule`, `lightning`, `cfg`); `loras` (`[{id, weight, keys}]`); `ref` (un data URL, o `{id, file}` di un'immagine di un'esecuzione precedente) con `strength` (da 0,2 a 1) e `ref_as` (`edit`, `style`); `mask` con `mask_opts` (`grow`, `edge`, `soft`, `grain`); `fit` (dipingi intorno); `place` (la tela: `{shape: {x, y, s}}`); `inject` (da 0 a 2); `scale` (1,5 o 2, un secondo passaggio); `regions` (`[{prompt, box: [x, y, w, h]}]`, al massimo tre); `letters` (`{title, sub, look, where, way}`: `where` `top`, `middle` o `bottom`, `way` `paint` o `letter`; con `letter` il pittore è `qwen21` con un `ref`, e `prompt` può essere vuoto); `preview`; `take`. Un'esecuzione con scritta porta `letters_prompt` (la frase che il pittore ha letto), e ciascuna delle sue immagini `letters`: `{read, exact, near, tries}`, o `{unread}` quando l'ascoltatore non ha potuto leggerla.
- `GET /artist/runs`, `GET /artist/file`, `POST /artist/stop`, `POST /artist/cover`, `POST /artist/star`, `POST /artist/note` (`{id, file, note}`), `POST /artist/protect`, `POST /artist/trash`, `POST /artist/restore`, `POST /artist/aside`.
- `GET /artist/painters` (i pittori qui, le loro schede e i fine-tune), `POST /artist/unload` (lascia andare i pittori tenuti).
- `GET /artist/upscalers`, `POST /artist/upscale` (`{id, file, model, target}` con `2k` o `4k`; o `passes`, `resample`, `long`, `match`; `tta`; o `items` per molte).
- `GET /artist/loras`, `POST /artist/lora-civitai` (cerca per hash), `POST /artist/civitai-look`, `POST /artist/civitai-fetch`.

Un rifiuto torna come `400` con il motivo a parole, le stesse parole che mostra la stanza.

## 20. Licenze

Il filtro dei contenuti (Falconsai) e chi scrive il prompt (Qwen3-4B): Apache-2.0; il filtro guarda ogni immagine che lo studio dipinge. Qwen-Image 2512 e Lightning: Apache-2.0. I fine-tune fp8: i termini di ciascun autore. Qwen-Image 2.1: la Qwen Research Licence, solo ricerca e valutazione. Adattatori: i termini di ciascun autore, come li elenca Civitai. Upscaler: ciascuno i suoi; le note di OpenModelDB dicono quali sono non commerciali, e la stanza li segna. Ciò che puoi fare con le immagini che dipingi discende da queste; quando conta, leggile prima di vendere.

## 21. Che cosa viene dopo

Le versioni dell'immagine di un take, e SeedVR come upscaler (nella 2.1.0, con la fase del DAW).
