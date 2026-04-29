function render(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AFT - Login</title>
  <link rel="stylesheet" href="/globals.css">
</head>
<body>
  <div class="page-wrapper-centered">
  <div class="login-box">
      <div class="login-header">
          <h1>Assured File Transfer</h1>
          <p>Secure Data Transfer System</p>
      </div>
      
      <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" placeholder="admin@aft.gov" autocomplete="email">
          <div id="email-error" class="error-message hidden" style="font-size: 0.8rem; text-align: left; margin-top: 4px;"></div>
      </div>
      
      <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" placeholder="••••••••" autocomplete="current-password">
      </div>
      
      <button type="button" id="loginBtn" class="login-btn">
          Login
      </button>
      
      <div id="error" class="error-message hidden"></div>
  </div>
</div>
  
  <script>
      const emailInput = document.getElementById('email');
      const passwordInput = document.getElementById('password');
      const loginBtn = document.getElementById('loginBtn');
      const errorDiv = document.getElementById('error');
      const emailErrorDiv = document.getElementById('email-error');
      let emailDebounceTimer;
      
      async function handleLogin() {
          const email = emailInput.value.trim();
          const password = passwordInput.value;
          
          if (!email || !password) {
              errorDiv.textContent = 'Please enter email and password';
              errorDiv.classList.remove('hidden');
              return;
          }
          
          errorDiv.classList.add('hidden');
          loginBtn.disabled = true;
          loginBtn.textContent = 'Logging in...';
          
          try {
              const response = await fetch('/api/login', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email, password })
              });
              
              const result = await response.json();
              
              if (result.success) {
                  window.location.href = '/dashboard';
              } else {
                  errorDiv.textContent = result.message || 'Invalid credentials';
                  errorDiv.classList.remove('hidden');
                  loginBtn.disabled = false;
                  loginBtn.textContent = 'Login';
              }
          } catch (error) {
              errorDiv.textContent = 'Network error. Please try again.';
              errorDiv.classList.remove('hidden');
              loginBtn.disabled = false;
              loginBtn.textContent = 'Login';
          }
      }
      
      loginBtn.addEventListener('click', handleLogin);
      
      // Allow Enter key to submit
      emailInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') handleLogin();
      });
      
      passwordInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') handleLogin();
      });
      
      async function validateEmail() {
          const email = emailInput.value.trim();
          
          if (email.length < 3 || !email.includes('@')) {
              emailErrorDiv.classList.add('hidden');
              return;
          }

          try {
              const response = await fetch('/api/check-email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email })
              });
              
              if (!response.ok) return;

              const result = await response.json();
              
              if (!result.exists) {
                  emailErrorDiv.textContent = 'Email address not found.';
                  emailErrorDiv.classList.remove('hidden');
              } else {
                  emailErrorDiv.classList.add('hidden');
              }
          } catch (error) {
              emailErrorDiv.classList.add('hidden');
          }
      }

      emailInput.addEventListener('input', () => {
          clearTimeout(emailDebounceTimer);
          emailDebounceTimer = setTimeout(() => {
              validateEmail();
          }, 500);
      });

      // Focus email input on load
      emailInput.focus();
  </script>
</body>
</html>`;
}

export const LoginPage = {
  render,
};
