import { createApp } from '../server/app.ts';

let cachedApp: ReturnType<typeof createApp> | null = null;
const getApp = () => (cachedApp ??= createApp());

export const GET = (request: Request) => getApp().fetch(request);
export const POST = (request: Request) => getApp().fetch(request);
export const PATCH = (request: Request) => getApp().fetch(request);
export const DELETE = (request: Request) => getApp().fetch(request);
export const OPTIONS = (request: Request) => getApp().fetch(request);
