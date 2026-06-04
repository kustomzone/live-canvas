# Flipbook Canvas — Image Prompt Composer (套印孔版)

When calling ImageGen, append the style suffix below to the planner's `image_prompt`.

This deck targets 抖音图文 (Douyin photo-text). Visuals must be **vertical 9:16**, high-impact, scroll-stopping: a risograph / screen-print scene — 2–3 overprinted spot inks with misregistration, heavy grain, halftone texture, vivid riso palette — plus BIG bold Chinese headline and punchy callout numbers in a second ink.

The style suffix line (extracted by the engine) MUST be the `>` quoted line:

> `, risograph screen-print vertical 9:16 poster illustration, 2-3 spot inks overprinted with deliberate slight misregistration (offset color edges), heavy grain and noise, visible halftone/stipple texture, flat bold shapes, vivid riso ink palette (fluorescent pink #FF48B0, bright blue #0078BF, yellow #FFD200, teal #00A98F), off-white paper showing through, ONE huge bold Chinese headline in a heavy condensed sans, one spot ink, slightly misregistered (4-10 字, top or bottom third), 6-12 short punchy callout labels (1-6 字 each, with numbers/units, in a second spot ink as stamped tags with simple leader lines), indie zine / gig-poster aesthetic, mobile-first vertical composition, leave clear focal hierarchy so the hero subject and headline dominate`

Pass `size=1080x1920` (vertical) and `output_path=.../images/<hash>.png` to ImageGen.

Negative cues (if model supports):
> `smooth gradients, photoreal, 3D render, beige isometric diagram, tiny cramped text, horizontal 16:9, dense paragraphs, long sentences, watermarks, brand logos, neon glow, dark cyberpunk, glossy chrome, ink wash`

If ImageGen is unavailable, fall back to writing a placeholder SVG to the same path (replace `.png` with `.svg`). Placeholder SVG template (vertical, riso theme):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice">
  <rect width="1080" height="1920" fill="#F5F0E6"/>
  <circle cx="520" cy="780" r="260" fill="#0078BF" opacity="0.85"/>
  <circle cx="560" cy="820" r="260" fill="#FF48B0" opacity="0.55"/>
  <text x="540" y="1200" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="76" fill="#0078BF">{{TITLE}}</text>
  <text x="540" y="1280" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#FF48B0">[image pending]</text>
</svg>
```
