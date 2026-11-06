/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import * as cheerio from 'cheerio';

const FlowWorkspace = require('../FlowWorkspace').default as typeof import('../FlowWorkspace').default;

describe('Flow workspace write affordance', () => {
  it('offers the single write button that opens the existing Flow composer', () => {
    const html = renderToStaticMarkup(<FlowWorkspace />);
    const $ = cheerio.load(html);

    const write = $('button[aria-label="Написать в Flow"]');

    expect(write).toHaveLength(1);
    expect(write.text()).toContain('Написать');
    expect($('a[href="/admin/pierrot?new=1"]')).toHaveLength(0);
  });
});
