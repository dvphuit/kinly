import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const gitHooksDir = resolve(repoRoot, '.git/hooks');
const sourceHook = resolve(__dirname, 'pre-push.sh');
const targetHook = resolve(gitHooksDir, 'pre-push');

try {
  if (!existsSync(gitHooksDir)) {
    mkdirSync(gitHooksDir, { recursive: true });
  }
  if (existsSync(sourceHook)) {
    copyFileSync(sourceHook, targetHook);
    chmodSync(targetHook, 0o755);
    console.log('✅ [Kinly Git Hooks] pre-push hook installed successfully.');
  }
} catch (error) {
  console.warn('⚠️ [Kinly Git Hooks] Could not setup git hooks:', error.message);
}
