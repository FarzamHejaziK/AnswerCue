import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const require = createRequire(import.meta.url);
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'answercue-default-model-test-'));
const originalLoad = Module._load;
let CredentialsManager;
try {
  Module._load = function(id, ...args) {
    if (id === 'electron') return {
      app: { getPath: () => fixtureDir },
      // Fake encryption for fixture credentials only; never access the real keychain.
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: value => Buffer.from(value),
        decryptString: value => value.toString(),
      },
    };
    return originalLoad.call(this, id, ...args);
  };
  ({ CredentialsManager } = require(path.join(root, 'dist-electron/electron/services/CredentialsManager.js')));
} finally {
  Module._load = originalLoad;
}
beforeEach(() => fs.rmSync(path.join(fixtureDir, 'credentials.enc'), { force: true }));
after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));

const credentialsSource = fs.readFileSync(
  path.join(root, 'electron/services/CredentialsManager.ts'),
  'utf8',
);
const ipcSource = fs.readFileSync(path.join(root, 'electron/ipcHandlers.ts'), 'utf8');
const modelSelectorWindowSource = fs.readFileSync(
  path.join(root, 'src/components/ModelSelectorWindow.tsx'),
  'utf8',
);

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `could not locate ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `could not locate ${endNeedle} after ${startNeedle}`);
  return source.slice(start, end);
}

test('default model resolves to the first configured provider, with OpenAI before Gemini', () => {
  assert.match(credentialsSource, /openai:\s*DEFAULT_OPENAI_MODEL/);
  assert.match(credentialsSource, /claude:\s*DEFAULT_CLAUDE_MODEL/);
  assert.match(credentialsSource, /const CONFIGURED_PROVIDER_ORDER = \['natively', 'openai', 'gemini', 'claude', 'groq', 'deepseek'\]/);
  assert.match(
    credentialsSource,
    /public getDefaultModel\(\): string \{\s*return this\.resolveDefaultModel\(\) \|\| FALLBACK_DEFAULT_MODEL;\s*\}/,
    'getDefaultModel must use configured-provider resolution, not a hardcoded Gemini fallback',
  );

  const resolver = sliceBetween(
    credentialsSource,
    'private resolveDefaultModel(): string | null {',
    '    private ensureDefaultModelCanRun(): void {',
  );
  assert.match(
    resolver,
    /if \(current && this\.isProviderConfigured\(this\.getProviderForModel\(current\)\)\) return current;/,
    'saved defaults should only be honored when their provider is configured',
  );
  assert.match(
    resolver,
    /return this\.firstConfiguredDefaultModel\(\);/,
    'stale saved defaults should fall through to first configured provider',
  );
});

for (const [setter, expected] of [
  ['setOpenaiApiKey', 'gpt-6.1-sol'],
  ['setClaudeApiKey', 'claude-opus-5-5'],
  ['setGeminiApiKey', 'gemini-3.5-flash'],
]) {
  test(`${setter} persists the new-user default across restarts`, () => {
    const manager = new CredentialsManager();
    manager[setter]('test-only-key');
    assert.equal(manager.getDefaultModel(), expected);

    const restarted = new CredentialsManager();
    restarted.init();
    assert.equal(restarted.getDefaultModel(), expected);
  });
}

for (const [setter, selection] of [
  ['setOpenaiApiKey', 'gpt-5.6-sol'],
  ['setOpenaiApiKey', 'gpt-6-astra'],
  ['setClaudeApiKey', 'claude-sonnet-4-6'],
]) {
  test(`preserves an existing ${selection} selection when keys are updated and the app restarts`, () => {
    const manager = new CredentialsManager();
    manager[setter]('test-only-key');
    manager.setDefaultModel(selection);
    manager[setter]('test-only-replacement-key');
    assert.equal(manager.getDefaultModel(), selection);

    const restarted = new CredentialsManager();
    restarted.init();
    assert.equal(restarted.getDefaultModel(), selection);
  });
}

test('a stale default without its provider key falls back to the new configured default', () => {
  const manager = new CredentialsManager();
  manager.setDefaultModel('gemini-3.5-flash');
  manager.setOpenaiApiKey('test-only-key');
  assert.equal(manager.getDefaultModel(), 'gpt-6.1-sol');
});

for (const oldModel of ['chat-latest', 'gpt-5.5', 'gpt-5.5-thinking-low', 'gpt-5.5-2026-04-23']) {
  test(`upgrading migrates retired ${oldModel} defaults and preferences to GPT 6.1 Sol`, () => {
    const file = path.join(fixtureDir, 'credentials.enc');
    fs.writeFileSync(file, JSON.stringify({
      openaiApiKey: 'test-only-key', defaultModel: oldModel, openaiPreferredModel: oldModel,
    }));
    const manager = new CredentialsManager();
    manager.init();
    assert.equal(manager.getDefaultModel(), 'gpt-6.1-sol');
    assert.equal(manager.getPreferredModel('openai'), 'gpt-6.1-sol');
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved.defaultModel, 'gpt-6.1-sol');
    assert.equal(saved.openaiPreferredModel, 'gpt-6.1-sol');
  });
}

test('retired OpenAI preferences migrate without replacing a saved Claude default', () => {
  const file = path.join(fixtureDir, 'credentials.enc');
  fs.writeFileSync(file, JSON.stringify({
    claudeApiKey: 'test-only-key', defaultModel: 'claude-sonnet-4-6', openaiPreferredModel: 'chat-latest',
  }));
  const manager = new CredentialsManager();
  manager.init();
  assert.equal(manager.getDefaultModel(), 'claude-sonnet-4-6');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).openaiPreferredModel, 'gpt-6.1-sol');
});

test('first-run setup uses and persists the shared provider defaults', () => {
  const launcher = fs.readFileSync(path.join(root, 'src/components/Launcher.tsx'), 'utf8');
  const setup = sliceBetween(launcher, 'const getPreferredPreflightModel', 'const handleRequestMicPermission');
  assert.match(setup, /if \(status.openai\) return DEFAULT_OPENAI_MODEL;/);
  assert.match(setup, /if \(status.claude\) return DEFAULT_CLAUDE_MODEL;/);
  assert.match(setup, /!readiness.aiReady \? getPreferredPreflightModel\(nextStatus\) : null/);
  assert.match(setup, /await window\.electronAPI\.setDefaultModel\(preferredModel\)/);
  assert.doesNotMatch(setup, /electronAPI\.setModel/);
});

test('saving provider keys repairs stale defaults and broadcasts the effective runtime model', () => {
  const providers = [
    ['Gemini', 'Gemini'],
    ['Groq', 'Groq'],
    ['Openai', 'OpenAI'],
    ['Claude', 'Claude'],
    ['Deepseek', 'DeepSeek'],
  ];
  for (const [methodProvider, logProvider] of providers) {
    const methodBody = sliceBetween(
      credentialsSource,
      `public set${methodProvider}ApiKey(key: string): void {`,
      `        console.log('[CredentialsManager] ${logProvider} API Key updated');`,
    );
    assert.match(
      methodBody,
      /this\.ensureDefaultModelCanRun\(\);[\s\S]*this\.saveCredentials\(\);/,
      `set${methodProvider}ApiKey should repair stale default model before saving`,
    );
  }

  const openaiHandler = sliceBetween(
    ipcSource,
    "safeHandle('set-openai-api-key'",
    "safeHandle('set-claude-api-key'",
  );
  assert.match(openaiHandler, /const defaultModel = cm\.getDefaultModel\(\);/);
  assert.match(openaiHandler, /llmHelper\.setModel\(defaultModel, allProviders\);/);
  assert.match(openaiHandler, /appState\.sendModelChanged\(defaultModel\);/);
});

test('model selector window does not preselect stale cached models before credentials load', () => {
  assert.doesNotMatch(modelSelectorWindowSource, /cached-current-model/);
  assert.doesNotMatch(modelSelectorWindowSource, /cached-models/);
  assert.match(
    modelSelectorWindowSource,
    /const \[isLoading, setIsLoading\] = useState<boolean>\(true\);/,
    'model picker should show a live loading state instead of stale provider cache',
  );
});
