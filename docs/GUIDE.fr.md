# Ruach Studio · le guide

Des chansons à partir de mots, sur ta propre machine : chaque salle, ce que fait chaque chose, et les chiffres que nous avons mesurés.

## Pour commencer <!-- #start -->

### Ce que c'est <!-- #what-this-is -->

Ruach Studio transforme une ligne de style et des paroles en chanson finie avec **YuE2**, le modèle de chanson ouvert, qui tourne sur ton propre GPU. Rien ne quitte la machine. Autour du modèle, il y a tout un studio : une salle d'écriture avec un modèle de chat, la post-production (stems, remaster, suréchantillonnage, vérification des paroles), une collection de toutes les prises, et une salle qui entraîne des adaptateurs LoRA sur tes propres chansons.

![Le Créateur : le formulaire à gauche, la prise au milieu, toutes les prises à droite](guide/studio-create.png "Le Créateur : le formulaire, la prise que tu écoutes, et toutes tes prises")

YuE2 a **deux moitiés**, et la plupart de ce que tu règles dans le studio vise l'une d'elles :

| moitié | ce qu'elle fait | ce que tu y pilotes |
|---|---|---|
| **Musique** (AR, le modèle de langage) | écrit la chanson : d'abord une partition (notation ABC), puis les jetons musicaux, 25 par seconde | le mode de planification, la partition, la graine de la musique, la force musique d'une LoRA |
| **Son** (NAR + VAE) | rend les jetons en son | la graine du son, le VAE, la force son d'une LoRA, les étapes et le solveur |

### Les six salles <!-- #the-six-rooms -->

| salle | pour |
|---|---|
| **Créateur** | le formulaire de chanson et la prise que tu écoutes |
| **Écrivain** | tes chansons comme documents avec versions ; un modèle de chat rédige et révise avec toi |
| **Affineur** | après le rendu : spectre, artefacts, antibourdon, vérification des paroles, stems, remaster, suréchantillonnage |
| **Peintre** | des images pour tes chansons à partir de ton propre prompt : carrée, large et haute depuis une seule graine ; une carrée devient la pochette d'une prise (un aperçu précoce) |
| **Bibliothécaire** | chaque prise : espaces, recherche, j'aime, notes, actions groupées, la corbeille |
| **Entraîneur LoRA** | des adaptateurs LoRA à partir de tes propres chansons : le jeu, l'exécution, sa télémétrie et ses époques |

### La barre <!-- #the-bar -->

