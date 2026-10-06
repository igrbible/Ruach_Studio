# Architecture

> Full technical reference for yue2.cpp. For a quick start guide, see [README.md](../README.md).

# yue2.cpp

Portable C++17 implementation of YuE2 song generation using GGML.
Style tags and lyrics in, stereo 48kHz MP3 or WAV out, with the ABC score
the model composed. Runs on CPU, CUDA, Vulkan.

Source of truth: the `m-a-p/YuE2-3B` checkpoint and the modeling code it
ships (`modeling_yue2.py`, `protocol.py`, the generation config), plus the
`m-a-p/YuE2-Vae` decoder. The parity harnesses import that modeling code
straight out of `checkpoints/`, so the reference is the checkpoint itself,
not a separate library pin.

## Build

```bash
git submodule update --init

mkdir build && cd build

# macOS (Metal + Accelerate BLAS auto-enabled)
cmake ..

# Linux with NVIDIA GPU
cmake .. -DGGML_CUDA=ON

# Linux with Vulkan
cmake .. -DGGML_VULKAN=ON

cmake --build . --config Release -j$(nproc)
```

### Windows

Install [Visual C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
(select "Desktop development with C++" workload) and optionally the
[CUDA Toolkit](https://developer.nvidia.com/cuda-downloads) and/or the
[Vulkan SDK](https://vulkan.lunarg.com/sdk/home).

```cmd
git submodule update --init

call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"

mkdir build
cd build

rem NVIDIA GPU
cmake .. -DGGML_CUDA=ON

rem AMD/Intel GPU (Vulkan)
cmake .. -DGGML_VULKAN=ON

rem all backends (CUDA + Vulkan + CPU, runtime loading)
cmake .. -DGGML_CPU_ALL_VARIANTS=ON -DGGML_CUDA=ON -DGGML_VULKAN=ON -DGGML_BACKEND_DL=ON

cmake --build . --config Release -j %NUMBER_OF_PROCESSORS%
```

Builds six binaries: `yue-plan` (symbolic planning CLI), `yue-synth`
(full pipeline CLI), `yue-server` (HTTP server with embedded WebUI),
`neural-codec` (Oobleck VAE codec), `mp3-codec` (MP3 encoder/decoder)
and `quantize` (GGUF requantizer).

A single `build/` directory serves every backend combination. With
`buildall`, the backend is picked at runtime: the `GGML_BACKEND`
environment variable forces a specific device (`CUDA0`, `Vulkan0`, `CPU`),
unset picks the best available one.

## Models

Two GGUF files, one per checkpoint repository:

| GGUF | Component | Native dtype | Size |
|------|-----------|--------------|------|
| YuE2-3B-BF16.gguf | 3.6B Mixture-of-Transformers backbone | BF16 | 7.17 GB |
| YuE2-Vae-F32.gguf | Oobleck VAE encoder + decoder | F32 | 530 MB |

Quantized from the native backbone by `quantize.sh`: Q8_0 at 3.81 GB, Q6_K
at 2.94 GB, Q5_K_M at 2.62 GB. The scripts and the examples load Q8_0. The
published set lives at
[Serveurperso/YuE2-GGUF](https://huggingface.co/Serveurperso/YuE2-GGUF),
named after the checkpoint repositories it comes from.

The converter always produces the native dtype of the safetensors source,
byte for byte: BF16 tensors pass through untouched, F32 tensors stay F32.
No dtype exists in a GGUF that does not exist in the checkpoint.

The backbone GGUF carries 627 tensors plus two metadata payloads: the
checkpoint `config.json` verbatim under `yue2.config_json`, and the
`qwen.tiktoken` BPE converted to the GPT-2 vocabulary and merges layout
the tokenizer expects. One tensor of the checkpoint is deliberately absent:
`latent_pos_embed.pe` is a non-learned sinusoidal table of 24576 x 2048,
recomputed at load instead of costing 100 MB on disk.

The VAE GGUF keeps the weight norm pairs (`weight_g`, `weight_v`) and the
log scale snake parameters raw. Folding happens at load: `w = g * v / ||v||`
on axis 0, `exp(alpha)` and `1 / exp(beta)` for the snake, which is the
inference form of the same weights. The positional `nn.Sequential` names
are remapped onto the block vocabulary of `src/vae.h` at conversion.

Quantized variants are generated from the natives by `quantize.sh`. The
backbone stops at Q5_K_M: an audio code LM breaks below Q5, the same rule
as the acestep and MiniMax ports. The per layer policy of the M variants
reads `yue2.block_count`, which the converter writes next to the config
json. `embed_tokens` and the untied `lm_head`
always take Q6_K, 1D norms and biases are promoted to F32, and the VAE is
never quantized (its architecture is recognized by the `yue2-vae` value of
`general.architecture`).

## VRAM and model residency

Module loads go through a `ModelStore` (`src/model-store.h`), the single
owner of the GGML module instances. The pipeline borrows modules through
refcounted RAII handles (`ModelHandle`), stage by stage, and the store
decides what stays in VRAM following its eviction policy:

- `EVICT_STRICT` (default, hardcoded in the CLIs): at most one
  coexistence group resident at a time. The AR group `{ LM }` runs the
  score and the semantic stages, the synthesis group `{ NAR, VAE }` the
  flow matching and the decode, so when the synthesis group is required
  the AR half has been released and is unloaded. The two halves of the
  backbone never coexist, the peak is the larger one. The transcriber
  `{ SS2 }` is a group of its own, loaded for a transcription and
  unloaded after it.
- `EVICT_NEVER` (`yue-server --keep-loaded`): nothing is ever evicted,
  modules accumulate, which is the layout of a card with the budget.

A require of an already resident key is a cache hit on the same
instance. A conflicting require while a module of another group is still
held aborts: the strict invariant is enforced, not documented.

The KV cache is not a module. The AR fills it and the NAR reads it, so
it belongs to the pipeline (`Qw3lmKvCache`, bound to the shared backend
by `pipeline_configure()`) and survives every eviction: that is what
lets the two halves of one GGUF trade places in VRAM around it. It is
allocated at the sets a request needs and freed at the end of the
request under STRICT, so nothing stays on the GPU between two requests;
under `--keep-loaded` it stays with the modules. A song that fits one
chunk swaps once; a replayed stream prefills with the AR half then
swaps; a song longer than one context window swaps around every chunk,
which the store logs.

Weight buffers per module, measured at load on CUDA:

| Module | BF16 | Q8_0 | Q6_K | Q5_K_M |
|--------|------|------|------|--------|
| Backbone, AR half (311 tensors) | 4131.5 MB | 2195.1 MB | 1694.8 MB | 1542.4 MB |
| Backbone, NAR half (316 tensors) | 2698.0 MB | 1433.5 MB | 1107.0 MB | 953.9 MB |
| Transcriber, SheetSage2 on MERT-v2 (1035 tensors) | 2582.1 MB (F32) | 912.6 MB | 775.6 MB | 702.4 MB |
| VAE decoder | 126.7 MB | | | |

The KV cache is the other big term and the only one that scales with a
knob: `2 * 28 * 2 * 128 * 8 * max_seq * 2` bytes, so 2688 MB per set at
the full context. One set per song of the batch, two under classifier
free guidance, grown on demand; `--max-seq` and `--max-batch` are the
levers that trade context and batch for VRAM. Measured peak above idle
on a 65 s song in Q8_0 under STRICT: 5.8 GB at the full context, 3.8 GB
at `--max-seq 8192`, the compute buffers of the three graphs making the
difference with the weights plus the cache, the VAE tiles first. A cache smaller than the
default budgets needs a `duration` on the request, the generator refuses
a prefix plus budget that would not fit.

The cost of STRICT is one reload of each half per song from the page
cache, about a second on the pod, `--keep-loaded` removes it.

## Pipeline

```
style tags + lyrics
        v
LM, Autoregressive (AR)            writes the ABC score, then the semantic codes at 25 Hz,
        v  evict / load            and leaves everything in the KV cache
LM, Non-Autoregressive (NAR)       reads that cache and paints the acoustic latents by flow
        v  evict / load            matching, 64 channels per frame, all frames at once
VAE, Oobleck decoder               1920x upsample -> 48 kHz stereo
```

One backbone GGUF holds the two halves of a single Qwen3 transformer: the
same 28 layers with two sets of attention projections and MLPs, one to
write tokens, one to paint latents, sharing the embeddings and the final
norm. The AR half works like a language model: token by token, it first
writes the ABC score, a symbolic plan in plain text you can read and edit,
then the semantic codes, one per 40 ms frame, and every token it processes
lands in the KV cache. The NAR half is the same network used the other way
round: it starts from Gaussian noise for every frame of the song, attends
on the cache the AR half just left, and refines all the frames together
with a midpoint flow matching solver, 32 steps of two evaluations, from
noise to latents. The VAE turns the latents into sound, 1920 samples per
frame.

Only one module is in VRAM at a time. The AR half is evicted once the
codes are written, the NAR half loads, is evicted in turn, and the VAE
loads; the KV cache stays through all of it, so the halves trade places
around it and nothing is recomputed, and once the track is out the
cache goes too, nothing stays on the GPU between two requests. `--keep-loaded` keeps everything
resident on a card with the budget.

Frame rate: 48000 / 1920 = 25 Hz, the semantic stream and the acoustic
latents share it, one code per latent frame.

## Components

### Backbone (`YuE2-3B`, Mixture-of-Transformers)

One 3.6B file holds two complete transformers that share their shape and
their attention core. Each layer carries an autoregressive set
(`input_layernorm`, `self_attn`, `post_attention_layernorm`, `mlp`) and a
non-autoregressive set (`nar_input_layernorm`, `nar_self_attn`,
`nar_pre_mlp_layernorm`, `nar_mlp`). The reference routes token by token
on a mask; this port splits the two paths into two graph builders that
read the same cache, which is the same computation with none of the
routing.

28 layers, hidden 2048, GQA 16/8, head_dim 128 (square q_proj), SwiGLU
6144, RMSNorm eps 1e-6, QK-norm before RoPE in the Qwen3 style, RoPE NeoX
theta 1e6, context 24576, untied lm_head, vocab 184704 (text, ABC, control
and 32768 semantic codes).

`src/qwen3-lm.h` builds the autoregressive half: a prefill of one
sequence into one KV set, and a batched decode of N sequences over N
consecutive sets, which is the one decode path (N=1 for a single unguided
song, 2N under guidance, one set per song of a batch). Both compute the
LM head on the rows a stage samples from, its content range and its end
token, which sit next to each other in the vocabulary: 151849 rows for
the score stage, 32769 for the semantic one instead of 184704, the
largest matmul of a decode step and its transfer cut by 5.6x on the
semantic stage, the logits unchanged since each is its own dot product. `src/nar.h` builds
the other half plus the flow matching heads, and solves the M noise
variations of a song in one graph over the set the AR left complete.

### Flow matching heads

```
vae2llm              64 -> 2048 with bias, latent frame to model width
llm2vae              2048 -> 64 with bias, velocity head
time_embedder        sinusoidal 256 -> linear -> SiLU -> linear -> 2048
latent_pos_embed.pe  sinusoidal table, not learned, rebuilt at load
```

The timestep embedding is shared by every frame of a block. The frame
embedding is interleaved sin/cos over the hidden width, indexed locally
inside the block, and rebuilt in F32 while the checkpoint stores it in
BF16: the entry term differs from the reference by the BF16 rounding of a
sinusoid, which is the largest single epsilon source of the NAR parity
case.

### Frozen tokenizer

The text and ABC BPE ships inside the backbone GGUF, converted from the
`qwen.tiktoken` ranks of the checkpoint: 151643 ordinary tokens, 8 specials,
200 `<extra_i>` slots with `<abc>` and `</abc>` overwriting two of them,
for 151851 entries. The control and code ids of the protocol live above
that ceiling by construction, so they can never collide with text.

`bpe_encode` is the ordinary encoder of the reference: NFC normalization,
the pre-tokenizer pattern, the GPT-2 byte level mapping, then the merges.
Special tokens never match inside the text, a literal `<|endoftext|>` in
lyrics encoding as the characters it is made of.

`src/unicode.h` carries what the pattern and the normalization need: UTF-8
transport, the canonical decomposition and composition of NFC with the
Hangul syllables handled algorithmically, the canonical combining classes,
and the letter and number categories. The data lives in
`src/unicode-table.h`, generated by `tools/gen-unicode.py` from the Python
Unicode database, sorted for binary search: 2061 decompositions, 941
compositions, 388 combining class runs, 660 letter ranges, 137 number
ranges. The pre-tokenizer matches the pattern alternative by alternative at
each position, the first one that matches winning, which is what the regex
engine of the reference does.

### Oobleck VAE (`YuE2-Vae`)

SnakeBeta decoder, 6 blocks, decoder strides 6/5/4/4/2/2 for a 1920x
upsample, latent 64 channels, 48 kHz stereo. The snake activation carries
two parameters: `y = x + sin^2(exp(a) * x) / exp(b)`.

```
conv1                 conv1d 64 -> 2048, k=7
blocks.{0..5}         snake -> conv_t (stride s, k = 2s) -> 3 x res_unit
res_unit              skip -> snake -> conv k=7 dilated -> snake -> conv k=1 -> + skip
snake_out, conv2      conv1d 64 -> 2, k=7
```

The odd stride 5 drops one frame, and the deficit lands in the tail, so
the exact output length is `T_audio = 1920 * T_latent - 64`. The left
anchor is fixed, which is what makes the tiling alignment exact.

The encoder (`src/vae-enc.h`, used by `neural-codec --encode`) is the
mirror of the decoder, 128 output channels split into mean and log
variance, and the encode keeps the mean: deterministic, no sampling.

GGML lowering: transposed convolutions as GEMM plus `col2im_1d`, snake
activations written as their 5 op decomposition so the backend pattern
matcher dispatches its fused kernel (see [Patched GGML fork](#patched-ggml-fork)).
Conv weights are stored F16 on device with F32 activations.

### SheetSage2 transcriber (`SheetSage2`, optional)

The audio to score model of the same authors, ported so a recording can
become the `abc` of a cover. One GGUF holds MERT-v2-FullSong with the
SheetSage2 LoRA adapters merged into its attention projections (float32
at conversion, bit identical to the merge the reference does at load)
and the SheetSage2 head. `src/sheetsage.h` runs one 300 s window, every
input padded with silence to that length like the reference since the
global response norm of the frontend spans the whole window:

```
24 kHz mono
        v  log mel on the host: centered STFT 2048/240, 128 bins, dB, per bin normalization
[128, 30000]
        v  three ConvNeXt blocks, 128 / 512 / 1024 channels, strides 1 / 2 / 2,
           depthwise conv k=7, LayerNorm, GELU, global response norm over time
[1024, 7500]
        v  24 conformer layers: macaron FFN, attention with NeoX RoPE (base 1e4),
           conv module (pointwise, GLU, depthwise k=31, LayerNorm, GELU, pointwise), FFN, LayerNorm
        v  softmax mix of the 25 states, projection 1024 -> 512
memory [512, 7500]
        v  BART decoder, 6 layers d=512, 8 heads, learned positions offset by 2,
           self attention on a cache, cross attention on the memory, tied output
symbolic tokens (vocab 31678), greedy under the grammar of the event stream
        v  ss2_decode_events: subbeat shifts, fields, timestamp anchors -> timed events
        v  notation.h: beats, measures, subbeat grid, voices, keys, chords, sections
ABC score
```

Depthwise convolutions are sums of shifted views, exact F32 on every
backend. Songs longer than a window run windows of 300 s with 200 s of
overlap and 100 s of lookahead, each later window prefixed with the
re-encoded events of the overlap. The tokenizer tables and the ABC
spelling of every chord and key label travel in the GGUF metadata.

## Inference recipe

### Prompt assembly

```
ids = [151643 endoftext]
    + bpe(instruction + "\n[Tags]\n" + style + "\n[Lyrics]\n" + lyrics + "\n")
    + [151847 abc_start] (+ abc ids + [151848 abc_end])
    + [151851 music_start]
```

The instruction is picked by the chain of thought mode and decides who
writes the score: `full` asks for a chord annotated ABC transcription,
`melody` for a melody only one, `off` goes straight to codec tokens and
closes the score slot immediately (`abc_start` then `abc_end`). An open
slot is exactly the prefix the planning stage starts from.

Style and lyrics reach the model verbatim. The protocol defines no caption
cleaning and no lyrics normalization, so `src/prompt.h` performs none. The
only transformation is the NFC normalization the tokenizer applies to
everything it encodes.

The unconditional stream keeps the instruction alone and drops style and
lyrics, so guidance pulls toward the requested text. It repeats the same
ABC ids, and in `off` mode it omits the score slot entirely.

Special ids: `abc_start` 151847, `abc_end` 151848, `music_start` 151851,
`music_end` 151852, semantic codes at `151853 + c` over 32768 entries.
The text tokenizer stops at 151851 ranks, so the control and code ids live
outside it by construction.

### Stage 1, the symbolic plan

The backbone decodes from the open prefix until `abc_end` or the 4096
token budget. Checkpoint sampling: temperature 0.7, top-p 0.9, top-k 30,
repetition penalty 1.005 over a 100 token window, floor of 32 tokens
before the end token is allowed. The result is decoded back to text and
travels with the track: it is the interface a human can read and edit.

### Stage 2, the semantic stream

The full prefix, score included, prefills KV set 0 and the model decodes
codec tokens until `music_end` or the 9000 frame budget (6 minutes).
Checkpoint sampling: temperature 1.0, top-p 0.95, top-k 100, repetition
penalty 1.2 over a 50 token window, floor of 200 tokens.

Guidance is 1.0 by default in `melody` and `full` mode, which keeps a
single branch, and 1.01 in `off` mode. Anything different from 1.0
prefills the unconditional prefix into KV set 1 and decodes both branches
as one batch of 2, the logits combining as
`uncond + scale * (cond - uncond)` before the distribution.

Sampler order, fixed by the protocol and ported in `src/sampling.h`: mask
to the ids the stage allows, block the end token while the step count is
below the floor, apply the frequency penalty of the window
(`alpha = penalty^freq`, multiply a negative logit and divide a positive
one), temperature, top-k, top-p. The survivors carry the scores the final
softmax runs on.

The draw is conformant with `torch.multinomial(p, 1)` at equal seed:
without replacement torch takes `argmax(p / Exp(1))`, each vocabulary
entry drawing its exponential from its own Philox subsequence, so only the
nucleus needs drawing. The stage seed is the Philox key and the step index
is the offset. Both stages restart the generator at the request seed,
which the release does on purpose.

### Stage 3, flow matching on the KV cache

This is where the port diverges the most from a straight transcription of
the reference. The autoregressive stage leaves the prefix and the codes in
KV set 0; one forward of `music_end` completes the sequence the flow
matching half attends to. Its prefill therefore never runs.

The NAR graph reads that cache and never writes to it: fresh Q/K/V for the
latent block concatenate behind the AR window pulled from the cache, so
there is no write to order against the read and the hazard cannot exist.
Every NAR query sees every key, so the additive mask is uniformly zero and
carried as an explicit input rather than left null.

The block is `[LATENT_START, frames..., LATENT_END]`, the two markers
being rows of zeros. RoPE positions continue the sequence
(`ar_len .. ar_len + N - 1`) while the frame embedding is indexed locally
inside the block.

The song is cut into acoustic chunks of `(context - prefix - 3) / 2` frames,
the rule of the reference: the context has to hold the prefix, the codes of
the chunk and their latent block, the codes and the frames counting twice
over. Each chunk carries its own sequence, `prefix + its own codes +
MUSIC_END`, so it gets its own AR prefill. The nominal case is one single
chunk, and there the sequence is exactly what the generation left in the
cache: the end token completes it and the prefill never runs. A prefix over
6573 tokens is what pushes a full length song to two chunks.

The noise is drawn once for the whole song and each chunk takes its view of
it, again the rule of the reference.

The graph is rebuilt in a `GraphArena` at every evaluation. Rewinding the
arena lands every node at the address it already had, so the backend graph
cache resolves to the same executable instead of thrashing. This is not a
precaution: a cached `cgraph` replayed as is does not survive on CUDA,
which cost a measured debugging session.

Solver: 32 midpoint steps, `t` walking from 1 down to 0, `dt = 1 / steps`.
The raw timestep fed to the embedder is `logit(t)` saturated at plus or
minus 20, then reshaped by the release curve, which is the identity at the
checkpoint `timestep_shift` of 1.0. Per step:
`first = v(state, t)`, `mid = state - first * dt / 2`,
`state -= v(mid, t - dt / 2) * dt`.

Initial noise: `torch.randn` on a CPU generator, drawn once for the whole
song and seeded by the request seed. The stream is reproduced exactly in
`src/torch-cpu-rng.h`: mt19937 with the torch seeding, the 24 bit uniform
conversion, and the ATen normal fill that rewrites the tensor in blocks of
16 by pairing element j with element j+8, a tail shorter than 16 causing a
redraw of the last 16 uniforms.

### VAE decode and tiling

The decoder runs on tiles of `core` latent frames (default 512) with a
`halo` of 16 frames on each side. The tile size only moves the peak of
the F32 activations, about 2 GB per thousand frames, and not the decode
time, which stays at the compute bound of the convolution stack on the
GPU; 512 is the setting of the reference for cards up to 12 GB, and it
costs nothing above. Each tile decodes
`[start - halo, end + halo)` and keeps only its core samples: the left
halo scales exactly by 1920 so the crop is exact, and the concatenated
cores are the same signal a single pass would produce. There is no
crossfade and no zero padding.

### Post-processing

The pipeline outputs planar stereo float `[L: T][R: T]` at 48000 Hz, full
range. Normalization and encoding belong to the output stage (server worker
or CLI): percentile peak normalization targeting the `1 - peak_clip / 1e6`
percentile (`peak_clip = 0` is plain peak normalization; WAV32 skips
normalization entirely and writes raw IEEE float), then MP3 at
`mp3_bitrate`, or WAV 16/24/32 encoding in memory. `src/audio-io.h` is the
same file as in the other ports, so the post-processing is identical.

## Request JSON reference

Every field has a default. Omitting a field is strictly equivalent to
sending it with its default value. Only `style` or `lyrics` is required:
the server rejects a request with neither.

```json
{
    "style":           "",
    "lyrics":          "",
    "abc":             "",
    "cot":             "full",
    "duration":        360.0,
    "lm_seed":         -1,
    "seed":            -1,
    "steps":           32,
    "lm_batch_size":   1,
    "synth_batch_size": 1,
    "cfg_scale":       -1.0,
    "semantic_tokens": "",
    "peak_clip":       10,
    "output_format":   "mp3",
    "mp3_bitrate":     128,
    "abc_sampling":      { "temperature": 0.7, "top_p": 0.9,  "top_k": 30,  "repetition_penalty": 1.005, "penalty_window": 100, "min_tokens": 32,  "max_tokens": 4096 },
    "semantic_sampling": { "temperature": 1.0, "top_p": 0.95, "top_k": 100, "repetition_penalty": 1.2,   "penalty_window": 50,  "min_tokens": 200, "max_tokens": 9000 }
}
```

**`style`** (string)
Style tags fed to the model, reaching it verbatim under the `[Tags]`
header. Comma separated descriptors are what the checkpoint was trained
on. See `tools/webui/example/` for complete requests. Both `style` and
`lyrics` accept the empty string, as in the reference: the model then
composes on its own.

**`lyrics`** (string)
Song lyrics with their structural tags, verbatim under the `[Lyrics]`
header.

**`abc`** (string, default `""`)
ABC score to realize. Non-empty replaces the planning stage: the score is
tokenized into the prefix as is. Empty in `melody` or `full` mode hands
the pen to the model, and the score it wrote comes back in the reply so it
can be edited and submitted again.

**`cot`** (string, default `"full"`)
Chain of thought mode: `"full"` for a chord annotated score, `"melody"`
for a melody only score, `"off"` to skip the symbolic stage.

**`duration`** (float seconds, default `360.0`)
Target length. The preset of the semantic stage caps it, so the shorter of
the two wins and the model can still end the song earlier on its own.

**`lm_seed`** (int64, default `-1` = random)
Seed of the token draw, consumed as a Philox key: the score, the melody and
the length come from this one.

**`seed`** (int64, default `-1` = random)
Seed of the acoustic noise, consumed as an mt19937 seed. The release runs
both stages from a single seed; splitting them is ours, and it buys
re-rendering the same codes under another noise. Both are resolved before
the job starts and returned with the track, so a replay reproduces it.

**`steps`** (int, default `32`)
Midpoint steps of the flow matching ODE. Minimum 1.

**`lm_batch_size`** (int, default `1`)
Songs generated from the prompt. Song `i` draws its score and its semantic
stream with `lm_seed + i` in its own KV set, the batch decoding in
lockstep; a song that ends stays in the batch as a passive row. Bounded by
`--max-batch` on the server. Ignored when `semantic_tokens` is supplied.

**`synth_batch_size`** (int, default `1`, server bound `9`)
Flow matching variations per song, variation `j` drawing its noise with
`seed + j` on the same semantic stream, the variations of a song solved
side by side in one NAR graph. Tracks come out song-major: track
`song * synth_batch_size + variation`, each with its own replay request
carrying the exact seeds it consumed and both counters reset to 1.

**`cfg_scale`** (float, default `-1` = protocol)
Classifier free guidance on the semantic stage. Negative applies the
protocol value, 1.01 in `off` mode and 1.0 otherwise. Exactly 1.0 keeps a
single branch and halves the decode cost.

**`semantic_tokens`** (string, default `""`)
Semantic stream as comma separated codec values, 25 per second. Non-empty
replaces the autoregressive stage: prefix and codes prefill in one forward
and the song renders deterministically, so the flow matching side (steps,
seed, decoder, output format) can be iterated without re-rolling the
model. Written by `yue-synth --tokens` and returned by the server as the
JSON part paired with the audio.

**`peak_clip`** (int, default `10`)
Output normalization percentile control: the normalization peak is the
`1 - peak_clip / 1e6` percentile of the absolute signal. `0` normalizes to
the true peak with no clipping. Ignored by `wav32`.

**`output_format`** (string, default `"mp3"`)
Audio encoder: `"mp3"`, `"wav16"`, `"wav24"`, `"wav32"`.

**`mp3_bitrate`** (int, default `128`)
MP3 encoder bitrate in kbps. WAV outputs ignore it.

**`abc_sampling`**, **`semantic_sampling`** (objects)
Per stage sampling presets, checkpoint values by default. Bounds enforced
on both sides: temperature in [0, 5], top-p in (0, 1], top-k at least 1,
repetition penalty positive, penalty window in [1, 100], `min_tokens`
between 0 and `max_tokens`, `max_tokens` at least 1. A preset outside the
bounds is a 400 from the server and a FATAL from the CLI.

## yue-plan reference

Runs the first autoregressive stage alone and writes the composition the
model intends to play.

```
Usage: ./yue-plan --model <gguf> --request <json> [options]

Required:
  --model <gguf>         Backbone GGUF
  --request <json>       Input request JSON

Optional:
  --out <path>           Output score (default: score.abc)
  --lm-seed <N>          Token sampling seed (default: random)

Debug:
  --max-seq <N>          KV cache size (default: model context)
  --dump-tokens <path>   Dump prefix token IDs (CSV)
  --no-fa                Disable flash attention
  --clamp-fp16           Clamp hidden states to FP16 range
```

The VAE is not loaded: this stage is text in, text out.

## yue-synth reference

Full pipeline, style and lyrics to stereo audio.

```
Usage: ./yue-synth --model <gguf> --vae <gguf> --request <json> [options]

Required:
  --model <gguf>         Backbone GGUF
  --vae <gguf>           VAE GGUF
  --request <json>       Input request JSON

Optional:
  --out <path>           Output audio (default: song.mp3), a batch numbers it
  --duration <s>         Target length in seconds
  --lm-seed <N>          Token sampling seed
  --seed <N>             Acoustic noise seed
  --steps <N>            Flow matching steps

Debug:
  --score <path>         Also write the planned score
  --tokens <path>        Also write the semantic stream (CSV)
  --latent <path>        Also write the acoustic latents (.vae)
  --max-seq <N>          KV cache size (default: model context)
  --vae-core <N>         VAE tile core frames (default: 512)
  --vae-halo <N>         VAE tile halo frames (default: 16)
  --no-fa                Disable flash attention
  --clamp-fp16           Clamp hidden states to FP16 range
  --dump <dir>           Dump intermediate tensors
```

A batch numbers every output path with song then variation index,
`song.mp3` becoming `song00.mp3`, `song01.mp3`, and every track gets its
replay request next to it as `.json`.

The content of a song lives in the request and nowhere else: style, lyrics,
score, codes, sampling presets. The flags above only carry what a scripted
sweep varies between two runs, and each of them overrides the field of the
same name.

## yue-server reference

HTTP server exposing the pipeline behind an asynchronous job queue, with
the WebUI embedded (gzipped single page app, served at `/`).

```
Usage: ./yue-server --model <gguf> --vae <gguf> [options]

Required:
  --model <gguf>         Backbone GGUF
  --vae <gguf>           VAE GGUF

Optional:
  --transcriber <gguf>   SheetSage2 GGUF, enables /transcribe
  --host <addr>          Listen address (default: 0.0.0.0)
  --port <N>             Listen port (default: 8087)
  --max-batch <N>        Song batch limit, one KV set each (default: 1)
  --keep-loaded          Keep every model resident in VRAM (default: evict between stages)

Debug:
  --max-seq <N>          KV cache size (default: model context)
  --vae-core <N>         VAE tile core frames (default: 512)
  --vae-halo <N>         VAE tile halo frames (default: 16)
  --no-fa                Disable flash attention
  --clamp-fp16           Clamp hidden states to FP16 range
```

The debug flags are global to the process and read when a graph is built,
so they are boot options, not request fields. The modules load at the
first request through the store, one half of the backbone at a time
unless `--keep-loaded` keeps everything resident.

### Endpoints

```
POST /synth                     Submit a generation job, returns job ID
  body: application/json Yue2Request
  response: {"id":"1a2b..."}
  400 on malformed JSON, unknown cot mode, unknown output_format,
  steps < 1, lm_batch_size outside [1, --max-batch], synth_batch_size
  outside [1, 9], or a sampling preset outside the protocol bounds

POST /transcribe                Submit a transcription job, returns job ID
  body: multipart/form-data, an "audio" part (WAV or MP3) and an optional
  "melody_only" field that omits the chord symbols
  response: {"id":"1a2b..."}
  400 without an audio part or on audio that does not decode
  the route is served when the server runs with --transcriber

GET  /job?id=N                  Poll job status
  response: {"status":"running|done|failed|cancelled"}

GET  /job?id=N&result=1         Fetch job result
  multipart/mixed, boundary yue2-batch-boundary: per track, song-major,
  one application/json replay request part (the request carrying the
  semantic stream, the score and the seeds of that track) then one
  audio/mpeg or audio/wav part; for a transcription job, application/json,
  the score as {"abc":"X:1\n..."}
  404 while the result is not ready

POST /job?id=N&cancel=1         Cancel a specific job
  response: {"status":"cancelled"}

GET  /health                    Server health check
  response: {"status":"ok"}

GET  /props                     Version, model paths, rates, default request
  response: application/json

GET  /logs                      SSE stream of server stderr
  response: text/event-stream

GET  /                          Embedded WebUI (gzipped HTML)
```

Error responses are JSON: `{"error":"message"}`.

**GET /props** returns the sample rate, the frame rate, the context, and
the full default request, which is the source of truth for the WebUI
placeholders:

```json
{
  "version": "...",
  "model": "models/YuE2-3B-Q8_0.gguf",
  "vae": "models/YuE2-Vae-F32.gguf",
  "sample_rate": 48000,
  "frame_rate": 25,
  "context": 24576,
  "defaults": { "cot": "full", "steps": 32, "abc_sampling": { }, "semantic_sampling": { }, "...": null }
}
```

### Concurrency

One worker thread consumes jobs from a FIFO queue and runs them serially
through the resident pipeline. The HTTP handler enqueues and returns a job
id immediately; the client polls. Completed jobs sit in memory and are
evicted FIFO past 32 entries, so a disconnected client can still fetch its
result after reconnecting. A running job is never evicted.

Each job carries a cancel flag polled between autoregressive steps,
between ODE steps and between VAE tiles, and passed down to the MP3
encoder. Shutdown (SIGINT/SIGTERM) cancels the active job through the same
flag, so Ctrl+C lands within one poll instead of waiting out a generation.

Server stderr is captured at startup: the real descriptor is duplicated, a
pipe takes its place, and a reader thread forwards every line to the
terminal and to a 512 line ring the SSE endpoint replays. The capture is
released by an idempotent stop that runs both from the RAII destructor and
from an exit hook, so a loader that aborts the process still gets its
message out.

## yue-transcribe reference

```
Usage: ./yue-transcribe --model <gguf> --audio <file> [options]

Required:
  --model <gguf>         Transcriber GGUF
  --audio <file>         Recording to transcribe (WAV or MP3)

Optional:
  --out <path>           Output score (default: score.abc)
  --melody-only          Omit the chord symbols from the score

Debug:
  --no-fa                Disable flash attention
  --dump <dir>           Dump intermediate tensors
```

Audio to score. The recording (any WAV or MP3, any rate, mono or stereo)
is averaged to mono and resampled to 24 kHz, transcribed by the SheetSage2
transcriber (`src/sheetsage.h`, `src/notation.h`), and written as ABC, the
score a cover of YuE2 takes as its `abc`. The full score carries the chord
symbols, `--melody-only` keeps the vocal and instrumental voices alone. The
WebUI offers both from the menu of a song card.

## neural-codec reference

GGML-native codec for the Oobleck latent space. Both halves live in the
VAE GGUF. The encode is deterministic: the posterior mean, no sampling.

```
Usage: ./neural-codec --vae <gguf> --encode -i <audio> -o <latent> [options]
       ./neural-codec --vae <gguf> --decode -i <latent> -o <audio> [options]

Required:
  --vae <gguf>            VAE GGUF
  --encode                Audio to latent
  --decode                Latent to audio
  -i <path>               Input file

Optional:
  -o <path>               Output file (default: input with swapped extension)
  --q8                    Quantize the latent to int8 (encode only)
  --q4                    Quantize the latent to 4 bits (encode only)
  --format <fmt>          mp3, wav16, wav24 or wav32 (decode, default: wav16)
  --bitrate <kbps>        MP3 bitrate (default: 128)

Debug:
  --vae-core <N>          Tile core frames (default: 512)
  --vae-halo <N>          Tile halo frames (default: 16)
```

Three latent formats, all auto-detected on decode by their magic: raw F32
(64 floats per frame, 51.2 kbit/s), `NAC8` (per frame F16 scale plus 64
int8, 13.2 kbit/s) and `NAC4` (per frame F16 scale plus 32 packed bytes,
6.8 kbit/s). The input audio is resampled to 48 kHz when needed.

```bash
# encode a track to the Q8 reduced-bitrate format, decode auto-detects it
./neural-codec --vae models/YuE2-Vae-F32.gguf --encode -i track.wav --q8
./neural-codec --vae models/YuE2-Vae-F32.gguf --decode -i track.nac8 --format wav24

# decode the latents a run dumped with yue-synth --latent
./neural-codec --vae models/YuE2-Vae-F32.gguf --decode -i song.vae -o song.mp3 --format mp3
```

## mp3-codec reference

Standalone MIT-licensed MPEG1 Layer III encoder and decoder. No external
dependencies, no GGML. The encoder is the one `yue-synth` and `yue-server`
use for MP3 output; the decoder uses minimp3 (CC0). Reads WAV or MP3,
writes WAV or MP3 (auto-detected from the output extension).

```
Usage: ./mp3-codec -i <input> -o <output> [options]

  -i <path>     Input file (WAV or MP3)
  -o <path>     Output file (WAV or MP3)
  -b <kbps>     Bitrate for MP3 encoding (default: 128)
  --format <fmt>  WAV format: wav16, wav24, wav32 (default: wav16)

Mode is auto-detected from output extension.

Examples:
  ./mp3-codec -i song.wav -o song.mp3
  ./mp3-codec -i song.wav -o song.mp3 -b 192
  ./mp3-codec -i song.mp3 -o song.wav
  ./mp3-codec -i song.mp3 -o song.wav --format wav32
```

## Accuracy

One test per subject under `tests/`, run from `tests/` with the ready build
in `../build`. Each `test-*.py` owns both sides of its comparison: it builds
the torch reference, runs its `test-*` binary on the same inputs, checks
relative RMS and max absolute error against its own threshold, prints one
line per case and exits non zero on failure. `GGML_BACKEND` selects the
device, and the `test-*.sh` next to each test runs it on every backend that
matters for it and archives the output as `{backend}-{subject}.log`.

Twenty four cases, all green on CUDA0 and CPU:

| Case | Threshold | CUDA0 rel RMS | CPU rel RMS |
|------|-----------|---------------|-------------|
| vae (T=64) | 1e-2 | 2.098e-3 | 6.182e-4 |
| vae-tiled (T=200, core 64) | 1e-2 | 2.216e-3 | 7.142e-4 |
| lm-prefill-0 | 2e-2 + argmax | 1.569e-3 | 2.191e-3 |
| lm-decode-0 (batch of 2, mixed cache lengths) | 2e-2 + argmax | 1.166e-3 | 2.060e-3 |
| lm-prefill-1 | 2e-2 + argmax | 3.294e-3 | 2.239e-3 |
| lm-decode-1 (batch of 2, mixed cache lengths) | 2e-2 + argmax | 2.948e-3 | 1.335e-3 |
| nar (single velocity) | 5e-2 | 8.542e-3 | 8.595e-3 |
| nar-ode (8 midpoint steps) | 5e-2 | 1.552e-3 | 1.448e-3 |
| nar-batch (3 variations, one graph) | 5e-2 | 7.582e-3 | 8.358e-3 |
| nar-ode-batch (2 variations, 8 steps) | 5e-2 | 2.117e-3 | 2.211e-3 |
| sheetsage-mel / subsampled / backbone / mixed / memory (synthetic piece) | 5e-2 | 2.5e-6 to 2.3e-2 | 2.5e-6 to 7.3e-3 |
| sheetsage-tokens, sheetsage-abc, sheetsage-abc-melody | identical | identical | identical |
| bpe | 0 (exact) | 0 | 0 |
| sampling-abc | 1e-4 | 1.138e-8 | 1.138e-8 |
| sampling-semantic | 1e-4 | 5.327e-8 | 5.327e-8 |
| rng-uniform | 0 (exact) | 0 | 0 |
| rng-normal | 1e-5 | 1.766e-7 | 1.766e-7 |
| draw | 0 (exact) | 0 | 0 |

The tiled VAE case compares against the torch decode of the whole
sequence, not against an untiled GGML run, so the halo crop is validated
rather than merely reproduced.

The tokenizer case encodes `tests/bpe-text.txt` and compares the id stream
against the tokenizer of the reference: contractions in both cases,
decomposed and precomposed accents, combining marks that need canonical
reordering, code points excluded from composition, Hangul in jamo and in
syllables, CJK, non-ASCII digits, exotic spaces, emoji and an ABC fragment.
Ids match exactly.

The residual on the transformer cases is activation quantization inside
the GGML `mul_mat` against a torch F32 reference, the same behavior as the
other ports. The NAR case carries one extra term of its own: the frame
embedding is rebuilt in F32 while the reference reads the BF16 table of
the checkpoint.

Two things do not reproduce bit for bit by construction and are not
claimed to: the sampling stream of a seed is conformant rather than
identical when the logits differ at epsilon level, and the backends
disagree on graph fusion, so a song is reproducible on one device and
close on another.

### Cosine similarity harness

`debug-nar-cossim.py` isolates the acoustic stack from the stochastic AR:
the GGML side runs the full pipeline with `--dump` on the shared
`tests/request0.json`, the reference example **City Lights** (English
warm piano pop, a verse and a chorus) with its planned score and its
semantic stream frozen in the file, so the autoregression reduces to
one prefill. The python
side reloads the dumped AR sequence and noise, prefills the reference
backbone into a `CachedNAR` (CUDA float32), walks the same midpoint
schedule and decodes with the reference VAE. It reports per-probe
cosines (timestep embedding, latent block input, layer 0 attention,
named layers 0 / 7 / 14 / 21 / 27, per-step velocities and states, final
latents, decoded audio + STFT cosine) and the error growth across steps.

`./debug-nar-cossim.sh` archives the campaign as
`{backend}-[NOFUSION-]{quant}.log` over CUDA0 / Vulkan0 / CPU, fusion on
and off, quants BF16 / Q8_0 / Q6_K / Q5_K_M, every run on the attention
path the backend executes by default. The backbone quant varies, the
VAE stays F32, and the same score and semantic stream feed every run:
the delta is the pure backbone quant effect on the prefill and the flow
matching of a 64.8 s song.

The F32 attention fallback of `--no-fa` is not the path of the campaign,
and on Vulkan0 it is wrong: `test-lm` in that mode fails at 0.34
relative RMS with wrong argmax from the first prefill layer, while the
same mode holds on CUDA0 and on CPU. The trigger is the `ggml_mul_mat`
of the fallback fed with the strided KV cache view as its first operand,
a `[D, n_kv_pad, Nkv]` view of a view of the 4D cache with a row group
stride of the whole context: a contiguous copy of that view alone
restores the parity.

## Performance

Measured on an RTX PRO 6000 Blackwell, native BF16 backbone, one full song
of 212.4 s (5309 semantic frames, `cot` full, a 2239 token score, 32 ODE
steps), wall clock including model load:

| Path | Time |
|------|------|
| Full generation | 44 s |
| Replay from the semantic stream | 16 s |
| MP3 encode alone (32 threads) | 1.1 s |

About 5x faster than real time end to end. The autoregressive stage is the
cost center at roughly 3.7 ms per sampled token, bandwidth-bound on weight
rereads, which is what the backbone quants buy back. Replaying a rendered
track skips it entirely: the prefix and the codes prefill in a single
forward, so iterating the flow matching side is a few seconds.

## Patched GGML fork

Uses the same patched GGML fork as acestep.cpp and minimaxmusic.cpp (two
custom ops, no upstream kernel modified). The backbone uses only standard
GGML ops.

### `GGML_OP_SNAKE` (fused Snake activation)

Computes `y = x + sin^2(a * x) * inv_b` in a single kernel. The VAE graph
emits the 5 op decomposition (mul, sin, sqr, mul, add) and the backend
pattern matcher fuses it, reading x once and writing y once instead of 5x
the memory traffic.

### `GGML_OP_COL2IM_1D` (scatter-add for GEMM-based conv_transpose_1d)

The VAE decomposes each transposed convolution as `mul_mat + col2im_1d`,
routing the heavy GEMM through the backend tensor cores instead of the
naive upstream `ggml_conv_transpose_1d` kernel. The col2im_1d gather is
pure bandwidth with fused padding crop.
