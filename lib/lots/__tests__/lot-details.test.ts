import * as cheerio from 'cheerio';
import { extractLotDetails } from '../extract-detail';

describe('catalogue detail extraction', () => {
  it('extracts a Christie’s-style lot essay and split provenance', () => {
    const $ = cheerio.load(`
      <html><body>
        <chr-accordion-item>
          <div slot="header">Details</div>
          <div slot="content">
            <span>MICHAEL ARMITAGE (B. 1984)<br><i>Elephants</i><br>signed, titled and dated 'elephants 2015'<br>oil on lubugo bark cloth<br>67 x 87in. (170 x 221cm.)<br>Painted in 2015</span>
          </div>
        </chr-accordion-item>
        <chr-accordion-item>
          <div slot="header">Provenance</div>
          <div slot="content"><span>White Cube, London. <br>Acquired from the above by The Peter Simon Collection in 2015.</span></div>
        </chr-accordion-item>
        <chr-accordion-item>
          <div slot="header">Literature</div>
          <div slot="content"><span>T. Kamps, The Brooklyn Rail, September 2020.</span></div>
        </chr-accordion-item>
        <section>
          <h2 class="chr-lot-article__title">Lot Essay</h2>
          <chr-readmore-expander>
            <div class="content-zone chr-body">Michael Armitage’s <i>Elephants</i> (2015) depicts two animals. The painting is made on bark cloth.</div>
          </chr-readmore-expander>
        </section>
      </body></html>
    `);

    const details = extractLotDetails($);

    expect(details.lotEssay).toContain('Michael Armitage’s Elephants');
    expect(details.provenance).toEqual([
      'White Cube, London.',
      'Acquired from the above by The Peter Simon Collection in 2015.',
    ]);
    expect(details.literature[0]).toContain('The Brooklyn Rail');
    expect(details.signature).toContain('signed, titled and dated');
    expect(details.medium).toBe('oil on lubugo bark cloth');
    expect(details.artistDates).toBe('b. 1984');
  });
});
