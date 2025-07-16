import { Component ,OnInit } from '@angular/core';
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
      redirectURI: 'https://mghebro-auth-test.netlify.app/netlify/functions/server',
      usePopup: true,
    });
  }

  signInWithApple(): void {
    AppleID.auth.signIn().then(
      (response: any) => {
        const { code, id_token, state } = response.authorization;
        const user = response.user;

        console.log('✅ Apple sign-in successful:', response);

        fetch('/netlify/functions/server', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            id_token,
            state,
            user: JSON.stringify(user)
          })
        })
        .then(res => res.text())
        .then(data => {
          // This may redirect or return HTML (like auth-success.html)
          document.write(data);
        })
        .catch(err => console.error('❌ Error sending to Netlify function:', err));
      },
      (err: any) => {
        console.error('❌ Apple sign-in failed:', err);
      }
    );
  }
}