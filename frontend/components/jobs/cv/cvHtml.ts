// components/jobs/cv/cvHtml.ts
//
// Renders a CV to a self-contained, print-ready HTML page (A4). The same HTML is
//   · turned into a PDF on the device (expo-print) to save / print / share, and
//   · stored with the CV so a share link (and employers, when attached to an
//     application) can open it in any browser.
// Every user value is escaped; no scripts, no external assets except Google Fonts.

import type { CvData, CvTemplate } from '@/api/jobsApi';

export const EMPTY_CV: CvData = {
    personal: { full_name: '', headline: '', email: '', phone: '', location: '', linkedin: '', website: '' },
    summary: '',
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    languages: [],
    referees: [],
    extras: [],
};

/** Missing sections filled in, so older / AI-made data always has every key. */
export function normalizeCv(data: Partial<CvData> | null | undefined): CvData {
    const d = (data ?? {}) as any;
    return {
        personal: { ...EMPTY_CV.personal, ...(d.personal ?? {}) },
        summary: String(d.summary ?? ''),
        experience: Array.isArray(d.experience) ? d.experience.map((x: any) => ({ role: '', employer: '', location: '', start: '', end: '', current: false, ...x, bullets: Array.isArray(x?.bullets) ? x.bullets : [] })) : [],
        education: Array.isArray(d.education) ? d.education.map((x: any) => ({ qualification: '', institution: '', start: '', end: '', grade: '', ...x })) : [],
        skills: Array.isArray(d.skills) ? d.skills.map(String) : [],
        certifications: Array.isArray(d.certifications) ? d.certifications.map((x: any) => ({ name: '', issuer: '', year: '', number: '', ...x })) : [],
        languages: Array.isArray(d.languages) ? d.languages.map((x: any) => ({ language: '', level: '', ...x })) : [],
        referees: Array.isArray(d.referees) ? d.referees.map((x: any) => ({ name: '', title: '', organisation: '', phone: '', email: '', ...x })) : [],
        extras: Array.isArray(d.extras) ? d.extras.map((x: any) => ({ title: '', ...x, items: Array.isArray(x?.items) ? x.items : [] })) : [],
    };
}

const esc = (v: unknown) =>
    String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const has = (v: unknown) => String(v ?? '').trim().length > 0;
const range = (a: string, b: string, current?: boolean) => [a, current ? 'Present' : b].filter(has).map(esc).join(' – ');
const safeColor = (c: string) => (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(c) ? c : '#2a6ff3');

