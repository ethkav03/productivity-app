import { Module } from '@nestjs/common';
import { ChallengesService } from './challenges.service';
import { ChallengesController } from './challenges.controller';
import { ChallengeProgressListener } from './listeners/challenge-progress.listener';
import { ProgressionModule } from '../progression/progression.module';

@Module({
  imports: [ProgressionModule],
  controllers: [ChallengesController],
  providers: [ChallengesService, ChallengeProgressListener],
  exports: [ChallengesService],
})
export class ChallengesModule {}
