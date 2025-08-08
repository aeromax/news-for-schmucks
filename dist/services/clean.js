// services/clean.js

export function clean(text) {
    console.log("🧹 [Cleaning] Cleaning up text...");

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
