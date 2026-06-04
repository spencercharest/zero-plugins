#!/usr/bin/env node
//
// Zero plugin — remove the CLI-installed ("zero init") integration for the CURRENT
// host agent only (agent-scoped de-dupe).
//
// `zero init` copies a skill per agent and (for Claude Code only) registers hooks:
//   Claude Code -> ~/.claude/skills/zero          + ~/.claude/settings.json hooks
//   Codex       -> ~/.agents/skills/zero          (the SHARED cross-tool skills dir)
//   Cursor      -> ~/.cursor/skills/zero
//   OpenCode    -> ~/.config/opencode/skills/zero
// plus shared ~/.zero/{config.json (the wallet), hooks/*.sh}.
//
// When this plugin is installed it provides the same integration, so the CLI copy
// duplicates it. We remove ONLY the current host agent's OWN, agent-specific copy:
//   - Claude Code: ~/.claude/skills/zero + the zero hook entries in settings.json.
//   - Codex: nothing — Codex's CLI skill lives in the SHARED ~/.agents/skills/zero,
//     which Warp / Copilot / Replit / Kiro CLI also read; removing it would break
//     those plugin-less tools, so it is intentionally left in place. (A duplicate
//     skill is harmless: identical instructions, no double-firing side effects.)
// We never touch the shared ~/.agents dir, OpenCode, other agents, other plugins,
// or the wallet (~/.zero/config.json). Cursor cleanup will arrive with the Cursor
// hook port (a Cursor session removing ~/.cursor/skills/zero).
//
// Host detection: Codex sets the neutral PLUGIN_ROOT (alongside CLAUDE_PLUGIN_ROOT,
// which it also sets for compatibility); Claude Code sets only CLAUDE_PLUGIN_ROOT.
// So a present PLUGIN_ROOT => Codex. Misdetection fails safe (we just skip).
//
// Conservative + idempotent: only removes entries referencing the CLI's own scripts
// (zero-context / auto-approve-zero), rewrites settings.json only on change. ALL
// output -> stderr so the SessionStart JSON from ensure-runner.sh is never corrupted.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const home = homedir();
const log = (msg) => process.stderr.write(`[zero] ${msg}\n`);

// PLUGIN_ROOT (neutral) present => Codex; otherwise treat the host as Claude Code.
const host = process.env.PLUGIN_ROOT ? "codex" : "claude";

// True if `entry` (a hooks-array element) has a command hook whose command string
// includes `needle` — used to spot the CLI's own hook entries.
const entryHasCommand = (entry, needle) => {
	const hooks = entry?.hooks;
	if (!Array.isArray(hooks)) return false;
	return hooks.some(
		(h) => typeof h?.command === "string" && h.command.includes(needle),
	);
};

try {
	if (host !== "claude") {
		// Codex (and any other non-Claude host that runs this hook): the CLI skill is
		// in the shared ~/.agents/skills/zero, deliberately left in place. No-op.
		log(`de-dupe: host is ${host}; no agent-specific CLI artifacts to remove`);
		process.exit(0);
	}

	const claudeDir = join(home, ".claude");
	const settingsPath = join(claudeDir, "settings.json");

	// 1. Remove the CLI-installed skill copy — the plugin ships its own (the plugin's
	//    skill lives in the plugin cache, a different directory, so this never hits it).
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
		// 2/3. Drop the CLI's UserPromptSubmit reminder (zero-context.sh) and PreToolUse
		//      auto-approve (auto-approve-zero.sh). Both live under ~/.zero/hooks; the
		//      plugin's equivalents never live in settings.json, so this only ever hits
		//      the CLI copies.
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
