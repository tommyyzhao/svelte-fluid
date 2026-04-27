<script lang="ts">
	import { Fluid } from '$lib/index.js';
	import type { ContainerShape } from '$lib/engine/types.js';
	import CopyPageButton from '../components/CopyPageButton.svelte';

	function wordShape(text: string): ContainerShape {
		return {
			type: 'svgPath',
			text,
			font: 'bold 100px "Helvetica Neue", Arial, sans-serif',
			maskResolution: 512
		};
	}

	const pageMarkdown = [
		'# SVELTE FLUID — Text Demo',
		'',
		'Fluid simulation shaped by text glyphs using SVG path container shapes.',
		'',
		'## Usage',
		'',
		'```svelte',
		'<Fluid',
		'  containerShape={{',
		'    type: \'svgPath\',',
		'    text: \'SVELTE\',',
		'    font: \'bold 100px "Helvetica Neue", Arial, sans-serif\',',
		'    maskResolution: 512',
		'  }}',
		'  splatOnHover',
		'  densityDissipation={0.01}',
		'  velocityDissipation={0.01}',
		'  curl={20}',
		'  splatRadius={0.3}',
		'  splatForce={5000}',
		'  shading',
		'  colorful',
		'  bloom={false}',
		'  sunrays={false}',
		'  initialSplatCount={8}',
		'  randomSplatRate={4}',
		'  randomSplatCount={2}',
		'  randomSplatSpread={2}',
		'  randomSplatSwirl={200}',
		'/>',
		'```',
	].join('\n');
</script>

<div class="page">
	<div class="copy-page-wrapper">
		<CopyPageButton content={pageMarkdown} />
	</div>
	<div class="word-wrap">
		<Fluid
			seed={42}
			containerShape={wordShape('SVELTE')}
			splatOnHover
			densityDissipation={0.01}
			velocityDissipation={0.01}
			curl={20}
			splatRadius={0.3}
			splatForce={5000}
			shading
			colorful
			bloom={false}
			sunrays={false}
			backColor={{ r: 0, g: 0, b: 0 }}
			initialSplatCount={8}
			randomSplatRate={4}
			randomSplatCount={2}
			randomSplatSpread={2}
			randomSplatSwirl={200}
			aria-label="SVELTE"
		/>
	</div>
	<div class="word-wrap">
		<Fluid
			seed={99}
			containerShape={wordShape('FLUID')}
			splatOnHover
			densityDissipation={0.01}
			velocityDissipation={0.01}
			curl={20}
			splatRadius={0.3}
			splatForce={5000}
			shading
			colorful
			bloom={false}
			sunrays={false}
			backColor={{ r: 0, g: 0, b: 0 }}
			initialSplatCount={8}
			randomSplatRate={4}
			randomSplatCount={2}
			randomSplatSpread={2}
			randomSplatSwirl={200}
			aria-label="FLUID"
		/>
	</div>
</div>

<style>
	.copy-page-wrapper {
		position: fixed;
		top: 14px;
		right: 14px;
		z-index: 100;
	}
	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: #000;
		gap: 1rem;
		padding: 2rem;
	}
	.word-wrap {
		width: min(90vw, 900px);
		aspect-ratio: 3 / 1;
	}
	@media (min-width: 768px) {
		.page {
			flex-direction: row;
			gap: 0;
		}
		.word-wrap {
			width: 50vw;
			max-width: 550px;
		}
	}
</style>
