import { describe, expect, it } from 'vitest';
import { ProfileImagePolicy } from './profile-image.js';
describe('profile image limit',()=>{
  it('accepts the exact validated limit and rejects larger or invalid configuration',()=>{
    expect(()=>ProfileImagePolicy.validate('image/jpeg',300000,300000)).not.toThrow();
    expect(()=>ProfileImagePolicy.validate('image/jpeg',300001,300000)).toThrow('PHOTO_SIZE_EXCEEDED');
    for(const limit of [0,300001,NaN]) expect(()=>ProfileImagePolicy.validate('image/jpeg',1,limit)).toThrow('INVALID_PROFILE_MEDIA_CONFIGURATION');
  });
});
