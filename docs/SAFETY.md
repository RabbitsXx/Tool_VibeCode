# ความปลอดภัย: guard ทำอะไร และไม่ทำอะไร

Guard hooks คือ **ตาข่ายกันพลาด** สำหรับความผิดพลาดที่ร้ายแรงและพบบ่อย ไม่ใช่ sandbox และไม่ใช่ขอบเขตความปลอดภัยที่กัน AI/ผู้โจมตีที่ตั้งใจหลบ อ่านส่วน "ไม่ป้องกัน" ให้ครบ

## ชั้นป้องกัน 3 ชั้น

| ชั้น | กลไก | เมื่อไร |
|---|---|---|
| 1. Permissions | `settings.json` allow / ask / deny | ทุกครั้งที่ Claude เรียกเครื่องมือ — ถามหรือปฏิเสธตามกฎ |
| 2. Hooks | `guard-bash`, `guard-write` (PreToolUse) | ก่อนรันคำสั่ง/เขียนไฟล์ — exit 2 = บล็อก พร้อมเหตุผลส่งกลับให้ Claude |
| 3. กฎใน CLAUDE.md | บล็อกที่ชุดนี้ดูแล | แนวทางพฤติกรรม (ขอก่อนทำสิ่งย้อนกลับยาก, ไม่ใส่ secret) — เป็น "คำแนะนำ" ไม่ใช่การบังคับ |

## guard-bash บล็อก

- `rm -rf` (และ `Remove-Item -Recurse`, `rd /s`, `del /s`) ที่ชี้ไป root, home, `*`, `.`, `..`, รากไดรฟ์ หรือโฟลเดอร์ระบบ — แต่ `rm -rf node_modules`, `rm -rf ./dist` ผ่านปกติ
- `git push --force` / `-f` (ไม่รวม `--force-with-lease`), `--no-verify` กับ commit/push/merge/rebase
- ดาวน์โหลดแล้วส่งเข้า shell: `curl … | sh`, `irm … | iex`, `iex (iwr …)`
- `dd of=/dev/…`, `mkfs`, `diskpart`, `format X:`, fork bomb, `chmod -R 777 /`, ลบ registry hive
- `DROP DATABASE/SCHEMA`, `TRUNCATE TABLE` ที่ส่งผ่าน psql/mysql/sqlite3/sqlcmd/mongosh/duckdb

## guard-write บล็อก

- เขียน/แก้ `.env`, `.env.*` (ยกเว้น `.example/.sample/.template`), `*.pem/*.key/*.p12/*.pfx`, `id_rsa*`, ไฟล์ใน `.git/` และ `node_modules/`
- แก้ lockfile ด้วยมือ (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `poetry.lock`, `Cargo.lock`, `uv.lock` …) — ให้ใช้ package manager
- เนื้อหาที่ดูเหมือน secret จริง: AWS key, GitHub token, Anthropic/OpenAI/Google key, Slack/Stripe/Discord token, private key block — ถ้าเป็น fixture ตั้งใจให้ใส่คอมเมนต์ `vibe-allow-secret`

## Permissions ที่ติดตั้ง

- **allow** (ไม่ถาม): อ่าน git/gh, `git add/commit/stash`, test/lint/build/typecheck ของ npm/pnpm, pytest, `node --check/--test`
- **ask** (ถามทุกครั้ง): `git push`, `reset --hard`, `clean`, `rebase`, `restore`, `branch -D`, `gh pr merge`, `gh repo delete`, `gh release create`, `npm/pnpm publish`
- **deny**: `git push --force/-f`, อ่าน `.env`, `.env.local/production/development/staging`, `~/.ssh/**`, `~/.aws/credentials`, `~/.gnupg/**`
- ถ้าคุณมี `Bash(git push *)` ใน allow อยู่แล้ว ชุดนี้จะไม่เติมกฎ ask ทับ (เคารพการตัดสินใจเดิมของคุณ)

## ไม่ป้องกัน (ต้องรู้)

- **ไม่ใช่ sandbox**: การตรวจคำสั่งเป็น pattern/token ถูกหลบได้ด้วยการเขียนอ้อม (เช่น สร้างสคริปต์แล้วรันสคริปต์, `python -c`, ตัวแปรประกอบคำสั่ง) ป้องกันความพลาด ไม่ใช่ความตั้งใจร้าย — ถ้าต้องการความแน่นหนาจริง ให้รันใน container/VM หรือใช้ sandbox ของ Claude Code
- **Secret ที่คุณพิมพ์ในแชท** guard มองไม่เห็น และ **รูปแบบ secret ที่ไม่รู้จัก** (key ของบริการอื่น) จะไม่ถูกตรวจ — ใช้ secret scanner จริง (เช่น gitleaks) ใน CI/pre-commit สำหรับโปรเจกต์จริง
- **MCP / เครื่องมืออื่น** ที่เขียนไฟล์ได้ (ไม่ใช่ Write/Edit/Bash/PowerShell) ไม่ผ่าน guard เหล่านี้
- **คำสั่งที่คุณพิมพ์เองในเทอร์มินัลหรือด้วย `!`** เป็นของคุณ ไม่ถือเป็นการกระทำของ AI — อย่าคาดหวังว่า guard จะตรวจ
- Permission `deny` กับ `Read` กันเฉพาะ tool Read — คำสั่ง `cat .env` ผ่าน Bash ต้องพึ่ง rule/guard อื่น; ถ้าเรื่อง `.env` สำคัญ ให้เก็บ secret นอกโฟลเดอร์โปรเจกต์หรือใน secret manager

## ปิด / ข้าม guard

- ชั่วคราวทั้ง session: เปิดด้วย `VIBE_GUARD_OFF=1` (PowerShell: `$env:VIBE_GUARD_OFF=1; claude`) — ตัวแปรต้องอยู่ใน environment ของ Claude Code เอง ตัว AI ตั้งให้ตัวเองไม่ได้ผ่าน Bash
- ถาวร: `node bin/vibe.mjs install --skip hooks` (หรือ `uninstall`)
- รายการเดียว: ใช้คอมเมนต์ `vibe-allow-secret` สำหรับ fixture; ส่วนคำสั่งที่ถูกบล็อก ให้รันเองในเทอร์มินัลของคุณ (ผ่าน `!` หรือ terminal ปกติ) เมื่อแน่ใจ

## รายงานช่องโหว่

พบวิธีหลบ guard ที่น่าจะแก้ได้ หรือ false positive ที่ขวางงานปกติ — เปิด issue พร้อมคำสั่งตัวอย่าง (อย่าแนบ secret จริง) และเพิ่มเคสลงใน `tests/guards.test.mjs`
