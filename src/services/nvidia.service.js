// NVIDIA NIM Service — inference via NVIDIA's hosted API catalog.
//
// NVIDIA NIM exposes an OpenAI-compatible API at api.nvidia.com/v1.
// Free tier: 1000 credits on signup, ~5000 total for Developer Program members.
// Models used:
//   - meta/llama-3.1-8b-instruct  → fast, low-cost background tasks
//   - mistralai/mistral-7b-instruct-v0.3 → classification, sentiment
//   - nvidia/llama-3.1-nemotron-70b-instruct → high-quality reasoning tasks
//
// This service is used for:
//   - Background summarisation (non-blocking, lower priority)
//   - Message sentiment analysis across channels
//   - Workflow node classification
//   - Bulk text processing tasks that don't need Groq's speed
//
// Docs: https://docs.api.nvidia.com/nim/docs/api-quickstart

import logger from "../utils/logger.js";

// Available models with their strengths
const NVIDIA_MODELS = {
    FAST:      "meta/llama-3.1-8b-instruct",          // fastest, cheapest
    BALANCED:  "mistralai/mistral-7b-instruct-v0.3",  // good balance
    POWERFUL:  "nvidia/llama-3.1-nemotron-70b-instruct", // best quality
};

class NvidiaService {
    constructor() {
        this.apiKey  = process.env.NVIDIA_API_KEY;
        this.baseUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
        this.enabled = !!(this.apiKey);

        // Track request count per model for rate limit awareness
        this._requestCounts = new Map();
    }

