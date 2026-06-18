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
	return JSON.stringify(value, null, '\t')
		.replace(/"([A-Za-z_$][\w$]*)":/g, '$1:')
		.replace(/"/g, "'");
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
