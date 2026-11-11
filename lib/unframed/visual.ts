/**
 * Local grain texture for the UNFRAMED surfaces.
 *
 * The section previously pointed at a third-party deployment
 * (`grainy-gradients.vercel.app`) which now answers 402 and leaves every page
 * with a failed request. This is the same inline SVG noise pattern already
 * used by the rest of the site, so the visual treatment stays unchanged.
 */
export const GRAIN_BACKGROUND =
  'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")';
