# แก้ปัญหา

เริ่มจาก `node bin/vibe.mjs doctor` เสมอ — บอกสิ่งที่ขาดและคำสั่งแก้

| อาการ | สาเหตุที่พบบ่อย | วิธีแก้ |
|---|---|---|
| ไม่เห็น `/vibe-*` ใน Claude Code | ยังไม่ได้เปิด session ใหม่ หรือติดตั้งผิดโฟลเดอร์ | ปิด-เปิด `claude`; `vibe status` ดู path; ถ้าใช้ `CLAUDE_CONFIG_DIR` ตรวจว่าตั้งตัวแปรเดียวกันตอน install และตอนรัน `claude` |
| `Invalid JSON in ...settings.json` ตอน install | `settings.json` เดิมมีไวยากรณ์ผิด (คอมมา/คอมเมนต์) | แก้ไฟล์ให้เป็น JSON ถูกต้อง — ชุดนี้จะไม่ทับไฟล์ที่อ่านไม่ได้ |
| `skip ... existing file not owned by the kit` | มีไฟล์ชื่อ `vibe-*.md` ที่ไม่ใช่ของชุดนี้อยู่แล้ว | เปลี่ยนชื่อไฟล์เดิม หรือ `install --force` (ทับ + backup) |
| `skip ... locally modified` | คุณแก้ไฟล์ที่ชุดนี้ติดตั้งไว้ | ตั้งใจ: ไม่ทับ ถ้าอยากกลับเป็นของชุด `install --force` (backup อยู่ `~/.claude/backups/vibe-*`) ถ้าอยากเก็บของคุณถาวร ให้แก้ที่ `kit/` ใน repo |
| Hook ขึ้น `hook error` / ไม่ทำงาน | `node` ไม่อยู่ใน PATH ของ Claude Code, หรือย้าย/ลบโฟลเดอร์ `~/.claude/vibe/hooks` | `where node`; รัน `vibe install` ใหม่ (เขียน path ใหม่ให้); hook พังเองจะไม่ขวางงาน (fail-open) |
| Guard บล็อกสิ่งที่ถูกต้อง (false positive) | pattern กว้างเกินไป | ปิดชั่วคราว `VIBE_GUARD_OFF=1` ตอนเปิด `claude`; แล้วเปิด issue/แก้ pattern + เพิ่มเทสต์ |
| `Not ready: ... Claude Code CLI` | ยังไม่ได้ลง `claude` | `npm install -g @anthropic-ai/claude-code` หรือติดตั้งตามเอกสารทางการ |
| `git user.name / user.email` ขึ้น MISS | ยังไม่ตั้งตัวตน git | `git config --global user.name "ชื่อ"` และ `user.email` |
| `GitHub CLI logged in` ขึ้น MISS | ยังไม่ login | `gh auth login` |
| PowerShell: `running scripts is disabled` | Execution policy | ใช้ `powershell -ExecutionPolicy Bypass -File setup\bootstrap.ps1` (มีผลเฉพาะคำสั่งนั้น) |
| bootstrap: `winget was not found` | Windows เก่า/ไม่มี App Installer | ลง "App Installer" จาก Microsoft Store หรือลงเครื่องมือเองตามรายการที่แสดง |
| ลง Node แล้วแต่ `node` ไม่เจอ | PATH ยังไม่รีเฟรชในหน้าต่างเดิม | เปิดเทอร์มินัลใหม่ |
| `vibe mcp ... --apply` ล้มเหลว | `claude` ไม่อยู่ใน PATH, หรือมี server ชื่อเดียวกันแล้ว | `claude mcp list`; `claude mcp remove <name>` แล้วลองใหม่ |
| `vibe update` บอก `git pull failed` | มีการแก้ไฟล์ใน clone ที่ชนกับ remote | `git status`; commit/stash แล้ว `git pull --ff-only` เอง |
| อยากย้อนกลับทุกอย่าง | — | `vibe uninstall` (คืน `settings.json`/`CLAUDE.md` เดิม) หรือกู้จาก `~/.claude/backups/vibe-<เวลา>/` |

## Hook ไม่เห็นผลที่คาด? ลองทีละชั้น

```bash
# 1) hook ตัวเดียวทำงานไหม (ควรได้ exit code 2 และข้อความ [vibe-guard])
echo '{"tool_input":{"command":"rm -rf /"}}' | node ~/.claude/vibe/hooks/guard-bash.mjs; echo "exit=$?"
# 2) ลงทะเบียนใน settings แล้วหรือยัง
node bin/vibe.mjs status
# 3) ชุดทดสอบของ repo
npm test
```

## ยังแก้ไม่ได้

เปิด issue พร้อมผลของ `node bin/vibe.mjs doctor --json` และ `node bin/vibe.mjs status --json` (ไม่มีข้อมูลลับในผลลัพธ์เหล่านี้ แต่ตรวจก่อนแปะ)
