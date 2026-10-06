// Where the QA gates find the storefront, shared by the Playwright config and
// raw-html.mjs (ticket 16).
//
//   QA_CHANNEL         channel to render (default 1895766, ReelFlies_CA)
//   QA_VARIATION       theme variation (default "ReelFlies CA")
//   QA_BASE_URL        test this host instead of a local `stencil start`
//   QA_PREVIEW_COOKIE  cookie for the prelaunch host ("name=value; ..."); sent only
//                      to QA_BASE_URL and never printed
//   QA_FRESH_SERVER    1 (release.sh): never reuse a running server. Each gate starts its
//                      own from this checkout, and the run stops if anything already
//                      answers on 3300 or 3301.
//
// Locally, `stencil start -p 3300` puts Browsersync on 3300 and the stencil server
// itself on 3301. The gates talk to 3301, so Browsersync's injected script, its
// "connected" overlay and its websocket stay out of screenshots, axe and the raw HTML.

import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchWithRetries } from './retry.mjs';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const QA_CHANNEL = process.env.QA_CHANNEL || '1895766';
export const QA_VARIATION = process.env.QA_VARIATION || 'ReelFlies CA';
export const QA_PORT = 3300;
// Browsersync's port and the stencil server's.
export const QA_PORTS = [QA_PORT, QA_PORT + 1];
export const LOCAL_URL = `http://localhost:${QA_PORT + 1}`;
export const IS_LOCAL = !process.env.QA_BASE_URL;
export const BASE_URL = (process.env.QA_BASE_URL || LOCAL_URL).replace(/\/+$/, '');
export const PREVIEW_COOKIE = process.env.QA_PREVIEW_COOKIE || '';
export const FRESH_SERVER = process.env.QA_FRESH_SERVER === '1';
// stencil start serves the webpack output here; it 404s until the dev build has written it.
export const READY_URL = `${LOCAL_URL}/stencil/00000000-0000-0000-0000-000000000001/dist/theme-bundle.main.js`;
// The renderer throws on a request without Accept-Language, so every request sends one.
export const HEADERS = { 'Accept-Language': 'en-CA,en;q=0.9' };
// When a 5xx or a 429 is asked again, and how long the gates wait first: retry.mjs.

// The webpack clean step never deletes anything, so a fresh server starts from an empty
// assets/dist and is ready only once its dev build has written main.js.
export const START_COMMAND = `rm -rf assets/dist && npx stencil start -c ${QA_CHANNEL} -v "${QA_VARIATION}" -p ${QA_PORT}`;

export const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Screenshot baselines live under scripts/qa/baselines/<channel>-<variation>/.
export const BASELINE_SET = `${QA_CHANNEL}-${slug(QA_VARIATION)}`;

const readConfig = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

export function checkEnv() {
    if (!/^\d+$/.test(QA_CHANNEL)) throw new Error(`QA_CHANNEL must be a channel id, not "${QA_CHANNEL}"`);
    if (!['', '1'].includes(process.env.QA_FRESH_SERVER || '')) throw new Error(`QA_FRESH_SERVER must be 1 or unset, not "${process.env.QA_FRESH_SERVER}"`);
    const config = readConfig();
    const names = (config.variations || []).map(variation => variation.name);
    if (!names.includes(QA_VARIATION)) throw new Error(`QA_VARIATION "${QA_VARIATION}" isn't a variation in config.json (${names.join(', ')})`);
}

// The cookies to set in a browser for QA_BASE_URL, parsed from QA_PREVIEW_COOKIE.
export function previewCookies() {
    if (!PREVIEW_COOKIE || IS_LOCAL) return [];
    return PREVIEW_COOKIE.split(';').map(part => part.trim()).filter(Boolean).map(part => {
        const at = part.indexOf('=');
        return { name: part.slice(0, at), value: part.slice(at + 1), url: BASE_URL };
    });
}

const pause = ms => new Promise(resolve => { setTimeout(resolve, ms); });

