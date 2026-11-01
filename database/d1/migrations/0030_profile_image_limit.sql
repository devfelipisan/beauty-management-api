CREATE TRIGGER profile_image_limit_insert BEFORE INSERT ON profile_images
WHEN NEW.size_bytes > 300000
BEGIN SELECT RAISE(ABORT, 'PROFILE_IMAGE_SIZE_EXCEEDED'); END;

CREATE TRIGGER profile_image_limit_update BEFORE UPDATE ON profile_images
WHEN (NEW.size_bytes != OLD.size_bytes AND NEW.size_bytes > 300000)
  OR (OLD.status = 'PENDING' AND NEW.status = 'AVAILABLE' AND NEW.size_bytes > 300000)
BEGIN SELECT RAISE(ABORT, 'PROFILE_IMAGE_SIZE_EXCEEDED'); END;
