/* =========================================================
   AUTH.JS — Login & Signup
   ========================================================= */

function showToastAuth(msg, isError = false) {
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = msg;
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  } else {
    alert(msg);
  }
}

function handleSignup() {
  const name    = document.getElementById('signup-name').value.trim();
  const email   = document.getElementById('signup-email').value.trim();
  const pass    = document.getElementById('signup-password').value;
  const confirm = document.getElementById('signup-confirm').value;

  if (!name || !email || !pass || !confirm) return showToastAuth('Please fill all fields!', true);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showToastAuth('Invalid email format!', true);
  if (pass.length < 4) return showToastAuth('Password must be at least 4 characters!', true);
  if (pass !== confirm) return showToastAuth('Passwords do not match!', true);

  const users = JSON.parse(localStorage.getItem('users') || '[]');
  if (users.some(u => u.email === email)) return showToastAuth('Email already registered!', true);

  users.push({ name, email, password: pass });
  localStorage.setItem('users', JSON.stringify(users));

  showToastAuth('Account created! Redirecting to login...');
  setTimeout(() => window.location.href = 'login.html', 900);
}

function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;

  if (!email || !pass) return showToastAuth('Please enter email and password!', true);

  if (email === 'demo@route.com' && pass === '1234') {
    localStorage.setItem('currentUser', JSON.stringify({ name: 'Demo User', email }));
    showToastAuth('Login successful!');
    setTimeout(() => window.location.href = 'dashboard.html', 600);
    return;
  }

  const users = JSON.parse(localStorage.getItem('users') || '[]');
  const user = users.find(u => u.email === email && u.password === pass);
  if (!user) return showToastAuth('Invalid email or password!', true);

  localStorage.setItem('currentUser', JSON.stringify(user));
  showToastAuth('Login successful!');
  setTimeout(() => window.location.href = 'dashboard.html', 600);
}

window.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('toast')) {
    const t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
});