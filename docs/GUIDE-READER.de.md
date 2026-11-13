## Vorleser <!-- #reader -->

Der Vorleser, der Raum nach dem Videografen, macht aus einem Text eine Stimme: ein Kapitel, ein Buch, ein Hörspiel, einen Podcast, eine Stimme über einem Clip. Er liest mit einer gleichmäßigen Stimme oder als Dialog mehrerer, hört jedes gelesene Stück ab und legt die Aufnahme in die Bibliothek, wie er einen Song hineinlegt.

![Der Vorleser bei Tag: der Text und seine Stimme links, die Lesungen rechts](guide/reader.png "Der Vorleser: der Text, die Stimme, die Engine, die Lesungen")

### Was er tut <!-- #what-it-does -->

**Modus** gibt zwei Arten zu lesen. **Erzählung**: eine Stimme liest den ganzen Text, geschnitten nach **Sätzen** (Stücke von etwa zweihundert Zeichen, eine Leerzeile eine längere Pause) oder nach **Versen** (eine Zeile ein Stück, ihre Versnummer und die Strong-Nummern nicht gelesen); das erste Stück, das 2.5 s dauert, wird die Referenz aller folgenden, so hält die Stimme durch das ganze Kapitel. **Dialog**: eine Zeile je Wortwechsel, geschrieben `Name: words`, eine Stimme für jeden Sprecher; eine Zeile ohne Namen setzt den Wortwechsel davor fort.

**Lesen** startet die Lesung. Sie wartet in der Warteschlange wie die anderen schweren Jobs des Labors, ihr Balken über dem Player und ihre Zeilen im Log. Ihre Karte nennt die Quantisierung und die verbleibende Zeit, während sie liest; danach die Länge, ihr Tempo, was Whisper hörte, und die Lautheit.

### Die Engine: Drama 3 <!-- #the-engine-drama-3 -->

Der Vorleser liest mit Fish Audio Drama 3 (35B MoE, 3B aktiv) über audio.cpp, aus GGUF-Quantisierungen in `models/narrator/drama-3-gguf/` mit LICENSE und NOTICE daneben; ohne sie lädt die Engine nicht. Er liest Russisch, Ukrainisch, Hebräisch, Griechisch, Englisch, Spanisch, Italienisch, Französisch, Portugiesisch, Deutsch, Japanisch und Chinesisch. Eine eigene Engine wird in `user/reader/engines/` mit ihrer eigenen `engine.json` eingesteckt und erscheint unter **Engine** daneben.

### Quantisierungen und ihr Tempo <!-- #quants-and-their-speed -->

![Die Wahl der Quantisierung und die Zeile darunter](guide/reader-tier.png "Quantisierung: was liest, wo, und wie lange dieser Text dauert")

**Quantisierung** sagt, welche Quantisierung liest und wo. **Auto · Qualität zuerst** (die Voreinstellung) nimmt Q8_0, wo immer es passt: 20 Expertenbänke im RAM auf einer Karte mit 23.6 GB frei, sonst alle 40 Bänke im Arbeitsspeicher der Maschine auf einer Karte mit 7.4 GB frei und 40 GB freiem Speicher; dann Q6_K; Q4_K nur, wo keins von beiden passt (eine kleine Karte, wenig Speicher), und auf einer Intel-Karte. **Auto · Tempo zuerst** nimmt Q4_K als Erstes. Beide wählen nach dem freien Speicher beim Start; eine in der Liste genannte Quantisierung bleibt dabei. Q8_0 ist voreingestellt, weil es nach Gehör am saubersten herauskam: im Rohtest vom 09.11.2026 wurde kein Take von Q8_0 in 20 als falsch markiert, von Q6_K einer in 20, von Q4_K sieben in 50, jede Markierung an derselben Fuge eines Satzes. Die Installation lädt Q8_0 (41.1 GB), wenn die größte Karte der Maschine 24 GB oder mehr hat, sonst Q4_K (24.9 GB); auf einer kleineren Karte kommt Q8_0 daneben: `bash tools/narrator-setup.sh --quant Q8_0`. Ohne ihn liest Auto mit der vorhandenen Quantisierung. Die Zeile darunter sagt, was jetzt lesen würde und auf welcher Karte, eine Sekunde Sprache in wie vielen Sekunden und wie lange dieser Text mit dem Laden des Modells dauern würde.

