const AppleAuth = require('./src/app/Auth/apple-auth'); 
const jwt = require('jsonwebtoken');
const axios = require('axios');

const config = {
  client_id: 'com.mghebro.si',
  team_id: 'TTFPHSNRGQ',
  redirect_uri: 'https://mghebro-auth-test-angular.netlify.app/.netlify/functions/server',
  key_id: 'ZR62KJ2BYT',
  scope: 'name email',
};

const privateKey = process.env.APPLE_PRIVATE_KEY || ''; // Load from env
const appleAuth = new AppleAuth(config, privateKey, 'text');

const CSHARP_BACKEND_URL = process.env.CSHARP_BACKEND_URL || 'https://98be9a6964b0.ngrok-free.app/api/AppleService/auth/apple-callback';

exports.handler = async (event, context) => {
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      const { code, id_token, state, user } = body;

      const tokenResponse = await appleAuth.accessToken(code);

      const decodedIdToken = jwt.decode(tokenResponse.id_token);
      const userAppleId = decodedIdToken.sub;
      const userEmail = decodedIdToken.email;
      const isPrivateEmail = userEmail?.includes('@privaterelay.appleid.com') || false;

      let userName = null;
      if (user) {
        const parsedUser = JSON.parse(user);
        if (parsedUser.name) {
          userName = `${parsedUser.name.firstName || ''} ${parsedUser.name.lastName || ''}`.trim();
        }
      }

      const authRequest = {
        appleId: userAppleId,
        email: userEmail,
        name: userName,
        isPrivateEmail: isPrivateEmail,
        refreshToken: tokenResponse.refresh_token,
        accessToken: tokenResponse.access_token,
        emailVerified: decodedIdToken.email_verified || false,
        authTime: new Date(decodedIdToken.auth_time * 1000).toISOString(),
        tokenType: tokenResponse.token_type,
        expiresIn: tokenResponse.expires_in
      };

      const response = await axios.post(CSHARP_BACKEND_URL, authRequest, {
        headers: { 'Content-Type': 'application/json' }
      });

      const frontendUrl = 'https://mghebro-auth-test.netlify.app';
      const accessToken = response.data.accessToken || response.data.token;
      const successUrl = `${frontendUrl}/success.html?token=${accessToken}&email=${encodeURIComponent(response.data.email || '')}`;

      return {
        statusCode: 302,
        headers: {
          Location: successUrl
        },
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: 'Server error during Apple auth callback',
          error: error.message,
          stack: error.stack
        }),
      };
    }
  }

  return {
    statusCode: 405,
    body: 'Method Not Allowed'
  };
};
