# RNNoise Framework Utility Assets

Source archive:
https://media.xiph.org/rnnoise/models/rnnoise_data-0a8755f8e2d834eff6a54714ecc7d75f9932e845df35f8b59bc52a7cfe6e8b37.tar.gz

License: BSD-3-Clause

Converted assets:

- `rnnoise10Ga_12.safetensors`
- `rnnoise10Gb_15.safetensors`

The safetensors files contain the official PyTorch `state_dict` tensors used by
the RNNoise waveform denoiser. The framework utility implements the official
48 kHz / 480-sample streaming DSP path around these weights, including feature
extraction, pitch filtering, gain interpolation, and overlap-add synthesis.
They are framework utility assets and live under `resources/framework`, not
under `models`.