Gemessen auf einer RTX 3090 am 09.11.2026 mit einem russischen Stück von 27 s. RTF sind die Sekunden für eine Sekunde Sprache; Whisper hörte jeden Buchstaben richtig, außer die Zeile sagt anderes:

| Quantisierung | Expertenbänke im RAM | auf der Karte | RAM | RTF | wie gemessen |
|---|---|---|---|---|---|
| Q4_K | 4 | 21.5 GiB | 3 GiB | 0.62 | die Karte allein |
| Q6_K | 16 | 21.9 GiB | 11.2 GiB | 1.16 | die Karte allein |
| Q8_0 | 20 | 23.0 GiB | 17.3 GiB | 1.37 | die Karte allein |
| Q8_0 | 40 | 6.9 GiB | 33.2 GiB | 2.43 | die Karte allein |
| Q4_K | 20 | 15.7 GiB | 9.8 GiB | 1.34 | neben einem Datensatz-Job |
| Q6_K | 28, cuda_perf | 13.8 GiB | 18.6 GiB | 1.74 | neben einem Datensatz-Job; ein Wort falsch gehört |
| Q4_K | 40, cuda_perf | 7.3 GiB | 18.3 GiB | 1.75 | neben einem Datensatz-Job |
| Q6_K | 40, cuda_perf | 7.3 GiB | 26.0 GiB | 2.46 | neben einem Datensatz-Job |
| Q8_0 | der Prozessor allein | — | 44 GB | 7.0 | der Prozessor |

Die Zeilen neben einem Datensatz-Job sind pessimistisch: die Rechenleistung der Karte und der Prozessor wurden mit ihm geteilt, und eine eigene Karte liest sie schneller. **Q8_0 · 20 Expertenbänke im RAM, 40 auf einer geteilten Karte** bleibt bei Q8_0: 20 Bänke im RAM auf einer Karte mit 23.6 GB frei; ist die Karte geteilt, alle 40 im Arbeitsspeicher; mit **Auto** als Karte zuletzt der Prozessor. Die erste Lesung lädt das Modell; auf einer Karte bleibt es zwischen den Lesungen geladen.

### Auf einer Intel Arc oder einer anderen Vulkan-Karte <!-- #on-an-intel-arc-or-another-vulkan-card -->

Drama 3 liest auf einer Intel-Karte (Arc) über den Vulkan-Build von audio.cpp, in einer eigenen Stufe: Q4_K mit 28 seiner 40 Expertenbänke im Arbeitsspeicher der Maschine, etwa 11 GB auf der Karte und 16 GB freiem Speicher. Gemessen auf einer Arc Pro B50 (16 GB) am 12.11.2026: eine Sekunde Sprache in 3.3 s, das Laden des Modells 53 s. Wird der Speicher der Karte knapp, legt die Engine vier Bänke mehr in den Arbeitsspeicher und liest weiter. Auf einer Intel-Karte nimmt Auto nur diese Stufe, und eine Quantisierung für eine andere Karte wird dort beim Namen abgelehnt; Drama 3 liest nie auf dem Prozessor im Namen der Karte: schafft die Karte es nicht, sagt der Lauf das. Dem Vulkan-Loader wird nur Mesas Intel-Treiber gezeigt, so dass der Software-Renderer des Prozessors nie für die Karte gehalten wird. Vorerst schickt der Vorleser Drama 3 nur auf einer Intel-Karte an den Vulkan-Build; der Vulkan-Build von audio.cpp läuft auch auf anderen Vulkan-Karten, aber der Vorleser leitet sie noch nicht dorthin.

