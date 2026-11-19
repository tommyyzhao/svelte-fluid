/*
 * svelte-fluid — preset code-snippet helpers (INTERNAL)
 *
 * Pure, dependency-free functions that turn a registry preset into copy-paste
 * code. Used by the demo site's Show Code action and the generated agent docs
 * (`/llms-full.txt`, `/SKILL.md`). Single-source: everything reads the registry
 * (ADR-0040), so snippets never drift from what `<Preset />` actually renders.
 */

import { PRESET_BY_ID, type PresetConfig } from './registry.js';

/**
 * The recommended way to use a preset: import the wrapper and render it.
 * This is the primary "Show Code" content — presets are zero-config wrappers.
 */
export function presetUsageSnippet(id: string): string {
	return `<script>\n\timport { ${id} } from 'svelte-fluid';\n</script>\n\n<${id} />`;
}

/** Serialize a config value as a Svelte-style JS literal (unquoted keys, single quotes). */
export function configValueLiteral(value: unknown): string {
	return (
		JSON.stringify(value, null, '\t')
			// unquote object keys: "type": -> type:
			.replace(/"([A-Za-z_$][\w$]*)":/g, '$1:')
			// convert remaining JSON string literals to single-quoted JS strings,
			// unescaping \" and escaping bare ' so quotes/apostrophes in a value
			// (e.g. a font name or path) can't corrupt or terminate the literal.
			.replace(
				/"((?:[^"\\]|\\.)*)"/g,
				(_m, body: string) => `'${body.replace(/\\"/g, '"').replace(/'/g, "\\'")}'`
			)
	);
}

/** One Svelte attribute for a config entry (may span multiple lines for objects). */
export function configAttribute(key: string, value: unknown): string {
	if (value === true) return key;
	if (value === false) return `${key}={false}`;
	if (typeof value === 'number') return `${key}={${value}}`;
	if (typeof value === 'string') return `${key}=${JSON.stringify(value)}`;
	return `${key}={${configValueLiteral(value)}}`;
}

/**
 * The expanded `<Fluid>` recipe a preset wrapper pins — for forking a preset
 * into a customized `<Fluid>`. Equivalent to `<Preset />` (plus forwarded
 * sizing/seed props, which are per-instance and omitted here).
 */
export function presetConfigSnippet(id: string): string {
	const def = PRESET_BY_ID[id];
	if (!def) return '';
	const attrs = configToAttributeLines(def.config)
		// indent continuation lines (multi-line object values) under the attribute
		.map((l) => '\t' + l.replace(/\n/g, '\n\t'))
		.join('\n');
	return `<Fluid\n${attrs}\n/>`;
}

/** Ordered list of Svelte attribute strings for a config (skips undefined). */
export function configToAttributeLines(config: PresetConfig): string[] {
	return Object.entries(config)
		.filter(([, v]) => v !== undefined)
		.map(([key, value]) => configAttribute(key, value));
}

/**
 * Asset-setup notes for a config that references external files (images, masks,
 * etc.), so a from-scratch example is self-contained. Config-only presets — all
 * fourteen — reference no external assets and return `[]`.
 */
export function configAssetNotes(config: PresetConfig): string[] {
	const notes: string[] = [];
	for (const [key, value] of Object.entries(config)) {
		if (typeof value === 'string' && /url$|image|mask|src/i.test(key)) {
			notes.push(`<!-- Asset: serve the file for ${key} (${value}) from your static/ folder -->`);
		}
	}
	return notes;
}

/**
 * A complete, copy-paste Svelte component that recreates a preset FROM SCRATCH
 * with the raw `<Fluid>` API — imports, a sizing wrapper, the full pinned
 * config, and any required asset notes — rather than the zero-config wrapper.
 */
export function presetScaffoldSnippet(id: string, height = 420): string {
	const recipe = presetConfigSnippet(id);
	if (!recipe) return '';
	const def = PRESET_BY_ID[id];
	const assets = configAssetNotes(def.config);
	const frame = def.frame;
	const indent = (text: string, tabs: number) =>
		text
			.split('\n')
			.map((l) => '\t'.repeat(tabs) + l)
			.join('\n');
	if (frame) {
		// The wrapper draws walls under a transparent canvas; reproduce that markup, with the
		// path declared once and shared by the SVG and `<Fluid>`.
		const { containerShape, ...rest } = def.config;
		const attrs = ['{containerShape}', ...configToAttributeLines(rest)]
			.map((l) => '\t\t\t\t' + l.replace(/\n/g, '\n\t\t\t\t'))
			.join('\n');
		const fluid = `\t\t\t<Fluid\n${attrs}\n\t\t\t/>`;
		const back = (def.config.backColor ?? { r: 0, g: 0, b: 0 }) as { r: number; g: number; b: number };
		return [
			'<' + 'script>',
			"\timport { Fluid } from 'svelte-fluid';",
			'',
			`\tconst containerShape = ${configValueLiteral(containerShape).replace(/\n/g, '\n\t')};`,
			'<' + '/script>',
			'',
			...(assets.length ? [...assets, ''] : []),
			`<div style="width: 100%; height: ${height}px">`,
			`\t<div style="height: 100%; display: grid; place-items: center; container-type: size; background: ${frame.wallColor}">`,
			`\t\t<div style="position: relative; width: min(100cqw, calc(100cqh * ${frame.aspect})); aspect-ratio: ${frame.aspect}">`,
			`\t\t\t<svg viewBox={containerShape.viewBox.join(' ')} style="position: absolute; inset: 0; width: 100%; height: 100%" aria-hidden="true">`,
			`\t\t\t\t<path d={containerShape.d} fill="rgb(${back.r} ${back.g} ${back.b})" fill-rule="evenodd" />`,
			'\t\t\t</svg>',
			fluid,
			'\t\t</div>',
			'\t</div>',
			'</div>'
		].join('\n');
	}
	return [
		'<' + 'script>',
		"\timport { Fluid } from 'svelte-fluid';",
		'<' + '/script>',
		'',
		...(assets.length ? [...assets, ''] : []),
		`<div style="width: 100%; height: ${height}px">`,
		indent(recipe, 1),
		'</div>'
	].join('\n');
}
