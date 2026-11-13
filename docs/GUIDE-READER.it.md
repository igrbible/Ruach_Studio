## Lettore <!-- #reader -->

Il Lettore, la stanza dopo il Videografo, trasforma un testo in voce: un capitolo, un libro, un radiodramma, un podcast, una voce sopra un clip. Legge con una voce costante o come un dialogo di più voci, ascolta ogni pezzo letto e mette la ripresa nella Biblioteca come vi mette una canzone.

![Il Lettore di giorno: il testo e la sua voce a sinistra, le letture a destra](guide/reader.png "Il Lettore: il testo, la voce, il motore, le letture")

### Che cosa fa <!-- #what-it-does -->

**Modalità** dà due modi di leggere. **Narrazione**: una voce legge tutto il testo, tagliato per **frasi** (pezzi di circa duecento caratteri, una riga vuota una pausa più lunga) o per **versetti** (una riga per pezzo, senza leggere il numero del versetto né i numeri di Strong); il primo pezzo che dura 2.5 s diventa il riferimento di tutti i successivi, così la voce tiene per tutto il capitolo. **Dialogo**: una riga per battuta, scritta `Name: words`, una voce per ogni parlante; una riga senza nome continua la battuta precedente.

**Leggi** avvia la lettura. Attende in coda come gli altri lavori pesanti del laboratorio, con la sua barra sopra il player e le sue righe nel log. La sua scheda dice la quantizzazione e il tempo che resta mentre legge; alla fine la durata, la velocità, ciò che ha sentito Whisper e la loudness.

### Il motore: Drama 3 <!-- #the-engine-drama-3 -->

Il Lettore legge con Fish Audio Drama 3 (35B MoE, 3B attivi) tramite audio.cpp, da quantizzazioni GGUF in `models/narrator/drama-3-gguf/` con LICENSE e NOTICE accanto; senza di essi il motore non si carica. Legge russo, ucraino, ebraico, greco, inglese, spagnolo, italiano, francese, portoghese, tedesco, giapponese e cinese. Un motore tuo si collega in `user/reader/engines/` con il suo `engine.json` e compare in **Motore** accanto a esso.

### Quantizzazioni e velocità <!-- #quants-and-their-speed -->

![La scelta della quantizzazione e la riga sotto](guide/reader-tier.png "Quantizzazione: che cosa legge, dove e quanto durerà questo testo")

**Quantizzazione** dice quale quantizzazione legge e dove. **Auto · prima la qualità** (il default) prende Q8_0 ovunque entri: 20 banchi di esperti in RAM su una scheda con 23.6 GB liberi, altrimenti tutti i 40 banchi nella memoria della macchina su una scheda con 7.4 GB liberi e 40 GB di memoria libera; poi Q6_K; Q4_K solo dove non entra nessuno dei due (una scheda piccola, poca memoria) e su una scheda Intel. **Auto · prima la velocità** prende per primo Q4_K. Entrambi scelgono in base alla memoria libera all’avvio; una quantizzazione nominata nell’elenco resta quella. Q8_0 è il default perché all’orecchio è uscito il più pulito: nella prova grezza del 09.11.2026 nessuna take di Q8_0 è stata segnata come sbagliata su 20, di Q6_K una su 20, di Q4_K sette su 50, tutti i segni nello stesso punto di giunzione di una frase. L'installazione scarica Q8_0 (41.1 GB) quando la scheda più grande della macchina ha 24 GB o più, altrimenti Q4_K (24.9 GB); su una scheda più piccola Q8_0 si scarica accanto: `bash tools/narrator-setup.sh --quant Q8_0`. Senza, Auto legge con la quantizzazione presente. La riga sotto dice cosa leggerebbe ora e su quale scheda, un secondo di parlato in quanti secondi e quanto durerebbe questo testo con il caricamento del modello.

Misurato su una RTX 3090 il 09.11.2026 con un pezzo russo di 27 s. RTF sono i secondi per leggere un secondo di parlato; Whisper ha sentito giusta ogni lettera salvo dove la riga dice altro:

