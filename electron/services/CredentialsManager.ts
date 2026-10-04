/**
 * CredentialsManager - Secure storage for API keys and service account paths
 * Uses Electron's safeStorage API for encryption at rest
 */

import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import { DEFAULT_OPENAI_MODEL, DEFAULT_CLAUDE_MODEL, isRetiredOpenAiModel } from '../llm/cloudModelCatalog';

const CREDENTIALS_PATH = path.join(app.getPath('userData'), 'credentials.enc');
const FALLBACK_DEFAULT_MODEL = 'gemini-3.5-flash';
const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
    natively: 'natively',
    openai: DEFAULT_OPENAI_MODEL,
    gemini: FALLBACK_DEFAULT_MODEL,
    claude: DEFAULT_CLAUDE_MODEL,
    groq: 'llama-3.3-70b-versatile',
    deepseek: 'deepseek-v4-flash',
};
const CONFIGURED_PROVIDER_ORDER = ['natively', 'openai', 'gemini', 'claude', 'groq', 'deepseek'];

export interface CustomProvider {
    id: string;
    name: string;
    curlCommand: string;
    /**
     * Whether this provider can accept screenshots. When undefined, vision
     * support is auto-detected from the cURL template (an `{{IMAGE_BASE64}}`
     * placeholder, or an OpenAI-compatible `messages` body). Set explicitly to
     * override the guess. See customProviderSupportsVision().
     */
    multimodal?: boolean;
    /** True if this provider's endpoint is loopback/local (skips cloud-scope gating). */
    localOnly?: boolean;
}

export interface CurlProvider {
    id: string;
    name: string;
    curlCommand: string;
    responsePath: string; // e.g. "choices[0].message.content"
}

export interface StoredCredentials {
    geminiApiKey?: string;
    groqApiKey?: string;
    openaiApiKey?: string;
    claudeApiKey?: string;
    deepseekApiKey?: string;
    googleServiceAccountPath?: string;
    customProviders?: CustomProvider[];
    curlProviders?: CurlProvider[];
    defaultModel?: string;
    nativelyApiKey?: string;
    // STT Provider settings
    sttProvider?: 'none' | 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'soniox' | 'natively' | 'local-whisper';
    groqSttApiKey?: string;
    groqSttModel?: string;
    openAiSttApiKey?: string;
    /** Custom OpenAI-compatible STT base URL (e.g. self-hosted Speaches).
     *  Empty / unset → use https://api.openai.com. */
    openAiSttBaseUrl?: string;
    deepgramApiKey?: string;
    elevenLabsApiKey?: string;
    azureApiKey?: string;
    azureRegion?: string;
    ibmWatsonApiKey?: string;
    ibmWatsonRegion?: string;
    sonioxApiKey?: string;
    sttLanguage?: string;
    aiResponseLanguage?: string;
    // Tavily Search
    tavilyApiKey?: string;
    // Dynamic Model Discovery – preferred models per provider
    geminiPreferredModel?: string;
    groqPreferredModel?: string;
    openaiPreferredModel?: string;
    claudePreferredModel?: string;
    deepseekPreferredModel?: string;
    // Free trial state
    trialToken?: string;   // server-issued signed token (natively_trial_…)
    trialExpiresAt?: string;   // ISO timestamp — local copy for startup check
    trialStartedAt?: string;   // ISO timestamp
    trialClaimed?: boolean;  // set true on first claim, never cleared — hides start card permanently
}

export class CredentialsManager {
    private static instance: CredentialsManager;
    private credentials: StoredCredentials = {};

    private constructor() {
        // Load on construction after app ready
    }

    public static getInstance(): CredentialsManager {
        if (!CredentialsManager.instance) {
            CredentialsManager.instance = new CredentialsManager();
        }
        return CredentialsManager.instance;
    }

    /**
     * Initialize - load credentials from disk
     * Must be called after app.whenReady()
     */
    public init(): void {
        this.loadCredentials();
        const beforeDefault = this.credentials.defaultModel;
        const beforePreferred = this.credentials.openaiPreferredModel;
        if (isRetiredOpenAiModel(beforePreferred)) {
            this.credentials.openaiPreferredModel = DEFAULT_OPENAI_MODEL;
        }
        this.ensureDefaultModelCanRun();
        if (this.credentials.defaultModel !== beforeDefault || this.credentials.openaiPreferredModel !== beforePreferred) {
            this.saveCredentials();
        }
        console.log('[CredentialsManager] Initialized');
    }

