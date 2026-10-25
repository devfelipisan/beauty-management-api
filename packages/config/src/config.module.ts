import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { environmentSchema } from './environment.schema.js';
import { RuntimeConfigService } from './runtime-config.service.js';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validationSchema: environmentSchema })],
  providers: [RuntimeConfigService],
  exports: [RuntimeConfigService],
})
export class RuntimeConfigModule {}
