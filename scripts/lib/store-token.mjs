// The store API tokens (W0-11; plan/build-pipeline.md decision 2): the environment first, then
// the macOS Keychain. Shaun adds the two Keychain items (W0-12); nothing else stores a token.
//
//   import { readStoreToken } from './lib/store-token.mjs';
//   const { token, source } = readStoreToken('read');   // RF_BC_READ_TOKEN, else "reelflies-bc-read"
//   const { token } = readStoreToken('write');          // RF_BC_WRITE_TOKEN, else "reelflies-bc-write"
//
// - read: the read-only account (Information & Settings, Marketing, Products, Content and
//   Channel settings). The store helper's plans read with it, and the release guard will too.
// - write: the writer account. Only the store helper, scripts/store/, may read it: the loader
//   refuses when the script node was started with lives anywhere else. That is a tripwire, as
//   the permission rules are; the real limits are the token scopes and the Keychain.
//   It also refuses unless this checkout's store tooling is byte-identical to origin/master's
//   (scripts/store/tooling.mjs), so a stale worktree or an unreviewed branch can't write with it.
//
// The Keychain is read only here, with `security find-generic-password -a reelflies -s <item> -w`.
// A token is returned, never printed, and no error message ever carries one. Callers pass every
// line they print through release-redact.mjs with the token they got.

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { storeToolingProblem } from '../store/tooling.mjs';

export const KEYCHAIN_ACCOUNT = 'reelflies';

export const TOKENS = {
    read: { env: 'RF_BC_READ_TOKEN', service: 'reelflies-bc-read', what: 'the read-only store API token' },
    write: { env: 'RF_BC_WRITE_TOKEN', service: 'reelflies-bc-write', what: 'the writer store API token' },
};

const STORE_DIR = fileURLToPath(new URL('../store/', import.meta.url));
// One line of printable ASCII with no spaces. BigCommerce's tokens are about 31 letters and digits.
const TOKEN_SHAPE = /^[\x21-\x7e]{16,512}$/;

export const keychainArgs = service => ['find-generic-password', '-a', KEYCHAIN_ACCOUNT, '-s', service, '-w'];

function runSecurity(args) {
    const { status, stdout, stderr } = spawnSync('security', args, { encoding: 'utf8' });
    return { status, stdout: stdout || '', stderr: stderr || '' };
}

const realpath = file => {
    try {
        return fs.realpathSync(file);
    } catch {
        return path.resolve(file);
    }
};

// True when `mainScript` (the script node was started with) is inside scripts/store/.
export function isStoreHelper(mainScript) {
    if (!mainScript) return false;
    const relative = path.relative(realpath(STORE_DIR), realpath(mainScript));
    return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function checked(token, source) {
    if (!TOKEN_SHAPE.test(token)) throw new Error(`${source} doesn't look like a store API token (one line, 16 or more printable characters, no spaces)`);
    return { token, source };
}

export function readStoreToken(kind, {
    env = process.env, security = runSecurity, platform = process.platform, mainScript = process.argv[1], toolingProblem = storeToolingProblem,
} = {}) {
    const spec = TOKENS[kind];
    if (!spec) throw new Error(`"${kind}" isn't a store token kind (${Object.keys(TOKENS).join(', ')})`);
    if (kind === 'write' && !isStoreHelper(mainScript)) {
        throw new Error(`the writer token is read only by the store helper, scripts/store/ (W0-11), and this is ${mainScript || 'no script'}: write through \`node scripts/store/plan.mjs\` and \`apply.mjs\``);
    }
    if (kind === 'write') {
        const problem = toolingProblem();
        if (problem) {
            const refused = new Error(problem);
            refused.name = 'Refused';
            throw refused;
        }
    }
    const fromEnv = env[spec.env];
    if (fromEnv) return checked(fromEnv, `$${spec.env}`);
    if (platform !== 'darwin') throw new Error(`no ${spec.env} in the environment, and no macOS Keychain on ${platform} to read ${spec.what} from`);
    const { status, stdout, stderr } = security(keychainArgs(spec.service));
    const source = `Keychain item "${spec.service}" (account "${KEYCHAIN_ACCOUNT}")`;
    if (status === 0) return checked(stdout.replace(/\r?\n$/, ''), source);
    if (status === 44) {
        throw new Error(`no ${spec.env} in the environment and no Keychain item "${spec.service}" for account "${KEYCHAIN_ACCOUNT}". Shaun adds ${spec.what} in his own terminal with \`security add-generic-password -a ${KEYCHAIN_ACCOUNT} -s ${spec.service} -w\`, which prompts for it (W0-12): never in a chat or a file`);
    }
    const reason = stderr.split('\n')[0].trim();
    throw new Error(`the Keychain didn't give "${spec.service}" (security exited ${status}${reason ? `: ${reason}` : ''})`);
}
