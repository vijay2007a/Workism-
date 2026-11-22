# WORKISM 3.0 frontend

React 19, TypeScript, Vite, Tailwind 4, Motion, OGL, Recharts.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
npm run lint
npm test           # physics, scoring, storage, sandbox and locale tests (Node 24+)
```

## Where things are

| Path | What |
|---|---|
| `src/index.css` | Design tokens |
| `src/glass/` | Liquid Glass components and materials (`glass.css`) |
| `src/lib/blob.ts` | Jelly physics; `glass/blobGl.ts` is the shader, `LiquidSkillBlob.tsx` the component and SVG fallback |
| `src/components/`, `src/pages/` | Cards, navigation and screens (`layout.css`) |
| `src/locales/` | One file per language. Keys are the English text; missing keys show English |
| `src/data/sample.ts` | Sample records, labelled as samples on screen |
| `src/services/index.ts` | The only file that talks to a backend |

## Connecting the backend

Set `VITE_API_URL` (see `.env.example`). The endpoints in `src/services/index.ts` are assumptions; change them there.

| Needs | Endpoint assumed | Until connected |
|---|---|---|
| Learner records | `GET /me/workspace` | Sample data, labelled |
| Sign-in | `POST /auth/login`, `POST /auth/register` | Forms validate, then say they are not connected. Nothing is sent or stored except name and email, on this device |
| Project evaluation | `POST /projects/:id/submissions` | Saved on this device, shown as not sent |
| Certificate verification | `GET /certificates/:id` | Always reads "Cannot be confirmed" |
| AI assistant | `POST /assistant/messages` | Four written answers; anything else shows an error with retry |

Not built here: code execution for languages other than JavaScript, GitHub sign-in (public repositories work by username), email and push reminders.

Provenance is stamped in the client: only records fetched from the API can read as verified or assessed.
