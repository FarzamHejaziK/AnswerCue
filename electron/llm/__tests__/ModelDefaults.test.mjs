import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const read = rel => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const importDist = rel => import(pathToFileURL(path.join(repoRoot, 'dist-electron/electron', rel)).href);
const require = createRequire(import.meta.url);

test('refreshing OpenAI models cannot reintroduce GPT 5.5 or its Instant alias', async () => {
  const get = async url => {
    assert.equal(url, 'https://api.openai.com/v1/models');
    return { data: { data: [
      'chat-latest', 'gpt-5.5', 'gpt-5.5-thinking-low', 'gpt-5.5-2026-04-23',
      'gpt-5.6-sol', 'gpt-6.1-sol',
    ].map(id => ({ id })) } };
  };
  // The production bundle inlines Axios; isolate source imports so this test
  // cannot accidentally use a real HTTP client.
  const ts = require('typescript');
  const compiled = ts.transpileModule(read('electron/utils/modelFetcher.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: id => {
      if (id === 'axios') return { get };
      if (id === '../llm/cloudModelCatalog') return require(path.join(repoRoot, 'dist-electron/electron/llm/cloudModelCatalog.js'));
      throw new Error(`Unmocked model discovery dependency: ${id}`);
    },
  });
  const models = await exports.fetchProviderModels('openai', 'test-only-key');
  assert.deepEqual(Array.from(models, model => model.id), ['gpt-5.6-sol', 'gpt-6.1-sol']);
});

test('standard model lists remove GPT 5.5 variants but keep Claude Opus 5.5 and Gemini', async () => {
  const src = read('src/utils/modelUtils.ts');
  const { OPENAI_CHAT_MODELS, CLAUDE_CHAT_MODELS, isRetiredOpenAiModel } = await importDist('llm/cloudModelCatalog.js');

  for (const id of ['chat-latest', 'gpt-5.5', 'gpt-5.5-thinking-low']) {
    assert.ok(!OPENAI_CHAT_MODELS.some(model => model.id === id), `${id} must not be selectable`);
    assert.equal(isRetiredOpenAiModel(id), true);
  }
  assert.ok(OPENAI_CHAT_MODELS.some(model => model.id === 'gpt-5.4'));
  assert.ok(CLAUDE_CHAT_MODELS.some(model => model.id === 'claude-opus-5-5'));
  assert.equal(isRetiredOpenAiModel('claude-opus-5-5'), false);
  assert.equal(isRetiredOpenAiModel('gpt-5.6-sol'), false);
  assert.doesNotMatch(src, /id:\s*'gpt-5\.5'/, 'Codex CLI presets must not reintroduce GPT 5.5');
  assert.match(src, /ids:\s*\['gemini-3.5-flash', 'gemini-3\.1-flash-lite-preview', 'gemini-3\.1-pro-preview'\]/);
  assert.match(src, /names:\s*\['Gemini 3\.5 Flash', 'Gemini 3\.1 Flash', 'Gemini 3\.1 Pro'\]/);
});

test('new cloud defaults lead the model lists used by Settings', async () => {
  const { DEFAULT_OPENAI_MODEL, DEFAULT_CLAUDE_MODEL, OPENAI_CHAT_MODELS, CLAUDE_CHAT_MODELS } =
    await importDist('llm/cloudModelCatalog.js');
  assert.equal(DEFAULT_OPENAI_MODEL, 'gpt-6.1-sol');
  assert.equal(DEFAULT_CLAUDE_MODEL, 'claude-opus-5-5');
  assert.equal(OPENAI_CHAT_MODELS[0].id, DEFAULT_OPENAI_MODEL);
  assert.equal(CLAUDE_CHAT_MODELS[0].id, DEFAULT_CLAUDE_MODEL);
});

test('cloud defaults stay aligned across runtime constants and connection tests', () => {
  const llmHelper = read('electron/LLMHelper.ts');
  const ipcHandlers = read('electron/ipcHandlers.ts');

  assert.match(llmHelper, /const OPENAI_MODEL = DEFAULT_OPENAI_MODEL/);
  assert.match(llmHelper, /const CLAUDE_MODEL = DEFAULT_CLAUDE_MODEL/);
  assert.match(llmHelper, /const GEMINI_FLASH_MODEL = "gemini-3.5-flash"/);
  assert.match(ipcHandlers, /model:\s*DEFAULT_OPENAI_MODEL/);
  assert.match(ipcHandlers, /model:\s*DEFAULT_CLAUDE_MODEL/);
  assert.match(ipcHandlers, /max_completion_tokens:\s*10/);
  assert.match(ipcHandlers, /models\/gemini-3.5-flash:generateContent/);
});

test('current LLM config reports chat-latest as OpenAI for the launcher readiness card', () => {
  const llmHelper = read('electron/LLMHelper.ts');
  const launcher = read('src/components/Launcher.tsx');

  assert.match(llmHelper, /type CurrentLlmProvider = [^\n]*"openai"/);
  assert.match(llmHelper, /if \(this\.isOpenAiModel\(this\.currentModelId\)\) return "openai";/);
  assert.match(launcher, /modelId === 'chat-latest' \|\| modelId\.includes\('gpt'\) \|\| modelId\.includes\('openai'\)/);
});

