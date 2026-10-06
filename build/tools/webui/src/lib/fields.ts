// field descriptor table: single source of truth for Yue2Request field knowledge.
//
// every flat field in Yue2Request is listed here with its section and type.
// the two sampling presets are objects, so they carry their own key list and
// the helpers walk them the same way.
// helpers derive clear and serialize logic from this table.
// adding a field = adding one line here.

import type { Yue2Request, Yue2Sampling } from './types.js';

export type FieldSection = 'content' | 'lm' | 'score' | 'semantic' | 'post';

interface FieldDef {
	key: keyof Yue2Request;
	section: FieldSection;
	type: 'str' | 'num';
}

export const FIELDS: readonly FieldDef[] = [
	// content: the prompt, the score being an input the user can edit and the
	// only output of the pipeline that reads back as text
	{ key: 'style', section: 'content', type: 'str' },
	{ key: 'lyrics', section: 'content', type: 'str' },
	{ key: 'abc', section: 'content', type: 'str' },

	// lm: what the autoregressive half is asked to write
	{ key: 'cot', section: 'lm', type: 'str' },
	{ key: 'duration', section: 'lm', type: 'num' },
	{ key: 'lm_batch_size', section: 'lm', type: 'num' },
	{ key: 'lm_seed', section: 'lm', type: 'num' },

	// semantic: the token stage, its guidance, its sampling and its codes
	{ key: 'cfg_scale', section: 'semantic', type: 'num' },
	{ key: 'semantic_tokens', section: 'semantic', type: 'str' },

	// post: the acoustic solver, output normalization and encoding
	{ key: 'steps', section: 'post', type: 'num' },
	{ key: 'synth_batch_size', section: 'post', type: 'num' },
	{ key: 'seed', section: 'post', type: 'num' },
	{ key: 'peak_clip', section: 'post', type: 'num' },
	{ key: 'mp3_bitrate', section: 'post', type: 'num' }
];

// the seven knobs of a sampling preset, same order as the protocol
export const SAMPLING_KEYS: readonly (keyof Yue2Sampling)[] = [
	'temperature',
	'top_p',
	'top_k',
	'repetition_penalty',
	'penalty_window',
	'min_tokens',
	'max_tokens'
];

// which preset belongs to which section
export const SAMPLING_FIELDS: readonly {
	key: 'abc_sampling' | 'semantic_sampling';
	section: FieldSection;
}[] = [
	{ key: 'abc_sampling', section: 'score' },
	{ key: 'semantic_sampling', section: 'semantic' }
];

// convert to number, undefined if empty/NaN
export function num(v: unknown): number | undefined {
	if (v == null || v === '') return undefined;
	const n = Number(v);
	return isNaN(n) ? undefined : n;
}

// typed dynamic access helpers
type Rec = Record<string, unknown>;
function get(r: Yue2Request, key: keyof Yue2Request): unknown {
	return (r as unknown as Rec)[key];
}
function set(r: Yue2Request, key: keyof Yue2Request, val: unknown): void {
	(r as unknown as Rec)[key] = val;
}

// resolve a field value to its serialized form, undefined if empty
function resolveField(f: FieldDef, raw: unknown): unknown {
	if (f.type === 'num') {
		const n = num(raw);
		return n != null ? n : undefined;
	}
	return raw ? String(raw) : undefined;
}

// a preset only travels with the knobs the user actually set
function resolveSampling(raw: unknown): Yue2Sampling | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const src = raw as Record<string, unknown>;
	const out: Record<string, number> = {};
	for (const key of SAMPLING_KEYS) {
		const n = num(src[key]);
		if (n != null) out[key] = n;
	}
	return Object.keys(out).length ? (out as Yue2Sampling) : undefined;
}

// serialize non-empty fields for the server payload and JSON export
export function buildSparse(r: Yue2Request): Yue2Request {
	const out: Yue2Request = {
		style: String(r.style || ''),
		abc_sampling: {},
		semantic_sampling: {}
	};
	for (const f of FIELDS) {
		if (f.key === 'style') continue;
		const val = resolveField(f, get(r, f.key));
		if (val !== undefined) set(out, f.key, val);
	}
	for (const s of SAMPLING_FIELDS) {
		const preset = resolveSampling(get(r, s.key));
		if (preset !== undefined) {
			set(out, s.key, preset);
		} else {
			delete (out as unknown as Rec)[s.key];
		}
	}
	return out;
}

// an empty request: every section cleared, so a full reset and a section
// clear leave a field in the exact same state
export function emptyRequest(): Yue2Request {
	const r: Yue2Request = { style: '', abc_sampling: {}, semantic_sampling: {} };
	for (const f of FIELDS) {
		set(r, f.key, f.type === 'str' ? '' : undefined);
	}
	return r;
}

// reset all fields in a section to empty/undefined
export function clearSection(r: Yue2Request, section: FieldSection): void {
	for (const f of FIELDS) {
		if (f.section !== section) continue;
		set(r, f.key, f.type === 'str' ? '' : undefined);
	}
	for (const s of SAMPLING_FIELDS) {
		if (s.section !== section) continue;
		set(r, s.key, {});
	}
}
