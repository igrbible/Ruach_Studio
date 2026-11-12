#include "engine/framework/tokenizers/sentencepiece.h"

#include <filesystem>
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

std::filesystem::path test_asset_path(const std::string & relative) {
    return std::filesystem::path(ENGINE_TEST_ASSET_ROOT) / relative;
}

void require(bool condition, const std::string & message) {
    if (!condition) {
        throw std::runtime_error(message);
    }
}

std::string join_ids(const std::vector<int32_t> & ids) {
    std::ostringstream oss;
    for (size_t i = 0; i < ids.size(); ++i) {
        if (i > 0) {
            oss << ",";
        }
        oss << ids[i];
    }
    return oss.str();
}

std::string join_piece_window(
    const std::vector<engine::tokenizers::SentencePiecePiece> & pieces,
    const std::vector<int32_t> & ids) {
    std::ostringstream oss;
    for (size_t i = 0; i < ids.size(); ++i) {
        if (i > 0) {
            oss << " | ";
        }
        const auto id = ids[i];
        if (id < 0 || static_cast<size_t>(id) >= pieces.size()) {
            oss << id << ":<out-of-range>";
            continue;
        }
        oss << id << ":" << pieces[static_cast<size_t>(id)].text;
    }
    return oss.str();
}

void require_ids(
    const std::vector<engine::tokenizers::SentencePiecePiece> & pieces,
    const std::vector<int32_t> & actual,
    const std::vector<int32_t> & expected,
    const std::string & label) {
    if (actual == expected) {
        return;
    }
    throw std::runtime_error(
        label + " token ids mismatch: expected [" + join_ids(expected) +
        "], got [" + join_ids(actual) + "] pieces=[" + join_piece_window(pieces, actual) + "]");
}

void test_load_real_model_metadata() {
    const auto model_path = test_asset_path("tokenizers/tokenizer-1.model");
    const auto pieces = engine::tokenizers::load_sentencepiece_model(model_path);

    require(pieces.size() == 4000, "expected 4000 sentencepiece pieces in tokenizer-1.model");

    require(pieces[0].id == 0, "expected <unk> id 0");
    require(pieces[0].text == "<unk>", "expected piece 0 to be <unk>");
    require(
        pieces[0].type == engine::tokenizers::SentencePieceType::Unknown,
        "expected piece 0 to be Unknown");

    require(pieces[1].text == "<s>", "expected piece 1 to be <s>");
    require(
        pieces[1].type == engine::tokenizers::SentencePieceType::Control,
        "expected piece 1 to be Control");
    require(pieces[2].text == "</s>", "expected piece 2 to be </s>");
    require(
        pieces[2].type == engine::tokenizers::SentencePieceType::Control,
        "expected piece 2 to be Control");
    require(pieces[3].text == "<pad>", "expected piece 3 to be <pad>");
    require(
        pieces[3].type == engine::tokenizers::SentencePieceType::Control,
        "expected piece 3 to be Control");

    const struct ByteExpectation {
        int id;
        const char * text;
    } checks[] = {
        {4, "<0x00>"},
        {13, "<0x09>"},
        {36, "<0x20>"},
        {126, "<0x7A>"},
        {259, "<0xFF>"},
    };
    for (const auto & check : checks) {
        require(
            pieces[static_cast<size_t>(check.id)].type == engine::tokenizers::SentencePieceType::Byte,
            "expected byte piece type at id " + std::to_string(check.id));
        require(
            pieces[static_cast<size_t>(check.id)].text == check.text,
            "unexpected byte piece text at id " + std::to_string(check.id));
    }

    require(
        pieces[260].text == std::string(u8"\u2581"),
        "expected id 260 to be the escaped whitespace marker");
}

void test_real_model_whitespace_and_punctuation_segmentation() {
    const auto model_path = test_asset_path("tokenizers/tokenizer-1.model");
    const auto pieces = engine::tokenizers::load_sentencepiece_model(model_path);

    require_ids(
        pieces,
        engine::tokenizers::tokenize_sentencepiece(pieces, "Hello, world!"),
        {2994, 262, 578, 682},
        "Hello, world!");

    require_ids(
        pieces,
        engine::tokenizers::tokenize_sentencepiece(pieces, "a  b"),
        {267, 260, 557},
        "double internal space must be preserved");

    require_ids(
        pieces,
        engine::tokenizers::tokenize_sentencepiece(pieces, " leading"),
        {260, 893, 273},
        "leading space must survive alongside the dummy prefix");

    require_ids(
        pieces,
        engine::tokenizers::tokenize_sentencepiece(pieces, "trailing "),
        {3007, 273, 260},
        "trailing space must survive tokenization");

    require_ids(
        pieces,
        engine::tokenizers::tokenize_sentencepiece(pieces, "C++"),
        {444, 47, 47},
        "ASCII punctuation should tokenize exactly");
}

