const express = require('express');
const router = express.Router();

// Temporary in-memory sample data. Replace with a database for persistent storage.
let tasks = [];
let nextId = 1;

router.get('/', (_req, res) => res.json(tasks));

router.post('/', (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  if (!title) return res.status(400).json({ message: 'Task title is required' });
  const task = { id: nextId++, title, completed: false, createdAt: new Date().toISOString() };
  tasks.push(task);
  res.status(201).json(task);
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const task = tasks.find((item) => item.id === id);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  if (typeof req.body.title === 'string') {
    const title = req.body.title.trim();
    if (!title) return res.status(400).json({ message: 'Task title cannot be empty' });
    task.title = title;
  }
  if (typeof req.body.completed === 'boolean') task.completed = req.body.completed;
  res.json(task);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = tasks.some((item) => item.id === id);
  if (!existing) return res.status(404).json({ message: 'Task not found' });
  tasks = tasks.filter((item) => item.id !== id);
  res.status(204).end();
});

module.exports = router;
