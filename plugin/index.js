import { tool } from "@opencode-ai/plugin";
import { openSync, readSync, closeSync } from "node:fs";
import { KeyStore, SecretScrubber } from "./store.js";
import { scan } from "./rules.js";
const store = new KeyStore();
const scrubber = new SecretScrubber(store);
async function redactParts(parts) {
    if (!parts)
        return;
    for (const part of parts) {
        if (!part || typeof part !== "object")
            continue;
        const p = part;
        if (p.type !== "text" || typeof p.text !== "string")
            continue;
        const found = await scan(p.text);
        for (const m of found) {
            store.set(m.rule.env, m.rule.name, m.value);
            const mask = `[KEY ${m.rule.env} stored]`;
            p.text = p.text.slice(0, m.start) + mask + p.text.slice(m.end);
        }
    }
}
function envSnapshot() {
    const env = {};
    for (const key of store.all())
        env[key.env] = key.value;
    return env;
}
function scrubOutput(text) {
    return scrubber.scrub(text).text;
}
function bashCommandLeak(cmd) {
    const names = store.all().map((k) => k.env);
    if (!names.length)
        return false;
    if (!/echo|printf|cat/.test(cmd))
        return false;
    const leakRe = new RegExp(`\\b(${names.join("|")})\\b|\\$\\{?${names.join("|")}\\}?`, "i");
    return leakRe.test(cmd);
}
function readValueFromTTY(prompt) {
    let fd = null;
    try {
        fd = openSync("/dev/tty", "r");
        process.stdout.write(prompt);
        const buf = Buffer.alloc(16384);
        const n = readSync(fd, buf, 0, buf.length, null);
        return buf.subarray(0, n).toString("utf8").replace(/\r?\n$/, "");
    }
    catch {
        return null;
    }
    finally {
        if (fd !== null)
            closeSync(fd);
    }
}
const keyTool = tool({
    description: [
        "Manage keys stored by the plugin. The plugin auto-captures keys pasted in chat and stores them",
        "in a 0600 vault; the model never receives raw values. Use this tool to orchestrate them.",
        "",
        "Actions:",
        "- `to-file <path>`: writes ALL stored keys as ENV=value lines into a .env-style file, deduping",
        "  existing entries. The plugin reads values from the vault and writes the file itself — the",
        "  values never get returned to the model. Returns the env var names written, not values.",
        "- `list`: env var names of every stored key (no values).",
        "- `get <env_name>`: whether a key is set, and the last 4 chars of its value.",
        "- `rm <env_name>`: remove from the vault.",
        "- `set <env_name>`: store a value read interactively from the user's terminal (their keystrokes",
        "  never pass through the model context).",
    ].join("\n"),
    args: {
        action: tool.schema.enum(["to-file", "list", "get", "set", "rm"]),
        env_name: tool.schema.string().optional().describe("Full env var name, e.g. ANTHROPIC_API_KEY"),
        path: tool.schema.string().optional().describe("Filesystem path for to-file, e.g. ./.env or ./secrets.env"),
    },
    async execute(args) {
        const { action, env_name, path } = args;
        const list = () => store.all().map((k) => `${k.env} (${k.name})`).join("\n") || "(nothing stored)";
        switch (action) {
            case "to-file":
                if (!path)
                    return "specify a path, e.g. ./.env";
                {
                    const written = store.appendEnvFile(path);
                    return written.length
                        ? `wrote ${written.map((k) => k.env).join(", ")} to ${path}`
                        : "(nothing stored to write)";
                }
            case "list":
                return list();
            case "get":
                if (!env_name)
                    return 'specify "env_name"';
                {
                    const k = store.get(env_name);
                    if (!k)
                        return `${env_name}: not set`;
                    return `${k.env}: stored as ${k.name}, value ends in ...${k.value.slice(-4)}`;
                }
            case "rm":
                if (!env_name)
                    return 'specify "env_name"';
                return store.delete(env_name) ? `removed ${env_name}` : `${env_name}: not set`;
            case "set": {
                if (!env_name)
                    return 'specify "env_name"';
                const value = readValueFromTTY(`Paste value for ${env_name} (enter to cancel): `);
                if (!value)
                    return `${env_name}: set cancelled`;
                store.set(env_name, env_name, value);
                return `${env_name}: stored`;
            }
            default:
                return "unknown action, use to-file|list|get|set|rm";
        }
    },
});
export const KeyPlugin = async () => {
    return {
        tool: {
            key: keyTool,
        },
        "experimental.chat.messages.transform": async (_input, output) => {
            for (const msg of output.messages)
                await redactParts(msg.parts);
        },
        "shell.env": async (_input, output) => {
            for (const [env, value] of Object.entries(envSnapshot())) {
                if (!output.env[env])
                    output.env[env] = value;
            }
        },
        "tool.execute.after": async (_input, output) => {
            output.output = scrubOutput(output.output);
        },
        "tool.execute.before": async (input, output) => {
            if (input.tool === "bash" && typeof output.args?.command === "string") {
                if (bashCommandLeak(output.args.command)) {
                    throw new Error("Refusing bash command that would print a stored key value");
                }
            }
        },
    };
};
export default KeyPlugin;
