import {
  clearRitualDraft,
  readRitualDraft,
  writeRitualDraft,
} from '@/lib/temple/ritualDraft';

describe('ritual drafts', () => {
  afterEach(() => window.sessionStorage.clear());

  it('keeps Cast answers and results across modal navigation', () => {
    const draft = {
      language: 'en',
      currentStep: 11,
      answers: ['one', 'two'],
      analysisData: { archetype: 'VOID', agency_index: 42 },
    };

    writeRitualDraft('cast:draft:v1', draft);

    expect(readRitualDraft('cast:draft:v1')).toEqual(draft);
  });

  it('treats corrupt or cleared drafts as empty', () => {
    window.sessionStorage.setItem('cast:draft:v1', '{not-json');

    expect(readRitualDraft('cast:draft:v1')).toBeNull();

    clearRitualDraft('cast:draft:v1');
    expect(readRitualDraft('cast:draft:v1')).toBeNull();
  });
});
