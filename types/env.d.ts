declare namespace NodeJS {
  interface ProcessEnv {
    OPENROUTER_API_KEY: string;
    OPENROUTER_MODEL: string; // The model to use for the chat
    OPENROUTER_TRANSFORM_MODEL?: string; // Model for content transforms (translate, simplify, etc.)
    NEXT_PUBLIC_API_BASE_URL?: string;
    POST_TOKEN?: string;
    AI_KNOWLEDGE_BASE_TOKEN?: string;
  }
}