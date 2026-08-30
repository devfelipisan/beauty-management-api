import { Injectable, OnModuleDestroy } from '@nestjs/common';
import pg from 'pg';
import { RuntimeConfigService } from '../config/runtime-config.service.js';
const { Pool } = pg;
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: pg.Pool;
  constructor(config: RuntimeConfigService) {
    this.pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
  }
  async isReachable(): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      return true;
    } finally {
      client.release();
    }
  }
  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