// Polls `condition` every 250 ms until it holds or `timeout` ms have passed; resolves to
// whether it held.
async function waitFor(condition, timeout) {
    const deadline = Date.now() + timeout;
    const poll = async () => {
        if (await condition()) return true;
        if (Date.now() >= deadline) return false;
        await pause(250);
        return poll();
    };
    return poll();
}

async function isUp(url) {
    try {
        return (await fetch(url, { headers: HEADERS })).ok;
    } catch {
        return false;
    }
}

// stencil start names the variation it renders in the page context: settings.theme_config_id
// is a uuid of the variation's position in config.json, counted from 1 (stencil-cli's
// renderer.module.js and int2uuid).
const configIdOf = position => `00000000-0000-0000-0000-${String(position).padStart(12, '0')}`;

// Why a running server, going by its `?debug=context`, can't serve this run: it must render
// the run's channel and variation, or its screenshots would be compared with, or worse
// become, another set's baselines. An empty list means it can.
export function serverProblems(context, { channel = QA_CHANNEL, variation = QA_VARIATION, config = readConfig() } = {}) {
    const problems = [];
    const servedChannel = String(context.settings?.channel_id);
    if (servedChannel !== channel) problems.push(`renders channel ${servedChannel}, not QA_CHANNEL ${channel}`);

    const configId = context.settings?.theme_config_id;
    const names = (config.variations || []).map(({ name }) => name);
    if (configId !== configIdOf(names.indexOf(variation) + 1)) {
        const served = names.find((name, index) => configIdOf(index + 1) === configId);
        problems.push(served
            ? `renders the variation "${served}", not QA_VARIATION "${variation}"`
            : `renders an unknown variation (theme_config_id ${configId}), not QA_VARIATION "${variation}"`);
    }
    return problems;
}

// The ports in `ports` that something accepts connections on, on IPv4 or IPv6 localhost.
export async function busyPorts(ports = QA_PORTS) {
    const accepts = (port, host) => new Promise(resolve => {
        const socket = net.connect({ port, host });
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('error', () => resolve(false));
    });
    const busy = await Promise.all(ports.map(async port => (await accepts(port, '127.0.0.1')) || accepts(port, '::1')));
    return ports.filter((port, index) => busy[index]);
}

// Waits up to `timeout` ms for nothing to answer on `ports`; resolves to the ports still busy.
export async function waitForFreePorts({ ports = QA_PORTS, timeout = 15000 } = {}) {
    await waitFor(async () => !(await busyPorts(ports)).length, timeout);
    return busyPorts(ports);
}

// How a gate gets its local stencil start, from QA_FRESH_SERVER (`fresh`), the QA ports
// something answers on (`busyPorts`) and whether 3301 serves a dev build (`ready`):
//   'reuse'   the server already running, once serverProblems finds it renders this run's
//             channel and variation (the default)
//   'start'   one of its own, from this checkout, stopped when the gate finishes
//   'refuse'  neither. With QA_FRESH_SERVER=1 a server already answering could come from
//             another checkout, worktree or branch, and the gates would pass on code other
//             than the commit being pushed.
export function serverPlan({ fresh, busyPorts: busy, ready }) {
    if (fresh) return busy.length ? 'refuse' : 'start';
    return ready ? 'reuse' : 'start';
}

export function busyServerMessage(ports) {
    const listed = ports.join(' and ');
    return `QA_FRESH_SERVER=1, and something already answers on port${ports.length > 1 ? 's' : ''} ${listed}. `
        + 'Stop that server first: the gates must run on a stencil start of this checkout, and one already running could be another checkout\'s, worktree\'s or branch\'s. '
        + `\`lsof -nP ${ports.map(port => `-iTCP:${port}`).join(' ')} -sTCP:LISTEN\` shows what it is.`;
}

// serverPlan on the QA ports as they are now. Throws on 'refuse', with the message for the operator.
export async function planLocalServer({ fresh = FRESH_SERVER } = {}) {
    const busy = await busyPorts();
    const plan = serverPlan({ fresh, busyPorts: busy, ready: busy.includes(QA_PORT + 1) && await isUp(READY_URL) });
    if (plan === 'refuse') throw new Error(busyServerMessage(busy));
    return plan;
}

