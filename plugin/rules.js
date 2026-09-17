import { readFileSync } from "node:fs";
const dataUrl = new URL("./rules.json", import.meta.url);
const rulesRaw = JSON.parse(readFileSync(dataUrl, "utf8"));
const bundled = rulesRaw.map((r) => ({
    id: r.id,
    env: envFor(r.id),
    name: r.description ?? r.id,
    regex: new RegExp(r.regex, "g"),
    keyword: r.keywords,
    entropy: r.entropy,
}));
const customRules = [
    {
        id: "openrouter-api-key",
        env: "OPENROUTER_API_KEY",
        name: "OpenRouter API key",
        regex: /\b(sk-or-v1-[a-fA-F0-9]{48,64})\b/g,
        entropy: 3,
    },
];
const rules = [...bundled, ...customRules];
function envFor(id) {
    const map = {
        "aws-access-token": "AWS_ACCESS_KEY_ID",
        "aws-secret-access-key": "AWS_SECRET_ACCESS_KEY",
        "aws-amazon-bedrock-api-key-long-lived": "AWS_BEDROCK_API_KEY",
        "gcp-api-key": "GOOGLE_API_KEY",
        "google-oauth-client-secret": "GOOGLE_OAUTH_CLIENT_SECRET",
        "github-pat": "GITHUB_TOKEN",
        "github-fine-grained-pat": "GITHUB_TOKEN",
        "github-oauth-access-token": "GITHUB_TOKEN",
        "github-app-token": "GITHUB_TOKEN",
        "github-refresh-token": "GITHUB_TOKEN",
        "stripe-access-token": "STRIPE_API_KEY",
        "stripe-restricted-key": "STRIPE_RESTRICTED_KEY",
        "openai-api-key": "OPENAI_API_KEY",
        "anthropic-api-key": "ANTHROPIC_API_KEY",
        "anthropic-admin-api-key": "ANTHROPIC_ADMIN_API_KEY",
        "slack-access-token": "SLACK_TOKEN",
        "slack-webhook-url": "SLACK_WEBHOOK_URL",
        "slack-bot-token": "SLACK_BOT_TOKEN",
        "sendgrid-api-token": "SENDGRID_API_KEY",
        "twilio-api-key": "TWILIO_API_KEY",
        "npm-access-token": "NPM_TOKEN",
        "pypi-upload-token": "PYPI_TOKEN",
        "gitlab-pat": "GITLAB_TOKEN",
        "discord-api-token": "DISCORD_TOKEN",
        "discord-bot-token": "DISCORD_TOKEN",
        "datadog-api-key": "DD_API_KEY",
        "cloudflare-api-token": "CLOUDFLARE_API_TOKEN",
        "cloudflare-global-api-key": "CLOUDFLARE_API_KEY",
        "digitalocean-pat": "DIGITALOCEAN_TOKEN",
        "digitalocean-oauth-access-token": "DIGITALOCEAN_TOKEN",
        "databricks-token": "DATABRICKS_TOKEN",
        "vercel-github-token": "VERCEL_TOKEN",
        "netlify-access-token": "NETLIFY_TOKEN",
        "jwt": "JWT_TOKEN",
        "generic-api-key": "GENERIC_API_KEY",
        "generic-private-key": "PRIVATE_KEY",
        "rsa-private-key": "RSA_PRIVATE_KEY",
        "ec-private-key": "EC_PRIVATE_KEY",
        "openssh-private-key": "OPENSSH_PRIVATE_KEY",
    };
    return map[id] ?? slugify(id);
}
function slugify(id) {
    return id.toUpperCase().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}
export function entropy(str) {
    if (!str.length)
        return 0;
    const freq = new Map();
    for (const ch of str)
        freq.set(ch, (freq.get(ch) ?? 0) + 1);
    let h = 0;
    for (const n of freq.values()) {
        const p = n / str.length;
        h -= p * Math.log2(p);
    }
    return h;
}
export function scan(text) {
    const found = [];
    for (const rule of rules) {
        const re = rule.regex.global ? rule.regex : new RegExp(rule.regex.source, rule.regex.flags + "g");
        for (const m of text.matchAll(re)) {
            const group = m[1] ?? m[2] ?? m[3];
            const value = typeof group === "string" && group.length > 0 ? group : m[0];
            if (rule.keyword && !rule.keyword.some((k) => text.toLowerCase().includes(k.toLowerCase())))
                continue;
            if (rule.entropy && entropy(value) < rule.entropy)
                continue;
            if (isPlaceholder(value))
                continue;
            const start = m.index ?? 0;
            found.push({ rule, value, start, end: start + m[0].length });
        }
    }
    return dedupeOverlaps(found);
}
function isPlaceholder(s) {
    return /(example|your_|xxx{2,}|changeme|change-me|lorem|REPLACE|replace|\.\.\.|00000000)/i.test(s);
}
function dedupeOverlaps(matches) {
    const sorted = [...matches].sort((a, b) => a.start - b.start);
    const out = [];
    for (const m of sorted) {
        const last = out[out.length - 1];
        if (last && m.start < last.end) {
            if (m.value.length > last.value.length)
                out[out.length - 1] = m;
        }
        else {
            out.push(m);
        }
    }
    return out;
}
