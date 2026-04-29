const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  questions: [{
    type: { type: String, enum: ['mcq', 'true_false', 'short_answer'], required: true },
    question: { type: String, required: true },
    options: [String],
    correctAnswer: { type: String, required: true },
    explanation: { type: String, default: '' }
  }],
  userAnswers: [{
    questionIndex: Number,
    answer: String
  }],
  score: { type: Number, default: null },
  totalQuestions: { type: Number, default: 10 },
  completedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Exam', examSchema);
