# Ruach Studio · la guida

Canzoni dalle parole, sulla tua macchina: ogni stanza, a cosa serve ogni cosa e i numeri che abbiamo misurato.

## Comincia da qui <!-- #start -->

### Che cos'è <!-- #what-this-is -->

Ruach Studio trasforma una riga di stile e un testo in una canzone finita con **YuE2**, il modello aperto di canzoni, sulla tua GPU. Niente esce dalla macchina. Attorno al modello c'è un intero studio: una stanza di scrittura con un modello di chat, la post-produzione (stem, remaster, upscale, verifica del testo), una raccolta di tutti i take e una stanza che addestra adattatori LoRA sulle tue canzoni.

![Il Creatore: il modulo a sinistra, il take al centro, tutti i take a destra](guide/studio-create.png "Il Creatore: il modulo, il take che stai ascoltando e tutti i tuoi take")

YuE2 ha **due metà**, e quasi tutto ciò che regoli nello studio mira a una delle due:

| metà | cosa fa | cosa governi lì |
|---|---|---|
| **Musica** (AR, il modello linguistico) | scrive la canzone: prima una partitura (notazione ABC), poi i token musicali, 25 al secondo | la modalità di pianificazione, la partitura, il seme musicale, la forza musicale di una LoRA |
| **Suono** (NAR + VAE) | trasforma i token in suono | il seme sonoro, il VAE, la forza sonora di una LoRA, i passi e il risolutore |

### Le sei stanze <!-- #the-six-rooms -->

| stanza | a cosa serve |
|---|---|
| **Creatore** | il modulo della canzone e il take che stai ascoltando |
| **Scrittore** | le tue canzoni come documenti con versioni; un modello di chat scrive bozze e rivede con te |
| **Rifinitore** | dopo il render: spettro, artefatti, antironzio, verifica del testo, stem, remaster, upscale |
| **Artista** | immagini per le tue canzoni da un prompt tuo: quadrata, larga e alta da un seme; la quadrata diventa la copertina di un take (un'anteprima) |
| **Bibliotecario** | tutti i take: spazi, ricerca, mi piace, note, azioni in blocco, il cestino |
| **Addestratore LoRA** | adattatori LoRA dalle tue canzoni: il set, l'esecuzione, la sua telemetria e le sue epoche |

### La barra <!-- #the-bar -->

![La barra: le stanze, lo spazio e i pochi pulsanti che usi sempre](guide/bar.png)

Le stanze aprono la barra nell'ordine del lavoro: Creatore, Scrittore, Rifinitore, Artista (un'anteprima: immagini per le tue canzoni) e Bibliotecario; il logo sta al centro, l'Addestratore subito dopo; a destra, lo spazio, la spia del motore (verde: pronto; ambra: al lavoro; rossa: qualcosa non è andato) e i pochi pulsanti. Il puntatore sulla spia (o un clic) apre **cosa gira e cosa aspetta**: le canzoni, le rigenerazioni e il lavoro del laboratorio sulle schede video (copertine, stem, upscale, Whisper). Ciò che aspetta esce dalla sua coda con la sua ✕, premuta due volte (la prima pressione chiede conferma); ciò che gira già si ferma dove è mostrato: una canzone nella sua esecuzione, un addestramento nell'Addestratore.

- **Spazio**: lo spazio in mano. L'elenco dei take mostra solo quello, e ogni nuovo take vi finisce dentro. *Tutti gli spazi* mostra tutto. Dove la barra è stretta (senza logo), se ne va anche la parola *Spazio*; il selettore resta.
- **IT** (le due lettere della lingua): la pagina in un'altra lingua, salvata con le tue impostazioni: English, Русский, Українська, Беларуская, Ελληνικά, Español, Italiano, ognuna chiamata con le sue parole. Numeri e date seguono la lingua, e questa guida si apre in essa.
- **☀ / ☾**: giorno, notte o come dice il sistema.
- Nell'intestazione di Composizione: **Salva** un prompt (tutto ciò che la generazione invierebbe) come JSON o YAML e **Apri** per riprenderlo; **Svuota** le parole (titolo, stile, testo, partitura, seed) senza toccare il resto, oppure inizia una **Nuova canzone** (anche modalità, campionamento, slider e LoRA ai predefiniti; *Suono e uscita* resta). **Apri** dice cosa di un file il modulo non ha potuto accogliere e cosa tiene al suo posto.
- **Esporta in una DAW** (nel ☰, e nel Rifinitore: accanto al take in mano e nei suoi Stem): la via d'uscita dallo studio. O la traccia mixata così com'è (WAV, FLAC, MP3), o l'intero take nella tua DAW, dove il resto avviene fuori dallo studio. La pagina trova REAPER, Waveform e Bitwig sulla macchina dello studio, oppure indichi tu la tua. Ogni take esce dal suo menu (clic destro): *Esporta in una DAW → Progetto REAPER* o *DAWproject* (Waveform, Bitwig, Studio One, Cubase), la tua DAW per prima; la scheda DAW di questa guida dice cosa c'è dentro.
- **Rilascia il modello**: toglie subito dalla memoria della GPU ogni modello inattivo; tinto di rosso finché un modello è caricato.
- **☰**: il resto. La scheda video e la sua memoria, la copia del modello, il decodificatore del suono (VAE), **Esporta in una DAW**, i temi, la stanza del Motore e questa guida. **Text size** lì imposta la dimensione del testo di tutta la pagina da −2 a +4 pt (la disposizione resta), e una cornice sollevata ha i suoi −, + e ⟲ sopra (da −4 a +6 pt); ogni schermo tiene il suo.

![Dietro il ☰](guide/more-menu.png)

### La tua prima canzone, in sei passi <!-- #your-first-song-in-six-steps -->

1. Dalle un **Titolo** e scegli la **Tonalità** se ne hai una in mente (o lascia *come è scritta*).
2. Scrivi lo **Stile**: lingua, genere, voce, strumenti, tempo. Una o due righe semplici bastano. Il ♪ lì accanto elenca 200 strumenti con ciò che YuE2 suona davvero (vedi *Creatore*).
3. Incolla il **Testo** con i tag di sezione su righe a sé: `[Verse]`, `[Chorus]`, `[Bridge]`, `[Outro]`.
4. Lascia **Piano completo** come modalità di pianificazione: YuE2 scrive prima melodia e accordi, poi la canzone.
5. Premi **Genera canzone**. L'esecuzione mostra le sue fasi: la partitura, i token musicali, il suono, la decodifica.
6. Il take si apre al centro, con il suo lettore, la sua partitura e tutto il necessario per rifarlo.

> Misurato su una RTX 3090: una canzone di 6:12 in modalità Diretto ha richiesto 126 secondi, una di 7:25 in Piano completo 198 secondi (prima si scrive la partitura). Le canzoni più brevi sono più rapide.

### Il lettore, i take e il log del server <!-- #the-player-the-takes-and-the-server-log -->

- **Il lettore** in basso: la forma d'onda da un lato all'altro, una nuvola morbida con la parte già ascoltata nel colore d'accento (un clic salta lì); sotto, il take (la sua copertina quando ce l'ha, il titolo, le prime parole dello stile, 👍 👎 ★), poi **casuale**, precedente, riproduci, successivo e **ripeti** (spento · tutto l'elenco di nuovo · questo take di nuovo, segnato 1), poi il tempo (un clic sulla durata totale lo trasforma nel tempo rimanente), *riproduci al clic* (un clic in un elenco riproduce subito il take), *continua a riprodurre* (quando un take finisce, parte il successivo dell'elenco), la **velocità** (da 0.50× a 2.00×, l'intonazione conservata), il volume e un punto di stato (pulsa mentre suona un take). Ciò che non ti serve in quel momento resta tenue finché non arriva il puntatore; ogni icona dice cosa fa quando il puntatore ci si posa. Il puntatore sulla forma d'onda mostra il tempo a cui salterebbe un clic. I tasti multimediali della tastiera e di una cuffia governano il lettore, e il pannello multimediale del desktop mostra il take. ⏪ e ⏩ vanno al segno precedente o successivo ogni 15 secondi da 0:00, ← e → ai segni di 5 secondi (con Shift, di 30). La pillola di stato all'estremità destra del lettore (verde mentre suona un take, del colore d'accento mentre se ne fa uno) apre il take o l'esecuzione; con Compose sollevato sopra la stanza, gira la cornice su quella del take.
- **Due righe o una**: la forma d'onda sopra i pulsanti del lettore resta dove le canzoni si ascoltano e si confrontano (Creatore, Rifinitore, Bibliotecario); nello Scrittore, nell'Artista, nell'Addestratore e nel Motore il lettore sta in una riga, come nel Creatore mentre una cornice è sollevata o il testo è sopra tutto. Dopo un ricaricamento (F5) torna con il suo take e il suo punto. Nell'Artista i take partono richiusi e il log del server sta a sinistra.
- **Le schede dal vivo**: in Engine → GPUs ogni scheda ha sotto una riga sua, il carico e la memoria una barra al secondo per due minuti, con temperatura e potenza; il log del server aperto mostra accanto le schede che hanno un ruolo, ciascuna col suo ruolo sopra, quella dello studio incorniciata.
- **La linea verso lo studio** appare accanto al log del server (*Forge · 85 ms*, o *qui* sulla stessa macchina). Quando lo studio è lontano, un mi piace, un preferito o un fissaggio si vedono subito e lo studio li conferma soltanto.
- **Take** a destra: cerca con parole, `*` e `?`; *Preferiti*; richiudi la colonna con »; ⋯ per le azioni proprie dell'elenco.
- **Il log del server** sta proprio sopra il lettore in ogni stanza: chiuso, mostra l'ultima cosa detta dal motore (in rosso quando qualcosa non è andato); aperto, dieci righe, *Segui*, *Copia* e la via al log completo nel Motore. Con una cornice sollevata sopra la stanza, sta a sinistra, lontano dai pulsanti della cornice.

![Il log del server, aperto](guide/log-dock.png)

## Creatore <!-- #creator -->

### Composizione: il modulo della canzone <!-- #compose-the-song-form -->

![Titolo, tonalità, semi e stile](guide/compose-top.png)

- **Parti da un'idea**: una riga sulla canzone; il modello di chat dello Scrittore abbozza il titolo, lo stile e il testo (*Scrivi il brief*).
- **Titolo**, **Tonalità**: la tonalità entra nella partitura (`K:`). Con una partitura nel modulo, una nuova tonalità la sposta lì; senza, la scelta aspetta e sposterà la partitura che arriva.
- **Seme musicale** e **Seme sonoro**: i dadi delle due metà. Vuoto è casuale; un numero ripete un take. Tieni il seme musicale e cambia quello sonoro per sentire la stessa canzone resa in modo diverso. Stanno per primi in *Campionamento e riduzione del rumore*.
- **Stile**: lingua, genere, voce, strumenti, tempo. *Salva stile…* lo conserva con un nome.

### Il prontuario degli strumenti ♪ <!-- #the-instruments-cheat-sheet -->

Il ♪ accanto allo stile apre una tabella di 200 strumenti che lo studio ha provato: la loro famiglia, la loro terra, come suonano (in inglese e in russo) e le parole che li chiamano. ▶ A e ▶ B riproducono due prove di 60 secondi di ciascuno. Il verdetto di ogni riga lo dà un orecchio umano: sentito, in dubbio o **NOT IDENTIFIED IN YUE2** (YuE2 non lo conosce; serve un prompt più elaborato). Un clic copia il nome e chiede dove va: in fondo allo stile su una riga sua, o al suo posto; un nome che lo stile ha già è segnato nella tabella, e il testo della tabella si può selezionare e copiare.

**È YuE2 a decidere quando entra uno strumento.** Una riga di stile è una richiesta, non un ordine: per quanto insisti, il modello porta dentro uno strumento dove il suo addestramento dice che la canzone lo vuole, e il seme decide moltissimo. Lo stesso prompt ha dato un take con lo strumento e uno senza. Ascolta più semi prima di giudicare uno strumento.

**Si sente, ma non vero come uno dal vivo.** Molti strumenti suonano davvero, ma meno nitidi e meno veri di quelli reali: è ciò che YuE2 sa di loro. I verdetti dicono se YuE2 suona uno strumento oppure no, non quanto suona vero. Renderlo vero è il compito di una **LoRA di strumento**: qualche decina di sue registrazioni pulite, addestrate nell'Addestratore LoRA.

![Il prontuario degli strumenti](guide/instruments.png)

