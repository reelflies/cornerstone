// Keeps tokens out of the push output (ticket 05, step 5).
//
//   npx stencil push … 2>&1 | node scripts/release.mjs redact
//
// stencil-cli 9.1.0 prints the whole request config, x-auth-token header included, when a request
// fails (lib/cliCommon.js printCliResultErrorAndExit). release.sh pipes the push through this
// filter, which replaces the known secrets and any x-auth-token value with [redacted].

const HEADER = /(x-auth-token['"]?\s*[:=]\s*['"]?)[^'"\s,}]+/gi;

export function redact(text, secrets) {
    let output = text;
    for (const secret of secrets) {
        if (secret && secret.length >= 8) output = output.split(secret).join('[redacted]');
    }
    return output.replace(HEADER, '$1[redacted]');
}
