/**
 * Mock Groq AI Client for Testing
 * 
 * Simulates Groq API responses without making actual API calls.
 */

/**
 * Mock Groq Client
 */
export class MockGroqClient {
  constructor(config = {}) {
    this.config = config;
    this.callCount = 0;
    this.lastRequest = null;
  }

  /**
   * Mock fraud risk assessment
   */
  async assessFraudRisk(transactionData) {
    this.callCount++;
    this.lastRequest = { method: 'assessFraudRisk', data: transactionData };

    // Simulate different risk levels based on amount
    const { amount, userId, ipAddress } = transactionData;

    let riskScore = 25; // Default LOW
    let riskLevel = 'LOW';
    let reason = 'Transaction appears normal';

    // High amount = higher risk
    if (amount > 5000) {
      riskScore = 75;
      riskLevel = 'HIGH';
      reason = 'Large transaction amount';
    } else if (amount > 1000) {
      riskScore = 50;
      riskLevel = 'MEDIUM';
      reason = 'Moderate transaction amount';
    }

    // Suspicious patterns
    if (userId && userId.includes('suspicious')) {
      riskScore = 90;
      riskLevel = 'CRITICAL';
      reason = 'User flagged as suspicious';
    }

    if (ipAddress && ipAddress.startsWith('192.168')) {
      riskScore = Math.min(riskScore + 10, 100);
      reason += ', Private IP address detected';
    }

    return {
      riskScore,
      riskLevel,
      reason,
      confidence: 0.85,
      factors: [
        { name: 'amount', weight: 0.4, value: amount },
        { name: 'user_history', weight: 0.3, value: 'normal' },
        { name: 'ip_reputation', weight: 0.3, value: 'unknown' },
      ],
    };
  }

  /**
   * Mock anomaly detection
   */
  async detectAnomaly(transactionData, userHistory) {
    this.callCount++;
    this.lastRequest = { method: 'detectAnomaly', data: transactionData, history: userHistory };

    const { amount } = transactionData;
    const avgAmount = userHistory.length > 0
      ? userHistory.reduce((sum, t) => sum + t.amount, 0) / userHistory.length
      : amount;

    const isAnomalous = amount > avgAmount * 3;

    return {
      isAnomalous,
      anomalyScore: isAnomalous ? 0.85 : 0.15,
      reason: isAnomalous
        ? `Transaction amount (${amount}) is 3x higher than average (${avgAmount.toFixed(2)})`
        : 'Transaction within normal range',
      comparisonMetrics: {
        currentAmount: amount,
        averageAmount: avgAmount,
        maxAmount: Math.max(...userHistory.map(t => t.amount), amount),
        minAmount: Math.min(...userHistory.map(t => t.amount), amount),
      },
    };
  }

  /**
   * Mock error explanation
   */
  async explainError(error, context) {
    this.callCount++;
    this.lastRequest = { method: 'explainError', error, context };

    return {
      explanation: `The error "${error.message}" occurred because of ${context.operation}`,
      suggestedFix: 'Check the input parameters and try again',
      severity: 'medium',
      category: 'validation_error',
    };
  }

  /**
   * Reset mock state
   */
  reset() {
    this.callCount = 0;
    this.lastRequest = null;
  }

  /**
   * Get call statistics
   */
  getStats() {
    return {
      callCount: this.callCount,
      lastRequest: this.lastRequest,
    };
  }
}

/**
 * Create mock Groq client
 */
export function createMockGroqClient(config = {}) {
  return new MockGroqClient(config);
}

/**
 * Mock Groq client with custom responses
 */
export function createMockGroqClientWithResponses(responses = {}) {
  const client = new MockGroqClient();

  if (responses.assessFraudRisk) {
    client.assessFraudRisk = jest.fn().mockResolvedValue(responses.assessFraudRisk);
  }

  if (responses.detectAnomaly) {
    client.detectAnomaly = jest.fn().mockResolvedValue(responses.detectAnomaly);
  }

  if (responses.explainError) {
    client.explainError = jest.fn().mockResolvedValue(responses.explainError);
  }

  return client;
}

export default MockGroqClient;
