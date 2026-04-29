const App = {
  init() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');

    if (token && user) {
      App.showNav(user);
      App.applyTheme(user.darkMode !== false);
    }

    window.addEventListener('hashchange', () => App.route());
    App.route();
  },

  route() {
    const hash = window.location.hash || '#/login';
    const token = localStorage.getItem('token');

    if (!token && !hash.startsWith('#/login') && !hash.startsWith('#/register')) {
      window.location.hash = '#/login';
      return;
    }

    if (token && (hash === '#/login' || hash === '#/register' || hash === '#/' || hash === '')) {
      window.location.hash = '#/dashboard';
      return;
    }

    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === hash.split('/').slice(0, 2).join('/') ||
        (link.dataset.route === 'dashboard' && hash.startsWith('#/dashboard')));
    });

    // Route matching
    if (hash === '#/login') {
      document.body.classList.remove('reader-mode');
      App.hideNav();
      Auth.renderLogin();
    } else if (hash === '#/register') {
      document.body.classList.remove('reader-mode');
      App.hideNav();
      Auth.renderRegister();
    } else if (hash === '#/dashboard') {
      document.body.classList.remove('reader-mode');
      Dashboard.render();
    } else if (hash.match(/^#\/course\/([a-f0-9]+)$/)) {
      const courseId = hash.match(/^#\/course\/([a-f0-9]+)$/)[1];
      document.body.classList.remove('reader-mode');
      if (typeof Reader !== 'undefined') Reader.cleanup();
      CourseDetail.render(courseId);
    } else if (hash.match(/^#\/reader\/([a-f0-9]+)\/([a-f0-9]+)$/)) {
      const [, courseId, materialId] = hash.match(/^#\/reader\/([a-f0-9]+)\/([a-f0-9]+)$/);
      document.body.classList.add('reader-mode');
      Reader.render(courseId, materialId);
    } else if (hash.match(/^#\/exam\/([a-f0-9]+)\/([a-f0-9]+)\/results$/)) {
      const [, courseId, examId] = hash.match(/^#\/exam\/([a-f0-9]+)\/([a-f0-9]+)\/results$/);
      ExamView.renderResults(courseId, examId);
    } else if (hash.match(/^#\/exam\/([a-f0-9]+)\/([a-f0-9]+)$/)) {
      const [, courseId, examId] = hash.match(/^#\/exam\/([a-f0-9]+)\/([a-f0-9]+)$/);
      ExamView.renderQuiz(courseId, examId);
    } else {
      window.location.hash = '#/dashboard';
    }
  },

  onLogin(user) {
    App.showNav(user);
    App.applyTheme(user.darkMode !== false);
    window.location.hash = '#/dashboard';
  },

  showNav(user) {
    const navbar = document.getElementById('navbar');
    navbar.classList.remove('hidden');
    document.getElementById('navUserName').textContent = user.name || 'User';

    // Mobile toggle
    const toggle = document.getElementById('navToggle');
    const links = document.getElementById('navLinks');
    toggle.onclick = () => links.classList.toggle('open');

    // Close mobile menu on link click
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => links.classList.remove('open'));
    });

    // Logout
    document.getElementById('logoutBtn').onclick = () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      App.hideNav();
      window.location.hash = '#/login';
    };

    // Theme toggle
    document.getElementById('themeToggle').onclick = async () => {
      const isDark = !document.body.classList.contains('light-mode');
      App.applyTheme(!isDark);
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      storedUser.darkMode = !isDark;
      localStorage.setItem('user', JSON.stringify(storedUser));
      try {
        await api('/auth/me', {
          method: 'PATCH',
          body: JSON.stringify({ darkMode: !isDark })
        });
      } catch (e) {
        // Silently fail - theme is already applied locally
      }
    };
  },

  hideNav() {
    document.getElementById('navbar').classList.add('hidden');
  },

  applyTheme(isDark) {
    document.body.classList.toggle('light-mode', !isDark);
    const icon = document.querySelector('#themeToggle i');
    if (icon) {
      icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