void test_real_model_known_non_ascii_pieces() {
    const auto model_path = test_asset_path("tokenizers/tokenizer-1.model");
    const auto pieces = engine::tokenizers::load_sentencepiece_model(model_path);

    require_ids(
        pieces,
        engine::tokenizers::tokenize_sentencepiece(pieces, u8"caf\u00E9"),
        {331, 2250, 745},
        "cafe acute should use the model's dedicated non-ASCII piece");

    require_ids(
        pieces,
        engine::tokenizers::tokenize_sentencepiece(pieces, u8"\u00FCber"),
        {260, 3252, 1193},
        "uber with umlaut should not fall back to raw UTF-8 bytes");

    require_ids(
        pieces,
        engine::tokenizers::tokenize_sentencepiece(pieces, u8"ma\u00F1ana"),
        {633, 3884, 1973},
        "manana with enye should use learned pieces");
}

void test_real_model_byte_fallback_for_unseen_unicode() {
    const auto model_path = test_asset_path("tokenizers/tokenizer-1.model");
    const auto pieces = engine::tokenizers::load_sentencepiece_model(model_path);

    require_ids(
        pieces,
        engine::tokenizers::tokenize_sentencepiece(pieces, "\t"),
        {260, 13},
        "tab should use the dedicated byte token rather than <unk>");

    require_ids(
        pieces,
        engine::tokenizers::tokenize_sentencepiece(pieces, "\n"),
        {260, 14},
        "newline should use the dedicated byte token rather than <unk>");

    require_ids(
        pieces,
        engine::tokenizers::tokenize_sentencepiece(pieces, u8"\U0001F642"),
        {260, 244, 163, 157, 134},
        "emoji should expand to its UTF-8 byte pieces");

    require_ids(
        pieces,
        engine::tokenizers::tokenize_sentencepiece(pieces, u8"hi\U0001F642there"),
        {1003, 244, 163, 157, 134, 1855, 280},
        "emoji should byte-fallback without corrupting surrounding learned pieces");

    require_ids(
        pieces,
        engine::tokenizers::tokenize_sentencepiece(pieces, u8"\u4E2D\u6587"),
        {260, 232, 188, 177, 234, 154, 139},
        "unseen CJK characters should byte-fallback deterministically");
}

void test_object_tokenizer_matches_free_function_on_real_model() {
    const auto model_path = test_asset_path("tokenizers/tokenizer-1.model");
    const auto pieces = engine::tokenizers::load_sentencepiece_model(model_path);
    const auto expected = engine::tokenizers::tokenize_sentencepiece(pieces, u8"x\U0001F642 y");

    const std::shared_ptr<engine::tokenizers::SentencePieceTokenizer> tokenizer =
        engine::tokenizers::load_sentencepiece_tokenizer(model_path);

    require(tokenizer != nullptr, "expected tokenizer loader to return an instance");
    require(tokenizer->family() == "sentencepiece", "expected sentencepiece family");

    const auto result = tokenizer->tokenize(u8"x\U0001F642 y");
    require(result.text == u8"x\U0001F642 y", "expected tokenizer object to preserve the source text");
    require_ids(
        pieces,
        result.token_ids,
        expected,
        "tokenizer object should match free-function tokenization");
}

}  // namespace

int main() {
    try {
        test_load_real_model_metadata();
        test_real_model_whitespace_and_punctuation_segmentation();
        test_real_model_known_non_ascii_pieces();
        test_real_model_byte_fallback_for_unseen_unicode();
        test_object_tokenizer_matches_free_function_on_real_model();
        std::cout << "sentencepiece_real_model_test: ok\n";
        return 0;
    } catch (const std::exception & ex) {
        std::cerr << "sentencepiece_real_model_test: failed: " << ex.what() << "\n";
        return 1;
    }
}
