// The dry run's reports (ticket 18): one Markdown page and one CSV per job, the batch index Shaun
// reads first, and the re-export list for ticket 14. Written to the dry run's --out folder
// (plan/approvals/ for the approval batch).

import fs from 'fs';
import path from 'path';
import { BRAND_NAME, PLANNED_BRAND_URL } from './jobs.mjs';

const SAMPLE = 40;
const ROW_COLUMNS = ['product_id', 'product', 'live', 'what', 'before', 'after', 'note'];
const REEXPORT_COLUMNS = ['rank', 'tier', 'product_id', 'product', 'sku', 'thumbnail_image_id', 'thumbnail_ground', 'thumbnail_url'];

const csvCell = value => {
    const textContent = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(textContent) ? `"${textContent.replace(/"/g, '""')}"` : textContent;
};
export const toCsv = (rows, columns) => `${[columns.join(','), ...rows.map(row => columns.map(column => csvCell(row[column])).join(','))].join('\n')}\n`;

const mdCell = value => (value === null || value === undefined ? '' : String(value)).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const table = (header, rows) => [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map(cells => `| ${cells.map(mdCell).join(' | ')} |`)];
const short = sha => (sha ? sha.slice(0, 8) : '');
// A sentence ends with one full stop, whether or not the text already has one.
const sentence = textContent => (/[.!?]$/.test(textContent) ? textContent : `${textContent}.`);

function sourceLines(meta) {
    const lines = [];
    if (meta.api) lines.push(`- **API read:** ${meta.api.read_at}, with the read-only token (GETs only). Snapshot \`${meta.api.file}\`, sha256 \`${meta.api.sha256}\`.`);
    if (meta.csv) lines.push(`- **Export:** \`${meta.csv.file}\`${meta.api ? ', for comparison: plans are made from the API read only, because the export has no option, value or brand ids' : ''}.`);
    lines.push(`- **Photos:** ${meta.images}.`);
    lines.push(`- **Sales ranking:** ${meta.sales}.`);
    return lines;
}

// For a plan whose requests are planned on another job's plan: which, and how many.
function priorLine(result) {
    const prior = result.requests.filter(request => request.prior);
    if (!prior.length) return '';
    const jobs = [...new Set(prior.map(request => request.prior.job))].join(' and ');
    return ` It is planned on the ${jobs} plan's result for ${prior.length} ${prior.length === 1 ? 'option' : 'options'}: apply it after that plan. Until then apply refuses it, writing nothing, and the sha256 stays valid.`;
}

