import React from 'react';
import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { pageMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, profilePageJsonLd } from '@/lib/structuredData';
import { ISAKEYFORALL_COPY, type IsakeyforallLanguage } from '@/lib/i18n/isakeyforall';
import { LANGUAGE_META, languageAlternates, localizedPath } from '@/lib/i18n/config';
import HeroMotion from '@/components/advising/HeroMotion';
import CenteredHeader from '@/components/CenteredHeader';
import CaseStudyCard from '@/components/advising/CaseStudyCard';
import SectionLanguageSwitcher from '@/components/i18n/SectionLanguageSwitcher';

export function isakeyforallMetadata(lang: IsakeyforallLanguage): Metadata {
  const copy = ISAKEYFORALL_COPY[lang];

  return pageMetadata({
    title: copy.meta.title,
    description: copy.meta.description,
    path: localizedPath('isakeyforall', lang),
    type: 'profile',
    locale: LANGUAGE_META[lang].ogLocale,
    languages: languageAlternates('isakeyforall'),
  });
}

export default function IsakeyforallPageView({ lang }: { lang: IsakeyforallLanguage }) {
  const copy = ISAKEYFORALL_COPY[lang];

  return (
    <div
      lang={lang}
      dir="ltr"
      className="light-gallery min-h-screen bg-[#F5F2EB] text-[#1D1B18] font-sans selection:bg-[#1D1B18] selection:text-[#F5F2EB] relative overflow-x-hidden"
    >
      <JsonLd
        data={profilePageJsonLd({
          path: localizedPath('isakeyforall', lang),
          name: copy.meta.structuredName,
          description: copy.meta.description,
          inLanguage: lang,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.meta.breadcrumbs.home, path: '/' },
          { name: copy.meta.breadcrumbs.section, path: localizedPath('isakeyforall', lang) },
        ])}
      />
      <div className="max-w-3xl mx-auto px-6 pt-36 md:pt-44 pb-24">
        <div className="flex justify-end pb-8">
          <SectionLanguageSwitcher section="isakeyforall" currentLang={lang} />
        </div>

        {/* Header: The Monument (motion) */}
        <CenteredHeader>
          <HeroMotion
            title={
              <>
                <span>{copy.hero.line1}</span>
                <br />
                {copy.hero.line2}
              </>
            }
            subtitle={<>{copy.hero.subtitle}</>}
          />
        </CenteredHeader>

        {/* Content: The Narrative */}
        <article className="prose prose-lg prose-stone prose-p:font-light prose-p:leading-relaxed prose-headings:font-serif max-w-none">
          <div className="space-y-8 text-lg leading-relaxed text-[#1D1B18]">
            <p className="first-letter:text-5xl first-letter:font-serif first-letter:font-bold first-letter:float-left first-letter:mr-3 first-letter:mt-[-8px]">
              {copy.narrative.origin}
            </p>

            <p>{copy.narrative.career}</p>

            <p>{copy.narrative.heritage}</p>

            <blockquote className="border-l-2 border-[#1D1B18]/40 pl-8 my-12 py-2 bg-white/55 p-6 rounded-r-2xl shadow-[0_18px_50px_rgba(58,46,30,0.08)] backdrop-blur-sm">
              <p className="text-2xl sm:text-3xl font-serif italic text-[#1D1B18] leading-tight">
                {copy.quote}
              </p>
            </blockquote>

            {/* Heart & Angel — unified block */}
            <div className="border border-[#1D1B18]/12 bg-white/55 p-8 rounded-2xl my-12 space-y-6 shadow-[0_18px_50px_rgba(58,46,30,0.08)] backdrop-blur-sm">
              <p>{copy.heart.origin}</p>

              <p>{copy.heart.mission}</p>

              <ul className="space-y-3 text-[#4E4A43] font-light list-none pl-0">
                {copy.heart.values.map((value) => (
                  <li key={value.title} className="flex items-start gap-3">
                    <span className="text-[#1D1B18] font-bold">•</span>
                    <span>
                      <strong className="font-semibold text-[#1D1B18]">{value.title}</strong>{' '}
                      {value.body}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <blockquote className="border-l-2 border-[#1D1B18]/40 pl-6 sm:pl-8 my-12 py-2">
              <p className="text-xl sm:text-2xl font-serif italic text-[#1D1B18] leading-relaxed">
                {copy.secondQuote}
              </p>
            </blockquote>

            <p>{copy.closing}</p>
          </div>

          {/* FEATURED: UNFRAMED & RESEARCH */}
          <section className="mb-12 mt-16">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#847E73] mb-6">
              {copy.featured.label}
            </h3>

            <CaseStudyCard
              href="/unframed"
              badge={copy.featured.memoirBadge}
              title={<>{copy.featured.memoirTitle}</>}
              subtitle={<>{copy.featured.memoirSubtitle}</>}
              layoutId="case-unframed"
            />

            <div className="mt-6">
              <CaseStudyCard
                href="/research"
                badge={copy.featured.researchBadge}
                title={<>{copy.featured.researchTitle}</>}
                subtitle={<>{copy.featured.researchSubtitle}</>}
                layoutId="case-research"
              />
            </div>
          </section>
        </article>
      </div>
    </div>
  );
}
