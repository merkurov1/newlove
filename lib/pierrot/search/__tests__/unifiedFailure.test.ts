/**
 * @jest-environment node
 */
import { searchUnifiedOwnerContext } from '../unified';

/**
 * L. A failed project→document relation query must not be converted into
 * "the project has no documents".
 */
describe('unified search failure handling', () => {
  it('reports a relation failure explicitly in notes', async () => {
    const store = {
      from(table: string) {
        const result =
          table === 'pierrot_project_knowledge'
            ? {
                data: null,
                error: {
                  message: 'column knowledge_documents_1.status does not exist',
                  code: '42703',
                },
              }
            : { data: [], error: null };
        const builder: Record<string, unknown> = {};
        for (const method of ['select', 'eq', 'in', 'or', 'order', 'limit']) {
          builder[method] = () => builder;
        }
        builder.then = (onFulfilled: (value: unknown) => unknown) =>
          Promise.resolve(result).then(onFulfilled);
        return builder;
      },
    } as never;

    const result = await searchUnifiedOwnerContext({
      store,
      ownerUserId: 'owner-1',
      query: 'alpha',
      scope: 'documents',
      project: null,
    });

    expect(result.hits).toEqual([]);
    expect(result.notes.join(' ')).toContain('Документы проекта или Brain не прочитаны');
    expect(result.notes.join(' ')).toContain('не пустой архив');
  });
});
