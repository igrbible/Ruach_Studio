import Foundation

enum DemoError: Error, CustomStringConvertible {
    case usage(String)

    var description: String {
        switch self {
        case .usage(let message):
            return message
        }
    }
}

struct Arguments {
    let command: String
    let values: [String: String]

    init(_ raw: [String]) throws {
        guard raw.count >= 2 else {
            throw DemoError.usage(Arguments.usage)
        }
        command = raw[1]
        var parsed: [String: String] = [:]
        var index = 2
        while index < raw.count {
            let key = raw[index]
            guard key.hasPrefix("--") else {
                throw DemoError.usage("Unexpected argument: \(key)\n\n\(Arguments.usage)")
            }
            guard index + 1 < raw.count else {
                throw DemoError.usage("Missing value for \(key)\n\n\(Arguments.usage)")
            }
            parsed[String(key.dropFirst(2))] = raw[index + 1]
            index += 2
        }
        values = parsed
    }

    func required(_ key: String) throws -> String {
        guard let value = values[key], !value.isEmpty else {
            throw DemoError.usage("Missing --\(key)\n\n\(Arguments.usage)")
        }
        return value
    }

    func string(_ key: String, default defaultValue: String) -> String {
        values[key] ?? defaultValue
    }

    func int(_ key: String, default defaultValue: Int) -> Int {
        guard let value = values[key] else {
            return defaultValue
        }
        return Int(value) ?? defaultValue
    }

    static let usage = """
    Usage:
      Qwen3TTSDemo voice-clone --model <dir> --voice-ref <wav> --reference-text <text> --text <text> --out <wav> [options]
      Qwen3TTSDemo voice-design --model <dir> --instruct <text> --text <text> --out <wav> [options]

    Options:
      --language <name>        Default: English
      --backend <name>         Default: metal
      --device <index>         Default: 0
      --threads <count>        Default: 8
      --seed <value>           Default: 1234
      --max-new-tokens <n>     Default: 256 for voice-clone, 192 for voice-design
    """
}

func run() throws {
    if CommandLine.arguments.count == 2,
       ["--help", "-h", "help"].contains(CommandLine.arguments[1]) {
        print(Arguments.usage)
        return
    }

    let arguments = try Arguments(CommandLine.arguments)
    let model = try arguments.required("model")
    let text = try arguments.required("text")
    let output = try arguments.required("out")
    let language = arguments.string("language", default: "English")
    let backend = arguments.string("backend", default: "metal")
    let device = Int32(arguments.int("device", default: 0))
    let threads = Int32(arguments.int("threads", default: 8))
    let seed = UInt32(arguments.int("seed", default: 1234))

    switch arguments.command {
    case "voice-clone":
        let voiceRef = try arguments.required("voice-ref")
        let referenceText = try arguments.required("reference-text")
        let maxNewTokens = Int64(arguments.int("max-new-tokens", default: 256))
        let runner = try MiniTTSDemoBridge(
            modelPath: model,
            task: "tts",
            backend: backend,
            device: device,
            threads: threads
        )
        try runner.runVoiceClone(
            withText: text,
            language: language,
            voiceRefPath: voiceRef,
            referenceText: referenceText,
            outputPath: output,
            seed: seed,
            maxNewTokens: maxNewTokens
        )
    case "voice-design":
        let instruct = try arguments.required("instruct")
        let maxNewTokens = Int64(arguments.int("max-new-tokens", default: 192))
        let runner = try MiniTTSDemoBridge(
            modelPath: model,
            task: "voice_design",
            backend: backend,
            device: device,
            threads: threads
        )
        try runner.runVoiceDesign(
            withText: text,
            language: language,
            instruct: instruct,
            outputPath: output,
            seed: seed,
            maxNewTokens: maxNewTokens
        )
    case "--help", "-h", "help":
        print(Arguments.usage)
        return
    default:
        throw DemoError.usage("Unknown command: \(arguments.command)\n\n\(Arguments.usage)")
    }

    print("audio_out=\(output)")
}

do {
    try run()
} catch {
    fputs("Qwen3TTSDemo failed: \(error)\n", stderr)
    exit(1)
}