export function buildCvHtml(raw: CvData, template: CvTemplate = 'modern', accentIn = '#2a6ff3'): string {
    const cv = normalizeCv(raw);
    const accent = safeColor(accentIn);
    const p = cv.personal;
    const contacts = [p.phone, p.email, p.location, p.linkedin, p.website].filter(has).map(esc);

    const section = (title: string, body: string) => (body.trim() ? `<section><h2>${esc(title)}</h2>${body}</section>` : '');

    const experience = cv.experience
        .filter((e) => has(e.role) || has(e.employer))
        .map(
            (e) => `<div class="item">
  <div class="row"><div><div class="title">${esc(e.role)}</div><div class="sub">${[e.employer, e.location].filter(has).map(esc).join(' · ')}</div></div><div class="date">${range(e.start, e.end, e.current)}</div></div>
  ${e.bullets.filter(has).length ? `<ul>${e.bullets.filter(has).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
</div>`,
        )
        .join('');

    const education = cv.education
        .filter((e) => has(e.qualification) || has(e.institution))
        .map(
            (e) => `<div class="item"><div class="row"><div><div class="title">${esc(e.qualification)}</div><div class="sub">${esc(e.institution)}${has(e.grade) ? ` · ${esc(e.grade)}` : ''}</div></div><div class="date">${range(e.start, e.end)}</div></div></div>`,
        )
        .join('');

    const certs = cv.certifications
        .filter((c) => has(c.name))
        .map((c) => `<div class="item"><div class="row"><div><div class="title">${esc(c.name)}</div><div class="sub">${[c.issuer, has(c.number) ? `No. ${c.number}` : ''].filter(has).map(esc).join(' · ')}</div></div><div class="date">${esc(c.year)}</div></div></div>`)
        .join('');

    const skills = cv.skills.filter(has).length ? `<div class="chips">${cv.skills.filter(has).map((s) => `<span>${esc(s)}</span>`).join('')}</div>` : '';
    const languages = cv.languages.filter((l) => has(l.language)).map((l) => `<div class="kv"><b>${esc(l.language)}</b>${has(l.level) ? ` — ${esc(l.level)}` : ''}</div>`).join('');
    const referees = cv.referees
        .filter((r) => has(r.name))
        .map((r) => `<div class="ref"><div class="title">${esc(r.name)}</div><div class="sub">${[r.title, r.organisation].filter(has).map(esc).join(', ')}</div><div class="sub">${[r.phone, r.email].filter(has).map(esc).join(' · ')}</div></div>`)
        .join('');
    const extras = cv.extras
        .filter((x) => has(x.title) && x.items.some(has))
        .map((x) => section(x.title, `<ul>${x.items.filter(has).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`))
        .join('');

    const main =
        section('Profile', has(cv.summary) ? `<p class="summary">${esc(cv.summary)}</p>` : '') +
        section('Experience', experience) +
        section('Education', education) +
        section('Licences & certifications', certs) +
        extras;
    const side = section('Skills', skills) + section('Languages', languages) + section('Referees', referees ? `<div class="refs">${referees}</div>` : '');

    const font = template === 'classic' ? "'Merriweather', Georgia, serif" : "'Inter', 'Segoe UI', Arial, sans-serif";
    const compact = template === 'compact';

    const css = `
@page { size: A4; margin: 14mm 14mm 16mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: ${font}; color: #0f172a; font-size: ${compact ? 10.5 : 11.5}px; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff; }
.page { max-width: 820px; margin: 0 auto; padding: ${compact ? '0' : '6px 0'}; }
header { ${template === 'modern' ? `background: ${accent}; color: #fff; padding: 22px 24px; border-radius: 14px;` : `border-bottom: 3px solid ${accent}; padding-bottom: 12px;`} margin-bottom: 18px; }
h1 { margin: 0; font-size: ${compact ? 22 : 26}px; letter-spacing: -0.4px; }
.headline { margin-top: 4px; font-size: 13px; ${template === 'modern' ? 'opacity: .92;' : `color: ${accent}; font-weight: 600;`} }
.contacts { margin-top: 8px; font-size: 11px; ${template === 'modern' ? 'opacity: .9;' : 'color: #475569;'} }
.contacts span + span:before { content: '  •  '; }
.grid { display: ${template === 'classic' ? 'block' : 'grid'}; grid-template-columns: 1fr 210px; gap: 22px; }
section { margin-bottom: ${compact ? 10 : 14}px; break-inside: avoid-page; }
h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 1.4px; color: ${accent}; margin: 0 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
.item { margin-bottom: ${compact ? 7 : 10}px; break-inside: avoid; }
.row { display: flex; justify-content: space-between; gap: 12px; }
.title { font-weight: 700; font-size: ${compact ? 11.5 : 12.5}px; }
.sub { color: #475569; font-size: 11px; }
.date { color: #64748b; font-size: 10.5px; white-space: nowrap; }
ul { margin: 4px 0 0 16px; padding: 0; }
li { margin: 2px 0; }
.summary { margin: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; }
.chips span { background: ${accent}14; color: ${accent}; border-radius: 999px; padding: 3px 9px; font-size: 10.5px; font-weight: 600; }
.kv { margin-bottom: 3px; }
.ref { margin-bottom: 8px; }
footer { margin-top: 18px; color: #94a3b8; font-size: 9px; text-align: center; }
`;

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.full_name || 'CV')} — CV</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Merriweather:wght@400;700&display=swap" rel="stylesheet">
<style>${css}</style></head>
<body><div class="page">
<header><h1>${esc(p.full_name)}</h1>${has(p.headline) ? `<div class="headline">${esc(p.headline)}</div>` : ''}${contacts.length ? `<div class="contacts">${contacts.map((c) => `<span>${c}</span>`).join('')}</div>` : ''}</header>
${template === 'classic' ? main + side : `<div class="grid"><main>${main}</main><aside>${side}</aside></div>`}
<footer>Made with WaziPOS Jobs</footer>
</div></body></html>`;
}

export function cvFileName(cv: CvData) {
    const name = (cv.personal.full_name || 'CV').trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_');
    return `${name || 'CV'}_CV.pdf`;
}
