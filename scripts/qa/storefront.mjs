// Where the QA gates find the storefront, shared by the Playwright config and
// raw-html.mjs (ticket 16).
//
//   QA_CHANNEL         channel to render (default 1895766, ReelFlies_CA)
//   QA_VARIATION       theme variation (default "ReelFlies CA")
//   QA_BASE_URL        test this host instead of a local `stencil start`
//   QA_PREVIEW_COOKIE  cookie for the prelaunch host ("name=value; ..."); sent only
//                      to QA_BASE_URL and never printed
//
// Locally, `stencil start -p 3300` puts Browsersync on 3300 and the stencil server
// itself on 3301. The gates talk to 3301, so Browsersync's injected script, its
// "connected" overlay and its websocket stay out of screenshots, axe and the raw HTML.

import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const QA_CHANNEL = process.env.QA_CHANNEL || '1895766';
export const QA_VARIATION = process.env.QA_VARIATION || 'ReelFlies CA';
export const QA_PORT = 3300;
export const LOCAL_URL = `http://localhost:${QA_PORT + 1}`;
export const IS_LOCAL = !process.env.QA_BASE_URL;
export const BASE_URL = (process.env.QA_BASE_URL || LOCAL_URL).replace(/\/+$/, '');
export const PREVIEW_COOKIE = process.env.QA_PREVIEW_COOKIE || '';
// stencil start serves the webpack output here; it 404s until the dev build has written it.
export const READY_URL = `${LOCAL_URL}/stencil/00000000-0000-0000-0000-000000000001/dist/theme-bundle.main.js`;
// The renderer throws on a request without Accept-Language, so every request sends one.
export const HEADERS = { 'Accept-Language': 'en-CA,en;q=0.9' };

// The webpack clean step never deletes anything, so a fresh server starts from an empty
// assets/dist and is ready only once its dev build has written main.js.
export const START_COMMAND = `rm -rf assets/dist && npx stencil start -c ${QA_CHANNEL} -v "${QA_VARIATION}" -p ${QA_PORT}`;

export const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Screenshot baselines live under scripts/qa/baselines/<channel>-<variation>/.
export const BASELINE_SET = `${QA_CHANNEL}-${slug(QA_VARIATION)}`;

export function checkEnv() {
    if (!/^\d+$/.test(QA_CHANNEL)) throw new Error(`QA_CHANNEL must be a channel id, not "${QA_CHANNEL}"`);
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
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

async function isUp(url) {
    try {
        return (await fetch(url, { headers: HEADERS })).ok;
    } catch {
        return false;
    }
}

// A server already listening on 3301 is reused, but only if it renders QA_CHANNEL:
// screenshots of the wrong channel would fail, or worse, become the baselines.
export async function assertLocalChannel() {
    if (!IS_LOCAL) return;
    const response = await fetch(`${LOCAL_URL}/?debug=context`, { headers: HEADERS });
    const channel = String((await response.json()).settings?.channel_id);
    if (channel !== QA_CHANNEL) {
        throw new Error(`The stencil start on ${LOCAL_URL} renders channel ${channel}, not QA_CHANNEL ${QA_CHANNEL}. Stop it, or set QA_CHANNEL=${channel}.`);
    }
}

// For scripts outside Playwright: reuses a running local server, or starts one and
// stops it afterwards, as Playwright's webServer does. Returns { baseUrl, stop }.
export async function useStorefront({ timeout = 180000 } = {}) {
    checkEnv();
    if (!IS_LOCAL) return { baseUrl: BASE_URL, stop: () => {} };
    if (await isUp(READY_URL)) {
        await assertLocalChannel();
        return { baseUrl: LOCAL_URL, stop: () => {} };
    }

    const log = path.join(os.tmpdir(), 'rf-qa-stencil-start.log');
    const out = fs.openSync(log, 'w');
    console.log(`Starting: ${START_COMMAND} (log: ${log})`);
    const server = spawn('sh', ['-c', START_COMMAND], { cwd: ROOT, detached: true, stdio: ['ignore', out, out] });
    const stop = () => {
        try {
            process.kill(-server.pid, 'SIGTERM');
        } catch {
            // already gone
        }
    };

    const deadline = Date.now() + timeout;
    const waitUntilUp = async () => {
        if (await isUp(READY_URL)) return;
        if (server.exitCode !== null || Date.now() > deadline) {
            stop();
            throw new Error(`stencil start didn't come up on ${LOCAL_URL}; see ${log}`);
        }
        await new Promise(resolve => { setTimeout(resolve, 1000); });
        await waitUntilUp();
    };
    await waitUntilUp();
    await assertLocalChannel();
    return { baseUrl: LOCAL_URL, stop };
}