Die Pakete des Systems, einmal (die Vulkan-Header, der Shader-Compiler glslc, die SPIR-V-Header, Mesas Vulkan-Treiber und vulkaninfo):

```
# Debian, Ubuntu
sudo apt install libvulkan-dev glslc spirv-headers mesa-vulkan-drivers vulkan-tools
# Fedora
sudo dnf install vulkan-loader-devel glslc spirv-headers-devel mesa-vulkan-drivers vulkan-tools
# Arch
sudo pacman -S --needed vulkan-icd-loader vulkan-headers shaderc spirv-headers vulkan-intel vulkan-tools
```

Prüfe, dass der Treiber die Karte sieht: `vulkaninfo --summary` führt sie unter Devices mit Mesas Treiber, als `deviceName = Intel(R) Arc(tm) Pro B50 Graphics (BMG G21)` und `driverName = Intel open-source Mesa driver`. Eine Liste mit `llvmpipe` allein heißt, dass der Treiber fehlt. `bash tools/narrator-setup.sh --vulkan-check` sagt, was hier ist, und nennt die Pakete, die deinem System fehlen.

Dann der Build: `bash tools/narrator-setup.sh` erstellt den Vulkan-Build auf einer Maschine mit Intel-Karte von selbst, neben dem anderen; `bash tools/narrator-setup.sh --build --vulkan` erstellt nur ihn, nach `build/audio.cpp/build/linux-vulkan-release/`. Er braucht cmake und einen C++-Compiler, wie die anderen Builds; die Einrichtung installiert nie ein Systempaket, sie nennt es. Gemessen auf Ubuntu 24.04 mit Mesa 25.2 und Linux 7.0; die Einzelheiten stehen in `docs/NARRATOR-VULKAN.md`.

### Noten der Quantisierungen <!-- #grades-of-the-quants -->

Die Liste »Quantisierung« färbt jede Quantisierung nach dem Rohtest vom 09.11.2026: die erste Lesung zweier russischer Stücke à 30 s (eines mit Gefühls-Tags, eines schlicht), je fünf Seeds, das Sampling des Vorlesers (temperature 0.8, top_p 0.9), ohne Neulesung und ohne zweiten Seed; Whisper large-v3 hörte auf eingefügte, ausgelassene oder vertauschte Wörter. **Grün**, stabil: kein falsches Wort in keinem Take. **Gelb**, mittel: ein falsches Wort in einem Take von zehn; das Ohr des Vorlesers liest ein solches Stück neu. **Rot**, unerwünscht: Fehler in zwei Takes oder mehr, oder ein grober; Auto wählt es nie, und sein Tooltip und die Karte des Laufs sagen es. Alle Quantisierungen auf der Karte kamen grün heraus, alle 70 Takes sauber. Wo die Tensoren gerechnet werden, zählt, aber wie ein Seed zählt: dieselbe Quantisierung mit demselben Seed, ihre Experten auf der Karte oder im RAM (die untersten, mittleren oder obersten 20 Schichten), läuft ab den ersten 40–60 ms in eine andere Lesung, während eine Wiederholung in derselben Aufteilung bis aufs Bit gleich ist. Ein Seed zeigt einen Weg von vielen: das Wort nach »глубоко« im Blindset vom 09.11 (alle seine Takes auf einem Seed) ist ein stimmhafter Einschub von 0.7–1 s, kein Atem.

| Quantisierung | Expertenbänke im RAM | Takes mit falschem Wort | Note |
|---|---|---|---|
| Q4_K | 40 | 0 / 10 | grün |
| Q6_K | 40 | 0 / 10 | grün |
| Q8_0 | 40 | 0 / 10 | grün |
| Q4_K | 20 · untersten | 0 / 10 | grün |
| Q4_K | 20 · mittleren | 0 / 10 | grün |
| Q4_K | 20 · obersten | 0 / 10 | grün |
| Q4_K | 40 · temperature 1.0 | 0 / 10 | grün |
| Q4_K · Q6_K · Q8_0 | nur der Prozessor | wird gemessen | wird gemessen |

