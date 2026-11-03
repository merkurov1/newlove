import {
  extractChristiesEmbeddedLot,
  extractSothebysEmbeddedLot,
} from '../embedded';

describe('embedded auction-house lot headers', () => {
  it('extracts the Christie’s lot header without evaluating JavaScript', () => {
    const html = `<script>
      window.chrComponents = window.chrComponents || {};
      window.chrComponents.lotHeader_1 = {"data":{"lots":[{
        "object_id":"6606657",
        "lot_id_txt":"3",
        "title_primary_txt":"MICHAEL ARMITAGE (B. 1984)",
        "title_secondary_txt":"Elephants",
        "estimate_txt":"GBP 500,000 – GBP 700,000",
        "price_realised_txt":"GBP 1,126,400",
        "lot_assets":[{
          "image_url":"https://images.example.com/elephants.jpg",
          "measurements_txt":"W 87 x H 67 in. (221.0 x 170.0 cm.)"
        }]
      }]}};
    </script>`;

    expect(extractChristiesEmbeddedLot(html)).toEqual({
      title: 'Elephants',
      artist: 'MICHAEL ARMITAGE (B. 1984)',
      lotNumber: '3',
      estimateRaw: 'GBP 500,000 – GBP 700,000',
      priceRaw: 'GBP 1,126,400',
      imageUrl: 'https://images.example.com/elephants.jpg',
      dimensions: 'W 87 x H 67 in. (221.0 x 170.0 cm.)',
      auctionHouse: "Christie's",
    });
  });

  it('extracts the current Sotheby’s LotV2 instead of a nearby LotCard', () => {
    const nextData = {
      props: {
        pageProps: {
          lotId: 'lot-1',
          apolloCache: {
            'Auction:auction-1': {
              __typename: 'Auction',
              currency: 'USD',
            },
            'LotV2:lot-1': {
              __typename: 'LotV2',
              lotId: 'lot-1',
              title: 'Untitled (Etude in Green)',
              creatorsDisplayTitle: 'Alma Thomas',
              auction: { __ref: 'Auction:auction-1' },
              lotNumber: { lotDisplayNumber: '102' },
              estimateV2: {
                lowEstimate: { amount: '40000' },
                highEstimate: { amount: '60000' },
              },
              'media({"imageSizes":["ExtraSmall","Small","Medium","Large","ExtraLarge","ExtraExtraLarge"]})':
                {
                  images: [
                    {
                      renditions: [
                        { url: 'https://images.example.com/alma.jpg' },
                      ],
                    },
                  ],
                },
            },
            'LotCard:lot-1': {
              __typename: 'LotCard',
              lotId: 'lot-1',
              title: 'Untitled (Etude in Green)',
              lotNumber: { lotDisplayNumber: '102' },
            },
          },
        },
      },
    };

    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`;

    expect(extractSothebysEmbeddedLot(html)).toEqual({
      title: 'Untitled (Etude in Green)',
      artist: 'Alma Thomas',
      lotNumber: '102',
      estimateLow: 40000,
      estimateHigh: 60000,
      estimateRaw: '40,000 – 60,000',
      currency: 'USD',
      imageUrl: 'https://images.example.com/alma.jpg',
    });
  });
});
