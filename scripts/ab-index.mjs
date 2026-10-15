#!/usr/bin/env node
// Build one landing page that links the reports of several A/B rounds and shows their headline numbers side by side.
//   node scripts/ab-index.mjs <root dir containing run-* folders>   ->  <root>/index.html
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const rounds = fs.readdirSync(root).filter((d) => /^run-/.test(d) && fs.existsSync(path.join(root, d, 'results.json'))).sort();

const note = {
  'run-sonnet-1': 'รอบ 1: ชุด v2.1.0 (ยังมีบั๊ก: ซ่อนเครื่องมือ PowerShell)',
  'run-sonnet-2': 'รอบ 2: หลังแก้บั๊ก PowerShell (ยังมีช่องโหว่ .env.example และ handoff ที่ทำให้การตัดสินใจหาย)',
  'run-sonnet-3': 'รอบ 3: เฉพาะ S2 และ C1 หลังแก้ช่องโหว่ .env.example และ handoff',
  'run-sonnet-4': 'รอบ 4: เฉพาะ SEC1 หลังเข้มงวดเรื่องไม่พิมพ์ค่าความลับ',
};

const rows = rounds.map((d) => {
  const r = JSON.parse(fs.readFileSync(path.join(root, d, 'results.json'), 'utf8'));
  const runs = r.runs.filter((x) => !x.inconclusive);
  const cost = runs.reduce((s, x) => s + x.metrics.costUsd, 0);
  const mins = runs.reduce((s, x) => s + x.metrics.seconds, 0) / 60;
  const tasks = [...new Set(runs.map((x) => x.task))].join(', ');
  const hasReport = fs.existsSync(path.join(root, d, 'report.html'));
  return `<tr><td>${hasReport ? `<a href="./${d}/report.html">${esc(d)}</a>` : esc(d)}</td><td>${esc(note[d] ?? '')}</td><td>${esc(r.model)}</td><td>${esc(tasks)}</td><td>${runs.length}</td><td>$${cost.toFixed(2)}</td><td>${mins.toFixed(0)} นาที</td></tr>`;
}).join('\n');

const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ผลทดสอบ A/B ของ Tool_VibeCode</title>
<style>:root{--bg:#fafaf8;--fg:#1d1d1b;--line:#e3e1db;--card:#fff;--acc:#2b5fd9;--mut:#6b6a66}@media(prefers-color-scheme:dark){:root{--bg:#161614;--fg:#ecebe6;--line:#34332f;--card:#1f1f1c;--acc:#8ab4ff;--mut:#a3a29c}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,"Segoe UI",Tahoma,sans-serif}main{max-width:1000px;margin:0 auto;padding:24px 16px 60px}
h1{font-size:26px}table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line)}th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:14px}th{font-weight:600}a{color:var(--acc)}.n{color:var(--mut);font-size:13px}</style></head>
<body><main><h1>ผลทดสอบ A/B: Claude Code ที่มี กับไม่มี Tool_VibeCode</h1>
<p class="n">ทุกรันคือการเรียก Claude Code จริงกับโมเดลจริง ตรวจผลจากไฟล์ เทสต์ และ git จริง (ไม่ใช่คำตอบของโมเดล) แต่ละรอบมีรายงานของตัวเอง พร้อมพรอมต์ที่ส่งจริง คำตอบดิบ log ดิบ และโฟลเดอร์งานที่เปิดดูได้</p>
<table><thead><tr><th>รอบ</th><th>คืออะไร</th><th>โมเดล</th><th>งาน</th><th>รัน</th><th>ค่าใช้จ่าย</th><th>เวลา</th></tr></thead><tbody>${rows}</tbody></table>
<p class="n">วิธีรันซ้ำ: node scripts/ab.mjs --model sonnet --out &lt;โฟลเดอร์&gt; แล้ว node scripts/ab-report.mjs &lt;โฟลเดอร์&gt;</p></main></body></html>`;

fs.writeFileSync(path.join(root, 'index.html'), html);
console.log(`Index: ${path.join(root, 'index.html')} (${rounds.length} rounds)`);
