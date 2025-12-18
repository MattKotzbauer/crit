import { getCritPath, paths } from "./paths";

export interface CritConfig {
  version: string;
}

export async function loadConfig(base: string = process.cwd()): Promise<CritConfig | null> {
  const configPath = getCritPath(paths.config, base);
  const file = Bun.file(configPath);

  if (!(await file.exists())) {
    return null;
  }

  try {
    return await file.json();
  } catch {
    return null;
  }
}

export async function saveConfig(config: CritConfig, base: string = process.cwd()): Promise<void> {
  const configPath = getCritPath(paths.config, base);
  await Bun.write(configPath, JSON.stringify(config, null, 2));
}