    // =========================================================================
    // Getters
    // =========================================================================

    public getGeminiApiKey(): string | undefined {
        return this.credentials.geminiApiKey;
    }

    public getGroqApiKey(): string | undefined {
        return this.credentials.groqApiKey;
    }

    public getOpenaiApiKey(): string | undefined {
        return this.credentials.openaiApiKey;
    }

    public getClaudeApiKey(): string | undefined {
        return this.credentials.claudeApiKey;
    }

    public getDeepseekApiKey(): string | undefined {
        return this.credentials.deepseekApiKey;
    }

    public getGoogleServiceAccountPath(): string | undefined {
        return this.credentials.googleServiceAccountPath;
    }

    public getCustomProviders(): CustomProvider[] {
        return this.credentials.customProviders || [];
    }

    public getSttProvider(): 'none' | 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'soniox' | 'natively' | 'local-whisper' {
        const provider = this.credentials.sttProvider || 'none';
        if (provider !== 'local-whisper') {
            this.credentials.sttProvider = 'local-whisper';
            this.saveCredentials();
            console.log(`[CredentialsManager] Forced STT provider ${provider}→local-whisper (Moonshine Base)`);
        }
        return 'local-whisper';
    }

    public getDeepgramApiKey(): string | undefined {
        return this.credentials.deepgramApiKey;
    }

    public getGroqSttApiKey(): string | undefined {
        return this.credentials.groqSttApiKey;
    }

    public getGroqSttModel(): string {
        return this.credentials.groqSttModel || 'whisper-large-v3-turbo';
    }

    public getOpenAiSttApiKey(): string | undefined {
        return this.credentials.openAiSttApiKey;
    }

    public getOpenAiSttBaseUrl(): string | undefined {
        return this.credentials.openAiSttBaseUrl;
    }

    public getElevenLabsApiKey(): string | undefined {
        return this.credentials.elevenLabsApiKey;
    }

    public getAzureApiKey(): string | undefined {
        return this.credentials.azureApiKey;
    }

    public getAzureRegion(): string {
        return this.credentials.azureRegion || 'eastus';
    }

    public getIbmWatsonApiKey(): string | undefined {
        return this.credentials.ibmWatsonApiKey;
    }

    public getIbmWatsonRegion(): string {
        return this.credentials.ibmWatsonRegion || 'us-south';
    }

    public getSonioxApiKey(): string | undefined {
        return this.credentials.sonioxApiKey;
    }

    public getTavilyApiKey(): string | undefined {
        return this.credentials.tavilyApiKey;
    }

    public getSttLanguage(): string {
        return this.credentials.sttLanguage || 'english-us';
    }

    public getAiResponseLanguage(): string {
        return this.credentials.aiResponseLanguage || 'auto';
    }
    public getDefaultModel(): string {
        return this.resolveDefaultModel() || FALLBACK_DEFAULT_MODEL;
    }

    public getAnswerCueApiKey(): string | undefined {
        return this.credentials.nativelyApiKey;
    }

    public getAllCredentials(): StoredCredentials {
        return { ...this.credentials };
    }

    private hasKey(value?: string): boolean {
        return !!(value && value.trim().length > 0);
    }

    private getProviderForModel(modelId?: string): string | null {
        if (!modelId) return null;
        if (modelId === 'natively') return 'natively';
        if (modelId === 'chat-latest' || modelId.startsWith('gpt-')) return 'openai';
        if (modelId.startsWith('gemini-') || modelId.startsWith('models/')) return 'gemini';
        if (modelId.startsWith('claude-')) return 'claude';
        if (
            modelId.startsWith('llama-') ||
            modelId.startsWith('mixtral-') ||
            modelId.startsWith('gemma-') ||
            modelId.startsWith('meta-llama/') ||
            modelId.startsWith('qwen/')
        ) {
            return 'groq';
        }
        if (modelId.startsWith('deepseek-')) return 'deepseek';
        if (modelId.startsWith('ollama-') || modelId === 'codex-cli' || modelId.startsWith('codex-cli:')) {
            return 'local';
        }
        if ([...(this.credentials.curlProviders || []), ...(this.credentials.customProviders || [])].some(provider => provider.id === modelId)) {
            return 'custom';
        }
        return null;
    }

