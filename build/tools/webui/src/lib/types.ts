// mirrors Yue2Request from request.h
// all fields optional except style: unset = server applies default

// one sampling preset per autoregressive stage
export interface Yue2Sampling {
	temperature?: number;
	top_p?: number;
	top_k?: number;
	repetition_penalty?: number;
	penalty_window?: number;
	min_tokens?: number;
	max_tokens?: number;
}

// one adapter of a request: an entry of the server adapter directory and its
// strength, 1 when unset
export interface Yue2Adapter {
	name: string;
	scale?: number | string;
}

export interface Yue2Request {
	style: string;
	lyrics?: string;
	abc?: string;
	cot?: string;
	duration?: number;
	lm_seed?: number;
	seed?: number;
	steps?: number;
	lm_batch_size?: number;
	synth_batch_size?: number;
	cfg_scale?: number;
	semantic_tokens?: string;
	abc_sampling: Yue2Sampling;
	semantic_sampling: Yue2Sampling;
	output_format?: string;
	peak_clip?: number;
	mp3_bitrate?: number;
	adapters?: Yue2Adapter[];
	source_tokens?: string;
	source_start?: number;
	source_end?: number;
}

// GET /props response
export interface Yue2Props {
	version: string;
	model: string;
	vae: string;
	sample_rate: number;
	frame_rate: number;
	context: number;
	// the adapter directory, each entry with the halves it changes
	adapters: { name: string; ar: boolean; nar: boolean }[];
	defaults: Yue2Request;
}

// what we store in IndexedDB per song
export interface Song {
	id?: number;
	name: string;
	format: string;
	created: number;
	style: string;
	seed: number; // the LM seed, the one that decides which song it is
	// length of the audio in seconds, decoded once and cached with the peaks
	duration: number;
	// the score the model wrote, editable and resubmittable as abc
	score: string;
	request: Yue2Request;
	audio: Blob;
	// raw f32 [T * 64] latents the VAE decoder produced this audio from.
	// Present for songs from /synth and for .vae files opened, computed on
	// demand for an imported recording. A retouch starts from them instead
	// of encoding the audio again.
	latents?: Blob;
	// user-marked favorite, persisted across reloads. Acts as a sticky
	// flag for the bulk "Delete non-favorites" action.
	favorite?: boolean;
	// 4096 normalized peaks [0..1] cached after the first decode, so F5
	// and re-mounts skip decodeAudioData entirely. Downsampled at draw
	// time to whatever canvas width is on screen.
	peaks?: Float32Array;
}
