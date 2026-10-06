<script lang="ts">
	import { onMount } from 'svelte';
	import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
	import { RotateCcw, Download, FolderOpen, X } from '@lucide/svelte';
	import { app, toast, setRequest } from '../lib/state.svelte.js';
	import { example } from '../lib/example.js';
	import { synthSubmit, pollJob, jobResultTracks, cancelJob } from '../lib/api.js';
	import { putSong, getAllSongs, saveJob, loadJob, clearJob } from '../lib/db.js';
	import { num, buildSparse, clearSection, emptyRequest } from '../lib/fields.js';
	import { COT_FULL, COT_MELODY, COT_OFF } from '../lib/config.js';
	import type { Yue2Request, Song } from '../lib/types.js';
	import type { PendingJob } from '../lib/db.js';
	import Dialog from './Dialog.svelte';
	import DialogButton from './DialogButton.svelte';

	let busy = $state(false);
	let fileInput: HTMLInputElement;
	let saveFormatOpen = $state(false);
	let takeOpen = $state(false);

	let d = $derived(app.props?.defaults);

	// The mode menu shows the published default until a mode is picked, so
	// the request carries a cot only when it is yours.
	let cot = $derived(app.request.cot || d?.cot || '');

	// resume a pending job after page reload, or land a fresh submission.
	// shared tail of both the onMount resume and the generate path.
	async function landJob(job: PendingJob) {
		await pollJob(job.id);
		const tracks = await jobResultTracks(job.id);
		clearJob();
		// one card per track. The card keeps the track's replay request:
		// the score, the semantic stream and the exact seed.
		const now = Date.now();
		for (let i = 0; i < tracks.length; i++) {
			const r = tracks[i].request;
			const song: Song = {
				name: tracks.length > 1 ? `${job.name} ${i}` : job.name,
				format: app.format,
				created: now + i,
				style: r.style || '',
				seed: r.lm_seed ?? 0,
				duration: 0,
				score: r.abc || '',
				request: r,
				audio: tracks[i].audio
			};
			song.id = await putSong(song);
		}
		app.songs = (await getAllSongs()).reverse();
		// The score travels back: resubmitting it varies the interpretation of
		// the same composition. The semantic stream stays out, it would render
		// the very same music.
		if (tracks.length) {
			app.request.abc = tracks[0].request.abc || '';
		}
	}

	// on mount: resume polling for a pending job in localStorage.
	onMount(() => {
		const job = loadJob();
		if (job) {
			busy = true;
			landJob(job)
				.catch(() => {
					clearJob();
				})
				.finally(() => {
					busy = false;
				});
		}
	});

	function reset() {
		app.name = '';
		setRequest(emptyRequest());
	}

	function saveAs(format: 'json' | 'yaml') {
		const req = buildRequest();
		const text = format === 'json' ? JSON.stringify(req, null, 2) : yamlStringify(req);
		const mime = format === 'json' ? 'application/json' : 'application/x-yaml';
		const blob = new Blob([text], { type: mime });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		const safe = app.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '') || 'request';
		a.download = `${safe}.${format}`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function importJson() {
		fileInput.click();
	}

	function onFileSelected(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		// reset so the same file can be re-opened
		input.value = '';

		const ext = file.name.split('.').pop()?.toLowerCase() || '';

		// MP3 or WAV: a song card with the audio alone, transcribed from the
		// card into a score
		if (ext === 'mp3' || ext === 'wav') {
			openAudio(file, ext);
			return;
		}

		// JSON and YAML share the same load path: parse, push the request into
		// the form, and use the file basename as app.name.
		const parsers: Record<string, (s: string) => Yue2Request> = {
			json: JSON.parse,
			yml: yamlParse,
			yaml: yamlParse
		};
		const parse = parsers[ext];
		if (!parse) {
			toast('Unsupported file type: ' + ext);
			return;
		}
		file
			.text()
			.then((text) => {
				const parsed = parse(text) as any;

				// optional title field: lets a LLM authored YAML/JSON pre-fill
				// the song name on import. Stripped before setRequest.
				const importedName =
					typeof parsed?.title === 'string' && parsed.title.trim() ? parsed.title.trim() : '';
				delete parsed.title;
				setRequest(parsed as Yue2Request);
				app.name = importedName || file.name.replace(/\.(json|ya?ml)$/i, '') || 'Imported';
			})
			.catch(() => {
				toast(`Invalid ${ext.toUpperCase()} file`);
			});
	}

	// open audio file: create song card with audio only (no server call).
	// use Transcribe on the card to read its score.
	async function openAudio(file: File, ext: string) {
		const blob = new Blob([await file.arrayBuffer()], {
			type: ext === 'wav' ? 'audio/wav' : 'audio/mpeg'
		});
		const name = file.name.replace(/\.(mp3|wav)$/i, '') || 'Imported';
		const song: Song = {
			name,
			format: ext,
			created: Date.now(),
			style: '',
			seed: 0,
			duration: 0,
			score: '',
			request: emptyRequest(),
			audio: blob
		};
		song.id = await putSong(song);
		app.songs.unshift(song);
		app.name = name;
		toast('Opened: ' + name, 4000, true);
	}

	// snapshot app.request into a clean Yue2Request with proper types.
	// bind:value guarantees app.request always matches the DOM.
	function buildRequest(): Yue2Request {
		return buildSparse(app.request);
	}

	// Example: pick a random official demo prompt, fill the form and name
	// the song after it
	function pickExample() {
		const ex = example();
		setRequest(ex.request);
		app.name = ex.title;
	}

	// Generate: submit the request, poll until done, land the song card.
	// The webui resolves the seeds so the stored request reproduces the song.
	async function generate() {
		busy = true;
		try {
			const req = buildRequest();
			// Both seeds are resolved here so the stored request replays the
			// exact track, the token draw and the acoustic noise alike
			const userLmSeed = num(req.lm_seed);
			req.lm_seed =
				userLmSeed != null && userLmSeed >= 0
					? userLmSeed
					: Math.floor(Math.random() * 0x100000000);
			const userSeed = num(req.seed);
			req.seed =
				userSeed != null && userSeed >= 0 ? userSeed : Math.floor(Math.random() * 0x100000000);

			const jobId = await synthSubmit(req, app.format);
			const job: PendingJob = { id: jobId, name: app.name || 'Untitled', request: req };
			saveJob(job);
			await landJob(job);
		} catch (e: unknown) {
			toast(e instanceof Error ? e.message : String(e));
		} finally {
			busy = false;
		}
	}

	// A request carrying audio codes renders the take they hold, so the run
	// asks which take is wanted before it starts. An empty box goes straight
	// to the pipeline.
	function askTake() {
		if (app.request.semantic_tokens?.trim()) {
			takeOpen = true;
			return;
		}
		generate();
	}

	// The codes leave the request and both seeds go back to a free draw, so
	// the AR half performs the prompt again instead of retracing the take
	function newTake() {
		app.request.semantic_tokens = '';
		app.request.lm_seed = -1;
		app.request.seed = -1;
		generate();
	}

	// cancel the active pipeline job
	async function cancelPipeline() {
		try {
			const job = loadJob();
			if (job) await cancelJob(job.id);
		} catch {}
	}

	function clearLm() {
		clearSection(app.request, 'lm');
	}

	function clearScoreSampling() {
		clearSection(app.request, 'score');
	}

	// the score itself, so a generation that missed the tune is one click away
	// from a free composition again
	function clearScoreText() {
		app.request.abc = '';
	}

	function clearSemantic() {
		clearSection(app.request, 'semantic');
	}

	function clearPost() {
		clearSection(app.request, 'post');
	}

	function ph(v: unknown): string {
		return v != null ? String(v) : '';
	}
