const CourseDetail = {
  async render(courseId) {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

    try {
      const res = await api(`/courses/${courseId}`);
      const course = res.data;
      const days = course.daysUntilExam;
      const pagesPerDayText = course.examPassed ? 'Exam passed' :
        course.remainingPages === 0 ? 'All done!' :
        `${course.pagesPerDay} pages/day`;

      app.innerHTML = `
        <div class="course-detail-header">
          <button class="back-btn" id="backBtn"><i class="fas fa-arrow-left"></i></button>
          <div class="course-detail-title">
            <h1>${escapeHtml(course.name)}</h1>
            <p><i class="fas fa-calendar"></i> Exam: ${formatDate(course.examDate)} ${course.examPassed ? '(passed)' : `(${days} days left)`}</p>
          </div>
        </div>

        <div class="course-stats-row">
          <div class="stat-card">
            <div class="stat-icon blue"><i class="fas fa-chart-line"></i></div>
            <div class="stat-info">
              <h3>${course.progressPercent}%</h3>
              <p>Progress</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon green"><i class="fas fa-file-alt"></i></div>
            <div class="stat-info">
              <h3>${course.completedPages}/${course.totalPages}</h3>
              <p>Pages Done</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon orange"><i class="fas fa-tachometer-alt"></i></div>
            <div class="stat-info">
              <h3>${pagesPerDayText}</h3>
              <p>Study Pace</p>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon red"><i class="fas fa-hourglass-half"></i></div>
            <div class="stat-info">
              <h3>${course.remainingPages}</h3>
              <p>Pages Left</p>
            </div>
          </div>
        </div>

        <div style="margin-bottom:1.5rem">
          <div class="progress-bar" style="height:10px">
            <div class="progress-fill ${getProgressColor(course.progressPercent)}" style="width:${course.progressPercent}%"></div>
          </div>
        </div>

        <div class="course-sections">
          <div>
            <div class="card">
              <div class="card-header">
                <h3 class="card-title"><i class="fas fa-book" style="color:var(--accent);margin-right:0.5rem"></i>Study Materials</h3>
                <button class="btn btn-primary btn-sm" id="openUploadModalBtn">
                  <i class="fas fa-upload"></i> Upload Material
                </button>
              </div>

              <div id="materialsList">
                ${course.materials.length === 0 ?
                  `<div class="empty-state" style="padding:2rem 1rem">
                    <i class="fas fa-folder-open" style="font-size:2rem"></i>
                    <h3>No materials yet</h3>
                    <p>Upload a PDF to start studying and tracking your progress page by page.</p>
                  </div>` :
                  course.materials.map(m => CourseDetail.renderMaterial(m, courseId)).join('')}
              </div>
            </div>

            <div class="card" style="margin-top:1.5rem">
              <div class="card-header">
                <h3 class="card-title"><i class="fas fa-brain" style="color:var(--accent);margin-right:0.5rem"></i>AI Exam Generator</h3>
              </div>
              <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:1rem">Generate a practice exam based on the actual content of your uploaded materials.</p>
              <button class="btn btn-primary" id="generateExamBtn" ${course.materials.length === 0 ? 'disabled' : ''}>
                <i class="fas fa-magic"></i> Generate Practice Exam
              </button>
              ${course.exams.length > 0 ? `
                <div class="exam-history" style="margin-top:1.25rem">
                  <h4 style="font-size:0.9rem;font-weight:600;margin-bottom:0.75rem;color:var(--text-secondary)">Past Exams</h4>
                  ${course.exams.map(exam => `
                    <div class="exam-item" data-exam-id="${exam._id}" data-course-id="${courseId}" style="cursor:pointer">
                      <div><span class="exam-date">${formatDate(exam.createdAt)}</span></div>
                      <div>
                        ${exam.completedAt ?
                          `<span class="exam-score" style="color:${exam.score >= 7 ? 'var(--success)' : exam.score >= 5 ? 'var(--warning)' : 'var(--danger)'}">${exam.score}/${exam.totalQuestions}</span>` :
                          '<span class="course-badge badge-active">In Progress</span>'}
                      </div>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          </div>

          <div>
            <div class="card">
              <div class="card-header">
                <h3 class="card-title"><i class="fas fa-tasks" style="color:var(--accent);margin-right:0.5rem"></i>Tasks</h3>
              </div>
              <div class="add-form">
                <input type="text" class="form-input" id="taskText" placeholder="Add a new task...">
                <button class="btn btn-primary btn-sm" id="addTaskBtn"><i class="fas fa-plus"></i></button>
              </div>
              <div id="tasksList">
                ${course.tasks.length === 0 ?
                  '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:1rem">No tasks yet.</p>' :
                  course.tasks.map(t => CourseDetail.renderTask(t, courseId)).join('')}
              </div>
            </div>
          </div>
        </div>
      `;

      // ── Event listeners ──────────────────────────────
      document.getElementById('backBtn').onclick = () => { window.location.hash = '#/dashboard'; };
      document.getElementById('openUploadModalBtn').onclick = () => CourseDetail.showUploadModal(courseId);
      document.getElementById('addTaskBtn').onclick = () => CourseDetail.addTask(courseId);
      document.getElementById('taskText').onkeydown = (e) => { if (e.key === 'Enter') CourseDetail.addTask(courseId); };
      document.getElementById('generateExamBtn').onclick = () => CourseDetail.generateExam(courseId);

      // Click material → open reader
      document.querySelectorAll('.material-card-clickable').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.material-delete')) return;
          const matId = card.dataset.id;
          window.location.hash = `#/reader/${courseId}/${matId}`;
        });
      });

      // Delete material
      document.querySelectorAll('.material-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('Delete this material?')) return;
          try {
            await api(`/materials/${courseId}/${btn.dataset.id}`, { method: 'DELETE' });
            showToast('Material removed', 'success');
            CourseDetail.render(courseId);
          } catch (err) { showToast(err.message, 'error'); }
        });
      });

      // Task toggle & delete
      document.querySelectorAll('.task-checkbox').forEach(cb => {
        cb.onclick = async () => {
          try { await api(`/tasks/${courseId}/${cb.dataset.id}`, { method: 'PATCH' }); CourseDetail.render(courseId); }
          catch (err) { showToast(err.message, 'error'); }
        };
      });
      document.querySelectorAll('.task-delete').forEach(btn => {
        btn.onclick = async () => {
          try { await api(`/tasks/${courseId}/${btn.dataset.id}`, { method: 'DELETE' }); CourseDetail.render(courseId); }
          catch (err) { showToast(err.message, 'error'); }
        };
      });

      // Exam history
      document.querySelectorAll('.exam-item').forEach(item => {
        item.onclick = () => { window.location.hash = `#/exam/${item.dataset.courseId}/${item.dataset.examId}`; };
      });

    } catch (err) {
      app.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error loading course</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
  },

  renderMaterial(m, courseId) {
    const percent = m.totalPages > 0 ? Math.round((m.completedPages / m.totalPages) * 100) : 0;
    const fileIcon = m.fileType === 'application/pdf' ? 'fa-file-pdf' :
      (m.fileType && m.fileType.startsWith('image/')) ? 'fa-file-image' : 'fa-file-alt';
    const iconColor = m.fileType === 'application/pdf' ? 'var(--danger)' : 'var(--accent)';

    return `
      <div class="material-card-clickable" data-id="${m._id}" title="Click to open and study">
        <div class="material-item">
          <div class="material-icon" style="background:${iconColor}15;color:${iconColor}">
            <i class="fas ${fileIcon}"></i>
          </div>
          <div class="material-info">
            <div class="material-title">${escapeHtml(m.title)}</div>
            ${m.fileName ? `<div class="material-file-badge"><i class="fas ${fileIcon}"></i><span class="material-file-name">${escapeHtml(m.fileName)}</span><span class="material-file-size">(${CourseDetail.formatFileSize(m.fileSize)})</span></div>` : ''}
            <div class="material-progress-text">${m.completedPages}/${m.totalPages} pages done (${percent}%)</div>
            <div class="progress-bar" style="height:4px;margin-top:4px">
              <div class="progress-fill ${getProgressColor(percent)}" style="width:${percent}%"></div>
            </div>
          </div>
          <div class="material-actions" style="flex-direction:column;align-items:flex-end;gap:0.5rem">
            <span class="material-open-hint"><i class="fas fa-arrow-right"></i></span>
            <button class="item-delete-btn material-delete" data-id="${m._id}" title="Delete material"><i class="fas fa-trash-alt"></i></button>
          </div>
        </div>
      </div>
    `;
  },

  renderTask(t, courseId) {
    return `
      <div class="task-item">
        <div class="task-checkbox ${t.completed ? 'checked' : ''}" data-id="${t._id}"><i class="fas fa-check"></i></div>
        <span class="task-text ${t.completed ? 'completed' : ''}">${escapeHtml(t.text)}</span>
        <button class="item-delete-btn task-delete" data-id="${t._id}" title="Delete task"><i class="fas fa-trash-alt"></i></button>
      </div>
    `;
  },

  // ── Upload Modal (title + file only, no pages input) ─
  showUploadModal(courseId) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:520px">
        <div class="modal-header">
          <h2>Upload Study Material</h2>
          <button class="modal-close"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Material Title <span style="color:var(--danger)">*</span></label>
            <input type="text" class="form-input" id="uploadTitle" placeholder="e.g., Chapter 3 - Data Structures">
          </div>
          <div class="form-group">
            <label class="form-label">Upload File <span style="color:var(--danger)">*</span> <span style="color:var(--text-muted);font-weight:400">(PDF or image, max 20MB)</span></label>
            <div class="file-upload-zone" id="fileUploadZone">
              <input type="file" id="uploadFile" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" hidden>
              <div class="file-upload-placeholder" id="filePlaceholder">
                <i class="fas fa-cloud-upload-alt"></i>
                <p>Click to select a file or drag & drop</p>
                <span>PDF files will be parsed for page count automatically</span>
              </div>
              <div class="file-upload-preview" id="filePreview" style="display:none">
                <div class="file-preview-info">
                  <i class="fas fa-file-pdf" id="filePreviewIcon"></i>
                  <div>
                    <p class="file-preview-name" id="filePreviewName"></p>
                    <span class="file-preview-size" id="filePreviewSize"></span>
                  </div>
                </div>
                <button class="btn-ghost btn-sm" id="fileRemoveBtn" type="button"><i class="fas fa-times"></i></button>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline modal-cancel-btn">Cancel</button>
          <button class="btn btn-primary" id="uploadSubmitBtn"><i class="fas fa-upload"></i> Upload</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').onclick = close;
    overlay.querySelector('.modal-cancel-btn').onclick = close;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const fileInput = overlay.querySelector('#uploadFile');
    const dropZone = overlay.querySelector('#fileUploadZone');
    const placeholder = overlay.querySelector('#filePlaceholder');
    const preview = overlay.querySelector('#filePreview');
    let selectedFile = null;

    dropZone.addEventListener('click', (e) => { if (!e.target.closest('#fileRemoveBtn')) fileInput.click(); });
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault(); dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => { if (fileInput.files.length > 0) handleFile(fileInput.files[0]); });

    function handleFile(file) {
      const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowed.includes(file.type)) { showToast('Only PDF and image files allowed', 'error'); return; }
      if (file.size > 20 * 1024 * 1024) { showToast('File too large (max 20MB)', 'error'); return; }
      selectedFile = file;
      placeholder.style.display = 'none';
      preview.style.display = 'flex';
      overlay.querySelector('#filePreviewName').textContent = file.name;
      overlay.querySelector('#filePreviewSize').textContent = CourseDetail.formatFileSize(file.size);
      const icon = overlay.querySelector('#filePreviewIcon');
      icon.className = file.type === 'application/pdf' ? 'fas fa-file-pdf' : 'fas fa-file-image';
      icon.style.color = file.type === 'application/pdf' ? 'var(--danger)' : 'var(--accent)';
      const titleInput = overlay.querySelector('#uploadTitle');
      if (!titleInput.value.trim()) titleInput.value = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    }

    overlay.querySelector('#fileRemoveBtn').addEventListener('click', (e) => {
      e.stopPropagation(); selectedFile = null; fileInput.value = '';
      placeholder.style.display = 'flex'; preview.style.display = 'none';
    });

    overlay.querySelector('#uploadTitle').focus();

    overlay.querySelector('#uploadSubmitBtn').addEventListener('click', async () => {
      const title = overlay.querySelector('#uploadTitle').value.trim();
      if (!title) { showToast('Please enter a title', 'error'); return; }
      if (!selectedFile) { showToast('Please select a file to upload', 'error'); return; }

      const submitBtn = overlay.querySelector('#uploadSubmitBtn');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

      try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('title', title);
        // totalPages not needed — backend calculates from PDF
        formData.append('totalPages', '1'); // placeholder, backend overrides for PDFs

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/materials/${courseId}/upload`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Upload failed');

        close();
        showToast(`Uploaded! ${data.data.totalPages} pages detected.`, 'success');
        CourseDetail.render(courseId);
      } catch (err) {
        showToast(err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-upload"></i> Upload';
      }
    });
  },

  async addTask(courseId) {
    const textEl = document.getElementById('taskText');
    const text = textEl.value.trim();
    if (!text) { showToast('Please enter a task', 'error'); return; }
    try {
      await api(`/tasks/${courseId}`, { method: 'POST', body: JSON.stringify({ text }) });
      CourseDetail.render(courseId);
    } catch (err) { showToast(err.message, 'error'); }
  },

  async generateExam(courseId) {
    const overlay = document.createElement('div');
    overlay.className = 'generating-overlay';
    overlay.innerHTML = `<div class="spinner"></div><p>AI is reading your materials...</p><span class="sub-text">Generating exam from your uploaded content</span>`;
    document.body.appendChild(overlay);
    try {
      const res = await api(`/exams/${courseId}/generate`, { method: 'POST' });
      overlay.remove();
      showToast('Exam generated!', 'success');
      window.location.hash = `#/exam/${courseId}/${res.data.examId}`;
    } catch (err) { overlay.remove(); showToast(err.message, 'error'); }
  },

  formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
};