    private isProviderConfigured(provider: string | null): boolean {
        switch (provider) {
            case 'natively':
                return this.hasKey(this.credentials.nativelyApiKey);
            case 'openai':
                return this.hasKey(this.credentials.openaiApiKey);
            case 'gemini':
                return this.hasKey(this.credentials.geminiApiKey);
            case 'claude':
                return this.hasKey(this.credentials.claudeApiKey);
            case 'groq':
                return this.hasKey(this.credentials.groqApiKey);
            case 'deepseek':
                return this.hasKey(this.credentials.deepseekApiKey);
            case 'custom':
            case 'local':
                return true;
            default:
                return false;
        }
    }

    private firstConfiguredDefaultModel(): string | null {
        for (const provider of CONFIGURED_PROVIDER_ORDER) {
            if (this.isProviderConfigured(provider)) return DEFAULT_MODEL_BY_PROVIDER[provider];
        }
        const customProvider = [...(this.credentials.curlProviders || []), ...(this.credentials.customProviders || [])][0];
        return customProvider?.id || null;
    }

    private resolveDefaultModel(): string | null {
        const current = this.credentials.defaultModel;
        if (isRetiredOpenAiModel(current) && this.isProviderConfigured('openai')) return DEFAULT_OPENAI_MODEL;
        if (current && this.isProviderConfigured(this.getProviderForModel(current))) return current;
        return this.firstConfiguredDefaultModel();
    }

    private ensureDefaultModelCanRun(): void {
        const resolved = this.resolveDefaultModel();
        if (resolved && resolved !== this.credentials.defaultModel) {
            this.credentials.defaultModel = resolved;
            console.log(`[CredentialsManager] Auto-set default model to configured provider: ${resolved}`);
        }
    }

    // =========================================================================
    // Vision provider availability — used by the vision-first screen pipeline
    // =========================================================================

    /**
     * True if at least one configured provider is vision-capable.
     * Used by ScreenUnderstandingService to gate vision_only / decide fallback.
     */
    public anyVisionProviderConfigured(): boolean {
        if (this.credentials.nativelyApiKey) return true;       // AnswerCue API supports vision
        if (this.credentials.openaiApiKey) return true;          // chat-latest / GPT vision
        if (this.credentials.claudeApiKey) return true;          // Claude vision
        if (this.credentials.geminiApiKey) return true;          // Gemini vision
        if (this.credentials.groqApiKey) return true;            // Groq llama-4-scout vision
        // Custom providers: only count if they have screenshots scope AND multimodal flag
        const custom = this.credentials.customProviders || [];
        if (custom.some(p => (p as any)?.multimodal === true)) return true;
        return this.anyLocalVisionProviderConfigured();
    }

    /**
     * True if at least one LOCAL vision provider is configured (Ollama vision model,
     * Codex CLI with vision support, or a local-only custom provider).
     * Used by private_vision mode to enforce no cloud-vision calls.
     */
    public anyLocalVisionProviderConfigured(): boolean {
        // Ollama: caller verifies the configured model is vision-capable via modelCapabilities.
        // Here we only assert the runtime is configured — model gating happens in the chain.
        const ollamaBaseUrl = (this.credentials as any).ollamaBaseUrl as string | undefined;
        if (ollamaBaseUrl && ollamaBaseUrl.trim().length > 0) return true;
        // Codex CLI is local in normal install — capability is verified by ProviderRouter.
        const codexCliPath = (this.credentials as any).codexCliPath as string | undefined;
        if (codexCliPath && codexCliPath.trim().length > 0) return true;
        return false;
    }

    // =========================================================================
    // Setters (auto-save)
    // =========================================================================

    public setGeminiApiKey(key: string): void {
        this.credentials.geminiApiKey = key;
        this.ensureDefaultModelCanRun();
        this.saveCredentials();
        console.log('[CredentialsManager] Gemini API Key updated');
    }

    public setGroqApiKey(key: string): void {
        this.credentials.groqApiKey = key;
        this.ensureDefaultModelCanRun();
        this.saveCredentials();
        console.log('[CredentialsManager] Groq API Key updated');
    }