</script>

<form class="request-form" onsubmit={(e) => e.preventDefault()}>
	<input
		type="file"
		accept=".json,.yml,.yaml,.mp3,.wav"
		bind:this={fileInput}
		onchange={onFileSelected}
		hidden
	/>
	<div class="toolbar">
		<button type="button" onclick={importJson} title="Open JSON/YAML prompt"
			><FolderOpen size={14} /> Open</button
		>
		<button
			type="button"
			onclick={() => (saveFormatOpen = true)}
			title="Save prompt as JSON or YAML"><Download size={14} /> Save</button
		>
		<button type="button" onclick={reset} title="Reset prompt"><RotateCcw size={14} /> Reset</button
		>
	</div>

	<div class="section-title">Name</div>
	<input type="text" bind:value={app.name} placeholder="Untitled" />

	<div class="section-title">Style</div>
	<textarea
		rows="8"
		placeholder="English, warm piano pop, expressive female voice, acoustic piano..."
		bind:value={app.request.style}
	></textarea>

	<div class="section-title">Lyrics</div>
	<textarea
		rows="8"
		placeholder={'[Verse]\nWrite your lyrics here...'}
		bind:value={app.request.lyrics}
	></textarea>

	<div class="section-title section-header">
		Score
		<button
			type="button"
			class="clear-btn"
			title="Clear score"
			onclick={clearScoreText}
			aria-label="Clear score"
		>
			<X size={20} />
		</button>
	</div>
	<textarea
		rows="8"
		placeholder={'ABC notation. Left empty the model writes one.\nX:1\nL:1/8\nM:4/4\nK:Cmaj\n"C"c2 e2 g2 c\'2|'}
		bind:value={app.request.abc}
	></textarea>

	<div class="section-title section-header">
		LM configuration
		<button
			type="button"
			class="clear-btn"
			title="Clear LM configuration"
			onclick={clearLm}
			aria-label="Clear LM configuration"
		>
			<X size={20} />
		</button>
	</div>
	<div class="field-row">
		<span class="field-label">Mode</span>
		<select
			class="field-select"
			value={cot}
			onchange={(e) => (app.request.cot = e.currentTarget.value)}
			title="What the autoregressive half writes before the codes."
		>
			<option value={COT_FULL}>Full: the score carries the chords</option>
			<option value={COT_MELODY}>Melody: the score carries no chords</option>
			<option value={COT_OFF}>Off: no score, written or supplied</option>
		</select>
	</div>
	<div class="meta-grid">
		<label
			>Duration <input
				type="text"
				placeholder={ph(d?.duration)}
				bind:value={app.request.duration}
				title="Target length in seconds. The model can end the song earlier."
			/></label
		>
		<label
			>LM batch <input
				type="text"
				placeholder={ph(d?.lm_batch_size)}
				bind:value={app.request.lm_batch_size}
				title="Songs drawn from this prompt, each with its own score and codes, seeds LM seed + index."
			/></label
		>
		<label
			>LM seed <input
				type="text"
				placeholder={ph(d?.lm_seed)}
				bind:value={app.request.lm_seed}
				title="Seed of the token draw: the score, the melody and the length come from this one."
			/></label
		>
	</div>

	<details class="has-clear">
		<summary>Score sampling</summary>
		<button
			type="button"
			class="clear-btn details-clear"
			title="Clear score sampling"
			onclick={clearScoreSampling}
			aria-label="Clear score sampling"
		>
			<X size={20} />
		</button>
		<div class="details-body">
			<div class="meta-grid">
				<label
					>Temperature <input
						type="text"
						placeholder={ph(d?.abc_sampling?.temperature)}
						bind:value={app.request.abc_sampling.temperature}
					/></label
				>
				<label
					>Top P <input
						type="text"
						placeholder={ph(d?.abc_sampling?.top_p)}
						bind:value={app.request.abc_sampling.top_p}
					/></label
				>
				<label
					>Top K <input
						type="text"
						placeholder={ph(d?.abc_sampling?.top_k)}
						bind:value={app.request.abc_sampling.top_k}
					/></label
				>
				<label
					>Repetition penalty <input
						type="text"
						placeholder={ph(d?.abc_sampling?.repetition_penalty)}
						bind:value={app.request.abc_sampling.repetition_penalty}
					/></label
				>
				<label
					>Penalty window <input
						type="text"
						placeholder={ph(d?.abc_sampling?.penalty_window)}
						bind:value={app.request.abc_sampling.penalty_window}
					/></label
				>
				<label
					>Min tokens <input
						type="text"
						placeholder={ph(d?.abc_sampling?.min_tokens)}
						bind:value={app.request.abc_sampling.min_tokens}
					/></label
				>
				<label
					>Max tokens <input
						type="text"
						placeholder={ph(d?.abc_sampling?.max_tokens)}
						bind:value={app.request.abc_sampling.max_tokens}
					/></label
				>
			</div>
		</div>
	</details>

	<details class="has-clear">
		<summary>Semantic sampling</summary>
		<button
			type="button"
			class="clear-btn details-clear"
			title="Clear semantic sampling"
			onclick={clearSemantic}
			aria-label="Clear semantic sampling"
		>
			<X size={20} />
		</button>
		<div class="details-body">
			<div class="meta-grid">
				<label
					>CFG scale <input
						type="text"
						placeholder={ph(d?.cfg_scale)}
						bind:value={app.request.cfg_scale}
						title="Guidance of the stage. Exactly 1 keeps a single branch and halves the cost."
					/></label
				>
				<label
					>Temperature <input
						type="text"
						placeholder={ph(d?.semantic_sampling?.temperature)}
						bind:value={app.request.semantic_sampling.temperature}
					/></label
				>
				<label
					>Top P <input
						type="text"
						placeholder={ph(d?.semantic_sampling?.top_p)}
						bind:value={app.request.semantic_sampling.top_p}
					/></label
				>
				<label
					>Top K <input
						type="text"
						placeholder={ph(d?.semantic_sampling?.top_k)}
						bind:value={app.request.semantic_sampling.top_k}
					/></label
				>
				<label
					>Repetition penalty <input
						type="text"
						placeholder={ph(d?.semantic_sampling?.repetition_penalty)}
						bind:value={app.request.semantic_sampling.repetition_penalty}
					/></label
				>
				<label
					>Penalty window <input
						type="text"
						placeholder={ph(d?.semantic_sampling?.penalty_window)}
						bind:value={app.request.semantic_sampling.penalty_window}
					/></label
				>
				<label
					>Min tokens <input
						type="text"
						placeholder={ph(d?.semantic_sampling?.min_tokens)}
						bind:value={app.request.semantic_sampling.min_tokens}
					/></label
				>
				<label
					>Max tokens <input
						type="text"
						placeholder={ph(d?.semantic_sampling?.max_tokens)}
						bind:value={app.request.semantic_sampling.max_tokens}
					/></label
				>
			</div>
			<label
				>Audio codes
				<textarea
					rows="4"
					placeholder="Filled when reusing a rendered song. Do not edit unless you know what you are doing."
					bind:value={app.request.semantic_tokens}
				></textarea>
			</label>
		</div>
	</details>

	<details class="has-clear">
		<summary>Advanced and post-processing</summary>
		<button
			type="button"
			class="clear-btn details-clear"
			title="Clear advanced and post-processing"
			onclick={clearPost}
			aria-label="Clear advanced and post-processing"
		>
			<X size={20} />
		</button>
		<div class="details-body">
			<div class="meta-grid">
				<label
					>Steps <input
						type="text"
						placeholder={ph(d?.steps)}
						bind:value={app.request.steps}
						title="Midpoint steps of the acoustic ODE."
					/></label
				>
				<label
					>Batch <input
						type="text"
						placeholder={ph(d?.synth_batch_size)}
						bind:value={app.request.synth_batch_size}
						title="Noise variations per song on the same codes, seeds noise seed + index, 9 at most."
					/></label
				>
				<label
					>Noise seed <input
						type="text"
						placeholder={ph(d?.seed)}
						bind:value={app.request.seed}
						title="Seed of the acoustic noise. Change it to re-render the same song differently."
					/></label
				>
				<label
					>Peak clip <input
						type="text"
						placeholder={ph(d?.peak_clip)}
						bind:value={app.request.peak_clip}
					/></label
				>
				<label
					>MP3 bitrate <input
						type="text"
						placeholder={ph(d?.mp3_bitrate)}
						bind:value={app.request.mp3_bitrate}
					/></label
				>
				<label
					>Format <select
						bind:value={app.format}
						title="Output audio format. WAV32 outputs raw IEEE float without normalization."
					>
						<option value="mp3">MP3</option>
						<option value="wav16">WAV16</option>
						<option value="wav24">WAV24</option>
						<option value="wav32">WAV32</option>
					</select></label
				>
			</div>
		</div>
	</details>

	<div class="action-row">
		<button
			type="button"
			disabled={busy}
			onclick={pickExample}
			title="Pick a random official demo prompt">Example</button
		>
		<button
			type="button"
			disabled={busy}
			onclick={askTake}
			title="Run the full pipeline: score, semantic codes, flow matching, VAE">Generate</button
		>
		<button type="button" disabled={!busy} onclick={cancelPipeline} title="Cancel the active job"
			>Cancel</button
		>
	</div>
