export type DroppedEntry =
  | { kind: "folder"; relativePath: string }
  | { kind: "file"; relativePath: string; file: File };

export type DropReadResult = {
  entries: DroppedEntry[];
  truncated: boolean;
  preservedFolders: boolean;
};

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (success: (file: File) => void, error?: () => void) => void;
  createReader?: () => { readEntries: (success: (entries: FileSystemEntryLike[]) => void, error?: () => void) => void };
};

const MAX_DROP_ENTRIES = 1000;

function getEntry(item: DataTransferItem): FileSystemEntryLike | null {
  const readEntry = (item as unknown as { webkitGetAsEntry?: () => FileSystemEntryLike | null }).webkitGetAsEntry;
  return readEntry?.call(item) ?? null;
}

function readFile(entry: FileSystemEntryLike) {
  return new Promise<File | null>((resolve) => {
    if (!entry.file) {
      resolve(null);
      return;
    }
    entry.file((file) => resolve(file), () => resolve(null));
  });
}

async function readDirectory(entry: FileSystemEntryLike) {
  const reader = entry.createReader?.();
  if (!reader) return [];
  const collected: FileSystemEntryLike[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve) => reader.readEntries(resolve, () => resolve([])));
    if (!batch.length) return collected;
    collected.push(...batch);
  }
}

export function isExternalFileDrag(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes("Files") && !dataTransfer.types.includes("text/workbench-entry");
}

export async function readDroppedEntries(dataTransfer: DataTransfer): Promise<DropReadResult> {
  const output: DroppedEntry[] = [];
  let truncated = false;
  const add = (entry: DroppedEntry) => {
    if (output.length >= MAX_DROP_ENTRIES) { truncated = true; return false; }
    output.push(entry);
    return true;
  };

  const walk = async (entry: FileSystemEntryLike, parentPath = "") => {
    if (truncated) return;
    const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    if (entry.isFile) {
      const file = await readFile(entry);
      if (file) add({ kind: "file", relativePath: path, file });
      return;
    }
    if (!entry.isDirectory || !add({ kind: "folder", relativePath: path })) return;
    for (const child of await readDirectory(entry)) await walk(child, path);
  };

  const items = Array.from(dataTransfer.items).filter((item) => item.kind === "file");
  const roots = items.map(getEntry).filter((entry): entry is FileSystemEntryLike => Boolean(entry));
  if (roots.length) {
    for (const root of roots) await walk(root);
    return { entries: output, truncated, preservedFolders: true };
  }

  for (const file of Array.from(dataTransfer.files)) {
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    add({ kind: "file", relativePath, file });
  }
  return { entries: output, truncated, preservedFolders: false };
}
