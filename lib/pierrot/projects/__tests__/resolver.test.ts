import { matchUniqueProjectMention } from '../matching';
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
});
