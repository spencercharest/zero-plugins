# zero-plugins

Official [Zero](https://zero.xyz) agent plugins. Zero is a search engine and payment
layer for AI agents: discover external paid capabilities (x402 / MPP) — image, video,
audio, web scraping, real-time data, messaging, and more — call them, and pay per use
with a wallet. No per-service signup.

This repo is a **cross-agent plugin marketplace**. The same plugin tree publishes to
**Claude Code**, **OpenAI Codex**, **Cursor**, and **Gemini CLI**; each platform reads its
own manifest while sharing one set of components.

## Layout

```
zero-plugins/
├── .claude-plugin/marketplace.json     # Claude Code marketplace catalog
├── .agents/plugins/marketplace.json    # Codex marketplace catalog
├── .cursor-plugin/marketplace.json     # Cursor marketplace catalog
└── plugins/zero/                       # the "zero" plugin (shared across all)
    ├── .claude-plugin/plugin.json      #   Claude Code manifest
    ├── .codex-plugin/plugin.json       #   Codex manifest
    ├── .cursor-plugin/plugin.json      #   Cursor manifest
    ├── gemini-extension.json           #   Gemini CLI manifest
    ├── .mcp.json                       #   Zero MCP connector
    ├── hooks/hooks.json                #   SessionStart wiring (Claude Code + Codex)
    ├── hooks/ensure-runner.sh          #   provisions the runner
    └── skills/zero/SKILL.md            #   the zero skill
```

A single plugin directory carries one manifest per platform (`.claude-plugin/`,
`.codex-plugin/`, `.cursor-plugin/`, `gemini-extension.json`). Each agent reads only its
own manifest and ignores the others, so the skill and MCP connector are authored once and
shared. The Claude Code and Codex manifests and Cursor's `mcpServers` field all resolve to
the same `.mcp.json`; Gemini requires its connector declared inline, so the
`api.zero.xyz/v1/mcp` URL also appears in `gemini-extension.json`.

## Install

**Claude Code:**

```bash
/plugin marketplace add spencercharest/zero-plugins
/plugin install zero@zero-plugins
```

**OpenAI Codex:**

```
/plugins
# add this repo as a marketplace source, then install "zero"
```

**Cursor:**

```
/add-plugin
# add this repo as a marketplace source (.cursor-plugin/marketplace.json), then install "zero"
```

**Gemini CLI:**

```bash
git clone https://github.com/spencercharest/zero-plugins
gemini extensions install --path=zero-plugins/plugins/zero
```

Gemini installs an extension from the directory holding its `gemini-extension.json`. From
this monorepo, use the local `--path` form above. (Gemini's git-URL installer
(`gemini extensions install <url>`) expects the manifest at a repo root, so gallery/Git
distribution would need a dedicated repo or a release branch — a later step.)

## The `zero` plugin

`plugins/zero/` bundles the Zero integration:

| Component | File | Purpose |
|---|---|---|
| **Skill** | `skills/zero/SKILL.md` | Teaches the agent the search → inspect → call → review loop. |
| **MCP connector** | `.mcp.json` | The Zero connector — exposes a single tool, `mint_runner_session`, which hands the runner a short-lived credential. Auth is OAuth, handled by the host. |
| **SessionStart hook** | `hooks/ensure-runner.sh` | Provisions the runner (system Node, or a one-time per-platform Node download) plus the version-pinned `zero.mjs`, and exports `$ZERO_RUNNER`. Wired for Claude Code + Codex. |

All work runs through a **local runner** — Node plus the bundled `zero.mjs`. On Claude Code
and Codex the SessionStart hook provisions it automatically; elsewhere the skill bootstraps
it on demand. The connector exists only to make authentication painless on fresh devices and
online sandboxes where you can't save a login — you authorize it once and mint a per-task
session instead of persisting wallet keys. An environment with no runner and no egress to
fetch one can't run Zero.

### The runner hook

`hooks/ensure-runner.sh` (SessionStart; Claude Code + Codex, which share the hook format and
both set `$CLAUDE_PLUGIN_ROOT`) provisions the runner and exports `$ZERO_RUNNER`:

- **Node** — uses a system `node` (≥ v20) if present, downloading nothing; otherwise fetches
  an official build **once** into `$CLAUDE_PLUGIN_DATA` (Windows: signed `node.exe`;
  macOS/Linux: `.tar.gz` + extract behind a stable `current` symlink) and reuses it on every
  later session.
- **Runner bundle** — fetches `zero.mjs` from a **major channel** derived from this plugin's
  manifest version: `releases.zero.xyz/latest-v<major>/zero.mjs`. Patches and minors within
  the major auto-update via a throttled conditional GET; a new major only takes effect when
  the manifest is bumped to it.
- Everything lands under `$CLAUDE_PLUGIN_DATA` (persists across plugin updates, removed on
  uninstall), falling back to `~/.zero` when unset.

> **Release-pipeline requirement:** the channel `releases.zero.xyz/latest-v<major>/zero.mjs`
> must be published by the runner release pipeline. Today only `latest/` and exact `v<tag>/`
> paths exist — until `latest-v<major>/` is served, point the hook at the floating channel
> with `ZERO_RUNNER_CHANNEL=latest`.

| Env override | Default | Purpose |
|---|---|---|
| `ZERO_RUNNER_CHANNEL` | `latest-v<major>` | Runner bundle channel segment. |
| `ZERO_BIN_BASE` | `https://releases.zero.xyz` | Base URL for the `zero.mjs` bundle. |
| `ZERO_NODE_MIN_MAJOR` | `20` | A system `node` older than this triggers a download. |
| `ZERO_NODE_CHANNEL` | `latest-v24.x` | Official Node release line to download when needed. |
| `ZERO_RUNNER_REFRESH_TTL_MIN` | `1440` | Minutes between bundle update re-checks. |
