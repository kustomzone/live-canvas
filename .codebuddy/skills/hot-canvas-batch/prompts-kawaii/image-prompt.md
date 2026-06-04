# Flipbook Canvas — Image Prompt Composer (治愈卡通)

When calling ImageGen, append the style suffix below to the planner's `image_prompt`.

This deck targets 抖音图文 (Douyin photo-text). Visuals must be **vertical 9:16**, high-impact, scroll-stopping: a cute kawaii flat-cartoon scene — rounded chubby shapes, big sparkly eyes, candy pastel colors, sticker icons, sparkles — plus BIG bubbly Chinese headline and punchy callout numbers in sticker bubbles.

The style suffix line (extracted by the engine) MUST be the `>` quoted line:

> `, cute kawaii flat-cartoon vertical 9:16 poster illustration, rounded chubby shapes, simple thick clean outlines, big sparkly eyes and blush cheeks, smiling faces on objects, candy pastel palette (sky blue #AEE6FF, lemon #FFF3B0, mint #C8F7C5, pink #FFCFE1), sticker-like icons, floating sparkles and little hearts, LINE-Friends/Sanrio friendly vibe, ONE huge bold chunky rounded bubbly Chinese headline with a contrasting outline (4-10 字, top or bottom third), 6-12 short punchy callout labels (1-6 字 each, with numbers/units, inside rounded sticker bubbles or cloud tags near each object), clean cheerful high-saturation composition, mobile-first vertical composition, leave clear focal hierarchy so the hero mascot and headline dominate`

Pass `size=1080x1920` (vertical) and `output_path=.../images/<hash>.png` to ImageGen.

Negative cues (if model supports):
> `flat isometric diagram, beige paper background, muted desaturated colors, photoreal, dark gritty, tiny cramped text, horizontal 16:9, dense paragraphs, long sentences, watermarks, brand logos, neon cyberpunk, glossy chrome, ink wash, scary, realistic, pixel art`

If ImageGen is unavailable, fall back to writing a placeholder SVG to the same path (replace `.png` with `.svg`). Placeholder SVG template (vertical, kawaii theme):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice">
  <rect width="1080" height="1920" fill="#AEE6FF"/>
  <circle cx="540" cy="800" r="240" fill="#FFF3B0" stroke="#FFFFFF" stroke-width="12"/>
  <circle cx="470" cy="780" r="22" fill="#3A3A3A"/>
  <circle cx="610" cy="780" r="22" fill="#3A3A3A"/>
  <text x="540" y="1200" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="78" fill="#FF7AA8">{{TITLE}}</text>
  <text x="540" y="1280" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#6FB7D6">[image pending]</text>
</svg>
```
