#!/usr/bin/env node
//
// Zero plugin — remove the CLI-installed ("zero init") Claude Code integration.
//
// `zero init` (from the CLI installer) writes a skill at ~/.claude/skills/zero, a
// UserPromptSubmit reminder, and a PreToolUse auto-approve hook (both pointing at
// scripts under ~/.zero/hooks/) into the user's ~/.claude. When THIS plugin is also
// installed, those duplicate the plugin's own integration: the reminder fires twice
// and the skill loads twice. Claude Code only de-dupes byte-identical hooks, and the
// CLI's commands point at ~/.zero/hooks/... while the plugin's live in the plugin —
// different strings, so both fire. This removes the CLI-installed copies so the
// plugin's are the only ones left.
//
// Scope + safety:
//   - Only removes the skill dir at ~/.claude/skills/zero and settings.json hook
//     entries whose command references the CLI's own scripts (zero-context /
//     auto-approve-zero). It never touches the plugin's own hooks, other plugins,
//     or installed marketplaces (removing a stale marketplace is `/plugin
//     marketplace remove`, a user action — not this script's job).
//   - Idempotent: rewrites settings.json only when something actually changed.
//   - ALL output goes to stderr; stdout stays empty so the SessionStart JSON
//     contract emitted by ensure-runner.sh is never corrupted.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const home = homedir();
const claudeDir = join(home, ".claude");
const settingsPath = join(claudeDir, "settings.json");

const log = (msg) => process.stderr.write(`[zero] ${msg}\n`);

// True if `entry` (a hooks-array element) contains a command hook whose command
// string includes `needle` — used to spot the CLI's own hook entries.
const entryHasCommand = (entry, needle) => {
	const hooks = entry?.hooks;
	if (!Array.isArray(hooks)) return false;
	return hooks.some(
		(h) => typeof h?.command === "string" && h.command.includes(needle),
	);
};

try {
	// 1. Remove the CLI-installed skill copy — the plugin ships its own.
	const cliSkillDir = join(claudeDir, "skills", "zero");
	if (existsSync(cliSkillDir)) {
		rmSync(cliSkillDir, { recursive: true, force: true });
		log(`removed duplicate CLI-installed skill at ${cliSkillDir}`);
	}

	// Nothing else to do if there's no settings.json — never create one here.
	if (!existsSync(settingsPath)) process.exit(0);

	let settings;
	try {
		settings = JSON.parse(readFileSync(settingsPath, "utf8"));
	} catch {
		log("settings.json is not valid JSON — leaving it untouched");
		process.exit(0);
	}
	if (typeof settings !== "object" || settings === null) {
		log("settings.json is not an object — leaving it untouched");
		process.exit(0);
	}

	let changed = false;
	const hooks = settings.hooks;
	if (hooks && typeof hooks === "object") {
		// 2/3. Drop the CLI's UserPromptSubmit reminder (zero-context.sh) and
		//      PreToolUse auto-approve (auto-approve-zero.sh). Both live under
		//      ~/.zero/hooks; the plugin's equivalents never live in settings.json,
		//      so this only ever hits the CLI copies.
		for (const [event, needle] of [
			["UserPromptSubmit", "zero-context"],
			["PreToolUse", "auto-approve-zero"],
		]) {
			if (!Array.isArray(hooks[event])) continue;
			const before = hooks[event].length;
			hooks[event] = hooks[event].filter((e) => !entryHasCommand(e, needle));
			if (hooks[event].length !== before) {
				changed = true;
				log(`removed duplicate CLI ${event} entry (${needle}) from settings.json`);
			}
			if (hooks[event].length === 0) delete hooks[event];
		}
		if (Object.keys(hooks).length === 0) delete settings.hooks;
	}

	if (changed) {
		writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
	}
} catch (err) {
	log(`de-dupe skipped: ${err?.message ?? String(err)}`);
}
process.exit(0);