### Testo e profili del testo <!-- #lyrics-and-text-profiles -->

- Tag di sezione su righe a sé; YuE2 conosce `[Intro]`, `[Verse]`, `[Pre-Chorus]`, `[Chorus]`, `[Bridge]`, `[Interlude]`, `[Outro]`.
- **Profilo del testo**: incolla un testo intero, scegli un profilo, *Applica*: le sue regole (pulizia, fonetica) e la sua forma (`[Intro]`, `[Verse]` alle righe vuote, `[Interlude]` dopo i paragrafi lunghi) lo rendono pronto da leggere. *Annulla* riporta il testo indietro. I profili si creano nello Scrittore.

### Il contatore del testo e la mano fonetica <!-- #the-lyrics-meter-and-the-phonetic-hand -->

- **Il contatore** accanto al testo: ogni riga, le sue sillabe in una barra contro il righello del suo gruppo — strofa e ponte un gruppo, il pre-ritornello il suo, il ritornello il suo, ogni altra sezione la sua. Una pausa, un break, un silenzio, un interludio, un preludio o un passaggio strumentale dentro una sezione cantata non apre un gruppo: il suo nome sta accanto, tenue, e il righello della sezione prosegue. I tag non si contano mai: una riga di soli tag (`[Break] [Silence]`) non conta, un tag dentro una riga resta fuori dal conto. Il righello sta alla lunghezza abituale del gruppo; entro una sillaba la barra è verde, a due o tre ambra, oltre rossa. Ciò che è tra parentesi tonde è disegnato tratteggiato dopo la barra: YuE2 può cantarlo. Sotto la casella: caratteri, sillabe e righe del testo, i tag, le parentesi e la mano fonetica; il correttore del browser nella lingua del testo (lì si spegne); una casella allungata a mano tiene la sua altezza fino ad *Altezza automatica*.
- **Numeri di riga e segni**: il riquadro del testo numera le sue righe come un editor di codice (una riga che va a capo, una volta, sulla sua prima riga visiva; *Line numbers* sotto il riquadro li spegne). **Alt+K** segna la riga del cursore o toglie il segno, **Alt+J** va al segno successivo, **Alt+Shift+J** a quello prima, **Alt+Shift+K** li toglie tutti; il numero di una riga segnata è ambra, e i segni seguono le loro righe quando scrivi sopra. Ogni [tag] sta sotto un sottile strato ambra. Il testo dello Scrittore ha lo stesso. Come in mcedit: **Alt+O** toglie anch'esso i segni, **Alt+L** va a una riga per numero, **Ctrl+Y** cancella la riga, **Alt+↑** e **Alt+↓** spostano la riga (o le righe selezionate) col suo segno. *Keys* sotto il riquadro li elenca tutti, e l'etichetta LYRICS dello Scrittore li dice al passaggio del puntatore. **⤢** accanto a Lyrics solleva il riquadro sopra tutto, al 60 % della larghezza dello schermo e di quattro decimi più grande, con tutto questo e con i suoi −, + e ⟲ per la dimensione del testo (restano in questo browser); Esc lo rimette a posto.
- **Parentesi controllate**: una «[» non chiusa nella sua riga, una «]» senza aperta, una «[» dentro un tag e un tag vuoto colorano di rosso il numero della riga, e *Tags not closed or astray* sotto il riquadro va dall'una alla successiva; una parentesi tonda lasciata aperta o chiusa senza aperta è ambra (un'eco può continuare). Una «[» ancora in scrittura resta tranquilla finché il cursore non lascia la sua riga. **Genera chiede prima** quando un tag è rotto: ciò che segue una «[» non chiusa può perdersi nella canzone e la sua fine storcersi; *Go to the line* o *Generate as it is*.
- **Accenti fuori posto**: un segno non su una vocale — a inizio riga, dopo uno spazio o un segno, su una consonante, un secondo sulla stessa lettera, o un ´ staccato al suo posto — mostra un pulsante rosso sotto il riquadro (*Stress marks off a vowel*) e un segno davanti al conteggio della riga; il pulsante li seleziona uno alla volta. Una parola con due segni ne riceve uno ambra: voluto o una svista? Nel conteggio il segno d'accento non è una sillaba; ע e una vocale latina dentro una parola russa sì. Una sillaba è un suono vocalico, una nota, e ogni lingua si conta con le sue regole: in russo, ucraino e bielorusso una lettera vocale (e poiché il contatore misura il tempo di una riga, una parola senza vocale — с, в, к, з, й, ў — e un'occlusiva davanti a un'affricata dentro una parola — глу-п-цо́в — prendono un battito proprio, disegnato più chiaro: «Я же вижу глупцо́в с приду́рческим планом» sono 12 sillabe e 2 di questi battiti, 14); in greco αι, ει, οι, ου, αυ, ευ sono una (la dieresi o l'accento le separano: τσά-ι); in spagnolo e in italiano una i o u debole si unisce alla vicina (cie-lo, cuo-re), due forti sono due (po-e-ta), e non contano la i di ciao, giorno, figlio né la u di qu e gu; in inglese una e finale muta non conta (make, ma ta-ble); l'ebraico conta i suoi punti vocalici; cinese, giapponese e coreano un segno per sillaba. Le parole latine si contano come inglesi, spagnole o italiane: dal nome della lingua nello stile, altrimenti dalle parolette del testo stesso.
- **Ctrl+F** nel testo o nello stile (e nei riquadri dello Scrittore) cerca solo in quel riquadro: Invio e Maiusc+Invio scorrono le corrispondenze, Esc dal campo di ricerca riporta il cursore con la corrispondenza selezionata; dal riquadro stesso (se hai cliccato altrove) chiude la ricerca e lascia il cursore dov'è, e ciò che scrivi intanto non sposta la vista. Il segno d'accento non ostacola la ricerca, ё è е, e о e а trovano anche ע e le o e a latine.
- **Tag dopo «[»**: un «[» all'inizio di una riga del testo (del Creatore o dello Scrittore) apre i tag di sezione, come un editor di codice suggerisce le parole, nell'ordine in cui una canzone li attraversa, da Intro a End. Le lettere dopo il «[» restringono l'elenco (anche con la tastiera russa o ucraina), un numero numera il tag (`v2` è `[Verse 2]`), e se il testo numera le strofe si offre la successiva. ↑ ↓ scelgono, Invio o Tab mettono il tag su una riga sua (Ctrl+Z lo toglie), Esc o `]` chiudono l'elenco. Intro, Outro ed End già nel testo restano al loro posto, tenui, con la loro riga: ↑ ↓ ci arrivano e si legge che cosa sono, ma non si mettono due volte. Ctrl+Spazio apre l'elenco, e all'inizio di una riga scrive il «[» stesso. L'elenco sta in due colonne: i tag e, accanto, che cos'è quello in mano (con parole nostre, secondo la guida di Genius alle sezioni delle canzoni) e quante volte lo scrivono i 110 esempi ufficiali; il riquadro mantiene la sua misura mentre l'elenco si restringe. Le sezioni che nessuno di essi scrive sono segnate TEST.
- **La mano fonetica** (di Viktor, da SUNO; YuE2 la segue allo stesso modo):
  - **Un segno d'accento** (l'acuto combinante, U+0301) dopo una vocale: `обе́щано`, `сули́т`. Tiene in oltre il 95 % delle righe.
  - **Una vocale tonica maiuscola** spinge l'accento dove lo vuole la rima, contro il dizionario: `базилиО́`.
  - **ע (ayin) dentro una parola russa** si canta come una o/a morbida, come il parlato vivo dice la o atona: `кעмо́рка`, `пעле́но`, `Ка́рлע`. Frena anche il rap che accelera sempre di più.
  - **Una o latina dentro una parola russa** canta una o dura e aperta dove il modello direbbe a: `Кo дну`.
  - **Una vocale allungata** (`о-о-о`, `БУ… РА… ТИ… НО`) tiene una nota; dove la musica ha spazio per lei, non in ogni riga.
  - **[Interlude]** tra le parti fa una pausa nel rap e frena il parlato che accelera sempre di più (non sempre).
  - **Le parentesi tonde** possono essere cantate (così nelle prime prese di «Buratino»): eco, controcanto; anche una didascalia tra parentesi può suonare.
  - **Una parola ebraica con i suoi punti vocalici** (`רוּחַ`) il modello la dice meglio che in traslitterazione.

### VAE, slider e LoRA <!-- #vae-sliders-and-loras -->

- Il **VAE** trasforma la canzone scritta in suono: **Standard** (il suono migliore), **Precedente** (quello dei benchmark), **Miscela** (una miscela dei due, un componente aggiuntivo). Un take finito può aggiungere più tardi un'altra decodifica dalla sua pagina. Si sceglie nel menu **☰**, sotto il modello, per le canzoni a venire; un take si decodifica di nuovo con un altro dalla sua scheda in pochi secondi (da rc2 ogni take conserva i suoi latenti; uno fatto prima rigenera il suo suono).
- **Slider**: modellatori di genere e di voce applicati mentre la musica viene scritta; 0 è spento, 1 è pieno.
- **LoRA**: adattatori per la metà musicale, quella sonora o entrambe, ognuno con la sua forza.

**La curva di uno slider.** Uno slider spinge con la sua forza dal primo secondo all'ultimo: piatta. La piccola immagine accanto alla sua forza apre la sua curva: **Arco** la fa salire alla forza piena a metà canzone e calare dolcemente ai due estremi; **Disegna** la modella a mano: trascina un punto in alto per un lampo, in basso per una dissolvenza, lungo la canzone per spostarlo; doppio clic aggiunge un punto, doppio clic su un punto lo toglie. La forza che imposti è la cima della curva. La curva percorre la musica mentre viene scritta, dal primo fotogramma alla fine della durata della canzone, ed entra nella richiesta del take, così un take rifatto percorre la stessa curva.

![LoRA: ogni forza su una strada dal verde al rosso, e la metà musicale nell'insieme](guide/loras.png)

Ogni forza sta su una **strada**: il verde è sicuro, il giallo è il suo limite, il rosso è oltre. I limiti sono misurati:

- un adattatore di partitura (uno che pianifica l'ABC) fino a 1.0 nel verde; ogni altra metà musicale fino a 0.5 nel verde, 0.75 al massimo; gli adattatori addestrati in questo studio sono più severi sulla metà musicale (0.5 nel verde, 0.6 di limite);
- la metà sonora fino a 1.0 nel verde, 1.5 di limite;
- **Musica, nell'insieme**: gli adattatori impilati si sommano. Ognuno può stare nel proprio verde e la somma rompere comunque la partitura. Misurato su take reali: integra fino a **2.25** nell'insieme, rotta da **2.5**. La barra sotto gli adattatori mostra la somma sulla stessa strada.

**Doppio clic** su un numero per scrivere una forza esatta. Le indicazioni sotto il blocco dicono ciò che conta: una parola trigger che manca nello stile, un adattatore addestrato in un'altra modalità di pianificazione, una forza oltre il suo limite. Mentre il puntatore sta su un cursore o lo trascina, la forza esatta compare sopra il puntatore, nel colore della sua strada. L'adattatore Instrumental si ferma a 1.0, da dove parte: più su le sue partiture deragliano.

> **Un adattatore di partitura strumentale con parole da cantare.** Un adattatore del genere pianifica partiture *senza linea vocale*. A 1.00 ha dato un take con una sola nota in 127 battute vocali: il cantante parlava sopra due battute in loop. Con un testo, tienilo basso, da 0.3 a 0.5. Il ⚠ accanto al nome LoRA lo segnala quando succede.

### Profili e modalità di pianificazione <!-- #profiles-and-planning-modes -->

- **Profilo** imposta in un colpo la modalità, la durata, il campionamento, la guida, i passi, il VAE, gli slider, le LoRA e l'uscita; i testi e i semi restano. *Salva profilo…* conserva le manopole attuali con un nome.
- **Modalità di pianificazione**:
  - **Piano completo**, quella predefinita: prima si scrivono melodia e accordi (una partitura modificabile), poi la canzone. La scelta migliore per canzoni nuove.
  - **Solo melodia**: un piano della melodia, accompagnamento libero. Consigliato per le cover.
  - **Diretto**: direttamente dal testo e dallo stile, senza partitura. Gli adattatori addestrati senza partitura vanno qui.
  - **Strumentale**: senza voci, la ricetta ufficiale di YuE2. Sta a destra nella riga della modalità di pianificazione.
- **Piano completo o Diretto.** La parola di Viktor dopo una settimana di canzoni: Diretto è il colpo o la cilecca di SUNO (circa due take buoni su cento, secondo il suo conto); Piano completo è la strada per tutti, anche senza leggere una nota di ABC: i tag sono rispettati, il suono si assesta, la dizione regge e il tempo si può prevedere. Misurato sul suo rap, quattordici take per modo con Whisper in ascolto: il miglior take di tutti è stato uno in Piano completo con la sua ricetta conservativa (l'84 % delle parole sentite, il 76 % nell'ultimo quarto). Dove Piano completo cede, cede alla fine: un take dura quanto la sua partitura, e il piano può avere meno sezioni del testo (allora gli ultimi versi restano fuori, o se ne ricanta uno precedente); dopo le ultime parole suonano le battute che avanzano nella partitura, e quelli sono i 10–15 s dopo la giusta dissolvenza di una canzone, non la guida (CFG). Ascolta la fine di un take in Piano completo: *End at…* taglia una coda, *Rigenera da…* riscrive una fine persa.

### Cover, remix e la tua partitura <!-- #covers-remixes-and-your-own-score -->

- **Cover o remix**: prendi la melodia di una registrazione (*Trascrivi*: solo la sua melodia, non le parole né il cantante), o la melodia di uno dei tuoi take, e dalle un nuovo stile.
- **La tua partitura**: una partitura ABC, seguita in Piano completo e in Solo melodia. Trasponila (alla più vicina, in su o in giù), sposta una voce per gradi della scala, importa un file MIDI (una linea melodica per voce), esporta MIDI o marcatori per una DAW, carica un esempio, rendila strumentale.
- **Recitare il testo su una partitura** (*Lay the lyrics on this score…*, sotto la partitura quando si legge): il narratore del promo dello studio, per le tue parole. Ogni riga va sulle battute della partitura, una sillaba un ottavo su un suono dell'accordo della sua battuta, un respiro dopo una virgola e un punto, l'ultima sillaba della riga un quarto più in basso; ogni sezione comincia su una frase di due battute dopo una battuta di pausa, o dopo un vocalizzo se lo spunti. Strumenti, accordi, tonalità e tempo restano; le sezioni della partitura seguono i tuoi tag, con un intro e un outro intorno. Per spoken word, letture e rap su una base: fai la base, *Scrivila dal suono*, poi questo; chiede prima, e Ctrl+Z in ogni casella riporta il testo di prima.

### Campionamento e riduzione del rumore <!-- #sampling-and-denoising -->

![Campionamento: il pianificatore della partitura e i token musicali, i limiti dei token bloccati](guide/sampling.png)

I valori predefiniti sono già tarati. Le tre righe di **forma** (Composizione, Interpretazione, Influenza dello stile) muovono le manopole insieme, in cinque passi; le manopole vere e proprie sono più sotto.

- **Pianificatore della partitura** e **Token musicali**: temperatura, top-p, top-k, penalità di ripetizione, finestra della penalità.
- **Token minimi** e **Token massimi** sono **bloccati** contro una modifica involontaria: fai clic sul 🔒 accanto al nome per cambiarli, e di nuovo per bloccarli. I minimi sono fusibili: una partitura non può finire prima di 200 token, la musica non prima di 750 (30 secondi; una durata richiesta più breve lo abbassa a quella durata). Il massimo della musica appare come **Durata massima**, in tempo (25 token al secondo), senza lucchetto: è al più la durata della canzone, e si imposta solo qui («Suono e uscita» non ha un campo per la durata).
- Ogni manopola è tenuta entro limiti sensati; un valore oltre viene riportato indietro, e la pagina lo dice.
- **Guida (CFG)**: 1.6 per impostazione predefinita in ogni modalità.
- **Suono e uscita**, la sezione inferiore dello stesso blocco: **Passi di riduzione del rumore** e **Risolutore** per la metà sonora, **Formato** (WAV a 24 bit, 16 bit, 32 bit in virgola mobile o MP3 con il suo bitrate) e **Taglio dei picchi**; *Ripristina l'uscita* li riporta.

**Una ricetta prudente per il russo** (di Viktor, a orecchio): Composition *low*, Performance *low*, Style influence *high*: il pianificatore della partitura a temperatura 0.85, top-p 0.92, top-k 40, i token musicali a 0.85, 0.93, 80, le penalità di ripetizione 1.005 e 1.3 su una finestra di 100, guida (CFG) 1.8; 32 passi di riduzione del rumore con Midpoint. Nessuna accelerazione, rap a un ritmo moderato. È il profilo integrato *Russian · conservative (Viktor's)*.

### Crea la partitura ABC, e Genera <!-- #create-abc-score-and-generate -->

- **Crea la partitura ABC** scrive la partitura e si ferma: leggila, modificala, e allora *Genera* rende esattamente quella partitura. Una partitura già presente nel campo viene sostituita, dopo una domanda.
- **Prove** e **Variazioni**, accanto a Genera: Prove è quante prove, in ognuna la musica viene scritta da capo, ognuna con il proprio seed musicale (seed, seed + 1…); il motore ne scrive insieme quante il suo batch consente, le altre nei passaggi successivi. Variazioni è quante volte viene reso il suono di ogni prova dalla sua unica musica, ognuna con il proprio seed sonoro, lo stesso per ogni prova: ognuna costa all'incirca il tempo di un suono, quasi nulla di memoria. Prove × Variazioni è quanti take escono: 2 × 4 = 8.
- **Genera canzone** fa tutto. L'esecuzione mostra le sue fasi man mano.

### Babele nella partitura <!-- #babel-in-the-score -->

![Il motore ha fermato un'esecuzione la cui partitura non era una partitura](guide/babel.png)

Quando la metà musicale scrive spazzatura al posto di una partitura (gli adattatori spinti oltre i loro limiti fanno questo: niente tonalità, niente metro, due punti a raffica), **il motore ferma l'esecuzione prima di farci sopra qualsiasi musica**, in secondi invece che in minuti. La finestra dice perché, quali adattatori hanno pesato sulla metà musicale e di quanto oltre i loro limiti, mostra ciò che è stato scritto e può riportare le forze musicali nel verde con un clic.

### Il take <!-- #the-take -->

![Un take: scaricare, rifare, post-produzione, file](guide/take-head.png)

- **L'intestazione**: ▶ e i pulsanti del take nella prima riga (👍 👎 ☆, il Bibliotecario, rinomina, elimina), e in fondo ⇆ e ⤡, che sollevano una cornice sopra la stanza; sotto, il titolo su una riga; più sotto, come è stato fatto.
- **Scarica**: WAV, FLAC (gli stessi campioni, circa tre quarti della dimensione), MP3 al bitrate che scegli.
- **Rifai**: *Nuovo take* (un take nuovo dalla stessa richiesta), *Usa come base* (la richiesta di nuovo nel modulo), *Rifai il suono* (la stessa musica, suono nuovo), *Rigenera da…* (tieni l'inizio, riscrivi il resto), *Trascrivi questo take*, *Taglia al testo* (taglia una coda dopo l'ultima riga cantata), *End at…* (il take finisce nel momento che scegli, con gli ultimi 2 s in dissolvenza; dai suoi latenti conservati, in pochi secondi).
- **Rifinitore**: *Spettro*, *Verifica del testo*. **File**: la richiesta e la partitura.
- **Nota**: cosa funziona, cosa sistemare, dove va.
- La scheda sotto dice come è stato fatto: modalità, formato, VAE, modello, passi, la forma, gli slider, le LoRA con le loro forze, entrambi i semi (copiali per ripeterlo).
- **Sopra la stanza** (⤡) il take sta in due colonne: cosa farne, il suo stile e il suo testo a sinistra; come è stato fatto, il suo VAE e la sua partitura a destra. Un take nuovo si apre con Style e Lyrics chiusi; gli strumenti stanno in gruppi incorniciati.

![Come è stato fatto un take](guide/take-info.png)

### La partitura <!-- #the-score -->

Il piano del take come pentagramma o come ABC: stampalo in PDF (US Letter, verticale o orizzontale), esporta MIDI o marcatori, *Modifica e rifai*, o aprilo a schermo intero.

## Scrittore <!-- #writer -->

### Le canzoni come documenti <!-- #songs-as-documents -->

![Lo Scrittore](guide/studio-writer.png)

Ogni canzone può vivere nello Scrittore come un documento: il suo **stile**, il suo **testo**, le sue **note** (Markdown, con anteprima) e i suoi **parametri** (ogni manopola del modulo del Creatore). *Nuovo*, *Dal Creatore* (il modulo così com'è), *Carica nel Creatore*.

- **Versioni**: *Conserva questa versione* in qualsiasi momento; *Ripristina questa versione* o prendila *Come nuovo documento*.
- **Take nati da questo**: ogni take la cui richiesta è venuta da questo documento.
- **La canzone ora**: titolo, stile, la tonalità, il metro e il tempo della partitura (lo stile deve concordare con essi), il testo; *Modifica nel Creatore*.
- **Esporta tutto** (il dischetto, *Export all*) e **Importa** (la cartella, *Import*): tutto il quaderno in un file per un backup — ogni documento con le sue versioni, i take nati da esso e il cestino; l'importazione porta ciò che manca, lascia ciò che è uguale e mette un documento che differisce accanto al suo omonimo come copia: niente viene sovrascritto.

### Profili del testo <!-- #text-profiles -->

Come un testo incollato diventa pronto da leggere: regole di sostituzione in ordine (letterali o espressioni regolari), poi la forma (`[Intro]`, `[Verse]` alle righe vuote, `[Interlude]` dopo i paragrafi lunghi). *+ Regola*, poi **Provalo dal testo** mostra cosa ne esce prima di salvare.

### La stanza di scrittura <!-- #the-writing-room -->

![La stanza di scrittura: un modello di chat abbozza, tu decidi](guide/writer-room.png)

Un modello di chat legge il tuo stile, il tuo testo e la tua partitura, poi li abbozza o li rivede. **Nulla cambia finché non lo applichi.**

- **Di cosa parla la canzone?** o cosa cambiare; **Aiutami con** lo stile, il testo o entrambi; **Struttura**: l'ordine delle sezioni per un testo nuovo.
- Il modello: un server di chat locale (vLLM, LM Studio, Ollama: qualunque cosa con un endpoint di chat `/v1`, impostato nel Motore) o qualsiasi modello di OpenRouter con la sua chiave API. Il suo campo suggerisce tutta la lista di OpenRouter mentre scrivi, ogni modello con il suo prezzo per milione di token in entrata e in uscita e il suo contesto; il prezzo di quello scelto sta sotto il campo, e un nome che la lista non conosce viene segnalato.
- *Crea una bozza*, poi **Applica la bozza**, **Usa il testo** o **Usa lo stile**; *Annulla* torna indietro.

## Rifinitore <!-- #refiner -->

### Dopo il render <!-- #after-the-render -->

![Il Rifinitore: il take a destra, i passi in fila](guide/studio-post.png)

Scegli un take a destra; gli strumenti lavorano su di esso, o su un suo stem. La colonna a destra tiene **i take rifiniti qui**, la rifinitura più recente per prima (*Rifiniti* accanto a *Preferiti* la passa a tutti i take, per cominciarne uno nuovo), e dopo un ricaricamento la stanza torna al take che stava rifinendo.

Tutto ciò che nasce da un take pende dal suo **albero** (*Nato da questo take*), il più nuovo in cima: prima **l'originale**, con il suo lettore e il suo FLAC, poi ogni ramo, riproducibile e utilizzabile come sorgente del passo successivo. Ciò che gira si vede dove guardi: nella testata della stanza, in cima al blocco del passo stesso e come un punto che pulsa sulla sua scheda. Il blocco di ogni passo elenca ciò che ha fatto per il take (*Creato qui*: un clic lo trova nell'albero), e il passo aperto illumina i propri rami.

**Confronta tutte** (sulla riga dell'originale, o *Confronta* su qualsiasi ramo) apre ogni versione in un solo lettore, come SUNO passa da una versione all'altra: l'originale, quello passato dall'antironzio, i remaster, gli upscale, gli stem. Un clic su un'altra versione, o il suo numero (1–9), la riproduce **dallo stesso secondo**; la barra spaziatrice riproduce e mette in pausa, ← → spostano di cinque secondi, Esc chiude.

### Importa una traccia <!-- #import-a-track -->

WAV, FLAC, MP3… da ovunque: diventa un take della libreria (48 kHz, 24 bit), segnato come *importato*, pronto per stem, remaster e il resto. Il testo è facoltativo; la verifica del testo confronta con esso.

### I passi e la catena <!-- #the-steps-and-the-chain -->

![La catena e i passi](guide/post-steps.png)

La **catena** esegue più passi in un colpo: *Antironzio → Upscale → Stem → Remaster → Upscale*, poi uno qualsiasi tra *Artefatti*, *Spettro*, *Testo*. Gli stem si separano dal take dopo l'Antironzio (e l'Upscale) e il remaster li mixa, così il suo preset e il de-esser agiscono anche nella catena; il primo upscale fa sentire ai separatori l'intera canzone, l'ultimo ridisegna la parte alta che lasciano gli stem e il remaster (un fruscio sopra i 20 kHz, quasi nulla sopra i 22). Gli stem sono quattro, se non scegli altrimenti. Uno per uno:

1. **Spettro**: spettrogramma, spettro medio, energia per bande; sovrapponi un altro take per confrontare.
2. **Artefatti**: un tono che non se ne va, il ronzio a 25 frame del VAE negli acuti, clic, clipping, buchi, uno stereo che si fa la guerra da solo. Un clic su un tempo riproduce da lì.
3. **Antironzio**: il decoder di YuE2 scrive il suono in frame di 1920 campioni, 25 al secondo, e i suoi acuti tremano con essi. Questo passo toglie la parte legata a quell'orologio dei frame sopra i 2 kHz. 80 % è la scelta dell'orecchio; 100 % assottiglia l'attacco.
4. **Testo**: Whisper ascolta e confronta ciò che sente con il tuo testo, minuto per minuto; *Sincronizza le righe* per i tempi del karaoke. Sullo stem vocale sente le parole senza la musica.
5. **Stem**: quattro stem (BS-Roformer per la voce, poi htdemucs_ft per batteria, basso e il resto; anche lo strumentale), o voce + strumentale. *Sorgente* è il take o un suo file dopo l'Antironzio o l'Upscale, ogni sorgente con il suo set; nella tua DAW va il set più recente di ogni tipo.
6. **Remaster**: mixa gli stem o usa il take così com'è; pulizia, de-esser, a scelta riaccordatura 440 → 432 Hz, loudness (LUFS) e true peak. Ogni passata è un nuovo ramo. Il preset e il de-esser agiscono sugli stem prima del mix: con il take o un qualsiasi file singolo come sorgente sono spenti, e nella catena agiscono quando essa separa gli stem.
7. **Upscale**: UniverSR ridisegna la parte alta dello spettro; l'originale resta campione per campione sotto il taglio. Su un remaster (l'ultimo passo della catena) l'intero file si abbassa se la nuova parte alta supera il tetto di true peak del remaster.

## Artista <!-- #artist -->

*Un'anteprima: quello che c'è qui funziona, e il resto della stanza arriva nelle prossime versioni.*

### Immagini per le tue canzoni <!-- #pictures-for-your-songs -->

Scrivi a frasi quello che vedi per la canzone: Krea 2 Muse legge il prompt come una descrizione, non come un elenco di tag. Prima ciò che c'è nell'immagine, poi la luce, i colori e la tecnica (olio, inchiostro, una fotografia), e alla fine *no text* quando non vuoi lettere. **From the take** mette il prompt da cui è stata dipinta la copertina del take che hai in mano, o uno fatto del suo titolo e del suo stile, per avere da dove cominciare.

**Forme**: **1:1** (1280 × 1280) per la copertina, **16:9** (1920 × 1080) per un video, **9:16** (1080 × 1920) per uno short. Le forme di una pressione condividono il seme, perciò escono come una serie: la stessa scena con gli stessi colori, ciascuna composta per la sua cornice e non un'unica immagine tagliata tre volte. **Variations** dipinge anche i semi successivi (il seme, il seme + 1, …), ciascuno in tutte le forme. **Seed**: vuoto per uno nuovo ogni volta; il seme di un'immagine che ti è piaciuta la ridipinge (ogni giro mostra il suo seme, e **To the form** lo riporta con il prompt).

**Painter**: Krea 2 Muse di Stable Yogi, **Q4** su una scheda con 12,5 GB liberi, **Q8** (più fine) con 18,5 GB. Un'immagine richiede circa 35 s in 1:1 e 47 s in 16:9 o 9:16 su una RTX 3090, più circa 25 s per caricare il pittore a ogni pressione. Una pressione aspetta nella coda del laboratorio una scheda con spazio, come le copertine e gli stem; mentre aspetta, **Off the queue** la ritira. Ogni immagine passa dal filtro dei contenuti che la licenza del pittore richiede: quella che segnala non viene tenuta, e il giro lo dice.

**Live preview** (attivo per impostazione predefinita): il posto dell'immagine che si sta dipingendo mostra ogni suo passo, dal rumore all'immagine, a un ottavo della grandezza e senza il decodificatore, quindi non costa nulla; spento, il posto aspetta l'immagine finita.

### Una copertina per il take <!-- #a-cover-for-the-take -->

Un clic su un'immagine la apre sopra la pagina nella sua forma (← → scorrono il giro, Esc chiude), con **Download** (PNG, a grandezza piena). Un'immagine quadrata ha **Set as cover**: diventa la copertina del take che hai in mano (sceglilo a destra), nella sua scheda, nel player e nel suo MP3. La copertina che aveva resta accanto al take (`artwork-removed/`), come la tiene un ridisegno, e l'altra lettera di una coppia A/B riceve anche la nuova quando non ne ha una sua.

I giri restano nella cartella `artist/` dello studio, i più nuovi in alto. **Again** ridipinge un giro da un seme nuovo; **Trash** lo sposta in `trash/artist/`, da dove torna se riporti la sua cartella in `artist/`.

**Runs o Gallery**: i giri mostrano ogni pressione di Draw con il suo prompt e il suo seme; la galleria mostra tutte le immagini di tutti i giri in un'unica griglia, le più nuove per prime, per forma (1:1, 16:9, 9:16) o con la stella (☆ su un'immagine le mette la stella), in tre grandezze. Un'immagine aperta dalla galleria scorre tutta la galleria, con ★, To the form (il suo prompt, il seme e la forma), Set as cover e Download.

### Cosa arriva all'Artista <!-- #coming-to-the-artist -->

Un'immagine di riferimento da cui partire; ridipingere una parte di un'immagine ed estenderla oltre i bordi, su una tela; più adattatori LoRA insieme; un upscale; Qwen Image come secondo pittore; il titolo e l'artista scritti sulla copertina.

## Bibliotecario <!-- #librarian -->

### Tutti i take <!-- #every-take -->

![Il Bibliotecario](guide/studio-collection.png)

- **L'intestazione** nomina la raccolta aperta (*Bibliotecario › Fosforida*) e ciò che contiene: take, ore, mi piace, preferiti, note, come sono stati fatti.
- **Spazi** a sinistra: Tutti, Preferiti, Senza spazio, i tuoi spazi, *+ Nuovo spazio*; Nascosti e il Cestino, in *Lontano dagli occhi*. Clic destro su uno spazio per i suoi **blocchi** (*Blocca l'eliminazione dello spazio*, *Blocca l'eliminazione dei take*): un 🔒 accanto al suo nome, e niente di ciò che contiene va nel cestino. Gli spazi 💎 (i set pubblici dello studio) stanno in fondo all'albero, per nome, e gli 💎 … LoRA più in basso di tutti.
- **Cerca** con parole, `*` e `?`; **ordina** per più nuovi, più vecchi, per titolo, più lunghi; **Riquadri** o **Elenco**: tutti e tre nella riga dell'intestazione, accanto ai conteggi.
- **Una scheda** porta la copertina del suo take nell'angolo in alto a destra, accanto al titolo, quando ce l'ha (*Disegna la copertina* nel menu del take); un clic mostra l'immagine intera sopra lo studio, dove ‹ › e i tasti freccia scorrono le immagini delle schede mostrate, ▶ riproduce il suo take ed Esc chiude. La scheda che suona brilla dei picchi della canzone stessa.
- **Take freschi**: un take che non hai ancora riprodotto porta una leggera linea tratteggiata; il suo primo ascolto la toglie. Un take rigenerato porta un'etichetta *regen* e conserva la sua nota, il suo mi piace e la sua stella.
- **La colonna degli spazi**: trascinane il bordo per allargarla o restringerla; « la richiude, e le schede si allargano: le colonne restano le stesse, e l'occhio non perde il segno.
- **Sezioni**: uno spazio può avere sezioni, al massimo due livelli di profondità (⋯ accanto al suo nome → *Nuova sezione…*), per ordinare ciò che contiene senza un nuovo spazio ogni volta. Uno spazio mostra anche i take delle sue sezioni. Tutto ciò da cui il Rifinitore ricava qualcosa va da solo nella sezione *Rifiniti* dei suoi spazi.
- **Trascina una scheda su uno spazio** a sinistra per spostarla lì (tutte le selezionate, quando è selezionata); tieni premuto **Ctrl** per aggiungerla lì e lasciarla anche qui. Lo studio chiede prima, e Ctrl+Z la riporta indietro.
- **Take fissati**: fino a quattro in ogni spazio, in una striscia del loro tono sopra le schede (clic destro su un take → *Fissa qui*; × lo sgancia). Quando selezioni dei take, la barra dei selezionati prende il posto della striscia, così le schede non si spostano mai. Quella barra è una fila di icone incorniciate: la scelta, i segni, gli spazi, l'esportazione e il cestino in fondo; ognuna si dice al passaggio del puntatore.
- **Filtro** (il pulsante in fondo alla riga di ricerca) apre una finestra come la scelta dello spazio: spunta cosa cercare in tre gruppi (come è stato fatto: generato, importato, rigenerato, ri-renderizzato; segnato: mi piace, non mi piace, preferiti, con una nota, con copertina; cosa ha: stem, antironzio, remaster, upscale), ognuno con quanti take del posto, e come si uniscono gli spuntati: tutti (AND), uno qualsiasi (OR) o nessuno (NOR). *Show* li applica; il pulsante poi dice quanti sono attivi e come si uniscono.
- **Seleziona** più take, come in un file manager: selezionane uno, e da lì un clic in qualunque punto di un'altra scheda la seleziona a sua volta (Shift: tutto l'intervallo). Un trascinamento nello spazio vuoto tra le schede disegna una banda che seleziona ciò che tocca; **Ctrl+trascinamento** la disegna da qualunque punto e conserva ciò che era già selezionato. La barra dei selezionati galleggia sopra il lettore: preferito, aggiungi a uno spazio, sposta in uno spazio, togli da questo, nascondi, esporta uno ZIP, nel cestino.
- **Il cestino** restituisce, o cancella per sempre dopo la tua conferma.

### Il menu di un take <!-- #a-take-s-menu -->

![Clic destro su un take](guide/collection-menu.png)

**Rigenera con un nuovo seme** (sopra lo Scrittore nel menu del take): il take rifatto con tutto ciò con cui era stato fatto, ma con semi nuovi; il nuovo eredita gli spazi e la nota del vecchio, e il vecchio aspetta nella sezione *Sorgente della rigenerazione* del suo spazio (il suo spazio non lo mostra tra i propri) finché non la svuoti; il nuovo conserva la sua nota, il suo mi piace, la sua stella e la sua immagine. Una prova esce con i suoi due minuti interi. Riproduci, apri nel Creatore o nel Rifinitore, il foglio (la sua partitura), la scheda tecnica (tutto ciò con cui è stato fatto: lo stile e il testo, la partitura disegnata, ogni manopola, le LoRA e gli slider con le loro forze; un take in modalità Diretto non ha partitura, e *Scrivila dal suono* ne chiede una al trascrittore), mi piace, non mi piace, preferito, una nota, rinomina, **spazi** (un take può stare in più spazi), **sposta in** uno spazio (su una scheda selezionata: ogni take selezionato, fuori dallo spazio aperto), nascondi, manda allo Scrittore, copia, scarica, **esporta in una DAW** (progetto REAPER o DAWproject, su qualsiasi take: con i suoi stem una volta che il Rifinitore li ha separati), nel cestino. **Su una scheda selezionata, con altre selezionate**, il menu agisce su tutte, e la sua testata dice su quante: mi piace, non mi piace, preferito, copertina, togliere la copertina, spazi, nascondi, uno ZIP; le copertine di più take e la rigenerazione di più take chiedono prima, perché costano minuti di una scheda video.

**Disegna la copertina**: un piccolo modello linguistico (Qwen3-4B) legge lo stile e le parole del take e scrive un prompt per un'immagine; Krea 2 Muse la dipinge, a 1024 px, in circa mezzo minuto su una scheda da 16 GB (su una scheda più piccola un SDXL, CyberRealistic XL; il pittore si sceglie in *Motore → Copertina*). Si vede nel lettore, sulla scheda, nel pannello multimediale del desktop e dentro l'MP3 che scarichi (come sua copertina). Quando un take ha la sua immagine, il menu dice *Apri la copertina* (sopra la pagina, come un clic sull'immagine della scheda o sul quadrato del lettore) e *Ridisegna la copertina* (un nuovo prompt e una nuova immagine; la vecchia resta accanto al take, in `artwork-removed/`). I due modelli arrivano con `heresy/fetch-heresy.sh --artwork` (14 GB, chiede prima).

### Gli strumenti sotto lo stile <!-- #the-instruments-under-the-style -->

Sotto il campo Stile, lo studio nomina ciò che il tuo prompt chiede: un chip per ogni strumento e stile del prontuario che trova, colorato secondo ciò che ha trovato l'orecchio (verde sentito, ambra in dubbio, rosso non suonato con quel nome) e con l'immagine dello strumento. Posa il puntatore su uno per la sua scheda: l'immagine, la sua terra, come suona, ▶ A e ▶ B con i loro semi. Un clic mostra l'immagine intera. **Alt+I** apre il prontuario da qualunque punto.

### Copertine: cosa le disegna, cosa non sa fare, un altro pittore <!-- #artwork-what-draws-it-what-it-cannot-another-painter -->

**Cosa le disegna.** Un piccolo modello linguistico (Qwen3-4B) legge lo stile e le parole del take e scrive un prompt per un'immagine, il soggetto per primo; Krea 2 Muse la dipinge (1024 px), o un SDXL dove Krea non ci sta (*Motore → Copertina*). Quando il take porta il nome di uno strumento (la prova di uno strumento), lo studio dice a entrambi com'è fatto lo strumento e di dove è, e Omni (il modello dell'ascoltatore) guarda l'immagine: quando non trova lo strumento, riscrive il prompt da ciò che ha visto, e il pittore ci riprova, al massimo tre immagini. Circa mezzo minuto per immagine su una scheda da 16 GB.

**Cosa non sa fare** (un'avvertenza, detta senza giri di parole): il pittore disegna ciò che conosce. Uno strumento che non ha mai visto per nome (il duduk, il morin khuur, il khomus, le campane tibetane di cristallo…) esce come un'ipotesi: un flauto di legno, un violino, ciotole da cucina. Dove Omni non ha trovato lo strumento in nessuna delle tre immagini, l'immagine è segnata **≈ un'ipotesi**, nella vista sovrapposta e nel prontuario degli strumenti. Una copertina è l'umore del take, non un'immagine di riferimento di uno strumento: per sapere com'è fatto uno strumento, cercalo.

**Consiglio da pro: un altro pittore.** Quando il pittore è un SDXL (scelto in *Motore → Copertina* o su una scheda sotto i 16 GB), è l'SDXL a cui punta il link `artwork/SDXL-Artwork-Model`; il nostro è `CyberRealistic-XL-v10`. Metti accanto un altro finetune di SDXL, come cartella diffusers o come un unico file `.safetensors` (come li dà Civitai), e punta il link su di esso, in relativo:

```bash
cd artwork && ln -sfn MyFavourite-XL.safetensors SDXL-Artwork-Model
```

e per tornare: `ln -sfn CyberRealistic-XL-v10 SDXL-Artwork-Model`. L'immagine successiva lo usa già, senza riavvio. **Funzionano solo i finetune di SDXL**: SD 1.5, SD 3, FLUX e le altre famiglie vengono rifiutati, e lo studio dice cosa ha trovato al loro posto. Un finetune Turbo, Lightning, Hyper o LCM vuole pochi passi e poca guida: quando il suo nome lo dice, lo studio lo fa dipingere con 8 passi, guida 2 ed Euler ancestral. Per qualunque pittore, un file accanto al link fissa i suoi numeri: `artwork/SDXL-Artwork-Model.json` con `{"steps": 6, "cfg": 1.5, "sampler": "euler_a"}` (o `"dpmpp"`, quello dello studio).

## Addestratore LoRA <!-- #lora -->

### Cosa insegna una LoRA a YuE2 <!-- #what-a-lora-teaches-yue2 -->

Una LoRA è un piccolo adattatore sopra entrambe le metà. **Lo stile viene soprattutto dalla metà sonora; il seguire il testo, dalla metà musicale**, e la metà musicale impara a memoria i set piccoli in fretta (la sua loss scende verso 0). Tipi:

| tipo | dati | cosa impara |
|---|---|---|
| **Stile** | 20+ canzoni di uno stesso suono | genere, produzione, il suono di una band |
| **Voce** | una sola voce, cantata o parlata: canto (idealmente a cappella), letture, audiolibri | un timbro |
| **Lingua** | molte voci, testi esatti | la dizione di una lingua |
| **Artista** | un catalogo grande e vario | tutto quanto |

**Un adattatore di voce impara da qualsiasi forma della voce**, non solo dal canto: vanno bene anche letture e audiolibri. Misurato qui (05.10.2026): un adattatore addestrato sulle letture di un attore parlava con la sua voce e, cantando, cantava con il suo colore. Chiama un adattatore così per il tipo di voce (basso, baritenore, contralto…), mai per una persona: `lab/voice_kind.py` misura la voce di un set dall'altezza del parlato.

![L'Addestratore LoRA: la telemetria di un'esecuzione](guide/studio-train.png)

### 1 Materiale <!-- #1-material -->

Metti una cartella di canzoni in `datasets/raw/` e sceglila. Scegli quali tracce entrano, dai a ciascuna il suo testo (trovato accanto per nome quando c'è) e, se le serve, uno stile tutto suo. Le tracce sotto i 30 secondi restano fuori per impostazione predefinita; quelle lunghe vanno bene (la metà musicale si addestra sull'intera canzone).

**Voce**: *Measure the voice* ascolta fino a dodici tracce della cartella e dice, sul parlato, se la voce è maschile o femminile e il suo registro (basso, baritono, baritenore, tenore; contralto, mezzo, soprano), con l'altezza del parlato, e propone per il set un nome fatto di questo, come sono chiamati gli adattatori di voce pubblicati (`voice-ru-m-baritenor-117`): nessun nome di persona. Sul canto dà l'estensione cantata e lascia la voce al tuo orecchio. Dove l'altezza da sola non decide (140–175 Hz parlando), di' ♂ o ♀ e misura di nuovo. È una bozza da misura: decide l'orecchio, e la voce con cui poi canta YuE2 può stare più in alto o più in basso.

### 2 Il set <!-- #2-the-set -->

Una **parola trigger** (una parola insolita, per es. `fosforida`) chiama poi lo stile per nome; la **riga di stile comune** dice cosa si sente. *Crea il set* scrive `datasets/prepared/NAME/`: audio a 48 kHz e una didascalia per traccia.

L'**ascoltatore** (Qwen2.5-Omni, su qualsiasi scheda con circa 8 GB liberi) ascolta ogni traccia e ne abbozza i tag; tu li correggi e premi *Scrivi nelle didascalie*. È una bozza a qualunque dimensione: leggila.

### 3 Addestra <!-- #3-train -->

![Un tipo, le manopole, una scheda](guide/train-knobs.png)

- **Tipo** preimposta le manopole (rango, passi, quanto impara la metà musicale).
- **Addestratore**: **Ruach Studio** (quello dello studio, sui pesi bf16 non quantizzati; si costruisce da sé la cache latente del set) o **AI-Toolkit** di Ostris (il riferimento; sa addestrare anche con una partitura). Entrambi salvano lo stesso formato LoRA; sullo stesso set le loro curve coincidono epoca per epoca.
- **Pesi di base**: bf16 (schede da 24 GB) o int8 (schede più piccole, un po' meno esatto).
- **Passi**, **Salva ogni** N epoche (ogni epoca viene conservata), **Rango**, **Learning rate**, **Peso AR** (quanto impara la metà musicale; 0 = solo il suono), **Ancora AR** (la tiene vicina al modello di base), **Velocità AR**.
- Sotto il pulsante: la VRAM misurata delle esecuzioni precedenti, e quale scheda è abbastanza libera ora.

### Il rango e le altre manopole <!-- #rank-and-the-other-knobs -->

Il **rango** è quanto è ampio il cambiamento dell'adattatore su ogni matrice. Una LoRA adatta 224 matrici di YuE2, 112 per metà; ognuna è larga 2048, profonda 28 strati: 1,41 miliardi di pesi per metà. Quanto costa un rango, misurato su queste forme:

| rango | dei pesi che adatta | file, per metà (bf16) |
|---|---|---|
| 16 | 1 % | 29 MB |
| 32 | 2 % | 59 MB |
| 64 | 4 % | 117 MB |
| 128 | 8 % | 235 MB |
| 256 | 17 % | 470 MB |

- **Una voce, uno strumento, un suono** (da 20 a 50 canzoni): **16**, al massimo 32.
- **Uno stile o un artista** (un catalogo vario): **32**.
- **Un set grande di molte voci** (ore di registrazioni, un tag per ogni voce): **64**, e **128 al massimo**, solo quando 64 resta misurabilmente indietro. L'addestratore si ferma a 128: 256 cambierebbe un sesto dei pesi che tocca, più di quanto serva a qualsiasi set di qui.
- Il file del modello di base non cambia mai. Il rischio di un rango grande è l'adattatore stesso: a piena forza dimentica ciò che non gli è stato mostrato (il canto, se ha imparato dal parlato).
- **Passi**: la metà musicale impara a memoria un set piccolo in fretta (la sua loss scende verso 0): le epoche verdi della Telemetria sono quelle da ascoltare per prime, spesso molto prima dell'ultima.
- **Learning rate**: tieni quello del tipo; più alto impara più in fretta e dimentica di più.
- **Peso AR**: 0 insegna solo il suono (un timbro); alzalo per la dizione e lo stile, che vivono nella metà musicale.
- **La frequenza di campionamento del materiale**: la metà sonora lavora a 48 kHz, quella musicale ascolta a 24 kHz. Una registrazione a 24 kHz insegna tutto alla metà musicale, ma alla sonora solo degli acuti spenti: ricampionare non aggiunge nulla sopra la metà della frequenza originale. Per un timbro, dalle 44,1 o 48 kHz.

### 4 Telemetria <!-- #4-telemetry -->

![Le curve di entrambe le metà, spiegate sotto ciascuna](guide/train-charts.png)

Le esecuzioni in addestramento stanno in cima alla stanza con il loro avanzamento, il tempo rimanente ed entrambe le loss. La telemetria di un'esecuzione mostra avanzamento, velocità, tempo, memoria e due curve:

- **Metà sonora · perdita flow**: quanto bene la metà sonora prevede il rumore che deve togliere. Salta da un passo all'altro (ogni passo estrae un livello di rumore a caso): leggi la linea spessa, la media mobile.
- **Metà musicale · ar_ce**: quanto bene la metà musicale prevede i token della canzone stessa. Vicino a 0 conosce le canzoni a memoria; allora un'epoca precedente è l'adattatore migliore.

Passa il puntatore su una curva per leggere il passo, la sua epoca e il valore in quel punto. **Confronta con…** sovrappone a queste le curve di un'altra esecuzione, tratteggiate.

### Le epoche da ascoltare per prime <!-- #the-epochs-worth-hearing-first -->

![Verdi: da ascoltare per prime; ✓: in loras/](guide/train-epochs.png)

Ogni epoca salvata è un chip. Le **verdi** sono quelle da ascoltare per prime, lette dalle curve: la prima epoca la cui loss sonora si è assestata, quella con la loss sonora più bassa e l'ultima prima che la metà musicale sappia le canzoni a memoria. È un'ipotesi; decide l'orecchio. Scegli un'epoca: **In loras/ → il Creatore** (compare subito tra le LoRA), **Fuori da loras/** o **Scarica**.

> **Un adattatore addestrato senza partitura (Diretto) va sulla metà musicale solo nelle esecuzioni in Diretto.** In Piano completo la sua metà musicale può rompere la partitura anche a forza bassa: lì, dagli solo la metà sonora.

### Esecuzioni <!-- #runs -->

![Ogni esecuzione è una scheda](guide/train-runs.png)

Ogni esecuzione è una scheda a destra: *Attive*, *Tutte*, *Archiviate*, *Cestino*, con ricerca. Un'esecuzione in addestramento si illumina come un take che suona. ⋯ su una scheda: la sua telemetria, il suo log, archiviala, fermala o cancellala nel cestino (ti viene chiesto se i suoi adattatori in loras/ se ne vanno con lei). Dal Cestino torna, o se ne va per sempre.

## Motore <!-- #engine -->

### La macchina <!-- #the-machine -->

![Motore](guide/studio-engine.png)

- **Server**: ciò che il motore fa girare: il modello, i decoder, il contesto, la libreria.
- **Calcolo**: la copia del **modello** (BF16 7,2 GB, Q8_0 3,8 GB, Q6_K e Q5_K_M più piccole), **Preimpostazione della memoria GPU** (*Auto* adatta il contesto e le tile del VAE alla scheda; *Manuale* le lascia a te), **Tieni i modelli caricati**.
- **Hardware**: la memoria della scheda ora; **Rilascia il modello** la libera subito.

### GPU: quale scheda fa cosa <!-- #gpus-which-card-does-what -->

![Quale scheda fa cosa](guide/engine-gpus.png)

Su una macchina con più schede, dai a ciascuna il suo lavoro: lo **studio** (la sintesi) su una scheda, l'**addestramento** sulle schede che gli assegni, i **lavori** del laboratorio (l'ascoltatore, Whisper, stem, remaster, upscale) sulle loro. Mentre un'esecuzione si addestra sulla scheda dello studio stesso, una sintesi aspetta, e la pagina dice perché. Con una sola scheda funziona così: addestra, poi crea. Una nuova scheda per lo studio ha effetto dopo un riavvio (il pulsante compare quando serve).

### Decoder, adattatori, slider, il modello dello scrittore, l'aspetto <!-- #decoders-adapters-sliders-the-writer-s-model-the-look -->

- **VAE**, **LoRA**, **Slider**: ogni file che lo studio ha trovato, con la sua fonte e ciò che fa.
- **Scrittore**: l'indirizzo del server di chat locale (vLLM, LM Studio, Ollama), *Prova la connessione*.
- **Aspetto**: 22 temi (scelti per crearci dentro: chiari e quieti), gli angoli, i tre caratteri (testo, titoli, numeri).
- **Log del server**: il log intero; **Informazioni**: ogni progetto su cui poggia lo studio, con il suo link.
- **Aggiornamenti**: le versioni di Ruach Studio su GitHub rispetto a questa: ogni quanto guardare (ogni giorno, settimana, mese, mai), anche le candidate, e quando ne esce una, chiedere o aggiornarsi da sola quando nulla è in corso (solo dove lo studio è un clone del suo repository; altrove dice come aggiornare a mano). Uno studio nuovo, e ogni aggiornamento, offre i set 💎 che non ha ancora.

## DAW <!-- #daw -->

**Sperimentale.** La via verso una DAW funziona ed è stata verificata, ma ha ancora bisogno di crash test su altre macchine e altri progetti, e di altro lavoro.

### Due vie d'uscita dallo studio <!-- #two-ways-out-of-the-studio -->

Lo studio consegna una canzone in uno di due modi, e solo in questi due:

1. **La traccia mixata**, così come l'ha fatta lo studio e rifinita il Rifinitore: WAV, FLAC o MP3, senza DAW in mezzo.
2. **L'intero take nella tua DAW**, come progetto di quella DAW: da lì in poi tutto avviene fuori dallo studio. Non rientra né audio né progetto: lo studio non legge il progetto di una DAW (REAPER può dargli ciò di cui una canzone è fatta: le sue parole e una melodia).

**Esporta in una DAW** apre questa scelta: nel ☰ o nel Rifinitore, accanto al take in mano. La pagina mostra quali DAW ha la macchina dello studio (REAPER, Waveform, Bitwig), con le loro versioni. Quando lo studio gira su un computer diverso da quello della tua DAW (un server a casa, un portatile in viaggio), segna la tua con *Uso questa*.

| DAW | cosa le dà lo studio | stato |
|---|---|---|
| **REAPER** | il suo progetto (.RPP): il mix, gli stem, la partitura come MIDI, tempo e metro, sezioni, testo, la ricetta | pronto, verificato da REAPER stesso |
| **Waveform** (Tracktion), 14 o successivo | DAWproject: il mix e gli stem, la partitura come tracce di note, le sezioni come marcatori, tempo e metro | pronto, verificato sullo schema del formato |
| **Bitwig** | DAWproject, lo stesso | pronto, verificato sullo schema del formato |
| **Studio One, Cubase** (Windows, macOS) | DAWproject, lo stesso | pronto |

### REAPER: installazione <!-- #reaper-install -->

- **Linux**: da reaper.fm, l'archivio *Linux x86_64*; scompattalo ed esegui `./install-reaper.sh`: va in `/opt/REAPER`, senza nient'altro.
- **Windows, macOS**: l'installer da reaper.fm.
- REAPER dà 60 giorni con tutte le funzioni, poi chiede una licenza ($60 per uso personale o una piccola impresa).

### Il progetto più completo: prima tre passi <!-- #the-fullest-project-three-steps-first -->

Ciò che il progetto porta con sé dipende da ciò che ha il take. Per avere tutto:

1. **Piano completo** quando fai la canzone: la partitura diventa le tracce MIDI e dà il tempo e il metro. (Un take in Diretto non ha partitura: niente MIDI; il tempo viene da "NN bpm" nello stile, o resta un 120 provvisorio.)
2. **Rifinitore → Stem**: ogni stem ha la sua traccia (due: voce e strumentale; quattro: con batteria, basso e il resto).
3. **Rifinitore → Verifica del testo**: Whisper mette a tempo ogni riga; le righe arrivano sulla timeline e le sezioni ([Verse], [Chorus]…) diventano regioni.

Nessuno dei tre è necessario: il progetto prende ciò che c'è e dice cosa gli è mancato.

### REAPER: esportare e aprire <!-- #reaper-export-and-open -->

1. Apri il take (nel Creatore, nel Rifinitore o nel Bibliotecario), poi **Esporta in una DAW → REAPER → Esporta il take**; oppure clic destro su qualsiasi take → **Scarica → Progetto REAPER**.
2. Lo studio impacchetta il take: l'audio come WAV a 24 bit a 48 kHz, così una canzone di sette minuti con due stem pesa circa 350 MB. Il browser salva `TITLE.reaper.zip`.
3. Scompattalo dove vuoi, per intero: `TITLE/TITLE.RPP` e `TITLE/audio/` restano uno accanto all'altro.
4. Apri `TITLE.RPP` in REAPER (File → Open project, o un doppio clic).

### Cosa c'è dentro <!-- #what-is-inside -->

| traccia | che cos'è |
|---|---|
| **Mix** | la canzone come l'ha resa lo studio; **muta** quando ci sono gli stem, così suonano gli stem e il mix aspetta come riferimento |
| **Vocals**, **Instrumental** (o Drums, Bass, Other) | gli stem, ciascuno da 0 lungo tutta la canzone |
| **Score · Vocal**, **Score · Ins** | la partitura come MIDI, una traccia per voce. È la partitura *come è stata scritta*: la canzone come è stata cantata può allontanarsene. Non suona finché non le dai uno strumento (l'FX della traccia: ReaSynth, o qualsiasi VSTi) |
| **Lyrics** | ogni riga del testo come un elemento vuoto con la riga nella sua nota, dove Whisper l'ha sentita |

- **Regioni**: le sezioni del testo, dalla prima riga a tempo di ciascuna alla successiva.
- **Tempo e metro**: dalla partitura (il suo `Q:` e il suo `M:`), altrimenti "NN bpm" nello stile, altrimenti 120 in 4/4 come valore provvisorio; le note del progetto dicono quale.
- **Le note del progetto** (nelle impostazioni del progetto di REAPER): il titolo, lo stile, entrambi i semi, il nome proprio del take: la via del ritorno al take nel Bibliotecario.

### REAPER: quando qualcosa non va <!-- #reaper-when-something-looks-wrong -->

| cosa vedi | perché | cosa fare |
|---|---|---|
| media offline | la cartella audio non sta accanto al .RPP | scompatta l'intero ZIP, tieni `audio/` accanto al progetto |
| niente testo, niente regioni | il take non è mai stato messo a tempo | Rifinitore → Verifica del testo, poi esporta di nuovo |
| niente tracce MIDI | un take in Diretto, o uno senza partitura | fallo in Piano completo, o porta la tua partitura nel Creatore |
| il tempo segna 120 | il take non ha un tempo suo | impostalo in REAPER, o scrivi "NN bpm" nello stile la prossima volta |
| il MIDI va avanti o indietro rispetto alla voce | la partitura è il piano, il canto la sua interpretazione | usa il MIDI come schizzo, o allinealo agli stem |
| il testo in ebraico o in greco appare a quadratini | al carattere di REAPER manca quella scrittura | un carattere con quelle scritture nel tema o nelle preferenze di REAPER |

### REAPER: canzoni da dentro REAPER <!-- #reaper-songs-from-inside-reaper -->

Tre azioni di REAPER in `extras/reaper/` (ReaScript, Lua) raggiungono lo studio attraverso la sua API, dalla macchina dello studio stesso o da un'altra della tua rete. Il suono va in un solo senso: le canzoni escono dallo studio verso REAPER, e né audio né progetto tornano indietro. Ciò che REAPER dà allo studio è ciò di cui una canzone è fatta: le sue parole e la sua melodia.

- **Ruach - Generate here**: lo stile, la durata e la modalità, chiesti; la canzone si fa nello studio e arriva su una nuova traccia all'inizio della selezione temporale (lunga quanto la selezione). Il testo viene dalle note degli elementi selezionati (il progetto esportato tiene lì le parole di ogni sezione), o dalla finestra di dialogo. **Gli elementi MIDI selezionati sono la melodia della canzone**: le loro note diventano la sua partitura (si canta la traccia più alta; una traccia di accordi non viene data come linea, perché la melodia potrebbe prenderla uno strumento), al tempo e al metro del progetto, nella tonalità del key snap dell'elemento MIDI o in quella che suggeriscono le note, fatta in modalità *Solo melodia*; le note del nuovo elemento dicono come è stata letta la melodia. REAPER resta libero mentre lo studio lavora.
- **Ruach - Bring a take**: parole (titolo o nota, `*` e `?`), uno spazio se vuoi, e il take che scegli arriva al cursore di modifica.
- **Ruach - Settings**: l'indirizzo dello studio, il suo token se ne chiede uno, e lo spazio in cui arrivano le canzoni da REAPER.

Installazione: copia la cartella negli `Scripts` di REAPER, poi *Actions → New action → Load ReaScript* per tutte e tre, ed esegui *Settings* una volta. Serve `curl` (ce l'hanno ogni Linux, macOS e Windows 10 e successivi). Il README della cartella dice il resto.

### DAWproject (Bitwig, Studio One, Cubase) <!-- #dawproject-bitwig-studio-one-cubase -->

Clic destro su un take → **Scarica → DAWproject**, o *Esporta il take* sulla scheda di Waveform o di Bitwig nella finestra DAW: un file `.dawproject` con il mix e ogni stem (il mix muto quando ci sono gli stem), la partitura come tracce di note, una per voce, le sezioni come marcatori una volta messo a tempo il take, al tempo e al metro del take; lo stile e il testo viaggiano nelle sue note. Aprilo con l'importazione DAWproject della DAW: Waveform 14 o successivo (*File > Import Other > Import a DAWproject file*; lo studio chiede almeno Waveform 14), Bitwig, Studio One, Cubase. Verificato sullo schema del formato stesso (Project.xsd).

### Dai tuoi script <!-- #from-your-own-scripts -->

Tutto quanto sopra è anche l'API dello studio: `POST /api/v1/takes/NAME/reaper` impacchetta il progetto e dice dove prenderlo. Vedi **docs/API.md**: canzoni, lavori, take, segni, spazi, e un server MCP per gli agenti.

## Partitura <!-- #score -->

In Piano completo la metà musicale scrive una partitura prima che suoni una sola nota, e la canzone la segue battuta per battuta; con La tua partitura la partitura è tua. Questa scheda la legge riga per riga: il dialetto che scrivono YuE2 e SheetSage2, come le sue due voci si dividono le battute e come cambiarle senza rompere la canzone.

### Che cosa fa la partitura <!-- #what-the-score-does -->

La partitura è testo ABC: un'intestazione, poi la canzone in gruppi da una a quattro battute, ogni gruppo una volta per la voce (**Vocal**) e una per gli strumenti (**Ins**), su un'unica griglia di battute. Il motore la legge prima della musica: le note della voce portano le parole, gli accordi guidano l'armonia, le battute danno il tempo.

- **Un take dura quanto la sua partitura.** Sei take in Piano completo sono finiti entro 0.5–5 s dalla durata della loro partitura. Anche le battute dopo le ultime parole suonano: quella è una coda (*End at…* la taglia, oppure togli quelle battute dalla partitura).
- **Ciò che manca nella partitura non si canta.** Se il piano ha meno sezioni del testo, le ultime strofe restano fuori o ne torna una precedente.
- **Lo studio la legge con rigore.** Ciò che il controllo non conosce lo rifiuta, e dice dove: il gruppo, la voce, la battuta. Il motore forse suona comunque una partitura così, ma il MIDI, i marcatori, lo spostamento di una voce e la recitazione vogliono il dialetto nativo.

### L'intestazione <!-- #the-head -->

Otto righe, sempre queste, in quest'ordine:

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

- `X:1` e un `T:` vuoto così come sono: il titolo vive nel modulo.
- `M:` il metro come frazione: `4/4`, `3/4`, `6/8`, `2/4`; il denominatore una potenza di due.
- `L:` l'unità: una nota senza numero dura tanto. YuE2 scrive `L:1/16`, una semicroma, e tutto quello che segue si conta in essa.
- `Q:1/4=` il tempo: semiminime al minuto, un numero intero.
- Le due righe `V:` parola per parola: il motore riconosce le voci da esse.
- `K:` la tonalità: una maggiore con il suo nome (C, G, D, A, E, B, F#, C#, F, Bb, Eb, Ab, Db, Gb, Cb) o una minore con m (Am, Em, Bm, F#m, C#m, G#m, D#m, A#m, Dm, Gm, Cm, Fm, Bbm, Ebm, Abm). Un'altra grafia della stessa tonalità viene rifiutata: `Eb`, non `D#`.

### Gruppi, voci e battute <!-- #groups-voices-and-bars -->

Dopo l'intestazione la canzone va in gruppi:

```
% verse
V: Vocal
"Gm"B2B2B2B2B2B2B2G2|"Eb"B2B2B2B2B2B2B2F2|"F"F2F2F2F2F2G2F2F2|"Gm"G4z12|
V: Ins
Z4|
```

- Un gruppo: un commento di sezione dove comincia una sezione (`% verse`), poi `V: Vocal` e una riga da una a quattro battute, poi `V: Ins` e una riga con **lo stesso numero di battute**. Ogni riga finisce con `|`; niente `||`, niente ritornelli.
- `Z` è un'intera battuta di pausa, `Z2`, `Z3`, `Z4` altrettante battute; `z` è una pausa con una durata, come una nota.
- Un nuovo metro o una nuova tonalità arrivano come riga `M:` o `K:` subito dopo la riga `V:` di un gruppo, uguale nelle due voci: il controllo vuole le due voci su un'unica griglia e in un'unica tonalità in ogni istante. Dentro una battuta un cambio di tonalità si scrive `[K:Em]`.

### Le note e le loro durate <!-- #notes-and-their-lengths -->

- Le lettere sono altezze: `C D E F G A B` l'ottava dal do centrale (C4), in minuscolo `c d e f g a b` l'ottava sopra; `'` alza una lettera di un'ottava e `,` la abbassa: `B,` è B3, `c'` è C6.
- `^` diesis, `_` bemolle, `=` bequadro (`^^` e `__` doppi): un'alterazione vale per quella lettera fino alla fine della battuta. I diesis e i bemolli della tonalità non vogliono segno.
- Il numero dopo una nota è la sua durata in unità (con `L:1/16`): `1` una semicroma, `2` una croma, `3` una croma puntata, `4` una semiminima, `6` una semiminima puntata, `8` una minima, `12` una minima puntata, `16` una semibreve; `24`, `32` e `48` per le più lunghe. Solo queste: un'altra durata sono due note legate (`F4-F` per cinque).
- `-` lega una nota alla successiva della stessa altezza, anche attraverso la stanghetta: una nota tenuta, una sillaba.
- **Ogni battuta torna esattamente con il suo metro**: con `L:1/16` sedici unità in 4/4, dodici in 3/4 e in 6/8. Una battuta con un'unità in meno o in più viene rifiutata, con i suoi numeri.

### Accordi <!-- #chords -->

- Un accordo è il suo nome tra virgolette prima della nota dove comincia: `"Gm"B2`. Dura fino al successivo. Gli accordi vivono solo in **Vocal** (in Ins il controllo li rifiuta): sono l'armonia della band, non le note del cantante.
- Un nome è una fondamentale (da A a G, con `#` o `b`) e uno tra: maggiore (niente), `m`, `dim`, `aug`, `7`, `maj7`, `m7`, `dim7`, `m7b5`, `sus4`, `sus2`, `6`, `m6`, `7sus4`, `m(maj7)`; un basso dopo una barra: `C/E`.
- Una pausa può portare un accordo: `"Bmaj7"z16` è una battuta di quell'accordo con la voce in silenzio, come in un'introduzione.
- Con gli accordi una partitura si suona in **Piano completo**; senza nessuno, in **Solo melodia** (un piano della melodia, l'accompagnamento libero). Il motore lo capisce dalla partitura stessa.

### Sezioni <!-- #sections -->

- `% intro`, `% verse`, `% chorus`, `% bridge`, `% outro` su una riga propria prima di un gruppo segnano dove comincia una sezione. Arrivano nella tua DAW come marcatori (*Marcatori*, e dentro il progetto di REAPER), ed è in esse che il piano incontra il tuo testo.
- Dai alla partitura le sezioni del tuo testo, nel loro ordine, ciascuna con spazio per le sue righe. Il pianificatore a volte ne scrive meno: su un rap lungo, da 2 a 17 sezioni per le 32 del testo. Aggiungile, o accorcia il testo, prima di *Genera*.

### Tempo <!-- #time -->

- Una battuta dura le sue semiminime × 60 ÷ il tempo, in secondi (il tempo conta semiminime): in 4/4 a 85 BPM 2.82 s, a 103 BPM 2.33 s; in 3/4 a 90 BPM 2 s.
- La canzone dura le sue battute × questo. La riga del controllo sotto la partitura lo dice: `✓ Native YuE2 score · Em · 90 BPM · 3/4 · 11 bars · 0:22 · 0 sections`.
- Una riga di testo vuole il tempo delle sue sillabe: a una croma per sillaba una battuta di 4/4 ne contiene 8, a una semicroma 16 (un rap: le strofe di «Buratino» di Viktor vanno così: `FFFFFEEEE2zDDDDD`).
- Perché la canzone finisca prima, togli battute alla fine della partitura, nelle due voci; per un finale, aggiungi battute lì.

### Lo spazio della voce: Vocal <!-- #the-voice-s-space-vocal -->

- Vocal è ciò che si canta: più o meno una sillaba per nota, una nota legata una sillaba tenuta, pause dove il cantante respira. La tabella del controllo dice quante note, quante al minuto, l'estensione e per quanto del tempo la voce suona.
- Note e sillabe: con più note che sillabe il modello stira le sillabe su di esse o ne aggiunge di sue; con meno, stringe le parole. Il contatore del testo in Composizione misura ogni riga con il tempo che occupa: dai alla riga più o meno altrettante note.
- Il rap è denso (semicrome su una o due altezze: lo porta il ritmo), una ballata ha note lunghe. Lascia una pausa alla fine di una riga: lì la voce respira e gli strumenti rispondono.
- Lo spostamento di voce sotto la partitura (*Sposta*) muove Vocal per gradi della scala (una terza, una quarta, un'ottava) dove sta troppo alta o troppo bassa per il cantante; gli accordi e Ins restano.

### Lo spazio degli strumenti: Ins <!-- #the-instruments-space-ins -->

- Ins è la riga propria degli strumenti: il riff dell'introduzione, le risposte tra le frasi, un assolo, il finale. Una melodia, non gli accordi (quelli stanno in Vocal): una riga, e YuE2 arrangia la band intorno a essa.
- **Sotto la voce Ins per lo più tace.** Le cover ufficiali tengono `Z4` sotto ogni gruppo cantato e suonano nell'introduzione, tra le sezioni e alla fine; i take di Viktor in Piano completo fanno lo stesso (un arpeggio nell'introduzione, `Z4` sotto le strofe, un riempimento nei passaggi). Un Ins affollato sotto una riga cantata è una seconda melodia contro la voce, e le partiture native lo evitano.
- Il controllo lo riassume come **Ins : Vocal**, le note dell'una contro quelle dell'altra: sopra 1.5 la maggior parte delle note la portano gli strumenti, sotto 0.67 la voce, in mezzo più o meno pari.
- Uno strumentale: Vocal tace (`Z`) per tutta la canzone e Ins porta la melodia. *Rendila strumentale* sposta la melodia vocale di una partitura in Ins (la ricetta ufficiale) e spunta *Strumentale*. Un adattatore di partitura strumentale a piena forza con parole da cantare dà una voce senza note: tienilo basso quando c'è un testo (Creatore › VAE, slider e LoRA).

### Cambiarla nello studio <!-- #changing-it-in-the-studio -->

- **Crea la partitura ABC**, leggila e cambiala, poi **Genera**: la via più sicura verso la partitura che vuoi. Oppure scrivi la tua in *La tua partitura*.
- Il controllo sotto la partitura la legge mentre scrivi: ✓ con la tonalità, il tempo, il metro, le battute, la durata e le sezioni, una tabella per voce e la riga **Ins : Vocal**; oppure ✗ con che cosa non va e dove: `group 3, Ins, bar 9: duration 15/4 quarter notes != meter duration 4`.
- **Tonalità** sposta tutta la partitura (alla più vicina, su o giù); *Sposta* sposta solo Vocal o solo Ins, per gradi della scala.
- **MIDI** verso fuori per una DAW (una traccia per voce, le sezioni come marcatori) e verso dentro da una (una riga melodica per voce); **Marcatori**: le sezioni con i loro secondi, come CSV.
- *Scrivila dal suono* e *Trascrivi questo take*: SheetSage2 ascolta una registrazione e ne scrive melodia e accordi in questo dialetto (con gli accordi, o solo la melodia, come scegli in *Cover o remix*).
- *Lay the lyrics on this score…*: le tue righe sulle battute della partitura; la scheda seguente racconta da dove viene.
- La partitura del take come pentagramma, a schermo intero, stampata in PDF: Creatore › La partitura.

### Quando il controllo dice di no <!-- #when-the-check-says-no -->

| dice | significa | fai |
|---|---|---|
| `duration … != meter duration …` | una battuta non torna | conta le sue unità: 16 in 4/4 con `L:1/16` |
| `unsupported duration 5` | una durata fuori da 1 2 3 4 6 8 12 16 24 32 48 | legane due: `F4-F` |
| `voices have different measure counts` | Vocal e Ins hanno un numero diverso di battute in un gruppo | dai alla più corta battute `Z` |
| `Native chord symbols belong in Vocal, not Ins` | un accordo in Ins | spostalo in Vocal, nella stessa battuta |
| `unresolved tie at end of score` | l'ultima nota è legata al nulla | togli il suo `-` |
| `tie changes pitch` | una legatura tra due altezze | lega un'altezza solo a sé stessa |
| `Unsupported key` | una tonalità fuori dall'elenco | la stessa tonalità come la scrive l'elenco: `Eb`, non `D#` |
| `expected 1–4 measures` | una riga con più di quattro battute | dividi il gruppo in due |
| `Preserve native Vocal and Ins voice definitions` | l'intestazione è cambiata | le otto righe qui sopra |

## Voci su una partitura <!-- #voices -->

Come il promo dello studio ha avuto il suo suono: un narratore dice le righe del promo sopra una base musicale, voci di donna cantano tra le righe, ogni riga vicino al momento che la sua scena chiedeva, tutto in un solo take. Il metodo vale per ogni recitato, lettura o rap su una base; *Lay the lyrics on this score…* ne fa per te la parte centrale.

### La base e il suo orologio <!-- #the-bed-and-its-clock -->

- Prima la musica senza parole: take nello stile della base (per il promo un trailer epico, D#m, 103 BPM, 128 s), finché uno suona giusto.
- Poi, su di esso, *Scrivila dal suono*: SheetSage2 scrive la partitura propria della base, i suoi accordi e le sue battute. Quella partitura è l'orologio: a 103 BPM in 4/4 una battuta dura 2.33 s e una semicroma 0.146 s, quindi, finché il metro resta, la battuta n comincia a n × 2.33 s.
- Cantata in Piano completo su quella partitura, la nuova canzone tiene quell'orologio: gli stessi accordi nelle stesse battute, e le parole dove la partitura le mette.

### Una riga sulle sue battute <!-- #a-line-on-its-bars -->

- Ogni riga aveva un momento in cui dirsi: la sua scena. Va alla battuta che comincia più vicino a quel momento; se lì suona ancora la riga precedente, alla successiva libera.
- La riga diventa note: una sillaba per croma su un tono dell'accordo della sua battuta, il nome accentato una semiminima più in alto, un respiro dopo una virgola (una croma) e dopo un punto (una semiminima), l'ultima sillaba della riga una semiminima e più in basso. Un narratore vuole poche altezze: bastano i toni dell'accordo, e gli accordi vengono dalla base.
- Alla prima battuta della riga la partitura riceve il suo commento di sezione e il testo la stessa etichetta: `% verse` là, `[Verse]` qui. Una riga per sezione: il piano e il testo si incontrano uno a uno, e niente resta fuori.
- Le parole che il modello accentua male hanno i segni di Viktor: un accento acuto sulla vocale tonica (обе́щано), il nome scritto come suona (рУ́ах in russo, רוּ-אַח in inglese).

### Due voci in un take <!-- #two-voices-in-one-take -->

- Il narratore e le donne sono un solo take, non un missaggio. Lo stile li nomina entrambi: `male baritone narrator, spoken word, clear English diction, female a cappella vocalise, oooh aaah, epic cinematic trailer`, e il tempo, `103 bpm`.
- Il testo dà ogni riga e dopo di essa, tra parentesi, il vocalizzo: `(Ooh, aah)`. Nei take del promo l'hanno cantato le donne.
- La partitura dà al vocalizzo note sue nelle battute tra le righe: una minima sul tono alto dell'accordo, poi il resto della battuta sul suo tono di recitazione, due ottave sopra le note del narratore. Il vocalizzo proprio della base resta alla fine: il finale tiene le battute della base con le loro note.
- Un adattatore di voce può dare una voce al narratore; tienilo basso (sono bastati 0.45 sulla metà musicale e 0.3 su quella sonora), o si prende la musica.

### Molti take, poi il migliore <!-- #many-takes-then-the-best -->

- Sei seed per lingua, Piano completo, guida 1.6, la durata fissata ai 128 s della base, la partitura e il testo così come sono. Ogni take dice le sue righe un po' a modo suo: uno cade più vicino, un altro parla più chiaro.
- Dove sono davvero le righe: Rifinitore › Testo › *Sincronizza le righe* dà il tempo di Whisper per ogni riga, parola per parola. I segmenti propri di Whisper sono troppo grossolani per questo: un segmento spesso comincia sul vocalizzo prima di una riga.
- Confronta il tempo di ogni riga con la sua battuta: nel take migliore del promo 7 righe su 11 sono cominciate entro 1.5 s dalla loro battuta (1.7 s in media, la più lontana 7.5 s); gli altri take si sono allontanati di più. La partitura guida la voce, non la inchioda.
- Mettili in fila: prima le righe entro 1.5 s, poi le righe sentite, poi la distanza media; ascolta i primi.

### Il doppio anello <!-- #the-double-ring -->

- La parola di Viktor: prima sistemare le tracce, poi adattare il video a esse, anche se le loro durate differiscono. Così l'immagine segue il take: una scena compare poco prima della sua riga, una didascalia mentre se ne dicono le parole, e la scheda finale resta fino all'ultimo secondo del take.
- Una riga non deve quindi cadere sulla sua battuta al decimo di secondo: il video si sposta verso di essa. Lo stesso vale senza video: una lettura al passo di alcune slide, un rap sulle sezioni di un beat.

### Nello studio ora <!-- #in-the-studio-now -->

- *Lay the lyrics on this score…* (Creatore › Cover, remix e la tua partitura) fa la parte della riga sulle battute per ogni partitura nel modulo: le tue sezioni, una sillaba per croma sui toni dell'accordo, i respiri, un'introduzione e un finale, il vocalizzo quando lo spunti.
- *Sincronizza le righe* (Rifinitore › Testo) dà il tempo di ogni riga; *End at…* finisce un take dopo la sua ultima riga.
- Non ancora nello studio: ogni riga a un secondo che scegli (i momenti delle scene del promo) e l'ordinamento dei take per distanza. Il promo lo ha fatto con script suoi.

## Scorciatoie e trucchi <!-- #shortcuts -->

**Nel Bibliotecario:** **Ctrl+A** seleziona ogni take mostrato, **Esc** nessuno, **Canc** manda i selezionati nel cestino (chiede prima), **Ctrl+Z** annulla l'ultima modifica (uno spostamento, uno spazio, il nascondere, un fissaggio, i segni, il cestino); la pillola sopra il lettore offre lo stesso Annulla per dieci secondi.

### Tasti <!-- #keys -->

| tasto | dove | cosa fa |
|---|---|---|
| **Barra spaziatrice** | ovunque tranne un campo di testo | riproduce o mette in pausa il take in mano |
| **←** **→** (con **Shift**: 30 s) | ovunque tranne un campo di testo o un menu | 5 secondi indietro o avanti |
| **M** | ovunque tranne un campo di testo | suono spento e acceso |
| i tasti multimediali | la tastiera, una cuffia, il pannello multimediale del desktop | riproduci, pausa, precedente, successivo |
| **Ctrl+Alt+1** … **9** | ovunque | **1** Creatore, **2** Scrittore, **3** Rifinitore, **4** Artista, **5** Bibliotecario, **7** Addestratore, **8** fuori, nella tua DAW, **9** il Motore; il **6** è tenuto per una stanza che verrà (Ctrl+1…9 sono le schede del browser stesso) |
| **Esc** | ovunque | chiude ciò che è aperto: un menu, una finestra di dialogo, la guida, una vista a schermo intero, la stanza del Motore |
| **F1** (o **Shift+F1**) | ovunque | questa guida, sulla stanza in cui sei; di nuovo per chiuderla (l'aiuto del browser non compare) |
| **Maiusc+Tab** | il Creatore | il tasto dei riquadri, non il ritorno indietro tra i campi: un riquadro sollevato passa all'altro, e se nessuno è sollevato si solleva quello del modulo (Compose); una finestra di dialogo, un menu e la barra di ricerca tengono il loro Maiusc+Tab |
| **F5**, **Ctrl+R**, **Ctrl+Maiusc+R** | ovunque tranne il Bibliotecario | chiedono prima e dicono cosa si porta via il ricaricamento e cosa tiene; con una canzone nel modulo, *Save to the Writer, then reload* la salva anche nello Scrittore; **Ctrl+F5** ricarica subito (nel Bibliotecario **F5** rilegge la biblioteca) |
| **Invio** / **Esc** | una finestra di dialogo, una rinomina sul posto, un valore digitato di una LoRA | conferma / annulla; in una finestra con testo lungo **Shift+Invio** va a capo |
| **Invio** | *Parti da un'idea* | il modello di chat abbozza la canzone; **Shift+Invio** va a capo |
| **Ctrl+S** | lo Scrittore | salva subito il documento |
| **Alt+K** · **Alt+J** | il testo, del Creatore e dello Scrittore | segnare la riga del cursore o togliere il segno · andare al segno successivo (**Alt+Shift+J** a quello prima, **Alt+Shift+K** li toglie tutti) |
| **Alt+O** · **Alt+L** · **Ctrl+Y** · **Alt+↑ ↓** | il testo, come in mcedit | togliere i segni · andare a una riga per numero · cancellare la riga · spostare la riga (o quelle selezionate) |
| **↑ ↓** · **→** · **←** | un menu | muoversi · aprire un sottomenu · uscirne |
| **frecce** | il selettore dei temi | muoversi tra i temi |
| **+** **−** **0** | un pentagramma o uno spettro a schermo intero | ingrandisci, rimpicciolisci, torna ad adattare; **Ctrl+rotellina** ingrandisce dove sta il puntatore |
| **← →** (con **Shift**: passi più ampi) · **Home** | il bordo di una colonna, a fuoco | la colonna più stretta o più larga · di nuovo la sua larghezza |
| **Invio** o **Barra spaziatrice** | la scheda di un'esecuzione nell'Addestratore LoRA | apri l'esecuzione |

### Il mouse <!-- #the-mouse -->

- **Clic destro** su un take ovunque (l'elenco dei take, una scheda, un take fissato) per il suo menu; clic destro su uno spazio per i suoi blocchi, rinominarlo ed eliminarlo.
- **Doppio clic**: un take nell'elenco dei take lo riproduce; il nome di uno spazio lo rinomina; il bordo di una colonna le ridà la sua larghezza; il pentagramma o lo spettro si apre a schermo intero; il valore di una LoRA ti lascia scriverlo esatto.
- **Nel Bibliotecario, come in un file manager**: una volta selezionata una scheda, un clic in qualunque punto di un'altra seleziona anche quella; **Shift**+clic seleziona tutto l'intervallo; un trascinamento nello spazio vuoto tra le schede disegna una banda che seleziona ciò che tocca; **Ctrl**+trascinamento la disegna da qualunque punto e inverte ciò che attraversa: le schede non selezionate si selezionano, quelle selezionate si deselezionano. La pagina scorre quando la banda raggiunge un bordo.
- **Segni per molti**: con più take selezionati, 👍, 👎 o ★ su uno qualsiasi (o sulla barra dei selezionati) li segna tutti; quando tutti hanno già quel segno, viene tolto. Togliere più take da uno spazio chiede prima; il cestino chiede sempre.
- **Passa il puntatore** sul nome troncato di uno spazio: appare intero, sopra la griglia.
- **La velocità** nel lettore (da 0.5× a 2×) conserva l'intonazione: rallenta per sentire un dettaglio, accelera per scorrere.

### Piccoli trucchi <!-- #small-tricks -->

- Tieni il **seme musicale** e cambia il **seme sonoro**: la stessa canzone, resa di nuovo.
- Ascolta uno strumento su **più semi** prima di giudicarlo: YuE2 lo fa entrare quando il seme e la canzone glielo permettono.
- **Fissa** i take a cui torni sempre (quattro in ogni spazio); **Fissati**, a sinistra, li elenca tutti.
- **⋯** su una scheda è il suo menu del clic destro, per un touchpad.

## Consigli <!-- #tips -->

### Quando qualcosa va storto <!-- #when-something-goes-wrong -->

| cosa vedi | che cos'è | cosa fare |
|---|---|---|
| *Babele nella partitura* | la metà musicale ha scritto spazzatura al posto di una partitura | forze nel verde, meno adattatori sulla metà musicale, o Diretto |
| il cantante parla sopra un loop | un adattatore di partitura strumentale troppo forte per una canzone cantata | tienilo a 0.3–0.5 |
| *GPU0 sta addestrando…* | un'esecuzione si addestra sulla scheda dello studio stesso | aspetta, ferma l'esecuzione o dai all'addestramento un'altra scheda (Motore → GPU) |
| la pagina dice che il server non è disponibile | lo studio si è riavviato | aspetta qualche secondo; ricarica la pagina (F5) dopo un aggiornamento |
| un take suona metallico negli acuti | il ronzio a 25 frame del VAE | Rifinitore → Antironzio all'80 % |
| il testo si allontana da quello scritto | la metà musicale ha perso le parole | Rifinitore → Verifica del testo; *Rigenera da…* dal minuto in cui è andato storto |
| lo strumento che hai chiesto non c'è | è YuE2 a decidere quando entra uno strumento, e il seme decide molto | lo stesso prompt con un **seme musicale casuale**; ascolta più take prima di giudicare |
| lo strumento suona, ma non come quello vero | ciò che YuE2 sa di lui | una LoRA di strumento (Addestratore LoRA) |

### Buone abitudini <!-- #good-habits -->

- Tieni il **seme musicale** quando una canzone è giusta e cambia solo il **seme sonoro** per sentirne di nuovo il suono.
- Annota cosa funziona nella **Nota** di ogni take: la settimana prossima non ricorderai quale seme era.
- Dai a ogni progetto il suo **spazio**, e blocca quelli finiti.
- Addestra su ciò che vuoi sentire: l'adattatore impara il suono del set, difetti compresi.
