import { Module } from '@nestjs/common';
import { QuestsService } from './quests.service';
import { QuestsController } from './quests.controller';
import { ProgressionModule } from '../progression/progression.module';
import { SkillsModule } from '../skills/skills.module';

@Module({
  imports: [ProgressionModule, SkillsModule],
  controllers: [QuestsController],
  providers: [QuestsService],
  exports: [QuestsService],
})
export class QuestsModule {}
