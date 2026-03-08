import { describe, it, expect } from 'bun:test';
import { LoginSchema } from './types';

describe('LoginSchema Validation', () => {
  it('should validate valid inputs', () => {
    const validData = {
      username: 'validUser',
      password: 'validPassword123',
    };
    const result = LoginSchema.safeParse(validData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validData);
    }
  });

  it('should reject empty username', () => {
    const invalidData = {
      username: '',
      password: 'validPassword123',
    };
    const result = LoginSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const usernameError = result.error.issues.find((issue) => issue.path.includes('username'));
      expect(usernameError).toBeDefined();
      expect(usernameError?.code).toBe('too_small');
    }
  });

  it('should reject username longer than 120 characters', () => {
    const invalidData = {
      username: 'a'.repeat(121),
      password: 'validPassword123',
    };
    const result = LoginSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const usernameError = result.error.issues.find((issue) => issue.path.includes('username'));
      expect(usernameError).toBeDefined();
      expect(usernameError?.code).toBe('too_big');
    }
  });

  it('should reject empty password', () => {
    const invalidData = {
      username: 'validUser',
      password: '',
    };
    const result = LoginSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const passwordError = result.error.issues.find((issue) => issue.path.includes('password'));
      expect(passwordError).toBeDefined();
      expect(passwordError?.code).toBe('too_small');
    }
  });

  it('should reject password longer than 256 characters', () => {
    const invalidData = {
      username: 'validUser',
      password: 'a'.repeat(257),
    };
    const result = LoginSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const passwordError = result.error.issues.find((issue) => issue.path.includes('password'));
      expect(passwordError).toBeDefined();
      expect(passwordError?.code).toBe('too_big');
    }
  });

  it('should reject missing fields', () => {
    const invalidData = {
      username: 'validUser',
      // password missing
    };
    const result = LoginSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const passwordError = result.error.issues.find((issue) => issue.path.includes('password'));
      expect(passwordError).toBeDefined();
      expect(passwordError?.code).toBe('invalid_type'); // missing field results in invalid_type (required)
    }
  });

  it('should reject invalid types', () => {
    const invalidData = {
      username: 12345, // invalid type
      password: 'validPassword123',
    };
    const result = LoginSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const usernameError = result.error.issues.find((issue) => issue.path.includes('username'));
      expect(usernameError).toBeDefined();
      expect(usernameError?.code).toBe('invalid_type');
    }
  });
});
