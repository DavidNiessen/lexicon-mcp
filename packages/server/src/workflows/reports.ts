import { realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

function csvCell(value: unknown): string {
  let text =
    value === undefined || value === null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  // Avoid spreadsheet formula execution when a report is opened in Excel.
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export class ExportService {
  constructor(private readonly allowedDirectory: string) {}

  async write(
    format: "json" | "csv",
    outputPath: string,
    data: unknown,
  ): Promise<{ outputPath: string; bytes: number }> {
    if (!isAbsolute(outputPath))
      throw new Error("Export outputPath must be absolute");
    const root = await realpath(this.allowedDirectory);
    const parent = await realpath(dirname(outputPath));
    const candidate = resolve(parent, outputPath.split(/[\\/]/).at(-1)!);
    const location = relative(root, candidate);
    if (
      !location ||
      location === ".." ||
      location.startsWith(`..${sep}`) ||
      isAbsolute(location)
    )
      throw new Error("Export path is outside the configured directory");
    let content: string;
    if (format === "json") content = `${JSON.stringify(data, null, 2)}\n`;
    else if (format === "csv") {
      if (
        !Array.isArray(data) ||
        data.some(
          (row) =>
            row === null || typeof row !== "object" || Array.isArray(row),
        )
      )
        throw new Error("CSV exports require an array of row objects");
      const columns = [
        ...new Set(
          data.flatMap((row) => Object.keys(row as Record<string, unknown>)),
        ),
      ];
      content = `${[columns.map(csvCell).join(","), ...data.map((row) => columns.map((column) => csvCell((row as Record<string, unknown>)[column])).join(","))].join("\r\n")}\r\n`;
    } else throw new Error("Unsupported export format");
    // Never silently replace an existing file or follow an existing symlink.
    await writeFile(candidate, content, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    return { outputPath: candidate, bytes: Buffer.byteLength(content) };
  }
}
