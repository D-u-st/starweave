/**
 * chunkDiscordText
 *
 * Splits a string into chunks that fit within Discord's message size limits.
 *
 * Rules applied in order:
 *  1. Hard character limit (default 2000, configurable via maxChars).
 *  2. Soft line-count limit: prefer not to exceed MAX_LINES lines per chunk.
 *  3. Code-fence (```) awareness: if a chunk boundary would leave a fence open,
 *     the fence is closed at the end of the current chunk and re-opened at the
 *     start of the next chunk, preserving syntax-highlighting continuity.
 *  4. Italic/reasoning fix: a lone asterisk (*) left dangling at a boundary is
 *     closed before splitting and re-opened in the next chunk so Discord does not
 *     render the whole following message as italic.
 */

const MAX_LINES = 80; // soft limit on lines per chunk

/**
 * Returns the language tag of an open code fence in `text`, or null if no
 * fence is currently open.
 *
 * Scans all ``` occurrences and tracks open/close state.  An opening fence
 * may optionally carry a language tag on the same line (e.g. ```ts).
 */
function getOpenFence(text: string): string | null {
  // Match every ``` occurrence together with an optional language tag
  const fencePattern = /^```([a-zA-Z0-9_+-]*)$/gm;
  let openTag: string | null = null;

  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(text)) !== null) {
    if (openTag === null) {
      // Opening fence — capture language tag (may be empty string)
      openTag = match[1];
    } else {
      // Closing fence
      openTag = null;
    }
  }

  return openTag; // non-null means a fence was opened but never closed
}

/**
 * Returns true if `text` has an odd number of bare asterisks (*) that are NOT
 * part of a bold marker (**), meaning italics are currently open.
 *
 * This is a best-effort heuristic; Discord's actual parser is more complex.
 */
function hasOpenItalic(text: string): boolean {
  // Remove all ** pairs so we only count single *
  const stripped = text.replace(/\*\*/g, "");
  const count = (stripped.match(/\*/g) ?? []).length;
  return count % 2 !== 0;
}

/**
 * Split `text` into Discord-safe chunks.
 *
 * @param text     The full text to split.
 * @param maxChars Maximum characters per chunk (default: 2000).
 * @returns        Array of string chunks, each ≤ maxChars characters.
 */
export function chunkDiscordText(text: string, maxChars = 2000): string[] {
  // Nothing to chunk
  if (!text || text.length === 0) return [];

  // Fits in one message — return as-is
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  const lines = text.split("\n");

  let currentLines: string[] = [];
  let currentLength = 0; // character count of currentLines joined with \n

  const flushChunk = () => {
    if (currentLines.length === 0) return;

    let chunk = currentLines.join("\n");

    // --- Code-fence fix ---
    // If there is an open fence in the accumulated chunk, close it before
    // emitting so the chunk is valid Markdown on its own.
    const openFence = getOpenFence(chunk);
    if (openFence !== null) {
      chunk += "\n```";
    }

    // --- Italic fix ---
    // If a bare italic is open, close it.
    if (hasOpenItalic(chunk)) {
      chunk += "*";
    }

    chunks.push(chunk);

    // Prepare the opener for the next chunk
    const nextOpener: string[] = [];

    if (openFence !== null) {
      // Re-open the code fence with the original language tag
      nextOpener.push("```" + openFence);
    }

    // Reset accumulator, seeding it with any re-openers
    currentLines = nextOpener;
    currentLength = nextOpener.length > 0 ? nextOpener.join("\n").length + 1 : 0;
  };

  for (const line of lines) {
    // +1 accounts for the \n separator that join("\n") would add
    const addedLength = currentLines.length === 0 ? line.length : line.length + 1;
    const wouldExceedChars = currentLength + addedLength > maxChars;
    const wouldExceedLines = currentLines.length >= MAX_LINES;

    if ((wouldExceedChars || wouldExceedLines) && currentLines.length > 0) {
      flushChunk();
    }

    // If a single line by itself exceeds maxChars, hard-split it
    if (line.length > maxChars) {
      let remaining = line;
      while (remaining.length > 0) {
        const slice = remaining.slice(0, maxChars);
        remaining = remaining.slice(maxChars);

        // Flush whatever was buffered first
        if (currentLines.length > 0) {
          flushChunk();
        }

        if (remaining.length === 0) {
          // Last piece — add to current buffer normally
          currentLines.push(slice);
          currentLength = slice.length;
        } else {
          // Intermediate piece — emit directly
          chunks.push(slice);
        }
      }
      continue;
    }

    currentLines.push(line);
    currentLength += addedLength;
  }

  // Flush the final partial chunk
  flushChunk();

  return chunks;
}
