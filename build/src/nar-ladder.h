// nar-ladder.h: the decode ladder's pieces (HERESY 1768), in a header of its own since HERESY 2851 so a test reads it without a model
// (tests/test-nar-ladder.cpp). Pure C++, no ggml.
#pragma once

// HERESY 1768: the decode ladder: pieces of about 20 s (25 frames a second), each hearing 2 s past its edges
static const int YUE2_LADDER_PIECE  = 500;
static const int YUE2_LADDER_MARGIN = 50;

// HERESY 2851: the ladder's piece for a song of T_lat frames in a window of the sound half: even pieces no longer than YUE2_LADDER_PIECE
// and no longer than the window less both margins, so an inner piece's window (the piece and YUE2_LADDER_MARGIN either side) never passes
// the window. Before, a window under about 600 frames (a prompt past about 7,000 rows on an 8,192-row card) kept its own size as the piece
// and the margins went past it by 50 frames a side. 0: no ladder (one piece is enough, or the window cannot hold one frame and both
// margins), and the song is solved as it would be without it.
static int yue2_ladder_piece(int T_lat, int window) {
    int cap = window - 2 * YUE2_LADDER_MARGIN;
    if (cap > YUE2_LADDER_PIECE) {
        cap = YUE2_LADDER_PIECE;
    }
    if (T_lat < 1 || cap < 1) {
        return 0;
    }
    const int n = (T_lat + cap - 1) / cap;
    return n > 1 ? (T_lat + n - 1) / n : 0;
}
