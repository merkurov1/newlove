/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import {
  buildPierrotIdentityGuidance,
  buildPierrotOwnerProfileContext,
  buildPierrotPerspectivePrompt,
  isPierrotIdentityQuestion,
  isPierrotOwnerContextQuestion,
  normalizePierrotOwnerProfile,
} from '../perspective';

describe('Pierrot perspective contract', () => {
  it('makes public mode third-person and non-impersonating', () => {
    const prompt = buildPierrotPerspectivePrompt('public');

    expect(prompt).toContain('third person');
    expect(prompt).toContain('he / his / him');
    expect(prompt).toContain('он / его / ему');
    expect(prompt).toContain('The visitor is not Anton');
    expect(prompt).toContain('Continue public mode');
    expect(prompt).toContain('Never reveal private conversations');
  });

  it('makes personal mode direct and identity-based', () => {
    const prompt = buildPierrotPerspectivePrompt('personal');

    expect(prompt).toContain('authenticated speaker is Anton Merkurov');
    expect(prompt).toContain('«ты», «твой», «тебе», «у тебя»');
    expect(prompt).toContain('«Кто такой Антон Меркуров?»');
    expect(prompt).toContain('answer «Ты — …»');
    expect(prompt).toContain('Do not switch to public mode because of the wording');
  });

  it('contains factual-discipline rules for identity answers', () => {
    const prompt = buildPierrotIdentityGuidance(
      'public',
      'Who is Anton Merkurov?'
    );

    expect(prompt).toContain('Separate confirmed facts');
    expect(prompt).toContain('Do not invent professional titles');
    expect(prompt).toContain('хранитель наследия');
    expect(prompt).toContain('UNFRAMED is Anton’s memoir');
    expect(prompt).toContain('canonical project descriptions');
  });

  it('recognises public and owner identity questions in both languages', () => {
    expect(isPierrotIdentityQuestion('Who is Anton Merkurov?')).toBe(true);
    expect(isPierrotIdentityQuestion('Расскажи о проектах Антона')).toBe(true);
    expect(isPierrotIdentityQuestion('Расскажи про меня')).toBe(true);
    expect(isPierrotIdentityQuestion('Кто такой Антон Меркуров?')).toBe(true);
    expect(isPierrotIdentityQuestion('Какая у меня биография?')).toBe(true);
    expect(isPierrotIdentityQuestion('Что ты обо мне знаешь?')).toBe(true);
    expect(isPierrotIdentityQuestion('Чем я занимаюсь?')).toBe(true);

    expect(isPierrotIdentityQuestion('Сколько стоит открытка?')).toBe(false);
    expect(isPierrotIdentityQuestion('Tell me about the archive.')).toBe(false);
    expect(isPierrotIdentityQuestion('Tell me about media.')).toBe(false);
  });

  it('detects personal working-context questions without turning every question into biography', () => {
    expect(isPierrotOwnerContextQuestion('Что я публиковал в последнее время?')).toBe(true);
    expect(isPierrotOwnerContextQuestion('Как менялись мои взгляды?')).toBe(true);
    expect(isPierrotOwnerContextQuestion('What have I published recently?')).toBe(true);
    expect(isPierrotOwnerContextQuestion('Расскажи о выставке')).toBe(false);
  });

  it('keeps public identity guidance free of private owner profile fields', () => {
    const profile = normalizePierrotOwnerProfile({
      name: 'Anton Merkurov',
      username: 'merkurov',
      bio: 'Private owner biography',
      website: 'https://merkurov.love',
      email: 'private@example.com',
    });

    expect(profile).toEqual({
      name: 'Anton Merkurov',
      username: 'merkurov',
      bio: 'Private owner biography',
      website: 'https://merkurov.love',
    });

    const publicGuidance = buildPierrotIdentityGuidance(
      'public',
      'Who is Anton Merkurov?',
      profile
    );
    const personalGuidance = buildPierrotIdentityGuidance(
      'personal',
      'Расскажи про меня',
      profile
    );

    expect(publicGuidance).not.toContain('Private owner biography');
    expect(publicGuidance).toContain('third person');
    expect(personalGuidance).toContain('Private owner biography');
    expect(personalGuidance).toContain('Answer in the second person');
    expect(personalGuidance).toContain('never expose it to public visitors');
  });

  it('does not claim that an empty profile bio means there is no biography', () => {
    const context = buildPierrotOwnerProfileContext({ name: 'Anton Merkurov', bio: '' });

    expect(context).toContain('Anton Merkurov');
    expect(context).toContain('not a complete biography');
  });
});
