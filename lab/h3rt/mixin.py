"""HERESY 1870: the loading mixin MiniMax H3's modules stand on, cut down from AI-Toolkit's toolkit/models/v2/_mixin.py (MIT, Ostris, LLC;
LICENSE.ai-toolkit beside this file) to what the studio runs: a single local .safetensors file, its ComfyUI pre-quantized layers attached to
the quantization backends (h3rt.quant: int8 ConvRot, nvfp4) and kept as shipped, the rest at its stored precision, and layer offloading
(h3rt.memory_management) streaming the blocks from RAM. No Hub, no component pool, no fresh quantization, no adapters: what the studio
fetched (heresy/fetch-heresy.sh --h3) is what it runs."""
import os
from typing import Dict, List, Optional

import torch
from safetensors.torch import load_file

from h3rt.util import flush


def _markers_from_header(file_path: str, state_dict: Dict[str, torch.Tensor]) -> Dict[str, torch.Tensor]:
    """ComfyUI's header-style quantized layout keeps the per-layer configs in the safetensors metadata (``_quantization_metadata``) instead of
    ``<layer>.comfy_quant`` marker tensors; synthesize the markers so the importer sees one layout."""
    import json

    from safetensors import safe_open

    with safe_open(file_path, "pt") as f:
        raw = (f.metadata() or {}).get("_quantization_metadata")
    if raw is None:
        return state_dict
    for name, conf in json.loads(raw).get("layers", {}).items():
        marker = f"{name}.comfy_quant"
        if marker not in state_dict and f"{name}.weight" in state_dict:
            state_dict[marker] = torch.tensor(list(json.dumps(conf).encode("utf-8")), dtype=torch.uint8)
    return state_dict


