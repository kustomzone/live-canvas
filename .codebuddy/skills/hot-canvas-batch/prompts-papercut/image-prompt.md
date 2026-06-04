# Flipbook Canvas — Image Prompt Composer (剪纸分层)

When calling ImageGen, append the style suffix below to the planner's `image_prompt`.

This deck targets 抖音图文 (Douyin photo-text). Visuals must be **vertical 9:16**, high-impact, scroll-stopping: a layered paper-cut / 3D shadow-box scene — stacked cut-paper layers with real depth, crisp die-cut edges, bold flat colors — plus BIG cut-paper Chinese headline and punchy callout numbers on floating paper tags.

The style suffix line (extracted by the engine) MUST be the `>` quoted line:

> `, layered paper-cut 3D shadow-box vertical 9:16 poster illustration, multiple stacked cut-paper layers receding into depth, crisp die-cut edges, soft drop shadows between each layer for real 3D depth, bold flat saturated color blocking, subtle paper grain texture, festive handmade 立体剪纸 vibe, ONE huge bold cut-paper Chinese headline with its own drop shadow (4-10 字, heavy sans, top or bottom third), 6-12 short punchy callout labels (1-6 字 each, with numbers/units, on small cut-paper tags floating above the scene near each object), clean vivid composition, mobile-first vertical composition, leave clear focal hierarchy so the hero subject and headline dominate`

Pass `size=1080x1920` (vertical) and `output_path=.../images/<hash>.png` to ImageGen.

Negative cues (if model supports):
> `flat isometric diagram, beige paper background, photoreal, tiny cramped text, horizontal 16:9, dense paragraphs, long sentences, watermarks, brand logos, neon glow, dark cyberpunk, glossy chrome, gradient mesh, smooth 3D render, ink wash`

If ImageGen is unavailable, fall back to writing a placeholder SVG to the same path (replace `.png` with `.svg`). Placeholder SVG template (vertical, paper-cut theme):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice">
  <rect width="1080" height="1920" fill="#E63946"/>
  <rect x="120" y="520" width="840" height="900" rx="40" fill="#F4A261"/>
  <rect x="220" y="640" width="640" height="660" rx="36" fill="#2A9D8F"/>
  <text x="540" y="1180" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="76" fill="#FFFFFF">{{TITLE}}</text>
  <text x="540" y="1260" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#FFE8D6">[image pending]</text>
</svg>
```
