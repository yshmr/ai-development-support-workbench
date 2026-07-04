export type GeminiFetchParams = {
  apiKey: string;
  modelName: string;
  inputText: string;
  systemPrompt: string;
  responseSchema: unknown;
  debug?: boolean;
};

export function fetchGeminiGenerateContent(
  params: GeminiFetchParams
): Promise<Response>;
