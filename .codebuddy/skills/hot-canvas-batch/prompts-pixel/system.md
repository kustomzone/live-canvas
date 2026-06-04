# Flipbook Canvas — System Style Constraints (复古像素)

All canvases share these constraints. This is a **抖音图文 (Douyin photo-text)** deck — every image must be a scroll-stopping vertical poster with retro 8-bit / 16-bit pixel-art aesthetics.

- **Format**: vertical 9:16 (1080×1920), mobile-first, single coherent pixel-art scene.
- **Visual style**: retro 8-bit / 16-bit pixel art — a clearly visible chunky pixel grid, limited 16/256-color palette, dithering for color transitions, subtle CRT scanline overlay, game-screen vibe. Think classic arcade / NES-SNES title screen — crisp blocky pixels, not smooth gradients.
- **Background**: dark or saturated retro game palette (e.g. #000000 #1D2B53 #7E2553 #008751 #5F574F #C2C3C7 #FFF1E8) with simple pixel scenery; subtle CRT scanlines. Never beige, never photoreal, never smooth.
- **Headline (爆款钩子)**: every image carries ONE huge bold Chinese headline (4–10 字) drawn as blocky 8-bit pixel characters (heavy, high contrast), top or bottom third — a hook/number, not a description. Examples: "通关秘籍", "隐藏关卡", "满级攻略".
- **Callouts**: 6–12 short punchy labels (1–6 字 each) as small pixel-font tags / retro HUD boxes near key objects, with eye-catching numbers/units (HP/分/级/倍). Big enough to read on a phone.
- **Focal hierarchy**: one bold pixel hero sprite dominates the frame; callouts read like a game HUD around it.
- **Consistency**: every page in the same flipbook feels from the same retro game — same palette, same pixel scale, same scanline treatment, same blocky headline.

Append the following suffix to **every** ImageGen prompt:
> `, retro 8-bit/16-bit pixel art vertical 9:16 poster illustration, clearly visible chunky pixel grid, limited retro palette (#000000 #1D2B53 #7E2553 #008751 #5F574F #C2C3C7 #FFF1E8), dithering color transitions, subtle CRT scanline overlay, blocky 8-bit pixel Chinese headline, retro HUD callout boxes, arcade game-screen vibe, ONE huge bold Chinese headline plus punchy numeric callouts, mobile-first vertical composition`

Negative cues (if model supports):
> `smooth gradients, anti-aliased soft edges, flat isometric diagram, beige background, tiny cramped text, horizontal 16:9, dense paragraphs, watermarks, realistic photo, watercolor, hand-drawn, 3D render`
