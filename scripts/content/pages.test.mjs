// The Web Page sources for ReelFlies_CA (content/pages/1895766/, ticket 22) and the requests
// they become for the store-write helper (scripts/store/, W0-11).
//
// - The format rules (pageProblems) on small sites built here, a failing case for each rule.
// - Ticket 22's acceptance criteria that the sources themselves can meet, on the real files:
//   decision 2's free-shipping wording, CONTEXT.md's Cancellation, Claim and Return, decision
//   10's promise line with no return window and no hasMerchantReturnPolicy, decision 11's
//   form-only contact, the CASL wording and the outside-Canada sentence on the Privacy page,
//   About without the privacy policy, and the Help page's links.
// - pagesToRequests: what it builds passes W0-11's own allowlist and channel check.
//
//   node --test scripts/content/pages.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../store/allowlist.mjs';
import { CHANNEL, requestChannelProblems } from '../store/channel.mjs';
import {
    PAGES_DIR, draftMarkers, linksIn, pageProblems, pagesToRequests, readPages, textOf,
} from './pages.mjs';

const site = readPages();
const page = url => {
    const found = site.pages.find(item => item.url === url);
    assert.ok(found, `no page at ${url} in ${PAGES_DIR}/pages.json`);
    return found;
};

// A small valid site to break one rule at a time.
const BANNER = '<p class="rf-draft" data-rf-draft="page"><strong>DRAFT</strong> for Shaun\'s approval.</p>';
function sample(overrides = {}, body = `${BANNER}\n<h2>Shipping</h2>\n<p>See <a href="/contact-us/">Contact</a>.</p>`) {
    const base = {
        file: 'shipping-returns.html',
        name: 'Shipping & Returns',
        type: 'page',
        url: '/shipping-returns/',
        path: { kind: 'live', live: '/shipping-returns/', evidence: 'channel 1 page id 2' },
        is_visible: true,
        sort_order: 20,
        meta_description: 'Shipping and returns.',
        status: 'draft',
        approved: null,
        forShaun: [],
        body,
    };
    const contact = {
        ...base,
        file: 'contact-us.html',
        name: 'Contact Us',
        type: 'contact_form',
        contact_fields: 'fullname,phone',
        url: '/contact-us/',
        path: { kind: 'live', live: '/contact-us/', evidence: 'channel 1 page id 4' },
        sort_order: 30,
        body: `${BANNER}\n<p>Call us.</p>`,
    };
    return {
        channel_id: CHANNEL,
        dir: `content/pages/${CHANNEL}`,
        pages: [{ ...base, ...overrides }, contact],
        newsletter: {
            status: 'draft', approved: null, line: 'A few emails a year.', consent: 'You can unsubscribe at any time.',
        },
    };
}
const problemsOf = (...args) => pageProblems(sample(...args));

