# Tool_VibeCode

ชุดเครื่องมือ **จำเป็นทั้งหมดสำหรับ Vibe Coding** กับ Claude Code — ติดตั้งครั้งเดียว ใช้ได้ทุกโปรเจกต์ **อัปเดตได้ทุกครั้งด้วยคำสั่งเดียว** โดยไม่ทับของที่คุณปรับแต่งไว้

> Vibe coding ที่ "ใช้ได้จริงในระยะยาว" ไม่ได้ขึ้นกับพรอมต์เทพ แต่ขึ้นกับ 4 อย่าง: **เครื่องมือครบ · กฎความปลอดภัยที่บังคับจริง · ขั้นตอนทำงานที่ซ้ำได้ · สถานะที่เซฟไว้ข้ามรอบ** ชุดนี้ทำให้ทั้ง 4 อย่างอยู่ในที่เดียว

## เริ่มใช้งาน (ประมาณ 3 นาที)

ต้องมี Node.js 20+ และ Git (ถ้ายังไม่มี สคริปต์ bootstrap ลงให้ได้)

```powershell
# Windows
git clone https://github.com/RabbitsXx/Tool_VibeCode.git
cd Tool_VibeCode
node bin/vibe.mjs doctor                 # ดูว่าเครื่องพร้อมแค่ไหน (ไม่เขียนอะไร)
node bin/vibe.mjs install --dry-run      # ดูก่อนว่าจะเปลี่ยนอะไรใน ~/.claude
node bin/vibe.mjs install                # ติดตั้งจริง (สำรองไฟล์เดิมให้อัตโนมัติ)
```

```bash
# macOS / Linux: เหมือนกัน
node bin/vibe.mjs doctor && node bin/vibe.mjs install
```

เครื่องใหม่ที่ยังไม่มีอะไรเลย ให้ใช้ bootstrap (ลง Git, Node, GitHub CLI, Python, ripgrep, jq, Claude Code แล้วติดตั้งชุดนี้ให้เลย — ถามก่อนลงเสมอ, ใช้ `-DryRun` ดูก่อนได้):

```powershell
powershell -ExecutionPolicy Bypass -File setup\bootstrap.ps1 -DryRun
powershell -ExecutionPolicy Bypass -File setup\bootstrap.ps1
```
```bash
bash setup/bootstrap.sh --dry-run && bash setup/bootstrap.sh
```

จากนั้น **เปิด Claude Code ใหม่** (เพื่อโหลด commands/hooks) แล้วเริ่มโปรเจกต์:

```powershell
node bin/vibe.mjs new C:\work\my-app --git   # สร้างโครงโปรเจกต์พร้อม AGENTS.md, docs/, CI
cd C:\work\my-app
claude
```
แล้วพิมพ์ `/vibe-start อยากทำเว็บ ...` หรือ `/vibe-spec ...`

## อัปเดต (ทำได้ทุกครั้งที่ต้องการ)

| ต้องการ | คำสั่ง |
|---|---|
| ใน Claude Code | `/vibe-update` (หรือ `/vibe-update --check` แค่ดูว่ามีอะไรใหม่) |
| ในเทอร์มินัล | `node bin/vibe.mjs update` |
| แค่ดูว่ามีเวอร์ชันใหม่ไหม ไม่เปลี่ยนอะไร | `node bin/vibe.mjs update --check` |
| ย้อนกลับ | `node bin/vibe.mjs restore` (คืนไฟล์จาก backup ล่าสุด) |

`update` จะ `git pull --ff-only` แล้วติดตั้งซ้ำด้วยโค้ดใหม่ และ **แสดง changelog ของสิ่งที่เปลี่ยนตั้งแต่เวอร์ชันของคุณ** — ไฟล์ที่คุณแก้เองจะถูกข้าม (ไม่ทับ) กฎ/ไฟล์ที่เวอร์ชันใหม่เลิกใช้จะถูกถอนให้เอง
ทุกครั้งที่เปิด Claude Code session ใหม่ ชุดนี้จะเช็กเวอร์ชันใหม่ให้ **ไม่เกินวันละครั้ง** (เงียบถ้าไม่มีอะไรใหม่หรือออฟไลน์; ปิดได้ด้วย `VIBE_NO_UPDATE_CHECK=1`)

## ในชุดนี้มีอะไร

