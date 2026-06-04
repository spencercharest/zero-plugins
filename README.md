# zero-plugins

Official [Zero](https://zero.xyz) agent plugins. Zero is a search engine and payment
layer for AI agents: discover external paid capabilities (x402 / MPP) — image, video,
audio, web scraping, real-time data, messaging, and more — call them, and pay per use
with a wallet. No per-service signup.

This repo is a **cross-agent plugin marketplace**. The same plugin tree publishes to
**Claude Code**, **OpenAI Codex**, and **Cursor**; each platform reads its own manifest
and marketplace catalog while sharing one set of components.

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
    ├── .mcp.json                       #   Zero MCP connector
    └── skills/zero/SKILL.md            #   the zero skill
```

A single plugin directory carries one manifest per platform (`.claude-plugin/`,
`.codex-plugin/`, `.cursor-plugin/`). Each agent reads only its own manifest and ignores
the others, so the skill, MCP connector, and hooks are authored once and shared. Cursor's
manifest points `mcpServers` at the same `.mcp.json` the others use.

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

## The `zero` plugin

`plugins/zero/` bundles the Zero integration:

| Component | File | Purpose |
|---|---|---|
| **Skill** | `skills/zero/SKILL.md` | Teaches the agent the search → inspect → call → review loop. |
| **MCP connector** | `.mcp.json` | The Zero connector — exposes a single tool, `mint_runner_session`, which hands the runner a short-lived credential. Auth is OAuth, handled by the host. |

All work runs through a **local runner** (Node + the bundled `zero.mjs`, or a `zero`
binary on PATH); the connector exists only to make authentication painless on fresh
devices and online sandboxes where you can't save a login — you authorize it once and
mint a per-task session instead of persisting wallet keys. An environment with no runner
and no egress to fetch one can't run Zero. (The runner-provisioning SessionStart hook is
a planned addition; until then, the skill bootstraps the runner itself.)
