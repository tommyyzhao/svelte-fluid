<script lang="ts">
	/**
	 * "Copy page" button — serializes the current page content as clean markdown
	 * and copies it to the clipboard for LLM consumption. If a `content` prop is
	 * provided, it is used verbatim; otherwise the component extracts markdown
	 * from the page DOM.
	 */

	let {
		content
	}: {
		/** Explicit markdown string. When omitted, the DOM is serialized. */
		content?: string;
	} = $props();

	let copyState = $state<'idle' | 'copied'>('idle');
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	/** Convert a DOM subtree into clean markdown suitable for LLMs. */
	function domToMarkdown(): string {
		const main =
			document.querySelector('main') ??
			document.querySelector('.page') ??
			document.querySelector('.content') ??
			document.body;

		const lines: string[] = [];
		const title = document.title;
		if (title) lines.push(`# ${title}`, '');

		walkNode(main, lines);

		return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
	}

	function walkNode(node: Node, lines: string[]): void {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = (node.textContent ?? '').replace(/\s+/g, ' ');
			if (text.trim()) lines.push(text.trim());
			return;
		}

		if (node.nodeType !== Node.ELEMENT_NODE) return;

		const el = node as HTMLElement;

		// Skip elements that are not useful for markdown (canvases, hidden, buttons, nav controls).
		const tag = el.tagName.toLowerCase();
		if (['canvas', 'svg', 'style', 'script', 'noscript', 'video', 'audio', 'iframe'].includes(tag)) return;

		// Skip the copy-page button itself and fluid canvas slots.
		if (el.classList.contains('copy-page-btn')) return;
		if (el.classList.contains('canvas-slot')) return;
		if (el.classList.contains('playground-canvas')) return;

		// Skip hidden elements.
		const style = getComputedStyle(el);
		if (style.display === 'none' || style.visibility === 'hidden') return;

		// Headings.
		const headingMatch = tag.match(/^h([1-6])$/);
		if (headingMatch) {
			const level = parseInt(headingMatch[1]);
			const text = el.textContent?.trim() ?? '';
			if (text) {
				lines.push('');
				lines.push(`${'#'.repeat(level)} ${text}`);
				lines.push('');
			}
			return;
		}

		// Code blocks (pre > code).
		if (tag === 'pre') {
			const codeEl = el.querySelector('code');
			const text = (codeEl ?? el).textContent?.trim() ?? '';
			if (text) {
				lines.push('');
				lines.push('```');
				lines.push(text);
				lines.push('```');
				lines.push('');
			}
			return;
		}

		// Inline code.
		if (tag === 'code') {
			const text = el.textContent?.trim() ?? '';
			if (text) lines.push(`\`${text}\``);
			return;
		}

		// Links.
		if (tag === 'a') {
			const href = el.getAttribute('href') ?? '';
			const text = el.textContent?.trim() ?? '';
			if (text && href) {
				lines.push(`[${text}](${href})`);
			} else if (text) {
				lines.push(text);
			}
			return;
		}

		// List items.
		if (tag === 'li') {
			const text = el.textContent?.trim() ?? '';
			if (text) lines.push(`- ${text}`);
			return;
		}

		// Table handling.
		if (tag === 'table') {
			extractTable(el, lines);
			return;
		}

		// Paragraphs and divs — recurse into children.
		if (tag === 'p') {
			const text = el.textContent?.trim() ?? '';
			if (text) {
				lines.push('');
				lines.push(text);
				lines.push('');
			}
			return;
		}

		// figcaption: extract title + description.
		if (tag === 'figcaption') {
			const h3 = el.querySelector('h3');
			const p = el.querySelector('p');
			if (h3) lines.push(`### ${h3.textContent?.trim() ?? ''}`);
			if (p) lines.push(p.textContent?.trim() ?? '');

			// Also extract code snippets if visible.
			const snippetWrap = el.querySelector('.snippet-wrap');
			if (snippetWrap) {
				const code = snippetWrap.querySelector('code');
				if (code) {
					const text = code.textContent?.trim() ?? '';
					if (text) {
						lines.push('');
						lines.push('```svelte');
						lines.push(text);
						lines.push('```');
						lines.push('');
					}
				}
			}
			return;
		}

		// figure (Card component): extract caption content.
		if (tag === 'figure') {
			const caption = el.querySelector('figcaption');
			if (caption) walkNode(caption, lines);
			return;
		}

		// Skip interactive UI controls.
		if (tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea') return;
		if (tag === 'label') return;

		// Generic container: recurse.
		for (const child of el.childNodes) {
			walkNode(child, lines);
		}
	}

	function extractTable(table: HTMLElement, lines: string[]): void {
		const rows = table.querySelectorAll('tr');
		if (rows.length === 0) return;

		lines.push('');

		const allRows: string[][] = [];
		for (const row of rows) {
			const cells = row.querySelectorAll('th, td');
			const rowData: string[] = [];
			for (const cell of cells) {
				rowData.push((cell.textContent?.trim() ?? '').replace(/\|/g, '\\|'));
			}
			allRows.push(rowData);
		}

		if (allRows.length === 0) return;

		// First row as header.
		lines.push(`| ${allRows[0].join(' | ')} |`);
		lines.push(`| ${allRows[0].map(() => '---').join(' | ')} |`);
		for (let i = 1; i < allRows.length; i++) {
			lines.push(`| ${allRows[i].join(' | ')} |`);
		}
		lines.push('');
	}

	async function copyPage() {
		const markdown = content ?? domToMarkdown();
		await navigator.clipboard.writeText(markdown);
		copyState = 'copied';
		clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copyState = 'idle'), 2000);
	}
</script>

<button
	class="copy-page-btn"
	onclick={copyPage}
	aria-live="polite"
	title="Copy page content as markdown for LLMs"
>
	{#if copyState === 'copied'}Copied!{:else}Copy page{/if}
</button>

<style>
	.copy-page-btn {
		padding: 4px 10px;
		font-size: 0.7rem;
		background: #1c2a3a;
		border: 1px solid #2a4a6a;
		border-radius: 4px;
		color: #8bc;
		cursor: pointer;
		transition: all 120ms;
		pointer-events: auto;
	}
	.copy-page-btn:hover {
		background: #243a52;
		color: #cfe;
	}
</style>
