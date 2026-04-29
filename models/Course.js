const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },
  examDate: { type: Date, required: true },
  color: { type: String, default: '#3b82f6' }
}, { timestamps: true });

module.exports = mongoose.model('Course', courseSchema);
