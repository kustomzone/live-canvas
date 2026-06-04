# Flipbook Canvas — Image Prompt Composer (全息镭射)

When calling ImageGen, append the style suffix below to the planner's `image_prompt`.

This deck targets 抖音图文 (Douyin photo-text). Visuals must be **vertical 9:16**, high-impact, scroll-stopping: a holographic / iridescent scene — shifting rainbow gradients, liquid chrome, prismatic refraction, glossy 3D — plus BIG glossy chrome Chinese headline and punchy callout numbers in iridescent chips.

The style suffix line (extracted by the engine) MUST be the `>` quoted line:

> `, holographic iridescent vertical 9:16 poster illustration, smooth shifting rainbow gradient (pearl pink #FFB6E6 to cyan #A0E9FF to lilac #C9B6FF to mint #B6FFD9), liquid chrome and metallic reflections, prismatic light refraction, glossy mirror surfaces with strong specular highlights, soft 3D blobs, Y2K aero-chrome premium tech vibe, ONE huge bold glossy liquid-chrome 3D Chinese headline with rainbow reflection (4-10 字, top or bottom third), 6-12 short punchy callout labels (1-6 字 each, with numbers/units, inside glossy iridescent pills / chrome chips), slick high-saturation futuristic look, mobile-first vertical composition, leave clear focal hierarchy so the hero subject and headline dominate`

Pass `size=1080x1920` (vertical) and `output_path=.../images/<hash>.png` to ImageGen.

Negative cues (if model supports):
> `flat isometric diagram, beige paper background, muted desaturated colors, matte flat shapes, tiny cramped text, horizontal 16:9, dense paragraphs, long sentences, watermarks, brand logos, dark gritty, hand-drawn, ink wash, grainy riso, pixel art`

If ImageGen is unavailable, fall back to writing a placeholder SVG to the same path (replace `.png` with `.svg`). Placeholder SVG template (vertical, holographic theme):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="iri" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFB6E6"/>
      <stop offset="35%" stop-color="#A0E9FF"/>
      <stop offset="70%" stop-color="#C9B6FF"/>
      <stop offset="100%" stop-color="#B6FFD9"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#iri)"/>
  <circle cx="540" cy="820" r="250" fill="#FFFFFF" opacity="0.45"/>
  <text x="540" y="1200" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="76" fill="#5A4FFF">{{TITLE}}</text>
  <text x="540" y="1280" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#7A7A9A">[image pending]</text>
</svg>
```
