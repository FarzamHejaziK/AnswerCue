export interface CloudChatModel {
  id: string;
  name: string;
  description: string;
  reasoningEffort?: 'low';
  firstTokenTimeoutMs?: number;
  maxOutputTokens?: number;
  cacheMinTokens?: number;
}

// Shared by the settings, model selectors, discovery, and request builder.
export const OPENAI_CHAT_MODELS: CloudChatModel[] = [
  { id: 'chat-latest', name: 'GPT 5.5 Instant', description: 'OpenAI chat-latest' },
  { id: 'gpt-6-astra', name: 'GPT 6 Astra', description: 'Highest intelligence - Low reasoning', reasoningEffort: 'low', firstTokenTimeoutMs: 45_000 },
  { id: 'gpt-6.1-sol', name: 'GPT 6.1 Sol', description: 'Balanced - Low reasoning', reasoningEffort: 'low', firstTokenTimeoutMs: 45_000 },
  { id: 'gpt-6-luna', name: 'GPT 6 Luna', description: 'Efficient - Low reasoning', reasoningEffort: 'low', firstTokenTimeoutMs: 45_000 },
  { id: 'gpt-5.6-sol', name: 'GPT 5.6 Sol', description: 'Flagship - Low reasoning', reasoningEffort: 'low', firstTokenTimeoutMs: 45_000 },
  { id: 'gpt-5.6-terra', name: 'GPT 5.6 Terra', description: 'Balanced - Low reasoning', reasoningEffort: 'low', firstTokenTimeoutMs: 45_000 },
  { id: 'gpt-5.6-luna', name: 'GPT 5.6 Luna', description: 'Efficient - Low reasoning', reasoningEffort: 'low', firstTokenTimeoutMs: 45_000 },
  { id: 'gpt-5.5', name: 'GPT 5.5', description: 'OpenAI' },
  { id: 'gpt-5.5-thinking-low', name: 'GPT 5.5 Thinking', description: 'Low reasoning', reasoningEffort: 'low' },
  { id: 'gpt-5.4', name: 'GPT 5.4', description: 'OpenAI' },
];

export const CLAUDE_CHAT_MODELS: CloudChatModel[] = [
  { id: 'claude-opus-5-5', name: 'Opus 5.5', description: 'Anthropic - Low reasoning', reasoningEffort: 'low', maxOutputTokens: 64_000, cacheMinTokens: 512 },
  { id: 'claude-opus-5', name: 'Opus 5', description: 'Anthropic - Low reasoning', reasoningEffort: 'low', maxOutputTokens: 64_000, cacheMinTokens: 512 },
  { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5', description: 'Anthropic - Fast - Low reasoning', reasoningEffort: 'low', maxOutputTokens: 64_000, cacheMinTokens: 512 },
  { id: 'claude-sonnet-5', name: 'Sonnet 5', description: 'Anthropic - Fast - Low reasoning', reasoningEffort: 'low', maxOutputTokens: 64_000, cacheMinTokens: 1024 },
  { id: 'claude-opus-4-8', name: 'Opus 4.8', description: 'Anthropic - Highest reasoning', maxOutputTokens: 32_000, cacheMinTokens: 1024 },
  { id: 'claude-opus-4-7', name: 'Opus 4.7', description: 'Anthropic - Opus', maxOutputTokens: 32_000, cacheMinTokens: 4096 },
  { id: 'claude-opus-4-6', name: 'Opus 4.6', description: 'Anthropic - Opus', maxOutputTokens: 32_000, cacheMinTokens: 4096 },
  { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6', description: 'Anthropic - Sonnet', maxOutputTokens: 64_000, cacheMinTokens: 2048 },
];

export const ALLOWED_CLAUDE_MODELS = new Set(CLAUDE_CHAT_MODELS.map(model => model.id));

export function getCloudChatModel(modelId: string): CloudChatModel | undefined {
  const id = modelId.toLowerCase();
  return OPENAI_CHAT_MODELS.find(model => model.id === id)
    || CLAUDE_CHAT_MODELS.find(model => model.id === id);
}
