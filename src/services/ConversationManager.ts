import { ChatMessage, chatCompletion } from './NvidiaAIClient';

const SYSTEM_PROMPT = `You are a professional AI receptionist answering a phone call. Your behavior:

1. GREETING: Start with a warm, professional greeting. Example: "Hello, thank you for calling. This is an AI receptionist. How may I help you today?"

2. CONVERSATION: Have a natural, helpful conversation. Listen carefully and respond appropriately.

3. CAPABILITIES:
   - Answer frequently asked questions about the business
   - Take messages (ask for caller's name, phone number, and message)
   - Offer to transfer calls to specific people or departments
   - Provide general information

4. STYLE:
   - Be polite, professional, and concise
   - Keep responses SHORT (1-3 sentences max) since this is a phone call
   - Speak naturally as if on a real phone call
   - If you don't know something, offer to take a message

5. ENDING: When the conversation is wrapping up, say goodbye professionally.

Remember: You are speaking on the phone, so keep responses brief and conversational.`;

export interface CallRecord {
  id: string;
  phoneNumber: string;
  timestamp: number;
  duration: number;
  transcript: { role: 'caller' | 'ai'; text: string }[];
  messageTaken?: string;
}

export class ConversationManager {
  private messages: ChatMessage[] = [];
  private transcript: { role: 'caller' | 'ai'; text: string }[] = [];
  private apiKey: string;
  private customInstructions: string;

  constructor(apiKey: string, customInstructions?: string) {
    this.apiKey = apiKey;
    this.customInstructions = customInstructions || '';
    this.reset();
  }

  reset() {
    const systemContent = this.customInstructions
      ? `${SYSTEM_PROMPT}\n\nAdditional business info:\n${this.customInstructions}`
      : SYSTEM_PROMPT;

    this.messages = [{ role: 'system', content: systemContent }];
    this.transcript = [];
  }

  async getGreeting(): Promise<string> {
    this.messages.push({
      role: 'user',
      content: '[Call connected. Greet the caller.]',
    });

    const response = await chatCompletion(this.apiKey, this.messages);
    this.messages.push({ role: 'assistant', content: response });
    this.transcript.push({ role: 'ai', text: response });
    return response;
  }

  async respond(callerText: string): Promise<string> {
    this.messages.push({ role: 'user', content: callerText });
    this.transcript.push({ role: 'caller', text: callerText });

    const response = await chatCompletion(this.apiKey, this.messages);
    this.messages.push({ role: 'assistant', content: response });
    this.transcript.push({ role: 'ai', text: response });
    return response;
  }

  getTranscript() {
    return [...this.transcript];
  }
}
