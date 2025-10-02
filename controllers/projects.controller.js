// controllers/projects.controller.js
const projectsService = require('../services/projects.service');
const { handleError } = require('../utils/errorHandler');

exports.getAllProjects = async (req, res, next) => {
  try {
    const projects = await projectsService.getAllPublishedProjects();
    res.json(projects);
  } catch (err) {
    handleError(err, res, next);
  }
};

exports.getProjectById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const project = await projectsService.getPublishedProjectById(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (err) {
    handleError(err, res, next);
  }
};

exports.createProject = async (req, res, next) => {
  try {
    const project = await projectsService.createProject(req.body, req.user); // req.user — результат auth middleware
    res.status(201).json(project);
  } catch (err) {
    handleError(err, res, next);
  }
};

exports.updateProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const project = await projectsService.updateProject(id, req.body, req.user);
    res.json(project);
  } catch (err) {
    handleError(err, res, next);
  }
};

exports.deleteProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    await projectsService.deleteProject(id, req.user);
    res.status(204).send();
  } catch (err) {
    handleError(err, res, next);
  }
};
