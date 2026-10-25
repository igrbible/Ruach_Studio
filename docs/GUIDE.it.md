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
- **Nessuna registrazione fuori da uno spazio**: tutto ciò che crea una registrazione (Genera, Sostituisci una sezione, Importa) aspetta uno spazio in mano che accetti nuove registrazioni, mai un set 💎, le sue sezioni o uno spazio congelato. L'unico aperto va in mano da sé, una nuova installazione riceve *Le mie canzoni*, altrimenti lo studio chiede; nulla parte finché non se ne sceglie uno, né finché il Bibliotecario non risponde.
- **IT** (le due lettere della lingua): la pagina in un'altra lingua, salvata con le tue impostazioni: English, Русский, Українська, Беларуская, Ελληνικά, Español, Italiano, Français, Português, Deutsch, 日本語, 中文, ognuna chiamata con le sue parole. Numeri e date seguono la lingua, e questa guida si apre in essa.
- **☀ / ☾**: giorno, notte o come dice il sistema.
- Nell'intestazione di Composizione: **Salva** un prompt (tutto ciò che la generazione invierebbe) come JSON o YAML e **Apri** per riprenderlo; **Svuota** le parole (titolo, stile, testo, partitura, seed) senza toccare il resto, oppure inizia una **Nuova canzone** (anche modalità, campionamento e LoRA ai predefiniti; *Suono e uscita* resta). **Apri** dice cosa di un file il modulo non ha potuto accogliere e cosa tiene al suo posto.
- **Esporta in una DAW** (nel ☰, e nel Rifinitore: accanto al take in mano e nei suoi Stem): la via d'uscita dallo studio. O la traccia mixata così com'è (WAV, FLAC, MP3), o l'intero take nella tua DAW, dove il resto avviene fuori dallo studio. La pagina trova REAPER, Waveform e Bitwig sulla macchina dello studio, oppure indichi tu la tua. Ogni take esce dal suo menu (clic destro): *Esporta in una DAW → Progetto REAPER* o *DAWproject* (Waveform, Bitwig, Studio One, Cubase), la tua DAW per prima; la scheda DAW di questa guida dice cosa c'è dentro.
- **Rilascia il modello**: toglie subito dalla memoria della GPU ogni modello inattivo; tinto di rosso finché un modello è caricato.
- **☰**: il resto. La scheda video e la sua memoria, la copia del modello, il decodificatore del suono (VAE), **Esporta in una DAW**, i temi, la stanza del Motore e questa guida. **Text size** lì imposta la dimensione del testo di tutta la pagina da −2 a +4 pt (la disposizione resta), e una cornice sollevata ha i suoi −, + e ⟲ sopra (da −4 a +6 pt); ogni schermo tiene il suo. Quando in `user/plugins/` c'è un tuo plugin, **Plugin propri** lì lo spegne per questo browser: il Rifinitore, la DAW e il MIDI mostrano allora solo ciò che ha uno studio pubblico, per provare il percorso pubblico, una promo o le immagini; non si cancella nulla e la pagina si ricarica.

![Dietro il ☰](guide/more-menu.png)

### La tua prima canzone, in sei passi <!-- #your-first-song-in-six-steps -->

1. Dalle un **Titolo** e scegli la **Tonalità** se ne hai una in mente (o lascia *come è scritta*).
2. Scrivi lo **Stile**: lingua, genere, voce, strumenti, tempo. Una o due righe semplici bastano. Il ♪ lì accanto elenca 200 strumenti con ciò che YuE2 suona davvero (vedi *Creatore*).
3. Incolla il **Testo** con i tag di sezione su righe a sé: `[Verse]`, `[Chorus]`, `[Bridge]`, `[Outro]`.
4. Lascia **Piano completo** come modalità di pianificazione: YuE2 scrive prima melodia e accordi, poi la canzone.
5. Premi **Genera canzone**. L'esecuzione mostra le sue fasi: la partitura, i token musicali, il suono, la decodifica.
6. Il take si apre al centro, con il suo lettore, la sua partitura e tutto il necessario per rifarlo.

> Misurato su una RTX 3090: una canzone di 6:12 in modalità Diretto ha richiesto 135 secondi, una di 7:25 in Piano completo 212 secondi (prima si scrive la partitura). Le canzoni più brevi sono più rapide.

### Il lettore, i take e il log del server <!-- #the-player-the-takes-and-the-server-log -->

