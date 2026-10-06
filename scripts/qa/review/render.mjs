// The review page's HTML (W0-10), from a model built by model.mjs.
//
// The orchestrator publishes a checkpoint page as a private claude.ai artifact, so the page
// is content only: claude.ai wraps it in its own document (wrapDocument makes the same
// document for the local preview). Its <title> comes first, colours are tokens with a dark
// theme, it loads nothing but Google Fonts, and it works at phone width.
//
// renderReviewPage(model, { href }): href(image) gives an image's src, or { src, width,
// height }; review.mjs passes the encoded files (or data: URIs with --inline).

import { channelName, widthLabel } from './model.mjs';

const esc = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
// Notes may mark commands and paths with backticks.
const inline = value => esc(value).replace(/`([^`]+)`/g, '<code>$1</code>');
const join = parts => parts.filter(Boolean).join('');

const PAGE_NAMES = {
    home: 'Home',
    'fly-type': 'Fly Type page',
    category: 'Category (stock)',
    species: 'Species page',
    'species-hub': 'Species hub',
    product: 'Product page',
    cart: 'Cart',
    'hook-chart': 'Hook size chart',
    brand: 'Brand listing',
    404: '404 page',
};
const pageName = page => {
    const [kind, name] = String(page).split('@');
    return `${PAGE_NAMES[kind] || kind}${name ? ` (${name})` : ''}`;
};

const STYLE = `
/* Layout: a proof board. Each template sits beside its reference like a print proof, phone
   proofs narrow on the left and desktop proofs wide on the right; the run's facts sit in a
   mono margin above. ReelFlies' own sage, buy green and Onest carry the identity. */
