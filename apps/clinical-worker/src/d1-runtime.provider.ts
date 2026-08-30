import type { Provider } from '@nestjs/common';
import { D1_DATABASE, type D1DatabaseLike } from '../../../libs/database/src/index.js';
const unavailable:D1DatabaseLike={prepare:()=>({bind:()=>unavailable.prepare(''),first:async()=>{throw new Error('D1 binding is not configured')},all:async()=>{throw new Error('D1 binding is not configured')},run:async()=>{throw new Error('D1 binding is not configured')}}),batch:async()=>{throw new Error('D1 binding is not configured')}};
export const D1RuntimeProvider:Provider={provide:D1_DATABASE,useFactory:()=> (globalThis as {D1_DATABASE?:D1DatabaseLike}).D1_DATABASE??unavailable};
