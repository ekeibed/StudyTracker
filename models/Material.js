const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true },
  totalPages: { type: Number, required: true, min: 1 },
  completedPages: { type: Number, default: 0, min: 0 },
  pagesCompleted: [{ type: Number }],
  fileName: { type: String, default: null },
  fileUrl: { type: String, default: null },
  fileType: { type: String, default: null },
  fileSize: { type: Number, default: null },
  textContent: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Material', materialSchema);
