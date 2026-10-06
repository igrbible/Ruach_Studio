// all example prompts bundled at build time (Vite eager glob).
// Official YuE2 requests: the repository example, the one the checkpoint
// ships alongside its weights, and the cases of the demo site, covers
// carrying their melody score.

import type { Yue2Request } from './types.js';

const modules = import.meta.glob('../../example/*.json', { eager: true });

const examples: Record<string, unknown>[] = Object.values(modules).map(
	(m: unknown) =>
		(m as { default?: Record<string, unknown> }).default ?? (m as Record<string, unknown>)
);

// pick a random example: its title names the song like an imported file
// does, the rest is the request
export function example(): { title: string; request: Yue2Request } {
	const ex = examples[Math.floor(Math.random() * examples.length)];
	return {
		title: String(ex.title ?? ''),
		request: {
			style: String(ex.style),
			lyrics: String(ex.lyrics),
			cot: String(ex.cot ?? 'full'),
			abc: ex.abc ? String(ex.abc) : undefined,
			abc_sampling: {},
			semantic_sampling: {}
		}
	};
}
