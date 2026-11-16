---
'svelte-fluid': patch
---

Prevent shared-host presentation starvation when asynchronous snapshots overlap. Completed frames can display while newer snapshots are pending, without allowing older frames to overwrite newer successful transfers or survive context loss and release.
