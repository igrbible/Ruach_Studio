# Le Peintre en profondeur

[English](ARTIST.md) · [Русский](ARTIST.ru.md) · [Українська](ARTIST.uk.md) · [Беларуская](ARTIST.be.md) · [Ελληνικά](ARTIST.el.md) · [Español](ARTIST.es.md) · [Italiano](ARTIST.it.md) · **Français** · [Português](ARTIST.pt.md) · [Deutsch](ARTIST.de.md) · [日本語](ARTIST.ja.md) · [中文](ARTIST.zh.md)

Le Peintre est la salle de Ruach Studio pour les images : une pochette pour chaque prise, un 16:9 pour sa vidéo, un 9:16 pour un short. Le guide dans le studio (F1 dans le Peintre) dit en quelques lignes ce que fait chaque commande ; ce document va jusqu'au fond : chaque commande, comment elle est faite à l'intérieur, les recettes qui marchent, ce qui tourne mal et pourquoi, et les chiffres mesurés sur une RTX 3090. Tout ce qui est ici est dans le studio tel qu'il est ; ce qui reste à venir est dit à la fin.

## Sommaire

1. [À quoi sert le Peintre](#1-à-quoi-sert-le-peintre)
2. [Une première pochette en six étapes](#2-une-première-pochette-en-six-étapes)
3. [Écrire un prompt](#3-écrire-un-prompt)
4. [Les peintres](#4-les-peintres)
5. [Le déroulement d'une exécution](#5-le-déroulement-dune-exécution)
6. [Lightning](#6-lightning)
7. [Échantillonneurs et programmes](#7-échantillonneurs-et-programmes)
8. [Adaptateurs (LoRA)](#8-adaptateurs-lora)
9. [Régions](#9-régions)
10. [Lettrage](#10-lettrage)
11. [Une image d'où peindre](#11-une-image-doù-peindre)
12. [La seconde passe](#12-la-seconde-passe)
13. [Suréchantillonner](#13-suréchantillonner)
14. [La scène, la bibliothèque et la corbeille](#14-la-scène-la-bibliothèque-et-la-corbeille)
15. [Des pochettes pour les prises](#15-des-pochettes-pour-les-prises)
16. [Recettes](#16-recettes)
17. [Quand quelque chose tourne mal](#17-quand-quelque-chose-tourne-mal)
18. [Les chiffres](#18-les-chiffres)
19. [Pour les scripts et les agents](#19-pour-les-scripts-et-les-agents)
20. [Licences](#20-licences)
21. [Ce qui vient ensuite](#21-ce-qui-vient-ensuite)

## 1. À quoi sert le Peintre

Une chanson a besoin d'images : le carré sur sa carte et dans son MP3, un cadre large pour sa vidéo, un haut pour un short. Le Peintre les peint sur ta propre carte graphique, à partir de tes mots, d'une image à toi ou des deux, et garde chaque exécution avec son prompt, sa graine et ses réglages, pour qu'une image qui t'a plu puisse être peinte à nouveau ou menée plus loin.

La salle a trois colonnes. À gauche le formulaire : le prompt et chaque commande qui façonne la peinture. Au milieu la scène : l'exécution en cours de peinture s'y révèle pas à pas, ou l'image que tu as choisie s'y tient, ses boutons dessous et les données de son exécution dans une bulle à côté. À droite la bibliothèque : chaque exécution, ou toutes les images dans une galerie, ou la corbeille. Fais glisser les bords entre les colonnes pour en élargir une (← → au clavier ; un double clic lui rend sa largeur). À partir d'une fenêtre de 920 px de haut la salle tient entière : la page reste immobile, le formulaire et la bibliothèque défilent d'eux-mêmes, et la ligne de Dessiner reste au pied du formulaire.

## 2. Une première pochette en six étapes

1. Choisis une prise à droite du studio (la liste du Créateur ou du Bibliothécaire) : l'image que tu mettras en pochette va à elle.
2. Dans le Peintre, appuie sur **De la prise** pour avoir un prompt de départ, ou écris le tien (section 3).
3. Laisse **Formats** sur **1:1**, mets **Variations** à 4 et garde le pinceau que le studio a choisi (Qwen-Image 2512 Q4 avec ⚡ Lightning sur la plupart des cartes).
4. Appuie sur **Dessiner** (Ctrl+Entrée). Regarde les images se révéler sur la scène ; environ une demi-minute chacune sur une 3090.
5. Clique sur celle qui te plaît ; **Mettre en pochette** en fait la pochette de la prise : sur sa carte, dans le lecteur et dans son MP3.
6. Elle te plaît mais tu la veux plus fine ? **Seconde passe… ×2** (section 12), puis **Suréchantillonner… 4K** (section 13).

## 3. Écrire un prompt

Qwen-Image lit un prompt comme une description, pas comme une liste d'étiquettes : écris des phrases. Mets d'abord ce qui est dans l'image (qui ou quoi, où, faisant quoi), puis la lumière (crépuscule, lumière de bougie, un matin gris), les couleurs et la technique (une peinture à l'huile en touches épaisses, un dessin à l'encre, une photographie 35 mm). Termine par *no text* quand tu ne veux pas de lettres : Qwen-Image aime lettrer une pochette de lui-même.

Les mots qui marchent bien : le sujet dit simplement (*a red fox sitting in the snow*), la composition (*seen from below*, *in the left third*, *a wide empty sky above*), la matière (*oil on canvas*, *gouache*, *woodcut*), la direction et la couleur de la lumière. Les mots qui font peu : les listes d'étiquettes de qualité (*masterpiece, 8k, best quality*) appartiennent à des modèles plus anciens et ne font que prendre de la place.

**De la prise** met dans le prompt celui dont est venue la pochette propre de la prise, ou un prompt fait de son titre et de son style, pour commencer. Chaque exécution garde son prompt ; **Vers le formulaire** sur n'importe quelle image ramène son prompt, sa graine et son format, et **Tout vers le formulaire** (dans son menu) ramène aussi son peintre, son fine-tune, son échantillonnage et ses adaptateurs, pour que Dessiner peigne à nouveau cette image-là.

## 4. Les peintres

| peintre | licence | ce qu'il demande à la carte | une image sur une 3090 | pour |
|---|---|---|---|---|
| **Qwen-Image 2512 Q4** | Apache-2.0 | 15,5 Go | environ 30 s avec Lightning | le Qwen d'une carte de 16 Go |
| **Qwen-Image 2512 Q6** | Apache-2.0 | 20 Go | environ 32 s avec Lightning | ébauches plus fines |
| **Fine-tune fp8 de Qwen-Image 2512** | celle du fine-tune | 22,5 Go | environ 37 s avec Lightning, des minutes sans | réalisme abouti |
| **Qwen-Image 2512 fp8 BASE** | Apache-2.0 | 22,5 Go | 8 pas avec Lightning, comme les GGUF | 2512 lui-même en fp8 |
| **Qwen-Image 2.1** | Qwen Research Licence | 21 Go (en flux avec moins) | environ deux minutes | retouche par les mots, référence de style |

**Les pinceaux du Peintre** sont une seule liste de chaque modèle et fichier présents, par groupes : Qwen-Image 2512 depuis un GGUF (Q4, Q6), chaque fichier fp8 de `artwork/Qwen-Image-2512/checkpoints/` (le BASE propre à 2512 et les fine-tunes) et Qwen-Image 2.1. **⚡ Lightning** marque un pinceau qui peint avec lui par défaut ; un fine-tune est marqué comme tel. Un fichier déposé dans `checkpoints/` devient un pinceau à lui quand la salle relit la liste (après un téléchargement ou au rechargement de la page). Krea 2 Muse a quitté le studio en octobre 2026 : Qwen-Image 2512 suit mieux les mots et lettre juste un titre.

**Qwen-Image 2512** est le grand peintre : un réalisme plus fin, il lit bien les longs prompts, il trace juste les lettres quand tu les demandes. Il vient en GGUF Q4 ou Q6, ou en **fine-tune fp8** : les fichiers uniques de ComfyUI posés dans `artwork/Qwen-Image-2512/checkpoints/` chacun un pinceau à lui (Jib Mix Qwen, IntoRealism Qwen, Real-Qwen-Image et 2512 lui-même se récupèrent depuis **Récupérer peintres et adaptateurs…**, 20,4 Go chacun). Le BASE propre à 2512 peint avec Lightning comme les GGUF, un fine-tune sans lui sauf si tu l'allumes. Un fichier fp8 se lit en bf16, reste sur la carte dans son propre fp8, et chaque couche calcule en bf16 pendant qu'elle tourne ; les adaptateurs posés dessus gardent leurs couches en bf16.

**Qwen-Image 2.1** lit les images autant que les mots (son encodeur de texte est Qwen3-VL) : il retouche une image selon les mots du prompt, ou peint la scène du prompt dans le style d'une image (section 11). Il est sous la Qwen Research Licence : recherche et évaluation seulement, pas pour une pochette que tu vends ; la salle le dit sous le peintre dans la couleur des avertissements.

Chaque peintre n'apparaît que lorsque ses fichiers sont là ; ceux qui manquent sont nommés sous le peintre, et **Moteur → Modèles et LoRA** les récupère, chacun demandé d'abord avec sa taille (le 2.1 avec sa licence aussi). Depuis un terminal : `heresy/fetch-heresy.sh --qwen 2512-q4`.

**L'encodeur de texte** de Qwen-Image 2512 (Qwen2.5-VL-7B, environ 15,5 Go) lit le prompt sur la carte quand la place libre y suffit, sinon sur le processeur, et s'en va avant que le peintre n'arrive : l'image est la même d'une façon comme de l'autre, le processeur est seulement plus lent.

## 5. Le déroulement d'une exécution

**La file.** Un appui sur Dessiner est une exécution : un prompt, ses formats, ses variations. Elle attend dans la file du labo une carte qui a de la place, comme les pochettes des prises, les stems et les suréchantillonnages ; pendant qu'elle attend, **Hors de la file** la reprend, et **Arrêter** à côté de Dessiner termine une exécution qui peint (les images qu'elle a finies restent). Deux exécutions peuvent se tenir à la fois : l'une peint, la suivante attend derrière.

**Quelle carte.** Les tâches du labo s'en tiennent aux cartes qu'on leur a données dans **Moteur → GPU** (la carte propre du studio n'est jamais prise par hasard). Une carte que rien d'autre n'utilise prend une exécution dont le besoin tient dans sa mémoire moins 512 Mio (la part propre du runtime CUDA) ; une carte occupée la prend quand sa mémoire libre contient le besoin ; une carte avec une limite de VRAM compte sa limite comme plafond. Le besoin est celui du peintre plus la taille de ses adaptateurs, et 6 Go de plus pour une seconde passe ×2.

**Quand aucune carte ne le tient entier**, Qwen-Image 2512 fait venir leurs blocs en flux depuis la RAM : les blocs qui tiennent restent sur la carte, les autres viennent au fur et à mesure (le group offloading de diffusers sur un stream CUDA : un bloc arrive pendant que le précédent calcule), et l'image est la même, plus lente de ce que le bus ne peut pas cacher. Tous ses blocs en flux, il prend 2,3 Go de la carte (1328², Lightning, quatre adaptateurs), si bien qu'une carte de 6 Go le peint, avec environ 30 Go de RAM. Qwen-Image 2.1 fait venir en flux son transformer (bloc par bloc) et son encodeur de texte (couche par couche) : sous une limite de 15,5 Go, il a peint à partir des mots à 4,1 Go au pic et retouché à 7,9 Go, à peu près dans le même temps qu'entier. Un peintre qui ne peut pas aller en flux et ne tient sur aucune carte est refusé tout de suite, avec les chiffres et le peintre qui tiendrait.

**Plusieurs cartes.** Une exécution de plusieurs images est répartie sur les cartes du labo qui ont de la place et assez de RAM pour un peintre de plus (trois formats sur deux cartes : le premier et le troisième sur l'une, le deuxième sur l'autre), chaque carte peignant sa part avec les graines propres de l'exécution : les images sont les mêmes bit pour bit que sur une carte.

**Un peintre gardé.** Après une exécution, son peintre retourne en RAM et sa carte est de nouveau libre ; une exécution suivante du même peintre, du même fine-tune et des mêmes adaptateurs dans le même ordre peint aussitôt, sans la minute ou deux de chargement. Un peintre gardé est relâché après dix minutes d'inactivité, quand la RAM est demandée pour un autre, ou par **Décharger** dans la Barre (qui relâche tout ce que le studio tient sur ses cartes).

**Dans une exécution** : le prompt est lu une fois par l'encodeur de texte ; chaque image est tracée à la taille propre du peintre et gardée à celle de la salle (Qwen-Image trace en 1328², 1664 × 928 et 928 × 1664 et ramène chacune à 1280², 1920 × 1080 et 1080 × 1920) ; le décodeur travaille par tuiles, si bien que son pic reste bas.

**Aperçu en direct** (activé par défaut) : les latents de chaque pas deviennent une image d'un huitième de la taille sans le décodeur (avec les facteurs de couleur propres de l'espace latent, tels qu'InvokeAI les porte), donc il ne coûte rien ; une barre en haut de la scène suit l'exécution, image par image et pas à pas.

**Le filtre de contenu** : chaque image passe un filtre de contenu (nsfw_image_detection de Falconsai, Apache-2.0), la règle du studio pour tout peintre : une image qu'il signale n'est pas gardée, et l'exécution le dit.

**Sur le disque** : chaque exécution est un dossier dans `artist/` du studio : `ask.json` (ce qui a été demandé), `run.json` (écrit image par image), les images `NN-SHAPE-sSEED.png`, leurs `thumbs/`, et une référence ou un masque à côté quand l'exécution en avait. Un chien de garde arrête un peintre muet trop longtemps (dix minutes pendant le chargement, cinq une fois qu'il peint), et une exécution que le labo a perdue lors d'un redémarrage le dit au lieu de peindre pour toujours.

## 6. Lightning

**Ce que c'est** : un adaptateur (lightx2v, Apache-2.0) qui apprend à Qwen-Image 2512 à peindre en quelques pas sans guidage : le long chemin guidé propre au modèle distillé en 8 pas. Son fichier vit dans `artwork/Qwen-Image-2512/lightning/` et vient avec la récupération des peintres Qwen.

**Comment le studio le pose** : Lightning activé, le peintre le charge comme un adaptateur de plus sous les tiens, à **1.0** pour les GGUF Q4 et Q6 et le fp8 BASE propre à 2512 (la base dont il a été distillé, 8 pas) et à **0.55** pour un fine-tune fp8 en 12 pas (un fine-tune s'est éloigné de la base, et Lightning à pleine force le ramènerait en arrière). Le programme devient celui de Lightning (un décalage de log 3 à toute taille), et le guidage est coupé : une passe du modèle par pas.

**Lui coupé**, 2512 peint à sa façon : 30 pas par défaut (de 10 à 60) et **Guidage** 4 (un vrai CFG contre un négatif vide : deux passes par pas). Soixante passes contre huit : environ sept fois la peinture, et le détail et la lumière du réalisme abouti.

**La règle derrière les défauts** : Lightning pour les ébauches et les pochettes, pas pour le réalisme professionnel. Les peintres GGUF et le fp8 BASE propre à 2512 peignent avec ; un fine-tune fp8 peint sans à moins que tu ne l'allumes ; la pochette propre d'une prise se peint avec.

## 7. Échantillonneurs et programmes

**Échantillonnage**, sous le peintre, replié, ses valeurs dans son résumé : les pas, l'échantillonneur et le programme (et pour 2512 Lightning et Guidage), gardés pour chaque peintre ; **Réinitialiser** rend ceux du peintre. Qwen-Image 2512 avec Lightning prend de 4 à 16 pas ; sans, comme Qwen-Image 2.1, de 10 à 60.

Le modèle dit à chaque pas de quel côté se trouve l'image ; l'**échantillonneur** décide comment y aller :

- **Euler** : une passe par pas, le pas simple, la référence (et celui avec lequel Lightning a été distillé).
- **Euler SDE** : Euler avec un peu de bruit frais à chaque pas : plus de grain, un peu moins fidèle.
- **ER-SDE** : un solveur stochastique du troisième ordre, une passe par pas, les deux pas précédents gardés : plus fin qu'Euler pour le même temps.
- **RES 2s**, **RES 3s** : les méthodes à un pas du solveur exponentiel raffiné, deux et trois passes par pas, la moitié du bruit remise après chacune ; leurs jumeaux **ODE** n'en remettent pas, si bien qu'une graine peint une image, la plus proche du chemin exact.
- **Heun++** : trois passes par pas là où il peut, deux, puis une à la fin.
- **Exponential Heun** (et son SDE) : une méthode exponentielle du second ordre, deux passes par pas.

Un échantillonneur à deux ou trois passes par pas coûte deux ou trois fois le temps d'Euler. Face au chemin exact d'un flux jouet à 8 pas, ils se classent comme le disent leurs ordres : Euler 0,138, Heun++ 0,111, exponential Heun 0,084, RES 2s 0,058, RES 3s 0,046 (l'erreur : plus bas est plus près).

Le **programme** dit où les pas sont dépensés entre tout le bruit et aucun : **Simple** (également dans le temps propre du peintre), **Karras** et **Exponential** (plus de pas à faible bruit, pour le détail), **Beta** et **Beta 57** (denses aux deux bouts), **KL optimal** (l'espacement d'Align Your Steps), **SGM uniform** (uniforme dans le temps, le dernier pas retiré), **Bong tangent** (deux pentes d'arc tangente, de tout le bruit à la moitié et de la moitié à rien).

**Ce qui marche, d'après deux matrices de 54 images** (un prompt, une graine, chaque paire) :

| peintre | bien | éviter |
|---|---|---|
| Qwen-Image 2512 avec Lightning | Simple, Beta, Beta 57, SGM uniform, Bong tangent | Karras, Exponential, KL optimal (ils peuvent peindre le sujet deux fois) |
| Qwen-Image 2512 sans Lightning | Euler, ER-SDE, RES 2s / 3s | Euler SDE (doux et brumeux) |

Le formulaire dit les deux avertissements quand ils s'appliquent. Les échantillonneurs ont été écrits pour le studio d'après leurs articles et les formules de ComfyUI ; RES4LYF n'a été lu que pour ses mathématiques (sa licence interdit les services commerciaux), et Heun++ est de Carzit (MIT).

## 8. Adaptateurs (LoRA)

**Où ils vivent** : `artwork/loras/<famille>/`, la famille celle du peintre : `krea2`, `qwen-image-2512`, `qwen-image-2.1`. Les dossiers à l'intérieur deviennent des groupes dans la bibliothèque ; une image à côté d'un fichier portant son nom (`NAME.jpg`, `NAME.png`, `NAME.preview.png`) s'affiche sur sa carte ; ce que le LoRA Manager de ComfyUI (`NAME.metadata.json`) ou Stability Matrix (`NAME.cm-info.json`) ont écrit à côté d'un fichier est lu aussi.

**La liste et l'exécution** : jusqu'à huit adaptateurs dans la liste sous le peintre, jusqu'à quatre actifs dans une exécution ; chacun à sa force (le curseur de 0 à 1,5) ; un clic droit en **rend un muet** (il reste dans la liste et sort de l'exécution), et un adaptateur à zéro n'est pas chargé non plus. Ses mots déclencheurs s'affichent dessous, et un clic sur l'un le met dans le prompt (une exécution ajoute aussi d'elle-même les mots déclencheurs d'un adaptateur actif).

**Civitai** : **Rechercher sur Civitai** envoie le SHA-256 de chaque fichier et rien d'autre, et garde la réponse à côté (`NAME.civitai.info` : son nom, son modèle de base et ses mots déclencheurs, et sa première image classée sûre quand il n'en a pas). **Depuis Civitai…** récupère un adaptateur dont l'auteur ne permet pas le partage, depuis Civitai lui-même, avec ta propre clé : un lien, un id de version ou un AIR est lu, la famille qui convient à son modèle de base est dite, et seul un LORA, LoCon ou DoRA en `.safetensors` est pris, son SHA-256 vérifié contre celui de Civitai avant de devenir le fichier. Ta clé ne va qu'à Civitai. Les adaptateurs que leurs auteurs laissent partager viennent de **Récupérer peintres et adaptateurs…**.

**Ensemble** : dès deux adaptateurs, une barre sous eux donne la somme de leurs forces sur la route du Créateur : vert jusqu'à 1,2, ambre jusqu'à 1,8, rouge au-delà. Les adaptateurs empilés s'additionnent, et passé environ 1,8 une image brûle (couleurs et contours forcés), si modeste que soit chacun. Fais glisser la barre pour les déplacer tous à la fois, chacun en proportion.

**Force au fil des pas** (⏱ à côté d'un adaptateur) : des images clés comme les ont les hooks LoRA de ComfyUI, une part des pas et un multiplicateur : `0%:1, 50%:1, 60%:0` garde l'adaptateur entier la moitié des pas et le lâche vers 60 %. Jusqu'à huit images clés, le multiplicateur de 0 à 2, des droites entre elles. Un adaptateur qui façonne tôt la composition et un adaptateur de style qui ne doit toucher que la finition en sont les deux usages.

**À l'intérieur** : les adaptateurs vont sur le transformer du peintre avant qu'il peigne (PEFT), chacun à sa force ; un fichier kohya (`lora_unet_blocks_0_…`) est renommé selon les noms de couches propres au peintre ; un adaptateur qui n'atteint aucune couche du peintre (fait pour un autre modèle) arrête l'exécution et le dit. Un peintre gardé prend les forces d'une exécution suivante sans recharger ses adaptateurs.

## 9. Régions

**Régions**, sous Échantillonnage, replié : jusqu'à trois parties du cadre, chacune avec une place et des mots à elle. Les places : la moitié gauche, droite, haute ou basse ; le tiers gauche, central ou droit ; les quatre quarts ; le centre. Une petite carte à côté de chaque ligne montre où elle se trouve.

**Comment ça peint** : à chaque pas, le peintre est interrogé une fois de plus pour chaque région, avec le prompt principal et les mots de la région, et ses réponses sont fondues selon les boîtes des régions comme des poids aux bords doux (un bord d'un vingt-cinquième du côté le plus court), partagés là où les boîtes se recouvrent ; le reste du cadre suit le seul prompt principal. C'est la voie de Latent Couple : il ne demande rien au modèle, et la scène reste une scène parce que le prompt de chaque région porte le principal.

**Comment les écrire** : le prompt principal dit toute la scène, une région ce qui s'y tient. *Two animals sitting in a snowy forest clearing at dawn, oil painting* ; moitié gauche *a red fox sitting in the snow* ; moitié droite *a white snowy owl perched on a stump*. Sur une graine, Qwen-Image 2512 a peint deux ours sans les régions et le renard et la chouette avec.

**Ce que ça coûte** : une passe entière de plus par pas pour chaque région (sur une 3090 en 16:9 : Qwen-Image 2512 fp8 141 s seul, 281 s avec deux régions). L'estimation de temps du formulaire les compte.

Les régions sont gardées dans ce navigateur ; une région sans mots n'est pas envoyée ; **Encore** peint avec celles de l'exécution. Pour Qwen-Image 2512 ; Qwen-Image 2.1 retouche par les mots et peint sans elles.

## 10. Lettrage

**Lettrage**, sous Régions, replié : un titre, et une seconde ligne dessous, lettrés comme une part de la peinture plutôt que posés par-dessus comme un calque qui reste à part de l'image. Ses mots vont dans des champs à eux, jamais dans le prompt, et le studio écrit ce que le peintre lit. Deux façons, choisies sous **Comment** :

- **Peint avec l'image** (Qwen-Image 2512 ou 2.1) : le studio ajoute une phrase au prompt : où, le titre entre guillemets, à quoi ressemblent les lettres, la seconde ligne plus petite dessous, puis *painted in the same technique and light as the picture. No other text.* Un prompt d'un paragraphe la reçoit à sa fin ; un prompt écrit en paragraphes la reçoit comme paragraphe à part, *TEXT RENDERING:*, deuxième, après le premier : à la fin d'un long prompt elle se noie (le prompt de Fosforida de Viktor, 3 200 caractères en dix paragraphes, a peint ainsi trois images sans une lettre). Le prompt d'une prise demande pas de texte (*No text, no letters.*) : cette phrase est retirée d'abord.
- **Sur l'image de référence** (Qwen-Image 2.1) : une image finie lettrée par les mots, le reste gardé. La consigne s'écrit à partir des seuls champs, si bien que le prompt peut rester vide. **Lettrer**, sur la scène ou dans le menu d'une image, fait de cette image la référence, règle Comment et ouvre le bloc, le titre en main.

**Les champs** : **Titre** (60 caractères) ; **Seconde ligne** (80 : l'artiste, l'album ; vide pour aucune) ; **Les lettres** (400, leur aspect en mots, aussi long qu'un paragraphe de typographie d'un prompt ; vide : *large elegant classical serif capitals in warm gold, with even letter spacing*) ; **Où** (en haut, au milieu, en bas). **Le titre de la prise** remplit le titre depuis la prise choisie à droite. Le bloc est gardé dans ce navigateur ; **Encore** lettre avec les mots de l'exécution ; la ligne de l'exécution garde la phrase que le peintre a lue.

**Relecture** : les peintres écorchent les mots qu'ils ont rarement vus. Sur un phare, Qwen-Image 2512 a écrit « RUOCH STUDIO » et Qwen-Image 2.1 « RUUCH STUDIO », tandis que « ПЕСНЯ МАЯКА » et « РУАХ СТУДИЯ » sont sortis justes. Alors chaque image est relue par l'auditeur, Qwen2.5-Omni via llama.cpp (environ 5 s par image sur une RTX 3090 ; il a lu les deux fautes telles quelles), et comparée mot à mot : casse et retours à la ligne mis à part, rien d'autre n'est pardonné (ё n'est pas е). Une image fautive est peinte à nouveau avec une autre graine (sa graine plus 1000, puis plus 2000), jusqu'à trois fois, par tours : toutes les images fautives d'une exécution ensemble, pour que le peintre et l'auditeur changent de place une fois par tour. La première écrite exactement est gardée ; les autres essais vont dans le dossier misspelled/ de l'exécution, gardés, jamais supprimés. Quand aucun essai n'est juste, le plus proche est gardé et dit fautif, avec ce qu'il lit. Sans l'auditeur, les images sont gardées telles que peintes et dites non relues : jamais montrées comme justes.

**La carte pour la lecture** : l'auditeur veut environ 11 Go. Un peintre entier sur la carte met ses poids en RAM pendant que l'auditeur lit et les reprend après ; Qwen-Image 2.1 laisse la carte libre de lui-même ; un peintre en flux dont les blocs remplissent la carte laisse l'auditeur lire sur le processeur (environ 64 s par image).

**Les marques** : à côté de chaque image **✓ Aa** (écrit comme demandé), **⚠ Aa** (fautif à chaque essai ; sa bulle dit ce qu'elle lit et combien d'essais ont été faits), **? Aa** (non relu). La ligne de la scène dit *lettré « … »* et, pour une fautive, ce qu'elle lit.

**Temps** (RTX 3090, un carré) : Qwen-Image 2.1 a lettré une image finie en 118 s, relue juste aussitôt ; un fine-tune fp8 de Qwen-Image 2512 sans Lightning (30 pas, vrai CFG 4, la voie propre d'un fine-tune fp8) en a peint une avec ses lettres en 230 s, son chargement compté, dont environ 150 s de peinture. Une image fautive coûte une image entière de plus par essai : de deux variations de « LANTERN SONG / RUACH STUDIO », l'une est sortie juste aussitôt et l'autre est restée fautive aux trois essais (« RUCH STUDIO »), gardée et dite, en 743 s pour l'exécution. Lightning fait de chaque essai une fraction de cela. L'estimation du formulaire compte la lecture.

**Cyrillique** : « ФОСФОРИДА | Возвращение Шехины » de Viktor dans le style du prompt de son propre album. Qwen-Image 2512 a écrit juste le titre dans les neuf images ; la seconde ligne en minuscules dans aucun de six essais (les minuscules Щ et Ш griffonnées, « Вовуяеные Шехни ») ; en capitales, Щ et Ш sont sorties justes à chaque fois et seule la dernière lettre s'est trompée (« ШЕХИНЯ »), avec aussi la forme des lettres dite (son idée, HERESY 1396 : Ы, Щ, Ш et les autres lettres qu'un peintre entraîné sur le latin a rarement vues, et Ф à côté du Φ grec, chacune décrite quand les mots la portent). Une aide épelée (« Ф-О-С-Ф-… ») a été essayée puis abandonnée : le peintre peut peindre ses traits d'union dans le titre. Pour le cyrillique : des capitales, et regarde la marque.

**Pourquoi peint, et non composé** : une vraie police composée par le studio (crénage, approche et interlignage par raqm) et légèrement repeinte par-dessus écrit exactement, mais reste un calque sur l'image. Des quatre façons essayées, Viktor a choisi les deux où le peintre écrit lui-même les lettres.

## 11. Une image d'où peindre

**La référence** : dépose une image à sa place sous le prompt, colles-en une (Ctrl+V), choisis un fichier, ou prends l'image de la scène avec **Comme référence** (ou la pochette de la prise avec **La pochette de la prise**). PNG, JPEG ou WebP, 40 Mo au plus.

### L'utiliser

**L'utiliser**, sous l'image, dit comment :

- **pour peindre à partir d'elle** (par défaut) : d'image à image par le peintre du formulaire, autant que le dit **Combien elle peut changer** ;
- **pour la retoucher par les mots** : Qwen-Image 2.1 garde la scène et change ce que dit le prompt (*the same lighthouse in a snowy winter night* : la neige est venue là où elle va, la tour et les rochers gardés) ;
- **pour son style seulement** : Qwen-Image 2.1 peint la scène propre du prompt dans la technique, la touche, la palette et la lumière de l'image, sans rien garder de son sujet (un phare à l'huile a donné *a red fox in a snowy forest under the moon* de son pinceau).

Les deux dernières sont proposées quand Qwen-Image 2.1 est là. Avec l'une ou l'autre, l'exécution est celle du 2.1 quel que soit le peintre du formulaire : le modèle du formulaire, l'échantillonnage, les adaptateurs, le masque et la toile ne sont pas envoyés, et la licence du 2.1 s'applique. À l'intérieur, une référence de style est le prompt enveloppé dans une demande de ne prendre à l'image que son style et rien de son sujet ; la retouche est la voie propre du 2.1 avec une image de condition.

### Combien elle peut changer

D'image à image, ici, c'est ce qu'InvokeAI fait avec les modèles qui n'ont pas de pipeline pour cela : l'image couvre chaque format et est coupée en son centre, passe à l'envers par le décodeur du peintre vers des latents, et est bruitée jusqu'à un point du programme propre au peintre ; la peinture parcourt ensuite le reste du programme à partir de là. La force choisit ce point : le plus proche des pas propres du programme, deux pas au moins.

| force | ce qu'elle donne (essayé sur Krea 2 Muse, le peintre de la salle alors) |
|---|---|
| 0,3 | l'image presque telle quelle, sa surface touchée |
| 0,5 | l'image gardée, ses petites choses changées (lettrage, texture) |
| 0,6 | sa composition gardée, sa matière changée (le défaut de la salle) |
| 0,75 | la composition gardée, les matières du prompt prises |
| 0,9 | la scène du prompt peinte dans la lumière et les couleurs de l'image |
| 1,0 | peinte à neuf |

**Bruit ajouté** sous la force (0 par défaut, de 0 à 2) : du bruit frais posé sur les latents de l'image avant que la peinture ne parte d'eux, comme le fait le flux ComfyUI de Viktor avec InjectLatentNoise (`samples + noise · strength` dans l'espace propre du décodeur ; ici divisé par la dispersion de chaque canal, pour que le nombre signifie ce qu'il signifie là-bas). 0,3 apporte un grain et un détail neufs, 0,6 est sa seconde passe, au-dessus de 1 les formes de l'image commencent à se briser. Il ne déplace que le départ : ce qu'un masque garde reste net.

### Masque

**Masque…** peint sur l'image ce qui doit être repeint (Peindre et Effacer, B et E ; le pinceau et sa taille, `[` et `]` ; Inverser ; Vider) : le reste demeure exactement tel qu'il était, comme en inpainting. À l'intérieur, le masque passe sur la grille propre des latents, et à chaque pas la partie gardée est remise comme l'image bruitée jusqu'à ce pas ; l'image finie prend les pixels propres de l'image hors du masque, en fondu.

Quatre options sous l'image quand un masque est actif (ou Peindre autour) :

- **Étendre** : le masque grossi de tant de pixels, ou rétréci (de −64 à 128) ;
- **Bord** : la douceur de son bord (de 0 à 96 px) ;
- **Doux** : un repeint doux, comme la differential diffusion : là où le bord est gris, l'image ne change qu'aux derniers pas, donc pas de couture ;
- **Grain** : la part de la peinture neuve que prend la partie gardée à chaque pas (de 0 à 0,6), son grain et sa lumière cousus aux neufs ; 0 la garde exacte.

Le bord d'un masque rond peut rester visible sans eux ; Étendre 16, Bord 24, Doux et Grain 0,15 ont cousu un visage neuf dans une vieille toile sans une ligne.

### Peindre autour

**Peindre autour** tient l'image entière au milieu de chaque format et peint à neuf les bords qu'elle laisse, dans ses couleurs et sa lumière : une pochette carrée en 16:9 pour une vidéo ou en 9:16 pour un short, comme de l'outpainting.

### La toile

**Toile…** à côté de Masque… ouvre la toile, comme celle d'InvokeAI : le cadre de chaque format un onglet en haut, disant comment il sera peint (**à partir d'elle** : l'image couvre le cadre et l'exécution peint à partir d'elle à la force demandée ; **autour** : la part du cadre qu'elle laisse nue est peinte autour d'elle). Sur la planche, **Déplacer** (V) fait glisser l'image, ou un coin pour la mettre à l'échelle, le coin opposé tenu ; **Pinceau** (B) et **Gomme** (E) peignent par-dessus le masque d'inpainting ; **Main** (H, ou Espace maintenu) déplace la planche ; la molette zoome, Alt+molette met l'image à l'échelle autour du pointeur, les flèches la poussent (Maj : dix pixels). À droite les calques et la place en chiffres ; en haut **Ajuster**, **Remplir**, **Centrer** et **Pareil partout**, annuler et rétablir (trente pas). **Terminé** garde la place de chaque format avec la référence et le masque dans le formulaire. Une place est le centre de l'image en part du cadre et sa largeur en largeurs de cadre.

## 12. La seconde passe

**Seconde passe…**, sur la scène à côté de Suréchantillonner…, repeint une image plus grande, comme le fait le flux ComfyUI de Viktor après sa première passe : l'image montée **×1,5** ou **×2** au plus proche voisin et peinte à nouveau par le peintre, le fine-tune, les adaptateurs, le prompt et la graine propres de son exécution, à partir d'une partie du chemin.

**Comment son flux le fait**, lu nœud par nœud : l'image de la première passe 2× en nearest-exact, encodée par tuiles, InjectLatentNoise 0,6, puis un second KSampler à partir du pas 20 sur 60 à CFG 4,5, avec le même échantillonneur et le même programme que la première passe (tous deux viennent d'un seul packer : ER-SDE et Bong tangent tel que le flux est enregistré).

**Dans le studio** : **Combien elle peut changer** (0,5 d'abord : 0,3 garde le dessin et ajoute du détail, 0,5 affûte sa matière, 0,7 repeint ses formes) et **Bruit ajouté** (0,6 d'abord, comme le sien) sur sa ligne ; les pas, l'échantillonneur, le programme et Lightning sont ceux du formulaire quand le formulaire peint avec le même peintre, sinon ceux de l'exécution. Sa recette donne à la seconde passe beaucoup de pas et pas de Lightning : règle-les dans le formulaire avant d'appuyer sur ×2.

**Ce qu'elle coûte et donne** : un 16:9 de 1920 × 1080 en sort en 3840 × 2160. Sur une 3090, un fine-tune fp8 de Qwen-Image 2512 en 3840 × 2160 en 220 s avec 12 pas et Lightning (22,9 Go, ses blocs en flux). À 0,6, il a gardé la scène et déplacé un peu ses parties ; à 0,5, la composition a tenu. Pas pour Qwen-Image 2.1 ; ni masque ni toile avec elle. **Encore** sur une seconde passe la repeint à sa taille.

## 13. Suréchantillonner

**Suréchantillonner…** sur la scène fait d'une image une **2K** ou une **4K** (son grand côté 2560 ou 3840) avec un suréchantillonneur de `artwork/upscalers/` (`.pth` ou `.safetensors`, dossiers permis) : ESRGAN, DAT, HAT, ATD, SPAN, OmniSR et leurs cousins, lus par spandrel d'après le seul fichier. L'image passe par tuiles de 512 avec 32 de recouvrement, le milieu de chaque tuile gardé (pas de couture) ; un modèle 4× à qui l'on demande moins peint en 4× et est ramené par Lanczos, plus finement qu'un modèle 2×. Le grand côté s'arrête à 10 240 px. Le **i** à côté du choix dit à quoi sert le suréchantillonneur choisi (photos, visages, dessin), son auteur, sa licence et son temps mesuré ; un clic ouvre les notes de tous, groupés, les plus rapides d'abord, les non commerciaux marqués.

**Passes…** fait un suréchantillonnage en passes, comme la pile ComfyUI de Viktor : jusqu'à quatre lignes d'un modèle et d'un facteur, chacune passée sur l'image telle qu'elle est et ramenée à la taille d'origine fois le facteur de la passe, puis le grand côté demandé et les couleurs accordées à l'original (hm-mvgd-hm : histogrammes, moyenne et covariance, histogrammes). Sa chaîne est à un clic quand ses modèles sont là : span otf strong ×2, puis Nomos8kDAT ×4, Remacri ×1,5, UltraMix Balanced ×2 : une image 1920 × 1080 vers 7680 × 4320 en 246 s, sans couture, les couleurs gardées.

**TTA** à côté du suréchantillonneur : chaque tuile passe par le modèle dans ses huit orientations (quatre rotations, chacune en miroir), moyennées : des bords et des textures plus stables, jusqu'à huit fois le temps. **Suréchantillonner…** sur la barre des images choisies (Ctrl+clic) en monte jusqu'à 64 d'un coup, réparties sur les cartes du labo.

Le suréchantillonnage et la seconde passe font des choses différentes : un suréchantillonneur affûte ce qui est là ; une seconde passe peint un détail neuf à la nouvelle taille. Pour une impression : seconde passe ×2 d'abord, puis suréchantillonnage.

## 14. La scène, la bibliothèque et la corbeille

**La scène** : un clic sur une image l'y met avec son exécution dessous ; un clic sur elle (ou un double clic sur n'importe quelle image) l'ouvre sur la page dans son propre format (← → parcourent l'exécution, ou la galerie ; Échap ferme). Dessous : **Vers le formulaire**, **Comme référence**, **Comparer…**, **Note…** (une note à toi : gardée avec l'image dans son exécution et montrée dans sa bulle ; une note vide l'enlève), **Mettre en pochette** (une carrée), **Télécharger** (PNG, pleine taille), **Sur la page**, ★, **Protéger** (le bouclier : une image protégée ne va jamais à la corbeille ni n'est supprimée, quoi qui l'y ait envoyée), **Corbeille**, **Seconde passe…**, **Suréchantillonner…**. Les données et le prompt de l'exécution se tiennent dans une bulle à côté de l'image tant que le pointeur est dessus.

**Exécutions ou Galerie** : les exécutions montrent chaque appui sur Dessiner avec son prompt et sa graine, les plus récentes en haut ; la galerie montre chaque image de chaque exécution dans une seule grille, par format, étoilées ou protégées, en trois tailles, en tuiles égales. Les flèches parcourent la bibliothèque tant qu'elle a une image : ← → l'image d'avant et d'après, ↑ ↓ une rangée de la galerie (dans les exécutions, l'exécution d'avant et d'après) ; la scène suit.

**Comparer** : **Comparer…**, puis l'autre image choisie dans la bibliothèque : les deux l'une sur l'autre sous un séparateur que tu fais glisser (← → le déplacent), ou côte à côte (S) ; X les échange, Échap ferme.

**Le menu d'une image** (un clic droit sur n'importe quelle image) : Sur la page, Vers la scène, Vers le formulaire, Tout vers le formulaire, Comme référence, Comparer…, Mettre en pochette, Suréchantillonner (2K ou 4K), Mettre une étoile, La choisir, Copier le prompt, Copier la graine, Télécharger, Le fichier dans un nouvel onglet, Son exécution, À la corbeille.

**En choisir plusieurs** : Ctrl+clic choisit des images, Maj+clic une plage ; la barre des choisies les étoile, les suréchantillonne ou les met à la corbeille d'un coup (Échap les relâche).

**La corbeille** : **Corbeille** sur une exécution la déplace dans `trash/artist/` ; la Corbeille de la scène met une image de côté. La vue **Corbeille** montre les images mises de côté (Restaurer, ✕, Tout restaurer), puis les exécutions à la corbeille (Restaurer, Supprimer définitivement) ; **Tout effacer** supprime tout ce qu'elle montre, après avoir demandé. **Corbeille (illustrations)** dans le Bibliothécaire tient l'art rangé dans une seule liste, les pochettes retirées des prises aussi.

**Le journal du Peintre** : le cadre du journal du serveur a une vue **Peintre**, celle propre à la salle : ce qui a été demandé (le peintre, le fine-tune, les formats, la graine, l'échantillonnage, les adaptateurs), ce que le labo a répondu (un refus dans ses propres mots), le chemin de chaque exécution jusqu'à sa fin (attentes et pourquoi, la carte où elle peint, fini, arrêté, échoué et pourquoi). **⧉** l'ouvre dans une fenêtre à lui, avec les cartes en direct à côté.

## 15. Des pochettes pour les prises

**Mettre en pochette** sur une image carrée en fait la pochette de la prise en main : sur sa carte, dans le lecteur et dans son MP3. La pochette qu'elle avait est gardée à côté de la prise (`artwork-removed/`), et l'autre lettre d'une paire A/B reçoit aussi la nouvelle quand elle n'en a pas. Une pochette est la copie propre de la prise (1024 px, nommant l'exécution et l'image d'où elle vient), si bien que l'ôter de la prise ne touche jamais l'image, et que l'image qui s'en va ne touche jamais la pochette ; mettre une telle image à la corbeille demande s'il faut ôter aussi la pochette de la prise, ou la laisser.

**La pochette propre d'une prise** (*Dessiner l'illustration* dans son menu, dans le Bibliothécaire, pour une prise ou plusieurs) est peinte par le peintre choisi dans **Moteur → Illustration**, ou selon les cartes quand aucun n'est choisi : **Qwen-Image 2512** là où une carte des tâches du labo le tient entier (Q6 dès 20 Go, Q4 dès 16 Go : il suit le mieux le prompt et lettre juste un titre), sinon Q4 en flux depuis la RAM sur une carte plus petite (environ 6 Go de la carte et 30 Go de RAM). Un petit modèle de langage écrit son prompt à partir du style et des mots de la prise, et le critique regarde si son sujet y est. Une pochette est une tâche à part qui charge son peintre à neuf : sur une 3090, Qwen-Image 2512 Q4 de 105 à 125 s, Q6 131 s, son fp8 BASE 95 s, tout compté (section 18). Un Q4 n'est guère plus rapide qu'un Q6 : peindre, c'est l'arithmétique de la carte, pas sa mémoire.

## 16. Recettes

**Une pochette, vite.** Qwen-Image 2512 Q4 avec ⚡ Lightning, 1:1, Variations 4, l'échantillonnage tel qu'il vient. Environ trois minutes pour quatre candidates, chargement compris ; choisis, Mettre en pochette.

**Réalisme abouti.** Qwen-Image 2512 avec un fine-tune fp8, Lightning coupé, 30 à 40 pas, Guidage 4, ER-SDE ou RES 2s avec Beta. Puis Seconde passe ×2 à 0,45 avec Bruit ajouté 0,6 (l'échantillonnage du formulaire y passe), puis Suréchantillonner 4K ou les passes.

**La première et la seconde passe du ComfyUI de Viktor.** Un fine-tune fp8, ER-SDE et Bong tangent, 12 pas ; Seconde passe ×2 avec 0,6 de bruit ajouté et beaucoup de pas sans Lightning, la force entre 0,5 et 0,65.

**Une image de vidéo à partir d'une pochette.** La pochette comme référence, Peindre autour, le format 16:9 (ou 9:16 pour un short) : les bords peints dans ses couleurs et sa lumière, la pochette entière au milieu. Sur la toile, déplace ou mets à l'échelle d'abord la pochette dans chaque cadre si elle ne doit pas se tenir au milieu.

**Réparer une partie.** L'image comme référence, Masque… sur la partie, le prompt disant ce qui doit s'y trouver, force 1,0 ; Étendre 16, Bord 24, Doux, Grain 0,15 pour une couture qu'on ne voit pas.

**Deux sujets à leur place.** Le prompt principal pour toute la scène, une région pour chaque sujet (moitié gauche, moitié droite), les mots des régions courts et concrets.

**Le style d'un vieux tableau pour une scène neuve.** Le tableau comme référence, L'utiliser : pour son style seulement, le prompt pour la scène neuve.

**La même scène en une autre saison ou heure.** L'image comme référence, L'utiliser : pour la retoucher par les mots, le prompt disant le changement (*the same street in heavy rain at night*).

**Une impression.** Seconde passe ×2, puis Passes… jusqu'à 7680 sur le grand côté, TTA pour un ciel lisse.

## 17. Quand quelque chose tourne mal

| ce que tu vois | pourquoi | que faire |
|---|---|---|
| le sujet peint deux fois | Qwen-Image 2512 avec Lightning sur Karras, Exponential ou KL optimal | Simple, Beta, Beta 57, SGM uniform ou Bong tangent |
| des images Qwen douces et brumeuses | Euler SDE sans Lightning | Euler, ER-SDE ou RES |
| couleurs et contours brûlés | la somme des adaptateurs au-delà d'environ 1,8 | baisse-les (la barre Ensemble), ou des images clés qui en lâchent un tôt |
| « l'adaptateur n'atteint aucune couche » | un adaptateur fait pour un autre modèle | mets-le dans le dossier de sa propre famille |
| des lettres que tu n'as pas demandées | les deux peintres lettrent les pochettes d'eux-mêmes | termine le prompt par *no text* |
| une image manque à une exécution | le filtre de contenu l'a signalée | l'exécution le dit ; change le prompt |
| une couture visible autour d'un masque | un bord dur | Étendre, Bord, Doux et un peu de Grain |
| la seconde passe a déplacé la scène | la force trop haute | 0,4 à 0,5 |
| l'exécution attend une carte | les cartes du labo sont occupées ou trop petites pour l'instant | l'activité du journal dit pourquoi ; Hors de la file la reprend |
| « aucune carte ici ne peut prendre cela » | le peintre avec ses adaptateurs demande plus que n'importe quelle carte ne tient | moins d'adaptateurs ou un peintre plus petit (Qwen-Image 2512 et 2.1 vont en flux à la place quand ils peuvent) |
| régions ignorées | Qwen-Image 2.1 choisi, ou une région sans mots | Qwen-Image 2512, des mots dans chaque région |
| première exécution lente, suivantes rapides | le peintre se charge une fois et reste dix minutes | comme prévu |

## 18. Les chiffres

Mesurés sur une RTX 3090 (24 Go) avec les outils propres du studio.

| quoi | temps | carte au pic |
|---|---|---|
| Qwen-Image 2512 Q4, 1328², Lightning | 30 s | 14,3 Go |
| Qwen-Image 2512 Q6, 1328², Lightning | 32 s | 17,6 Go |
| fine-tune fp8 de Qwen-Image 2512, 1328², Lightning 0,55, 12 pas | 37 s | 21,0 Go |
| fine-tune fp8 de Qwen-Image 2512, 16:9 | environ 141 s avec son chargement | 20,5 Go |
| Qwen-Image 2.1 à partir des mots, 1328² | 120 s | 16,4 Go (entier), 4,1 Go (en flux) |
| Qwen-Image 2.1 en retouche | 122 à 129 s | 19,1 Go (entier), 7,9 Go (en flux) |
| seconde passe ×2, fine-tune fp8 de Qwen-Image 2512 vers 3840 × 2160 | 220 s | 22,9 Go |
| suréchantillonnage ×2, 4x_Nomos8kDAT, 1280² vers 2560² | 32 s | 2,1 Go |
| suréchantillonnage en passes, sa chaîne, 1920 × 1080 vers 7680 × 4320 | 246 s | |
| pochette d'une prise par Qwen-Image 2512 fp8 BASE (une tâche à part : le peintre chargé, le prompt écrit, le regard du critique) | environ 95 s | |
| pochette d'une prise par Qwen-Image 2512 Q4 / Q6, de même | 105–125 s / 131 s | |

La première exécution d'un peintre ajoute son chargement : une minute ou deux pour les peintres Qwen.

## 19. Pour les scripts et les agents

Le labo répond sur la machine du studio (par la page à `/lab/…`) ; l'API du studio (`/api/v1`, OpenAPI 3.1) et son serveur MCP se tiennent à côté. Les points d'accès propres du Peintre :

- `POST /artist/draw` : une exécution. Son corps : `prompt` ; `shapes` (`1:1`, `16:9`, `9:16`) ; `count` (de 1 à 4) ; `seed` ; `painter` (`qwen2512-q4`, `qwen2512-q6`, `qwen2512-fp8`, `qwen21`) ; `model` (le fichier d'un fine-tune fp8) ; `sampling` (`steps`, `sampler`, `schedule`, `lightning`, `cfg`) ; `loras` (`[{id, weight, keys}]`) ; `ref` (une data URL, ou `{id, file}` d'une image d'une exécution antérieure) avec `strength` (de 0,2 à 1) et `ref_as` (`edit`, `style`) ; `mask` avec `mask_opts` (`grow`, `edge`, `soft`, `grain`) ; `fit` (peindre autour) ; `place` (la toile : `{shape: {x, y, s}}`) ; `inject` (de 0 à 2) ; `scale` (1,5 ou 2, une seconde passe) ; `regions` (`[{prompt, box: [x, y, w, h]}]`, trois au plus) ; `letters` (`{title, sub, look, where, way}` : `where` `top`, `middle` ou `bottom`, `way` `paint` ou `letter` ; avec `letter` le peintre est `qwen21` avec un `ref`, et `prompt` peut être vide) ; `preview` ; `take`. Une exécution lettrée porte `letters_prompt` (la phrase que le peintre a lue), et chacune de ses images `letters` : `{read, exact, near, tries}`, ou `{unread}` quand l'auditeur n'a pas pu la lire.
- `GET /artist/runs`, `GET /artist/file`, `POST /artist/stop`, `POST /artist/cover`, `POST /artist/star`, `POST /artist/note` (`{id, file, note}`), `POST /artist/protect`, `POST /artist/trash`, `POST /artist/restore`, `POST /artist/aside`.
- `GET /artist/painters` (les peintres ici, leurs cartes et leurs fine-tunes), `POST /artist/unload` (relâcher les peintres gardés).
- `GET /artist/upscalers`, `POST /artist/upscale` (`{id, file, model, target}` avec `2k` ou `4k` ; ou `passes`, `resample`, `long`, `match` ; `tta` ; ou `items` pour plusieurs).
- `GET /artist/loras`, `POST /artist/lora-civitai` (recherche par empreinte), `POST /artist/civitai-look`, `POST /artist/civitai-fetch`.

Un refus revient en `400` avec la raison en mots, les mêmes mots que montre la salle.

## 20. Licences

Le filtre de contenu (Falconsai) et le rédacteur de prompts (Qwen3-4B) : Apache-2.0 ; le filtre regarde chaque image que peint le studio. Qwen-Image 2512 et Lightning : Apache-2.0. Les fine-tunes fp8 : les conditions de chaque auteur. Qwen-Image 2.1 : la Qwen Research Licence, recherche et évaluation seulement. Adaptateurs : les conditions de chaque auteur, telles que Civitai les liste. Suréchantillonneurs : chacun les siennes ; les notes d'OpenModelDB disent lesquels sont non commerciaux, et la salle les marque. Ce que tu peux faire des images que tu peins en découle ; quand cela compte, lis-les avant de vendre.

## 21. Ce qui vient ensuite

Les versions de l'image d'une prise, et SeedVR comme suréchantillonneur (en 2.1.0, avec la phase du DAW).
