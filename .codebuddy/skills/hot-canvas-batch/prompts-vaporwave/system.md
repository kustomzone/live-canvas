# Flipbook Canvas — System Style Constraints (蒸汽波)

All canvases share these constraints. This is a **抖音图文 (Douyin photo-text)** deck — every image must be a scroll-stopping vertical poster with 80s vaporwave / retro-futurist aesthetics.

- **Format**: vertical 9:16 (1080×1920), mobile-first, single coherent vaporwave scene.
- **Visual style**: 80s/90s vaporwave aesthetic — purple-pink-cyan gradient sky, glowing neon grid floor stretching to a low horizon, retro sun with horizontal slats, Roman/Greek marble bust statues, palm silhouettes, chrome 3D text, subtle VHS glitch and scanline artifacts. Think "AESTHETIC" Tumblr poster — surreal, dreamy, retro-future.
- **Background**: magenta-to-cyan gradient (#FF6AD5 → #8A4FFF → #00E0FF) with a glowing perspective grid and a slatted retro sun. Never beige, never flat, never realistic-photo.
- **Headline (爆款钩子)**: every image carries ONE huge bold Chinese headline (4–10 字), chrome or neon-glow heavy sans-serif, often with a duplicated cyan/magenta offset (chromatic aberration), top or bottom third — a hook/number, not a description. Examples: "时光倒流", "梦回80年代", "复古未来".
- **Callouts**: 6–12 short punchy labels (1–6 字 each) in neon pink/cyan, placed near key objects with thin glowing leader lines or small chrome pills, with eye-catching numbers/units. Big enough to read on a phone.
- **Focal hierarchy**: the hero subject + headline dominate; the grid/sun framing supports, never clutters.
- **Consistency**: every page in the same flipbook feels like the same artist — same magenta-cyan palette, same grid horizon, same chrome headline treatment.

Append the following suffix to **every** ImageGen prompt:
> `, 80s vaporwave retro-futurist vertical 9:16 poster illustration, magenta-to-cyan gradient sky (#FF6AD5 #8A4FFF #00E0FF), glowing neon perspective grid floor to a low horizon, retro slatted sun, marble bust statue and palm silhouettes, chrome 3D headline, subtle VHS glitch and scanlines, chromatic aberration, dreamy surreal aesthetic, ONE huge bold Chinese headline plus punchy neon callout labels, mobile-first vertical composition`

Negative cues (if model supports):
> `flat isometric diagram, beige background, muted desaturated colors, tiny cramped text, horizontal 16:9, dense paragraphs, watermarks, realistic photo, gritty dark cyberpunk, ink wash`
