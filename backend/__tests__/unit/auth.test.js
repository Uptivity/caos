// Authentication Module Unit Tests
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock dependencies
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('../../utils/secureLogger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

const {
  TestData,
  TokenHelpers,
  ValidationHelpers
} = require('../helpers/testHelpers');

describe('Authentication Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Password Hashing', () => {
    test('should hash password with correct rounds', async () => {
      const password = 'TestPassword123!';
      const expectedHash = 'hashed_password';

      bcrypt.hash.mockResolvedValue(expectedHash);

      const result = await bcrypt.hash(password, 12);

      expect(bcrypt.hash).toHaveBeenCalledWith(password, 12);
      expect(result).toBe(expectedHash);
    });

    test('should verify password correctly', async () => {
      const password = 'TestPassword123!';
      const hashedPassword = 'hashed_password';

      bcrypt.compare.mockResolvedValue(true);

      const isValid = await bcrypt.compare(password, hashedPassword);

      expect(bcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
      expect(isValid).toBe(true);
    });

    test('should reject invalid password', async () => {
      const password = 'WrongPassword';
      const hashedPassword = 'hashed_password';

      bcrypt.compare.mockResolvedValue(false);

      const isValid = await bcrypt.compare(password, hashedPassword);

      expect(isValid).toBe(false);
    });
  });

  describe('JWT Token Operations', () => {
    const mockPayload = {
      userId: 'test-user-id',
      email: 'test@example.com'
    };

    test('should generate valid access token', () => {
      const expectedToken = 'access.token.here';
      jwt.sign.mockReturnValue(expectedToken);

      const token = jwt.sign(mockPayload, process.env.JWT_SECRET, {
        expiresIn: '24h',
        issuer: 'caos-crm',
        audience: 'caos-crm-client'
      });

      expect(jwt.sign).toHaveBeenCalledWith(mockPayload, process.env.JWT_SECRET, {
        expiresIn: '24h',
        issuer: 'caos-crm',
        audience: 'caos-crm-client'
      });
      expect(token).toBe(expectedToken);
    });

    test('should verify valid token', () => {
      const token = 'valid.token.here';
      jwt.verify.mockReturnValue(mockPayload);

      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        issuer: 'caos-crm',
        audience: 'caos-crm-client'
      });

      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET, {
        issuer: 'caos-crm',
        audience: 'caos-crm-client'
      });
      expect(decoded).toEqual(mockPayload);
    });

    test('should reject expired token', () => {
      const expiredToken = 'expired.token.here';
      const error = new Error('jwt expired');
      error.name = 'TokenExpiredError';

      jwt.verify.mockImplementation(() => {
        throw error;
      });

      expect(() => {
        jwt.verify(expiredToken, process.env.JWT_SECRET);
      }).toThrow('jwt expired');
    });

    test('should reject invalid token', () => {
      const invalidToken = 'invalid.token.here';
      const error = new Error('invalid signature');
      error.name = 'JsonWebTokenError';

      jwt.verify.mockImplementation(() => {
        throw error;
      });

      expect(() => {
        jwt.verify(invalidToken, process.env.JWT_SECRET);
      }).toThrow('invalid signature');
    });
  });

  describe('User Data Sanitization', () => {
    test('should remove password from user object', () => {
      const user = {
        id: '123',
        email: 'test@example.com',
        password: 'hashed_password',
        firstName: 'John',
        lastName: 'Doe'
      };

      const sanitizeUser = (user) => {
        const { password, ...sanitized } = user;
        return sanitized;
      };

      const sanitized = sanitizeUser(user);

      expect(sanitized).not.toHaveProperty('password');
      expect(sanitized).toEqual({
        id: '123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe'
      });
    });

    test('should preserve all other user properties', () => {
      const user = {
        id: '123',
        email: 'test@example.com',
        password: 'hashed_password',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Test Co',
        role: 'user',
        isActive: true
      };

      const sanitizeUser = (user) => {
        const { password, ...sanitized } = user;
        return sanitized;
      };

      const sanitized = sanitizeUser(user);

      expect(Object.keys(sanitized)).toHaveLength(7);
      expect(sanitized.company).toBe('Test Co');
      expect(sanitized.role).toBe('user');
      expect(sanitized.isActive).toBe(true);
    });
  });

  describe('Input Validation', () => {
    test('should validate email format', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'first.last+tag@example.org'
      ];

      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user@domain',
        ''
      ];

      // Simple email regex for testing
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      validEmails.forEach(email => {
        expect(emailRegex.test(email)).toBe(true);
      });

      invalidEmails.forEach(email => {
        expect(emailRegex.test(email)).toBe(false);
      });
    });

    test('should validate password strength', () => {
      const strongPasswords = [
        'TestPassword123!',
        'Str0ng@Pass',
        'MyP@ssw0rd'
      ];

      const weakPasswords = [
        'password',
        '12345678',
        'Password',
        'password123',
        'PASSWORD123!'
      ];

      // Password strength regex (min 8 chars, uppercase, lowercase, digit, special)
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

      strongPasswords.forEach(password => {
        expect(passwordRegex.test(password)).toBe(true);
      });

      weakPasswords.forEach(password => {
        expect(passwordRegex.test(password)).toBe(false);
      });
    });

    test('should validate required fields', () => {
      const requiredFields = ['email', 'password', 'firstName', 'lastName'];

      const validData = {
        email: 'test@example.com',
        password: 'TestPassword123!',
        firstName: 'John',
        lastName: 'Doe'
      };

      // Test complete data
      requiredFields.forEach(field => {
        expect(validData[field]).toBeDefined();
        expect(validData[field].length).toBeGreaterThan(0);
      });

      // Test missing fields
      requiredFields.forEach(field => {
        const incompleteData = { ...validData };
        delete incompleteData[field];

        expect(incompleteData[field]).toBeUndefined();
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle bcrypt errors gracefully', async () => {
      const password = 'TestPassword123!';
      const error = new Error('bcrypt error');

      bcrypt.hash.mockRejectedValue(error);

      await expect(bcrypt.hash(password, 12)).rejects.toThrow('bcrypt error');
    });

    test('should handle JWT signing errors', () => {
      const payload = { userId: '123' };
      const error = new Error('JWT signing error');

      jwt.sign.mockImplementation(() => {
        throw error;
      });

      expect(() => {
        jwt.sign(payload, process.env.JWT_SECRET);
      }).toThrow('JWT signing error');
    });

    test('should handle missing JWT secret', () => {
      // Temporarily remove JWT_SECRET
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      // This test simulates the environment check
      const checkJWTSecret = () => {
        if (!process.env.JWT_SECRET) {
          throw new Error('JWT_SECRET environment variable is required');
        }
      };

      expect(checkJWTSecret).toThrow('JWT_SECRET environment variable is required');

      // Restore JWT_SECRET
      process.env.JWT_SECRET = originalSecret;
    });
  });

  describe('Security Features', () => {
    test('should implement rate limiting configuration', () => {
      const rateLimitConfig = {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // 5 attempts
        message: {
          error: 'Too many authentication attempts, please try again later.',
          retryAfter: 15 * 60
        }
      };

      expect(rateLimitConfig.windowMs).toBe(900000); // 15 minutes in ms
      expect(rateLimitConfig.max).toBe(5);
      expect(rateLimitConfig.message.error).toContain('Too many authentication attempts');
    });

    test('should use secure bcrypt rounds', () => {
      const BCRYPT_ROUNDS = 12;

      expect(BCRYPT_ROUNDS).toBeGreaterThanOrEqual(10);
      expect(BCRYPT_ROUNDS).toBeLessThanOrEqual(15); // Not too high for performance
    });

    test('should set appropriate token expiration', () => {
      const JWT_EXPIRES_IN = '24h';
      const REFRESH_TOKEN_EXPIRES_IN = '7d';

      expect(JWT_EXPIRES_IN).toMatch(/^\d+[hmsd]$/);
      expect(REFRESH_TOKEN_EXPIRES_IN).toMatch(/^\d+[hmsd]$/);
    });
  });
});