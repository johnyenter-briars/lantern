import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Client } from "../core/clients";
import { UserError } from "../core/errors";

/** Open a link with the active environment's browser and profile. */
export async function openEnvironmentUrl(client: Client, url: string): Promise<void> {
  const environment = client.activeEnvironment;
  if (environment?.defaultBrowser !== "firefox") {
    await vscode.env.openExternal(vscode.Uri.parse(url));
    return;
  }

  const candidates = process.platform === "win32"
    ? [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA]
        .filter((dir): dir is string => !!dir)
        .map((dir) => path.join(dir, "Mozilla Firefox", "firefox.exe"))
    : [];
  const firefox = candidates.find((candidate) => fs.existsSync(candidate)) ?? "firefox";
  const profile = environment.defaultProfile?.trim();
  const args = [...(profile ? ["-P", profile] : []), url];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(firefox, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.once("error", (error: NodeJS.ErrnoException) => {
      reject(error.code === "ENOENT" ? new UserError("Firefox was not found. Install Firefox or add it to PATH.") : error);
    });
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}
