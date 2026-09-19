import { inflateSync } from "node:zlib";

// Decode the standard-font PDFKit output used by the personnel generators.
export function extractPdfText(pdf: Uint8Array): string[] {
  const pdfSource = Buffer.from(pdf).toString("latin1");
  const inflatedStreams: string[] = [];

  // Read the declared byte length: compressed data can itself end in CR/LF,
  // so delimiting streams with a newline regex can silently truncate a page.
  for (const match of pdfSource.matchAll(
    /<<\s*\/Length\s+(\d+)\s*\/Filter\s*\/FlateDecode\s*>>\s*stream\r?\n/g,
  )) {
    const start = match.index! + match[0].length;
    inflatedStreams.push(
      inflateSync(Buffer.from(pdfSource.slice(start, start + Number(match[1])), "latin1"))
        .toString("latin1"),
    );
  }

  const lines: string[] = [];
  for (const stream of inflatedStreams) {
    for (const textMatch of stream.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
      const chunks = Array.from(
        textMatch[1].matchAll(/<([0-9a-fA-F]+)>/g),
        (hexMatch) => Buffer.from(hexMatch[1], "hex"),
      );
      const line = new TextDecoder("windows-1252")
        .decode(Buffer.concat(chunks))
        .replace(/\s+/g, " ")
        .trim();
      if (line) {
        lines.push(line);
      }
    }
  }

  return lines;
}