| ส่วน | ติดตั้งไปที่ | ทำอะไร |
|---|---|---|
| **16 slash commands** | `~/.claude/commands/` | `/vibe-start` `/vibe-spec` `/vibe-plan` `/vibe-build` `/vibe-fix` `/vibe-ui` `/vibe-review` `/vibe-test` `/vibe-sec` `/vibe-clean` `/vibe-explain` `/vibe-brief` `/vibe-ship` `/vibe-handoff` `/vibe-resume` `/vibe-update` |
| **7 subagents** | `~/.claude/agents/` | `vibe-planner` `vibe-reviewer` `vibe-debugger` `vibe-test-writer` `vibe-security` `vibe-ui-reviewer` `vibe-researcher` (อ่านงานหนัก ๆ แยก context ไม่ให้บทสนทนาหลักบวม) |
| **Skill** `vibe-workflow` | `~/.claude/skills/` | วงจรทำงาน + Definition of Done + anti-patterns |
| **Guard hooks** (บังคับจริง) | `~/.claude/vibe/hooks/` | **deny**: คำสั่งหายนะ (`rm -rf /`, force-push, format disk …), เขียน `.env`/key/lockfile/`.git`, secret หลุดเข้าโค้ด · **ask** (ถามคุณ ไม่ต้องรีสตาร์ท): `curl \| sh`, `--no-verify`, DROP/TRUNCATE, แก้ `.claude/settings.json` / `.mcp.json` / CI workflow · โหลดสถานะโปรเจกต์ · แจ้งเวอร์ชันใหม่ |
| **Permissions** | `~/.claude/settings.json` (merge) | อนุญาตคำสั่งปลอดภัยที่ใช้บ่อย, ถามก่อนทำสิ่งย้อนกลับยาก (push, reset --hard), ปฏิเสธ force-push และการอ่าน `.env`/`~/.ssh` |
| **กฎกลาง** | `~/.claude/CLAUDE.md` (บล็อกที่ชุดนี้ดูแล) | หลักการทำงาน ความปลอดภัย โครงเอกสารโปรเจกต์ |
| **Project template** | `vibe new <dir>` | `AGENTS.md` + `CLAUDE.md`, `docs/{SPEC,PLAN,TASKS,DECISIONS,HANDOFF}.md`, `.gitignore`, `.env.example`, PR template, CI อัตโนมัติ (Node/Python) |
| **คลังพรอมต์ภาษาไทย** | [`kit/prompts/`](kit/prompts/README.md) | พรอมต์ก๊อปวาง 9 แบบ (เริ่มแอป, แก้บั๊ก, UI, รีวิว, ออกจากลูป, เริ่ม session ใหม่ …) |
| **MCP presets** | `vibe mcp` | context7 (docs ล่าสุดของไลบรารี), playwright (ให้ AI เปิดเบราว์เซอร์ตรวจ UI เอง) |
| **Doctor / Status / Backups** | `vibe doctor` `status` `backups` `restore` | ตรวจเครื่องมือ, สถานะการติดตั้ง, ย้อนกลับ |

## วงจรทำงานประจำวัน

```
/vibe-start หรือ /vibe-spec   →  /vibe-plan  →  /vibe-build (วนทีละชิ้น)  →  /vibe-review  →  /vibe-ship
                                                      │ บั๊ก: /vibe-fix     │ หน้าตา: /vibe-ui
                                                      ▼
                              ยาว/ล้า?  /vibe-handoff  →  เปิด session ใหม่  →  /vibe-resume
```

อ่านรายละเอียดและตัวอย่างที่ [docs/GUIDE.md](docs/GUIDE.md)

## ออกแบบให้ "ใช้ได้ยาว"

