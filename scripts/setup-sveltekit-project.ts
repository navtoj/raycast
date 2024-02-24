#!/usr/bin/env deno run --allow-env --allow-read --allow-write --allow-run

import { critical, error } from 'https://deno.land/std@0.175.0/log/mod.ts';
import { getPathInfo, subprocess } from 'https://deno.land/x/scripting@0.0.9/mod.ts';

// Colors: https://github.com/raycast/script-commands/blob/master/documentation/OUTPUTMODES.md#other-colors
// Arguments: https://github.com/raycast/script-commands/blob/master/documentation/ARGUMENTS.md

// Documentation:
// @raycast.description Setup a newly created SvelteKit project folder.
// @raycast.author Navtoj Chahal
// @raycast.authorURL https://github.com/navtoj

// Required parameters:
// @raycast.schemaVersion 1
//// @raycast.title Setup SvelteKit Project
// @raycast.mode fullOutput

// Optional parameters:
// @raycast.icon 📁
// @raycast.packageName Developer Utils
// @raycast.argument1 { "type": "text", "placeholder": "directory", "optional": true }
// @raycast.argument2 { "type": "text", "placeholder": "open vs code (y)", "optional": true }
// @raycast.argument3 { "type": "text", "placeholder": "setup testing (y)", "optional": true }

// exit if HOME env variable is not set
if (!Deno.env.get('HOME')) {
	critical('HOME environment variable is not set.');
	Deno.exit(1);
}
// exit if NPM is not available
const npmVersion = await subprocess(['npm', '--version'], { cwd: Deno.env.get('HOME')! });
if (npmVersion.error) {
	critical('NPM not found.');
	Deno.exit(1);
}

// CONSTANTS
const npmFlags = ['--no-fund', '--loglevel=error', '--no-audit'];

// CONFIGURE OPTIONS
const name = Deno.args.at(0) || 'sveltekit';
const directory = Deno.env.get('HOME') + '/Developer/' + name;
const openVsCode = Deno.args.at(1) === 'n' ? false : true;
const setupTesting = Deno.args.at(2) === 'n' ? false : true;
const optional = {
	eslint: true,
	prettier: true,
	playwright: setupTesting,
	vitest: setupTesting,
	tailwindCSS: true,
	tailwindPlugins: true,
	localhostHttps: true,
};

// CHECK PROJECT DIRECTORY
const projectDir = await getPathInfo(directory);
if (!projectDir?.isDirectory) {
	error('Path is not a directory.');
	Deno.exit(1);
}

// INSTALL DEPENDENCIES
if (Deno.args.at(0) !== '') {
	const installDeps = await subprocess(['npm', 'install', ...npmFlags], {
		cwd: directory,
	});
	if (installDeps.output) console.log(installDeps.output);
	if (installDeps.error) console.log(installDeps.error);
}

// CREATE robots.txt IF IT DOESN'T EXIST IN /static
if (!(await getPathInfo(directory + '/static/robots.txt'))?.isFile) {
	await Deno.writeTextFile(
		directory + '/static/robots.txt',
		[
			'# https://developers.google.com/search/docs/advanced/robots/create-robots-txt#useful-robots.txt-rules',
			'User-agent: *',
			'Disallow: /',
			'User-agent: AdsBot-Google',
			'Disallow: /',
		].join('\n')
	);
}

// ADD HTML HEAD TAGS: theme, robots
const srcAppHtml = await Deno.readTextFile(directory + '/src/app.html');
// exit if %sveltekit.head% is not found in /src/app.html
if (!srcAppHtml.includes('%sveltekit.head%')) {
	critical('%sveltekit.head% not found in /src/app.html');
	Deno.exit(1);
}
// get indentation of %sveltekit.head% in /src/app.html
const srcAppHtmlIndent = srcAppHtml
	.split('\n')
	.find(line => line.includes('%sveltekit.head%'))
	?.replace('%sveltekit.head%', '');
