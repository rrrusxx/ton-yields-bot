/**
 * The bot's own storage: a Deno KV file, ./data/kv.db by default. On GitHub
 * Actions it is carried from one run to the next by actions/cache (see
 * .github/workflows/daily-post.yml); locally it lives in the working
 * directory. YIELDS_KV_PATH points it elsewhere (tests use a temporary file).
 * Callers close the handle when they are done.
 */
export async function openKv(): Promise<Deno.Kv> {
  const path = Deno.env.get("YIELDS_KV_PATH") || "./data/kv.db";
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".";
  if (dir) await Deno.mkdir(dir, { recursive: true });
  return await Deno.openKv(path);
}
