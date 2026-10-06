// UI constants
export const PROPS_POLL_MS = 10000;
export const FETCH_TIMEOUT_MS = 2000;
export const JOB_POLL_MS = 2000;
export const SSE_RECONNECT_MS = 2000;
export const LOG_MAX_LINES = 50;
export const WAVEFORM_HEIGHT = 64;
export const WAVEFORM_BINS = 4096;

// audio output formats (mirror request.h)
export const OUTPUT_FORMATS = ['mp3', 'wav16', 'wav24', 'wav32'] as const;

// Chain of thought modes of the protocol, a closed set the checkpoint freezes
export const COT_FULL = 'full';
export const COT_MELODY = 'melody';
export const COT_OFF = 'off';
