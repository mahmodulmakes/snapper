// Phase 8 spike A — PHASES.md "8.0 — Spikes". THROWAWAY, not app code.
//
// Question: does a minimal Swift CLI using Vision's VNRecognizeTextRequest
// correctly recognize text + bounding boxes from an image, invoked exactly
// the way the app will invoke it (spawn a process, read stdout), and how
// fast is a cold process launch + recognition?
//
// Also probes Spike D: are word-level bounding boxes obtainable (not just
// line-level), via VNRecognizedText.boundingBox(for:) on word substring
// ranges — this decides whether word-level highlighting is buildable.
//
// Build: swiftc -O spikes/text-recognition-helper.swift -o spikes/text-recognition-helper
// Run:   ./spikes/text-recognition-helper <image-path>
//
// Output: JSON on stdout — recognized lines, each with its own normalized
// bounding box (Vision's convention — unverified here whether it's
// bottom-left or top-left origin; that's checked by inspecting the output
// against the fixture's known text positions, not assumed) plus per-word
// bounding boxes, plus a recognitionMs timing figure.

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
    fail("Usage: text-recognition-helper <image-path>")
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
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
let jsonData = try! encoder.encode(output)
print(String(data: jsonData, encoding: .utf8)!)
