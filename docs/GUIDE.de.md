# Ruach Studio · der Guide

Songs aus Worten, auf deiner eigenen Maschine: jeder Raum, was jedes Ding tut, und die Zahlen, die wir gemessen haben.

## Hier anfangen <!-- #start -->

### Was das ist <!-- #what-this-is -->

Ruach Studio macht aus einer Stilzeile und einem Text einen fertigen Song mit **YuE2**, dem offenen Song-Modell, auf deiner eigenen GPU. Nichts verlässt die Maschine. Um das Modell herum steht ein ganzes Studio: ein Schreibraum mit einem Chat-Modell, Postproduktion (Stems, Remaster, Hochskalierung, Textprüfung), eine Sammlung aller Takes und ein Raum, der LoRA-Adapter auf deinen eigenen Songs trainiert.

![Der Schöpfer: links das Formular, in der Mitte der Take, rechts alle Takes](guide/studio-create.png "Der Schöpfer: das Formular, der Take, den du hörst, und alle deine Takes")

YuE2 hat **zwei Hälften**, und das meiste, was du im Studio einstellst, zielt auf eine davon:

| Hälfte | was sie tut | was du dort steuerst |
|---|---|---|
| **Musik** (AR, das Sprachmodell) | schreibt den Song: zuerst eine Partitur (ABC-Notation), dann die Musik-Tokens, 25 pro Sekunde | den Planungsmodus, die Partitur, den Musik-Seed, die Musikstärke einer LoRA |
| **Klang** (NAR + VAE) | rendert die Tokens zu Klang | den Klang-Seed, das VAE, die Klangstärke einer LoRA, Schritte und Solver |

### Die sechs Räume <!-- #the-six-rooms -->

| Raum | wofür |
|---|---|
| **Schöpfer** | das Song-Formular und der Take, den du hörst |
| **Schreiber** | deine Songs als Dokumente mit Versionen; ein Chat-Modell entwirft und überarbeitet mit dir |
| **Veredler** | nach dem Rendern: Spektrum, Artefakte, Entbrummer, Textprüfung, Stems, Remaster, Hochskalierung |
| **Maler** | Bilder für deine Songs aus deinem eigenen Prompt: quadratisch, breit und hoch aus einem Seed; ein quadratisches wird zum Cover eines Takes (eine frühe Vorschau) |
| **Bibliothekar** | jeder Take: Arbeitsbereiche, Suche, Likes, Notizen, Sammelaktionen, der Papierkorb |
| **LoRA-Trainer** | LoRA-Adapter aus deinen eigenen Songs: das Set, der Lauf, seine Telemetrie und seine Epochen |

### Die Leiste <!-- #the-bar -->

![Die Leiste: die Räume, der Arbeitsbereich und die paar Knöpfe, die du ständig benutzt](guide/bar.png)

Die Räume eröffnen die Leiste in der Reihenfolge der Arbeit: Schöpfer, Schreiber, Veredler, Maler (eine frühe Vorschau: Bilder für deine Songs) und Bibliothekar; das Logo steht in der Mitte, der Trainer gleich danach; rechts der Arbeitsbereich, die Lampe der Engine (grün: bereit; bernstein: arbeitet; rot: etwas ist fehlgeschlagen) und die paar Knöpfe. Der Zeiger auf der Lampe (oder ein Klick) öffnet **was läuft und was wartet**: die Songs, die Neuerzeugungen und die Arbeit des Labors auf den Karten (Artwork, Stems, Hochskalierung, Whisper). Ein Wartender verlässt seine Warteschlange über sein ✕, zweimal gedrückt (der erste Druck fragt); was schon läuft, hält dort an, wo es angezeigt wird: ein Song in seinem Lauf, ein Training im Trainer.

- **Arbeitsbereich**: der Arbeitsbereich in der Hand. Die Take-Liste zeigt nur ihn, und jeder neue Take landet darin. *Alle Arbeitsbereiche* zeigt alles. Wo die Leiste schmal ist (dort kein Logo), fällt auch das Wort *Arbeitsbereich* weg; das Feld bleibt.
- **EN** (die zwei Buchstaben der Sprache): die Seite in einer anderen Sprache, mit deinen Einstellungen behalten: English, Русский, Українська, Беларуская, Ελληνικά, Español, Italiano, Français, Português, Deutsch, 日本語, 中文, jede in ihren eigenen Worten benannt. Zahlen und Daten folgen der Sprache, und dieser Guide öffnet sich in ihr.
- **☀ / ☾**: Tag, Nacht, oder wie das System es sagt.
- Im Kopf von Komponieren: einen Prompt (alles, was Erzeugen senden würde) als JSON oder YAML **Speichern** und wieder **Öffnen**; die Wörter **Leeren** (Titel, Stil, Text, Partitur, Seeds) und den Rest behalten, oder einen **Neuen Song** beginnen (Modus, Sampling, Regler und LoRAs auch zurück auf die Voreinstellungen; *Klang und Ausgabe* bleibt). **Öffnen** sagt, was das Formular aus einer Datei nicht übernehmen konnte und was sie stattdessen enthält.
- **In die DAW exportieren** (im ☰, und im Veredler: neben dem Take in der Hand und in seinen Stems): der Weg aus dem Studio. Entweder die gemischte Spur, wie sie ist (WAV, FLAC, MP3), oder der ganze Take in deine eigene DAW, wo der Rest außerhalb des Studios geschieht. Die Seite findet REAPER, Waveform und Bitwig auf der Maschine des Studios, oder du nennst deine. Jeder Take geht über sein Menü hinaus (Rechtsklick): *In die DAW exportieren → REAPER-Projekt* oder *DAWproject* (Waveform, Bitwig, Studio One, Cubase), deine eigene DAW zuerst; der DAW-Reiter dieses Guides sagt, was darin ist.
- **Modell entladen**: nimmt jetzt jedes untätige Modell aus dem GPU-Speicher; rot getönt, solange ein Modell geladen ist.
- **☰**: der Rest. Die Karte und ihr Speicher, die Modellkopie, der Klang-Decoder (VAE), **In die DAW exportieren**, die Themes, der Engine-Raum und dieser Guide. **Textgröße** stellt dort den ganzen Text der Seite von −2 bis +4 pt ein (das Layout bleibt), und ein abgelöster Rahmen hat oben eigene −, + und ⟲ (−4 bis +6 pt); jeder Bildschirm behält seine.

![Hinter dem ☰](guide/more-menu.png)

### Dein erster Song, in sechs Schritten <!-- #your-first-song-in-six-steps -->

1. Gib ihm einen **Titel**, und wähle die **Tonart**, wenn du eine im Kopf hast (oder lass *wie geschrieben*).
2. Schreib den **Stil**: Sprache, Genre, Stimme, Instrumente, Tempo. Eine oder zwei schlichte Zeilen genügen. Das ♪ daneben listet 200 Instrumente mit dem, was YuE2 wirklich spielt (siehe *Schöpfer*).
3. Füge den **Text** ein, mit den Abschnitts-Tags in eigenen Zeilen: `[Verse]`, `[Chorus]`, `[Bridge]`, `[Outro]`.
4. Behalte **Voller Plan** als Planungsmodus: YuE2 schreibt zuerst Melodie und Akkorde, dann den Song.
5. Drück **Song erzeugen**. Der Lauf zeigt seine Stufen: die Partitur, die Musik-Tokens, den Klang, das Dekodieren.
6. Der Take öffnet sich in der Mitte, mit seinem Player, seiner Partitur und allem, um ihn noch einmal zu machen.

> Gemessen auf einer RTX 3090: ein Song von 6:12 im Direkt-Modus brauchte 126 Sekunden, einer von 7:25 im Vollen Plan 198 Sekunden (die Partitur wird zuerst geschrieben). Kürzere Songs gehen schneller.

### Der Player, die Takes und das Server-Protokoll <!-- #the-player-the-takes-and-the-server-log -->

- **Der Player** unten: die Welle quer darüber, eine weiche Wolke, der schon gehörte Teil in der Akzentfarbe (ein Klick springt dorthin); darunter der Take (sein Artwork, wenn er eins hat, sein Titel, die ersten Wörter seines Stils, 👍 👎 ★), dann **Zufall**, zurück, Wiedergabe, weiter und **Wiederholen** (aus · die ganze Liste noch einmal · dieser Take noch einmal, mit 1 markiert), dann die Zeit (ein Klick auf die Gesamtzeit macht daraus die Restzeit), *Beim Klick abspielen* (ein Klick in einer Liste spielt den Take sofort), *Weiterspielen* (wenn ein Take endet, startet der nächste in der Liste), *Neue Takes abspielen* (ein hier gemachter Song spielt, wenn er fertig ist, außer etwas spielt gerade), 🔔 *ein Klang, wenn ein Lauf endet* (zwei Töne aufwärts, wenn er fertig ist, einmal für eine Warteschlange von Läufen, zwei abwärts, wenn einer fehlschlägt; keiner über einem neuen Song, der von selbst zu spielen beginnt), das **Tempo** (0.50× bis 2.00×, die Tonhöhe bleibt), die Lautstärke und ein Punkt für den Zustand (er pocht, solange ein Take spielt). Was du gerade nicht brauchst, bleibt blass, bis der Zeiger kommt; jedes Symbol sagt, was es tut, wenn der Zeiger darauf ruht. Der Zeiger über der Welle zeigt die Zeit, zu der ein Klick springen würde. Die Medientasten der Tastatur und eines Headsets steuern den Player, und das Medienfeld des Desktops zeigt den Take. ⏪ und ⏩ gehen zur vorigen oder nächsten Marke alle 15 s ab 0:00, ← und → zu den Marken alle 5 s (Shift: 30 s). Die Statuspille am rechten Ende des Players (grün, solange ein Take spielt, in der Akzentfarbe, solange einer entsteht) öffnet den Take oder den Lauf; mit über den Raum abgelöstem Komponieren wechselt sie den Rahmen auf den des Takes. Ein Rechtsklick auf die Welle, das Bild oder den Titel öffnet das Menü des Takes, wie in einer Liste. Die Welle zeigt die Abschnitte des Takes: die eigenen Tags des Textes, jeder dort, wo Whisper seine erste Zeile hört (einmal pro Take, etwa eine halbe Minute; von selbst auf einer Maschine mit zwei oder mehr Karten, sonst Menü des Takes → *Die Abschnitte nach Gehör finden*); ein nie gehörter Take zeigt die Marken seiner Partitur. Eine dünne Linie an jedem Anfang, sein Name unten; ein Klick an einer Linie geht zum genauen Anfang des Abschnitts; der Zeiger über der Welle zeigt eine Karte mit dem Abschnitt, seiner Zeit und seinen Zeilen, wie sie geschrieben sind, die dort gesungene Zeile hervorgehoben; ein mit ? markierter Abschnitt wurde nicht klar gehört. Ruht der Zeiger einen Moment auf der Welle, kommt über dem Player das Spektrogramm des ganzen Takes hoch (der Spektrum-Schalter neben 🔔 schaltet es aus): so breit wie die Welle und zeitgleich mit ihr, etwa ein Drittel der Fensterhöhe, die Karte des Abschnitts darüber; darin die Abschnitte, der spektrale Schwerpunkt als Magenta-Linie (wo das Gewicht des Klangs liegt: seine Helligkeit), der RMS in einem Streifen unten mit dem eigenen Durchschnitt des Takes gestrichelt, der Abspielkopf; unter dem Zeiger seine Zeit, das Spektrum dieses Moments neben der Linie mit seiner lautesten Frequenz und Note, und oben im Bild die Frequenz dort, ihre Note und ihr Pegel. *Log* oder *Linear* in seinem Kopf; ein Klick geht dorthin wie auf der Welle; der Zeiger weg oder Esc nimmt es herunter. Der Take wird einmal gemessen, vom Labor, wie für sein Spektrum.
- **Zwei Zeilen oder eine**: der Player behält die Welle über seinen Bedienelementen dort, wo Songs gehört und verglichen werden (der Schöpfer, der Veredler, der Bibliothekar), und ist eine Zeile im Schreiber, im Maler, im Trainer und in der Engine, und im Schöpfer, solange ein Rahmen abgelöst ist oder der Text über allem liegt. Nach einem Neuladen (F5) kommt er mit seinem Take und seiner Stelle zurück. Im Maler beginnen die Takes eingeklappt und das Server-Protokoll steht links.
- **Die Karten live**: unter Engine → GPUs hat jede Karte eine eigene Zeile darunter, ihre Last und ihr Speicher ein Balken pro Sekunde über zwei Minuten, mit Temperatur und Leistung; das ausgeklappte Server-Protokoll zeigt daneben die Karten, die eine Rolle haben, jede mit ihrer Rolle überschrieben, die Karte des Studios umrahmt.
- **Die Leitung zum Studio** steht neben dem Server-Protokoll (*Forge · 85 ms*, oder *hier* auf derselben Maschine). Ist das Studio weit weg, erscheint ein Like, ein Favorit oder eine Anheftung sofort und das Studio bestätigt es nur.
- **Takes** rechts: Suche mit Wörtern, `*` und `?`; *Favoriten*; die Spalte mit » einklappen; ⋯ für die eigenen Aktionen der Liste.
- **Das Server-Protokoll** sitzt in jedem Raum direkt über dem Player: eingeklappt zeigt es das Letzte, was die Engine gesagt hat (rot, wenn etwas fehlschlug); ausgeklappt zehn Zeilen, *Folgen*, *Kopieren* und den Weg zum ganzen Protokoll in der Engine. Mit einem über den Raum abgelösten Rahmen steht es links, abseits der Knöpfe des Rahmens. Der Pfeil an seiner inneren Kante bringt es auf die andere Seite der Seite, und jeder Raum behält seine Seite (die des Malers ist links). Seine äußere Kante zieht es breiter, bis 1200 px (behalten; ein Doppelklick gibt ihm seine eigene Breite zurück); mit den Karten daneben ist es 920 px breit, ihre Spalte 390. Der Rahmen hat zwei Ansichten, **Server** und **Maler** (das eigene Protokoll des Malers: was gefragt wurde, was das Labor antwortete, der Weg jedes Laufs bis zu seinem Ende), und jeder Raum öffnet seine eigene; **⧉** öffnet das Protokoll in einem eigenen Fenster, über allen Fenstern in Chrome oder zum Tragen auf einen anderen Monitor.

![Das Server-Protokoll, ausgeklappt](guide/log-dock.png)

## Schöpfer <!-- #creator -->

### Komponieren: das Song-Formular <!-- #compose-the-song-form -->

![Titel, Tonart, Seeds und Stil](guide/compose-top.png)

- **Mit einer Idee beginnen**: eine Zeile über den Song; das Chat-Modell des Schreibers entwirft Titel, Stil und Text (*Das Briefing schreiben*).
- **Titel**, **Tonart**: die Tonart geht in die Partitur (`K:`). Mit einer Partitur im Formular transponiert eine neue Tonart sie dorthin; ohne Partitur wartet die Wahl und transponiert die Partitur, die kommt.
- **Musik-Seed** und **Klang-Seed**: die Würfel der zwei Hälften. Leer ist zufällig; eine Zahl wiederholt einen Take. Behalte den Musik-Seed und ändere den Klang-Seed, um denselben Song anders gerendert zu hören. Sie stehen ganz oben in *Sampling und Entrauschen*. Neben jedem sein **Modus**: *Zufällig (−1)* bei jedem Lauf ein neuer Seed (das Feld leer), *Zufällig, fest* ein zufälliger, eingetragen und behalten, *Fest* der geschriebene, *Weiter* und *Zurück* schieben ihn nach jedem Erzeugen über die benutzten Seeds hinaus (die Versionen für die Musik, die Variationen für den Klang). Der Seed des Malers hat dieselben Modi.
- **Stil**: Sprache, Genre, Stimme, Instrumente, Tempo. *Stil speichern…* behält ihn unter einem Namen. **♂** und **♀** in seinem Kopf setzen *male vocals* oder *female vocals* hinein (anstelle des Worts des anderen Geschlechts, sonst vor die BPM); der leuchtende nimmt seinen Tag heraus. **Freies Tempo** daneben macht die Musik aus der Partitur ohne ihre Tempoangaben (Q:): Stimme und Puls atmen von selbst, der Text hängt nicht mehr am Takt (Rubato, nichtlinear); es schaltet sich selbst ein, wenn der Stil Rubato oder non-linear verlangt und kein BPM nennt, und ein BPM im Stil bei eingeschaltetem freiem Tempo wird unter dem Feld genannt. Eine allein erstellte Partitur (*ABC-Partitur erstellen*) kommt ebenfalls ohne Tempo.

### Der Spickzettel der Instrumente ♪ <!-- #the-instruments-cheat-sheet -->

Das ♪ neben dem Stil öffnet eine Tabelle von 200 Instrumenten, die das Studio geprobt hat: ihre Familie, ihre Herkunft, wie sie klingen (auf Englisch und Russisch) und die Wörter, die sie rufen. ▶ A und ▶ B spielen zwei 60-Sekunden-Proben von jedem. Das Urteil jeder Zeile kommt von einem menschlichen Ohr: gehört, fraglich, oder **NOT IDENTIFIED IN YUE2** (YuE2 kennt es nicht; es braucht ausgefeiltere Prompts). Ein Klick kopiert den Namen und fragt, wohin er soll: ans Ende des Stils in eine eigene Zeile, oder an seine Stelle; ein Name, den der Stil enthält, ist in der Tabelle markiert, und der Text der Tabelle lässt sich auswählen und kopieren.

**YuE2 entscheidet, wann ein Instrument einsetzt.** Eine Stilzeile ist eine Bitte, kein Befehl: wie sehr du auch bittest, das Modell bringt ein Instrument dort, wo sein Training sagt, dass der Song es will, und der Seed entscheidet viel. Derselbe Prompt gab einen Take mit dem Instrument und einen ohne. Hör mehrere Seeds, bevor du ein Instrument beurteilst.

**Gehört, aber nicht so echt wie live.** Viele Instrumente spielen, doch weniger klar und weniger echt als das Original: das ist, was YuE2 von ihnen weiß. Die Urteile sagen, ob YuE2 ein Instrument überhaupt spielt, nicht wie echt es klingt. Es echt zu machen, ist die Arbeit einer **Instrument-LoRA**: ein paar Dutzend saubere Aufnahmen davon, im LoRA-Trainer trainiert.

![Der Spickzettel der Instrumente](guide/instruments.png)

### Text und Textprofile <!-- #lyrics-and-text-profiles -->

- Abschnitts-Tags in eigenen Zeilen; YuE2 kennt `[Intro]`, `[Verse]`, `[Pre-Chorus]`, `[Chorus]`, `[Bridge]`, `[Interlude]`, `[Outro]`.
- **Textprofil**: füge einen ganzen Text ein, wähle ein Profil, *Anwenden*: seine Regeln (Bereinigung, Phonetik) und seine Form (`[Intro]`, `[Verse]` an Leerzeilen, `[Interlude]` nach langen Absätzen) machen ihn lesefertig. *Rückgängig* holt den Text zurück. Profile entstehen im Schreiber.

### Das Versmaß des Textes und die phonetische Hand <!-- #the-lyrics-meter-and-the-phonetic-hand -->

