const express = require('express');
const Course = require('../models/Course');
const Material = require('../models/Material');
const Task = require('../models/Task');
const Exam = require('../models/Exam');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const courses = await Course.find({ user: req.user.id }).sort({ createdAt: -1 });
    const coursesWithProgress = await Promise.all(courses.map(async (course) => {
      const materials = await Material.find({ course: course._id });
      const totalPages = materials.reduce((sum, m) => sum + m.totalPages, 0);
      const completedPages = materials.reduce((sum, m) => sum + m.completedPages, 0);
      const progressPercent = totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0;

      const now = new Date();
      const examDate = new Date(course.examDate);
      const diffTime = examDate.getTime() - now.getTime();
      const daysUntilExam = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      const remainingPages = totalPages - completedPages;
      const pagesPerDay = daysUntilExam > 0 ? Math.ceil(remainingPages / daysUntilExam) : 0;

      const tasks = await Task.find({ course: course._id });
      const completedTasks = tasks.filter(t => t.completed).length;

      return {
        ...course.toObject(),
        totalPages,
        completedPages,
        progressPercent,
        daysUntilExam,
        pagesPerDay,
        remainingPages,
        totalTasks: tasks.length,
        completedTasks,
        examPassed: diffTime < 0
      };
    }));

    res.json({ success: true, data: coursesWithProgress });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { name, examDate, color } = req.body;
    if (!name || !examDate) {
      return res.status(400).json({ success: false, error: 'Name and exam date are required' });
    }

    const course = await Course.create({
      user: req.user.id,
      name,
      examDate,
      color: color || '#3b82f6'
    });

    res.status(201).json({ success: true, data: course });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const course = await Course.findOne({ _id: req.params.id, user: req.user.id });
    if (!course) return res.status(404).json({ success: false, error: 'Course not found' });

    const [materials, tasks, exams] = await Promise.all([
      Material.find({ course: course._id }).select('-textContent').sort({ createdAt: -1 }),
      Task.find({ course: course._id }).sort({ createdAt: -1 }),
      Exam.find({ course: course._id }).select('score totalQuestions completedAt createdAt').sort({ createdAt: -1 })
    ]);

    const totalPages = materials.reduce((sum, m) => sum + m.totalPages, 0);
    const completedPages = materials.reduce((sum, m) => sum + m.completedPages, 0);
    const progressPercent = totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0;

    const now = new Date();
    const diffTime = new Date(course.examDate).getTime() - now.getTime();
    const daysUntilExam = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    const remainingPages = totalPages - completedPages;
    const pagesPerDay = daysUntilExam > 0 ? Math.ceil(remainingPages / daysUntilExam) : 0;

    res.json({
      success: true,
      data: {
        ...course.toObject(),
        materials,
        tasks,
        exams,
        totalPages,
        completedPages,
        progressPercent,
        daysUntilExam,
        pagesPerDay,
        remainingPages,
        examPassed: diffTime < 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { name, examDate, color } = req.body;
    const course = await Course.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { name, examDate, color },
      { new: true }
    );
    if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
    res.json({ success: true, data: course });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const course = await Course.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!course) return res.status(404).json({ success: false, error: 'Course not found' });

    await Promise.all([
      Material.deleteMany({ course: course._id }),
      Task.deleteMany({ course: course._id }),
      Exam.deleteMany({ course: course._id })
    ]);

    res.json({ success: true, data: {} });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
