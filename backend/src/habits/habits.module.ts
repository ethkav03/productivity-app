import { Module } from '@nestjs/common';
import { HabitsService } from './habits.service';
import { HabitsController } from './habits.controller';
import { ProgressionModule } from '../progression/progression.module';
import { SkillsModule } from '../skills/skills.module';
import { AttributesModule } from '../attributes/attributes.module';

@Module({
  imports: [ProgressionModule, SkillsModule, AttributesModule],
  controllers: [HabitsController],
  providers: [HabitsService],
  exports: [HabitsService],
})
export class HabitsModule {}
