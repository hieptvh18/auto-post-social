import { PartialType } from '@nestjs/swagger';
import { CreateReupTopicDto } from './create-reup-topic.dto';

/** PATCH — mọi field optional. Ràng buộc chéo field vẫn kiểm ở service. */
export class UpdateReupTopicDto extends PartialType(CreateReupTopicDto) {}
