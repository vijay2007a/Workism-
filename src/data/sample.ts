// Sample records for development. Every screen that shows them says so; nothing here is a real learner's result.
import type { Course, Lesson, Question, Workspace } from '../services';

const ask = (q: string, options: string[], answer: number, why: string): Question => ({ q, options, answer, why });
const lesson = (id: string, title: string, minutes: number, body: string[], check: Question, code?: string): Lesson => ({ id, title, minutes, body, check, code });
/** One lesson per module keeps the sample short; the app accepts any number. */
const course = (id: string, skill: string, title: string, level: string, blurb: string, lessons: Lesson[]): Course => ({
  id, skill, title, level, blurb,
  modules: lessons.map((l) => ({ title: l.title, lessons: [l] })),
});

const courses: Course[] = [
  course('javascript-foundations', 'js', 'JavaScript Foundations', 'Beginner', 'From values and functions to pages that respond and load live data.', [
    lesson('js-1', 'Values and variables', 12, [
      'A variable is a name for a value. Use const when the name will always point at the same value, and let when it will change. Reaching for const first makes code easier to follow, because a reader knows what cannot change.',
      'Numbers, strings, booleans, null and undefined are copied when you assign them. Objects and arrays are shared: two names can point at the same one.',
    ], ask('Which keyword fits a value that is never reassigned?', ['let', 'const', 'var'], 1, 'const stops the name being pointed at another value, which documents your intent.'), 'const price = 250;\nlet quantity = 2;\nquantity = quantity + 1;\nconsole.log(price * quantity); // 750'),
    lesson('js-2', 'Functions and scope', 15, [
      'A function packages steps behind a name. Its parameters and the variables declared inside it belong to that call alone, so two calls never trip over each other.',
      'A function can also use variables from the place it was written. That is a closure, and it is how a click handler remembers which button it belongs to.',
    ], ask('What can a function read from outside itself?', ['Nothing', 'Variables from where it was written', 'Variables from wherever it is called'], 1, 'Scope follows where the code is written, not where it is called.'), 'function makeCounter() {\n  let count = 0;\n  return () => ++count;\n}\nconst next = makeCounter();\nnext(); // 1\nnext(); // 2'),
    lesson('js-3', 'Arrays and objects', 18, [
      'Arrays keep things in order; objects keep things by name. Most programs are arrays of objects, filtered and reshaped until they match the screen.',
      'map makes a new array of the same length, filter keeps some items, and reduce folds the list into one value. None of them change the original.',
    ], ask('Which method keeps only the items that pass a test?', ['map', 'filter', 'reduce'], 1, 'filter returns a new array holding the items for which your function returned true.'), "const tasks = [{ title: 'Read', done: true }, { title: 'Build', done: false }];\nconst open = tasks.filter((t) => !t.done).map((t) => t.title);\n// ['Build']"),
    lesson('js-4', 'Events and the page', 20, [
      'The browser tells your code what happened through events. You listen on an element, and your function runs each time with an object describing the event.',
      'Events bubble from the element outward. One listener on a list can serve every row in it, including rows added later.',
    ], ask('Why listen on a list instead of on each row?', ['It is required by browsers', 'Rows added later work too', 'Events only fire on lists'], 1, 'Events bubble up, so one listener on the parent also hears new children.'), "list.addEventListener('click', (event) => {\n  const row = event.target.closest('li');\n  if (row) row.classList.toggle('done');\n});"),
    lesson('js-5', 'Waiting for data', 22, [
      'A network request takes time, so fetch returns a promise: a value that will arrive later. await pauses your function, not the page, until it does.',
      'Requests fail. Check response.ok, catch network errors, and always show the person something they can do next.',
    ], ask('What does await pause?', ['The whole page', 'Only the async function', 'The server'], 1, 'The rest of the page keeps running while the async function waits.'), "async function load() {\n  const response = await fetch('/api/courses');\n  if (!response.ok) throw new Error('Could not load courses');\n  return response.json();\n}"),
  ]),
  course('python-problem-solving', 'py', 'Python for Problem Solving', 'Beginner', 'Turn a question into clear steps, then into code you can trust.', [
    lesson('py-1', 'Lists and loops', 12, [
      'A list holds values in order. A for loop visits each one without you tracking an index, which removes a whole family of mistakes.',
      'When you need the position as well, use enumerate. When you need two lists side by side, use zip.',
    ], ask('Which function gives you both position and value?', ['range', 'enumerate', 'zip'], 1, 'enumerate yields (index, value) pairs.'), "marks = [72, 88, 95]\nfor position, mark in enumerate(marks, start=1):\n    print(position, mark)"),
    lesson('py-2', 'Dictionaries', 14, [
      'A dictionary finds a value by its key in roughly constant time, however many entries it has. Use one whenever you catch yourself searching a list repeatedly.',
      'get returns a default when the key is missing, so a missing entry does not have to be an error.',
    ], ask('What does d.get("x", 0) return when "x" is missing?', ['An error', 'None', '0'], 2, 'The second argument is the default.'), "counts = {}\nfor word in text.split():\n    counts[word] = counts.get(word, 0) + 1"),
    lesson('py-3', 'Functions and tests', 18, [
      'Small functions with one job are easy to test. Give each a clear input and a clear result, and keep printing and file access at the edges.',
      'A test is an example that runs. Write the example that worries you most first: the empty list, the zero, the missing file.',
    ], ask('Which case is most worth testing first?', ['The ordinary one', 'The one that worries you', 'The longest one'], 1, 'Edge cases are where assumptions break.'), 'def average(values):\n    return sum(values) / len(values) if values else 0\n\nassert average([]) == 0\nassert average([2, 4]) == 3'),
    lesson('py-4', 'Files and errors', 16, [
      'with open(...) closes the file for you, even when something goes wrong halfway through.',
      'Catch the specific error you expect and can handle. Catching everything hides bugs you would rather see.',
    ], ask('Why use with when opening a file?', ['It is faster', 'It always closes the file', 'It allows larger files'], 1, 'The file is closed when the block ends, error or not.'), "try:\n    with open('scores.csv') as f:\n        rows = f.readlines()\nexcept FileNotFoundError:\n    rows = []"),
    lesson('py-5', 'Comprehensions and generators', 16, [
      'A comprehension builds a list in one readable line. If it stops being readable, write the loop.',
      'Swap the square brackets for round ones and you get a generator, which makes one value at a time and can walk files larger than memory.',
    ], ask('What is the advantage of a generator?', ['It sorts values', 'It makes one value at a time', 'It runs in parallel'], 1, 'Values are produced on demand, so memory stays small.'), "total = sum(int(line) for line in open('numbers.txt'))"),
  ]),
  course('machine-learning-essentials', 'ml', 'Machine Learning Essentials', 'Intermediate', 'Frame a problem, measure it honestly, and know when not to ship.', [
    lesson('ml-1', 'Framing the problem', 14, [
      'Start from the decision the prediction will change. If nobody would act differently, you do not need a model.',
      'Then name the target, the moment you must predict it, and what is known at that moment. Anything learned later must stay out of the inputs.',
    ], ask('What must stay out of the inputs?', ['Numbers', 'Facts learned after the prediction', 'Missing values'], 1, 'Using later facts is leakage: great scores, useless model.')),
    lesson('ml-2', 'Train, validate, test', 16, [
      'Train on one part, choose between models on a second, and report on a third you have never looked at.',
      'If rows are ordered in time, split by time. A random split lets the model peek at the future.',
    ], ask('When should you split by time?', ['Never', 'When rows are ordered in time', 'Only for images'], 1, 'Otherwise training rows come from after the test rows.'), 'cut = int(len(rows) * 0.8)\ntrain, test = rows[:cut], rows[cut:]'),
    lesson('ml-3', 'Overfitting', 15, [
      'A model that memorises looks perfect in training and stumbles on anything new. The gap between the two scores is the symptom.',
      'More data, simpler models and early stopping all help. Looking at the test set again and again does not: it slowly becomes training data.',
    ], ask('Which sign points to overfitting?', ['Both scores are low', 'Training is high, validation is low', 'Training is slow'], 1, 'The model learned the training rows rather than the pattern.')),
    lesson('ml-4', 'Choosing a metric', 15, [
      'Accuracy misleads when one outcome is rare: predicting "no fraud" every time can score 99%.',
      'Precision asks how many alarms were right. Recall asks how many real cases were caught. Choose by which mistake costs more.',
    ], ask('Missing a real case is the costly mistake. Watch…', ['Recall', 'Precision', 'Accuracy'], 0, 'Recall measures how many real cases were caught.')),
    lesson('ml-5', 'Responsible models', 12, [
      'Check results for each group of people the model affects, not only overall. An average can hide a failure.',
      'Write down what the model is for, what it was trained on, and where it should not be used.',
    ], ask('Why measure each group separately?', ['To train faster', 'An average can hide a failure', 'To use less memory'], 1, 'Good overall numbers can mask poor results for a smaller group.')),
  ]),
  course('databases-with-sql', 'db', 'Databases with SQL', 'Beginner', 'Model data once, ask it anything, and keep it correct.', [
    lesson('db-1', 'Tables and keys', 12, [
      'Each table describes one kind of thing, and each row one of them. A primary key names the row; a foreign key points at a row in another table.',
      'Store each fact once. When it changes, you change it in one place.',
    ], ask('What does a foreign key do?', ['Encrypts a row', 'Points at a row in another table', 'Sorts the table'], 1, 'It links two tables and lets the database reject broken links.'), 'create table course (\n  id integer primary key,\n  title text not null\n);'),
    lesson('db-2', 'Filtering and sorting', 12, [
      'where keeps rows that match, order by arranges them, and limit stops early. They run in that order.',
      'null means unknown, so it is never equal to anything, including itself. Use is null.',
    ], ask('How do you find rows with no email?', ['email = null', 'email is null', 'email == ""'], 1, 'Comparisons with null are unknown, so = never matches.'), 'select title from course\nwhere level = \'Beginner\'\norder by title\nlimit 5;'),
    lesson('db-3', 'Joins', 18, [
      'A join lines up rows from two tables using a condition. An inner join keeps only matches; a left join keeps every row on the left and fills gaps with null.',
      'If a total looks too large, check whether a join repeated rows.',
    ], ask('Which join keeps learners who have no enrolments?', ['inner join', 'left join', 'cross join'], 1, 'A left join keeps every row from the first table.'), 'select l.name, count(e.id)\nfrom learner l\nleft join enrolment e on e.learner_id = l.id\ngroup by l.name;'),
    lesson('db-4', 'Grouping', 14, [
      'group by gathers rows that share a value so you can count, sum or average each group.',
      'where filters rows before grouping; having filters the groups afterwards.',
    ], ask('Which clause filters groups?', ['where', 'having', 'order by'], 1, 'having runs after the groups exist.')),
    lesson('db-5', 'Indexes and transactions', 16, [
      'An index is a sorted copy of a column that lets the database jump straight to the rows it needs. It speeds up reads and slows down writes a little.',
      'A transaction makes several changes succeed or fail together, so a transfer never takes money without delivering it.',
    ], ask('What does a transaction guarantee?', ['Changes succeed or fail together', 'Queries run faster', 'Rows stay sorted'], 0, 'Either all the changes are kept or none are.'), 'begin;\nupdate account set balance = balance - 100 where id = 1;\nupdate account set balance = balance + 100 where id = 2;\ncommit;'),
  ]),
  course('cloud-basics', 'cl', 'Cloud Basics', 'Beginner', 'Pick the right building block, keep it safe, and know what it costs.', [
    lesson('cl-1', 'Regions and zones', 10, [
      'A region is a place; a zone is a separate building within it. Running in two zones survives one of them failing.',
      'Choose a region near your users, and check that the law allows their data to live there.',
    ], ask('What does running in two zones protect against?', ['A bug in your code', 'One building failing', 'High prices'], 1, 'Zones fail independently of each other.')),
    lesson('cl-2', 'Choosing compute', 14, [
      'Functions suit short, uneven work. Containers suit steady services. Virtual machines suit software that needs the whole computer.',
      'Start with the option that leaves you the least to look after.',
    ], ask('Short, occasional jobs fit best on…', ['Functions', 'Virtual machines', 'A bigger database'], 0, 'You pay only while a function runs, and nothing idles.')),
    lesson('cl-3', 'Storing things', 12, [
      'Object storage keeps files cheaply and almost without limit. Block storage behaves like a disk. A database keeps records you will query.',
      'Set a lifecycle rule so old files move to cheaper storage, or disappear, without anyone remembering to do it.',
    ], ask('Where do uploaded photos belong?', ['A database column', 'Object storage', 'A virtual machine disk'], 1, 'Object storage is built for files, at low cost.')),
    lesson('cl-4', 'Identity and least privilege', 14, [
      'Give each service its own identity, and only the permissions it uses. If it leaks, the damage stays small.',
      'Never put keys in code. Use the secret store the platform provides, and rotate them.',
    ], ask('What is least privilege?', ['One shared admin account', 'Only the permissions needed', 'No permissions at all'], 1, 'Small permissions limit the damage of a leak.')),
    lesson('cl-5', 'Scaling and cost', 12, [
      'Scale on the thing that actually runs out: requests, memory or queue length. Set a maximum so a spike cannot empty the budget.',
      'Set a budget alarm on day one, before anything is worth alarming about.',
    ], ask('What should you set on day one?', ['A larger machine', 'A budget alarm', 'A second region'], 1, 'It warns you while the surprise is still small.')),
  ]),
];