test('GPT 5.5 Thinking dropdown ID maps to GPT 5.5 with low reasoning', () => {
  const llmHelper = read('electron/LLMHelper.ts');

  assert.match(llmHelper, /const OPENAI_GPT_55_MODEL = "gpt-5\.5"/);
  assert.match(llmHelper, /const OPENAI_GPT_55_THINKING_LOW_MODEL = "gpt-5\.5-thinking-low"/);
  assert.match(llmHelper, /return OPENAI_GPT_55_MODEL;/);
  assert.match(llmHelper, /return \{ reasoning_effort: 'low' \};/);
  assert.match(llmHelper, /\.\.\.reasoningConfig/);
});

test('OpenAI streaming has first-token timeout, retry, fallback, and cancellation wiring', () => {
  const llmHelper = read('electron/LLMHelper.ts');
  const whatToAnswer = read('electron/llm/WhatToAnswerLLM.ts');
  const intelligenceEngine = read('electron/IntelligenceEngine.ts');

  assert.match(llmHelper, /const OPENAI_STREAM_FIRST_TOKEN_TIMEOUT_MS = 8_000/);
  assert.match(llmHelper, /const OPENAI_STREAM_MAX_ATTEMPTS_PER_MODEL = 2/);
  assert.match(llmHelper, /const OPENAI_STREAM_FALLBACK_MODEL = "gpt-5\.4"/);
  assert.match(llmHelper, /createOpenAiFirstTokenTimeoutError/);
  assert.match(llmHelper, /OPENAI_FIRST_TOKEN_TIMEOUT/);
  assert.match(llmHelper, /OPENAI_EMPTY_STREAM/);
  assert.match(llmHelper, /streamOpenAiCompletionAttempt/);
  assert.match(llmHelper, /streamOpenAiWithRetry/);
  assert.match(llmHelper, /falling back to Gemini streaming/);
  assert.match(whatToAnswer, /abortSignal\?: AbortSignal/);
  assert.match(whatToAnswer, /packetScopes,\s*abortSignal/);
  assert.match(intelligenceEngine, /streamAbortController = new AbortController\(\)/);
  assert.match(intelligenceEngine, /streamAbortController\.signal/);
});

test('Gemini 3 Flash calls opt into low thinking for live latency', () => {
  const llmHelper = read('electron/LLMHelper.ts');
  const ipcHandlers = read('electron/ipcHandlers.ts');

  assert.match(llmHelper, /thinkingConfig:\s*\{\s*thinkingLevel:\s*'low'/);
  assert.match(llmHelper, /normalized\.startsWith\('gemini-3'\)[\s\S]*!normalized\.includes\('lite'\)/);
  assert.match(llmHelper, /this\.getGeminiThinkingConfig\(model\)/);
  assert.match(llmHelper, /this\.buildGeminiGenerationConfig\(GEMINI_FLASH_MODEL/);
  assert.match(ipcHandlers, /generationConfig:\s*\{[\s\S]*thinkingConfig:\s*\{[\s\S]*thinkingLevel:\s*'low'/);
});

test('OpenAI chat-latest alias is classified as cloud, OpenAI, and vision-capable', async () => {
  const { getModelCapabilities } = await importDist('llm/modelCapabilities.js');
  const { parseModelVersion, classifyModel, classifyTextModel, ModelFamily, TextModelFamily } =
    await importDist('services/ModelVersionManager.js');

  assert.deepEqual(parseModelVersion('chat-latest'), { major: 5, minor: 5, patch: 0, raw: 'chat-latest' });
  assert.deepEqual(parseModelVersion('gpt-5.5'), { major: 5, minor: 5, patch: 0, raw: 'gpt-5.5' });
  assert.deepEqual(parseModelVersion('gpt-5.5-thinking-low'), { major: 5, minor: 5, patch: 0, raw: 'gpt-5.5-thinking-low' });
  assert.deepEqual(parseModelVersion('gemini-3.5-flash'), { major: 3, minor: 5, patch: 0, raw: 'gemini-3.5-flash' });
  assert.equal(classifyModel('chat-latest'), ModelFamily.OPENAI);
  assert.equal(classifyTextModel('chat-latest'), TextModelFamily.OPENAI);

  const caps = getModelCapabilities('chat-latest', false);
  assert.equal(caps.tier, 'cloud');
  assert.equal(caps.supportsImages, true);
});

test('ProviderRouter defaults route OpenAI, Claude, and Gemini to the expected model IDs', async () => {
  const { ProviderRouter } = await importDist('llm/ProviderRouter.js');
  const router = new ProviderRouter();

  const openai = router.selectProvider({
    actionType: 'summary',
    providerHealth: { claude: 'down', openai: 'healthy', gemini: 'down' },
  });
  assert.equal(openai.provider, 'openai');
  assert.equal(openai.model, 'gpt-6.1-sol');

  const claude = router.selectProvider({
    actionType: 'summary',
    providerHealth: { claude: 'healthy', openai: 'down', gemini: 'down' },
  });
  assert.equal(claude.provider, 'claude');
  assert.equal(claude.model, 'claude-opus-5-5');

  const gemini = router.selectProvider({
    preferLowLatency: true,
    providerHealth: { groq: 'down', gemini: 'healthy' },
  });
  assert.equal(gemini.provider, 'gemini');
  assert.equal(gemini.model, 'gemini-3.5-flash');
});
