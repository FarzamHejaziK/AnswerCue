#!/usr/bin/env node
// Run with Electron to read the app's encrypted credentials without exporting keys.
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

app.setName('answercue');
const print = console.log.bind(console);
console.log = console.warn = console.error = () => {};

app.whenReady().then(async () => {
  const root = path.resolve(__dirname, '..');
  const { LLMHelper } = require(path.join(root, 'dist-electron/electron/LLMHelper.js'));
  const { OPENAI_CHAT_MODELS, CLAUDE_CHAT_MODELS } = require(path.join(root, 'dist-electron/electron/llm/cloudModelCatalog.js'));
  const credentialFile = path.join(app.getPath('appData'), 'answercue', 'credentials.enc');
  const credentials = JSON.parse(safeStorage.decryptString(fs.readFileSync(credentialFile)));
  const helper = new LLMHelper(undefined, false, undefined, undefined, undefined, credentials.openaiApiKey, credentials.claudeApiKey);
  // The probe does not write settings, interview history, or model-selection state.
  helper.getProviderScopePolicy = () => undefined;
  helper.getDeniedOutboundScopes = () => [];
  helper.assertOutboundScopes = () => {};
  const report = { testedAt: new Date().toISOString(), results: [] };
  const selectedProvider = process.argv.find(arg => arg.startsWith('--provider='))?.split('=')[1];
  const requestedId = process.argv.find(arg => arg.startsWith('--model='))?.split('=')[1];
  const reportPath = process.argv.find(arg => arg.startsWith('--report='))?.slice('--report='.length) || path.join(os.tmpdir(), 'answercue-model-checks.json');
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'answercue-model-probe-'));
  const screenshot = path.join(fixtureDir, 'code-screen.png');
  await sharp(Buffer.from('<svg width="1000" height="320"><rect width="100%" height="100%" fill="white"/><g fill="black" font-family="monospace" font-size="32"><text x="40" y="70">VISION_MARKER_742</text><text x="40" y="140">function add(a, b) {</text><text x="80" y="190">return a - b;</text><text x="40" y="240">}</text></g></svg>')).png().toFile(screenshot);

  let observed = [];
  if (helper.openaiClient) {
    const create = helper.openaiClient.chat.completions.create.bind(helper.openaiClient.chat.completions);
    helper.openaiClient.chat.completions.create = async (request, options) => {
      observed.push({ requested: request.model });
      const stream = await create(request, options);
      return (async function* () {
        for await (const chunk of stream) {
          if (chunk.model) observed[observed.length - 1].returned = chunk.model;
          yield chunk;
        }
      })();
    };
  }
  if (helper.claudeClient) {
    const stream = helper.claudeClient.messages.stream.bind(helper.claudeClient.messages);
    helper.claudeClient.messages.stream = (request, options) => {
      const record = { requested: request.model };
      observed.push(record);
      const source = stream(request, options);
      return {
        abort: () => source.abort(),
        async *[Symbol.asyncIterator]() {
          for await (const event of source) {
            if (event.type === 'message_start') record.returned = event.message.model;
            yield event;
          }
        },
      };
    };
  }

  const groups = [
    ['openai', OPENAI_CHAT_MODELS.filter(model => /^gpt-(5\.6|6)/.test(model.id)), credentials.openaiApiKey],
    ['claude', CLAUDE_CHAT_MODELS.filter(model => /^claude-(opus|sonnet)-5/.test(model.id)), credentials.claudeApiKey],
  ];
  const redact = value => {
    let result = String(value);
    for (const secret of [credentials.openaiApiKey, credentials.claudeApiKey].filter(Boolean)) result = result.split(secret).join('[REDACTED]');
    return result.replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]').slice(0, 500);
  };
  try {
    for (const [provider, models, key] of groups) {
      if (selectedProvider && selectedProvider !== provider) continue;
      for (const model of models) {
        if (requestedId && requestedId !== model.id) continue;
        if (!key) {
          const result = { provider, model: model.id, status: 'missing-credential' };
          report.results.push(result);
          print(JSON.stringify(result));
          continue;
        }
        helper.setModel(model.id);
        for (const kind of ['text', 'screenshot']) {
          helper.visionHealth.clear();
          observed = [];
          const started = Date.now();
          let firstTokenMs = null;
          let output = '';
          let chunks = 0;
          const controller = new AbortController();
          const deadline = setTimeout(() => controller.abort(), 90_000);
          const result = { provider, model: model.id, kind };
          try {
            const prompt = kind === 'text'
              ? 'State my role and company from the context in one sentence, then provide a fenced python function add(a, b) that returns their sum.'
              : 'Read the marker in the screenshot. The function should add two numbers but has a bug. Return the marker and corrected function in a fenced javascript block.';
            for await (const chunk of helper.streamChat(prompt, kind === 'screenshot' ? [screenshot] : undefined,
              kind === 'text' ? 'My role is Staff Data Engineer at ORBIT_TEST_742.' : undefined,
              'Answer the request directly and briefly. Use fenced code blocks for code.', true, true, [], controller.signal)) {
              if (firstTokenMs === null) firstTokenMs = Date.now() - started;
              chunks++;
              output += chunk;
            }
            const exactModel = observed.length > 0 && observed.every(call => call.requested === model.id);
            const valid = kind === 'text'
              ? /Staff Data Engineer/i.test(output) && output.includes('ORBIT_TEST_742') && /```python/.test(output) && /return\s+a\s*\+\s*b/.test(output)
              : output.includes('VISION_MARKER_742') && /```(?:javascript|js)\b/.test(output) && /return\s+a\s*\+\s*b/.test(output);
            Object.assign(result, { status: valid && exactModel && !controller.signal.aborted ? 'passed' : 'failed', exactModel, firstTokenMs, durationMs: Date.now() - started, chunks, calls: observed, output: redact(output) });
          } catch (error) {
            Object.assign(result, { status: 'failed', statusCode: error.status, error: redact(error.message), calls: observed, durationMs: Date.now() - started });
          } finally {
            clearTimeout(deadline);
          }
          report.results.push(result);
          fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
          print(JSON.stringify(result));
        }
      }
    }
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    print(JSON.stringify({ report: reportPath, passed: report.results.filter(result => result.status === 'passed').length, failed: report.results.filter(result => result.status === 'failed').length }));
    app.exit(report.results.every(result => result.status === 'passed') ? 0 : 1);
  }
}).catch(() => {
  print(JSON.stringify({ error: 'Unable to run the probe. Check the Electron build and saved app credentials.' }));
  app.exit(1);
});
