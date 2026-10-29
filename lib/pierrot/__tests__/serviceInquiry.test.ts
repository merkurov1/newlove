/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import {
  advanceServiceInquiryState,
  markServiceQuestionAsked,
  parseServiceInquiryAnswer,
  renderServiceInquiry,
  type ServiceInquiryState,
} from '../serviceInquiry';

function state(overrides: Partial<ServiceInquiryState> = {}): ServiceInquiryState {
  return {
    id: 'lead-12345678',
    status: 'new',
    needType: null,
    stage: null,
    timeline: null,
    questionsAsked: 0,
    qualified: false,
    nextQuestion: null,
    summary: '',
    ...overrides,
  };
}

describe('Pierrot service inquiry qualification', () => {
  it('parses need, stage and timeline from free text', () => {
    expect(parseServiceInquiryAnswer('I want to analyse my collection')).toMatchObject({
      needType: 'analysis',
    });
    expect(parseServiceInquiryAnswer('I want to acquire a work')).toMatchObject({
      needType: 'acquisition',
    });
    expect(parseServiceInquiryAnswer('A consultation, please')).toMatchObject({
      needType: 'consultation',
    });
    expect(parseServiceInquiryAnswer('I am comparing options')).toMatchObject({
      stage: 'comparing',
    });
    expect(parseServiceInquiryAnswer('Already in progress')).toMatchObject({
      stage: 'in_progress',
    });
    expect(parseServiceInquiryAnswer('This quarter')).toMatchObject({
      timeline: 'this_quarter',
    });
  });

  it('asks at most three questions and qualifies only with need and stage', () => {
    let current = advanceServiceInquiryState(state(), 'I need a consultation');
    expect(current.needType).toBe('consultation');
    expect(current.nextQuestion).toBe('stage');
    expect(current.qualified).toBe(false);

    current = markServiceQuestionAsked(current);
    let next = advanceServiceInquiryState(current, 'Ready to move');
    expect(next.stage).toBe('ready');
    expect(next.qualified).toBe(true);
    expect(next.nextQuestion).toBe('timeline');

    next = markServiceQuestionAsked(next);
    next = advanceServiceInquiryState(next, 'This quarter');
    expect(next.timeline).toBe('this_quarter');
    expect(next.nextQuestion).toBeNull();
    expect(next.qualified).toBe(true);
    expect(next.questionsAsked).toBe(2);
  });

  it('does not qualify after three ambiguous answers', () => {
    let current = state();

    for (let index = 0; index < 3; index += 1) {
      current = advanceServiceInquiryState(current, 'I am not sure what you mean');
      expect(current.qualified).toBe(false);
      if (current.nextQuestion) current = markServiceQuestionAsked(current);
    }

    current = advanceServiceInquiryState(current, 'Still not sure');
    const rendered = renderServiceInquiry(current, 'en');
    expect(rendered.useExternalContact).toBe(true);
    expect(rendered.links).toHaveLength(0);
    expect(rendered.reply).toContain('will not mark this as qualified');
  });

  it('shows a summary and the contact form only after qualification', () => {
    let current = advanceServiceInquiryState(state(), 'I want advice on an acquisition');
    current = markServiceQuestionAsked(current);
    current = advanceServiceInquiryState(current, 'Comparing options');
    current = markServiceQuestionAsked(current);
    current = advanceServiceInquiryState(current, 'This month');

    const rendered = renderServiceInquiry(current, 'en');

    expect(current.status).toBe('qualified');
    expect(rendered.reply).toContain('Summary');
    expect(rendered.links).toEqual([
      {
        label: 'Review the request',
        href: '/advising/request?lead=lead-12345678&lang=en',
      },
    ]);
    expect(rendered.useExternalContact).toBe(false);
  });

  it('does not ask again after contact was requested', () => {
    const current = state({
      status: 'contact_requested',
      needType: 'consultation',
      stage: 'ready',
      qualified: true,
    });
    const next = advanceServiceInquiryState(current, 'I want to change everything');
    const rendered = renderServiceInquiry(next, 'en');

    expect(next).toBe(current);
    expect(rendered.reply).toContain('already been sent');
  });
});
