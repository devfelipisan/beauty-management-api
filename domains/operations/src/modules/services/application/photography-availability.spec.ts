import { describe, expect, it, vi } from 'vitest';
import { Service } from '../domain/service.js';
import { CreateServiceUseCase, UpdateServiceUseCase } from './use-cases.js';
const base={tenantId:'tenant',name:'service',category:'category',durationMinutes:30,basePriceCents:100};
describe('unavailable photography in service configuration',()=>{
  it('rejects new requirements from either input representation before writing',async()=>{
    const repo={create:vi.fn(),findById:vi.fn(),update:vi.fn()};
    const create=new CreateServiceUseCase(repo as never,false);
    for(const input of [{...base,requiresPhotography:true},{...base,technicalRequirements:{requiresPhotography:true}}])
      await expect(create.execute(input)).rejects.toThrow('CLINICAL_MEDIA_UNAVAILABLE');
    expect(repo.create).not.toHaveBeenCalled();
  });
  it('allows an unrelated update to an existing requirement but rejects introducing it',async()=>{
    const repo={findById:vi.fn(),update:vi.fn()};
    repo.findById.mockResolvedValueOnce(Service.create('old',{...base,requiresPhotography:true}));
    const update=new UpdateServiceUseCase(repo as never,false);
    await update.execute('tenant','old',{name:'renamed'} as never);
    expect(repo.update).toHaveBeenCalledTimes(1);
    repo.findById.mockResolvedValueOnce(Service.create('new',base));
    await expect(update.execute('tenant','new',{technicalRequirements:{requiresPhotography:true}} as never)).rejects.toThrow('CLINICAL_MEDIA_UNAVAILABLE');
    expect(repo.update).toHaveBeenCalledTimes(1);
  });
});