    public setOpenaiApiKey(key: string): void {
        this.credentials.openaiApiKey = key;
        this.ensureDefaultModelCanRun();
        this.saveCredentials();
        console.log('[CredentialsManager] OpenAI API Key updated');
    }

    public setClaudeApiKey(key: string): void {
        this.credentials.claudeApiKey = key;
        this.ensureDefaultModelCanRun();
        this.saveCredentials();
        console.log('[CredentialsManager] Claude API Key updated');
    }

    public setDeepseekApiKey(key: string): void {
        const trimmed = key.trim();
        this.credentials.deepseekApiKey = trimmed || undefined;
        this.ensureDefaultModelCanRun();
        this.saveCredentials();
        console.log('[CredentialsManager] DeepSeek API Key updated');
    }

    public setGoogleServiceAccountPath(filePath: string): void {
        this.credentials.googleServiceAccountPath = filePath;
        this.saveCredentials();
        console.log('[CredentialsManager] Google Service Account path updated');
    }

    public setSttProvider(_provider: 'none' | 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'soniox' | 'natively' | 'local-whisper'): void {
        this.credentials.sttProvider = 'local-whisper';
        this.saveCredentials();
        console.log('[CredentialsManager] STT Provider set to: local-whisper (Moonshine Base)');
    }

    public setDeepgramApiKey(key: string): void {
        this.credentials.deepgramApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Deepgram API Key updated');
    }

    public setGroqSttApiKey(key: string): void {
        this.credentials.groqSttApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Groq STT API Key updated');
    }

