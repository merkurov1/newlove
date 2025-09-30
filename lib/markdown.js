import MarkdownIt from 'markdown-it';
import mk from 'markdown-it-katex';
import mila from 'markdown-it-link-attributes';
import markdownItHighlightjs from 'markdown-it-highlightjs';

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
})
  .use(markdownItHighlightjs)
  .use(mk)
  .use(mila, { attrs: { target: '_blank', rel: 'noopener' } });

export default md;
