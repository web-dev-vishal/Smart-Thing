import logger from '../utils/logger.js';
import { retryWithBackoff } from '../utils/helpers.js';

class GroqClient {
  constructor() {
    this.apiKey = process.env.GROQ_API_KEY;
    this.baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
    this.model = 'llama-3.3-70b-versatile';
    this.enabled = process.env.ENABLE_AI_FEATURES === 'true';
    this.requestCount = 0;
    this.errorCount = 0;
  }

  async makeRequest(messages, timeout = 3000, temperature = 0.3) {
    if (!this.enabled) {
      logger.debug('AI features disabled, skipping Groq request');
      return null;
    }

    if (!this.apiKey) {
      logger.warn('Groq API key not configured');
      return null;
    }

    this.requestCount++;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature,
          max_tokens: 500,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || null;

    } catch (error) {
      clearTimeout(timeoutId);
      this.errorCount++;

      if (error.name === 'AbortError') {
        logger.warn('Groq API request timed out', { timeout });
      } else {
        logger.error('Groq API request failed', { error: error.message });
      }

      return null;
    }
  }

  async scoreFraudRisk(transactionData) {
    try {
      const { userId, amount, currency, ipCountry, userCountry, transactionCount } = transactionData;

      const prompt = `You are a fraud detection system. Analyze this payout transaction and return ONLY a JSON object with no additional text.

Transaction Details:
- User ID: ${userId}
- Amount: ${amount} ${currency}
- User's Country: ${userCountry || 'Unknown'}
- Request IP Country: ${ipCountry || 'Unknown'}
- Previous Transactions: ${transactionCount || 0}

Return JSON format:
{
  "riskScore": <number 0-100>,
  "reasoning": "<brief explanation>",
  "recommendation": "approve|review|reject"
}`;

      const messages = [
        {
          role: 'system',
          content: 'You are a fraud detection AI. Always respond with valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ];

      const response = await retryWithBackoff(
        () => this.makeRequest(messages, 3000, 0.2),
        2,
        500
      );

      if (!response) {
        return {
          riskScore: 50,
          reasoning: 'AI service unavailable',
          recommendation: 'review',
          aiAvailable: false,
        };
      }

      const parsed = this.parseFraudScore(response);
      return { ...parsed, aiAvailable: true };

    } catch (error) {
      logger.error('Fraud scoring failed', { error: error.message });
      return {
        riskScore: 50,
        reasoning: 'Error during fraud analysis',
        recommendation: 'review',
        aiAvailable: false,
      };
    }
  }

  parseFraudScore(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (typeof parsed.riskScore !== 'number' || parsed.riskScore < 0 || parsed.riskScore > 100) {
        throw new Error('Invalid riskScore value');
      }

      return {
        riskScore: Math.round(parsed.riskScore),
        reasoning: parsed.reasoning || 'No reasoning provided',
        recommendation: parsed.recommendation || 'review',
      };

    } catch (error) {
      logger.warn('Failed to parse fraud score response', { error: error.message });
      return {
        riskScore: 50,
        reasoning: 'Failed to parse AI response',
        recommendation: 'review',
      };
    }
  }

  async detectAnomaly(currentTransaction, transactionHistory) {
    try {
      const avgAmount = transactionHistory.length > 0
        ? transactionHistory.reduce((sum, t) => sum + t.amount, 0) / transactionHistory.length
        : 0;

      const prompt = `You are an anomaly detection system. Analyze this transaction pattern and return ONLY a JSON object.

Current Transaction:
- Amount: ${currentTransaction.amount} ${currentTransaction.currency}
- Time: ${new Date(currentTransaction.createdAt).toISOString()}

Historical Pattern (last 30 days):
- Total Transactions: ${transactionHistory.length}
- Average Amount: ${avgAmount.toFixed(2)}
- Frequency: ${transactionHistory.length} transactions in 30 days

Return JSON format:
{
  "isAnomaly": <boolean>,
  "confidence": <number 0-1>,
  "explanation": "<brief explanation>"
}`;

      const messages = [
        {
          role: 'system',
          content: 'You are an anomaly detection AI. Always respond with valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ];

      const response = await retryWithBackoff(
        () => this.makeRequest(messages, 3000, 0.2),
        2,
        500
      );

      if (!response) {
        return {
          isAnomaly: false,
          confidence: 0,
          explanation: 'AI service unavailable',
          aiAvailable: false,
        };
      }

      const parsed = this.parseAnomalyResult(response);
      return { ...parsed, aiAvailable: true };

    } catch (error) {
      logger.error('Anomaly detection failed', { error: error.message });
      return {
        isAnomaly: false,
        confidence: 0,
        explanation: 'Error during anomaly detection',
        aiAvailable: false,
      };
    }
  }

  parseAnomalyResult(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (typeof parsed.isAnomaly !== 'boolean') {
        throw new Error('Invalid isAnomaly value');
      }

      if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
        throw new Error('Invalid confidence value');
      }

      return {
        isAnomaly: parsed.isAnomaly,
        confidence: parsed.confidence,
        explanation: parsed.explanation || 'No explanation provided',
      };

    } catch (error) {
      logger.warn('Failed to parse anomaly result', { error: error.message });
      return {
        isAnomaly: false,
        confidence: 0,
        explanation: 'Failed to parse AI response',
      };
    }
  }

  async generateErrorExplanation(errorCode, context) {
    try {
      const { userId, amount, currency } = context;

      const prompt = `Explain this payment error to a user in simple, friendly language. Keep it under 200 characters.

Error Code: ${errorCode}
Amount: ${amount} ${currency}
User: ${userId}

Provide a clear, helpful explanation without technical jargon.`;

      const messages = [
        {
          role: 'system',
          content: 'You are a helpful payment assistant. Explain errors clearly and concisely.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ];

      const response = await this.makeRequest(messages, 2000, 0.5);

      if (!response) {
        return null;
      }

      return response.trim().substring(0, 200);

    } catch (error) {
      logger.error('Error explanation generation failed', { error: error.message });
      return null;
    }
  }

  async generateTransactionSummary(transactions) {
    try {
      const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
      const avgAmount = totalAmount / transactions.length;

      const prompt = `Analyze these transactions and provide a brief summary in 2-3 sentences.

Total Transactions: ${transactions.length}
Total Amount: ${totalAmount.toFixed(2)} USD
Average Amount: ${avgAmount.toFixed(2)} USD
Date Range: ${transactions[0]?.createdAt} to ${transactions[transactions.length - 1]?.createdAt}

Provide insights about spending patterns, trends, or notable observations.`;

      const messages = [
        {
          role: 'system',
          content: 'You are a financial analyst. Provide clear, actionable insights.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ];

      const response = await this.makeRequest(messages, 3000, 0.5);
      return response || 'Unable to generate summary';

    } catch (error) {
      logger.error('Transaction summary generation failed', { error: error.message });
      return 'Unable to generate summary';
    }
  }

  async predictNextTransaction(transactionHistory) {
    try {
      if (transactionHistory.length < 3) {
        return {
          predicted: false,
          message: 'Insufficient transaction history for prediction',
        };
      }

      const amounts = transactionHistory.map(t => t.amount);
      const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;

      const prompt = `Based on this transaction history, predict the likely amount and timing of the next transaction.

Transaction History:
${transactionHistory.slice(0, 10).map((t, i) => `${i + 1}. ${t.amount} ${t.currency} on ${new Date(t.createdAt).toLocaleDateString()}`).join('\n')}

Average Amount: ${avgAmount.toFixed(2)}

Return JSON format:
{
  "predictedAmount": <number>,
  "confidence": <number 0-1>,
  "reasoning": "<brief explanation>"
}`;

      const messages = [
        {
          role: 'system',
          content: 'You are a predictive analytics AI. Always respond with valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ];

      const response = await this.makeRequest(messages, 3000, 0.3);

      if (!response) {
        return {
          predicted: false,
          message: 'AI service unavailable',
        };
      }

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          predicted: true,
          ...parsed,
        };
      }

      return {
        predicted: false,
        message: 'Failed to parse prediction',
      };

    } catch (error) {
      logger.error('Transaction prediction failed', { error: error.message });
      return {
        predicted: false,
        message: 'Error during prediction',
      };
    }
  }

  getStats() {
    return {
      totalRequests: this.requestCount,
      totalErrors: this.errorCount,
      successRate: this.requestCount > 0 
        ? ((this.requestCount - this.errorCount) / this.requestCount * 100).toFixed(2) + '%'
        : '0%',
      enabled: this.enabled,
      model: this.model,
    };
  }

  resetStats() {
    this.requestCount = 0;
    this.errorCount = 0;
  }
}

export default GroqClient;
