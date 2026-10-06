import type { Language, ProfileData } from "./profile.ts";

export interface ChatGPTModel {
  slug: string;
  displayName: string;
}

export type AuthStatus =
  | { connected: false; previousEmail: string | null }
  | {
      connected: true;
      email: string | null;
      name: string | null;
      /** True when the chatgpt.tokens.use.direct scope was granted (plan usage). */
      sharing: boolean;
      selectedModel: string | null;
    };

export interface ImportRecord {
  id: string;
  fileName: string;
  /** Plain text extracted from the uploaded file. */
  text: string;
  status: "mapped" | "unmapped";
  /** Why AI mapping did not run or failed, when status is "unmapped". */
  error: string | null;
  detectedLanguage: Language;
  draft: ProfileData;
  createdAt: string;
}

export interface ApiError {
  error: string;
  code?: string;
}
