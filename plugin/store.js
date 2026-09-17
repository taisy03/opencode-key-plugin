import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
const DEFAULT_FILE = join(homedir(), ".config", "opencode", "key-store.json");
export class KeyStore {
    file;
    map = new Map();
    constructor(file = process.env.OPENCODE_KEY_STORE ?? DEFAULT_FILE) {
        this.file = file;
        this.load();
    }
    load() {
        if (!existsSync(this.file))
            return;
        try {
            const data = JSON.parse(readFileSync(this.file, "utf8"));
            for (const item of Array.isArray(data) ? data : []) {
                if (item?.env && item?.value)
                    this.map.set(item.env, item);
            }
        }
        catch {
            this.map.clear();
        }
    }
    save() {
        mkdirSync(dirname(this.file), { recursive: true });
        writeFileSync(this.file, JSON.stringify([...this.map.values()], null, 2), { mode: 0o600 });
        chmodSync(this.file, 0o600);
    }
    set(env, name, value) {
        this.map.set(env, { env, name, value, createdAt: Date.now() });
        this.save();
    }
    get(env) {
        return this.map.get(env);
    }
    delete(env) {
        const removed = this.map.delete(env);
        if (removed)
            this.save();
        return removed;
    }
    all() {
        return [...this.map.values()];
    }
    setAll(from) {
        for (const item of from)
            if (item?.env && item?.value)
                this.map.set(item.env, item);
        this.save();
    }
    appendEnvFile(envFilePath) {
        const keys = this.map.values();
        const added = [];
        const rows = [];
        for (const key of keys) {
            rows.push(`${key.env}=${quoteEnv(key.value)}`);
            added.push(key);
        }
        if (!rows.length)
            return added;
        const abs = resolve(envFilePath);
        let body = "";
        if (existsSync(abs))
            body = readFileSync(abs, "utf8");
        const lines = body ? body.replace(/\r\n/g, "\n").split("\n") : [];
        const out = lines.filter((l) => {
            const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
            return !m || !this.map.has(m[1]);
        });
        if (out.length && out[out.length - 1].trim())
            out.push("");
        out.push(...rows);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, out.join("\n"), { mode: 0o600 });
        chmodSync(abs, 0o600);
        return added;
    }
}
function quoteEnv(value) {
    if (/[\s#"']/.test(value)) {
        return `'${value.replace(/'/g, "'\\''")}'`;
    }
    return value;
}
export class SecretScrubber {
    store;
    constructor(store) {
        this.store = store;
    }
    scrub(text) {
        const found = [];
        let out = text;
        for (const key of this.store.all()) {
            if (!key.value)
                continue;
            const occurrences = countOccurrences(out, key.value);
            if (occurrences > 0) {
                found.push(key);
                out = out.split(key.value).join(`[REDACTED ${key.env}]`);
            }
        }
        return { text: out, found };
    }
}
function countOccurrences(haystack, needle) {
    if (!needle)
        return 0;
    let count = 0;
    let idx = haystack.indexOf(needle);
    while (idx !== -1) {
        count++;
        idx = haystack.indexOf(needle, idx + needle.length);
    }
    return count;
}
