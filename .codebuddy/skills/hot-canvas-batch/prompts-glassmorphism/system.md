# Flipbook Canvas — System Style Constraints (毛玻璃)

All canvases share these constraints. This is a **抖音图文 (Douyin photo-text)** deck — every image must be a scroll-stopping vertical poster with glassmorphism / frosted-glass aesthetics.

- **Format**: vertical 9:16 (1080×1920), mobile-first, single coherent glassmorphism scene.
- **Visual style**: modern glassmorphism look — frosted semi-transparent glass cards/panels with blur-through, thin white borders, soft inner highlights, layered floating panels, vivid colorful blurred light-blob background, clean modern UI feel. Think iOS/visionOS UI / fintech dashboard hero — crisp, airy, premium-modern.
- **Background**: vibrant blurred gradient blobs (electric blue #4F8CFF, purple #9B6CFF, pink #FF6CC4, teal #2EE6C5) heavily blurred behind frosted panels. Never beige flat, never dark gritty, never photoreal snapshot.
- **Headline (爆款钩子)**: every image carries ONE huge bold Chinese headline (4–10 字) in clean heavy sans, white or high-contrast, sitting on a frosted glass bar, top or bottom third — a hook/number, not a description. Examples: "数据说话", "一图看懂", "效率翻倍".
- **Callouts**: 6–12 short punchy labels (1–6 字 each) inside small frosted-glass pills / rounded chips near key objects, with eye-catching numbers/units. Big enough to read on a phone.
- **Focal hierarchy**: one hero subject sits inside or above the main frosted panel; glass callout chips read as clean modern UI labels.
- **Consistency**: every page feels from the same design system — same blurred blob palette, same frosted panels, same thin borders, same clean headline treatment.

Append the following suffix to **every** ImageGen prompt:
> `, modern glassmorphism vertical 9:16 poster illustration, frosted semi-transparent glass cards/panels with blur-through, thin white borders and soft inner highlights, layered floating panels, vivid blurred light-blob gradient background (electric blue #4F8CFF purple #9B6CFF pink #FF6CC4 teal #2EE6C5), clean modern iOS/visionOS UI feel, Chinese headline on a frosted glass bar, frosted-glass callout pills, ONE huge bold Chinese headline plus punchy numeric callouts, mobile-first vertical composition`

Negative cues (if model supports):
> `flat isometric diagram, beige background, muted desaturated colors, dark gritty, photoreal snapshot, tiny cramped text, horizontal 16:9, dense paragraphs, watermarks, neon cyberpunk, pixel art, hand-drawn doodle, ink wash, grainy riso`
