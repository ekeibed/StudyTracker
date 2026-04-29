const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Exam = require('../models/Exam');
const Course = require('../models/Course');
const Material = require('../models/Material');
const Task = require('../models/Task');
const auth = require('../middleware/auth');
const router = express.Router();

router.post('/:courseId/generate', auth, async (req, res) => {
  try {
    const course = await Course.findOne({ _id: req.params.courseId, user: req.user.id });
    if (!course) return res.status(404).json({ success: false, error: 'Course not found' });

    // Get materials WITH text content for AI
    const [materials, tasks] = await Promise.all([
      Material.find({ course: course._id }).select('title totalPages completedPages textContent'),
      Task.find({ course: course._id })
    ]);

    if (materials.length === 0) {
      return res.status(400).json({ success: false, error: 'Add study materials first before generating an exam.' });
    }

    // Build rich context from actual PDF content
    let materialContext = '';
    materials.forEach(m => {
      materialContext += `\n--- Material: ${m.title} (${m.totalPages} pages) ---\n`;
      if (m.textContent && m.textContent.trim()) {
        // Include up to 8000 chars per material to stay within token limits
        materialContext += m.textContent.substring(0, 8000) + '\n';
      } else {
        materialContext += '(No text content available)\n';
      }
    });

    // Trim total context to ~30k chars to avoid token limits
    if (materialContext.length > 30000) {
      materialContext = materialContext.substring(0, 30000) + '\n... (content truncated)';
    }

    const tasksList = tasks.filter(t => t.completed).map(t => `- ${t.text}`).join('\n');

    const prompt = `You are an academic exam generator. Based on the following course information and study material content, generate exactly 10 exam questions that test the student's understanding of the material.

Course: ${course.name}

STUDY MATERIAL CONTENT:
${materialContext}

${tasksList ? `\nCompleted Study Tasks:\n${tasksList}\n` : ''}

IMPORTANT: Generate questions DIRECTLY from the study material content above. The questions should test actual knowledge from the materials, not generic questions.

Generate a JSON array of exactly 10 questions with this distribution:
- 4 Multiple Choice Questions (type: "mcq") with exactly 4 options
- 3 True/False Questions (type: "true_false")
- 3 Short Answer Questions (type: "short_answer")

Each question object must have:
- "type": one of "mcq", "true_false", "short_answer"
- "question": the question text
- "options": array of 4 strings (only for mcq type, omit for others)
- "correctAnswer": the correct answer string (for mcq, must match one of the options exactly; for true_false, must be "True" or "False")
- "explanation": brief explanation of why this is correct

Return ONLY a valid JSON array, no markdown fences, no extra text.`;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });

    let questions;
    try {
      const text = result.response.text();
      questions = JSON.parse(text);
    } catch (parseErr) {
      return res.status(502).json({ success: false, error: 'Failed to parse AI response. Please try again.' });
    }

    if (!Array.isArray(questions) || questions.length < 1) {
      return res.status(502).json({ success: false, error: 'Invalid AI response format. Please try again.' });
    }

    const exam = await Exam.create({
      course: course._id,
      user: req.user.id,
      questions,
      totalQuestions: questions.length
    });

    const safeQuestions = questions.map((q, i) => ({
      index: i,
      type: q.type,
      question: q.question,
      options: q.options || []
    }));

    res.status(201).json({
      success: true,
      data: {
        examId: exam._id,
        courseId: course._id,
        courseName: course.name,
        totalQuestions: questions.length,
        questions: safeQuestions
      }
    });
  } catch (err) {
    console.error('Exam generation error:', err);
    res.status(502).json({ success: false, error: 'Failed to generate exam. Please check your API key and try again.' });
  }
});

router.get('/:courseId', auth, async (req, res) => {
  try {
    const exams = await Exam.find({ course: req.params.courseId, user: req.user.id })
      .select('score totalQuestions completedAt createdAt')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: exams });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.get('/:courseId/:id', auth, async (req, res) => {
  try {
    const exam = await Exam.findOne({
      _id: req.params.id,
      course: req.params.courseId,
      user: req.user.id
    });
    if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });

    const course = await Course.findById(req.params.courseId);

    if (exam.completedAt) {
      return res.json({
        success: true,
        data: {
          ...exam.toObject(),
          courseName: course ? course.name : 'Unknown'
        }
      });
    }

    const safeQuestions = exam.questions.map((q, i) => ({
      index: i,
      type: q.type,
      question: q.question,
      options: q.options || []
    }));

    res.json({
      success: true,
      data: {
        _id: exam._id,
        course: exam.course,
        courseName: course ? course.name : 'Unknown',
        totalQuestions: exam.totalQuestions,
        questions: safeQuestions,
        completedAt: null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.post('/:courseId/:id/submit', auth, async (req, res) => {
  try {
    const exam = await Exam.findOne({
      _id: req.params.id,
      course: req.params.courseId,
      user: req.user.id
    });
    if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });
    if (exam.completedAt) return res.status(400).json({ success: false, error: 'Exam already submitted' });

    const { answers } = req.body;
    if (!Array.isArray(answers)) {
      return res.status(400).json({ success: false, error: 'Answers array is required' });
    }

    exam.userAnswers = answers;

    let correctCount = 0;
    const results = exam.questions.map((q, i) => {
      const userAnswer = answers.find(a => a.questionIndex === i);
      const userAns = (userAnswer ? userAnswer.answer : '').trim().toLowerCase();
      const correctAns = q.correctAnswer.trim().toLowerCase();
      const isCorrect = userAns === correctAns;
      if (isCorrect) correctCount++;

      return {
        index: i,
        type: q.type,
        question: q.question,
        options: q.options || [],
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        userAnswer: userAnswer ? userAnswer.answer : '',
        isCorrect
      };
    });

    exam.score = correctCount;
    exam.completedAt = new Date();
    await exam.save();

    const course = await Course.findById(req.params.courseId);

    res.json({
      success: true,
      data: {
        examId: exam._id,
        courseName: course ? course.name : 'Unknown',
        score: correctCount,
        totalQuestions: exam.questions.length,
        percentage: Math.round((correctCount / exam.questions.length) * 100),
        results
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
