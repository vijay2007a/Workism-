export const LANGS = [
  { code: 'en', native: 'English', english: 'English' },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi' },
  { code: 'te', native: 'తెలుగు', english: 'Telugu' },
  { code: 'ml', native: 'മലയാളം', english: 'Malayalam' },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada' },
  { code: 'bn', native: 'বাংলা', english: 'Bengali' },
  { code: 'mr', native: 'मराठी', english: 'Marathi' },
  { code: 'gu', native: 'ગુજરાતી', english: 'Gujarati' },
  { code: 'pa', native: 'ਪੰਜਾਬੀ', english: 'Punjabi' },
  { code: 'es', native: 'Español', english: 'Spanish' },
  { code: 'fr', native: 'Français', english: 'French' },
  { code: 'de', native: 'Deutsch', english: 'German' },
  { code: 'ja', native: '日本語', english: 'Japanese' },
  { code: 'ko', native: '한국어', english: 'Korean' },
  { code: 'ar', native: 'العربية', english: 'Arabic' },
  { code: 'zh', native: '简体中文', english: 'Chinese' },
] as const;

export type LangCode = (typeof LANGS)[number]['code'];
export type Dict = Record<string, string>;

export const isLang = (v: string): v is LangCode => LANGS.some((l) => l.code === v);

export const resolveLang = (tags: readonly string[]): LangCode =>
  tags.map((t) => t.toLowerCase().split('-')[0]).find(isLang) ?? 'en';

export const dirOf = (code: string) => (code === 'ar' ? 'rtl' : 'ltr');

/** Keys are the English source text, so a missing translation reads as English instead of a raw key. */
export const translate = (dict: Dict, text: string, vars: Record<string, string | number> = {}) =>
  (dict[text] || text).replace(/\{(\w+)\}/g, (hole, k: string) => (k in vars ? String(vars[k]) : hole));
