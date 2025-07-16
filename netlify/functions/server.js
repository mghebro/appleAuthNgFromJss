const jwt = require("jsonwebtoken");
const axios = require("axios");

// Apple Auth configuration
const config = {
  client_id: "com.mghebro.si",
  team_id: "TTFPHSNRGQ",
  redirect_uri: "https://mghebro-auth-test-angular.netlify.app/.netlify/functions/server",
  key_id: "ZR62KJ2BYT",
  scope: "name email",
};

const privateKey = process.env.APPLE_PRIVATE_KEY || "";
const CSHARP_BACKEND_URL = process.env.CSHARP_BACKEND_URL || "https://1e94d017035f.ngrok-free.app/api/AppleService/auth/apple-callback";

// Helper function to generate Apple client secret
function generateClientSecret(teamId, clientId, keyId, privateKey) {
  const crypto = require('crypto');
  
  // Clean the private key
  const cleanPrivateKey = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  
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
  
  return jwt.sign(payload, keyBuffer, { 
    algorithm: 'ES256',
    header: header
  });
}

// Helper function to get Apple access token
async function getAppleAccessToken(code) {
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

  try {
    const response = await axios.post('https://appleid.apple.com/auth/token', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Apple token exchange error:', error.response?.data || error.message);
    throw error;
  }
}

exports.handler = async (event, context) => {
  // Add CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      const { code, id_token, state, user } = body;

      console.log('Received Apple auth callback:', { code: !!code, id_token: !!id_token, user: !!user });

      if (!code) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            message: 'Missing authorization code',
          }),
        };
      }

      // Get access token from Apple
      const tokenResponse = await getAppleAccessToken(code);
      console.log('Token response received from Apple');

      // Decode the ID token
      const decodedIdToken = jwt.decode(tokenResponse.id_token);
      if (!decodedIdToken) {
        throw new Error('Failed to decode ID token');
      }

      const userAppleId = decodedIdToken.sub;
      const userEmail = decodedIdToken.email;
      const isPrivateEmail = userEmail?.includes('@privaterelay.appleid.com') || false;

      let userName = null;
      if (user) {
        try {
          const parsedUser = JSON.parse(user);
          if (parsedUser.name) {
            userName = `${parsedUser.name.firstName || ''} ${parsedUser.name.lastName || ''}`.trim();
          }
        } catch (e) {
          console.warn('Failed to parse user data:', e);
        }
      }

      // Prepare request for your C# backend
      const authRequest = {
        code: code,
        redirectUri: config.redirect_uri,
        appleId: userAppleId,
        email: userEmail,
        name: userName,
        isPrivateEmail: isPrivateEmail,
        refreshToken: tokenResponse.refresh_token,
        accessToken: tokenResponse.access_token,
        emailVerified: decodedIdToken.email_verified || false,
        authTime: new Date(decodedIdToken.auth_time * 1000).toISOString(),
        tokenType: tokenResponse.token_type,
        expiresIn: tokenResponse.expires_in,
      };

      console.log('Sending request to C# backend...');

      // Send to your C# backend
      const response = await axios.post(CSHARP_BACKEND_URL, authRequest, {
        headers: { 
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true' // For ngrok
        },
        timeout: 10000 // 10 second timeout
      });

      console.log('C# backend response received');

      // For successful authentication, redirect to frontend with token
      const frontendUrl = "https://mghebro-auth-test.netlify.app";
      const accessToken = response.data.accessToken || response.data.token;
      
      if (accessToken) {
        const successUrl = `${frontendUrl}/success.html?token=${accessToken}&email=${encodeURIComponent(response.data.email || '')}`;
        
        return {
          statusCode: 302,
          headers: {
            ...headers,
            Location: successUrl,
          },
        };
      } else {
        // Return JSON response if no redirect is needed
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            data: response.data
          }),
        };
      }

    } catch (error) {
      console.error('Apple auth error:', error);
      
      // Check if it's a 409 (user already exists) from your backend
      if (error.response?.status === 409) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({
            message: "User already exists",
            error: error.response.data?.message || "Conflict"
          }),
        };
      }

      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          message: "Server error during Apple auth callback",
          error: error.message,
          details: error.response?.data || null
        }),
      };
    }
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ message: "Method Not Allowed" }),
  };
};