- **Il lettore** in basso: la forma d'onda da un lato all'altro, una nuvola morbida con la parte già ascoltata nel colore d'accento (un clic salta lì); sotto, il take (la sua copertina quando ce l'ha, il titolo, le prime parole dello stile, 👍 👎 ★), poi **casuale**, precedente, riproduci, successivo e **ripeti** (spento · tutto l'elenco di nuovo · questo take di nuovo, segnato 1), poi il tempo (un clic sulla durata totale lo trasforma nel tempo rimanente), *riproduci al clic* (un clic in un elenco riproduce subito il take), *continua a riprodurre* (quando un take finisce, parte il successivo dell'elenco), *riproduci i nuovi take* (una canzone fatta qui suona appena è pronta, se non suona niente), 🔔 *un suono alla fine di un'esecuzione* (due note in su quando è pronta, una volta sola per una coda di esecuzioni, due in giù quando una fallisce; nessuno sopra una canzone nuova che parte da sola), la **velocità** (da 0.50× a 2.00×, l'intonazione conservata), il volume e un punto di stato (pulsa mentre suona un take). Ciò che non ti serve in quel momento resta tenue finché non arriva il puntatore; ogni icona dice cosa fa quando il puntatore ci si posa. Il puntatore sulla forma d'onda mostra il tempo a cui salterebbe un clic. I tasti multimediali della tastiera e di una cuffia governano il lettore, e il pannello multimediale del desktop mostra il take. ⏪ e ⏩ vanno al segno precedente o successivo ogni 15 secondi da 0:00, ← e → ai segni di 5 secondi (con Shift, di 30). La pillola di stato all'estremità destra del lettore (verde mentre suona un take, del colore d'accento mentre se ne fa uno) apre il take o l'esecuzione; con Compose sollevato sopra la stanza, gira la cornice su quella del take. Un clic destro sulla forma d'onda, sull'immagine o sul titolo apre il menu del take, come in un elenco. La forma d'onda mostra le sezioni del take: i tag del testo stesso, ognuna dove Whisper sente la sua prima riga (una volta per take, circa mezzo minuto; da sola su una macchina con due schede o più, altrimenti dal menu del take → *Find the sections by ear*); un take non ancora ascoltato mostra i segni della sua partitura. Una linea sottile all'inizio di ciascuna, il nome in basso; un clic vicino a una linea va all'inizio esatto della sezione; il puntatore sull'onda mostra una scheda con la sezione, il suo tempo e le sue righe come sono scritte, illuminata la riga cantata lì; una sezione segnata con ? non si è sentita chiaramente. Il puntatore fermo un momento sull'onda porta sopra il lettore lo spettrogramma dell'intero take (l'interruttore dello spettro accanto a 🔔 lo spegne): largo quanto l'onda e in tempo con essa, circa un terzo dell'altezza della finestra, con la scheda della sezione sopra; dentro, le sezioni, il centroide spettrale come linea magenta (dove sta il peso del suono: la sua brillantezza), l'RMS in una fascia in basso con la media del take tratteggiata, la testina; sotto il puntatore il suo tempo, lo spettro di quel momento accanto alla linea con la frequenza più forte e la sua nota, e dentro l'immagine la frequenza lì, la sua nota e il suo livello. *Logaritmica* o *Lineare* nella sua testata; un clic va lì come sull'onda; il puntatore via o Esc lo tolgono. Il take si misura una volta, dal laboratorio, come per il suo Spettro. Il volume arriva al 150 %: oltre il 100 % amplifica un take debole, e il cursore si ferma prima al 100 % (lascialo e trascina di nuovo per andare oltre).
- **Due righe o una**: la forma d'onda sopra i pulsanti del lettore resta dove le canzoni si ascoltano e si confrontano (Creatore, Rifinitore, Bibliotecario); nello Scrittore, nell'Artista, nell'Addestratore e nel Motore il lettore sta in una riga, come nel Creatore mentre una cornice è sollevata o il testo è sopra tutto. Dopo un ricaricamento (F5) torna con il suo take e il suo punto. Nell'Artista i take partono richiusi e il log del server sta a sinistra.
- **Le schede dal vivo**: in Engine → GPUs ogni scheda ha sotto una riga sua, il carico e la memoria una barra ogni due secondi per quattro minuti, con temperatura e potenza; il log del server aperto mostra accanto le schede che hanno un ruolo, ciascuna col suo ruolo sopra, quella dello studio incorniciata. Le misure continuano sempre, così il log si apre già con gli ultimi minuti.
- **La linea verso lo studio** appare accanto al log del server (*Forge · 85 ms*, o *qui* sulla stessa macchina). Quando lo studio è lontano, un mi piace, un preferito o un fissaggio si vedono subito e lo studio li conferma soltanto.
- **Take** a destra: cerca con parole, `*` e `?`; *Preferiti*; richiudi la colonna con »; ⋯ per le azioni proprie dell'elenco. Nel ⋯, *Da tutti gli spazi* mostra in questa colonna i take di tutti gli spazi, lasciando com'è lo spazio in mano.
- **Registrazioni piegate**: il mouse sulla striscia » apre la lista sopra la registrazione; si richiude un secondo dopo che il mouse se ne va (il suo pulsante Piega, premuto allora, la tiene aperta). Il menu ⋯ si apre verso l'alto quando il player non lascia spazio sotto.
- **Il log del server** sta proprio sopra il lettore in ogni stanza: chiuso, mostra l'ultima cosa detta dal motore (in rosso quando qualcosa non è andato); aperto, dieci righe, *Segui*, *Copia* e la via al log completo nel Motore. Con una cornice sollevata sopra la stanza, sta a sinistra, lontano dai pulsanti della cornice. La freccia sul suo bordo interno lo porta all'altro lato della pagina, e ogni stanza ricorda il suo lato (quello dell'Artista è il sinistro). Il suo bordo esterno si trascina per allargarlo, fino a 1200 px (la larghezza resta; un doppio clic ridà la sua); con le schede accanto è largo 920 px, la loro colonna 390. La cornice ha due viste, **Server** e **Artist** (il registro dell'Artista: che cosa è stato chiesto, che cosa ha risposto il laboratorio, la strada di ogni giro fino alla fine), e ogni stanza apre la sua; **⧉** apre il registro in una finestra sua, sopra tutte le finestre in Chrome o da portare su un altro monitor. Mentre una LoRA si addestra, sopra il log compare una barra sua, una riga per addestramento: la sua scheda, il passo, quanto è fatto e quanto manca all'incirca; un clic apre l'Addestratore.

![Il log del server, aperto](guide/log-dock.png)

## Creatore <!-- #creator -->

### Composizione: il modulo della canzone <!-- #compose-the-song-form -->

![Titolo, tonalità, semi e stile](guide/compose-top.png)

- **Parti da un'idea**: una riga sulla canzone; il modello di chat dello Scrittore abbozza il titolo, lo stile e il testo (*Scrivi il brief*).
- **Titolo**, **Tonalità**: la tonalità entra nella partitura (`K:`). Con una partitura nel modulo, una nuova tonalità la sposta lì; senza, la scelta aspetta e sposterà la partitura che arriva.
- **Versioni** (accanto a *Salva nello Scrittore…*): il modulo si conserva sotto il suo titolo a ogni Generate, con Ctrl+S, dopo che il piano roll scrive nella partitura e prima di tutto ciò che lo sovrascrive (un esempio, un take, lo Scrittore, una versione), con le sue impostazioni, così una modifica non si perde mai; un clic sceglie una versione, un secondo mostra le due come differenze, *Nel modulo* ne riporta una; stella, etichetta, lucchetto. Cancellare un take non si porta via le sue versioni. **Versione**, accanto al Titolo, accetta cifre e punti (4.2.3): un take si chiama «Titolo v4.2.3», come si nominano le tracce, e le versioni tengono un albero per titolo con un ramo per versione (un titolo scritto con la sua versione si divide da solo nei due campi). *Elimina l'albero…* manda tutto l'albero di un titolo nel cestino delle versioni; *Versioni del Creatore* nello Scrittore lo riporta indietro.
- **Seme musicale** e **Seme sonoro**: i dadi delle due metà. Vuoto è casuale; un numero ripete un take. Tieni il seme musicale e cambia quello sonoro per sentire la stessa canzone resa in modo diverso. Stanno per primi in *Campionamento e riduzione del rumore*. Accanto a ciascuno, la sua **modalità**: *Random (−1)* un seme nuovo ogni volta (il campo vuoto), *Random, fixed* uno a caso messo e tenuto, *Fixed* quello scritto, *Next* e *Previous* lo spostano dopo ogni Generate oltre i semi usati (le versioni per la musica, le variazioni per il suono). Il seme dell'Artista ha le stesse modalità. Un seme musicale fisso è sorvegliato: quando i suoi adattatori (le loro metà musicali) o il modello base sono cambiati dall'ultima volta che è andato, o quando ha rotto un piano con questi stessi adattatori, l'esecuzione chiede prima: **Un seme nuovo** o **Tieni il seme**. Un piano non scrive più il suo seme nel campo, e **Una nuova partitura** prende semi nuovi.
- **Stile**: lingua, genere, voce, strumenti, tempo. *Salva stile…* lo conserva con un nome. **♂** e **♀** nella sua intestazione vi mettono *male vocals* o *female vocals* (al posto della parola dell'altro genere, altrimenti prima del BPM); quello acceso toglie il suo tag. **Tempo libero**, accanto, fa la musica dalla partitura senza i suoi segni di tempo (Q:): voce e ritmo respirano da soli, il testo non è più legato alla battuta (rubato, non lineare); si accende da solo quando lo Stile chiede rubato o non-linear e non nomina BPM, e un BPM nello Stile mentre è acceso viene detto sotto il riquadro. Una partitura creata a parte (*Crea la partitura ABC*) arriva anch'essa senza tempo.
- **Lettere non latine** nello Stile vengono nominate sotto: YuE2 legge lo stile come tag in inglese. **✦ Suggerisci** (✦ Suggest) legge l'intero testo (fino a 8000 caratteri). Gli stili salvati, i profili, i profili di testo e i documenti dello Scrittore si scelgono nel dialogo dello studio, con un filtro su una lista lunga, come lo spazio.

### Il prontuario degli strumenti ♪ <!-- #the-instruments-cheat-sheet -->

Il ♪ accanto allo stile apre una tabella di 200 strumenti che lo studio ha provato: la loro famiglia, la loro terra, come suonano (in inglese e in russo) e le parole che li chiamano. ▶ A e ▶ B riproducono due prove di 60 secondi di ciascuno. Il verdetto di ogni riga lo dà un orecchio umano: sentito, in dubbio o **NOT IDENTIFIED IN YUE2** (YuE2 non lo conosce; serve un prompt più elaborato). Un clic copia il nome e chiede dove va: in fondo allo stile su una riga sua, o al suo posto; un nome che lo stile ha già è segnato nella tabella, e il testo della tabella si può selezionare e copiare.

**È YuE2 a decidere quando entra uno strumento.** Una riga di stile è una richiesta, non un ordine: per quanto insisti, il modello porta dentro uno strumento dove il suo addestramento dice che la canzone lo vuole, e il seme decide moltissimo. Lo stesso prompt ha dato un take con lo strumento e uno senza. Ascolta più semi prima di giudicare uno strumento.

**Si sente, ma non vero come uno dal vivo.** Molti strumenti suonano davvero, ma meno nitidi e meno veri di quelli reali: è ciò che YuE2 sa di loro. I verdetti dicono se YuE2 suona uno strumento oppure no, non quanto suona vero. Renderlo vero è il compito di una **LoRA di strumento**: qualche decina di sue registrazioni pulite, addestrate nell'Addestratore LoRA.

![Il prontuario degli strumenti](guide/instruments.png)

### Testo e profili del testo <!-- #lyrics-and-text-profiles -->

- Tag di sezione su righe a sé; YuE2 conosce `[Intro]`, `[Verse]`, `[Pre-Chorus]`, `[Chorus]`, `[Bridge]`, `[Interlude]`, `[Outro]`.
- Lascia senza parole un tag strumentale come `[Instrumental Outro]`: le parole sotto di esso portano la coda verso un canto inventato, take dopo take. Metti le ultime parole sotto un `[Breakdown]` prima di esso.
- **Profilo del testo**: incolla un testo intero, scegli un profilo, *Applica*: le sue regole (pulizia, fonetica) e la sua forma (`[Intro]`, `[Verse]` alle righe vuote, `[Interlude]` dopo i paragrafi lunghi) lo rendono pronto da leggere. *Annulla* riporta il testo indietro. I profili si creano nello Scrittore.

### Il contatore del testo e la mano fonetica <!-- #the-lyrics-meter-and-the-phonetic-hand -->

- **Il contatore** accanto al testo: ogni riga, le sue sillabe in una barra contro il righello del suo gruppo — strofa e ponte un gruppo, il pre-ritornello il suo, il ritornello il suo, ogni altra sezione la sua. Una pausa, un break, un silenzio, un interludio, un preludio o un passaggio strumentale dentro una sezione cantata non apre un gruppo: il suo nome sta accanto, tenue, e il righello della sezione prosegue. I tag non si contano mai: una riga di soli tag (`[Break] [Silence]`) non conta, un tag dentro una riga resta fuori dal conto. Il righello sta alla lunghezza abituale del gruppo; entro una sillaba la barra è verde, a due o tre ambra, oltre rossa. Ciò che è tra parentesi tonde è disegnato tratteggiato dopo la barra: YuE2 può cantarlo. Sotto la casella: caratteri, sillabe e righe del testo, i tag, le parentesi e la mano fonetica; il correttore del browser nella lingua del testo (lì si spegne); una casella allungata a mano tiene la sua altezza fino ad *Altezza automatica*.
- **Numeri di riga e segni**: il riquadro del testo numera le sue righe come un editor di codice (una riga che va a capo, una volta, sulla sua prima riga visiva; *Line numbers* sotto il riquadro li spegne). **Alt+K** segna la riga del cursore o toglie il segno, **Alt+J** va al segno successivo, **Alt+Shift+J** a quello prima, **Alt+Shift+K** li toglie tutti; il numero di una riga segnata è ambra, e i segni seguono le loro righe quando scrivi sopra. Ogni [tag] sta sotto un sottile strato ambra. Il testo dello Scrittore ha lo stesso. Come in mcedit: **Alt+O** toglie anch'esso i segni, **Alt+L** va a una riga per numero, **Ctrl+Y** cancella la riga, **Alt+↑** e **Alt+↓** spostano la riga (o le righe selezionate) col suo segno. *Keys* sotto il riquadro li elenca tutti, e l'etichetta LYRICS dello Scrittore li dice al passaggio del puntatore. **⤢** accanto a Lyrics solleva il riquadro sopra tutto, al 60 % della larghezza dello schermo e di quattro decimi più grande, con tutto questo e con i suoi −, + e ⟲ per la dimensione del testo (restano in questo browser); Esc lo rimette a posto. Accanto a **⤢**, due pulsanti tengono il testo come testo semplice: il primo lo salva in un `.txt` col nome del *Titolo*, il secondo mette un `.txt` (UTF-8) al suo posto (chiede prima se il riquadro ha parole, e **Ctrl+Z** nel riquadro le riporta; un *Titolo* vuoto prende il nome del file).
- **Parentesi controllate**: una «[» non chiusa nella sua riga, una «]» senza aperta, una «[» dentro un tag e un tag vuoto colorano di rosso il numero della riga, e *Tags not closed or astray* sotto il riquadro va dall'una alla successiva; una parentesi tonda lasciata aperta o chiusa senza aperta è ambra (un'eco può continuare). Una «[» ancora in scrittura resta tranquilla finché il cursore non lascia la sua riga. **Genera chiede prima** quando un tag è rotto: ciò che segue una «[» non chiusa può perdersi nella canzone e la sua fine storcersi; *Go to the line* o *Generate as it is*.
- **Accenti fuori posto**: un segno non su una vocale — a inizio riga, dopo uno spazio o un segno, su una consonante, un secondo sulla stessa lettera, o un ´ staccato al suo posto — mostra un pulsante rosso sotto il riquadro (*Stress marks off a vowel*) e un segno davanti al conteggio della riga; il pulsante li seleziona uno alla volta. Una parola con due segni ne riceve uno ambra: voluto o una svista? Nel conteggio il segno d'accento non è una sillaba; ע e una vocale latina dentro una parola russa sì. Una sillaba è un suono vocalico, una nota, e ogni lingua si conta con le sue regole: in russo, ucraino e bielorusso una lettera vocale (e poiché il contatore misura il tempo di una riga, una parola senza vocale — с, в, к, з, й, ў — e un'occlusiva davanti a un'affricata dentro una parola — глу-п-цо́в — prendono un battito proprio, disegnato più chiaro: «Я же вижу глупцо́в с приду́рческим планом» sono 12 sillabe e 2 di questi battiti, 14); in greco αι, ει, οι, ου, αυ, ευ sono una (la dieresi o l'accento le separano: τσά-ι); in spagnolo e in italiano una i o u debole si unisce alla vicina (cie-lo, cuo-re), due forti sono due (po-e-ta), e non contano la i di ciao, giorno, figlio né la u di qu e gu; in inglese una e finale muta non conta (make, ma ta-ble); l'ebraico conta i suoi punti vocalici; cinese, giapponese e coreano un segno per sillaba. Le parole latine si contano come inglesi, spagnole o italiane: dal nome della lingua nello stile, altrimenti dalle parolette del testo stesso.
- **L'arco**: le strofe numerate 1, 2, 3… (nessuna mancante, nessuna due volte, nessuna senza numero tra quelle numerate); dentro il ciclo di una strofa Verse › Pre-Chorus › Chorus › Post-Chorus, una sezione può mancare ma non tornare indietro; un Bridge o una parte strumentale riapre il ciclo; un Intro solo prima della canzone, nulla cantato dopo un Outro. I suoi errori: **Arco** (Arc to look at) in ambra, un clic porta al successivo.
- **Ctrl+F** nel testo o nello stile (e nei riquadri dello Scrittore) cerca solo in quel riquadro: Invio e Maiusc+Invio scorrono le corrispondenze, Esc dal campo di ricerca riporta il cursore con la corrispondenza selezionata; dal riquadro stesso (se hai cliccato altrove) chiude la ricerca e lascia il cursore dov'è, e ciò che scrivi intanto non sposta la vista. Il segno d'accento non ostacola la ricerca, ё è е, e о e а trovano anche ע e le o e a latine. **F4** o **Ctrl+H** apre una seconda riga per sostituire: **Invio** mette le parole nuove al posto della corrispondenza attuale e passa alla successiva, **Ctrl+Invio** (o *All*) sostituisce tutte le corrispondenze insieme, e un solo **Ctrl+Z** nel riquadro le riporta indietro; **Aa** (**Alt+C**) trova solo con maiuscole e minuscole come sono scritte.
- **Tag dopo «[»**: un «[» all'inizio di una riga del testo (del Creatore o dello Scrittore) apre i tag di sezione, come un editor di codice suggerisce le parole, nell'ordine in cui una canzone li attraversa, da Intro a End. Le lettere dopo il «[» restringono l'elenco (anche con la tastiera russa o ucraina), un numero numera il tag (`v2` è `[Verse 2]`), e se il testo numera le strofe si offre la successiva. ↑ ↓ scelgono, Invio o Tab mettono il tag su una riga sua (Ctrl+Z lo toglie), Esc o `]` chiudono l'elenco. Intro, Outro ed End già nel testo restano al loro posto, tenui, con la loro riga: ↑ ↓ ci arrivano e si legge che cosa sono, ma non si mettono due volte. Ctrl+Spazio apre l'elenco, e all'inizio di una riga scrive il «[» stesso. L'elenco sta in due colonne: i tag e, accanto, che cos'è quello in mano (con parole nostre, secondo la guida di Genius alle sezioni delle canzoni) e quante volte lo scrivono i 110 esempi ufficiali; il riquadro mantiene la sua misura mentre l'elenco si restringe. Le sezioni che nessuno di essi scrive sono segnate TEST. **Un secondo e un terzo tag** su una riga: un «[» scritto subito dopo il tag di una riga prende da solo il suo spazio e propone i tag che non sono sezioni (chi canta, come lo scrivono gli esempi; Female Vocals, Break e Silence segnati TEST); Invio lo mette sulla stessa riga, con il suo «…» selezionato per le tue parole; Ctrl+Spazio scrive « [» anche lì.
- **La mano fonetica** (di Viktor, da SUNO; YuE2 la segue allo stesso modo):
  - **Un segno d'accento** (l'acuto combinante, U+0301) dopo una vocale: `обе́щано`, `сули́т`. Tiene in circa il 90 % delle righe; il resto è fortuna del seme.
  - **Una vocale tonica maiuscola** spinge l'accento dove lo vuole la rima, contro il dizionario: `базилиО́`. Una maiuscola da sola, senza il segno (`дрОв`), di rado sposta l'accento.
  - **ע (ayin) dentro una parola russa** si canta come una o/a morbida, come il parlato vivo dice la o atona: `кעмо́рка`, `пעле́но`, `Ка́рлע`. Frena anche il rap che accelera sempre di più.
  - **Una o latina dentro una parola russa** canta una o dura e aperta dove il modello direbbe a: `Кo дну`.
  - **Una vocale allungata** (`о-о-о`, `БУ… РА… ТИ… НО`) tiene una nota; dove la musica ha spazio per lei, non in ogni riga.
  - **[Interlude]** tra le parti fa una pausa nel rap e frena il parlato che accelera sempre di più (non sempre).
  - **Le parentesi tonde** non sono un comando: una o due parole nella lingua del testo al loro interno si cantano per lo più come eco di coro; un'indicazione al loro interno (`(Music slowly fades)`) per lo più viene saltata, o cantata. Un comando va tra parentesi quadre.
  - **Voce principale e coro** (scoperta di Viktor, 20.10.2026): dividi il testo nelle righe della voce principale e nelle risposte del coro. Con `female choir backing` e `solo lead` nello stile, una riga breve tra parentesi tonde nella lingua della canzone la canta per lo più il coro, su una riga a sé o alla fine della riga della voce principale. Funzionano due modi: le parentesi semplici, il più stabile (`это же (божественный экстаз!)`), e `(Choir: …)`, che non attecchisce ogni volta; `(Choir backing: …)` fallisce del tutto. Con testi in inglese le parentesi semplici possono a volte inciampare. Divisa così, la voce principale esce con molta aria intorno. **Tre puntini** (`...`) dopo una parola fanno una breve pausa. Scritta così, una canzone può allungarsi (la sua è arrivata a 8:27) o, con le stesse parole, uscire più corta di prima, il che lascia spazio agli intermezzi strumentali.
  - **Una parola ebraica con i suoi punti vocalici** (`רוּחַ`) il modello la dice meglio che in traslitterazione.
  - **Le parentesi quadre sono un comando** per YuE2: una sezione, una voce, come si canta o si dice una riga. Qui c'è molto con cui giocare.
- **Voci** (non sono una sezione: le righe restano nella sezione prima). La forma di Viktor: `[Vocal: Female - …]` o `[Vocal: Male - …]` per una riga cantata, `[Spoken: Female - …]` o `[Spoken: Male - …]` per una detta; prima chi, dopo un trattino come (`[Spoken: Female - Soft Whisper, Intimate, Sacred]`). Un tag parlato può aprire la riga stessa: `[Spoken: Female - Soft Whisper] Ты слышишь?`. Su una lunga ballata con un adattatore di voce maschile e una narratrice (13.10.2026) YuE2 ha seguito questi tag circa il 95 % delle volte, con più costanza di SUNO. **Solo** non si sente in un tag di voce (gli esempi lo tengono per gli strumenti: `[Guitar Solo]`): nomina la voce. «[» li propone dopo le sezioni, segnati *non è una sezione*.
- **Una sillaba sposta tutta la canzone.** YuE2 legge il testo come un'unica catena prima di scrivere la musica: cambia una sillaba, delle «», un tag, e lo stesso seme prende un'altra strada da lì fino alla fine. Il seme è il dado, non la canzone. Per cambiare una riga e tenere il resto, sostituisci la sua sezione (clic destro sull'onda del lettore); per giudicare parole nuove, ascoltale su più semi.
- **Durata**: YuE2 regge una canzone di 8–9 minuti, più dei 6:15 di SUNO v6. *Durata massima* arriva a 15 minuti per una narrazione, ma oltre i 9 è fortuna del seme.

### VAE e LoRA <!-- #vae-and-loras -->

- Il **VAE** trasforma la canzone scritta in suono: **Standard** (il suono migliore), **Precedente** (quello dei benchmark), **Miscela** (una miscela dei due, un componente aggiuntivo). Un take finito può aggiungere più tardi un'altra decodifica dalla sua pagina. Si sceglie nel menu **☰**, sotto il modello, per le canzoni a venire; un take si decodifica di nuovo con un altro dalla sua scheda in pochi secondi (da rc2 ogni take conserva i suoi latenti; uno fatto prima rigenera il suo suono).
- **LoRA**: adattatori per la metà musicale, quella sonora o entrambe, ognuno con la sua forza: il cursore della metà musicale si apre con un accordo, quello della sonora con un'onda (il puntatore sopra dice quale). Un nome più lungo della sua colonna viene tagliato e si vede intero sotto il puntatore. **Aggiungi una LoRA** tiene gli adattatori che non sono nella canzone dietro una sola riga: una ricerca li trova con qualsiasi parola (il nome, il tipo, le metà, il tag, l'attivatore, la nota), i tipi li filtrano (*voce*, *canto*, *stile*, *strumento*, *partitura*), ogni tipo è una striscia a sinistra della tessera (la voce di uno speaker ne ha una seconda, colorata dalla prima lettera del nome, come i contatti di un telefono), due colonne su uno schermo 1080p e di più su uno più largo, il suo scorrimento oltre gli 800 px.

**L'onda di una LoRA.** Un adattatore spinge con la sua forza dal primo secondo all'ultimo: piatta. La piccola immagine in fondo alla sua riga apre la sua onda: **Piatta** la lascia così; **Arco** la fa salire alla forza piena a metà canzone e calare dolcemente ai due estremi; **Disegna** la modella a mano: trascina un punto in alto per un lampo, in basso per una dissolvenza, lungo la canzone per spostarlo; doppio clic aggiunge un punto, doppio clic su un punto lo toglie. La forza che imposti è la cima dell'onda; i due file di una coppia (la metà musicale e quella sonora) viaggiano su un'onda sola. La metà musicale la percorre token dopo token mentre la musica viene scritta, quella sonora fotogramma dopo fotogramma mentre si fa il suono, dall'inizio alla fine della durata della canzone; entra nella richiesta del take, così un take rifatto percorre la stessa onda, e la scheda del take dice *un'onda*. **Sezioni** lo fa suonare solo nelle sezioni che spunti, con una breve rampa a ogni confine: i confini vengono dalle battute della partitura quando la canzone ne ha una, altrimenti, a grandi linee, dalle righe del testo.

![L'onda di un adattatore vocale disegnata a mano: sale, si ferma, scende e ritorna](guide/lora-wave.png)

**La griglia dell'onda.** Il grafico conta la forza in quarti e il brano in minuti e secondi. Il suo tempo corre sulla durata impostata in **Uscita** (Durata massima), non sulla durata del brano stesso: il motore stende l'onda su quella durata. Scrivi in **Brano ≈** quanto durerà il brano, all'incirca: una linea tratteggiata ne segna la fine, e ciò che disegni dopo non si sente. **Shift** tiene sulla griglia il punto che trascini, un clic destro toglie un punto, e la lettura sopra il grafico dice dove sta il puntatore. Il pulsante accanto al nome delle LoRA le solleva sopra la pagina, fino a 1800 px di larghezza, per muovere i punti con precisione; Esc le rimette al loro posto. Imposta l'**Uscita** vicino alla durata che ti aspetti, perché l'onda si senta tutta: un take chiesto per 9:00 e finito a 6:37 ha lasciato non sentito l'ultimo quarto delle sue onde.

**Un arco emotivo.** Un adattatore vocale ad arco cresce verso il centro del brano e si spegne ai suoi estremi, e il brano respira con lui. In **In ordine**, quando due adattatori insieme passano la linea rossa, ciò che l'onda di quello sopra lascia, lo prende quello sotto: un duduk ad arco sopra una voce si passa il brano con lei. Si sente e si misura: in un take il cui adattatore di duduk era disegnato alto, poi basso, poi in salita, lo stem dei fiati separato dal brano ha seguito la stessa linea (−30 dB all'inizio, −59 dB a metà, −36 dB verso la fine).

![LoRA: ogni forza su una strada dal verde al rosso, e la metà musicale nell'insieme](guide/loras.png)

Ogni forza sta su una **strada**: il verde è sicuro, il giallo è il suo limite, il rosso è oltre. I limiti sono misurati:

- tutti gli adattatori allo stesso modo, a decimi sui cursori: la metà musicale verde fino a **0.4**, rossa da **0.5**, al massimo **0.75** (un adattatore di partitura, quello che pianifica ABC, tiene i suoi: verde fino a 1.0);
- la metà del suono verde fino a **0.6**, rossa da **0.75**, al massimo **1.0**;
- **Musica, nell'insieme** e **Suono, insieme**: gli adattatori impilati si sommano, e ciascuno può stare nel suo verde mentre la somma rompe la partitura. Mentre il modello scrive la partitura, la metà musicale insieme è verde fino a **1.2** e rossa a **1.4**, il suo massimo: sui piani dello studio (13–20.10.2026) fino a 1.0 insieme non se n'è rotto nessuno su 6, da 1.0 a 1.2 14 su 35 (su IRAEv3 8 su 10), oltre 1.2 8 su 9. Con una partitura nel modulo la metà musicale non ne scrive, e la barra arriva a 3.5 (intera fino a 2.25 sui take veri, rotta da 2.5). La metà del suono insieme è verde fino a 1.2, al massimo 1.5. Il piano ha in più un fusibile: in Piano completo senza una partitura tua, gli adattatori che insieme superano **1.0** (**0.8** su IRAEv3) pianificano la partitura ridotti in proporzione a quel valore, e la canzone si canta su di essa alle loro forze. Un piano rotto non si canta: con un seme musicale casuale si pianifica di nuovo una volta; dopo, o su un seme fisso, la finestra di Babele dice cosa ci ha pesato (gli adattatori, il modello base, il seme, il fusibile) e, a una parola, lo pianifica di nuovo con un seme nuovo.

**Budget.** Con due adattatori o più, sotto la strada sta **Budget**. Nessuna modalità accesa: niente budget, ognuno va con la sua forza, come prima; quella accesa, premuta di nuovo, lascia andare il budget. **Ripartire**: gli adattatori che spingono sugli stessi strati condividono un budget per metà, con la linea rossa come tetto; oltre, ognuno cede in proporzione. **In ordine**: la riga in alto prende per prima la sua forza, la successiva ciò che lascia la linea rossa, e ciò che un'onda lascia andare lo prende la successiva; trascina le righe per il nome per stabilirne l'ordine. Il motore tiene il budget in ogni momento della canzone. Quali adattatori condividono gli strati lo misura lo studio stesso: il suggerimento sul nome di un adattatore dice dove spinge (gli strati di ogni metà, attenzione contro MLP, quanto sposta uno strato a 1.0), e le note accanto al nome delle LoRA dicono quando due condividono gli strati e come tirano: nello stesso verso (insieme spingono più forte di quanto dicano le loro forze), l'uno contro l'altro o di traverso. Una forza che il budget trattiene mostra ciò che va davvero: il suo numero diventa ambra, la sua strada si spegne oltre il taglio e il suo suggerimento dice perché; **Musica, nell'insieme** e **Suono, insieme** mostrano ciò che va di quanto richiesto (la somma è la stessa nei due modi, le righe cambiano). I cursori si muovono a decimi; un doppio clic scrive i centesimi.

**Oltre i limiti.** La casella in fondo alla riga del budget lascia che ogni cursore superi il proprio massimo (la metà musicale fino a 1.5, quella sonora fino a 2), e anche quelli d'insieme; le strade tengono i loro colori, così il rosso misurato resta visibile, e il budget non trattiene nessuno. Serve per un adattatore la cui onda suona solo in parte della canzone (un duduk forte nell'intro, poi niente): non deve togliere la sua quota agli altri per tutta la canzone. La partitura si pianifica comunque con la metà musicale ridotta al fusibile del piano (1.0 insieme, 0.8 su IRAEv3) e si canta con le forze impostate. **Fuori dalla partitura** (clic destro su una riga): la sua metà musicale canta la partitura ma non la scrive; il piano si fa senza di lui e la riga dice *solo canta*.

**Doppio clic** su un numero per scrivere una forza esatta. Le indicazioni sotto il blocco dicono ciò che conta: una parola trigger che manca nello stile, un adattatore addestrato in un'altra modalità di pianificazione, una forza oltre il suo limite. Mentre il puntatore sta su un cursore o lo trascina, la forza esatta compare sopra il puntatore, nel colore della sua strada. L'adattatore Instrumental si ferma a 1.0, da dove parte: più su le sue partiture deragliano.

> **Un adattatore di partitura strumentale con parole da cantare.** Un adattatore del genere pianifica partiture *senza linea vocale*. A 1.00 ha dato un take con una sola nota in 127 battute vocali: il cantante parlava sopra due battute in loop. Con un testo, tienilo basso, da 0.3 a 0.5. Il ⚠ accanto al nome LoRA lo segnala quando succede.

### Profili e modalità di pianificazione <!-- #profiles-and-planning-modes -->

- **Profilo** imposta in un colpo la modalità, la durata, il campionamento, la guida, i passi, il VAE, le LoRA e l'uscita; i testi e i semi restano. *Salva profilo…* conserva le manopole attuali con un nome.
- **Modalità di pianificazione**:
  - **Piano completo**, quella predefinita: prima si scrivono melodia e accordi (una partitura modificabile), poi la canzone. La scelta migliore per canzoni nuove.
  - **Solo melodia**: un piano della melodia, accompagnamento libero. Consigliato per le cover.
  - **Diretto**: direttamente dal testo e dallo stile, senza partitura. Gli adattatori addestrati senza partitura vanno qui.
  - **Strumentale**: senza voci, la ricetta ufficiale di YuE2. Sta a destra nella riga della modalità di pianificazione.
- **Accordi**, sotto le modalità: *Spento*, *Delicato*, *Vario* o *Audace*, quanto possono allontanarsi gli accordi di una partitura che pianifica il modello. Da solo, il pianificatore tende a ripetere una stessa progressione per tutta la canzone; *Delicato*, *Vario* e *Audace* fanno tornare più tardi un accordo sentito tra i cambi recenti e tengono i primi accordi di una sezione lontani da quella precedente, e *Audace* lascia anche che un accordo esca dalla tonalità ogni tanto. Agiscono solo quando la partitura la scrive il modello: Piano completo o Solo melodia, senza una partitura tua o solo con il suo inizio. Misurato sul piano di una canzone: spento, sei accordi e la stessa serie di quattro accordi tredici volte; con la forza di *Vario*, nove accordi e la serie più frequente quattro volte. Sulla scia di Yeufonic, attraverso lo yue2.cpp di timoncool. *Delicato* è il predefinito.
- **Piano completo o Diretto.** La parola di Viktor dopo una settimana di canzoni: Diretto è il colpo o la cilecca di SUNO (circa due take buoni su cento, secondo il suo conto); Piano completo è la strada per tutti, anche senza leggere una nota di ABC: i tag sono rispettati, il suono si assesta, la dizione regge e il tempo si può prevedere. Misurato sul suo rap, quattordici take per modo con Whisper in ascolto: il miglior take di tutti è stato uno in Piano completo con la sua ricetta conservativa (l'84 % delle parole sentite, il 76 % nell'ultimo quarto). Dove Piano completo cede, cede alla fine: un take dura quanto la sua partitura, e il piano può avere meno sezioni del testo (allora gli ultimi versi restano fuori, o se ne ricanta uno precedente); dopo le ultime parole suonano le battute che avanzano nella partitura, e quelli sono i 10–15 s dopo la giusta dissolvenza di una canzone, non la guida (CFG). Ascolta la fine di un take in Piano completo: *End at…* taglia una coda, *Rigenera da…* riscrive una fine persa.

### Cover, remix e la tua partitura <!-- #covers-remixes-and-your-own-score -->

- **Cover o remix**: prendi la melodia di una registrazione (*Trascrivi*: solo la sua melodia, non le parole né il cantante), o la melodia di uno dei tuoi take, e dalle un nuovo stile.
- **Allinea le sezioni** (accanto a *Trascrivi*, una volta che la partitura della registrazione è dentro): Whisper sente dove comincia ogni blocco del tuo testo nella registrazione, e ogni blocco prende l'etichetta della sezione della partitura in cui è cantato. Le parole non cambiano: un blocco già nominato per il suo tipo tiene la sua etichetta, uno non sentito tiene il suo posto (incerto), un ritornello scritto una volta viene copiato dove è cantato di nuovo, e le sezioni dove la voce non canta ricevono un'etichetta vuota. Vedi la proposta, e puoi modificarla, prima che entri nel modulo; il testo che c'era è tenuto come versione. Sulle orme di YuE2-Studio di timoncool e di Cover Studio di HOT-Step.
- **La tua partitura**: una partitura ABC, seguita in Piano completo e in Solo melodia. Trasponila (alla più vicina, in su o in giù), sposta una voce per gradi della scala, importa un file MIDI (una linea melodica per voce), esporta MIDI o marcatori per una DAW, carica un esempio, rendila strumentale. **Generate** con una partitura qui chiede prima: su questa partitura o una nuova (il campo si svuota e il modello della canzone ne scrive una). La partitura ricorda gli adattatori e le forze di musica con cui è stata scritta (un piano, la partitura propria di un take); quando quelli di adesso sono diversi, lo dice una riga sotto e la domanda stessa: con altre forze la musica può staccarsi dalla partitura, soprattutto in Industrial Rock e negli strumentali. In Full la partitura resta aperta finché contiene qualcosa. **Solo l'inizio**, sotto la partitura: la partitura nel riquadro è solo l'inizio della canzone, qualche battuta suonata sul piano roll o su una tastiera MIDI, canticchiata e scritta dal suono, o digitata, e il modello pianifica da lì il resto della canzone, nella sua tonalità e nel suo metro; tutta la partitura, prima il tuo inizio, viene cantata e resta quella del take. Piano completo o Solo melodia; *Accordi* guida ciò che il modello aggiunge. Sulla scia dell'hum-to-song di Mothersuperior, attraverso lo yue2.cpp di timoncool.
- **Il piano roll** (il pulsante con un pentagramma, accanto a *Togli la partitura*): la partitura su tutta la finestra. Sopra, la partitura su carta due volte: come l'ha scritta YuE2 e com'è ora. Sotto, il tempo scorre verso il basso fino a due tastiere, quella di Vocal sopra quella di Ins; i tasti della stessa misura su ogni schermo, le ottave oltre in attesa ai bordi (una piccola tastiera di esse al passaggio del puntatore). Un clic scrive una nota lunga quanto la griglia, trascinare la sposta, il bordo inferiore la allunga, clic destro o Canc la toglie; una voce di YuE2 canta una nota alla volta, quindi una nota posata su un'altra la fa cedere. Le sillabe del testo stanno sulle note di Vocal. **Shift** e tasti insieme fanno un accordo sulla battuta del cursore; i tasti del computer suonano un'ottava e mezza (bianchi su A…', neri su W…], Z e X un'ottava), suona anche una tastiera MIDI (**MIDI**), e con **Rec** il tasto suonato si scrive al cursore. **Riproduci** (Spazio) suona dal cursore, l'originale o il modificato, Ins come tasti, Vocal cantato coi nomi delle note, o entrambi. **Scrivi nella partitura** riscrive solo le righe cambiate. Di notte la carta è scura, di giorno grigia. Le carte seguono la corsia (la riproduzione, il cursore o dove la corsia è stata fatta scorrere), la battuta in mano illuminata su entrambe; una carta fatta scorrere a mano si porta dietro l'altra e la corsia, e un clic su una nota della carta mette il cursore sulla sua battuta. Ins suona come un pianoforte a coda; Vocal canta le vocali stesse, a, e, i, o, u, come le tengono i cantanti di VocalSet, senza rumore prima di esse. **Suono ▾**, accanto a **Play**, ha il **Pedale** (*Note lunghe*, il predefinito: una nota di un tempo o più continua a suonare dopo la sua fine, spegnendosi, finché il pedale non si cambia alla stanghetta successiva; *Sempre*: ogni nota; *Spento*), l'**Acustica** attorno al pianoforte e alla voce (*Asciutto*, *Stanza*, *Sala*) e il **Coperchio** del pianoforte a coda (*Aperto*; *Chiuso*, più scuro e morbido). La guida dei tasti sta tenue sulle ottave basse della corsia; la sua casella la chiude. **Motore → Hardware → MIDI** accende il MIDI per tutto lo studio: una tastiera suona nel roll, la porta DAW di un M-Audio Oxygen (Mackie Control) guida Play, Stop e Record. Il browser dà il MIDI solo a una pagina aperta come localhost o in https: da un altro computer, `ssh -L 7777:localhost:7777` verso la macchina dello studio e apri http://localhost:7777. Le frecce ai capi delle tastiere spostano i tasti di un'ottava e ◎ li riporta sulle note della partitura; una leva tra le carte e il roll dà più spazio all'una o all'altro (conservata; un doppio clic: come all'inizio), e su uno schermo alto i tasti di Ins prendono la lunghezza propria di un pianoforte a coda. **Riproduci** suona al tempo accanto (una partitura a tempo libero non ne ha, quindi il roll prende l'ultimo impostato), e ↑ riporta una carta al suo inizio. Vocal canta una frase come una voce sola, sulle sillabe del testo o su *Do Re Mi*. La rotella del pitch di una tastiera MIDI muove il cursore nel tempo e quella di modulazione imposta la durata di una nota nuova. **⇅ Trasponi**: trascina lungo i numeri di battuta a sinistra per scegliere un segmento, e disegna lo spostamento su una linea di punti, di un semitono, un quarto, un terzo o mezza ottava, un'ottava o due, a gradini o morbido; *In minore* o *In maggiore* volge una parte con i suoi accordi, *In tonalità* tiene le sue note nella tonalità; *Applica* è un solo passo da annullare. Il numero di tasti nella testata apre la sua lista: quanti tasti ha la propria tastiera MIDI (88, 61, 37 o 25, ognuno dice cos'è) e quali ottave sono in vista; il tempo, un pulsante in grassetto accanto a **Play**, apre la sua: −4, −1, +1, +4, un cursore e quello della partitura. Senza battute scelte, **⇅ Transpose** prende la sezione al cursore. Il testo sta anche sotto il pentagramma Vocal di entrambi i fogli, e le poche note che l'intro dà alla voce prima della strofa cantano le prime sillabe della strofa. Una partitura in cui YuE2 ha scritto una battuta fuori misura (18/16, per esempio) si apre lo stesso: il roll legge quella battuta pareggiata (ciò che avanza tagliato, una battuta corta completata con una pausa) e lo dice, e una riga che lasci torna come l'ha scritta YuE2. Le parole del foglio sono in Noto Sans, stretta come in una partitura stampata: i nomi delle voci al 76 %, accordi e testo al 90 %.
- **Recitare il testo su una partitura** (*Lay the lyrics on this score…*, sotto la partitura quando si legge): il narratore del promo dello studio, per le tue parole. Ogni riga va sulle battute della partitura, una sillaba un ottavo (un sedicesimo, come si dice il rap, dove con gli ottavi resterebbero righe fuori) su un suono dell'accordo della sua battuta, un respiro dopo una virgola e un punto, l'ultima sillaba della riga un quarto più in basso; ogni sezione comincia su una frase di due battute dopo una battuta di pausa, o dopo un vocalizzo se lo spunti. Strumenti, accordi, tonalità e tempo restano; le sezioni della partitura seguono i tuoi tag, con un intro e un outro intorno. Per spoken word, letture e rap su una base: fai la base, *Scrivila dal suono*, poi questo; chiede prima, e Ctrl+Z in ogni casella riporta il testo di prima.
- **Base di accordi** (*Base di accordi* sotto la partitura: la tonalità, il metro, il tempo e *Scrivi una base*): una partitura senza melodia, solo la sua ossatura. Ogni sezione del tuo testo riceve battute, circa 2.5 s per riga cantata a coppie di battute, uno stacco, un'intro e un finale qualche battuta propria, e ogni battuta un accordo; le battute della voce sono pause, quelle degli strumenti vuote. La tonalità e il tempo vengono dallo stile quando li nomina, e ogni pressione estrae nuove progressioni: una per le strofe, un'altra per i ritornelli, una terza per i ponti. La modalità di pianificazione passa a *Piano completo*. Il modello scrive da sé la melodia e canta le tue parole su quell'armonia: tu scegli gli accordi e la forma, lui trova il motivo. Misurato su due take (22.10.2026): il suono ha seguito gli accordi della base battuta per battuta, più da vicino di tutti i 300 rimescolamenti degli stessi accordi e degli stessi accordi in qualsiasi altra tonalità; ha cantato sopra le pause (la voce nel 75 % e nel 34 % dei frame, contro il 79 % e il 49 % su una partitura pianificata); e un take non resta legato alla durata della base: entrambi sono durati circa 70 s su una base di 40 s e sono andati avanti con la sua ultima progressione. Portato da YuE2-Studio di timoncool (MIT).

### Campionamento e riduzione del rumore <!-- #sampling-and-denoising -->

![Campionamento: il pianificatore della partitura e i token musicali, i limiti dei token bloccati](guide/sampling.png)

I valori predefiniti sono già tarati. Le tre righe di **forma** (Composizione, Interpretazione, Influenza dello stile) muovono le manopole insieme, in cinque passi; le manopole vere e proprie sono più sotto.

- **Pianificatore della partitura** e **Token musicali**: temperatura, top-p, top-k, penalità di ripetizione, finestra della penalità.
- **Token minimi** e **Token massimi** sono **bloccati** contro una modifica involontaria: fai clic sul 🔒 accanto al nome per cambiarli, e di nuovo per bloccarli. I minimi sono fusibili: una partitura non può finire prima di 200 token, la musica non prima di 750 (30 secondi; una durata richiesta più breve lo abbassa a quella durata). Il massimo della musica appare come **Durata massima**, in tempo (25 token al secondo), senza lucchetto: è al più la durata della canzone, e si imposta solo qui («Suono e uscita» non ha un campo per la durata).
- Ogni manopola è tenuta entro limiti sensati; un valore oltre viene riportato indietro, e la pagina lo dice.
- **Guida (CFG)**: la guida della musica, la spinta dello stile nella fase della musica; 1.6 per impostazione predefinita in ogni modalità.
- **Guida del testo**: quella propria del testo, a parte lo stile: un terzo ramo, il prompt senza testo, accanto ai due che la guida ha sempre avuto; 2.2 predefinito. L'orecchio di Viktor su una canzone popolare: guida 4.0 con il testo a 2.2 la più brillante, 3.0 con 2.2 altrettanto, 3.0 con 1.6 una profondità sua, il testo a 2.6 porta avanti lo shaker; a 1.6 le parole si sciolgono, vellutate. Uguali, metà del testo scivola nell'allucinazione, si perde la С (s) e l'accento delle vocali si storce: tieni le due 0.4–1.0 distanti. Una luce accanto a ogni campo lo dice: verde dentro il suo intervallo (la musica 1.0–4.0, il testo 1.0–2.6, distanti di 0.4 o più), ambra poco oltre, rossa molto oltre; nulla viene bloccato. Vuoto, il testo segue la guida, come prima.
- **Suono e uscita**, la sezione inferiore dello stesso blocco: **Passi di riduzione del rumore** e **Risolutore** per la metà sonora, **Formato** (WAV a 24 bit, 16 bit, 32 bit in virgola mobile o MP3 con il suo bitrate) e **Taglio dei picchi**; *Ripristina l'uscita* li riporta. Tra i risolutori, *Midpoint · versione ufficiale* e *Heun* chiamano la rete due volte per passo, *Multistep · AB2* (Adams–Bashforth del secondo ordine: riusa il passo precedente) una volta per passo, ed *Euler · bozza* una volta, del primo ordine. Dopo di loro, **Decodifica del suono**: *Brano intero · standard* (il predefinito e l'unica decodifica in ogni altro punto dello Studio) o *Scala · sperimentale*: la metà del suono in pezzi uguali di circa 20 s, ognuno sente 2 s oltre i suoi bordi, le giunture in dissolvenza incrociata; con gli stessi codici e semi esce vicina alla decodifica del brano intero, non uguale.

**Una ricetta prudente per il russo** (di Viktor, a orecchio): Composition *low*, Performance *low*, Style influence *high*: il pianificatore della partitura a temperatura 0.85, top-p 0.92, top-k 40, i token musicali a 0.85, 0.93, 80, le penalità di ripetizione 1.005 e 1.3 su una finestra di 100, guida 1.6 con quella propria del testo 2.2; 32 passi di riduzione del rumore con Midpoint. Nessuna accelerazione, rap a un ritmo moderato. È il profilo integrato *Musical Heresy of Creator's Ear*, che regola Viktor: Salva sopra di esso nei profili tiene i suoi valori su Forge, Elimina riporta questi.

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
- **Rifai**: *Nuovo take* (un take nuovo dalla stessa richiesta), *Usa come base* (la richiesta di nuovo nel modulo), *Rifai il suono* (la stessa musica, suono nuovo), *Rigenera da…* (tieni l'inizio, riscrivi il resto), *Trascrivi questo take*, *Taglia al testo* (taglia una coda dopo l'ultima riga cantata), *End at…* (il take finisce nel momento che scegli, con gli ultimi 2 s in dissolvenza; dai suoi latenti conservati, in pochi secondi), *Fade in…* (i primi secondi salgono dal silenzio, 2 s se non dici altrimenti; allo stesso modo). *Estendi…* tiene il take intero e lo continua oltre la sua fine, da 0:15 a 2:00 in più, con nuove righe dopo le sue se le dai (un take pianificato con una partitura continua in Direct: la sua partitura finisce dove finisce il take).
- **Modifica** (ogni volta un nuovo take; questo resta): *Ritaglia…* tiene il tratto da una sezione a un'altra; *Togli una sezione…* toglie sezioni; *Ripeti una sezione…* suona le sezioni spuntate due volte, la copia subito dopo (l'ultimo ritornello ancora una volta); *Inserisci una parte…* mette la copia di una sezione dopo un'altra (un'intro o uno stacco come interludio); *Velocità…* lo rende più veloce o più lento, l'intonazione resta. Tutto sulle stanghette della partitura (quella del take o quella scritta dal suo suono), ogni giunzione guarita da una breve dissolvenza incrociata, la partitura unita insieme. Ognuno di questi dialoghi, come quelli del menu dell'onda, mostra la forma d'onda del take con i tratti segnati: cosa si copia, dove entra, cosa va via e cosa resta, seguendo le tue spunte.
- **Rifinitore**: *Spettro*, *Verifica del testo*. **File**: la richiesta e la partitura. *Loop…*: 1, 2, 4 o 8 battute sulle stanghette della partitura dalla battuta dove sta il player, senza cucitura (la fine scorre nell'inizio), salvato come WAV con tempo e tonalità nel nome.
- **Nota**: cosa funziona, cosa sistemare, dove va.
- La scheda sotto dice come è stato fatto: modalità, formato, VAE, modello, passi, la forma, le LoRA con le loro forze e le loro onde, entrambi i semi (copiali per ripeterlo).
- **Sopra la stanza** (⤡) il take sta in due colonne: cosa farne, il suo stile e il suo testo a sinistra; come è stato fatto, il suo VAE e la sua partitura a destra. Un take nuovo si apre con Style e Lyrics chiusi; gli strumenti stanno in gruppi incorniciati.

![Come è stato fatto un take](guide/take-info.png)

### Sostituire una sezione <!-- #replace-a-section -->

Quando lo studio ha collocato a orecchio il testo di un take (le sezioni disegnate sull'onda del player), una sezione può essere cantata di nuovo mentre il resto rimane com'era. Clic destro sull'onda sopra la sezione → **Sostituisci questa sezione…**.

- **Cosa si canta**: ogni sezione sentita chiaramente è un chip; quella che hai cliccato è spuntata, e puoi spuntarne altre, fino a otto. Ogni sezione spuntata mostra i suoi versi come sono nel testo: cambia le parole, oppure tienile e lascia nuova solo la musica. Il dialogo avvisa quando le nuove parole hanno più sillabe di quante ne aveva la sezione (il modello le canta più in fretta o supera il taglio) o meno. **Cantala di nuovo** la avvia.
- **Cosa arriva**: una o due versioni, ciascuna un take a sé e figlio di questo, con il nome della sezione e del suo tratto («Song · Chorus 1:02–1:25 anew A»). Arrivano nello spazio di lavoro del take (in «Sostituire una sezione» quando quello non accetta take nuovi) e compaiono nei Take man mano che ognuna è pronta.
- **Come si unisce**: i tagli cadono nelle pause sentite intorno alla sezione. La musica del take fino al primo taglio resta, la sezione è cantata con un nuovo seme della musica, unita alla musica del take dopo di essa nei token del modello stesso, e il tutto è renderizzato di nuovo con il seme del suono del take: ciò che non è sostituito suona come suonava, e le giunture non si sentono. Più sezioni sono cantate a turno e la durata resta la stessa, così i tagli successivi restano dove li hai sentiti.
- **Sul player** il nuovo tratto è colorato e bordato, con «di nuovo» sopra; la sua scheda dice che il resto è come l'ha fatto il take da cui viene.
- **Le piccole modifiche riescono meglio**: un verso con le stesse sillabe, una parola, un tag. Un seme nuovo può anche cantare una sezione senza le sue parole: ascolta entrambe le versioni. Un controllo che ogni versione abbia cantato le sue parole arriva nella 2.1.0.
- **Cantala ancora una volta…** e **Inserisci un interludio dopo…** (lo stesso menu): la sezione viene cantata di nuovo subito dopo se stessa, all'istante o dopo circa 4 o 7 s di musica, una variazione con il seme musicale del take + 1 (e + 2), non una copia; oppure circa 5, 7 o 10 s di musica dopo di essa, senza cantare nulla di nuovo. Il modello suona quanto vuole, quindi lo studio taglia secondo la voce della bozza stessa, separata sul processore, e sulle stanghette della partitura: entrano battute intere della sua musica (dal mezzo, se ha suonato di più), e la musica del take dopo di esse prosegue nel suo battito. Take nuovi; questo resta.
- **Ricanta questa riga…** (lo stesso menu, sopra una riga): solo quella riga viene ricantata con un nuovo seme musicale, le parole cambiate o le stesse, tagliata a metà strada dalle righe vicine; il resto del take resta com'era. Dove le righe si legano senza respiro tra loro, ascolta entrambe le versioni.
- **Canta di nuovo una finestra…** (lo stesso menu, ovunque sull'onda, senza sezioni): un tratto che posi trascinando sull'onda della take è cantato di nuovo con adattatori suoi: all'inizio quelli della take stessa, ciascuno con la sua forza di musica e di suono e la sua onda sulla finestra (piatta, arco, salita, discesa), e puoi aggiungerne altri dalla tua cartella loras/. Sulle rampe prima e dopo (2 s ciascuna all'inizio) gli adattatori della take cedono a quelli della finestra e tornano, così il cambio entra ed esce invece di scattare; il resto della take resta com'era, renderizzato di nuovo con il suo seme del suono. Una o due versioni, figlie della take, segnate nel player come una sezione sostituita.

### La partitura <!-- #the-score -->

Il piano del take come pentagramma o come ABC: stampalo in PDF (US Letter, verticale o orizzontale), esporta MIDI o marcatori, *Modifica e rifai*, o aprilo a schermo intero.

## Scrittore <!-- #writer -->

### Le canzoni come documenti <!-- #songs-as-documents -->

![Lo Scrittore](guide/studio-writer.png)

Ogni canzone può vivere nello Scrittore come un documento: il suo **stile**, il suo **testo**, le sue **note** (Markdown, con anteprima) e i suoi **parametri** (ogni manopola del modulo del Creatore). *Nuovo*, *Dal Creatore* (il modulo così com'è), *Carica nel Creatore*.

- **Versioni**: *Conserva questa versione* in qualsiasi momento; *Ripristina questa versione* o prendila *Come nuovo documento*.
- **La larghezza dell'elenco**: trascina il bordo tra l'elenco e il documento (← → dalla tastiera, un doppio clic per la sua larghezza iniziale).
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

I passi sono nodi sulla tela qui sotto, di tre specie come procede il lavoro: **Analisi** (Spettro, Artefatti, Testo), **Ripristino** (Antironzio, Upscale, Stem) e **Finitura** (DAW, Remaster). Un clic su un nodo apre il suo passo in una finestra sopra la tela, e ciò che è fatto dal take pende dal suo albero. I passi propri di un plugin entrano in **Finitura** con un bordo tratteggiato (vedi `docs/PLUGINS.md`). Un passo di un plugin segnato **GPU** gira su una scheda dei lavori del laboratorio, a suo turno, e un passo fatto per un tipo di file (per esempio, uno stem di voce) prende da sé come sorgente l'ultimo file di quel tipo, finché non ne scegli un altro.

Tutto ciò che nasce da un take pende dal suo **albero** (*Nato da questo take*), il più nuovo in cima: prima **l'originale**, con il suo lettore e il suo FLAC, poi ogni ramo, riproducibile e utilizzabile come sorgente del passo successivo. Ciò che gira si vede dove guardi: nella testata della stanza, in cima al blocco del passo stesso e come un punto che pulsa sulla sua scheda. Il blocco di ogni passo elenca ciò che ha fatto per il take (*Creato qui*: un clic lo trova nell'albero), e il passo aperto illumina i propri rami. **Elimina**, in fondo alla testata di un ramo, lo porta nel cestino del take (chiedendo; un ramo da cui ne sono nati altri chiede di nuovo e li porta con sé); **Cestino**, sotto l'albero, ne riporta uno, e **Svuota il cestino** elimina per sempre. L'albero ha il suo posto alla fine della colonna dei passi del Rifinitore: **Nato da questo take** sotto *Questo take*, sul suo segno il numero dei rami; un clic lo apre dove sta un passo, e accende i rami del passo da cui vieni. Ciò che gira su Forge ha anche la sua barra sopra il lettore in ogni stanza, con il tempo che manca. Con un monitor salvato in **Audio I/O** (una seconda uscita su Forge), ogni riga ha **Su Forge**: il file suona da lì, da dove si trova il suo lettore, e di nuovo lo ferma.

**Confronta tutte** (sulla riga dell'originale, o *Confronta* su qualsiasi ramo) apre ogni versione in un solo lettore, come SUNO passa da una versione all'altra: l'originale, quello passato dall'antironzio, i remaster, gli upscale, gli stem. Un clic su un'altra versione, o il suo numero (1–9), la riproduce **dallo stesso secondo**; la barra spaziatrice riproduce e mette in pausa, ← → spostano di cinque secondi, Esc chiude. C'è anche, dopo l'originale, la stessa musica in altri take: i suoi ri-renderizzati con un altro VAE o un altro seme sonoro, ognuno con il suo VAE, il suo seme e quando è stato fatto; un take segnato «non mi piace» non compare. Con **Volume uguale** (attivo finché non lo spegni) ogni versione è abbassata al volume della più quieta, misurato su Forge, e la sua riga lo dice: l'orecchio confronta il suono, non il livello.

### Importa una traccia <!-- #import-a-track -->

WAV, FLAC, MP3… da ovunque: diventa un take della libreria (48 kHz, 24 bit), segnato come *importato*, pronto per stem, remaster e il resto. Il testo è facoltativo; la verifica del testo confronta con esso.

### I passi <!-- #the-steps -->

![I passi](guide/post-steps.png)

Nessuna catena già fatta: il percorso del take lo tracci tu sulla tela, da nodo a nodo (vedi *Il tuo percorso* più sotto), o parti da una pipeline, ed **Esegui il percorso** nella testata della stanza lo esegue. Su un percorso che separa gli stem dal take dopo l'Antironzio (e l'Upscale), il remaster li mixa, così il suo preset e il de-esser agiscono anche lì; un upscale prima della separazione fa sentire ai separatori l'intera canzone, e uno alla fine ridisegna la parte alta che lasciano gli stem e il remaster (un fruscio sopra i 20 kHz, quasi nulla sopra i 22). Uno per uno:

1. **Spettro**: spettrogramma, spettro medio, energia per bande; sovrapponi un altro take per confrontare.
2. **Artefatti**: un tono che non se ne va, il ronzio a 25 frame del VAE negli acuti, clic, clipping, buchi, uno stereo che si fa la guerra da solo. Un clic su un tempo riproduce da lì.
3. **Antironzio**: il decoder di YuE2 scrive il suono in frame di 1920 campioni, 25 al secondo, e i suoi acuti tremano con essi. Questo passo toglie la parte legata a quell'orologio dei frame sopra i 2 kHz. 80 % è la scelta dell'orecchio; 100 % assottiglia l'attacco.
4. **Testo**: Whisper ascolta e confronta ciò che sente con il tuo testo, minuto per minuto; *Sincronizza le righe* per i tempi del karaoke. Sullo stem vocale sente le parole senza la musica. Le righe temporizzate si scaricano come .lrc e .srt, e come **.lrc (per parola)**, con ogni parola nel suo tempo, per un lettore che accompagna il canto (le righe restano tue; da Whisper vengono solo i tempi).
5. **Stem**: quattro stem (BS-Roformer per la voce, poi htdemucs_ft per batteria, basso e il resto; anche lo strumentale), sei stem (la stessa voce, poi il BS-Roformer-SW di jarredou: batteria, basso, chitarra, piano e il resto), otto stem (i sei, con la voce in due da un modello karaoke, **Lead Vocal** e **Backing Vocals**, e i fiati tolti dal resto), o voce + strumentale. Ogni stem porta il suo nome proprio (Lead Vocal, Drums, Winds…) nell'albero, nel suo download e nella tua DAW. *Sorgente* è il take o un suo file dopo l'Antironzio o l'Upscale, ogni sorgente con il suo set; nella tua DAW va il set più recente di ogni tipo.
6. **Remaster**: mixa gli stem o usa il take così com'è; pulizia, de-esser, a scelta riaccordatura 440 → 432 Hz, loudness (LUFS) e true peak. Ogni passata è un nuovo ramo. Il preset e il de-esser agiscono sugli stem prima del mix: con il take o un qualsiasi file singolo come sorgente sono spenti, e su un percorso agiscono quando esso separa gli stem.
7. **Upscale**: UniverSR ridisegna la parte alta dello spettro; l'originale resta campione per campione sotto il taglio. Su un remaster (l'ultimo passo di un percorso) l'intero file si abbassa se la nuova parte alta supera il tetto di true peak del remaster.
8. **Passaggio digitale**: il take o qualsiasi ramo attraverso un carattere analogico in numeri su Forge: nastro (30, 15, 7.5 o 3.75 ips: la gobba della testina, gli acuti, il fruscio, wow e flutter, l'azimut), console, valvola (con il suo cedimento), trasformatore o vinile (bassi in mono, crepitio, rombo). La curva gira sovracampionata; il risultato è forte com'è arrivato, il suo picco reale sotto −0.3 dBTP, e l'albero dice cosa aggiunge a un tono a −12 dBFS. I punti di partenza impostano un carattere con un clic; un suo ramo può essere la sorgente del passaggio analogico o del Remaster.
9. **Voce principale intera**: su un set di otto stem, dove la separazione ha messo la voce principale in Backing Vocals (più forte lì che nella principale, abbastanza forte e al centro), torna in Lead Vocal con brevi rampe. Principale e cori insieme restano quel che erano, campione per campione: il mix non cambia, cambia solo quale stem porta la voce. Entrambi tornano come versioni dei loro stem per il DAW e i passi successivi del percorso; l'albero dice dove è tornata la voce e per quanti secondi.
10. **Upscale delle voci**: UniverSR solo sugli stem delle voci (principale e cori, o la sola principale) ridisegna l'aria, il respiro e il filo delle consonanti che i separatori hanno smorzato; il resto sotto il taglio resta campione per campione. Ognuno torna alla frequenza del suo set come versione del suo stem. Il suo **Upscaler** è UniverSR da solo (il predefinito) o il gruppo dei tre, UniverSR, Apollo-vocal e FlashSR, fusi sopra il taglio: in media (misurata la più vicina agli acuti propri di una voce), il più forte, o aria (media fino a 16 kHz, il più forte sopra); **Acuti disegnati** alza o abbassa ciò che hanno disegnato. Lo usano le pipeline *Voci: delicato, normale, alto, aria, brillante*. Apollo-vocal è non commerciale (CC BY-NC-SA 4.0): una canzone fatta con esso è tua da condividere, non da vendere; FlashSR arriva al primo uso: i pesi dai modelli dello studio stesso (Apache 2.0, come ha dichiarato il suo autore) e il codice da lui.
11. **Prima e dopo**: qualsiasi file dell'albero contro ciò da cui è stato fatto (un mix o un remaster di stem contro il file da cui gli stem sono stati separati; il take quando non c'è altro), con un pulsante proprio su ogni file: loudness, picco vero, gamma di loudness, fattore di cresta, ampiezza, correlazione e la quota di quattro bande fianco a fianco, gli spettri medi a pari loudness e la loro differenza, e la loudness a breve termine lungo la canzone; un'immagine e una pagina di numeri arrivano nell'albero.
12. **Adatta a un riferimento**: il timbro di un file si sposta verso quello di un riferimento (un file dell'albero di questo take o un altro take), lasciando da parte la loudness: fino a otto bande del DAW stesso (frequenza, guadagno, Q), ognuna tenuta solo se aiuta e resta entro il limite che imposti. Il file torna con lo stesso equalizzatore renderizzato, forte come è arrivato o come il riferimento e mai oltre −1 dBTP; **Sul master del DAW** del suo ramo mette le bande sull'equalizzatore del master per sentirle dal vivo sul tuo mix.
13. **Mono sui bassi**: sotto una frequenza (120 Hz se non ne scegli un'altra) il lato dello stereo viene tolto, senza sfasamento, il centro com'era: basso e cassa stanno al centro, e lo stereo sopra resta dove vive. Il primo strumento di Shaumarov sul bus degli strumenti e sul master; il ramo dice quanta parte dei bassi era lato prima e dopo.
14. **Colla dei picchi**: un compressore gentile prima di tutto: solo i momenti forti perdono i dB chiesti (3 se non ne scegli altri), i transienti più netti passano e il file torna forte come era. Non tiene un soffitto: è compito del passo seguente.
15. **Soffitto true peak**: l'ultimo passo di un percorso: un limiter con sovracampionamento e anticipo tiene −0.5 dBTP (o −0.3, −1), controllato da un misuratore true peak. *com'è arrivato* prende solo gli sforamenti al volume proprio del file; un obiettivo di volume (−14, −11, −9 LUFS) spinge dentro, con al massimo 6 dB di limitazione.
16. **Domatore della voce**: sugli stem della voce, dove lo spettro della voce in quell'istante si gonfia sopra il proprio andamento (una risonanza, un armonico aspro: il lupo nella voce), la gobba si abbassa di una parte di quanto sporge, 4 dB al massimo se non ne scegli un altro, con entrata e uscita dolci; di base solo ciò che sale sopra il colore abituale della voce stessa, e nulla sotto 2.5 kHz, dove vivono le vocali. Ciò che non sporge non viene toccato; una «s» che fischia si ammorbidisce dove fischia e non si accorcia mai; un solo guadagno per entrambi i canali tiene la voce dov'era. soothe2 e SpecCraft di Shaumarov come spunto; il ramo dice per quanto tempo ha agito e dove.
17. **Attacco e corpo della voce**: sugli stem della voce l'inizio delle parole si alza un poco (2 dB al massimo) e lo spegnersi di un suono anche un poco (1.5 dB); una vocale tenuta e il silenzio restano come sono: la voce viene avanti senza la stretta di un compressore. I due compressori di transienti di Shaumarov sulla voce come spunto.
18. **Basso sotto la cassa**: la cassa si trova nello stem della batteria; mentre suona, l'ottava grave dello stem del basso (sotto 120 Hz se non ne scegli un'altra, divisa a fase zero) scende fino a 3 dB, quanto è forte la cassa; tra una cassa e l'altra e sopra la divisione il basso resta com'era. Serve un set con batteria e basso separati; il soothe2 di Shaumarov comandato dalla cassa come spunto.
19. **Dettagli in su**: tre bande; in ciascuna i momenti piano si alzano verso il proprio livello forte, quelli forti non vengono mai spinti giù, il fondo e il fruscio restano; miscelato al 10 % come Shaumarov usa OTT, poi riportato al volume con cui è arrivato: sale il dettaglio sotto le parti forti, non il livello.

**Pipeline.** Accanto a **Esegui il percorso** sta il percorso in mano: **Il mio percorso** o una pipeline da cui partire. Lo studio porta *Lucidatura rapida*, *Canzone: stem e remaster*, *Canzone: il mio mix nel DAW*, *Canzone: tutta l'aria*, *Nastro caldo*, *Parlato* e *Solo sguardo*, e un plugin può portare le sue. Una pipeline è disegnata sulla tela da nodo a nodo; *Salta nel percorso* nel clic destro di un nodo salta uno dei suoi passi. Ogni passo prende ciò che ha fatto il precedente, un file o il set di stem com'è stato corretto fin lì, così il Remaster e il DAW mixano la voce principale intera e le voci ridisegnate, non gli stem come sono stati separati. *Come è impostato il DAW* prende il mix che il DAW tiene per questo take. I cavi di una pipeline si tagliano e si tendono di nuovo come quelli del tuo percorso: il primo taglio o cavo la rende **Il mio percorso**.

**Molti take.** **Sullo spazio…** accanto a **Esegui il percorso** esegue il percorso in mano su ogni take dello spazio in mano, o di tutta la libreria quando non ce n'è, uno dopo l'altro su Forge, dopo aver chiesto; il menu del Bibliotecario sui take spuntati ha **Rifinisci N lungo il percorso**. La riga del lotto accanto dice a che punto è, cosa è fallito e quale take è in corso; **Ferma** lascia finire quel take e salta gli altri.

### La tela: nodi e cavi <!-- #the-canvas-nodes-and-wires -->

![Il Rifinitore come tela: ogni passo un nodo, cablato come va il suono](guide/studio-post-canvas.png)

Il Rifinitore è una tela di nodi, come ComfyUI dispone i suoi: il take e ogni passo in colonne come procede il lavoro, collegati dove va il suono, e in basso a sinistra ciò che li alimenta, Importa una traccia e Audio I/O; in basso a destra **Nato da questo take**, la sua finestra l'albero di ogni file nato dal take. Tutta la stanza sta in una schermata a 1080p (in una finestra stretta le colonne vanno in due fasce da tre). I nodi sono numerati come scorre il lavoro, prima i passi del percorso, e **1…9, 0** aprono il nodo di quel numero, e due cifre entro mezzo secondo uno oltre il decimo (**1** poi **2**: il dodicesimo); ogni nodo dice cosa fa al passaggio del puntatore. Un clic apre un nodo in una finestra sopra la tela, grande quanto ciò che contiene; **Alt+← →** vanno al passo prima e dopo, **Esc** torna indietro; il nodo del take apre i Take, per sceglierne un altro. Trascina un nodo dove vuoi: si aggancia alla griglia da 10 px della tela. L'icona della griglia nella testata della stanza, **Disponi**, li ridistribuisce.

Il **clic destro** su un nodo: *Apri*, *Esegui fin qui* (il percorso fino a questo nodo e non oltre; un passo saltato su di esso viene omesso), *Salta nel percorso* (il suo passo saltato, il nodo in grigio), *Prova il percorso fin qui*, *Fanne l'obiettivo*, *Fuori dal percorso*, *Clona* e *Disponi*.

**Il tuo percorso.** Il percorso lo tracci tu. Uno studio nuovo comincia con il solo take: tira un cavo dal suo punto al primo passo, poi dal punto di quel passo al successivo; uno studio che usava la vecchia catena la trova qui come il suo primo **Il mio percorso**. Un clic su un cavo del percorso lo taglia lì, e i passi dopo escono dal percorso. Un cavo tirato dal punto di un nodo a un altro mette quel passo subito dopo sul percorso (dal punto del take, per primo), e il file più nuovo del primo diventa la **Sorgente** dell'altro. *Fuori dal percorso* toglie un passo e unisce i passi intorno. Il percorso tracciato così è **Il mio percorso**, accanto alle pipeline, e lo tiene questo browser; **Nuovo percorso**, la gomma accanto, lo svuota per tracciare da zero; **Ctrl+Z** riporta il percorso com'era prima dell'ultimo taglio, cavo o svuotamento. Un percorso parte da una di due sorgenti: il take o **Importa una traccia**. Quello tracciato da Importa una traccia gira da solo su ogni traccia importata dopo. Un percorso senza alcun passo non esegue nulla e lo dice.

**Slot e cavi.** Gli ingressi di un nodo sono nominati a sinistra e le uscite a destra, come gli slot di ComfyUI, di tre classi: un file (ambra), un insieme di stem (turchese), uno stem (viola). Un cavo esce dallo slot della sua classe ed entra nello slot che lo accetta, col suo colore: il DAW accetta stem e le versioni delle voci e dà un mix; un passo su uno stem lo prende da un insieme. Il percorso è disegnato spesso; cosa è nato da cosa, sottile; la sorgente propria di un passo, tratteggiata e solo fuori dal percorso; mentre si trascina un cavo si vedono le strade che può prendere e si accendono solo i nodi che possono accettarlo. Un cavo da un passo fuori dal percorso lo mette dove sta il suo genere (dopo Stem, e anche Stem se manca), e l'altro dopo; un cavo nel DAW mette anche nelle sue tracce i file più nuovi di quel passo. La legenda nell'angolo della tela lo dice, e si chiude.

**Prova e obiettivo.** *Prova il percorso fin qui* disegna il percorso come scorre fino a questo nodo e confronta ogni passo con ciò che gli arriva: un insieme di stem per un passo che li mixa, lo stem che un passo ripara, le interfacce in Audio I/O per un passo che passa dall'hardware. Non parte niente: i cavi scorrono, i passi che reggono diventano verdi e il primo che non regge diventa rosso, con il motivo. *Fanne l'obiettivo* segna il nodo con ◎: allora **Esegui il percorso** arriva fino a lui e non oltre, e la prova va fino a lui; *Nessun obiettivo* toglie il segno.

**Cloni.** *Clona* mette accanto un secondo nodo dello stesso passo, Remaster ② per esempio, con regolazioni sue: la sua finestra è il pannello del passo con le regolazioni del clone, quelle del passo tornano alla chiusura, e un'esecuzione da lì gira con quelle del clone. Il percorso esegue le regolazioni del passo stesso, mai quelle di un clone.

**Profili.** L'icona dei cursori nella testata della stanza tiene impostazioni con un nome. **Salva come…** tiene come è regolato ogni passo e dove stanno i nodi, mai le sorgenti di un take né i suoi punti di taglio; un clic sul nome di un profilo rimette tutto come farebbe una mano; **Salva l'impostazione così com'è ora come** scrive l'impostazione sopra un profilo, **Elimina** lo toglie. Li tiene lo studio, quindi li vede ogni browser.

Ogni scelta è in vista, senza menu a tendina: fino a otto in una colonna di righe (le brevi in fila), di più dietro un pulsante che apre l'elenco sopra la pagina, con un filtro quando è lungo.

**Chiusure.** **▾** sulla striscia dei lavori la chiude al primo lavoro e a quanti altri ce ne sono.

### Il DAW: gli stem sulle tracce <!-- #the-daw-stems-on-lanes -->

![Il DAW: gli stem sulle tracce sopra la console](guide/studio-daw.png)

**Anteprima.** Il passo **DAW** (in **Finitura**, prima del Remaster) stende un set di stem del take su tracce, come fa un DAW: ogni stem una traccia, e una in più, **Resto**: ciò che la sorgente tiene oltre gli stem (ciò che la separazione ha perso). Tutte le tracce così come sono ridanno la sorgente, perciò gli errori della separazione si sentono solo dove cambi il mix. Ogni traccia veste il colore di ciò che contiene: le voci ambra, la batteria rossa, il basso viola, la chitarra verde, le tastiere blu, il resto grigio.

Su ogni traccia: la sua **Versione** (lo stem come diviso, o un file fatto da esso, una voce pulita per esempio), il suo livello da −60 a +12 dB (doppio clic lo riporta a 0), **M** per silenziarla e **S** per metterla in solo, e un misuratore mentre suona. Trascina lungo un'onda per silenziare un tratto; clic destro lo restituisce, clic suona da lì. Tutto si sente subito, tutte le tracce su un solo orologio, campione per campione, come sarà mixato. **Ripristina** riporta ogni traccia com'era divisa, anche i ritorni e il master. **A** prende in mano la linea del volume della traccia: un clic sull'onda mette lì un punto e lo trascina, clic destro lo toglie, doppio clic lo porta a 0 dB; il volume si sente e si mixa dopo il fader, dritto in dB da punto a punto. Un clic sulla versione passa alla successiva, così se ne confrontano due mentre suona; un clic destro le mostra tutte nei dispositivi del canale. Gli angoli in alto di un tratto silenziato lo sfumano verso il silenzio e fuori, quanto li trascini (un doppio clic riporta dieci millisecondi), e i suoi lati lo spostano.

**Il righello** sopra le tracce: un clic va lì, un trascinamento disegna il loop e lo accende, e il loop suona in giro finché **L** non lo spegne. **Ctrl+rotellina** ingrandisce attorno al puntatore, **Shift+rotellina** scorre lungo la canzone, **−**, **+** e **Adatta** a sinistra del righello fanno lo stesso a passi; la vista segue la testina. Un clic sul nome di una traccia la sceglie per i tasti (vedi *Scorciatoie e trucchi*). Sotto il tempo, le sezioni della canzone come le ha temporizzate il player (i tag del testo stesso, piazzati da Whisper): un clic su una va al suo inizio, doppio clic la mette in loop, **[** e **]** vanno alla sezione prima e dopo.

Il pulsante a schermo intero del DAW lo stende su tutta la finestra, le tracce alte quanto lo schermo concede; **F11** sulla scheda dello studio fa lo stesso mentre il DAW è in vista. **Esc**, **F11** o lo stesso pulsante lo riportano indietro.

La **Console** sotto le tracce (**Console** nella barra del DAW la mostra e la nasconde) è un banco di mixaggio: ogni traccia un canale, poi i due ritorni, **Stanza** e **Delay**, e il **Master**, sempre in vista a destra. Un canale dall'alto: il nome (un clic apre i suoi dispositivi), gli insert (**EQ** con la sua curva in piccolo, **Comp** con la sua riduzione mentre suona), le mandate alla stanza e al delay, larghezza e pan, **Ø** per la polarità, **M** e **S**, e il fader col suo misuratore su una sola scala: picco e RMS dei due lati, il picco trattenuto un istante, e sotto il picco più forte dall'ultimo azzeramento (un clic azzera). **+ VCA** dopo le tracce aggiunge un VCA, un fader su un gruppo di tracce (la traccia scelta è il primo membro): il suo fader aggiunge i suoi dB a quello di ogni membro, che resta dov'è, il suo **M** li silenzia e il suo **S** li mette in solo; i suoi dispositivi gli danno un nome e scelgono i membri, e una traccia può stare in più di uno.

Manopole e fader: trascina su e giù (**Maiusc** più fine), la rotella o le frecce una volta scelti; doppio clic ne riporta uno com'era. Il numero di una manopola o di un fader accetta anche un valore scritto: un clic su di esso, o una cifra con uno scelto, apre un campo; Invio lo imposta nelle sue unità (dB, Hz con k per le migliaia, ms o s, %, 4:1, L30 o R30, −∞ per una mandata), Esc lo lascia com'era. **Ctrl+Z** annulla e **Ctrl+Shift+Z** ripete, tutto il mix passo per passo. **A** e **B** tengono due mix del set da confrontare mentre suona: B parte come copia di A, e ciò che imposti va in quello acceso.

**Mix**, la terza scheda della console: il mix che stai impostando è salvato su Forge accanto agli stem del set un istante dopo che la mano si ferma, così il DAW si apre come l'hai lasciato in ogni browser, su ogni macchina; **Salva come** lo salva con un nome, un clic su un nome lo richiama (con Annulla dietro), e **✕** ne elimina uno quando lo dici. Dove Forge non l'ha salvato, la scheda dice perché.

I **Dispositivi** di un canale (un clic sul nome, sul suo **EQ** o sul suo **Comp**): **Ingresso** (trim, polarità, la versione dello stem), **EQ** (fino a otto bande: campana, shelf bassi e alti, tagli bassi e alti, notch; doppio clic sulla curva aggiunge lì una banda, trascina il suo punto, la rotella sopra ne fissa la larghezza, clic destro la toglie; dietro la curva, il suono stesso del canale mentre suona), **Compressore** (soglia, rapporto, attacco, rilascio, ginocchio e recupero, cinque punti di partenza, la sua curva e la sua riduzione) e **Uscita** (larghezza, pan, le mandate). La **Stanza** ha tre spazi, stanza 1,2 s, piastra 1,6 s e sala 2,4 s, e il suo ritorno; il **Delay** il suo tempo (in ms, o una nota a un tempo), feedback, un passa-basso che scurisce ogni eco, e il suo ritorno. Il **Master** mostra la loudness mentre suona secondo BS.1770 (momentanea, breve termine, integrata da quando si è premuto ▶), il true peak, la correlazione dei lati e lo spettro. **Mono** e **Attenua** sotto il master cambiano solo ciò che senti, mai il mix. **Ascolta** del compressore lo lega a un'altra traccia come entra nel proprio compressore, e **Sotto la voce** lega una traccia alla voce principale: la band sotto la voce. I dispositivi del master disegnano anche il goniometro: il centro in su, i lati di traverso. I dispositivi del **Master** tengono la sua catena nell'ordine del suono: **EQ**, **Compressore** (ascolta sé stesso) e **Limitatore** (il limitatore di Plenio che guarda avanti: tetto, spinta, rilascio), poi il suo fader; il canale del master li mostra come slot, ciascuno con la sua riduzione mentre suona. La **Miscela** del compressore è compressione parallela: il suo suono insieme a quello asciutto, 100 % solo il compressore; il punto di partenza **Parallela** la mette al 40 %, e il mix su Forge uguale. Il **Gate**, un terzo insert su ogni traccia, è un espansore verso il basso contro il rientro che la separazione lascia tra le frasi: ascolta la traccia stessa dopo il suo EQ e, sotto la sua **Soglia**, la abbassa secondo il suo **Rapporto**, mai più della sua **Profondità**; il mix su Forge uguale. Ogni ritorno ha anche **Taglio bassi** e **Taglio alti** (spenti a 20 Hz e 20 kHz; sul delay tagliano tutti i suoi echi allo stesso modo, dopo il suo feedback), e la stanza il suo **Pre-delay**, oltre a quello dello spazio stesso: la parola chiara prima che entri la sua stanza; il mix su Forge uguale. I dispositivi del master mostrano accanto a questi altri due numeri: LRA, l'escursione di loudness dall'avvio secondo EBU Tech 3342 (quanto si muove la loudness a breve termine), e PLR, il picco reale sopra la integrata (più è piccolo, più è schiacciato); quando si fa un mix, il suo messaggio dice anche l'LRA del render.

**Automazione oltre il volume.** **A** su una traccia prende in mano una linea, e il chip accanto dice quale manopola disegna la linea: **Vol** (il volume, dopo il fader), **S–D** (il pan), **Larg** (la larghezza), **Stz** e **Dly** (le mandate alla stanza e al delay); un clic passa alla successiva. Un clic sull'onda mette un punto e lo trascina, il clic destro lo toglie, il doppio clic gli dà il riposo della manopola (0 dB, il centro, com'è, niente). Una manopola con una linea suona la sua linea al posto del proprio valore, dal vivo e nel mix, dritta tra i punti.

**Insert e Stampa.** L'**Ingresso** di una traccia ha **Insert**: la versione della traccia così come suona, attraverso il **Passaggio digitale** (nastro, console, valvola, trasformatore, vinile) o il passo di un plugin su un file, su Forge. Ciò che torna diventa la nuova versione della traccia, si sente subito come sarà mixato, e le sue versioni tengono la strada indietro. **Stampa** del master manda il mix come lo tiene il DAW (le sue versioni e ogni manopola) attraverso il Passaggio digitale: un ramo nell'albero accanto ai mix del DAW.

**Bus audio.** **+ Bus** sulla console fa un bus della traccia scelta: il suono dei suoi membri (dopo il loro pan; le loro mandate partono ancora dalle loro tracce) sommato e passato per l'equalizzatore, il compressore, il fader, la larghezza e il pan del bus verso il master. I suoi dispositivi scelgono i membri (una traccia va in un solo bus; una di un altro bus si sposta qui), il nome, l'equalizzatore, il compressore e l'uscita; **M** li silenzia tutti. Il mix su Forge li somma e li elabora allo stesso modo.

**Spostare e copiare.** **Shift** e un trascinamento lungo una traccia scelgono un tratto (un trascinamento semplice lo silenzia ancora). **Ctrl+C** lo copia, **Ctrl+X** lo prende per spostarlo, **Ctrl+V** lo posa alla testina sulla sua traccia: ciò che c'era è sostituito con dissolvenze incrociate di 10 ms, il tratto è disegnato con l'onda che porta, e la sorgente di uno spostato tace (il Ctrl+V seguente posa una copia). **Canc** silenzia il tratto scelto, **Esc** lo lascia, un clic destro su un tratto posato lo toglie; l'annulla riporta tutto. Un tratto posato sta sopra i tagli della traccia, e il mix su Forge lo posa allo stesso modo.

**Il riferimento, la spia del solo e le dissolvenze della canzone.** **Rif** nella barra del DAW (o **R**) suona il suono com'era, quello da cui sono stati separati gli stem, al posto del mix e forte quanto il mix in ciò che ha suonato, così confronti il suono e non il livello (più forte sembra sempre meglio); il pulsante dice di quanto è stato alzato o abbassato, **Mono** e **Attenua** lo sentono anche lui, e una seconda pressione riporta il mix. Finché una traccia è in solo, la barra mostra **S · n**, quante tracce si sentono, perché **Mixa** fa solo quelle: un clic sopra, o **Alt**+clic su una **S** qualsiasi, e si sentono di nuovo tutte. I dispositivi del **master** hanno le **Dissolvenze** della canzone: **Entrata** la porta su da −60 dB, **Uscita** la porta giù a −60 dB prima della fine, e **Finisce a** mette la fine alla testina (silenzio dopo; **Alla fine della canzone** restituisce la fine). La dissolvenza è lineare in dB, dopo il fader del master, disegnata scura sulle tracce, e il mix su Forge la fa uguale.

Ciò che senti è ciò che si mixa: le stesse bande di EQ, lo stesso compressore di Plenio (nel thread audio del browser, o nel thread della pagina stessa quando lo studio è aperto dal suo indirizzo di rete), il panner stereo del browser e la sua legge nel mix, lo stesso impulso della stanza, gli stessi echi. Una sola differenza: dopo un salto nella canzone la memoria del compressore riparte da capo.

**Mixa** fa il mix come si sente, sulla macchina dello studio, con EQ, compressore, stanza e delay dello stesso Plenio (Plenio 0.8.0, Apache-2.0, portato senza modifiche): un ramo nuovo sull'albero, la sua loudness misurata; un mix con picchi sopra −0.3 dBFS viene abbassato fin lì e dice di quanto. **+stem** accanto scrive ogni canale come suona nel mix, e ogni ritorno, come file a sé accanto al mix, per un DAW tuo. Mentre gira, **Ferma** accanto lo chiude su Forge e non si fa nulla. Anche la catena del master la mixa Plenio stesso, limitatore compreso.

## Artista <!-- #artist -->

La stanza che dipinge: una copertina per ogni take, un 16:9 per il suo video, un 9:16 per uno short, dalle tue parole, da una tua immagine o da entrambe. Il modulo a sinistra, il palco al centro, la libreria a destra.

### Immagini per le tue canzoni <!-- #pictures-for-your-songs -->

Scrivi a frasi quello che vedi per la canzone: Qwen-Image legge il prompt come una descrizione, non come un elenco di tag. Prima ciò che c'è nell'immagine, poi la luce, i colori e la tecnica (olio, inchiostro, una fotografia), e alla fine *no text* quando non vuoi lettere. **From the take** mette il prompt da cui è stata dipinta la copertina del take che hai in mano, o uno fatto del suo titolo e del suo stile, per avere da dove cominciare.

**Forme**: **1:1** (1280 × 1280) per la copertina, **16:9** (1920 × 1080) per un video, **9:16** (1080 × 1920) per uno short. Le forme di una pressione condividono il seme, perciò escono come una serie: la stessa scena con gli stessi colori, ciascuna composta per la sua cornice e non un'unica immagine tagliata tre volte. **Variations** dipinge anche i semi successivi (il seme, il seme + 1, …), ciascuno in tutte le forme.

**Seed**, con la sua modalità accanto: **Random** (−1: un seme nuovo a ogni pressione, il campo vuoto), **Random, fixed** (un seme a caso messo subito e tenuto), **Fixed** (quello scritto), **Next** e **Previous** (dopo una pressione, il campo passa oltre i semi usati dalle sue variazioni). Un numero nel campo è quel seme (Random diventa Fixed); un campo svuotato è un seme nuovo a ogni pressione (Fixed diventa Random); ⟲ è di nuovo Random. Il seme di un'immagine che ti è piaciuta la ridipinge: ogni giro mostra il suo seme, e **To the form** lo riporta con il prompt.

**Tre colonne**: a sinistra il prompt e le sue manopole, al centro il palco (lì si rivela il giro che si dipinge, il suo avanzamento sopra il palco; altrimenti l'immagine scelta, i suoi pulsanti sotto, e i dati del suo giro con il prompt in un suggerimento accanto, sopra la libreria, finché il puntatore è sull'immagine), a destra la libreria; i bordi tra loro si trascinano (← → dalla tastiera, un doppio clic per la larghezza iniziale). Le scelte della colonna si allargano con lei e non sono mai più strette dei nomi dei pittori. Da una finestra alta 920 px la stanza ci sta intera: la pagina resta ferma, il modulo e la libreria scorrono ciascuno per conto suo, e la riga di Draw resta in fondo al modulo.

**Live preview** (attivo per impostazione predefinita): il posto dell'immagine che si sta dipingendo mostra ogni suo passo, dal rumore all'immagine, a un ottavo della grandezza e senza il decodificatore, quindi non costa nulla; spento, il posto aspetta l'immagine finita. Una barra sopra il palco, per tutta la sua larghezza, segue il giro, immagine per immagine e passo per passo.

**Due giri alla volta**: mentre uno va, **Draw** chiede il prossimo, che aspetta dietro (anche Ctrl+Enter); **Stop**, accanto a Draw mentre un giro va, finisce quello che dipinge (altrimenti quello in attesa esce dalla coda); le immagini che ha finito restano.

### I pittori <!-- #the-painters -->

**I pennelli dell'Artista** sono un solo elenco di ogni modello e file qui, per gruppi: Qwen-Image 2512 da un GGUF (Q4, Q6), ogni file fp8 in `artwork/Qwen-Image-2512/checkpoints/` (il BASE di 2512 e i fine-tune) e Qwen-Image 2.1. **⚡ Lightning** segna un pennello che dipinge con esso di default; un fine-tune è segnato come tale. Un file messo in `checkpoints/` diventa un pennello a sé quando la stanza rilegge l'elenco (dopo un download o ricaricando la pagina). Krea 2 Muse ha lasciato lo studio a ottobre 2026: Qwen-Image 2512 segue meglio le parole e scrive bene un titolo.

**I fine-tune di Qwen-Image 2.1**: un file fp8 in `artwork/Qwen-Image-2.1/checkpoints/` (file singolo di ComfyUI; il primo FinalCut v1) è un pennello di 2.1, *Fine-tune · fp8 · il suo nome*; il file fp8 di 2512 stesso si chiama *Pesi base*. Per il resto un fine-tune di 2.1 è 2.1: la sua licenza, la modifica a parole, le scritte, Turbo.

**Qwen-Image 2512** (Apache-2.0) da un GGUF in **Q4** (una scheda da 15,5 GB) o **Q6** (20 GB), oppure un suo **fine-tune fp8** (22,5 GB: i file singoli di ComfyUI messi in `artwork/Qwen-Image-2512/checkpoints/`, ognuno un pennello a sé); circa mezzo minuto per immagine con Lightning, dopo un minuto o due di caricamento. **Qwen-Image 2.1**, sotto la Qwen Research Licence (solo ricerca e valutazione: non per una copertina che vendi), dipinge dalle parole e ritocca un'immagine di riferimento con le parole del prompt; una maschera e *Paint around it* vogliono Qwen-Image 2512. Su una scheda che non contiene per intero né il suo codificatore di testo né il pittore (una scheda da 16 GB, o una scheda sotto un limite di VRAM più basso), entrambi scorrono dalla RAM: sotto un limite di 15.5 GB su una 3090, 135 s dalle parole con 4.1 GB al picco, 129 s modificando con 7.9 GB.

Ogni pittore compare solo quando i suoi file sono qui; quelli che mancano li nomina la nota sotto la scelta del pittore. **Engine → Models and LoRAs → Qwen painters** scarica Qwen-Image 2512 in Q4 (31 GB) o Q6 (34,5 GB) con Lightning, e Qwen-Image 2.1 (33,1 GB), ognuno chiedendo prima con la sua misura (2.1 anche con la sua licenza). Da un terminale: `heresy/fetch-heresy.sh --qwen 2512-q4`. **Get painters and adapters…** sotto il pittore mostra nella stanza stessa ciò che lo studio può scaricare per l'Artista: i pittori Qwen, quattro fine-tune fp8 di Qwen-Image 2512 (Jib Mix Qwen, IntoRealism Qwen, Real-Qwen-Image e lo stesso 2512, 20,4 GB ciascuno, condivisi nel repository dei modelli dello studio con il permesso dei loro autori) e quattro adattatori, ognuno con la sua dimensione, qui o **Fetch**.

**Quale scheda dipinge**: una pressione aspetta nella coda del laboratorio una scheda con spazio, come le copertine dei take e gli stem; mentre aspetta, **Off the queue** la ritira. Una scheda che nient'altro usa prende un giro il cui fabbisogno sta nella sua memoria meno 512 MiB (la parte del runtime CUDA stesso); una scheda in uso lo prende quando la sua memoria libera contiene il fabbisogno. Un pittore Qwen-Image 2512 che nessuna scheda qui può reggere intero porta invece i suoi blocchi dalla RAM: quelli che ci stanno restano sulla scheda, gli altri arrivano quando servono, e l'immagine è la stessa, più lenta di quanto il bus non sa nascondere (con quattro adattatori su una scheda da 24 GB circa un sesto; con tutti i blocchi dalla RAM, occupa 2,3 GB della scheda, così lo dipinge anche una da 6 GB, con circa 30 GB di RAM); un altro pittore che nessuna scheda può reggere è rifiutato subito, con i numeri e il pittore che ci starebbe. Qwen-Image legge il prompt con il suo codificatore di testo (Qwen2.5-VL-7B, 15,5 GB) sulla scheda quando lo spazio libero lì lo contiene, altrimenti sul processore, prima che arrivi il pittore: l'immagine è la stessa in entrambi i modi.

**Il filtro dei contenuti**: ogni immagine passa da un filtro dei contenuti (nsfw_image_detection di Falconsai, Apache-2.0), chiunque l'abbia dipinta (la regola dello studio per ogni pittore): quella che segnala non viene tenuta, e il giro lo dice.

### Lightning <!-- #lightning -->

**Che cos'è**: Lightning (lightx2v, Apache-2.0) è un adattatore che insegna a Qwen-Image 2512 a dipingere in pochi passi senza guidance: la lunga strada guidata del modello stesso, distillata in 8 passi. Il suo file sta in `artwork/Qwen-Image-2512/lightning/` (`Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors`, 0,85 GB) e arriva con lo scaricamento dei pittori Qwen.

**Come lo mette lo studio**: con Lightning acceso, il pittore lo carica come un adattatore in più sotto i tuoi LoRA, con la sua forza: **1.0** per i GGUF Q4 e Q6 e il fp8 BASE di 2512 (la base da cui è stato distillato, negli 8 passi che danno i suoi autori) e **0.55** per un fine-tune fp8, in 12 passi (un fine-tune si è allontanato dalla base, e Lightning a piena forza lo tirerebbe indietro; l'impostazione di Viktor in ComfyUI). La pianificazione diventa quella di Lightning: uno spostamento di log 3 a ogni misura, come è stato addestrato. La guidance è spenta (true CFG 1): un passaggio del modello per passo.

**Con Lightning spento**, il pittore prende la strada di 2512: 30 passi per impostazione predefinita (da 10 a 60) e **guidance** 4 (true CFG con il suo negativo vuoto: due passaggi per passo). Sessanta passaggi contro otto: la pittura stessa dura circa sette volte tanto, il caricamento uguale, e dà il dettaglio e la luce di un realismo finito.

**Turbo** è l'accelerazione di Qwen-Image 2.1, come Lightning quella di 2512: l'adattatore *Turbo 4step* (di AiMetatron) in `artwork/loras/qwen-image-2.1/`, sullo stesso interruttore in *Campionamento*, lì chiamato Turbo; spento se non richiesto (2.1 dipinge come sempre, 30 passi), acceso da 4 a 16 passi. Su una RTX 3090 a 1280²: 30 passi 96 s, i 4 passi di Turbo 42 s.

**Le sue impostazioni predefinite**: i GGUF Q4 e Q6 dipingono con lui (bozze, schede più piccole); un fine-tune fp8 dipinge senza, a meno che tu non lo accenda (realismo finito); la copertina di un take si dipinge con lui (*Engine → Artwork*). La regola dietro: Lightning per bozze e copertine, non per il realismo professionale.

**L'interruttore**: in Sampling, con la sua forza accanto; acceso, i passi vanno da 4 a 16 e Guidance si nasconde; spento, Guidance si vede. Senza il suo file non c'è interruttore, e 2512 dipinge a modo suo. La forza è tenuta per ogni pittore; la somma dei tuoi adattatori (*Together*, più sotto) non conta Lightning.

**Quanto costa**: su una RTX 3090 a 1328 × 1328, Qwen-Image 2512 con Lightning dipinge in circa 30 s per immagine in Q4 (14,3 GB al picco) e 32 s in Q6 (17,6 GB); un fine-tune fp8 a 0.55 e 12 passi in 37 s (21,0 GB). La copertina di un take con Lightning ha richiesto circa un minuto e mezzo con il caricamento e il prompt.

### Sampler e pianificazioni <!-- #samplers-and-schedules -->

**Sampling** sotto il pittore, ripiegato, con i suoi valori nel riepilogo: i passi, il sampler e la pianificazione, tenuti per ogni pittore; **Reset** ridà quelli del pittore. I passi: Qwen-Image 2512 con Lightning, da 4 a 16; altrimenti da 10 a 60; un numero oltre l'intervallo resta al suo bordo. La stima del tempo del modulo conta i passaggi del sampler.

**I sampler**: a ogni passo il modello dice da che parte sta l'immagine; il sampler decide come arrivarci.

- **Euler**: un passaggio per passo, il passo semplice; il riferimento, e quello con cui è stato distillato Lightning.
- **Euler SDE**: Euler con un po' di rumore fresco a ogni passo: più grana, un po' meno fedeltà.
- **ER-SDE**: un risolutore stocastico del terzo ordine (ER-SDE-Solver-3), un passaggio per passo, tenendo i due passi precedenti: più fine di Euler nello stesso tempo.
- **RES 2s** e **RES 3s**: i metodi a passo singolo del risolutore esponenziale raffinato, due e tre passaggi per passo, rimettendo metà del rumore dopo ciascuno; i loro gemelli **ODE** non ne rimettono, così un seme dipinge un'immagine, la più vicina alla strada esatta.
- **Heun++** (heunpp2): tre passaggi per passo dove può, poi due, e uno alla fine.
- **Exponential Heun** (exp_heun_2_x0, e il suo SDE): un metodo esponenziale del secondo ordine, due passaggi per passo; l'SDE rimette il rumore.

Un sampler da due o tre passaggi per passo costa due o tre volte il tempo di Euler agli stessi passi; agli 8 passi di Lightning gli ordini più alti cambiano il dettaglio, non la composizione. Contro la strada esatta di un flusso giocattolo in 8 passi si mettono in fila come dicono i loro ordini: Euler 0,138, Heun++ 0,111, Heun esponenziale 0,084, RES 2s 0,058, RES 3s 0,046 (l'errore: più basso è più vicino).

**Le pianificazioni** dicono dove si spendono i passi, da tutto rumore a niente:

- **Simple**: in modo uniforme nel tempo proprio del pittore, con il suo spostamento.
- **Karras** ed **Exponential**: più passi con poco rumore, per il dettaglio.
- **Beta** e **Beta 57**: fitte ai due estremi, rade nel mezzo (Beta 57 con 0,5 e 0,7).
- **KL optimal**: la spaziatura che Align Your Steps ha trovato ottimale.
- **SGM uniform**: uniforme nel tempo, senza l'ultimo passo.
- **Bong tangent**: due pendenze d'arcotangente, da tutto rumore a metà e da metà a niente.

**Che cosa hanno mostrato due matrici** (54 immagini attraverso un laboratorio di prova, un prompt, un seme): su Qwen-Image 2512 **con Lightning, Karras, Exponential e KL optimal possono dipingere il soggetto due volte** (due fari dove se ne chiedeva uno): con Lightning tieni Simple, Beta, Beta 57, SGM uniform o Bong tangent. **Senza Lightning, Euler SDE dipinge Qwen morbido e velato**: Euler, ER-SDE o RES tengono il dettaglio. Il modulo dice entrambe le cose quando valgono.

**Da dove vengono**: scritti per lo studio a partire dagli articoli dei metodi e dalle formule di ComfyUI (GPL-3.0, che l'AGPL dello studio può accogliere); quelli di RES4LYF sono stati letti solo per la loro matematica, perché la sua licenza vieta i servizi commerciali: niente del suo codice è qui; Heun++ è di Carzit (MIT).

### Regioni <!-- #regions -->

**Regioni** sotto *Campionamento*, ripiegate: fino a tre parti dell'inquadratura, ognuna con un posto (una metà, un terzo, un quarto o il centro; una piccola mappa accanto mostra dove) e parole sue. A ogni passo al pittore si chiede ancora una volta per ogni regione, con il prompt e le parole della regione, e le risposte si fondono per riquadri dal bordo morbido, come fa Latent Couple; il resto dell'inquadratura segue il solo prompt. Così il prompt dice tutta la scena e una regione ciò che sta lì: *due animali in una radura innevata*, poi *una volpe rossa* nella metà sinistra e *un gufo bianco su un ceppo* nella destra. Ogni regione costa un passaggio intero in più a passo (su una 3090 a 16:9, Qwen-Image 2512 fp8: 141 s senza, 281 s con due regioni). Tenute in questo browser; una regione senza parole non si invia; **Ancora** dipinge con quelle della sua esecuzione. Per Qwen-Image 2512; Qwen-Image 2.1 modifica con le parole e dipinge senza di esse.

### Scritta <!-- #lettering -->

**Scritta** sotto *Regioni*, ripiegata: un titolo, e una seconda riga sotto (l'artista, l'album), scritti come parte del dipinto e non sovrapposti. Le sue parole stanno in campi propri, mai nel prompt: **Titolo**, **Seconda riga**, **Le lettere** (come sono, a parole; vuoto: maiuscole classiche con grazie in oro caldo), **Dove** (in alto, al centro, in basso) e **Come**: *dipinta con l'immagine* (Qwen-Image 2512 o 2.1 dipinge la scena del prompt con le lettere dentro; il «No text» del prompt di un take viene tolto) oppure *sul riferimento* (Qwen-Image 2.1 scrive su un'immagine finita con le parole e conserva il resto; **Scrivi** su un'immagine la rende riferimento e apre il blocco). I pittori sbagliano le parole viste di rado («RUOCH STUDIO»), perciò l'ascoltatore (Qwen2.5-Omni, circa 5 s a immagine) rilegge ogni immagine, e quella con un errore viene dipinta di nuovo con un altro seme, fino a tre volte: resta la prima scritta esattamente, le altre vanno nella cartella misspelled/ dell'esecuzione. Un segno accanto a ogni immagine dice come si legge: ✓ scritto come richiesto, ⚠ errore in ogni tentativo (il suo suggerimento dice cosa si legge), ? non riletto (l'ascoltatore non è sulla macchina). Su una 3090 Qwen-Image 2.1 ha scritto su un quadrato in 118 s; Qwen-Image 2512 fp8 (senza Lightning) ne ha dipinto uno con le lettere in 230 s, caricamento compreso. Anche in cirillico, più sicuro in maiuscolo. Conservata in questo browser; **Ancora** scrive con le parole della sua esecuzione.

### Adattatori <!-- #adapters -->

**LoRA** sotto il pittore: gli adattatori della sua famiglia (Qwen-Image 2.1, Qwen-Image 2512), fino a quattro, ognuno con la sua forza (da 0 a 1.5); un clic su una delle sue parole chiave la mette nel prompt. **Add…** apre la libreria: le cartelle a sinistra, le schede con le loro immagini, una ricerca. Gli adattatori stanno nella cartella dello studio `artwork/loras/<famiglia>/` (`qwen-image-2.1`, `qwen-image-2512`): ogni cartella al suo interno diventa un gruppo, e un'immagine accanto a un file con il suo nome (`NAME.jpg`, `NAME.png`, `NAME.preview.png`) si vede sulla sua scheda. Prendili da Civitai secondo il modello base (Qwen) e metti lì il `.safetensors`; **Look up on Civitai** invia solo lo SHA-256 di ogni file e tiene la risposta accanto (`NAME.civitai.info`: il nome, il modello base e le parole chiave, e la sua prima immagine segnata come sicura quando non ne ha una). Si legge anche ciò che il LoRA Manager di ComfyUI o Stability Matrix hanno scritto accanto a un file. Un adattatore fatto per un altro modello, che non raggiungerebbe alcuno strato del pittore, ferma il giro e lo dice. Un clic destro sulla riga di un adattatore lo **silenzia** (**Mute**): resta nella lista con la sua forza ed esce dal giro (**Unmute** lo riporta); anche un adattatore a zero non si carica. I quattro adattatori che i loro autori lasciano condividere arrivano da **Get painters and adapters…**.

**Together**: da due adattatori, una barra sotto di loro dà la somma delle loro forze sulla strada del Creatore: verde fino a 1.2, ambra fino a 1.8, rosso oltre. Gli adattatori sovrapposti si sommano, e oltre circa 1.8 un'immagine brucia (colori e bordi esagerati) per quanto modesto sia ciascuno; le zone sono una prima misura per le immagini, da regolare a occhio. Trascina la barra per muoverli tutti insieme, ognuno in proporzione a dove stava.

### Un'immagine da cui dipingere <!-- #a-picture-to-paint-from -->

**Reference picture**: un'immagine da cui dipingere, come image to image: lasciala cadere al suo posto sotto il prompt, incollala (Ctrl+V), scegli un file o prendi l'immagine del palco con **As reference**. **How much it may change** dice quanto lontano da essa comincia il dipinto: 0.3 la lascia quasi com'è, 0.6 ne tiene la composizione e ne cambia la materia, 0.9 dipinge la scena del prompt nella sua luce e nei suoi colori, 1.0 dipinge da capo. L'immagine copre ogni forma ed è tagliata dal centro; **Again** dipinge da quella del giro; ✕ dipinge di nuovo dal rumore.

**Usarla** sotto l'immagine dice come: *per dipingere da essa* (come sopra, con il pittore del modulo, fin dove dice *Quanto può cambiare*), *per modificarla con le parole* o *solo per il suo stile*, entrambi con Qwen-Image 2.1 quando c'è (altrimenti spenti). Modificata con le parole, la scena resta e il prompt dice cosa cambia (*lo stesso faro in una notte d'inverno nevosa*: la neve è caduta dove doveva, la torre e gli scogli tenuti). Per il suo stile, la scena del prompt è dipinta con la tecnica, la pennellata, la tavolozza e la luce dell'immagine, senza nulla del suo soggetto (il faro a olio ha dato *una volpe rossa in un bosco innevato sotto la luna* con la sua pennellata). In entrambi i casi l'esecuzione è di Qwen-Image 2.1 qualunque sia il pittore del modulo: il modello, il campionamento, gli adattatori, la maschera e la tela del modulo non vengono inviati, e vale la sua licenza (solo ricerca e valutazione). Circa due minuti a immagine su una 3090.

**Mask…** accanto dipinge sull'immagine che cosa ridipingere (Paint, Erase, il pennello, Invert, Clear): il resto resta esattamente com'era, come inpainting. **Paint around it** mette l'immagine intera al centro di ogni forma e ridipinge i bordi (una copertina quadrata in 16:9 o 9:16), come outpainting. **The take's cover** prende la copertina del take scelto a destra. Con una maschera o **Paint around it**, quattro opzioni sotto l'immagine: **Grow** (la maschera allargata di tanti pixel, o ristretta), **Edge** (quanto è morbido il suo bordo), **Soft** (ridipintura morbida, come la differential diffusion: dove il bordo è grigio l'immagine cambia solo negli ultimi passi, senza cucitura) e **Grain** (quanto della pittura nuova prende la parte che resta: la sua grana e la sua luce cucite al nuovo; 0 la lascia esatta).

**Canvas…** accanto a **Mask…** apre la tela, come quella di InvokeAI: la cornice di ogni forma, una scheda in alto che dice come sarà dipinta (**from it**: l'immagine copre la cornice e il giro dipinge a partire da essa, image to image con la forza chiesta; **around**: la parte della cornice che l'immagine lascia vuota si dipinge intorno a lei). Sulla tavola **Move** (V) trascina l'immagine, o un angolo per scalarla tenendo fermo l'angolo opposto; **Brush** (B) ed **Eraser** (E) dipingono sopra di lei la maschera di ridipintura; **Hand** (H, o Spazio tenuto premuto) sposta la tavola; la rotella fa lo zoom, Alt+rotella scala l'immagine attorno al puntatore, le frecce la spingono di poco. A destra i livelli (la maschera con **Invert** e **Clear**, il riferimento con la sua opacità solo sulla tavola) e il suo posto in numeri (larghezza, X, Y in parti della cornice); in alto **Fit**, **Fill**, **Centre** e **Same in all** (l'immagine grande uguale in pixel nelle altre cornici), annulla e ripeti (Ctrl+Z). **Done** tiene i posti con il riferimento e la maschera nel modulo; sotto la forza il modulo dice come sta ogni forma, e ✕ lo toglie dalla tela.

### Il palco e la libreria <!-- #the-stage-and-the-library -->

Un clic su un'immagine la mette sul palco col suo giro sotto; un clic sull'immagine del palco (o un doppio clic su un'immagine) la apre sopra la pagina nella sua forma (← → scorrono il giro, o la galleria quando è stata aperta da lì; Esc chiude), con ★, **To the form**, **Set as cover** e **Download** (PNG, a grandezza piena). Sul palco, **Note…** tiene con l'immagine, nel suo giro, una nota tua (a cosa serviva, le parole della scritta, cosa provare dopo); il suggerimento dell'immagine la mostra.

**Runs o Gallery**: i giri mostrano ogni pressione di Draw con il suo prompt e il suo seme, i più nuovi in alto; la galleria mostra tutte le immagini di tutti i giri in un'unica griglia, le più nuove per prime, per forma (1:1, 16:9, 9:16) o con la stella (☆ su un'immagine le mette la stella), in tre grandezze, in tessere uguali: colonne uguali, ogni tessera la stessa casella, ogni immagine intera dentro.

**Compare**: il **Compare…** del palco, poi l'altra immagine nella libreria: le due stanno una sull'altra sotto un divisore che trascini (← → lo spostano), o affiancate (S); X le scambia, Esc chiude. **Ctrl** (o ⌘) **+ clic** sceglie le immagini e **Shift + clic** una serie: la barra della libreria le segna con la stella o le manda nel cestino tutte insieme (Esc le lascia).

**Il menu di un'immagine**: un clic destro su qualsiasi immagine (di un giro, della galleria, del palco, quella sopra la pagina): **Over the page**, **To the stage**, **To the form** (il suo prompt, il seme e la forma), **All of it to the form** (anche il suo pittore, il fine-tune, il sampling e gli adattatori: Draw ridipinge quell'immagine), **As reference**, **Compare…**, **Set as cover**, **Upscale** (2K o 4K, con le misure che danno), **Star it**, **Pick it**, **Copy the prompt**, **Copy the seed**, **Download**, **The file in a new tab**, **Its run** (la vista Runs, la sua scheda illuminata), **To the trash**. Un giro che si rivela sul palco non ha menu. Sopra la pagina il menu sta sopra l'immagine e ha i tasti finché è aperto: Esc chiude il menu, l'Esc seguente l'immagine.

### Upscale <!-- #upscale -->

**Upscale…** sul palco porta l'immagine a **2K** o **4K**: il suo lato lungo a 2560 o 3840 px (una copertina quadrata 2560² o 3840², un 16:9 2560×1440 o 3840×2160) con un upscaler (ESRGAN, DAT, HAT, SPAN e parenti, li legge spandrel) scelto nella riga che si apre (la scelta resta; prima 4x_Nomos8kDAT se c'è); il suggerimento di ogni pulsante dice la misura che dà, e per un'immagine già così grande il pulsante è spento. Il modello passa quante volte serve alla misura (due al massimo) e il risultato è portato alla misura esatta. L'immagine grande è un giro a sé accanto alla sua fonte, meno di un minuto su una 3090; **Again** la ingrandisce di nuovo, magari con un altro modello. Gli upscaler stanno in `artwork/upscalers/` dello studio (`.pth` o `.safetensors`, anche in cartelle); OpenModelDB ne elenca centinaia: bada alla licenza di ciascuno.

**Estendi i bordi…** (Outpaint…) sul palco dipinge i bordi di un'immagine: l'immagine intera al centro di una tela più larga (16:9), più alta (9:16) o quadrata, il resto dipinto da Qwen-Image 2.1 con l'adattatore *Outpaint v2* (di AusBoss, in `artwork/loras/qwen-image-2.1/`), i suoi pixel rimessi sopra il risultato. Le parole su ciò che sta oltre i bordi sono un desiderio, non un obbligo. 25 passi; un 1:1 in 16:9 ha richiesto 90 s su una RTX 3090.

**Secondo passaggio…** accanto ridipinge l'immagine più grande, come fa il workflow ComfyUI di Viktor dopo il primo passaggio: l'immagine ingrandita **×1.5** o **×2** (per pixel più vicino, come nel suo) e ridipinta dal pittore della sua stessa esecuzione, dal fine-tune, dagli adattatori, dal prompt e dal seme, da metà strada (*Quanto può cambiare*: 0.3 tiene il disegno e aggiunge dettaglio, 0.5 affina la materia, 0.7 ridipinge le forme). I passi, il campionatore, la pianificazione e Lightning sono quelli del modulo quando il modulo dipinge con lo stesso pittore, altrimenti quelli dell'esecuzione: la sua ricetta dà al secondo passaggio molti passi e niente Lightning. Un 16:9 di 1920×1080 esce a 3840×2160. Misurato su una 3090: Qwen-Image 2512 fp8 a 3840×2160 in 220 s con 12 passi e Lightning (22.9 GB). Non per Qwen-Image 2.1, che modifica con le parole; niente maschera né tela. **Rumore aggiunto** nella sua riga (0.6 all'inizio, come nel suo) e sotto il *Quanto può cambiare* di un riferimento (0 all'inizio) è l'InjectLatentNoise del suo workflow: rumore fresco sull'immagine prima che la pittura parta da essa; 0.3 porta grana e dettaglio nuovi, oltre 1 le forme dell'immagine cominciano a rompersi.

### Una copertina per il take <!-- #a-cover-for-the-take -->

Un'immagine quadrata ha **Set as cover**: diventa la copertina del take che hai in mano (sceglilo a destra), nella sua scheda, nel player e nel suo MP3. La copertina che aveva resta accanto al take (`artwork-removed/`), come la tiene un ridisegno, e l'altra lettera di una coppia A/B riceve anche la nuova quando non ne ha una sua.

**La copertina di un take** (*Draw artwork* nel suo menu, nel Bibliotecario, per un take o per molti) la dipinge il pittore di **Engine → Artwork**: secondo le schede (Qwen-Image 2512 Q6 o Q4 intero dove una scheda lo contiene, altrimenti Q4 in streaming dalla RAM su una scheda più piccola), o quello che scegli tra i pittori Qwen che ha questa macchina: Qwen-Image 2512 Q4 o Q6 e ogni fine-tune fp8 con Lightning, Qwen-Image 2.1 con la sua licenza detta (non per una canzone che si vende). Un fine-tune scelto che non è più qui cede il posto alla scelta secondo le schede, e la copertina dice chi l'ha dipinta.

### Il cestino dell'Artista <!-- #the-artist-s-trash -->

I giri stanno nella cartella `artist/` dello studio. **Trash** su un giro lo sposta in `trash/artist/`; il **Trash** del palco mette da parte un'immagine. La vista **Trash**, accanto a Runs e Gallery, mostra prima le immagini messe da parte, ognuna con **Restore** e ✕, e **Restore all**; poi i giri nel cestino, ognuno con **Restore** e **Delete for good**; **Wipe out** nella sua testata cancella tutto ciò che mostra. Ogni cancellazione chiede prima e non si annulla.

**Trash (Art)** nella colonna del Bibliotecario, sotto Out of sight, tiene l'arte messa da parte a riquadri (un clic su uno lo spunta): i giri dell'Artista nel cestino, le immagini messe da parte e le copertine tolte ai take (da un ridisegno, da Remove, da una copertina nuova), ognuna con la sua immagine e il suo peso. Spuntale per renderle (una copertina torna al suo take, e quella che ha ora prende il suo posto) o per cancellarle per sempre, chiedendo prima; senza nessuna spuntata, **Wipe out the art's trash**. Le copertine di uno spazio di lavoro congelato restano come sono.

### Il registro dell'Artista <!-- #the-artist-s-log -->

La cornice del registro del server ha cinque viste, **Server**, **Creator**, **Trainer**, **Refiner** e **Artist**, e ogni stanza apre la sua: la stanza dell'Artista quella dell'Artista. Il registro dell'Artista, tenuto in questo browser (le sue ultime 400 righe), dice che cosa è stato chiesto (il pittore, il fine-tune, le forme, il seme, il sampling, gli adattatori), che cosa ha risposto il laboratorio (un rifiuto con le sue parole), la strada di ogni giro fino alla fine (aspetta e perché, dipinge sulla GPU N, fatto, fermato, fallito e perché) e le righe del laboratorio stesso sull'Artista. **Copy** prende le righe della vista; ripiegata, la cornice dice l'ultima riga della vista. **⧉** apre il registro in una finestra sua, con le due viste a specchio: in Chrome resta sopra tutte le finestre (Document Picture-in-Picture); altrove è una finestra da portare su un altro monitor. La finestra porta accanto al registro anche le schede dal vivo; la cornice si chiude finché è aperta e si riapre quando la finestra si chiude, se era aperta. **Creator**, **Trainer** e **Refiner** mostrano le righe del registro del server che appartengono alla loro stanza: quelle del motore e della pagina al Creatore, un addestramento all'Addestratore, stem, remaster, upscale e i mix della DAW al Rifinitore; la vista scelta resta per la stanza, e una stanza senza ancora niente nel registro lo dice.

### Che cosa arriva all'Artista <!-- #coming-to-the-artist -->

Le versioni dell'immagine di un take; SeedVR come upscaler (con la fase DAW, nella 2.1.0).

## Bibliotecario <!-- #librarian -->

### Tutti i take <!-- #every-take -->

![Il Bibliotecario](guide/studio-collection.png)

- **L'intestazione** nomina la raccolta aperta (*Bibliotecario › Fosforida*) e ciò che contiene: take, ore, mi piace, preferiti, note, come sono stati fatti.
- **Spazi** a sinistra: Tutti, Preferiti, Senza spazio, i tuoi spazi, *+ Nuovo spazio*; Nascosti e il Cestino, in *Lontano dagli occhi*. Clic destro su uno spazio per i suoi **blocchi** (*Blocca l'eliminazione dello spazio*, *Blocca l'eliminazione dei take*): un 🔒 accanto al suo nome, e niente di ciò che contiene va nel cestino. Gli spazi 💎 (i set pubblici dello studio) stanno in fondo all'albero, per nome, e gli 💎 … LoRA più in basso di tutti.
- **La playlist** sta per prima nella colonna, un posto suo: non si rinomina, non si elimina e non si congela. Un take ci entra dal suo menu (*Aggiungi alla playlist* › *Per primo*, *Per ultimo* o *A caso*; su una scheda spuntata, tutti quelli spuntati), e × lo toglie solo dalla playlist, mai dalla libreria. La sua vista è un solo elenco di schede larghe: prima ▶, poi il titolo, quando è stato fatto e la sua durata, i suoi segni, e la copertina per ultima. Trascina una scheda al suo posto; *Mescola il mazzo* le distribuisce tutte di nuovo. *Riproduci dall'inizio*, o ▶ su qualunque scheda, suona la playlist nel suo ordine fino alla fine, qualunque cosa dica *continua a riprodurre*, e una striscia sottile sotto il lettore nomina il take prima, il posto nella playlist (*Playlist · 3 / 12*) e il take dopo: un clic su un nome lo suona, e × lascia la playlist. L'ultimo pulsante del lettore apre lo stesso elenco in una finestra, con il lettore ancora in vista sotto. Nella sua testata la dissolvenza, da 0 a 4 s: il take successivo entra sotto la coda del precedente, entrambi già tenuti nella pagina, così nessuno aspetta la rete; Precedente e Successivo cambiano subito.
- **Cerca** con parole, `*` e `?`; **ordina** per più nuovi, più vecchi, per titolo, più lunghi; **Riquadri** o **Elenco**: tutti e tre nella riga dell'intestazione, accanto ai conteggi.
- **Una scheda** porta la copertina del suo take nell'angolo in alto a destra, accanto al titolo, quando ce l'ha (*Disegna la copertina* nel menu del take); un clic mostra l'immagine intera sopra lo studio, dove ‹ › e i tasti freccia scorrono le immagini delle schede mostrate, ▶ riproduce il suo take ed Esc chiude. La scheda che suona brilla dei picchi della canzone stessa. Una sottile striscia sul bordo sinistro della scheda dice il tuo verdetto: il colore d'accento per ★, verde per 👍, un rosso spento per 👎, grigio senza verdetto.
- **Take freschi**: un take che non hai ancora riprodotto porta una leggera linea tratteggiata; il suo primo ascolto la toglie. Un take rigenerato porta un'etichetta *regen* e conserva la sua nota, il suo mi piace e la sua stella.
- **La colonna degli spazi**: trascinane il bordo per allargarla o restringerla; « la richiude, e le schede si allargano: le colonne restano le stesse, e l'occhio non perde il segno.
- **Sezioni**: uno spazio può avere sezioni, al massimo due livelli di profondità (⋯ accanto al suo nome → *Nuova sezione…*), per ordinare ciò che contiene senza un nuovo spazio ogni volta. Uno spazio mostra anche i take delle sue sezioni. Tutto ciò da cui il Rifinitore ricava qualcosa va da solo nella sezione *Rifiniti* dei suoi spazi. Uno spazio con sezioni ha un piccolo triangolo a sinistra della sua riga: un clic ripiega le sue sezioni fuori dalla colonna o le riporta, e quelle ripiegate vengono ricordate. La colonna scorre da sola e resta sotto l'intestazione della stanza, così la sua cima è sempre a portata di mano.
- **Trascina una scheda su uno spazio** a sinistra per spostarla lì (tutte le selezionate, quando è selezionata); tieni premuto **Ctrl** per aggiungerla lì e lasciarla anche qui. Lo studio chiede prima, e Ctrl+Z la riporta indietro.
- **Take fissati**: fino a quattro in ogni spazio, in una striscia del loro tono sopra le schede (clic destro su un take → *Fissa qui*; × lo sgancia). Quando selezioni dei take, la barra dei selezionati prende il posto della striscia, così le schede non si spostano mai. Quella barra è una fila di icone incorniciate: la scelta, i segni, gli spazi, l'esportazione e il cestino in fondo; ognuna si dice al passaggio del puntatore.
- **Filtro** (il pulsante in fondo alla riga di ricerca) apre una finestra come la scelta dello spazio: spunta cosa cercare in tre gruppi (come è stato fatto: grezzo (come esce dal modello), importato, rigenerato, ri-renderizzato; segnato: mi piace, non mi piace, preferiti, con una nota, con copertina; cosa ha: stem, antironzio, remaster, upscale), ognuno con quanti take del posto, e come si uniscono gli spuntati: tutti (AND), uno qualsiasi (OR) o nessuno (NOR). *Show* li applica; il pulsante poi dice quanti sono attivi e come si uniscono.
- **Seleziona** più take, come in un file manager: selezionane uno, e da lì un clic in qualunque punto di un'altra scheda la seleziona a sua volta (Shift: tutto l'intervallo). Un trascinamento nello spazio vuoto tra le schede disegna una banda che seleziona ciò che tocca; **Ctrl+trascinamento** la disegna da qualunque punto e conserva ciò che era già selezionato. La barra dei selezionati galleggia sopra il lettore: preferito, aggiungi a uno spazio, sposta in uno spazio, togli da questo, nascondi, esporta uno ZIP, nel cestino.
- **Il cestino** restituisce, o cancella per sempre dopo la tua conferma. **Trash (Art)**, accanto nella colonna, tiene l'arte messa da parte (i giri dell'Artista nel cestino, le immagini messe da parte, le copertine tolte ai take) e la rende, o la cancella per sempre dopo la conferma; le copertine di uno spazio di lavoro congelato restano.

### Il menu di un take <!-- #a-take-s-menu -->

![Clic destro su un take](guide/collection-menu.png)

**Rigenera con un nuovo seme** (nel menu del take: Modifica, poi Rigenera): il take rifatto con tutto ciò con cui era stato fatto, ma con semi nuovi; il nuovo eredita gli spazi e la nota del vecchio, e il vecchio aspetta nella sezione *Sorgente della rigenerazione* del suo spazio (il suo spazio non lo mostra tra i propri) finché non la svuoti; il nuovo conserva la sua nota, il suo mi piace, la sua stella e la sua immagine. Una prova esce con i suoi due minuti interi. Riproduci, apri nel Creatore o nel Rifinitore, il foglio (la sua partitura), la scheda tecnica (tutto ciò con cui è stato fatto: lo stile e il testo, la partitura disegnata, ogni manopola, le LoRA con le loro forze e le loro onde; un take in modalità Diretto non ha partitura, e *Scrivila dal suono* ne chiede una al trascrittore), mi piace, non mi piace, preferito, una nota, rinomina, **spazi** (un take può stare in più spazi), **sposta in** uno spazio (su una scheda selezionata: ogni take selezionato, fuori dallo spazio aperto), nascondi, manda allo Scrittore, copia, scarica, **esporta in una DAW** (progetto REAPER o DAWproject, su qualsiasi take: con i suoi stem una volta che il Rifinitore li ha separati), nel cestino. **Su una scheda selezionata, con altre selezionate**, il menu agisce su tutte, e la sua testata dice su quante: mi piace, non mi piace, preferito, copertina, togliere la copertina, spazi, nascondi, uno ZIP; le copertine di più take e la rigenerazione di più take chiedono prima, perché costano minuti di una scheda video.

**Disegna la copertina**: un piccolo modello linguistico (Qwen3-4B) legge lo stile e le parole del take e scrive un prompt per un'immagine; Qwen-Image 2512 la dipinge con Lightning (a 1328 px, tenuta a 1024), in circa due minuti su una scheda da 16 GB con il prompt e la revisione (su una scheda più piccola i suoi blocchi scorrono dalla RAM, un po' più lento; il pittore si sceglie in *Motore → Copertina*). Si vede nel lettore, sulla scheda, nel pannello multimediale del desktop e dentro l'MP3 che scarichi (come sua copertina). Quando un take ha la sua immagine, il menu dice *Apri la copertina* (sopra la pagina, come un clic sull'immagine della scheda o sul quadrato del lettore) e *Ridisegna la copertina* (un nuovo prompt e una nuova immagine; la vecchia resta accanto al take, in `artwork-removed/`). Chi scrive il prompt e il filtro dei contenuti arrivano con `heresy/fetch-heresy.sh --artwork` (8,4 GB, chiede prima), il pittore con `--qwen 2512-q4` o `2512-q6`. *Engine → Artwork* offre tutti i pittori Qwen che ci sono qui: Qwen-Image 2512 e i suoi fine-tune fp8 con Lightning, e Qwen-Image 2.1 (vedi Artista › Una copertina per il take).

