import "server-only";
import type {
  InboundMessage,
  SendResult,
  SmsProvider,
} from "./provider";

/**
 * Semaphore implementation (Philippines). The platform's API key authenticates
 * all sends; each restaurant supplies its own registered `senderName`.
 * Docs: https://semaphore.co/docs
 */
export class SemaphoreProvider implements SmsProvider {
  constructor(private readonly apiKey: string) {}

  async send(senderName: string, to: string, body: string): Promise<SendResult> {
    try {
      const res = await fetch("https://api.semaphore.co/api/v4/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apikey: this.apiKey,
          number: to,
          message: body,
          sendername: senderName,
        }),
      });
      if (!res.ok) {
        return { ok: false, error: `Semaphore ${res.status}` };
      }
      const json = (await res.json()) as Array<{ message_id?: number }>;
      return { ok: true, providerRef: String(json?.[0]?.message_id ?? "") };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "send failed" };
    }
  }

  parseInbound(payload: unknown): InboundMessage | null {
    // Semaphore inbound payloads vary by setup; accept the common shape.
    const p = payload as { sender?: string; from?: string; message?: string; text?: string };
    const from = p.sender ?? p.from;
    const text = p.message ?? p.text;
    if (!from || typeof text !== "string") return null;
    return { from, text };
  }
}
