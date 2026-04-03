import { ChatMessage, chatCompletion, chatCompletionStream } from './NvidiaAIClient';

export type CallGoal = 'book' | 'order';

const BASE_PROMPT = `You are a professional AI receptionist answering a phone call.

LANGUAGE: You MUST speak in TAGLISH (mix of Tagalog and English, the natural way Filipinos talk).
Examples of Taglish:
- "Hello po! Salamat sa pag-tawag. Paano ko po kayo matutulungan?"
- "Okay po, kukunin ko lang po yung details ninyo."
- "Sure po! Anong date and time po ang preferred ninyo?"
- "Sige po, i-confirm ko lang — tama po ba yung order ninyo?"

STYLE:
- Sound like a real, friendly Filipino receptionist — warm and "may pagka-sweet"
- Use "po" and "opo" for politeness
- Keep responses SHORT (1-3 sentences max) since this is a phone call
- Mix Tagalog and English naturally, the way Filipinos actually talk
- Be helpful, patient, and accommodating
- When the conversation is wrapping up, say "Salamat po sa pag-tawag! Ingat po!"
- If the caller speaks pure English, you can respond more in English but still sprinkle in Filipino warmth

IMPORTANT:
- Keep responses to 1-2 sentences MAXIMUM — you are on a phone call, be quick
- The caller's words come from speech-to-text and WILL have errors — "book" might appear as "bok", "appointment" as "a point men", "bukas" as "bucas", etc.
- ALWAYS understand the INTENT behind misspelled/misheard words — NEVER ask "what do you mean?" for obvious STT errors
- If you can guess what they meant (even roughly), just go with it
- Only ask to repeat if the message is completely unintelligible
- Sound HUMAN, not robotic`;

const BOOKING_PROMPT = `
YOUR PRIMARY GOAL: Help the caller BOOK AN APPOINTMENT.

FLOW:
1. Greet the caller warmly and ask how you can help
2. When they want to book, collect these details one at a time:
   - Their full name
   - Preferred date and time
   - Type of service/appointment they need
   - Their phone number for confirmation
   - Any special requests or notes
3. Confirm all details back to the caller
4. Let them know they'll receive a confirmation
5. If they have questions, answer them, then guide back to booking

If the caller doesn't want to book, still help with general questions, but gently offer booking when appropriate.
Always collect info step-by-step, not all at once. Be conversational.`;

const ORDER_PROMPT = `
YOUR PRIMARY GOAL: Help the caller PLACE AN ORDER.

FLOW:
1. Greet the caller warmly and ask what they'd like to order
2. Take their order details:
   - What items/products/services they want
   - Quantities
   - Any customizations or special requests
   - Delivery or pickup preference
   - Their name and phone number
   - Delivery address (if delivery)
3. Repeat the full order back for confirmation
4. Provide an estimated total if possible
5. Confirm the order and provide an estimated time

If the caller has questions about the menu/catalog, help them decide. Be patient and suggestive.
Always collect info step-by-step, not all at once. Be conversational.`;

function buildSystemPrompt(goal: CallGoal, businessName: string, customInstructions: string): string {
  const goalPrompt = goal === 'book' ? BOOKING_PROMPT : ORDER_PROMPT;

  let prompt = `${BASE_PROMPT}\n\n${goalPrompt}`;

  if (businessName) {
    prompt += `\n\nYou are the receptionist for "${businessName}". Use this name in your greeting.`;
  }

  if (customInstructions) {
    prompt += `\n\nAdditional business info & instructions:\n${customInstructions}`;
  }

  return prompt;
}

export interface TenantConfig {
  tenantId?: string;
  businessName: string;
  apiKey: string;
  callGoal: CallGoal;
  customInstructions: string;
}

export interface CallRecord {
  id: string;
  phoneNumber: string;
  timestamp: number;
  duration: number;
  transcript: { role: 'caller' | 'ai'; text: string }[];
  messageTaken?: string;
  callGoal?: CallGoal;
}

