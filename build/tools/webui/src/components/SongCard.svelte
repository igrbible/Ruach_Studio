<script lang="ts">
	import {
		Play,
		Square,
		Pencil,
		Download,
		Trash2,
		ChevronDown,
		Heart,
		Type,
		TriangleAlert,
		Music,
		AudioWaveform,
		Cpu
	} from '@lucide/svelte';
	import { app, setRequest, toast } from '../lib/state.svelte.js';
	import {
		transcribeSubmit,
		tokenizeSubmit,
		pollJob,
		jobResultTranscribe,
		jobResultTokenize,
		vaeEncode,
		jobResultBlob
	} from '../lib/api.js';
	import { deleteSong, putSong } from '../lib/db.js';
	import type { Song } from '../lib/types.js';
	import Waveform from './Waveform.svelte';
	import Menu, { type MenuItem } from './Menu.svelte';
	import Dialog from './Dialog.svelte';

	let { song }: { song: Song } = $props();

	let playing = $state(false);
	let time = $state(0);
	let dur = $state(0);
	let rangeStart = $state(0);
	let rangeEnd = $state(0);

	let isSrc = $derived(app.srcSongId === song.id);

	// the source of a continuation: one card at a time, its section staying
	// in the request
	function toggleSrc() {
		app.srcSongId = isSrc ? null : (song.id ?? null);
	}

	// waveform drag to the request
	$effect(() => {
		if (isSrc && rangeEnd > rangeStart) {
			app.request.source_start = Math.round(rangeStart * 100) / 100;
			app.request.source_end = Math.round(rangeEnd * 100) / 100;
		}
	});

	// request to waveform visual (field input, a loaded request)
	$effect(() => {
		if (isSrc) {
			const rs = Number(app.request.source_start ?? 0);
			const re = Number(app.request.source_end ?? -1);
			if (re > rs) {
				rangeStart = rs;
				rangeEnd = re;
			} else {
				rangeStart = 0;
				rangeEnd = 0;
			}
		}
	});

	function toggle() {
		playing = !playing;
	}

	function load() {
		app.name = song.name;
		setRequest({ ...song.request });
	}

	function downloadAudio() {
		const url = URL.createObjectURL(song.audio);
		const a = document.createElement('a');
		a.href = url;
		const safe = song.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '') || 'song';
		const ext = song.format === 'mp3' ? 'mp3' : 'wav';
		a.download = `${safe}.${ext}`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// Download the latents as a .vae file, which Open decodes back into a
	// card holding both
	function downloadLatents() {
		if (!song.latents) return;
		const url = URL.createObjectURL(song.latents);
		const a = document.createElement('a');
		a.href = url;
		const safe = song.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '') || 'song';
		a.download = `${safe}.vae`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// VAE encode alone: POST /vae with the audio of the card and keep the
	// latents on it, for an imported recording a retouch will start from
	async function encodeOnly() {
		if (song.latents || song.id == null) return;
		try {
			const jobId = await vaeEncode(song.audio);
			await pollJob(jobId);
			song.latents = await jobResultBlob(jobId);
			await putSong($state.snapshot(song));
		} catch (e: unknown) {
			toast(e instanceof Error ? e.message : String(e));
		}
	}

	let confirmDeleteOpen = $state(false);
	let confirmDeleteNonFavOpen = $state(false);
	let renameOpen = $state(false);
	let renameValue = $state('');

	async function toggleFavorite() {
		if (song.id == null) return;
		song.favorite = !song.favorite;
		await putSong($state.snapshot(song));
	}

	function openRename() {
		renameValue = song.name;
		renameOpen = true;
	}

	async function doRename() {
		if (song.id == null) return;
		const v = renameValue.trim();
		if (!v || v === song.name) return;
		song.name = v;
		await putSong($state.snapshot(song));
	}

	async function doRemove() {
		if (song.id == null) return;
		if (app.srcSongId === song.id) app.srcSongId = null;
		await deleteSong(song.id);
		const idx = app.songs.findIndex((s) => s.id === song.id);
		if (idx >= 0) app.songs.splice(idx, 1);
	}

	// Deletes every non-favorite track in the list, regardless of which
	// card the menu was opened from. The current card is included in the
	// purge if it is not flagged favorite.
	async function doRemoveNonFavorites() {
		const victims = app.songs.filter((s) => !s.favorite);
		for (const s of victims) {
			if (s.id == null) continue;
			await deleteSong(s.id);
		}
		app.songs = app.songs.filter((s) => s.favorite);
	}

	// MM:SS:XX (hundredths) for current position
	function fmtPos(s: number): string {
		const m = Math.floor(s / 60);
		const sec = Math.floor(s % 60);
		const cs = Math.floor((s * 100) % 100);
		return (
			String(m).padStart(2, '0') +
			':' +
			String(sec).padStart(2, '0') +
			':' +
			String(cs).padStart(2, '0')
		);
	}

	// MM:SS for total duration
	function fmtDur(s: number): string {
		const m = Math.floor(s / 60);
		const sec = Math.floor(s % 60);
		return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
	}

	// transcribe audio: send the recording to /transcribe and keep the score
	// it heard on the card and in the form. Only the card that was analyzed
	// changes; the lyrics, the style and the mode stay yours.
	async function transcribe(melodyOnly: boolean) {
		try {
			const jobId = await transcribeSubmit(song.audio, melodyOnly);
			await pollJob(jobId);
			const result = await jobResultTranscribe(jobId);
			song.score = result.abc ?? '';
			song.request = { ...song.request, abc: song.score };
			if (song.id != null) await putSong($state.snapshot(song));
			app.request.abc = song.score;
			toast('Transcribed: ' + song.name, 4000, true);
		} catch (e) {
			toast('Transcription failed: ' + (e instanceof Error ? e.message : String(e)));
		}
	}

	// tokenize audio: the semantic codes of the recording kept on the card,
	// the card then ready to open a continuation, and put in the form, so
	// Generate renders the song again through the NAR half. The style, the
	// lyrics and the mode stay yours.
	async function tokenize() {
		try {
			const jobId = await tokenizeSubmit(song.audio);
			await pollJob(jobId);
			const result = await jobResultTokenize(jobId);
			song.request = { ...song.request, semantic_tokens: result.codes };
			if (song.id != null) await putSong($state.snapshot(song));
			app.request.semantic_tokens = result.codes;
			toast('Tokenized: ' + song.name, 4000, true);
		} catch (e) {
			toast('Tokenization failed: ' + (e instanceof Error ? e.message : String(e)));
		}
	}

	// Single action menu: one entry per user intent.
	// Destructive entries open a confirm dialog.
	const actionItems: MenuItem[] = $derived([
		{ icon: Pencil, label: 'Edit prompt', onSelect: load },
		{ icon: Type, label: 'Rename song', onSelect: openRename },
		{ icon: Download, label: 'Download audio', onSelect: downloadAudio },
		{ icon: Cpu, label: 'Compute VAE latents', onSelect: encodeOnly, disabled: !!song.latents },
		{
			icon: Download,
			label: 'Download VAE latents',
			onSelect: downloadLatents,
			disabled: !song.latents
		},
		{ icon: Music, label: 'Transcribe score', onSelect: () => transcribe(false) },
		{ icon: Music, label: 'Transcribe melody', onSelect: () => transcribe(true) },
		{ icon: AudioWaveform, label: 'Tokenize audio', onSelect: tokenize },
		{ icon: Trash2, label: 'Delete this track', onSelect: () => (confirmDeleteOpen = true) },
		{
			icon: TriangleAlert,
			label: 'Delete non-favorites',
			onSelect: () => (confirmDeleteNonFavOpen = true)
		}
	]);
