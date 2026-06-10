// Unified demo-site theme registry.
//
// Each theme is a palette distilled from one of the design-competition
// entries (src/routes/design1..design20), ordered light → mid → dark so
// the switcher reads as a brightness spectrum. The demo pages derive
// every color they paint — CSS vars, fluid backColor, reveal cover —
// from the active theme, so all presets sit on the theme's background.

import type { RGB } from '$lib/index.js';

export interface DemoTheme {
	id: string;
	/** Display name shown in the switcher. */
	name: string;
	group: 'Light' | 'Mid' | 'Dark';
	/** Page background (hex). */
	paper: string;
	/** Card / surface background (hex). */
	card: string;
	/** Foreground text (hex). */
	ink: string;
	/** Accent / highlight (hex). */
	accent: string;
}

export const THEMES: DemoTheme[] = [
	// ---- Light ----
	{
		id: 'paper-glass',
		name: 'Paper Glass',
		group: 'Light',
		paper: '#f4ede0',
		card: '#ebe3d2',
		ink: '#1a1814',
		accent: '#8c2a1d'
	},
	{
		id: 'corporate-bento',
		name: 'Corporate Bento',
		group: 'Light',
		paper: '#faf8f5',
		card: '#ffffff',
		ink: '#111111',
		accent: '#2563eb'
	},
	{
		id: 'editorial-print',
		name: 'Editorial Print',
		group: 'Light',
		paper: '#f5f1ea',
		card: '#efe9df',
		ink: '#0a0a0a',
		accent: '#ff2d2d'
	},
	{
		id: 'editorial-amber',
		name: 'Editorial Amber',
		group: 'Light',
		paper: '#f5f1ea',
		card: '#efe9df',
		ink: '#0a0a0a',
		accent: '#ffb84d'
	},
	{
		id: 'warm-pastel',
		name: 'Warm Pastel',
		group: 'Light',
		paper: '#fbf5ee',
		card: '#fffaf4',
		ink: '#2b2430',
		accent: '#e8927c'
	},
	{
		id: 'bubblegum',
		name: 'Bubblegum',
		group: 'Light',
		paper: '#fff5ee',
		card: '#ffeaf0',
		ink: '#3a1d2c',
		accent: '#e88ba2'
	},
	// ---- Mid ----
	{
		id: 'velvet',
		name: 'Velvet',
		group: 'Mid',
		paper: '#3a1f2c',
		card: '#4a2a37',
		ink: '#f5e8d4',
		accent: '#d4b896'
	},
	{
		id: 'lagoon',
		name: 'Lagoon',
		group: 'Mid',
		paper: '#1d3845',
		card: '#264a59',
		ink: '#f0e6d2',
		accent: '#d49b6a'
	},
	{
		id: 'vortex',
		name: 'Vortex',
		group: 'Mid',
		paper: '#3a1f5c',
		card: '#4a2a72',
		ink: '#f0e8ff',
		accent: '#ff3aa3'
	},
	// ---- Dark ----
	{
		id: 'modern-saas',
		name: 'Modern SaaS',
		group: 'Dark',
		paper: '#0a0a0a',
		card: '#141414',
		ink: '#d0d0d0',
		accent: '#8b5cf6'
	},
	{
		id: 'terminal',
		name: 'Terminal',
		group: 'Dark',
		paper: '#0a0a0a',
		card: '#0f140f',
		ink: '#e6e6e6',
		accent: '#4ade80'
	},
	{
		id: 'liquid-glass',
		name: 'Liquid Glass',
		group: 'Dark',
		paper: '#000000',
		card: '#101018',
		ink: '#f5f5ff',
		accent: '#6366f1'
	},
	{
		id: 'magazine-noir',
		name: 'Magazine Noir',
		group: 'Dark',
		paper: '#000000',
		card: '#111111',
		ink: '#f5f1e8',
		accent: '#c9a96a'
	}
];

export const THEME_GROUPS: DemoTheme['group'][] = ['Light', 'Mid', 'Dark'];

export const DEFAULT_THEME_ID = 'paper-glass';

export const THEME_STORAGE_KEY = 'svelte-fluid-demo-theme';

export function themeById(id: string | null | undefined): DemoTheme {
	return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Parse `#rrggbb` into the engine's 0–255 backColor convention. */
export function hexToRgb255(hex: string): RGB {
	return {
		r: parseInt(hex.slice(1, 3), 16),
		g: parseInt(hex.slice(3, 5), 16),
		b: parseInt(hex.slice(5, 7), 16)
	};
}

/** Parse `#rrggbb` into 0–1 linear RGB (reveal cover/accent convention). */
export function hexToRgb01(hex: string): RGB {
	const c = hexToRgb255(hex);
	return { r: c.r / 255, g: c.g / 255, b: c.b / 255 };
}

/** `#rrggbb` + alpha → `rgba()` string for derived CSS vars. */
export function rgbaFromHex(hex: string, alpha: number): string {
	const c = hexToRgb255(hex);
	return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

/** Linear blend between two hex colors, returned as 0–1 RGB. */
export function mix01(hexA: string, hexB: string, t: number): RGB {
	const a = hexToRgb01(hexA);
	const b = hexToRgb01(hexB);
	return {
		r: a.r + (b.r - a.r) * t,
		g: a.g + (b.g - a.g) * t,
		b: a.b + (b.b - a.b) * t
	};
}

/** Inline style string that overrides the page's themable CSS vars. */
export function themeStyle(t: DemoTheme): string {
	return [
		`--paper: ${t.paper}`,
		`--card: ${t.card}`,
		`--ink: ${t.ink}`,
		`--ink-soft: ${rgbaFromHex(t.ink, 0.62)}`,
		`--ink-faint: ${rgbaFromHex(t.ink, 0.16)}`,
		`--rule: ${rgbaFromHex(t.ink, 0.88)}`,
		`--hover: ${rgbaFromHex(t.ink, 0.05)}`,
		`--accent: ${t.accent}`
	].join('; ');
}
