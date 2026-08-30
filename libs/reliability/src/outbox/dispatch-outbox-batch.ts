import type { DeliveryPort } from './outbox-delivery.js';
import type { OutboxDeliveryRepository } from './outbox-delivery.js';
import { OutboxRetryPolicy } from './outbox-retry-policy.js';

export interface DispatchSummary { inspected:number; claimed:number; sent:number; retried:number; dead:number; }

export class DispatchOutboxBatch {
  constructor(private readonly repository:OutboxDeliveryRepository,private readonly delivery:DeliveryPort,private readonly policy=new OutboxRetryPolicy()) {}
  async execute(input:{workerId:string;batchSize:number;leaseSeconds:number;now?:string}):Promise<DispatchSummary> {
    const now=input.now??new Date().toISOString(); await this.repository.recoverExpiredClaims(now); const events=await this.repository.findDispatchable(input.batchSize,now); const summary:DispatchSummary={inspected:events.length,claimed:0,sent:0,retried:0,dead:0};
    for(const event of events){if(!await this.repository.claim(event.id,input.workerId,now,input.leaseSeconds))continue;summary.claimed+=1;const result=await this.delivery.deliver(event);if(result.kind==='DELIVERED'){if(await this.repository.markSent(event.id,input.workerId,now))summary.sent+=1;continue;}if(result.kind==='PERMANENT'){if(await this.repository.markDead(event.id,input.workerId,result.errorCode,now))summary.dead+=1;continue;}const decision=this.policy.decide((event.attemptCount??0)+1,result.errorCode,now);if(decision.kind==='DEAD'){if(await this.repository.markDead(event.id,input.workerId,decision.errorCode,now))summary.dead+=1;}else if(await this.repository.releaseForRetry(event.id,input.workerId,decision.availableAt,result.errorCode,now))summary.retried+=1;}
    return summary;
  }
}
