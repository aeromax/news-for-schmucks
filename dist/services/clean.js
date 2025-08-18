// services/clean.js

export function clean(input) {
    console.log("[Clean] Cleaning up input...");
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
        'f[*]*k': 'fuck',
        's[*]*t': 'shit',
        '[*]ss': 'ass',
        'b[*]*tch': 'bitch',
        'a[*]*hole': 'asshole',
        'd[*]*n': 'damn',
        'c[*]*t': 'cunt',
        'p[*]*ssy': 'pussy',
        'm[*]*therf[*]*ker': 'motherfucker',
        'd[*]*ck': 'dick',
        'c[*]*ck': 'cock',
        'h[*]*ll': 'hell'
    };

    for (let pattern in replacements) {
        const regex = new RegExp(pattern, 'gi');
        text = text.replace(regex, replacements[pattern]);
    }
    console.log(`🧹Cleaned text: ${text}`);
    return text;
}
