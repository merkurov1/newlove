// routes/projects.routes.js
const express = require('express');
const router = express.Router();
const projectsController = require('../controllers/projects.controller');
const { validateBody, validateParams } = require('../validation/validate');
const { projectCreateSchema, projectUpdateSchema, projectIdParamSchema } = require('../validation/projects.validation');

// Получить все опубликованные проекты
router.get('/', projectsController.getAllProjects);

// Получить проект по id (только опубликованный)
router.get('/:id', validateParams(projectIdParamSchema), projectsController.getProjectById);

// Создать новый проект (только для админа)
router.post('/', validateBody(projectCreateSchema), projectsController.createProject);

// Обновить проект (только для админа)
router.put('/:id', validateParams(projectIdParamSchema), validateBody(projectUpdateSchema), projectsController.updateProject);

// Удалить проект (только для админа)
router.delete('/:id', validateParams(projectIdParamSchema), projectsController.deleteProject);

module.exports = router;
