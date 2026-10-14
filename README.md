# Tool_VibeCode

ชุดเครื่องมือ **จำเป็นทั้งหมดสำหรับ Vibe Coding** กับ Claude Code — ติดตั้งครั้งเดียว ใช้ได้ทุกโปรเจกต์ อัปเกรดได้โดยไม่ทับของที่คุณปรับแต่งไว้

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

## ในชุดนี้มีอะไร

| ส่วน | ติดตั้งไปที่ | ทำอะไร |
|---|---|---|
| **15 slash commands** `/vibe-*` | `~/.claude/commands/` | ขั้นตอนมาตรฐาน: start → spec → plan → build → review → ship + fix, ui, test, sec, clean, explain, brief, handoff, resume |
| **7 subagents** `vibe-*` | `~/.claude/agents/` | planner, reviewer, debugger, test-writer, security, ui-reviewer, researcher (อ่านงานหนัก ๆ แยก context ไม่ให้บทสนทนาหลักบวม) |
| **Skill** `vibe-workflow` | `~/.claude/skills/` | วงจรทำงาน + Definition of Done + anti-patterns |
| **Guard hooks** (บังคับจริง) | `~/.claude/vibe/hooks/` | บล็อกคำสั่งอันตราย (`rm -rf /`, force-push, `curl \| sh`, DROP DATABASE…), บล็อกการเขียน `.env`/key/lockfile/`.git`, บล็อก secret ที่หลุดเข้าโค้ด, โหลดสถานะโปรเจกต์ตอนเปิด session |
| **Permissions** | `~/.claude/settings.json` (merge) | อนุญาตคำสั่งปลอดภัยที่ใช้บ่อย (git status/diff, test, lint), ถามก่อนทำสิ่งย้อนกลับยาก (push, reset --hard), ปฏิเสธ force-push และการอ่าน `.env`/`~/.ssh` |
| **กฎกลาง** | `~/.claude/CLAUDE.md` (บล็อกที่ชุดนี้ดูแล) | หลักการทำงาน ความปลอดภัย โครงเอกสารโปรเจกต์ |
| **Project template** | `vibe new <dir>` | `AGENTS.md` + `CLAUDE.md`, `docs/{SPEC,PLAN,TASKS,DECISIONS,HANDOFF}.md`, `.gitignore`, `.env.example`, PR template, CI อัตโนมัติ (Node/Python) |
| **คลังพรอมต์ภาษาไทย** | [`kit/prompts/`](kit/prompts/README.md) | พรอมต์ก๊อปวาง 9 แบบ (เริ่มแอป, แก้บั๊ก, UI, รีวิว, ออกจากลูป, เริ่ม session ใหม่ …) |
| **MCP presets** | `vibe mcp` | context7 (docs ล่าสุดของไลบรารี), playwright (ให้ AI เปิดเบราว์เซอร์ตรวจ UI เอง) |
| **Doctor** | `vibe doctor` | ตรวจเครื่องมือ เวอร์ชัน git identity, gh login, สถานะการติดตั้งของชุดนี้ |

## วงจรทำงานประจำวัน

```
/vibe-start หรือ /vibe-spec   →  /vibe-plan  →  /vibe-build (วนทีละชิ้น)  →  /vibe-review  →  /vibe-ship
                                                      │ บั๊ก: /vibe-fix     │ หน้าตา: /vibe-ui
                                                      ▼
                              ยาว/ล้า?  /vibe-handoff  →  เปิด session ใหม่  →  /vibe-resume
```

อ่านรายละเอียดและตัวอย่างที่ [docs/GUIDE.md](docs/GUIDE.md)

## ออกแบบให้ "ใช้ได้ยาว"

