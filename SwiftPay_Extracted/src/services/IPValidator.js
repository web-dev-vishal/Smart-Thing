import logger from '../utils/logger.js';

class IPValidator {
  constructor(redis) {
    this.redis = redis;
    this.apiUrl = 'https://ipapi.co';
    this.cacheExpiry = 24 * 60 * 60;
    this.enabled = process.env.ENABLE_IP_VALIDATION === 'true';
  }

  async validateIP(ipAddress, userCountry) {
    if (!this.enabled) {
      logger.debug('IP validation disabled');
      return {
        valid: true,
        country: null,
        suspicious: false,
        cached: false,
      };
    }

    if (!ipAddress || ipAddress === '::1' || ipAddress === '127.0.0.1') {
      logger.debug('Skipping validation for localhost IP');
      return {
        valid: true,
        country: 'localhost',
        suspicious: false,
        cached: false,
      };
    }

    try {
      const cacheKey = `cache:ip:${ipAddress}`;
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        const data = JSON.parse(cached);
        logger.debug('IP geolocation cache hit', { ipAddress, country: data.country });

        return {
          valid: true,
          country: data.country,
          suspicious: userCountry && data.country !== userCountry,
          cached: true,
        };
      }

      await this.incrementAPICounter('ipapi');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${this.apiUrl}/${ipAddress}/json/`, {
        method: 'GET',
        headers: {
          'User-Agent': 'SwiftPay/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`IP API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.reason || 'IP lookup failed');
      }

      const result = {
        country: data.country_code || data.country || 'Unknown',
        city: data.city,
        region: data.region,
      };

      await this.redis.setex(cacheKey, this.cacheExpiry, JSON.stringify(result));

      logger.info('IP geolocation lookup successful', {
        ipAddress,
        country: result.country,
      });

      return {
        valid: true,
        country: result.country,
        city: result.city,
        region: result.region,
        suspicious: userCountry && result.country !== userCountry,
        cached: false,
      };

    } catch (error) {
      if (error.name === 'AbortError') {
        logger.warn('IP validation timeout', { ipAddress });
      } else {
        logger.error('IP validation failed', {
          ipAddress,
          error: error.message,
        });
      }

      return {
        valid: false,
        country: null,
        suspicious: false,
        cached: false,
        error: error.message,
      };
    }
  }

  async incrementAPICounter(service) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const counterKey = `cache:api_count:${service}:${today}`;

      const count = await this.redis.incr(counterKey);
      await this.redis.expire(counterKey, 86400);

      const limit = this.getAPILimit(service);
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

  getAPILimit(service) {
    const limits = {
      ipapi: 1000,
      exchangerate: 1500,
      groq: 14400,
    };

    return limits[service] || 1000;
  }

  async getAPIUsage(service) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const counterKey = `cache:api_count:${service}:${today}`;

      const count = await this.redis.get(counterKey);
      const limit = this.getAPILimit(service);

      return {
        service,
        count: parseInt(count) || 0,
        limit,
        percentage: Math.round(((parseInt(count) || 0) / limit) * 100),
      };

    } catch (error) {
      logger.error('Failed to get API usage', { error: error.message });
      return {
        service,
        count: 0,
        limit: this.getAPILimit(service),
        percentage: 0,
      };
    }
  }
}

export default IPValidator;
