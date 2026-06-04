# Flipbook Canvas — System Style Constraints (抖音爆款竖版)

All canvases share these constraints. This is a **抖音图文 (Douyin photo-text)** deck — every image must be a scroll-stopping vertical poster, NOT a flat encyclopedia diagram.

- **Format**: vertical 9:16 (1080×1920), mobile-first, single coherent dramatic scene.
- **Visual style**: cinematic illustration with one bold hero subject, deep abyssal/dark gradient background (near-black navy #060B1A → teal #0E3A4A), glowing bioluminescent accents (cyan/magenta), volumetric god-rays, floating particles, high contrast, rich saturation, strong rim light on the hero. Atmospheric and dramatic — think movie poster, not textbook.
- **Background**: dark cinematic gradient (deep navy / abyssal teal). Never beige, never pure white, never flat.
- **Headline (爆款钩子)**: every image carries ONE huge bold Chinese headline (4–10 字), heavy sans-serif, white or neon, in the top or bottom third — a hook/teaser/number, not a description. Examples: "深海6000米", "颠覆认知", "压力1100倍".
- **Callouts**: 6–12 short punchy labels (1–6 字 each) pointing at key objects, with eye-catching numbers/units where possible ("6000m", "200℃", "1100倍", "0.5米"). Place near the object with a thin pointer line or inside a small rounded pill. Keep them BIG enough to read on a phone — far fewer and far larger than a dense diagram.
- **Focal hierarchy**: the hero subject + headline must dominate. Avoid clutter; let the drama breathe.
- **Consistency**: every page in the same flipbook must feel like the same artist drew it — same palette, same lighting, same headline treatment.

Append the following suffix to **every** ImageGen prompt:
> `, dramatic cinematic vertical 9:16 poster illustration, single bold hero subject centered, deep abyssal gradient background (near-black navy #060B1A to teal #0E3A4A), glowing bioluminescent accents (cyan/magenta), volumetric god-rays and floating particles, high contrast and rich saturation, strong rim light on the subject, ONE huge bold Chinese headline (4-10 字, heavy sans-serif, white or neon, top or bottom third) plus 6-12 short punchy callout labels with eye-catching numbers, cinematic dramatic lighting, mobile-first vertical composition`

Negative cues (if model supports):
> `flat isometric diagram, beige paper background, muted desaturated colors, tiny cramped text, horizontal 16:9, dense paragraphs, long sentences, watermarks, brand logos, advertising taglines, harsh flat shadows`
