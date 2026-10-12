# The Artist in Depth

The Artist is Ruach Studio's room for pictures: a cover for each take, a 16:9 for its video, a 9:16 for a short. The guide inside the studio (F1 in the Artist) says what each control does in a few lines; this document goes all the way down: every control, how it is made inside, the recipes that work, what goes wrong and why, and the numbers measured on an RTX 3090. Everything here is in the studio as it stands; what is still to come is said at the end.

## Contents

1. [What the Artist Is For](#1-what-the-artist-is-for)
2. [A First Cover in Six Steps](#2-a-first-cover-in-six-steps)
3. [Writing a Prompt](#3-writing-a-prompt)
4. [The Painters](#4-the-painters)
5. [How a Run Goes](#5-how-a-run-goes)
6. [Lightning](#6-lightning)
7. [Samplers and Schedules](#7-samplers-and-schedules)
8. [Adapters (LoRA)](#8-adapters-lora)
9. [Regions](#9-regions)
10. [A Picture to Paint From](#10-a-picture-to-paint-from)
11. [The Second Pass](#11-the-second-pass)
12. [Upscale](#12-upscale)
13. [The Stage, the Library and the Trash](#13-the-stage-the-library-and-the-trash)
14. [Covers for Takes](#14-covers-for-takes)
15. [Recipes](#15-recipes)
16. [When Something Goes Wrong](#16-when-something-goes-wrong)
17. [The Numbers](#17-the-numbers)
18. [For Scripts and Agents](#18-for-scripts-and-agents)
19. [Licences](#19-licences)
20. [What Comes Next](#20-what-comes-next)

## 1. What the Artist Is For

A song needs pictures: the square on its card and in its MP3, a wide frame for its video, a tall one for a short. The Artist paints them on your own card, from your words, from a picture of yours, or from both, and keeps every run with its prompt, seed and settings so that a picture you liked can be painted again or carried further.

The room has three columns. On the left the form: the prompt and every knob that shapes the painting. In the middle the stage: the run being painted develops there step by step, or the picture you picked stands there with its buttons under it and its run's data in a tip beside it. On the right the library: every run, or every picture in one gallery, or the trash. Drag the edges between the columns to widen one (← → from the keyboard, a double click gives it its own width back). From a window 920 px tall the room stands whole: the page stays still, the form and the library scroll on their own, and Draw's row stays at the form's foot.

## 2. A First Cover in Six Steps

1. Pick a take on the right of the studio (the Creator's or the Librarian's list): the picture you set as a cover goes to it.
2. In the Artist, press **From the take** for a prompt to start from, or write your own (section 3).
3. Leave **Shapes** at **1:1**, set **Variations** to 4, and keep the painter the studio chose (Krea 2 Muse Q4 on most cards).
4. Press **Draw** (Ctrl+Enter). Watch the pictures develop on the stage; about half a minute each on a 3090.
5. Click the one you like; **Set as cover** makes it the take's cover in its card, in the player and in its MP3.
6. Liked it but want it finer? **Second pass… ×2** (section 11), then **Upscale… 4K** (section 12).

## 3. Writing a Prompt

Krea 2 Muse and Qwen-Image read a prompt as a description, not as a list of tags: write sentences. Put what is in the picture first (who or what, where, doing what), then the light (dusk, candlelight, a grey morning), the colours, and the medium (an oil painting with thick brushwork, an ink drawing, a 35 mm photograph). End with *no text* when you want no letters: both painters like to letter a cover by themselves.

Words that work well: the subject named plainly (*a red fox sitting in the snow*), the composition (*seen from below*, *in the left third*, *a wide empty sky above*), the material (*oil on canvas*, *gouache*, *woodcut*), the light's direction and colour. Words that do little: lists of quality tags (*masterpiece, 8k, best quality*) belong to older models and only take room.

**From the take** puts in the prompt the take's own artwork came from, or one made from its title and style, as a start. Each run keeps its prompt; **To the form** on any picture brings its prompt, seed and shape back, and **All of it to the form** (its menu) brings its painter, fine-tune, sampling and adapters as well, so Draw paints that very picture again.

## 4. The Painters

| painter | licence | the card it asks | a picture on a 3090 | for |
|---|---|---|---|---|
| **Krea 2 Muse Q4** | Krea 2 Community License | 12.5 GB | about 35 s at 1:1, 47 s at 16:9 | drafts, covers, the workhorse |
| **Krea 2 Muse Q8** | Krea 2 Community License | 18.5 GB | a little longer, finer | covers |
| **Qwen-Image 2512 Q4** | Apache-2.0 | 15.5 GB | about 30 s with Lightning | a 16 GB card's Qwen |
| **Qwen-Image 2512 Q6** | Apache-2.0 | 20 GB | about 32 s with Lightning | finer drafts |
| **Qwen-Image 2512 fp8 fine-tune** | the fine-tune's own | 22.5 GB | about 37 s with Lightning, minutes without | finished realism |
| **Qwen-Image 2.1** | Qwen Research Licence | 21 GB (streams on less) | about two minutes | editing by words, a style reference |

**Krea 2 Muse** (by Stable Yogi, a fine-tune of Krea 2 Turbo) paints in its own few steps (8 by default, 4 to 16) without guidance: a Turbo model has its guidance distilled into it. It is the room's default because it is quick, faithful to the words and kind to smaller cards. Q4 and Q8 are the same model at two precisions (GGUF): Q8 holds a little more detail.

**Qwen-Image 2512** is the larger painter: finer realism, longer prompts read well, letters drawn right when you ask for them. It comes as GGUF at Q4 or Q6, or as an **fp8 fine-tune**: ComfyUI's single files put into `artwork/Qwen-Image-2512/checkpoints/` and picked under the painter (Jib Mix Qwen, IntoRealism Qwen, Real-Qwen-Image and 2512 itself can be fetched from **Get painters and adapters…**, 20.4 GB each). An fp8 fine-tune is read in bf16, kept on the card in its own fp8, and each layer computes in bf16 while it runs; adapters on it keep their own layers in bf16.

**Qwen-Image 2.1** reads pictures as well as words (its text encoder is Qwen3-VL): it edits a picture by the prompt's words, or paints the prompt's scene in a picture's style (section 10). It is under the Qwen Research Licence: research and evaluation only, not for a cover you sell; the room says so under the painter in the warning's colour.

Each painter shows only when its files are here; the ones not here are named under the painter, and **Engine → Models and LoRAs** fetches them, each asked first with its size (2.1 with its licence too). From a terminal: `heresy/fetch-heresy.sh --qwen 2512-q4`.

**The text encoder** of Qwen-Image 2512 (Qwen2.5-VL-7B, about 15.5 GB) reads the prompt on the card when the room free there holds it, else on the processor, and leaves before the painter comes: the picture is the same either way, the processor only slower.

## 5. How a Run Goes

**The queue.** A press of Draw is a run: one prompt, its shapes, its variations. It waits in the lab's queue for a card with room, as the takes' artwork, the stems and the upscales do; while it waits, **Off the queue** takes it back, and **Stop** beside Draw ends a run that paints (the pictures it finished stay). Two runs may stand at once: one painting, the next waiting behind it.

**Which card.** The lab's jobs keep to the cards given to them in **Engine → GPUs** (the studio's own card is never taken by chance). A card nothing else uses takes a run whose need fits its memory less 512 MiB (the CUDA runtime's own share); a card in use takes it when its free memory holds the need; a card with a VRAM limit counts its limit as its ceiling. The need is the painter's own plus its adapters' size, and 6 GB more for a second pass at ×2.

**When no card holds it whole**, Krea 2 Muse and Qwen-Image 2512 stream their blocks from RAM: the blocks that fit stay on the card, the rest come as each is needed (diffusers' group offloading over a CUDA stream, a block arriving while the one before it computes), and the picture is the same, slower by what the bus cannot hide. Every block streamed, Krea 2 Muse Q4 takes 2.2 GB of the card, so a card of 8 GB paints it. Qwen-Image 2.1 streams both its transformer (block by block) and its text encoder (layer by layer): under a 15.5 GB limit it painted from words at 4.1 GB at the peak and edited at 7.9 GB, in about the same time as whole. A painter that cannot stream and fits no card is refused at once, with the numbers and the painter that would fit.

**Several cards.** A run with several pictures is dealt across the lab's cards that have room and enough RAM for one more painter (three shapes on two cards: the first and third on one, the second on the other), each card painting its share with the run's own seeds: the pictures are the same bit for bit as on one card. Krea 2 Muse Q8, three shapes: 132 s on two cards against 163 s on one.

**A painter kept.** After a run its painter goes back to RAM and its card is free again; a next run of the same painter, the same fine-tune and the same adapters in the same order paints at once, without the minute or two of loading. A kept painter is let go after ten minutes idle, when RAM is wanted for another, or by **Unload** in the Bar (which lets go of everything the studio holds on its cards).

**Inside a run**: the prompt is read once by the text encoder; each picture is drawn at the painter's own size and kept at the room's (Krea 2 draws at multiples of 16 and cuts from the middle, 1920 × 1088 to 1920 × 1080; Qwen-Image draws at 1328², 1664 × 928 and 928 × 1664 and brings each to 1280², 1920 × 1080 and 1080 × 1920); the decoder works in tiles, so its peak stays low.

**Live preview** (on by default): each step's latents are turned into a picture an eighth of the size without the decoder (the latent space's own colour factors, as InvokeAI carries them), so it costs nothing; a bar across the stage's top follows the run, picture by picture and step by step.

**The content filter**: every picture passes the filter Krea 2's licence asks for, whatever painted it: one it flags is not kept, and the run says so.

**On disk**: each run is a folder in the studio's `artist/`: `ask.json` (what was asked), `run.json` (written picture by picture), the pictures `NN-SHAPE-sSEED.png`, their `thumbs/`, and a reference or a mask beside them when the run had one. A watchdog stops a painter silent too long (ten minutes while it loads, five once it paints), and a run the lab lost to a restart says so instead of painting for ever.

## 6. Lightning

**What it is**: an adapter (lightx2v, Apache-2.0) that teaches Qwen-Image 2512 to paint in a few steps without guidance: the model's own long guided way distilled into 8 steps. Its file lives in `artwork/Qwen-Image-2512/lightning/` and comes with the Qwen painters' fetch.

**How the studio lays it in**: with Lightning on, the painter loads it as one more adapter beneath yours, at **1.0** for the GGUF Q4 and Q6 (the base it was distilled from, 8 steps) and at **0.55** for an fp8 fine-tune with 12 steps (a fine-tune has moved away from the base, and Lightning at full strength would pull it back). The schedule becomes Lightning's own (a shift of log 3 at every size), and guidance is off: one pass of the model a step.

**With it off**, 2512 paints its own way: 30 steps by default (10 to 60) and **Guidance** 4 (true CFG against an empty negative: two passes a step). Sixty passes against eight: about seven times the painting, and the detail and light of finished realism.

**The rule behind the defaults**: Lightning for drafts and covers, not for professional realism. The GGUF painters paint with it; an fp8 fine-tune paints without it unless you switch it on; a take's own artwork is painted with it. Krea 2 Muse has no switch: its few steps are its own.

## 7. Samplers and Schedules

**Sampling**, under the painter, folded, its values in its summary: the steps, the sampler and the schedule (and for 2512 Lightning and Guidance), kept for each painter; **Reset** gives the painter's own back. Krea 2 and Qwen-Image 2512 with Lightning take 4 to 16 steps; without it 10 to 60.

The model says at each step which way the picture lies; the **sampler** decides how to walk there:

- **Euler**: one pass a step, the plain step, the reference (and the one Lightning was distilled with).
- **Euler SDE**: Euler with a little fresh noise each step: more grain, a little less faithful.
- **ER-SDE**: a stochastic solver of the third order, one pass a step, the two steps before it kept: finer than Euler for the same time.
- **RES 2s**, **RES 3s**: the refined exponential solver's single-step methods, two and three passes a step, half the noise put back after each; their **ODE** twins put none back, so one seed paints one picture, the closest to the exact path.
- **Heun++**: three passes a step where it can, two, then one at the end.
- **Exponential Heun** (and its SDE): a second-order exponential method, two passes a step.

A sampler of two or three passes a step costs two or three times Euler's time. Against the exact path of a toy flow at 8 steps they rank as their orders say: Euler 0.138, Heun++ 0.111, exponential Heun 0.084, RES 2s 0.058, RES 3s 0.046 (the error: lower is closer).

The **schedule** says where the steps are spent between all noise and none: **Simple** (evenly in the painter's own time), **Karras** and **Exponential** (more steps at little noise, for the detail), **Beta** and **Beta 57** (dense at both ends), **KL optimal** (Align Your Steps' spacing), **SGM uniform** (uniform in time, the last step dropped), **Bong tangent** (two arctangent slopes, from all noise to half and from half to none).

**What works, from two matrices of 54 pictures** (one prompt, one seed, every pair):

| painter | good | avoid |
|---|---|---|
| Krea 2 Muse | every sampler and schedule painted a whole picture | |
| Qwen-Image 2512 with Lightning | Simple, Beta, Beta 57, SGM uniform, Bong tangent | Karras, Exponential, KL optimal (they can paint the subject twice) |
| Qwen-Image 2512 without Lightning | Euler, ER-SDE, RES 2s / 3s | Euler SDE (soft and hazy) |

The form says both warnings when they apply. The samplers were written for the studio from their papers and ComfyUI's formulas; RES4LYF was read for its mathematics only (its licence bars commercial services), and Heun++ is Carzit's (MIT).

## 8. Adapters (LoRA)

**Where they live**: `artwork/loras/<family>/`, the family the painter's: `krea2`, `qwen-image-2512`, `qwen-image-2.1`, `sdxl`. Folders inside become groups in the library; a picture beside a file with its name (`NAME.jpg`, `NAME.png`, `NAME.preview.png`) shows on its card; what ComfyUI's LoRA Manager (`NAME.metadata.json`) or Stability Matrix (`NAME.cm-info.json`) wrote beside a file is read as well.

**The list and the run**: up to eight adapters in the list under the painter, up to four active in a run; each at its strength (the slider 0 to 1.5); a right click **mutes** one (it stays in the list and leaves the run), and an adapter at nought is not loaded either. Its trigger words show under it, and a click on one puts it into the prompt (a run also adds an active adapter's trigger words by itself).

**Civitai**: **Look up on Civitai** sends each file's SHA-256 and nothing else, and keeps the answer beside it (`NAME.civitai.info`: its name, base model and trigger words, and its first picture rated safe when it has none). **From Civitai…** fetches an adapter whose author does not let it be shared from Civitai itself, with your own key: a link, a version id or an AIR is read, the family its base model suits is said, and only a LORA, LoCon or DoRA in `.safetensors` is taken, its SHA-256 checked against Civitai's before it becomes the file. Your key goes to Civitai alone. The adapters their authors let be shared come from **Get painters and adapters…**.

**Together**: from two adapters, a bar under them gives their strengths' sum on the Creator's road: green to 1.2, amber to 1.8, red past it. Stacked adapters add up, and past about 1.8 a picture burns (colours and edges overdone) however modest each one is. Drag the bar to move them all at once, each in proportion.

**Strength over the steps** (⏱ beside an adapter): keyframes as ComfyUI's LoRA hooks have them, a share of the steps and a multiplier: `0%:1, 50%:1, 60%:0` keeps the adapter whole for half the steps and lets it go by 60 %. Up to eight keyframes, the multiplier 0 to 2, straight lines between them. An adapter that shapes the composition early and a style adapter that should only touch the finish are the two uses.

**Inside**: the adapters go onto the painter's transformer before it paints (PEFT), each at its strength; a kohya file (`lora_unet_blocks_0_…`) is renamed to the painter's own layer names; an adapter that reaches none of the painter's layers (made for another model) stops the run and says so. A kept painter takes a next run's strengths without reloading its adapters.

## 9. Regions

**Regions**, under Sampling, folded: up to three parts of the frame, each a place and words of its own. The places: the left, right, top or bottom half; the left, middle or right third; the four quarters; the middle. A small map beside each row shows where it lies.

**How it paints**: at every step the painter is asked once more for each region, with the main prompt and the region's words, and its answers are blended by the regions' boxes as soft-edged weights (an edge of a twenty-fifth of the shorter side), shared where boxes overlap; the rest of the frame follows the main prompt alone. This is Latent Couple's way: it needs nothing from the model, and the scene stays one scene because every region's prompt carries the main one.

**How to write them**: the main prompt says the whole scene, a region what stands in it. *Two animals sitting in a snowy forest clearing at dawn, oil painting*; left half *a red fox sitting in the snow*; right half *a white snowy owl perched on a stump*. On one seed, Krea 2 Muse painted two vague cats without the regions and the fox and the owl with them; Qwen-Image 2512 painted two bears without them and the fox and the owl with them.

**What it costs**: a whole pass more a step for each region (on a 3090 at 16:9: Krea 2 Q4 48 s alone, 137 s with two regions; Qwen-Image 2512 fp8 141 and 281 s). The form's time estimate counts them.

Regions are kept in this browser; a region without words is not sent; **Again** paints with the run's own. Krea 2 and Qwen-Image 2512; Qwen-Image 2.1 edits by words and paints without them.

## 10. A Picture to Paint From

**The reference**: drop a picture on its place under the prompt, paste one (Ctrl+V), choose a file, or take the stage's picture with **As reference** (or the take's cover with **The take's cover**). PNG, JPEG or WebP, 40 MB at most.

### Use It

**Use it**, under the picture, says how:

- **to paint from** (the default): image to image by the form's painter, as far as **How much it may change** says;
- **to edit by words**: Qwen-Image 2.1 keeps the scene and changes what the prompt says (*the same lighthouse in a snowy winter night*: the snow came where it belongs, the tower and the rocks kept);
- **for its style only**: Qwen-Image 2.1 paints the prompt's own scene in the picture's technique, brushwork, palette and light, nothing of its subject kept (a lighthouse in oils gave *a red fox in a snowy forest under the moon* in its brush).

The last two are offered when Qwen-Image 2.1 is here. With either, the run is 2.1's whatever the form's painter: the form's model, sampling, adapters, mask and canvas are not sent, and 2.1's licence holds. Inside, a style reference is the prompt wrapped in an ask to take the picture's style alone and nothing of its subject; editing is 2.1's own way with a condition picture.

### How Much It May Change

Image to image here is what InvokeAI does with models that have no pipeline for it: the picture covers each shape and is cut from its middle, goes through the painter's decoder the other way into latents, and is noised to a point on the painter's own schedule; the painting then runs the rest of the schedule from there. The strength picks that point: the nearest of the schedule's own steps, two steps at least.

| strength | what it gives (tried on Krea 2 Muse) |
|---|---|
| 0.3 | the picture nearly as it is, its surface touched |
| 0.5 | the picture kept, its small things changed (lettering, texture) |
| 0.6 | its composition kept, its matter changed (the room's default) |
| 0.75 | the composition kept, the prompt's materials taken |
| 0.9 | the prompt's scene painted in the picture's light and colours |
| 1.0 | painted anew |

**Extra noise** under the strength (0 by default, 0 to 2): fresh noise put on the picture's latents before the painting starts from them, as Viktor's ComfyUI workflow does with InjectLatentNoise (`samples + noise · strength` in the decoder's own space; here divided by each channel's spread, so the number means what it means there). 0.3 brings new grain and detail, 0.6 is his second pass, above 1 the picture's forms begin to break. It moves only the start: what a mask keeps stays clean.

### Mask

**Mask…** paints over the picture what to repaint (Paint and Erase, B and E; the brush and its size, `[` and `]`; Invert; Clear): the rest stays exactly as it was, as inpainting. Inside, the mask goes to the latents' own grid, and at every step the kept part is put back as the picture noised to that step; the finished picture takes the picture's own pixels outside the mask, feathered.

Four options under the picture when a mask is on (or Paint around it):

- **Grow**: the mask grown by so many pixels, or shrunk (−64 to 128);
- **Edge**: how soft its edge is (0 to 96 px);
- **Soft**: soft repainting, as differential diffusion: where the edge is grey the picture changes only in the last steps, so no seam;
- **Grain**: how much of the new paint the kept part takes at each step (0 to 0.6), its grain and light sewn to the new; 0 keeps it exactly.

A round mask's edge can stay visible without them; Grow 16, Edge 24, Soft and Grain 0.15 sewed a new face into an old canvas without a line.

### Paint Around It

**Paint around it** holds the whole picture in each shape's middle and paints the edges it leaves anew, in the picture's colours and light: a square cover into a 16:9 for a video or a 9:16 for a short, as outpainting.

### The Canvas

**Canvas…** beside Mask… opens the canvas, as InvokeAI's: each shape's frame a tab on top, saying how it will be painted (**from it**: the picture covers the frame and the run paints from it at the strength asked; **around**: the part of the frame it leaves bare is painted around it). On the board **Move** (V) drags the picture, or a corner to scale it with the opposite corner kept; **Brush** (B) and **Eraser** (E) paint the inpaint mask over it; **Hand** (H, or Space held) moves the board; the wheel zooms, Alt+wheel scales the picture about the pointer, the arrows nudge it (Shift: ten pixels). On the right the layers and the place in numbers; on top **Fit**, **Fill**, **Centre** and **Same in all**, undo and redo (thirty steps). **Done** keeps each shape's place with the reference and the mask in the form. A place is the picture's middle in the frame's share and its width in frame widths.

## 11. The Second Pass

**Second pass…**, on the stage beside Upscale…, paints a picture over larger, as Viktor's ComfyUI workflow does after its first pass: the picture brought up **×1.5** or **×2** by nearest and painted again by its own run's painter, fine-tune, adapters, prompt and seed, from part of the way.

**How his workflow does it**, read node by node: the first pass's picture 2× by nearest-exact, encoded in tiles, InjectLatentNoise 0.6, then a second KSampler from step 20 of 60 at CFG 4.5, with the same sampler and schedule as the first pass (both come from one packer: ER-SDE and Bong tangent as the workflow is saved).

**In the studio**: **How much it may change** (0.5 first: 0.3 keeps the drawing and adds detail, 0.5 sharpens its matter, 0.7 repaints its forms) and **Extra noise** (0.6 first, as his) in its row; the steps, sampler, schedule and Lightning are the form's when the form paints with the same painter, else the run's own. His recipe gives the second pass many steps and no Lightning: set them in the form before you press ×2.

**What it costs and gives**: a 16:9 of 1920 × 1080 comes out 3840 × 2160. On a 3090, Krea 2 Q4 at 2560² in 86 s (14.5 GB at the peak); Qwen-Image 2512 fp8 at 3840 × 2160 in 220 s with 12 steps and Lightning (22.9 GB, its blocks streamed). At 0.6 both kept the scene and moved its parts a little; at 0.5 the composition held. Not for Qwen-Image 2.1; no mask or canvas with it. **Again** on a second pass paints it again at its size.

## 12. Upscale

**Upscale…** on the stage makes a picture **2K** or **4K** (its long side 2560 or 3840) with an upscaler from `artwork/upscalers/` (`.pth` or `.safetensors`, folders allowed): ESRGAN, DAT, HAT, ATD, SPAN, OmniSR and their kin, read by spandrel by the file alone. The picture goes through in tiles of 512 with 32 of overlap, each tile's middle kept (no seam); a 4× model asked for less paints at 4× and is brought down by Lanczos, finer than a 2× model. The long side stops at 10 240 px. The **i** beside the choice says what the chosen upscaler is for (photos, faces, art), its author, licence and measured time; a click opens the notes of all of them, grouped, quickest first, the non-commercial marked.

**Passes…** makes an upscale in passes, as Viktor's ComfyUI stack does: up to four rows of a model and a factor, each run over the picture as it stands and brought to the original size times the pass's factor, then the long side asked and the colours matched to the original (hm-mvgd-hm: histograms, mean and covariance, histograms). His chain is one click away when its models are here: span otf strong ×2, then Nomos8kDAT ×4, Remacri ×1.5, UltraMix Balanced ×2: a 1920 × 1080 picture to 7680 × 4320 in 246 s, no seam, the colours kept.

**TTA** beside the upscaler: each tile through the model in its eight orientations (four turns, each mirrored), averaged: steadier edges and textures, up to eight times the time. **Upscale…** on the bar of pictures picked (Ctrl+click) upscales up to 64 at once, dealt to the lab's cards.

Upscale and the second pass do different things: an upscaler sharpens what is there; a second pass paints new detail at the new size. For a print: second pass ×2 first, then upscale.

## 13. The Stage, the Library and the Trash

**The stage**: a click on a picture puts it there with its run under it; a click on it (or a double click on any picture) opens it over the page in its own shape (← → walk the run, or the gallery; Esc closes). Under it: **To the form**, **As reference**, **Compare…**, **Set as cover** (a square one), **Download** (PNG, full size), **Over the page**, ★, **Protect** (the shield: a protected picture never goes to the trash nor is deleted, whatever brought it there), **Trash**, **Second pass…**, **Upscale…**. The run's data and prompt stand in a tip beside the picture while the pointer is on it.

**Runs or Gallery**: the runs show each press of Draw with its prompt and seed, the newest on top; the gallery shows every picture of every run in one grid, by shape, starred or protected, in three sizes, in even tiles. The arrow keys walk the library while it has a picture: ← → the picture before and after, ↑ ↓ a row of the gallery (in the runs, the run before and after); the stage follows.

**Compare**: **Compare…**, then the other picture picked in the library: the two one over the other under a divider you drag (← → move it), or side by side (S); X swaps them, Esc closes.

**A picture's menu** (a right click on any picture): Over the page, To the stage, To the form, All of it to the form, As reference, Compare…, Set as cover, Upscale (2K or 4K), Star it, Pick it, Copy the prompt, Copy the seed, Download, The file in a new tab, Its run, To the trash.

**Picking many**: Ctrl+click picks pictures, Shift+click a range; the bar of the picked stars them, upscales them or puts them in the trash at once (Esc lets go).

**The trash**: **Trash** on a run moves it to `trash/artist/`; the stage's Trash puts a picture aside. The **Trash** look shows the pictures put aside (Restore, ✕, Restore all), then the runs in the trash (Restore, Delete for good); **Wipe out** deletes all it shows, asked first. **Trash (Art)** in the Librarian holds the art put away in one list, the covers taken off takes too.

**The Artist's log**: the server log's frame has an **Artist** view, the room's own: what was asked (the painter, the fine-tune, the shapes, the seed, the sampling, the adapters), what the lab answered (a refusal in its own words), each run's way to its end (waits and why, the card it paints on, done, stopped, failed and why). **⧉** opens it in a window of its own, with the cards live beside it.

## 14. Covers for Takes

A square picture's **Set as cover** makes it the cover of the take in hand: in its card, in the player and in its MP3. The cover it had is kept beside the take (`artwork-removed/`), and the other letter of an A/B pair gets the new one too when it has none. A cover is the take's own copy (1024 px, naming the run and the picture it came from), so taking it off the take never touches the picture, and the picture going never touches the cover; putting such a picture in the trash asks whether to take the cover off the take too, or leave it.

**A take's own artwork** (*Draw artwork* in its menu, in the Librarian, for one take or many) is painted by the painter chosen in **Engine → Artwork**: by the cards (Krea 2 Muse Q4 from 16 GB, else SDXL), or one you choose, Qwen painters among them; a small language model writes its prompt from the take's style and words.

## 15. Recipes

**A cover, quick.** Krea 2 Muse Q4, 1:1, Variations 4, the sampling as it comes. Two minutes for four candidates; pick, Set as cover.

**Finished realism.** Qwen-Image 2512 with an fp8 fine-tune, Lightning off, 30 to 40 steps, Guidance 4, ER-SDE or RES 2s with Beta. Then Second pass ×2 at 0.45 with Extra noise 0.6 (the form's sampling carries into it), then Upscale 4K or the passes.

**Viktor's ComfyUI first and second pass.** An fp8 fine-tune, ER-SDE and Bong tangent, 12 steps; Second pass ×2 with 0.6 of extra noise and many steps without Lightning, the strength between 0.5 and 0.65.

**A video frame from a cover.** The cover as reference, Paint around it, the 16:9 shape (or 9:16 for a short): the edges painted in its colours and light, the cover whole in the middle. On the canvas, move or scale the cover in each frame first if it should not sit in the middle.

**Fix one part.** The picture as reference, Mask… over the part, the prompt saying what should be there, strength 1.0; Grow 16, Edge 24, Soft, Grain 0.15 for a seam you cannot see.

**Two subjects in their places.** The main prompt for the whole scene, a region for each subject (left half, right half), the regions' words short and concrete.

**An old painting's style for a new scene.** The painting as reference, Use it: for its style only, the prompt for the new scene.

**The same scene in another season or hour.** The picture as reference, Use it: to edit by words, the prompt saying the change (*the same street in heavy rain at night*).

**A print.** Second pass ×2, then Passes… to 7680 on the long side, TTA for a smooth sky.

## 16. When Something Goes Wrong

| what you see | why | what to do |
|---|---|---|
| the subject painted twice | Qwen-Image 2512 with Lightning on Karras, Exponential or KL optimal | Simple, Beta, Beta 57, SGM uniform or Bong tangent |
| soft, hazy Qwen pictures | Euler SDE without Lightning | Euler, ER-SDE or RES |
| colours and edges burnt | the adapters' sum past about 1.8 | lower them (the Together bar), or keyframes that let one go early |
| «the adapter reaches no layer» | an adapter made for another model | put it in its own family's folder |
| letters you did not ask for | both painters letter covers by themselves | end the prompt with *no text* |
| a picture missing from a run | the content filter flagged it | the run says so; change the prompt |
| a visible seam round a mask | a hard edge | Grow, Edge, Soft and a little Grain |
| the second pass moved the scene | the strength too high | 0.4 to 0.5 |
| the run waits for a card | the lab's cards are busy or too small now | the log's activity says why; Off the queue takes it back |
| «no card here can take this» | the painter with its adapters needs more than any card holds | fewer adapters or a smaller painter (Krea 2 and Qwen-Image 2512 stream instead when they can) |
| regions ignored | Qwen-Image 2.1 chosen, or a region without words | Krea 2 or Qwen-Image 2512, words in each region |
| slow first run, quick next ones | the painter loads once and stays ten minutes | as meant |

## 17. The Numbers

Measured on an RTX 3090 (24 GB) with the studio's own tools.

| what | time | card at the peak |
|---|---|---|
| Krea 2 Muse Q4, 1280² | about 35 s | about 10 GB |
| Krea 2 Muse Q4, 16:9 | about 47 s | about 11 GB |
| Krea 2 Muse Q8, 1280² | about 34 s | about 16 GB |
| Qwen-Image 2512 Q4, 1328², Lightning | 30 s | 14.3 GB |
| Qwen-Image 2512 Q6, 1328², Lightning | 32 s | 17.6 GB |
| Qwen-Image 2512 fp8 fine-tune, 1328², Lightning 0.55, 12 steps | 37 s | 21.0 GB |
| Qwen-Image 2512 fp8 fine-tune, 16:9 | about 141 s with its loading | 20.5 GB |
| Qwen-Image 2.1 from words, 1328² | 120 s | 16.4 GB (whole), 4.1 GB (streamed) |
| Qwen-Image 2.1 editing | 122 to 129 s | 19.1 GB (whole), 7.9 GB (streamed) |
| two regions, Krea 2 Q4, 16:9 | 137 s | as without |
| second pass ×2, Krea 2 Q4 to 2560² | 86 s | 14.5 GB |
| second pass ×2, Qwen-Image 2512 fp8 to 3840 × 2160 | 220 s | 22.9 GB |
| upscale ×2, 4x_Nomos8kDAT, 1280² to 2560² | 32 s | 2.1 GB |
| upscale passes, his chain, 1920 × 1080 to 7680 × 4320 | 246 s | |

A painter's first run adds its loading: about 25 s for Krea 2 Muse, a minute or two for the Qwen painters.

## 18. For Scripts and Agents

The lab answers on the studio's machine (through the page at `/lab/…`); the studio's API (`/api/v1`, OpenAPI 3.1) and its MCP server sit beside it. The Artist's own endpoints:

- `POST /artist/draw`: a run. Its body: `prompt`; `shapes` (`1:1`, `16:9`, `9:16`); `count` (1 to 4); `seed`; `painter` (`krea2-q4`, `krea2-q8`, `qwen2512-q4`, `qwen2512-q6`, `qwen2512-fp8`, `qwen21`); `model` (an fp8 fine-tune's file); `sampling` (`steps`, `sampler`, `schedule`, `lightning`, `cfg`); `loras` (`[{id, weight, keys}]`); `ref` (a data URL, or `{id, file}` of an earlier run's picture) with `strength` (0.2 to 1) and `ref_as` (`edit`, `style`); `mask` with `mask_opts` (`grow`, `edge`, `soft`, `grain`); `fit` (paint around it); `place` (the canvas: `{shape: {x, y, s}}`); `inject` (0 to 2); `scale` (1.5 or 2, a second pass); `regions` (`[{prompt, box: [x, y, w, h]}]`, three at most); `preview`; `take`.
- `GET /artist/runs`, `GET /artist/file`, `POST /artist/stop`, `POST /artist/cover`, `POST /artist/star`, `POST /artist/protect`, `POST /artist/trash`, `POST /artist/restore`, `POST /artist/aside`.
- `GET /artist/painters` (the painters here, their cards and fine-tunes), `POST /artist/unload` (let the kept painters go).
- `GET /artist/upscalers`, `POST /artist/upscale` (`{id, file, model, target}` with `2k` or `4k`; or `passes`, `resample`, `long`, `match`; `tta`; or `items` for many).
- `GET /artist/loras`, `POST /artist/lora-civitai` (look up by hash), `POST /artist/civitai-look`, `POST /artist/civitai-fetch`.

A refusal comes back as `400` with the reason in words, the same words the room shows.

## 19. Licences

Krea 2 Muse: the Krea 2 Community License (its content filter applies to every picture the studio paints). Qwen-Image 2512 and Lightning: Apache-2.0. The fp8 fine-tunes: each its author's terms. Qwen-Image 2.1: the Qwen Research Licence, research and evaluation only. Adapters: each its author's terms, as Civitai lists them. Upscalers: each its own; OpenModelDB's notes say which are non-commercial, and the room marks them. What you may do with the pictures you paint follows from these; when it matters, read them before you sell.

## 20. What Comes Next

The title and the artist's name written on a cover (lettering), the versions of a take's picture, and SeedVR as an upscaler (in 2.1.0, with the DAW phase).
