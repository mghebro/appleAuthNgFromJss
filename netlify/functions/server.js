// netlify/functions/server.js
const jwt = require("jsonwebtoken");
const axios = require("axios");

// Apple Auth configuration
const config = {
  client_id: process.env.APPLE_CLIENT_ID || "com.mghebro.si",
  team_id: process.env.APPLE_TEAM_ID || "TTFPHSNRGQ",
  redirect_uri: process.env.APPLE_REDIRECT_URI || "https://mghebro-auth-test-angular.netlify.app/auth/apple/callback",
  key_id: process.env.APPLE_KEY_ID || "ZR62KJ2BYT",
  scope: "name email",
};

// Get the private key from environment variable
const privateKey = process.env.APPLE_PRIVATE_KEY || "";

// C# Backend URL
const CSHARP_BACKEND_URL = process.env.CSHARP_BACKEND_URL || "https://98be9a6964b0.ngrok-free.app/api/AppleService/auth/apple-callback";

// Helper function to validate environment variables
function validateEnvironment() {
  const errors = [];
  
  if (!privateKey) {
    errors.push("APPLE_PRIVATE_KEY environment variable is not set");
  }
  
  if (!CSHARP_BACKEND_URL) {
    errors.push("CSHARP_BACKEND_URL environment variable is not set");
  }
  
  return errors;
}

// Helper function to generate Apple client secret
function generateClientSecret(teamId, clientId, keyId, privateKey) {
  try {
    console.log('Generating client secret...');
    
    if (!privateKey) {
      throw new Error('Private key is required');
    }
    
    // Clean the private key - handle both formats
    let cleanPrivateKey = privateKey
      .replace(/-----BEGIN PRIVATE KEY-----/g, '')
      .replace(/-----END PRIVATE KEY-----/g, '')
      .replace(/\\n/g, '\n')
      .replace(/\s/g, '');
    
    // Convert to buffer
    const keyBuffer = Buffer.from(cleanPrivateKey, 'base64');
    
    const now = Math.floor(Date.now() / 1000);
    
    const payload = {
      iss: teamId,
      iat: now,
      exp: now + (6 * 30 * 24 * 60 * 60), // 6 months
      aud: 'https://appleid.apple.com',
      sub: clientId
    };
    
    const header = {
      alg: 'ES256',
      kid: keyId
    };
    
    const clientSecret = jwt.sign(payload, keyBuffer, { 
      algorithm: 'ES256',
      header: header
    });
    
    console.log('Client secret generated successfully');
    return clientSecret;
    
  } catch (error) {
    console.error('Error generating client secret:', error);
    throw new Error(`Failed to generate client secret: ${error.message}`);
  }
}

// Helper function to get Apple access token
async function getAppleAccessToken(code) {
  try {
    console.log('Exchanging code for access token...');
    
    const clientSecret = generateClientSecret(
      config.team_id,
      config.client_id,
      config.key_id,
      privateKey
    );

    const params = new URLSearchParams({
      client_id: config.client_id,
      client_secret: clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirect_uri
    });

    const response = await axios.post('https://appleid.apple.com/auth/token', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('Apple token exchange successful');
    return response.data;
    
  } catch (error) {
    console.error('Apple token exchange error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    throw new Error(`Apple token exchange failed: ${error.response?.data?.error_description || error.message}`);
  }
}

// Helper function to send to C# backend
async function sendToBackend(authRequest) {
  try {
    console.log('Sending request to C# backend...');
    
    const response = await axios.post(CSHARP_BACKEND_URL, authRequest, {
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'AppleAuth-NodeJS/1.0',
        'ngrok-skip-browser-warning': 'true' // For ngrok
      },
      timeout: 15000 // 15 second timeout
    });

    console.log('C# backend response received successfully');
    return response.data;
    
  } catch (error) {
    console.error('C# backend error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      url: CSHARP_BACKEND_URL
    });
    
    if (error.code === 'ECONNABORTED') {
      throw new Error('Backend request timed out');
    }
    
    if (error.response?.status === 409) {
      throw new Error('User already exists');
    }
    
    throw new Error(`Backend error: ${error.response?.data?.message || error.message}`);
  }
}

// Helper function to parse user data
function parseUserData(user) {
  if (!user) return null;
  
  try {
    const parsedUser = typeof user === 'string' ? JSON.parse(user) : user;
    
    if (parsedUser.name) {
      const firstName = parsedUser.name.firstName || '';
      const lastName = parsedUser.name.lastName || '';
      return `${firstName} ${lastName}`.trim();
    }
    
    return null;
  } catch (error) {
    console.warn('Failed to parse user data:', error);
    return null;
  }
}

