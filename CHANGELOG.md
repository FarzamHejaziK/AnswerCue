# Changelog

## [2.8.1] - 2026-10-04

### Model Defaults and Selection

- New OpenAI setups default to GPT 6.1 Sol; new Claude setups default to Opus 5.5. Google remains Gemini 3.5 Flash.
- First-run setup saves its model choice so it survives restarts and interview completion.
- Shared defaults align onboarding, Settings, backend requests, connection checks, and text/screenshot fallback baselines.
- Removed GPT 5.5, GPT 5.5 Thinking, and the GPT 5.5 Instant alias from model lists, discovery, and Codex CLI presets. Claude Opus 5.5 remains available.
- Saved retired GPT 5.5 defaults and OpenAI preferences migrate to GPT 6.1 Sol on startup. Other valid saved choices remain unchanged.
- No changes to the live interview shell's appearance.

See [.github/releases/v2.8.1.md](.github/releases/v2.8.1.md) for verification, platform details, signing status, and known limitations.

## [2.8.0] - 2026-10-02

### Workspace Refresh

- Refined light and dark themes with neutral surfaces and AnswerCue accent colors, without changing the live interview shell's appearance.
- Added collapsible interview and settings sidebars, interview filtering, and responsive layouts for smaller windows.
- Reworked prep and follow-up chat with a growing composer, clearer document attachments, copy-response actions, and jump-to-latest navigation.
- Enabled sending a document without accompanying text; sent documents leave the composer and remain in the conversation's context.
- Improved Markdown code blocks and tables, searchable model selection, and compact audio selectors.
- Improved Settings navigation, keyboard-operable switches, focus handling, and Escape behavior. Fixed duplicate animation keys and floating Help overlap.

### Models and Requests

- Added GPT 6 Astra, GPT 6.1 Sol, GPT 6 Luna, GPT 5.6 Sol/Terra/Luna, and Claude Opus 5/5.5 and Sonnet 5/5.5 to the shared model catalog.
- Centralized model capabilities and request parameters, including reasoning effort, output limits, and first-token budgets.
- Made screenshot requests honor the selected model before attempting provider fallbacks.

### Release and Verification

- Versioned Windows x64 installer and macOS Intel/Apple Silicon DMG and ZIP builds.
- Tagged Windows builds now require signing credentials and verify both application and installer signatures before release upload. macOS retains Developer ID signing, notarization, and stapling verification.
- Added a development-only UI fixture with synthetic data for repeatable light/dark and responsive checks.
- Type-check, renderer build, and automated suite passed locally: 1,025 passing tests, 41 skipped, no failures.

See [.github/releases/v2.8.0.md](.github/releases/v2.8.0.md) for platform details and known limitations.

## [2.7.3] - 2026-06-15

### Summary

AnswerCue v2.7.3 completes the first AnswerCue-branded release pass: new cross-platform logo assets, cleaner About text, focused model support, and inline in-app updates wired to the AnswerCue GitHub release channel.

### What's New

- **New AnswerCue logo system:** Added the flag-road mark as the app icon source and regenerated macOS `.icns`, Windows `.ico`, Linux PNG sizes, tray template, and in-app logo assets.
- **Inline update experience:** Added a Codex-style sidebar update row for available, downloading, and restart-to-install update states.
- **Interview-first About page:** Rebuilt the About screen around AnswerCue's prep, live interview, post-interview, privacy, and platform support story.
- **Focused Claude support:** Limited Anthropic selection to the latest Opus models plus Sonnet 4.6.

### Improvements

- **AnswerCue app identity:** Updated the packaged app id to `com.answercue.desktop` and moved Windows taskbar grouping away from the old upstream identity.
- **Release pipeline branding:** Updated macOS and Windows artifact names, release workflow labels, update instructions, and release templates to AnswerCue.
- **Update source isolation:** Confirmed updater metadata and release notes are pulled from `FarzamHejaziK/AnswerCue`, not the upstream repository.
- **Live interview context:** Included prep chat and selected document markdown in the live interview prompt context path.

### Fixes

- Fixed stale app names in update instructions and macOS release verification.
- Fixed the macOS release workflow check that still searched for the old app bundle name.
- Fixed Windows release packaging when Transformers.js downloads the Moonshine Base quantized graph successfully but ONNX runtime validation fails during install.
- Added the missing macOS entitlements files required by both unsigned ad-hoc packaging and future signed/notarized builds.
- Increased the macOS DMG filesystem size so Apple Silicon packages fit after embedding the local transcription model.
- Adjusted unsigned macOS release packaging so Apple Silicon ships as the updater ZIP while Intel keeps the DMG target.
- Removed the old update promotion popup path so update notices no longer look like promotional UI.
- Removed the confusing `Clear` control from the interview header.

