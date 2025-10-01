// PII Protection Middleware
// Protects personally identifiable information in logs and responses

const { logger } = require('../utils/secureLogger');

/**
 * PII Protection Middleware for Express applications
 * Sanitizes request/response data to prevent PII leaks in logs
 */
class PIIProtectionMiddleware {
    constructor() {
        // Define PII field patterns
        this.piiPatterns = [
            // Direct PII fields
            /^(password|passwd|pwd)$/i,
            /^(ssn|social_security_number)$/i,
            /^(credit_card|creditcard|cc_number)$/i,
            /^(bank_account|routing_number)$/i,
            /^(passport|passport_number)$/i,
            /^(driver_license|drivers_license)$/i,

            // Common variations
            /password/i,
            /secret/i,
            /token/i,
            /authorization/i,
            /cookie/i,
            /session/i,

            // Email and phone (partial masking)
            /email/i,
            /phone/i,
            /mobile/i,

            // Personal data
            /date_of_birth|dob|birthdate/i,
            /full_name|fullname/i,
            /address/i,
            /postal_code|zip_code/i
        ];

        // Email pattern for detection
        this.emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        // Phone pattern for detection
        this.phonePattern = /^[\+]?[\d\-\(\)\s]{10,}$/;

        // Credit card pattern
        this.ccPattern = /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/;

        // SSN pattern
        this.ssnPattern = /^\d{3}-?\d{2}-?\d{4}$/;
    }

    /**
     * Create middleware for request logging protection
     * @param {object} options - Middleware options
     * @returns {Function} Express middleware
     */
    createRequestLoggingProtection(options = {}) {
        const {
            logBody = false,
            logQuery = true,
            logHeaders = false,
            maskingChar = '*',
            partialMasking = true
        } = options;

        return (req, res, next) => {
            // Store original data
            const originalBody = req.body;
            const originalQuery = req.query;
            const originalHeaders = req.headers;

            // Create sanitized versions for logging
            if (logBody && req.body) {
                req.sanitizedBody = this.sanitizeObject(req.body, { maskingChar, partialMasking });
            }

            if (logQuery && req.query) {
                req.sanitizedQuery = this.sanitizeObject(req.query, { maskingChar, partialMasking });
            }

            if (logHeaders && req.headers) {
                req.sanitizedHeaders = this.sanitizeObject(req.headers, { maskingChar, partialMasking });
            }

            // Override console.log and logger to use sanitized data
            const originalLog = console.log;
            const originalLoggerInfo = logger.info;
            const originalLoggerError = logger.error;
            const originalLoggerDebug = logger.debug;

            const sanitizeLogData = (data) => {
                if (typeof data === 'object' && data !== null) {
                    return this.sanitizeObject(data, { maskingChar, partialMasking });
                }
                return data;
            };

            // Override logger methods temporarily
            logger.info = (...args) => {
                const sanitizedArgs = args.map(sanitizeLogData);
                originalLoggerInfo.apply(logger, sanitizedArgs);
            };

            logger.error = (...args) => {
                const sanitizedArgs = args.map(sanitizeLogData);
                originalLoggerError.apply(logger, sanitizedArgs);
            };

            logger.debug = (...args) => {
                const sanitizedArgs = args.map(sanitizeLogData);
                originalLoggerDebug.apply(logger, sanitizedArgs);
            };

            // Restore original methods after request
            res.on('finish', () => {
                logger.info = originalLoggerInfo;
                logger.error = originalLoggerError;
                logger.debug = originalLoggerDebug;
            });

            next();
        };
    }

    /**
     * Create middleware for response sanitization
     * @param {object} options - Middleware options
     * @returns {Function} Express middleware
     */
    createResponseSanitization(options = {}) {
        const {
            sanitizeResponses = true,
            maskingChar = '*',
            partialMasking = true,
            excludeRoutes = []
        } = options;

        return (req, res, next) => {
            // Check if route should be excluded
            if (excludeRoutes.some(route => req.path.match(route))) {
                return next();
            }

            if (!sanitizeResponses) {
                return next();
            }

            // Store original json method
            const originalJson = res.json;
            const self = this;

            // Override res.json to sanitize response
            res.json = function(obj) {
                if (obj && typeof obj === 'object') {
                    const sanitized = self.sanitizeResponseData(obj, { maskingChar, partialMasking });
                    return originalJson.call(res, sanitized);
                }
                return originalJson.call(res, obj);
            };

            next();
        };
    }

    /**
     * Sanitize object by masking PII fields
     * @param {*} obj - Object to sanitize
     * @param {object} options - Sanitization options
     * @returns {*} Sanitized object
     */
    sanitizeObject(obj, options = {}) {
        const { maskingChar = '*', partialMasking = true } = options;

        if (obj === null || obj === undefined) {
            return obj;
        }

        if (typeof obj !== 'object') {
            return this.sanitizeValue(obj, 'unknown', { maskingChar, partialMasking });
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.sanitizeObject(item, options));
        }