describe('the format rules (pageProblems)', () => {
    it('passes a valid site', () => {
        assert.deepEqual(problemsOf(), []);
    });

    it('passes the real sources', () => {
        assert.deepEqual(pageProblems(site), []);
    });

    it('refuses any channel but 1895766, in the manifest or the folder', () => {
        assert.match(pageProblems({ ...sample(), channel_id: 1 }).join('\n'), /channel_id 1 isn't 1895766/);
        assert.match(pageProblems({ ...sample(), dir: 'content/pages/1855224' }).join('\n'), /folder .*1855224.* isn't 1895766/);
    });

    it('refuses an unknown type, a bad path, and a repeated url or name', () => {
        assert.match(problemsOf({ type: 'raw' }).join('\n'), /type "raw"/);
        assert.match(problemsOf({ url: '/Shipping Returns' }).join('\n'), /url "\/Shipping Returns" isn't a lower-case path/);
        assert.match(problemsOf({ url: '/contact-us/' }).join('\n'), /url \/contact-us\/ is used twice/);
        assert.match(problemsOf({ name: 'Contact Us' }).join('\n'), /name "Contact Us" is used twice/);
    });

    it('asks a live path to match its url, and a new path to give its reason', () => {
        assert.match(problemsOf({ path: { kind: 'live', live: '/shipping/', evidence: 'x' } }).join('\n'), /live path \/shipping\/ isn't its url/);
        assert.match(problemsOf({ path: { kind: 'new' } }).join('\n'), /a new path needs its reason/);
        assert.match(problemsOf({ path: { kind: 'moved' } }).join('\n'), /path.kind/);
    });

    it('keeps a contact form to the stock fields', () => {
        const site2 = sample();
        site2.pages[1].contact_fields = 'fullname,email';
        assert.match(pageProblems(site2).join('\n'), /contact_fields "email"/);
    });

    it('keeps meta descriptions to 160 characters', () => {
        assert.match(problemsOf({ meta_description: 'x'.repeat(161) }).join('\n'), /meta_description is 161 characters/);
    });

    it('refuses markup that a Web Page body must not carry', () => {
        const cases = [
            ['<h1>Shipping</h1>', /<h1>: the page template already renders the name as the h1/],
            ['<p>open', /<p> is never closed/],
            ['<script>alert(1)</script>', /<script>/],
            ['<style>p{}</style>', /<style>/],
            ['<iframe src="https://example.com/"></iframe>', /<iframe>/],
            ['<p style="color:red">x</p>', /style= attribute/],
            ['<p onclick="x()">x</p>', /onclick= attribute/],
        ];
        for (const [markup, pattern] of cases) {
            assert.match(problemsOf({}, `${BANNER}\n${markup}`).join('\n'), pattern, markup);
        }
    });

    it('refuses an email address anywhere, as decision 11 has no role address yet', () => {
        assert.match(problemsOf({}, `${BANNER}\n<p>Write to someone@example.ca.</p>`).join('\n'), /email address/);
        assert.match(problemsOf({}, `${BANNER}\n<p><a href="mailto:x">us</a></p>`).join('\n'), /mailto/);
        const site2 = sample();
        site2.newsletter.consent = 'Write to someone@example.ca.';
        assert.match(pageProblems(site2).join('\n'), /newsletter.*email address/);
    });

    it('allows links only to these pages, the hook size chart, the blog, https sites and the phone', () => {
        const ok = `${BANNER}\n<p><a href="/contact-us/">a</a> <a href="/fly-hook-size-chart/#size-14">b</a> <a href="/blog/">c</a> <a href="https://reelflies.com/">d</a> <a href="tel:+18662504071">e</a></p>`;
        assert.deepEqual(problemsOf({}, ok), []);
        assert.match(problemsOf({}, `${BANNER}\n<p><a href="/returns/">x</a></p>`).join('\n'), /links to \/returns\/, which isn't one of these pages/);
        assert.match(problemsOf({}, `${BANNER}\n<p><a href="http://reelflies.com/">x</a></p>`).join('\n'), /links to http:\/\/reelflies.com\//);
    });

    it('asks a draft page to open with the DRAFT banner, and its markers to match forShaun', () => {
        assert.match(problemsOf({}, '<p>No banner.</p>').join('\n'), /draft page must open with the DRAFT banner/);
        const marked = `${BANNER}\n<p>Standard <mark data-rf-draft="rates">$X.XX</mark>.</p>`;
        assert.match(problemsOf({}, marked).join('\n'), /marker "rates" has no forShaun entry/);
        assert.deepEqual(problemsOf({ forShaun: [{ key: 'rates', question: 'The standard rate?' }] }, marked), []);
        assert.match(problemsOf({ forShaun: [{ key: 'rates', question: 'The standard rate?' }] }).join('\n'), /forShaun "rates" has no marker in the body/);
        assert.match(problemsOf({ forShaun: [{ question: '' }] }).join('\n'), /forShaun entry 1 has no question/);
    });

    it('asks an approved page to name who approved it and when, and to carry no DRAFT markers', () => {
        const approved = { status: 'approved', approved: { by: 'Shaun', date: '2026-10-20' } };
        assert.deepEqual(problemsOf(approved, '<h2>Shipping</h2>'), []);
        assert.match(problemsOf(approved).join('\n'), /approved page still carries DRAFT markers/);
        assert.match(problemsOf({ status: 'approved' }, '<h2>Shipping</h2>').join('\n'), /approved page needs approved.by and approved.date/);
        assert.match(problemsOf({ approved: { by: 'Shaun', date: '2026-10-20' } }).join('\n'), /draft page has an approval/);
        assert.match(problemsOf({ status: 'live' }).join('\n'), /status "live"/);
    });

    it('refuses "fly-only" and hasMerchantReturnPolicy anywhere (UX-12; decision 10)', () => {
        assert.match(problemsOf({}, `${BANNER}\n<p>Free on fly-only orders.</p>`).join('\n'), /"fly-only"/);
        assert.match(problemsOf({}, `${BANNER}\n<p>Free on fly only orders.</p>`).join('\n'), /"fly-only"/);
        assert.match(problemsOf({ meta_description: 'hasMerchantReturnPolicy' }).join('\n'), /hasMerchantReturnPolicy/);
    });

    it('reads markers and links the way a browser would, ignoring comments', () => {
        const html = '<!-- <mark data-rf-draft="old">x</mark> <a href="/x/">y</a> --><mark data-rf-draft="rates">a</mark><a href="/blog/">b</a>';
        assert.deepEqual(draftMarkers(html), ['rates']);
        assert.deepEqual(linksIn(html), ['/blog/']);
        assert.equal(textOf('<p>Fly&nbsp;orders &amp; gear</p>'), 'Fly orders & gear');
    });
});

describe('ticket 22, on the real sources', () => {
    it('has the five pages at their paths: the live .ca ones, and Help new', () => {
        const urls = site.pages.map(item => item.url).sort();
        assert.deepEqual(urls, ['/about-us/', '/contact-us/', '/help/', '/privacy-policy/', '/shipping-returns/']);
        for (const url of ['/about-us/', '/contact-us/', '/privacy-policy/', '/shipping-returns/']) {
            assert.equal(page(url).path.kind, 'live', url);
        }
        assert.equal(page('/help/').path.kind, 'new');
    });

    it('marks every page DRAFT until Shaun approves its text', () => {
        for (const item of site.pages) assert.equal(item.status, 'draft', item.url);
        assert.equal(site.newsletter.status, 'draft');
    });

    describe('Shipping & Returns', () => {
        const shipping = page('/shipping-returns/');
        const text = textOf(shipping.body);

        it('carries decision 2\'s free-shipping wording, and not the $99 courier offer', () => {
            assert.ok(text.includes('Free standard shipping in Canada on fly orders over $60. Fly boxes and gear not included.'));
            assert.doesNotMatch(text, /\$99/);
        });

        it('uses Cancellation, Claim and Return as CONTEXT.md defines them, with their headings', () => {
            const headings = [...shipping.body.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g)].map(([, inner]) => textOf(inner));
            for (const term of ['Cancellation', 'Claim', 'Return']) {
                assert.ok(headings.some(heading => heading.includes(term)), `a heading names ${term}: ${headings.join(' | ')}`);
            }
            assert.match(text, /before your order ships/i);
            assert.match(text, /damaged/);
            assert.match(text, /missing/);
            assert.match(text, /size, pattern or colour/);
            assert.match(text, /replacement or a refund/);
            assert.match(text, /back only when we need to see them to settle a Claim/);
            assert.doesNotMatch(text, /\bRMA\b|exchange/i);
        });

        it('carries decision 10\'s promise line with no return window', () => {
            assert.ok(text.includes('We stand behind every fly we sell.'));
            assert.doesNotMatch(text, /(return|refund|replace|replacement|exchange|money[- ]back|guarantee)\b[^.]{0,60}\b\d+\s*(calendar |business |working )?days?\b/i);
            assert.doesNotMatch(text, /\b\d+[- ]day\b[^.]{0,30}(return|refund|guarantee|money[- ]back)/i);
        });

        it('leaves the rates for Shaun, marked, since decision 12 has no figures yet', () => {
            assert.ok(draftMarkers(shipping.body).includes('rates'));
            assert.ok(shipping.forShaun.some(entry => entry.key === 'rates'));
        });
    });

    describe('Privacy Policy', () => {
        const privacy = page('/privacy-policy/');
        const text = textOf(privacy.body);

        it('carries the CASL consent wording, how consent is given and how to unsubscribe', () => {
            assert.ok(text.includes(site.newsletter.consent), 'the newsletter consent sentence, word for word');
            assert.match(text, /unticked/);
            assert.match(text, /unsubscribe/i);
            assert.match(text, /CASL/);
        });

        it('carries the outside-Canada sentence, marked for Shaun to confirm against ticket 52', () => {
            assert.ok(draftMarkers(privacy.body).includes('region-sentence'));
            const marked = privacy.body.match(/<mark data-rf-draft="region-sentence">([\s\S]*?)<\/mark>/);
            assert.ok(marked, 'the sentence sits inside its marker');
            const sentence = textOf(marked[1]);
            assert.match(sentence, /estimate your country from your connection/);
            assert.match(sentence, /90 days/);
            assert.doesNotMatch(sentence, /nothing is stored/i, 'the prompt keeps its result and the Stay choice in the browser (ticket 52)');
        });

        it('gives the Privacy Officer\'s contact without an email address (decision 11)', () => {
            assert.ok(draftMarkers(privacy.body).includes('privacy-contact'));
            assert.match(text, /Privacy Officer/);
            assert.match(text, /1 866 250 4071/);
        });
    });

    it('About carries no privacy policy, and keeps the promise line', () => {
        const about = page('/about-us/');
        const headings = [...about.body.matchAll(/<h[2-6][^>]*>([\s\S]*?)<\/h[2-6]>/g)].map(([, inner]) => textOf(inner));
        assert.ok(!headings.some(heading => /privacy/i.test(heading)), headings.join(' | '));
        assert.doesNotMatch(textOf(about.body), /personal information|PIPEDA/i);
        assert.ok(textOf(about.body).includes('We stand behind every fly we sell.'));
    });

    it('Help links to the hook size chart and to Shipping & Returns, and says the fly box isn\'t included', () => {
        const help = page('/help/');
        const links = linksIn(help.body);
        assert.ok(links.includes('/fly-hook-size-chart/'), links.join(' '));
        assert.ok(links.includes('/shipping-returns/'), links.join(' '));
        assert.ok(links.includes('https://reelflies.com/'), links.join(' '));
        assert.match(textOf(help.body), /fly box[^.]*isn't included/i);
    });

    it('Contact is the form, the phone number and the address, with no email address', () => {
        const contact = page('/contact-us/');
        const text = textOf(contact.body);
        assert.equal(contact.type, 'contact_form');
        for (const part of ['1 866 250 4071', 'Digital Barn Ltd.', '93 Broadway St.', 'Tillsonburg, ON N4G 3P5', 'Walk-ins by appointment']) {
            assert.ok(text.includes(part), part);
        }
        assert.ok(linksIn(contact.body).includes('tel:+18662504071'));
    });

    it('records the CASL newsletter wording once, for tickets 24 and 50', () => {
        assert.equal(site.newsletter.line, 'A few emails a year about new patterns and ReelFlies sales.');
        assert.equal(site.newsletter.consent, 'By subscribing you agree to receive email from ReelFlies. You can unsubscribe at any time.');
    });
});

describe('pagesToRequests: the store-write helper\'s changes file', () => {
    const allLifted = requests => requests.forEach(request => {
        const what = classify(request, { mode: 'lifted' });
        assert.deepEqual(requestChannelProblems(request, what), [], `${request.method} ${request.path}`);
    });

    it('creates every page in one POST when the channel has none of them', () => {
        const requests = pagesToRequests(site);
        assert.equal(requests.length, 1);
        const [create] = requests;
        assert.equal(create.method, 'POST');
        assert.equal(create.path, '/v3/content/pages');
        assert.equal(create.body.length, site.pages.length);
        for (const body of create.body) {
            assert.equal(body.channel_id, CHANNEL);
            assert.ok(body.body.length > 0);
        }
        allLifted(requests);
    });

    it('sends each page\'s own fields, and the contact form its fields', () => {
        const [create] = pagesToRequests(site);
        const contact = create.body.find(body => body.url === '/contact-us/');
        assert.equal(contact.type, 'contact_form');
        assert.equal(contact.contact_fields, page('/contact-us/').contact_fields);
        const shipping = create.body.find(body => body.url === '/shipping-returns/');
        assert.deepEqual(Object.keys(shipping).sort(), ['body', 'channel_id', 'is_visible', 'meta_description', 'name', 'sort_order', 'type', 'url']);
        assert.equal(shipping.body, page('/shipping-returns/').body);
    });

    it('updates a page the channel already has at the same url, and creates the rest', () => {
        const existing = {
            data: [{
                id: 41, url: '/shipping-returns/', channel_id: CHANNEL, name: 'Shipping & Returns',
            }],
        };
        const requests = pagesToRequests(site, existing);
        assert.deepEqual(requests.map(request => `${request.method} ${request.path}`), ['PUT /v3/content/pages/41', 'POST /v3/content/pages']);
        assert.equal(requests[0].body.url, '/shipping-returns/');
        assert.equal(requests[1].body.length, site.pages.length - 1);
        allLifted(requests);
    });

    it('matches a url with or without its host and trailing slash', () => {
        const existing = [{ id: 7, url: 'https://reelflies-ca-1895766.mybigcommerce.com/help', channel_id: CHANNEL }];
        assert.equal(pagesToRequests(site, existing)[0].path, '/v3/content/pages/7');
    });

    it('refuses a read that names another channel, so nothing is matched across channels', () => {
        assert.throws(() => pagesToRequests(site, [{ id: 2, url: '/shipping-returns/', channel_id: 1 }]), /channel 1, not 1895766/);
    });

    it('sends only PUTs when every page exists', () => {
        const existing = site.pages.map((item, index) => ({ id: 100 + index, url: item.url, channel_id: CHANNEL }));
        const requests = pagesToRequests(site, existing);
        assert.ok(requests.every(request => request.method === 'PUT'));
        allLifted(requests);
    });
});
