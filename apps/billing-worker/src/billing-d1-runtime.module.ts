import { Global, Module } from '@nestjs/common';
import { D1_DATABASE } from '../../../libs/database/src/index.js';
const unavailable = { prepare: () => ({ bind: () => unavailable.prepare(), first: async () => { throw new Error('D1 binding is not configured'); }, all: async () => { throw new Error('D1 binding is not configured'); }, run: async () => { throw new Error('D1 binding is not configured'); } }), batch: async () => { throw new Error('D1 binding is not configured'); } };
@Global() @Module({ providers:[{ provide:D1_DATABASE, useFactory:()=> (globalThis as { D1_DATABASE?:unknown }).D1_DATABASE ?? unavailable }], exports:[D1_DATABASE] })
export class BillingD1RuntimeModule {}