// Throws unless the stencil start at `baseUrl` renders the run's channel and variation
// (serverProblems), read from its `?debug=context`. That request is asked again after a 5xx
// or a 429 as a pinned page's is (retry.mjs): a dropped upstream connection there would
// otherwise fail the whole gate. Any other answer but a 2xx fails, naming the status; a
// wrong channel or variation fails at once. `wait` and `log` are for tests.
export async function assertServer(baseUrl, {
    channel, variation, config, wait, log,
} = {}) {
    const response = await fetchWithRetries(`${baseUrl}/?debug=context`, { headers: HEADERS }, {
        what: 'the page context /?debug=context', wait, log,
    });
    if (!response.ok) {
        await response.arrayBuffer();
        throw new Error(`The stencil start on ${baseUrl} answered HTTP ${response.status} to /?debug=context, so the gates can't tell which channel and variation it renders. Its output says why; run the gates again, or stop it.`);
    }
    let context;
    try {
        context = await response.json();
    } catch {
        throw new Error(`The stencil start on ${baseUrl} answered /?debug=context with something that isn't JSON, so the gates can't tell which channel and variation it renders. Check what answers on that port.`);
    }
    const problems = serverProblems(context, { channel, variation, config });
    if (problems.length) {
        throw new Error(`The stencil start on ${baseUrl} ${problems.join(' and ')}. Stop it, or set QA_CHANNEL and QA_VARIATION to match it.`);
    }
}

// The local server on 3301, reused or just started, must render QA_CHANNEL and QA_VARIATION.
export async function assertLocalServer() {
    if (IS_LOCAL) await assertServer(LOCAL_URL);
}

// Stops a detached server's whole process group (sh, npx, stencil start and its webpack
// worker): SIGTERM, then SIGKILL if any of it is left after `timeout` ms. Resolves once
// none of it is left, to the `ports` still answering after that (empty when all are free).
export async function stopProcessGroup(child, { ports = QA_PORTS, timeout = 10000 } = {}) {
    const signal = name => {
        try {
            process.kill(-child.pid, name);
        } catch {
            // already gone
        }
    };
    const gone = () => {
        try {
            process.kill(-child.pid, 0);
            return false;
        } catch {
            return true;
        }
    };
    signal('SIGTERM');
    if (!await waitFor(gone, timeout)) {
        signal('SIGKILL');
        await waitFor(gone, 5000);
    }
    return waitForFreePorts({ ports, timeout: 5000 });
}

// For scripts outside Playwright: reuses a running local server, or starts one and
// stops it afterwards, as Playwright's webServer does (serverPlan decides). Returns
// { baseUrl, stop }; stop() resolves once the server it started is gone and its ports are free.
export async function useStorefront({ timeout = 180000 } = {}) {
    checkEnv();
    if (!IS_LOCAL) return { baseUrl: BASE_URL, stop: async () => {} };
    if (await planLocalServer() === 'reuse') {
        await assertLocalServer();
        return { baseUrl: LOCAL_URL, stop: async () => {} };
    }

    const log = path.join(os.tmpdir(), 'rf-qa-stencil-start.log');
    const out = fs.openSync(log, 'w');
    console.log(`Starting: ${START_COMMAND} (log: ${log})`);
    const server = spawn('sh', ['-c', START_COMMAND], { cwd: ROOT, detached: true, stdio: ['ignore', out, out] });
    const stop = async () => {
        const left = await stopProcessGroup(server);
        if (left.length) console.error(`stencil start was stopped, but something still answers on port ${left.join(' and ')}`);
    };

    const deadline = Date.now() + timeout;
    const waitUntilUp = async () => {
        if (await isUp(READY_URL)) return;
        if (server.exitCode !== null || Date.now() > deadline) {
            await stop();
            throw new Error(`stencil start didn't come up on ${LOCAL_URL}; see ${log}`);
        }
        await pause(1000);
        await waitUntilUp();
    };
    await waitUntilUp();
    try {
        await assertLocalServer();
    } catch (error) {
        await stop();
        throw error;
    }
    return { baseUrl: LOCAL_URL, stop };
}