### Technical

- Bumped the package version to `2.7.3` for release detection.
- Added `answercueSigned` metadata for signed macOS auto-install gating while preserving compatibility with older `nativelySigned` builds.
- Updated GitHub Actions Windows publishing so tagged releases can attach `AnswerCue-Setup-VERSION.exe` and `latest.yml`.
- Regenerated all platform icon outputs from the new logo source.

## [2.0.7] - 2026-03-20

### What's New
    
- **Single-Trigger Analysis**: Added a new global keybind (`Cmd+Shift+Enter`) for "Capture and Process" to instantly take a screenshot and run AI analysis.
- **Tavily Search Integration**: Replaced Google Custom Search Engine with the Tavily Search API. Features advanced depth and raw content extraction for vastly improved RAG and Company Research.
- **Enhanced Company Dossiers**: Massively expanded the Premium Profile Intelligence UI. Now includes interview difficulty badges, a 5-star work culture grid with sub-dimensions, employee reviews with sentiment analysis, critics/complaints tracking, and core benefits pills.

### Improvements
    
- **AI Language Strict Enforcement**: Rewrote the AI language enforcement pipeline. Native languages (Spanish, French, etc.) are now strongly prioritized over system prompt defaults using a triple-layer strict injection, guaranteeing the AI never incorrectly defaults back to English.
- **Model Selection Accuracy**: Rewrote `LLMHelper` routing logic to guarantee your specifically selected cloud provider model (e.g., `gpt-4o`, `claude-3-5-sonnet`) is rigorously respected during vision fallbacks, multimodal processing, and streaming.
- **Robust AI Fallbacks**: Added Gemini Flash and local Ollama models to the structured generation fallback chains, ensuring features like resume parsing work continuously even when primary models face rate limits or outages.
- **Smoother Animations**: Mac window transitions now utilize zero-opacity pre-hiding to eliminate jarring animation flashes during rapid screenshot captures.
    
### Fixes
    
- Fixed a bug where custom cURL endpoints and the "What to Say" auto-suggestion path would occasionally bypass the user's language preferences.
- Fixed the OpenAI API validation ping by upgrading the deprecated connection test model to `gpt-4o-mini`.
- Fixed UI sync issues where the AI response language dropdown could fall out of sync with the backend upon an IPC failure via a new optimistic playback system.
- Removed unused dead user interface components and completely sanitized legacy template variables from core system prompts.

## [2.0.5] - 2026-03-15

### Improvements

- **Stealth Mode UI**: The Process Disguise selector is now visually disabled and locked while Undetectable mode is active, preventing accidental state mismatches.
- **State Synchronization**: Greatly improved internal state synchronization across all application windows (Settings, Launcher, Overlay).

### Fixes

- **Infinite Feedback Loops**: Completely eliminated the bug where toggling Undetectable mode would sometimes cause the app to rapidly toggle itself on and off.
- **Delayed Dock Reappearance**: Fixed a regression where the macOS dock icon would mysteriously reappear several seconds after entering stealth mode if a disguise had recently been changed.
- **Initial State Loading**: Fixed an issue where the Settings UI would briefly show incorrect toggle states when first opened.
- **macOS OS-level Events**: Hardened the app against macOS `activate` events (like clicking the app in Finder) accidentally breaking stealth mode.

### Technical

- Refactored IPC (Inter-Process Communication) listeners for `SettingsPopup` and `SettingsOverlay` to use a strict one-way (receive-only) data binding pattern.
- Added strict management and cancellation of `forceUpdate` timeouts during stealth mode transitions.
- Added explicit type safety for the new getters in `electron.d.ts`.

## [2.0.4] - 2026-03-14

### Summary

Version 2.0.4 introduces a massive architectural overhaul to the native audio pipeline, guaranteeing production-ready stability, true zero-allocation data transfer, and instantaneous STT responsiveness with WebRTC ML-based VAD.

### What's New

- **Two-Stage Silence Processing**: Replaced basic RMS noise gating with a two-stage pipeline combining an adaptive RMS threshold and WebRTC Machine Learning VAD. Rejects typing, fan noise, and non-speech sounds before they bill STT APIs.
- **Zero-Copy ABI Transfers**: Transitioned the `ThreadsafeFunction` bridging to direct `napi::Buffer` (Uint8Array) allocations, completely eliminating V8 garbage collection pressure during continuous capture.
- **Sliding-Window RAG**: Implemented a 50-token semantic overlap in `SemanticChunker.ts` to prevent conversational context loss across chunk boundaries.