// add meta robots tags to /src/app.html
const srcAppHtmlEdited = srcAppHtml.replace(
	'%sveltekit.head%',
	[
		`<meta name='color-scheme' content='light dark' />`,
		`<meta name='robots' content='none' />`,
		`<meta name='AdsBot-Google' content='none' />`,
		``,
		`%sveltekit.head%`,
	].join('\n' + srcAppHtmlIndent)
);
await Deno.writeTextFile(directory + '/src/app.html', srcAppHtmlEdited); // https://developers.google.com/search/docs/crawling-indexing/robots/create-robots-txt#create_rules

// ADD +PAGE.SVELTE HEAD TAGS: title, description
const srcRoutesRootPage = await Deno.readTextFile(directory + '/src/routes/+page.svelte');
// add svelte:head tags to /src/routes/+page.svelte
const srcRoutesRootPageEdited = [
	'<svelte:head>',
	`	<title>${name}</title>`,
	`	<meta name='description' content='${name}' />`,
	'</svelte:head>',
	'',
	srcRoutesRootPage,
].join('\n');
await Deno.writeTextFile(directory + '/src/routes/+page.svelte', srcRoutesRootPageEdited);

// TAILWIND CSS
if (optional.tailwindCSS) {
	// base packages
	const basePackages = ['tailwindcss', 'postcss', 'autoprefixer'];
	// official plugins
	const officialPlugins = [
		'@tailwindcss/aspect-ratio',
		'@tailwindcss/forms',
		'@tailwindcss/line-clamp',
		'@tailwindcss/typography',
	];
	// install dependencies
	const installDeps = await subprocess(
		[
			'npm',
			'install',
			...npmFlags,
			'--save-dev',
			...basePackages,
			...(optional.tailwindPlugins ? officialPlugins : []),
		],
		{ cwd: directory }
	);
	if (installDeps.output) console.log(installDeps.output);
	if (installDeps.error) console.log(installDeps.error);
	// add prettier-plugin-tailwindcss
	if (optional.prettier) {
		const installPrettierTailwind = await subprocess(
			['npm', 'install', ...npmFlags, '--save-dev', 'prettier-plugin-tailwindcss'],
			{ cwd: directory }
		);
		if (installPrettierTailwind.output) console.log(installPrettierTailwind.output);
		if (installPrettierTailwind.error) console.log(installPrettierTailwind.error);
		// add plugin to .prettierrc
		const prettierRC = await Deno.readTextFile(directory + '/.prettierrc');
		const prettierRCEdited = prettierRC.replace(
			'"prettier-plugin-svelte"',
			'"prettier-plugin-svelte", "prettier-plugin-tailwindcss"'
		);
		await Deno.writeTextFile(directory + '/.prettierrc', prettierRCEdited);
	}
	// generate config files
	const initTailwind = await subprocess(['npx', 'tailwindcss', 'init', 'tailwind.config.cjs', '--postcss'], {
		cwd: directory,
	});
	if (initTailwind.output) console.log(initTailwind.output);
	if (initTailwind.error) console.log(initTailwind.error);
	// enable use of PostCSS in <style> blocks
	// https://github.com/tailwindlabs/tailwindcss.com/pull/1462#issue-1499046629
	//
	// configure template paths
	const tailwindConfigCJS = await Deno.readTextFile(directory + '/tailwind.config.cjs');
	// get indentation of content: [], in /tailwind.config.cjs
	const tailwindConfigCJsIndent = tailwindConfigCJS
		.split('\n')
		.find(line => line.includes('content: [],'))
		?.replace('content: [],', '');
	// add all template paths to /tailwind.config.cjs
	let tailwindConfigCJsEdited = tailwindConfigCJS.replace(
		'content: [],',
		[
			'content: [',
			['./src/**/*.{html,js,svelte,ts}']
				.map(path => `${tailwindConfigCJsIndent}'${path}'`)
				.join(',\n' + tailwindConfigCJsIndent),
			'],',
		].join('\n' + tailwindConfigCJsIndent)
	);
	// add plugins to /tailwind.config.cjs
	if (optional.tailwindPlugins)
		tailwindConfigCJsEdited = tailwindConfigCJsEdited.replace(
			'plugins: [],',
			[
				'plugins: [',
				officialPlugins
					.map(plugin => `${tailwindConfigCJsIndent}require('${plugin}'),`)
					.join('\n' + tailwindConfigCJsIndent),
				'],',
			].join('\n' + tailwindConfigCJsIndent)
		);
	// update /tailwind.config.cjs
	await Deno.writeTextFile(directory + '/tailwind.config.cjs', tailwindConfigCJsEdited);
	// create a ./src/app.css file and add the @tailwind directives for each of Tailwind’s layers.
	const tailwindDirectives = ['@tailwind base;', '@tailwind components;', '@tailwind utilities;'];
	const appCSS = ['html,', 'body,', 'body > div {', '	@apply h-full;', '}'];
	await Deno.writeTextFile(directory + '/src/app.css', [...tailwindDirectives, '', ...appCSS].join('\n'));
	// CREATE ROOT +LAYOUT.SVELTE and import the newly-created app.css file.
	await Deno.writeTextFile(
		directory + '/src/routes/+layout.svelte',
		[
			'<script lang="ts">',
			'	import "../app.css";',
			'</script>',
			'',
			'<div class="flex flex-col h-full">',
			'	<slot />',
			'</div>',
		].join('\n')
	);
	// CREATE ROOT +ERROR.SVELTE
	const srcRoutesRootError = [
		'<script lang="ts">',
		`	import { page } from '$app/stores';`,
		'</script>',
		'',
		'<svelte:head>',
		'	<title>{$page.status} Error</title>',
		'</svelte:head>',
		'',
		'<div class="grid grow place-content-center">',
		'	<div',
		'		class="flex max-w-xs flex-col items-center gap-y-4"',
		'	>',
		'		<h1 class="text-9xl font-bold tracking-widest">{$page.status}</h1>',
		'		<p class="font-medium">{$page.error?.message}</p>',
		'	</div>',
		'</div>',
	].join('\n');
	await Deno.writeTextFile(directory + '/src/routes/+error.svelte', srcRoutesRootError);
}

