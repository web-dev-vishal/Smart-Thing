// This service wraps several free public APIs that are useful for a payment system.
// All of them require no API key and are sourced from the public-apis repository:
// https://github.com/public-apis/public-apis
//
// APIs used:
//   1. exchangerate.host  — real-time currency exchange rates (Finance > Currency Exchange)
//   2. restcountries.com  — country info: name, currency, flag, calling code (Geography)
//   3. coingecko.com      — live cryptocurrency prices in USD (Finance > Cryptocurrency)
//   4. ipapi.co           — IP geolocation (already used in ip-validator.service.js)

import logger from "../utils/logger.js";

// How long to cache each type of data in Redis (seconds)
const CACHE_TTL = {
    exchangeRates: 60 * 60,      // 1 hour — rates don't change that fast
    country:       24 * 60 * 60, // 24 hours — country data is basically static
    crypto:        5 * 60,       // 5 minutes — crypto prices move quickly
};

// Timeout for all outbound HTTP calls — we never want to block a request for more than this
const REQUEST_TIMEOUT_MS = 3000;

class PublicApiService {
    constructor(redisClient) {
        this.redis = redisClient;
    }

    // ─── Internal helper ──────────────────────────────────────────────────────

    // Wraps fetch with a timeout and consistent error handling.
    // Returns parsed JSON or throws with a clean message.
    async _fetch(url, label) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const res = await fetch(url, {
                headers: { "User-Agent": "SwiftPay/1.0" },
                signal:  controller.signal,
            });

            clearTimeout(timer);

            if (!res.ok) throw new Error(`${label} returned ${res.status}`);

