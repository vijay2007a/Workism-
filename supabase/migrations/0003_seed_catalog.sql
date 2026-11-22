-- ============================================================================
-- WORKISM 3.0 — Migration 0003: Initial Catalog Seed (Idempotent)
-- Matches existing frontend catalog IDs while storing authoritative answer keys
-- and hidden coding tests outside student-accessible tables.
-- ============================================================================

-- 1. Spoken Languages (18 languages, incl. RTL Arabic & Portuguese)
insert into public.spoken_languages (code, native_name, english_name, is_rtl, ai_quality_tier, sort_order) values
  ('en', 'English', 'English', false, 'high', 1),
  ('ta', 'தமிழ்', 'Tamil', false, 'high', 2),
  ('hi', 'हिन्दी', 'Hindi', false, 'high', 3),
  ('te', 'తెలుగు', 'Telugu', false, 'good', 4),
  ('ml', 'മലയാളം', 'Malayalam', false, 'good', 5),
  ('kn', 'ಕನ್ನಡ', 'Kannada', false, 'good', 6),
  ('bn', 'বাংলা', 'Bengali', false, 'high', 7),
  ('mr', 'मराठी', 'Marathi', false, 'good', 8),
  ('gu', 'ગુજરાતી', 'Gujarati', false, 'good', 9),
  ('pa', 'ਪੰਜਾਬੀ', 'Punjabi', false, 'good', 10),
  ('es', 'Español', 'Spanish', false, 'high', 11),
  ('fr', 'Français', 'French', false, 'high', 12),
  ('de', 'Deutsch', 'German', false, 'high', 13),
  ('ja', '日本語', 'Japanese', false, 'high', 14),
  ('ko', '한국어', 'Korean', false, 'high', 15),
  ('ar', 'العربية', 'Arabic', true, 'high', 16),
  ('zh', '简体中文', 'Chinese', false, 'high', 17),
  ('pt', 'Português', 'Portuguese', false, 'high', 18)
on conflict (code) do update
set native_name = excluded.native_name, english_name = excluded.english_name, is_rtl = excluded.is_rtl, ai_quality_tier = excluded.ai_quality_tier, sort_order = excluded.sort_order;

-- 2. Programming Languages (separating AI explanation, assessments, and sandbox execution)
insert into public.programming_languages
  (id, name, mark, color, kinds, note, can_ai_explain, has_assessments, can_execute_sandbox, execution_runtime, sort_order)
values
  ('python', 'Python', 'Py', '#5b8def', array['Data','Backend','Scripting'], 'Readable, and at home in data and AI.', true, true, false, 'python3.12', 1),
  ('java', 'Java', 'Ja', '#e08a4a', array['Backend','Mobile'], 'Large systems with long lives.', true, false, false, 'openjdk21', 2),
  ('c', 'C', 'C', '#7d8fb8', array['Systems'], 'Close to the machine.', true, false, false, 'gcc13', 3),
  ('cpp', 'C++', 'C+', '#5f7fe0', array['Systems'], 'Speed with higher-level tools.', true, false, false, 'gpp13', 4),
  ('csharp', 'C#', 'C#', '#9a6cf0', array['Backend','Mobile'], 'Apps, services and games on .NET.', true, false, false, 'dotnet8', 5),
  ('javascript', 'JavaScript', 'JS', '#e8b93c', array['Web','Backend','Scripting'], 'The language of the browser.', true, true, true, 'browser-worker-js', 6),
  ('typescript', 'TypeScript', 'TS', '#4f86e8', array['Web','Backend'], 'JavaScript with types.', true, false, false, 'node24-ts', 7),
  ('go', 'Go', 'Go', '#4cc3dc', array['Backend','Systems'], 'Small, fast services.', true, false, false, 'go1.23', 8),
  ('rust', 'Rust', 'Rs', '#d98a6a', array['Systems'], 'Memory safety without a garbage collector.', true, false, false, 'rustc1.82', 9),
  ('kotlin', 'Kotlin', 'Kt', '#b070f0', array['Mobile','Backend'], 'Modern Android development.', true, false, false, null, 10),
  ('swift', 'Swift', 'Sw', '#f08a6a', array['Mobile'], 'Apps for Apple platforms.', true, false, false, null, 11),
  ('php', 'PHP', 'Ph', '#8a8fd0', array['Web','Backend'], 'Runs much of the web.', true, false, false, null, 12),
  ('ruby', 'Ruby', 'Rb', '#e0607a', array['Web','Backend','Scripting'], 'Friendly, expressive web work.', true, false, false, null, 13),
  ('sql', 'SQL', 'SQL', '#4fb8a8', array['Data'], 'Ask questions of data.', true, true, false, 'sqlite3', 14),
  ('r', 'R', 'R', '#6a9be0', array['Data'], 'Statistics and charts.', true, false, false, null, 15),
  ('dart', 'Dart', 'Da', '#50b8d8', array['Mobile','Web'], 'Cross-platform apps with Flutter.', true, false, false, null, 16),
  ('scala', 'Scala', 'Sc', '#e07070', array['Backend','Data'], 'Functional and object-oriented on the JVM.', true, false, false, null, 17),
  ('elixir', 'Elixir', 'Ex', '#a078d0', array['Backend'], 'Services that stay up.', true, false, false, null, 18),
  ('haskell', 'Haskell', 'Hs', '#8f7cc8', array['Backend'], 'Purely functional thinking.', true, false, false, null, 19),
  ('lua', 'Lua', 'Lu', '#6f7fe0', array['Scripting'], 'Tiny and embeddable.', true, false, false, null, 20),
  ('julia', 'Julia', 'Jl', '#a070c8', array['Data'], 'Fast numerical computing.', true, false, false, null, 21),
  ('bash', 'Bash', 'Sh', '#70a890', array['Scripting','Systems'], 'Automate the command line.', true, false, false, null, 22)
