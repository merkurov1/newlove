-- Rollback: Pierrot workspace grooming, approval and context summaries
-- Date: 2026-11-26
--
-- WARNING: this removes the audit/proposal journal and summary versions.
-- Original conversations, messages, tasks, decisions and projects are not
-- touched. Export the journal first if it is still needed for audit purposes.

begin;

drop table if exists public.pierrot_github_task_links;
drop table if exists public.pierrot_context_summaries;
drop table if exists public.pierrot_workspace_operations;
drop table if exists public.pierrot_workspace_proposals;
drop table if exists public.pierrot_workspace_audits;

commit;