    // ── Core request method ───────────────────────────────────────────────────
    // NVIDIA NIM uses the same request format as OpenAI — just a different base URL and key.
    async _request(model, messages, options = {}) {
        if (!this.enabled) return null;

        const {
            temperature = 0.3,
            maxTokens   = 512,
            timeoutMs   = 8000,
            stream      = false,
        } = options;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        // Track usage per model
        const count = this._requestCounts.get(model) || 0;
        this._requestCounts.set(model, count + 1);

        try {
            const response = await fetch(this.baseUrl, {
                method:  "POST",
                headers: {
                    Authorization:  `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json",
                    Accept:         stream ? "text/event-stream" : "application/json",
                },
                body: JSON.stringify({
                    model,
                    messages,
                    temperature,
                    max_tokens: maxTokens,
                    stream,
                }),
                signal: controller.signal,
            });

            clearTimeout(timer);

            if (!response.ok) {
                const body = await response.text().catch(() => "");
                throw new Error(`NVIDIA API ${response.status}: ${body.slice(0, 120)}`);
            }

            if (stream) return response; // caller handles the stream

            const data = await response.json();
            return data.choices?.[0]?.message?.content ?? null;

        } catch (err) {
            clearTimeout(timer);
            if (err.name === "AbortError") {
                logger.warn("NVIDIA NIM request timed out", { model, timeoutMs });
            } else {
                logger.error("NVIDIA NIM request failed", { model, error: err.message });
            }
            return null;
        }
    }

    // ── Summarise text ────────────────────────────────────────────────────────
    // Used for: thread summaries, document summaries, meeting notes.
    // Uses the fast model — quality is good enough for summaries.
    async summarise(text, { maxWords = 150, style = "concise" } = {}) {
        const styleGuide = {
            concise:  "Write a concise summary in 2-3 sentences.",
            bullets:  "Write a bullet-point summary with 3-5 key points.",
            detailed: "Write a detailed summary covering all main points.",
        };

        const messages = [
            {
                role:    "system",
                content: `You are a summarisation assistant. ${styleGuide[style] || styleGuide.concise} Keep it under ${maxWords} words.`,
            },
            {
                role:    "user",
                content: `Summarise the following:\n\n${text.slice(0, 8000)}`,
            },
        ];

        const result = await this._request(NVIDIA_MODELS.FAST, messages, {
            temperature: 0.2,
            maxTokens:   300,
            timeoutMs:   6000,
        });

        return result ? result.trim() : null;
    }

    // ── Sentiment analysis ────────────────────────────────────────────────────
    // Analyses the emotional tone of a message or a batch of messages.
    // Returns: { sentiment: "positive|negative|neutral|mixed", score: 0-1, summary: string }
    async analyseSentiment(text) {
        const messages = [
            {
                role:    "system",
                content: "You are a sentiment analysis model. Respond with valid JSON only.",
            },
            {
                role:    "user",
                content: `Analyse the sentiment of this text and return JSON:
Text: "${text.slice(0, 2000)}"

Return ONLY:
{
  "sentiment": "positive|negative|neutral|mixed",
  "score": <0.0 to 1.0 where 1.0 is most positive>,
  "emotions": ["<emotion1>", "<emotion2>"],
  "summary": "<one sentence>"
}`,
            },
        ];

        const raw = await this._request(NVIDIA_MODELS.BALANCED, messages, {
            temperature: 0.1,
            maxTokens:   150,
            timeoutMs:   5000,
        });

        if (!raw) return { sentiment: "neutral", score: 0.5, emotions: [], summary: "Analysis unavailable" };

        try {
            const match = raw.match(/\{[\s\S]*\}/);
            if (!match) throw new Error("No JSON found");
            return JSON.parse(match[0]);
        } catch {
            return { sentiment: "neutral", score: 0.5, emotions: [], summary: "Parse error" };
        }
    }

    // ── Classify text ─────────────────────────────────────────────────────────
    // Classifies text into one of the provided categories.
    // Used for: workflow trigger matching, webhook payload routing, message tagging.
    async classify(text, categories) {
        if (!categories || categories.length === 0) return null;

        const messages = [
            {
                role:    "system",
                content: "You are a text classification model. Respond with the category name only — no explanation.",
            },
            {
                role:    "user",
                content: `Classify this text into exactly one of these categories: ${categories.join(", ")}

Text: "${text.slice(0, 1000)}"

Reply with only the category name.`,
            },
        ];

        const raw = await this._request(NVIDIA_MODELS.FAST, messages, {
            temperature: 0.0,
            maxTokens:   20,
            timeoutMs:   4000,
        });

        if (!raw) return null;

        // Find the closest matching category in the response
        const response = raw.trim().toLowerCase();
        const match = categories.find((c) => response.includes(c.toLowerCase()));
        return match || categories[0];
    }

    // ── Generate meeting notes ────────────────────────────────────────────────
    // Takes a conversation (array of { username, content } messages) and
    // produces structured meeting notes with action items.
    async generateMeetingNotes(messages) {
        if (!messages || messages.length === 0) return null;

        const conversation = messages
            .slice(-50) // last 50 messages max
            .map((m) => `${m.username}: ${m.content}`)
            .join("\n");

        const prompt = [
            {
                role:    "system",
                content: "You are a meeting notes assistant. Extract key information from conversations.",
            },
            {
                role:    "user",
                content: `Generate structured meeting notes from this conversation:

${conversation}

Format your response as:
## Summary
<2-3 sentence overview>

## Key Decisions
- <decision 1>
- <decision 2>

## Action Items
- [ ] <action> — @<person if mentioned>

## Topics Discussed
- <topic 1>
- <topic 2>`,
            },
        ];

        const result = await this._request(NVIDIA_MODELS.BALANCED, prompt, {
            temperature: 0.3,
            maxTokens:   600,
            timeoutMs:   10000,
        });

        return result ? result.trim() : null;
    }

    // ── Translate text ────────────────────────────────────────────────────────
    // Translates text to the target language.
    // Uses the powerful model for better translation quality.
    async translate(text, targetLanguage) {
        const messages = [
            {
                role:    "system",
                content: `You are a professional translator. Translate text to ${targetLanguage}. Return only the translated text — no explanations.`,
            },
            {
                role:    "user",
                content: text.slice(0, 3000),
            },
        ];

        const result = await this._request(NVIDIA_MODELS.POWERFUL, messages, {
            temperature: 0.1,
            maxTokens:   1000,
            timeoutMs:   10000,
        });

        return result ? result.trim() : null;
    }

    // ── Get usage stats ───────────────────────────────────────────────────────
    getUsageStats() {
        return {
            enabled:       this.enabled,
            requestCounts: Object.fromEntries(this._requestCounts),
            models:        NVIDIA_MODELS,
        };
    }

    isAvailable() {
        return this.enabled;
    }
}

export default NvidiaService;
