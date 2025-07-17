// src/app/Auth/apple-auth/apple-auth.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';

declare const AppleID: any;

interface AppleAuthResponse {
  authorization: {
    code: string;
    id_token: string;
    state?: string;
  };
  user?: {
    email: string;
    name: {
      firstName: string;
      lastName: string;
    };
  };
}

interface AuthError {
  message: string;
  error?: string;
}

@Component({
  selector: 'app-apple-auth',
  standalone: false,
  templateUrl: './apple-auth.html',
  styleUrl: './apple-auth.scss'
})
export class AppleAuth implements OnInit, OnDestroy {
  isLoading = false;
  error: string | null = null;
  
  private readonly NETLIFY_FUNCTION_URL = 'https://mghebro-auth-test-angular.netlify.app/.netlify/functions/server';
  private readonly FRONTEND_URL = 'https://mghebro-auth-test.netlify.app';

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.initializeAppleAuth();
  }

  ngOnDestroy(): void {
    // Clean up if needed
  }

  private initializeAppleAuth(): void {
    try {
      if (typeof AppleID !== 'undefined') {
        AppleID.auth.init({
          clientId: 'com.mghebro.si',
          scope: 'name email',
          redirectURI: this.NETLIFY_FUNCTION_URL,
          usePopup: true,
          state: this.generateState()
        });
        console.log('✅ Apple ID initialized successfully');
      } else {
        console.error('❌ Apple ID SDK not loaded');
        this.error = 'Apple authentication is not available';
      }
    } catch (error) {
      console.error('❌ Error initializing Apple ID:', error);
      this.error = 'Failed to initialize Apple authentication';
    }
  }

  private generateState(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  async signInWithApple(): Promise<void> {
    if (this.isLoading) return;
    
    this.isLoading = true;
    this.error = null;

    try {
      console.log('🍎 Starting Apple sign-in...');
      
      const response: AppleAuthResponse = await AppleID.auth.signIn();
      
      console.log('✅ Apple sign-in successful:', {
        hasCode: !!response.authorization?.code,
        hasIdToken: !!response.authorization?.id_token,
        hasUser: !!response.user,
        userEmail: response.user?.email
      });

      await this.handleAppleResponse(response);
      
    } catch (error: any) {
      console.error('❌ Apple sign-in failed:', error);
      
      if (error.error === 'popup_closed_by_user') {
        this.error = 'Sign-in was cancelled';
      } else {
        this.error = 'Apple sign-in failed. Please try again.';
      }
    } finally {
      this.isLoading = false;
    }
  }

  private async handleAppleResponse(response: AppleAuthResponse): Promise<void> {
    const { code, id_token, state } = response.authorization;
    const user = response.user;

    const payload = {
      code,
      id_token,
      state,
      user: user ? JSON.stringify(user) : null
    };

    console.log('📤 Sending auth data to backend...');

    try {
      const backendResponse = await fetch(this.NETLIFY_FUNCTION_URL, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      console.log('📥 Backend response status:', backendResponse.status);

      if (backendResponse.redirected) {
        console.log('↩️ Redirecting to:', backendResponse.url);
        window.location.href = backendResponse.url;
        return;
      }

      if (!backendResponse.ok) {
        const errorData: AuthError = await backendResponse.json();
        throw new Error(errorData.message || `Server error: ${backendResponse.status}`);
      }

      const data = await backendResponse.json();
      console.log('✅ Auth response received:', data);

      // Handle successful authentication
      if (data.success && data.data) {
        this.handleSuccessfulAuth(data.data);
      } else {
        throw new Error('Invalid response from server');
      }

    } catch (error: any) {
      console.error('❌ Backend communication error:', error);
      
      if (error.message.includes('User already exists')) {
        this.error = 'An account with this email already exists';
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        this.error = 'Network error. Please check your connection and try again.';
      } else {
        this.error = error.message || 'Authentication failed. Please try again.';
      }
    }
  }

  private handleSuccessfulAuth(data: any): void {
    console.log('🎉 Authentication successful');
    
    // Store token if provided
    if (data.accessToken || data.token) {
      const token = data.accessToken || data.token;
      // Note: In a real app, consider using a more secure storage method
      sessionStorage.setItem('authToken', token);
    }

    // Store user info
    if (data.user) {
      sessionStorage.setItem('userInfo', JSON.stringify(data.user));
    }

    // Redirect to dashboard or home page
    this.redirectToApp(data);
  }

  private redirectToApp(data: any): void {
    const token = data.accessToken || data.token || '';
    const email = data.email || data.user?.email || '';
    const name = data.name || data.user?.name || '';
    
    const successUrl = `${this.FRONTEND_URL}/success.html?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`;
    
    window.location.href = successUrl;
  }

  clearError(): void {
    this.error = null;
  }
}