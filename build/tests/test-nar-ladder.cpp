// test-nar-ladder.cpp: the decode ladder's pieces (HERESY 1768) never past the window of the sound half (HERESY 2851), pure CPU, no model.
//
// For every window from 1 to 3000 frames and every song from 1 to 12000 frames: a piece the ladder gives is at most YUE2_LADDER_PIECE,
// its window (the piece and YUE2_LADDER_MARGIN either side) fits the window, the pieces cover the song, and they are even (the last one
// at most one frame per piece shorter). A song that fits one piece, or a window too small for one frame and both margins, gets no ladder.
//
// usage: test-nar-ladder   (exit 0 when every case holds)

#include "nar-ladder.h"

#include <cstdio>

static int g_failed = 0;

static void check(bool ok, const char * name, int T_lat, int window, int piece) {
    if (!ok) {
        if (g_failed < 20) {
            printf("[FAIL] %s: T_lat=%d window=%d piece=%d\n", name, T_lat, window, piece);
        }
        g_failed++;
    }
}

int main() {
    long cases = 0;
    for (int window = 1; window <= 3000; window++) {
        for (int T_lat = 1; T_lat <= 12000; T_lat++) {
            const int piece = yue2_ladder_piece(T_lat, window);
            cases++;
            const int cap = window - 2 * YUE2_LADDER_MARGIN < YUE2_LADDER_PIECE ? window - 2 * YUE2_LADDER_MARGIN : YUE2_LADDER_PIECE;
            if (piece == 0) {
                check(cap < 1 || T_lat <= cap, "no ladder only when one piece is enough or none fits", T_lat, window, piece);
                continue;
            }
            const int n = (T_lat + piece - 1) / piece;
            check(piece <= YUE2_LADDER_PIECE, "piece at most YUE2_LADDER_PIECE", T_lat, window, piece);
            check(piece + 2 * YUE2_LADDER_MARGIN <= window, "an inner piece's window fits the window", T_lat, window, piece);
            check(n > 1, "a ladder has more than one piece", T_lat, window, piece);
            check((long) n * piece >= T_lat && (long) (n - 1) * piece < T_lat, "the pieces cover the song", T_lat, window, piece);
            check(T_lat - (n - 1) * piece >= piece - n, "the pieces are even", T_lat, window, piece);
        }
    }
    // the fork review's case: an 8,192-row card and a prompt of about 7,100 rows leave a window of about 545 frames
    const int w = (8192 - 7100 - 3) / 2, p = yue2_ladder_piece(3000, w);
    printf("[%s] 8192-row card, 7100-row prompt: window %d, piece %d, a piece's window %d\n", p > 0 && p + 2 * YUE2_LADDER_MARGIN <= w ? "PASS" : "FAIL",
           w, p, p + 2 * YUE2_LADDER_MARGIN);
    g_failed += p > 0 && p + 2 * YUE2_LADDER_MARGIN <= w ? 0 : 1;
    printf("%ld cases, %d failed\n", cases, g_failed);
    return g_failed ? 1 : 0;
}
