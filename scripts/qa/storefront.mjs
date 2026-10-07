// Where the QA gates find the storefront, shared by the Playwright config and
// raw-html.mjs (ticket 16).
//
//   QA_CHANNEL         channel to render (default 1895766, ReelFlies_CA)
//   QA_VARIATION       theme variation (default: the channel's own in pages.mjs, "ReelFlies CA
//                      channel 1" on channel 1 (ticket 53), and "ReelFlies CA" on every other)
//   QA_BASE_URL        test this host instead of a local `stencil start`
//   QA_PREVIEW_COOKIE  cookie for the prelaunch host ("name=value; ..."); sent only
//                      to QA_BASE_URL and never printed
//   QA_FRESH_SERVER    1 (release.sh): never reuse a running server. Each gate starts its
//                      own from this checkout, and the run stops if anything already
//                      answers on QA_PORT or QA_PORT + 1.
//   QA_PORT            Browsersync's port (default 3300); the stencil server takes the next
//                      one. Each agent's worktree gets its own pair, so parallel runs never
//                      share one (W0-7). release.sh keeps 3300.
//   QA_ANALYTICS       allow: let the analytics tags load, on the prelaunch host only (W0-6;
//                      analytics-hosts.mjs). Every other run blocks them.
//   QA_OVERLAY         render with an overlay from scripts/qa/overlays/ (W0-8; overlays.mjs):
//                      in a throwaway worktree, on QA_PORT + 10 and the port after it, with a
//                      stencil start of its own. Refused with QA_FRESH_SERVER=1 and QA_BASE_URL.
//   QA_SCRATCH_DIR     where overlay worktrees go (default: the system temp folder)
//
// Locally, `stencil start -p 3300` puts Browsersync on 3300 and the stencil server
// itself on 3301. The gates talk to 3301, so Browsersync's injected script, its
// "connected" overlay and its websocket stay out of screenshots, axe and the raw HTML.
//
// A gate that uses a local server holds its port pair's lock, and a stencil start slot when
// it starts one (claimLocalServer, scripts/lib/lock.mjs), until it ends. A server it starts is
// trusted only while it runs (waitForOwnServer), and is stopped with the gate, even when the
// gate is stopped by a signal (startProcessGroup).
//
// Every stencil start a gate makes merges the committed custom layouts into its folder's
// config.stencil.json first (startCommand; custom-layouts.mjs). It starts in this checkout, or
// in the overlay's worktree (themeDir).

import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    STENCIL_SLOTS, acquireSlot, cleanupOnExit, currentTicket, lockRoot, portLockName, waitForLock,
} from '../lib/lock.mjs';
import { analyticsMode } from './analytics-hosts.mjs';
import {
    OVERLAY_MARKER, OVERLAY_PORT_OFFSET, createOverlayCheckout, overlayCheckoutPrefix, overlayEnvProblem, overlayProblems, readOverlay,
} from './overlays.mjs';
import { defaultVariation } from './pages.mjs';
import { fetchWithRetries } from './retry.mjs';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const QA_CHANNEL = process.env.QA_CHANNEL || '1895766';
export const QA_VARIATION = process.env.QA_VARIATION || defaultVariation(QA_CHANNEL);
export const QA_OVERLAY = process.env.QA_OVERLAY || '';
export const DEFAULT_QA_PORT = 3300;
// Browsersync's port: QA_PORT (3300 by default), or QA_PORT + 10 for an overlay run (W0-8), so
// an overlay's stencil start never shares a port pair with the worktree's plain runs.
export const qaPort = (env = process.env) => (env.QA_PORT ? Number(env.QA_PORT) : DEFAULT_QA_PORT) + (env.QA_OVERLAY ? OVERLAY_PORT_OFFSET : 0);
// Why QA_PORT can't be used, or null. Browsersync takes it and the stencil server the next one;
// an overlay run takes the pair 10 above it.
export function qaPortProblem(value, { overlay = false } = {}) {
    if (value === undefined || value === '') return null;
    const port = /^\d+$/.test(value) ? Number(value) : NaN;
    if (!(port >= 1024 && port <= 65534)) return `QA_PORT must be a port from 1024 to 65534 (Browsersync's; the stencil server takes the next one), not "${value}"`;
    if (overlay && port + OVERLAY_PORT_OFFSET > 65534) return `QA_PORT is ${value}, and an overlay run takes QA_PORT + ${OVERLAY_PORT_OFFSET} and the port after it, which must be ports too: use a QA_PORT up to ${65534 - OVERLAY_PORT_OFFSET}`;
    return null;
}
export const QA_PORT = qaPort();
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
// First, the committed custom layouts go into the folder's config.stencil.json (W0-8;
// custom-layouts.mjs), which stencil start reads once, as it starts.
export const startCommand = ({ channel = QA_CHANNEL, variation = QA_VARIATION, port = QA_PORT } = {}) => `node scripts/qa/custom-layouts.mjs && rm -rf assets/dist && npx stencil start -c ${channel} -v "${variation}" -p ${port}`;
export const START_COMMAND = startCommand();
// The folder a stencil start runs in: this checkout, or the throwaway worktree an overlay
// renders in, which a Playwright runner passes to its workers as RF_QA_THEME_DIR. Only an
// overlay run's own worktree counts, named for its port and overlay: an RF_QA_THEME_DIR left in
// the shell never moves a plain run, a release's included, into another folder, whose server
// would pass the checks for this checkout's.
export function themeDir(env = process.env) {
    const dir = env.RF_QA_THEME_DIR;
    const own = Boolean(env.QA_OVERLAY && dir) && path.basename(dir).startsWith(overlayCheckoutPrefix(qaPort(env), env.QA_OVERLAY));
    return own ? dir : ROOT;
}
// Where useStorefront writes the output of a stencil start it runs: one log per port pair, so
// runs on other ports never write the same file.
export const startLogPath = (port = QA_PORT) => path.join(os.tmpdir(), `rf-qa-stencil-start-${port}.log`);