- **ไม่ทับของคุณ**: `settings.json` ถูก *merge* (ไม่แตะ `model`, hooks หรือ rules เดิม), `CLAUDE.md` ใช้บล็อกที่มีเครื่องหมายกำกับ ส่วนอื่นเป็นของคุณ, ไฟล์ที่คุณแก้เองจะถูกข้ามตอนอัปเกรด (ใช้ `--force` ถ้าต้องการทับ — มี backup)
- **Idempotent**: รัน `install` กี่รอบก็ได้ผลเหมือนเดิม; `--dry-run` ดูก่อนเสมอ; backup ไว้ที่ `~/.claude/backups/vibe-*` (เก็บ 10 ชุดล่าสุด)
- **ถอนได้สะอาด**: `vibe uninstall` คืน `settings.json` และ `CLAUDE.md` กลับเป็นของเดิมทุกไบต์ (มีเทสต์ยืนยัน)
- **Fail-open**: ถ้า hook พังเอง จะไม่ขวาง session ของคุณ (ปิด guard ชั่วคราวได้ด้วย `VIBE_GUARD_OFF=1` ก่อนเปิด `claude`)
- **ไม่มี dependency**: Node built-ins ล้วน ไม่มี `npm install`, ไม่มีเวอร์ชันล็อกที่จะเน่า; hooks ไม่ import จากชุดนี้ จึงไม่พังถ้าคุณย้าย/ลบ clone
- **มีเทสต์**: `npm test` (34 เทสต์: guards, installer, merge/unmerge, scaffold, CLI) และ `vibe verify` ตรวจความสอดคล้องของไฟล์ในชุด — รันใน CI ทุก push

## อัปเดต / ถอนการติดตั้ง

```bash
node bin/vibe.mjs update            # git pull --ff-only แล้วติดตั้งซ้ำ
node bin/vibe.mjs status            # ติดตั้งเวอร์ชันไหน มีไฟล์ถูกแก้ไหม
node bin/vibe.mjs uninstall         # ถอนเฉพาะที่ชุดนี้ติดตั้ง
```

## เอกสารเพิ่มเติม

- [docs/GUIDE.md](docs/GUIDE.md) — วิธี vibe code ด้วยชุดนี้ ตั้งแต่ไอเดียถึงปล่อยงาน
- [docs/SAFETY.md](docs/SAFETY.md) — guard ป้องกันอะไร ไม่ป้องกันอะไร (พูดตรง ๆ)
- [docs/CUSTOMIZE.md](docs/CUSTOMIZE.md) — เพิ่ม/แก้ command, agent, กฎ, permissions, MCP
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — ปัญหาที่เจอบ่อยและวิธีแก้
- [CHANGELOG.md](CHANGELOG.md)

## โครงสร้าง repo

```
bin/vibe.mjs        CLI (doctor, install, update, status, uninstall, new, mcp, verify)
lib/                โค้ดหลัก (installer, settings merge, doctor, scaffold ...)
kit/claude/         สิ่งที่ติดตั้งเข้า ~/.claude (commands, agents, skills, hooks, CLAUDE.md, settings.fragment.json)
kit/project-template/  โครงโปรเจกต์ใหม่
kit/prompts/        คลังพรอมต์ภาษาไทย
kit/mcp/            MCP presets
setup/              bootstrap.ps1 / bootstrap.sh (ลงเครื่องมือที่ขาด)
tests/              node --test
```

## ข้อจำกัด

- ออกแบบสำหรับ **Claude Code** เป็นหลัก; `AGENTS.md` ในโปรเจกต์ใช้ร่วมกับเอเจนต์อื่น (Codex, Copilot, Gemini) ได้ แต่ commands/hooks ใช้ได้เฉพาะ Claude Code
- Guard hooks เป็น "ตาข่ายกันพลาด" ไม่ใช่ sandbox — อ่านขอบเขตจริงใน [docs/SAFETY.md](docs/SAFETY.md)
- รูปแบบ settings/hooks อิงเอกสาร Claude Code ณ ตอนที่เขียน (ตุลาคม 2026) ถ้าอัปเดตแล้วมีอะไรเปลี่ยน ให้รัน `vibe doctor` และ `npm test` ก่อน

## License

MIT
