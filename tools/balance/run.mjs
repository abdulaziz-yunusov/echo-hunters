// Runs the balance bot in Node. Vite loads the TypeScript (with the '@/' alias),
// the same way the game and the tests are built.
import { fileURLToPath } from 'node:url';
import { createServer, createServerModuleRunner } from 'vite';

const server = await createServer({
  configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
  root: fileURLToPath(new URL('../..', import.meta.url)),
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'error',
});
let failed = false;
try {
  const runner = createServerModuleRunner(server.environments.ssr, { hmr: false });
  const balance = await runner.import('/tools/balance/balance.ts');
  balance.main(process.argv.slice(2));
  await runner.close();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  failed = true;
} finally {
  await server.close();
}
process.exit(failed ? 1 : 0);
