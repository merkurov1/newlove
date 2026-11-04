import { assertServerOnly } from '@/lib/serverOnly';
import OpenAI from 'openai';
import { getDevRepoConfig } from './config';
import { createGitHubTools } from './github';
import { PIERROT_DEV_SYSTEM_PROMPT } from './prompt';

assertServerOnly('lib/pierrot/dev/llm');

const MAX_TOOL_CALLS = 8;
const MAX_TOOL_RESULT_CHARS = 24_000;

export type DevToolTrace = {
  name: string;
  ok: boolean;
  summary: string;
};

export type DevModelResult = {
  reply: string;
  provider: 'deepseek' | 'openrouter';
  model: string;
  toolTrace: DevToolTrace[];
};

function tools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'get_repo_structure',
        description:
          'List files and directories at a path in the configured GitHub repository.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Repository path. Empty string means the repository root.',
            },
          },
          required: ['path'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'read_file_content',
        description: 'Read the UTF-8 content of one file from the configured repository.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Repository-relative file path.',
            },
          },
          required: ['path'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_or_update_file',
        description:
          'Create or update one file and commit it. Use a new branch unless the owner explicitly asks to write to the default branch.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Repository-relative file path.' },
            content: { type: 'string', description: 'Complete new UTF-8 file content.' },
            message: { type: 'string', description: 'Commit message.' },
            branch: { type: 'string', description: 'Target branch. Defaults to main.' },
          },
          required: ['path', 'content', 'message'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_pull_request',
        description: 'Open a pull request from an existing head branch into a base branch.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            head: { type: 'string', description: 'Source branch.' },
            base: { type: 'string', description: 'Target branch.' },
            body: { type: 'string' },
          },
          required: ['title', 'head'],
          additionalProperties: false,
        },
      },
    },
  ];
}

function parseArguments(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function contextMessage(): string {
  const repo = getDevRepoConfig();

  return [
    `Repository: ${repo.fullName}`,
    `Default branch: ${repo.defaultBranch}`,
    `GitHub token configured: ${repo.token ? 'yes' : 'no'}`,
    `Repository writes enabled: ${repo.writesEnabled ? 'yes' : 'no'}`,
    repo.token
      ? 'Never claim an action succeeded unless the tool result confirms it.'
      : 'GitHub tools are unavailable in this environment. Do not claim to inspect, modify or publish anything in the repository.',
  ].join('\n');
}

type ProviderConfig = {
  provider: 'deepseek' | 'openrouter';
  baseURL: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
};

function providerConfigs(): ProviderConfig[] {
  const result: ProviderConfig[] = [];
  const deepseek = (process.env.DEEPSEEK_API_KEY || '').trim();
  const openrouter = (process.env.OPENROUTER_API_KEY || '').trim();

  if (deepseek) {
    result.push({
      provider: 'deepseek',
      baseURL: 'https://api.deepseek.com',
      apiKey: deepseek,
      model: 'deepseek-chat',
    });
  }

  if (openrouter) {
    result.push({
      provider: 'openrouter',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: openrouter,
      model: 'deepseek/deepseek-chat',
      headers: {
        'HTTP-Referer': 'https://merkurov.love',
        'X-Title': 'Merkurov Pierrot Dev',
      },
    });
  }

  return result;
}

export function isDevModelConfigured(): boolean {
  return providerConfigs().length > 0;
}

async function runProvider(
  config: ProviderConfig,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<DevModelResult> {
  const repo = getDevRepoConfig();
  const github = repo.token ? createGitHubTools() : null;
  const trace: DevToolTrace[] = [];

  const client = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    timeout: 60_000,
    maxRetries: 0,
    ...(config.headers ? { defaultHeaders: config.headers } : {}),
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: PIERROT_DEV_SYSTEM_PROMPT },
    { role: 'system', content: contextMessage() },
    ...history.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];

  const availableTools = github ? tools() : [];

  for (let iteration = 0; iteration <= MAX_TOOL_CALLS; iteration += 1) {
    const completion = await client.chat.completions.create({
      model: config.model,
      messages,
      temperature: 0.2,
      max_tokens: 6000,
      ...(availableTools.length > 0
        ? { tools: availableTools, tool_choice: 'auto' as const }
        : {}),
    });

    const choice = completion.choices[0]?.message;
    if (!choice) throw new Error('Dev model returned no message.');

    if (!choice.tool_calls || choice.tool_calls.length === 0) {
      const reply = (choice.content || '').trim();
      if (!reply) throw new Error('Dev model returned an empty answer.');
      return {
        reply,
        provider: config.provider,
        model: config.model,
        toolTrace: trace,
      };
    }

    messages.push({
      role: 'assistant',
      content: choice.content || null,
      tool_calls: choice.tool_calls,
    });

    for (const call of choice.tool_calls) {
      const functionCall =
        'function' in call ? call.function : null;
      const name = functionCall?.name || 'unknown_tool';

      if (!github) {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ error: 'GitHub tools are not configured.' }),
        });
        trace.push({
          name,
          ok: false,
          summary: 'GitHub is not configured.',
        });
        continue;
      }

      const result = await github.execute(
        name,
        parseArguments(functionCall?.arguments)
      );
      const serialized = JSON.stringify(result);
      const content =
        serialized.length > MAX_TOOL_RESULT_CHARS
          ? `${serialized.slice(0, MAX_TOOL_RESULT_CHARS)}\n…[truncated]`
          : serialized;

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content,
      });

      const failed = Boolean(
        result && typeof result === 'object' && 'error' in result
      );
      trace.push({
        name,
        ok: !failed,
        summary: failed
          ? String((result as { error?: unknown }).error || 'Tool failed.')
          : summarizeToolResult(name, result),
      });
    }
  }

  throw new Error('Dev model exceeded the tool-call limit.');
}

function summarizeToolResult(name: string, result: unknown): string {
  if (!result || typeof result !== 'object') return 'ok';
  const record = result as Record<string, unknown>;

  if (name === 'get_repo_structure') {
    const entries = Array.isArray(record.entries) ? record.entries.length : 0;
    return `${entries} entries`;
  }
  if (name === 'read_file_content') {
    return typeof record.path === 'string' ? record.path : 'file read';
  }
  if (name === 'create_or_update_file') {
    return typeof record.commitSha === 'string'
      ? `commit ${record.commitSha.slice(0, 7)}`
      : 'file written';
  }
  if (name === 'create_pull_request') {
    return typeof record.number === 'number' ? `PR #${record.number}` : 'PR created';
  }

  return 'ok';
}

export async function callDevModel(
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<DevModelResult> {
  const providers = providerConfigs();
  if (providers.length === 0) {
    throw new Error('No dev model provider is configured.');
  }

  let lastError: unknown = null;

  for (const provider of providers) {
    try {
      return await runProvider(provider, history);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('All dev model providers are unavailable.');
}
