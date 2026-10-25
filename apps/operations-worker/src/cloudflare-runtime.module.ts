import { Module, type DynamicModule } from '@nestjs/common';
import { OperationsWorkerModule } from './operations-worker.module.js';
import { D1_DATABASE } from '@beauty/database';
@Module({}) export class CloudflareRuntimeModule { static register(env:{D1_DATABASE:unknown}):DynamicModule{return {module:CloudflareRuntimeModule,imports:[OperationsWorkerModule],providers:[{provide:D1_DATABASE,useValue:env.D1_DATABASE}],exports:[OperationsWorkerModule]};} }
