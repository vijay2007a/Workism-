// Each check returns '' when valid, otherwise the message to show (English source text, translated at render).

export const checkEmail = (v: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Enter an email address like name@example.com.';

export const checkName = (v: string) => {
  const n = v.trim().length;
  if (n === 0) return 'Enter your name.';
  return n > 60 ? 'Keep your name under 60 characters.' : '';
};

export const checkPassword = (v: string) =>
  v.length >= 8 && /\p{L}/u.test(v) && /\d/.test(v) ? '' : 'Use at least 8 characters with a letter and a number.';

/** Rendered as a link later, so only a plain https GitHub repository is accepted. */
export const checkRepo = (v: string) =>
  /^https:\/\/github\.com\/[\w-]+\/[\w.-]+\/?$/.test(v.trim()) ? '' : 'Paste a repository link like https://github.com/you/project.';