on conflict (id) do update
set name = excluded.name, kinds = excluded.kinds, note = excluded.note,
    can_ai_explain = excluded.can_ai_explain, has_assessments = excluded.has_assessments,
    can_execute_sandbox = excluded.can_execute_sandbox, execution_runtime = excluded.execution_runtime;

-- 3. Skill Categories & Skills
insert into public.skill_categories (id, name, sort_order) values
  ('programming', 'Programming', 1),
  ('ai-data', 'AI & Data', 2),
  ('infrastructure', 'Cloud & Infrastructure', 3)
on conflict (id) do nothing;

insert into public.skills (id, category_id, name, default_target, sort_order) values
  ('py', 'programming', 'Python', 80, 1),
  ('js', 'programming', 'JavaScript', 85, 2),
  ('ml', 'ai-data', 'AI / ML', 75, 3),
  ('db', 'ai-data', 'Databases', 70, 4),
  ('cl', 'infrastructure', 'Cloud', 60, 5)
on conflict (id) do update set name = excluded.name, default_target = excluded.default_target;

-- 4. Courses, Modules & Lessons
insert into public.courses (id, skill_id, title, blurb, level, sort_order) values
  ('javascript-foundations', 'js', 'JavaScript Foundations', 'From values and functions to pages that respond and load live data.', 'Beginner', 1),
  ('python-problem-solving', 'py', 'Python for Problem Solving', 'Turn a question into clear steps, then into code you can trust.', 'Beginner', 2),
  ('machine-learning-essentials', 'ml', 'Machine Learning Essentials', 'Frame a problem, measure it honestly, and know when not to ship.', 'Intermediate', 3),
  ('databases-with-sql', 'db', 'Databases with SQL', 'Model data once, ask it anything, and keep it correct.', 'Beginner', 4),
  ('cloud-basics', 'cl', 'Cloud Basics', 'Pick the right building block, keep it safe, and know what it costs.', 'Beginner', 5)
on conflict (id) do update set title = excluded.title, blurb = excluded.blurb, level = excluded.level;