// SETUP VITE ALONGSIDE PLAYWRIGHT
if (optional.vitest && optional.playwright) {
	// CONFIGURE vite.config.ts
	// get vite.config.ts
	const viteConfig = await Deno.readTextFile(directory + '/vite.config.ts');
	// get indentation of 'test: {' line
	const viteConfigIndent = viteConfig
		.split('\n')
		.find(line => line.trim().startsWith('test: {'))
		?.trimEnd()
		.replace('test: {', '');
	// exclude 'tests' from vitest
	const viteConfigEdited = viteConfig.replace(
		'test: {',
		['test: {', `	exclude: ['tests'],`].join('\n' + viteConfigIndent)
	);
	// update vite.config.ts
	await Deno.writeTextFile(directory + '/vite.config.ts', viteConfigEdited);
	// CONFIGURE package.json
	// get package.json
	const packageJSON = await Deno.readTextFile(directory + '/package.json');
	// disable watch mode
	const packageJSONEdited = packageJSON.replace(`"test:unit": "vitest",`, `"test:unit": "vitest run",`);
	// update package.json
	await Deno.writeTextFile(directory + '/package.json', packageJSONEdited);
}

// LOCALHOST HTTPS SERVER
if (optional.localhostHttps) {
	// install vite-plugin-mkcert
	const installVitePluginMkcert = await subprocess(
		['npm', 'install', ...npmFlags, 'vite-plugin-mkcert', '--save-dev'],
		{ cwd: directory }
	);
	if (installVitePluginMkcert.output) console.log(installVitePluginMkcert.output);
	if (installVitePluginMkcert.error) console.log(installVitePluginMkcert.error);
	// get vite.config.ts
	const viteConfig = await Deno.readTextFile(directory + '/vite.config.ts');
	// split vite config into lines
	const viteConfigLines = viteConfig.split('\n');
	// find index of line starting with 'const config'
	const viteConfigObjIndex = viteConfigLines.findIndex(line => line.trim().startsWith('const config'));
	// error if const config not found
	if (viteConfigObjIndex === -1) {
		critical('Error: "const config" not found in vite.config.ts');
		Deno.exit(1);
	}
	// find index of line starting with 'plugins: ['
	const viteConfigPluginsIndex = viteConfigLines.findIndex(line => line.trim().startsWith('plugins: [sveltekit()'));
	// error if plugins: [ not found
	if (viteConfigPluginsIndex === -1) {
		critical('Error: "plugins: [sveltekit()" not found in vite.config.ts');
		Deno.exit(1);
	}
	// add mkcert plugin
	const viteConfigEdited = [
		`import mkcert from 'vite-plugin-mkcert';`,
		...viteConfigLines.slice(0, viteConfigObjIndex),
		viteConfigLines.at(viteConfigObjIndex)!.replace('{', ['{', '	server: {', '		https: true,', '	},'].join('\n')),
		...viteConfigLines.slice(viteConfigObjIndex + 1, viteConfigPluginsIndex),
		viteConfigLines.at(viteConfigPluginsIndex)!.replace(']', ', mkcert()]'),
		...viteConfigLines.slice(viteConfigPluginsIndex + 1),
	].join('\n');
	// update vite.config.ts
	await Deno.writeTextFile(directory + '/vite.config.ts', viteConfigEdited);
	// update playwright config
	if (optional.playwright) {
		// get playwright.config.ts
		const playwrightConfig = await Deno.readTextFile(directory + '/playwright.config.ts');
		// split playwright config into lines
		const playwrightConfigLines = playwrightConfig.split('\n');
		// find index of line starting with 'const config'
		const playwrightConfigObjIndex = playwrightConfigLines.findIndex(line =>
			line.trim().startsWith('const config')
		);
		// error if const config not found
		if (playwrightConfigObjIndex === -1) {
			critical('Error: "const config" not found in playwright.config.ts');
			Deno.exit(1);
		}
		// add https base url
		const playwrightConfigEdited = [
			...playwrightConfigLines.slice(0, playwrightConfigObjIndex),
			playwrightConfigLines
				.at(playwrightConfigObjIndex)!
				.replace('{', ['{', '	use: {', `		baseURL: 'https://localhost:4173'`, '	},'].join('\n')),
			...playwrightConfigLines.slice(playwrightConfigObjIndex + 1),
		].join('\n');
		// update playwright.config.ts
		await Deno.writeTextFile(directory + '/playwright.config.ts', playwrightConfigEdited);
	}
}

// CLEAN NODE_MODULES
const deleteNodeModules = await subprocess(['rm', '-rf', 'node_modules'], {
	cwd: directory,
});
if (deleteNodeModules.output) console.log(deleteNodeModules.output);
if (deleteNodeModules.error) console.log(deleteNodeModules.error);
// install node modules
const installNodeModules = await subprocess(['npm', 'install', ...npmFlags], {
	cwd: directory,
});
if (installNodeModules.output) console.log(installNodeModules.output);
if (installNodeModules.error) console.log(installNodeModules.error);

// OPEN VS CODE or FILE MANAGER
const openVSCodeOrFileManager = await subprocess([openVsCode ? 'code' : 'open', '.'], {
	cwd: directory,
});
if (openVSCodeOrFileManager.output) console.log(openVSCodeOrFileManager.output);
if (openVSCodeOrFileManager.error) console.log(openVSCodeOrFileManager.error);
