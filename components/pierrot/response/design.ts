/**
 * Shared presentation tokens for Pierrot responses.
 *
 * Tailwind class strings are used instead of inline styles so the owner PWA and
 * the public conversation keep the same hierarchy and reading rhythm. These are
 * presentation-only tokens; no content or data is encoded here.
 */
export const PIERROT_PRESENTATION = {
  root: 'min-w-0 text-[16px] leading-[1.75] text-[#2F2B26] sm:text-[16.5px]',
  prose: 'text-[#2F2B26]',
  bodyMuted: 'text-[13px] leading-[1.65] text-[#6E665B]',
  heading1:
    'font-serif text-[26px] font-normal leading-[1.18] tracking-[-0.015em] text-[#1F1C18]',
  heading2: 'font-serif text-[21px] font-normal leading-[1.28] text-[#211F1F]',
  heading3: 'font-serif text-[17.5px] font-normal leading-snug text-[#2F2B26]',
  section: 'my-7 first:mt-0',
  meta: 'font-mono text-[10px] uppercase tracking-[0.14em] text-[#8A8175]',
  label: 'font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[#7D7468]',
  caption: 'font-mono text-[10px] leading-relaxed tracking-[0.03em] text-[#948A7D]',
  quote:
    'font-serif text-[20px] italic leading-[1.55] text-[#3F3A33] sm:text-[22px]',
  rule: 'border-[#E4DCCF]',
  surface: 'border-[#E4DCCF] bg-[#F7F3EC]',
  link: 'text-[#3F3A33] underline decoration-[#A5764F] decoration-1 underline-offset-4 transition-colors hover:text-[#111111] hover:decoration-[#6B4F37]',
} as const;
