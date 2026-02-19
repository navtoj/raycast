#!/usr/bin/env -S deno run --allow-all --no-lock
// sudo ln -vs /Users/$USER/.deno/bin/deno /usr/local/bin/deno

// Required parameters:
// @raycast.schemaVersion 1
// @raycast.title Screenshot
// @raycast.mode silent

// Optional parameters:
// @raycast.icon 📸
// @raycast.packageName Global
// @raycast.argument1 {"type":"dropdown","placeholder":"Storage","data":[{"title":"Clipboard","value":"Clipboard"},{"title":"Screenshots","value":"Screenshots"}]}

// Documentation:
// @raycast.author Navtoj Chahal
// @raycast.authorURL https://www.github.com/navtoj
// @raycast.description Take a combined screenshot of all displays.

// deno-lint-ignore-file no-import-prefix
import { $ } from 'jsr:@david/dax@0.45.0';
import { dirname, join } from 'jsr:@std/path@1.1.4/posix';
import * as z from 'jsr:@zod/zod@4.3.6';
import { format } from 'npm:date-fns@4.1.0';

function Exit1(...data: unknown[]) {
	console.error(...data);
	Deno.exit(1);
}

const displayplacerExists = await $.commandExists('displayplacer');
if (!displayplacerExists) Exit1('command not found: displayplacer');

// get displayplacer list
const displayplacerList = await $`displayplacer list | tail -n 1`.text();
console.debug(displayplacerList);

// parse displayplacer list
const regex =
	/"id:(?<id>[A-Z\d-]+) res:(?<res_width>\d+)x(?<res_height>\d+) hz:(?<hz>\d+) color_depth:(?<color_depth>\d+) enabled:(?<enabled>true|false) scaling:(?<scaling>on|off) origin:\((?<origin_x>-?\d+),(?<origin_y>-?\d+)\) degree:(?<degree>\d+)"/g;
const matches = displayplacerList.matchAll(regex);
const groups = [...matches].map((m) => m.groups);

const Display = z
	.object({
		id: z.string(),
		res_width: z.coerce.number(),
		res_height: z.coerce.number(),
		hz: z.coerce.number(),
		color_depth: z.coerce.number(),
		enabled: z.stringbool(),
		scaling: z.stringbool(),
		origin_x: z.coerce.number(),
		origin_y: z.coerce.number(),
		degree: z.coerce.number(),
	})
	.transform((d) => {
		const { res_width, res_height, origin_x, origin_y, ...rest } = d;
		return {
			res: {
				width: res_width,
				height: res_height,
			},
			origin: {
				x: origin_x,
				y: origin_y,
			},
			...rest,
		};
	});
const displays = Display.array().parse(groups);
console.debug(displays);

// get bounding box of all displays
const boundingBox = displays.reduce(
	(box, { origin, res }) => ({
		left: Math.min(box.left, origin.x),
		top: Math.min(box.top, origin.y),
		right: Math.max(box.right, origin.x + res.width),
		bottom: Math.max(box.bottom, origin.y + res.height),
	}),
	{
		left: Infinity,
		top: Infinity,
		right: -Infinity,
		bottom: -Infinity,
	},
);
console.debug(boundingBox);

// take screenshot of bounding box
const { left: x, top: y, right, bottom } = boundingBox;
const rectangle = `${x},${y},${right - x},${bottom - y}`;
const fileExtension = 'png';
const params = [['-t', fileExtension], ['-R', rectangle], '-c'].flat();

/** https://ss64.com/mac/screencapture.html */
async function screenshot(args: string[]): Promise<never> {
	if (!args.length) throw new Error('No arguments provided.');
	const code = await $`screencapture ${$.rawArg(args)}`.printCommand().code();
	if (code === 0)
		console.debug(
			args.at(-1) === params.at(-1)
				? `~/Library/Caches/com.raycast.macos/Clipboard`
				: dirname(args.at(-1)!),
		);
	Deno.exit(code);
}
if (Deno.args.at(0) === 'Clipboard') await screenshot(params);

const filename = format(new Date(), "'Screenshot' yyyy-MM-dd 'at' h.mm.ss a");
const basename = `${filename}.${fileExtension}`;
const fileDir = await $`defaults read com.apple.screencapture location`
	.noThrow()
	.text();
if (!fileDir) Exit1('Screenshot location not found.');

const filePath = join(fileDir.trim(), basename).replaceAll(' ', '\\ ');
await screenshot(params.toSpliced(-1, 1, filePath));
