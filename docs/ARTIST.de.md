# Der Maler im Detail

[English](ARTIST.md) · [Русский](ARTIST.ru.md) · [Українська](ARTIST.uk.md) · [Беларуская](ARTIST.be.md) · [Ελληνικά](ARTIST.el.md) · [Español](ARTIST.es.md) · [Italiano](ARTIST.it.md) · [Français](ARTIST.fr.md) · [Português](ARTIST.pt.md) · **Deutsch** · [日本語](ARTIST.ja.md) · [中文](ARTIST.zh.md)

Der Maler ist der Raum von Ruach Studio für Bilder: ein Cover für jeden Take, ein 16:9 für sein Video, ein 9:16 für einen Short. Die Anleitung im Studio (F1 im Maler) sagt in wenigen Zeilen, was jedes Bedienelement tut; dieses Dokument geht bis auf den Grund: jedes Element, wie es innen gebaut ist, die Rezepte, die funktionieren, was schiefgeht und warum, und die Zahlen, gemessen auf einer RTX 3090. Alles hier ist im Studio, wie es ist; was noch kommt, steht am Ende.

## Inhalt

1. [Wofür der Maler da ist](#1-wofür-der-maler-da-ist)
2. [Ein erstes Cover in sechs Schritten](#2-ein-erstes-cover-in-sechs-schritten)
3. [Einen Prompt schreiben](#3-einen-prompt-schreiben)
4. [Die Maler](#4-die-maler)
5. [Wie ein Lauf geht](#5-wie-ein-lauf-geht)
6. [Lightning](#6-lightning)
7. [Sampler und Zeitpläne](#7-sampler-und-zeitpläne)
8. [Adapter (LoRA)](#8-adapter-lora)
9. [Regionen](#9-regionen)
10. [Schriftzug](#10-schriftzug)
11. [Ein Bild, von dem aus man malt](#11-ein-bild-von-dem-aus-man-malt)
12. [Der zweite Durchgang](#12-der-zweite-durchgang)
13. [Hochskalieren](#13-hochskalieren)
14. [Die Bühne, die Bibliothek und der Papierkorb](#14-die-bühne-die-bibliothek-und-der-papierkorb)
15. [Cover für Takes](#15-cover-für-takes)
16. [Rezepte](#16-rezepte)
17. [Wenn etwas schiefgeht](#17-wenn-etwas-schiefgeht)
18. [Die Zahlen](#18-die-zahlen)
19. [Für Skripte und Agenten](#19-für-skripte-und-agenten)
20. [Lizenzen](#20-lizenzen)
21. [Was als Nächstes kommt](#21-was-als-nächstes-kommt)

## 1. Wofür der Maler da ist

Ein Song braucht Bilder: das Quadrat auf seiner Karte und in seinem MP3, einen breiten Ausschnitt für sein Video, einen hohen für einen Short. Der Maler malt sie auf deiner eigenen Grafikkarte, aus deinen Worten, aus einem Bild von dir oder aus beidem, und behält jeden Lauf mit seinem Prompt, seinem Seed und seinen Einstellungen, damit ein Bild, das dir gefiel, noch einmal gemalt oder weitergeführt werden kann.

Der Raum hat drei Spalten. Links das Formular: der Prompt und jedes Bedienelement, das das Gemälde formt. In der Mitte die Bühne: der Lauf, der gerade gemalt wird, entsteht dort Schritt für Schritt, oder dort steht das Bild, das du gewählt hast, mit seinen Knöpfen darunter und den Daten seines Laufs in einem Tooltip daneben. Rechts die Bibliothek: jeder Lauf, oder alle Bilder in einer Galerie, oder der Papierkorb. Zieh die Ränder zwischen den Spalten, um eine zu verbreitern (← → per Tastatur; ein Doppelklick gibt ihr ihre eigene Breite zurück). Ab einem 920 px hohen Fenster steht der Raum ganz: die Seite bleibt still, Formular und Bibliothek scrollen für sich, und die Zeile von Zeichnen bleibt am Fuß des Formulars.

## 2. Ein erstes Cover in sechs Schritten

1. Wähle rechts im Studio einen Take (die Liste des Schöpfers oder des Bibliothekars): das Bild, das du als Cover setzt, geht an ihn.
2. Drück im Maler **Aus dem Take** für einen Prompt zum Anfangen, oder schreib deinen eigenen (Abschnitt 3).
3. Lass **Formate** auf **1:1**, stell **Variationen** auf 4 und behalte den Maler, den das Studio gewählt hat (Krea 2 Muse Q4 auf den meisten Karten).
4. Drück **Zeichnen** (Strg+Enter). Sieh zu, wie die Bilder auf der Bühne entstehen; etwa eine halbe Minute je Bild auf einer 3090.
5. Klick auf das, das dir gefällt; **Als Cover setzen** macht es zum Cover des Takes: auf seiner Karte, im Player und in seinem MP3.
6. Gefällt es dir, aber du willst es feiner? **Zweiter Durchgang… ×2** (Abschnitt 12), dann **Hochskalieren… 4K** (Abschnitt 13).

## 3. Einen Prompt schreiben

Krea 2 Muse und Qwen-Image lesen einen Prompt als Beschreibung, nicht als Liste von Tags: schreib Sätze. Zuerst, was im Bild ist (wer oder was, wo, was es tut), dann das Licht (Dämmerung, Kerzenlicht, ein grauer Morgen), die Farben und das Medium (ein Ölgemälde mit dickem Pinselstrich, eine Tuschezeichnung, ein 35-mm-Foto). Schließ mit *no text*, wenn du keine Buchstaben willst: beide Maler beschriften ein Cover gern von selbst.

Wörter, die gut wirken: das Motiv schlicht benannt (*a red fox sitting in the snow*), die Komposition (*seen from below*, *in the left third*, *a wide empty sky above*), das Material (*oil on canvas*, *gouache*, *woodcut*), Richtung und Farbe des Lichts. Wörter, die wenig tun: Listen von Qualitäts-Tags (*masterpiece, 8k, best quality*) gehören zu älteren Modellen und nehmen nur Platz weg.

**Aus dem Take** setzt in den Prompt den, aus dem das eigene Artwork des Takes kam, oder einen aus seinem Titel und Stil, als Anfang. Jeder Lauf behält seinen Prompt; **Ins Formular** an einem beliebigen Bild holt seinen Prompt, Seed und sein Format zurück, und **Alles ins Formular** (in seinem Menü) holt auch seinen Maler, sein Fine-Tune, sein Sampling und seine Adapter, sodass Zeichnen genau dieses Bild noch einmal malt.

## 4. Die Maler

| Maler | Lizenz | was er von der Karte verlangt | ein Bild auf einer 3090 | wofür |
|---|---|---|---|---|
| **Krea 2 Muse Q4** | Krea 2 Community License | 12,5 GB | etwa 35 s bei 1:1, 47 s bei 16:9 | Entwürfe, Cover, das Arbeitspferd |
| **Krea 2 Muse Q8** | Krea 2 Community License | 18,5 GB | etwas länger, feiner | Cover |
| **Qwen-Image 2512 Q4** | Apache-2.0 | 15,5 GB | etwa 30 s mit Lightning | das Qwen einer 16-GB-Karte |
| **Qwen-Image 2512 Q6** | Apache-2.0 | 20 GB | etwa 32 s mit Lightning | feinere Entwürfe |
| **fp8-Fine-Tune von Qwen-Image 2512** | die des Fine-Tunes | 22,5 GB | etwa 37 s mit Lightning, Minuten ohne | fertiger Realismus |
| **Qwen-Image 2.1** | Qwen Research Licence | 21 GB (gestreamt mit weniger) | etwa zwei Minuten | Bearbeiten mit Worten, Stilreferenz |

**Krea 2 Muse** (von Stable Yogi, ein Fine-Tune von Krea 2 Turbo) malt in seinen eigenen wenigen Schritten (8 als Standard, 4 bis 16) ohne Führung: ein Turbo-Modell hat seine Führung in sich destilliert. Es ist der Standard-Maler des Raums, weil es schnell ist, den Worten treu und gutmütig zu kleineren Karten. Q4 und Q8 sind dasselbe Modell in zwei Genauigkeiten (GGUF): Q8 hält etwas mehr Detail.

**Qwen-Image 2512** ist der größere Maler: feinerer Realismus, lange Prompts liest er gut, Buchstaben zeichnet er richtig, wenn du sie verlangst. Er kommt als GGUF in Q4 oder Q6, oder als **fp8-Fine-Tune**: die Einzeldateien von ComfyUI in `artwork/Qwen-Image-2512/checkpoints/` gelegt und unter dem Maler gewählt (Jib Mix Qwen, IntoRealism Qwen, Real-Qwen-Image und 2512 selbst lassen sich über **Maler und Adapter holen…** laden, je 20,4 GB). Ein fp8-Fine-Tune wird in bf16 gelesen, auf der Karte in seinem eigenen fp8 gehalten, und jede Schicht rechnet in bf16, während sie läuft; Adapter darauf halten ihre eigenen Schichten in bf16.

**Qwen-Image 2.1** liest Bilder ebenso wie Worte (sein Text-Encoder ist Qwen3-VL): es bearbeitet ein Bild nach den Worten des Prompts, oder malt die Szene des Prompts im Stil eines Bildes (Abschnitt 11). Es steht unter der Qwen Research Licence: nur Forschung und Bewertung, nicht für ein Cover, das du verkaufst; der Raum sagt es unter dem Maler in der Farbe der Warnungen.

Jeder Maler zeigt sich nur, wenn seine Dateien hier sind; die fehlenden werden unter dem Maler genannt, und **Engine → Modelle und LoRAs** holt sie, jeden zuerst mit seiner Größe gefragt (2.1 auch mit seiner Lizenz). Aus einem Terminal: `heresy/fetch-heresy.sh --qwen 2512-q4`.

**Der Text-Encoder** von Qwen-Image 2512 (Qwen2.5-VL-7B, etwa 15,5 GB) liest den Prompt auf der Karte, wenn der freie Platz dort ihn fasst, sonst auf dem Prozessor, und geht, bevor der Maler kommt: das Bild ist so oder so dasselbe, der Prozessor nur langsamer.

## 5. Wie ein Lauf geht

**Die Warteschlange.** Ein Druck auf Zeichnen ist ein Lauf: ein Prompt, seine Formate, seine Variationen. Er wartet in der Warteschlange des Labors auf eine Karte mit Platz, wie die Artworks der Takes, die Stems und die Hochskalierungen; während er wartet, nimmt **Aus der Warteschlange** ihn zurück, und **Stopp** neben Zeichnen beendet einen Lauf, der malt (die Bilder, die er fertig hat, bleiben). Zwei Läufe können zugleich stehen: einer malt, der nächste wartet dahinter.

**Welche Karte.** Die Aufgaben des Labors halten sich an die Karten, die ihnen in **Engine → GPUs** gegeben wurden (die eigene Karte des Studios wird nie zufällig genommen). Eine Karte, die nichts sonst nutzt, nimmt einen Lauf, dessen Bedarf in ihren Speicher minus 512 MiB passt (der eigene Anteil der CUDA-Laufzeit); eine Karte in Gebrauch nimmt ihn, wenn ihr freier Speicher den Bedarf fasst; eine Karte mit VRAM-Limit zählt ihr Limit als Decke. Der Bedarf ist der des Malers plus die Größe seiner Adapter, und 6 GB mehr für einen zweiten Durchgang ×2.

**Wenn keine Karte ihn ganz fasst**, streamen Krea 2 Muse und Qwen-Image 2512 ihre Blöcke aus dem RAM: die Blöcke, die passen, bleiben auf der Karte, der Rest kommt, wie er gebraucht wird (das Group-Offloading von diffusers über einen CUDA-Stream: ein Block kommt an, während der vorige rechnet), und das Bild ist dasselbe, langsamer um das, was der Bus nicht verstecken kann. Mit allen Blöcken gestreamt nimmt Krea 2 Muse Q4 2,2 GB von der Karte, sodass eine 8-GB-Karte es malt. Qwen-Image 2.1 streamt sowohl seinen Transformer (Block für Block) als auch seinen Text-Encoder (Schicht für Schicht): unter einem Limit von 15,5 GB malte es aus Worten mit 4,1 GB Spitze und bearbeitete mit 7,9 GB, in etwa derselben Zeit wie ganz. Ein Maler, der nicht streamen kann und auf keine Karte passt, wird sofort abgelehnt, mit den Zahlen und dem Maler, der passen würde.

**Mehrere Karten.** Ein Lauf mit mehreren Bildern wird auf die Karten des Labors verteilt, die Platz und genug RAM für einen Maler mehr haben (drei Formate auf zwei Karten: das erste und dritte auf einer, das zweite auf der anderen), jede Karte malt ihren Teil mit den eigenen Seeds des Laufs: die Bilder sind Bit für Bit dieselben wie auf einer Karte. Krea 2 Muse Q8, drei Formate: 132 s auf zwei Karten gegen 163 s auf einer.

**Ein gehaltener Maler.** Nach einem Lauf geht sein Maler zurück in den RAM, und seine Karte ist wieder frei; ein nächster Lauf mit demselben Maler, demselben Fine-Tune und denselben Adaptern in derselben Reihenfolge malt sofort, ohne die ein, zwei Minuten Laden. Ein gehaltener Maler wird nach zehn Minuten Leerlauf losgelassen, wenn der RAM für einen anderen gebraucht wird, oder per **Entladen** in der Leiste (das alles loslässt, was das Studio auf seinen Karten hält).

**In einem Lauf**: der Prompt wird einmal vom Text-Encoder gelesen; jedes Bild wird in der eigenen Größe des Malers gezeichnet und in der des Raums behalten (Krea 2 zeichnet in Vielfachen von 16 und schneidet aus der Mitte, 1920 × 1088 auf 1920 × 1080; Qwen-Image zeichnet in 1328², 1664 × 928 und 928 × 1664 und bringt jedes auf 1280², 1920 × 1080 und 1080 × 1920); der Decoder arbeitet in Kacheln, darum bleibt seine Spitze niedrig.

**Live-Vorschau** (standardmäßig an): die Latents jedes Schritts werden ohne den Decoder zu einem Bild in einem Achtel der Größe (mit den eigenen Farbfaktoren des Latent-Raums, wie InvokeAI sie trägt), es kostet also nichts; ein Balken oben auf der Bühne folgt dem Lauf, Bild für Bild und Schritt für Schritt.

**Der Inhaltsfilter**: jedes Bild geht durch den Filter, den die Lizenz von Krea 2 verlangt, wer immer es gemalt hat: eines, das er markiert, wird nicht behalten, und der Lauf sagt es.

**Auf der Platte**: jeder Lauf ist ein Ordner in `artist/` des Studios: `ask.json` (was verlangt wurde), `run.json` (Bild für Bild geschrieben), die Bilder `NN-SHAPE-sSEED.png`, ihre `thumbs/`, und eine Referenz oder Maske daneben, wenn der Lauf eine hatte. Ein Wächter stoppt einen Maler, der zu lange schweigt (zehn Minuten beim Laden, fünf, sobald er malt), und ein Lauf, den das Labor bei einem Neustart verloren hat, sagt es, statt ewig zu malen.

## 6. Lightning

**Was es ist**: ein Adapter (lightx2v, Apache-2.0), der Qwen-Image 2512 beibringt, in wenigen Schritten ohne Führung zu malen: der eigene lange geführte Weg des Modells, destilliert in 8 Schritte. Seine Datei liegt in `artwork/Qwen-Image-2512/lightning/` und kommt mit dem Laden der Qwen-Maler.

**Wie das Studio ihn einlegt**: mit Lightning an lädt der Maler ihn als einen Adapter mehr unter deinen, mit **1.0** für die GGUF Q4 und Q6 (die Basis, aus der er destilliert wurde, 8 Schritte) und mit **0.55** für ein fp8-Fine-Tune mit 12 Schritten (ein Fine-Tune hat sich von der Basis entfernt, und Lightning mit voller Stärke zöge es zurück). Der Zeitplan wird der eigene von Lightning (eine Verschiebung von log 3 bei jeder Größe), und die Führung geht aus: ein Durchlauf des Modells pro Schritt.

**Mit ihm aus** malt 2512 auf seine Art: 30 Schritte als Standard (10 bis 60) und **Führung** 4 (echtes CFG gegen ein leeres Negativ: zwei Durchläufe pro Schritt). Sechzig Durchläufe gegen acht: etwa siebenmal das Malen, und das Detail und Licht des fertigen Realismus.

**Die Regel hinter den Standards**: Lightning für Entwürfe und Cover, nicht für professionellen Realismus. Die GGUF-Maler malen mit ihm; ein fp8-Fine-Tune malt ohne ihn, außer du schaltest ihn ein; das eigene Artwork eines Takes wird mit ihm gemalt. Krea 2 Muse hat keinen Schalter: seine wenigen Schritte sind seine eigenen.

## 7. Sampler und Zeitpläne

**Sampling**, unter dem Maler, eingeklappt, seine Werte in seiner Zusammenfassung: die Schritte, der Sampler und der Zeitplan (und für 2512 Lightning und Führung), je Maler behalten; **Zurücksetzen** gibt die des Malers zurück. Krea 2 und Qwen-Image 2512 mit Lightning nehmen 4 bis 16 Schritte; ohne 10 bis 60.

Das Modell sagt bei jedem Schritt, in welche Richtung das Bild liegt; der **Sampler** entscheidet, wie man dorthin geht:

- **Euler**: ein Durchlauf pro Schritt, der schlichte Schritt, die Referenz (und der, mit dem Lightning destilliert wurde).
- **Euler SDE**: Euler mit ein wenig frischem Rauschen bei jedem Schritt: mehr Korn, etwas weniger treu.
- **ER-SDE**: ein stochastischer Löser dritter Ordnung, ein Durchlauf pro Schritt, die zwei vorigen Schritte behalten: feiner als Euler in derselben Zeit.
- **RES 2s**, **RES 3s**: die Einschrittverfahren des verfeinerten exponentiellen Lösers, zwei und drei Durchläufe pro Schritt, die Hälfte des Rauschens nach jedem zurückgelegt; ihre **ODE**-Zwillinge legen nichts zurück, sodass ein Seed ein Bild malt, das dem exakten Weg am nächsten.
- **Heun++**: drei Durchläufe pro Schritt, wo es geht, zwei, dann einer am Ende.
- **Exponential Heun** (und sein SDE): ein exponentielles Verfahren zweiter Ordnung, zwei Durchläufe pro Schritt.

Ein Sampler mit zwei oder drei Durchläufen pro Schritt kostet zwei- oder dreimal die Zeit von Euler. Gegen den exakten Weg eines Spielzeugflusses bei 8 Schritten reihen sie sich, wie ihre Ordnungen sagen: Euler 0,138, Heun++ 0,111, exponential Heun 0,084, RES 2s 0,058, RES 3s 0,046 (der Fehler: niedriger ist näher).

Der **Zeitplan** sagt, wo die Schritte zwischen allem Rauschen und keinem ausgegeben werden: **Simple** (gleichmäßig in der eigenen Zeit des Malers), **Karras** und **Exponential** (mehr Schritte bei wenig Rauschen, für das Detail), **Beta** und **Beta 57** (dicht an beiden Enden), **KL optimal** (der Abstand von Align Your Steps), **SGM uniform** (gleichmäßig in der Zeit, der letzte Schritt weggelassen), **Bong tangent** (zwei Arkustangens-Hänge, von allem Rauschen bis zur Hälfte und von der Hälfte bis zu keinem).

**Was funktioniert, aus zwei Matrizen von 54 Bildern** (ein Prompt, ein Seed, jedes Paar):

| Maler | gut | meiden |
|---|---|---|
| Krea 2 Muse | jeder Sampler und Zeitplan malte ein ganzes Bild | |
| Qwen-Image 2512 mit Lightning | Simple, Beta, Beta 57, SGM uniform, Bong tangent | Karras, Exponential, KL optimal (sie können das Motiv doppelt malen) |
| Qwen-Image 2512 ohne Lightning | Euler, ER-SDE, RES 2s / 3s | Euler SDE (weich und dunstig) |

Das Formular sagt beide Warnungen, wenn sie zutreffen. Die Sampler wurden für das Studio aus ihren Aufsätzen und den Formeln von ComfyUI geschrieben; RES4LYF wurde nur seiner Mathematik wegen gelesen (seine Lizenz verbietet kommerzielle Dienste), und Heun++ ist von Carzit (MIT).

## 8. Adapter (LoRA)

**Wo sie wohnen**: `artwork/loras/<Familie>/`, die Familie die des Malers: `krea2`, `qwen-image-2512`, `qwen-image-2.1`. Ordner darin werden zu Gruppen in der Bibliothek; ein Bild neben einer Datei mit ihrem Namen (`NAME.jpg`, `NAME.png`, `NAME.preview.png`) zeigt sich auf ihrer Karte; was der LoRA Manager von ComfyUI (`NAME.metadata.json`) oder Stability Matrix (`NAME.cm-info.json`) neben eine Datei geschrieben haben, wird ebenfalls gelesen.

**Die Liste und der Lauf**: bis zu acht Adapter in der Liste unter dem Maler, bis zu vier aktiv in einem Lauf; jeder in seiner Stärke (der Regler 0 bis 1,5); ein Rechtsklick **stummschaltet** einen (er bleibt in der Liste und verlässt den Lauf), und ein Adapter auf null wird auch nicht geladen. Seine Triggerwörter zeigen sich darunter, und ein Klick auf eines setzt es in den Prompt (ein Lauf fügt die Triggerwörter eines aktiven Adapters auch von selbst hinzu).

**Civitai**: **Auf Civitai nachschlagen** schickt die SHA-256 jeder Datei und nichts sonst, und behält die Antwort daneben (`NAME.civitai.info`: sein Name, Basismodell und Triggerwörter, und sein erstes als sicher bewertetes Bild, wenn er keines hat). **Von Civitai…** holt einen Adapter, dessen Autor ihn nicht teilen lässt, von Civitai selbst, mit deinem eigenen Schlüssel: ein Link, eine Versions-ID oder eine AIR wird gelesen, die Familie, die zu seinem Basismodell passt, genannt, und nur ein LORA, LoCon oder DoRA in `.safetensors` genommen, seine SHA-256 gegen die von Civitai geprüft, bevor er zur Datei wird. Dein Schlüssel geht nur an Civitai. Die Adapter, die ihre Autoren teilen lassen, kommen über **Maler und Adapter holen…**.

**Zusammen**: ab zwei Adaptern gibt ein Balken darunter die Summe ihrer Stärken auf dem Weg des Schöpfers: grün bis 1,2, bernstein bis 1,8, rot darüber. Gestapelte Adapter addieren sich, und über etwa 1,8 brennt ein Bild (Farben und Kanten überzogen), so bescheiden jeder einzelne ist. Zieh den Balken, um alle auf einmal zu bewegen, jeden im Verhältnis.

**Stärke über die Schritte** (⏱ neben einem Adapter): Keyframes, wie die LoRA-Hooks von ComfyUI sie haben, ein Anteil der Schritte und ein Multiplikator: `0%:1, 50%:1, 60%:0` hält den Adapter für die Hälfte der Schritte ganz und lässt ihn bis 60 % los. Bis zu acht Keyframes, der Multiplikator 0 bis 2, Geraden dazwischen. Ein Adapter, der früh die Komposition formt, und ein Stil-Adapter, der nur das Finish berühren soll, sind die zwei Anwendungen.

**Innen**: die Adapter gehen auf den Transformer des Malers, bevor er malt (PEFT), jeder in seiner Stärke; eine kohya-Datei (`lora_unet_blocks_0_…`) wird auf die eigenen Schichtnamen des Malers umbenannt; ein Adapter, der keine Schicht des Malers erreicht (für ein anderes Modell gemacht), stoppt den Lauf und sagt es. Ein gehaltener Maler nimmt die Stärken eines nächsten Laufs, ohne seine Adapter neu zu laden.

## 9. Regionen

**Regionen**, unter Sampling, eingeklappt: bis zu drei Teile des Ausschnitts, jeder mit einem Platz und eigenen Worten. Die Plätze: die linke, rechte, obere oder untere Hälfte; das linke, mittlere oder rechte Drittel; die vier Viertel; die Mitte. Eine kleine Karte neben jeder Zeile zeigt, wo sie liegt.

**Wie es malt**: bei jedem Schritt wird der Maler für jede Region noch einmal gefragt, mit dem Hauptprompt und den Worten der Region, und seine Antworten werden nach den Kästen der Regionen als weichrandige Gewichte gemischt (ein Rand von einem Fünfundzwanzigstel der kürzeren Seite), geteilt, wo Kästen sich überlappen; der Rest des Ausschnitts folgt nur dem Hauptprompt. Das ist der Weg von Latent Couple: er braucht nichts vom Modell, und die Szene bleibt eine Szene, weil der Prompt jeder Region den Hauptprompt trägt.

**Wie man sie schreibt**: der Hauptprompt sagt die ganze Szene, eine Region, was darin steht. *Two animals sitting in a snowy forest clearing at dawn, oil painting*; linke Hälfte *a red fox sitting in the snow*; rechte Hälfte *a white snowy owl perched on a stump*. Bei einem Seed malte Krea 2 Muse ohne die Regionen zwei vage Katzen und mit ihnen den Fuchs und die Eule; Qwen-Image 2512 malte ohne sie zwei Bären und mit ihnen den Fuchs und die Eule.

**Was es kostet**: ein ganzer Durchlauf mehr pro Schritt für jede Region (auf einer 3090 bei 16:9: Krea 2 Q4 48 s allein, 137 s mit zwei Regionen; Qwen-Image 2512 fp8 141 und 281 s). Die Zeitschätzung des Formulars zählt sie mit.

Regionen werden in diesem Browser behalten; eine Region ohne Worte wird nicht gesendet; **Noch einmal** malt mit den eigenen des Laufs. Krea 2 und Qwen-Image 2512; Qwen-Image 2.1 bearbeitet mit Worten und malt ohne sie.

## 10. Schriftzug

**Schriftzug**, unter Regionen, eingeklappt: ein Titel, und eine zweite Zeile darunter, als Teil des Gemäldes beschriftet statt obendrauf gelegt als eine Ebene, die abseits vom Bild steht. Seine Worte gehen in eigene Felder, nie in den Prompt, und das Studio schreibt, was der Maler liest. Zwei Wege, gewählt unter **Wie**:

- **Mit dem Bild gemalt** (Krea 2 Muse, Qwen-Image 2512 oder 2.1): das Studio fügt dem Prompt einen Satz hinzu: wo, den Titel in Anführungszeichen, wie die Buchstaben aussehen, die zweite Zeile kleiner darunter, dann *painted in the same technique and light as the picture. No other text.* Ein Prompt aus einem Absatz bekommt ihn am Ende; ein in Absätzen geschriebener Prompt bekommt ihn als eigenen Absatz, *TEXT RENDERING:*, als zweiten, nach dem ersten: am Ende eines langen Prompts ertrinkt er (Viktors Fosforida-Prompt, 3.200 Zeichen in zehn Absätzen, malte so drei Bilder ohne einen Buchstaben). Der Prompt eines Takes verlangt keinen Text (*No text, no letters.*): dieser Satz wird zuerst herausgenommen.
- **Auf dem Referenzbild** (Qwen-Image 2.1): ein fertiges Bild mit Worten beschriftet, der Rest behalten. Die Anweisung wird nur aus den Feldern geschrieben, sodass der Prompt leer bleiben darf. **Beschriften**, auf der Bühne oder im Menü eines Bildes, macht dieses Bild zur Referenz, setzt Wie und öffnet den Block mit dem Titel in der Hand.

**Die Felder**: **Titel** (60 Zeichen); **Zweite Zeile** (80: der Künstler, das Album; leer für keine); **Die Buchstaben** (400, wie sie aussehen, in Worten, so lang wie ein Typografie-Absatz eines Prompts; leer: *large elegant classical serif capitals in warm gold, with even letter spacing*); **Wo** (oben, in der Mitte, unten). **Der Titel des Takes** füllt den Titel aus dem rechts gewählten Take. Der Block wird in diesem Browser behalten; **Noch einmal** beschriftet mit den eigenen Worten des Laufs; die Zeile des Laufs behält den Satz, den der Maler gelesen hat.

**Zurücklesen**: die Maler verschreiben Wörter, die sie selten gesehen haben. Auf einem Leuchtturm schrieb Qwen-Image 2512 „RUOCH STUDIO“ und Qwen-Image 2.1 „RUUCH STUDIO“, während „ПЕСНЯ МАЯКА“ und „РУАХ СТУДИЯ“ richtig herauskamen. Darum wird jedes Bild vom Hörer zurückgelesen, Qwen2.5-Omni über llama.cpp (etwa 5 s pro Bild auf einer RTX 3090; er las beide Fehler, wie sie waren), und Wort für Wort verglichen: Groß- und Kleinschreibung und Zeilenumbrüche beiseite, nichts sonst wird verziehen (ё ist nicht е). Ein verschriebenes Bild wird mit einem anderen Seed neu gemalt (sein Seed plus 1000, dann plus 2000), bis zu dreimal, in Runden: alle verschriebenen Bilder eines Laufs zusammen, sodass Maler und Hörer einmal pro Runde die Plätze tauschen. Das erste exakt geschriebene wird behalten; die anderen Versuche gehen in den Ordner misspelled/ des Laufs, behalten, nie gelöscht. Wenn kein Versuch stimmt, wird der nächste behalten und als verschrieben bezeichnet, mit dem, was er liest. Ohne den Hörer werden die Bilder behalten, wie gemalt, und als ungelesen bezeichnet: nie als richtig geschrieben gezeigt.

**Die Karte zum Lesen**: der Hörer will etwa 11 GB. Ein Maler, der ganz auf der Karte steht, legt seine Gewichte in den RAM, während der Hörer liest, und holt sie danach zurück; Qwen-Image 2.1 lässt die Karte von selbst frei; ein gestreamter Maler, dessen Blöcke die Karte füllen, lässt den Hörer auf dem Prozessor lesen (etwa 64 s pro Bild).

**Die Marken**: neben jedem Bild **✓ Aa** (wie verlangt geschrieben), **⚠ Aa** (in jedem Versuch verschrieben; sein Tooltip sagt, was es liest und wie viele Versuche es gab), **? Aa** (nicht zurückgelesen). Die Zeile der Bühne sagt *beschriftet „…“* und, bei einem verschriebenen, was es liest.

**Zeiten** (RTX 3090, ein Quadrat): Qwen-Image 2.1 beschriftete ein fertiges Bild in 118 s, sofort richtig gelesen; ein fp8-Fine-Tune von Qwen-Image 2512 ohne Lightning (30 Schritte, echtes CFG 4, der eigene Weg eines fp8-Fine-Tunes) malte eines mit seinen Buchstaben in 230 s, sein Laden mitgezählt, etwa 150 s davon das Malen. Ein verschriebenes Bild kostet ein ganzes Bild mehr pro Versuch: von zwei Variationen von „LANTERN SONG / RUACH STUDIO“ kam eine sofort richtig heraus und die andere blieb in allen drei Versuchen verschrieben („RUCH STUDIO“), behalten und gesagt, in 743 s für den Lauf. Lightning macht aus jedem Versuch einen Bruchteil davon. Die Schätzung des Formulars zählt das Lesen mit.

**Kyrillisch**: Viktors „ФОСФОРИДА | Возвращение Шехины“ im Stil des Prompts seines eigenen Albums. Qwen-Image 2512 schrieb den Titel in allen neun Bildern richtig; die zweite Zeile in Kleinbuchstaben in keinem von sechs Versuchen (die kleinen Щ und Ш gekritzelt, „Вовуяеные Шехни“); in Großbuchstaben kamen Щ und Ш jedes Mal richtig und nur der letzte Buchstabe ging schief („ШЕХИНЯ“), wobei auch die Formen der Buchstaben gesagt wurden (seine Idee, HERESY 1396: Ы, Щ, Ш und die anderen Buchstaben, die ein auf Latein trainierter Maler selten sah, und Ф neben dem griechischen Φ, jeder beschrieben, wenn die Worte ihn tragen). **Krea 2 Muse schrieb beide Zeilen exakt**: „ФОСФОРИДА / ВОЗВРАЩЕНИЕ ШЕХИНЫ“ in zwei Variationen, eine im ersten Versuch und eine im zweiten, 184 s für den Lauf. Eine buchstabierte Hilfe („Ф-О-С-Ф-…“) wurde versucht und verworfen: Krea malte ihre Bindestriche in den Titel, und der Hörer, den man seitdem bittet, Bindestriche und Leerzeichen zu behalten, las eine davon zusammengezogen. Für Kyrillisch zuerst Krea 2 Muse; Großbuchstaben; und schau auf die Marke.

**Warum gemalt und nicht gesetzt**: eine echte Schrift, vom Studio gesetzt (Kerning, Laufweite und Zeilenabstand durch raqm) und leicht übermalt, schreibt exakt, bleibt aber eine Ebene auf dem Bild. Von den vier versuchten Wegen wählte Viktor die zwei, bei denen der Maler die Buchstaben selbst schreibt.

## 11. Ein Bild, von dem aus man malt

**Die Referenz**: lass ein Bild auf seinen Platz unter dem Prompt fallen, füge eines ein (Strg+V), wähle eine Datei, oder nimm das Bild der Bühne mit **Als Referenz** (oder das Cover des Takes mit **Das Cover des Takes**). PNG, JPEG oder WebP, höchstens 40 MB.

### Verwenden

**Verwenden**, unter dem Bild, sagt wie:

- **um von ihm aus zu malen** (der Standard): Bild zu Bild durch den Maler des Formulars, so weit, wie **Wie stark es sich ändern darf** sagt;
- **um es mit Worten zu bearbeiten**: Qwen-Image 2.1 behält die Szene und ändert, was der Prompt sagt (*the same lighthouse in a snowy winter night*: der Schnee kam dorthin, wo er hingehört, Turm und Felsen behalten);
- **nur für seinen Stil**: Qwen-Image 2.1 malt die eigene Szene des Prompts in Technik, Pinselstrich, Palette und Licht des Bildes, ohne etwas von seinem Motiv zu behalten (ein Leuchtturm in Öl ergab *a red fox in a snowy forest under the moon* in seinem Pinselstrich).

Die letzten beiden werden angeboten, wenn Qwen-Image 2.1 hier ist. Mit einem von ihnen ist der Lauf der von 2.1, welcher Maler auch im Formular steht: das Modell des Formulars, das Sampling, die Adapter, die Maske und die Leinwand werden nicht gesendet, und die Lizenz von 2.1 gilt. Innen ist eine Stilreferenz der Prompt, eingewickelt in die Bitte, vom Bild nur den Stil zu nehmen und nichts von seinem Motiv; Bearbeiten ist der eigene Weg von 2.1 mit einem Bedingungsbild.

### Wie stark es sich ändern darf

Bild zu Bild ist hier, was InvokeAI mit Modellen tut, die dafür keine Pipeline haben: das Bild deckt jedes Format und wird aus seiner Mitte geschnitten, geht rückwärts durch den Decoder des Malers in Latents und wird bis zu einem Punkt im eigenen Zeitplan des Malers verrauscht; das Malen läuft dann den Rest des Zeitplans von dort. Die Stärke wählt diesen Punkt: den nächsten der eigenen Schritte des Zeitplans, mindestens zwei Schritte.

| Stärke | was sie gibt (an Krea 2 Muse versucht) |
|---|---|
| 0,3 | das Bild fast wie es ist, seine Oberfläche berührt |
| 0,5 | das Bild behalten, seine kleinen Dinge geändert (Schriftzug, Textur) |
| 0,6 | seine Komposition behalten, seine Materie geändert (der Standard des Raums) |
| 0,75 | die Komposition behalten, die Materialien des Prompts genommen |
| 0,9 | die Szene des Prompts im Licht und in den Farben des Bildes gemalt |
| 1,0 | neu gemalt |

**Zusätzliches Rauschen** unter der Stärke (0 als Standard, 0 bis 2): frisches Rauschen auf die Latents des Bildes, bevor das Malen von ihnen ausgeht, wie es Viktors ComfyUI-Workflow mit InjectLatentNoise tut (`samples + noise · strength` im eigenen Raum des Decoders; hier durch die Streuung jedes Kanals geteilt, damit die Zahl bedeutet, was sie dort bedeutet). 0,3 bringt neues Korn und Detail, 0,6 ist sein zweiter Durchgang, über 1 beginnen die Formen des Bildes zu brechen. Es verschiebt nur den Anfang: was eine Maske behält, bleibt sauber.

### Maske

**Maske…** malt über das Bild, was neu gemalt werden soll (Malen und Radieren, B und E; der Pinsel und seine Größe, `[` und `]`; Umkehren; Leeren): der Rest bleibt genau, wie er war, wie beim Inpainting. Innen geht die Maske auf das eigene Raster der Latents, und bei jedem Schritt wird der behaltene Teil als das Bild, bis zu diesem Schritt verrauscht, zurückgelegt; das fertige Bild nimmt außerhalb der Maske die eigenen Pixel des Bildes, weich übergeblendet.

Vier Optionen unter dem Bild, wenn eine Maske an ist (oder Drumherum malen):

- **Erweitern**: die Maske um so viele Pixel gewachsen, oder geschrumpft (−64 bis 128);
- **Rand**: wie weich ihr Rand ist (0 bis 96 px);
- **Sanft**: sanftes Übermalen, wie Differential Diffusion: wo der Rand grau ist, ändert sich das Bild nur in den letzten Schritten, also keine Naht;
- **Korn**: wie viel von der neuen Farbe der behaltene Teil bei jedem Schritt nimmt (0 bis 0,6), sein Korn und Licht an die neuen genäht; 0 behält ihn exakt.

Der Rand einer runden Maske kann ohne sie sichtbar bleiben; Erweitern 16, Rand 24, Sanft und Korn 0,15 nähten ein neues Gesicht ohne eine Linie in eine alte Leinwand.

### Drumherum malen

**Drumherum malen** hält das ganze Bild in der Mitte jedes Formats und malt die Ränder, die es lässt, neu, in seinen Farben und seinem Licht: ein quadratisches Cover zu einem 16:9 für ein Video oder einem 9:16 für einen Short, als Outpainting.

### Die Leinwand

**Leinwand…** neben Maske… öffnet die Leinwand wie die von InvokeAI: der Ausschnitt jedes Formats ein Tab oben, der sagt, wie er gemalt wird (**von ihm aus**: das Bild deckt den Ausschnitt und der Lauf malt von ihm aus in der verlangten Stärke; **drumherum**: der Teil des Ausschnitts, den es frei lässt, wird um es herum gemalt). Auf der Tafel zieht **Verschieben** (V) das Bild, oder eine Ecke, um es mit der gegenüberliegenden Ecke fest zu skalieren; **Pinsel** (B) und **Radierer** (E) malen die Inpainting-Maske darüber; **Hand** (H, oder Leertaste gehalten) bewegt die Tafel; das Rad zoomt, Alt+Rad skaliert das Bild um den Zeiger, die Pfeile schubsen es (Umschalt: zehn Pixel). Rechts die Ebenen und der Platz in Zahlen; oben **Einpassen**, **Füllen**, **Zentrieren** und **Überall gleich**, Rückgängig und Wiederholen (dreißig Schritte). **Fertig** behält den Platz jedes Formats mit der Referenz und der Maske im Formular. Ein Platz ist die Mitte des Bildes als Anteil des Ausschnitts und seine Breite in Ausschnittbreiten.

## 12. Der zweite Durchgang

**Zweiter Durchgang…**, auf der Bühne neben Hochskalieren…, malt ein Bild größer neu, wie es Viktors ComfyUI-Workflow nach seinem ersten Durchgang tut: das Bild per Nächster-Nachbar auf **×1,5** oder **×2** gebracht und vom eigenen Maler, Fine-Tune, den Adaptern, dem Prompt und Seed seines Laufs neu gemalt, von einem Teil des Weges an.

**Wie sein Workflow es tut**, Knoten für Knoten gelesen: das Bild des ersten Durchgangs 2× per nearest-exact, in Kacheln kodiert, InjectLatentNoise 0,6, dann ein zweiter KSampler ab Schritt 20 von 60 bei CFG 4,5, mit demselben Sampler und Zeitplan wie der erste Durchgang (beide kommen aus einem Packer: ER-SDE und Bong tangent, wie der Workflow gespeichert ist).

**Im Studio**: **Wie stark es sich ändern darf** (zuerst 0,5: 0,3 behält die Zeichnung und fügt Detail hinzu, 0,5 schärft seine Materie, 0,7 malt seine Formen neu) und **Zusätzliches Rauschen** (zuerst 0,6, wie seins) in seiner Zeile; Schritte, Sampler, Zeitplan und Lightning sind die des Formulars, wenn das Formular mit demselben Maler malt, sonst die eigenen des Laufs. Sein Rezept gibt dem zweiten Durchgang viele Schritte und kein Lightning: stell sie im Formular ein, bevor du ×2 drückst.

**Was es kostet und gibt**: ein 16:9 von 1920 × 1080 kommt als 3840 × 2160 heraus. Auf einer 3090 Krea 2 Q4 auf 2560² in 86 s (14,5 GB Spitze); ein fp8-Fine-Tune von Qwen-Image 2512 auf 3840 × 2160 in 220 s mit 12 Schritten und Lightning (22,9 GB, seine Blöcke gestreamt). Bei 0,6 behielten beide die Szene und verschoben ihre Teile ein wenig; bei 0,5 hielt die Komposition. Nicht für Qwen-Image 2.1; keine Maske und keine Leinwand damit. **Noch einmal** auf einem zweiten Durchgang malt ihn in seiner Größe neu.

## 13. Hochskalieren

**Hochskalieren…** auf der Bühne macht ein Bild **2K** oder **4K** (seine lange Seite 2560 oder 3840) mit einem Upscaler aus `artwork/upscalers/` (`.pth` oder `.safetensors`, Ordner erlaubt): ESRGAN, DAT, HAT, ATD, SPAN, OmniSR und ihre Verwandten, von spandrel allein aus der Datei gelesen. Das Bild geht in Kacheln von 512 mit 32 Überlappung durch, die Mitte jeder Kachel behalten (keine Naht); ein 4×-Modell, von dem weniger verlangt wird, malt in 4× und wird per Lanczos heruntergebracht, feiner als ein 2×-Modell. Die lange Seite hält bei 10 240 px. Das **i** neben der Wahl sagt, wofür der gewählte Upscaler ist (Fotos, Gesichter, Zeichnung), seinen Autor, seine Lizenz und seine gemessene Zeit; ein Klick öffnet die Notizen aller, gruppiert, die schnellsten zuerst, die nicht-kommerziellen markiert.

**Durchgänge…** macht ein Hochskalieren in Durchgängen, wie Viktors ComfyUI-Stapel: bis zu vier Zeilen aus einem Modell und einem Faktor, jede über das Bild gefahren, wie es ist, und auf die Originalgröße mal dem Faktor des Durchgangs gebracht, dann die verlangte lange Seite und die Farben an das Original angeglichen (hm-mvgd-hm: Histogramme, Mittelwert und Kovarianz, Histogramme). Seine Kette ist einen Klick entfernt, wenn ihre Modelle hier sind: span otf strong ×2, dann Nomos8kDAT ×4, Remacri ×1,5, UltraMix Balanced ×2: ein 1920 × 1080-Bild auf 7680 × 4320 in 246 s, keine Naht, die Farben behalten.

**TTA** neben dem Upscaler: jede Kachel geht in ihren acht Ausrichtungen durch das Modell (vier Drehungen, jede gespiegelt), gemittelt: ruhigere Kanten und Texturen, bis zum Achtfachen der Zeit. **Hochskalieren…** auf der Leiste der gewählten Bilder (Strg+Klick) skaliert bis zu 64 auf einmal, auf die Karten des Labors verteilt.

Hochskalieren und der zweite Durchgang tun Verschiedenes: ein Upscaler schärft, was da ist; ein zweiter Durchgang malt neues Detail in der neuen Größe. Für einen Druck: zuerst zweiter Durchgang ×2, dann hochskalieren.

## 14. Die Bühne, die Bibliothek und der Papierkorb

**Die Bühne**: ein Klick auf ein Bild stellt es dorthin mit seinem Lauf darunter; ein Klick darauf (oder ein Doppelklick auf irgendein Bild) öffnet es über der Seite in seinem eigenen Format (← → gehen den Lauf oder die Galerie entlang; Esc schließt). Darunter: **Ins Formular**, **Als Referenz**, **Vergleichen…**, **Als Cover setzen** (ein quadratisches), **Herunterladen** (PNG, volle Größe), **Über die Seite**, ★, **Schützen** (der Schild: ein geschütztes Bild geht nie in den Papierkorb und wird nie gelöscht, was es auch dorthin schickte), **Papierkorb**, **Zweiter Durchgang…**, **Hochskalieren…**. Die Daten und der Prompt des Laufs stehen in einem Tooltip neben dem Bild, solange der Zeiger darauf ist.

**Läufe oder Galerie**: die Läufe zeigen jeden Druck auf Zeichnen mit seinem Prompt und Seed, die neuesten oben; die Galerie zeigt jedes Bild jedes Laufs in einem Raster, nach Format, mit Stern oder geschützt, in drei Größen, in gleichen Kacheln. Die Pfeiltasten gehen die Bibliothek entlang, solange sie ein Bild hat: ← → das Bild davor und danach, ↑ ↓ eine Reihe der Galerie (in den Läufen der Lauf davor und danach); die Bühne folgt.

**Vergleichen**: **Vergleichen…**, dann das andere Bild in der Bibliothek gewählt: die beiden übereinander unter einem Trenner, den du ziehst (← → bewegen ihn), oder nebeneinander (S); X tauscht sie, Esc schließt.

**Das Menü eines Bildes** (ein Rechtsklick auf irgendein Bild): Über die Seite, Auf die Bühne, Ins Formular, Alles ins Formular, Als Referenz, Vergleichen…, Als Cover setzen, Hochskalieren (2K oder 4K), Mit Stern markieren, Wählen, Den Prompt kopieren, Den Seed kopieren, Herunterladen, Die Datei in einem neuen Tab, Sein Lauf, In den Papierkorb.

**Viele wählen**: Strg+Klick wählt Bilder, Umschalt+Klick einen Bereich; die Leiste der gewählten versieht sie mit Stern, skaliert sie hoch oder legt sie auf einmal in den Papierkorb (Esc lässt sie los).

**Der Papierkorb**: **Papierkorb** an einem Lauf verschiebt ihn nach `trash/artist/`; der Papierkorb der Bühne legt ein Bild beiseite. Die Ansicht **Papierkorb** zeigt die beiseitegelegten Bilder (Wiederherstellen, ✕, Alle wiederherstellen), dann die Läufe im Papierkorb (Wiederherstellen, Endgültig löschen); **Alles löschen** löscht alles, was sie zeigt, nach einer Frage. **Papierkorb (Bilder)** im Bibliothekar hält die weggelegte Kunst in einer Liste, auch die von Takes abgenommenen Cover.

**Das Protokoll des Malers**: der Rahmen des Server-Protokolls hat eine Ansicht **Maler**, die eigene des Raums: was verlangt wurde (der Maler, das Fine-Tune, die Formate, der Seed, das Sampling, die Adapter), was das Labor antwortete (eine Ablehnung in seinen eigenen Worten), der Weg jedes Laufs bis zu seinem Ende (Wartezeiten und warum, die Karte, auf der er malt, fertig, gestoppt, gescheitert und warum). **⧉** öffnet es in einem eigenen Fenster, mit den Karten live daneben.

## 15. Cover für Takes

**Als Cover setzen** an einem quadratischen Bild macht es zum Cover des Takes in der Hand: auf seiner Karte, im Player und in seinem MP3. Das Cover, das er hatte, wird neben dem Take behalten (`artwork-removed/`), und der andere Buchstabe eines A/B-Paars bekommt das neue auch, wenn er keines hat. Ein Cover ist die eigene Kopie des Takes (1024 px, mit dem Namen des Laufs und des Bildes, aus dem es kam), sodass es vom Take zu nehmen nie das Bild berührt und das Gehen des Bildes nie das Cover; legt man ein solches Bild in den Papierkorb, wird gefragt, ob auch das Cover vom Take genommen oder gelassen werden soll.

**Das eigene Artwork eines Takes** (*Bild zeichnen* in seinem Menü, im Bibliothekar, für einen Take oder viele) malt der Maler, der in **Engine → Artwork** gewählt ist, oder nach den Karten, wenn keiner gewählt ist: **Qwen-Image 2512**, wo eine Karte für die Aufgaben des Labors es ganz fasst (Q6 ab 20 GB, Q4 ab 16 GB: es folgt dem Prompt am besten und beschriftet einen Titel richtig), sonst **Krea 2 Muse Q4** (ganz auf einer 16-GB-Karte, seine Blöcke auf einer kleineren aus dem RAM). Ein kleines Sprachmodell schreibt seinen Prompt aus Stil und Worten des Takes, und der Kritiker schaut, ob sein Motiv da ist. Ein Cover ist eine eigene Aufgabe, die ihren Maler neu lädt, darum dauert ein Qwen-Cover etwa doppelt so lang wie ein Krea-Cover: auf einer 3090 Krea 2 Muse Q4 etwa 65 s, Qwen-Image 2512 Q4 125 s und Q6 131 s, alles mitgezählt (Abschnitt 18). Ein Q4 ist nicht schneller als ein Q6: Malen ist die Arithmetik der Karte, nicht ihr Speicher.

## 16. Rezepte

**Ein Cover, schnell.** Krea 2 Muse Q4, 1:1, Variationen 4, das Sampling, wie es kommt. Zwei Minuten für vier Kandidaten; wähl eins, Als Cover setzen.

**Fertiger Realismus.** Qwen-Image 2512 mit einem fp8-Fine-Tune, Lightning aus, 30 bis 40 Schritte, Führung 4, ER-SDE oder RES 2s mit Beta. Dann Zweiter Durchgang ×2 bei 0,45 mit Zusätzlichem Rauschen 0,6 (das Sampling des Formulars geht mit hinein), dann Hochskalieren 4K oder die Durchgänge.

**Viktors erster und zweiter Durchgang aus ComfyUI.** Ein fp8-Fine-Tune, ER-SDE und Bong tangent, 12 Schritte; Zweiter Durchgang ×2 mit 0,6 zusätzlichem Rauschen und vielen Schritten ohne Lightning, die Stärke zwischen 0,5 und 0,65.

**Ein Videobild aus einem Cover.** Das Cover als Referenz, Drumherum malen, das Format 16:9 (oder 9:16 für einen Short): die Ränder in seinen Farben und seinem Licht gemalt, das Cover ganz in der Mitte. Auf der Leinwand das Cover zuerst in jedem Ausschnitt verschieben oder skalieren, wenn es nicht in der Mitte sitzen soll.

**Einen Teil reparieren.** Das Bild als Referenz, Maske… über den Teil, der Prompt sagt, was dort sein soll, Stärke 1,0; Erweitern 16, Rand 24, Sanft, Korn 0,15 für eine Naht, die man nicht sieht.

**Zwei Motive an ihren Plätzen.** Der Hauptprompt für die ganze Szene, eine Region für jedes Motiv (linke Hälfte, rechte Hälfte), die Worte der Regionen kurz und konkret.

**Der Stil eines alten Gemäldes für eine neue Szene.** Das Gemälde als Referenz, Verwenden: nur für seinen Stil, der Prompt für die neue Szene.

**Dieselbe Szene zu einer anderen Jahres- oder Tageszeit.** Das Bild als Referenz, Verwenden: um es mit Worten zu bearbeiten, der Prompt sagt die Änderung (*the same street in heavy rain at night*).

**Ein Druck.** Zweiter Durchgang ×2, dann Durchgänge… bis 7680 an der langen Seite, TTA für einen glatten Himmel.

## 17. Wenn etwas schiefgeht

| was du siehst | warum | was tun |
|---|---|---|
| das Motiv doppelt gemalt | Qwen-Image 2512 mit Lightning auf Karras, Exponential oder KL optimal | Simple, Beta, Beta 57, SGM uniform oder Bong tangent |
| weiche, dunstige Qwen-Bilder | Euler SDE ohne Lightning | Euler, ER-SDE oder RES |
| Farben und Kanten verbrannt | die Summe der Adapter über etwa 1,8 | senk sie (der Balken Zusammen), oder Keyframes, die einen früh loslassen |
| „der Adapter erreicht keine Schicht“ | ein Adapter für ein anderes Modell | leg ihn in den Ordner seiner eigenen Familie |
| Buchstaben, die du nicht verlangt hast | beide Maler beschriften Cover von selbst | schließ den Prompt mit *no text* |
| ein Bild fehlt in einem Lauf | der Inhaltsfilter hat es markiert | der Lauf sagt es; änder den Prompt |
| eine sichtbare Naht um eine Maske | ein harter Rand | Erweitern, Rand, Sanft und ein wenig Korn |
| der zweite Durchgang hat die Szene verschoben | die Stärke zu hoch | 0,4 bis 0,5 |
| der Lauf wartet auf eine Karte | die Karten des Labors sind gerade belegt oder zu klein | die Aktivität des Protokolls sagt warum; Aus der Warteschlange nimmt ihn zurück |
| „keine Karte hier kann das nehmen“ | der Maler mit seinen Adaptern braucht mehr, als irgendeine Karte fasst | weniger Adapter oder ein kleinerer Maler (Krea 2 und Qwen-Image 2512 streamen stattdessen, wenn sie können) |
| Regionen ignoriert | Qwen-Image 2.1 gewählt, oder eine Region ohne Worte | Krea 2 oder Qwen-Image 2512, Worte in jeder Region |
| erster Lauf langsam, die nächsten schnell | der Maler lädt einmal und bleibt zehn Minuten | so gedacht |

## 18. Die Zahlen

Gemessen auf einer RTX 3090 (24 GB) mit den eigenen Werkzeugen des Studios.

| was | Zeit | Karte an der Spitze |
|---|---|---|
| Krea 2 Muse Q4, 1280² | etwa 35 s | etwa 10 GB |
| Krea 2 Muse Q4, 16:9 | etwa 47 s | etwa 11 GB |
| Krea 2 Muse Q8, 1280² | etwa 34 s | etwa 16 GB |
| Qwen-Image 2512 Q4, 1328², Lightning | 30 s | 14,3 GB |
| Qwen-Image 2512 Q6, 1328², Lightning | 32 s | 17,6 GB |
| fp8-Fine-Tune von Qwen-Image 2512, 1328², Lightning 0,55, 12 Schritte | 37 s | 21,0 GB |
| fp8-Fine-Tune von Qwen-Image 2512, 16:9 | etwa 141 s mit seinem Laden | 20,5 GB |
| Qwen-Image 2.1 aus Worten, 1328² | 120 s | 16,4 GB (ganz), 4,1 GB (gestreamt) |
| Qwen-Image 2.1 beim Bearbeiten | 122 bis 129 s | 19,1 GB (ganz), 7,9 GB (gestreamt) |
| zwei Regionen, Krea 2 Q4, 16:9 | 137 s | wie ohne |
| zweiter Durchgang ×2, Krea 2 Q4 auf 2560² | 86 s | 14,5 GB |
| zweiter Durchgang ×2, fp8-Fine-Tune von Qwen-Image 2512 auf 3840 × 2160 | 220 s | 22,9 GB |
| Hochskalieren ×2, 4x_Nomos8kDAT, 1280² auf 2560² | 32 s | 2,1 GB |
| Hochskalieren in Durchgängen, seine Kette, 1920 × 1080 auf 7680 × 4320 | 246 s | |
| Cover eines Takes von Krea 2 Muse Q4 (eine eigene Aufgabe: der Maler geladen, der Prompt geschrieben, der Blick des Kritikers) | etwa 65 s | |
| Cover eines Takes von Qwen-Image 2512 Q4 / Q6, ebenso | 125 s / 131 s | |

Der erste Lauf eines Malers fügt sein Laden hinzu: etwa 25 s für Krea 2 Muse, ein, zwei Minuten für die Qwen-Maler.

## 19. Für Skripte und Agenten

Das Labor antwortet auf dem Rechner des Studios (über die Seite unter `/lab/…`); die API des Studios (`/api/v1`, OpenAPI 3.1) und sein MCP-Server stehen daneben. Die eigenen Endpunkte des Malers:

- `POST /artist/draw`: ein Lauf. Sein Rumpf: `prompt`; `shapes` (`1:1`, `16:9`, `9:16`); `count` (1 bis 4); `seed`; `painter` (`krea2-q4`, `krea2-q8`, `qwen2512-q4`, `qwen2512-q6`, `qwen2512-fp8`, `qwen21`); `model` (die Datei eines fp8-Fine-Tunes); `sampling` (`steps`, `sampler`, `schedule`, `lightning`, `cfg`); `loras` (`[{id, weight, keys}]`); `ref` (eine Data-URL, oder `{id, file}` eines Bildes eines früheren Laufs) mit `strength` (0,2 bis 1) und `ref_as` (`edit`, `style`); `mask` mit `mask_opts` (`grow`, `edge`, `soft`, `grain`); `fit` (drumherum malen); `place` (die Leinwand: `{shape: {x, y, s}}`); `inject` (0 bis 2); `scale` (1,5 oder 2, ein zweiter Durchgang); `regions` (`[{prompt, box: [x, y, w, h]}]`, höchstens drei); `letters` (`{title, sub, look, where, way}`: `where` `top`, `middle` oder `bottom`, `way` `paint` oder `letter`; mit `letter` ist der Maler `qwen21` mit einer `ref`, und `prompt` darf leer sein); `preview`; `take`. Ein beschrifteter Lauf trägt `letters_prompt` (den Satz, den der Maler las), und jedes seiner Bilder `letters`: `{read, exact, near, tries}`, oder `{unread}`, wenn der Hörer es nicht lesen konnte.
- `GET /artist/runs`, `GET /artist/file`, `POST /artist/stop`, `POST /artist/cover`, `POST /artist/star`, `POST /artist/protect`, `POST /artist/trash`, `POST /artist/restore`, `POST /artist/aside`.
- `GET /artist/painters` (die Maler hier, ihre Karten und Fine-Tunes), `POST /artist/unload` (die gehaltenen Maler loslassen).
- `GET /artist/upscalers`, `POST /artist/upscale` (`{id, file, model, target}` mit `2k` oder `4k`; oder `passes`, `resample`, `long`, `match`; `tta`; oder `items` für viele).
- `GET /artist/loras`, `POST /artist/lora-civitai` (Suche per Hash), `POST /artist/civitai-look`, `POST /artist/civitai-fetch`.

Eine Ablehnung kommt als `400` mit dem Grund in Worten zurück, denselben Worten, die der Raum zeigt.

## 20. Lizenzen

Krea 2 Muse: die Krea 2 Community License (ihr Inhaltsfilter gilt für jedes Bild, das das Studio malt). Qwen-Image 2512 und Lightning: Apache-2.0. Die fp8-Fine-Tunes: die Bedingungen jedes Autors. Qwen-Image 2.1: die Qwen Research Licence, nur Forschung und Bewertung. Adapter: die Bedingungen jedes Autors, wie Civitai sie aufführt. Upscaler: jeder seine eigenen; die Notizen von OpenModelDB sagen, welche nicht-kommerziell sind, und der Raum markiert sie. Was du mit den Bildern tun darfst, die du malst, folgt daraus; wenn es darauf ankommt, lies sie, bevor du verkaufst.

## 21. Was als Nächstes kommt

Die Versionen des Bildes eines Takes, und SeedVR als Upscaler (in 2.1.0, mit der DAW-Phase).
