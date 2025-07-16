import { Component, OnInit } from '@angular/core';
declare const AppleID: any;

@Component({
  selector: 'app-apple-auth',
  standalone: false,
  templateUrl: './apple-auth.html',
  styleUrl: './apple-auth.scss'
})
export class AppleAuth implements OnInit {

  ngOnInit(): void {
    AppleID.auth.init({
      clientId: 'com.mghebro.si',
      scope: 'name email',
      // Fix: Use the exact redirect URI that matches your backend
      redirectURI: 'https://mghebro-auth-test-angular.netlify.app/.netlify/functions/server',
      usePopup: true,
    });
  }

  signInWithApple(): void {
    AppleID.auth.signIn().then(
      (response: any) => {
        const { code, id_token, state } = response.authorization;
        const user = response.user;

        console.log('✅ Apple sign-in successful:', response);

        // Fix: Send to the correct endpoint
        fetch('https://mghebro-auth-test-angular.netlify.app/.netlify/functions/server', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            code,
            id_token,
            state,
            user: user ? JSON.stringify(user) : null
          })
        })
        .then(response => {
          if (response.redirected) {
            // Handle redirect response
            window.location.href = response.url;
          } else {
            return response.json();
          }
        })
        .then(data => {
          if (data) {
            console.log('Auth response:', data);
            // Handle successful authentication
            if (data.token) {
              localStorage.setItem('token', data.token);
              window.location.href = '/dashboard'; // or wherever you want to redirect
            }
          }
        })
        .catch(err => {
          console.error('❌ Error sending to Netlify function:', err);
          alert('Authentication failed. Please try again.');
        });
      },
      (err: any) => {
        console.error('❌ Apple sign-in failed:', err);
        alert('Apple sign-in failed. Please try again.');
      }
    );
  }
}