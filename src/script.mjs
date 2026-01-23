/**
 * Salesforce Add to Permission Set Action
 *
 * Adds a user to a permission set in Salesforce using a two-step process:
 * 1. Query for the user by username to get their user ID
 * 2. Create a permission set assignment
 */

import { getBaseURL, getAuthorizationHeader} from '@sgnl-actions/utils';

/**
 * Helper function to find user by username
 * @param {string} username - Salesforce username
 * @param {string} baseUrl - Salesforce instance URL
 * @param {string} authHeader - Authorization header value
 * @returns {Promise<Response>} API response
 */
async function findUserByUsername(username, baseUrl, authHeader) {
  const encodedUsername = encodeURIComponent(username);
  const query = `SELECT+Id+FROM+User+WHERE+Username+LIKE+'${encodedUsername}'+ORDER+BY+Id+ASC`;
  const url = `${baseUrl}/services/data/v61.0/query?q=${query}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json'
    }
  });

  return response;
}

/**
 * Helper function to create permission set assignment
 * @param {string} userId - Salesforce user ID
 * @param {string} permissionSetId - Permission set ID
 * @param {string} baseUrl - Salesforce instance URL
 * @param {string} authHeader - Authorization header value
 * @returns {Promise<Response>} API response
 */
async function createPermissionSetAssignment(userId, permissionSetId, baseUrl, authHeader) {
  const url = `${baseUrl}/services/data/v61.0/sobjects/PermissionSetAssignment`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
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
   * @param {string} params.address - Optional Salesforce API base URL
   * @param {Object} context - Execution context with secrets and environment
   * @param {string} context.environment.ADDRESS - Default Salesforce API base URL
   *
   * The configured auth type will determine which of the following environment variables and secrets are available
   * @param {string} context.secrets.BEARER_AUTH_TOKEN
   *
   * @param {string} context.secrets.BASIC_USERNAME
   * @param {string} context.secrets.BASIC_PASSWORD
   *
   * @param {string} context.secrets.OAUTH2_CLIENT_CREDENTIALS_CLIENT_SECRET
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_AUDIENCE
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_AUTH_STYLE
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_CLIENT_ID
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_SCOPE
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_TOKEN_URL
   *
   * @param {string} context.secrets.OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN
   *
   * @returns {Promise<Object>} Action result
   */
  invoke: async (params, context) => {
    console.log('Starting Salesforce permission set assignment');

    const { username, permissionSetId } = params;

    // Get base URL using utility function
    const baseUrl = getBaseURL(params, context);

    // Get authorization header
    const authHeader = await getAuthorizationHeader(context);

    console.log(`Adding user ${username} to permission set ${permissionSetId}`);

    // Step 1: Find user by username
    console.log('Step 1: Finding user by username');
    const userResponse = await findUserByUsername(username, baseUrl, authHeader);

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
      baseUrl,
      authHeader
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
      assignmentId: assignmentId,
      address: baseUrl
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
    throw error;
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