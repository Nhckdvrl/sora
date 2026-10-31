import { migrateRigDocument } from '@standrig/core/migration';

export async function loadSoraModel() {
  // Resolve against the page, preserving GitHub Pages' repository subdirectory.
  const url = new URL(`${import.meta.env.BASE_URL}model/sora-v0.3.1.json`, document.baseURI);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`模型下载失败（${response.status}）`);
  const source = await response.text();
  return { rig: migrateRigDocument(JSON.parse(source)), source };
}