### Improvements

- **Latency & Responsiveness Tuning**: Stripped redundant TS debouncing, slashed `MIN_BUFFER_BYTES`, and reduced native hangover, achieving a ~300ms reduction in end-to-end transcription latency. short utterances ("Yes", "Stop") no longer sit trapped in the buffer.
- Removed floating-point division truncation for superior downsampling from 44.1kHz external microphones.

### Fixes

- Fixed a critical bug where the native Rust monitor returned a hardcoded `16000Hz` while actually streaming 48kHz audio. Now syncs true hardware sample rates.
- Resolved the "Input missing" silent crash bug on microphone restarts by properly recreating the CPAL stream.
- Restored the 10s continuous speech backstop for REST APIs to prevent unbounded buffer growth.
- Added missing `notifySpeechEnded()` properties and cleaned up dangerous type casts.

### Technical

- Audio processing transitioned entirely to strict ABI memory bridging (`napi::Buffer`)
- Re-architected native silence_suppression state machine around WebRTC VAD inputs.

## [2.0.3] - 2026-03-13

### What's New

- **Dynamic AI Model Selection:** Replaced static model lists with dynamic dropdowns. Your preferred models synced from providers (like OpenAI, Anthropic, Google) now automatically appear across the entire app.
- **Multimodal Resilience:** Added a "Smart Dynamic Fallback" using Groq Llama 4 Scout. If default vision models fail or get rate-limited during screen analysis, AnswerCue instantly reroutes the image to ensure uninterrupted performance.
- **Multiple Screenshot Support:** The AnswerCue Interface can now handle and process multiple attached screenshots simultaneously instead of just one.
- **Improved Settings UX:** API keys now auto-save after 5 seconds of inactivity, and selecting a preferred model immediately updates the rest of the application without requiring a page reload.

### Architecture & Fixes

- **Better Embeddings:** Migrated from Gemini Embedding to a completely new and more robust embedding architecture.
- **Claude Fixes:** Resolved max_tokens and context limits issues specific to Anthropic Claude interactions.
- **DRY Refactoring:** Centralized model configuration strings across the codebase to ensure easier future updates.

## [2.0.2] - 2026-03-10

### Summary

v2.0.2 focuses on fixing Windows system audio capture, improving RAG stability, and resolving critical Soniox STT configuration issues.

### What's New

- Fully functional system audio capture for Windows
- Introduced system for manual transcript finalization and interim/final bridging during recordings

### Improvements

- Migrated to `app.getAppPath()` for reliable cross-platform resource discovery
- Ensured `sqlite-vec` compatibility and fixed embedding queue management
- Upgraded `@google/genai` and optimized embedding dimensionality for lower latency

### Fixes

- Improved Soniox STT streaming reliability, manual flushing, and configuration persistence
- Resolved application entry point and module resolution issues in production builds
- Fixed transcript bridging for manual recording mode
- Corrected stealth activation and window focus inconsistencies

### Technical

- Dependency updates for `@google/genai`
- Cleaned up native compiler warnings for Windows
- Fixed module resolution for internal Electron paths

## [2.0.1] - 2026-03-06

### New Features

- **Premium Profile Intelligence**: Job Description (JD) and Resume context awareness, company research, and negotiation assistance.
- **Live Meeting RAG**: Instant intelligent retrieval of context directly during a live meeting using local vectors.
- **Soniox Speech Provider**: Added support for ultra-fast and highly accurate streaming STT with Soniox.
- **Multilingual Support**: Choose from various response languages, set speech recognition matching specific accents and dialects.

### Improvements & Fixes

- Fixed numerous issues and merged 3 community pull requests to improve overall stability.

## [1.1.8] - 2026-02-23

### Summary

Patch update addressing OpenAI GPT 5.x compatibility and increasing token output limits for all providers.

### What's New

- Replaced deprecated `max_tokens` parameter with `max_completion_tokens` required by GPT 5.x models.
- Increased max output tokens for OpenAI (GPT 5.2) and Claude (Sonnet 4.5) to 65,536.
- Increased max output tokens for Groq (Llama 3.3 70B) to 32,768.

### Improvements

- Improved response length capabilities across all text-generation AI models.
- Updated connection test model to use `gpt-5.2-chat-latest` instead of the deprecated `gpt-3.5-turbo`.

### Fixes

