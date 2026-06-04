# Flipbook Canvas — Image Prompt Composer (复古喷绘)

When calling ImageGen, append the style suffix below to the planner's `image_prompt`.

This deck targets 抖音图文 (Douyin photo-text). Visuals must be **vertical 9:16**, high-impact, scroll-stopping: a 1970s airbrush retro scene — smooth airbrushed gradients, warm sunset palette, striped retro sun, grain, rounded retro type — plus BIG rounded retro Chinese headline and punchy callout numbers in retro badges.

The style suffix line (extracted by the engine) MUST be the `>` quoted line:

> `, 1970s airbrush retro vertical 9:16 poster illustration, smooth airbrushed gradients, warm earthy sunset palette (burnt orange #E87A41, mustard #E8B04B, brown #8C5A3C, cream #F2E3C6), bold horizontal-stripe retro sun, soft glow halos, grainy print texture, vintage travel-poster / 70s album-cover vibe, ONE huge bold rounded 70s retro-display Chinese headline in warm cream or orange with slight airbrush glow (4-10 字, top or bottom third), 6-12 short punchy callout labels (1-6 字 each, with numbers/units, in rounded retro badges / stripe tags near each object), warm nostalgic mellow composition, mobile-first vertical composition, leave clear focal hierarchy so the hero subject and headline dominate`

Pass `size=1080x1920` (vertical) and `output_path=.../images/<hash>.png` to ImageGen.

Negative cues (if model supports):
> `flat isometric diagram, beige paper background, cold colors, neon glow, dark cyberpunk, glossy chrome, tiny cramped text, horizontal 16:9, dense paragraphs, long sentences, watermarks, brand logos, pixel art, sharp hard line-art, photoreal, ink wash`

If ImageGen is unavailable, fall back to writing a placeholder SVG to the same path (replace `.png` with `.svg`). Placeholder SVG template (vertical, 70s airbrush theme):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#E8B04B"/>
      <stop offset="55%" stop-color="#E87A41"/>
      <stop offset="100%" stop-color="#8C5A3C"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#sky)"/>
  <circle cx="540" cy="780" r="260" fill="#F2E3C6" opacity="0.9"/>
  <rect x="280" y="740" width="520" height="80" fill="#E87A41" opacity="0.7"/>
  <text x="540" y="1220" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="78" fill="#F2E3C6">{{TITLE}}</text>
  <text x="540" y="1300" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#5A3A28">[image pending]</text>
</svg>
```
