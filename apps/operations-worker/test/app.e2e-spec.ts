import { ExpressAdapter } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { OperationsWorkerModule } from '../dist/operations-worker.module.js';

describe('OperationsWorker Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [OperationsWorkerModule],
    }).compile();

    app = moduleFixture.createNestApplication(new ExpressAdapter());
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({ status: 'ok' });
        expect(response.body.service).toEqual(expect.any(String));
        expect(response.body.version).toEqual(expect.any(String));
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