class OstrisModelMixin:
    # single-file loads without quant markers cast tensors to the requested dtype; classes whose checkpoints carry a deliberate precision
    # mix set this False to load at stored precision instead
    aitk_cast_on_load: bool = True
    # pre-quantized checkpoints load their NON-quantized tensors at stored precision unless a class sets this True
    aitk_cast_quantized_load: bool = False

    aitk_is_quantized: bool = False
    aitk_qtype: Optional[str] = None

    @classmethod
    def convert_state_dict_on_load(cls, state_dict: Dict[str, torch.Tensor]):
        return state_dict

    @classmethod
    def get_transformer_block_names(cls) -> Optional[List[str]]:
        return None

    @classmethod
    def get_quantization_exclude_modules(cls) -> Optional[List[str]]:
        return None

    def get_offload_ignore_modules(self) -> Optional[List]:
        """Module/parameter objects layer offloading must keep resident (pad tokens, modulation tables, ...). Default: none."""
        return None

    @classmethod
    def aitk_from_config(cls, config):
        # params on meta (materialized by the state-dict assign), buffers real: non-persistent buffers (e.g. rope tables) are computed at
        # init and never appear in checkpoints
        from accelerate import init_empty_weights

        with init_empty_weights(include_buffers=False):
            if hasattr(cls, "from_config"):
                return cls.from_config(config)
            return cls(config)

    @classmethod
    def aitk_config_from_state_dict(cls, state_dict: Dict[str, torch.Tensor]):
        """Derive the model config from the checkpoint itself. None: the class has no way to (the studio passes no config source)."""
        return None

    def aitk_post_load(self, qtype: Optional[str] = None, offload: float = 0.0, dtype: torch.dtype = torch.bfloat16,
                       device: Optional[torch.device] = None, quantize_device: Optional[torch.device] = None, status_fn=print, **_):
        """Keep the shipped quantization (it must be the one asked for), attach layer offloading, place on the device."""
        if qtype is not None:
            from h3rt.quant.ostris_quant import OstrisLinear

            shipped = sorted({getattr(m.ostris_quantizer, "qtype", None) for m in self.modules() if isinstance(m, OstrisLinear)} - {None})
            # a checkpoint may deliberately mix backends (minimax's TE: nvfp4 LM linears + int8 embeddings): the request matches when the
            # requested backend is among the shipped ones
            if not getattr(self, "aitk_is_quantized", False) or qtype not in shipped:
                raise ValueError(f"{type(self).__name__}: the file is not pre-quantized as {qtype} (it has {'/'.join(shipped) or 'none'}); "
                                 "the studio runs the files fetch-heresy.sh --h3 brings")
            status_fn(f"Checkpoint is pre-quantized ({'/'.join(shipped)}); keeping it")
            self.aitk_qtype = qtype
        if offload and offload > 0:
            from h3rt.memory_management import MemoryManager

            # the manager stages layers to the COMPUTE device; quantize_device carries the actual gpu
            compute_device = quantize_device if quantize_device is not None else device
            MemoryManager.attach(self, torch.device(compute_device), offload_percent=offload,
                                 ignore_modules=list(self.get_offload_ignore_modules() or []))
        elif device is not None:
            self.to(device)
        return self

    @classmethod
    def load_model(cls, name_or_path: str, dtype: torch.dtype = torch.bfloat16, device: Optional[torch.device] = None, config=None, **kwargs):
        """A local single .safetensors file in the model's original (ComfyUI) key layout."""
        if not (name_or_path.endswith(".safetensors") and os.path.isfile(name_or_path)):
            raise FileNotFoundError(f"{name_or_path}: not a local .safetensors file")
        model = cls._load_single_file(name_or_path, dtype=dtype, config=config, **kwargs)
        if device is not None:
            model.to(device)
        return model

    @staticmethod
    def _readahead(file_path: str):
        """Queue kernel readahead for the whole file: safetensors tensors are mmap-backed, and without this a cold cache faults pages in
        per-tensor at a fraction of the drive's sequential bandwidth."""
        if not hasattr(os, "posix_fadvise"):
            return
        try:
            fd = os.open(file_path, os.O_RDONLY)
            try:
                os.posix_fadvise(fd, 0, 0, os.POSIX_FADV_WILLNEED)
            finally:
                os.close(fd)
        except OSError:
            pass

    @classmethod
    def _load_single_file(cls, file_path: str, dtype: torch.dtype, config=None, **kwargs):
        cls._readahead(file_path)
        state_dict = _markers_from_header(file_path, load_file(file_path))
        return cls.load_from_state_dict(state_dict, dtype, config=config, **kwargs)

    @classmethod
    def load_from_state_dict(cls, state_dict: Dict[str, torch.Tensor], dtype: torch.dtype, config=None, **kwargs):
        # comfy repacks can carry ``<attn>.comfy_attention.config`` uint8 JSON blobs: ComfyUI runtime attention hints, not weights
        state_dict = {k: v for k, v in state_dict.items() if not k.endswith(".comfy_attention.config")}
        state_dict = cls.convert_state_dict_on_load(state_dict)
        has_quant_markers = "scaled_fp8" in state_dict or any(k.endswith(".comfy_quant") for k in state_dict)
        if config is None:
            config = cls.aitk_config_from_state_dict(state_dict)
        if config is None:
            raise ValueError(f"{cls.__name__} cannot tell its config from the file")
        model = cls.aitk_from_config(config)

        if has_quant_markers:
            # pre-quantized comfy checkpoint: attach the quantized linears onto the backends, load the rest at its stored precision
            from h3rt.quant.comfy_quant_import import import_comfy_quantized_layers

            state_dict, num_quantized = import_comfy_quantized_layers(model, state_dict, orig_dtype=dtype)
            if cls.aitk_cast_quantized_load:
                for key, value in state_dict.items():
                    if value.is_floating_point():
                        state_dict[key] = value.to(dtype=dtype)
            cls._load_state_dict_with_quantized(model, state_dict)
            if cls.aitk_cast_quantized_load:
                from h3rt.quant.ostris_quant import OstrisLinear

                for m in model.modules():
                    if isinstance(m, OstrisLinear) and m.bias is not None:
                        m.bias.data = m.bias.data.to(dtype=dtype)
            model.aitk_is_quantized = True
        elif cls.aitk_cast_on_load:
            for key, value in state_dict.items():
                if value.is_floating_point():
                    state_dict[key] = value.to(dtype=dtype)
            model.load_state_dict(state_dict, assign=True)
            model.to(dtype=dtype)
        else:
            model.load_state_dict(state_dict, assign=True)
        del state_dict
        flush()
        return model

    @staticmethod
    def _load_state_dict_with_quantized(model, state_dict):
        """Load a state dict onto a (meta-built) model whose quantized linears were already attached by import_comfy_quantized_layers: their
        weight (and importer-assigned bias) legitimately report as missing keys."""
        from h3rt.quant.ostris_quant import OstrisLinear

        preloaded = {n for n, p in model.named_parameters() if not p.is_meta}
        result = model.load_state_dict(state_dict, assign=True, strict=False)
        quantized_param_keys = set()
        for name, m in model.named_modules():
            if isinstance(m, OstrisLinear):
                quantized_param_keys.add(f"{name}.weight")
                if m.bias is not None:
                    quantized_param_keys.add(f"{name}.bias")
        bad_missing = [k for k in result.missing_keys if k not in quantized_param_keys and k not in preloaded]
        if bad_missing or result.unexpected_keys:
            raise ValueError(f"{type(model).__name__} load mismatch: missing {bad_missing[:8]}, unexpected {result.unexpected_keys[:8]}")
        leftover_meta = [n for n, p in model.named_parameters() if p.is_meta]
        if leftover_meta:
            raise ValueError(f"{type(model).__name__} load left meta parameters: {leftover_meta[:8]}")


class OstrisTransformersMixin(OstrisModelMixin):
    """The mixin for transformers-lib modules (the Qwen3-VL text encoder)."""

    @classmethod
    def aitk_from_config(cls, config):
        from accelerate import init_empty_weights

        with init_empty_weights(include_buffers=False):
            return cls(config)
