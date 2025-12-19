import script from '../src/script.mjs';

describe('Salesforce Add to Permission Set Script', () => {
  let mockResponses;
  let originalConsole;

  beforeAll(() => {
    originalConsole = { log: console.log, error: console.error };

    // Simple fetch mock that uses responses in order
    global.fetch = (_url, _options) => {
      const response = mockResponses.shift();
      return Promise.resolve(response);
    };
  });

  const mockContext = {
    environment: {
      ADDRESS: 'https://test.my.salesforce.com'
    },
    secrets: {
      BEARER_AUTH_TOKEN: 'test-access-token'
    }
  };

  beforeEach(() => {
    mockResponses = [];
    console.log = () => {};
    console.error = () => {};
  });

  afterAll(() => {
    console.log = originalConsole.log;
    console.error = originalConsole.error;
  });

  describe('invoke handler', () => {
    test('should successfully add user to permission set', async () => {
      const params = {
        username: 'test.user@example.com',
        permissionSetId: '0PS000000000001'
      };

      // Mock user query response (first call)
      mockResponses.push({
        ok: true,
        json: async () => ({
          records: [{ Id: '005000000000001' }]
        })
      });

      // Mock permission set assignment response (second call)
      mockResponses.push({
        status: 201,
        json: async () => ({ id: 'PSA000000000001' })
      });

      const result = await script.invoke(params, mockContext);

      expect(result.status).toBe('success');
      expect(result.username).toBe('test.user@example.com');
      expect(result.userId).toBe('005000000000001');
      expect(result.permissionSetId).toBe('0PS000000000001');
      expect(result.assignmentId).toBe('PSA000000000001');
    });

    test('should handle duplicate assignment (400 error)', async () => {
      const params = {
        username: 'existing.user@example.com',
        permissionSetId: '0PS000000000001'
      };

      // Mock user query response
      mockResponses.push({
        ok: true,
        json: async () => ({
          records: [{ Id: '005000000000002' }]
        })
      });

      // Mock duplicate assignment error
      mockResponses.push({
        status: 400,
        json: async () => ([{
          errorCode: 'DUPLICATE_VALUE',
          message: 'Duplicate permission set assignment'
        }])
      });

      const result = await script.invoke(params, mockContext);

      expect(result.status).toBe('success');
      expect(result.username).toBe('existing.user@example.com');
      expect(result.userId).toBe('005000000000002');
      expect(result.permissionSetId).toBe('0PS000000000001');
      expect(result.assignmentId).toBeNull();
    });

    test('should URL encode username in query', async () => {
      const params = {
        username: 'test+user@example.com',
        permissionSetId: '0PS000000000001'
      };

      // Mock user query response
      mockResponses.push({
        ok: true,
        json: async () => ({
          records: [{ Id: '005000000000001' }]
        })
      });

      // Mock permission set assignment response
      mockResponses.push({
        status: 201,
        json: async () => ({ id: 'PSA000000000001' })
      });

      const result = await script.invoke(params, mockContext);

      expect(result.status).toBe('success');
      expect(result.username).toBe('test+user@example.com');
    });


    test('should throw error for missing authentication', async () => {
      const params = {
        username: 'test.user@example.com',
        permissionSetId: '0PS000000000001'
      };

      const contextNoAuth = {
        environment: { ADDRESS: 'https://test.my.salesforce.com' },
        secrets: {}
      };

      await expect(script.invoke(params, contextNoAuth)).rejects.toThrow('No authentication configured');
    });

    test('should throw error for missing instance URL', async () => {
      const params = {
        username: 'test.user@example.com',
        permissionSetId: '0PS000000000001'
      };

      const contextNoUrl = {
        environment: {},
        secrets: { BEARER_AUTH_TOKEN: 'test-token' }
      };

      await expect(script.invoke(params, contextNoUrl)).rejects.toThrow('No URL specified. Provide address parameter or ADDRESS environment variable');
    });

    test('should throw error when user not found', async () => {
      const params = {
        username: 'nonexistent.user@example.com',
        permissionSetId: '0PS000000000001'
      };

      // Mock empty user query response
      mockResponses.push({
        ok: true,
        json: async () => ({ records: [] })
      });

      await expect(script.invoke(params, mockContext)).rejects.toThrow('User not found: nonexistent.user@example.com');
    });

    test('should throw error when user query fails', async () => {
      const params = {
        username: 'test.user@example.com',
        permissionSetId: '0PS000000000001'
      };

      // Mock failed user query
      mockResponses.push({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      });

      await expect(script.invoke(params, mockContext)).rejects.toThrow('Failed to query user test.user@example.com: 401 Unauthorized');
    });

    test('should throw error for non-duplicate 400 error', async () => {
      const params = {
        username: 'test.user@example.com',
        permissionSetId: '0PS000000000001'
      };

      // Mock user query response
      mockResponses.push({
        ok: true,
        json: async () => ({
          records: [{ Id: '005000000000001' }]
        })
      });

      // Mock non-duplicate 400 error
      mockResponses.push({
        status: 400,
        json: async () => ([{
          errorCode: 'REQUIRED_FIELD_MISSING',
          message: 'Missing required field'
        }])
      });

      await expect(script.invoke(params, mockContext)).rejects.toThrow('Failed to create permission set assignment: Missing required field');
    });

    test('should throw error for assignment creation failure', async () => {
      const params = {
        username: 'test.user@example.com',
        permissionSetId: '0PS000000000001'
      };

      // Mock user query response
      mockResponses.push({
        ok: true,
        json: async () => ({
          records: [{ Id: '005000000000001' }]
        })
      });

      // Mock assignment creation failure
      mockResponses.push({
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(script.invoke(params, mockContext)).rejects.toThrow('Failed to create permission set assignment: 500 Internal Server Error');
    });
  });

  describe('error handler', () => {
    test('should rethrow error', async () => {
      const originalError = new Error('Test error');
      const params = {
        error: originalError
      };

      await expect(script.error(params, mockContext)).rejects.toThrow(originalError);
    });
  });

  describe('halt handler', () => {
    test('should handle graceful shutdown with username', async () => {
      const params = {
        username: 'test.user@example.com',
        reason: 'timeout'
      };

      const result = await script.halt(params, mockContext);

      expect(result.status).toBe('halted');
      expect(result.username).toBe('test.user@example.com');
      expect(result.reason).toBe('timeout');
      expect(result.halted_at).toBeDefined();
    });

    test('should handle halt without username', async () => {
      const params = {
        reason: 'system_shutdown'
      };

      const result = await script.halt(params, mockContext);

      expect(result.status).toBe('halted');
      expect(result.username).toBe('unknown');
      expect(result.reason).toBe('system_shutdown');
    });
  });
});