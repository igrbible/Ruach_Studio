import type { Yue2Request, Yue2Props, Song } from './types.js';
import { OUTPUT_FORMATS } from './config.js';
import { emptyRequest } from './fields.js';

const STORAGE_KEY = 'yue2';

interface Saved {
	name: string;
	volume: number;
	format: string;
	dark: boolean;
	logsOpen: boolean;
	request: Yue2Request;
}

function load(): Saved {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			return {
				name: parsed.name || '',
				volume: parsed.volume ?? 0.5,
				format: OUTPUT_FORMATS.includes(parsed.format) ? parsed.format : 'mp3',
				dark: parsed.dark ?? true,
				logsOpen: parsed.logsOpen ?? true,
				request: parsed.request || emptyRequest()
			};
		}
	} catch {
		// corrupt or unavailable
	}
	return {
		name: '',
		volume: 0.5,
		format: 'mp3',
		dark: false,
		logsOpen: true,
		request: emptyRequest()
	};
}

const saved = load();

export const app = $state({
	name: saved.name,
	volume: saved.volume,
	format: saved.format,
	dark: saved.dark,
	logsOpen: saved.logsOpen,
	request: saved.request as Yue2Request,
	songs: [] as Song[],
	props: null as Yue2Props | null,
	toast: '' as string,
	toastOk: false
});

let toastTimer = 0;

export function toast(msg: string, ms = 4000, ok = false) {
	clearTimeout(toastTimer);
	app.toast = msg;
	app.toastOk = ok;
	toastTimer = setTimeout(() => {
		app.toast = '';
	}, ms) as unknown as number;
}

// overwrite app.request. A release is two GGUF fixed at server startup, so
// there is no routing to preserve across a load. An incoming request is
// sparse, every field left at its default being absent, so it lands on top of
// an empty one: a field the sender omitted reads back as unset instead of
// missing, which is what the form binds to.
export function setRequest(incoming: Yue2Request) {
	const base = emptyRequest();
	app.request = {
		...base,
		...incoming,
		abc_sampling: { ...base.abc_sampling, ...incoming.abc_sampling },
		semantic_sampling: { ...base.semantic_sampling, ...incoming.semantic_sampling }
	};
}

// persist on every change
$effect.root(() => {
	$effect(() => {
		const data: Saved = {
			name: app.name,
			volume: app.volume,
			format: app.format,
			dark: app.dark,
			logsOpen: app.logsOpen,
			request: app.request
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	});
});
