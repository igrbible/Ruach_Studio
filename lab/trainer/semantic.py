"""Ruach Studio's own trainer (HERESY 1086): audio -> YuE2 codec tokens, for the latent cache.

The official YuE2 audio encoder is unreleased; training conditions on the community head
(Mothersuperior's realaudio tokenizer v4): MERT-v2-FullSong layer-20 features at 25 Hz, normalised per
track, through an 8-layer transformer classifier over 512-frame windows. Ported from Ostris' AI-Toolkit
(MIT; LICENSE-AITK beside this file): extensions_built_in/audio_models/yue2/src/tokenizer.py,
SemanticTokenizer, TokenizerHead, _rebuild_rotary, load_head_state_dict — unchanged in what they compute;
MERT is read from the studio's own checkpoints/MERT-v2-FullSong."""
import torch
import torch.nn.functional as F
from torch import nn

CODEC_SIZE = 32768
MERT_SAMPLE_RATE = 24000
MERT_LAYER = 20
HEAD_WINDOW = 512


class TokenizerHead(nn.Module):
    def __init__(self, din=1024, d=512, layers=8, heads=8, vocab=CODEC_SIZE, window=HEAD_WINDOW):
        super().__init__()
        self.inp = nn.Linear(din, d)
        self.pos = nn.Parameter(torch.zeros(1, window, d))
        layer = nn.TransformerEncoderLayer(d, heads, 4 * d, dropout=0.1, batch_first=True, norm_first=True, activation="gelu")
        self.enc = nn.TransformerEncoder(layer, layers)
        self.norm = nn.LayerNorm(d)
        self.head = nn.Linear(d, vocab)

    def forward(self, x):
        return self.head(self.norm(self.enc(self.inp(x) + self.pos[:, : x.shape[1]])))


def _rebuild_rotary(model: nn.Module) -> int:
    """MERT2 keeps its rotary inv_freq as a non-persistent buffer that meta-device loading leaves
    uninitialised: recompute it from the module's own formula and drop the cos/sin cache."""
    n = 0
    for m in model.modules():
        if hasattr(m, "inv_freq") and hasattr(m, "head_dim") and hasattr(m, "base"):
            m.inv_freq = (1.0 / (m.base ** (torch.arange(0, m.head_dim, 2, dtype=torch.float32) / m.head_dim))).to(device=m.inv_freq.device)
            for attr, val in (("_cos", None), ("_sin", None), ("_sequence_length", 0), ("_cache_device", None)):
                if hasattr(m, attr):
                    setattr(m, attr, val)
            n += 1
    return n


def load_head_state_dict(head_path: str) -> dict:
    if str(head_path).endswith(".safetensors"):
        from safetensors.torch import load_file
        return load_file(head_path, device="cpu")
    return torch.load(head_path, map_location="cpu", weights_only=False)["model"]


class SemanticTokenizer(nn.Module):
    """Waveform -> per-frame codec ids (0..32767) at 25 Hz."""

    def __init__(self, head_path: str, mert_path: str):
        super().__init__()
        from transformers import AutoFeatureExtractor, AutoModel
        self.processor = AutoFeatureExtractor.from_pretrained(mert_path, trust_remote_code=True)
        self.mert = AutoModel.from_pretrained(mert_path, trust_remote_code=True).eval()
        self.mert.requires_grad_(False)
        _rebuild_rotary(self.mert)
        self.head = TokenizerHead()
        self.head.load_state_dict(load_head_state_dict(head_path))
        self.head.eval().requires_grad_(False)

    @property
    def device(self):
        return self.head.head.weight.device

    @torch.no_grad()
    def mert_features(self, mono24: torch.Tensor) -> torch.Tensor:
        """mono24 [samples] at 24 kHz -> [T25, 1024] float32 layer-20 features."""
        device = self.device
        chunk = MERT_SAMPLE_RATE * 30
        chunks = [mono24[s: s + chunk] for s in range(0, mono24.shape[0], chunk)]
        chunks = [c for c in chunks if c.shape[0] >= MERT_SAMPLE_RATE]
        full = [c for c in chunks if c.shape[0] == chunk]
        tail = [c for c in chunks if c.shape[0] < chunk]
        feats = []
        with torch.autocast(device_type=device.type, dtype=torch.bfloat16, enabled=device.type == "cuda"):
            for group in ([full] if full else []) + [[c] for c in tail]:
                inp = self.processor([c.cpu().numpy() for c in group], sampling_rate=MERT_SAMPLE_RATE, return_tensors="pt")
                inp = {k: v.to(device) for k, v in inp.items()}
                out = self.mert(**inp, output_hidden_states=True)
                feats.append(out.hidden_states[MERT_LAYER].reshape(-1, 1024))
        h = torch.cat(feats, 0).float()
        t25 = int(round(mono24.shape[0] / MERT_SAMPLE_RATE * 25))
        return F.interpolate(h.T[None], size=t25, mode="linear", align_corners=False)[0].T

    @torch.no_grad()
    def tokens_from_features(self, feats: torch.Tensor) -> torch.Tensor:
        """[T, 1024] -> [T] long: windowed inference, the window's edges trimmed."""
        x = feats.float()
        x = (x - x.mean(0)) / (x.std(0) + 1e-5)
        total, win = x.shape[0], HEAD_WINDOW
        out = torch.zeros(total, dtype=torch.long, device=x.device)
        starts = list(range(0, max(1, total - win + 1), win // 2))
        if starts[-1] + win < total:
            starts.append(max(0, total - win))
        device = self.device
        for s0 in starts:
            xw = x[s0: s0 + win]
            n = xw.shape[0]
            if n < win:
                xw = F.pad(xw, (0, 0, 0, win - n))
            with torch.autocast(device_type=device.type, dtype=torch.bfloat16, enabled=device.type == "cuda"):
                pred = self.head(xw[None].to(device))[0, :n].float().argmax(-1)
            lo = s0 + (0 if s0 == 0 else win // 4)
            hi = s0 + n - (0 if s0 + n >= total else win // 4)
            out[lo:hi] = pred[lo - s0: hi - s0].to(out.device)
        return out

    @torch.no_grad()
    def tokenize(self, waveform: torch.Tensor, sample_rate: int) -> torch.Tensor:
        """waveform [C, samples] -> codec ids [T] (no vocab offset)."""
        import torchaudio
        mono = waveform.float().mean(0) if waveform.dim() == 2 else waveform.float()
        if sample_rate != MERT_SAMPLE_RATE:
            mono = torchaudio.functional.resample(mono, sample_rate, MERT_SAMPLE_RATE)
        return self.tokens_from_features(self.mert_features(mono.to(self.device)))
