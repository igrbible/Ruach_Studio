# yue2.cpp

Local YuE2 song generation server with browser UI, powered by GGML.
Style tags and lyrics in, complete stereo 48kHz songs out, with the
symbolic score the model wrote on the way.
Runs on CPU, CUDA, Vulkan.

## Download models

Grab one GGUF of each type from Hugging Face and drop them in the
`models/` folder:

https://huggingface.co/Serveurperso/YuE2-GGUF/tree/main

| Type | Pick one | Size |
|------|----------|------|
| Backbone | YuE2-3B-Q8_0.gguf | 3.81 GB |
| VAE | YuE2-Vae-F32.gguf | 530 MB |
| Transcriber (optional) | SheetSage2-Q8_0.gguf | 958 MB |

Q8_0 is near lossless. The backbone also ships in BF16 / Q6_K / Q5_K_M, the
VAE in F32 only since its weights are the audio. The Q8_0 pair runs in about
4.4 GB plus the KV cache, the native pair in about 7.7 GB. The transcriber
turns a recording into its score for covers; it ships in F32 / Q8_0 / Q6_K /
Q5_K_M and loads only for a transcription.

Alternative: `./models.sh` downloads the default set automatically
(needs `pip install hf`), `./models.sh --all` everything.

## Build

```
git clone --recurse-submodules https://github.com/ServeurpersoCom/yue2.cpp.git
cd yue2.cpp
```

### Windows

