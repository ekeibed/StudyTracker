const Auth = {
  renderLogin() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="auth-container">
        <div class="auth-card">
          <div class="auth-header">
            <div class="logo"><i class="fas fa-book-open"></i></div>
            <h1>Welcome Back</h1>
            <p>Sign in to continue your study journey</p>
          </div>
          <div class="form-error" id="authError"></div>
          <form id="loginForm">
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" class="form-input" id="loginEmail" placeholder="you@example.com" required>
            </div>
            <div class="form-group">
              <label class="form-label">Password</label>
              <input type="password" class="form-input" id="loginPassword" placeholder="Enter your password" required>
            </div>
            <button type="submit" class="btn btn-primary auth-btn">
              <i class="fas fa-sign-in-alt"></i> Sign In
            </button>
          </form>
          <div class="auth-footer">
            Don't have an account? <a href="#/register">Create one</a>
          </div>
        </div>
      </div>
    `;

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('authError');
      errorEl.classList.remove('visible');

      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;

      if (!email || !password) {
        errorEl.textContent = 'Please fill in all fields';
        errorEl.classList.add('visible');
        return;
      }

      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';

      try {
        const res = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        App.onLogin(res.data.user);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.add('visible');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
      }
    });
  },

  renderRegister() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="auth-container">
        <div class="auth-card">
          <div class="auth-header">
            <div class="logo"><i class="fas fa-book-open"></i></div>
            <h1>Create Account</h1>
            <p>Start tracking your studies today</p>
          </div>
          <div class="form-error" id="authError"></div>
          <form id="registerForm">
            <div class="form-group">
              <label class="form-label">Full Name</label>
              <input type="text" class="form-input" id="regName" placeholder="John Doe" required>
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" class="form-input" id="regEmail" placeholder="you@example.com" required>
            </div>
            <div class="form-group">
              <label class="form-label">Password</label>
              <input type="password" class="form-input" id="regPassword" placeholder="At least 6 characters" required minlength="6">
            </div>
            <button type="submit" class="btn btn-primary auth-btn">
              <i class="fas fa-user-plus"></i> Create Account
            </button>
          </form>
          <div class="auth-footer">
            Already have an account? <a href="#/login">Sign in</a>
          </div>
        </div>
      </div>
    `;

    document.getElementById('registerForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('authError');
      errorEl.classList.remove('visible');

      const name = document.getElementById('regName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;

      if (!name || !email || !password) {
        errorEl.textContent = 'Please fill in all fields';
        errorEl.classList.add('visible');
        return;
      }

      if (password.length < 6) {
        errorEl.textContent = 'Password must be at least 6 characters';
        errorEl.classList.add('visible');
        return;
      }

      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';

      try {
        const res = await api('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ name, email, password })
        });
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        App.onLogin(res.data.user);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.add('visible');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
      }
    });
  }
};
