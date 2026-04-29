const express = require('express');
const Task = require('../models/Task');
const Course = require('../models/Course');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/:courseId', auth, async (req, res) => {
  try {
    const course = await Course.findOne({ _id: req.params.courseId, user: req.user.id });
    if (!course) return res.status(404).json({ success: false, error: 'Course not found' });

    const tasks = await Task.find({ course: req.params.courseId }).sort({ createdAt: -1 });
    res.json({ success: true, data: tasks });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.post('/:courseId', auth, async (req, res) => {
  try {
    const course = await Course.findOne({ _id: req.params.courseId, user: req.user.id });
    if (!course) return res.status(404).json({ success: false, error: 'Course not found' });

    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Task text is required' });
    }

    const task = await Task.create({
      course: req.params.courseId,
      user: req.user.id,
      text: text.trim()
    });

    res.status(201).json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.patch('/:courseId/:id', auth, async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      course: req.params.courseId,
      user: req.user.id
    });
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    task.completed = !task.completed;
    await task.save();

    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.delete('/:courseId/:id', auth, async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({
      _id: req.params.id,
      course: req.params.courseId,
      user: req.user.id
    });
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, data: {} });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