### Text, Stimmen und Gefühle <!-- #text-voices-and-emotions -->

**Stimme des Vorlesers**: die Stimme der Engine selbst, gehalten ab dem ersten Stück; oder **Eigene Stimme…**, ein kurzer Clip einer Stimme, der die Engine folgt, angenommen nur unter der roten Warnung und mit angehakter Einwilligung (eine Stimme ohne Einwilligung ihres Besitzers zu klonen ist in vielen Ländern eine Straftat, und die Verantwortung liegt bei dir). Fertige Stimmen bringt das Studio nicht mit. Die Tonhöhe jedes Stücks wird beim Lesen gemessen; ein Stück, dessen Stimme ins andere Geschlecht kippte, wird mit einem anderen Seed neu gelesen.

Gefühle und Geräusche stehen in eckigen Klammern, wie Drama 3 sie liest: `[calm]`, `[sad]`, `[whispering]`, `[pause]`, `[laughs]`. **Tag-Palette** setzt sie ein: ein Gefühl, ein Tempo oder einen Stil an den Anfang seines Satzes, eine Pause oder ein Geräusch an den Cursor. **Inline-Tags lesen** ist im Dialog voreingestellt an und in der Erzählung aus, wo eine saubere Buchlesung gewünscht ist. **Stil** gibt der ganzen Lesung eine eigene Klammer, etwa `calm, warm, unhurried narration`.

### Betonungen und der Akut <!-- #stresses-and-the-acute -->

**Betonungen setzen** markiert die betonten Vokale, bevor die Engine liest: deine eigenen Zeichen bleiben wie geschrieben (der Akut, U+0301, wie in `звени́т`), dann dein **Betonungswörterbuch**, dann das große Wörterbuch der Sprache, wo es eines gibt: das ukrainische und das russische kommen mit dem Studio (das ukrainische von lang-uk, aus den „Словники України“ des ULIF; das russische, A. A. Zaliznyaks Grammatisches Wörterbuch, aus den Daten von gramdict entfaltet, CC BY-NC 4.0: frei für nichtkommerzielle Nutzung), und für jede andere Sprache schließt du dein eigenes an (`docs/NARRATOR-DICTIONARIES.md`); ein Wort mit zwei Betonungen bleibt seinem Kontext überlassen. **Betonungen prüfen** zeigt den Text, wie die Engine ihn lesen wird. Ein Wort in einer Aufnahme falsch gelesen: **Korrigieren** an seiner Lesung, sein Stück wählen, die Betonung setzen, **Betonung im Wörterbuch merken** und **Stück neu lesen**.

### Die LCV-Glyphenkarte <!-- #the-lcv-glyph-map -->

**LCV-Buchstaben nach der Glyphenkarte lesen** macht aus den eigenen Buchstaben der LCV (Ѓ, Ђ, Љ, ѵ, Ѳ und den übrigen), was die Engine liest, nach der Tabelle des Autors: `Авраѓа́ма` wird als `Авраהа́ма` gelesen. **LCV-Glyphenkarte** unter dem Wörterbuch zeigt die Tabelle; **Als meine Kopie speichern** legt deine Kopie in `user/reader/glyphs.map.tsv`, und von da an gilt sie; **Zurück zur Tabelle des Autors** lässt sie los. Der Schalter ist voreingestellt aus.

### Das Ohr und die Lautheit <!-- #the-ear-and-the-loudness -->

