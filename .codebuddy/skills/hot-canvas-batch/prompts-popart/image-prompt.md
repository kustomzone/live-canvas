# Flipbook Canvas — Image Prompt Composer (波普漫画)

When calling ImageGen, append the style suffix below to the planner's `image_prompt`.

This deck targets 抖音图文 (Douyin photo-text). Visuals must be **vertical 9:16**, high-impact, scroll-stopping: a retro pop-art comic scene — thick black outlines, Ben-Day halftone dots, primary colors, explosion bubbles, motion lines — plus BIG comic-bubble Chinese headline and punchy callout numbers in speech bubbles.

The style suffix line (extracted by the engine) MUST be the `>` quoted line:

> `, retro pop-art comic-book vertical 9:16 poster illustration, bold thick black ink outlines, Ben-Day halftone dot shading, primary high-saturation colors (red #ED1C24, yellow #FFDE17, blue #0072BC), comic action bursts and speech balloons, radial burst lines and dynamic motion lines, Lichtenstein vintage comic panel vibe, ONE huge bold Chinese headline inside a jagged comic explosion bubble or thick-outlined comic font (4-10 字, top or bottom third), 6-12 short punchy callout labels (1-6 字 each, with numbers/units, in small comic speech bubbles or starburst tags near each object), loud energetic high-contrast composition, mobile-first vertical composition, leave clear focal hierarchy so the hero subject and headline dominate`

Pass `size=1080x1920` (vertical) and `output_path=.../images/<hash>.png` to ImageGen.

Negative cues (if model supports):
> `flat isometric diagram, beige paper background, muted desaturated colors, photoreal, tiny cramped text, horizontal 16:9, dense paragraphs, long sentences, watermarks, brand logos, neon glow, dark cyberpunk, glossy chrome, smooth 3D render, ink wash, pixel art`

If ImageGen is unavailable, fall back to writing a placeholder SVG to the same path (replace `.png` with `.svg`). Placeholder SVG template (vertical, pop-art theme):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice">
  <rect width="1080" height="1920" fill="#FFDE17"/>
  <circle cx="540" cy="820" r="280" fill="#ED1C24" stroke="#000000" stroke-width="14"/>
  <circle cx="540" cy="820" r="180" fill="#0072BC" stroke="#000000" stroke-width="10"/>
  <text x="540" y="1220" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="80" fill="#000000">{{TITLE}}</text>
  <text x="540" y="1300" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#333333">[image pending]</text>
</svg>
```
