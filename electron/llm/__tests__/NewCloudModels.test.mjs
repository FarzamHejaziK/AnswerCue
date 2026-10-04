import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'answercue-cloud-test-'));
const fixture = path.join(fixtureDir, 'screen.png');
fs.writeFileSync(fixture, 'test image');
const originalLoad = Module._load;
Module._load = function(id, ...args) {
  if (id === 'electron') return { app: { getPath: () => fixtureDir }, safeStorage: {} };
  return originalLoad.call(this, id, ...args);
};
const { LLMHelper } = require(path.join(root, 'dist-electron/electron/LLMHelper.js'));
const { ModelVersionManager, ModelFamily, TextModelFamily, classifyModel, classifyTextModel } =
  require(path.join(root, 'dist-electron/electron/services/ModelVersionManager.js'));
Module._load = originalLoad;
const { OPENAI_CHAT_MODELS, CLAUDE_CHAT_MODELS } = require(path.join(root, 'dist-electron/electron/llm/cloudModelCatalog.js'));
const { getModelCapabilities } = require(path.join(root, 'dist-electron/electron/llm/modelCapabilities.js'));
const { runStreamingVisionFallback, DEFAULT_VISION_FALLBACK_CONFIG } = require(path.join(root, 'dist-electron/electron/llm/visionStreamFallback.js'));
after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));

const newModels = [...OPENAI_CHAT_MODELS.filter(model => /^gpt-(5\.6|6)/.test(model.id)),
  ...CLAUDE_CHAT_MODELS.filter(model => /^claude-(opus|sonnet)-5/.test(model.id))];

function mockHelper() {
  const calls = [];
  const helper = new LLMHelper();
  helper.rateLimiters = { openai: { acquire: async () => {} }, claude: { acquire: async () => {} } };
  helper.getProviderScopePolicy = () => undefined;
  helper.getDeniedOutboundScopes = () => [];
  helper.assertOutboundScopes = () => {};
  helper.processImage = async () => ({ mimeType: 'image/png', data: 'AQ==' });
  helper.openaiClient = { chat: { completions: { create: async request => {
    calls.push({ provider: 'openai', request });
    if (!request.stream) return { choices: [{ message: { content: 'answer' } }] };
    return (async function* () {
      yield { choices: [{ delta: { content: 'first ' } }] };
      yield { choices: [{ delta: { content: 'second' } }] };
    })();
  } } } };
  helper.claudeClient = { messages: { stream: request => {
    calls.push({ provider: 'claude', request });
    return {
      abort() {},
      finalMessage: async () => ({ content: [{ type: 'text', text: 'answer' }] }),
      async *[Symbol.asyncIterator]() {
        yield { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'internal' } };
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'first ' } };
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'second' } };
      },
    };
  } } };
  return { helper, calls };
}

for (const [provider, expected] of [['openai', 'gpt-6.1-sol'], ['claude', 'claude-opus-5-5']]) {
  test(`${provider} requests without a model override use the new provider default`, async () => {
    const { helper, calls } = mockHelper();
    const method = provider === 'openai' ? 'generateWithOpenai' : 'generateWithClaude';
    assert.equal(await helper[method]('Question', 'System contract'), 'answer');
    assert.equal(calls[0].request.model, expected);
    assert.equal(provider === 'openai' ? calls[0].request.reasoning_effort : calls[0].request.output_config.effort, 'low');
  });
}

test('new installs use matching text and vision model baselines', () => {
  const versions = new ModelVersionManager();
  assert.equal(versions.getTieredModels(ModelFamily.OPENAI).tier1, 'gpt-6.1-sol');
  assert.equal(versions.getTieredModels(ModelFamily.CLAUDE).tier1, 'claude-opus-5-5');
  assert.equal(versions.getTextTieredModels(TextModelFamily.OPENAI).tier1, 'gpt-6.1-sol');
  assert.equal(versions.getTextTieredModels(TextModelFamily.CLAUDE).tier1, 'claude-opus-5-5');
});

