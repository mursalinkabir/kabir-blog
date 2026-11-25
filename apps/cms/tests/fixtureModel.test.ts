import { expect, it } from 'vitest';
import { mediaAltLocales } from '../src/scripts/fixtureModel';

it('creates Japanese-only fixture media in Japanese and keeps English first for bilingual media', () => {
  expect(mediaAltLocales({ ja: '橋' })).toEqual(['ja']);
  expect(mediaAltLocales({ ja: '橋', en: 'Bridge' })).toEqual(['en', 'ja']);
});
