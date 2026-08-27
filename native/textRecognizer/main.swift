// Snapper's on-device text-recognition helper (Universal Text Capture,
// BUILD-SPEC.md §3.10 / §4.9). Promoted from spikes/text-recognition-helper.swift
// once the Phase 8 spikes confirmed the approach — see spikes/FINDINGS.md.
//
// This is the ONLY place Vision is used. It is a standalone CLI, invoked by
// src/main/capture/textRecognition.ts via child_process exactly the way
// screencapture.ts shells out to /usr/sbin/screencapture (CLAUDE.md Hard
// Rule 2 — every macOS system-access surface lives behind main/capture/).
//
// Runs entirely on-device (Vision framework, no network) — CLAUDE.md Hard
// Rule 1. Takes an image path, prints recognized text + bounding boxes as
// JSON on stdout. Bounding boxes are Vision's raw normalized (0-1),
// BOTTOM-LEFT-origin convention — confirmed empirically in spikes/FINDINGS.md
// "Phase 8 spike B" — left unconverted here; textRecognition.ts and
// displayManager.ts's `visionBoxToGlobalPoints` own turning these into real
// screen coordinates.
//
// Build: node scripts/buildTextRecognizer.mjs (wraps `swiftc -O`)
// Run:   text-recognizer <image-path>

import Foundation
import Vision
import ImageIO

struct WordResult: Codable {
    let text: String
    let boundingBox: [String: Double]
}

struct LineResult: Codable {
    let text: String
    let confidence: Double
    let boundingBox: [String: Double]
    let words: [WordResult]
}

struct OutputResult: Codable {
    let lines: [LineResult]
    let recognitionMs: Double
    let imageWidth: Int
    let imageHeight: Int
}

func boxDict(_ box: CGRect) -> [String: Double] {
    return ["x": box.origin.x, "y": box.origin.y, "width": box.size.width, "height": box.size.height]
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}

guard CommandLine.arguments.count >= 2 else {
    fail("Usage: text-recognizer <image-path>")
}

let imagePath = CommandLine.arguments[1]
let imageURL = URL(fileURLWithPath: imagePath)

guard let imageSource = CGImageSourceCreateWithURL(imageURL as CFURL, nil),
      let cgImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
    fail("Could not load image at \(imagePath)")
}

var lineResults: [LineResult] = []

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

let start = DispatchTime.now()
do {
    try handler.perform([request])
} catch {
    fail("Vision request failed: \(error)")
}
let elapsedMs = Double(DispatchTime.now().uptimeNanoseconds - start.uptimeNanoseconds) / 1_000_000

guard let observations = request.results else {
    fail("No results from Vision request")
}

for observation in observations {
    guard let topCandidate = observation.topCandidates(1).first else { continue }
    let fullString = topCandidate.string

    var words: [WordResult] = []
    fullString.enumerateSubstrings(in: fullString.startIndex..<fullString.endIndex, options: .byWords) { substring, range, _, _ in
        guard let substring = substring else { return }
        if let rectObservation = try? topCandidate.boundingBox(for: range) {
            words.append(WordResult(text: substring, boundingBox: boxDict(rectObservation.boundingBox)))
        }
    }

    lineResults.append(LineResult(
        text: fullString,
        confidence: Double(topCandidate.confidence),
        boundingBox: boxDict(observation.boundingBox),
        words: words
    ))
}

let output = OutputResult(
    lines: lineResults,
    recognitionMs: elapsedMs,
    imageWidth: cgImage.width,
    imageHeight: cgImage.height
)

let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]
let jsonData = try! encoder.encode(output)
print(String(data: jsonData, encoding: .utf8)!)
