# Adapters

Place your LoRA adapters here: a `.safetensors` file, or a folder holding
one next to its `adapter_config.json`. The server lists them at startup with
the halves of the backbone each one changes, AR (the score and the codes),
NAR (the acoustics) or both, and the WebUI stacks any number of them, each
with its own strength.

| Trainer              | Layout                                 | Alpha source                        |
|----------------------|----------------------------------------|-------------------------------------|
| AI Toolkit, ComfyUI  | single `.safetensors`                  | per module `.alpha`, else the rank  |
| Native YuE2 trainers | single `.safetensors`                  | `__metadata__` alpha, else the rank |
| Folder trainers      | `.safetensors` + `adapter_config.json` | `lora_alpha` or `alpha`             |
| Sliders              | single `.safetensors`                  | per module `.alpha`                 |

ComfyUI and AI Toolkit files carry `text_encoders.*` for the AR half and
`diffusion_model.*` for the NAR half, with fused `qkv_proj` and
`gate_up_proj`. Native files name the projections `layers.N.self_attn.*`,
`layers.N.nar_self_attn.*` and their MLPs, and may replace or adapt
`vae2llm` and `llm2vae`. A file holding anything else (LoKr, DoRA, an extra
conditioning branch) is skipped with the name of the tensor at fault.

Point the server at this folder:

```bash
./build/yue-server --model models/YuE2-3B-Q8_0.gguf --vae models/YuE2-Vae-F32.gguf --adapters ./adapters
```