for (const model of newModels) {
  const provider = model.id.startsWith('claude-') ? 'claude' : 'openai';
  test(`${model.id} supports cloud text and screenshots`, () => {
    assert.equal(getModelCapabilities(model.id, false).supportsImages, true);
    assert.equal(getModelCapabilities(model.id, false).tier, 'cloud');
    assert.equal(classifyModel(model.id), provider);
    assert.equal(classifyTextModel(model.id), `text_${provider}`);
  });

  for (const imagePaths of [undefined, [fixture]]) {
    test(`${model.id} ${imagePaths ? 'screenshot' : 'text'} stream honors selection and request schema`, async () => {
      const { helper, calls } = mockHelper();
      helper.setModel(model.id);
      // A faster measured OpenAI response must not override a Claude selection.
      helper.visionHealth.set('openai', { openUntil: 0, consecutiveFails: 0, ttftEma: 1 });
      helper.visionHealth.set('claude', { openUntil: 0, consecutiveFails: 0, ttftEma: 100 });
      const chunks = [];
      for await (const chunk of helper.streamChat('Question', imagePaths, 'Preparation context', 'System contract', true, true)) chunks.push(chunk);
      assert.deepEqual(chunks, ['first ', 'second']);
      assert.equal(calls.length, 1, 'no fallback model should be called after a successful selected model');
      const { request } = calls[0];
      assert.equal(calls[0].provider, provider);
      assert.equal(request.model, model.id);
      assert.equal(request.temperature, undefined);
      assert.ok(JSON.stringify(request.messages).includes('Preparation context'));
      if (provider === 'openai') {
        assert.equal(request.reasoning_effort, 'low');
        assert.equal(request.max_completion_tokens, 65536);
        assert.equal(helper.getOpenAiFirstTokenTimeout(model.id), 45000);
      } else {
        assert.deepEqual(request.thinking, { type: 'adaptive' });
        assert.deepEqual(request.output_config, { effort: 'low' });
        assert.equal(request.max_tokens, 64000);
      }
      if (imagePaths) assert.ok(JSON.stringify(request.messages).includes(provider === 'openai' ? 'image_url' : 'base64'));
    });
  }

  test(`${model.id} non-streaming request uses the same model and reasoning settings`, async () => {
    const { helper, calls } = mockHelper();
    helper.setModel(model.id);
    const method = provider === 'openai' ? 'generateWithOpenai' : 'generateWithClaude';
    const output = await helper[method]('Question', 'System contract', undefined, model.id);
    assert.equal(output, 'answer');
    assert.equal(calls[0].request.model, model.id);
    assert.equal(provider === 'openai' ? calls[0].request.reasoning_effort : calls[0].request.output_config.effort, 'low');
  });
}

test('legacy GPT 5.5 Thinking still resolves to an API-valid model ID', () => {
  const { helper } = mockHelper();
  assert.equal(helper.resolveOpenAiModel('gpt-5.5-thinking-low'), 'gpt-5.5');
  assert.deepEqual(helper.getOpenAiReasoningConfig('gpt-5.5-thinking-low'), { reasoning_effort: 'low' });
  assert.equal(helper.getOpenAiFirstTokenTimeout('chat-latest'), 8000);
});

test('vision chain respects a reasoning provider first-token deadline', async () => {
  const provider = { id: 'reasoning', name: 'Reasoning', isLocal: false, priority: 0, ttftTimeoutMs: 100,
    async *open() { await new Promise(resolve => setTimeout(resolve, 25)); yield 'answer'; } };
  const chunks = [];
  const config = { ...DEFAULT_VISION_FALLBACK_CONFIG, ttftTimeoutMs: 5, maxAttempts: 1 };
  for await (const chunk of runStreamingVisionFallback([provider], config, new Map())) chunks.push(chunk);
  assert.deepEqual(chunks, ['answer']);
});
