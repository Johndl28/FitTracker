const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const FoodLog = require('./models/FoodLog');
const ExerciseLog = require('./models/ExerciseLog');
const Settings = require('./models/Settings');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB conectado'))
  .catch(err => console.log(err));

// Middleware para cargar settings globales
app.use(async (req, res, next) => {
  let settings = await Settings.findOne();
  if (!settings) settings = await Settings.create({});
  res.locals.settings = settings;
  next();
});

// Ruta principal (dashboard)
app.get('/', async (req, res) => {
  const today = new Date();
  today.setHours(0,0,0,0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const foodToday = await FoodLog.aggregate([
    { $match: { date: { $gte: today, $lt: tomorrow } } },
    { $group: { _id: null, cal: { $sum: '$calories' }, prot: { $sum: '$protein' }, fat: { $sum: '$fat' } } }
  ]);

  const exerciseToday = await ExerciseLog.aggregate([
    { $match: { date: { $gte: today, $lt: tomorrow } } },
    { $group: { _id: null, burned: { $sum: '$kcalBurned' }, minutes: { $sum: '$duration' } } }
  ]);

  const recentFood = await FoodLog.find().sort({ date: -1 }).limit(5);
  const recentExercise = await ExerciseLog.find().sort({ date: -1 }).limit(5);

  res.render('dashboard', {
    foodToday: foodToday[0] || { cal: 0, prot: 0, fat: 0 },
    exerciseToday: exerciseToday[0] || { burned: 0, minutes: 0 },
    recentFood,
    recentExercise,
    netCalories: (foodToday[0]?.cal || 0) - (exerciseToday[0]?.burned || 0)
  });
});

// Registrar alimento
app.get('/log-food', (req, res) => res.render('log-food'));
app.post('/log-food', async (req, res) => {
  await FoodLog.create(req.body);
  res.redirect('/');
});

// Registrar ejercicio
app.get('/log-exercise', (req, res) => res.render('log-exercise'));
app.post('/log-exercise', async (req, res) => {
  await ExerciseLog.create(req.body);
  res.redirect('/');
});

// Historia y editar
app.get('/history', async (req, res) => {
  const foods = await FoodLog.find().sort({ date: -1 });
  const exercises = await ExerciseLog.find().sort({ date: -1 });
  res.render('history', { foods, exercises });
});

app.get('/edit-food/:id', async (req, res) => {
  const log = await FoodLog.findById(req.params.id);
  res.render('log-food', { log, edit: true });
});
app.post('/edit-food/:id', async (req, res) => {
  await FoodLog.findByIdAndUpdate(req.params.id, req.body);
  res.redirect('/history');
});

app.get('/edit-exercise/:id', async (req, res) => {
  const log = await ExerciseLog.findById(req.params.id);
  res.render('log-exercise', { log, edit: true });
});
app.post('/edit-exercise/:id', async (req, res) => {
  await ExerciseLog.findByIdAndUpdate(req.params.id, req.body);
  res.redirect('/history');
});

// Eliminar
app.post('/delete-food/:id', async (req, res) => {
  await FoodLog.findByIdAndDelete(req.params.id);
  res.redirect('/history');
});
app.post('/delete-exercise/:id', async (req, res) => {
  await ExerciseLog.findByIdAndDelete(req.params.id);
  res.redirect('/history');
});

// API para gráficos (diario/semanal/mensual)
app.get('/api/progress', async (req, res) => {
  const period = req.query.period || 'week';
  let days = period === 'month' ? 30 : period === 'week' ? 7 : 1;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const foodData = await FoodLog.aggregate([
    { $match: { date: { $gte: startDate } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }, cal: { $sum: "$calories" }, prot: { $sum: "$protein" }, fat: { $sum: "$fat" } } },
    { $sort: { _id: 1 } }
  ]);

  const exerciseData = await ExerciseLog.aggregate([
    { $match: { date: { $gte: startDate } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }, burned: { $sum: "$kcalBurned" } } },
    { $sort: { _id: 1 } }
  ]);

  res.json({ foodData, exerciseData, period });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 FitTrack corriendo en http://localhost:${PORT}`));