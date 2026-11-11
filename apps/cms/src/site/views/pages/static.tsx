import type { ReactElement } from 'react';
import { t, localePath, formatDate, type Locale, type StringKey } from '../../i18n';
import { pick, type Site } from '../../data/site';
import { categoryMeta, categoryOrder } from '../../lib/categories';
import { safeUrl } from '../../lib/lexical/inline';
import { absolute, alternatesFor, bothLocales } from '../../lib/routes';
import { prepareRichText } from '../../render/prepare';
import { Avatar, CategoryIcon } from '../components/icons';
import { ProjectCards } from '../components/ProjectCards';
import { RichText } from '../rich/RichText';
import type { PageResult } from './types';

export function projectsPage(site: Site, locale: Locale): PageResult {
  return {
    meta: {
      title: t(locale, 'projects.title'),
      description: t(locale, 'projects.description'),
      locale,
      path: localePath(locale, '/projects/'),
      alternates: bothLocales('/projects/'),
    },
    body: (
      <div className="container page">
        <header className="page-head">
          <h1 className="page-title">{t(locale, 'projects.title')}</h1>
          <p className="page-lede">{t(locale, 'projects.description')}</p>
        </header>
        <ProjectCards projects={site.getProjects(locale)} locale={locale} />
      </div>
    ),
  };
}

