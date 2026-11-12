## Lecteur <!-- #reader -->

Le Lecteur, la salle après le Vidéaste, fait d'un texte une voix : un chapitre, un livre, une pièce radiophonique, un podcast, une voix sur un clip. Il lit d'une voix constante ou en dialogue à plusieurs, écoute chaque morceau lu et met la prise dans la Bibliothèque comme il y met une chanson.

![Le Lecteur de jour : le texte et sa voix à gauche, les lectures à droite](guide/reader.png "Le Lecteur : le texte, la voix, le moteur, les lectures")

### Ce qu'il fait <!-- #what-it-does -->

**Mode** donne deux façons de lire. **Narration** : une voix lit tout le texte, coupé par **phrases** (des morceaux d'environ deux cents caractères, une ligne vide une pause plus longue) ou par **versets** (une ligne par morceau, sans lire le numéro du verset ni les numéros de Strong) ; le premier morceau qui dure 2.5 s devient la référence de tous les suivants, et la voix tient tout le chapitre. **Dialogue** : une ligne par réplique, écrite `Name: words`, une voix pour chaque locuteur ; une ligne sans nom prolonge la réplique d'avant.

**Lire** lance la lecture. Elle attend dans la file comme les autres travaux lourds du labo, sa barre au-dessus du lecteur et ses lignes dans le journal. Sa carte nomme la quantification et le temps restant pendant qu'elle lit ; à la fin, la durée, sa vitesse, ce que Whisper a entendu et le volume.

### Le moteur : Drama 3 <!-- #the-engine-drama-3 -->

Le Lecteur lit avec Fish Audio Drama 3 (35B MoE, 3B actifs) via audio.cpp, à partir de quantifications GGUF dans `models/narrator/drama-3-gguf/` avec leur LICENSE et leur NOTICE à côté ; sans eux le moteur ne se charge pas. Il lit le russe, l'ukrainien, l'hébreu, le grec, l'anglais, l'espagnol, l'italien, le français, le portugais, l'allemand, le japonais et le chinois. Un moteur à toi se branche dans `user/reader/engines/` avec son propre `engine.json` et paraît dans **Moteur** à côté.

### Quantifications et vitesse <!-- #quants-and-their-speed -->

![Le choix de la quantification et la ligne en dessous](guide/reader-tier.png "Quantification : ce qui lit, où, et combien de temps prendra ce texte")

**Quantification** dit quelle quantification lit et où. **Auto · la vitesse d'abord** (par défaut) et **Auto · la qualité d'abord** choisissent selon la mémoire libre au départ de la lecture ; une quantification nommée dans la liste s'y tient. La ligne en dessous dit ce qui lirait maintenant et sur quelle carte, une seconde de parole en combien de secondes, et combien de temps prendra ce texte avec le chargement du modèle.

Mesuré sur une RTX 3090 le 09.11.2026 avec un morceau russe de 27 s. Le RTF est le nombre de secondes pour lire une seconde de parole ; Whisper a bien entendu chaque lettre sauf si la ligne dit autre chose :

| quantification | bancs d'experts en RAM | sur la carte | RAM | RTF | comment c'est mesuré |
|---|---|---|---|---|---|
| Q4_K | 4 | 21.5 GiB | 3 GiB | 0.62 | la carte seule |
| Q6_K | 16 | 21.9 GiB | 11.2 GiB | 1.16 | la carte seule |
| Q8_0 | 20 | 23.0 GiB | 17.3 GiB | 1.37 | la carte seule |
| Q8_0 | 40 | 6.9 GiB | 33.2 GiB | 2.43 | la carte seule |
| Q4_K | 20 | 15.7 GiB | 9.8 GiB | 1.34 | à côté d'un travail de dataset |
| Q6_K | 28, cuda_perf | 13.8 GiB | 18.6 GiB | 1.74 | à côté d'un travail de dataset ; un mot mal entendu |
| Q4_K | 40, cuda_perf | 7.3 GiB | 18.3 GiB | 1.75 | à côté d'un travail de dataset |
| Q6_K | 40, cuda_perf | 7.3 GiB | 26.0 GiB | 2.46 | à côté d'un travail de dataset |
| Q8_0 | le processeur seul | — | 44 GB | 7.0 | le processeur |

Les lignes à côté d'un travail de dataset sont pessimistes : le calcul de la carte et le processeur étaient partagés avec lui, et une carte à soi les lit plus vite. **Q8_0 · 20 bancs d'experts en RAM, 40 sur une carte partagée** s'en tient à Q8_0 : 20 bancs en RAM sur une carte avec 23.6 GB libres ; quand la carte est partagée, les 40 dans la mémoire de la machine ; avec **Auto** comme carte, le processeur en dernier. La première lecture charge le modèle ; sur une carte il reste chargé entre les lectures.

### Notes des quantifications <!-- #grades-of-the-quants -->

La liste « Quantification » colore chaque quantification d’après le test brut du 09.11.2026 : la première lecture de deux morceaux russes de 30 s (l’un avec des balises d’émotion, l’autre simple), cinq graines chacun, l’échantillonnage du Lecteur (temperature 0.8, top_p 0.9), sans relecture ni deuxième graine ; Whisper large-v3 a écouté les mots ajoutés, omis ou remplacés. **Vert**, stable : aucun mot faux dans aucune prise. **Jaune**, moyen : un mot faux dans une prise sur dix ; l’oreille du Lecteur relit un tel morceau. **Rouge**, déconseillé : des erreurs dans deux prises ou plus, ou une grossière ; Auto ne le choisit jamais, et son infobulle comme la carte de la lecture le disent. Toutes les quantifications sur carte sont sorties vertes, les 70 prises propres. L’endroit où les tenseurs sont calculés compte, mais comme compte une graine : la même quantification avec la même graine, ses experts sur la carte ou en RAM (les 20 couches inférieures, centrales ou supérieures), part dès les 40–60 premières ms vers une autre lecture, tandis qu’une reprise sur la même répartition est identique au bit près. Une graine montre une route parmi beaucoup : le mot après « глубоко » dans le jeu à l’aveugle du 09.11 (toutes ses prises sur une graine) est une insertion voisée de 0.7–1 s, pas un souffle.

| quantification | bancs d’experts en RAM | prises avec un mot faux | note |
|---|---|---|---|
| Q4_K | 40 | 0 / 10 | vert |
| Q6_K | 40 | 0 / 10 | vert |
| Q8_0 | 40 | 0 / 10 | vert |
| Q4_K | 20 · inférieures | 0 / 10 | vert |
| Q4_K | 20 · centrales | 0 / 10 | vert |
| Q4_K | 20 · supérieures | 0 / 10 | vert |
| Q4_K | 40 · temperature 1.0 | 0 / 10 | vert |
| Q4_K · Q6_K · Q8_0 | le processeur seul | en mesure | en mesure |

### Texte, voix et émotions <!-- #text-voices-and-emotions -->

**Voix du lecteur** : la voix du moteur lui-même, tenue depuis le premier morceau ; ou **Ta propre voix…**, un court extrait d'une voix que le moteur suit, pris seulement sous l'avertissement rouge et avec le consentement coché (cloner une voix sans le consentement de son propriétaire est un délit dans bien des pays, et la responsabilité est la tienne). Aucune voix toute faite ne vient avec le Studio. La hauteur de chaque morceau est mesurée à la lecture ; un morceau dont la voix est passée à l'autre genre est relu avec une autre graine.

Les émotions et les sons vont entre crochets, comme Drama 3 les lit : `[calm]`, `[sad]`, `[whispering]`, `[pause]`, `[laughs]`. **Palette de balises** les insère : une émotion, un tempo ou un style au début de sa phrase, une pause ou un son au curseur. **Lire les balises en ligne** est activé par défaut dans un dialogue et coupé dans une narration, où l'on veut une lecture de livre propre. **Style** donne à toute la lecture un crochet à elle, comme `calm, warm, unhurried narration`.

### Accents toniques et l'aigu <!-- #stresses-and-the-acute -->

**Placer les accents** marque les voyelles accentuées avant que le moteur ne lise : tes propres marques restent comme écrites (l'aigu, U+0301, comme dans `звени́т`), puis ton **Dictionnaire des accents**, puis le grand dictionnaire de la langue, là où il y en a un : celui de l'ukrainien vient avec le Studio (celui de lang-uk, tiré des « Словники України » de l'ULIF), et pour le russe ou toute autre langue tu branches le tien (`docs/NARRATOR-DICTIONARIES.md`) ; un mot à deux accents est laissé à son contexte. **Vérifier les accents** montre le texte tel que le moteur le lira. Un mot mal lu dans une prise : **Corriger** sur sa lecture, choisis son morceau, place l'accent, **Retenir l'accent dans le dictionnaire** et **Relire le morceau**.

### La carte des glyphes LCV <!-- #the-lcv-glyph-map -->

**Lire les lettres LCV selon la carte des glyphes** change les lettres propres à la LCV (Ѓ, Ђ, Љ, ѵ, Ѳ et les autres) en ce que le moteur lit, selon la table de l'auteur : `Авраѓа́ма` se lit `Авраהа́ма`. **Carte des glyphes LCV** sous le dictionnaire montre la table ; **Enregistrer comme ma copie** garde ta copie dans `user/reader/glyphs.map.tsv`, et c'est elle qui s'applique dès lors ; **Revenir à la table de l'auteur** la laisse. L'interrupteur est coupé par défaut.

### L'oreille et le volume <!-- #the-ear-and-the-loudness -->

**Écouter chaque morceau (Whisper)**, activé par défaut : Whisper large-v3 sur le processeur écoute chaque morceau pendant que le moteur lit le suivant. Un morceau où il entend un mot ajouté, omis ou remplacé, ou dont les lettres s’écartent du texte de 12 % ou plus (une répétition, un saut, un marmonnement), est relu avec une autre graine, jusqu’à trois lectures, et la plus proche du texte est gardée. La carte de la lecture dit quels morceaux ont été relus et pourquoi, le mot avec son instant dans la prise. La prise est assemblée à −16 LUFS, comme les podcasts, ses crêtes jamais au-delà de −1 dBFS. Une oreille qui n'a pas pu se charger est dite dans la lecture et dans la note de la prise, jamais prise pour une lecture propre.

### Depuis un enregistrement <!-- #from-a-recording -->

**Depuis un enregistrement** prend une conférence ou un stream (tout audio, ou le son d'une vidéo), et **Transcrire** l'écoute avec Whisper : les mots avec leurs temps et un texte en paragraphes à ses pauses. **Nettoyer avec le modèle de l'Écrivain** corrige ce que Whisper a mal entendu, la ponctuation et les majuscules, en gardant chaque mot et son ordre ; **Dans le texte** le met dans le texte du Lecteur, en dialogue quand ses lignes sont `Name: words`.

### Licences <!-- #licences -->

Drama 3 est sous la Fish Audio Community License v1.0 : libre pour la recherche et l'usage non commercial, et pour l'usage commercial tant que le revenu annuel reste sous USD 500,000. Elle n'autorise ni service hébergé de TTS ou de clonage de voix pour autrui, ni voix d'une personne réelle clonée sans consentement, ni l'usage de ce qu'il produit pour entraîner ou distiller un autre modèle ; son filigrane reste dans le son. Chaque prise qu'il lit porte **Built with Fish Audio** dans le résultat de sa lecture, dans l'éditeur de la prise et dans sa note de la Bibliothèque. Chaque prise du Lecteur est marquée jamais pour l'entraînement : son fichier porte la marque, l'Entraîneur refuse un dossier qui la contient et les cuisines des datasets la laissent de côté.

### Une lecture en six étapes <!-- #a-reading-in-six-steps -->

1. Colle le texte, ou apporte-le **Depuis un enregistrement**.
2. Choisis **Mode** : **Narration** pour un livre, **Dialogue** pour des voix.
3. Choisis la **Voix du lecteur** ; dans un dialogue, une pour chaque locuteur.
4. Laisse **Placer les accents** activé ; pour la LCV, ajoute **Lire les lettres LCV selon la carte des glyphes**.
5. Regarde **Quantification** et la ligne en dessous : la quantification, la carte, le temps que ça prendra.
6. **Lire**, puis écoute la prise ; un morceau raté passe par **Corriger**.