export class ConversationManager {
  private messages: ChatMessage[] = [];
  private transcript: { role: 'caller' | 'ai'; text: string }[] = [];
  private apiKey: string;
  private callGoal: CallGoal;
  private businessName: string;
  private customInstructions: string;

  constructor(config: TenantConfig) {
    this.apiKey = config.apiKey;
    this.callGoal = config.callGoal || 'book';
    this.businessName = config.businessName || '';
    this.customInstructions = config.customInstructions || '';
    this.reset();
  }

  reset() {
    const systemContent = buildSystemPrompt(this.callGoal, this.businessName, this.customInstructions);
    this.messages = [{ role: 'system', content: systemContent }];
    this.transcript = [];
  }

  async getGreeting(onToken?: (partial: string) => void): Promise<string> {
    this.messages.push({
      role: 'user',
      content: '[Call connected. Greet the caller.]',
    });

    const response = await chatCompletionStream(this.apiKey, this.messages, onToken);
    this.messages.push({ role: 'assistant', content: response });
    this.transcript.push({ role: 'ai', text: response });
    return response;
  }

  async respond(callerText: string, onToken?: (partial: string) => void): Promise<string> {
    this.messages.push({ role: 'user', content: callerText });
    this.transcript.push({ role: 'caller', text: callerText });

    const response = await chatCompletionStream(this.apiKey, this.messages, onToken);
    this.messages.push({ role: 'assistant', content: response });
    this.transcript.push({ role: 'ai', text: response });
    return response;
  }

  getTranscript() {
    return [...this.transcript];
  }

  getGoal(): CallGoal {
    return this.callGoal;
  }

  async generateSummary(): Promise<CallSummary> {
    const transcriptText = this.transcript
      .map((t) => `${t.role === 'caller' ? 'Caller' : 'AI'}: ${t.text}`)
      .join('\n');

    const summaryPrompt = this.callGoal === 'book'
      ? `Analyze this phone call transcript and extract a structured summary in JSON format:
{
  "type": "booking",
  "caller_name": "name or empty string",
  "phone_number": "number or empty string",
  "preferred_date": "date or empty string",
  "preferred_time": "time or empty string",
  "service_requested": "what they want to book",
  "special_requests": "any notes",
  "status": "confirmed" or "pending" or "cancelled",
  "summary": "1-2 sentence human-readable summary in Taglish"
}
Return ONLY valid JSON, nothing else.`
      : `Analyze this phone call transcript and extract a structured summary in JSON format:
{
  "type": "order",
  "caller_name": "name or empty string",
  "phone_number": "number or empty string",
  "items": [{"name": "item", "quantity": 1, "notes": "customization"}],
  "delivery_method": "delivery" or "pickup",
  "delivery_address": "address or empty string",
  "estimated_total": "amount or empty string",
  "status": "confirmed" or "pending" or "cancelled",
  "summary": "1-2 sentence human-readable summary in Taglish"
}
Return ONLY valid JSON, nothing else.`;

    const summaryMessages: ChatMessage[] = [
      { role: 'system', content: summaryPrompt },
      { role: 'user', content: transcriptText },
    ];

    try {
      const response = await chatCompletion(this.apiKey, summaryMessages);
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as CallSummary;
      }
    } catch {
      // Ignore parse errors
    }

    return {
      type: this.callGoal === 'book' ? 'booking' : 'order',
      caller_name: '',
      phone_number: '',
      status: 'pending',
      summary: 'Call summary not available',
    };
  }
}

export interface CallSummary {
  type: 'booking' | 'order';
  caller_name: string;
  phone_number: string;
  status: 'confirmed' | 'pending' | 'cancelled';
  summary: string;
  // Booking fields
  preferred_date?: string;
  preferred_time?: string;
  service_requested?: string;
  special_requests?: string;
  // Order fields
  items?: { name: string; quantity: number; notes: string }[];
  delivery_method?: 'delivery' | 'pickup';
  delivery_address?: string;
  estimated_total?: string;
}
