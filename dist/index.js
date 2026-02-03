// SGNL Job Script - Auto-generated bundle
'use strict';

/**
 * SGNL Actions - Authentication Utilities
 *
 * Shared authentication utilities for SGNL actions.
 * Supports: Bearer Token, Basic Auth, OAuth2 Client Credentials, OAuth2 Authorization Code
 */

/**
 * Get OAuth2 access token using client credentials flow
 * @param {Object} config - OAuth2 configuration
 * @param {string} config.tokenUrl - Token endpoint URL
 * @param {string} config.clientId - Client ID
 * @param {string} config.clientSecret - Client secret
 * @param {string} [config.scope] - OAuth2 scope
 * @param {string} [config.audience] - OAuth2 audience
 * @param {string} [config.authStyle] - Auth style: 'InParams' or 'InHeader' (default)
 * @returns {Promise<string>} Access token
 */
async function getClientCredentialsToken(config) {
  const { tokenUrl, clientId, clientSecret, scope, audience, authStyle } = config;

  if (!tokenUrl || !clientId || !clientSecret) {
    throw new Error('OAuth2 Client Credentials flow requires tokenUrl, clientId, and clientSecret');
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');

  if (scope) {
    params.append('scope', scope);
  }

  if (audience) {
    params.append('audience', audience);
  }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json'
  };

  if (authStyle === 'InParams') {
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
  } else {
    const credentials = btoa(`${clientId}:${clientSecret}`);
    headers['Authorization'] = `Basic ${credentials}`;
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers,
    body: params.toString()
  });

  if (!response.ok) {
    let errorText;
    try {
      const errorData = await response.json();
      errorText = JSON.stringify(errorData);
    } catch {
      errorText = await response.text();
    }
    throw new Error(
      `OAuth2 token request failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error('No access_token in OAuth2 response');
  }

  return data.access_token;
}

/**
 * Get the Authorization header value from context using available auth method.
 * Supports: Bearer Token, Basic Auth, OAuth2 Authorization Code, OAuth2 Client Credentials
 *
 * @param {Object} context - Execution context with environment and secrets
 * @param {Object} context.environment - Environment variables
 * @param {Object} context.secrets - Secret values
 * @returns {Promise<string>} Authorization header value (e.g., "Bearer xxx" or "Basic xxx")
 */
async function getAuthorizationHeader(context) {
  const env = context.environment || {};
  const secrets = context.secrets || {};

  // Method 1: Simple Bearer Token
  if (secrets.BEARER_AUTH_TOKEN) {
    const token = secrets.BEARER_AUTH_TOKEN;
    return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  // Method 2: Basic Auth (username + password)
  if (secrets.BASIC_PASSWORD && secrets.BASIC_USERNAME) {
    const credentials = btoa(`${secrets.BASIC_USERNAME}:${secrets.BASIC_PASSWORD}`);
    return `Basic ${credentials}`;
  }

  // Method 3: OAuth2 Authorization Code - use pre-existing access token
  if (secrets.OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN) {
    const token = secrets.OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN;
    return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  // Method 4: OAuth2 Client Credentials - fetch new token
  if (secrets.OAUTH2_CLIENT_CREDENTIALS_CLIENT_SECRET) {
    const tokenUrl = env.OAUTH2_CLIENT_CREDENTIALS_TOKEN_URL;
    const clientId = env.OAUTH2_CLIENT_CREDENTIALS_CLIENT_ID;
    const clientSecret = secrets.OAUTH2_CLIENT_CREDENTIALS_CLIENT_SECRET;

    if (!tokenUrl || !clientId) {
      throw new Error('OAuth2 Client Credentials flow requires TOKEN_URL and CLIENT_ID in env');
    }

    const token = await getClientCredentialsToken({
      tokenUrl,
      clientId,
      clientSecret,
      scope: env.OAUTH2_CLIENT_CREDENTIALS_SCOPE,
      audience: env.OAUTH2_CLIENT_CREDENTIALS_AUDIENCE,
      authStyle: env.OAUTH2_CLIENT_CREDENTIALS_AUTH_STYLE
    });

    return `Bearer ${token}`;
  }

  throw new Error(
    'No authentication configured. Provide one of: ' +
    'BEARER_AUTH_TOKEN, BASIC_USERNAME/BASIC_PASSWORD, ' +
    'OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN, or OAUTH2_CLIENT_CREDENTIALS_*'
  );
}

/**
 * Get the base URL/address for API calls
 * @param {Object} params - Request parameters
 * @param {string} [params.address] - Address from params
 * @param {Object} context - Execution context
 * @returns {string} Base URL
 */
function getBaseURL(params, context) {
  const env = context.environment || {};
  const address = params?.address || env.ADDRESS;

  if (!address) {
    throw new Error('No URL specified. Provide address parameter or ADDRESS environment variable');
  }

  // Remove trailing slash if present
  return address.endsWith('/') ? address.slice(0, -1) : address;
}

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

var script = {
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

module.exports = script;
