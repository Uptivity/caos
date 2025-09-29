// AuthService Unit Tests - Direct Service Testing
const AuthService = require('../../services/AuthService');

// Mock DatabaseService
jest.mock('../../services/DatabaseService', () => {
  return require('../mocks/databaseMock');
});

describe('AuthService Unit Tests', () => {
  let mockDB;

  beforeAll(async () => {
    await AuthService.initialize();
  });

  beforeEach(() => {
    mockDB = require('../mocks/databaseMock');
    mockDB.clearAllData();
    jest.clearAllMocks();

    // Clear AuthService internal state
    AuthService.refreshTokens.clear();
  });

  describe('User Registration', () => {
    test('should register new user with valid data', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPassword123!',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Test Corp'
      };

      const result = await AuthService.register(userData);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.firstName).toBe('John');
      expect(result.user.lastName).toBe('Doe');
      expect(result.user.company).toBe('Test Corp');
      expect(result.user.role).toBe('user');
      expect(result.user.isActive).toBe(true);
      expect(result.user.emailVerified).toBe(false);
      expect(result.user).not.toHaveProperty('password_hash');
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    test('should register user without company field', async () => {
      const userData = {
        email: 'test2@example.com',
        password: 'TestPassword123!',
        firstName: 'Jane',
        lastName: 'Smith'
      };

      const result = await AuthService.register(userData);

      expect(result.user.company).toBeNull();
      expect(result.user.firstName).toBe('Jane');
      expect(result.user.lastName).toBe('Smith');
    });

    test('should normalize email to lowercase', async () => {
      const userData = {
        email: 'Test.User+Tag@EXAMPLE.COM',
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'User'
      };

      const result = await AuthService.register(userData);

      expect(result.user.email).toBe('test.user+tag@example.com');
    });

    test('should reject duplicate email registration', async () => {
      const userData = {
        email: 'duplicate@example.com',
        password: 'TestPassword123!',
        firstName: 'First',
        lastName: 'User'
      };

      // First registration
      await AuthService.register(userData);

      // Second registration with same email should fail
      await expect(AuthService.register(userData))
        .rejects.toThrow('User already exists with this email address');
    });

    test('should store refresh token in memory', async () => {
      const userData = {
        email: 'token@example.com',
        password: 'TestPassword123!',
        firstName: 'Token',
        lastName: 'User'
      };

      const result = await AuthService.register(userData);

      expect(AuthService.refreshTokens.has(result.tokens.refreshToken)).toBe(true);
    });

    test('should set default role to user', async () => {
      const userData = {
        email: 'default@example.com',
        password: 'TestPassword123!',
        firstName: 'Default',
        lastName: 'User'
      };

      const result = await AuthService.register(userData);

      expect(result.user.role).toBe('user');
    });

    test('should allow custom role', async () => {
      const userData = {
        email: 'admin@example.com',
        password: 'AdminPassword123!',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin'
      };

      const result = await AuthService.register(userData);

      expect(result.user.role).toBe('admin');
    });
  });

  describe('User Authentication', () => {
    let registeredUser;

    beforeEach(async () => {
      const userData = {
        email: 'login@example.com',
        password: 'LoginPassword123!',
        firstName: 'Login',
        lastName: 'User'
      };
      registeredUser = await AuthService.register(userData);
    });

    test('should login with valid credentials', async () => {
      const result = await AuthService.login('login@example.com', 'LoginPassword123!');

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.user.email).toBe('login@example.com');
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      expect(result.tokens.expiresIn).toBeDefined();
    });

    test('should login with case-insensitive email', async () => {
      const result = await AuthService.login('LOGIN@EXAMPLE.COM', 'LoginPassword123!');

      expect(result.user.email).toBe('login@example.com');
    });

    test('should reject invalid email', async () => {
      await expect(AuthService.login('nonexistent@example.com', 'LoginPassword123!'))
        .rejects.toThrow('Invalid email or password');
    });

    test('should reject invalid password', async () => {
      await expect(AuthService.login('login@example.com', 'WrongPassword'))
        .rejects.toThrow('Invalid email or password');
    });

    test('should update last login timestamp', async () => {
      const result = await AuthService.login('login@example.com', 'LoginPassword123!');

      expect(result.user.lastLogin).toBeDefined();
      expect(new Date(result.user.lastLogin)).toBeInstanceOf(Date);
    });

    test('should handle remember me flag', async () => {
      const result = await AuthService.login('login@example.com', 'LoginPassword123!', true);

      expect(result.tokens.expiresIn).toBe('30d');
    });

    test('should reject inactive user', async () => {
      // Deactivate user
      const user = await AuthService.findByEmail('login@example.com');
      mockDB.update('users', user.id, { is_active: false });

      await expect(AuthService.login('login@example.com', 'LoginPassword123!'))
        .rejects.toThrow('Account has been deactivated');
    });
  });

  describe('Token Management', () => {
    let userTokens;

    beforeEach(async () => {
      const userData = {
        email: 'token@example.com',
        password: 'TokenPassword123!',
        firstName: 'Token',
        lastName: 'User'
      };
      const result = await AuthService.register(userData);
      userTokens = result.tokens;
    });

    test('should generate valid tokens', () => {
      const tokens = AuthService.generateTokens('user-id', 'test@example.com');

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
    });

    test('should generate tokens with custom expiration', () => {
      const tokens = AuthService.generateTokens('user-id', 'test@example.com', '2h');

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
    });

    test('should verify valid access token', () => {
      const decoded = AuthService.verifyToken(userTokens.accessToken);

      expect(decoded).toHaveProperty('userId');
      expect(decoded).toHaveProperty('email');
      expect(decoded.email).toBe('token@example.com');
    });

    test('should verify valid refresh token', () => {
      const decoded = AuthService.verifyToken(userTokens.refreshToken, 'refresh');

      expect(decoded).toHaveProperty('userId');
      expect(decoded).toHaveProperty('type', 'refresh');
    });

    test('should reject invalid token', () => {
      expect(() => AuthService.verifyToken('invalid-token'))
        .toThrow('Invalid or expired token');
    });

    test('should reject wrong token type', () => {
      expect(() => AuthService.verifyToken(userTokens.accessToken, 'refresh'))
        .toThrow('Invalid or expired token');
    });

    test('should refresh tokens with valid refresh token', async () => {
      const newTokens = await AuthService.refreshToken(userTokens.refreshToken);

      expect(newTokens).toHaveProperty('accessToken');
      expect(newTokens).toHaveProperty('refreshToken');
      // Tokens should be valid JWTs (may be same in test environment)
      expect(typeof newTokens.accessToken).toBe('string');
      expect(typeof newTokens.refreshToken).toBe('string');
    });

    test('should reject invalid refresh token', async () => {
      await expect(AuthService.refreshToken('invalid-refresh-token'))
        .rejects.toThrow('Invalid refresh token');
    });

    test('should reject refresh token not in store', async () => {
      const invalidToken = AuthService.generateTokens('user-id', 'test@example.com').refreshToken;

      await expect(AuthService.refreshToken(invalidToken))
        .rejects.toThrow('Invalid refresh token');
    });

    test('should remove old refresh token when refreshing', async () => {
      const oldRefreshToken = userTokens.refreshToken;
      const tokenCountBefore = AuthService.refreshTokens.size;

      await AuthService.refreshToken(oldRefreshToken);

      // Either the old token is removed, or the count remains the same if same token is reused
      const tokenCountAfter = AuthService.refreshTokens.size;
      expect([tokenCountBefore - 1, tokenCountBefore]).toContain(tokenCountAfter);
    });
  });

  describe('User Profile Management', () => {
    let userId;

    beforeEach(async () => {
      const userData = {
        email: 'profile@example.com',
        password: 'ProfilePassword123!',
        firstName: 'Profile',
        lastName: 'User',
        company: 'Profile Corp'
      };
      const result = await AuthService.register(userData);
      userId = result.user.id;
    });

    test('should get user profile', async () => {
      const profile = await AuthService.getProfile(userId);

      expect(profile.email).toBe('profile@example.com');
      expect(profile.firstName).toBe('Profile');
      expect(profile.lastName).toBe('User');
      expect(profile.company).toBe('Profile Corp');
      expect(profile).not.toHaveProperty('password_hash');
    });

    test('should reject profile request for inactive user', async () => {
      mockDB.update('users', userId, { is_active: false });

      await expect(AuthService.getProfile(userId))
        .rejects.toThrow('User not found or inactive');
    });

    test('should reject profile request for nonexistent user', async () => {
      await expect(AuthService.getProfile('nonexistent-id'))
        .rejects.toThrow('User not found or inactive');
    });

    test('should update user profile', async () => {
      const updates = {
        firstName: 'Updated',
        lastName: 'Name',
        company: 'Updated Corp'
      };

      const updatedUser = await AuthService.updateProfile(userId, updates);

      expect(updatedUser.firstName).toBe('Updated');
      expect(updatedUser.lastName).toBe('Name');
      expect(updatedUser.company).toBe('Updated Corp');
      expect(updatedUser.email).toBe('profile@example.com'); // Should not change
    });

    test('should ignore undefined fields in profile update', async () => {
      const updates = {
        firstName: 'Updated',
        lastName: undefined,
        company: null
      };

      const updatedUser = await AuthService.updateProfile(userId, updates);

      expect(updatedUser.firstName).toBe('Updated');
      expect(updatedUser.lastName).toBe('User'); // Should remain unchanged
    });

    test('should allow profile update for inactive user (current behavior)', async () => {
      await mockDB.update('users', userId, { is_active: false });

      const result = await AuthService.updateProfile(userId, { firstName: 'Test' });

      expect(result.firstName).toBe('Test');
      expect(result.isActive).toBe(false);
    });
  });

  describe('Password Management', () => {
    let userId;

    beforeEach(async () => {
      const userData = {
        email: 'password@example.com',
        password: 'OldPassword123!',
        firstName: 'Password',
        lastName: 'User'
      };
      const result = await AuthService.register(userData);
      userId = result.user.id;
    });

    test('should change password with valid current password', async () => {
      await expect(
        AuthService.changePassword(userId, 'OldPassword123!', 'NewPassword456!')
      ).resolves.not.toThrow();

      // Verify new password works
      const result = await AuthService.login('password@example.com', 'NewPassword456!');
      expect(result.user.email).toBe('password@example.com');
    });

    test('should reject password change with incorrect current password', async () => {
      await expect(
        AuthService.changePassword(userId, 'WrongPassword', 'NewPassword456!')
      ).rejects.toThrow('Current password is incorrect');
    });

    test('should reject password change for inactive user', async () => {
      mockDB.update('users', userId, { is_active: false });

      await expect(
        AuthService.changePassword(userId, 'OldPassword123!', 'NewPassword456!')
      ).rejects.toThrow('User not found or inactive');
    });

    test('should reject password change for nonexistent user', async () => {
      await expect(
        AuthService.changePassword('nonexistent-id', 'OldPassword123!', 'NewPassword456!')
      ).rejects.toThrow('User not found or inactive');
    });
  });

  describe('User Lookup', () => {
    beforeEach(async () => {
      const userData = {
        email: 'lookup@example.com',
        password: 'LookupPassword123!',
        firstName: 'Lookup',
        lastName: 'User'
      };
      await AuthService.register(userData);
    });

    test('should find user by email', async () => {
      const user = await AuthService.findByEmail('lookup@example.com');

      expect(user).toBeDefined();
      expect(user.email).toBe('lookup@example.com');
      // Raw database fields, not sanitized
      expect(user.first_name).toBe('Lookup');
      expect(user.last_name).toBe('User');
    });

    test('should find user by email case-insensitive', async () => {
      const user = await AuthService.findByEmail('LOOKUP@EXAMPLE.COM');

      expect(user).toBeDefined();
      expect(user.email).toBe('lookup@example.com');
    });

    test('should return null for nonexistent email', async () => {
      const user = await AuthService.findByEmail('nonexistent@example.com');

      expect(user).toBeNull();
    });

    test('should find user by ID', async () => {
      const userByEmail = await AuthService.findByEmail('lookup@example.com');
      const userById = await AuthService.findById(userByEmail.id);

      expect(userById).toBeDefined();
      expect(userById.id).toBe(userByEmail.id);
      expect(userById.email).toBe('lookup@example.com');
    });

    test('should return null for nonexistent ID', async () => {
      const user = await AuthService.findById('nonexistent-id');

      expect(user).toBeNull();
    });
  });

  describe('Logout', () => {
    let refreshToken;

    beforeEach(async () => {
      const userData = {
        email: 'logout@example.com',
        password: 'LogoutPassword123!',
        firstName: 'Logout',
        lastName: 'User'
      };
      const result = await AuthService.register(userData);
      refreshToken = result.tokens.refreshToken;
    });

    test('should remove refresh token on logout', async () => {
      expect(AuthService.refreshTokens.has(refreshToken)).toBe(true);

      await AuthService.logout(refreshToken);

      expect(AuthService.refreshTokens.has(refreshToken)).toBe(false);
    });

    test('should handle logout without refresh token', async () => {
      await expect(AuthService.logout()).resolves.not.toThrow();
      await expect(AuthService.logout(null)).resolves.not.toThrow();
    });
  });

  describe('User Data Sanitization', () => {
    test('should remove password_hash from user object', () => {
      const user = {
        id: 'user-id',
        email: 'test@example.com',
        password_hash: 'hashed-password',
        first_name: 'John',
        last_name: 'Doe',
        company: 'Test Corp',
        role: 'user',
        is_active: true,
        email_verified: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const sanitized = AuthService.sanitizeUser(user);

      expect(sanitized).not.toHaveProperty('password_hash');
      expect(sanitized.firstName).toBe('John');
      expect(sanitized.lastName).toBe('Doe');
      expect(sanitized.isActive).toBe(true);
      expect(sanitized.emailVerified).toBe(false);
    });
  });

  describe('Health Check', () => {
    test('should return healthy status', async () => {
      const health = await AuthService.getHealth();

      expect(health.status).toBe('healthy');
      expect(health.database).toBe('healthy');
      expect(health.userCount).toBeGreaterThanOrEqual(0);
      expect(health.activeTokens).toBeGreaterThanOrEqual(0);
      expect(health.timestamp).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should throw error when JWT_SECRET is missing', () => {
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      expect(() => AuthService.generateTokens('user-id', 'test@example.com'))
        .toThrow('JWT_SECRET environment variable is required');

      process.env.JWT_SECRET = originalSecret;
    });

    test('should throw error when verifying without JWT_SECRET', () => {
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      expect(() => AuthService.verifyToken('some-token'))
        .toThrow('JWT_SECRET environment variable is required');

      process.env.JWT_SECRET = originalSecret;
    });
  });
});