</script>

<div class="card">
	<div class="card-header">
		<button class="icon-btn" onclick={toggle} title={playing ? 'Stop' : 'Play'}>
			{#if playing}
				<Square size={14} />
			{:else}
				<Play size={14} />
			{/if}
		</button>
		<span class="card-name">{song.name}</span>
		<Menu items={actionItems}>
			{#snippet trigger()}<ChevronDown size={14} /> Menu{/snippet}
		</Menu>
		<button
			class="icon-btn"
			onclick={toggleFavorite}
			title={song.favorite ? 'Unfavorite' : 'Favorite'}
		>
			<Heart size={14} fill={song.favorite ? 'currentColor' : 'none'} />
		</button>
	</div>
	<Waveform
		{song}
		bind:playing
		bind:time
		bind:dur
		selectable={isSrc}
		bind:rangeStart
		bind:rangeEnd
	/>
	<div class="card-footer">
		<span class="format-badge">{song.format.toUpperCase()}</span>
		{#if song.latents}
			<span class="format-badge">VAE</span>
		{/if}
		<span class="timecode">{fmtPos(time)} / {fmtDur(dur)}</span>
		<div class="card-actions">
			<label class="icon-btn"
				><input
					type="checkbox"
					class="ref-check"
					checked={isSrc}
					onchange={toggleSrc}
					title="Source of a continuation"
				/> Src audio</label
			>
		</div>
	</div>
</div>

<Dialog bind:open={confirmDeleteOpen} title="Delete this track?" onConfirm={doRemove} />

<Dialog
	bind:open={confirmDeleteNonFavOpen}
	title="Delete non-favorites?"
	onConfirm={doRemoveNonFavorites}
/>

<Dialog bind:open={renameOpen} title="Rename song" onConfirm={doRename}>
	{#snippet body()}
		<input type="text" class="rename-input" bind:value={renameValue} />
	{/snippet}
</Dialog>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.5rem;
		border: none;
		border-radius: 4px;
		background: var(--bg-card);
	}
	.card-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.card-footer {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.card-name {
		font-size: 0.8rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
	}
	.format-badge {
		font-size: 0.6rem;
		font-family: monospace;
		padding: 0.05rem 0.3rem;
		border-radius: 2px;
		background: var(--fg);
		color: var(--bg);
		flex-shrink: 0;
	}
	.timecode {
		font-size: 0.7rem;
		font-family: monospace;
		color: var(--fg);
		white-space: nowrap;
		flex: 1;
	}
	.card-actions {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		flex-shrink: 0;
		font-size: 0.8rem;
	}
	.ref-check {
		cursor: pointer;
		accent-color: var(--focus);
	}
	.icon-btn {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.15rem;
		color: var(--fg);
		display: flex;
		align-items: center;
		gap: 0.2rem;
		font-size: 0.8rem;
	}
	.icon-btn:hover {
		color: var(--focus);
	}
	.rename-input {
		width: 100%;
		background: var(--bg-input);
		border: none;
		border-radius: 3px;
		padding: 0.25rem 0.4rem;
		color: var(--fg);
		font-size: 0.8rem;
	}
	.rename-input:focus {
		outline: 1px solid var(--focus);
	}
</style>