| quantizzazione | banchi di esperti in RAM | sulla scheda | RAM | RTF | come è stato misurato |
|---|---|---|---|---|---|
| Q4_K | 4 | 21.5 GiB | 3 GiB | 0.62 | la scheda da sola |
| Q6_K | 16 | 21.9 GiB | 11.2 GiB | 1.16 | la scheda da sola |
| Q8_0 | 20 | 23.0 GiB | 17.3 GiB | 1.37 | la scheda da sola |
| Q8_0 | 40 | 6.9 GiB | 33.2 GiB | 2.43 | la scheda da sola |
| Q4_K | 20 | 15.7 GiB | 9.8 GiB | 1.34 | accanto a un lavoro di dataset |
| Q6_K | 28, cuda_perf | 13.8 GiB | 18.6 GiB | 1.74 | accanto a un lavoro di dataset; una parola sentita male |
| Q4_K | 40, cuda_perf | 7.3 GiB | 18.3 GiB | 1.75 | accanto a un lavoro di dataset |
| Q6_K | 40, cuda_perf | 7.3 GiB | 26.0 GiB | 2.46 | accanto a un lavoro di dataset |
| Q8_0 | il solo processore | — | 44 GB | 7.0 | il processore |

Le righe accanto a un lavoro di dataset sono pessimiste: il calcolo della scheda e il processore erano condivisi con esso, e una scheda tutta sua le legge più in fretta. **Q8_0 · 20 banchi di esperti in RAM, 40 su una scheda condivisa** resta su Q8_0: 20 banchi in RAM su una scheda con 23.6 GB liberi; quando la scheda è condivisa, tutti i 40 nella memoria della macchina; con **Auto** come scheda, il processore per ultimo. La prima lettura carica il modello; su una scheda resta caricato tra una lettura e l'altra.

### Su una Intel Arc o un’altra scheda con Vulkan <!-- #on-an-intel-arc-or-another-vulkan-card -->

Drama 3 legge su una scheda Intel (Arc) con la build Vulkan di audio.cpp, in un livello suo: Q4_K con 28 dei suoi 40 banchi di esperti nella memoria della macchina, circa 11 GB sulla scheda e 16 GB di memoria libera. Misurato su una Arc Pro B50 (16 GB) il 12.11.2026: un secondo di parlato in 3.3 s, il caricamento del modello 53 s. Quando la memoria della scheda non basta, il motore sposta altri quattro banchi nella memoria della macchina e continua a leggere. Su una scheda Intel Auto prende solo questo livello, e una quantizzazione pensata per un’altra scheda vi viene rifiutata per nome; Drama 3 non legge mai sul processore a nome della scheda: se la scheda non ce la fa, la lettura lo dice. Al caricatore di Vulkan viene mostrato solo il driver Intel di Mesa, così il renderer software del processore non passa mai per la scheda. Per ora il Lettore manda Drama 3 alla build Vulkan solo su una scheda Intel; la build Vulkan di audio.cpp gira anche su altre schede con Vulkan, ma il Lettore non le instrada ancora.

I pacchetti del sistema, una volta (le intestazioni di Vulkan, il compilatore di shader glslc, le intestazioni SPIR-V, i driver Vulkan di Mesa e vulkaninfo):

```
# Debian, Ubuntu
sudo apt install libvulkan-dev glslc spirv-headers mesa-vulkan-drivers vulkan-tools
# Fedora
sudo dnf install vulkan-loader-devel glslc spirv-headers-devel mesa-vulkan-drivers vulkan-tools
# Arch
sudo pacman -S --needed vulkan-icd-loader vulkan-headers shaderc spirv-headers vulkan-intel vulkan-tools
```

Controlla che il driver veda la scheda: `vulkaninfo --summary` la elenca sotto Devices con il driver di Mesa, come `deviceName = Intel(R) Arc(tm) Pro B50 Graphics (BMG G21)` e `driverName = Intel open-source Mesa driver`. Un elenco con il solo `llvmpipe` vuol dire che il driver manca. `bash tools/narrator-setup.sh --vulkan-check` dice cosa c’è qui e nomina i pacchetti che mancano nel tuo sistema.

Poi la build: `bash tools/narrator-setup.sh` fa da solo la build Vulkan su una macchina con scheda Intel, accanto all’altra; `bash tools/narrator-setup.sh --build --vulkan` fa solo quella, in `build/audio.cpp/build/linux-vulkan-release/`. Servono cmake e un compilatore C++, come per le altre build; l’installazione non installa mai un pacchetto di sistema, lo nomina. Misurato su Ubuntu 24.04 con Mesa 25.2 e Linux 7.0; i dettagli sono in `docs/NARRATOR-VULKAN.md`.

