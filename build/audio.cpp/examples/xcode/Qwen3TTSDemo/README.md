# Qwen3 TTS Xcode Demo

This is a small macOS Xcode command-line demo that links `AudioCpp.xcframework` and runs Qwen3 TTS voice clone or voice design from Swift through a narrow Objective-C++ bridge.

Build the framework first:

```sh
scripts/build_xcframework.sh --clean
```

Build the demo:

```sh
xcodebuild \
  -project examples/xcode/Qwen3TTSDemo/Qwen3TTSDemo.xcodeproj \
  -scheme Qwen3TTSDemo \
  -configuration Release \
  -derivedDataPath examples/xcode/Qwen3TTSDemo/build \
  build
```

Run voice clone:

```sh
examples/xcode/Qwen3TTSDemo/build/Build/Products/Release/Qwen3TTSDemo voice-clone \
  --model models/Qwen3-TTS-12Hz-1.7B-Base \
  --voice-ref resources/a.wav \
  --reference-text "This little work was finished in the year eighteen o three, and intended for immediate publication." \
  --text "The lighthouse keeper records a detailed morning report about the tide, the lantern, and the ships crossing the horizon." \
  --out /tmp/qwen3_clone.wav
```

Run voice design:

```sh
examples/xcode/Qwen3TTSDemo/build/Build/Products/Release/Qwen3TTSDemo voice-design \
  --model models/Qwen3-TTS-12Hz-1.7B-VoiceDesign \
  --instruct "A cheerful young woman with a bright studio voice." \
  --text "This designed voice should sound cheerful and clear while keeping every word easy to recognize." \
  --out /tmp/qwen3_design.wav
```

Both commands default to `--backend metal --device 0 --threads 8 --language English --seed 1234 --do-sample false`.
