import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BadgesController, PublicBadgesController } from './badges.controller';
import { BadgesService } from './badges.service';

@Module({
  imports: [AuthModule],
  controllers: [BadgesController, PublicBadgesController],
  providers: [BadgesService],
})
export class BadgesModule {}
