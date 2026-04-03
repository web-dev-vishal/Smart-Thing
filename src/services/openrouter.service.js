// OpenRouter Service — unified gateway to 25+ free AI models.
//
// OpenRouter aggregates models from Google, Meta, Mistral, DeepSeek, and more.
// Free tier: 50 requests/day (1000/day after adding $10 credits).
// No credit card required for free models.
//
// Free models used (as of 2025):
//   - deepseek/deepseek-chat-v3-0324:free  → deep reasoning, research tasks
//   - qwen/qwen3-235b-a22b:free            → multilingual, long context
//   - google/gemma-3-27b-it:free           → document analysis, Q&A
//   - meta-llama/llama-4-scout:free        → general purpose, fast
//   - mistralai/mistral-7b-instruct:free   → lightweight, classification
//
// This service handles:
//   - Research agent (web-grounded reasoning with DeepSeek)
//   - Document Q&A (Gemma 3 with long context)
//   - Smart reply suggestions (Llama 4)
//   - Code explanation and generation (DeepSeek)
//   - Multi-agent critic pass (improves another agent's output)
//
// Docs: https://openrouter.ai/docs

import logger from "../utils/logger.js";

// Free models — these cost $0 per token
const FREE_MODELS = {
    RESEARCH:      "deepseek/deepseek-chat-v3-0324:free",
    MULTILINGUAL:  "qwen/qwen3-235b-a22b:free",
    DOCUMENT_QA:   "google/gemma-3-27b-it:free",
    GENERAL:       "meta-llama/llama-4-scout:free",
    LIGHTWEIGHT:   "mistralai/mistral-7b-instruct:free",
};

class OpenRouterService {
    constructor() {
        this.apiKey  = process.env.OPENROUTER_API_KEY;
        this.baseUrl = "https://openrouter.ai/api/v1/chat/completions";
        this.enabled = !!(this.apiKey);

        // OpenRouter requires these headers for proper attribution and routing
        this.siteUrl  = process.env.CLIENT_URL || "http://localhost:5000";
        this.siteName = process.env.APP_NAME    || "NexusFlow";

        // In-memory rate limit tracker — OpenRouter returns 429 when exceeded
        this._rateLimitHit  = false;
        this._rateLimitReset = 0;
    }

