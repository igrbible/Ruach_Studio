// HERESY 2453 (Viktor 12.11.2026: «все заглавные в начале предложений, на гласных и даже согласных перед гласной внутри предложения нужно переводить в
// lowcase. Но не в подаче из пользовательского редактора или карточки, а прямо в редакторах текстов Чтеца и Писателя, да и даже Музыканта приписать
// парсер, который будет нормализовывать тексты по клику на кнопку. Обязательно на кнопку объяснение, что и зачем… Либо весь текст переводить в lowcase,
// либо по выделению, как я делаю часто в mcedit - выделил > f11 > l или u»): the case buttons of the text editors. A button with data-case="lower" or
// "upper" and data-case-for="<the textarea's id>" acts on that box: lower, the selection or the whole text when nothing is selected; upper, the
// selection only. Tags in [brackets] ([Verse], [chorus], [sighs]) are never touched, nor, where data-case-speakers names a select that says «dialog»,
// a dialog line's «Name:». The change goes in as one edit of the box (execCommand insertText, so Ctrl+Z gives it back in one step, and the box's own
// input listeners hear it), only the span that changes is replaced, and nothing ever runs on its own: not on reading, not on singing.
// The words in thirteen languages are this file's own, given to RuachI18n keyed by their English as every catalog of the page is.
(function () {
  "use strict";
  var TAG = /\[[^\[\]\n]{0,160}\]/g;
  var SPEAKER = /^([ \t]*[^\s:<>|\d\[][^:<>|\n]{0,39}?)[ \t]*[:：]/gm;   // lab/reader.py SPEAKER: a dialog line's «Name:»
  var hooks = {};

  var LANGS = ["en", "ru", "uk", "be", "el", "es", "it", "fr", "pt", "de", "ja", "zh", "he"];
  var W = {
    lowTip: ["Lower case: the selection, or the whole text when nothing is selected. Why: the voice engines read a capital as a stress mark (Drama reads «маркЕтинг» with its stress on the capital), so a capital at a sentence's start or inside a name can move a stress where you did not put it. Lower the case, listen, then mark the stresses yourself by ear: an acute (U+0301) after the vowel or a capital vowel. Tags in [brackets] and a dialog's speaker names stay as they are; nothing is changed on its own when you read or sing. Ctrl+Z gives the text back in one step.",
      "Строчные: выделение или весь текст, если ничего не выделено. Зачем: движки голоса читают заглавную как знак ударения (Drama читает «маркЕтинг» с ударением на заглавной), поэтому заглавная в начале предложения или внутри имени может поставить ударение туда, куда ты его не ставил. Переведи в строчные, послушай, а потом расставь ударения сам на слух: акут (U+0301) после гласной или заглавная гласная. Теги в [скобках] и имена говорящих в диалоге остаются как есть; при чтении и пении текст сам по себе не меняется. Ctrl+Z возвращает текст одним шагом.",
      "Малі літери: виділення або весь текст, якщо нічого не виділено. Навіщо: рушії голосу читають велику літеру як знак наголосу (Drama читає «маркЕтинг» з наголосом на великій), тож велика літера на початку речення чи всередині імені може поставити наголос туди, куди ти його не ставив. Переведи в малі, послухай, а тоді розстав наголоси сам на слух: акут (U+0301) після голосної або велика голосна. Теги в [дужках] та імена мовців у діалозі лишаються як є; під час читання та співу текст сам не змінюється. Ctrl+Z повертає текст одним кроком.",
      "Малыя літары: вылучэнне або ўвесь тэкст, калі нічога не вылучана. Навошта: рухавікі голасу чытаюць вялікую літару як знак націску (Drama чытае «маркЕтинг» з націскам на вялікай), таму вялікая літара ў пачатку сказа ці ўнутры імя можа паставіць націск туды, куды ты яго не ставіў. Перавядзі ў малыя, паслухай, а потым расстаў націскі сам на слых: акут (U+0301) пасля галоснай або вялікая галосная. Тэгі ў [дужках] і імёны тых, хто гаворыць у дыялогу, застаюцца як ёсць; пры чытанні і спеве тэкст сам не мяняецца. Ctrl+Z вяртае тэкст адным крокам.",
      "Πεζά: η επιλογή, ή όλο το κείμενο όταν δεν έχει επιλεγεί τίποτα. Γιατί: οι μηχανές φωνής διαβάζουν το κεφαλαίο ως σημάδι τόνου (η Drama διαβάζει «маркЕтинг» με τον τόνο στο κεφαλαίο), οπότε ένα κεφαλαίο στην αρχή πρότασης ή μέσα σε όνομα μπορεί να μετακινήσει τον τόνο εκεί που δεν τον έβαλες. Κάνε τα πεζά, άκουσε και μετά βάλε μόνος σου τους τόνους με το αυτί: οξεία (U+0301) μετά το φωνήεν ή κεφαλαίο φωνήεν. Οι ετικέτες σε [αγκύλες] και τα ονόματα των ομιλητών σε διάλογο μένουν όπως είναι· τίποτα δεν αλλάζει μόνο του όταν διαβάζεις ή τραγουδάς. Το Ctrl+Z επαναφέρει το κείμενο σε ένα βήμα.",
      "Minúsculas: la selección, o todo el texto si no hay nada seleccionado. Por qué: los motores de voz leen una mayúscula como marca de acento (Drama lee «маркЕтинг» con el acento en la mayúscula), así que una mayúscula al inicio de una frase o dentro de un nombre puede mover el acento adonde no lo pusiste. Pásalo a minúsculas, escucha y luego marca tú mismo los acentos de oído: un agudo (U+0301) tras la vocal o una vocal mayúscula. Las etiquetas entre [corchetes] y los nombres de quien habla en un diálogo quedan como están; nada cambia por sí solo al leer o cantar. Ctrl+Z devuelve el texto en un solo paso.",
      "Minuscole: la selezione, o tutto il testo se non c'è nulla di selezionato. Perché: i motori vocali leggono una maiuscola come segno d'accento (Drama legge «маркЕтинг» con l'accento sulla maiuscola), quindi una maiuscola a inizio frase o dentro un nome può spostare l'accento dove non l'hai messo. Porta in minuscolo, ascolta e poi segna tu gli accenti a orecchio: un acuto (U+0301) dopo la vocale o una vocale maiuscola. I tag tra [parentesi quadre] e i nomi di chi parla in un dialogo restano come sono; nulla cambia da solo quando leggi o canti. Ctrl+Z restituisce il testo in un solo passo.",
      "Minuscules : la sélection, ou tout le texte si rien n'est sélectionné. Pourquoi : les moteurs de voix lisent une majuscule comme une marque d'accent (Drama lit « маркЕтинг » avec l'accent sur la majuscule), donc une majuscule en début de phrase ou dans un nom peut déplacer l'accent là où tu ne l'as pas mis. Passe en minuscules, écoute, puis marque toi-même les accents à l'oreille : un aigu (U+0301) après la voyelle ou une voyelle majuscule. Les balises entre [crochets] et les noms de ceux qui parlent dans un dialogue restent tels quels ; rien ne change tout seul quand tu lis ou chantes. Ctrl+Z rend le texte en une seule étape.",
      "Minúsculas: a seleção, ou o texto todo quando nada está selecionado. Por quê: os motores de voz leem uma maiúscula como marca de acento (o Drama lê «маркЕтинг» com o acento na maiúscula), então uma maiúscula no início de uma frase ou dentro de um nome pode mover o acento para onde você não o pôs. Passe para minúsculas, ouça e depois marque você mesmo os acentos de ouvido: um agudo (U+0301) depois da vogal ou uma vogal maiúscula. As tags entre [colchetes] e os nomes de quem fala num diálogo ficam como estão; nada muda sozinho quando você lê ou canta. Ctrl+Z devolve o texto num só passo.",
      "Kleinbuchstaben: die Auswahl, oder der ganze Text, wenn nichts ausgewählt ist. Warum: Die Stimm-Engines lesen einen Großbuchstaben als Betonungszeichen (Drama liest „маркЕтинг“ mit der Betonung auf dem Großbuchstaben), also kann ein Großbuchstabe am Satzanfang oder in einem Namen die Betonung dorthin schieben, wo du sie nicht gesetzt hast. Mach alles klein, hör hin und setz die Betonungen dann selbst nach Gehör: einen Akut (U+0301) nach dem Vokal oder einen großen Vokal. Tags in [eckigen Klammern] und die Namen der Sprecher im Dialog bleiben, wie sie sind; beim Lesen oder Singen ändert sich nichts von selbst. Strg+Z gibt den Text in einem Schritt zurück.",
      "小文字に: 選択範囲、何も選択していなければテキスト全体。理由: 音声エンジンは大文字をアクセント記号として読みます(Drama は「маркЕтинг」を大文字の位置にアクセントを置いて読みます)。そのため、文頭や名前の中の大文字が、置いていない場所にアクセントを移すことがあります。小文字にして聞き、それから耳で自分でアクセントを付けてください: 母音の後に鋭アクセント(U+0301)、または母音を大文字に。[角かっこ] のタグと対話の話者名はそのまま残ります。読み上げや歌の時に勝手に変わることはありません。Ctrl+Z で一度に元に戻せます。",
      "转小写:选中的部分;未选中时为全文。原因:语音引擎把大写字母当作重音标记(Drama 读「маркЕтинг」时把重音放在大写字母上),所以句首或名字里的大写字母可能把重音挪到你没放的位置。先转为小写,听一遍,再凭耳朵自己标重音:在元音后加锐音符(U+0301),或把元音写成大写。[方括号] 里的标签和对话中说话人的名字保持不变;朗读或演唱时文本不会自行改变。Ctrl+Z 一步还原。",
      "אותיות קטנות: הבחירה, או כל הטקסט כשלא נבחר דבר. למה: מנועי הקול קוראים אות גדולה כסימן הטעמה (Drama קוראת «маркЕтинг» עם ההטעמה על האות הגדולה), ולכן אות גדולה בתחילת משפט או בתוך שם עלולה להזיז את ההטעמה למקום שלא שמת בו. הפוך לאותיות קטנות, הקשב, ואז סמן את ההטעמות בעצמך לפי האוזן: אקוט (U+0301) אחרי התנועה או תנועה באות גדולה. תגיות ב[סוגריים מרובעים] ושמות הדוברים בדיאלוג נשארים כמו שהם; שום דבר לא משתנה מעצמו כשאתה קורא או שר. Ctrl+Z מחזיר את הטקסט בצעד אחד."],
    upTip: ["Upper case: the selection only. Select a vowel and raise it to mark the stress the way the voice engines heed it (маркЕтинг), or raise a word you want shouted. Tags in [brackets] stay as they are. Ctrl+Z gives it back in one step.",
      "Заглавные: только выделение. Выдели гласную и подними её, чтобы отметить ударение так, как его слышат движки голоса (маркЕтинг), или подними слово, которое нужно выкрикнуть. Теги в [скобках] остаются как есть. Ctrl+Z возвращает одним шагом.",
      "Великі літери: лише виділення. Виділи голосну й підніми її, щоб позначити наголос так, як його чують рушії голосу (маркЕтинг), або підніми слово, яке треба викрикнути. Теги в [дужках] лишаються як є. Ctrl+Z повертає одним кроком.",
      "Вялікія літары: толькі вылучэнне. Вылучы галосную і падымі яе, каб пазначыць націск так, як яго чуюць рухавікі голасу (маркЕтинг), або падымі слова, якое трэба выкрыкнуць. Тэгі ў [дужках] застаюцца як ёсць. Ctrl+Z вяртае адным крокам.",
      "Κεφαλαία: μόνο η επιλογή. Επίλεξε ένα φωνήεν και κάν' το κεφαλαίο για να σημειώσεις τον τόνο όπως τον ακούν οι μηχανές φωνής (маркЕтинг), ή κάνε κεφαλαία μια λέξη που θέλεις φωναχτή. Οι ετικέτες σε [αγκύλες] μένουν όπως είναι. Το Ctrl+Z την επαναφέρει σε ένα βήμα.",
      "Mayúsculas: solo la selección. Selecciona una vocal y súbela para marcar el acento como lo oyen los motores de voz (маркЕтинг), o sube una palabra que quieras gritada. Las etiquetas entre [corchetes] quedan como están. Ctrl+Z lo devuelve en un solo paso.",
      "Maiuscole: solo la selezione. Seleziona una vocale e alzala per segnare l'accento come lo sentono i motori vocali (маркЕтинг), o alza una parola che vuoi gridata. I tag tra [parentesi quadre] restano come sono. Ctrl+Z la restituisce in un solo passo.",
      "Majuscules : la sélection seulement. Sélectionne une voyelle et passe-la en majuscule pour marquer l'accent comme les moteurs de voix l'entendent (маркЕтинг), ou un mot que tu veux crié. Les balises entre [crochets] restent telles quelles. Ctrl+Z le rend en une seule étape.",
      "Maiúsculas: só a seleção. Selecione uma vogal e suba-a para marcar o acento como os motores de voz o ouvem (маркЕтинг), ou suba uma palavra que quer gritada. As tags entre [colchetes] ficam como estão. Ctrl+Z devolve num só passo.",
      "Großbuchstaben: nur die Auswahl. Wähl einen Vokal und mach ihn groß, um die Betonung so zu setzen, wie die Stimm-Engines sie hören (маркЕтинг), oder ein Wort, das gerufen werden soll. Tags in [eckigen Klammern] bleiben, wie sie sind. Strg+Z gibt es in einem Schritt zurück.",
      "大文字に: 選択範囲のみ。母音を選んで大文字にすると、音声エンジンが聞き取る形でアクセントを付けられます(маркЕтинг)。叫ばせたい単語にも使えます。[角かっこ] のタグはそのまま残ります。Ctrl+Z で一度に元に戻せます。",
      "转大写:仅选中的部分。选中一个元音并转为大写,就能按语音引擎听得懂的方式标出重音(маркЕтинг),也可用于想要喊出来的词。[方括号] 里的标签保持不变。Ctrl+Z 一步还原。",
      "אותיות גדולות: רק הבחירה. בחר תנועה והגדל אותה כדי לסמן את ההטעמה כפי שמנועי הקול שומעים אותה (маркЕтинг), או מילה שתרצה שתישמע בצעקה. תגיות ב[סוגריים מרובעים] נשארות כמו שהן. Ctrl+Z מחזיר בצעד אחד."],
    low: ["To lower case", "В строчные", "У малі літери", "У малыя літары", "Σε πεζά", "A minúsculas", "In minuscolo", "En minuscules", "Para minúsculas", "In Kleinbuchstaben",
      "小文字に", "转小写", "לאותיות קטנות"],
    up: ["To upper case", "В заглавные", "У великі літери", "У вялікія літары", "Σε κεφαλαία", "A mayúsculas", "In maiuscolo", "En majuscules", "Para maiúsculas", "In Großbuchstaben",
      "大文字に", "转大写", "לאותיות גדולות"],
    noneLow: ["No capitals to lower here: tags in [brackets] stay as they are", "Здесь нет заглавных: теги в [скобках] остаются как есть",
      "Тут немає великих літер: теги в [дужках] лишаються як є", "Тут няма вялікіх літар: тэгі ў [дужках] застаюцца як ёсць",
      "Δεν υπάρχουν κεφαλαία εδώ: οι ετικέτες σε [αγκύλες] μένουν όπως είναι", "Aquí no hay mayúsculas: las etiquetas entre [corchetes] quedan como están",
      "Qui non ci sono maiuscole: i tag tra [parentesi quadre] restano come sono", "Pas de majuscules ici : les balises entre [crochets] restent telles quelles",
      "Não há maiúsculas aqui: as tags entre [colchetes] ficam como estão", "Hier gibt es keine Großbuchstaben: Tags in [eckigen Klammern] bleiben, wie sie sind",
      "ここに大文字はありません: [角かっこ] のタグはそのまま残ります", "这里没有大写字母:[方括号] 里的标签保持不变", "אין כאן אותיות גדולות: תגיות ב[סוגריים מרובעים] נשארות כמו שהן"],
    pick: ["Select the letters to raise first: upper case acts on a selection only", "Сначала выдели буквы: заглавные ставятся только на выделение",
      "Спершу виділи літери: великі ставляться лише на виділення", "Спачатку вылучы літары: вялікія ставяцца толькі на вылучэнне",
      "Επίλεξε πρώτα τα γράμματα: τα κεφαλαία μπαίνουν μόνο σε επιλογή", "Selecciona primero las letras: las mayúsculas solo actúan sobre una selección",
      "Seleziona prima le lettere: le maiuscole agiscono solo su una selezione", "Sélectionne d'abord les lettres : les majuscules n'agissent que sur une sélection",
      "Selecione primeiro as letras: as maiúsculas só agem numa seleção", "Wähl zuerst die Buchstaben: Großbuchstaben wirken nur auf eine Auswahl",
      "先に文字を選択してください: 大文字化は選択範囲にのみ働きます", "请先选中字母:转大写只作用于选中的部分", "בחר קודם את האותיות: אותיות גדולות פועלות רק על בחירה"],
    noneUp: ["No small letters to raise in the selection", "В выделении нет строчных букв", "У виділенні немає малих літер", "У вылучэнні няма малых літар",
      "Δεν υπάρχουν πεζά γράμματα στην επιλογή", "No hay minúsculas en la selección", "Nessuna minuscola nella selezione", "Aucune minuscule dans la sélection",
      "Não há minúsculas na seleção", "Keine Kleinbuchstaben in der Auswahl", "選択範囲に小文字はありません", "选中部分没有小写字母", "אין אותיות קטנות בבחירה"],
    lowered: ["{0} letters lowered · Ctrl+Z gives them back", "Букв в строчные: {0} · Ctrl+Z возвращает", "Літер у малі: {0} · Ctrl+Z повертає",
      "Літар у малыя: {0} · Ctrl+Z вяртае", "Γράμματα σε πεζά: {0} · το Ctrl+Z τα επαναφέρει", "Letras a minúsculas: {0} · Ctrl+Z las devuelve",
      "Lettere in minuscolo: {0} · Ctrl+Z le restituisce", "Lettres en minuscules : {0} · Ctrl+Z les rend", "Letras em minúsculas: {0} · Ctrl+Z as devolve",
      "Buchstaben klein gemacht: {0} · Strg+Z gibt sie zurück", "小文字にした文字: {0} · Ctrl+Z で戻せます", "已转小写的字母:{0} · Ctrl+Z 可还原", "אותיות שהוקטנו: {0} · Ctrl+Z מחזיר אותן"],
    // HERESY 2472: Shift+click on «aa», said in its tip and in what it did
    spareTip: ["Shift+click: the same, but a capital that carries a stress mark stays (базилиО́, a capital with the acute U+0301 after it).",
      "Shift+клик: то же, но заглавная со знаком ударения остаётся (базилиО́, заглавная с акутом U+0301 после неё).",
      "Shift+клік: те саме, але велика літера зі знаком наголосу лишається (базилиО́, велика з акутом U+0301 після неї).",
      "Shift+клік: тое ж, але вялікая літара са знакам націску застаецца (базилиО́, вялікая з акутам U+0301 пасля яе).",
      "Shift+κλικ: το ίδιο, αλλά ένα κεφαλαίο με σημάδι τόνου μένει (базилиО́, κεφαλαίο με την οξεία U+0301 μετά από αυτό).",
      "Mayús+clic: lo mismo, pero una mayúscula con marca de acento se queda (базилиО́, una mayúscula con el acento agudo U+0301 tras ella).",
      "Maiusc+clic: lo stesso, ma una maiuscola con il segno d'accento resta (базилиО́, una maiuscola con l'acuto U+0301 dopo).",
      "Maj+clic : pareil, mais une majuscule qui porte un accent reste (базилиО́, une majuscule suivie de l'aigu U+0301).",
      "Shift+clique: o mesmo, mas uma maiúscula com marca de acento fica (базилиО́, uma maiúscula com o agudo U+0301 depois dela).",
      "Umschalt+Klick: dasselbe, aber ein Großbuchstabe mit Betonungszeichen bleibt (базилиО́, ein Großbuchstabe mit dem Akut U+0301 danach).",
      "Shift+クリック: 同じですが、アクセント記号の付いた大文字は残ります(базилиО́、後ろに鋭アクセント U+0301 が付いた大文字)。",
      "Shift+单击:相同,但带重音符号的大写字母保留(базилиО́,后面跟着锐音符 U+0301 的大写字母)。",
      "Shift+לחיצה: אותו דבר, אבל אות גדולה שנושאת סימן הטעמה נשארת (базилиО́, אות גדולה עם האקוט U+0301 אחריה)."],
    loweredSpared: ["{0} letters lowered, {1} stressed capitals kept · Ctrl+Z gives them back", "Букв в строчные: {0}, ударных заглавных оставлено: {1} · Ctrl+Z возвращает",
      "Літер у малі: {0}, наголошених великих лишено: {1} · Ctrl+Z повертає", "Літар у малыя: {0}, націскных вялікіх пакінута: {1} · Ctrl+Z вяртае",
      "Γράμματα σε πεζά: {0}, τονισμένα κεφαλαία που έμειναν: {1} · το Ctrl+Z τα επαναφέρει", "Letras a minúsculas: {0}, mayúsculas acentuadas que quedan: {1} · Ctrl+Z las devuelve",
      "Lettere in minuscolo: {0}, maiuscole accentate rimaste: {1} · Ctrl+Z le restituisce", "Lettres en minuscules : {0}, majuscules accentuées gardées : {1} · Ctrl+Z les rend",
      "Letras em minúsculas: {0}, maiúsculas acentuadas mantidas: {1} · Ctrl+Z as devolve", "Buchstaben klein gemacht: {0}, betonte Großbuchstaben behalten: {1} · Strg+Z gibt sie zurück",
      "小文字にした文字: {0}、残したアクセント付き大文字: {1} · Ctrl+Z で戻せます", "已转小写的字母:{0},保留的重音大写字母:{1} · Ctrl+Z 可还原",
      "אותיות שהוקטנו: {0}, אותיות גדולות מוטעמות שנשארו: {1} · Ctrl+Z מחזיר אותן"],
    sparedOnly: ["The only capitals here carry a stress mark: kept", "Здесь только ударные заглавные: оставлены", "Тут лише наголошені великі: лишено",
      "Тут толькі націскныя вялікія: пакінута", "Εδώ υπάρχουν μόνο τονισμένα κεφαλαία: έμειναν", "Aquí solo hay mayúsculas acentuadas: se quedan",
      "Qui ci sono solo maiuscole accentate: restano", "Ici, seules des majuscules accentuées : gardées", "Aqui só há maiúsculas acentuadas: ficam",
      "Hier gibt es nur betonte Großbuchstaben: behalten", "ここにあるのはアクセント付きの大文字だけです: 残しました", "这里只有带重音的大写字母:已保留",
      "יש כאן רק אותיות גדולות מוטעמות: נשארו"],
    raised: ["{0} letters raised · Ctrl+Z gives them back", "Букв в заглавные: {0} · Ctrl+Z возвращает", "Літер у великі: {0} · Ctrl+Z повертає",
      "Літар у вялікія: {0} · Ctrl+Z вяртае", "Γράμματα σε κεφαλαία: {0} · το Ctrl+Z τα επαναφέρει", "Letras a mayúsculas: {0} · Ctrl+Z las devuelve",
      "Lettere in maiuscolo: {0} · Ctrl+Z le restituisce", "Lettres en majuscules : {0} · Ctrl+Z les rend", "Letras em maiúsculas: {0} · Ctrl+Z as devolve",
      "Buchstaben groß gemacht: {0} · Strg+Z gibt sie zurück", "大文字にした文字: {0} · Ctrl+Z で戻せます", "已转大写的字母:{0} · Ctrl+Z 可还原", "אותיות שהוגדלו: {0} · Ctrl+Z מחזיר אותן"]
  };
  var I = window.RuachI18n;
  if (I) {
    LANGS.slice(1).forEach(function (code, k) {
      var t = {};
      Object.keys(W).forEach(function (id) { if (W[id][k + 1]) t[W[id][0]] = W[id][k + 1]; });
      if (W.lowTip[k + 1] && W.spareTip[k + 1]) t[W.lowTip[0] + " " + W.spareTip[0]] = W.lowTip[k + 1] + " " + W.spareTip[k + 1];   // HERESY 2472
      I.add(code, t);
    });
  }
  function tr(s) { return I ? I.t(s) : s; }
  function say(id, n, bad) {
    var s = tr(W[id][0]).split("{0}").join(String(n));
    if (hooks.toast) hooks.toast(s, bad ? "bad" : "");
  }
  function say2(id, n, m) {                            // HERESY 2472: two numbers
    var s = tr(W[id][0]).split("{0}").join(String(n)).split("{1}").join(String(m));
    if (hooks.toast) hooks.toast(s, "");
  }

  // the protected spans of a text: its tags, and a dialog line's «Name:» when speakers is true
  function kept(text, speakers) {
    var out = [], m;
    TAG.lastIndex = 0;
    while ((m = TAG.exec(text))) out.push([m.index, m.index + m[0].length]);
    if (speakers) {
      SPEAKER.lastIndex = 0;
      while ((m = SPEAKER.exec(text))) {
        if (m[0].length === 0) { SPEAKER.lastIndex++; continue; }
        out.push([m.index, m.index + m[1].length]);
      }
    }
    return out.sort(function (a, b) { return a[0] - b[0]; });
  }

  // HERESY 2472 (Viktor 12.11.2026, asked whether «aa» should spare his stressed capitals: «Нет, не щадить. Да, щадить. 🤣»): both. A plain click lowers
  // every capital; Shift+click («spare») keeps a capital that carries a stress mark: one followed by the combining acute U+0301 (базилиО́), or a Latin
  // capital with its acute built in (Ó)
  var STRESSED = /[ÁÉÍÓÚÝ]/;
  // text[s:e] in the case asked for, the protected spans as they were; the number of letters changed (spared: the stressed capitals kept)
  function recase(text, s, e, how, speakers, spare) {
    var keep = kept(text, speakers), out = "", at = s, n = 0, kept2 = 0;
    function part(a, b) {
      if (b <= a) return;
      var src = text.slice(a, b), got = how === "upper" ? src.toUpperCase() : src.toLowerCase();
      if (spare && how !== "upper" && got.length === src.length) {
        var arr = got.split("");
        for (var q = 0; q < src.length; q++) {
          if (src[q] !== arr[q] && (text.charAt(a + q + 1) === "\u0301" || STRESSED.test(src[q]))) { arr[q] = src[q]; kept2++; }
        }
        got = arr.join("");
      }
      if (how !== "upper" && got.length === src.length) {          // Greek: a capital Σ at a word's end is ς, as the word is written (ΣΟΦΟΣ → σοφος)
        got = got.replace(/σ/g, function (c, i) {
          var next = text.charAt(a + i + 1), prev = text.charAt(a + i - 1);
          return src.charAt(i) === "Σ" && /\p{L}/u.test(prev) && !/[\p{L}\p{M}]/u.test(next) ? "ς" : c;
        });
      }
      for (var i = 0; i < Math.min(src.length, got.length); i++) if (src[i] !== got[i]) n++;
      n += Math.abs(got.length - src.length);
      out += got;
    }
    keep.forEach(function (k) {
      if (k[1] <= at || k[0] >= e) return;
      part(at, Math.max(at, k[0]));
      var b = Math.min(e, k[1]);
      out += text.slice(Math.max(at, k[0]), b);
      at = b;
    });
    part(at, e);
    return { text: out, changed: n, spared: kept2 };
  }

  // one edit of the box: only the span that differs replaced, through the editing commands (one undo step, the box's input heard)
  function put(box, s, e, repl) {
    var old = box.value.slice(s, e), a = 0, b = 0;
    while (a < old.length && a < repl.length && old[a] === repl[a]) a++;
    while (b < old.length - a && b < repl.length - a && old[old.length - 1 - b] === repl[repl.length - 1 - b]) b++;
    // HERESY 2472: never a span that starts or ends inside a letter with its marks: the browser widens such a selection to the whole letter, and
    // «О́» lowered as «О» alone lost its acute (базилиО́ → базилио, measured 12.11 on the draft box); the letter's marks go with it
    while (a > 0 && /\p{M}/u.test(old.charAt(a))) a--;
    while (b > 0 && /\p{M}/u.test(old.charAt(old.length - b))) b--;
    var from = s + a, to = e - b, ins = repl.slice(a, repl.length - b);
    box.focus();
    box.setSelectionRange(from, to);
    var ok = false;
    try { ok = document.execCommand("insertText", false, ins); } catch (_) { ok = false; }
    if (!ok || box.value.slice(from, from + ins.length) !== ins) {   // no editing commands here: the text still changes, said as an input
      box.setRangeText(ins, from, to, "end");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function act(btn, spare) {
    var box = document.getElementById(btn.getAttribute("data-case-for") || "");
    if (!box || box.disabled || box.readOnly) return;
    var how = btn.getAttribute("data-case") === "upper" ? "upper" : "lower";
    var s = box.selectionStart, e = box.selectionEnd, whole = s === e;
    if (whole && how === "upper") { say("pick", 0, true); return; }
    if (whole) { s = 0; e = box.value.length; }
    var sp = btn.getAttribute("data-case-speakers"), sel = sp ? document.getElementById(sp) : null;
    var r = recase(box.value, s, e, how, !!(sel && sel.value === "dialog"), !!spare && how === "lower");
    if (!r.changed) { say(how === "upper" ? "noneUp" : r.spared ? "sparedOnly" : "noneLow", r.spared); return; }
    put(box, s, e, r.text);
    if (!whole) box.setSelectionRange(s, s + r.text.length);       // the selection stays on what was changed, ready for the next key
    if (r.spared) { say2("loweredSpared", r.changed, r.spared); return; }   // HERESY 2472
    say(how === "upper" ? "raised" : "lowered", r.changed);
  }

  document.addEventListener("mousedown", function (ev) {               // the box keeps its focus and its selection while the button is pressed
    var b = ev.target.closest && ev.target.closest("[data-case][data-case-for]");
    if (b) ev.preventDefault();
  }, true);
  // caught on the way down and stopped there: the buttons sit in a box's heading, and the Musician's Lyrics heading folds the box on a click or Enter
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-case][data-case-for]");
    if (!b) return;
    ev.preventDefault();
    ev.stopPropagation();
    act(b, ev.shiftKey);                                              // HERESY 2472: Shift spares the stressed capitals
  }, true);
  document.addEventListener("keydown", function (ev) {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.closest && ev.target.closest("[data-case][data-case-for]")) ev.stopPropagation();
  }, true);

  // the two buttons' markup for a box (English: the page's catalogs and this file's table translate it as it appears)
  function buttons(boxId, speakers) {
    var sp = speakers ? ' data-case-speakers="' + speakers + '"' : "";
    // HERESY 2547 (the UIX audit of 13.11.2026, №30): the two drawn (Lucide's case-lower and case-upper), not the letters aa and AA, in every room that has them
    var HI = window.HeresyIcons && window.HeresyIcons.ui ? window.HeresyIcons : null, face = function (n, t) { return HI ? HI.ui(n) : t; };
    return '<button type="button" class="btn ghost small icon-btn case-btn" data-case="lower" data-case-for="' + boxId + '"' + sp + ' aria-label="' +
      W.low[0] + '" data-tip="' + (W.lowTip[0] + " " + W.spareTip[0]).replace(/"/g, "&quot;") + '">' + face("case-lower", "aa") + "</button>" +   // HERESY 2472: Shift said in the tip
      '<button type="button" class="btn ghost small icon-btn case-btn" data-case="upper" data-case-for="' + boxId + '"' + sp + ' aria-label="' +
      W.up[0] + '" data-tip="' + W.upTip[0].replace(/"/g, "&quot;") + '">' + face("case-upper", "AA") + "</button>";
  }

  // the page's own boxes say where their buttons go: <span data-case-slot="the box's id"></span> (the Musician's Lyrics, the Writer's LYRICS)
  Array.prototype.forEach.call(document.querySelectorAll("[data-case-slot]"), function (slot) {
    slot.innerHTML = buttons(slot.getAttribute("data-case-slot"), slot.getAttribute("data-case-speakers") || "");
  });

  window.HeresyCase = { init: function (h) { hooks = h || {}; }, buttons: buttons, recase: recase, words: W };
})();
