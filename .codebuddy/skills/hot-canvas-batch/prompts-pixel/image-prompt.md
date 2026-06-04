# Flipbook Canvas — Image Prompt Composer (复古像素)

When calling ImageGen, append the style suffix below to the planner's `image_prompt`.

This deck targets 抖音图文 (Douyin photo-text). Visuals must be **vertical 9:16**, high-impact, scroll-stopping: retro 8-bit/16-bit pixel art — visible pixel grid, limited palette, dithering, CRT scanlines, arcade vibe — plus BIG blocky pixel Chinese headline and punchy HUD-style callout numbers.

The style suffix line (extracted by the engine) MUST be the `>` quoted line:

> `, retro 8-bit/16-bit pixel art style vertical 9:16 poster illustration, clearly visible chunky pixel grid (each pixel distinct), limited retro palette (#000000 #1D2B53 #7E2553 #008751 #AB5236 #5F574F #C2C3C7 #FFF1E8), dithering patterns for color transitions, subtle CRT scanline overlay, ONE huge blocky 8-bit pixel-font Chinese headline (4-10 字, heavy high-contrast, top or bottom third), 6-12 short punchy callout labels (1-6 字 each, with numbers/units like 分/级/倍/HP, as small pixel-font HUD boxes near each object), arcade game-screen vibe, mobile-first vertical composition, leave clear focal hierarchy so the hero sprite and headline dominate`

Pass `size=1080x1920` (vertical) and `output_path=.../images/<hash>.png` to ImageGen.

Negative cues (if model supports):
> `smooth gradients, anti-aliased soft edges, flat isometric diagram, beige paper background, tiny cramped text, horizontal 16:9, dense paragraphs, long sentences, watermarks, brand logos, realistic photo, watercolor, hand-drawn, 3D render, ink wash`

If ImageGen is unavailable, fall back to writing a placeholder SVG to the same path (replace `.png` with `.svg`). Placeholder SVG template (vertical, pixel theme):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges">
  <rect width="1080" height="1920" fill="#1D2B53"/>
  <rect x="420" y="700" width="240" height="240" fill="#FFF1E8"/>
  <rect x="480" y="760" width="120" height="120" fill="#7E2553"/>
  <text x="540" y="1180" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="72" fill="#FFF1E8">{{TITLE}}</text>
  <text x="540" y="1260" text-anchor="middle" font-family="monospace" font-size="30" fill="#C2C3C7">[image pending]</text>
</svg>
```
