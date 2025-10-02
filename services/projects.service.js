// services/projects.service.js
const { createClient } = require('@supabase/supabase-js');
const { ForbiddenError, NotFoundError } = require('../utils/errors');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.getAllPublishedProjects = async () => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('published', true)
    .order('publishedAt', { ascending: false });
  if (error) throw error;
  return data;
};

exports.getPublishedProjectById = async (id) => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .eq('published', true)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
};

exports.createProject = async (projectData, user) => {
  if (!user || user.role !== 'ADMIN') throw new ForbiddenError('Only admin can create projects');
  const { data, error } = await supabase
    .from('projects')
    .insert([projectData])
    .single();
  if (error) throw error;
  return data;
};

exports.updateProject = async (id, projectData, user) => {
  if (!user || user.role !== 'ADMIN') throw new ForbiddenError('Only admin can update projects');
  const { data, error } = await supabase
    .from('projects')
    .update(projectData)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
};

exports.deleteProject = async (id, user) => {
  if (!user || user.role !== 'ADMIN') throw new ForbiddenError('Only admin can delete projects');
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);
  if (error) throw error;
};
