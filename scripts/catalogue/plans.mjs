// Catalogue plan files (ticket 18): a job's exact requests from an API read, with the read's
// sha256 and a digest, written to ~/reelflies/catalog/plans/ for Shaun to apply with
// scripts/catalogue/apply.mjs. The format and the checks are apply-rules.mjs's, so a plan this
// writes is one apply accepts, and nothing here can widen what apply sends.

import fs from 'fs';
import path from 'path';
import { sha256, timeStamp } from '../store/snapshot.mjs';
import {
    PLAN_FORMAT, TICKET, checkRequests, planDigest,
} from './apply-rules.mjs';

export function makePlan({
    job, requests, storeHash, read, now = new Date(),
}) {
    checkRequests(requests);
    const plan = {
        format: PLAN_FORMAT,
        ticket: TICKET,
        job,
        store_hash: storeHash,
        made_at: now.toISOString(),
        read,
        requests,
        digest: null,
    };
    plan.digest = planDigest(plan);
    return plan;
}

export function writePlanFile(root, plan, { now = new Date() } = {}) {
    const folder = path.join(root, 'plans');
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    const file = path.join(folder, `${timeStamp(now)}-${TICKET}-${plan.job}.json`);
    const textContent = `${JSON.stringify(plan, null, 2)}\n`;
    fs.writeFileSync(file, textContent, { flag: 'wx', mode: 0o600 });
    return { file, sha256: sha256(textContent) };
}