            return await res.json();
        } catch (err) {
            clearTimeout(timer);
            if (err.name === "AbortError") {
                throw new Error(`${label} timed out`);
            }
            throw err;
        }
    }

    // ─── 1. Exchange Rates (exchangerate.host) ────────────────────────────────
    // Free, no API key required.
    // Returns live rates for all supported currencies relative to USD.

    async getExchangeRates(baseCurrency = "USD") {
        const base = baseCurrency.toUpperCase();
        const cacheKey = `pubapi:rates:${base}`;

        // Try cache first — rates are cached for 1 hour
        const cached = await this.redis.get(cacheKey);
        if (cached) {
            return { ...JSON.parse(cached), cached: true };
        }

        try {
            // exchangerate.host is free and doesn't require an API key
            const data = await this._fetch(
                `https://open.er-api.com/v6/latest/${base}`,
                "ExchangeRate API"
            );

            if (data.result !== "success") {
                throw new Error(data["error-type"] || "Exchange rate API error");
            }

            const result = {
                base:        data.base_code,
                rates:       data.rates,
                lastUpdated: data.time_last_update_utc,
                cached:      false,
            };

            await this.redis.setex(cacheKey, CACHE_TTL.exchangeRates, JSON.stringify(result));

            return result;
        } catch (error) {
            logger.error("Exchange rate fetch failed:", error.message);
            throw error;
        }
    }

    // Convert an amount from one currency to another using live rates
    async convertCurrency(amount, from, to) {
        const fromUpper = from.toUpperCase();
        const toUpper   = to.toUpperCase();

        if (fromUpper === toUpper) {
            return { amount, from: fromUpper, to: toUpper, converted: amount, rate: 1 };
        }

        const rates = await this.getExchangeRates(fromUpper);

        const rate = rates.rates[toUpper];
        if (!rate) {
            throw new Error(`No rate available for ${toUpper}`);
        }

        const converted = parseFloat((amount * rate).toFixed(2));

        return {
            amount,
            from:        fromUpper,
            to:          toUpper,
            converted,
            rate,
            lastUpdated: rates.lastUpdated,
            cached:      rates.cached,
        };
    }

    // ─── 2. Country Info (restcountries.com) ──────────────────────────────────
    // Free, no API key required.
    // Useful for validating user country codes and enriching payout data.

    async getCountryInfo(countryCode) {
        const code = countryCode.toUpperCase();
        const cacheKey = `pubapi:country:${code}`;

        const cached = await this.redis.get(cacheKey);
        if (cached) {
            return { ...JSON.parse(cached), cached: true };
        }

        try {
            // restcountries.com — free, no auth, returns rich country data
            const data = await this._fetch(
                `https://restcountries.com/v3.1/alpha/${code}`,
                "RestCountries API"
            );

            // The API returns an array — we only need the first result
            const country = Array.isArray(data) ? data[0] : data;

            if (!country) throw new Error(`Country not found: ${code}`);

            // Pull out just what's useful for a payment system
            const currencies = country.currencies
                ? Object.entries(country.currencies).map(([currCode, curr]) => ({
                    code:   currCode,
                    name:   curr.name,
                    symbol: curr.symbol,
                }))
                : [];

            const result = {
                code:        code,
                name:        country.name?.common || code,
                officialName: country.name?.official || code,
                region:      country.region,
                subregion:   country.subregion,
                capital:     country.capital?.[0] || null,
                currencies,
                callingCode: country.idd?.root
                    ? `${country.idd.root}${(country.idd.suffixes || [])[0] || ""}`
                    : null,
                flag:        country.flag || null,
                flagUrl:     country.flags?.png || null,
                population:  country.population || null,
            };

            await this.redis.setex(cacheKey, CACHE_TTL.country, JSON.stringify(result));

            return { ...result, cached: false };
        } catch (error) {
            logger.error("Country info fetch failed:", { countryCode: code, error: error.message });
            throw error;
        }
    }

    // Get a list of countries — useful for populating dropdowns in the frontend
    async getSupportedCountries() {
        const cacheKey = "pubapi:countries:list";

        const cached = await this.redis.get(cacheKey);
        if (cached) {
            return { countries: JSON.parse(cached), cached: true };
        }

        try {
            // Only fetch the fields we actually need — keeps the response small
            const data = await this._fetch(
                "https://restcountries.com/v3.1/all?fields=name,cca2,flag,currencies,region",
                "RestCountries API"
            );

            const countries = data
                .map((c) => ({
                    code:       c.cca2,
                    name:       c.name?.common,
                    flag:       c.flag,
                    region:     c.region,
                    currencies: c.currencies ? Object.keys(c.currencies) : [],
                }))
                .sort((a, b) => a.name?.localeCompare(b.name));

            await this.redis.setex(cacheKey, CACHE_TTL.country, JSON.stringify(countries));

            return { countries, cached: false };
        } catch (error) {
            logger.error("Countries list fetch failed:", error.message);
            throw error;
        }
    }

    // ─── 3. Crypto Prices (CoinGecko) ─────────────────────────────────────────
    // Free public API, no key required for basic endpoints.
    // Useful for showing crypto equivalent of payout amounts.

    async getCryptoPrices(coins = ["bitcoin", "ethereum", "tether", "usd-coin"]) {
        const cacheKey = `pubapi:crypto:${coins.sort().join(",")}`;

        const cached = await this.redis.get(cacheKey);
        if (cached) {
            return { ...JSON.parse(cached), cached: true };
        }

        try {
            const ids = coins.join(",");

            // CoinGecko free tier — no API key needed for this endpoint
            const data = await this._fetch(
                `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
                "CoinGecko API"
            );

            const prices = Object.entries(data).map(([id, info]) => ({
                id,
                priceUSD:      info.usd,
                change24h:     info.usd_24h_change
                    ? parseFloat(info.usd_24h_change.toFixed(2))
                    : null,
            }));

            const result = {
                prices,
                fetchedAt: new Date().toISOString(),
                cached:    false,
            };

            // Cache for 5 minutes — crypto prices move fast
            await this.redis.setex(cacheKey, CACHE_TTL.crypto, JSON.stringify(result));

            return result;
        } catch (error) {
            logger.error("Crypto prices fetch failed:", error.message);
            throw error;
        }
    }

    // Convert a fiat amount to its crypto equivalent
    async convertToCrypto(amountUSD, coinId = "bitcoin") {
        const prices = await this.getCryptoPrices([coinId]);
        const coin = prices.prices.find((p) => p.id === coinId);

        if (!coin) throw new Error(`Coin not found: ${coinId}`);

        const cryptoAmount = parseFloat((amountUSD / coin.priceUSD).toFixed(8));

        return {
            amountUSD,
            coinId,
            priceUSD:    coin.priceUSD,
            cryptoAmount,
            change24h:   coin.change24h,
            fetchedAt:   prices.fetchedAt,
            cached:      prices.cached,
        };
    }
}

export default PublicApiService;
