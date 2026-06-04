# Flipbook Canvas — Image Prompt Composer (鎏金奢华)

When calling ImageGen, append the style suffix below to the planner's `image_prompt`.

This deck targets 抖音图文 (Douyin photo-text). Visuals must be **vertical 9:16**, high-impact, scroll-stopping: a black-gold luxury / high-fashion scene — matte black backdrop, gold-foil accents, marble, spotlight on one hero object — plus BIG gold-foil Chinese headline and punchy callout numbers in fine gold chips.

The style suffix line (extracted by the engine) MUST be the `>` quoted line:

> `, black-gold luxury high-fashion vertical 9:16 poster illustration, deep matte black backdrop (#0B0B0B) with subtle marble veining, gleaming gold-foil metallic accents (#D4AF37 to #FFD77A), fine gold linework, soft warm spotlight pool on a single hero object, premium editorial magazine elegance, ONE huge bold elegant gold-foil Chinese headline with metallic gradient and a thin gold underline (4-10 字, serif or heavy sans, top or bottom third), 6-12 short punchy callout labels (1-6 字 each, with numbers/units, in thin gold-bordered chips / fine-line tags near each object), refined glossy expensive look, mobile-first vertical composition, leave clear focal hierarchy so the hero object and headline dominate`

Pass `size=1080x1920` (vertical) and `output_path=.../images/<hash>.png` to ImageGen.

Negative cues (if model supports):
> `flat isometric diagram, beige paper background, bright pastel, flat cartoon, photoreal snapshot, tiny cramped text, horizontal 16:9, dense paragraphs, long sentences, watermarks, brand logos, neon cyberpunk, pixel art, hand-drawn doodle, grainy riso, ink wash`

If ImageGen is unavailable, fall back to writing a placeholder SVG to the same path (replace `.png` with `.svg`). Placeholder SVG template (vertical, gold-luxe theme):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="spot" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="#2A2A2A"/>
      <stop offset="100%" stop-color="#0B0B0B"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#D4AF37"/>
      <stop offset="50%" stop-color="#FFD77A"/>
      <stop offset="100%" stop-color="#D4AF37"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#spot)"/>
  <circle cx="540" cy="820" r="240" fill="none" stroke="url(#gold)" stroke-width="6"/>
  <text x="540" y="1200" text-anchor="middle" font-family="serif" font-weight="bold" font-size="78" fill="url(#gold)">{{TITLE}}</text>
  <text x="540" y="1280" text-anchor="middle" font-family="serif" font-size="30" fill="#8A7A4A">[image pending]</text>
</svg>
```