export function jobMarkdown(result, { plan = null, csvResult = null, meta }) {
    const counts = Object.keys({ ...result.counts, ...(csvResult ? csvResult.counts : {}) });
    const lines = [
        `# 18 · ${result.title}`,
        '',
        `Made by \`scripts/catalogue/dry-run.mjs\` on ${meta.date}. Nothing has been written to the store.`,
        '',
        `- **Decision:** ${sentence(result.decision)}`,
        ...sourceLines(meta),
        plan
            ? `- **Plan:** \`${plan.file}\`, ${result.requests.length} requests, sha256 \`${plan.sha256}\`. To apply it Shaun types \`${short(plan.sha256)}\` at his terminal (see [the batch](18-catalogue-batch.md)).${priorLine(result)}`
            : `- **Plan:** none${result.requests.length ? '' : ' (no request to send)'}.`,
        '',
        '## Rule',
        '',
        ...result.rule.map(line => `- ${line}`),
        '',
        '## Counts',
        '',
        ...table(['', meta.api ? 'API read' : 'Export', ...(csvResult ? ['Export'] : [])], counts.map(key => [key, result.counts[key] ?? '', ...(csvResult ? [csvResult.counts[key] ?? ''] : [])])),
    ];
    if (result.notes.length) lines.push('', '## Notes', '', ...result.notes.map(note => `- ${note}`));
    const listed = Object.entries(result.extra).filter(([key, extra]) => Array.isArray(extra) && extra.length && key !== 'reexport');
    for (const [key, extra] of listed) {
        lines.push('', `## ${{ radio: 'For ticket 37: Fly Sizes as a Radio list', sizeOptions: 'Size options not named Fly Sizes' }[key] || key}`, '', ...table(['Product', 'Live', 'What', 'Values', 'Note'], extra.map(item => [`${item.product_id} ${item.product}`, item.live ? 'yes' : 'no', item.what, item.before, item.note])));
    }
    if (result.extra.reexport) {
        lines.push('', '## The re-export list for ticket 14', '', `${result.extra.reexport.length} Live products have no white-ground photo. The ranked list is [18-reexport-for-14.csv](18-reexport-for-14.csv); the first ${Math.min(SAMPLE, result.extra.reexport.length)}:`, '', ...table(['Rank', 'Tier', 'Product', 'Ground'], result.extra.reexport.slice(0, SAMPLE).map(item => [item.rank, item.tier, `${item.product_id} ${item.product}`, item.thumbnail_ground])));
    }
    lines.push('', '## The diff', '');
    if (!result.rows.length) lines.push('No change.');
    else {
        lines.push(result.rows.length > SAMPLE ? `The first ${SAMPLE} of ${result.rows.length} rows; all of them are in [18-${result.id}.csv](18-${result.id}.csv).` : `${result.rows.length === 1 ? 'The only row' : `All ${result.rows.length} rows`} (also in [18-${result.id}.csv](18-${result.id}.csv)).`, '');
        const live = row => (row.live === null ? '' : ['no', 'yes'][Number(row.live)]);
        lines.push(...table(['Product', 'Live', 'What', 'Before', 'After', 'Note'], result.rows.slice(0, SAMPLE).map(row => [row.product_id === null ? row.product : `${row.product_id} ${row.product}`, live(row), row.what, row.before, row.after, row.note])));
    }
    return `${lines.join('\n')}\n`;
}

const ORDER = 'Each plan is applied as approved, with the sha256 in the table: no fresh dry run between jobs. Fly Sizes goes first. The single-size and multi-size default jobs are planned on its result for the options both write, so apply refuses them, writing nothing, until it is applied, and they stay valid. The other jobs write other objects or other fields (option-names only the name, uncategorised only the categories, brand only the brand, thumbnails and alt-text different fields of an image), so their order doesn\'t matter; brand-fields comes once ticket 14\'s copy is in.';

// The brand listing's URL, from the store's read, for tickets 36, 48 and 03.
function brandLine(results) {
    const url = results.find(result => result.id === 'brand')?.extra?.url;
    const pick = 'Shaun picks A, B or C in [18-brand.md](18-brand.md); no agent default is taken. Until he does, 36\'s page, 48\'s button and refactor 09\'s Signature Redirect rows (ticket 03) have no settled target.';
    const intro = 'The brand record has no intro field (see [18-brand-fields.md](18-brand-fields.md)).';
    if (!url?.url) return `- **Tickets 36, 48 and 03:** the brand listing's URL comes from the API read (each brand's custom_url), and this run has none. The ReelFlies brand is on almost every Live product, so its listing can't gather only the Signature patterns as spec module 12 says. ${pick} ${intro}`;
    const made = url.customized ? 'set by hand (custom_url)' : 'the URL the store made from its name (custom_url, not customized)';
    const planned = url.url === PLANNED_BRAND_URL ? '' : `, not the ${PLANNED_BRAND_URL} they name`;
    const change = url.url === PLANNED_BRAND_URL ? '' : ` No URL change is proposed, so ticket 36 needs none approved: 36's criteria, 48's button and ticket 18's criterion 3 are read against ${url.url}, and refactor 09's Signature rows are dynamic Brand rows, which follow the brand's URL. Setting custom_url to ${PLANNED_BRAND_URL} would be a store-wide catalogue write (the page moves on reelflies.com and live reelflies.ca too), and isn't proposed.`;
    const which = url.name === BRAND_NAME
        ? ` The ReelFlies brand is on almost every Live product, so its listing can't gather only the Signature patterns as spec module 12 says. ${pick}`
        : ` Option B: the "${url.name}" brand's listing is ticket 36's page.`;
    return `- **Tickets 36, 48 and 03:** the ${url.name} brand's listing is at **${url.url}**, ${made}${planned}.${change}${which} ${intro}`;
}