To build from source, install
[Visual C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
(select "Desktop development with C++" workload) and optionally the
[CUDA Toolkit](https://developer.nvidia.com/cuda-downloads) and/or the
[Vulkan SDK](https://vulkan.lunarg.com/sdk/home).

```cmd
buildcuda.cmd     # NVIDIA GPU
buildvulkan.cmd   # AMD/Intel GPU (Vulkan)
buildall.cmd      # all backends (CUDA + Vulkan + CPU, runtime loading)
```

### Linux / macOS

```bash
./buildcuda.sh    # NVIDIA GPU
./buildvulkan.sh  # AMD/Intel GPU (Vulkan)
./buildcpu.sh     # CPU only (with BLAS)
./buildall.sh     # all backends (CUDA + Vulkan + CPU, runtime loading)
```

`-DGGML_SOURCE_DIR=<path>` swaps the ggml submodule for another tree (upstream ggml, llama.cpp/ggml).

macOS auto-enables Metal and Accelerate BLAS with any of the above.

## Convert

To build the GGUFs locally from the official checkpoints instead, download
[m-a-p/YuE2-3B](https://huggingface.co/m-a-p/YuE2-3B),
[m-a-p/YuE2-Vae](https://huggingface.co/m-a-p/YuE2-Vae), and for the
transcriber [m-a-p/SheetSage2](https://huggingface.co/m-a-p/SheetSage2) with
its parent [m-a-p/MERT-v2-FullSong](https://huggingface.co/m-a-p/MERT-v2-FullSong)
(both gated, accept their terms and `hf auth login` first) into `checkpoints/`.

```bash
pip install hf gguf numpy
./checkpoints.sh  # downloads both repositories
./convert.py      # native GGUF, byte-exact dtypes from the source, skips existing
./quantize.sh     # every quant from the natives, idempotent
```

| GGUF | Component | Size |
|------|-----------|------|
| YuE2-3B-BF16.gguf | 3.6B Mixture-of-Transformers backbone | 7.17 GB |
| YuE2-Vae-F32.gguf | Oobleck VAE encoder + decoder | 530 MB |
| SheetSage2-F32.gguf | SheetSage2 transcriber on MERT-v2-FullSong, LoRA merged | 2.71 GB |

## Run

```bash
./server.sh       # Linux / macOS
server.cmd        # Windows
```

Open http://localhost:8087 in your browser. The WebUI handles everything:
write style tags and lyrics, generate, read the score the model composed,
play and download tracks. Open an MP3 or WAV to get it on a card, then
Transcribe score or Transcribe melody from the card menu: the score lands
in the score field, pick the matching mode, add your lyrics and a style,
and the model covers the song.

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

VRAM: the cache sized on the 24576 token context is the other big term,
one set per song of a batch; `--max-seq` and `--max-batch` are the
levers that trade context and batch for VRAM. A 65 s song in Q8_0 peaks
at 5.8 GB at the full context and 3.8 GB at `--max-seq 8192`.

## Server options

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

<details>
<summary>API endpoints</summary>

The server exposes one compute endpoint and a job system:

**POST /synth** - Submit a generation job (JSON Yue2Request), returns a job
ID immediately. The single worker thread owns the models and processes
jobs in FIFO order.

**GET /job?id=N** - Poll job status. **GET /job?id=N&result=1** fetches the
result as multipart/mixed, one pair per track: a JSON replay request part
(the request carrying the semantic stream, the score and the seeds of the
track) then the audio part (MP3 or WAV, selected by `output_format` in the
request). `lm_batch_size` songs times `synth_batch_size` noise variations
come out song-major.
**POST /job?id=N&cancel=1** cancels a running job.

**GET /health** - Returns `{"status":"ok"}`.

**GET /props** - Server version, model paths, frame rate, context, and the
default request parameters.

**GET /logs** - SSE stream of server stderr.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full API reference
and Yue2Request JSON specification.

</details>

<details>
<summary>CLI tools (advanced)</summary>

For scripting without the server, `yue-synth` runs the full pipeline from a
request JSON, the same schema the server and the WebUI speak.

```bash
./build/yue-synth \
    --model models/YuE2-3B-Q8_0.gguf \
    --vae models/YuE2-Vae-F32.gguf \
    --request request.json \
    --out song.mp3
```

Feeding back a request that carries `semantic_tokens` skips the
autoregressive stage entirely: the prefix and the codes prefill in one
forward and the song re-renders deterministically, so the flow matching
steps, the seed or the output format can be iterated for a fraction of
the cost.

The `yue-plan` tool runs the first autoregressive stage alone and writes the
ABC score the model intends to play. The score is the white box interface:
read it, edit it, put it back in the request as `abc`.

```bash
./build/yue-plan --model models/YuE2-3B-Q8_0.gguf --request request.json --out score.abc
```

The `yue-transcribe` tool runs the SheetSage2 transcriber on a recording
and writes the score it hears, the one a cover takes as its `abc`. The
full score carries the chord symbols, `--melody-only` keeps the vocal and
instrumental voices alone, which is what `cot` `melody` expects.

```bash
./build/yue-transcribe --model models/SheetSage2-Q8_0.gguf --audio song.mp3 --out score.abc
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full JSON
reference and the `neural-codec` (Oobleck VAE audio codec, encode and
decode, f32 and reduced-bitrate Q8/Q4 latent formats), `mp3-codec` and
`quantize` tools.

</details>

## Technical documentation

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) covers the complete
Yue2Request JSON reference, the Mixture-of-Transformers backbone and the
VAE, the three stage inference recipe, the KV cache the flow matching
half reads, quantization strategy, VRAM, the parity test suite, and
architecture internals.

## Acknowledgements

Independent C++ implementation based on
[YuE2](https://github.com/multimodal-art-projection/YuE) by MAP.
All model weights are theirs, this is just a native backend.
Structural template: [minimaxmusic.cpp](https://github.com/ServeurpersoCom/minimaxmusic.cpp)
and [acestep.cpp](https://github.com/ServeurpersoCom/acestep.cpp).

```bibtex
@article{yuan2025yue,
	title = {{YuE}: Scaling Open Foundation Models for Long-Form Music Generation},
	author = {Yuan, Ruibin and Lin, Hanfeng and Guo, Shuyue and Zhang, Ge and Pan, Jiahao and Zang, Yongyi and Liu, Haohe and Liang, Yiming and Ma, Wenye and Du, Xingjian and Ye, Zhen and Ma, Yinghao and Xue, Wei and Tan, Xu and Guo, Yike},
	journal = {arXiv preprint arXiv:2503.08638},
	year = {2025},
	eprint = {2503.08638},
	archivePrefix = {arXiv},
	url = {https://arxiv.org/abs/2503.08638}
}
```