export const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Screenshot baselines live under scripts/qa/baselines/<channel>-<variation>/.
export const BASELINE_SET = `${QA_CHANNEL}-${slug(QA_VARIATION)}`;

const readConfig = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

export function checkEnv() {
    if (!/^\d+$/.test(QA_CHANNEL)) throw new Error(`QA_CHANNEL must be a channel id, not "${QA_CHANNEL}"`);
    if (!['', '1'].includes(process.env.QA_FRESH_SERVER || '')) throw new Error(`QA_FRESH_SERVER must be 1 or unset, not "${process.env.QA_FRESH_SERVER}"`);
    const portProblem = qaPortProblem(process.env.QA_PORT, { overlay: Boolean(QA_OVERLAY) });
    if (portProblem) throw new Error(portProblem);
    const config = readConfig();
    const names = (config.variations || []).map(variation => variation.name);
    if (!names.includes(QA_VARIATION)) throw new Error(`QA_VARIATION "${QA_VARIATION}" isn't a variation in config.json (${names.join(', ')})`);
    analyticsMode(); // throws on a QA_ANALYTICS this run may not use
    const overlayProblem = overlayEnvProblem();
    if (overlayProblem) throw new Error(overlayProblem);
    if (QA_OVERLAY) {
        const problems = overlayProblems(readOverlay(QA_OVERLAY), config);
        if (problems.length) throw new Error(problems.join('; '));
    }
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
// the run's channel and variation, and the run's overlay or none (the marker overlays.mjs
// writes into config.json, which theme_settings shows), or its screenshots would be compared
// with, or worse become, another set's baselines. An empty list means it can.
export function serverProblems(context, {
    channel = QA_CHANNEL, variation = QA_VARIATION, config = readConfig(), overlay = QA_OVERLAY,
} = {}) {
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

    const servedOverlay = context.theme_settings?.[OVERLAY_MARKER] || '';
    if (servedOverlay !== (overlay || '')) {
        if (!servedOverlay) problems.push(`renders no overlay, not QA_OVERLAY "${overlay}"`);
        else problems.push(overlay ? `renders the overlay "${servedOverlay}", not QA_OVERLAY "${overlay}"` : `renders the overlay "${servedOverlay}", and this run has none`);
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
// something answers on (`busyPorts`) and whether QA_PORT + 1 serves a dev build (`ready`):
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

export function busyServerMessage(ports, { overlay = '' } = {}) {
    const listed = ports.join(' and ');
    const why = overlay ? `The overlay ${overlay} renders on a stencil start of its own` : 'QA_FRESH_SERVER=1';
    return `${why}, and something already answers on port${ports.length > 1 ? 's' : ''} ${listed}. `
        + 'Stop that server first: the gates must run on a stencil start of this checkout, and one already running could be another checkout\'s, worktree\'s or branch\'s. '
        + `\`lsof -nP ${ports.map(port => `-iTCP:${port}`).join(' ')} -sTCP:LISTEN\` shows what it is.`;
}

// serverPlan on the QA ports as they are now. Throws on 'refuse', with the message for the
// operator. An overlay run is planned as a fresh one: it never reuses a server, because only
// one it starts in the overlay's worktree renders the overlay.
export async function planLocalServer({ fresh = FRESH_SERVER || Boolean(QA_OVERLAY) } = {}) {
    const busy = await busyPorts();
    const plan = serverPlan({ fresh, busyPorts: busy, ready: busy.includes(QA_PORT + 1) && await isUp(READY_URL) });
    if (plan === 'refuse') throw new Error(busyServerMessage(busy, { overlay: QA_OVERLAY }));
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

// A worktree's gates on 3300 share the release's ports (and, until every worktree made before
// W0-7 is gone, wave 0's). A linked worktree's .git is a file. The warning, or null.
export function portWarning({ env = process.env, checkout = ROOT } = {}) {
    if (env.QA_PORT) return null;
    let linked = false;
    try {
        linked = fs.statSync(path.join(checkout, '.git')).isFile();
    } catch {
        // not a git checkout
    }
    return linked ? `WARNING  QA_PORT isn't set, so this worktree's gates use ${DEFAULT_QA_PORT} and ${DEFAULT_QA_PORT + 1}, the release's ports. Set the port the orchestrator assigned to this worktree (scripts/qa/README.md, "Parallel runs").` : null;
}

// The locks a gate holds while it uses a local stencil start (W0-7), until it ends:
// - its port pair's lock, port-<QA_PORT>, taken first: a run on the same ports waits for this
//   one instead of failing on a busy port, and never reuses a server this one started;
// - a stencil start slot, stencil-<1..3>, only when it starts a server, so at most three run on
//   the Mac at once. A run waits for a free one.
// Then it plans with the port its own (`plan`, planLocalServer by default, which throws on
// 'refuse'), and plans again once it has a slot: the wait can last minutes, and a server that
// takes no lock (a worktree from before W0-7, a stencil start run by hand) can come up on the
// ports meanwhile. With QA_FRESH_SERVER=1 that one is refused; otherwise one that renders the
// run is reused, and the slot given back. Resolves to { plan, release }; both locks also go
// when the process exits or is stopped by a signal.
export async function claimLocalServer({
    port = QA_PORT, plan = () => planLocalServer(), root = lockRoot(), checkout = path.resolve(ROOT), log = console.log, pollMs, timeoutMs,
} = {}) {
    const warning = portWarning({ checkout });
    if (warning) log(warning);
    const owner = `the gates on port ${port} in ${checkout}`;
    const options = {
        root, log, pollMs, timeoutMs, releaseOnExit: true, ticket: currentTicket(checkout), details: { port, checkout },
    };
    const portLock = await waitForLock(portLockName(port), owner, options);
    let slot = null;
    try {
        const first = await plan();
        if (first !== 'start') return { plan: first, release: portLock.release };
        slot = await acquireSlot(owner, options);
        const planned = await plan();
        if (planned !== 'start') {
            slot.release();
            return { plan: planned, release: portLock.release };
        }
        log(`SLOT     stencil start slot ${slot.slot} of ${STENCIL_SLOTS}, for port ${port}`);
        const taken = slot;
        return {
            plan: planned,
            release() {
                taken.release();
                portLock.release();
            },
        };
    } catch (error) {
        slot?.release();
        portLock.release();
        throw error;
    }
}

// The local server on QA_PORT + 1, reused or just started, must render QA_CHANNEL,
// QA_VARIATION and QA_OVERLAY.
export async function assertLocalServer() {
    if (IS_LOCAL) await assertServer(LOCAL_URL);
}

// For a run with QA_OVERLAY, which holds its port pair's lock: makes the throwaway worktree the
// overlay renders in (overlays.mjs, createOverlayCheckout), from `checkout`, and removes it when
// this process exits or is stopped by a signal, if remove() hasn't already. Returns { dir, remove }.
export function startOverlayCheckout({
    checkout = ROOT, overlay = QA_OVERLAY, port = QA_PORT, log = console.log,
} = {}) {
    const run = createOverlayCheckout({
        checkout: path.resolve(checkout), overlay: readOverlay(overlay), port, log,
    });
    const forget = cleanupOnExit(run.remove);
    return {
        dir: run.dir,
        remove() {
            forget();
            run.remove();
        },
    };
}

const signalGroup = (child, name) => {
    try {
        process.kill(-child.pid, name);
    } catch {
        // already gone
    }
};
// The exit hooks of the groups startProcessGroup started and stopProcessGroup hasn't stopped yet.
const groupHooks = new WeakMap();

// Runs `command` in a process group of its own (sh, npx, stencil start and its webpack worker),
// so stopProcessGroup can stop all of it. Until it has, the group gets a SIGTERM if this process
// exits or is stopped by SIGINT, SIGTERM or SIGHUP first, so a gate stopped with Ctrl-C or a
// tool's timeout leaves no stencil start behind.
export function startProcessGroup(command, { cwd = ROOT, stdio = 'ignore' } = {}) {
    const child = spawn('sh', ['-c', command], { cwd, detached: true, stdio });
    groupHooks.set(child, cleanupOnExit(() => signalGroup(child, 'SIGTERM')));
    return child;
}

// Stops a detached server's whole process group (sh, npx, stencil start and its webpack
// worker): SIGTERM, then SIGKILL if any of it is left after `timeout` ms. Resolves once
// none of it is left, to the `ports` still answering after that (empty when all are free).
export async function stopProcessGroup(child, { ports = QA_PORTS, timeout = 10000 } = {}) {
    const signal = name => signalGroup(child, name);
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
    groupHooks.get(child)?.();
    groupHooks.delete(child);
    return waitForFreePorts({ ports, timeout: 5000 });
}

const exitOf = child => {
    if (child.exitCode !== null) return `code ${child.exitCode}`;
    return child.signalCode ? `signal ${child.signalCode}` : null;
};

// Resolves once the stencil start this run spawned (`server`) is ready (`ready`: READY_URL
// answers). Only that server is trusted: once it has exited, the run fails at once even if
// something answers on its port, because that is another checkout's server, started while this
// run waited for a slot or before its own could bind the port. `ready` and `pollMs` are for tests.
export async function waitForOwnServer(server, { ready = () => isUp(READY_URL), timeout = 180000, pollMs = 1000 } = {}) {
    const deadline = Date.now() + timeout;
    const exited = () => {
        const how = exitOf(server);
        if (how) throw new Error(`stencil start exited (${how}) before it was ready, so whatever answers on ${LOCAL_URL} isn't this checkout's server`);
    };
    for (;;) {
        exited();
        const up = await ready(); // eslint-disable-line no-await-in-loop
        exited();
        if (up) return;
        if (Date.now() > deadline) throw new Error(`stencil start didn't come up within ${Math.round(timeout / 1000)} s on ${LOCAL_URL}`);
        await pause(pollMs); // eslint-disable-line no-await-in-loop
    }
}

// For scripts outside Playwright: reuses a running local server, or starts one and
// stops it afterwards, as Playwright's webServer does (serverPlan decides), holding the
// locks claimLocalServer takes. With QA_OVERLAY it starts one in the overlay's throwaway
// worktree, and removes the worktree with it. Returns { baseUrl, stop }; stop() resolves once
// the server it started is gone and its ports are free, and releases the locks.
export async function useStorefront({ timeout = 180000 } = {}) {
    checkEnv();
    if (!IS_LOCAL) return { baseUrl: BASE_URL, stop: async () => {} };
    const claim = await claimLocalServer();
    if (claim.plan === 'reuse') {
        try {
            await assertLocalServer();
        } catch (error) {
            claim.release();
            throw error;
        }
        return { baseUrl: LOCAL_URL, stop: async () => claim.release() };
    }

    let overlay = null;
    try {
        if (QA_OVERLAY) overlay = startOverlayCheckout();
    } catch (error) {
        claim.release();
        throw error;
    }
    const log = startLogPath();
    const out = fs.openSync(log, 'w');
    console.log(`Starting: ${START_COMMAND} (log: ${log})${overlay ? ` in ${overlay.dir}` : ''}`);
    const server = startProcessGroup(START_COMMAND, { cwd: overlay?.dir ?? ROOT, stdio: ['ignore', out, out] });
    const stop = async () => {
        const left = await stopProcessGroup(server);
        overlay?.remove();
        claim.release();
        if (left.length) console.error(`stencil start was stopped, but something still answers on port ${left.join(' and ')}`);
    };

    try {
        await waitForOwnServer(server, { timeout });
    } catch (error) {
        await stop();
        throw new Error(`${error.message}; see ${log}`);
    }
    try {
        await assertLocalServer();
    } catch (error) {
        await stop();
        throw error;
    }
    return { baseUrl: LOCAL_URL, stop };
}