insert into public.course_modules (id, course_id, title, sort_order) values
  ('js-m1', 'javascript-foundations', 'Values and variables', 1),
  ('js-m2', 'javascript-foundations', 'Functions and scope', 2),
  ('js-m3', 'javascript-foundations', 'Arrays and objects', 3),
  ('js-m4', 'javascript-foundations', 'Events and the page', 4),
  ('js-m5', 'javascript-foundations', 'Waiting for data', 5),
  ('py-m1', 'python-problem-solving', 'Lists and loops', 1),
  ('py-m2', 'python-problem-solving', 'Dictionaries', 2),
  ('py-m3', 'python-problem-solving', 'Functions and tests', 3),
  ('py-m4', 'python-problem-solving', 'Files and errors', 4),
  ('py-m5', 'python-problem-solving', 'Comprehensions and generators', 5),
  ('ml-m1', 'machine-learning-essentials', 'Framing the problem', 1),
  ('ml-m2', 'machine-learning-essentials', 'Train, validate, test', 2),
  ('ml-m3', 'machine-learning-essentials', 'Overfitting', 3),
  ('ml-m4', 'machine-learning-essentials', 'Choosing a metric', 4),
  ('ml-m5', 'machine-learning-essentials', 'Responsible models', 5),
  ('db-m1', 'databases-with-sql', 'Tables and keys', 1),
  ('db-m2', 'databases-with-sql', 'Filtering and sorting', 2),
  ('db-m3', 'databases-with-sql', 'Joins', 3),
  ('db-m4', 'databases-with-sql', 'Grouping', 4),
  ('db-m5', 'databases-with-sql', 'Indexes and transactions', 5),
  ('cl-m1', 'cloud-basics', 'Regions and zones', 1),
  ('cl-m2', 'cloud-basics', 'Choosing compute', 2),
  ('cl-m3', 'cloud-basics', 'Storing things', 3),
  ('cl-m4', 'cloud-basics', 'Identity and least privilege', 4),
  ('cl-m5', 'cloud-basics', 'Scaling and cost', 5)
on conflict (id) do nothing;

