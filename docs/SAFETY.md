# ความปลอดภัย: guard ทำอะไร และไม่ทำอะไร

Guard hooks คือ **ตาข่ายกันพลาด** สำหรับความผิดพลาดที่ร้ายแรงและพบบ่อย ไม่ใช่ sandbox และไม่ใช่ขอบเขตความปลอดภัยที่กัน AI/ผู้โจมตีที่ตั้งใจหลบ อ่านส่วน "ไม่ป้องกัน" ให้ครบ

## ชั้นป้องกัน 3 ชั้น

| ชั้น | กลไก | เมื่อไร |
|---|---|---|
| 1. Permissions | `settings.json` allow / ask / deny | ทุกครั้งที่ Claude เรียกเครื่องมือ — ถามหรือปฏิเสธตามกฎ |
| 2. Hooks | `guard-bash`, `guard-write` (PreToolUse) | ก่อนรันคำสั่ง/เขียนไฟล์ — **deny** (บล็อกเลย พร้อมเหตุผลส่งกลับให้ Claude) หรือ **ask** (เด้งถามคุณ) |
| 3. กฎใน CLAUDE.md | บล็อกที่ชุดนี้ดูแล | แนวทางพฤติกรรม (ขอก่อนทำสิ่งย้อนกลับยาก, ไม่ใส่ secret, ห้ามหลบ guard) — เป็น "คำแนะนำ" ไม่ใช่การบังคับ |

## สองระดับของ hook

| ระดับ | ความหมาย | ถ้าคุณต้องการจริง ๆ |
|---|---|---|
| **deny** | หายนะหรือละเมิดนโยบายชัดเจน | รันเองในเทอร์มินัลของคุณ หรือเปิด `claude` ด้วย `VIBE_GUARD_OFF=1` |
| **ask** | เสี่ยงแต่บางครั้งชอบธรรม | กดอนุญาตในหน้าต่างที่เด้งขึ้น (ไม่ต้องรีสตาร์ท) |

ทดสอบกับ Claude Code ตัวจริงด้วย `claude -p`: deny ถูกบล็อกและข้อความเหตุผลถึงโมเดล; ask ถูกเคารพแม้ใช้ `--permission-mode bypassPermissions` และในโหมดไม่โต้ตอบซึ่งไม่มีใครกดตอบจะถูกปฏิเสธ (หน้าต่างถามในโหมดโต้ตอบเป็นกลไกปกติของ Claude Code ซึ่งทดสอบอัตโนมัติไม่ได้)

## guard-bash

เข้าใจโครงสร้างคำสั่งจริง: quote, ตัวคั่น `; && || |`, `$(...)` และ backtick, heredoc, `bash -c`, `powershell -Command / -EncodedCommand`, `cmd /c`, `eval`, และ prefix `sudo/env/nohup/time/timeout` — จึงไม่บล็อกข้อความที่แค่ *พูดถึง* คำสั่งอันตราย (commit message, `echo`, เนื้อ heredoc) และไม่ถูกหลอกด้วยการห่อคำสั่ง (`bash -c "rm -rf /"`, `git push "--force"`)

**deny**
- `rm -rf` / `Remove-Item -Recurse` / `rd /s` / `del /s` ที่ชี้ไป root, home, `*`, `.`, `..`, รากไดรฟ์ โฟลเดอร์ระบบ หรือโฟลเดอร์ผู้ใช้ทั้งก้อน (`rm -rf node_modules`, `./dist`, `~/projects/old` ผ่านปกติ)
- `find / ... -delete`, `chmod/chown -R` บน root/home
- `git push --force`, `-f`, `+refspec`, `--mirror` (ไม่รวม `--force-with-lease`)
- `dd of=/dev/…`, `mkfs`, `wipefs`, `diskpart`, `format X:`, เขียนทับ disk device, fork bomb, ลบ registry hive
- **เขียนไฟล์ที่ป้องกันผ่าน shell**: `echo > .env`, `tee .env`, `cp x .env`, `Set-Content .env`, เขียนเข้า `.git/`, `~/.ssh`, `~/.aws`, ไฟล์ key (`cp .env.example .env` ผ่านได้)

**ask**
- ดาวน์โหลดแล้วรัน: `curl … | sh`, `bash <(curl …)`, `irm … | iex` (ข้อมูลที่ pipe เข้า `node -e` / `python -c` ไม่ถือว่าเป็นการรันสิ่งที่ดาวน์โหลด)
- `--no-verify` / `commit -n` กับ commit/push/merge/rebase
- `DROP DATABASE/SCHEMA`, `TRUNCATE TABLE` ผ่าน psql/mysql/sqlite3/sqlcmd/mongosh/duckdb

## guard-write

**deny**: `.env` จริง (ยกเว้น `.example/.sample/.template`), `*.pem/*.key/*.p12/*.pfx`, `id_rsa*`, ไฟล์ credential (`.netrc`, `.git-credentials`, `~/.ssh`, `~/.aws`), `.git/`, `node_modules/`, lockfile, ไฟล์ของชุดนี้เองใน `~/.claude/vibe/`, และเนื้อหาที่ดูเหมือน secret จริง (AWS, GitHub, Anthropic/OpenAI/Google key, Slack/Stripe/Discord token, private key block — ถ้าเป็น fixture ตั้งใจให้ใส่คอมเมนต์ `vibe-allow-secret`)

**ask**: `.claude/settings.json`, `.claude/settings.local.json`, `.mcp.json` (เปลี่ยนสิ่งที่ agent ทำได้), `.github/workflows/*`, `.husky/*`, `lefthook.yml`, `.pre-commit-config.yaml` (รันด้วย credential ของโปรเจกต์)

