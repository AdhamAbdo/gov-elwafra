// Builds the end-user guide: docs/user-guide/user-guide.html (self-contained) and user-guide.pdf.
//   node docs/user-guide/build.mjs
// Chapters live in parts/*.html (sorted by file name). Placeholders: {{icon:Name:size}}, {{diagram:name}}, {{avatar:pose}}.
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as Lucide from "lucide-react";
import { chromium } from "@playwright/test";
import { diagrams } from "./diagrams.mjs";

const DIR = "docs/user-guide";
const VERSION = "1.0";
const DATE = "23 أكتوبر 2026";

// ---- assets -------------------------------------------------------------------------------------------------------
const POSES = { present: "pose-1-1", point: "pose-1-2", welcome: "pose-1-3", tablet: "pose-2-1", pointUp: "pose-2-2", think: "pose-2-4", thumbs: "pose-2-5", pointLeft: "pose-3-1", presentLeft: "pose-3-3", tabletLeft: "pose-3-5" };
const dataUri = async (path, mime) => `data:${mime};base64,${(await readFile(path)).toString("base64")}`;
const avatarCache = new Map();
async function avatar(name) {
  if (!POSES[name]) throw new Error(`Unknown avatar pose "${name}"`);
  if (!avatarCache.has(name)) avatarCache.set(name, await dataUri(`public/avatar/${POSES[name]}.png`, "image/png"));
  return avatarCache.get(name);
}
async function fontCss() {
  let css = await readFile(`${DIR}/assets/fonts.css`, "utf8");
  for (const [, file] of css.matchAll(/url\('fonts\/([^']+)'\)/g)) css = css.replace(`url('fonts/${file}')`, `url('${await dataUri(`${DIR}/assets/fonts/${file}`, "font/woff2")}')`);
  return css;
}
const icon = (name, size = 18) => {
  const C = Lucide[name];
  if (!C) throw new Error(`Unknown icon "${name}"`);
  return renderToStaticMarkup(createElement(C, { size, strokeWidth: 2, "aria-hidden": "true" }));
};
const rings = () => `<svg class="rings" viewBox="0 0 794 1123" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#5eead4" stroke-width="1.2">
<circle cx="700" cy="140" r="120" stroke-opacity=".35"/><circle cx="700" cy="140" r="190" stroke-opacity=".22"/><circle cx="700" cy="140" r="270" stroke-opacity=".14"/><circle cx="700" cy="140" r="360" stroke-opacity=".08"/>
<circle cx="60" cy="1010" r="150" stroke-opacity=".3"/><circle cx="60" cy="1010" r="240" stroke-opacity=".18"/><circle cx="60" cy="1010" r="340" stroke-opacity=".1"/></svg>`;

// ---- placeholder expansion ----------------------------------------------------------------------------------------
const A = (s) => Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
/** Short authoring tags -> the markup styled in style.css. */
function macros(html) {
  html = html.replace(/<callout([^>]*)>([\s\S]*?)<\/callout>/g, (_, a, body) => { const o = A(a); return `<div class="callout" data-hue="${o.hue ?? "teal"}"><span class="ci">{{icon:${o.icon ?? "Info"}:13}}</span><div class="cb">${o.title ? `<b class="ct">${o.title}</b>` : ""}${body}</div></div>`; });
  html = html.replace(/<tip([^>]*)>([\s\S]*?)<\/tip>/g, (_, a, body) => { const o = A(a); return `<div class="tip"><img src="{{avatar:${o.pose ?? "think"}}}" alt=""><div class="bubble"><b class="t">${o.title ?? "نصيحة من المرشد"}</b>${body}</div></div>`; });
  html = html.replace(/<ttl([^>]*)\/>/g, (_, a) => { const o = A(a); return `<div class="tbl-title"><span class="icon-chip">{{icon:${o.icon ?? "Table2"}:14}}</span><b>${o.title}</b>${o.sub ? `<small>${o.sub}</small>` : ""}</div>`; });
  html = html.replace(/<chip([^>]*)>([\s\S]*?)<\/chip>/g, (_, a, t) => `<span class="chip" data-hue="${A(a).hue ?? "gray"}">${t}</span>`);
  html = html.replace(/<kpi([^>]*)>([\s\S]*?)<\/kpi>/g, (_, a, t) => { const o = A(a); return `<div class="kpi"><div class="kh"><span class="icon-chip">{{icon:${o.icon}:14}}</span><b>${o.title}</b></div><p>${t}</p></div>`; });
  html = html.replace(/<card([^>]*)>([\s\S]*?)<\/card>/g, (_, a, t) => { const o = A(a); return `<div class="card${o.top === undefined ? "" : " top"}"><div class="head"><span class="icon-chip">{{icon:${o.icon}:14}}</span><h4>${o.title}</h4></div><p>${t}</p></div>`; });
  return html.replace(/<yes\/>/g, '<span class="yes">{{icon:Check:12}}</span>').replace(/<no\/>/g, '<span class="no">{{icon:Minus:12}}</span>').replace(/<part\/>/g, '<span class="part">{{icon:CircleDot:11}}</span>');
}
async function expand(html) {
  html = macros(html);
  html = html.replace(/\{\{icon:(\w+)(?::(\d+))?\}\}/g, (_, n, s) => icon(n, s ? Number(s) : 18));
  html = html.replace(/\{\{diagram:(\w+)\}\}/g, (_, n) => { if (!diagrams[n]) throw new Error(`Unknown diagram "${n}"`); return diagrams[n](); });
  html = html.replace(/\{\{rings\}\}/g, rings());
  const poses = [...new Set([...html.matchAll(/\{\{avatar:(\w+)\}\}/g)].map((m) => m[1]))];
  for (const p of poses) html = html.replaceAll(`{{avatar:${p}}}`, await avatar(p));
  return html.replaceAll("{{version}}", VERSION).replaceAll("{{date}}", DATE);
}

// ---- chapters -----------------------------------------------------------------------------------------------------
const attr = (tag, name) => (tag.match(new RegExp(`${name}="([^"]*)"`)) ?? [])[1] ?? "";
function openChapter(section) {
  const tag = section.match(/<section[^>]*>/)[0];
  const [id, num, ic, title, lead, pose] = ["id", "data-num", "data-icon", "data-title", "data-lead", "data-pose"].map((a) => attr(tag, a));
  const opener = `<header class="chapter-open"><div class="tag"><span class="icon-chip">{{icon:${ic}:19}}</span><span>الفصل ${num}</span></div><h1>${title}</h1><p>${lead}</p><img class="peek" src="{{avatar:${pose || "tablet"}}}" alt=""></header>`;
  return { id, num, title, lead, icon: ic, html: section.replace(tag, tag + opener) };
}

const pdfPages = (buf) => Math.max(...[...buf.toString("latin1").matchAll(/\/Count (\d+)/g)].map((m) => Number(m[1])));

async function main() {
  const files = (await readdir(`${DIR}/parts`)).filter((f) => f.endsWith(".html")).sort();
  const read = (f) => readFile(`${DIR}/parts/${f}`, "utf8");
  const cover = await read(files.find((f) => f.includes("cover")));
  const back = await read(files.find((f) => f.includes("back")));
  const chapters = [];
  for (const f of files.filter((f) => /^\d\d-/.test(f) && !f.includes("cover") && !f.includes("back"))) chapters.push(openChapter(await read(f)));

  const style = (await readFile(`${DIR}/style.css`, "utf8")) + "\n" + (await fontCss());
  const shell = (body) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>دليل المستخدم — نظام الحوكمة والامتثال</title><style>${style}</style></head><body>${body}</body></html>`;
  const tocHtml = (pages) => `<section class="toc"><h1>المحتويات</h1><p class="toc-sub">اضغط على أي عنوان للانتقال إليه مباشرة.</p><ol class="toc-list">${chapters.map((c, i) => `<li><a href="#${c.id}"><span class="toc-num">${c.num}</span><span class="toc-title">${c.title}</span><span class="toc-dots"></span><span class="toc-page">${pages ? pages[i] : ""}</span></a></li>`).join("")}</ol>
    <div class="paths"><h2>ابدأ من هنا بحسب دورك</h2><div class="grid g4">
      <div class="card top"><div class="head"><span class="icon-chip">{{icon:ClipboardCheck:14}}</span><h4>مسؤول امتثال</h4></div><p>الفصول 2 و4 و5 و8 و9 و10 و14.</p></div>
      <div class="card top"><div class="head"><span class="icon-chip">{{icon:Building2:14}}</span><h4>مدير شركة أو مدير عام</h4></div><p>الفصول 3 و4 و5 و6 و7 و8 و9 و13.</p></div>
      <div class="card top"><div class="head"><span class="icon-chip">{{icon:ShieldCheck:14}}</span><h4>مسؤول النظام</h4></div><p>الفصول 3 و7 و11 و15 و17.</p></div>
      <div class="card top"><div class="head"><span class="icon-chip">{{icon:Eye:14}}</span><h4>اطلاع فقط</h4></div><p>الفصول 2 و4 و18 و19.</p></div>
    </div></div></section>`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const render = async (html) => { await page.setContent(await expand(html), { waitUntil: "load" }); await page.evaluate(() => document.fonts.ready); return page.pdf({ preferCSSPageSize: true, printBackground: true }); };

  // Each chapter starts on a new page, so a chapter's start page = cover + contents + the pages of every earlier chapter + 1.
  const tocPages = pdfPages(await render(shell(tocHtml(chapters.map(() => "00")))));
  const counts = [];
  for (const c of chapters) counts.push(pdfPages(await render(shell(c.html))));
  let at = 1 + tocPages + 1; const starts = counts.map((n) => { const s = at; at += n; return s; });

  const body = cover + tocHtml(starts) + chapters.map((c) => c.html).join("\n") + back;
  const html = await expand(shell(body));
  await writeFile(`${DIR}/user-guide.html`, html);
  await page.setContent(html, { waitUntil: "load" }); await page.evaluate(() => document.fonts.ready);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  await writeFile(`${DIR}/user-guide.pdf`, pdf);
  await browser.close();
  const total = pdfPages(pdf);
  console.log(`chapters: ${chapters.length}, contents pages: ${tocPages}, total pages: ${total} (expected ${at - 1 + 1})`);
  console.log(`user-guide.pdf: ${(pdf.length / 1024).toFixed(0)} KB, user-guide.html: ${(html.length / 1024).toFixed(0)} KB`);
}
await main();
