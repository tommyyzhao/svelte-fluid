---
'svelte-fluid': minor
---

Replace RGB-derived surface geometry with independent deposited thickness in the existing dye alpha channel. Equal splats, including black pigment, have equal geometry regardless of hue or HDR brightness. Thickness is passively transported and removed with dye, not a calibrated free-surface solve. No additional framebuffer or render pass, public prop or backend selector.

Shaded appearances intentionally change; exact 0.8.0 shaded parity is not retained. Internal `readField('dye')` RGBA alpha now reports thickness in canvas-height units, not padding or display opacity (a breaking internal-test assumption for the 1.0 transition). Public premultiplied output coverage still derives from pigment/display RGB. Height-exposing optics cannot incorrectly settle solely because RGB is black; arbitrary amplified optics conservatively retain their idle limitation.
