import type { SkillCheck, SkillDefinition, SkillTest } from './types';

export type { SkillCheck } from './types';

const DANGEROUS_TOOL = /(shell|exec|deploy|production|delete|drop\s+table|sql|admin|cron|worker)/i;
const APPROVAL_CONSTRAINT = /(approval|approve|confirm|permission|разреш|подтвержд|согласован)/i;
const AUTH_CONSTRAINT = /(auth|owner|permission|role|разреш|доступ|владел)/i;
const UNBOUNDED_LOOP =
  /(while\s*\(\s*true|for\s*\(\s*;\s*;|бесконечн|infinite\s+loop|loop\s+forever)/i;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function lines(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function validTest(test: SkillTest): boolean {
  return Boolean(text(test?.name) && text(test?.expected));
}

/**
 * Deterministic skill checks. They are intentionally structural, not a promise
 * that a procedure works in production. A passing run means the skill is
 * well-formed, bounded and does not contain an obvious permission bypass.
 */
export function validateSkillDefinition(definition: SkillDefinition): {
  passed: boolean;
  checks: SkillCheck[];
} {
  const checks: SkillCheck[] = [];
  const name = text(definition.name);
  const description = text(definition.description);
  const purpose = text(definition.purpose);
  const conditions = lines(definition.conditions);
  const inputs = lines(definition.inputs);
  const steps = lines(definition.steps);
  const tools = lines(definition.tools);
  const constraints = lines(definition.constraints);
  const expectedResult = text(definition.expectedResult);
  const tests = Array.isArray(definition.tests) ? definition.tests.filter(validTest) : [];

  checks.push({
    name: 'name',
    passed: name.length > 0 && name.length <= 120,
    detail: 'A unique name of 1–120 characters is required.',
  });

  checks.push({
    name: 'description',
    passed: description.length > 0 && description.length <= 2_000,
    detail: 'A description is required.',
  });

  checks.push({
    name: 'purpose',
    passed: purpose.length > 0,
    detail: 'The purpose must explain when the procedure is useful.',
  });

  checks.push({
    name: 'conditions',
    passed: conditions.length > 0,
    detail: 'At least one application condition is required.',
  });

  checks.push({
    name: 'steps',
    passed: steps.length >= 2 && steps.length <= 30,
    detail: 'A procedure needs 2–30 explicit steps.',
  });

  checks.push({
    name: 'expected_result',
    passed: expectedResult.length > 0,
    detail: 'The expected result is required.',
  });

  checks.push({
    name: 'tests',
    passed: tests.length > 0,
    detail: 'At least one control test with an expected outcome is required.',
  });

  const unbounded = steps.some((step) => UNBOUNDED_LOOP.test(step));
  checks.push({
    name: 'bounded_steps',
    passed: !unbounded,
    detail: unbounded ? 'Unbounded loops are not allowed in a skill.' : 'Steps are bounded.',
  });

  const dangerous = tools.filter((tool) => DANGEROUS_TOOL.test(tool));
  const hasApproval = constraints.some(
    (constraint) =>
      APPROVAL_CONSTRAINT.test(constraint) &&
      !/(no\s+approval|without\s+approval|approval\s+not\s+required|not\s+required|без\s+(?:подтвержд|разреш)|подтвержд\w*\s+не\s+нужн|разреш\w*\s+не\s+нужн)/i.test(
        constraint
      )
  );
  checks.push({
    name: 'dangerous_tools_guarded',
    passed: dangerous.length === 0 || hasApproval,
    detail:
      dangerous.length > 0
        ? `Tools ${dangerous.join(', ')} require an explicit approval constraint.`
        : 'No production-changing tool is used.',
  });

  checks.push({
    name: 'authorization_respected',
    passed:
      tools.length === 0 || constraints.some((constraint) => AUTH_CONSTRAINT.test(constraint)),
    detail:
      tools.length === 0
        ? 'No tools are used.'
        : 'Tool-using skills must state that existing owner authorization is respected.',
  });

  checks.push({
    name: 'test_examples_have_outcomes',
    passed: tests.every((test) => text(test.expected).length > 0),
    detail: 'Every control test must state an expected result.',
  });

  checks.push({
    name: 'inputs_declared',
    passed: inputs.length > 0 || steps.length > 0,
    detail:
      'Inputs should be declared; an empty list is allowed only for a self-contained procedure.',
  });

  const unresolved = /\[ТРЕБУЕТ УТОЧНЕНИЯ\]|\[needs clarification\]/i.test(
    JSON.stringify(definition)
  );
  checks.push({
    name: 'no_unresolved_placeholders',
    passed: !unresolved,
    detail: unresolved
      ? 'Замените пометки [ТРЕБУЕТ УТОЧНЕНИЯ] фактами из источников или уточнением владельца.'
      : 'No unresolved placeholders.',
  });

  return {
    // Historical/execution checks may be non-blocking; structural checks are
    // the compatibility gate for approval.
    passed: checks.every((check) => check.passed),
    checks,
  };
}

/** Counts optional fields that are still unclear and should be filled in. */
export function skillGaps(definition: SkillDefinition): string[] {
  const gaps: string[] = [];

  if (lines(definition.conditions).length === 0) gaps.push('conditions');
  if (lines(definition.inputs).length === 0) gaps.push('inputs');
  if (lines(definition.tools).length === 0) gaps.push('tools');
  if (lines(definition.constraints).length === 0) gaps.push('constraints');
  if (!Array.isArray(definition.examples) || definition.examples.length === 0)
    gaps.push('examples');
  if (!Array.isArray(definition.tests) || definition.tests.length === 0) gaps.push('tests');

  return gaps;
}
