// services/clean.js

import { logNotify } from "../utils/notifier.js";

export function clean(input) {
    logNotify("[Clean] Cleaning up input...");
    // 🔹 Normalize input to a string
    if (Array.isArray(input)) {
        input = input.join("\n");
    } else if (input && typeof input === "object") {
        if (Array.isArray(input.lines)) {
            input = input.lines.join("\n");
        } else if (typeof input.content === "string") {
            input = input.content;
        } else {
            input = JSON.stringify(input);
        }
    }

    if (typeof input !== "string") {
        input = String(input ?? "");
    }

    // 🔹 Profanity replacements
    const replacements = {
        // 'f[*]*k': 'fuck',
        // 's[*]*t': 'shit',
        // '[*]ss': 'ass',
        // 'b[*]tch': 'bitch',
        // 'd[*]mn': 'damn',
        // 'm[*]therf[*]ker': 'motherfucker',
        // 'd[*]ck': 'dick',
        // 'h[*]ll': 'hell'
    };

    for (let pattern in replacements) {
        const regex = new RegExp(pattern, 'gi');
        input = input.replace(regex, replacements[pattern]);
    }

    // 🔹 Remove line breaks
    input = input.replace(/\n+/g, '');
    input = JSON.parse(input);
    return input;
}