![La barre : les salles, l'espace, et les quelques boutons dont tu te sers tout le temps](guide/bar.png)

Les salles ouvrent la barre dans l'ordre du travail : Créateur, Écrivain, Affineur, Peintre (un aperçu précoce : des images pour tes chansons) et Bibliothécaire ; le logo se tient au milieu, l'Entraîneur juste après ; à droite, l'espace, le voyant du moteur (vert : prêt ; ambre : au travail ; rouge : quelque chose a échoué) et les quelques boutons. Le pointeur sur le voyant (ou un clic) ouvre **ce qui tourne et ce qui attend** : les chansons, les régénérations et le travail du labo sur les cartes (illustrations, stems, suréchantillonnage, Whisper). Un élément en attente sort de sa file avec son ✕, pressé deux fois (la première pression demande) ; ce qui tourne déjà s'arrête là où il est affiché : une chanson dans son exécution, un entraînement dans l'Entraîneur.

- **Espace** : l'espace en main. La liste des prises ne montre que lui, et chaque nouvelle prise y arrive. *Tous les espaces* montre tout. Là où la barre est étroite (pas de logo), le mot *Espace* part aussi ; la case reste.
- **EN** (les deux lettres de la langue) : la page dans une autre langue, gardée avec tes réglages : English, Русский, Українська, Беларуская, Ελληνικά, Español, Italiano, Français, Português, Deutsch, 日本語, 中文, chacune nommée dans ses propres mots. Les nombres et les dates suivent la langue, et ce guide s'ouvre dans celle-ci.
- **☀ / ☾** : jour, nuit, ou comme le dit le système.
- Dans l'en-tête de Composer : **Enregistrer** un prompt (tout ce que Générer enverrait) en JSON ou YAML, et l'**Ouvrir** à nouveau ; **Vider** les mots (titre, style, paroles, partition, graines) et garder le reste, ou commencer une **Nouvelle chanson** (le mode, l'échantillonnage, les curseurs et les LoRA reviennent aussi aux valeurs par défaut ; *Son et sortie* reste). **Ouvrir** dit ce qu'il n'a pas pu reprendre d'un fichier, et ce que celui-ci contient à la place.
- **Exporter vers la DAW** (dans ☰, et dans l'Affineur : à côté de la prise en main et dans ses Stems) : la sortie du studio. Soit la piste mixée telle quelle (WAV, FLAC, MP3), soit la prise entière dans ta propre DAW, où la suite se passe hors du studio. La page trouve REAPER, Waveform et Bitwig sur la machine du studio, ou tu nommes la tienne. Toute prise sort par son menu (clic droit) : *Exporter vers la DAW → Projet REAPER* ou *DAWproject* (Waveform, Bitwig, Studio One, Cubase), ta propre DAW en premier ; l'onglet DAW de ce guide dit ce qu'il y a dedans.
- **Décharger le modèle** : retire tout de suite de la mémoire du GPU chaque modèle inactif ; teinté de rouge tant qu'un modèle est chargé.
- **☰** : le reste. La carte et sa mémoire, la copie du modèle, le décodeur du son (VAE), **Exporter vers la DAW**, les thèmes, la salle Moteur et ce guide. **Taille du texte** y règle tout le texte de la page de −2 à +4 pt (la mise en page reste), et un cadre détaché a ses propres −, + et ⟲ au-dessus (−4 à +6 pt) ; chaque écran garde le sien.

![Derrière le ☰](guide/more-menu.png)

### Ta première chanson, en six étapes <!-- #your-first-song-in-six-steps -->

1. Donne-lui un **Titre**, et choisis la **Tonalité** si tu en as une en tête (ou laisse *tel qu'écrit*).
2. Écris le **Style** : langue, genre, voix, instruments, tempo. Une ou deux lignes simples suffisent. Le ♪ à côté liste 200 instruments avec ce que YuE2 joue vraiment (voir *Créateur*).
3. Colle les **Paroles** avec les balises de section sur leurs propres lignes : `[Verse]`, `[Chorus]`, `[Bridge]`, `[Outro]`.
4. Garde **Plan complet** comme mode de planification : YuE2 écrit d'abord une mélodie et des accords, puis la chanson.
5. Appuie sur **Générer la chanson**. L'exécution montre ses étapes : la partition, les jetons musicaux, le son, le décodage.
6. La prise s'ouvre au milieu, avec son lecteur, sa partition et tout ce qu'il faut pour la refaire.

> Mesuré sur une RTX 3090 : une chanson de 6:12 en mode Direct a pris 126 secondes, une de 7:25 en Plan complet 198 secondes (la partition est écrite d'abord). Les chansons plus courtes vont plus vite.

### Le lecteur, les prises et le journal du serveur <!-- #the-player-the-takes-and-the-server-log -->

- **Le lecteur** en bas : l'onde en travers, un nuage doux où la partie déjà entendue prend la couleur d'accent (un clic y saute) ; dessous, la prise (son illustration quand elle en a une, son titre, les premiers mots de son style, 👍 👎 ★), puis **lecture aléatoire**, précédente, lecture, suivante et **répétition** (désactivée · toute la liste encore · cette prise encore, marquée 1), puis le temps (un clic sur la durée totale la change en temps restant), *Lire au clic* (un clic dans une liste lance la prise aussitôt), *Enchaîner* (quand une prise finit, la suivante dans la liste démarre), *Jouer les nouvelles prises* (une chanson faite ici joue quand elle est prête, sauf si quelque chose joue), 🔔 *un son quand une exécution finit* (deux notes montantes quand c'est fait, une seule fois pour une file d'exécutions, deux descendantes quand une échoue ; aucun par-dessus une nouvelle chanson qui démarre toute seule), la **vitesse** (0.50× à 2.00×, hauteur gardée), le volume et un point pour l'état (il bat pendant qu'une prise joue). Ce dont tu n'as pas besoin à l'instant reste pâle jusqu'à ce que le pointeur vienne ; chaque icône dit ce qu'elle fait quand le pointeur s'y pose. Le pointeur au-dessus de l'onde montre le temps où un clic sauterait. Les touches multimédia du clavier et d'un casque pilotent le lecteur, et le panneau multimédia du bureau montre la prise. ⏪ et ⏩ vont à la marque précédente ou suivante toutes les 15 s depuis 0:00, ← et → aux marques toutes les 5 s (Maj : 30 s). La pastille d'état au bout droit du lecteur (verte pendant qu'une prise joue, couleur d'accent pendant qu'une est fabriquée) ouvre la prise ou l'exécution ; avec Composer détaché au-dessus de la salle, elle passe le cadre à celui de la prise. Un clic droit sur l'onde, l'image ou le titre ouvre le menu de la prise, comme dans une liste. L'onde montre les sections de la prise : les propres balises des paroles, chacune là où Whisper entend sa première ligne (une fois par prise, environ une demi-minute ; tout seul sur une machine à deux cartes ou plus, sinon menu de la prise → *Trouver les sections à l'oreille*) ; une prise jamais écoutée montre les marques de sa partition. Un trait fin à chaque début, son nom en bas ; un clic près d'un trait va au tout début de la section ; le pointeur au-dessus de l'onde montre une carte avec la section, son temps et ses lignes telles qu'écrites, la ligne chantée à cet endroit éclairée ; une section marquée ? n'a pas été entendue clairement. Le pointeur posé un moment sur l'onde fait monter au-dessus du lecteur le spectrogramme de toute la prise (l'interrupteur du spectre à côté de 🔔 le désactive) : aussi large que l'onde et calé sur elle, environ un tiers de la hauteur de la fenêtre, la carte de la section au-dessus ; dedans, les sections, le centroïde spectral en ligne magenta (là où se trouve le poids du son : sa brillance), le RMS sur une bande en bas avec la moyenne propre de la prise en pointillé, la tête de lecture ; sous le pointeur son temps, le spectre de cet instant à côté du trait avec sa fréquence la plus forte et sa note, et plus haut dans l'image la fréquence à cet endroit, sa note et son niveau. *Log* ou *Linéaire* dans son en-tête ; un clic va là comme sur l'onde ; le pointeur qui s'en va ou Échap le retire. La prise est mesurée une fois, par le labo, comme pour son Spectre.
- **Deux rangées ou une** : le lecteur garde l'onde au-dessus de ses commandes là où l'on écoute et compare des chansons (le Créateur, l'Affineur, le Bibliothécaire) et tient sur une rangée dans l'Écrivain, le Peintre, l'Entraîneur et le Moteur, et dans le Créateur pendant qu'un cadre est détaché ou que les paroles passent par-dessus tout. Après un rechargement (F5), il revient avec sa prise et sa position. Dans le Peintre, les Prises démarrent repliées et le journal du serveur se tient à gauche.
- **Les cartes en direct** : dans Moteur → GPU, chaque carte a sa propre rangée en dessous, sa charge et sa mémoire en barre chaque seconde sur deux minutes, avec sa température et sa puissance ; le journal du serveur, déplié, montre à côté de lui les cartes qui ont un rôle, chacune titrée par son rôle, la carte du studio encadrée.
- **La ligne vers le studio** s'affiche à côté du journal du serveur (*Forge · 85 ms*, ou *ici* sur la même machine). Quand le studio est loin, un j'aime, un favori ou un épinglage s'affiche aussitôt et le studio ne fait que le confirmer.
- **Prises** à droite : recherche par mots, `*` et `?` ; *Favoris* ; replie la colonne avec » ; ⋯ pour les actions propres de la liste.
- **Le journal du serveur** se tient juste au-dessus du lecteur dans chaque salle : replié, il montre la dernière chose que le moteur a dite (en rouge quand quelque chose a échoué) ; déplié, dix lignes, *Suivre*, *Copier*, et le chemin vers le journal entier dans Moteur. Avec un cadre détaché au-dessus de la salle, il se tient à gauche, hors des boutons du cadre. La flèche sur son bord intérieur le porte de l'autre côté de la page, et chaque salle garde son côté (celui du Peintre est la gauche). Son bord extérieur l'élargit en glissant, jusqu'à 1200 px (gardé ; un double clic lui rend sa propre largeur) ; avec les cartes à côté, il fait 920 px de large, leur colonne 390. Le cadre a deux vues, **Serveur** et **Peintre** (le journal propre du Peintre : ce qui a été demandé, ce que le labo a répondu, le chemin de chaque exécution jusqu'à sa fin), et chaque salle ouvre la sienne ; **⧉** ouvre le journal dans sa propre fenêtre, au-dessus de toutes les fenêtres dans Chrome ou à porter sur un autre écran.

![Le journal du serveur, déplié](guide/log-dock.png)

## Créateur <!-- #creator -->

### Composer : le formulaire de chanson <!-- #compose-the-song-form -->

![Titre, tonalité, graines et style](guide/compose-top.png)

- **Partir d'une idée** : une ligne sur la chanson ; le modèle de chat de l'Écrivain rédige le titre, le style et les paroles (*Écrire le brief*).
- **Titre**, **Tonalité** : la tonalité entre dans la partition (`K:`). Avec une partition dans le formulaire, une nouvelle tonalité l'y déplace ; sans partition, le choix attend et déplace la partition qui viendra.
- **Graine musicale** et **Graine sonore** : les dés des deux moitiés. Vide, c'est au hasard ; un nombre répète une prise. Garde la graine musicale et change la graine sonore pour entendre la même chanson rendue autrement. Elles sont en tête de *Échantillonnage et débruitage*. À côté de chacune, son **mode** : *Aléatoire (−1)* une nouvelle graine à chaque exécution (le champ vide), *Aléatoire, fixée* une graine au hasard posée et gardée, *Fixe* celle qui est écrite, *Suivante* et *Précédente* la déplacent après chaque Générer au-delà des graines utilisées (les versions pour la musique, les variations pour le son). La graine du Peintre a les mêmes modes.
- **Style** : langue, genre, voix, instruments, tempo. *Enregistrer le style…* le garde sous un nom. **♂** et **♀** dans son en-tête y mettent *male vocals* ou *female vocals* (à la place du mot de l'autre genre, sinon avant le BPM) ; celui qui est allumé retire son tag.

### L'aide-mémoire des instruments ♪ <!-- #the-instruments-cheat-sheet -->

Le ♪ à côté du style ouvre un tableau de 200 instruments que le studio a sondés : leur famille, leur origine, leur son (en anglais et en russe), et les mots qui les appellent. ▶ A et ▶ B jouent deux sondes de 60 secondes de chacun. Le verdict de chaque rangée vient d'une oreille humaine : entendu, douteux, ou **NOT IDENTIFIED IN YUE2** (YuE2 ne le connaît pas ; il faut un prompt plus élaboré). Un clic copie le nom et demande où il va : à la fin du style sur sa propre ligne, ou à sa place ; un nom que le style contient est marqué dans le tableau, et le texte du tableau peut être sélectionné et copié.

**YuE2 décide quand un instrument entre.** Une ligne de style est une demande, pas un ordre : aussi fort que tu demandes, le modèle fait entrer un instrument là où son entraînement dit que la chanson le veut, et la graine décide de beaucoup. Le même prompt a donné une prise avec l'instrument et une sans. Écoute plusieurs graines avant de juger un instrument.

**Entendu, mais pas aussi vrai qu'en vrai.** Beaucoup d'instruments jouent, mais moins nettement et moins vrais que l'original : c'est ce que YuE2 en sait. Les verdicts disent si YuE2 joue un instrument, pas à quel point il sonne vrai. Le rendre vrai, c'est le travail d'une **LoRA d'instrument** : quelques dizaines d'enregistrements nets de lui, entraînés dans l'Entraîneur LoRA.

![L'aide-mémoire des instruments](guide/instruments.png)

### Paroles et profils de texte <!-- #lyrics-and-text-profiles -->

- Les balises de section sur leurs propres lignes ; YuE2 connaît `[Intro]`, `[Verse]`, `[Pre-Chorus]`, `[Chorus]`, `[Bridge]`, `[Interlude]`, `[Outro]`.
- **Profil de texte** : colle un texte entier, choisis un profil, *Appliquer* : ses règles (nettoyage, phonétique) et sa forme (`[Intro]`, `[Verse]` aux lignes vides, `[Interlude]` après les longs paragraphes) le rendent prêt à lire. *Annuler* ramène le texte. Les profils se font dans l'Écrivain.

### La métrique des paroles et la main phonétique <!-- #the-lyrics-meter-and-the-phonetic-hand -->

- **La métrique** à côté des paroles : les syllabes de chaque ligne en barre face à la règle de son groupe — couplet et pont un groupe, le pré-refrain le sien, le refrain le sien, toute autre section la sienne. Une pause, un break, un silence, un interlude, un prélude ou une indication instrumentale dans une section chantée n'ouvre pas de groupe : son nom se tient atténué à côté et la règle de la section continue. Les balises ne sont jamais comptées : une ligne de balises seules (`[Break] [Silence]`) compte pour rien, une balise dans une ligne est laissée de côté. La règle se tient à la longueur habituelle du groupe ; à une syllabe près la barre est verte, deux ou trois d'écart ambre, au-delà rouge. Ce qui est entre parenthèses est dessiné hachuré après la barre : YuE2 peut le chanter. Sous le champ : les caractères, syllabes et lignes des paroles, les balises de section, les parenthèses et la main phonétique ; la vérification orthographique du navigateur dans la langue des paroles (désactivée là) ; un champ agrandi à la main garde sa hauteur jusqu'à *Hauteur auto*.
- **Numéros de ligne et marques** : le champ des paroles numérote ses lignes comme un éditeur de code (une ligne repliée une fois, sur sa première rangée ; *Numéros de ligne* sous le champ les désactive). **Alt+K** marque la ligne du curseur ou la démarque, **Alt+J** va à la marque suivante, **Alt+Shift+J** à la précédente, **Alt+Shift+K** les efface ; le numéro d'une ligne marquée est ambre, et les marques suivent leurs lignes quand tu écris au-dessus. Chaque [balise] repose sous une fine couche ambre. Les paroles de l'Écrivain ont la même chose. Comme dans mcedit : **Alt+O** efface aussi les marques, **Alt+L** va à une ligne par son numéro, **Ctrl+Y** supprime la ligne, **Alt+↑** et **Alt+↓** déplacent la ligne (ou les lignes sélectionnées) avec sa marque. *Touches* sous le champ les liste toutes, et l'étiquette PAROLES de l'Écrivain les dit au survol. **⤢** à côté de Paroles fait passer le champ par-dessus tout, 60 % de la largeur de l'écran et quatre dixièmes plus grand, avec tout cela, et ses propres −, + et ⟲ pour la taille du texte (gardés dans ce navigateur) ; Échap le remet en place. À côté de **⤢**, deux boutons gardent les paroles en texte simple : le premier les enregistre en `.txt` nommé d'après le Titre, le second met un `.txt` (UTF-8) à leur place (il demande d'abord quand le champ contient des mots, et **Ctrl+Z** dans le champ les ramène ; un Titre vide prend le nom du fichier).
- **Crochets vérifiés** : un « [ » non fermé sur sa ligne, un « ] » sans ouverture, un « [ » dans une balise et une balise vide numérotent leur ligne en rouge, et *Balises non fermées ou égarées* sous le champ va de l'une à la suivante ; une parenthèse restée ouverte ou fermée sans ouverture est ambre (un écho peut continuer). Un « [ » encore en train d'être tapé est laissé tranquille jusqu'à ce que le curseur quitte sa ligne. **Générer demande d'abord** quand une balise est cassée : ce qui suit un « [ » non fermé peut se perdre dans la chanson et sa fin peut mal tourner ; *Aller à la ligne*, ou *Générer tel quel*.
- **Accents égarés** : une marque hors d'une voyelle — en début de ligne, après une espace ou un signe, sur une consonne, une deuxième sur la même lettre, ou un ´ avec espacement à sa place — affiche un bouton rouge sous le champ (*Accents toniques hors d'une voyelle*) et une marque devant le compte de la ligne ; le bouton sélectionne chacune à tour de rôle. Un mot avec deux marques en reçoit une ambre : voulu, ou une faute ? Dans le compte, un accent n'est pas une syllabe ; ע et une voyelle latine dans un mot russe le sont. Une syllabe est un son vocalique, une note, comptée selon les règles de chaque langue : une lettre voyelle en russe, ukrainien et biélorusse (et comme la métrique mesure le temps que prend une ligne, un mot sans voyelle — с, в, к, з, й, ў — et une occlusive fermée contre une affriquée dans un mot — глу-п-цо́в — prennent un temps à eux, dessiné plus clair : « Я же вижу глупцо́в с приду́рческим планом » fait 12 syllabes et 2 tels temps, 14) ; en grec αι, ει, οι, ου, αυ, ευ en font une (un tréma ou l'accent les sépare : τσά-ι) ; en espagnol et en italien un i ou u faible se joint à sa voisine (cie-lo, cuo-re), deux voyelles fortes en font deux (po-e-ta) ; en anglais un e final muet n'en fait aucune (make, mais ta-ble) ; l'hébreu compte ses points-voyelles ; le chinois, le japonais et le coréen un signe chacun. Les mots latins comptent comme l'anglais, l'espagnol ou l'italien : selon le mot du style pour la langue, sinon selon les petits mots des paroles elles-mêmes.
- **Ctrl+F** dans les paroles ou le style (et dans les champs de l'Écrivain) cherche dans ce seul champ : Entrée et Maj+Entrée parcourent les correspondances, Échap depuis le champ de recherche remet le curseur avec la correspondance sélectionnée ; depuis le champ lui-même (cliqué ailleurs), il ferme la barre et laisse le curseur où il est, et les mots tapés là entre-temps ne déplacent pas la vue. Un accent n'est pas cherché, ё vaut е, et о et а trouvent aussi ע et les o et a latins. **F4** ou **Ctrl+H** ouvre une seconde rangée pour remplacer : **Entrée** met les nouveaux mots à la place de la correspondance en main et passe à la suivante, **Ctrl+Entrée** (ou *Tout*) remplace toutes les correspondances d'un coup, et un seul **Ctrl+Z** dans le champ annule ; **Aa** (**Alt+C**) ne trouve que selon la casse tapée.
- **Balises sous un « [ »** : un « [ » tapé en début de ligne dans les paroles (du Créateur ou de l'Écrivain) ouvre les balises de section, comme un éditeur de code propose ses mots, dans l'ordre où une chanson les parcourt, d'Intro à End. Les lettres tapées après réduisent la liste (avec une disposition russe ou ukrainienne aussi), un nombre numérote la balise (`v2` donne `[Verse 2]`), et des paroles qui numérotent leurs couplets se voient proposer le suivant. ↑ ↓ choisissent, Entrée ou Tab met la balise sur sa propre ligne (Ctrl+Z l'enlève), Échap ou `]` ferme la liste. Intro, Outro et End déjà dans les paroles restent à leur place, atténués, avec leur ligne : ↑ ↓ les atteignent et lisent ce qu'ils sont, mais ils ne sont pas mis deux fois. Ctrl+Espace ouvre la liste, et en début de ligne tape le « [ » lui-même. La liste se tient en deux colonnes : les balises, et à côté ce qu'est celle en main (dans nos mots, d'après le guide des sections de chanson de Genius) et combien de fois les 110 exemples officiels l'écrivent ; le champ garde sa taille quand la liste se réduit. Les sections qu'aucun n'écrit sont marquées TEST. **Une deuxième et une troisième balise** sur une ligne : un « [ » tapé juste après la balise d'une ligne reçoit son espace tout seul et propose les balises qui ne sont pas des sections (qui chante, comme les exemples l'écrivent ; Female Vocals, Break et Silence marqués TEST) ; Entrée la met sur la même ligne, un « … » dedans sélectionné pour tes mots ; Ctrl+Espace y tape aussi « [ ».
- **La main phonétique** (celle de Viktor, venue de SUNO ; YuE2 la suit aussi) :
  - **Un accent tonique** (l'aigu combinant, U+0301) après une voyelle : `обе́щано`, `сули́т`. Il tient dans plus de 95 % des lignes.
  - **Une voyelle accentuée en majuscule** pousse l'accent là où la rime le veut, contre le dictionnaire : `базилиО́`.
  - **ע (ayin) dans un mot russe** se chante comme un о/а doux, comme la parole vivante dit un о inaccentué : `кעмо́рка`, `пעле́но`, `Ка́рлע`. Il freine aussi le rap qui va de plus en plus vite.
  - **Un o latin dans un mot russe** chante un o dur et ouvert là où le modèle dirait а : `Кo дну`.
  - **Une voyelle étirée** (`о-о-о`, `БУ… РА… ТИ… НО`) tient une note ; là où la musique a de la place pour elle, pas sur chaque ligne.
  - **[Interlude]** entre les parties fait une pause dans le rap et ralentit une parole qui ne cesse d'accélérer (pas toujours).
  - **Les parenthèses** peuvent être chantées (les premières prises de Buratino les chantaient) : un écho, une ligne de chœur ; une indication scénique entre parenthèses peut sortir aussi.
  - **Un mot hébreu avec ses points-voyelles** (`רוּחַ`), le modèle le dit mieux qu'en translittération.

### VAE, curseurs et LoRA <!-- #vae-sliders-and-loras -->

- Le **VAE** transforme la chanson écrite en son : **Standard** (le meilleur son), **Ancien** (celui des benchmarks), **Mélange** (un mélange des deux, un module). Une prise finie peut ajouter un autre décodage plus tard depuis sa propre page. Il se choisit dans le menu **☰**, sous le modèle, pour les chansons à venir ; une prise se décode à nouveau avec un autre depuis sa carte en quelques secondes (depuis la rc2 chaque prise garde ses latents ; une prise faite avant refait son son).
- **Curseurs** : des façonneurs de genre et de voix appliqués pendant que la musique s'écrit ; 0 est désactivé, 1 est plein.
- **LoRA** : des adaptateurs pour la moitié musique, la moitié son, ou les deux, chacun avec sa propre force.

**La courbe d'un curseur.** Un curseur pousse avec sa force de la première seconde à la dernière : plat. La petite image à côté de sa force ouvre sa courbe : **Arche** le fait monter jusqu'à la pleine force au milieu de la chanson et redescendre aux deux bouts ; **Dessiner** la façonne à la main : tire un point vers le haut pour un élan, vers le bas pour un effacement, le long de la chanson pour le déplacer ; double-clique pour ajouter un point, double-clique sur un point pour le retirer. La force que tu règles est le sommet de la courbe. La courbe court sur la musique pendant qu'elle s'écrit, de sa première trame à la fin de la durée de la chanson, et entre dans la requête de la prise : une prise refaite suit la même courbe.

![LoRA : chaque force sur une route du vert au rouge, et la moitié musique au total](guide/loras.png)

Chaque force se trouve sur une **route** : le vert est sûr, le jaune est sa limite, le rouge est au-delà. Les limites sont mesurées :

- un adaptateur de partition (un qui planifie l'ABC) jusqu'à 1.0 en vert ; toute autre moitié musique jusqu'à 0.5 en vert, 0.75 au plus ; les adaptateurs entraînés dans ce studio sont plus stricts sur la moitié musique (0.5 vert, 0.6 limite) ;
- la moitié son jusqu'à 1.0 en vert, 1.5 de limite ;
- **Musique, au total** : les adaptateurs empilés s'additionnent. Chacun peut être dans son propre vert et la somme casser quand même la partition. Mesuré sur de vraies prises : entière jusqu'à **2.25** au total, cassée dès **2.5**. La barre sous les adaptateurs montre la somme sur la même route.

**Double-clique** sur un nombre pour taper une force exacte. Les indications sous le bloc disent ce qui compte : un mot déclencheur absent du style, un adaptateur entraîné dans un autre mode de planification, une force au-delà de sa limite. Pendant que le pointeur est sur un curseur ou le fait glisser, la force exacte se tient au-dessus du pointeur dans la couleur de sa route. L'adaptateur Instrumental s'arrête à 1.0, là où il commence : au-delà, ses partitions s'égarent.

> **Un adaptateur de partition instrumentale avec des mots à chanter.** Un tel adaptateur planifie des partitions *sans ligne vocale*. À 1.00 il a donné une prise avec une seule note sur 127 mesures vocales : le chanteur parlait sur deux mesures en boucle. Avec des paroles, garde-le bas, 0.3 à 0.5. Le ⚠ à côté du nom des LoRA le dit quand cela arrive.

### Profils et modes de planification <!-- #profiles-and-planning-modes -->

- **Profil** règle d'un coup le mode, la durée, l'échantillonnage, le guidage, les étapes, le VAE, les curseurs, les LoRA et la sortie ; les textes et les graines restent. *Enregistrer le profil…* garde les réglages actuels sous un nom.
- **Mode de planification** :
  - **Plan complet**, par défaut : mélodie et accords écrits d'abord (une partition modifiable), puis la chanson. Le meilleur pour de nouvelles chansons.
  - **Mélodie seule** : un plan de mélodie, accompagnement libre. Recommandé pour les reprises.
  - **Direct** : directement à partir des paroles et du style, sans partition. Les adaptateurs entraînés sans partition vont ici.
  - **Instrumental** : sans voix, la recette officielle de YuE2. Il se tient à droite de l'en-tête du mode de planification.
- **Complet ou Direct.** Le mot de Viktor après une semaine de chansons : Direct, c'est le coup de dés de SUNO (environ deux bonnes prises sur cent, selon son compte) ; Complet est la voie pour tous, même sans lire une note d'ABC : les balises sont respectées, le son se pose, la diction tient et le tempo se prévoit. Mesuré sur son rap, quatorze prises de chaque avec Whisper à l'écoute : la meilleure prise de toutes était une prise en Complet avec sa recette conservatrice (84 % des mots entendus, 76 % dans le dernier quart). Là où Complet échoue, il échoue à la fin : une prise dure autant que sa partition, et le plan peut contenir moins de sections que le texte (alors les derniers couplets sont laissés de côté, ou un précédent est rechanté) ; après les derniers mots, les mesures restantes de la partition continuent de jouer, et ce sont les 10–15 s après le vrai fondu d'une chanson, pas le guidage. Écoute la fin d'une prise en Complet : *Finir à…* coupe une queue, *Régénérer depuis…* réécrit une fin perdue.

### Reprises, remix et ta propre partition <!-- #covers-remixes-and-your-own-score -->

- **Reprise ou remix** : prends l'air d'un enregistrement (*Transcrire* : sa mélodie seulement, pas les mots ni le chanteur), ou la mélodie d'une de tes prises, et donne-lui un nouveau style.
- **Fournir ta propre partition** : une partition ABC, suivie en Plan complet et en Mélodie seule. Transpose-la (au plus près, vers le haut ou le bas), déplace une voix par degrés de la gamme, importe un fichier MIDI (une ligne mélodique par voix), exporte du MIDI ou des marqueurs pour une DAW, charge un exemple, rends-la instrumentale. **Générer** avec une partition ici demande d'abord : sur cette partition, ou une nouvelle (le champ vidé, le modèle de chanson en écrit une). La partition se souvient des adaptateurs et des forces musique avec lesquels elle a été écrite (un plan, la partition propre d'une prise) ; quand ceux qui sont actifs maintenant diffèrent, une ligne dessous le dit, et la question aussi : à d'autres forces la musique peut s'écarter de la partition, l'Industrial Rock et les instrumentaux le plus. En Complet la partition reste ouverte tant qu'elle en contient une.
- **Réciter les paroles sur une partition** (*Poser les paroles sur cette partition…*, sous la partition une fois qu'elle se lit) : le narrateur de la promo du studio, pour tes mots. Chaque ligne va sur les mesures de la partition, une syllabe par croche (une double croche, comme se dit le rap, là où les croches laisseraient des lignes de côté) sur une note de l'accord de sa mesure, un souffle après une virgule et un point, la dernière syllabe de la ligne une noire plus bas ; chaque section commence sur une phrase de deux mesures après une mesure de silence, ou après une vocalise quand tu la coches. Les instruments, accords, tonalité et tempo restent ; les sections de la partition suivent tes balises, avec une intro et une outro autour. Pour la parole, les lectures et le rap sur un fond : fais le fond, *L'écrire à partir du son*, puis ceci ; il demande d'abord, et Ctrl+Z dans chaque champ ramène l'ancien texte.

### Échantillonnage et débruitage <!-- #sampling-and-denoising -->

![Échantillonnage : le planificateur de partition et les jetons musicaux, les limites de jetons verrouillées](guide/sampling.png)

Les valeurs par défaut sont réglées. Les trois rangées de **forme** (Composition, Interprétation, Style) bougent les réglages ensemble en cinq crans ; les réglages eux-mêmes sont en dessous.

- **Planificateur de partition** et **Tokens musicaux** : température, top-p, top-k, pénalité de répétition, fenêtre de pénalité.
- **Tokens min.** et **Tokens max.** sont **verrouillés** contre une modification égarée : clique sur le 🔒 à côté du nom pour les changer, et encore pour les verrouiller. Les planchers sont des fusibles : une partition ne peut pas finir avant 200 jetons, la musique pas avant 750 (30 secondes ; une durée demandée plus courte l'abaisse à cette durée). Le maximum de la musique s'affiche comme **Durée max.**, en temps (25 jetons par seconde), sans verrou : c'est la durée de la chanson au plus, réglée ici seulement (Son et sortie n'a pas de champ de durée).
- Chaque réglage est tenu dans des bornes raisonnables ; une valeur au-delà est ramenée, et la page le dit.
- **Guidage (CFG)** : 1.6 par défaut dans chaque mode.
- **Son et sortie**, la partie basse du bloc : **Pas de débruitage** et **Solveur** pour la moitié son, **Format** (WAV 24 bits, 16 bits, 32 bits flottant ou MP3 avec son débit) et **Écrêtage des crêtes** ; *Réinitialiser la sortie* les remet.

**Une recette conservatrice pour le russe** (celle de Viktor, à l'oreille) : Composition *bas*, Interprétation *bas*, Influence du style *élevé* : le planificateur de partition à température 0.85, top-p 0.92, top-k 40, les jetons musicaux à 0.85, 0.93, 80, les pénalités de répétition 1.005 et 1.3 sur une fenêtre de 100, guidage (CFG) 1.8 ; 32 pas de débruitage avec Midpoint. Pas d'accélération, du rap à un rythme modéré. C'est le profil intégré *Russe · conservateur (de Viktor)*.

### Créer une partition ABC, et Générer <!-- #create-abc-score-and-generate -->

- **Créer une partition ABC** écrit la partition et s'arrête : lis-la, modifie-la, puis *Générer* rend exactement cette partition. Une partition déjà dans le champ est écrasée, après une question.
- **Sondes** et **Variations**, à côté de Générer : Sondes, c'est combien de sondes, la musique réécrite dans chacune, une graine musicale chacune (graine, graine + 1…) ; le moteur en écrit autant à la fois que son lot le permet, le reste en passes suivantes. Variations, c'est combien de fois le son de chaque sonde est rendu à partir de sa seule musique, une graine sonore chacune, la même pour chaque sonde : chacune coûte à peu près le temps d'un son, presque pas de mémoire. Sondes × Variations prises en sortent : 2 × 4 = 8.
- **Générer la chanson** lance tout. L'exécution montre ses étapes au fur et à mesure.

### Babel dans la partition <!-- #babel-in-the-score -->

![Le moteur a arrêté une exécution dont la partition n'était pas une partition](guide/babel.png)

Quand la moitié musique écrit du charabia en guise de partition (des adaptateurs poussés au-delà de leurs limites font ça : pas de tonalité, pas de mesure, des deux-points à la chaîne), le **moteur arrête l'exécution avant qu'aucune musique ne soit faite dessus**, en secondes au lieu de minutes. La fenêtre dit pourquoi, quels adaptateurs ont pesé sur la moitié musique et de combien au-delà de leurs limites, montre ce qui a été écrit, et peut ramener les forces musique dans le vert d'un seul clic.

### La prise <!-- #the-take -->

![Une prise : télécharger, refaire, post-production, fichiers](guide/take-head.png)

- **L'en-tête** : ▶ et les boutons de la prise sur sa première rangée (👍 👎 ☆, le Bibliothécaire, renommer, supprimer), et au bout ⇆ et ⤡, qui détachent un cadre au-dessus de la salle ; le titre dessous sur une ligne ; comment elle a été faite sous celui-ci.
- **Télécharger** : WAV, FLAC (les mêmes échantillons, environ trois quarts de la taille), MP3 au débit que tu choisis.
- **Refaire** : *Reprendre* (une nouvelle prise à partir de la même requête), *Reprendre comme base* (la requête de retour dans le formulaire), *Re-rendre le son* (la même musique, un nouveau son), *Régénérer depuis…* (garder le début, réécrire la suite), *Transcrire cette prise*, *Couper au texte* (couper une queue après la dernière ligne chantée), *Finir à…* (la prise finissant au moment que tu choisis, ses 2 dernières s en fondu ; depuis ses latents gardés, en quelques secondes), *Fondu d'entrée…* (ses premières secondes montant du silence, 2 s sauf si tu dis autrement ; de la même façon).
- **Affineur** : *Spectre*, *Contrôle des paroles*. **Fichiers** : la requête et la partition. *Boucle…* : 1, 2, 4 ou 8 mesures sur les barres de mesure de la partition depuis la mesure où se trouve le lecteur, sans couture (sa fin rejoint son début), enregistrée en WAV nommé avec son tempo et sa tonalité.
- **Note** : ce qui marche, ce qu'il faut corriger, où elle va.
- La carte en dessous dit comment elle a été faite : mode, format, VAE, modèle, étapes, la forme, les curseurs, les LoRA avec leurs forces, les deux graines (copie-les pour la refaire).
- **Au-dessus de la salle** (⤡) la prise se tient en deux colonnes : ce qu'on peut en faire, son Style et ses paroles à gauche ; comment elle a été faite, son VAE et sa partition à droite. Une nouvelle prise s'ouvre avec son Style et ses Paroles repliés ; les outils se tiennent en groupes encadrés.

![Comment une prise a été faite](guide/take-info.png)

### La partition <!-- #the-score -->

Le plan de la prise en portée ou en ABC : imprime-le en PDF (US Letter, portrait ou paysage), exporte du MIDI ou des marqueurs, *Modifier et re-rendre*, ou ouvre-le en plein écran.

## Écrivain <!-- #writer -->

### Les chansons comme documents <!-- #songs-as-documents -->

![L'Écrivain](guide/studio-writer.png)

Chaque chanson peut vivre dans l'Écrivain comme un document : son **style**, ses **paroles**, ses **notes** (Markdown, avec un aperçu) et ses **paramètres** (chaque réglage du formulaire du Créateur). *Nouveau*, *Depuis le Créateur* (le formulaire tel qu'il est), *Charger dans le Créateur*.

- **Versions** : *Garder cette version* à tout moment ; *Restaurer cette version* ou la prendre *Comme nouveau document*.
- **La largeur de la liste** : fais glisser le bord entre la liste et le document (← → au clavier, un double clic pour sa propre largeur).
- **Prises faites à partir de lui** : chaque prise dont la requête est venue de ce document.
- **La chanson maintenant** : titre, style, la tonalité, la mesure et le tempo de la partition (le style doit s'accorder avec eux), les paroles ; *Modifier dans le Créateur*.
- **Tout exporter** (le disque) et **Importer** (le dossier) : tout le carnet dans un fichier pour une sauvegarde, chaque document avec ses versions, les prises faites à partir de lui et la corbeille ; une importation fait entrer ce qui manque, laisse tranquille ce qui est identique et met un document qui diffère à côté de son homonyme comme copie : rien n'est écrasé.

### Profils de texte <!-- #text-profiles -->

Comment un texte collé devient prêt à lire : des règles de remplacement dans l'ordre (littérales ou expressions régulières), puis la forme (`[Intro]`, `[Verse]` aux lignes vides, `[Interlude]` après les longs paragraphes). *+ Règle*, puis **Essaie depuis Paroles** montre ce qui en sort avant que tu enregistres.

### La salle d'écriture <!-- #the-writing-room -->

![La salle d'écriture : un modèle de chat rédige, tu décides](guide/writer-room.png)

Un modèle de chat lit ton style, tes paroles et ta partition, puis les rédige ou les révise. **Rien ne change tant que tu ne l'appliques pas.**

- **De quoi parle la chanson ?** ou ce qu'il faut changer ; **Aide-moi pour** le style, les paroles ou les deux ; **Structure** : l'ordre des sections pour de nouvelles paroles.
- Le modèle : un serveur de chat local (vLLM, LM Studio, Ollama : tout ce qui a un point d'accès chat `/v1`, réglé dans Moteur) ou n'importe quel modèle OpenRouter avec sa clé d'API. Son champ propose toute la liste d'OpenRouter pendant la frappe, chaque modèle avec son prix par million de jetons en entrée et en sortie et son contexte ; le prix de celui choisi s'affiche sous le champ, et un nom que la liste ne connaît pas est signalé.
- *Créer un brouillon*, puis **Appliquer le brouillon**, **Utiliser les paroles** ou **Utiliser le style** ; *Annuler* revient en arrière.

## Affineur <!-- #refiner -->

### Après le rendu <!-- #after-the-render -->

![L'Affineur : la prise à droite, les étapes en rangée](guide/studio-post.png)

Choisis une prise à droite ; les outils travaillent sur elle, ou sur un de ses stems. La colonne de droite contient **les prises affinées ici**, la plus récemment affinée en premier (*Affinées* à côté de *Favoris* la passe à toutes les prises, pour en commencer une nouvelle), et après un rechargement la salle revient à la prise qu'elle affinait.

Tout ce qui est fait à partir d'une prise est suspendu à son **arbre** (*Fait à partir de cette prise*), le plus récent en haut : **l'original** d'abord, avec son lecteur et son FLAC, puis chaque branche, jouable et utilisable comme source pour l'étape suivante. Ce qui tourne s'affiche là où tu regardes : dans l'en-tête de la salle, en haut du bloc propre de l'étape, et en point qui bat sur son onglet. Le bloc de chaque étape liste ce qu'elle a fait pour la prise (*Fait ici* : un clic le trouve dans l'arbre), et l'étape ouverte éclaire ses propres branches.

**Tout comparer** (sur la rangée de l'original, ou *Comparer* sur n'importe quelle branche) ouvre chaque version dans un seul lecteur, comme SUNO passe d'une version à l'autre : l'original, l'antibourdon, les remasters, les suréchantillonnages, les stems. Un clic sur une autre version, ou son numéro (1–9), la joue **à partir de la même seconde** ; Espace joue et met en pause, ← → avancent de cinq secondes, Échap ferme. La même musique dans d'autres prises y figure aussi, après l'original : ses re-rendus avec un autre VAE ou une autre graine sonore, chacun nommé par son VAE, sa graine et le moment où il a été fait ; une prise que tu n'as pas aimée est laissée de côté.

### Importer une piste <!-- #import-a-track -->

WAV, FLAC, MP3… de n'importe où : elle devient une prise dans la bibliothèque (48 kHz, 24 bits), marquée *importée*, prête pour les stems, le remaster et le reste. Les paroles sont facultatives ; le contrôle des paroles se compare à elles.

### Les étapes et la chaîne <!-- #the-steps-and-the-chain -->

![La chaîne et les étapes](guide/post-steps.png)

La **chaîne** fait tourner plusieurs étapes d'un coup : *Antibourdon → Suréchantillonnage → Stems → Remastering → Suréchantillonnage*, puis l'une de *Défauts*, *Spectre*, *Paroles*. Les stems sont séparés de la prise passée à l'antibourdon (et suréchantillonnée) et le remaster les mixe, si bien que son préréglage et son de-esser travaillent aussi dans la chaîne ; le premier suréchantillonnage fait entendre toute la chanson aux séparateurs, le dernier redessine le haut que les stems et le remaster laissent (un souffle au-dessus de 20 kHz, presque rien au-dessus de 22). Les stems sont quatre sauf si tu choisis autrement. Une par une :

1. **Spectre** : spectrogramme, spectre moyen, énergie par bande ; superpose une autre prise pour comparer.
2. **Défauts** : une note qui ne part pas, le bourdonnement de 25 trames du VAE dans les aigus, des clics, de l'écrêtage, des trous, une stéréo qui se combat elle-même. Un temps se joue à partir de là.
3. **Antibourdon** : le décodeur de YuE2 écrit le son en trames de 1920 échantillons, 25 par seconde, et ses aigus tremblent avec elles. Ceci retire la partie calée sur cette horloge de trames au-dessus de 2 kHz. 80 % est le choix de l'oreille ; 100 % amincit l'attaque.
4. **Paroles** : Whisper écoute et compare ce qu'il entend à tes paroles, minute par minute ; *Caler les lignes* pour le minutage karaoké. Sur le stem vocal, il entend les mots sans la musique.
5. **Stems** : quatre stems (BS-Roformer pour la voix, puis htdemucs_ft pour la batterie, la basse et le reste ; l'instrumental aussi), ou voix + instrumental. *Source*, c'est la prise ou un fichier d'elle passé à l'antibourdon ou suréchantillonné, chaque source avec son propre jeu ; ta DAW reçoit le jeu le plus récent de chaque sorte.
6. **Remastering** : mixe les stems ou prends la prise ; nettoyer, de-esser, éventuellement réaccorder 440 → 432 Hz, sonie (LUFS) et true peak. Chaque exécution est une nouvelle branche. Le préréglage et le de-esser travaillent sur les stems avant qu'ils soient mixés : avec la prise ou n'importe quel fichier unique comme source ils sont désactivés, et dans la chaîne ils travaillent quand elle sépare des stems.
7. **Suréchantillonnage** : UniverSR redessine le haut du spectre ; l'original reste échantillon pour échantillon sous la coupure. Sur un remaster (la dernière étape de la chaîne), tout le fichier est baissé si le nouveau haut dépasse le plafond true-peak du remaster.

## Peintre <!-- #artist -->

La salle qui peint : une pochette pour chaque prise, un 16:9 pour sa vidéo, un 9:16 pour un short, à partir de tes mots, d'une image à toi, ou des deux. Le formulaire à gauche, la scène au milieu, la bibliothèque à droite.

### Des images pour tes chansons <!-- #pictures-for-your-songs -->

Écris ce que tu vois pour la chanson, en phrases : Krea 2 Muse et Qwen-Image lisent un prompt comme une description, pas comme une liste de tags. Mets d'abord ce qui est dans l'image, puis la lumière, les couleurs et la technique (huile, encre, photographie), et finis par *no text* quand tu ne veux pas de lettres dedans. **De la prise** met dans le prompt celui à partir duquel la prise en main a eu son illustration, ou un prompt fait de son titre et de son style, pour partir de là.

**Formats** : **1:1** (1280 × 1280) pour la pochette, **16:9** (1920 × 1080) pour une vidéo, **9:16** (1080 × 1920) pour un short. Les formats d'une même pression partagent leur graine, ils sortent donc en série : la même scène dans les mêmes couleurs, chacune composée pour son propre cadre plutôt qu'une image coupée de trois façons. **Variations** dessine aussi les graines suivantes (la graine, la graine + 1, …), chacune dans chaque format.

**Graine**, avec son mode à côté : **Aléatoire** (−1 : une nouvelle graine à chaque pression, le champ vide), **Aléatoire, fixée** (une graine au hasard posée aussitôt et gardée), **Fixe** (celle qui est écrite), **Suivante** et **Précédente** (après une pression, le champ passe au-delà des graines utilisées par ses variations). Un nombre tapé dans le champ est cette graine (Aléatoire devient Fixe) ; un champ vidé, c'est une nouvelle graine à chaque pression (Fixe devient Aléatoire) ; ⟲ revient à Aléatoire. La graine d'une image que tu as aimée la redessine : chaque exécution montre sa graine, et **Vers le formulaire** la ramène avec le prompt.

**Trois colonnes** : le prompt et ses réglages à gauche, la scène au milieu (l'exécution en cours de peinture s'y développe, sa progression en travers du haut ; sinon l'image que tu as choisie, ses boutons dessous, les données et le prompt de son exécution dans une bulle à côté, au-dessus de la bibliothèque, tant que le pointeur est sur l'image), la bibliothèque à droite ; fais glisser les bords entre elles pour élargir une colonne (← → au clavier, un double clic pour sa propre largeur). Les choix de la colonne s'étirent avec elle, jamais plus étroits que les noms des peintres. Dès une fenêtre de 920 px de haut, la salle y tient en entier : la page reste immobile, le formulaire et la bibliothèque défilent chacun de leur côté, et la rangée de Dessiner reste au pied du formulaire.

**Aperçu en direct** (activé par défaut) : la place de l'image en cours de peinture montre chacune de ses étapes, du bruit à l'image, au huitième de sa taille et vue sans le décodeur, donc sans aucun coût ; désactivé, la place attend l'image finie. Une barre en travers du haut de la scène suit l'exécution, image par image et étape par étape.

**Deux exécutions à la fois** : pendant que l'une tourne, **Dessiner** demande la suivante, qui attend derrière elle (Ctrl+Entrée aussi) ; **Arrêter**, à côté de Dessiner pendant qu'une exécution tourne, termine celle qui dessine (sinon celle qui attend quitte la file) ; les images qu'elle a finies restent.

### Les peintres <!-- #the-painters -->

**Krea 2 Muse** de Stable Yogi, un fine-tune de Krea 2 Turbo (Krea 2 Community License) : **Q4** sur une carte avec 12,5 Go libres, **Q8** (plus fin) avec 18,5 Go. Modèle Turbo, il peint en ses propres quelques étapes sans guidage : environ 35 s par image en 1:1 et 47 s en 16:9 ou 9:16 sur une RTX 3090, et son chargement environ 25 s de plus par pression.

**Qwen-Image 2512** (Apache-2.0) depuis un GGUF en **Q4** (une carte de 15,5 Go) ou **Q6** (20 Go), ou un **fine-tune fp8** de lui (22,5 Go : les fichiers uniques de ComfyUI posés dans `artwork/Qwen-Image-2512/checkpoints/`, choisis sous le peintre) ; environ une demi-minute par image avec Lightning, après une minute ou deux de chargement. **Qwen-Image 2.1**, sous la licence de recherche de Qwen (recherche et évaluation seulement : pas pour une pochette que tu vends), peint à partir de mots et modifie une image de référence selon les mots du prompt ; un masque et *Peindre autour* veulent Krea 2 ou Qwen-Image 2512. Sur une carte qui ne contient entier ni son encodeur de texte ni son peintre (une carte de 16 Go, ou une carte sous une limite de VRAM plus basse), les deux défilent depuis la RAM : sous une limite de 15.5 Go sur une 3090, 135 s à partir de mots avec 4.1 Go au pic, 129 s pour une modification avec 7.9 Go.

Chaque peintre n'apparaît que quand ses fichiers sont là ; les autres sont nommés sous le peintre. **Moteur → Modèles et LoRA → Peintres Qwen** récupère Qwen-Image 2512 en Q4 (31 Go) ou Q6 (34,5 Go) avec Lightning, et Qwen-Image 2.1 (33,1 Go), chacun demandé d'abord avec sa taille (2.1 avec sa licence aussi). Depuis un terminal : `heresy/fetch-heresy.sh --qwen 2512-q4`. **Récupérer peintres et adaptateurs…** sous le peintre liste dans la salle même ce que le studio peut récupérer pour le Peintre : Krea 2 Muse, les peintres Qwen, quatre fine-tunes fp8 de Qwen-Image 2512 (Jib Mix Qwen, IntoRealism Qwen, Real-Qwen-Image et 2512 lui-même, 20,4 Go chacun, partagés dans le dépôt de modèles du studio avec l'accord de leurs auteurs) et sept adaptateurs, chacun avec sa taille, ici ou **Récupérer**.

**Quelle carte peint** : une pression attend dans la file du labo une carte avec de la place, comme le font les illustrations des prises et les stems ; pendant qu'elle attend, **Hors de la file** la reprend. Une carte que rien d'autre n'utilise prend une exécution dont le besoin tient dans sa mémoire moins 512 Mio (la part propre du runtime CUDA) ; une carte occupée la prend quand sa mémoire libre contient le besoin. Un peintre Qwen-Image 2512 ou Krea 2 Muse qu'aucune carte ici ne peut tenir entier diffuse plutôt ses blocs depuis la RAM : les blocs qui tiennent restent sur la carte, le reste arrive à mesure des besoins, et l'image est la même, plus lente de ce que le bus ne peut cacher (avec quatre adaptateurs sur une carte de 24 Go, environ un sixième ; tous les blocs diffusés, le Q4 prend 2,2 Go de la carte, donc une carte de 8 Go le peint) ; un autre peintre qu'aucune carte ne peut tenir est refusé aussitôt, avec les chiffres et le peintre qui tiendrait. Qwen-Image lit le prompt avec son encodeur de texte (Qwen2.5-VL-7B, 15,5 Go) sur la carte quand la place libre là-bas le contient, sinon sur le processeur, avant que le peintre arrive : l'image est la même dans les deux cas.

**Le filtre de contenu** : chaque image passe le filtre que demande la licence de Krea 2, quel que soit le peintre (la règle du studio pour chaque peintre) : une image qu'il signale n'est pas gardée, et l'exécution le dit.

### Lightning <!-- #lightning -->

**Ce que c'est** : Lightning (lightx2v, Apache-2.0) est un adaptateur qui apprend à Qwen-Image 2512 à peindre en peu d'étapes sans guidage : le long chemin guidé propre au modèle distillé en 8 étapes. Son fichier vit dans `artwork/Qwen-Image-2512/lightning/` (`Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors`, 0,85 Go) et vient avec la récupération des peintres Qwen.

**Comment le studio le pose** : avec Lightning activé, le peintre le charge comme un adaptateur de plus sous tes propres LoRA, à sa force : **1.0** pour les GGUF Q4 et Q6 (la base dont il a été distillé, aux 8 étapes que donnent ses auteurs) et **0.55** pour un fine-tune fp8, à 12 étapes (un fine-tune s'est éloigné de la base, et Lightning à pleine force le ramènerait en arrière ; le réglage de Viktor lui-même dans ComfyUI). Le planning devient celui de Lightning : un décalage de log 3 à toute taille, comme il a été entraîné. Le guidage est coupé (true CFG 1) : un passage du modèle par étape.

**Désactivé**, le peintre prend le chemin propre de 2512 : 30 étapes par défaut (10 à 60) et un **guidage** de 4 (true CFG avec son négatif vide : deux passages par étape). Soixante passages contre huit : la peinture elle-même prend environ sept fois plus de temps, le chargement autant, et donne le détail et la lumière d'un réalisme fini.

**Ses valeurs par défaut** : les GGUF Q4 et Q6 peignent avec (brouillons, cartes plus petites) ; un fine-tune fp8 peint sans, sauf si tu l'actives (réalisme fini) ; l'illustration propre d'une prise est peinte avec (*Moteur → Illustration*). La règle derrière : Lightning pour les brouillons et les pochettes, pas pour le réalisme professionnel.

**L'interrupteur** : dans Échantillonnage, avec sa force à côté ; activé, les étapes vont de 4 à 16 et Guidage se cache ; désactivé, Guidage s'affiche. Sans son fichier il n'y a pas d'interrupteur, et 2512 peint à sa façon. Krea 2 Muse n'en a pas : modèle Turbo, ses quelques étapes sont les siennes. La force est gardée pour chaque peintre ; la somme de tes adaptateurs (*Ensemble*, plus bas) ne compte pas Lightning.

**Ce qu'il coûte** : sur une RTX 3090 en 1328 × 1328, Qwen-Image 2512 avec Lightning peint en environ 30 s par image en Q4 (14,3 Go au pic) et 32 s en Q6 (17,6 Go) ; un fine-tune fp8 à 0.55 et 12 étapes en 37 s (21,0 Go). Une pochette de prise avec Lightning a pris environ une minute et demie avec le chargement et le prompt.

### Échantillonneurs et plannings <!-- #samplers-and-schedules -->

**Échantillonnage** sous le peintre, replié, ses valeurs dans son résumé : les étapes, l'échantillonneur et le planning, gardés pour chaque peintre ; **Réinitialiser** rend ceux du peintre. Les étapes : Krea 2, et Qwen-Image 2512 avec Lightning, 4 à 16 ; sinon 10 à 60 ; un nombre hors plage est tenu à son bord. L'estimation de temps du formulaire compte les passages de l'échantillonneur.

**Les échantillonneurs** : à chaque étape le modèle dit de quel côté se trouve l'image ; l'échantillonneur décide comment y aller.

- **Euler** : un passage par étape, le pas simple ; la référence, et celui avec lequel Lightning a été distillé.
- **Euler SDE** : Euler avec un peu de bruit neuf à chaque étape : plus de grain, un peu moins fidèle.
- **ER-SDE** : un solveur stochastique du troisième ordre (ER-SDE-Solver-3), un passage par étape, les deux étapes précédentes gardées : plus fin qu'Euler pour le même temps.
- **RES 2s** et **RES 3s** : les méthodes à un pas du solveur exponentiel raffiné, deux et trois passages par étape, la moitié du bruit remise après chacune ; leurs jumeaux **ODE** n'en remettent pas, donc une graine peint une image, la plus proche du chemin exact.
- **Heun++** (heunpp2) : trois passages par étape quand il le peut, deux, puis un à la fin.
- **Heun exponentiel** (exp_heun_2_x0, et sa variante SDE) : une méthode exponentielle du second ordre, deux passages par étape ; la SDE remet le bruit.

Un échantillonneur à deux ou trois passages par étape coûte deux ou trois fois le temps d'Euler aux mêmes étapes ; aux 8 étapes de Lightning les ordres supérieurs changent le détail, pas la composition. Face au chemin exact d'un flux jouet à 8 étapes, ils se classent comme le disent leurs ordres : Euler 0.138, Heun++ 0.111, Heun exponentiel 0.084, RES 2s 0.058, RES 3s 0.046 (l'erreur : plus bas, c'est plus proche).

**Les plannings** disent où les étapes sont dépensées, de tout bruit à aucun :

- **Simple** : uniformément dans le temps propre du peintre, son décalage gardé.
- **Karras** et **Exponential** : plus d'étapes à faible bruit, pour le détail.
- **Beta** et **Beta 57** : denses aux deux bouts, clairsemés au milieu (Beta 57 avec 0.5 et 0.7).
- **KL optimal** : l'espacement qu'Align Your Steps a trouvé optimal.
- **SGM uniform** : uniforme dans le temps, la dernière étape abandonnée.
- **Bong tangent** : deux pentes en arc tangente, de tout bruit à la moitié et de la moitié à aucun.

**Ce qu'ont montré deux matrices** (54 images via un labo de test, un prompt, une graine) : chaque échantillonneur et chaque planning a peint une image entière sur Krea 2 Muse. Sur Qwen-Image 2512 **avec Lightning, Karras, Exponential et KL optimal peuvent peindre le sujet deux fois** (deux phares là où un était demandé) : avec Lightning garde Simple, Beta, Beta 57, SGM uniform ou Bong tangent. **Sans Lightning, Euler SDE peint Qwen doux et brumeux** : Euler, ER-SDE ou RES gardent le détail. Le formulaire dit les deux quand ils s'appliquent.

**D'où ils viennent** : écrits pour le studio à partir des articles des méthodes et des formules de ComfyUI (GPL-3.0, que l'AGPL du studio peut reprendre) ; ceux de RES4LYF ont été lus pour leurs mathématiques seulement, car sa licence interdit les services commerciaux : aucune ligne de son code n'est ici ; Heun++ est de Carzit (MIT).

### Régions <!-- #regions -->

**Régions** sous *Échantillonnage*, repliées : jusqu'à trois parties du cadre, chacune avec une place (une moitié, un tiers, un quart ou le milieu ; une petite carte à côté montre où) et ses propres mots. À chaque pas, le peintre est interrogé une fois de plus pour chaque région, avec le prompt et les mots de la région, et ses réponses se mêlent par des cadres aux bords doux, comme le fait Latent Couple ; le reste du cadre suit le seul prompt. Ainsi le prompt dit toute la scène et une région ce qui s'y tient : *deux animaux dans une clairière enneigée*, puis *un renard roux* dans la moitié gauche et *une chouette blanche sur une souche* dans la droite. Chaque région coûte une passe entière de plus par pas (sur une 3090 en 16:9, Krea 2 Q4 : 48 s sans elles, 137 s avec deux régions ; Qwen-Image 2512 fp8 : 141 et 281 s). Gardées dans ce navigateur ; une région sans mots n'est pas envoyée ; **Encore** peint avec celles de sa propre exécution. Krea 2 et Qwen-Image 2512 ; Qwen-Image 2.1 modifie par les mots et peint sans elles.

### Adaptateurs <!-- #adapters -->

**LoRA** sous le peintre : les adaptateurs de sa famille (Krea 2, Qwen-Image 2.1, Qwen-Image 2512, SDXL), jusqu'à quatre, chacun à sa force (0 à 1.5) ; un clic sur l'un de ses mots déclencheurs le met dans le prompt. **Ajouter…** ouvre la bibliothèque : les dossiers à gauche, les cartes avec leurs images, une recherche. Les adaptateurs vivent dans `artwork/loras/<family>/` du studio (`krea2`, `qwen-image-2.1`, `qwen-image-2512`, `sdxl`) : tous les dossiers dedans deviennent des groupes, et une image à côté d'un fichier avec son nom (`NAME.jpg`, `NAME.png`, `NAME.preview.png`) s'affiche sur sa carte. Prends-les sur Civitai selon leur modèle de base (Krea 2, Qwen, SDXL 1.0) et mets les `.safetensors` là ; **Rechercher sur Civitai** envoie le SHA-256 de chaque fichier et rien d'autre, et garde la réponse à côté (`NAME.civitai.info` : son nom, son modèle de base et ses mots déclencheurs, et sa première image classée sûre quand il n'en a pas). Ce que le LoRA Manager de ComfyUI ou Stability Matrix a écrit à côté d'un fichier est lu aussi. Un adaptateur fait pour un autre modèle, qui n'atteindrait aucune couche du peintre, arrête l'exécution et le dit. Un clic droit sur la rangée d'un adaptateur le **rend muet** : il reste dans la liste à sa force et quitte l'exécution (**Réactiver le son** le ramène) ; un adaptateur à zéro n'est pas chargé non plus. Les sept adaptateurs que leurs auteurs permettent de partager viennent de **Récupérer peintres et adaptateurs…**.

**Ensemble** : à partir de deux adaptateurs, une barre dessous donne la somme de leurs forces sur la route du Créateur : vert jusqu'à 1.2, ambre jusqu'à 1.8, rouge au-delà. Les adaptateurs empilés s'additionnent, et au-delà d'environ 1.8 une image brûle (ses couleurs et ses bords exagérés) aussi modeste que soit chacun ; les zones sont une première mesure pour les images, à régler à l'œil. Fais glisser la barre pour les bouger tous à la fois, chacun en proportion de sa position.

### Une image à partir de laquelle peindre <!-- #a-picture-to-paint-from -->

**Image de référence** : une image à partir de laquelle peindre, en image à image : dépose-en une à sa place sous le prompt, colle-en une (Ctrl+V), choisis un fichier, ou prends l'image de la scène avec **Comme référence**. **Combien elle peut changer** dit à quelle distance d'elle la peinture commence : 0.3 la garde presque telle quelle, 0.6 garde sa composition et change sa matière, 0.9 peint la scène du prompt dans sa lumière et ses couleurs, 1.0 peint à neuf. Chaque format est couvert par l'image et découpé en son milieu ; **Encore** peint à partir de celle de l'exécution ; ✕ peint de nouveau à partir du bruit.

**L'utiliser** sous l'image dit comment : *pour peindre à partir d'elle* (comme ci-dessus, par le peintre du formulaire, aussi loin que le dit *Combien elle peut changer*), *pour la modifier par les mots* ou *pour son style seulement*, tous deux par Qwen-Image 2.1 quand elle est là (éteints sinon). Modifiée par les mots, la scène reste et le prompt dit ce qui change (*le même phare par une nuit d'hiver enneigée* : la neige est tombée où il fallait, la tour et les rochers gardés). Pour son style, la scène du prompt est peinte avec la technique, la touche, la palette et la lumière de l'image, sans rien de son sujet (le phare à l'huile a donné *un renard roux dans une forêt enneigée sous la lune* de sa touche). Dans les deux cas, l'exécution est celle de Qwen-Image 2.1 quel que soit le peintre du formulaire : le modèle, l'échantillonnage, les adaptateurs, le masque et la toile du formulaire ne sont pas envoyés, et sa licence (recherche et évaluation seulement) s'applique. Environ deux minutes par image sur une 3090.

**Masque…** à côté peint par-dessus l'image ce qu'il faut repeindre (Peindre, Effacer, le pinceau, Inverser, Vider) : le reste reste exactement comme il était, comme en inpainting. **Peindre autour** tient l'image entière au milieu de chaque format et peint les bords à neuf (une pochette carrée en un 16:9 ou un 9:16), comme en outpainting. **La pochette de la prise** prend la pochette de la prise choisie à droite. Avec un masque ou **Peindre autour**, quatre options sous l'image : **Étendre** (le masque agrandi de tant de pixels, ou rétréci), **Bord** (la douceur de son bord), **Doux** (un repeint doux, comme la diffusion différentielle : là où le bord est gris l'image ne change que dans les dernières étapes, donc pas de couture) et **Grain** (combien la partie gardée prend de la nouvelle peinture, son grain et sa lumière cousus au neuf ; 0 la garde exactement).

**Toile…** à côté de **Masque…** ouvre la toile, comme celle d'InvokeAI : le cadre de chaque format est un onglet en haut, qui dit comment il sera peint (**à partir d'elle** : l'image couvre le cadre et l'exécution peint à partir d'elle, en image à image à la force demandée ; **autour** : la partie du cadre qu'elle laisse à nu est peinte autour). Sur le plan de travail, **Déplacer** (V) fait glisser l'image, ou un coin pour la mettre à l'échelle en gardant le coin opposé ; **Pinceau** (B) et **Gomme** (E) peignent le masque d'inpainting par-dessus ; **Main** (H, ou Espace maintenu) déplace le plan ; la molette zoome, Alt+molette met l'image à l'échelle autour du pointeur, les flèches la décalent. À droite les calques (le masque avec **Inverser** et **Vider**, la référence avec son opacité sur le plan seulement) et sa place en chiffres (largeur, X, Y en part du cadre) ; en haut **Ajuster**, **Remplir**, **Centrer** et **Pareil partout** (l'image aussi grande en pixels dans les autres cadres), annuler et rétablir (Ctrl+Z). **Terminé** garde les places avec la référence et le masque dans le formulaire ; sous la force, le formulaire dit comment chaque format est posé, et ✕ le retire de la toile.

### La scène et la bibliothèque <!-- #the-stage-and-the-library -->

Un clic sur une image la met sur la scène avec son exécution dessous ; un clic sur l'image de la scène (ou un double clic sur une image) l'ouvre par-dessus la page dans son propre format (← → parcourent l'exécution, ou la galerie quand elle a été ouverte là ; Échap ferme), avec ★, **Vers le formulaire**, **Mettre en pochette** et **Télécharger** (PNG, taille réelle).

**Exécutions ou Galerie** : les exécutions montrent chaque pression sur Dessiner avec son prompt et sa graine, la plus récente en haut ; la galerie montre chaque image de chaque exécution dans une seule grille, la plus récente d'abord, par format (1:1, 16:9, 9:16) ou étoilée (☆ sur une image lui met une étoile), en trois tailles, en tuiles égales : colonnes égales, chaque tuile la même boîte, chaque image entière dedans.

**Comparer** : **Comparer…** de la scène, puis l'autre image choisie dans la bibliothèque : les deux se superposent sous un séparateur que tu fais glisser (← → le déplacent), ou côte à côte (S) ; X les échange, Échap ferme. **Ctrl** (ou ⌘) **+ clic** choisit des images et **Maj + clic** une plage : la barre de la bibliothèque leur met alors une étoile ou les met à la corbeille d'un coup (Échap relâche).

**Le menu d'une image** : un clic droit sur n'importe quelle image (celle d'une exécution, de la galerie, de la scène, celle par-dessus la page) : **Sur la page**, **Vers la scène**, **Vers le formulaire** (son prompt, sa graine et son format), **Tout vers le formulaire** (son peintre, son fine-tune, son échantillonnage et ses adaptateurs aussi : Dessiner repeint cette image), **Comme référence**, **Comparer…**, **Mettre en pochette**, **Suréchantillonner** (2K ou 4K, les tailles qu'ils donnent), **Mettre une étoile**, **La choisir**, **Copier le prompt**, **Copier la graine**, **Télécharger**, **Le fichier dans un nouvel onglet**, **Son exécution** (la vue Exécutions, sa carte éclairée), **À la corbeille**. Une exécution qui se développe sur la scène n'en a pas. Par-dessus la page, le menu se tient au-dessus de l'image et a les touches tant qu'il est ouvert : Échap ferme le menu, l'Échap suivant l'image.

### Suréchantillonnage <!-- #upscale -->

**Suréchantillonner…** sur la scène fait l'image en **2K** ou **4K** : son grand côté 2560 ou 3840 px (une pochette carrée 2560² ou 3840², un 16:9 2560×1440 ou 3840×2160), avec un suréchantillonneur (ESRGAN, DAT, HAT, SPAN et leurs cousins, lus par spandrel) choisi dans la rangée qui s'ouvre (gardé ; 4x_Nomos8kDAT en premier quand il est là) ; la bulle de chaque bouton dit la taille qu'il donne, et une image déjà aussi grande a le bouton désactivé. Le modèle tourne autant de fois que la taille le demande (deux fois au plus) et le résultat est amené à la taille exacte. La grande image est une exécution à part à côté de sa source, en moins d'une minute sur une 3090 ; **Encore** suréchantillonne à nouveau la même image, peut-être avec un autre modèle. Les suréchantillonneurs vivent dans `artwork/upscalers/` du studio (`.pth` ou `.safetensors`, dossiers permis) ; OpenModelDB en liste des centaines : fais attention à la licence de chacun.

**Seconde passe…** à côté repeint l'image en plus grand, comme le fait le workflow ComfyUI de Viktor après sa première passe : l'image agrandie **×1.5** ou **×2** (au plus proche voisin, comme chez lui) et repeinte par le peintre de sa propre exécution, son fine-tune, ses adaptateurs, son prompt et sa graine, à partir d'une partie du chemin (*Combien elle peut changer* : 0.3 garde le dessin et ajoute du détail, 0.5 affine sa matière, 0.7 repeint ses formes). Les pas, l'échantillonneur, le planning et Lightning sont ceux du formulaire quand il peint avec le même peintre, sinon ceux de l'exécution : sa recette donne à la seconde passe beaucoup de pas et pas de Lightning. Un 16:9 de 1920×1080 sort en 3840×2160. Mesuré sur une 3090 : Krea 2 Q4 en 2560² en 86 s (14.5 Go au pic), Qwen-Image 2512 fp8 en 3840×2160 en 220 s avec 12 pas et Lightning (22.9 Go). Pas pour Qwen-Image 2.1, qui modifie par les mots ; ni masque ni toile avec elle. **Bruit ajouté** dans sa rangée (0.6 d'abord, comme chez lui) et sous le *Combien elle peut changer* d'une référence (0 d'abord) est l'InjectLatentNoise de son workflow : du bruit frais sur l'image avant que la peinture parte d'elle ; 0.3 apporte du grain et du détail nouveaux, au-delà de 1 les formes de l'image commencent à se défaire.

### Une pochette pour la prise <!-- #a-cover-for-the-take -->

Une image carrée a **Mettre en pochette** : elle devient la pochette de la prise en main (choisis-en une à droite), dans sa carte, dans le lecteur et dans son MP3. La pochette qu'elle avait est gardée à côté de la prise (`artwork-removed/`), comme un redessin la garde, et l'autre lettre d'une paire A/B reçoit aussi la nouvelle quand elle n'en a pas.

**L'illustration propre d'une prise** (*Dessiner l'illustration* dans son menu, dans le Bibliothécaire, pour une prise ou plusieurs) est peinte par le peintre de **Moteur → Illustration** : selon les cartes (Krea 2 Muse Q4 à partir de 16 Go, sinon SDXL), ou celui que tu choisis : Krea 2 Muse Q4 ou Q8, SDXL CyberRealistic, et les peintres Qwen que cette machine possède : Qwen-Image 2512 Q4 ou Q6 et chaque fine-tune fp8 avec Lightning, Qwen-Image 2.1 avec sa licence énoncée (pas pour une chanson vendue). Un fine-tune choisi qui n'est plus là cède la place au choix des cartes, et l'illustration dit qui l'a peinte.

### La corbeille du Peintre <!-- #the-artist-s-trash -->

Les exécutions restent dans le dossier `artist/` du studio. **Corbeille** sur une exécution la déplace dans `trash/artist/` ; la **Corbeille** de la scène met une image de côté. La vue **Corbeille** à côté d'Exécutions et Galerie montre d'abord les images mises de côté, chacune avec **Restaurer** et ✕, et **Tout restaurer** ; puis les exécutions dans la corbeille, chacune avec **Restaurer** et **Supprimer définitivement** ; **Tout effacer** dans son en-tête supprime tout ce qu'elle montre. Chaque suppression demande d'abord et ne peut pas être annulée.

**Corbeille (illustrations)** dans la colonne du Bibliothécaire, sous Hors de vue, tient l'art rangé dans une seule liste : les exécutions du Peintre dans la corbeille, les images mises de côté, et les pochettes retirées des prises (par un redessin, par Retirer, par une nouvelle pochette), chacune avec son image et son poids. Coche-les pour les rendre (une pochette retourne à sa prise, celle qu'elle a maintenant étant gardée à sa place) ou pour les supprimer définitivement, après demande ; sans rien de coché, **Vider la corbeille des illustrations**. Les pochettes d'un espace gelé restent telles quelles.

### Le journal du Peintre <!-- #the-artist-s-log -->

Le cadre du journal du serveur a deux vues, **Serveur** et **Peintre**, et chaque salle ouvre la sienne : la salle du Peintre sur celle du Peintre. Le journal du Peintre, gardé dans ce navigateur (ses 400 dernières lignes), dit ce qui a été demandé (le peintre, le fine-tune, les formats, la graine, l'échantillonnage, les adaptateurs), ce que le labo a répondu (un refus dans ses propres mots), le chemin de chaque exécution jusqu'à sa fin (attend et pourquoi, peint sur le GPU N, terminé, arrêté, échoué et pourquoi), et les propres lignes du labo sur le Peintre. **Copier** prend les lignes de la vue ; replié, le cadre dit la dernière ligne de la vue. **⧉** ouvre le journal dans sa propre fenêtre, les deux vues en miroir : dans Chrome elle reste au-dessus de toutes les fenêtres (Document Picture-in-Picture) ; ailleurs c'est une fenêtre à porter sur un autre écran. La fenêtre porte les cartes en direct à côté du journal ; le cadre se replie pendant qu'elle est ouverte et se déplie quand elle se ferme, s'il était ouvert.

### Bientôt dans le Peintre <!-- #coming-to-the-artist -->

Le titre et le nom de l'artiste écrits sur une pochette ; les versions de l'image d'une prise ; SeedVR comme suréchantillonneur (avec la phase DAW, dans la 2.1.0).

## Bibliothécaire <!-- #librarian -->

### Chaque prise <!-- #every-take -->

![Le Bibliothécaire](guide/studio-collection.png)

- **L'en-tête** nomme la collection ouverte (*Bibliothécaire › Fosforida*) et ce qu'elle contient : prises, heures, j'aime, favoris, notes, comment elles ont été faites.
- **Espaces** à gauche : Tout, Favoris, Dans aucun espace, tes espaces, *+ Nouvel espace* ; Masquées et la Corbeille hors de vue. Clic droit sur un espace pour ses **verrous** (*Verrouiller la suppression de l'espace*, *Verrouiller la suppression des pistes*) : un 🔒 près de son nom, et rien de ce qu'il contient ne va à la corbeille. Les espaces 💎 (les jeux publics du studio) se tiennent au pied de l'arbre, par nom, et les 💎 … LoRA tout en bas.
- **Recherche** par mots, `*` et `?` ; **tri** plus récentes, plus anciennes, par titre, plus longues ; **Tuiles** ou **Liste** : les trois dans la ligne d'en-tête, à côté des comptes.
- **Une carte** porte l'illustration de sa prise dans son coin supérieur droit, à côté du titre, quand elle en a une (*Dessiner l'illustration* dans le menu de la prise) ; un clic montre l'image entière par-dessus le studio, où ‹ › et les flèches parcourent les images des cartes affichées, ▶ joue sa prise et Échap ferme. La carte qui joue brille avec les crêtes propres de la chanson.
- **Prises fraîches** : une prise que tu n'as pas encore jouée porte un léger trait pointillé ; sa première écoute l'enlève. Une prise régénérée porte un badge *régén* et garde sa note, son j'aime et son étoile.
- **La colonne des espaces** : fais glisser son bord pour l'élargir ou la rétrécir ; « la replie, et les cartes s'élargissent : leurs colonnes restent, l'œil garde sa place.
- **Sections** : un espace peut contenir des sections, sur deux niveaux au plus (⋯ à côté de son nom → *Nouvelle section…*), pour trier ce qu'il contient sans un nouvel espace à chaque fois. Un espace montre aussi les prises de ses sections. Tout ce dont l'Affineur fait quelque chose va tout seul dans la section *Affinées* de ses espaces.
- **Fais glisser une carte sur un espace** à gauche pour l'y déplacer (toutes les cochées, quand elle est cochée) ; maintiens **Ctrl** pour l'y ajouter en la gardant ici aussi. Le studio demande d'abord, et Ctrl+Z la rend.
- **Prises épinglées** : jusqu'à quatre dans chaque espace, dans une bande de leur propre ton au-dessus des cartes (clic droit sur une prise → *Épingler ici* ; × désépingle). Quand tu coches des prises, la barre des cochées prend la place de la bande, si bien que les cartes ne bougent jamais. Cette barre est une rangée d'icônes encadrées : le choix, les marques, les espaces, l'export, et la corbeille au bout ; chacune se dit au survol.
- **Filtre** (le bouton au bout de la rangée de recherche) ouvre une fenêtre comme le fait le sélecteur d'espace : coche ce qu'il faut chercher en trois groupes (comment elle a été faite : générées, importées, régénérées, re-rendues ; marquées : aimées, pas aimées, favoris, avec une note, avec illustration ; ce qu'elle a : stems, antibourdon, remastering, suréchantillonnage), chacun avec combien de prises du lieu, et comment les cochés se joignent : tous (AND), n'importe lequel (OR) ou aucun (NOR). *Afficher* les applique ; le bouton dit alors combien sont actifs et comment ils se joignent.
- **Sélectionne** plusieurs prises, comme dans un gestionnaire de fichiers : coches-en une, et dès lors un clic n'importe où sur une autre carte la coche aussi (Maj : toute la plage). Un glissement sur l'espace vide entre les cartes trace une bande qui coche ce qu'elle touche ; **Ctrl+glisser** la trace depuis n'importe où et garde ce qui était déjà coché. La barre des cochées flotte au-dessus du lecteur : favori, ajouter à un espace, déplacer vers un, sortir de celui-ci, masquer, exporter un ZIP, à la corbeille.
- **La corbeille** rend, ou efface après que tu as confirmé. **Corbeille (illustrations)**, à côté dans la colonne, tient l'art rangé (les exécutions du Peintre dans la corbeille, les images mises de côté, les pochettes retirées des prises) et le rend, ou le supprime définitivement après que tu as confirmé ; les pochettes d'un espace gelé restent.

### Le menu d'une prise <!-- #a-take-s-menu -->

![Clic droit sur une prise](guide/collection-menu.png)

**Régénérer avec une nouvelle graine** (au-dessus de l'Écrivain dans le menu de la prise) : la prise refaite à partir de tout ce avec quoi elle a été faite, mais avec de nouvelles graines ; la nouvelle prend les espaces et la note de l'ancienne, et l'ancienne attend dans la section *Sources des régénérations* de son espace (son espace ne la montre pas parmi les siennes) jusqu'à ce que tu la vides ; la nouvelle garde sa note, son j'aime, son étoile et son image. Une sonde sort de ses deux minutes pleines. Jouer, ouvrir dans le Créateur ou dans l'Affineur, la feuille (sa partition), la fiche technique (tout ce avec quoi elle a été faite : le style et les paroles, la partition dessinée, chaque réglage, les LoRA et les curseurs avec leurs forces ; une prise en Direct n'a pas de partition, et *L'écrire à partir du son* en demande une au transcripteur), j'aime, je n'aime pas, favori, une note, renommer, **espaces** (une prise peut se trouver dans plusieurs), **déplacer vers** un espace (sur une carte cochée : chaque prise cochée, hors de l'espace ouvert), masquer, envoyer à l'Écrivain, copier, télécharger, **exporter vers la DAW** (projet REAPER ou DAWproject, sur n'importe quelle prise : avec ses stems une fois que l'Affineur les a séparés), la corbeille. **Sur une carte cochée, avec d'autres cochées**, le menu agit sur toutes, et son en-tête dit combien : j'aime, je n'aime pas, favori, illustration, l'illustration retirée, espaces, masquer, un ZIP ; dessiner l'illustration pour plusieurs et en régénérer plusieurs demandent d'abord, car cela coûte des minutes de carte.

**Dessiner l'illustration** : un petit modèle de langage (Qwen3-4B) lit le style et les mots de la prise et écrit un prompt d'image ; Krea 2 Muse le peint, 1024 px, en environ une demi-minute sur une carte de 16 Go (sur une carte plus petite SDXL, CyberRealistic XL ; *Moteur → Illustration* choisit le peintre). Elle s'affiche dans le lecteur, sur la carte, dans le panneau multimédia du bureau, et dans le MP3 que tu télécharges (comme pochette). Une fois que la prise a son image, le menu dit *Ouvrir l'illustration* (par-dessus la page, comme un clic sur l'image de la carte ou sur le carré du lecteur) et *Redessiner l'illustration* (un nouveau prompt et une nouvelle image ; l'ancienne est gardée à côté de la prise, dans `artwork-removed/`). Les deux modèles viennent avec `heresy/fetch-heresy.sh --artwork` (14 Go, demandé d'abord). *Moteur → Illustration* propose ici aussi les peintres Qwen : Qwen-Image 2512 et ses fine-tunes fp8 avec Lightning, et Qwen-Image 2.1 (voir Peintre › Une pochette pour la prise).

### Les instruments sous le style <!-- #the-instruments-under-the-style -->

Sous le champ Style, le studio nomme ce que ton prompt demande : une pastille pour chaque instrument et style de l'aide-mémoire qu'il trouve, colorée selon ce que l'oreille a trouvé (vert entendu, ambre douteux, rouge pas joué sous ce nom) et portant l'image de l'instrument. Pose le pointeur sur l'une pour sa carte : l'image, son origine, son son, ▶ A et ▶ B avec leurs graines. Un clic montre l'image entière. **Alt+I** ouvre l'aide-mémoire de n'importe où.

### Illustration : ce qui la dessine, ce qu'elle ne peut pas, un autre peintre <!-- #artwork-what-draws-it-what-it-cannot-another-painter -->

**Ce qui la dessine.** Un petit modèle de langage (Qwen3-4B) lit le style et les mots de la prise et écrit un prompt d'image, son sujet en premier ; Krea 2 Muse le peint (1024 px), ou SDXL là où Krea ne tient pas (*Moteur → Illustration*). Quand la prise porte le nom d'un instrument (la sonde d'un instrument), le studio dit à la fois à quoi ressemble l'instrument et d'où il vient, et Omni (le modèle de l'écouteur) regarde l'image : quand il ne trouve pas l'instrument, il réécrit le prompt d'après ce qu'il a vu, et le peintre réessaie, trois images au plus. Environ une demi-minute par image sur une carte de 16 Go. Un peintre Qwen choisi là peint avec Lightning : en 1328 px, gardée à 1024.

**Ce qu'elle ne peut pas** (un avertissement, dit simplement) : le peintre dessine ce qu'il connaît. Un instrument qu'il n'a jamais vu par son nom (le doudouk, le morin khuur, le khomus, les bols chantants en cristal…) sort comme une supposition : un tuyau en bois, un violon, des bols de cuisine. Là où Omni n'a trouvé l'instrument dans aucune des trois images, l'image est marquée **≈ une supposition**, dans la superposition et dans l'aide-mémoire des instruments. Une illustration est l'humeur de la prise, pas une image de référence d'un instrument : pour savoir à quoi ressemble un instrument, cherche-le.

**Astuce de pro : un autre peintre.** Quand le peintre est SDXL (choisi dans *Moteur → Illustration*, ou sur une carte de moins de 16 Go), c'est le SDXL vers lequel pointe le lien `artwork/SDXL-Artwork-Model` ; le nôtre est `CyberRealistic-XL-v10`. Mets un autre finetune SDXL à côté, en dossier diffusers ou en un seul fichier `.safetensors` (comme Civitai les donne), et fais pointer le lien vers lui, en relatif :

```bash
cd artwork && ln -sfn MyFavourite-XL.safetensors SDXL-Artwork-Model
```

et pour revenir : `ln -sfn CyberRealistic-XL-v10 SDXL-Artwork-Model`. L'image suivante l'utilise, sans redémarrage. **Seuls les finetunes SDXL marchent** : SD 1.5, SD 3, FLUX et les autres familles sont refusés, et le studio dit ce qu'il a trouvé à la place. Un finetune Turbo, Lightning, Hyper ou LCM veut peu d'étapes et peu de guidage : quand son nom le dit, le studio le peint avec 8 étapes, guidage 2 et Euler ancestral. Pour n'importe quel peintre, un fichier à côté du lien fixe ses chiffres : `artwork/SDXL-Artwork-Model.json` avec `{"steps": 6, "cfg": 1.5, "sampler": "euler_a"}` (ou `"dpmpp"`, celui du studio).

## Entraîneur LoRA <!-- #lora -->

Éprouvé sur nos propres chansons et voix, l'entraîneur reste pour l'instant à 90 % : tes ensembles et tes scénarios ne sont pas les nôtres, alors dis-nous comment ça s'est passé (dans le dépôt, *Trainer report* : l'ensemble, le mode, les réglages, ce que tu as entendu).

### Ce qu'une LoRA apprend à YuE2 <!-- #what-a-lora-teaches-yue2 -->

Une LoRA est un petit adaptateur sur les deux moitiés. **Le style vient surtout de la moitié son ; suivre les paroles, de la moitié musique**, et la moitié musique apprend vite par cœur les petits jeux (sa perte tombe vers 0). Les sortes :

| sorte | données | ce qu'elle apprend |
|---|---|---|
| **Style** | 20+ chansons d'un même son | le genre, la production, le son d'un groupe |
| **Voix** | une voix, chantée ou parlée : chant (idéalement a cappella), lectures, livres audio | un timbre |
| **Langue** | beaucoup de voix, des paroles exactes | la diction d'une langue |
| **Artiste** | un catalogue large et varié | tout cela |

**Un adaptateur de voix apprend de n'importe quelle forme de la voix**, pas seulement du chant : les lectures et les livres audio marchent aussi. Mesuré ici (05.10.2026) : un adaptateur entraîné sur les lectures d'un acteur a parlé avec sa voix, et quand il chantait, il chantait avec sa couleur. Nomme un tel adaptateur par sa sorte (basse, baryténor, contralto…), jamais par une personne : `lab/voice_kind.py` mesure la voix d'un jeu à partir de sa hauteur parlée.

![L'Entraîneur LoRA : la télémétrie d'une exécution](guide/studio-train.png)

### 1 Le matériau <!-- #1-material -->

Mets un dossier de chansons dans `datasets/raw/` et choisis-le. Choisis quelles pistes entrent, donne à chacune ses paroles (trouvées à côté par leur nom quand elles existent) et, si elle en a besoin, un style à elle. Les pistes de moins de 30 secondes sont laissées de côté par défaut ; les longues vont bien (la moitié musique s'entraîne sur toute la chanson).

**Voix** : *Mesurer la voix* écoute jusqu'à douze pistes du dossier et dit, sur la parole, masculin ou féminin et le registre (basse, baryton, baryténor, ténor ; contralto, mezzo, soprano) avec la hauteur parlée, et propose un nom pour le jeu qui en est fait, comme les adaptateurs de voix publiés sont nommés (`voice-ru-m-baritenor-117`) : aucun nom de personne. Sur le chant, il donne l'étendue chantée et laisse la voix à ton oreille. Là où la hauteur seule ne peut trancher (140–175 Hz en parlé), dis ♂ ou ♀ et mesure à nouveau. Un brouillon par la mesure : l'oreille décide, et la voix que YuE2 chante ensuite peut se trouver plus haut ou plus bas.

### 2 Le jeu <!-- #2-the-set -->

Un **mot déclencheur** (un mot inhabituel, p. ex. `fosforida`) appelle le style par son nom plus tard ; la **ligne de style commune** dit ce qu'on entend. *Créer l'ensemble* écrit `datasets/prepared/NAME/` : un audio 48 kHz et une légende par piste.

L'**écouteur** (Qwen2.5-Omni, sur n'importe quelle carte avec environ 8 Go libres) écoute chaque piste et rédige ses tags ; tu les corriges et *Écrire dans les légendes*. C'est un brouillon à toute taille : lis-le.

### 3 Entraîner <!-- #3-train -->

![Une sorte, les réglages, une carte](guide/train-knobs.png)

Choisis un jeu fait à l'étape 2, puis une **sorte** : elle règle les réglages selon ce que tu enseignes (le tableau sous la liste), et chacun peut être changé avant *Entraîner*. Le formulaire, champ par champ :

- **Type** : style, voix, langue ou artiste.
- **Nom de l'exécution** : le dossier de l'exécution (`training/NAME/`) et les noms de ses adaptateurs (`loras/NAME/NAME-eNNN`, parmi les LoRA du Créateur aussitôt). Un nom appartient à une seule exécution : la page en demande un autre quand il est pris.
- **Entraîneur** : **Ruach Studio** (celui du studio, sur des poids bf16 non quantifiés ; il fait lui-même le cache latent du jeu ; mode Direct) ou **AI-Toolkit** d'Ostris (la référence ; il peut aussi entraîner avec une partition et sur des voix séparées). Les deux enregistrent le même format de LoRA ; sur le même jeu leurs courbes concordent époque par époque.
- **Poids de base** : bf16, le modèle entier (une carte de 24 Go), ou int8 pour les cartes plus petites, un peu moins exact. Le fichier du modèle de base ne change jamais : seul l'adaptateur apprend.
- **Pas** : combien en tout, une piste par pas. La moitié son entend une fenêtre de 60 secondes de la piste, coupée au hasard à chaque fois ; la moitié musique lit la chanson depuis son début. L'exécution est arrondie à des époques entières (une époque : chaque piste une fois) : 2016 pistes pour 12 époques font 24 192 pas.
- **Enregistrer toutes les N époques** : un adaptateur à la fin de chaque N-ième époque, chacun à écouter et à comparer, tous gardés, avec l'état de l'optimiseur à côté du plus récent (une exécution arrêtée garde ce qu'elle a appris).
- **Rang** : la largeur de l'adaptateur ; sa part des poids et sa taille sont dans la bulle du champ (ce que coûte chaque rang et lequel pour quoi : plus bas).
- **Taux d'apprentissage** : la taille de chaque pas de la moitié son (AdamW, le même pour toute l'exécution) ; celui de la moitié musique est celui-ci fois **Vitesse AR**. Les sortes gardent 0.0001 ; la moitié est plus douce, pour une longue exécution sur un grand jeu ; plus haut apprend plus vite et oublie plus.
- **Poids AR**, **Ancre AR (KL)**, **Vitesse AR** : les trois réglages de la moitié musique, plus bas.
- **Mode** et **Séparer voix et musique**, AI-Toolkit seulement : **Direct** est pour les chansons faites en mode Direct ; **Complet (partition)** et **Mélodie**, pour les chansons faites dans ces modes, apprennent aussi à la moitié musique à écrire d'abord une partition, transcrite de chaque chanson ; **séparé**, chaque chanson est d'abord séparée en voix et musique, et la moitié musique apprend aussi la voix à partir des seules paroles et la musique à partir des seuls tags.
- Sous le bouton : la VRAM mesurée des exécutions précédentes, et quelle carte est assez libre maintenant.

| sorte | rang | pas | poids AR | ancre AR | vitesse AR | pour quoi |
|---|---|---|---|---|---|---|
| **Style** | 32 | 1500 | 0.5 | 0.2 | 0.5 | un son : genre, production, celui d'un groupe |
| **Voix** | 16 | 1500 | 0.3 | 0.3 | 0.5 | un timbre : la moitié musique tenue près de la base |
| **Langue** | 32 | 3000 | 1.0 | 0.1 | 1.0 | la diction : la moitié musique faite pour changer |
| **Artiste** | 32 | 3000 | 0.7 | 0.2 | 0.7 | tout cela |

### Le rang et les autres réglages <!-- #rank-and-the-other-knobs -->

Le **rang** est la largeur du changement de l'adaptateur sur chaque matrice. Une LoRA adapte 224 matrices de YuE2, 112 par moitié ; chacune fait 2048 de large, 28 couches de profondeur, 1,41 milliard de poids par moitié. Ce que coûte un rang, mesuré sur ces formes :

| rang | des poids qu'il adapte | fichier, par moitié (bf16) |
|---|---|---|
| 16 | 1 % | 29 Mo |
| 32 | 2 % | 59 Mo |
| 64 | 4 % | 117 Mo |
| 128 | 8 % | 235 Mo |
| 256 | 17 % | 470 Mo |

- **Une voix, un instrument, un son** (20 à 50 chansons) : **16**, au plus 32.
- **Un style ou un artiste** (un catalogue varié) : **32**.
- **Un grand jeu de nombreuses voix** (des heures d'elles, un tag pour chaque voix) : **64**, et **128 au plus**, seulement quand 64 reste mesurablement court. L'entraîneur s'arrête à 128 : 256 changerait un sixième des poids qu'il touche, plus que n'importe quel jeu d'ici n'en a besoin.
- Le fichier du modèle de base ne change jamais. Le risque d'un grand rang, c'est l'adaptateur lui-même : à pleine force il oublie ce qu'on ne lui a pas montré (le chant, s'il a appris sur de la parole).
- **Pas** : la moitié musique apprend vite par cœur un petit jeu (sa perte tombe vers 0) : les époques vertes dans la Télémétrie sont celles à écouter en premier, souvent bien avant la dernière.
- **La fréquence d'échantillonnage du matériau** : la moitié son travaille à 48 kHz, la moitié musique écoute à 24 kHz. Un enregistrement à 24 kHz apprend tout à la moitié musique, mais seulement un haut terne à la moitié son : rééchantillonner n'ajoute rien au-dessus de la moitié de la fréquence d'origine. Pour un timbre, donne-lui du 44,1 ou du 48 kHz.

### Les trois réglages de la moitié musique <!-- #the-music-half-s-three-knobs -->

Chaque pas enseigne aux deux moitiés séparément. La moitié son apprend toujours le son : retirer le bruit de sa fenêtre de la piste (la perte de flux). La moitié musique n'apprend que quand **Poids AR** est au-dessus de 0, et alors deux choses tirent sur elle à la fois :

- **sa leçon** (ar_ce) : prédire les propres jetons de la chanson depuis son début, mot par mot et note par note : diction, phrasé, habitudes mélodiques, la forme d'une chanson ;
- **l'ancre** (ar_kl) : à chacun de ces endroits, l'entraîneur demande au modèle de base, la même moitié musique avec l'adaptateur coupé, ce qu'il écrirait là, et pénalise l'adaptateur pour chaque pas qui s'en éloigne.

La perte d'un pas est flux + poids AR × ar_ce + ancre AR × ar_kl. Ce que fait chaque réglage :

- **Poids AR** décide si la moitié musique apprend tout court, et avec quelle force sa leçon tire contre l'ancre. À 0 la moitié musique reste le modèle de base (sa part de l'adaptateur reste vide : tout à zéro, mesuré), l'adaptateur n'est qu'un timbre sur la moitié son, et l'ancre ne fait rien.
- **Ancre AR** ramène la moitié musique vers le modèle de base, pour qu'elle garde ce que le jeu ne montre pas : le chant après un jeu de lectures, d'autres langues, suivre de nouveaux mots, écrire une partition. Sans ancre elle dérive là où le jeu la mène.
- **Les deux tirent l'une contre l'autre, et seul leur rapport compte, pas leur taille.** AdamW met chaque pas à l'échelle de ses propres gradients récents, si bien qu'une perte multipliée par un nombre enseigne ce qu'elle enseignait avant : 0.5 avec une ancre de 0.2, c'est 1.0 avec 0.4. Lis l'ancre comme une part du poids : un dixième laisse bouger la moitié musique (Langue), autant que le poids la tient près de la base (Voix).
- **Vitesse AR** est le vrai accélérateur de la moitié musique : son taux d'apprentissage est le taux d'apprentissage fois celui-ci, le seul réglage qui fait apprendre la moitié musique plus vite ou plus lentement. Les sortes le gardent à 0.5 (Langue à 1.0) : la moitié musique apprend un petit jeu par cœur bien avant que la moitié son ait son timbre.

Mesuré ici (10.10.2026 : 40 pas sur un jeu de 60 lectures, rang 16, une graine ; *déplacé* : la taille du changement de l'adaptateur sur les matrices de la moitié musique) :

| poids AR · ancre · vitesse | déplacé | écart avec la première rangée | ar_kl, ses dix derniers pas |
|---|---|---|---|
| 0.5 · 0.2 · 0.5 (celui de Style) | 1.32 | la même exécution encore : 1 % | 0.257 |
| 1.0 · 0.4 · 0.5 (les deux doublés) | 1.36 | 5 % | 0.262 |
| 0.5 · 0 · 0.5 (sans ancre) | 1.44 | 23 % | — |
| 0.5 · 0.5 · 0.5 (l'ancre aussi grande) | 1.21 | 17 % | 0.132 |
| 0.5 · 0.2 · 1.0 (vitesse doublée) | 2.32 | 99 % | 0.443 |
| 0 · 0 · 0.5 | 0 | rien d'appris | — |

Doubler les deux a changé l'adaptateur de 5 %, contre 1 % pour la même exécution deux fois ; la part de l'ancre l'a déplacé d'un sixième à un quart ; doubler la vitesse l'a emmené trois quarts plus loin. La moitié son ne partage avec la moitié musique que l'écrêtage du gradient : entre les rangées elle a différé de 4 à 13 %, contre 2 % pour la même exécution deux fois.

Que tourner, selon ce que tu entends et vois :

| quand | tourne |
|---|---|
| tu veux seulement un timbre (une voix à partir de lectures, un instrument) | Poids AR bas avec l'ancre aussi grande (le 0.3 et 0.3 de Voix), ou Poids AR à 0 |
| tu veux la diction d'une langue, le phrasé d'un style | Poids AR 1.0, l'ancre un dixième, Vitesse AR 1.0 (ceux de Langue) |
| ar_ce tombe sous 0.3 tôt : il connaît les chansons par cœur | Vitesse AR en baisse, ou la part de l'ancre en hausse ; ou écoute une époque plus ancienne |
| l'adaptateur chante les airs des chansons d'entraînement sur de nouveaux mots, ou perd les paroles | la part de l'ancre en hausse : aussi grande que le poids, ou plus |
| ar_kl reste près de 0 et la diction n'est pas venue | Vitesse AR en hausse, ou la part de l'ancre en baisse |

### 4 Télémétrie <!-- #4-telemetry -->

![Les courbes des deux moitiés, expliquées sous chacune](guide/train-charts.png)

Les exécutions en cours d'entraînement se tiennent en haut de la salle avec leur progression, le temps restant et les deux pertes. La télémétrie d'une exécution montre sa progression, puis des tuiles : sa vitesse, le temps écoulé et restant, les dernières valeurs de flow, ar_ce et **ar_kl** (à quelle distance la moitié musique s'est éloignée du modèle de base : 0 tant que Poids AR est à 0), le pic de VRAM et la carte ; puis deux courbes :

- **Moitié son · perte de flux** : à quel point la moitié son prédit bien le bruit qu'elle doit retirer. Elle saute d'un pas à l'autre (chaque pas tire un niveau de bruit au hasard) : lis la ligne grasse, la moyenne glissante.
- **Moitié musique · ar_ce** : à quel point la moitié musique prédit bien les propres jetons de la chanson. Près de 0 elle connaît les chansons par cœur ; une époque plus ancienne est alors le meilleur adaptateur.

Survole une courbe pour lire le pas, son époque et la valeur à cet endroit. **Comparer avec…** superpose les courbes d'une autre exécution, en pointillé. Le bouton à côté de **Le journal** met les deux courbes l'une sous l'autre, chacune sur toute la largeur, ou de nouveau côte à côte. **Le journal** s'ouvre au pied de la salle, aussi large que ses lignes, à côté du journal du serveur.

### Les époques à écouter en premier <!-- #the-epochs-worth-hearing-first -->

![Vert : à écouter en premier ; ✓ : dans loras/](guide/train-epochs.png)

Chaque époque enregistrée est une pastille. Les **vertes** sont à écouter en premier, lues sur les courbes : la première époque dont la perte du son s'est posée, celle à la plus basse perte du son, et la dernière avant que la moitié musique connaisse les chansons par cœur. C'est une supposition ; l'oreille décide. Choisis une époque : **Dans loras/ → le Créateur** (elle apparaît aussitôt parmi les LoRA), **Hors de loras/**, ou **Télécharger**.

> **Un adaptateur entraîné sans partition (Direct) n'a sa place sur la moitié musique que dans les exécutions en Direct.** En Plan complet sa moitié musique peut casser la partition même à faible force : ne lui donne là que la moitié son.

### Exécutions <!-- #runs -->

![Chaque exécution, une carte](guide/train-runs.png)

Chaque exécution est une carte à droite : *Actives*, *Tout*, *Archivées*, *Corbeille*, avec recherche. Une exécution en cours d'entraînement est éclairée comme une prise qui joue. ⋯ sur une carte : sa télémétrie, son journal, l'archiver, l'arrêter, ou la supprimer dans la corbeille (on te demande si ses adaptateurs dans loras/ partent avec elle). De la Corbeille elle revient, ou part pour de bon.

## Moteur <!-- #engine -->

### La machine <!-- #the-machine -->

![Moteur](guide/studio-engine.png)

- **Serveur** : ce que fait tourner le moteur : le modèle, les décodeurs, le contexte, la bibliothèque.
- **Calcul** : la copie du **modèle** (BF16 7,2 Go, Q8_0 3,8 Go, Q6_K et Q5_K_M plus petits), le **Préréglage de mémoire GPU** (*Auto* ajuste le contexte et les tuiles VAE à la carte ; *Auto dans N Go* le fait pour cette quantité, le reste de la carte laissé à ce qui tourne d'autre dessus (sur un portable de 16 Go, 14) ; *Manuel* te les laisse), **Garder les modèles chargés**. **Analyser la machine** dit ce que la machine a et ce qui lui convient (le backbone, les réglages d'Auto, le peintre), comme un studio neuf le fait une fois à son premier démarrage.
- **Matériel** : la mémoire de la carte maintenant ; **Décharger le modèle** la libère aussitôt.

### GPU : quelle carte fait quoi <!-- #gpus-which-card-does-what -->

![Quelle carte fait quoi](guide/engine-gpus.png)

Sur une machine à plusieurs cartes, donne à chacune son travail : le **studio** (la synthèse) sur une carte, l'**entraînement** sur les cartes que tu lui donnes, les **tâches** du labo (l'écouteur, Whisper, stems, remaster, suréchantillonnage) sur les leurs. Pendant qu'une exécution s'entraîne sur la carte propre du studio, une synthèse attend, et la page dit pourquoi. Avec une seule carte, c'est ainsi : entraîner, puis créer. Une nouvelle carte pour le studio prend effet après un redémarrage (le bouton apparaît quand il faut). Les tâches du labo restent sur les cartes cochées pour elles, le Peintre compris : quand celles-ci sont pleines, une tâche attend l'une d'elles (Whisper passe au processeur) et ne prend jamais une carte non cochée pour le labo. Une exécution du Peintre va sur la carte où son peintre est gardé depuis l'exécution précédente, les poids déjà en RAM.

### Décodeurs, adaptateurs, curseurs, le modèle de l'Écrivain, l'apparence <!-- #decoders-adapters-sliders-the-writer-s-model-the-look -->

- **VAE**, **LoRA**, **Curseurs** : chaque fichier que le studio a trouvé, avec sa source et ce qu'il fait.
- **Modèles et LoRA** : ce que l'installation apporte, partie par partie (les décodeurs supplémentaires et les curseurs, Whisper, les modèles des stems, UniverSR, les LoRA), tel que sa dernière exécution l'a trouvé, et **Vérifier à nouveau** pour regarder à neuf. Une partie incomplète liste ce qui manque et a son **Récupérer** ; **Récupérer ce qui manque** les prend toutes ; un téléchargement interrompu reprend là où il s'est arrêté. **Plus de modèles** : un autre backbone (BF16 à côté de Q8_0), l'écouteur de style, le peintre du Peintre, la base de l'entraîneur, chacun avec ses variantes et ses tailles, une variante déjà ici signalée, chacun demandé d'abord avec sa taille. Un nouveau backbone, décodeur ou curseur atteint le moteur à son prochain démarrage (**Redémarrer le moteur**) ; les nouvelles LoRA aussitôt.
- **Illustration** : qui peint l'illustration d'une prise : selon les cartes (Krea 2 Muse Q4 à partir de 16 Go, sinon SDXL), ou un peintre choisi : Krea 2 Muse Q4 ou Q8, SDXL CyberRealistic, et les peintres Qwen que cette machine possède (Qwen-Image 2512 Q4 ou Q6 et chaque fine-tune fp8, avec Lightning ; Qwen-Image 2.1 avec sa licence énoncée).
- **Écrivain** : l'adresse du serveur de chat local (vLLM, LM Studio, Ollama), *Tester la connexion*.
- **Apparence** : 22 thèmes (choisis pour travailler : clairs et calmes), les coins, les trois polices (texte, titres, chiffres).
- **Journal du serveur** : le journal entier ; **À propos** : chaque projet sur lequel repose le studio, avec son lien.
- **Mises à jour** : les versions de Ruach Studio sur GitHub face à cette version : à quelle fréquence regarder (chaque jour, semaine, mois, jamais), les versions candidates aussi, et quand une sort, demander ou mettre à jour tout seul quand rien ne tourne (seulement là où le studio est un clone de son dépôt ; ailleurs il dit comment mettre à jour à la main). Un studio neuf, et chaque mise à jour, propose les jeux 💎 qu'il n'a pas encore.
- **Dossiers** : là où vit ton travail (les chansons avec les espaces récupérés sur Hugging Face, la corbeille, les images du Peintre, les documents de l'Écrivain), ce que chacun contient et la place restante sur son disque. **Déplacer…** en porte un vers n'importe quel dossier ou disque : le studio dit d'abord ce qu'il va faire (sur le même disque un renommage ; sur un autre une copie, vérifiée fichier par fichier, puis le lien changé) et ne déplace qu'après un second oui, pendant que rien n'est rendu ; l'ancienne copie reste, renommée, jusqu'à ce que tu la supprimes. **Ramener à la maison** ramène un dossier dans le dossier du studio ; **Relier à nouveau** fait pointer le studio vers un dossier dont le disque est revenu. Les modèles, les LoRA et les jeux d'entraînement gardent leur place.

## DAW <!-- #daw -->

**Expérimental.** La voie vers une DAW fonctionne et a été vérifiée, mais il lui faut encore des tests de plantage sur d'autres machines et projets, et plus de travail.

### Deux façons de sortir du studio <!-- #two-ways-out-of-the-studio -->

Le studio remet une chanson de l'une de deux façons, et de ces deux seulement :

1. **La piste mixée**, telle que le studio l'a faite et que l'Affineur l'a finie : WAV, FLAC ou MP3, sans DAW entre les deux.
2. **La prise entière dans ta propre DAW**, comme un projet de cette DAW : à partir de là, tout se passe hors du studio. Aucun audio et aucun projet ne revient : le studio ne lit pas le projet d'une DAW (REAPER peut lui donner ce dont une chanson est faite : ses mots et une mélodie).

**Exporter vers la DAW** ouvre ce choix : dans ☰, ou dans l'Affineur à côté de la prise en main. La page montre quelles DAW la machine propre du studio possède (REAPER, Waveform, Bitwig), avec leurs versions. Quand le studio tourne sur un autre ordinateur que ta DAW (un serveur à la maison, un portable en route), marque la tienne avec *J'utilise celle-ci*.

| DAW | ce que le studio lui donne | état |
|---|---|---|
| **REAPER** | son propre projet (.RPP) : le mix, les stems, la partition en MIDI, tempo et mesure, sections, paroles, la recette | prêt, vérifié par REAPER lui-même |
| **Waveform** (Tracktion), 14 ou plus récent | DAWproject : le mix et les stems, la partition en pistes de notes, les sections en marqueurs, tempo et mesure | prêt, vérifié par rapport au schéma du format |
| **Bitwig** | DAWproject, pareil | prêt, vérifié par rapport au schéma du format |
| **Studio One, Cubase** (Windows, macOS) | DAWproject, pareil | prêt |

### REAPER : installation <!-- #reaper-install -->

- **Linux** : depuis reaper.fm, l'archive *Linux x86_64* ; décompresse-la et lance `./install-reaper.sh` : il va dans `/opt/REAPER`, sans rien d'autre.
- **Windows, macOS** : l'installeur de reaper.fm.
- REAPER donne 60 jours avec toutes les fonctions, puis demande une licence (60 $ pour un usage personnel ou une petite entreprise).

### Le projet le plus complet : trois étapes d'abord <!-- #the-fullest-project-three-steps-first -->

Ce que porte le projet dépend de ce qu'a la prise. Pour tout avoir :

1. **Plan complet** quand tu fais la chanson : la partition devient les pistes MIDI et donne le tempo et la mesure. (Une prise en Direct n'a pas de partition : pas de MIDI ; le tempo vient de « NN bpm » dans le style, ou reste une valeur provisoire de 120.)
2. **Affineur → Stems** : chaque stem a sa propre piste (deux : voix et instrumental ; quatre : avec batterie, basse et le reste).
3. **Affineur → Contrôle des paroles** : Whisper minute chaque ligne ; les lignes arrivent sur la timeline et les sections ([Verse], [Chorus]…) deviennent des régions.

Aucune des trois n'est nécessaire : le projet prend ce qu'il y a et dit ce qui lui manquait.

### REAPER : exporter et ouvrir <!-- #reaper-export-and-open -->

1. Ouvre la prise (dans le Créateur, l'Affineur ou le Bibliothécaire), puis **Exporter vers la DAW → REAPER → Exporter la prise** ; ou clic droit sur n'importe quelle prise → **Télécharger → Projet REAPER**.
2. Le studio emballe la prise : l'audio en WAV 24 bits à 48 kHz, si bien qu'une chanson de sept minutes avec deux stems fait environ 350 Mo. Le navigateur enregistre `TITLE.reaper.zip`.
3. Décompresse-le n'importe où, en entier : `TITLE/TITLE.RPP` et `TITLE/audio/` restent côte à côte.
4. Ouvre `TITLE.RPP` dans REAPER (File → Open project, ou un double clic).

### Ce qu'il y a dedans <!-- #what-is-inside -->

| piste | ce que c'est |
|---|---|
| **Mix** | la chanson telle que le studio l'a rendue ; **en muet** quand il y a des stems, pour que les stems sonnent et que le mix attende comme référence |
| **Vocals**, **Instrumental** (ou Drums, Bass, Other) | les stems, chacun depuis 0 sur toute la chanson |
| **Score · Vocal**, **Score · Ins** | la partition en MIDI, une piste par voix. C'est la partition *telle qu'écrite* : la chanson telle que chantée peut s'en écarter. Elle ne fait aucun son tant que tu ne lui donnes pas un instrument (les FX de la piste : ReaSynth, ou n'importe quel VSTi) |
| **Lyrics** | chaque ligne des paroles comme un élément vide avec la ligne dans sa note, là où Whisper l'a entendue |

- **Régions** : les sections des paroles, de la première ligne minutée de chacune à la suivante.
- **Tempo et mesure** : depuis la partition (ses `Q:` et `M:`), sinon « NN bpm » dans le style, sinon 120 en 4/4 comme valeur provisoire ; les notes du projet disent laquelle.
- **Les notes du projet** (dans les réglages de projet de REAPER) : le titre, le style, les deux graines, le nom propre de la prise : le chemin de retour vers la prise dans le Bibliothécaire.

### REAPER : quand quelque chose semble faux <!-- #reaper-when-something-looks-wrong -->

| ce que tu vois | pourquoi | que faire |
|---|---|---|
| média hors ligne | le dossier audio n'est pas à côté du .RPP | décompresse tout le ZIP, garde `audio/` à côté du projet |
| pas de paroles, pas de régions | la prise n'a jamais été minutée | Affineur → Contrôle des paroles, puis exporte à nouveau |
| pas de pistes MIDI | une prise en Direct, ou une sans partition | fais-la en Plan complet, ou apporte ta propre partition dans le Créateur |
| le tempo indique 120 | la prise n'a pas de tempo à elle | règle-le dans REAPER, ou écris « NN bpm » dans le style la prochaine fois |
| le MIDI court devant ou derrière la voix | la partition est le plan, le chant son interprétation | utilise le MIDI comme esquisse, ou étire-le sur les stems |
| des paroles en hébreu ou en grec s'affichent en carrés | la police de REAPER n'a pas l'écriture | une police avec ces écritures dans le thème ou les préférences de REAPER |

### REAPER : des chansons depuis REAPER <!-- #reaper-songs-from-inside-reaper -->

Trois actions REAPER dans `extras/reaper/` (ReaScript, Lua) joignent le studio par son API, depuis la machine propre du studio ou une autre de ton réseau. Le son va dans un seul sens : les chansons sortent du studio vers REAPER, et aucun audio ni aucun projet ne repart. Ce que REAPER donne au studio, c'est ce dont une chanson est faite : ses mots, et sa mélodie.

- **Ruach - Generate here** : le style, la durée et le mode, demandés ; la chanson est faite dans le studio et arrive sur une nouvelle piste au début de la sélection temporelle (sa durée celle de la sélection). Les paroles viennent des notes des éléments sélectionnés (le projet exporté garde là les mots de chaque section), ou de la boîte de dialogue. **Les éléments MIDI sélectionnés sont la mélodie de la chanson** : leurs notes deviennent sa partition (la piste du haut chantée ; une piste d'accords n'est pas donnée comme ligne, car un instrument pourrait prendre l'air), au tempo et à la mesure du projet, dans la tonalité du key snap de la prise ou celle que suggèrent les notes, faite en mode *Mélodie seule* ; les notes du nouvel élément disent comment la mélodie a été lue. REAPER reste libre pendant que le studio travaille.
- **Ruach - Bring a take** : des mots (titre ou note, `*` et `?`), un espace si tu veux, et la prise que tu choisis arrive au curseur d'édition.
- **Ruach - Settings** : l'adresse du studio, son jeton s'il en demande un, et l'espace où arrivent les chansons venues de REAPER.

Installation : copie le dossier dans `Scripts` de REAPER, puis *Actions → New action → Load ReaScript* pour les trois, et lance *Settings* une fois. Elles ont besoin de `curl` (chaque Linux, macOS, et Windows 10 et plus récents l'ont). Le README du dossier dit le reste.

### DAWproject (Bitwig, Studio One, Cubase) <!-- #dawproject-bitwig-studio-one-cubase -->

Clic droit sur une prise → **Télécharger → DAWproject**, ou *Exporter la prise* sur la carte Waveform ou Bitwig de la fenêtre DAW : un seul fichier `.dawproject` avec le mix et chaque stem (le mix en muet quand il y a des stems), la partition en pistes de notes, une par voix, les sections en marqueurs une fois la prise minutée, au tempo et à la mesure de la prise ; le style et les paroles voyagent dans ses notes. Ouvre-le avec l'import DAWproject de la DAW : Waveform 14 ou plus récent (*File > Import Other > Import a DAWproject file* ; le studio demande au moins Waveform 14), Bitwig, Studio One, Cubase. Vérifié par rapport au propre schéma du format (Project.xsd).

### Depuis tes propres scripts <!-- #from-your-own-scripts -->

Tout ce qui précède est aussi l'API du studio : `POST /api/v1/takes/NAME/reaper` emballe le projet et dit où le récupérer. Voir **docs/API.md** : chansons, tâches, prises, marques, espaces, et un serveur MCP pour les agents.

## Partition <!-- #score -->

En Plan complet, la moitié musique écrit une partition avant qu'une note ne sonne, et la chanson la suit mesure par mesure ; avec *Fournir ta propre partition*, la partition est la tienne. Cet onglet la lit ligne par ligne : le dialecte qu'écrivent YuE2 et SheetSage2, comment ses deux voix se partagent les mesures, et comment les changer sans casser la chanson.

### Ce que fait la partition <!-- #what-the-score-does -->

La partition est du texte ABC : un en-tête, puis la chanson en groupes d'une à quatre mesures, chaque groupe une fois pour la voix (**Vocal**) et une fois pour les instruments (**Ins**), sur une seule grille de mesures. Le moteur la lit avant la musique : les notes de la voix portent les mots, les accords mènent l'harmonie, les mesures donnent le temps.

- **Une prise dure autant que sa partition.** Six prises en Complet ont fini à 0,5–5 s de la durée de leur partition. Les mesures après les derniers mots jouent quand même : c'est une queue (*Finir à…* la coupe, ou retire ces mesures de la partition).
- **Ce qui manque à la partition n'est pas chanté.** Si le plan contient moins de sections que les paroles, les derniers couplets sont laissés de côté ou un précédent revient.
- **Le studio la lit strictement.** Ce que la vérification ne connaît pas, elle le refuse, et elle dit où : le groupe, la voix, la mesure. Le moteur peut encore jouer une telle partition, mais le MIDI, les marqueurs, le déplacement de la voix et la récitation ont besoin du dialecte natif.

### L'en-tête <!-- #the-head -->

Huit lignes, toujours celles-ci, dans cet ordre :

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

- `X:1` et un `T:` vide tels quels : le titre vit dans le formulaire.
- `M:` la mesure en fraction : `4/4`, `3/4`, `6/8`, `2/4` ; son nombre du bas une puissance de deux.
- `L:` l'unité : une note sans nombre dure autant. YuE2 écrit `L:1/16`, une double croche, et tout ce qui suit compte en elle.
- `Q:1/4=` le tempo : des noires par minute, un nombre entier.
- Les deux lignes `V:` mot pour mot : le moteur reconnaît les voix par elles.
- `K:` la tonalité : une majeure par son nom (C, G, D, A, E, B, F#, C#, F, Bb, Eb, Ab, Db, Gb, Cb) ou une mineure avec m (Am, Em, Bm, F#m, C#m, G#m, D#m, A#m, Dm, Gm, Cm, Fm, Bbm, Ebm, Abm). Une autre écriture de la même tonalité est refusée : `Eb`, pas `D#`.

### Groupes, voix et mesures <!-- #groups-voices-and-bars -->

Après l'en-tête, la chanson va par groupes :

```
% verse
V: Vocal
"Gm"B2B2B2B2B2B2B2G2|"Eb"B2B2B2B2B2B2B2F2|"F"F2F2F2F2F2G2F2F2|"Gm"G4z12|
V: Ins
Z4|
```

- Un groupe : un commentaire de section là où une section commence (`% verse`), puis `V: Vocal` et une ligne d'une à quatre mesures, puis `V: Ins` et une ligne du **même nombre de mesures**. Chaque ligne finit par `|` ; pas de `||`, pas de reprises.
- `Z` est une mesure entière de silence, `Z2`, `Z3`, `Z4` autant de mesures ; `z` est un silence avec une durée, comme une note.
- Une nouvelle mesure ou tonalité arrive comme une ligne `M:` ou `K:` juste après la ligne `V:` d'un groupe, la même dans les deux voix : la vérification veut les deux voix sur une seule grille et dans une seule tonalité à chaque instant. Dans une mesure, un changement de tonalité s'écrit `[K:Em]`.

### Les notes et leurs durées <!-- #notes-and-their-lengths -->

- Les lettres sont des hauteurs : `C D E F G A B` l'octave depuis le do central (C4), les minuscules `c d e f g a b` l'octave au-dessus ; `'` monte une lettre d'une octave et `,` la descend : `B,` est B3, `c'` est C6.
- `^` dièse, `_` bémol, `=` bécarre (`^^` et `__` doubles) : une marque vaut pour cette lettre jusqu'à la fin de la mesure. Les dièses et bémols propres à la tonalité n'ont pas besoin de marque.
- Le nombre après une note est sa durée en unités (à `L:1/16`) : `1` une double croche, `2` une croche, `3` une croche pointée, `4` une noire, `6` une noire pointée, `8` une blanche, `12` une blanche pointée, `16` une ronde ; `24`, `32` et `48` pour de plus longues. Seulement celles-ci : une autre durée, ce sont deux notes liées (`F4-F` pour cinq).
- `-` lie une note à la suivante de même hauteur, à travers une barre de mesure aussi : une note tenue, une syllabe.
- **Chaque mesure fait exactement sa mesure** : à `L:1/16` seize unités en 4/4, douze en 3/4 et en 6/8. Une mesure d'une unité trop courte ou trop longue est refusée, avec ses chiffres.

### Accords <!-- #chords -->

- Un accord est son nom entre guillemets avant la note où il commence : `"Gm"B2`. Il tient jusqu'au suivant. Les accords vivent dans **Vocal** seulement (la vérification les refuse dans Ins) : ils sont l'harmonie du groupe, pas les notes du chanteur.
- Un nom est une fondamentale (A à G, avec `#` ou `b`) et l'un de : majeur (rien), `m`, `dim`, `aug`, `7`, `maj7`, `m7`, `dim7`, `m7b5`, `sus4`, `sus2`, `6`, `m6`, `7sus4`, `m(maj7)` ; une basse après une barre oblique : `C/E`.
- Un silence peut porter un accord : `"Bmaj7"z16` est une mesure de cet accord avec la voix muette, comme dans une intro.
- Avec des accords, une partition se joue en **Plan complet** ; sans, en **Mélodie seule** (un plan de mélodie, l'accompagnement libre). Le moteur le déduit de la partition elle-même.

### Sections <!-- #sections -->

- `% intro`, `% verse`, `% chorus`, `% bridge`, `% outro` sur leur propre ligne avant une marque de groupe là où une section commence. Elles arrivent dans ta DAW comme marqueurs (*Repères*, et dans le projet REAPER), et c'est là que le plan rencontre tes paroles.
- Donne à la partition les sections de tes paroles, dans leur ordre, chacune avec de la place pour ses lignes. Le planificateur en écrit parfois moins : sur un long rap, 2 à 17 sections pour les 32 du texte. Ajoute-les, ou raccourcis les paroles, avant *Générer*.

### Le temps <!-- #time -->

- Une mesure dure ses noires × 60 ÷ le tempo, en secondes (le tempo compte des noires) : en 4/4 à 85 BPM 2,82 s, à 103 BPM 2,33 s ; en 3/4 à 90 BPM 2 s.
- La chanson dure ses mesures × cela. La ligne de vérification sous la partition le dit : `✓ Native YuE2 score · Em · 90 BPM · 3/4 · 11 bars · 0:22 · 0 sections`.
- Une ligne de paroles a besoin du temps de ses syllabes : à une croche par syllabe, une mesure de 4/4 en contient 8, à une double croche 16 (un rap : les couplets de Buratino de Viktor vont `FFFFFEEEE2zDDDDD`).
- Pour finir la chanson plus tôt, retire des mesures à la fin de la partition, dans les deux voix ; pour une outro, ajoute-y des mesures.

### L'espace de la voix : Vocal <!-- #the-voice-s-space-vocal -->

- Vocal est ce qui est chanté : environ une syllabe par note, une note liée est une syllabe tenue, des silences là où le chanteur respire. Le tableau de la vérification dit combien de notes, combien par minute, l'ambitus, et quelle part du temps la voix sonne.
- Notes et syllabes : avec plus de notes que de syllabes, le modèle étire les syllabes dessus, ou en ajoute à lui ; avec moins, il entasse les mots. La métrique des paroles dans Composer compte chaque ligne par le temps qu'elle prend : donne à la ligne environ autant de notes.
- Le rap est dense (des doubles croches sur une ou deux hauteurs : le rythme le porte), une ballade a de longues notes. Laisse un silence en fin de ligne : là la voix respire et les instruments répondent.
- Le déplacement de la voix sous la partition (*Déplacer*) bouge Vocal par degrés de la gamme (une tierce, une quarte, une octave) là où elle est trop haute ou trop basse pour le chanteur ; les accords et Ins restent.

### L'espace des instruments : Ins <!-- #the-instruments-space-ins -->

- Ins est la ligne propre des instruments : le riff de l'intro, les réponses entre les phrases, un solo, l'outro. Une mélodie, pas les accords (ceux-ci se tiennent dans Vocal) : une ligne, et YuE2 arrange le groupe autour.
- **Sous la voix, Ins se tait le plus souvent.** Les reprises officielles gardent `Z4` sous chaque groupe chanté et jouent dans l'intro, entre les sections et à la fin ; les prises en Complet de Viktor font de même (un arpège dans l'intro, `Z4` sous les couplets, un remplissage aux transitions). Un Ins chargé sous une ligne chantée est une seconde mélodie contre la voix, et les partitions natives l'évitent.
- La vérification le résume en **Ins : Vocal**, les notes de l'un contre l'autre : au-dessus de 1.5 les instruments portent la plupart des notes, en dessous de 0.67 c'est la voix, entre les deux à peu près égal.
- Un instrumental : Vocal se tait (`Z`) tout au long de la chanson et Ins porte la mélodie. *Rendre instrumental* déplace la mélodie vocale d'une partition vers Ins (la recette officielle) et coche *Instrumental*. Un adaptateur de partition instrumentale à pleine force avec des mots à chanter donne une voix sans notes : garde-le bas quand il y a des paroles (Créateur › VAE, curseurs et LoRA).

### La changer dans le studio <!-- #changing-it-in-the-studio -->

- **Créer une partition ABC**, lis-la et change-la, puis **Générer** : le chemin le plus sûr vers la partition que tu veux. Ou écris la tienne dans *Fournir ta propre partition*.
- La vérification sous la partition la lit pendant que tu tapes : ✓ avec la tonalité, le tempo, la mesure, les mesures, la durée et les sections, un tableau pour chaque voix et la ligne **Ins : Vocal** ; ou ✗ avec ce qui ne va pas et où : `group 3, Ins, bar 9: duration 15/4 quarter notes != meter duration 4`.
- **Tonalité** déplace toute la partition (au plus près, vers le haut ou le bas) ; *Déplacer* ne bouge que Vocal ou que Ins, par degrés de la gamme.
- **MIDI** en sortie pour une DAW (une piste par voix, les sections en marqueurs), et en entrée depuis une DAW (une ligne mélodique par voix) ; **Repères** : les sections avec leurs secondes, en CSV.
- *L'écrire à partir du son* et *Transcrire cette prise* : SheetSage2 écoute un enregistrement et écrit sa mélodie et ses accords dans ce dialecte (avec les accords, ou la mélodie seule, comme tu le choisis sous *Reprise ou remix*).
- *Poser les paroles sur cette partition…* : tes lignes sur les mesures de la partition ; l'onglet suivant dit comment c'est venu.
- La partition de la prise en portée, en plein écran, imprimée en PDF : Créateur › La partition.

### Quand la vérification dit non <!-- #when-the-check-says-no -->

| elle dit | cela veut dire | fais |
|---|---|---|
| `duration … != meter duration …` | une mesure ne fait pas le compte | compte ses unités : 16 en 4/4 à `L:1/16` |
| `unsupported duration 5` | une durée hors de 1 2 3 4 6 8 12 16 24 32 48 | lies-en deux : `F4-F` |
| `voices have different measure counts` | Vocal et Ins ont des nombres de mesures différents dans un groupe | donne des mesures `Z` à la plus courte |
| `Native chord symbols belong in Vocal, not Ins` | un accord dans Ins | déplace-le dans Vocal, même mesure |
| `unresolved tie at end of score` | la dernière note est liée à rien | retire son `-` |
| `tie changes pitch` | une liaison entre deux hauteurs | ne lie une hauteur qu'à elle-même |
| `Unsupported key` | une tonalité hors de la liste | la même tonalité telle que la liste l'écrit : `Eb`, pas `D#` |
| `expected 1–4 measures` | une ligne de plus de quatre mesures | coupe le groupe en deux |
| `Preserve native Vocal and Ins voice definitions` | l'en-tête a été changé | les huit lignes comme plus haut |

## Des voix sur une partition <!-- #voices -->

Comment la promo du studio a trouvé son son : un narrateur disant les lignes de la promo sur un fond musical, des voix de femmes chantant entre les lignes, chaque ligne près du moment dont sa scène avait besoin, le tout en une seule prise. La méthode marche pour toute parole, lecture ou rap sur un fond ; *Poser les paroles sur cette partition…* fait pour toi sa partie du milieu.

### Le fond et son horloge <!-- #the-bed-and-its-clock -->

- D'abord la musique sans mots : des prises dans le style du fond (pour la promo, une bande-annonce épique, D#m, 103 BPM, 128 s), jusqu'à ce que l'une sonne juste.
- Puis *L'écrire à partir du son* dessus : SheetSage2 écrit la partition propre du fond, ses accords et ses mesures. Cette partition est l'horloge : à 103 BPM en 4/4 une mesure dure 2,33 s et une double croche 0,146 s, donc tant que la mesure reste, la mesure n commence à n × 2,33 s.
- Chantée en Plan complet sur cette partition, la nouvelle chanson garde cette horloge : les mêmes accords dans les mêmes mesures, et les mots là où la partition les met.

### Une ligne sur ses mesures <!-- #a-line-on-its-bars -->

- Chaque ligne avait un moment pour être dite : sa scène. Elle va à la mesure qui commence au plus près de ce moment ; si la ligne d'avant sonne encore là, à la prochaine mesure libre.
- La ligne devient des notes : une syllabe par croche sur une note de l'accord de sa mesure, le nom accentué une noire plus haut, un souffle après une virgule (une croche) et après un point (une noire), la dernière syllabe de la ligne une noire et plus bas. Un narrateur veut peu de hauteurs : les notes de l'accord suffisent, et les accords viennent du fond.
- À la première mesure de la ligne, la partition reçoit son commentaire de section et les paroles la même balise : `% verse` là, `[Verse]` ici. Une ligne, une section : le plan et les paroles se rencontrent un pour un, et rien n'est laissé de côté.
- Les mots que le modèle accentue mal reçoivent les marques de Viktor : un aigu sur la voyelle accentuée (обе́щано), le nom écrit comme il sonne (рУ́ах en russe, רוּ-אַח en anglais).

### Deux voix dans une seule prise <!-- #two-voices-in-one-take -->

- Le narrateur et les femmes sont une seule prise, pas un mixage. Le style nomme les deux : `male baritone narrator, spoken word, clear English diction, female a cappella vocalise, oooh aaah, epic cinematic trailer`, et le tempo, `103 bpm`.
- Les paroles donnent chaque ligne et, après elle, entre parenthèses, la vocalise : `(Ooh, aah)`. Dans les prises de la promo, les femmes la chantaient.
- La partition donne à la vocalise ses propres notes dans les mesures entre les lignes : une blanche sur la note haute de l'accord, puis le reste de la mesure sur sa note de récitation, deux octaves au-dessus des notes du narrateur. La propre vocalise du fond reste à la fin : l'outro garde les mesures du fond, notes comprises.
- Un adaptateur de voix peut donner une voix au narrateur ; garde-le bas (0.45 sur la moitié musique et 0.3 sur la moitié son ont suffi), sinon il prend le dessus sur la musique.

### Beaucoup de prises, puis la meilleure <!-- #many-takes-then-the-best -->

- Six graines par langue, Plan complet, guidage 1.6, la durée fixée aux 128 s du fond, la partition et les paroles telles que faites. Chaque prise dit ses lignes un peu différemment : l'une tombe plus près, une autre parle plus clairement.
- Où sont vraiment les lignes : Affineur › Paroles › *Caler les lignes* donne le temps de Whisper pour chaque ligne, mot par mot. Les segments propres de Whisper sont trop grossiers pour cela : un segment commence souvent sur la vocalise avant une ligne.
- Confronte le temps de chaque ligne à sa mesure : dans la meilleure prise de la promo, 7 lignes sur 11 ont commencé à moins de 1,5 s de leur mesure (1,7 s en moyenne, la plus éloignée à 7,5 s) ; les autres prises s'écartaient davantage. La partition guide la voix, elle ne l'épingle pas.
- Classe-les : d'abord les lignes à moins de 1,5 s, puis les lignes entendues, puis la distance moyenne ; écoute les premières.

### Le double anneau <!-- #the-double-ring -->

- Le mot de Viktor : rends d'abord les pistes justes, puis ajuste le film sur elles, même si leurs durées diffèrent. Ainsi l'image suit la prise : une scène arrive juste avant sa ligne, une légende pendant que ses mots sont dits, et le carton de fin tient jusqu'à la dernière seconde de la prise.
- Une ligne n'a donc pas besoin de tomber sur sa mesure au dixième de seconde près : le film vient à elle. La même chose vaut sans film : une lecture calée sur des diapositives, un rap sur les sections d'un beat.

### Dans le studio maintenant <!-- #in-the-studio-now -->

- *Poser les paroles sur cette partition…* (Créateur › Reprises, remix et ta propre partition) fait la partie des lignes sur les mesures pour n'importe quelle partition du formulaire : tes sections, une syllabe par croche sur les notes de l'accord, les souffles, une intro et une outro, la vocalise quand tu la coches.
- *Caler les lignes* (Affineur › Paroles) donne le temps de chaque ligne ; *Finir à…* termine une prise après sa dernière ligne.
- Pas encore dans le studio : chaque ligne à une seconde que tu choisis (les moments des scènes de la promo) et le classement des prises par distance. La promo l'a fait avec ses propres scripts.

## Raccourcis et astuces <!-- #shortcuts -->

**Dans le Bibliothécaire :** **Ctrl+A** coche toutes les prises affichées, **Esc** aucune, **Delete** envoie les cochées à la corbeille (il demande d'abord), **Ctrl+Z** rend le dernier changement (un déplacement, un espace, un masquage, une épingle, des marques, la corbeille) ; la pastille au-dessus du lecteur offre le même Annuler pendant dix secondes.

### Touches <!-- #keys -->

| touche | où | ce qu'elle fait |
|---|---|---|
| **Espace** | partout sauf dans un champ de texte | lit ou met en pause la prise en main |
| **←** **→** (avec **Shift** : 30 s) | partout sauf dans un champ de texte ou un menu | 5 secondes en arrière ou en avant |
| **M** | partout sauf dans un champ de texte | coupe et rend le son |
| les touches multimédia | le clavier, un casque, le panneau multimédia du bureau | lecture, pause, précédente, suivante |
| **Ctrl+Alt+1** … **9** | partout | **1** Créateur, **2** Écrivain, **3** Affineur, **4** Peintre, **5** Bibliothécaire, **7** Entraîneur, **8** vers ta DAW, **9** le Moteur ; **6** est gardé pour une salle à venir (Ctrl+1…9 sont les onglets du navigateur) |
| **Esc** | partout | ferme ce qui est ouvert : un menu, un dialogue, le guide, une vue plein écran, la salle du Moteur |
| **F1** (ou **Shift+F1**) | partout | ce guide, sur la salle où tu es ; encore une fois pour le fermer (l'aide du navigateur ne vient pas) |
| **Shift+Tab** | le Créateur | la touche des cadres, pas le retour entre les champs : un cadre détaché passe à l'autre, aucun détaché détache celui du formulaire (Composer) ; un dialogue, un menu et la barre de recherche gardent leur propre Shift+Tab |
| **F5**, **Ctrl+R**, **Ctrl+Shift+R** | partout sauf le Bibliothécaire | après toute saisie (depuis l'arrivée de la page ou depuis **Ctrl+S**) demandent d'abord, sinon rechargent aussitôt ; en demandant, ils disent ce qu'un rechargement emporte et ce qu'il garde ; avec une chanson dans le formulaire, *Enregistrer dans l'Écrivain, puis recharger* la garde aussi là-bas ; **Ctrl+F5** recharge aussitôt (dans le Bibliothécaire **F5** relit la bibliothèque) |
| **Entrée** / **Esc** | un dialogue, un renommage sur place, la valeur saisie d'une LoRA | garder / annuler ; dans un dialogue à texte long, **Shift+Entrée** est une nouvelle ligne |
| **Entrée** | *Partir d'une idée* | le modèle de chat ébauche la chanson ; **Shift+Entrée** est une nouvelle ligne |
| **Ctrl+S**, **Ctrl+Shift+S** | partout | garde tout maintenant : la chanson du formulaire, le document ouvert de l'Écrivain, les réglages (jamais l'Enregistrer la page du navigateur) |
| **Ctrl+N** | partout, dans la fenêtre de Pinokio | Nouvelle chanson dans le Créateur (il demande d'abord quand le formulaire contient des mots) ; un navigateur garde Ctrl+N pour sa propre nouvelle fenêtre |
| **Alt+K** · **Alt+J** | les paroles, du Créateur et de l'Écrivain | marque la ligne du curseur ou la démarque · va à la marque suivante (**Alt+Shift+J** la précédente, **Alt+Shift+K** les efface) |
| **Alt+E** | le Créateur | lève les paroles par-dessus tout et les remet ; **Shift+Tab** sur elles les met dans le formulaire détaché |
| **Alt+O** · **Alt+L** · **Ctrl+Y** · **Alt+↑ ↓** | les paroles, comme dans mcedit | efface les marques · va à une ligne par son numéro · supprime la ligne · déplace la ligne (ou les lignes sélectionnées) |
| **Ctrl+F** · **F4**, **Ctrl+H** | les paroles, le style, les champs de l'Écrivain | cherche dans ce champ seul · cherche et remplace (**Entrée** l'occurrence en main, **Ctrl+Entrée** toutes ; **Alt+C** la casse telle que tapée) |
| **↑ ↓** · **→** · **←** | un menu | se déplacer · ouvrir un sous-menu · en ressortir |
| **flèches** | le choix du thème | passer d'un thème à l'autre |
| **+** **−** **0** | une portée ou un spectre en plein écran | zoom avant, arrière, retour à l'ajusté ; **Ctrl+molette** zoome là où est le pointeur |
| **← →** (avec **Shift** : pas plus grands) · **Début** | le bord d'une colonne, avec le focus | la colonne plus étroite ou plus large · sa propre largeur de nouveau |
| **Entrée** ou **Espace** | la carte d'un entraînement dans l'Entraîneur LoRA | ouvre l'entraînement |

### La souris <!-- #the-mouse -->

- **Clic droit** sur une prise n'importe où (la liste des prises, une carte, une prise épinglée) pour son menu ; clic droit sur un espace pour ses verrous, le renommer et le supprimer.
- **Double-clic** : une prise dans la liste des prises la lit ; le nom d'un espace le renomme ; le bord d'une colonne lui rend sa propre largeur ; la portée ou le spectre s'ouvre en plein écran ; la valeur d'une LoRA se laisse saisir exactement.
- **Dans le Bibliothécaire, comme dans un gestionnaire de fichiers** : dès qu'une carte est cochée, un clic n'importe où sur une autre la coche aussi ; **Shift**+clic coche toute la plage ; un glisser sur l'espace vide entre les cartes trace une bande qui coche ce qu'elle touche ; **Ctrl**+glisser la trace depuis n'importe où et inverse ce qu'elle traverse : les cartes non cochées sont cochées, les cochées décochées. La page défile quand la bande atteint un bord.
- **Des marques pour plusieurs** : avec plusieurs cochées, 👍, 👎 ou ★ sur l'une d'elles (ou sur la barre des cochées) les marque toutes ; quand toutes ont déjà cette marque, elle est retirée. Retirer plusieurs prises d'un espace demande d'abord ; la corbeille demande toujours.
- **Survole** un nom d'espace coupé : il s'affiche en entier, par-dessus la grille.
- **La vitesse** du lecteur (0.5× à 2×) garde la hauteur : ralentis pour entendre un détail, accélère pour survoler.

### Petites astuces <!-- #small-tricks -->

- Garde la **graine musicale** et change la **graine sonore** : la même chanson, rendue à neuf.
- Écoute un instrument sur **plusieurs graines** avant de le juger : YuE2 le fait entrer quand la graine et la chanson le lui permettent.
- **Épingle** les prises auxquelles tu reviens sans cesse (quatre par espace) ; **Épinglées** à gauche les liste toutes.
- **⋯** sur une carte est son menu du clic droit, pour un pavé tactile.

## Conseils <!-- #tips -->

### Quand quelque chose tourne mal <!-- #when-something-goes-wrong -->

| ce que tu vois | ce que c'est | quoi faire |
|---|---|---|
| *Babel dans la partition* | la moitié musique a écrit n'importe quoi pour une partition | les forces dans le vert, moins d'adaptateurs sur la moitié musique, ou Direct |
| le chanteur parle par-dessus une boucle | un adaptateur de partition instrumentale trop fort pour une chanson chantée | garde-le à 0.3–0.5 |
| *Le GPU0 entraîne…* | un entraînement tourne sur la carte du studio | attends, arrête l'entraînement, ou donne une autre carte à l'entraînement (Moteur → GPU) |
| la page dit que le serveur est indisponible | le studio a redémarré | attends quelques secondes ; recharge la page (F5) après une mise à jour |
| une prise sonne métallique dans les aigus | le bourdonnement de 25 trames du VAE | Affineur → Antibourdon à 80 % |
| les paroles s'éloignent du texte | la moitié musique a perdu les mots | Affineur → Contrôle des paroles ; *Régénérer depuis…* la minute où ça a déraillé |
| l'instrument demandé n'est pas là | YuE2 décide quand un instrument entre, et la graine décide beaucoup | le même prompt avec une **graine musicale aléatoire** ; écoute plusieurs prises avant de juger |
| l'instrument joue, mais pas comme le vrai | ce que YuE2 en sait | une LoRA d'instrument (Entraîneur LoRA) |

### Bonnes habitudes <!-- #good-habits -->

- Garde la **graine musicale** quand une chanson est juste et ne change que la **graine sonore** pour entendre son son à neuf.
- Note ce qui marche dans la **Note** de chaque prise : la semaine prochaine, tu ne te souviendras plus de quelle graine c'était.
- Donne à chaque projet son **espace**, et verrouille ceux qui sont finis.
- Entraîne sur ce que tu veux entendre : l'adaptateur apprend le son de l'ensemble, défauts compris.
