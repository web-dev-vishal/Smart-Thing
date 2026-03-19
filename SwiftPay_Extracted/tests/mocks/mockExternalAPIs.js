/**
 * Mock External APIs for Testing
 * 
 * Mocks for ipapi.co, exchangerate-api.com, and other external services.
 */

/**
 * Mock IP Validation API (ipapi.co)
 */
export class MockIPValidator {
  constructor() {
    this.callCount = 0;
    this.responses = new Map();
  }

  /**
   * Mock IP validation
   */
  async validateIP(ipAddress, expectedCountry = null) {
    this.callCount++;

    // Predefined responses for common test IPs
    const mockResponses = {
      '8.8.8.8': {
        valid: true,
        suspicious: false,
        country: 'US',
        city: 'Mountain View',
        region: 'California',
        isp: 'Google LLC',
        proxy: false,
        vpn: false,
      },
      '192.168.1.1': {
        valid: true,
        suspicious: true,
        country: 'PRIVATE',
        city: 'Unknown',
        region: 'Unknown',
        isp: 'Private Network',
        proxy: false,
        vpn: false,
        reason: 'Private IP address',
      },
      '1.2.3.4': {
        valid: true,
        suspicious: false,
        country: 'AU',
        city: 'Sydney',
        region: 'New South Wales',
        isp: 'Example ISP',
        proxy: false,
        vpn: false,
      },
    };

    const response = mockResponses[ipAddress] || {
      valid: true,
      suspicious: false,
      country: 'US',
      city: 'Unknown',
      region: 'Unknown',
      isp: 'Unknown ISP',
      proxy: false,
      vpn: false,
    };

    // Check country mismatch
    if (expectedCountry && response.country !== expectedCountry) {
      response.suspicious = true;
      response.reason = `IP country (${response.country}) doesn't match user country (${expectedCountry})`;
    }

    return response;
  }

  /**
   * Set custom response for specific IP
   */
  setResponse(ipAddress, response) {
    this.responses.set(ipAddress, response);
  }

  /**
   * Reset mock state
   */
  reset() {
    this.callCount = 0;
    this.responses.clear();
  }
}

/**
 * Mock Currency Validator API (exchangerate-api.com)
 */
export class MockCurrencyValidator {
  constructor() {
    this.callCount = 0;
    this.exchangeRates = {
      USD: 1.0,
      EUR: 0.85,
      GBP: 0.73,
      INR: 83.12,
      JPY: 149.50,
      AUD: 1.52,
      CAD: 1.36,
    };
  }

  /**
   * Mock currency validation
   */
  async validateCurrency(currency, amount = null) {
    this.callCount++;

    const validCurrencies = Object.keys(this.exchangeRates);

    if (!validCurrencies.includes(currency)) {
      return {
        valid: false,
        error: `Invalid currency code: ${currency}`,
      };
    }

    const exchangeRate = this.exchangeRates[currency];
    const amountInUSD = amount ? amount / exchangeRate : null;

    return {
      valid: true,
      currency,
      exchangeRate,
      amountInUSD,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Get exchange rate between two currencies
   */
  async getExchangeRate(fromCurrency, toCurrency) {
    this.callCount++;

    if (!this.exchangeRates[fromCurrency] || !this.exchangeRates[toCurrency]) {
      throw new Error('Invalid currency code');
    }

    const rate = this.exchangeRates[toCurrency] / this.exchangeRates[fromCurrency];

    return {
      from: fromCurrency,
      to: toCurrency,
      rate,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Set custom exchange rate
   */
  setExchangeRate(currency, rate) {
    this.exchangeRates[currency] = rate;
  }

  /**
   * Reset mock state
   */
  reset() {
    this.callCount = 0;
    this.exchangeRates = {
      USD: 1.0,
      EUR: 0.85,
      GBP: 0.73,
      INR: 83.12,
      JPY: 149.50,
      AUD: 1.52,
      CAD: 1.36,
    };
  }
}

/**
 * Create mock IP validator
 */
export function createMockIPValidator() {
  return new MockIPValidator();
}

/**
 * Create mock currency validator
 */
export function createMockCurrencyValidator() {
  return new MockCurrencyValidator();
}

export default {
  MockIPValidator,
  MockCurrencyValidator,
  createMockIPValidator,
  createMockCurrencyValidator,
};
