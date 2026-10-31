"""HERESY 1870: the three small helpers AI-Toolkit's code leaned on (toolkit/basic.py's flush, toolkit/print.py's print_acc, diffusers'
randn_tensor), so the runtime needs neither AI-Toolkit nor a diffusers import for them."""
import gc

import torch


def flush(garbage_collect=True):
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    if garbage_collect:
        gc.collect()


def print_acc(*args, **kwargs):
    print(*args, **kwargs)


def randn_tensor(shape, generator=None, device=None, dtype=None):
    """diffusers.utils.torch_utils.randn_tensor for one generator: drawn where the generator lives (a CPU generator draws on the CPU, the
    same numbers on every machine), then moved."""
    device = torch.device(device) if device is not None else torch.device("cpu")
    rand_device = generator.device if generator is not None else device
    if generator is not None and generator.device.type != device.type and generator.device.type != "cpu":
        raise ValueError(f"cannot draw on {device} with a {generator.device.type} generator")
    return torch.randn(shape, generator=generator, device=rand_device, dtype=dtype).to(device)
