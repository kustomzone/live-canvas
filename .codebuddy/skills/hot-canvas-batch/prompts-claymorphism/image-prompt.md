# Flipbook Canvas — Image Prompt Composer (黏土3D)

When calling ImageGen, append the style suffix below to the planner's `image_prompt`.

This deck targets 抖音图文 (Douyin photo-text). Visuals must be **vertical 9:16**, high-impact, scroll-stopping: a cute soft 3D clay (claymorphism) scene — rounded plasticine shapes, matte clay texture, macaron candy colors, soft shadows — plus BIG chunky 3D clay Chinese headline and punchy callout numbers in soft pills.

The style suffix line (extracted by the engine) MUST be the `>` quoted line:

> `, soft 3D claymorphism vertical 9:16 poster illustration, rounded matte plasticine/play-doh clay texture with tiny surface dimples, inflated tactile toy-like volumes, soft global-illumination soft shadows, playful macaron candy color palette (mint #B8F2E6, peach #FFD8BE, lavender #E2C2FF, sky #BDE0FE), ONE chunky rounded extruded 3D clay Chinese headline (4-10 字, soft bevel, candy color, top or bottom third), 6-12 short punchy callout labels (1-6 字 each, with numbers/units, inside soft rounded clay pills with short rounded leader dots), cute cheerful clean high-saturation composition, mobile-first vertical composition, leave clear focal hierarchy so the hero subject and headline dominate`

Pass `size=1080x1920` (vertical) and `output_path=.../images/<hash>.png` to ImageGen.

Negative cues (if model supports):
> `flat isometric diagram, beige paper background, muted desaturated colors, tiny cramped text, horizontal 16:9, dense paragraphs, long sentences, watermarks, brand logos, realistic photo, dark gritty, sharp hard edges, line-art, neon cyberpunk, ink wash`

If ImageGen is unavailable, fall back to writing a placeholder SVG to the same path (replace `.png` with `.svg`). Placeholder SVG template (vertical, clay theme):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice">
  <rect width="1080" height="1920" fill="#BDE0FE"/>
  <ellipse cx="540" cy="1080" rx="300" ry="60" fill="#000000" opacity="0.1"/>
  <circle cx="540" cy="820" r="240" fill="#FFD8BE"/>
  <text x="540" y="1240" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="76" fill="#7A5CFF">{{TITLE}}</text>
  <text x="540" y="1320" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#8A8A8A">[image pending]</text>
</svg>
```
