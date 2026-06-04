# Flipbook Canvas — Image Prompt Composer (抖音爆款竖版风格)

When calling ImageGen, append the style suffix below to the planner's `image_prompt`.

This deck targets 抖音图文 (Douyin photo-text). Visuals must be **vertical 9:16**, high-impact, scroll-stopping: a single dramatic hero subject, cinematic deep-sea / dark gradient backdrop, glowing bioluminescent accents, strong depth and atmosphere, plus BIG bold Chinese headline text and punchy callout numbers that read instantly on a phone screen.

The style suffix line (extracted by the engine) MUST be the `>` quoted line:

> `, dramatic cinematic vertical 9:16 poster illustration, single bold hero subject centered, deep abyssal gradient background (near-black navy #060B1A to teal #0E3A4A), glowing bioluminescent accents (cyan/magenta), volumetric god-rays and floating particles, high contrast and rich saturation, strong rim light on the subject, ONE huge bold Chinese headline (4-10 字, heavy sans-serif, white or neon, top or bottom third) plus 6-12 short punchy callout labels with eye-catching numbers (depth/size/pressure like "6000m", "1100倍", "200℃", placed near objects with thin pointer lines or in small rounded pills), cinematic dramatic lighting, shallow depth of field, mobile-first vertical composition, leave clear focal hierarchy so the hero subject and headline dominate`

Pass `size=1080x1920` (vertical) and `output_path=.../images/<hash>.png` to ImageGen.

Negative cues (if model supports):
> `flat isometric diagram, beige paper background, muted desaturated colors, tiny cramped text, horizontal 16:9, dense paragraphs, long sentences, watermarks, brand logos, advertising taglines`

If ImageGen is unavailable, fall back to writing a placeholder SVG to the same path (replace `.png` with `.svg`). Placeholder SVG template (vertical):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice">
  <rect width="1080" height="1920" fill="#060B1A"/>
  <text x="540" y="960" text-anchor="middle" font-family="sans-serif" font-size="64" fill="#33D6E0">{{TITLE}}</text>
  <text x="540" y="1040" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#5A6B7A">[image pending]</text>
</svg>
```
