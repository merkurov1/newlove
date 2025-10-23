
import MarkdownIt from 'markdown-it';
import mk from 'markdown-it-katex';
import mila from 'markdown-it-link-attributes';
import markdownItHighlightjs from 'markdown-it-highlightjs';
import markdownItAttrs from 'markdown-it-attrs';


const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
})
  .use(markdownItHighlightjs)
  .use(mk)
  .use(mila, { attrs: { target: '_blank', rel: 'noopener' } })
  .use(markdownItAttrs);

export default md;
