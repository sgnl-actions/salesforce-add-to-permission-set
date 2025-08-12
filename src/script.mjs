/**
 * Salesforce Add to Permission Set Action
 *
 * Adds a user to a permission set in Salesforce using a two-step process:
 * 1. Query for the user by username to get their user ID
 * 2. Create a permission set assignment
 */

/**
 * Helper function to find user by username
 * @param {string} username - Salesforce username
 * @param {string} instanceUrl - Salesforce instance URL
 * @param {string} accessToken - Salesforce access token
 * @param {string} apiVersion - Salesforce API version
 * @returns {Promise<Response>} API response
 */
async function findUserByUsername(username, instanceUrl, accessToken, apiVersion) {
  const encodedUsername = encodeURIComponent(username);
  const query = `SELECT+Id+FROM+User+WHERE+Username+LIKE+'${encodedUsername}'+ORDER+BY+Id+ASC`;
  const url = new URL(`/services/data/${apiVersion}/query?q=${query}`, instanceUrl);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  return response;
}

/**
 * Helper function to create permission set assignment
 * @param {string} userId - Salesforce user ID
 * @param {string} permissionSetId - Permission set ID
 * @param {string} instanceUrl - Salesforce instance URL
 * @param {string} accessToken - Salesforce access token
 * @param {string} apiVersion - Salesforce API version
 * @returns {Promise<Response>} API response
 */
async function createPermissionSetAssignment(userId, permissionSetId, instanceUrl, accessToken, apiVersion) {
  const url = new URL(`/services/data/${apiVersion}/sobjects/PermissionSetAssignment`, instanceUrl);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      AssigneeId: userId,
      PermissionSetId: permissionSetId
    })
  });

  return response;
}

export default {
  /**
   * Main execution handler - adds user to permission set
   * @param {Object} params - Job input parameters
   * @param {string} params.username - Salesforce username
   * @param {string} params.permissionSetId - Permission set ID
   * @param {string} params.apiVersion - API version (optional, defaults to v61.0)
   * @param {Object} context - Execution context with env, secrets, outputs
   * @returns {Object} Job results
   */
  invoke: async (params, context) => {
    console.log('Starting Salesforce permission set assignment');

    // Validate required parameters
    const { username, permissionSetId, apiVersion = 'v61.0' } = params;

    if (!username) {
      throw new Error('username is required');
    }

    if (!permissionSetId) {
      throw new Error('permissionSetId is required');
    }

    // Validate required secrets and environment
    if (!context.secrets?.SALESFORCE_ACCESS_TOKEN) {
      throw new Error('SALESFORCE_ACCESS_TOKEN secret is required');
    }

    if (!context.environment?.SALESFORCE_INSTANCE_URL) {
      throw new Error('SALESFORCE_INSTANCE_URL environment variable is required');
    }

    const { SALESFORCE_ACCESS_TOKEN } = context.secrets;
    const { SALESFORCE_INSTANCE_URL } = context.environment;

    console.log(`Adding user ${username} to permission set ${permissionSetId}`);

    // Step 1: Find user by username
    console.log('Step 1: Finding user by username');
    const userResponse = await findUserByUsername(username, SALESFORCE_INSTANCE_URL, SALESFORCE_ACCESS_TOKEN, apiVersion);

    if (!userResponse.ok) {
      throw new Error(`Failed to query user ${username}: ${userResponse.status} ${userResponse.statusText}`);
    }

    const userResult = await userResponse.json();

    if (!userResult.records || userResult.records.length === 0) {
      throw new Error(`User not found: ${username}`);
    }

    const userId = userResult.records[0].Id;
    console.log(`Found user ID: ${userId}`);

    // Step 2: Create permission set assignment
    console.log('Step 2: Creating permission set assignment');
    const assignmentResponse = await createPermissionSetAssignment(
      userId,
      permissionSetId,
      SALESFORCE_INSTANCE_URL,
      SALESFORCE_ACCESS_TOKEN,
      apiVersion
    );

    let assignmentId = null;

    if (assignmentResponse.status === 201) {
      // Successfully created new assignment
      const assignmentResult = await assignmentResponse.json();
      assignmentId = assignmentResult.id;
      console.log(`Successfully created permission set assignment: ${assignmentId}`);
    } else if (assignmentResponse.status === 400) {
      // Check if it's a duplicate assignment error
      const errorResult = await assignmentResponse.json();
      const isDuplicateError = errorResult.some(error =>
        error.errorCode === 'DUPLICATE_VALUE' ||
        error.message?.toLowerCase().includes('duplicate')
      );

      if (isDuplicateError) {
        console.log('User already has this permission set - treating as success');
      } else {
        throw new Error(`Failed to create permission set assignment: ${errorResult[0]?.message || 'Unknown error'}`);
      }
    } else {
      throw new Error(`Failed to create permission set assignment: ${assignmentResponse.status} ${assignmentResponse.statusText}`);
    }

    console.log(`Successfully processed permission set assignment for user ${username}`);

    return {
      status: 'success',
      username: username,
      userId: userId,
      permissionSetId: permissionSetId,
      assignmentId: assignmentId
    };
  },

  /**
   * Error recovery handler
   * @param {Object} params - Original params plus error information
   * @param {Object} context - Execution context
   * @returns {Object} Recovery results
   */
  error: async (params, _context) => {
    const { error } = params;
    console.error(`Error in permission set assignment: ${error.message}`);

    // Check for retryable errors (rate limits, server errors)
    if (error.message.includes('429') ||
        error.message.includes('502') ||
        error.message.includes('503') ||
        error.message.includes('504')) {

      console.log('Retryable error detected, waiting before retry');
      // In production: await new Promise(resolve => setTimeout(resolve, 5000));

      // Let the framework retry
      return { status: 'retry_requested' };
    }

    // Fatal errors (auth, validation) should not retry
    if (error.message.includes('401') ||
        error.message.includes('403') ||
        error.message.includes('is required') ||
        error.message.includes('not found')) {
      throw error;
    }

    // Default: let framework retry
    return { status: 'retry_requested' };
  },

  /**
   * Graceful shutdown handler
   * @param {Object} params - Original params plus halt reason
   * @param {Object} context - Execution context
   * @returns {Object} Cleanup results
   */
  halt: async (params, _context) => {
    const { reason, username } = params;
    console.log(`Permission set assignment halted (${reason}) for user ${username || 'unknown'}`);

    return {
      status: 'halted',
      username: username || 'unknown',
      reason: reason,
      halted_at: new Date().toISOString()
    };
  }
};