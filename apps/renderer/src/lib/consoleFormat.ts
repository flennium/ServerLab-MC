export interface ConsoleSegment {
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

interface ConsoleStyle {
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

const MINECRAFT_COLORS: Record<string, string> = {
  "0": "#202225",
  "1": "#3b5fff",
  "2": "#3fb950",
  "3": "#22b8cf",
  "4": "#f85149",
  "5": "#c084fc",
  "6": "#d9823b",
  "7": "#d0d7de",
  "8": "#6e7681",
  "9": "#58a6ff",
  a: "#56d364",
  b: "#39c5cf",
  c: "#ff7b72",
  d: "#f778ba",
  e: "#f2cc60",
  f: "#f0f6fc",
};

const ANSI_COLORS: Record<number, string> = {
  30: "#202225",
  31: "#ff7b72",
  32: "#56d364",
  33: "#f2cc60",
  34: "#58a6ff",
  35: "#f778ba",
  36: "#39c5cf",
  37: "#f0f6fc",
  90: "#6e7681",
  91: "#ff9b93",
  92: "#7ee787",
  93: "#f7d774",
  94: "#79c0ff",
  95: "#ffa7d9",
  96: "#56d4dd",
  97: "#ffffff",
};

const ESCAPE = String.fromCharCode(27);

function sameStyle(a: ConsoleStyle, b: ConsoleStyle): boolean {
  return (
    a.color === b.color &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline
  );
}

function applyAnsiCode(style: ConsoleStyle, code: number): ConsoleStyle {
  if (code === 0) return {};
  if (code === 1) return { ...style, bold: true };
  if (code === 3) return { ...style, italic: true };
  if (code === 4) return { ...style, underline: true };
  if (code === 22) return { ...style, bold: false };
  if (code === 23) return { ...style, italic: false };
  if (code === 24) return { ...style, underline: false };
  if (code === 39) return { ...style, color: undefined };
  if (ANSI_COLORS[code]) return { ...style, color: ANSI_COLORS[code] };
  return style;
}

function appendSegment(
  segments: ConsoleSegment[],
  text: string,
  style: ConsoleStyle
): void {
  if (!text) return;
  const previous = segments.at(-1);
  if (previous && sameStyle(previous, style)) {
    previous.text += text;
    return;
  }
  segments.push({ text, ...style });
}

function readAnsiSequence(
  line: string,
  cursor: number
): { length: number; codes: number[] } | null {
  if (line[cursor] !== ESCAPE || line[cursor + 1] !== "[") return null;

  let end = cursor + 2;
  while (end < line.length) {
    const code = line.charCodeAt(end);
    if (code >= 0x40 && code <= 0x7e) break;
    end += 1;
  }

  if (end >= line.length) return null;
  if (line[end] !== "m") return { length: end - cursor + 1, codes: [] };

  const rawCodes = line.slice(cursor + 2, end);
  const codes = rawCodes ? rawCodes.split(";").filter(Boolean).map(Number) : [0];

  return { length: end - cursor + 1, codes };
}

export function formatConsoleLine(input: string): ConsoleSegment[] {
  const line = input.replace(/\u00c2\u00a7/g, "\u00a7").replace(/\r/g, "");
  const segments: ConsoleSegment[] = [];
  let style: ConsoleStyle = {};
  let cursor = 0;

  while (cursor < line.length) {
    const minecraftIndex = line.indexOf("\u00a7", cursor);
    const ansiIndex = line.indexOf(ESCAPE, cursor);

    const nextIndex =
      minecraftIndex === -1
        ? ansiIndex
        : ansiIndex === -1
          ? minecraftIndex
          : Math.min(minecraftIndex, ansiIndex);

    if (nextIndex === -1) {
      appendSegment(segments, line.slice(cursor), style);
      break;
    }

    appendSegment(segments, line.slice(cursor, nextIndex), style);

    if (nextIndex === minecraftIndex) {
      const code = line[nextIndex + 1]?.toLowerCase();
      if (code === "r") style = {};
      else if (code === "l") style = { ...style, bold: true };
      else if (code === "o") style = { ...style, italic: true };
      else if (code === "n") style = { ...style, underline: true };
      else if (code && MINECRAFT_COLORS[code]) {
        style = { color: MINECRAFT_COLORS[code] };
      }
      cursor = nextIndex + 2;
      continue;
    }

    const ansi = readAnsiSequence(line, nextIndex);
    if (!ansi) {
      appendSegment(segments, line[nextIndex], style);
      cursor = nextIndex + 1;
      continue;
    }
    style = ansi.codes.reduce(applyAnsiCode, style);
    cursor = nextIndex + ansi.length;
  }

  return segments.length > 0 ? segments : [{ text: "" }];
}
