const express = require('express');
const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const Material = require('../models/Material');
const Course = require('../models/Course');
const User = require('../models/User');
const auth = require('../middleware/auth');
const upload = require('../config/multer');
const router = express.Router();

// ── Streak helper ──────────────────────────────────────
function updateStreak(user) {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const last = user.studyStreak.lastStudyDate;

  if (last === today) return;

  if (last === yesterday) {
    user.studyStreak.currentStreak += 1;
  } else {
    user.studyStreak.currentStreak = 1;
  }

  if (user.studyStreak.currentStreak > user.studyStreak.longestStreak) {
    user.studyStreak.longestStreak = user.studyStreak.currentStreak;
  }

  user.studyStreak.lastStudyDate = today;
}

// ── GET materials for a course ─────────────────────────
router.get('/:courseId', auth, async (req, res) => {
  try {
    const course = await Course.findOne({ _id: req.params.courseId, user: req.user.id });
    if (!course) return res.status(404).json({ success: false, error: 'Course not found' });

    const materials = await Material.find({ course: req.params.courseId })
      .select('-textContent')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: materials });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ── GET single material (for reader view) ──────────────
router.get('/:courseId/:id', auth, async (req, res) => {
  try {
    const material = await Material.findOne({
      _id: req.params.id,
      course: req.params.courseId,
      user: req.user.id
    }).select('-textContent');
    if (!material) return res.status(404).json({ success: false, error: 'Material not found' });
    res.json({ success: true, data: material });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ── GET material text content (for AI exam generation) ─
router.get('/:courseId/:id/text', auth, async (req, res) => {
  try {
    const material = await Material.findOne({
      _id: req.params.id,
      course: req.params.courseId,
      user: req.user.id
    }).select('textContent title');
    if (!material) return res.status(404).json({ success: false, error: 'Material not found' });
    res.json({ success: true, data: { title: material.title, textContent: material.textContent } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ── POST upload material with file ─────────────────────
router.post('/:courseId/upload', auth, (req, res) => {
  upload.single('file')(req, res, async (multerErr) => {
    if (multerErr) {
      return res.status(400).json({ success: false, error: multerErr.message });
    }

    try {
      const course = await Course.findOne({ _id: req.params.courseId, user: req.user.id });
      if (!course) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(404).json({ success: false, error: 'Course not found' });
      }

      const title = req.body.title;
      if (!title || !title.trim()) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, error: 'Title is required' });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'File is required. Please upload a PDF or image.' });
      }

      let totalPages = 1;
      let textContent = '';

      // Parse PDF to get page count and text
      if (req.file.mimetype === 'application/pdf') {
        try {
          const fileBuffer = new Uint8Array(fs.readFileSync(req.file.path));
          const pdfDoc = await pdfjsLib.getDocument({ data: fileBuffer }).promise;
          totalPages = pdfDoc.numPages || 1;

          // Extract text content for AI exam generation
          let extractedText = '';
          for (let i = 1; i <= pdfDoc.numPages && extractedText.length < 50000; i++) {
            const page = await pdfDoc.getPage(i);
            const content = await page.getTextContent();
            extractedText += content.items.map(item => item.str).join(' ') + '\n';
          }
          textContent = extractedText.substring(0, 50000);
        } catch (pdfErr) {
          console.error('PDF parse error:', pdfErr.message);
          // Fallback: 1 page if parsing fails
          totalPages = 1;
        }
      }
      // For images, it's always 1 page
      if (req.file.mimetype.startsWith('image/')) {
        totalPages = 1;
      }

      const material = await Material.create({
        course: req.params.courseId,
        user: req.user.id,
        title: title.trim(),
        totalPages,
        completedPages: 0,
        pagesCompleted: [],
        fileName: req.file.originalname,
        fileUrl: `/uploads/${req.file.filename}`,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        textContent: textContent || null
      });

      // Return without textContent (it's large)
      const result = material.toObject();
      delete result.textContent;

      res.status(201).json({ success: true, data: result });
    } catch (err) {
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      console.error('Upload error:', err);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  });
});

// ── PATCH toggle a page as done/undone ─────────────────
router.patch('/:courseId/:id/toggle-page', auth, async (req, res) => {
  try {
    const { pageNumber } = req.body;
    if (typeof pageNumber !== 'number' || pageNumber < 1) {
      return res.status(400).json({ success: false, error: 'Valid page number is required' });
    }

    const material = await Material.findOne({
      _id: req.params.id,
      course: req.params.courseId,
      user: req.user.id
    });
    if (!material) return res.status(404).json({ success: false, error: 'Material not found' });

    if (pageNumber > material.totalPages) {
      return res.status(400).json({ success: false, error: 'Page number exceeds total pages' });
    }

    const idx = material.pagesCompleted.indexOf(pageNumber);
    if (idx === -1) {
      // Mark page as done
      material.pagesCompleted.push(pageNumber);
    } else {
      // Unmark page
      material.pagesCompleted.splice(idx, 1);
    }

    material.completedPages = material.pagesCompleted.length;
    await material.save();

    // Update streak
    const user = await User.findById(req.user.id);
    updateStreak(user);
    await user.save();

    res.json({
      success: true,
      data: {
        _id: material._id,
        completedPages: material.completedPages,
        pagesCompleted: material.pagesCompleted,
        totalPages: material.totalPages
      },
      streak: user.studyStreak
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ── PATCH update progress (legacy, keep for compatibility) ─
router.patch('/:courseId/:id/progress', auth, async (req, res) => {
  try {
    const { completedPages } = req.body;
    const material = await Material.findOne({
      _id: req.params.id,
      course: req.params.courseId,
      user: req.user.id
    });
    if (!material) return res.status(404).json({ success: false, error: 'Material not found' });

    material.completedPages = Math.max(0, Math.min(completedPages, material.totalPages));
    await material.save();

    const user = await User.findById(req.user.id);
    updateStreak(user);
    await user.save();

    res.json({ success: true, data: material, streak: user.studyStreak });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ── DELETE material ────────────────────────────────────
router.delete('/:courseId/:id', auth, async (req, res) => {
  try {
    const material = await Material.findOneAndDelete({
      _id: req.params.id,
      course: req.params.courseId,
      user: req.user.id
    });
    if (!material) return res.status(404).json({ success: false, error: 'Material not found' });

    if (material.fileUrl) {
      const filePath = path.join(__dirname, '..', material.fileUrl);
      try { fs.unlinkSync(filePath); } catch (e) {}
    }

    res.json({ success: true, data: {} });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
