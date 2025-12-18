import { getCritDir, getCritPath, paths, critExists } from "../lib/paths";

export async function rules() {
  const critDir = getCritDir();

  if (!critExists()) {
    console.log("crit is not initialized. Run 'crit init' first.");
    return;
  }

  const rulesFile = Bun.file(getCritPath(paths.rules));

  if (!(await rulesFile.exists())) {
    console.log("No rules.md file found.");
    return;
  }

  const content = await rulesFile.text();
  console.log(content);
}
