import { Module } from '@nestjs/common';
import { FacebookGraphClient } from './facebook-graph.client';
import { FacebookPublisherClient } from './facebook-publisher.client';

// AppConfigModule là @Global nên các client inject AppConfigService trực tiếp.
@Module({
  providers: [FacebookGraphClient, FacebookPublisherClient],
  exports: [FacebookGraphClient, FacebookPublisherClient],
})
export class FacebookModule {}