insert into public.lessons (id, module_id, course_id, title, minutes, body, code_sample, check_question, sort_order) values
  ('js-1', 'js-m1', 'javascript-foundations', 'Values and variables', 12,
    '["A variable is a name for a value. Use const when the name will always point at the same value, and let when it will change.","Numbers, strings, booleans, null and undefined are copied when you assign them. Objects and arrays are shared."]'::jsonb,
    'const price = 250;\nlet quantity = 2;\nquantity = quantity + 1;\nconsole.log(price * quantity); // 750',
    '{"q":"Which keyword fits a value that is never reassigned?","options":["let","const","var"],"answer":1,"why":"const stops the name being pointed at another value, which documents your intent."}'::jsonb, 1),
  ('js-2', 'js-m2', 'javascript-foundations', 'Functions and scope', 15,
    '["A function packages steps behind a name. Its parameters and local variables belong to that call alone.","A function can also use variables from the place it was written. That is a closure."]'::jsonb,
    'function makeCounter() {\n  let count = 0;\n  return () => ++count;\n}',
    '{"q":"What can a function read from outside itself?","options":["Nothing","Variables from where it was written","Variables from wherever it is called"],"answer":1,"why":"Scope follows where the code is written, not where it is called."}'::jsonb, 2),
  ('js-3', 'js-m3', 'javascript-foundations', 'Arrays and objects', 18,
    '["Arrays keep things in order; objects keep things by name.","map makes a new array of the same length, filter keeps matching items, and reduce folds into one value."]'::jsonb,
    'const open = tasks.filter((t) => !t.done).map((t) => t.title);',
    '{"q":"Which method keeps only the items that pass a test?","options":["map","filter","reduce"],"answer":1,"why":"filter returns a new array holding items for which the predicate returned true."}'::jsonb, 3),
  ('js-4', 'js-m4', 'javascript-foundations', 'Events and the page', 20,
    '["The browser tells your code what happened through events.","Events bubble from the element outward so one listener on a parent serves dynamic rows too."]'::jsonb,
    'list.addEventListener("click", (event) => { const row = event.target.closest("li"); if (row) row.classList.toggle("done"); });',
    '{"q":"Why listen on a list instead of on each row?","options":["It is required by browsers","Rows added later work too","Events only fire on lists"],"answer":1,"why":"Events bubble up, so one listener on the parent also hears new children."}'::jsonb, 4),
  ('js-5', 'js-m5', 'javascript-foundations', 'Waiting for data', 22,
    '["A network request takes time, so fetch returns a promise. await pauses your async function until it resolves.","Always check response.ok and handle errors clearly."]'::jsonb,
    'async function load() {\n  const response = await fetch("/api/courses");\n  if (!response.ok) throw new Error("Could not load courses");\n  return response.json();\n}',
    '{"q":"What does await pause?","options":["The whole page","Only the async function","The server"],"answer":1,"why":"The rest of the page keeps running while the async function waits."}'::jsonb, 5),

  ('py-1', 'py-m1', 'python-problem-solving', 'Lists and loops', 12,
    '["A list holds values in order. A for loop visits each element directly.","Use enumerate when you need both index and value, and zip for parallel lists."]'::jsonb,
    'for position, mark in enumerate(marks, start=1):\n    print(position, mark)',
    '{"q":"Which function gives you both position and value?","options":["range","enumerate","zip"],"answer":1,"why":"enumerate yields (index, value) pairs."}'::jsonb, 1),
  ('py-2', 'py-m2', 'python-problem-solving', 'Dictionaries', 14,
    '["A dictionary finds a value by key in roughly constant time.","dict.get returns a default when the key is missing."]'::jsonb,
    'counts[word] = counts.get(word, 0) + 1',
    '{"q":"What does d.get(\"x\", 0) return when \"x\" is missing?","options":["An error","None","0"],"answer":2,"why":"The second argument is the default."}'::jsonb, 2),
  ('py-3', 'py-m3', 'python-problem-solving', 'Functions and tests', 18,
    '["Small functions with one job are easy to test.","Test edge cases first: empty list, zero, missing file."]'::jsonb,
    'def average(values):\n    return sum(values) / len(values) if values else 0',
    '{"q":"Which case is most worth testing first?","options":["The ordinary one","The one that worries you","The longest one"],"answer":1,"why":"Edge cases are where assumptions break."}'::jsonb, 3),
  ('py-4', 'py-m4', 'python-problem-solving', 'Files and errors', 16,
    '["with open(...) always closes the file, even if an exception occurs.","Catch the specific exception you can handle."]'::jsonb,
    'with open("scores.csv") as f:\n    rows = f.readlines()',
    '{"q":"Why use with when opening a file?","options":["It is faster","It always closes the file","It allows larger files"],"answer":1,"why":"The context manager closes the file when the block exits."}'::jsonb, 4),
  ('py-5', 'py-m5', 'python-problem-solving', 'Comprehensions and generators', 16,
    '["Comprehensions build lists concisely.","Generators produce one value at a time with constant memory."]'::jsonb,
    'total = sum(int(line) for line in open("numbers.txt"))',
    '{"q":"What is the advantage of a generator?","options":["It sorts values","It makes one value at a time","It runs in parallel"],"answer":1,"why":"Values are produced on demand, keeping memory small."}'::jsonb, 5),

  ('ml-1', 'ml-m1', 'machine-learning-essentials', 'Framing the problem', 14,
    '["Start from the decision the prediction changes.","Exclude any facts learned after prediction time to avoid data leakage."]'::jsonb,
    null,
    '{"q":"What must stay out of the inputs?","options":["Numbers","Facts learned after the prediction","Missing values"],"answer":1,"why":"Using later facts is leakage: great scores, useless model."}'::jsonb, 1),
  ('ml-2', 'ml-m2', 'machine-learning-essentials', 'Train, validate, test', 16,
    '["Train on one split, tune on validation, report once on test.","Split by time whenever rows are time-ordered."]'::jsonb,
    'cut = int(len(rows) * 0.8)\ntrain, test = rows[:cut], rows[cut:]',
    '{"q":"When should you split by time?","options":["Never","When rows are ordered in time","Only for images"],"answer":1,"why":"Otherwise training rows leak future observations."}'::jsonb, 2),
  ('ml-3', 'ml-m3', 'machine-learning-essentials', 'Overfitting', 15,
    '["A large gap between high training score and low validation score indicates overfitting.","More data, simpler models, and early stopping help."]'::jsonb,
    null,
    '{"q":"Which sign points to overfitting?","options":["Both scores are low","Training is high, validation is low","Training is slow"],"answer":1,"why":"The model memorized training rows rather than generalizing."}'::jsonb, 3),
  ('ml-4', 'ml-m4', 'machine-learning-essentials', 'Choosing a metric', 15,
    '["Accuracy misleads on imbalanced datasets.","Watch Recall when missing a positive case is costly; Precision when false alarms are costly."]'::jsonb,
    null,
    '{"q":"Missing a real case is the costly mistake. Watch…","options":["Recall","Precision","Accuracy"],"answer":0,"why":"Recall measures how many real cases were caught."}'::jsonb, 4),
  ('ml-5', 'ml-m5', 'machine-learning-essentials', 'Responsible models', 12,
    '["Evaluate performance across each affected subgroup, not only overall averages.","Document intended use and limits in a model card."]'::jsonb,
    null,
    '{"q":"Why measure each group separately?","options":["To train faster","An average can hide a failure","To use less memory"],"answer":1,"why":"Good overall averages can mask subgroup failures."}'::jsonb, 5),

  ('db-1', 'db-m1', 'databases-with-sql', 'Tables and keys', 12,
    '["Primary keys uniquely identify rows; foreign keys enforce valid links across tables.","Store each fact once."]'::jsonb,
    'create table course (\n  id integer primary key,\n  title text not null\n);',
    '{"q":"What does a foreign key do?","options":["Encrypts a row","Points at a row in another table","Sorts the table"],"answer":1,"why":"It links tables and lets the database reject broken references."}'::jsonb, 1),
  ('db-2', 'db-m2', 'databases-with-sql', 'Filtering and sorting', 12,
    '["WHERE filters rows, ORDER BY sorts, LIMIT caps results.","NULL represents unknown; always test with IS NULL."]'::jsonb,
    'select title from course where level = ''Beginner'' order by title limit 5;',
    '{"q":"How do you find rows with no email?","options":["email = null","email is null","email == \"\""],"answer":1,"why":"Comparisons with NULL yield unknown, so IS NULL is required."}'::jsonb, 2),
  ('db-3', 'db-m3', 'databases-with-sql', 'Joins', 18,
    '["INNER JOIN keeps matching pairs; LEFT JOIN preserves all rows from the left table."]'::jsonb,
    'select l.name, count(e.id) from learner l left join enrolment e on e.learner_id = l.id group by l.name;',
    '{"q":"Which join keeps learners who have no enrolments?","options":["inner join","left join","cross join"],"answer":1,"why":"LEFT JOIN preserves unmatched rows from the left table."}'::jsonb, 3),
  ('db-4', 'db-m4', 'databases-with-sql', 'Grouping', 14,
    '["GROUP BY aggregates rows sharing values; WHERE filters rows before grouping and HAVING filters groups afterward."]'::jsonb,
    null,
    '{"q":"Which clause filters groups?","options":["where","having","order by"],"answer":1,"why":"HAVING executes after GROUP BY forms groups."}'::jsonb, 4),
  ('db-5', 'db-m5', 'databases-with-sql', 'Indexes and transactions', 16,
    '["Indexes accelerate lookups at slight write overhead.","Transactions guarantee atomic all-or-nothing updates."]'::jsonb,
    'begin;\nupdate account set balance = balance - 100 where id = 1;\nupdate account set balance = balance + 100 where id = 2;\ncommit;',
    '{"q":"What does a transaction guarantee?","options":["Changes succeed or fail together","Queries run faster","Rows stay sorted"],"answer":0,"why":"Atomicity guarantees all changes commit or roll back together."}'::jsonb, 5),

  ('cl-1', 'cl-m1', 'cloud-basics', 'Regions and zones', 10,
    '["Regions are geographic areas; zones are independent data centers inside a region."]'::jsonb,
    null,
    '{"q":"What does running in two zones protect against?","options":["A bug in your code","One building failing","High prices"],"answer":1,"why":"Availability zones fail independently."}'::jsonb, 1),
  ('cl-2', 'cl-m2', 'cloud-basics', 'Choosing compute', 14,
    '["Serverless functions suit bursty short work; containers suit steady services; VMs suit full OS control."]'::jsonb,
    null,
    '{"q":"Short, occasional jobs fit best on…","options":["Functions","Virtual machines","A bigger database"],"answer":0,"why":"Serverless functions scale to zero when idle."}'::jsonb, 2),
  ('cl-3', 'cl-m3', 'cloud-basics', 'Storing things', 12,
    '["Object storage holds files durably and cheaply; relational databases hold queryable structured records."]'::jsonb,
    null,
    '{"q":"Where do uploaded photos belong?","options":["A database column","Object storage","A virtual machine disk"],"answer":1,"why":"Object storage is designed for blobs and files."}'::jsonb, 3),
  ('cl-4', 'cl-m4', 'cloud-basics', 'Identity and least privilege', 14,
    '["Grant each service only the permissions it actually needs.","Never commit secrets into source code."]'::jsonb,
    null,
    '{"q":"What is least privilege?","options":["One shared admin account","Only the permissions needed","No permissions at all"],"answer":1,"why":"Minimal permissions bound blast radius if credentials leak."}'::jsonb, 4),
  ('cl-5', 'cl-m5', 'cloud-basics', 'Scaling and cost', 12,
    '["Set autoscaling caps and budget alerts on day one."]'::jsonb,
    null,
    '{"q":"What should you set on day one?","options":["A larger machine","A budget alarm","A second region"],"answer":1,"why":"Budget alerts catch unexpected usage spikes early."}'::jsonb, 5)
