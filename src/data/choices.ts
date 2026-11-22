// [stored value, English label]. Labels are translated where they are shown.
export type Option = readonly [value: string, label: string];

export const GOALS: Option[] = [
  ['fullstack', 'Full-stack developer'],
  ['data', 'Data analyst'],
  ['ml', 'Machine learning engineer'],
  ['cloud', 'Cloud engineer'],
  ['mobile', 'Mobile developer'],
  ['exploring', 'Still exploring'],
];
export const INTERESTS: Option[] = [
  ['py', 'Python'],
  ['js', 'JavaScript'],
  ['ml', 'AI / ML'],
  ['db', 'Databases'],
  ['cl', 'Cloud'],
  ['design', 'Web design'],
  ['mobile', 'Mobile apps'],
  ['security', 'Cybersecurity'],
];
export const STYLES: Option[] = [
  ['read', 'Reading first'],
  ['build', 'Building first'],
  ['practice', 'Quizzes and practice'],
  ['guided', 'Guided by the assistant'],
];
export const PACES: Option[] = [
  ['15', '15 minutes a day'],
  ['30', '30 minutes a day'],
  ['60', 'An hour a day'],
  ['weekend', 'Weekends only'],
];
