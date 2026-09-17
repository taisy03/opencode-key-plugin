import { lintSource } from "@secretlint/core";
import { rules as presetRules } from "@secretlint/secretlint-rule-preset-recommend";

// Flatten the preset instead of using it as-is so the filter-comments rule
// can be left out: chat text is not a repo file, and a pasted
// secretlint-disable directive must never suppress capture.
const secretlintConfig = {
    rules: presetRules
        .filter((rule) => rule.meta?.id !== "@secretlint/secretlint-rule-filter-comments")
        .map((rule) => ({ id: rule.meta?.id ?? rule.meta, rule })),
};

// secretlint messageId -> vault env var. Most messageIds are already
// UPPER_SNAKE and used as-is (see fallback in ruleForMessage); only the
// non-conforming ones are listed here.
const ENV_BY_MESSAGE_ID = {
    AWSAccountID: "AWS_ACCOUNT_ID",
    AWSSecretAccessKey: "AWS_SECRET_ACCESS_KEY",
    AWSAccessKeyID: "AWS_ACCESS_KEY_ID",
    PrivateKeyP12: "GCP_P12_PRIVATE_KEY",
    PrivateKeyJSON: "GCP_JSON_PRIVATE_KEY",
    PrivateKey: "PRIVATE_KEY",
    PackageJSON_xOauthToken: "NPM_XOAUTH_TOKEN",
    Npmrc_authToken: "NPM_AUTH_TOKEN",
    BasicAuth: "BASIC_AUTH_CREDENTIALS",
    IncomingWebhook: "SLACK_WEBHOOK_URL",
    MongoDBConnection: "MONGODB_URI",
    MySQLConnection: "MYSQL_URI",
    PostgreSQLConnection: "POSTGRES_URI",
};

// secretlint has no OpenRouter rule, so it stays a custom regex.
const customRules = [
    {
        id: "openrouter-api-key",
        env: "OPENROUTER_API_KEY",
        name: "OpenRouter API key",
        regex: /\b(sk-or-v1-[a-fA-F0-9]{48,64})\b/g,
        entropy: 3,
    },
];

function slugify(id) {
    return id.toUpperCase().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function ruleForMessage(messageId) {
    const env =
        ENV_BY_MESSAGE_ID[messageId] ??
        (/^[A-Z][A-Z0-9_]+$/.test(messageId) ? messageId : slugify(messageId));
    return { id: messageId, env, name: messageId };
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

export async function scan(text) {
    const found = [];
    if (text) {
        try {
            const result = await lintSource({
                source: { content: text, filePath: "/chat.txt", contentType: "text" },
                options: { config: secretlintConfig },
            });
            for (const message of result.messages) {
                if (message.type !== "message")
                    continue;
                const [start, end] = message.range;
                const value = text.slice(start, end);
                if (!value || isPlaceholder(value))
                    continue;
                found.push({ rule: ruleForMessage(message.messageId), value, start, end });
            }
        }
        catch {
            // Never break chat on a detector failure; custom rules still run.
        }
        for (const rule of customRules) {
            const flags = rule.regex.flags.includes("g") ? rule.regex.flags : rule.regex.flags + "g";
            for (const m of text.matchAll(new RegExp(rule.regex.source, flags))) {
                const value = m[1] ?? m[0];
                if (rule.entropy && entropy(value) < rule.entropy)
                    continue;
                if (isPlaceholder(value))
                    continue;
                const start = m.index ?? 0;
                found.push({ rule, value, start, end: start + m[0].length });
            }
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