function reexportCount(results) {
    const thumbnails = results.find(result => result.id === 'thumbnails');
    if (!thumbnails) return 'not run';
    const none = thumbnails.counts.noImages || 0;
    return `${thumbnails.extra.reexport.length} Live products with no white-ground photo${none ? `, ${none} of them with no photo at all` : ''}`;
}

export function indexMarkdown(results, { plans, csvResults, meta }) {
    const csvFor = id => csvResults?.find(result => result.id === id);
    const lines = [
        '# 18 · Catalogue jobs: the approval batch',
        '',
        `Made by \`scripts/catalogue/dry-run.mjs\` on ${meta.date}. **Nothing has been written to the store.** Every job here changes the catalogue, which every channel shares (live reelflies.ca, reelflies.com and ReelFlies_CA), so each is Shaun's to approve and to apply (HANDOFF, "Rules for every session"; build pipeline decision 11). Decision 15 (ticket 13) approved the jobs in principle; this batch is the per-diff approval.`,
        '',
        ...sourceLines(meta),
        '',
        '## The jobs',
        '',
        ...table(['Job', 'Decision', meta.api ? 'Changes (API read)' : 'Changes (export)', ...(csvResults ? ['Changes (export)'] : []), 'Requests', 'Plan sha256', 'Page'], results.map(result => [
            result.title,
            result.decision,
            result.rows.length,
            ...(csvResults ? [csvFor(result.id)?.measured === false ? 'not in the export' : csvFor(result.id)?.rows.length ?? ''] : []),
            result.requests.length,
            plans[result.id] ? `\`${short(plans[result.id].sha256)}\`` : '',
            `[18-${result.id}.md](18-${result.id}.md)`,
        ])),
        '',
        '## Before any apply',
        '',
        '- **Ticket 03, item 7** (the scope amendment for store-wide writes) is approved first (ticket 18\'s "Blocked by").',
        '- **The feeds.** Before the Fly Sizes and brand jobs, Shaun tells whoever runs the Google and Meta channels: the size labels change from 2-0 to 2/0, and any report matching "Fly Sizes: 2-0" stops matching; and if he picks option B for the brand, the Signature products\' brand changes to the new one.',
        '- **A token** with Products: modify, made when he applies (decision 11). He pastes it at the hidden prompt, it is never stored, and he revokes it when the run ends: it can write the whole catalogue, and no token an agent can reach has that scope, which is what keeps agents from this write (the terminal check is only a tripwire).',
        `- **Order.** ${ORDER}`,
        '- **The restore trial,** once, before the first batch: apply the first plan to one product, restore it from the snapshot that run printed, and check the product reads as it began. Then apply the whole plan. The plan stays valid, because the restore puts the product back where the plan expects it.',
        '- **Stale plans.** Before each apply an agent runs `--check` on the plan. apply itself reads every object again and refuses the whole plan if any changed since the dry run. Only a plan that --check reports stale is planned again, and its new diff and sha256 come back to Shaun for approval.',
        '',
        '## How Shaun applies a plan',
        '',
        'In his own terminal, from the main clone at origin/master:',
        '',
        '```sh',
        'cd ~/reelflies/theme/cornerstone && git pull --ff-only origin master',
        'node scripts/catalogue/apply.mjs <plan file> --product <id>     # the restore trial: one product',
        'node scripts/catalogue/apply.mjs --restore <before-snapshot> --product <id>',
        'node scripts/catalogue/apply.mjs <plan file>                    # the whole plan',
        '```',
        '',
        'Each run prints the release calendar\'s phase (with a warning from T-14) and the exact requests, refuses unless the tooling is origin/master\'s, asks for the token at a hidden prompt, reads the store fresh, shows the diff it derived, and asks him to type the first 8 characters of the plan\'s sha256 (the table above). Then it writes a snapshot of every object it will touch, sends the requests in batches of 50, re-reads each batch, and logs every request in `~/reelflies/store-snapshots/log.jsonl`. It prints the restore command for that run.',
        '',
        '## After each apply, the same day',
        '',
        '- A product page this run changed, on reelflies.com and on live reelflies.ca: its sizes render and it adds to the cart (and its thumbnail or brand shows, for those jobs). Recorded, dated, in a ticket 18 comment, beside Shaun\'s approval of the plan.',
        '- Shaun revokes the Products: modify token.',
        '- An agent runs `node ~/reelflies/theme/cornerstone/scripts/catalogue/apply.mjs --check <plan file>` (GETs only, the read-only token): every request reads as planned.',
        '- After the Fly Sizes and multi-size default applies, an agent also reruns the dry run over the whole catalogue, because `--check` reads only the plan\'s own objects: `node scripts/catalogue/dry-run.mjs --api --jobs fly-sizes,default-sizes --images skip --out <a scratch folder>` (GETs only). It records "renamed 0, reordered 0, multi-size defaults 0" in ticket 18 for criterion 1, with 4506 the only exception until criterion 2 is settled.',
        '- The orchestrator opens a re-baseline epoch for the page kinds the job moved (build pipeline section 6.6: "18\'s apply").',
        '',
        '## Waiting, and notes for other tickets',
        '',
        '- **Merchant Center diagnostics** (SEO-16) need Shaun\'s Google login: he reads them with an agent once before the freeze, and the result goes in ticket 18\'s comments.',
        `- **Ticket 14:** the re-export list (${reexportCount(results)}), best sellers first, is [18-reexport-for-14.csv](18-reexport-for-14.csv).`,
        '- **Ticket 14\'s re-exported photos** aren\'t uploaded yet: an upload creates an image (a POST), which apply\'s allowlist doesn\'t hold. When ticket 14\'s files arrive, that one write is added to the guarded allowlist in its own PR, with `rf/safety`, and the new thumbnails are planned from a fresh dry run for Shaun\'s approval. Until then the thumbnail plan covers only the swaps to a photo already on white.',
        brandLine(results),
        '- **Ticket 37:** the Fly Sizes option shown as a Radio list is in [18-fly-sizes.md](18-fly-sizes.md).',
        '- **Tickets 33 and 37** keep accepting both size spellings until the Fly Sizes job is applied.',
    ];
    return `${lines.join('\n')}\n`;
}

export function writeReports(outDir, results, {
    plans = {}, csvResults = null, meta,
}) {
    fs.mkdirSync(outDir, { recursive: true });
    const written = [];
    const put = (name, content) => {
        fs.writeFileSync(path.join(outDir, name), content);
        written.push(path.join(outDir, name));
    };
    put('18-catalogue-batch.md', indexMarkdown(results, { plans, csvResults, meta }));
    for (const result of results) {
        const csvResult = csvResults?.find(other => other.id === result.id && other !== result) || null;
        put(`18-${result.id}.md`, jobMarkdown(result, { plan: plans[result.id] || null, csvResult, meta }));
        put(`18-${result.id}.csv`, toCsv(result.rows, ROW_COLUMNS));
        if (result.extra.reexport) put('18-reexport-for-14.csv', toCsv(result.extra.reexport, REEXPORT_COLUMNS));
    }
    return written;
}
