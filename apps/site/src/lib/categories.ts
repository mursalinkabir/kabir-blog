import type { StringKey } from '~/i18n';
import type { Category } from './types';
import type { CategoryRoute } from './cms';

export interface CategoryMeta {
  route: CategoryRoute;
  label: StringKey;
  description: StringKey;
}

export const categoryMeta: Record<Category['slug'], CategoryMeta> = {
  tech: { route: 'tech', label: 'categories.tech', description: 'categories.techDescription' },
  finance: { route: 'finance', label: 'categories.finance', description: 'categories.financeDescription' },
  'japan-life': { route: 'japan', label: 'categories.japan-life', description: 'categories.japanDescription' },
};

export const categoryOrder: Category['slug'][] = ['tech', 'finance', 'japan-life'];