- **ไม่ทับของคุณ**: `settings.json` ถูก *merge* (ไม่แตะ `model`, hooks หรือ rules เดิม), `CLAUDE.md` ใช้บล็อกที่มีเครื่องหมายกำกับ ส่วนอื่นเป็นของคุณ, ไฟล์ที่คุณแก้เองจะถูกข้ามตอนอัปเกรด (`--force` ถ้าต้องการทับ — มี backup)
- **Idempotent**: รัน `install` กี่รอบก็ได้ผลเหมือนเดิม; `--dry-run` ดูก่อนเสมอ; backup ไว้ที่ `~/.claude/backups/vibe-*` (เก็บ 10 ชุดล่าสุด)
- **ถอนได้สะอาด**: `vibe uninstall` คืน `settings.json` และ `CLAUDE.md` เป็นของเดิมทุกไบต์ (มีเทสต์ยืนยัน)
- **อัปเกรดไม่ทิ้งขยะ**: กฎ/ไฟล์ที่เวอร์ชันเก่าเคยเพิ่มแต่เวอร์ชันใหม่เลิกแล้ว จะถูกถอนให้ (เฉพาะที่ชุดนี้เป็นเจ้าของ)
- **Guard ที่ไม่น่ารำคาญ**: เข้าใจโครงสร้างคำสั่งจริง (quote, `;` `&&` `|`, `$(...)`, `bash -c`, `powershell -EncodedCommand`) ข้อความที่แค่ *พูดถึง* คำสั่งอันตราย (commit message, echo, heredoc) ไม่ถูกบล็อก และวัดกับคำสั่งจริงจากการใช้งานจริง ไม่ใช่แค่ตัวอย่างในเทสต์
- **Fail-open**: ถ้า hook พังเอง จะไม่ขวาง session ของคุณ (ปิด guard ชั่วคราวได้ด้วย `VIBE_GUARD_OFF=1` ก่อนเปิด `claude`)
- **ไม่มี dependency**: Node built-ins ล้วน ไม่มี `npm install`; hooks เป็นไฟล์เดี่ยว ไม่ import จากชุดนี้ จึงไม่พังถ้าย้าย/ลบ clone
- **มีเทสต์**: `npm test` ครอบคลุม guards, installer, merge/unmerge, ระบบอัปเดตแบบ end-to-end กับ git remote จำลอง, scaffold, CLI และ `vibe verify` ตรวจความสอดคล้องของไฟล์ในชุด

## เอกสารเพิ่มเติม

- [docs/GUIDE.md](docs/GUIDE.md) — วิธี vibe code ด้วยชุดนี้ ตั้งแต่ไอเดียถึงปล่อยงาน
- [docs/SAFETY.md](docs/SAFETY.md) — guard ป้องกันอะไร ไม่ป้องกันอะไร (พูดตรง ๆ)
- [docs/CUSTOMIZE.md](docs/CUSTOMIZE.md) — เพิ่ม/แก้ command, agent, กฎ, permissions, MCP และวิธีออกเวอร์ชันใหม่
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — ปัญหาที่เจอบ่อยและวิธีแก้
- [CHANGELOG.md](CHANGELOG.md)

## โครงสร้าง repo

```
bin/vibe.mjs        CLI (doctor, install, update, status, uninstall, backups, restore, new, mcp, verify)
lib/                โค้ดหลัก (installer, settings merge, update, changelog, doctor, scaffold ...)
kit/claude/         สิ่งที่ติดตั้งเข้า ~/.claude (commands, agents, skills, hooks, CLAUDE.md, settings.fragment.json)
kit/project-template/  โครงโปรเจกต์ใหม่
kit/prompts/        คลังพรอมต์ภาษาไทย
kit/mcp/            MCP presets
setup/              bootstrap.ps1 / bootstrap.sh (ลงเครื่องมือที่ขาด)
scripts/release.mjs ออกเวอร์ชันใหม่ (verify → test → bump → changelog → commit → tag)
tests/              node --test
```

## ข้อจำกัด

- ออกแบบสำหรับ **Claude Code** เป็นหลัก; `AGENTS.md` ในโปรเจกต์ใช้ร่วมกับเอเจนต์อื่น (Codex, Copilot, Gemini) ได้ แต่ commands/hooks ใช้ได้เฉพาะ Claude Code
- Guard hooks เป็น "ตาข่ายกันพลาด" ไม่ใช่ sandbox — อ่านขอบเขตจริงใน [docs/SAFETY.md](docs/SAFETY.md)
- ระบบอัปเดตต้องการให้โฟลเดอร์ชุดนี้เป็น **git clone** (ไม่ใช่ zip) และเครื่องต้องเข้าถึง GitHub ได้
- รูปแบบ settings/hooks อิงเอกสาร Claude Code ณ ตอนที่เขียน (ตุลาคม 2026) ถ้า Claude Code เปลี่ยนรูปแบบ ให้รัน `vibe doctor` และ `npm test`

## License

MIT
