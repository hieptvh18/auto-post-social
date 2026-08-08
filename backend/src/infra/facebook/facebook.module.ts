import { Module } from '@nestjs/common';
import { FacebookGraphClient } from './facebook-graph.client';
import { FacebookInsightsClient } from './facebook-insights.client';
import { FacebookPublisherClient } from './facebook-publisher.client';

// AppConfigModule là @Global nên các client inject AppConfigService trực tiếp.
@Module({
  providers: [
    FacebookGraphClient,
    FacebookInsightsClient,
    FacebookPublisherClient,
  ],
  exports: [
    FacebookGraphClient,
    FacebookInsightsClient,
    FacebookPublisherClient,
  ],
})
export class FacebookModule {}
