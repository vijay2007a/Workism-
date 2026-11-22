// Catalogue only. `runs` is true where this build can actually execute code; everything else is editor-only.
export const LANGUAGE_KINDS = ['Web', 'Backend', 'Systems', 'Data', 'Mobile', 'Scripting'] as const;
export type LanguageKind = (typeof LANGUAGE_KINDS)[number];

export interface ProgrammingLanguage { id: string; name: string; mark: string; color: string; kinds: LanguageKind[]; note: string; runs?: boolean }

const lang = (id: string, name: string, mark: string, color: string, kinds: LanguageKind[], note: string, runs?: boolean): ProgrammingLanguage => ({ id, name, mark, color, kinds, note, runs });

export const PROGRAMMING_LANGUAGES: ProgrammingLanguage[] = [
  lang('python', 'Python', 'Py', '#5b8def', ['Data', 'Backend', 'Scripting'], 'Readable, and at home in data and AI.'),
  lang('java', 'Java', 'Ja', '#e08a4a', ['Backend', 'Mobile'], 'Large systems with long lives.'),
  lang('c', 'C', 'C', '#7d8fb8', ['Systems'], 'Close to the machine.'),
  lang('cpp', 'C++', 'C+', '#5f7fe0', ['Systems'], 'Speed with higher-level tools.'),
  lang('csharp', 'C#', 'C#', '#9a6cf0', ['Backend', 'Mobile'], 'Apps, services and games on .NET.'),
  lang('javascript', 'JavaScript', 'JS', '#e8b93c', ['Web', 'Backend', 'Scripting'], 'The language of the browser.', true),
  lang('typescript', 'TypeScript', 'TS', '#4f86e8', ['Web', 'Backend'], 'JavaScript with types.'),
  lang('go', 'Go', 'Go', '#4cc3dc', ['Backend', 'Systems'], 'Small, fast services.'),
  lang('rust', 'Rust', 'Rs', '#d98a6a', ['Systems'], 'Memory safety without a garbage collector.'),
  lang('kotlin', 'Kotlin', 'Kt', '#b070f0', ['Mobile', 'Backend'], 'Modern Android development.'),
  lang('swift', 'Swift', 'Sw', '#f08a6a', ['Mobile'], 'Apps for Apple platforms.'),
  lang('php', 'PHP', 'Ph', '#8a8fd0', ['Web', 'Backend'], 'Runs much of the web.'),
  lang('ruby', 'Ruby', 'Rb', '#e0607a', ['Web', 'Backend', 'Scripting'], 'Friendly, expressive web work.'),
  lang('sql', 'SQL', 'SQL', '#4fb8a8', ['Data'], 'Ask questions of data.'),
  lang('r', 'R', 'R', '#6a9be0', ['Data'], 'Statistics and charts.'),
  lang('dart', 'Dart', 'Da', '#50b8d8', ['Mobile', 'Web'], 'Cross-platform apps with Flutter.'),
  lang('scala', 'Scala', 'Sc', '#e07070', ['Backend', 'Data'], 'Functional and object-oriented on the JVM.'),
  lang('elixir', 'Elixir', 'Ex', '#a078d0', ['Backend'], 'Services that stay up.'),
  lang('haskell', 'Haskell', 'Hs', '#8f7cc8', ['Backend'], 'Purely functional thinking.'),
  lang('lua', 'Lua', 'Lu', '#6f7fe0', ['Scripting'], 'Tiny and embeddable.'),
  lang('julia', 'Julia', 'Jl', '#a070c8', ['Data'], 'Fast numerical computing.'),
  lang('bash', 'Bash', 'Sh', '#70a890', ['Scripting', 'Systems'], 'Automate the command line.'),
];