on conflict (id) do nothing;

-- 5. Skill Assessments + Authoritative Questions & Isolated Answer Keys
insert into public.skill_assessments (skill_id, title, pass_mark, time_limit_seconds) values
  ('js', 'JavaScript Skill Assessment', 70, 300),
  ('py', 'Python Skill Assessment', 70, 300),
  ('ml', 'AI / ML Skill Assessment', 70, 300),
  ('db', 'Databases Skill Assessment', 70, 300),
  ('cl', 'Cloud Skill Assessment', 70, 300)
on conflict (skill_id) do nothing;

-- Populate assessment_questions + assessment_question_keys from lessons (idempotent via unique prompt check)
do $$
declare
  v_rec record;
  v_aid uuid;
  v_qid uuid;
begin
  for v_rec in
    select l.id, c.skill_id, l.sort_order, l.check_question
    from public.lessons l
    join public.courses c on c.id = l.course_id
    order by c.skill_id, l.sort_order
  loop
    select id into v_aid from public.skill_assessments where skill_id = v_rec.skill_id;
    if v_aid is not null and not exists (
      select 1 from public.assessment_questions
      where assessment_id = v_aid and prompt = (v_rec.check_question ->> 'q')
    ) then
      insert into public.assessment_questions (assessment_id, prompt, options, explanation, sort_order)
      values (
        v_aid,
        v_rec.check_question ->> 'q',
        v_rec.check_question -> 'options',
        v_rec.check_question ->> 'why',
        v_rec.sort_order
      )
      returning id into v_qid;

      insert into public.assessment_question_keys (question_id, correct_index)
      values (v_qid, (v_rec.check_question ->> 'answer')::int)
      on conflict (question_id) do update set correct_index = excluded.correct_index;
    end if;
  end loop;