    public setOpenAiSttApiKey(key: string): void {
        this.credentials.openAiSttApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] OpenAI STT API Key updated');
    }

    public setOpenAiSttBaseUrl(url: string): void {
        // Store undefined (not empty string) when clearing, so callers can fall back
        // to the default api.openai.com endpoint with a simple truthiness check.
        const trimmed = url.trim();
        this.credentials.openAiSttBaseUrl = trimmed || undefined;
        this.saveCredentials();
        console.log(`[CredentialsManager] OpenAI STT Base URL set to: ${trimmed || '(default)'}`);
    }

    public setGroqSttModel(model: string): void {
        this.credentials.groqSttModel = model;
        this.saveCredentials();
        console.log(`[CredentialsManager] Groq STT Model set to: ${model}`);
    }

    public setElevenLabsApiKey(key: string): void {
        this.credentials.elevenLabsApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] ElevenLabs API Key updated');
    }

    public setAzureApiKey(key: string): void {
        this.credentials.azureApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Azure API Key updated');
    }

    public setAzureRegion(region: string): void {
        this.credentials.azureRegion = region;
        this.saveCredentials();
        console.log(`[CredentialsManager] Azure Region set to: ${region}`);
    }

    public setIbmWatsonApiKey(key: string): void {
        this.credentials.ibmWatsonApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] IBM Watson API Key updated');
    }

    public setIbmWatsonRegion(region: string): void {
        this.credentials.ibmWatsonRegion = region;
        this.saveCredentials();
        console.log(`[CredentialsManager] IBM Watson Region set to: ${region}`);
    }

    public setSonioxApiKey(key: string): void {
        this.credentials.sonioxApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Soniox API Key updated');
    }

    public setTavilyApiKey(key: string): void {
        // Store undefined (not empty string) when removing, so hasKey() checks stay consistent
        this.credentials.tavilyApiKey = key.trim() || undefined;
        this.saveCredentials();
        console.log('[CredentialsManager] Tavily API Key updated');
    }

    public setSttLanguage(language: string): void {
        this.credentials.sttLanguage = language;
        this.saveCredentials();
        console.log(`[CredentialsManager] STT Language set to: ${language}`);
    }

    public setAiResponseLanguage(language: string): void {
        this.credentials.aiResponseLanguage = language;
        this.saveCredentials();
        console.log(`[CredentialsManager] AI Response Language set to: ${language}`);
    }
    public setDefaultModel(model: string): void {
        this.credentials.defaultModel = model;
        this.saveCredentials();
        console.log(`[CredentialsManager] Default Model set to: ${model}`);
    }

    public setAnswerCueApiKey(key: string): void {
        const trimmed = key.trim();
        this.credentials.nativelyApiKey = trimmed || undefined;

        if (trimmed) {
            // Auto-promote natively to default model unless user already chose a non-Gemini/Groq model
            const current = this.credentials.defaultModel || '';
            const isAutoDefault = !current
                || current.startsWith('gemini-')
                || current.startsWith('llama-')
                || current.startsWith('mixtral-')
                || current.startsWith('gemma-')
                || current === 'gemini'
                || current === 'llama';
            if (isAutoDefault) {
                this.credentials.defaultModel = 'natively';
                console.log('[CredentialsManager] Auto-set default model to natively');
            }

            // STT is local-only: keep Moonshine Base selected regardless of API keys.
            if (this.credentials.sttProvider !== 'local-whisper') {
                this.credentials.sttProvider = 'local-whisper';
                console.log('[CredentialsManager] Auto-set STT provider to local-whisper');
            }
        } else {
            // Key cleared — revert natively-auto-set defaults back to the next configured provider.
            if (this.credentials.defaultModel === 'natively') {
                const nextDefault = this.firstConfiguredDefaultModel() || FALLBACK_DEFAULT_MODEL;
                this.credentials.defaultModel = nextDefault;
                console.log(`[CredentialsManager] AnswerCue key cleared — reset default model to ${nextDefault}`);
            }
            if (this.credentials.sttProvider !== 'local-whisper') {
                this.credentials.sttProvider = 'local-whisper';
                console.log('[CredentialsManager] AnswerCue key cleared — kept local-whisper STT provider');
            }
        }

        this.saveCredentials();
        console.log('[CredentialsManager] AnswerCue API Key updated');
    }

    public getPreferredModel(provider: 'gemini' | 'groq' | 'openai' | 'claude' | 'deepseek'): string | undefined {
        const key = `${provider}PreferredModel` as keyof StoredCredentials;
        return this.credentials[key] as string | undefined;
    }

    public setPreferredModel(provider: 'gemini' | 'groq' | 'openai' | 'claude' | 'deepseek', modelId: string): void {
        const key = `${provider}PreferredModel` as keyof StoredCredentials;
        (this.credentials as any)[key] = modelId;
        this.saveCredentials();
        console.log(`[CredentialsManager] ${provider} preferred model set to: ${modelId}`);
    }

    public saveCustomProvider(provider: CustomProvider): void {
        if (!this.credentials.customProviders) {
            this.credentials.customProviders = [];
        }
        // Check if exists, update if so
        const index = this.credentials.customProviders.findIndex(p => p.id === provider.id);
        if (index !== -1) {
            this.credentials.customProviders[index] = provider;
        } else {
            this.credentials.customProviders.push(provider);
        }
        this.saveCredentials();
        console.log(`[CredentialsManager] Custom Provider '${provider.name}' saved`);
    }

    public deleteCustomProvider(id: string): void {
        if (!this.credentials.customProviders) return;
        this.credentials.customProviders = this.credentials.customProviders.filter(p => p.id !== id);
        this.saveCredentials();
        console.log(`[CredentialsManager] Custom Provider '${id}' deleted`);
    }

    public getCurlProviders(): CurlProvider[] {
        return this.credentials.curlProviders || [];
    }

    public saveCurlProvider(provider: CurlProvider): void {
        if (!this.credentials.curlProviders) {
            this.credentials.curlProviders = [];
        }
        const index = this.credentials.curlProviders.findIndex(p => p.id === provider.id);
        if (index !== -1) {
            this.credentials.curlProviders[index] = provider;
        } else {
            this.credentials.curlProviders.push(provider);
        }
        this.saveCredentials();
        console.log(`[CredentialsManager] Curl Provider '${provider.name}' saved`);
    }

    public deleteCurlProvider(id: string): void {
        if (!this.credentials.curlProviders) return;
        this.credentials.curlProviders = this.credentials.curlProviders.filter(p => p.id !== id);
        this.saveCredentials();
        console.log(`[CredentialsManager] Curl Provider '${id}' deleted`);
    }

    // ── Free Trial ─────────────────────────────────────────────
    public getTrialToken(): string | undefined {
        return this.credentials.trialToken;
    }

    public getTrialExpiresAt(): string | undefined {
        return this.credentials.trialExpiresAt;
    }

    public getTrialStartedAt(): string | undefined {
        return this.credentials.trialStartedAt;
    }

    public getTrialClaimed(): boolean {
        return this.credentials.trialClaimed === true;
    }

    public setTrialToken(token: string, expiresAt: string, startedAt: string): void {
        this.credentials.trialToken = token;
        this.credentials.trialExpiresAt = expiresAt;
        this.credentials.trialStartedAt = startedAt;
        this.credentials.trialClaimed = true;
        this.saveCredentials();
        console.log('[CredentialsManager] Trial token stored, expires:', expiresAt);
    }

    public clearTrialToken(): void {
        delete this.credentials.trialToken;
        delete this.credentials.trialExpiresAt;
        delete this.credentials.trialStartedAt;
        // trialClaimed intentionally NOT cleared — keeps start card hidden after token wipe
        this.saveCredentials();
        console.log('[CredentialsManager] Trial token cleared');
    }

    public clearAll(): void {
        this.scrubMemory();
        if (fs.existsSync(CREDENTIALS_PATH)) {
            fs.unlinkSync(CREDENTIALS_PATH);
        }
        const plaintextPath = CREDENTIALS_PATH + '.json';
        if (fs.existsSync(plaintextPath)) {
            fs.unlinkSync(plaintextPath);
        }
        console.log('[CredentialsManager] All credentials cleared');
    }

    /**
     * Scrub all API keys from memory to minimize exposure window.
     * Called on app quit and credential clear.
     */
    public scrubMemory(): void {
        // Overwrite each string field with empty before discarding
        for (const key of Object.keys(this.credentials) as (keyof StoredCredentials)[]) {
            const val = this.credentials[key];
            if (typeof val === 'string') {
                (this.credentials as any)[key] = '';
            }
        }
        this.credentials = {};
        console.log('[CredentialsManager] Memory scrubbed');
    }

    // =========================================================================
    // Storage (Encrypted)
    // =========================================================================

    private saveCredentials(): void {
        try {
            if (!safeStorage.isEncryptionAvailable()) {
                console.warn('[CredentialsManager] Encryption not available; credentials kept in memory only');
                return;
            }

            const data = JSON.stringify(this.credentials);
            const encrypted = safeStorage.encryptString(data);
            const tmpEnc = CREDENTIALS_PATH + '.tmp';
            fs.writeFileSync(tmpEnc, encrypted);
            fs.renameSync(tmpEnc, CREDENTIALS_PATH);
        } catch (error) {
            console.error('[CredentialsManager] Failed to save credentials:', error);
        }
    }

    private loadCredentials(): void {
        try {
            // Try encrypted file first
            if (fs.existsSync(CREDENTIALS_PATH)) {
                if (!safeStorage.isEncryptionAvailable()) {
                    console.warn('[CredentialsManager] Encryption not available for load');
                    return;
                }

                const encrypted = fs.readFileSync(CREDENTIALS_PATH);
                const decrypted = safeStorage.decryptString(encrypted);
                try {
                    const parsed = JSON.parse(decrypted);
                    if (typeof parsed === 'object' && parsed !== null) {
                        this.credentials = parsed;
                        console.log('[CredentialsManager] Loaded encrypted credentials');
                    } else {
                        throw new Error('Decrypted credentials is not a valid object');
                    }
                } catch (parseError) {
                    console.error('[CredentialsManager] Failed to parse decrypted credentials — file may be corrupted. Starting fresh:', parseError);
                    this.credentials = {};
                }

                // Clean up any leftover plaintext fallback file to eliminate the data leak
                const plaintextPath = CREDENTIALS_PATH + '.json';
                if (fs.existsSync(plaintextPath)) {
                    try {
                        fs.unlinkSync(plaintextPath);
                        console.log('[CredentialsManager] Removed stale plaintext credential file');
                    } catch (cleanupErr) {
                        console.warn('[CredentialsManager] Could not remove stale plaintext file:', cleanupErr);
                    }
                }
                return;
            }

            const plaintextPath = CREDENTIALS_PATH + '.json';
            if (fs.existsSync(plaintextPath)) {
                try {
                    fs.unlinkSync(plaintextPath);
                    console.log('[CredentialsManager] Removed plaintext credential file');
                } catch (cleanupErr) {
                    console.warn('[CredentialsManager] Could not remove plaintext credential file:', cleanupErr);
                }
            }

            console.log('[CredentialsManager] No stored credentials found');
        } catch (error) {
            console.error('[CredentialsManager] Failed to load credentials:', error);
            this.credentials = {};
        }
    }
}
