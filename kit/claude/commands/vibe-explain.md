---
description: Explain code, a bug, or the whole project in plain language for someone who does not read code
argument-hint: <file, feature, error, or "project">
---

Explain: $ARGUMENTS

Read the actual code first - do not explain from filenames. Then write for a smart person who is not a programmer:
- Start with one sentence: what it is for, in terms of what the user sees or gets.
- Then a short walk-through of how it works as a story: what happens first, next, last. Name the key files and functions in `code font` so they can be found, but explain each in everyday words.
- Use one small analogy or diagram (ASCII is fine) only if it makes the flow clearer.
- Call out: what is fragile or surprising, what depends on what, and what is safe versus risky to change.
- For an error message: what it means, what most likely caused it here, and the next thing to try.
- For "project": the folder map (what lives where), how to run it, how data flows, and the 3 files to read first.

Keep it short. Reply in the user's language. Do not modify any files.