</form>

<Dialog bind:open={takeOpen} title="Reuse this take?">
	{#snippet body()}
		The audio codes hold a performance already sung. Keeping them renders it again, dropping them
		performs the prompt anew.
	{/snippet}
	{#snippet actions(close)}
		<DialogButton
			onclick={() => {
				close();
				generate();
			}}>Same take</DialogButton
		>
		<DialogButton
			onclick={() => {
				close();
				newTake();
			}}>New take</DialogButton
		>
	{/snippet}
</Dialog>

<Dialog bind:open={saveFormatOpen} title="Save format">
	{#snippet actions(close)}
		<DialogButton onclick={close}>Cancel</DialogButton>
		<DialogButton
			onclick={() => {
				saveAs('json');
				close();
			}}>JSON</DialogButton
		>
		<DialogButton
			onclick={() => {
				saveAs('yaml');
				close();
			}}>YAML</DialogButton
		>
	{/snippet}
</Dialog>

<style>
	.request-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.toolbar {
		display: flex;
		gap: 0.5rem;
	}
	.toolbar button {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.85rem;
		color: var(--fg-dim);
	}
	.section-title {
		font-size: 0.85rem;
		color: var(--fg);
		font-weight: 600;
		padding: 0.4rem 0 0;
	}
	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.has-clear {
		position: relative;
	}
	.details-clear {
		position: absolute;
		top: 0.4rem;
		right: 0;
	}
	.clear-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		background: transparent;
		color: var(--fg-dim);
		cursor: pointer;
		line-height: 0;
	}
	.clear-btn:hover {
		color: var(--fg);
	}
	textarea,
	input[type='text'],
	select {
		font-family: inherit;
		font-size: 0.9rem;
		padding: 0.4rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		background: var(--bg-input);
		color: var(--fg);
		resize: vertical;
	}
	textarea:focus,
	input:focus {
		outline: 2px solid var(--focus);
		outline-offset: -1px;
	}
	.field-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.field-label {
		font-size: 0.85rem;
		color: var(--fg-dim);
		flex-shrink: 0;
		min-width: 2rem;
	}
	.field-select {
		flex: 1;
		min-width: 0;
	}

	.meta-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
		gap: 0.5rem;
	}
	details summary {
		cursor: pointer;
		font-size: 0.85rem;
		color: var(--fg);
		font-weight: 600;
		padding: 0.4rem 0;
	}
	details summary:hover {
		color: var(--fg);
	}
	.details-body {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.25rem 0 0.5rem;
	}
	.action-row {
		display: flex;
		gap: 0.5rem;
	}
	.action-row button {
		flex: 1;
	}
	button {
		padding: 0.5rem 1rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		background: var(--bg-btn);
		color: var(--fg);
		cursor: pointer;
		font-size: 0.85rem;
	}
	button:hover:not(:disabled) {
		background: var(--bg-btn-hover);
	}
	button:disabled {
		opacity: 0.4;
	}
</style>