end $$;

-- 6. Coding Challenges + Isolated Hidden Tests
insert into public.coding_challenges (id, skill_id, language_id, title, minutes, brief, fn_name, starter_code, public_tests) values
  ('sum-even', 'js', 'javascript', 'Total of the even numbers', 10,
    'Write sumEven(numbers). It receives an array of whole numbers and returns the total of the even ones. An empty array totals 0.',
    'sumEven',
    E'function sumEven(numbers) {\n  // your code\n}\n',
    '[{"args":[[1,2,3,4]],"expected":6},{"args":[[]],"expected":0},{"args":[[-2,7,8]],"expected":6},{"args":[[5,9,11]],"expected":0}]'::jsonb),
  ('word-count', 'js', 'javascript', 'Count the words', 15,
    'Write countWords(text). Return an object giving how many times each word appears. Ignore capital letters, and treat any run of spaces as one gap.',
    'countWords',
    E'function countWords(text) {\n  // your code\n}\n',
    '[{"args":["red blue red"],"expected":{"red":2,"blue":1}},{"args":["One one ONE"],"expected":{"one":3}},{"args":["  spaced   out  "],"expected":{"spaced":1,"out":1}},{"args":[""],"expected":{}}]'::jsonb)
on conflict (id) do nothing;

insert into public.coding_challenge_hidden_tests (challenge_id, tests) values
  ('sum-even', '[{"args":[[0,-4,100,99]],"expected":96},{"args":[[2,2,2,2,2]],"expected":10}]'::jsonb),
  ('word-count', '[{"args":["\tHello\nhello  WORLD"],"expected":{"hello":2,"world":1}},{"args":["   "],"expected":{}}]'::jsonb)
