# Flipbook Canvas — System Style Constraints (剪纸分层)

All canvases share these constraints. This is a **抖音图文 (Douyin photo-text)** deck — every image must be a scroll-stopping vertical poster with layered paper-cut aesthetics.

- **Format**: vertical 9:16 (1080×1920), mobile-first, single coherent paper-cut scene.
- **Visual style**: layered paper-cut / 3D shadow-box look — multiple stacked cut-paper layers receding into depth, crisp die-cut edges, soft drop shadows between layers giving real 3D depth, bold flat color blocking, subtle paper grain. Think handmade shadow box / 立体剪纸 / festival paper art — tactile, layered, vivid.
- **Background**: deepest paper layer in a rich saturated color (or warm festive red #E63946 / teal #2A9D8F), with lighter layers stacked in front. Never beige flat, never photoreal, never dark gritty.
- **Headline (爆款钩子)**: every image carries ONE huge bold Chinese headline (4–10 字) as a cut-paper layer with its own drop shadow (heavy sans), top or bottom third — a hook/number, not a description. Examples: "层层揭秘", "传统新生", "节日限定".
- **Callouts**: 6–12 short punchy labels (1–6 字 each) on small cut-paper tags floating above the scene, near key objects, with eye-catching numbers/units. Big enough to read on a phone.
- **Focal hierarchy**: one bold paper-cut hero shape on the front layer dominates; depth layers frame it cleanly.
- **Consistency**: every page feels cut from the same paper set — same color layers, same shadow depth, same crisp edges, same headline treatment.

Append the following suffix to **every** ImageGen prompt:
> `, layered paper-cut 3D shadow-box vertical 9:16 poster illustration, multiple stacked cut-paper layers receding into depth, crisp die-cut edges, soft drop shadows between layers for real 3D depth, bold flat saturated color blocking, subtle paper grain, festive handmade 立体剪纸 vibe, cut-paper Chinese headline with its own drop shadow, floating paper callout tags, ONE huge bold Chinese headline plus punchy numeric callouts, mobile-first vertical composition`

Negative cues (if model supports):
> `flat isometric diagram, beige background, photoreal, tiny cramped text, horizontal 16:9, dense paragraphs, watermarks, neon glow, dark cyberpunk, glossy chrome, gradient mesh, smooth 3D render`