### Gli strumenti sotto lo stile <!-- #the-instruments-under-the-style -->

Sotto il campo Stile, lo studio nomina ciò che il tuo prompt chiede: un chip per ogni strumento e stile del prontuario che trova, colorato secondo ciò che ha trovato l'orecchio (verde sentito, ambra in dubbio, rosso non suonato con quel nome) e con l'immagine dello strumento. Posa il puntatore su uno per la sua scheda: l'immagine, la sua terra, come suona, ▶ A e ▶ B con i loro semi. Un clic mostra l'immagine intera. **Alt+I** apre il prontuario da qualunque punto.

### Copertine: cosa le disegna, cosa non sa fare, un altro pittore <!-- #artwork-what-draws-it-what-it-cannot-another-painter -->

**Cosa le disegna.** Un piccolo modello linguistico (Qwen3-4B) legge lo stile e le parole del take e scrive un prompt per un'immagine, il soggetto per primo; Qwen-Image 2512 la dipinge con Lightning (a 1328 px, tenuta a 1024), con i suoi blocchi dalla RAM dove non ci sta intero (*Motore → Copertina*). Quando il take porta il nome di uno strumento (la prova di uno strumento), il suo aspetto guida il prompt parola per parola (che cos'è lo strumento e che cosa non è), e Omni (il modello dell'ascoltatore) guarda l'immagine secondo quell'aspetto: un'immagine in cui non trova lo strumento si dipinge di nuovo, al massimo tre, e quando nessuna lo mostra davvero il take resta senza immagine invece che con una falsa. Circa due minuti per immagine su una scheda da 16 GB, tutto contato.

**Cosa non sa fare** (un'avvertenza, detta senza giri di parole): il pittore disegna ciò che conosce. Uno strumento che non ha mai visto per nome (il duduk, il morin khuur, il khomus, le campane tibetane di cristallo…) esce come un'ipotesi: un flauto di legno, un violino, ciotole da cucina. Dove Omni non ha trovato lo strumento in nessuna delle tre immagini, l'immagine è segnata **≈ un'ipotesi**, nella vista sovrapposta e nel prontuario degli strumenti. Una copertina è l'umore del take, non un'immagine di riferimento di uno strumento: per sapere com'è fatto uno strumento, cercalo.

## Addestratore LoRA <!-- #lora -->

Provato sulle nostre canzoni e voci, l'allenatore resta per ora al 90 %: i tuoi set e i tuoi scenari non sono i nostri, quindi raccontaci com'è andata (nel repository, *Trainer report*: il set, la modalità, le impostazioni, cosa hai sentito).

### Cosa insegna una LoRA a YuE2 <!-- #what-a-lora-teaches-yue2 -->

Una LoRA è un piccolo adattatore sopra entrambe le metà. **Lo stile viene soprattutto dalla metà sonora; il seguire il testo, dalla metà musicale**, e la metà musicale impara a memoria i set piccoli in fretta (la sua loss scende verso 0). Tipi:

| tipo | dati | cosa impara |
|---|---|---|
| **Stile** | 20+ canzoni di uno stesso suono | genere, produzione, il suono di una band |
| **Voce** | una sola voce, cantata o parlata: canto (idealmente a cappella), letture, audiolibri | un timbro |
| **Lingua** | molte voci, testi esatti | la dizione di una lingua |
| **Artista** | un catalogo grande e vario | tutto quanto |

**Un adattatore di voce impara da qualsiasi forma della voce**, non solo dal canto: vanno bene anche letture e audiolibri. Misurato qui (05.10.2026): un adattatore addestrato sulle letture di un attore parlava con la sua voce e, cantando, cantava con il suo colore. Chiama un adattatore così per il tipo di voce (basso, baritenore, contralto…), mai per una persona: `lab/voice_kind.py` misura la voce di un set dall'altezza del parlato.

**Quanta forza a un adattatore di voce.** Ascoltato su una canzone (19.10.2026: l'adattatore di un narratore, rango 32, su una ballata folk tragica): a 1.0 la voce copre la musica e il take diventa instabile, a 0.8 la brucia ancora, 0.7 è il tetto da cui partire, e 0.4–0.6 rende meglio la voce. Una forza bassa lascia andare l'altezza propria della persona e tiene la tonalità della voce: la canzone ne prende il colore, non il marchio. Le sue due metà non sono uguali: quella musicale (AR) scrive la partitura con il modello, per entrambi i pentagrammi, e una voce imparata dal parlato spegne le note quando è alta; tienila a 0.5 al massimo, e dai a quella sonora (NAR), che porta il timbro, fino a 1.0 (ascoltato lo stesso giorno: AR 0.4 con NAR 1.0 hanno tenuto intera la musica e stabile la voce). I cursori disegnano così la strada di un adattatore di voce: uno il cui nome dice voice o vocal diventa rosso oltre 0.5 sulla metà musicale e oltre 1.0 su quella sonora.

![L'Addestratore LoRA: la telemetria di un'esecuzione](guide/studio-train.png)

### Perché adattatori tuoi <!-- #why-your-own-adapters -->

Un modello aperto nudo, per quanto forte, resta corto su strumenti, stili e voci: sa ciò che ha sentito nel suo addestramento, e il tuo suono raramente c'è. I tuoi adattatori colmano quel divario; sono l'armatura del guerriero professionista dell'audio e della musica. Il passo più sicuro verso l'alto: raccogli i tuoi brani migliori, quelli fatti su SUNO (con un piano a pagamento sono tuoi) o ovunque altro i diritti siano tuoi, e addestra su di essi un adattatore **Stile**, con il testo esatto accanto a ciascuno. Allora YuE2 scrive con il tuo suono e non accanto: i tuoi strumenti, i tuoi arrangiamenti, la tua produzione. Aggiungi un adattatore **Voce** per il cantante che vuoi, e le canzoni si cantano con quel colore. Uno stile addestrato su venti tue canzoni porta il modello più in alto di quanto qualsiasi prompt possa spingerlo.

### 1 Materiale <!-- #1-material -->

Metti una cartella di canzoni in `datasets/raw/` e sceglila. Scegli quali tracce entrano, dai a ciascuna il suo testo (trovato accanto per nome quando c'è) e, se le serve, uno stile tutto suo. Le tracce sotto i 30 secondi restano fuori per impostazione predefinita; quelle lunghe vanno bene (la metà musicale si addestra sull'intera canzone).

**Voce**: *Measure the voice* ascolta fino a dodici tracce della cartella e dice, sul parlato, se la voce è maschile o femminile e il suo registro (basso, baritono, baritenore, tenore; contralto, mezzo, soprano), con l'altezza del parlato, e propone per il set un nome fatto di questo, come sono chiamati gli adattatori di voce pubblicati (`voice-ru-m-baritenor-117`): nessun nome di persona. Sul canto dà l'estensione cantata e lascia la voce al tuo orecchio. Dove l'altezza da sola non decide (140–175 Hz parlando), di' ♂ o ♀ e misura di nuovo. È una bozza da misura: decide l'orecchio, e la voce con cui poi canta YuE2 può stare più in alto o più in basso.

### 2 Il set <!-- #2-the-set -->

Una **parola trigger** (una parola insolita, per es. `fosforida`) chiama poi lo stile per nome; la **riga di stile comune** dice cosa si sente. *Crea il set* scrive `datasets/prepared/NAME/`: audio a 48 kHz e una didascalia per traccia.

L'**ascoltatore** (Qwen2.5-Omni, su qualsiasi scheda con circa 8 GB liberi) ascolta ogni traccia e ne abbozza i tag; tu li correggi e premi *Scrivi nelle didascalie*. È una bozza a qualunque dimensione: leggila.

### 3 Addestra <!-- #3-train -->

![Un tipo, le manopole, una scheda](guide/train-knobs.png)

Scegli un set creato al passo 2, poi un **tipo**: regola le manopole per ciò che insegni (la tabella sotto l'elenco), e ognuna si può cambiare prima di *Addestra*. Il modulo, campo per campo:

- **Tipo**: stile, voce, lingua o artista.
- **Nome dell'esecuzione**: la cartella dell'esecuzione (`training/NAME/`) e i nomi dei suoi adattatori (`loras/NAME/NAME-eNNN`, subito tra i LoRA del Creatore). Un nome appartiene a una sola esecuzione: se è preso, la pagina ne chiede un altro.
- **Addestratore**: **Ruach Studio**, quello dello studio, su pesi bf16 non quantizzati; crea da sé la cache latente del set; Diretto o con una partitura, sulle canzoni così come sono o separate. Portato riga per riga dall'**AI-Toolkit** di Ostris (MIT), con le cui curve concordava epoca per epoca sullo stesso set; l'AI-Toolkit stesso ha lasciato lo studio quando tutto ciò che addestrava è stato qui.
- **Pesi di base**: bf16, il modello intero (una scheda da 24 GB), o int8 per schede più piccole, un po' meno esatto. Il file del modello di base non cambia mai: impara solo l'adattatore.
- **Schede**: quante GPU prende l'esecuzione, 1, 2 o 3, tra le schede date all'addestramento in Engine → GPUs. Ogni scheda tiene il modello intero e impara le proprie canzoni; le loro lezioni si mediano a ogni passo (parallelismo dei dati), così due schede attraversano un'epoca circa due volte più in fretta e tre circa tre, un numero dispari come uno pari. Il batch cresce con le schede e il tasso di apprendimento lo segue (× √schede): nient'altro da impostare. Una matrice tagliata tra le schede (parallelismo dei tensori) non si usa: YuE2 sta intero in una scheda da 24 GB, e su schede senza NVLink tagliare ogni strato costa più di quanto rende.
- **Epoche**: quante volte l'esecuzione percorre il set, ogni traccia una volta per epoca, una traccia per passo: i suoi passi sono le tracce del set per questo numero (2016 tracce per 12 epoche fanno 24 192 passi). La metà sonora ascolta una finestra di 60 secondi della traccia, tagliata a caso ogni volta; quella musicale legge la canzone dal suo inizio.
- **Salva ogni N epoche**: un adattatore alla fine di ogni N-esima epoca, ognuno da ascoltare e confrontare; si tengono tutti, con lo stato dell'ottimizzatore accanto al più recente (un'esecuzione fermata conserva ciò che ha imparato). **Fermati al plateau, poi solo la metà del suono** (attivo di default): due tracce su cento restano fuori e si ascoltano a ogni epoca; quando la metà del suono smette di migliorare su di esse per 3 epoche, quella musicale si ferma alla sua epoca migliore e quella del suono prosegue da sola fino a 12 in più. Una voce è venuta così più pulita. N scende fino a un decimo di epoca (0.1: dieci salvataggi per epoca, con nomi e001.3 e così via), così un set grande si ascolta mentre impara.
- **Rango**: quanto è largo l'adattatore; la sua quota dei pesi e la sua dimensione sono nel suggerimento del campo (quanto costa ogni rango e quale per cosa: sotto).
- **Learning rate**: quanto è grande ogni passo della metà sonora (AdamW, lo stesso per tutta l'esecuzione); quello della musicale è questo per la **Velocità AR**. I tipi tengono 0.0001; la metà è più delicata, per un'esecuzione lunga su un set grande; più alto impara più in fretta e dimentica di più.
- **Dissolvenza del LR, epoche** e **LR alla fine, %**: nelle ultime epoche dell'addestramento il learning rate scende in linea retta, fino a quanto ne resta all'ultimo passo (0 % lo spegne del tutto): il modo abituale di chiudere un addestramento, perché gli ultimi salvataggi si assestino invece di avanzare con passi altrettanto forti. Segue la durata dell'addestramento, così uno prolungato a più epoche sfuma alla sua nuova fine, e proseguirlo prende tutte le manopole che gli erano state date, la dissolvenza compresa. 0 epoche, come all'inizio: nessuna dissolvenza, il rate uguale fino alla fine.
- **Peso AR**, **Ancora AR (KL)**, **Velocità AR**: le tre manopole della metà musicale, sotto.
- **Modalità**: **Diretto** è per canzoni fatte in modalità Diretto; **Completo (partitura)** e **Melodia**, per canzoni fatte in quelle modalità, insegnano inoltre alla metà musicale a scrivere prima una partitura, che il motore trascrive da ogni canzone prima dell'addestramento; metà dei passi va senza partitura, così il Diretto non si dimentica. **Separa voce e musica**: ogni canzone si divide prima in voce e musica col separatore dello studio (una volta per set, minuti a canzone), e la metà musicale impara anche la voce dal solo testo e la musica dai soli tag.
- Sotto il pulsante: la VRAM misurata delle esecuzioni precedenti e quale scheda è ora abbastanza libera.

| tipo | rango | passi | peso AR | ancora AR | velocità AR | a cosa serve |
|---|---|---|---|---|---|---|
| **Stile** | 32 | 1500 | 0.5 | 0.2 | 0.5 | un suono: genere, produzione, quello di una band |
| **Voce** | 16 | 1500 | 0.3 | 0.3 | 0.5 | un timbro: la metà musicale tenuta vicino alla base |
| **Lingua** | 32 | 3000 | 1.0 | 0.1 | 1.0 | dizione: la metà musicale deve cambiare |
| **Artista** | 32 | 3000 | 0.7 | 0.2 | 0.7 | tutto insieme |

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
- **Epoche**: la metà musicale impara a memoria un set piccolo in fretta (la sua loss scende verso 0): le epoche verdi della Telemetria sono quelle da ascoltare per prime, spesso molto prima dell'ultima.
- **La frequenza di campionamento del materiale**: la metà sonora lavora a 48 kHz, quella musicale ascolta a 24 kHz. Una registrazione a 24 kHz insegna tutto alla metà musicale, ma alla sonora solo degli acuti spenti: ricampionare non aggiunge nulla sopra la metà della frequenza originale. Per un timbro, dalle 44,1 o 48 kHz.
- **Memoria**: la misura è una scheda da 24 GB. I pesi bf16 occupano 7,5 GB; l'adattatore, i suoi gradienti e il suo ottimizzatore 16 byte per peso (rango 32: meno di 1 GB; rango 128: 3,8 GB; rango 256: 7,5 GB); il resto sono le attivazioni della lezione, e la metà musicale legge tutta la canzone: misurati 17,7 GB al picco con rango 32 su canzoni di qualche minuto, circa 11 GB su brevi clip di voce. **Sotto i 16 GB, non addestrare ranghi grandi**: pesi int8, rango da 16 a 32, clip brevi. Il rango 256 su una scheda da 24 GB è al limite.
- **Ogni salvataggio è una media mobile** dell'adattatore all'incirca sulla sua ultima epoca (EMA), entrambe le metà, e le tracce tenute da parte si ascoltano su di essa: il rumore dei singoli passi è smussato in ciò che senti e in ciò che ferma l'esecuzione. I pesi grezzi per proseguire restano accanto (`resume.safetensors.raw`).

### Le tre manopole della metà musicale <!-- #the-music-half-s-three-knobs -->

Ogni passo insegna alle due metà separatamente. La metà sonora impara sempre il suono: togliere il rumore dalla sua finestra della traccia (la loss flow). Quella musicale impara solo quando il **Peso AR** è sopra 0, e allora la tirano due cose insieme:

- **la sua lezione** (ar_ce): prevedere i token della canzone stessa dal suo inizio, parola per parola e nota per nota: dizione, fraseggio, abitudini melodiche, la forma di una canzone;
- **l'ancora** (ar_kl): in ognuno di quei punti l'addestratore chiede al modello di base, la stessa metà musicale con l'adattatore spento, che cosa scriverebbe lì, e multa l'adattatore per ogni passo lontano da quello.

La loss di un passo è flow + Peso AR × ar_ce + Ancora AR × ar_kl. Che cosa fa ogni manopola:

- Il **Peso AR** decide se la metà musicale impara del tutto, e quanto forte la sua lezione tira contro l'ancora. A 0 la metà musicale resta il modello di base (la sua parte dell'adattatore resta vuota: tutti zeri, misurato), l'adattatore è un timbro sulla sola metà sonora, e l'ancora non fa nulla.
- L'**Ancora AR** tira la metà musicale indietro verso il modello di base, perché conservi ciò che il set non mostra: il canto dopo un set di letture, altre lingue, seguire parole nuove, scrivere una partitura. Senza ancora va alla deriva dove la porta il set.
- **Le due tirano l'una contro l'altra, e conta solo il loro rapporto, non la loro grandezza.** AdamW misura ogni passo sulla grandezza dei propri gradienti recenti, quindi una loss moltiplicata per un numero insegna ciò che insegnava prima: 0.5 con un'ancora di 0.2 è 1.0 con 0.4. Leggi l'ancora come una quota del peso: un decimo lascia muovere la metà musicale (Lingua), quanto il peso la tiene vicino alla base (Voce).
- La **Velocità AR** è il vero acceleratore della metà musicale: il suo learning rate è il learning rate per questa, l'unica manopola che la fa imparare più in fretta o più piano. I tipi la tengono a 0.5 (Lingua a 1.0): la metà musicale impara a memoria un set piccolo molto prima che la sonora abbia il suo timbro.

Misurato qui (10.10.2026: 40 passi su un set di 60 letture, rango 16, un solo seme; *spostamento*: quanto è venuto grande il cambiamento che l'adattatore porta alle matrici della metà musicale):

| peso AR · ancora · velocità | spostamento | distanza dalla prima riga | ar_kl, i suoi ultimi dieci passi |
|---|---|---|---|
| 0.5 · 0.2 · 0.5 (quelli di Stile) | 1.32 | la stessa esecuzione di nuovo: 1 % | 0.257 |
| 1.0 · 0.4 · 0.5 (entrambi raddoppiati) | 1.36 | 5 % | 0.262 |
| 0.5 · 0 · 0.5 (senza ancora) | 1.44 | 23 % | — |
| 0.5 · 0.5 · 0.5 (l'ancora pari al peso) | 1.21 | 17 % | 0.132 |
| 0.5 · 0.2 · 1.0 (velocità raddoppiata) | 2.32 | 99 % | 0.443 |
| 0 · 0 · 0.5 | 0 | non ha imparato nulla | — |

Raddoppiare entrambi ha cambiato l'adattatore del 5 %, contro l'1 % della stessa esecuzione due volte; la quota dell'ancora l'ha spostato da un sesto a un quarto; raddoppiare la velocità l'ha portato tre quarti più lontano. La metà sonora condivide con quella musicale solo il clipping dei gradienti: da una riga all'altra è variata dal 4 al 13 %, contro il 2 % della stessa esecuzione due volte.

Che cosa girare, secondo ciò che senti e vedi:

| quando | gira |
|---|---|
| vuoi solo un timbro (una voce da letture, uno strumento) | Peso AR basso e l'ancora pari (i 0.3 e 0.3 di Voce), o Peso AR 0 |
| vuoi la dizione di una lingua, il fraseggio di uno stile | Peso AR 1.0, l'ancora un decimo di esso, Velocità AR 1.0 (quelli di Lingua) |
| ar_ce scende presto sotto 0.3: sa le canzoni a memoria | Velocità AR giù, o la quota dell'ancora su; o ascolta un'epoca precedente |
| l'adattatore canta le melodie delle canzoni d'addestramento su parole nuove, o perde il testo | la quota dell'ancora su: pari al peso, o di più |
| ar_kl resta vicino a 0 e la dizione non è arrivata | Velocità AR su, o la quota dell'ancora giù |

### 4 Telemetria <!-- #4-telemetry -->

![Le curve di entrambe le metà, spiegate sotto ciascuna](guide/train-charts.png)

Le esecuzioni in addestramento stanno in cima alla stanza con il loro avanzamento, il tempo rimanente ed entrambe le loss. La telemetria di un'esecuzione mostra il suo avanzamento, poi dei riquadri: la velocità, da quanto è in corso e quanto manca, gli ultimi valori di flow, ar_ce e **ar_kl** (quanto la metà musicale si è allontanata dal modello di base: 0 finché il Peso AR è 0), il picco di VRAM e la scheda; poi due curve:

- **Metà sonora · perdita flow**: quanto bene la metà sonora prevede il rumore che deve togliere. Salta da un passo all'altro (ogni passo estrae un livello di rumore a caso): leggi la linea spessa, la media mobile.
- **Metà musicale · ar_ce**: quanto bene la metà musicale prevede i token della canzone stessa. Vicino a 0 conosce le canzoni a memoria; allora un'epoca precedente è l'adattatore migliore.

Passa il puntatore su una curva per leggere il passo, la sua epoca e il valore in quel punto. **Confronta con…** sovrappone a queste le curve di un'altra esecuzione, tratteggiate. Il pulsante accanto a **Il log** mette le due curve una sotto l'altra, ognuna a tutta larghezza, o di nuovo affiancate. **Il log** si apre in fondo alla stanza, largo quanto le sue righe, accanto al log del server.

### Le epoche da ascoltare per prime <!-- #the-epochs-worth-hearing-first -->

![Verdi: da ascoltare per prime; ✓: in loras/](guide/train-epochs.png)

Ogni epoca salvata è un chip. Le **verdi** sono quelle da ascoltare per prime, lette dalle curve: la prima epoca la cui loss sonora si è assestata, quella con la loss sonora più bassa e l'ultima prima che la metà musicale sappia le canzoni a memoria. È un'ipotesi; decide l'orecchio. Scegli un'epoca: **In loras/ → il Creatore** (compare subito tra le LoRA), **Fuori da loras/** o **Scarica**.

> **Un adattatore addestrato senza partitura (Diretto) va sulla metà musicale solo nelle esecuzioni in Diretto.** In Piano completo la sua metà musicale può rompere la partitura anche a forza bassa: lì, dagli solo la metà sonora.

### Esecuzioni <!-- #runs -->

![Ogni esecuzione è una scheda](guide/train-runs.png)

Ogni esecuzione è una scheda a destra: *Attive*, *Tutte*, *Archiviate*, *Cestino*, con ricerca. Un'esecuzione in addestramento si illumina come un take che suona. ⋯ su una scheda: la sua telemetria, il suo log, archiviala, fermala o cancellala nel cestino (ti viene chiesto se i suoi adattatori in loras/ se ne vanno con lei). Dal Cestino torna, o se ne va per sempre. Sotto, gli addestramenti per stato: **In corso**, **In pausa**, **Finito**, **Fermato**, **Fallito**, ciascuno col suo numero, uno alla volta (un altro clic mostra tutti). **Pausa** su un addestramento in corso salva ciò che ha imparato e aspetta; **Riprendi** continua da quel salvataggio con lo stesso set, manopole e schede.

## Motore <!-- #engine -->

Il Motore si apre sopra la stanza in cui ti trovi (☰ › Motore, oppure Ctrl+Alt+9), con le sue schede per tema dietro le linguette a sinistra, nell'ordine in cui le si percorre: **Server e log**, **Hardware** (la scheda, Calcolo, le GPU), **Modelli e LoRA** (con i VAE e le LoRA), **Scrittore e copertina**, **Cartelle e sicurezza**, **Aspetto**, **Aggiornamenti e informazioni**. ↑ e ↓ passano da una linguetta all'altra, e il Motore si riapre sulla linguetta dove l'hai lasciato; Esc, **Chiudi** o un clic sulla stanza oscurata intorno lo chiudono.

### La macchina <!-- #the-machine -->

![Motore](guide/studio-engine.png)

- **Server**: ciò che il motore fa girare: il modello, i decoder, il contesto, la libreria.
- **Calcolo**: la copia del **modello** (BF16 7,2 GB, Q8_0 3,8 GB, Q6_K e Q5_K_M più piccole), **Preimpostazione della memoria GPU** (*Auto* adatta il contesto e le tile del VAE alla scheda; *Auto within N GB* fa lo stesso per quella quantità e lascia il resto della scheda a ciò che altro gira su di essa (su un portatile da 16 GB, 14); *Manuale* le lascia a te), **Tieni i modelli caricati**. **Scan the machine** dice che cosa ha la macchina e che cosa le si addice (il modello di base, le manopole di Auto, il pittore), come fa uno studio nuovo una volta al primo avvio. Le fusioni scaricate (**More models**) stanno nell'elenco dopo i modelli di m-a-p, nella loro linea: IRA, IRAE, IRAEv2, IRAEv3; ciascuna nei suoi formati, dalla più completa. Il fine-tune proprio di Ruach Studio, **RS-FW** (sette fusioni di YuE2-RS-FW, ciascuna con la sua epoca e la sua forza nel nome), arriva con l'installazione come RS-FW 2.4x0.75, il modello predefinito dello studio, e parte ogni volta che non è scelto un modello; le altre sei sono in **More models**.
- **Hardware**: la memoria della scheda ora; **Rilascia il modello** la libera subito.

### GPU: quale scheda fa cosa <!-- #gpus-which-card-does-what -->

![Quale scheda fa cosa](guide/engine-gpus.png)

Su una macchina con più schede, dai a ciascuna il suo lavoro: lo **studio** (la sintesi) su una scheda, l'**addestramento** sulle schede che gli assegni, i **lavori** del laboratorio (l'ascoltatore, Whisper, stem, remaster, upscale) sulle loro. Mentre un'esecuzione si addestra sulla scheda dello studio stesso, una sintesi aspetta, e la pagina dice perché. Con una sola scheda funziona così: addestra, poi crea. Una nuova scheda per lo studio ha effetto dopo un riavvio (il pulsante compare quando serve). I lavori del laboratorio restano sulle schede spuntate per loro, l'Artista compreso: quando sono piene, un lavoro aspetta una di esse (Whisper passa al processore) e non prende mai una scheda non spuntata per il laboratorio. Un'esecuzione dell'Artista va sulla scheda dove il suo modello è tenuto dall'esecuzione precedente, con i pesi già nella RAM.

**Intel Arc (beta).** La sintesi dello studio gira anche su una scheda Intel Arc, con il suo motore compilato da `./build.sh --sycl` (INSTALL.md, «Intel Arc (beta)»): canzoni, adattatori, Full, Extend. Le schede di questo elenco sono NVIDIA; il motore Arc calcola sulla propria scheda, mentre l'addestramento e le copertine restano sulle NVIDIA.

### Decoder, adattatori, il modello dello scrittore, l'aspetto <!-- #decoders-adapters-the-writer-s-model-the-look -->

- **VAE**, **LoRA**: ogni file che lo studio ha trovato, con la sua fonte e ciò che fa.
- **Modelli e LoRA** (Models and LoRAs): ciò che porta l'installazione, parte per parte (i decoder extra, Whisper, i modelli degli stem, UniverSR, i LoRA), come li ha trovati l'ultimo passaggio, e **Check again** per guardare di nuovo. Una parte incompleta elenca ciò che manca e ha il suo **Fetch**; **Fetch what is missing** li scarica tutti; un download interrotto riprende da dove si era fermato. **More models**: un altro backbone (BF16 accanto a Q8_0), l'ascoltatore di stile, il pittore dell'Artista, la base dell'allenatore, ciascuno con le sue varianti e dimensioni, la variante già presente segnata, e ciascuno chiesto prima con la sua dimensione. Un nuovo backbone o decoder arriva al motore al suo prossimo avvio (**Restart the engine**); i nuovi LoRA subito. Tra questi le fusioni IRA e IRAE: YuE2 con adattatori della comunità incorporati (Instrumental e Real Audio di Mothersuperior; in IRAE, Epic Trailer di monsterovich, in tre intensità).
- **Riconosciuti dal contenuto**: un adattatore o un file di modello rinominato, spostato in una cartella propria o con l'intestazione riscritta è ancora qui: lo studio e la sua installazione lo riconoscono dal suo SHA-256 e, per un `.safetensors`, dallo SHA-256 dei suoi tensori (dal `MANIFEST.tsv` del repository dei modelli), e non scaricano nulla di nuovo.
- **Artwork**: chi dipinge la copertina di un take: secondo le schede (Qwen-Image 2512 Q6 o Q4 intero dove una scheda lo contiene, altrimenti Q4 in streaming dalla RAM su una scheda più piccola) o uno scelto tra i pittori Qwen che ha questa macchina (Qwen-Image 2512 Q4 o Q6 e ogni fine-tune fp8, con Lightning; Qwen-Image 2.1 con la sua licenza detta).
- **Scrittore**: l'indirizzo del server di chat locale (vLLM, LM Studio, Ollama), *Prova la connessione*.
- **Aspetto**: 22 temi (scelti per crearci dentro: chiari e quieti), gli angoli, i quattro caratteri (testo, titoli, numeri, nomi delle stanze). **Ora del take**: l'ora di un take sulla sua scheda e ovunque appaia, quanto tempo fa (il predefinito) o la data e l'ora esatte; un clic sull'ora di una scheda la gira per quel take.
- **Caratteri**: oltre al testo, ai titoli, ai numeri e ai nomi delle stanze, i *segni delle sezioni* sull'onda (IBM Plex Mono di default) e i *pulsanti* (quello del testo di default); ognuno tranne il testo con la sua dimensione rispetto al testo, da −2 a +2 pt.
- **Log del server**: il log intero; **Informazioni**: ogni progetto su cui poggia lo studio, con il suo link.
- **Aggiornamenti**: le versioni di Ruach Studio su GitHub rispetto a questa: ogni quanto guardare (ogni giorno, settimana, mese, mai), anche le candidate, e quando ne esce una, chiedere o aggiornarsi da sola quando nulla è in corso (solo dove lo studio è un clone del suo repository; altrove dice come aggiornare a mano). Uno studio nuovo, e ogni aggiornamento, offre i set 💎 che non ha ancora.
- **Sicurezza** (Security): chi può aprire lo studio: solo questo computer, questo computer e le reti private (il default; anche il Wi-Fi di un bar o di un albergo lo è) o questo computer e le reti che elenchi (10.0.0.0/24); il motore lo tiene in `user/access.json` e risponde secondo esso subito. Uno studio il cui utente non ha ancora deciso chiede all'avvio, con una breve guida e «La mia decisione è consapevole». Una scelta che lo chiuderebbe alla macchina da cui chiedi viene chiesta di nuovo; cancellare `user/access.json` torna alle reti private.
- **Cartelle** (Folders): dove vive il tuo lavoro (le canzoni con gli spazi di lavoro scaricati, il cestino, le immagini dell'Artista, i documenti dello Scrittore), quanto tiene ciascuna e lo spazio rimasto sul suo disco. **Move…** porta una cartella in qualunque altra cartella o disco: lo studio dice prima cosa farà (sullo stesso disco una rinomina; su un altro una copia controllata file per file, poi il collegamento cambiato) e sposta solo al secondo sì, mentre nulla viene renderizzato; la vecchia copia resta, rinominata, finché non la cancelli. **Back home** riporta una cartella nella cartella dello studio; **Link again** fa puntare di nuovo lo studio a una cartella il cui disco è tornato. I modelli, i LoRA e i set di addestramento restano al loro posto.

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
- La canzone dura le sue battute × questo. La riga del controllo sotto la partitura lo dice: `✓ Native YuE2 score · Em · 90 BPM · 3/4 · 11 bars · ≈ 0:22 long · 0 sections`.
- Una riga di testo vuole il tempo delle sue sillabe: a una croma per sillaba una battuta di 4/4 ne contiene 8, a una semicroma 16 (un rap: le strofe di «Buratino» di Viktor vanno così: `FFFFFEEEE2zDDDDD`).
- Perché la canzone finisca prima, togli battute alla fine della partitura, nelle due voci; per un finale, aggiungi battute lì.

### Lo spazio della voce: Vocal <!-- #the-voice-s-space-vocal -->

- Vocal è ciò che si canta: più o meno una sillaba per nota, una nota legata una sillaba tenuta, pause dove il cantante respira. La tabella del controllo dice quante note, quante al minuto, l'estensione e per quanto del tempo la voce suona.
- Note e sillabe: con più note che sillabe il modello stira le sillabe su di esse o ne aggiunge di sue; con meno, stringe le parole. Il contatore del testo in Composizione misura ogni riga con il tempo che occupa: dai alla riga più o meno altrettante note.
- Il rap è denso (semicrome su una o due altezze: lo porta il ritmo), una ballata ha note lunghe. Lascia una pausa alla fine di una riga: lì la voce respira e gli strumenti rispondono.
- Lo spostamento di voce sotto la partitura (*Sposta*) muove Vocal per gradi della scala (una terza, una quarta, un'ottava) dove sta troppo alta o troppo bassa per il cantante; gli accordi e Ins restano. Misurato il 21.10.2026: il modello segue Vocal spostata un'ottava sotto (ha cantato da 9 a 10 semitoni più in basso), e la voce può cambiare registro con essa: un contralto femminile spostato giù è uscito tenore o baritenore maschile, e una voce maschile spostata su può uscire femminile; anche la band può scendere. I ▼ ▲ accanto a un adattatore di voce (in Full, con la partitura) fanno lo stesso una volta.

### Lo spazio degli strumenti: Ins <!-- #the-instruments-space-ins -->

- Ins è la riga propria degli strumenti: il riff dell'introduzione, le risposte tra le frasi, un assolo, il finale. Una melodia, non gli accordi (quelli stanno in Vocal): una riga, e YuE2 arrangia la band intorno a essa.
- **Sotto la voce Ins per lo più tace.** Le cover ufficiali tengono `Z4` sotto ogni gruppo cantato e suonano nell'introduzione, tra le sezioni e alla fine; i take di Viktor in Piano completo fanno lo stesso (un arpeggio nell'introduzione, `Z4` sotto le strofe, un riempimento nei passaggi). Un Ins affollato sotto una riga cantata è una seconda melodia contro la voce, e le partiture native lo evitano.
- Il controllo lo riassume come **Ins : Vocal**, le note dell'una contro quelle dell'altra: sopra 1.5 la maggior parte delle note la portano gli strumenti, sotto 0.67 la voce, in mezzo più o meno pari.
- Uno strumentale: Vocal tace (`Z`) per tutta la canzone e Ins porta la melodia. *Rendila strumentale* sposta la melodia vocale di una partitura in Ins (la ricetta ufficiale) e spunta *Strumentale*. Un adattatore di partitura strumentale a piena forza con parole da cantare dà una voce senza note: tienilo basso quando c'è un testo (Creatore › VAE e LoRA).

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
| **F5**, **Ctrl+R**, **Ctrl+Maiusc+R** | ovunque tranne il Bibliotecario | dopo qualcosa di scritto (da quando la pagina è arrivata o da **Ctrl+S**) chiedono prima, altrimenti ricaricano subito; chiedendo, dicono cosa si porta via il ricaricamento e cosa tiene; con una canzone nel modulo, *Save to the Writer, then reload* la salva anche nello Scrittore; **Ctrl+F5** ricarica subito (nel Bibliotecario **F5** rilegge la biblioteca) |
| **Invio** / **Esc** | una finestra di dialogo, una rinomina sul posto, un valore digitato di una LoRA | conferma / annulla; in una finestra con testo lungo **Shift+Invio** va a capo |
| **Invio** | *Parti da un'idea* | il modello di chat abbozza la canzone; **Shift+Invio** va a capo |
| **Ctrl+S**, **Ctrl+Maiusc+S** | ovunque | salvano subito tutto: la canzone nel modulo, il documento aperto dello Scrittore, le impostazioni (mai «Salva pagina» del browser) |
| **Ctrl+N** | ovunque, nella finestra di Pinokio | canzone nuova nel Creatore (chiede prima se il modulo ha parole); un browser tiene Ctrl+N per la propria finestra nuova |
| **Alt+K** · **Alt+J** | il testo, del Creatore e dello Scrittore | segnare la riga del cursore o togliere il segno · andare al segno successivo (**Alt+Shift+J** a quello prima, **Alt+Shift+K** li toglie tutti) |
| **Alt+E** | il Creatore | solleva il testo sopra tutto e lo rimette a posto; **Maiusc+Tab** sopra di esso lo porta nel modulo sollevato |
| **Alt+O** · **Alt+L** · **Ctrl+Y** · **Alt+↑ ↓** | il testo, come in mcedit | togliere i segni · andare a una riga per numero · cancellare la riga · spostare la riga (o quelle selezionate) |
| **Ctrl+F** · **F4**, **Ctrl+H** | il testo, lo stile, i riquadri dello Scrittore | trovare solo in quel riquadro · trovare e sostituire (**Invio** la corrispondenza attuale, **Ctrl+Invio** tutte; **Alt+C** maiuscole e minuscole come scritte) |
| **↑ ↓** · **→** · **←** | un menu | muoversi · aprire un sottomenu · uscirne |
| **frecce** | il selettore dei temi | muoversi tra i temi |
| **+** **−** **0** | un pentagramma o uno spettro a schermo intero | ingrandisci, rimpicciolisci, torna ad adattare; **Ctrl+rotellina** ingrandisce dove sta il puntatore |
| **[** · **]** · **Ctrl+Z** · **Ctrl+Shift+Z** | il DAW | la sezione prima · la sezione dopo · annulla · ripeti |
| **Barra spaziatrice** · **Home** · **L** | il DAW in vista | suona e ferma · all'inizio (del loop, se è acceso) · il loop sì e no |
| **M** · **S** · **↑ ↓** | il DAW, la traccia scelta con un clic sul nome | silenziarla · solo · un'altra traccia |
| **+** **−** **0** · **Ctrl+rotellina** · **Shift+rotellina** | il DAW | ingrandisci, rimpicciolisci, tutta la canzone · zoom attorno al puntatore · lungo la canzone |
| **F11** | la scheda dello studio | il DAW in vista a schermo intero e ritorno; altrove tutto lo studio a schermo intero |
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