        const sanitized = {};

        for (const [key, value] of Object.entries(obj)) {
            if (this.isPIIField(key)) {
                sanitized[key] = this.sanitizeValue(value, key, { maskingChar, partialMasking });
            } else if (typeof value === 'object' && value !== null) {
                sanitized[key] = this.sanitizeObject(value, options);
            } else {
                // Still check value for PII patterns
                sanitized[key] = this.sanitizeValue(value, key, { maskingChar, partialMasking });
            }
        }

        return sanitized;
    }

    /**
     * Sanitize individual value based on key and content
     * @param {*} value - Value to sanitize
     * @param {string} key - Field key for context
     * @param {object} options - Sanitization options
     * @returns {*} Sanitized value
     */
    sanitizeValue(value, key, options = {}) {
        const { maskingChar = '*', partialMasking = true } = options;

        if (value === null || value === undefined) {
            return value;
        }

        const stringValue = String(value);

        // Full masking for sensitive fields
        if (this.isPIIField(key)) {
            if (key.toLowerCase().includes('password') ||
                key.toLowerCase().includes('secret') ||
                key.toLowerCase().includes('token')) {
                return '[REDACTED]';
            }

            // Partial masking for other PII
            if (partialMasking) {
                return this.applyPartialMasking(stringValue, maskingChar);
            } else {
                return '[REDACTED]';
            }
        }

        // Content-based detection
        if (this.emailPattern.test(stringValue)) {
            return partialMasking ? this.maskEmail(stringValue, maskingChar) : '[EMAIL_REDACTED]';
        }

        if (this.phonePattern.test(stringValue)) {
            return partialMasking ? this.maskPhone(stringValue, maskingChar) : '[PHONE_REDACTED]';
        }

        if (this.ccPattern.test(stringValue)) {
            return partialMasking ? this.maskCreditCard(stringValue, maskingChar) : '[CC_REDACTED]';
        }

        if (this.ssnPattern.test(stringValue)) {
            return partialMasking ? this.maskSSN(stringValue, maskingChar) : '[SSN_REDACTED]';
        }

        return value;
    }

    /**
     * Check if field key indicates PII
     * @param {string} key - Field key
     * @returns {boolean} True if PII field
     */
    isPIIField(key) {
        return this.piiPatterns.some(pattern => pattern.test(key));
    }

    /**
     * Apply partial masking to string
     * @param {string} str - String to mask
     * @param {string} maskingChar - Character to use for masking
     * @returns {string} Partially masked string
     */
    applyPartialMasking(str, maskingChar = '*') {
        if (str.length <= 4) {
            return maskingChar.repeat(str.length);
        }

        const visibleStart = Math.ceil(str.length * 0.2);
        const visibleEnd = Math.ceil(str.length * 0.2);
        const maskedLength = str.length - visibleStart - visibleEnd;

        return str.substring(0, visibleStart) +
               maskingChar.repeat(maskedLength) +
               str.substring(str.length - visibleEnd);
    }

    /**
     * Mask email address
     * @param {string} email - Email to mask
     * @param {string} maskingChar - Character to use for masking
     * @returns {string} Masked email
     */
    maskEmail(email, maskingChar = '*') {
        const [username, domain] = email.split('@');

        if (!domain) return this.applyPartialMasking(email, maskingChar);

        const maskedUsername = username.length > 2 ?
            username[0] + maskingChar.repeat(username.length - 2) + username[username.length - 1] :
            maskingChar.repeat(username.length);

        return `${maskedUsername}@${domain}`;
    }

    /**
     * Mask phone number
     * @param {string} phone - Phone to mask
     * @param {string} maskingChar - Character to use for masking
     * @returns {string} Masked phone
     */
    maskPhone(phone, maskingChar = '*') {
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length >= 10) {
            const lastFour = cleaned.slice(-4);
            const masked = maskingChar.repeat(cleaned.length - 4) + lastFour;
            return phone.replace(/\d/g, (match, index) => {
                const cleanedIndex = phone.substring(0, index + 1).replace(/\D/g, '').length - 1;
                return cleanedIndex < cleaned.length - 4 ? maskingChar : match;
            });
        }
        return this.applyPartialMasking(phone, maskingChar);
    }

    /**
     * Mask credit card number
     * @param {string} cc - Credit card number to mask
     * @param {string} maskingChar - Character to use for masking
     * @returns {string} Masked credit card
     */
    maskCreditCard(cc, maskingChar = '*') {
        const cleaned = cc.replace(/\D/g, '');
        if (cleaned.length >= 12) {
            const firstFour = cleaned.substring(0, 4);
            const lastFour = cleaned.slice(-4);
            const masked = firstFour + maskingChar.repeat(cleaned.length - 8) + lastFour;

            // Maintain original formatting
            let result = '';
            let maskedIndex = 0;
            for (let i = 0; i < cc.length; i++) {
                if (/\d/.test(cc[i])) {
                    result += masked[maskedIndex++];
                } else {
                    result += cc[i];
                }
            }
            return result;
        }
        return this.applyPartialMasking(cc, maskingChar);
    }

    /**
     * Mask SSN
     * @param {string} ssn - SSN to mask
     * @param {string} maskingChar - Character to use for masking
     * @returns {string} Masked SSN
     */
    maskSSN(ssn, maskingChar = '*') {
        const cleaned = ssn.replace(/\D/g, '');
        if (cleaned.length === 9) {
            const lastFour = cleaned.slice(-4);
            const masked = maskingChar.repeat(5) + lastFour;

            // Maintain formatting
            return ssn.replace(/\d/g, (match, index) => {
                const cleanedIndex = ssn.substring(0, index + 1).replace(/\D/g, '').length - 1;
                return cleanedIndex < 5 ? maskingChar : match;
            });
        }
        return this.applyPartialMasking(ssn, maskingChar);
    }

    /**
     * Sanitize response data (more conservative than request sanitization)
     * @param {*} data - Response data
     * @param {object} options - Sanitization options
     * @returns {*} Sanitized response data
     */
    sanitizeResponseData(data, options = {}) {
        // Response sanitization is usually more conservative
        // Only sanitize fields that are clearly sensitive
        return this.sanitizeObject(data, {
            ...options,
            partialMasking: false // Full redaction for responses
        });
    }

    /**
     * Create audit-safe data representation
     * @param {*} data - Data to make audit-safe
     * @returns {*} Audit-safe data
     */
    createAuditSafeData(data) {
        return this.sanitizeObject(data, {
            maskingChar: '[REDACTED]',
            partialMasking: false
        });
    }

    /**
     * Check if string contains PII
     * @param {string} str - String to check
     * @returns {boolean} True if contains PII
     */
    containsPII(str) {
        if (typeof str !== 'string') return false;

        return this.emailPattern.test(str) ||
               this.phonePattern.test(str) ||
               this.ccPattern.test(str) ||
               this.ssnPattern.test(str);
    }

    /**
     * Get PII detection report for data
     * @param {*} data - Data to analyze
     * @returns {object} PII detection report
     */
    getPIIReport(data) {
        const report = {
            hasPII: false,
            piiFields: [],
            piiTypes: {
                emails: 0,
                phones: 0,
                creditCards: 0,
                ssns: 0,
                passwords: 0,
                other: 0
            }
        };

        const analyzeObject = (obj, path = '') => {
            if (obj === null || obj === undefined) return;

            if (typeof obj !== 'object') {
                if (this.containsPII(String(obj))) {
                    report.hasPII = true;
                    report.piiFields.push(path);

                    const str = String(obj);
                    if (this.emailPattern.test(str)) report.piiTypes.emails++;
                    else if (this.phonePattern.test(str)) report.piiTypes.phones++;
                    else if (this.ccPattern.test(str)) report.piiTypes.creditCards++;
                    else if (this.ssnPattern.test(str)) report.piiTypes.ssns++;
                    else report.piiTypes.other++;
                }
                return;
            }

            if (Array.isArray(obj)) {
                obj.forEach((item, index) => {
                    analyzeObject(item, `${path}[${index}]`);
                });
                return;
            }

            for (const [key, value] of Object.entries(obj)) {
                const fieldPath = path ? `${path}.${key}` : key;

                if (this.isPIIField(key)) {
                    report.hasPII = true;
                    report.piiFields.push(fieldPath);

                    if (key.toLowerCase().includes('password')) {
                        report.piiTypes.passwords++;
                    } else {
                        report.piiTypes.other++;
                    }
                }

                analyzeObject(value, fieldPath);
            }
        };

        analyzeObject(data);
        return report;
    }
}

// Export singleton instance
const piiProtection = new PIIProtectionMiddleware();

module.exports = {
    PIIProtectionMiddleware,
    piiProtection,

    // Convenience middleware functions
    requestLoggingProtection: (options) => piiProtection.createRequestLoggingProtection(options),
    responseSanitization: (options) => piiProtection.createResponseSanitization(options),

    // Utility functions
    sanitizeForLogging: (data) => piiProtection.createAuditSafeData(data),
    containsPII: (str) => piiProtection.containsPII(str),
    getPIIReport: (data) => piiProtection.getPIIReport(data)
};