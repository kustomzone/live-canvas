# Flipbook Canvas — Click-to-Label Prompt

The user has clicked a point on a flipbook image. Given:
- A **click marker image** (provided as `@/tmp/...png` in this prompt when available) — a copy of the parent image with a **red circled crosshair drawn at the click point**. **If you can see this image, it is the strongest possible spatial signal: the subject is whatever is INSIDE or directly UNDER the red circle.** Treat it as ground truth above all other inputs.
- `parent_image_prompt` — the description used to GENERATE the parent image (this tells you what is roughly at each position)
- `parent_title` and `parent_caption`
- `click_xy` — normalized [x, y] in [0..1], where x grows right and y grows down
- `nearby_text` — array of OCR'd in-image text fragments **near the click**, each with `{text, xy, dist}` where `xy` is the fragment's centre (image-relative) and `dist` is its distance to `click_xy`. **Strong secondary signal** when the marker image isn't visible — text the model literally painted next to that pixel.
- `existing_labels` — array of `{label, anchor_xy, leader_xy}` already on this image

Your job is to:

1. **Decide whether the click landed on something drillable.** If the marker covers blank background, a generic frame, a colour swatch, or an unimportant decoration, AND `nearby_text` is empty AND `parent_image_prompt` doesn't describe anything specific at `click_xy`, reject the click — don't fabricate a subject. Return only `{ "confident": false, "reason": "..." }`.
2. Otherwise, **infer what visual element the user clicked**, in this priority order:
   1. If you can see the marker image: name the visual subject inside / directly under the red circle. This trumps all other inputs.
   2. Else if `nearby_text` is non-empty: the closest 1–3 fragments (smallest `dist`) almost certainly describe the clicked subject. Synthesise a concrete drillable noun phrase from them. Don't pick a subject from a different region just because it sounds richer.
   3. Else: figure out which zone of `parent_image_prompt` covers `click_xy` and pick the most specific drillable noun there.
3. **Decide where to place the new HTML label card** so it does not overlap `existing_labels`. Cards are ~240px wide; keep `anchor_xy` away from existing anchors by at least 0.18 in either x or y. The card should be near (but not on top of) the click point.
4. **Pick the leader endpoint** as the click point itself or the nearest visual feature, so the leader line clearly connects card → click.

## Output: STRICT JSON — one of two shapes

### A. Confident — the click is drillable

```json
{
  "confident": true,
  "label": "max 50 chars, in the user's language; concrete drillable noun phrase",
  "anchor_xy": [0.0..1.0, 0.0..1.0],
  "leader_xy": [0.0..1.0, 0.0..1.0],
  "next_prompt": "one-sentence seed describing what the child page's image_prompt should depict — same language as label"
}
```

### B. Not confident — ask the user to re-pick

```json
{
  "confident": false,
  "reason": "short user-facing explanation in the user's language, e.g. '此处没有可深入的内容 / nothing specific to drill into here'"
}
```

## Rules

- Default `confident` is `true` if you are returning a label. Returning shape B means the click is rejected and the UI will tell the user to pick a different spot.
- `label` is in the SAME language as `parent_title` (Chinese stays Chinese, English stays English).
- `label` must be a **concrete noun phrase** describing what was clicked, NOT a category like "details" or "more info".
- When the marker image or `nearby_text` is provided, `label` must be consistent with what's actually under the marker / what the closest fragment says. E.g. if the closest fragment is "洪都鸡", the label must be about 洪都鸡, not an unrelated zone the prose mentions.
- `anchor_xy` is the top-left of the card. Keep it inside [0.02, 0.85] for x and [0.04, 0.86] for y so the card stays visible. Spread away from `existing_labels[].anchor_xy` by ≥ 0.18 in at least one axis.
- `leader_xy` should be at or very near `click_xy` (within 0.05). Different from `anchor_xy`.
- `next_prompt` is the seed for the child node's image_prompt (one sentence, user language, 5-zone friendly).

## Output JSON only. No backticks. No commentary.