// Helper function to create redirect URL
function createRedirectUrl(data, isError = false) {
  const frontendUrl = process.env.FRONTEND_URL || "https://mghebro-auth-test.netlify.app";
  
  if (isError) {
    return `${frontendUrl}/error.html?error=${encodeURIComponent(data.message)}`;
  }
  
  const accessToken = data.accessToken || data.token || '';
  const email = data.email || '';
  const name = data.name || '';
  
  return `${frontendUrl}/success.html?token=${encodeURIComponent(accessToken)}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`;
}

// Main handler function
exports.handler = async (event, context) => {
  console.log('Apple auth handler called:', {
    method: event.httpMethod,
    path: event.path,
    headers: event.headers
  });

  // Add CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Validate environment
  const envErrors = validateEnvironment();
  if (envErrors.length > 0) {
    console.error('Environment validation failed:', envErrors);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'Server configuration error',
        errors: envErrors
      }),
    };
  }

  // Route handling based on path
  const path = event.path.replace('/.netlify/functions/server', '');
  
  // Handle GET requests
  if (event.httpMethod === 'GET') {
    if (path === '' || path === '/') {
      // Health check endpoint
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'Apple auth service is running',
          config: {
            client_id: config.client_id,
            redirect_uri: config.redirect_uri,
            backend_url: CSHARP_BACKEND_URL
          }
        }),
      };
    }
    
    if (path === '/test') {
      // Test endpoint
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          message: "Server is working", 
          timestamp: new Date().toISOString(),
          config: {
            client_id: config.client_id,
            redirect_uri: config.redirect_uri,
            csharp_backend_url: CSHARP_BACKEND_URL
          }
        }),
      };
    }
  }

  // Handle POST requests
  if (event.httpMethod === 'POST' && path === '/auth/apple/callback') {
    try {
      const body = JSON.parse(event.body || '{}');
      const { code, id_token, state, user } = body;

      console.log('Received Apple auth callback:', { 
        hasCode: !!code, 
        hasIdToken: !!id_token, 
        hasUser: !!user,
        state: state 
      });

      // Validate required parameters
      if (!code) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            message: 'Missing required parameter: authorization code',
          }),
        };
      }

      // Get access token from Apple
      const tokenResponse = await getAppleAccessToken(code);

      // Decode the ID token
      const decodedIdToken = jwt.decode(tokenResponse.id_token);
      if (!decodedIdToken) {
        throw new Error('Failed to decode ID token from Apple');
      }

      console.log('Decoded ID token:', {
        sub: decodedIdToken.sub,
        email: decodedIdToken.email,
        email_verified: decodedIdToken.email_verified
      });

      // Extract user information
      const userAppleId = decodedIdToken.sub;
      const userEmail = decodedIdToken.email;
      const isPrivateEmail = userEmail?.includes('@privaterelay.appleid.com') || false;
      const userName = parseUserData(user);

      // Prepare request for C# backend
      const authRequest = {
        appleId: userAppleId,
        email: userEmail,
        name: userName,
        isPrivateEmail: isPrivateEmail,
        refreshToken: tokenResponse.refresh_token,
        accessToken: tokenResponse.access_token,
        emailVerified: decodedIdToken.email_verified || false,
        authTime: new Date((decodedIdToken.auth_time || decodedIdToken.iat) * 1000).toISOString(),
        tokenType: tokenResponse.token_type,
        expiresIn: tokenResponse.expires_in,
        state: state
      };

      console.log('Prepared auth request:', {
        appleId: authRequest.appleId,
        email: authRequest.email,
        name: authRequest.name,
        isPrivateEmail: authRequest.isPrivateEmail
      });

      // Send to C# backend
      const backendResponse = await sendToBackend(authRequest);

      // Handle successful response
      if (backendResponse) {
        const redirectUrl = createRedirectUrl(backendResponse);
        
        // Return JSON response instead of redirect for Angular app
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            data: backendResponse,
            redirectUrl: redirectUrl
          }),
        };
      } else {
        throw new Error('Empty response from backend');
      }

    } catch (error) {
      console.error('Apple auth error:', error);
      
      // Handle specific error cases
      if (error.message.includes('User already exists')) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'User already exists',
            error: error.message
          }),
        };
      }

      if (error.message.includes('Backend request timed out')) {
        return {
          statusCode: 504,
          headers,
          body: JSON.stringify({
            success: false,
            message: "Backend service timeout",
            error: "The authentication service is temporarily unavailable"
          }),
        };
      }

      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: "Authentication failed",
          error: error.message,
          timestamp: new Date().toISOString()
        }),
      };
    }
  }

  // Method not allowed
  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ 
      message: "Method Not Allowed",
      allowed: ["GET", "POST", "OPTIONS"]
    }),
  };
};