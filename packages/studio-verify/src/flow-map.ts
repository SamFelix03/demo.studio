import { execFileSync } from "node:child_process";

export type FlowMap = Record<string, string[]>;

export function globToRegExp(glob: string): RegExp {
  let pattern = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*") {
      if (glob[index + 1] === "*") {
        if (glob[index + 2] === "/") {
          pattern += "(?:.*/)?";
          index += 2;
        } else {
          pattern += ".*";
          index += 1;
        }
      } else {
        pattern += "[^/]*";
      }
      continue;
    }
    pattern += char.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${pattern}$`);
}

export function matchesGlob(filePath: string, glob: string): boolean {
  return globToRegExp(glob).test(filePath);
}

export type BlastRadius = {
  flows: string[];
  unmapped: string[];
};

export function mapFilesToFlows(files: string[], flowMap: FlowMap): BlastRadius {
  const flows = new Set<string>();
  const unmapped: string[] = [];

  for (const file of files) {
    let claimed = false;
    for (const [glob, mapped] of Object.entries(flowMap)) {
      if (!matchesGlob(file, glob)) continue;
      claimed = true;
      for (const flow of mapped) flows.add(flow);
    }
    if (!claimed) unmapped.push(file);
  }

  return { flows: [...flows].sort(), unmapped };
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

/** Unstaged, staged, and untracked — the working tree the stop hook sees. */
export function changedFiles(cwd: string = process.cwd()): string[] {
  const files = new Set<string>();
  const collect = (raw: string) => {
    for (const line of raw.split("\n")) {
      const file = line.trim();
      if (file) files.add(file);
    }
  };

  try {
    collect(git(["diff", "HEAD", "--name-only"], cwd));
    collect(git(["diff", "--cached", "--name-only"], cwd));
    collect(git(["ls-files", "--others", "--exclude-standard"], cwd));
  } catch {
    // No commits yet, or not a git repo.
  }

  return [...files].sort();
}

export function headCommit(cwd: string = process.cwd()): string {
  try {
    return git(["rev-parse", "--short", "HEAD"], cwd).trim();
  } catch {
    return "uncommitted";
  }
}

export function isWorkingTreeClean(cwd: string = process.cwd()): boolean {
  try {
    return git(["status", "--porcelain"], cwd).trim() === "";
  } catch {
    return false;
  }
}
