import { clipboard, nativeImage } from 'electron'
import { readFile } from 'node:fs/promises'

export class ClipboardWriteError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'ClipboardWriteError'
  }
}

/** Reads a PNG file and writes it to the system clipboard as an image. */
export async function copyImageFileToClipboard(filePath: string): Promise<void> {
  const buffer = await readFile(filePath)
  const image = nativeImage.createFromBuffer(buffer)
  if (image.isEmpty()) {
    throw new ClipboardWriteError(`Could not decode image for clipboard: ${filePath}`)
  }
  clipboard.writeImage(image)
}

/** Writes plain text to the system clipboard — Universal Text Capture's Copy action (BUILD-SPEC.md §4.9). */
export function copyTextToClipboard(text: string): void {
  clipboard.writeText(text)
}
