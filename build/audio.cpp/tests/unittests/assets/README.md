# Test Assets

Everything under this directory is checked into the repo so unit tests can run
without downloaded models or user-local paths.

Current fixtures:

- `registry/silero_vad_registry.txt`
  - config-driven loader enablement for the Silero VAD trace parity test
- `tokenizers/tokenizer-1.model`
  - real SentencePiece model used by the framework tokenizer unit test
