const Dashboard = {
  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

    try {
      const [coursesRes, userRes] = await Promise.all([
        api('/courses'),
        api('/auth/me')
      ]);

      const courses = coursesRes.data;
      const user = userRes.data;
      const streak = user.studyStreak || { currentStreak: 0, longestStreak: 0 };

      const totalCourses = courses.length;
      const totalPages = courses.reduce((s, c) => s + c.totalPages, 0);
      const completedPages = courses.reduce((s, c) => s + c.completedPages, 0);
      const overallProgress = totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0;
      const upcomingExams = courses.filter(c => !c.examPassed).length;

      app.innerHTML = `
        <div class="dashboard-header">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem">
            <div>
              <h1>Welcome back, ${escapeHtml(user.name.split(' ')[0])}</h1>
              <p>Here's your study overview</p>
            </div>
            <div class="streak-badge ${streak.currentStreak > 0 ? '' : 'inactive'}">
              <i class="fas fa-fire"></i>
              <span>${streak.currentStreak} day${streak.currentStreak !== 1 ? 's' : ''} streak</span>
            </div>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon blue"><i class="fas fa-graduation-cap"></i></div>
            <div class="stat-info">
              <h3>${totalCourses}</h3>
              <p>Active Courses</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon green"><i class="fas fa-check-circle"></i></div>
            <div class="stat-info">
              <h3>${overallProgress}%</h3>
              <p>Overall Progress</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon orange"><i class="fas fa-file-alt"></i></div>
            <div class="stat-info">
              <h3>${completedPages}/${totalPages}</h3>
              <p>Pages Completed</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon red"><i class="fas fa-calendar-alt"></i></div>
            <div class="stat-info">
              <h3>${upcomingExams}</h3>
              <p>Upcoming Exams</p>
            </div>
          </div>
        </div>

        <div class="section-header">
          <h2>Your Courses</h2>
          <button class="btn btn-primary" id="addCourseBtn">
            <i class="fas fa-plus"></i> Add Course
          </button>
        </div>

        <div class="courses-grid" id="coursesGrid">
          ${courses.length === 0 ? `
            <div class="empty-state" style="grid-column: 1/-1">
              <i class="fas fa-book"></i>
              <h3>No courses yet</h3>
              <p>Create your first course to start tracking your study progress.</p>
              <button class="btn btn-primary" id="emptyAddCourseBtn">
                <i class="fas fa-plus"></i> Create Course
              </button>
            </div>
          ` : courses.map(course => Dashboard.renderCourseCard(course)).join('')}
        </div>
      `;

      document.getElementById('addCourseBtn').addEventListener('click', () => Dashboard.showAddCourseModal());
      const emptyBtn = document.getElementById('emptyAddCourseBtn');
      if (emptyBtn) emptyBtn.addEventListener('click', () => Dashboard.showAddCourseModal());

      document.querySelectorAll('.course-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.course-delete-btn')) return;
          window.location.hash = `#/course/${card.dataset.id}`;
        });
      });

      document.querySelectorAll('.course-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('Delete this course and all its materials, tasks, and exams?')) return;
          try {
            await api(`/courses/${btn.dataset.id}`, { method: 'DELETE' });
            showToast('Course deleted', 'success');
            Dashboard.render();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });

    } catch (err) {
      app.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error loading dashboard</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
  },

  renderCourseCard(course) {
    const days = course.daysUntilExam;
    let badge = '';
    if (course.examPassed) {
      badge = '<span class="course-badge badge-passed">Exam Passed</span>';
    } else if (course.progressPercent === 100) {
      badge = '<span class="course-badge badge-complete">Complete</span>';
    } else if (days <= 3) {
      badge = `<span class="course-badge badge-urgent">${days}d left</span>`;
    } else {
      badge = `<span class="course-badge badge-active">${days}d left</span>`;
    }

    const pagesPerDayText = course.examPassed ? 'Done' :
      course.remainingPages === 0 ? 'All done!' :
      `${course.pagesPerDay} pages/day`;

    return `
      <div class="course-card" data-id="${course._id}" style="--card-accent: ${course.color}">
        <div class="course-card-header">
          <h3>${escapeHtml(course.name)}</h3>
          <div class="course-card-actions">
            ${badge}
            <button class="course-delete-btn" data-id="${course._id}" title="Delete course">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>
        <div class="course-meta">
          <span><i class="fas fa-calendar"></i> ${formatDate(course.examDate)}</span>
          <span><i class="fas fa-file-alt"></i> ${course.completedPages}/${course.totalPages} pages</span>
          <span><i class="fas fa-tachometer-alt"></i> ${pagesPerDayText}</span>
        </div>
        <div>
          <div class="progress-bar">
            <div class="progress-fill ${getProgressColor(course.progressPercent)}" style="width: ${course.progressPercent}%"></div>
          </div>
          <div class="progress-info">
            <span>${course.completedTasks}/${course.totalTasks} tasks</span>
            <span class="progress-percent">${course.progressPercent}%</span>
          </div>
        </div>
      </div>
    `;
  },

  showAddCourseModal() {
    const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#06b6d4', '#ef4444', '#6366f1'];

    showModal('Add New Course', `
      <div class="form-group">
        <label class="form-label">Course Name</label>
        <input type="text" class="form-input" id="courseName" placeholder="e.g., Data Structures" required>
      </div>
      <div class="form-group">
        <label class="form-label">Exam Date</label>
        <input type="date" class="form-input" id="courseExamDate" required>
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div class="color-options">
          ${colors.map((c, i) => `
            <div class="color-option ${i === 0 ? 'selected' : ''}" data-color="${c}" style="background:${c}"></div>
          `).join('')}
        </div>
      </div>
    `, async (overlay, close) => {
      const name = overlay.querySelector('#courseName').value.trim();
      const examDate = overlay.querySelector('#courseExamDate').value;
      const colorEl = overlay.querySelector('.color-option.selected');
      const color = colorEl ? colorEl.dataset.color : '#3b82f6';

      if (!name || !examDate) {
        showToast('Please fill in all fields', 'error');
        return;
      }

      try {
        await api('/courses', {
          method: 'POST',
          body: JSON.stringify({ name, examDate, color })
        });
        close();
        showToast('Course created!', 'success');
        Dashboard.render();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.querySelectorAll('.color-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      });
    });
  }
};
