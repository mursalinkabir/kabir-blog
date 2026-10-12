import type { GlobalConfig } from 'payload';
import { isAdmin, isLoggedIn } from '../access';
import { articleEditor } from '../blocks';
import { dispatchAfterGlobalChange } from '../hooks/dispatchContentPublished';

const access = { read: isLoggedIn, update: isAdmin };
const hooks = { afterChange: [dispatchAfterGlobalChange] };

const NAV_KEYS = ['home', 'tech', 'finance', 'japan', 'about', 'contact', 'projects', 'resume', 'now', 'uses', 'categories', 'tags'];
const navOptions = NAV_KEYS.map((value) => ({ label: value, value }));

export const SiteGlobal: GlobalConfig = {
  slug: 'site',
  access,
  hooks,
  admin: { description: 'Name, tagline, contact address, links and the navigation.' },
  fields: [
    { name: 'name', type: 'text', localized: true, required: true },
    { name: 'tagline', type: 'text', localized: true, required: true },
    { name: 'email', type: 'email', required: true, defaultValue: 'hello@smkabir.com' },
    {
      name: 'socials',
      type: 'array',
      admin: { description: 'Shown as buttons in the footer. Use https:// links to your own profiles.' },
      fields: [
        { name: 'label', type: 'text', required: true, admin: { description: 'github, linkedin or x get their icon.' } },
        { name: 'url', type: 'text', required: true },
      ],
    },
    { name: 'nav', type: 'select', hasMany: true, options: navOptions, admin: { description: 'The main menu, in order.' } },
    { name: 'navMore', type: 'select', hasMany: true, options: navOptions, admin: { description: 'Under "More", in order.' } },
  ],
};

export const NowGlobal: GlobalConfig = {
  slug: 'now',
  label: 'Now',
  access,
  hooks,
  fields: [{ name: 'content', type: 'richText', localized: true, editor: articleEditor }],
};

export const UsesGlobal: GlobalConfig = {
  slug: 'uses',
  label: 'Uses',
  access,
  hooks,
  fields: [
    {
      name: 'groups',
      type: 'array',
      fields: [
        // Not `required`: a group or item that is not yet written in Japanese is skipped in Japanese, which is the
        // site's rule, and `required` would make that half-translated state impossible to save.
        { name: 'title', type: 'text', localized: true },
        {
          name: 'items',
          type: 'array',
          fields: [
            { name: 'name', type: 'text', localized: true },
            { name: 'note', type: 'text', localized: true },
          ],
        },
      ],
    },
  ],
};

/** JSON Resume-shaped groups (docs/PLAN.md, "Resume"). English only. */
export const ResumeGlobal: GlobalConfig = {
  slug: 'resume',
  label: 'Resume',
  access,
  hooks,
  fields: [
    {
      name: 'basics',
      type: 'group',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'label', type: 'text', required: true },
        { name: 'email', type: 'email', required: true, defaultValue: 'hello@smkabir.com' },
        { name: 'url', type: 'text', defaultValue: 'https://smkabir.com' },
        { name: 'summary', type: 'textarea' },
        {
          name: 'profiles',
          type: 'array',
          fields: [
            { name: 'network', type: 'text', required: true },
            { name: 'url', type: 'text', required: true },
          ],
        },
      ],
    },
    {
      name: 'work',
      type: 'array',
      fields: [
        { name: 'name', type: 'text', required: true, label: 'Company' },
        { name: 'position', type: 'text', required: true },
        { name: 'startDate', type: 'text', required: true, admin: { description: 'YYYY-MM' } },
        { name: 'endDate', type: 'text', admin: { description: 'YYYY-MM. Empty = present.' } },
        { name: 'highlights', type: 'array', fields: [{ name: 'text', type: 'text', required: true }] },
      ],
    },
    {
      name: 'education',
      type: 'array',
      fields: [
        { name: 'institution', type: 'text', required: true },
        { name: 'area', type: 'text', required: true },
        { name: 'studyType', type: 'text', required: true },
        { name: 'startDate', type: 'text', required: true },
        { name: 'endDate', type: 'text' },
      ],
    },
    {
      name: 'skills',
      type: 'array',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'keywords', type: 'array', fields: [{ name: 'text', type: 'text', required: true }] },
      ],
    },
    {
      name: 'projects',
      type: 'array',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'description', type: 'text', required: true },
        { name: 'url', type: 'text' },
      ],
    },
    {
      name: 'languages',
      type: 'array',
      admin: { description: 'List speaking and reading separately: Japanese employers read this line closely.' },
      fields: [
        { name: 'language', type: 'text', required: true },
        { name: 'spoken', type: 'text', required: true },
        { name: 'reading', type: 'text', required: true },
      ],
    },
    {
      name: 'certificates',
      type: 'array',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'issuer', type: 'text', required: true },
        { name: 'date', type: 'text', required: true },
      ],
    },
  ],
};
