// app.js — основной файл Express-приложения для интеграции нового слоя "Проекты"
const express = require('express');
const cors = require('cors');
const projectsRoutes = require('./routes/projects.routes');
const { handleError } = require('./utils/errorHandler');

const app = express();

// Базовые middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Подключение маршрутов для проектов
app.use('/api/projects', projectsRoutes);

// Централизованный error handler (после всех роутов)
app.use(handleError);

// Экспорт для запуска
module.exports = app;

// Если запускать напрямую: node app.js
if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
