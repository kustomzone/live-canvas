// Apple Vision OCR helper for the flipbook server.
//
// Usage: swift ocr-vision.swift <imagePath>
// Prints JSON to stdout:
//   {
//     "image_w": 2752,
//     "image_h": 1536,
//     "elapsed_ms": 591,
//     "spans": [
//       { "text": "苏堤春晓", "confidence": 0.97, "bbox": [x, y, w, h] },
//       ...
//     ]
//   }
//
// Coordinates: bbox is normalized to [0, 1] with origin at TOP-LEFT
// (we convert from Vision's native bottom-left origin so the rest of the
// system uses one convention).
//
// Languages: hard-coded to zh-Hans + en-US to match the planner's outputs.
// Override via VISION_LANGS env (comma-separated BCP-47 codes).

import Vision
import AppKit
import Foundation

func die(_ msg: String, code: Int32 = 1) -> Never {
  FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
  exit(code)
}

guard CommandLine.arguments.count >= 2 else {
  die("usage: ocr-vision.swift <imagePath>", code: 2)
}
let imagePath = CommandLine.arguments[1]

guard let img = NSImage(contentsOfFile: imagePath),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  die("could not load image: \(imagePath)")
}

let imageW = cg.width
let imageH = cg.height

let langs: [String] = {
  if let env = ProcessInfo.processInfo.environment["VISION_LANGS"], !env.isEmpty {
    return env.split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces) }
  }
  return ["zh-Hans", "en-US"]
}()

let start = Date()
let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.recognitionLanguages = langs
req.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
do {
  try handler.perform([req])
} catch {
  die("vision request failed: \(error.localizedDescription)")
}
let elapsedMs = Int(Date().timeIntervalSince(start) * 1000)

var spans: [[String: Any]] = []
for obs in (req.results ?? []) {
  guard let top = obs.topCandidates(1).first else { continue }
  let txt = top.string.trimmingCharacters(in: .whitespacesAndNewlines)
  if txt.isEmpty { continue }
  let bb = obs.boundingBox  // origin = bottom-left, normalized 0..1
  let yTop = 1.0 - (bb.origin.y + bb.size.height)
  spans.append([
    "text": txt,
    "confidence": top.confidence,
    "bbox": [bb.origin.x, yTop, bb.size.width, bb.size.height],
  ])
}

let out: [String: Any] = [
  "image_w": imageW,
  "image_h": imageH,
  "elapsed_ms": elapsedMs,
  "languages": langs,
  "spans": spans,
]

let data: Data
do {
  data = try JSONSerialization.data(withJSONObject: out, options: [])
} catch {
  die("could not serialize result: \(error.localizedDescription)")
}
FileHandle.standardOutput.write(data)