- Fixed 400 error when using OpenAI GPT 5.x models for text queries and toggle actions.

### Technical

- Replaced `max_tokens` with `max_completion_tokens` in `LLMHelper.ts` and `ipcHandlers.ts`.

## [1.1.7] - 2026-02-20

### Summary

Security hardening, memory optimization, and stability improvements for a more robust and reliable experience.

### What's New

- API rate limiting to prevent 429 errors on free-tier plans (Gemini, Groq, OpenAI, Claude)
- Cross-platform screenshot support (macOS, Linux, Windows)
- Official website link added to the About section

### Improvements

- Smarter transcript memory management with epoch summarization instead of hard truncation — no more losing early meeting context
- API keys are now scrubbed from memory on app quit to minimize exposure window
- Credentials manager now overwrites key data before disposal for enhanced security
- Helper process renaming for improved stealth in Activity Monitor

### Fixes

- Fixed V8/Electron entitlements crash on Intel Macs by including entitlements.mac.plist during ad-hoc signing
- Fixed process disguise not applying correctly when undetectable mode is toggled on
- Fixed usage array capping with dedicated helper method to prevent unbounded growth

### Technical

- Added `RateLimiter` service (token bucket algorithm with configurable burst and refill rates)
- Added `PRIVACY.md` and `SECURITY.md` policy documents
- Refactored ad-hoc signing script with helper renaming and proper entitlements flow
- Version bump to 1.1.7

## [1.1.6] - 2026-02-15

### New Features

- **Speech Providers**: Added support for multiple speech providers including Google, Groq, OpenAI, Deepgram, ElevenLabs, Azure, and IBM Watson.
- **Fast Response Mode**: Introduced ultra-fast text responses using Groq Llama 3.
- **Local RAG & Memory**: Full offline vector retrieval for past meetings using SQLite.
- **Custom Key Bindings**: Added ability to customize global shortcuts for easier control.
- **Stealth Mode Improvements**: Enhanced disguise modes (Terminal, Settings, Activity Monitor) for better privacy.
- **Markdown Support**: Improved Markdown rendering in the Usage section for better readability of AI responses.
- **Image Processing**: Integrated `sharp` for optimized image handling and faster analysis.

### Improvements & Fixes

- Fixed various UI bugs and focus stealing issues.
- Improved application stability and performance.

## [1.1.5] - 2026-02-13

### Summary

The Stealth & Intelligence Update: Enhances stealth capabilities, expands AI provider support, and improves local AI integration.

### What's New

- **Native Speech Provider Support:** Added Deepgram, Groq, and OpenAI speech providers.
- **Custom LLM Providers:** Connect to any OpenAI-compatible API including OpenRouter and DeepSeek.
- **Smart Local AI:** Auto-detection of available Ollama models for local AI.
- **Global Spotlight Search:** Toggle chat overlay with Cmd+K (macOS) and Ctrl+K (Windows/Linux).
- **Masquerading Mode:** Appear as system processes like Terminal or Activity Monitor.
- **Improved Stealth Mode:** Enhanced activation and window focus transitions.

### Improvements

- **Natural Responses:** Updated system prompts for more concise and natural responses.
- **Conversational Logic:** Reduced robotic preambles and unnecessary explanations.
- **Performance:** Improved UI scaling and reduced speech-to-text latency.

### Fixes

- No critical fixes reported in this release.

### Technical

- Internal logic refinements for improved conversational flow.
- Updater and background process stability improvements.

#### macOS Installation (Unsigned Build)

If you see "App is damaged":

1. Move the app to your Applications folder.
2. Open Terminal and run: `xattr -cr /Applications/AnswerCue.app`

## [1.1.4] - 2026-02-12

### What's New in v1.1.4

- **Custom LLM Providers:** Connect to any OpenAI-compatible API (OpenRouter, DeepSeek, commercial endpoints) simply by pasting a cURL command.
- **Smart Local AI:** Enhanced Ollama integration that automatically detects and lists your available local models—no configuration required.
- **Refined Human Persona:** Major updates to system prompts (`prompts.ts`) to ensure responses are concise, conversational, and indistinguishable from a real candidate.
- **Anti-Chatbot Logic:** Specific negative constraints to prevent "AI-like" lectures, distinct "robot" preambles, and over-explanation.
- **Global Spotlight Search:** Access AI chat instantly with `Cmd+K` / `Ctrl+K`.
- **Masquerading (Undetectable Mode):** Stealth capability to disguise the app as common utility processes (Terminal, Activity Monitor) for discreet usage.
