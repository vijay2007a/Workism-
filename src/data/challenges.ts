import type { CodeTest } from '../lib/runner';

export interface Challenge { id: string; title: string; minutes: number; brief: string; fn: string; starter: string; tests: CodeTest[] }

export const CHALLENGES: Challenge[] = [
  {
    id: 'sum-even',
    title: 'Total of the even numbers',
    minutes: 10,
    brief: 'Write sumEven(numbers). It receives an array of whole numbers and returns the total of the even ones. An empty array totals 0.',
    fn: 'sumEven',
    starter: 'function sumEven(numbers) {\n  // your code\n}\n',
    tests: [
      { args: [[1, 2, 3, 4]], expected: 6 },
      { args: [[]], expected: 0 },
      { args: [[-2, 7, 8]], expected: 6 },
      { args: [[5, 9, 11]], expected: 0 },
    ],
  },
  {
    id: 'word-count',
    title: 'Count the words',
    minutes: 15,
    brief: 'Write countWords(text). Return an object giving how many times each word appears. Ignore capital letters, and treat any run of spaces as one gap.',
    fn: 'countWords',
    starter: 'function countWords(text) {\n  // your code\n}\n',
    tests: [
      { args: ['red blue red'], expected: { red: 2, blue: 1 } },
      { args: ['One one ONE'], expected: { one: 3 } },
      { args: ['  spaced   out  '], expected: { spaced: 1, out: 1 } },
      { args: [''], expected: {} },
    ],
  },
];