- **Das Versmaß** neben dem Text: die Silben jeder Zeile als Balken gegen das Lineal ihrer Gruppe — Strophe und Bridge eine Gruppe, der Pre-Chorus seine eigene, der Refrain seine eigene, jeder andere Abschnitt seine eigene. Eine Pause, ein Break, eine Stille, ein Interlude, ein Präludium oder ein instrumentaler Hinweis in einem gesungenen Abschnitt öffnet keine Gruppe: sein Name steht gedimmt daneben und das Lineal des Abschnitts läuft weiter. Tags werden nie gezählt: eine Zeile nur aus Tags (`[Break] [Silence]`) zählt als keine, ein Tag in einer Zeile wird ausgelassen. Das Lineal steht bei der üblichen Länge der Gruppe; innerhalb einer Silbe ist der Balken grün, zwei oder drei daneben bernstein, mehr rot. Was in runden Klammern steht, wird nach dem Balken schraffiert gezeichnet: YuE2 singt es vielleicht. Unter dem Feld: die Zeichen, Silben und Zeilen des Textes, die Abschnitts-Tags, die Klammern und die phonetische Hand; die Rechtschreibprüfung des Browsers in der Sprache des Textes (dort ausgeschaltet); ein von Hand höher gezogenes Feld behält seine Höhe bis *Automatische Höhe*.
- **Zeilennummern und Marken**: das Textfeld nummeriert seine Zeilen wie ein Code-Editor (eine umbrochene Zeile einmal, in ihrer ersten Reihe; *Zeilennummern* unter dem Feld schaltet sie aus). **Alt+K** markiert die Zeile des Cursors oder hebt die Marke auf, **Alt+J** springt zur nächsten Marke, **Alt+Shift+J** zur vorigen, **Alt+Shift+K** löscht sie; die Nummer einer markierten Zeile ist bernstein, und die Marken folgen ihren Zeilen, wenn du darüber schreibst. Jeder [Tag] liegt unter einer dünnen Bernsteinschicht. Der Text im Schreiber hat dasselbe. Wie in mcedit: **Alt+O** löscht die Marken auch, **Alt+L** geht zu einer Zeile nach ihrer Nummer, **Strg+Y** löscht die Zeile, **Alt+↑** und **Alt+↓** verschieben die Zeile (oder die markierten Zeilen) mit ihrer Marke. *Tasten* unter dem Feld listet sie alle, und das Etikett LIEDTEXT im Schreiber nennt sie beim Überfahren. **⤢** neben Liedtext legt das Feld über alles, 60 % der Bildschirmbreite und vier Zehntel größer, mit all dem, und eigenen −, + und ⟲ für die Textgröße (in diesem Browser behalten); Esc bringt es zurück. Neben **⤢** halten zwei Knöpfe den Text als reinen Text: der erste speichert ihn als `.txt`, nach dem Titel benannt, der zweite setzt eine `.txt` (UTF-8) an seine Stelle (fragt vorher, wenn das Feld Wörter hat, und **Strg+Z** im Feld holt sie zurück; ein leerer Titel bekommt den Namen der Datei).
- **Klammern geprüft**: ein «[», das in seiner Zeile nicht geschlossen wird, ein «]» ohne offenes, ein «[» in einem Tag und ein leerer Tag färben die Nummer ihrer Zeile rot, und *Nicht geschlossene oder verirrte Tags* unter dem Feld geht von einem zum nächsten; eine offen gelassene oder ohne offene geschlossene runde Klammer ist bernstein (ein Echo darf weiterlaufen). Ein «[», das gerade getippt wird, bleibt in Ruhe, bis der Cursor seine Zeile verlässt. **Erzeugen fragt vorher**, wenn ein Tag kaputt ist: was einem nicht geschlossenen «[» folgt, kann im Song verloren gehen, und sein Ende kann schiefgehen; *Zur Zeile*, oder *So erzeugen, wie es ist*.
- **Verirrte Betonungszeichen**: ein Zeichen neben keinem Vokal — am Zeilenanfang, nach einem Leerzeichen oder Zeichen, auf einem Konsonanten, ein zweites auf demselben Buchstaben, oder ein freistehendes ´ an seiner Stelle — zeigt einen roten Knopf unter dem Feld (*Betonungszeichen neben keinem Vokal*) und eine Marke vor der Zählung der Zeile; der Knopf wählt jedes der Reihe nach aus. Ein Wort mit zwei Zeichen bekommt eine bernsteinfarbene: gewollt oder ein Versehen? In der Zählung ist ein Betonungszeichen keine Silbe; ע und ein lateinischer Vokal in einem russischen Wort schon. Eine Silbe ist ein Vokallaut, eine Note, gezählt nach den Regeln jeder Sprache: ein Vokalbuchstabe im Russischen, Ukrainischen und Belarussischen (und da das Versmaß die Zeit misst, die eine Zeile braucht, nehmen ein Wort ohne Vokal — с, в, к, з, й, ў — und ein Verschlusslaut, der in einem Wort gegen eine Affrikate schließt — глу-п-цо́в —, einen eigenen Schlag, heller gezeichnet: «Я же вижу глупцо́в с приду́рческим планом» hat 12 Silben und 2 solche Schläge, 14); im Griechischen sind αι, ει, οι, ου, αυ, ευ eine (ein Trema oder der Akzent trennt sie: τσά-ι); im Spanischen und Italienischen verbindet sich ein schwaches i oder u mit seinem Nachbarn (cie-lo, cuo-re), zwei starke Vokale sind zwei (po-e-ta); im Englischen ist ein stummes End-e keine (make, aber ta-ble); das Hebräische zählt seine Vokalpunkte; Chinesisch, Japanisch und Koreanisch ein Zeichen je Silbe. Lateinische Wörter zählen als Englisch, Spanisch oder Italienisch: nach dem Wort des Stils für die Sprache, sonst nach den kleinen Wörtern des Textes selbst.
- **Strg+F** im Text oder im Stil (und in den Feldern des Schreibers) sucht nur in diesem Feld: Enter und Shift+Enter gehen durch die Treffer, Esc aus dem Suchfeld setzt den Cursor mit dem ausgewählten Treffer zurück; aus dem Feld selbst (woanders hineingeklickt) schließt es die Leiste und lässt den Cursor, wo er ist, und dort inzwischen getippte Wörter verschieben die Ansicht nicht. Ein Betonungszeichen wird nicht gesucht, ё gilt als е, und о und а finden auch ע und die lateinischen o und a. **F4** oder **Strg+H** öffnet eine zweite Zeile zum Ersetzen: **Enter** setzt die neuen Wörter an die Stelle des aktuellen Treffers und geht zum nächsten, **Strg+Enter** (oder *Alle*) ersetzt alle Treffer auf einmal, und ein **Strg+Z** im Feld nimmt es zurück; **Aa** (**Alt+C**) findet nur in der getippten Schreibung.
- **Tags unter einem «[»**: ein am Zeilenanfang im Text (des Schöpfers oder des Schreibers) getipptes «[» öffnet die Abschnitts-Tags, wie ein Code-Editor seine Wörter anbietet, in der Reihenfolge, in der ein Song sie durchläuft, von Intro bis End. Danach getippte Buchstaben engen die Liste ein (auch mit russischer oder ukrainischer Tastaturbelegung), eine Zahl nummeriert den Tag (`v2` ist `[Verse 2]`), und ein Text, der seine Strophen nummeriert, bekommt die nächste angeboten. ↑ ↓ wählen, Enter oder Tab setzt den Tag in eine eigene Zeile (Strg+Z nimmt ihn zurück), Esc oder `]` schließt die Liste. Intro, Outro und End, die schon im Text stehen, bleiben an ihrem Platz, gedimmt, mit ihrer Zeile: ↑ ↓ erreichen sie und lesen, was sie sind, aber sie werden nicht zweimal gesetzt. Strg+Leertaste öffnet die Liste und tippt am Zeilenanfang das «[» selbst. Die Liste steht in zwei Spalten: die Tags, und daneben, was der aktuelle ist (in unseren Worten, nach dem Leitfaden zu Song-Abschnitten von Genius) und wie oft die 110 offiziellen Beispiele ihn schreiben; das Feld behält seine Größe, wenn die Liste schmaler wird. Abschnitte, die keines schreibt, sind mit TEST markiert. **Ein zweiter und ein dritter Tag** in einer Zeile: ein direkt nach dem Tag einer Zeile getipptes «[» bekommt sein Leerzeichen von selbst und bietet die Tags an, die kein Abschnitt sind (wer singt, wie die Beispiele es schreiben; Female Vocals, Break und Silence mit TEST markiert); Enter setzt ihn in dieselbe Zeile, ein «…» darin ausgewählt für deine Wörter; Strg+Leertaste tippt dort auch « [».
- **Die phonetische Hand** (Viktors, aus SUNO; YuE2 folgt ihr ebenso):
  - **Ein Betonungszeichen** (der kombinierende Akut, U+0301) nach einem Vokal: `обе́щано`, `сули́т`. Es hält in etwa 90 % der Zeilen; der Rest ist Glück des Seeds.
  - **Ein großgeschriebener betonter Vokal** schiebt die Betonung dorthin, wo der Reim sie will, gegen das Wörterbuch: `базилиО́`. Ein Großbuchstabe allein, ohne das Zeichen (`дрОв`), verschiebt die Betonung selten.
  - **ע (Ajin) in einem russischen Wort** wird als weiches о/а gesungen, wie lebendige Sprache ein unbetontes о sagt: `кעмо́рка`, `пעле́но`, `Ка́рлע`. Es bremst auch Rap, der immer schneller wird.
  - **Ein lateinisches o in einem russischen Wort** singt ein hartes, offenes o, wo das Modell а sagen würde: `Кo дну`.
  - **Ein gedehnter Vokal** (`о-о-о`, `БУ… РА… ТИ… НО`) hält eine Note; wo die Musik Platz dafür hat, nicht in jeder Zeile.
  - **[Interlude]** zwischen Teilen macht eine Pause im Rap und bremst Sprache, die immer schneller wird (nicht immer).
  - **Runde Klammern** sind kein Befehl: ein, zwei Wörter in der Sprache des Texts darin werden meist als Chorecho gesungen; eine Anweisung darin (`(Music slowly fades)`) wird meist übergangen oder gesungen. Ein Befehl gehört in eckige Klammern.
  - **Ein hebräisches Wort mit seinen Vokalpunkten** (`רוּחַ`) spricht das Modell besser als in Transliteration.
  - **Eckige Klammern sind ein Befehl** an YuE2: ein Abschnitt, eine Stimme, wie eine Zeile gesungen oder gesprochen wird. Hier lässt sich lange spielen.
- **Stimmen** (kein Abschnitt: die Zeilen bleiben im Abschnitt davor). Viktors Form: `[Vocal: Female - …]` oder `[Vocal: Male - …]` für eine gesungene Zeile, `[Spoken: Female - …]` oder `[Spoken: Male - …]` für eine gesprochene; zuerst wer, nach einem Gedankenstrich wie (`[Spoken: Female - Soft Whisper, Intimate, Sacred]`). Ein gesprochener Tag kann die Zeile selbst anführen: `[Spoken: Female - Soft Whisper] Ты слышишь?`. Auf einer langen Ballade mit einem männlichen Stimmadapter und einer Erzählerin (13.10.2026) folgte YuE2 solchen Tags in etwa 95 % der Fälle, beständiger als SUNO. **Solo** wird in einem Stimm-Tag nicht gehört (die Beispiele behalten es Instrumenten vor: `[Guitar Solo]`): nenne die Stimme. «[» bietet sie nach den Abschnitten an, markiert *kein Abschnitt*.
- **Eine Silbe verschiebt den ganzen Song.** YuE2 liest den Text als eine Kette, bevor es die Musik schreibt: ändere eine Silbe, «», einen Tag, und derselbe Seed geht von dort bis zum Ende einen anderen Weg. Der Seed ist der Würfel, nicht der Song. Um eine Zeile zu ändern und den Rest zu behalten, ersetze ihren Abschnitt (Rechtsklick auf die Welle des Players); um neue Worte zu beurteilen, hör sie auf mehreren Seeds.
- **Länge**: YuE2 hält einen Song von 8 bis 9 Minuten, mehr als die 6:15 von SUNO v6. *Max. Länge* reicht bis 15 Minuten für eine Erzählung, aber über 9 ist es Glück des Seeds.

### VAE, Regler und LoRAs <!-- #vae-sliders-and-loras -->

- Das **VAE** macht aus dem geschriebenen Song Klang: **Standard** (der beste Klang), **Alt** (das der Benchmarks), **Mischung** (eine Mischung aus beiden, ein Add-on). Ein fertiger Take kann später von seiner eigenen Seite aus eine weitere Dekodierung hinzufügen. Es wird im **☰**-Menü unter dem Modell gewählt, für die kommenden Songs; ein Take dekodiert von seiner Karte aus in Sekunden mit einem anderen neu (seit rc2 behält jeder Take seine Latents; einer von davor rendert seinen Klang neu).
- **Regler**: Former für Genre und Stimme, angewandt, während die Musik geschrieben wird; 0 ist aus, 1 ist voll.
- **LoRAs**: Adapter für die Musikhälfte, die Klanghälfte oder beide, jeder mit seiner eigenen Stärke.

**Die Kurve eines Reglers.** Ein Regler drückt mit seiner Stärke von der ersten bis zur letzten Sekunde: flach. Das kleine Bild neben seiner Stärke öffnet seine Kurve: **Bogen** lässt ihn in der Mitte des Songs zur vollen Stärke steigen und an beiden Enden nachlassen; **Zeichnen** formt sie von Hand: einen Punkt nach oben ziehen für ein Aufflammen, nach unten für ein Ausblenden, entlang des Songs, um ihn zu verschieben; Doppelklick fügt einen Punkt hinzu, Doppelklick auf einen Punkt nimmt ihn heraus. Die eingestellte Stärke ist der Gipfel der Kurve. Die Kurve läuft über die Musik, während sie geschrieben wird, vom ersten Frame bis zum Ende der Songlänge, und geht in die Anfrage des Takes, sodass ein neu gemachter Take dieselbe Kurve fährt.

![LoRAs: jede Stärke auf einer Straße von Grün bis Rot, und die Musikhälfte zusammen](guide/loras.png)

Jede Stärke liegt auf einer **Straße**: Grün ist sicher, Gelb ist ihre Grenze, Rot liegt darüber. Die Grenzen sind gemessen:

- ein Partitur-Adapter (einer, der ABC plant) bis 1.0 grün; jede andere Musikhälfte bis 0.5 grün, höchstens 0.75; in diesem Studio trainierte Adapter sind auf der Musikhälfte strenger (0.5 grün, 0.6 Grenze);
- die Klanghälfte bis 1.0 grün, 1.5 Grenze;
- **Musik, zusammen**: gestapelte Adapter addieren sich. Jeder kann in seinem eigenen Grün liegen und die Summe die Partitur trotzdem zerbrechen. Gemessen an echten Takes: heil bis **2.25** zusammen, kaputt ab **2.5**. Der Balken unter den Adaptern zeigt die Summe auf derselben Straße.

**Doppelklick** auf eine Zahl, um eine Stärke genau einzutippen. Die Hinweise unter dem Block sagen, was zählt: ein im Stil fehlendes Triggerwort, ein in einem anderen Planungsmodus trainierter Adapter, eine Stärke über ihrer Grenze. Solange der Zeiger auf einem Regler liegt oder ihn zieht, steht die genaue Stärke über dem Zeiger in der Farbe ihrer Straße. Der Instrumental-Adapter endet bei 1.0, wo er beginnt: darüber gehen seine Partituren in die Irre.

> **Ein instrumentaler Partitur-Adapter mit Wörtern zum Singen.** So ein Adapter plant Partituren *ohne Gesangslinie*. Bei 1.00 gab er einen Take mit einer einzigen Note in 127 Gesangstakten: der Sänger sprach über zwei loopende Takte. Mit Text halte ihn niedrig, 0.3 bis 0.5. Das ⚠ neben dem Namen der LoRAs sagt es, wenn es passiert.

### Profile und Planungsmodi <!-- #profiles-and-planning-modes -->

- **Profil** setzt Modus, Länge, Sampling, Führung, Schritte, VAE, Regler, LoRAs und Ausgabe auf einmal; die Texte und Seeds bleiben. *Profil speichern…* behält die aktuellen Regler unter einem Namen.
- **Planungsmodus**:
  - **Voller Plan**, die Voreinstellung: Melodie und Akkorde zuerst geschrieben (eine bearbeitbare Partitur), dann der Song. Am besten für neue Songs.
  - **Nur Melodie**: ein Melodieplan, freie Begleitung. Empfohlen für Cover.
  - **Direkt**: direkt aus Text und Stil, ohne Partitur. Ohne Partitur trainierte Adapter gehören hierher.
  - **Instrumental**: ohne Gesang, das offizielle YuE2-Rezept. Es steht rechts im Kopf des Planungsmodus.
- **Voll oder Direkt.** Viktors Wort nach einer Woche Songs: Direkt ist SUNOs Glücksspiel (etwa zwei gute Takes von hundert, nach seiner Zählung); Voll ist der Weg für alle, auch ohne eine Note ABC zu lesen: die Tags werden gehalten, der Klang setzt sich, die Aussprache hält und das Tempo lässt sich vorhersehen. Gemessen an seinem Rap, vierzehn Takes von jedem, Whisper hörte zu: der beste Take von allen war ein Voller mit seinem konservativen Rezept (84 % der Wörter gehört, 76 % im letzten Viertel). Wo Voll scheitert, scheitert es am Ende: ein Take ist so lang wie seine Partitur, und der Plan kann weniger Abschnitte enthalten als der Text (dann fallen die letzten Strophen weg, oder eine frühere wird noch einmal gesungen); nach den letzten Wörtern spielen die übrigen Takte der Partitur weiter, und das sind die 10–15 s nach dem eigentlichen Ausklang eines Songs, nicht die Führung. Hör dir das Ende eines Vollen Takes an: *Enden bei…* schneidet einen Schwanz ab, *Neu erzeugen ab…* schreibt ein verlorenes Ende neu.

### Cover, Remixe und deine eigene Partitur <!-- #covers-remixes-and-your-own-score -->

- **Cover oder Remix**: nimm die Melodie einer Aufnahme (*Transkribieren*: nur ihre Melodie, nicht die Wörter oder den Sänger), oder die Melodie eines deiner Takes, und gib ihr einen neuen Stil.
- **Eigene Partitur liefern**: eine ABC-Partitur, befolgt im Vollen Plan und in Nur Melodie. Transponiere sie (zur nächsten, nach oben oder unten), verschiebe eine Stimme in Tonleiterstufen, importiere eine MIDI-Datei (eine Melodielinie pro Stimme), exportiere MIDI oder Marker für eine DAW, lade ein Beispiel, mach sie instrumental. **Erzeugen** mit einer Partitur hier fragt vorher: auf dieser Partitur, oder einer neuen (das Feld geleert, das Song-Modell schreibt eine). Die Partitur merkt sich die Adapter und Musikstärken, mit denen sie geschrieben wurde (ein Plan, die eigene Partitur eines Takes); weichen die jetzt aktiven ab, sagt es eine Zeile darunter, und die Frage auch: bei anderen Stärken kann sich die Musik von der Partitur lösen, Industrial Rock und Instrumentals am meisten. Im Vollen Plan bleibt die Partitur offen, solange sie eine enthält.
- **Den Text auf einer Partitur rezitieren** (*Den Text auf diese Partitur legen…*, unter der Partitur, sobald sie sich liest): der Erzähler aus dem Promo des Studios, für deine Wörter. Jede Zeile geht auf die Takte der Partitur, eine Silbe je Achtel (je Sechzehntel, wie Rap gesprochen wird, wo Achtel Zeilen auslassen würden) auf einem Ton des Akkords ihres Takts, ein Atem nach Komma und Punkt, die letzte Silbe der Zeile eine Viertel tiefer; jeder Abschnitt beginnt mit einer zweitaktigen Phrase nach einem Takt Pause, oder nach einer Vokalise, wenn du sie anhakst. Instrumente, Akkorde, Tonart und Tempo bleiben; die Abschnitte der Partitur folgen deinen Tags, mit einem Intro und einem Outro drumherum. Für gesprochenes Wort, Lesungen und Rap über einem Bett: mach das Bett, *Aus dem Klang schreiben*, dann das hier; es fragt vorher, und Strg+Z in jedem Feld holt den alten Text zurück.

### Sampling und Entrauschen <!-- #sampling-and-denoising -->

![Sampling: der Partitur-Planer und die Musik-Tokens, die Token-Grenzen gesperrt](guide/sampling.png)

Die Voreinstellungen sind abgestimmt. Die drei **Form**-Zeilen (Komposition, Darbietung, Stil) bewegen die Regler gemeinsam in fünf Stufen; die Regler selbst stehen darunter.

- **Partitur-Planer** und **Musik-Tokens**: Temperatur, Top-p, Top-k, Wiederholungsstrafe, Strafenfenster.
- **Min. Tokens** und **Max. Tokens** sind gegen eine versehentliche Änderung **gesperrt**: klick auf das 🔒 neben dem Namen, um sie zu ändern, und noch einmal, um sie zu sperren. Die Untergrenzen sind Sicherungen: eine Partitur darf nicht vor 200 Tokens enden, die Musik nicht vor 750 (30 Sekunden; eine kürzere gewünschte Länge senkt sie auf diese Länge). Das Maximum der Musik erscheint als **Max. Länge**, in Zeit (25 Tokens pro Sekunde), ohne Sperre: es ist höchstens die Länge des Songs, nur hier eingestellt (Klang und Ausgabe hat kein Längenfeld).
- Jeder Regler wird in vernünftigen Grenzen gehalten; ein Wert darüber wird zurückgeholt, und die Seite sagt es.
- **Führung (CFG)**: die Führung der Musik, der Zug des Stils in der Musikstufe; 1.6 als Voreinstellung in jedem Modus.
- **Führung des Texts**: die eigene des Texts, getrennt vom Stil: ein dritter Zweig, der Prompt ohne Text, neben den zweien, die die Führung immer hatte; 2.2 als Voreinstellung. Viktors Ohr an einem Volkslied: Führung 4.0 mit dem Text bei 2.2 am hellsten, 3.0 mit 2.2 ebenso, 3.0 mit 1.6 mit eigener Tiefe, der Text bei 2.6 holt den Shaker nach vorn; bei 1.6 lösen sich die Worte samtig auf. Gleich, gleitet die Hälfte des Texts in Halluzination, das С (s) geht verloren und die Betonung der Vokale verrutscht: halte die beiden 0.4 bis 1.0 auseinander. Ein Licht neben jedem Feld sagt es: grün in seinem Bereich (die Musik 1.0–4.0, der Text 1.0–2.6, um 0.4 oder mehr auseinander), gelb etwas darüber, rot weit darüber; nichts wird begrenzt. Leer, folgt der Text der Führung, wie bisher.
- **Klang und Ausgabe**, der untere Teil des Blocks: **Entrauschungsschritte** und **Löser** für die Klanghälfte, **Format** (WAV 24 Bit, 16 Bit, 32 Bit Float oder MP3 mit seiner Bitrate) und **Spitzenbegrenzung**; *Ausgabe zurücksetzen* stellt sie zurück.

**Ein konservatives Rezept für Russisch** (Viktors, nach Gehör): Komposition *niedrig*, Darbietung *niedrig*, Stileinfluss *hoch*: der Partitur-Planer bei Temperatur 0.85, Top-p 0.92, Top-k 40, die Musik-Tokens bei 0.85, 0.93, 80, die Wiederholungsstrafen 1.005 und 1.3 über einem Fenster von 100, Führung 1.6 mit der eigenen des Texts 2.2; 32 Entrauschungsschritte mit Midpoint. Keine Beschleunigung, Rap in mäßigem Tempo. Es ist das eingebaute Profil *Musical Heresy of Creator's Ear*, das Viktor einstellt: Speichern darüber in den Profilen hält seine Werte auf Forge, Löschen bringt diese zurück.

### ABC-Partitur erstellen, und Erzeugen <!-- #create-abc-score-and-generate -->

- **ABC-Partitur erstellen** schreibt die Partitur und hält an: lies sie, bearbeite sie, dann rendert *Erzeugen* genau diese Partitur. Eine schon im Feld stehende Partitur wird nach einer Frage überschrieben.
- **Proben** und **Variationen**, neben Erzeugen: Proben ist, wie viele Proben, die Musik in jeder neu geschrieben, je ein Musik-Seed (Seed, Seed + 1…); die Engine schreibt so viele auf einmal, wie ihr Batch erlaubt, den Rest in weiteren Durchgängen. Variationen ist, wie oft der Klang jeder Probe aus ihrer einen Musik gerendert wird, je ein Klang-Seed, derselbe für jede Probe: jede kostet etwa die Zeit eines Klangs, kaum Speicher. Proben × Variationen Takes kommen heraus: 2 × 4 = 8.
- **Song erzeugen** startet alles. Der Lauf zeigt seine Stufen, wie sie kommen.

### Babel in der Partitur <!-- #babel-in-the-score -->

![Die Engine stoppte einen Lauf, dessen Partitur keine Partitur war](guide/babel.png)

Wenn die Musikhälfte Unsinn als Partitur schreibt (über ihre Grenzen gedrückte Adapter tun das: keine Tonart, kein Takt, Doppelpunkte in Serie), **stoppt die Engine den Lauf, bevor darauf Musik entsteht**, in Sekunden statt Minuten. Das Fenster sagt warum, welche Adapter auf der Musikhälfte lasteten und wie weit über ihren Grenzen, zeigt, was geschrieben wurde, und kann die Musikstärken mit einem Klick ins Grüne bringen.

### Der Take <!-- #the-take -->

![Ein Take: herunterladen, neu machen, Nachbearbeitung, Dateien](guide/take-head.png)

- **Der Kopf**: ▶ und die Knöpfe des Takes in seiner ersten Zeile (👍 👎 ☆, der Bibliothekar, umbenennen, löschen), und an ihrem Ende ⇆ und ⤡, die einen Rahmen über den Raum heben; der Titel darunter in einer Zeile; wie er gemacht wurde darunter.
- **Herunterladen**: WAV, FLAC (dieselben Samples, etwa drei Viertel der Größe), MP3 mit der Bitrate deiner Wahl.
- **Neu machen**: *Neuer Take* (ein neuer Take aus derselben Anfrage), *Als Grundlage nehmen* (die Anfrage zurück ins Formular), *Klang neu rendern* (dieselbe Musik, neuer Klang), *Neu erzeugen ab…* (den Anfang behalten, den Rest neu schreiben), *Diesen Take transkribieren*, *Auf den Text kürzen* (einen Schwanz nach der letzten gesungenen Zeile abschneiden), *Enden bei…* (der Take endet am Moment deiner Wahl, seine letzten 2 s ausgeblendet; aus seinen behaltenen Latents, in Sekunden), *Einblenden…* (seine ersten Sekunden steigen aus der Stille, 2 s, wenn du nichts anderes sagst; auf dieselbe Weise).
- **Veredler**: *Spektrum*, *Liedtext-Prüfung*. **Dateien**: die Anfrage und die Partitur. *Loop…*: 1, 2, 4 oder 8 Takte auf den Taktstrichen der Partitur ab dem Takt, wo der Player steht, nahtlos (sein Ende läuft in seinen Anfang), als WAV mit Tempo und Tonart im Namen gespeichert.
- **Notiz**: was funktioniert, was zu beheben ist, wohin er geht.
- Die Karte darunter sagt, wie er gemacht wurde: Modus, Format, VAE, Modell, Schritte, die Form, die Regler, die LoRAs mit ihren Stärken, beide Seeds (kopier sie, um ihn zu wiederholen).
- **Über dem Raum** (⤡) steht der Take in zwei Spalten: was man damit tun kann, sein Stil und sein Text links; wie er gemacht wurde, sein VAE und seine Partitur rechts. Ein neuer Take öffnet sich mit eingeklapptem Stil und Liedtext; die Werkzeuge stehen in umrahmten Gruppen.

![Wie ein Take gemacht wurde](guide/take-info.png)

### Die Partitur <!-- #the-score -->

Der Plan des Takes als Notensystem oder als ABC: als PDF drucken (US Letter, hoch oder quer), MIDI oder Marker exportieren, *Bearbeiten und neu rendern*, oder im Vollbild öffnen.

## Schreiber <!-- #writer -->

### Songs als Dokumente <!-- #songs-as-documents -->

![Der Schreiber](guide/studio-writer.png)

Jeder Song kann im Schreiber als Dokument leben: sein **Stil**, sein **Liedtext**, seine **Notizen** (Markdown, mit Vorschau) und seine **Parameter** (jeder Regler des Formulars im Schöpfer). *Neu*, *Aus dem Schöpfer* (das Formular, wie es ist), *In den Schöpfer laden*.

- **Versionen**: *Diese Version behalten* zu jeder Zeit; *Diese Version wiederherstellen* oder sie *Als neues Dokument* nehmen.
- **Die Breite der Liste**: zieh die Kante zwischen Liste und Dokument (← → über die Tastatur, ein Doppelklick für ihre eigene Breite).
- **Daraus gemachte Takes**: jeder Take, dessen Anfrage aus diesem Dokument kam.
- **Der Song jetzt**: Titel, Stil, Tonart, Takt und Tempo der Partitur (der Stil muss zu ihnen passen), der Liedtext; *Im Schöpfer bearbeiten*.
- **Alles exportieren** (die Platte) und **Importieren** (der Ordner): das ganze Notizbuch in einer Datei als Backup, jedes Dokument mit seinen Versionen, den daraus gemachten Takes und dem Papierkorb; ein Import bringt, was fehlt, lässt Gleiches in Ruhe und legt ein abweichendes Dokument als Kopie neben seinen Namensvetter: nichts wird überschrieben.

### Textprofile <!-- #text-profiles -->

Wie ein eingefügter Text lesefertig wird: Ersetzungsregeln der Reihe nach (wörtlich oder reguläre Ausdrücke), dann die Form (`[Intro]`, `[Verse]` an Leerzeilen, `[Interlude]` nach langen Absätzen). *+ Regel*, dann zeigt **Versuch es aus dem Liedtext**, was herauskommt, bevor du speicherst.

### Der Schreibraum <!-- #the-writing-room -->

![Der Schreibraum: ein Chat-Modell entwirft, du entscheidest](guide/writer-room.png)

Ein Chat-Modell liest deinen Stil, deinen Text und deine Partitur und entwirft oder überarbeitet sie. **Nichts ändert sich, bevor du es übernimmst.**

- **Worum geht es in dem Song?** oder was geändert werden soll; **Hilf mir bei** dem Stil, dem Text oder beidem; **Struktur**: die Reihenfolge der Abschnitte für einen neuen Text.
- Das Modell: ein lokaler Chat-Server (vLLM, LM Studio, Ollama: alles mit einem Chat-Endpunkt `/v1`, eingestellt in der Engine) oder jedes OpenRouter-Modell mit seinem API-Schlüssel. Sein Feld bietet beim Tippen die ganze Liste von OpenRouter an, jedes Modell mit seinem Preis pro Million Tokens rein und raus und seinem Kontext; der Preis des gewählten steht unter dem Feld, und ein Name, den die Liste nicht kennt, wird gemeldet.
- *Einen Entwurf erstellen*, dann **Entwurf übernehmen**, **Liedtext verwenden** oder **Stil verwenden**; *Rückgängig* nimmt es zurück.

## Veredler <!-- #refiner -->

### Nach dem Rendern <!-- #after-the-render -->

![Der Veredler: der Take rechts, die Schritte in einer Reihe](guide/studio-post.png)

Wähle rechts einen Take; die Werkzeuge arbeiten an ihm oder an einem seiner Stems. Die rechte Spalte hält **die hier veredelten Takes**, der zuletzt veredelte zuerst (*Veredelt* neben *Favoriten* schaltet auf alle Takes, um einen neuen zu beginnen), und nach einem Neuladen kehrt der Raum zum Take zurück, den er veredelte.

Alles, was aus einem Take gemacht wird, hängt an seinem **Baum** (*Aus diesem Take gemacht*), das Neueste oben: **das Original** zuerst, mit seinem Player und seinem FLAC, dann jeder Zweig, abspielbar und als Quelle für den nächsten Schritt nutzbar. Was läuft, zeigt sich dort, wo du hinsiehst: im Kopf des Raums, oben im eigenen Block des Schritts und als pochender Punkt auf seinem Reiter. Der Block jedes Schritts listet, was er für den Take gemacht hat (*Hier gemacht*: ein Klick findet es im Baum), und der offene Schritt hebt seine eigenen Zweige hervor.

**Alle vergleichen** (in der Zeile des Originals, oder *Vergleichen* an jedem Zweig) öffnet jede Version in einem Player, wie SUNO Versionen umschaltet: das Original, das entbrummte, die Remaster, die Upscales, die Stems. Ein Klick auf eine andere Version, oder ihre Nummer (1–9), spielt sie **ab derselben Sekunde**; Leertaste spielt und pausiert, ← → springen fünf Sekunden, Esc schließt. Dieselbe Musik in anderen Takes steht auch darin, nach dem Original: ihre Neu-Renderings mit einem anderen VAE oder Klang-Seed, jedes nach seinem VAE, seinem Seed und seiner Entstehungszeit benannt; ein Take, den du nicht mochtest, bleibt draußen.

### Einen Track importieren <!-- #import-a-track -->

WAV, FLAC, MP3… von überallher: er wird ein Take in der Bibliothek (48 kHz, 24 Bit), als *importiert* markiert, bereit für Stems, Remaster und den Rest. Ein Liedtext ist optional; die Liedtext-Prüfung vergleicht mit ihm.

### Die Schritte und die Kette <!-- #the-steps-and-the-chain -->

![Die Kette und die Schritte](guide/post-steps.png)

Die **Kette** führt mehrere Schritte in einem Zug aus: *Entbrummer → Upscale → Stems → Remaster → Upscale*, dann beliebige von *Artefakte*, *Spektrum*, *Liedtext*. Die Stems werden aus dem entbrummten (und hochskalierten) Take getrennt, und das Remaster mischt sie, sodass sein Preset und sein De-Esser auch in der Kette arbeiten; der erste Upscale lässt die Trenner den ganzen Song hören, der letzte zeichnet die Höhen neu, die Stems und Remaster hinterlassen (ein Rauschen über 20 kHz, fast nichts über 22). Es sind vier Stems, wenn du nichts anderes wählst. Einer nach dem anderen:

1. **Spektrum**: Spektrogramm, mittleres Spektrum, Bandenergie; leg einen anderen Take darüber, um zu vergleichen.
2. **Artefakte**: ein Ton, der nicht weggeht, das 25-Frame-Brummen des VAE in den Höhen, Klicks, Clipping, Aussetzer, ein Stereo, das gegen sich selbst kämpft. Eine Zeit spielt von dort.
3. **Entbrummer**: der Decoder von YuE2 schreibt Klang in Frames von 1920 Samples, 25 pro Sekunde, und seine Höhen zittern mit ihnen. Das hier nimmt den Anteil über 2 kHz heraus, der an diesen Frame-Takt gebunden ist. 80 % ist die Wahl des Ohrs; 100 % macht den Einsatz dünn.
4. **Liedtext**: Whisper hört zu und vergleicht, was es hört, mit deinem Text, Minute für Minute; *Die Zeilen timen* für das Karaoke-Timing. Auf dem Gesangs-Stem hört es die Wörter ohne die Musik.
5. **Stems**: vier Stems (BS-Roformer für die Stimme, dann htdemucs_ft für Drums, Bass und den Rest; das Instrumental auch), oder Gesang + Instrumental. *Quelle* ist der Take oder eine entbrummte oder hochskalierte Datei davon, jede Quelle mit einem eigenen Satz; deine DAW bekommt den neuesten Satz jeder Art.
6. **Remaster**: die Stems mischen oder den Take nehmen; säubern, de-essen, wahlweise von 440 auf 432 Hz umstimmen, Lautheit (LUFS) und True Peak. Jeder Lauf ist ein neuer Zweig. Preset und De-Esser arbeiten an Stems, bevor sie gemischt werden: mit dem Take oder einer einzelnen Datei als Quelle sind sie aus, und in der Kette arbeiten sie, wenn sie Stems trennt.
7. **Upscale**: UniverSR zeichnet die Höhen des Spektrums neu; das Original bleibt unter der Grenzfrequenz Sample für Sample. Auf einem Remaster (dem letzten Schritt der Kette) wird die ganze Datei abgesenkt, wenn die neuen Höhen die True-Peak-Grenze des Remasters überschreiten.

## Maler <!-- #artist -->

Der Raum, der malt: ein Cover für jeden Take, ein 16:9 für sein Video, ein 9:16 für einen Short, aus deinen Worten, aus einem Bild von dir, oder aus beidem. Links das Formular, in der Mitte die Bühne, rechts die Bibliothek.

### Bilder für deine Songs <!-- #pictures-for-your-songs -->

Schreib, was du für den Song siehst, in Sätzen: Qwen-Image liest einen Prompt als Beschreibung, nicht als Liste von Tags. Setz zuerst, was im Bild ist, dann das Licht, die Farben und die Technik (Öl, Tusche, ein Foto), und ende mit *no text*, wenn du keine Buchstaben darin willst. **Aus dem Take** setzt den Prompt in das Feld, aus dem der Take in der Hand sein Artwork bekam, oder einen aus seinem Titel und Stil gemachten, um davon auszugehen.

**Formate**: **1:1** (1280 × 1280) für das Cover, **16:9** (1920 × 1080) für ein Video, **9:16** (1080 × 1920) für einen Short. Die Formate eines Drucks teilen ihren Seed, also kommen sie als eine Serie heraus: dieselbe Szene in denselben Farben, jede für ihren eigenen Rahmen komponiert statt eines Bildes, das dreifach zugeschnitten wird. **Variationen** zeichnet auch die nächsten Seeds (der Seed, der Seed + 1, …), jeden in jedem Format.

**Seed**, mit seinem Modus daneben: **Zufällig** (−1: bei jedem Druck ein neuer Seed, das Feld leer), **Zufällig, fest** (ein zufälliger Seed, sofort eingetragen und behalten), **Fest** (der geschriebene), **Weiter** und **Zurück** (nach einem Druck geht das Feld über die Seeds hinaus, die seine Variationen benutzt haben). Eine ins Feld getippte Zahl ist dieser Seed (Zufällig wird Fest); ein geleertes Feld ist bei jedem Druck ein neuer Seed (Fest wird Zufällig); ⟲ ist wieder Zufällig. Der Seed eines Bildes, das dir gefiel, zeichnet es noch einmal: jeder Lauf zeigt seinen Seed, und **Ins Formular** bringt ihn mit dem Prompt zurück.

**Drei Spalten**: links der Prompt und seine Regler, in der Mitte die Bühne (der Lauf, der gemalt wird, entwickelt sich dort, sein Fortschritt quer über ihren oberen Rand; sonst das Bild, das du gewählt hast, seine Knöpfe darunter, die Daten und der Prompt seines Laufs in einem Tipp daneben, über der Bibliothek, solange der Zeiger auf dem Bild ist), rechts die Bibliothek; zieh die Kanten zwischen ihnen, um eine Spalte zu verbreitern (← → über die Tastatur, ein Doppelklick für ihre eigene Breite). Die Auswahlen der Spalte dehnen sich mit ihr, nie schmaler als die Namen der Maler. Ab einem 920 px hohen Fenster steht der Raum ganz darin: die Seite steht still, Formular und Bibliothek scrollen jeweils für sich, und die Zeile mit Zeichnen bleibt am Fuß des Formulars.

**Live-Vorschau** (standardmäßig an): der Platz des Bildes, das gemalt wird, zeigt jeden seiner Schritte, vom Rauschen bis zum Bild, in einem Achtel seiner Größe und ohne den Decoder gesehen, kostet also nichts; aus, wartet der Platz auf das fertige Bild. Ein Balken quer über den oberen Rand der Bühne folgt dem Lauf, Bild für Bild und Schritt für Schritt.

**Zwei Läufe auf einmal**: während einer läuft, fordert **Zeichnen** den nächsten an, der hinter ihm wartet (auch Strg+Enter); **Stopp**, neben Zeichnen, solange ein Lauf läuft, beendet den zeichnenden (sonst verlässt der wartende die Warteschlange); die Bilder, die er fertig hat, bleiben.

### Die Maler <!-- #the-painters -->

**Die Pinsel des Malers** sind eine Liste jedes Modells und jeder Datei hier, nach Gruppen: Qwen-Image 2512 aus einem GGUF (Q4, Q6), jede fp8-Datei in `artwork/Qwen-Image-2512/checkpoints/` (das eigene BASE von 2512 und die Fine-Tunes) und Qwen-Image 2.1. **⚡ Lightning** markiert einen Pinsel, der standardmäßig damit malt; ein Fine-Tune ist als solches markiert. Eine in `checkpoints/` gelegte Datei wird ein eigener Pinsel, wenn der Raum die Liste neu liest (nach einem Download oder beim Neuladen der Seite). Krea 2 Muse hat das Studio im Oktober 2026 verlassen: Qwen-Image 2512 folgt den Worten treuer und beschriftet einen Titel richtig.

**Qwen-Image 2512** (Apache-2.0) aus einem GGUF in **Q4** (eine Karte mit 15,5 GB) oder **Q6** (20 GB), oder ein **fp8-Fine-Tune** davon (22,5 GB: die Einzeldateien von ComfyUI, abgelegt in `artwork/Qwen-Image-2512/checkpoints/`, jede ein eigener Pinsel); etwa eine halbe Minute pro Bild mit Lightning, nach ein oder zwei Minuten Laden. **Qwen-Image 2.1**, unter Qwens Forschungslizenz (nur Forschung und Bewertung: nicht für ein Cover, das du verkaufst), malt aus Wörtern und bearbeitet ein Referenzbild nach den Wörtern des Prompts; eine Maske und *Drumherum malen* wollen Qwen-Image 2512. Auf einer Karte, die weder ihren Textencoder noch ihren Maler ganz fasst (eine 16-GB-Karte oder eine Karte unter einem niedrigeren VRAM-Limit), strömen beide aus dem RAM: unter einem Limit von 15.5 GB auf einer 3090 135 s aus Worten bei 4.1 GB in der Spitze, 129 s beim Bearbeiten bei 7.9 GB.

Jeder Maler erscheint nur, wenn seine Dateien hier sind; die anderen werden unter dem Maler genannt. **Engine → Modelle und LoRAs → Qwen-Maler** holt Qwen-Image 2512 in Q4 (31 GB) oder Q6 (34,5 GB) mit Lightning, und Qwen-Image 2.1 (33,1 GB), jedes vorher mit seiner Größe gefragt (2.1 auch mit seiner Lizenz). Aus einem Terminal: `heresy/fetch-heresy.sh --qwen 2512-q4`. **Maler und Adapter holen…** unter dem Maler listet im Raum selbst, was das Studio für den Maler holen kann: die Qwen-Maler, vier fp8-Fine-Tunes von Qwen-Image 2512 (Jib Mix Qwen, IntoRealism Qwen, Real-Qwen-Image und 2512 selbst, je 20,4 GB, mit Erlaubnis ihrer Urheber im Modell-Repository des Studios geteilt) und vier Adapter, jeweils mit Größe, hier oder **Holen**.

**Welche Karte malt**: ein Druck wartet in der Warteschlange des Labors auf eine Karte mit Platz, wie es das Artwork der Takes und die Stems tun; während er wartet, nimmt **Aus der Warteschlange** ihn zurück. Eine Karte, die nichts anderes nutzt, nimmt einen Lauf, dessen Bedarf in ihren Speicher minus 512 MiB passt (der eigene Anteil der CUDA-Runtime); eine belegte Karte nimmt ihn, wenn ihr freier Speicher den Bedarf fasst. Ein Qwen-Image-2512-Maler, den keine Karte hier ganz fassen kann, streamt seine Blöcke stattdessen aus dem RAM: die Blöcke, die passen, bleiben auf der Karte, der Rest kommt, wie er gebraucht wird, und das Bild ist dasselbe, langsamer um das, was der Bus nicht verbergen kann (mit vier Adaptern auf einer 24-GB-Karte etwa ein Sechstel; jeder Block gestreamt, belegt er 2,3 GB der Karte, also malt ihn eine 6-GB-Karte, bei etwa 30 GB RAM); ein anderer Maler, den keine Karte fassen kann, wird sofort abgelehnt, mit den Zahlen und dem Maler, der passen würde. Qwen-Image liest den Prompt mit seinem Text-Encoder (Qwen2.5-VL-7B, 15,5 GB) auf der Karte, wenn der freie Platz dort ihn fasst, sonst auf dem Prozessor, bevor der Maler kommt: das Bild ist so oder so dasselbe.

**Der Inhaltsfilter**: jedes Bild passiert einen Inhaltsfilter (nsfw_image_detection von Falconsai, Apache-2.0), egal welcher Maler es malte (die Regel des Studios für jeden Maler): eins, das er markiert, wird nicht behalten, und der Lauf sagt es.

### Lightning <!-- #lightning -->

**Was es ist**: Lightning (lightx2v, Apache-2.0) ist ein Adapter, der Qwen-Image 2512 beibringt, in wenigen Schritten ohne Führung zu malen: der eigene lange, geführte Weg des Modells, destilliert in 8 Schritte. Seine Datei liegt in `artwork/Qwen-Image-2512/lightning/` (`Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors`, 0,85 GB) und kommt mit dem Holen der Qwen-Maler.

**Wie das Studio es einsetzt**: mit eingeschaltetem Lightning lädt der Maler es als einen Adapter mehr unter deinen eigenen LoRAs, in seiner Stärke: **1.0** für die GGUF Q4 und Q6 und das eigene fp8 BASE von 2512 (die Basis, aus der es destilliert wurde, bei den 8 Schritten, die seine Macher angeben) und **0.55** für ein fp8-Fine-Tune, bei 12 Schritten (ein Fine-Tune hat sich von der Basis entfernt, und Lightning in voller Stärke würde es zurückziehen; Viktors eigene Einstellung in ComfyUI). Der Zeitplan wird Lightnings eigener: eine Verschiebung von log 3 bei jeder Größe, wie es trainiert wurde. Die Führung ist aus (true CFG 1): ein Durchgang des Modells pro Schritt.

**Ausgeschaltet** geht der Maler den eigenen Weg von 2512: 30 Schritte als Voreinstellung (10 bis 60) und **Führung** 4 (true CFG mit leerem Negativ: zwei Durchgänge pro Schritt). Sechzig Durchgänge gegen acht: das Malen selbst dauert etwa siebenmal so lange, das Laden gleich, und gibt das Detail und das Licht fertigen Realismus.

**Seine Voreinstellungen**: die GGUF Q4 und Q6 malen damit (Entwürfe, kleinere Karten); ein fp8-Fine-Tune malt ohne, außer du schaltest es ein (fertiger Realismus); das eigene Artwork eines Takes wird damit gemalt (*Engine → Artwork*). Die Regel dahinter: Lightning für Entwürfe und Cover, nicht für professionellen Realismus.

**Der Schalter**: im Sampling, mit seiner Stärke daneben; an, gehen die Schritte von 4 bis 16 und Führung verschwindet; aus, erscheint Führung. Ohne seine Datei gibt es keinen Schalter, und 2512 malt auf seine Weise. Die Stärke wird für jeden Maler behalten; die Summe deiner Adapter (*Zusammen*, unten) zählt Lightning nicht mit.

**Was es kostet**: auf einer RTX 3090 bei 1328 × 1328 malt Qwen-Image 2512 mit Lightning in etwa 30 s pro Bild in Q4 (14,3 GB in der Spitze) und 32 s in Q6 (17,6 GB); ein fp8-Fine-Tune bei 0.55 und 12 Schritten in 37 s (21,0 GB). Das Cover eines Takes mit Lightning brauchte mit Laden und Prompt etwa anderthalb Minuten.

### Sampler und Zeitpläne <!-- #samplers-and-schedules -->

**Sampling** unter dem Maler, eingeklappt, seine Werte in seiner Zusammenfassung: die Schritte, der Sampler und der Zeitplan, für jeden Maler behalten; **Zurücksetzen** gibt die des Malers zurück. Die Schritte: Qwen-Image 2512 mit Lightning, 4 bis 16; sonst 10 bis 60; eine Zahl außerhalb des Bereichs wird an seinem Rand gehalten. Die Zeitschätzung des Formulars zählt die Durchgänge des Samplers.

**Die Sampler**: bei jedem Schritt sagt das Modell, in welcher Richtung das Bild liegt; der Sampler entscheidet, wie er dorthin geht.

- **Euler**: ein Durchgang pro Schritt, der schlichte Schritt; die Referenz, und der, mit dem Lightning destilliert wurde.
- **Euler SDE**: Euler mit etwas frischem Rauschen bei jedem Schritt: mehr Korn, etwas weniger treu.
- **ER-SDE**: ein stochastischer Löser dritter Ordnung (ER-SDE-Solver-3), ein Durchgang pro Schritt, die zwei Schritte davor behalten: feiner als Euler in derselben Zeit.
- **RES 2s** und **RES 3s**: die Einschrittverfahren des verfeinerten Exponential-Lösers, zwei und drei Durchgänge pro Schritt, die Hälfte des Rauschens nach jedem zurückgegeben; ihre **ODE**-Zwillinge geben keines zurück, also malt ein Seed ein Bild, am nächsten am exakten Pfad.
- **Heun++** (heunpp2): drei Durchgänge pro Schritt, wo es kann, zwei, dann einer am Ende.
- **Exponentieller Heun** (exp_heun_2_x0, und sein SDE): ein exponentielles Verfahren zweiter Ordnung, zwei Durchgänge pro Schritt; das SDE gibt das Rauschen zurück.

Ein Sampler mit zwei oder drei Durchgängen pro Schritt kostet bei gleichen Schritten die zwei- oder dreifache Zeit von Euler; bei Lightnings 8 Schritten ändern die höheren Ordnungen das Detail, nicht die Komposition. Gegen den exakten Pfad eines Spielzeug-Flows bei 8 Schritten reihen sie sich, wie ihre Ordnungen sagen: Euler 0.138, Heun++ 0.111, exponentieller Heun 0.084, RES 2s 0.058, RES 3s 0.046 (der Fehler: niedriger ist näher).

**Die Zeitpläne** sagen, wo die Schritte verbraucht werden, von ganz Rauschen bis zu keinem:

- **Simple**: gleichmäßig in der eigenen Zeit des Malers, seine Verschiebung behalten.
- **Karras** und **Exponential**: mehr Schritte bei wenig Rauschen, für das Detail.
- **Beta** und **Beta 57**: dicht an beiden Enden, dünn in der Mitte (Beta 57 mit 0.5 und 0.7).
- **KL optimal**: der Abstand, den Align Your Steps optimal fand.
- **SGM uniform**: gleichmäßig in der Zeit, der letzte Schritt fallen gelassen.
- **Bong tangent**: zwei Arkustangens-Neigungen, von ganz Rauschen bis zur Hälfte und von der Hälfte bis zu keinem.

**Was zwei Matrizen zeigten** (54 Bilder durch ein Testlabor, ein Prompt, ein Seed): auf Qwen-Image 2512 **können mit Lightning Karras, Exponential und KL optimal das Motiv doppelt malen** (zwei Leuchttürme, wo einer gefragt war): mit Lightning bleib bei Simple, Beta, Beta 57, SGM uniform oder Bong tangent. **Ohne Lightning malt Euler SDE Qwen weich und dunstig**: Euler, ER-SDE oder RES behalten das Detail. Das Formular sagt beides, wenn es zutrifft.

**Woher sie kommen**: für das Studio aus den Papern der Verfahren und den Formeln von ComfyUI geschrieben (GPL-3.0, die die AGPL des Studios übernehmen darf); die von RES4LYF wurden nur ihrer Mathematik wegen gelesen, da seine Lizenz kommerzielle Dienste verbietet: keine Zeile seines Codes ist hier; Heun++ ist von Carzit (MIT).

### Regionen <!-- #regions -->

**Regionen** unter *Sampling*, eingeklappt: bis zu drei Teile des Bildes, jeder mit einem Platz (eine Hälfte, ein Drittel, ein Viertel oder die Mitte; eine kleine Karte daneben zeigt, wo) und eigenen Wörtern. Bei jedem Schritt wird der Maler für jede Region noch einmal gefragt, mit dem Prompt und den Wörtern der Region, und seine Antworten werden über Rahmen mit weichem Rand gemischt, wie Latent Couple es tut; der Rest des Bildes folgt allein dem Prompt. So sagt der Prompt die ganze Szene und eine Region, was dort steht: *zwei Tiere auf einer verschneiten Waldlichtung*, dann *ein roter Fuchs* in der linken Hälfte und *eine weiße Eule auf einem Baumstumpf* in der rechten. Jede Region kostet einen ganzen Durchgang mehr pro Schritt (auf einer 3090 bei 16:9, Qwen-Image 2512 fp8: 141 s ohne, 281 s mit zwei Regionen). In diesem Browser gehalten; eine Region ohne Wörter wird nicht gesendet; **Noch einmal** malt mit denen des eigenen Laufs. Für Qwen-Image 2512; Qwen-Image 2.1 bearbeitet mit Worten und malt ohne sie.

### Schriftzug <!-- #lettering -->

**Schriftzug** unter *Regionen*, eingeklappt: ein Titel und eine zweite Zeile darunter (der Künstler, das Album), als Teil des Gemäldes geschrieben statt darübergelegt. Seine Worte stehen in eigenen Feldern, nie im Prompt: **Titel**, **Zweite Zeile**, **Die Buchstaben** (wie sie aussehen, in Worten; leer: klassische Serifen-Versalien in warmem Gold), **Wo** (oben, in der Mitte, unten) und **Wie**: *mit dem Bild gemalt* (Qwen-Image 2512 oder 2.1 malt die Szene des Prompts mit den Buchstaben darin; das «No text» im Prompt eines Takes wird herausgenommen) oder *auf der Referenz* (Qwen-Image 2.1 beschriftet ein fertiges Bild nach Worten und behält den Rest; **Beschriften** an einem Bild macht es zur Referenz und öffnet den Block). Die Maler verschreiben Wörter, die sie selten gesehen haben («RUOCH STUDIO»), darum liest der Zuhörer (Qwen2.5-Omni, etwa 5 s pro Bild) jedes Bild zurück, und ein falsch geschriebenes wird mit einem anderen Seed neu gemalt, bis zu dreimal: das erste genau geschriebene bleibt, die anderen kommen in den Ordner misspelled/ des Laufs. Ein Zeichen neben jedem Bild sagt, wie es sich liest: ✓ wie verlangt geschrieben, ⚠ in jedem Versuch falsch (sein Tipp sagt, was zu lesen ist), ? nicht zurückgelesen (der Zuhörer ist nicht auf dem Rechner). Auf einer 3090 beschriftete Qwen-Image 2.1 ein Quadrat in 118 s; Qwen-Image 2512 fp8 (ohne Lightning) malte eines mit seinen Buchstaben in 230 s, das Laden mitgezählt. Kyrillisch auch, am sichersten in Versalien. Gespeichert in diesem Browser; **Noch einmal** beschriftet mit den Worten des eigenen Laufs.

### Adapter <!-- #adapters -->

**LoRA** unter dem Maler: die Adapter seiner Familie (Qwen-Image 2.1, Qwen-Image 2512), bis zu vier, jeder in seiner Stärke (0 bis 1.5); ein Klick auf eines seiner Triggerwörter setzt es in den Prompt. **Hinzufügen…** öffnet die Bibliothek: links die Ordner, die Karten mit ihren Bildern, eine Suche. Die Adapter liegen in `artwork/loras/<family>/` des Studios (`qwen-image-2.1`, `qwen-image-2512`): alle Ordner darin werden Gruppen, und ein Bild neben einer Datei mit ihrem Namen (`NAME.jpg`, `NAME.png`, `NAME.preview.png`) erscheint auf ihrer Karte. Hol sie von Civitai nach ihrem Basismodell (Qwen) und leg die `.safetensors` dorthin; **Auf Civitai nachschlagen** sendet den SHA-256 jeder Datei und sonst nichts, und behält die Antwort daneben (`NAME.civitai.info`: Name, Basismodell und Triggerwörter, und sein erstes als sicher eingestuftes Bild, wenn es keins hat). Was der LoRA Manager von ComfyUI oder Stability Matrix neben eine Datei geschrieben hat, wird ebenfalls gelesen. Ein Adapter, der für ein anderes Modell gemacht ist und keine Schicht des Malers erreichen würde, stoppt den Lauf und sagt es. Ein Rechtsklick auf die Zeile eines Adapters **schaltet ihn stumm**: er bleibt mit seiner Stärke in der Liste und verlässt den Lauf (**Stumm aufheben** holt ihn zurück); ein Adapter bei null wird ebenfalls nicht geladen. Die vier Adapter, die ihre Urheber teilen lassen, kommen über **Maler und Adapter holen…**.

**Zusammen**: ab zwei Adaptern gibt ein Balken darunter die Summe ihrer Stärken auf der Straße des Schöpfers an: grün bis 1.2, bernstein bis 1.8, rot darüber. Gestapelte Adapter addieren sich, und über etwa 1.8 brennt ein Bild (seine Farben und Kanten übertrieben), wie bescheiden jeder einzelne auch ist; die Zonen sind ein erstes Maß für Bilder, nach Augenmaß einzustellen. Zieh den Balken, um alle auf einmal zu bewegen, jeden im Verhältnis zu seiner Stellung.

### Ein Bild, aus dem gemalt wird <!-- #a-picture-to-paint-from -->

**Referenzbild**: ein Bild, aus dem gemalt wird, als Bild zu Bild: zieh eins auf seinen Platz unter dem Prompt, füge eins ein (Strg+V), wähle eine Datei, oder nimm das Bild der Bühne mit **Als Referenz**. **Wie stark es sich ändern darf** sagt, wie weit davon entfernt das Malen beginnt: 0.3 lässt es fast, wie es ist, 0.6 behält seine Komposition und ändert seinen Stoff, 0.9 malt die Szene des Prompts in seinem Licht und seinen Farben, 1.0 malt neu. Jedes Format wird vom Bild bedeckt und aus seiner Mitte geschnitten; **Noch einmal** malt aus dem des Laufs; ✕ malt wieder aus dem Rauschen.

**Verwenden** unter dem Bild sagt, wie: *um von ihm aus zu malen* (wie oben, mit dem Maler des Formulars, so weit *Wie stark es sich ändern darf* es sagt), *um es mit Worten zu bearbeiten* oder *nur für seinen Stil*, beides durch Qwen-Image 2.1, wenn es hier ist (sonst aus). Mit Worten bearbeitet, bleibt die Szene und der Prompt sagt, was sich ändert (*derselbe Leuchtturm in einer verschneiten Winternacht*: der Schnee kam, wohin er gehört, Turm und Felsen blieben). Für seinen Stil wird die eigene Szene des Prompts in Technik, Pinselstrich, Palette und Licht des Bildes gemalt, nichts von seinem Motiv bleibt (der Leuchtturm in Öl gab *einen roten Fuchs in einem verschneiten Wald unter dem Mond* in seinem Pinselstrich). So oder so ist der Lauf einer von Qwen-Image 2.1, welcher Maler auch im Formular steht: Modell, Sampling, Adapter, Maske und Leinwand des Formulars werden nicht gesendet, und seine Lizenz (nur Forschung und Bewertung) gilt. Etwa zwei Minuten pro Bild auf einer 3090.

**Maske…** daneben malt über das Bild, was neu gemalt werden soll (Malen, Radieren, der Pinsel, Umkehren, Leeren): der Rest bleibt genau, wie er war, wie beim Inpainting. **Drumherum malen** hält das ganze Bild in der Mitte jedes Formats und malt die Ränder neu (ein quadratisches Cover zu einem 16:9 oder 9:16), wie beim Outpainting. **Das Cover des Takes** nimmt das Cover des rechts gewählten Takes. Mit einer Maske oder **Drumherum malen** gibt es vier Optionen unter dem Bild: **Erweitern** (die Maske um so viele Pixel vergrößert, oder verkleinert), **Rand** (wie weich ihr Rand ist), **Sanft** (sanftes Neumalen, wie Differential Diffusion: wo der Rand grau ist, ändert sich das Bild nur in den letzten Schritten, also keine Naht) und **Korn** (wie viel von der neuen Farbe der behaltene Teil annimmt, sein Korn und Licht an das Neue genäht; 0 behält ihn genau).

**Leinwand…** neben **Maske…** öffnet die Leinwand, wie die von InvokeAI: der Rahmen jedes Formats ein Reiter oben, der sagt, wie er gemalt wird (**daraus**: das Bild bedeckt den Rahmen und der Lauf malt daraus, als Bild zu Bild in der gewünschten Stärke; **drumherum**: der Teil des Rahmens, den es frei lässt, wird drumherum gemalt). Auf der Arbeitsfläche zieht **Verschieben** (V) das Bild, oder eine Ecke, um es mit fester Gegenecke zu skalieren; **Pinsel** (B) und **Radierer** (E) malen die Inpaint-Maske darüber; **Hand** (H, oder gehaltene Leertaste) verschiebt die Fläche; das Rad zoomt, Alt+Rad skaliert das Bild um den Zeiger, die Pfeile schieben es. Rechts die Ebenen (die Maske mit **Umkehren** und **Leeren**, die Referenz mit ihrer Deckkraft nur auf der Fläche) und seine Stelle in Zahlen (Breite, X, Y als Anteil des Rahmens); oben **Einpassen**, **Füllen**, **Zentrieren** und **Überall gleich** (das Bild gleich groß in Pixeln in den anderen Rahmen), Rückgängig und Wiederholen (Strg+Z). **Fertig** behält die Stellen mit der Referenz und der Maske im Formular; unter der Stärke sagt das Formular, wie jedes Format liegt, und ✕ nimmt es von der Leinwand.

### Die Bühne und die Bibliothek <!-- #the-stage-and-the-library -->

Ein Klick auf ein Bild legt es mit seinem Lauf darunter auf die Bühne; ein Klick auf das Bild der Bühne (oder ein Doppelklick auf ein Bild) öffnet es über der Seite in seinem eigenen Format (← → gehen durch den Lauf, oder durch die Galerie, wenn es dort geöffnet wurde; Esc schließt), mit ★, **Ins Formular**, **Als Cover setzen** und **Herunterladen** (PNG, volle Größe). Auf der Bühne behält **Notiz…** eine eigene Notiz beim Bild in seinem Lauf (wofür es gemacht wurde, die Worte seiner Beschriftung, was als Nächstes zu versuchen ist); der Tooltip des Bildes zeigt sie.

**Läufe oder Galerie**: die Läufe zeigen jeden Druck auf Zeichnen mit seinem Prompt und Seed, der neueste oben; die Galerie zeigt jedes Bild jedes Laufs in einem Raster, das neueste zuerst, nach Format (1:1, 16:9, 9:16) oder mit Stern (☆ auf einem Bild markiert es), in drei Größen, in gleichen Kacheln: gleiche Spalten, jede Kachel dieselbe Box, jedes Bild ganz darin.

**Vergleichen**: das **Vergleichen…** der Bühne, dann das andere in der Bibliothek gewählte Bild: die beiden liegen übereinander unter einem Teiler, den du ziehst (← → bewegen ihn), oder nebeneinander (S); X tauscht sie, Esc schließt. **Strg** (oder ⌘) **+ Klick** wählt Bilder und **Shift + Klick** einen Bereich: die Leiste der Bibliothek markiert sie dann mit Stern oder wirft sie auf einmal in den Papierkorb (Esc lässt los).

**Das Menü eines Bildes**: ein Rechtsklick auf irgendein Bild (das eines Laufs, der Galerie, der Bühne, das über der Seite): **Über die Seite**, **Auf die Bühne**, **Ins Formular** (sein Prompt, sein Seed und sein Format), **Alles ins Formular** (auch sein Maler, Fine-Tune, Sampling und seine Adapter: Zeichnen malt dieses Bild noch einmal), **Als Referenz**, **Vergleichen…**, **Als Cover setzen**, **Upscale** (2K oder 4K, die Größen, die sie ergeben), **Mit Stern markieren**, **Wählen**, **Den Prompt kopieren**, **Den Seed kopieren**, **Herunterladen**, **Die Datei in einem neuen Tab**, **Sein Lauf** (die Ansicht Läufe, seine Karte hervorgehoben), **In den Papierkorb**. Ein Lauf, der sich auf der Bühne entwickelt, hat keins. Über der Seite steht das Menü über dem Bild und hat die Tasten, solange es offen ist: Esc schließt das Menü, das nächste Esc das Bild.

### Hochskalieren <!-- #upscale -->

**Hochskalieren…** auf der Bühne macht das Bild **2K** oder **4K**: seine lange Seite 2560 oder 3840 px (ein quadratisches Cover 2560² oder 3840², ein 16:9 2560×1440 oder 3840×2160), mit einem Hochskalierer (ESRGAN, DAT, HAT, SPAN und Verwandte, von spandrel gelesen), gewählt in der Zeile, die sich öffnet (behalten; 4x_Nomos8kDAT zuerst, wenn es da ist); der Tipp jedes Knopfs sagt die Größe, die er gibt, und bei einem schon so großen Bild ist der Knopf aus. Das Modell läuft so oft, wie die Größe es braucht (höchstens zweimal), und das Ergebnis wird auf die genaue Größe gebracht. Das große Bild ist ein eigener Lauf neben seiner Quelle, unter einer Minute auf einer 3090; **Noch einmal** skaliert dasselbe Bild erneut hoch, vielleicht mit einem anderen Modell. Die Hochskalierer liegen in `artwork/upscalers/` des Studios (`.pth` oder `.safetensors`, Ordner erlaubt); OpenModelDB listet Hunderte: achte auf die Lizenz jedes einzelnen.

**Zweiter Durchgang…** daneben übermalt das Bild größer, wie Viktors ComfyUI-Workflow es nach seinem ersten Durchgang tut: das Bild **×1.5** oder **×2** vergrößert (nach dem nächsten Pixel, wie bei ihm) und noch einmal gemalt vom Maler seines eigenen Laufs, mit Fine-Tune, Adaptern, Prompt und Seed, von einem Teil des Weges an (*Wie stark es sich ändern darf*: 0.3 behält die Zeichnung und fügt Details hinzu, 0.5 schärft die Textur, 0.7 malt die Formen neu). Schritte, Sampler, Zeitplan und Lightning kommen aus dem Formular, wenn es mit demselben Maler malt, sonst vom Lauf: sein Rezept gibt dem zweiten Durchgang viele Schritte und kein Lightning. Ein 16:9 von 1920×1080 wird 3840×2160. Gemessen auf einer 3090: Qwen-Image 2512 fp8 bei 3840×2160 in 220 s mit 12 Schritten und Lightning (22.9 GB). Nicht für Qwen-Image 2.1, das mit Worten bearbeitet; ohne Maske und Leinwand. **Zusätzliches Rauschen** in seiner Zeile (zuerst 0.6, wie bei ihm) und unter *Wie stark es sich ändern darf* einer Referenz (zuerst 0) ist das InjectLatentNoise seines Workflows: frisches Rauschen auf dem Bild, bevor das Malen von ihm ausgeht; 0.3 bringt neues Korn und Details, über 1 beginnen die Formen des Bildes zu zerfallen.

### Ein Cover für den Take <!-- #a-cover-for-the-take -->

Ein quadratisches Bild hat **Als Cover setzen**: es wird zum Cover des Takes in der Hand (wähle rechts einen), in seiner Karte, im Player und in seinem MP3. Das bisherige Cover bleibt neben dem Take (`artwork-removed/`), wie ein Neuzeichnen es behält, und der andere Buchstabe eines A/B-Paars bekommt das neue auch, wenn er keins hat.

**Das eigene Artwork eines Takes** (*Bild zeichnen* in seinem Menü, im Bibliothekar, für einen Take oder viele) malt der Maler unter **Engine → Artwork**: nach den Karten (Qwen-Image 2512 Q6 oder Q4 ganz, wo eine Karte es fasst, sonst Q4 aus dem RAM gestreamt auf einer kleineren Karte), oder der, den du unter den Qwen-Malern wählst, die diese Maschine hat: Qwen-Image 2512 Q4 oder Q6 und jedes fp8-Fine-Tune mit Lightning, Qwen-Image 2.1 mit genannter Lizenz (nicht für einen verkauften Song). Ein gewähltes Fine-Tune, das nicht mehr hier ist, weicht der Wahl nach den Karten, und das Artwork sagt, wer es gemalt hat.

### Der Papierkorb des Malers <!-- #the-artist-s-trash -->

Die Läufe bleiben im Ordner `artist/` des Studios. **Papierkorb** an einem Lauf verschiebt ihn nach `trash/artist/`; der **Papierkorb** der Bühne legt ein Bild beiseite. Die Ansicht **Papierkorb** neben Läufe und Galerie zeigt zuerst die beiseitegelegten Bilder, jedes mit **Wiederherstellen** und ✕, und **Alle wiederherstellen**; dann die Läufe im Papierkorb, jeder mit **Wiederherstellen** und **Endgültig löschen**; **Alles löschen** in ihrem Kopf löscht alles, was sie zeigt. Jedes Löschen fragt vorher und lässt sich nicht rückgängig machen.

**Papierkorb (Bilder)** in der Spalte des Bibliothekars, unter Außer Sicht, hält die weggelegten Bilder als Kacheln (ein Klick auf eine hakt sie an): die Läufe des Malers im Papierkorb, die beiseitegelegten Bilder und die von den Takes genommenen Cover (durch Neuzeichnen, durch Entfernen, durch ein neues Cover), jedes mit seinem Bild und seinem Gewicht. Hake sie an, um sie zurückzugeben (ein Cover kehrt zu seinem Take zurück, das jetzige wird an seiner Stelle behalten) oder um sie endgültig zu löschen, nach einer Frage; ist nichts angehakt, **Den Papierkorb der Bilder leeren**. Die Cover eines eingefrorenen Arbeitsbereichs bleiben, wie sie sind.

### Das Protokoll des Malers <!-- #the-artist-s-log -->

Der Rahmen des Server-Protokolls hat zwei Ansichten, **Server** und **Maler**, und jeder Raum öffnet seine eigene: der Raum des Malers die des Malers. Das Protokoll des Malers, in diesem Browser gespeichert (seine letzten 400 Zeilen), sagt, was gefragt wurde (der Maler, das Fine-Tune, die Formate, der Seed, das Sampling, die Adapter), was das Labor antwortete (eine Ablehnung in seinen eigenen Worten), den Weg jedes Laufs bis zu seinem Ende (wartet und warum, malt auf GPU N, fertig, gestoppt, fehlgeschlagen und warum) und die eigenen Zeilen des Labors über den Maler. **Kopieren** nimmt die Zeilen der Ansicht; eingeklappt sagt der Rahmen die letzte Zeile der Ansicht. **⧉** öffnet das Protokoll in einem eigenen Fenster, beide Ansichten gespiegelt: in Chrome bleibt es über allen Fenstern (Document Picture-in-Picture); anderswo ist es ein Fenster zum Tragen auf einen anderen Monitor. Das Fenster trägt die Karten live neben dem Protokoll; der Rahmen klappt sich ein, solange es offen ist, und klappt auf, wenn es schließt, falls er offen war.

### Was zum Maler kommt <!-- #coming-to-the-artist -->

Die Versionen des Bildes eines Takes; SeedVR als Hochskalierer (mit der DAW-Phase, in 2.1.0).

## Bibliothekar <!-- #librarian -->

### Jeder Take <!-- #every-take -->

![Der Bibliothekar](guide/studio-collection.png)

- **Die Überschrift** nennt die offene Sammlung (*Bibliothekar › Fosforida*) und was sie enthält: Takes, Stunden, Likes, Favoriten, Notizen, wie sie gemacht wurden.
- **Arbeitsbereiche** links: Alle, Favoriten, In keinem Arbeitsbereich, deine Arbeitsbereiche, *+ Neuer Arbeitsbereich*; Ausgeblendet und der Papierkorb außer Sicht. Rechtsklick auf einen Arbeitsbereich für seine **Sperren** (*Löschen des Arbeitsbereichs sperren*, *Löschen der Tracks sperren*): ein 🔒 neben seinem Namen, und nichts darin kommt in den Papierkorb. Die 💎-Arbeitsbereiche (die öffentlichen Sets des Studios) stehen am Fuß des Baums, nach Namen, und die 💎 …-LoRA-Bereiche ganz unten.
- **Suche** mit Wörtern, `*` und `?`; **Sortierung** neueste, älteste, nach Titel, längste; **Kacheln** oder **Liste**: alle drei in der Überschriftenzeile, neben den Zählungen.
- **Eine Karte** trägt das Artwork ihres Takes oben rechts neben dem Titel, wenn sie eins hat (*Bild zeichnen* im Menü des Takes); ein Klick zeigt das Bild ganz über dem Studio, wo ‹ › und die Pfeiltasten durch die Bilder der gezeigten Karten gehen, ▶ seinen Take spielt und Esc schließt. Die spielende Karte leuchtet mit den eigenen Spitzen des Songs.
- **Frische Takes**: ein Take, den du noch nicht gespielt hast, trägt eine leichte gestrichelte Linie; sein erstes Abspielen nimmt sie weg. Ein neu erzeugter Take trägt ein *neu*-Abzeichen und behält seine Notiz, sein Like und seinen Stern.
- **Die Spalte der Arbeitsbereiche**: zieh ihre Kante, um sie zu verbreitern oder zu verschmälern; « klappt sie weg, und die Karten werden breiter: ihre Spalten bleiben, also behält das Auge seinen Platz.
- **Abschnitte**: ein Arbeitsbereich kann Abschnitte enthalten, höchstens zwei Ebenen tief (⋯ neben seinem Namen → *Neuer Abschnitt…*), um zu ordnen, was darin ist, ohne jedes Mal einen neuen Arbeitsbereich. Ein Arbeitsbereich zeigt auch die Takes seiner Abschnitte. Alles, woraus der Veredler etwas macht, kommt von selbst in den Abschnitt *Veredelt* seiner Arbeitsbereiche.
- **Zieh eine Karte auf einen Arbeitsbereich** links, um sie dorthin zu verschieben (alle angehakten, wenn sie angehakt ist); halte **Strg**, um sie dort hinzuzufügen und hier auch zu behalten. Das Studio fragt vorher, und Strg+Z gibt sie zurück.
- **Angeheftete Takes**: bis zu vier in jedem Arbeitsbereich, in einem Streifen in eigenem Ton über den Karten (Rechtsklick auf einen Take → *Hier anheften*; × löst sie). Wenn du Takes anhakst, nimmt die Leiste der Angehakten den Platz des Streifens ein, sodass sich die Karten nie bewegen. Diese Leiste ist eine Reihe umrahmter Symbole: die Auswahl, die Markierungen, die Arbeitsbereiche, der Export und der Papierkorb am Ende; jedes sagt beim Überfahren, was es ist.
- **Filter** (der Knopf am Ende der Suchzeile) öffnet ein Fenster wie die Wahl des Arbeitsbereichs: hake an, wonach gesucht werden soll, in drei Gruppen (wie er gemacht wurde: erzeugt, importiert, neu erzeugt, neu gerendert; markiert: gemocht, nicht gemocht, Favoriten, mit Notiz, mit Artwork; was er hat: Stems, Entbrummt, Remaster, Upscale), jedes mit der Zahl der Takes des Orts, und wie die angehakten sich verbinden: alle (AND), irgendeins (OR) oder keins (NOR). *Zeigen* wendet sie an; der Knopf sagt dann, wie viele aktiv sind und wie sie sich verbinden.
- **Wähle** mehrere, wie in einem Dateimanager: hake einen an, und von da an hakt ein Klick irgendwo auf eine andere Karte sie auch an (Shift: den ganzen Bereich). Ein Ziehen über den leeren Raum zwischen den Karten zeichnet ein Band, das anhakt, was es berührt; **Strg+Ziehen** zeichnet es von überall und behält, was schon angehakt war. Die Leiste der Angehakten schwebt über dem Player: Favorit, zu einem Arbeitsbereich hinzufügen, in einen verschieben, aus diesem nehmen, ausblenden, als ZIP exportieren, in den Papierkorb.
- **Der Papierkorb** gibt zurück, oder löscht, nachdem du bestätigt hast. **Papierkorb (Bilder)** daneben in der Spalte hält die weggelegten Bilder (die Läufe des Malers im Papierkorb, die beiseitegelegten Bilder, die von den Takes genommenen Cover) und gibt sie zurück, oder löscht sie endgültig, nachdem du bestätigt hast; die Cover eines eingefrorenen Arbeitsbereichs bleiben.

### Das Menü eines Takes <!-- #a-take-s-menu -->

![Rechtsklick auf einen Take](guide/collection-menu.png)

**Mit einem neuen Seed neu erzeugen** (über dem Schreiber im Menü des Takes): der Take noch einmal gemacht aus allem, womit er gemacht wurde, aber mit neuen Seeds; der neue übernimmt Arbeitsbereiche und Notiz des alten, und der alte wartet im Abschnitt *Quellen der Neuerzeugung* seines Arbeitsbereichs (sein Arbeitsbereich zeigt ihn nicht unter den eigenen), bis du ihn leerst; der neue behält seine Notiz, sein Like, seinen Stern und sein Bild. Eine Probe kommt mit ihren vollen zwei Minuten heraus. Abspielen, im Schöpfer oder im Veredler öffnen, das Blatt (seine Partitur), das Datenblatt (alles, womit er gemacht wurde: Stil und Text, die gezeichnete Partitur, jeder Regler, die LoRAs und Regler mit ihren Stärken; ein Direkt-Take hat keine Partitur, und *Aus dem Klang schreiben* bittet den Transkriptor um eine), gefällt mir, gefällt mir nicht, Favorit, eine Notiz, umbenennen, **Arbeitsbereiche** (ein Take kann in mehreren sitzen), in einen Arbeitsbereich **verschieben** (auf einer angehakten Karte: jeder angehakte Take, aus dem offenen Arbeitsbereich heraus), ausblenden, an den Schreiber schicken, kopieren, herunterladen, **in die DAW exportieren** (REAPER-Projekt oder DAWproject, bei jedem Take: mit seinen Stems, sobald der Veredler sie getrennt hat), der Papierkorb. **Auf einer angehakten Karte, mit weiteren angehakt**, wirkt das Menü auf alle, und sein Kopf sagt, wie viele: gefällt mir, gefällt mir nicht, Favorit, Artwork, das Artwork entfernt, Arbeitsbereiche, ausblenden, ein ZIP; Artwork für mehrere zeichnen und mehrere neu erzeugen fragt vorher, denn es kostet Kartenminuten.

**Bild zeichnen**: ein kleines Sprachmodell (Qwen3-4B) liest Stil und Wörter des Takes und schreibt einen Bild-Prompt; Qwen-Image 2512 malt ihn mit Lightning (in 1328 px, in 1024 behalten), in etwa zwei Minuten auf einer 16-GB-Karte mit Prompt und Durchsicht (auf einer kleineren Karte strömen seine Blöcke aus dem RAM, etwas langsamer; *Engine → Artwork* wählt den Maler). Es erscheint im Player, auf der Karte, im Medienfeld des Desktops und im heruntergeladenen MP3 (als Cover). Hat ein Take sein Bild, sagt das Menü *Das Bild öffnen* (über der Seite, wie ein Klick auf das Bild der Karte oder auf das Quadrat des Players) und *Bild neu zeichnen* (ein neuer Prompt und ein neues Bild; das alte bleibt neben dem Take, in `artwork-removed/`). Prompt-Schreiber und Inhaltsfilter kommen mit `heresy/fetch-heresy.sh --artwork` (8,4 GB, vorher gefragt), der Maler mit `--qwen 2512-q4` oder `2512-q6`. *Engine → Artwork* bietet jeden Qwen-Maler hier an: Qwen-Image 2512 und seine fp8-Fine-Tunes mit Lightning, und Qwen-Image 2.1 (siehe Maler › Ein Cover für den Take).

### Die Instrumente unter dem Stil <!-- #the-instruments-under-the-style -->

Unter dem Stil-Feld nennt das Studio, was dein Prompt verlangt: ein Chip für jedes Instrument und jeden Stil des Spickzettels, den es findet, gefärbt nach dem, was das Ohr fand (grün gehört, bernstein fraglich, rot unter diesem Namen nicht gespielt), mit dem Bild des Instruments. Lass den Zeiger auf einem ruhen für seine Karte: das Bild, seine Herkunft, wie es klingt, ▶ A und ▶ B mit ihren Seeds. Ein Klick zeigt das Bild ganz. **Alt+I** öffnet den Spickzettel von überall.

### Artwork: was es zeichnet, was es nicht kann, ein anderer Maler <!-- #artwork-what-draws-it-what-it-cannot-another-painter -->

**Was es zeichnet.** Ein kleines Sprachmodell (Qwen3-4B) liest Stil und Wörter des Takes und schreibt einen Bild-Prompt, sein Motiv zuerst; Qwen-Image 2512 malt ihn mit Lightning (in 1328 px, bei 1024 behalten), seine Blöcke aus dem RAM, wo es nicht ganz passt (*Engine → Artwork*). Ist der Take nach einem Instrument benannt (die Probe eines Instruments), führt sein Aussehen den Prompt Wort für Wort an (was das Instrument ist und was nicht), und Omni (das Modell des Hörers) sieht sich das Bild nach diesem Aussehen an: ein Bild, in dem es das Instrument nicht findet, wird neu gemalt, höchstens drei, und zeigt keines es wirklich, bleibt der Take ohne Bild statt mit einem falschen. Etwa zwei Minuten pro Bild auf einer 16-GB-Karte, alles mitgezählt.

**Was es nicht kann** (ein Hinweis, klar gesagt): der Maler zeichnet, was er kennt. Ein Instrument, das er nie unter seinem Namen gesehen hat (die Duduk, die Morin Chuur, der Chomus, Kristallklangschalen…), kommt als Vermutung heraus: ein Holzrohr, eine Geige, Küchenschüsseln. Wo Omni das Instrument in keinem der drei Bilder fand, wird das Bild als **≈ eine Vermutung** markiert, in der Überlagerung und im Spickzettel der Instrumente. Ein Artwork ist die Stimmung des Takes, kein Referenzbild eines Instruments: um zu wissen, wie ein Instrument aussieht, schlag es nach.

## LoRA-Trainer <!-- #lora -->

Auf unseren eigenen Songs und Stimmen erprobt, bleibt der Trainer vorerst bei 90 %: deine Sets und Szenarien sind nicht unsere, also erzähl uns, wie es lief (im Repository, *Trainer report*: das Set, der Modus, die Einstellungen, was du gehört hast).

### Was eine LoRA YuE2 beibringt <!-- #what-a-lora-teaches-yue2 -->

Eine LoRA ist ein kleiner Adapter über beiden Hälften. **Der Stil kommt meist aus der Klanghälfte; dem Text folgen aus der Musikhälfte**, und die Musikhälfte lernt kleine Sets schnell auswendig (ihr Loss fällt gegen 0). Arten:

| Art | Daten | was sie lernt |
|---|---|---|
| **Stil** | 20+ Songs eines Klangs | Genre, Produktion, den Klang einer Band |
| **Stimme** | eine Stimme, gesungen oder gesprochen: Gesang (am besten a cappella), Lesungen, Hörbücher | eine Klangfarbe |
| **Sprache** | viele Stimmen, genaue Texte | die Aussprache einer Sprache |
| **Künstler** | ein großer, vielfältiger Katalog | alles davon |

**Ein Stimm-Adapter lernt aus jeder Form der Stimme**, nicht nur aus Gesang: Lesungen und Hörbücher gehen auch. Hier gemessen (05.10.2026): ein auf den Lesungen eines Schauspielers trainierter Adapter sprach mit seiner Stimme, und wenn er sang, sang er mit seiner Farbe. Benenne so einen Adapter nach seiner Art (Bass, Baritenor, Alt…), nie nach einer Person: `lab/voice_kind.py` misst die Stimme eines Sets an seiner Sprechtonhöhe.

![Der LoRA-Trainer: die Telemetrie eines Laufs](guide/studio-train.png)

### Warum eigene Adapter <!-- #why-your-own-adapters -->

Ein nacktes offenes Modell, so stark es auch sein mag, bleibt bei Instrumenten, Stilen und Stimmen zurück: Es kennt, was es in seinem Training gehört hat, und dein Klang ist selten darunter. Eigene Adapter schließen diese Lücke; sie sind die Rüstung des professionellen Audio- und Musikkriegers. Der sicherste Schritt nach oben: Sammle deine besten Tracks, die du auf SUNO gemacht hast (im bezahlten Tarif gehören sie dir) oder irgendwo sonst, wo die Rechte bei dir liegen, und trainiere darauf einen **Stil**-Adapter, mit dem genauen Text neben jedem. Dann schreibt YuE2 in deinem Klang statt daneben: deine Instrumente, deine Arrangements, deine Produktion. Füge einen **Stimme**-Adapter für den Sänger hinzu, den du willst, und die Songs werden in dieser Farbe gesungen. Ein Stil, trainiert auf zwanzig deiner Songs, hebt das Modell höher, als irgendein Prompt es schieben kann.

### 1 Material <!-- #1-material -->

Leg einen Ordner mit Songs in `datasets/raw/` und wähle ihn. Wähle, welche Tracks hineinkommen, gib jedem seinen Text (daneben nach Namen gefunden, wenn es ihn gibt) und, wenn nötig, einen eigenen Stil. Tracks unter 30 Sekunden bleiben standardmäßig draußen; lange sind in Ordnung (die Musikhälfte trainiert auf dem ganzen Song).

**Stimme**: *Die Stimme messen* hört bis zu zwölf Tracks des Ordners und sagt bei Sprache männlich oder weiblich und die Stimmlage (Bass, Bariton, Baritenor, Tenor; Alt, Mezzo, Sopran) mit der Sprechtonhöhe, und bietet einen Namen für das daraus gemachte Set an, wie die veröffentlichten Stimm-Adapter benannt sind (`voice-ru-m-baritenor-117`): kein Name einer Person. Bei Gesang gibt es den gesungenen Umfang und überlässt die Stimme deinem Ohr. Wo die Tonhöhe allein nicht entscheiden kann (140–175 Hz gesprochen), sag ♂ oder ♀ und miss erneut. Ein Entwurf nach Messung: das Ohr entscheidet, und die Stimme, die YuE2 dann singt, kann höher oder tiefer liegen.

### 2 Das Set <!-- #2-the-set -->

Ein **Auslösewort** (ein ungewöhnliches Wort, z. B. `fosforida`) ruft den Stil später beim Namen; die **gemeinsame Stilzeile** sagt, was zu hören ist. *Das Set erstellen* schreibt `datasets/prepared/NAME/`: 48-kHz-Audio und eine Beschriftung pro Track.

Der **Hörer** (Qwen2.5-Omni, auf jeder Karte mit etwa 8 GB frei) hört jeden Track und entwirft seine Tags; du korrigierst sie und *In die Beschriftungen schreiben*. Es ist ein Entwurf in jeder Größe: lies ihn.

### 3 Trainieren <!-- #3-train -->

![Eine Art, die Regler, eine Karte](guide/train-knobs.png)

Wähle ein in Schritt 2 gemachtes Set, dann eine **Art**: sie stellt die Regler auf das ein, was du beibringst (die Tabelle unter der Liste), und jeder lässt sich vor *Trainieren* ändern. Das Formular, Feld für Feld:

- **Art**: Stil, Stimme, Sprache oder Künstler.
- **Name des Laufs**: der Ordner des Laufs (`training/NAME/`) und die Namen seiner Adapter (`loras/NAME/NAME-eNNN`, sofort unter den LoRAs des Schöpfers). Ein Name gehört einem Lauf: die Seite verlangt einen anderen, wenn er vergeben ist.
- **Trainer**: **Ruach Studio**, der eigene des Studios, auf nicht quantisierten bf16-Gewichten; er macht den Latent-Cache des Sets selbst; Direkt oder mit Partitur, auf den Songs, wie sie sind, oder getrennt. Zeile für Zeile aus Ostris' **AI-Toolkit** (MIT) portiert, mit dessen Kurven er auf demselben Set Epoche für Epoche übereinstimmte; AI-Toolkit selbst verließ das Studio, als alles, was es trainierte, hier war.
- **Basisgewichte**: bf16, das ganze Modell (eine 24-GB-Karte), oder int8 für kleinere Karten, etwas weniger genau. Die Datei des Basismodells ändert sich nie: nur der Adapter lernt.
- **Epochen**: wie oft der Lauf das Set durchgeht, jeder Track einmal pro Epoche, ein Track pro Schritt: seine Schritte sind die Tracks des Sets mal diese Zahl (2016 Tracks für 12 Epochen sind 24 192 Schritte). Die Klanghälfte hört ein 60-Sekunden-Fenster des Tracks, jedes Mal zufällig geschnitten; die Musikhälfte liest den Song von seinem Anfang.
- **Alle N Epochen speichern**: ein Adapter am Ende jeder N-ten Epoche, jeder zum Hören und Vergleichen, alle behalten, mit dem Zustand des Optimierers neben dem neuesten (ein gestoppter Lauf behält, was er gelernt hat).
- **Rang**: wie breit der Adapter ist; sein Anteil an den Gewichten und seine Größe stehen im Tipp des Felds (was jeder Rang kostet und welcher wofür: unten).
- **Lernrate**: wie groß jeder Schritt der Klanghälfte ist (AdamW, dieselbe für den ganzen Lauf); die der Musikhälfte ist diese mal **AR-Tempo**. Die Arten behalten 0.0001; die Hälfte davon ist sanfter, für einen langen Lauf über ein großes Set; höher lernt schneller und vergisst mehr.
- **AR-Gewicht**, **AR-Anker (KL)**, **AR-Tempo**: die drei Regler der Musikhälfte, unten.
- **Modus**: **Direkt** ist für Songs im Direkt-Modus; **Voll (Partitur)** und **Melodie**, für Songs in diesen Modi, lehren die Musikhälfte auch, zuerst eine Partitur zu schreiben, die die Engine vor dem Training aus jedem Song transkribiert; die Hälfte der Schritte geht ohne Partitur, damit Direkt nicht verlernt wird. **Gesang und Musik trennen**: jeder Song wird zuerst vom Trenner des Studios in Stimme und Musik geteilt (einmal je Set, Minuten je Song), und die Musikhälfte lernt auch die Stimme allein aus dem Text und die Musik allein aus den Tags.
- Unter dem Knopf: der gemessene VRAM früherer Läufe, und welche Karte jetzt frei genug ist.

| Art | Rang | Schritte | AR-Gewicht | AR-Anker | AR-Tempo | wofür |
|---|---|---|---|---|---|---|
| **Stil** | 32 | 1500 | 0.5 | 0.2 | 0.5 | ein Klang: Genre, Produktion, der einer Band |
| **Stimme** | 16 | 1500 | 0.3 | 0.3 | 0.5 | eine Klangfarbe: die Musikhälfte nah an der Basis gehalten |
| **Sprache** | 32 | 3000 | 1.0 | 0.1 | 1.0 | Aussprache: die Musikhälfte soll sich ändern |
| **Künstler** | 32 | 3000 | 0.7 | 0.2 | 0.7 | alles davon |

### Der Rang und die anderen Regler <!-- #rank-and-the-other-knobs -->

Der **Rang** ist, wie breit die Änderung des Adapters an jeder Matrix ist. Eine LoRA passt 224 Matrizen von YuE2 an, 112 pro Hälfte; jede ist 2048 breit, 28 Schichten tief, 1,41 Milliarden Gewichte pro Hälfte. Was ein Rang kostet, an diesen Formen gemessen:

| Rang | der angepassten Gewichte | Datei, pro Hälfte (bf16) |
|---|---|---|
| 16 | 1 % | 29 MB |
| 32 | 2 % | 59 MB |
| 64 | 4 % | 117 MB |
| 128 | 8 % | 235 MB |
| 256 | 17 % | 470 MB |

- **Eine Stimme, ein Instrument, ein Klang** (20 bis 50 Songs): **16**, höchstens 32.
- **Ein Stil oder ein Künstler** (ein vielfältiger Katalog): **32**.
- **Ein großes Set vieler Stimmen** (Stunden davon, ein Tag für jede Stimme): **64**, und **höchstens 128**, nur wenn 64 messbar zu kurz greift. Der Trainer hört bei 128 auf: 256 würde ein Sechstel der berührten Gewichte ändern, mehr als irgendein Set hier braucht.
- Die Datei des Basismodells ändert sich nie. Das Risiko eines großen Rangs ist der Adapter selbst: in voller Stärke vergisst er, was ihm nicht gezeigt wurde (das Singen, wenn er aus Sprache lernte).
- **Epochen**: die Musikhälfte lernt ein kleines Set schnell auswendig (ihr Loss fällt gegen 0): die grünen Epochen in der Telemetrie sind die zuerst zu hörenden, oft lange vor der letzten.
- **Die Abtastrate des Materials**: die Klanghälfte arbeitet mit 48 kHz, die Musikhälfte hört mit 24 kHz. Eine 24-kHz-Aufnahme lehrt die Musikhälfte alles, die Klanghälfte aber nur stumpfe Höhen: Resampling fügt nichts über der Hälfte der ursprünglichen Rate hinzu. Für eine Klangfarbe gib ihr 44,1 oder 48 kHz.

### Die drei Regler der Musikhälfte <!-- #the-music-half-s-three-knobs -->

Jeder Schritt lehrt die beiden Hälften getrennt. Die Klanghälfte lernt immer den Klang: das Rauschen aus ihrem Fenster des Tracks nehmen (der Flow-Loss). Die Musikhälfte lernt nur, wenn **AR-Gewicht** über 0 liegt, und dann ziehen zwei Dinge zugleich an ihr:

- **ihre Lektion** (ar_ce): die eigenen Tokens des Songs von seinem Anfang an vorhersagen, Wort für Wort und Note für Note: Aussprache, Phrasierung, melodische Gewohnheiten, die Form eines Songs;
- **der Anker** (ar_kl): an jeder dieser Stellen fragt der Trainer das Basismodell, dieselbe Musikhälfte mit ausgeschaltetem Adapter, was es dort schreiben würde, und bestraft den Adapter für jeden Schritt davon weg.

Der Loss eines Schritts ist Flow + AR-Gewicht × ar_ce + AR-Anker × ar_kl. Was jeder Regler tut:

- **AR-Gewicht** entscheidet, ob die Musikhälfte überhaupt lernt und wie stark ihre Lektion gegen den Anker zieht. Bei 0 bleibt die Musikhälfte das Basismodell (ihr Teil des Adapters bleibt leer: alles Nullen, gemessen), der Adapter ist nur eine Klangfarbe auf der Klanghälfte, und der Anker tut nichts.
- **AR-Anker** zieht die Musikhälfte zum Basismodell zurück, damit sie behält, was das Set nicht zeigt: Singen nach einem Set aus Lesungen, andere Sprachen, neuen Wörtern folgen, eine Partitur schreiben. Ohne Anker treibt sie dorthin, wohin das Set führt.
- **Die beiden ziehen gegeneinander, und nur ihr Verhältnis zählt, nicht ihre Größe.** AdamW skaliert jeden Schritt nach der Größe seiner eigenen jüngsten Gradienten, also lehrt ein mit einer Zahl multiplizierter Loss, was er vorher lehrte: 0.5 mit einem Anker von 0.2 ist 1.0 mit 0.4. Lies den Anker als Anteil des Gewichts: ein Zehntel davon lässt die Musikhälfte sich bewegen (Sprache), gleich groß hält er sie nah an der Basis (Stimme).
- **AR-Tempo** ist das eigentliche Gaspedal der Musikhälfte: ihre Lernrate ist die Lernrate mal diesem Wert, der einzige Regler, der die Musikhälfte schneller oder langsamer lernen lässt. Die Arten halten ihn bei 0.5 (Sprache bei 1.0): die Musikhälfte lernt ein kleines Set auswendig, lange bevor die Klanghälfte ihre Klangfarbe hat.

Hier gemessen (10.10.2026: 40 Schritte auf einem Set aus 60 Lesungen, Rang 16, ein Seed; *bewegt*: wie groß die Änderung des Adapters an den Matrizen der Musikhälfte ausfiel):

| AR-Gewicht · Anker · Tempo | bewegt | Abstand zur ersten Zeile | ar_kl, seine letzten zehn Schritte |
|---|---|---|---|
| 0.5 · 0.2 · 0.5 (der von Stil) | 1.32 | derselbe Lauf noch einmal: 1 % | 0.257 |
| 1.0 · 0.4 · 0.5 (beide verdoppelt) | 1.36 | 5 % | 0.262 |
| 0.5 · 0 · 0.5 (kein Anker) | 1.44 | 23 % | — |
| 0.5 · 0.5 · 0.5 (der Anker gleich groß) | 1.21 | 17 % | 0.132 |
| 0.5 · 0.2 · 1.0 (Tempo verdoppelt) | 2.32 | 99 % | 0.443 |
| 0 · 0 · 0.5 | 0 | nichts gelernt | — |

Beide zu verdoppeln änderte den Adapter um 5 %, gegen 1 % für denselben Lauf zweimal; der Anteil des Ankers bewegte ihn um ein Sechstel bis ein Viertel; das Tempo zu verdoppeln brachte ihn drei Viertel weiter. Die Klanghälfte teilt mit der Musikhälfte nur das Gradient Clipping: zwischen den Zeilen unterschied sie sich um 4 bis 13 %, gegen 2 % für denselben Lauf zweimal.

Was du drehst, nach dem, was du hörst und siehst:

| wann | dreh |
|---|---|
| du willst nur eine Klangfarbe (eine Stimme aus Lesungen, ein Instrument) | AR-Gewicht niedrig mit gleich großem Anker (die 0.3 und 0.3 von Stimme), oder AR-Gewicht 0 |
| du willst die Aussprache einer Sprache, die Phrasierung eines Stils | AR-Gewicht 1.0, der Anker ein Zehntel davon, AR-Tempo 1.0 (die von Sprache) |
| ar_ce fällt früh unter 0.3: er kann die Songs auswendig | AR-Tempo herunter, oder den Anteil des Ankers herauf; oder hör eine frühere Epoche |
| der Adapter singt die Melodien der Trainingssongs über neue Wörter, oder verliert den Text | den Anteil des Ankers herauf: so groß wie das Gewicht, oder mehr |
| ar_kl bleibt nahe 0 und die Aussprache kam nicht | AR-Tempo herauf, oder den Anteil des Ankers herunter |

### 4 Telemetrie <!-- #4-telemetry -->

![Die Kurven beider Hälften, unter jeder erklärt](guide/train-charts.png)

Die Läufe, die gerade trainieren, stehen oben im Raum mit ihrem Fortschritt, der Restzeit und beiden Losses. Die Telemetrie eines Laufs zeigt seinen Fortschritt, dann Kacheln: sein Tempo, die gelaufene und die restliche Zeit, die letzten Werte von flow, ar_ce und **ar_kl** (wie weit sich die Musikhälfte vom Basismodell entfernt hat: 0, solange AR-Gewicht 0 ist), die VRAM-Spitze und die Karte; dann zwei Kurven:

- **Klanghälfte · Flow-Loss**: wie gut die Klanghälfte das Rauschen vorhersagt, das sie entfernen muss. Sie springt von Schritt zu Schritt (jeder Schritt zieht ein zufälliges Rauschniveau): lies die fette Linie, den gleitenden Durchschnitt.
- **Musikhälfte · ar_ce**: wie gut die Musikhälfte die eigenen Tokens des Songs vorhersagt. Nahe 0 kann sie die Songs auswendig; eine frühere Epoche ist dann der bessere Adapter.

Fahr über eine Kurve, um den Schritt, seine Epoche und den Wert dort zu lesen. **Vergleichen mit…** legt die Kurven eines anderen Laufs gestrichelt darüber. Der Knopf neben **Das Log** setzt die zwei Kurven untereinander, jede in voller Breite, oder wieder nebeneinander. **Das Log** öffnet sich am Fuß des Raums, so breit wie seine Zeilen, neben dem Server-Protokoll.

### Die Epochen, die zuerst zu hören sind <!-- #the-epochs-worth-hearing-first -->

![Grün: zuerst hören; ✓: in loras/](guide/train-epochs.png)

Jede gespeicherte Epoche ist ein Chip. **Grüne** sind zuerst zu hören, aus den Kurven gelesen: die erste Epoche, deren Klang-Loss sich gesetzt hat, die mit dem niedrigsten Klang-Loss, und die letzte, bevor die Musikhälfte die Songs auswendig kann. Es ist eine Vermutung; das Ohr entscheidet. Wähle eine Epoche: **In loras/ → der Schöpfer** (sie erscheint sofort unter den LoRAs), **Raus aus loras/**, oder **Herunterladen**.

> **Ein ohne Partitur (Direkt) trainierter Adapter gehört nur in Direkt-Läufen auf die Musikhälfte.** Im Vollen Plan kann seine Musikhälfte die Partitur selbst bei geringer Stärke zerbrechen: gib ihm dort nur die Klanghälfte.

### Läufe <!-- #runs -->

![Jeder Lauf eine Karte](guide/train-runs.png)

Jeder Lauf ist eine Karte rechts: *Aktiv*, *Alle*, *Archiviert*, *Papierkorb*, durchsuchbar. Ein trainierender Lauf leuchtet wie ein spielender Take. ⋯ auf einer Karte: seine Telemetrie, sein Log, archivieren, stoppen, oder in den Papierkorb löschen (du wirst gefragt, ob seine Adapter in loras/ mitgehen). Aus dem Papierkorb kommt er zurück, oder geht endgültig.

## Engine <!-- #engine -->

### Die Maschine <!-- #the-machine -->

![Engine](guide/studio-engine.png)

- **Server**: was die Engine laufen lässt: das Modell, die Decoder, den Kontext, die Bibliothek.
- **Rechnen**: die **Modell**-Kopie (BF16 7,2 GB, Q8_0 3,8 GB, Q6_K und Q5_K_M kleiner), die **GPU-Speicher-Voreinstellung** (*Auto* passt Kontext und VAE-Kacheln an die Karte an; *Auto innerhalb N GB* tut es für so viel, der Rest der Karte bleibt dem, was sonst darauf läuft (auf einem 16-GB-Laptop 14); *Manuell* überlässt sie dir), **Modelle geladen halten**. **Die Maschine scannen** sagt, was die Maschine hat und was zu ihr passt (das Backbone, die Regler von Auto, der Maler), wie ein neues Studio es einmal bei seinem ersten Start tut.
- **Hardware**: der Speicher der Karte jetzt; **Modell entladen** gibt ihn sofort frei.

### GPUs: welche Karte was tut <!-- #gpus-which-card-does-what -->

![Welche Karte was tut](guide/engine-gpus.png)

Auf einer Maschine mit mehreren Karten gib jeder ihre Arbeit: das **Studio** (die Synthese) auf einer Karte, das **Training** auf den Karten, die du ihm gibst, die **Aufgaben** des Labors (der Hörer, Whisper, Stems, Remaster, Upscale) auf ihren. Solange ein Lauf auf der eigenen Karte des Studios trainiert, wartet eine Synthese, und die Seite sagt warum. Mit einer Karte geht es so: trainieren, dann erschaffen. Eine neue Karte für das Studio wirkt nach einem Neustart (der Knopf erscheint, wenn er nötig ist). Die Aufgaben des Labors bleiben auf den für sie angehakten Karten, der Maler eingeschlossen: sind diese voll, wartet eine Aufgabe auf eine von ihnen (Whisper wechselt auf den Prozessor) und nimmt nie eine Karte, die nicht für das Labor angehakt ist. Ein Lauf des Malers geht auf die Karte, auf der sein Maler vom vorigen Lauf behalten ist, die Gewichte schon im RAM.

### Decoder, Adapter, Regler, das Modell des Schreibers, das Aussehen <!-- #decoders-adapters-sliders-the-writer-s-model-the-look -->

- **VAEs**, **LoRAs**, **Regler**: jede Datei, die das Studio gefunden hat, mit ihrer Quelle und dem, was sie tut.
- **Modelle und LoRAs**: was die Installation mitbringt, Teil für Teil (die zusätzlichen Decoder und die Regler, Whisper, die Modelle der Stems, UniverSR, die LoRAs), wie ihr letzter Lauf es fand, und **Erneut prüfen**, um neu nachzusehen. Ein unvollständiger Teil listet, was fehlt, und hat sein **Holen**; **Holen, was fehlt** nimmt alle; ein abgebrochener Download macht dort weiter, wo er stehen blieb. **Weitere Modelle**: ein anderes Backbone (BF16 neben Q8_0), der Stil-Hörer, das Modell des Malers, die Basis des Trainers, jedes mit seinen Varianten und Größen, eine Variante, die schon hier ist, gemeldet, jedes vorher mit seiner Größe gefragt. Ein neues Backbone, ein neuer Decoder oder Regler erreicht die Engine bei ihrem nächsten Start (**Die Engine neu starten**); neue LoRAs sofort.
- **Artwork**: wer das Artwork eines Takes malt: nach den Karten (Qwen-Image 2512 Q6 oder Q4 ganz, wo eine Karte es fasst, sonst Q4 aus dem RAM gestreamt auf einer kleineren Karte), oder ein gewählter unter den Qwen-Malern, die diese Maschine hat (Qwen-Image 2512 Q4 oder Q6 und jedes fp8-Fine-Tune, mit Lightning; Qwen-Image 2.1 mit genannter Lizenz).
- **Schreiber**: die Adresse des lokalen Chat-Servers (vLLM, LM Studio, Ollama), *Verbindung testen*.
- **Aussehen**: 22 Themes (zum Arbeiten gewählt: klar und ruhig), die Ecken, die vier Schriften (Text, Überschriften, Zahlen, Raumnamen).
- **Server-Protokoll**: das ganze Protokoll; **Über**: jedes Projekt, auf dem das Studio steht, verlinkt.
- **Updates**: die Releases von Ruach Studio auf GitHub gegen diese Version: wie oft nachgesehen wird (täglich, wöchentlich, monatlich, nie), auch Release-Kandidaten, und wenn eins erscheint, fragen oder von selbst aktualisieren, wenn nichts läuft (nur wo das Studio ein Klon seines Repositorys ist; anderswo sagt es, wie man von Hand aktualisiert). Ein neues Studio, und jedes Update, bietet die 💎-Sets an, die es noch nicht hat.
- **Sicherheit**: wer das Studio öffnen darf: nur dieser Rechner, dieser Rechner und private Netze (der Standard; das WLAN eines Cafés oder Hotels ist auch eins) oder dieser Rechner und die Netze, die du nennst (10.0.0.0/24); die Engine hält es in `user/access.json` und antwortet sofort danach. Ein Studio, dessen Nutzer noch nicht entschieden hat, fragt beim Start, mit einer kurzen Anleitung und „Meine Entscheidung ist bewusst“. Eine Wahl, die es für den Rechner schlösse, von dem du fragst, wird noch einmal gefragt; `user/access.json` zu löschen kehrt zu privaten Netzen zurück.
- **Ordner**: wo deine Arbeit liegt (die Songs mit den von Hugging Face geholten Arbeitsbereichen, der Papierkorb, die Bilder des Malers, die Dokumente des Schreibers), was jeder enthält und der Platz, der auf seiner Platte bleibt. **Verschieben…** bringt einen in einen beliebigen Ordner oder auf eine beliebige Platte: das Studio sagt zuerst, was es tun wird (auf derselben Platte ein Umbenennen; auf einer anderen eine Kopie, Datei für Datei geprüft, dann der Link umgestellt) und verschiebt erst nach einem zweiten Ja, solange nichts rendert; die alte Kopie bleibt, umbenannt, bis du sie entfernst. **Zurück nach Hause** holt einen Ordner wieder in den Ordner des Studios; **Erneut verlinken** richtet das Studio auf einen Ordner aus, dessen Platte zurückgekommen ist. Die Modelle, die LoRAs und die Trainingssets bleiben an ihrem Platz.

## DAW <!-- #daw -->

**Experimentell.** Der Weg in eine DAW funktioniert und wurde geprüft, braucht aber noch Absturztests auf anderen Maschinen und Projekten, und mehr Arbeit.

### Zwei Wege aus dem Studio <!-- #two-ways-out-of-the-studio -->

Das Studio gibt einen Song auf einem von zwei Wegen heraus, und nur auf diesen zwei:

1. **Die gemischte Spur**, wie das Studio sie gemacht und der Veredler sie fertiggestellt hat: WAV, FLAC oder MP3, keine DAW dazwischen.
2. **Der ganze Take in deine eigene DAW**, als Projekt dieser DAW: von dort an geschieht alles außerhalb des Studios. Kein Audio und kein Projekt kommt zurück: das Studio liest kein DAW-Projekt (REAPER kann ihm geben, woraus ein Song gemacht ist: seine Wörter und eine Melodie).

**In die DAW exportieren** öffnet diese Wahl: im ☰, oder im Veredler neben dem Take in der Hand. Die Seite zeigt, welche DAWs die eigene Maschine des Studios hat (REAPER, Waveform, Bitwig), mit ihren Versionen. Läuft das Studio auf einem anderen Computer als deine DAW (ein Server zu Hause, ein Laptop unterwegs), markiere deine mit *Die nutze ich*.

| DAW | was das Studio ihr gibt | Stand |
|---|---|---|
| **REAPER** | sein eigenes Projekt (.RPP): der Mix, die Stems, die Partitur als MIDI, Tempo und Takt, Abschnitte, Text, das Rezept | fertig, von REAPER selbst geprüft |
| **Waveform** (Tracktion), 14 oder neuer | DAWproject: der Mix und die Stems, die Partitur als Notenspuren, die Abschnitte als Marker, Tempo und Takt | fertig, gegen das Schema des Formats geprüft |
| **Bitwig** | DAWproject, dasselbe | fertig, gegen das Schema des Formats geprüft |
| **Studio One, Cubase** (Windows, macOS) | DAWproject, dasselbe | fertig |

### REAPER: installieren <!-- #reaper-install -->

- **Linux**: von reaper.fm das Tarball *Linux x86_64*; entpacken und `./install-reaper.sh` starten: es geht nach `/opt/REAPER`, ohne sonst etwas.
- **Windows, macOS**: der Installer von reaper.fm.
- REAPER gibt 60 Tage mit allen Funktionen, dann verlangt es eine Lizenz (60 $ für private Nutzung oder ein kleines Unternehmen).

### Das vollste Projekt: zuerst drei Schritte <!-- #the-fullest-project-three-steps-first -->

Was das Projekt trägt, hängt davon ab, was der Take hat. Für alles:

1. **Voller Plan**, wenn du den Song machst: die Partitur wird zu den MIDI-Spuren und gibt Tempo und Takt. (Ein Direkt-Take hat keine Partitur: kein MIDI; das Tempo kommt aus "NN bpm" im Stil, oder bleibt ein Platzhalter von 120.)
2. **Veredler → Stems**: jeder Stem bekommt seine eigene Spur (zwei: Gesang und Instrumental; vier: mit Drums, Bass und dem Rest).
3. **Veredler → Liedtext-Prüfung**: Whisper timt jede Zeile; die Zeilen kommen auf die Zeitleiste und die Abschnitte ([Verse], [Chorus]…) werden Regionen.

Keiner der drei ist nötig: das Projekt nimmt, was da ist, und sagt, was ihm fehlte.

### REAPER: exportieren und öffnen <!-- #reaper-export-and-open -->

1. Öffne den Take (im Schöpfer, im Veredler oder im Bibliothekar), dann **In die DAW exportieren → REAPER → Den Take exportieren**; oder Rechtsklick auf irgendeinen Take → **Herunterladen → REAPER-Projekt**.
2. Das Studio packt den Take: das Audio als 24-Bit-WAV mit 48 kHz, also ist ein siebenminütiger Song mit zwei Stems etwa 350 MB groß. Der Browser speichert `TITLE.reaper.zip`.
3. Entpack es irgendwo, ganz: `TITLE/TITLE.RPP` und `TITLE/audio/` bleiben nebeneinander.
4. Öffne `TITLE.RPP` in REAPER (File → Open project, oder ein Doppelklick).

### Was drin ist <!-- #what-is-inside -->

| Spur | was sie ist |
|---|---|
| **Mix** | der Song, wie das Studio ihn gerendert hat; **stumm**, wenn es Stems gibt, damit die Stems klingen und der Mix als Referenz wartet |
| **Vocals**, **Instrumental** (oder Drums, Bass, Other) | die Stems, jeder ab 0 über den ganzen Song |
| **Score · Vocal**, **Score · Ins** | die Partitur als MIDI, eine Spur pro Stimme. Es ist die Partitur *wie geschrieben*: der Song, wie er gesungen ist, kann davon abweichen. Sie klingt nicht, bis du ihr ein Instrument gibst (die FX der Spur: ReaSynth, oder ein beliebiges VSTi) |
| **Lyrics** | jede Textzeile als leeres Item mit der Zeile in seiner Notiz, dort, wo Whisper sie hörte |

- **Regionen**: die Abschnitte des Textes, von der ersten getimten Zeile jedes bis zum nächsten.
- **Tempo und Takt**: aus der Partitur (ihr `Q:` und `M:`), sonst "NN bpm" im Stil, sonst 120 in 4/4 als Platzhalter; die Notizen des Projekts sagen, welches.
- **Die Notizen des Projekts** (in den Projekteinstellungen von REAPER): der Titel, der Stil, beide Seeds, der eigene Name des Takes: der Weg zurück zum Take im Bibliothekar.

### REAPER: wenn etwas falsch aussieht <!-- #reaper-when-something-looks-wrong -->

| was du siehst | warum | was zu tun ist |
|---|---|---|
| Medien offline | der Audio-Ordner liegt nicht neben der .RPP | das ganze ZIP entpacken, `audio/` neben dem Projekt lassen |
| kein Text, keine Regionen | der Take wurde nie getimt | Veredler → Liedtext-Prüfung, dann erneut exportieren |
| keine MIDI-Spuren | ein Direkt-Take, oder einer ohne Partitur | im Vollen Plan machen, oder deine eigene Partitur im Schöpfer mitbringen |
| das Tempo zeigt 120 | der Take hat kein eigenes Tempo | in REAPER einstellen, oder nächstes Mal "NN bpm" in den Stil schreiben |
| das MIDI läuft der Stimme voraus oder hinterher | die Partitur ist der Plan, der Gesang seine Darbietung | das MIDI als Skizze nutzen, oder es an die Stems anpassen |
| hebräischer oder griechischer Text erscheint als Kästchen | der Schrift von REAPER fehlt das Schriftsystem | eine Schrift mit diesen Schriftsystemen im Theme oder in den Einstellungen von REAPER |

### REAPER: Songs aus REAPER heraus <!-- #reaper-songs-from-inside-reaper -->

Drei REAPER-Aktionen in `extras/reaper/` (ReaScript, Lua) erreichen das Studio über seine API, von der eigenen Maschine des Studios oder einer anderen in deinem Netz. Der Klang geht in eine Richtung: Songs kommen aus dem Studio in REAPER, und kein Audio und kein Projekt geht zurück. Was REAPER dem Studio gibt, ist, woraus ein Song gemacht ist: seine Wörter und seine Melodie.

- **Ruach - Generate here**: Stil, Länge und Modus werden gefragt; der Song wird im Studio gemacht und landet auf einer neuen Spur am Anfang der Zeitauswahl (seine Länge die der Auswahl). Der Text kommt aus den Notizen der ausgewählten Items (das exportierte Projekt behält dort die Wörter jedes Abschnitts), oder aus dem Dialog. **Ausgewählte MIDI-Items sind die Melodie des Songs**: ihre Noten werden seine Partitur (die oberste Spur gesungen; eine Akkordspur wird nicht als Linie gegeben, da ein Instrument die Melodie übernehmen könnte), in Tempo und Takt des Projekts, in der Tonart des Key Snap des Takes oder der, die die Noten nahelegen, im Modus *Nur Melodie* gemacht; die Notizen des neuen Items sagen, wie die Melodie gelesen wurde. REAPER bleibt frei, während das Studio arbeitet.
- **Ruach - Bring a take**: Wörter (Titel oder Notiz, `*` und `?`), wenn du willst ein Arbeitsbereich, und der gewählte Take landet am Editier-Cursor.
- **Ruach - Settings**: die Adresse des Studios, sein Token, wenn es eins verlangt, und der Arbeitsbereich, in dem Songs aus REAPER landen.

Installation: kopiere den Ordner in die `Scripts` von REAPER, dann *Actions → New action → Load ReaScript* für die drei, und führe *Settings* einmal aus. Sie brauchen `curl` (jedes Linux, macOS und Windows 10 und neuer hat es). Das README des Ordners sagt den Rest.

### DAWproject (Bitwig, Studio One, Cubase) <!-- #dawproject-bitwig-studio-one-cubase -->

Rechtsklick auf einen Take → **Herunterladen → DAWproject**, oder *Den Take exportieren* auf der Waveform- oder Bitwig-Karte im DAW-Fenster: eine `.dawproject`-Datei mit dem Mix und jedem Stem (der Mix stumm, wenn es Stems gibt), die Partitur als Notenspuren, eine pro Stimme, die Abschnitte als Marker, sobald der Take getimt ist, in Tempo und Takt des Takes; Stil und Text reisen in seinen Notizen mit. Öffne sie mit dem DAWproject-Import der DAW: Waveform 14 oder neuer (*File > Import Other > Import a DAWproject file*; das Studio verlangt mindestens Waveform 14), Bitwig, Studio One, Cubase. Gegen das eigene Schema des Formats (Project.xsd) geprüft.

### Aus deinen eigenen Skripten <!-- #from-your-own-scripts -->

Alles oben ist auch die API des Studios: `POST /api/v1/takes/NAME/reaper` packt das Projekt und sagt, wo es zu holen ist. Siehe **docs/API.md**: Songs, Jobs, Takes, Markierungen, Arbeitsbereiche, und ein MCP-Server für Agenten.

## Partitur <!-- #score -->

Im Vollen Plan schreibt die Musikhälfte eine Partitur, bevor eine Note erklingt, und der Song folgt ihr Takt für Takt; mit *Eigene Partitur liefern* ist die Partitur deine. Dieser Reiter liest sie Zeile für Zeile: den Dialekt, den YuE2 und SheetSage2 schreiben, wie sich ihre zwei Stimmen die Takte teilen, und wie man sie ändert, ohne den Song zu zerbrechen.

### Was die Partitur tut <!-- #what-the-score-does -->

Die Partitur ist ABC-Text: ein Kopf, dann der Song in Gruppen von einem bis vier Takten, jede Gruppe einmal für die Stimme (**Vocal**) und einmal für die Instrumente (**Ins**), auf einem Raster von Takten. Die Engine liest sie vor der Musik: die Noten der Stimme tragen die Wörter, die Akkorde führen die Harmonie, die Takte geben die Zeit.

- **Ein Take ist so lang wie seine Partitur.** Sechs Volle Takes endeten innerhalb von 0,5–5 s der Länge ihrer Partitur. Takte nach den letzten Wörtern spielen trotzdem: das ist ein Schwanz (*Enden bei…* schneidet ihn ab, oder nimm diese Takte aus der Partitur).
- **Was der Partitur fehlt, wird nicht gesungen.** Enthält der Plan weniger Abschnitte als der Text, fallen die letzten Strophen weg oder eine frühere kommt wieder.
- **Das Studio liest sie streng.** Was die Prüfung nicht kennt, lehnt sie ab, und sagt wo: die Gruppe, die Stimme, der Takt. Die Engine spielt eine solche Partitur vielleicht trotzdem, aber MIDI, die Marker, die Stimmverschiebung und das Rezitieren brauchen den eigenen Dialekt.

### Der Kopf <!-- #the-head -->

Acht Zeilen, immer diese, in dieser Reihenfolge:

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

- `X:1` und ein leeres `T:`, wie sie sind: der Titel lebt im Formular.
- `M:` der Takt als Bruch: `4/4`, `3/4`, `6/8`, `2/4`; seine untere Zahl eine Zweierpotenz.
- `L:` die Einheit: eine Note ohne Zahl dauert so lange. YuE2 schreibt `L:1/16`, eine Sechzehntel, und alles darunter zählt in ihr.
- `Q:1/4=` das Tempo: Viertel pro Minute, eine ganze Zahl.
- Die zwei `V:`-Zeilen Wort für Wort: an ihnen erkennt die Engine die Stimmen.
- `K:` die Tonart: Dur mit ihrem Namen (C, G, D, A, E, B, F#, C#, F, Bb, Eb, Ab, Db, Gb, Cb) oder Moll mit m (Am, Em, Bm, F#m, C#m, G#m, D#m, A#m, Dm, Gm, Cm, Fm, Bbm, Ebm, Abm). Eine andere Schreibung derselben Tonart wird abgelehnt: `Eb`, nicht `D#`.

### Gruppen, Stimmen und Takte <!-- #groups-voices-and-bars -->

Nach dem Kopf geht der Song in Gruppen:

```
% verse
V: Vocal
"Gm"B2B2B2B2B2B2B2G2|"Eb"B2B2B2B2B2B2B2F2|"F"F2F2F2F2F2G2F2F2|"Gm"G4z12|
V: Ins
Z4|
```

- Eine Gruppe: ein Abschnittskommentar, wo ein Abschnitt beginnt (`% verse`), dann `V: Vocal` und eine Zeile mit einem bis vier Takten, dann `V: Ins` und eine Zeile mit **derselben Zahl an Takten**. Jede Zeile endet mit `|`; kein `||`, keine Wiederholungen.
- `Z` ist ein ganzer Takt Pause, `Z2`, `Z3`, `Z4` so viele Takte; `z` ist eine Pause mit einer Länge, wie eine Note.
- Ein neuer Takt oder eine neue Tonart kommt als `M:`- oder `K:`-Zeile direkt nach der `V:`-Zeile einer Gruppe, gleich in beiden Stimmen: die Prüfung will beide Stimmen in jedem Moment auf einem Raster und in einer Tonart. Innerhalb eines Takts schreibt man einen Tonartwechsel `[K:Em]`.

### Noten und ihre Längen <!-- #notes-and-their-lengths -->

- Buchstaben sind Tonhöhen: `C D E F G A B` die Oktave ab dem mittleren C (C4), klein `c d e f g a b` die Oktave darüber; `'` hebt einen Buchstaben um eine Oktave und `,` senkt ihn: `B,` ist B3, `c'` ist C6.
- `^` Kreuz, `_` B, `=` Auflösungszeichen (`^^` und `__` doppelt): ein Zeichen gilt für diesen Buchstaben bis zum Taktende. Die eigenen Kreuze und B der Tonart brauchen kein Zeichen.
- Die Zahl nach einer Note ist ihre Länge in Einheiten (bei `L:1/16`): `1` eine Sechzehntel, `2` eine Achtel, `3` eine punktierte Achtel, `4` eine Viertel, `6` eine punktierte Viertel, `8` eine Halbe, `12` eine punktierte Halbe, `16` eine Ganze; `24`, `32` und `48` für längere. Nur diese: eine andere Länge sind zwei gebundene Noten (`F4-F` für fünf).
- `-` bindet eine Note an die nächste gleicher Tonhöhe, auch über einen Taktstrich: eine gehaltene Note, eine Silbe.
- **Jeder Takt ergibt genau seinen Takt**: bei `L:1/16` sechzehn Einheiten in 4/4, zwölf in 3/4 und in 6/8. Ein Takt, der eine Einheit zu kurz oder zu lang ist, wird abgelehnt, mit seinen Zahlen.

### Akkorde <!-- #chords -->

- Ein Akkord ist sein Name in Anführungszeichen vor der Note, an der er beginnt: `"Gm"B2`. Er gilt bis zum nächsten. Akkorde leben nur in **Vocal** (die Prüfung lehnt sie in Ins ab): sie sind die Harmonie der Band, nicht die Noten des Sängers.
- Ein Name ist ein Grundton (A bis G, mit `#` oder `b`) und einer von: Dur (nichts), `m`, `dim`, `aug`, `7`, `maj7`, `m7`, `dim7`, `m7b5`, `sus4`, `sus2`, `6`, `m6`, `7sus4`, `m(maj7)`; ein Bass nach einem Schrägstrich: `C/E`.
- Eine Pause kann einen Akkord tragen: `"Bmaj7"z16` ist ein Takt dieses Akkords bei schweigender Stimme, wie in einem Intro.
- Mit Akkorden wird eine Partitur im **Vollen Plan** gespielt; ohne, in **Nur Melodie** (ein Melodieplan, die Begleitung frei). Die Engine erkennt es an der Partitur selbst.

### Abschnitte <!-- #sections -->

- `% intro`, `% verse`, `% chorus`, `% bridge`, `% outro` in einer eigenen Zeile vor einer Gruppenmarke, wo ein Abschnitt beginnt. Sie erreichen deine DAW als Marker (*Marker*, und im REAPER-Projekt), und dort trifft der Plan auf deinen Text.
- Gib der Partitur die Abschnitte deines Textes, in ihrer Reihenfolge, jeder mit Platz für seine Zeilen. Der Planer schreibt manchmal weniger: bei einem langen Rap 2 bis 17 Abschnitte für die 32 des Textes. Füg sie hinzu, oder kürze den Text, vor *Erzeugen*.

### Zeit <!-- #time -->

- Ein Takt dauert seine Viertel × 60 ÷ das Tempo, in Sekunden (das Tempo zählt Viertel): in 4/4 bei 85 BPM 2,82 s, bei 103 BPM 2,33 s; in 3/4 bei 90 BPM 2 s.
- Der Song dauert seine Takte × das. Die Prüfzeile unter der Partitur sagt es: `✓ Native YuE2 score · Em · 90 BPM · 3/4 · 11 bars · 0:22 · 0 sections`.
- Eine Textzeile braucht die Zeit ihrer Silben: bei einer Achtel pro Silbe fasst ein 4/4-Takt 8 davon, bei einer Sechzehntel 16 (ein Rap: Viktors Buratino-Strophen laufen `FFFFFEEEE2zDDDDD`).
- Um den Song früher enden zu lassen, nimm am Ende der Partitur Takte heraus, in beiden Stimmen; für ein Outro füg dort Takte hinzu.

### Der Raum der Stimme: Vocal <!-- #the-voice-s-space-vocal -->

- Vocal ist, was gesungen wird: etwa eine Silbe pro Note, eine gebundene Note eine gehaltene Silbe, Pausen, wo der Sänger atmet. Die Tabelle der Prüfung sagt, wie viele Noten, wie viele pro Minute, den Umfang und wie viel der Zeit die Stimme klingt.
- Noten und Silben: mit mehr Noten als Silben dehnt das Modell Silben darüber oder fügt eigene hinzu; mit weniger drängt es die Wörter zusammen. Das Versmaß des Textes in Komponieren zählt jede Zeile nach der Zeit, die sie braucht: gib der Zeile etwa so viele Noten.
- Rap ist dicht (Sechzehntel auf einer oder zwei Tonhöhen: der Rhythmus trägt ihn), eine Ballade hat lange Noten. Lass am Zeilenende eine Pause: dort atmet die Stimme und die Instrumente antworten.
- Die Stimmverschiebung unter der Partitur (*Verschieben*) bewegt Vocal in Tonleiterstufen (eine Terz, eine Quarte, eine Oktave), wo es für den Sänger zu hoch oder zu tief liegt; die Akkorde und Ins bleiben.

### Der Raum der Instrumente: Ins <!-- #the-instruments-space-ins -->

- Ins ist die eigene Linie der Instrumente: das Riff des Intros, die Antworten zwischen den Phrasen, ein Solo, das Outro. Eine Melodie, nicht die Akkorde (die stehen in Vocal): eine Linie, und YuE2 arrangiert die Band darum herum.
- **Unter der Stimme pausiert Ins meistens.** Die offiziellen Cover halten `Z4` unter jeder gesungenen Gruppe und spielen im Intro, zwischen den Abschnitten und am Ende; Viktors Volle Takes tun dasselbe (ein Arpeggio im Intro, `Z4` unter den Strophen, ein Fill an den Übergängen). Ein volles Ins unter einer gesungenen Zeile ist eine zweite Melodie gegen die Stimme, und die eigenen Partituren vermeiden es.
- Die Prüfung fasst es als **Ins : Vocal** zusammen, die Noten des einen gegen die des anderen: über 1.5 tragen die Instrumente die meisten Noten, unter 0.67 die Stimme, dazwischen etwa gleich.
- Ein Instrumental: Vocal pausiert (`Z`) den ganzen Song und Ins trägt die Melodie. *Instrumental machen* verschiebt die Gesangsmelodie einer Partitur nach Ins (das offizielle Rezept) und hakt *Instrumental* an. Ein instrumentaler Partitur-Adapter in voller Stärke mit Wörtern zum Singen gibt eine Stimme ohne Noten: halte ihn niedrig, wenn es Text gibt (Schöpfer › VAE, Regler und LoRAs).

### Sie im Studio ändern <!-- #changing-it-in-the-studio -->

- **ABC-Partitur erstellen**, lies sie und ändere sie, dann **Erzeugen**: der sicherste Weg zur Partitur, die du willst. Oder schreib deine eigene in *Eigene Partitur liefern*.
- Die Prüfung unter der Partitur liest sie, während du tippst: ✓ mit Tonart, Tempo, Takt, Takten, Länge und Abschnitten, eine Tabelle für jede Stimme und die Zeile **Ins : Vocal**; oder ✗ mit dem, was falsch ist, und wo: `group 3, Ins, bar 9: duration 15/4 quarter notes != meter duration 4`.
- **Tonart** verschiebt die ganze Partitur (zur nächsten, nach oben oder unten); *Verschieben* bewegt nur Vocal oder nur Ins, in Tonleiterstufen.
- **MIDI** hinaus für eine DAW (eine Spur pro Stimme, die Abschnitte als Marker), und herein aus einer (eine Melodielinie pro Stimme); **Marker**: die Abschnitte mit ihren Sekunden, als CSV.
- *Aus dem Klang schreiben* und *Diesen Take transkribieren*: SheetSage2 hört eine Aufnahme und schreibt ihre Melodie und Akkorde in diesem Dialekt (mit den Akkorden, oder nur die Melodie, wie du unter *Cover oder Remix* wählst).
- *Den Text auf diese Partitur legen…*: deine Zeilen auf den Takten der Partitur; der nächste Reiter erzählt, wie es dazu kam.
- Die Partitur des Takes als Notensystem, im Vollbild, als PDF gedruckt: Schöpfer › Die Partitur.

### Wenn die Prüfung Nein sagt <!-- #when-the-check-says-no -->

| sie sagt | das heißt | tu |
|---|---|---|
| `duration … != meter duration …` | ein Takt geht nicht auf | zähl seine Einheiten: 16 in 4/4 bei `L:1/16` |
| `unsupported duration 5` | eine Länge außerhalb von 1 2 3 4 6 8 12 16 24 32 48 | binde zwei: `F4-F` |
| `voices have different measure counts` | Vocal und Ins haben in einer Gruppe verschieden viele Takte | gib der kürzeren `Z`-Takte |
| `Native chord symbols belong in Vocal, not Ins` | ein Akkord in Ins | verschieb ihn nach Vocal, derselbe Takt |
| `unresolved tie at end of score` | die letzte Note ist an nichts gebunden | nimm ihr `-` weg |
| `tie changes pitch` | ein Bogen zwischen zwei Tonhöhen | binde eine Tonhöhe nur an sich selbst |
| `Unsupported key` | eine Tonart außerhalb der Liste | dieselbe Tonart, wie die Liste sie schreibt: `Eb`, nicht `D#` |
| `expected 1–4 measures` | eine Zeile mit mehr als vier Takten | teile die Gruppe in zwei |
| `Preserve native Vocal and Ins voice definitions` | der Kopf wurde geändert | die acht Zeilen wie oben |

## Stimmen auf einer Partitur <!-- #voices -->

Wie das Promo des Studios zu seinem Klang kam: ein Erzähler, der die Zeilen des Promos über einem Musikbett spricht, Frauenstimmen, die zwischen den Zeilen singen, jede Zeile nah an dem Moment, den ihre Szene brauchte, alles in einem Take. Der Weg taugt für jedes gesprochene Wort, jede Lesung und jeden Rap über einem Bett; *Den Text auf diese Partitur legen…* macht den mittleren Teil für dich.

### Das Bett und seine Uhr <!-- #the-bed-and-its-clock -->

- Zuerst die Musik ohne Wörter: Takes im Stil des Betts (für das Promo ein epischer Trailer, D#m, 103 BPM, 128 s), bis einer richtig klingt.
- Dann *Aus dem Klang schreiben* darauf: SheetSage2 schreibt die eigene Partitur des Betts, seine Akkorde und Takte. Diese Partitur ist die Uhr: bei 103 BPM in 4/4 dauert ein Takt 2,33 s und eine Sechzehntel 0,146 s, also beginnt, solange der Takt bleibt, Takt n bei n × 2,33 s.
- Im Vollen Plan auf dieser Partitur gesungen, behält der neue Song diese Uhr: dieselben Akkorde in denselben Takten, und die Wörter dort, wo die Partitur sie hinsetzt.

### Eine Zeile auf ihren Takten <!-- #a-line-on-its-bars -->

- Jede Zeile hatte einen Moment, um gesagt zu werden: ihre Szene. Sie kommt auf den Takt, der diesem Moment am nächsten beginnt; klingt dort noch die Zeile davor, auf den nächsten freien Takt.
- Die Zeile wird zu Noten: eine Silbe je Achtel auf einem Ton des Akkords ihres Takts, der betonte Name eine Viertel höher, ein Atem nach einem Komma (eine Achtel) und nach einem Punkt (eine Viertel), die letzte Silbe der Zeile eine Viertel und tiefer. Ein Erzähler will wenige Tonhöhen: die Töne des Akkords genügen, und die Akkorde kommen aus dem Bett.
- Am ersten Takt der Zeile bekommt die Partitur ihren Abschnittskommentar und der Text denselben Tag: `% verse` dort, `[Verse]` hier. Eine Zeile, ein Abschnitt: Plan und Text treffen sich eins zu eins, und nichts fällt weg.
- Wörter, die das Modell falsch betont, bekommen Viktors Zeichen: einen Akut auf dem betonten Vokal (обе́щано), den Namen so geschrieben, wie er klingt (рУ́ах auf Russisch, רוּ-אַח auf Englisch).

### Zwei Stimmen in einem Take <!-- #two-voices-in-one-take -->

- Der Erzähler und die Frauen sind ein Take, keine Mischung. Der Stil nennt beide: `male baritone narrator, spoken word, clear English diction, female a cappella vocalise, oooh aaah, epic cinematic trailer`, und das Tempo, `103 bpm`.
- Der Text gibt jede Zeile und nach ihr, in Klammern, die Vokalise: `(Ooh, aah)`. In den Takes des Promos sangen die Frauen sie.
- Die Partitur gibt der Vokalise eigene Noten in den Takten zwischen den Zeilen: eine Halbe auf dem oberen Ton des Akkords, dann den Rest des Takts auf seinem Rezitationston, zwei Oktaven über den Noten des Erzählers. Die eigene Vokalise des Betts bleibt am Ende: das Outro behält die Takte des Betts, mit allen Noten.
- Ein Stimm-Adapter kann dem Erzähler eine Stimme geben; halte ihn niedrig (0.45 auf der Musikhälfte und 0.3 auf der Klanghälfte reichten), sonst übernimmt er die Musik.

### Viele Takes, dann der beste <!-- #many-takes-then-the-best -->

- Sechs Seeds pro Sprache, Voller Plan, Führung 1.6, die Länge auf die 128 s des Betts festgelegt, Partitur und Text wie gemacht. Jeder Take sagt seine Zeilen etwas anders: einer trifft näher, ein anderer spricht klarer.
- Wo die Zeilen wirklich sind: Veredler › Liedtext › *Die Zeilen timen* gibt Whispers Zeit für jede Zeile, Wort für Wort. Whispers eigene Segmente sind dafür zu grob: ein Segment beginnt oft auf der Vokalise vor einer Zeile.
- Halte die Zeit jeder Zeile gegen ihren Takt: im besten Take des Promos begannen 7 von 11 Zeilen innerhalb von 1,5 s ihres Takts (1,7 s im Mittel, die fernste 7,5 s); die anderen Takes wichen mehr ab. Die Partitur führt die Stimme, sie heftet sie nicht fest.
- Reih sie: zuerst die Zeilen innerhalb von 1,5 s, dann die gehörten Zeilen, dann der mittlere Abstand; hör dir die ersten paar an.

### Der doppelte Ring <!-- #the-double-ring -->

- Viktors Wort: mach zuerst die Spuren richtig, dann pass den Film an sie an, auch wenn ihre Längen verschieden sind. So folgt das Bild dem Take: eine Szene kommt kurz vor ihrer Zeile, eine Einblendung, während ihre Wörter gesagt werden, und die Endkarte hält bis zur letzten Sekunde des Takes.
- Eine Zeile muss ihren Takt also nicht auf die Zehntelsekunde treffen: der Film kommt zu ihr. Dasselbe gilt ohne Film: eine Lesung im Takt von Folien, ein Rap auf den Abschnitten eines Beats.

### Im Studio jetzt <!-- #in-the-studio-now -->

- *Den Text auf diese Partitur legen…* (Schöpfer › Cover, Remixe und deine eigene Partitur) macht den Teil mit den Zeilen auf den Takten für jede Partitur im Formular: deine Abschnitte, eine Silbe je Achtel auf den Tönen des Akkords, die Atemzüge, ein Intro und ein Outro, die Vokalise, wenn du sie anhakst.
- *Die Zeilen timen* (Veredler › Liedtext) gibt die Zeit jeder Zeile; *Enden bei…* beendet einen Take nach seiner letzten Zeile.
- Noch nicht im Studio: jede Zeile bei einer Sekunde deiner Wahl (die Szenenmomente des Promos) und das Reihen der Takes nach Abstand. Das Promo tat das mit eigenen Skripten.

## Tastenkürzel und Kniffe <!-- #shortcuts -->

**Im Bibliothekar:** **Ctrl+A** hakt jeden angezeigten Take an, **Esc** keinen, **Delete** schickt die angehakten in den Papierkorb (er fragt zuerst), **Ctrl+Z** gibt die letzte Änderung zurück (ein Verschieben, einen Arbeitsbereich, ein Ausblenden, ein Anheften, Markierungen, den Papierkorb); die Pille über dem Player bietet zehn Sekunden lang dasselbe Rückgängig.

### Tasten <!-- #keys -->

| Taste | wo | was sie tut |
|---|---|---|
| **Leertaste** | überall außer in einem Textfeld | spielt oder pausiert den Take in der Hand |
| **←** **→** (mit **Shift**: 30 s) | überall außer in einem Textfeld oder einem Menü | 5 Sekunden zurück oder vor |
| **M** | überall außer in einem Textfeld | Ton aus und an |
| die Medientasten | die Tastatur, ein Headset, das Medienfeld des Desktops | abspielen, pausieren, vorheriger, nächster |
| **Ctrl+Alt+1** … **9** | überall | **1** Schöpfer, **2** Schreiber, **3** Veredler, **4** Maler, **5** Bibliothekar, **7** Trainer, **8** hinaus in deine DAW, **9** die Engine; **6** bleibt einem kommenden Raum vorbehalten (Ctrl+1…9 sind die Tabs des Browsers) |
| **Esc** | überall | schließt, was offen ist: ein Menü, einen Dialog, den Guide, eine Vollbildansicht, den Engine-Raum |
| **F1** (oder **Shift+F1**) | überall | dieser Guide, beim Raum, in dem du bist; noch einmal, um ihn zu schließen (die Hilfe des Browsers kommt nicht) |
| **Shift+Tab** | der Schöpfer | die Taste der Rahmen, nicht der Rückweg durch die Felder: ein abgelöster Rahmen wechselt zum anderen, ist keiner abgelöst, löst er den des Formulars ab (Komponieren); ein Dialog, ein Menü und die Suchleiste behalten ihr eigenes Shift+Tab |
| **F5**, **Ctrl+R**, **Ctrl+Shift+R** | überall außer im Bibliothekar | nach jeder Eingabe (seit die Seite kam oder seit **Ctrl+S**) fragen sie zuerst, sonst laden sie sofort neu; fragend sagen sie, was ein Neuladen mitnimmt und was es behält; mit einem Song im Formular behält ihn *Im Schreiber speichern, dann neu laden* auch dort; **Ctrl+F5** lädt sofort neu (im Bibliothekar liest **F5** die Bibliothek neu) |
| **Enter** / **Esc** | ein Dialog, ein Umbenennen an Ort und Stelle, der getippte Wert einer LoRA | behalten / abbrechen; in einem Dialog mit langem Text ist **Shift+Enter** eine neue Zeile |
| **Enter** | *Mit einer Idee beginnen* | das Chatmodell entwirft den Song; **Shift+Enter** ist eine neue Zeile |
| **Ctrl+S**, **Ctrl+Shift+S** | überall | jetzt alles behalten: den Song im Formular, das offene Dokument des Schreibers, die Einstellungen (nie das Seite speichern des Browsers) |
| **Ctrl+N** | überall, im Fenster von Pinokio | Neuer Song im Schöpfer (er fragt zuerst, wenn das Formular Wörter hat); ein Browser behält Ctrl+N für sein eigenes neues Fenster |
| **Alt+K** · **Alt+J** | der Liedtext, des Schöpfers und des Schreibers | die Zeile des Cursors markieren oder entmarkieren · zur nächsten Markierung (**Alt+Shift+J** zur vorigen, **Alt+Shift+K** löscht sie) |
| **Alt+E** | der Schöpfer | hebt den Liedtext über alles und legt ihn zurück; **Shift+Tab** darüber legt ihn in das abgelöste Formular |
| **Alt+O** · **Alt+L** · **Ctrl+Y** · **Alt+↑ ↓** | der Liedtext, wie in mcedit | die Markierungen löschen · zu einer Zeile nach ihrer Nummer · die Zeile löschen · die Zeile verschieben (oder die markierten Zeilen) |
| **Ctrl+F** · **F4**, **Ctrl+H** | der Liedtext, der Stil, die Felder des Schreibers | nur in diesem Feld suchen · suchen und ersetzen (**Enter** den Treffer in der Hand, **Ctrl+Enter** alle; **Alt+C** Groß- und Kleinschreibung wie getippt) |
| **↑ ↓** · **→** · **←** | ein Menü | bewegen · ein Untermenü öffnen · es wieder verlassen |
| **Pfeiltasten** | die Themenauswahl | zwischen den Themen wechseln |
| **+** **−** **0** | ein Notensystem oder Spektrum im Vollbild | hinein, heraus, zurück auf Einpassen; **Ctrl+Mausrad** zoomt, wo der Zeiger ist |
| **← →** (mit **Shift**: größere Schritte) · **Pos1** | der Rand einer Spalte, fokussiert | die Spalte schmaler oder breiter · wieder ihre eigene Breite |
| **Enter** oder **Leertaste** | die Karte eines Laufs im LoRA-Trainer | den Lauf öffnen |

### Die Maus <!-- #the-mouse -->

- **Rechtsklick** auf einen Take überall (die Take-Liste, eine Karte, ein angehefteter Take) für sein Menü; Rechtsklick auf einen Arbeitsbereich für seine Sperren, Umbenennen und Löschen.
- **Doppelklick**: ein Take in der Take-Liste spielt ihn; der Name eines Arbeitsbereichs benennt ihn um; der Rand einer Spalte gibt ihr ihre eigene Breite zurück; das Notensystem oder das Spektrum öffnet sich im Vollbild; den Wert einer LoRA kannst du genau eintippen.
- **Im Bibliothekar, wie in einem Dateimanager**: ist eine Karte angehakt, hakt ein Klick irgendwo auf eine andere sie mit an; **Shift**+Klick hakt den ganzen Bereich an; ein Ziehen über den leeren Raum zwischen den Karten zieht ein Band, das anhakt, was es berührt; **Ctrl**+Ziehen zieht es von überall und kehrt um, was es kreuzt: nicht angehakte Karten werden angehakt, angehakte abgehakt. Die Seite scrollt weiter, wenn das Band einen Rand erreicht.
- **Markierungen für viele**: sind mehrere angehakt, markiert 👍, 👎 oder ★ auf einer von ihnen (oder auf der Leiste der angehakten) alle; haben schon alle diese Markierung, wird sie zurückgenommen. Mehrere aus einem Arbeitsbereich zu nehmen fragt zuerst; der Papierkorb fragt immer.
- **Fahr** über einen gekürzten Arbeitsbereichsnamen: er zeigt sich ganz, über dem Raster.
- **Die Geschwindigkeit** im Player (0.5× bis 2×) behält die Tonhöhe: langsamer, um ein Detail zu hören, schneller, um zu überfliegen.

### Kleine Kniffe <!-- #small-tricks -->

- Behalte den **Musik-Seed** und ändere den **Klang-Seed**: derselbe Song, neu gerendert.
- Hör ein Instrument auf **mehreren Seeds**, bevor du urteilst: YuE2 bringt es herein, wenn Seed und Song es zulassen.
- **Hefte** die Takes an, zu denen du immer wieder zurückkehrst (vier in jedem Arbeitsbereich); **Angeheftet** links listet sie alle.
- **⋯** auf einer Karte ist ihr Rechtsklick-Menü, für ein Touchpad.

## Tipps <!-- #tips -->

### Wenn etwas schiefgeht <!-- #when-something-goes-wrong -->

| was du siehst | was es ist | was zu tun ist |
|---|---|---|
| *Babel in der Partitur* | die Musikhälfte schrieb Unsinn als Partitur | die Stärken ins Grüne, weniger Adapter auf der Musikhälfte, oder Direkt |
| der Sänger spricht über einer Schleife | ein Adapter für Instrumentalpartituren, zu stark für einen gesungenen Song | halte ihn bei 0.3–0.5 |
| *GPU0 trainiert…* | ein Lauf trainiert auf der eigenen Karte des Studios | warte, stopp den Lauf, oder gib dem Training eine andere Karte (Engine → GPUs) |
| die Seite sagt, der Server sei nicht erreichbar | das Studio startete neu | warte ein paar Sekunden; lade die Seite nach einem Update neu (F5) |
| ein Take klingt in den Höhen metallisch | das 25-Frame-Brummen des VAE | Veredler → Entbrummer auf 80 % |
| der Liedtext driftet vom Text weg | die Musikhälfte verlor die Wörter | Veredler → Liedtext-Prüfung; *Neu erzeugen ab…* der Minute, in der es schiefging |
| das gewünschte Instrument ist nicht da | YuE2 entscheidet, wann ein Instrument einsetzt, und der Seed entscheidet viel | derselbe Prompt mit einem **zufälligen Musik-Seed**; hör mehrere Takes, bevor du urteilst |
| das Instrument spielt, aber nicht wie das echte | was YuE2 davon weiß | eine Instrument-LoRA (LoRA-Trainer) |

### Gute Gewohnheiten <!-- #good-habits -->

- Behalte den **Musik-Seed**, wenn ein Song stimmt, und ändere nur den **Klang-Seed**, um seinen Klang neu zu hören.
- Notiere, was funktioniert, in der **Notiz** jedes Takes: nächste Woche weißt du nicht mehr, welcher Seed es war.
- Gib jedem Projekt seinen **Arbeitsbereich**, und sperre die fertigen.
- Trainiere auf das, was du hören willst: der Adapter lernt den Klang des Sets, seine Fehler eingeschlossen.