export const workspace: Workspace = {
  name: '',
  skills: [
    { id: 'py', name: 'Python', score: 85, target: 80, history: [58, 63, 70, 74, 80, 85], source: 'sample' },
    { id: 'js', name: 'JavaScript', score: 70, target: 85, history: [40, 46, 52, 60, 66, 70], source: 'sample' },
    { id: 'ml', name: 'AI / ML', score: 65, target: 75, history: [30, 38, 44, 52, 60, 65], source: 'sample' },
    { id: 'db', name: 'Databases', score: 45, target: 70, history: [28, 30, 34, 38, 41, 45], source: 'sample' },
    { id: 'cl', name: 'Cloud', score: 30, target: 60, history: [10, 14, 18, 22, 26, 30], source: 'sample' },
  ],
  courses,
  projects: [
    { id: 'accessible-portfolio', title: 'Accessible portfolio site', skills: ['js'], level: 'Beginner', hours: 8, brief: 'Build a personal site that works with a keyboard, a screen reader and a slow phone.', requirements: ['Works without a mouse', 'Text contrast of at least 4.5 to 1', 'Loads in under two seconds on a mid-range phone', 'A README explaining your choices'], rubric: ['Accessibility', 'Code clarity', 'Performance'] },
    { id: 'ticket-classifier', title: 'Support ticket classifier', skills: ['py', 'ml'], level: 'Intermediate', hours: 14, brief: 'Sort support tickets by topic, and report honestly on where the model is wrong.', requirements: ['Split the data before exploring it', 'Report precision and recall per topic', 'Show ten mistakes and explain them', 'A model card'], rubric: ['Method', 'Honesty of evaluation', 'Reproducibility'] },
    { id: 'inventory-api', title: 'Inventory API with SQL', skills: ['db', 'py'], level: 'Intermediate', hours: 12, brief: 'Design a small stock database and an API that never lets a count go below zero.', requirements: ['A schema with keys and constraints', 'Transactions for every stock change', 'Tests for two buyers racing for the last item'], rubric: ['Data model', 'Correctness', 'Tests'] },
    { id: 'static-site-deploy', title: 'Deploy with a budget', skills: ['cl'], level: 'Beginner', hours: 6, brief: 'Put a static site online with HTTPS, a least-privilege deploy key and a cost alarm.', requirements: ['HTTPS with your own domain or subdomain', 'A deploy identity that can only deploy', 'A budget alarm with a screenshot'], rubric: ['Security', 'Automation', 'Cost control'] },
  ],
  certificates: [
    { id: 'javascript-practitioner', title: 'JavaScript Practitioner', skill: 'js', course: 'javascript-foundations', project: 'accessible-portfolio', status: 'pending', source: 'sample' },
    { id: 'python-practitioner', title: 'Python Practitioner', skill: 'py', course: 'python-problem-solving', project: 'ticket-classifier', status: 'pending', source: 'sample' },
    { id: 'sql-practitioner', title: 'SQL Practitioner', skill: 'db', course: 'databases-with-sql', project: 'inventory-api', status: 'pending', source: 'sample' },
    { id: 'cloud-practitioner', title: 'Cloud Practitioner', skill: 'cl', course: 'cloud-basics', project: 'static-site-deploy', status: 'pending', source: 'sample' },
  ],
  lessonsDone: ['js-1', 'js-2', 'js-3', 'py-1', 'py-2', 'db-1'],
};
