import { Module } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { GoalsController } from './goals.controller';
import { ProgressionModule } from '../progression/progression.module';
import { SkillsModule } from '../skills/skills.module';
import { AchievementsModule } from '../achievements/achievements.module';
import { AttributesModule } from '../attributes/attributes.module';

@Module({
  imports: [ProgressionModule, SkillsModule, AchievementsModule, AttributesModule],
  controllers: [GoalsController],
  providers: [GoalsService],
  exports: [GoalsService],
})
export class GoalsModule {}