### Voti delle quantizzazioni <!-- #grades-of-the-quants -->

La lista «Quantizzazione» colora ogni quantizzazione secondo la prova grezza del 09.11.2026: la prima lettura di due pezzi russi di 30 s (uno con tag di emozione, uno semplice), cinque seed ciascuno, il campionamento del Lettore (temperature 0.8, top_p 0.9), senza rilettura e senza secondo seed; Whisper large-v3 ha ascoltato parole aggiunte, saltate o scambiate. **Verde**, stabile: nessuna parola sbagliata in nessuna take. **Giallo**, medio: una parola sbagliata in una take su dieci; l’orecchio del Lettore rilegge quel pezzo. **Rosso**, sconsigliato: errori in due take o più, o uno grossolano; Auto non lo sceglie mai, e lo dicono il suo suggerimento e la scheda della lettura. Tutte le quantizzazioni su scheda sono uscite verdi, tutte le 70 take pulite. Dove si calcolano i tensori conta, ma come conta un seed: la stessa quantizzazione con lo stesso seed, i suoi esperti sulla scheda o in RAM (i 20 strati inferiori, centrali o superiori), si separa dai primi 40–60 ms in un’altra lettura, mentre una ripetizione con la stessa disposizione è identica fino al bit. Un seed mostra una strada tra molte: la parola dopo «глубоко» nel set alla cieca del 09.11 (tutte le sue take su un seed) è un’inserzione sonora di 0.7–1 s, non un respiro.

| quantizzazione | banchi di esperti in RAM | take con parola sbagliata | voto |
|---|---|---|---|
| Q4_K | 40 | 0 / 10 | verde |
| Q6_K | 40 | 0 / 10 | verde |
| Q8_0 | 40 | 0 / 10 | verde |
| Q4_K | 20 · inferiori | 0 / 10 | verde |
| Q4_K | 20 · centrali | 0 / 10 | verde |
| Q4_K | 20 · superiori | 0 / 10 | verde |
| Q4_K | 40 · temperature 1.0 | 0 / 10 | verde |
| Q4_K · Q6_K · Q8_0 | solo il processore | in misura | in misura |

### Testo, voci ed emozioni <!-- #text-voices-and-emotions -->

**Voce del lettore**: la voce del motore stesso, tenuta dal primo pezzo; oppure **La tua voce…**, un breve clip di una voce che il motore segue, accettato solo sotto l'avviso rosso e con il consenso spuntato (clonare una voce senza il consenso del suo proprietario è un reato in molti paesi, e la responsabilità è tua). Con lo Studio non arriva nessuna voce pronta. L'altezza di ogni pezzo è misurata mentre viene letto; un pezzo la cui voce è passata all'altro genere viene riletto con un altro seed.

Emozioni e suoni vanno tra parentesi quadre, come li legge Drama 3: `[calm]`, `[sad]`, `[whispering]`, `[pause]`, `[laughs]`. **Tavolozza dei tag** li inserisce: un'emozione, un ritmo o uno stile all'inizio della sua frase, una pausa o un suono al cursore. **Leggere i tag in linea** è attivo per impostazione in un dialogo e spento in una narrazione, dove si vuole una lettura pulita da libro. **Stile** dà a tutta la lettura una parentesi propria, come `calm, warm, unhurried narration`.

### Accenti e l'acuto <!-- #stresses-and-the-acute -->