    // ── Core request ──────────────────────────────────────────────────────────
    async _request(model, messages, options = {}) {
        if (!this.enabled) return null;

        // Back off if we recently hit a rate limit
        if (this._rateLimitHit && Date.now() < this._rateLimitReset) {
            logger.warn("OpenRouter rate limit active — skipping request", { model });
            return null;
        }

        const {
            temperature = 0.4,
            maxTokens   = 800,
            timeoutMs   = 12000,
        } = options;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(this.baseUrl, {
                method:  "POST",
                headers: {
                    Authorization:   `Bearer ${this.apiKey}`,
                    "Content-Type":  "application/json",
                    "HTTP-Referer":  this.siteUrl,
                    "X-Title":       this.siteName,
                },
                body: JSON.stringify({
                    model,
                    messages,
                    temperature,
                    max_tokens: maxTokens,
                }),
                signal: controller.signal,
            });

            clearTimeout(timer);

            if (response.status === 429) {
                // Rate limited — back off for 60 seconds
                this._rateLimitHit   = true;
                this._rateLimitReset = Date.now() + 60_000;
                logger.warn("OpenRouter rate limit hit — backing off 60s");
                return null;
            }

            if (!response.ok) {
                const body = await response.text().catch(() => "");
                throw new Error(`OpenRouter API ${response.status}: ${body.slice(0, 120)}`);
            }

            this._rateLimitHit = false; // successful response — reset flag

            const data = await response.json();
            return data.choices?.[0]?.message?.content ?? null;

        } catch (err) {
            clearTimeout(timer);
            if (err.name === "AbortError") {
                logger.warn("OpenRouter request timed out", { model, timeoutMs });
            } else {
                logger.error("OpenRouter request failed", { model, error: err.message });
            }
            return null;
        }
    }

    // ── Research agent ────────────────────────────────────────────────────────
    // Uses DeepSeek for deep reasoning over a topic.
    // Combines the user's question with any provided context (news, Wikipedia, etc.)
    // to produce a well-reasoned, grounded answer.
    async research(question, context = "") {
        const contextBlock = context
            ? `\n\n## Background Context\n${context.slice(0, 4000)}`
            : "";

        const messages = [
            {
                role:    "system",
                content: "You are a research assistant. Provide accurate, well-structured answers. Cite your reasoning. Be thorough but concise.",
            },
            {
                role:    "user",
                content: `Research question: ${question}${contextBlock}\n\nProvide a comprehensive answer with key facts, relevant context, and a clear conclusion.`,
            },
        ];

        const result = await this._request(FREE_MODELS.RESEARCH, messages, {
            temperature: 0.3,
            maxTokens:   1000,
            timeoutMs:   15000,
        });

        return result ? result.trim() : null;
    }

    // ── Document Q&A ──────────────────────────────────────────────────────────
    // Answers questions about a provided document using Gemma 3's long context.
    // The document text is injected as context (RAG pattern).
    async documentQA(question, documentText) {
        const messages = [
            {
                role:    "system",
                content: "You are a document analysis assistant. Answer questions based only on the provided document. If the answer is not in the document, say so clearly.",
            },
            {
                role:    "user",
                content: `Document:\n${documentText.slice(0, 12000)}\n\nQuestion: ${question}`,
            },
        ];

        const result = await this._request(FREE_MODELS.DOCUMENT_QA, messages, {
            temperature: 0.1,
            maxTokens:   600,
            timeoutMs:   12000,
        });

        return result ? result.trim() : null;
    }

    // ── Smart reply suggestions ───────────────────────────────────────────────
    // Given a message, suggests 3 short reply options.
    // Used in the NexusChat layer for quick reply buttons.
    async suggestReplies(messageContent, conversationContext = "") {
        const contextBlock = conversationContext
            ? `\nRecent conversation:\n${conversationContext.slice(0, 1000)}\n`
            : "";

        const messages = [
            {
                role:    "system",
                content: "You are a messaging assistant. Suggest 3 short, natural reply options. Each reply should be under 15 words. Return as a JSON array of strings.",
            },
            {
                role:    "user",
                content: `${contextBlock}Message to reply to: "${messageContent}"\n\nReturn ONLY a JSON array: ["reply1", "reply2", "reply3"]`,
            },
        ];

        const raw = await this._request(FREE_MODELS.GENERAL, messages, {
            temperature: 0.7,
            maxTokens:   100,
            timeoutMs:   6000,
        });

        if (!raw) return ["Got it!", "Thanks!", "I'll look into this."];

        try {
            const match = raw.match(/\[[\s\S]*\]/);
            if (!match) throw new Error("No array found");
            const replies = JSON.parse(match[0]);
            return Array.isArray(replies) ? replies.slice(0, 3) : ["Got it!", "Thanks!", "I'll look into this."];
        } catch {
            return ["Got it!", "Thanks!", "I'll look into this."];
        }
    }

    // ── Code explanation ──────────────────────────────────────────────────────
    // Explains what a code snippet does in plain English.
    // Uses DeepSeek which is strong at code understanding.
    async explainCode(code, language = "unknown") {
        const messages = [
            {
                role:    "system",
                content: "You are a code explanation assistant. Explain code clearly for developers. Cover: what it does, how it works, and any potential issues.",
            },
            {
                role:    "user",
                content: `Explain this ${language} code:\n\`\`\`${language}\n${code.slice(0, 4000)}\n\`\`\``,
            },
        ];

        const result = await this._request(FREE_MODELS.RESEARCH, messages, {
            temperature: 0.2,
            maxTokens:   600,
            timeoutMs:   10000,
        });

        return result ? result.trim() : null;
    }

    // ── Critic pass ───────────────────────────────────────────────────────────
    // Takes another agent's output and improves it.
    // This is the "critic" step in the Mixture-of-Agents pattern from awesome-llm-apps.
    // The critic reviews the draft and returns an improved version.
    async critique(originalOutput, task) {
        const messages = [
            {
                role:    "system",
                content: "You are a critic and editor. Review the provided output, identify weaknesses, and return an improved version. Be constructive and specific.",
            },
            {
                role:    "user",
                content: `Task: ${task}\n\nOriginal output to improve:\n${originalOutput.slice(0, 3000)}\n\nProvide an improved version that is more accurate, clear, and complete.`,
            },
        ];

        const result = await this._request(FREE_MODELS.DOCUMENT_QA, messages, {
            temperature: 0.3,
            maxTokens:   800,
            timeoutMs:   12000,
        });

        return result ? result.trim() : null;
    }

    // ── Workflow description → JSON ───────────────────────────────────────────
    // User describes a workflow in plain English.
    // This agent converts it to a structured workflow definition JSON.
    // The output is validated and stored as a workflow in MongoDB.
    async describeToWorkflow(description) {
        const messages = [
            {
                role:    "system",
                content: `You are a workflow builder assistant. Convert natural language descriptions into structured workflow JSON.
A workflow has: trigger (type, config), conditions (array), nodes (array of steps), and actions (array).
Node types: "ai_agent", "http_request", "send_message", "send_email", "condition", "delay".
Return valid JSON only.`,
            },
            {
                role:    "user",
                content: `Convert this workflow description to JSON:
"${description}"

Return ONLY this JSON structure:
{
  "name": "<workflow name>",
  "description": "<brief description>",
  "trigger": {
    "type": "message_keyword|schedule|webhook|manual",
    "config": {}
  },
  "nodes": [
    {
      "id": "node_1",
      "type": "ai_agent|http_request|send_message|send_email|condition|delay",
      "name": "<step name>",
      "config": {}
    }
  ]
}`,
            },
        ];

        const raw = await this._request(FREE_MODELS.RESEARCH, messages, {
            temperature: 0.2,
            maxTokens:   800,
            timeoutMs:   12000,
        });

        if (!raw) return null;

        try {
            const match = raw.match(/\{[\s\S]*\}/);
            if (!match) return null;
            return JSON.parse(match[0]);
        } catch {
            return null;
        }
    }

    // ── Status ────────────────────────────────────────────────────────────────
    getStatus() {
        return {
            enabled:        this.enabled,
            rateLimited:    this._rateLimitHit,
            rateLimitReset: this._rateLimitHit ? new Date(this._rateLimitReset).toISOString() : null,
            models:         FREE_MODELS,
        };
    }

    isAvailable() {
        return this.enabled && (!this._rateLimitHit || Date.now() >= this._rateLimitReset);
    }
}

export default OpenRouterService;
