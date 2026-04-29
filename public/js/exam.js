const ExamView = {
  timerInterval: null,

  async renderQuiz(courseId, examId) {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

    try {
      const res = await api(`/exams/${courseId}/${examId}`);
      const exam = res.data;

      if (exam.completedAt) {
        ExamView.renderResults(courseId, examId);
        return;
      }

      const questions = exam.questions;
      let timerEnabled = false;
      let timeLeft = 15 * 60;

      app.innerHTML = `
        <div class="quiz-container">
          <div class="quiz-header">
            <div>
              <button class="back-btn" id="quizBackBtn" style="display:inline-flex;margin-right:0.75rem"><i class="fas fa-arrow-left"></i></button>
              <h1 style="display:inline">${escapeHtml(exam.courseName)} - Practice Exam</h1>
            </div>
            <div class="quiz-timer" id="quizTimer" style="display:none">
              <i class="fas fa-clock"></i>
              <span id="timerDisplay">15:00</span>
            </div>
          </div>

          <div class="timer-toggle">
            <div class="toggle-switch" id="timerToggle"></div>
            <span>Enable 15-minute timer</span>
          </div>

          <div class="quiz-progress">
            <span id="answeredCount">0</span> of ${questions.length} questions answered
          </div>

          <div id="questionsContainer">
            ${questions.map((q, i) => ExamView.renderQuestion(q, i)).join('')}
          </div>

          <div class="quiz-footer">
            <span style="color:var(--text-secondary);font-size:0.85rem">Review your answers before submitting</span>
            <button class="btn btn-primary btn-lg quiz-submit" id="submitExamBtn">
              <i class="fas fa-paper-plane"></i> Submit Exam
            </button>
          </div>
        </div>
      `;

      // Timer toggle
      const timerToggle = document.getElementById('timerToggle');
      const timerDisplay = document.getElementById('quizTimer');

      timerToggle.addEventListener('click', () => {
        timerEnabled = !timerEnabled;
        timerToggle.classList.toggle('active', timerEnabled);
        timerDisplay.style.display = timerEnabled ? 'flex' : 'none';

        if (timerEnabled) {
          timeLeft = 15 * 60;
          ExamView.startTimer(timeLeft, courseId, examId);
        } else {
          ExamView.stopTimer();
        }
      });

      // Back button
      document.getElementById('quizBackBtn').addEventListener('click', () => {
        if (confirm('Leave the exam? Your answers will not be saved.')) {
          ExamView.stopTimer();
          window.location.hash = `#/course/${courseId}`;
        }
      });

      // Option selection
      document.querySelectorAll('.option-item').forEach(opt => {
        opt.addEventListener('click', () => {
          const questionIdx = opt.dataset.question;
          document.querySelectorAll(`.option-item[data-question="${questionIdx}"]`).forEach(o => {
            o.classList.remove('selected');
          });
          opt.classList.add('selected');
          opt.querySelector('input[type="radio"]').checked = true;
          ExamView.updateAnsweredCount(questions.length);
        });
      });

      // Short answer inputs
      document.querySelectorAll('.short-answer-input').forEach(input => {
        input.addEventListener('input', () => {
          ExamView.updateAnsweredCount(questions.length);
        });
      });

      // Submit
      document.getElementById('submitExamBtn').addEventListener('click', () => {
        ExamView.submitExam(courseId, examId, questions);
      });

    } catch (err) {
      app.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error loading exam</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
  },

  renderQuestion(q, index) {
    const typeLabels = { mcq: 'Multiple Choice', true_false: 'True / False', short_answer: 'Short Answer' };

    let answerHtml = '';
    if (q.type === 'mcq') {
      answerHtml = `
        <div class="options-list">
          ${q.options.map((opt, oi) => `
            <label class="option-item" data-question="${index}" data-value="${escapeHtml(opt)}">
              <input type="radio" name="q${index}" value="${escapeHtml(opt)}">
              <span class="option-radio"></span>
              <span class="option-label">${escapeHtml(opt)}</span>
            </label>
          `).join('')}
        </div>
      `;
    } else if (q.type === 'true_false') {
      answerHtml = `
        <div class="options-list">
          <label class="option-item" data-question="${index}" data-value="True">
            <input type="radio" name="q${index}" value="True">
            <span class="option-radio"></span>
            <span class="option-label">True</span>
          </label>
          <label class="option-item" data-question="${index}" data-value="False">
            <input type="radio" name="q${index}" value="False">
            <span class="option-radio"></span>
            <span class="option-label">False</span>
          </label>
        </div>
      `;
    } else {
      answerHtml = `
        <input type="text" class="short-answer-input" data-question="${index}" placeholder="Type your answer here...">
      `;
    }

    return `
      <div class="question-card">
        <div>
          <span class="question-number">${index + 1}</span>
          <span class="question-type">${typeLabels[q.type] || q.type}</span>
        </div>
        <div class="question-text">${escapeHtml(q.question)}</div>
        ${answerHtml}
      </div>
    `;
  },

  updateAnsweredCount(total) {
    let answered = 0;
    for (let i = 0; i < total; i++) {
      const radio = document.querySelector(`input[name="q${i}"]:checked`);
      const text = document.querySelector(`.short-answer-input[data-question="${i}"]`);
      if (radio || (text && text.value.trim())) answered++;
    }
    const el = document.getElementById('answeredCount');
    if (el) el.textContent = answered;
  },

  startTimer(seconds, courseId, examId) {
    ExamView.stopTimer();
    let timeLeft = seconds;

    const update = () => {
      const mins = Math.floor(timeLeft / 60);
      const secs = timeLeft % 60;
      const display = document.getElementById('timerDisplay');
      const timer = document.getElementById('quizTimer');
      if (display) display.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      if (timer) {
        timer.classList.remove('warning', 'danger');
        if (timeLeft <= 60) timer.classList.add('danger');
        else if (timeLeft <= 180) timer.classList.add('warning');
      }

      if (timeLeft <= 0) {
        ExamView.stopTimer();
        showToast('Time is up! Submitting your exam...', 'info');
        const totalQ = document.querySelectorAll('.question-card').length;
        const questions = [];
        for (let i = 0; i < totalQ; i++) {
          questions.push({ index: i });
        }
        ExamView.submitExam(courseId, examId, questions);
        return;
      }
      timeLeft--;
    };

    update();
    ExamView.timerInterval = setInterval(update, 1000);
  },

  stopTimer() {
    if (ExamView.timerInterval) {
      clearInterval(ExamView.timerInterval);
      ExamView.timerInterval = null;
    }
  },

  async submitExam(courseId, examId, questions) {
    ExamView.stopTimer();

    const answers = [];
    const totalQ = document.querySelectorAll('.question-card').length;

    for (let i = 0; i < totalQ; i++) {
      let answer = '';
      const radio = document.querySelector(`input[name="q${i}"]:checked`);
      const textInput = document.querySelector(`.short-answer-input[data-question="${i}"]`);
      if (radio) answer = radio.value;
      else if (textInput) answer = textInput.value.trim();
      answers.push({ questionIndex: i, answer });
    }

    const unanswered = answers.filter(a => !a.answer).length;
    if (unanswered > 0) {
      if (!confirm(`You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Submit anyway?`)) return;
    }

    const submitBtn = document.getElementById('submitExamBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Grading...';
    }

    try {
      await api(`/exams/${courseId}/${examId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers })
      });
      window.location.hash = `#/exam/${courseId}/${examId}/results`;
    } catch (err) {
      showToast(err.message, 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Exam';
      }
    }
  },

  async renderResults(courseId, examId) {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

    try {
      const res = await api(`/exams/${courseId}/${examId}`);
      const exam = res.data;

      if (!exam.completedAt) {
        ExamView.renderQuiz(courseId, examId);
        return;
      }

      const score = exam.score;
      const total = exam.totalQuestions;
      const percentage = Math.round((score / total) * 100);

      let scoreClass = 'poor';
      if (percentage >= 80) scoreClass = 'excellent';
      else if (percentage >= 60) scoreClass = 'good';
      else if (percentage >= 40) scoreClass = 'average';

      app.innerHTML = `
        <div class="results-container">
          <div class="results-header">
            <button class="back-btn" id="resultsBackBtn" style="display:inline-flex;margin-right:0.75rem"><i class="fas fa-arrow-left"></i></button>
            <h1 style="display:inline">${escapeHtml(exam.courseName)} - Exam Results</h1>
            <div class="score-circle ${scoreClass}">
              <span class="score-value">${score}/${total}</span>
              <span class="score-label">${percentage}%</span>
            </div>
            <p style="color:var(--text-secondary);margin-top:0.5rem">
              ${percentage >= 80 ? 'Excellent work! Keep it up!' :
                percentage >= 60 ? 'Good job! Review the incorrect answers.' :
                percentage >= 40 ? 'Not bad, but there\'s room for improvement.' :
                'Keep studying! You\'ll do better next time.'}
            </p>
          </div>

          <div id="resultsQuestions">
            ${exam.questions.map((q, i) => {
              const userAnswer = exam.userAnswers.find(a => a.questionIndex === i);
              const userAns = userAnswer ? userAnswer.answer : '';
              const isCorrect = userAns.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();

              const typeLabels = { mcq: 'Multiple Choice', true_false: 'True / False', short_answer: 'Short Answer' };

              return `
                <div class="result-question ${isCorrect ? 'correct' : 'incorrect'}">
                  <div>
                    <span class="question-number">${i + 1}</span>
                    <span class="question-type">${typeLabels[q.type] || q.type}</span>
                  </div>
                  <div class="question-text">${escapeHtml(q.question)}</div>
                  <div class="result-answer ${isCorrect ? 'user-correct' : 'user-incorrect'}">
                    <strong>Your answer:</strong> ${userAns ? escapeHtml(userAns) : '<em>Not answered</em>'}
                    ${isCorrect ? ' <i class="fas fa-check-circle"></i>' : ' <i class="fas fa-times-circle"></i>'}
                  </div>
                  ${!isCorrect ? `
                    <div class="result-correct-answer">
                      <strong>Correct answer:</strong> ${escapeHtml(q.correctAnswer)}
                    </div>
                  ` : ''}
                  ${q.explanation ? `
                    <div class="result-explanation">
                      <strong>Explanation:</strong> ${escapeHtml(q.explanation)}
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>

          <div class="results-actions">
            <button class="btn btn-outline" id="backToCourseBtn">
              <i class="fas fa-arrow-left"></i> Back to Course
            </button>
            <button class="btn btn-primary" id="retakeExamBtn">
              <i class="fas fa-redo"></i> Generate New Exam
            </button>
          </div>
        </div>
      `;

      document.getElementById('resultsBackBtn').addEventListener('click', () => {
        window.location.hash = `#/course/${courseId}`;
      });

      document.getElementById('backToCourseBtn').addEventListener('click', () => {
        window.location.hash = `#/course/${courseId}`;
      });

      document.getElementById('retakeExamBtn').addEventListener('click', () => {
        CourseDetail.generateExam(courseId);
      });

    } catch (err) {
      app.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error loading results</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
  }
};
