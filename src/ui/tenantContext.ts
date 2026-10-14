import * as fs from "fs";
import * as path from "path";
import { Client, ClientConfig, normalizeConfig, readTenantDocument, serializeTenant, tenantsInFile } from "../core/clients";
import { readJson, writeJson } from "../core/files";

let globalTenantsFile: string | undefined;
let mode: "global" | "folder" = "global";
let roots: () => string[] = () => [];
let selected: string | undefined;
let active: Client | undefined;

const keyOf = (tenant: Client) => `${tenant.configFile}\0${tenant.name}`;

export function configureTenantContext(file: string, location: "global" | "folder", workspaceRoots: () => string[]): void {
  globalTenantsFile = file;
  roots = workspaceRoots;
  if (mode !== location) { selected = undefined; active = undefined; }
  mode = location;
  if (selected) {
    const saved = availableTenants().find((tenant) => keyOf(tenant) === selected);
    if (saved && active && keyOf(active) === selected) active.reload();
    else active = saved;
    if (!saved) selected = undefined;
  }
  if (mode === "folder" && !selected) {
    for (const file of localFiles()) {
      try {
        const document = readTenantDocument(file);
        const tenant = tenantsInFile(file, path.dirname(path.dirname(file))).find((item) => item.name === document.defaultTenant);
        if (tenant) { selected = keyOf(tenant); active = tenant; break; }
      } catch { /* Leave a malformed config for the user to fix in the editor. */ }
    }
  }
}

function localFiles(): string[] {
  return [...new Set(roots().map((root) => path.join(root, ".lantern", "config.json")))]
    .filter((file) => fs.existsSync(file));
}

export function availableTenants(): Client[] {
  if (mode === "global") {
    if (!globalTenantsFile) return [];
    try { return tenantsInFile(globalTenantsFile, roots()[0] ?? path.dirname(globalTenantsFile)); }
    catch { return []; }
  }
  return localFiles().flatMap((file) => {
    try { return tenantsInFile(file, path.dirname(path.dirname(file))); }
    catch { return []; }
  });
}

export function activeTenant(): Client | undefined {
  return active;
}

export function selectTenant(tenant: Client | undefined): void {
  selected = tenant ? keyOf(tenant) : undefined;
  active = tenant;
}

export function tenantMode(): "global" | "folder" { return mode; }

export function tenantConfigFile(): string | undefined {
  if (mode === "global") return globalTenantsFile;
  const root = roots()[0];
  if (!root) return undefined;
  return path.join(root, ".lantern", "config.json");
}

export function addTenant(name: string, config: Partial<ClientConfig>, workspaceRoot?: string): Client {
  const file = mode === "folder" && workspaceRoot
    ? path.join(workspaceRoot, ".lantern", "config.json")
    : tenantConfigFile();
  if (!file) throw new Error("Open a folder before adding a local tenant.");
  const document = readTenantDocument(file);
  if (document.tenants.some((existing) => existing.name.toLowerCase() === name.toLowerCase())) throw new Error(`Tenant ${name} already exists.`);
  document.tenants.push(serializeTenant(name, config));
  if (mode === "global" && config.folder) document.removedFolders = (document.removedFolders ?? []).filter((folder) => path.resolve(folder) !== path.resolve(config.folder!));
  if (mode === "folder" && !document.defaultTenant) document.defaultTenant = name;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJson(file, document);
  const tenant = tenantsInFile(file, mode === "folder" ? path.dirname(path.dirname(file)) : roots()[0] ?? path.dirname(file)).find((entry) => entry.name === name)!;
  selectTenant(tenant);
  return tenant;
}

export function removeTenant(tenant: Client): void {
  const document = readTenantDocument(tenant.configFile);
  document.tenants = document.tenants.filter((entry) => entry.name !== tenant.name);
  if (mode === "global") (document.removedFolders ??= []).push(tenant.dir);
  if (document.defaultTenant === tenant.name) delete document.defaultTenant;
  writeJson(tenant.configFile, document);
  if (selected === keyOf(tenant)) selected = undefined;
  if (active && keyOf(active) === keyOf(tenant)) active = undefined;
}

/** Bring an existing folder connection into the shared list without changing its old config. */
export function registerStoredTenant(tenant: Client, explicit = false): void {
  if (mode !== "global" || !globalTenantsFile) return;
  const document = readTenantDocument(globalTenantsFile);
  if (document.removedFolders?.some((folder) => path.resolve(folder) === path.resolve(tenant.dir))) {
    if (!explicit) return;
    document.removedFolders = document.removedFolders.filter((folder) => path.resolve(folder) !== path.resolve(tenant.dir));
  }
  if (document.tenants.some((config) => config.folder && path.resolve(config.folder) === path.resolve(tenant.dir))) return;
  const imported = document.tenants.find((config) =>
    config.name === tenant.name && !config.folder &&
    (config.org === tenant.config.org || config.environments?.some((env) => env.org === tenant.config.org))
  );
  if (imported) {
    imported.folder = tenant.dir;
    writeJson(globalTenantsFile, document);
    return;
  }
  let name = tenant.name;
  for (let number = 2; document.tenants.some((entry) => entry.name === name); number++) name = `${tenant.name} ${number}`;
  document.tenants.push(serializeTenant(name, { ...tenant.config, folder: tenant.dir }));
  fs.mkdirSync(path.dirname(globalTenantsFile), { recursive: true });
  writeJson(globalTenantsFile, document);
}

/** Existing internal settings were stored as one file per folder. Keep them visible in the shared picker. */
export function importSavedTenants(storeDir: string): void {
  if (mode !== "global" || !globalTenantsFile) return;
  const document = readTenantDocument(globalTenantsFile);
  if (document.legacyImported) return;
  for (const file of fs.existsSync(storeDir) ? fs.readdirSync(storeDir) : []) {
    const match = /^(.*)-[a-f0-9]{10}\.lantern-client\.json$/.exec(file);
    if (!match) continue;
    try {
      const config = normalizeConfig(readJson<Partial<ClientConfig>>(path.join(storeDir, file)));
      if (document.tenants.some((saved) => saved.org === config.org && saved.tenant === config.tenant && saved.account === config.account)) continue;
      const base = match[1];
      let name = base;
      for (let number = 2; document.tenants.some((entry) => entry.name === name); number++) name = `${base} ${number}`;
      document.tenants.push(serializeTenant(name, config));
    } catch { /* A malformed old connection is left untouched. */ }
  }
  document.legacyImported = true;
  fs.mkdirSync(path.dirname(globalTenantsFile), { recursive: true });
  writeJson(globalTenantsFile, document);
}
