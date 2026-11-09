import { matchUniqueProjectMention, projectAliases, projectMatchesRef } from '../matching';
import type { PierrotProject } from '../types';

const project = (name: string, slug: string): PierrotProject => ({
  id: slug,
  ownerUserId: 'owner',
  slug,
  name,
  description: '',
  objective: '',
  status: 'active',
  priority: 0,
  ownerRating: null,
  ownerRatingUpdatedAt: null,
  conversationId: null,
  projectBrief: '',
  briefRevision: 1,
  lastActivityAt: '',
  createdAt: '',
  updatedAt: '',
});

describe('project mention matching', () => {
  it('assigns a unique project mentioned in the task', () => {
    expect(matchUniqueProjectMention([project('Art Engine', 'art-engine')], 'Fix Art Engine upload')).toMatchObject({
      slug: 'art-engine',
    });
  });

  it('does not guess when multiple projects match', () => {
    const projects = [project('Art Engine', 'art-engine'), project('Engine', 'engine')];
    expect(matchUniqueProjectMention(projects, 'Fix Art Engine')).toBeNull();
  });

  it('recognises compact and punctuation variants without new projects', () => {
    const heart = project('Heart & Angel', 'heart-and-angel');

    expect(projectAliases(heart)).toEqual(
      expect.arrayContaining(['heart-and-angel', 'heartandangel', 'heart and angel'])
    );
    expect(matchUniqueProjectMention([heart], 'В heartandangel поправить шарик')).toBe(heart);
    expect(matchUniqueProjectMention([heart], 'Heart&Angel: проверить мобильную версию')).toBe(
      heart
    );
    expect(projectMatchesRef(heart, 'heartangel')).toBe(true);
    expect(projectMatchesRef(heart, 'heart-and-angel')).toBe(true);
  });
});
