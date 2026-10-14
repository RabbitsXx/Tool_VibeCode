# ปรับแต่ง

กฎเหล็ก: **แก้ที่ repo นี้ (`kit/`) แล้วรัน `install`** ไม่ต้องแก้ใน `~/.claude` โดยตรง เพราะ `install` จะข้ามไฟล์ที่คุณแก้เองและเตือน (ไม่ทับ) แต่ถ้าแก้ในที่เดียวคือ repo จะอัปเกรดได้ง่ายและย้ายเครื่องได้

## เพิ่ม slash command

สร้าง `kit/claude/commands/vibe-<ชื่อ>.md`:

```markdown
---
description: อธิบายสั้น ๆ ว่าทำอะไร (แสดงในรายการ /)
argument-hint: <สิ่งที่ผู้ใช้ต้องใส่>
---

คำสั่งถึง Claude ... ใช้ $ARGUMENTS สำหรับสิ่งที่ผู้ใช้พิมพ์ต่อท้าย
```
แล้ว `node bin/vibe.mjs verify && node bin/vibe.mjs install` — ชื่อไฟล์ต้องขึ้นต้น `vibe-` (กันชนกับของคุณ/ปลั๊กอิน) และต้องมี `description`

## เพิ่ม subagent

`kit/claude/agents/vibe-<ชื่อ>.md` โดย `name` ต้องตรงกับชื่อไฟล์:

```markdown
---
name: vibe-docs-writer
description: เมื่อไรที่ Claude ควรเรียกตัวนี้ (เขียนให้ชัด นี่คือสิ่งที่ใช้ตัดสินใจ)
tools: Read, Grep, Glob, Edit, Write
model: inherit
---
คำอธิบายบทบาทและขั้นตอน ...
```
จำกัด `tools` เท่าที่จำเป็น (ตัวที่ไม่ควรแก้ไฟล์ก็ไม่ให้ Edit/Write)

## แก้กฎกลาง

แก้ `kit/claude/CLAUDE.md` (เนื้อหาในบล็อกที่ชุดนี้ดูแล) — ให้สั้น กฎที่ยาวจะถูกมองข้าม
ส่วนกฎส่วนตัวที่ไม่อยากให้ชุดนี้ยุ่ง ให้เขียน **นอกบล็อก** ใน `~/.claude/CLAUDE.md` (เช่น `@RTK.md` ของคุณจะอยู่เหมือนเดิม)

## แก้ permissions / hooks

แก้ `kit/claude/settings.fragment.json` แล้ว `install` — ระบบจะ merge เข้า `settings.json` เฉพาะส่วนที่ชุดนี้เป็นเจ้าของ

- เพิ่ม allow เฉพาะคำสั่งที่อ่านอย่างเดียวหรือ revert ได้ง่าย
- รูปแบบกฎ Bash คือ `Bash(คำสั่ง *)` (เว้นวรรคก่อน `*` สำคัญ: `Bash(ls *)` ไม่จับ `lsof`)
- กฎ allow ตรง ๆ มีขอบเขตจำกัด (เช่น ไม่ครอบคลุม `git -C . push`) อย่าถือเป็นรั้วความปลอดภัย
- ถ้าอยากให้ `git push` ไม่ถาม: ใส่ `Bash(git push *)` ไว้ใน allow ของ **คุณเอง** (ชุดนี้จะไม่เติม ask ทับ) แต่ force-push ยังถูก deny

## เพิ่ม/แก้ guard

- กฎคำสั่ง: `kit/claude/hooks/guard-bash.mjs` (อาร์เรย์ `PATTERNS` และ `rmIsDangerous`)
- กฎไฟล์/secret: `kit/claude/hooks/guard-write.mjs` (`PROTECTED`, `SECRET_PATTERNS`)
- ทุกครั้งเพิ่มเคสใน `tests/guards.test.mjs` ทั้งฝั่ง "ต้องบล็อก" และ "ต้องผ่าน" (false positive ทำให้คนปิด guard ทิ้ง)

## project template

แก้ไฟล์ใน `kit/project-template/` ตัวแปรที่ใช้ได้: `{{PROJECT_NAME}}`, `{{DATE}}` — ใช้กับ `vibe new` เท่านั้น (ไม่กระทบโปรเจกต์ที่สร้างไปแล้ว)
หมายเหตุ: `.gitignore` ของ template เก็บเป็น `gitignore.template` เพื่อไม่ให้มีผลกับ repo นี้ — ระบบเปลี่ยนชื่อให้ตอนสร้างโปรเจกต์

## MCP preset

เพิ่มใน `kit/mcp/presets.json` (`name`, `description`, `command` เป็นอาร์เรย์, `usage`) บน Windows ตัว `npx` จะถูกครอบด้วย `cmd /c` ให้อัตโนมัติ
เช็กชื่อแพ็กเกจจาก README ของ MCP server นั้นก่อนเสมอ และเพิ่มเท่าที่ใช้จริง — ทุก MCP เพิ่มภาระ context

## ปล่อยเวอร์ชันใหม่

1. แก้ `kit/`, รัน `npm test` และ `node bin/vibe.mjs verify`
2. เพิ่มหัวข้อใน `CHANGELOG.md` และเพิ่มเลขเวอร์ชันใน `package.json`
3. commit, tag `vX.Y.Z`, push — ผู้ใช้รัน `node bin/vibe.mjs update`
