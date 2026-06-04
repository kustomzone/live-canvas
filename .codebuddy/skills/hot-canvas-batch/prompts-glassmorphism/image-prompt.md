# Flipbook Canvas — Image Prompt Composer (毛玻璃)

When calling ImageGen, append the style suffix below to the planner's `image_prompt`.

This deck targets 抖音图文 (Douyin photo-text). Visuals must be **vertical 9:16**, high-impact, scroll-stopping: a modern glassmorphism scene — frosted semi-transparent glass panels, vivid blurred light blobs, thin borders, clean UI feel — plus BIG bold Chinese headline on a glass bar and punchy callout numbers in frosted pills.

The style suffix line (extracted by the engine) MUST be the `>` quoted line:

> `, modern glassmorphism vertical 9:16 poster illustration, frosted semi-transparent glass cards/panels with blur-through, thin white borders and soft inner highlights, layered floating glass panels, vivid heavily-blurred light-blob gradient background (electric blue #4F8CFF, purple #9B6CFF, pink #FF6CC4, teal #2EE6C5), clean modern iOS/visionOS UI feel, ONE huge bold clean-sans Chinese headline on a frosted glass bar (4-10 字, white or high-contrast, top or bottom third), 6-12 short punchy callout labels (1-6 字 each, with numbers/units, inside small frosted-glass pills / rounded chips near each object), crisp airy premium-modern composition, mobile-first vertical composition, leave clear focal hierarchy so the hero subject and headline dominate`

Pass `size=1080x1920` (vertical) and `output_path=.../images/<hash>.png` to ImageGen.

Negative cues (if model supports):
> `flat isometric diagram, beige paper background, muted desaturated colors, dark gritty, photoreal snapshot, tiny cramped text, horizontal 16:9, dense paragraphs, long sentences, watermarks, brand logos, neon cyberpunk, pixel art, hand-drawn doodle, ink wash, grainy riso`

If ImageGen is unavailable, fall back to writing a placeholder SVG to the same path (replace `.png` with `.svg`). Placeholder SVG template (vertical, glassmorphism theme):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice">
  <rect width="1080" height="1920" fill="#1A1040"/>
  <circle cx="320" cy="560" r="320" fill="#4F8CFF" opacity="0.6"/>
  <circle cx="800" cy="900" r="300" fill="#FF6CC4" opacity="0.55"/>
  <circle cx="540" cy="1300" r="280" fill="#2EE6C5" opacity="0.45"/>
  <rect x="160" y="780" width="760" height="360" rx="48" fill="#FFFFFF" opacity="0.18" stroke="#FFFFFF" stroke-opacity="0.5" stroke-width="2"/>
  <text x="540" y="980" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="76" fill="#FFFFFF">{{TITLE}}</text>
  <text x="540" y="1060" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#D6E4FF">[image pending]</text>
</svg>
```
