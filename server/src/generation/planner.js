// Planner: builds the prompt and calls codebuddyClient.callOnce, then validates.
import { loadPrompt, loadPrompts } from './prompts.js';
import { callOnce, callOnceStream } from '../codebuddyClient.js';
import { PlannerError } from '../lib/errors.js';
import { languageInstruction, normalizeLang } from './language.js';

// Extract a string field's CURRENT value from a possibly-unclosed JSON buffer
// streamed token-by-token. Returns whatever text has arrived for `"field":"…`
// so far — including before the closing quote — so the UI can render a live
// typewriter. Handles escaped quotes; trims a dangling backslash at the end
// (an in-progress escape sequence). Returns null if the field hasn't started.
export function extractPartialField(buf, field) {
  if (typeof buf !== 'string') return null;
  const key = `"${field}"`;
  const ki = buf.indexOf(key);
  if (ki < 0) return null;
  // Find the opening quote of the value after the colon.
  let i = ki + key.length;
  while (i < buf.length && buf[i] !== ':') i++;
  i++; // past ':'
  while (i < buf.length && /\s/.test(buf[i])) i++;
  if (buf[i] !== '"') return null; // value (a string) hasn't opened yet
  i++; // past opening quote
  let out = '';
  for (; i < buf.length; i++) {
    const c = buf[i];
    if (c === '\\') {
      const n = buf[i + 1];
      if (n === undefined) break; // dangling escape — stop (incomplete)
      // Minimal JSON unescape for the common cases.
      const map = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/' };
      out += map[n] ?? n;
      i++; // skip the escaped char
      continue;
    }
    if (c === '"') return out; // closed
    out += c;
  }
  return out; // unclosed — return what we have so far
}

export function validatePlannerOutput(raw) {
  if (!raw || typeof raw !== 'object') throw new PlannerError('planner output not an object');
  const { title, caption, image_prompt } = raw;
  if (typeof title !== 'string' || !title.trim()) throw new PlannerError('title missing');
  if (typeof caption !== 'string') throw new PlannerError('caption missing');
  if (typeof image_prompt !== 'string' || !image_prompt.trim()) throw new PlannerError('image_prompt missing');
  return {
    title: String(title).slice(0, 80),
    caption: String(caption).slice(0, 220),
    image_prompt: String(image_prompt),
  };
}

export async function callPlanner({ topic, userNote = null, path = [], currentLabel = '', depth = 0, maxDepth = 99, sources = [], seedImagePath = null, seedDescription = null, lang = 'zh', onFields = null }) {
  const userLang = normalizeLang(lang);
  const { system, planner } = await loadPrompts();
  // When a seed image is attached, layer in the image-extend prompt
  // addendum which forces preservation of the user's content/composition.
  let plannerBody = planner;
  if (seedImagePath) {
    try {
      const seedAddendum = await loadPrompt('planner-with-seed.md');
      plannerBody = `${planner}\n\n${seedAddendum}`;
    } catch { /* addendum file optional */ }
  }
  const inputs = {
    topic,
    // The user's free-form note / focus instruction, kept separate from the
    // (possibly image-derived) `topic` subject so it isn't lost. May ask to
    // focus on part of the image or set tone/audience. null = no note.
    user_note: userNote || null,
    path: path.map((p) => ({ title: p.title })),
    current_label: currentLabel,
    depth,
    max_depth: maxDepth,
    sources: sources.slice(0, 12).map((s) => ({
      title: s.title, url: s.url, snippet: s.snippet, source: s.source,
    })),
    lang: userLang,
    language_instruction: languageInstruction(userLang),
    has_seed_image: !!seedImagePath,
    // The describe-first step's structured read of what's actually
    // pictured. The planner's caption/title MUST be about this subject,
    // never about "the seed image" as a meta-object. When absent (stub
    // mode or describe failed), the planner falls back to topic.
    seed_subject: seedDescription?.subject || null,
    seed_description: seedDescription?.description || null,
    seed_features: seedDescription?.key_features || null,
  };
  const parts = [
    system,
    '',
    '## User language requirement',
    languageInstruction(userLang),
    '',
    plannerBody,
    '',
  ];
  if (seedImagePath) {
    parts.push(
      '## Seed image',
      `@${seedImagePath}`,
      '',
    );
    if (seedDescription?.subject) {
      parts.push(
        `## What the image actually shows`,
        `Subject: ${seedDescription.subject}`,
        seedDescription.description ? `Description: ${seedDescription.description}` : '',
        seedDescription.key_features?.length
          ? `Key features: ${seedDescription.key_features.join('; ')}`
          : '',
        '',
        'Your title, caption, and image_prompt must describe THIS SUBJECT — the actual thing pictured. NEVER write meta-references like "the seed image", "the source image", "the picture shows", "this image depicts". The reader must not be aware an upload exists; they should just see an annotated encyclopedia page about the subject.',
        '',
      );
    } else {
      parts.push(
        'A user-supplied source image is attached above. Treat it as the canonical visual content. Your job is to PRESERVE its subject, composition, and zone layout, only restyling to the encyclopedia look and adding 20–40 short text annotations OVER the existing scene. Title and caption must describe the SUBJECT pictured (not the image-as-an-object).',
        '',
      );
    }
  }
  parts.push(
    '## Inputs (JSON)',
    JSON.stringify(inputs, null, 2),
    '',
    '## Output',
    'Return JSON ONLY matching the schema above. No prose. No backticks.',
  );
  const prompt = parts.join('\n');
  // Streaming path: when a field callback is supplied, drive the model
  // incrementally and surface partial title/caption/image_prompt as they
  // arrive (for the typewriter UI). Falls back to non-streaming on failure.
  if (onFields) {
    try {
      const { parsed } = await callOnceStream({
        prompt,
        tag: 'planner',
        onDelta: (full, attempt, maxAttempts) => {
          try {
            onFields({
              title: extractPartialField(full, 'title'),
              caption: extractPartialField(full, 'caption'),
              image_prompt: extractPartialField(full, 'image_prompt'),
              attempt,
              maxAttempts,
            });
          } catch { /* ignore partial-extract errors */ }
        },
      });
      return validatePlannerOutput(parsed);
    } catch (e) {
      // Streaming failed (parse/timeout/etc.) — fall back to the proven
      // non-streaming path so generation still completes. Refusals rethrow.
      if (e?.name === 'PlannerRefusalError') throw e;
    }
  }
  const { parsed } = await callOnce({ prompt, tag: 'planner' });
  return validatePlannerOutput(parsed);
}
