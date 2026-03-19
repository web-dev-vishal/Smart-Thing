import logger from '../utils/logger.js';

class CurrencyValidator {
  constructor(redis) {
    this.redis = redis;
    this.apiKey = process.env.EXCHANGE_RATE_API_KEY;
    this.baseUrl = 'https://v6.exchangerate-api.com/v6';
    this.cacheExpiry = 60 * 60; // 1 hour
    this.enabled = process.env.ENABLE_CURRENCY_VALIDATION === 'true';
  }

  async validateCurrency(currency, amount) {
    if (!this.enabled) {
      logger.debug('Currency validation disabled');
      return {
        valid: true,
        exchangeRate: null,
        amountInUSD: null,
        cached: false,
      };
    }

    if (!currency) {
      return {
        valid: false,
        error: 'Currency code is required',
      };
    }

    try {
      const cacheKey = `cache:currency:${currency}`;
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        const data = JSON.parse(cached);
        logger.debug('Currency cache hit', { currency, rate: data.rate });

        return {
          valid: true,
          exchangeRate: data.rate,
          amountInUSD: amount ? (amount / data.rate).toFixed(2) : null,
          cached: true,
          lastUpdated: data.lastUpdated,
        };
      }

      if (!this.apiKey) {
        logger.warn('Exchange rate API key not configured, using fallback');
        return await this.useFallbackRates(currency, amount);
      }

      await this.incrementAPICounter('exchangerate');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const response = await fetch(`${this.baseUrl}/${this.apiKey}/latest/USD`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Exchange rate API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.result !== 'success') {
        throw new Error(data['error-type'] || 'Currency lookup failed');
      }

      if (!data.conversion_rates[currency]) {
        return {
          valid: false,
          error: 'INVALID_CURRENCY',
          message: `Currency ${currency} is not supported`,
        };
      }

      const rate = data.conversion_rates[currency];
      const cacheData = {
        rate,
        lastUpdated: new Date().toISOString(),
      };

      await this.redis.setex(cacheKey, this.cacheExpiry, JSON.stringify(cacheData));

      logger.info('Currency validation successful', {
        currency,
        rate,
      });

      return {
        valid: true,
        exchangeRate: rate,
        amountInUSD: amount ? (amount / rate).toFixed(2) : null,
        cached: false,
        lastUpdated: cacheData.lastUpdated,
      };

    } catch (error) {
      if (error.name === 'AbortError') {
        logger.warn('Currency validation timeout', { currency });
      } else {
        logger.error('Currency validation failed', {
          currency,
          error: error.message,
        });
      }

      return await this.useFallbackRates(currency, amount);
    }
  }

  async useFallbackRates(currency, amount) {
    try {
      const fallbackRates = {
        USD: 1.0,
        EUR: 0.92,
        GBP: 0.79,
        INR: 83.12,
        CAD: 1.36,
        AUD: 1.52,
        JPY: 149.50,
        CHF: 0.88,
        CNY: 7.24,
        MXN: 17.08,
        BRL: 4.97,
        ZAR: 18.65,
        SGD: 1.34,
        HKD: 7.82,
        NZD: 1.64,
        SEK: 10.52,
        NOK: 10.68,
        DKK: 6.86,
        PLN: 3.98,
        THB: 34.25,
      };

      if (!fallbackRates[currency]) {
        return {
          valid: false,
          error: 'CURRENCY_SERVICE_UNAVAILABLE',
          message: 'Currency validation service unavailable and no cached rates',
        };
      }

      const rate = fallbackRates[currency];

      logger.info('Using fallback exchange rate', { currency, rate });

      return {
        valid: true,
        exchangeRate: rate,
        amountInUSD: amount ? (amount / rate).toFixed(2) : null,
        cached: false,
        fallback: true,
        lastUpdated: 'fallback',
      };

    } catch (error) {
      logger.error('Fallback rates failed', { error: error.message });
      return {
        valid: false,
        error: 'CURRENCY_SERVICE_UNAVAILABLE',
        message: 'Currency validation service unavailable',
      };
    }
  }

  async convertCurrency(amount, fromCurrency, toCurrency) {
    try {
      const fromValidation = await this.validateCurrency(fromCurrency, amount);
      const toValidation = await this.validateCurrency(toCurrency, null);

      if (!fromValidation.valid || !toValidation.valid) {
        return {
          success: false,
          error: 'Invalid currency code',
        };
      }

      const amountInUSD = parseFloat(fromValidation.amountInUSD);
      const convertedAmount = (amountInUSD * toValidation.exchangeRate).toFixed(2);

      return {
        success: true,
        from: {
          amount,
          currency: fromCurrency,
          rate: fromValidation.exchangeRate,
        },
        to: {
          amount: convertedAmount,
          currency: toCurrency,
          rate: toValidation.exchangeRate,
        },
        amountInUSD: amountInUSD.toFixed(2),
      };

    } catch (error) {
      logger.error('Currency conversion failed', { error: error.message });
      return {
        success: false,
        error: 'Conversion failed',
      };
    }
  }

  async getHistoricalRates(currency, days = 7) {
    try {
      // This would require a different API endpoint or service
      // For now, return mock data structure
      logger.info('Historical rates requested', { currency, days });

      return {
        success: true,
        currency,
        days,
        message: 'Historical rates feature requires premium API access',
        rates: [],
      };

    } catch (error) {
      logger.error('Historical rates failed', { error: error.message });
      return {
        success: false,
        error: 'Failed to fetch historical rates',
      };
    }
  }

  async incrementAPICounter(service) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const counterKey = `cache:api_count:${service}:${today}`;

      const count = await this.redis.incr(counterKey);
      await this.redis.expire(counterKey, 86400);

      const limit = 1500; // Free tier limit
      if (count >= limit * 0.9) {
        logger.warn(`API usage approaching limit for ${service}`, {
          count,
          limit,
          percentage: Math.round((count / limit) * 100),
        });
      }

      return count;

    } catch (error) {
      logger.error('Failed to increment API counter', { error: error.message });
      return 0;
    }
  }

  async getSupportedCurrencies() {
    const supported = [
      'USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'MXN',
      'BRL', 'ZAR', 'SGD', 'HKD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'THB',
      'KRW', 'RUB', 'TRY', 'IDR', 'MYR', 'PHP', 'VND', 'AED', 'SAR', 'EGP',
    ];

    return {
      success: true,
      currencies: supported,
      count: supported.length,
    };
  }

  async getCurrencyInfo(currency) {
    const currencyInfo = {
      USD: { name: 'US Dollar', symbol: '$', country: 'United States' },
      EUR: { name: 'Euro', symbol: '€', country: 'European Union' },
      GBP: { name: 'British Pound', symbol: '£', country: 'United Kingdom' },
      INR: { name: 'Indian Rupee', symbol: '₹', country: 'India' },
      CAD: { name: 'Canadian Dollar', symbol: 'C$', country: 'Canada' },
      AUD: { name: 'Australian Dollar', symbol: 'A$', country: 'Australia' },
      JPY: { name: 'Japanese Yen', symbol: '¥', country: 'Japan' },
      CHF: { name: 'Swiss Franc', symbol: 'CHF', country: 'Switzerland' },
      CNY: { name: 'Chinese Yuan', symbol: '¥', country: 'China' },
      MXN: { name: 'Mexican Peso', symbol: '$', country: 'Mexico' },
    };

    const info = currencyInfo[currency];

    if (!info) {
      return {
        success: false,
        error: 'Currency information not available',
      };
    }

    const validation = await this.validateCurrency(currency, null);

    return {
      success: true,
      currency,
      ...info,
      currentRate: validation.exchangeRate,
      lastUpdated: validation.lastUpdated,
    };
  }
}

export default CurrencyValidator;
