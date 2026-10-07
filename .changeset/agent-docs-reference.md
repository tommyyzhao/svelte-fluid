---
'svelte-fluid': patch
---

Agent docs (`/llms-full.txt`, `/SKILL.md`) now include a complete typed prop reference generated from the public types, per-component accepted props, typed handle patterns for TypeScript and strict JavaScript, and structured config types. Measured on the ADR 0107 E3 eval: held-out integration pass rate rose from 33% to 67% (Haiku) and 61% to 100% (Sonnet).
