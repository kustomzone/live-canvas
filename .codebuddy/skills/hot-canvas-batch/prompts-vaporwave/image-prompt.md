# Flipbook Canvas — Image Prompt Composer (蒸汽波)

When calling ImageGen, append the style suffix below to the planner's `image_prompt`.

This deck targets 抖音图文 (Douyin photo-text). Visuals must be **vertical 9:16**, high-impact, scroll-stopping: 80s vaporwave / retro-futurist scene — magenta-cyan gradient sky, glowing neon grid floor, retro sun, marble busts, chrome text, VHS glitch — plus BIG bold Chinese headline and punchy neon callout numbers.

The style suffix line (extracted by the engine) MUST be the `>` quoted line:

> `, 80s vaporwave retro-futurist vertical 9:16 poster illustration, magenta-to-cyan gradient sky (#FF6AD5 to #8A4FFF to #00E0FF), glowing neon perspective grid floor stretching to a low horizon, retro slatted sun, marble bust statue and palm tree silhouettes, glossy chrome 3D Chinese headline (4-10 字, with cyan/magenta chromatic-aberration offset, top or bottom third), 6-12 short punchy neon-pink/cyan callout labels (1-6 字 each, with numbers/units, thin glowing leader lines or small chrome pills), subtle VHS glitch and scanline artifacts, dreamy surreal high-saturation aesthetic, mobile-first vertical composition, leave clear focal hierarchy so the hero subject and headline dominate`

Pass `size=1080x1920` (vertical) and `output_path=.../images/<hash>.png` to ImageGen.

Negative cues (if model supports):
> `flat isometric diagram, beige paper background, muted desaturated colors, tiny cramped text, horizontal 16:9, dense paragraphs, long sentences, watermarks, brand logos, realistic photo, gritty dark cyberpunk, ink wash, hand-drawn doodle`

If ImageGen is unavailable, fall back to writing a placeholder SVG to the same path (replace `.png` with `.svg`). Placeholder SVG template (vertical, vaporwave theme):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FF6AD5"/>
      <stop offset="50%" stop-color="#8A4FFF"/>
      <stop offset="100%" stop-color="#00E0FF"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#sky)"/>
  <circle cx="540" cy="760" r="260" fill="#FFD36A" opacity="0.85"/>
  <text x="540" y="980" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="72" fill="#FFFFFF">{{TITLE}}</text>
  <text x="540" y="1060" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#00E0FF">[image pending]</text>
</svg>
```
