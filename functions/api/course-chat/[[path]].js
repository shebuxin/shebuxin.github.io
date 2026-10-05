import {handle} from '../../../services/course-chat/src/worker.mjs';
export function onRequest(context) { return handle(context.request,context.env,context); }