**Metti gli accenti** segna le vocali toniche prima che il motore legga: i tuoi segni restano come scritti (l'acuto, U+0301, come in `звени́т`), poi il tuo **Dizionario degli accenti**, poi il grande dizionario della lingua, dove c'è: quelli dell'ucraino e del russo arrivano con lo Studio (dell'ucraino quello di lang-uk, dai «Словники України» dell'ULIF; del russo il Dizionario grammaticale di A. A. Zaliznyak, sviluppato dai dati di gramdict, CC BY-NC 4.0: libero per uso non commerciale), e per qualsiasi altra lingua colleghi il tuo (`docs/NARRATOR-DICTIONARIES.md`); una parola con due accenti è lasciata al contesto. **Controlla accenti** mostra il testo come lo leggerà il motore. Una parola letta male in una ripresa: **Correggi** sulla sua lettura, scegli il pezzo, metti l'accento, **Ricorda l'accento nel dizionario** e **Rileggi il pezzo**.

### La mappa dei glifi LCV <!-- #the-lcv-glyph-map -->

**Leggi le lettere LCV con la mappa dei glifi** trasforma le lettere proprie della LCV (Ѓ, Ђ, Љ, ѵ, Ѳ e le altre) in ciò che il motore legge, secondo la tabella dell'autore: `Авраѓа́ма` si legge `Авраהа́ма`. **Mappa dei glifi LCV** sotto il dizionario mostra la tabella; **Salva come mia copia** tiene la tua copia in `user/reader/glyphs.map.tsv`, e da allora si applica quella; **Torna alla tabella dell'autore** la lascia andare. L'interruttore è spento per impostazione.

### L'orecchio e la loudness <!-- #the-ear-and-the-loudness -->

**Ascolta ogni pezzo (Whisper)**, attivo per impostazione: Whisper large-v3 sul processore ascolta ogni pezzo mentre il motore legge il successivo. Un pezzo in cui sente una parola aggiunta, saltata o scambiata, o le cui lettere si discostano dal testo del 12 % o più (una ripetizione, un salto, un borbottio), viene riletto con un altro seed, fino a tre letture, e resta la più vicina al testo. La scheda della lettura dice quali pezzi sono stati riletti e perché, la parola con il suo momento nella ripresa. La ripresa è unita a −16 LUFS, come i podcast, con i picchi mai oltre −1 dBFS. Un orecchio che non si è potuto caricare viene detto nella lettura e nella nota della ripresa, mai preso per una lettura pulita. Spento, il motore legge senza ascoltare: nessun pezzo viene riletto per le sue parole, nessuna lettera viene contata, e la scheda della lettura e la nota della take dicono «Whisper spento», mai una lettura pulita. **Verifica con Whisper** su una lettura finita, o nel menu di una take del Lettore nella Libreria, ascolta una take dopo: la take così come suona viene tagliata dove sta ogni pezzo e ascoltata rispetto alle parole che il motore doveva leggere; le lettere sbagliate e ogni parola segnalata, con il suo tempo nella take, vanno nella nota della take e in `whisper-check.json` accanto a essa. Il suo audio non viene toccato.

### Da una registrazione <!-- #from-a-recording -->

**Da una registrazione** prende una lezione o uno stream (qualsiasi audio, o il suono di un video), e **Trascrivi** lo ascolta con Whisper: le parole con i loro tempi e un testo in paragrafi alle sue pause. **Ripulisci con il modello dello Scrittore** corregge ciò che Whisper ha sentito male, la punteggiatura e le maiuscole, tenendo ogni parola e il suo ordine; **Nel testo** lo mette nel testo del Lettore, come dialogo quando le righe sono `Name: words`.

### Licenze <!-- #licences -->

Drama 3 è sotto la Fish Audio Community License v1.0: libero per la ricerca e l'uso non commerciale, e per l'uso commerciale finché il fatturato annuo resta sotto USD 500,000. Non consente un servizio ospitato di TTS o di clonazione della voce per altri, la voce di una persona reale clonata senza consenso, né l'uso di ciò che produce per addestrare o distillare un altro modello; la sua filigrana resta nel suono. Ogni ripresa che legge porta **Built with Fish Audio** nel risultato della lettura, nell'editor della ripresa e nella sua nota in Biblioteca. Ogni ripresa del Lettore è segnata come mai per l'addestramento: il suo file porta il segno, l'Addestratore rifiuta una cartella che la contiene e le cucine dei dataset la lasciano fuori.

### Una lettura in sei passi <!-- #a-reading-in-six-steps -->

1. Incolla il testo, o portalo **Da una registrazione**.
2. Scegli **Modalità**: **Narrazione** per un libro, **Dialogo** per le voci.
3. Scegli la **Voce del lettore**; in un dialogo, una per ogni parlante.
4. Lascia attivo **Metti gli accenti**; per la LCV, aggiungi **Leggi le lettere LCV con la mappa dei glifi**.
5. Guarda **Quantizzazione** e la riga sotto: la quantizzazione, la scheda, quanto durerà.
6. **Leggi**, poi ascolta la ripresa; un pezzo venuto male passa per **Correggi**.
