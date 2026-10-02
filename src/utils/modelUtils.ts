import { OPENAI_CHAT_MODELS, CLAUDE_CHAT_MODELS, getCloudChatModel } from '../../electron/llm/cloudModelCatalog';

export const STANDARD_CLOUD_MODELS: Record<string, {
    hasKeyCheck: (creds: any) => boolean;
    ids: string[];
    names: string[];
    descs: string[];
    pmKey: 'geminiPreferredModel' | 'openaiPreferredModel' | 'claudePreferredModel' | 'groqPreferredModel' | 'deepseekPreferredModel';
}> = {
    gemini: {
        hasKeyCheck: (creds) => !!creds?.hasGeminiKey,
        ids: ['gemini-3.5-flash', 'gemini-3.1-flash-lite-preview', 'gemini-3.1-pro-preview'],
        names: ['Gemini 3.5 Flash', 'Gemini 3.1 Flash', 'Gemini 3.1 Pro'],
        descs: ['Fast • Multimodal', 'Fastest • Multimodal', 'Reasoning • High Quality'],
        pmKey: 'geminiPreferredModel'
    },
    openai: {
        hasKeyCheck: (creds) => !!creds?.hasOpenaiKey,
        ids: OPENAI_CHAT_MODELS.map(model => model.id),
        names: OPENAI_CHAT_MODELS.map(model => model.name),
        descs: OPENAI_CHAT_MODELS.map(model => model.description),
        pmKey: 'openaiPreferredModel'
    },
    claude: {
        hasKeyCheck: (creds) => !!creds?.hasClaudeKey,
        ids: CLAUDE_CHAT_MODELS.map(model => model.id),
        names: CLAUDE_CHAT_MODELS.map(model => model.name),
        descs: CLAUDE_CHAT_MODELS.map(model => model.description),
        pmKey: 'claudePreferredModel'
    },
    groq: {
        hasKeyCheck: (creds) => !!creds?.hasGroqKey,
        ids: ['llama-3.3-70b-versatile'],
        names: ['Groq Llama 3.3'],
        descs: ['Ultra Fast'],
        pmKey: 'groqPreferredModel'
    },
    deepseek: {
        hasKeyCheck: (creds) => !!creds?.hasDeepseekKey,
        ids: ['deepseek-v4-flash', 'deepseek-v4-pro'],
        names: ['DeepSeek V4 Flash', 'DeepSeek V4 Pro'],
        descs: ['Fast • Text-only', 'Reasoning • Text-only'],
        pmKey: 'deepseekPreferredModel'
    },
};

export const isAllowedStandardCloudModel = (provider: string, modelId: string): boolean => {
    const config = STANDARD_CLOUD_MODELS[provider];
    if (!config) return true;
    return config.ids.includes(modelId);
};

export const getCloudModelDisplayName = (id: string): string | undefined => getCloudChatModel(id)?.name;

export const CODEX_CLI_MODEL = {
    id: 'codex-cli',
    name: 'Codex CLI',
    desc: 'Local CLI transport',
};

export const CODEX_CLI_MODEL_PRESETS = [
    ...OPENAI_CHAT_MODELS.filter(model => /^gpt-(5\.6|6)/.test(model.id)).map(model => ({ id: model.id, name: model.name })),
    { id: 'gpt-5.5', name: 'ChatGPT 5.5' },
    { id: 'gpt-5.3-codex', name: 'Codex 5.3' },
    { id: 'gpt-5.3-codex-spark', name: 'Codex Spark 5.3' },
    { id: 'gpt-5.4', name: 'ChatGPT 5.4' },
];

export const codexCliSelectorId = (modelId: string): string => `codex-cli:${modelId}`;

export const getCodexCliModelDisplayName = (id: string): string | null => {
    if (id === CODEX_CLI_MODEL.id) return CODEX_CLI_MODEL.name;
    if (!id.startsWith('codex-cli:')) return null;

    const modelId = id.slice('codex-cli:'.length);
    const preset = CODEX_CLI_MODEL_PRESETS.find(model => model.id === modelId);
    return preset?.name || prettifyModelId(modelId);
};

export const prettifyModelId = (id: string): string => {
    if (!id) return '';
    const known = getCloudChatModel(id);
    if (known) return known.name;
    return id.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};
