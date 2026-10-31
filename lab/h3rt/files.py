"""HERESY 1870: the files of models/minimax-h3 the runtime reads, without torch: the lab asks it whether shots can be made here."""
from pathlib import Path

FILES = {
    "fl2va_pruned": "diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors",
    "fl2va": "diffusion_models/minimax_h3_fl2va_int8_convrot.safetensors",
    "fasth3": "diffusion_models/fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors",
    "text_encoder": "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
    "video_vae": "vae/minimax_h3_video_vae_fp16.safetensors",
    "audio_vae": "vae/minimax_h3_audio_vae_fp32.safetensors",
}
ORIGINAL = "original/FL2VA"          # the original repo's tokenizer, processor and encoder config (fetch-heresy.sh --h3)


def needed(root, fast=False, partition="fl2va_pruned"):
    """The files a load reads."""
    root = Path(root)
    return [root / FILES["fasth3" if fast else partition], root / FILES["text_encoder"], root / FILES["video_vae"], root / FILES["audio_vae"],
            root / ORIGINAL / "text_encoder/config.json", root / ORIGINAL / "tokenizer/tokenizer.json", root / ORIGINAL / "processor/preprocessor_config.json"]