:root {
  --bg: #f6f7f4;
  --surface: #ffffff;
  --sunk: #eef1ec;
  --ink: #1d231e;
  --muted: #5b655c;
  --line: #d9dfd7;
  --accent: #5d705c;
  --accent-ink: #ffffff;
  --sage: #7b8e7a;
  --sage-soft: #e5ebe3;
  --warn: #8a5300;
  --warn-soft: #fbf0dc;
  --fail: #a32d2d;
  --fail-soft: #fbe6e4;
  --add: #2f6b3a;
  --del: #a32d2d;
  --font-ui: "Onest", "Segoe UI", system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --radius: 16px;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #121512; --surface: #1a1f1b; --sunk: #151915; --ink: #e5eae4; --muted: #a2ada3; --line: #2d352e;
    --accent: #a9bda8; --accent-ink: #121512; --sage: #93a792; --sage-soft: #232c24;
    --warn: #f0b860; --warn-soft: #2e2414; --fail: #f08a80; --fail-soft: #33191a; --add: #8fd19b; --del: #f08a80;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #121512; --surface: #1a1f1b; --sunk: #151915; --ink: #e5eae4; --muted: #a2ada3; --line: #2d352e;
  --accent: #a9bda8; --accent-ink: #121512; --sage: #93a792; --sage-soft: #232c24;
  --warn: #f0b860; --warn-soft: #2e2414; --fail: #f08a80; --fail-soft: #33191a; --add: #8fd19b; --del: #f08a80;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--ink); font: 400 15px/1.55 var(--font-ui); }
.page { max-width: 1320px; margin: 0 auto; padding-inline: 16px; padding-block: 28px 64px; display: grid; gap: 40px; }
h1, h2, h3, h4 { margin: 0; text-wrap: balance; line-height: 1.2; }
h1 { font-size: clamp(26px, 4vw, 38px); font-weight: 600; letter-spacing: -0.01em; }
h2 { font-size: 22px; font-weight: 600; display: flex; align-items: baseline; gap: 12px; }
h3 { font-size: 18px; font-weight: 600; }
h4 { font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
p { margin: 0; max-width: 68ch; }
code, .mono { font-family: var(--font-mono); font-size: 0.86em; }
code { background: var(--sunk); border: 1px solid var(--line); border-radius: 6px; padding: 0 5px; overflow-wrap: anywhere; }
a { color: var(--accent); }
a:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
.masthead { display: grid; gap: 14px; border-bottom: 1px solid var(--line); padding-bottom: 28px; }
.eyebrow { font-size: 12.5px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; color: var(--sage); }
.facts { display: flex; flex-wrap: wrap; gap: 6px 22px; margin: 0; font-family: var(--font-mono); font-size: 12.5px; color: var(--muted); }
.facts div { display: flex; gap: 6px; }
.facts dt { color: var(--muted); }
.facts dd { margin: 0; color: var(--ink); }
.local { background: var(--warn-soft); color: var(--warn); border-radius: 999px; padding: 4px 12px; font-weight: 500; font-size: 13px; justify-self: start; }
.toc { display: flex; flex-wrap: wrap; gap: 6px; }
.toc a { text-decoration: none; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 5px 12px; font-size: 13.5px; display: inline-flex; gap: 8px; align-items: baseline; }
.toc a:hover { border-color: var(--sage); }
.toc .num { color: var(--sage); font-family: var(--font-mono); font-size: 12px; }
.run-notes { background: var(--warn-soft); color: var(--ink); border-radius: var(--radius); padding: 16px 18px; display: grid; gap: 8px; }
.run-notes h2 { font-size: 15px; color: var(--warn); }
.run-notes ul { margin: 0; padding-left: 20px; display: grid; gap: 4px; }
section.part { display: grid; gap: 18px; scroll-margin-top: 16px; }
section.part > h2 .num { font-family: var(--font-mono); font-size: 14px; color: var(--accent-ink); background: var(--accent); border-radius: 999px; min-width: 28px; height: 28px; display: inline-grid; place-items: center; }
.lede { color: var(--muted); }
.empty { color: var(--muted); font-style: italic; }
.sub { display: grid; gap: 10px; }
.items { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.item { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; display: grid; gap: 6px; min-width: 0; }
.item-head { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: baseline; }
.chip { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 500; letter-spacing: 0.02em; border-radius: 999px; padding: 2px 9px; background: var(--sage-soft); color: var(--ink); white-space: nowrap; }
.chip.ticket { font-family: var(--font-mono); }
.chip.revisit { background: transparent; border: 1px solid var(--sage); color: var(--accent); }
.chip.warn { background: var(--warn-soft); color: var(--warn); }
.chip.fail { background: var(--fail-soft); color: var(--fail); }
.chip.ok { background: var(--sage-soft); color: var(--accent); }
pre.diff { margin: 0; background: var(--sunk); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; overflow-x: auto; font: 12.5px/1.5 var(--font-mono); }
pre.diff .add { color: var(--add); }
pre.diff .del { color: var(--del); }
.tpl { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px; display: grid; gap: 16px; min-width: 0; }
.tpl-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 16px; align-items: baseline; }
.tpl-head .where { color: var(--muted); font-size: 13.5px; display: flex; flex-wrap: wrap; gap: 4px 12px; }
.widths { display: grid; gap: 18px; grid-template-columns: minmax(0, 1fr); }
@media (min-width: 900px) { .widths.two { grid-template-columns: minmax(0, 0.62fr) minmax(0, 1.38fr); } }
.width { display: grid; gap: 8px; min-width: 0; align-content: start; }
.proofs { display: grid; gap: 10px; grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr)); }
figure { margin: 0; display: grid; gap: 6px; min-width: 0; align-content: start; }
figcaption { font-size: 12.5px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; }
figcaption b { color: var(--ink); font-weight: 500; }
.file { font: 11.5px/1.4 var(--font-mono); color: var(--muted); overflow-wrap: anywhere; }
.shot { border: 1px solid var(--line); border-radius: 10px; background: var(--sunk); max-height: 760px; overflow: auto; overscroll-behavior: contain; }
.shot img { display: block; width: 100%; height: auto; }
.shot.none { display: grid; place-items: center; min-height: 140px; color: var(--muted); font-size: 13px; padding: 16px; text-align: center; }
.group { display: grid; gap: 14px; }
.group-head { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: baseline; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
.group-head .title { color: var(--muted); }
.ref-only { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
.table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
tr:last-child td { border-bottom: 0; }
footer.end { color: var(--muted); font-size: 13px; border-top: 1px solid var(--line); padding-top: 16px; }
@media (max-width: 560px) { .proofs { grid-template-columns: minmax(0, 1fr); } .tpl { padding: 14px; } }
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
`;

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">';

function imageTag(image, href, alt) {
    const given = href(image);
    const { src, width, height } = typeof given === 'string' ? { src: given } : given;
    const size = width && height ? ` width="${width}" height="${height}"` : '';
    const img = `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async"${size}>`;
    return src.startsWith('data:') ? img : `<a href="${esc(src)}" target="_blank" rel="noopener">${img}</a>`;
}

// One image with its caption above; `file` names it below, so captions stay one line and
// the images in a row start level.
function proof(caption, image, href, alt, { note = '', missing = 'No image', file = '' } = {}) {
    return `<figure><figcaption>${caption}${note}</figcaption>${image
        ? `<div class="shot">${imageTag(image, href, alt)}</div>`
        : `<div class="shot none">${missing}</div>`}${file ? `<p class="file">${esc(file)}</p>` : ''}</figure>`;
}

const statusChip = status => {
    if (!status || status === 'passed') return '';
    return status === 'failed'
        ? ' <span class="chip fail">differs from its baseline</span>'
        : ` <span class="chip warn">${esc(status)}</span>`;
};

function templateRow(row, href) {
    const name = pageName(row.page);
    const variant = row.overlay || row.state;
    const widths = row.widths.map(width => {
        const label = widthLabel(width.width);
        const parts = [proof(
            '<b>Theme</b>',
            width.theme.image,
            href,
            `${name}, ${row.channelName}, ${label}: the theme's baseline`,
            { note: statusChip(width.theme.status), file: width.theme.baseline ? width.theme.baseline.split('/').pop() : '' },
        )];
        if (width.theme.actual) parts.push(proof('<b>Last run\'s render</b>', width.theme.actual, href, `${name} at ${label} as the last run rendered it`));
        parts.push(row.reference
            ? proof(`<b>Reference</b> ${esc(row.reference.label)}`, width.reference?.image, href, `${row.reference.label}, ${label}, in the reference design`, { missing: 'Reference screen not shot in this run' })
            : proof('<b>Reference</b>', null, href, '', { missing: 'No reference screen' }));
        return `<div class="width"><h4>${esc(label)}</h4><div class="proofs" style="--cols:${parts.length}">${parts.join('')}</div></div>`;
    });
    return `<article class="tpl">
<div class="tpl-head"><h3>${esc(name)}${variant ? ` <span class="chip">${esc(variant)}</span>` : ''}</h3>
<p class="where"><span>${esc(row.channelName)}</span><span>${esc(row.variation)}</span><code>${esc(row.path)}</code></p></div>
<div class="widths${row.widths.length > 1 ? ' two' : ''}">${widths.join('')}</div>
</article>`;
}

function changeCard(item, href, sinceLabel, afterLabel) {
    const name = `${pageName(item.page)}${item.width ? ` · ${widthLabel(item.width)}` : ''}`;
    const statusText = { A: 'new baseline', D: 'baseline removed', M: 'changed' }[item.status] || item.status;
    const commits = item.commits.slice(0, 3).map(commit => `<li><code>${esc(commit.sha.slice(0, 8))}</code> ${esc(commit.subject)}</li>`).join('');
    return `<article class="tpl">
<div class="tpl-head"><h3>${esc(name)}</h3><p class="where"><span>${esc(item.channel ? channelName(item.channel) : '')}</span><span class="chip">${esc(statusText)}</span></p></div>
<div class="proofs" style="--cols:3">
${proof(`<b>Before</b> ${esc(sinceLabel)}`, item.before, href, `${name} before`, { missing: 'No baseline before' })}
${proof(`<b>After</b> ${esc(afterLabel)}`, item.after, href, `${name} after`, { missing: 'Removed' })}
${proof(`<b>Reference</b>${item.referenceLabel ? ` ${esc(item.referenceLabel)}` : ''}`, item.reference, href, `${item.referenceLabel || ''} in the reference design`, { missing: item.referenceLabel ? 'Reference screen not shot in this run' : 'No reference screen' })}
</div>
<p class="mono" style="font-size:12px;color:var(--muted);overflow-wrap:anywhere">${esc(item.path)}</p>
${commits ? `<ul class="items" style="font-size:13px">${commits}</ul>` : ''}
</article>`;
}

const part = (id, num, heading, body, lede = '') => `<section class="part" id="${id}" aria-labelledby="${id}-h">
<h2 id="${id}-h"><span class="num">${num}</span>${esc(heading)}</h2>
${lede ? `<p class="lede">${lede}</p>` : ''}
${body}
</section>`;

const ticketChip = ticket => (ticket ? `<span class="chip ticket">${esc(/^\d+$/.test(ticket) ? `Ticket ${ticket}` : ticket)}</span>` : '');
const waveChip = wave => (wave !== null && wave !== undefined && wave !== '' ? `<span class="chip">Wave ${esc(wave)}</span>` : '');

function diffBlock(diff) {
    if (!diff) return '';
    const body = String(diff).split('\n').map(line => {
        if (/^\+(?!\+\+)/.test(line)) return `<span class="add">${esc(line)}</span>`;
        if (/^-(?!--)/.test(line)) return `<span class="del">${esc(line)}</span>`;
        return esc(line);
    }).join('\n');
    return `<pre class="diff">${body}</pre>`;
}

function forShaun(model) {
    const {
        approvals, pairedReleases, access, draftCopy,
    } = model.forShaun;
    if (!approvals.length && !pairedReleases.length && !access.length && !draftCopy.length) {
        return '<p class="empty">Nothing is waiting for you at this checkpoint.</p>';
    }
    const list = (heading, entries, item) => `<div class="sub"><h3>${heading}</h3>${entries.length
        ? `<ul class="items">${entries.map(entry => `<li class="item">${item(entry)}</li>`).join('')}</ul>`
        : '<p class="empty">None.</p>'}</div>`;
    return join([
        list('Approvals waiting', approvals, entry => `<div class="item-head">${ticketChip(entry.ticket)}<b>${inline(entry.title)}</b></div>${entry.detail ? `<p>${inline(entry.detail)}</p>` : ''}${diffBlock(entry.diff)}`),
        list('Paired channel-1 releases pending', pairedReleases, entry => `<div class="item-head"><code>${esc(entry.uuid || '')}</code>${entry.commit ? `<code>${esc(entry.commit)}</code>` : ''}</div>${entry.note ? `<p>${inline(entry.note)}</p>` : ''}`),
        list('Tokens and cookie sessions needed', access, entry => `<div class="item-head">${ticketChip(entry.ticket)}<b>${inline(entry.what)}</b></div>${entry.why ? `<p>${inline(entry.why)}</p>` : ''}`),
        list('DRAFT copy to approve', draftCopy, entry => `<div class="item-head">${ticketChip(entry.ticket)}<b>${inline(entry.where)}</b></div>${entry.text ? `<p>${inline(entry.text)}</p>` : ''}`),
    ]);
}

function defaultsList(model) {
    if (!model.defaults.length) return '<p class="empty">No defaults were taken since the last checkpoint.</p>';
    return `<ul class="items">${model.defaults.map(entry => `<li class="item"><div class="item-head">${ticketChip(entry.ticket)}${waveChip(entry.wave)}<span class="chip revisit">Revisitable</span></div><p>${inline(entry.text)}</p></li>`).join('')}</ul>`;
}

function templatesPart(model, href) {
    const rows = model.templates.length
        ? model.templates.map(row => templateRow(row, href)).join('\n')
        : '<p class="empty">No template screenshots are in the manifest. Run <code>npm run qa:screens</code>, and <code>QA_CHANNEL=1 npm run qa:screens</code>, first.</p>';
    const refOnly = model.referenceOnly.filter(anchor => anchor.widths.length);
    const extra = refOnly.length
        ? `<div class="sub"><h3>Reference screens with no template yet</h3><p class="lede">The theme has no page for these until their tickets land.</p>
<div class="ref-only">${refOnly.map(anchor => `<article class="tpl"><h3>${esc(anchor.label)}</h3><div class="proofs" style="--cols:${anchor.widths.length}">${anchor.widths.map(width => proof(`<b>${esc(widthLabel(width.width))}</b>`, width.image, href, `${anchor.label}, ${widthLabel(width.width)}, in the reference design`)).join('')}</div></article>`).join('')}</div></div>`
        : '';
    return rows + extra;
}

function changesPart(model, href) {
    const { changes } = model;
    if (changes.first) {
        return '<p class="empty">This is the first checkpoint, so there is nothing before it. The baselines in section 3 are the "before" set every later checkpoint compares with.</p>';
    }
    if (!changes.groups.length && !changes.epochs.length) return `<p class="empty">No baseline changed since ${esc(changes.since)}.</p>`;
    const after = model.head.short;
    const groups = changes.groups.map(group => `<div class="group"><div class="group-head">${group.ticket ? `<h3>${esc(/^\d/.test(group.ticket) ? `Ticket ${group.ticket}` : group.ticket)}</h3>` : '<h3>No ticket named</h3>'}${waveChip(group.wave)}${group.title ? `<span class="title">${esc(group.title)}</span>` : ''}</div>
${group.items.map(item => changeCard(item, href, changes.since, after)).join('\n')}</div>`);
    const epochs = changes.epochs.length
        ? `<div class="sub"><h3>Re-baseline epochs</h3><p class="lede">Changes from outside any PR, such as a store write or live drift, re-recorded on purpose.</p>
${changes.epochs.map(epoch => `<div class="group"><div class="group-head"><b>${inline(epoch.cause)}</b><code>${esc(epoch.commit.slice(0, 8))}</code></div>${epoch.items.map(item => changeCard(item, href, changes.since, after)).join('\n')}</div>`).join('\n')}</div>`
        : '';
    return groups.join('\n') + epochs;
}

function comPart(model, href) {
    const { com } = model;
    const build = com.uuid
        ? `<p>Preview build <code>${esc(com.uuid)}</code>${com.commit ? ` from <code>${esc(com.commit)}</code>` : ''}${com.pushedAt ? `, pushed ${esc(com.pushedAt)}` : ''}. Open it from My Themes on reelflies.com, without applying it.</p>`
        : '<p class="empty">No build uuid was given for your My Themes preview at this checkpoint.</p>';
    const renders = com.templates.length
        ? com.templates.map(row => templateRow(row, href)).join('\n')
        : '<p class="empty">No .com renders are in this checkpoint. They come from <code>stencil start -c 1855224 -v \'ReelFlies US\'</code> once 1855224 has pinned pages.</p>';
    return `${build}${com.note ? `<p>${inline(com.note)}</p>` : ''}${renders}`;
}

function livePart(model, href) {
    const { liveHome } = model;
    const note = liveHome.note ? `<p>${inline(liveHome.note)}</p>` : '';
    if (!liveHome.shots.length) {
        return `${note}<p class="empty">Not shot for this checkpoint. Run <code>npx playwright test --config scripts/qa/playwright.config.mjs review-live</code> first.</p>`;
    }
    return `${note}<div class="proofs" style="--cols:${liveHome.shots.length}">${liveHome.shots.map(shot => proof(`<b>${esc(widthLabel(shot.width))}</b> ${esc(shot.channelName)}`, shot.image, href, `The live home page, ${widthLabel(shot.width)}, with its widgets`)).join('')}</div>`;
}

function waitingPart(model) {
    if (!model.waiting.length) return '<p class="empty">No criteria are waiting.</p>';
    return `<div class="table-wrap"><table><thead><tr><th scope="col">Ticket</th><th scope="col">Criterion</th><th scope="col">Waiting on</th></tr></thead><tbody>
${model.waiting.map(entry => `<tr><td>${ticketChip(String(entry.ticket ?? ''))}</td><td>${inline(entry.criterion)}</td><td>${inline(entry.trigger)}</td></tr>`).join('\n')}
</tbody></table></div>`;
}

function runNotes(notes) {
    if (!notes.length) return '';
    return `<aside class="run-notes" aria-labelledby="run-notes-h"><h2 id="run-notes-h">About this run</h2><ul>${notes.map(note => `<li>${inline(note)}</li>`).join('')}</ul></aside>`;
}

const facts = entries => `<dl class="facts">${entries.filter(([, value]) => value).map(([term, value]) => `<div><dt>${esc(term)}</dt><dd>${value}</dd></div>`).join('')}</dl>`;

function checkpointPage(model, href) {
    const toc = [
        ['for-shaun', 'For Shaun'], ['defaults', 'Defaults taken'], ['templates', 'Templates and reference'], ['before-after', 'Before and after'],
        ['com', 'reelflies.com'], ['live-home', 'Live home page'], ['waiting', 'Waiting'],
    ].map(([id, label], index) => `<a href="#${id}"><span class="num">${index + 1}</span>${label}</a>`).join('');
    return `<title>ReelFlies ${esc(model.name)}</title>
${FONTS}
<style>${STYLE}</style>
<div class="page">
<header class="masthead">
<p class="eyebrow">ReelFlies storefront · review checkpoint</p>
<h1>${esc(model.title)}</h1>
${facts([
        ['Checkpoint', esc(model.name)],
        ['Covers', model.since ? `since ${esc(model.since)}` : 'first checkpoint'],
        ['Commit', `${esc(model.head.short)} on ${esc(model.head.branch)}${model.head.dirty ? ' (uncommitted changes)' : ''}`],
        ['Made', esc(model.date)],
    ])}
${model.intro ? `<p>${inline(model.intro)}</p>` : ''}
<nav class="toc" aria-label="Sections">${toc}</nav>
</header>
${runNotes(model.notes)}
${part('for-shaun', 1, 'For Shaun', forShaun(model), 'Approvals waiting, paired channel-1 releases, tokens and cookie sessions, and DRAFT copy.')}
${part('defaults', 2, 'Defaults taken', defaultsList(model), 'Choices agents made with the recommended or default option since the last checkpoint. Each can be revisited: say which, and it becomes a fix ticket.')}
${part('templates', 3, 'Templates beside the reference', templatesPart(model, href), 'Each template the theme renders today, at 375 and 1280, beside the matching screen of the reference design. Prices, stock, cart counts and widgets are masked in the theme\'s baselines. Tall pages scroll inside their frame; open any image for full size.')}
${part('before-after', 4, 'Before and after', changesPart(model, href), 'Every baseline changed since the last checkpoint tag, grouped by ticket.')}
${part('com', 5, 'reelflies.com', comPart(model, href), 'Local renders with .com\'s products and categories, and the build to open in My Themes.')}
${part('live-home', 6, 'Live home page on ReelFlies_CA', livePart(model, href), 'The home page on 1895766 with its widgets and nothing masked. Page baselines hide widgets, so this is where they show.')}
${part('waiting', 7, 'Criteria waiting', waitingPart(model), 'Acceptance criteria waiting on refactor 13 or 14, a token, the preview cookie or an approval.')}
<footer class="end"><p>Made by <code>scripts/qa/review/review.mjs</code> from <code>scripts/qa/results/manifest.json</code> at ${esc(model.generatedAt)}.</p></footer>
</div>
`;
}

function prPage(model, href) {
    const { pr } = model;
    const body = model.items.length
        ? model.items.map(item => changeCard(item, href, pr.base, 'this PR')).join('\n')
        : '<p class="empty">This PR changes no baseline.</p>';
    return `<title>ReelFlies ${esc(model.name)} baselines</title>
${FONTS}
<style>${STYLE}</style>
<div class="page">
<header class="masthead">
<p class="eyebrow">ReelFlies storefront · PR side by side</p>
<h1>${esc(model.title)}</h1>
<p class="local">Local only: this page is never published.</p>
${facts([
        ['PR', esc(pr.label)],
        ['Branch', pr.branch ? esc(pr.branch) : ''],
        ['Base', `${esc(pr.base)}${pr.mergeBase ? ` (merge base ${esc(pr.mergeBase.slice(0, 8))})` : ''}`],
        ['Head', `${esc(model.head.short)}${model.head.dirty ? ' with uncommitted changes' : ''}`],
        ['Made', esc(model.generatedAt)],
    ])}
<p>Each changed baseline as the base has it and as this branch has it, beside the reference screen. A visible gap from the reference is a finding unless the ticket records it as a deviation.</p>
</header>
${runNotes(model.notes)}
<section class="part" id="changed" aria-labelledby="changed-h"><h2 id="changed-h">Changed baselines</h2>
${body}
</section>
</div>
`;
}

export function renderReviewPage(model, { href }) {
    return model.mode === 'pr' ? prPage(model, href) : checkpointPage(model, href);
}

// The document claude.ai wraps a published page in, for viewing the page locally.
export const wrapDocument = fragment => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px/1.4 system-ui,sans-serif;background:#fafafa}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${fragment}
</body>
</html>
`;
