// Development-only visual fixture. No credentials, native devices, or API calls.
// Serve on a separate port with `npm run dev -- --port 5173 --strictPort`.
// Open /tests/fixtures/workspace-preview.html?theme=light (or dark).
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import packageInfo from '../../package.json';

if (!import.meta.env.DEV) throw new Error('The workspace fixture is development-only.');
const theme = new URLSearchParams(location.search).get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = theme;
document.documentElement.dataset.platform = 'darwin';
const handlers = new Map<string, Set<(...args: any[]) => void>>();
const emit = (name: string, ...args: any[]) => handlers.get(name)?.forEach(handler => handler(...args));
const now = Date.now();
const docs = [{ id: 'sample-resume', name: 'Alex Morgan - Resume.pdf', fileType: 'pdf', sizeBytes: 124000, contextKind: 'resume', markdown: '# Alex Morgan\nSenior software engineer. Built distributed data platforms.', createdAt: now, updatedAt: now }];
const meetings = [
  { id: 'system-design', title: 'Platform engineer - System design', date: new Date(now - 3600000).toISOString(), duration: '42m', isProcessed: true, summary: 'Distributed systems, caching, and event-driven architecture.' },
  { id: 'product-round', title: 'Product team - Technical round', date: new Date(now - 7200000).toISOString(), duration: '35m', isProcessed: true, summary: 'API design and engineering collaboration.' },
  { id: 'behavioral', title: 'Engineering leadership conversation', date: new Date(now - 86400000).toISOString(), duration: '28m', isProcessed: true, summary: 'Team leadership and ownership.' },
  { id: 'coding', title: 'Software engineer - Coding round', date: new Date(now - 172800000).toISOString(), duration: '55m', isProcessed: true, summary: 'Algorithms and problem solving.' },
];
const history = [
  { id: 'prep-user', role: 'user', phase: 'before', content: 'I am interviewing for a senior platform engineer role. Please keep answers concise and use examples from my resume.', createdAt: now - 7200000, attachments: docs },
  { id: 'prep-ai', role: 'assistant', phase: 'before', content: 'I will focus on **distributed systems, reliability, and technical ownership**.\n\nWhat does this round cover, and are there any projects you would especially like me to reference?', createdAt: now - 7190000 },
  { id: 'after-user', role: 'user', phase: 'after', content: 'How could I improve my answer about caching?', createdAt: now - 100000 },
  { id: 'after-ai', role: 'assistant', phase: 'after', content: 'Your explanation was clear. Make the **invalidation strategy** more concrete.\n\n1. Start with the consistency requirement.\n2. Describe the expiry and invalidation rules.\n3. Explain what happens when the cache is unavailable.\n\n```python\ndef read_profile(user_id):\n    cached = cache.get(user_id)\n    if cached is not None:\n        return cached\n    profile = database.find(user_id)\n    cache.set(user_id, profile, ttl=60)\n    return profile\n```\n\n| Decision | Tradeoff |\n| --- | --- |\n| Short TTL | Fresher data, more reads |\n| Event invalidation | Lower latency, more complexity |', createdAt: now - 90000 },
];
let model = 'gpt-6.1-sol';
let undetectable = true;
const states = new Map<string, any>();
const api: Record<string, any> = {
  platform: 'darwin',
  getRecentMeetings: async () => meetings,
  getMeetingDetails: async (id: string) => ({ ...meetings.find(meeting => meeting.id === id), transcript: [
    { speaker: 'Interviewer', text: 'How would you keep a distributed cache consistent with the database?', timestamp: now - 3500000 },
    { speaker: 'Me', text: 'I would begin with a cache-aside pattern and set an expiry based on how fresh the data needs to be.', timestamp: now - 3450000 },
  ], usage: [{ type: 'assist', timestamp: now - 3470000, question: 'How would you approach cache consistency?', answer: 'Use **cache-aside** for reads, invalidate after successful writes, and set a TTL as a backstop. Discuss eventual consistency explicitly.' }] }),
  interviewDocsList: async () => docs,
  interviewWorkspaceGetById: async (id: string) => states.get(id) || null,
  interviewWorkspaceGetByMeeting: async (meetingId: string) => ({ id: meetingId, meetingId, status: 'complete', messages: history, selectedDocumentIds: [], contextMarkdown: '', createdAt: now, updatedAt: now }),
  interviewWorkspaceSave: async (state: any) => { states.set(state.id, state); return { success: true, state }; },
  getCurrentLlmConfig: async () => ({ provider: model.startsWith('claude') ? 'claude' : 'openai', model }),
  getStoredCredentials: async () => ({ hasOpenaiKey: true, hasClaudeKey: true, hasGeminiKey: true, sttProvider: 'local-whisper', preferredProvider: 'openai' }),
  setModel: async (id: string) => { model = id; emit('onModelChanged', { model: id }); return { success: true }; },
  getNativeAudioStatus: async () => ({ connected: true }),
  checkPermissions: async () => ({ microphone: 'granted', screen: 'granted', accessibility: 'granted' }),
  localWhisperGetModels: async () => ({ models: [{ id: 'onnx-community/moonshine-base-ONNX', name: 'Moonshine Base', status: 'available' }], activeModelId: 'onnx-community/moonshine-base-ONNX' }),
  getInputDevices: async () => [{ id: 'default', name: 'Studio Display Microphone', isDefault: true }, { id: 'headset', name: 'USB Headset Microphone' }],
  getOutputDevices: async () => [{ id: 'default', name: 'Mac mini Speakers', isDefault: true }, { id: 'headphones', name: 'Headphones' }],
  getUndetectable: async () => undetectable,
  setUndetectable: async (value: boolean) => { undetectable = value; emit('onUndetectableChanged', value); },
  getMeetingActive: async () => false,
  getThemeMode: async () => ({ mode: theme, resolved: theme }),
  getCustomProviders: async () => [],
  getAvailableOllamaModels: async () => [],
  getKeybinds: async () => [],
  getRecognitionLanguages: async () => ({ 'english-us': { name: 'English (US)', group: 'English', google: 'en-US' } }),
  getAiResponseLanguages: async () => [{ code: 'auto', label: 'Auto' }, { code: 'en', label: 'English' }],
  getCalendarStatus: async () => ({ connected: false }),
  getMeetingRetention: async () => 'forever',
  getDisguise: async () => 'none',
  getAppVersion: async () => packageInfo.version,
  getAvailableModels: async () => [],
  getProviderDataScopes: async () => ({}),
  streamGeminiChat: async () => {
    for (const token of ['I will ', 'use this context ', 'for your interview. ', '**What round is next?**']) {
      await new Promise(resolve => setTimeout(resolve, 100));
      emit('onGeminiStreamToken', token);
    }
    emit('onGeminiStreamDone');
  },
};
(window as any).electronAPI = new Proxy(api, {
  get(target, key: string) {
    if (key in target) return target[key];
    if (key.startsWith('on')) return (handler: (...args: any[]) => void) => {
      if (!handlers.has(key)) handlers.set(key, new Set());
      handlers.get(key)!.add(handler);
      return () => handlers.get(key)?.delete(handler);
    };
    return async () => undefined;
  },
});
const { default: Launcher } = await import('../../src/components/Launcher');
const { default: SettingsOverlay } = await import('../../src/components/SettingsOverlay');
function Preview() {
  const [settings, setSettings] = useState<string | null>(null);
  const openSettings = React.useCallback((tab = 'general') => setSettings(tab), []);
  const closeSettings = React.useCallback(() => setSettings(null), []);
  return <><Launcher onStartMeeting={() => emit('onMeetingStateChanged', { isActive: true })} onOpenSettings={openSettings} /><SettingsOverlay isOpen={settings !== null} initialTab={settings || 'general'} onClose={closeSettings} /></>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