## Permissions ที่ติดตั้ง

- **allow** (ไม่ถาม): อ่าน git/gh, `git add/commit/stash`, test/lint/build/typecheck ของ npm/pnpm, pytest, `node --check/--test`
- **ask** (ถามทุกครั้ง): `git push`, `reset --hard`, `clean`, `rebase`, `restore`, `branch -D`, `gh pr merge`, `gh repo delete`, `gh release create`, `npm/pnpm publish`
- **deny**: `git push --force/-f`, อ่าน `.env`, `.env.local/production/development/staging`, `~/.ssh/**`, `~/.aws/credentials`, `~/.gnupg/**`
- ถ้าคุณมี `Bash(git push *)` ใน allow อยู่แล้ว ชุดนี้จะไม่เติมกฎ ask ทับ (เคารพการตัดสินใจเดิมของคุณ)

## วัดความแม่นยำอย่างไร

นอกจากเทสต์ในโค้ด (ทั้งเคส "ต้องบล็อก", "ต้องผ่าน", "พยายามหลบ" และ "แค่พูดถึง") ระหว่างพัฒนา v2 ได้รัน guard กับคำสั่ง Bash/PowerShell **647 รายการ** และการเขียนไฟล์ **172 ครั้ง** จากประวัติการใช้งานจริงของ Claude Code: พบ false positive 2 แบบ (`curl … | node -e` และ `sudo -E`) แล้วแก้พร้อมเพิ่มเทสต์ ตอนนี้ไม่มี false deny ในข้อมูลชุดนั้น และทดสอบกับ Claude Code ตัวจริงว่า hook บล็อก/ถามจริง — ตัวเลขนี้เป็นข้อมูลของเครื่องผู้พัฒนา ไม่ใช่การรับประกันกับทุกเวิร์กโฟลว์ ถ้าเจอ false positive ให้แจ้งพร้อมคำสั่ง (ตัดข้อมูลลับ) แล้วเพิ่มเคสใน `tests/guards.test.mjs`

## ไม่ป้องกัน (ต้องรู้)

- **ไม่ใช่ sandbox**: การตรวจเป็น pattern/token ถูกหลบได้ด้วยการเขียนอ้อมซับซ้อน (เช่น เขียนสคริปต์แล้วรันสคริปต์, `python -c "import shutil..."`, ประกอบคำสั่งจากตัวแปรที่คำนวณตอนรัน) ป้องกันความพลาด ไม่ใช่ความตั้งใจร้าย — ถ้าต้องการความแน่นหนาจริง ให้รันใน container/VM หรือใช้ sandbox ของ Claude Code
- **Secret ที่คุณพิมพ์ในแชท** guard มองไม่เห็น และ **รูปแบบ secret ที่ไม่รู้จัก** (key ของบริการอื่น) จะไม่ถูกตรวจ — ใช้ secret scanner จริง (เช่น gitleaks) ใน CI/pre-commit สำหรับโปรเจกต์จริง
- **MCP / เครื่องมืออื่น** ที่เขียนไฟล์ได้ (ไม่ใช่ Write/Edit/Bash/PowerShell) ไม่ผ่าน guard เหล่านี้
- **การอ่าน**: `deny` ของ `Read(./.env)` กันเฉพาะ tool Read; `cat .env` ผ่าน Bash ไม่ถูก guard-bash บล็อก (อ่านอย่างเดียว) — ถ้า `.env` สำคัญ ให้เก็บ secret นอกโฟลเดอร์โปรเจกต์หรือใน secret manager
- **คำสั่งที่คุณพิมพ์เองในเทอร์มินัลหรือด้วย `!`** เป็นของคุณ ไม่ถือเป็นการกระทำของ AI — guard ไม่ตรวจ
- Linux/macOS: ชุดทดสอบรันได้ทุกระบบ แต่ผมยืนยันกับ Claude Code จริงบน Windows เท่านั้น (CI 3 ระบบปฏิบัติการตั้งค่าไว้แล้ว)

## ปิด / ข้าม guard

- ชั่วคราวทั้ง session: เปิดด้วย `VIBE_GUARD_OFF=1` (PowerShell: `$env:VIBE_GUARD_OFF=1; claude`) — ตัวแปรต้องอยู่ใน environment ของ Claude Code เอง ตัว AI ตั้งให้ตัวเองไม่ได้ผ่านเครื่องมือ
- ถาวร: `node bin/vibe.mjs install --skip hooks` (หรือ `uninstall`)
- รายการเดียว: ระดับ ask กดอนุญาตได้เลย; ระดับ deny ให้รันเองในเทอร์มินัล; fixture ที่เป็น secret ปลอมใส่ `vibe-allow-secret`
- ปิดแค่การเช็กอัปเดต: `VIBE_NO_UPDATE_CHECK=1`

## เรื่องความเป็นส่วนตัวของการเช็กอัปเดต

Hook เช็กอัปเดตรัน `git fetch` ใน clone ของชุดนี้ (ไปที่ remote ที่คุณ clone มา คือ GitHub) ไม่เกินวันละครั้ง ไม่ส่งข้อมูลของคุณหรือโปรเจกต์ไปไหน (ไม่มี telemetry) มีแต่ git ที่ติดต่อ remote ตามปกติ ปิดได้ด้วย `VIBE_NO_UPDATE_CHECK=1`

## รายงานช่องโหว่

พบวิธีหลบ guard ที่น่าจะแก้ได้ หรือ false positive ที่ขวางงานปกติ — เปิด issue พร้อมคำสั่งตัวอย่าง (อย่าแนบ secret จริง) และเพิ่มเคสลงใน `tests/guards.test.mjs`
