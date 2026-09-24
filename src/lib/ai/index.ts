export { AI_PROVIDERS, OPENAI_COMPATIBLE_PRESETS, getProvider, ollamaOriginsCommand } from './providers';
export type { AiConfig, AiProviderId, AiProviderInfo } from './providers';
export {
  AiError,
  AiResultSchema,
  MAX_README_CHARS,
  buildPrompt,
  describeRequest,
  normaliseAiOutput,
  parseJsonLoose,
  summariseWithAi,
} from './client';
export type { AiErrorKind, AiResult } from './client';
export { forgetKeys, isRemembered, loadKey, saveKey } from './keys';
export type { KeyStorage, StorageLike } from './keys';
