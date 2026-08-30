import { Global, Module } from '@nestjs/common';
import { D1RuntimeProvider } from './d1-runtime.provider.js';

@Global()
@Module({ providers: [D1RuntimeProvider], exports: [D1RuntimeProvider] })
export class D1RuntimeModule {}
