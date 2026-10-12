import { isHttpUrl } from "./fieldSchema";

export const MAX_FILE_LOCATION_LENGTH = 2048;

export const FILE_LOCATION_HINT = "Enter a web link (https://…) or a server path (\\\\192.168.1.10\\Design\\…)";

/**
 * Where a file or folder lives: a web link (http/https), or a path on the office file server that browsers cannot
 * open from a web page — `\\192.168.1.10\Design`, `//server/share`, `smb://…`, `afp://…`, `nfs://…`, or a mapped
 * drive like `Z:\Projects`. Spaces are allowed (folder names have them); control characters are not.
 */
export function isFileLocation(s: string): boolean {
  const v = s.trim();
  if (!v || v.length > MAX_FILE_LOCATION_LENGTH || /[\u0000-\u001f\u007f]/.test(v)) return false;
  if (isHttpUrl(v)) return true;
  return isServerPath(v);
}

/** A file-server path (UNC, smb/afp/nfs, or a mapped drive): shown as text with a copy button, never as a link. */
export function isServerPath(s: string): boolean {
  const v = s.trim();
  return /^(?:\\\\|\/\/)[^\\/\s]+(?:[\\/].*)?$/.test(v) || /^(?:smb|afp|nfs):\/\/[^\s/]+/i.test(v) || /^[A-Za-z]:[\\/]/.test(v);
}