**Jedes Stück abhören (Whisper)**, voreingestellt an: Whisper large-v3 auf dem Prozessor hört jedes Stück, während die Engine das nächste liest. Ein Stück, in dem es ein eingefügtes, ausgelassenes oder vertauschtes Wort hört oder dessen Buchstaben um 12 % oder mehr vom Text abweichen (eine Wiederholung, eine Auslassung, ein Nuscheln), wird mit einem anderen Seed neu gelesen, bis zu drei Lesungen, und die dem Text nächste bleibt. Die Karte des Laufs sagt, welche Stücke neu gelesen wurden und warum, das Wort mit seiner Zeit in der Aufnahme. Die Aufnahme wird auf −16 LUFS zusammengefügt, wie Podcasts, ihre Spitzen nie über −1 dBFS. Ein Ohr, das nicht laden konnte, wird in der Lesung und in der Notiz der Aufnahme genannt, nie für eine saubere Lesung gehalten. Aus, liest die Engine ohne Abhören: kein Stück wird seiner Wörter wegen neu gelesen, keine Buchstaben werden gezählt, und die Karte des Laufs und die Notiz des Takes sagen «Whisper aus», nie eine saubere Lesung. **Mit Whisper prüfen** an einem fertigen Lauf oder im Menü eines Vorleser-Takes in der Bibliothek hört einen Take nachträglich ab: der Take, wie er klingt, wird dort geschnitten, wo jedes Stück liegt, und gegen die Wörter abgehört, die die Engine lesen sollte; die falschen Buchstaben und jedes markierte Wort mit seiner Zeit im Take kommen in die Notiz des Takes und in `whisper-check.json` daneben. Sein Ton bleibt unberührt.

### Aus einer Aufnahme <!-- #from-a-recording -->

**Aus einer Aufnahme** nimmt einen Vortrag oder einen Stream (jedes Audio, oder den Ton eines Videos), und **Transkribieren** hört ihn mit Whisper: die Wörter mit ihren Zeiten und einen Text in Absätzen an seinen Pausen. **Mit dem Modell des Schreibers bereinigen** korrigiert, was Whisper falsch hörte, die Zeichensetzung und die Großschreibung, und behält jedes Wort und seine Reihenfolge; **In den Text** legt es in den Text des Vorlesers, als Dialog, wenn seine Zeilen `Name: words` sind.

### Lizenzen <!-- #licences -->

Drama 3 steht unter der Fish Audio Community License v1.0: frei für Forschung und nichtkommerzielle Nutzung, und für kommerzielle, solange der Jahresumsatz unter USD 500,000 bleibt. Sie erlaubt keinen gehosteten TTS- oder Stimmklon-Dienst für andere, keine Stimme eines echten Menschen ohne Einwilligung geklont und nichts, was es erzeugt, zum Trainieren oder Destillieren eines anderen Modells; sein Wasserzeichen bleibt im Klang. Jede Aufnahme, die es liest, trägt **Built with Fish Audio** im Ergebnis ihrer Lesung, im Editor der Aufnahme und in ihrer Notiz in der Bibliothek. Jede Aufnahme des Vorlesers ist als nie fürs Training markiert: ihre Datei trägt die Marke, der Trainer weist einen Ordner ab, der sie enthält, und die Datensatz-Küchen lassen sie aus.

### Eine Lesung in sechs Schritten <!-- #a-reading-in-six-steps -->

1. Füge den Text ein, oder hole ihn **Aus einer Aufnahme**.
2. Wähle **Modus**: **Erzählung** für ein Buch, **Dialog** für Stimmen.
3. Wähle die **Stimme des Vorlesers**; im Dialog eine für jeden Sprecher.
4. Lass **Betonungen setzen** an; für die LCV nimm **LCV-Buchstaben nach der Glyphenkarte lesen** dazu.
5. Sieh auf **Quantisierung** und die Zeile darunter: die Quantisierung, die Karte, wie lange es dauert.
6. **Lesen**, dann hör die Aufnahme; ein misslungenes Stück geht durch **Korrigieren**.
