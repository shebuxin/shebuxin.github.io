import {Store} from './store.mjs';
export async function scheduled(controller,env) {
  if (!env.CHAT_DB) throw new Error('CHAT_DB binding required');
  await new Store(env.CHAT_DB).cleanup(Math.floor(Date.now()/1000));
}
export default {scheduled};