on conflict (challenge_id) do nothing;

-- 7. Projects & Rubrics
insert into public.projects (id, title, brief, level, estimated_hours, skill_ids, requirements, sort_order) values
  ('accessible-portfolio', 'Accessible portfolio site', 'Build a personal site that works with a keyboard, a screen reader and a slow phone.', 'Beginner', 8, array['js'],
    '["Works without a mouse","Text contrast of at least 4.5 to 1","Loads in under two seconds on a mid-range phone","A README explaining your choices"]'::jsonb, 1),
  ('ticket-classifier', 'Support ticket classifier', 'Sort support tickets by topic, and report honestly on where the model is wrong.', 'Intermediate', 14, array['py','ml'],
    '["Split the data before exploring it","Report precision and recall per topic","Show ten mistakes and explain them","A model card"]'::jsonb, 2),
  ('inventory-api', 'Inventory API with SQL', 'Design a small stock database and an API that never lets a count go below zero.', 'Intermediate', 12, array['db','py'],
    '["A schema with keys and constraints","Transactions for every stock change","Tests for two buyers racing for the last item"]'::jsonb, 3),
  ('static-site-deploy', 'Deploy with a budget', 'Put a static site online with HTTPS, a least-privilege deploy key and a cost alarm.', 'Beginner', 6, array['cl'],
    '["HTTPS with your own domain or subdomain","A deploy identity that can only deploy","A budget alarm with a screenshot"]'::jsonb, 4)
on conflict (id) do nothing;

insert into public.project_rubrics (project_id, criterion, description, max_points, sort_order) values
  ('accessible-portfolio', 'Accessibility', 'Keyboard navigation, landmarks, labels, and >=4.5:1 contrast.', 40, 1),
  ('accessible-portfolio', 'Code clarity', 'Semantic HTML, clean CSS/JS structure, informative README.', 30, 2),
  ('accessible-portfolio', 'Performance', 'Fast initial load and responsive assets.', 30, 3),
  ('ticket-classifier', 'Method', 'Leak-free split and reproducible feature pipeline.', 35, 1),
  ('ticket-classifier', 'Honesty of evaluation', 'Per-class precision/recall and error analysis.', 35, 2),
  ('ticket-classifier', 'Reproducibility', 'Clear instructions, seeds, and complete model card.', 30, 3),
  ('inventory-api', 'Data model', 'Normalized tables, keys, and non-negative check constraints.', 35, 1),
  ('inventory-api', 'Correctness', 'Transactional stock updates under concurrency.', 35, 2),
  ('inventory-api', 'Tests', 'Automated concurrency and failure-mode tests.', 30, 3),
  ('static-site-deploy', 'Security', 'HTTPS enabled and least-privilege deploy credentials.', 40, 1),
  ('static-site-deploy', 'Automation', 'Repeatable deployment workflow.', 30, 2),
  ('static-site-deploy', 'Cost control', 'Configured budget alarm with verification proof.', 30, 3)
on conflict (project_id, criterion) do nothing;

-- 8. Certificate Templates
insert into public.certificate_templates (id, title, skill_id, course_id, project_id, pass_mark) values
  ('javascript-practitioner', 'JavaScript Practitioner', 'js', 'javascript-foundations', 'accessible-portfolio', 70),
  ('python-practitioner', 'Python Practitioner', 'py', 'python-problem-solving', 'ticket-classifier', 70),
  ('sql-practitioner', 'SQL Practitioner', 'db', 'databases-with-sql', 'inventory-api', 70),
  ('cloud-practitioner', 'Cloud Practitioner', 'cl', 'cloud-basics', 'static-site-deploy', 70)
on conflict (id) do nothing;