export async function projectPage(site: Site, locale: Locale, slug: string): Promise<PageResult | null> {
  const project = site.getProjects(locale).find((p) => p.slug === slug);
  if (!project) return null;
  const prepared = await prepareRichText([project.content]);
  return {
    meta: {
      title: project.title,
      description: project.summary,
      locale,
      path: localePath(locale, `/projects/${project.slug}/`),
      alternates: alternatesFor(`/projects/${project.slug}/`, project.available),
    },
    usesCode: prepared.usesCode,
    body: (
      <article className="page">
        <div className="prose-width">
          <header className="page-head page-head-left">
            <h1 className="page-title">{project.title}</h1>
            <p className="page-lede">{project.summary}</p>
            <p className="page-aside">
              {t(locale, 'projects.status')}: {t(locale, `projects.statuses.${project.status}` as StringKey)}
              {project.repo && (
                <a href={safeUrl(project.repo)} rel="noopener">
                  {t(locale, 'projects.repo')}
                </a>
              )}
              {project.links.map((l, i) => (
                <a key={i} href={safeUrl(l.url)} rel="noopener">
                  {l.label}
                </a>
              ))}
            </p>
            {project.stack.length > 0 && (
              <ul className="tags" aria-label={t(locale, 'projects.stack')} role="list">
                {project.stack.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
          </header>
          <div className="prose">
            <RichText doc={project.content} locale={locale} prepared={prepared} />
          </div>
        </div>
      </article>
    ),
  };
}

export async function aboutPage(site: Site, locale: Locale): Promise<PageResult | null> {
  const page = site.getPage('about', locale);
  if (!page) return null;
  const prepared = await prepareRichText([page.content]);
  return {
    meta: {
      title: page.title,
      description: t(locale, 'about.description'),
      locale,
      path: localePath(locale, '/about/'),
      alternates: alternatesFor('/about/', page.available),
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'ProfilePage',
          mainEntity: { '@type': 'Person', name: site.siteName('en'), url: absolute('/'), email: site.getSite().email },
        },
      ],
    },
    usesCode: prepared.usesCode,
    body: (
      <div className="container listing">
        <section className="about-intro">
          <div className="about-photo">
            <Avatar name={site.siteName(locale)} size="xl" />
          </div>
          <div>
            <h1 className="about-title">{page.title}</h1>
            <div className="prose">
              <RichText doc={page.content} locale={locale} prepared={prepared} />
            </div>
            <p>
              <a className="btn" href={localePath(locale, '/contact/')}>
                {t(locale, 'aboutPage.getInTouch')}
              </a>
            </p>
          </div>
        </section>
        <section className="about-topics" aria-labelledby="topics-title">
          <h2 id="topics-title" className="section-title">
            {t(locale, 'aboutPage.whatIWrite')}
          </h2>
          <ul className="topics" role="list">
            {categoryOrder.map((slug) => (
              <li key={slug}>
                <span className="topic-icon">
                  <CategoryIcon category={slug} size={28} />
                </span>
                <h3>
                  <a href={localePath(locale, `/${categoryMeta[slug].route}/`)}>{t(locale, categoryMeta[slug].label)}</a>
                </h3>
                <p>{t(locale, categoryMeta[slug].description)}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    ),
  };
}

export async function nowPage(site: Site, locale: Locale): Promise<PageResult | null> {
  const available = site.sectionLocales.now();
  if (!available.includes(locale)) return null;
  const now = site.getNow();
  const prepared = await prepareRichText([pick(now.content, locale)]);
  return {
    meta: {
      title: t(locale, 'now.title'),
      description: t(locale, 'now.description'),
      locale,
      path: localePath(locale, '/now/'),
      alternates: alternatesFor('/now/', available),
    },
    usesCode: prepared.usesCode,
    body: (
      <div className="page">
        <div className="prose-width">
          <header className="page-head page-head-left">
            <h1 className="page-title">{t(locale, 'now.title')}</h1>
            <p className="page-lede">{t(locale, 'now.description')}</p>
            <p className="page-aside">{t(locale, 'now.updated', { date: formatDate(locale, now.updatedAt) })}</p>
          </header>
          <div className="prose">
            <RichText doc={pick(now.content, locale)!} locale={locale} prepared={prepared} />
          </div>
        </div>
      </div>
    ),
  };
}

export function usesPage(site: Site, locale: Locale): PageResult | null {
  const available = site.sectionLocales.uses();
  if (!available.includes(locale)) return null;
  const groups = site.getUsesGroups(locale);
  return {
    meta: {
      title: t(locale, 'uses.title'),
      description: t(locale, 'uses.description'),
      locale,
      path: localePath(locale, '/uses/'),
      alternates: alternatesFor('/uses/', available),
    },
    body: (
      <div className="page">
        <div className="prose-width">
          <header className="page-head page-head-left">
            <h1 className="page-title">{t(locale, 'uses.title')}</h1>
            <p className="page-lede">{t(locale, 'uses.description')}</p>
          </header>
          {groups.map((g, i) => (
            <section key={i} className="uses-group">
              <h2>{g.title}</h2>
              <ul>
                {g.items.map((it) => (
                  <li key={it.id}>
                    {it.name}
                    {it.note && <span>{it.note}</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    ),
  };
}

/** The resume is English only. */
export function resumePage(site: Site, locale: Locale): PageResult | null {
  if (locale !== 'en') return null;
  const r = site.getResume();
  const month = (ym?: string) => (ym ? formatDate(locale, `${ym}-01`, { day: undefined }) : t(locale, 'resume.present'));
  return {
    meta: {
      title: t(locale, 'resume.title'),
      description: `${r.basics.name}: ${r.basics.label}. ${t(locale, 'resume.description')}`,
      locale,
      path: '/resume/',
      alternates: { en: '/resume/' },
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'ProfilePage',
          mainEntity: {
            '@type': 'Person',
            name: r.basics.name,
            jobTitle: r.basics.label,
            url: r.basics.url,
            email: r.basics.email,
            sameAs: r.basics.profiles.map((p) => p.url),
          },
        },
      ],
    },
    body: (
      <div className="page">
        <div className="prose-width resume">
          <header className="page-head page-head-left">
            <h1 className="page-title">{r.basics.name}</h1>
            <p className="page-lede">{r.basics.label}</p>
            <p className="resume-updated">{t(locale, 'resume.updated', { date: formatDate(locale, r.updatedAt) })}</p>
          </header>
          <p className="resume-summary">{r.basics.summary}</p>
          <ul className="resume-contact" role="list">
            <li>
              <a href={`mailto:${r.basics.email}`}>{r.basics.email}</a>
            </li>
            <li>
              <a href="/contact/">{t(locale, 'nav.contact')}</a>
            </li>
            {r.basics.profiles.map((p, i) => (
              <li key={i}>
                <a href={safeUrl(p.url)} rel="me noopener">
                  {p.network}
                </a>
              </li>
            ))}
          </ul>

          <h2>{t(locale, 'resume.experience')}</h2>
          {r.work.map((w) => (
            <div key={w.id} className="resume-entry">
              <h3>
                {w.position}, {w.name}
              </h3>
              <p className="when">
                {month(w.startDate)} – {month(w.endDate)}
              </p>
              <ul>
                {w.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          ))}

          <h2>{t(locale, 'resume.projects')}</h2>
          {r.projects.map((p) => (
            <div key={p.id} className="resume-entry">
              <h3>{p.url ? <a href={safeUrl(p.url)}>{p.name}</a> : p.name}</h3>
              <p>{p.description}</p>
            </div>
          ))}

          <h2>{t(locale, 'resume.education')}</h2>
          {r.education.map((e) => (
            <div key={e.id} className="resume-entry">
              <h3>
                {e.studyType} {e.area}, {e.institution}
              </h3>
              <p className="when">
                {month(e.startDate)} – {month(e.endDate)}
              </p>
            </div>
          ))}

          <h2>{t(locale, 'resume.skills')}</h2>
          <dl>
            {r.skills.map((s) => (
              <SkillRow key={s.id} name={s.name} keywords={s.keywords.join(', ')} />
            ))}
          </dl>

          <h2>{t(locale, 'resume.languages')}</h2>
          <dl>
            {r.languages.map((l) => (
              <LangRow key={l.id} locale={locale} language={l.language} spoken={l.spoken} reading={l.reading} />
            ))}
          </dl>

          {r.certificates.length > 0 && (
            <>
              <h2>{t(locale, 'resume.certificates')}</h2>
              <ul>
                {r.certificates.map((c) => (
                  <li key={c.id}>
                    {c.name}, {c.issuer}, {c.date}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    ),
  };
}

const SkillRow = ({ name, keywords }: { name: string; keywords: string }): ReactElement => (
  <>
    <dt>{name}</dt>
    <dd>{keywords}</dd>
  </>
);
const LangRow = ({
  locale,
  language,
  spoken,
  reading,
}: {
  locale: Locale;
  language: string;
  spoken: string;
  reading: string;
}): ReactElement => (
  <>
    <dt>{language}</dt>
    <dd>
      {t(locale, 'resume.spoken')}: {spoken}
      <br />
      {t(locale, 'resume.reading')}: {reading}
    </dd>
  </>
);

export function contactPage(locale: Locale): PageResult {
  return {
    meta: {
      title: t(locale, 'contact.title'),
      description: t(locale, 'contact.description'),
      locale,
      path: localePath(locale, '/contact/'),
      alternates: bothLocales('/contact/'),
    },
    body: (
      <div className="container listing">
        <header className="page-head">
          <h1 className="page-title">{t(locale, 'contact.title')}</h1>
          <p className="page-lede">{t(locale, 'contact.description')}</p>
        </header>
        <div className="narrow">
          {/* The contact form has no backend yet (Astro site had none either): the button stays disabled. */}
          <form className="form" method="post" action="/api/contact">
            <input type="hidden" name="lang" value={locale} />
            <div className="form-row">
              <label>
                {t(locale, 'contact.name')}
                <input name="name" autoComplete="name" required maxLength={200} />
              </label>
              <label>
                {t(locale, 'contact.email')}
                <input name="email" type="email" autoComplete="email" spellCheck={false} required maxLength={320} />
              </label>
            </div>
            <label>
              {t(locale, 'contact.message')}
              <textarea name="message" required maxLength={5000}></textarea>
            </label>
            <label className="hp" aria-hidden="true">
              {t(locale, 'contact.honeypot')}
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
            <p className="notice">{t(locale, 'contact.turnstileMissing')}</p>
            <div>
              <button className="button" type="submit" disabled>
                {t(locale, 'contact.send')}
              </button>
            </div>
          </form>
        </div>
      </div>
    ),
  };
}

export function contactThanksPage(locale: Locale): PageResult {
  return {
    meta: {
      title: t(locale, 'contact.thanksTitle'),
      description: t(locale, 'contact.thanksBody'),
      locale,
      path: localePath(locale, '/contact/thanks/'),
      noindex: true,
    },
    body: (
      <div className="page">
        <div className="prose-width">
          <header className="page-head">
            <h1 className="page-title">{t(locale, 'contact.thanksTitle')}</h1>
            <p className="page-lede">{t(locale, 'contact.thanksBody')}</p>
          </header>
          <p className="actions">
            <a className="btn" href={localePath(locale, '/')}>
              {t(locale, 'contact.back')}
            </a>
          </p>
        </div>
      </div>
    ),
  };
}

export function notFoundPage(): PageResult {
  const locale: Locale = 'en';
  return {
    meta: { title: t(locale, 'notFound.title'), description: t(locale, 'notFound.body'), locale, path: '/404.html', noindex: true },
    body: (
      <div className="page">
        <div className="prose-width">
          <header className="page-head">
            <h1 className="page-title">{t(locale, 'notFound.title')}</h1>
            <p className="page-lede">{t(locale, 'notFound.body')}</p>
          </header>
          <p className="actions">
            <a className="btn" href="/">
              {t('en', 'notFound.home')}
            </a>
            <a className="btn btn-ghost" href="/ja/" lang="ja">
              {t('ja', 'notFound.home')}
            </a>
          </p>
        </div>
      </div>
    ),
  };
}
